#!/usr/bin/env python3
"""
Crea CloudFront distribution per home.sgailegal.com
"""
import boto3
import time

cf = boto3.client('cloudfront', region_name='us-east-1')

config = {
    'CallerReference': f'home-sgai-{int(time.time())}',
    'Aliases': {
        'Quantity': 1,
        'Items': ['home.sgailegal.com']
    },
    'DefaultRootObject': 'index.html',
    'Origins': {
        'Quantity': 1,
        'Items': [{
            'Id': 'sgai-home-s3',
            'DomainName': 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com',
            'CustomOriginConfig': {
                'HTTPPort': 80,
                'HTTPSPort': 443,
                'OriginProtocolPolicy': 'http-only'
            }
        }]
    },
    'DefaultCacheBehavior': {
        'TargetOriginId': 'sgai-home-s3',
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
        'MinTTL': 0,
        'DefaultTTL': 300,
        'MaxTTL': 3600
    },
    'Comment': 'SGAI Home Page - Always Available',
    'Enabled': True,
    'ViewerCertificate': {
        'ACMCertificateArn': 'arn:aws:acm:us-east-1:940482440561:certificate/e38ed1fa-f1e5-40dc-858a-6dac65c6e3a9',
        'SSLSupportMethod': 'sni-only',
        'MinimumProtocolVersion': 'TLSv1.2_2021',
        'Certificate': 'arn:aws:acm:us-east-1:940482440561:certificate/e38ed1fa-f1e5-40dc-858a-6dac65c6e3a9',
        'CertificateSource': 'acm'
    },
    'HttpVersion': 'http2and3',
    'PriceClass': 'PriceClass_100'
}

print("🚀 Creazione CloudFront per home.sgailegal.com...")
response = cf.create_distribution(DistributionConfig=config)

dist_id = response['Distribution']['Id']
domain = response['Distribution']['DomainName']

print(f"\n✅ CloudFront creato!")
print(f"   ID: {dist_id}")
print(f"   Domain: {domain}")
print(f"\n📝 AGGIORNA DNS:")
print(f"   home.sgailegal.com CNAME {domain}")

