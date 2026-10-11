---
name: arcue
description: Work with Arcue, the desktop app for reviewing 3D models and animations. Use this skill whenever a pasted message starts with "3D review · round", the user mentions Arcue, or asks you to show them a model, clip or frame, or to check an FBX export. It covers opening a model in Arcue at a clip and frame, inspecting a file without the app, and turning Arcue's anchored comments (vertex numbers, bones, frames, screenshots) into exact fixes.
license: MIT
---

# Arcue

In Arcue a person pins or paints comments on a 3D model at a frame of a clip. Its Copy prompt button gives you those comments as a numbered review and writes the exact data behind them to a round folder on disk.

## The arcue command

Run `arcue`. If that command isn't found and this skill's folder has `scripts/arcue.js`, which the Arcue plugin includes, run `node <this skill's folder>/scripts/arcue.js` instead; it needs Node 22 or later. `arcue help` prints the full usage. Exit codes: 0 success, 1 failure, 2 usage error.

- `arcue open <file> --clip <name> --frame <number>` shows a model in the user's Arcue window, starting the app if needed. Both flags are optional.
- `arcue inspect <file> --json` reads a model without the app: meshes and their vertex counts, parts, bones, materials, textures and whether each was found, clips, the files composed with it, and import warnings.
- `arcue status` says whether Arcue is running and which models it has open.

Pass a clip by its name in the file, such as `Armature|Walk`, as `inspect` lists it, and quote it because `|` is a shell pipe. Prompts show people's name for it, `Walk`. Frames are whole numbers counted from the clip's first frame, which is 0.

`open` and `status` talk to the Arcue desktop app. If `open` says Arcue has not been started on this computer yet, ask the user to start it once.

## Applying a review

A pasted review starts with `3D review · round N`, names the model on its `Asset:` line and the round folder on its `Data and screenshots:` line, then lists numbered comments.

1. Read `round.json` in the round folder. The prompt is a summary; `round.json` has each comment's exact vertex numbers, weights, rest and posed positions, bones, joints and camera. Its fields are in [references/round-json.md](references/round-json.md).
2. Look at the screenshots in the same folder. They show what the reviewer saw.
3. Fix the source and export to the `Asset:` path. Arcue watches the file, reloads it and carries the comments over to the new version: exactly while a mesh keeps its vertices and triangles, by position otherwise.
4. Show the result: `arcue open <asset> --clip "<time.clip>" --frame <time.frame>`.
5. Report back by comment number. The user resolves comments in Arcue or reopens them; a reopened comment returns in a later round with its earlier messages.

If the round folder doesn't exist, as with Arcue in a browser, which keeps reviews in the tab, work from the prompt and ask for screenshots if you need them.

## Keep in mind

- Leave `.arcue/` alone except for composition files. Arcue owns the reviews there, and a round folder never changes once written.
- Keep the model's file path; reviews are keyed by it.
- Keep a mesh's vertices and triangles when the fix doesn't need new geometry, so comments keep exact anchors.

## References

- [references/round-json.md](references/round-json.md): every field of `round.json`.
- [references/composition.md](references/composition.md): showing separate animation files, attachments and textures with a model.
- [references/blender.md](references/blender.md): how Arcue's vertex numbers, positions, clips and frames map onto Blender.
