#!/usr/bin/env python3
"""
Fix CloudFront S3 origin per usare il bucket corretto indipendentemente dall'Host header
"""
import boto3

cf = boto3.client('cloudfront', region_name='eu-north-1')

# Get current config
dist_id = 'EV1L2NZ6QXAWE'
response = cf.get_distribution_config(Id=dist_id)
config = response['DistributionConfig']
etag = response['ETag']

print(f"Current S3 origin: {config['Origins']['Items'][1]['DomainName']}")

# Aggiungi Custom Headers all'origin S3 per sovrascrivere l'Host header
s3_origin = config['Origins']['Items'][1]

# Usa il domain corretto per S3 website hosting
s3_origin['DomainName'] = 'sgai-offline-page.s3-website.eu-north-1.amazonaws.com'

# Aggiungi header Host custom per forzare il bucket corretto
s3_origin['CustomHeaders'] = {
    'Quantity': 0  # Non serve header custom per S3 website endpoint
}

print(f"New S3 origin: {s3_origin['DomainName']}")

# Update distribution
update_response = cf.update_distribution(
    Id=dist_id,
    DistributionConfig=config,
    IfMatch=etag
)

print(f"\n✅ CloudFront S3 origin updated successfully!")
print(f"Status: {update_response['Distribution']['Status']}")
print(f"S3 origin: {update_response['Distribution']['DistributionConfig']['Origins']['Items'][1]['DomainName']}")

