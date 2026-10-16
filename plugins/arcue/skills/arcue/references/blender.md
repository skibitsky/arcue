# Arcue and Blender

## FBX files exported from Blender

- **Vertex numbers** are Blender's vertex indices in the mesh the exporter wrote. With Apply Modifiers on, the default, that is the mesh after its modifiers other than Armature. When a modifier adds or removes vertices, such as Mirror or Subdivision Surface, the numbers don't match the base mesh you edit: find those vertices by position.
- **Positions:** when `asset.space.up` is `+Z` they are Blender's world coordinates. When it is `+Y`, the default, Blender's position for `[x, y, z]` is `(x, -z, y)`, whatever axes the exporter used, at Scale 1.0. Compare rest positions with the evaluated mesh, rig in Rest Position: `e = obj.evaluated_get(depsgraph)`, then `e.matrix_world @ v.co` for each `v` in `e.to_mesh().vertices`, times `scene.unit_settings.scale_length` for meters.
- **Clips** named like `Armature|Walk` are All Actions takes: the action `Walk` on the object `Armature`, and Arcue's frame 0 is Blender frame `action.frame_range[0]`. Other takes are named after an NLA strip, starting at the strip's first frame, or after the scene, starting at `scene.frame_start`.

## .blend files

Arcue reads a .blend directly: the scene and view layer that were active when it was saved, plus the objects of that scene's background set. Its rest pose is that scene at `scene.frame_start`, whatever frame the file was saved at, with armatures in Rest Position. `asset.exporter` is `Blender` and the version, such as `Blender 5.2`.

- **Vertex numbers** are indices into `obj.data.vertices`, the object's own mesh before modifiers, where `obj` is the object that `mesh` names. Arcue deforms the mesh with one armature and with no other modifier, so the numbers hold on a mirrored or subdivided object too. That armature is the first Armature modifier's, or else the parent's when the object's `parent_type` is `ARMATURE`. Arcue names the modifiers it skips, such as Mirror, Subdivision Surface, Displace or Weighted Normal, in a "Modifiers not applied" warning, and any further Armature modifier or armature parent in a "Several skins" warning. Shape keys still deform the mesh: Arcue sets each to its value at `scene.frame_start`, and an action that keys them is a clip.
- **Positions:** Blender's world position times `scene.unit_settings.scale_length` is `[x, y, z]` when `asset.space.up` is `+Z`, and `(x, -z, y)` when it is `+Y`. Rest positions are `obj.matrix_world @ v.co` in the rest pose, for each `v` in `obj.data.vertices`, or in `obj.data.shape_keys.reference_key.data` when the mesh has shape keys.
- **Clips:** each action is a clip named after it, such as `Walk`, whether an object or its shape keys play it directly, on an NLA strip or not at all, as long as Arcue can tell what it moves. An action that only objects outside the scene use has no clip and no warning. When the timeline plays two or more actions that move what Arcue shows, such as two objects with their own actions, one more clip, named after the scene, plays the timeline as Blender does from `scene.frame_start` to `scene.frame_end`. When an action has the scene's name, the scene's clip is named `<scene name>#2`.
- **Frames:** an action's clip plays the action alone over `action.frame_range`, wherever an NLA strip places it, so its frame 0 is the action's own frame `action.frame_range[0]`. In round.json, `time.sourceFrame` is that action frame, not the timeline frame where a strip plays it. For the scene's clip, frame 0 is `scene.frame_start` and `time.sourceFrame` is the timeline frame. With Time Stretching other than 1:1, an action's clip has no `sourceFrame`. Its frame `n` is scene frame `action.frame_range[0] * new / old + n` with the action played directly, where `old` is `scene.render.frame_map_old` and `new` is `frame_map_new`.
- **Linked rigs:** an animation file whose rig is linked from the character's file, as a library override usually leaves it, has no clips. Arcue doesn't read linked data, and the "Linked data not shown" warning names the rig. Making the rig's armature local, such as with `rig.data.make_local()`, gives Arcue its bones and the file its clips. The file then no longer follows changes to the character's rig, so ask the user first.
- **Parts** are mesh objects. A part's id, like `meshPath`, is the object's path through its parent objects and bones, such as `Rig/Body`; collections are not in it. Siblings named `<name>_LOD<n>` form one part with LOD levels. Objects hidden with the eye, directly or through their collection, and objects displayed as Wire or Bounds start hidden, a LOD part only when all its levels are. Objects and collections disabled in viewports or excluded from the view layer are left out.
- **Warnings:** Arcue warns about what it doesn't show or evaluate, such as modifiers other than the armature, constraints, drivers, B-Bone curves, curve and text objects, and data linked from other .blend files. Check the warnings from `arcue inspect <file> --json` before fixing a pose or shape that only looks wrong in Arcue.
- **Clearing those warnings** changes the file for the preview's sake, even when a `Fix these import warnings` list asks for it. Applying a Mirror or Subdivision Surface modifier adds vertices and renumbers the ones comments point at, and baking constraints replaces the rig's controls. Tell the user the cost and ask before doing it; they can dismiss the warning in Arcue instead.

## A comment's pose in Blender

For the scene's clip, the timeline at `time.sourceFrame` is the pose. For an action's clip, Arcue plays that action alone. Objects and shape keys it doesn't key, and the other bones of an armature it moves, keep their pose at `scene.frame_start`. Other armatures stay in Rest Position. To match `posed`:

1. Before changing anything, go to frame `scene.frame_start`.
2. In the `animation_data` of every object and every `obj.data.shape_keys`, turn off `use_nla` and clear `action`, so that nothing else plays.
3. Make the clip's action the `action` of each object it moves, or of `obj.data.shape_keys` for shape keys, with its slot in `action_slot` on Blender 4.4 and later.
4. Set each armature the action doesn't move to Rest Position.
5. Go to frame `time.sourceFrame`.

Do this in a Blender session that doesn't save, such as `blender -b <file> --python <script>`. In a clip from a composition's animation file, bones the clip doesn't key keep the model's rest pose.

## Moving vertices of a mesh with shape keys

A mesh with shape keys keeps its shape twice: in `obj.data.vertices` and in its Basis key, `obj.data.shape_keys.reference_key`. Blender shapes the mesh from the Basis key, and so does Arcue for a .blend, so changing only `obj.data.vertices` changes nothing either shows. An FBX export can take `obj.data.vertices` instead.

- In Blender's interface, move the vertices in Edit Mode with the Basis key active. That updates both and moves the vertices in the keys built on the Basis too.
- By script, add the same offset to the vertex in `obj.data.vertices` and in every key in `obj.data.shape_keys.key_blocks`.

## Saving a .blend

Save the fixed .blend in place, in the Blender version that `asset.exporter` names or the one the user works in, since a newer Blender upgrades the file. Arcue reloads it when it changes on disk.

- If the user has the file open in Blender, make the change in that Blender or ask the user to. Blender doesn't reload a file that changed on disk, so the user's next save would overwrite yours.
- Keep the active scene, its active view layer, and each object's collections and visibility as they were. They decide which objects Arcue reads and which parts start hidden.
- Put any armature you switched to Rest Position back in Pose Position. Arcue warns "Rest position not followed" when a clip poses an armature saved in Rest Position.
- If you checked a pose in the Blender you save from, first undo what you changed for it, such as active actions, their slots or `use_nla`. The actions Blender plays decide where objects and shape keys sit in Arcue's rest pose, the pose a clip gives bones it doesn't key, and whether Arcue adds the scene's clip.
