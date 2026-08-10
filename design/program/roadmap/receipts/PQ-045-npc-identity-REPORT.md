<!-- LIFETIME: DURABLE -->
# PQ-045.npc-identity — receipt

**Unit:** `PQ-045.npc-identity` — "Wire four occupational NPC families so trades stop sharing one hull"
**Candidate:** committed on `master` at the revision named in the commit that carries this report
**Date:** 2026-08-10
**Verdict:** DONE (with the explicitly unproven cells named below)

## What changed

Four occupational NPC families no longer share one hull. Each resolves to its own
whole-ship and its own label on the default route:

| Family | `presentationRole` | Hull | Label | Ship def (stats) |
|---|---|---|---|---|
| Ore Barge | `ore_carrier` (NEW) | `wholeships/ore_barge.glb` | Ore Barge | `ship_ironback` |
| Repair Tender | `tender` | `wholeships/repair_tender.glb` | Repair Tender | `ship_drifter` |
| Salvage Cutter | `salvor` | `wholeships/salvage_cutter.glb` | Salvage Cutter | `ship_pelican` |
| Survey Pin | `surveyor` | `wholeships/survey_pin.glb` | Survey Rig | `ship_ranger` |

1. **Re-authored fleet, not promoted donors.** The four GLBs were rebuilt from the
   `npc_activity_pack` donor silhouettes under the 2026-08-08 independent-review
   boundary ("re-author form and material zones; author LODs and the real release
   pipeline"). New family `assets/ships/npc_work_fleet/` with a deterministic
   Blender 5.1.2 builder (`tools/blender/build_npc_work_fleet.py`, no RNG),
   evidence renderer (`tools/blender/render_npc_work_fleet.py`), publisher
   (`tools/art/publish_npc_work_fleet.mjs`), `DESIGN.md` (fiction agreement +
   material bill) and `PROVENANCE.json`. No donor geometry was copied; the
   fiction dossier (THE_WORKING_FLEET §2/§5/§7/§8) froze the silhouettes:
   barge = six proud ore baskets + bow-pivot loading boom; tender = port plate
   rack + folded weld boom + umbilical drum; cutter = jaw-open shears + hooded
   down-aimed umbrella lamps + hip tether reels + open scrap cradle; pin =
   dorsal sensor truss + moth-wing paddles + range-mast triangle + 90° crab boom.
   Each ship carries explicit LOD0/1/2 (merged by material role per LOD),
   SOCKET_* empties, COLLISION_HULL, role-classified procedural PBR maps
   (baseColor/ORM/normal; ORM R carries the AO bake bound to occlusion), and
   `spacefaceAsset` metadata. No accepted asset was replaced; `hauler` keeps
   `helios_span`, `miner` keeps `helios_cradle`, `courier` keeps `helios_lark`.
2. **Asset pipeline.** Four canonical sources in `assets/ships/parts/wholeships/`
   + four `parts_manifest.json` rows + `runtimeSlots.hull` entries; incremental
   release build (`build-sg04-release-assets.mjs --no-clean --only …`) produced
   KTX2+meshopt release GLBs and four `release_manifest.json` rows (83 → 87
   assets); `pilots.json` gained four pilots (HOOK_DRIVE marked dynamic, matching
   the helios precedent) and `build-render-package-pilots.mjs` produced the four
   render packages. Adding pilots re-binds the pilots.json hash recorded inside
   every package's `contentHash`, so all 85 `render-package.json` files and the
   generated `src/render/renderPackageManifest.js` were regenerated in the same
   consistent transaction — the 81 pre-existing packages differ only in those
   binding-hash records; every `render.glb` is byte-identical.
3. **Runtime wiring** (`src/render/partsLibrary.js`): four new rows in
   `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` + `WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE`.
4. **New traffic role** (`src/systems/traffic.js`): `ore_carrier` TRAFFIC_ROLES
   entry (`ship_ironback`, team 2, slow barge pace, `fleeing_trader`,
   label `Ore Barge`, `docks: true`, `trades: false`) and a `×2.5` weight lift in
   declared mining/refinery sectors — the same extraction economy the miner
   serves. `TRAFFIC_ROLES` is now exported for the contract test.
5. **Contract test** (`test/npc-activity-identity.test.mjs`, 7 tests): distinct
   hull + distinct label per role through the real `wholeShipVisualForEntity`
   selector; the ore barge provably does not inherit hauler's ship/speed/label;
   the label an entity wears never falls through the `TRAFFIC_ROLES.hauler`
   fallback; source GLB + release GLB + parts-manifest row + release-manifest row
   + pilot + built render package all exist and carry matching assetIds; and a
   live-path test that boots the real traffic system headlessly, draws the
   ambient mix in an industrial sector across a bounded seed band, and asserts
   the spawned barge carries `trafficRole: ore_carrier`, label `Ore Barge`, and
   resolves to `wholeships/ore_barge.glb` even when faction-fleet substitution
   swaps its gameplay hull class.
6. **Status note** in `assets/incubator/npc_activity_pack/INTEGRATION.md` marking
   the four promoted families and the still source-only remainder.

## What passed

- `npm run check:baseline` — **11/11 green** (65.6 s wall) at the final
  candidate, including bit-identical sim goldens (`sim`, `sim-v3`,
  `sim-compare`, `sim-v3-compare`): the new role cannot perturb the golden
  harness (traffic is not in it), and the mix change preserves every pinned
  weight (`pq020-ceres-topology` green).
- `node --test test/npc-activity-identity.test.mjs` — **7/7 pass** (incl. the
  live spawn-path proof).
- `node --test test/traffic-role-mix-reads-contents.test.mjs
  test/m4-regional-ecology.test.mjs test/npc-jobs-natural-census.test.mjs
  test/kestrel-wholeship-routing.test.mjs test/wasp-production-routing.test.mjs`
  — **18/18 pass** (incl. "only the miner weight moves" and "Ceres Belt is
  unchanged").
- `node scripts/check-render-package-instance-plan.mjs` — **85/85** packages
  build valid instance plans.
- `npm run check:asset-reachability` — OK (222 referenced runtime assets,
  including the four new whole-ships).
- `npm run check:asset-status` — OK (92 parts tracked).
- `node scripts/check-parts-manifest.mjs` — the four new rows pass every rule
  the accepted helios rows pass (bounds vectors, extras identity, byte/triangle
  parity, sockets, KTX2 texture contract). They fail only the two classes the
  accepted helios rows also fail (tint roles vs the drifted
  `wholeShipMaterialContract` name list; exact-name hook lookup vs the
  LOD-prefixed hook convention). That check is red at HEAD for the whole
  category and is not in `check:baseline`; fixing the category drift is out of
  this unit's scope.
- `npm run check:runtime-assets` — red at HEAD for kestrel/wasp LOD files only;
  the four new GLBs are not among its offenders (KTX2 + LOD0/1/2 chains
  present).

## What I did NOT prove

- **`npm run check:assets:live` did not run green in this session.** The
  candidate itself passes the probe's identity gate: after this unit's commit
  was pushed (`HEAD == origin/master`), a clean isolated worktree at the
  candidate commit passed the probe's clean-tree and HEAD asserts and began the
  seeded boot — then the browser session stalled in the shared authored-asset
  preload with **`failureCount: 0`, `wholeShipFailureCount: 0`, `failures: []`**
  (nothing 404'd, nothing failed contract validation) and never reached
  readiness: `game:startFailed — "Initial authored ship visuals did not become
  ready"`. The stall is in the shared boot path, not in this unit's assets, and
  it predates the unit: `check:asset-startup-readiness` fails with the same
  fingerprint at committed HEAD `f6a0eff8` **and** at `86d3d5c6` (origin/master
  at session start), each verified in isolated clean worktrees with my changes
  absent, and `probe-startup-transition` shows the same "LOADING CRITICAL
  FLIGHT ASSETS" stall. The machine was simultaneously hosting multiple other
  agent Blender/Chrome sessions (9 `blender-mcp` processes, a dozen Chrome
  instances, concurrent lane servers); an extended 300 s playable-timeout run
  died under that contention without writing its report. Per the validation
  rules I stopped re-running the unchanged harness after the third identical
  fingerprint. The headless evidence chain stands in as far as headless can
  reach: the resolution chain (identity test), the real spawn path (live
  traffic boot), release-pair validation (in the release build), package
  instance plans (85/85), and URL routability (`check:asset-reachability`)
  are all green. What remains unproven without the headed route: actual
  on-screen rendering of the four hulls in the default game, and the
  probe's `nonAuthored == 0` flight-snapshot assertion.
- **Whole-asset G1/G2/G4 and independent G7 review remain OPEN.** This unit
  produced evidence_ready technical receipts (matched clay/surface/grazing/band
  renders under `assets/ships/npc_work_fleet/evidence/<ship>/`, self-reviewed by
  the building agent — disclosed self-review). No independent hash-bound visual
  review exists; the four families are working-fleet (Tier C/D) productions and
  are not claimed as visually accepted hero assets.
- **Electron parity** untested (headed-route dependent).
- **Performance cost on the live route** untested headed. Headless cost model:
  LOD0 4.1–7.8k tris per hull (lighter than the accepted 32–46k helios bodies),
  ≤7 draws per LOD level, 15 KTX2 textures per ship at the helios profile;
  Ceres cast additions: zero (no Ceres slot changed — the Ceres tender/surveyor/
  salvor already existed and simply gain authored hulls).

## Deliberately left out

- **`customs_cutter`** — excluded per the unit brief; its id collides with the
  live hostile encounter archetype.
- **Ceres pocket slot rewiring** (`src/data/sectorActivityPockets.js`) — owned by
  the concurrent `PQ-045.route-topology` lane and untouched here. The Ceres
  tender/surveyor/salvor pick up their new hulls automatically through their
  existing `presentationRole` fields; no slot edit was needed.
- **Scanner classification branch for `ore_carrier`** (`src/systems/scanner.js`)
  — outside the write set. The barge currently classifies as `HAULER` on the
  scanner via the `convoy_civilian` fallthrough, exactly as the pre-existing
  `tender`/`surveyor`/`salvor` roles already did before this unit.
- **Freight causality membership** (`FREIGHT_TRADING_ROLES` in
  `src/economy/freightCausality.js`) — outside the write set and deliberately
  not a behavior change: the barge carries a deterministic empty manifest and
  writes no market events. Adding ore cargo causality is a follow-up lane.
- **`pirateRumor.js` civilian allowlist** — `ore_carrier` matches the existing
  working trades (tender/surveyor/salvor are likewise absent); no change.
- **The other eleven donor families** — remain source-only design candidates per
  the independent review.
- **Job-kind assignment for the barge** — `ore_carrier` intentionally maps to no
  `npcJobs` kind (job kernel untouched); it runs the ambient station loop.

## Follow-ups admitted

1. Headed `check:assets:live` + normal-route captures for the four families once
   the boot-path stall is repaired by its owning lane.
2. Independent whole-asset G1/G2/G4 (+G7) review of `npc_work_fleet`.
3. Scanner `ore_carrier` branch; freight-causality membership if the barge
   should move real ore; LOD1/LOD2 hand-authoring if decimate output is judged
   insufficient at review.
