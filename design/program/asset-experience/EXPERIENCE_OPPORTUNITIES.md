# Existing-asset player moments

This is a companion to [the existing asset-experience program, §8](../asset-experience-program/ASSET_EXPERIENCE_PROGRAM.md#8-luna-workflows-for-the-complete-player-moment), not a new queue or a claim that every described loop has already been accepted in live play. It names ordinary moments that can be made more legible by connecting assets already in the stocktake to their actual behavior, sound, motion and aftermath owners. The immediate new-mesh list remains empty. At dispatch, refresh the exact-path ownership and consumer before assigning a packet.

## Six player moments with existing stock

### 1. Bring a distress capsule through the Wasp screen

**Route and assets:** at campaign beat B2, the default Tethys departure activates `campaign47a:b2:elroy`; the authored pocket uses `place_47a_rescue_capsule` (`places/place_47a_rescue_capsule.glb`) and two `wasp_swarmer` escorts. The current `wasp_swarmer` render mapping is `wholeships/ashline_dart.glb` / `SF_WHOLESHIP_ASHLINE_DART`; do not describe `wholeship_wasp_production_v1.glb` as this actor's current body. Owners are `src/story/campaign47a/embodiedMissions.js`, `src/data/encounters/set-piece-authored.js`, `src/systems/missions.js`, `src/render/visualOverrides.js`, `src/render/partsLibrary.js`, and `src/systems/tetherGameplay.js`.

**Cause and feedback:** the player may latch and physically tow a capsule to Expanse, or destroy both escort actors and reel a capsule from the open corridor. Capsule motion is the real tethered body. The capsule is a distress-marked payload, not the `survivorPod` actor rig; do not send `survivorPod:*` animation events to it. Existing cues already cover the latch (`tether:latched` → `sfx_tether_latch_lock`), settlement (`mission:completed` → `sfx_mission_complete`) and failure (`mission:failed` → deny cue); `tether:reel` is intentionally voiced by the continuous winch.

**Variation and aftermath:** approach heading rotates the fixed stagger and escort flanks. The choice is spatial and physical—tow first, or clear the lane first—not a dialogue branch. Each actor has a per-mission identity and terminal outcome in the mission save; a lost capsule stays lost, all-capsule loss fails without reward, and the ordinary Tethys departure can offer a fresh attempt. The focused route test covers both completion methods, one payout, Continue, failure and retry.

### 2. Decide what a customs stop means

**Route and assets:** existing lived scenes `scene_manifest_stop_and_search` and `scene_paperless_dash` use `customs_cutter`, a hauler or quiet-ghost runner, and an `OPENED POD` prop. The `customs_cutter` enemy uses `ship_wasp`/Hornet identity and the `wholeships/hornet_scn_interdictor.glb` render mapping; ambient `inspection_cutter` instead maps to `wholeships/inspection_cutter.glb`. Owners are `src/data/encounters/571-scene-manifest-stop-and-search.js`, `src/data/encounters/573-scene-paperless-dash.js`, `src/systems/vignetteInterpreter.js`, `src/systems/lawSecurity.js`, and `src/systems/traffic.js`.

**Cause and feedback:** the authored choice, scan and break-scan events drive the scene. `src/render/authoredMotion.js` already routes `lawfulInspection:choose`, `customs:submit` and `customs:breakScan` to the inspection-cutter rig. Keep the clerk's bark and the actual law/custody result as the feedback; a second generic sting should not replace or double the voiced line.

**Variation and aftermath:** the opened-pod mismatch and the paperless dash make different physical stakes from one cutter silhouette: help count the cargo, protect the hauler's line, or remain outside. The scene result should stay with the real custody and jurisdiction owner and remain understandable on a later scan or return. A future packet should wire one remembered result at a time, not add another customs hull.

### 3. Read a tanker by the work it is doing

**Route and assets:** `volatiles_tanker` is the fielded `tanker` role in `src/data/occupationalTrafficCraft.js`; `src/render/partsLibrary.js` maps it to `wholeships/volatiles_tanker.glb`. `FIELD_JOB_SIGNATURE_CRAFT` gives it the existing `refuel` service and `heavy_burn` / `clean_burn` loaded-versus-empty profiles. Runtime owners are `src/systems/traffic.js`, `src/systems/npcJobs.js` and `src/systems/npcJobsRuntime.js`.

**Cause and feedback:** the runtime `jobPhase` is the cause. The audio reader in `src/audio/audioSystem.js` hears nearby `work`, `load` and `unload` phases through the existing `sfx_work_motor` / `sfx_work_jam` recipes; transit and patrol stay quiet. Existing ship motion follows the traffic/job state. Do not start a work bed just because the tanker passed the camera.

**Variation and aftermath:** contrast an empty return with a loaded, slow departure and a real service interruption. The player should be able to identify the worksite and choose a sensible approach or route around it; any aid, interruption or cargo consequence must be owned by the existing service/job state. Preserve the manifest and job phase through residency so the same vessel does not reset to an unexplained idle pass after Continue.

### 4. Work a wreck that still has a history

**Route and assets:** choose a wreck family and state from `src/data/wreckAftermathDressing.js`, for example `place_aftermath_wreck_corvette_forward__stripped_heavy` with `place_aftermath_frag_grating_sheet_authored_down`, or an ore-freighter fresh/stripped pair. `place_power_skid_patched` is a separate everyday-space salvage prop. The persistent field and salvage pool are owned by `src/systems/aftermathWrecks.js`; catalog and placement are owned by `src/data/wreckAftermathDressing.js` and `src/data/worldOneOffs.js`; the existing bodies resolve through `src/render/partsLibrary.js` and `src/render/visualOverrides.js`.

**Cause and feedback:** the marker's wreck class and salvage pool explain why the hull is here; player salvage or an NPC scavenger changes the real pool, and a loaded scavenger can spill that cargo when destroyed. Use the physical salvage/reel path and its existing tether sound. Avoid an unrelated timed sparkle or a duplicate wreck ring.

**Variation and aftermath:** fresh, derelict and stripped states; corvette versus ore-freighter fracture grammar; and a live scavenger are meaningful differences in cover, cargo and risk. The durable marker owns what remains after partial salvage and sector eviction, so a returning player sees the same unfinished recovery rather than a reset prop.

### 5. Follow ore from the cut face to the return load

**Route and assets:** the existing kit includes `place_extraction_mast`, `place_conveyor_truss`, `place_ore_sorter` and `place_power_skid_patched`, cataloged by `src/data/everydaySpaceKitDressing.js` and consumed by the machinery data/runtime owners. The machinery lifecycle lives in `src/data/environmentalMachinery.js`, `src/systems/environmentalMachinery.js` and `src/render/machineVisuals.js`; the player mining loop is owned by the mining system and its drill screen.

**Cause and feedback:** drill contact, ore yield, machine phase and power/backlog state are the causes. Existing audio includes `sfx_mining_drill_contact`, `sfx_mining_scan_return`, `sfx_work_motor` and `sfx_work_jam`; the mine audio arbiter owns its transitions. Work lights and machine presentation should answer the real running, starved or jammed state rather than an ambient animation timer.

**Variation and aftermath:** the player sees a working seam, a backed-up sorter, a powered recovery, or an exhausted face as different states of the same industrial chain. The remaining yield, jam and machine condition should survive the same save/residency path that owns the equipment. A recovery should be a real clearing, repair or return load, not a free reset.

### 6. Notice the living thing a tool can disturb

**Route and assets:** existing species `stone_lung`, `suture_mite` and `black_sail` use the ecological cast in `src/data/alienFauna.js`; `src/systems/alienEcology.js` owns their stimuli, drives and site state, `src/data/faunaMotionRead.js` supplies motion intent, and `src/render/faunaVisuals.js` builds their existing procedural bodies.

**Cause and feedback:** vibration, heat, scan, mass and weapon signals change the creature's actual drive—such as `suture_mite` repairing, defending or fleeing, or `stone_lung` venting on its authored period. `ecology:relayPulse` already has its own audio owner in `src/audio/audioSystem.js`; do not add an ambient animal cue that continues after the creature or cause is gone. The procedural body should follow the ecology state and keep its own simulation and render roles separate.

**Variation and aftermath:** approach and tool choice change whether a creature ignores, approaches, repairs, warns or flees. Preserve the live/dead and site record on residency; a fled animal can be met again by returning to its habitat, while a dead one must not respawn from a cosmetic timer. No new mesh is needed to make these behaviors distinguishable.

## Example Luna packets for §8 dispatch

These are bounded brief examples, not additional queue rows or parallel asset commissions. §8's manager still chooses and admits work through the existing program and finish lanes.

1. **B2 rescue cast and recovery** — owned paths: `src/story/campaign47a/embodiedMissions.js`, `src/data/encounters/set-piece-authored.js`, `src/systems/missions.js`, and one focused test. Done when the default departure route offers both physically reachable methods, per-actor outcomes survive Continue, and failure can be retried without a duplicate or payout loophole. Reuse the released capsule and current `wasp_swarmer` body; no new art or survivor animation event.
2. **Customs stop consequence** — owned paths: the two scene files named above plus one scene-route regression. Keep `lawSecurity.js`, traffic, audio and `authoredMotion.js` as read dependencies unless a separately owned defect is found. Done when the player's selected line causes one durable custody/escape result and the same actors present that result on return.
3. **Tanker work-state read** — owned paths: `src/data/occupationalTrafficCraft.js`, `src/systems/npcJobs.js`, `src/systems/npcJobsRuntime.js`, `src/systems/traffic.js`, and one deterministic job-phase test. Done when loaded, empty, working and interrupted states are legible through the existing hull, profile and work audio, with saves retaining the phase and cargo owner.
4. **Persistent wreck recovery** — owned paths: `src/data/wreckAftermathDressing.js`, `src/data/worldOneOffs.js`, `src/systems/aftermathWrecks.js`, and one salvage/residency regression. Done when one chosen wreck family visibly matches its real pool/state, partial player or scavenger work survives re-entry, and recovery does not mint cargo.
5. **Ore line from face to sorter** — owned paths: the existing machine catalog, `src/systems/environmentalMachinery.js`, `src/render/machineVisuals.js`, the mining/audio owner only if a cause transition is missing, and one focused state-to-feedback test. Done when cut, jam/starved, clear and return-load states follow the real machine and cargo owners. Check live ownership before dispatching the machine data path.
6. **Ecology response in one habitat** — owned paths: one site/species row in `src/data/alienFauna.js`, its actual state transition in `src/systems/alienEcology.js`, `src/data/faunaMotionRead.js`, `src/render/faunaVisuals.js`, and one deterministic behavior/residency test. Done when one player action produces a readable behavior change and recovery or a durable death at that site, with no new mesh or timer-only loop.

Every packet keeps its variation seeded or state-derived, names the event that drives each visible or audible response, and returns partial progress, failure and revisit to the same system that owns the underlying cargo, law, ecology or mission state.
