# ✅ **RIEPILOGO COMPLETO - SISTEMA AUTO-SHUTDOWN + WAKE-UP**

---

## 📊 **STATO ATTUALE:**

| Componente | Stato | Note |
|------------|-------|------|
| **Pagina offline (S3)** | ✅ **COMPLETATO** | Con grafica loading smooth |
| **API Gateway** | ✅ **COMPLETATO** | URL: https://91k2hfw1n3.execute-api.eu-north-1.amazonaws.com/wake-up |
| **CloudFront failover** | ✅ **COMPLETATO** | sgailegal.com + www.sgailegal.com |
| **DNS (Register.it)** | ✅ **COMPLETATO** | ALIAS + CNAME configurati |
| **Monitor auto-shutdown** | ✅ **INSTALLATO** | Su EC2, come systemd service |
| **Lambda aggiornata** | ⏳ **DA DEPLOYARE** | File pronto: `lambda_deployment.zip` |

---

## 🎯 **ARCHITETTURA FINALE:**

```
┌─────────────────────────────────────────────────────────────┐
│  UTENTE visita sgailegal.com                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │      CloudFront (CDN)         │
         │  d15m4ubs6zcnvv.cloudfront.net│
         └───────────┬───────────────────┘
                     │
        ┌────────────┴────────────┐
        │   Origin Group Failover │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────┐              ┌──────────────────┐
│  Primary Origin  │              │ Fallback Origin  │
│ app.sgailegal.com│              │   S3 Bucket      │
│ (13.49.16.179)   │              │ sgai-offline-page│
└────────┬─────────┘              └────────┬─────────┘
         │                                 │
         ▼                                 ▼
   ┌─────────────┐                ┌─────────────────┐
   │  EC2 ONLINE │                │ offline.html    │
   │  → SGAI App │                │ + Wake-up button│
   └─────────────┘                └────────┬────────┘
                                           │
                                  Click "Riattiva"
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │  API Gateway    │
                                  │  POST /wake-up  │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────────────┐
                                  │  Lambda (aggiornata)    │
                                  │  force_start=true       │
                                  ├─────────────────────────┤
                                  │  1. Start EC2           │
                                  │  2. SSH → setta flag    │
                                  │  3. Avvia Docker        │
                                  └────────┬────────────────┘
                                           │
                                           ▼
                                  ┌─────────────────────────┐
                                  │  EC2 si riaccende       │
                                  │  Docker containers UP   │
                                  └────────┬────────────────┘
                                           │
                                           ▼
                                  ┌─────────────────────────┐
                                  │  Monitor auto-shutdown  │
                                  │  (systemd service)      │
                                  ├─────────────────────────┤
                                  │  - Legge /tmp/flag      │
                                  │  - Ignora shutdown 5min │
                                  │  - Monitora attività    │
                                  │  - Se inattivo → OFF    │
                                  └─────────────────────────┘
```

---

## 📝 **COSA DEVI FARE ORA:**

### **1️⃣ DEPLOY LAMBDA (MANUALE - AWS CONSOLE)**

Segui la guida: **`DEPLOY_LAMBDA_MANUALE.md`**

**TL;DR:**
1. Vai su AWS Console → Lambda → `StartEC2InstanceAndForward`
2. Fai backup (Publish new version)
3. Upload `lambda_deployment.zip`
4. Cambia Handler in: `lambda_ec2_manager_updated.lambda_handler`
5. Test con: `{"body": "{\"force_start\": true}"}`

---

### **2️⃣ TEST SISTEMA COMPLETO**

Dopo il deploy Lambda:

#### **TEST A: Wake-up da pagina offline**
```powershell
# 1. Spegni EC2
aws ec2 stop-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# 2. Aspetta che si spenga
aws ec2 wait instance-stopped --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# 3. Vai su https://www.sgailegal.com (dovresti vedere pagina offline)

# 4. Clicca "Riattiva il Servizio"

# 5. Dovresti vedere:
#    - Progress bar animata
#    - "Avvio istanza EC2..."
#    - "Caricamento servizi Docker..."
#    - "✅ SGAI è pronto! Reindirizzamento..."
#    - Redirect automatico a SGAI
```

#### **TEST B: Verifica flag force_start**
```powershell
# SSH sull'EC2 (quando è accesa)
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "cat /tmp/force_start_active"

# Dovresti vedere un timestamp ISO, es:
# 2025-11-02T09:15:30.123456
```

#### **TEST C: Monitor logs**
```powershell
# Verifica che il monitor sia attivo
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo systemctl status sgai-auto-shutdown"

# Visualizza log in tempo reale
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "sudo journalctl -u sgai-auto-shutdown -f"

# Dovresti vedere log tipo:
# [INFO] Force-start attivo, shutdown ignorato per altri 3 minuti
# [ACTIVITY] Rilevata attività utente, reset timer
# [STATUS] Tempo rimanente prima dello shutdown: 4m 30s
```

#### **TEST D: Auto-shutdown dopo inattività**
```powershell
# 1. EC2 accesa, nessuna attività
# 2. Aspetta 5 minuti (nessuna chat, nessun retrieval)
# 3. Verifica che EC2 si spenga automaticamente

aws ec2 describe-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1 --query 'Reservations[0].Instances[0].State.Name' --output text

# Dopo 5 minuti dovrebbe essere: stopped
```

---

## 🎛️ **CONFIGURAZIONE TEMPI (PER TEST):**

**File**: `lambda_ec2_manager_updated.py`
```python
FORCE_START_DURATION_MINUTES = 5  # TEST: 5 minuti (PROD: 60)
```

**File**: `auto_shutdown_monitor.py`
```python
INACTIVITY_TIMEOUT_MINUTES = 5     # TEST: 5 minuti (PROD: 60)
GRACE_PERIOD_MINUTES = 10          # Periodo grazia dopo boot
```

**PER PRODUZIONE (dopo test):**
- Cambia `5` → `60` (1 ora)
- Rideploya Lambda + riavvia monitor

---

## 🔧 **TROUBLESHOOTING:**

### **Problema: EC2 si spegne subito dopo wake-up**
**Causa**: Lambda non ha settato il flag
**Soluzione**: Verifica che il deploy Lambda sia andato a buon fine

### **Problema: Monitor non parte automaticamente**
**Soluzione**:
```bash
ssh -i "..." ubuntu@13.49.16.179
sudo systemctl enable sgai-auto-shutdown
sudo systemctl start sgai-auto-shutdown
sudo systemctl status sgai-auto-shutdown
```

### **Problema: Pagina offline non reindirizza**
**Causa**: EC2 non ancora pronta o Docker non avviato
**Soluzione**: Aspetta 2-3 minuti, Docker impiega tempo

### **Problema: CloudFront mostra errore 404**
**Causa**: Cache di CloudFront
**Soluzione**: Fai invalidation cache:
```powershell
aws cloudfront create-invalidation --distribution-id EV1L2NZ6QXAWE --paths "/*" --region eu-north-1
```

---

## 📊 **METRICHE DA MONITORARE:**

1. **CloudWatch Logs** (Lambda):
   - Cercare `Force-start attivo`
   - Verificare che Docker si avvii

2. **EC2 System Logs** (Monitor):
   ```bash
   sudo journalctl -u sgai-auto-shutdown -f
   ```

3. **CloudFront Metrics**:
   - Error rate (dovrebbe essere ~0%)
   - Origin response time

---

## ✅ **CHECKLIST FINALE:**

- [ ] Lambda deployata con `lambda_deployment.zip`
- [ ] Handler cambiato in `lambda_ec2_manager_updated.lambda_handler`
- [ ] Test Lambda con force_start=true (risponde OK)
- [ ] Monitor installato su EC2
- [ ] Monitor attivo (`systemctl status sgai-auto-shutdown`)
- [ ] Test wake-up da pagina offline (funziona)
- [ ] Test auto-shutdown dopo 5 min (funziona)
- [ ] Pagina offline.html ha URL API Gateway corretto

---

## 🎯 **PROSSIMI PASSI (OPZIONALI):**

1. **Aumentare timeout a 1h** (dopo test con 5min)
2. **Aggiungere CloudWatch Alarms** per monitoring
3. **Setup backup automatico** DB RAGFlow
4. **Logging avanzato** delle attività utente

---

## 📞 **SUPPORTO:**

Se qualcosa non funziona:
1. Controlla i log CloudWatch (Lambda)
2. Controlla i log systemd (Monitor)
3. Verifica DNS propagation
4. Testa API Gateway direttamente con Postman

---

## 🚀 **VAI E TESTA!**

Quando hai fatto il deploy Lambda, dimmi e facciamo i test insieme! 💪

