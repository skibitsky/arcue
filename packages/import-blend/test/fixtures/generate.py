"""Build the .blend fixtures of Arcue's Blender importer tests, with Blender's own results for them.

Run from the repository root once with each Blender version the tests cover, 4.2 and 5.2:

    blender --background --factory-startup --python-exit-code 1 \
        --python packages/import-blend/test/fixtures/generate.py

It writes <fixture>-<major>.<minor>.blend for each fixture, and beside it <fixture>-<major>.<minor>.json with what
Blender evaluates for the file: world matrices, vertex positions, corner normals and posed vertices for each action, and
what Cycles bakes for the shading fixture's materials.
Positions and matrices are in Arcue's scene space, meters with Y up, which takes Blender's (x, y, z) to (x, z, -y).
Matrices are column-major. The textures the materials fixture uses are written to textures/.
"""

import json
import math
import os
import random
import sys
import tempfile

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


def forget_absolute_path(library, filepath):
    """Points the library at `filepath` and overwrites the absolute path it was linked from, which Blender would save
    after the end of the shorter path and, in 4.2, in the library's runtime data. Call it before the file is first
    saved, so that the relative path stays relative."""
    library.filepath = "/" + "_" * 1000
    library.filepath = filepath


def forget_library_paths():
    """Points the libraries inside Blender's own install, such as the Essentials file that Shade Auto Smooth links its
    node group from in 5.x, at their file name alone, and the libraries here at their path from here, so that a
    fixture keeps neither where Blender is installed nor where the fixtures are. Node groups appended with a reference
    to the file they came from, as Shade Auto Smooth appends its group in 4.2, are replaced with copies without one."""
    for group in list(bpy.data.node_groups):
        if group.library is None and group.library_weak_reference is not None:
            name = group.name
            copy = group.copy()
            group.user_remap(copy)
            bpy.data.node_groups.remove(group)
            copy.name = name
    install = os.path.normpath(bpy.utils.system_resource("DATAFILES"))
    for library in bpy.data.libraries:
        path = os.path.normpath(bpy.path.abspath(library.filepath))
        if path.startswith(install + os.sep):
            forget_absolute_path(library, "//" + os.path.basename(path))
        elif path.startswith(HERE + os.sep):
            forget_absolute_path(library, "//" + os.path.relpath(path, HERE).replace(os.sep, "/"))


def overwrite_string(owner, name, value):
    """Sets a string property after filling it, since a file keeps the bytes after the end of the value too: an
    earlier value, or memory that Blender reused without clearing."""
    filler = "_" * (owner.bl_rna.properties[name].length_max - 1)
    setattr(owner, name, filler.encode() if isinstance(value, bytes) else filler)
    setattr(owner, name, value)


def forget_machine_paths():
    """Empties the folder that file browsers open in, which is the home folder, makes image paths into the fixtures
    folder relative, and overwrites the bytes after each image's and packed file's path, which can hold a longer path
    the image had before or, in 4.2, a path from memory that Blender reused."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params:
                    overwrite_string(space.params, "directory", b"")
    for image in bpy.data.images:
        if image.library is None:
            path = image.filepath_raw
            if os.path.isabs(path) and os.path.normpath(path).startswith(HERE + os.sep):
                path = "//" + os.path.relpath(path, HERE).replace(os.sep, "/")
            overwrite_string(image, "filepath_raw", path)
        for packed in image.packed_files:
            overwrite_string(packed, "filepath", packed.filepath)


def check_machine_paths(name, write):
    """Writes the fixture uncompressed to a scratch file with `write` and fails when it holds the fixtures folder, the
    home folder or Blender's install folder, which would tell where and by whom it was made, or the end of a path into
    the fixtures folder or Blender's assets, which is left where a shorter path overwrote a longer one or where a path
    leads out of the fixtures folder."""
    scratch = os.path.join(HERE, ".%s-%s.check.blend" % (name, VERSION))
    write(scratch, False)
    with open(scratch, "rb") as handle:
        data = handle.read()
    os.remove(scratch)
    for folder in (HERE, os.path.expanduser("~"), bpy.utils.system_resource("DATAFILES")):
        if len(folder) > 1 and os.fsencode(folder) in data:
            raise RuntimeError("%s-%s.blend would keep the folder %s" % (name, VERSION, folder))
    for tail in (os.path.join("import-blend", "test", "fixtures"), os.path.join("datafiles", "assets")):
        if os.fsencode(tail) in data:
            raise RuntimeError("%s-%s.blend would keep part of a path ending in %s" % (name, VERSION, tail))


def save_blend(name, compress=True, datablocks=None, relative_remap=True):
    """Saves the open file, or with `datablocks` only those and what they use, as Blender's own libraries do."""
    path = os.path.join(HERE, "%s-%s.blend" % (name, VERSION))
    if datablocks is None:
        forget_library_paths()
        forget_machine_paths()

        def write(target, compressed):
            bpy.ops.wm.save_as_mainfile(filepath=target, compress=compressed, relative_remap=relative_remap,
                                        copy=target != path)
    else:
        def write(target, compressed):
            bpy.data.libraries.write(target, set(datablocks), path_remap="RELATIVE_ALL", compress=compressed)
    check_machine_paths(name, write)
    write(path, compress)
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


def set_modifier_input(modifier, name, value):
    """Sets a Geometry Nodes modifier's input by its socket's name, as each Blender version stores inputs."""
    identifier = next(
        item.identifier
        for item in modifier.node_group.interface.items_tree
        if item.item_type == "SOCKET" and item.in_out == "INPUT" and item.name == name
    )
    if hasattr(modifier, "properties"):
        getattr(modifier.properties.inputs, identifier).value = value
    else:
        modifier[identifier] = value
    modifier.id_data.update_tag()


def essentials_group(name, library):
    """Appends a node group from the Essentials asset files that ship with Blender."""
    path = os.path.join(bpy.utils.system_resource("DATAFILES"), "assets", *library.split("/"))
    with bpy.data.libraries.load(path) as (_, target):
        target.node_groups = [name]
    return target.node_groups[0]


def add_smooth_by_angle(obj, angle, ignore_sharpness=False):
    """Adds Blender's Smooth by Angle modifier as Shade Auto Smooth does. Blender 4.2 cannot load the asset in the
    background, so there the node group comes from the Essentials file and the operator's steps are repeated."""
    activate(obj)
    try:
        added = "FINISHED" in bpy.ops.object.shade_auto_smooth(angle=angle)
    except RuntimeError:
        added = False
    if added:
        modifier = obj.modifiers[-1]
    else:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        modifier = obj.modifiers.new("Smooth by Angle", "NODES")
        modifier.node_group = essentials_group("Smooth by Angle", "geometry_nodes/smooth_by_angle.blend")
        if hasattr(modifier, "use_pin_to_last"):
            modifier.use_pin_to_last = True
        set_modifier_input(modifier, "Angle", angle)
    if ignore_sharpness:
        set_modifier_input(modifier, "Ignore Sharpness", True)
    return modifier


def auto_smooth_group(name="Auto Smooth", geometry="Geometry", angle_name="Angle"):
    """The "Auto Smooth" node group that Blender 4.1 and later add when they open an older file whose meshes use Auto
    Smooth, built as their versioning code builds it. Blender names the group and its sockets in the interface language
    when it translates new data, as `name`, `geometry` and `angle_name` can."""
    group = bpy.data.node_groups.new(name, "GeometryNodeTree")
    group.interface.new_socket(name=geometry, in_out="OUTPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket(name=geometry, in_out="INPUT", socket_type="NodeSocketGeometry")
    angle = group.interface.new_socket(name=angle_name, in_out="INPUT", socket_type="NodeSocketFloat")
    angle.min_value, angle.max_value, angle.subtype = 0.0, math.pi, "ANGLE"
    nodes, links = group.nodes, group.links
    group_input = nodes.new("NodeGroupInput")
    group_output = nodes.new("NodeGroupOutput")
    edges = nodes.new("GeometryNodeSetShadeSmooth")
    edges.domain = "EDGE"
    faces = nodes.new("GeometryNodeSetShadeSmooth")
    faces.domain = "FACE"
    edge_angle = nodes.new("GeometryNodeInputMeshEdgeAngle")
    edge_smooth = nodes.new("GeometryNodeInputEdgeSmooth")
    face_smooth = nodes.new("GeometryNodeInputShadeSmooth")
    both = nodes.new("FunctionNodeBooleanMath")
    both.operation = "AND"
    within = nodes.new("FunctionNodeCompare")
    within.data_type, within.operation = "FLOAT", "LESS_EQUAL"
    links.new(edge_angle.outputs["Unsigned Angle"], within.inputs[0])
    links.new(group_input.outputs[angle_name], within.inputs[1])
    links.new(within.outputs["Result"], both.inputs[0])
    links.new(face_smooth.outputs[0], both.inputs[1])
    links.new(group_input.outputs[geometry], edges.inputs["Geometry"])
    links.new(edge_smooth.outputs[0], edges.inputs["Selection"])
    links.new(both.outputs[0], edges.inputs["Shade Smooth"])
    links.new(edges.outputs["Geometry"], faces.inputs["Geometry"])
    links.new(faces.outputs["Geometry"], group_output.inputs[geometry])
    return group


def rewired_auto_smooth_group():
    """The "Auto Smooth" group under another name, with a float input before the angle and a reroute between the angle
    and its comparison, which leave what it does unchanged."""
    group = auto_smooth_group("Rewired Smoothing")
    strength = group.interface.new_socket(name="Strength", in_out="INPUT", socket_type="NodeSocketFloat")
    group.interface.move(strength, 2)
    group_input = next(node for node in group.nodes if node.bl_idname == "NodeGroupInput")
    within = next(node for node in group.nodes if node.bl_idname == "FunctionNodeCompare")
    reroute = group.nodes.new("NodeReroute")
    group.links.new(group_input.outputs["Angle"], reroute.inputs[0])
    group.links.new(reroute.outputs[0], within.inputs[1])
    return group


def linked_smoothing_groups(library_name):
    """Writes Smooth by Angle from the Essentials and the "Auto Smooth" group to a library in the fixtures folder and
    links them from it by its bare file name, so that the fixture holds only their names. Remove the library after the
    fixture is saved."""
    assets = os.path.join(bpy.utils.system_resource("DATAFILES"), "assets")
    essentials = next(
        os.path.relpath(path, assets)
        for path in (os.path.join(assets, "geometry_nodes", "smooth_by_angle.blend"),
                     os.path.join(assets, "nodes", "geometry_nodes_essentials.blend"))
        if os.path.exists(path)
    )
    groups = {essentials_group("Smooth by Angle", essentials), auto_smooth_group()}
    names = sorted(group.name for group in groups)
    working_dir = os.getcwd()
    os.chdir(HERE)
    try:
        bpy.data.libraries.write(library_name, groups, path_remap="NONE")
        for group in groups:
            bpy.data.node_groups.remove(group)
        with bpy.data.libraries.load(library_name, link=True) as (_, target):
            target.node_groups = names
    finally:
        os.chdir(working_dir)
    forget_absolute_path(target.node_groups[0].library, "//" + library_name)
    return target.node_groups


def sharpening_group():
    """A group made of the kinds of nodes the auto smooth groups use that does something else: it shades every face
    smooth, and then each edge smooth only where its faces meet at more than 10 degrees."""
    group = bpy.data.node_groups.new("Sharpen Smooth Edges", "GeometryNodeTree")
    group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    threshold = group.interface.new_socket(name="Threshold", in_out="INPUT", socket_type="NodeSocketFloat")
    threshold.default_value = math.radians(10)
    group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes, links = group.nodes, group.links
    group_input = nodes.new("NodeGroupInput")
    above = nodes.new("FunctionNodeCompare")
    above.data_type, above.operation = "FLOAT", "GREATER_THAN"
    links.new(nodes.new("GeometryNodeInputMeshEdgeAngle").outputs["Unsigned Angle"], above.inputs[0])
    links.new(group_input.outputs["Threshold"], above.inputs[1])
    faces = nodes.new("GeometryNodeSetShadeSmooth")
    faces.domain = "FACE"
    edges = nodes.new("GeometryNodeSetShadeSmooth")
    edges.domain = "EDGE"
    links.new(group_input.outputs["Geometry"], faces.inputs["Geometry"])
    links.new(faces.outputs["Geometry"], edges.inputs["Geometry"])
    links.new(above.outputs["Result"], edges.inputs["Shade Smooth"])
    links.new(edges.outputs["Geometry"], nodes.new("NodeGroupOutput").inputs["Geometry"])
    return group


def node_of(group, idname, domain=None):
    """The group's first node of a type, and of a domain when one is given."""
    return next(node for node in group.nodes if node.bl_idname == idname and (domain is None or node.domain == domain))


def ignoring_smooth_group(name):
    """Smooth by Angle as the Essentials hold it: the "Auto Smooth" group with an Ignore Sharpness switch that each of
    its smooth flags is ORed with."""
    group = auto_smooth_group(name, "Mesh")
    group.interface.new_socket(name="Ignore Sharpness", in_out="INPUT", socket_type="NodeSocketBool")
    edges, both = node_of(group, "GeometryNodeSetShadeSmooth", "EDGE"), node_of(group, "FunctionNodeBooleanMath")
    for flag, target in (("GeometryNodeInputEdgeSmooth", edges.inputs["Selection"]),
                         ("GeometryNodeInputShadeSmooth", both.inputs[1])):
        either = group.nodes.new("FunctionNodeBooleanMath")
        either.operation = "OR"
        group.links.new(node_of(group, flag).outputs[0], either.inputs[0])
        group.links.new(node_of(group, "NodeGroupInput").outputs["Ignore Sharpness"], either.inputs[1])
        group.links.new(either.outputs[0], target)
    return group


def pass_mesh_to_active_output(group):
    """Adds a second Group Output that Blender reads, which passes the mesh on unchanged."""
    extra = group.nodes.new("NodeGroupOutput")
    group.links.new(node_of(group, "NodeGroupInput").outputs[0], extra.inputs[0])
    extra.is_active_output = True


def output_float_first(group):
    """Puts a float output first and links the shaded mesh to it too, which Blender refuses."""
    value = group.interface.new_socket(name="Value", in_out="OUTPUT", socket_type="NodeSocketFloat")
    group.interface.move(value, 0)
    shaded = node_of(group, "GeometryNodeSetShadeSmooth", "FACE").outputs[0]
    group.links.new(shaded, node_of(group, "NodeGroupOutput").inputs[0])


def compare_signed_angle(group):
    group.links.new(node_of(group, "GeometryNodeInputMeshEdgeAngle").outputs["Signed Angle"],
                    node_of(group, "FunctionNodeCompare").inputs[0])


def compare_whole_radians(group):
    """Compares the edge angle with the angle input as integers."""
    compare = node_of(group, "FunctionNodeCompare")
    compare.data_type = "INT"
    a, b = (next(socket for socket in compare.inputs if socket.name == name and socket.enabled) for name in "AB")
    group.links.new(node_of(group, "GeometryNodeInputMeshEdgeAngle").outputs["Unsigned Angle"], a)
    group.links.new(node_of(group, "NodeGroupInput").outputs["Angle"], b)


def compare_constant_angle(group):
    value = group.nodes.new("ShaderNodeValue")
    value.outputs[0].default_value = 0.62
    group.links.new(value.outputs[0], node_of(group, "FunctionNodeCompare").inputs[1])


def swap_operands(group):
    """Swaps the inputs of every Boolean Math node, which leaves what the group does unchanged."""
    for node in group.nodes:
        if node.bl_idname == "FunctionNodeBooleanMath":
            first, second = (node.inputs[index].links[0].from_socket for index in (0, 1))
            group.links.new(second, node.inputs[0])
            group.links.new(first, node.inputs[1])


def set_edges_on_faces(group):
    node_of(group, "GeometryNodeSetShadeSmooth", "EDGE").domain = "FACE"


def set_faces_on_edges(group):
    node_of(group, "GeometryNodeSetShadeSmooth", "FACE").domain = "EDGE"


def shade_faces_flat(group):
    node_of(group, "GeometryNodeSetShadeSmooth", "FACE").inputs["Shade Smooth"].default_value = False


def subdivide_first(group):
    subdivide = group.nodes.new("GeometryNodeSubdivideMesh")
    group.links.new(node_of(group, "NodeGroupInput").outputs[0], subdivide.inputs["Mesh"])
    group.links.new(subdivide.outputs[0], node_of(group, "GeometryNodeSetShadeSmooth", "EDGE").inputs["Geometry"])


def ignore_on_edges_only(group):
    both = next(node for node in group.nodes if node.bl_idname == "FunctionNodeBooleanMath" and node.operation == "AND")
    group.links.new(node_of(group, "GeometryNodeInputShadeSmooth").outputs[0], both.inputs[1])


def ignore_always(group):
    """ORs the smooth flags with a Boolean node that is on, in place of the Ignore Sharpness input."""
    switch = group.nodes.new("FunctionNodeInputBool")
    switch.boolean = True
    for node in group.nodes:
        if node.bl_idname == "FunctionNodeBooleanMath" and node.operation == "OR":
            group.links.new(switch.outputs[0], node.inputs[1])


def nest_inputs_in_panels(group):
    """Moves the mesh input into a panel inside a panel and the angle into a later panel, which leaves the mesh the
    group's first input."""
    interface = group.interface
    outer = interface.new_panel(name="Outer")
    inner = interface.new_panel(name="Inner")
    interface.move_to_parent(inner, outer, 0)
    later = interface.new_panel(name="Later")
    inputs = [item for item in interface.items_tree if item.item_type == "SOCKET" and item.in_out == "INPUT"]
    interface.move_to_parent(next(item for item in inputs if item.socket_type == "NodeSocketGeometry"), inner, 0)
    interface.move_to_parent(next(item for item in inputs if item.name == "Angle"), later, 0)


def put_angle_first(group):
    """Moves the mesh input below the angle, which Blender refuses."""
    mesh = next(item for item in group.interface.items_tree
                if item.item_type == "SOCKET" and item.in_out == "INPUT" and item.socket_type == "NodeSocketGeometry")
    group.interface.move(mesh, len(group.interface.items_tree))


# Each object's group is the "Auto Smooth" group, or Smooth by Angle when the modifier sets Ignore Sharpness, with one
# change, and the modifier's Angle is 1.2 unless it sets another. Each change but the last two makes Blender shade the
# dimpled sphere otherwise than the auto smooth groups do with the same inputs.
SMOOTHING_CHANGES = (
    ("InactiveOutputSmooth", pass_mesh_to_active_output, {}),
    ("FloatOutputSmooth", output_float_first, {}),
    ("SignedAngleSmooth", compare_signed_angle, {"Angle": 0.3}),
    ("IntegerAngleSmooth", compare_whole_radians, {}),
    ("ConstantAngleSmooth", compare_constant_angle, {}),
    ("EdgesOnFacesSmooth", set_edges_on_faces, {}),
    ("FacesOnEdgesSmooth", set_faces_on_edges, {}),
    ("FlatFacesSmooth", shade_faces_flat, {}),
    ("SubdividedSmooth", subdivide_first, {}),
    ("AngleFirstSmooth", put_angle_first, {}),
    ("HalfIgnoreSmooth", ignore_on_edges_only, {"Ignore Sharpness": True}),
    ("AlwaysIgnoreSmooth", ignore_always, {"Ignore Sharpness": False}),
    ("SwappedSmooth", swap_operands, {"Ignore Sharpness": True}),
    ("PaneledSmooth", nest_inputs_in_panels, {}),
)
UNCHANGED_SMOOTHING = {"SwappedSmooth", "PaneledSmooth"}


def dimpled_sphere_bmesh():
    """An 8 by 5 sphere whose top is pushed in, so that some of its edges are concave."""
    bm = sphere_bmesh(segments=8, rings=5)
    bm.verts.ensure_lookup_table()
    bm.verts[0].co.z = 0.2
    return bm


def bmesh_from(positions, faces, edges=()):
    """A mesh with exactly these vertices, edges first in this order, and faces, all shaded smooth."""
    bm = bmesh.new()
    verts = [bm.verts.new(co) for co in positions]
    for a, b in edges:
        bm.edges.new((verts[a], verts[b]))
    for corners in faces:
        bm.faces.new([verts[i] for i in corners]).smooth = True
    return bm


def strip_bmesh():
    return bmesh_from([(i * 0.5, j, 0.0) for j in range(2) for i in range(7)], [(i, i + 1, i + 8, i + 7) for i in range(6)])


def add_fold(obj):
    """A shape key that tilts the far part of a strip up by 50 degrees, creasing it along one edge."""
    obj.shape_key_add(name="Basis")
    fold = obj.shape_key_add(name="Fold", from_mix=False)
    fold.value = 0.0
    for index, point in enumerate(fold.data):
        if index % 7 >= 4:
            point.co.z += (index % 7 - 3) * 0.6


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
        add_smooth_by_angle(cylinder, 0.7, ignore)
        side = next(edge for edge in cylinder.data.edges if set(edge.vertices) == {0, 12})
        side.use_edge_sharp = True
        cylinder.data.polygons[6].use_smooth = False

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
        edge.use_edge_sharp = abs(a.z) < 0.35 and abs(a.z - b.z) < 1e-6
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

    old_smooth = mesh_object("OldAutoSmooth", sphere_bmesh(segments=8, rings=5))
    for polygon in old_smooth.data.polygons[:3]:
        polygon.use_smooth = False
    old_smooth.data.edges[20].use_edge_sharp = True
    old_modifier = old_smooth.modifiers.new("Auto Smooth", "NODES")
    old_modifier.node_group = auto_smooth_group()
    set_modifier_input(old_modifier, "Angle", 1.2)
    old_smooth.location = (7, -3, 0)

    grid = mesh_object("CustomGrid", bmesh_from(
        [(0, 0, 0), (1, 0, 0.2), (2, 0, 0), (0, 1, 0.1), (1, 1, 0.5), (2, 1, 0.1), (0, 2, 0), (1, 2, 0.3), (2, 2, 0)],
        [(7, 4, 5, 8), (1, 2, 5, 4), (0, 1, 4, 3), (3, 4, 7, 6)],
        [(4, 5), (7, 4), (5, 8), (8, 7), (1, 2), (2, 5), (4, 1), (0, 1), (4, 3), (3, 0), (7, 6), (6, 3)],
    ))
    grid.data.normals_split_custom_set([
        Vector((grid.data.vertices[loop.vertex_index].co.x - 0.7, 0.2, 1.0)).normalized() for loop in grid.data.loops
    ])
    grid.location = (10, -3, 0)

    outer = [(2 * math.cos(math.pi * k / 4), 2 * math.sin(math.pi * k / 4)) for k in range(8)]
    inner = [(math.cos(math.pi * k / 4), math.sin(math.pi * k / 4)) for k in range(8)]
    ngon_shapes = [
        [(0, 0), (4, 0), (4, 4), (0, 4), (0, 0), (1, 1), (1, 3), (3, 3), (3, 1), (1, 1)],
        outer + [outer[0], inner[0]] + inner[:0:-1] + [inner[0]],
        [(0, 0), (4, 0), (4, 4), (2, 4), (2, 1.5), (2, 4), (0, 4)],
        [(0, 0), (2, 0), (2, 2), (1, 1), (1, 1), (0, 2)],
        [(0, 0), (3, 0), (3, 3), (2, 3), (2, 1), (1, 1), (1, 3), (0, 3)],
    ]
    ngon_positions, ngon_faces = [], []
    for index, shape in enumerate(ngon_shapes):
        ngon_faces.append(range(len(ngon_positions), len(ngon_positions) + len(shape)))
        ngon_positions += [(x + 6 * index, y, 0.0) for x, y in shape]
    crown = [(math.cos(math.pi * k / 3), math.sin(math.pi * k / 3), 0.4 if k % 2 else -0.4) for k in range(6)]
    ngon_faces.append(range(len(ngon_positions), len(ngon_positions) + 6))
    ngon_positions += [(x + 31, y, z) for x, y, z in crown]
    ngons = mesh_object("NGons", bmesh_from(ngon_positions, ngon_faces))
    ngons.location = (-30, -12, 0)

    fold = mesh_object("FoldKey", strip_bmesh())
    add_fold(fold)
    add_smooth_by_angle(fold, math.radians(30))
    fold.location = (14, -3, 0)
    crease = mesh_object("CreaseKey", strip_bmesh())
    crease.data.edges[next(e.index for e in crease.data.edges if set(e.vertices) == {3, 10})].use_edge_sharp = True
    add_fold(crease)
    crease.location = (14, 0, 0)

    drift = mesh_object("BasisDrift", bmesh_from(
        [(x, y, 0.0) for y in range(3) for x in range(3)], [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 7, 6), (4, 5, 8, 7)]
    ))
    drift.shape_key_add(name="Basis")
    bump = drift.shape_key_add(name="Bump", from_mix=False)
    bump.value = 0.0
    for point in bump.data:
        point.co.z += 0.2
    drift.data.vertices[4].co.z = 1.0
    drift.location = (18, -3, 0)

    localized = mesh_object("LocalizedAutoSmooth", sphere_bmesh(segments=8, rings=5))
    for polygon in localized.data.polygons[:3]:
        polygon.use_smooth = False
    localized_modifier = localized.modifiers.new("Auto Weichzeichnen", "NODES")
    localized_modifier.node_group = auto_smooth_group("Auto Weichzeichnen", "Geometrie", "Winkel")
    set_modifier_input(localized_modifier, "Winkel", 1.2)
    localized.location = (22, -3, 0)

    rewired = mesh_object("RewiredAutoSmooth", sphere_bmesh(segments=8, rings=5))
    for polygon in rewired.data.polygons[:3]:
        polygon.use_smooth = False
    rewired.data.edges[20].use_edge_sharp = True
    rewired_modifier = rewired.modifiers.new("Rewired", "NODES")
    rewired_modifier.node_group = rewired_auto_smooth_group()
    set_modifier_input(rewired_modifier, "Strength", 0.1)
    set_modifier_input(rewired_modifier, "Angle", 1.2)
    rewired.location = (26, -3, 0)

    lookalike = mesh_object("LookalikeSmooth", sphere_bmesh(segments=12, rings=7))
    lookalike.modifiers.new("Sharpen", "NODES").node_group = sharpening_group()
    lookalike.location = (30, -3, 0)
    inverted = mesh_object("InvertedAutoSmooth", sphere_bmesh(segments=8, rings=5))
    inverted_group = auto_smooth_group("Inverted Smoothing")
    next(node for node in inverted_group.nodes if node.bl_idname == "FunctionNodeCompare").operation = "GREATER_THAN"
    inverted_modifier = inverted.modifiers.new("Inverted", "NODES")
    inverted_modifier.node_group = inverted_group
    set_modifier_input(inverted_modifier, "Angle", 0.3)
    inverted.location = (34, -3, 0)

    lookalikes = {"LookalikeSmooth", "InvertedAutoSmooth"}
    for index, (name, change, settings) in enumerate(SMOOTHING_CHANGES):
        changed = mesh_object(name, dimpled_sphere_bmesh())
        for polygon in changed.data.polygons[16:19]:
            polygon.use_smooth = False
        changed.data.edges[20].use_edge_sharp = True
        ignoring = "Ignore Sharpness" in settings
        changed_group = (ignoring_smooth_group if ignoring else auto_smooth_group)("Changed " + change.__name__)
        change(changed_group)
        changed_modifier = changed.modifiers.new(name, "NODES")
        changed_modifier.node_group = changed_group
        for input_name, value in {"Angle": 1.2, **settings}.items():
            set_modifier_input(changed_modifier, input_name, value)
        if name not in UNCHANGED_SMOOTHING:
            lookalikes.add(name)
        changed.location = (4 * index, -9, 0)

    library_name = "features-library-%s.blend" % VERSION
    for index, group in enumerate(linked_smoothing_groups(library_name)):
        essentials = group.name.startswith("Smooth by Angle")
        name = "LinkedSmoothByAngle" if essentials else "LinkedAutoSmooth"
        linked = mesh_object(name, sphere_bmesh(segments=8, rings=5))
        for polygon in linked.data.polygons[:3]:
            polygon.use_smooth = False
        linked.data.edges[20].use_edge_sharp = True
        linked_modifier = linked.modifiers.new(name, "NODES")
        linked_modifier.node_group = group
        set_modifier_input(linked_modifier, "Angle", 1.2)
        if essentials:
            set_modifier_input(linked_modifier, "Ignore Sharpness", True)
        linked.location = (38 + 4 * index, -3, 0)

    scene.frame_set(1)
    rest_pose(scene)
    reference = {
        "fps": 25.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {
            obj.name: mesh_reference(obj, scene)
            for obj in scene.objects
            if obj.type == "MESH" and obj.name not in lookalikes
        },
    }
    reference["meshes"]["BasisDrift"].update(
        restPositions=evaluated_positions(drift, scene), corners=evaluated_corner_normals(drift)
    )
    triangles = {}
    for obj in (polygons, ngons):
        obj.data.calc_loop_triangles()
        triangles[obj.name] = [[obj.data.loops[loop].vertex_index for loop in t.loops] for t in obj.data.loop_triangles]
    reference["loopTriangles"] = triangles
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
    for obj in (fold, crease):
        obj.data.shape_keys.key_blocks["Fold"].value = 1.0
        reference["shapeKeys"][obj.name] = {
            "weights": {"Fold": 1.0},
            "positions": evaluated_positions(obj, scene),
            "normals": {"Fold": evaluated_corner_normals(obj)},
        }
        obj.data.shape_keys.key_blocks["Fold"].value = 0.0
    up.value = 0.25
    side.value = 0.5
    stacked.value = 0.0
    pose_pose(scene)
    save_blend("features")
    os.remove(os.path.join(HERE, library_name))
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
    "NoLocal": "AXIS_ANGLE",
}

# The pose the file saves on channels the active action does not key, which every action starts from in Blender.
SAVED_POSE = {
    "Aligned": {"rotation_euler": (0.2, -0.3, 0.25)},
    "Average": {"rotation_euler": (0.3, 0.0, 0.0)},
    "FixShear": {"rotation_euler": (0.0, 0.4, 0.0)},
    "NoLocal": {"rotation_axis_angle": (0.0, 1.0, 0.0, 0.0)},
    "Helper": {"location": (0.05, 0.0, 0.1), "rotation_quaternion": (0.9, 0.3, 0.0, 0.0)},
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


POSE_PROPERTIES = ("location", "rotation_quaternion", "rotation_euler", "rotation_axis_angle", "scale")


def pose_values(rig):
    return {bone.name: {name: tuple(getattr(bone, name)) for name in POSE_PROPERTIES} for bone in rig.pose.bones}


def set_pose(rig, values):
    for name, settings in values.items():
        for path, value in settings.items():
            setattr(rig.pose.bones[name], path, value)


def pose_or_rest(rig, pose, *owners):
    """Arcue shows an armature that a clip does not animate at rest, and one that it animates from its saved pose."""
    if rig in owners:
        set_pose(rig, pose)
    else:
        reset_pose(rig)


def key_components(bone, path, frame, values):
    """Keys only the given components of a property, leaving the others as they are."""
    current = list(getattr(bone, path))
    for index, value in values.items():
        saved = current[index]
        current[index] = value
        setattr(bone, path, current)
        bone.keyframe_insert(path, index=index, frame=frame)
        current[index] = saved
        setattr(bone, path, current)


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

    partial = new_action(rig, "Partial")
    reset_pose(rig)
    for frame, angle in ((1, 0.0), (9, 0.7)):
        helper = rig.pose.bones["Helper"]
        key_components(helper, "rotation_quaternion", frame, {0: 1.0 - angle * 0.3, 3: angle})
        key_components(helper, "rotation_euler", frame, {0: angle})
        rig.pose.bones["FixShear"].rotation_quaternion = (1.0 - angle * 0.2, angle * 0.4, 0.1, 0.0)
        rig.pose.bones["FixShear"].keyframe_insert("rotation_quaternion", frame=frame)
        key_components(rig.pose.bones["Average"], "rotation_euler", frame, {2: angle})
        key_components(rig.pose.bones["NoLocal"], "rotation_axis_angle", frame, {0: angle})

    for action in (wave, ease, stretch, spin, swell, pulse, partial):
        action.use_fake_user = True
    assign(rig, wave)
    assign(prop, spin)
    assign(key, swell)
    reset_pose(rig)
    scene.frame_set(1)
    set_pose(rig, SAVED_POSE)
    saved_pose = pose_values(rig)

    rest_pose(scene)
    reference = {
        "fps": 30.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in scene.objects if obj.type == "MESH"},
    }
    pose_pose(scene)
    saved = {obj.name: (obj.location.copy(), obj.rotation_euler.copy()) for obj in scene.objects}
    save_blend("rig", compress=False, datablocks=[scene, wave, ease, stretch, spin, swell, pulse, partial])

    clips = {}
    for action, owner, frames in [
        (wave, rig, [1, 2, 5, 6, 9, 12, 13, 16, 20]),
        (ease, rig, list(range(1, 62, 3)) + [61]),
        (stretch, rig, [1, 3, 5, 9]),
        (spin, prop, [1, 4, 7, 10]),
        (swell, key, [1, 3, 8]),
        (pulse, key, [1, 3, 4, 6, 7]),
        (partial, rig, [1, 3, 5, 9]),
    ]:
        for id_data in (rig, prop, key):
            assign(id_data, None)
        for obj in scene.objects:
            obj.location, obj.rotation_euler = saved[obj.name]
        pose_or_rest(rig, saved_pose, owner)
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


def checker_pixel(x, y):
    return (1.0, 1.0, 1.0, 1.0) if (x + y) % 2 else (0.1, 0.1, 0.1, 1.0)


def orm_pixel(x, y):
    return (1.0, 0.4, 0.9, 1.0)


def principled(mat):
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    return mat.node_tree.nodes["Principled BSDF"]


def build_materials():
    scene = reset_scene()
    checker = save_png("checker.png", 4, 4, checker_pixel)
    orm = save_png("orm.png", 2, 2, orm_pixel)
    orm.colorspace_settings.name = "Non-Color"
    packed = bpy.data.images.new("PackedNormal", 2, 2)
    packed.colorspace_settings.name = "Non-Color"
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

    glassy = bpy.data.materials.new("Glassy")
    principled(glassy)
    tree = glassy.node_tree
    shader = tree.nodes.new("ShaderNodeBsdfGlass")
    tree.links.new(shader.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])

    decal = bpy.data.materials.new("Decal")
    bsdf = principled(decal)
    tree = decal.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    image.extension = "CLIP"
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    procedural = bpy.data.materials.new("Procedural")
    bsdf = principled(procedural)
    tree = procedural.node_tree
    noise = tree.nodes.new("ShaderNodeTexNoise")
    tree.links.new(noise.outputs["Color"], bsdf.inputs["Base Color"])
    bump = tree.nodes.new("ShaderNodeBump")
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    boxed = bpy.data.materials.new("Boxed")
    bsdf = principled(boxed)
    tree = boxed.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    image.projection = "BOX"
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    muted = bpy.data.materials.new("Muted")
    bsdf = principled(muted)
    tree = muted.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    hue = tree.nodes.new("ShaderNodeHueSaturation")
    hue.inputs["Hue"].default_value = 0.2
    hue.mute = True
    tree.links.new(image.outputs["Color"], hue.inputs["Color"])
    tree.links.new(hue.outputs["Color"], bsdf.inputs["Base Color"])

    srgb_rough = bpy.data.materials.new("SrgbRough")
    bsdf = principled(srgb_rough)
    tree = srgb_rough.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image.outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])

    vectored = bpy.data.materials.new("Vectored")
    bsdf = principled(vectored)
    tree = vectored.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.vector_type = "VECTOR"
    tree.links.new(tree.nodes.new("ShaderNodeUVMap").outputs["UV"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    pixelated = bpy.data.materials.new("Pixelated")
    bsdf = principled(pixelated)
    tree = pixelated.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    image.interpolation = "Closest"
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    alpha_tint = bpy.data.materials.new("AlphaTint")
    bsdf = principled(alpha_tint)
    tree = alpha_tint.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    tree.links.new(image.outputs["Alpha"], bsdf.inputs["Base Color"])

    displaced = bpy.data.materials.new("Displaced")
    principled(displaced)
    tree = displaced.node_tree
    displacement = tree.nodes.new("ShaderNodeDisplacement")
    displacement.inputs["Height"].default_value = 0.2
    tree.links.new(displacement.outputs["Displacement"], tree.nodes["Material Output"].inputs["Displacement"])

    empty = bpy.data.materials.new("Empty")
    principled(empty)
    tree = empty.node_tree
    tree.nodes.remove(tree.nodes["Principled BSDF"])

    smoke = bpy.data.materials.new("Smoke")
    principled(smoke)
    tree = smoke.node_tree
    tree.nodes.remove(tree.nodes["Principled BSDF"])
    volume = tree.nodes.new("ShaderNodeVolumePrincipled")
    tree.links.new(volume.outputs["Volume"], tree.nodes["Material Output"].inputs["Volume"])

    materials = [textured, glass, absent, diffuse, glow, mixed, projected, red_rough, tinted, cutout, blended]
    materials += [object_normal, generated, glassy, decal, procedural, boxed, muted, srgb_rough, vectored]
    materials += [pixelated, alpha_tint, displaced, empty, smoke]

    tilted = bpy.data.materials.new("Tilted")
    bsdf = principled(tilted)
    tree = tilted.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.3, 0, 0)
    tree.links.new(tree.nodes.new("ShaderNodeUVMap").outputs["UV"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    pulsing = bpy.data.materials.new("Pulsing")
    bsdf = principled(pulsing)
    tree = pulsing.node_tree
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.5, 0.0, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.0
    strength = tree.nodes.new("ShaderNodeValue")
    strength.outputs["Value"].default_value = 2.0
    tree.links.new(strength.outputs["Value"], bsdf.inputs["Emission Strength"])

    smart = bpy.data.materials.new("Smart")
    bsdf = principled(smart)
    tree = smart.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    image.interpolation = "Smart"
    tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])

    clear = bpy.data.materials.new("Clear")
    bsdf = principled(clear)
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.0

    frosted = bpy.data.materials.new("Frosted")
    bsdf = principled(frosted)
    tree = frosted.node_tree
    noise = tree.nodes.new("ShaderNodeTexNoise")
    tree.links.new(noise.outputs["Fac"], bsdf.inputs["Transmission Weight"])

    dialed = bpy.data.materials.new("Dialed")
    bsdf = principled(dialed)
    tree = dialed.node_tree
    weight = tree.nodes.new("ShaderNodeValue")
    weight.outputs["Value"].default_value = 0.5
    tree.links.new(weight.outputs["Value"], bsdf.inputs["Transmission Weight"])
    bsdf.inputs["Metallic"].default_value = 0.5

    masked = bpy.data.materials.new("Masked")
    bsdf = principled(masked)
    tree = masked.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = checker
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image.outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Red"], bsdf.inputs["Transmission Weight"])

    chrome = bpy.data.materials.new("Chrome")
    bsdf = principled(chrome)
    tree = chrome.node_tree
    noise = tree.nodes.new("ShaderNodeTexNoise")
    tree.links.new(noise.outputs["Fac"], bsdf.inputs["Transmission Weight"])
    bsdf.inputs["Metallic"].default_value = 1.0

    tangent_detail = bpy.data.materials.new("TangentDetail")
    bsdf = principled(tangent_detail)
    tree = tangent_detail.node_tree
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = packed
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.uv_map = "Detail"
    tree.links.new(image.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    materials += [tilted, pulsing, smart, clear, frosted, dialed, masked, chrome, tangent_detail]
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

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co.x + 0.5, loop.vert.co.y + 0.5)
    lacking = mesh_object("NoDetailPlane", bm, (textured,))
    lacking.location = (1.5, 1.5, 0)

    save_blend("materials")
    for image in (checker, orm, missing):
        image.filepath = "//textures/" + image.name
    absolute.filepath = "/nonexistent/arcue/absolute.png"
    save_blend("materials", relative_remap=False)
    save_reference("materials", {"fps": 24.0, "unitScale": 1.0})


# ---------------------------------------------------------------- shading

BAKE_SIZE = 4
BAKE_OFFSET = 16.0
# Sixteen alpha levels, as bytes, so that no two cutoffs the fixture uses keep the same texels. The first texel is
# partly see-through, which shows in what the bake keeps of the color there.
CUTOUT_ALPHA = (136, 0, 248, 72, 200, 24, 104, 232, 56, 168, 40, 184, 88, 216, 120, 152)
# The colors of two UDIM tiles and of three frames of an image sequence, each one byte value exactly.
TILE_COLORS = {1001: (0.8, 0.2, 0.0, 1.0), 1002: (0.0, 0.2, 0.8, 1.0)}
FRAME_COLORS = ((0.2, 0.8, 0.2, 1.0), (0.8, 0.8, 0.2, 1.0), (0.2, 0.8, 0.8, 1.0))
# The scene frame the shading fixture is saved at, which picks the frame each image sequence shows.
SHADING_FRAME = 2
# Start frames, frame counts, cycling, offsets and scene frames of an Image Texture node of a sequence, whose frames
# the reference bakes.
SEQUENCE_USERS = (
    (5, 100, False, 0, 2),
    (1, 1, False, 0, 2),
    (1, 3, False, 0, 7),
    (0, 2, True, 0, 1),
    (2, 3, True, 0, 1),
    (3, 2, True, 1, 1),
    (1, 3, True, 0, -5),
)
# The color attributes the planes of the materials named Attribute... carry: the default, and one of bytes per corner.
PAINT = (0.1, 0.4, 0.9, 1.0)
TINT = (0.8, 0.5, 0.2, 1.0)


def socket_named(sockets, identifier):
    return next(socket for socket in sockets if socket.identifier == identifier)


def shading_material(name):
    mat = bpy.data.materials.new(name)
    bsdf = principled(mat)
    return mat, mat.node_tree, bsdf


def image_node(tree, image, interpolation="Linear"):
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.interpolation = interpolation
    return node


def value_output(tree, value):
    node = tree.nodes.new("ShaderNodeValue")
    node.outputs[0].default_value = value
    return node.outputs[0]


def rgb_output(tree, color):
    node = tree.nodes.new("ShaderNodeRGB")
    node.outputs[0].default_value = (*color, 1.0)
    return node.outputs[0]


def noise_output(tree):
    return tree.nodes.new("ShaderNodeTexNoise").outputs["Fac"]


def math_node(tree, operation, *values):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate(values):
        if value is not None:
            node.inputs[index].default_value = value
    return node


def multiply_color(tree, color_output, factor):
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    socket_named(mix.inputs, "Factor_Float").default_value = 1.0
    socket_named(mix.inputs, "B_Color").default_value = (*factor, 1.0)
    tree.links.new(color_output, socket_named(mix.inputs, "A_Color"))
    return socket_named(mix.outputs, "Result_Color")


def mapped_material(name, image, steps, uv_map=None):
    """A material whose base color samples `image` through Mapping nodes, the first step nearest the UVs."""
    mat, tree, bsdf = shading_material(name)
    texture = image_node(tree, image)
    if uv_map:
        coordinates = tree.nodes.new("ShaderNodeUVMap")
        coordinates.uv_map = uv_map
    else:
        coordinates = tree.nodes.new("ShaderNodeTexCoord")
    vector = coordinates.outputs["UV"]
    for step in steps:
        mapping = tree.nodes.new("ShaderNodeMapping")
        for key in ("Location", "Rotation", "Scale"):
            if key in step:
                mapping.inputs[key].default_value = step[key]
        mapping.vector_type = step.get("type", "POINT")
        for key, output in step.get("linked", {}).items():
            tree.links.new(output(tree), mapping.inputs[key])
        tree.links.new(vector, mapping.inputs["Vector"])
        mapping.mute = step.get("mute", False)
        vector = mapping.outputs["Vector"]
    tree.links.new(vector, texture.inputs["Vector"])
    tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def emit_only(tree, output):
    """Makes the material emit `output`, offset so that Cycles bakes negative values too."""
    surface = tree.get_output_node("CYCLES").inputs["Surface"]
    offset = tree.nodes.new("ShaderNodeVectorMath")
    offset.operation = "ADD"
    offset.inputs[1].default_value = (BAKE_OFFSET, BAKE_OFFSET, BAKE_OFFSET)
    emission = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(output, offset.inputs[0])
    tree.links.new(offset.outputs[0], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], surface)


def bake(scene, objects, kind):
    """What Cycles bakes for each object's texels with one sample each, by object name."""
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    targets = []
    for obj in objects:
        tree = obj.active_material.node_tree
        image = bpy.data.images.new("%s-%s" % (obj.name, kind), BAKE_SIZE, BAKE_SIZE, float_buffer=True)
        image.colorspace_settings.name = "Non-Color"
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        tree.nodes.active = node
        targets.append((obj.name, tree, node, image))
    for other in scene.objects:
        other.select_set(other in objects)
    bpy.context.view_layer.objects.active = objects[0]
    if kind == "DIFFUSE":
        bpy.ops.object.bake(type=kind, pass_filter={"COLOR"}, margin=0)
    else:
        bpy.ops.object.bake(type=kind, margin=0)
    result = {}
    for name, tree, node, image in targets:
        result[name] = list(image.pixels)
        tree.nodes.remove(node)
    return result


def rendered_color(scene, obj, engine="CYCLES", world_color=(0.0, 0.0, 0.0)):
    """The color and alpha Cycles, or `engine`, renders at the middle of the object, seen from above over a black world,
    or one of `world_color`, and a transparent film, which shows what a bake leaves out of a see-through surface."""
    scene.render.engine = engine
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = 4
    scene.render.image_settings.file_format = "OPEN_EXR"
    world = bpy.data.worlds.new("Black")
    world.color = world_color
    if bpy.app.version < (5, 0, 0) and world_color != (0.0, 0.0, 0.0):
        world.use_nodes = True
    if world.node_tree:
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (*world_color, 1.0)
    scene.world = world
    camera = bpy.data.objects.new("Above", bpy.data.cameras.new("Above"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.5
    camera.location = obj.location + Vector((0.0, 0.0, 2.0))
    link(camera)
    scene.camera = camera
    with tempfile.TemporaryDirectory() as folder:
        scene.render.filepath = os.path.join(folder, "render.exr")
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath)
        pixels = list(image.pixels)
        bpy.data.images.remove(image)
    start = (2 * 4 + 2) * 4
    return rounded(pixels[start:start + 4])


def build_shading():
    """Materials whose node graphs the preview reads beyond plain sockets: constant nodes, reroutes, muted nodes and
    links, links to sockets their node hides, output targets, volumes, holdouts, colors and values where a shader is
    expected, Mapping types, glTF's factors and alpha clips, a clip under a constant mix with a Transparent BSDF, image
    channels, also through Math, Color Ramp and Mix nodes and of an image whose every pixel is gray, an image mixed by
    another's alpha, the alpha Blender multiplies into an image's color, premultiplied images, color spaces and
    interpolation, color attributes, light that Add and Mix shaders add, the Specular BSDF, a UDIM image whose tiles
    are files and image sequences at a frame. The reference holds what Cycles bakes for them: at the first texel each
    material's diffuse color, with specular turned off so that it is the base color times one minus metallic, and its
    emission; where each Mapping sends the UVs of each texel; and the alpha each clip leaves there. It also holds what
    Cycles renders over a transparent film for surfaces a bake cannot show, one that adds light to a Transparent BSDF,
    one with only a volume and a holdout, what EEVEE renders for an image's color where nodes read its alpha and where
    none do, the color of the shader EEVEE's output shows, the diffuse color EEVEE renders for the Specular BSDF, which
    Cycles cannot bake, the color of each tile and frame file, and the color Cycles bakes for an image sequence under
    each of a few frame settings."""
    scene = reset_scene()
    checker = save_png("checker.png", 4, 4, checker_pixel)
    orm = save_png("orm.png", 2, 2, orm_pixel)
    orm.colorspace_settings.name = "Non-Color"
    cutout = save_png("cutout.png", 4, 4, lambda x, y: (0.9, 0.6, 0.2, CUTOUT_ALPHA[x + 4 * y] / 255))
    data = save_png("data.png", 2, 2, lambda x, y: (0.5, 0.5, 0.5, 1.0))
    data.colorspace_settings.name = "Non-Color"
    gray = save_png("gray.png", 2, 2, lambda x, y: (0.5, 0.5, 0.5, 1.0))
    files = {}
    for number, color in TILE_COLORS.items():
        tile = save_png("udim.%d.png" % number, 2, 2, lambda x, y, color=color: color)
        files["textures/udim.%d.png" % number] = rounded(list(tile.pixels)[0:3])
        bpy.data.images.remove(tile)
    udim = bpy.data.images.load(os.path.join(HERE, "textures", "udim.1001.png"), check_existing=False)
    udim.name = "udim"
    udim.source = "TILED"
    for frame, color in enumerate(FRAME_COLORS, 1):
        still = save_png("sequence.%04d.png" % frame, 2, 2, lambda x, y, color=color: color)
        files["textures/sequence.%04d.png" % frame] = rounded(list(still.pixels)[0:3])
        bpy.data.images.remove(still)

    def sequence_node(tree, name, **user):
        """An Image Texture node of its own image sequence, as EEVEE shows one frame of an image for all its nodes."""
        image = bpy.data.images.load(os.path.join(HERE, "textures", "sequence.0001.png"), check_existing=False)
        image.name = name
        image.source = "SEQUENCE"
        node = image_node(tree, image)
        for key, value in user.items():
            setattr(node.image_user, key, value)
        return node

    materials = [
        mapped_material(
            "MappingPoint", checker, [{"Location": (0.25, 0.1, 0), "Rotation": (0, 0, 0.3), "Scale": (2, 3, 1)}]
        ),
        mapped_material(
            "MappingTexture", checker, [{"type": "TEXTURE", "Location": (0.25, 0.5, 0), "Scale": (2, 4, 1)}]
        ),
        mapped_material(
            "MappingTextureTurned",
            checker,
            [{"type": "TEXTURE", "Location": (0.1, 0.2, 0.3), "Rotation": (0, 0, 0.5), "Scale": (2, 2, 1)}],
        ),
        mapped_material(
            "MappingVector",
            checker,
            [{"type": "VECTOR", "Location": (0.5, 0.5, 0), "Rotation": (0, 0, 0.2), "Scale": (2, 2, 1)}],
        ),
        mapped_material(
            "MappingLinkedScale",
            checker,
            [{"Location": (0.1, 0, 0), "linked": {"Scale": lambda tree: value_output(tree, 4.0)}}],
        ),
        mapped_material("MappingFlipped", checker, [{"Location": (0, 1, 0), "Rotation": (math.pi, 0, 0)}]),
        mapped_material("MappingChain", checker, [{"Scale": (2, 2, 1)}, {"type": "TEXTURE", "Location": (0.25, 0, 0)}]),
        mapped_material("MappingSheared", checker, [{"Rotation": (0.5, 0.5, 0)}]),
        mapped_material("MappingDriven", checker, [{"linked": {"Scale": noise_output}}]),
        mapped_material("MappingMuted", checker, [{"Scale": (3, 3, 1), "mute": True}], uv_map="Detail"),
    ]
    mapping_names = {mat.name for mat in materials}

    mat, tree, bsdf = shading_material("CheckerBase")
    tree.links.new(image_node(tree, checker).outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("RgbBase")
    reroute = tree.nodes.new("NodeReroute")
    tree.links.new(rgb_output(tree, (0.1, 0.2, 0.9)), reroute.inputs[0])
    tree.links.new(reroute.outputs[0], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("RgbEmission")
    tree.links.new(rgb_output(tree, (1.0, 0.0, 0.0)), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    materials.append(mat)

    mat, tree, bsdf = shading_material("ValueStrength")
    bsdf.inputs["Emission Color"].default_value = (0.0, 1.0, 0.0, 1.0)
    tree.links.new(value_output(tree, 3.0), bsdf.inputs["Emission Strength"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("ColorAsValue")
    bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1.0)
    tree.links.new(rgb_output(tree, (0.2, 0.4, 0.6)), bsdf.inputs["Metallic"])
    tree.links.new(value_output(tree, 0.25), bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("MutedHue")
    hue = tree.nodes.new("ShaderNodeHueSaturation")
    hue.inputs["Hue"].default_value = 0.3
    tree.links.new(image_node(tree, checker).outputs["Color"], hue.inputs["Color"])
    tree.links.new(hue.outputs["Color"], bsdf.inputs["Base Color"])
    hue.mute = True
    materials.append(mat)

    mat, tree, bsdf = shading_material("MutedConstant")
    bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    hue = tree.nodes.new("ShaderNodeHueSaturation")
    hue.inputs["Hue"].default_value = 0.3
    hue.inputs["Color"].default_value = (0.2, 0.7, 0.3, 1.0)
    tree.links.new(hue.outputs["Color"], bsdf.inputs["Base Color"])
    hue.mute = True
    materials.append(mat)

    mat, tree, bsdf = shading_material("MutedMix")
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    socket_named(mix.inputs, "A_Color").default_value = (0.0, 0.0, 1.0, 1.0)
    tree.links.new(rgb_output(tree, (0.2, 0.7, 0.3)), socket_named(mix.inputs, "B_Color"))
    tree.links.new(socket_named(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    mix.mute = True
    materials.append(mat)

    mat, tree, bsdf = shading_material("MutedLink")
    bsdf.inputs["Base Color"].default_value = (0.9, 0.5, 0.1, 1.0)
    tree.links.new(image_node(tree, checker).outputs["Color"], bsdf.inputs["Base Color"]).is_muted = True
    materials.append(mat)

    mat, tree, bsdf = shading_material("TargetEevee")
    bsdf.inputs["Base Color"].default_value = (0.8, 0.0, 0.0, 1.0)
    cycles = tree.nodes["Material Output"]
    cycles.target = "CYCLES"
    eevee = tree.nodes.new("ShaderNodeOutputMaterial")
    eevee.target = "EEVEE"
    green = tree.nodes.new("ShaderNodeBsdfPrincipled")
    green.inputs["Base Color"].default_value = (0.0, 0.8, 0.0, 1.0)
    tree.links.new(green.outputs["BSDF"], eevee.inputs["Surface"])
    cycles.is_active_output = True
    materials.append(mat)

    mat, tree, bsdf = shading_material("NoSurface")
    tree.links.remove(tree.nodes["Material Output"].inputs["Surface"].links[0])
    mat.diffuse_color = (0.1, 0.9, 0.1, 1.0)
    materials.append(mat)

    mat, tree, bsdf = shading_material("AddClear")
    tree.nodes.remove(bsdf)
    clear = tree.nodes.new("ShaderNodeBsdfTransparent")
    glow = tree.nodes.new("ShaderNodeEmission")
    glow.inputs["Color"].default_value = (0.1, 0.8, 1.0, 1.0)
    glow.inputs["Strength"].default_value = 2.0
    add = tree.nodes.new("ShaderNodeAddShader")
    tree.links.new(clear.outputs["BSDF"], add.inputs[0])
    tree.links.new(glow.outputs["Emission"], add.inputs[1])
    tree.links.new(add.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("Toon")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.4, 0.9, 1.0)
    toon = tree.nodes.new("ShaderNodeShaderToRGB")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (0.05, 0.1, 0.3, 1.0)
    ramp.color_ramp.elements[1].color = (0.2, 0.4, 0.9, 1.0)
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(bsdf.outputs["BSDF"], toon.inputs["Shader"])
    tree.links.new(toon.outputs["Color"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], glow.inputs["Color"])
    tree.links.new(glow.outputs["Emission"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("GltfFactors")
    base = multiply_color(tree, image_node(tree, checker).outputs["Color"], (1.0, 0.5, 0.5))
    tree.links.new(base, bsdf.inputs["Base Color"])
    glow = multiply_color(tree, image_node(tree, checker).outputs["Color"], (1.0, 0.5, 0.0))
    tree.links.new(glow, bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Color"])
    factor = math_node(tree, "MULTIPLY", None, 0.5)
    tree.links.new(separate.outputs["Green"], factor.inputs[0])
    tree.links.new(factor.outputs[0], bsdf.inputs["Roughness"])
    tree.links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    materials.append(mat)

    def cutout_material(name, interpolation="Linear"):
        mat, tree, bsdf = shading_material(name)
        texture = image_node(tree, cutout, interpolation)
        tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
        materials.append(mat)
        return tree, bsdf, texture.outputs["Alpha"]

    tree, bsdf, alpha = cutout_material("ClipBelow")
    below = math_node(tree, "LESS_THAN", None, 0.4)
    invert = math_node(tree, "SUBTRACT", 1.0, None)
    tree.links.new(alpha, below.inputs[0])
    tree.links.new(below.outputs[0], invert.inputs[1])
    tree.links.new(invert.outputs[0], bsdf.inputs["Alpha"])

    tree, bsdf, alpha = cutout_material("ClipAbove")
    above = math_node(tree, "GREATER_THAN", None, 0.6)
    tree.links.new(alpha, above.inputs[0])
    tree.links.new(above.outputs[0], bsdf.inputs["Alpha"])

    tree, bsdf, alpha = cutout_material("AlphaFactor")
    factor = math_node(tree, "MULTIPLY", None, 0.8)
    tree.links.new(alpha, factor.inputs[0])
    tree.links.new(factor.outputs[0], bsdf.inputs["Alpha"])
    clip_names = ["ClipBelow", "ClipAbove", "AlphaFactor"]

    tree, bsdf, alpha = cutout_material("AlphaElsewhere")
    tree.links.new(image_node(tree, orm).outputs["Color"], bsdf.inputs["Alpha"])

    tree, bsdf, alpha = cutout_material("AlphaUnused")
    bsdf.inputs["Alpha"].default_value = 0.6

    tree, bsdf, alpha = cutout_material("MixByAlpha")
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(alpha, mix.inputs["Fac"])
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])

    mat, tree, bsdf = shading_material("RoughFromAlpha")
    tree.links.new(image_node(tree, orm).outputs["Alpha"], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("RerouteSeparate")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    reroute = tree.nodes.new("NodeReroute")
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Red"], reroute.inputs[0])
    tree.links.new(reroute.outputs[0], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("HsvSeparate")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    separate.mode = "HSV"
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("NonColorBase")
    tree.links.new(image_node(tree, data).outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("SrgbRoughness")
    tree.links.new(image_node(tree, gray).outputs["Color"], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("Closest")
    tree.links.new(image_node(tree, checker, "Closest").outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("Sequence")
    tree.links.new(sequence_node(tree, "sequence").outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("VolumeOnly")
    output = tree.nodes["Material Output"]
    tree.links.remove(output.inputs["Surface"].links[0])
    volume = tree.nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Density"].default_value = 0.0
    tree.links.new(volume.outputs["Volume"], output.inputs["Volume"])
    materials.append(mat)

    for name, color in (("TargetAllAndEevee", (0.0, 0.8, 0.0)), ("TargetActiveAll", (0.0, 0.0, 0.8))):
        mat, tree, bsdf = shading_material(name)
        bsdf.inputs["Base Color"].default_value = (0.8, 0.0, 0.0, 1.0)
        first = tree.nodes["Material Output"]
        second = tree.nodes.new("ShaderNodeOutputMaterial")
        second.target = "EEVEE" if name == "TargetAllAndEevee" else "ALL"
        other = tree.nodes.new("ShaderNodeBsdfPrincipled")
        other.inputs["Base Color"].default_value = (*color, 1.0)
        tree.links.new(other.outputs["BSDF"], second.inputs["Surface"])
        (first if name == "TargetAllAndEevee" else second).is_active_output = True
        materials.append(mat)

    mat = mapped_material("MappingNoVector", checker, [{"Location": (0.3, 0.3, 0)}])
    mapping = next(node for node in mat.node_tree.nodes if node.bl_idname == "ShaderNodeMapping")
    mat.node_tree.links.remove(mapping.inputs["Vector"].links[0])
    materials.append(mat)
    mapping_names.add(mat.name)

    tree, bsdf, alpha = cutout_material("MixShaderClip")
    above = math_node(tree, "GREATER_THAN", None, 0.5)
    tree.links.new(alpha, above.inputs[0])
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(above.outputs[0], mix.inputs["Fac"])
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    clip_names.append("MixShaderClip")

    tree, bsdf, alpha = cutout_material("GltfMaskFactor")
    factor = math_node(tree, "MULTIPLY", None, 0.5)
    below = math_node(tree, "LESS_THAN", None, 0.4)
    invert = math_node(tree, "SUBTRACT", 1.0, None)
    tree.links.new(alpha, factor.inputs[0])
    tree.links.new(factor.outputs[0], below.inputs[0])
    tree.links.new(below.outputs[0], invert.inputs[1])
    tree.links.new(invert.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("GltfMaskFactor")

    tree, bsdf, alpha = cutout_material("ClipLessThanReversed")
    below = math_node(tree, "LESS_THAN", 0.6, None)
    tree.links.new(alpha, below.inputs[1])
    tree.links.new(below.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("ClipLessThanReversed")

    tree, bsdf, alpha = cutout_material("ClipInvertedGreater")
    above = math_node(tree, "GREATER_THAN", 0.4, None)
    invert = math_node(tree, "SUBTRACT", 1.0, None)
    tree.links.new(alpha, above.inputs[1])
    tree.links.new(above.outputs[0], invert.inputs[1])
    tree.links.new(invert.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("ClipInvertedGreater")

    tree, bsdf, alpha = cutout_material("ClipRound")
    rounding = math_node(tree, "ROUND")
    tree.links.new(alpha, rounding.inputs[0])
    tree.links.new(rounding.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("ClipRound")

    tree, bsdf, alpha = cutout_material("AlphaDoubled")
    doubled = math_node(tree, "MULTIPLY", None, 2.0)
    doubled.use_clamp = True
    tree.links.new(alpha, doubled.inputs[0])
    tree.links.new(doubled.outputs[0], bsdf.inputs["Alpha"])

    tree, bsdf, alpha = cutout_material("MixAlphaOtherNode")
    other = image_node(tree, cutout)
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.0, 2.0, 1.0)
    tree.links.new(tree.nodes.new("ShaderNodeTexCoord").outputs["UV"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], other.inputs["Vector"])
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(other.outputs["Alpha"], mix.inputs["Fac"])
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])

    mat, tree, bsdf = shading_material("SeparateXyzGreen")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Vector"])
    tree.links.new(separate.outputs["Y"], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("RoughMathSeparate")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Color"])
    halved = math_node(tree, "MULTIPLY", None, 0.5)
    tree.links.new(separate.outputs["Red"], halved.inputs[0])
    tree.links.new(halved.outputs[0], bsdf.inputs["Roughness"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("FloatMixLeftover")
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    tree.links.new(image_node(tree, checker).outputs["Color"], socket_named(mix.inputs, "A_Color"))
    mix.data_type = "FLOAT"
    socket_named(mix.inputs, "A_Float").default_value = 0.2
    socket_named(mix.inputs, "B_Float").default_value = 0.6
    tree.links.new(socket_named(mix.outputs, "Result_Float"), bsdf.inputs["Roughness"])
    assert any(link.to_socket.identifier == "A_Color" for link in tree.links)
    materials.append(mat)

    mat, tree, bsdf = shading_material("NormalStrengthDriven")
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(image_node(tree, data).outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(tree.nodes.new("ShaderNodeTexNoise").outputs["Fac"], normal_map.inputs["Strength"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    materials.append(mat)

    mat, tree, _ = shading_material("GlossyRoughDriven")
    glossy = tree.nodes.new("ShaderNodeBsdfAnisotropic")
    tree.links.new(tree.nodes.new("ShaderNodeTexNoise").outputs["Fac"], glossy.inputs["Roughness"])
    tree.links.new(glossy.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("UnavailableOutput")
    bsdf.inputs["Base Color"].default_value = (0.9, 0.5, 0.1, 1.0)
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    socket_named(mix.inputs, "A_Color").default_value = (0.0, 0.0, 1.0, 1.0)
    tree.links.new(socket_named(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    mix.data_type = "FLOAT"
    assert any(link.from_socket.identifier == "Result_Color" for link in tree.links)
    materials.append(mat)

    tree, bsdf, alpha = cutout_material("ClipAtZero", "Closest")
    above = math_node(tree, "GREATER_THAN", None, 0.0)
    tree.links.new(alpha, above.inputs[0])
    tree.links.new(above.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("ClipAtZero")

    tree, bsdf, alpha = cutout_material("ClipKeepsAll")
    below = math_node(tree, "LESS_THAN", None, 0.0)
    invert = math_node(tree, "SUBTRACT", 1.0, None)
    tree.links.new(alpha, below.inputs[0])
    tree.links.new(below.outputs[0], invert.inputs[1])
    tree.links.new(invert.outputs[0], bsdf.inputs["Alpha"])
    clip_names.append("ClipKeepsAll")

    tree, bsdf, alpha = cutout_material("ClipNegativeFactor")
    negated = math_node(tree, "MULTIPLY", None, -1.0)
    above = math_node(tree, "GREATER_THAN", None, -0.5)
    tree.links.new(alpha, negated.inputs[0])
    tree.links.new(negated.outputs[0], above.inputs[0])
    tree.links.new(above.outputs[0], bsdf.inputs["Alpha"])

    tree, bsdf, alpha = cutout_material("MixClipTranslucent")
    bsdf.inputs["Alpha"].default_value = 0.6
    above = math_node(tree, "GREATER_THAN", None, 0.5)
    tree.links.new(alpha, above.inputs[0])
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(above.outputs[0], mix.inputs["Fac"])
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    clip_names.append("MixClipTranslucent")

    tree, bsdf, alpha = cutout_material("AlphaRead")
    tree.links.new(alpha, bsdf.inputs["Roughness"])

    veil = save_png("veil.png", 2, 2, lambda x, y: (0.9, 0.6, 0.2, CUTOUT_ALPHA[0] / 255))
    mat, tree, bsdf = shading_material("VeilUnread")
    tree.nodes.remove(bsdf)
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(image_node(tree, veil).outputs["Color"], glow.inputs["Color"])
    tree.links.new(glow.outputs["Emission"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("VeilRead")
    bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    texture = image_node(tree, veil)
    tree.links.new(texture.outputs["Color"], bsdf.inputs["Emission Color"])
    tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Roughness"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    materials.append(mat)

    mat, tree, bsdf = shading_material("BaseFromRed")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image_node(tree, cutout).outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Red"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("BaseFromBrightness")
    brightness = tree.nodes.new("ShaderNodeRGBToBW")
    tree.links.new(image_node(tree, cutout).outputs["Color"], brightness.inputs[0])
    tree.links.new(brightness.outputs[0], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("BaseMixedByAlpha")
    texture = image_node(tree, cutout)
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    socket_named(mix.inputs, "B_Color").default_value = (0.1, 0.1, 0.1, 1.0)
    tree.links.new(texture.outputs["Alpha"], socket_named(mix.inputs, "Factor_Float"))
    tree.links.new(texture.outputs["Color"], socket_named(mix.inputs, "A_Color"))
    tree.links.new(socket_named(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("EmissionFromAlpha")
    tree.links.new(image_node(tree, cutout).outputs["Alpha"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    materials.append(mat)

    mat, tree, bsdf = shading_material("PackedDoubled")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image_node(tree, orm).outputs["Color"], separate.inputs["Color"])
    doubled = math_node(tree, "MULTIPLY", None, 2.0)
    tree.links.new(separate.outputs["Green"], doubled.inputs[0])
    tree.links.new(doubled.outputs[0], bsdf.inputs["Roughness"])
    doubled = math_node(tree, "MULTIPLY", None, 2.0)
    tree.links.new(separate.outputs["Blue"], doubled.inputs[0])
    tree.links.new(doubled.outputs[0], bsdf.inputs["Metallic"])
    materials.append(mat)

    missing_orm = bpy.data.images.new("missing-orm.png", 1, 1)
    missing_orm.source = "FILE"
    missing_orm.filepath = "//textures/missing-orm.png"
    missing_orm.colorspace_settings.name = "Non-Color"
    mat, tree, bsdf = shading_material("PackedMissing")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(image_node(tree, missing_orm).outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    tree.links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    materials.append(mat)

    for name, output in (
        ("RgbSurface", lambda tree: rgb_output(tree, (0.1, 0.6, 0.9))),
        ("ValueSurface", lambda tree: value_output(tree, 0.4)),
        ("ImageSurface", lambda tree: image_node(tree, checker).outputs["Color"]),
        ("Holdout", lambda tree: tree.nodes.new("ShaderNodeHoldout").outputs[0]),
        ("NoiseSurface", noise_output),
    ):
        mat, tree, bsdf = shading_material(name)
        tree.links.new(output(tree), tree.nodes["Material Output"].inputs["Surface"])
        materials.append(mat)

    packed_alpha = bpy.data.images.load(cutout.filepath_raw, check_existing=False)
    packed_alpha.alpha_mode = "CHANNEL_PACKED"
    mat, tree, bsdf = shading_material("PackedAlphaBase")
    tree.links.new(image_node(tree, packed_alpha).outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("ToonSurface")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.4, 0.9, 1.0)
    toon = tree.nodes.new("ShaderNodeShaderToRGB")
    tree.links.new(bsdf.outputs["BSDF"], toon.inputs["Shader"])
    tree.links.new(toon.outputs["Color"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("MixClearAddGlow")
    tree.nodes.remove(bsdf)
    glow = tree.nodes.new("ShaderNodeEmission")
    glow.inputs["Color"].default_value = (0.1, 0.8, 1.0, 1.0)
    add = tree.nodes.new("ShaderNodeAddShader")
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], add.inputs[0])
    tree.links.new(glow.outputs["Emission"], add.inputs[1])
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(add.outputs["Shader"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("CyclesOnly")
    tree.nodes["Material Output"].target = "CYCLES"
    assert tree.get_output_node("EEVEE") is None
    materials.append(mat)

    premultiplied_texel = (100 / 255, 60 / 255, 20 / 255, CUTOUT_ALPHA[0] / 255)
    premultiplied = save_png("premultiplied.png", 2, 2, lambda x, y: premultiplied_texel)
    premultiplied.alpha_mode = "PREMUL"
    mat, tree, bsdf = shading_material("VeilPremulUnread")
    tree.nodes.remove(bsdf)
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(image_node(tree, premultiplied).outputs["Color"], glow.inputs["Color"])
    tree.links.new(glow.outputs["Emission"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("VeilPremulRead")
    bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    texture = image_node(tree, premultiplied)
    tree.links.new(texture.outputs["Color"], bsdf.inputs["Emission Color"])
    tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Roughness"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    materials.append(mat)

    tree, bsdf, alpha = cutout_material("ClipThenMix")
    above = math_node(tree, "GREATER_THAN", None, 0.5)
    tree.links.new(alpha, above.inputs[0])
    tree.links.new(above.outputs[0], bsdf.inputs["Alpha"])
    mix = tree.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.5
    tree.links.new(tree.nodes.new("ShaderNodeBsdfTransparent").outputs["BSDF"], mix.inputs[1])
    tree.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    clip_names.append("ClipThenMix")

    tree, bsdf, alpha = cutout_material("BaseRedThroughMath")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(bsdf.inputs["Base Color"].links[0].from_socket, separate.inputs["Color"])
    halved = math_node(tree, "MULTIPLY", None, 0.5)
    tree.links.new(separate.outputs["Red"], halved.inputs[0])
    tree.links.new(halved.outputs[0], bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseAlphaThroughMath")
    halved = math_node(tree, "MULTIPLY", None, 0.5)
    tree.links.new(alpha, halved.inputs[0])
    tree.links.new(halved.outputs[0], bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseAlphaThroughRamp")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    tree.links.new(alpha, ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseRedThroughRamp")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(bsdf.inputs["Base Color"].links[0].from_socket, separate.inputs["Color"])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    tree.links.new(separate.outputs["Red"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseRedThroughMix")
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(bsdf.inputs["Base Color"].links[0].from_socket, separate.inputs["Color"])
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    socket_named(mix.inputs, "Factor_Float").default_value = 0.5
    socket_named(mix.inputs, "B_Color").default_value = (0.0, 0.0, 1.0, 1.0)
    tree.links.new(separate.outputs["Red"], socket_named(mix.inputs, "A_Color"))
    tree.links.new(socket_named(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseBrightnessThroughRamp")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    tree.links.new(bsdf.inputs["Base Color"].links[0].from_socket, ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    tree, bsdf, alpha = cutout_material("BaseMixedByOtherAlpha")
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    socket_named(mix.inputs, "B_Color").default_value = (1.0, 1.0, 1.0, 1.0)
    tree.links.new(alpha, socket_named(mix.inputs, "Factor_Float"))
    tree.links.new(image_node(tree, checker).outputs["Color"], socket_named(mix.inputs, "A_Color"))
    tree.links.new(socket_named(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])

    def through_ramp(tree, image, mode):
        value = image_node(tree, image).outputs["Color"]
        if mode:
            separate = tree.nodes.new("ShaderNodeSeparateColor")
            separate.mode = mode
            tree.links.new(value, separate.inputs["Color"])
            value = separate.outputs["Red"]
        ramp = tree.nodes.new("ShaderNodeValToRGB")
        tree.links.new(value, ramp.inputs["Fac"])
        return ramp.outputs["Color"]

    for name, image, mode in (
        ("GrayThroughRamp", checker, None),
        ("GrayRedThroughRamp", checker, "RGB"),
        ("GrayHueThroughRamp", checker, "HSV"),
    ):
        mat, tree, bsdf = shading_material(name)
        tree.links.new(through_ramp(tree, image, mode), bsdf.inputs["Base Color"])
        materials.append(mat)

    for name, image, mode in (("GrayRampEmission", checker, None), ("EmissionRedThroughRamp", cutout, "RGB")):
        mat, tree, bsdf = shading_material(name)
        tree.links.new(through_ramp(tree, image, mode), bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
        materials.append(mat)

    mat, tree, bsdf = shading_material("EmissionShaderRedThroughRamp")
    tree.nodes.remove(bsdf)
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(through_ramp(tree, cutout, "RGB"), glow.inputs["Color"])
    tree.links.new(glow.outputs["Emission"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("SurfaceRedThroughRamp")
    tree.links.new(through_ramp(tree, cutout, "RGB"), tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    def attribute_output(tree, name):
        node = tree.nodes.new("ShaderNodeVertexColor")
        node.layer_name = name
        return node.outputs["Color"]

    mat, tree, bsdf = shading_material("AttributeBase")
    tree.links.new(attribute_output(tree, ""), bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeNamed")
    tree.links.new(attribute_output(tree, "Tint"), bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeFactor")
    tree.links.new(multiply_color(tree, attribute_output(tree, ""), (1.0, 0.5, 0.5)), bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeMissing")
    tree.links.new(attribute_output(tree, "Absent"), bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeEmission")
    tree.links.new(attribute_output(tree, "Paint"), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeGlowMissing")
    tree.links.new(attribute_output(tree, "Absent"), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeSurface")
    tree.links.new(attribute_output(tree, "Tint"), tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AttributeShared")
    tree.links.new(attribute_output(tree, ""), bsdf.inputs["Base Color"])
    materials.append(mat)
    mat, tree, bsdf = shading_material("AttributeUnusedSlot")
    tree.links.new(attribute_output(tree, ""), bsdf.inputs["Base Color"])
    materials.append(mat)
    other_attribute = bpy.data.materials.new("AttributeOther")
    other_bsdf = principled(other_attribute)
    other_attribute.node_tree.links.new(
        attribute_output(other_attribute.node_tree, "Tint"), other_bsdf.inputs["Base Color"]
    )

    def glow_shader(tree, color, strength):
        node = tree.nodes.new("ShaderNodeEmission")
        node.inputs["Color"].default_value = (*color, 1.0)
        node.inputs["Strength"].default_value = strength
        return node.outputs["Emission"]

    def combine(tree, kind, first, second, factor=None):
        node = tree.nodes.new(kind)
        if factor is not None:
            node.inputs["Fac"].default_value = factor
        shaders = [socket for socket in node.inputs if socket.type == "SHADER"]
        tree.links.new(first, shaders[0])
        tree.links.new(second, shaders[1])
        tree.links.new(node.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])

    mat, tree, bsdf = shading_material("AddGlow")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    combine(tree, "ShaderNodeAddShader", bsdf.outputs["BSDF"], glow_shader(tree, (1.0, 0.4, 0.0), 5.0))
    materials.append(mat)

    mat, tree, bsdf = shading_material("AddGlowFirst")
    bsdf.inputs["Base Color"].default_value = (0.5, 0.1, 0.1, 1.0)
    combine(tree, "ShaderNodeAddShader", glow_shader(tree, (0.2, 0.6, 1.0), 2.0), bsdf.outputs["BSDF"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("MixGlow")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    combine(tree, "ShaderNodeMixShader", bsdf.outputs["BSDF"], glow_shader(tree, (1.0, 0.4, 0.0), 4.0), 0.25)
    materials.append(mat)

    mat, tree, bsdf = shading_material("MixEmitter")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.5, 0.0, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 2.0
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (0.1, 0.6, 0.1, 1.0)
    combine(tree, "ShaderNodeMixShader", bsdf.outputs["BSDF"], diffuse.outputs["BSDF"], 0.25)
    materials.append(mat)

    mat, tree, bsdf = shading_material("MixHalfEmpty")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    half = tree.nodes.new("ShaderNodeMixShader")
    half.inputs["Fac"].default_value = 0.5
    tree.links.new(bsdf.outputs["BSDF"], [socket for socket in half.inputs if socket.type == "SHADER"][0])
    tree.links.new(half.outputs["Shader"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AddPrincipledGlow")
    bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    bsdf.inputs["Emission Color"].default_value = (0.0, 1.0, 0.5, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 3.0
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    combine(tree, "ShaderNodeAddShader", diffuse.outputs["BSDF"], bsdf.outputs["BSDF"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AddImageGlow")
    bsdf.inputs["Base Color"].default_value = (0.2, 0.3, 0.4, 1.0)
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(image_node(tree, checker).outputs["Color"], glow.inputs["Color"])
    combine(tree, "ShaderNodeAddShader", bsdf.outputs["BSDF"], glow.outputs["Emission"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("AddGlowOverImage")
    tree.links.new(image_node(tree, checker).outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    combine(tree, "ShaderNodeAddShader", bsdf.outputs["BSDF"], glow_shader(tree, (1.0, 0.4, 0.0), 1.0))
    materials.append(mat)

    mat, tree, bsdf = shading_material("SpecularBase")
    tree.nodes.remove(bsdf)
    specular = tree.nodes.new("ShaderNodeEeveeSpecular")
    specular.inputs["Base Color"].default_value = (0.1, 0.7, 0.1, 1.0)
    tree.links.new(specular.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("UdimBase")
    tree.links.new(image_node(tree, udim).outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("SequenceOffset")
    tree.links.new(sequence_node(tree, "sequence-offset", frame_offset=1).outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    mat, tree, bsdf = shading_material("SequenceCyclic")
    cyclic = sequence_node(tree, "sequence-cyclic", frame_duration=2, frame_start=0, use_cyclic=True)
    tree.links.new(cyclic.outputs["Color"], bsdf.inputs["Base Color"])
    materials.append(mat)

    if bpy.app.version >= (4, 3, 0):
        mat, tree, bsdf = shading_material("MetallicBase")
        tree.nodes.remove(bsdf)
        metal = tree.nodes.new("ShaderNodeBsdfMetallic")
        metal.inputs["Base Color"].default_value = (0.6, 0.3, 0.1, 1.0)
        tree.links.new(metal.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])
        materials.append(mat)

        mat, tree, bsdf = shading_material("MetallicConductor")
        tree.nodes.remove(bsdf)
        metal = tree.nodes.new("ShaderNodeBsdfMetallic")
        metal.fresnel_type = "PHYSICAL_CONDUCTOR"
        metal.inputs["Roughness"].default_value = 0.0
        tree.links.new(metal.outputs["BSDF"], tree.nodes["Material Output"].inputs["Surface"])
        materials.append(mat)

    objects = []
    for index, mat in enumerate(materials):
        bm = bmesh.new()
        shared = mat.name == "AttributeShared"
        bmesh.ops.create_grid(bm, x_segments=2 if shared else 1, y_segments=1, size=0.5)
        uv = bm.loops.layers.uv.new("UVMap")
        detail = bm.loops.layers.uv.new("Detail")
        for face in bm.faces:
            for loop in face.loops:
                loop[uv].uv = (loop.vert.co.x + 0.5, loop.vert.co.y + 0.5)
                loop[detail].uv = ((loop.vert.co.x + 0.5) * 0.5, (loop.vert.co.y + 0.5) * 0.5)
        unused_first = mat.name == "AttributeUnusedSlot"
        if shared:
            max(bm.faces, key=lambda face: face.calc_center_median().x).material_index = 1
        if unused_first:
            for face in bm.faces:
                face.material_index = 1
        slots = (mat, other_attribute) if shared else (other_attribute, mat) if unused_first else (mat,)
        obj = mesh_object(mat.name + "Plane", bm, slots)
        obj.location = ((index % 8) * 1.5, (index // 8) * 1.5, 0)
        if mat.name.startswith("Attribute"):
            for name, kind, domain, color in (("Paint", "FLOAT_COLOR", "POINT", PAINT), ("Tint", "BYTE_COLOR", "CORNER", TINT)):
                attribute = obj.data.color_attributes.new(name, kind, domain)
                for value in attribute.data:
                    value.color = color
            assert obj.data.color_attributes.default_color_name == "Paint"
        objects.append(obj)

    scene.frame_set(SHADING_FRAME)
    save_blend("shading")

    eevee = {}
    for name in ("TargetEevee", "TargetAllAndEevee", "TargetActiveAll", "MetallicBase"):
        if name not in bpy.data.materials:
            continue
        eevee_output = bpy.data.materials[name].node_tree.get_output_node("EEVEE")
        eevee_shader = eevee_output.inputs["Surface"].links[0].from_node
        eevee[name] = rounded(eevee_shader.inputs["Base Color"].default_value[0:3])
    shown = [
        obj for obj in objects if obj.active_material.name not in mapping_names and len(obj.material_slots) == 1
    ]
    for mat in materials:
        for node in mat.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBsdfPrincipled":
                node.inputs["Specular IOR Level"].default_value = 0.0
    base = bake(scene, shown, "DIFFUSE")
    emission = bake(scene, shown, "EMIT")
    baked = {}
    for obj in shown:
        name = obj.active_material.name
        baked[name] = {"base": rounded(base[obj.name][0:3]), "emission": rounded(emission[obj.name][0:3])}

    mapping_objects = [obj for obj in objects if obj.active_material.name in mapping_names]
    for obj in mapping_objects:
        tree = obj.active_material.node_tree
        texture = next(node for node in tree.nodes if node.bl_idname == "ShaderNodeTexImage")
        emit_only(tree, texture.inputs["Vector"].links[0].from_socket)
    mapped_uvs = bake(scene, mapping_objects, "EMIT")
    for obj in mapping_objects:
        tree = obj.active_material.node_tree
        emit_only(tree, tree.nodes.new("ShaderNodeTexCoord").outputs["UV"])
    uvs = bake(scene, mapping_objects, "EMIT")
    mapped = {}
    for obj in mapping_objects:
        pixels = [value - BAKE_OFFSET for value in uvs[obj.name]]
        targets = [value - BAKE_OFFSET for value in mapped_uvs[obj.name]]
        mapped[obj.active_material.name] = [
            rounded([pixels[i * 4], pixels[i * 4 + 1], targets[i * 4], targets[i * 4 + 1]])
            for i in range(BAKE_SIZE * BAKE_SIZE)
        ]

    rendered = {
        name: rendered_color(scene, next(obj for obj in objects if obj.name == name + "Plane"))
        for name in ("AddClear", "VolumeOnly", "Holdout")
    }
    eevee_engine = "BLENDER_EEVEE_NEXT" if bpy.app.version < (5, 0, 0) else "BLENDER_EEVEE"
    rendered_by_eevee = {
        name: rendered_color(scene, next(obj for obj in objects if obj.name == name + "Plane"), eevee_engine)
        for name in ("VeilUnread", "VeilRead", "VeilPremulUnread")
    }

    specular_plane = next(obj for obj in objects if obj.name == "SpecularBasePlane")
    specular_node = next(
        node
        for node in specular_plane.active_material.node_tree.nodes
        if node.bl_idname == "ShaderNodeEeveeSpecular"
    )
    specular_node.inputs["Specular"].default_value = (0.0, 0.0, 0.0, 1.0)
    white_world = (1.0, 1.0, 1.0)
    shaded = rendered_color(scene, specular_plane, eevee_engine, white_world)
    specular_node.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    white = rendered_color(scene, specular_plane, eevee_engine, white_world)
    albedo = {"SpecularBase": rounded([color / light for color, light in zip(shaded[0:3], white[0:3])])}

    conductor_plane = next((obj for obj in objects if obj.name == "MetallicConductorPlane"), None)
    if conductor_plane:
        conductor = next(
            node
            for node in conductor_plane.active_material.node_tree.nodes
            if node.bl_idname == "ShaderNodeBsdfMetallic"
        )
        shaded = rendered_color(scene, conductor_plane, eevee_engine, white_world)
        conductor.fresnel_type = "F82"
        conductor.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        conductor.inputs["Edge Tint"].default_value = (1.0, 1.0, 1.0, 1.0)
        white = rendered_color(scene, conductor_plane, eevee_engine, white_world)
        albedo["MetallicConductor"] = rounded([color / light for color, light in zip(shaded[0:3], white[0:3])])

    sequence_plane = next(obj for obj in objects if obj.name == "SequencePlane")
    sequence_user = next(
        node for node in sequence_plane.active_material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"
    ).image_user
    sequence_frames = []
    for start, duration, cyclic, offset, frame in SEQUENCE_USERS:
        sequence_user.frame_start = start
        sequence_user.frame_duration = duration
        sequence_user.use_cyclic = cyclic
        sequence_user.frame_offset = offset
        scene.frame_set(frame)
        texel = bake(scene, [sequence_plane], "DIFFUSE")[sequence_plane.name][0:3]
        sequence_frames.append([start, duration, int(cyclic), offset, frame, rounded(texel)])
    scene.frame_set(SHADING_FRAME)

    clip_objects = [obj for obj in objects if obj.active_material.name in clip_names]
    for obj in clip_objects:
        tree = obj.active_material.node_tree
        mix = next((node for node in tree.nodes if node.bl_idname == "ShaderNodeMixShader"), None)
        principled_node = next(node for node in tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled")
        alpha_input = mix.inputs["Fac"] if mix and mix.inputs["Fac"].links else principled_node.inputs["Alpha"]
        emit_only(tree, alpha_input.links[0].from_socket)
    alphas = bake(scene, clip_objects, "EMIT")
    clipped = {
        obj.active_material.name: rounded([value - BAKE_OFFSET for value in alphas[obj.name][0::4]])
        for obj in clip_objects
    }

    save_reference(
        "shading",
        {
            "fps": 24.0,
            "unitScale": 1.0,
            "baked": baked,
            "mapped": mapped,
            "clipped": clipped,
            "cutoutAlpha": rounded(list(cutout.pixels)[3::4]),
            "rendered": rendered,
            "renderedByEevee": rendered_by_eevee,
            "veil": rounded(list(veil.pixels)[0:4]),
            "premultiplied": rounded(premultiplied_texel),
            "eevee": eevee,
            "albedo": albedo,
            "files": files,
            "frame": SHADING_FRAME,
            "sequenceFrames": sequence_frames,
        },
    )


# ---------------------------------------------------------------- scenes

def build_scenes():
    """Objects hidden with the eye, a collection in two places, a collection instance, absolute shape keys, a sheared
    child, a constraint whose influence is animated from zero, geometry only a modifier makes, an Armature modifier
    limited by a vertex group, meshes with only edges or only vertices, and data linked from another file."""
    scene = reset_scene()
    library_path = os.path.join(HERE, "library-%s.blend" % VERSION)
    shared = bpy.data.meshes.new("SharedMesh")
    box_bmesh().to_mesh(shared)
    library_rock = bpy.data.objects.new("LibraryRock", shared)
    paint = material("LibraryPaint", (0.2, 0.5, 0.9))
    skeleton = bpy.data.armatures.new("LibrarySkeleton")
    library_rig = bpy.data.objects.new("LibraryRig", skeleton)
    kit_library = bpy.data.collections.new("LibraryKit")
    kit_library.objects.link(bpy.data.objects.new("KitPart", shared))
    holder = bpy.data.objects.new("WaveHolder", None)
    for frame, x in ((1, 0.0), (10, 1.0)):
        holder.location.x = x
        holder.keyframe_insert("location", index=0, frame=frame)
    wave = holder.animation_data.action
    wave.name = "LibraryWave"
    holder.animation_data.action = None
    for frame, x in ((1, 0.0), (5, 2.0)):
        holder.location.x = x
        holder.keyframe_insert("location", index=0, frame=frame)
    idle = holder.animation_data.action
    idle.name = "LibraryIdle"
    datablocks = {shared, library_rock, paint, library_rig, wave, idle, kit_library}
    bpy.data.libraries.write(library_path, datablocks, path_remap="RELATIVE_ALL")
    bpy.data.objects.remove(library_rock)
    bpy.data.objects.remove(library_rig)
    bpy.data.objects.remove(bpy.data.objects["KitPart"])
    bpy.data.collections.remove(kit_library)
    bpy.data.meshes.remove(shared)
    bpy.data.materials.remove(paint)
    bpy.data.armatures.remove(skeleton)
    bpy.data.objects.remove(holder)
    bpy.data.actions.remove(wave)
    bpy.data.actions.remove(idle)
    with bpy.data.libraries.load(library_path, link=True, relative=True) as (source, target):
        target.meshes = ["SharedMesh"]
        target.objects = ["LibraryRock", "LibraryRig"]
        target.materials = ["LibraryPaint"]
        target.actions = ["LibraryWave", "LibraryIdle"]
        target.collections = ["LibraryKit"]
    link(bpy.data.objects.new("Borrowed", target.meshes[0]))
    link(target.objects[0])
    scene.collection.children.link(target.collections[0])
    mesh_object("Painted", box_bmesh(), (target.materials[0],))
    rigs = bpy.data.collections.new("Rigs")
    scene.collection.children.link(rigs)
    link(target.objects[1], rigs)
    idler = link(bpy.data.objects.new("Idler", None), rigs)
    idler.animation_data_create().action = target.actions[1]
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

    wire = bmesh.new()
    ends = [wire.verts.new(point) for point in ((0, 0, 0), (0, 0, 1))]
    wire.edges.new(ends)
    mesh_object("Wire", wire)
    points = bmesh.new()
    for point in ((0, 1, 0), (0, 1, 1)):
        points.verts.new(point)
    mesh_object("Points", points)

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


# ---------------------------------------------------------------- stacks

def column_bmesh(x, segments=12, rings=5, radius=0.2, height=2.0):
    """A capped column standing on (x, 0, 0), smooth shaded, so a smoothing angle splits its caps from its sides."""
    bm = bmesh.new()
    grid = [[bm.verts.new((x + radius * math.cos(2 * math.pi * s / segments), radius * math.sin(2 * math.pi * s / segments),
                           height * r / (rings - 1))) for s in range(segments)] for r in range(rings)]
    for r in range(rings - 1):
        for s in range(segments):
            bm.faces.new((grid[r][s], grid[r][(s + 1) % segments], grid[r + 1][(s + 1) % segments], grid[r + 1][s]))
    bm.faces.new(list(reversed(grid[0])))
    bm.faces.new(grid[-1])
    for face in bm.faces:
        face.smooth = True
    return bm


def two_bone_rig(name):
    data = bpy.data.armatures.new(name + "Data")
    rig = link(bpy.data.objects.new(name, data))
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    lower = data.edit_bones.new("Lower")
    lower.head, lower.tail = (0, 0, 0), (0, 0, 1)
    upper = data.edit_bones.new("Upper")
    upper.head, upper.tail = (0, 0, 1), (0, 0, 2)
    upper.parent = lower
    upper.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    return rig


def stacked_column(name, x, modifiers):
    """A column weighted to Lower and Upper by height, with `modifiers` as (name, type, settings) in stack order."""
    column = mesh_object(name, column_bmesh(x))
    lower = column.vertex_groups.new(name="Lower")
    upper = column.vertex_groups.new(name="Upper")
    for vertex in column.data.vertices:
        weight = min(max(vertex.co.z - 0.5, 0.0), 1.0)
        lower.add([vertex.index], 1.0 - weight, "REPLACE")
        upper.add([vertex.index], weight, "REPLACE")
    for label, kind, settings in modifiers:
        if kind == "SMOOTH_BY_ANGLE":
            add_smooth_by_angle(column, settings["angle"])
            continue
        modifier = column.modifiers.new(label, kind)
        for key, value in settings.items():
            setattr(modifier, key, value)
    return column


def build_stacks():
    """Objects with two modifiers each, so that every modifier list has to be read past its first entry: an Armature
    modifier after a Mirror, before Smooth by Angle or a Subdivision Surface, after a disabled one, beside a second
    Armature modifier, and limited by a vertex group after a Mirror."""
    scene = reset_scene()
    rig = two_bone_rig("StackRig")
    other = two_bone_rig("OtherRig")
    skin = ("Armature", "ARMATURE", {"object": rig})
    mirror = ("Mirror", "MIRROR", {"use_mirror_merge": False})
    disabled = ("Other", "ARMATURE", {"object": other, "show_viewport": False})
    masked = ("Armature", "ARMATURE", {"object": rig, "vertex_group": "Lower"})
    columns = [
        stacked_column("MirrorFirst", 1.0, [mirror, skin]),
        stacked_column("SmoothAfter", 2.0, [skin, ("Smooth by Angle", "SMOOTH_BY_ANGLE", {"angle": 0.7})]),
        stacked_column("SubdivisionAfter", 3.0, [skin, ("Subdivision", "SUBSURF", {"levels": 1})]),
        stacked_column("SecondEnabled", 4.0, [disabled, skin]),
        stacked_column("TwoSkins", 5.0, [skin, ("Other", "ARMATURE", {"object": other})]),
        stacked_column("MaskedAfterMirror", 6.0, [mirror, masked]),
    ]

    bend = new_action(rig, "Bend")
    key_pose(rig, 1, {"Lower": {"rotation_euler": (0, 0, 0)}, "Upper": {"rotation_euler": (0, 0, 0)}})
    key_pose(rig, 10, {"Lower": {"rotation_euler": (0.4, 0, 0.2)}, "Upper": {"rotation_euler": (0.6, 0.1, 0)}})
    assign(rig, bend)
    scene.frame_set(1)

    rest_pose(scene)
    reference = {
        "fps": 24.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in columns},
        "stacks": {obj.name: [modifier.type for modifier in obj.modifiers] for obj in columns},
    }
    pose_pose(scene)
    scene.frame_set(10)
    reference["posed"] = {
        "frame": 10,
        "meshes": {
            obj.name: evaluated_positions(obj, scene)[:3 * len(obj.data.vertices)]
            for obj in columns if obj.name in ("MirrorFirst", "SmoothAfter", "SecondEnabled", "TwoSkins")
        },
    }
    scene.frame_set(1)
    save_blend("stacks")
    save_reference("stacks", reference)


# ---------------------------------------------------------------- images

def textured_plane(name, image, x):
    mat = bpy.data.materials.new(name)
    bsdf = principled(mat)
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co.x + 0.5, loop.vert.co.y + 0.5)
    mesh_object(name + "Plane", bm, (mat,)).location = (x, 0, 0)
    return mat


def file_image(name, stored_path):
    image = bpy.data.images.new(name, 1, 1)
    image.source = "FILE"
    image.filepath = stored_path
    return image


def link_packed_library_images(folder):
    """Links two images from a library in `folder` and packs them with it, as 5.x can: one the library packs, and one
    whose path starts at the library's folder."""
    os.makedirs(folder, exist_ok=True)
    library_path = os.path.join(folder, "images-packed-library-%s.blend" % VERSION)
    working = os.getcwd()
    os.chdir(HERE)
    pixels = bpy.data.images.load(os.path.join("textures", "checker.png"))
    pixels.pack()
    os.chdir(working)
    pixels.name = "LibraryPixels"
    beside = file_image("LibraryBeside", "//../textures/checker.png")
    for image in (pixels, beside):
        image.use_fake_user = True
    bpy.data.libraries.write(library_path, {pixels, beside})
    bpy.data.images.remove(pixels)
    bpy.data.images.remove(beside)
    with bpy.data.libraries.load(library_path, link=True, pack=True) as (source, target):
        target.images = ["LibraryPixels", "LibraryBeside"]
    os.remove(library_path)
    os.rmdir(folder)
    return [(image.name, image) for image in target.images]


def build_images():
    """Images as a file can hold them: one image file under two Image datablocks, one missing file under two, UDIM
    tiles packed into the file, an image linked from another file, and in 5.x, images packed with their library."""
    reset_scene()
    packed_with_library = []
    if bpy.app.version >= (5, 0, 0):
        packed_with_library = link_packed_library_images(os.path.join(HERE, "packed-library"))
    library_path = os.path.join(HERE, "images-library-%s.blend" % VERSION)
    shared = file_image("SharedChecker", "//textures/checker.png")
    shared.use_fake_user = True
    bpy.data.libraries.write(library_path, {shared})
    bpy.data.images.remove(shared)
    with bpy.data.libraries.load(library_path, link=True) as (source, target):
        target.images = ["SharedChecker"]
    forget_absolute_path(target.images[0].library, "//" + os.path.basename(library_path))

    tiles = {1001: (0.0, 1.0, 0.0, 1.0), 1002: (0.0, 0.0, 1.0, 1.0)}
    for number, color in tiles.items():
        bpy.data.images.remove(save_png("tiles.%d.png" % number, 2, 2, lambda x, y, color=color: color))
    working = os.getcwd()
    os.chdir(HERE)
    tiled = bpy.data.images.load(os.path.join("textures", "tiles.1001.png"))
    tiled.source = "TILED"
    tiled.pack()
    os.chdir(working)

    planes = [
        ("CheckerA", file_image("checker.png", "//textures/checker.png")),
        ("CheckerB", file_image("checker.png", "//textures/checker.png")),
        ("AbsentA", file_image("absent.png", "//textures/absent.png")),
        ("AbsentB", file_image("absent.png", "//textures/absent.png")),
        ("Tiled", tiled),
        ("Borrowed", target.images[0]),
        *packed_with_library,
    ]
    materials = [textured_plane(name, image, index * 1.5) for index, (name, image) in enumerate(planes)]
    save_blend("images", relative_remap=False)
    for number in tiles:
        os.remove(os.path.join(HERE, "textures", "tiles.%d.png" % number))
    os.remove(library_path)

    images = {}
    for mat in materials:
        image = next(node.image for node in mat.node_tree.nodes if node.type == "TEX_IMAGE")
        resolved = None
        if not image.packed_file:
            resolved = os.path.normpath(bpy.path.abspath(image.filepath, library=image.library))
        images[mat.name] = {
            "image": image.name,
            "file": resolved and os.path.relpath(resolved, HERE).replace(os.sep, "/"),
            "exists": resolved is not None and os.path.exists(resolved),
            "linked": image.library is not None,
            "linkedPacked": getattr(image, "is_linked_packed", False),
            "source": image.source,
            "packedTiles": [packed.tile_number for packed in image.packed_files],
            "packedSize": image.packed_file.size if image.packed_file else 0,
        }
    save_reference("images", {"fps": 24.0, "unitScale": 1.0, "images": images})


# ---------------------------------------------------------------- skin

def tube_bmesh(segments=8, rings=13, radius=0.2, height=2.4):
    bm = bmesh.new()
    grid = [[bm.verts.new((radius * math.cos(2 * math.pi * s / segments), radius * math.sin(2 * math.pi * s / segments),
                           height * r / (rings - 1))) for s in range(segments)] for r in range(rings)]
    for r in range(rings - 1):
        for s in range(segments):
            bm.faces.new((grid[r][s], grid[r][(s + 1) % segments], grid[r + 1][(s + 1) % segments], grid[r + 1][s]))
    for face in bm.faces:
        face.smooth = True
    return bm


def build_skin():
    scene = reset_scene()
    data = bpy.data.armatures.new("ChainData")
    rig = link(bpy.data.objects.new("Chain", data))
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    previous = None
    for index in range(6):
        bone = data.edit_bones.new("Link%d" % index)
        bone.head, bone.tail = (0, 0, 0.4 * index), (0, 0, 0.4 * (index + 1))
        bone.parent = previous
        bone.use_connect = previous is not None
        previous = bone
    bpy.ops.object.mode_set(mode="OBJECT")

    tube = mesh_object("Tube", tube_bmesh())
    links = [tube.vertex_groups.new(name="Link%d" % index) for index in range(6)]
    for vertex in tube.data.vertices:
        for index, group in enumerate(links):
            weight = 1.0 - abs(vertex.co.z - (0.4 * index + 0.2))
            if weight > 0.01:
                group.add([vertex.index], weight, "REPLACE")

    sheet = mesh_object("Sheet", bmesh_from(
        [(x - 1, y - 1, 1.3) for y in range(3) for x in range(3)], [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 7, 6), (4, 5, 8, 7)]
    ))
    group = sheet.vertex_groups.new(name="Link3")
    group.add([index for index in range(9) if index != 4], 1.0, "REPLACE")
    group.add([4], 0.00005, "REPLACE")

    clasp = mesh_object("Clasp", bmesh_from(
        [(1.0, 0.0, 0.2), (1.2, 0.0, 0.2), (1.2, 0.0, 0.4), (1.0, 0.0, 0.4)], [(0, 1, 2, 3)]
    ))
    for index, weight in enumerate((0.4, 0.3, 0.15, 0.1, 0.05)):
        clasp.vertex_groups.new(name="Link%d" % index).add([0], weight, "REPLACE")
    clasp.vertex_groups["Link0"].add([1, 2, 3], 1.0, "REPLACE")

    for obj in (tube, sheet, clasp):
        obj.parent = rig
        obj.modifiers.new("Armature", "ARMATURE").object = rig
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.25, 0.0, 0.1)

    scene.frame_set(1)
    bpy.context.view_layer.update()
    unit = scene.unit_settings.scale_length
    reference = {
        "fps": 24.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in (tube, sheet, clasp)},
        "bones": {bone.name: scene_matrix(rig.matrix_world @ bone.matrix, unit) for bone in rig.pose.bones},
        "posed": {obj.name: evaluated_positions(obj, scene) for obj in (tube, sheet, clasp)},
    }
    save_blend("skin")
    save_reference("skin", reference)


# ---------------------------------------------------------------- shapes

def build_shapes():
    scene = reset_scene()
    columns = 10
    folds = mesh_object("TwoFolds", bmesh_from(
        [(i * 0.5, j, 0.0) for j in range(2) for i in range(columns)],
        [(i, i + 1, i + 1 + columns, i + columns) for i in range(columns - 1)],
    ))
    folds.shape_key_add(name="Basis")
    tilt = folds.shape_key_add(name="TiltFold", from_mix=False)
    angle = math.radians(20)
    for index, point in enumerate(tilt.data):
        x, y, z = point.co
        z += max(index % columns - 5, 0) * 0.6
        point.co = (x, y * math.cos(angle) - z * math.sin(angle), y * math.sin(angle) + z * math.cos(angle))
    fold_left = folds.shape_key_add(name="FoldLeft", from_mix=False)
    for index, point in enumerate(fold_left.data):
        point.co.z += max(3 - index % columns, 0) * 0.6
    keys = folds.data.shape_keys.key_blocks
    for key in keys:
        key.value = 0.0
    add_smooth_by_angle(folds, math.radians(30))

    absolute = mesh_object("AbsoluteDrift", bmesh_from(
        [(x, y, 0.0) for y in range(4) for x in range(4)],
        [(x + 4 * y, x + 1 + 4 * y, x + 5 + 4 * y, x + 4 + 4 * y) for y in range(3) for x in range(3)],
    ))
    absolute.shape_key_add(name="Basis")
    lift = absolute.shape_key_add(name="Lift", from_mix=False)
    for point in lift.data:
        point.co.z += 0.4 if point.co.x > 1.5 else 0.0
    absolute.data.shape_keys.use_relative = False
    for index in (0, 5, 10):
        absolute.data.vertices[index].co.z += 0.7
    absolute.location = (0, 3, 0)

    scene.frame_set(1)
    reference = {
        "fps": 24.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "meshes": {obj.name: mesh_reference(obj, scene) for obj in (folds, absolute)},
    }
    reference["meshes"]["AbsoluteDrift"].update(
        restPositions=evaluated_positions(absolute, scene), corners=evaluated_corner_normals(absolute)
    )
    normals = {}
    for name in ("TiltFold", "FoldLeft"):
        for key in keys:
            key.value = 1.0 if key.name == name else 0.0
        normals[name] = evaluated_corner_normals(folds)
    for key in keys:
        key.value = 1.0
    reference["shapeKeys"] = {
        "TwoFolds": {
            "weights": {"TiltFold": 1.0, "FoldLeft": 1.0},
            "positions": evaluated_positions(folds, scene),
            "normals": normals,
        },
    }
    for key in keys:
        key.value = 0.0
    save_blend("shapes")
    save_reference("shapes", reference)


# ---------------------------------------------------------------- polyfill

def ring_point(count, radius, k, turn=1):
    angle = turn * 2 * math.pi * k / count
    return radius * math.cos(angle), radius * math.sin(angle)


def degenerate_polygons():
    """N-gons from a fixed seed whose triangles depend on the details of Blender's polyfill, by kind: stars and keyholes
    with corners on whole numbers, random walks, bent rings with a repeated corner, tiny rings far from the origin,
    and runs of corners along one line."""
    rng = random.Random(5)
    kinds = {}
    stars = []
    for _ in range(60):
        n = rng.randint(5, 40)
        points = (ring_point(n, rng.choice((1, 2, 3, 4)), k) for k in range(n))
        stars.append([(round(x), round(y), 0.0) for x, y in points])
    kinds["Stars"] = stars
    keyholes = []
    for _ in range(30):
        n, m = rng.randint(4, 12), rng.randint(3, 8)
        cx, cy = rng.randint(-1, 1), rng.randint(-1, 1)
        outer = [(round(x), round(y), 0.0) for x, y in (ring_point(n, 6, k) for k in range(n))]
        inner = [(cx + round(x), cy + round(y), 0.0) for x, y in (ring_point(m, 2, k, -1) for k in range(m))]
        cut = rng.randrange(n)
        keyholes.append(outer[:cut + 1] + inner + [inner[0], outer[cut]] + outer[cut + 1:])
    kinds["Keyholes"] = keyholes
    walks = []
    for _ in range(80):
        x = y = 0
        walk = []
        for _ in range(rng.randint(5, 30)):
            x += rng.choice((-1, 0, 1))
            y += rng.choice((-1, 0, 1))
            walk.append((float(x), float(y), 0.0))
        walks.append(walk)
    kinds["Walks"] = walks
    bent = []
    for _ in range(40):
        n = rng.randint(5, 25)
        points = [(*ring_point(n, rng.uniform(0.3, 1.0), k), rng.uniform(-0.3, 0.3)) for k in range(n)]
        if rng.random() < 0.5:
            index = rng.randrange(n)
            points.insert(index, points[index])
        bent.append(points)
    kinds["BentRings"] = bent
    far = []
    for _ in range(40):
        n = rng.randint(5, 20)
        points = (ring_point(n, 0.01 if k % 3 else 0.00999, k) for k in range(n))
        far.append([(10000 + x, -5000 + y, 300.0 + 0.001 * rng.random()) for x, y in points])
    kinds["FarRings"] = far
    runs = []
    for _ in range(150):
        n = rng.randint(5, 16)
        angle = rng.uniform(0, math.pi)
        run = []
        for k in range(n):
            t = rng.choice((0, 1, 2, 3, 4)) if k else 0
            off = rng.choice((0, 0, 0, 1e-4))
            run.append((t * math.cos(angle) - off * math.sin(angle), t * math.sin(angle) + off * math.cos(angle), 0.0))
        runs.append(run)
    kinds["Runs"] = runs
    return kinds


def build_polyfill():
    reset_scene()
    triangles = {}
    for name, shapes in degenerate_polygons().items():
        positions, faces = [], []
        for shape in shapes:
            faces.append(range(len(positions), len(positions) + len(shape)))
            positions += shape
        mesh = mesh_object(name, bmesh_from(positions, faces)).data
        mesh.calc_loop_triangles()
        triangles[name] = [[mesh.loops[loop].vertex_index for loop in t.loops] for t in mesh.loop_triangles]
    save_blend("polyfill")
    save_reference("polyfill", {"fps": 24.0, "unitScale": 1.0, "loopTriangles": triangles})


# ---------------------------------------------------------------- clips

def named_action(obj, name):
    action = obj.animation_data.action
    action.name = name
    return action


def own_slot(id_data):
    return id_data.animation_data.action_slot if LAYERED_ACTIONS else None


def set_interpolation(action, choose):
    for curve in fcurves_of(action):
        for point in curve.keyframe_points:
            point.interpolation = choose(curve)


def key_values(obj, path, index, keys):
    for frame, value in keys:
        getattr(obj, path)[index] = value
        obj.keyframe_insert(path, index=index, frame=frame)


def play(id_data, action, slot):
    data = id_data.animation_data or id_data.animation_data_create()
    data.action = action
    if LAYERED_ACTIONS and action is not None:
        data.action_slot = slot


def small_rig(name, bones, location=(0, 0, 0)):
    """An armature of (name, head, tail, parent) bones whose channels rotate in XYZ Euler."""
    data = bpy.data.armatures.new(name + "Data")
    rig = link(bpy.data.objects.new(name, data))
    rig.location = location
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent in bones:
        bone = data.edit_bones.new(bone_name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for channel in rig.pose.bones:
        channel.rotation_mode = "XYZ"
    return rig


def stacked_slots(name, x):
    """An armature and an action with two slots that key its bones <name>Base and <name>Tip: Lower moves the base along
    x, and Upper moves it the other way and the tip along y."""
    base, tip = name + "Base", name + "Tip"
    rig = small_rig(name + "Rig", ((base, (0, 0, 0), (0, 0, 1), None), (tip, (0, 0, 1), (0, 0, 2), base)), (x, 0, 0))
    action = bpy.data.actions.new(name)
    strip = action.layers.new("Layer").strips.new(type="KEYFRAME")
    slots = {}
    for slot_name, keys in (("Lower", ((base, 0, 1.0),)), ("Upper", ((base, 0, -1.0), (tip, 1, 0.4)))):
        slot = action.slots.new(id_type="OBJECT", name=slot_name)
        for bone_name, axis, value in keys:
            path = 'pose.bones["%s"].location' % bone_name
            curve = strip.channelbag(slot, ensure=True).fcurves.new(path, index=axis)
            curve.keyframe_points.insert(1, 0.0)
            curve.keyframe_points.insert(9, value)
        slots[slot_name] = slot
    set_interpolation(action, lambda curve: "LINEAR")
    return rig, action, slots


def slot_tracks(rig, action, slots):
    """One NLA track for each slot, from the bottom up, whose strip plays the action through it."""
    data = rig.animation_data or rig.animation_data_create()
    tracks = []
    for slot in slots:
        track = data.nla_tracks.new()
        strip = track.strips.new(action.name, 1, action)
        strip.action_slot = slot
        strip.action_frame_start, strip.action_frame_end = 1, 9
        tracks.append(track)
    return tracks


def tweak(rig, track, upper_stack):
    """Enters NLA tweak mode on the first strip of `track`. With `upper_stack`, the tracks above it still play, as when
    Tab enters tweak mode in the NLA editor. Only that editor's operator sets this, so it runs in a borrowed area."""
    data = rig.animation_data
    data.nla_tracks.active = track
    for other in data.nla_tracks:
        for strip in other.strips:
            strip.select = strip == track.strips[0]
    if upper_stack:
        activate(rig)
        window = bpy.context.window_manager.windows[0]
        area = window.screen.areas[0]
        kind = area.type
        area.type = "NLA_EDITOR"
        area.spaces.active.dopesheet.show_only_selected = True
        region = next(region for region in area.regions if region.type == "WINDOW")
        with bpy.context.temp_override(window=window, area=area, region=region):
            assert bpy.ops.nla.tweakmode_enter(use_upper_stack_evaluation=True) == {"FINISHED"}
            assert bpy.ops.nla.tweakmode_exit() == {"FINISHED"}
        area.type = kind
    data.use_tweak_mode = True


def build_clips():
    """Clips that hold, step and jump between frames: a hinge bone with constant keys under a moving parent, constant
    and linear axes of one property, a Stepped modifier, scale keyed to zero, a curve without keys, a constant key
    between frames, Bezier handles longer than the gap between their keys, and Cycles modifiers that jump at and
    between frames. Also an armature and an object saved with an unkeyed change to a keyed value, an armature set to
    its rest position, a constant key just after a frame, and Stepped steps before the modifier's offset. From Blender
    4.4 on, also unused actions with two slots for one armature, one slot named after it, an unused shape key action
    whose slot names one of two keys, one whose slot names a key without the shape key it animates, an object that has
    an action but no slot, an armature that plays one slot of an action and another through an NLA strip, an
    action whose only user has no slot, an object whose active action has no slot and whose muted NLA track plays it
    through one, and armatures whose two NLA tracks play two slots of one action that key one value, where the upper
    track wins unless Blender leaves it out: muted, under a muted strip, beside a soloed track and under an active
    action that the solo leaves out too, with the NLA off under the active action, above the tweaked track in tweak
    mode, beside a soloed track when the tweaked one is not, or beside the tweaked strip on its track. In tweak mode
    with the upper tracks playing, the upper track wins over the tweaked one, and an active action that tweak mode
    stashes plays over both; without them, the stashed action plays nowhere. In every version, also an object that
    plays an action that another object has on a muted track, and a curve that a Cycles modifier repeats before its
    first key."""
    scene = reset_scene()
    plays = []
    tweaking = []

    crossing = link(bpy.data.objects.new("Crossing", None))
    crossing.location = (0, -15, 0)
    key_values(crossing, "location", 0, ((1, 0.0), (9, 2.0)))
    cross = named_action(crossing, "Cross")
    set_interpolation(cross, lambda curve: "LINEAR")
    bystander = link(bpy.data.objects.new("Bystander", None))
    bystander.location = (0, -16, 0)
    muted = bystander.animation_data_create().nla_tracks.new()
    muted_strip = muted.strips.new("Cross", 1, cross)
    if LAYERED_ACTIONS:
        muted_strip.action_slot = own_slot(crossing)
    muted.mute = True
    plays.append((cross, [(crossing, own_slot(crossing))], [1, 5, 9]))

    rig = small_rig("HingeRig", (("Upper", (0, 0, 0), (0, 0, 1), None), ("Hand", (0, 0, 1), (0, 0, 1.5), "Upper")))
    rig.data.bones["Hand"].use_inherit_rotation = False
    upper, hand = rig.pose.bones["Upper"], rig.pose.bones["Hand"]
    hinge = new_action(rig, "HingeSteps")
    key_values(upper, "rotation_euler", 0, ((1, 0.0), (9, 1.6)))
    key_values(hand, "rotation_euler", 2, ((1, 0.0), (5, 0.4), (9, 0.4)))
    set_interpolation(hinge, lambda curve: "CONSTANT" if '"Hand"' in curve.data_path else "LINEAR")
    plays.append((hinge, [(rig, own_slot(rig))], [1, 2.5, 4.5, 5, 5.5, 8.5, 9]))

    mixed = link(bpy.data.objects.new("Mixed", None))
    key_values(mixed, "location", 0, ((1, 0.0), (5, 1.0), (9, 1.0)))
    key_values(mixed, "location", 1, ((1, 0.0), (9, 2.0)))
    mixed_steps = named_action(mixed, "MixedSteps")
    set_interpolation(mixed_steps, lambda curve: "CONSTANT" if curve.array_index == 0 else "LINEAR")
    plays.append((mixed_steps, [(mixed, own_slot(mixed))], [1, 3, 4.5, 5, 5.5, 9]))

    twos = link(bpy.data.objects.new("Twos", None))
    key_values(twos, "location", 0, ((1, 0.0), (13, 1.2)))
    on_twos = named_action(twos, "OnTwos")
    set_interpolation(on_twos, lambda curve: "LINEAR")
    fcurves_of(on_twos)[0].modifiers.new("STEPPED").frame_step = 2
    plays.append((on_twos, [(twos, own_slot(twos))], [1, 2, 2.5, 3, 3.5, 4, 5.5, 12.5, 13]))

    for name, flat, x in (("Flat", (1.0, 1.0, 0.0), 2.0), ("Vanish", (0.0, 0.0, 0.0), 3.0)):
        obj = link(bpy.data.objects.new(name, None))
        obj.location = (x, 0, 0)
        obj.rotation_euler = (0.3, 0.4, 0.5)
        for frame, scale in ((1, (1.0, 1.0, 1.0)), (5, flat), (9, (1.0, 1.0, 1.0))):
            obj.scale = scale
            obj.keyframe_insert("scale", frame=frame)
        action = named_action(obj, name + "Scale")
        set_interpolation(action, lambda curve: "LINEAR")
        plays.append((action, [(obj, own_slot(obj))], [1, 3, 4.5, 5, 5.5, 7]))

    lifted = link(bpy.data.objects.new("Lifted", None))
    lifted.location = (0, 0, 2)
    key_values(lifted, "location", 0, ((1, 0.0), (9, 1.0)))
    lifted_x = named_action(lifted, "LiftedX")
    set_interpolation(lifted_x, lambda curve: "LINEAR")
    bag = lifted_x.layers[0].strips[0].channelbags[0] if LAYERED_ACTIONS else lifted_x
    bag.fcurves.new("location", index=2)
    plays.append((lifted_x, [(lifted, own_slot(lifted))], [1, 5, 9]))

    late = link(bpy.data.objects.new("Late", None))
    key_values(late, "location", 0, ((1, 0.0), (4.5, 1.0), (9, 1.0)))
    late_step = named_action(late, "LateStep")
    set_interpolation(late_step, lambda curve: "CONSTANT")
    plays.append((late_step, [(late, own_slot(late))], [1, 4, 4.25, 4.5, 4.75, 5, 9]))

    eased = link(bpy.data.objects.new("Eased", None))
    key_values(eased, "location", 0, ((1, 0.0), (11, 1.0)))
    long_handles = named_action(eased, "LongHandles")
    first, last = fcurves_of(long_handles)[0].keyframe_points
    for point in (first, last):
        point.handle_left_type = point.handle_right_type = "FREE"
    first.handle_right = (7, 0)
    last.handle_left = (5, 1)
    plays.append((long_handles, [(eased, own_slot(eased))], [1, 3, 5, 8, 11]))

    faces = []
    if LAYERED_ACTIONS:
        orphan = bpy.data.actions.new("Orphan")
        orphan.use_fake_user = True
        strip = orphan.layers.new("Layer").strips.new(type="KEYFRAME")
        ghosts = []
        for name, x in (("Ghost1", 0.7), ("Ghost2", -0.7)):
            slot = orphan.slots.new(id_type="OBJECT", name=name)
            curve = strip.channelbag(slot, ensure=True).fcurves.new('pose.bones["Upper"].location', index=0)
            curve.keyframe_points.insert(1, 0.0)
            curve.keyframe_points.insert(9, x)
            ghosts.append(slot)
        plays.append((orphan, [(rig, ghosts[0])], [1, 5, 9]))

        for name, x in (("FaceA", 4.0), ("FaceB", 6.0)):
            face = mesh_object(name, box_bmesh())
            face.location = (x, 0, 0)
            face.shape_key_add(name="Basis")
            blink = face.shape_key_add(name="Blink", from_mix=False)
            blink.value = 0.0
            for point in blink.data:
                point.co.z += 0.5
            faces.append(face)
        key = faces[1].data.shape_keys
        blink = bpy.data.actions.new("BlinkB")
        blink.use_fake_user = True
        slot = blink.slots.new(id_type="KEY", name=key.name)
        curve = blink.layers.new("Layer").strips.new(type="KEYFRAME").channelbag(slot, ensure=True).fcurves.new(
            'key_blocks["Blink"].value', index=0
        )
        curve.keyframe_points.insert(1, 0.0)
        curve.keyframe_points.insert(9, 1.0)
        plays.append((blink, [(key, slot)], [1, 5, 9]))

        owner = link(bpy.data.objects.new("Owner", None))
        key_values(owner, "location", 0, ((1, 0.0), (9, 2.0)))
        owner_move = named_action(owner, "OwnerMove")
        slotless = link(bpy.data.objects.new("NoSlot", None))
        slotless.location = (0, 1, 0)
        play(slotless, owner_move, None)
        plays.append((owner_move, [(owner, own_slot(owner)), (slotless, None)], [1, 5, 9]))

        renamed = bpy.data.actions.new("Renamed")
        renamed.use_fake_user = True
        strip = renamed.layers.new("Layer").strips.new(type="KEYFRAME")
        renamed_slots = []
        for name, x in (("OldRig", 0.7), ("HingeRig", -0.7)):
            slot = renamed.slots.new(id_type="OBJECT", name=name)
            curve = strip.channelbag(slot, ensure=True).fcurves.new('pose.bones["Upper"].location', index=0)
            curve.keyframe_points.insert(1, 0.0)
            curve.keyframe_points.insert(9, x)
            renamed_slots.append(slot)
        plays.append((renamed, [(rig, renamed_slots[1])], [1, 5, 9]))

        plain = mesh_object("Plain", box_bmesh())
        plain.location = (8, 0, 0)
        winker = mesh_object("Winker", box_bmesh())
        winker.location = (10, 0, 0)
        for face, block_name in ((plain, "Up"), (winker, "Wink")):
            face.shape_key_add(name="Basis")
            block = face.shape_key_add(name=block_name, from_mix=False)
            block.value = 0.0
            for point in block.data:
                point.co.z += 0.5
            faces.append(face)
        plain.data.shape_keys.name = "PlainKey"
        wink_only = bpy.data.actions.new("WinkOnly")
        wink_only.use_fake_user = True
        slot = wink_only.slots.new(id_type="KEY", name="PlainKey")
        curve = wink_only.layers.new("Layer").strips.new(type="KEYFRAME").channelbag(slot, ensure=True).fcurves.new(
            'key_blocks["Wink"].value', index=0
        )
        curve.keyframe_points.insert(1, 0.0)
        curve.keyframe_points.insert(9, 1.0)
        plays.append((wink_only, [(winker.data.shape_keys, slot)], [1, 5, 9]))

    for name, keys, interpolation, start, end, frames in (
        ("CycJump", ((1, 0.0), (3, 1.0)), "LINEAR", 1, 9, [1, 2, 3, 3.25, 3.5, 4, 5, 5.25, 5.5, 9]),
        ("CycConst", ((1, 0.0), (2.5, 1.0), (4, 0.0)), "CONSTANT", 1, 10,
         [1, 2.5, 4, 4.5, 5.25, 5.5, 5.75, 7, 8.25, 8.5, 10]),
        ("CycBefore", ((20, 0.0), (30, 10.0)), "LINEAR", 0, 40,
         [0, 5, 9, 9.5, 9.9, 10, 10.5, 19, 19.5, 19.9, 20, 25, 30, 30.5, 35, 40]),
    ):
        cycled = link(bpy.data.objects.new(name, None))
        cycled.location = (0, -6, 0)
        key_values(cycled, "location", 0, keys)
        action = named_action(cycled, name)
        set_interpolation(action, lambda curve, chosen=interpolation: chosen)
        fcurves_of(action)[0].modifiers.new("CYCLES")
        action.use_frame_range = True
        action.frame_start, action.frame_end = start, end
        plays.append((action, [(cycled, own_slot(cycled))], frames))

    tweaked = small_rig("TweakRig", (("Bone", (0, 0, 0), (0, 0, 1), None), ("Tip", (0, 0, 1), (0, 0, 2), "Bone")), (-3, 0, 0))
    bone, tip = tweaked.pose.bones["Bone"], tweaked.pose.bones["Tip"]
    tweak_other = new_action(tweaked, "TweakOther")
    key_values(tip, "location", 1, ((1, 0.0), (9, 0.5)))
    tip.location = (0, 0, 0)
    plays.append((tweak_other, [(tweaked, own_slot(tweaked))], [1, 5, 9]))
    tweak_act = new_action(tweaked, "TweakAct")
    key_values(bone, "rotation_euler", 0, ((1, 0.5), (9, 1.0)))
    plays.append((tweak_act, [(tweaked, own_slot(tweaked))], [1, 5, 9]))
    nudged = link(bpy.data.objects.new("Nudged", None))
    nudged.location = (0, -3, 0)
    key_values(nudged, "location", 0, ((1, 1.0), (9, 2.0)))
    nudge = named_action(nudged, "Nudge")
    plays.append((nudge, [(nudged, own_slot(nudged))], [1, 5, 9]))
    for action in (tweak_other, tweak_act, nudge):
        set_interpolation(action, lambda curve: "LINEAR")
        action.use_fake_user = True

    resting = small_rig("RestRig", (("Keyed", (0, 0, 0), (0, 0, 1), None), ("Posed", (0, 0, 1), (0, 0, 2), "Keyed")), (-6, 0, 0))
    new_action(resting, "RestKeyed")
    key_values(resting.pose.bones["Keyed"], "rotation_euler", 0, ((1, 0.0), (9, 0.8)))
    resting.data.pose_position = "REST"
    rigs = [rig, tweaked, resting]

    just = link(bpy.data.objects.new("JustAfter", None))
    just.location = (0, -9, 0)
    key_values(just, "location", 0, ((1, 0.0), (4.0005, 1.0), (9, 1.0)))
    just_after = named_action(just, "JustAfter")
    set_interpolation(just_after, lambda curve: "CONSTANT")
    plays.append((just_after, [(just, own_slot(just))], [1, 4, 4.002, 4.1, 4.5, 4.75, 5, 9]))

    stepper = link(bpy.data.objects.new("Stepper", None))
    stepper.location = (0, -12, 0)
    key_values(stepper, "location", 0, ((1, 0.0), (13, 12.0)))
    offset_steps = named_action(stepper, "OffsetSteps")
    set_interpolation(offset_steps, lambda curve: "LINEAR")
    stepped = fcurves_of(offset_steps)[0].modifiers.new("STEPPED")
    stepped.frame_step, stepped.frame_offset = 2, 6
    plays.append((offset_steps, [(stepper, own_slot(stepper))], [1, 2, 2.5, 3, 4, 4.5, 5.5, 6, 7.5, 8, 12.5, 13]))

    if LAYERED_ACTIONS:
        dual_rig = small_rig("DualRig", (("Top", (0, 0, 0), (0, 0, 1), None), ("Low", (0, 0, 1), (0, 0, 2), "Top")), (6, 0, 0))
        dual = bpy.data.actions.new("Dual")
        strip = dual.layers.new("Layer").strips.new(type="KEYFRAME")
        dual_slots = []
        for slot_name, bone_name, axis, value in (("Active", "Top", 0, 0.5), ("Stripped", "Low", 1, 0.3)):
            slot = dual.slots.new(id_type="OBJECT", name=slot_name)
            curve = strip.channelbag(slot, ensure=True).fcurves.new('pose.bones["%s"].location' % bone_name, index=axis)
            curve.keyframe_points.insert(1, 0.0)
            curve.keyframe_points.insert(9, value)
            dual_slots.append(slot)
        set_interpolation(dual, lambda curve: "LINEAR")
        nla_strip = dual_rig.animation_data_create().nla_tracks.new().strips.new("Dual", 1, dual)
        nla_strip.action_slot = dual_slots[1]
        nla_strip.action_frame_start, nla_strip.action_frame_end = 1, 9
        play(dual_rig, dual, dual_slots[0])
        plays.append((dual, [(dual_rig, dual_slots[0])], [1, 5, 9]))
        rigs.append(dual_rig)

        holder = link(bpy.data.objects.new("Holder", None))
        holder.location = (0, 2, 0)
        key_values(holder, "location", 0, ((1, 0.0), (9, 2.0)))
        named_action(holder, "Lone")
        holder.animation_data.action_slot = None

        decoy = link(bpy.data.objects.new("Decoy", None))
        decoy.location = (0, 3, 0)
        key_values(decoy, "location", 0, ((1, 0.0), (9, 2.0)))
        reused = named_action(decoy, "Reused")
        reused.use_fake_user = True
        decoy.animation_data.action = None
        reuser = link(bpy.data.objects.new("Reuser", None))
        reuser.location = (0, 4, 0)
        reused_track = reuser.animation_data_create().nla_tracks.new()
        reused_track.strips.new("Reused", 1, reused).action_slot = reused.slots[0]
        reused_track.mute = True
        play(reuser, reused, None)

        stacks = ("Stack", "MutedTrack", "MutedStrip", "Soloed", "NlaOff", "Tweaked", "TweakedFull", "TweakedSolo",
                  "TweakedStrip", "Stashed", "StashedFull")
        for k, name in enumerate(stacks):
            stack_rig, stack, stack_slots = stacked_slots(name, 9 + 3 * k)
            lower_slot, upper_slot = stack_slots["Lower"], stack_slots["Upper"]
            owner = (stack_rig, None)
            if name == "NlaOff":
                slot_tracks(stack_rig, stack, [upper_slot])
                play(stack_rig, stack, lower_slot)
                stack_rig.animation_data.use_nla = False
                owner = (stack_rig, lower_slot)
            elif name == "TweakedStrip":
                [track] = slot_tracks(stack_rig, stack, [lower_slot])
                track.strips.new(name, 11, stack).action_slot = upper_slot
                tweak(stack_rig, track, False)
                tweaking.append(stack_rig)
            elif name.startswith("Stashed"):
                [lower] = slot_tracks(stack_rig, stack, [lower_slot])
                play(stack_rig, stack, upper_slot)
                tweak(stack_rig, lower, name == "StashedFull")
                tweaking.append(stack_rig)
                owner = (stack_rig, upper_slot)
            else:
                lower, upper = slot_tracks(stack_rig, stack, [lower_slot, upper_slot])
                if name == "MutedTrack":
                    upper.mute = True
                elif name == "MutedStrip":
                    upper.strips[0].mute = True
                elif name == "Soloed":
                    lower.is_solo = True
                    play(stack_rig, stack, upper_slot)
                    owner = (stack_rig, upper_slot)
                elif name == "TweakedSolo":
                    lower.is_solo = True
                    tweak(stack_rig, upper, False)
                    tweaking.append(stack_rig)
                elif name.startswith("Tweaked"):
                    tweak(stack_rig, lower, name == "TweakedFull")
                    tweaking.append(stack_rig)
            plays.append((stack, [owner], [1, 5, 9]))
            rigs.append(stack_rig)

    scene.frame_set(1)
    resting.pose.bones["Posed"].rotation_euler = (0.4, 0.0, 0.0)
    bone.rotation_euler[0] = 2.0
    nudged.location[0] = 3.0
    save_blend("clips")
    # Blender plays each active action again when it opens the file, which drops the unkeyed changes above.
    scene.frame_set(1)
    transforms = {obj.name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy()) for obj in scene.objects}
    poses = {armature.name: pose_values(armature) for armature in rigs}

    animatable = list(scene.objects) + [face.data.shape_keys for face in faces]
    nla_off = [id_data for id_data in animatable if id_data.animation_data and not id_data.animation_data.use_nla]
    clips = {}
    for action, owners, frames in plays:
        for id_data in animatable:
            data = id_data.animation_data
            if data:
                if data.use_tweak_mode:
                    data.use_tweak_mode = False
                data.action = None
                data.use_nla = any(id_data == owner for owner, _ in owners) and id_data not in nla_off
        for obj in scene.objects:
            obj.location, obj.rotation_euler, obj.scale = transforms[obj.name]
        for armature in rigs:
            pose_or_rest(armature, poses[armature.name], *(id_data for id_data, _ in owners))
        for face in faces:
            for block in face.data.shape_keys.key_blocks:
                block.value = 0.0
        for id_data, slot in owners:
            if id_data not in tweaking or slot is not None:
                play(id_data, action, slot)
            if id_data in tweaking:
                id_data.animation_data.use_tweak_mode = True
        samples = []
        for frame in frames:
            whole = math.floor(frame)
            scene.frame_set(whole, subframe=frame - whole)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            bones = {}
            for armature in rigs:
                evaluated = armature.evaluated_get(depsgraph)
                for channel in evaluated.pose.bones:
                    bones[channel.name] = scene_matrix(evaluated.matrix_world @ channel.matrix, 1.0)
            samples.append({
                "frame": frame,
                "bones": bones,
                "objects": world_matrices(scene),
                "weights": {
                    face.name: {block.name: round(block.value, DIGITS) for block in face.data.shape_keys.key_blocks}
                    for face in faces
                },
            })
        clips[action.name] = samples
    curve = fcurves_of(long_handles)[0]
    save_reference("clips", {
        "fps": 24.0,
        "unitScale": 1.0,
        "clips": clips,
        "curves": {
            long_handles.name: [[frame / 4, round(curve.evaluate(frame / 4), DIGITS)] for frame in range(0, 4 * 12 + 1)],
        },
    })


# ---------------------------------------------------------------- opening

def linear_x(obj, name, keys):
    """Keys the object's location x through `keys` in a new active action called `name`, linear between them."""
    key_values(obj, "location", 0, keys)
    action = named_action(obj, name)
    set_interpolation(action, lambda curve: "LINEAR")
    return action


def strip_under(obj, value):
    """An NLA track under the object's animation whose strip holds its location x at `value`."""
    linear_x(obj, obj.name + "Strip", ((1, value), (30, value)))
    track = obj.animation_data.nla_tracks.new()
    track.strips.new(obj.name + "Strip", 1, obj.animation_data.action)
    obj.animation_data.action = None
    return track


def build_opening():
    """Objects and a shape key whose active actions Blender plays again when it opens the file, at frame 12: alone and
    over a muted or empty NLA track or with the NLA off, where it writes over values changed without a key; over NLA
    strips, by its extrapolation before or after its keys; over a soloed track; blended at half influence; in NLA
    tweak mode; under a driver, a Noise modifier and a mute. Also an unused action that keys another shape key."""
    scene = reset_scene()
    tweaked = []
    rows = (
        ("Plain", None, ((1, 0.0), (30, 29.0)), {}, True),
        ("Solo", 50.0, ((1, 0.0), (30, 29.0)), {"solo": True}, False),
        ("NothingBefore", 50.0, ((20, 0.0), (30, 10.0)), {"extend": "NOTHING"}, False),
        ("NothingAfter", 50.0, ((1, 0.0), (8, 7.0)), {"extend": "NOTHING"}, False),
        ("HoldForwardBefore", 50.0, ((20, 0.0), (30, 10.0)), {"extend": "HOLD_FORWARD"}, False),
        ("HoldForwardAfter", 50.0, ((1, 0.0), (8, 7.0)), {"extend": "HOLD_FORWARD"}, True),
        ("HoldBefore", 50.0, ((20, 0.0), (30, 10.0)), {"extend": "HOLD"}, True),
        ("MutedTrack", 50.0, ((1, 0.0), (30, 29.0)), {"influence": 0.5, "mute": True}, True),
        ("EmptyTrack", None, ((1, 0.0), (30, 29.0)), {"influence": 0.5, "empty": True}, True),
        ("NlaOff", 50.0, ((1, 0.0), (30, 29.0)), {"influence": 0.5, "nla_off": True}, True),
        ("Half", 50.0, ((1, 0.0), (30, 29.0)), {"influence": 0.5}, False),
        ("Driven", None, ((1, 0.0), (30, 29.0)), {"driver": True}, False),
        ("Noisy", None, ((1, 0.0), (30, 29.0)), {"noise": True}, False),
        ("Muted", None, ((1, 0.0), (30, 29.0)), {"mute_curve": True}, True),
    )
    for row, (name, under, keys, options, tweak) in enumerate(rows):
        obj = link(bpy.data.objects.new(name, None))
        obj.location = (0, row, 0)
        track = strip_under(obj, under) if under is not None else None
        action = linear_x(obj, name + "Act", keys)
        data = obj.animation_data
        if options.get("empty"):
            data.nla_tracks.new()
        if track and options.get("solo"):
            track.is_solo = True
        if track and options.get("mute"):
            track.mute = True
        if "influence" in options:
            data.action_influence = options["influence"]
        if "extend" in options:
            data.action_extrapolation = options["extend"]
        if options.get("nla_off"):
            data.use_nla = False
        if options.get("driver"):
            driver = obj.driver_add("location", 0).driver
            driver.type = "SCRIPTED"
            driver.expression = "4.0"
        if options.get("noise"):
            fcurves_of(action)[0].modifiers.new("NOISE").strength = 2.0
        if options.get("mute_curve"):
            fcurves_of(action)[0].mute = True
        if tweak:
            tweaked.append(obj)

    tweaking = link(bpy.data.objects.new("Tweaking", None))
    tweaking.location = (0, len(rows), 0)
    linear_x(tweaking, "TweakingAct", ((1, 0.0), (10, 18.0)))
    data = tweaking.animation_data
    track = data.nla_tracks.new()
    track.strips.new("TweakingAct", 10, data.action).select = True
    data.action = None
    data.nla_tracks.active = track
    data.use_tweak_mode = True

    face = mesh_object("Face", box_bmesh())
    face.location = (3, 0, 0)
    face.shape_key_add(name="Basis")
    for block_name, axis in (("Blink", 2), ("Smile", 0)):
        block = face.shape_key_add(name=block_name, from_mix=False)
        for point in block.data:
            point.co[axis] += 0.5
    key = face.data.shape_keys
    blocks = key.key_blocks
    for name, block_name in (("SmileAct", "Smile"), ("BlinkAct", "Blink")):
        if key.animation_data:
            key.animation_data.action = None
        for frame, value in ((1, 0.0), (21, 1.0)):
            blocks[block_name].value = value
            blocks[block_name].keyframe_insert("value", frame=frame)
        action = key.animation_data.action
        action.name = name
        action.use_fake_user = True
        set_interpolation(action, lambda curve: "LINEAR")

    scene.frame_set(12)
    for obj in tweaked:
        obj.location[0] = 100.0
    blocks["Blink"].value = 0.9
    blocks["Smile"].value = 0.3
    save_blend("opening")
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "opening-%s.blend" % VERSION))
    scene = bpy.context.scene
    weights = {block.name: round(block.value, DIGITS) for block in bpy.data.objects["Face"].data.shape_keys.key_blocks}
    save_reference("opening", {
        "fps": 24.0,
        "unitScale": 1.0,
        "objects": world_matrices(scene),
        "weights": {"Face": weights},
    })


# ---------------------------------------------------------------- relations

def rod_bmesh(rings=9, segments=8, radius=0.2, length=2.0):
    bm = bmesh.new()
    grid = [[bm.verts.new((radius * math.cos(2 * math.pi * s / segments), radius * math.sin(2 * math.pi * s / segments),
                           length * r / (rings - 1))) for s in range(segments)] for r in range(rings)]
    for r in range(rings - 1):
        for s in range(segments):
            bm.faces.new((grid[r][s], grid[r][(s + 1) % segments], grid[r + 1][(s + 1) % segments], grid[r + 1][s]))
    return bm


def plane_bmesh(columns=1):
    bm = bmesh.new()
    grid = [[bm.verts.new((x, y, 0.0)) for x in range(columns + 1)] for y in (0, 1)]
    for x in range(columns):
        bm.faces.new((grid[0][x], grid[0][x + 1], grid[1][x + 1], grid[1][x]))
    return bm


def edge_bmesh():
    """Four vertices joined by two edges, with no faces."""
    bm = bmesh.new()
    v = [bm.verts.new((x, y, 0.0)) for x, y in ((0, 0), (1, 0), (0, 1), (1, 1))]
    bm.edges.new((v[0], v[1]))
    bm.edges.new((v[2], v[3]))
    return bm


def descends(obj, ancestor):
    while obj.parent:
        if obj.parent == ancestor:
            return True
        obj = obj.parent
    return False


def instance_on_points():
    """A Geometry Nodes group that places a small cube on each point of its input, as instances."""
    tree = bpy.data.node_groups.new("InstanceOnPoints", "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    place = tree.nodes.new("GeometryNodeInstanceOnPoints")
    cube = tree.nodes.new("GeometryNodeMeshCube")
    cube.inputs["Size"].default_value = (0.1, 0.1, 0.1)
    tree.links.new(tree.nodes.new("NodeGroupInput").outputs["Geometry"], place.inputs["Points"])
    tree.links.new(cube.outputs["Mesh"], place.inputs["Instance"])
    tree.links.new(place.outputs["Instances"], tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    return tree


def raise_points():
    """A Geometry Nodes group that moves every point of its input up, which leaves it a plain mesh."""
    tree = bpy.data.node_groups.new("RaisePoints", "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    move = tree.nodes.new("GeometryNodeSetPosition")
    move.inputs["Offset"].default_value = (0.0, 0.0, 0.5)
    tree.links.new(tree.nodes.new("NodeGroupInput").outputs["Geometry"], move.inputs["Geometry"])
    tree.links.new(move.outputs["Geometry"], tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    return tree


def joined_to_input(name, output):
    """A Geometry Nodes group that joins what `output(tree)` returns, a node's geometry output, to its input."""
    tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    join = tree.nodes.new("GeometryNodeJoinGeometry")
    tree.links.new(tree.nodes.new("NodeGroupInput").outputs["Geometry"], join.inputs[0])
    tree.links.new(output(tree), join.inputs[0])
    tree.links.new(join.outputs[0], tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    return tree


def node_group(name, output):
    """A Geometry Nodes group that outputs what `output(tree, mesh)` returns for its input `mesh`, a geometry output."""
    tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    mesh = tree.nodes.new("NodeGroupInput").outputs["Geometry"]
    tree.links.new(output(tree, mesh), tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    return tree


def placed_cubes(tree, points):
    """An Instance on Points node that places a small cube on each of the points."""
    place = tree.nodes.new("GeometryNodeInstanceOnPoints")
    cube = tree.nodes.new("GeometryNodeMeshCube")
    cube.inputs["Size"].default_value = (0.1, 0.1, 0.1)
    tree.links.new(points, place.inputs["Points"])
    tree.links.new(cube.outputs["Mesh"], place.inputs["Instance"])
    return place


def simulated_rise(tree, mesh):
    """A simulation that moves the mesh up on each step, which leaves it a plain mesh."""
    start = tree.nodes.new("GeometryNodeSimulationInput")
    end = tree.nodes.new("GeometryNodeSimulationOutput")
    start.pair_with_output(end)
    move = tree.nodes.new("GeometryNodeSetPosition")
    move.inputs["Offset"].default_value = (0.0, 0.0, 0.1)
    tree.links.new(mesh, start.inputs["Geometry"])
    tree.links.new(start.outputs["Geometry"], move.inputs["Geometry"])
    tree.links.new(move.outputs["Geometry"], end.inputs["Geometry"])
    return end.outputs["Geometry"]


def loose_cubes(tree, mesh):
    """Cubes on the mesh's points that no node reads, beside the mesh, which the group outputs."""
    placed_cubes(tree, mesh)
    return mesh


def object_offset(tree, mesh):
    """The mesh moved by the location an Object Info node reads, which leaves it a plain mesh."""
    move = tree.nodes.new("GeometryNodeSetPosition")
    tree.links.new(mesh, move.inputs["Geometry"])
    tree.links.new(tree.nodes.new("GeometryNodeObjectInfo").outputs["Location"], move.inputs["Offset"])
    return move.outputs["Geometry"]


def muted_join(tree, mesh):
    """The mesh joined to cubes on its points through a muted link, which Blender leaves out."""
    join = tree.nodes.new("GeometryNodeJoinGeometry")
    tree.links.new(mesh, join.inputs[0])
    tree.links.new(placed_cubes(tree, mesh).outputs[0], join.inputs[0]).is_muted = True
    return join.outputs[0]


def nested(group):
    """A Group node that runs `group` on the mesh, as `node_group` takes it."""
    def output(tree, mesh):
        node = tree.nodes.new("GeometryNodeGroup")
        node.node_tree = group
        tree.links.new(mesh, node.inputs[0])
        return node.outputs[0]
    return output


def muted_cubes(tree, mesh):
    """A muted Instance on Points node, which passes the mesh on."""
    place = placed_cubes(tree, mesh)
    place.mute = True
    return place.outputs["Instances"]


def realized(tree, geometry, selection=True, realize_all=True):
    """Realize Instances on the geometry, which makes every instance real unless `selection` or `realize_all` is off."""
    node = tree.nodes.new("GeometryNodeRealizeInstances")
    node.inputs["Selection"].default_value = selection
    node.inputs["Realize All"].default_value = realize_all
    tree.links.new(geometry, node.inputs["Geometry"])
    return node.outputs["Geometry"]


def realized_cubes(**settings):
    """Cubes on the mesh's points that Realize Instances with `settings` makes real, as `node_group` takes them."""
    return lambda tree, mesh: realized(tree, placed_cubes(tree, mesh).outputs[0], **settings)


def bundled_cubes(tree, mesh):
    """Cubes on the mesh's points, put into a bundle and taken out of it."""
    combine = tree.nodes.new("NodeCombineBundle")
    combine.bundle_items.new("GEOMETRY", "Geometry")
    separate = tree.nodes.new("NodeSeparateBundle")
    separate.bundle_items.new("GEOMETRY", "Geometry")
    tree.links.new(placed_cubes(tree, mesh).outputs[0], combine.inputs[0])
    tree.links.new(combine.outputs[0], separate.inputs[0])
    return separate.outputs[0]


def cubes_in_closure(tree, mesh):
    """Cubes on the mesh's points, placed by a closure that the group evaluates on the mesh."""
    start = tree.nodes.new("NodeClosureInput")
    end = tree.nodes.new("NodeClosureOutput")
    start.pair_with_output(end)
    end.input_items.new("GEOMETRY", "Geometry")
    end.output_items.new("GEOMETRY", "Geometry")
    tree.links.new(placed_cubes(tree, start.outputs[0]).outputs["Instances"], end.inputs[0])
    evaluate = tree.nodes.new("NodeEvaluateClosure")
    evaluate.input_items.new("GEOMETRY", "Geometry")
    evaluate.output_items.new("GEOMETRY", "Geometry")
    tree.links.new(end.outputs["Closure"], evaluate.inputs["Closure"])
    tree.links.new(mesh, evaluate.inputs["Geometry"])
    return evaluate.outputs["Geometry"]


def line_mesh(tree, pencil=False):
    """A line made into a mesh, which is a plain mesh, or first into grease pencil, whose layer becomes an instance."""
    line = tree.nodes.new("GeometryNodeCurvePrimitiveLine").outputs["Curve"]
    if pencil:
        layers = tree.nodes.new("GeometryNodeCurvesToGreasePencil")
        layers.inputs["Instances as Layers"].default_value = False
        tree.links.new(line, layers.inputs["Curves"])
        line = layers.outputs["Grease Pencil"]
    mesh = tree.nodes.new("GeometryNodeCurveToMesh")
    tree.links.new(line, mesh.inputs["Curve"])
    return mesh.outputs["Mesh"]


def imported_obj(tree, path):
    """The instances Import OBJ makes from the file at `path`, which Blender reads from the working folder."""
    node = tree.nodes.new("GeometryNodeImportOBJ")
    node.inputs["Path"].default_value = path
    return node.outputs["Instances"]


def bake_instances(obj):
    """Gives the object a simulation that places a small cube on each of its points, packs the simulation's first frame
    into the file, and then takes out the nodes that placed the cubes, so that only the baked frame holds instances."""
    tree = bpy.data.node_groups.new("BakedInstances", "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    group_input = tree.nodes.new("NodeGroupInput")
    start = tree.nodes.new("GeometryNodeSimulationInput")
    end = tree.nodes.new("GeometryNodeSimulationOutput")
    start.pair_with_output(end)
    cube = tree.nodes.new("GeometryNodeMeshCube")
    cube.inputs["Size"].default_value = (0.1, 0.1, 0.1)
    place = tree.nodes.new("GeometryNodeInstanceOnPoints")
    tree.links.new(group_input.outputs["Geometry"], place.inputs["Points"])
    tree.links.new(cube.outputs["Mesh"], place.inputs["Instance"])
    tree.links.new(place.outputs["Instances"], start.inputs["Geometry"])
    tree.links.new(start.outputs["Geometry"], end.inputs["Geometry"])
    tree.links.new(end.outputs["Geometry"], tree.nodes.new("NodeGroupOutput").inputs["Geometry"])
    modifier = obj.modifiers.new("Simulation", "NODES")
    modifier.node_group = tree
    modifier.bake_target = "PACKED"
    bake = modifier.bakes[0]
    bake.use_custom_simulation_frame_range = True
    bake.frame_start, bake.frame_end = 1, 1
    bpy.context.scene.frame_set(1)
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.geometry_node_bake_single(
            session_uid=obj.session_uid, modifier_name=modifier.name, bake_id=bake.bake_id
        )
    tree.links.new(group_input.outputs["Geometry"], start.inputs["Geometry"])
    tree.nodes.remove(place)
    tree.nodes.remove(cube)


def forget_browser_directories():
    """Empties the file browser's folder, which Blender sets to the home folder of whoever runs this. Blender saves the
    folder's whole buffer, so it is overwritten in full first, or the end of the home folder would stay in the file."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params:
                    space.params.directory = b"/" * 2048
                    space.params.directory = b""


def chain_rig(name, location, parent=None):
    """An armature with two connected bones, Lower and Upper, one unit each up its Z axis."""
    rig = link(bpy.data.objects.new(name, bpy.data.armatures.new(name + "Data")))
    rig.parent = parent
    rig.location = location
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    lower = rig.data.edit_bones.new("Lower")
    lower.head, lower.tail = (0, 0, 0), (0, 0, 1)
    upper = rig.data.edit_bones.new("Upper")
    upper.head, upper.tail = (0, 0, 1), (0, 0, 2)
    upper.parent = lower
    upper.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    return rig


def skinned_tube(name, rig, location, parent=None, modifier=True, ungrouped_top=False):
    """A tube up the rig's bones, weighted to them by height; `ungrouped_top` leaves its top ring out of every group."""
    tube = mesh_object(name, rod_bmesh())
    tube.parent = parent
    tube.location = location
    lower = tube.vertex_groups.new(name="Lower")
    upper = tube.vertex_groups.new(name="Upper")
    for vertex in tube.data.vertices:
        if ungrouped_top and vertex.co.z > 1.99:
            continue
        share = min(max(vertex.co.z - 0.5, 0.0), 1.0)
        if share < 1.0:
            lower.add([vertex.index], 1.0 - share, "REPLACE")
        if share > 0.0:
            upper.add([vertex.index], share, "REPLACE")
    if modifier:
        tube.modifiers.new("Armature", "ARMATURE").object = rig
    return tube


def bend_action(rig, name, angle=0.6):
    action = new_action(rig, name)
    for frame, value in ((1, 0.0), (10, angle)):
        for bone in rig.pose.bones:
            bone.rotation_euler = (value, 0.3 * value, 0)
            bone.keyframe_insert("rotation_euler", frame=frame)
    reset_pose(rig)
    return action


def build_relations():
    """Objects whose display depends on others: skinned meshes that a clip moves apart from their armatures or not, near
    the origin and far from it, envelopes that reach ungrouped vertices or not, with a mask group, inverted or not, and
    without, envelope multiply inside and outside the envelope, armatures in rest position, vertex and face instancing
    with and without modifiers that change the vertices, Geometry Nodes that output instances, also from a nested group
    or a group from another file, or a plain mesh, also through a simulation or beside instancing nodes that are
    unread, muted, behind a muted link or realized, and, where the Blender version has the nodes, that import an OBJ
    file, make grease pencil, hold instances only in a baked simulation or pass them through a bundle or a closure,
    instancers that hide themselves, LOD levels hidden with the eye, and a collection and an object from another file
    linked inside a local collection.

    The library is written and linked by its bare file name from inside this folder, every library the fixture links,
    Blender's own assets included, is saved under its bare file name without remapping paths, and the file browser's
    folder is emptied, so the fixture records no absolute path."""
    scene = reset_scene()
    library_name = "relations-library-%s.blend" % VERSION
    shared = bpy.data.meshes.new("ShelfMesh")
    box_bmesh((0.3, 0.3, 0.3)).to_mesh(shared)
    shelf = bpy.data.collections.new("LibraryShelf")
    shelf.objects.link(bpy.data.objects.new("ShelfPart", shared))
    attic = bpy.data.collections.new("LibraryAttic")
    attic.objects.link(bpy.data.objects.new("AtticPart", shared))
    crate = bpy.data.objects.new("LibraryCrate", shared)
    library_cubes = node_group("LibraryCubes", lambda tree, mesh: placed_cubes(tree, mesh).outputs[0])
    working_dir = os.getcwd()
    os.chdir(HERE)
    try:
        bpy.data.libraries.write(library_name, {shelf, attic, crate, library_cubes}, path_remap="NONE")
        for name in ("ShelfPart", "AtticPart", "LibraryCrate"):
            bpy.data.objects.remove(bpy.data.objects[name])
        bpy.data.collections.remove(shelf)
        bpy.data.collections.remove(attic)
        bpy.data.meshes.remove(shared)
        bpy.data.node_groups.remove(library_cubes)
        with bpy.data.libraries.load(library_name, link=True) as (source, target):
            target.collections = ["LibraryShelf", "LibraryAttic"]
            target.objects = ["LibraryCrate"]
            target.node_groups = ["LibraryCubes"]
    finally:
        os.chdir(working_dir)
    props = bpy.data.collections.new("Props")
    scene.collection.children.link(props)
    for collection in target.collections:
        props.children.link(collection)
    props.objects.link(target.objects[0])
    linked_cubes = target.node_groups[0]

    motion = chain_rig("MotionRig", (0, 0, 0))
    riding = skinned_tube("Riding", motion, (0, 0, 0), parent=motion)
    beside = skinned_tube("Beside", motion, (0.6, 0, 0))
    travel = bend_action(motion, "RigTravels")
    motion.keyframe_insert("location", frame=1)
    motion.keyframe_insert("rotation_euler", frame=1)
    motion.location = (1.0, 0.5, 0.0)
    motion.rotation_euler = (0, 0, 0.6)
    motion.keyframe_insert("location", frame=10)
    motion.keyframe_insert("rotation_euler", frame=10)
    motion.location = (0, 0, 0)
    motion.rotation_euler = (0, 0, 0)

    carrier = link(bpy.data.objects.new("Carrier", None))
    carrier.location = (0, 4, 0)
    still = chain_rig("StillRig", (0, 4, 0))
    carried = skinned_tube("Carried", still, (0, 0, 0), parent=carrier)
    carried_rig = chain_rig("CarriedRig", (1, 0, 0), parent=carrier)
    along = skinned_tube("CarriedAlong", carried_rig, (1, 0, 0), parent=carrier)
    slide = new_action(carrier, "CarrierSlides")
    carrier.keyframe_insert("location", frame=1)
    carrier.location = (1.5, 4, 0)
    carrier.keyframe_insert("location", frame=10)
    carrier.location = (0, 4, 0)

    envelope_rig = chain_rig("EnvelopeRig", (0, 8, 0))
    column = skinned_tube("Column", envelope_rig, (0, 0, 0), parent=envelope_rig, modifier=False)
    stub = skinned_tube("Stub", envelope_rig, (0, 0, 0), parent=envelope_rig, modifier=False, ungrouped_top=True)
    for armature_child in (column, stub):
        armature_child.parent_type = "ARMATURE"
    envelope_bend = bend_action(envelope_rig, "EnvelopeBend")

    multiply_rig = chain_rig("MultiplyRig", (0, 12, 0))
    multiplied = skinned_tube("Multiplied", multiply_rig, (0, 12, 0))
    tip = multiply_rig.data.bones["Upper"]
    tip.use_envelope_multiply = True
    tip.envelope_distance = 0.05
    tip.head_radius = 0.05
    tip.tail_radius = 0.05
    multiply_bend = bend_action(multiply_rig, "MultiplyBend")

    rest_rig = chain_rig("RestRig", (0, 16, 0))
    resting = skinned_tube("Resting", rest_rig, (0, 16, 0))
    rest_bend = bend_action(rest_rig, "RestBend")
    rest_rig.data.pose_position = "REST"

    quiet_rig = chain_rig("QuietRig", (0, 20, 0))
    quiet = skinned_tube("Quiet", quiet_rig, (0, 20, 0))
    for bone in quiet_rig.pose.bones:
        bone.rotation_euler = (0.4, 0, 0)
    quiet_rig.data.pose_position = "REST"

    inside_rig = chain_rig("InsideRig", (0, 24, 0))
    inside = skinned_tube("MultipliedInside", inside_rig, (0, 24, 0))
    held = inside_rig.data.bones["Upper"]
    held.use_envelope_multiply = True
    held.head_radius = 2.0
    held.tail_radius = 2.0
    inside_bend = bend_action(inside_rig, "InsideBend")

    masked = skinned_tube("MaskedEnvelope", envelope_rig, (0, 8, 0), ungrouped_top=True)
    masked.vertex_groups.new(name="Body").add([v.index for v in masked.data.vertices if v.co.z <= 1.99], 1.0, "REPLACE")
    masked.modifiers["Armature"].use_bone_envelopes = True
    masked.modifiers["Armature"].vertex_group = "Body"
    unmasked = skinned_tube("InvertedMaskEnvelope", envelope_rig, (0, 8, 0), ungrouped_top=True)
    top = [vertex.index for vertex in unmasked.data.vertices if vertex.co.z > 1.99]
    unmasked.vertex_groups.new(name="Top").add(top, 1.0, "REPLACE")
    unmasked.modifiers["Armature"].use_bone_envelopes = True
    unmasked.modifiers["Armature"].vertex_group = "Top"
    unmasked.modifiers["Armature"].invert_vertex_group = True

    tiny_rig = chain_rig("TinyEnvelopeRig", (0, 32, 0))
    for bone in tiny_rig.data.bones:
        bone.envelope_distance = 0.0
        bone.head_radius = 0.01
        bone.tail_radius = 0.01
    outside = skinned_tube("OutsideEnvelopes", tiny_rig, (0, 0, 0), parent=tiny_rig, modifier=False, ungrouped_top=True)
    outside.parent_type = "ARMATURE"
    tiny_bend = bend_action(tiny_rig, "TinyEnvelopeBend")

    shared = []
    for name, x, y in (("Together", 0, 28), ("Far", 3000, 0)):
        rig = chain_rig(name + "Rig", (x, y, 0))
        body = skinned_tube(name + "Body", rig, (x, y, 0))
        body.delta_location = (0.6, 0, 0)
        action = new_action(rig, name + "Slides")
        rig.keyframe_insert("location", frame=1)
        rig.location = (x + 1.37, y + 0.5, 0)
        rig.keyframe_insert("location", frame=10)
        rig.location = (x, y, 0)
        assign(body, action)
        shared.append((action, rig, body))

    instancers = (("Scatter", "VERTS", plane_bmesh(1), "mesh"), ("Tiler", "FACES", plane_bmesh(2), "mesh"),
                  ("Bare", "VERTS", plane_bmesh(1), None), ("HiddenScatter", "VERTS", plane_bmesh(1), "mesh"),
                  ("FacelessTiler", "FACES", edge_bmesh(), "mesh"), ("EmptyScatter", "VERTS", plane_bmesh(1), "empty"),
                  ("SelfHiddenScatter", "VERTS", plane_bmesh(1), "mesh"),
                  ("NodeScatter", "VERTS", plane_bmesh(1), "mesh"),
                  ("SelfHiddenBare", "VERTS", plane_bmesh(1), None), ("Emitter", "NONE", plane_bmesh(1), None),
                  ("SmoothScatter", "VERTS", plane_bmesh(1), "mesh"),
                  ("ZeroModInstancer", "VERTS", bmesh.new(), "mesh"), ("CappedScatter", "VERTS", bmesh.new(), "mesh"),
                  ("PlainNodeScatter", "VERTS", plane_bmesh(1), "mesh"))
    for index, (name, kind, bm, child_kind) in enumerate(instancers):
        instancer = mesh_object(name, bm)
        instancer.location = (4, 4 * index, 0)
        instancer.instance_type = kind
        if child_kind == "mesh":
            child = mesh_object(name + "Child", box_bmesh((0.2, 0.2, 0.2)))
        elif child_kind == "empty":
            child = link(bpy.data.objects.new(name + "Child", None))
        if child_kind:
            child.parent = instancer
    bpy.data.objects["HiddenScatter"].hide_set(True)
    for name in ("SelfHiddenScatter", "SelfHiddenBare", "Emitter"):
        bpy.data.objects[name].show_instancer_for_viewport = False
    bpy.data.objects["NodeScatter"].modifiers.new("InstanceOnPoints", "NODES").node_group = instance_on_points()
    bpy.data.objects["PlainNodeScatter"].modifiers.new("Raise", "NODES").node_group = raise_points()
    bpy.data.objects["Emitter"].modifiers.new("Particles", "PARTICLE_SYSTEM")
    bpy.data.objects["ZeroModInstancer"].modifiers.new("Triangulate", "TRIANGULATE")
    cap = mesh_object("Cap", plane_bmesh(1))
    cap.location = (6, 0, 0)
    bpy.data.objects["CappedScatter"].modifiers.new("Array", "ARRAY").start_cap = cap
    smoothed = [name for name in ("SmoothScatter",) if add_smooth_by_angle(bpy.data.objects[name], 0.5)]
    obj_name = "relations-import-%s.obj" % VERSION
    with open(os.path.join(HERE, obj_name), "w") as handle:
        handle.write("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    os.chdir(HERE)
    cubes = node_group("Cubes", lambda tree, mesh: placed_cubes(tree, mesh).outputs[0])
    node_scatters = [
        ("PipeScatter", joined_to_input("LineMesh", line_mesh)),
        ("SimulatedScatter", node_group("SimulatedRise", simulated_rise)),
        ("LooseScatter", node_group("LooseCubes", loose_cubes)),
        ("MutedScatter", node_group("MutedCubes", muted_cubes)),
        ("RealizedScatter", node_group("RealizedCubes", realized_cubes())),
        ("PartlyRealizedScatter", node_group("PartlyRealizedCubes", realized_cubes(selection=False))),
        ("ShallowRealizedScatter", node_group("ShallowRealizedCubes", realized_cubes(realize_all=False))),
        ("ObjectOffsetScatter", node_group("ObjectOffset", object_offset)),
        ("MutedLinkScatter", node_group("MutedLinkCubes", muted_join)),
        ("NestedScatter", node_group("NestedCubes", nested(cubes))),
        ("RealizedNestedScatter", node_group(
            "RealizedNestedCubes", lambda tree, mesh: realized(tree, nested(cubes)(tree, mesh)))),
        ("LinkedNodeScatter", linked_cubes),
    ]
    if hasattr(bpy.types, "GeometryNodeImportOBJ"):
        node_scatters.append(("ImportScatter", joined_to_input("ImportOBJ", lambda tree: imported_obj(tree, obj_name))))
        node_scatters.append(("ImportRealizedScatter", joined_to_input(
            "RealizedOBJ", lambda tree: realized(tree, imported_obj(tree, obj_name)))))
    if hasattr(bpy.types, "GeometryNodeCurvesToGreasePencil"):
        node_scatters.append(("PencilScatter", joined_to_input("Pencil", lambda tree: line_mesh(tree, pencil=True))))
    if "bake_target" in bpy.types.NodesModifier.bl_rna.properties:
        node_scatters.append(("BakedScatter", None))
    if hasattr(bpy.types, "NodeCombineBundle"):
        node_scatters.append(("BundledScatter", node_group("BundledCubes", bundled_cubes)))
        node_scatters.append(("ClosureScatter", node_group("ClosureCubes", cubes_in_closure)))
    for index, (name, group) in enumerate(node_scatters):
        scatter = mesh_object(name, plane_bmesh(1))
        scatter.location = (16, 4 * index, 0)
        scatter.instance_type = "VERTS"
        mesh_object(name + "Child", box_bmesh((0.2, 0.2, 0.2))).parent = scatter
        if group:
            scatter.modifiers.new(group.name, "NODES").node_group = group
        else:
            bake_instances(scatter)

    for name, x, levels in (("Rock", 8, 2), ("Pebble", 10, 2), ("Stone", 12, 3)):
        for level in range(levels):
            mesh_object("%s_LOD%d" % (name, level), box_bmesh((0.5 - 0.1 * level,) * 3)).location = (x, 3 * level, 0)
    for name in ("Rock_LOD0", "Pebble_LOD1", "Stone_LOD0", "Stone_LOD1"):
        bpy.data.objects[name].hide_set(True)

    layer = bpy.context.view_layer
    layer.layer_collection.children["Props"].children["LibraryAttic"].exclude = True
    layer.update()
    scene.frame_set(1)
    skinned = (riding, beside, carried, along, column, stub, multiplied, resting, quiet, inside, masked, outside,
               *(body for _, _, body in shared), unmasked)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    instances = {}
    others = set()
    drawn = set()
    for instance in depsgraph.object_instances:
        source = instance.object.original
        if not instance.is_instance and instance.show_self:
            drawn.add(source.name)
        elif instance.is_instance and instance.parent:
            if not descends(source, instance.parent.original):
                others.add(instance.parent.name)
            elif source.type == "MESH":
                instances[instance.parent.name] = instances.get(instance.parent.name, 0) + 1
    os.chdir(working_dir)
    reference = {
        "fps": 24.0,
        "unitScale": 1.0,
        "rest": {obj.name: evaluated_positions(obj, scene) for obj in skinned},
        "instances": instances,
        "otherInstances": sorted(others),
        "instancersDrawn": sorted(name for name, *_ in instancers if name in drawn),
        "linkedShown": sorted(obj.name for obj in scene.objects if obj.library and obj.visible_get()),
        "levelsShown": sorted(obj.name for obj in scene.objects if "_LOD" in obj.name and obj.visible_get()),
        "smoothedByAngle": smoothed,
    }
    local = [obj for obj in scene.objects if obj.library is None]
    saved = {obj.name: (obj.location.copy(), obj.rotation_euler.copy()) for obj in local}
    forget_browser_directories()
    for library in bpy.data.libraries:
        name = os.path.basename(library.filepath)
        library.filepath = "x" * 1000
        library.filepath = name
    save_blend("relations", relative_remap=False)

    rigs = (motion, still, carried_rig, envelope_rig, multiply_rig, rest_rig, inside_rig, tiny_rig,
            *(rig for _, rig, _ in shared))
    clips = {}
    played = ((travel, motion), (slide, carrier), (envelope_bend, envelope_rig), (multiply_bend, multiply_rig),
              (rest_bend, rest_rig), (inside_bend, inside_rig), (tiny_bend, tiny_rig), *shared)
    for action, *owners in played:
        for obj in (*rigs, carrier, *(body for _, _, body in shared)):
            assign(obj, None)
        for obj in local:
            obj.location, obj.rotation_euler = saved[obj.name]
        for rig in rigs:
            reset_pose(rig)
        for owner in owners:
            assign(owner, action)
        samples = []
        for frame in (5, 10):
            scene.frame_set(frame)
            positions = {obj.name: evaluated_positions(obj, scene) for obj in skinned}
            samples.append({"frame": frame, "positions": positions})
        clips[action.name] = samples
    reference["clips"] = clips
    os.remove(os.path.join(HERE, library_name))
    os.remove(os.path.join(HERE, obj_name))
    save_reference("relations", reference)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    builders = (
        ("features", build_features),
        ("rig", build_rig),
        ("materials", build_materials),
        ("shading", build_shading),
        ("scenes", build_scenes),
        ("stacks", build_stacks),
        ("images", build_images),
        ("skin", build_skin),
        ("shapes", build_shapes),
        ("polyfill", build_polyfill),
        ("clips", build_clips),
        ("opening", build_opening),
        ("relations", build_relations),
    )
    for name, build in builders:
        if only is None or name in only:
            build()


main()
