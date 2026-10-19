# Set up Arcue

These steps are for an AI agent that sets up Arcue for its user. People can follow them too.

Arcue is an app for reviewing 3D models and animations with an AI agent. The user comments on the model, and the agent gets the exact vertices, bones, frame, camera and a screenshot. The [README](README.md) has the full picture.

## Pick your host

| You run in | Go to |
|---|---|
| Claude Code, in a terminal or the Code tab of the Claude desktop app | [Claude Code](#claude-code) |
| Codex, in a terminal or the Codex app | [Codex](#codex) |
| Any other agent | [Other agents](#other-agents) |

## Claude Code

1. Run:

   ```sh
   claude plugin marketplace add skibitsky/arcue#plugin
   claude plugin install arcue@arcue
   ```

   If `claude` is not on your PATH, give the user these two commands to run in a terminal.
2. Plugins load when a session starts. Ask the user to start a new session.

In the Claude desktop app, the plugin shows Arcue in the Browser pane next to the conversation. In a terminal, it opens the Arcue desktop app.

## Codex

1. Run:

   ```sh
   codex plugin marketplace add skibitsky/arcue@plugin
   codex plugin add arcue@arcue
   ```

2. Ask the user to start a new thread, so Codex loads the plugin.

In the Codex app, the plugin shows Arcue in the in-app browser. In a terminal, it opens the Arcue desktop app.

## Other agents

1. Install the Arcue skill. If it asks which agents to install it for, pick yourself.

   ```sh
   npx skills add skibitsky/arcue
   ```

2. Tell the user to use the Arcue desktop app and to paste each round of comments to you. Until releases are ready, the desktop app is built from source, as [Run from source](README.md#run-from-source) describes.
3. The skill's `arcue open` and `arcue inspect` need the `arcue` command on PATH, in a bash, zsh or Git Bash shell. Desktop app releases will install it. Until then, apply pasted reviews and read their `round.json` and screenshots.
