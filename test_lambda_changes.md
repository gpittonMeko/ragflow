# 🧪 TEST PLAN - Lambda EC2 Manager Update

## 📋 **MODIFICHE ALLA LAMBDA:**

### ✅ **CODICE AGGIUNTO:**

1. **Nuova costante** (linea ~32):
```python
FORCE_START_DURATION_MINUTES = 5  # TEST: 5 minuti (PROD: 60)
FORCE_START_FLAG_PATH = '/tmp/force_start_active'
```

2. **Nuova funzione** `set_force_start_flag()` (linee ~120-140):
```python
def set_force_start_flag(ssh, instance_name, duration_minutes=FORCE_START_DURATION_MINUTES):
    """
    Crea il file /tmp/force_start_active sull'EC2 con timestamp ISO.
    """
    now_utc = datetime.datetime.utcnow()
    timestamp_iso = now_utc.isoformat()
    cmd = f"echo '{timestamp_iso}' > {FORCE_START_FLAG_PATH}"
    # ... esegue comando SSH ...
```

3. **Chiamata alla funzione** in 2 punti:
   - **Quando EC2 viene accesa** con `force=True` (linea ~290)
   - **Quando EC2 è già accesa** e riceve `force=True` (linea ~330)

4. **Parsing `force_start` da body JSON** (linee ~430-437):
```python
force = event.get('force_start', False)
if isinstance(event.get('body'), str):
    try:
        body = json.loads(event['body'])
        force = body.get('force_start', False)
    except:
        pass
```

---

## ✅ **COSA NON CAMBIA:**

- ❌ **NON cambia** la logica di orari (`ora_inizio`, `ora_fine`)
- ❌ **NON cambia** la logica weekend/festivi
- ❌ **NON cambia** l'auto-healing dei container
- ❌ **NON cambia** il comportamento quando `force=False`
- ❌ **NON cambia** la gestione Docker Compose
- ❌ **NON cambia** la verifica dei `required_containers`

---

## 🧪 **TEST DA ESEGUIRE:**

### **TEST 1: Chiamata schedulata normale (EventBridge)**
```json
{
  "force_start": false
}
```
**Risultato atteso:**
- ✅ EC2 si accende/spegne in base a orari
- ✅ Docker viene gestito normalmente
- ✅ **NON viene creato** `/tmp/force_start_active`

---

### **TEST 2: Chiamata API Gateway con force_start=true**
```json
{
  "body": "{\"force_start\": true}"
}
```
**Risultato atteso:**
- ✅ EC2 si accende **anche fuori orario**
- ✅ Docker viene avviato
- ✅ **Viene creato** `/tmp/force_start_active` con timestamp
- ✅ Monitor auto-shutdown legge il flag e ignora shutdown per 5 min

---

### **TEST 3: EC2 già accesa, chiamata con force_start=true**
```json
{
  "body": "{\"force_start\": true}"
}
```
**Risultato atteso:**
- ✅ EC2 rimane accesa
- ✅ **Viene aggiornato** `/tmp/force_start_active` con nuovo timestamp
- ✅ Monitor resetta il timer di shutdown

---

## 📝 **PRIMA DI DEPLOYARE:**

1. ✅ Backup del codice Lambda attuale
2. ✅ Test in ambiente locale/dev (se possibile)
3. ✅ Deploy della nuova versione
4. ✅ Test manuale con chiamata API Gateway
5. ✅ Verifica log CloudWatch
6. ✅ Se fallisce → rollback immediato

---

## 🚨 **ROLLBACK PLAN:**

Se qualcosa va storto:
1. AWS Console → Lambda → Versions
2. Seleziona versione precedente
3. Publish new version (rollback)
4. Update alias `$LATEST` → versione precedente

---

## ✅ **DEPLOYMENT CHECKLIST:**

- [ ] Zip del codice Lambda aggiornato
- [ ] Upload su AWS Lambda
- [ ] Test chiamata con `force_start=false` (normale)
- [ ] Test chiamata con `force_start=true` (API Gateway)
- [ ] Verifica SSH su EC2: `cat /tmp/force_start_active`
- [ ] Verifica log monitor auto-shutdown
- [ ] Monitoraggio per 1 ora

---

## 🎯 **VUOI CHE PROCEDA CON IL DEPLOYMENT?**

Oppure preferisci:
1. Rivedere il codice modificato
2. Fare altri test prima
3. Deploy solo in ambiente dev

