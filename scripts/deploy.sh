#!/usr/bin/env bash
# Build dist/ and zip a Chrome Web Store / sideload package.
# Zip root contains manifest.json (required by Chrome).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="$(python3 -c "import json; print(json.load(open('manifest.json')).get('name','YTAF'))" | tr -cd 'A-Za-z0-9._-')"
OUT_DIR="$ROOT/releases"
# Unversioned artifact — CI overwrites the rolling GitHub Release with this file
ZIP_NAME="${NAME}.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

echo "==> bundling dist/"
./scripts/bundle.sh

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

# Staging dir so the zip has a clean root (no parent folder wrapper issues)
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ytaf-deploy.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# Runtime files only — what the manifest loads
cp "$ROOT/manifest.json" "$STAGE/"

mkdir -p "$STAGE/dist" "$STAGE/icons" "$STAGE/rules" "$STAGE/src/popup" "$STAGE/src/shared"

cp "$ROOT"/dist/main.js \
   "$ROOT"/dist/isolated-bridge.js \
   "$ROOT"/dist/isolated-fallback.js \
   "$ROOT"/dist/service-worker.js \
   "$ROOT"/dist/fallback.css \
   "$STAGE/dist/"

cp "$ROOT"/icons/icon-16.png \
   "$ROOT"/icons/icon-32.png \
   "$ROOT"/icons/icon-48.png \
   "$ROOT"/icons/icon-128.png \
   "$STAGE/icons/"

cp "$ROOT"/rules/ad_network.json "$STAGE/rules/"

# Popup is loaded from src/ (not bundled into dist)
cp "$ROOT"/src/popup/popup.html \
   "$ROOT"/src/popup/popup.css \
   "$ROOT"/src/popup/popup.js \
   "$STAGE/src/popup/"

cp "$ROOT"/src/shared/ns.js \
   "$ROOT"/src/shared/constants.js \
   "$STAGE/src/shared/"

# Zip from stage so entries are relative (manifest.json at archive root)
(
  cd "$STAGE"
  zip -r -q "$ZIP_PATH" .
)

BYTES="$(wc -c <"$ZIP_PATH" | tr -d ' ')"
echo "==> wrote $ZIP_PATH ($BYTES bytes)"
echo "==> contents:"
unzip -l "$ZIP_PATH" | sed -n '1,40p'
