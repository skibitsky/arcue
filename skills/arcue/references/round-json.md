# round.json

A round folder holds `prompt.md`, the prompt as copied; `round.json`; and `<comment id>.png` for each comment with a screenshot.

```json
{
  "round": 4,
  "asset": {
    "path": "Assets/Hero/Hero.fbx",
    "version": "3f9a2c1…",
    "fps": 60,
    "space": { "units": "m", "up": "+Y", "handedness": "right" }
  },
  "comments": [
    {
      "id": "c01k9q…",
      "number": 1,
      "text": "The thumb tip bends outward. Fold it back toward the palm.",
      "time": { "clip": "Armature|Charge", "clipDisplayName": "Charge", "frame": 34, "seconds": 0.567 },
      "target": {
        "kind": "region",
        "mesh": "Body",
        "meshPath": "Hero/Body",
        "vertices": [[812, 830], [845, 845]],
        "vertexCount": 20,
        "centroid": { "rest": [0.41, 1.02, 0.05], "posed": [0.38, 1.1, 0.12] },
        "bones": [{ "name": "Right_ThumbDistal", "share": 0.64 }]
      },
      "pose": { "joints": [{ "name": "Right_ThumbDistal", "path": "Hero/Armature/…/Right_ThumbDistal", "position": [0.4, 1.05, 0.07] }] },
      "camera": { "position": [0.6, 1.0, 0.4], "target": [0.4, 1.05, 0.07], "up": [0, 1, 0], "fov": 35, "label": "palm side, slightly below" },
      "screenshot": "c01k9q….png",
      "anchorState": "exact",
      "anchorVersion": "3f9a2c1…",
      "earlierMessages": []
    }
  ]
}
```

- `asset.path` is relative to the repository root, or absolute outside a repository.
- `target` is null for a comment about the whole model or motion. A `point` has the three `vertices` of one triangle and barycentric `weights`; the spot is their weighted sum, given as `position`. A `region` lists its vertices as inclusive `[first, last]` ranges.
- Vertex numbers count the file's own vertices in the file's order, as `arcue inspect <file>` counts them, not the vertices a renderer splits at seams.
- `time` is null for a comment about every pose; positions are then rest positions. Otherwise it has a `frame`, or `frames` as `[first, last]`.
- `rest` is the rest pose; `posed` is at the comment's time, or null when Arcue didn't compute it. Positions are world space in meters, right-handed, with `asset.space.up` as the up axis: `+Y` unless the user chose Blender's `+Z` in Arcue's settings.
- `bones` give each bone's share of the target's skin weight. `pose.joints` are joint positions at the comment's time, or a range's first frame.
- `anchorState` is `exact` when the vertex numbers refer to the version on screen, and `moved` when Arcue mapped the target onto a later export by position. `detached` means no surface was near any more: the numbers refer to the older `anchorVersion`, so find the place by its rest positions.
- `earlierMessages` are a reopened comment's messages from earlier rounds; `text` is the latest.
- `parts` appears when the reviewer's view differed from the default: the LOD shown and the parts hidden, shown or isolated.
- `warning` marks a comment made from one of Arcue's import warnings, with its code, subject, file and detail.
- In a composition, `asset.files` lists each file with its version, and meshes from other files have paths such as `Rocks.fbx//Boulder1`.
