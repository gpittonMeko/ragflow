#!/usr/bin/env python3
"""
Script per creare CloudFront distribution con failover automatico.

ARCHITETTURA:
┌─────────────┐
│sgailegal.com│ (CNAME)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  CloudFront Distribution    │
└──────┬──────────────────────┘
       │
       ├─► Origin Group (failover)
       │   │
       │   ├─► Primary: 13.49.16.179 (EC2)
       │   │   └─► Se 5xx error → failover
       │   │
       │   └─► Secondary: S3 offline page
       │       └─► Sempre disponibile
       │
       └─► Cache + HTTPS + Global CDN
"""

import boto3
import json
import time
import sys
from datetime import datetime

# CONFIGURAZIONE
REGION = 'eu-north-1'
DOMAIN_NAME = 'sgailegal.com'
EC2_IP = '13.49.16.179'
S3_BUCKET_WEBSITE = 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com'
CALLER_REFERENCE = f'sgailegal-{int(time.time())}'

# Client AWS
cloudfront = boto3.client('cloudfront', region_name='us-east-1')  # CloudFront è sempre us-east-1
acm = boto3.client('acm', region_name='us-east-1')  # Certificati per CloudFront devono essere in us-east-1

def print_section(title):
    """Stampa una sezione formattata"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def create_cloudfront_distribution():
    """Crea CloudFront distribution con Origin Group failover"""
    
    print_section("🌐 Creazione CloudFront Distribution")
    
    # Configurazione distribution
    distribution_config = {
        'CallerReference': CALLER_REFERENCE,
        'Aliases': {
            'Quantity': 0  # No alias per ora, lo aggiungiamo dopo con il certificato
        },
        'DefaultRootObject': '',
        'Origins': {
            'Quantity': 2,
            'Items': [
                {
                    'Id': 'sgai-ec2-primary',
                    'DomainName': DOMAIN_NAME,  # Usa dominio invece di IP
                    'CustomHeaders': {
                        'Quantity': 1,
                        'Items': [
                            {
                                'HeaderName': 'X-Forwarded-Host',
                                'HeaderValue': DOMAIN_NAME
                            }
                        ]
                    },
                    'CustomOriginConfig': {
                        'HTTPPort': 80,
                        'HTTPSPort': 443,
                        'OriginProtocolPolicy': 'http-only',  # EC2 risponde su HTTP
                        'OriginSslProtocols': {
                            'Quantity': 1,
                            'Items': ['TLSv1.2']
                        },
                        'OriginReadTimeout': 30,
                        'OriginKeepaliveTimeout': 5
                    },
                    'ConnectionAttempts': 3,
                    'ConnectionTimeout': 10
                },
                {
                    'Id': 'sgai-s3-fallback',
                    'DomainName': S3_BUCKET_WEBSITE,
                    'CustomOriginConfig': {
                        'HTTPPort': 80,
                        'HTTPSPort': 443,
                        'OriginProtocolPolicy': 'http-only',
                        'OriginSslProtocols': {
                            'Quantity': 1,
                            'Items': ['TLSv1.2']
                        },
                        'OriginReadTimeout': 30,
                        'OriginKeepaliveTimeout': 5
                    }
                }
            ]
        },
        'OriginGroups': {
            'Quantity': 1,
            'Items': [
                {
                    'Id': 'sgai-failover-group',
                    'FailoverCriteria': {
                        'StatusCodes': {
                            'Quantity': 6,
                            'Items': [500, 502, 503, 504, 404, 403]  # Failover su questi status code
                        }
                    },
                    'Members': {
                        'Quantity': 2,
                        'Items': [
                            {'OriginId': 'sgai-ec2-primary'},
                            {'OriginId': 'sgai-s3-fallback'}
                        ]
                    }
                }
            ]
        },
        'DefaultCacheBehavior': {
            'TargetOriginId': 'sgai-failover-group',  # Usa Origin Group
            'ViewerProtocolPolicy': 'redirect-to-https',  # Forza HTTPS
            'AllowedMethods': {
                'Quantity': 3,
                'Items': ['GET', 'HEAD', 'OPTIONS'],  # Solo metodi sicuri per Origin Group
                'CachedMethods': {
                    'Quantity': 2,
                    'Items': ['GET', 'HEAD']
                }
            },
            'Compress': True,
            'ForwardedValues': {
                'QueryString': True,
                'Cookies': {'Forward': 'all'},
                'Headers': {
                    'Quantity': 3,
                    'Items': ['Host', 'CloudFront-Forwarded-Proto', 'User-Agent']
                }
            },
            'MinTTL': 0,
            'DefaultTTL': 0,  # No cache per contenuto dinamico
            'MaxTTL': 0,
            'TrustedSigners': {
                'Enabled': False,
                'Quantity': 0
            }
        },
        'CacheBehaviors': {
            'Quantity': 1,
            'Items': [
                {
                    'PathPattern': '/offline.html',  # Cache pagina offline
                    'TargetOriginId': 'sgai-s3-fallback',
                    'ViewerProtocolPolicy': 'redirect-to-https',
                    'AllowedMethods': {
                        'Quantity': 2,
                        'Items': ['GET', 'HEAD']
                    },
                    'Compress': True,
                    'ForwardedValues': {
                        'QueryString': False,
                        'Cookies': {'Forward': 'none'}
                    },
                    'MinTTL': 300,  # Cache 5 minuti
                    'DefaultTTL': 3600,
                    'MaxTTL': 86400,
                    'TrustedSigners': {
                        'Enabled': False,
                        'Quantity': 0
                    }
                }
            ]
        },
        'Comment': 'SGAI CloudFront with automatic failover to S3',
        'Logging': {
            'Enabled': False,
            'IncludeCookies': False,
            'Bucket': '',
            'Prefix': ''
        },
        'PriceClass': 'PriceClass_100',  # Solo USA, Canada, Europa (più economico)
        'Enabled': True,
        'ViewerCertificate': {
            'CloudFrontDefaultCertificate': True,  # Inizialmente usa certificato di default
            'MinimumProtocolVersion': 'TLSv1.2_2021'
        },
        'HttpVersion': 'http2and3',
        'IsIPV6Enabled': True
    }
    
    try:
        print("📦 Creazione distribution in corso...")
        print(f"   Domain: {DOMAIN_NAME}")
        print(f"   Primary Origin: {EC2_IP}")
        print(f"   Fallback Origin: {S3_BUCKET_WEBSITE}")
        
        response = cloudfront.create_distribution(
            DistributionConfig=distribution_config
        )
        
        distribution = response['Distribution']
        distribution_id = distribution['Id']
        cloudfront_domain = distribution['DomainName']
        
        print(f"\n✅ Distribution creata con successo!")
        print(f"   ID: {distribution_id}")
        print(f"   Domain CloudFront: {cloudfront_domain}")
        print(f"   Status: {distribution['Status']}")
        
        return {
            'id': distribution_id,
            'domain': cloudfront_domain,
            'status': distribution['Status']
        }
        
    except Exception as e:
        print(f"\n❌ Errore creazione distribution: {e}")
        return None

def main():
    print_section("🚀 SETUP CLOUDFRONT FAILOVER per SGAI")
    
    print("📋 Configurazione:")
    print(f"   Dominio: {DOMAIN_NAME}")
    print(f"   EC2 IP: {EC2_IP}")
    print(f"   S3 Fallback: {S3_BUCKET_WEBSITE}")
    
    # Crea distribution
    result = create_cloudfront_distribution()
    
    if not result:
        print("\n❌ Setup fallito!")
        sys.exit(1)
    
    # Risultato finale
    print_section("✅ SETUP COMPLETATO!")
    
    print("📍 CloudFront Distribution:")
    print(f"   ID: {result['id']}")
    print(f"   Domain: {result['domain']}")
    print(f"   Status: {result['status']}")
    
    print("\n" + "="*60)
    print("📝 PROSSIMI PASSI su Register.it:")
    print("="*60)
    
    print("\n1️⃣  ELIMINA questo record:")
    print("   ❌ sgailegal.com.    A    13.49.16.179")
    
    print("\n2️⃣  AGGIUNGI questo record:")
    print(f"   ✅ sgailegal.com.    CNAME    {result['domain']}")
    print(f"      TTL: 900")
    
    print("\n3️⃣  Attendi propagazione DNS (5-15 minuti)")
    
    print("\n4️⃣  Testa:")
    print(f"   http://{DOMAIN_NAME}")
    print(f"   https://{DOMAIN_NAME}")
    
    print("\n" + "="*60)
    print("⚠️  NOTA IMPORTANTE:")
    print("="*60)
    print("La distribution CloudFront impiega circa 15-20 minuti")
    print("per essere completamente distribuita su tutti i POP globali.")
    print("\nPuoi controllare lo stato con:")
    print(f"  aws cloudfront get-distribution --id {result['id']}")
    print("\nCerca: Status: Deployed")
    print("="*60)
    
    print("\n🎉 Quando sarà 'Deployed', sgailegal.com farà automaticamente:")
    print("   ✅ Se EC2 è UP → mostra SGAI")
    print("   ✅ Se EC2 è DOWN → mostra pagina offline S3")
    print("   ✅ HTTPS automatico")
    print("   ✅ Cache globale (più veloce)")
    print("\n")

if __name__ == '__main__':
    main()

