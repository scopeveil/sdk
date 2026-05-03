#!/usr/bin/env bash
# Empacota o SDK TypeScript (npm pack) e instala o tarball gerado no
# diretório passado como $1. É a forma mais fiel de "consumir o SDK como
# um cliente real" sem precisar publicar no npm.
#
# Uso:
#   scopeveil-sdk/scripts/pack-and-install-into.sh /path/to/consumer-app
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 <consumer-app-dir>" >&2
  exit 1
fi

CONSUMER="$(cd "$1" && pwd)"
SDK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_TS="$SDK_ROOT/packages/typescript"

cd "$SDK_TS"

if [ ! -d node_modules ]; then
  ( cd "$SDK_ROOT" && npm install --no-audit --no-fund )
fi
npm run build --silent

TARBALL="$(npm pack --silent | tail -n 1)"
TARBALL_PATH="$SDK_TS/$TARBALL"

cd "$CONSUMER"
npm install --no-audit --no-fund "$TARBALL_PATH"

rm -f "$TARBALL_PATH"

echo "✓ installed $TARBALL into $CONSUMER"
