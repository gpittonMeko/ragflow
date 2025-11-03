# 📝 **RIEPILOGO MODIFICHE LAMBDA**

---

## 🎯 **OBIETTIVO:**
Aggiungere supporto per `force_start=true` da API Gateway, **senza modificare** il comportamento esistente.

---

## ✅ **MODIFICHE ESATTE:**

### **1. Nuove costanti (dopo linea ~28):**
```python
# NEW: Configurazione force_start
FORCE_START_DURATION_MINUTES = 5  # TEST: 5 minuti (PROD: 60)
FORCE_START_FLAG_PATH = '/tmp/force_start_active'
```

---

### **2. Nuova funzione (dopo funzione `should_instance_be_on`):**
```python
def set_force_start_flag(ssh, instance_name, duration_minutes=FORCE_START_DURATION_MINUTES):
    """
    Crea il file /tmp/force_start_active sull'EC2 con timestamp ISO.
    Questo dice al monitor di NON spegnere l'istanza per N minuti.
    """
    now_utc = datetime.datetime.utcnow()
    timestamp_iso = now_utc.isoformat()
    
    cmd = f"echo '{timestamp_iso}' > {FORCE_START_FLAG_PATH}"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    
    if exit_status == 0:
        print(f"[{instance_name}] ✅ Flag force_start settato per {duration_minutes} minuti")
        print(f"[{instance_name}]    File: {FORCE_START_FLAG_PATH}")
        print(f"[{instance_name}]    Timestamp: {timestamp_iso}")
        return True
    else:
        err = stderr.read().decode()
        print(f"[{instance_name}] ❌ Errore settaggio flag: {err}")
        return False
```

---

### **3. Chiamata funzione quando EC2 viene accesa (dentro `process_instance`, dopo `ssh.connect`):**
```python
# NEW: Se force_start, setta il flag per il monitor
if force:
    set_force_start_flag(ssh, instance_name)
```

---

### **4. Chiamata funzione quando EC2 è già accesa (dentro sezione `state == 'running'`, dopo `ssh.connect`):**
```python
# NEW: Se force_start su istanza già accesa, aggiorna il flag
if force:
    set_force_start_flag(ssh, instance_name)
```

---

### **5. Parsing `force_start` da API Gateway body (dentro `lambda_handler`, dopo `now_roma = get_rome_time()`):**
```python
# NEW: Supporta force_start da API Gateway
force = event.get('force_start', False)
if isinstance(event.get('body'), str):
    try:
        body = json.loads(event['body'])
        force = body.get('force_start', False)
    except:
        pass
```

---

### **6. Log aggiuntivi (dopo il parsing di `force`):**
```python
if force:
    print("⚠️  FORCE START attivato da API Gateway!")
    print(f"   → Ignora orari e giorni")
    print(f"   → Flag force_start verrà settato per {FORCE_START_DURATION_MINUTES} minuti")
```

---

### **7. Notifica SNS aggiornata (dentro loop `for name, status, message in results`):**
```python
if force:
    notification_lines.append("🚀 FORCE START attivato!")
```

---

## ❌ **COSA NON CAMBIA:**

| Funzione | Modificata? | Note |
|----------|-------------|------|
| `is_working_day()` | ❌ NO | Identica |
| `should_instance_be_on()` | ❌ NO | **Già gestiva** `force=True` |
| `run_docker_compose()` | ❌ NO | Identica |
| `auto_heal_containers()` | ❌ NO | Identica |
| `check_required_containers()` | ❌ NO | Identica |
| `wait_containers_up()` | ❌ NO | Identica |
| Logica orari | ❌ NO | Identica |
| Logica weekend/festivi | ❌ NO | Identica |

---

## 🔍 **VERIFICA COMPORTAMENTO ESISTENTE:**

La Lambda **già supportava** `force=True` nelle funzioni:

```python
def is_working_day(now_roma, force, ...):
    if force:
        print("Force=True, considero giorno lavorativo")
        return True
    # ...

def should_instance_be_on(instance_name, config, now_roma, force):
    if force:
        print(f"[{instance_name}] Force mode: ignora orari e giorni")
        return True
    # ...
```

**QUINDI:**
- ✅ La logica `force=True` **esisteva già**
- ✅ Noi aggiungiamo **solo** il settaggio del flag SSH
- ✅ **Zero impatto** sul comportamento esistente

---

## 📊 **FLUSSO PRIMA VS DOPO:**

### **PRIMA (EventBridge schedulato, force=False):**
```
1. EventBridge trigger → Lambda
2. force = False
3. Verifica orario/giorno
4. Se in orario → EC2 ON + Docker
5. Se fuori orario → EC2 OFF
```

### **DOPO (EventBridge schedulato, force=False):**
```
1. EventBridge trigger → Lambda
2. force = False
3. Verifica orario/giorno
4. Se in orario → EC2 ON + Docker
5. Se fuori orario → EC2 OFF
```
**✅ IDENTICO!**

---

### **PRIMA (API Gateway, non esisteva):**
```
N/A - API Gateway non collegato
```

### **DOPO (API Gateway, force=True):**
```
1. API Gateway → Lambda (body: {"force_start": true})
2. force = True
3. IGNORA orario/giorno (logica già esistente!)
4. EC2 ON + Docker
5. **NUOVO:** Setta /tmp/force_start_active via SSH
6. Monitor legge flag → ignora shutdown per 5min
```

---

## ✅ **SICUREZZA DEPLOYMENT:**

1. ✅ **Backward compatible**: Se `force` non è nel body → default `False`
2. ✅ **Fail-safe**: Se settaggio flag fallisce → Lambda continua comunque
3. ✅ **No breaking changes**: Tutte le chiamate esistenti funzionano identiche
4. ✅ **Logging completo**: Ogni operazione loggata in CloudWatch

---

## 🚀 **PRONTO PER DEPLOYMENT?**

Dimmi se:
1. ✅ **Deploy subito** (ho verificato tutto)
2. ⏸️ **Aspetta** (rivediamo qualcosa)
3. 🧪 **Test locale** prima (se hai ambiente dev)

