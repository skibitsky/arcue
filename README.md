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
pnpm --filter @arcue/desktop package
```

## License

[MIT](LICENSE)
