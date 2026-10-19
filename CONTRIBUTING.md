# Contributing to Arcue

[AGENTS.md](AGENTS.md) explains how the packages fit together and the rules the code follows.

## Develop

Arcue needs Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm dev                           # the web host at http://localhost:5173
pnpm --filter @arcue/desktop dev   # the desktop app
pnpm --filter @arcue/plugin build  # the agent plugin and its marketplace, in apps/plugin/dist
node apps/plugin/dist/plugins/arcue/skills/arcue/scripts/arcue.js serve  # Arcue on this computer's files at http://localhost:4530
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @arcue/web test:e2e
pnpm --filter @arcue/plugin test:e2e
pnpm --filter @arcue/desktop test:e2e
```

The browser and desktop tests render with SwiftShader software rendering everywhere but macOS, and CI runs the browser tests that way on Linux. To use the same renderer on macOS:

```sh
ARCUE_E2E_SOFTWARE=1 pnpm --filter @arcue/web test:e2e --workers=1
ARCUE_E2E_SOFTWARE=1 pnpm --filter @arcue/desktop test:e2e
```

Software rendering has a longer test budget because shader compilation and screenshots can block for several seconds. The same assertions run with either renderer; failures retain traces and screenshots, which CI uploads as artifacts.

On Linux without a display, run the desktop app and its tests under `xvfb-run -a`. Without a GPU, start the app with `--use-angle=swiftshader --enable-unsafe-swiftshader` so the 3D view renders.

## Build the desktop app

```sh
pnpm --filter @arcue/desktop package   # the app with its arcue command, in apps/desktop/out/
pnpm --filter @arcue/desktop make      # its installers, in apps/desktop/out/make/
pnpm --filter @arcue/desktop smoke     # checks the arcue command on PATH against its app
```

`package` builds an app for the current platform and architecture, or for the ones it is given, such as `package darwin x64`. On Apple Silicon, open `apps/desktop/out/Arcue-darwin-arm64/Arcue.app`. The app's `arcue` command is `Contents/Resources/bin/arcue` in the macOS app and `bin/arcue` in the Linux app, a shell script that runs the command line on the app's own Electron as Node, and `bin\arcue.exe` in the Windows app, a small console program that does the same without cmd.exe. macOS builds use local ad-hoc signing and do not need an Apple developer certificate. Packaging for Windows compiles `arcue.exe` with Visual Studio's C++ build tools, and its setup program needs Inno Setup 6.3 or later; the Debian package needs `dpkg-deb`. It uses the app icon in `assets/branding/`; `pnpm icons` regenerates the icon formats from the approved master image.

## Release the desktop app

The Release workflow builds the installers on macOS, Windows and Linux, for Arm and x64, on every pull request that changes the packaging. It installs each one and checks that `arcue` runs from PATH on the app's own Node and opens models in the app. To publish a release, set `version` in `apps/desktop/package.json`, merge it, and push the tag `v<version>`; a version such as `0.2.0-beta.1` publishes a prerelease. The workflow signs and notarizes the macOS app, and signs the Windows app, when the secrets its header lists are set. Without them it publishes unsigned installers, and the release notes say so.
