# App Icon

## macOS Icon Setup

The build expects `icon.icns` in this directory for packaging.

### Creating the icon:

1. **Prepare a 1024x1024 PNG image** (e.g., `icon-1024.png`)
2. **Convert to .icns format** using macOS's `iconutil`:

```bash
# Create icon set directory structure
mkdir icon.iconset

# Generate icon files from 1024x1024 source
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
cp icon-1024.png icon.iconset/icon_512x512@2x.png

# Convert to .icns
iconutil -c icns -o icon.icns icon.iconset

# Clean up
rm -rf icon.iconset
```

3. **Place `icon.icns`** in this `build-resources/` directory
4. The build will automatically use it for the macOS app bundle

### For now:
A placeholder build will use the Electron default icon. Replace with actual icon before distribution.
