<!-- LIFETIME: DURABLE -->
# Systems audit — verifying the "runs on what already exists" premise

`DEPENDENCY_MAP.md` asserts that every non-`donor.*`, non-`future.*` system id
"exists in the live game today". That line was an **assertion** when the catalog was
written. This document is the **verification**: every id in the schema's `systems`
enum was resolved against `src/**` on 2026-08-08, and the two ids that did not
resolve were corrected in the catalog.

Why it matters: the dependency map's job is to let a future integrator find the
system. An id that names a module which does not exist sends them hunting, and —
worse — makes a *blocked* event look *ready*. The premise survived; the labels
needed two fixes.

## Verdict

**The premise holds.** All 26 live ids resolve to real code. No event needed
demotion to `blocked`, so the validator-enforced tier math (15 / 20 / 18 / 5) is
unchanged.

Two ids named modules that do not exist, though their capability does. Both were
renamed in `microevent.schema.json` and `catalog/*.json` (17 event references), and
the generated docs were rebuilt:

| was | now | why |
|---|---|---|
| `campaignDirector.pressure` | `encounterDirector.pressure` | There is no `campaignDirector` module. The campaign director **is** `src/systems/encounterDirector.js`; the two-deck pressure pools live there (`POOL_MAX`, `dir.pressure.combat` / `.civilian`). The old id also split one module across two vocabulary prefixes. |
| `sectorPockets.slot` | `sectorZones.slot` | There is no `sectorPockets` module and no `slot` identifier in the authored-place data. The real concept is the named **zone**: `src/data/sectorZones.js` plus `AUTHORED_PLACE_ZONES` in `src/data/authoredPlaces.js`. This rename fixed the *module* half only — the `.slot` suffix is still vestigial, see **Known label debt**. |

Two *further* ids are misnamed — `sectorZones.slot` and `comms.ambientToast`. Both name
a live capability in the right module, so neither blocks anything, and neither is
renamed here: see **Known label debt** below for why and for what a rename would cost.

## Resolution table

`EXACT` = the identifier is literally present in the named file.
`CAPABILITY` = the module is real and the capability is real, but the catalog id is a
readable label rather than a literal export name. Labels are deliberate — the catalog
describes *what an event needs*, not a call signature — so `CAPABILITY` is a pass,
not a defect. It is recorded so an integrator knows to look for the concept, not to
grep the string.

| system id | resolves to | grade |
|---|---|---|
| `npcJobs.phaseGraph` | `src/systems/npcJobs.js` — `PHASE_GRAPHS`, six distinct per-kind graphs | EXACT |
| `npcJobsRuntime.assign` | `src/systems/npcJobsRuntime.js:188` — producer-facing `assign()` | EXACT |
| `traffic.spawnRole` | `src/systems/traffic.js:89` — `TRAFFIC_ROLES` (one hull per role) | EXACT |
| `traffic.manifest` | `src/systems/traffic.js:277` — role mix drives market manifests | CAPABILITY |
| `traffic.escort` | `src/systems/traffic.js:86` — secure faction sectors get patrols/escorts | CAPABILITY |
| `signatureVfx` | `src/render/npcJobSignatureVfx.js` — `NPC_JOB_SIGNATURE_PROFILES`, `resolveNpcJobSignature()` | CAPABILITY |
| `signatureVfx.reaction` | same file — `NPC_JOB_REACTION`, `resolveNpcJobReaction()` | EXACT |
| `signatureVfx.deploy` | same file — `deployFraction()` | EXACT |
| `stationSideEvents.hauler_dock` | `src/data/stationSideEvents.js` — `SIDE_EVENTS.hauler_dock` | EXACT |
| `stationSideEvents.patrol_launch` | same — `SIDE_EVENTS.patrol_launch` (the only budget-1 side event) | EXACT |
| `stationSideEvents.repair_drone` | same — `SIDE_EVENTS.repair_drone` | EXACT |
| `stationSideEvents.cargo_tractor` | same — `SIDE_EVENTS.cargo_tractor` | EXACT |
| `encounterDirector.distress` | `src/systems/encounterDirector.js:146` — `_routeToScript('distress', …)` | EXACT |
| `encounterDirector.convoy` | `src/systems/encounterScripts.js` — convoy script, `CONVOY_ARRIVE_R` / `CONVOY_NOTICE_R` | EXACT |
| `encounterDirector.toll` | `src/systems/encounterScripts.js:162` — `const toll`, `TOLL_PAY_DIST` | EXACT |
| `encounterDirector.ambush` | `src/systems/encounterDirector.js` — `ambush_snare` shape | EXACT |
| `encounterDirector.whisper` | `src/data/encounters.js` — `WHISPER_LINES` | EXACT |
| `encounterDirector.squad` | `src/systems/encounterDirector.js` — `squadId`, `dir.active` squad records | EXACT |
| `encounterDirector.pressure` | `src/systems/encounterDirector.js:101` — `POOL_MAX`, per-deck `dir.pressure` | EXACT *(renamed)* |
| `sectorZones.slot` | `src/data/sectorZones.js` — `ZONE_TYPES` :23, `SECTOR_ZONES` :239, `zonesForSector()` :245, `zoneAt()` :255, plus `AUTHORED_PLACE_ZONES` in `src/data/authoredPlaces.js:120`. The **`.slot` suffix still names nothing**: `slot` occurs zero times in either file. The real slot vocabulary is `src/data/sectorActivityPockets.js` (`worldRecordSlotId` :96, `actorSlots` / `objectSlots` :156–157) — but that table is Ceres-only (`CERES_ACTIVITY_SECTOR_ID = 'sector_ceres_belt'`, every export `CERES_*`), so it is *not* what these cross-sector events resolve to. Suffix should be dropped — see **Known label debt** | CAPABILITY *(renamed)* |
| `wrecks.spawn` | `src/systems/aftermathWrecks.js:434` — `_spawnForSector()` materialises durable aftermath markers into ordinary wreck entities via `helpers.spawnEntity()` | EXACT |
| `salvage.strip` | **two** files share the name `salvageActions.js`. Pure catalog `src/data/salvageActions.js` — `SALVAGE_ACTIONS` :7, `actionForWreck()` :52, `poolForAction()` :63. System `src/systems/salvageActions.js` — `export const salvageActions = {` :58, which *imports* `actionForWreck` at :7 and stamps each wreck's `data.salvagePool` (:33, :39, via `salvagePoolForWreck` from `src/data/salvageLegality.js:29`); it listens on `entity:spawned` / `scan:completed` / `salvage:ventReactor` (:69–:71). The pool is *drained* elsewhere: `src/systems/mining.js` imports the same catalog at :25 and emits `salvage:completed` at :897. Piecewise stripping is the pool draining, not a `strip()` call | CAPABILITY |
| `pickups.spawn` | `src/systems/mining.js:732` — `_spawnPickup()`; `src/systems/cargo.js:199` dumps recoverable pickups | EXACT |
| `scanner.roleReadout` | `src/systems/scanner.js:1315` — reads `ai.archetype / doctrine / role` | CAPABILITY |
| `spawnBudget` | `src/systems/spawnBudget.js:27` | EXACT |
| `comms.ambientToast` | `src/ui/comms.js:229` — `bus.on('comms:popup', pushComms)`; payload shape documented at `src/data/narrative.js:105`; five modules emit it directly (`ai.js`, `factionPresence.js`, `missions.js`, `scenarioRuntime.js`, `story.js`) — a plain grep for the string also hits `uniqueWrecks.js` and `missions.js:177`, which route it indirectly. Module and capability are both **correct and live** — only the word *Toast* is wrong. The surface is the left-edge comms feed (`#sf-comms`, `left:20px` in comms.js's injected CSS), not the `#toasts` stack in `src/ui/toasts.js` (`styles/ui.css:79` — a top-right column). Label defect, not a missing capability — see **Known label debt** | CAPABILITY |
| `vfx.substrate` | `src/render/vfx.js:529` — the `vfx` particulate/light substrate | CAPABILITY |
| `ai.passive` | `src/systems/ai.js:148,340` — `ai.passive` flag, literally checked | EXACT |

## Known label debt

Two ids above are **misnamed but not broken**. Both capabilities are live and both
resolve to the right module; the id text mis-describes them. Neither is renamed here,
because a rename has to move together across `microevent.schema.json`
(`properties.systems.items.enum`) and every `catalog/*.json` that references it — and
this table is a *report against* that enum. Renaming the row alone would make the audit
assert a schema value that does not exist, which is precisely the defect class this
document exists to catch. Rows therefore stay keyed to the ids that are really in the
schema, and the debt is recorded:

| id today | should be | why | references to move |
|---|---|---|---|
| `sectorZones.slot` | `sectorZones` | `slot` appears nowhere in `sectorZones.js` or `authoredPlaces.js`. The suffix was reaching for `sectorActivityPockets.js` vocabulary that is Ceres-only and does not generalise. | schema enum + 12 events |
| `comms.ambientToast` | `comms.ambientLine` | The line lands in the left-edge comms feed, not a toast. Calling it a toast points an integrator at `src/ui/toasts.js`, the wrong surface entirely. | schema enum + 2 events |

**Exposure is asymmetric, and that is why neither is urgent.** All 12
`sectorZones.slot` dependents are `next20` (5) or `standard` (7) — **zero `first15`** —
so the wrong label costs nothing on day one. `comms.ambientToast` has two dependents
(`ev_structure_first_light` standard, `ev_tanker_holds_for_berth` next20), also zero
`first15`.

`salvage.strip`, corrected above, is the opposite case: **both** of its dependents are
`first15` (`ev_cutter_strips_wreck`, `ev_scavengers_at_fresh_wreck`). Six `CAPABILITY`
rows have at least one `first15` dependent, but `salvage.strip` is the only one whose
dependents are *entirely* `first15` — a bad cite there misleads an integrator on the
very first thing they wire, which is why it had to name both `salvageActions.js` files
and the `mining.js` drain rather than a single line.

## Not verified here (deliberately)

- **`donor.*`** ids point at the incubator packs (`npc_activity_pack`,
  `everyday_space_kit`, `lane_furniture`), which are source-only and imported by
  nothing. They are optional dressing by construction; every event runs without them.
- **`future.*`** ids are the five blocked events' missing mechanics. Their *absence*
  is the claim, and the validator already enforces the one rule that matters:
  `future.*` may appear only on `tier: "blocked"`, and never elsewhere.
- **Behavioural fit.** This audit proves each system *exists*. It does not prove a
  given system can produce a given phase's motion at the authored timing — that is
  the choreography runner's problem, and belongs to the integration task.

## Re-running this audit

The catalog is data; `src/**` moves underneath it. Before the integration task,
re-resolve the enum — a renamed or deleted module turns a `first15` event into a
silent lie. The enum lives in one place (`microevent.schema.json`, `properties.systems.items.enum`),
so the check is bounded: 39 ids, of which 26 are live claims.
