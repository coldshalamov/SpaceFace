"""Fleet Breadth Foundry — HERO lane TDD gate.

Builds both hero missions, then re-imports the exported GLBs and asserts every
preservation/budget/naming/determinism rule. Writes hero_manifest.json. Prints
HERO_CHECK_OK and exits 0 only when all pass; otherwise prints each failure and
exits 1 (mirrors check_kitgen / check_variants style).

Rules enforced:
  WASP variants (full donor + additions):
    - every donor empty present, world transform within 1e-5 (never reparented)
    - +X forward preserved (nose sockets stay +X; no mirror)
    - bbox X-length within +-2% of donor (runtime scales by X-length)
    - all donor mesh names present (silhouette identity)
    - tris <= donor tris * 1.40 (donor+40%)
    - materials subset of donor materials + KitMat_*
    - >=1 added object, ALL added objects named VAR_*
  HUB overlays (additions only):
    - tris <= 12000
    - all objects named VAR_*
    - materials subset of KitMat_*
    - authored in donor frame (overlay bbox inside a sane hub envelope; origin at 0)
  Determinism (both): build twice -> identical VAR_ vertex hash + count.

Headless: blender -b --factory-startup -P tools/foundry/hero/check_hero.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import hero_common as hc  # noqa: E402
import build_wasp_kits as bwk  # noqa: E402
import build_tradehub_overlays as bto  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

ROOT = bwk.ROOT
VARIANTS_DIR = os.path.join(ROOT, "assets", "ships", "foundry", "fleet_breadth_20260720", "variants")
KITMATS = set(hc.KITMATS.keys())
WASP_TRI_FACTOR = 1.40
HUB_TRI_CAP = 12000
XLEN_TOL = 0.02
EMPTY_TOL = 1e-5

FAILURES = []


def fail(msg):
    FAILURES.append(msg)


def ok(cond, msg):
    if not cond:
        fail(msg)
    return cond


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _empties():
    return {o.name: o.matrix_world.copy() for o in bpy.data.objects if o.type == "EMPTY"}


def _mesh_names():
    return {o.name for o in bpy.data.objects if o.type == "MESH"}


def _materials():
    return {m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials if m}


def _tris():
    return sum(hc.object_tris(o) for o in bpy.data.objects if o.type == "MESH")


def _matrix_maxdiff(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))


def donor_facts():
    hc.reset_scene()
    hc.import_glb(bwk.DONOR)
    bpy.context.view_layer.update()
    meshes = hc.all_meshes()
    mn, mx, _, dims = hc.mesh_bbox(meshes)
    facts = {
        "empties": _empties(),
        "mesh_names": _mesh_names(),
        "materials": _materials(),
        "tris": _tris(),
        "xlen": dims.x,
        "mn": mn.copy(),
        "mx": mx.copy(),
        "nose_x": max(o.matrix_world.to_translation().x for o in bpy.data.objects if o.type == "EMPTY"),
    }
    return facts


def verify_wasp_variant(faction, glb, donor):
    stem = bwk.FACTIONS[faction]["stem"]
    tag = bwk.FACTIONS[faction]["tag"]
    if not ok(os.path.isfile(glb), f"[wasp:{faction}] missing export {glb}"):
        return {}
    hc.reset_scene()
    hc.import_glb(glb)
    bpy.context.view_layer.update()

    v_empties = _empties()
    v_meshes = _mesh_names()
    v_mats = _materials()
    v_tris = _tris()
    mn, mx, _, dims = hc.mesh_bbox(hc.all_meshes())

    # empties preserved (name + world transform)
    for name, mtx in donor["empties"].items():
        if name not in v_empties:
            fail(f"[wasp:{faction}] donor empty '{name}' missing")
        else:
            d = _matrix_maxdiff(mtx, v_empties[name])
            ok(d <= EMPTY_TOL, f"[wasp:{faction}] empty '{name}' drifted {d:.2e} > {EMPTY_TOL}")
    # donor meshes present
    missing = donor["mesh_names"] - v_meshes
    ok(not missing, f"[wasp:{faction}] donor meshes missing: {sorted(missing)}")
    # X-length +-2%
    rel = abs(dims.x - donor["xlen"]) / donor["xlen"]
    ok(rel <= XLEN_TOL, f"[wasp:{faction}] X-length {dims.x:.3f} vs donor {donor['xlen']:.3f} = {rel*100:.2f}% > 2%")
    # no mirror: nose socket stays +X
    nose = max((o.matrix_world.to_translation().x for o in bpy.data.objects if o.type == "EMPTY"), default=0)
    ok(nose > 0 and abs(nose - donor["nose_x"]) <= EMPTY_TOL, f"[wasp:{faction}] nose socket X changed/mirrored ({nose})")
    # tris budget
    cap = int(donor["tris"] * WASP_TRI_FACTOR)
    ok(v_tris <= cap, f"[wasp:{faction}] tris {v_tris} > donor+40% cap {cap}")
    # materials subset
    allowed = donor["materials"] | KITMATS
    stray = v_mats - allowed
    ok(not stray, f"[wasp:{faction}] stray materials {sorted(stray)} (allowed donor+KitMat_*)")
    # added objects named VAR_*
    added = [o.name for o in bpy.data.objects if o.type == "MESH" and o.name not in donor["mesh_names"]]
    ok(len(added) >= 1, f"[wasp:{faction}] no VAR_ additions found")
    badnames = [n for n in added if not n.startswith("VAR_")]
    ok(not badnames, f"[wasp:{faction}] added objects not VAR_-named: {badnames}")

    return {
        "donor": os.path.relpath(bwk.DONOR, ROOT).replace("\\", "/"),
        "treatment": tag, "seed": bwk.FACTIONS[faction]["seed"],
        "tris_donor": donor["tris"], "tris_variant": v_tris, "tris_cap": cap,
        "added_objects": sorted(added), "preserved_empties": len(donor["empties"]),
        "xlen_variant": round(dims.x, 4), "xlen_donor": round(donor["xlen"], 4),
        "materials": sorted(v_mats), "sha256": _sha256_file(glb),
        "rivet_pass_attachment_zones": bwk.WASP_ATTACH_NOTES[faction],
    }


def verify_hub_overlay(faction, glb):
    stem = bto.OVERLAYS[faction]["stem"]
    if not ok(os.path.isfile(glb), f"[hub:{faction}] missing export {glb}"):
        return {}
    hc.reset_scene()
    hc.import_glb(glb)
    bpy.context.view_layer.update()
    meshes = hc.all_meshes()
    names = [o.name for o in meshes]
    mats = _materials()
    tris = _tris()
    mn, mx, _, dims = hc.mesh_bbox(meshes)

    ok(tris <= HUB_TRI_CAP, f"[hub:{faction}] tris {tris} > cap {HUB_TRI_CAP}")
    bad = [n for n in names if not n.startswith("VAR_")]
    ok(not bad, f"[hub:{faction}] objects not VAR_-named: {bad}")
    stray = mats - KITMATS
    ok(not stray, f"[hub:{faction}] stray materials {sorted(stray)} (allowed KitMat_* only)")
    # Authored in the donor frame: overlay bbox must sit within a sane envelope of
    # the hub. Station-scale overlays INTENTIONALLY extend past the donor bbox — SCN
    # customs booms reach ~37 m past the -X berth wall, masts/billboards rise ~28 m
    # above the 28.7 m roof, MTS standoff rings float ~18 m outside the hull, Free
    # outrigger pods break the rim by ~25 m. The envelope is widened per-axis to match
    # (with headroom) but stays bounded, so it still rejects gross authoring/origin
    # errors. (Repair round 2026-07-20: was a flat +-20 m for the ornament-scale v1.)
    fr = bto.HUB_FRAME
    XY_OUT, Z_UP, Z_DOWN = 44.0, 32.0, 26.0
    env_ok = (mn.x >= fr["min"][0] - XY_OUT and mx.x <= fr["max"][0] + XY_OUT
              and mn.y >= fr["min"][1] - XY_OUT and mx.y <= fr["max"][1] + XY_OUT
              and mn.z >= fr["min"][2] - Z_DOWN and mx.z <= fr["max"][2] + Z_UP)
    ok(env_ok, f"[hub:{faction}] overlay bbox {[round(v,1) for v in mn]}..{[round(v,1) for v in mx]} outside hub envelope")

    return {
        "donor": bto.DONOR_REL, "anchorFrame": "donor-origin",
        "intendedFaction": bto.OVERLAYS[faction]["intendedFaction"],
        "treatment": bto.OVERLAYS[faction]["tag"], "seed": bto.OVERLAYS[faction]["seed"],
        "tris": tris, "tris_cap": HUB_TRI_CAP, "objects": sorted(names),
        "bbox_min": [round(v, 3) for v in mn], "bbox_max": [round(v, 3) for v in mx],
        "materials": sorted(mats), "sha256": _sha256_file(glb),
        "attachNotes": bto.ATTACH_NOTES[faction],
    }


def determinism_wasp(faction, mn, mx):
    """Build the real (raycast-placed) additions twice with a fresh donor import each
    time and compare VAR_ vertex hashes — proves the full build is reproducible."""
    seed = bwk.FACTIONS[faction]["seed"]
    hashes = []
    for _ in range(2):
        hc.reset_scene()
        hc.import_glb(bwk.DONOR)
        m0, m1, _c, _d = hc.mesh_bbox(hc.all_meshes())
        surf = bwk._raycast_surface(m1.z * 0.78)
        objs = bwk.build_faction(faction, m0, m1, seed, surface_fn=surf)
        hashes.append(hc.vertex_hash(objs))
    ok(hashes[0] == hashes[1], f"[det:wasp:{faction}] non-deterministic build {hashes[0]} != {hashes[1]}")
    return hashes[0]


def determinism_hub(faction):
    seed = bto.OVERLAYS[faction]["seed"]
    hashes = []
    for _ in range(2):
        hc.reset_scene()
        objs = bto.build_overlay(faction, bto.HUB_FRAME, seed)
        hashes.append(hc.vertex_hash(objs))
    ok(hashes[0] == hashes[1], f"[det:hub:{faction}] non-deterministic build {hashes[0]} != {hashes[1]}")
    return hashes[0]


def main():
    # Build both missions fresh.
    bwk.main()
    bto.main()

    manifest = {"schema": "sf-foundry-hero/1", "wasp": {}, "hub": {}, "determinism": {}}
    donor = donor_facts()

    for faction in bwk.FACTIONS:
        glb = os.path.join(VARIANTS_DIR, bwk.FACTIONS[faction]["stem"] + ".glb")
        manifest["wasp"][faction] = verify_wasp_variant(faction, glb, donor)

    for faction in bto.OVERLAYS:
        glb = os.path.join(VARIANTS_DIR, bto.OVERLAYS[faction]["stem"] + ".glb")
        manifest["hub"][faction] = verify_hub_overlay(faction, glb)

    # determinism (build twice; hash VAR_ geometry only — donor is constant)
    for faction in bwk.FACTIONS:
        h, n = determinism_wasp(faction, donor["mn"], donor["mx"])
        manifest["determinism"][f"wasp_{faction}"] = {"vertexHash": h, "vertexCount": n}
    for faction in bto.OVERLAYS:
        h, n = determinism_hub(faction)
        manifest["determinism"][f"hub_{faction}"] = {"vertexHash": h, "vertexCount": n}

    manifest["pass"] = not FAILURES
    with open(os.path.join(VARIANTS_DIR, "hero_manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)

    if FAILURES:
        print("\nHERO_CHECK_FAILURES:")
        for f in FAILURES:
            print("  -", f)
        print(f"\n{len(FAILURES)} failure(s).")
        sys.exit(1)
    print("HERO_CHECK_OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
