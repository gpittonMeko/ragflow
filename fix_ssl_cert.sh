#!/bin/bash
docker exec ragflow-server bash -c "
  sed -i 's|/etc/letsencrypt/live/sgailegal.com/|/etc/letsencrypt/live/app.sgailegal.com/|g' /etc/nginx/conf.d/ragflow.conf
  nginx -t
  nginx -s reload
"
echo "✅ Certificato SSL aggiornato per app.sgailegal.com!"

