# 16 — The Bolus (Lane Contamination)

Status: frozen ship set for this pass. Design source and build contract.
Concord chart name: Lane Contamination. Pilot name: the Gullet. Sector id: `sector_the_bolus`. Display name: **The Bolus**.

This document is the plan. Implementation follows it. Reviewers compare code to this file, not to an open-ended wish list. Items under **LATER** are named so they are not forgotten and so they are not built this pass.

## What this place is

A class-C vacuum carrier fell into the Ashfall Choir / Charon fungal lineage and did not come back out as a ship. The hull is still a hull. The inside is a colonized throat: cartilage, cilia, gall, digesting metal. It is one organism's room, not a second civilization and not a person.

The player flies an ordinary gate out of the Charon Expanse and the starfield does not come back. They are inside. A nose cone is the only honest light. The Massline is the only tool. There is no apex, no face, no heart with hit points. The Vethari stay off-frame. Nobody in the room says that name.

It is an alternate meat route between Charon (the outbreak band, so the door actually gets flown) and Ashfall Reach. It is not a dead-end palette and it is not a recolor of Veil or Ashfall.

## Canon this pass will not break

- One fungus. Ashfall Choir / Charon lineage. Not Zerg, not a new species tree, not two ecologies.
- Vethari off-frame. No rendered apex, no face, no boss heart.
- Massline is the only tether. One line. No second grapple, no cutter, no wall-walk engine.
- No parallel ecology, world, or AI framework. Plain functions `materializeBolus` / `tickBolus`, same seam as `materializeAlienEcology`.
- Do not register an `ALIEN_SITE` for this sector. The ecology tick would fight custom motion.
- Deterministic layout from `meta.seed` + sector id via `hash32` / `mulberry32`. No `Math.random` in the sim.
- Planar flight. Existing tilted camera stays. No involuntary camera punch, zoom, or shake.
- Darkness is runtime, not an illegal visual profile. Authored key/ambient intensities stay inside the lighting standard. Fog, a per-frame dim while the player is inside, and a spot cone do the Alien dark.
- The 24-sector frontier clusters stay frozen. The Bolus is appended after `FRONTIER_SECTORS`. It is not a member of `FRONTIER_SECTOR_IDS`.
- Adding it makes the live galaxy 25 sectors. Every test that asserts "exactly 24" as the galaxy size is updated. Unrelated literals that happen to be 24 are not.
- Save schema is not rewritten. Sutures, the one sample, and the peristalsis pause live in `alienEcology.sectorFlags`.
- The jump graph does not migrate. The mouth is a fixed Charon gate.
- No pirates. `enemyDensity: 0`, `trafficPerMin: 0`, zones with no hostile `presence`.

## How it shows up

| Fact | Value |
|---|---|
| Id | `sector_the_bolus` |
| Name | The Bolus |
| Map cell | `{x: 2, y: 10}` (free; Charon is `{2,7}`, Ashfall `{4,11}`, Triton is the only other `y:10` and sits at `x:12`) |
| Origin | `{x: 2 * 4096, z: 10 * 4096}` |
| worldRadius | 3200 |
| tier / security | 4 / 0.08 |
| charted | false (you fly into it; Concord's file is a contamination note, not a brochure) |
| faction | `faction_free` |
| interiorHost | true |
| enemyDensity / trafficPerMin | 0 / 0 |
| Neighbors | `sector_charon_expanse` (mouth), `sector_ashfall_reach` (cough) |

Reciprocal neighbor patches:

- `FRONTIER_CORE_NEIGHBOR_PATCHES.sector_charon_expanse = ['sector_the_bolus']` (new key; Charon is core and has no patch today).
- Append `'sector_the_bolus'` to the existing Ashfall neighbor patch. Do not drop Eris or Sedna.

Gates use the same bearing as `bearingGate` (`GATE_R = 0.82`, `atan2(dy, dx)` on map cells):

- Charon → Bolus, ang = π/2, radius 4800 → `{x: 0, z: 3936}`.
- Bolus → Charon, ang = −π/2, radius 3200 → `{x: 0, z: -2624}` (the mouth).
- Bolus → Ashfall, dx=2, dy=1 → `{x: 2347, z: 1173}`.
- Ashfall → Bolus, dx=−2, dy=−1, radius 5500 → `{x: -4034, z: -2017}`.

Chart copy, station and contact, never a codex lecture: "Concord files this volume as Lane Contamination. Pilots who come back say Gullet."

Physical row: exactly one ratio differs from Helios. `patrolResponse: 0.55`. Nothing answers a distress call. `rockMass`, `trafficSpeed`, `gravity` stay 1.

Way of life: `signatureToy: 'explicitly none'`. The toy is the room. A kill-machine id would be a lie.

Economy: `primaryRole: 'research'`, `identityKey: 'bolus_swallowed_rib'`, distinct from Sedna and Veil. The station produces `cmdty_medical` at 0.82 (a research berth may produce medical; it may not produce `cmdty_crystal_lumin`, which is mined). Grit still leaves the gut as cargo when a bezoar, cyst, or concretion is cracked — that is `addCargo`, not the regional produce line. Consumes `cmdty_ice_water` 0.66, `cmdty_exotic_amazonite` 0.58, and `cmdty_crystal_silica` 0.42. Not Sedna's signature (quantum cores out; xenium, lumin, helium-3 in). Station type `research` is legal. No new commodity.

Station: **The Swallowed Rib**, services `repair` and `refuel`. The joke is that the machine still works. Local position about `{x: -980, z: -900}`, on the wall road, not in the acid.

Lane contact (the sector must have a named face or the named-face test fails): **Ives of the Swallowed Rib**, id `lane_bolus_rib`, callsign `RIB-BERTH`, role `courier`, ship an existing courier hull, hail something like "Berth's still warm. Don't ask what swallowed the rest of the shift.", `memoryHook: 'bolus-rib-berth'`, `sectorIds: ['sector_the_bolus']`.

Arrival: add `['sector_the_bolus', 'anomaly']` to the generated frontier arrival list in `audioRecipes.js` and the matching class map in `assets/audio/generate-samples.mjs`. That yields `sfx_arrival_the_bolus`, a 1.4s anomaly swell rooted on the hashed bed. Bind it in `SAMPLE_BINDINGS` and `SECTOR_ARRIVAL_CUES`. Add the sample-library row. Run the generator so `assets/audio/arrival/arrival_the_bolus.wav` exists. Do not hand-author a bed; `resolveSectorBed` already hashes unknown ids.

Palette class `viscera`, referenced by the sector card so `paletteClassForSector` returns `viscera` by identity:

- key `0xffb0a8`, rim `0x6a2030`, fill `0x4a1820`, ambient `0x3a2428` (colors only; intensities are not authored here).
- fog `0x14060a`, fogDensity `0.0022`, nebulaTint `0x2a0810`, dust `0x8a4038`.
- Ambient `0x684844` and fill `0xc49890` stay inside the palette luminance band (0.7×–1.3× core). Darkness is the runtime dim plus this fog, not a collapsed palette. Density `0.0022` (not `0.0045`) is the tuned value: the nose cone still owns the read, and the digesting hauler across the road is still a shape instead of a black wall.

Runtime, only while the player sector is the Bolus, after `_updateSectorPaletteTransition`:

- Multiply the live key and ambient intensities down (about 0.28 and 0.35 of whatever the legal profile just set) so the room is dark without failing the lighting-standard test.
- `FogExp2` stays on the viscera fog color. Distance dies. The cone reads.
- A `SpotLight` parented/aimed along the player forward `(cos rot, sin rot)` in XZ, short range, narrow angle, warm-dim, not a sun.
- Hide `spaceBg` while inside. Restore intensities, cone, and starfield on exit.

`interiorHost` sectors return from `_spawnDressingChunks` before palette dressing, everyday kit, wrecks, one-offs, alien-ecology sites, and the machine layer. Stations still spawn from `_spawnStations`. The only population is `materializeBolus`.

## The room (one volume, not three airlocks)

Sector-local coordinates. World spawn converts with `_toGlobal`. Radius 3200. Two roads and a bad decision between them.

**Wall road, x ≈ −700.** The safe-ish line. Cilia give a small +Z assist when the ship is coasting (low speed, not boosting). About 14 static cartilage knobs, mass ~2400, `dynamic: false`, from z=−2000 to z=1400, spaced ~240. Gall-lanterns (slow pulse, no gameplay damage) every third gap. Baleen toll near z=−1600. Nursery pocket of fingerlings just off the road near z=−400. Swallowed Rib at `{−980, −900}`. A swallowed Charon buoy (POI + a dead transponder mesh) near `{−1100, −1700}`. Three valve lips. One immovable stitch-ring. The nerve cord. A hairball of fused scrap near the Ashfall gate `{2000, 900}`.

**Lumen, x ≈ 200 to 700.** The digesting trench.

- Acid is a local hull DOT inside this x-strip only, owned by `tickBolus`, small, continuous. It does not stack on zone radiation, cilia, or peristalsis. One force family: the shove. One damage family: the acid.
- Peristalsis is a periodic +Z (or tract-aligned) shove. A taut Massline on the **tendon** (one named knob, `bolus_tendon`) stalls the shove for one cycle (~12s of sim time) and then the weather resumes. The latch does not delete the weather.
- A digesting hauler sits where the wall road can see it. Its rib is a separate tetherable mass.
- Bezoars: 4 dynamic whip masses, mass 80–240, seeded. Cracking one with a taut line (hold ~1s, once) grants `cmdty_crystal_lumin` via `addCargo`. No new pickup entity type.
- Blind drums: 4. They chase thrust (`player.flags.boosting` or speed above a threshold), not light. Dynamic, throwable, mass ~140.

**Between the roads.** One tooth that uses the knob silhouette and, while the player is taut-latched to it, pulls the ship into the lumen. It is the tutorial for "not every anchor is a friend."

**Mouth.** One glove-tick near the Charon gate. If the player is slow, it nudges them toward the first real knob. If they are fast, it yanks. Polite, then not.

**Tract mites.** Only in the lumen strip. Contact while slow raises `alienEcology.exposure` once and fires one toast. They do not break a working swing.

**Iris.** A volume across the tract near z=400. Most of the sim-time cycle it pushes the player back. During an open window (`simTime % 20 < 6`) it does not. Waiting is legal. Missing costs time, not a fail state.

**Nerve.** A taut latch held ~3s grants `cmdty_live_specimen` once, raises exposure, sets `sectorFlags['bolus:sampled']`. There is no heart. Do not kill anything to get the sample.

**Suture.** A taut latch on a valve for ~1.2s sets `sectorFlags['bolus:valve:<id>']`. That valve's next materialize (and the live entity, swapped in place) becomes a white static suture anchor. Persistent. Not a new schema.

**Exposure sheen.** Time inside raises `ae.exposure` slowly so the existing contamination warnings arm and follow the hull out. Leaving does not scrub it.

**Cone.** Coin-lice scurry in the dark. Inside the nose cone they freeze (velocity zeroed, a flag set). They stay latchable outside the cone. Swapping `physicsBody` every frame is not the design.

Layout jitter (lantern phase, bezoar mass, drum start heading, fingerling scatter) comes from `mulberry32(hash32(seed, sectorId, 'bolus', salt))`. Positions of the road, gates, station, iris, tooth, tendon, and nerve are authored constants so the toy is learnable. Dressing count is fixed, not a random spawn budget.

## Population (this pass spawns all of these)

| Id | Role | Body | Count |
|---|---|---|---|
| `bolus_knob` | cartilage swing anchor | static, mass ≥ 2400 | 14 |
| `bolus_tendon` | the stall latch; looks like a knob, brighter cord | static, mass ≥ 2400 | 1 |
| `bolus_tooth` | false knob; pulls while taut | static, mass ≥ 2400 | 1 |
| `bolus_tendril` | fleshy curtain you swing through | static, mass ≥ 2200 | 8 |
| `bolus_lantern` | gall light, sessile, no damage | static visual | 5 |
| `bolus_fingerling` | nursery, small, flees thrust | dynamic, light | 8 |
| `bolus_louse` | coin-louse, scurries, freezes in the cone | dynamic, light | 10 |
| `bolus_drum` | blind drum, chases thrust, throwable | dynamic ~140 | 4 |
| `bolus_valve` | lip that can be sutured | static, mass ≥ 2400 | 3 |
| `bolus_glove` | mouth handoff | dynamic, heavy enough to yank | 1 |
| `bolus_hauler` | digesting wreck, not a hostile | static dressing body | 1 |
| `bolus_rib` | tetherable rib on the hauler | dynamic ~200 | 1 |
| `bolus_bezoar` | whip mass, grit sample | dynamic 80–240 | 4 |
| `bolus_mite` | slow-contact exposure | dynamic, tiny | 6 |
| `bolus_nerve` | sample cord | static, mass ≥ 2400 | 1 |
| `bolus_ring` | immovable stitch-ring, honest anchor | static, mass ≥ 2400 | 1 |
| `bolus_hairball` | fused scrap near the cough | static, mass ≥ 2400 | 1 |
| `bolus_baleen` | toll: go limp to pass | static, mass ≥ 2400 | 1 |
| `bolus_floater` | gross drifting sac, no attack | dynamic, slow | 6 |

About 76 bodies. All are `type: 'fauna'` with `data.ecology.speciesId`, except the hauler which is a dressing wreck row plus the rib fauna. Meshes are procedural primitives in `faunaVisuals.js` (top-down XZ, existing tissue/glow materials). No skeletal animation. No Vethari mesh. Species rows live in `FAUNA_SPECIES` so labels and builders resolve. They are not added to any `ALIEN_SITES` cast.

Tendrils are the StarCraft-adjacent read: long cylinders and forks in wet red-black, hanging across the gap between the wall road and the lumen, legal Massline endpoints. They are not a creep tile and not a second movement mode.

## Rules (so the tick stays one function)

`tickBolus` returns immediately unless the player sector is `sector_the_bolus`.

Player forward is `(cos rot, sin rot)`. Cone test: distance ≤ 280 and dot(forward, toTarget) ≥ cos(18°).

Taut means an attachment in `state.combat.attachments.byId` with `state === 'active'`, `ownerId` the player, `targetId` the body, and `state.player.tether.phase` in `loaded` | `overload`.

| Flag | Meaning |
|---|---|
| `bolus:sampled` | live specimen already granted |
| `bolus:valve:<id>` | that valve is a suture |
| `bolus:bezoar:<id>` | grit already taken from that bezoar |
| `bolus:mite` | the one mite toast already fired |
| `bolus:peristalsisUntil` | sim time when the stalled shove may return |
| `bolus:irisSeen` | optional, not required for play |

Acid DPS is small (on the order of 2 hull per second). Exposure gain inside is on the order of 0.015 per second, plus a lump on the nerve sample and the mite toast. Do not invent a new meter.

Baleen: if speed is under the limp threshold, no push. If boosting inside the toll radius, a single back-impulse along −forward of the gate approach (+Z blocked). One impulse, not a stun.

Glove: within radius, if slow, add a small velocity toward the first knob; if fast, add a velocity toward the glove. Once per entry is enough; a short cooldown flag on the entity, not a save key.

Drums: if the player is boosting or fast, steer toward the player at species speed. Otherwise a slow seeded wander. A taut latch on a drum does not get extra code; the existing tether throw is the toy.

Fingerlings flee boosting and otherwise mill in the nursery pocket.

Floaters drift on a slow seeded Lissajous around their anchor. They are the "floating gross" layer. They do not chase.

Cilia assist only inside the wall-road x band, only when not boosting and speed is modest. A few world-units per second of +Z. It must not stack into a railgun.

Peristalsis is off during `simTime < bolus:peristalsisUntil`. Otherwise a smooth push of modest magnitude on a ~12s period, applied as velocity, not as a teleport. Stalling requires the tendon specifically, not any knob.

Iris push is velocity away from the plane z=400 when the window is closed and the player is inside the slab. Open window: no push.

Suture swap: when the hold completes, set the flag, set the live entity's species visual tag to the suture builder, `dynamic: false`, and stop tracking the hold. Rematerialize reads the flag and spawns the suture directly.

Toasts use the game's existing toast/bark channel if one is already imported by world or ecology. One line each: mite ("Something thin is on the line."), nerve ("The cord gives. Concord will call it a specimen."), suture ("The lip keeps the stitch."), bezoar ("Grit. The gut wouldn't keep it."). If no toast helper is reachable without a new UI system, set a one-line `state.player` or ecology notice the existing contamination UI already surfaces, and do not build a widget.

## Catalog (the 50, plus both reviews)

Ranked so a later pass can pick up without relitigating. **Ship** means this pass. **Hold** means designed and not built. **Cut** means rejected on purpose.

### Ship (the playable room)

1. Interior host. No asteroid belt, no kit, no wreck scatter, no ecology site, no machine layer.
2. Viscera fog so distance dies.
3. Runtime dim of key and ambient after the legal palette lerp.
4. Nose-cone spotlight along ship forward.
5. Starfield hidden inside.
6. Charon mouth and Ashfall cough, reciprocal gates.
7. Cartilage knob road, static Massline anchors.
8. Cilia coast assist on that road.
9. Gall lanterns.
10. Baleen toll: go limp or get shoved.
11. Fingerling nursery.
12. The Swallowed Rib, repair and refuel, still working.
13. Swallowed Charon buoy.
14. Three sutureable valves.
15. Immovable stitch-ring.
16. Nerve cord, one live specimen, no heart.
17. Hairball at the cough.
18. Lumen acid DOT, local, unstacked.
19. Peristalsis shove stalled one cycle by a taut tendon.
20. Digesting hauler visible from the safe road, tetherable rib.
21. Bezoars as whip masses and one grit grant each.
22. Blind drums that chase thrust and can be thrown.
23. False tooth that pulls while taut.
24. Coin-lice that freeze in the cone and scurry in the dark.
25. Glove-tick: nudge if slow, yank if fast.
26. Line mites: one exposure toast, they do not cut the line.
27. Iris breath window. Waiting is legal.
28. In-place suture, persistent via sectorFlags.
29. Exposure that follows you out.
30. Named face: Ives.
31. Anomaly arrival sting on the hashed bed.
32. Research economy that is not Sedna's signature.
33. Patrol response 0.55 and no pirates.
34. Seeded layout, authored toys.
35. Fleshy tendril curtains as real swing anchors.
36. Gross floaters on slow drifts.

### Hold (the other ideas, fleshed out, not this pass)

37. Scar-chart UI that remembers sutures as ink on the nav map.
38. Cone-inked chart: the spotlight briefly writes a ghost blip.
39. Chime knobs: a taut pass rings a pitch so a blind pilot can hear the road.
40. Painted glints: old crew marks that only resolve inside the cone.
41. Spore bait: dumping the live specimen calms the drums for one cycle.
42. Scurrier wedge: lice that only move as a flock when one is latched.
43. Suture-pin safe lane: two sutured valves open a third, wider coast.
44. Exit swing through the wound lip at the Ashfall gate, a speed bonus if you release on the beat.
45. Pearls: a second grit tier inside one bezoar if you don't whip it, only reel.
46. Transponder metronome on the Charon buoy, an audio click in time with the iris.
47. Heartbeat slipstream. Cut as a third stacked force; if it ever returns it replaces peristalsis, it does not add to it.
48. Directional teeth: a row of teeth whose pull depends on which face you latched.
49. Scrape scent: brushing a tendril wakes the nearest drum.
50. Clear the lens: acid in the lumen fogs the cone until you scrape a tendril.
51. Sever the relay: a optional cut that lowers exposure gain and blinds the lanterns. Not a Vethari organ.
52. Berth decision: Ives will buy the specimen or tell you to keep it. A conversation, not a new shop screen.
53. Overhold tears the hook: holding a valve past the suture window strains the Massline (existing strain, not a new meter).
54. Orbiting bone: one rib on a slow circle the swing can steal.
55. Bone versus fungal cord: two visually distinct anchor materials with the same physics, so the player learns by silhouette.
56. One-shot crane: the stitch-ring plus a bezoar as a pendulum that reaches the hauler rib.
57. Seal versus hot sample: suturing the nerve's valve first denies the specimen. A real choice, easy to soft-lock, so it waits.
58. Abandoned rope calcifies: a tether left attached when you jump becomes a suture on return. Needs jump-hook care.
59. Death cyst as a respawn pocket. Needs a death-flow change.
60. Limp cough exit: arriving at the Ashfall gate under the limp threshold skips the last shove.
61. Vending lozenge from the Rib. Would be a new commodity. Not this pass.
62. Two careers: salvager who whips bezoars versus courier who never enters the lumen. A scoring fantasy, not a system.
63. Scar grain on the walls as extra visual dressing beyond the tendrils.
64. Membrane that changes Massline release grade. That is a second reading of the tether. Later, if ever.
65. Rival salvager who flies the same road. An AI pilot in this room is a project of its own.
66. Migrating mouth. The graph stays put.
67. Cleanliness certificate, motion-tracker gadget, oxygen clock, camera zoom, wall gravity, monofilament cutter. All rejected by review: they are new engines or they punish the camera.

### Cut (do not resurrect without a new design pass)

- A boss heart, a face, a Vethari mesh, a named god in the HUD.
- Recoloring Ashfall or Veil and calling it the body.
- Three airlocked rooms.
- Cone-only anchors (physics body swapped per frame).
- Constant tether grief.
- Stun-all-fauna.
- Deleting peristalsis as a reward.
- Wall gravity, involuntary camera punch, a new scanner gadget, an oxygen suffocation clock.
- A second grapple.
- Putting the sector inside a frontier cluster file.

## Why this is the fun

The skill is the line. The safe road teaches swing-to-swing on honest knobs, with cilia doing half the work if you coast. The tooth teaches doubt. The lumen teaches commitment: acid, drums that wake when you boost, bezoars worth a whip, a tendon that buys you one quiet cycle. The iris teaches patience in a game that otherwise rewards throttle. The nerve and the valves teach that the line is also a decision (take the sample, stitch the lip) and that the room remembers. The cone teaches looking. Nothing is a hit-point sponge. Nothing asks for a new button.

A first visit is about ten to eighteen minutes if the player explores, shorter if they sprint the wall road and cough out at Ashfall. Sprinting is legal. It is worse.

## File map

New:

- `design/alien-ecology-program/16_THE_BOLUS.md` (this file).
- `src/data/theBolus.js` — palette, card fields, anchors, zones, authored layout, pure cone/iris/hold helpers. No import of `sectors.js`.
- `src/systems/theBolus.js` — `materializeBolus(world, sector, active)`, `tickBolus(world, dt)`.
- `src/render/marrowCone.js` — ensure and sync the spot; restore on exit.
- `test/the-bolus.test.mjs` — graph links, bearing gates, layout determinism, cone math, iris window, sample-once, suture flag, exactly-one physical delta, interiorHost, no hostile zone presence.

Edited:

- `design/alien-ecology-program/README.md` — link this doc.
- `src/data/sectors.js` — `SECTOR_PALETTE_CLASSES.viscera`, append the card after frontier sectors, before the anchor map.
- `src/data/frontierRegions/index.js` — Charon and Ashfall neighbor and gate patches. Not `FRONTIER_SECTOR_IDS`.
- `src/data/sectorAnchors.js` — spread Bolus anchors into `SECTOR_ANCHORS`.
- `src/data/sectorCoordinates.js` — origin and `CORRIDOR_SECTOR_IDS`.
- `src/data/sectorZones.js` — three zones, no presence: wall road (`anomaly_deep`), lumen (`radiation_field`), cough (`derelict_field`). Security and two anomaly-class zones let `familyFor` land on `anomaly_research` without pirate spawns. `radiation_field` is a label only; damage is the tick's acid, not the hazard stack.
- `src/data/sectorPhysical.js` — the one row.
- `src/data/sectorCompositions.js` — focus on the Rib, empty fields, motif that does not assume an asteroid belt.
- `src/data/sectorWayOfLife.js` — one row, signatureToy `explicitly none`.
- `src/data/regionalEconomyProfiles.js` — one profile.
- `src/data/laneContacts.js` — Ives, before the closing of `NAMED_LANE_CONTACTS`.
- `src/data/alienFauna.js` — species rows. No site.
- `src/render/faunaVisuals.js` — builders.
- `src/systems/world.js` — early-out in `_spawnDressingChunks`; `tickBolus` beside `tickAlienEcology`.
- `src/render/renderer.js` — cone sync immediately after `_updateSectorPaletteTransition`.
- `src/data/audioRecipes.js`, `assets/audio/generate-samples.mjs`, `src/audio/sampleLibrary.js` — arrival.
- Sector-count assertions that mean "the whole galaxy", from 24 to 25. Not forecast points, loot captures, or other incidental 24s.

`theBolus.js` layout helper is the single source for both the spawner and the test. The test does not boot Three.

## Test bar

- `SECTORS.length === 25`, reachable from Helios is 25, origins include the Bolus, way-of-life and economy id sets match.
- Charon and Ashfall list the Bolus as a neighbor; the Bolus lists both; gate positions match the bearings above.
- Two `planBolusLayout` calls with the same seed return deep-equal lists. Two seeds differ.
- Cone helper accepts a point on the forward ray inside range and rejects a point behind the ship and a point outside the angle.
- Iris helper is closed at t=0 and open at t=3 (period 20, closed phase first: open when the cycle is in `[2, 8)`).
- Sample grant flips `bolus:sampled` and a second call does not add cargo.
- Suture flag replaces a valve id in the spawn list.
- `differingPhysical('sector_the_bolus')` is exactly `['patrolResponse']`.
- No zone on the Bolus has a hostile presence.
- Arrival cue id exists and the wav file exists after generation.
- Focused existing suites: geography, physical, way of life, economy, ecology fingerprint uniqueness, named faces, map reachability, arrival identity.

## Expansion pass (creative review, ship +12)

Catalog rows 1–36 stay the room. This pass adds twelve latch toys on top of them (more than +20%), not a new engine. Same tick, same flags, same three commodities (`cmdty_live_specimen`, `cmdty_crystal_lumin`, `cmdty_medical`). No soft-lock, no required kill. Catalog numbers 37 and up stay Hold or Cut. These twelve are ship as well:

B1. Gall blister at `{-840, -1280}`. Taut 2s once sets `bolus:blister` and grants 1 medical. Static mass 2400.
B2. Milk cyst at `{-860, -240}`. Taut 1.2s once sets `bolus:cyst` and grants 1 phosphor crystal. Dynamic mass 100, still throwable after.
B3. Polyp dressing at `{-300, 160}`. Taut 3s once sets `bolus:polyp`, grants 1 medical, adds 0.05 exposure.
B4. Cough concretion at `{1680, 820}`. Taut 1s once sets `bolus:concretion` and grants 1 phosphor crystal. Dynamic mass 120.
B5. Sour papilla at `{40, 520}`. Taut 1s once sets `bolus:papilla`. While set, the tooth's pull is halved. The tooth still lies.
B6. Iris hush at `{-560, 400}`. Taut 2s sets `bolus:hushUntil` to simTime+12. The iris push is skipped until then. A later latch after expiry refreshes it. Waiting for the breath still works.
B7. Drum spur at `{640, 80}`. Taut 0.8s sets `bolus:spurUntil` to simTime+6. Drums within 450 of the spur stop chasing and zero their velocity. They stay throwable.
B8. Mouth frenum at `{-240, -2300}`. Taut 1s sets `bolus:frenumUntil` to simTime+12. While it holds, the glove only nudges. It does not yank.
B9. Filter comb at `{980, 640}` (outside the acid strip). Taut 1.5s sets `bolus:acidQuietUntil` to simTime+8. Acid damage pauses. Exposure does not.
B10. Road uvula at `{-40, 880}`. After 0.4s taut, each tick adds about 6 units/s of velocity toward x=−700, and only while the line is held.
B11. Louse crook at `{480, -1680}`. After 0.4s taut, lice within 220 freeze until the line drops. They stay latchable.
B12. Tract pleat at `{-240, 1280}`. Taut 0.5s applies one +Z impulse of 14 and sets `bolus:pleatUntil` to simTime+9. No second cough inside the window. This is the only new impulse.

Additional hold, not built:

- Bile compass: the cone rim warm-biases toward the nearest uncracked bezoar. A shader read, not a tick.
- Medical film: spending a carried medical suppresses acid for one peristalsis cycle. That is cargo consumption, not only `addCargo`.
- Witness frost: a louse that froze in the cone leaves a floor decal. A decal pass, not a fauna flag.
- Rib debt: a rib that overlaps the Ashfall gate despawns and Ives's later hail mentions the missing bone. A contact branch.

Reviewers treat catalog 1–36 plus B1–B12 as the ship set. Hold and cut stay unbuilt.

## Review rule


Implementation review judges this ship set and whether the code does it cleanly. A missing ship row is a defect. A Hold or Cut row is not a defect. "Flesh out the other 50" means the Hold list stays written, specific, and unbuilt. It does not mean those systems land in this pass.

## Play pass — thirty beats (what the research said was fun)

Space games stay fun when the pilot is small and the dark has rules. Outer Wilds makes knowledge the only souvenir. FTL makes the ship's own rules the story. Roadside Picnic and S.T.A.L.K.E.R. teach a zone with the tool you already carry — here that tool is the Massline plus the nose light. Alien: Isolation telegraphs. Subnautica uses light as a path. A toy, not a score. Omission does the talking. No new grapple, no camera punch, no face, no second fungus, no new commodity, no oxygen clock.

This pass does not retune the force table. Crests, the tooth yank, the iris bump, the baleen shove, and the drum pin stay as tested. The new work is laws you can learn, and a few bodies that make those laws visible.

1. First entry says the chart line once. Concord's name, not a lecture.
2. Coming back with a stitch already in says the stitches held.
3. The first taut knob says the wall holds.
4. The first step into the trench says it is wet. Damage is unchanged.
5. The first closed iris says it is shut and that it breathes.
6. The first tooth yank says not every anchor is a friend.
7. The first time the cone pins a louse, mite, or fingerling, the light is named.
8. The first time a drum commits to a chase, you are told it heard the burn. The cone still pins it. That test stays.
9. Exposure 0.25: a film on the glass.
10. Exposure 0.50: the film has a pulse.
11. Exposure 0.75: you will carry this out. No new meter.
12. Walking the iris slab during a hush says you walked a closed mouth.
13. While the comb has quieted the trench, the tooth does not yank. One line. The tooth still lies after the quiet ends.
14. Three sutures halve acid. One line. The trench goes shy. It does not stop.
15. Sampling the nerve while the iris is open sheds half that sample's exposure. One line.
16. Cracking a bezoar inside the cone flashes a three-second hush if you do not already have a longer one. One line.
17. A taut swing anchor pauses acid: knob, tendril, valve, suture, ring, lip. Letting go is how the trench eats.
18. A taut stitch-ring pauses exposure gain. One line. The berth rule is untouched.
19. The pearl pays one medical only if exposure is under 0.30. If you are filmed, it refuses and does not spend itself.
20. The scale on the hauler, held a second and a half, names the wreck. No cargo. The rib is still the throw.
21. Three lanterns mark the Charon mouth so the way in is a light, not a guess.
22. A cough lip near the Ashfall gate is a real swing anchor. No speed bonus.
23. Four lumen motes flee the cone and mill in the dark. They do not attack and they are not pinned like lice.
24. The pearl is a body at the far end of the wall road.
25. The scale is a body on the hauler.
26. Letting go of the lip counts as a swing, so the cilia do not grab you for the same window as a knob.
27. Letting go of the ring counts as a swing for that same window.
28. `bolusFilmBeat` is pure.
29. `bolusAcidScale` is pure.
30. `bolusPearlOpens` is pure.
31. The first loaded hold on the cough lip, while the trench is armed, says the lip only holds still for a hand that isn't lying. No extra impulse. An overload cable does not get the line.
32. While a hush is up, the first taut knob repeats the chart line once. A reread, not a second lesson.

A rising trench and a warm wall that grips were refused. Both retune the force table. The pearl still reads exposure, not a second frost bit.

Still refused: a boss, a face, a second line, a camera hit, an oxygen clock, wall gravity, a new commodity, a rival pilot, a migrating mouth.

