#!/bin/bash

# Om Desktop - Production Build Script
# This builds a signed and notarized macOS DMG using electron-builder

# Change to the om-desktop directory (script's parent dir)
cd "$(dirname "$0")/.." || exit 1

# Load environment variables from .env
if [ -f .env ]; then
  # Use eval to handle quoted values with spaces
  while IFS= read -r line; do
    if [[ "$line" =~ ^APPLE_ ]]; then
      eval "export $line"
    fi
  done < .env
fi

# Verify required environment variables
if [ -z "$APPLE_IDENTITY" ] || [ -z "$APPLE_TEAM_ID" ] || [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
  echo "❌ Error: Missing required Apple Developer credentials in .env"
  echo "Please ensure the following are set:"
  echo "  - APPLE_IDENTITY"
  echo "  - APPLE_TEAM_ID"
  echo "  - APPLE_ID"
  echo "  - APPLE_APP_SPECIFIC_PASSWORD"
  exit 1
fi

echo "🔐 Building signed and notarized app..."
echo "Identity: $APPLE_IDENTITY"
echo "Team ID: $APPLE_TEAM_ID"
echo ""

# Clean previous builds to avoid uploading old versions
echo "🧹 Cleaning previous builds..."
rm -rf dist/*.dmg dist/*.zip dist/*.yml dist/*.blockmap dist/mac dist/mac-arm64 dist/mac-x64 dist/mac-universal 2>/dev/null || true
echo "✅ Clean complete"
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

# Verify binaries are functional
echo "Testing FFmpeg binaries..."
./resources/bin/ffmpeg-arm64 -version > /dev/null 2>&1 || {
  echo "❌ ERROR: ffmpeg-arm64 is not functional!"
  echo "Please re-download from https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
  exit 1
}

./resources/bin/ffmpeg-x86_64 -version > /dev/null 2>&1 || {
  echo "❌ ERROR: ffmpeg-x86_64 is not functional!"
  echo "Please re-download from https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
  exit 1
}

echo "✅ FFmpeg binaries verified"
echo ""

# Build Vite project
echo "🏗️  Building Vite project..."
npm run build || {
  echo "❌ ERROR: Vite build failed!"
  exit 1
}

echo ""
echo "🏗️  Building signed DMG for both architectures..."

# Set environment variables for code signing
export CSC_IDENTITY_AUTO_DISCOVERY=true
# Strip "Developer ID Application:" prefix if present - electron-builder will auto-select
export CSC_NAME="${APPLE_IDENTITY#Developer ID Application: }"

# Build both architectures in a single command
# This ensures latest-mac.yml includes both arm64 and x64 for proper auto-updates
echo ""
echo "📦 Building arm64 (Apple Silicon) and x64 (Intel) .app bundles..."
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
echo "📦 Distributables:"
echo "   - dist/Om-*-arm64.dmg (Apple Silicon)"
echo "   - dist/Om-*-x64.dmg (Intel)"
echo ""

# Rebuild native modules for local development
echo "🔧 Rebuilding native modules for local architecture..."
CURRENT_ARCH=$(uname -m)
if [ "$CURRENT_ARCH" = "arm64" ]; then
  npm rebuild || {
    echo "⚠️  Warning: Failed to rebuild native modules for local development"
    echo "   You may need to run 'npm rebuild' manually before running 'npm start'"
  }
  echo "✅ Native modules rebuilt for arm64"
elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  echo "ℹ️  Skipping rebuild - already on x86_64 architecture"
fi
