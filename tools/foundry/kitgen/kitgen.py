"""kitgen.py — deterministic hard-surface microdetail kit generators (LANE D).

Pure functions: ``build_<family>(variant, seed) -> list[bpy.types.Object]``.
No top-level side effects. All randomness flows through ``random.Random(seed)``.

Public dispatch:
    >>> import kitgen
    >>> objs = kitgen.build("rivet_strip", 1, 0x1234)
"""

from __future__ import annotations

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Euler

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

BEVEL_WIDTH_DEFAULT = 0.006          # m, within the 0.004-0.012 envelope
BEVEL_SEGMENTS = 2
BEVEL_ANGLE_LIMIT = math.radians(35)  # only structural edges catch a bevel

ALLOWED_MATERIALS = ("KitMat_Steel", "KitMat_Paint", "KitMat_Rubber", "KitMat_Emissive")

_MATERIAL_SPECS = {
    "KitMat_Steel": dict(
        base_color=(0.42, 0.43, 0.45, 1.0), roughness=0.55, metallic=1.0,
        emission_color=(0.0, 0.0, 0.0, 1.0), emission_strength=0.0),
    "KitMat_Paint": dict(
        base_color=(0.24, 0.25, 0.26, 1.0), roughness=0.45, metallic=0.0,
        emission_color=(0.0, 0.0, 0.0, 1.0), emission_strength=0.0),
    "KitMat_Rubber": dict(
        base_color=(0.06, 0.06, 0.07, 1.0), roughness=0.90, metallic=0.0,
        emission_color=(0.0, 0.0, 0.0, 1.0), emission_strength=0.0),
    "KitMat_Emissive": dict(
        base_color=(0.05, 0.05, 0.06, 1.0), roughness=0.50, metallic=0.0,
        emission_color=(0x9A / 255.0, 0xDC / 255.0, 0xFF / 255.0, 1.0),
        emission_strength=1.0),
}

# Canonical 14-family roster (checked by validation scripts).
CANONICAL_FAMILIES = (
    "rivet_strip", "fastener_recessed", "rail_split", "bracket_gusset",
    "plate_lip", "weld_seam", "hatch_frame", "access_panel",
    "vent_grid", "pipe_clamp", "armor_spacer", "heat_shield",
    "weapon_collar", "sensor_housing",
)

# --------------------------------------------------------------------------- #
# Family registry
# --------------------------------------------------------------------------- #

FAMILIES: dict[str, dict] = {}


def register_family(name: str, variants: int):
    """Decorator: declare a family with N variants."""
    def deco(fn):
        FAMILIES[name] = {"build": fn, "variants": int(variants)}
        return fn
    return deco


def list_families() -> list[str]:
    return sorted(FAMILIES.keys())


def variant_count(family_name: str) -> int:
    return FAMILIES[family_name]["variants"]


def build(family_name: str, variant: int, seed: int):
    """Public dispatch used by check/export scripts. Returns list[Object]."""
    if family_name not in FAMILIES:
        raise KeyError(f"unknown family {family_name!r}")
    info = FAMILIES[family_name]
    if not (1 <= variant <= info["variants"]):
        raise ValueError(f"{family_name}: variant {variant} out of range (1..{info['variants']})")
    piece_seed = _derive_seed(family_name, variant, seed)
    return info["build"](variant, piece_seed)


def _derive_seed(family_name: str, variant: int, seed: int) -> int:
    """Stable FNV-1a-ish hash over (family, variant, seed)."""
    h = 0x9E3779B97F4A7C15
    for c in family_name.encode("ascii"):
        h ^= c
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    h ^= variant & 0xFFFFFFFFFFFFFFFF
    h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    h ^= seed & 0xFFFFFFFFFFFFFFFF
    h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h & 0x7FFFFFFF


def _rng(seed: int) -> random.Random:
    return random.Random(int(seed) & 0xFFFFFFFF)


# --------------------------------------------------------------------------- #
# Scene / object helpers
# --------------------------------------------------------------------------- #

def clear_scene() -> bpy.types.Collection:
    """Wipe all data-blocks; create a fresh 'KitGen' collection. Returns it."""
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)
    for lt in list(bpy.data.lights):
        bpy.data.lights.remove(lt)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    col = bpy.data.collections.new("KitGen")
    bpy.context.scene.collection.children.link(col)
    return col


def kit_collection() -> bpy.types.Collection:
    return bpy.data.collections.get("KitGen") or bpy.context.scene.collection


def new_object(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    kit_collection().objects.link(obj)
    return obj


def new_empty_object(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    kit_collection().objects.link(obj)
    return obj


def _set_active(obj: bpy.types.Object, mode: str = "OBJECT"):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bpy.context.object.mode != mode:
        bpy.ops.object.mode_set(mode=mode)


def apply_transforms(obj: bpy.types.Object):
    _set_active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join_objects(parts: list[bpy.types.Object], name: str) -> bpy.types.Object:
    """Join parts into one object; the first part becomes the active target."""
    if len(parts) == 1:
        parts[0].name = name
        parts[0].data.name = name + "_mesh"
        return parts[0]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    target = parts[0]
    for p in parts:
        p.select_set(True)
    target.name = name
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.data.name = name + "_mesh"
    return target


def add_bevel(obj: bpy.types.Object, width: float = BEVEL_WIDTH_DEFAULT,
              segments: int = BEVEL_SEGMENTS, angle: float = BEVEL_ANGLE_LIMIT,
              apply: bool = True):
    _set_active(obj)
    mod = obj.modifiers.new("Bevel", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = angle
    mod.miter_outer = 'MITER_ARC'
    mod.use_clamp_overlap = True
    if apply:
        bpy.ops.object.modifier_apply(modifier=mod.name)


def add_weighted_normals(obj: bpy.types.Object, apply: bool = True):
    _set_active(obj)
    mod = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
    mod.weight = 50
    mod.keep_sharp = True
    if apply:
        bpy.ops.object.modifier_apply(modifier=mod.name)


def smart_uv(obj: bpy.types.Object, margin: float = 0.02):
    _set_active(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def shade_smooth_by_angle(obj: bpy.types.Object, angle: float = math.radians(35)):
    _set_active(obj)
    bpy.ops.object.shade_smooth()
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = angle


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #

def ensure_materials():
    """Create / reset the four shared kit materials. Idempotent."""
    for name, spec in _MATERIAL_SPECS.items():
        mat = bpy.data.materials.get(name)
        if mat is None:
            mat = bpy.data.materials.new(name)
        if not mat.use_nodes:
            mat.use_nodes = True
            nt = mat.node_tree
            for n in list(nt.nodes):
                nt.nodes.remove(n)
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.name = "Principled BSDF"
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            out.name = "Material Output"
            nt.links.new(bsdf.outputs[0], out.inputs[0])
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = spec["base_color"]
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        bsdf.inputs["Metallic"].default_value = spec["metallic"]
        bsdf.inputs["Emission Color"].default_value = spec["emission_color"]
        bsdf.inputs["Emission Strength"].default_value = spec["emission_strength"]


def get_material(name: str) -> bpy.types.Material:
    if name not in ALLOWED_MATERIALS:
        raise ValueError(f"material {name!r} not in allowed kit palette")
    ensure_materials()
    return bpy.data.materials[name]


def assign_material(obj: bpy.types.Object, mat_name: str) -> int:
    """Set obj's only material to mat_name. Returns the slot index."""
    get_material(mat_name)
    mat = bpy.data.materials[mat_name]
    # Drop all existing slots then assign one.
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0
    return 0


# --------------------------------------------------------------------------- #
# Geometry primitives (bmesh-based so transforms stay deterministic)
# --------------------------------------------------------------------------- #

def bm_add_box(bm: bmesh.types.BMesh, size: Vector, center: Vector = None,
               matrix: Matrix = None) -> bmesh.types.BMFace:
    """Append an axis-aligned box of given full size. Returns +Z (top) face."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    h = size * 0.5
    if matrix is None:
        matrix = Matrix.Translation(center)
    else:
        matrix = Matrix.Translation(center) @ matrix
    # Index encoding: bit0=±x, bit1=±y, bit2=±z
    verts = [None] * 8
    for sx, ax in ((-1, 0), (1, 1)):
        for sy, ay in ((-1, 0), (1, 1)):
            for sz, az in ((-1, 0), (1, 1)):
                idx = ax * 4 + ay * 2 + az
                v = matrix @ Vector((sx * h.x, sy * h.y, sz * h.z))
                verts[idx] = bm.verts.new(v)
    # Six faces; winding chosen so normals point outward.
    fdef = [
        (0, 2, 3, 1),  # -x
        (4, 5, 7, 6),  # +x
        (0, 1, 5, 4),  # -y
        (2, 6, 7, 3),  # +y
        (0, 4, 6, 2),  # -z
        (1, 3, 7, 5),  # +z
    ]
    top_face = None
    for face in fdef:
        f = bm.faces.new([verts[i] for i in face])
        # +Z face has all verts with bit2 set → indices 1,3,5,7
        if set(face) == {1, 3, 5, 7}:
            top_face = f
    bm.normal_update()
    return top_face


def bm_add_cylinder(bm: bmesh.types.BMesh, radius: float, height: float,
                    segments: int = 16, center: Vector = None,
                    axis: str = "Z", cap: bool = True) -> list:
    """Append a cylinder. ``center`` is the GEOMETRIC center (matches
    ``bm_add_box``). Returns list of cap faces (top, bottom) on axis."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    seg = max(3, int(segments))
    half = height * 0.5
    ring_top = []
    ring_bot = []
    for i in range(seg):
        a = (i / seg) * math.tau
        x = math.cos(a) * radius
        y = math.sin(a) * radius
        if axis == "Z":
            ring_top.append(bm.verts.new((center.x + x, center.y + y, center.z + half)))
            ring_bot.append(bm.verts.new((center.x + x, center.y + y, center.z - half)))
        elif axis == "Y":
            ring_top.append(bm.verts.new((center.x + x, center.y + half, center.z + y)))
            ring_bot.append(bm.verts.new((center.x + x, center.y - half, center.z + y)))
        elif axis == "X":
            ring_top.append(bm.verts.new((center.x + half, center.y + x, center.z + y)))
            ring_bot.append(bm.verts.new((center.x - half, center.y + x, center.z + y)))
    side_faces = []
    for i in range(seg):
        j = (i + 1) % seg
        side_faces.append(bm.faces.new([ring_bot[i], ring_bot[j], ring_top[j], ring_top[i]]))
    caps = []
    if cap:
        caps.append(bm.faces.new(list(reversed(ring_top))))   # top normal pointing +axis
        caps.append(bm.faces.new(ring_bot))                    # bottom normal pointing -axis
    bm.normal_update()
    return caps


def bm_add_dome(bm: bmesh.types.BMesh, radius: float, height: float,
                segments: int = 16, ring_count: int = 4,
                center: Vector = None, axis: str = "Z") -> bmesh.types.BMFace:
    """Append a dome (segmented hemisphere) sitting on the XY plane at center.

    ``ring_count`` rings climb from base toward (but never reaching) the apex,
    so each ring is a real circle. A final single apex vert closes the top.
    Returns the base cap face.
    """
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    seg = max(3, int(segments))
    rings = []

    def make_vert(x, y, z):
        if axis == "Z":
            return bm.verts.new((center.x + x, center.y + y, center.z + z))
        if axis == "Y":
            return bm.verts.new((center.x + x, center.y + z, center.z + y))
        return bm.verts.new((center.x + z, center.y + x, center.z + y))

    for r in range(ring_count):
        # t in (0, 1) exclusive at the top so the top ring keeps a real radius.
        t = (r + 1) / (ring_count + 1)
        rr = radius * math.cos(t * math.pi * 0.5)
        h = height * math.sin(t * math.pi * 0.5)
        ring = []
        for i in range(seg):
            a = (i / seg) * math.tau
            ring.append(make_vert(math.cos(a) * rr, math.sin(a) * rr, h))
        rings.append(ring)
    apex = make_vert(0.0, 0.0, height)
    # Base ring
    base_ring = []
    for i in range(seg):
        a = (i / seg) * math.tau
        base_ring.append(make_vert(math.cos(a) * radius, math.sin(a) * radius, 0.0))
    # Side faces: base → ring[0] → ... → ring[-1] → apex
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([base_ring[i], base_ring[j], rings[0][j], rings[0][i]])
    for r in range(len(rings) - 1):
        a = rings[r]
        b = rings[r + 1]
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new([a[i], a[j], b[j], b[i]])
    top = rings[-1]
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([top[i], top[j], apex])
    base_face = bm.faces.new(list(reversed(base_ring)))
    bm.normal_update()
    return base_face


# --------------------------------------------------------------------------- #
# Finish pipeline
# --------------------------------------------------------------------------- #

def finish(obj: bpy.types.Object, bevel: bool = True, wn: bool = True,
           uv: bool = True, bevel_width: float = None):
    """Standard finish: bevel -> weighted normals -> apply transforms -> UV."""
    if bevel:
        add_bevel(obj, width=bevel_width or BEVEL_WIDTH_DEFAULT)
        obj["kitgen_bevel_applied"] = True
    if wn:
        add_weighted_normals(obj)
    apply_transforms(obj)
    if uv:
        smart_uv(obj)


def _mark_no_bevel(obj: bpy.types.Object) -> bpy.types.Object:
    """Tag an object to skip the auto-bevel step in finish_many.
    Used for curved / already-faceted parts (domes, cylinders) where a 4 mm
    bevel on a 5 mm feature produces degenerate geometry."""
    obj["kitgen_no_bevel"] = True
    return obj


def finish_many(parts: list[bpy.types.Object], name: str,
               mat: str = "KitMat_Steel", bevel: bool = True,
               uv: bool = True, bevel_width: float = None) -> bpy.types.Object:
    """Finish each part (bevel+wn+apply), assign material, then join.

    Bevel width is auto-sized per part: 25% of the part's smallest dimension,
    clamped to [0.004, 0.010]. Parts smaller than 0.012 m on their thinnest
    axis — and any part tagged via ``_mark_no_bevel`` — skip the bevel.
    """
    for p in parts:
        smallest = max(1e-6, min(p.dimensions))
        # Skip bevel on curved / already-faceted parts (domes, cylinders, hex
        # prisms): they have many small faces relative to a box, and bevels on
        # their thin features produce degenerate geometry. Cylinders with 8
        # segments already have 10 polygons (8 sides + 2 caps); hex prisms
        # have 8 (6 sides + 2 caps). Both >= 8 catches them while leaving
        # plain boxes (6 polys) and triangular prisms (5 polys) bevel-eligible.
        is_curved = len(p.data.polygons) >= 8
        skip = bool(p.get("kitgen_no_bevel", False)) or is_curved
        bevel_here = False
        # Auto-size bevel width to 25% of smallest dim, clamped to the brief's
        # 0.004-0.012 m envelope. Only bevel when smallest dim >= 2× bevel
        # width so adjacent bevels never overlap (float-tolerant).
        w = max(0.004, min(0.010, smallest * 0.25))
        if bevel and not skip and smallest >= (w * 2.0 - 1e-4):
            add_bevel(p, width=w)
            bevel_here = True
        add_weighted_normals(p)
        apply_transforms(p)
        assign_material(p, mat)
        if bevel_here:
            p["kitgen_bevel_applied"] = True
    # Snapshot the bevel-evidence flag BEFORE join_objects deletes the parts.
    any_bevel = any(p.get("kitgen_bevel_applied", False) for p in parts)
    obj = join_objects(parts, name)
    if any_bevel:
        obj["kitgen_bevel_applied"] = True
    if uv:
        mesh = obj.data
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
        smart_uv(obj)
    return obj


# --------------------------------------------------------------------------- #
# Families — each builder returns list[Object]. Imported below.
# --------------------------------------------------------------------------- #

# === FAMILY 1: rivet_strip ================================================= #

@register_family("rivet_strip", variants=5)
def build_rivet_strip(variant: int, seed: int):
    """Plates joined by rivets. +X along the strip, +Z out of surface."""
    r = _rng(seed)
    length = round(r.uniform(0.4, 1.2), 4)
    width = round(r.uniform(0.05, 0.09), 4)
    plate_thickness = 0.020

    if variant == 1:
        return _rivet_strip_dome_single(length, width, plate_thickness, r)
    elif variant == 2:
        return _rivet_strip_flush_countersunk(length, width, plate_thickness, r)
    elif variant == 3:
        return _rivet_strip_staggered_double(length, width, plate_thickness, r)
    elif variant == 4:
        return _rivet_strip_oval_washers(length, width, plate_thickness, r)
    elif variant == 5:
        return _rivet_strip_double_run_heavy(length, width, plate_thickness, r)
    raise ValueError(f"rivet_strip: bad variant {variant}")


def _rivet_strip_plate(length: float, width: float, thickness: float) -> bpy.types.Object:
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, thickness)),
               center=Vector((0.0, 0.0, thickness * 0.5)))
    obj = new_object("KIT_RIVET_STRIP_plate", bm)
    return obj


def _rivet_strip_dome_single(length, width, thickness, r) -> list:
    plate = _rivet_strip_plate(length, width, thickness)
    head_radius = round(r.uniform(0.020, 0.028), 4)
    head_height = head_radius * 0.55
    pitch = round(r.uniform(0.12, 0.18), 4)
    parts = [plate]
    n = max(2, int(length / pitch) - 1)
    n = min(n, 6)
    actual_pitch = length / (n + 1)
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_dome(bm, head_radius, head_height, segments=10, ring_count=2,
                    center=Vector((x, 0.0, thickness)))
        rivet = new_object(f"KIT_RIVET_STRIP_rivet_{i:02d}", bm)
        parts.append(rivet)
    obj = finish_many(parts, "KIT_RIVET_STRIP_V01", mat="KitMat_Steel")
    return [obj]


def _rivet_strip_flush_countersunk(length, width, thickness, r) -> list:
    """Flush countersunk rivets — flat cone recessed into plate."""
    head_radius = round(r.uniform(0.022, 0.030), 4)
    pitch = round(r.uniform(0.12, 0.18), 4)
    n = max(2, int(length / pitch) - 1)
    n = min(n, 6)
    actual_pitch = length / (n + 1)
    plate = _rivet_strip_plate(length, width, thickness)
    parts = [plate]
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_cylinder(bm, head_radius, 0.004, segments=10,
                        center=Vector((x, 0.0, thickness)))
        bm_add_cylinder(bm, head_radius * 0.35, 0.002, segments=8,
                        center=Vector((x, 0.0, thickness + 0.004)))
        rivet = new_object(f"KIT_RIVET_STRIP_rivet_{i:02d}", bm)
        parts.append(rivet)
    obj = finish_many(parts, "KIT_RIVET_STRIP_V02", mat="KitMat_Steel")
    return [obj]


def _rivet_strip_staggered_double(length, width, thickness, r) -> list:
    head_radius = round(r.uniform(0.016, 0.022), 4)
    head_height = head_radius * 0.5
    pitch = round(r.uniform(0.12, 0.18), 4)
    n_per_row = max(2, int(length / pitch) - 1)
    n_per_row = min(n_per_row, 5)
    actual_pitch = length / (n_per_row + 1)
    plate = _rivet_strip_plate(length, width, thickness)
    parts = [plate]
    y_off = width * 0.22
    for i in range(n_per_row):
        x = -length * 0.5 + actual_pitch * (i + 1)
        for j, sy in enumerate((-1, 1)):
            xx = x + (sy * actual_pitch * 0.25)
            bm = bmesh.new()
            bm_add_dome(bm, head_radius, head_height, segments=8, ring_count=2,
                        center=Vector((xx, sy * y_off, thickness)))
            parts.append(new_object(f"KIT_RIVET_STRIP_rivet_{i:02d}_{j}", bm))
    obj = finish_many(parts, "KIT_RIVET_STRIP_V03", mat="KitMat_Steel")
    return [obj]


def _rivet_strip_oval_washers(length, width, thickness, r) -> list:
    """Oval-head rivets through small washer plates — heavy-duty seam."""
    head_radius_major = round(r.uniform(0.024, 0.030), 4)
    head_radius_minor = head_radius_major * 0.55
    head_height = head_radius_minor * 0.7
    pitch = round(r.uniform(0.16, 0.22), 4)
    n = max(2, int(length / pitch))
    n = min(n, 5)
    actual_pitch = length / (n + 1)
    plate = _rivet_strip_plate(length, width, thickness)
    parts = [plate]
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_box(bm, Vector((head_radius_major * 2.2, head_radius_minor * 2.2, 0.004)),
                   center=Vector((x, 0.0, thickness + 0.002)))
        washer = new_object(f"KIT_RIVET_STRIP_washer_{i:02d}", bm)
        parts.append(washer)
        bm2 = bmesh.new()
        bm_add_dome(bm2, head_radius_minor, head_height, segments=8, ring_count=2,
                    center=Vector((x, 0.0, thickness + 0.004)))
        parts.append(new_object(f"KIT_RIVET_STRIP_rivet_{i:02d}", bm2))
    obj = finish_many(parts, "KIT_RIVET_STRIP_V04", mat="KitMat_Steel")
    return [obj]


def _rivet_strip_double_run_heavy(length, width, thickness, r) -> list:
    """Heavy weapon-grade rivets — large domes along both edges of a wide strip."""
    head_radius = round(r.uniform(0.022, 0.028), 4)
    head_height = head_radius * 0.6
    width = max(width, 0.085)
    pitch = round(r.uniform(0.22, 0.30), 4)
    n = max(2, int(length / pitch))
    n = min(n, 4)
    actual_pitch = length / (n + 1)
    plate = _rivet_strip_plate(length, width, thickness)
    parts = [plate]
    y_off = width * 0.32
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        for j, sy in enumerate((-1, 1)):
            bm = bmesh.new()
            bm_add_dome(bm, head_radius, head_height, segments=8, ring_count=2,
                        center=Vector((x, sy * y_off, thickness)))
            parts.append(new_object(f"KIT_RIVET_STRIP_rivet_{i:02d}_{j}", bm))
    obj = finish_many(parts, "KIT_RIVET_STRIP_V05", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# Additional geometry helpers
# --------------------------------------------------------------------------- #

def bm_add_prism(bm: bmesh.types.BMesh, sides: int, radius: float, height: float,
                 center: Vector = None, axis: str = "Z", rotation: float = 0.0):
    """Regular n-gonal prism. Returns [top_cap, bottom_cap]."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    n = max(3, int(sides))
    top = []
    bot = []
    for i in range(n):
        a = (i / n) * math.tau + rotation
        x = math.cos(a) * radius
        y = math.sin(a) * radius
        if axis == "Z":
            top.append(bm.verts.new((center.x + x, center.y + y, center.z + height)))
            bot.append(bm.verts.new((center.x + x, center.y + y, center.z)))
        elif axis == "Y":
            top.append(bm.verts.new((center.x + x, center.y + height, center.z + y)))
            bot.append(bm.verts.new((center.x + x, center.y, center.z + y)))
        else:
            top.append(bm.verts.new((center.x + height, center.y + x, center.z + y)))
            bot.append(bm.verts.new((center.x, center.y + x, center.z + y)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bot[i], bot[j], top[j], top[i]])
    cap_top = bm.faces.new(list(reversed(top)))
    cap_bot = bm.faces.new(bot)
    bm.normal_update()
    return [cap_top, cap_bot]


def bm_add_triangular_prism(bm: bmesh.types.BMesh, a_len: float, b_len: float,
                            thickness: float, center: Vector = None):
    """Right-triangular prism in the XY plane (axis = Z), extruded by thickness.

    The triangle has legs a_len (along +X) and b_len (along +Y), meeting at
    the origin corner; the hypotenuse runs from (a_len, 0) to (0, b_len).
    Face windings chosen so all normals point outward (verified by
    bmesh.calc_volume on a 1x1x1 unit: returns the expected 0.5).
    """
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    base_pts = [(0.0, 0.0), (a_len, 0.0), (0.0, b_len)]
    bot = [bm.verts.new((center.x + x, center.y + y, center.z)) for x, y in base_pts]
    top = [bm.verts.new((center.x + x, center.y + y, center.z + thickness)) for x, y in base_pts]
    # Side quads — outward normals point away from the triangle's centroid.
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new([bot[i], bot[j], top[j], top[i]])
    # Top face: normal +Z (CCW when viewed from above)
    bm.faces.new(top)
    # Bottom face: normal -Z (CW when viewed from above)
    bm.faces.new(list(reversed(bot)))
    bm.normal_update()
    return None


def bm_add_torus_segment(bm: bmesh.types.BMesh, major_radius: float,
                         minor_radius: float, major_segments: int = 12,
                         minor_segments: int = 6, angle_start: float = 0.0,
                         angle_span: float = math.tau,
                         center: Vector = None):
    """Partial torus lying in the XY plane (ring axis = Z). For D-rings."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    rings = []
    for i in range(major_segments + 1):
        t = i / major_segments
        a = angle_start + t * angle_span
        cx = math.cos(a) * major_radius
        cy = math.sin(a) * major_radius
        ring = []
        for j in range(minor_segments):
            phi = (j / minor_segments) * math.tau
            # minor circle in plane containing ring axis (Z) and radial direction
            rx = math.cos(phi) * minor_radius
            rz = math.sin(phi) * minor_radius
            x = cx + math.cos(a) * rx
            y = cy + math.sin(a) * rx
            ring.append(bm.verts.new((center.x + x, center.y + y, center.z + rz)))
        rings.append(ring)
    for i in range(major_segments):
        a = rings[i]
        b = rings[i + 1]
        for j in range(minor_segments):
            k = (j + 1) % minor_segments
            bm.faces.new([a[j], a[k], b[k], b[j]])
    # cap the ends if not full torus
    if angle_span < math.tau - 1e-6:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()


def boolean_subtract(target: bpy.types.Object, cutter: bpy.types.Object,
                     delete_cutter: bool = True):
    """Subtract cutter from target via boolean modifier, then re-apply the
    target's first material so newly-created faces do not end up with a None
    material slot (a common artifact of the EXACT solver)."""
    _set_active(target)
    # Make sure the cutter has at least one material slot matching the target,
    # so the result inherits a valid material on the seam faces.
    if len(target.data.materials) > 0 and target.data.materials[0] is not None:
        mat = target.data.materials[0]
    else:
        mat = bpy.data.materials.get("KitMat_Steel") or bpy.data.materials.new("KitMat_Steel")
    if len(cutter.data.materials) == 0:
        cutter.data.materials.append(mat)
    mod = target.modifiers.new("BooleanDiff", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_cutter:
        bpy.data.objects.remove(cutter, do_unlink=True)
    # Re-assign material: collapse to a single slot, set all faces to 0.
    target.data.materials.clear()
    target.data.materials.append(mat)
    for poly in target.data.polygons:
        poly.material_index = 0


# --------------------------------------------------------------------------- #
# === FAMILY 2: fastener_recessed =========================================== #
# --------------------------------------------------------------------------- #

@register_family("fastener_recessed", variants=4)
def build_fastener_recessed(variant: int, seed: int):
    """Serviceable bolted seam. +X along the seam, +Z out of surface."""
    r = _rng(seed)
    length = round(r.uniform(0.40, 0.80), 4)
    strip_w = round(r.uniform(0.05, 0.08), 4)
    strip_t = 0.018
    pitch = round(r.uniform(0.14, 0.20), 4)
    n = max(2, int(length / pitch) - 1)
    n = min(n, 4)
    actual_pitch = length / (n + 1)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, strip_w, strip_t)),
               center=Vector((0.0, 0.0, strip_t * 0.5)))
    strip = new_object("KIT_FASTENER_RECESSED_strip", bm)
    parts = [strip]
    if variant == 1:
        return _fastener_hex_slotted(parts, length, actual_pitch, n, strip_t, r)
    if variant == 2:
        return _fastener_allen_socket(parts, length, actual_pitch, n, strip_t, r)
    if variant == 3:
        return _fastener_quarter_turn(parts, length, actual_pitch, n, strip_t, r)
    if variant == 4:
        return _fastener_phillips(parts, length, actual_pitch, n, strip_t, r)
    raise ValueError(f"fastener_recessed: bad variant {variant}")


def _fastener_hex_slotted(parts, length, pitch, n, strip_t, r):
    head_radius = round(r.uniform(0.018, 0.024), 4)
    head_height = round(r.uniform(0.010, 0.014), 4)
    for i in range(n):
        x = -length * 0.5 + pitch * (i + 1)
        bm = bmesh.new()
        bm_add_prism(bm, sides=6, radius=head_radius, height=head_height,
                     center=Vector((x, 0.0, strip_t)), rotation=math.radians(30))
        # Slot: thin rectangular inset across the top
        bm_add_box(bm, Vector((head_radius * 1.6, head_radius * 0.20, 0.002)),
                   center=Vector((x, 0.0, strip_t + head_height - 0.001)))
        parts.append(new_object(f"KIT_FASTENER_RECESSED_bolt_{i:02d}", bm))
    obj = finish_many(parts, "KIT_FASTENER_RECESSED_V01", mat="KitMat_Steel")
    return [obj]


def _fastener_allen_socket(parts, length, pitch, n, strip_t, r):
    head_radius = round(r.uniform(0.018, 0.024), 4)
    head_height = round(r.uniform(0.010, 0.014), 4)
    socket_radius = head_radius * 0.35
    socket_depth = 0.004
    for i in range(n):
        x = -length * 0.5 + pitch * (i + 1)
        bm = bmesh.new()
        bm_add_cylinder(bm, head_radius, head_height, segments=12,
                        center=Vector((x, 0.0, strip_t)))
        # Allen socket: small hex prism recessed into the top
        bm_add_prism(bm, sides=6, radius=socket_radius, height=socket_depth,
                     center=Vector((x, 0.0, strip_t + head_height - socket_depth)),
                     rotation=math.radians(30))
        parts.append(new_object(f"KIT_FASTENER_RECESSED_bolt_{i:02d}", bm))
    obj = finish_many(parts, "KIT_FASTENER_RECESSED_V02", mat="KitMat_Steel")
    return [obj]


def _fastener_quarter_turn(parts, length, pitch, n, strip_t, r):
    """Quarter-turn latch: D-ring lying flat with a small base."""
    ring_radius = round(r.uniform(0.018, 0.024), 4)
    tube_radius = ring_radius * 0.18
    base_w = ring_radius * 2.4
    base_l = ring_radius * 1.0
    base_t = 0.006
    for i in range(n):
        x = -length * 0.5 + pitch * (i + 1)
        # Base plate
        bm = bmesh.new()
        bm_add_box(bm, Vector((base_l, base_w, base_t)),
                   center=Vector((x, 0.0, strip_t + base_t * 0.5)))
        parts.append(new_object(f"KIT_FASTENER_RECESSED_base_{i:02d}", bm))
        # D-ring (half torus standing up along Y axis)
        bm2 = bmesh.new()
        bm_add_torus_segment(bm2, major_radius=ring_radius, minor_radius=tube_radius,
                             major_segments=10, minor_segments=6,
                             angle_start=0.0, angle_span=math.pi,
                             center=Vector((x, 0.0, strip_t + base_t)))
        # Rotate so the half-torus stands up: rotate 90° around Y
        ring = new_object(f"KIT_FASTENER_RECESSED_ring_{i:02d}", bm2)
        ring.rotation_euler = (math.radians(90), 0.0, 0.0)
        parts.append(ring)
    obj = finish_many(parts, "KIT_FASTENER_RECESSED_V03", mat="KitMat_Steel")
    return [obj]


def _fastener_phillips(parts, length, pitch, n, strip_t, r):
    head_radius = round(r.uniform(0.018, 0.024), 4)
    head_height = round(r.uniform(0.010, 0.014), 4)
    slot_w = head_radius * 0.16
    slot_l = head_radius * 1.4
    for i in range(n):
        x = -length * 0.5 + pitch * (i + 1)
        bm = bmesh.new()
        bm_add_cylinder(bm, head_radius, head_height, segments=12,
                        center=Vector((x, 0.0, strip_t)))
        # Phillips: two crossed slots at 90°
        bm_add_box(bm, Vector((slot_l, slot_w, 0.002)),
                   center=Vector((x, 0.0, strip_t + head_height - 0.001)))
        bm_add_box(bm, Vector((slot_w, slot_l, 0.002)),
                   center=Vector((x, 0.0, strip_t + head_height - 0.001)))
        parts.append(new_object(f"KIT_FASTENER_RECESSED_bolt_{i:02d}", bm))
    obj = finish_many(parts, "KIT_FASTENER_RECESSED_V04", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 3: rail_split ================================================== #
# --------------------------------------------------------------------------- #

@register_family("rail_split", variants=4)
def build_rail_split(variant: int, seed: int):
    """Structural rail with center bevel. +X = length, +Z = up, +Y = width."""
    r = _rng(seed)
    length = round(r.uniform(0.8, 2.4), 4)
    width = round(r.uniform(0.08, 0.15), 4)
    if variant == 1:
        return _rail_i_profile(length, width, r)
    if variant == 2:
        return _rail_c_channel(length, width, r)
    if variant == 3:
        return _rail_boxed_lightening(length, width, r)
    if variant == 4:
        return _rail_t_profile(length, width, r)
    raise ValueError(f"rail_split: bad variant {variant}")


def _rail_i_profile(length, width, r):
    flange_t = 0.018
    web_t = max(0.012, width * 0.18)
    total_h = max(0.07, width * 0.85)
    web_h = total_h - flange_t * 2
    parts = []
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, flange_t)),
               center=Vector((0.0, 0.0, total_h - flange_t * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_top_flange", bm))
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, web_t, web_h)),
               center=Vector((0.0, 0.0, flange_t + web_h * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_web", bm))
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, flange_t)),
               center=Vector((0.0, 0.0, flange_t * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_bot_flange", bm))
    obj = finish_many(parts, "KIT_RAIL_SPLIT_V01", mat="KitMat_Steel")
    return [obj]


def _rail_c_channel(length, width, r):
    back_t = max(0.012, width * 0.18)
    total_h = max(0.07, width * 0.85)
    flange_t = 0.016
    flange_depth = (width - back_t) * 0.5
    flange_cy = (back_t + width) * 0.25
    parts = []
    # Back plate (full profile)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, back_t, total_h)),
               center=Vector((0.0, 0.0, total_h * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_back", bm))
    # Top and bottom flanges (each full width, thin)
    for sy, zc in ((1, total_h - flange_t * 0.5), (-1, flange_t * 0.5)):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, width, flange_t)),
                   center=Vector((0.0, flange_cy * 0.0, zc)))
        parts.append(new_object(f"KIT_RAIL_SPLIT_flange_{'top' if sy > 0 else 'bot'}", bm))
    obj = finish_many(parts, "KIT_RAIL_SPLIT_V02", mat="KitMat_Steel")
    return [obj]


def _rail_boxed_lightening(length, width, r):
    """Closed box section with circular lightening holes through both side walls."""
    wall_t = max(0.012, width * 0.16)
    total_h = max(0.08, width * 0.95)
    hole_r = min(total_h, width) * 0.22
    pitch = round(r.uniform(0.16, 0.24), 4)
    n_holes = max(2, int(length / pitch) - 1)
    n_holes = min(n_holes, 8)
    actual_pitch = length / (n_holes + 1)
    parts = []
    # Top, bottom, two side walls
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, wall_t)),
               center=Vector((0.0, 0.0, total_h - wall_t * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_top", bm))
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, wall_t)),
               center=Vector((0.0, 0.0, wall_t * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_bot", bm))
    for sy in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, wall_t, total_h - wall_t * 2)),
                   center=Vector((0.0, sy * (width - wall_t) * 0.5, total_h * 0.5)))
        parts.append(new_object(f"KIT_RAIL_SPLIT_wall_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_RAIL_SPLIT_V03", mat="KitMat_Steel")
    # Punch lightening holes through side walls via small cutter cylinders
    # (kept lightweight — visual proxy that reads at gameplay distance).
    cutters = []
    for i in range(n_holes):
        x = -length * 0.5 + actual_pitch * (i + 1)
        for sy in (-1, 1):
            cbm = bmesh.new()
            bm_add_cylinder(cbm, hole_r, width * 1.4, segments=8,
                            center=Vector((x, 0.0, total_h * 0.5)), axis="Y")
            cutters.append(new_object(f"_cutter_{i}_{sy}", cbm))
    for c in cutters:
        boolean_subtract(obj, c)
    # Re-apply UV after boolean changed the geometry.
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    smart_uv(obj)
    return [obj]


def _rail_t_profile(length, width, r):
    flange_t = 0.018
    web_t = max(0.014, width * 0.22)
    total_h = max(0.07, width * 0.85)
    web_h = total_h - flange_t
    parts = []
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, flange_t)),
               center=Vector((0.0, 0.0, total_h - flange_t * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_top_flange", bm))
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, web_t, web_h)),
               center=Vector((0.0, 0.0, web_h * 0.5)))
    parts.append(new_object("KIT_RAIL_SPLIT_web", bm))
    obj = finish_many(parts, "KIT_RAIL_SPLIT_V04", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 4: bracket_gusset ============================================== #
# --------------------------------------------------------------------------- #

@register_family("bracket_gusset", variants=4)
def build_bracket_gusset(variant: int, seed: int):
    """Load path into a plate. Sits at the corner where two plates meet."""
    r = _rng(seed)
    size = round(r.uniform(0.10, 0.30), 4)
    if variant == 1:
        return _bracket_triangular_gusset(size, r)
    if variant == 2:
        return _bracket_ribbed_l(size, r)
    if variant == 3:
        return _bracket_cast_lug(size, r)
    if variant == 4:
        return _bracket_angle_rib(size, r)
    raise ValueError(f"bracket_gusset: bad variant {variant}")


def _bracket_triangular_gusset(size, r):
    """Right-triangular plate with two mounting holes."""
    thick = max(0.012, size * 0.10)
    bm = bmesh.new()
    bm_add_triangular_prism(bm, a_len=size, b_len=size, thickness=thick)
    gusset = new_object("KIT_BRACKET_GUSSET_plate", bm)
    # Bevel the structural edges of the prism.
    smallest = max(1e-6, min(gusset.dimensions))
    if smallest >= 0.012:
        w = max(0.004, min(0.010, smallest * 0.25))
        add_bevel(gusset, width=w)
        gusset["kitgen_bevel_applied"] = True
    add_weighted_normals(gusset)
    apply_transforms(gusset)
    # Two mounting holes — punched through as visual proxy
    hole_r = min(size * 0.08, 0.018)
    cutters = []
    for fx, fy in ((0.25, 0.25), (size * 0.65, size * 0.25)):
        cbm = bmesh.new()
        bm_add_cylinder(cbm, hole_r, thick * 4.0, segments=10,
                        center=Vector((fx, fy, thick * 0.5)))
        cutters.append(new_object(f"_cutter_{fx}", cbm))
    for c in cutters:
        boolean_subtract(gusset, c)
    for layer in list(gusset.data.uv_layers):
        gusset.data.uv_layers.remove(layer)
    smart_uv(gusset)
    assign_material(gusset, "KitMat_Steel")
    gusset.name = "KIT_BRACKET_GUSSET_V01"
    gusset.data.name = "KIT_BRACKET_GUSSET_V01_mesh"
    return [gusset]


def _bracket_ribbed_l(size, r):
    """L-bracket: two perpendicular plates joined, with vertical ribs."""
    thick = max(0.012, size * 0.10)
    rib_t = max(0.008, size * 0.06)
    rib_h = max(0.012, size * 0.10)
    n_ribs = max(2, min(4, int(size / 0.08)))
    parts = []
    # Horizontal plate (floor of the L)
    bm = bmesh.new()
    bm_add_box(bm, Vector((size, size, thick)),
               center=Vector((0.0, 0.0, thick * 0.5)))
    parts.append(new_object("KIT_BRACKET_GUSSET_floor", bm))
    # Vertical plate (back of the L)
    bm = bmesh.new()
    bm_add_box(bm, Vector((size, thick, size * 0.7)),
               center=Vector((0.0, -size * 0.5 + thick * 0.5, thick + size * 0.35)))
    parts.append(new_object("KIT_BRACKET_GUSSET_back", bm))
    # Ribs along the floor
    for i in range(n_ribs):
        t = (i + 1) / (n_ribs + 1)
        x = -size * 0.5 + t * size
        bm = bmesh.new()
        bm_add_box(bm, Vector((rib_t, size * 0.9, rib_h)),
                   center=Vector((x, 0.0, thick + rib_h * 0.5)))
        parts.append(new_object(f"KIT_BRACKET_GUSSET_rib_{i:02d}", bm))
    obj = finish_many(parts, "KIT_BRACKET_GUSSET_V02", mat="KitMat_Steel")
    return [obj]


def _bracket_cast_lug(size, r):
    """Cast mounting lug: thick pad with a bolt hole and fillet."""
    pad = size
    pad_t = max(0.020, size * 0.18)
    lug_radius = min(size * 0.18, 0.030)
    bm = bmesh.new()
    bm_add_box(bm, Vector((pad, pad, pad_t)),
               center=Vector((0.0, 0.0, pad_t * 0.5)))
    pad_obj = new_object("KIT_BRACKET_GUSSET_pad", bm)
    # Raised boss where the bolt passes through
    bm = bmesh.new()
    bm_add_cylinder(bm, lug_radius * 1.4, pad_t * 0.5, segments=14,
                    center=Vector((0.0, 0.0, pad_t + pad_t * 0.25)))
    boss = new_object("KIT_BRACKET_GUSSET_boss", bm)
    parts = [pad_obj, boss]
    obj = finish_many(parts, "KIT_BRACKET_GUSSET_pad_assembly", mat="KitMat_Steel")
    # Punch bolt hole through the boss + pad
    cbm = bmesh.new()
    bm_add_cylinder(cbm, lug_radius * 0.55, pad_t * 4.0, segments=12,
                    center=Vector((0.0, 0.0, pad_t * 0.5)))
    cutter = new_object("_lug_cutter", cbm)
    boolean_subtract(obj, cutter)
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    smart_uv(obj)
    obj.name = "KIT_BRACKET_GUSSET_V03"
    obj.data.name = "KIT_BRACKET_GUSSET_V03_mesh"
    return [obj]


def _bracket_angle_rib(size, r):
    """Single angled rib brace — diagonal strut physically CONNECTING two pads.

    The strut endpoints embed into both pad volumes so the rod reads as seated
    on/into the pads, forming one connected assembly rather than three
    disconnected parts. Geometry is derived from the actual pad-to-pad vector
    (not a fixed 45 deg Euler), so the strut lands inside both pads for any
    ``size`` and the brace always touches what it braces.
    """
    thick = max(0.014, size * 0.10)
    pad_size = size * 0.30
    parts = []
    # Bottom pad: horizontal plate on the XY floor, centred at origin.
    bm = bmesh.new()
    bm_add_box(bm, Vector((pad_size, pad_size, thick)),
               center=Vector((0.0, 0.0, thick * 0.5)))
    parts.append(new_object("KIT_BRACKET_GUSSET_pad_bot", bm))
    # Top pad: vertical plate standing up at y = -size*0.5 (the "wall" the brace
    # reaches), broad face pointing +Y toward the bottom pad.
    top_y_center = -size * 0.5 + thick * 0.5
    top_z_center = size - pad_size * 0.5
    bm = bmesh.new()
    bm_add_box(bm, Vector((pad_size, thick, pad_size)),
               center=Vector((0.0, top_y_center, top_z_center)))
    parts.append(new_object("KIT_BRACKET_GUSSET_pad_top", bm))
    # Strut: built as a Z-aligned box, then rotated so local +Z aligns with the
    # pad-to-pad vector and translated to the strut midpoint. Each end is
    # embedded by ``thick*0.5`` past the pad centre so the rod overlaps real
    # pad volume on both ends (the pads are >=thick thick, so the embedded
    # endpoint stays inside the pad, never poking out the far side).
    p_bot = Vector((0.0, 0.0, thick * 0.5))
    p_top = Vector((0.0, top_y_center, top_z_center))
    direction = p_top - p_bot
    dlen = direction.length
    if dlen < 1e-6:
        direction = Vector((0.0, 0.0, 1.0))
        dlen = 1.0
    direction_normalized = direction / dlen
    embed = thick * 0.5
    a = p_bot - direction_normalized * embed
    b = p_top + direction_normalized * embed
    strut_vec = b - a
    strut_len = strut_vec.length
    strut_center = (a + b) * 0.5
    bm = bmesh.new()
    bm_add_box(bm, Vector((thick, thick, strut_len)))
    strut = new_object("KIT_BRACKET_GUSSET_strut", bm)
    z_axis = Vector((0.0, 0.0, 1.0))
    quat = z_axis.rotation_difference(strut_vec.normalized())
    strut.rotation_mode = 'QUATERNION'
    strut.rotation_quaternion = quat
    strut.location = strut_center
    parts.append(strut)
    obj = finish_many(parts, "KIT_BRACKET_GUSSET_V04", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 5: plate_lip ================================================== #
# --------------------------------------------------------------------------- #

@register_family("plate_lip", variants=3)
def build_plate_lip(variant: int, seed: int):
    """Overlapping armor seam. +X along the seam, +Z out of surface."""
    r = _rng(seed)
    length = round(r.uniform(0.6, 1.6), 4)
    depth = round(r.uniform(0.10, 0.18), 4)
    if variant == 1:
        return _plate_lip_stepped_lap(length, depth, r)
    if variant == 2:
        return _plate_lip_weather_strip(length, depth, r)
    if variant == 3:
        return _plate_lip_butt_strap(length, depth, r)
    raise ValueError(f"plate_lip: bad variant {variant}")


def _plate_lip_stepped_lap(length, depth, r):
    """Lower plate flush with surface, upper plate stepped up over it."""
    t = 0.022
    overlap = depth * 0.55
    lower_d = depth - overlap * 0.5
    upper_d = overlap
    step_h = t * 0.55
    parts = []
    # Lower plate (sits at base z)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, lower_d, t)),
               center=Vector((0.0, depth * 0.25 - lower_d * 0.5, t * 0.5)))
    parts.append(new_object("KIT_PLATE_LIP_lower", bm))
    # Upper plate (stepped up, overlapping forward edge)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, upper_d, t)),
               center=Vector((0.0, -depth * 0.25 + upper_d * 0.5, t + step_h - t * 0.5)))
    parts.append(new_object("KIT_PLATE_LIP_upper", bm))
    obj = finish_many(parts, "KIT_PLATE_LIP_V01", mat="KitMat_Paint")
    return [obj]


def _plate_lip_weather_strip(length, depth, r):
    """Base plate with a raised weather strip running along the centerline."""
    t = 0.022
    strip_w = round(r.uniform(0.025, 0.040), 4)
    strip_h = round(r.uniform(0.012, 0.020), 4)
    parts = []
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, depth, t)),
               center=Vector((0.0, 0.0, t * 0.5)))
    parts.append(new_object("KIT_PLATE_LIP_base", bm))
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, strip_w, strip_h)),
               center=Vector((0.0, 0.0, t + strip_h * 0.5)))
    parts.append(new_object("KIT_PLATE_LIP_strip", bm))
    obj = finish_many(parts, "KIT_PLATE_LIP_V02", mat="KitMat_Paint")
    return [obj]


def _plate_lip_butt_strap(length, depth, r):
    """Wide strap covering the seam, secured with bolts at intervals."""
    t = 0.020
    strap_w = round(r.uniform(0.08, 0.13), 4)
    bolt_r = 0.011
    bolt_pitch = round(r.uniform(0.18, 0.26), 4)
    n = max(2, int(length / bolt_pitch) - 1)
    n = min(n, 6)
    actual_pitch = length / (n + 1)
    parts = []
    # Two underlying plates forming the seam (small visible gap under strap)
    gap = 0.010
    plate_d = (depth - gap) * 0.5
    for sy in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, plate_d, t)),
                   center=Vector((0.0, sy * (plate_d * 0.5 + gap * 0.25), t * 0.5)))
        parts.append(new_object(f"KIT_PLATE_LIP_plate_{'p' if sy > 0 else 'n'}", bm))
    # Strap across the seam
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, strap_w, t * 0.9)),
               center=Vector((0.0, 0.0, t + t * 0.45)))
    parts.append(new_object("KIT_PLATE_LIP_strap", bm))
    # Bolts along the strap
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_cylinder(bm, bolt_r, 0.008, segments=10,
                        center=Vector((x, strap_w * 0.35, t + t * 0.9)))
        parts.append(new_object(f"KIT_PLATE_LIP_bolt_a_{i:02d}", bm))
        bm = bmesh.new()
        bm_add_cylinder(bm, bolt_r, 0.008, segments=10,
                        center=Vector((x, -strap_w * 0.35, t + t * 0.9)))
        parts.append(new_object(f"KIT_PLATE_LIP_bolt_b_{i:02d}", bm))
    obj = finish_many(parts, "KIT_PLATE_LIP_V03", mat="KitMat_Paint")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 6: weld_seam ================================================== #
# --------------------------------------------------------------------------- #

@register_family("weld_seam", variants=3)
def build_weld_seam(variant: int, seed: int):
    """Joined by welding. +X along the seam, +Z out of surface."""
    r = _rng(seed)
    length = round(r.uniform(0.4, 1.2), 4)
    plate_d = round(r.uniform(0.08, 0.14), 4)
    if variant == 1:
        return _weld_stitch(length, plate_d, r)
    if variant == 2:
        return _weld_continuous_bead(length, plate_d, r)
    if variant == 3:
        return _weld_ground_flush(length, plate_d, r)
    raise ValueError(f"weld_seam: bad variant {variant}")


def _weld_seam_plates(length, plate_d, t=0.018):
    """Two plates meeting at a center seam (along X axis at y=0)."""
    parts = []
    for sy in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, plate_d * 0.5, t)),
                   center=Vector((0.0, sy * plate_d * 0.25, t * 0.5)))
        parts.append(new_object(f"KIT_WELD_SEAM_plate_{'p' if sy > 0 else 'n'}", bm))
    return parts


def _weld_stitch(length, plate_d, r):
    """Stitch weld — series of short bead segments along the seam."""
    t = 0.018
    bead_r = round(r.uniform(0.011, 0.018), 4)
    bead_len = round(r.uniform(0.05, 0.08), 4)
    pitch = round(r.uniform(0.10, 0.16), 4)
    n = max(2, int(length / pitch) - 1)
    n = min(n, 8)
    actual_pitch = length / (n + 1)
    parts = _weld_seam_plates(length, plate_d, t)
    for i in range(n):
        x_center = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        # Half-cylinder lying along X, flat side down
        bm_add_cylinder(bm, bead_r, bead_len, segments=10,
                        center=Vector((x_center, 0.0, t)), axis="X")
        # Flatten the bottom by subtracting a thin box (cleaner than vertices)
        parts.append(new_object(f"KIT_WELD_SEAM_bead_{i:02d}", bm))
    obj = finish_many(parts, "KIT_WELD_SEAM_V01", mat="KitMat_Steel")
    return [obj]


def _weld_continuous_bead(length, plate_d, r):
    """One continuous bead running the length of the seam."""
    t = 0.018
    bead_r = round(r.uniform(0.011, 0.018), 4)
    # Use enough segments to read as a real bead but stay under tris budget.
    seg_count = min(48, max(16, int(length / 0.04)))
    parts = _weld_seam_plates(length, plate_d, t)
    bm = bmesh.new()
    bm_add_cylinder(bm, bead_r, length, segments=seg_count,
                    center=Vector((0.0, 0.0, t)), axis="X")
    parts.append(new_object("KIT_WELD_SEAM_bead", bm))
    obj = finish_many(parts, "KIT_WELD_SEAM_V02", mat="KitMat_Steel")
    return [obj]


def _weld_ground_flush(length, plate_d, r):
    """Ground-flush weld with a subtle HAZ ridge — mostly flat with a low
    central ridge and discolored heat-affected zone either side (proxy:
    a thin low ridge plus two shallow raised bands)."""
    t = 0.018
    ridge_w = 0.018
    ridge_h = 0.005
    haze_w = 0.035
    haze_h = 0.0015
    parts = _weld_seam_plates(length, plate_d, t)
    # Central ridge
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, ridge_w, ridge_h)),
               center=Vector((0.0, 0.0, t + ridge_h * 0.5)))
    parts.append(new_object("KIT_WELD_SEAM_ridge", bm))
    # Two subtle HAZ bands
    for sy in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, haze_w, haze_h)),
                   center=Vector((0.0, sy * (ridge_w * 0.5 + haze_w * 0.5 + 0.001),
                                  t + haze_h * 0.5)))
        parts.append(new_object(f"KIT_WELD_SEAM_haze_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_WELD_SEAM_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 7: hatch_frame ================================================ #
# --------------------------------------------------------------------------- #

@register_family("hatch_frame", variants=3)
def build_hatch_frame(variant: int, seed: int):
    """Crew/service access. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _hatch_dogged_oval(r)
    if variant == 2:
        return _hatch_square_quarter_latch(r)
    if variant == 3:
        return _hatch_piano_hinge(r)
    raise ValueError(f"hatch_frame: bad variant {variant}")


def _hatch_dogged_oval(r):
    """Oval hatch cover with dogged latches around the rim."""
    length = round(r.uniform(0.5, 0.8), 4)
    width = round(r.uniform(0.32, 0.45), 4)
    cover_t = 0.018
    rim_h = 0.020
    dog_count = 6
    parts = []
    # Cover (oval — approximated as a box with semicircular ends).
    # Use a single box for the central band + two half-cylinders for ends.
    band_len = length - width  # straight section length
    bm = bmesh.new()
    bm_add_box(bm, Vector((band_len, width, cover_t)),
               center=Vector((0.0, 0.0, cover_t * 0.5)))
    parts.append(new_object("KIT_HATCH_FRAME_band", bm))
    for sx in (-1, 1):
        bm = bmesh.new()
        bm_add_cylinder(bm, width * 0.5, cover_t, segments=14,
                        center=Vector((sx * band_len * 0.5, 0.0, cover_t * 0.5)))
        end = new_object(f"KIT_HATCH_FRAME_end_{'p' if sx > 0 else 'n'}", bm)
        _mark_no_bevel(end)
        parts.append(end)
    # Rim ring (raised lip around perimeter)
    rim_w = 0.020
    rim_inset = 0.025
    rim_band = band_len - rim_inset * 2
    if rim_band > 0.05:
        for sy in (-1, 1):
            bm = bmesh.new()
            bm_add_box(bm, Vector((rim_band, rim_w, rim_h)),
                       center=Vector((0.0, sy * (width * 0.5 - rim_w * 0.5),
                                      cover_t + rim_h * 0.5)))
            parts.append(new_object(f"KIT_HATCH_FRAME_rim_{'p' if sy > 0 else 'n'}", bm))
    # Dogs (small clamping handles around perimeter)
    dog_w = 0.022
    dog_d = 0.012
    dog_h = 0.014
    for i in range(dog_count):
        t = i / dog_count
        a = t * math.tau
        cx = math.cos(a) * length * 0.45
        cy = math.sin(a) * width * 0.45
        bm = bmesh.new()
        bm_add_box(bm, Vector((dog_w, dog_d, dog_h)),
                   center=Vector((cx, cy, cover_t + dog_h * 0.5)))
        dog = new_object(f"KIT_HATCH_FRAME_dog_{i:02d}", bm)
        _mark_no_bevel(dog)  # tiny clamp handle, no per-dog bevel needed
        parts.append(dog)
    obj = finish_many(parts, "KIT_HATCH_FRAME_V01", mat="KitMat_Paint")
    return [obj]


def _hatch_square_quarter_latch(r):
    """Square hatch cover with quarter-turn latches at the corners."""
    side = round(r.uniform(0.45, 0.65), 4)
    cover_t = 0.018
    rim_w = 0.022
    rim_h = 0.022
    parts = []
    # Cover plate
    bm = bmesh.new()
    bm_add_box(bm, Vector((side, side, cover_t)),
               center=Vector((0.0, 0.0, cover_t * 0.5)))
    parts.append(new_object("KIT_HATCH_FRAME_cover", bm))
    # Raised rim (four sides)
    for axis, sz, off in (("x", side, 0), ("y", side, 0)):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((rim_w * 1.5, side - rim_w * 0.5, rim_h)),
                           center=Vector((sy * (side * 0.5 - rim_w * 0.75), 0.0,
                                          cover_t + rim_h * 0.5)))
            else:
                bm_add_box(bm, Vector((side - rim_w * 0.5, rim_w * 1.5, rim_h)),
                           center=Vector((0.0, sy * (side * 0.5 - rim_w * 0.75),
                                          cover_t + rim_h * 0.5)))
            parts.append(new_object(f"KIT_HATCH_FRAME_rim_{axis}_{'p' if sy > 0 else 'n'}", bm))
    # Quarter-turn latches at corners — small D-ring proxies
    latch_r = 0.018
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx = sx * (side * 0.5 - rim_w * 1.6)
            cy = sy * (side * 0.5 - rim_w * 1.6)
            bm = bmesh.new()
            bm_add_cylinder(bm, latch_r, 0.006, segments=10,
                            center=Vector((cx, cy, cover_t + rim_h + 0.003)))
            parts.append(new_object(f"KIT_HATCH_FRAME_latch_{sx}_{sy}", bm))
    obj = finish_many(parts, "KIT_HATCH_FRAME_V02", mat="KitMat_Paint")
    return [obj]


def _hatch_piano_hinge(r):
    """Rectangular hatch with a continuous piano hinge along one long edge."""
    length = round(r.uniform(0.55, 0.80), 4)
    width = round(r.uniform(0.30, 0.45), 4)
    cover_t = 0.018
    hinge_y = -width * 0.5 + 0.020
    knuckle_count = max(4, int(length / 0.08))
    knuckle_count = min(knuckle_count, 10)
    parts = []
    # Cover plate
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, cover_t)),
               center=Vector((0.0, 0.0, cover_t * 0.5)))
    parts.append(new_object("KIT_HATCH_FRAME_cover", bm))
    # Hinge knuckles (alternating cylinders along the back edge)
    knuckle_r = 0.010
    knuckle_len = length / (knuckle_count * 2 + 1)
    for i in range(knuckle_count * 2 + 1):
        if i % 2 == 0:
            continue  # gap between knuckles
        x = -length * 0.5 + (i + 0.5) * (length / (knuckle_count * 2 + 1))
        bm = bmesh.new()
        bm_add_cylinder(bm, knuckle_r, knuckle_len * 0.9, segments=10,
                        center=Vector((x, hinge_y, cover_t + knuckle_r * 0.4)),
                        axis="X")
        parts.append(new_object(f"KIT_HATCH_FRAME_knuckle_{i:02d}", bm))
    # Hinge pin (long thin cylinder running through all knuckles)
    bm = bmesh.new()
    bm_add_cylinder(bm, knuckle_r * 0.35, length, segments=8,
                    center=Vector((0.0, hinge_y, cover_t + knuckle_r * 0.4)),
                    axis="X")
    parts.append(new_object("KIT_HATCH_FRAME_hinge_pin", bm))
    # Two latch dogs on the opposite edge
    dog_w = 0.022
    dog_d = 0.014
    dog_h = 0.012
    for sx in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((dog_w, dog_d, dog_h)),
                   center=Vector((sx * length * 0.30, width * 0.5 - dog_d * 0.5 - 0.005,
                                  cover_t + dog_h * 0.5)))
        parts.append(new_object(f"KIT_HATCH_FRAME_dog_{sx}", bm))
    obj = finish_many(parts, "KIT_HATCH_FRAME_V03", mat="KitMat_Paint")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 8: access_panel =============================================== #
# --------------------------------------------------------------------------- #

@register_family("access_panel", variants=3)
def build_access_panel(variant: int, seed: int):
    """Maintenance opening. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _access_flush_screwed(r)
    if variant == 2:
        return _access_raised_louvered(r)
    if variant == 3:
        return _access_quick_release(r)
    raise ValueError(f"access_panel: bad variant {variant}")


def _access_flush_screwed(r):
    """Flush screwed access panel — bolts around a perimeter ring."""
    side = round(r.uniform(0.30, 0.50), 4)
    panel_t = 0.014
    inset = 0.025
    bolt_r = 0.007
    n_per_side = max(3, int(side / 0.10))
    n_per_side = min(n_per_side, 5)
    parts = []
    # Panel
    bm = bmesh.new()
    bm_add_box(bm, Vector((side, side, panel_t)),
               center=Vector((0.0, 0.0, panel_t * 0.5)))
    parts.append(new_object("KIT_ACCESS_PANEL_panel", bm))
    # Recessed bezel (visual proxy: thin frame slightly lower)
    bezel_w = 0.012
    bezel_t = 0.003
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((bezel_w, side, bezel_t)),
                           center=Vector((sy * (side * 0.5 - bezel_w * 0.5), 0.0,
                                          panel_t + bezel_t * 0.5)))
            else:
                bm_add_box(bm, Vector((side, bezel_w, bezel_t)),
                           center=Vector((0.0, sy * (side * 0.5 - bezel_w * 0.5),
                                          panel_t + bezel_t * 0.5)))
            parts.append(new_object(f"KIT_ACCESS_PANEL_bezel_{axis}_{'p' if sy > 0 else 'n'}", bm))
    # Bolts along the bezel
    def add_bolt(x, y):
        bm = bmesh.new()
        bm_add_cylinder(bm, bolt_r, 0.006, segments=8,
                        center=Vector((x, y, panel_t + bezel_t + 0.003)))
        parts.append(new_object(f"KIT_ACCESS_PANEL_bolt_{x:.2f}_{y:.2f}", bm))
    half = side * 0.5 - bezel_w * 0.5
    for i in range(n_per_side):
        t = (i + 1) / (n_per_side + 1)
        off = -side * 0.5 + bezel_w + t * (side - 2 * bezel_w)
        add_bolt(off, half)
        add_bolt(off, -half)
        add_bolt(half, off)
        add_bolt(-half, off)
    obj = finish_many(parts, "KIT_ACCESS_PANEL_V01", mat="KitMat_Paint")
    return [obj]


def _access_raised_louvered(r):
    """Raised louvered access panel — angled slats across the face."""
    side_x = round(r.uniform(0.35, 0.55), 4)
    side_y = round(r.uniform(0.20, 0.30), 4)
    panel_t = 0.014
    louver_pitch = round(r.uniform(0.05, 0.07), 4)
    n_louvers = max(3, int(side_x / louver_pitch) - 1)
    n_louvers = min(n_louvers, 8)
    actual_pitch = side_x / (n_louvers + 1)
    parts = []
    # Base panel
    bm = bmesh.new()
    bm_add_box(bm, Vector((side_x, side_y, panel_t)),
               center=Vector((0.0, 0.0, panel_t * 0.5)))
    parts.append(new_object("KIT_ACCESS_PANEL_base", bm))
    # Louvers — thin angled slats (built as small rotated boxes)
    louver_w = actual_pitch * 0.55
    louver_h = 0.014
    for i in range(n_louvers):
        x = -side_x * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_box(bm, Vector((louver_w, side_y * 0.85, 0.002)),
                   center=Vector((x, 0.0, panel_t + louver_h * 0.5)))
        louver = new_object(f"KIT_ACCESS_PANEL_louver_{i:02d}", bm)
        # Tilt each slat slightly
        louver.rotation_euler = (math.radians(20), 0.0, 0.0)
        parts.append(louver)
    # Raised bezel
    bezel_w = 0.012
    bezel_h = 0.018
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((bezel_w, side_y, bezel_h)),
                           center=Vector((sy * (side_x * 0.5 - bezel_w * 0.5), 0.0,
                                          panel_t + bezel_h * 0.5)))
            else:
                bm_add_box(bm, Vector((side_x, bezel_w, bezel_h)),
                           center=Vector((0.0, sy * (side_y * 0.5 - bezel_w * 0.5),
                                          panel_t + bezel_h * 0.5)))
            parts.append(new_object(f"KIT_ACCESS_PANEL_bezel_{axis}_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_ACCESS_PANEL_V02", mat="KitMat_Paint")
    return [obj]


def _access_quick_release(r):
    """Quick-release latched panel — two D-ring latches on the front face."""
    side = round(r.uniform(0.30, 0.50), 4)
    panel_t = 0.014
    parts = []
    # Base panel
    bm = bmesh.new()
    bm_add_box(bm, Vector((side, side, panel_t)),
               center=Vector((0.0, 0.0, panel_t * 0.5)))
    parts.append(new_object("KIT_ACCESS_PANEL_panel", bm))
    # Bezel
    bezel_w = 0.014
    bezel_h = 0.012
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((bezel_w, side, bezel_h)),
                           center=Vector((sy * (side * 0.5 - bezel_w * 0.5), 0.0,
                                          panel_t + bezel_h * 0.5)))
            else:
                bm_add_box(bm, Vector((side, bezel_w, bezel_h)),
                           center=Vector((0.0, sy * (side * 0.5 - bezel_w * 0.5),
                                          panel_t + bezel_h * 0.5)))
            parts.append(new_object(f"KIT_ACCESS_PANEL_bezel_{axis}_{'p' if sy > 0 else 'n'}", bm))
    # Two D-ring latches
    ring_r = 0.018
    tube_r = ring_r * 0.18
    for sx in (-1, 1):
        cx = sx * side * 0.25
        # Base pad
        bm = bmesh.new()
        bm_add_box(bm, Vector((0.025, 0.040, 0.005)),
                   center=Vector((cx, 0.0, panel_t + bezel_h + 0.0025)))
        parts.append(new_object(f"KIT_ACCESS_PANEL_pad_{sx}", bm))
        # Half-torus D-ring standing up
        bm = bmesh.new()
        bm_add_torus_segment(bm, major_radius=ring_r, minor_radius=tube_r,
                             major_segments=8, minor_segments=5,
                             angle_span=math.pi,
                             center=Vector((cx, 0.0, panel_t + bezel_h + 0.005)))
        ring = new_object(f"KIT_ACCESS_PANEL_ring_{sx}", bm)
        ring.rotation_euler = (math.radians(90), 0.0, 0.0)
        parts.append(ring)
    obj = finish_many(parts, "KIT_ACCESS_PANEL_V03", mat="KitMat_Paint")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 9: vent_grid ================================================== #
# --------------------------------------------------------------------------- #

@register_family("vent_grid", variants=3)
def build_vent_grid(variant: int, seed: int):
    """Heat/gas exchange. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _vent_horizontal_louvers(r)
    if variant == 2:
        return _vent_hex_mesh(r)
    if variant == 3:
        return _vent_chevron_slats(r)
    raise ValueError(f"vent_grid: bad variant {variant}")


def _vent_horizontal_louvers(r):
    """Horizontal louvers — angled slats across the vent face."""
    length = round(r.uniform(0.30, 0.60), 4)
    width = round(r.uniform(0.18, 0.30), 4)
    base_t = 0.010
    pitch = round(r.uniform(0.045, 0.065), 4)
    n = max(3, int(width / pitch) - 1)
    n = min(n, 6)
    actual_pitch = width / (n + 1)
    parts = []
    # Backing plate (thin, recessed)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, base_t)),
               center=Vector((0.0, 0.0, base_t * 0.5)))
    parts.append(new_object("KIT_VENT_GRID_back", bm))
    # Frame around the perimeter
    fw = 0.012
    fh = 0.014
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((fw, width, fh)),
                           center=Vector((sy * (length * 0.5 - fw * 0.5), 0.0,
                                          base_t + fh * 0.5)))
            else:
                bm_add_box(bm, Vector((length, fw, fh)),
                           center=Vector((0.0, sy * (width * 0.5 - fw * 0.5),
                                          base_t + fh * 0.5)))
            parts.append(new_object(f"KIT_VENT_GRID_frame_{axis}_{'p' if sy > 0 else 'n'}", bm))
    # Louvers — angled thin slats stacked along Y
    slat_w = length - fw * 2
    slat_d = actual_pitch * 0.75
    slat_h = 0.010
    for i in range(n):
        y = -width * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_box(bm, Vector((slat_w, slat_d, 0.002)),
                   center=Vector((0.0, y, base_t + slat_h * 0.5)))
        slat = new_object(f"KIT_VENT_GRID_slat_{i:02d}", bm)
        slat.rotation_euler = (math.radians(28), 0.0, 0.0)
        parts.append(slat)
    obj = finish_many(parts, "KIT_VENT_GRID_V01", mat="KitMat_Steel")
    return [obj]


def _vent_hex_mesh(r):
    """Hex mesh vent — array of hexagonal holes through a plate."""
    length = round(r.uniform(0.25, 0.55), 4)
    width = round(r.uniform(0.18, 0.35), 4)
    plate_t = 0.014
    hex_r = 0.018  # circumradius
    row_pitch = hex_r * math.sqrt(3)
    col_pitch = hex_r * 1.5
    parts = []
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    plate = new_object("KIT_VENT_GRID_plate", bm)
    parts.append(plate)
    # Frame
    fw = 0.012
    fh = 0.010
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((fw, width, fh)),
                           center=Vector((sy * (length * 0.5 - fw * 0.5), 0.0,
                                          plate_t + fh * 0.5)))
            else:
                bm_add_box(bm, Vector((length, fw, fh)),
                           center=Vector((0.0, sy * (width * 0.5 - fw * 0.5),
                                          plate_t + fh * 0.5)))
            parts.append(new_object(f"KIT_VENT_GRID_frame_{axis}_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_VENT_GRID_assembly", mat="KitMat_Steel")
    # Punch hex holes through the plate (within the frame border)
    margin = fw + 0.005
    inner_length = length - margin * 2
    inner_width = width - margin * 2
    n_cols = max(2, int(inner_length / col_pitch))
    n_rows = max(2, int(inner_width / row_pitch))
    n_cols = min(n_cols, 8)
    n_rows = min(n_rows, 8)
    actual_cpitch = inner_length / n_cols
    actual_rpitch = inner_width / n_rows
    cutters = []
    for ci in range(n_cols):
        for ri in range(n_rows):
            x = -inner_length * 0.5 + actual_cpitch * (ci + 0.5)
            y = -inner_width * 0.5 + actual_rpitch * (ri + 0.5)
            # Offset alternate columns for hex packing
            if ci % 2 == 1:
                y += actual_rpitch * 0.5
                if y > inner_width * 0.5:
                    continue
            cbm = bmesh.new()
            bm_add_prism(cbm, sides=6, radius=hex_r * 0.65, height=plate_t * 3.0,
                         center=Vector((x, y, plate_t * 0.5)))
            cutters.append(new_object(f"_vent_cutter_{ci}_{ri}", cbm))
    for c in cutters:
        boolean_subtract(obj, c)
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    smart_uv(obj)
    obj.name = "KIT_VENT_GRID_V02"
    obj.data.name = "KIT_VENT_GRID_V02_mesh"
    return [obj]


def _vent_chevron_slats(r):
    """Angled chevron slats — V-shaped slats stacked vertically."""
    length = round(r.uniform(0.30, 0.60), 4)
    width = round(r.uniform(0.18, 0.30), 4)
    base_t = 0.010
    pitch = round(r.uniform(0.05, 0.07), 4)
    n = max(3, int(width / pitch) - 1)
    n = min(n, 5)
    actual_pitch = width / (n + 1)
    parts = []
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, base_t)),
               center=Vector((0.0, 0.0, base_t * 0.5)))
    parts.append(new_object("KIT_VENT_GRID_back", bm))
    # Frame
    fw = 0.012
    fh = 0.012
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((fw, width, fh)),
                           center=Vector((sy * (length * 0.5 - fw * 0.5), 0.0,
                                          base_t + fh * 0.5)))
            else:
                bm_add_box(bm, Vector((length, fw, fh)),
                           center=Vector((0.0, sy * (width * 0.5 - fw * 0.5),
                                          base_t + fh * 0.5)))
            parts.append(new_object(f"KIT_VENT_GRID_frame_{axis}_{'p' if sy > 0 else 'n'}", bm))
    # Chevron slats — built as two angled boxes meeting at the center
    chev_w = (length - fw * 2) * 0.5
    chev_d = actual_pitch * 0.7
    chev_h = 0.012
    for i in range(n):
        y = -width * 0.5 + actual_pitch * (i + 1)
        for sx in (-1, 1):
            bm = bmesh.new()
            bm_add_box(bm, Vector((chev_w, chev_d, 0.002)),
                       center=Vector((sx * chev_w * 0.5, y, base_t + chev_h * 0.5)))
            slat = new_object(f"KIT_VENT_GRID_chev_{i:02d}_{'p' if sx > 0 else 'n'}", bm)
            # Tilt around Z so the two halves form a chevron pointing +Y
            slat.rotation_euler = (0.0, 0.0, sx * math.radians(22))
            parts.append(slat)
    obj = finish_many(parts, "KIT_VENT_GRID_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 10: pipe_clamp ================================================ #
# --------------------------------------------------------------------------- #

@register_family("pipe_clamp", variants=3)
def build_pipe_clamp(variant: int, seed: int):
    """Routed conduit held down. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _pipe_saddle_pair(r)
    if variant == 2:
        return _pipe_block_clamp(r)
    if variant == 3:
        return _pipe_standoff_junction(r)
    raise ValueError(f"pipe_clamp: bad variant {variant}")


def _pipe_clamp_base(length, base_t=0.012):
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, 0.06, base_t)),
               center=Vector((0.0, 0.0, base_t * 0.5)))
    return new_object("KIT_PIPE_CLAMP_base", bm)


def _pipe_saddle_pair(r):
    """Two saddle clamps holding a pipe to a base plate."""
    pipe_r = round(r.uniform(0.025, 0.060), 4)
    base_len = round(r.uniform(0.20, 0.32), 4)
    base_t = 0.014
    saddle_off = base_len * 0.30
    parts = [_pipe_clamp_base(base_len, base_t)]
    # The pipe segment running across
    bm = bmesh.new()
    bm_add_cylinder(bm, pipe_r, base_len + 0.06, segments=14,
                    center=Vector((0.0, 0.0, base_t + pipe_r)), axis="X")
    parts.append(new_object("KIT_PIPE_CLAMP_pipe", bm))
    # Two saddle clamps (half-torus arcs over the pipe)
    for sx in (-1, 1):
        bm = bmesh.new()
        bm_add_torus_segment(bm, major_radius=pipe_r + 0.004, minor_radius=0.004,
                             major_segments=10, minor_segments=5,
                             angle_span=math.pi,
                             center=Vector((sx * saddle_off, 0.0,
                                            base_t + pipe_r)))
        saddle = new_object(f"KIT_PIPE_CLAMP_saddle_{sx}", bm)
        saddle.rotation_euler = (0.0, math.radians(90), 0.0)
        parts.append(saddle)
        # Saddle ends bolt into the base
        for sy in (-1, 1):
            bm = bmesh.new()
            bm_add_cylinder(bm, 0.005, 0.008, segments=8,
                            center=Vector((sx * saddle_off, sy * (pipe_r + 0.008),
                                           base_t + 0.004)))
            parts.append(new_object(f"KIT_PIPE_CLAMP_bolt_{sx}_{sy}", bm))
    obj = finish_many(parts, "KIT_PIPE_CLAMP_V01", mat="KitMat_Steel")
    return [obj]


def _pipe_block_clamp(r):
    """Solid block clamp with a top bolt holding the pipe down."""
    pipe_r = round(r.uniform(0.025, 0.060), 4)
    base_len = round(r.uniform(0.16, 0.24), 4)
    base_t = 0.014
    parts = [_pipe_clamp_base(base_len, base_t)]
    # Pipe
    bm = bmesh.new()
    bm_add_cylinder(bm, pipe_r, base_len + 0.04, segments=14,
                    center=Vector((0.0, 0.0, base_t + pipe_r)), axis="X")
    parts.append(new_object("KIT_PIPE_CLAMP_pipe", bm))
    # Block clamp body — rectangular block with a half-cylinder groove on top
    block_w = pipe_r * 2.4
    block_d = 0.05
    block_h = pipe_r * 1.4
    bm = bmesh.new()
    bm_add_box(bm, Vector((base_len, block_d, block_h)),
               center=Vector((0.0, 0.0, base_t + block_h * 0.5)))
    block = new_object("KIT_PIPE_CLAMP_block", bm)
    parts.append(block)
    # Bolt heads on top of the block
    bolt_r = 0.007
    for sx in (-1, 1):
        bm = bmesh.new()
        bm_add_cylinder(bm, bolt_r, 0.006, segments=8,
                        center=Vector((sx * base_len * 0.30, 0.0,
                                       base_t + block_h + 0.003)))
        parts.append(new_object(f"KIT_PIPE_CLAMP_bolt_{sx}", bm))
    obj = finish_many(parts, "KIT_PIPE_CLAMP_V02", mat="KitMat_Steel")
    return [obj]


def _pipe_standoff_junction(r):
    """Stand-off loop clamp + small junction box at one end."""
    pipe_r = round(r.uniform(0.025, 0.060), 4)
    base_len = round(r.uniform(0.22, 0.32), 4)
    base_t = 0.014
    parts = [_pipe_clamp_base(base_len, base_t)]
    # Pipe
    bm = bmesh.new()
    bm_add_cylinder(bm, pipe_r, base_len * 0.7, segments=14,
                    center=Vector((-base_len * 0.15, 0.0, base_t + pipe_r)),
                    axis="X")
    parts.append(new_object("KIT_PIPE_CLAMP_pipe", bm))
    # Stand-off loop (full torus around the pipe)
    bm = bmesh.new()
    bm_add_torus_segment(bm, major_radius=pipe_r + 0.005, minor_radius=0.005,
                         major_segments=12, minor_segments=5,
                         angle_span=math.tau,
                         center=Vector((-base_len * 0.15, 0.0, base_t + pipe_r)))
    loop = new_object("KIT_PIPE_CLAMP_loop", bm)
    loop.rotation_euler = (0.0, math.radians(90), 0.0)
    parts.append(loop)
    # Junction box at one end
    jb_w = 0.060
    jb_d = 0.045
    jb_h = 0.040
    bm = bmesh.new()
    bm_add_box(bm, Vector((jb_w, jb_d, jb_h)),
               center=Vector((base_len * 0.35, 0.0, base_t + jb_h * 0.5)))
    parts.append(new_object("KIT_PIPE_CLAMP_junction", bm))
    # Small indicator cap on junction box (could be a cable gland)
    bm = bmesh.new()
    bm_add_cylinder(bm, 0.008, 0.010, segments=10,
                    center=Vector((base_len * 0.35 - jb_w * 0.5 - 0.005, 0.0,
                                   base_t + jb_h * 0.65)),
                    axis="Y")
    parts.append(new_object("KIT_PIPE_CLAMP_gland", bm))
    obj = finish_many(parts, "KIT_PIPE_CLAMP_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 11: armor_spacer ============================================== #
# --------------------------------------------------------------------------- #

@register_family("armor_spacer", variants=3)
def build_armor_spacer(variant: int, seed: int):
    """Standoff armor mounting. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _spacer_cylindrical_stubs(r)
    if variant == 2:
        return _spacer_honeycomb_strip(r)
    if variant == 3:
        return _spacer_rail_mounted(r)
    raise ValueError(f"armor_spacer: bad variant {variant}")


def _spacer_base(length, base_t=0.010):
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, 0.06, base_t)),
               center=Vector((0.0, 0.0, base_t * 0.5)))
    return new_object("KIT_ARMOR_SPACER_base", bm)


def _spacer_cylindrical_stubs(r):
    """Row of cylindrical stubs standing up from a base rail."""
    length = round(r.uniform(0.20, 0.40), 4)
    base_t = 0.010
    stub_h = round(r.uniform(0.030, 0.060), 4)
    stub_r = round(r.uniform(0.010, 0.016), 4)
    pitch = round(r.uniform(0.05, 0.08), 4)
    n = max(3, int(length / pitch) - 1)
    n = min(n, 7)
    actual_pitch = length / (n + 1)
    parts = [_spacer_base(length, base_t)]
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_cylinder(bm, stub_r, stub_h, segments=10,
                        center=Vector((x, 0.0, base_t + stub_h * 0.5)))
        parts.append(new_object(f"KIT_ARMOR_SPACER_stub_{i:02d}", bm))
        # Cap detail — slightly wider disc at the top
        bm = bmesh.new()
        bm_add_cylinder(bm, stub_r * 1.25, 0.004, segments=10,
                        center=Vector((x, 0.0, base_t + stub_h - 0.002)))
        parts.append(new_object(f"KIT_ARMOR_SPACER_cap_{i:02d}", bm))
    obj = finish_many(parts, "KIT_ARMOR_SPACER_V01", mat="KitMat_Steel")
    return [obj]


def _spacer_honeycomb_strip(r):
    """Honeycomb strip — row of hexagonal cells standing on a base."""
    length = round(r.uniform(0.20, 0.40), 4)
    base_t = 0.010
    cell_h = round(r.uniform(0.030, 0.050), 4)
    cell_r = 0.018
    pitch = cell_r * 1.5
    n = max(3, int(length / pitch) - 1)
    n = min(n, 7)
    actual_pitch = length / (n + 1)
    parts = [_spacer_base(length, base_t)]
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        # Outer hex prism (cell wall) — hollow approximated by solid hex
        bm_add_prism(bm, sides=6, radius=cell_r, height=cell_h,
                     center=Vector((x, 0.0, base_t + cell_h * 0.5)))
        parts.append(new_object(f"KIT_ARMOR_SPACER_cell_{i:02d}", bm))
    obj = finish_many(parts, "KIT_ARMOR_SPACER_V02", mat="KitMat_Steel")
    return [obj]


def _spacer_rail_mounted(r):
    """Rail-mounted standoffs — base rail with two side rails holding standoffs."""
    length = round(r.uniform(0.25, 0.45), 4)
    base_t = 0.012
    stub_h = round(r.uniform(0.025, 0.050), 4)
    stub_r = 0.012
    rail_w = 0.014
    rail_h = 0.016
    parts = [_spacer_base(length, base_t)]
    # Two side rails running along the length
    for sy in (-1, 1):
        bm = bmesh.new()
        bm_add_box(bm, Vector((length, rail_w, rail_h)),
                   center=Vector((0.0, sy * 0.022, base_t + rail_h * 0.5)))
        parts.append(new_object(f"KIT_ARMOR_SPACER_rail_{'p' if sy > 0 else 'n'}", bm))
    # Standoff stubs mounted on top of the rails
    pitch = round(r.uniform(0.06, 0.09), 4)
    n = max(3, int(length / pitch) - 1)
    n = min(n, 6)
    actual_pitch = length / (n + 1)
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        for sy in (-1, 1):
            bm = bmesh.new()
            bm_add_cylinder(bm, stub_r, stub_h, segments=8,
                            center=Vector((x, sy * 0.022, base_t + rail_h + stub_h * 0.5)))
            parts.append(new_object(f"KIT_ARMOR_SPACER_stub_{i:02d}_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_ARMOR_SPACER_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 12: heat_shield =============================================== #
# --------------------------------------------------------------------------- #

@register_family("heat_shield", variants=3)
def build_heat_shield(variant: int, seed: int):
    """Engine-adjacent protection. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _heat_corrugated_blanket(r)
    if variant == 2:
        return _heat_rigid_scalloped(r)
    if variant == 3:
        return _heat_layered_foil_clips(r)
    raise ValueError(f"heat_shield: bad variant {variant}")


def _heat_corrugated_blanket(r):
    """Corrugated blanket panel — series of ridges across the face."""
    length = round(r.uniform(0.40, 0.90), 4)
    width = round(r.uniform(0.20, 0.40), 4)
    base_t = 0.012
    ridge_pitch = round(r.uniform(0.05, 0.08), 4)
    n = max(3, int(length / ridge_pitch) - 1)
    n = min(n, 10)
    actual_pitch = length / (n + 1)
    ridge_h = 0.014
    parts = []
    # Base panel
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, base_t)),
               center=Vector((0.0, 0.0, base_t * 0.5)))
    parts.append(new_object("KIT_HEAT_SHIELD_base", bm))
    # Corrugation ridges — triangular prisms along Y axis at intervals
    for i in range(n):
        x = -length * 0.5 + actual_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_triangular_prism(bm, a_len=actual_pitch * 0.45, b_len=ridge_h,
                                thickness=width * 0.95,
                                center=Vector((x - actual_pitch * 0.20, 0.0, base_t)))
        # Lay the prism on its side: rotate so triangle profile is in XZ plane
        ridge = new_object(f"KIT_HEAT_SHIELD_ridge_{i:02d}", bm)
        ridge.rotation_euler = (math.radians(90), 0.0, 0.0)
        _mark_no_bevel(ridge)  # corrugations are surface texture, not structure
        parts.append(ridge)
    # Mounting frame around edges
    fw = 0.012
    fh = 0.010
    for axis in ("x", "y"):
        for sy in (-1, 1):
            bm = bmesh.new()
            if axis == "x":
                bm_add_box(bm, Vector((fw, width, fh)),
                           center=Vector((sy * (length * 0.5 - fw * 0.5), 0.0,
                                          base_t + fh * 0.5)))
            else:
                bm_add_box(bm, Vector((length, fw, fh)),
                           center=Vector((0.0, sy * (width * 0.5 - fw * 0.5),
                                          base_t + fh * 0.5)))
            parts.append(new_object(f"KIT_HEAT_SHIELD_frame_{axis}_{'p' if sy > 0 else 'n'}", bm))
    obj = finish_many(parts, "KIT_HEAT_SHIELD_V01", mat="KitMat_Steel")
    return [obj]


def _heat_rigid_scalloped(r):
    """Rigid scalloped plate — semicircular cutouts along the engine-facing edge."""
    length = round(r.uniform(0.40, 0.90), 4)
    width = round(r.uniform(0.25, 0.50), 4)
    plate_t = 0.018
    scallop_r = round(r.uniform(0.025, 0.045), 4)
    n_scallops = max(3, int(length / (scallop_r * 2.2)))
    n_scallops = min(n_scallops, 9)
    actual_pitch = length / n_scallops
    parts = []
    # Main plate
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    plate = new_object("KIT_HEAT_SHIELD_plate", bm)
    parts.append(plate)
    # Reinforcement ribs across the back
    rib_w = 0.014
    rib_h = 0.020
    n_ribs = max(2, int(length / 0.18))
    n_ribs = min(n_ribs, 5)
    rib_pitch = length / (n_ribs + 1)
    for i in range(n_ribs):
        x = -length * 0.5 + rib_pitch * (i + 1)
        bm = bmesh.new()
        bm_add_box(bm, Vector((rib_w, width * 0.85, rib_h)),
                   center=Vector((x, 0.0, plate_t + rib_h * 0.5)))
        parts.append(new_object(f"KIT_HEAT_SHIELD_rib_{i:02d}", bm))
    obj = finish_many(parts, "KIT_HEAT_SHIELD_assembly", mat="KitMat_Steel")
    # Scallops — semicircular cutouts on the +Y edge
    cutters = []
    for i in range(n_scallops):
        x = -length * 0.5 + actual_pitch * (i + 0.5)
        cbm = bmesh.new()
        bm_add_cylinder(cbm, scallop_r, plate_t * 3.0, segments=12,
                        center=Vector((x, width * 0.5, plate_t * 0.5)))
        cutters.append(new_object(f"_scallop_cutter_{i}", cbm))
    for c in cutters:
        boolean_subtract(obj, c)
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    smart_uv(obj)
    obj.name = "KIT_HEAT_SHIELD_V02"
    obj.data.name = "KIT_HEAT_SHIELD_V02_mesh"
    return [obj]


def _heat_layered_foil_clips(r):
    """Layered foil with clips — thin panel with retaining clips at edges."""
    length = round(r.uniform(0.40, 0.90), 4)
    width = round(r.uniform(0.25, 0.40), 4)
    plate_t = 0.010
    clip_pitch = round(r.uniform(0.15, 0.25), 4)
    n_clips = max(2, int(length / clip_pitch))
    n_clips = min(n_clips, 5)
    actual_pitch = length / (n_clips + 1)
    parts = []
    # Outer foil layer
    bm = bmesh.new()
    bm_add_box(bm, Vector((length, width, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    parts.append(new_object("KIT_HEAT_SHIELD_foil", bm))
    # Inner foil layer (slightly smaller, offset down)
    bm = bmesh.new()
    bm_add_box(bm, Vector((length - 0.020, width - 0.020, plate_t * 0.7)),
               center=Vector((0.0, 0.0, plate_t + plate_t * 0.35)))
    parts.append(new_object("KIT_HEAT_SHIELD_inner", bm))
    # Retaining clips along both long edges
    clip_w = 0.020
    clip_d = 0.018
    clip_h = 0.014
    for sy in (-1, 1):
        for i in range(n_clips):
            x = -length * 0.5 + actual_pitch * (i + 1)
            bm = bmesh.new()
            bm_add_box(bm, Vector((clip_w, clip_d, clip_h)),
                       center=Vector((x, sy * (width * 0.5 - clip_d * 0.5),
                                      plate_t + clip_h * 0.5)))
            clip = new_object(f"KIT_HEAT_SHIELD_clip_{sy}_{i:02d}", bm)
            _mark_no_bevel(clip)  # small clip detail, no per-clip bevel needed
            parts.append(clip)
    obj = finish_many(parts, "KIT_HEAT_SHIELD_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 13: weapon_collar ============================================= #
# --------------------------------------------------------------------------- #

@register_family("weapon_collar", variants=3)
def build_weapon_collar(variant: int, seed: int):
    """Weapon root reinforcement. Origin at the mount plane, +Z = weapon axis."""
    r = _rng(seed)
    if variant == 1:
        return _weapon_bolted_flange(r)
    if variant == 2:
        return _weapon_clamshell(r)
    if variant == 3:
        return _weapon_recoil_struts(r)
    raise ValueError(f"weapon_collar: bad variant {variant}")


def _weapon_bolted_flange(r):
    """Bolted flange ring — flat annular plate with bolts around the rim."""
    outer_r = round(r.uniform(0.10, 0.20), 4)
    inner_r = outer_r * 0.55
    flange_t = 0.020
    bolt_r = 0.009
    n_bolts = max(6, int(outer_r * math.tau / 0.07))
    n_bolts = min(n_bolts, 12)
    parts = []
    # Outer disc with center hole — solid cylinder minus inner cylinder
    bm = bmesh.new()
    bm_add_cylinder(bm, outer_r, flange_t, segments=18,
                    center=Vector((0.0, 0.0, flange_t * 0.5)))
    flange = new_object("KIT_WEAPON_COLLAR_flange", bm)
    cbm = bmesh.new()
    bm_add_cylinder(cbm, inner_r, flange_t * 3.0, segments=16,
                    center=Vector((0.0, 0.0, flange_t * 0.5)))
    cutter = new_object("_flange_cutter", cbm)
    boolean_subtract(flange, cutter)
    assign_material(flange, "KitMat_Steel")
    # Bevel the flange (curved part already, but its outer rim is structural)
    add_bevel(flange, width=0.004)
    flange["kitgen_bevel_applied"] = True
    add_weighted_normals(flange)
    apply_transforms(flange)
    parts.append(flange)
    # Bolts around the rim
    bolt_r_radius = (outer_r + inner_r) * 0.5
    for i in range(n_bolts):
        a = (i / n_bolts) * math.tau
        x = math.cos(a) * bolt_r_radius
        y = math.sin(a) * bolt_r_radius
        bm = bmesh.new()
        bm_add_cylinder(bm, bolt_r, 0.008, segments=8,
                        center=Vector((x, y, flange_t + 0.004)))
        bolt = new_object(f"KIT_WEAPON_COLLAR_bolt_{i:02d}", bm)
        _mark_no_bevel(bolt)
        parts.append(bolt)
    obj = finish_many(parts, "KIT_WEAPON_COLLAR_V01", mat="KitMat_Steel")
    return [obj]


def _weapon_clamshell(r):
    """Clamshell clamp — two half-rings meeting at a seam, hinged on one side,
    latched on the other. Proxy: full ring with two seam plates on opposite
    sides."""
    outer_r = round(r.uniform(0.10, 0.18), 4)
    inner_r = outer_r * 0.55
    ring_t = 0.020
    seam_w = 0.022
    seam_h = 0.024
    parts = []
    # Outer ring
    bm = bmesh.new()
    bm_add_cylinder(bm, outer_r, ring_t, segments=20,
                    center=Vector((0.0, 0.0, ring_t * 0.5)))
    ring = new_object("KIT_WEAPON_COLLAR_ring", bm)
    cbm = bmesh.new()
    bm_add_cylinder(cbm, inner_r, ring_t * 3.0, segments=18,
                    center=Vector((0.0, 0.0, ring_t * 0.5)))
    cutter = new_object("_ring_cutter", cbm)
    boolean_subtract(ring, cutter)
    assign_material(ring, "KitMat_Steel")
    smallest = max(1e-6, min(ring.dimensions))
    if smallest >= 0.012:
        w = max(0.004, min(0.010, smallest * 0.25))
        add_bevel(ring, width=w)
        ring["kitgen_bevel_applied"] = True
    add_weighted_normals(ring)
    apply_transforms(ring)
    parts.append(ring)
    # Two seam plates (hinge side + latch side)
    for sx in (-1, 1):
        cx = sx * outer_r
        bm = bmesh.new()
        bm_add_box(bm, Vector((seam_w, seam_h * 1.4, seam_h)),
                   center=Vector((cx, 0.0, ring_t + seam_h * 0.5)))
        seam = new_object(f"KIT_WEAPON_COLLAR_seam_{'p' if sx > 0 else 'n'}", bm)
        parts.append(seam)
        # Bolt pair on each seam plate
        for sy in (-1, 1):
            bm = bmesh.new()
            bm_add_cylinder(bm, 0.006, 0.006, segments=8,
                            center=Vector((cx, sy * seam_h * 0.45,
                                           ring_t + seam_h + 0.003)))
            bolt = new_object(f"KIT_WEAPON_COLLAR_bolt_{sx}_{sy}", bm)
            _mark_no_bevel(bolt)
            parts.append(bolt)
    obj = finish_many(parts, "KIT_WEAPON_COLLAR_V02", mat="KitMat_Steel")
    return [obj]


def _weapon_recoil_struts(r):
    """Recoil-brace struts — central ring with angled struts radiating to feet."""
    ring_r = round(r.uniform(0.05, 0.09), 4)
    inner_r = ring_r * 0.55
    ring_t = 0.018
    foot_r = round(r.uniform(0.14, 0.20), 4)
    n_struts = max(3, min(5, int(r.uniform(3, 5))))
    parts = []
    # Central ring (no per-segment bevel — curved surface already reads as
    # rounded at gameplay distance; beveling the rim would explode tris)
    bm = bmesh.new()
    bm_add_cylinder(bm, ring_r, ring_t, segments=14,
                    center=Vector((0.0, 0.0, ring_t * 0.5)))
    ring = new_object("KIT_WEAPON_COLLAR_ring", bm)
    cbm = bmesh.new()
    bm_add_cylinder(cbm, inner_r, ring_t * 3.0, segments=12,
                    center=Vector((0.0, 0.0, ring_t * 0.5)))
    cutter = new_object("_center_cutter", cbm)
    boolean_subtract(ring, cutter)
    assign_material(ring, "KitMat_Steel")
    add_weighted_normals(ring)
    apply_transforms(ring)
    _mark_no_bevel(ring)
    parts.append(ring)
    # Angled struts + feet
    strut_w = 0.018
    strut_d = 0.012
    foot_w = 0.040
    foot_d = 0.025
    foot_t = 0.012
    for i in range(n_struts):
        a = (i / n_struts) * math.tau
        ca, sa = math.cos(a), math.sin(a)
        # Strut — positioned between ring and foot, oriented radially
        mid_r = (ring_r + foot_r) * 0.5
        strut_len = foot_r - ring_r
        bm = bmesh.new()
        bm_add_box(bm, Vector((strut_len, strut_w, strut_d)))
        strut = new_object(f"KIT_WEAPON_COLLAR_strut_{i:02d}", bm)
        strut.location = Vector((ca * mid_r, sa * mid_r, strut_d * 0.5))
        strut.rotation_euler = (0.0, 0.0, math.atan2(sa, ca))
        _mark_no_bevel(strut)  # thin brace, bevels on struts would explode tris
        parts.append(strut)
        # Foot pad at outer radius
        bm = bmesh.new()
        bm_add_box(bm, Vector((foot_w, foot_d, foot_t)),
                   center=Vector((ca * foot_r, sa * foot_r, foot_t * 0.5)))
        foot = new_object(f"KIT_WEAPON_COLLAR_foot_{i:02d}", bm)
        parts.append(foot)
        # Bolt on foot
        bm = bmesh.new()
        bm_add_cylinder(bm, 0.007, 0.006, segments=8,
                        center=Vector((ca * foot_r, sa * foot_r, foot_t + 0.003)))
        bolt = new_object(f"KIT_WEAPON_COLLAR_footbolt_{i:02d}", bm)
        _mark_no_bevel(bolt)
        parts.append(bolt)
    obj = finish_many(parts, "KIT_WEAPON_COLLAR_V03", mat="KitMat_Steel")
    return [obj]


# --------------------------------------------------------------------------- #
# === FAMILY 14: sensor_housing ============================================ #
# --------------------------------------------------------------------------- #

@register_family("sensor_housing", variants=3)
def build_sensor_housing(variant: int, seed: int):
    """Instruments that face space. Origin at the mount plane, +Z out of surface."""
    r = _rng(seed)
    if variant == 1:
        return _sensor_canted_lens(r)
    if variant == 2:
        return _sensor_mast_dish(r)
    if variant == 3:
        return _sensor_conformal_blister(r)
    raise ValueError(f"sensor_housing: bad variant {variant}")


def _sensor_canted_lens(r):
    """Canted lens box — tilted housing with a lens cylinder on the upper face."""
    base_w = round(r.uniform(0.12, 0.20), 4)
    base_d = round(r.uniform(0.10, 0.16), 4)
    base_h = round(r.uniform(0.10, 0.16), 4)
    lens_r = min(base_w, base_d) * 0.30
    parts = []
    # Base mounting plate
    plate_t = 0.012
    bm = bmesh.new()
    bm_add_box(bm, Vector((base_w * 1.2, base_d * 1.2, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    parts.append(new_object("KIT_SENSOR_HOUSING_base", bm))
    # Housing box (canted = tilted forward)
    bm = bmesh.new()
    bm_add_box(bm, Vector((base_w, base_d, base_h)),
               center=Vector((0.0, 0.0, plate_t + base_h * 0.5)))
    housing = new_object("KIT_SENSOR_HOUSING_box", bm)
    # Tilt forward 15° about X (so the top face points up-and-forward)
    housing.rotation_euler = (math.radians(-15), 0.0, 0.0)
    housing.location = Vector((0.0, -base_d * 0.10, plate_t + base_h * 0.5))
    parts.append(housing)
    # Lens cylinder on the canted top face
    bm = bmesh.new()
    bm_add_cylinder(bm, lens_r, 0.012, segments=14,
                    center=Vector((0.0, 0.0, plate_t + base_h + 0.006)))
    lens = new_object("KIT_SENSOR_HOUSING_lens", bm)
    # Rotate with the housing so lens sits on the canted top
    lens.rotation_euler = (math.radians(-15), 0.0, 0.0)
    lens.location = Vector((0.0, -base_d * 0.10, plate_t + base_h * 0.5 + base_h * 0.5 + 0.006))
    _mark_no_bevel(lens)
    parts.append(lens)
    obj = finish_many(parts, "KIT_SENSOR_HOUSING_V01", mat="KitMat_Paint")
    return [obj]


def _sensor_mast_dish(r):
    """Mast with dish — vertical cylinder mast topped by a shallow parabolic dish."""
    mast_h = round(r.uniform(0.18, 0.35), 4)
    mast_r = round(r.uniform(0.010, 0.018), 4)
    dish_r = round(r.uniform(0.05, 0.10), 4)
    parts = []
    # Base plate
    plate_w = max(0.10, dish_r * 1.5)
    plate_t = 0.012
    bm = bmesh.new()
    bm_add_box(bm, Vector((plate_w, plate_w, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    parts.append(new_object("KIT_SENSOR_HOUSING_base", bm))
    # Mast
    bm = bmesh.new()
    bm_add_cylinder(bm, mast_r, mast_h, segments=12,
                    center=Vector((0.0, 0.0, plate_t + mast_h * 0.5)))
    mast = new_object("KIT_SENSOR_HOUSING_mast", bm)
    _mark_no_bevel(mast)
    parts.append(mast)
    # Dish — shallow truncated cone (open top)
    bm = bmesh.new()
    # Outer rim ring (torus segment)
    bm_add_torus_segment(bm, major_radius=dish_r * 0.85, minor_radius=0.005,
                         major_segments=18, minor_segments=5,
                         angle_span=math.tau,
                         center=Vector((0.0, 0.0, plate_t + mast_h)))
    # Dish body — shallow cone from rim down to apex
    seg = 18
    apex_z = plate_t + mast_h - dish_r * 0.30
    rim_z = plate_t + mast_h
    apex_vert = bm.verts.new((0.0, 0.0, apex_z))
    rim_verts = []
    for i in range(seg):
        a = (i / seg) * math.tau
        rim_verts.append(bm.verts.new((math.cos(a) * dish_r * 0.85,
                                       math.sin(a) * dish_r * 0.85, rim_z)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([rim_verts[i], rim_verts[j], apex_vert])
    bm.normal_update()
    dish = new_object("KIT_SENSOR_HOUSING_dish", bm)
    _mark_no_bevel(dish)
    parts.append(dish)
    obj = finish_many(parts, "KIT_SENSOR_HOUSING_V02", mat="KitMat_Paint")
    return [obj]


def _sensor_conformal_blister(r):
    """Conformal blister — low dome mounted flush with a small instrument bezel."""
    blister_r = round(r.uniform(0.08, 0.18), 4)
    blister_h = blister_r * 0.35
    bezel_r = blister_r * 0.45
    parts = []
    # Mounting plate
    plate_w = blister_r * 2.4
    plate_t = 0.012
    bm = bmesh.new()
    bm_add_box(bm, Vector((plate_w, plate_w, plate_t)),
               center=Vector((0.0, 0.0, plate_t * 0.5)))
    parts.append(new_object("KIT_SENSOR_HOUSING_base", bm))
    # Bezel ring (slightly raised rim)
    bm = bmesh.new()
    bm_add_cylinder(bm, bezel_r * 1.25, 0.008, segments=18,
                    center=Vector((0.0, 0.0, plate_t + 0.004)))
    bezel = new_object("KIT_SENSOR_HOUSING_bezel", bm)
    _mark_no_bevel(bezel)
    parts.append(bezel)
    # Blister (low dome)
    bm = bmesh.new()
    bm_add_dome(bm, blister_r, blister_h, segments=16, ring_count=3,
                center=Vector((0.0, 0.0, plate_t + 0.008)))
    blister = new_object("KIT_SENSOR_HOUSING_blister", bm)
    _mark_no_bevel(blister)
    parts.append(blister)
    # Small lens detail at the center (slightly recessed look via dark cylinder)
    bm = bmesh.new()
    bm_add_cylinder(bm, bezel_r * 0.55, 0.004, segments=12,
                    center=Vector((0.0, 0.0, plate_t + 0.008 + blister_h * 0.85)))
    lens = new_object("KIT_SENSOR_HOUSING_lens", bm)
    _mark_no_bevel(lens)
    parts.append(lens)
    obj = finish_many(parts, "KIT_SENSOR_HOUSING_V03", mat="KitMat_Paint")
    return [obj]
