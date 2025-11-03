#!/usr/bin/env python3
"""
Crea CloudFront distribution per home.sgailegal.com
"""
import boto3
import json
import time

def create_home_cloudfront():
    client = boto3.client('cloudfront')
    acm = boto3.client('acm', region_name='us-east-1')
    
    # Trova certificato per home.sgailegal.com
    print("🔍 Cerco certificato ACM per home.sgailegal.com...")
    certs = acm.list_certificates(CertificateStatuses=['ISSUED'])
    
    cert_arn = None
    for cert in certs['CertificateSummaryList']:
        cert_details = acm.describe_certificate(CertificateArn=cert['CertificateArn'])
        domain = cert_details['Certificate']['DomainName']
        sans = cert_details['Certificate'].get('SubjectAlternativeNames', [])
        
        if 'home.sgailegal.com' in sans or domain == 'home.sgailegal.com':
            cert_arn = cert['CertificateArn']
            print(f"✅ Certificato trovato: {cert_arn}")
            break
    
    if not cert_arn:
        print("⚠️ Nessun certificato trovato per home.sgailegal.com!")
        print("📝 Creo CloudFront con certificato di default...")
    
    # Configurazione CloudFront
    caller_reference = f"home-sgai-{int(time.time())}"
    
    config = {
        'CallerReference': caller_reference,
        'Aliases': {
            'Quantity': 1,
            'Items': ['home.sgailegal.com']
        } if cert_arn else {'Quantity': 0},
        'DefaultRootObject': 'index.html',
        'Origins': {
            'Quantity': 1,
            'Items': [
                {
                    'Id': 'S3-sgai-offline-page',
                    'DomainName': 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com',
                    'CustomOriginConfig': {
                        'HTTPPort': 80,
                        'HTTPSPort': 443,
                        'OriginProtocolPolicy': 'http-only',
                        'OriginSslProtocols': {
                            'Quantity': 1,
                            'Items': ['TLSv1.2']
                        }
                    },
                    'OriginPath': '',
                    'CustomHeaders': {
                        'Quantity': 0
                    }
                }
            ]
        },
        'DefaultCacheBehavior': {
            'TargetOriginId': 'S3-sgai-offline-page',
            'ViewerProtocolPolicy': 'redirect-to-https',
            'AllowedMethods': {
                'Quantity': 2,
                'Items': ['GET', 'HEAD'],
                'CachedMethods': {
                    'Quantity': 2,
                    'Items': ['GET', 'HEAD']
                }
            },
            'Compress': True,
            'ForwardedValues': {
                'QueryString': False,
                'Cookies': {'Forward': 'none'},
                'Headers': {
                    'Quantity': 0
                }
            },
            'MinTTL': 0,
            'DefaultTTL': 86400,
            'MaxTTL': 31536000,
            'TrustedSigners': {
                'Enabled': False,
                'Quantity': 0
            }
        },
        'Comment': 'CloudFront for home.sgailegal.com',
        'Enabled': True
    }
    
    # Aggiungi certificato se disponibile
    if cert_arn:
        config['ViewerCertificate'] = {
            'ACMCertificateArn': cert_arn,
            'SSLSupportMethod': 'sni-only',
            'MinimumProtocolVersion': 'TLSv1.2_2021',
            'Certificate': cert_arn,
            'CertificateSource': 'acm'
        }
    else:
        config['ViewerCertificate'] = {
            'CloudFrontDefaultCertificate': True,
            'MinimumProtocolVersion': 'TLSv1'
        }
    
    print("\n🚀 Creo CloudFront distribution...")
    try:
        response = client.create_distribution(DistributionConfig=config)
        
        dist_id = response['Distribution']['Id']
        dist_domain = response['Distribution']['DomainName']
        
        print(f"\n✅ CloudFront creato!")
        print(f"📋 Distribution ID: {dist_id}")
        print(f"🌐 CloudFront Domain: {dist_domain}")
        print(f"\n📝 AGGIUNGI QUESTO CNAME SU REGISTER.IT:")
        print(f"   home.sgailegal.com → {dist_domain}")
        
        return dist_id, dist_domain
        
    except Exception as e:
        print(f"❌ Errore: {e}")
        return None, None

if __name__ == '__main__':
    create_home_cloudfront()
