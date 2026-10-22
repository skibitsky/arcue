# Contributing to Arcue

[AGENTS.md](AGENTS.md) explains how the packages fit together and the rules the code follows.

## Develop

Arcue needs Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm dev                           # the web host at http://localhost:5173
pnpm --filter @arcue/desktop dev   # the desktop app
pnpm --filter @arcue/plugin build  # the agent plugin and its marketplace, in apps/plugin/dist
node apps/plugin/dist/plugins/arcue/skills/arcue/scripts/arcue.js serve --detach  # Arcue on this computer's files at http://localhost:4530; arcue.js stop stops it
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @arcue/web test:e2e
pnpm --filter @arcue/plugin test:e2e
pnpm --filter @arcue/desktop test:e2e
```

On Linux without a display, run the desktop end-to-end tests with `xvfb-run -a pnpm --filter @arcue/desktop test:e2e`.

The process tests, `apps/cli/src/*.process.test.ts`, build the command line and run it as separate `arcue` processes on the Node that runs Vitest, so they need Node 24 or later, as the plugin's command line does. `pnpm test` runs them, and `pnpm exec vitest run --project "@arcue/cli processes"` runs only them. Where Node on PATH is older, run them from the repository root on the Node that Electron contains:

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
pnpm --filter @arcue/desktop package
```

This builds an app for the current platform and architecture in `apps/desktop/out/`. On Apple Silicon, open `apps/desktop/out/Arcue-darwin-arm64/Arcue.app`. macOS builds use local ad-hoc signing and do not need an Apple developer certificate. It uses the app icon in `assets/branding/`; `pnpm icons` regenerates the icon formats from the approved master image.
