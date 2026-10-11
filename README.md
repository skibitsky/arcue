# Arcue

Arcue is a desktop app for reviewing 3D models and animations and handing the feedback to an AI coding agent.

Feedback on a model is usually a sentence such as "the right thumb in Charge around frame 35 bends the wrong way," and the agent has to guess which vertices, bones and frames that means. In Arcue you click or paint on the model at the moment that looks wrong and write one line. Arcue adds the mesh, vertex numbers, bones, frame, camera and a screenshot, and copies everything as one prompt.

Arcue is in early development. It opens FBX files.

## Use with Claude Code and Codex

The Arcue plugin teaches Claude Code and Codex to read Arcue's reviews and to open models in Arcue, and it includes the `arcue` command line:

```sh
claude plugin marketplace add skibitsky/arcue#plugin && claude plugin install arcue@arcue
codex plugin marketplace add skibitsky/arcue@plugin && codex plugin add arcue@arcue
```

The skill alone installs with `npx skills add skibitsky/arcue`, but it then needs `arcue` on your PATH.

## Develop

Arcue needs Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm dev                           # the web host at http://localhost:5173
pnpm --filter @arcue/desktop dev   # the desktop app
pnpm --filter @arcue/plugin build  # the agent plugin and its marketplace, in apps/plugin/dist
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

## License

[MIT](LICENSE)
