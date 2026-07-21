"""check_scenery.py — headless validation for the LANE H scenery props.

Runs as:
    blender -b --factory-startup -P tools/foundry/scenerygen/check_scenery.py
"""

from __future__ import annotations

import sys
import os
import json
import math
import importlib
import hashlib
import re
from pathlib import Path

# Add kitgen and scenerygen directories to path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "kitgen"))
sys.path.insert(0, str(HERE))

import bpy
import bmesh
from mathutils import Vector

import scenerygen

# --------------------------------------------------------------------------- #
# Paths & Envelopes
# --------------------------------------------------------------------------- #

SCENERY_DIR = HERE.parents[2] / "assets" / "ships" / "foundry" / "fleet_breadth_20260720" / "scenery"
MANIFEST_PATH = SCENERY_DIR / "scenery_manifest.json"
REPORT_PATH = SCENERY_DIR / "check_scenery_report.json"

NAME_RE = re.compile(r"^SCN_[A-Z0-9_]+_V\d{2}(?:_[A-Za-z0-9_]+)?$")
SOCKET_RE = re.compile(r"^SOCKET_(Top|Dock)$")

TRIS_HARD_DEFAULT = 3000
TRIS_HARD_GATE_RING = 4500
SILHOUETTE_DIFF_THRESHOLD = 0.12

class CheckFailed(AssertionError):
    """Custom exception representing a validation rule failure."""

def fail(rule: str, msg: str):
    raise CheckFailed(f"[{rule}] {msg}")

# --------------------------------------------------------------------------- #
# Geometry snapshot helpers
# --------------------------------------------------------------------------- #

def snapshot_geometry(obj: bpy.types.Object) -> dict:
    """Hashable snapshot of an object's geometry post-transforms."""
    mesh = obj.data
    coords = []
    for v in mesh.vertices:
        co = obj.matrix_world @ v.co
        coords.append((round(co.x, 5), round(co.y, 5), round(co.z, 5)))
    coords_sorted = sorted(coords)
    h = hashlib.sha256(repr(coords_sorted).encode("utf-8")).hexdigest()

    total_tris = sum(len(p.vertices) - 2 for p in mesh.polygons)

    return {
        "verts": len(mesh.vertices),
        "tris": total_tris,
        "polys": len(mesh.polygons),
        "hash": h,
    }

# --------------------------------------------------------------------------- #
# 2D Convex Hull (Andrew's Monotone Chain) for Silhouette Checks
# --------------------------------------------------------------------------- #

def _convex_hull_2d(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

def _polygon_area_2d(verts: list[tuple[float, float]]) -> float:
    if len(verts) < 3:
        return 0.0
    s = 0.0
    n = len(verts)
    for i in range(n):
        x1, y1 = verts[i]
        x2, y2 = verts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) * 0.5

# --------------------------------------------------------------------------- #
# Rule checks
# --------------------------------------------------------------------------- #

def check_naming(obj: bpy.types.Object):
    if obj.type == 'MESH':
        if not NAME_RE.match(obj.name):
            fail("NAMING", f"Mesh object {obj.name!r} must match SCN_<FAMILY>_V<NN>[_<part>]")
    elif obj.type == 'EMPTY':
        if not SOCKET_RE.match(obj.name):
            fail("NAMING", f"Empty object {obj.name!r} is only allowed if named SOCKET_Top or SOCKET_Dock")
    else:
        fail("NAMING", f"Disallowed object type {obj.type} for object {obj.name!r}")

def check_transforms_identity(obj: bpy.types.Object):
    if obj.type == 'MESH':
        mw = obj.matrix_world
        loc = mw.to_translation()
        rot = mw.to_euler()
        scale = mw.to_scale()
        if not (abs(loc.x) < 1e-5 and abs(loc.y) < 1e-5 and abs(loc.z) < 1e-5):
            fail("TRANSFORMS", f"{obj.name}: Mesh location is not applied ({tuple(loc)})")
        if not (abs(rot.x) < 1e-4 and abs(rot.y) < 1e-4 and abs(rot.z) < 1e-4):
            fail("TRANSFORMS", f"{obj.name}: Mesh rotation is not applied ({tuple(rot)})")
        if not (abs(scale.x - 1) < 1e-4 and abs(scale.y - 1) < 1e-4 and abs(scale.z - 1) < 1e-4):
            fail("TRANSFORMS", f"{obj.name}: Mesh scale is not applied ({tuple(scale)})")

def check_no_modifiers(obj: bpy.types.Object):
    if obj.modifiers:
        fail("MODIFIERS", f"{obj.name} has unapplied modifiers: {[m.name for m in obj.modifiers]}")

def check_materials(obj: bpy.types.Object):
    if obj.type == 'MESH':
        if not obj.data.materials:
            fail("MATERIALS", f"{obj.name} has no materials assigned")
        for mat in obj.data.materials:
            if not mat:
                fail("MATERIALS", f"{obj.name} has an empty material slot")
            if mat.name not in scenerygen.kitgen.ALLOWED_MATERIALS:
                fail("MATERIALS", f"{obj.name} has disallowed material {mat.name!r}")

def check_uvs(obj: bpy.types.Object):
    if obj.type == 'MESH':
        mesh = obj.data
        if not mesh.uv_layers:
            fail("UV", f"{obj.name} lacks UV maps")

def check_socket_rules(family: str, objs: list[bpy.types.Object]):
    empties = [o for o in objs if o.type == 'EMPTY']

    if family in ("lane_beacon", "claim_battery_mast"):
        # Exactly one SOCKET_Top
        if len(empties) != 1 or empties[0].name != "SOCKET_Top":
            fail("SOCKET", f"{family} must have exactly one socket named SOCKET_Top (found {[o.name for o in empties]})")
    elif family == "gate_ring":
        # Exactly one SOCKET_Dock
        if len(empties) != 1 or empties[0].name != "SOCKET_Dock":
            fail("SOCKET", f"{family} must have exactly one socket named SOCKET_Dock (found {[o.name for o in empties]})")
    else:
        # Zero sockets/empties allowed
        if len(empties) > 0:
            fail("SOCKET", f"{family} is not allowed to have socket empties (found {[o.name for o in empties]})")

def check_origin_rules(family: str, objs: list[bpy.types.Object]):
    # Get all vertices
    pts = []
    for o in objs:
        if o.type == 'MESH':
            for v in o.data.vertices:
                pts.append(o.matrix_world @ v.co)

    if not pts:
        return

    min_z = min(p.z for p in pts)

    # Ground-anchored props must touch Z=0 (zmin within [-0.02, 0.02])
    if family in ("lane_beacon", "claim_battery_mast", "container_stack", "claim_hopper", "claim_sensor_dish"):
        if not (-0.02 <= min_z <= 0.02):
            fail("ORIGIN", f"{family}: bottom of bounding box does not touch ground plane Z=0 (min_z = {min_z:.4f}m)")

# --------------------------------------------------------------------------- #
# Silhouette test
# --------------------------------------------------------------------------- #

def get_silhouette_data(family: str, variant: int) -> tuple[float, float]:
    """Returns (aspect_ratio, outline_area) of the variant projection on XY plane."""
    scenerygen.clear_scene()
    objs = scenerygen.build(family, variant, 12648430)

    pts = []
    for o in objs:
        if o.type == 'MESH':
            scenerygen.apply_transforms(o)
            for v in o.data.vertices:
                pts.append(o.matrix_world @ v.co)

    if not pts:
        fail("SILHOUETTE", f"{family} v{variant} has no vertices")

    xs = [p.x for p in pts]
    ys = [p.y for p in pts]

    dx = max(xs) - min(xs)
    dy = max(ys) - min(ys)

    aspect = dx / dy if dy > 1e-5 else 1.0

    xy_points = [(p.x, p.y) for p in pts]
    hull = _convex_hull_2d(xy_points)
    area = _polygon_area_2d(hull)

    return aspect, area

def check_silhouette_variety(family: str):
    variants = scenerygen.variant_count(family)
    sil_data = {}
    for v in range(1, variants + 1):
        sil_data[v] = get_silhouette_data(family, v)

    # Check pairwise difference
    for v1 in range(1, variants + 1):
        for v2 in range(v1 + 1, variants + 1):
            asp1, area1 = sil_data[v1]
            asp2, area2 = sil_data[v2]

            diff_aspect = abs(asp1 - asp2) / max(asp1, asp2, 1e-6)
            diff_area = abs(area1 - area2) / max(area1, area2, 1e-6)

            best_diff = max(diff_aspect, diff_area)
            if best_diff < SILHOUETTE_DIFF_THRESHOLD:
                fail("SILHOUETTE", f"{family}: variant {v1} and {v2} are too similar (aspect diff={diff_aspect:.1%}, area diff={diff_area:.1%}; max must be >= {SILHOUETTE_DIFF_THRESHOLD:.0%})")

# --------------------------------------------------------------------------- #
# Determinism check
# --------------------------------------------------------------------------- #

def check_determinism(family: str, variant: int) -> dict:
    seed = 0xC0FFEE

    # Run 1
    scenerygen.clear_scene()
    objs_a = scenerygen.build(family, variant, seed)
    snaps_a = [{"name": o.name, "geo": snapshot_geometry(o)} for o in objs_a if o.type == 'MESH']

    # Reload and Run 2
    importlib.reload(scenerygen)
    scenerygen.clear_scene()
    objs_b = scenerygen.build(family, variant, seed)
    snaps_b = [{"name": o.name, "geo": snapshot_geometry(o)} for o in objs_b if o.type == 'MESH']

    if len(snaps_a) != len(snaps_b):
        fail("DETERMINISM", f"{family} v{variant}: mesh object counts differ")
    for a, b in zip(snaps_a, snaps_b):
        if a["name"] != b["name"]:
            fail("DETERMINISM", f"{family} v{variant}: name mismatch {a['name']} vs {b['name']}")
        if a["geo"]["verts"] != b["geo"]["verts"]:
            fail("DETERMINISM", f"{a['name']}: vertex count mismatch")
        if a["geo"]["hash"] != b["geo"]["hash"]:
            fail("DETERMINISM", f"{a['name']}: coordinates hash mismatch (non-deterministic)")

# --------------------------------------------------------------------------- #
# Manifest validation
# --------------------------------------------------------------------------- #

def check_manifest(expected_props: list[tuple[str, int]]):
    if not MANIFEST_PATH.exists():
        fail("MANIFEST", f"Manifest file {MANIFEST_PATH} is missing. Run export_scenery.py first.")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    props = manifest.get("props", [])

    seen = {(p["family"], int(p["variant"])) for p in props}
    missing = set(expected_props) - seen
    if missing:
        fail("MANIFEST", f"Missing props in manifest: {sorted(missing)}")

    required_keys = {"family", "variant", "seed", "tris", "dims_m", "materials", "glb", "sha256"}

    for p in props:
        miss_keys = required_keys - set(p.keys())
        if miss_keys:
            fail("MANIFEST", f"Prop {p.get('family')} v{p.get('variant')}: missing keys {sorted(miss_keys)}")

        glb_path = SCENERY_DIR / p["glb"]
        if not glb_path.exists():
            fail("MANIFEST", f"GLB file {p['glb']} is missing from scenery directory")

        # Check hash
        h = hashlib.sha256()
        with open(glb_path, "rb") as f:
            h.update(f.read())
        digest = h.hexdigest()
        if digest != p["sha256"]:
            fail("MANIFEST", f"GLB file {p['glb']} SHA256 mismatch (manifest={p['sha256'][:12]}, file={digest[:12]})")

        # Check tri budget
        limit = TRIS_HARD_GATE_RING if p["family"] == "gate_ring" else TRIS_HARD_DEFAULT
        if int(p["tris"]) > limit:
            fail("MANIFEST", f"GLB file {p['glb']} tris={p['tris']} exceeds limit={limit}")

        # Check materials
        for mat in p["materials"]:
            if mat not in scenerygen.kitgen.ALLOWED_MATERIALS:
                fail("MANIFEST", f"GLB file {p['glb']} uses disallowed material {mat!r}")

# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main():
    print("Starting Scenery Breadth Pack validation...")

    # Reload and reset scene
    importlib.reload(scenerygen)
    scenerygen.clear_scene()

    families = scenerygen.list_families()
    if not families:
        fail("REGISTRY", "No scenery families registered")

    expected_props = []
    checked_count = 0

    # Verify each prop geometry & rules
    for family in families:
        v_count = scenerygen.variant_count(family)
        for var in range(1, v_count + 1):
            scenerygen.clear_scene()
            scenerygen.ensure_materials()
            objs = scenerygen.build(family, var, 12648430)

            if not objs:
                fail("BUILD", f"Family {family} v{var} returned no objects")

            # Run checks
            check_socket_rules(family, objs)
            check_origin_rules(family, objs)

            tris_count = 0
            for obj in objs:
                check_naming(obj)
                check_transforms_identity(obj)
                check_no_modifiers(obj)
                check_materials(obj)
                check_uvs(obj)

                if obj.type == 'MESH':
                    snap = snapshot_geometry(obj)
                    tris_count += snap["tris"]

            limit = TRIS_HARD_GATE_RING if family == "gate_ring" else TRIS_HARD_DEFAULT
            if tris_count > limit:
                fail("TRIS", f"{family} v{var}: total triangles={tris_count} exceeds limit={limit}")

            # Determinism checks
            check_determinism(family, var)

            expected_props.append((family, var))
            checked_count += 1
            print(f"  Passed: {family} v{var} (tris={tris_count})")

        # Silhouette variety checks
        check_silhouette_variety(family)
        print(f"  Passed: {family} silhouette checks")

    # Manifest validation
    check_manifest(expected_props)
    print("  Passed: manifest validation")

    print("\nSCENERY_CHECK_OK")

if __name__ == "__main__":
    try:
        main()
    except CheckFailed as e:
        print(f"SCENERY_CHECK_FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"SCENERY_CHECK_ERROR: {type(e).__name__}: {e}")
        sys.exit(2)
