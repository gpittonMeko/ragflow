# 🚀 **DEPLOY MANUALE LAMBDA - GUIDA PASSO-PASSO**

---

## 📦 **FILE DA UPLOADARE:**

ZIP consigliato dal repo: esegui **`python create_lambda_zip.py`** → **`lambda_function_updated.zip`** (sorgente `lambda_edit/`).

Se usi ancora un file manuale **`lambda_deployment.zip`**, verifica che il contenuto sia lo stesso di `lambda_edit/`.

---

## 🔧 **PROCEDURA AWS CONSOLE:**

### **STEP 1: Apri AWS Console**
1. Vai su: https://console.aws.amazon.com/
2. Login con le tue credenziali
3. Regione: **eu-north-1** (Stoccolma)

---

### **STEP 2: Apri Lambda**
1. Cerca "Lambda" nella barra di ricerca
2. Clicca su "Lambda"

---

### **STEP 3: Trova la funzione**
1. Cerca la funzione: **`StartEC2InstanceAndForward`**
2. Clicca sul nome per aprirla

---

### **STEP 4: Backup (IMPORTANTE!)**
1. Clicca sul tab "**Versions**"
2. Clicca "**Publish new version**"
3. Description: `Backup before force_start update - 2025-11-02`
4. Clicca "**Publish**"
5. ✅ Ora hai un backup se qualcosa va storto!

---

### **STEP 5: Upload nuovo codice**
1. Torna alla funzione (clicca su **`StartEC2InstanceAndForward`**)
2. Clicca sul tab "**Code**"
3. Scroll down fino a "**Code source**"
4. Clicca sul pulsante "**Upload from**" → "**.zip file**"
5. Clicca "**Upload**"
6. Seleziona il file: **`lambda_function_updated.zip`** (o il tuo zip equivalente da `lambda_edit/`)
7. Clicca "**Save**"

---

### **STEP 6: Verifica**
1. Aspetta che appaia "Successfully uploaded..."
2. Il pacchetto standard del repo è **`python create_lambda_zip.py`** → **`lambda_function_updated.zip`** con sorgente in **`lambda_edit/`** (file principale: `lambda_function.py`).
3. Cerca nel codice `set_force_start_flag` o `AUTO-HEALING` per confermare la versione.

---

### **STEP 7: Handler (IMPORTANTE!)**
1. Scroll su fino a "**Runtime settings**"
2. Clicca "**Edit**"
3. Se hai caricato lo zip generato da **`create_lambda_zip.py`** (cartella `lambda_edit/`), l'handler corretto è: **`lambda_function.lambda_handler`** (è quello atteso in produzione).
4. Usa **`lambda_ec2_manager_updated.lambda_handler`** **solo** se nel zip hai messo `lambda_ec2_manager_updated.py` in root **senza** rinominarlo in `lambda_function.py`.
5. Clicca "**Save**"

Verifica rapida da PC: `powershell -File scripts/report_sgai_lambda_alignment.ps1`

**Upload zip da PC (alternativa se `aws lambda update-function-code` va in timeout):** dopo `python create_lambda_zip.py`, esegui `python scripts/deploy_sgai_lambda_zip.py` (boto3; stesse credenziali AWS della CLI).

**Allineare solo i file compose su EC2 (senza git pull):** `python scripts/sync_ec2_compose_files.py` (SFTP verso `/home/ubuntu/workspace/ragflow/docker/`; stessa chiave PEM su S3 della Lambda).

---

### **STEP 8: Test**
1. Clicca sul tab "**Test**"
2. Crea un nuovo test event:
   - Event name: `test_force_start`
   - Event JSON:
```json
{
  "body": "{\"force_start\": true}"
}
```
3. Clicca "**Save**"
4. Clicca "**Test**"

---

### **STEP 9: Verifica risultato**
Nel risultato del test, dovresti vedere:
```
⚠️  FORCE START attivato da API Gateway!
   → Ignora orari e giorni
   → Flag force_start verrà settato per 5 minuti
```

Se vedi questo → ✅ **FUNZIONA!**

---

## ⚠️ **SE QUALCOSA VA STORTO:**

### **ROLLBACK:**
1. Vai su tab "**Versions**"
2. Trova la versione di backup che hai creato
3. Clicca su di essa
4. Clicca "**Actions**" → "**Publish version**"
5. Torna alla versione precedente

---

## 📝 **DOPO IL DEPLOY:**

1. ✅ Riaccendi l'EC2 manualmente (o aspetta che sia già accesa)
2. ✅ Vai sulla pagina offline: https://sgai-offline-page.s3-website.eu-north-1.amazonaws.com/offline.html
3. ✅ Clicca "**Riattiva il Servizio**"
4. ✅ Aspetta 2-3 minuti
5. ✅ Dovresti vedere la progress bar e poi il redirect a sgailegal.com

---

## 🧪 **TEST COMPLETO:**

### **TEST 1: Wake-up da pagina offline**
1. Spegni EC2 (se accesa): 
   ```powershell
   aws ec2 stop-instances --instance-ids i-0ec0704c7b36f7648 --region eu-north-1
   ```
2. Vai su https://sgailegal.com (dovresti vedere pagina offline)
3. Clicca "Riattiva il Servizio"
4. Aspetta che EC2 si avvii
5. Verifica redirect automatico

### **TEST 2: Verifica flag force_start**
Quando EC2 è accesa:
```bash
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "cat /tmp/force_start_active"
```
Dovresti vedere un timestamp ISO!

### **TEST 3: Auto-shutdown dopo 5 minuti**
1. EC2 accesa, nessuna attività
2. Aspetta 5 minuti
3. EC2 dovrebbe spegnersi automaticamente

---

## ✅ **DIMMI QUANDO HAI FATTO IL DEPLOY!**

Poi procediamo con i test finali! 🚀

