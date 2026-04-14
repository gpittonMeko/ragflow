#!/usr/bin/env bash
# Esegui SULLA EC2 (dove c’è il clone git), dalla shell ubuntu.
# Uso:
#   chmod +x scripts/build-web-on-server.sh
#   ./scripts/build-web-on-server.sh                    # ramo corrente
#   ./scripts/build-web-on-server.sh /path/to/ragflow main
#
set -euo pipefail

REPO_ROOT="${1:-${HOME}/workspace/ragflow}"
BRANCH="${2:-}"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERRORE: non è un repo git: $REPO_ROOT" >&2
  exit 1
fi

cd "$REPO_ROOT"
echo "=== Repo: $(pwd) ==="
git status -sb
git fetch origin

if [[ -n "$BRANCH" ]]; then
  echo "=== Checkout $BRANCH ==="
  git checkout "$BRANCH"
fi

echo "=== Pull ==="
git pull --ff-only

echo "=== Build web (npm) ==="
cd "$REPO_ROOT/web"
# Override: NODE_OPTIONS=... ./scripts/build-web-on-server.sh
: "${NODE_OPTIONS:=--max-old-space-size=8192}"
export NODE_OPTIONS
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

test -f dist/index.html
echo "=== OK: dist pronto in $REPO_ROOT/web/dist (nginx/container lo vedono se web è montato) ==="
