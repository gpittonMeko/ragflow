import boto3
import json

cf = boto3.client('cloudfront', region_name='eu-north-1')

# Get current config
dist_id = 'EV1L2NZ6QXAWE'
response = cf.get_distribution_config(Id=dist_id)
config = response['DistributionConfig']
etag = response['ETag']

print(f"Current aliases: {config.get('Aliases', {})}")

# Update aliases to include both domains
config['Aliases'] = {
    'Quantity': 2,
    'Items': ['sgailegal.com', 'www.sgailegal.com']
}

# Update SSL certificate to the newly validated one
config['ViewerCertificate'] = {
    'ACMCertificateArn': 'arn:aws:acm:us-east-1:940482440561:certificate/e38ed1fa-f1e5-40dc-858a-6dac65c6e3a9',
    'SSLSupportMethod': 'sni-only',
    'MinimumProtocolVersion': 'TLSv1.2_2021',
    'Certificate': 'arn:aws:acm:us-east-1:940482440561:certificate/e38ed1fa-f1e5-40dc-858a-6dac65c6e3a9',
    'CertificateSource': 'acm'
}

print(f"New aliases: {config['Aliases']}")
print(f"New certificate: {config['ViewerCertificate']['ACMCertificateArn']}")

# Update distribution
update_response = cf.update_distribution(
    Id=dist_id,
    DistributionConfig=config,
    IfMatch=etag
)

print(f"✅ CloudFront updated successfully!")
print(f"Status: {update_response['Distribution']['Status']}")
print(f"Domains: {update_response['Distribution']['DistributionConfig']['Aliases']['Items']}")


