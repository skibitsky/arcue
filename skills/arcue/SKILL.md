---
name: arcue
description: Arcue is a desktop app where people pin or paint comments on 3D models at a frame and copy them to a coding agent. Use this skill when a message contains "3D review · round" or "Fix these import warnings for", or a path under .arcue/, when the user mentions Arcue or asks to see a model, clip or frame in it, or wants an FBX file checked for its meshes, clips, missing textures or import warnings. It covers `arcue open`, `arcue inspect`, round.json, composition files, and turning Arcue's anchored comments (vertex numbers, bones, frames, screenshots) into exact fixes. Not for working on Arcue's own source code.
license: MIT
---

# Arcue

## The arcue command

Use `arcue`, or `node <this skill's folder>/scripts/arcue.js` (Node 22 or later) when only that exists.

- `arcue open <file> [--clip <name>] [--frame <number>]` shows a model in the user's Arcue window and starts the app if needed. If it says Arcue has not been started on this computer yet, ask the user to start it once.
- `arcue inspect <file> --json` reads a model without the app: meshes and vertex counts, parts, clips, materials, missing textures, composed files and import warnings.
- `arcue status` lists the models Arcue has open, and exits with 1 when it isn't running.

Name a clip as the file does, such as `--clip "Armature|Walk"`, from `inspect` or `time.clip`. People's name for it, `Walk`, is ignored without an error. Frames count from the clip's first frame, 0.

## Applying a review

A pasted review contains `3D review · round N`, the model on its `Asset:` line and the round folder on its `Data and screenshots:` line.

1. Read `round.json` in the round folder for each comment's exact vertices, positions, bones and camera, using [references/round-json.md](references/round-json.md), and look at the screenshots beside it.
2. If `asset.exporter` starts with Blender, read [references/blender.md](references/blender.md) before mapping vertex numbers, positions, clips or frames.
3. Fix what the model is exported from, and export to the `Asset:` path, or, for a comment whose `meshPath` or `time.clip` starts with `<file>//`, to that file in the model's folder. Arcue reloads the files and carries the comments over to the new version.
4. Show the result at a comment's moment: `arcue open <asset> --clip "<time.clip>" --frame <frame>`, with the first frame of a range, and neither flag when `time` is null.
5. Report back by comment number; the user resolves or reopens comments in Arcue.

If the round folder isn't on disk, as with Arcue in a browser, the `Asset:` path isn't real either: work from the prompt and fix the user's own file.

A list that starts `Fix these import warnings for <model>` comes from Arcue's warnings panel. Fix the source and re-export, or the composition file, then check that `arcue inspect <model> --json` no longer reports them.

## Keep in mind

- Don't write in `.arcue/` except composition files. Arcue owns the reviews there.
- Keep the model's path and each mesh object's name and parent: comments find their mesh by its path.
- When a fix needs no new geometry, move vertices rather than adding, removing or reordering vertices or faces, so comments most likely keep their vertex numbers.

To show separate animation files, attachments or textures with a model, see [references/composition.md](references/composition.md).
