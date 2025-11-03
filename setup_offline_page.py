#!/usr/bin/env python3
"""
Script per configurare la pagina "Fuori Servizio" di SGAI su AWS.

Configurazione:
1. S3 bucket per hosting statico
2. CloudFront distribution per servire la pagina
3. API Gateway per esporre endpoint /wake-sgai
4. Lambda function per force_start dell'istanza

Prerequisiti:
- AWS CLI configurato con credenziali appropriate
- boto3 installato (pip install boto3)
- File offline.html in web/public/
"""

import boto3
import json
import time
import sys
from pathlib import Path

# CONFIGURAZIONE
REGION = 'eu-north-1'
BUCKET_NAME = 'sgai-offline-page'
LAMBDA_FUNCTION_NAME = 'SGAI-EC2-Manager'  # La tua Lambda esistente
API_NAME = 'SGAI-WakeUp-API'

# Client AWS
s3 = boto3.client('s3', region_name=REGION)
cloudfront = boto3.client('cloudfront', region_name=REGION)
apigateway = boto3.client('apigatewayv2', region_name=REGION)
lambda_client = boto3.client('lambda', region_name=REGION)
iam = boto3.client('iam', region_name=REGION)

def create_s3_bucket():
    """Crea S3 bucket per hosting statico"""
    print(f"\n📦 Creando bucket S3: {BUCKET_NAME}...")
    
    try:
        # Crea bucket
        if REGION == 'us-east-1':
            s3.create_bucket(Bucket=BUCKET_NAME)
        else:
            s3.create_bucket(
                Bucket=BUCKET_NAME,
                CreateBucketConfiguration={'LocationConstraint': REGION}
            )
        print(f"✅ Bucket creato: {BUCKET_NAME}")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print(f"⚠️  Bucket già esistente: {BUCKET_NAME}")
    except Exception as e:
        print(f"❌ Errore creazione bucket: {e}")
        return False

    # Configura come sito statico
    try:
        s3.put_bucket_website(
            Bucket=BUCKET_NAME,
            WebsiteConfiguration={
                'IndexDocument': {'Suffix': 'offline.html'},
                'ErrorDocument': {'Key': 'offline.html'}
            }
        )
        print("✅ Configurazione sito statico applicata")
    except Exception as e:
        print(f"❌ Errore configurazione sito: {e}")
        return False

    # Policy per accesso pubblico
    policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": f"arn:aws:s3:::{BUCKET_NAME}/*"
        }]
    }

    try:
        # Rimuovi block public access
        s3.delete_public_access_block(Bucket=BUCKET_NAME)
        
        # Applica policy
        s3.put_bucket_policy(
            Bucket=BUCKET_NAME,
            Policy=json.dumps(policy)
        )
        print("✅ Policy pubblica applicata")
    except Exception as e:
        print(f"❌ Errore policy: {e}")
        return False

    return True

def upload_files():
    """Upload file HTML e assets su S3"""
    print("\n📤 Upload file su S3...")
    
    base_path = Path(__file__).parent
    offline_html = base_path / 'web' / 'public' / 'offline.html'
    logo_svg = base_path / 'web' / 'public' / 'sgai-logo.svg'
    
    files_to_upload = [
        (offline_html, 'offline.html', 'text/html'),
    ]
    
    # Aggiungi logo se esiste
    if logo_svg.exists():
        files_to_upload.append((logo_svg, 'sgai-logo.svg', 'image/svg+xml'))
    
    for file_path, s3_key, content_type in files_to_upload:
        if not file_path.exists():
            print(f"⚠️  File non trovato: {file_path}")
            continue
        
        try:
            s3.upload_file(
                str(file_path),
                BUCKET_NAME,
                s3_key,
                ExtraArgs={'ContentType': content_type}
            )
            print(f"✅ Uploaded: {s3_key}")
        except Exception as e:
            print(f"❌ Errore upload {s3_key}: {e}")
            return False
    
    return True

def create_api_gateway():
    """Crea API Gateway HTTP API per /wake-sgai endpoint"""
    print(f"\n🌐 Creando API Gateway: {API_NAME}...")
    
    try:
        # Crea HTTP API
        response = apigateway.create_api(
            Name=API_NAME,
            ProtocolType='HTTP',
            CorsConfiguration={
                'AllowOrigins': ['*'],
                'AllowMethods': ['POST', 'OPTIONS'],
                'AllowHeaders': ['Content-Type'],
                'MaxAge': 300
            }
        )
        api_id = response['ApiId']
        api_endpoint = response['ApiEndpoint']
        print(f"✅ API creata: {api_id}")
        print(f"   Endpoint: {api_endpoint}")
        
        # Ottieni ARN della Lambda
        lambda_response = lambda_client.get_function(FunctionName=LAMBDA_FUNCTION_NAME)
        lambda_arn = lambda_response['Configuration']['FunctionArn']
        
        # Crea integrazione con Lambda
        integration_response = apigateway.create_integration(
            ApiId=api_id,
            IntegrationType='AWS_PROXY',
            IntegrationUri=lambda_arn,
            PayloadFormatVersion='2.0'
        )
        integration_id = integration_response['IntegrationId']
        print(f"✅ Integrazione Lambda creata: {integration_id}")
        
        # Crea route POST /wake-sgai
        route_response = apigateway.create_route(
            ApiId=api_id,
            RouteKey='POST /wake-sgai',
            Target=f'integrations/{integration_id}'
        )
        print(f"✅ Route creata: POST /wake-sgai")
        
        # Crea stage $default
        stage_response = apigateway.create_stage(
            ApiId=api_id,
            StageName='$default',
            AutoDeploy=True
        )
        print(f"✅ Stage creato: $default")
        
        # Aggiungi permesso alla Lambda per API Gateway
        try:
            lambda_client.add_permission(
                FunctionName=LAMBDA_FUNCTION_NAME,
                StatementId=f'apigateway-invoke-{int(time.time())}',
                Action='lambda:InvokeFunction',
                Principal='apigateway.amazonaws.com',
                SourceArn=f'arn:aws:execute-api:{REGION}:{lambda_response["Configuration"]["FunctionArn"].split(":")[4]}:{api_id}/*/*'
            )
            print("✅ Permesso Lambda per API Gateway aggiunto")
        except lambda_client.exceptions.ResourceConflictException:
            print("⚠️  Permesso già esistente")
        
        full_endpoint = f"{api_endpoint}/wake-sgai"
        print(f"\n🎯 API Gateway Endpoint completo:")
        print(f"   {full_endpoint}")
        
        return full_endpoint
        
    except Exception as e:
        print(f"❌ Errore creazione API Gateway: {e}")
        return None

def update_html_with_endpoint(api_endpoint):
    """Aggiorna offline.html con l'endpoint API Gateway corretto"""
    print(f"\n✏️  Aggiornando offline.html con endpoint API...")
    
    html_path = Path(__file__).parent / 'web' / 'public' / 'offline.html'
    
    if not html_path.exists():
        print(f"❌ File non trovato: {html_path}")
        return False
    
    try:
        # Leggi file
        content = html_path.read_text(encoding='utf-8')
        
        # Sostituisci placeholder
        content = content.replace(
            "const API_ENDPOINT = 'https://YOUR_API_GATEWAY_URL/prod/wake-sgai';",
            f"const API_ENDPOINT = '{api_endpoint}';"
        )
        
        # Scrivi file aggiornato
        html_path.write_text(content, encoding='utf-8')
        print("✅ offline.html aggiornato")
        
        # Re-upload su S3
        s3.upload_file(
            str(html_path),
            BUCKET_NAME,
            'offline.html',
            ExtraArgs={'ContentType': 'text/html'}
        )
        print("✅ File aggiornato su S3")
        
        return True
    except Exception as e:
        print(f"❌ Errore aggiornamento HTML: {e}")
        return False

def get_bucket_website_url():
    """Ottieni URL del bucket S3 website"""
    if REGION == 'us-east-1':
        return f"http://{BUCKET_NAME}.s3-website-{REGION}.amazonaws.com"
    else:
        return f"http://{BUCKET_NAME}.s3-website.{REGION}.amazonaws.com"

def main():
    print("="*60)
    print("🚀 SETUP PAGINA OFFLINE SGAI")
    print("="*60)
    
    # Step 1: S3 Bucket
    if not create_s3_bucket():
        print("\n❌ Errore nella creazione del bucket S3")
        sys.exit(1)
    
    # Step 2: API Gateway
    api_endpoint = create_api_gateway()
    if not api_endpoint:
        print("\n❌ Errore nella creazione di API Gateway")
        sys.exit(1)
    
    # Step 3: Aggiorna HTML con endpoint
    if not update_html_with_endpoint(api_endpoint):
        print("\n❌ Errore nell'aggiornamento del file HTML")
        sys.exit(1)
    
    # Step 4: Upload file
    if not upload_files():
        print("\n❌ Errore nell'upload dei file")
        sys.exit(1)
    
    # Risultato finale
    website_url = get_bucket_website_url()
    
    print("\n" + "="*60)
    print("✅ SETUP COMPLETATO!")
    print("="*60)
    print(f"\n📍 URL Pagina Offline:")
    print(f"   {website_url}")
    print(f"\n🔗 API Gateway Endpoint:")
    print(f"   {api_endpoint}")
    print(f"\n📝 Prossimi passi:")
    print(f"   1. Configura il tuo DNS o CloudFront per puntare a:")
    print(f"      {website_url}")
    print(f"   2. (Opzionale) Crea CloudFront distribution per HTTPS")
    print(f"   3. Testa la pagina visitando l'URL sopra")
    print("\n" + "="*60)

if __name__ == '__main__':
    main()


