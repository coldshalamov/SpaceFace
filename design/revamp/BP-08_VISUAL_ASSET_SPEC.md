# BP-08 — VISUAL ASSET SPEC (for the Blender agent)

> **Owner:** the Blender/asset-production agent. **Runs in parallel with all code work** (longest lead time).
> **Extends** `design/spec3/SPEC3-F8-graphics-visuals.md` + `SPEC3-F9-asset-pipeline.md` and the pipeline in
> `assets/AGENTS.md`. **Reference contract:** `src/render/assetLoader.js` `ASSET_AUTHORING_CONTRACT`.
>
> **Prime directive:** every asset must load through the existing fallback-safe pipeline. If a GLB violates
> the contract it silently falls back to a procedural mesh (ships never disappear) — so a "shipped" asset is
> one that passes `check:assets:live` + `check:asset-reachability`, not merely one that exists on disk.

---

## 0. How this combines with `FULL_GRAPHICS_REVAMP_GOAL.md` (Grok's active brief)

> **Path note:** FGRG lives at `design/graphics-sprints/FULL_GRAPHICS_REVAMP_GOAL.md` (moved from repo root 2026-07-13). Its companion `GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md` is in the same folder.

The Blender agent (Grok) is already running **`FULL_GRAPHICS_REVAMP_GOAL.md` (FGRG)**. The two docs are
**complementary — do not treat them as competing plans.** Read this section, then run them together:

| | FGRG (`FULL_GRAPHICS_REVAMP_GOAL.md`) | BP-08 (this doc) |
|---|---|---|
| **Role** | **COVERAGE + OUTCOME master.** Which authored surfaces need a professional result and how to prove it in the player route. | **COVERAGE + DESIGN-TARGET supplement.** *Which new assets the revamped gameplay now needs*, and *what silhouette/identity each must hit* so it reads at a glance. |
| **Scope** | Upgrade the ~70 **existing** authored GLBs (hulls, parts, current places). | Author the **missing** assets the new systems reference (faction-distinct stations, landmarks, ring-gates, wrecks, hero rocks) + re-author blocked whole-ships. |
| **Authority** | Owns full-set coverage and the professional outcome/evidence bar. Live exporter/runtime files own exact technical constraints. | Owns the *what & why* — the list below + the faction/identity targets. |

**The one rule when they touch the same asset:** FGRG's process/quality bar always applies; BP-08 supplies the
**character/silhouette target** to hit. Where BP-08 asks for something FGRG already lists, they are the *same
task* — use BP-08's identity note as that asset's "define character" step (FGRG §3.3).

### Combined execution order (fold BP-08 into FGRG's batch plan)

1. **FGRG Batch 0–2 unchanged** — flagship + hulls + core parts quality passes. (BP-08 adds nothing here except
   **P6**: the 5 engines + 6 weapons already authored-but-unregistered — Grok makes them export-clean; the
   *manifest/partsLibrary registration* is a CODE step owned by BP-09, not Grok.)
2. **FGRG Batch 3 (stations) ← BP-08 §2 P0 is the design brief for it.** Do not merely polish the 8 generic
   station meshes — **redesign them to the 8 faction-distinct silhouettes** in §2 P0 (Concord orthogonal-sealed,
   Meridian tiered-rings, Drift ore-hoppers, Reach scavenged-welded, Quiet low-signature, Choir ritual-radial,
   Free patched-open, Vael alien-teal-best-lit). Each gets the modeling, surfacing, life, and evidence work
   justified by its current gaps.
3. **NEW "Batch 3.5 — gameplay-driven landmarks" (BP-08 §2 P2–P4).** These do **not** exist in FGRG's
   existing-70 scope; they are new assets the zones/encounters/salvage/galaxy-map systems now reference:
   landmarks (vault-maw, crystal-spire, pit-anchor, cathedral-wreck), 3 faction ring-gate variants, and the
   wreck variants + `place_comm_beacon` (the salvage "floating communicator"). Apply the full outcome and
   evidence bar; use measured screen-space value and runtime evidence for any resource decision.
4. **FGRG Batch 4 (asteroids/props) ← BP-08 §2 P5** hero asteroids (`place_asteroid_luminite`/`_ice`) join here.
5. **FGRG Batch 5 (whole-ships) = BP-08 §2 P1** — identical task (repair `kestrel`/`pelican`/`wasp` to contract).
6. **FGRG Batch 6 sign-off unchanged.**

**Priority tie-break** (if Grok must choose what buys the most player-visible value first): the new
**Batch 3.5 comm-beacon + wreck variants** and the **8 faction station silhouettes** unblock the just-shipped
zones/salvage/encounter/galaxy-map features, so they rank alongside FGRG's flagship — do the flagship (Batch 0)
first as FGRG says, then prioritize stations (Batch 3) + Batch 3.5 over the long tail of core-part polish.

**Do not add these BP-08 additions to code manifests yourself if you are the code (Wave 2) session** — asset
authoring + `parts_manifest.json` rows are Grok's lane; the code session only *consumes* assets once Grok
reports them export-clean (see WAVE2_PROMPT.md "asset-gated" note).

---

## 1. The authoring contract (every GLB must satisfy)

| Aspect | Requirement |
|---|---|
| Format | **GLB binary** (not glTF). Textures **embedded as KTX2/BasisU** (`KHR_texture_basisu`). No loose .png/.jpg. |
| Coordinate frame | right-hand, **forward = +X, up = +Y, starboard = +Z**, unit = **metre**, origin = mount point (nose for ships). |
| Root extras | `spacefaceAsset` JSON: `{ contractVersion:1, slot, forward:"+X", up:"+Y", starboard:"+Z", unit:"metre", normalConvention:"OpenGL", ormChannels:"R=AO,G=Roughness,B=Metallic", textureCompression:"KTX2/BasisU", chamfered:true }`. |
| Materials (named roles) | `Material_Hull` (tintable body), `Material_Accent` (faction edge trim), `Material_Glass` (MeshPhysical, transmission 0.6 / IOR 1.4), `Material_Mechanical` (dark metallic). |
| Textures | baseColor (sRGB), normal (tangent, **OpenGL green-up**), ORM (packed: **R=AO, G=Roughness,B=Metallic**) when required by the live contract. Choose resolution/compression from screen-space need and measured runtime evidence; use the live exporter as authority. |
| Geometry | Use intentional edge treatment and the LOD groups required by the live exporter. Bevels, weighted normals, bakes, and topology choices are asset-specific means, not a universal visual recipe. |
| Nodes | `MOUNT_*` hardpoints, `SOCKET_*` anchors (e.g. `SOCKET_Trail_Main`, `SOCKET_Weapon_Front`), optional damage hooks `HOOK_*`, drive-anim `HOOK_DRIVE_FAN/CORE/PLUME`. |
| Resource alarms | Follow the live `assets/ships/parts/parts_manifest.json` and `tools/blender/spaceface_export.py`. Do not copy their changing numeric alarms into design policy or treat them as taste ceilings; justify exceptions with screen-space value and measured performance evidence. |
| Faction accent | provide `factionAccentVariants` in the manifest row (accent color per palette class: core/belt/fringe/anomaly). |

**Per-asset delivery = 3 steps:** (1) export GLB to `assets/ships/parts/<category>/<id>.glb`; (2) add a row to
`assets/ships/parts/parts_manifest.json` (id, category, file, tris, bytes, textureSize, tintable materials,
hooks, sockets, bounds, factionAccentVariants, priority, note); (3) leave a note for the code side to wire it
(new `place`/`hull` ids map in `src/render/partsLibrary.js`). Then `npm run build:release:assets` →
`check:assets:live` → `check:asset-reachability`.

---

## 2. Ordered production manifest (build in priority order)

Category `places/` unless noted. Each entry: **why it exists in the fiction** + **silhouette intent** so the
model reads at a glance from top-down (pillar 2). Distinct silhouettes matter more than detail.

### P0 — Faction-distinct STATION cores (8) — *biggest identity win*
Today all 8 station archetypes are low-fidelity procedural shuffles. Give each a **unique top-down silhouette**
so a player reads the faction and function instantly.

| id | Faction / function | Silhouette intent |
|---|---|---|
| `place_station_concord_hub` | Concord (SCN) trade/authority | orthogonal, symmetrical, sealed; docking collars like filing slots; cold blue accent |
| `place_station_meridian_exchange` | Meridian (MTS) market | tiered concentric rings (the "exchange floor"); gold accent; ostentatious |
| `place_station_drift_refinery` | Drift (DMC) refinery | asymmetric ore hoppers + slag chutes; rust/amber; industrial clutter |
| `place_station_reach_den` | Crimson Reach pirate | scavenged/asymmetric, welded-on modules, exposed guts; red warning stripes |
| `place_station_quiet_cache` | The Quiet smuggler | small, dark, low-signature; hidden docking; minimal lights |
| `place_station_choir_shrine` | Ascendant Choir | ritual/radial symmetry around a relic core; violet glow; ornate |
| `place_station_free_waystation` | Free Frontier | patched-together but welcoming; open docking arms; mixed salvage |
| `place_station_vael_spire` | The Vael | alien geometry, non-human proportions, teal glow (**best-lit — they have the best air**) |

### P1 — Verify and finish production whole-ships

Whole-ship routing has changed since this brief was written. Inspect the current manifest, classification,
`WHOLE_SHIP_FILE_BY_DEF_ID`, and player route before acting. Repair any routed Kestrel/Pelican/Wasp candidate
that lacks a credible hull body, required material/maps, or mount/socket semantics; do not roll back a current
production route to match this dated diagnosis.

### P2 — LANDMARKS (navigation + identity)
The player should say "meet me at the crystal spire." One authored landmark per key sector.

| id | Sector / fiction | Silhouette |
|---|---|---|
| `place_landmark_vault_maw` | Ashfall / Anomaly — the sealed vault | vast dark maw ring; ominous |
| `place_landmark_crystal_spire` | Veil — the anomaly | luminous faceted spire; refractive |
| `place_landmark_pit_anchor` | Helios memorial / the Pit's ghost | broken colony anchor; melancholy |
| `place_landmark_cathedral_wreck` | Ashfall approach — a dead capital ship | cathedral-scale hull ribs, dungeon-like |
| `place_landmark_billboard_array` | Meridian/Tethys — ad-board megastructure | flat plane arrays; commercial |

### P3 — RING-GATES (ring-lane travel, BP-07) — 3 faction variants
`place_gate_jump_ring` exists (generic). Add faction-flavored variants so lane ownership reads:
`place_gate_concord` (austere, official, blue lights), `place_gate_merchant` (ornate toll-ring, gold),
`place_gate_reach` (modified/booby-trapped, red, sparking) — the last supports the "pirates blew the ring" beat.

### P4 — DERELICTS / WRECKS (salvage loop, `salvage.js`) — 4–6 variants
`place_dead_hulk` + `place_debris_chunk` exist. Add distinct destroyed-hull types with visible internal
structure so a wreck field tells a story: `place_wreck_freighter`, `place_wreck_patrol`, `place_wreck_miner`,
`place_wreck_capital_section`, and a small `place_comm_beacon` (the "floating communicator" that starts a
mission chain—a blinking antenna buoy whose complexity matches its screen-space role).

### P5 — HERO asteroids + world dressing
1–2 hand-sculpted hero rocks (`place_asteroid_luminite`, `place_asteroid_ice`) for first-impression contrast
against the procedural field; optional minefield/mine prop, sensor-dust volume card.

### P6 — Register the already-authored parts
5 engines + 6 weapons already exist in `assets/ships/parts/` but are **not in `parts_manifest.json`**. Add
their manifest rows + `partsLibrary.js` slot entries (coordinate the code wiring with the ships/fitting lane).

---

## 3. Naming, palette, and hand-off

- Path: `assets/ships/parts/<category>/<id>.glb`, category ∈ {hulls, engines, fins, cockpits, weapons,
  greebles, gear, pods, places, wholeships}. Size variants use `_S`/`_M`/`_L` suffixes.
- Palette: read the four palette classes (core cyan-steel / belt rust-amber / fringe sodium-red / anomaly
  violet-green) from `src/data/sectors.js` `SECTOR_PALETTE_CLASSES`; provide `Material_Accent` variants matching.
- Every station/landmark should carry a `landmark: true` manifest flag so the map + nav treat it as a named
  waypoint (the `galaxyMap` and radar read this).
- Deliver in **priority batches** (P0 first). After each batch: run the release build + reachability + live
  checks; report which ids passed and any contract violations.

## 4. Acceptance

- P0 done ⇒ each of the 8 station archetypes has a distinct bounding-box silhouette (`check:sector-geography`
  / `check:station-archetype-wiring` green) and loads with `failureCount:0` in `check:assets:live`.
- P1 done ⇒ `check:assets:live` shows Kestrel/Pelican/Wasp using whole-ship bodies with **no fallback parts**.
- Landmarks/wrecks/gates ⇒ referenced by `sectorZones`/`salvage`/ring data and pass `check:asset-reachability`
  (or are correctly held out as reference-only).
