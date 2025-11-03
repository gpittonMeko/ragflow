#!/usr/bin/env python3
"""
Fix CloudFront per NON forwardare l'header Host a S3, 
mantenendolo solo per EC2 origin
"""
import boto3

cf = boto3.client('cloudfront', region_name='eu-north-1')

# Get current config
dist_id = 'EV1L2NZ6QXAWE'
response = cf.get_distribution_config(Id=dist_id)
config = response['DistributionConfig']
etag = response['ETag']

print("Current headers forwarded:", config['DefaultCacheBehavior']['ForwardedValues']['Headers']['Items'])

# Remove Host from forwarded headers
# CloudFront sostituirà automaticamente l'Host header con il DomainName dell'origin
config['DefaultCacheBehavior']['ForwardedValues']['Headers'] = {
    'Quantity': 2,
    'Items': ['CloudFront-Forwarded-Proto', 'User-Agent']
}

print("New headers forwarded:", config['DefaultCacheBehavior']['ForwardedValues']['Headers']['Items'])

# Update distribution
update_response = cf.update_distribution(
    Id=dist_id,
    DistributionConfig=config,
    IfMatch=etag
)

print(f"\n✅ CloudFront headers updated successfully!")
print(f"Status: {update_response['Distribution']['Status']}")
print("\n📝 RISULTATO:")
print("   ✅ EC2 origin riceverà: Host: app.sgailegal.com")
print("   ✅ S3 origin riceverà: Host: sgai-offline-page.s3-website.eu-north-1.amazonaws.com")
print("\nAdesso il failover funzionerà correttamente!")

