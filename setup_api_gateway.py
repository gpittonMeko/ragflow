#!/usr/bin/env python3
"""
Crea API Gateway HTTP per il pulsante "Riattiva Servizio"
"""
import boto3
import json

REGION = 'eu-north-1'
LAMBDA_ARN = 'arn:aws:lambda:eu-north-1:940482440561:function:StartEC2InstanceAndForward'

# Clients
apigateway = boto3.client('apigatewayv2', region_name=REGION)
lambda_client = boto3.client('lambda', region_name=REGION)

print("🚀 Creazione API Gateway HTTP...")

# 1. Crea API
api_response = apigateway.create_api(
    Name='SGAI-WakeUp-API',
    ProtocolType='HTTP',
    CorsConfiguration={
        'AllowOrigins': ['*'],
        'AllowMethods': ['POST', 'OPTIONS'],
        'AllowHeaders': ['*'],
        'MaxAge': 300
    }
)

api_id = api_response['ApiId']
api_endpoint = api_response['ApiEndpoint']

print(f"✅ API creata: {api_id}")
print(f"   Endpoint: {api_endpoint}")

# 2. Crea integrazione con Lambda
integration_response = apigateway.create_integration(
    ApiId=api_id,
    IntegrationType='AWS_PROXY',
    IntegrationUri=LAMBDA_ARN,
    PayloadFormatVersion='2.0'
)

integration_id = integration_response['IntegrationId']
print(f"✅ Integrazione Lambda creata: {integration_id}")

# 3. Crea route POST /wake-up
route_response = apigateway.create_route(
    ApiId=api_id,
    RouteKey='POST /wake-up',
    Target=f'integrations/{integration_id}'
)

print(f"✅ Route creata: POST /wake-up")

# 4. Crea stage $default (auto-deploy)
stage_response = apigateway.create_stage(
    ApiId=api_id,
    StageName='$default',
    AutoDeploy=True
)

print(f"✅ Stage $default creato (auto-deploy)")

# 5. Dai permessi a API Gateway per invocare Lambda
try:
    lambda_client.add_permission(
        FunctionName='StartEC2InstanceAndForward',
        StatementId=f'apigateway-invoke-{api_id}',
        Action='lambda:InvokeFunction',
        Principal='apigateway.amazonaws.com',
        SourceArn=f'arn:aws:execute-api:{REGION}:940482440561:{api_id}/*/*/wake-up'
    )
    print(f"✅ Permessi Lambda configurati")
except lambda_client.exceptions.ResourceConflictException:
    print(f"⚠️  Permessi già esistenti (ok)")

# URL finale
wake_up_url = f"{api_endpoint}/wake-up"

print("\n" + "="*60)
print("✅ API GATEWAY CONFIGURATO!")
print("="*60)
print(f"\n📍 URL per Wake-Up:")
print(f"   {wake_up_url}")
print(f"\n📝 Aggiorna offline.html con questo URL!")
print("="*60)

# Salva URL in un file
with open('api_gateway_url.txt', 'w') as f:
    f.write(wake_up_url)

print(f"\n💾 URL salvato in: api_gateway_url.txt")

