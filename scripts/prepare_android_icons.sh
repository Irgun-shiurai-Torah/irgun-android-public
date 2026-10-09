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
mkdir -p assets "$RES/drawable-nodpi" "$RES/mipmap-anydpi-v26"

# Preserve the approved 1024px artwork without an intermediate downsample.
# This padding keeps the scroll tips inside Android's adaptive safe circle,
# while making the logo larger than the previous 820px preparation.
"${IMG[@]}" "$MASTER" -alpha off -depth 8 assets/icon-only.png
"${IMG[@]}" "$MASTER" -gravity center -background none -extent 1080x1080 -depth 8 assets/icon-foreground.png
"${IMG[@]}" -size 1080x1080 canvas:"$NAVY" -depth 8 assets/icon-background.png

# Launchers can display icons larger than the standard density templates.
# Keep the adaptive foreground at full resolution and let Android rasterize
# it once at the actual display size.
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

for name in ic_launcher ic_launcher_round; do
  cat > "$RES/mipmap-anydpi-v26/$name.xml" <<'ICON_XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@drawable/irgun_launcher_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
ICON_XML
done

# Do not run @capacitor/assets afterwards: its custom-foreground generator
# uses legacy 48dp templates for adaptive icons and overwrites these resources.
echo "Android launcher icons prepared from the full-resolution approved artwork."

