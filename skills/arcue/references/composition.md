# Showing other files with a model

Arcue can load other files into a model's view, for pipelines that spread one asset over several files. Clips from those files are named `<file>//<clip>`, such as `Hero@Walk.fbx//Armature|Walk`, and that is the name `--clip` takes. Their meshes and parts get the same prefix.

**By name.** An FBX beside the model named `<model name>@<anything>.fbx`, such as `Hero@Walk.fbx` beside `Hero.fbx`, joins it automatically.

**Through composition.json** in the model's review folder, `.arcue/reviews/<model path from the repository root>/composition.json`, such as `.arcue/reviews/Assets/Hero/Hero.fbx/composition.json`. Outside a repository the review folder is `reviews/<absolute model path>/` in Arcue's data folder. Arcue reloads the view when the file changes. Paths are relative to the model's folder and use `/`.

```json
{
  "version": 1,
  "animations": ["Animations/Hero_Locomotion.fbx"],
  "attach": [{ "file": "Props/Sword.fbx", "bone": "Hand.R" }, { "file": "Rocks.fbx" }],
  "materials": { "Body": { "baseColor": "Textures/Body_Color.png", "normal": "Textures/Body_Normal.png" } },
  "hidden": ["Rocks.fbx//Boulder2"]
}
```

- `animations`: files whose clips play on the model's bones, matched by bone name.
- `attach`: a file, or one `node` in it with its children. With `bone` it follows that bone of the model; without, it stays in place.
- `materials`: textures by material name and slot: `baseColor`, `normal`, `roughness`, `metalness` or `emissive`. They replace what the files say.
- `hidden`: parts hidden until someone shows them, by the part ids that `arcue inspect <model> --json` lists.

Check the result with `arcue inspect <model> --json`: `members` lists each file with its role and whether it was found, and `warnings` explains what didn't load.
