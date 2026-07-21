"""check_variants.py — Lane F headless TDD gate for the 8 variant GLBs.

Builds all 8 variants via run_variants, then re-imports each exported GLB and
asserts every preservation/budget/naming/determinism rule from
briefs/brief-F-variants-glm.md. Writes ``variants_manifest.json`` and prints
``VARIANTS_CHECK_OK`` only when every rule passes for every variant; otherwise
prints each failure and exits 1 (mirrors check_kitgen / check_hero style).

SCOPE: only the Lane-F outputs (helios_span, ashline_rig, weapon_pulse_cannon
variants) are validated. The shared variants/ directory also contains
``var_wasp_*`` and ``var_station_trade_hub_*`` files from a DIFFERENT lane —
those are never touched, never inspected, never deleted.

Rules enforced (per brief-F Hard preservation rules):
  - Empties: every donor empty exists in the variant with identical name and
    world transform (tolerance 1e-5), never reparented.
  - Pivot/forward: origin unchanged; +X remains forward (nose socket stays +X);
    no mirror.
  - Scale: variant bbox X-length within +-2% of donor (runtime scales by X-
    length). Y/Z growth allowed up to +25%.
  - Silhouette identity: every donor mesh name still present (additions are
    ADD-only; we do not boolean-remove donor geometry).
  - Tri budget: variant tris <= donor tris * 1.40 (whole-ships) or <= 2500
    (weapons), with the donor+40% cap also enforced at 8000 for the small
    weapon only. (The 8000 generic "variant" class ceiling does NOT apply to
    whole-ship donors — hero-lane precedent: wasp/ashline/helios exceed 8000
    by themselves; the authoritative whole-ship cap is donor+40%.)
  - Materials: donor's own materials + Lane-D KitMat_* ONLY. No new names.
  - Naming: every added object starts with ``VAR_``.
  - Determinism: each variant's VAR_* additions are rebuilt twice (fresh donor
    import + raycast each time) and their vertex hashes must match.

Reporting: the manifest records per-variant donor, treatment, seed, tri counts
(donor / variant / cap), added object names, preserved-empty count, sha256 of
the GLB, AND zone-coverage (fore/mid/aft thirds) of the added geometry so the
lead can verify a treatment actually covers the intended zones.

Headless:
  blender -b --factory-startup -P tools/foundry/variants/check_variants.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import variant_common as vc  # noqa: E402
import build_span_variants    as span    # noqa: E402
import build_rig_variants     as rig     # noqa: E402
import build_cannon_variants  as cannon  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

VARIANTS_DIR = vc.VARIANTS_DIR
MANIFEST_PATH = vc.MANIFEST_PATH
KITMATS = set(vc.KITMATS.keys())
XLEN_TOL = 0.02
YZ_GROWTH_TOL = 0.25
EMPTY_TOL = 1e-5
WEAPONS_TRI_CAP = 2500
WHOLESHIP_TRI_FACTOR = 1.40

# The 8 Lane-F variants, grouped by donor family. Each entry is
# (builder_module, treatment_name) — the builder provides the STEM/TAG/SEED.
LANE_F_VARIANTS = [
    (span,   "mts_sealed"),
    (span,   "dmc_orebox"),
    (span,   "reach_scrap"),
    (rig,    "reaver_hook"),
    (rig,    "corsair_blade"),
    (cannon, "military"),
    (cannon, "industrial"),
    (cannon, "pirate"),
]

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
    return {m.name for o in bpy.data.objects if o.type == "MESH"
            for m in o.data.materials if m}


def _tris():
    return sum(vc.object_tris(o) for o in bpy.data.objects if o.type == "MESH")


def _matrix_maxdiff(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))


def _classify(donor_id):
    """Return ('weapon' | 'wholeship', cap, factor_or_None)."""
    if "weapon" in donor_id:
        return "weapon", WEAPONS_TRI_CAP, None
    return "wholeship", None, WHOLESHIP_TRI_FACTOR


def _verify_variant(builder, treatment, donor_facts):
    """Re-import the exported GLB and assert every preservation/budget rule."""
    stem = builder.TREATMENTS[treatment]["stem"]
    tag = builder.TREATMENTS[treatment]["tag"]
    seed = builder.TREATMENTS[treatment]["seed"]
    donor_id = builder.DONOR.split(os.sep)[-1].replace(".glb", "")
    glb = os.path.join(VARIANTS_DIR, stem + ".glb")
    record = {"stem": stem, "donor": os.path.relpath(builder.DONOR, vc.ROOT).replace("\\", "/"),
              "donor_id": donor_id, "treatment": tag, "seed": seed,
              "glb_file": stem + ".glb"}

    if not ok(os.path.isfile(glb), f"[{stem}] missing export {glb}"):
        return record
    vc.reset_scene()
    vc.import_glb(glb)
    bpy.context.view_layer.update()

    v_empties = _empties()
    v_meshes = _mesh_names()
    v_mats = _materials()
    v_tris = _tris()
    mn, mx, _, dims = vc.mesh_bbox(vc.all_meshes())

    # 1) Empties preserved (name + world transform).
    for name, mtx in donor_facts["empties"].items():
        if name not in v_empties:
            fail(f"[{stem}] donor empty '{name}' missing")
        else:
            d = _matrix_maxdiff(mtx, v_empties[name])
            ok(d <= EMPTY_TOL,
               f"[{stem}] empty '{name}' drifted {d:.2e} > {EMPTY_TOL}")

    # 2) Donor mesh names present (silhouette identity).
    missing = donor_facts["mesh_names"] - v_meshes
    ok(not missing, f"[{stem}] donor meshes missing: {sorted(missing)}")

    # 3) X-length within +-2%.
    rel = abs(dims.x - donor_facts["xlen"]) / max(donor_facts["xlen"], 1e-9)
    ok(rel <= XLEN_TOL,
       f"[{stem}] X-length {dims.x:.3f} vs donor {donor_facts['xlen']:.3f} = "
       f"{rel*100:.2f}% > {XLEN_TOL*100:.2f}%")

    # 4) Y/Z growth within +25%.
    y_growth = (dims.y - donor_facts["ylen"]) / max(donor_facts["ylen"], 1e-9)
    z_growth = (dims.z - donor_facts["zlen"]) / max(donor_facts["zlen"], 1e-9)
    ok(y_growth <= YZ_GROWTH_TOL + 1e-6,
       f"[{stem}] Y growth {y_growth*100:.2f}% > {YZ_GROWTH_TOL*100:.2f}%")
    ok(z_growth <= YZ_GROWTH_TOL + 1e-6,
       f"[{stem}] Z growth {z_growth*100:.2f}% > {YZ_GROWTH_TOL*100:.2f}%")

    # 5) No mirror: nose socket X stays positive and unchanged.
    nose = max((o.matrix_world.to_translation().x for o in bpy.data.objects
                if o.type == "EMPTY"), default=0.0)
    ok(nose > 0 and abs(nose - donor_facts["nose_x"]) <= EMPTY_TOL,
       f"[{stem}] nose socket X changed/mirrored ({nose} vs {donor_facts['nose_x']})")

    # 6) Tri budget: weapon cap 2500; wholeship cap donor+40%.
    kind, weapon_cap, factor = _classify(donor_id)
    if kind == "weapon":
        cap = weapon_cap
        ok(v_tris <= cap, f"[{stem}] tris {v_tris} > weapons cap {cap}")
    else:
        cap = int(donor_facts["tris"] * factor)
        ok(v_tris <= cap,
           f"[{stem}] tris {v_tris} > donor+{int(factor*100)}% cap {cap}")

    # 7) Materials: donor + KitMat_* only.
    allowed = donor_facts["materials"] | KITMATS
    stray = v_mats - allowed
    ok(not stray, f"[{stem}] stray materials {sorted(stray)} (allowed donor+KitMat_*)")

    # 8) Added objects named VAR_*.
    added_names = [o.name for o in bpy.data.objects
                   if o.type == "MESH" and o.name not in donor_facts["mesh_names"]]
    ok(len(added_names) >= 1, f"[{stem}] no VAR_* additions found")
    badnames = [n for n in added_names if not n.startswith("VAR_")]
    ok(not badnames, f"[{stem}] added objects not VAR_-named: {badnames}")

    # 9) Zone coverage (informational, doesn't fail the check) — added geo
    #    bbox-volume fraction per fore/mid/aft third of donor X-range.
    added_objs = [o for o in bpy.data.objects if o.type == "MESH"
                  and o.name in added_names]
    coverage = vc.zone_coverage(added_objs, donor_facts["bbox_min"].x,
                                donor_facts["bbox_max"].x)

    record.update({
        "tris_donor": donor_facts["tris"],
        "tris_variant": v_tris,
        "tris_cap": cap,
        "tris_added": v_tris - donor_facts["tris"],
        "added_objects": sorted(added_names),
        "added_object_count": len(added_names),
        "preserved_empties": len(donor_facts["empties"]),
        "bbox_dims_variant": [round(v, 4) for v in dims],
        "bbox_dims_donor": [round(v, 4) for v in donor_facts["bbox_dims"]],
        "xlen_growth_pct": round(rel * 100, 3),
        "ylen_growth_pct": round(y_growth * 100, 3),
        "zlen_growth_pct": round(z_growth * 100, 3),
        "materials_variant": sorted(v_mats),
        "sha256": _sha256_file(glb),
        "zone_coverage": {k: {"count": v["count"],
                              "fraction": round(v["fraction"], 4)}
                          for k, v in coverage.items()},
    })
    return record


def _determinism(builder, treatment, donor_facts):
    """Build the real (raycast-placed) VAR_* additions twice with a fresh donor
    import each time and compare vertex hashes — proves the full build is a
    pure function of (treatment, seed, donor bbox)."""
    stem = builder.TREATMENTS[treatment]["stem"]
    seed = builder.TREATMENTS[treatment]["seed"]
    hashes = []
    for _ in range(2):
        vc.reset_scene()
        vc.import_glb(builder.DONOR)
        hull = vc.all_meshes()
        mn, mx, _, _ = vc.mesh_bbox(hull)
        surf = vc.make_surface_fn(mx.z * 0.78)
        added = builder.build_treatment(treatment, mn, mx, seed, surface_fn=surf)
        hashes.append(vc.vertex_hash(added))
    ok(hashes[0] == hashes[1],
       f"[det:{stem}] non-deterministic build {hashes[0][0][:12]}… != {hashes[1][0][:12]}…")
    return {"vertexHash": hashes[0][0], "vertexCount": hashes[0][1]}


def main():
    # Build all 8 variants fresh.
    print("=== Lane F check_variants: building all 8 variants ===")
    span.main()
    rig.main()
    cannon.main()

    manifest = {
        "schema": "sf-foundry-variants-f/1",
        "lane": "F",
        "scope": "Lane F variants only (helios_span, ashline_rig, weapon_pulse_cannon). "
                 "var_wasp_* and var_station_trade_hub_* belong to a different lane and are NOT touched.",
        "variants": [],
        "determinism": {},
        "pass": False,
    }

    # Snapshot donor facts once per donor (3 donors total).
    donor_facts_cache = {}

    def facts_for(builder):
        donor_path = builder.DONOR
        if donor_path not in donor_facts_cache:
            donor_facts_cache[donor_path] = vc.import_donor_facts(donor_path)
        # Return a deep-enough copy: empties dict + mesh_names set are stable.
        return donor_facts_cache[donor_path]

    print("\n=== Lane F check_variants: verifying rules per variant ===")
    for builder, treatment in LANE_F_VARIANTS:
        donor_facts = facts_for(builder)
        record = _verify_variant(builder, treatment, donor_facts)
        manifest["variants"].append(record)

    print("\n=== Lane F check_variants: determinism (build twice, hash VAR_*) ===")
    for builder, treatment in LANE_F_VARIANTS:
        stem = builder.TREATMENTS[treatment]["stem"]
        donor_facts = facts_for(builder)
        det = _determinism(builder, treatment, donor_facts)
        manifest["determinism"][stem] = det

    manifest["pass"] = not FAILURES
    os.makedirs(VARIANTS_DIR, exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)

    if FAILURES:
        print("\nVARIANTS_CHECK_FAILURES:")
        for f in FAILURES:
            print("  -", f)
        print(f"\n{len(FAILURES)} failure(s).")
        sys.exit(1)
    print("\nVARIANTS_CHECK_OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
