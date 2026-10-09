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
```

## License

[MIT](LICENSE)
