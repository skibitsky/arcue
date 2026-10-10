"""Build Arcue's sample FBX corpus procedurally and measure it.

Run from the repository root:

    blender --background --factory-startup --python-exit-code 1 \
        --python tools/samples/generate.py

Options after `--`:
    --only NAME[,NAME...]   build and export only these samples
    --no-export             skip building; only re-measure existing files
    --no-manifest           skip measuring and writing samples/manifest.json

Every model except the Stone Striker is built from primitives in code. The Stone Striker comes from the Iza game and
is exported from sources/stone-striker.blend.
"""

import hashlib
import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector, noise

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "samples")
FPS = 30
FBX_TICKS_PER_SECOND = 46186158000

UNITY_EXPORT = dict(
    axis_forward="-Z",
    axis_up="Y",
    apply_unit_scale=True,
    apply_scale_options="FBX_SCALE_ALL",
    global_scale=1.0,
)


# ---------------------------------------------------------------- scene setup

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.frame_start = 0
    scene.frame_end = 0
    scene.frame_current = 0
    return scene


def make_material(name, color, roughness=0.6, metallic=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    mat.diffuse_color = (*color, 1.0)
    return mat


def object_from_bmesh(name, bm, materials=()):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def activate(obj):
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj, modifier):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def smart_uv(obj, margin=0.01):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def shade_by_angle(obj, degrees):
    activate(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def drop_to_ground(obj):
    min_z = min(v.co.z for v in obj.data.vertices)
    obj.data.transform(Matrix.Translation((0.0, 0.0, -min_z)))
    obj.data.update()


BASE_EXPORT = dict(
    use_selection=False,
    object_types={"ARMATURE", "MESH"},
    use_mesh_modifiers=True,
    mesh_smooth_type="FACE",
    use_tspace=False,
    add_leaf_bones=False,
    use_armature_deform_only=True,
    primary_bone_axis="Y",
    secondary_bone_axis="X",
    bake_anim=False,
    path_mode="AUTO",
    embed_textures=False,
)


def make_fbx_export_reproducible():
    """Keep FBX output independent of the process and the checkout directory.

    Blender's exporter derives object ids from Python's per-process salted hash(), and writes the absolute
    path of every texture next to its relative path. Use a fixed hash and write the relative path twice.
    """
    from io_scene_fbx import export_fbx_bin, fbx_utils

    def stable_hash(key):
        return int.from_bytes(hashlib.sha256(repr(key).encode()).digest()[:8], "little") >> 1

    fbx_utils.hash = stable_hash
    fbx_utils._keys_to_uuids.clear()
    fbx_utils._uuids_to_keys.clear()

    original_gen_vid_path = getattr(export_fbx_bin._gen_vid_path, "original", export_fbx_bin._gen_vid_path)

    def relative_vid_path(img, scene_data):
        _absolute, relative = original_gen_vid_path(img, scene_data)
        return relative, relative

    relative_vid_path.original = original_gen_vid_path
    export_fbx_bin._gen_vid_path = relative_vid_path


def export_settings(sample):
    return dict(BASE_EXPORT, **sample["export"])


def export_fbx(path, settings):
    make_fbx_export_reproducible()
    bpy.ops.export_scene.fbx(filepath=path, **settings)


# ---------------------------------------------------------------- geometry

def frame_along(direction, reference=Vector((0.0, 1.0, 0.0))):
    z = direction.normalized()
    if abs(z.dot(reference)) > 0.9:
        reference = Vector((0.0, 0.0, 1.0))
    x = reference.cross(z).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def add_lumpy_ellipsoid(bm, center, radii, rotation=None, lump=0.0, seed=0, subdivisions=3):
    """Append an icosphere deformed into a noisy ellipsoid. Noise is seeded, so output is stable."""
    rotation = rotation or Matrix.Identity(3)
    offset = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    temp = bmesh.new()
    bmesh.ops.create_icosphere(temp, subdivisions=subdivisions, radius=1.0, calc_uvs=False)
    for v in temp.verts:
        d = v.co.normalized()
        bump = noise.noise(d * 2.2 + offset, noise_basis="PERLIN_ORIGINAL")
        bump += 0.5 * noise.noise(d * 4.7 + offset, noise_basis="PERLIN_ORIGINAL")
        scaled = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2]))
        v.co = Vector(center) + rotation @ (scaled + d * (lump * bump))
    merge_into(bm, temp)


def add_capsule(bm, a, b, radius, lump, seed, overlap=0.03, thickness=None):
    a, b = Vector(a), Vector(b)
    direction = b - a
    half = direction.length / 2 + overlap
    rx = thickness if thickness else radius
    add_lumpy_ellipsoid(bm, (a + b) / 2, (rx, radius, half), frame_along(direction), lump, seed)


def merge_into(target, source):
    mesh = bpy.data.meshes.new("_merge")
    source.to_mesh(mesh)
    source.free()
    target.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)


def uv_sphere(segments, rings, radius):
    """A UV sphere with stable face order (bmesh.ops.create_uvsphere orders faces differently per run)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    grid = []
    for r in range(rings + 1):
        theta = math.pi * r / rings
        if r in (0, rings):
            pole = bm.verts.new((0.0, 0.0, radius * math.cos(theta)))
            grid.append([pole] * (segments + 1))
            continue
        row = [bm.verts.new((radius * math.sin(theta) * math.cos(2 * math.pi * s / segments),
                             radius * math.sin(theta) * math.sin(2 * math.pi * s / segments),
                             radius * math.cos(theta))) for s in range(segments)]
        grid.append(row + [row[0]])
    for r in range(rings):
        for s in range(segments):
            corners = [(r, s), (r + 1, s), (r + 1, s + 1), (r, s + 1)]
            if r == 0:
                corners.pop(0)
            elif r == rings - 1:
                corners.pop(1)
            face = bm.faces.new([grid[cr][cs] for cr, cs in corners])
            for loop, (cr, cs) in zip(face.loops, corners):
                loop[uv].uv = (cs / segments, 1.0 - cr / rings)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def beveled_box(bm, lo, hi, bevel, material_index):
    temp = bmesh.new()
    bmesh.ops.create_cube(temp, size=1.0)
    lo, hi = Vector(lo), Vector(hi)
    size = hi - lo
    center = (lo + hi) / 2
    bmesh.ops.transform(temp, matrix=Matrix.Diagonal((*size, 1.0)), verts=temp.verts)
    bmesh.ops.translate(temp, vec=center, verts=temp.verts)
    bmesh.ops.bevel(temp, geom=list(temp.edges), offset=bevel, segments=2, profile=0.5, affect="EDGES")
    for f in temp.faces:
        f.material_index = material_index
    merge_into(bm, temp)


# ---------------------------------------------------------------- crate

def build_crate():
    reset_scene()
    wood = make_material("Wood", (0.42, 0.26, 0.13), roughness=0.75)
    metal = make_material("Metal", (0.55, 0.56, 0.58), roughness=0.4, metallic=0.7)

    bm = bmesh.new()
    beveled_box(bm, (-0.5, -0.5, 0.0), (0.5, 0.5, 1.0), 0.03, 0)
    for z in (0.18, 0.82):
        beveled_box(bm, (-0.512, -0.512, z - 0.04), (0.512, 0.512, z + 0.04), 0.008, 1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, x1 = sorted((sx * 0.44, sx * 0.515))
            y0, y1 = sorted((sy * 0.44, sy * 0.515))
            beveled_box(bm, (x0, y0, 0.0), (x1, y1, 1.004), 0.008, 1)

    obj = object_from_bmesh("Crate", bm, (wood, metal))
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    shade_by_angle(obj, 35)
    drop_to_ground(obj)
    return obj


# ---------------------------------------------------------------- pebble golem

GOLEM_BONES = [
    # name, head, tail, parent, connected
    ("Hips", (0, 0, 0.62), (0, 0, 0.76), None, False),
    ("Spine", (0, 0, 0.76), (0, 0, 0.93), "Hips", True),
    ("Chest", (0, 0, 0.93), (0, 0, 1.17), "Spine", True),
    ("Neck", (0, 0, 1.17), (0, -0.02, 1.28), "Chest", True),
    ("Head", (0, -0.02, 1.28), (0, -0.02, 1.56), "Neck", True),
]
GOLEM_SIDE_BONES = [
    ("Shoulder", (0.08, 0, 1.11), (0.30, 0, 1.14), "Chest", False),
    ("UpperArm", (0.30, 0, 1.14), (0.50, 0, 0.90), "Shoulder", True),
    ("Forearm", (0.50, 0, 0.90), (0.66, 0, 0.68), "UpperArm", True),
    ("Hand", (0.66, 0, 0.68), (0.72, 0, 0.59), "Forearm", True),
    ("Thumb", (0.665, -0.055, 0.655), (0.675, -0.115, 0.575), "Hand", False),
    ("Index", (0.725, -0.048, 0.585), (0.765, -0.075, 0.495), "Hand", False),
    ("Middle", (0.73, 0.0, 0.58), (0.775, 0.0, 0.485), "Hand", False),
    ("Ring", (0.725, 0.048, 0.585), (0.765, 0.075, 0.495), "Hand", False),
    ("Thigh", (0.14, 0, 0.62), (0.16, 0, 0.35), "Hips", False),
    ("Shin", (0.16, 0, 0.35), (0.16, 0.01, 0.10), "Thigh", True),
    ("Foot", (0.16, 0.01, 0.10), (0.16, -0.15, 0.04), "Shin", True),
]
GOLEM_EYES = [Vector((sx * 0.058, -0.158, 1.415)) for sx in (1, -1)]


def mirror(co, side):
    return (co[0] * side, co[1], co[2])


def golem_bone_table():
    table = list(GOLEM_BONES)
    for suffix, side in ((".L", 1), (".R", -1)):
        for name, head, tail, parent, connected in GOLEM_SIDE_BONES:
            parent_name = parent if parent in ("Chest", "Hips") else parent + suffix
            table.append((name + suffix, mirror(head, side), mirror(tail, side), parent_name, connected))
    return table


def golem_body_bmesh():
    bm = bmesh.new()
    seed = iter(range(1, 1000))
    lump = 0.018
    add_lumpy_ellipsoid(bm, (0, 0.0, 0.67), (0.19, 0.15, 0.12), lump=lump, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0, 0.0, 0.86), (0.23, 0.18, 0.16), lump=lump, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0, 0.015, 1.05), (0.31, 0.21, 0.17), lump=0.022, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0, -0.04, 1.18), (0.12, 0.10, 0.08), lump=lump, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0, -0.035, 1.41), (0.15, 0.135, 0.135), lump=0.014, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0, -0.09, 1.31), (0.11, 0.075, 0.06), lump=0.01, seed=next(seed))
    add_lumpy_ellipsoid(bm, (0.02, 0.0, 1.55), (0.06, 0.05, 0.04), lump=0.008, seed=next(seed))
    for eye in GOLEM_EYES:
        add_lumpy_ellipsoid(bm, eye, (0.028, 0.02, 0.022), subdivisions=2)

    for side in (1, -1):
        def p(co):
            return Vector(mirror(co, side))
        add_lumpy_ellipsoid(bm, p((0.30, 0.0, 1.13)), (0.12, 0.12, 0.10), lump=0.016, seed=next(seed))
        add_capsule(bm, p((0.30, 0, 1.14)), p((0.50, 0, 0.90)), 0.075, 0.012, next(seed))
        add_lumpy_ellipsoid(bm, p((0.50, 0.0, 0.90)), (0.08, 0.08, 0.08), lump=0.01, seed=next(seed))
        add_capsule(bm, p((0.50, 0, 0.90)), p((0.66, 0, 0.68)), 0.088, 0.014, next(seed))
        add_capsule(bm, p((0.655, 0, 0.69)), p((0.725, 0, 0.585)), 0.062, 0.006, next(seed),
                    overlap=0.01, thickness=0.04)
        add_capsule(bm, p((0.665, -0.055, 0.655)), p((0.675, -0.115, 0.575)), 0.022, 0.003, next(seed),
                    overlap=0.012)
        for start, end in (((0.725, -0.048, 0.585), (0.765, -0.075, 0.495)),
                           ((0.73, 0.0, 0.58), (0.775, 0.0, 0.485)),
                           ((0.725, 0.048, 0.585), (0.765, 0.075, 0.495))):
            add_capsule(bm, p(start), p(end), 0.02, 0.003, next(seed), overlap=0.012)
        add_capsule(bm, p((0.14, 0, 0.62)), p((0.16, 0, 0.35)), 0.1, 0.014, next(seed))
        add_lumpy_ellipsoid(bm, p((0.16, -0.01, 0.35)), (0.085, 0.085, 0.08), lump=0.01, seed=next(seed))
        add_capsule(bm, p((0.16, 0, 0.35)), p((0.16, 0.01, 0.10)), 0.085, 0.012, next(seed))
        add_lumpy_ellipsoid(bm, p((0.16, -0.05, 0.055)), (0.095, 0.15, 0.065), lump=0.01, seed=next(seed))

    for v in bm.verts:
        if v.co.z < 0.0:
            v.co.z = 0.0
    return bm


def build_golem_mesh():
    stone = make_material("Stone", (0.46, 0.44, 0.40), roughness=0.85)
    glow = make_material("Glow", (0.35, 0.85, 1.0), roughness=0.3, emission=(0.35, 0.85, 1.0))
    obj = object_from_bmesh("PebbleGolem", golem_body_bmesh(), (stone, glow))

    remesh = obj.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.008
    remesh.adaptivity = 0.0
    apply_modifier(obj, remesh)

    decimate = obj.modifiers.new("Decimate", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = 9000 / max(len(obj.data.polygons), 1)
    decimate.use_collapse_triangulate = True
    apply_modifier(obj, decimate)

    drop_to_ground(obj)
    mesh = obj.data
    for poly in mesh.polygons:
        center = poly.center
        if poly.normal.y < -0.2 and any((center - eye).length < 0.03 for eye in GOLEM_EYES):
            poly.material_index = 1
    mesh.shade_smooth()
    smart_uv(obj)
    return obj


def build_golem_armature():
    data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connected in golem_bone_table():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.roll = 0.0
        eb.use_deform = True
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind_automatic_weights(mesh_obj, arm):
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    mesh_obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    weighted = set()
    for v in mesh_obj.data.vertices:
        for g in v.groups:
            if g.weight > 0.0:
                weighted.add(mesh_obj.vertex_groups[g.group].name)
    missing = [b.name for b in arm.data.bones if b.name not in weighted]
    if missing:
        raise RuntimeError("Automatic weights left bones without vertices: %s" % missing)


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def pose_idle(f):
    p = 2 * math.pi * f / 60
    s = math.sin(p)
    return {
        "Hips": [(Z, 1.5 * math.sin(p + 0.8))],
        "Spine": [(X, 2.0 * s)],
        "Chest": [(X, 3.0 * s), (Y, 1.0 * math.sin(p + 1.2))],
        "Neck": [(X, -1.5 * s)],
        "Head": [(Z, 7.0 * math.sin(p + 1.0)), (X, 2.0 * math.sin(2 * p))],
        "Shoulder.L": [(Y, -2.0 * s)],
        "Shoulder.R": [(Y, 2.0 * s)],
        "UpperArm.L": [(Y, -4.0 * s), (X, 3.0 * math.sin(p + 0.4))],
        "UpperArm.R": [(Y, 4.0 * s), (X, 3.0 * math.sin(p + 0.4))],
        "Forearm.L": [(X, -6.0 + 4.0 * math.sin(p + 0.6))],
        "Forearm.R": [(X, -6.0 + 4.0 * math.sin(p + 0.6))],
        **finger_curl(8.0 + 6.0 * math.sin(p + 1.4)),
    }, Vector((0.0, 0.0, -0.006 * (1 - math.cos(p))))


def finger_curl(degrees, sides=(".L", ".R")):
    out = {}
    for suffix in sides:
        sign = 1.0 if suffix == ".L" else -1.0
        for finger in ("Index", "Middle", "Ring"):
            out[finger + suffix] = [(Y, sign * degrees)]
        out["Thumb" + suffix] = [(Y, sign * degrees * 0.6)]
    return out


def pose_walk(f):
    p = 2 * math.pi * f / 30
    s, c = math.sin(p), math.cos(p)
    knee_l = 35.0 * max(0.0, c) ** 1.5
    knee_r = 35.0 * max(0.0, -c) ** 1.5
    return {
        "Hips": [(Z, 6.0 * s), (Y, 3.0 * s)],
        "Spine": [(X, -4.0)],
        "Chest": [(Z, -9.0 * s)],
        "Head": [(Z, 3.0 * s), (X, 2.0 * math.cos(2 * p))],
        "Thigh.L": [(X, -26.0 * s - 0.4 * knee_l)],
        "Thigh.R": [(X, 26.0 * s - 0.4 * knee_r)],
        "Shin.L": [(X, knee_l)],
        "Shin.R": [(X, knee_r)],
        "Foot.L": [(X, 26.0 * s * 0.5 - 0.6 * knee_l)],
        "Foot.R": [(X, -26.0 * s * 0.5 - 0.6 * knee_r)],
        "UpperArm.L": [(X, 22.0 * s)],
        "UpperArm.R": [(X, -22.0 * s)],
        "Forearm.L": [(X, -12.0 + 8.0 * s)],
        "Forearm.R": [(X, -12.0 - 8.0 * s)],
        **finger_curl(12.0),
    }, Vector((0.0, 0.0, 0.014 * math.cos(2 * p) - 0.014))


def pose_wave(f):
    raise_amount = smoothstep(0, 10, f) * (1 - smoothstep(35, 45, f))
    waving = smoothstep(8, 14, f) * (1 - smoothstep(31, 37, f))
    w = math.sin(2 * math.pi * (f - 10) / 12.5)
    return {
        "Chest": [(Y, -5.0 * raise_amount)],
        "Head": [(Y, 6.0 * raise_amount), (Z, -8.0 * raise_amount)],
        "Shoulder.R": [(Y, 18.0 * raise_amount)],
        "UpperArm.R": [(Y, 105.0 * raise_amount), (X, -12.0 * raise_amount)],
        "Forearm.R": [(Y, raise_amount * 25.0 + waving * 22.0 * w)],
        "Hand.R": [(Y, waving * 14.0 * math.sin(2 * math.pi * (f - 12) / 12.5))],
        "Index.R": [(Y, -6.0 * raise_amount)],
        "Middle.R": [(Y, -3.0 * raise_amount)],
        "Ring.R": [(Y, -6.0 * raise_amount)],
        "Thumb.R": [(X, -20.0 * raise_amount)],
        **finger_curl(8.0, sides=(".L",)),
    }, Vector((0.0, 0.0, 0.0))


def pose_hit(f):
    if f <= 3:
        h = math.sin(math.pi * f / 6)
    else:
        h = 0.5 * (1 + math.cos(math.pi * min(f - 3, 9) / 9))
    return {
        "Spine": [(X, 12.0 * h)],
        "Chest": [(X, 10.0 * h), (Z, 5.0 * h)],
        "Neck": [(X, 8.0 * h)],
        "Head": [(X, 16.0 * h)],
        "UpperArm.L": [(Y, -22.0 * h), (X, -10.0 * h)],
        "UpperArm.R": [(Y, 22.0 * h), (X, -10.0 * h)],
        "Forearm.L": [(X, -25.0 * h)],
        "Forearm.R": [(X, -25.0 * h)],
        "Thigh.L": [(X, -10.0 * h)],
        "Thigh.R": [(X, -10.0 * h)],
        "Shin.L": [(X, 18.0 * h)],
        "Shin.R": [(X, 18.0 * h)],
        "Foot.L": [(X, -8.0 * h)],
        "Foot.R": [(X, -8.0 * h)],
        **finger_curl(30.0 * h),
    }, Vector((0.0, 0.05 * h, -0.03 * h))


GOLEM_CLIPS = [("Idle", 60, pose_idle), ("Walk", 30, pose_walk), ("Wave", 45, pose_wave), ("Hit", 15, pose_hit)]


def bake_clip(arm, name, frames, pose_fn, root="Hips"):
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    rest = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
    for f in range(frames + 1):
        rotations, root_offset = pose_fn(f)
        for pb in arm.pose.bones:
            q = Quaternion()
            for axis, degrees in rotations.get(pb.name, ()):
                q = Quaternion(axis, math.radians(degrees)) @ q
            pb.rotation_quaternion = rest[pb.name].inverted() @ q @ rest[pb.name]
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
        root_bone = arm.pose.bones[root]
        root_bone.location = rest[root].inverted() @ root_offset
        root_bone.keyframe_insert("location", frame=f, group=root)
    action.use_frame_range = True
    action.frame_start = 0
    action.frame_end = frames
    action.use_fake_user = True
    return action


def build_golem():
    scene = reset_scene()
    mesh_obj = build_golem_mesh()
    arm = build_golem_armature()
    bind_automatic_weights(mesh_obj, arm)
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    actions = [bake_clip(arm, name, frames, fn) for name, frames, fn in GOLEM_CLIPS]
    arm.animation_data.action = actions[0]
    scene.frame_start, scene.frame_end = 0, 60
    scene.frame_set(0)
    return arm


def golem_export_settings(simplify):
    return dict(
        UNITY_EXPORT,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=simplify,
    )


# ---------------------------------------------------------------- blob

def build_blob():
    scene = reset_scene()
    scene.name = "Bounce"
    slime = make_material("Slime", (0.30, 0.75, 0.42), roughness=0.25)
    eye = make_material("Eye", (0.03, 0.03, 0.04), roughness=0.15)

    bm = uv_sphere(40, 20, 0.3)
    for v in bm.verts:
        v.co.z *= 0.82
        if v.co.z < -0.17:
            v.co.z = -0.17 + (v.co.z + 0.17) * 0.15
        v.co.z += 0.2
    body_verts = len(bm.verts)
    eye_centers = [Vector((sx * 0.1, -0.235, 0.29)) for sx in (1, -1)]
    for center in eye_centers:
        temp = uv_sphere(16, 10, 0.05)
        bmesh.ops.scale(temp, vec=(1.0, 0.7, 1.15), verts=temp.verts)
        bmesh.ops.translate(temp, vec=center, verts=temp.verts)
        for f in temp.faces:
            f.material_index = 1
        merge_into(bm, temp)
    min_z = min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, -min_z), verts=bm.verts)
    eye_centers = [c - Vector((0, 0, min_z)) for c in eye_centers]

    obj = object_from_bmesh("Blob", bm, (slime, eye))
    obj.data.shade_smooth()

    basis = obj.shape_key_add(name="Basis", from_mix=False)
    squash = obj.shape_key_add(name="Squash", from_mix=False)
    blink = obj.shape_key_add(name="Blink", from_mix=False)
    for i, v in enumerate(basis.data):
        co = v.co.copy()
        squash.data[i].co = Vector((co.x * 1.22, co.y * 1.22, co.z * 0.72))
        if i >= body_verts:
            center = min(eye_centers, key=lambda c: (c - co).length)
            blink.data[i].co = Vector((co.x, co.y, center.z + (co.z - center.z) * 0.12))

    for f in range(31):
        squash.value = 0.5 - 0.5 * math.cos(2 * math.pi * f / 30)
        blink.value = max(0.0, 1.0 - abs(f - 23) / 3.0)
        squash.keyframe_insert("value", frame=f)
        blink.keyframe_insert("value", frame=f)
    obj.data.shape_keys.animation_data.action.name = "Bounce"
    scene.frame_start, scene.frame_end = 0, 30
    scene.frame_set(0)
    return obj


# ---------------------------------------------------------------- textured rock

def rock_bake_material(image):
    mat = bpy.data.materials.new("Rock")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    coord = nodes.new("ShaderNodeTexCoord")

    base_noise = nodes.new("ShaderNodeTexNoise")
    base_noise.inputs["Scale"].default_value = 4.0
    base_noise.inputs["Detail"].default_value = 8.0
    base_ramp = nodes.new("ShaderNodeValToRGB")
    base_ramp.color_ramp.elements[0].position = 0.3
    base_ramp.color_ramp.elements[0].color = (0.16, 0.15, 0.14, 1)
    base_ramp.color_ramp.elements[1].position = 0.7
    base_ramp.color_ramp.elements[1].color = (0.52, 0.49, 0.45, 1)

    lichen_noise = nodes.new("ShaderNodeTexNoise")
    lichen_noise.inputs["Scale"].default_value = 2.5
    lichen_noise.inputs["Detail"].default_value = 4.0
    lichen_ramp = nodes.new("ShaderNodeValToRGB")
    lichen_ramp.color_ramp.elements[0].position = 0.56
    lichen_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    lichen_ramp.color_ramp.elements[1].position = 0.62
    lichen_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)

    cracks = nodes.new("ShaderNodeTexVoronoi")
    cracks.feature = "DISTANCE_TO_EDGE"
    cracks.inputs["Scale"].default_value = 6.0
    crack_ramp = nodes.new("ShaderNodeValToRGB")
    crack_ramp.color_ramp.elements[0].position = 0.0
    crack_ramp.color_ramp.elements[0].color = (0.35, 0.35, 0.35, 1)
    crack_ramp.color_ramp.elements[1].position = 0.06
    crack_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)

    lichen_mix = nodes.new("ShaderNodeMix")
    lichen_mix.data_type = "RGBA"
    lichen_mix.inputs["B"].default_value = (0.42, 0.48, 0.16, 1)
    crack_mix = nodes.new("ShaderNodeMix")
    crack_mix.data_type = "RGBA"
    crack_mix.blend_type = "MULTIPLY"
    crack_mix.inputs["Factor"].default_value = 1.0

    links.new(coord.outputs["Object"], base_noise.inputs["Vector"])
    links.new(coord.outputs["Object"], lichen_noise.inputs["Vector"])
    links.new(coord.outputs["Object"], cracks.inputs["Vector"])
    links.new(base_noise.outputs["Fac"], base_ramp.inputs["Fac"])
    links.new(lichen_noise.outputs["Fac"], lichen_ramp.inputs["Fac"])
    links.new(cracks.outputs["Distance"], crack_ramp.inputs["Fac"])
    links.new(lichen_ramp.outputs["Color"], lichen_mix.inputs["Factor"])
    links.new(base_ramp.outputs["Color"], lichen_mix.inputs["A"])
    links.new(lichen_mix.outputs["Result"], crack_mix.inputs["A"])
    links.new(crack_ramp.outputs["Color"], crack_mix.inputs["B"])
    links.new(crack_mix.outputs["Result"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])

    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    return mat


def use_baked_texture(mat, image):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.diffuse_color = (0.4, 0.38, 0.35, 1.0)


def build_textured_rock(texture_dir):
    scene = reset_scene()
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0, calc_uvs=False)
    offset = Vector((11.3, 4.1, 7.7))
    for v in bm.verts:
        d = v.co.normalized()
        bump = noise.fractal(d * 1.3 + offset, 0.55, 2.1, 5, noise_basis="PERLIN_ORIGINAL")
        facet = noise.voronoi(d * 2.0 + offset, distance_metric="DISTANCE", exponent=2.5)[0][0]
        r = 1.0 + 0.16 * bump - 0.12 * facet
        v.co = Vector((d.x * 0.46 * r, d.y * 0.36 * r, d.z * 0.3 * r))
        if v.co.z < -0.16:
            v.co.z = -0.16 + (v.co.z + 0.16) * 0.1
    obj = object_from_bmesh("Rock", bm)
    drop_to_ground(obj)
    obj.data.shade_smooth()
    smart_uv(obj, margin=0.02)

    image = bpy.data.images.new("rock_basecolor", 512, 512, alpha=False)
    mat = rock_bake_material(image)
    obj.data.materials.append(mat)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.seed = 0
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    activate(obj)
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    path = os.path.join(texture_dir, "rock_basecolor.png")
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    use_baked_texture(mat, image)
    return obj


# ---------------------------------------------------------------- z-up centimeters

def build_mushroom():
    reset_scene()
    cap_mat = make_material("Cap", (0.75, 0.16, 0.10), roughness=0.5)
    stem_mat = make_material("Stem", (0.90, 0.85, 0.72), roughness=0.7)
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")

    stem = bmesh.new()
    stem.loops.layers.uv.new("UVMap")
    bmesh.ops.create_cone(stem, cap_ends=True, cap_tris=False, segments=24, radius1=0.03, radius2=0.021,
                          depth=0.11, calc_uvs=True)
    bmesh.ops.translate(stem, vec=(0, 0, 0.055), verts=stem.verts)
    for f in stem.faces:
        f.material_index = 1
    merge_into(bm, stem)

    cap = uv_sphere(32, 16, 0.075)
    for v in cap.verts:
        v.co.z = v.co.z * 0.55 if v.co.z > 0 else v.co.z * 0.18
        v.co.z += 0.105
    merge_into(bm, cap)

    obj = object_from_bmesh("Mushroom", bm, (cap_mat, stem_mat))
    obj.data.shade_smooth()
    drop_to_ground(obj)
    return obj


# ---------------------------------------------------------------- rock with LODs

# Icosphere levels share their coarser levels' vertices, so each lower LOD's vertices are a subset of LOD0's and
# the LODs stay inside LOD0's bounds. The collision box sits inside them too.

ROCK_LOD_SUBDIVISIONS = [4, 3, 2]


def rock_lod_bmesh(subdivisions):
    bm = bmesh.new()
    add_lumpy_ellipsoid(bm, (0, 0, 0.2), (0.3, 0.24, 0.2), lump=0.03, seed=41, subdivisions=subdivisions)
    return bm


def build_rock_lods():
    reset_scene()
    stone = make_material("Stone", (0.45, 0.43, 0.4), roughness=0.85)
    lods = [object_from_bmesh("Rock_LOD%d" % level, rock_lod_bmesh(subdivisions), (stone,))
            for level, subdivisions in enumerate(ROCK_LOD_SUBDIVISIONS)]
    ground = Matrix.Translation((0.0, 0.0, -min(v.co.z for v in lods[0].data.vertices)))
    for obj in lods:
        obj.data.transform(ground)
        obj.data.update()
        shade_by_angle(obj, 40)

    bm = bmesh.new()
    add_lumpy_ellipsoid(bm, (0.48, -0.1, 0.06), (0.08, 0.07, 0.06), lump=0.008, seed=43, subdivisions=3)
    pebble = object_from_bmesh("Pebble", bm, (stone,))
    drop_to_ground(pebble)
    shade_by_angle(pebble, 40)

    corners = [v.co for v in lods[0].data.vertices]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    center, half = (lo + hi) / 2, (hi - lo) / 2 * 0.8
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*half, 1.0)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    object_from_bmesh("UCX_Rock", bm, (stone,))
    return lods[0]


# ---------------------------------------------------------------- modular beetle

# A creature spread over three files, as game pipelines split one asset: legs with the rig and a walk, two
# alternative shells modelled in the rest pose over the Body bone, and an animation-only file with one more clip.
# The manifest's composition for beetle.fbx puts them back together.

BEETLE_LEG_ROWS = [("F", -0.08), ("M", 0.0), ("B", 0.08)]
BEETLE_SIDES = [("L", 1), ("R", -1)]
BEETLE_TRIPOD = {"FL", "MR", "BL"}


def beetle_bone_table():
    table = [("Body", (0, 0, 0.17), (0, -0.12, 0.17), None, False)]
    for row, y in BEETLE_LEG_ROWS:
        for side, sx in BEETLE_SIDES:
            leg = row + side
            table.append(("Thigh." + leg, (sx * 0.07, y, 0.16), (sx * 0.17, y * 1.4, 0.2), "Body", False))
            table.append(("Shin." + leg, (sx * 0.17, y * 1.4, 0.2), (sx * 0.25, y * 1.8, 0.0), "Thigh." + leg, True))
    return table


def build_beetle_armature():
    data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connected in beetle_bone_table():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.roll = 0.0
        eb.use_deform = True
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def build_beetle_legs(arm):
    """Capsules along each leg bone and a flat belly, each part weighted fully to its own bone."""
    bm = bmesh.new()
    owners = []
    seed = iter(range(200, 400))

    def add(bone, build):
        start = len(bm.verts)
        build()
        owners.append((bone, start, len(bm.verts)))

    add("Body", lambda: add_lumpy_ellipsoid(bm, (0, 0, 0.15), (0.1, 0.15, 0.04), lump=0.006, seed=next(seed),
                                            subdivisions=2))
    for name, head, tail, _parent, _connected in beetle_bone_table()[1:]:
        radius = 0.022 if name.startswith("Thigh") else 0.016
        add(name, lambda h=head, t=tail, r=radius: add_capsule(bm, h, t, r, 0.003, next(seed), overlap=0.012))
    for v in bm.verts:
        v.co.z = max(v.co.z, 0.0)
    stone = make_material("LegStone", (0.24, 0.22, 0.2), roughness=0.85)
    obj = object_from_bmesh("Legs", bm, (stone,))
    obj.data.shade_smooth()
    for bone, start, end in owners:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(start, end)), 1.0, "REPLACE")
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE")
    return obj


def beetle_leg_pose(p, lift_amount):
    """Tripod gait: one tripod swings forward with its feet lifted while the other pushes back on the ground."""
    pose = {}
    for row, _y in BEETLE_LEG_ROWS:
        for side, sx in BEETLE_SIDES:
            leg = row + side
            phase = p if leg in BEETLE_TRIPOD else p + math.pi
            swing = math.sin(phase)
            lift = max(0.0, math.cos(phase)) * lift_amount
            pose["Thigh." + leg] = [(Z, sx * 16.0 * swing), (Y, -sx * lift)]
            pose["Shin." + leg] = [(Y, sx * lift * 0.6)]
    return pose


def pose_beetle_walk(f):
    p = 2 * math.pi * f / 30
    pose = beetle_leg_pose(p, 22.0)
    pose["Body"] = [(Z, 5.0 * math.sin(p)), (Y, 6.0 * math.sin(2 * p))]
    return pose, Vector((0.0, 0.0, 0.012 * math.cos(2 * p) - 0.012))


def pose_beetle_turn(f):
    t = smoothstep(0, 40, f)
    p = 2 * math.pi * f / 20
    pose = beetle_leg_pose(p, 18.0 * math.sin(math.pi * t))
    pose["Body"] = [(Z, 90.0 * t)]
    return pose, Vector((0.0, 0.0, 0.0))


def build_beetle(with_legs, clip):
    scene = reset_scene()
    arm = build_beetle_armature()
    if with_legs:
        build_beetle_legs(arm)
    name, frames, pose_fn = clip
    arm.animation_data.action = bake_clip(arm, name, frames, pose_fn, root="Body")
    scene.frame_start, scene.frame_end = 0, frames
    scene.frame_set(0)
    return arm


def shell_dome(bm, seed):
    add_lumpy_ellipsoid(bm, (0, 0.01, 0.2), (0.15, 0.19, 0.085), lump=0.008, seed=seed, subdivisions=4)
    for v in bm.verts:
        if v.co.z < 0.16:
            v.co.z = 0.16


def build_beetle_shells():
    reset_scene()
    shell = make_material("Shell", (0.16, 0.24, 0.17), roughness=0.45)
    spike = make_material("Spike", (0.55, 0.46, 0.3), roughness=0.7)

    bm = bmesh.new()
    shell_dome(bm, 301)
    round_shell = object_from_bmesh("ShellRound", bm, (shell,))
    round_shell.data.shade_smooth()

    bm = bmesh.new()
    shell_dome(bm, 302)
    for v in bm.verts:
        v.co.z += 0.005
    for index, (x, y) in enumerate([(0.0, -0.08), (0.0, 0.02), (0.0, 0.11), (0.08, -0.02), (-0.08, -0.02),
                                    (0.07, 0.08), (-0.07, 0.08)]):
        z = 0.2 + 0.085 * math.sqrt(max(0.0, 1 - (x / 0.15) ** 2 - ((y - 0.01) / 0.19) ** 2))
        cone = bmesh.new()
        bmesh.ops.create_cone(cone, cap_ends=True, cap_tris=False, segments=8, radius1=0.018, radius2=0.002,
                              depth=0.06, calc_uvs=False)
        bmesh.ops.translate(cone, vec=(x, y, z + 0.022), verts=cone.verts)
        for face in cone.faces:
            face.material_index = 1
        merge_into(bm, cone)
    spiked = object_from_bmesh("ShellSpiked", bm, (shell, spike))
    spiked.data.shade_smooth()
    return round_shell


# The beetle's composition, as Arcue keeps it in the model's review folder. The web preview writes it there before it
# opens beetle.fbx.
BEETLE_SET = dict(
    model="beetle.fbx",
    description="Modular beetle in three files: legs with the rig and a walk, two alternative shells on the Body "
                "bone, the second hidden, and an animation-only file with a turn.",
    composition=dict(
        version=1,
        animations=["beetle-turn.fbx"],
        attach=[
            dict(file="beetle-shells.fbx", node="ShellRound", bone="Body"),
            dict(file="beetle-shells.fbx", node="ShellSpiked", bone="Body"),
        ],
        hidden=["beetle-shells.fbx//ShellSpiked"],
    ),
)


def beetle_export_settings(object_types):
    return dict(
        UNITY_EXPORT,
        object_types=object_types,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=0.0,
    )


# ---------------------------------------------------------------- stone striker

STRIKER_SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources", "stone-striker.blend")


def build_stone_striker():
    """Load the Stone Striker from the Iza game into an unsaved session, so no path reaches the FBX header."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    placeholder = bpy.context.scene
    with bpy.data.libraries.load(STRIKER_SOURCE, link=False) as (source, target):
        target.scenes = list(source.scenes)
        target.actions = list(source.actions)
    bpy.context.window.scene = target.scenes[0]
    bpy.data.scenes.remove(placeholder)

    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.name = obj.name
    (material,) = bpy.data.materials
    material.name = "Stone"
    (image,) = bpy.data.images
    image.name = "StoneStriker-BaseColor"
    image.filepath_raw = "//StoneStriker-BaseColor.jpg"

    rig = bpy.data.objects["StoneResonatorRig"]
    rig.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(1)


# ---------------------------------------------------------------- samples

SAMPLES = [
    dict(
        name="crate",
        description="Static prop: beveled 1 m wooden crate with metal bands. One mesh, two materials, "
                    "no textures, hard edges from smooth-by-angle normals.",
        export=dict(UNITY_EXPORT),
    ),
    dict(
        name="stone-striker",
        description="Game character: the Stone Striker from Iza. Three skinned LODs on a 62-bone rig, a 2048x2048 "
                    "base-color texture embedded in the FBX, and 13 clips at 60 fps.",
        export=dict(UNITY_EXPORT, use_armature_deform_only=False, path_mode="COPY", embed_textures=True,
                    bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
                    bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True, bake_anim_step=1.0,
                    bake_anim_simplify_factor=0.0),
    ),
    dict(
        name="pebble-golem",
        description="Rigged creature: one fused stone mesh, 27 deform bones with fingers and thumbs on both "
                    "hands, automatic weights, four clips baked with a key on every frame.",
        export=golem_export_settings(0.0),
        gallery=False,
    ),
    dict(
        name="pebble-golem-sparse",
        description="The pebble golem exported with key simplification, so curves have sparse, "
                    "irregularly spaced keys.",
        export=golem_export_settings(1.0),
        gallery=False,
    ),
    dict(
        name="blob",
        description="Shape keys: one mesh with Squash and Blink shape keys and one 30-frame clip that "
                    "animates them.",
        export=dict(UNITY_EXPORT, bake_anim=True, bake_anim_use_all_bones=True,
                    bake_anim_use_nla_strips=False, bake_anim_use_all_actions=False,
                    bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=0.0),
    ),
    dict(
        name="textured-rock",
        description="Embedded texture: a rock with a 512x512 PNG base-color texture baked from procedural "
                    "noise and embedded in the FBX.",
        export=dict(UNITY_EXPORT, path_mode="COPY", embed_textures=True),
    ),
    dict(
        name="beetle",
        description="Legs and rig of the modular beetle: one skinned mesh, 13 bones, a 30-frame walk.",
        export=beetle_export_settings({"ARMATURE", "MESH"}),
    ),
    dict(
        name="beetle-shells",
        description="Two alternative beetle shells, unrigged, modelled in the rest pose over the Body bone.",
        export=dict(UNITY_EXPORT, object_types={"MESH"}),
    ),
    dict(
        name="beetle-turn",
        description="Animation only: the beetle's armature with one 40-frame turn and no mesh.",
        export=beetle_export_settings({"ARMATURE"}),
    ),
    dict(
        name="rock-lods",
        description="LODs: a rock in three levels named Rock_LOD0 to Rock_LOD2, a pebble beside it without LODs, "
                    "and a convex collision box, UCX_Rock.",
        export=dict(UNITY_EXPORT, object_types={"MESH"}),
    ),
    dict(
        name="zup-centimeters",
        description="Axis and unit conversion: a 15 cm mushroom exported with Z up and centimeter units "
                    "(vertex positions are in centimeters, UnitScaleFactor 1).",
        export=dict(axis_forward="Y", axis_up="Z", apply_unit_scale=True,
                    apply_scale_options="FBX_SCALE_NONE", global_scale=1.0),
    ),
]


def build(name, texture_dir):
    if name == "crate":
        build_crate()
    elif name == "stone-striker":
        build_stone_striker()
    elif name in ("pebble-golem", "pebble-golem-sparse"):
        build_golem()
    elif name == "blob":
        build_blob()
    elif name == "textured-rock":
        build_textured_rock(texture_dir)
    elif name == "beetle":
        build_beetle(True, ("Walk", 30, pose_beetle_walk))
    elif name == "beetle-shells":
        build_beetle_shells()
    elif name == "beetle-turn":
        build_beetle(False, ("Turn", 40, pose_beetle_turn))
    elif name == "rock-lods":
        build_rock_lods()
    elif name == "zup-centimeters":
        build_mushroom()
    else:
        raise ValueError(name)


# ---------------------------------------------------------------- measurement

def fbx_name(raw):
    return raw.split(b"\x00\x01")[0].decode("utf-8")


def fbx_property_last_values(elem):
    """Map each Properties70 entry name to its last component only (enough for scalar settings)."""
    props = {}
    for child in elem.elems:
        if child.id == b"Properties70":
            for p in child.elems:
                props[p.props[0].decode()] = p.props[-1] if len(p.props) > 4 else None
    return props


def child(elem, elem_id):
    for c in elem.elems:
        if c.id == elem_id:
            return c
    return None


def measure_raw_fbx(path):
    from io_scene_fbx import parse_fbx

    root, version = parse_fbx.parse(path)
    settings = fbx_property_last_values(child(root, b"GlobalSettings"))
    objects = child(root, b"Objects")
    by_id = {}
    for elem in objects.elems:
        by_id[elem.props[0]] = elem
    parents = {}
    for conn in child(root, b"Connections").elems:
        parents.setdefault(conn.props[1], []).append(conn.props[2])

    def owner(elem_id, kind):
        for parent_id in parents.get(elem_id, ()):
            parent = by_id.get(parent_id)
            if parent is not None and parent.id == kind:
                return parent_id
        return None

    fps = settings.get("CustomFrameRate")
    ticks_per_frame = FBX_TICKS_PER_SECOND / fps
    stacks = {}
    for elem in objects.elems:
        if elem.id == b"AnimationStack":
            props = fbx_property_last_values(elem)
            stacks[elem.props[0]] = dict(name=fbx_name(elem.props[1]), start=props.get("LocalStart", 0),
                                         stop=props.get("LocalStop", 0), curves=[])
    for elem in objects.elems:
        if elem.id != b"AnimationCurve":
            continue
        node = owner(elem.props[0], b"AnimationCurveNode")
        layer = owner(node, b"AnimationLayer") if node else None
        stack = owner(layer, b"AnimationStack") if layer else None
        if stack is None:
            continue
        times = list(child(elem, b"KeyTime").props[0])
        stacks[stack]["curves"].append(times)

    takes = []
    takes_elem = child(root, b"Takes")
    take_times = {}
    if takes_elem is not None:
        for take in takes_elem.elems:
            if take.id == b"Take":
                local = child(take, b"LocalTime").props
                take_times[take.props[0].decode()] = (local[0], local[1])
    for stack in stacks.values():
        start_ticks, stop_ticks = take_times.get(stack["name"], (stack["start"], stack["stop"]))
        frame_start = round(start_ticks / ticks_per_frame)
        frame_end = round(stop_ticks / ticks_per_frame)
        expected_frames = list(range(frame_start, frame_end + 1))
        counts = []
        union = set()
        max_tick_offset = 0
        every_frame = bool(stack["curves"])
        for times in stack["curves"]:
            frames = [round(t / ticks_per_frame) for t in times]
            union |= set(frames)
            counts.append(len(times))
            for t, frame in zip(times, frames):
                max_tick_offset = max(max_tick_offset, abs(t - round(frame * ticks_per_frame)))
            if frames != expected_frames:
                every_frame = False
        takes.append(dict(
            take_name=stack["name"],
            in_takes_section=stack["name"] in take_times,
            frame_start=frame_start,
            frame_end=frame_end,
            duration_seconds=round((stop_ticks - start_ticks) / FBX_TICKS_PER_SECOND, 6),
            keys_on_every_frame=every_frame,
            curve_count=len(counts),
            total_keys=sum(counts),
            keys_per_curve_min=min(counts) if counts else 0,
            keys_per_curve_max=max(counts) if counts else 0,
            keyed_frames_union=len(union),
            max_key_offset_ticks=max_tick_offset,
        ))

    limb_nodes = [fbx_name(e.props[1]) for e in objects.elems
                  if e.id == b"Model" and e.props[2] == b"LimbNode"]
    videos = []
    for e in objects.elems:
        if e.id == b"Video":
            content = child(e, b"Content")
            rel = child(e, b"RelativeFilename")
            videos.append(dict(name=fbx_name(e.props[1]),
                               relative_filename=rel.props[0].decode() if rel else None,
                               embedded_bytes=len(content.props[0]) if content and content.props else 0))

    axis_names = {0: "X", 1: "Y", 2: "Z"}

    def axis(key):
        return ("+" if settings[key + "Sign"] > 0 else "-") + axis_names[settings[key]]

    return dict(
        fbx_version=version,
        global_settings=dict(
            up_axis=axis("UpAxis"),
            front_axis=axis("FrontAxis"),
            coord_axis=axis("CoordAxis"),
            unit_scale_factor=settings["UnitScaleFactor"],
            original_unit_scale_factor=settings["OriginalUnitScaleFactor"],
            time_mode=settings["TimeMode"],
            custom_frame_rate=fps,
        ),
        takes=takes,
        limb_nodes=limb_nodes,
        videos=videos,
    )


def to_y_up(v):
    return (v.x, v.z, -v.y)


def measure_blender_import(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    scene = bpy.context.scene
    for obj in scene.objects:
        if obj.type == "ARMATURE":
            obj.data.pose_position = "REST"
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    meshes, armatures = [], []
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in sorted(scene.objects, key=lambda o: o.name):
        if obj.type == "MESH":
            me = obj.data
            shape_keys = [k.name for k in me.shape_keys.key_blocks][1:] if me.shape_keys else []
            meshes.append(dict(
                name=obj.name,
                control_points=len(me.vertices),
                polygons=len(me.polygons),
                triangles=sum(len(p.vertices) - 2 for p in me.polygons),
                materials=[m.name for m in me.materials if m],
                uv_sets=[uv.name for uv in me.uv_layers],
                has_uvs=len(me.uv_layers) > 0,
                shape_keys=shape_keys,
                skinned=any(m.type == "ARMATURE" for m in obj.modifiers),
            ))
            evaluated = obj.evaluated_get(depsgraph)
            for v in evaluated.to_mesh().vertices:
                world = Vector(to_y_up(evaluated.matrix_world @ v.co))
                lo = Vector(map(min, lo, world))
                hi = Vector(map(max, hi, world))
            evaluated.to_mesh_clear()
        elif obj.type == "ARMATURE":
            bones = obj.data.bones
            armatures.append(dict(
                name=obj.name,
                bone_count=len(bones),
                bone_names=[b.name for b in bones],
                root_bones=[b.name for b in bones if b.parent is None],
            ))
    images = [dict(name=img.name, size=list(img.size), packed=img.packed_file is not None)
              for img in bpy.data.images if img.type == "IMAGE"]
    return dict(
        meshes=meshes,
        armatures=armatures,
        actions=sorted(a.name for a in bpy.data.actions),
        images=images,
        bounds_min=[round(c, 4) + 0.0 for c in lo] if meshes else [0.0, 0.0, 0.0],
        bounds_max=[round(c, 4) + 0.0 for c in hi] if meshes else [0.0, 0.0, 0.0],
    )


def describe(sample):
    path = os.path.join(OUT_DIR, sample["name"] + ".fbx")
    raw = measure_raw_fbx(path)
    imported = measure_blender_import(path)
    if imported["armatures"]:
        bones = imported["armatures"][0]["bone_names"]
        if sorted(bones) != sorted(raw["limb_nodes"]):
            raise RuntimeError("%s: imported bones differ from FBX LimbNodes" % sample["name"])
    export = export_settings(sample)
    export["object_types"] = sorted(export["object_types"])
    entry = dict(file=sample["name"] + ".fbx", description=sample["description"])
    if "gallery" in sample:
        entry["gallery"] = sample["gallery"]
    entry.update(
        size_bytes=os.path.getsize(path),
        export_settings=export,
        fbx_version=raw["fbx_version"],
        axes=dict(up=raw["global_settings"]["up_axis"], front=raw["global_settings"]["front_axis"],
                  coord=raw["global_settings"]["coord_axis"]),
        units=dict(unit_scale_factor=raw["global_settings"]["unit_scale_factor"],
                   original_unit_scale_factor=raw["global_settings"]["original_unit_scale_factor"],
                   meters_per_file_unit=raw["global_settings"]["unit_scale_factor"] / 100.0),
        fps=raw["global_settings"]["custom_frame_rate"],
        fbx_time_mode=raw["global_settings"]["time_mode"],
        meshes=imported["meshes"],
        armature=None,
        clips=raw["takes"],
        blender_import_action_names=imported["actions"],
        textures=[dict(v, blender_image=next((i for i in imported["images"] if i["name"] == v["name"]), None))
                  for v in raw["videos"]],
        rest_bounds_m=dict(frame="Y-up, right-handed, meters, after unit conversion",
                           min=imported["bounds_min"], max=imported["bounds_max"]),
    )
    if imported["armatures"]:
        a = imported["armatures"][0]
        entry["armature"] = dict(name=a["name"], bone_count=a["bone_count"], bone_names=a["bone_names"],
                                 root_bone=a["root_bones"][0] if len(a["root_bones"]) == 1 else a["root_bones"])
    return entry


# ---------------------------------------------------------------- main

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only, export, manifest = None, True, True
    i = 0
    while i < len(argv):
        if argv[i] == "--only":
            if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
                raise SystemExit("--only needs a comma-separated list of sample names")
            only = set(argv[i + 1].split(","))
            unknown = only - {s["name"] for s in SAMPLES}
            if unknown:
                raise SystemExit("Unknown sample names: %s" % ", ".join(sorted(unknown)))
            i += 1
        elif argv[i] == "--no-export":
            export = False
        elif argv[i] == "--no-manifest":
            manifest = False
        else:
            raise SystemExit("Unknown argument: %s" % argv[i])
        i += 1
    return only, export, manifest


def main():
    only, do_export, do_manifest = parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    selected = [s for s in SAMPLES if only is None or s["name"] in only]
    if do_export:
        with tempfile.TemporaryDirectory() as texture_dir:
            for sample in selected:
                print("Building %s" % sample["name"])
                build(sample["name"], texture_dir)
                export_fbx(os.path.join(OUT_DIR, sample["name"] + ".fbx"), export_settings(sample))
    if do_manifest:
        entries = [describe(s) for s in SAMPLES]
        manifest = dict(
            generator="tools/samples/generate.py",
            license="CC0-1.0",
            notes=[
                "All facts are measured from the exported files, by parsing the FBX and by re-importing "
                "it in Blender with default import settings.",
                "Mesh control_points is Blender's vertex count after import. triangles counts each "
                "polygon as (corners - 2).",
                "shape_keys omits the Basis key that Blender's importer adds.",
                "A clip spanning frames 0..N has N+1 sampled frames and lasts N / fps seconds. "
                "Looping clips repeat frame 0 at frame N.",
                "clips[].curve_count counts every AnimationCurve in the take: 9 per animated object or bone "
                "(including the armature or mesh object's own transform) and 2 per shape key, because the "
                "exporter writes each shape-key curve twice. total_keys sums keys over all of them.",
                "keys_on_every_frame means each curve has exactly one key per frame from frame_start to "
                "frame_end. Key times may sit up to max_key_offset_ticks FBX ticks before the exact frame time, "
                "because the exporter truncates float times to integer ticks.",
                "axes are the GlobalSettings UpAxis, FrontAxis and CoordAxis values as written by the exporter.",
                "rest_bounds_m is measured in a Y-up frame after unit conversion; the models face +Z there.",
            ],
            files=entries,
            compositions=[BEETLE_SET],
        )
        with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2, sort_keys=False)
            fh.write("\n")
    print("Done")


main()
