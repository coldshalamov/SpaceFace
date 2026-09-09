<!-- LIFETIME: DURABLE -->
# Everyday Space Kit — integration instructions (SOURCE ONLY, nothing is wired)

Status of every asset here: **`design_candidate`**. Nothing in this tree is referenced
by any live manifest, selector, or runtime file. This document is what a later
exact-path lane needs to scatter believable worksites around hero nouns without
redesigning the kit.

## Preservation disposition (independent review, 2026-08-08)

**KEEP as source-only donors; REVISE before any promotion.** The independent
technical and original-resolution review recorded at the end of
`evidence/REVIEW-round-1.md` is controlling for this preservation snapshot. It
does not accept these assets for runtime use or close any visual, performance,
accessibility, headed, or G0-G7 gate.

**Byte reproducibility (PQ-045.prop-promotion gate, 2026-08-10):** closed.
Two isolated Blender 5.1.2 factory-startup builds match 46/46 bytewise. Tree
digest `100eb9cae4ffa087fd23501abd453350cc95a33a22c90e493042abeb1065df28`.
Evidence: `evidence/reproducibility/TWO_BUILD_HASH_TABLE.md`.

**Mechanism fixed:** Blender's glTF exporter emitted identical vertices and JSON
but reordered triangle indices across clean runs. The builder now triangulates
FIXED/EAR_CLIP and rebuilds faces sorted by `(material_index, sorted verts,
winding)` before export, with name-sorted selection. See
`tools/blender/build_everyday_space_kit.py` (`stabilize_mesh_for_export`).

Historical preservation snapshot (pre-fix): 46 GLBs / 4,474,412 bytes, digest
`871009f53b42693241f3a680675f1552491db280992a1494162893ddb8c1cb3a` — semantic
parity only, not byte-deterministic.

Promotion must begin by selecting and re-authoring an exact family or asset, not
by copying this pack wholesale. At minimum it must close the capped
`crusher_module` feed, derive tight bounds/collision from evaluated or exported
vertices, replace flat/double-sided placeholder surfacing where appropriate,
author real LODs, and regenerate a clean atomic evidence epoch from the finalized
GLBs. The current family sheets and composition boards are useful donor/reference
views only; they are not runtime, release, or exact-source visual acceptance.

### PQ-045.prop-promotion production slice (sixteen selected)

The ledger §4.2 sixteen (outside the 19 REVISE-first) are production-packaged under
`production/` by `tools/blender/build_everyday_space_props_production.py` and
published via `tools/art/publish_everyday_space_props.mjs` +
`scripts/build-place-release-assets.mjs` to `place_<id>` rows. Evidence:
`production/evidence/`. Runtime scatter/wiring remains other PQ-045 leaves.
G1/G2/G4 whole-asset visual gates stay open pending independent review.

## What exists

- `source/` — ~46 authored/no-RNG GLBs: ~40 base props + geometry-state variants
  (`*_breached`, `*_abandoned`, `*_cold`, `*_bent`, `*_derelict`, `*_patched`)
  across six families (cargo / mining / service / law / civic / salvage).
- `evidence/build-report.json` — per asset: sha256, triangles, parts, envelope,
  socket list, box collision proxy, family, role, state notes, placement note,
  LOD plan, status.
- `evidence/KIT_CATALOG.md` — generated dimensions/role catalog (do not hand-edit).
- `evidence/EXISTING_COVERAGE.md` — the duplication guard: what live `place_*`
  assets already covered and which brief items were deliberately skipped
  (route beacon, warning buoy, billboard, small lane markers).
- `evidence/family-<name>.png` — six labelled per-family donor contact sheets;
  several crops/labels reduce their value as identification evidence.
- `evidence/<id>.png` + `<id>@<d>u.png` — hero framing + size-class distance bands
  (small 30/60/110 wu, medium 60/95/145, large 95/125/165 — chosen against the R1
  visible bubble in `design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md`). These
  renders are reviewed donor evidence, but the builder does not import the
  finalized GLBs or atomically bind the full PNG set to one source epoch.
- `evidence/comp1..comp6_*.png` + `evidence/compositions.json` — the six composition
  boards (mining worksite, refinery loading, customs checkpoint, repair yard,
  shipbreaking yard, station construction) AND the machine-readable instance lists
  that replay them: `{asset, positionM, yawDeg}` per instance, staging props listed
  separately as render-only.
- `evidence/PLACEMENT_RULES.md` — composition grammar for scattering the kit.
- `design/fiction/THE_COMMON_YARD.md` — manufacturing standards, the light law,
  family paint, state doctrine. The design authority for extensions.

## Contracts the GLBs follow

- **Axis:** +Z up, +X = principal working face where one exists (gate lenses,
  signal faces, coupling booms, crane reach all face/extend +X). glTF export y-up.
  Props are yard plant — most are used at arbitrary yaw; `compositions.json`
  demonstrates intended orientations.
- **Scale:** 1 unit = 1 metre, no family multiplier, sized against the 28 m player
  hull. The Berth pod (6×3×3) is deliberately the SAME footprint as the working
  fleet's shared cargo container.
- **Sockets:** `SOCKET_*` PLAIN_AXES empties parented to the root; every socket is
  listed in `build-report.json`. Purposes are functional: `SOCKET_Berth*` = where a
  craft holds, `SOCKET_Power_Out`/`SOCKET_Power_In` = trunk endpoints,
  `SOCKET_Drill_Bit`/`SOCKET_Torch`/`SOCKET_Jaw`/`SOCKET_Scan_Emitter` = VFX anchor,
  `SOCKET_Hoist_Center`/`SOCKET_Clamp*` = crane/logistics grab points,
  `SOCKET_Approach`/`SOCKET_Gate`/`SOCKET_Lane_Center` = traffic geometry.
- **Collision:** one `COLLISION_HULL` EMPTY per prop (empty, not mesh — a mesh fails
  the assetLoader material-map contract), scale = box half-extents; same box in
  `build-report.json`. These conservative boxes contain the source geometry, but
  the current bound-of-bounds calculation materially overstates nine assets
  (worst: `crusher_module`, +19.4% X and +52.3% Y versus exported vertices).
  Recompute tight bounds before runtime use. Gate/gantry portals additionally need
  a refined multi-box proxy at promotion (note in their rows).
- **Materials:** flat `esk_*` roles, one Principled BSDF each, same promotion
  contract as `npcwork_*`. Paint roles are the faction hook: recolor
  `esk_paint_*`, keep trade/light roles, and a yard changes owner without changing
  function. Emissive roles follow THE_COMMON_YARD §2 (amber extraction, blue-white
  service, arc-blue authority, warm cabin, hooded-red criminal). Cold/dead states
  of lit props are separate variant GLBs or a documented role swap at instancing
  (e.g. radiator cores → `esk_bare_steel`).
- **LOD:** per-asset plans recorded in `build-report.json` (house thresholds:
  LOD1 below 120 px projected width, LOD2 below 45 px). LOD GLBs are not built —
  that is promotion work. Trusses are pre-joined single meshes precisely so LOD1
  can swap them for box girders without a part-count explosion.

## How a later lane uses this (three independent levels)

1. **Static scatter (smallest step):** first re-author and review selected props,
   then promote only those exact assets to
   `assets/ships/parts/` + manifest rows (the lane-furniture precedent), then
   instance them around existing sites via the sector decoration path. Replaying
   `compositions.json` can guide placement, but is not itself a runtime-authoring
   or acceptance receipt.
2. **Site composition:** use `PLACEMENT_RULES.md` + `compositions.json` as the
   grammar for a procedural or authored site composer (active worksites get
   light + consumables + cable truth; dead ones get the subtraction states).
3. **Work binding:** the six job kinds already move craft between sites — the kit's
   sockets give their signals physical anchor points (a barge unloads AT
   `SOCKET_Feed`, a tender welds AT `SOCKET_Torch`-adjacent scaffolds, customs
   scans FROM `SOCKET_Scan_Emitter`). Nothing here writes sim state; anchoring is
   presentation-layer work per the npcJobSignatureVfx precedent.

## What this pack does NOT do (by brief)

No release artifacts, no manifest rows, no runtime edits, no live asset replaced,
no runtime dependency introduced. Composition boards are offline reference scenes,
not sectors. Promotion authority belongs to whoever holds those exact paths later.
