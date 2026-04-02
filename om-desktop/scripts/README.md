# Om Desktop Build Scripts

Scripts for building and publishing Om Desktop releases.

## Build Scripts

### `build-local.sh` (npm run build:local)

Fast local builds for testing - **builds current architecture only**.

**Features:**

- ⚡ No code signing or notarization (much faster)
- 📦 Builds DMG for your current architecture (arm64 or x64)
- ✅ Perfect for quick iteration on UI/feature changes

**Use case:** Testing changes locally before committing

```bash
npm run build:local
```

### `build-local-all.sh` (npm run build:local:all)

Fast local builds with both architectures - **for testing auto-updates**.

**Features:**

- ⚡ No code signing or notarization (faster than production)
- 📦 Builds DMGs for both arm64 AND x64
- 📄 Generates proper `latest-mac.yml` with both architectures
- ✅ Perfect for testing auto-update flow

**Use case:** Testing that auto-updates work correctly

```bash
npm run build:local:all
```

### `build-production.sh` (npm run build:production)

Production builds with full code signing and notarization.

**Features:**

- 🔐 Full code signing and notarization
- 📦 Builds DMGs for both arm64 AND x64 in single command
- 📄 Generates proper `latest-mac.yml` with both architectures
- ✅ Ready for distribution

**Use case:** Creating official releases

```bash
npm run build:production
```

**Important:** Builds both architectures in a **single electron-builder command** to ensure `latest-mac.yml` includes both. Building them separately causes the second build to overwrite `latest-mac.yml`, breaking auto-updates. See [electron-builder issue #5592](https://github.com/electron-userland/electron-builder/issues/5592).

## Publishing Scripts

### `publish-release.sh` (npm run publish)

Publishes a release to the public `om-releases` repository.

**What it does:**

- Creates GitHub Release with version tag
- Uploads DMG files for both architectures
- Uploads `latest-mac.yml` for auto-updates
- Creates unversioned copies for stable download URLs

**Use case:** After building with `build:production`, publish to GitHub

```bash
npm run publish
```

## Build Comparison

| Script             | Signing | Speed          | Architectures | Use Case            |
| ------------------ | ------- | -------------- | ------------- | ------------------- |
| `build:local`      | ❌ No   | ⚡⚡⚡ Fastest | Current only  | Quick local testing |
| `build:local:all`  | ❌ No   | ⚡⚡ Fast      | Both          | Test auto-updates   |
| `build:production` | ✅ Yes  | 🐢 Slow        | Both          | Official releases   |

## Testing Unsigned Builds

Unsigned builds (from `build:local` and `build:local:all`) will be blocked by macOS Gatekeeper.

**To open unsigned builds:**

1. Right-click the app → Click "Open"
2. Click "Open" in the security dialog
3. Or: System Settings → Privacy & Security → Click "Open Anyway"

## Common Workflows

### Test a UI Change

```bash
npm run build:local
# Open the DMG in dist/ and test
```

### Test Auto-Update Flow

```bash
# 1. Build both architectures with proper latest-mac.yml
npm run build:local:all

# 2. Check latest-mac.yml includes both architectures
cat dist/latest-mac.yml

# 3. Test update detection in your app
```

### Create Official Release

```bash
# 1. Bump version
npm version patch  # or minor, or major

# 2. Build with signing and notarization
npm run build:production

# 3. Publish to GitHub
npm run publish

# 4. Push version bump
git push
```
