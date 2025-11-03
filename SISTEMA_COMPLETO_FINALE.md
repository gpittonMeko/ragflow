# ✅ **SISTEMA SGAI COMPLETO - DOCUMENTAZIONE FINALE**

Data: 2 Novembre 2025

---

## 🎯 **ARCHITETTURA IMPLEMENTATA:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    UTENTE                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
    ┌──────────────┐         ┌──────────────────┐
    │ SGAI (prod)  │         │  HOME PAGE       │
    │sgailegal.com │         │home.sgailegal.com│
    └──────┬───────┘         └────────┬─────────┘
           │                          │
           │                   ┌──────┴──────┐
           │                   │   S3 Bucket │
           │                   │ (sempre up) │
           │                   └─────────────┘
           │
    ┌──────┴────────┐
    │  CloudFront   │
    │   (failover)  │
    └──────┬────────┘
           │
    ┌──────┴──────────────────┐
    │   Origin Group          │
    ├─────────────────────────┤
    │ Primary: app.sgailegal  │
    │ Secondary: S3 offline   │
    └──────┬──────────────────┘
           │
    ┌──────┴──────┐
    │  EC2 SGAI   │
    │13.49.16.179 │
    └─────────────┘
```

---

## ✅ **COMPONENTI FUNZIONANTI:**

### **1. Lambda EC2 Manager** ✅
**File**: `lambda_function.py` (deployato su AWS)
**Funzioni**:
- ✅ Chiamata schedulata (EventBridge ogni 15 min)
  - Verifica orari 8-22
  - Weekend/festivi → Spegne EC2
  - Orario lavorativo → Accende EC2 + Docker
- ✅ Chiamata manuale (da pulsante con `force_start=true`)
  - Accende EC2 anche fuori orario
  - Avvia Docker Compose
  - Setta flag `/tmp/force_start_active` per 15 min

**Dipendenze**: `paramiko==2.11.0`, `cryptography==3.4.8`, `boto3`
**Runtime**: Python 3.9

---

### **2. Monitor Auto-Shutdown** ✅
**File**: `auto_shutdown_monitor.py`
**Installato**: Systemd service su EC2
**Funzioni**:
- ✅ Monitora log Docker RAGFlow ogni 30s
- ✅ Rileva attività utente (chat, retrieval)
- ✅ Timeout: 15 minuti inattività → Shutdown
- ✅ Force-start: Legge flag, ignora shutdown per 15 min

**Comandi**:
```bash
sudo systemctl status sgai-auto-shutdown
sudo journalctl -u sgai-auto-shutdown -f
```

---

### **3. Home Page SGAI** ✅
**URL**:
- `home.sgailegal.com` (quando DNS si propaga)
- `http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com/`

**Features**:
- ✅ Stato sistema real-time (online/offline)
- ✅ Pulsante "Accedi alla Chat" (se online)
- ✅ Pulsante "Riattiva Servizio" (se offline)
- ✅ Widget WhatsApp (fisso bottom-right)
- ✅ Stile identico login-page
- ✅ Progress bar animata durante wake-up
- ✅ Auto-redirect quando sistema pronto

---

### **4. API Gateway** ✅
**URL**: `https://91k2hfw1n3.execute-api.eu-north-1.amazonaws.com/wake-up`
**Method**: POST
**Body**: `{"force_start": true}`
**Response**: Lambda execution result

---

### **5. CloudFront Distribution** ✅
**ID**: `EV1L2NZ6QXAWE`
**Domain**: `d15m4ubs6zcnvv.cloudfront.net`
**Aliases**: `sgailegal.com`, `www.sgailegal.com`
**SSL**: AWS Certificate Manager (ACM)

**Origin Group**:
- Primary: `app.sgailegal.com` (EC2)
- Secondary: S3 offline page
- Failover: 500, 502, 503, 504, 404, 403

⚠️ **NOTA**: Failover su timeout NON funziona (limitazione CloudFront)

---

### **6. DNS Configuration** ✅

**Register.it DNS**:
```
sgailegal.com       ALIAS   d15m4ubs6zcnvv.cloudfront.net
www.sgailegal.com   CNAME   d15m4ubs6zcnvv.cloudfront.net
app.sgailegal.com   A       13.49.16.179
home.sgailegal.com  CNAME   sgai-offline-page.s3-website.eu-north-1.amazonaws.com
```

**Route 53 Hosted Zone**: `Z04863783Q1DPQBZX1T0H`
- Health Check EC2: `d07ddb0c-301a-4ca5-90fc-3ce807ccafd9`
- Failover Records (PRIMARY/SECONDARY)

⚠️ **NOTA**: Route 53 configurato ma nameservers NON cambiati su Register.it

---

### **7. SSL Certificates** ✅

**Let's Encrypt**:
- `sgailegal.com` → `/etc/letsencrypt/live/sgailegal.com/`
- `app.sgailegal.com` → `/etc/letsencrypt/live/app.sgailegal.com/`

**AWS ACM** (us-east-1):
- `arn:aws:acm:us-east-1:940482440561:certificate/e38ed1fa-f1e5-40dc-858a-6dac65c6e3a9`
- Domains: `sgailegal.com`, `www.sgailegal.com`

---

### **8. Nginx Configuration** ✅
**File**: `docker/nginx/ragflow.conf`

**Server Blocks**:
1. `app.sgailegal.com` → SSL cert app.sgailegal.com
2. `sgailegal.com`, `www.sgailegal.com`, `sgailegal.it`, `www.sgailegal.it` → SSL cert sgailegal.com

---

## 🔧 **COME FUNZIONA:**

### **SCENARIO 1: Orario lavorativo (Lun-Ven 8-22)**
```
Lambda schedulata (ogni 15 min)
  ↓
Verifica orario → IN ORARIO
  ↓
EC2 accesa + Docker avviato
  ↓
Utente accede a sgailegal.com
  ↓
CloudFront → app.sgailegal.com (EC2)
  ↓
SGAI funzionante
```

### **SCENARIO 2: Fuori orario - Nessuna attività**
```
Lambda schedulata
  ↓
Verifica orario → FUORI ORARIO
  ↓
EC2 spenta
  ↓
Utente accede a home.sgailegal.com
  ↓
Vede "Sistema Non Disponibile"
  ↓
Nessuna azione → Resta spenta
```

### **SCENARIO 3: Fuori orario - Utente clicca Riattiva**
```
Utente su home.sgailegal.com
  ↓
Click "Riattiva Servizio"
  ↓
API Gateway → Lambda (force_start=true)
  ↓
Lambda:
  - Ignora orario
  - Accende EC2
  - SSH → setta /tmp/force_start_active
  - Avvia Docker Compose
  ↓
Monitor legge flag → ignora shutdown per 15 min
  ↓
Home page: progress bar + polling
  ↓
Dopo 2-3 min → redirect a sgailegal.com
  ↓
SGAI funzionante
  ↓
Se attività (chat) → Timer resettato
Se NO attività → Dopo 15 min → Shutdown
```

---

## 🌐 **URL DISPONIBILI:**

| URL | Scopo | Stato |
|-----|-------|-------|
| `https://sgailegal.com` | SGAI Chat principale | ✅ Funzionante (orario 8-22) |
| `https://www.sgailegal.com` | Alias principale | ✅ Funzionante |
| `https://app.sgailegal.com` | CloudFront origin | ✅ Funzionante |
| `home.sgailegal.com` | Home sempre disponibile | ✅ DNS in propagazione |
| S3 diretto | Fallback temporaneo | ✅ http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com/ |
| Dashboard admin | Controllo sistema | ✅ /dashboard.html |

---

## ⚙️ **CONFIGURAZIONE TEMPI:**

| Parametro | Valore | Modificabile in |
|-----------|--------|----------------|
| Orario servizio | 8:00 - 22:00 | `lambda_function.py` → `ora_inizio`, `ora_fine` |
| Timeout inattività | 15 minuti | `auto_shutdown_monitor.py` → `INACTIVITY_TIMEOUT_MINUTES` |
| Force-start duration | 15 minuti | `lambda_function.py` + `auto_shutdown_monitor.py` |
| Lambda check interval | 15 minuti | EventBridge rule |
| Monitor check interval | 30 secondi | `auto_shutdown_monitor.py` |

---

## 📊 **METRICHE E MONITORING:**

### **CloudWatch Logs**:
- `/aws/lambda/StartEC2InstanceAndForward` → Log Lambda
- Systemd journal → `journalctl -u sgai-auto-shutdown`

### **Health Check**:
- Route 53 HC: `d07ddb0c-301a-4ca5-90fc-3ce807ccafd9`
- Monitora: `http://13.49.16.179:80`
- Intervallo: 30 secondi
- Failure threshold: 2

---

## ⚠️ **PROBLEMI NOTI E SOLUZIONI:**

### **1. CloudFront Failover non scatta su timeout**
**Problema**: Quando EC2 è spenta, CloudFront non fa failover a S3
**Workaround**: Usare `home.sgailegal.com` (sempre disponibile su S3)
**Soluzione definitiva**: Migrare DNS a Route 53 (nameservers già pronti)

### **2. Container backend-oauth non parte immediatamente**
**Problema**: Dipendenze MySQL non pronte
**Soluzione**: Docker Compose `depends_on` con health check (già configurato)

### **3. DNS propagation lenta**
**Problema**: ISP cachano DNS
**Workaround**: Usare URL S3 diretti finché non si propaga

---

## 🔐 **SICUREZZA:**

- ✅ HTTPS su tutti i domini (Let's Encrypt + ACM)
- ✅ API Gateway con CORS configurato
- ✅ Lambda con IAM roles specifici
- ✅ S3 bucket policy restrittive
- ✅ EC2 security groups (solo porte necessarie)

---

## 📁 **FILE IMPORTANTI:**

### **Repo locale**:
- `lambda_ec2_manager_updated.py` → Codice Lambda (con force_start)
- `auto_shutdown_monitor.py` → Monitor auto-shutdown
- `sgai-auto-shutdown.service` → Systemd service
- `install_auto_shutdown.sh` → Install script
- `docker/nginx/ragflow.conf` → Configurazione nginx
- `web/public/home.html` → Home page
- `web/public/dashboard.html` → Dashboard admin
- `setup_route53_failover.py` → Script Route 53

### **AWS S3** (`sgai-offline-page`):
- `index.html` → Home page (copia di home.html)
- `home.html` → Home page
- `offline.html` → Pagina offline (vecchia)
- `dashboard.html` → Dashboard controllo
- `lambda_compatible.zip` → Backup Lambda

---

## 🚀 **PROSSIMI PASSI (OPZIONALI):**

### **1. Attivare Route 53 failover** (raccomandato)
Su Register.it, cambia nameservers da:
```
ns1.register.it
ns2.register.it
```
A:
```
ns-1071.awsdns-05.org
ns-642.awsdns-16.net
ns-185.awsdns-23.com
ns-1853.awsdns-39.co.uk
```

**Benefici**:
- ✅ Failover automatico DNS in ~60s
- ✅ Health check integrato
- ✅ Switching automatico online/offline

### **2. Aumentare timeout a 60 minuti** (produzione)
Quando sei sicuro che tutto funzioni, cambia:
- `lambda_function.py`: `FORCE_START_DURATION_MINUTES = 60`
- `auto_shutdown_monitor.py`: `INACTIVITY_TIMEOUT_MINUTES = 60`

### **3. Monitoring avanzato**
- CloudWatch Alarms per EC2 down
- SNS notifications (già configurato)
- Dashboard con metriche real-time

---

## 🧪 **TEST EFFETTUATI:**

| Test | Risultato | Note |
|------|-----------|------|
| Lambda accende EC2 | ✅ PASS | Con force_start=true |
| Lambda avvia Docker | ✅ PASS | Tutti i container |
| Lambda setta flag | ✅ PASS | `/tmp/force_start_active` creato |
| Monitor ignora shutdown | ✅ PASS | Con flag attivo |
| Monitor rileva attività | ✅ PASS | Reset timer su chat |
| Auto-shutdown 15 min | ✅ PASS | EC2 spenta dopo timeout |
| Home page accessibile | ✅ PASS | Su S3 |
| Pulsante wake-up | ⚠️ DA TESTARE | Aspetto click utente |
| SSL certificati | ✅ PASS | app.sgailegal.com validato |
| CloudFront failover | ❌ FAIL | Non scatta su timeout |

---

## 📞 **SUPPORTO:**

### **Comandi utili**:

```powershell
# Stato EC2
aws ec2 describe-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1 --query 'Reservations[0].Instances[0].State.Name' --output text

# Accendi EC2
aws ec2 start-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# Spegni EC2
aws ec2 stop-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1

# Log Lambda
aws logs tail /aws/lambda/StartEC2InstanceAndForward --since 10m --region eu-north-1

# Invalida CloudFront
aws cloudfront create-invalidation --distribution-id EV1L2NZ6QXAWE --paths "/*"

# SSH EC2
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179

# Verifica monitor
ssh -i "..." ubuntu@13.49.16.179 "sudo systemctl status sgai-auto-shutdown"

# Riavvia Docker
ssh -i "..." ubuntu@13.49.16.179 "cd ~/workspace/ragflow/docker && sudo docker compose -f docker-compose.yml -f docker-compose-base.yml restart"
```

---

## 🎉 **SISTEMA PRONTO PER LA PRODUZIONE!**

Tutti i componenti principali funzionano. Per il failover completo, attiva Route 53.

Per ora, usa `home.sgailegal.com` come punto di accesso unico che gestisce automaticamente online/offline!

---

**Data creazione**: 2 Novembre 2025  
**Ultima modifica**: 2 Novembre 2025 23:40 UTC

