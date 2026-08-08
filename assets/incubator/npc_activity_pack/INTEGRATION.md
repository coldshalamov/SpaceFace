<!-- LIFETIME: DURABLE -->
# NPC Activity Pack — integration instructions (SOURCE ONLY, nothing is wired)

Status of every asset here: **`design_candidate`** (per `assets/ships/AGENTS.md` state
vocabulary). Nothing in this tree is referenced by any live manifest, selector, or
runtime file. This document is what a later exact-path lane needs to wire a role
without redesigning its visual behavior.

Independent preservation verdict: **KEEP as source-only donor/design-candidate material**.
This permits retaining the packet in Git; it is not art, runtime, release, performance,
or G0-G7 acceptance. See `evidence/REVIEW-independent-2026-08-08.md`.

## What exists

- `source/` — 15 authored/no-RNG GLBs (12 families + `ore_barge_b`,
  `volatiles_tanker_b`, `salvage_cutter_damaged`). `build-report.json` now records the
  generator provenance that was available. Byte reproducibility is **not established**:
  the original build did not capture its Blender version, so promotion requires two full
  rebuilds under one pinned toolchain.
- `evidence/build-report.json` — per asset: sha256, triangles, envelope, socket list,
  box collision proxy (center + half-extents), job-kind/traffic-role mapping, signal
  list, socket purposes, LOD plan, status.
- `evidence/ROLE_MATRIX.md` — the duplication guard (what existed vs. what this adds).
- `evidence/ACTIVITY_STATES.md` — per-craft choreography on the EXISTING job kernel.
- `evidence/role-identification-sheet.png` — all 12 families, labeled, one frame.
- `evidence/activity-gallery.png` — all 12 mid-work with staged props (render-only).
- `evidence/<id>.png` + `<id>@95u/@125u/@165u.png` — turntable + R1-band
  diagnostic views (not normal-route readability proof).
- `design/fiction/THE_WORKING_FLEET.md` — the fiction; each hull's reason to exist.

## Contracts the GLBs follow

- **Axis:** +X nose (matches `src/render/visualFactory.js` contract: renderer sets
  `mesh.rotation.y = -entity.rot`, +X must face forward). glTF export is y-up.
- **Scale:** 1 unit = 1 metre, no family multiplier. Sized against the 28 m player hull
  and the R1 camera bands (`design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md`).
- **Sockets:** `SOCKET_<Role>_<Position>` PLAIN_AXES empties parented to the root,
  canonical names reused where semantics match (`SOCKET_Engine_Main`,
  `SOCKET_Trail_Main`, `SOCKET_Cargo_Ventral`, `SOCKET_Camera_Focus`, …) plus
  role extensions (`SOCKET_Coupling_Front`, `SOCKET_Scan_Pin`, `SOCKET_Push_Front`,
  `SOCKET_Hoist_Main`, `SOCKET_Inspection_Front`, `SOCKET_Bay_Front`, …). Every socket
  in a GLB is listed in `build-report.json` — a parts_manifest row can copy it verbatim
  (the `check:parts-manifest` "all GLB sockets declared" gate).
- **Collision:** one `COLLISION_HULL` EMPTY per craft (empty, not mesh — a mesh fails
  the assetLoader material-map contract), scale = box half-extents; the same box is in
  `build-report.json`. Recommended entity `collisionRadius` ≈ half the largest extent
  (skiff ~9, cutter/survey ~10, customs/rescue ~11, tender/tug ~12, liner ~15,
  tanker ~18, barge/rig ~22).
- **Materials:** flat `npcwork_*` roles, one Principled BSDF each. Paint roles
  (`npcwork_hull_paint_{ochre,teal,rust,bone,navyarc}`) are the faction hook — recolor
  paint, keep trade roles, and a family changes owner without changing trade. Emissive
  roles are the trade color code (amber mining / blue-white repair / green survey /
  orange salvage / arc-blue authority / red-white emergency). A promotion lane maps
  these onto the 15-role `wholeShipMaterialContract` and authors real textures at the
  1024 px house profile.
- **LOD:** LOD plans are recorded per asset in `build-report.json` (house thresholds:
  LOD1 below 120 px projected width, LOD2 below 45 px). LOD1/LOD2 GLBs are not built —
  authoring them belongs to promotion, and every plan names exactly which parts drop.

## Known scale defects retained with the donor packet

The fiction lengths are nominal design briefs, not verified GLB envelopes. Eight base
families differ materially. This table keeps that contradiction visible; it does not
authorize scaling the packet wholesale. A promotion lane must reconcile form and fiction
per selected family and keep G0/G1 open until then.

| Family | Fiction length | Measured GLB X envelope | Delta |
|---|---:|---:|---:|
| `prospector_skiff` | 16 m | 18.175 m | +2.175 m |
| `scrap_sweeper` | 20 m | 18.012 m | -1.988 m |
| `yard_tug` | 26 m | 16.800 m | -9.200 m |
| `survey_pin` | 22 m | 18.712 m | -3.288 m |
| `liner_shuttle` | 34 m | 30.097 m | -3.903 m |
| `customs_cutter` | 24 m | 22.778 m | -1.222 m |
| `rescue_lifter` | 28 m | 22.602 m | -5.398 m |
| `construction_rig` | 48 m | 44.052 m | -3.948 m |

## How a later lane wires a role (three independent levels)

1. **Whole-ship binding (visual only, smallest step):** add a row to
   `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` in `src/render/partsLibrary.js` after promoting a
   release pair — e.g. `salvor: 'wholeships/salvage_cutter.glb'`, `tender:
   'wholeships/repair_tender.glb'`, `surveyor: 'wholeships/survey_pin.glb'`, `rescue`,
   `express`, `smuggler` (deliberately NOT a new hull — see below). This alone converts
   six faceless modular-fallback roles into identifiable craft and resolves both
   fiction↔code hull contradictions. New roles (tanker/tug/customs/construction/
   sweeper) additionally need a `TRAFFIC_ROLES` entry to exist at all.
2. **Work-state binding:** attach the existing signal layer's lamps/streaks to this
   pack's sockets per `evidence/ACTIVITY_STATES.md`. The signal profiles, cadences,
   deploy scalar and reactions all already exist; the sockets give them anchor points.
3. **Promotion:** source GLB → `assets/ships/parts/wholeships/` mirror + parts_manifest
   row (P2, source-only) → KTX2/Meshopt release via the `build-sg04` pipeline → release
   manifest row. Follow the lane-furniture precedent for the source-only intermediate
   state. None of this is done here, deliberately.

## Deliberate non-hulls

- **Smuggler:** signal is absence (fiction §13). Skin: `courier` (Helios Lark),
  `liner_shuttle`, or a battered `volatiles_tanker`. Forgery seams to render at close
  range someday: wear map wrong for the claimed route, cadence too perfect, secondary
  systems dark, one pristine lamp bank on a filthy hull.
- **Pirate:** costume until the weigh; Ashline family already owns the reveal.

## What this pack does NOT do (by brief)

No release artifacts, no `release_manifest.json` rows, no `parts_manifest.json` rows,
no `partsLibrary.js`/`traffic.js`/`npcJobs.js` edits, no live asset replaced, and no
runtime dependency introduced. An authoring-time baseline attempt was red in a foreign
concurrent runtime diff; that historical result is not evidence for or against this
unreachable source packet and is not an acceptance claim. The independent preservation
review instead verified exact hashes/structure and no runtime or bundle reachability.
Promotion authority belongs to whoever holds those exact paths when a selected family is
re-authored and claimed.
