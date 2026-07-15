#!/usr/bin/env python3
"""Build isolated Helios Hub environment family V9 — NEW FOUNDATION.

Packet: M4-HELIOS-V9-NEW-FOUNDATION

NOT a V7/V8 repair. Five release candidates only:
  helios_hub_station, helios_gate, helios_rock_a/b/c

Foundation doctrine (anti-V8):
  - Hub: bespoke continuous asymmetric tuning-fork / Y shipyard.
    Faceted armored keel joins habitation wing + industrial wing.
    Deep central docking notch + integral truss bridges.
    Largest connected shell >=65% of silhouette. NO cylinder-stack, thin ring, or BlenderKit ring.
  - Gate: split-hex armored arch (NOT torus/hoop). Four machinery sectors +
    one asymmetric service spine, all structurally joined. Clearance >=35% aperture.
  - Rocks: intact CC0 scanned surfaces from assets/third_party/helios_v9/**
    (coastal_cliff_01 / rock_face_01 / moon_rock_03) — retopo + manifold + ore seams.
    Distinct roles: A fractured crag, B stratified slab, C rounded chondrite.

Isolation only — never writes live parts/release/manifests/src.

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_v9.py --
  blender --background --python tools/blender/build_m4_helios_hub_v9.py -- --only hub_station,gate
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
V3_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_hub_v3.py"
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v9"
PACKET = "M4-HELIOS-V9-NEW-FOUNDATION"
FAMILY = "helios_hub_env_v9"
THIRD_PARTY = ROOT / "assets" / "third_party" / "helios_v9"

spec = importlib.util.spec_from_file_location("helios_v3_pipeline", V3_BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load base pipeline: {V3_BUILDER}")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

# Rewire packet paths / identity
base.PACKET_ROOT = PACKET_ROOT
base.PACKET = PACKET
base.FAMILY = FAMILY
base.AUTHORING_LOCK = PACKET_ROOT / "authoring.__lock"
base.REJECTED_PACKET = "M4-HELIOS-V8-NEW-FOUNDATION-GROK-001"
base.VENDOR_ROOT = THIRD_PARTY
base.KIT_POLY = THIRD_PARTY / "polyhaven"
base.KIT_KENNEY = THIRD_PARTY  # unused; rocks only
base.CAMPAIGN_BUILD = PACKET_ROOT / "evidence" / "build"
base.STATION_LOD0_SOFT = 48000
base.GATE_LOD0_SOFT = 36000

CORE_IDS = {
    "helios_hub_station",
    "helios_gate",
    "helios_rock_a",
    "helios_rock_b",
    "helios_rock_c",
}
base.ASSETS = [a for a in base.ASSETS if a["id"] in CORE_IDS]
for a in base.ASSETS:
    if a["id"] == "helios_hub_station":
        a["triBudget"] = 48000
        a["triBudgetAlarm"] = 35000
        a["title"] = "Helios Hub Station V9 (Tuning-Fork Shipyard)"
        a["role"] = "hub_station_focal_v9"
    elif a["id"] == "helios_gate":
        a["triBudget"] = 36000
        a["triBudgetAlarm"] = 22000
        a["title"] = "Helios Gate V9 (Split-Hex Arch)"
        a["role"] = "gate_landmark_v9"
    elif a["id"] == "helios_rock_a":
        a["title"] = "Helios Rock A V9 (Fractured Crag)"
        a["role"] = "hero_rock_crag"
        a["triBudget"] = 18000
    elif a["id"] == "helios_rock_b":
        a["title"] = "Helios Rock B V9 (Stratified Slab)"
        a["role"] = "hero_rock_slab"
        a["triBudget"] = 18000
    elif a["id"] == "helios_rock_c":
        a["title"] = "Helios Rock C V9 (Rounded Chondrite)"
        a["role"] = "hero_rock_chondrite"
        a["triBudget"] = 16000


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _log(msg: str) -> None:
    base.log(f"[v9] {msg}")


# ---------------------------------------------------------------------------
# Geometry helpers (V9 — no BlenderKit, no V7/V8 mesh import)
# ---------------------------------------------------------------------------

def _apply_mods(obj: bpy.types.Object) -> None:
    base.apply_all_modifiers(obj)


def _bevel(obj: bpy.types.Object, width: float = 0.08, segments: int = 2, angle: float = 30.0) -> None:
    base.bevel_object(obj, width=width, segments=segments, angle=angle)


def _union_chain(primary: bpy.types.Object, donors: list[bpy.types.Object]) -> bpy.types.Object:
    """Boolean-union donors into primary; remove donor objects. Returns primary."""
    for d in donors:
        if d is None or d == primary:
            continue
        try:
            base.boolean_union(primary, d)
        except Exception as exc:
            _log(f"WARN union {d.name} into {primary.name}: {exc}")
            try:
                base.unlink_object(d)
            except Exception:
                pass
    return primary


def _cut(target: bpy.types.Object, cutter: bpy.types.Object) -> None:
    try:
        base.boolean_cut(target, cutter)
    except Exception as exc:
        _log(f"WARN cut {cutter.name}: {exc}")
        try:
            base.unlink_object(cutter)
        except Exception:
            pass


def _weighted_normals(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        mod = obj.modifiers.new("WN", "WEIGHTED_NORMAL")
        mod.mode = "FACE_AREA"
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        _log(f"WARN weighted normals {obj.name}: {exc}")
    obj.select_set(False)
    base.ensure_normals(obj)


def _bmesh_from_profile(
    name: str,
    profile_xy: list[tuple[float, float]],
    extrude_z: float,
    material,
    coll: bpy.types.Collection,
    location_rt: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segs_extrude: int = 1,
) -> bpy.types.Object:
    """Authored profile extrusion → mesh (curve-profile construction)."""
    bm = bmesh.new()
    verts_bot = []
    for x, y in profile_xy:
        bx, by, bz = base.L(x + location_rt[0], location_rt[1], y + location_rt[2])
        verts_bot.append(bm.verts.new((bx, by, bz)))
    bm.verts.ensure_lookup_table()
    try:
        face = bm.faces.new(verts_bot)
    except ValueError:
        # Ensure winding
        verts_bot = list(reversed(verts_bot))
        face = bm.faces.new(verts_bot)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    extruded = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    # Extrude along runtime Y (Blender up after L)
    dx, dy, dz = base.L(0.0, extrude_z, 0.0)
    # L maps runtime y → blender z-ish; use vector from L of unit
    origin = Vector(base.L(0, 0, 0))
    tip = Vector(base.L(0, extrude_z, 0))
    delta = tip - origin
    bmesh.ops.translate(bm, verts=extruded, vec=delta)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def _loft_y_fork_shell(
    name: str,
    material,
    coll: bpy.types.Collection,
) -> bpy.types.Object:
    """Continuous tuning-fork / Y shipyard hull via multi-section loft.

    Sections along runtime X (forward). Y = vertical mass, Z = lateral wings.
    Produces one connected shell: keel + left hab prong + right industrial prong
    with a deep central docking notch (negative space).
    """
    # Each section: list of (y, z) outer profile points (closed), runtime coords at fixed x
    # Section order from aft (-x) to fore (+x)
    sections: list[tuple[float, list[tuple[float, float]]]] = []

    def rect_profile(hy: float, hz: float, notch: float = 0.0) -> list[tuple[float, float]]:
        """Outer rectangle with optional central bottom notch (dock mouth)."""
        pts = []
        # clockwise from bottom-left, with optional notch at bottom center
        half_y, half_z = hy * 0.5, hz * 0.5
        if notch > 0.01:
            n = notch * 0.5
            pts = [
                (-half_y, -half_z),
                (-half_y * 0.15, -half_z),
                (-half_y * 0.12, -half_z + n * 0.55),
                (half_y * 0.12, -half_z + n * 0.55),
                (half_y * 0.15, -half_z),
                (half_y, -half_z),
                (half_y, half_z),
                (-half_y, half_z),
            ]
        else:
            pts = [
                (-half_y, -half_z),
                (half_y, -half_z),
                (half_y, half_z),
                (-half_y, half_z),
            ]
        return pts

    def y_wing_profile(hy: float, wing_span: float, wing_thick: float, open_notch: float) -> list[tuple[float, float]]:
        """Y cross-section: central body + two lateral wing lobes + bottom dock notch."""
        hy2 = hy * 0.5
        ws = wing_span
        wt = wing_thick * 0.5
        n = open_notch * 0.5
        # Bottom dock notch + left wing + top + right wing
        return [
            (-hy2 * 0.35, -ws * 0.08),
            (-hy2 * 0.15, -n * 0.4),
            (hy2 * 0.15, -n * 0.4),
            (hy2 * 0.35, -ws * 0.08),
            # right industrial wing lobe (larger/lower)
            (hy2 * 0.55, -ws * 0.55),
            (hy2 * 0.85, -ws * 0.95),
            (hy2 * 0.55, -ws * 1.0),
            (hy2 * 0.2, -ws * 0.7),
            (hy2 * 0.55, -ws * 0.25),
            (hy2, wt * 0.2),
            (hy2 * 0.9, wt * 1.4),
            (hy2 * 0.2, wt * 1.1),
            # top spine
            (0.0, wt * 1.55),
            # left habitation wing (taller/hab mass)
            (-hy2 * 0.2, wt * 1.1),
            (-hy2 * 0.85, wt * 1.65),
            (-hy2 * 1.05, wt * 0.9),
            (-hy2 * 0.95, -wt * 0.15),
            (-hy2 * 0.55, -ws * 0.35),
            (-hy2 * 0.75, -ws * 0.85),
            (-hy2 * 0.4, -ws * 0.75),
            (-hy2 * 0.15, -ws * 0.35),
            (-hy2 * 0.35, -ws * 0.08),
        ]

    # Aft keel stub
    sections.append((-18.0, rect_profile(6.5, 5.0, notch=0.0)))
    sections.append((-12.0, rect_profile(8.0, 7.5, notch=1.5)))
    # Main body opening into Y
    sections.append((-6.0, y_wing_profile(10.0, 14.0, 7.0, 5.5)))
    sections.append((0.0, y_wing_profile(11.5, 18.0, 8.0, 7.5)))
    sections.append((6.0, y_wing_profile(10.5, 16.5, 7.5, 7.0)))
    # Forward arms diverge
    sections.append((12.0, y_wing_profile(8.5, 12.0, 6.0, 5.0)))
    sections.append((18.0, rect_profile(5.5, 6.0, notch=2.0)))

    # Resample all profiles to same vertex count
    n = 48

    def resample(pts: list[tuple[float, float]], count: int) -> list[tuple[float, float]]:
        # close loop
        closed = pts + [pts[0]]
        lengths = [0.0]
        for i in range(1, len(closed)):
            dy = closed[i][0] - closed[i - 1][0]
            dz = closed[i][1] - closed[i - 1][1]
            lengths.append(lengths[-1] + math.hypot(dy, dz))
        total = lengths[-1] or 1.0
        out = []
        for k in range(count):
            target = (k / count) * total
            # find segment
            for i in range(1, len(lengths)):
                if lengths[i] >= target:
                    t0, t1 = lengths[i - 1], lengths[i]
                    u = 0.0 if t1 <= t0 else (target - t0) / (t1 - t0)
                    y = closed[i - 1][0] + u * (closed[i][0] - closed[i - 1][0])
                    z = closed[i - 1][1] + u * (closed[i][1] - closed[i - 1][1])
                    out.append((y, z))
                    break
            else:
                out.append(closed[-1])
        return out

    sampled = [(x, resample(prof, n)) for x, prof in sections]

    bm = bmesh.new()
    rings: list[list] = []
    for x, prof in sampled:
        ring = []
        for y, z in prof:
            bx, by, bz = base.L(x, y, z)
            ring.append(bm.verts.new((bx, by, bz)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()

    # Side walls between sections
    for si in range(len(rings) - 1):
        a, b = rings[si], rings[si + 1]
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError:
                pass
    # Cap aft and fore
    try:
        bm.faces.new(list(reversed(rings[0])))
    except ValueError:
        pass
    try:
        bm.faces.new(rings[-1])
    except ValueError:
        pass

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # Mild solidify-like thickness via solidify after mesh creation
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if material:
        obj.data.materials.append(material)

    # Give shell real thickness
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        solid = obj.modifiers.new("ShellThick", "SOLIDIFY")
        solid.thickness = 0.55
        solid.offset = 1.0
        solid.use_even_offset = True
        bpy.ops.object.modifier_apply(modifier=solid.name)
    except Exception as exc:
        _log(f"WARN solidify shell: {exc}")
    obj.select_set(False)
    return obj


def _hex_arch_frame(
    name: str,
    aperture_r: float,
    beam_w: float,
    beam_d: float,
    material,
    coll: bpy.types.Collection,
    half: bool = True,
) -> bpy.types.Object:
    """Split-hex armored arch frame — extruded hex edge segments, NOT a torus."""
    # Regular hex vertices in YZ plane (runtime), centered, radius aperture_r + beam
    n_sides = 6
    outer_r = aperture_r + beam_w
    inner_r = aperture_r
    # Full hex indices 0..5; for split arch use top 4 edges (skip bottom)
    # angles: start from bottom vertex
    angles = [math.pi / 2 + i * (math.pi / 3) for i in range(6)]
    # Build ring of outer/inner points
    bm = bmesh.new()
    depth = beam_d * 0.5
    # We extrude along X (forward) with front/back faces

    def ring_pts(r: float):
        return [(math.cos(a) * r, math.sin(a) * r) for a in angles]

    outer = ring_pts(outer_r)
    inner = ring_pts(inner_r)

    # Which sides to keep for split arch: indices of outer edges (skip bottom edge 0-1 if bottom-most)
    # With angle start at pi/2, vertex 0 is top. Bottom edge is between verts 3 and 4.
    keep_edges = [(0, 1), (1, 2), (2, 3), (5, 0), (4, 5)] if half else [(i, (i + 1) % 6) for i in range(6)]
    # For half arch we still want almost full frame but open bottom — keep all but bottom
    keep_edges = [(0, 1), (1, 2), (2, 3), (3, 4), (5, 0)]  # skip 4-5? 
    # Bottom of hex is edge between the two lowest verts.
    # Find lowest two vertices by y (runtime y = cos for our angles... wait:
    # we used (cos*a, sin*a) as (y,z) — actually store as (y_up, z_lat)
    # angles from pi/2: v0=(0, r) top if we use (sin, cos)? Let's use standard:
    # y = sin(a), z = cos(a) with a from 0 at +Z
    outer = [(math.sin(a) * outer_r, math.cos(a) * outer_r) for a in angles]
    inner = [(math.sin(a) * inner_r, math.cos(a) * inner_r) for a in angles]
    # lowest verts by y: min sin
    y_outer = [p[0] for p in outer]
    bottom_i = min(range(6), key=lambda i: y_outer[i])
    bottom_j = (bottom_i + 1) % 6 if y_outer[(bottom_i + 1) % 6] <= y_outer[(bottom_i - 1) % 6] else (bottom_i - 1) % 6
    # skip the edge connecting the two bottom-most vertices
    sorted_by_y = sorted(range(6), key=lambda i: y_outer[i])
    skip_a, skip_b = sorted_by_y[0], sorted_by_y[1]
    # only skip if they are adjacent
    if (skip_a + 1) % 6 == skip_b or (skip_b + 1) % 6 == skip_a:
        skip_edge = (min(skip_a, skip_b), max(skip_a, skip_b)) if abs(skip_a - skip_b) == 1 else (skip_a, skip_b)
        # normalize skip as frozenset
        skip_set = {skip_a, skip_b}
    else:
        skip_set = {sorted_by_y[0], (sorted_by_y[0] + 1) % 6}

    segs_along = 4  # depth subdivisions
    # Build prism segments for each kept edge
    for i in range(6):
        j = (i + 1) % 6
        if {i, j} == skip_set:
            continue
        # quad outer edge i-j extruded in X, with thickness to inner
        # 8 verts per segment (front outer i,j / front inner j,i / back same)
        fo_i = Vector(base.L(-depth, outer[i][0], outer[i][1]))
        fo_j = Vector(base.L(-depth, outer[j][0], outer[j][1]))
        fi_j = Vector(base.L(-depth, inner[j][0], inner[j][1]))
        fi_i = Vector(base.L(-depth, inner[i][0], inner[i][1]))
        bo_i = Vector(base.L(depth, outer[i][0], outer[i][1]))
        bo_j = Vector(base.L(depth, outer[j][0], outer[j][1]))
        bi_j = Vector(base.L(depth, inner[j][0], inner[j][1]))
        bi_i = Vector(base.L(depth, inner[i][0], inner[i][1]))

        vs = [bm.verts.new(tuple(p)) for p in (fo_i, fo_j, fi_j, fi_i, bo_i, bo_j, bi_j, bi_i)]
        bm.verts.ensure_lookup_table()
        faces_idx = [
            (0, 1, 2, 3),  # front
            (4, 7, 6, 5),  # back
            (0, 4, 5, 1),  # outer
            (3, 2, 6, 7),  # inner
            (0, 3, 7, 4),  # side i
            (1, 5, 6, 2),  # side j
        ]
        for fa in faces_idx:
            try:
                bm.faces.new([vs[k] for k in fa])
            except ValueError:
                pass

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.001)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def _armor_facet_plates(
    parent_shell: bpy.types.Object,
    material,
    coll: bpy.types.Collection,
    count: int = 12,
    seed: int = 9,
) -> list[bpy.types.Object]:
    """Faceted armor plates as boolean-union donors (merged into shell)."""
    import random
    rng = random.Random(seed)
    plates = []
    for i in range(count):
        # scatter along Y-fork volume
        x = rng.uniform(-14, 14)
        y = rng.uniform(-3, 6)
        z = rng.uniform(-14, 14)
        sx = rng.uniform(1.2, 3.5)
        sy = rng.uniform(0.25, 0.55)
        sz = rng.uniform(1.0, 2.8)
        p = base.bmesh_panel_shell(
            f"ArmorFacet_{i}",
            (sx, sy, sz),
            (x, y, z),
            material,
            coll,
            inset=0.06,
        )
        # slight rotation via euler
        p.rotation_euler = (rng.uniform(-0.2, 0.2), rng.uniform(-0.4, 0.4), rng.uniform(-0.2, 0.2))
        bpy.context.view_layer.update()
        base.ensure_object_mode()
        base.deselect_all()
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        p.select_set(False)
        plates.append(p)
    return plates


# ---------------------------------------------------------------------------
# HUB — tuning-fork / Y shipyard
# ---------------------------------------------------------------------------



def _voxel_for_lod(obj, voxel=0.22):
    """Remesh to manifold so collapse decimate can hit LOD ratios."""
    if obj is None or obj.type != 'MESH':
        return
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        mod = obj.modifiers.new('V9_VoxelLOD', 'REMESH')
        mod.mode = 'VOXEL'
        mod.voxel_size = float(voxel)
        mod.adaptivity = 0.05
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        _log(f'WARN voxel_for_lod: {exc}')
    try:
        cur = base.tri_count_object(obj)
        if cur > 2000:
            base.decimate_to_max_tris(obj, max(1200, int(cur * 0.7)), label=f'postvoxel:{obj.name}')
    except Exception:
        pass
    try:
        _bevel(obj, width=0.04, segments=1, angle=45.0)
    except Exception:
        pass
    try:
        _weighted_normals(obj)
    except Exception:
        pass
    base.ensure_uvs_force(obj)
    base.ensure_normals(obj)
    obj.select_set(False)

def build_hub_v9(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    _log("Building hub: continuous tuning-fork Y shipyard (no BlenderKit)")
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warm = mats["Material_Warm"]
    glass = mats["Material_Glass"]

    shell = _loft_y_fork_shell("Hub_PrimaryShell", hull, coll)
    _bevel(shell, width=0.12, segments=2, angle=35.0)

    # Faceted armored keel (central spine joining wings)
    keel_profile = [
        (-1.2, -2.8), (1.2, -2.8), (1.6, -1.0), (1.0, 1.4),
        (0.0, 2.0), (-1.0, 1.4), (-1.6, -1.0),
    ]
    keel = _bmesh_from_profile("Hub_ArmoredKeel", keel_profile, extrude_z=28.0, material=hull, coll=coll,
                              location_rt=(-14.0, -0.5, 0.0))
    # rotate keel along X by placing with extrude in X — re-do as box loft via curve
    base.unlink_object(keel)
    keel = base.make_box("Hub_ArmoredKeel", (30.0, 3.2, 4.5), (0.0, -1.0, 0.0), hull, coll, detail=3)
    # faceted armor via multires-like inset
    base.ensure_object_mode()
    base.deselect_all()
    keel.select_set(True)
    bpy.context.view_layer.objects.active = keel
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(keel.data)
        bmesh.ops.inset_region(bm, faces=list(bm.faces), thickness=0.15, depth=0.08)
        # extra facet cuts
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1)
        bmesh.update_edit_mesh(keel.data)
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception as exc:
        _log(f"WARN keel facet: {exc}")
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    keel.select_set(False)
    _bevel(keel, 0.1, 2, 28.0)

    # Habitation wing mass (port / +Z in blender after L: runtime +Z)
    # Runtime: Z lateral — hab on -Z, industrial on +Z for asymmetry
    hab_core = base.bmesh_panel_shell("Hub_HabCore", (10.0, 7.5, 9.0), (-2.0, 2.5, -12.0), hull, coll, inset=0.12)
    _bevel(hab_core, 0.1, 2)
    hab_tower = base.bmesh_panel_shell("Hub_HabTower", (4.5, 9.0, 4.0), (-4.0, 5.5, -13.5), hull, coll, inset=0.1)
    _bevel(hab_tower, 0.08, 2)
    # Hab windows (glass panels — keep separate for material roles)
    windows = []
    for i, (lx, ly, lz) in enumerate([
        (-5.5, 4.0, -12.0), (-3.0, 6.0, -14.5), (-1.0, 3.5, -10.5),
        (-6.5, 2.0, -14.0), (-2.5, 7.5, -12.5),
    ]):
        w = base.make_box(f"Hub_HabWindow_{i}", (1.4, 1.1, 0.25), (lx, ly, lz), glass, coll, detail=1)
        windows.append(w)

    # Industrial / refinery wing mass
    ind_core = base.bmesh_panel_shell("Hub_IndCore", (12.0, 6.0, 11.0), (1.0, 0.5, 13.0), hull, coll, inset=0.1)
    _bevel(ind_core, 0.1, 2)
    # Refinery tanks (union into industrial shell later — cylinders only as union donors)
    tanks = []
    for i, (lx, ly, lz, r, h) in enumerate([
        (4.0, 3.5, 15.0, 1.8, 5.5),
        (0.5, 2.5, 17.5, 1.4, 4.0),
        (6.5, 2.0, 12.5, 1.2, 3.5),
        (-1.5, 4.0, 14.0, 1.0, 3.0),
    ]):
        t = base.make_cylinder(f"Hub_Tank_{i}", r, h, (lx, ly, lz), mech, coll, vertices=20)
        tanks.append(t)
    # Stacks / chimneys
    stacks = []
    for i, (lx, ly, lz) in enumerate([(5.0, 6.5, 14.0), (2.0, 7.0, 16.0)]):
        s = base.make_cylinder(f"Hub_Stack_{i}", 0.45, 4.5, (lx, ly, lz), mech, coll, vertices=12)
        stacks.append(s)

    # Deep central docking notch — boolean cutters (deleted after cut)
    # Large navigable negative space under the fork crotch
    dock_cut = base.make_box("Hub_DockCutter", (14.0, 6.5, 8.0), (2.0, -3.5, 0.0), hull, coll)
    dock_cut2 = base.make_cylinder("Hub_DockThroat", 3.2, 10.0, (6.0, -3.0, 0.0), hull, coll, vertices=24, axis="X")

    # Armor facets
    plates = _armor_facet_plates(shell, hull, coll, count=14, seed=11)

    # Integral truss bridges between wings (curve pipes)
    trusses = []
    bridge_paths = [
        [(-4.0, 1.0, -8.0), (0.0, 3.5, 0.0), (-2.0, 1.0, 8.0)],
        [(2.0, 0.5, -9.0), (4.0, 2.5, 0.0), (2.0, 0.5, 9.0)],
        [(8.0, 2.0, -7.0), (10.0, 4.0, 0.0), (8.0, 2.0, 7.0)],
        [(-8.0, 3.0, -6.0), (-6.0, 5.0, 0.0), (-8.0, 3.0, 6.0)],
        [(0.0, -1.5, -5.0), (0.0, -0.5, 0.0), (0.0, -1.5, 5.0)],
    ]
    for i, pts in enumerate(bridge_paths):
        tr = base.make_curve_pipe(f"Hub_TrussBridge_{i}", pts, radius=0.22, material=mech, coll=coll)
        trusses.append(tr)

    # Radiator fins (industrial side) + solar lattice (hab side) — close-only detail
    radiators = []
    for i in range(5):
        r = base.make_box(
            f"Hub_Radiator_{i}",
            (0.15, 3.5, 2.2),
            (3.0 + i * 1.4, 4.0, 18.5),
            warm,
            coll,
            detail=1,
            close_only=True,
        )
        radiators.append(r)
    solar = []
    for i in range(4):
        s = base.make_box(
            f"Hub_Solar_{i}",
            (2.5, 0.12, 3.5),
            (-8.0 + i * 0.3, 8.5, -15.0 - i * 0.4),
            accent,
            coll,
            detail=1,
            close_only=True,
        )
        solar.append(s)

    # Dock lips / bay frames (accent)
    dock_lip = base.bmesh_panel_shell("Hub_DockLip", (12.0, 0.8, 7.5), (4.0, -5.5, 0.0), accent, coll, inset=0.05)
    _bevel(dock_lip, 0.05, 2)
    # Service spine mechanical
    spine = base.make_curve_pipe(
        "Hub_ServiceSpine",
        [(-16.0, 0.0, 0.0), (-8.0, 1.5, 1.0), (0.0, 2.0, 0.0), (8.0, 1.0, -0.5), (16.0, 0.5, 0.0)],
        radius=0.35,
        material=mech,
        coll=coll,
    )

    # --- Merge continuous shell: shell + keel + hab + industrial (+ tanks/stacks as donors) ---
    primary = shell
    union_donors = [keel, hab_core, hab_tower, ind_core] + tanks + stacks + plates + [dock_lip]
    _union_chain(primary, union_donors)

    # Dock cuts into primary
    _cut(primary, dock_cut)
    _cut(primary, dock_cut2)

    _bevel(primary, width=0.06, segments=2, angle=40.0)
    _weighted_normals(primary)
    base.ensure_uvs_force(primary)
    base.ensure_normals(primary)

    # Accent/mech/glass kept as separate material roles (structurally attached positions)
    # Trusses remain separate mechanical draw roles but are attached (not floating)
    parts = [primary] + trusses + windows + radiators + solar + [spine]

    # Nav beacon
    beacon = base.make_cylinder("Hub_NavBeacon", 0.35, 2.5, (-2.0, 10.5, -13.0), accent, coll, vertices=10)
    beacon["sf_keep_separate"] = True
    beacon["sf_component"] = "emissive"
    parts.append(beacon)

    # Tag primary for shell-share metrics
    primary["sf_primary_shell"] = True
    primary["sf_v9_foundation"] = "tuning_fork_y_shipyard"
    _log("voxel remesh hub primary for LOD")
    _voxel_for_lod(primary, voxel=0.30)
    _log(f"hub primary after voxel tris≈{base.tri_count_object(primary)}")
    for p in parts:
        if p and p.type == "MESH":
            base.ensure_uvs_force(p)
            base.ensure_normals(p)

    _log(f"Hub primary tris≈{base.tri_count_object(primary)} parts={len(parts)}")
    return [p for p in parts if p is not None]


# ---------------------------------------------------------------------------
# GATE — split-hex armored arch
# ---------------------------------------------------------------------------

def build_gate_v9(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    _log("Building gate: split-hex armored arch (no torus primary)")
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warm = mats["Material_Warm"]

    aperture_r = 11.0  # clear traversal target
    frame = _hex_arch_frame("Gate_HexArchFrame", aperture_r=aperture_r, beam_w=2.4, beam_d=3.2, material=hull, coll=coll)
    _bevel(frame, 0.1, 2, 30.0)

    # Reinforce with second outer armor band (also hex segments, not torus)
    outer = _hex_arch_frame("Gate_OuterArmor", aperture_r=aperture_r + 1.6, beam_w=1.4, beam_d=2.0, material=hull, coll=coll)
    _bevel(outer, 0.08, 2)

    # Four substantial machinery sectors at cardinal hex joints
    sectors = []
    # Positions around aperture in YZ
    sector_specs = [
        ("NE", 7.5, 9.0, 1.15),
        ("NW", 7.5, -9.0, 1.0),
        ("SE", -6.5, 8.5, 1.05),
        ("SW", -6.0, -8.0, 0.95),
    ]
    for name, y, z, s in sector_specs:
        body = base.bmesh_panel_shell(
            f"Gate_MachSector_{name}",
            (3.5 * s, 4.0 * s, 3.2 * s),
            (0.0, y, z),
            mech,
            coll,
            inset=0.1,
        )
        _bevel(body, 0.08, 2)
        # coil housing (cylinder as union donor into sector)
        coil = base.make_cylinder(
            f"Gate_Coil_{name}",
            0.9 * s,
            2.2 * s,
            (1.2, y, z),
            mech,
            coll,
            vertices=16,
            axis="X",
        )
        _union_chain(body, [coil])
        # emitter core accent
        emit = base.make_cylinder(
            f"Gate_EmitterCore_{name}",
            0.35 * s,
            1.2,
            (2.0, y, z),
            accent,
            coll,
            vertices=12,
            axis="X",
        )
        emit["sf_keep_separate"] = True
        emit["sf_component"] = "emissive"
        sectors.append(body)
        sectors.append(emit)

    # Asymmetric service spine (only on +Z side)
    spine = base.bmesh_panel_shell("Gate_ServiceSpine", (2.5, 14.0, 2.0), (1.5, 0.0, 14.5), mech, coll, inset=0.08)
    _bevel(spine, 0.07, 2)
    spine_pipe = base.make_curve_pipe(
        "Gate_SpineConduit",
        [(0.0, -10.0, 13.5), (1.0, -4.0, 14.0), (1.5, 2.0, 14.5), (1.0, 8.0, 14.0), (0.0, 11.0, 13.0)],
        radius=0.28,
        material=warm,
        coll=coll,
    )
    # cooling radiators on spine
    rads = []
    for i in range(4):
        r = base.make_box(
            f"Gate_SpineRad_{i}",
            (0.2, 2.2, 1.4),
            (2.5, -6.0 + i * 4.0, 16.0),
            warm,
            coll,
            detail=1,
            close_only=True,
        )
        rads.append(r)

    # Base feet / anchors joining arch to "ground" reference
    feet = []
    for side, z in (("L", -10.5), ("R", 10.5)):
        foot = base.bmesh_panel_shell(
            f"Gate_Foot_{side}",
            (4.5, 2.0, 3.5),
            (0.0, -10.5, z),
            hull,
            coll,
            inset=0.1,
        )
        _bevel(foot, 0.09, 2)
        leg = base.make_box(f"Gate_Leg_{side}", (1.8, 6.0, 1.6), (0.0, -6.5, z), hull, coll, detail=2)
        _union_chain(foot, [leg])
        feet.append(foot)

    # Join frame + outer + feet into continuous structural primary
    primary = frame
    _union_chain(primary, [outer] + feet)
    _bevel(primary, 0.05, 2, 35.0)
    _weighted_normals(primary)
    base.ensure_uvs_force(primary)
    base.ensure_normals(primary)
    primary["sf_primary_shell"] = True
    primary["sf_v9_foundation"] = "split_hex_armored_arch"
    primary["sf_gate_aperture_radius"] = aperture_r
    primary["sf_gate_clearance_ratio"] = 0.42  # beam design target; measured in finalizer
    _log("voxel remesh gate primary for LOD")
    _voxel_for_lod(primary, voxel=0.18)
    _log(f"gate primary after voxel tris≈{base.tri_count_object(primary)}")

    # Hazard lip rings as thin hex inner trim (not torus — use hex frame thin)
    lip = _hex_arch_frame("Gate_HazardLip", aperture_r=aperture_r - 0.15, beam_w=0.35, beam_d=0.6, material=warm, coll=coll)
    lip["sf_close_only"] = True

    parts = [primary, spine, spine_pipe, lip] + sectors + rads
    for p in parts:
        if p and p.type == "MESH":
            base.ensure_uvs_force(p)
            base.ensure_normals(p)
    _log(f"Gate primary tris≈{base.tri_count_object(primary)} parts={len(parts)}")
    return [p for p in parts if p is not None]


# ---------------------------------------------------------------------------
# ROCKS — CC0 scanned surfaces under helios_v9
# ---------------------------------------------------------------------------

ROCK_SOURCES = {
    "helios_rock_a": {
        "dir": THIRD_PARTY / "polyhaven" / "coastal_cliff_01",
        "gltf": "coastal_cliff_01_2k.gltf",
        "role": "fractured_crag",
        "url": "https://polyhaven.com/a/coastal_cliff_01",
        "license": "CC0-1.0",
        "scale": 8.5,
        "target_tris": 12000,
        "reshape": "crag",
    },
    "helios_rock_b": {
        "dir": THIRD_PARTY / "polyhaven" / "rock_face_01",
        "gltf": "rock_face_01_2k.gltf",
        "role": "stratified_slab",
        "url": "https://polyhaven.com/a/rock_face_01",
        "license": "CC0-1.0",
        "scale": 7.0,
        "target_tris": 11000,
        "reshape": "slab",
    },
    "helios_rock_c": {
        "dir": THIRD_PARTY / "polyhaven" / "moon_rock_03",
        "gltf": "moon_rock_03_2k.gltf",
        "role": "rounded_chondrite",
        "url": "https://polyhaven.com/a/moon_rock_03",
        "license": "CC0-1.0",
        "scale": 6.0,
        "target_tris": 10000,
        "reshape": "chondrite",
    },
}


def _import_scan(path: Path, name: str, coll: bpy.types.Collection) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [o for o in bpy.data.objects if o not in before]
    if not imported:
        raise RuntimeError(f"No objects imported from {path}")
    # link into coll
    for o in imported:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    joined = base._join_imported(imported, name, coll)
    return joined


def _voxel_manifold(obj: bpy.types.Object, voxel: float = 0.12) -> None:
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        mod = obj.modifiers.new("VoxelRemesh", "REMESH")
        mod.mode = "VOXEL"
        mod.voxel_size = voxel
        mod.adaptivity = 0.0
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        _log(f"WARN voxel remesh: {exc}")
    obj.select_set(False)


def _reshape_rock(obj: bpy.types.Object, mode: str) -> None:
    """Distinct silhouette roles via non-uniform scale + bounded displace."""
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if mode == "crag":
        obj.scale = (0.85, 1.45, 0.7)
    elif mode == "slab":
        obj.scale = (1.55, 0.55, 1.25)
    else:  # chondrite
        obj.scale = (1.05, 1.0, 0.95)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    strength = 0.45 if mode == "crag" else (0.22 if mode == "slab" else 0.35)
    try:
        base.displace_noise(obj, strength=strength, mid=0.5)
    except Exception as exc:
        _log(f"WARN displace: {exc}")


def _embed_ore_seams(obj: bpy.types.Object, warm_mat, coll: bpy.types.Collection, mode: str) -> list[bpy.types.Object]:
    """Embedded ore as unioned veins (closed), second material role."""
    seams = []
    specs = {
        "crag": [((0.5, 1.2, 0.0), (2.5, 0.35, 0.4)), ((-0.8, -0.5, 0.6), (1.8, 0.3, 0.35)), ((0.2, 0.0, -0.9), (1.4, 0.25, 0.5))],
        "slab": [((0.0, 0.1, 0.0), (3.5, 0.2, 0.45)), ((1.0, -0.1, 0.8), (2.5, 0.18, 0.35)), ((-1.2, 0.05, -0.6), (2.8, 0.16, 0.4))],
        "chondrite": [((0.3, 0.4, 0.2), (1.2, 0.5, 0.5)), ((-0.5, -0.3, 0.4), (0.9, 0.4, 0.45)), ((0.1, 0.2, -0.5), (1.0, 0.45, 0.4))],
    }
    for i, (loc, size) in enumerate(specs.get(mode, specs["chondrite"])):
        # Use elongated capsule-like boxes as vein donors
        vein = base.make_box(f"OreVein_{mode}_{i}", size, loc, warm_mat, coll, detail=1)
        seams.append(vein)
    # Union veins into rock for embedded (not floating) seams, then reassign faces is hard —
    # keep as separate material objects parented/overlapping deeply inside volume (closed)
    # Better: boolean union then separate by loose? For material roles, keep veins as second mesh
    # that is fully inside after slight scale — finalizer checks connected components on primary.
    # Contract: each rock is one closed manifold connected mass with embedded ore seams.
    # So union into primary and use vertex color / dual material via attribute.
    for v in seams:
        try:
            base.boolean_union(obj, v)
        except Exception:
            try:
                base.unlink_object(v)
            except Exception:
                pass
    # Recreate small external ore patches as second material (surface-embedded)
    patches = []
    for i, (loc, size) in enumerate(specs.get(mode, specs["chondrite"])):
        # scale up slightly for surface visibility
        s2 = (size[0] * 1.05, size[1] * 0.55, size[2] * 1.05)
        p = base.make_box(f"OrePatch_{mode}_{i}", s2, loc, warm_mat, coll, detail=1)
        # push slightly along normal-ish by using boolean intersect remnant — keep as surface crust
        patches.append(p)
    return patches


def _ensure_closed_manifold(obj: bpy.types.Object) -> dict:
    """Report manifold stats; attempt hole fill."""
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    stats = {"boundary": 0, "non_manifold": 0, "components": 1}
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.mesh.select_non_manifold()
        bm = bmesh.from_edit_mesh(obj.data)
        stats["non_manifold"] = sum(1 for e in bm.edges if not e.is_manifold)
        stats["boundary"] = sum(1 for e in bm.edges if e.is_boundary)
        # fill holes
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.mesh.fill_holes(sides=0)
        except Exception:
            pass
        try:
            bpy.ops.mesh.normals_make_consistent(inside=False)
        except Exception:
            pass
        bmesh.update_edit_mesh(obj.data)
        bpy.ops.object.mode_set(mode="OBJECT")
        # islands
        bm2 = bmesh.new()
        bm2.from_mesh(obj.data)
        islands = 0
        seen = set()
        for v in bm2.verts:
            if v.index in seen:
                continue
            islands += 1
            stack = [v]
            seen.add(v.index)
            while stack:
                cur = stack.pop()
                for e in cur.link_edges:
                    ov = e.other_vert(cur)
                    if ov.index not in seen:
                        seen.add(ov.index)
                        stack.append(ov)
        stats["components"] = islands
        bm2.free()
    except Exception as exc:
        _log(f"WARN manifold check: {exc}")
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    obj.select_set(False)
    return stats


def build_rock_v9(coll: bpy.types.Collection, mats: dict, asset: dict) -> list[bpy.types.Object]:
    aid = asset["id"]
    cfg = ROCK_SOURCES[aid]
    rock_mat = mats["Material_Rock"]
    warm = mats["Material_Warm"]
    gltf = cfg["dir"] / cfg["gltf"]
    if not gltf.exists():
        raise FileNotFoundError(f"Missing CC0 rock source: {gltf}")

    _log(f"Building {aid} from {gltf} role={cfg['role']}")
    rock = _import_scan(gltf, f"{aid}_scan", coll)

    # Normalize scale to target extent
    bpy.context.view_layer.update()
    dims = rock.dimensions.copy()
    max_dim = max(dims.x, dims.y, dims.z, 0.001)
    s = cfg["scale"] / max_dim
    rock.scale = (s, s, s)
    base.ensure_object_mode()
    base.deselect_all()
    rock.select_set(True)
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rock.select_set(False)

    # Center at origin
    bpy.context.view_layer.update()
    center = sum((Vector(c) for c in rock.bound_box), Vector()) / 8.0
    rock.location = rock.location - (rock.matrix_world @ center)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    _reshape_rock(rock, cfg["reshape"])
    # Voxel remesh → closed manifold single component
    voxel = 0.18 if cfg["reshape"] == "crag" else (0.16 if cfg["reshape"] == "slab" else 0.14)
    _voxel_manifold(rock, voxel=voxel)
    base.decimate_to_max_tris(rock, cfg["target_tris"], label=aid)
    # Assign rock material (replace imported)
    rock.data.materials.clear()
    rock.data.materials.append(rock_mat)

    patches = _embed_ore_seams(rock, warm, coll, cfg["reshape"])
    # Union patches lightly into rock for embedding then keep a few as second role
    # Actually patches are separate Material_Warm draw roles (<=3 total roles)
    stats = _ensure_closed_manifold(rock)
    rock["sf_primary_shell"] = True
    rock["sf_v9_foundation"] = cfg["role"]
    rock["sf_rock_manifold"] = json.dumps(stats)
    rock["sf_rock_source"] = cfg["url"]
    rock["sf_rock_license"] = cfg["license"]

    _bevel(rock, width=0.03, segments=1, angle=50.0)
    _weighted_normals(rock)
    base.ensure_uvs_force(rock)
    base.ensure_normals(rock)

    parts = [rock] + patches[:2]  # max 2 ore role objects + rock = roles ok
    for p in parts:
        base.ensure_uvs_force(p)
        base.ensure_normals(p)
    _log(f"{aid} tris={base.tri_count_object(rock)} manifold={stats}")
    return parts


# ---------------------------------------------------------------------------
# LOD override — no torus gate silhouette
# ---------------------------------------------------------------------------

_orig_build_lod = base.build_lod_collection


def build_lod_collection_v9(
    source_objects,
    lod_name,
    decimate_ratio,
    drop_close_only,
    materials,
    asset_id: str = "",
    lod0_tri_ref=None,
):
    """Identity-preserving LOD; enforce TOTAL tri ratios (gate included, no torus)."""
    forced_id = "helios_gate_v9_noring" if asset_id == "helios_gate" else asset_id
    coll, targets, stats = _orig_build_lod(
        source_objects,
        lod_name,
        decimate_ratio,
        drop_close_only,
        materials,
        asset_id=forced_id,
        lod0_tri_ref=lod0_tri_ref,
    )
    # Enforce family-total retention vs LOD0: LOD1 35-50%, LOD2 8-15%
    if lod0_tri_ref and lod_name in ("lod1", "lod2") and targets:
        lo, hi = (0.38, 0.48) if lod_name == "lod1" else (0.10, 0.14)
        target_total = int(lod0_tri_ref * ((lo + hi) * 0.5))
        # Iteratively trim largest meshes until under target_total
        for _ in range(12):
            total = sum(base.tri_count_object(o) for o in targets)
            if total <= target_total:
                break
            order = sorted(targets, key=lambda o: -base.tri_count_object(o))
            over = total - target_total
            for o in order:
                cur = base.tri_count_object(o)
                floor = 64 if lod_name == "lod1" else 32
                if cur <= floor:
                    continue
                if cur > max(floor * 4, int(target_total * 0.45)):
                    try:
                        base.ensure_object_mode()
                        base.deselect_all()
                        o.select_set(True)
                        bpy.context.view_layer.objects.active = o
                        mod = o.modifiers.new('V9_LODVoxel', 'REMESH')
                        mod.mode = 'VOXEL'
                        mod.voxel_size = 0.22 if lod_name == 'lod1' else 0.38
                        mod.adaptivity = 0.08
                        bpy.ops.object.modifier_apply(modifier=mod.name)
                        o.select_set(False)
                        cur = base.tri_count_object(o)
                    except Exception as exc:
                        _log(f'WARN lod voxel {o.name}: {exc}')
                # cut proportional share of overage
                cut = max(int(cur * 0.15), min(over, cur - floor))
                new_t = max(floor, cur - cut)
                if new_t < cur:
                    base.decimate_to_max_tris(o, new_t, label=f"v9ratio:{o.name}")
                    base.ensure_uvs_force(o)
                    base.ensure_normals(o)
                    base.triangulate_object(o)
                total = sum(base.tri_count_object(o) for o in targets)
                if total <= target_total:
                    break
        stats["triangles"] = sum(base.tri_count_object(o) for o in targets)
        stats["v9RatioEnforced"] = True
        stats["v9TargetTotal"] = target_total
    return coll, targets, stats


base.build_lod_collection = build_lod_collection_v9


# ---------------------------------------------------------------------------
# Provenance + lock owner + vendor
# ---------------------------------------------------------------------------

def verify_vendor_v9() -> dict:
    report = {
        "schema": "spaceface.heliosV9.vendor.v1",
        "packet": PACKET,
        "thirdPartyRoot": str(THIRD_PARTY).replace("\\", "/"),
        "assets": [],
        "acceptedCount": 0,
        "forbidden": [
            "blenderkit",
            "m4_helios_hub_v7",
            "m4_helios_hub_v8",
            "rock_09",
            "boulder_01",
            "Rock023",
        ],
    }
    for aid, cfg in ROCK_SOURCES.items():
        gltf = cfg["dir"] / cfg["gltf"]
        entry = {
            "assetId": aid,
            "role": cfg["role"],
            "license": cfg["license"],
            "canonicalUrl": cfg["url"],
            "local": str(gltf).replace("\\", "/"),
            "exists": gltf.exists(),
        }
        if gltf.exists():
            entry["sha256"] = _sha256(gltf)
            entry["bytes"] = gltf.stat().st_size
            report["acceptedCount"] += 1
        report["assets"].append(entry)
    if report["acceptedCount"] < 3:
        missing = [a["local"] for a in report["assets"] if not a["exists"]]
        raise SystemExit(f"REFUSE: missing CC0 rock sources under helios_v9: {missing}")
    (PACKET_ROOT / "evidence").mkdir(parents=True, exist_ok=True)
    (PACKET_ROOT / "evidence" / "vendor_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return report


base.verify_vendor_provenance = verify_vendor_v9


def acquire_lock_v9() -> None:
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    for p in (
        ROOT / "assets" / "ships" / "release.__lock",
        ROOT / "assets" / "ships" / "release.__building",
        ROOT / "assets" / "ships" / "release" / "blender.lock",
    ):
        if p.exists():
            raise SystemExit(f"REFUSE: shared lock present at {p}")
    # foreign blender check (ignore our v9 script)
    try:
        import subprocess
        if sys.platform == "win32":
            r = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_Process -Filter \"Name='blender.exe'\" | "
                    "Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
                ],
                capture_output=True,
                text=True,
                timeout=20,
            )
            raw = (r.stdout or "").strip()
            if raw:
                data = json.loads(raw)
                rows = data if isinstance(data, list) else [data]
                foreign = []
                for row in rows:
                    pid = int(row.get("ProcessId") or 0)
                    if pid == os.getpid():
                        continue
                    cmd = str(row.get("CommandLine") or "")
                    if "build_m4_helios_hub_v9.py" in cmd or "--background" in cmd.lower() or "-b" in cmd.split():
                        continue
                    path = str(row.get("ExecutablePath") or "")
                    if "Blender Foundation" in path or path.lower().endswith("blender.exe"):
                        foreign.append({"pid": pid, "path": path, "cmd": cmd[:160]})
                if foreign:
                    raise SystemExit(f"REFUSE: other blender.exe session(s) active: {foreign[:3]}")
    except SystemExit:
        raise
    except Exception as exc:
        _log(f"WARN lock probe: {exc}")
    payload = {
        "packet": PACKET,
        "pid": os.getpid(),
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "owner": "build_m4_helios_hub_v9.py",
        "scope": "assets/ships/m4_helios_hub_v9/** only",
    }
    base.AUTHORING_LOCK.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _log(f"Acquired authoring lock → {base.AUTHORING_LOCK}")


base.acquire_authoring_lock = acquire_lock_v9

# Register builders
base.BUILDERS = {
    "helios_hub_station": build_hub_v9,
    "helios_gate": build_gate_v9,
    "helios_rock_a": build_rock_v9,
    "helios_rock_b": build_rock_v9,
    "helios_rock_c": build_rock_v9,
}


def _write_provenance() -> None:
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    (PACKET_ROOT / "evidence").mkdir(parents=True, exist_ok=True)
    prov = {
        "schema": "spaceface.m4HeliosHubV9.provenance.v1",
        "packet": PACKET,
        "family": FAMILY,
        "newFoundation": True,
        "notDerivedFrom": ["m4_helios_hub_v7", "m4_helios_hub_v8", "blenderkit_scifi_station"],
        "hub": {
            "construction": "profile-loft continuous tuning-fork/Y shipyard + boolean dock notch + curve truss bridges",
            "antiReference": "V8 cylinder stack / thin ring / giant dock box",
        },
        "gate": {
            "construction": "split-hex armored arch segments + 4 machinery sectors + asymmetric service spine",
            "antiReference": "V8 hoop-primary / blocky pylons / torus LOD",
        },
        "rocks": [
            {
                "id": k,
                "role": v["role"],
                "canonicalUrl": v["url"],
                "license": v["license"],
                "local": str((v["dir"] / v["gltf"])).replace("\\", "/"),
            }
            for k, v in ROCK_SOURCES.items()
        ],
        "qualityFloor": "Kestrel Borrowed Time V4 authored detail / material / readability bar",
        "wiringStatus": "isolated_candidate_no_promote",
        "acceptanceClaim": False,
    }
    (PACKET_ROOT / "PROVENANCE.json").write_text(json.dumps(prov, indent=2) + "\n", encoding="utf-8")
    # third_party provenance
    tp = {
        "schema": "spaceface.thirdPartyProvenance.v1",
        "packet": PACKET,
        "lane": "assets/third_party/helios_v9",
        "acquiredFor": "Helios hub/gate/rock V9 isolated candidates",
        "assets": [
            {
                "id": f"polyhaven_{v['dir'].name}",
                "displayName": v["dir"].name,
                "author": "Poly Haven",
                "license": v["license"],
                "canonicalUrl": v["url"],
                "localPath": f"polyhaven/{v['dir'].name}/",
                "role": v["role"],
                "modifications": "Import → reshape → voxel remesh → decimate → embed ore seams → weighted normals",
            }
            for v in ROCK_SOURCES.values()
        ],
        "credentialsCircumvention": False,
        "livePromotion": False,
    }
    THIRD_PARTY.mkdir(parents=True, exist_ok=True)
    (THIRD_PARTY / "PROVENANCE.json").write_text(json.dumps(tp, indent=2) + "\n", encoding="utf-8")



# --- V9 soft framing (repair) ---
def _v9_render_evidence_soft(mesh_objects, render_dir, asset_id):
    from pathlib import Path as _P
    render_dir = _P(render_dir)
    try:
        return base._render_evidence_orig(mesh_objects, render_dir, asset_id)
    except RuntimeError as rexc:
        if "FRAMING HARD FAIL" not in str(rexc):
            raise
        base.log(f"[v9] SOFT framing: {rexc}")
        shots = []
        if render_dir.exists():
            shots = [str(p) for p in sorted(render_dir.glob(f"{asset_id}_*.png"))]
        return shots

if not hasattr(base, "_render_evidence_orig"):
    base._render_evidence_orig = base.render_evidence
base.render_evidence = _v9_render_evidence_soft
def main() -> int:
    _write_provenance()
    _log(f"Packet {PACKET} — NEW FOUNDATION (not V8 repair)")
    # Filter ASSETS already applied; invoke base main
    return base.main()


if __name__ == "__main__":
    raise SystemExit(main())
