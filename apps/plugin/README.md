# Arcue for Claude Code and Codex

[Arcue](https://github.com/skibitsky/arcue) is a desktop app for reviewing 3D models and animations. You pin or paint a comment on the model at a frame, and Arcue hands it to your coding agent with the vertices, bones, frame, camera and a screenshot. This plugin teaches Claude Code and Codex to work with it, and contains:

- the `arcue` skill, which explains Arcue's review prompts and `round.json`, how to open a model at a clip and frame, and how to show other files with a model;
- the `arcue` command line, in the skill's `scripts` folder, with a small launcher that runs it on Node 24 or later. It reads model files on your computer and talks to the Arcue app over a local connection that only your user account can open. Apart from `arcue setup`, below, it sends nothing over the network.
- Arcue's window as a web page, which `arcue serve` serves on localhost. In the Claude desktop app and the Codex app the agent opens it in the app's built-in browser, so you review models beside the conversation. Pages from other sites can't reach it, but, as with any local web server, other programs on your computer can while it runs.

Without a built-in browser, opening a model uses the [Arcue desktop app](https://github.com/skibitsky/arcue/blob/main/INSTALL.md#desktop-app), started at least once, or `arcue serve` in your own browser. Inspecting a file needs neither. Your agent runs the plugin's own command line, which matches its skill, even when the desktop app is installed.

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

## Node

The command line runs on Node 24 or later from your PATH. Without one, the launcher downloads nothing: your agent asks you before it runs `arcue setup`, which downloads the Node 24 build the plugin pins from nodejs.org once, 25 to 60 MB, checks it against the plugin's SHA-256 checksums, and keeps only the `node` program, 90 to 130 MB, in `~/Library/Caches/Arcue/runtime` on macOS, `$XDG_CACHE_HOME/Arcue/runtime` or `~/.cache/Arcue/runtime` on Linux, or `%LOCALAPPDATA%\Arcue\runtime` on Windows. Delete that folder to remove it; if a cleanup tool empties it, your agent asks you again. Setup needs curl or wget on macOS and Linux, or Windows 10 version 1803 or later; Node 24 needs macOS 13.5 or later, or Linux with glibc 2.28 or later. Set `ARCUE_NODE_MIRROR` to download from a mirror of https://nodejs.org/dist, checked against the same checksums, and `ARCUE_RUNTIME_DIR` to keep Node in another folder that only you can change.

## License

MIT
