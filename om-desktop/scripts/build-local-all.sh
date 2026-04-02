#!/bin/bash

# Om Desktop - Fast Local Build Script (All Architectures)
# Builds unsigned DMGs for both arm64 and x64 for testing auto-updates
# Skips code signing and notarization for faster builds

# Change to the om-desktop directory (script's parent dir)
cd "$(dirname "$0")/.." || exit 1

echo "🚀 Fast local build - both architectures (no code signing or notarization)..."
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
echo "🏗️  Building unsigned DMGs for both architectures..."

# Disable code signing by setting CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Build both architectures in a single command
# This ensures latest-mac.yml includes both arm64 and x64 for proper auto-updates
echo ""
echo "📦 Building arm64 (Apple Silicon) and x64 (Intel) .app bundles - unsigned..."
npx electron-builder --mac --arm64 --x64 --publish never || {
  echo "❌ ERROR: electron-builder failed!"
  exit 1
}

echo ""
echo "🎨 Creating DMGs with appdmg for proper Applications folder icons..."

# Build DMG for arm64
ARCH=arm64 ./scripts/build-dmg.sh || {
  echo "❌ ERROR: arm64 DMG creation failed!"
  exit 1
}

# Build DMG for x64
ARCH=x86_64 ./scripts/build-dmg.sh || {
  echo "❌ ERROR: x64 DMG creation failed!"
  exit 1
}

echo ""
echo "✅ Build complete!"
echo "📦 Unsigned DMGs created:"
ls -lh dist/*.dmg 2>/dev/null | awk '{print "   - " $9 " (" $5 ")"}'
echo ""
echo "⚠️  Note: These builds are NOT signed or notarized."
echo "    - Use for local testing only"
echo "    - macOS will warn about unverified developer"
echo "    - Right-click → Open to bypass Gatekeeper"
echo ""
echo "📄 latest-mac.yml generated with both architectures:"
cat dist/latest-mac.yml
echo ""
