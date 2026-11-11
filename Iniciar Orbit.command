#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf "Instale o Node.js 22 ou superior: https://nodejs.org\n"
  exit 1
fi
exec node server.mjs --open
