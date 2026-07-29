#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-/opt/ragflow}"
VENV_DIR="${SGAI_SCRAPER_VENV:-/opt/sgai-scraper/venv}"

if [[ ! -f "$REPO_DIR/pyproject.toml" ]]; then
  echo "Repository non trovata in $REPO_DIR" >&2
  exit 2
fi

sudo useradd --system --home /var/lib/sgai-scraper --shell /usr/sbin/nologin sgai-scraper 2>/dev/null || true
sudo install -d -o sgai-scraper -g sgai-scraper -m 0750 \
  /var/lib/sgai-scraper /var/lib/sgai-scraper/spool /var/lib/sgai-scraper/tmp \
  /var/lib/sgai-scraper/chromium-profile /run/sgai-scraper /etc/sgai-scraper \
  "$(dirname "$VENV_DIR")"

sudo apt-get update
sudo apt-get install -y python3 python3-venv
sudo python3 -m venv "$VENV_DIR"
sudo "$VENV_DIR/bin/pip" install --upgrade pip
sudo "$VENV_DIR/bin/pip" install requests playwright pypdf
sudo "$VENV_DIR/bin/playwright" install-deps chromium
sudo install -d -o sgai-scraper -g sgai-scraper -m 0750 \
  /opt/sgai-scraper/ms-playwright
sudo -u sgai-scraper env \
  PLAYWRIGHT_BROWSERS_PATH=/opt/sgai-scraper/ms-playwright \
  "$VENV_DIR/bin/playwright" install chromium

sudo cp "$REPO_DIR/deploy/sgai-scraper/sgai-scraper.service" /etc/systemd/system/
if [[ ! -f /etc/sgai-scraper/sgai-scraper.env ]]; then
  sudo cp "$REPO_DIR/deploy/sgai-scraper/sgai-scraper.env.example" \
    /etc/sgai-scraper/sgai-scraper.env
fi
sudo chown root:sgai-scraper /etc/sgai-scraper/sgai-scraper.env
sudo chmod 0640 /etc/sgai-scraper/sgai-scraper.env
sudo chown -R sgai-scraper:sgai-scraper /var/lib/sgai-scraper /run/sgai-scraper
sudo systemctl daemon-reload

echo "Compilare /etc/sgai-scraper/sgai-scraper.env, poi:"
echo "  sudo systemctl enable --now sgai-scraper"
