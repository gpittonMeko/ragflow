#!/usr/bin/env python3
"""
Monitor per auto-shutdown dell'istanza EC2 (SGAI Production).

POLICY (allineata a SGAI Home + Lambda):
- La Production deve restare SPENTA salvo accensione richiesta da Home (POST wake → Lambda
  scrive /tmp/sgai_wake_at e force_start_active). La Lambda non accende da sola se on_demand.
- Dopo un wake "ufficiale":
  1. Grace boot (Docker): niente shutdown i primi GRACE_PERIOD_MINUTES.
  2. Almeno MIN_UPTIME_AFTER_WAKE_MINUTES (30) da quel wake — resta accesa.
  3. Poi: se non c'è stata chat → shutdown; se c'è stata chat → shutdown dopo
     CHAT_IDLE_SHUTDOWN_MINUTES (30) dall'ultima attività rilevata.
- Avvio senza file wake (es. Start da console AWS): dopo UNCLAIMED_BOOT_ALLOW_LAMBDA_SSH_MINUTES
  senza che compaiano i file, niente finestra wake lunga — si applica solo grace + regola chat/idle
  (così una macchina "accesa a mano" non resta ore senza motivo; il margine copre il ritardo SSH
  della Lambda dopo un wake legittimo).

ATTIVITÀ RILEVATE (log Docker/nginx):
- POST /v1/canvas/completion, POST /v1/retrieval, GET .../getsse, POST /v1/conversation
"""
import time
import subprocess
import re
import os
from datetime import datetime, timedelta
import boto3

# CONFIGURAZIONE
MIN_UPTIME_AFTER_WAKE_MINUTES = 30  # finestra minima dopo wake Home (allineata a idle chat 30m)
CHAT_IDLE_SHUTDOWN_MINUTES = 30  # dopo chat: spegni 30 min dopo ultima attività
CHECK_INTERVAL_SECONDS = 30
GRACE_PERIOD_MINUTES = 5
# Se a boot non compaiono i file scritti dalla Lambda, dopo questi minuti non è un "wake da Home"
UNCLAIMED_BOOT_ALLOW_LAMBDA_SSH_MINUTES = 15

LOG_FILE = "/tmp/ragflow_activity.log"
WAKE_AT_FILE = "/tmp/sgai_wake_at"
FORCE_START_FLAG = "/tmp/force_start_active"  # fallback timestamp wake (Lambda scrive entrambi)
HAD_CHAT_FILE = "/tmp/sgai_had_chat"
BOOT_TIME_FILE = "/proc/uptime"

ACTIVITY_PATTERNS = [
    r"POST /v1/canvas/completion",
    r"POST /v1/retrieval",
    r"GET /v1/canvas/getsse",
    r"GET /v1/conversation/getsse",
    r"POST /v1/conversation",
]


def _read_iso_timestamp(path: str):
    try:
        with open(path, "r") as f:
            s = f.read().strip()
        return datetime.fromisoformat(s)
    except Exception:
        return None


class ActivityMonitor:
    def __init__(self):
        self.boot_time = self._get_boot_time()
        self.ec2 = boto3.client("ec2", region_name="eu-north-1")
        self.instance_id = self._get_instance_id()
        self.last_activity = self._load_last_activity()
        self.had_chat = self._load_had_chat()

    def _compute_wake_at(self):
        t = _read_iso_timestamp(WAKE_AT_FILE)
        if t:
            return t
        t = _read_iso_timestamp(FORCE_START_FLAG)
        if t:
            return t
        return self.boot_time

    def _load_last_activity(self):
        if os.path.exists(LOG_FILE):
            try:
                with open(LOG_FILE, "r") as f:
                    return datetime.fromisoformat(f.read().strip())
            except Exception:
                pass
        return self._compute_wake_at()

    def _load_had_chat(self):
        try:
            if os.path.exists(HAD_CHAT_FILE):
                with open(HAD_CHAT_FILE, "r") as f:
                    return f.read().strip() == "1"
        except Exception:
            pass
        return False

    def _get_instance_id(self):
        env_id = os.environ.get("SGAI_INSTANCE_ID", "").strip()
        if env_id.startswith("i-"):
            return env_id
        try:
            result = subprocess.run(
                ["ec2-metadata", "--instance-id"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            match = re.search(r"i-[a-f0-9]+", result.stdout)
            if match:
                return match.group(0)
        except Exception:
            pass
        try:
            tok = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "-X",
                    "PUT",
                    "http://169.254.169.254/latest/api/token",
                    "-H",
                    "X-aws-ec2-metadata-token-ttl-seconds: 21600",
                ],
                capture_output=True,
                text=True,
                timeout=3,
            )
            token = (tok.stdout or "").strip()
            if token:
                r = subprocess.run(
                    [
                        "curl",
                        "-sS",
                        "-H",
                        f"X-aws-ec2-metadata-token: {token}",
                        "http://169.254.169.254/latest/meta-data/instance-id",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                iid = (r.stdout or "").strip()
                if iid.startswith("i-"):
                    return iid
        except Exception:
            pass
        try:
            r = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "--connect-timeout",
                    "2",
                    "http://169.254.169.254/latest/meta-data/instance-id",
                ],
                capture_output=True,
                text=True,
                timeout=4,
            )
            iid = (r.stdout or "").strip()
            if iid.startswith("i-"):
                return iid
        except Exception:
            pass
        return None

    def _get_boot_time(self):
        try:
            with open(BOOT_TIME_FILE, "r") as f:
                uptime_seconds = float(f.read().split()[0])
            return datetime.now() - timedelta(seconds=uptime_seconds)
        except Exception:
            return datetime.now()

    def mark_had_chat(self):
        if self.had_chat:
            return
        self.had_chat = True
        try:
            with open(HAD_CHAT_FILE, "w") as f:
                f.write("1")
        except Exception as e:
            print(f"[WARN] Impossibile scrivere {HAD_CHAT_FILE}: {e}")

    def check_docker_logs(self):
        try:
            cmd = [
                "docker",
                "logs",
                "--since",
                f"{CHECK_INTERVAL_SECONDS}s",
                "--tail",
                "1000",
                "ragflow-server",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            logs = result.stdout + result.stderr
            for pattern in ACTIVITY_PATTERNS:
                if re.search(pattern, logs):
                    return True
        except Exception as e:
            print(f"[WARN] Docker logs: {e}")

        try:
            cmd = [
                "docker",
                "exec",
                "ragflow-server",
                "tail",
                "-500",
                "/var/log/nginx/access.log",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            for pattern in ACTIVITY_PATTERNS:
                if re.search(pattern, result.stdout or ""):
                    return True
        except Exception:
            pass

        return False

    def update_last_activity(self):
        self.last_activity = datetime.now()
        try:
            with open(LOG_FILE, "w") as f:
                f.write(self.last_activity.isoformat())
        except Exception as e:
            print(f"[WARN] Impossibile scrivere {LOG_FILE}: {e}")

    def get_inactivity_seconds(self):
        return (datetime.now() - self.last_activity).total_seconds()

    def _has_wake_files_from_lambda(self):
        return os.path.isfile(WAKE_AT_FILE) or os.path.isfile(FORCE_START_FLAG)

    def should_shutdown(self):
        now = datetime.now()
        uptime_minutes = (now - self.boot_time).total_seconds() / 60
        if uptime_minutes < GRACE_PERIOD_MINUTES:
            return False

        if not self._has_wake_files_from_lambda():
            if uptime_minutes < UNCLAIMED_BOOT_ALLOW_LAMBDA_SSH_MINUTES:
                return False
            if not self.had_chat:
                return True
            return self.get_inactivity_seconds() >= CHAT_IDLE_SHUTDOWN_MINUTES * 60

        wake_at = self._compute_wake_at()
        min_session_end = wake_at + timedelta(minutes=MIN_UPTIME_AFTER_WAKE_MINUTES)
        if now < min_session_end:
            return False

        if not self.had_chat:
            return True

        return self.get_inactivity_seconds() >= CHAT_IDLE_SHUTDOWN_MINUTES * 60

    def _session_status_line(self):
        now = datetime.now()
        if not self._has_wake_files_from_lambda():
            ub = (now - self.boot_time).total_seconds() / 60
            if ub < UNCLAIMED_BOOT_ALLOW_LAMBDA_SSH_MINUTES:
                return f"Attesa file wake Lambda (Home), max {UNCLAIMED_BOOT_ALLOW_LAMBDA_SSH_MINUTES}m…"
            if not self.had_chat:
                return "Nessun wake da Home → shutdown se nessuna chat"
            rem = max(0, CHAT_IDLE_SHUTDOWN_MINUTES * 60 - self.get_inactivity_seconds())
            m, s = divmod(int(rem), 60)
            return f"Idle dopo chat (no file wake): {m}m {s}s prima dello shutdown"
        wake_at = self._compute_wake_at()
        min_end = wake_at + timedelta(minutes=MIN_UPTIME_AFTER_WAKE_MINUTES)
        if now < min_end:
            left = min_end - now
            m, s = divmod(int(left.total_seconds()), 60)
            return f"Finestra minima wake: ancora {m}m {s}s"
        if not self.had_chat:
            return "Oltre 30 min da wake, nessuna chat → shutdown ammesso"
        rem = max(0, CHAT_IDLE_SHUTDOWN_MINUTES * 60 - self.get_inactivity_seconds())
        m, s = divmod(int(rem), 60)
        return f"Idle dopo chat: {m}m {s}s rimanenti prima dello shutdown"

    def _cleanup_session_files(self):
        for p in (WAKE_AT_FILE, HAD_CHAT_FILE, LOG_FILE, FORCE_START_FLAG):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception as e:
                print(f"[WARN] Rimozione {p}: {e}")

    def shutdown_instance(self):
        if not self.instance_id:
            print("[ERROR] Instance ID non trovato, impossibile spegnere")
            return False

        try:
            print(f"[SHUTDOWN] Spegnimento istanza {self.instance_id}...")
            self.ec2.stop_instances(InstanceIds=[self.instance_id])
            print("[SHUTDOWN] Comando inviato con successo")
            self._cleanup_session_files()
            return True
        except Exception as e:
            print(f"[ERROR] Errore durante shutdown: {e}")
            return False

    def run(self):
        print("[START] Activity Monitor avviato")
        print(f"[CONFIG] Min uptime dopo wake: {MIN_UPTIME_AFTER_WAKE_MINUTES} min")
        print(f"[CONFIG] Idle dopo chat: {CHAT_IDLE_SHUTDOWN_MINUTES} min")
        print(f"[CONFIG] Grace boot: {GRACE_PERIOD_MINUTES} min")
        print(f"[CONFIG] Check ogni {CHECK_INTERVAL_SECONDS}s")
        print(f"[CONFIG] Instance ID: {self.instance_id}")

        while True:
            try:
                has_activity = self.check_docker_logs()
                if has_activity:
                    self.mark_had_chat()
                    self.update_last_activity()
                    print("[ACTIVITY] Attività chat/retrieval, timer aggiornato")

                print(f"[STATUS] {self._session_status_line()}")

                if self.should_shutdown():
                    print("[WARNING] Condizioni di shutdown soddisfatte")
                    print("[WARNING] Shutdown in 10 secondi... (CTRL+C per annullare)")
                    time.sleep(10)
                    if self.should_shutdown():
                        self.shutdown_instance()
                        break
                    print("[INFO] Attività o fase cambiata, shutdown annullato")

                time.sleep(CHECK_INTERVAL_SECONDS)

            except KeyboardInterrupt:
                print("\n[STOP] Monitor terminato dall'utente")
                break
            except Exception as e:
                print(f"[ERROR] Errore nel loop: {e}")
                time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    ActivityMonitor().run()
