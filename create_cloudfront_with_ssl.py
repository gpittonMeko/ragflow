import boto3
import time
import sys

cf = boto3.client('cloudfront')
acm = boto3.client('acm', region_name='us-east-1')

cert_arn = 'arn:aws:acm:us-east-1:940482440561:certificate/b29cb36f-4563-463e-8d4a-0a6063de2949'

print("🔍 Controllo certificato...")
cert = acm.describe_certificate(CertificateArn=cert_arn)
status = cert['Certificate']['Status']
print(f"Status: {status}")

if status != 'ISSUED':
    print(f"⚠️ Certificato non ancora validato!")
    print(f"⏳ Aspetto che AWS validi il certificato...")
    print(f"(può richiedere fino a 10 minuti)")
    
    # Aspetto fino a 15 minuti
    for i in range(30):
        time.sleep(30)
        cert = acm.describe_certificate(CertificateArn=cert_arn)
        status = cert['Certificate']['Status']
        print(f"[{i+1}/30] Status: {status}")
        
        if status == 'ISSUED':
            print("✅ Certificato VALIDATO!")
            break
    else:
        print("❌ Timeout - certificato non validato in 15 minuti")
        sys.exit(1)

print("\n🚀 Creo CloudFront con HTTPS...")

config = {
    'CallerReference': f'home-ssl-{int(time.time())}',
    'Aliases': {
        'Quantity': 1,
        'Items': ['home.sgailegal.com']
    },
    'DefaultRootObject': 'index.html',
    'Origins': {
        'Quantity': 1,
        'Items': [{
            'Id': 's3-home',
            'DomainName': 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com',
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
        }]
    },
    'DefaultCacheBehavior': {
        'TargetOriginId': 's3-home',
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
            'Headers': {'Quantity': 0}
        },
        'MinTTL': 0,
        'DefaultTTL': 60,
        'MaxTTL': 300,
        'TrustedSigners': {'Enabled': False, 'Quantity': 0},
        'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0},
        'SmoothStreaming': False,
        'LambdaFunctionAssociations': {'Quantity': 0},
        'FunctionAssociations': {'Quantity': 0},
        'FieldLevelEncryptionId': ''
    },
    'Comment': 'SGAI Home - HTTPS',
    'Enabled': True,
    'ViewerCertificate': {
        'ACMCertificateArn': cert_arn,
        'SSLSupportMethod': 'sni-only',
        'MinimumProtocolVersion': 'TLSv1.2_2021',
        'Certificate': cert_arn,
        'CertificateSource': 'acm'
    },
    'HttpVersion': 'http2',
    'IsIPV6Enabled': True,
    'PriceClass': 'PriceClass_100'
}

r = cf.create_distribution(DistributionConfig=config)
domain = r['Distribution']['DomainName']
dist_id = r['Distribution']['Id']

print(f"\n✅ CLOUDFRONT CREATO CON HTTPS!")
print(f"📍 Domain: {domain}")
print(f"🆔 ID: {dist_id}")
print(f"\n📝 AGGIORNA Register.it:")
print(f"   home.sgailegal.com → CNAME → {domain}")
print(f"\n⏳ Aspetta 2-3 minuti deployment...")
print(f"🌐 Poi: https://home.sgailegal.com")

