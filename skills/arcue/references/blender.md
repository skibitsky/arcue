# Arcue and Blender

For models exported with Blender's FBX exporter:

- **Vertex numbers** are Blender's vertex indices in the mesh the exporter wrote. With Apply Modifiers on, the default, that is the evaluated mesh, `obj.evaluated_get(depsgraph).data.vertices`, not the base mesh you edit. If a modifier adds or removes vertices, such as Mirror or Subdivision Surface, find the base vertices by position.
- **Positions** are world space in meters. When `asset.space.up` is `+Z` they are Blender's world coordinates. When it is `+Y`, the default, Blender's position for `[x, y, z]` is `(x, -z, y)`, given the exporter's default axes. Compare rest positions with `obj.matrix_world @ v.co`.
- **Clips** named like `Armature|Walk` are the exporter's `<object>|<action>`: the action `Walk` on the object `Armature`.
- **Frames** count from the action's first frame: Arcue's frame 12 is Blender frame `action.frame_range[0] + 12`.
- **Re-export** with the same settings. Changing the axes, scale or Apply Modifiers changes positions or vertex numbers, and comments then move by position or detach.
