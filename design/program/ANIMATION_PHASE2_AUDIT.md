# Phase-2 motion audit — how everything moves

Post ANI-01…15. What moves in SpaceFace today, what events drive it, where authored
rigs still beat procedural motion, and the 20-job second wave (ANI-16…ANI-35).

## 1. Motion layers that already exist

| Layer | Coverage |
|---|---|
| `shipMicroMotion.js` | Weapon-fire recoil, barrel stroke, turret target tracking + idle sweeps, blackbody heat fins, forced venting |
| `infrastructureMotion.js` | Jump-gate containment rings + portal warp, station centrifuge/hab rings, sweeping dishes, dock chase lights, derelict tumble + vent puffs + arc faults, two-sided dock pulse |
| `asteroidMotionPresentation.js` | Per-asteroid 3-axis tumble, mining thermal jitter, impact wobble, depletion strain swell |
| `ordnanceMotionPresentation.js` | Bomb/mine/charge/beacon/payload body language — tumble, fuze strobe, heartbeat |
| `dockingCradle.js` | Holographic berth pad — ring, acquisition brackets, chevrons |
| `masslinePresentation/swingTrace/releaseArc` | Tether/massline cable surfaces, swing trace, release arc |
| `npcJobSignatureVfx.js` | Working-light signatures per job kind/phase on NPC ships |
| `stationSideEventVfx.js` | Station side-operation poses (hauler_dock etc.) |
| `rcsJets.js`, `engineTrailSurfaces`, `thruster/` | RCS puff jets, drive trails, thruster flames |
| `authoredMotion.js` + `motionBank.js` | 9 sealed Blender-rig banks: kestrel (dish, mining head, iris, pod arm, armor cap, hatch), yard-tug winch, salvage-cutter jaw/rams, mining-drone drum, cargo-pod breach doors/locks/retainers, fab weld arms + crane, jump-ring emitters, wasp bow/aft fragments |

Already good: anything heat/recoil/thrust-adjacent, dust/ambient particles, asteroid bodies,
ordnance, cable physics, dock holograms.

## 2. Event → motion map (what the ~450 bus events move)

**Covered by authored clips:** mining:start/stop, beam:denied, salvage:* extraction chain,
tether:* reel/latch, service:* arm jobs, combat:damage cap peel, ship:boost* iris, scan:pulse,
gate:range, jump:chargeStart, craft:queueChanged, hull:fractured, drone:grind*.

**Covered procedurally:** ship:thrust/boost/dash (thruster+trail), combat:fire (recoil/turret),
dock:docked (holo cradle + pulse), massline:* (cable), mining ticks (asteroid wobble),
bombs/mines (ordnance layer), npcJobs phases (signature light).

**Dead motion surface (HUD/toast only — the audit's target):**

- `dock:docked`/`undocked` on the *ship* side — the pad glows but the player's hull never
  visibly seats. No landing struts, no canopy service cycle.
- `service:started/progress/completed` — invisible repair inside dock interiors.
- `drill:start/warn/spark/break/gasHit` — drill-platform is a static model.
- `ai:telegraph` (6 emitters), `encounter:telegraph`, `capitalBoss:telegraphEnd` — enemies
  telegraph only in combat log; no posture change on the hull.
- `ai:flee`, `ai:stateChange`, `encounter:predationEngaged` — no visual crouch/flee shift.
- `traffic:*`, `npcjobs:minerRelocated/yardDispatch`, `freight:custody*` — ore barges,
  conveyor barges, freight platforms never move their loading hardware.
- `interdiction:triggered` — the buoy is static at the most dramatic moment.
- `survivorPod:ejected` — pod pops into existence, no tumble/beacon.
- `asteroid:chunked`/`asteroid:destroyed` — rocks split with no authored fracture pieces.
- `massSeed:deployed/locking/locked` — the deploy anchor is static.
- `cruise:charging/snared/dropped`, `cloak:engaged/dropped` — drive state invisible on hull.
- `salvage:coreEjected/reactorVented`, `planet:harvest/collector` — no eject/collect motion.
- `lawfulInspection:choose`, `customs:*` — inspection cutter never extends its arm.
- Idle life: `nav-buoy`, `lane-beacon`, `memorial-array`, `resonant-cathedral`,
  `candle-fleet` — static landmark bodies on every lane.

## 3. NPC / enemy idle inventory

NPC ships reuse the player-hull model family via faction-variant pilots
(`wasp`, `wasp-free-militia`, `wasp-mts-escort`, `wasp-scn-patrol`, plus per-faction
liveries on shared forge builders). Archetypes observed:

- **Patrol/screen** (patrol-beat, vael-station-screen): formation loops, signature light
  only — hulls never articulate. Telegraphs are log-only.
- **Working NPCs** (npcJobs: miner, repair rig, hauler, yard dispatch): waypoint cycles
  with signature VFX; no mechanical motion on ore-barge / conveyor-barge / yard hardware.
- **Raiders/pirates**: ambush spawns with predation events — no posture/weapon-deploy cue.
- **Capital boss**: telegraph/end events exist; the boss body has no dedicated rig.
- **Traffic**: passenger liners, freighters — pure motion paths, zero articulation.

## 4. The leverage insight

Player hulls are COMPOSED from shared parts (`parts_manifest.json`: cockpits, engines,
fins, greebles). One rig on `engine-vector`/`engine-ion-*` nozzle pivots articulates
**every hull that mounts that part** — the single highest-leverage authored-motion job.

## 5. Phase-2 slate — 20 jobs

Group A (clips on existing banks, cheap): ANI-16 kestrel dock struts, ANI-17 kestrel
canopy/hatch service cycle, ANI-18 kestrel damage flinch, ANI-19 jump-ring idle ring
roll + charge surge, ANI-20 fab crane work-idle sway, ANI-21 yard-tug hook idle dangle,
ANI-22 mining-drone drum coast/vane idle, ANI-23 salvage-cutter jaw idle micro-chomp,
ANI-24 cargo-pod drift wobble on jettison.

Group B (new rigs): ANI-25 dock-interior berth clamps + umbilical, ANI-26 drill-platform
drill head feed/spin, ANI-27 lane-beacon + nav-buoy beacon life, ANI-28 ore-barge loading
claw, ANI-29 freight-platform gantry crane, ANI-30 inspection-cutter boarding arm,
ANI-31 wasp telegraph brace + winglet deploy (covers patrol variants), ANI-32 survivor-pod
eject tumble + beacon, ANI-33 interdiction-buoy petal unfold, ANI-34 mass-seed deploy
arms, ANI-35 shared engine-part nozzle gimbal (all hulls).

## 6. A-list bar

Independent review gates the wave: visible mechanical articulation on every ship class
the player sees up close, event-driven purpose (no gratuitous idle wiggles — every clip
answers an event or a legible machine duty), and zero dead surface in the
dock → undock → fight → work loop.
