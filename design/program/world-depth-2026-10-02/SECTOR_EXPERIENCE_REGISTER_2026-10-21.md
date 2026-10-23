<!-- LIFETIME: DURABLE -->

## Latest execution addendum: 2026-10-23 08:03 UTC

All ten goals remain OPEN. This addendum supersedes older current-status prose, not historical evidence, the twenty-concept scope or acceptance boundaries.

- [PR526](https://github.com/coldshalamov/SpaceFace/pull/526), head 6f6ff23b76acd8d755ed14d483890d175b2e1d49: six verified files preserve the rescued Rhea person separately from the original destroyed hull, with one durable return body. 41 distinct local cases pass. Exact-head hosted run 5899 ended in failure; the focused gate executed and passed 32/32. Static-1 artifact 12484619564 has SHA256 64683354fd4a2e090d060825bf4aead6520189a7d7d84d45d6f253e00db9cd43. Browser shard 3 was cancelled; other failures remain unattributed without paired-base evidence. No manual rerun or cancellation.
- [PR531](https://github.com/coldshalamov/SpaceFace/pull/531), head 7930e49766d85435631585be9e6316faa3f6b36c: five verified radio-consumer files, stacked on PR526. 45 actual-world composed cases pass. No hosted run triggered: the main workflow excludes its non-master/main base and other path filters do not match. PR480 still separately owns worker-clock/Ilex/restore integration; no duplicate clock is shipped.
- [PR532](https://github.com/coldshalamov/SpaceFace/pull/532), latest head 91beaf85f50ba401319bc0727faf1ec5ad715ad9: the no-betrayal repair now includes the connected clean-carrier clinic route. First Nyx arrival, actual food/medicine acceptance and settlement, two-delivery trust progression, existing Hyperion→Ceres→Tethys medical route and saved once-only Hesper reward are implemented through existing owners. Seven follow-up files and final nine-path PR diff verified. 75 distinct final local cases pass; prior-head run 5900 separately proved its 10-case trust gate. New exact-head check 39921483212 is active; mobile-readiness 39921483220 failed, attribution under inspection. Short deliveries preserve existing proportional pay plus completion trust. Travel is fixture-controlled, not player-flown acceptance.
- [PR533](https://github.com/coldshalamov/SpaceFace/pull/533), head 026e0e0975cb502ae82147da312fffcd6e92d10c: four verified files stop station Decant from consuming sealed first-trade fuel. Full eight-cell delivery retains 760 credits; genuine four-cell loss still follows the unchanged 380-credit short-delivery policy. 32 distinct local cases pass. Hosted run 5901/39919475932 is active; its focused Decant command was included, executed and passed with exit 0. Do not call the whole workflow green.
- Choir PR528 remains at a4a1e242810db056533753eb39a4d5a84d644e95 with six verified files and a portable selected-owner native-return proof. Hosted run 5887 ended failure, focused Choir gate explicitly passed 17/17. Historical 5882 ended cancelled with its command passing. Other failures are not labelled unrelated without paired-base evidence.
- Next executable work: finish exact-head CI attribution for Nyx and Decant, then implement the next evidence-backed observable sector activity using existing placed assets and persistence owners after exact path allocation. All source/test/report packages, failed attempts and qualification inputs are durably recoverable outside the VM. GitHub source persistence is verified, not replaced by backups. Current public baseline last checked: 93706e9ff07563af29461ea4b4d65486b710ee7d.
- No merge, deployment, full production boot, native player journey, visual/performance or whole-game acceptance is claimed. Existing Writ/asset/browser holds remain isolated and unchanged; no new user action is needed for the active source/test lane.

# Sector experience register — 21 October 2026

## Purpose and evidence boundary

Answer the owner's connected-experience questions: what is legible on first arrival, what continues without the player, what changes, and what remains on return? This is an evidence register supporting the existing P00–P21 / SF20 owners, not a new dispatcher, feature queue, or completion claim.

**Public source baseline:** Git tree `14e75955a06dcaf9681925a50730a1be10f3313b`, supplied by the parent as the actual public tree. The tree object was checked locally. Counts below were obtained by evaluating its actual data modules through a read-only Node loader that reads each source module using `git show TREE:path`, not by evaluating the newer working-tree modules and calling them public. No remote/live-deployment verification is implied. **Canonical local reference at intake:** `515eb1e54004b8990c9301499f950d114906de94`; source differences and private candidates are not evidence of public completion. Concurrent ownership may advance after this snapshot. The parent subsequently verified published revision `39ec` / tree `4e93`, which adds the scoped Orchard rendezvous, not sector inventory changes. The census deliberately remains frozen at `14e75955a06dcaf9681925a50730a1be10f3313b`; the abbreviated newer IDs are parent-supplied checkpoint labels, not substitutes for the full baseline hash.

Read alongside `build_map.md`, `EXECUTION_STATUS.md`, `CONTINUATION_RUNBOOK.md`, `OPEN_GOALS.md`, `IMPLEMENTATION.md`, `TWENTY_CONCEPT_AMENDMENT.md`, and the original twenty dossiers in `references/sf20-2026-10-03/REPORT.md`. The original report's finding still applies: strengthen encounters, not inventory. Latest execution checkpoint is a dated receipt, not authority to describe later work as merged or accepted. The current public goal checkpoint `37e19e68652f8d56f88a2c1fada02b0760ebaf7c`, verified by the parent, has **nine** open goals including `SF-SECTOR-COHERENCE`; the earlier eight-goal execution checkpoint is historical on this point.

Evidence labels:
- **S — public source:** definitions/consumers exist in the named public tree; not proof of successful normal-route gameplay.
- **C — canonical-only difference:** newer/local implementation differs from the public baseline. Inspect before reuse; never substitute for public evidence.
- **P — intended:** authored design or an acceptance recommendation, not implemented behavior.
- **U — unverified:** no current exact-tree ordinary-route, persistence, visual or performance witness was obtained in this read-only audit. Unknown does not mean absent.

No game was launched, no images inspected and no new runtime/save tests run for this register. Therefore every sector's first-arrival readability, complete repeated-work loop, composed visual quality and normal-player Save/Continue acceptance are **U**, even where detailed source exists. In particular, a descriptive way-of-life sentence, timer route, registered system, GLB on disk or passing historical unit test cannot close a sector experience.

## Connected experience increment: Ilex active-voyage guidance — 21 October 2026

Scope: existing SF20-04 / P08 Tethys departure, original six-vault escort and Ceres greenhouse outcome. The frozen inventory above remains unchanged. This increment fixes an inspected behavior gap: the live offer previously used settled outcome prose during an active voyage, incorrectly announcing failure when no vault had arrived yet.

- First contact retains the existing optional escort briefing. Once accepted, the actual offer and prompt consumer distinguish active progress from settlement, show arrived/6 plus nonzero custody states, and explain carrier protection or Massline recovery of released originals before the existing deadline.
- Ordinary revisits use current original-vault records. A lost carrier does not erase recoverable loose vaults; zero recoverable originals and all six arrived each receive truthful guidance. Ceres receiver course, eligible handover and filing actions remain gated by existing behavior.
- Filing warns that remaining recoverable originals become lost. Existing destroyed records, reward calculation, greenhouse harvest delay, finite stock, mission state, native receiver rules and prompt cadence are unchanged. True settled outcomes retain their original wording.
- Evidence: `src/data/ilexArk.js`, `src/systems/ilexArk.js`, and `test/ilex-active-voyage-readout.test.mjs` exercise actual offer-to-prompt data, scalar original-body transactions and production save/loadEnvelope restoration. Seven focused checks pass independently. Scalar world setup is not native flight, a browser layout witness or complete world-reentry acceptance.
- Remaining acceptance: ordinary Tethys-to-Ceres voyage, readable in-game prompt layout, actual physics/performance, and full connected greenhouse consequence experience. Keep SF-LIVING-WORLD and SF-SECTOR-COHERENCE open. No new inventory or isolated subsystem is introduced.

## Connected experience recovery: Ceres remembers the Ilex planting — 21 October 2026

Recovered and reconciled the existing unpublished greenhouse proposal rather than creating a competing system. The ordinary Ceres barkeep now offers a greenhouse conversation only after a valid settled original-vault outcome. Existing greetings, other contacts and station-local market news remain unchanged.

- Reports accepted seed lines and the filed reward only when the matching mission journal verifies the amount, including a capped credit award. A zero-arrival voyage reports no planting.
- Distinguishes a pending first crop from an actual committed economy harvest. Elapsed time, present market stock and unrelated receipts cannot establish that the crop happened.
- After harvest, reports the historical Provisions addition and directs the player to Market for current availability. Later trades do not erase history or imply the goods are still available.
- Uses a bounded four-field, read-only station projection instead of copying voyage bodies or economy journals. No new stock, reward, persistence schema or economy mutation.
- Evidence: `src/data/ilexGreenhouse.js`, station `barContacts.js`, `scripts/lib/simReadModel.mjs`, and ten focused `ilex-greenhouse-bar.test.mjs` cases. Actual settlement/mission/economy consumers and production Save/loadEnvelope are exercised under scalar setup before and after crop, with post-trade return and forged/foreign receipt negatives. The public-consumer baseline lacked the choice/reply/transport; mounting the candidate leaf alone did not satisfy those consumers.
- Remaining acceptance: actual ordinary flight to Ceres, station layout/readability, native route/performance and the full inhabited-sector experience. This scoped connection does not close SF-LIVING-WORLD, SF-SECTOR-COHERENCE or any larger game goal.

## Connected experience recovery: Ceres approach announcements — 21 October 2026

The existing station PA owner now has an evaluation clock in the explicitly marked production worker, where the production registry owns station broadcasts and the voice arbiter. The previous browser-only timer never evaluated this owner there. This restores existing generic station and Latch guidance as well as the recovered Ilex recap; it is not a new radio system.

- On a qualifying Ceres approach, accepted seed-line facts and actual committed first-harvest history may surface through the existing lowest-priority ambient voice/caption channel. No wallet details, invented greenhouse rooms or current-stock claims are announced.
- Tutorial, combat, occupied voice floor, flight mode and nearest-station range remain authoritative. There is one browser-or-worker clock, ordinary headless simulations remain silent, and the twenty-second cap also respects delayed actual presentation.
- Matching voice:surface delivery, not queue acceptance, consumes the transient recap. Rejected, expired or preempted-before-presentation lines can retry; changed facts and departure invalidate stale queued messages. Repeated visits remain quiet for the same fact, while actual harvest permits the changed recap. Continue may recap restored facts once under the existing transient owner policy; no saved heard flag is added.
- Evidence: `stationBroadcast.js`, the committed-fact formatter in `ilexGreenhouse.js`, and twelve focused broadcast tests cover lifecycle, rate cap, actual arbiter behavior and real production worker-to-host-to-main caption receipt with zero stepped simulation ticks. Existing greenhouse Save/Continue and Latch guidance regressions remain intact.
- Remaining acceptance: audible playback, ordinary approach timing, actual presentation quality and the full connected sector experience. Caption delivery does not prove that a player heard the line or that the sector is accepted. No audio-system, voice-arbiter, transport, gameplay-state, shared RNG or saved-schema edits.

## Connected experience recovery: Ceres Towline player actions — 21 October 2026

The existing SF20-06 crew cleanup and earned-tow interaction now has a complete production-worker player path. Previously its prompt adapter was classified as worker-safe despite requiring the main realm's prompt deck, and none of its five rendered actions crossed the main-to-worker allowlist. The shared dispatcher also supplied a selected target ID where delivery expected player or crew authority.

- The narrow capability correction keeps the authoritative Towline owner in the worker and the deck adapter on main. The existing complete offer event supplies presentation data; no read-model projection or transport expansion is added.
- Only take, deliver, assist, release and course user actions are admitted. Delivery always uses player authority; selected cargo is passed only to assistance. Trusted internal crew delivery, receiver/custody checks, failed-cut rollback and finite original receipts remain intact.
- A callback belongs only to its current actually offered prompt and rendered choice. Superseded, restored, departed, docked, destroyed or already-consumed prompts cannot issue another action. Existing earned labor retains its original load and deadline through Continue and cannot refill from stale clicks.
- Eleven focused cases cover the actual registry selection, production host and both event bridges, original take/handover, receipt persistence, stale callbacks, forged actor payloads, rollback and earned labor. Five adjacent scalar Towline regressions remain intact. These tests stub the deck DOM, use scalar attachment ports and step no native simulation ticks; they do not establish ordinary flight or visual acceptance.
- The event census change contributes exactly the five Towline actions relative to its baseline. Unrelated pre-existing generated-surface drift is deliberately not absorbed. No survivor-relief expansion, shared NPC job changes, new rewards, saved schema or alternate stock is included.
- Remaining acceptance: ordinary Ceres approach, visible prompt layout and timing, native moving-load recovery and the complete sector experience.

## Connected experience recovery: Ilex voyage choices — 21 October 2026

The existing six-vault voyage now has a working production-worker presentation/action path. Its deck adapter previously belonged to the worker despite a main-realm deck, and none of its four rendered actions crossed the event allowlist. This is completion of the existing Ilex-to-Ceres experience, not a new mission or alternate reward system.

- Only the presentation adapter moves to main. The existing complete worker offer provides its text and choices; the authoritative Ilex owner, original vault identities, receiver/native custody gates and all listener signatures remain unchanged.
- Accept, hand over the actual towed vault, file the arrived count and set the Ceres course are the only added player event types. The checked-in surface preserves Towline and deliberately excludes unrelated inherited generator drift.
- Each callback is valid only for its current offered decision and a displayed choice. Restore, new game, departure, docking, destruction, replacement and repeated clicks invalidate stale callbacks. An unrendered finish cannot be invoked through the adapter.
- Actual registry and both production bridges are exercised through acceptance, course, scalar native-line port handover and explicit partial filing. Zero, one, five and six arrived originals preserve irreversible outcomes and payments through production Save/loadEnvelope; settled prompts remain leave-only. Forged expired flags cannot select the trusted deadline path.
- Eleven focused tests and seventeen unchanged active-readout/greenhouse regressions pass. The prompt deck DOM is stubbed, physical attachment/receiver ports are scalar, and no native simulation ticks are stepped. Ordinary flight, visible prompt quality and full connected sector acceptance remain open.

## Connected experience recovery: Ceres Last Shift evidence route — 21 October 2026

The original SF20-18 evidence, optional recorder return and Doss report route now connects its existing worker owner to the actual main-side prompt/arrival cue. Its adapter was previously excluded from main, and recover, cancelRecovery and cueSurfaced were missing from the checked-in event surface despite existing literal census discovery. Existing archive and return actions remain intact; no unrelated generator drift is adopted.

- Only the deck adapter changes realm ownership. Complete worker readouts plus already-mirrored mode supply presentation data; clues, custody, recovery, archive, payments and saved state stay with the existing authoritative owner.
- Arrival/revisit acknowledgement requires the current cue's actual connected matching toast, not queue acceptance. On worker-main only, a lifecycle-guarded microtask sends that verified receipt after replay's intentional echo guard ends. Local synchronous behavior and the generic transport guard remain unchanged. The acknowledgement records presentation, never grants clue knowledge.
- Tokens are minted before synchronous presentation so a reentrant replacement, restore, departure, destruction or DOM teardown cannot revive the old cue. Current displayed choices alone may emit decisions; stale, repeated or unrendered actions are rejected.
- Eight focused cases exercise the real registry/production bridge, evidence cue, recover/source-toggle/cancel, partial Doss archive, original recorder return and production Save/loadEnvelope duplicate protections. Eleven unchanged scalar approach/guidance/Doss cases pass. DOM and physical attachment ports are bounded fixtures; native ticks, ordinary flight and visible layout are not accepted by these results.
- Remaining acceptance: ordinary arrival comprehension, rendered cue/decision timing, native moving recorder recovery and the whole connected Ceres experience. No new clue, replacement recorder, reward, schema, NPC job or transport system is added.

## Visual ownership correction: NPC propulsion and presented hulls — 21 October 2026

A bounded production-component reproduction established that an in-table NPC with a hidden/preparing, detached, wrong-scene or missing hull could still publish five visible fleet plume slots. This is an independently reproduced visual ownership defect, not yet attribution of the teal wedge in staged Charon images.

- New ordinary NPC ship/drone propulsion requires the current live entity object and a visible ancestor chain reaching the exact current render scene. Fleet retention/admission and main/reverse overflow claims share this gate, so fallback cannot recreate a hidden-body plume.
- This is not an authored-asset whitelist. Visible procedural/fallback hulls remain valid, player policy is unchanged, and existing plume recipes, colors, dimensions, old-history retirement/fade, Ceres/Latch rules and unrelated trail tiers remain untouched.
- The allocation-free ancestry walk is capped at 64 visited nodes; malformed cycles or deeper unproven ownership fail closed. It does not traverse siblings, inspect all scene objects or alter readiness.
- Twenty-six component tests cover real FamilyProductionFleet/ContinuousPlumeSystem output, hidden-to-visible readmission, replaced identities, exact scene ownership, actual main/reverse overflow including drones, preserved retirement and player/procedural positives. The expanded immutable baseline has twenty failures and six passes. These are CPU/component results, not GPU visual acceptance.
- Remaining acceptance: actual successor game-camera pixels and ordinary movement. Current staged VFX-group isolation identifies only the group; sampled player trail descriptors were empty despite a visible wedge, and no specific emitter or complete visual cure is claimed.

## Inventory coverage and the actual gap

Public evaluation returns **25 sectors, 35 catalog stations, 153 catalog POIs, 58 authored activity pockets and 116 actor slots**. These are catalog counts, not simultaneous rendered entities, unique final models or all dynamic locations. Runtime additions such as Borrowed Sun are outside the static station count. All 25 sector IDs have way-of-life, composition and activity-pocket rows. The ten concept-image sectors are not the whole game. The Bolus is the twenty-fifth sector, not an omitted footnote. Swarm arenas are a separate mode roster under P14–P21 and are not silently counted as Adventure sectors.

Inventory reviewed: all sector/station/POI identities from `src/data/sectors.js` and transitive frontier data, all 58 pocket definitions and their 116 slot IDs, all composition rows, the eight named landmark follow-ups, selected causal-chain consumers, Last Shift's complete source lifecycle, public-versus-canonical file differences and original concept placement. This is **not** an exhaustive mesh/material/socket/animation inspection of every asset or line-by-line audit of every system. The per-sector POI/actor lists below preserve the concrete inventory that still requires that closer inspection. Use `design/program/asset-experience/ASSET_STOCKTAKE.md` for the broader existing asset stocktake; do not commission a second global asset inventory.

Key findings:
1. There is no empty-sector data emergency: every sector has four or eight authored pocket actors. The harder gap is whether their routes perform consequential work that a first-time visitor can understand, rather than repeat choreography.
2. `src/data/sectorCausalChains.js` declares explicit chains for Helios, Tethys and Vesta; Ceres has its own chain in `src/systems/traffic.js`. This does not prove other sectors lack consequences: it bounds this particular inspected chain mechanism.
3. Way-of-life prose has drifted behind activity breadth. For example, Orcus/Triton describe one courier, Sker says no civilian schedule and Bolus names the player/drowned hauler/Ives, while the newer pocket registry supplies four actors to each. Reconcile the fiction with actual runtime roles before adding more life. A presence row is not proof every actor is actually visible.
4. Composition is already relational, not just tint: all 25 have named apertures/motifs/foci in `src/data/sectorCompositions.js`; fixed stations/gates/POIs are not supposed to move. Preserve the saved arrangement version and ordinary navigation gaps.
5. Eight concrete landmark return jobs exist in `src/data/landmarkMissions.js`. These are strong low-cost connections between places and repeat visits. There are other mission/encounter families; absence from those eight is not absence of missions.
6. The best immediately executable next connection is **Ceres Last Shift approach → evidence → physical recorder return → remembered local report**, not another isolated Orchard fixture. It reuses public evidence/custody/Doss systems and original SF20-18 scope. See the final section.

## Shared source and persistence map

- Geography: `src/data/sectors.js`, `src/data/sectorAnchors.js`, `src/data/sectorZones.js`, `src/data/frontierRegions/{west,north,east,south,index}.js`, `src/data/theBolus.js`.
- Identity and composition: `src/data/sectorWayOfLife.js`, `src/data/sectorCompositions.js`, `src/data/sectorVisualProfiles.js`, `src/data/sectorPhysical.js`. `sectorCompositions.js` explicitly keeps legacy saved layouts at arrangement version 0; changing authored framing is not permission to relocate existing saves.
- Work: `src/data/sectorActivityPockets.js` → `src/systems/traffic.js` / `src/systems/npcJobsRuntime.js`; four selected chain owners as above. Slots and their labels are real definitions, not certification of finite custody or economic output.
- Missions: `src/data/missions.js`, `src/data/wreckMissions.js`, `src/data/landmarkMissions.js` → `src/systems/missions.js`; discovery and physical readings remain with world/scanner. Mission source and replay receipts must be matched to the same revision.
- Saves: `src/save/saveSystem.js` serializes NPC jobs and named systems; `src/world/worldRecords.js`, `src/world/farActorTable.js` and traffic own world/actor continuity. These are shared seams, not per-sector proof. For each routine below, test original actor identity, finite source/destination totals, absence/death, actual far residency and return, not just a fresh spawn at the same coordinates.
- Last Shift public save chain is explicit: `saveSystem.js` serializes/deserializes `lastShift` and calls `afterContinue`; `src/systems/lastShift.js` owns body keys/finite salvage, receipts and original-recorder return; `src/data/dossArchive.js` / `src/systems/stationContacts.js` reconcile filed evidence.

## Public versus newer canonical features

The public catalog is not the same as all current source. A Git name/diff comparison found canonical additions or changes in `src/data/hundredHandMile.js`, its geometry/body data and `src/systems/hundredHandMile*.js`; `src/data/thimbleDoor.js`, its clearance/native geometry/system; `src/data/pallasSeamWork.js`, `pallasWorkShift.js`, `quarryWorkface.js`, their work systems; and `src/data/tethysTallyPassage.js` / `src/systems/tethysTallyPassage.js`. Ilex, Towline, station broadcast, save/world integration and other shared source also differ. Treat these as **C** relative to this baseline, even when older handoffs record successful private/local tests. This is a selected difference list, not a claim every unlisted file matches.

Conversely the public tree already includes registered Latch Nine, Sable, Tally-3, Last Shift, Ilex, Red Kite, Towline, Scissorwake, Kilnback, Mothlight and Borrowed Voice systems, plus Borrowed Sun source. They must not be pitched as entirely missing. Public `thimbleDoorBody.js` / visual code alone are not proof the newer full door gameplay is public. Original SF20 dependencies and the original twenty-concept scope remain intact.

The active Orchard rendezvous owns `anvilSpillRecovery`, `anvilWork`, `contactHail`, `scanner`, `traffic` and its tests. This register edits none. Public Orchard native-cycle receipts in the existing handoffs remain scoped evidence, not district or game completion. Last Shift's four proposed implementation paths were reported clean and not named in a matching NOW row at intake; the parent subsequently reserved them for a new writer. Recheck actual ownership before mutation.

## Sector-by-sector register

Each entry separates the arrival hypothesis from the public routine definitions. “Return gate” is the next evidence required, not an allegation of a broken save. Generic growth/market/law consequences may apply through shared owners, but are not counted as authored sector progression without a source-to-player witness. The exact station and POI lists prevent substituting invented scenery for existing places.


### 01. Helios Prime — `sector_helios_prime`

- **First arrival (P/S, readability U):** Safe harbor opening toward Helios Station; starter seam teaches mining/towing before hostile sectors.
- **Recurring activity (S):** Sanctioned Claim (`helios_seam_miner`, `helios_seam_fence`); Freight Leg (`helios_freight_hauler`, `helios_customs_patrol`).
- **Time/progression:** Claim-day chain, starter heavy boulders and station growth ladder provide possible progression; distinguish repeated claim theater from a finite source.
- **Mission/character connection:** Vesper rehearsal, Candle Fleet and Coalition HQ; Candle Fleet: The Dark Plinth is an authored return job.
- **Placement/visual identity (S, camera U):** The Open Hand; A sheltered working bay opens toward the station. The first ore reads as a place to enter, not a fog to cross. Focus `station_helios`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Do not flood the tutorial with introductions. Preserve no ambient hostile spawns and inspect saved seam depletion, memorial reading and tutorial state.
- **Station inventory (S):** Helios Station (`station_helios`); Coalition HQ (`station_coalition`).
- **POI inventory (S):** Tutorial Beacon (`poi_tutorial`); Vesper’s Rehearsal (`poi_vesper_rehearsal`); The Candle Fleet (`poi_memorial`); Outer Yard Derelict (`poi_helios_yard`); Corridor Pin 44-C (`poi_helios_lane_pin`); Helios Weigh-Point (`poi_helios_tally`); Starter Seam Claim (`poi_helios_claim_mark`); Bonded Cold Locker (`poi_helios_locker`); Helios Bay 7 (`poi_helios_bay7`); Ash Pin — SPAN-HOLD (`poi_helios_ash_pin`); Outer Yard Whistle (`poi_helios_whistle`); The Pit Line (`poi_helios_pit_line`); Checkpoint Niner (`poi_helios_picket`); Smear Marker 7 (`poi_helios_smear_pin`); Relief-Freighter Choir-Tender (`poi_helios_choir_tender`).
- **Exact source keys:** `sector_helios_prime` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 02. Ceres Belt — `sector_ceres_belt`

- **First arrival (P/S, readability U):** A working refinery and framed industrial throat; follow a working seam or Throughline rather than receive a list of disconnected quests.
- **Recurring activity (S):** Refinery Pocket (`ceres_refinery_hauler`, `ceres_refinery_tender`); Working Seam (`ceres_seam_miner`, `ceres_seam_surveyor`); Ambush Run (`ceres_ambush_loaded_hauler`, `ceres_ambush_escort`); Cathedral Grave (`ceres_cathedral_salvor`, `ceres_cathedral_patrol`).
- **Time/progression:** Ceres causal chain; public Last Shift evidence revisions, lost clues and recorder return; public Tally/Ilex/Towline interactions. Canonical quarry, recovery and Mile advances must not be called public.
- **Mission/character connection:** RUCKUS, Red Kite, Sable, Tally-3, Mara/Odo/Kit and Last Shift connect work, judgment and remembered help; use their existing owners.
- **Placement/visual identity (S, camera U):** The Quarry Cathedral; Broken strata frame the refinery. An empty industrial throat separates the working faces; the authored activity cast keeps its marks. Focus `station_ceres`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** First ordinary Last Shift approach is the next priority. Preserve original finite recorder/cargo, partial evidence and public Doss archive before layering canonical Mile consequences.
- **Station inventory (S):** Ceres Refinery (`station_ceres`); Belt Outpost (`station_beltout`).
- **POI inventory (S):** Abandoned Driller (`poi_driller`); Survey Cache (`poi_survey`); Refinery Flare Rack (`poi_ceres_flare_rack`); Inbound Weigh Pin (`poi_ceres_weigh_pin`); Throughline Weigh Beacon (`poi_ceres_throughline`); Wreck Cathedral (`world_site_wreck_cathedral`); RUCKUS · Open Work Order (`poi_ruckus_work_yard`); Second Measure Shipbreak (`world_site_ceres_second_measure`); Kettle Line Shard (`poi_kettle_hopper`); Kettle Line Ribs (`poi_kettle_ribs`); Kettle Line Stern (`poi_kettle_stern`); The Closed Refinery (`poi_ceres_closed_refinery`); The Star Lantern (`poi_solstice_lantern`); Rookery Prospect (`poi_claim_rookery`).
- **Exact source keys:** `sector_ceres_belt` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 03. Tethys Junction — `sector_tethys_junction`

- **First arrival (P/S, readability U):** Open shipping channel, visible customs queue and the Anvil on the southern approach.
- **Recurring activity (S):** Checkpoint Queue (`tethys_toll_hauler`, `tethys_customs_patrol`); Junction Lane (`tethys_lane_convoy`, `tethys_lane_patrol`); The Quiet Cache (`tethys_quiet_runner`, `tethys_quiet_keeper`); Customs Log Relay (`tethys_log_salvor`, `tethys_log_surveyor`).
- **Time/progression:** Public quiet-handoff chain, Latch arrival/service and Orchard custody; canonical Tally Passage differs. Do not mistake a queue pose for lawful clearance.
- **Mission/character connection:** Latch Nine, RUBRIC, Ilex departure and Borrowed Sun berth; intended Kess episode remains a separate P07 acceptance obligation.
- **Placement/visual identity (S, camera U):** The Shipping Lanes; Two unequal banks describe a navigable channel. Civic space is open; the rocks never turn the trade hub into another rubble pile. Focus `station_tethys`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Witness arrival refusal, genuine clearance, held/stolen/returned cargo and actual departure; recorder-style generic receipts cannot certify the Tethys episode.
- **Station inventory (S):** Tethys Trade Hub (`station_tethys`); Customs Gate (`station_customs`).
- **POI inventory (S):** Black Market Contact (`poi_blackmkt`); Weigh-Slip Buoy (`poi_tethys_weigh`); Customs Log Relay (`poi_tethys_customs_log`); The Split Station (`poi_tethys_split_station`); Queue Head Buoy (`poi_tethys_tally_queue_head`); Queue Inner Buoy (`poi_tethys_tally_queue_inner`); Scan Gate — Red Side (`poi_tethys_tally_gate_red`); Scan Gate — Green Side (`poi_tethys_tally_gate_green`); The Tally Post (`poi_tethys_tally_post`); Held-for-Count Rack (`poi_tethys_tally_rack`); Seized Cargo Pod (`poi_tethys_tally_pod`); Count-Face Worklight (`poi_tethys_tally_light`); RUBRIC · The Marking Line (`poi_rubric_marking_line`); Tethys Surface Launcher (`heist_launcher`); Concord Lawful Catcher (`lawful_catcher`); Quiet Fence Receiver (`fence_receiver`).
- **Exact source keys:** `sector_tethys_junction` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 04. Vesta Forge — `sector_vesta_forge`

- **First arrival (P/S, readability U):** Directional slag fans and foundry intake should make ore-in/module-out visible.
- **Recurring activity (S):** Feedstock Seam (`vesta_seam_miner`, `vesta_seam_surveyor`); Foundry Run (`vesta_forge_hauler`, `vesta_forge_patrol`); Dead Freighter Drift (`vesta_drift_cutter`, `vesta_drift_prowler`); Slag Relay (`vesta_relay_tender`, `vesta_slag_runner`).
- **Time/progression:** Public feedstock causal chain; P08 intends real finite fabrication and repair output. A timer cycle is not proof material was consumed.
- **Mission/character connection:** RUUD/HOOK-LEFT, Resonant Cathedral and Red Cable Yard; preserve Tann winnow episode in P08 rather than substitute a new worker.
- **Placement/visual identity (S, camera U):** The Slag Fans; Oblique fans and fractured shelves suggest material pushed out of an industry. Repeated direction, deliberately broken spacing. Focus `station_forge`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Trace one actual source → hauler → foundry consequence, save mid-load and revisit without duplicate output or erased heat/slag geometry.
- **Station inventory (S):** Forge Foundry (`station_forge`); Forge Outlying Yard (`station_vesta_outlying_yard`); Refuel Depot (`station_depot3`).
- **POI inventory (S):** Derelict Freighter (`poi_freighter`); Slag-Choir Relay (`poi_vesta_slag_relay`); Shift-End Ore Cache (`poi_vesta_ore_cache`); The Resonant Cathedral (`poi_vesta_resonant_cathedral`); Red Cable Yard (`poi_vesta_red_cable_yard`); HOOK-LEFT · Fin-3 (`poi_ruud_fin3`); Kilnside Lease (`poi_claim_kilnside`).
- **Exact source keys:** `sector_vesta_forge` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 05. Pallas Drift — `sector_pallas_drift`

- **First arrival (P/S, readability U):** A smuggler archipelago where wreck work and reef forces differ from Ceres.
- **Recurring activity (S):** Independent Seam (`pallas_seam_miner`, `pallas_seam_surveyor`); Hollow Hub (`pallas_hub_hauler`, `pallas_hub_tender`); Sker-Run Ambush (`pallas_ambush_hauler`, `pallas_ambush_escort`); Grave Drift (`pallas_grave_salvor`, `pallas_grave_patrol`).
- **Time/progression:** Public Quiessence census follow-up; canonical physical seam/escort work is newer than this public baseline.
- **Mission/character connection:** RAVEL, Quiessence, independent seam and Sker-run escort; P08 reef crew/rescue is intended composed acceptance.
- **Placement/visual identity (S, camera U):** The Smuggler's Archipelago; Unequal islands make cover and revelation alternate. The black market is screened at the sides, not blocked at its docking face. Focus `station_smuggler`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Validate same crew and finite wreck/seam through reef disturbance and second visit; do not transfer canonical native evidence to public data.
- **Station inventory (S):** Drift Market (`station_drift`); Smuggler Den (`station_smuggler`).
- **POI inventory (S):** RAVEL · The Unraveller (`poi_ravel`); Pirate Wreckage (`poi_pwreck`); Hidden Cache (`poi_hcache`); The Quiessence (`poi_quiessence`); The Empty Habitat (`poi_pallas_empty_habitat`); Empty Foundry (`poi_pallas_empty_foundry`); Drift Claim Nine (`poi_claim_drift_nine`).
- **Exact source keys:** `sector_pallas_drift` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 06. Io Reach — `sector_io_reach`

- **First arrival (P/S, readability U):** A last anchorage with a mail/waystation lane between rock and nebula.
- **Recurring activity (S):** Waystation Apron (`io_waystation_hauler`, `io_waystation_tender`); Cruiser Graveyard (`io_cruiser_salvor`, `io_cruiser_picket`).
- **Time/progression:** Way-of-life promises rotating control; actual takeover chronology and corresponding route consequences were not traced here.
- **Mission/character connection:** Waystation workers and cruiser-graveyard salvor/picket; missions.js references Quadrille/Io routes.
- **Placement/visual identity (S, camera U):** The Last Anchorage; One open lee and one long broken wake. Dense punctuation makes the intervening frontier feel empty without removing a single rock. Focus `station_reach`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Verify the courier/board changes claimed by the fiction, one contract path and persistent cruiser depletion; avoid claiming faction turnover from prose.
- **Station inventory (S):** Reach Station (`station_reach`); Mercenary Outpost (`station_io_merc`).
- **POI inventory (S):** Mercenary Outpost (`poi_merc`); Derelict Cruiser (`poi_cruiser`); Pallas Industrial Moon (`poi_claim_pallas`); Shepherd's Ring (`poi_io_shepherds_ring`); Listening Field (`poi_io_listening_field`).
- **Exact source keys:** `sector_io_reach` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 07. Charon Expanse — `sector_charon_expanse`

- **First arrival (P/S, readability U):** Broken procession around refinery, evacuated colony and colonized hulls; industrial work gives way to unsettling evidence. The colony remains abandoned: visiting salvage workers are not a resident population.
- **Recurring activity (S):** Cinder Refinery Yard (`charon_ore_hauler`, `charon_air_tender`); Colony Barge (`charon_colony_salvor`, `charon_colony_hauler`).
- **Time/progression:** Public Borrowed Voice is gated at ecology revelation 2 at warm_freighter; recovered fragments/disposition and finite archive receipt have normalization.
- **Mission/character connection:** Warm Freighter, Cinder Nursery, Broken Shepherd and the Bolus route connect ecology and institutional mystery without a creator reveal.
- **Placement/visual identity (S, camera U):** The Broken Procession; Long parallel fragments read as the aftermath of a common force. Wreck satellites point down the same wake instead of orbiting arbitrarily. Focus `station_expanse`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Validate an ordinary, correctly gated Borrowed Voice encounter and saved fragment/disposition outcomes; inspect nursery consumer separately, not from the place name.
- **Bounded salvage-supply foundation (published, not accepted):** Frozen feature `dd23a794c33d22e50facb7f31ff16815afb71f01` (product source identical to independently reviewed `7308e65223584e0908c430c6f96abebe3a152367`), based on public `7109c3829a615a118ea63534b99bc1d9891ca711`, connects the original colony hauler and cutter to six physical consumer-goods scrubber kits. New pristine workers wait before their first round; existing work finishes its genuine boundary. Native pickup → original hauler manifest → cutter delivery → next original cutting-job admission consumes this one reserve. Failed admission keeps the reserve staged; recorded taking/loss cancels that next round with terminal shortfall, not a refill. Original tether/foreign claims and unrelated jobs/cargo remain protected. Ordinary repeat work is not recurring free stock or reward. See [Charon salvage-supply evidence](CHARON_SALVAGE_SUPPLY_2026-10-21.md).
- **Scoped native persistence evidence:** The connected production-profile fixture on `b08533f472b39049bf2e4e1035b95b23f6378e8c` reaches six aboard at 28.9333 simulation seconds, performs actual Save/Continue aboard, and reaches six consumed at 42.9833 seconds. Real Dione→Charon rematerialization retains original durable identities and no remint. Player setup starts near the colony, not on an ordinary flight arrival; there is no live camera witness. `7308` adds the inconsistent-restored-phase guard/test; frozen `dd23` changes only two test expectations and passes 38/38 focused plus 105/105 adjacent tests with an immutable raw-source shim. Its reduced direct native pickup/contact/handoff/consumption witness passes at 37.8333 seconds, with foreign/claimed/replay controls. The connected `b085` proof is carried forward, not rerun or relabeled as a later-tree run. Final root integration/publication and ordinary-arrival/visual acceptance remain pending.
- **Ordinary contact legibility:** Published foundation d0522 and readout-cycle follow-through 6b42 retain the finite crew. This increment keeps live phase/stock guidance within the scanner’s actual two-line contract, with wrapped SUPPLY ROUTE details on the original worker/trader. No forced Band announcement or unheard-once flag. Real scanner/DOM/ARIA and production Save/reentry checks pass; ordinary flown discovery and pixel-level readability remain open. Optional post-acceptance CI camera staging is diagnostic only and has not yet supplied a Charon image.
- **Colony identity increment:** A colony-only service-barge composition adds a sealed, unlit habitat and attached service unit within the original authored envelope. Both final Charon catalog pointers change while claim radius20/reference48, stock/crew positions and claimed-art precedence remain. Generic donors are unchanged. This is one distinct new composition, not three models for its LODs. Source/release/package and save/collision review are complete; game-camera and user acceptance remain open. See [colony service-barge evidence](CHARON_COLONY_SERVICE_BARGE_2026-10-21.md).
- **Assets and remaining return gate:** Original supply foundation reused crew, colony, standard pod and work/save owners; the later colony identity increment is separately accounted above. Actual stock is `cmdty_consumer_goods` habitat scrubber/filter kits, not corrosive methane/ammonia `cmdty_volatiles`; no global hazard exemption. Original stock disposition and one next-round admission are bounded evidence, not subsequent cutting yield, ordinary-arrival readability, source-preview visual acceptance, broad performance or Charon completion. Borrowed Voice and nursery gates above remain separate.
- **Station inventory (S):** Expanse Refinery (`station_expanse`).
- **POI inventory (S):** Abandoned Mining Colony (`poi_colony`); Lung Marker (`poi_charon_lung_marker`); Snapped-Tether Hab-Pod (`poi_charon_tether_wreck`); Cinder Nursery (`world_site_charon_cinder_nursery`); Warm Freighter (`poi_charon_warm_freighter`); Three Hull Garden (`poi_charon_hull_garden`); Unidentified Lattice (`poi_charon_pylon_field`); Star Marker (`poi_charon_star_marker`); Broken Shepherd (`poi_charon_broken_shepherd`); The Preserved Cockpit (`poi_charon_preserved_cockpit`); The Empty Skin (`poi_charon_empty_skin`).
- **Exact source keys:** `sector_charon_expanse` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 08. Sker Haven — `sector_sker_haven`

- **First arrival (P/S, readability U):** Concealed harbor and guarded bazaar; approach should establish who vouches for entry.
- **Recurring activity (S):** Bazaar Apron (`sker_apron_runner`, `sker_door_picket`); Press-Gang Seam (`sker_seam_toiler`, `sker_seam_gun`).
- **Time/progression:** Public Throne provenance job; rep-gated bazaar and press-gang seam source. No inspected proof of a full changing local political arc.
- **Mission/character connection:** Bazaar runner/picket and seam toiler/gun; Skerris Throne supports a physical plate-registry return job.
- **Placement/visual identity (S, camera U):** The Concealed Harbour; A lopsided broken enclosure creates a refuge. It is shelter with a mouth, not a perfect ring and not a wall. Focus `station_sker`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Reconcile “no civilian schedule” wording with actual workers; test access/refusal and provenance persistence without turning this into a second friendly core hub.
- **Station inventory (S):** Sker Bazaar (`station_sker`).
- **POI inventory (S):** Bounty Wrecks (`poi_bounty`); Stash Cache (`poi_stash`); The Skerris Throne (`poi_sker_throne`); The Harvest Deep (`poi_sker_harvest_deep`); Null Causeway (`poi_sker_null_causeway`); Red Snow (`poi_sker_red_snow`); Quiet Dock (`poi_sker_quiet_dock`); Morrow Freehold (`poi_claim_morrow`).
- **Exact source keys:** `sector_sker_haven` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 09. Veil Nebula — `sector_veil_nebula`

- **First arrival (P/S, readability U):** Missing-center composition and quiet research instruments; leave the unexplained center unfilled.
- **Recurring activity (S):** Research Rounds (`veil_instrument_tender`, `veil_dish_listener`); Quiet Ice (`veil_ice_prospector`, `veil_ice_hauler`).
- **Time/progression:** Public Obelisk follow-up requires prior physical investigation and extra pulses bring watch pressure; P10 nursery ensemble remains broader acceptance.
- **Mission/character connection:** Research tender/listener and Quiet Ice crew; Obelisk, Silent Gate, Black Orchard and Exception Chamber are distinct locations, not interchangeable mystery props.
- **Placement/visual identity (S, camera U):** The Missing Centre; Two offset, incomplete caustics orbit a conspicuous absence. Asymmetry makes the disturbance geological rather than a decorative magic circle. Focus `poi_anomaly`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Test low-disturbance survey versus extra scans and saved findings, while retaining nonhostile observation and revelation gates.
- **Station inventory (S):** Research Station Veil (`station_veil`).
- **POI inventory (S):** The Resonance Obelisk (`poi_anomaly`); Wormhole (`poi_wormhole`); Far Sounding (`poi_veil_far_sounding`); Quiet Ice (`poi_veil_quiet_ice`); Pale Spire (`poi_veil_survey_monolith`); Silent Gate (`poi_veil_revoked_gate`); The Black Orchard (`poi_veil_black_orchard`); Containment Ring (`poi_veil_containment_ring`); Exception Chamber (`poi_veil_exception_chamber`); Lacuna Survey Moon (`poi_claim_lacuna`).
- **Exact source keys:** `sector_veil_nebula` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 10. Ashfall Reach — `sector_ashfall_reach`

- **First arrival (P/S, readability U):** Severed-jaw approach to ruined cache, with work in the lee of a moving burn.
- **Recurring activity (S):** Cache Apron (`ashfall_cache_salvor`, `ashfall_cache_runner`); Edge Seams (`ashfall_seam_miner`, `ashfall_edge_surveyor`).
- **Time/progression:** Cache/seam pocket cycles are defined; deep campaign/ancient-machine transformation linkage was not fully traced.
- **Mission/character connection:** Ancient Vault/Vault Maw, gate underlayer, maintenance and Bolus connection are existing anchors for P12/P13, not permission for a new lore axis.
- **Placement/visual identity (S, camera U):** The Severed Jaw; Opposed fractured banks point toward the confrontation. The opening is wide enough to read as a choice, never an inescapable collision funnel. Focus `poi_boss`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Prove one existing deep operation and revisit its actual geometry/records; keep quiet scale instead of activating every POI at once.
- **Station inventory (S):** Ruined Cache Station (`station_ashcache`).
- **POI inventory (S):** Boss Arena Signal (`poi_boss`); Ancient Vault (`poi_vault`); The Vault Maw (`poi_vault_maw`); Breathing Dock (`poi_ashfall_breathing_dock`); Gate Underlayer (`poi_ashfall_gate_underlayer`); Ranked Frames (`poi_ashfall_ossuary`); Black Vault (`poi_ashfall_black_vault`); Active Maintenance (`poi_ashfall_maintenance`); Converted Yards (`poi_ashfall_converted_yards`); The Towed Moonlet (`poi_ashfall_towed_moonlet`); Old Sterile Zone (`poi_ashfall_sterile_zone`); The Line (`poi_ashfall_the_line`); Cinder Crown (`poi_claim_cinder_crown`).
- **Exact source keys:** `sector_ashfall_reach` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 11. Nyx March — `sector_nyx_march`

- **First arrival (P/S, readability U):** Unlogged gate: a dim fence and separate watched cut-lane.
- **Recurring activity (S):** Fence Apron (`nyx_fence_runner`, `nyx_fence_appraiser`); Cut-Lane Watch (`nyx_cutlane_skiff`, `nyx_cutlane_picker`).
- **Time/progression:** Freight-without-papers identity and four activity slots exist; durable local consequence beyond shared law/market state is U.
- **Mission/character connection:** Fence runner/appraiser, cut-lane skiff/picker; missions.js has Nyx destinations.
- **Placement/visual identity (S, camera U):** The Unlogged Gate; Unequal islands screen the fence. Freight arrives without a lane mark. Focus `station_nyx_march`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Trace one existing smuggling contract and original cargo custody; on return the fence response must reflect the actual disposition, not generic flavor.
- **Station inventory (S):** Nyx Fence (`station_nyx_march`).
- **POI inventory (S):** March Drop Cache (`poi_nyx_cache`); Cut-Runner Wreck (`poi_nyx_wreck`); Blackglass Lease (`poi_claim_blackglass`).
- **Exact source keys:** `sector_nyx_march` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 12. Hyperion Cut — `sector_hyperion_cut`

- **First arrival (P/S, readability U):** Open-cut refinery throat beside a visibly caved shaft.
- **Recurring activity (S):** Cut Refinery Yard (`hyperion_yard_hauler`, `hyperion_yard_tender`); First Seams (`hyperion_seam_miner`, `hyperion_seam_surveyor`).
- **Time/progression:** Hardened Probe job creates an explicit return reading and artifact; refinery/seam loops alone do not prove finite ore work.
- **Mission/character connection:** Caved Shaft, lane beacon and four workers provide a work-versus-mystery contrast.
- **Placement/visual identity (S, camera U):** The Open Cut; Strata face the refinery. The working throat stays empty so the cut reads as a job. Focus `station_hyperion_cut`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Take the physical close reading, file it once and reload; inspect whether seam work points to the shaft without revealing its answer.
- **Station inventory (S):** Cut Refinery (`station_hyperion_cut`); Cut Claim Outpost (`station_hyperion_claim`).
- **POI inventory (S):** The Caved Shaft (`poi_hyperion_driller`); Cut Lane Beacon (`poi_hyperion_beacon`); Cutwater Anchorage (`poi_claim_cutwater`).
- **Exact source keys:** `sector_hyperion_cut` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 13. Kepler Scar — `sector_kepler_scar`

- **First arrival (P/S, readability U):** Capsized wake and stolen-surplus bazaar; hull picking should read as a different geometry from mining.
- **Recurring activity (S):** Scar Bazaar Apron (`kepler_bazaar_runner`, `kepler_scar_picket`); Hulk Picking (`kepler_hulk_salvor`, `kepler_glow_reader`).
- **Time/progression:** Four local routine slots exist; changing ownership in way-of-life copy is an unverified progression promise.
- **Mission/character connection:** Bazaar runner, scar picket, hulk salvor and glow reader; Flight Deck and raider stash.
- **Placement/visual identity (S, camera U):** The Capsized Wake; A broken fan points at the bazaar under the scar. The opening is a choice, not a funnel. Focus `station_kepler_scar`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Verify finite hulk extraction and consequences of interference; do not claim a new hull owner merely because the description says so.
- **Station inventory (S):** Scar Bazaar (`station_kepler_scar`).
- **POI inventory (S):** The Flight Deck (`poi_kepler_hulk`); Raider Stash (`poi_kepler_stash`); Scarline Hold (`poi_claim_scarline`).
- **Exact source keys:** `sector_kepler_scar` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 14. Orcus Shadow — `sector_orcus_shadow`

- **First arrival (P/S, readability U):** Dim plinth and unusually quiet research/vault approach.
- **Recurring activity (S):** Research Rounds (`orcus_supply_hauler`, `orcus_anomaly_listener`); Vault Approach (`orcus_vault_scanner`, `orcus_vault_salvor`).
- **Time/progression:** Routine research and vault work defined; enduring authored progression not established in this pass.
- **Mission/character connection:** Supply hauler, anomaly listener, vault scanner and salvor contradict the literal one-courier summary.
- **Placement/visual identity (S, camera U):** The Dim Plinth; A narrow crescent keeps one lee. The rest of the shadow stays unread. Focus `station_orcus_shadow`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Establish intended sparse population and one meaningful reading/revisit; preserve silence instead of treating quiet as missing content.
- **Station inventory (S):** Shadow Cache (`station_orcus_shadow`).
- **POI inventory (S):** Orcus Signal (`poi_orcus_anomaly`); Shadow Vault (`poi_orcus_vault`); Shadow Plinth (`poi_orcus_plinth`).
- **Exact source keys:** `sector_orcus_shadow` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 15. Rhea Cinder — `sector_rhea_cinder`

- **First arrival (P/S, readability U):** Scorched throat where loaded ore must cross an exposed approach.
- **Recurring activity (S):** Cinder Claim Yard (`rhea_ore_hauler`, `rhea_yard_tender`); Slag Seam (`rhea_seam_miner`, `rhea_thin_escort`).
- **Time/progression:** Hauler/tender and seam miner/thin escort loops exist; finite escorted sale and failure aftermath are U.
- **Mission/character connection:** Slag hauler hulk, burned survey cache and Emberwake Plot connect the claimed work economy.
- **Placement/visual identity (S, camera U):** The Scorched Throat; Short strata down the claim approach. Heat sits in the rock, not in a second drag term. Focus `station_rhea_cinder`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Witness one real load, danger/escort branch and persistent original crew/cargo after Continue.
- **Station inventory (S):** Cinder Claim (`station_rhea_cinder`).
- **POI inventory (S):** Slag Hauler Hulk (`poi_rhea_slag`); Burned Survey Cache (`poi_rhea_claim`); Emberwake Plot (`poi_claim_emberwake`).
- **Exact source keys:** `sector_rhea_cinder` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 16. Haumea Rift — `sector_haumea_rift`

- **First arrival (P/S, readability U):** Ice-fissure aperture with instrument rounds and core transport.
- **Recurring activity (S):** Observatory Rounds (`haumea_instrument_tender`, `haumea_probe_tracker`); Ice Seams (`haumea_seam_miner`, `haumea_core_hauler`).
- **Time/progression:** Fissure cracker signature toy is declared; causal consequence of cracking to survey and sale needs an exact-route witness.
- **Mission/character connection:** Observatory tender/probe tracker and ice miner/core hauler; fissure signal, range buoy and probe shell.
- **Placement/visual identity (S, camera U):** The Ice Fissure; A rift motif splits the ice. The observatory sits in the gap, not under the mass. Focus `station_haumea_rift`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Test altered physical ice/core stock, useful survey result and leave/Continue without restoring depleted resources.
- **Station inventory (S):** Rift Observatory (`station_haumea_rift`).
- **POI inventory (S):** Ice Fissure Signal (`poi_haumea_fissure`); Rift Range Buoy (`poi_haumea_buoy`); Rift Probe Shell (`poi_haumea_probe`).
- **Exact source keys:** `sector_haumea_rift` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 17. Eris Margin — `sector_eris_margin`

- **First arrival (P/S, readability U):** Unmanifested bank where fog drops contrast with a timing landmark.
- **Recurring activity (S):** Margin Fence Apron (`eris_fence_runner`, `eris_gate_picket`); Fog Drops (`eris_drop_picker`, `eris_metronome_keeper`).
- **Time/progression:** Public Metronome Off-Beat Window job requires a real cycle timed inside the sweep, producing a filed record.
- **Mission/character connection:** Fence runner/picket, drop picker and metronome keeper connect work with the timing site.
- **Placement/visual identity (S, camera U):** The Unmanifested Bank; Two unequal islands hide the fence from the Ashfall approach. Focus `station_eris_margin`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Test timed reading and one receipt; determine whether timing affects an actual smuggling opportunity before claiming it does.
- **Station inventory (S):** Margin Fence (`station_eris_margin`).
- **POI inventory (S):** Quiet Drop Point (`poi_eris_drop`); Toll-Runner Wreck (`poi_eris_wreck`); Margin Dead Drop (`poi_eris_dead_drop`); The Metronome (`poi_eris_metronome`).
- **Exact source keys:** `sector_eris_margin` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 18. Phoebe Echo — `sector_phoebe_echo`

- **First arrival (P/S, readability U):** Broken-song shrine with a long quiet interval and distant rim work.
- **Recurring activity (S):** Shrine Rounds (`phoebe_shrine_tender`, `phoebe_resonance_listener`); North Rim (`phoebe_rim_prospector`, `phoebe_core_hauler`).
- **Time/progression:** Public Reconstruct the Song requires four recovered signal scans and Vael trust; a finite artifact preserves an unfinished phrase, not an explanation.
- **Mission/character connection:** Shrine tender/listener and rim prospector/hauler; Shard Sphere and Silent Vault.
- **Placement/visual identity (S, camera U):** The Broken Song; An incomplete caustic around the shrine. The echo is a gap, not a ring. Focus `station_phoebe_echo`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Connected return slice (source-tested, not accepted):** Four scanner fragments from the same Shard Sphere are now reflected in the existing discovery plate, with the real Vael +150 threshold and Echo Shrine board handoff. Accepted work asks for the existing close return pulse; the filed artifact acknowledges no second payment. Partial 1–3 readings survive bounded contact-history pruning without false investigation or tracking. Literal one-courier prose now includes the actual four pocket workers and Nim. See [Phoebe Song return evidence](PHOEBE_SONG_RETURN_2026-10-21.md). Owner-serialization/recreated-carrier tests pass; ordinary rendered flight, full Save UI, composition and performance remain unverified.
- **Station inventory (S):** Echo Shrine (`station_phoebe_echo`).
- **POI inventory (S):** The Shard Sphere (`poi_phoebe_echo`); Silent Vault (`poi_phoebe_vault`).
- **Exact source keys:** `sector_phoebe_echo` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 19. Nereid Shoal — `sector_nereid_shoal`

- **First arrival (P/S, readability U):** Ice-cut waystation and practical claim scale, not another anonymous belt.
- **Recurring activity (S):** Waystation Apron (`nereid_waystation_hauler`, `nereid_waystation_tender`); Ice Shoal Seams (`nereid_shoal_miner`, `nereid_shoal_collector`).
- **Time/progression:** Local haul/tender/miner/collector loops exist; same-shift sale and Collective percentage are prose until source custody/payment is traced.
- **Mission/character connection:** Ice-Hull Wreck, Shoal Cache, Shoal Exchange Rock; bridges to Tethys/Io/Proteus.
- **Placement/visual identity (S, camera U):** The Ice Cut; A braid of ice and common rock leaves a channel to the waystation scale. Focus `station_nereid`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Trace ice source → scale → sale through an actual finite load and repeat visit; do not mint narrative-only freight.
- **Station inventory (S):** Nereid Waystation (`station_nereid`); Shoal Claim (`station_nereid_claim`).
- **POI inventory (S):** Ice-Hull Wreck (`poi_nereid_wreck`); Shoal Cache (`poi_nereid_cache`); Shoal Exchange Rock (`poi_claim_shoal_exchange`).
- **Exact source keys:** `sector_nereid_shoal` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 20. Proteus Well — `sector_proteus_well`

- **First arrival (P/S, readability U):** Well-mouth den above an unexpectedly dense debris return.
- **Recurring activity (S):** Den Apron (`proteus_den_runner`, `proteus_den_picket`); Quiet Seams (`proteus_seam_crew`, `proteus_seam_hauler`).
- **Time/progression:** Survey-for-Quiet identity exists, but explicit filed-information consequence was not traced in this pass.
- **Mission/character connection:** Den runner/picket and seam crew/hauler; Funnel, stash and range buoy.
- **Placement/visual identity (S, camera U):** The Well Mouth; A crescent lee at the well. The funnel stays off the docking face. Focus `station_proteus`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Check one real finding changes the appropriate existing record/service and survives return; leave the unexplained mass unexplained.
- **Station inventory (S):** Proteus Den (`station_proteus`).
- **POI inventory (S):** Below-Deck Cache (`poi_proteus_stash`); The Funnel (`poi_proteus_hulk`); Well Range Buoy (`poi_proteus_buoy`).
- **Exact source keys:** `sector_proteus_well` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 21. Triton Wake — `sector_triton_wake`

- **First arrival (P/S, readability U):** Wake-line lab with instruments and a nearby wreck wake.
- **Recurring activity (S):** Lab Rounds (`triton_lab_tender`, `triton_wake_sampler`); Wreck Wake (`triton_wreck_salvor`, `triton_sample_courier`).
- **Time/progression:** Sampling/courier routines are explicit; persistent research progression is U.
- **Mission/character connection:** Lab tender/wake sampler plus wreck salvor/sample courier; Tide-Locked Watcher and Field Lab.
- **Placement/visual identity (S, camera U):** The Wake Line; Long strata down the wake. Sensors are dim; the arrangement does not add drag. Focus `station_triton`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Reconcile “one hull, silence” with four authored slots; prove an actual sample/reading transfer rather than ambient orbital motion.
- **Station inventory (S):** Triton Wake Lab (`station_triton`).
- **POI inventory (S):** Wake Anomaly (`poi_triton_anomaly`); Wake Marker (`poi_triton_beacon`); Wake-Runner Hull (`poi_triton_wreck`); The Tide-Locked Watcher (`poi_triton_watcher`); Triton Field Lab (`poi_triton_field_lab`).
- **Exact source keys:** `sector_triton_wake` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 22. Eunomia Gulf — `sector_eunomia_gulf`

- **First arrival (P/S, readability U):** License-bank wreck field: a board, a stamp and visible plate work.
- **Recurring activity (S):** Fence Apron (`eunomia_fence_runner`, `eunomia_choke_picket`); Rib Picking (`eunomia_rib_salvor`, `eunomia_ledger_clerk`).
- **Time/progression:** Fence and rib-picking routines defined; license/provenance branch and persistent economic result need tracing.
- **Mission/character connection:** Fence runner/choke picket, rib salvor/ledger clerk; Gulf Ledger Plate and The Hush.
- **Placement/visual identity (S, camera U):** The License Bank; Islands of wreck plate around the fence. Salvage has cover without a wall. Focus `station_eunomia`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Witness licensed versus unauthorized cut on the same finite source, then saved record and recognizable spent wreck.
- **Station inventory (S):** Eunomia Fence (`station_eunomia`).
- **POI inventory (S):** Gulf Hulk (`poi_eunomia_hulk`); Gulf Ledger Plate (`poi_eunomia_ledger`); Paint-Scar Debris (`poi_eunomia_debris`); The Hush (`poi_hush`).
- **Exact source keys:** `sector_eunomia_gulf` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 23. Sedna Dark — `sector_sedna_dark`

- **First arrival (P/S, readability U):** Dark post at the rim with no advertised refuel; the Ringworld Arc is the scale contrast.
- **Recurring activity (S):** Survey Rounds (`sedna_rounds_tender`, `sedna_rounds_dish`); Rim Watch (`sedna_drift_watcher`, `sedna_arc_salvor`).
- **Time/progression:** Public Grid Reading job records the surviving city-grid response; no-fuel service constraint is part of the place, not a defect to erase.
- **Mission/character connection:** Survey tender/dish, drift watcher/arc salvor, Ringworld Arc and Far Ledger.
- **Placement/visual identity (S, camera U):** The Dark Post; A thin crescent and a wide dark. One lee, then nothing. Focus `station_sedna`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Verify service availability before departure, physical grid reading and artifact after Continue; do not invent an automatic rescue/fuel refill.
- **Station inventory (S):** Sedna Survey Post (`station_sedna`).
- **POI inventory (S):** Sedna Vault (`poi_sedna_vault`); Dark Cadence Beacon (`poi_sedna_cadence`); The Ringworld Arc (`poi_sedna_ringworld`); Far Ledger (`poi_claim_far_ledger`).
- **Exact source keys:** `sector_sedna_dark` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 24. Dione Lane — `sector_dione_lane`

- **First arrival (P/S, readability U):** Cleared open lane where customs order, rather than rubble, is the obstacle.
- **Recurring activity (S):** Exchange Apron (`dione_exchange_hauler`, `dione_toll_patrol`); Lane Relay (`dione_relay_keeper`, `dione_convoy_hauler`).
- **Time/progression:** Exchange/relay actor loops and cleared-run identity exist; repeated clearance/actual delivery sequence is U.
- **Mission/character connection:** Exchange hauler/toll patrol, relay keeper/convoy hauler; toll dead drop and Wayline Charter.
- **Placement/visual identity (S, camera U):** The Cleared Lane; A braid wide enough for a convoy. Customs sits on the bank, not in the throat. Focus `station_dione`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Show how a clearance changes the same cargo movement, and that saved clearance is neither erased nor generalized to unrelated cargo.
- **Station inventory (S):** Dione Exchange (`station_dione`); Dione Customs (`station_dione_customs`).
- **POI inventory (S):** Lane Relay (`poi_dione_relay`); Toll-Lane Dead Drop (`poi_dione_deaddrop`); Wayline Charter (`poi_claim_wayline`).
- **Exact source keys:** `sector_dione_lane` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

### 25. The Bolus — `sector_the_bolus`

- **First arrival (P/S, readability U):** An inhabited carrier interior, not another outdoor palette: rib berth, lumen, iris and cough define the route.
- **Recurring activity (S):** Rib Tending (`bolus_rib_tender`, `bolus_grit_hauler`); The Cough (`bolus_pile_salvor`, `bolus_lumen_reader`).
- **Time/progression:** Public theBolus.js contains finite specimen/resource flags, sutures and timed physical relief; complete source-to-runtime persistence was not audited here.
- **Mission/character connection:** Ives/drowned hauler fiction plus rib tender/grit hauler, pile salvor/lumen reader; Swallowed Rib and swallowed Charon buoy.
- **Placement/visual identity (S, camera U):** The Swallowed Rib; A throat, not a belt. The grit field is a chart fiction; the room is tissue. Focus `station_bolus_rib`. Use the actual pockets and station/POI bearings, not new decorative rings.
- **Consequences and Save/Continue return gate (U unless separately cited):** Reconcile cast with solitude; test one specimen-versus-suture choice and persistent effects on the real passage without repeated rewards.
- **Station inventory (S):** The Swallowed Rib (`station_bolus_rib`).
- **POI inventory (S):** Swallowed Charon Buoy (`poi_bolus_charon_buoy`).
- **Exact source keys:** `sector_the_bolus` in `src/data/sectors.js` (frontier cards via `src/data/frontierRegions/index.js`; Bolus via `src/data/theBolus.js`), `src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`, `src/data/sectorWayOfLife.js`; named landmark jobs above in `src/data/landmarkMissions.js`.

## Next executable connected increment: Ceres remembers the Last Shift

**Priority 1, original SF20-18 / P03 and P07 connection.** A normal mining visit should let a player notice an unresolved accident, investigate by choice, carry the actual recorder home if desired, and later recognize what their evidence changed. This closes a perception-to-consequence gap using existing public mechanics rather than adding a twenty-sixth destination or another self-contained Orchard test.

### Source-backed gap and what already works

`src/systems/lastShift.js::_materialize` admits three wreck entities only inside `discoveryRangeWu` (1200), but does not explain the site on approach. `_scan` emits the first rumor only after a `scan:pulse`; `src/ui/lastShiftPrompt.js::offer` returns early until `canArchive` or `canReturnRecorder`. Thus the encounter's first contextual introduction is scan-dependent in the inspected source. This is a source finding, not a claim that no other UI can render those generic wrecks.

The same public system already has three source facts, all-order investigation, honest partial reports, stable body keys, finite salvage pools, loss states, archive revision deduplication, a real tethered recorder return and save hooks. `lastShiftArchiveEvidence` feeds Doss; `stationContacts.js` listens to `lastShift:archived`. These mechanisms must be preserved, not reimplemented. Canonical `hundredHandMile.js` additionally consumes Last Shift evidence, but that integration is C, not part of this public completion claim.

Original SF20-18 in `references/sf20-2026-10-03/REPORT.md` requires first clue visible on ordinary approach, a broad search/scan volume, changing interpretation without changing truth, optional salvage-versus-return and later reports citing only recovered facts. Do not expose its final rescue explanation in a first-arrival marker. No new compulsory mission or payout is needed.

### Bounded four-path implementation

Proposed and subsequently parent-reserved paths:
- `src/data/lastShift.js`: truthful approach/return/revisit copy and compatible persisted state definition, if needed.
- `src/systems/lastShift.js`: first-approach cue with a persisted surfaced state distinct from source discovery; state-derived optional recovery guidance and finite revisit response. Existing body/receipt ownership stays here.
- `src/ui/lastShiftPrompt.js`: use the existing prompt deck and existing events; no alternate HUD framework or generic marker cloud.
- `test/last-shift.test.mjs`: source-order, lifecycle, no-spam and save regressions alongside existing cases.

No edit to `anvilWork`, `anvilSpillRecovery`, `contactHail`, `scanner`, `traffic`, manifests, shared event surfaces, or canonical-only story systems belongs to this first slice. If a required event genuinely cannot travel through the existing surface, report the narrow dependency rather than silently taking foreign paths. The register itself does not grant ownership: recheck current exact paths.

### Connected acceptance route

1. Start from an ordinary Ceres mining approach outside the site. Fly into the existing authored pocket without a scan. A bounded, non-spoiler opportunity becomes understandable; no clue, archive receipt, payout or mandatory objective is granted by arrival.
2. Ignore or dismiss it and continue mining. Nearby work continues. Re-enter and Save/Continue: previously surfaced approach copy does not repeatedly steal focus. An old save with no new field receives compatible normalization, not fabricated knowledge.
3. Investigate any clue first. All six orders preserve the same final facts; partial/destructive branches never use knowledge from unread sources. No generic “pirates did it” message survives as established fact after contradictory evidence is filed.
4. Choose whether to salvage or physically return the original recorder. Guidance must identify an actual eligible slow berth, never certify delivery from distance alone. Leave the line, lose the recorder, leave the sector or change state: obsolete guidance stops. Boundary oscillation must not spam the prompt.
5. Save mid-tow and Continue through the real existing authority. Original body key, occupant-safe attachment and finite salvage/return state survive; no replacement recorder, second payment or vanished hardware before actual acceptance. Keep `_returnEligibility`'s shared `resolveDockRange`, active occupant binding and native telemetry requirements.
6. Return/file once and revisit the ordinary local contact/report path. The report cites only the actually filed revision, including missing evidence where relevant. If no report was filed, do not manufacture a public correction. Preserve optional discovery, local ambiguity and the established Doss consumer.
7. Obtain normal game-camera approach and return captures after behavior is integrated. Verify the three actual visible bodies are distinguishable at the gameplay camera, not merely that prose names them. This is a separate visual gate; source/unit tests cannot certify it.

### Asset reuse, without inventing completed visual work

The public Last Shift entity spec supplies `type: 'wreck'`, `parentType: ship/module/communicator`, labels and salvage pools, but no explicit Last Shift authored asset ID. The renderer's `packagedDecodeFileForEntity` resolves wrecks through `wreckPackagedFile`; therefore the final selected bytes and appearance must be traced, not inferred from object labels.

**Observed source-level visual identity flaw:** public `src/render/visualFactory.js::wreckPackagedFile` has no Last Shift clue-specific case. The three Last Shift specs do not provide fracture, hulk, military or other explicit visual identity, so their ordinary default selection is `WRECK_PACKAGED_FILES[hashId(e.id) % WRECK_PACKAGED_FILES.length]`. This uses a transient entity ID rather than fairlead/cargo/recorder role. A recorder can consequently select a cockpit, turret or weapon spar instead of a readable recorder, and the same stable clue can acquire a different presentation after re-materialization. This is a concrete resolver defect, not merely an uninspected model-quality concern; gameplay-camera severity still requires a visual witness. A new deterministic renderer-binding correction is being reviewed under a separate owner, not included in the four-path arrival writer's work or claimed as already public/passed.

Useful **public candidate inventory**, verified as paths in the baseline tree:
- `assets/ships/release/parts/places/place_container_rack.glb` and its `release/render-packages/container-rack/` package.
- `assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_hopper.glb` and matching package.
- `assets/ships/release/parts/places/place_aftermath_wreck_mining_barge_authored_down.glb` and matching package.

These are reuse candidates, **not** proof that Last Shift currently selects them, that they fit its collision/mass envelope, or that an existing hopper has the required torn lateral fairlead. Do not copy an incubator or original concept GLB into release. The public tree does contain Thimble recorder authoring/source assets: `assets/ships/forge/sources/thimble_recorder/thimble_recorder.blend` and `assets/ships/parts/wholeships/thimble_recorder.glb` plus LOD1/LOD2. Its shipping release and compiled render-package paths are absent from this public tree. Source existence is therefore established, while ready-to-bind public shipping availability is not; do not describe the source as absent. First preserve useful existing bodies and correct approach/readout; a later tightly scoped visual increment may bind or adapt an appropriate model after checking the actual resolver, silhouettes, physical envelope and source/release contract. No manifest regeneration belongs to the four-path slice.

### Next decisions after this slice, not an open-ended wishlist

- **Second:** use its actual ordinary-route/visual witness to decide whether Last Shift needs a specific fairlead/rack/recorder identity improvement. Fix the observed composed scene, not all Ceres art at once. Preserve the original finite accident layout and evidence.
- **Third:** reconcile one frontier's cast-versus-fiction discrepancy on its existing mission route. Phoebe is a useful candidate because the public four-fragment Song return already gives a bounded before/after goal; first inspect current ownership and route evidence. This is a proposal, not an assigned implementation or permission to add more actors.
- Keep the active Orchard recovery/delivery work with its owner. Existing private Mile/Thimble/Pallas work should be reviewed and integrated under their owners rather than recreated from this register. No sector is marked accepted simply because the selected first slice passes.

## Register validation and remaining coverage

The inventory script evaluated public data and asserted coverage against the 25 sector IDs; each entry includes every catalog station and POI and all actor slots from the public pocket registry. Unique landmark job coverage is eight (the module's default export aliases Caved Shaft and is not a ninth mission). The four inspected chain sectors are not the only possible dynamic story consumers. World locations spawned by separate systems, full campaign beats B0–B7, all item/fitting acquisition journeys, every encounter, every asset's actual resolver and all Swarm arenas remain outside this first census's exhaustive claim.

The next exhaustive pass should follow **one connected player route at a time**, recording actual selected asset IDs, placement/clearance, first meaningful decision, independent routine, interference, finite consequence and Save/Continue. Reuse this existing register and packet receipts; do not establish a second completion dashboard or declare unsupported universal scores. Only a source-to-runtime-to-player witness can promote an entry beyond S/U.


## Vesta recovery implementation checkpoint (21 October)

[Winnow recovery implementation and evidence](VESTA_WINNOW_RECOVERY_2026-10-21.md) connects the existing original batch, optional physical player assistance, original Tann, actual Forge stock acceptance and requested revisit facts. Demonstrated outcome: 2u delivered, 8u still loose; no extra payout or replacement cargo. Native Save/Continue/replay evidence is bounded, with scenario setup, inherited station-alias defect (existing PR457), and live-camera/whole-sector acceptance limitations explicit. SF-SECTOR-COHERENCE and the larger scope remain open.


## 22 October 2026 verified increment update

This section preserves the complete earlier register and its acceptance fields. Its baseline is the published register in Orchard PR #480 at ff62ac4261b4debaff798f46cbe56a6473f8cf2e. It updates evidence, not sector completion. See the [current checkpoint](CURRENT_CHECKPOINT_2026-10-22.md), [build map](../../../build_map.md) and original twenty-concept scope.

### Helios → Tethys → Dione / Veil: choosing a frontier route

[Draft PR #514](https://github.com/coldshalamov/SpaceFace/pull/514), verified commit f9aea98d27d2903253aa262f0874158bd9968280, repairs the existing Open Frontier Circuit rather than adding a new character or mission chain. Existing lore remains: an independent cartographer travels from Helios to Tethys; the player then chooses a practical civilian supply circuit at Dione or a survey of the unknown at Veil. The Dione branch calls for ten provisions to Ceres and a return escort. The Veil branch calls for four scans and a later hydrogen sample. Those downstream activities and lasting regional consequences were not completed or changed by this increment.

- First arrival in this tested phase is after a disclosed completed ending-continuity prerequisite, not a first-hour player arrival. The actual mission owner boards and accepts the Helios passenger job; Tethys docking completes it and the economy pays 793 credits for the tested seed/configuration. That amount is not a universal fixed reward.
- Purpose and available activity are conveyed by the existing authored mission titles, instructions and branch tradeoffs. No new portrait, landmark, asset placement, inhabitant, history or economic writer is introduced.
- Ordinary visits before acceptance can now alternate between Dione and Veil. The first station no longer monopolizes an unaccepted preview while branchId remains null. Repeated same-station and unrelated-station visits do not change the choice.
- Only acceptance commits a branch. The missions owner retires the previous exact preview; its stale ID is no longer accepted. Unrelated board rows and every accepted mission remain intact. Settlement, receipts and regional consequence handlers are unchanged.
- Leaving, returning and actual Save/Continue before acceptance preserve a usable choice. Failed replacement boarding is recoverable, including after Save/load. Missing or mismatched authority does not remove the existing preview.
- Evidence: five actual-owner cases and eight existing replay checks pass, with independent reruns and one recovery edge probe. The same five new cases fail against original source. The exact new five-case Node command also passes in CI; the overall run still has other failures.
- Limits: travel/dock inputs were accelerated, storage is an in-memory adapter behind real Save entry points, and the ending prerequisite is a fixture. This is not physical flight, browser/phone UX, all six ending-route completion, or whole-sector acceptance. Current PR #513 Save-layout changes are preserved in the publication parent but lie outside these test closures.

### Bolus and Hyperion carry-forward

PR #510 now preserves native-observed displacement, health and terminal loss for four existing bezoars and the Milk Cyst through Save/revisit; authored reward/lore latches and recurring creatures remain separate. Rib geometry was independently exported and reviewed. Ordinary flight/protected-tether route acceptance remains open. PR #512 delivers C6 discovery/accepted guidance, but the actual scanner settlement prerequisite still belongs to held Guide work. Cut Refinery production and Cut Claim Outpost's low fuel-cell equilibrium must not be conflated.

### Avoid duplicate station-broadcast repair

The earlier master-based clock-reset probe identified a real source behavior, but fresh inspection shows its repair is already published in open Orchard PR #480: stationBroadcast blob bf993cae8953af1957d1375347dcbb2528dc4524 handles save:loaded and resets both cosmetic clocks. This is an integration/acceptance dependency, not a new implementation vacancy. The probe used a voice spy, not heard audio or browser acceptance.

### Asset and coverage boundary

The new gravity-gradient calibration frame has actual exported-package review, seven focused checks and byte-reproducible exports. It is one authoring model with three LODs, not three distinct models, and it has no runtime placement, animation or measurement behavior. Its GitHub publication operation is pending. It does not increase any sector's placed-asset coverage. That investigation produced the bounded Vesta correction below. The next executable sector increment is interrupted-rescue continuity, subject to its separate exact claim.


### Vesta Forge: Runaway Kiln damage route and remaining continuity gap

[Draft PR #515](https://github.com/coldshalamov/SpaceFace/pull/515), final verified head 1608d857929257cc182e36582ed7d7a4ab2ee63d, repairs the existing VIG-02 route. The unmanned Crucible Nine-Arm carries molten glass toward Depot Three. Existing Forge anchor (-480, 17104), Depot Three (1120, 15824), 24 WU/s authored drift, mass 150 and the core-only kilnback collision proxy are unchanged. The yard is represented by existing radio dialogue, not newly implemented crew actors or shifts.

- Authored first-encounter intent: an already moving crucible and the existing primary radio line introduce a physical rescue. The later actual-station-entity reproduction below found that this intent was not met by the published lookup. Its scan identifies cargo, absent crew, cold drive and the depot-bound vector; the first player tether emits existing handling guidance.
- Activities and consequences: the existing script rewards slowing the crucible below 12 WU/s anywhere along the lane, not delivering it to an arbitrary quest radius. The reward is 320 credits and eight Choir reputation. Fast arrival inside the 260 WU ring detonates the load; elapsed 420 seconds resolves as drifted. These are existing script rules, not all newly demonstrated ordinary routes.
- Actual change: replacing the damage-filtered beacon kind with payload makes ordinary combat reach the existing first-scratch warning, second-hit detonation and lethal-hit detonation. It retains tether eligibility and does not acquire a commodity, pickup or salvage identity. The real combat-owner tests pass 3/3; original source fails the two damage cases. Six existing checks and an independent single-settlement edge pass. Rescue tests still set velocity directly and are not proof of player towing.
- Memory: resolution records the existing story flag/history, receipt, news and danger impulse where applicable. The independent repeated-hit probe observed one resolution/headline/danger event and no payout for detonation. Hard exits abort; continuous sector handoffs preserve the live runtime, according to source inspection. Active rescue Save/Continue remains unresolved because the transient director/body state is not reconstructed. Completed-state persistence is source-inspected here, not a new full-route Save acceptance.
- Visual identity: the existing primitive mapping changes from navigation buoy to sealed cargo canister. A newly rendered comparison uses actual public factory source and is explicitly an offline source preview, not a new exported model or live camera. The generic canister does not precisely match the kilnback core proxy. The full existing kilnback asset's outer casks do not fit that proxy, so it was not force-bound.
- CI: the corrected head includes the focused command in the CI command graph. Preceding Ceres validation failed in static (1), and checked static logs do not establish that this focused command executed. Do not relabel local tests as CI success.

Next action is the [bounded continuity claim](CLAIM_RUNAWAY_KILN_CONTINUITY_2026-10-22.md), not further repetition of the proven damage fixture. Vesta, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open. No new economy stock, character, landmark or whole-sector acceptance is claimed.


### Vesta actual-admission correction and review status, 22:54 UTC

The actual eligible zone center is the Forge (-480,17104); Depot Three remains (1120,15824). World station entities expose stationId, while numeric id denotes the entity. The published ringTarget compared the wrong field and fell back to Forge, giving a zero vector and immediate rescue settlement on the first real step. This corrects the earlier assumption that the authored moving-crucible intent already held under ordinary zone admission. Direct damage fixtures were not evidence of that admission path.

The local continuity increment now includes the narrowly allocated stationId lookup correction and tests the unchanged eligible zone, not an arbitrary displaced anchor. It remains unpublished and under review. An initial 18 focused / 51 existing pass set did not catch a native-motion authority defect; independent review did, and publication is blocked on its correction. Do not close Vesta or promote fixture results to player acceptance.

Real attachment and Save owners demonstrate clean tether release and one reconstructed body; manual relatching is required. Scalar motion/health/timing/counter continuation is the bounded objective, not exact native solver restore or live flight acceptance. The next executable action remains correction and re-review of native motion capture/settlement in the allocated unit, rather than a new unrelated sector controller.


### Vesta continuity delivery and actual visual identity, 23:30 UTC

The independent native-projection blocker is corrected and reviewed. PR #515 now contains the targeting and bounded scalar Continue unit at09ecc5633e6397003fbc1dd70a040b3d4ac17cc0, with73 named checks and independent re-review. CI39870336885 remains active; no whole-game or live towing acceptance. Manual relatching and the native admission displacement bound remain explicit.

Renderer inspection corrects the scope of the earlier image: the336-triangle canister was a procedural source preview. A successfully admitted ordinary payload instead mounts pods/pod_cargo_container.glb. Default radius23 fits its longest axis to46WU, while the native core spans27.716478 by13.6WU. The full crewed kilnback tug also does not fit. The next allocated visual unit reuses the appropriate unmanned furnace-core elements and measures the true export/package fit. No such derivative is exported or integrated yet. See CLAIM_RUNAWAY_KILN_VISUAL_2026-10-22.md.


### Vesta fitted-load candidate, 23 October 2026

The unmanned Kiln source and compiled package are locally integrated and independently reviewed. Four export iterations repaired a buried panel and seated lifting fittings. The actual filtered package mount yields a centered27-WU visible body; its native certificate stays excluded from drawing/fitting. Fourteen focused cases pass and old registry rows are preserved. This is not a verified remote model delivery or live-camera acceptance: the source GLB upload is still at an unresolved requested approval. Physics, rescue, damage and Save authorities are unchanged. New source-export views were shared, explicitly distinguished from game-camera captures.

### Triton Field Lab: readings connect to a real research route, 23 October 2026

- First meaningful action: existing poi_triton_field_lab at local(1600,-700), using place_sensor_mast, now has a candidate300-WU triangulation footprint. It previously advertised the verb without a live plan. Three actual scanner readings separated by180WU produce the normal causal offer at station_triton.
- Connection and consequence: a verified owner/API chain accepts that offer, creates the real neighboring Veil signal, classifies/tracks/investigates it and completes once through the normal mission/economy owners. Seed4242 yields960 credits and13 research points. This is not a new mission type or reward authority.
- Return/time: actual Save/Continue retains accepted mission and resolved lab aftermath. Incomplete readings still reset under existing serialization. The six-day expiry reopens the existing research activity; generic Wake/Glow aftermath remains independently pinned.
- Review: the first candidate allowed stale scans after departure. A transient authored-lab-only presence guard now rejects them until valid reentry. Wrong-sector, outside, repeated and nonfinite pulses cannot earn a reading. Exact POI binding avoids annotating an unrelated neighbor.
- Evidence/limits: nine new and22 existing living-POI cases pass. One causal tombstone assertion fails identically on baseline and is separately investigated. Four existing NPC routine slots are unchanged. Ordinary flight, rendered comprehension, phone performance and whole-sector acceptance remain open. Draft publication is active, not yet verified; see CLAIM_TRITON_FIELD_LAB_2026-10-23.md.


### Triton delivery update, 23 October 2026 01:15 UTC

The five-file Field Lab increment is now remotely verified in draft PR #518 at 48c5be52d35c6a857769d98b4a546c57cff34d7f. It is published, not merged or accepted. CI remains in progress with individually investigated failures. The adjacent causal-retirement issue is now classified as an obsolete test spy cardinality expectation: actual target retirement, investigated scanner receipt and one settlement hold in the bounded owner/serializer probe. Test-only observable-state coverage is allocated; no narrative/gameplay repair is claimed. Native flight, visible player comprehension, performance and whole-sector acceptance remain open.


### Veil Far Sounding reviewed successor, 23 October 2026 01:59 UTC

The existing Far Sounding wormhole identity now has reviewed local three-range survey behavior instead of descriptor-only sound metadata. It is independently discoverable during the neighboring Veil visit, not gated on Triton's mission and not a new portal. A300-WU footprint teaches close/middle/far readings through the real existing voice consumer, with repeat-scan recovery of missed instructions and no extra progress. Actual scanner/mission/economy owners connect the result to station_veil's neighboring Io Reach investigation and one measured normal payout. Accepted mission and five-day charted aftermath survive actual Save/Continue; partial ranges still reset.

Review fixed missing first-approach guidance, repeated aftermath speech and tutorial readout churn. Fourteen new plus31 existing Triton/generic cases pass independently. Publication is pending; all five source hashes and verified recovery are in CURRENT_CHECKPOINT_2026-10-22.md. Native flight, visible comprehension, asset composition, phone/performance and sector acceptance remain open. No new gravity physics, route unlock, NPC routine, global zone or reward authority is claimed.


### Veil delivered; Ashfall recovery allocation, 23 October 2026 02:22 UTC

Far Sounding's reviewed increment is remotely verified in draft PR #518 at cef2d5644d570a7e48de2608761b302080c7792d. This supersedes its publication-pending status above; integration, native flight, visible comprehension and acceptance remain open.

Ashfall has real appended salvage fields at Converted Yards and Towed Moonlet. The slag hazard itself is decorative, and Ledger's separate liner/lore must not be reassigned. The existing Converted Yards Recovery Writ promises two manifest crates on site, yet actual acceptance/materialization/Save provide no originals. External classified-salvage delivery remains a legitimate alternative, so the mission is not globally impossible. The allocated correction adds finite on-site recovery with stable original identities and existing authority boundaries, not a new generic salvage zone or faction. See CLAIM_CONVERTED_YARDS_RECOVERY_2026-10-23.md for exact paths and unfinished acceptance.


### Ashfall Writ reviewed, 23 October 2026 03:33 UTC

The existing recovery activity now has two finite on-site tooling manifests, using the existing cargo-container model at the actual Converted Yards drydock. Acceptance teaches physical approach with hold space; target guidance follows a surviving original, then Ashcache delivery. Ordinary proximity/magnet pickup, not industrial-beam extraction, is the supported route. External classified salvage still completes the same contract. No extra payout, contested crew, arbitrary decoration or new model count is introduced.

Original identity, remaining stock, pose, native motion, hull and terminal loss persist through existing world records; a bounded two-slot ecology ledger prevents refill across contract turnover. Created stock closes on failure/abandonment/expiry/settlement, while denied creation remains retryable. Legacy accepted saves obtain missing originals once after stable-record/tombstone checks. Actual New Game cache reset and fresh-state Continue are covered. Root independently passed29 focused cases; author26 relevant existing regressions passed. These are headless owner/API/native admission checks, not flown camera or performance acceptance.

A newly produced actual exported-package geometry/proxy preview was inspected and delivered, explicitly untextured and not live gameplay. Eight shipping paths are frozen and exact recovery independently read back. Publication has requested a GitHub operation approval; no Writ remote commit or PR is yet verified. Next action is finish that precise pending publication after approval without retrying it blindly, then validate ordinary flight and visible comprehension when a supported route is available. All sector and game goals stay open.

Ceres CI prerequisite: current research workflow skipped both focused route gates after physical precheck failure. Existing open draft PR474 at1a21bb0e044b5105abe20caac10f7afb43bd50d0 already owns the tender staging/native-control correction, with its historical285-case CI pass. Current public lacks those staging changes. Do not duplicate that implementation or weaken head_retract into an accepted recovery phase; fresh dependency compatibility is not yet established.


### Sedna filing connection delivered, 23 October2026 03:49 UTC

Draft PR520 at35437b0bac6e20d7b982454e7516da5080ee8a82 connects C11's existing Ringworld discovery to the actual Helix Survey Post earned filing. No normal procedural desk or fuel service is added. Unknown/triangulated-only sites remain unspoiled; identified sites teach conditional Jobs-board access and fuel planning. Canonical accepted work teaches the existing300WU close scan; closed receipts suppress stale active promises; matching durable artifact renders authored filed-reading prose. Filing occurs remotely for the post, not an invented second docking task. Other plates and shared construction hunks are untouched.

Root23/23 focused/adjacent checks and actual Save owner projection pass, with synthetic discovery/artifact inputs explicitly disclosed. Exact five remote blobs verified; CI is active. Held Guide remains prerequisite for full ordinary scan completion. Native flight, visible journal comprehension, performance and sector acceptance remain open. This increment is published, not integrated or accepted.


### Haumea existing survey connected to machinery, 23 October2026 04:17 UTC

Delivered in draft PR518 at424bdae718639df6af12117f6a5c5e9e15eee489. Existing fissure research was already present; only its measurement ignored the drill. Safe calm then surge observations now use actual admitted field/dressing/anvil identity and existing clock. Shutdown is a deliberate alternative steady reading, never implicit missing-actor shutdown. Conservative cone/hull exterior keeps readings outside machinery envelope. Existing causal offer and reward remain, including legacy fingerprint and accepted work.

Arrival/repeated scans teach fresh baseline, next surge or steady alternative. Leaving/Continue/kernel reset clears incomplete comparison and readout together; saved accepted mission/completed six-day aftermath/shutdown persist. Existing phase and player stop/destruction meaning now affect the ordinary survey rather than another independent ambient loop.70distinct named checks passed, including real owner placement/scanner/Save/economy and5environmental regressions. Native flight, full materialization/GPU, visible comprehension and performance remain open. Existing asset preview is geometry inspection only, not new art or live placement. CI is active. Published is not integrated/accepted.


### Eunomia: player-selected papers, 23 October2026 05:31 UTC

Published draftPR523 at2e971d9e31a3decdebab7abffb5467b1d0528b56. Existing outlaw berth, prices/reputation, hot cargo and legal remap are reused, not a new economy. First arrival and Tethys delivered guidance now direct the player to Market's Papers service. Ordinary visits present nearby physical hot pods with authored identity/title/faction, quantity, range and exact cut; only a deliberate confirmation pays and stamps one pod. Foreign title stays foreign. No charge on docking/opening, no implicit washing of held inventory, no wanted-level reset.

The service gives the established corrupt-port activity an explicit understandable transaction: proximity is availability, not consent. Existing faction reputation changes the cut and forces stale quotes to be reviewed again. Pod/title/contents/berth/sector changes and ID reuse invalidate confirmation. Leaving/returning and Save/Continue preserve completed stamps and ledger while transient quotes reset. Actual Continue's player-ID remap is why bare title-ID filtering was rejected. No new asset, inhabitant, chronology or history is invented by this correction.

52current focused tests pass (root rerun overlaps), real Save/repeated Continue and existing customs/physical Tethys delivery assertions retained. Current production-worker boot is blocked by an unrelated missing published onboarding module; old-base53/53 includes that transport test. Source-level normal ORRERY/DOM mounting verified, not rendered/phone/performance acceptance. CI queued39906015614 and39906015797. Published is not integrated or sector-accepted. Full report inPR523; larger build-map and original twenty-concept scope remain open.


### Rhea: the same rescued miner returns after Continue, 23 October2026 05:45 UTC

DraftPR526 head7b08cfd34e3ef98470cf64d6beecf4dfc3217ec9 corrects existing rescue memory, not a new cast. Actual Cinder Claim placement has DMC scorch-seam miner, ore hauler, yard tender and thin escort. Existing "Cut, load, run" work and authored Sker/Collective pressure remain canon. The same rhea_seam_miner Pelican with its yard-face→slag-face job can return after rescue and Continue, rather than an unset time being mistaken for an already-completed return.

Ordinary consequence: the returned person offers one remembered thanks through actual hail availability; that acknowledgement survives Continue. Later death is final, not a respawn loophole. Leaving/returning sector state gates return, and original workplace/identity remain. This uses existing assets and owners, adds no income/faction/controller/schema. No placement or lore was fabricated to mask a test gap.

Baseline15/22 vs fixed22/22 plus9existing regressions; real traffic placement/jobs/Save-restored hull/hail owners, supplied casualty/ejection/rescue receipts.31distinct passes are not native combat/rescue flight/full transition/render/performance acceptance. Validzero preserved; already-resaved corruptzero values are not guessed away. Source published and recovery verified; sector and whole-game acceptance remain open.


### Helios Choir medical service: interruption and autonomous return, 23 October2026 06:17 UTC

DraftPR528 head d5e1a1da49585dfdba4877280f2efc96bca1db00 retains Last Light/Mercy and the bounded Vesper/Compline cast. Existing repairs, tow-rescue alternatives, handover news/reputation and90sMercy bed stay are unchanged. A local living relief runner pulled outside the existing berth envelope no longer receives45seconds of remote treatment. Her bed/person reservation persists; existing job owner brings her back, then a new uninterrupted stay completes once. Transition-only guidance explains interruption/return. Missing/offscreen/unobservable bodies are not guessed to be displaced. Finite-coordinate/current-map validation also gates first admission.

27shipping/adjacent cases pass, plus3review-only probes. Separate real Rapier/flight/job/economy-tick probe: approach117.683, one injected displacement, autonomous re-entry200.167, departure245.167; same person, no remote completion, no duplicate next beat. This is not player-controlled towing/full-world or native Continue acceptance. Actual existingMule exported geometry inspected and previewed, no new asset or distinct-model count. Published/recoverable is not integrated/accepted; CI#5882 still active.

### Eunomia follow-up, 23 October2026 06:14 UTC

Upstream#525 restores the previously absent import using an inert public onboarding module. Unchanged PR523 now passes53/53 on6756current-source overlay,1619loadedESM inputs verified, including worker transport. The previous worker-startup blocker is resolved, not a current excuse to stop. This does not accept the inert onboarding feature or prove ordinary flight/visual/phone quality. Historical hosted CI remains failed with focused gate included-but-skipped after precheck.


### Nereid: earned freight annex becomes physical, 23 October 2026 09:05 UTC

Draft [PR537](https://github.com/coldshalamov/SpaceFace/pull/537) at `c6f74168d7cfb9e4d94e6505c5e6e1c5c0567375` projects the existing station-growth Bonded Freight Annex receipt into existing world dressing at Nereid Waystation. A real 150-food trade awards the existing claims receipt; once earned, the existing freight platform and container rack are seated at fixed authored positions. Existing claims/save/world-dressing owners remain authoritative. Blocked seating retries on existing entry, restore, or later growth rather than clearing obstructions or polling every frame; older saves without the receipt remove tagged annex dressing. No new ledger, reward, asset, job, or economy authority is added.

Qualification records 22 distinct focused behavior cases and one real native Rapier case; the latter exercised two fixed bodies and 36 colliders, repeated seating and cleanup on older-save restore. This is source/owner and native-physics proof, not player-flown travel or rendered/performance acceptance. The inspected CPU preview decodes actual exported geometry; it is not a live-game capture. PR537 is open, draft, and unmerged. Exact-head run `39927303314 / #5908` is still running. Static-1 package:scripts.check artifact `12490083951` explicitly shows the focused gate executed with exit 0 and 15/15 TAP tests, but other workflow failures remain and the overall run is not green. Await terminal status without retry or cancellation. See the [implementation report](NEREID_FREIGHT_ANNEX_2026-10-23.md).

All ten game/sector goals remain open; source publication is not integration or acceptance. The next grounded sector unit is under inspection and has not yet been allocated.