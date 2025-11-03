#!/usr/bin/env python3
"""
Crea EC2 t2.micro per home.sgailegal.com con Nginx
"""
import boto3
import time

def create_home_ec2():
    ec2 = boto3.client('ec2', region_name='eu-north-1')
    
    print("Creo EC2 t2.micro per home.sgailegal.com...")
    
    # User data per installare Nginx e configurare la pagina
    user_data = """#!/bin/bash
set -e

# Update e installa Nginx
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# Scarica la pagina home da S3
aws s3 cp s3://sgai-offline-page/index.html /var/www/html/index.html

# Configura Nginx per home.sgailegal.com
cat > /etc/nginx/sites-available/home << 'NGINXEOF'
server {
    listen 80;
    server_name home.sgailegal.com;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # Cache per risorse statiche
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

# Abilita il sito
ln -sf /etc/nginx/sites-available/home /etc/nginx/sites-enabled/home
rm -f /etc/nginx/sites-enabled/default

# Testa e riavvia Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo "Nginx configurato e avviato!"
"""
    
    try:
        # Crea istanza
        response = ec2.run_instances(
            ImageId='ami-089146c5626baa6bf',  # Ubuntu 22.04 LTS eu-north-1
            InstanceType='t3.micro',
            KeyName='LLM_14',
            MinCount=1,
            MaxCount=1,
            SecurityGroupIds=['sg-0cab355f388fd3059'],  # Default VPC security group
            UserData=user_data,
            TagSpecifications=[
                {
                    'ResourceType': 'instance',
                    'Tags': [
                        {'Key': 'Name', 'Value': 'sgai-home-page'},
                        {'Key': 'Purpose', 'Value': 'home.sgailegal.com'}
                    ]
                }
            ]
        )
        
        instance_id = response['Instances'][0]['InstanceId']
        print(f"EC2 creata: {instance_id}")
        print("Attendo IP pubblico...")
        
        # Attendi che l'istanza sia running
        waiter = ec2.get_waiter('instance_running')
        waiter.wait(InstanceIds=[instance_id])
        
        # Ottieni IP pubblico
        instances = ec2.describe_instances(InstanceIds=[instance_id])
        public_ip = instances['Reservations'][0]['Instances'][0]['PublicIpAddress']
        
        print(f"\nEC2 PRONTA!")
        print(f"IP Pubblico: {public_ip}")
        print(f"\nCONFIGURA DNS SU REGISTER.IT:")
        print(f"   home.sgailegal.com -> A record -> {public_ip}")
        print(f"\nAttendi 2-3 minuti per installazione Nginx...")
        print(f"\nPOI ESEGUI SSL:")
        print(f"   ssh -i LLM_14.pem ubuntu@{public_ip}")
        print(f"   sudo certbot --nginx -d home.sgailegal.com")
        
        return instance_id, public_ip
        
    except Exception as e:
        print(f"Errore: {e}")
        return None, None

if __name__ == '__main__':
    create_home_ec2()

