#!/usr/bin/env python3
"""
Setup Route 53 con failover DNS automatico:
- Primary: 13.49.16.179 (EC2)
- Secondary: CloudFront → S3 offline page

Quando EC2 è DOWN → failover automatico a CloudFront
"""
import boto3
import time

REGION = 'eu-north-1'
DOMAIN = 'sgailegal.com'
EC2_IP = '13.49.16.179'
CLOUDFRONT_DOMAIN = 'd15m4ubs6zcnvv.cloudfront.net'

route53 = boto3.client('route53')

print("🚀 Setup Route 53 Failover DNS")
print("="*60)

# 1. Crea Hosted Zone
print("\n📋 Step 1: Creazione Hosted Zone...")

try:
    response = route53.create_hosted_zone(
        Name=DOMAIN,
        CallerReference=str(int(time.time())),
        HostedZoneConfig={
            'Comment': 'SGAI with automatic failover',
            'PrivateZone': False
        }
    )
    
    zone_id = response['HostedZone']['Id']
    nameservers = response['DelegationSet']['NameServers']
    
    print(f"✅ Hosted Zone creata: {zone_id}")
    print(f"\n📍 NAMESERVERS (da configurare su Register.it):")
    for ns in nameservers:
        print(f"   {ns}")
    
except route53.exceptions.HostedZoneAlreadyExists:
    print("⚠️  Hosted Zone già esistente, recupero ID...")
    zones = route53.list_hosted_zones_by_name(DNSName=DOMAIN)
    zone_id = zones['HostedZones'][0]['Id']
    print(f"✅ Hosted Zone: {zone_id}")

# 2. Crea Health Check per EC2
print("\n📋 Step 2: Creazione Health Check per EC2...")

health_check = route53.create_health_check(
    HealthCheckConfig={
        'Type': 'HTTP',
        'ResourcePath': '/',
        'IPAddress': EC2_IP,
        'Port': 80,
        'RequestInterval': 30,  # Check ogni 30 secondi
        'FailureThreshold': 2   # 2 fallimenti = UNHEALTHY
    },
    CallerReference=f'sgai-ec2-health-{int(time.time())}'
)

health_check_id = health_check['HealthCheck']['Id']
print(f"✅ Health Check creato: {health_check_id}")

# 3. Crea record PRIMARY (EC2 con health check)
print("\n📋 Step 3: Creazione record PRIMARY (EC2)...")

route53.change_resource_record_sets(
    HostedZoneId=zone_id,
    ChangeBatch={
        'Changes': [
            {
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': DOMAIN,
                    'Type': 'A',
                    'SetIdentifier': 'Primary-EC2',
                    'Failover': 'PRIMARY',
                    'HealthCheckId': health_check_id,
                    'TTL': 60,
                    'ResourceRecords': [{'Value': EC2_IP}]
                }
            }
        ]
    }
)

print(f"✅ Record PRIMARY creato: {DOMAIN} → {EC2_IP}")

# 4. Crea record SECONDARY (CloudFront)
print("\n📋 Step 4: Creazione record SECONDARY (CloudFront)...")

route53.change_resource_record_sets(
    HostedZoneId=zone_id,
    ChangeBatch={
        'Changes': [
            {
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': DOMAIN,
                    'Type': 'A',
                    'SetIdentifier': 'Secondary-CloudFront',
                    'Failover': 'SECONDARY',
                    'AliasTarget': {
                        'HostedZoneId': 'Z2FDTNDATAQYW2',  # CloudFront hosted zone ID (fixed)
                        'DNSName': CLOUDFRONT_DOMAIN,
                        'EvaluateTargetHealth': False
                    }
                }
            }
        ]
    }
)

print(f"✅ Record SECONDARY creato: {DOMAIN} → {CLOUDFRONT_DOMAIN}")

# 5. Crea record www (CNAME)
print("\n📋 Step 5: Creazione record www...")

route53.change_resource_record_sets(
    HostedZoneId=zone_id,
    ChangeBatch={
        'Changes': [
            {
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': f'www.{DOMAIN}',
                    'Type': 'CNAME',
                    'TTL': 300,
                    'ResourceRecords': [{'Value': DOMAIN}]
                }
            }
        ]
    }
)

print(f"✅ Record www creato: www.{DOMAIN} → {DOMAIN}")

# 6. Crea record app (per CloudFront origin)
print("\n📋 Step 6: Creazione record app...")

route53.change_resource_record_sets(
    HostedZoneId=zone_id,
    ChangeBatch={
        'Changes': [
            {
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': f'app.{DOMAIN}',
                    'Type': 'A',
                    'TTL': 60,
                    'ResourceRecords': [{'Value': EC2_IP}]
                }
            }
        ]
    }
)

print(f"✅ Record app creato: app.{DOMAIN} → {EC2_IP}")

# Risultato finale
print("\n" + "="*60)
print("✅ ROUTE 53 CONFIGURATO!")
print("="*60)

print("\n📝 PROSSIMO PASSO: Cambia NAMESERVERS su Register.it")
print("\nVai su Register.it → DNS → Nameservers personalizzati")
print("\nInserisci questi 4 nameservers:")
for ns in nameservers:
    print(f"   {ns}")

print("\n⏱️  Propagazione: 1-24 ore")
print("\n🎯 COME FUNZIONERÀ:")
print("   ✅ EC2 UP → utenti vedono EC2 direttamente")
print("   ✅ EC2 DOWN → Health check rileva → DNS switch a CloudFront → S3 offline page")
print("   ✅ Failover automatico in ~60 secondi!")
print("\n")

