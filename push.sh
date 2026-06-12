#!/bin/bash
set -e

cd /home/runner/workspace

git add -A
git commit -m "${1:-Guncelleme: $(date '+%Y-%m-%d %H:%M')}" || echo "Degisiklik yok, push atlanıyor"
git push origin main

echo ""
echo "Gonderildi!"
echo "Simdi GitHub Actions'ta Run workflow bas:"
echo "https://github.com/alkanhaz-hash/spektrum/actions/workflows/eas-build.yml"
