#!/bin/bash

# Om Desktop - Fast Local Build Script
# Builds unsigned DMG for local testing (skips code signing and notarization)
# This is MUCH faster than production builds and suitable for testing UI changes

# Change to the om-desktop directory (script's parent dir)
cd "$(dirname "$0")/.." || exit 1

echo "🚀 Fast local build (no code signing or notarization)..."
echo ""

# Verify FFmpeg binaries exist
echo "🔍 Verifying FFmpeg binaries..."
if [ ! -f resources/bin/ffmpeg-arm64 ] || [ ! -f resources/bin/ffmpeg-x86_64 ]; then
  echo "❌ ERROR: FFmpeg binaries are missing!"
  echo ""
  echo "Please download FFmpeg binaries first:"
  echo "  cd resources/bin"
  echo ""
  echo "  # ARM64 (Apple Silicon)"
  echo "  curl -L 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip' -o ffmpeg-arm64.zip"
  echo "  unzip ffmpeg-arm64.zip && mv ffmpeg ffmpeg-arm64 && rm ffmpeg-arm64.zip"
  echo ""
  echo "  # x86_64 (Intel)"
  echo "  curl -L 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip' -o ffmpeg-x86_64.zip"
  echo "  unzip ffmpeg-x86_64.zip && mv ffmpeg ffmpeg-x86_64 && rm ffmpeg-x86_64.zip"
  echo ""
  echo "  chmod +x ffmpeg-*"
  echo ""
  echo "See resources/bin/README.md for more details."
  exit 1
fi

echo "✅ FFmpeg binaries verified"
echo ""

# Build Vite project
echo "🏗️  Building Vite project..."
npm run build || {
  echo "❌ ERROR: Vite build failed!"
  exit 1
}

echo ""
echo "🏗️  Building unsigned DMG for local testing..."

# Disable code signing by setting CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Build for current architecture only (much faster)
# Use --dir to skip ZIP creation (only needed for auto-updates)
CURRENT_ARCH=$(uname -m)
if [ "$CURRENT_ARCH" = "arm64" ]; then
  echo "📦 Building arm64 (Apple Silicon) - unsigned (no ZIP)..."
  npx electron-builder --mac --arm64 --dir --publish never || {
    echo "❌ ERROR: electron-builder failed!"
    exit 1
  }
elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  echo "📦 Building x64 (Intel) - unsigned (no ZIP)..."
  npx electron-builder --mac --x64 --dir --publish never || {
    echo "❌ ERROR: electron-builder failed!"
    exit 1
  }
else
  echo "❌ ERROR: Unknown architecture: $CURRENT_ARCH"
  exit 1
fi

echo ""
echo "🎨 Creating DMG with appdmg for proper Applications folder icon..."
./scripts/build-dmg.sh || {
  echo "❌ ERROR: DMG creation failed!"
  exit 1
}

echo ""
echo "✅ Build complete!"
echo "📦 Unsigned DMG created in dist/"
echo ""
echo "⚠️  Note: This build is NOT signed or notarized."
echo "    - Use for local testing only"
echo "    - macOS will warn about unverified developer"
echo "    - Right-click → Open to bypass Gatekeeper"
echo ""
echo "🚀 To test updates with both architectures:"
echo "    npm run build:local:all"
echo ""
