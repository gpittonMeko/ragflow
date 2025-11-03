import boto3
import time

cf = boto3.client('cloudfront')

print("🗑️  STEP 1: Elimino distribuzione vecchia...")

# Get old distribution
old_id = 'E1319KD0MXJ871'
response = cf.get_distribution_config(Id=old_id)
config = response['DistributionConfig']
etag = response['ETag']

# Disable it
config['Enabled'] = False
cf.update_distribution(Id=old_id, DistributionConfig=config, IfMatch=etag)
print(f"✅ Distribuzione {old_id} disabilitata")

print("⏳ Attendo 2 minuti per propagazione...")
time.sleep(120)

# Delete it
response = cf.get_distribution_config(Id=old_id)
etag = response['ETag']
try:
    cf.delete_distribution(Id=old_id, IfMatch=etag)
    print(f"✅ Distribuzione {old_id} eliminata!")
except Exception as e:
    print(f"⚠️ Errore eliminazione (ignorato): {e}")
    print("Procedo comunque con creazione nuova...")

print("\n🚀 STEP 2: Creo NUOVA distribuzione CORRETTA...")

# NEW distribution with CORRECT config for S3 website endpoint
config = {
    'CallerReference': f's3-website-{int(time.time())}',
    'DefaultRootObject': 'index.html',
    'Origins': {
        'Quantity': 1,
        'Items': [{
            'Id': 's3-home',
            'DomainName': 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com',
            # S3 website endpoint MUST use CustomOriginConfig with http-only
            'CustomOriginConfig': {
                'HTTPPort': 80,
                'HTTPSPort': 443,
                'OriginProtocolPolicy': 'http-only',  # S3 website is HTTP only!
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
        'ViewerProtocolPolicy': 'redirect-to-https',  # Force HTTPS for users
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
            'Headers': {'Quantity': 0}  # Don't forward Host header!
        },
        'MinTTL': 0,
        'DefaultTTL': 60,
        'MaxTTL': 300,
        'TrustedSigners': {'Enabled': False, 'Quantity': 0},
        'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0},
        'SmoothStreaming': False,
        'Compress': True,
        'LambdaFunctionAssociations': {'Quantity': 0},
        'FunctionAssociations': {'Quantity': 0},
        'FieldLevelEncryptionId': ''
    },
    'Comment': 'SGAI Home - S3 Website',
    'Enabled': True,
    'ViewerCertificate': {'CloudFrontDefaultCertificate': True},
    'HttpVersion': 'http2',
    'IsIPV6Enabled': True,
    'PriceClass': 'PriceClass_100'
}

r = cf.create_distribution(DistributionConfig=config)
new_domain = r['Distribution']['DomainName']
new_id = r['Distribution']['Id']

print(f"\n✅ NUOVA DISTRIBUZIONE CREATA!")
print(f"📍 Domain: {new_domain}")
print(f"🆔 ID: {new_id}")
print(f"\n📝 AGGIORNA Register.it:")
print(f"   home.sgailegal.com → CNAME → {new_domain}")
print(f"\n⏳ Aspetta 2-3 minuti per deployment...")
print(f"🧪 Testa prima: https://{new_domain}")
print(f"🌐 Poi: https://home.sgailegal.com")

