#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-/opt/ragflow}"
BRANCH="${SGAI_SCRAPER_BRANCH:-main}"

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

sudo systemctl stop sgai-scraper
sudo cp deploy/sgai-scraper/sgai-scraper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start sgai-scraper
sudo systemctl --no-pager --full status sgai-scraper
