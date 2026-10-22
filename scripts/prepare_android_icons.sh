#!/usr/bin/env bash
set -euo pipefail

MASTER="app-icon-v8-master.png"
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

NAVY="#0B2B49"
RES="android/app/src/main/res"
mkdir -p assets "$RES/drawable-nodpi" "$RES/mipmap-anydpi-v26" "$RES/mipmap-sw320dp-anydpi-v26"

# Use only the approved artwork. No redrawing, text replacement, or alternate logo.
# This padding keeps the scroll tips inside Android's adaptive safe circle.
"${IMG[@]}" "$MASTER" -alpha off -depth 8 assets/icon-only.png
"${IMG[@]}" "$MASTER" -gravity center -background none -extent 1080x1080 -depth 8 assets/icon-foreground.png
"${IMG[@]}" -size 1080x1080 canvas:"$NAVY" -depth 8 assets/icon-background.png

# Preserve the full-resolution foreground and let Android rasterize it at display size.
cp assets/icon-foreground.png "$RES/drawable-nodpi/irgun_launcher_foreground.png"

for entry in ldpi:36:81 mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r density legacy adaptive <<< "$entry"
  resource_dir="$RES/mipmap-$density"
  mkdir -p "$resource_dir"
  "${IMG[@]}" "$MASTER" -filter Lanczos -resize "${legacy}x${legacy}" -alpha off -depth 8 "$resource_dir/ic_launcher.png"
  center=$((legacy / 2))
  "${IMG[@]}" "$MASTER" -filter Lanczos -resize "${legacy}x${legacy}" \
    \( -size "${legacy}x${legacy}" canvas:none -fill white -draw "circle $center,$center $center,0" \) \
    -alpha off -compose CopyOpacity -composite -depth 8 "$resource_dir/ic_launcher_round.png"
  "${IMG[@]}" assets/icon-foreground.png -filter Lanczos -resize "${adaptive}x${adaptive}" -depth 8 "$resource_dir/ic_launcher_foreground.png"
  "${IMG[@]}" -size "${adaptive}x${adaptive}" canvas:"$NAVY" -depth 8 "$resource_dir/ic_launcher_background.png"
done

# Compact phones below 320dp smallest width get a modestly larger rendering
# of the exact same logo. The increase is deliberately limited to 9% inset
# to improve legibility while protecting the scroll ends from launcher masks.
for name in ic_launcher ic_launcher_round; do
  cat > "$RES/mipmap-anydpi-v26/$name.xml" <<'ICON_XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@drawable/irgun_launcher_foreground" android:inset="9%" />
    </foreground>
</adaptive-icon>
ICON_XML
done

# Regular phones and tablets (smallest width >= 320dp) keep the current sizing.
for name in ic_launcher ic_launcher_round; do
  cat > "$RES/mipmap-sw320dp-anydpi-v26/$name.xml" <<'ICON_XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@drawable/irgun_launcher_foreground" android:inset="12.5%" />
    </foreground>
</adaptive-icon>
ICON_XML
done

# Do not run @capacitor/assets afterwards: its custom-foreground generator
# uses legacy 48dp templates for adaptive icons and overwrites these resources.
echo "Android launcher icons prepared from the approved artwork, with a compact-screen size variant."
