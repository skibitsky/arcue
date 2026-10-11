# Arcue and Blender

For models exported with Blender's FBX exporter:

- **Vertex numbers** are Blender's vertex indices in the mesh the exporter wrote. With Apply Modifiers on, the default, that is the mesh after its modifiers other than Armature. When a modifier adds or removes vertices, such as Mirror or Subdivision Surface, the numbers don't match the base mesh you edit: find those vertices by position.
- **Positions:** when `asset.space.up` is `+Z` they are Blender's world coordinates. When it is `+Y`, the default, Blender's position for `[x, y, z]` is `(x, -z, y)`, whatever axes the exporter used, at Scale 1.0. Compare rest positions with the evaluated mesh, rig in Rest Position: `e = obj.evaluated_get(depsgraph)`, then `e.matrix_world @ v.co` for each `v` in `e.to_mesh().vertices`.
- **Clips** named like `Armature|Walk` are All Actions takes: the action `Walk` on the object `Armature`, and Arcue's frame 0 is Blender frame `action.frame_range[0]`. Other takes are named after an NLA strip, starting at the strip's first frame, or after the scene, starting at `scene.frame_start`.
