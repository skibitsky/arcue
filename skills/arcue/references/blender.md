# Arcue and Blender

For models exported with Blender's FBX exporter:

- **Vertex numbers** are Blender's vertex indices in the mesh the exporter wrote. With Apply Modifiers on, the default, that is the mesh after its modifiers other than Armature. When a modifier adds or removes vertices, such as Mirror or Subdivision Surface, the numbers don't match the base mesh you edit: find those vertices by position.
- **Positions:** when `asset.space.up` is `+Z` they are Blender's world coordinates. When it is `+Y`, the default, Blender's position for `[x, y, z]` is `(x, -z, y)`, given the exporter's default axes and scale. Compare rest positions with `obj.matrix_world @ v.co` with the rig in Rest Position.
- **Clips** named like `Armature|Walk` are All Actions takes: the action `Walk` on the object `Armature`, and Arcue's frame 0 is Blender frame `action.frame_range[0]`. Other takes are named after an NLA strip, starting at the strip's first frame, or after the scene, starting at `scene.frame_start`.
- **Re-export** with the same axes and scale. They don't change vertex numbers, but they move every position, so the mapping above stops holding.
