#!/usr/bin/env bash
# Console Python API（8765）。用法：直接执行，或 ~/.bashrc 里 alias 指向本脚本。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate
elif [[ -f venv/bin/activate ]]; then
  # shellcheck source=/dev/null
  source venv/bin/activate
fi
exec python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
