#!/usr/bin/env python3
"""
Monitor per auto-shutdown dell'istanza EC2 dopo inattività.

FUNZIONAMENTO:
1. Monitora i log di RAGFlow per attività (chat, retrieval)
2. Se riceve force_start=true → ignora shutdown per 1h (test: 5 min)
3. Dopo INACTIVITY_TIMEOUT senza attività → shutdown automatico

ATTIVITÀ RILEVATE:
- POST /v1/canvas/completion (chat)
- POST /v1/retrieval/* (retrieval)
- Qualsiasi chiamata API a RAGFlow

TEST MODE: 5 minuti di inattività (invece di 1h)
PRODUZIONE: Cambiare INACTIVITY_TIMEOUT_MINUTES = 60
"""
import time
import subprocess
import re
import os
from datetime import datetime, timedelta
import boto3

# CONFIGURAZIONE
INACTIVITY_TIMEOUT_MINUTES = 15  # Timeout inattività (15 minuti)
CHECK_INTERVAL_SECONDS = 30  # Controlla ogni 30 secondi
GRACE_PERIOD_MINUTES = 5  # Periodo di grazia dopo l'avvio (Docker ha bisogno di tempo)
LOG_FILE = '/tmp/ragflow_activity.log'
FORCE_START_FLAG = '/tmp/force_start_active'
FORCE_START_DURATION_MINUTES = 60  # Durata force_start (1 ora)
BOOT_TIME_FILE = '/proc/uptime'  # Per rilevare quando l'istanza si è avviata

# Pattern di log da cercare (attività utente)
ACTIVITY_PATTERNS = [
    r'POST /v1/canvas/completion',  # Chat
    r'POST /v1/retrieval',           # Retrieval
    r'GET /v1/canvas/getsse',        # SSE polling
    r'POST /v1/conversation',        # Conversazioni
]

class ActivityMonitor:
    def __init__(self):
        self.last_activity = datetime.now()
        self.force_start_until = None
        self.ec2 = boto3.client('ec2', region_name='eu-north-1')
        self.instance_id = self._get_instance_id()
        self.boot_time = self._get_boot_time()
        
    def _get_instance_id(self):
        """Recupera l'ID dell'istanza corrente da EC2 metadata"""
        try:
            result = subprocess.run(
                ['ec2-metadata', '--instance-id'],
                capture_output=True,
                text=True,
                timeout=5
            )
            # Output: instance-id: i-0ec0704c7b36f7648
            match = re.search(r'i-[a-f0-9]+', result.stdout)
            if match:
                return match.group(0)
        except:
            pass
        return None
    
    def _get_boot_time(self):
        """Recupera il timestamp di avvio del sistema"""
        try:
            with open(BOOT_TIME_FILE, 'r') as f:
                uptime_seconds = float(f.read().split()[0])
            boot_time = datetime.now() - timedelta(seconds=uptime_seconds)
            return boot_time
        except:
            # Se non riesce a leggere, usa l'ora corrente
            return datetime.now()
    
    def check_force_start(self):
        """Controlla se è attivo il flag force_start"""
        if os.path.exists(FORCE_START_FLAG):
            try:
                with open(FORCE_START_FLAG, 'r') as f:
                    timestamp_str = f.read().strip()
                    timestamp = datetime.fromisoformat(timestamp_str)
                    
                    # Se il force_start è ancora valido
                    if datetime.now() < timestamp + timedelta(minutes=FORCE_START_DURATION_MINUTES):
                        self.force_start_until = timestamp + timedelta(minutes=FORCE_START_DURATION_MINUTES)
                        return True
                    else:
                        # Scaduto, rimuovi il flag
                        os.remove(FORCE_START_FLAG)
                        self.force_start_until = None
            except:
                pass
        return False
    
    def check_docker_logs(self):
        """Controlla i log di Docker per attività recenti"""
        try:
            # Cerca attività negli ultimi CHECK_INTERVAL_SECONDS secondi
            cmd = [
                'docker', 'logs',
                '--since', f'{CHECK_INTERVAL_SECONDS}s',
                '--tail', '1000',
                'ragflow-server'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            logs = result.stdout + result.stderr
            
            # Cerca pattern di attività
            for pattern in ACTIVITY_PATTERNS:
                if re.search(pattern, logs):
                    return True
            
            return False
            
        except Exception as e:
            print(f"[ERROR] Errore lettura log Docker: {e}")
            return False
    
    def update_last_activity(self):
        """Aggiorna il timestamp dell'ultima attività"""
        self.last_activity = datetime.now()
        with open(LOG_FILE, 'w') as f:
            f.write(self.last_activity.isoformat())
    
    def get_inactivity_seconds(self):
        """Ritorna i secondi di inattività"""
        return (datetime.now() - self.last_activity).total_seconds()
    
    def should_shutdown(self):
        """Determina se l'istanza deve essere spenta"""
        # Se force_start è attivo, NON spegnere
        if self.check_force_start():
            mins_left = int((self.force_start_until - datetime.now()).total_seconds() / 60)
            print(f"[INFO] Force-start attivo, shutdown ignorato per altri {mins_left} minuti")
            return False
        
        # Grace period: NON spegnere se l'istanza è appena stata avviata
        uptime_minutes = (datetime.now() - self.boot_time).total_seconds() / 60
        if uptime_minutes < GRACE_PERIOD_MINUTES:
            mins_left = int(GRACE_PERIOD_MINUTES - uptime_minutes)
            print(f"[INFO] Grace period attivo, shutdown ignorato per altri {mins_left} minuti (Docker in avvio)")
            return False
        
        # Controlla inattività
        inactivity = self.get_inactivity_seconds()
        timeout = INACTIVITY_TIMEOUT_MINUTES * 60
        
        return inactivity >= timeout
    
    def shutdown_instance(self):
        """Spegne l'istanza EC2"""
        if not self.instance_id:
            print("[ERROR] Instance ID non trovato, impossibile spegnere")
            return False
        
        try:
            print(f"[SHUTDOWN] Spegnimento istanza {self.instance_id}...")
            
            # Stop dell'istanza
            self.ec2.stop_instances(InstanceIds=[self.instance_id])
            
            print(f"[SHUTDOWN] Comando inviato con successo")
            return True
            
        except Exception as e:
            print(f"[ERROR] Errore durante shutdown: {e}")
            return False
    
    def run(self):
        """Loop principale del monitor"""
        print(f"[START] Activity Monitor avviato")
        print(f"[CONFIG] Timeout inattività: {INACTIVITY_TIMEOUT_MINUTES} minuti")
        print(f"[CONFIG] Force-start duration: {FORCE_START_DURATION_MINUTES} minuti")
        print(f"[CONFIG] Check interval: {CHECK_INTERVAL_SECONDS} secondi")
        print(f"[CONFIG] Instance ID: {self.instance_id}")
        
        while True:
            try:
                # Controlla attività nei log
                has_activity = self.check_docker_logs()
                
                if has_activity:
                    self.update_last_activity()
                    print(f"[ACTIVITY] Rilevata attività utente, reset timer")
                
                # Calcola tempo rimanente
                inactivity = self.get_inactivity_seconds()
                timeout = INACTIVITY_TIMEOUT_MINUTES * 60
                remaining = max(0, timeout - inactivity)
                
                mins, secs = divmod(int(remaining), 60)
                print(f"[STATUS] Tempo rimanente prima dello shutdown: {mins}m {secs}s")
                
                # Verifica se deve spegnere
                if self.should_shutdown():
                    print(f"[WARNING] Timeout inattività raggiunto!")
                    print(f"[WARNING] Shutdown in 10 secondi... (CTRL+C per annullare)")
                    time.sleep(10)
                    
                    # Doppio check (potrebbe esserci stata attività nel frattempo)
                    if self.should_shutdown():
                        self.shutdown_instance()
                        break
                    else:
                        print(f"[INFO] Attività rilevata, shutdown annullato")
                
                time.sleep(CHECK_INTERVAL_SECONDS)
                
            except KeyboardInterrupt:
                print(f"\n[STOP] Monitor terminato dall'utente")
                break
            except Exception as e:
                print(f"[ERROR] Errore nel loop: {e}")
                time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == '__main__':
    monitor = ActivityMonitor()
    monitor.run()
