"""Fleet Breadth Foundry — HERO variant lane shared helpers (Blender-side).

Shared by build_wasp_kits.py, build_tradehub_overlays.py, check_hero.py. Runs
inside Blender (`bpy`). Holds the four Lane-D `KitMat_*` materials (defined EXACTLY
per briefs/brief-D-kitgen.md so a later merge-dedup keeps one copy), deterministic
seeded macro-geometry primitives, and import/export helpers.

Method: MACRO-first — plates, fairings, gantries, masts, silhouette-level forms.
The game camera is 60 deg tilt at ~72 wu; features under ~0.15 m vanish, so primary
forms are sized in bible metres (SCN plates 1.2-2.4 m, MTS clamshells 2.5-5 m). A
later kit-detail pass bolts on rivet/fastener strips; we leave clean attachment
zones and record them per variant.

Determinism: all jitter comes from `random.Random(seed)`; no wall-clock, no set
iteration, transforms applied before export.
"""
from __future__ import annotations

import math
import random

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------------------
# KitMat_* — EXACT values from briefs/brief-D-kitgen.md (names + values must match
# so a later merge-dedup keeps a single copy). metal/rough per brief; paint+rubber
# are dielectric (metal 0).
# ---------------------------------------------------------------------------
KITMATS = {
    "KitMat_Steel":    {"base": (0.42, 0.43, 0.45), "rough": 0.55, "metal": 1.0},
    "KitMat_Paint":    {"base": (0.24, 0.25, 0.26), "rough": 0.45, "metal": 0.0},
    "KitMat_Rubber":   {"base": (0.06, 0.06, 0.07), "rough": 0.90, "metal": 0.0},
    "KitMat_Emissive": {"base": (0.02, 0.02, 0.02), "rough": 0.50, "metal": 0.0,
                        "emission": (0.604, 0.863, 1.0), "emissionStrength": 1.0},  # default #9adcff
}


def ensure_kitmat(name):
    """Idempotent: return the KitMat, creating it once with exact values (no .001)."""
    spec = KITMATS[name]
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*spec["base"], 1.0)
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    if "emission" in spec:
        bsdf.inputs["Emission Color"].default_value = (*spec["emission"], 1.0)
        bsdf.inputs["Emission Strength"].default_value = spec["emissionStrength"]
    else:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def ensure_all_kitmats():
    return {name: ensure_kitmat(name) for name in KITMATS}


def rng(seed):
    return random.Random(seed)


# ---------------------------------------------------------------------------
# Scene / import / export
# ---------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()


def all_meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def mesh_bbox(objs):
    """World-space min/max/center/dims over the given mesh objects (Blender frame)."""
    mn = Vector((1e18, 1e18, 1e18))
    mx = Vector((-1e18, -1e18, -1e18))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx, (mn + mx) / 2, (mx - mn)


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def assign_material(obj, mat):
    """Replace all slots with exactly one material (guards Blender's auto-default)."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export_selection_glb(filepath, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format="GLB", export_yup=True,
        export_apply=True, use_selection=True, export_tangents=True,
    )


def export_all_glb(filepath):
    # export_tangents=True preserves the donor's TANGENT attributes (whole-ship
    # donors ship them for normal mapping); without it Blender drops them.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format="GLB", export_yup=True, export_apply=True,
        export_tangents=True,
    )


# ---------------------------------------------------------------------------
# Macro geometry primitives (bmesh; deterministic; transforms applied)
# ---------------------------------------------------------------------------
def _finish(bm, name, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        assign_material(obj, mat)
    return obj


def beveled_box(name, center, size, mat, bevel=0.02, segments=2, rot_z=0.0):
    """Box with a real edge bevel, optional yaw about its own centre. Metres, Blender frame."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel,
                        segments=segments, affect="EDGES", clamp_overlap=True)
    if rot_z:
        c, s = math.cos(rot_z), math.sin(rot_z)
        for v in bm.verts:
            x, y = v.co.x, v.co.y
            v.co.x = x * c - y * s
            v.co.y = x * s + y * c
    for v in bm.verts:
        v.co += Vector(center)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(bm, name, mat)


def rounded_shell(name, center, size, mat, bevel=0.35, segments=4):
    """A soft product-radius shell (MTS clamshell / hub crown): a box with a large
    multi-segment bevel so silhouette edges are rounded, not machined."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    b = min(bevel, 0.49 * min(size))
    bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=b, segments=segments,
                    affect="EDGES", clamp_overlap=True, profile=0.6)
    for v in bm.verts:
        v.co += Vector(center)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(bm, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def dome(name, center, radius, mat, height=None, subdiv=2):
    """A conformal sensor blister / small cap (MTS): squashed icosphere; lower half
    embeds into the host surface so it reads as a blister, not a ball."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    h = radius if height is None else height
    for v in bm.verts:
        v.co.z *= (h / radius)
    for v in bm.verts:
        v.co += Vector(center)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(bm, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def tube(name, p0, p1, radius, mat, segments=10):
    """A conduit / gantry tube between two points (Free conduit, hub gantries)."""
    p0 = Vector(p0)
    p1 = Vector(p1)
    axis = p1 - p0
    length = axis.length
    if length < 1e-6:
        length = 1e-6
    bm = bmesh.new()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                                radius1=radius, radius2=radius, depth=length)
    # cone is built along +Z centered at origin; move to midpoint and orient to axis
    mid = (p0 + p1) / 2
    z = Vector((0, 0, 1))
    axisn = axis.normalized()
    quat = z.rotation_difference(axisn)
    mat_rot = quat.to_matrix().to_4x4()
    for v in bm.verts:
        v.co = (mat_rot @ v.co) + mid
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(bm, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def billboard_frame(name, center, width, height, thick, mat, angle_z=0.0):
    """A hollow rectangular frame standing VERTICAL (Z up), its plane facing the
    radial direction `angle_z` (rotation about Z). Used for MTS holo-ad armatures
    around the station ring. width runs along the horizontal tangent, height along Z."""
    ca, sa = math.cos(angle_z), math.sin(angle_z)

    def rot(x, y):  # rotate a local horizontal offset into world about Z
        return (x * ca - y * sa, x * sa + y * ca)

    hw, hh = width / 2, height / 2
    cx, cy, cz = center
    bars = []
    # top + bottom rails: long along local-X (width), rotated to the tangent
    for zc in (hh, -hh):
        bars.append(beveled_box(f"{name}_h{'t' if zc > 0 else 'b'}",
                    (cx, cy, cz + zc), (width, thick, thick), mat, bevel=0.01, rot_z=angle_z))
    # left + right posts: vertical (along Z), offset +-hw along local-X (rotated)
    for xoff in (hw, -hw):
        ox, oy = rot(xoff, 0.0)
        bars.append(beveled_box(f"{name}_v{'r' if xoff > 0 else 'l'}",
                    (cx + ox, cy + oy, cz), (thick, thick, height), mat, bevel=0.01, rot_z=angle_z))
    return join_objects(name, bars)


def join_objects(name, objs):
    """Join a list of mesh objects into one; returns the joined object."""
    if not objs:
        return None
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


def object_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def vertex_hash(objs, ndigits=5):
    """Deterministic hash of the sorted rounded world-space vertices of objs."""
    import hashlib
    coords = []
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            coords.append((round(w.x, ndigits), round(w.y, ndigits), round(w.z, ndigits)))
    coords.sort()
    h = hashlib.sha256()
    for c in coords:
        h.update(repr(c).encode())
    return h.hexdigest(), len(coords)


def polar(cx, cy, radius, angle_deg):
    a = math.radians(angle_deg)
    return (cx + radius * math.cos(a), cy + radius * math.sin(a))
