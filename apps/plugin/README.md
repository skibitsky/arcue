# Arcue for Claude Code and Codex

[Arcue](https://github.com/skibitsky/arcue) is a desktop app for reviewing 3D models and animations. You pin or paint a comment on the model at a frame, and Arcue hands it to your coding agent with the vertices, bones, frame, camera and a screenshot. This plugin teaches Claude Code and Codex to work with it, and contains:

- the `arcue` skill, which explains Arcue's review prompts and `round.json`, how to open a model at a clip and frame, and how to show other files with a model;
- the `arcue` command line, in the skill's `scripts` folder. It reads model files on your computer and talks to the Arcue app over a local connection that only your user account can open. It sends nothing over the network.
- Arcue's window as a web page, which `arcue serve` serves on localhost. In the Claude desktop app and the Codex app the agent opens it in the app's built-in browser, so you review models beside the conversation. Pages from other sites can't reach it, but, as with any local web server, other programs on your computer can while it runs.

Without a built-in browser, opening a model uses the Arcue desktop app, started at least once, or `arcue serve` in your own browser. Inspecting a file needs neither. The command line needs Node 22 or later.

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
