# Arcue

Arcue is a desktop app for reviewing 3D models and animations and handing the feedback to an AI coding agent.

Feedback on a model is usually a sentence such as "the right thumb in Charge around frame 35 bends the wrong way," and the agent has to guess which vertices, bones and frames that means. In Arcue you click or paint on the model at the moment that looks wrong and write one line. Arcue adds the mesh, vertex numbers, bones, frame, camera and a screenshot, and copies everything as one prompt.

Arcue is in early development. It opens FBX files.

## Develop

Arcue needs Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm dev                           # the web host at http://localhost:5173
pnpm --filter @arcue/desktop dev   # the desktop app
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @arcue/web test:e2e
```

CI runs browser tests on Linux with SwiftShader software rendering. To use the same renderer on macOS:

```sh
ARCUE_E2E_SOFTWARE=1 pnpm --filter @arcue/web test:e2e --workers=1
```

Software rendering has a longer test budget because shader compilation and screenshots can block for several seconds. The same assertions run with either renderer; failures retain traces and screenshots, which CI uploads as artifacts.

## Build the desktop app

```sh
pnpm --filter @arcue/desktop package
```

This builds an app for the current platform and architecture in `apps/desktop/out/`. On Apple Silicon, open `apps/desktop/out/Arcue-darwin-arm64/Arcue.app`. macOS builds use local ad-hoc signing and do not need an Apple developer certificate. It uses the app icon in `assets/branding/`; `pnpm icons` regenerates the icon formats from the approved master image.

## License

[MIT](LICENSE)
