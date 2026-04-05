#!/usr/bin/env bash
# Console Vite 前端（默认 5173）。用法：直接执行，或 ~/.bashrc 里 alias 指向本脚本。
# 首次请先在本目录执行：npm install
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"
exec npm run dev
