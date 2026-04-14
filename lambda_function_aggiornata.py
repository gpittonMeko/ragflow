"""
Lambda EC2 Manager with force_start and force_stop support
File: lambda_function.py
"""
import base64
import boto3, paramiko, datetime, json, socket, time, os

# ---------- CONFIG -------------------------------------------------
REGIONE             = 'eu-north-1'

# Configurazione istanze con orari personalizzati
INSTANCES_CONFIG = {
    'SGAI-Production': {
        'id': 'i-0ec0704c7b36f7648',
        'host': '13.49.16.179',
        'user': 'ubuntu',
        # Modalita on-demand: la macchina si accende solo su force_start da API
        'on_demand': True,
        'ora_inizio': 8,
        'ora_fine': 21,
        'gestisci_docker': True,
        'docker_path': '~/workspace/ragflow/docker',
        'compose_files': '-f docker-compose.yml -f docker-compose-base.yml',
        # Lista container RICHIESTI che DEVONO essere attivi
        'required_containers': [
            'ragflow-minio',
            'ragflow-redis',
            'ragflow-backend-oauth',
            'ragflow-executor',
            'ragflow-server',
            'ragflow-mysql',
            'ragflow-es-02',
            'ragflow-es-01'
        ],
        'ignora_weekend': False,
        'ignora_festivi': False,
    },
    'MekoCrm': {
        'id': 'i-0230135b667de92bd',
        'host': '13.53.183.146',
        'user': 'ubuntu',
        'ora_inizio': 9,
        'ora_fine': 19,
        'gestisci_docker': False,
        'docker_path': None,
        'compose_files': None,
        'required_containers': []
    },
    'SGAI-DEV': {
        'id': 'i-0d4c5e106b6058bb3',
        'host': '16.170.85.194',
        'user': 'ubuntu',
        'ora_inizio': 6,
        'ora_fine': 6,
        'gestisci_docker': False,
        'docker_path': None,
        'compose_files': None,
        'required_containers': []
    }
}

S3_BUCKET           = 'sgai-production-bucket'
S3_KEY              = 'LLM_14.pem'
SNS_TOPIC_ARN       = 'arn:aws:sns:eu-north-1:940482440561:SGAI'

# Offset per timezone Roma (UTC+1 o UTC+2 per ora legale)
ROME_UTC_OFFSET     = 2  

WAIT_SSH_TIMEOUT    = 90
WAIT_CONTAINERS_UP  = 90

# Festivi italiani 2025
FESTIVI = [
    (1, 1), (1, 6), (4, 21), (4, 25), (5, 1), (6, 2),
    (8, 15), (11, 1), (12, 8), (12, 25), (12, 26),
]

# Configurazione force_start
FORCE_START_DURATION_MINUTES = 60  # Coerente con finestra minima monitor (documentazione)
FORCE_START_FLAG_PATH = '/tmp/force_start_active'
WAKE_AT_FILE_PATH = '/tmp/sgai_wake_at'

# ------------------------------------------------------------------

sns = boto3.client('sns', region_name=REGIONE)
ec2 = boto3.client('ec2', region_name=REGIONE)

def get_rome_time():
    """Ottieni l'ora di Roma aggiungendo l'offset a UTC"""
    now_utc = datetime.datetime.utcnow()
    rome_time = now_utc + datetime.timedelta(hours=ROME_UTC_OFFSET)
    return rome_time

def notify(msg):
    try:
        sns.publish(TopicArn=SNS_TOPIC_ARN,
                    Message=msg,
                    Subject='Notifica EC2 Manager Lambda')
        print(f"Notifica SNS inviata: {msg}")
    except Exception as e:
        print(f"Errore SNS: {e}")

def download_pem_from_s3():
    path = '/tmp/LLM_14.pem'
    if not os.path.isfile(path):
        boto3.client('s3', region_name=REGIONE)\
             .download_file(S3_BUCKET, S3_KEY, path)
        os.chmod(path, 0o600)
    return path

def wait_ssh_ready(host, timeout=WAIT_SSH_TIMEOUT):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection((host, 22), 5).close()
            return True
        except Exception:
            time.sleep(5)
    return False

def is_festivo(data):
    """Verifica se la data è un festivo"""
    return (data.month, data.day) in FESTIVI

def is_working_day(now_roma, force, ignora_weekend=False, ignora_festivi=False):
    """
    True se consideriamo il giorno 'lavorativo' ai fini di accensione.
    """
    if force:
        print("Force=True, considero giorno lavorativo")
        return True

    weekday = now_roma.weekday()
    is_weekend = weekday in (5, 6)
    is_holiday = is_festivo(now_roma)

    if ignora_weekend:
        is_weekend = False
    if ignora_festivi:
        is_holiday = False

    return not is_weekend and not is_holiday

def should_instance_be_on(instance_name, config, now_roma, force):
    """
    Determina se un'istanza specifica deve essere accesa (orari + giorno).
    """
    if force:
        print(f"[{instance_name}] Force mode: ignora orari e giorni")
        return True

    # In modalita on-demand l'istanza non segue orari: parte solo con force_start.
    if config.get('on_demand', False):
        print(f"[{instance_name}] On-demand mode: resta spenta senza force_start")
        return False

    ignora_weekend = config.get('ignora_weekend', False)
    ignora_festivi = config.get('ignora_festivi', False)

    if not is_working_day(now_roma, force, ignora_weekend=ignora_weekend, ignora_festivi=ignora_festivi):
        return False

    ora_inizio = config['ora_inizio']
    ora_fine = config['ora_fine']

    if ora_fine == 24:
        in_hours = ora_inizio <= now_roma.hour <= 23
    else:
        in_hours = ora_inizio <= now_roma.hour < ora_fine

    return in_hours

# ---------- Force start flag management ----------------------

def set_force_start_flag(ssh, instance_name, duration_minutes=FORCE_START_DURATION_MINUTES):
    """
    Scrive timestamp ISO su EC2: legacy force_start + sgai_wake_at (stesso valore).
    Il monitor usa sgai_wake_at per la finestra minima 60 min dopo wake da Home.
    """
    now_utc = datetime.datetime.utcnow()
    timestamp_iso = now_utc.isoformat()

    cmd = (
        f"printf '%s\\n' '{timestamp_iso}' > {FORCE_START_FLAG_PATH} && "
        f"printf '%s\\n' '{timestamp_iso}' > {WAKE_AT_FILE_PATH}"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    
    if exit_status == 0:
        print(f"[{instance_name}] ✅ Wake timestamp scritto ({FORCE_START_FLAG_PATH}, {WAKE_AT_FILE_PATH})")
        print(f"[{instance_name}]    Timestamp: {timestamp_iso}")
        return True
    else:
        err = stderr.read().decode()
        print(f"[{instance_name}] ❌ Errore settaggio flag: {err}")
        return False


def check_force_start_expired(ssh, instance_name, duration_minutes=FORCE_START_DURATION_MINUTES):
    """
    Legge il flag /tmp/force_start_active e verifica se e' scaduto.
    
    Ritorna:
      - True  → il force_start e' SCADUTO (o il file non esiste) → si puo' spegnere
      - False → il force_start e' ancora ATTIVO → NON spegnere
    """
    cmd = f"cat {FORCE_START_FLAG_PATH} 2>/dev/null"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    exit_status = stdout.channel.recv_exit_status()
    
    if exit_status != 0 or not out:
        print(f"[{instance_name}] Flag force_start non trovato → scaduto")
        return True
    
    try:
        flag_time = datetime.datetime.fromisoformat(out)
        now_utc = datetime.datetime.utcnow()
        elapsed = now_utc - flag_time
        elapsed_minutes = elapsed.total_seconds() / 60.0
        
        print(f"[{instance_name}] Flag force_start: creato {elapsed_minutes:.1f} min fa (limite: {duration_minutes} min)")
        
        if elapsed_minutes >= duration_minutes:
            print(f"[{instance_name}] ⏰ Force_start SCADUTO ({elapsed_minutes:.1f} >= {duration_minutes} min)")
            return True
        else:
            remaining = duration_minutes - elapsed_minutes
            print(f"[{instance_name}] ⏳ Force_start ATTIVO (mancano {remaining:.1f} min)")
            return False
    except (ValueError, TypeError) as e:
        print(f"[{instance_name}] ⚠️  Errore parsing timestamp flag: {e} → considero scaduto")
        return True


# ---------- Docker helpers ----------------------------------------

def get_running_containers(ssh, instance_name):
    cmd = "docker ps --format '{{.Names}}'"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out, err = stdout.read().decode(), stderr.read().decode()
    
    if err:
        print(f"[{instance_name}] docker ps error: {err}")
        return []
    
    containers = [line.strip() for line in out.strip().splitlines() if line.strip()]
    return containers

def check_required_containers(ssh, instance_name, required_containers):
    if not required_containers:
        return True, []
    
    running = get_running_containers(ssh, instance_name)
    missing = [c for c in required_containers if c not in running]
    
    if missing:
        print(f"[{instance_name}] ⚠️  CONTAINER MANCANTI: {missing}")
        return False, missing
    else:
        print(f"[{instance_name}] ✅ Tutti i {len(required_containers)} container sono attivi")
        return True, []

def wait_containers_up(ssh, instance_name, required_containers, timeout=WAIT_CONTAINERS_UP):
    print(f"[{instance_name}] Attendo che tutti i container richiesti siano attivi...")
    deadline = time.time() + timeout
    last_missing = []
    
    while time.time() < deadline:
        all_running, missing = check_required_containers(ssh, instance_name, required_containers)
        
        if all_running:
            print(f"[{instance_name}] ✅ Tutti i container sono attivi!")
            return True
        
        if missing != last_missing:
            remaining = int(deadline - time.time())
            print(f"[{instance_name}] In attesa di: {missing} ({remaining}s rimasti)")
            last_missing = missing
        
        time.sleep(5)
    
    print(f"[{instance_name}] ❌ Timeout. Container mancanti: {last_missing}")
    return False

def fix_entrypoint_permissions(ssh, instance_name, docker_path):
    """Verifica e fixa i permessi di entrypoint.sh se necessario"""
    entrypoint_path = f"{docker_path}/entrypoint.sh"
    check_cmd = f"test -x {entrypoint_path} || chmod +x {entrypoint_path}"
    stdin, stdout, stderr = ssh.exec_command(check_cmd)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status == 0:
        print(f"[{instance_name}] ✅ Permessi entrypoint.sh verificati/fixati")
        return True
    else:
        err = stderr.read().decode()
        print(f"[{instance_name}] ⚠️  Errore fix permessi entrypoint.sh: {err}")
        return False

def run_docker_compose(ssh, instance_name, config):
    docker_path = config['docker_path']
    compose_files = config['compose_files']
    
    # Fix permessi entrypoint.sh prima di avviare i container
    fix_entrypoint_permissions(ssh, instance_name, docker_path)
    
    docker_cmd = f"""
      set -ex
      export PATH=$PATH:/usr/local/bin
      cd {docker_path}
      sudo docker compose {compose_files} down || sudo docker-compose {compose_files} down || true
      sudo docker compose {compose_files} up -d || sudo docker-compose {compose_files} up -d
      sudo docker ps -a
    """
    stdin, stdout, stderr = ssh.exec_command(docker_cmd, get_pty=True)
    out, err = stdout.read().decode(), stderr.read().decode()
    print(f"[{instance_name}] Docker compose output:\n{out}")
    if err:
        print(f"[{instance_name}] Docker compose errors:\n{err}")
    return stdout.channel.recv_exit_status() == 0

def run_docker_compose_down(ssh, instance_name, config):
    """Esegue solo docker compose down per spegnimento pulito"""
    docker_path = config['docker_path']
    compose_files = config['compose_files']
    docker_cmd = f"""
      set -ex
      export PATH=$PATH:/usr/local/bin
      cd {docker_path}
      sudo docker compose {compose_files} down || sudo docker-compose {compose_files} down || true
      sudo docker ps -a
    """
    stdin, stdout, stderr = ssh.exec_command(docker_cmd, get_pty=True)
    out, err = stdout.read().decode(), stderr.read().decode()
    print(f"[{instance_name}] Docker compose down output:\n{out}")
    return stdout.channel.recv_exit_status() == 0

def auto_heal_containers(ssh, instance_name, config, missing_containers):
    print(f"[{instance_name}] 🔧 AUTO-HEALING: Riavvio docker-compose")
    
    if not run_docker_compose(ssh, instance_name, config):
        print(f"[{instance_name}] ❌ Errore docker-compose")
        return False
    
    required_containers = config.get('required_containers', [])
    if wait_containers_up(ssh, instance_name, required_containers):
        print(f"[{instance_name}] ✅ Auto-healing completato!")
        return True
    else:
        print(f"[{instance_name}] ⚠️  Auto-healing parziale")
        return False

# ---------- Process instance --------------------------------------

def process_instance(instance_name, config, now_roma, force, key_obj):
    instance_id = config['id']
    host = config['host']
    user = config['user']
    gestisci_docker = config['gestisci_docker']
    required_containers = config.get('required_containers', [])
    is_on_demand = config.get('on_demand', False)

    print(f"\n{'='*50}")
    print(f"PROCESSANDO: {instance_name} ({instance_id})")
    print(f"Force mode: {force}, On-demand: {is_on_demand}")
    print(f"{'='*50}")

    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        state = response['Reservations'][0]['Instances'][0]['State']['Name']
        print(f"[{instance_name}] Stato EC2: {state}")

        should_be_on = should_instance_be_on(instance_name, config, now_roma, force)

        # ---------- EC2 spenta ----------
        if state == 'stopped':
            print(f"[{instance_name}] *** EC2 SPENTA ***")

            if not should_be_on:
                msg = f"[{instance_name}] Rimane spenta"
                print(msg)
                return (instance_name, "off", "fuori orario/non lavorativo")

            # Accendo
            print(f"[{instance_name}] Accendo EC2...")
            ec2.start_instances(InstanceIds=[instance_id])
            ec2.get_waiter('instance_running').wait(InstanceIds=[instance_id])

            if not wait_ssh_ready(host):
                return (instance_name, "error", "ssh timeout")

            # Connessione SSH
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(host, username=user, pkey=key_obj)

            # Se force_start, setta il flag per il monitor
            if force:
                set_force_start_flag(ssh, instance_name)

            if not gestisci_docker:
                ssh.close()
                return (instance_name, "ready", "EC2 accesa (no Docker)")

            if not run_docker_compose(ssh, instance_name, config):
                ssh.close()
                return (instance_name, "error", "compose fail")

            ok = wait_containers_up(ssh, instance_name, required_containers)
            ssh.close()

            if ok:
                return (instance_name, "ready", f"EC2 + Docker avviati ({len(required_containers)} containers)")
            return (instance_name, "error", "containers down")

        # ---------- EC2 accesa ----------
        elif state == 'running':
            print(f"[{instance_name}] *** EC2 ACCESA ***")

            # --- ISTANZE ON-DEMAND: spegni se force_start scaduto ---
            if is_on_demand and not force:
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(host, username=user, pkey=key_obj)

                expired = check_force_start_expired(ssh, instance_name)

                if expired:
                    print(f"[{instance_name}] 🔻 On-demand + force_start scaduto → SPENGO")

                    if gestisci_docker:
                        run_docker_compose_down(ssh, instance_name, config)
                    ssh.close()

                    ec2.stop_instances(InstanceIds=[instance_id])
                    notify(f"⏰ {instance_name}: spegnimento automatico (force_start scaduto dopo {FORCE_START_DURATION_MINUTES} min)")
                    return (instance_name, "stopping", f"on-demand: force_start scaduto ({FORCE_START_DURATION_MINUTES} min)")

                # force_start ancora attivo: verifica container come al solito
                all_running, missing = check_required_containers(ssh, instance_name, required_containers)

                if all_running:
                    ssh.close()
                    return (instance_name, "ready", f"On-demand attivo, {len(required_containers)} container OK")

                if auto_heal_containers(ssh, instance_name, config, missing):
                    ssh.close()
                    return (instance_name, "recovered", f"Container riavviati ({len(missing)} recuperati)")
                else:
                    all_running_after, still_missing = check_required_containers(ssh, instance_name, required_containers)
                    ssh.close()
                    if all_running_after:
                        return (instance_name, "recovered", "Tutti i container riavviati")
                    else:
                        return (instance_name, "partial", f"Mancano ancora: {still_missing}")

            # --- ISTANZE NON ON-DEMAND: logica oraria standard ---
            if not should_be_on and not force:
                print(f"[{instance_name}] Spengo: fuori orario/non lavorativo")
                ec2.stop_instances(InstanceIds=[instance_id])
                return (instance_name, "stopping", "fuori orario")

            if not gestisci_docker:
                return (instance_name, "ready", "EC2 running (no Docker)")

            # Connessione SSH per verificare container
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(host, username=user, pkey=key_obj)

            # Se force_start su istanza già accesa, aggiorna il flag
            if force:
                set_force_start_flag(ssh, instance_name)

            all_running, missing = check_required_containers(ssh, instance_name, required_containers)

            if all_running:
                ssh.close()
                return (instance_name, "ready", f"Tutti i {len(required_containers)} container OK")

            # Auto-healing
            if auto_heal_containers(ssh, instance_name, config, missing):
                ssh.close()
                return (instance_name, "recovered", f"Container riavviati ({len(missing)} recuperati)")
            else:
                all_running_after, still_missing = check_required_containers(ssh, instance_name, required_containers)
                ssh.close()
                
                if all_running_after:
                    return (instance_name, "recovered", "Tutti i container riavviati")
                else:
                    return (instance_name, "partial", f"Mancano ancora: {still_missing}")

        else:
            return (instance_name, "warning", f"stato inatteso: {state}")

    except Exception as e:
        print(f"[{instance_name}] Errore: {str(e)}")
        return (instance_name, "error", str(e))


def process_instance_force_stop(instance_name, config, key_obj):
    """Spegne forzatamente un'istanza: docker down + ec2 stop"""
    instance_id = config['id']
    host = config['host']
    user = config['user']
    gestisci_docker = config['gestisci_docker']

    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        state = response['Reservations'][0]['Instances'][0]['State']['Name']

        if state == 'stopped':
            return (instance_name, "off", "già spenta")

        if state != 'running':
            return (instance_name, "warning", f"stato: {state}")

        # EC2 accesa: prima docker down, poi stop
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(host, username=user, pkey=key_obj)

        if gestisci_docker:
            run_docker_compose_down(ssh, instance_name, config)
        ssh.close()

        print(f"[{instance_name}] Spegnimento EC2...")
        ec2.stop_instances(InstanceIds=[instance_id])
        return (instance_name, "stopping", "spegnimento in corso")

    except Exception as e:
        print(f"[{instance_name}] Errore force_stop: {str(e)}")
        return (instance_name, "error", str(e))


def lambda_handler(event, context):
    print("=" * 60)
    print("INIZIO ESECUZIONE LAMBDA - EC2 MULTI-INSTANCE MANAGER")
    print("=" * 60)
    
    # Evita loop SNS
    if 'Records' in event and event['Records'][0].get('EventSource') == 'aws:sns':
        print("Invocazione SNS ignorata")
        return create_response(200, {"status": "ignored"})
    
    now_utc = datetime.datetime.utcnow()
    now_roma = get_rome_time()
    
    # Supporta force_start e force_stop da API Gateway (REST e HTTP API v2)
    force = event.get('force_start', False)
    force_stop = event.get('force_stop', False)
    target_instance = event.get('target_instance', 'SGAI-Production')
    body_raw = event.get('body')
    if isinstance(body_raw, str) and event.get('isBase64Encoded'):
        try:
            body_raw = base64.b64decode(body_raw).decode("utf-8")
        except Exception as e:
            print(f"Errore decode body base64: {e}")
    body = body_raw
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = None
    if isinstance(body, dict):
        force = body.get('force_start', force)
        force_stop = body.get('force_stop', force_stop)
        target_instance = body.get('target_instance', target_instance)
    
    print(f"Timestamp UTC: {now_utc.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Timestamp Roma: {now_roma.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Force start: {force}, Force stop: {force_stop}, Target: {target_instance}")
    
    if force:
        print("⚠️  FORCE START attivato da API Gateway!")
        print(f"   → Ignora orari e giorni")
        print(f"   → Timestamp wake su EC2 ({WAKE_AT_FILE_PATH}) per monitor auto-shutdown")
    if force_stop:
        print("⚠️  FORCE STOP attivato da API Gateway!")
        print(f"   → Spegnimento forzato di {target_instance}")
    
    print("-" * 40)
    
    key_path = download_pem_from_s3()
    key_obj = paramiko.RSAKey.from_private_key_file(key_path)
    
    # Force stop: spegni solo l'istanza target
    if force_stop:
        if target_instance not in INSTANCES_CONFIG:
            return create_response(400, {"error": f"target_instance '{target_instance}' non trovato"})
        config = INSTANCES_CONFIG[target_instance]
        result = process_instance_force_stop(target_instance, config, key_obj)
        results = [result]
    else:
        # Processa tutte le istanze (o solo target se specificato con force_start)
        instances_to_process = INSTANCES_CONFIG
        if force and target_instance and target_instance in INSTANCES_CONFIG:
            instances_to_process = {target_instance: INSTANCES_CONFIG[target_instance]}
        results = []
        for instance_name, config in instances_to_process.items():
            result = process_instance(instance_name, config, now_roma, force, key_obj)
            results.append(result)
            time.sleep(1)
    
    # Riepilogo
    summary = {
        "timestamp_utc": now_utc.strftime('%Y-%m-%d %H:%M:%S'),
        "timestamp_roma": now_roma.strftime('%Y-%m-%d %H:%M:%S'),
        "force_start": force,
        "force_stop": force_stop,
        "target_instance": target_instance,
        "instances": {}
    }
    
    notification_lines = [
        f"EC2 Manager - {now_roma.strftime('%H:%M')}",
        "=" * 30
    ]
    
    if force:
        notification_lines.append("🚀 FORCE START attivato!")
    if force_stop:
        notification_lines.append("🔻 FORCE STOP attivato!")
    
    has_errors = False
    has_changes = False
    
    for name, status, message in results:
        summary["instances"][name] = {"status": status, "message": message}
        
        emoji = {
            "ready": "✅",
            "recovered": "🔧",
            "partial": "⚠️",
            "stopping": "🔻",
            "off": "💤",
            "error": "❌"
        }.get(status, "⚠️")
        
        if status in ["ready", "recovered", "partial", "stopping"]:
            has_changes = True
        if status == "error":
            has_errors = True
        
        notification_lines.append(f"{emoji} {name}: {message}")
    
    if has_errors or has_changes:
        notify("\n".join(notification_lines))
    
    if has_errors:
        return create_response(500, summary)
    else:
        return create_response(200, summary)

def create_response(code, body):
    print(f"\nRisposta Lambda: {code}")
    print(f"Body: {json.dumps(body, indent=2)}")
    print("=" * 60)
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }
