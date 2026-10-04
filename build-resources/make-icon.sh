#!/bin/sh
# Regenerate the macOS app icon (icon.icns, plus icon.png for the dev Dock icon)
# from icon.svg. Needs librsvg: brew install librsvg
set -e
cd "$(dirname "$0")"

rm -rf icon.iconset
mkdir icon.iconset
for size in 16 32 128 256 512; do
  rsvg-convert -w "$size" -h "$size" icon.svg -o "icon.iconset/icon_${size}x${size}.png"
  rsvg-convert -w $((size * 2)) -h $((size * 2)) icon.svg -o "icon.iconset/icon_${size}x${size}@2x.png"
done
cp icon.iconset/icon_512x512@2x.png icon.png

iconutil -c icns -o icon.icns icon.iconset
rm -rf icon.iconset
echo "Wrote build-resources/icon.icns and icon.png"
