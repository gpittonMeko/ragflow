#!/bin/bash
##
# Script per installare il monitor auto-shutdown come servizio systemd
#

set -e

echo "🚀 Installazione SGAI Auto-Shutdown Monitor..."

# 1. Copia lo script Python
echo "📋 Copiando script Python..."
sudo cp auto_shutdown_monitor.py /home/ubuntu/workspace/ragflow/
sudo chmod +x /home/ubuntu/workspace/ragflow/auto_shutdown_monitor.py
sudo chown ubuntu:ubuntu /home/ubuntu/workspace/ragflow/auto_shutdown_monitor.py

# 2. Copia il file systemd service
echo "📋 Copiando systemd service..."
sudo cp sgai-auto-shutdown.service /etc/systemd/system/

# 3. Reload systemd
echo "🔄 Reload systemd..."
sudo systemctl daemon-reload

# 4–5. Abilita e avvia (persiste a ogni reboot)
echo "✅ Abilitazione permanente + avvio ora..."
sudo systemctl enable --now sgai-auto-shutdown.service

# 6. Verifica status
echo ""
echo "="*60
echo "✅ INSTALLAZIONE COMPLETATA!"
echo "="*60
echo ""
echo "📊 Status del servizio:"
sudo systemctl status sgai-auto-shutdown.service --no-pager

echo ""
echo "📝 Comandi utili:"
echo "   sudo systemctl status sgai-auto-shutdown   # Verifica status"
echo "   sudo systemctl stop sgai-auto-shutdown     # Ferma monitor"
echo "   sudo systemctl start sgai-auto-shutdown    # Avvia monitor"
echo "   sudo journalctl -u sgai-auto-shutdown -f   # Visualizza log in tempo reale"
echo ""
echo "Verifica su questa macchina: systemctl is-active sgai-auto-shutdown.service (atteso: active)"
echo ""
