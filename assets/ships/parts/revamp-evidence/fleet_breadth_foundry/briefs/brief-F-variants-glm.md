# LANE F — EXTERIOR VARIANT FAMILIES (deterministic donor-variant builds)

Read `briefs/common.md` first and obey it. Then read, in order:
1. `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.md` — why these donors.
2. `design/foundry/FACTION_SURFACE_LANGUAGE.md` — the art bible. Your variants IMPLEMENT it.
3. `assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json` — numbers.
4. `tools/foundry/kitgen/kitgen.py` + `kit_manifest.json` — the microdetail vocabulary. REUSE it.
5. `design/foundry/FOUNDRY_CONTRACT.md` + `tools/foundry/import_donor.py` (donor import helper).

## Mission

Build 8 variant candidates of the three highest-frequency donors the audit identified. A reused
donor must stay recognizable, but a variant must no longer read as the same ship dipped in
different paint — construction changes, per the bible.

| # | Output GLB (in `assets/ships/foundry/fleet_breadth_20260720/variants/`) | Donor | Treatment |
|---|---|---|---|
| 1 | `var_helios_span_mts_sealed_v01.glb` | `assets/ships/parts/wholeships/helios_span.glb` | Corporate sealed hold: clamshell fairings over the cargo frames, flush access rows, conformal sensor blisters (bible §MTS) |
| 2 | `var_helios_span_dmc_orebox_v01.glb` | same | DMC ore-box: open ribbed ore boxes with doubler plates + dome-rivet rows, pipe runs with clamps, work lamps (bible §DMC) |
| 3 | `var_helios_span_reach_scrap_v01.glb` | same | Reach scrap hauler: mixed-thickness scavenge plates over the spine, torch-cut edges, stitch welds, big standoff collars (bible §Reach) |
| 4 | `var_ashline_rig_reaver_hook_v01.glb` | `assets/ships/parts/wholeships/ashline_rig.glb` | Reaver hook-scavenger: salvage crane/hook gantry, grapple spars, drag-scarred prow plates |
| 5 | `var_ashline_rig_corsair_blade_v01.glb` | same | Corsair blade-raider: swept blade fairings, forward weapon collars, ram lip — same skeleton, different predator |
| 6 | `var_weapon_pulse_cannon_military_v01.glb` | `assets/ships/parts/weapons/weapon_pulse_cannon.glb` | SCN shroud: fitted armor shroud, recessed fastener rows, frame-line emissive (bible §SCN) |
| 7 | `var_weapon_pulse_cannon_industrial_v01.glb` | same | DMC clamp: exposed clamp-mount, pipe clamp + conduit, gusset brackets, hazard band region |
| 8 | `var_weapon_pulse_cannon_pirate_v01.glb` | same | Reach weld jacket: scrap sleeve, stitch welds, mismatched plates, scorched muzzle collar |

Variants 4+5 exist because BOTH `reaver_pirate` and `corsair_raider` currently map to the same
`ashline_rig.glb` (`partsLibrary.js:417-418`) — after this, the two hostile types can stop being
twins. Silhouette-level differences must be visible in the top-down view.

## Hard preservation rules (the check must enforce)

- **Empties/sockets:** every empty (MOUNT_*/SOCKET_*/HOOK_* or any other) in the donor must exist
  in the variant with IDENTICAL name and world transform (tolerance 1e-5). Never reparent them.
- **Pivot/forward:** do not move the origin; +X remains forward; do not mirror.
- **Scale:** variant bbox length (X) within ±2% of donor (runtime scales by X-length ONLY —
  partsLibrary scale rule). Y/Z growth allowed up to +25% where the treatment justifies it.
- **Silhouette identity:** donor hull meshes stay present (you may cut/displace ≤ small regions;
  prefer ADDING construction on top). Removing major donor geometry is forbidden.
- **Tri budget:** variant total ≤ donor tris + 40%, hard cap 8000 (weapons cap 2500).
- **Materials:** donor's own materials + Lane D `KitMat_*` ONLY. No new material names. Painted
  additions use `KitMat_Paint` (neutral — runtime faction tint multiplies it).
- **Naming:** added objects `VAR_<TREATMENT>_<what>`; keep donor node names unchanged.
- **Determinism:** one build script per variant family under `tools/foundry/variants/`
  (`build_span_variants.py`, `build_rig_variants.py`, `build_cannon_variants.py`), all driven by
  `random.Random(seed)`; a shared `run_variants.py` headless entry builds all 8; `check_variants.py`
  (headless, same pattern as check_kitgen) asserts every rule above by re-importing the exported
  GLBs and comparing against freshly-imported donors, exits 0 printing `VARIANTS_CHECK_OK`, and
  writes `variants_manifest.json` (donor, treatment, seed, tris donor/variant, added objects,
  preserved empties count, sha256).

## Method notes

- Import donors with `tools/foundry/import_donor.py` helpers if present; else
  `bpy.ops.import_scene.gltf(filepath=...)`. If a donor fails to import (compressed payload),
  document it and use `node tools/art/decompress_part.mjs` (existing tool) to produce a
  plain-GLB copy UNDER YOUR OWN foundry dir first — never modify the donor in place.
- Reuse kitgen builders for rivet strips, welds, clamps, collars, brackets wherever the bible
  calls for them — placement counts/spacing per faction profile (`fasteners.spacingM`, disciplined
  ±2% / organic ±15% jitter as the bible's consumption notes specify).
- Bible §12 per-faction module preferences tell you WHICH kit families each faction favors.
- Scale sanity: helios_span is a large hauler; read its real dims from import and size additions
  in real metres (cargo frames ~1-2 m, plates 0.4-2 m per bible segmentation).
- You cannot see renders. Compensate with measurements: after each export, your check re-imports
  and reports added-geometry bbox coverage per hull region (fore/mid/aft thirds) so you can
  verify the treatment actually covers the intended zones. The lead runs a separate visual
  review; expect a repair round and write build scripts so treatments are parameter-tweakable.

Finish per common protocol (report: `reports/F-VARIANTS-REPORT.md`). Done only when
`check_variants.py` exits 0 with VARIANTS_CHECK_OK and all 8 GLBs + manifest exist.
