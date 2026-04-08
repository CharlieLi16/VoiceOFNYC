#!/usr/bin/env bash
# Firebase：仅部署 vote Cloud Functions。用法：直接执行，或 ~/.bashrc 里：
#   alias deploy-vote-fn='/path/to/CSSA-voiceOfNYC/console/scripts/deploy-vote-functions.sh'
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/firebase-vote"
exec npx firebase-tools@latest deploy --only functions "$@"
