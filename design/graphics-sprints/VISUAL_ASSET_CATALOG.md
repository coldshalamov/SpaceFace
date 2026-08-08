# SpaceFace visual-asset catalog

**Snapshot:** 2026-08-08
**Status:** read-only census and production routing; not program state or visual acceptance

This is the readable companion to [VISUAL_ASSET_CATALOG.json](./VISUAL_ASSET_CATALOG.json). It
separates what ships from what is selected, what is only a candidate, what may be adapted as a
legacy donor, what is evidence-only, and what belongs to another lane. It does **not** declare any
asset visually accepted.

The ranked remediation sequence and component-level fiction/development agreements are in
[TOP_FIVE_MATERIAL_TRUTH_PLAN.md](./TOP_FIVE_MATERIAL_TRUTH_PLAN.md).

## Coverage boundary

- Every current release-manifest row, path, and exact source/release hash is included.
- Current whole-ship player, hostile, and traffic selectors are included.
- Major standalone-media families and the highest-exposure place references are counted.
- Candidate/worktree archaeology is a dated 2026-08-08 snapshot, hash-pinned where the
  files are tracked.
- Per-mesh materials, UVs, embedded texture channels, LODs, fallbacks, and editable-source replay
  are **not yet a complete GLB-internal census**. Those remain the deeper VA-001 inspector task.

## Lifecycle rules

- **live** — Reachable from a current runtime selector or world-site binding. Live does not mean visually accepted.
- **candidate** — Tracked source or release candidate that is not wired into the default runtime.
- **legacy-donor** — Historical or alternate work worth selectively adapting; never promote wholesale.
- **rejected/evidence-only** — Useful only as evidence, failed experiment, or warning; not a production source.
- **unsafe-foreign** — Owned by another active or stopped lane. Inspect read-only until ownership is coordinated.

## Manifest census

The release manifest contains **83** exact rows and is
anchored by SHA-256
`4850c2a731865bebe68062a342425e75e1f533546caf11f9dbae32194d77c0d3`. The source manifest contains
**88** rows and is anchored by
`b24397b5cb0e2647f2db99ecc9d4b8a66ef65fa8af4c19aeaef0d6fe378987ce`.

| Release kind | Count |
|---|---:|
| `part:cockpits` | 3 |
| `part:engines` | 6 |
| `part:fins` | 6 |
| `part:gear` | 2 |
| `part:greebles` | 7 |
| `part:hulls` | 10 |
| `part:places` | 29 |
| `part:pods` | 3 |
| `part:weapons` | 6 |
| `part:wholeships` | 10 |
| `ship-reference` | 1 |

Source-only IDs: `place_ash_pin`, `place_claim_mark`, `place_cold_locker`, `place_lane_pin`, `place_tally_post`, `place_whistle`, `wholeship_pelican`, `wholeship_wasp`.
Release-only IDs: `ship_kestrel_reference`, `wholeship_kestrel_lod1`, `wholeship_kestrel_lod2`.

The JSON records every release ID, source/release path, and exact source/release hash. A manifest row
means the bytes are packaged; it does not prove a current selector, a normal gameplay route, or an
art verdict.

## Current whole-ship selectors

| Runtime identity | Release identity | Finding |
|---|---|---|
| `ship_kestrel` | `wholeship_kestrel` | default player ship |
| `ship_wasp` | `wholeship_wasp_production_v1` | alternate production player ship |
| `wasp_swarmer` | `wholeship_ashline_dart` |  |
| `bruiser_brawler` | `wholeship_ashline_lode` |  |
| `reaver_pirate` | `wholeship_ashline_rig` |  |
| `corsair_raider` | `wholeship_ashline_rig` | role alias: no distinct corsair hull |
| `courier` | `wholeship_helios_lark` |  |
| `miner` | `wholeship_helios_cradle` |  |
| `hauler` | `wholeship_helios_span` |  |

The important structural gap is explicit: `reaver_pirate` and `corsair_raider` both select
`wholeship_ashline_rig`. The tracked Corsair Blade and Reaver Hook files are donor directions,
not accepted alternate ships.

## Ranked first five

| Rank | Slice | Lifecycle | Why now | Honest state |
|---:|---|---|---|---|
| 1 | `kestrel_die_laughing_stencil` | candidate | The Kestrel is the default player ship and remains on screen throughout normal play. | In-place material-truth refinement; no manifest or live-release promotion is claimed here. |
| 2 | `ashline_v2_dart` | candidate | The live hostile selector maps wasp_swarmer to Ashline Dart. | Offline V2 source and KTX2/Meshopt candidate exist; the live selector still uses the older Ashline family. |
| 3 | `ashline_v2_lode` | candidate | The live hostile selector maps bruiser_brawler to Ashline Lode. | Offline V2 source and KTX2/Meshopt candidate exist; promotion remains unclaimed. |
| 4 | `ashline_v2_rig` | candidate | Two live hostile roles, reaver_pirate and corsair_raider, currently map to the same Ashline Rig. | Offline material-truth-v2 checkpoint E46AAFCB is unwired; source/candidate mirror exactly at 3610796 bytes, while G5/G6/G7 and the Reaver/Corsair identity split remain open. |
| 5 | `place_claim_outpost_relay` | live | The relay is bound by world-site manifests and the PQ-019A heist facility data, making it a story and gameplay-facing place. | Source and release are live. Remaster work must coordinate with the owning PQ-019/PQ-022 lane and preserve world-site identity. |

Each row in the JSON carries its exact acceptance gates and mutex order. None may skip fiction and
material definition, normal-camera review, source/release validation, runtime acceptance when
required, or an independent human-eye verdict.

## High-exposure places

These counts are authored static references from the read-only 2026-08-08 census, not
runtime telemetry:

| Place | Static references |
|---|---:|
| `place_debris_chunk` | 18 |
| `place_dead_hulk` | 15 |
| `place_asteroid_seamed` | 9 |
| `place_lane_beacon` | 9 |
| `place_nav_buoy` | 8 |
| `place_station_blackmarket` | 8 |
| `place_station_research` | 6 |
| `place_station_trade_hub` | 6 |
| `place_asteroid_rock_a` | 5 |
| `place_station_mining` | 5 |
| `place_station_military` | 3 |
| `place_station_refinery` | 3 |

Recent dock, hulk, debris, military-station, trade-hub, Cathedral, Wasp, Gatling, portrait, and
thruster work is review input—not permission to restart those assets.

## Scattered candidates and donor assets

| Asset | Lifecycle | Use or finding |
|---|---|---|
| `helios_lark_stopped_remaster` | legacy-donor | The unique stopped-Lark source states are now tracked as a never-runtime donor for a separate NPC express-liner identity; they are not a replacement for the accepted courier Lark. |
| `foundry_ashline_rig_corsair_blade` | legacy-donor | Donor direction for separating corsair_raider from reaver_pirate; never substitute without authored source and live acceptance. |
| `foundry_ashline_rig_reaver_hook` | legacy-donor | Donor direction for separating reaver_pirate from corsair_raider; never substitute without authored source and live acceptance. |
| `helios_arclight` | candidate | Strong heavy-hauler candidate that still needs a gameplay identity, current build replay, and route acceptance. |
| `kestrel_m5_upgrade` | legacy-donor | Historical Kestrel donor only. Extract justified component ideas; do not replace the current Kestrel or reintroduce superseded geometry. |

### Tracked stopped-Lark donor

The unique iter15 editable Blend and iter19 source GLB now live at
`assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19` with exact provenance. They are never-runtime
reference inputs for a separate express-liner identity, not a replacement for accepted courier Lark.
The future asset must be substantially reauthored, rebuilt through current source/release manifests,
and independently accepted on its own exact hashes.

### Stopped Grok clone

`C:/Users/93rob/.grok/worktrees/github-spaceface/subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041` still exists as an independent corrupt clone, not a registered
worktree. HEAD/objects are incomplete, and a bounded index audit identified 237 unique targeted
Kestrel/asset paths. Preserve it read-only until `REC-GROK-KES-SALVAGE` records a hash ledger,
inspects only genuinely distinct Blender/GLB/evidence families, and preserves or rejects them before
deleting the clone.

## Standalone and code-native visuals

- 23 authored recurring portraits.
- 4 cinematic poster/video pairs.
- 9 deterministic runtime thruster/RCS masks.
- `assets/cinematics/C-INTRO-01.jpg` is the menu/boot cinematic backdrop.
- Backgrounds, planets, fallbacks, combat effects, propulsion, and post processing also include
  code-native visuals; their exact owner files are enumerated in the JSON.

## Findings and next use

- Packaged does not imply selected, and selected does not imply accepted art.
- The source manifest has legacy Pelican/Wasp records that are absent from the current release manifest.
- The release manifest has three Kestrel package records outside the source-manifest census: the ship reference plus LOD1 and LOD2.
- Two hostile roles alias the same Ashline Rig; the foundry Corsair/Reaver variants are donor directions, not accepted alternates.
- The stopped Lark source states are tracked as a non-runtime express-liner donor; accepted courier Lark identity is frozen and the historical refs are no longer production dependencies.
- The stopped Grok directory is an independent corrupt clone with 237 unique targeted asset paths; it remains read-only until the bounded REC-GROK-KES-SALVAGE ledger preserves or rejects each distinct family.
- Recent dock, hulk, debris, production Wasp, Gatling, portraits, thruster masks, Cathedral, and trade-hub work should be preserved and reviewed before any reauthoring.
- icons_atlas, reticle, and menu_background are cleanup/audit candidates; no player-facing upgrade priority is assigned without live reference proof.

Regenerate after a manifest/runtime-map change:

```powershell
node tools/art/build_visual_asset_catalog.mjs
node --test test/visual-asset-catalog.test.mjs
```

The generator intentionally does not inspect or mutate foreign worktrees. Branch/worktree
archaeology is a dated, hash-pinned snapshot and must be refreshed by a coordinated read-only audit.
