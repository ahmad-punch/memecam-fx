#!/usr/bin/env bash
# Builds dist/memecam-fx-<version>.zip: just the files Chrome needs, nothing
# from dev/, scripts/, docs/ or git. Coworkers unzip it and "Load unpacked".
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/validate-packs.mjs >/dev/null || { node scripts/validate-packs.mjs; exit 1; }

version=$(node -p "require('./manifest.json').version")
name="memecam-fx"
out="dist/${name}-${version}.zip"
stage="dist/${name}"

rm -rf "$stage" "$out"
mkdir -p "$stage"
cp manifest.json content.js page-hook.js "$stage/"
cp -R engine popup preview packs icons lib models "$stage/"
find "$stage" -name '.DS_Store' -delete

(cd dist && zip -qr "$(basename "$out")" "$name")
rm -rf "$stage"
echo "Built $out ($(du -h "$out" | cut -f1))"
