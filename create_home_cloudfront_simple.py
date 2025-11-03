import boto3
import time

cf = boto3.client('cloudfront')

config = {
    'CallerReference': f'home-simple-{int(time.time())}',
    'DefaultRootObject': 'index.html',
    'Origins': {
        'Quantity': 1,
        'Items': [{
            'Id': 'home-s3',
            'DomainName': 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com',
            'CustomOriginConfig': {
                'HTTPPort': 80,
                'HTTPSPort': 443,
                'OriginProtocolPolicy': 'http-only'
            }
        }]
    },
    'DefaultCacheBehavior': {
        'TargetOriginId': 'home-s3',
        'ViewerProtocolPolicy': 'allow-all',
        'AllowedMethods': {'Quantity': 2, 'Items': ['GET', 'HEAD']},
        'Compress': True,
        'ForwardedValues': {
            'QueryString': False,
            'Cookies': {'Forward': 'none'}
        },
        'MinTTL': 0,
        'DefaultTTL': 60,
        'MaxTTL': 300
    },
    'Comment': 'SGAI Home - Always Available',
    'Enabled': True,
    'ViewerCertificate': {'CloudFrontDefaultCertificate': True},
    'HttpVersion': 'http2',
    'PriceClass': 'PriceClass_100'
}

print("🚀 Creazione CloudFront per home.sgailegal.com...")
r = cf.create_distribution(DistributionConfig=config)
domain = r['Distribution']['DomainName']
print(f"\n✅ CloudFront creato!")
print(f"Domain: {domain}")
print(f"\n📝 Su Register.it, CAMBIA home.sgailegal.com:")
print(f"   Da: CNAME sgai-offline-page.s3-website...")
print(f"   A:  CNAME {domain}")
print(f"\n✅ Poi home.sgailegal.com funzionerà!")
print(f"   (HTTP per ora, HTTPS quando certificato si valida)")

