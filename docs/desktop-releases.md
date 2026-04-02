# Desktop App Release Process

This document describes the release process for Om Desktop.

## Overview

Om Desktop releases are:

- Built locally with code signing and notarization using electron-builder
- Distributed as DMG installers for easy installation (drag-to-Applications)
- Published to the public `om-releases` repo for downloads
- Auto-updates delivered via electron-updater from `om-releases`

## Quick Release Guide

### 1. Bump Version

From the `om-desktop` directory, use npm's built-in version command (follows semantic versioning):

```bash
cd om-desktop

# For bug fixes (0.1.0 -> 0.1.1)
npm version patch

# For new features (0.1.0 -> 0.2.0)
npm version minor

# For breaking changes (0.1.0 -> 1.0.0)
npm version major
```

This updates `om-desktop/package.json` and creates a version commit.

### 2. Build the App

Update .env to production environment with production environment variables set, before building.

```bash
cd om-desktop
npm run build:production
```

This builds signed and notarized DMG files for both architectures:

- `om-desktop/dist/Om-{version}-arm64.dmg` (Apple Silicon)
- `om-desktop/dist/Om-{version}-x64.dmg` (Intel)
- `om-desktop/dist/latest-mac.yml` (auto-update metadata)

**Requirements**: Apple Developer credentials configured in `om-desktop/.env` (see om-desktop/README.md)

**Important**: The build script builds both architectures in a **single electron-builder command**. This is critical because building them separately causes the second build to overwrite `latest-mac.yml`, breaking auto-updates for the first architecture. See [electron-builder issue #5592](https://github.com/electron-userland/electron-builder/issues/5592).

**Note for Apple Silicon Macs**: The build script automatically rebuilds native modules for your local architecture (arm64) after creating production builds. This ensures the app runs correctly in development after building for both architectures.

### 3. Publish Release

```bash
cd om-desktop
npm run publish
```

This script:

- Creates a GitHub Release on `om-labs/om-releases` (public repo)
- Uploads both DMG files and the `latest-mac.yml` metadata file
- Generates release notes with installation instructions

### 4. Push Changes (Optional)

```bash
git push
```

Keeps the `om-desktop` repo in sync. This is just for version history - releases are served from `om-releases`.

## Download URLs

Public download URLs (always point to latest release):

- **Latest Release Page**: https://github.com/om-labs/om-releases/releases/latest
- **Apple Silicon (latest)**: Will be versioned DMG: `Om-{version}-arm64.dmg`
- **Intel (latest)**: Will be versioned DMG: `Om-{version}-x64.dmg`

These URLs are used on the marketing site download page.

**Note**: Unlike ZIP releases, DMG files include the version number in the filename. Users should download from the releases/latest page to get the most recent version.

## How Auto-Updates Work

The app checks `om-releases` for new versions using electron-updater. When a new release is published with the `latest-mac.yml` file, users receive an in-app update notification.

### Auto-Update Flow

1. **App startup** → After 10 seconds, checks for updates (then every 60 minutes)
2. **Update detected** → Shows notification in top-right corner: "Update Available - Version X.X.X"
3. **User clicks "Download Update"** → Downloads DMG in background with progress bar
4. **Download complete** → Shows "Update Ready to Install - Restart & Install" button
5. **User clicks "Restart & Install"** → App quits and installs update
6. **User declines** → Click "Later" to dismiss, will check again in 60 minutes

**Note**: The app must be **running** to check for and download updates. Updates do not install while the app is closed.

### Auto-Update Mechanism

1. **electron-builder** generates `latest-mac.yml` during build containing:
   - Version number
   - DMG file paths for both arm64 and x64
   - SHA512 checksums for security
   - Release date

2. **electron-updater** (in the app) periodically checks this file from GitHub releases

3. When a new version is detected, the app:
   - Sends event to renderer to show `UpdateNotification` component
   - Waits for user to click "Download Update" (auto-download disabled)
   - Downloads the DMG in background with progress tracking
   - Notifies user when ready with "Restart & Install" button
   - Installs on next app restart when user clicks button

Configuration is in `om-desktop/package.json`:

```json
"build": {
  "publish": [{
    "provider": "github",
    "owner": "om-labs",
    "repo": "om-releases",
    "releaseType": "release"
  }]
}
```

**Critical**:

- The `latest-mac.yml` file MUST include both arm64 and x64 builds for multi-architecture support
- The `UpdateNotification` component must be rendered in the app (see `om-desktop/src/dashboard/App.tsx`)

## Architecture

```
om-desktop (private)          om-releases (public)
    │                              │
    ├── npm version patch          │
    ├── npm run build:production   │
    │   (electron-builder)         │
    │   ├── Builds Vite project    │
    │   ├── Creates DMGs           │
    │   └── Generates latest-mac.yml
    │                              │
    └── npm run publish        ────► Creates release + uploads:
        (./scripts/publish-release.sh)  ├── Om-{version}-arm64.dmg
                                   │    ├── Om-{version}-x64.dmg
                                   │    └── latest-mac.yml
                                   │         ▲
                                   │         │
                              Marketing site + electron-updater
                              (checks latest-mac.yml for updates)
```

## Local Testing (Fast Builds)

For testing changes locally without the overhead of code signing and notarization:

### Quick Test (Single Architecture)

```bash
cd om-desktop
npm run build:local
```

Builds **unsigned** DMG for your current architecture only (arm64 or x64):

- ⚡ **Much faster** than production builds (no signing/notarization)
- ✅ Perfect for testing UI changes, features, bug fixes
- ⚠️ **Not suitable for distribution** (unsigned builds)

### Test Auto-Updates (Both Architectures)

```bash
cd om-desktop
npm run build:local:all
```

Builds **unsigned** DMGs for both arm64 and x64:

- Generates proper `latest-mac.yml` with both architectures
- Use this to test auto-update flow locally
- Still much faster than production (no signing/notarization)

### Opening Unsigned Builds

macOS will block unsigned apps from opening:

1. **First attempt**: Double-click DMG → macOS shows "cannot be opened because it is from an unidentified developer"
2. **Bypass Gatekeeper**: Right-click the app → Click "Open" → Click "Open" in dialog
3. Alternatively: System Settings → Privacy & Security → Click "Open Anyway"

### When to Use Each Build Type

| Build Type              | Command                    | Use Case                  | Speed                            |
| ----------------------- | -------------------------- | ------------------------- | -------------------------------- |
| **Local (single arch)** | `npm run build:local`      | Quick testing, UI changes | ⚡⚡⚡ Fastest                   |
| **Local (both arch)**   | `npm run build:local:all`  | Test auto-updates         | ⚡⚡ Fast                        |
| **Production**          | `npm run build:production` | Official releases         | 🐢 Slow (signing + notarization) |

## Troubleshooting

**Build fails**: Run `npm test && npm run lint` locally first

**Code signing issues**: Verify `.env` has valid Apple Developer credentials

**Release already exists**: The publish script will prompt to delete and recreate

**Update not detected by app**:

- Ensure version in `package.json` is higher than the installed version
- Verify `latest-mac.yml` was uploaded to the GitHub release
- Check electron-updater logs in the app console
- **Most common issue**: `latest-mac.yml` only contains one architecture. Verify it lists both arm64 and x64 files:
  ```bash
  curl -s https://github.com/om-labs/om-releases/releases/download/v{version}/latest-mac.yml
  ```
  If it only shows one architecture, rebuild using `npm run build:production` (which builds both together)

**DMG not created**: Ensure electron-builder is properly configured in `package.json` under the `"build"` section

**latest-mac.yml missing**: This file is auto-generated by electron-builder during the build. If missing:

- Verify `npm run build` completed successfully
- Check that `dist/latest-mac.yml` exists after build
- Ensure the `"publish"` section is configured in `package.json`

## References

- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Semantic Versioning](https://semver.org/)
- [DMG Configuration](https://www.electron.build/configuration/dmg)
