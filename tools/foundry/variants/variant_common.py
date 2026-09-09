"""variant_common.py — Fleet Breadth Foundry LANE F shared helpers (Blender-side).

Shared by build_span_variants.py, build_rig_variants.py, build_cannon_variants.py,
and check_variants.py. Runs inside Blender (``bpy``). Holds the four Lane-D
``KitMat_*`` materials (defined EXACTLY per brief-D so a later merge-dedup keeps
one copy), deterministic seeded macro-geometry primitives, import/export helpers,
and the per-faction treatment registry consumed by the check gate.

Method: MACRO-first per FACTION_SURFACE_LANGUAGE.md. Forms sized in bible metres
(SCN plates 1.2-2.4 m, MTS clamshells 2.5-5 m, DMC plates 0.6-1.4 m, Reach scrap
0.4-2.0 m, etc.). The dorsal is what the player sees at 60-150 px, so additions
are placed by raycast onto the donor's dorsal surface. Identity is carried by
CONSTRUCTION LANGUAGE (clamshell vs rivet-dot-grid vs weld-rope) + emissive
PLACEMENT PATTERN, not by paint — KitMat_Paint is neutral, runtime tint supplies
hue (bible tint-contract).

Determinism: every build is a pure function of (faction, seed, donor bbox +
raycast surface). All jitter comes from ``random.Random(seed)``; no wall-clock,
no uuid, no set-iteration. check_variants builds twice and compares VAR_ vertex
hashes.
"""
from __future__ import annotations

import math
import os
import random

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
WHOLESHIPS = os.path.join(ROOT, "assets", "ships", "parts", "wholeships")
WEAPONS = os.path.join(ROOT, "assets", "ships", "parts", "weapons")
VARIANTS_DIR = os.path.join(ROOT, "assets", "ships", "foundry",
                            "fleet_breadth_20260720", "variants")
MANIFEST_PATH = os.path.join(VARIANTS_DIR, "variants_manifest.json")

DONORS = {
    "helios_span":         os.path.join(WHOLESHIPS, "helios_span.glb"),
    "ashline_rig":         os.path.join(WHOLESHIPS, "ashline_rig.glb"),
    "weapon_pulse_cannon": os.path.join(WEAPONS,    "weapon_pulse_cannon.glb"),
}

# ---------------------------------------------------------------------------
# KitMat_* — EXACT values from briefs/brief-D-kitgen.md. Names + values must
# match Lane-D so a later merge-dedup keeps a single copy. metal/rough per brief;
# paint+rubber+emissive are dielectric (metal 0). KitMat_Emissive default color
# is neutral pale cyan; faction hue is applied at runtime (never baked).
# ---------------------------------------------------------------------------
KITMATS = {
    "KitMat_Steel":    {"base": (0.42, 0.43, 0.45), "rough": 0.55, "metal": 1.0},
    "KitMat_Paint":    {"base": (0.24, 0.25, 0.26), "rough": 0.45, "metal": 0.0},
    "KitMat_Rubber":   {"base": (0.06, 0.06, 0.07), "rough": 0.90, "metal": 0.0},
    "KitMat_Emissive": {"base": (0.02, 0.02, 0.02), "rough": 0.50, "metal": 0.0,
                        "emission": (0.604, 0.863, 1.0), "emissionStrength": 1.0},
}


def ensure_kitmat(name):
    """Idempotent: return the KitMat, creating it once with exact values."""
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


def all_empties():
    return [o for o in bpy.data.objects if o.type == "EMPTY"]


def mesh_bbox(objs):
    """World-space min/max/center/dims over the given mesh objects."""
    mn = Vector((1e18, 1e18, 1e18))
    mx = Vector((-1e18, -1e18, -1e18))
    found = False
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
            found = True
    if not found:
        return None, None, None, None
    return mn, mx, (mn + mx) / 2, (mx - mn)


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export_all_glb(filepath):
    """Export everything in the scene (donor + additions). ``export_tangents=True``
    preserves the donor's TANGENT attributes (whole-ship donors ship them for
    normal mapping); without it Blender drops them."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format="GLB", export_yup=True,
        export_apply=True, export_tangents=True,
    )


# ---------------------------------------------------------------------------
# Surface query: dorsal top Z by downward raycast onto the donor hull.
# ---------------------------------------------------------------------------
def make_surface_fn(default_z, origin_offset=(0.0, 0.0, 40.0)):
    """Return f(x,y) -> dorsal top Z by casting a -Z ray onto the donor hull.

    IMPORTANT: skips any object whose name starts with ``VAR_`` so that
    additions placed earlier in the same build do not shadow the donor dorsal
    for placement queries later in the build (otherwise a clamshell added at
    mid-build would shift every subsequent surf() call onto its top, producing
    runaway Z stacking). Iterates up to 20 hits to skip stacked VAR_* geometry.
    Caller must invoke BEFORE adding variant geometry for efficiency, but the
    skip logic makes the result order-independent.
    """
    origin_z = origin_offset[2]

    def f(x, y):
        deps = bpy.context.evaluated_depsgraph_get()
        ray_origin = Vector((x, y, origin_z))
        ray_dir = Vector((0, 0, -1))
        for _ in range(20):
            hit, loc, _n, _i, hit_obj, _m = bpy.context.scene.ray_cast(
                deps, ray_origin, ray_dir)
            if not hit:
                return default_z
            if hit_obj is None or not hit_obj.name.startswith("VAR_"):
                return loc.z
            # Skip past this VAR_* hit and continue downward.
            ray_origin = loc + ray_dir * 0.001
        return default_z
    return f


def place_z(surf_z, half_h, embed=0.15):
    """Center Z so a form of half-height ``half_h`` embeds ``embed`` into the
    hull and sits proud above it."""
    return surf_z - embed + half_h


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
    """Box with a real edge bevel, optional yaw about its own centre. Metres."""
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
    """Soft product-radius shell (MTS clamshell): box with a large multi-segment
    bevel so silhouette edges are rounded, not machined."""
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
    """Conformal blister / small cap. Squashed icosphere; lower half embeds into
    the host so it reads as a blister, not a ball. subdiv=0 -> 20 tris, subdiv=1
    -> 80 tris, subdiv=2 -> 320 tris. Use subdiv=0 or 1 for fasteners/lamps,
    subdiv=2 only for hero blisters."""
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


def flat_disk(name, center, radius, height, mat, segments=8):
    """Cheap cylindrical proxy for recessed fasteners / rivet heads / lamp caps.
    segments=8 -> 8 side tris + 2 cap quads (16 tris total). Use this for any
    detail that's a TOKEN of a fastener, not a hero feature."""
    bm = bmesh.new()
    seg = max(3, int(segments))
    half = height * 0.5
    c = Vector(center)
    ring_top = []
    ring_bot = []
    for i in range(seg):
        a = (i / seg) * math.tau
        x = math.cos(a) * radius
        y = math.sin(a) * radius
        ring_top.append(bm.verts.new((c.x + x, c.y + y, c.z + half)))
        ring_bot.append(bm.verts.new((c.x + x, c.y + y, c.z - half)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([ring_bot[i], ring_bot[j], ring_top[j], ring_top[i]])
    bm.faces.new(list(reversed(ring_top)))
    bm.faces.new(ring_bot)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(bm, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def tube(name, p0, p1, radius, mat, segments=10):
    """Conduit / gantry tube between two points."""
    p0 = Vector(p0)
    p1 = Vector(p1)
    axis = p1 - p0
    length = axis.length
    if length < 1e-6:
        length = 1e-6
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                          radius1=radius, radius2=radius, depth=length)
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


def torus_ring(name, center, major_r, minor_r, mat, segments_major=16,
               segments_minor=6):
    """Full torus (collar, muzzle ring,etc). Lying in XY plane (axis = Z)."""
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, radius=major_r, segments=segments_major)
    # We need a torus; build via edge-loop spin around one of the major-ring edges.
    # Simpler: use bmesh.ops.spin on a minor circle placed at a major-ring vertex.
    bm2 = bmesh.new()
    # minor circle in the XZ plane at (major_r, 0, 0)
    for i in range(segments_minor):
        a = (i / segments_minor) * math.tau
        bm2.verts.new((major_r + math.cos(a) * minor_r, 0.0, math.sin(a) * minor_r))
    bm2.verts.ensure_lookup_table()
    for i in range(segments_minor):
        j = (i + 1) % segments_minor
        bm2.edges.new((bm2.verts[i], bm2.verts[j]))
    geom = list(bm2.edges) + list(bm2.verts)
    bmesh.ops.spin(bm2, geom=geom, cent=(0, 0, 0), axis=(0, 0, 1),
                   steps=segments_major, angle=math.tau, use_duplicate=False)
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    for v in bm2.verts:
        v.co += Vector(center)
    obj = _finish(bm2, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


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


# ---------------------------------------------------------------------------
# Zone-coverage reporting: slice donor X-range into fore/mid/aft thirds and
# compute the fraction of added-geometry bbox-volume in each third. The brief
# asks the check to "report added-geometry bbox coverage per hull region" so
# the lead can verify a treatment actually covers the intended zones.
# ---------------------------------------------------------------------------
def zone_thirds(donor_mn_x, donor_mx_x):
    span = donor_mx_x - donor_mn_x
    x_third = span / 3.0
    return {
        "aft": (donor_mn_x, donor_mn_x + x_third),
        "mid": (donor_mn_x + x_third, donor_mx_x - x_third),
        "fore": (donor_mx_x - x_third, donor_mx_x),
    }


def zone_coverage(added_objs, donor_mn_x, donor_mx_x):
    """For each X-third, sum the (approximate) bbox volume of added objects
    whose CENTROID lies in that third. Returns fractions + raw counts + the
    list of object names per zone."""
    thirds = zone_thirds(donor_mn_x, donor_mx_x)
    out = {}
    for label, (lo, hi) in thirds.items():
        out[label] = {"count": 0, "volume": 0.0, "objects": []}
    for o in added_objs:
        mw = o.matrix_world
        verts = [mw @ v.co for v in o.data.vertices]
        if not verts:
            continue
        cx = sum(v.x for v in verts) / len(verts)
        xs = [v.x for v in verts]
        ys = [v.y for v in verts]
        zs = [v.z for v in verts]
        vol = max(1e-9, (max(xs) - min(xs)) * (max(ys) - min(ys)) * (max(zs) - min(zs)))
        for label, (lo, hi) in thirds.items():
            if lo <= cx <= hi:
                out[label]["count"] += 1
                out[label]["volume"] += vol
                out[label]["objects"].append(o.name)
                break
    total_vol = sum(d["volume"] for d in out.values()) or 1.0
    for d in out.values():
        d["fraction"] = d["volume"] / total_vol
    return out


# ---------------------------------------------------------------------------
# Common build helper: import donor, snapshot facts the check needs.
# ---------------------------------------------------------------------------
def import_donor_facts(donor_path):
    """Import a donor GLB and snapshot the facts check_variants compares against
    (empties with world matrices, mesh names, materials, bbox, tris)."""
    reset_scene()
    import_glb(donor_path)
    bpy.context.view_layer.update()
    meshes = all_meshes()
    mn, mx, _, dims = mesh_bbox(meshes)
    facts = {
        "empties": {o.name: o.matrix_world.copy() for o in all_empties()},
        "mesh_names": {o.name for o in meshes},
        "materials": {m.name for o in meshes for m in o.data.materials if m},
        "tris": sum(object_tris(o) for o in meshes),
        "bbox_min": mn,
        "bbox_max": mx,
        "bbox_dims": dims,
        "xlen": dims.x,
        "ylen": dims.y,
        "zlen": dims.z,
        # nose X = max empty X (preserves +X forward, no mirror)
        "nose_x": max((o.matrix_world.to_translation().x for o in all_empties()),
                      default=0.0),
    }
    return facts
