---
name: arcue
description: Arcue is an app, on the desktop or in a browser, where people pin or paint comments on 3D models at a frame and copy them to a coding agent. Use this skill when a message contains "3D review · round" or "Fix these import warnings for", or a path under .arcue/, when the user mentions Arcue or asks to see a model, clip or frame in it, or wants an FBX or Blender .blend file checked for its meshes, clips, missing textures or import warnings. It covers `arcue open`, `arcue serve --detach`, `arcue stop`, `arcue status`, `arcue inspect`, round.json, composition files, and turning Arcue's anchored comments (vertex numbers, bones, frames, screenshots) into exact fixes. Not for working on Arcue's own source code.
license: MIT
---

# Arcue

## The arcue command

In bash, zsh or Git Bash, use `arcue` when it is on PATH. Otherwise, and always in PowerShell, run the launcher in this skill's `scripts` folder in its place:

- bash, zsh or Git Bash: `sh "<this skill's folder>/scripts/arcue" <arguments>`
- PowerShell: `& (& "<this skill's folder>\scripts\arcue-node.cmd") "<this skill's folder>\scripts\arcue.js" <arguments>`. Never give a `.cmd` file arguments: cmd.exe would run a `|` or `&` in them as a command.

The launcher runs Arcue on Node 24 or later from PATH, or on the Node that setup downloaded. When it says Arcue needs Node 24 or later, ask the user before you run `arcue setup` through it, which in PowerShell is `& "<this skill's folder>\scripts\arcue-setup.cmd"`. Setup downloads Node from nodejs.org once, about 30 MB; it needs network access, so allow it in a sandbox, and can take a few minutes.

Models are FBX files or Blender's own .blend files, which Arcue reads directly.

- `arcue open <file> [--clip <name>] [--frame <number>]` shows a model in this session's view: the page Arcue in the browser serves for this session while it runs, otherwise the desktop app, which it starts if needed. When it says Arcue in the browser has stopped, run `arcue serve --detach`, then the same `arcue open` again. `--move` takes a model from another session's view.
- `arcue serve --detach` starts Arcue in the browser beside the desktop app, on the user's files with their reviews in `.arcue/` as the desktop app keeps them. It listens at http://localhost:4530, or on the port it ran on last, unless `--port <number>` picks another. It returns once Arcue runs and prints this session's view, also when Arcue already runs, and Arcue stops by itself after 30 minutes with no page open.
- `arcue stop` stops Arcue in the browser for every session. Run it only when the user asks.
- `arcue inspect <file> --json` reads a model without the app: meshes and vertex counts, parts, bones, clips, materials, missing textures, composed files and import warnings.
- `arcue status` says whether Arcue runs in a browser and in the desktop app, the address of this session's view, and the models each has open, and exits with 1 when neither runs.

## Where Arcue shows models

`arcue open` shows models in this session's view, a page that only this session and its subagents fill. When the app you run in has a built-in browser, such as the Browser pane in the Claude desktop app or the in-app browser in the Codex app, show that page there:

1. Run `arcue status`. When it prints this session's view, open that address.
2. Otherwise run `arcue serve --detach`, also when the desktop app runs, and open the view address it prints. It listens on localhost, so allow it outside a sandbox. In the Claude desktop app, a launch.json `url` must be a bare origin: add `{ "name": "arcue", "url": "http://localhost:4530", "port": 4530 }`, with the port of the printed address, to `configurations` in the project's `.claude/launch.json`, creating it with `"version": "0.0.1"` if needed, start that configuration in the Browser pane, then navigate it to the printed address. In the Codex app, open the address with its browser tool. When `arcue serve --detach` says the port is in use, add `--port <number>` with a free port.
3. Keep the page open: Arcue in the browser stops 30 minutes after the last page closes, and an open page reconnects and reopens its models when Arcue starts again. When `arcue open` prints an address, the page isn't open: open the address in the built-in browser.

In Arcue in the browser, a model shows in one view at a time. When `arcue open` says another session's view has it, add `--move` only if the user wants it here.

When `arcue status` shows no Arcue in the browser right after `arcue serve --detach` printed an address, your shell stops what its commands start: run `arcue serve` as a background command that keeps running instead.

Without a built-in browser, `arcue open` shows models in the desktop app, which it starts. When it prints an address instead, give it to the user to open. If it says the app has not been started on this computer yet, could not be started, or that Arcue in the browser has stopped, run `arcue serve --detach` and give the user the address it prints, then run the same `arcue open` again.

Name a clip as the file does, from `inspect` or `time.clip`: `--clip 'Armature|Walk'` for an FBX take, `--clip 'Walk'` for the action `Walk` in a .blend. The name comes from the file, so keep it literal: in single quotes, with each `'` in it written as `'\''` in sh, or in PowerShell with each `'`, `‘`, `’`, `‚` and `‛` doubled. Quote file paths the same way. Any other name, such as the display name `Walk` of `Armature|Walk`, is ignored without an error. Frames count from the clip's first frame, 0.

## Applying a review

A pasted review contains `3D review · round N`, the model on its `Asset:` line and the round folder on its `Data and screenshots:` line.

1. Read `round.json` in the round folder for each comment's exact vertices, positions, bones and camera, using [references/round-json.md](references/round-json.md), and look at the screenshots beside it.
2. A comment's file is the `Asset:` path, or, for a comment whose `meshPath` or `time.clip` starts with `<file>//`, that file in the model's folder. Read [references/blender.md](references/blender.md) first when that file is a .blend or an FBX that Blender exported. `asset.exporter` names the exporter of the `Asset:` file, and `arcue inspect <file> --json` names it for a `<file>//` file.
3. Fix the comment's file. Fix a .blend in Blender and save it in place, following the saving rules in blender.md; there is no export. Fix an FBX in what it is exported from and export over it. Arcue reloads the files and carries the comments over to the new version.
4. Show the result at a comment's moment: `arcue open <asset> --clip '<time.clip>' --frame <frame>`, with the first frame of a range, and neither flag when `time` is null.
5. Report back by comment number; the user resolves or reopens comments in Arcue.

If the round folder isn't on disk (`.arcue/` isn't committed, and Arcue's website keeps reviews in its tab), work from the prompt alone, and fix the model at the `Asset:` path or, if that path is from another machine, the same file in this checkout. When the prompt lists other loaded files, it doesn't say which one a comment is on: check with `arcue inspect` which file has its mesh or clip.

A list that starts `Fix these import warnings for <model>` comes from Arcue's warnings panel. Fix the source and re-export, or save the fixed .blend, or fix the composition file, then check that `arcue inspect <model> --json` no longer reports them. Many of a .blend's warnings only say what Arcue doesn't show, and clearing them can renumber vertices: read [references/blender.md](references/blender.md) before changing the file for one.

## Keep in mind

- Don't write in `.arcue/` except composition files. Arcue owns the reviews there.
- Keep the model's path and each mesh object's name and parent: comments find their mesh by its path.
- When a fix needs no new geometry, move vertices rather than adding, removing or reordering vertices or faces. Comments then most likely keep their exact vertices, while other changes make Arcue map them onto the new mesh by position. In a .blend, assigning faces another material keeps them exact as well.

To show separate animation files, attachments or textures with a model, see [references/composition.md](references/composition.md).
