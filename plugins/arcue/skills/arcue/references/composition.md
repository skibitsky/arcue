# Showing other files with a model

Arcue can load other files into a model's view, for pipelines that spread one asset over several files. Their clips, meshes and parts carry the file's path from the model's folder as a prefix, such as `Animations/Hero_Locomotion.fbx//Armature|Walk`, which is the name `--clip` takes.

**By name.** An FBX beside the model named `<model name>@<anything>.fbx`, such as `Hero@Walk.fbx` beside `Hero.fbx`, joins it as an animation file.

**Through composition.json** in the model's review folder, `.arcue/reviews/<model path from the repository root>/composition.json`, such as `.arcue/reviews/Assets/Hero/Hero.fbx/composition.json`. Outside a repository the review folder is `reviews/<model path without its root>/` in Arcue's data folder, such as `reviews/C/Art/Hero.fbx/` for `C:\Art\Hero.fbx`. The data folder is `$ARCUE_USER_DATA`, else `~/Library/Application Support/Arcue` on macOS, `%APPDATA%\Arcue` on Windows, or `Arcue` in `$XDG_CONFIG_HOME` or `~/.config` on Linux. If you create `.arcue/`, also write `.arcue/.gitignore` containing `*`, as Arcue does, so the reviews stay out of git. Arcue reloads the view when the file changes.

```json
{
  "version": 1,
  "animations": ["Animations/Hero_Locomotion.fbx"],
  "attach": [{ "file": "Props/Sword.fbx", "bone": "Hand.R" }, { "file": "Rocks.fbx" }],
  "materials": { "Body": { "baseColor": "Textures/Body_Color.png", "normal": "Textures/Body_Normal.png" } },
  "hidden": ["Rocks.fbx//Boulder2"]
}
```

- Paths are relative to the model's folder and use `/`. Model files must sit inside the repository, or outside one in the model's folder or below it, and not be reached through a link.
- `animations`: files whose clips play on the model's bones, matched by bone name.
- `attach`: a file, or one `node` in it with its children, placed where it was exported, so export a prop where it sits on the model in the rest pose. With `bone` it follows that bone of the model, by a name or path that `arcue inspect <model> --json` lists under `bones` without a `<file>//` prefix.
- `materials`: textures by material name and slot: `baseColor`, `normal`, `roughness`, `metalness` or `emissive`. They replace what the files say.
- `hidden`: parts hidden until someone shows them, by the part ids that `arcue inspect <model> --json` lists.

Check the result with `arcue inspect <model> --json`: `members` lists each file with its role and whether it was found, and `warnings` explains what didn't load.
