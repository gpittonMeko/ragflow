# ✅ **TUTTO PRONTO PER IL TEST!**

---

## 📊 **STATO COMPONENTI:**

| Componente | Stato | Configurazione |
|------------|-------|----------------|
| **Monitor auto-shutdown** | ✅ **ATTIVO** | Timeout: 15 minuti inattività |
| **Lambda aggiornata** | 📦 **PRONTA** | File: `lambda_deployment.zip` |
| **API Gateway** | ✅ **ATTIVO** | https://91k2hfw1n3.execute-api.eu-north-1.amazonaws.com/wake-up |
| **Pagina offline** | ✅ **DEPLOYED** | Con loading animation smooth |
| **CloudFront failover** | ✅ **ATTIVO** | sgailegal.com → CloudFront → Origin Group |

---

## ⏱️ **CONFIGURAZIONE TEMPI:**

- **Force-start duration**: **15 minuti** (da click pulsante)
- **Auto-shutdown timeout**: **15 minuti** (dopo inattività)
- **Lambda schedulata**: **Ogni 15 minuti** (controlla orari)

---

## 🎯 **COME FUNZIONA:**

### **SCENARIO 1: In orario lavorativo (8:00-22:00)**
```
Lambda schedulata (ogni 15 min)
  → Verifica orario → IN ORARIO
  → EC2 ON + Docker UP
  → Rimane accesa
```

### **SCENARIO 2: Fuori orario (22:00-8:00) - NESSUNA ATTIVITÀ**
```
Lambda schedulata (ogni 15 min)
  → Verifica orario → FUORI ORARIO
  → EC2 OFF
  → CloudFront → Failover S3
  → Pagina offline mostrata
```

### **SCENARIO 3: Fuori orario - UTENTE CLICCA "RIATTIVA"**
```
1. Utente su sgailegal.com → Pagina offline
2. Click "Riattiva il Servizio"
3. API Gateway → Lambda (force_start=true)
4. Lambda:
   - Ignora orario (force=true già funzionava!)
   - Accende EC2
   - SSH → setta /tmp/force_start_active
   - Avvia Docker Compose
5. Monitor legge flag → ignora shutdown per 15 min
6. Pagina mostra loading animation
7. Dopo 2-3 min → redirect a SGAI
8. Se attività (chat) → resetta timer a 15 min
9. Se NO attività → dopo 15 min → shutdown
10. Ritorna pagina offline
```

---

## 🧪 **ADESSO DEVI:**

### **1️⃣ DEPLOY LAMBDA (AWS CONSOLE)**

**File**: `lambda_deployment.zip` (nella cartella del progetto)

**Passi**:
1. AWS Console → Lambda → `StartEC2InstanceAndForward`
2. Fai **backup** (Versions → Publish new version)
3. Upload `lambda_deployment.zip`
4. Cambia Handler: `lambda_ec2_manager_updated.lambda_handler`
5. Test con JSON:
```json
{
  "body": "{\"force_start\": true}"
}
```

**Verifica** nel risultato del test:
```
⚠️  FORCE START attivato da API Gateway!
   → Ignora orari e giorni
   → Flag force_start verrà settato per 15 minuti
```

---

### **2️⃣ TEST MANUALE**

#### **TEST A: Verifica monitor attivo**
```powershell
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo systemctl status sgai-auto-shutdown"
```
Deve essere: **active (running)**

#### **TEST B: Vedi log monitor**
```powershell
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo journalctl -u sgai-auto-shutdown -f"
```
Dovresti vedere:
```
[START] Activity Monitor avviato
[CONFIG] Timeout inattività: 15 minuti
[STATUS] Tempo rimanente prima dello shutdown: 14m 30s
```

#### **TEST C: Wake-up completo**
```powershell
# 1. Spegni EC2
aws ec2 stop-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# 2. Aspetta shutdown
aws ec2 wait instance-stopped --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# 3. Vai su https://www.sgailegal.com
# Dovresti vedere la pagina offline

# 4. Clicca "Riattiva il Servizio"
# Dovresti vedere:
#  - Progress bar animata
#  - "Avvio istanza EC2..."
#  - "Caricamento servizi Docker..."
#  - Timer 0:45, 1:30, 2:15...
#  - "✅ SGAI è pronto! Reindirizzamento..."
#  - Redirect automatico

# 5. Verifica flag creato
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "cat /tmp/force_start_active"
# Deve mostrare un timestamp ISO

# 6. Verifica log monitor
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo journalctl -u sgai-auto-shutdown -n 20"
# Deve mostrare: "[INFO] Force-start attivo, shutdown ignorato per altri X minuti"
```

#### **TEST D: Auto-shutdown dopo 15 min**
```powershell
# 1. EC2 accesa, nessuna attività per 15 minuti
# 2. Aspetta e monitora

# Ogni minuto, controlla:
aws ec2 describe-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1 --query 'Reservations[0].Instances[0].State.Name' --output text

# Dopo 15 minuti dovrebbe passare a: stopping → stopped
```

---

## 🔍 **MONITORAGGIO IN TEMPO REALE:**

### **Terminal 1: Log monitor**
```powershell
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo journalctl -u sgai-auto-shutdown -f"
```

### **Terminal 2: Stato EC2**
```powershell
while ($true) { 
    $state = aws ec2 describe-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1 --query 'Reservations[0].Instances[0].State.Name' --output text
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - EC2 State: $state"
    Start-Sleep -Seconds 10
}
```

### **Terminal 3: Log Docker**
```powershell
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "docker logs -f --tail 50 ragflow-server | grep -E '(POST /v1/canvas|POST /v1/retrieval)'"
```

---

## ⚠️ **TROUBLESHOOTING:**

### **Problema: Monitor dice "CONTAINER MANCANTI"**
```bash
ssh -i "..." ubuntu@13.49.16.179
docker ps
# Verifica che tutti i container richiesti siano UP
```

### **Problema: EC2 si spegne subito dopo wake-up**
**Causa**: Lambda non ha settato il flag
**Verifica**:
```bash
ssh -i "..." ubuntu@13.49.16.179 "ls -la /tmp/force_start_active"
```
Se non esiste → Lambda non deployata correttamente

### **Problema: Flag esiste ma monitor spegne comunque**
**Verifica timestamp**:
```bash
ssh -i "..." ubuntu@13.49.16.179 "cat /tmp/force_start_active"
```
Se timestamp > 15 minuti fa → flag scaduto (normale)

---

## 📊 **METRICHE DA CONTROLLARE:**

1. **Lambda invocations** (CloudWatch)
2. **EC2 start/stop events** (CloudWatch Events)
3. **Monitor logs** (journalctl)
4. **CloudFront requests** (CloudWatch)
5. **API Gateway calls** (CloudWatch)

---

## ✅ **CHECKLIST FINALE:**

- [ ] Lambda deployata (`lambda_deployment.zip`)
- [ ] Handler aggiornato (`lambda_ec2_manager_updated.lambda_handler`)
- [ ] Test Lambda con `force_start=true` → OK
- [ ] Monitor installato e attivo
- [ ] Test wake-up da pagina → Funziona
- [ ] Flag `/tmp/force_start_active` creato
- [ ] Monitor ignora shutdown per 15 min
- [ ] Auto-shutdown dopo 15 min inattività → Funziona

---

## 🎯 **VAI E TESTA!**

Fai il deploy della Lambda e dimmi cosa succede! 🚀

