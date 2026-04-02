#!/bin/bash
# Convert icon.png to icon.icns for macOS

set -e

ASSETS_DIR="$(dirname "$0")/../assets"
ICON_PNG="$ASSETS_DIR/icon.png"
ICONSET_DIR="$ASSETS_DIR/icon.iconset"
ICON_ICNS="$ASSETS_DIR/icon.icns"

# Check if icon.png exists
if [ ! -f "$ICON_PNG" ]; then
  echo "Error: icon.png not found. Run 'node scripts/generate-icon.js' first."
  exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Generate all required sizes for macOS iconset
sips -z 16 16     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null
sips -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null
sips -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null
sips -z 64 64     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null
sips -z 128 128   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null
sips -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null
sips -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null
sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null

# Convert iconset to icns
iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

echo "✓ Generated icon.icns"
echo "Icon ready at: $ICON_ICNS"
