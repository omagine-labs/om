#!/bin/bash

# Build DMG with appdmg for better Applications folder icon support
# This script runs after electron-builder creates the .app bundle

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Use ARCH from environment if set, otherwise detect
if [ -z "$ARCH" ]; then
  ARCH=$(uname -m)
fi

if [ "$ARCH" = "arm64" ]; then
  APP_PATH="dist/mac-arm64/Om.app"
  OUTPUT_DMG="dist/Om-${VERSION}-arm64.dmg"
else
  APP_PATH="dist/mac/Om.app"
  OUTPUT_DMG="dist/Om-${VERSION}-x64.dmg"
fi

echo "Building DMG with appdmg for better icon support..."
echo "App path: $APP_PATH"
echo "Output: $OUTPUT_DMG"

# Remove old DMG if it exists
rm -f "$OUTPUT_DMG"

# Update appdmg config with correct app path (use absolute paths)
cat > config/appdmg.temp.json <<EOF
{
  "title": "Om-$VERSION",
  "icon": "$PROJECT_ROOT/assets/om-installer.icns",
  "background": "$PROJECT_ROOT/assets/dmg-background.png",
  "format": "UDBZ",
  "icon-size": 80,
  "contents": [
    {
      "x": 173,
      "y": 240,
      "type": "file",
      "path": "$PROJECT_ROOT/$APP_PATH"
    },
    {
      "x": 487,
      "y": 240,
      "type": "link",
      "path": "/Applications"
    }
  ],
  "window": {
    "size": {
      "width": 658,
      "height": 498
    }
  }
}
EOF

# Build DMG
npx appdmg config/appdmg.temp.json "$OUTPUT_DMG"

# Clean up temp config
rm -f config/appdmg.temp.json

# Post-process: Set Applications folder icon explicitly
echo "Post-processing DMG to set Applications folder icon..."
MOUNT_POINT=$(hdiutil attach "$OUTPUT_DMG" -readwrite -noverify -nobrowse | grep "/Volumes/" | sed 's/.*\(\/Volumes\/.*\)/\1/')

if [ -n "$MOUNT_POINT" ]; then
  echo "Mounted at: $MOUNT_POINT"

  # Use Finder to copy the icon from the real Applications folder
  osascript <<EOF
    tell application "Finder"
      set appsFolder to POSIX file "/Applications" as alias
      set dmgApps to POSIX file "$MOUNT_POINT/Applications" as alias
      set icon of dmgApps to icon of appsFolder
    end tell
EOF

  # Give Finder time to process
  sleep 2

  # Detach
  hdiutil detach "$MOUNT_POINT" -quiet
  echo "✓ DMG post-processing complete"
fi

# Create unversioned copy
if [ "$ARCH" = "arm64" ]; then
  cp "$OUTPUT_DMG" "dist/Om-arm64.dmg"
else
  cp "$OUTPUT_DMG" "dist/Om-x64.dmg"
fi

echo "✓ DMG created successfully: $OUTPUT_DMG"
