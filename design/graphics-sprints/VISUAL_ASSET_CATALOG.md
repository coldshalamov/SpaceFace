<!-- LIFETIME: GENERATED -->
# SpaceFace visual-asset catalog

**Snapshot:** 2026-08-08 census; **hull-triage appendix 2026-08-24 (PQ-136.03)**
**Status:** read-only census and production routing; not program state or visual acceptance

This is the readable companion to [VISUAL_ASSET_CATALOG.json](./VISUAL_ASSET_CATALOG.json). It
separates what ships from what is selected, what is only a candidate, what may be adapted as a
legacy donor, what is evidence-only, and what belongs to another lane. It does **not** declare any
asset visually accepted. The 2026-08-24 hull-triage appendix is hand-extended (the JSON generator
is out of this leaf's write set) and is the disposition record for every authored hull. Full table:
[HULL_TRIAGE_2026-08-24.md](./HULL_TRIAGE_2026-08-24.md).

The ranked remediation sequence and component-level fiction/development agreements are in
[TOP_FIVE_MATERIAL_TRUTH_PLAN.md](./TOP_FIVE_MATERIAL_TRUTH_PLAN.md).

## Coverage boundary

- Every current release-manifest row, path, and exact source/release hash is included.
- Current whole-ship player, hostile, and traffic selectors are included.
- Major standalone-media families and the highest-exposure place references are counted.
- Candidate/worktree archaeology is a dated 2026-08-08 snapshot, hash-pinned where the
  files are tracked.
- Authored hull identities and FIELD / VARIANT / RESERVED / CANNOT-USE dispositions are the
  2026-08-24 PQ-136.03 appendix. Counting unit is LOD family + source/release of one generation,
  never a filename grep.
- Per-mesh materials, UVs, embedded texture channels, LODs, fallbacks, and editable-source replay
  are **not yet a complete GLB-internal census**. Those remain the deeper VA-001 inspector task.

## Lifecycle rules

- **live** — Reachable from a current runtime selector or world-site binding. Live does not mean visually accepted.
- **candidate** — Tracked source or release candidate that is not wired into the default runtime.
- **legacy-donor** — Historical or alternate work worth selectively adapting; never promote wholesale.
- **rejected/evidence-only** — Useful only as evidence, failed experiment, or warning; not a production source.
- **unsafe-foreign** — Owned by another active or stopped lane. Inspect read-only until ownership is coordinated.

PQ-136.03 utilization dispositions sit **on top of** those states and do not replace them:
**FIELD** (a concrete slot exists today), **VARIANT** (faction kit / damage / wreck / enclosed
re-author), **RESERVED** (admitted plan, Hitch freeze, or source-only donor), **CANNOT-USE**
(loader block, duplicate of a better sibling, or closed accessory hull). already-live hulls
keep their lifecycle; Hitch extras are freeze/donor only.

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
not accepted alternate ships. PQ-136.03 disposition: **FIELD** Corsair Blade into `corsair_raider`;
**VARIANT** Reaver Hook on `reaver_pirate` (PQ-050.15).

Player maps since the 2026-08-08 snapshot also select the factory `*_production_v1` roster
(Hornet through Leviathan, plus dedicated Wasp/Pelican/Mule). Several of those bodies are wired
but absent from `release_manifest.json`. Occupational maps now select eight work-fleet hulls;
tanker / tug / customs stay packaged and unspawned. Live is not an art pass.

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
| `helios_lark_stopped_remaster` | legacy-donor | The unique stopped-Lark source states are now tracked as a never-runtime donor for a separate NPC express-liner identity; they are not a replacement for the accepted courier Lark. PQ-136.03: **RESERVED** PQ-049 reference donor. |
| `massline_express_liner_v1` | candidate | LOD family on disk, not manifested. `express` has NO whole-ship binding (a draft apron-shuttle reskin was removed at 13e377bd; PQ-049 owns express identity). PQ-136.03: **RESERVED** PQ-049 — take the express slot; never replace Lark. |
| `foundry_ashline_rig_corsair_blade` | legacy-donor | Donor direction for separating corsair_raider from reaver_pirate; never substitute without authored source and live acceptance. PQ-136.03: **FIELD** `corsair_raider` (PQ-050.15). |
| `foundry_ashline_rig_reaver_hook` | legacy-donor | Donor direction for separating reaver_pirate from corsair_raider; never substitute without authored source and live acceptance. PQ-136.03: **VARIANT** `reaver_pirate` (PQ-050.15). |
| `foundry_helios_span_faction_kits` | candidate | DMC orebox / MTS sealed / Reach scrap overlays on live Span. PQ-136.03: **VARIANT** faction haulers. Do not replace accepted Span. |
| `foundry_wasp_faction_kits` | candidate | Free militia / MTS escort / SCN patrol overlays on live Wasp. PQ-136.03: **VARIANT** `patrol` / `escort`. |
| `helios_arclight` | candidate | Strong heavy-hauler candidate that still needs a gameplay identity, current build replay, and route acceptance. PQ-136.03: **VARIANT** unique Helios heavy among hauler/Atlas traffic — do not steal Span or Atlas. |
| `kestrel_m5_upgrade` | legacy-donor | Historical Kestrel donor only. Extract justified component ideas; do not replace the current Kestrel or reintroduce superseded geometry. PQ-136.03: **RESERVED** Hitch freeze. |
| `kestrel_borrowed_time_v2` / `v3` | rejected/evidence-only | Superseded Hitch candidates. V4 does not consume their geometry. PQ-136.03: **RESERVED** Hitch freeze; not replacements. |
| `kestrel_hitch_polish_v7_v9` | candidate | Later Hitch polish / V4 packet. Live Hitch is V7. Orphan-harvest B-hitch-v9: do not copy V9 extras onto the compressed release. PQ-136.03: **RESERVED** Hitch freeze. |
| `wholeship_volatiles_tanker` | candidate | Packaged and mapped to `tanker`; omitted from spawn after the 2026-08-18 still panel. PQ-136.03: **FIELD** `tanker` (PQ-136.02 hold). |
| `wholeship_yard_tug` | candidate | Same hold for `tug`. PQ-136.03: **FIELD** `tug`. |
| `wholeship_inspection_cutter` | candidate | Same hold for ambient `customs`. Enemy `customs_cutter` stays Hornet. PQ-136.03: **FIELD** `customs`. |
| `incubator_construction_rig` | candidate | Only occupational silhouette with no re-authored sibling. Primitive donor. PQ-136.03: **VARIANT** enclosed-hull pass, then a construction role (PQ-136.02 leftover). |
| `incubator_ore_barge_b` / `volatiles_tanker_b` / `salvage_cutter_damaged` | candidate | No re-authored bodies. PQ-136.03: **VARIANT** second barge / second tanker / wrecked salvor. |
| `ashline_v2_dart` / `lode` / `rig` | candidate | Ranked top-five remaster candidates. PQ-136.03: **RESERVED** PQ-050.13–.15. |
| `*_production_v1` Ashline / Helios / work-fleet factory remasters | candidate | On disk, not selected. Earlier remap made traffic invisible. PQ-136.03: **RESERVED** matching PQ-050.13–.22 leaf. Do not stamp a release row until the body beats live. |
| `fleet_player_bodies_v1` Pelican / Mule / Wasp | rejected/evidence-only | Factory clones of ships that have dedicated packages. PQ-136.03: **CANNOT-USE** duplicate of a better sibling. |
| `legacy_pelican` / `legacy_wasp` wholeships | rejected/evidence-only | Accessory-only, no Material_Hull. PQ-136.03: **CANNOT-USE** — fails the live loader. |

### Tracked stopped-Lark donor

The unique iter15 editable Blend and iter19 source GLB now live at
`assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19` with exact provenance. They are never-runtime
reference inputs for a separate express-liner identity, not a replacement for accepted courier Lark.
The future asset must be substantially reauthored, rebuilt through current source/release manifests,
and independently accepted on its own exact hashes.

### Stopped Grok clone

`C:/Users/93rob/.grok/worktrees/github-spaceface/subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041` was an independent corrupt clone, not a registered worktree.
`REC-GROK-KES-SALVAGE` classified every unique Blender/GLB family as DROP and deleted the exact
path on 2026-08-12. Do not recreate or promote from it.

### Stopped July 2026 external archives

`C:/Users/93rob/Documents/GitHub/SpaceFace-archives` was a parking lot of unregistered
worktree tarballs, not a live worktree. The 2026-08-17 closeout classified every item
`DROP` and deleted the folder. Helios civilian in that scratch already matches master.
The larger Ashline v1 files were a rejected polish of the old silhouette; remaster
through `PQ-050.13`–`PQ-050.15` from current factory bodies and `m4_ashline_v2`.
Do not recreate the folder.

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
- Two hostile roles alias the same Ashline Rig; the foundry Corsair/Reaver variants are donor directions, not accepted alternates. PQ-136.03 fields Corsair Blade into `corsair_raider` and variants Reaver Hook onto `reaver_pirate`.
- The stopped Lark source states are tracked as a non-runtime express-liner donor; accepted courier Lark identity is frozen and the historical refs are no longer production dependencies. PQ-136.03: **RESERVED** PQ-049, with the Massline liner LOD family on disk reserved to take `express` (which deliberately has no whole-ship binding until PQ-049 delivers).
- The stopped Grok clone was classified DROP and deleted 2026-08-12; current master already owned later versions of the same families.
- The July 2026 `SpaceFace-archives` parking lot was classified DROP and deleted 2026-08-17; it contained no unique live ship or place. Do not restore the rejected July-21 Ashline v1 depth polish.
- Recent dock, hulk, debris, production Wasp, Gatling, portraits, thruster masks, Cathedral, and trade-hub work should be preserved and reviewed before any reauthoring.
- icons_atlas, reticle, and menu_background are cleanup/audit candidates; no player-facing upgrade priority is assigned without live reference proof.
- PQ-136.03 walked **90** authored hull identities (LOD families, not files). **38** already-live, **4** FIELD, **12** VARIANT, **31** RESERVED, **5** CANNOT-USE. Hitch extras are freeze/donor only. Nothing was deleted. Full table: [HULL_TRIAGE_2026-08-24.md](./HULL_TRIAGE_2026-08-24.md).

## Hull triage appendix (PQ-136.03, 2026-08-24)

Routing evidence only. Not visual acceptance. Counting unit: one ship at one campaign
generation (LOD0/1/2 + source/release + matching Blender collapse). Wreck/prop packs,
stations, kit greebles, and third-party Kenney/Quaternius trees are out of this leaf.

| Bucket | Count | What it means |
|---|---:|---|
| already-live | 38 | Selector, kit slot, or packaged traffic/hostile map. Includes Hitch (frozen), the factory player roster (wired, several unpackaged), live Ashline/Helios, eight occupational hulls, kit hulls, and the Kestrel reference interchange. |
| FIELD | 4 | Slot exists today: Corsair Blade → `corsair_raider`; volatiles tanker → `tanker`; yard tug → `tug`; inspection cutter → ambient `customs`. |
| VARIANT | 12 | Cheapest conversion: Reaver Hook; three Span faction kits; three Wasp faction kits; Arclight as a unique Helios heavy; construction rig; ore-barge B; tanker B; damaged salvage cutter. |
| RESERVED | 31 | Hitch-frozen extras; Ashline v2 + factory remasters (PQ-050.13–.15); Helios factory remasters (PQ-050.16–.18); work-fleet factory remasters (PQ-050.19–.22); Massline liner + stopped-Lark (PQ-049); eleven incubator donors of live/held work-fleet hulls. |
| CANNOT-USE | 5 | Legacy Pelican/Wasp accessory shells (no Material_Hull — loader block); factory clones of the dedicated Wasp/Pelican/Mule packages (duplicate of a better sibling). |

Live occupational hulls now include rescue, prospector, sweeper, and apron shuttle
(PQ-136.02). Tanker, tug, and inspection cutter stay packaged and unspawned on the
2026-08-18 still-panel hold. `express` deliberately has no whole-ship binding (draft reskin removed at 13e377bd); that slot
belongs to the Massline liner.

Factory `*_production_v1` copies of Ashline, Helios, and the four PQ-045 work-fleet
hulls are **not** live. An earlier remap to those files made traffic invisible. They
stay RESERVED as PQ-050 leaf inputs until they are manifested, packaged, and beat the
live body.

Hitch/Kestrel: live V7 only. V2, V3, the V4 packet, later polish, material-truth v6,
and the M5 upgrade are freeze/donor rows. They are not in scope for any disposition
other than live / RESERVED-under-freeze.

Incubator `npc_activity_pack` donors remain source-only (2026-08-08 KEEP). Re-author;
do not copy. Construction rig and the three `_b` / damaged siblings have no re-authored
body yet.

Do not regenerate this appendix from `build_visual_asset_catalog.mjs` — the generator
does not own PQ-136.03 rows. Refresh facts from manifests and `partsLibrary.js` maps
before promoting anything.

Regenerate after a manifest/runtime-map change:

```powershell
node tools/art/build_visual_asset_catalog.mjs
node --test test/visual-asset-catalog.test.mjs
```

The generator intentionally does not inspect or mutate foreign worktrees. Branch/worktree
archaeology is a dated, hash-pinned snapshot and must be refreshed by a coordinated read-only audit.
