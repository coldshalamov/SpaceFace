# SpaceFace asset-to-experience toolbox

Research date: 2026-11-10. This is a working-tree research snapshot, not a global completion ledger, implementation dispatch, asset acceptance, or release certification. No production assets or gameplay source were changed. The base commit, inspected source hashes, actual inventory rows, merged first-sector data and selected file checks are in [evidence.json](evidence.json); [catalog-evidence.mjs](catalog-evidence.mjs) prints a deterministic, inventory-only snapshot to stdout by default. `--write=<new-path>` explicitly creates a new file and refuses to replace an existing one. It does not run reachability, render or playback checks. Historical check outcomes are recorded separately in [observed-checks.json](observed-checks.json), with exact UTC observation times marked unknown. The saved inventory timestamp dates inventory regeneration only; it must not be read as the date of those earlier checks.

## The recommendation

**Spend the existing assets on legible situations before producing more assets.** The stock is already unusually rich: work ships, machinery, legal and illicit cargo, broken variants, authored wreck families, civic props, portrait identities, sound events, and several physical multi-stage sites. The largest unverified question is whether a player sees a useful relationship between them at the normal camera, at the right moment, with understandable feedback.

The strongest near-term compositions are:

1. **Helios: one working chain the player can join.** Recognizable worker hull, actual extraction, one tangible load, receiving place and returning worker. A helpful intervention should visibly change the same worker's day.
2. **Foundry: one readable bank-and-throw court that becomes a flanking yard.** Preserve the current staged terrain and actual mass/material behavior. Make the before/after of a physical move easier to read rather than adding extra combat decoration.
3. **Ceres: the first job where carrying something changes the problem.** Use Second Measure, existing sections, brace/cut/release states and receiving hardware. The expensive-looking result comes from a safe cut becoming an awkward tow, not a new spectacular ship model.
4. **Tethys: a queue and inspection passage that behaves like a place.** Existing queue buoys, pins, tally post, container rack, pod and worklight already encode a civic spatial vocabulary.

These are proposed priorities, not claims that the current ordinary route has passed experience review.

## 1. What was actually verified

### Inventory and reachability

| Evidence | Verified result | What it does not prove |
|---|---:|---|
| `assets/ships/parts/parts_manifest.json` | 267 entries: 157 places, 66 whole ships, 44 modular components | 267 unique live gameplay subjects or current visual quality |
| `assets/ships/release/release_manifest.json` | 423 entries: 227 places, 151 whole-ship entries, 44 modular components and one ship reference | 423 distinct hull designs; the release includes variants/LODs |
| Release path check | All 423 declared files exist; total declared size 253,893,312 bytes | Download size of one play session or on-screen resident memory |
| Selected release verification | 20 scene-relevant files exist, have recorded byte lengths and match recorded SHA-256 | Successful decoding, material appearance or completed draws |
| `node scripts/check-asset-reachability.mjs` | Passed: 1,107 runtime references, 685 physically bundled, 422 render-package-routed | Ordinary-route visibility, frame rate or affordance readability |
| Everyday kit module | 46 legal catalog identities: 16 original + 30 promoted; no unused catalog identities | All 46 appear in one sector or every instance is interactive |
| Aftermath module | 45 catalog entries, 32 ordinary-spawn candidates, 11 hero IDs | Every hero is admitted to ordinary dressing; Helios explicitly skips this scatter |
| Portrait registry | 18 pending canonical faces are actually absent | A need to produce all 18 before testing the first session |

Sources: [part manifest](../../../assets/ships/parts/parts_manifest.json), [release manifest](../../../assets/ships/release/release_manifest.json), [everyday kit](../../../src/data/everydaySpaceKitDressing.js), [aftermath kit](../../../src/data/wreckAftermathDressing.js), [portrait registry](../../../src/data/portraits.js).

Disk census also found 87 portrait JPGs, 189 generated UI WebPs, 14 background PNGs, and 1,570 WAVs. These are file counts, not independently verified runtime identities or quality assessments. Do not turn the size of these folders into a content quota.

### Visual inspection and limits

Actual pixels inspected:

- [NPC role-identification sheet](../../../assets/incubator/npc_activity_pack/evidence/role-identification-sheet.png). An older reference sheet, not a current game render. The tanker’s exposed row of tanks, barge’s long open load bed, surveyor’s narrow spar, rescue craft’s receiving end and tug’s compact machinery provide visibly different work silhouettes. The sheet is very simply shaded; it does not establish today's Forge material quality or gameplay-scale readability.
- [Helios station illustration](../../../assets/ui/generated/stations/station_helios.webp). A dense cinematic ring hub with warm loading arms, lit mouths and moving freight. It communicates an inhabited port through **what the arms do**, not only by adding hull detail.
- [Ceres station illustration](../../../assets/ui/generated/stations/station_ceres.webp). Ore clamps, trusses, furnace light and large rocks explain a process. Its useful transferable principle is **a visible material path**. Copying its smoke and visual density into top-down gameplay would not automatically help.

The station illustrations are UI artwork, referenced by mission-log/codex art roots. They are not proof of the live station geometry or lighting. The photospace aesthetic of these paintings and the older blocky NPC sheet are different presentation layers; it would be a mistake to judge the current live fleet by comparing only those two.

**Fresh live-render attempt did not succeed.** The isolated Kestrel `fleet-look` command failed at Chromium startup before rendering: process-singleton `socket() failed: Operation not permitted`, plus a read-only crash-report settings path. No gameplay capture was produced. No other browser/GPU context was used and no render capability is claimed. Consequently the camera-scale, glow, color-contrast, occlusion and first-picture recommendations below remain review questions or design judgments, not measured visual defects.

## 2. Use the correct asset authority

The selection chain matters more than a filename:

1. A source asset or reference sheet merely exists.
2. A release file exists in the generated release manifest.
3. A runtime map can select it for an entity identity.
4. A world, scenario or feature owner actually places that identity.
5. Loading/admission/compilation finishes and the real renderer draws it.
6. The player understands its role at the normal camera.

This research verifies selected examples through stages 1–4. The failed render means it cannot certify stages 5–6.

- [wholeShipVisualIdentity.js](../../../src/data/wholeShipVisualIdentity.js) maps player definitions, traffic roles, hostiles and faction variants. Fifteen player-definition keys map to whole-ship files; fourteen have explicit LOD families in that map. A dictionary key count is not a fleet silhouette count.
- [partsLibrary.js](../../../src/render/partsLibrary.js) selects the authored body. Everyday and aftermath family maps are admitted by their corresponding flags or a deliberately authored set-piece identity. A random `placeId` alone is not always enough. Tally Three is deliberately protected from random dressing reuse.
- [world.js](../../../src/systems/world.js) seeds kit and aftermath streams separately, places them through its owner and stamps dressing identity. Existing data has core kit cap 4 and other-sector cap 6, and special composed exceptions. Those are current implementation facts, not proposed permanent art ceilings.
- [swarmArena.js](../../../src/systems/swarmArena.js) creates real terrain bodies and chooses authored geology skin by substance and size. The substance owns physical density/restitution/break behavior; a skin swap must not promise different physics.
- Named site hardware often has sockets, animation bindings and explicit physical envelopes. Reusing its mesh does not transfer its simulation authority or make its clamps work automatically.

Do not recreate the old missing-asset list. [needed-assets.md](../../../needed-assets.md) still describes a 63-entry manifest and blocked starter whole ships; the current manifests/mappings and checked files supersede those statements. [ASSET_REPURPOSE_POOL.md](../../ASSET_REPURPOSE_POOL.md) is historical context: most listed candidate directories are not present in this checkout, while `assets/ships/m5_kestrel_upgrade/` is. Do not promise reuse of missing candidate directories or delete retained candidates.

## 3. Practical toolbox: bodies, roles and truthful reuse

All filenames below are relative to `assets/ships/release/parts/` unless stated otherwise. Exact role-to-file maps are retained in [evidence.json](evidence.json).

| Existing stock | Runtime evidence | Productive use | Constraint / misleading reuse to avoid |
|---|---|---|---|
| `wholeships/kestrel.glb` | `ship_kestrel` mapping; release hash checked | Stable personal-scale reference beside worker, load and receiving structure | Do not enlarge every surrounding object to compete with the hero |
| `helios_cradle.glb`, `helios_span.glb`, `helios_lark.glb` | Miner, hauler, courier role maps | An extraction → collection → delivery chain with differentiated jobs | Motion must show actual jobs, not decorative orbiting |
| `yard_tug.glb`, `repair_tender.glb`, `salvage_cutter.glb`, `rescue_lifter.glb` | Tug, tender, salvor, rescue role maps | Recovery convoy, disabled worker, salvage claim, visible aid | Distinguish a working tool, a carried body and an escort by behavior as well as hull |
| `ore_barge.glb`, `volatiles_tanker.glb`, `prospector_skiff.glb`, `scrap_sweeper.glb`, `survey_pin.glb` | Dedicated traffic roles | Slow consequential loads, small prospecting work, cleanup following an event | Do not attach a named cargo consequence to a decorative body with no stock/custody owner |
| `place_cargo_pod_standard`, `place_ore_bulk_container`, `place_container_rack`, `place_transfer_arm`, `place_freight_platform` | Everyday catalog + world placement | A loading face, a waiting load and a clear receiving mouth | A rack is not a delivery receiver just because its shape resembles one |
| `place_cargo_pod_hazmat`, `place_cargo_pod_standard_breached`, `place_container_rack_abandoned` | Promoted everyday rows | Hazard, damage and abandonment variants, where state warrants them | No silent visual substitution that changes apparent cargo value or danger |
| `place_worklight_tower`, `place_maintenance_gantry`, `place_repair_scaffold`, `place_repair_scaffold_bent`, `place_welding_drone`, `place_parts_rack`, `place_power_skid` | Everyday catalog | One repair nook with active tool, damaged piece and spare stock | Dressing is not proof that a repair service is available; bind signs to existing service state |
| `place_drill_platform`, `place_extraction_mast`, `place_conveyor_truss`, `place_crusher_module`, `place_ore_sorter` | Everyday catalog | Make extraction, sorting and processing spatially different | Avoid a strip of machines that the ore never reaches |
| `place_nav_buoy`, `place_lane_pin`, `place_tally_post`, `place_worklight_tower` | Helios/Tethys named POIs | Queue heads, lane shoulders, small readable civic punctuation | Navigation and route-clearance cues must agree with real path/collision rules |
| `place_habitat_pod`, `place_shuttle_dock`, `place_observation_blister`, `place_passenger_platform`, `place_utility_module` | Promoted everyday rows | A human-facing side of an industrial place: arrival, waiting and observation | Do not imply walkable interiors or new passenger simulation |
| `place_salvage_clamp`, `place_hull_rack`, `place_scrap_cage`, `place_illicit_transfer_frame`, `place_power_skid_patched` | Everyday catalog | Legitimate and illicit receiving areas using related industrial grammar | Their appearance is context, not ownership permission or legal status |
| Aftermath cockpit, engine, cargo module, pressure tank, radiator panel, armor slab, weapon spar | Aftermath catalog; also shipbreaking-yard layouts | Identity-preserving salvage: a hull becomes recognizable reusable pieces | Keep one donor/family grammar together instead of random debris soup |
| `place_rock_<substance>_<size>` families | Explicit place list + Swarm authored-geology selection | Heavy banks, light throwing stock, material-specific responses | Match native collider, mass and substance; do not infer physical behavior from color alone |
| `swarm_warden.glb`, `swarm_jackal.glb`, `swarm_anchor.glb` | Hostile map and specialist motion-node bindings | Shield relationship, mine-lane shaping and timed anchoring problems | Preserve motion-node names and action phase readability; do not use them as generic fodder |
| Brood family geometry | `broodPresentation.js`, typed-array simulation in `swarmBrood.js` | Many light physical opponents with distinct moving silhouette/cue recipes | Code-native instanced geometry is an intentional system, not automatically a missing GLB request |

**Reuse rule:** every proposed prop should have a sentence of the form “the player can recognize X, do Y to/around it, and see Z change.” If only X is true, it is dressing; place it sparingly and do not sell it as gameplay.

## 4. First-area geography: actual merged data, not a fresh blank canvas

[sectors.js](../../../src/data/sectors.js) imports and merges [sectorAnchors.js](../../../src/data/sectorAnchors.js). The merged `SECTORS` export was inspected. All positions in this table are **sector-local X/Z**, not star-map coordinates.

| Place | Effective coordinates | Existing identity / design consequence |
|---|---|---|
| New-game player | `(0,0)` in bootstrap | Starting relation must remain understandable at personal ship scale |
| 47-A evidence spindle | `(92,0)` | Authored `pods/pod_47a_evidence_spindle.glb`; a custody-marked load, not generic freight |
| 47-A carrier wreck | `(340,220)` | `place_dead_hulk`, radius 92 and dynamic mass 9,000; existing physical landmark near the opening |
| Corridor Pin 44-C | `(215,-70)` | `place_lane_pin`, visual radius 10 |
| Tutorial beacon | `(380,-120)` | `place_lane_beacon` |
| Starter seam | `(720,-260)` | Effective cluster radius **240**, count 42; raw sector text says 380 but the anchor overrides it |
| Starter claim mark / locker | `(636,-214)` / `(772,-302)` | `place_claim_mark` / `place_cold_locker`; locker has actual 3-silverium cache payoff |
| Recovery Relay | `(760,-620)` | Stateful industrial site slightly off the seam rather than another random marker |
| Helios Station | `(1280,-420)` | `place_station_trade_hub`; market/services and origin for work |
| Bay 7 | `(1410,-310)` | `place_cold_locker`, visual radius 14; 170 WU from station center |
| Candle Fleet | `(1680,-820)` | Own `place_landmark_candle_fleet`; visualRadius 28 but authored draw target radius 100 |
| Coalition HQ | `(-920,1080)` | `place_station_military`; different civic destination, not the same lane |
| Ceres / Tethys / Vesta gate bearings | `(-2388,1592)` / `(2388,1592)` / `(0,2870)` | Distinct outbound choices, not props to squeeze into one first-screen composition |

Sources: [new-game bootstrap](../../../src/core/newGameBoot.js), [47-A live scene](../../../src/data/scenarios/47aLiveScene.js), [world sites](../../../src/data/worldSiteManifests.js).

The beacon→seam center distance is about 368 WU; seam→station about 582 WU. Those are travel distances, not proof of simultaneous camera visibility or estimated journey times. A sector map can look dense while ordinary flight still shows isolated objects. Do not solve that by spraying more background props everywhere: compose the actual approaches, turns and receiving faces.

Helios has `enemyDensity: 0`, and [sectorCoordinates.js](../../../src/data/sectorCoordinates.js) defines a 1,400-WU starter sanctuary. That does not prove an empty scene: the bootstrap also installs the 47-A cast through its cold-start-safe path. Existing explicit scenario actors and evolving work systems must be audited before adding “the first encounter.” Avoid duplicating an opening event already present under another owner.

The first step outward already has contrast:

- **Ceres:** refinery at `(-1100,620)`, mining station at `(780,-940)`, three authored fields, Second Measure workfleet and physical shipbreak. Composition can favor a material path, slower loads and intervention costs.
- **Tethys:** hub at `(1050,380)`, customs at `(-640,-1180)`. Queue buoys, red/green gate pins, tally post, rack, pod and worklight are already individually placed. Composition can favor right-of-way, custody and a public/private margin.
- Star-map coordinates use a **4,096-WU lattice** for sector global origins. Do not add local coordinates directly across sectors. Also do not trust the stale “three-sector corridor” introductory comment: the current exported resident corridor list is larger.

## 5. Existing named scenes worth arranging, not reinventing

### Helios Recovery Relay: the smallest complete industrial scene

At `(760,-620)`, `world_site_helios_relay` uses the claim-outpost relay/base/refinery bodies and authored sockets. Its manifest has repair core, recover coupler, cut brace, unseal cradle, settle field coil and repair beacon operations. The coil is a real 180-mass payload; receiving it has existing economic/faction consequences.

**Use:** a place where repairing, releasing and moving are one intelligible chain. Keep the same workpiece in view through each operation so the result is spatial memory, not a checklist.

**Risk to review:** the stages swap between substantially different base assets and scales (0.14→0.20). Without live pictures this is not a confirmed visual bug, but it is an important continuity check: does repair read as improvement to the same machine, or an unrelated object appearing?

### Ceres Second Measure: people and cargo share a problem

[ceresShipbreak.js](../../../src/data/ceresShipbreak.js) defines long plate, crossbeam and keel sections with authored cut/support sockets. Bracing, cutting and release are separate operations. [ceresWorkfleet.js](../../../src/data/ceresWorkfleet.js) supplies dedicated breaker, section cradle and cutter head identities with motion and collision specifications. The alternate [shipbreaking-yard layouts](../../../src/features/shipbreakingYard/layouts.js) already reuse aftermath pieces for LARK, BELLWETHER and VESPER jobs.

**Use:** the natural escalation from “I can drag a thing” to “I must choose where a thing will go when it becomes free.” Preserve the cut seam, support clamp, receiving cradle and escape side as distinct readable features.

**Avoid:** spawning an ornamental new yard around a functioning existing yard or representing a single composite hull as seven unrelated debris models without custody/state continuity.

### Tally Three: machinery that makes ownership visible

The assessor has its own `place_tally_three.glb`, physical envelope and four instrument pivots. [tallyThree.js](../../../src/data/tallyThree.js) ties it to a finite Ceres claim crate, a specific owner/manifest, inspection range and receiver speed. [tallyThreeVisuals.js](../../../src/render/tallyThreeVisuals.js) binds the instruments to actual facts.

**Use:** a visible scan/stamp/wait action that makes a legal or disputed load understandable. This is a good reminder that bureaucratic fiction can be physical, not merely terminal prose.

**Avoid:** scattering duplicates of the named assessor as generic weighing furniture. Its deliberate identity guards are meaningful.

### Candle Fleet and Wreck Cathedral: memory in physical places

Candle Fleet already has a distinct authored body and an enlarged draw target; its dark plinth and bearing are linked to an existing investigation. Wreck Cathedral uses `place_landmark_wreck_cathedral` through stabilized, records-open and archive-linked stages with forensic operations and black-box recovery.

**Use:** recurring landmarks the player can recognize without a label, with an intervention changing some of the place while preserving its identity. Give the act of approaching, choosing a side and returning weight.

**Avoid:** new plot objects that merely restate existing dark-plinth, recorder or cargo-clamp functions.

### Cinder Nursery: familiar work machinery becomes unfamiliar

`world_site_charon_cinder_nursery` uses `place_conveyor_barge` at Charon-local `(1700,-1400)`. Existing components include power bus, relay node, flight-recorder cradle and filament cysts. Repair, cut and extraction operations feed real ecology consequences. Its stages distinguish powered/opened/ruptured/silent.

**Use:** recognition followed by changed behavior. The player has seen industrial transfer machinery before; here its relationships have been colonized.

**Avoid:** describing a fully authored organic infestation as visually verified. This research verified the body/state bindings, not the final growth picture. Also, “extract cysts or sever relay” is not automatically an exclusive mechanical choice: the operation manifest itself permits those independently, although stage requirements frame different outcomes.

## 6. Swarm: assets should explain the physical question

The current [opening terrain plan](../../../src/data/swarmOpeningTerrain.js) is already authored, not a random empty arena:

- Only Foundry (`helios_core`), waves 1–3, line tier 0, unaltered mode uses this layout.
- Bank counts are 8, then 11, then 14. Existing survivors retain their slots; displaced banks do not grant permission to clone replacements into their old slots.
- Near shoulders begin around `(±150,±100)`, with farther banks near Z ±235–275. Wave two adds flanks; wave three adds longer receiving banks.
- The bank placement test keeps a 96-WU X strip between these banks. The code explicitly warns that this is **not** a whole-room native-collider corridor guarantee: lesson bodies and other owners may occupy it.
- Swarm terrain chooses authored geology skins from real release families. Debris material remains a wreck; it is not automatically a rock wearing scrap paint.

**Scene priority:** first make a short throw, a sideways bank and an escape around the same remaining bank understandable. Later change the direction and pressure of the attack, not all furniture and all visual language at once.

The ordinary ship population and Brood are separate systems. [swarmBrood.js](../../../src/data/swarmBrood.js) specifies a 100–400 population curve and family clock; [broodPresentation.js](../../../src/render/broodPresentation.js) uses deliberately designed instanced bodies, silhouette stretches and pre-hit telegraphs. Do not infer the actual first-frame population from the curve alone: opening holds and cohort admission are separate runtime behavior.

Specialists already have shape/animation contracts:

- Warden: paired shield motion nodes plus a physical-looking link to the protected body.
- Jackal: gate motion nodes and a mine-lane wake.
- Anchor: vane motion nodes showing the anchoring cycle.

[swarmSpecialistVisuals.js](../../../src/render/swarmSpecialistVisuals.js) is the binding source. Distinct silhouettes are valuable only if the player's response can be read before impact. Check the action shape and timing alongside the body, not a beauty render alone.

Later authored acts already exist: mooring-line waves 26–28 and breaker-yard waves 32–34 in [swarmMode.js](../../../src/data/swarmMode.js). Use their changing physical question as a model for progression; do not add another redundant specialist tutorial without reviewing this roster clock.

## 7. Style and readability: what to preserve, what to test

The product authority is [VISION.md](../../VISION.md): bright, fast physical agency in a working universe, not muted industrial stateliness. Current asset guidance is [visual-assets/README.md](../../../docs/visual-assets/README.md): inspect the actual game picture, manufactured surfaces, silhouette and broad values, one coherent system. These principles do not authorize a generic low-poly replacement pass.

### Preserve

- **Work silhouettes:** tanks, beds, arms, mouths, clamps and load position should reveal the job before a tooltip does.
- **Relationships:** worker→tool→load→receiver, or attacker→protected target→intervening bank. A useful scene is a relationship, not a density target.
- **State continuity:** damaged/working/released/received should preserve enough geometry and spatial position to identify the same object.
- **Place contrast:** Helios currently has one signature ringed gas giant; Tethys its unique galactic spur and no hero planet; Ceres a dim rocky body and dusty warm-neutral light. These are current [sector visual profile](../../../src/data/sectorVisualProfiles.js) contracts, not reasons to tint every prop the same faction color.
- **Quiet surrounding surfaces:** reserve the strongest cue for the immediate decision. An always-bright worklight must not impersonate a target, a reward or an incoming hazard.
- **The personal ship:** keep its heading, held mass, line attachment and nearest threat understandable through effects and foreground geometry.

### Test at the ordinary camera

1. With labels off briefly, can a viewer distinguish worker, useful load, receiving place and obstruction?
2. With the player moving, do a tethered bank and an inert background prop look meaningfully different?
3. Does the camera show the object a prompt asks the player to act upon, or merely a distant marker?
4. When a clamp releases or a receiver accepts, does the object's changed physical state explain the result without reading a toast?
5. In a reduced-motion/low-effects setting, do danger and custody remain legible?
6. After a missed throw or wrong approach, does the surviving arrangement tell the player what happened?
7. Does the same scene still read after returning, saving/loading, or approaching from the opposite side?

No screen-space thresholds, luminance differences or performance gains were measured here. Establish those from current captures before prescribing numerical fixes.

## 8. Missing assets versus workarounds

| Need | Classification | Best next move |
|---|---|---|
| Another generic miner, tug, repair ship, cargo box or wreck fragment | Existing stock, not a demonstrated gap | Bind/compose the correct existing identity and actual job |
| Readable receiving spot or repair availability | Primarily relationship/state presentation until disproved | Use existing receiver/clamp/worklight and authoritative service state; inspect in motion before commissioning new art |
| Eighteen canonical contact faces | **Confirmed missing files** | Request only the next recurring contacts the selected experience needs; Wex is a plausible early worker-facing candidate, not a decision to manufacture all 18 |
| One borrowed portrait for many new named people | Invalid workaround | Preserve deterministic identity fallback until each recurring identity has its own image |
| A fresh, distinct top-down job silhouette absent from role maps | Conditional asset request | First show why the nearest existing role cannot communicate the job at camera scale; specify role, size context, state range and counterpart silhouettes |
| Organic colonization on familiar machinery | Existing state/body basis; final visual adequacy unverified | Inspect Cinder Nursery in-game. Request geometry/surfacing only for the specific missing organic relationship, not a whole replacement barge by default |
| A physical broken/detached state with no matching authored piece | Conditional request, after catalog check | Search aftermath and original family sockets; request the smallest state-specific piece only if reuse loses identity or lies about collision |
| More haze, luminous rings or sparks to make a place “alive” | Usually an arrangement problem | Make a real job and transfer visible first; reuse authored events without new perpetual noise |
| A unique sound for every prop | Not established by this audit | Existing collision ladder, mining, tool and station-life cues are mapped; listen in context before adding samples |
| A current game-render review | **Verification capability gap** | Run the existing fleet/flight tools in an authorized functioning local renderer; do not treat painted UI art as replacement evidence |

The full pending-face list and existence checks are in [evidence.json](evidence.json). The existing eight canonical and fifteen named-contact portrait entries should retain their identities. Terminal-only or deliberately unseen characters do not become portrait requests merely because they lack image keys.

## 9. Prioritized scene briefs

### P0-A: Helios, “I helped that ship finish its work”

**Reuse:** Cradle, Span, actual seam/iron, claim mark, one existing receiving place; one uniquely identified worker/contact. Use the existing work systems, not a second demonstration route.

**Experience:** the player arrives during a real operation, sees the load it produces, can help or get in the way, and recognizes the returning hull. Completion changes something in the same visible chain. Failure leaves a load, a delay or a repair need rather than erasing the scene.

**Arrangement work:** choose the strongest existing chain; remove competing introductions from its immediate decision space only through their owners; align approaches so job, product and receiver become understandable over successive frames. Do not infer simultaneous visibility from map distance.

**Acceptance:** ordinary New Game route, one full work cycle, optional intervention, a deliberately bad approach, return later. Verify actual stock/custody and displayed source file, not only presence of a mesh. Required next evidence is video/frames of the relationship, not more catalog counts.

### P0-B: Foundry, “That bank was the move”

**Reuse:** current first-three-wave court, authored stone family and material response, lesson hull/well, existing hostile silhouettes and Brood.

**Experience:** one initial threat makes the nearest bank useful; the player sees its role before the room becomes crowded. Wave two gives a flank around recognizable surviving furniture. Wave three makes a longer throw meaningful.

**Arrangement work:** isolate which body is the target, which is the tool and where release is useful. Review action cues and retained terrain before adding effects. Preserve real clearances and exits, including native collision envelopes.

**Acceptance:** ordinary run and retry, first throw, miss, bank collision, flank escape, material difference, held/remnant continuity. No claim of success from pure planner tests alone.

### P1-A: Ceres, “A clean cut made an awkward load”

**Reuse:** Second Measure breaker, section cradle, cutter head, plate/crossbeam/keel, existing work operators and receiver.

**Experience:** a player can reason about support and release; the freed piece changes movement and needs a chosen path to its destination. Someone else's working route makes reckless movement matter.

**Arrangement work:** shape a visible safe side and one consequential crossing. Use current brace and receiving state, not fake arrows independent of physics.

**Acceptance:** brace→cut→release→move→receive, one premature release, one interrupted/reloaded job, same physical piece and custody throughout.

### P1-B: Tethys, “A working queue has a way through”

**Reuse:** already-authored queue buoys, pins, tally post, rack, pod and worklight, plus real inspection/traffic owners.

**Experience:** entering, waiting, being inspected and finding a pull-off feel different without needing a new station mesh. The legal and social meaning of a load comes from actions witnessed in the space.

**Acceptance:** follow actual traffic once, enter from the wrong side, leave/re-enter, inspect a relevant cargo state. Confirm the art does not suggest a clear lane that the native bodies obstruct.

### P2: Cinder Nursery, “I know this machine, but something changed it”

**Reuse:** colonized conveyor barge, existing power/relay/recorder/cyst operations and ecology consequences.

**Experience:** an industrial vocabulary learned earlier becomes an ambiguous living system. The consequence should be visible in the same place after the action.

**Acceptance:** each meaningful operation path and its persistent state, effect/collider correspondence, growth readability against the familiar hull. Only after this review should any targeted organic asset request be approved.

## 10. Next evidence pass, bounded and honest

1. Run `catalog-evidence.mjs` if this working tree changes materially; its default is stdout, not an update to this saved evidence. Use `--write=<new-path>` only when intentionally saving a distinct inventory. Source hashes identify each snapshot. Historical check observations must be recorded separately and must not inherit the inventory collection time.
2. On an authorized renderer that can launch Chromium, start with the existing `flight-look` and `fleet-look` tools, not a new art viewer. Obtain ordinary-route frames plus actual authored-loading/draw diagnostics.
3. Capture Helios departure/first worker/load/receiver, Foundry first action/wave-two flank, Ceres cut/released piece/receiver and Tethys queue at their normal camera. A lab body view supplements those frames, never replaces them.
4. For each scene, record only concrete failures: missing body, lost identity, misleading action shape, blocked approach, unseen receiver, conflicting cue or confusing state transition. Assign the smallest appropriate owner: placement, behavior, camera, cue, material or asset.
5. Create a new asset request only when the failure survives correct placement/state binding and cannot be solved without losing an existing asset's identity or physical truth.

**Not done here:** gameplay implementation, new assets, publication, current frame-rate measurement, fresh rendered visuals, listening tests, gameplay playthrough or certification of current first-session quality.

### Collector provenance correction and verification

The original collector incorrectly copied earlier check outcomes into every newly timestamped inventory and overwrote `evidence.json`. This has been corrected. [observed-checks.json](observed-checks.json) preserves the separately observed results without inventing exact UTC times. [inventory-refresh.json](inventory-refresh.json) is an explicitly saved, inventory-only rerun; [collector-verification.json](collector-verification.json) records its independent execution interval and confirms that default runs leave saved evidence unchanged, unchanged inputs produce identical JSON, explicit new-file output works, and attempts to replace an existing output are refused. Neither reachability nor the failed Chromium render was rerun by this correction.
