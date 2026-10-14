---
name: arcue
description: Arcue is a desktop app where people pin or paint comments on 3D models at a frame and copy them to a coding agent. Use this skill when a message contains "3D review · round" or "Fix these import warnings for", or a path under .arcue/, when the user mentions Arcue or asks to see a model, clip or frame in it, or wants an FBX or Blender .blend file checked for its meshes, clips, missing textures or import warnings. It covers `arcue open`, `arcue inspect`, round.json, composition files, and turning Arcue's anchored comments (vertex numbers, bones, frames, screenshots) into exact fixes. Not for working on Arcue's own source code.
license: MIT
---

# Arcue

## The arcue command

Use `arcue`, or `node "<this skill's folder>/scripts/arcue.js"` (Node 22 or later) when only that exists.

Models are FBX files or Blender's own .blend files, which Arcue reads directly.

- `arcue open <file> [--clip <name>] [--frame <number>]` shows a model in the user's Arcue window and starts the app if needed. If it says Arcue has not been started on this computer yet, ask the user to start it once.
- `arcue inspect <file> --json` reads a model without the app: meshes and vertex counts, parts, bones, clips, materials, missing textures, composed files and import warnings.
- `arcue status` lists the models Arcue has open, and exits with 1 when it isn't running.

Name a clip as the file does, from `inspect` or `time.clip`: `--clip "Armature|Walk"` for an FBX take, `--clip "Walk"` for the action `Walk` in a .blend. Any other name, such as the display name `Walk` of `Armature|Walk`, is ignored without an error. Frames count from the clip's first frame, 0.

## Applying a review

A pasted review contains `3D review · round N`, the model on its `Asset:` line and the round folder on its `Data and screenshots:` line.

1. Read `round.json` in the round folder for each comment's exact vertices, positions, bones and camera, using [references/round-json.md](references/round-json.md), and look at the screenshots beside it.
2. A comment's file is the `Asset:` path, or, for a comment whose `meshPath` or `time.clip` starts with `<file>//`, that file in the model's folder. Read [references/blender.md](references/blender.md) first when that file is a .blend or an FBX that Blender exported. `asset.exporter` names the exporter of the `Asset:` file, and `arcue inspect <file> --json` names it for a `<file>//` file.
3. Fix the comment's file. Fix a .blend in Blender and save it in place, following the saving rules in blender.md; there is no export. Fix an FBX in what it is exported from and export over it. Arcue reloads the files and carries the comments over to the new version.
4. Show the result at a comment's moment: `arcue open <asset> --clip "<time.clip>" --frame <frame>`, with the first frame of a range, and neither flag when `time` is null.
5. Report back by comment number; the user resolves or reopens comments in Arcue.

If the round folder isn't on disk (`.arcue/` isn't committed, and Arcue in a browser keeps reviews in its tab), work from the prompt alone, and fix the model at the `Asset:` path or, if that path is from another machine, the same file in this checkout. When the prompt lists other loaded files, it doesn't say which one a comment is on: check with `arcue inspect` which file has its mesh or clip.

A list that starts `Fix these import warnings for <model>` comes from Arcue's warnings panel. Fix the source and re-export, or save the fixed .blend, or fix the composition file, then check that `arcue inspect <model> --json` no longer reports them. Many of a .blend's warnings only say what Arcue doesn't show, and clearing them can renumber vertices: read [references/blender.md](references/blender.md) before changing the file for one.

## Keep in mind

- Don't write in `.arcue/` except composition files. Arcue owns the reviews there.
- Keep the model's path and each mesh object's name and parent: comments find their mesh by its path.
- When a fix needs no new geometry, move vertices rather than adding, removing or reordering vertices or faces, so comments most likely keep their vertex numbers.

To show separate animation files, attachments or textures with a model, see [references/composition.md](references/composition.md).
