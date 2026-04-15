#!/usr/bin/env bash
# Generate conf/private.pem and conf/public.pem for RAGFlow password encryption.
# The PEM passphrase must stay "Welcome" (see api/utils/__init__.py decrypt / api/utils/t_crypt.py crypt).
#
# WARNING: Regenerating replaces existing keys. If the database already stores
# RSA-encrypted secrets with the old key, decrypting them will fail until you
# re-enter those values in the UI or restore the previous key pair.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/conf"
mkdir -p "$CONF"
cd "$CONF"
if [[ -f private.pem || -f public.pem ]]; then
  echo "conf/private.pem or conf/public.pem already exists. Remove them first to regenerate." >&2
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate PEM files." >&2
  exit 1
fi
openssl genrsa -des3 -passout pass:Welcome -out private.pem 2048
chmod 600 private.pem
openssl rsa -in private.pem -passin pass:Welcome -pubout -out public.pem
chmod 644 public.pem
echo "Created $CONF/private.pem and $CONF/public.pem"
