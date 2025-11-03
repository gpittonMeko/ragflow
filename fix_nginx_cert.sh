#!/bin/bash
# Fix nginx per accettare app.sgailegal.com con certificato esistente

echo "🔧 Aggiungo app.sgailegal.com a nginx..."

# Modifica configurazione dentro il container
docker exec ragflow-server bash -c "
  sed -i 's/server_name sgailegal.com sgailegal.it www.sgailegal.com www.sgailegal.it;/server_name sgailegal.com sgailegal.it www.sgailegal.com www.sgailegal.it app.sgailegal.com;/g' /etc/nginx/conf.d/*.conf
  nginx -t
  nginx -s reload
"

echo "✅ Nginx aggiornato! app.sgailegal.com ora accettato!"

