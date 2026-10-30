# Contributing to Arcue

[AGENTS.md](AGENTS.md) explains how the packages fit together and the rules the code follows.

## Develop

Arcue needs Node 22.12 or later and pnpm. Its command line is built for Node 24 or later, which the agent plugin runs it on, and CI runs `pnpm test` on Node 24.

```sh
pnpm install
pnpm dev                           # the web host at http://localhost:5173
pnpm --filter @arcue/desktop dev   # the desktop app
pnpm --filter @arcue/plugin build  # the agent plugin and its marketplace, in apps/plugin/dist
node apps/plugin/dist/plugins/arcue/skills/arcue/scripts/arcue.js serve --detach  # Arcue on this computer's files at http://localhost:4530, or the port it ran on last; arcue.js stop stops it
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @arcue/web test:e2e
pnpm --filter @arcue/plugin test:e2e
pnpm --filter @arcue/desktop test:e2e
```

On Linux without a display, run the desktop end-to-end tests with `xvfb-run -a pnpm --filter @arcue/desktop test:e2e`.

The process tests, `apps/cli/src/*.process.test.ts`, build the command line and run it as separate `arcue` processes on the Node that runs Vitest, so run them on Node 24 or later, as CI does. `pnpm test` runs them, `pnpm exec vitest run --project "@arcue/cli processes"` runs only them, and `pnpm test --project '!@arcue/cli processes'` runs every other project. Where Node on PATH is older, run them from the repository root on the Node that Electron contains, Node 24 or later:

```sh
ELECTRON_RUN_AS_NODE=1 "$(cd apps/desktop && node -e 'console.log(require("electron"))')" node_modules/vitest/vitest.mjs run --project "@arcue/cli processes"
```

Each test uses its own temporary data folder and leaves out the variables that name an agent session, so the tests never reach an Arcue you run.

The browser and desktop tests render with SwiftShader software rendering everywhere but macOS, and CI runs the browser tests that way on Linux. To use the same renderer on macOS:

```sh
ARCUE_E2E_SOFTWARE=1 pnpm --filter @arcue/web test:e2e --workers=1
ARCUE_E2E_SOFTWARE=1 pnpm --filter @arcue/desktop test:e2e
```

Software rendering has a longer test budget because shader compilation and screenshots can block for several seconds. The same assertions run with either renderer; failures retain traces and screenshots, which CI uploads as artifacts.

On Linux without a display, run the desktop app under `xvfb-run -a` as well. Without a GPU, start it with `--use-angle=swiftshader --enable-unsafe-swiftshader` so the 3D view renders.

## Build the desktop app

```sh
pnpm --filter @arcue/desktop package   # the app with its arcue command, in apps/desktop/out/
pnpm --filter @arcue/desktop make      # its installers, in apps/desktop/out/make/
pnpm --filter @arcue/desktop smoke     # checks the arcue command on PATH against its app
```

`package` builds an app for the current platform and architecture, or for the ones it is given, such as `package darwin x64`. On Apple Silicon, open `apps/desktop/out/Arcue-darwin-arm64/Arcue.app`. The app's `arcue` command is `Contents/Resources/bin/arcue` in the macOS app and `bin/arcue` in the Linux app, a shell script that runs the command line on the app's own Electron as Node, and `bin\arcue.exe` in the Windows app, a small console program that does the same without cmd.exe. macOS builds use local ad-hoc signing and do not need an Apple developer certificate. Packaging for Windows compiles `arcue.exe` with Visual Studio's C++ build tools, and its setup program needs Inno Setup 6.3 or later; the Debian package needs `dpkg-deb`. It uses the app icon in `assets/branding/`; `pnpm icons` regenerates the icon formats from the approved master image.

## Release the desktop app

The Release workflow builds the installers on macOS, Windows and Linux, for Arm and x64, on every pull request that changes the packaging. It installs each one and checks that `arcue` runs from PATH on the app's own Node and opens models in the app. A manual run of the workflow builds and checks everything the same way, unsigned.

Before the first release, create the `release` environment in the repository's Settings > Environments. Limit its deployment branches and tags to tags that match `v*`, and give it the `MACOS_*`, `APPLE_*` and `AZURE_*` secrets and the `ARTIFACT_SIGNING_*` variables that the workflow's header lists, as environment secrets and variables. Then delete any repository-level copies of them, and add a tag ruleset for `v*` that restricts creations, updates and deletions and that only you can bypass, or make yourself a required reviewer of the environment. Anyone who can push a `v*` tag can otherwise read its secrets: the tagged commit's own workflow runs with them, and can drop its check that the commit is on main.

Only a tag push signs, with that environment's values. A tag pushed before the environment exists gets an empty one, which GitHub creates, and publishes unsigned installers. A platform with none of its values builds unsigned, and one with only some fails. The release notes say which macOS and Windows installers are not signed, and how to open them.

To publish a release, set `version` in `apps/desktop/package.json`, write what the release brings in `apps/desktop/release-notes/<version>.md`, merge both to main, and push the tag `v<version>` on a commit of main. A version is `x.y.z`, or `x.y.z-name` or `x.y.z-name.N` for a prerelease, such as `0.2.0-beta` or `0.2.0-beta.1`. Only the highest stable version becomes the latest release, which the install links in [INSTALL.md](INSTALL.md) download, so they need a stable release. A tag that does not match `version`, has no release notes file, or is not on main, fails every build. Delete it and tag again:

```sh
git push origin :refs/tags/v<version>
git tag -d v<version>
```

The release notes start with that file: a sentence or two, and a short list of what is new for people who use Arcue, as in `apps/desktop/release-notes/0.1.0.md`. The workflow adds a table that links each installer, how to open what is not signed, and how to check a download. GitHub then lists the pull requests merged since the last release, grouped by their labels as [`.github/release.yml`](.github/release.yml) says: `desktop`, `plugin` and `fix` give them a heading, and `internal` leaves them out, for changes to tests, CI and tooling that people who use Arcue never see. Give each pull request one of those labels as it is merged, and create them once in the repository's Issues > Labels; Dependabot labels its own `internal`. You can still edit the notes on the release page once it is published.

The workflow replaces a draft release for the tag, which a failed run leaves behind. A run for a tag that is already released fails: delete the release first, or tag a new version.
