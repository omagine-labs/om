# Om Desktop

Automated meeting ingestion and analysis desktop app.

## Project Overview

Om is an Electron desktop application that automatically records, transcribes, and analyzes meetings to provide communication insights and metrics.

## Tech Stack

- **Framework**: Electron + TypeScript
- **UI**: React
- **Build System**: Electron Forge + Vite
- **Recording**: Electron desktopCapturer API
- **Package Manager**: npm

## Development

### Prerequisites

- **Node.js**: v20.x or higher
- **macOS**: 13.0+ (Ventura or later)
- **Xcode Command Line Tools**: Required for native addon compilation
  ```bash
  xcode-select --install
  ```
- **Python**: 3.x (usually included with macOS)

### Install Dependencies

```bash
npm install
```

### Build Native Addons

**⚠️ IMPORTANT:** This app uses native C++/Objective-C addons that must be compiled before running.

```bash
npm run rebuild
```

This compiles:

- **`screen_recorder.node`** - ScreenCaptureKit wrapper for recording
- **`window_detector.node`** - Window/tab detection and active tab tracking

**When to rebuild:**

- After `npm install` (first time setup)
- After pulling changes that modify `native/` directory
- If you get "Cannot find module" errors for `.node` files
- After modifying any `.cc`, `.mm`, or `.h` files in `native/`

**Troubleshooting build issues:**

```bash
# Clean build artifacts and rebuild
rm -rf build/
npm run rebuild

# Verify Xcode Command Line Tools
xcode-select -p  # Should output a path like /Library/Developer/CommandLineTools

# Check Python version
python3 --version  # Should be 3.x
```

### Run Development Server

```bash
npm start
```

**Full development workflow:**

```bash
npm install           # Install dependencies
npm run rebuild       # Compile native addons
npm test             # Run tests (126 tests)
npm start            # Start the app
```

### Build for Production

#### Development/Testing Build (Unsigned)

```bash
npm run package   # Package app for local testing
npm run make      # Create unsigned distributable
```

#### Production Build (Signed & Notarized)

```bash
# Build signed and notarized distributable for distribution
npm run make:production

# Output: out/make/zip/darwin/arm64/Om-darwin-arm64-{version}.zip
```

**Requirements for signed builds:**

- Apple Developer account ($99/year)
- Environment variables configured in `.env` (see First-Time Setup below)

Without signing credentials, `npm run make` creates unsigned builds (users see security warnings).

#### Icon Management

```bash
npm run icon:generate   # Generate 1024x1024 PNG icon
npm run icon:convert    # Convert PNG to .icns
npm run icon:build      # Generate + convert (full rebuild)
```

**Icon files:**

- Source: `assets/icon.png` (1024x1024 PNG)
- macOS: `assets/icon.icns` (generated from PNG)

#### Version Management

Version is managed in `package.json` and follows semantic versioning:

- `0.1.0-alpha.1` - Initial alpha release
- `0.1.0-alpha.2` - Alpha updates
- `0.1.0` - First production release

Version is displayed:

- In menu bar: "About Om v{version}"
- In app metadata (Info.plist)
- In distribution filename

#### Environment Configuration

The app supports local and production Supabase environments:

```bash
# Local development (default)
SUPABASE_ENV=local

# Production build
SUPABASE_ENV=production
```

Configuration in `.env`:

```bash
# Local Supabase (for development)
SUPABASE_URL_LOCAL=http://localhost:54321
SUPABASE_ANON_KEY_LOCAL=your-local-anon-key

# Production Supabase
SUPABASE_URL_PRODUCTION=https://your-project.supabase.co
SUPABASE_ANON_KEY_PRODUCTION=your-production-anon-key

# Web app URLs
WEB_APP_URL_LOCAL=http://localhost:3000
WEB_APP_URL_PRODUCTION=https://app.omaginelabs.com
```

#### macOS Entitlements & Permissions

The app requests these permissions at launch:

- **Screen Recording** - Capture meeting windows
- **Microphone** - Record meeting audio
- **Accessibility** - Detect active meeting windows and browser tabs

Entitlements configured in `build/entitlements.mac.plist`:

- Screen recording (`com.apple.security.device.capture`)
- Microphone access (`com.apple.security.device.audio-input`)
- Apple Events automation (`com.apple.security.automation.apple-events`)
- JIT compilation & unsigned executable memory (for Node modules)

#### First-Time Code Signing Setup

Required once to enable signed production builds:

1. **Apple Developer Account**: Enroll at https://developer.apple.com/programs/ ($99/year)

2. **Developer ID Certificate**:
   - Create at https://developer.apple.com/account/resources/certificates
   - Select "Developer ID Application"
   - Install certificate in Keychain Access

3. **App-Specific Password**:
   - Generate at https://appleid.apple.com/account/manage
   - Label it "Om Desktop Notarization"

4. **Configure `.env`** (already in `.gitignore`):

   ```bash
   APPLE_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
   APPLE_TEAM_ID="ABCD123456"
   APPLE_ID="your-apple-id@example.com"
   APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   ```

5. **Build signed release**:
   ```bash
   npm run make:production
   ```

**Troubleshooting:**

- Verify certificate: `security find-identity -v -p codesigning`
- Check notarization status: `xcrun notarytool history --apple-id YOUR_APPLE_ID`

#### Distribution Checklist

Before releasing to users:

1. ✅ **Set Production Environment** - Ensure `SUPABASE_ENV=production` in `.env`

2. ✅ **Build Signed Release** - Run `npm run make:production`

3. ✅ **Test Built App** - Install and verify from `out/` directory

4. 📦 **Publish Release**:
   - Create GitHub Release with version tag
   - Upload built .zip files
   - Users receive automatic update notifications

### Publishing Updates

Users receive automatic update notifications powered by `electron-updater`.

**Quick release**: `npm version patch` → `npm run make:production` → Create GitHub Release

See [docs/RELEASES.md](./docs/RELEASES.md) for complete release process.

### Run Tests

```bash
npm test             # Run all tests with Vitest
npm run test:watch   # Run tests in watch mode
```

### Lint & Format

```bash
npm run lint                # Check code style with ESLint
npm run lint -- --fix       # Auto-fix ESLint issues

npm run format              # Format code with Prettier
npm run format:check        # Check formatting without changes

npm run check-pr            # Run all PR checks locally (format, lint, tests, build)
```

**Before pushing**: Run `npm run check-pr` to verify your changes pass all quality checks. This runs the same checks as GitHub Actions but locally to save costs.

## Features

### User Experience

- **Menu Bar App**: Lives in macOS menu bar, doesn't clutter the Dock
- **Permission Requests**: All required permissions (Screen Recording, Microphone, Accessibility) requested at launch
- **Auto-Updates**: Seamless update notifications with one-click installation

### Automatic Meeting Recording

- **Supported Platforms**: Google Meet, Zoom, Microsoft Teams, Slack
- **Auto-detection**: Detects meetings in real-time (5-second polling)
- **10-second opt-out window**: Allows users to cancel before recording starts
- **Browser support**: Chrome, Brave, Safari (for Google Meet)
- **Native app support**: Zoom, Teams, Slack desktop apps

### Tab Switch Warning (Google Meet)

When recording a Google Meet in a browser tab:

- **Initial notification** includes instructions to keep the tab active
- **Warning notification** appears when you switch to a different tab
- **One-time per switch**: Warning only shows once until you return to the meeting
- **Silent reset**: Returning to the meeting tab resets the flag without notification
- **Workaround tip**: Drag the meeting tab to a new window to multitask freely

**Why?** The native screen recorder captures the active tab content. Switching tabs means the meeting is no longer being recorded.

### Recording Management

- **Automatic upload**: Recordings upload to backend for transcription/analysis
- **Queue system**: Failed uploads are queued and retried when network/auth is available
- **Local cleanup**: Recordings deleted locally after successful upload
- **4-hour max duration**: Automatically stops recording after 4 hours
- **Deduplication**: Same meeting detection prevents duplicate recordings

### Menu Bar Integration

- **Visual status**: Shows recording state in macOS menu bar
- **Quick actions**: Stop recording, view current session
- **Countdown indicator**: 10-second opt-out timer visible

## Authentication

Om Desktop uses Supabase authentication with OAuth (Google, Azure) and supports deep linking for web-to-desktop authentication flows.

### Deep Link Protocol: `om://`

The app registers the `om://` protocol handler for authentication callbacks:

- **`om://auth/success#tokens`** - Web-to-desktop auth (tokens in hash fragment)
- **`om://auth/callback#tokens`** - OAuth callback (Google, Azure)

See [WEB_APP_INTEGRATION.md](./WEB_APP_INTEGRATION.md) for detailed integration guide.

## Project Structure

```
om-desktop/
├── src/
│   ├── main.ts                      # Electron main process + deep link handlers
│   ├── preload.ts                   # Preload script (IPC bridge)
│   ├── renderer.tsx                 # React entry point
│   ├── App.tsx                      # Main React component
│   ├── contexts/
│   │   └── AuthContext.tsx          # React auth state management
│   ├── services/
│   │   ├── meeting-orchestrator.ts  # Meeting detection & recording logic
│   │   ├── menu-bar.ts              # macOS menu bar integration
│   │   ├── upload-queue.ts          # Recording upload queue
│   │   └── upload-service.ts        # Upload & processing API
│   ├── lib/
│   │   ├── auth.ts                  # Authentication logic
│   │   ├── supabase.ts              # Supabase client
│   │   ├── session-store.ts         # Encrypted session storage
│   │   ├── permissions.ts           # macOS permission requests
│   │   └── config.ts                # App configuration
│   ├── native-window-detector.ts    # TypeScript wrapper for window detection
│   └── native-recorder.ts           # TypeScript wrapper for recording
├── native/
│   ├── window-detector/             # C++/Objective-C window detection addon
│   │   ├── window_detector.h        # Header file
│   │   ├── window_detector.mm       # macOS implementation (AppleScript, CGWindowList)
│   │   └── binding.cc               # Node.js N-API bindings
│   └── addon/                       # C++/Objective-C screen recording addon
│       ├── screen_recorder.mm       # ScreenCaptureKit implementation
│       └── binding.cc               # Node.js N-API bindings
├── build/Release/                   # Compiled .node addons (generated)
│   ├── screen_recorder.node
│   └── window_detector.node
├── binding.gyp                      # Native addon build configuration
├── forge.config.ts                  # Electron Forge configuration
├── vite.*.config.ts                 # Vite configurations
├── WEB_APP_INTEGRATION.md           # Web app integration guide
└── package.json
```

## Architecture

### Native Addons

Om Desktop uses **native C++/Objective-C addons** for performance-critical features:

#### **1. Window Detector** (`window_detector.node`)

- **Purpose**: Detect meeting windows and active browser tabs
- **APIs Used**:
  - `CGWindowListCopyWindowInfo` - macOS window list API
  - AppleScript - Browser automation (Chrome, Brave, Safari)
- **Functions**:
  - `getActiveMeetingWindow()` - Find frontmost meeting (Zoom, Meet, Teams, Slack)
  - `getWindowTabURLs(windowId)` - Get all tab URLs in a browser window
  - `getActiveTabURL(windowId)` - Get currently active tab URL
  - `isWindowActive(windowId)` - Check if window still exists
- **Security**: Read-only operations, requires Accessibility permission

#### **2. Screen Recorder** (`screen_recorder.node`)

- **Purpose**: Record screen with system audio
- **APIs Used**:
  - `ScreenCaptureKit` - macOS native screen recording framework
  - `AVFoundation` - Video/audio encoding
- **Functions**:
  - `startRecording(windowId, outputPath)` - Start recording a specific window
  - `stopRecording()` - Stop recording and save to file
- **Security**: Requires Screen Recording permission

### Native Addon Development

**Modifying native code:**

1. Edit files in `native/window-detector/` or `native/addon/`
2. Rebuild: `npm run rebuild`
3. Test: `npm test`
4. Commit both source (`.mm`, `.cc`, `.h`) and `binding.gyp` changes

**Build system:**

- **node-gyp**: Compiles C++/Objective-C to `.node` binaries
- **N-API (Node-API)**: Stable ABI for native addons across Node versions
- **binding.gyp**: Build configuration (frameworks, flags, source files)

**Debugging native addons:**

```bash
# Enable verbose logging
npm run rebuild -- --verbose

# Check if addons load correctly
node -e "require('./build/Release/window_detector.node')"
node -e "require('./build/Release/screen_recorder.node')"
```

## Code Review

This repository uses Claude Code for comprehensive code reviews.

### Usage

Run the `/code-review` slash command in Claude Code to review your current branch against main:

```bash
/code-review
```

This performs a comprehensive review covering:

- **Code Quality**: ESLint, Prettier, TypeScript conventions
- **Security**: Electron security, IPC safety, auth flows, token handling
- **Electron Architecture**: Process separation, IPC patterns
- **Native Addons**: C++/Objective-C changes (if applicable)
- **Testing**: Coverage for new functionality
- **Performance**: Main process blocking, resource management

The review follows patterns defined in `.claude/CLAUDE.md` and provides structured feedback with action items.

## License

MIT
