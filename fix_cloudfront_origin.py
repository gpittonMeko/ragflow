#!/usr/bin/env python3
"""
Fix CloudFront origin per usare app.sgailegal.com invece di sgailegal.com
per evitare loop DNS
"""
import boto3

cf = boto3.client('cloudfront', region_name='eu-north-1')

# Get current config
dist_id = 'EV1L2NZ6QXAWE'
response = cf.get_distribution_config(Id=dist_id)
config = response['DistributionConfig']
etag = response['ETag']

print(f"Current primary origin: {config['Origins']['Items'][0]['DomainName']}")

# Change primary origin to use app subdomain
config['Origins']['Items'][0]['DomainName'] = 'app.sgailegal.com'
config['Origins']['Items'][0]['CustomHeaders']['Items'][0]['HeaderValue'] = 'app.sgailegal.com'

print(f"New primary origin: {config['Origins']['Items'][0]['DomainName']}")

# Update distribution
update_response = cf.update_distribution(
    Id=dist_id,
    DistributionConfig=config,
    IfMatch=etag
)

print(f"✅ CloudFront origin updated successfully!")
print(f"Status: {update_response['Distribution']['Status']}")
print(f"Primary origin: {update_response['Distribution']['DistributionConfig']['Origins']['Items'][0]['DomainName']}")

print("\n" + "="*60)
print("📝 ADESSO SU REGISTER.IT:")
print("="*60)
print("\n✅ AGGIUNGI questo record DNS:")
print("   Nome: app.sgailegal.com.")
print("   TTL: 900")
print("   Tipo: A")
print("   Valore: 13.49.16.179")
print("\n" + "="*60)
