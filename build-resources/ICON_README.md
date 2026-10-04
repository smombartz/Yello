# App Icon

`icon.svg` is the source: the favicon mark (`frontend/public/favicon.svg`) on Apple's macOS icon grid, an 824px rounded square with a 100px margin inside a 1024px canvas.

```bash
./build-resources/make-icon.sh   # needs librsvg: brew install librsvg
```

The script renders every size directly from the SVG and writes:

- `icon.icns`: picked up automatically by electron-builder (`directories.buildResources`) for the app bundle and the dmg
- `icon.png` (1024px): the Dock icon when running `npm run dev`, since an unpackaged app would otherwise show Electron's icon

Both outputs are committed. After changing `icon.svg`, re-run the script and rebuild the app.
