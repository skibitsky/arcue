<h1><img src="assets/branding/png/arcue-rounded-128.png" width="40" align="top" alt=""> Arcue</h1>

<!-- Demo video goes here. -->

**Review, test and polish your 3D game assets together with your AI agent.**

Arcue is where you and your agent work on models and animations side by side. Play through clips, check LODs and import warnings, and leave comments right on the model. Your agent gets the exact vertices, bones, frame, camera and a screenshot. When it changes the model, Arcue reloads it with your comments still in place.

[Try it in your browser](https://arcue-web.skibitsky.workers.dev) · [Add it to your agent app](#use-it-with-agent-apps)

Arcue is in early development. It opens FBX and Blender files.

## How it works

1. Open an FBX or `.blend` file, or ask your agent to open it.
2. Click or paint on the model, at any frame of any clip, and write a comment.
3. Hand the comments to your agent. Arcue adds the vertices, bones, frame, camera and a screenshot.
4. The agent makes the changes and can show you the result at the same frame. Resolve each comment, or reply with a follow-up.

## What it's for

- Building characters, rigs and animations with an agent that works in Blender.
- Reviewing props and characters on their way into your game, including models an AI generated.
- Checking a file's LODs, textures, clips and import warnings before it reaches the engine.

## Made for game assets

- **LODs.** Switch between `_LOD` levels or LOD groups. Each comment remembers the LOD it was made on.
- **Engine conventions.** Collision meshes named `UCX_`, `UBX_`, `USP_` or `UCP_` start hidden, and `SOCKET_` nodes are recognized.
- **Modular characters.** Load animation-only files, props attached to bones and alternative parts into one view.
- **Animation.** Play and scrub clips, shape key animation included, and comment on a single frame or a range.
- **Your pipeline.** Every export reloads, and comments move onto the new version of the mesh. They follow a renamed model too, including in a Unity project through its GUID.

## Ways to use it

| Where | How |
|---|---|
| Claude and Codex apps | [Install the plugin](#use-it-with-agent-apps). Arcue opens in the app's built-in browser, right next to the conversation. |
| Other agents and terminals | Use the desktop app. It reloads a model every time you export it, and keeps reviews in `.arcue/` in your repository. Until releases are ready, [build it from source](#run-from-source). |
| Just trying it | Open the [web version](https://arcue-web.skibitsky.workers.dev) and drop in a file or pick a sample. Comments stay in the tab until you reload. |

## Use it with agent apps

The quickest way is to ask your agent:

```text
Set up Arcue for me: https://github.com/skibitsky/arcue/blob/main/INSTALL.md
```

The Arcue plugin teaches your agent to open models in Arcue, read your comments and check its own changes. In the Claude and Codex apps, Arcue opens in the built-in browser. Everywhere else, it opens in the desktop app.

### Claude Code

```sh
claude plugin marketplace add skibitsky/arcue#plugin
claude plugin install arcue@arcue
```

Run these in a terminal. The Code tab of the Claude desktop app uses the same plugins.

### Codex

```sh
codex plugin marketplace add skibitsky/arcue@plugin
codex plugin add arcue@arcue
```

### Other agents

Use the desktop app, and paste each round of comments into your agent. Add the Arcue skill so the agent can read the full review data and screenshots:

```sh
npx skills add skibitsky/arcue
```

Desktop app releases will put the `arcue` command on your PATH, so the agent can also open models and inspect files from a bash, zsh or Git Bash shell. Until then, it works from the comments you paste.

## Build it into your own workflow

- **The `arcue` command.** `arcue open` shows a model at a clip and frame, `arcue serve` runs Arcue in any browser on your own files, and `arcue inspect --json` lists a file's meshes, bones, clips, materials and import warnings. Call it from scripts, CI or your own tools.
- **Review files.** Every copied prompt is also saved as [`round.json`](skills/arcue/references/round-json.md) with its screenshots in `.arcue/reviews/`, so any script can read the feedback.
- **Composition files.** A [`composition.json`](skills/arcue/references/composition.md) loads animation files, attachments and textures together with a model.
- **Commands.** Every action in Arcue is a typed command with a JSON Schema in [`packages/protocol`](packages/protocol). The window and the `arcue` command call the same commands, and the planned MCP server will too.

## Roadmap

- Desktop app releases, ready to download and install, that put the `arcue` command on your PATH.
- glTF and GLB files, then OBJ and USD.
- Feedback that arrives in your running agent session, without copy and paste.
- An MCP server, so the agent can read comments with their screenshots, reply to them and mark them fixed.
- Two versions side by side, with a synced camera and timeline and a heatmap of what moved.
- Onion skinning for animation.
- Lighting presets and custom environments.
- A pose tool: rotate a bone to show the pose you want.
- Blender, Unity and Tripo integrations.
- Several reviewers on one model.

## Run from source

You need Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm dev                              # web version at http://localhost:5173
pnpm --filter @arcue/desktop dev      # desktop app
pnpm --filter @arcue/desktop package  # desktop app build, in apps/desktop/out
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers tests and the rest of the development setup.

## License

[MIT](LICENSE)
