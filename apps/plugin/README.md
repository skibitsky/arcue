# Arcue for Claude Code and Codex

[Arcue](https://github.com/skibitsky/arcue) is a desktop app for reviewing 3D models and animations. You pin or paint a comment on the model at a frame, and Arcue hands it to your coding agent with the vertices, bones, frame, camera and a screenshot. This plugin teaches Claude Code and Codex to work with it, and contains:

- the `arcue` skill, which explains Arcue's review prompts and `round.json`, how to open a model at a clip and frame, and how to show other files with a model;
- the `arcue` command line, in the skill's `scripts` folder. It reads model files on your computer and talks to the Arcue app over a local connection that only your user account can open. It sends nothing over the network.

Opening a model needs the Arcue desktop app, started at least once; inspecting a file doesn't. The command line needs Node 22 or later.

## Install

Claude Code:

```sh
claude plugin marketplace add skibitsky/arcue#plugin
claude plugin install arcue@arcue
```

The Code tab of the Claude desktop app uses the plugins that `claude` installs.

Codex:

```sh
codex plugin marketplace add skibitsky/arcue@plugin
codex plugin add arcue@arcue
```

## License

MIT
