# ADMIT-SFQ-M — dispositions for the 36 SFQ-M mission briefs

Build-map row 287. Catalog: `design/finish-expansion-2026-09/missions/M01.md` … `M36.md`.
Branch `codex/mission-briefs`. The integrator moves these onto the build map.

Legend: **TRUE** = already landed, evidence named · **BUILT** = built on this branch ·
**RESIDUAL→owner** = real remaining work whose native owner is outside this lane's write set ·
**RESIDUAL (next)** = fits this lane's write set, not built in this PR · **PARKED** = conflicts, with why.

## Built on this branch

All seven are self-registered encounter modules in this lane's reserved 1100–1199 block, routed
by the ordinary encounter director (zone + sector gates, never Helios), paid only through the
director's `grant`/`rep` façade (existing credit/reputation writers), physics only through
Rapier/`queuePhysicsImpulse`. Each has one focused seed-4242 test with a real Rapier case.

| Brief | Module | Route | Two ways | Failure that mutates | Persistent consequence | Test |
|---|---|---|---|---|---|---|
| M02 Breakaway freight | `src/data/encounters/1100-breakaway-freight.js` | `refinery_approach` in Ceres/Charon/Vesta | tow it in gently, or throw it into the tug's broad bay | measured entry speed: split (3 alloys spill as real pickups), burst (2 spill), crushed on the yard spar (stays as untetherable wreck + scrap) | spilled lots, crushed segment, MTS rep | `test/sfq-m-breakaway-freight.test.mjs` |
| M09 The salvage dispute | `src/data/encounters/1101-salvage-dispute.js` | `derelict_field` in Ceres/Io/Vesta | tow the survivor pod to the claimant tender (claim released), or strip the claimed wreck | real `salvorClaimedBy` stamp: stripping drains the pool under claim → existing mining protest → `lawSecurity` report; late air hands pod + wreck to the crew | released or still-claimed wreck, Pitborn rep, law incident | `test/sfq-m-salvage-dispute.test.mjs` |
| M28 A place for the missing piece | `src/data/encounters/1102-missing-piece.js` | `anomaly_deep` in Ashfall/Veil | tow the true insert from far out, or scan the Custodian to wake its alignment field that draws a part in; a near cracked insert is the shortcut | fast arrivals are refused and kicked out; weld holds while the pilot is in the work reach; cracked insert patches at reduced output | Custodian label/state records restored vs reduced; archive rep | `test/sfq-m-missing-piece.test.mjs` |
| M34 The harvest somebody else owns | `src/data/encounters/1103-harvest-owned.js` | `derelict_field` in Ceres/Io/Vesta | haul the claimed core out of the Sorter's draw, or log it by scan and present custody so the Sorter reclassifies it PRESERVE | an untouched core is drawn in (~48 s) and reduced — it comes out of the discharge as lesser scrap/alloy lots, not deleted | preserved core stays in place; reduced lots; claim/archive rep | `test/sfq-m-harvest-owned.test.mjs` |
| M27 Dead-letter delivery | `src/data/encounters/1104-dead-letter.js` | `anomaly_deep` in Io (Listening Field) / Pallas | clear the jammed freight bale out of the lane so the Courier completes its own cycle (escorted, 360), or scan the address and carry the letter to the recipient yourself (carried, 300) | a fast or unsealed letter is refused and kicked back; handing it to the Archive Witness misdelivers it (rep −1); a destroyed letter is reissued once after a delay, a second loss ends it | delivered/witnessed letter stays where it was set; recipient/witness labels; rep | `test/sfq-m-dead-letter.test.mjs` |
| M31 The Mason moves the cover | `src/data/encounters/1105-mason-cover.js` | `ambush_lane` in Pallas/Ashfall/Sker Haven (combat deck) | fight two real raider hulls around the Mason's moving 900-mass rib section and let the schedule complete (witnessed, 380), or latch the section as cover/Massline ammunition, or pull the drive cell from its cradle and fight conventionally (each 300, rep −1) | the Mason records a diverted-workpiece or drive-isolated obligation on its own label; an unpowered section coasts (no brake, no drag); the deadline leaves the raiders holding the yard | relocated or stranded section, Mason obligation label, rep | `test/sfq-m-mason-cover.test.mjs` |
| M33 At the edge of order | `src/data/encounters/1106-edge-of-order.js` | `anomaly_deep` in Ashfall/the Bolus/Sedna Dark | keep the Pitborn barge in the plane's shadow and intercept clumps flanking the finite edges, or latch the barge (its burn cuts) and run it out your own way | the plane arrests only reactive spore mass inside its span (hulls pass) and releases what it holds at the declared power cycle without flinging it; three clumps on the hull foul the burn and strand the barge (rep −1); one or two scar it (220 instead of 340) | stranded or scarred barge label, arrested spores left on the plane, Pitborn rep | `test/sfq-m-edge-of-order.test.mjs` |

Supporting change: the encounter index/flavor/shape scanners
(`scripts/build-encounter-index.mjs`, `scripts/build-flavor-index.mjs`,
`scripts/check-encounter-shapes.mjs`, `test/encounter-shapes.test.mjs`) accepted only
three-digit filenames; they now accept `\d{3,4}`, which the reserved 1100–1199 block needs.

## All 36

| # | Brief | Disposition | Evidence / boundary |
|---|---|---|---|
| M01 | The opening raid, made whole | TRUE / RESIDUAL→Agent 2 | `src/data/encounters/344-opening-hauler-raid.js` + `367-the-salvage-tail.js`; aftermath/custody are Agent 2's (`aftermathWrecks.js`, `custodyConsequences.js`), and encounter 344 is in their write set. Starter corridor — not this lane. |
| M02 | Breakaway freight | BUILT | above |
| M03 | Warm cargo, narrow margin | TRUE | fragile/hazard clauses `fragile_intact`, `fragile_graded`, `cargo_volatile` in `src/data/missionConditions.js`; tests `test/fragile-cargo-spill.test.mjs`, `test/seam-fragile-cargo.test.mjs`. |
| M04 | Counterweight shift | TRUE | Third Shift breakaway in `src/data/heistMission.js` / `src/data/missions.js` (`breakaway_recovery`); tests `test/breakaway-third-shift-route.test.mjs`, `test/breakaway-capture-fork-physics.test.mjs`, `test/breakaway-third-shift-save-reload.test.mjs`. Brief says extend Third Shift where overlapping — it overlaps fully. |
| M05 | A pod in the crossfire | TRUE | `rescue_under_fire` in `src/data/missions.js`, `careerContracts.js`, `missionConditions.js` (`pods_are_bait`); `pod_rescue` set piece; tests `test/d133-pod-rescue-refused.test.mjs`, `test/rescue-opening.test.mjs`. |
| M06 | The moving manifest | TRUE | `heist_intercept` in `src/data/heistMission.js`/`missions.js`, bar contact route `src/ui/station/barContacts.js`; tests `test/pq019c-heist-mission.test.mjs`, `test/pq019c-heist-routes.test.mjs`, `test/pq019c-heist-save-reload.test.mjs`. |
| M07 | Cargo in the wake | TRUE (combined) | brief allows combining with an existing heist: `smuggling_run` route + `loud_heist` set piece in `src/data/missions.js`, heist receiver refusal `test/pq019c-heist-receiver-refusal.test.mjs`. |
| M08 | The impounded machine | TRUE | `impound_break` in `src/data/missions.js` / `src/data/encounters/set-piece-authored.js`; test `test/pq-151-03-impound-heist.test.mjs`. |
| M09 | The salvage dispute | BUILT | above |
| M10 | False bloom | TRUE | `src/data/encounters/568-false-bloom.js`, `test/m10-false-bloom.test.mjs`. |
| M11 | The ship that flew this before | RESIDUAL→local integration | the `preserved_cockpit` place exists (`src/data/alienEcology.js`, `src/data/authoredPlaces.js`); the brief's hook — a wreck that is a ship the player actually lost — needs a persistent per-hull history from `worldRecords`/save, which integration owns. |
| M12 | Quiet passage | TRUE | `passenger_transport` offers + declared-exposure clauses `quiet_approach`, `silent_runner`, `weapons_cold` in `src/data/missionConditions.js`. |
| M13 | Pay back the wake | RESIDUAL→Agent 2 | restitution is billed only by `src/systems/custodyConsequences.js` (Agent 2, single writer); the wake chain exists (`test/cr-chain-1-the-wake.test.mjs`). A restitution *offer* must come from that writer. |
| M14 | A rival remembers | TRUE | `src/data/nemesisRival.js`, `src/nemesis/encounterHost.js`; tests `test/nemesis-*.test.mjs`. |
| M15 | Shortage at the gate | RESIDUAL→Agent 1 | shortages are already modeled (`src/data/sectors.js`, `newsTemplates.js`); turning one into a delivery + repair offer is contract generation in `economyContracts.js`/`economyContractTemplates.js` (Agent 1). |
| M16 | Build your own escape | TRUE | `src/data/encounters/569-build-your-own-escape.js`, `test/m16-build-your-own-escape.test.mjs`. |
| M17 | The working battlefield | TRUE | demolition set pieces `wrecking_ball`, `reef_clearance`, `ore_crusher` in `src/data/missions.js`. |
| M18 | The honest shortcut | PARKED | same mechanical spine as M12 (declared route exposure on `passenger_transport`) and the brief's optional shortcut through a hazard field is M02/M28's verb; a separate mission would duplicate the clause system. |
| M19 | Arena of useful wrecks | TRUE (Crucible) | brief is a Crucible scenario, not a campaign mission: current Crucible ruleset, `test/crucible-arena.test.mjs`, `test/crucible-*.test.mjs`. |
| M20 | A room with a different law | RESIDUAL→Crucible owner | a ruleset variation of the Crucible (`src/data/swarmMode.js` lineage), not a campaign mission and not this write set. |
| M21 | Cinder Nursery: the physical return | TRUE | `cinder_nursery` in `src/data/alienEcology.js`, `sectorAnchors.js`, `authoredPlaces.js`; test `test/sfq-b078-nursery-claim-crew.test.mjs`. |
| M22 | The sample that must arrive alive | TRUE | sample library / capture-delivery path, `test/pq-158-00-sample-library.test.mjs`, `test/three-shadow-sampler-array.test.mjs`. |
| M23 | Glue, meet mass | PARKED | brief is itself a later xenotech slice and depends on adhesive law that lives in `src/systems/alienEcology.js` and combat owners; an encounter that invents adhesion would be a second implementation. |
| M24 | Move the nursery, not the animals | RESIDUAL→ecology owner | relocation of a living site is ecology state in `src/systems/alienEcology.js` (`test/veil-ray-nursery.test.mjs`), outside this write set. |
| M25 | A fossil made of motion | RESIDUAL→ecology owner | fossil/evidence reads exist in `src/data/alienEcology.js`; the physical-evidence operation is site-runtime work (`worldSiteRuntime.js`, integration). |
| M26 | The station that kept breathing | TRUE | `breathing_dock` in `src/data/alienEcology.js`, `authoredPlaces.js`, `sectors.js`. |
| M27 | Dead-letter delivery | BUILT | `src/data/encounters/1104-dead-letter.js`, natural roll in `sector_io_reach`; see the built table. Uses the native `courier` machine kind from `src/data/precursorMachines.js`. |
| M28 | A place for the missing piece | BUILT | above (uses the `custodian` machine of `src/data/precursorMachines.js`) |
| M29 | Two correct orders | RESIDUAL→machine runtime | needs persistent machine protocol state; owned by the machine systems, not data modules. |
| M30 | The clean cylinder | RESIDUAL→ecology/escort owners | escort with current suppression support (`suppression` in `src/data/alienEcology.js`/`precursorMachines.js`); escort runtime is `src/systems/missions.js` (Agent 1). |
| M31 | The Mason moves the cover | BUILT | `src/data/encounters/1105-mason-cover.js`, natural roll in `sector_pallas_drift`; see the built table. Uses the native `mason` machine kind. |
| M32 | Two ships, one mistake | PARKED | requires "admitted adhesive law" (brief's own route); same dependency as M23. |
| M33 | At the edge of order | BUILT | `src/data/encounters/1106-edge-of-order.js`, natural roll in `sector_ashfall_reach`; see the built table. Uses the native `boundary_walker` machine kind. |
| M34 | The harvest somebody else owns | BUILT | above (uses the `debris_sorter` machine of `src/data/precursorMachines.js`) |
| M35 | The route that closes ahead | PARKED | late-campaign story beat owned by the story/set-piece owners; the brief itself says no required new ending, and adding one here would fork the story chain. |
| M36 | The universe keeps working | PARKED (not a mission) | composite finish-route acceptance over existing modes/missions/story chain; it is an acceptance row, not mission content. |
