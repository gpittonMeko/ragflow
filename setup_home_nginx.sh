#!/bin/bash
set -e

echo "Installing Nginx and tools..."
sudo apt-get update
sudo apt-get install -y nginx awscli certbot python3-certbot-nginx

echo "Downloading home page from S3..."
sudo aws s3 cp s3://sgai-offline-page/index.html /var/www/html/index.html --region eu-north-1 --no-sign-request

echo "Configuring Nginx..."
sudo bash -c 'cat > /etc/nginx/sites-available/home <<EOF
server {
    listen 80;
    server_name home.sgailegal.com;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF'

sudo ln -sf /etc/nginx/sites-available/home /etc/nginx/sites-enabled/home
sudo rm -f /etc/nginx/sites-enabled/default

echo "Restarting Nginx..."
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "NGINX CONFIGURED!"
curl -I http://localhost

