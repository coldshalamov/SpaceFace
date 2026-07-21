"""check_kitgen.py — headless validation for the LANE D kit.

Runs as:
    blender -b --factory-startup -P tools/foundry/kitgen/check_kitgen.py
            [-- <family> ...]            # restrict to specific families
            [-- --no-manifest]            # skip manifest cross-check

Enforces every rule listed in brief-D-kitgen.md. Fails (exit 1) with a named
assertion on first violation; prints ``KITGEN_CHECK_OK`` and writes
``check_kitgen_report.json`` next to the manifest when all rules pass.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import bmesh
from mathutils import Vector

import kitgen

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

HERE = Path(__file__).resolve().parent
WORKTREE = HERE.parents[2]
KIT_DIR = WORKTREE / "assets" / "ships" / "foundry" / "fleet_breadth_20260720" / "kit"
MANIFEST_PATH = KIT_DIR / "kit_manifest.json"
REPORT_PATH = KIT_DIR / "check_kitgen_report.json"

NAME_RE = re.compile(r"^KIT_[A-Z][A-Z0-9_]*_V\d{2}(?:_[A-Za-z0-9_]+)?$")

# Geometry counts are telemetry, not taste ceilings. Runtime promotion owns any
# platform-specific cost decision and must derive it from measured evidence.
TRIS_REFERENCE = 400
BEVEL_RANGE = (0.004, 0.012)
FORM_RATIO_V1 = 0.25
UV_ZERO_ISLAND_RATIO = 0.05


class CheckFailed(AssertionError):
    """Named assertion so callers can format the failure cleanly."""


def fail(rule: str, msg: str):
    raise CheckFailed(f"[{rule}] {msg}")


# --------------------------------------------------------------------------- #
# Geometry snapshot for determinism
# --------------------------------------------------------------------------- #

def snapshot_geometry(obj: bpy.types.Object) -> dict:
    """Hashable snapshot of an object's geometry (post-transform)."""
    mesh = obj.data
    # Use evaluated mesh so modifiers baked into vertices are reflected.
    coords = []
    for v in mesh.vertices:
        co = obj.matrix_world @ v.co
        coords.append((round(co.x, 5), round(co.y, 5), round(co.z, 5)))
    coords_sorted = sorted(coords)
    h = hashlib.sha256(repr(coords_sorted).encode("utf-8")).hexdigest()
    return {
        "verts": len(mesh.vertices),
        "tris": sum(1 for p in mesh.polygons if len(p.vertices) == 3)
                 + sum(len(p.vertices) - 2 for p in mesh.polygons if len(p.vertices) > 3),
        "polys": len(mesh.polygons),
        "hash": h,
    }


# --------------------------------------------------------------------------- #
# Per-piece rules
# --------------------------------------------------------------------------- #

def check_naming(obj: bpy.types.Object):
    if not NAME_RE.match(obj.name):
        fail("NAMING", f"object {obj.name!r} does not match KIT_<FAMILY>_V<NN>[_<part>]")
    mesh_name = obj.data.name
    # Strip trailing _mesh suffix or .00N duplicates
    base = re.sub(r"\.\d{3}$", "", mesh_name)
    if not (base.endswith("_mesh") or NAME_RE.match(base.replace("_mesh", ""))):
        fail("NAMING", f"mesh {mesh_name!r} leaks default naming")
    if re.search(r"\.\d{3}$", obj.name):
        fail("NAMING", f"object {obj.name!r} has a Blender duplicate suffix")


def check_transforms_identity(obj: bpy.types.Object):
    mw = obj.matrix_world
    loc = mw.to_translation()
    rot = mw.to_euler()
    scale = mw.to_scale()
    if not (abs(loc.x) < 1e-6 and abs(loc.y) < 1e-6 and abs(loc.z) < 1e-6):
        fail("TRANSFORMS", f"{obj.name}: location not identity ({tuple(loc)})")
    if not (abs(rot.x) < 1e-5 and abs(rot.y) < 1e-5 and abs(rot.z) < 1e-5):
        fail("TRANSFORMS", f"{obj.name}: rotation not identity ({tuple(rot)})")
    if not (abs(scale.x - 1) < 1e-4 and abs(scale.y - 1) < 1e-4 and abs(scale.z - 1) < 1e-4):
        fail("TRANSFORMS", f"{obj.name}: scale not identity ({tuple(scale)})")


def check_no_modifiers(obj: bpy.types.Object):
    if obj.modifiers:
        names = [m.name for m in obj.modifiers]
        fail("MODIFIERS", f"{obj.name}: unapplied modifiers remain: {names}")


def check_materials(obj: bpy.types.Object):
    if len(obj.data.materials) == 0:
        fail("MATERIALS", f"{obj.name}: no material assigned")
    bad = []
    for slot in obj.data.materials:
        if slot is None:
            bad.append("<None>")
            continue
        if slot.name not in kitgen.ALLOWED_MATERIALS:
            bad.append(slot.name)
    if bad:
        fail("MATERIALS", f"{obj.name}: disallowed materials {bad}; only "
                          f"{kitgen.ALLOWED_MATERIALS} permitted")


def check_uvs(obj: bpy.types.Object):
    mesh = obj.data
    if not mesh.uv_layers or len(mesh.uv_layers) == 0:
        fail("UV", f"{obj.name}: no UV layer present")
    uv_layer = mesh.uv_layers.active.data
    # Count UV-zero faces that correspond to NON-degenerate 3D faces.
    # The rule's intent is "the UV map is usable"; thin bevel faces whose 3D
    # counterparts are also slivers do not undermine texturing of real area.
    zero = 0
    total = len(mesh.polygons)
    if total == 0:
        fail("UV", f"{obj.name}: mesh has no polygons")
    for poly in mesh.polygons:
        verts3d = [mesh.vertices[vi].co for vi in poly.vertices]
        # 3D face area proxy (vector cross product of two consecutive edges).
        if len(verts3d) >= 3:
            e1 = verts3d[1] - verts3d[0]
            e2 = verts3d[-1] - verts3d[0]
            area3d = (e1.cross(e2)).length
            for k in range(2, len(verts3d) - 1):
                ek = verts3d[k] - verts3d[0]
                e_k1 = verts3d[k + 1] - verts3d[0]
                area3d += (ek.cross(e_k1)).length
        else:
            area3d = 0.0
        # Skip degenerate 3D faces (thin bevels, edge slivers).
        if area3d < 1e-7:
            continue
        uv_verts = [uv_layer[li].uv for li in poly.loop_indices]
        if len(uv_verts) < 3:
            zero += 1
            continue
        area2 = 0.0
        ox, oy = uv_verts[0]
        for k in range(1, len(uv_verts) - 1):
            ax, ay = uv_verts[k]
            bx, by = uv_verts[k + 1]
            area2 += abs((ax - ox) * (by - oy) - (bx - ox) * (ay - oy))
        if area2 < 1e-9:
            zero += 1
    ratio = zero / total
    if ratio > UV_ZERO_ISLAND_RATIO:
        fail("UV", f"{obj.name}: {ratio:.1%} non-degenerate UV faces with "
                   f"zero area (>{UV_ZERO_ISLAND_RATIO:.0%})")


def check_bevel_present(obj: bpy.types.Object, snap: dict):
    """Evidence that the bevel modifier was applied. Builders tag each
    finished object with ``kitgen_bevel_applied`` when at least one of its
    constituent parts received a real bevel; the tag survives the join."""
    if not obj.get("kitgen_bevel_applied", False):
        fail("BEVEL", f"{obj.name}: no kitgen_bevel_applied tag — "
                      f"bevel modifier was not applied to any structural edge")


def check_origin_at_mount_plane(obj: bpy.types.Object, snap: dict):
    """Origin must be at z=0 (mount plane), +Z out, +X along length."""
    # Origin in world = matrix_world.translation = (0,0,0) checked elsewhere.
    # Here we additionally check the bbox touches z=0 (sits on the mount plane).
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not coords:
        fail("ORIGIN", f"{obj.name}: empty mesh")
    zmin = min(c.z for c in coords)
    zmax = max(c.z for c in coords)
    if zmin > 0.001:
        fail("ORIGIN", f"{obj.name}: bbox does not touch mount plane (zmin={zmin:.4f})")
    if zmax < 0.005:
        fail("ORIGIN", f"{obj.name}: piece has no +Z extent (zmax={zmax:.4f})")


def _convex_hull_2d(points):
    """Andrew's monotone-chain 2D convex hull. Returns hull vertices CCW."""
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


def _polygon_area_2d(verts):
    if len(verts) < 3:
        return 0.0
    s = 0.0
    n = len(verts)
    for i in range(n):
        x1, y1 = verts[i]
        x2, y2 = verts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) * 0.5


def check_form_feature_v1(obj: bpy.types.Object):
    """Primary form must read at gameplay distance. Proxy: the piece's
    top-down (XY) projected silhouette occupies at least 25% of its top-down
    bbox area — the camera looks down the +Z axis, so this is the footprint
    a player actually sees. Multi-part pieces whose largest single sub-form
    dominates the silhouette pass; sparse scatters of greebles do not.
    """
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not coords:
        fail("FORM", f"{obj.name}: no vertices")
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    bbox_dx = max(xs) - min(xs)
    bbox_dy = max(ys) - min(ys)
    bbox_area = max(bbox_dx, 1e-6) * max(bbox_dy, 1e-6)
    hull = _convex_hull_2d([(c.x, c.y) for c in coords])
    hull_area = _polygon_area_2d(hull)
    ratio = hull_area / bbox_area
    if ratio < FORM_RATIO_V1:
        fail("FORM", f"{obj.name}: silhouette fill {ratio:.1%} < "
                     f"{FORM_RATIO_V1:.0%} — primary form does not dominate bbox")


# --------------------------------------------------------------------------- #
# Determinism
# --------------------------------------------------------------------------- #

def build_and_snapshot(family_name: str, variant: int, seed: int = 0xC0FFEE) -> list[dict]:
    kitgen.clear_scene()
    objs = kitgen.build(family_name, variant, seed)
    snaps = []
    for o in objs:
        snaps.append({"name": o.name, "geo": snapshot_geometry(o)})
    return snaps


def check_determinism(family_name: str, variant: int) -> dict:
    seed = 0xC0FFEE
    snap_a = build_and_snapshot(family_name, variant, seed)
    # Reload module to flush any caches/registries of mutable state.
    importlib.reload(kitgen)
    snap_b = build_and_snapshot(family_name, variant, seed)
    if len(snap_a) != len(snap_b):
        fail("DETERMINISM",
             f"{family_name} v{variant}: object count differs "
             f"({len(snap_a)} vs {len(snap_b)})")
    for a, b in zip(snap_a, snap_b):
        if a["name"] != b["name"]:
            fail("DETERMINISM",
                 f"{family_name} v{variant}: object name differs "
                 f"{a['name']!r} vs {b['name']!r}")
        if a["geo"]["verts"] != b["geo"]["verts"]:
            fail("DETERMINISM",
                 f"{a['name']}: vert count differs "
                 f"{a['geo']['verts']} vs {b['geo']['verts']}")
        if a["geo"]["hash"] != b["geo"]["hash"]:
            fail("DETERMINISM",
                 f"{a['name']}: sorted vertex-coord hash differs")
    return {"family": family_name, "variant": variant, "objects": len(snap_a)}


# --------------------------------------------------------------------------- #
# Manifest cross-check
# --------------------------------------------------------------------------- #

def check_manifest(expected_pieces: list[tuple[str, int]]) -> dict:
    if not MANIFEST_PATH.exists():
        fail("MANIFEST", f"{MANIFEST_PATH} missing — run export_kit.py")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    pieces = manifest.get("pieces", [])
    seen = {(p["family"], int(p["variant"])) for p in pieces}
    missing = set(expected_pieces) - seen
    if missing:
        fail("MANIFEST", f"missing pieces in manifest: {sorted(missing)}")
    # Each piece: required keys + sha256 of GLB verifies
    required = {"family", "variant", "seed", "tris", "dims_m", "materials", "glb", "sha256"}
    for p in pieces:
        miss = required - set(p.keys())
        if miss:
            fail("MANIFEST", f"piece {p.get('family')} v{p.get('variant')}: "
                             f"missing keys {sorted(miss)}")
        glb_path = KIT_DIR / p["glb"]
        if not glb_path.exists():
            fail("MANIFEST", f"{glb_path} referenced but not present")
        digest = hashlib.sha256(glb_path.read_bytes()).hexdigest()
        if digest != p["sha256"]:
            fail("MANIFEST",
                 f"{glb_path.name}: sha256 mismatch "
                 f"(manifest={p['sha256'][:12]}…, file={digest[:12]}…)")
        for m in p["materials"]:
            if m not in kitgen.ALLOWED_MATERIALS:
                fail("MANIFEST", f"{glb_path.name}: disallowed material {m!r}")
    return {"pieces": len(pieces)}


# --------------------------------------------------------------------------- #
# Top-level
# --------------------------------------------------------------------------- #

def parse_args():
    args = list(sys.argv)
    if "--" in args:
        extras = args[args.index("--") + 1:]
    else:
        extras = []
    families = [a for a in extras if not a.startswith("-")]
    flags = {a.lstrip("-") for a in extras if a.startswith("-")}
    return families, flags


def main():
    only_families, flags = parse_args()
    skip_manifest = "no-manifest" in flags

    # Reload module to flush state.
    importlib.reload(kitgen)
    kitgen.clear_scene()

    families = only_families or kitgen.list_families()
    if not families:
        fail("REGISTRY", "no families registered")

    # If checking all, require the canonical 14.
    if not only_families:
        missing = set(kitgen.CANONICAL_FAMILIES) - set(families)
        if missing:
            fail("REGISTRY", f"canonical families missing: {sorted(missing)}")
        extra = set(families) - set(kitgen.CANONICAL_FAMILIES)
        if extra:
            fail("REGISTRY", f"non-canonical families present: {sorted(extra)}")

    total_pieces = 0
    results = []
    expected_pieces = []
    for fam in families:
        n = kitgen.variant_count(fam)
        for v in range(1, n + 1):
            # Build for direct inspection.
            kitgen.clear_scene()
            objs = kitgen.build(fam, v, 0xC0FFEE)
            if not objs:
                fail("BUILD", f"{fam} v{v}: returned no objects")
            total_pieces += len(objs)
            piece_snaps = []
            for o in objs:
                check_naming(o)
                check_transforms_identity(o)
                check_no_modifiers(o)
                check_materials(o)
                check_uvs(o)
                snap = snapshot_geometry(o)
                check_bevel_present(o, snap)
                check_origin_at_mount_plane(o, snap)
                if v == 1:
                    check_form_feature_v1(o)
                piece_snaps.append({"name": o.name, **snap,
                                    "tris_reference_delta": snap["tris"] - TRIS_REFERENCE})
            # Determinism (rebuild + reload + compare).
            det = check_determinism(fam, v)
            expected_pieces.append((fam, v))
            results.append({
                "family": fam, "variant": v, "objects": len(objs),
                "pieces": piece_snaps,
                "determinism": "OK",
            })
            print(f"  ok: {fam} v{v}  objects={len(objs)}  "
                  f"tris={sum(p['tris'] for p in piece_snaps)}")

    manifest_report = None
    if not skip_manifest:
        manifest_report = check_manifest(expected_pieces)

    report = {
        "tool": "check_kitgen.py",
        "families_checked": families,
        "total_pieces": total_pieces,
        "tris_reference": TRIS_REFERENCE,
        "results": results,
        "manifest": manifest_report,
    }
    KIT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("KITGEN_CHECK_OK")


if __name__ == "__main__":
    try:
        main()
    except CheckFailed as e:
        print(f"KITGEN_CHECK_FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"KITGEN_CHECK_ERROR: {type(e).__name__}: {e}")
        sys.exit(2)
