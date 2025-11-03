# 🌙 SGAI - Pagina "Fuori Servizio" Setup

## 📋 Overview

Sistema per mostrare una pagina elegante quando SGAI è offline (fuori orario 8-22) con possibilità di risveglio immediato tramite pulsante.

## 🏗️ Architettura

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  S3 Static Website          │
│  (offline.html + assets)    │
└──────┬──────────────────────┘
       │
       │ Click "Risveglia SGAI"
       ▼
┌─────────────────────────────┐
│  API Gateway HTTP API       │
│  POST /wake-sgai            │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  Lambda Function            │
│  SGAI-EC2-Manager           │
│  (force_start: true)        │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  EC2 Instance               │
│  Start + Docker Compose     │
└─────────────────────────────┘
```

## 🚀 Setup Automatico

### Prerequisiti

1. **AWS CLI configurato**:
   ```bash
   aws configure
   ```

2. **Python 3 + boto3**:
   ```bash
   pip install boto3
   ```

3. **Lambda Function esistente**: Assicurati che `SGAI-EC2-Manager` Lambda sia già deployata

### Esecuzione

```bash
python setup_offline_page.py
```

Lo script configurerà automaticamente:
- ✅ S3 bucket per hosting statico (`sgai-offline-page`)
- ✅ Policy pubblica per accesso ai file
- ✅ API Gateway HTTP API (`SGAI-WakeUp-API`)
- ✅ Endpoint `/wake-sgai` collegato alla Lambda
- ✅ CORS configuration per chiamate cross-origin
- ✅ Upload file HTML e assets

### Output

Al termine vedrai:

```
✅ SETUP COMPLETATO!
============================================================

📍 URL Pagina Offline:
   http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com

🔗 API Gateway Endpoint:
   https://xyz123.execute-api.eu-north-1.amazonaws.com/wake-sgai

📝 Prossimi passi:
   1. Configura il tuo DNS o CloudFront per puntare all'URL
   2. (Opzionale) Crea CloudFront distribution per HTTPS
   3. Testa la pagina visitando l'URL sopra
```

## 🔧 Setup Manuale (alternativo)

### 1. S3 Bucket

```bash
# Crea bucket
aws s3 mb s3://sgai-offline-page --region eu-north-1

# Configura static website hosting
aws s3 website s3://sgai-offline-page \
  --index-document offline.html \
  --error-document offline.html

# Rimuovi block public access
aws s3api delete-public-access-block --bucket sgai-offline-page

# Applica policy pubblica
aws s3api put-bucket-policy --bucket sgai-offline-page --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::sgai-offline-page/*"
  }]
}'

# Upload file
aws s3 cp web/public/offline.html s3://sgai-offline-page/ --content-type text/html
aws s3 cp web/public/sgai-logo.svg s3://sgai-offline-page/ --content-type image/svg+xml
```

### 2. API Gateway

#### Console AWS:
1. Vai su **API Gateway** → **Create API** → **HTTP API**
2. Nome: `SGAI-WakeUp-API`
3. **Add integration** → **Lambda** → Seleziona `SGAI-EC2-Manager`
4. **Configure routes**:
   - Method: `POST`
   - Resource path: `/wake-sgai`
5. **Configure CORS**:
   - Allow origins: `*`
   - Allow methods: `POST, OPTIONS`
   - Allow headers: `Content-Type`
6. **Deploy**

#### AWS CLI:
```bash
# Ottieni Lambda ARN
LAMBDA_ARN=$(aws lambda get-function \
  --function-name SGAI-EC2-Manager \
  --query 'Configuration.FunctionArn' \
  --output text)

# Crea HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name SGAI-WakeUp-API \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins='*',AllowMethods='POST,OPTIONS',AllowHeaders='Content-Type' \
  --query 'ApiId' \
  --output text)

# Crea integrazione
INT_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri $LAMBDA_ARN \
  --payload-format-version 2.0 \
  --query 'IntegrationId' \
  --output text)

# Crea route
aws apigatewayv2 create-route \
  --api-id $API_ID \
  --route-key 'POST /wake-sgai' \
  --target integrations/$INT_ID

# Crea stage
aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name '$default' \
  --auto-deploy

# Aggiungi permesso Lambda
aws lambda add-permission \
  --function-name SGAI-EC2-Manager \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:eu-north-1:*:${API_ID}/*/*"

# Ottieni endpoint
aws apigatewayv2 get-api --api-id $API_ID --query 'ApiEndpoint' --output text
```

### 3. Aggiorna offline.html

Sostituisci `YOUR_API_GATEWAY_URL` con l'endpoint reale:

```javascript
const API_ENDPOINT = 'https://xyz123.execute-api.eu-north-1.amazonaws.com/wake-sgai';
```

E ri-upload su S3.

## 🌐 (Opzionale) CloudFront per HTTPS

### Perché?
- URL personalizzato (es. `offline.sgai.me`)
- HTTPS/SSL
- Cache globale (più veloce)
- Protezione DDoS

### Setup:

1. **Crea CloudFront Distribution**:
   - Origin: Endpoint S3 website (NON il bucket ARN!)
   - Viewer Protocol Policy: `Redirect HTTP to HTTPS`
   - Allowed HTTP Methods: `GET, HEAD, OPTIONS`
   - Compress Objects: `Yes`

2. **Configura DNS**:
   ```
   offline.sgai.me  →  CNAME  →  d1234xyz.cloudfront.net
   ```

3. **SSL Certificate** (AWS Certificate Manager):
   - Richiedi certificato per `offline.sgai.me`
   - Valida via DNS
   - Assegnalo alla CloudFront distribution

## 🧪 Test

### 1. Test Pagina Offline

```bash
curl -I http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com
```

Dovresti vedere:
```
HTTP/1.1 200 OK
Content-Type: text/html
```

### 2. Test API Wake-Up

```bash
curl -X POST \
  https://YOUR_API_ID.execute-api.eu-north-1.amazonaws.com/wake-sgai \
  -H 'Content-Type: application/json' \
  -d '{"force_start": true}'
```

Risposta attesa:
```json
{
  "statusCode": 200,
  "body": {
    "timestamp_roma": "2025-10-31 19:30:00",
    "force_mode": true,
    "instances": {
      "SGAI-Production": {
        "status": "ready",
        "message": "EC2 accesa e tutti i container UP"
      }
    }
  }
}
```

### 3. Test Flow Completo

1. Apri `http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com`
2. Clicca "⚡ Risveglia SGAI Ora"
3. Attendi il messaggio "✅ SGAI è pronto! Reindirizzamento..."
4. Verifica il redirect a `https://sgai.me`

## 🔄 Integrazione con Load Balancer / Nginx

### Opzione A: CloudFront Failover

Usa CloudFront con **Origin Group** (failover automatico):

```
Primary Origin: SGAI EC2 (sgai.me)
   ↓ (se down dopo 3 tentativi)
Failover Origin: S3 offline page
```

### Opzione B: Route 53 Health Check

```
Route 53 Health Check → SGAI EC2
   ↓ (se unhealthy)
Failover DNS → S3 offline page
```

### Opzione C: Nginx Reverse Proxy (sulla EC2)

Aggiungi in `/etc/nginx/sites-available/sgai`:

```nginx
location / {
    # Check se Docker è up
    set $docker_up 0;
    if (-f /var/run/sgai-ready) {
        set $docker_up 1;
    }

    # Se Docker è down, redirect a offline page
    if ($docker_up = 0) {
        return 302 http://sgai-offline-page.s3-website.eu-north-1.amazonaws.com;
    }

    # Altrimenti proxy normale
    proxy_pass http://localhost:80;
}
```

## 📊 Monitoring

### CloudWatch Logs

Monitora le chiamate alla Lambda:

```bash
aws logs tail /aws/lambda/SGAI-EC2-Manager --follow
```

### S3 Access Logs

Abilita logging per vedere chi accede alla pagina offline:

```bash
aws s3api put-bucket-logging \
  --bucket sgai-offline-page \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "sgai-logs-bucket",
      "TargetPrefix": "offline-page/"
    }
  }'
```

## 💰 Costi Stimati

- **S3**: ~$0.023/GB/mese (storage) + $0.09/GB (transfer)
- **API Gateway**: $1.00 per milione di richieste
- **Lambda**: Incluso nel free tier (1M richieste/mese gratis)
- **CloudFront** (opzionale): $0.085/GB (transfer)

**Stima totale**: < $5/mese con traffico normale

## 🛠️ Troubleshooting

### Errore: "Access Denied" su S3
- Verifica che la bucket policy sia pubblica
- Controlla che `Block Public Access` sia disabilitato

### Errore: "CORS policy" nel browser
- Verifica CORS su API Gateway
- Assicurati che `AllowOrigins` sia `*` o l'origin specifico

### Lambda non risponde
- Verifica che il permesso `lambda:InvokeFunction` sia presente
- Controlla i CloudWatch Logs della Lambda

### Pagina non si carica
- Test l'endpoint S3 direttamente: `http://BUCKET.s3-website.REGION.amazonaws.com`
- Verifica che il file sia stato uploadato correttamente

### EC2 non si accende
- Controlla i log della Lambda in CloudWatch
- Verifica che l'istanza non sia in stato `stopping`
- Verifica i permessi IAM della Lambda per `ec2:StartInstances`

## 📝 Note

- La pagina offline **NON** mostra dati sensibili
- Il token API è pubblico (è solo un trigger, nessun dato sensibile)
- Il polling usa `mode: 'no-cors'` per evitare problemi CORS
- Il timeout del polling è 3 minuti (sufficiente per EC2 + Docker)

## 🎨 Personalizzazione

### Modifica Orari

Cambia in `offline.html`:

```html
<div class="schedule-hours">8:00 - 22:00</div>
```

### Modifica Messaggio

Cambia in `offline.html`:

```html
<h1>SGAI sta riposando</h1>
<p class="subtitle">Anche l'intelligenza artificiale ha bisogno di una pausa!</p>
```

### Aggiungi Analytics

Aggiungi prima del `</body>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## 🚀 Deployment in Produzione

1. Esegui `python setup_offline_page.py`
2. Testa l'URL S3
3. (Opzionale) Configura CloudFront per HTTPS
4. Aggiorna DNS per puntare a CloudFront/S3
5. Testa il flow completo
6. Monitora con CloudWatch

---

**Made with ☕ by SGAI Team**


