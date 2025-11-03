import boto3
import json

cf = boto3.client('cloudfront')

# Get CloudFront distribution
dist_id = 'E1319KD0MXJ871'
response = cf.get_distribution_config(Id=dist_id)
config = response['DistributionConfig']
etag = response['ETag']

print(f"🔧 Fixing CloudFront {dist_id}...")

# Fix origin: ensure CustomHeaders exists
if 'CustomHeaders' not in config['Origins']['Items'][0]:
    config['Origins']['Items'][0]['CustomHeaders'] = {'Quantity': 0}
    print("✅ Aggiunto CustomHeaders vuoto")

# Set default cache behavior to NOT forward Host header
if 'ForwardedValues' not in config['DefaultCacheBehavior']:
    config['DefaultCacheBehavior']['ForwardedValues'] = {
        'QueryString': False,
        'Cookies': {'Forward': 'none'}
    }

# Don't forward Host header!
config['DefaultCacheBehavior']['ForwardedValues']['Headers'] = {
    'Quantity': 0
}

print("📤 Aggiornamento CloudFront...")
update_response = cf.update_distribution(
    Id=dist_id,
    DistributionConfig=config,
    IfMatch=etag
)

print(f"✅ CloudFront aggiornato!")
print(f"Status: {update_response['Distribution']['Status']}")
print(f"\n⏳ Aspetta 2-3 minuti per il deployment...")
print(f"🌐 Poi testa: http://home.sgailegal.com")

