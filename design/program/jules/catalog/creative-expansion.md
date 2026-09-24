<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Small creative production slices

Use Gemini Pro for bounded, existing-owner content that makes SpaceFace richer without adding speculative frameworks.

**Tasks:** 9 · **Range:** `JULES-0163`–`JULES-0171`

## JULES-0163 — Massline salvage — the hulk is the haul: one tow-to-beacon salvage contract

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-massline-salvage`

**Objective:** Add one salvage contract in which a destroyed ship leaves a durable hulk that must be tethered and towed to a claim beacon for pay: the tow is the mission, not a menu hand-in.

**Context:** The signature verb should earn a living. Wrecks already persist through the aftermath owner and the rope already tows bodies; this wires one contract type that pays for bringing the body in, so a kill becomes cargo without a second mission framework.

**Inspect:** `src/systems/missions.js` `src/systems/aftermathWrecks.js` `src/systems/tetherGameplay.js` `src/systems/economy.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the aftermath wreck owner, the tether/tow owner, and the existing contract schemas; reuse the live job board instead of adding a framework.
2. Author one contract: a wreck is registered as salvage with a named delivery beacon and a payout that scales with hulk mass through the economy owner.
3. Wire delivery: latch and tow across the finish radius pays once; destroying the hulk forfeits the job and closes it honestly.
4. Prove it with a deterministic fixture: spawn wreck, latch, tow, deliver, and assert a single payout; add a second fixture where the hulk is destroyed and the job closes with consequence.

**Acceptance:**
- A fixture delivers a towed hulk to the beacon and exactly one payout lands through the economy owner.
- The decisive action is the rope (latch, tow, release), reachable on the default route, not a menu-only resolution.
- Failure mutates the situation (hulk destroyed closes the job with a visible consequence), never a fail-and-reload flag.
- Save/reload keeps the contract, hulk, and beacon state coherent; no new framework file is added.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:massline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0163 --format prompt`

## JULES-0164 — Mining events — the starter field is somebody’s shift: one working-miner cycle

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-mining-events`

**Objective:** Add one working-miner event to the starter field: an NPC miner works a seam on a visible cycle (mine, fill, haul away) that continues whether or not the player exists.

**Context:** The opening harbour should show one living job chain without a mission accept. Traffic, NPC jobs, and field depletion already simulate the pieces; the session only has to show one honest cycle and let interference matter.

**Inspect:** `src/systems/traffic.js` `src/systems/npcJobs.js` `src/systems/fieldDepletion.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the traffic, NPC-job, and field-depletion owners and pick the starter-field seam the cycle works on.
2. Author one miner loop with authored beats: approach, work, fill, haul away, return, on the sim clock.
3. Let the player interfere (skim the spill, steal the seam, shove the miner) and make the next beat adapt visibly without spawning a fail flag or a mission prompt.
4. Prove it with a fixed-seed fixture: the unattended cycle completes its beats, and an interference case shows the adapted next beat.

**Acceptance:**
- A fixture observes the full unattended cycle with no player input and no mission accepted.
- An interference fixture shows the miner’s next beat change visibly, with no fail flag, fine, or tutorial popup.
- No new director, pocket system, or traffic-density knob is introduced; existing owners carry the behavior.
- The cycle is deterministic on the standard fixed seeds and cheap enough to leave running.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0164 --format prompt`

## JULES-0165 — Patrol operations — law you can watch: one readable inspection stop

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-patrol-operations`

**Objective:** Add one inspection situation: a patrol stops a suspicious hauler with an explicit signal, a hold-position window, an inspection, and an outcome, all visible before any hostility.

**Context:** Enforcement should be a visible situation rather than surprise hostility. The law, encounter, and bark owners already exist; this wires one authored sequence of beats with authored response windows.

**Inspect:** `src/systems/lawSecurity.js` `src/systems/encounterDirector.js` `src/systems/barkDirector.js` `src/systems/traffic.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the law, encounter-director, and bark owners; reuse the existing heat and witness machinery, adding no second heat system.
2. Author one inspection encounter: signal the stop (bark + position), hold the window, inspect, then resolve clean, warned, or escalated.
3. Let the player watch, interfere, or be the one inspected; interference escalates through the same windows instead of skipping to weapons.
4. Prove beat order and windows with a fixed-seed fixture, including one interference escalation case.

**Acceptance:**
- A fixture asserts the beats in order (signal before hold before outcome) with the authored windows on a fixed seed.
- Interference escalates through the same explicit windows; no instant hostility and no new heat math.
- A bystander player is never attacked without a witnessed act feeding the existing law owners.
- The situation ends in a world state (release, fine handoff, or pursuit), never a mission-fail flag.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0165 --format prompt`

## JULES-0166 — Pirate interdiction — the winner flies off with the pod: the getaway raider

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-pirate-interdiction`

**Objective:** When the opening raid succeeds unopposed, the pod-holding raider flies a real route to a finite in-sector fence point; catching or killing them spills the pod; the raider must not despawn while the loot is in custody.

**Context:** A raid the player ignored should still change the sky. The opening encounter and custody machinery exist; this gives the loser’s prize a body and a destination, making the chase a second scene with the same verbs.

**Inspect:** `src/data/encounters/015-opening-hauler-raid.js` `src/data/pirateDoctrines.js` `src/systems/encounterDirector.js` `src/systems/traffic.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the opening raid encounter and its doctrine data; extend the success branch instead of authoring a second encounter.
2. On raid success, assign the pod to one raider with a finite in-sector destination and a real flight route through the traffic owner.
3. Make catching or killing that raider spill the pod, and forbid despawn while the pod is in custody.
4. Prove two fixtures: the unopposed success path (pod host, finite destination, spill on destruction) and the player-preempt path (no second pod is grown).

**Acceptance:**
- Fixture A: the raid resolves in the pirates’ favor, the pod’s host id is the fleeing raider, and the destination is a finite in-sector point.
- Fixture A: destroying the fleeing raider spills the pod as a loose, collectible body.
- Fixture B: spilling the pod before resolution never grows a replacement pod on the raiders.
- No mission-fail flag, no scripted cutscene, and deterministic behavior on the standard fixed seeds.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0166 --format prompt`

## JULES-0167 — Civilian rescue — repair is staying attached: one tether-repair rescue

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-civilian-rescue`

**Objective:** Add one rescue where holding the tether on a disabled friendly hull repairs it tick by tick; releasing freezes progress where it is; finishing the repair frees the ship to thrust again.

**Context:** Rescue becomes a flight problem: hold the line, drag them out of the rocks, do not get hit. The tether owner already publishes latch state and the law owner already knows witnesses; no med-beam and no menu repair.

**Inspect:** `src/systems/tetherGameplay.js` `src/systems/lawSecurity.js` `src/systems/ships.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the tether latch receipt and the disabled-ship state; implement repair-ticks-while-taut for disabled friendly hulls at an authored rate.
2. Break or release the latch and progress freezes at the partial value; the hull never heals for enemies or for tethered rocks.
3. Finishing the repair frees the ship and restores thrust, with the latch receipt as the only repair channel.
4. Prove three fixtures: taut advances hull, early release freezes partial, and a held latch frees the ship.

**Acceptance:**
- Fixture A: hull increases only while the tether is taut, at the authored rate, on the sim clock.
- Fixture B: an early release freezes hull at the partial value and the ship remains disabled.
- Fixture C: holding to completion restores thrust and clears the disabled state.
- No instant repair on contact, no fail timer, no repair of hostiles, and no new UI beyond the existing hull readout.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0167 --format prompt`

## JULES-0168 — Aftermath — so then: one failure becomes the next job

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-aftermath`

**Objective:** Add one causal chain where a convoy loss the player did not prevent leaves capped, persistent aftermath, and a station surfaces one follow-up job that references the actual wreck.

**Context:** Failure should mutate the situation instead of reloading it. The aftermath wreck owner and station side events exist; this joins them so the story is tellable as “so then”: the convoy died, so there is salvage, so someone wants it moved.

**Inspect:** `src/systems/aftermathWrecks.js` `src/data/stationSideEvents.js` `src/systems/economy.js` `src/systems/missions.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the aftermath wreck owner (cap included) and the station side-event owner; join them without a second aftermath system.
2. On a seeded convoy kill, register the wreck with its commodity hint and surface one station job that references that wreck or commodity.
3. Let completing the job consume or mark the wreck so the chain closes; let repeated losses respect the aftermath cap.
4. Prove it with a fixture: kill produces aftermath, the offered job references the same wreck, and the cap holds across repeated kills.

**Acceptance:**
- A fixture asserts the offered job references the actual wreck id or commodity hint, not generic fetch text.
- Repeated losses respect the aftermath cap; save/reload keeps the wreck and the job coherent.
- The job is completable with the normal verbs (collect, tow, or haul) and pays through the economy owner.
- No fine, no mission-fail flag, and no unbounded graveyard of past kills.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0168 --format prompt`

## JULES-0169 — Crucible — the wreck is the next answer: durable swarm wrecks across rounds

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-crucible`

**Objective:** Make a capped number of kills per swarm round leave durable wrecks that are latchable bodies in the next round, surviving the between-round shop transition.

**Context:** The wreck the player made should be terrain and ammunition one round later. The swarm run, results, and shop transition already have the seams; this carries a capped wreck list across them.

**Inspect:** `src/systems/survivalSwarm.js` `src/systems/survivalRun.js` `src/systems/survivalResults.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the swarm run and results owners; carry a small capped wreck list across rounds instead of persisting every kill.
2. Materialize carried wrecks as physical bodies with mass that the Massline can latch.
3. Keep the carry deterministic and bounded; older wrecks past the cap drop off.
4. Prove it with a fixture: a kill leaves a durable wreck id, the next round latches it, and the latch survives the shop transition.

**Acceptance:**
- A fixture asserts the kill leaves a durable wreck id and the next round’s rope latches that body.
- The latch survives the shop transition with position and mass coherent.
- The wreck count respects its cap on repeated rounds, and the fixture proves the drop-off.
- Determinism holds on a fixed seed, and no new persistence system is added.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0169 --format prompt`

## JULES-0170 — Station logistics — the station has a day: one shortage job from live market state

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-station-logistics`

**Objective:** Add one shortage contract generated from live station state: when a station runs low on a commodity it actually stocks, a short-haul job appears, and delivering visibly relieves the shortage at live prices.

**Context:** A station should read as a place with a day, not a static mission list. The market, cargo, and side-event owners exist; this joins a stock floor to one contract offer and one delivery effect.

**Inspect:** `src/systems/economy.js` `src/systems/cargo.js` `src/data/stationSideEvents.js` `src/ui/station/adBoard.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the economy, cargo, and station owners; define an authored stock floor for one stocked commodity.
2. When live stock drops below the floor, surface one short-haul contract (buy elsewhere, deliver N) through the existing job board.
3. Make delivery raise the station stock through the economy owner at live prices, and let ordinary trade also relieve the shortage so the job adapts.
4. Prove it with a fixture that drives a shortage, asserts the offer, delivers, and asserts the stock and price movement.

**Acceptance:**
- A fixture drives the authored shortage and asserts the contract offer appears on the live job board.
- Delivery raises stock at live prices through the economy owner, and the offer retires when the shortage clears.
- Ordinary trading can also clear the shortage, and the job adapts instead of dangling.
- No static mission-list entry, no second market system, and save/reload keeps stock and job coherent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0170 --format prompt`

## JULES-0171 — Anomalies — the sector surprises you once: one physical oddity on a rumor

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `creative-anomalies`

**Objective:** Add one authored physical oddity to a named sector, joined to a rumor so a stranger can fly to it: it must create a physical interaction or navigation problem, never a passive marker.

**Context:** Not every interesting thing needs seven systems; one specific thing beats a scatter of beacons. The unique-wreck, sector, and scanner owners exist; humor and memorability come from the physics.

**Inspect:** `src/data/uniqueWrecks.js` `src/data/sectors.js` `src/systems/scanner.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/VISION.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Read the unique-wreck and sector data owners and pick one named sector and one oddity with a real physical hook (a grinding derelict pair, a mass that bends the lane, a machine mouth that eats loose bodies).
2. Implement the physical interaction through the existing field, force, or wreck owners; it must move or change a body that enters it.
3. Join one rumor line so the map or a bearing leads a stranger there without a mission.
4. Prove it with a fixture: a body entering the oddity’s volume is measurably affected, and the rumor join is reachable from the default route.

**Acceptance:**
- A fixture shows a body’s velocity or state measurably changed by the oddity through existing force owners.
- The rumor-to-discovery path is reachable without accepting a mission, using the existing scanner or bearing owners.
- Save/reload keeps the oddity coherent, and it adds no new hazard system or damage volume.
- The oddity is deterministic and cheap: no per-frame cost the probe would name.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when no distinct bounded slice fits current owners. Do not submit a design-only document, candidate list, placeholder, recolor, or hidden unused content.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0171 --format prompt`
