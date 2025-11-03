import boto3
import time

cf = boto3.client('cloudfront')

# Delete old distribution
old_dist_id = 'E1319KD0MXJ871'
print(f"🗑️  Disabilitando vecchia distribuzione {old_dist_id}...")

# Get current config
response = cf.get_distribution_config(Id=old_dist_id)
config = response['DistributionConfig']
etag = response['ETag']

# Disable it
config['Enabled'] = False
cf.update_distribution(
    Id=old_dist_id,
    DistributionConfig=config,
    IfMatch=etag
)
print(f"✅ Distribuzione disabilitata. Aspetto 60s prima di cancellare...")
time.sleep(60)

# Delete it
response = cf.get_distribution_config(Id=old_dist_id)
etag = response['ETag']
cf.delete_distribution(Id=old_dist_id, IfMatch=etag)
print(f"✅ Vecchia distribuzione cancellata!")

# Create NEW distribution with CORRECT S3 origin
print(f"\n🚀 Creando NUOVA distribuzione con S3OriginConfig...")

config = {
    'CallerReference': f'home-s3-correct-{int(time.time())}',
    'DefaultRootObject': 'index.html',
    'Origins': {
        'Quantity': 1,
        'Items': [{
            'Id': 'home-s3-origin',
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
            'CustomHeaders': {'Quantity': 0}
        }]
    },
    'DefaultCacheBehavior': {
        'TargetOriginId': 'home-s3-origin',
        'ViewerProtocolPolicy': 'allow-all',
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
        'TrustedSigners': {
            'Enabled': False,
            'Quantity': 0
        }
    },
    'Comment': 'SGAI Home - S3 Website Endpoint',
    'Enabled': True,
    'ViewerCertificate': {'CloudFrontDefaultCertificate': True},
    'HttpVersion': 'http2',
    'PriceClass': 'PriceClass_100'
}

r = cf.create_distribution(DistributionConfig=config)
new_domain = r['Distribution']['DomainName']
new_id = r['Distribution']['Id']

print(f"\n✅ NUOVA distribuzione creata!")
print(f"Domain: {new_domain}")
print(f"ID: {new_id}")
print(f"\n📝 Su Register.it, CAMBIA home.sgailegal.com:")
print(f"   A: CNAME {new_domain}")
print(f"\n✅ Poi testa: http://{new_domain}")

