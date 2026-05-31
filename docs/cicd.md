# CI/CD — Releases and Builds

This repo uses two GitHub Actions workflows to build installers and publish versioned releases.

---

## Workflows at a Glance

| File | Trigger | Purpose |
|------|---------|---------|
| `.github/workflows/build.yml` | Push, PR, or version tag | Compile and package for macOS, Windows, Linux |
| `.github/workflows/release.yml` | Manual (`workflow_dispatch`) | Bump version, tag, create draft release |

---

## How to Cut a Release

### 1. Run the release workflow

Via the GitHub CLI:

```bash
gh workflow run release.yml -f bump=patch   # e.g. 1.6.3 → 1.6.4
gh workflow run release.yml -f bump=minor   # e.g. 1.6.3 → 1.7.0
gh workflow run release.yml -f bump=major   # e.g. 1.6.3 → 2.0.0
```

Or via the GitHub UI: **Actions → Release → Run workflow → select bump type → Run**.

### 2. What happens automatically

1. The version is bumped in `package.json` and `src/package.json`.
2. A commit is pushed: `chore: release v1.x.x`.
3. A `v1.x.x` tag is created and pushed to `master`.
4. A **draft** GitHub Release is created with auto-generated release notes.
5. The new tag triggers `build.yml`, which builds installers for all three platforms (~15–20 min).
6. Each platform job uploads its installer(s) to the draft release.

### 3. Publish the release

Once all three build jobs finish and their artifacts appear on the draft release page:

**Releases → v1.x.x (Draft) → Edit → Publish release**

The release is now public with download links for all platforms.

---

## Build Workflow (`build.yml`)

Runs on:
- Every push to `master`, `dev`, or `features/**` branches
- Every pull request targeting `master`
- Every `v*.*.*` tag push (triggered by `release.yml`)

### Platform jobs

| Job | Runner | Output |
|-----|--------|--------|
| `build-macos` | `macos-latest` | `gSender-x.x.x-Mac-Intel.dmg`, `gSender-x.x.x-Mac-Silicon.dmg` |
| `build-windows` | `windows-latest` | `gSender-x.x.x-Windows-64Bit.exe` |
| `build-linux` | `ubuntu-latest` | `.AppImage` and `.deb` for x64 and arm64 |

### On a tag push

Each job uploads its installer(s) to the GitHub Release draft created by `release.yml`.

### On a branch push or PR

Each job stores installers as **workflow artifacts** with a 7-day retention period. Download them from the Actions run summary page.

### Build steps (each platform)

1. Node.js 24 setup with Yarn cache
2. `yarn install --ignore-engines` (root dependencies)
3. `yarn --cwd src install --production --ignore-scripts` (Electron app dependencies)
4. `npm run build` — runs CSS, esbuild server bundle, and Vite frontend in parallel
5. `yarn build:<platform>` — runs `scripts/electron-builder.sh` to package with electron-builder

---

## Building Locally

### Dev server

```bash
nvm use 24
yarn dev
# App runs at http://localhost:8000
```

### Production build (all platforms)

```bash
nvm use 24
npm run build          # builds CSS + server bundle + Vite frontend
yarn build:macos       # macOS DMG(s)  → output/
yarn build:windows     # Windows EXE   → output/
yarn build:linux       # Linux packages → output/
```

### Windows installer from macOS (cross-compile)

The `scripts/electron-builder.sh` script handles cross-compilation automatically:

- Reads the Electron version from `node_modules/electron/package.json` (avoids running the macOS Electron binary).
- Skips `electron-rebuild` when targeting Windows or Linux, using the N-API prebuilds bundled with `@serialport/bindings-cpp` and `usb` instead.
- Excludes `**/build/Release/*.node` from the package so host-compiled macOS `.node` binaries are never included in the Windows installer.
- Cleans the `output/` directory before each build to prevent stale cached binaries from being reused.

> **Note:** The `output/gSender-x.x.x-x64.exe` produced on macOS is unsigned (wine is used to invoke `signtool.exe` in a limited way). For a signed production release, use the GitHub Actions `build-windows` job which runs on a real Windows runner.

---

## Required GitHub Secrets

None are strictly required to build unsigned installers. The following secrets enable code signing and are only checked on tag builds:

| Secret | Used by | Purpose |
|--------|---------|---------|
| `APPLE_ID` | macOS job | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS job | App-specific password for notarization |
| `APPLE_TEAM_ID` | macOS job | Apple Developer Team ID |
| `CSC_LINK` | macOS job | Base64-encoded `.p12` signing certificate |
| `CSC_KEY_PASSWORD` | macOS job | Password for the `.p12` certificate |

Without these secrets the macOS build skips notarization (`CSC_IDENTITY_AUTO_DISCOVERY=false` on PRs).

---

## Key Build Decisions

### Vite sourcemaps disabled in production

`src/app/vite.config.js` has `sourcemap: false`. The frontend bundle has 5,100+ modules; generating sourcemaps requires over 6 GB of heap and crashes the build on standard CI runners. Source maps can be re-enabled locally if needed for debugging by temporarily setting `sourcemap: true`.

### `NODE_OPTIONS=--max-old-space-size=4096`

The `vite:build` script sets a 4 GB Node.js heap limit. This is sufficient with sourcemaps disabled and prevents the OS from OOM-killing the process during the Rollup chunk-rendering phase.

### N-API prebuilds for native modules

`@serialport/bindings-cpp` and `usb` both ship N-API (ABI-stable) prebuilds for all platforms inside their npm packages. The build is configured to use these prebuilds exclusively (`!**/build/Release/*.node` in the electron-builder `files` exclusion) rather than recompiling from source, which makes cross-platform builds reliable without a native toolchain on the host.
