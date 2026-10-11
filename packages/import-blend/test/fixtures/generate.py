"""Build the .blend fixtures of Arcue's Blender importer tests, with Blender's own results for them.

Run from the repository root once with each Blender version the tests cover, 4.2 and 5.2:

    blender --background --factory-startup --python-exit-code 1 \
        --python packages/import-blend/test/fixtures/generate.py

It writes <fixture>-<major>.<minor>.blend for each fixture, and beside it <fixture>-<major>.<minor>.json with what
Blender evaluates for the file: world matrices, vertex positions, corner normals and posed vertices for each action.
Positions and matrices are in Arcue's scene space, meters with Y up, which takes Blender's (x, y, z) to (x, z, -y).
Matrices are column-major. The textures the materials fixture uses are written to textures/.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "%d.%d" % bpy.app.version[:2]
LAYERED_ACTIONS = bpy.app.version >= (4, 4, 0)
DIGITS = 6


def reset_scene(fps=24, unit_scale=1.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = unit_scale
    scene.frame_start = 1
    scene.frame_current = 1
    return scene


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, bm, materials=(), collection=None):
    mesh = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(mesh)
    bm.free()
    for material in materials:
        mesh.materials.append(material)
    return link(bpy.data.objects.new(name, mesh), collection)


def material(name, color):
    result = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        result.use_nodes = True
    result.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1.0)
    return result


def activate(obj):
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def fcurves_of(action):
    if LAYERED_ACTIONS and len(action.layers) > 0:
        return [curve for layer in action.layers for strip in layer.strips for bag in strip.channelbags for curve in bag.fcurves]
    return list(action.fcurves)


def assign(id_data, action):
    data = id_data.animation_data or id_data.animation_data_create()
    data.action = action
    if action is not None and LAYERED_ACTIONS and len(action.slots) > 0:
        data.action_slot = action.slots[0]


# ---------------------------------------------------------------- scene space

def rounded(values):
    return [round(float(value), DIGITS) + 0.0 for value in values]


def scene_point(co, unit):
    return [co.x * unit, co.z * unit, -co.y * unit]


def scene_direction(no):
    return [no.x, no.z, -no.y]


def scene_matrix(m, unit):
    axes = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    converted = axes @ m @ axes.inverted()
    converted.translation = converted.translation * unit
    return rounded([converted[row][column] for column in range(4) for row in range(4)])


def save_blend(name, compress=True, datablocks=None, relative_remap=True):
    """Saves the open file, or with `datablocks` only those and what they use, as Blender's own libraries do."""
    path = os.path.join(HERE, "%s-%s.blend" % (name, VERSION))
    if datablocks is None:
        bpy.ops.wm.save_as_mainfile(filepath=path, compress=compress, relative_remap=relative_remap)
    else:
        bpy.data.libraries.write(path, set(datablocks), path_remap="RELATIVE_ALL", compress=compress)
    print("wrote", path)


def save_reference(name, reference):
    reference = dict(reference, blender=bpy.app.version_string, fixture="%s-%s.blend" % (name, VERSION))
    with open(os.path.join(HERE, "%s-%s.json" % (name, VERSION)), "w") as handle:
        json.dump(reference, handle, separators=(",", ":"))
        handle.write("\n")


def rest_pose(scene):
    for obj in scene.objects:
        if obj.type == "ARMATURE":
            obj.data.pose_position = "REST"
    bpy.context.view_layer.update()


def pose_pose(scene):
    for obj in scene.objects:
        if obj.type == "ARMATURE":
            obj.data.pose_position = "POSE"
    bpy.context.view_layer.update()


def world_matrices(scene):
    unit = scene.unit_settings.scale_length
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for obj in scene.objects:
        evaluated = obj.evaluated_get(depsgraph)
        result[obj.name] = {"type": obj.type, "world": scene_matrix(evaluated.matrix_world, unit)}
    return result


def evaluated_positions(obj, scene):
    unit = scene.unit_settings.scale_length
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    positions = []
    for vertex in mesh.vertices:
        positions.extend(scene_point(evaluated.matrix_world @ vertex.co, unit))
    evaluated.to_mesh_clear()
    return rounded(positions)


def evaluated_corner_normals(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    corners = [
        [loop.vertex_index] + rounded(scene_direction(normal.vector))
        for loop, normal in zip(mesh.loops, mesh.corner_normals)
    ]
    evaluated.to_mesh_clear()
    return corners


def mesh_reference(obj, scene):
    unit = scene.unit_settings.scale_length
    mesh = obj.data
    if any(modifier.type == "NODES" for modifier in obj.modifiers):
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    corners = []
    normals = list(mesh.corner_normals) if hasattr(mesh, "corner_normals") else None
    if normals is None:
        mesh.calc_normals_split()
    for index, loop in enumerate(mesh.loops):
        normal = normals[index].vector if normals is not None else loop.normal
        corners.append([loop.vertex_index] + rounded(scene_direction(normal)))
    world = obj.matrix_world
    rest = []
    for vertex in mesh.vertices:
        rest.extend(scene_point(world @ vertex.co, unit))
    colors = None
    attributes = mesh.color_attributes
    if len(attributes) > 0:
        attribute = attributes[attributes.render_color_index]
        colors = {
            "name": attribute.name,
            "domain": attribute.domain,
            "values": rounded([channel for value in attribute.data for channel in value.color]),
        }
    return {
        "vertexCount": len(mesh.vertices),
        "triangles": sum(len(polygon.vertices) - 2 for polygon in mesh.polygons),
        "corners": corners,
        "restPositions": rounded(rest),
        "uvMaps": [layer.name for layer in mesh.uv_layers],
        "renderUv": next((layer.name for layer in mesh.uv_layers if layer.active_render), None),
        "slots": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "colors": colors,
    }


# ---------------------------------------------------------------- features

def polygons_bmesh():
    bm = bmesh.new()
    v = [bm.verts.new(co) for co in [
        (0, 0, 0), (1, 0, 0), (1, 1, 0),
        (2, 0, 0), (3, 0, 0), (3, 1, 0.4), (2, 1, 0),
        (4, 0, 0), (5, 0, 0), (5.3, 0.8, 0), (4.5, 1.4, 0), (3.7, 0.8, 0),
        (6, 0, 0), (8, 0, 0), (8, 1, 0), (7, 1, 0), (7, 2, 0), (6, 2, 0),
        (0, 3, 0), (1, 3, 0), (1, 4, 0.3), (0, 4, 0.3),
        (1, 3, 0.8),
    ]]
    faces = [
        (0, 1, 2),
        (3, 4, 5, 6),
        (7, 8, 9, 10, 11),
        (12, 13, 14, 15, 16, 17),
        (18, 19, 20, 21),
        (19, 22, 20),
    ]
    for index, corners in enumerate(faces):
        face = bm.faces.new([v[i] for i in corners])
        face.material_index = index % 3
        face.smooth = index not in (1, 2)
    bm.edges.ensure_lookup_table()
    uv = bm.loops.layers.uv.new("UVMap")
    detail = bm.loops.layers.uv.new("Detail")
    for face in bm.faces:
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co.x / 8, loop.vert.co.y / 4)
            loop[detail].uv = (loop.vert.co.y, -loop.vert.co.x)
    return bm


def sphere_bmesh(segments=12, rings=7, radius=1.0):
    """A UV sphere built vertex by vertex, so its vertex and face order is the same in every run."""
    bm = bmesh.new()
    top = bm.verts.new((0.0, 0.0, radius))
    grid = []
    for r in range(1, rings):
        theta = math.pi * r / rings
        grid.append([bm.verts.new((radius * math.sin(theta) * math.cos(2 * math.pi * s / segments),
                                   radius * math.sin(theta) * math.sin(2 * math.pi * s / segments),
                                   radius * math.cos(theta))) for s in range(segments)])
    bottom = bm.verts.new((0.0, 0.0, -radius))
    for s in range(segments):
        bm.faces.new((top, grid[0][s], grid[0][(s + 1) % segments]))
    for r in range(rings - 2):
        for s in range(segments):
            bm.faces.new((grid[r][s], grid[r + 1][s], grid[r + 1][(s + 1) % segments], grid[r][(s + 1) % segments]))
    for s in range(segments):
        bm.faces.new((grid[-1][s], bottom, grid[-1][(s + 1) % segments]))
    for face in bm.faces:
        face.smooth = True
    return bm


def cylinder_bmesh(segments=12, radius=1.0, height=1.5):
    bm = bmesh.new()
    rings = [[bm.verts.new((radius * math.cos(2 * math.pi * s / segments), radius * math.sin(2 * math.pi * s / segments), z))
              for s in range(segments)] for z in (0.0, height)]
    for s in range(segments):
        bm.faces.new((rings[0][s], rings[0][(s + 1) % segments], rings[1][(s + 1) % segments], rings[1][s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])
    return bm


def add_smooth_by_angle(obj, angle, ignore_sharpness=False):
    """Adds Blender's Smooth by Angle modifier as Shade Auto Smooth does; False where this Blender cannot load it."""
    activate(obj)
    try:
        if "FINISHED" not in bpy.ops.object.shade_auto_smooth(angle=angle):
            return False
    except RuntimeError:
        return False
    modifier = obj.modifiers[-1]
    if ignore_sharpness:
        inputs = modifier.properties.inputs if hasattr(modifier, "properties") else modifier
        inputs["Socket_1"] = True
    return True


def box_bmesh(size=(1, 1, 1)):
    bm = bmesh.new()
    sx, sy, sz = (value / 2 for value in size)
    v = [bm.verts.new((x * sx, y * sy, z * sz)) for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    for corners in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
        bm.faces.new([v[i] for i in corners])
    return bm


def build_features():
    scene = reset_scene(fps=25)
    red = material("Red", (0.8, 0.1, 0.1))
    green = material("Green", (0.1, 0.8, 0.1))
    blue = material("Blue", (0.1, 0.1, 0.8))

    polygons = mesh_object("Polygons", polygons_bmesh(), (red, None, green))
    polygons.material_slots[2].link = "OBJECT"
    polygons.material_slots[2].material = blue
    mesh = polygons.data
    mesh.uv_layers["Detail"].active_render = True
    mesh.edges[0].use_edge_sharp = True
    paint = mesh.color_attributes.new("Paint", "BYTE_COLOR", "CORNER")
    for index, value in enumerate(paint.data):
        value.color = ((index % 5) / 4, 0.5, 1.0 - (index % 3) / 2, 1.0)
    heat = mesh.color_attributes.new("Heat", "FLOAT_COLOR", "POINT")
    for index, value in enumerate(heat.data):
        value.color = (index / 22, 0.2, 0.7, 1.0)
    mesh.color_attributes.render_color_index = 0
    polygons.location = (0, -6, 0)

    custom = mesh_object("CustomNormals", sphere_bmesh())
    normals = []
    for loop in custom.data.loops:
        co = custom.data.vertices[loop.vertex_index].co
        normals.append((Vector((co.x, co.y, co.z + 0.6))).normalized())
    custom.data.normals_split_custom_set(normals)
    custom.location = (4, 0, 0)

    for name, ignore, x in (("AutoSmooth", False, 7), ("AutoSmoothIgnore", True, 10)):
        cylinder = mesh_object(name, cylinder_bmesh())
        cylinder.location = (x, 0, 0)
        cylinder.data.edges[3].use_edge_sharp = True
        cylinder.data.polygons[6].use_smooth = False
        if not add_smooth_by_angle(cylinder, 0.7, ignore):
            bpy.data.objects.remove(cylinder)

    free = mesh_object("FreeNormals", sphere_bmesh(segments=8, rings=5))
    attribute = free.data.attributes.new("custom_normal", "FLOAT_VECTOR", "CORNER")
    for loop, value in zip(free.data.loops, attribute.data):
        co = free.data.vertices[loop.vertex_index].co
        value.vector = Vector((co.x + 0.3, co.y, co.z)).normalized()
    free.location = (4, -3, 0)

    flat = mesh_object("Flat", sphere_bmesh())
    for polygon in flat.data.polygons:
        polygon.use_smooth = False
    flat.location = (-4, 0, 0)

    smooth = mesh_object("Smooth", sphere_bmesh(segments=10, rings=6))
    smooth.location = (0, 4, 0)

    sharp = mesh_object("SharpEdges", sphere_bmesh(segments=8, rings=5))
    for edge in sharp.data.edges:
        a, b = (sharp.data.vertices[i].co for i in edge.vertices)
        edge.use_edge_sharp = abs(a.z) < 0.3 and abs(b.z) < 0.3
    sharp.location = (0, -3, 2)

    blob = mesh_object("Blob", sphere_bmesh(segments=10, rings=6))
    blob.location = (4, 4, 0)
    group = blob.vertex_groups.new(name="Top")
    group.add([vertex.index for vertex in blob.data.vertices if vertex.co.z > 0], 0.5, "REPLACE")
    basis = blob.shape_key_add(name="Basis")
    up = blob.shape_key_add(name="Up", from_mix=False)
    for point in up.data:
        point.co.z += 0.5
    side = blob.shape_key_add(name="Side", from_mix=False)
    for point in side.data:
        point.co.x += 0.3 * point.co.z
    side.vertex_group = "Top"
    stacked = blob.shape_key_add(name="Stacked", from_mix=False)
    stacked.relative_key = up
    for point, base in zip(stacked.data, up.data):
        point.co = base.co + Vector((0.0, 0.2, 0.0))
    muted = blob.shape_key_add(name="Muted", from_mix=False)
    for point in muted.data:
        point.co.y -= 1.0
    muted.mute = True
    up.value = 0.25
    side.value = 0.5

    props = bpy.data.collections.new("Props")
    scene.collection.children.link(props)
    excluded = bpy.data.collections.new("Excluded")
    scene.collection.children.link(excluded)
    disabled = bpy.data.collections.new("Disabled")
    scene.collection.children.link(disabled)
    disabled.hide_viewport = True
    nested = bpy.data.collections.new("Nested")
    props.children.link(nested)

    orders = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]
    for index, order in enumerate(orders):
        empty = link(bpy.data.objects.new("Rot" + order, None), props)
        empty.rotation_mode = order
        empty.rotation_euler = (0.3 + 0.1 * index, -0.7, 1.1)
        empty.location = (index, 8, 1)
    quat = link(bpy.data.objects.new("RotQuaternion", None), nested)
    quat.rotation_mode = "QUATERNION"
    quat.rotation_quaternion = (0.8, 0.2, -0.4, 0.1)
    quat.location = (0, 9, 0)
    quat.scale = (1, 2, 0.5)
    axis = link(bpy.data.objects.new("RotAxisAngle", None), nested)
    axis.rotation_mode = "AXIS_ANGLE"
    axis.rotation_axis_angle = (0.9, 0.3, 0.5, -0.8)
    axis.location = (1, 9, 0)
    deltas = link(bpy.data.objects.new("Deltas", None), props)
    deltas.location = (2, 9, 0)
    deltas.rotation_euler = (0.2, 0.0, 0.5)
    deltas.scale = (1.5, 1.0, 1.0)
    deltas.delta_location = (0.1, 0.2, 0.3)
    deltas.delta_rotation_euler = (0.0, 0.4, 0.0)
    deltas.delta_scale = (1.0, 2.0, 1.0)

    parent = link(bpy.data.objects.new("Parent", None), props)
    parent.location = (3, 9, 0)
    parent.rotation_euler = (0.0, 0.0, 0.6)
    parent.scale = (2.0, 2.0, 2.0)
    child = mesh_object("Child", box_bmesh((0.3, 0.3, 0.3)), (), props)
    child.location = (4, 10, 1)
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    parent.location = (3, 9, 0.5)
    parent.rotation_euler = (0.2, 0.0, 0.9)

    holder_data = bpy.data.armatures.new("HolderData")
    holder = link(bpy.data.objects.new("Holder", holder_data), props)
    holder.location = (-3, 5, 0)
    holder.rotation_euler = (0.0, 0.0, 0.5)
    activate(holder)
    bpy.ops.object.mode_set(mode="EDIT")
    arm = holder_data.edit_bones.new("Arm")
    arm.head, arm.tail = (0, 0, 0), (0, 0.2, 1.0)
    hand = holder_data.edit_bones.new("Hand")
    hand.head, hand.tail = (0, 0.2, 1.0), (0.4, 0.2, 1.3)
    hand.parent = arm
    hand.use_connect = True
    hand.roll = 0.4
    bpy.ops.object.mode_set(mode="OBJECT")
    holder.pose.bones["Hand"].rotation_quaternion = (0.9, 0.3, 0.1, 0.0)
    prop = mesh_object("Prop", box_bmesh((0.2, 0.2, 0.6)), (), props)
    prop.location = (-3, 5.5, 1.5)
    bpy.context.view_layer.update()
    prop.parent = holder
    prop.parent_type = "BONE"
    prop.parent_bone = "Hand"
    bpy.context.view_layer.update()
    prop.matrix_world = Matrix.Translation((-3, 5.5, 1.5))

    link(bpy.data.objects.new("InExcluded", None), excluded)
    link(bpy.data.objects.new("InDisabled", None), disabled)
    hidden = link(bpy.data.objects.new("HiddenObject", None), props)
    hidden.hide_viewport = True
    bpy.context.view_layer.layer_collection.children["Excluded"].exclude = True

    scene.frame_set(1)
    rest_pose(scene)
    reference = {
        "fps": 25.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in scene.objects if obj.type == "MESH"},
    }
    weights = {"Up": 1.0, "Side": 1.0, "Stacked": 1.0}
    for key in blob.data.shape_keys.key_blocks:
        key.value = weights.get(key.name, 0.0)
    reference["shapeKeys"] = {"Blob": {"weights": weights, "positions": evaluated_positions(blob, scene)}}
    normals = {}
    for name in ("Up", "Side", "Stacked"):
        for key in blob.data.shape_keys.key_blocks:
            key.value = 1.0 if key.name == name else 0.0
        normals[name] = evaluated_corner_normals(blob)
    reference["shapeKeys"]["Blob"]["normals"] = normals
    up.value = 0.25
    side.value = 0.5
    stacked.value = 0.0
    pose_pose(scene)
    save_blend("features")
    save_reference("features", reference)


# ---------------------------------------------------------------- rig

RIG_BONES = [
    # name, head, tail, parent, connected, roll, settings
    ("Root", (0, 0, 0), (0, 0, 0.4), None, False, 0.0, {}),
    ("Spine", (0, 0, 0.4), (0, 0, 0.8), "Root", True, 0.0, {}),
    ("Head", (0, 0, 0.8), (0, 0.1, 1.0), "Spine", True, 0.3, {}),
    ("ArmL", (0.05, 0, 0.75), (0.45, 0, 0.7), "Spine", False, 0.5, {}),
    ("HandL", (0.45, 0, 0.7), (0.6, 0, 0.68), "ArmL", True, 0.0, {"inherit_scale": "NONE"}),
    ("Hinge", (-0.05, 0, 0.75), (-0.45, 0, 0.7), "Spine", False, -0.2, {"use_inherit_rotation": False}),
    ("Aligned", (-0.45, 0, 0.7), (-0.6, 0, 0.7), "Hinge", True, 0.0, {"inherit_scale": "ALIGNED"}),
    ("Average", (0, 0.1, 1.0), (0, 0.1, 1.2), "Head", True, 0.0, {"inherit_scale": "AVERAGE"}),
    ("FixShear", (0, 0.1, 1.2), (0, 0.1, 1.35), "Average", True, 0.0, {"inherit_scale": "FIX_SHEAR"}),
    ("NoLocal", (0, -0.1, 0.2), (0, -0.3, 0.2), "Root", False, 0.0, {"use_local_location": False}),
    ("Helper", (0, 0.2, 0.4), (0, 0.2, 0.6), "Root", False, 0.0, {"use_deform": False}),
]

ROTATION_MODES = {
    "Root": "QUATERNION",
    "Spine": "XYZ",
    "Head": "ZXY",
    "ArmL": "AXIS_ANGLE",
    "HandL": "YZX",
    "Hinge": "QUATERNION",
    "Aligned": "XZY",
    "Average": "ZYX",
    "FixShear": "YXZ",
    "NoLocal": "XYZ",
}


def body_bmesh():
    bm = bmesh.new()
    rings = 7
    segments = 8
    grid = []
    for r in range(rings):
        z = 0.05 + r * 0.17
        grid.append([bm.verts.new((0.12 * math.cos(2 * math.pi * s / segments), 0.1 * math.sin(2 * math.pi * s / segments), z)) for s in range(segments)])
    for r in range(rings - 1):
        for s in range(segments):
            bm.faces.new((grid[r][s], grid[r][(s + 1) % segments], grid[r + 1][(s + 1) % segments], grid[r + 1][s]))
    for side in (1, -1):
        temp = bmesh.new()
        bmesh.ops.create_cube(temp, size=1.0)
        bmesh.ops.scale(temp, vec=Vector((0.6, 0.08, 0.08)), verts=temp.verts)
        bmesh.ops.subdivide_edges(temp, edges=[e for e in temp.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.1], cuts=3)
        bmesh.ops.translate(temp, vec=Vector((side * 0.33, 0, 0.72)), verts=temp.verts)
        mesh = bpy.data.meshes.new("_temp")
        temp.to_mesh(mesh)
        temp.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    for face in bm.faces:
        face.smooth = True
    return bm


def weight_body(body, rig):
    groups = {name: body.vertex_groups.new(name=name) for name, *_ in RIG_BONES}
    body.vertex_groups.new(name="NotABone")
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        index = [vertex.index]
        if abs(x) > 0.2:
            arm, end = ("ArmL", "HandL") if x > 0 else ("Hinge", "Aligned")
            reach = min(max((abs(x) - 0.3) / 0.3, 0.0), 1.0)
            groups[arm].add(index, 1.0 - reach * 0.8, "REPLACE")
            groups[end].add(index, reach * 0.9, "REPLACE")
            if abs(x) > 0.6:
                groups["FixShear"].add(index, 0.2, "REPLACE")
            continue
        if z < 0.4:
            groups["Root"].add(index, 1.0 - z, "REPLACE")
            groups["Spine"].add(index, z, "REPLACE")
        elif z < 0.8:
            groups["Spine"].add(index, 0.7, "REPLACE")
            groups["NoLocal"].add(index, 0.3, "REPLACE")
            groups["Head"].add(index, (z - 0.4) * 1.5, "REPLACE")
        else:
            groups["Head"].add(index, 0.5, "REPLACE")
            groups["Average"].add(index, 0.6, "REPLACE")
    first = body.data.vertices[0].index
    for group in groups.values():
        group.remove([first])
    groups["Helper"].add([first], 1.0, "REPLACE")
    body.vertex_groups["NotABone"].add([1], 1.0, "REPLACE")
    groups["Root"].remove([1])
    groups["Spine"].remove([1])


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.rotation_axis_angle = (0, 0, 1, 0)
        bone.scale = (1, 1, 1)


def key_pose(rig, frame, values):
    for name, settings in values.items():
        bone = rig.pose.bones[name]
        for path, value in settings.items():
            setattr(bone, path, value)
            bone.keyframe_insert(path, frame=frame)


def new_action(id_data, name):
    data = id_data.animation_data or id_data.animation_data_create()
    data.action = None
    action = bpy.data.actions.new(name)
    data.action = action
    return action


def build_rig():
    scene = reset_scene(fps=30)
    data = bpy.data.armatures.new("RigData")
    rig = link(bpy.data.objects.new("Rig", data))
    rig.location = (0.3, -0.2, 0.1)
    rig.rotation_euler = (0, 0, 0.35)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connected, roll, settings in RIG_BONES:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail, bone.roll = head, tail, roll
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, *_rest, settings in RIG_BONES:
        for key, value in settings.items():
            setattr(data.bones[name], key, value)
    for name, mode in ROTATION_MODES.items():
        rig.pose.bones[name].rotation_mode = mode

    body = mesh_object("Body", body_bmesh(), (material("Skin", (0.7, 0.6, 0.5)),))
    weight_body(body, rig)
    body.parent = rig
    modifier = body.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    body.shape_key_add(name="Basis")
    bulge = body.shape_key_add(name="Bulge", from_mix=False)
    bulge.slider_max = 2.0
    for point in bulge.data:
        point.co.x *= 1.4
        point.co.y *= 1.4

    prop = mesh_object("Prop", box_bmesh((0.1, 0.1, 0.3)))
    prop.parent = rig
    prop.parent_type = "BONE"
    prop.parent_bone = "HandL"
    prop.location = (0, 0.05, 0)

    wave = new_action(rig, "Wave")
    reset_pose(rig)
    key_pose(rig, 1, {
        "Root": {"location": (0, 0, 0), "rotation_quaternion": (1, 0, 0, 0)},
        "Spine": {"rotation_euler": (0, 0, 0)},
        "Head": {"rotation_euler": (0.1, 0, 0)},
        "ArmL": {"rotation_axis_angle": (0, 0, 1, 0)},
        "HandL": {"rotation_euler": (0, 0, 0)},
        "Hinge": {"rotation_quaternion": (1, 0, 0, 0)},
        "NoLocal": {"location": (0, 0, 0)},
    })
    key_pose(rig, 6, {
        "Root": {"location": (0.1, 0.05, 0.02), "rotation_quaternion": (0.95, 0.1, 0.2, 0.05)},
        "Spine": {"rotation_euler": (0.3, -0.2, 0.4)},
        "Head": {"rotation_euler": (-0.4, 0.3, 0.2)},
        "ArmL": {"rotation_axis_angle": (0.8, 0.2, 1.0, 0.3)},
        "HandL": {"rotation_euler": (0.5, 0.2, -0.3)},
        "Hinge": {"rotation_quaternion": (0.9, 0.0, 0.4, 0.2)},
        "NoLocal": {"location": (0.05, 0.1, -0.02)},
    })
    key_pose(rig, 12, {
        "Root": {"location": (0.0, 0.1, 0.0), "rotation_quaternion": (0.9, -0.2, 0.1, 0.3)},
        "Spine": {"rotation_euler": (-0.2, 0.3, 0.1)},
        "Head": {"rotation_euler": (0.3, -0.5, 0.0)},
        "ArmL": {"rotation_axis_angle": (-0.6, 0.0, 1.0, 0.5)},
        "HandL": {"rotation_euler": (-0.4, 0.0, 0.6)},
        "Hinge": {"rotation_quaternion": (0.8, 0.3, -0.2, 0.1)},
        "NoLocal": {"location": (-0.05, 0.0, 0.05)},
    })
    rig.keyframe_insert("location", frame=1)
    rig.location = (0.6, -0.1, 0.1)
    rig.keyframe_insert("location", frame=12)
    rig.location = (0.3, -0.2, 0.1)
    wave.use_frame_range = True
    wave.frame_start = 1
    wave.frame_end = 20
    for curve in fcurves_of(wave):
        if curve.data_path.endswith('"Spine"].rotation_euler'):
            curve.modifiers.new("CYCLES")
        if curve.data_path.endswith('"HandL"].rotation_euler'):
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
        if curve.data_path.endswith('"NoLocal"].location'):
            for point in curve.keyframe_points:
                point.interpolation = "CONSTANT"
        if curve.data_path == "location":
            curve.extrapolation = "LINEAR"

    ease = new_action(rig, "Ease")
    reset_pose(rig)
    easings = [
        ("BACK", "AUTO"), ("BOUNCE", "EASE_IN"), ("ELASTIC", "AUTO"), ("SINE", "EASE_IN_OUT"), ("EXPO", "EASE_OUT"),
        ("CIRC", "EASE_IN_OUT"), ("QUAD", "EASE_OUT"), ("CUBIC", "AUTO"), ("QUART", "EASE_IN_OUT"), ("QUINT", "EASE_OUT"),
    ]
    for index in range(len(easings) + 1):
        angle = 0.6 if index % 2 else -0.3
        key_pose(rig, 1 + index * 6, {"Head": {"rotation_euler": (angle, angle * 0.5, 0)}})
        key_pose(rig, 1 + index * 6, {"Spine": {"scale": (1 + 0.1 * index, 1, 1 - 0.03 * index)}})
    for curve in fcurves_of(ease):
        if "rotation_euler" not in curve.data_path:
            continue
        for point, (interpolation, easing) in zip(curve.keyframe_points, easings):
            point.interpolation = interpolation
            point.easing = easing
            point.back = 2.0
            point.amplitude = 0.3
            point.period = 4.0

    stretch = new_action(rig, "Stretch")
    reset_pose(rig)
    key_pose(rig, 1, {"Root": {"scale": (1, 1, 1)}, "Spine": {"scale": (1, 1, 1)}, "Hinge": {"scale": (1, 1, 1)}, "Average": {"rotation_euler": (0, 0, 0)}})
    key_pose(rig, 9, {"Root": {"scale": (1.3, 0.8, 1.1)}, "Spine": {"scale": (0.7, 1.4, 1.2)}, "Hinge": {"scale": (1.5, 1, 1)}, "Average": {"rotation_euler": (0.4, 0.2, 0.1)}})

    spin = new_action(prop, "Spin")
    prop.rotation_euler = (0, 0, 0)
    prop.keyframe_insert("rotation_euler", frame=1)
    prop.rotation_euler = (0, 0, math.pi)
    prop.keyframe_insert("rotation_euler", frame=10)
    prop.rotation_euler = (0, 0, 0)

    key = body.data.shape_keys
    swell = new_action(key, "Swell")
    bulge.value = 0.0
    bulge.keyframe_insert("value", frame=1)
    bulge.value = 1.0
    bulge.keyframe_insert("value", frame=8)
    bulge.value = 0.0

    pulse = new_action(key, "Pulse")
    for frame, value in ((1, 0.0), (4, 1.5), (7, 0.0)):
        bulge.value = value
        bulge.keyframe_insert("value", frame=frame)
    for curve in fcurves_of(pulse):
        for point in curve.keyframe_points:
            point.interpolation = "CONSTANT"
    bulge.value = 0.0

    for action in (wave, ease, stretch, spin, swell, pulse):
        action.use_fake_user = True
    assign(rig, wave)
    assign(prop, spin)
    assign(key, swell)
    reset_pose(rig)
    scene.frame_set(1)

    rest_pose(scene)
    reference = {
        "fps": 30.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in scene.objects if obj.type == "MESH"},
    }
    pose_pose(scene)
    saved = {obj.name: (obj.location.copy(), obj.rotation_euler.copy()) for obj in scene.objects}
    save_blend("rig", compress=False, datablocks=[scene, wave, ease, stretch, spin, swell, pulse])

    clips = {}
    for action, owner, frames in [
        (wave, rig, [1, 2, 5, 6, 9, 12, 13, 16, 20]),
        (ease, rig, list(range(1, 62, 3)) + [61]),
        (stretch, rig, [1, 3, 5, 9]),
        (spin, prop, [1, 4, 7, 10]),
        (swell, key, [1, 3, 8]),
        (pulse, key, [1, 3, 4, 6, 7]),
    ]:
        for id_data in (rig, prop, key):
            assign(id_data, None)
        for obj in scene.objects:
            obj.location, obj.rotation_euler = saved[obj.name]
        reset_pose(rig)
        for block in key.key_blocks:
            block.value = 0.0
        assign(owner, action)
        samples = []
        for frame in frames:
            scene.frame_set(frame)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = rig.evaluated_get(depsgraph)
            bones = {bone.name: scene_matrix(evaluated.matrix_world @ bone.matrix, 1.0) for bone in evaluated.pose.bones}
            samples.append({
                "frame": frame,
                "bones": bones,
                "objects": world_matrices(scene),
                "body": evaluated_positions(body, scene),
            })
        clips[action.name] = samples
    reference["clips"] = clips
    reference["curves"] = {
        action.name: [
            {
                "path": curve.data_path,
                "index": curve.array_index,
                "samples": [[frame / 4, round(curve.evaluate(frame / 4), DIGITS)] for frame in range(-12, 4 * 64 + 1)],
            }
            for curve in fcurves_of(action)
        ]
        for action in (wave, ease)
    }
    save_reference("rig", reference)


# ---------------------------------------------------------------- materials

def save_png(name, width, height, pixel):
    path = os.path.join(HERE, "textures", name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image = bpy.data.images.new(name, width, height, alpha=True)
    image.pixels = [channel for y in range(height) for x in range(width) for channel in pixel(x, y)]
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return image


def principled(mat):
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    return mat.node_tree.nodes["Principled BSDF"]


def build_materials():
    scene = reset_scene()
    checker = save_png("checker.png", 4, 4, lambda x, y: (1.0, 1.0, 1.0, 1.0) if (x + y) % 2 else (0.1, 0.1, 0.1, 1.0))
    orm = save_png("orm.png", 2, 2, lambda x, y: (1.0, 0.4, 0.9, 1.0))
    packed = bpy.data.images.new("PackedNormal", 2, 2)
    packed.pixels = [0.5, 0.5, 1.0, 1.0] * 4
    packed.pack()
    missing = bpy.data.images.new("missing.png", 1, 1)
    missing.source = "FILE"
    missing.filepath = os.path.join(HERE, "textures", "missing.png")
    absolute = bpy.data.images.new("absolute.png", 1, 1)
    absolute.source = "FILE"
    absolute.filepath = "/nonexistent/arcue/absolute.png"

    textured = bpy.data.materials.new("Textured")
    bsdf = principled(textured)
    nodes = textured.node_tree.nodes
    links = textured.node_tree.links
    image = nodes.new("ShaderNodeTexImage")
    image.image = checker
    image.extension = "EXTEND"
    uv_map = nodes.new("ShaderNodeUVMap")
    uv_map.uv_map = "Detail"
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (0.25, 0.5, 0)
    mapping.inputs["Rotation"].default_value = (0, 0, 0.3)
    mapping.inputs["Scale"].default_value = (2, 3, 1)
    links.new(uv_map.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.image = packed
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.5
    links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    orm_image = nodes.new("ShaderNodeTexImage")
    orm_image.image = orm
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm_image.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.5, 0.0, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 2.0

    glass = bpy.data.materials.new("Glass")
    bsdf = principled(glass)
    bsdf.inputs["Base Color"].default_value = (0.2, 0.4, 0.8, 1.0)
    bsdf.inputs["Alpha"].default_value = 0.4
    bsdf.inputs["Roughness"].default_value = 0.1
    bsdf.inputs["Metallic"].default_value = 0.25
    glass.use_backface_culling = True

    absent = bpy.data.materials.new("Absent")
    bsdf = principled(absent)
    nodes = absent.node_tree.nodes
    first = nodes.new("ShaderNodeTexImage")
    first.image = missing
    absent.node_tree.links.new(first.outputs["Color"], bsdf.inputs["Base Color"])
    second = nodes.new("ShaderNodeTexImage")
    second.image = absolute
    absent.node_tree.links.new(second.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 3.0

    diffuse = bpy.data.materials.new("Diffuse")
    principled(diffuse)
    tree = diffuse.node_tree
    shader = tree.nodes.new("ShaderNodeBsdfDiffuse")
    shader.inputs["Color"].default_value = (0.1, 0.6, 0.1, 1.0)
    tree.links.new(shader.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])

    glow = bpy.data.materials.new("Glow")
    principled(glow)
    tree = glow.node_tree
    shader = tree.nodes.new("ShaderNodeEmission")
    shader.inputs["Color"].default_value = (1.0, 0.2, 0.2, 1.0)
    shader.inputs["Strength"].default_value = 4.0
    tree.links.new(shader.outputs["Emission"], tree.nodes["Material Output"].inputs["Surface"])

    mixed = bpy.data.materials.new("Mixed")
    bsdf = principled(mixed)
    bsdf.inputs["Base Color"].default_value = (0.9, 0.1, 0.1, 1.0)
    tree = mixed.node_tree
    mix = tree.nodes.new("ShaderNodeMixShader")
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    tree.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])

    projected = bpy.data.materials.new("Projected")
    bsdf = principled(projected)
    tree = projected.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    tree.links.new(coordinates.outputs["Generated"], image.inputs["Vector"])
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    red_rough = bpy.data.materials.new("RedRough")
    bsdf = principled(red_rough)
    tree = red_rough.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = orm
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image.outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Red"], bsdf.inputs["Roughness"])

    tinted = bpy.data.materials.new("Tinted")
    bsdf = principled(tinted)
    tree = tinted.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    hue = tree.nodes.new("ShaderNodeHueSaturation")
    hue.inputs["Hue"].default_value = 0.2
    tree.links.new(image.outputs["Color"], hue.inputs["Color"])
    tree.links.new(hue.outputs["Color"], bsdf.inputs["Base Color"])

    cutout = bpy.data.materials.new("Cutout")
    bsdf = principled(cutout)
    tree = cutout.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    mask = tree.nodes.new("ShaderNodeTexImage")
    mask.image = orm
    tree.links.new(mask.outputs["Color"], bsdf.inputs["Alpha"])

    blended = bpy.data.materials.new("Blended")
    principled(blended)
    tree = blended.node_tree
    mask = tree.nodes.new("ShaderNodeTexImage")
    mask.image = checker
    blend = tree.nodes.new("ShaderNodeMixShader")
    rough = tree.nodes.new("ShaderNodeBsdfDiffuse")
    tree.links.new(mask.outputs["Color"], blend.inputs["Fac"])
    tree.links.new(tree.nodes["Principled BSDF"].outputs["BSDF"], blend.inputs[1])
    tree.links.new(rough.outputs["BSDF"], blend.inputs[2])
    tree.links.new(blend.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])

    object_normal = bpy.data.materials.new("ObjectNormal")
    bsdf = principled(object_normal)
    tree = object_normal.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = packed
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.space = "OBJECT"
    tree.links.new(image.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    grid = bpy.data.images.new("UVGrid", 8, 8)
    grid.generated_type = "UV_GRID"
    generated = bpy.data.materials.new("Generated")
    bsdf = principled(generated)
    tree = generated.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = grid
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    materials = [textured, glass, absent, diffuse, glow, mixed, projected, red_rough, tinted, cutout, blended]
    materials += [object_normal, generated]
    for index, mat in enumerate(materials):
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        uv = bm.loops.layers.uv.new("UVMap")
        bm.loops.layers.uv.new("Detail")
        for face in bm.faces:
            for loop in face.loops:
                loop[uv].uv = (loop.vert.co.x + 0.5, loop.vert.co.y + 0.5)
        obj = mesh_object(mat.name + "Plane", bm, (mat,))
        obj.location = (index * 1.5, 0, 0)

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bm.loops.layers.uv.new("Detail")
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co.x + 0.5, loop.vert.co.y + 0.5)
    swapped = mesh_object("SwappedPlane", bm, (textured,))
    swapped.data.uv_layers["UVMap"].active_render = True
    swapped.location = (0, 1.5, 0)

    save_blend("materials")
    for image in (checker, orm, missing):
        image.filepath = "//textures/" + image.name
    absolute.filepath = "/nonexistent/arcue/absolute.png"
    save_blend("materials", relative_remap=False)
    save_reference("materials", {"fps": 24.0, "unitScale": 1.0})


# ---------------------------------------------------------------- scenes

def build_scenes():
    """Objects hidden with the eye, a collection in two places, a collection instance, absolute shape keys, a sheared
    child, a constraint whose influence is animated from zero, geometry only a modifier makes, an Armature modifier
    limited by a vertex group, and data linked from another file."""
    scene = reset_scene()
    library_path = os.path.join(HERE, "library-%s.blend" % VERSION)
    shared = bpy.data.meshes.new("SharedMesh")
    box_bmesh().to_mesh(shared)
    library_rock = bpy.data.objects.new("LibraryRock", shared)
    paint = material("LibraryPaint", (0.2, 0.5, 0.9))
    skeleton = bpy.data.armatures.new("LibrarySkeleton")
    library_rig = bpy.data.objects.new("LibraryRig", skeleton)
    holder = bpy.data.objects.new("WaveHolder", None)
    for frame, x in ((1, 0.0), (10, 1.0)):
        holder.location.x = x
        holder.keyframe_insert("location", index=0, frame=frame)
    wave = holder.animation_data.action
    wave.name = "LibraryWave"
    datablocks = {shared, library_rock, paint, library_rig, wave}
    bpy.data.libraries.write(library_path, datablocks, path_remap="RELATIVE_ALL")
    bpy.data.objects.remove(library_rock)
    bpy.data.objects.remove(library_rig)
    bpy.data.meshes.remove(shared)
    bpy.data.materials.remove(paint)
    bpy.data.armatures.remove(skeleton)
    bpy.data.objects.remove(holder)
    bpy.data.actions.remove(wave)
    with bpy.data.libraries.load(library_path, link=True, relative=True) as (source, target):
        target.meshes = ["SharedMesh"]
        target.objects = ["LibraryRock", "LibraryRig"]
        target.materials = ["LibraryPaint"]
        target.actions = ["LibraryWave"]
    link(bpy.data.objects.new("Borrowed", target.meshes[0]))
    link(target.objects[0])
    mesh_object("Painted", box_bmesh(), (target.materials[0],))
    rigs = bpy.data.collections.new("Rigs")
    scene.collection.children.link(rigs)
    link(target.objects[1], rigs)
    rigged = mesh_object("Rigged", box_bmesh())
    rigged.modifiers.new("Armature", "ARMATURE").object = target.objects[1]
    animated = link(bpy.data.objects.new("Animated", None))
    animated.animation_data_create().action = target.actions[0]

    mask_rig = link(bpy.data.objects.new("MaskRig", bpy.data.armatures.new("MaskSkeleton")))
    masked = mesh_object("Masked", box_bmesh())
    masked.vertex_groups.new(name="Blend")
    masking = masked.modifiers.new("Armature", "ARMATURE")
    masking.object = mask_rig
    masking.vertex_group = "Blend"
    masking.use_deform_preserve_volume = True

    spinner = link(bpy.data.objects.new("Spinner", None))
    for frame, mode in ((1, "XYZ"), (10, "QUATERNION")):
        spinner.rotation_mode = mode
        spinner.keyframe_insert("rotation_mode", frame=frame)
        spinner.keyframe_insert("rotation_euler", frame=frame)
    spinner.rotation_mode = "XYZ"

    mesh_object("Visible", box_bmesh())
    eye = mesh_object("EyeHidden", box_bmesh())
    mesh_object("Rock_LOD0", box_bmesh())
    lod1 = mesh_object("Rock_LOD1", box_bmesh((0.5, 0.5, 0.5)))
    tucked = bpy.data.collections.new("Tucked")
    scene.collection.children.link(tucked)
    mesh_object("TuckedAway", box_bmesh(), collection=tucked)
    kit = bpy.data.collections.new("Kit")
    mesh_object("KitPiece", box_bmesh(), collection=kit)
    instance = link(bpy.data.objects.new("KitInstance", None))
    instance.instance_type = "COLLECTION"
    instance.instance_collection = kit
    morph = mesh_object("Morph", box_bmesh())
    morph.shape_key_add(name="Basis")
    grown = morph.shape_key_add(name="Grown", from_mix=False)
    for point in grown.data:
        point.co *= 1.5
    morph.data.shape_keys.use_relative = False

    for side in ("Left", "Right"):
        holder = bpy.data.collections.new(side)
        scene.collection.children.link(holder)
    both = bpy.data.collections.new("Both")
    bpy.data.collections["Left"].children.link(both)
    bpy.data.collections["Right"].children.link(both)
    mesh_object("SharedPiece", box_bmesh(), collection=both)

    follower = mesh_object("Follower", box_bmesh())
    follow = follower.constraints.new("COPY_LOCATION")
    follow.target = bpy.data.objects["Visible"]
    for frame, influence in ((1, 0.0), (10, 1.0)):
        follow.influence = influence
        follow.keyframe_insert("influence", frame=frame)
    follow.influence = 0.0

    tree = bpy.data.node_groups.new("MakeCube", "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    cube = tree.nodes.new("GeometryNodeMeshCube")
    tree.links.new(cube.outputs["Mesh"], tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    generated = link(bpy.data.objects.new("Generated", bpy.data.meshes.new("GeneratedMesh")))
    generated.modifiers.new("MakeCube", "NODES").node_group = tree

    grouped = link(bpy.data.objects.new("Grouped", None))
    for frame, y in ((1, 0.0), (10, 5.0)):
        grouped.location.y = y
        grouped.keyframe_insert("location", index=1, frame=frame, group="Moves")
    grouped_action = grouped.animation_data.action
    if hasattr(grouped_action, "layers") and len(grouped_action.layers) > 0:
        grouped_action.layers[0].strips[0].channelbags[0].groups["Moves"].mute = True
    else:
        grouped_action.groups["Moves"].mute = True
    grouped.location.y = 0.0

    rel_rig = link(bpy.data.objects.new("RelRig", bpy.data.armatures.new("RelSkeleton")))
    rel_rig.location = (1, 2, 0)
    activate(rel_rig)
    bpy.ops.object.mode_set(mode="EDIT")
    bone = rel_rig.data.edit_bones.new("Holder")
    bone.head, bone.tail = (1, 0, 0), (1, 0, 2)
    bpy.ops.object.mode_set(mode="OBJECT")
    rel_rig.data.bones["Holder"].use_relative_parent = True
    rel_child = link(bpy.data.objects.new("RelChild", None))
    rel_child.location = (0.5, 0.5, 0.5)
    rel_child.parent = rel_rig
    rel_child.parent_type = "BONE"
    rel_child.parent_bone = "Holder"

    squashed = link(bpy.data.objects.new("Squashed", None))
    squashed.rotation_euler = (0, 0, 0.5)
    squashed.scale = (1, 2, 1)
    skewed = mesh_object("Skewed", box_bmesh())
    skewed.location = (1, 0, 0)

    layer = bpy.context.view_layer
    layer.update()
    skewed.parent = squashed
    skewed.matrix_parent_inverse = squashed.matrix_world.inverted()
    layer.layer_collection.children["Left"].children["Both"].exclude = True
    layer.layer_collection.children["Rigs"].exclude = True
    eye.hide_set(True)
    lod1.hide_set(True)
    layer.layer_collection.children["Tucked"].hide_viewport = True
    scene.frame_set(1)
    reference = {"fps": 24.0, "unitScale": 1.0, "objects": world_matrices(scene)}
    save_blend("scenes", compress=False)
    os.remove(library_path)
    save_reference("scenes", reference)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    builders = (("features", build_features), ("rig", build_rig), ("materials", build_materials), ("scenes", build_scenes))
    for name, build in builders:
        if only is None or name in only:
            build()


main()
