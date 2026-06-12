#!/bin/bash
set -e

REPO="https://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@github.com/alkanhaz-hash/spektrum.git"

cd /home/runner/workspace

git add -A
git commit -m "${1:-Güncelleme: $(date '+%Y-%m-%d %H:%M')}" || echo "Değişiklik yok, push atlanıyor"
git push "$REPO" main

echo ""
echo "✅ GitHub'a gönderildi!"
echo "👉 Şimdi şu adresten 'Run workflow' bas:"
echo "   https://github.com/alkanhaz-hash/spektrum/actions/workflows/eas-build.yml"
