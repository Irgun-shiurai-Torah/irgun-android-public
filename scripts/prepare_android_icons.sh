#!/usr/bin/env bash
set -euo pipefail

MASTER="app-icon-v7-master.png"
if [ ! -f "$MASTER" ]; then
  echo "Missing selected app icon master: $MASTER" >&2
  exit 2
fi

if command -v magick >/dev/null 2>&1; then
  IMG=(magick)
elif command -v convert >/dev/null 2>&1; then
  IMG=(convert)
else
  echo "ImageMagick is required to prepare Android launcher icons." >&2
  exit 2
fi

mkdir -p assets
# Keep the complete selected artwork inside Android's adaptive-icon safe area.
# The matching gold background fills circle, squircle and rounded-square masks
# without cutting off the Torah scroll, globe, Hebrew lettering or English name.
"${IMG[@]}" "$MASTER" -resize 820x820 -gravity center -background "#F4D798" -extent 1024x1024 assets/icon-only.png
"${IMG[@]}" "$MASTER" -resize 820x820 -gravity center -background none -extent 1024x1024 assets/icon-foreground.png
"${IMG[@]}" -size 1024x1024 canvas:"#F4D798" assets/icon-background.png

identify assets/icon-only.png assets/icon-foreground.png assets/icon-background.png 2>/dev/null || true
