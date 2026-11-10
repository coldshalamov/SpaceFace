// Row 85 — PB-MIS-D (SF-140 + SF-143 + SF-147): the heist trio as player-facing physics.
//
//   SF-140  launch-window depth — ordinary lawful transfers fly the same launcher on a real
//           cadence whether or not a contract is booked; schedule/receiver knowledge is LEARNED
//           by scanning the real object, following a real hull, or watching a real throw, and
//           learned knowledge earns an earlier countdown cue; a stolen routine capsule reports
//           through the law owner and pays nobody.
//   SF-143  the counterweight scene — a real gate across a real corridor that opens only while
//           a qualifying mass rests settled on its cradle, a yard tug that physically walks two
//           sealed crates through it, honest partial-manifest settlement through the ordinary
//           mission owner, and a deterministic body snapshot across the sector boundary.
//   SF-147  the monitored escape — Concord posts physically pulse the stolen lane, hard knocks
//           shed real sealed-unit pods, voluntary leave suspends the SAME load and voluntary
//           return re-embodies it, and the fence pays for the units that actually arrive.
//
// Every count below is wired to a REAL emission or a real body — bus receipts, the law owner's
// ledger, live entities, the credit ledger — never a flag.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { missions } from '../src/systems/missions.js';
import {
  COUNTERWEIGHT_SCENE,
  HOT_RETURN_MONITORS,
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  PQ019_OBSERVE,
  PQ019_ROUTINE,
} from '../src/data/heistFacilities.js';
import {
  COUNTERWEIGHT_WATCH_TYPE,
  COUNTERWEIGHT_WATCH_TUNING,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
  buildHeistOffer,
} from '../src/data/heistMission.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { forEachDressingRow } from '../src/world/dressingTable.js';

const AWAY_SECTOR_ID = 'sector_helios_prime';

const SYSTEMS = [
  physics, world, heistFacilities, flightV3, combat, lawSecurity, heat, npcJobsRuntime,
  missions,
];

function spawnPlayer(sim, pos = { x: 0, z: 0 }) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  sim.state.playerId = player.id;
  return player;
}

async function scene({ seed = 19085 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'proven against the production Rapier owner');
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = spawnPlayer(sim);
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  // The enter generator places the player at the sector entry point on its first tick; let the
  // placement land before any test parks the player somewhere it means to observe from.
  sim.step(SIM_DT);

  const missionsSys = sim.registry.get('missions');
  const combatSys = sim.registry.get('combat');
  const facilities = sim.registry.get('heistFacilities');
  const law = sim.registry.get('lawSecurity');

  const events = [];
  for (const name of [
    'heist:routineReceipt',
    'heist:observed',
    'heist:launchCue',
    'heist:counterweight',
    'heist:monitorScan',
    'heist:shipmentUnit',
    'heist:counterweightSceneReceipt',
    'heist:missionCue',
    'mission:completed',
    'mission:failed',
    'economy:grantCredits',
  ]) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }

  const t = {
    sim, state, bus, player, missionsSys, combatSys, facilities, law, events,
    attachments: () => combatSys.kernel.attachments,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    stepUntil(pred, max = 6000) {
      for (let i = 0; i < max; i++) { t.step(1); if (pred()) return true; }
      return false;
    },
    byName(name) { return events.filter((e) => e.name === name).map((e) => e.payload); },
    cw() { return state.heistFacilities?.counterweight; },
    cwEvent(ev) { return t.byName('heist:counterweight').filter((p) => p && p.event === ev); },
    routineCapsule() {
      return (state.entityList || []).find((e) => e?.alive !== false
        && e.type === 'payload' && e.data?.heistRoutine === true) || null;
    },
    capsule() {
      return (state.entityList || []).find((e) => e?.alive !== false
        && e.type === 'payload' && e.data?.heistFacilityRole === 'cargo_capsule') || null;
    },
    unitPods() {
      return (state.entityList || []).filter((e) => e?.alive !== false
        && e.type === 'payload' && e.data?.heistUnit === true);
    },
    sceneBody(stableId) {
      return (state.entityList || []).find((e) => e?.alive !== false
        && e.type === 'payload' && e.data?.counterweightStableId === stableId) || null;
    },
    crew() {
      return (state.entityList || []).find((e) => e?.alive !== false
        && e.data?.counterweightCrew === true) || null;
    },
    mission() {
      return (state.missions.active || []).find((m) => m && (m.heist || m.counterweight)) || null;
    },
    head(facilityId) {
      return (state.entityList || []).find((e) => e?.alive !== false
        && e.data?.heistFacilityRole === `${facilityId}_head`) || null;
    },
    /** Put the player ship on a point — proximity IS the affordance's whole input. */
    parkPlayerAt(pos) {
      player.pos.x = pos.x;
      player.pos.z = pos.z;
      if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
    },
    /** Park the authored ballast body dead-settled on the cradle. */
    holdCradle() {
      const ballast = t.sceneBody(COUNTERWEIGHT_SCENE.ballast.stableId);
      assert.ok(ballast, 'the ballast body exists');
      const world = sectorLocalToGlobalForSector(COUNTERWEIGHT_SCENE.cradle.pos, PQ019_HEIST_SECTOR_ID);
      ballast.pos.x = world.x;
      ballast.pos.z = world.z;
      if (ballast.vel) { ballast.vel.x = 0; ballast.vel.z = 0; }
      return ballast;
    },
  };
  return t;
}

// ── SF-140(a): the launcher has an ordinary working life ───────────────────────────────────────

test('SF-140(a) a routine transfer launches on cadence and the catcher consumes lawful freight for nothing', async () => {
  const t = await scene();
  const firstDelay = PQ019_ROUTINE.firstLaunchDelayS;
  assert.ok(t.stepUntil(() => t.routineCapsule() !== null, Math.ceil(firstDelay * 60) + 120),
    'with no contract booked, the launcher still throws freight');

  const capsule = t.routineCapsule();
  assert.equal(capsule.data.heistRoutine, true, 'it is marked ordinary freight, not a mission load');
  assert.equal(capsule.data.shipmentUnits, 0, 'logged freight carries nothing separable');
  assert.ok(capsule.data.launchScheduleId.startsWith(PQ019_ROUTINE.schedulePrefix),
    'its schedule id is the routine family — never a contract id');

  const owned = t.state.heistFacilities;
  const nextAt = owned.routine.nextLaunchAtSimT;
  assert.ok(nextAt > t.state.simTime, 'the next throw is already on the cadence');
  assert.ok(Math.abs((nextAt - t.state.simTime) - PQ019_ROUTINE.cadenceS) < 2,
    'the next cadence slot is the authored 240 s, not a jittered value');

  // The Concord catcher physically takes custody: one impact, one receipt, the body is consumed.
  const catcher = t.head('lawful_catcher');
  assert.ok(catcher, 'the lawful catcher head exists');
  capsule.pos.x = catcher.pos.x;
  capsule.pos.z = catcher.pos.z;
  t.bus.emit('physics:impact', {
    tick: (t.state.tick | 0) + 1, aId: capsule.id, bId: catcher.id, dp: 40,
    pos: { x: catcher.pos.x, z: catcher.pos.z },
  });
  const caught = t.byName('heist:routineReceipt').filter((r) => r && r.kind === 'routine_caught');
  assert.equal(caught.length, 1, 'one lawful catch receipt');
  assert.equal(t.routineCapsule(), null, 'the freight is consumed by custody — not drifting as a prop');
  assert.equal(t.byName('economy:grantCredits').length, 0, 'legitimate freight pays nobody');
  assert.equal(t.byName('mission:completed').length, 0, 'nothing settled a contract that does not exist');
});

// ── SF-140(b): knowledge is earned from the physical world ────────────────────────────────────

test('SF-140(b) scanning the real head, watching a real throw, and following a real hull teach durable facts', async () => {
  const t = await scene();
  const facilities = t.facilities;

  // 1. Scan the launcher head — the pulse physically covered the machine. The player holds
  //    station off the head's collider, never inside it: dead-centre parking is a concentric
  //    spawn and the physics owner answers it with the documented megawu fling.
  const launcher = t.head('heist_launcher');
  assert.ok(launcher, 'the launcher head exists');
  t.parkPlayerAt({ x: launcher.pos.x + 60, z: launcher.pos.z });
  t.bus.emit('scan:completed', { sectorId: PQ019_HEIST_SECTOR_ID });
  const observations = facilities.heistObservations();
  assert.ok(observations.launcher_schedule, 'the schedule was learned from the real object');
  assert.equal(observations.launcher_schedule.method, 'scan');
  assert.ok(observations.catcher_receiver && observations.fence_receiver === undefined
    || observations.launcher_schedule,
    'the learned table is the durable record');

  const observedEvents = t.byName('heist:observed');
  assert.ok(observedEvents.some((e) => e.fact === 'launcher_schedule' && e.method === 'scan'),
    'the observation receipt is emitted, not just stored');

  // First writer wins — a second scan does not re-announce knowledge already had.
  const before = observedEvents.length;
  t.bus.emit('scan:completed', { sectorId: PQ019_HEIST_SECTOR_ID });
  assert.equal(t.byName('heist:observed').length, before, 'knowledge is never re-learned');

  // 2. Follow the yard tug inside the follow radius — proximity accrues the crew-route fact.
  //    Shadow at a standoff, not concentric with the working hull.
  const crew = t.crew();
  assert.ok(crew, 'the yard tug exists for the follow affordance');
  for (let i = 0; i < PQ019_OBSERVE.followTicks + 10; i++) {
    t.parkPlayerAt({ x: crew.pos.x + 80, z: crew.pos.z }); // shadow the hull — it may drift
    t.step(1);
    if (facilities.heistObservations().crew_route) break;
  }
  assert.ok(facilities.heistObservations().crew_route,
    'following the working hull taught its route');
  assert.equal(facilities.heistObservations().crew_route.method, 'follow');

  // 3. Watching a real launch teaches the same schedule fact — on a fresh scene where it is
  //    not already learned, the watch alone earns it.
  const t2 = await scene({ seed: 19086 });
  const owned2 = t2.state.heistFacilities;
  owned2.routine.nextLaunchAtSimT = t2.state.simTime + 2;
  // Hold station inside the watch radius of the launcher — beside the head, never concentric
  // with its collider (that is the documented megawu separation answer).
  const launcher2 = t2.head('heist_launcher');
  t2.parkPlayerAt({ x: launcher2.pos.x + 150, z: launcher2.pos.z });
  assert.ok(t2.stepUntil(() => t2.routineCapsule() !== null, 600),
    'the routine throw happened under observation');
  assert.ok(t2.facilities.heistObservations().launcher_schedule,
    'watching the throw IS the schedule lesson');
  assert.equal(t2.facilities.heistObservations().launcher_schedule.method, 'watch');
});

// ── SF-140(c): a learned schedule buys an earlier warning — and a theft is honest ─────────────

test('SF-140(c) learned cadence speaks early, and a stolen routine capsule reports to law and pays nobody', async () => {
  const t = await scene();

  // Learn the schedule the fast honest way (the scan), then wait for the early cue.
  // Hold station beside the head — dead-centre is a concentric spawn the solver answers with
  // the documented megawu fling, and the wreck takes the facility heads with it.
  const launcher = t.head('heist_launcher');
  t.parkPlayerAt({ x: launcher.pos.x + 60, z: launcher.pos.z });
  t.bus.emit('scan:completed', { sectorId: PQ019_HEIST_SECTOR_ID });
  assert.ok(t.facilities.heistObservations().launcher_schedule);

  const owned = t.state.heistFacilities;
  // Next throw inside the learned window — the early line must fire BEFORE the throw.
  owned.routine.nextLaunchAtSimT = t.state.simTime + PQ019_OBSERVE.earlyWarningS - 1;
  assert.ok(t.stepUntil(() => t.byName('heist:launchCue')
    .some((c) => c.cueId && c.cueId.includes('routine:early')), 300),
    'the learned cadence spoke its earlier warning');
  const early = t.byName('heist:launchCue').find((c) => c.cueId.includes('routine:early'));
  assert.ok(early.text.includes('cadence') || early.text.includes('routine'),
    'the early line says what it is, in words');
  assert.ok(t.state.simTime < owned.routine.nextLaunchAtSimT + 1,
    'it warned before the throw, not after');

  // Wait for the throw, then anchor lawful jurisdiction ON THE LANE: the theft report is judged
  // from the capsule's real position, so the customs post must stand inside its own protection
  // ring of the incident and close enough to witness it — a sector-local {0,0} is ~15,000 WU
  // off the tethys lane and correctly fails to shield a crime it cannot see.
  assert.ok(t.stepUntil(() => t.routineCapsule() !== null,
    Math.ceil(PQ019_OBSERVE.earlyWarningS * 60) + 120),
    'the routine capsule is away');
  const capsule = t.routineCapsule();
  t.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: capsule.pos.x + 300, z: capsule.pos.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  const heatBefore = t.state.player.heat;
  t.bus.emit('tether:latched', { targetId: capsule.id });
  assert.ok(t.state.player.heat > heatBefore,
    'a witnessed theft of lawful freight raises WANTED through the law owner');
  assert.equal(t.byName('economy:grantCredits').length, 0, 'stolen freight pays nobody');
});

// ── SF-143(a): the yard is real before any contract ───────────────────────────────────────────

test('SF-143(a) the transfer yard materializes: cradle, door collider, ballast, crates, tug', async () => {
  const t = await scene();
  const cw = t.cw();
  assert.ok(cw, 'the counterweight state exists');

  const door = (t.state.entityList || []).find((e) => e?.alive !== false
    && e.data?.heistFacilityRole === 'counterweight_door');
  assert.ok(door, 'the gate door is a real body');
  assert.equal(door.collides, true, 'a closed gate is a wall, not a decal');
  assert.equal(door.physicsBody && door.physicsBody.dynamic, false, 'kinematic steel');

  const ballast = t.sceneBody(COUNTERWEIGHT_SCENE.ballast.stableId);
  assert.ok(ballast, 'the ballast block is staged');
  assert.ok(Number(ballast.mass) >= COUNTERWEIGHT_SCENE.cradle.minMass,
    'the ballast qualifies as a counterweight by mass');
  for (const def of COUNTERWEIGHT_SCENE.crates) {
    assert.ok(t.sceneBody(def.stableId), `crate ${def.stableId} is staged`);
  }
  assert.ok(t.crew(), 'the yard tug is parked');

  const roles = [];
  forEachDressingRow(t.state, (row) => { if (row.data?.heistFacilityRole) roles.push(row.data.heistFacilityRole); });
  assert.ok(roles.includes('counterweight_cradle') && roles.includes('counterweight_pad'),
    'cradle and receiver pad are visible scenery');

  assert.equal(cw.gate, 'closed', 'the gate starts shut — nothing holds the cradle');
});

// ── SF-143(b): the gate answers the balance, and the tug works through it ─────────────────────

test('SF-143(b) arming the watch: the cradle opens the gate, the tug walks a crate through, the pad logs it', async () => {
  const t = await scene();
  const facilities = t.facilities;
  const cw = t.cw();

  const reply = facilities.requestCounterweightScene({ sceneId: 'counterweight:test' });
  assert.equal(reply.accepted, true, 'the scene accepted the work order');
  assert.equal(cw.sceneId, 'counterweight:test');

  // Park the ballast settled on the cradle — the gate commits only while the balance holds.
  t.holdCradle();
  assert.ok(t.stepUntil(() => cw.gate === 'open', COUNTERWEIGHT_SCENE.cradle.holdTicks + 30),
    'the gate committed open after the hold window');
  assert.equal(t.cwEvent('gate_open').length, 1, 'one committed opening, once');
  assert.ok(cw.pressureSpawned, 'the authored interruption answered the commitment');

  // The door is kinematic — its pose slid, it never teleported.
  const door = (t.state.entityList || []).find((e) => e?.alive !== false
    && e.data?.heistFacilityRole === 'counterweight_door');
  assert.ok(t.stepUntil(() => cw.doorPose01 >= 1, COUNTERWEIGHT_SCENE.door.travelTicks + 30),
    'the door finished its slide');
  const closed = sectorLocalToGlobalForSector(
    { x: COUNTERWEIGHT_SCENE.door.closedPos.x, z: COUNTERWEIGHT_SCENE.door.closedPos.z },
    PQ019_HEIST_SECTOR_ID,
  );
  const doorDrift = Math.hypot(door.pos.x - closed.x, door.pos.z - closed.z);
  assert.ok(doorDrift > COUNTERWEIGHT_SCENE.door.openOffsetWu * 0.9,
    'the door physically parked clear of the corridor');

  // The tug fetches the first staged crate and carries it through the open gate to the pad.
  t.holdCradle(); // re-settle in case physics nudged it
  assert.ok(t.stepUntil(() => cw.crewPhase === 'carry' || cw.crewPhase === 'deliver', 2400),
    'the tug clamped a crate and started the carry');
  const carried = Object.entries(cw.crates).find(([, row]) => row.state === 'carried');
  assert.ok(carried || Object.values(cw.crates).some((r) => r.state === 'delivered'),
    'a real crate is on the line');

  assert.ok(t.stepUntil(() => cw.legsDone >= 1, 3000),
    'the receiver pad logged the delivery — a physical fact, not a script');
  assert.equal(t.cwEvent('crate_delivered').length, 1, 'the delivery event fired once');
});

// ── SF-143(c): losing the balance mid-carry is a physical interruption ────────────────────────

test('SF-143(c) breaking the balance closes the door progressively and the carry holds where it is', async () => {
  const t = await scene();
  const facilities = t.facilities;
  const cw = t.cw();
  facilities.requestCounterweightScene({ sceneId: 'counterweight:test' });
  const ballast = t.holdCradle();

  assert.ok(t.stepUntil(() => cw.gate === 'open' && cw.doorPose01 >= 1, 600), 'gate open, door slid');
  assert.ok(t.stepUntil(() => Object.values(cw.crates).some((r) => r.state === 'carried'), 2400),
    'a carry is in progress');
  t.holdCradle();
  t.step(5);

  // Yank the counterweight out of the cradle — the balance is a physical fact.
  const away = sectorLocalToGlobalForSector({ x: 500, z: 500 }, PQ019_HEIST_SECTOR_ID);
  ballast.pos.x = away.x;
  ballast.pos.z = away.z;
  if (ballast.vel) { ballast.vel.x = 0; ballast.vel.z = 0; }

  assert.ok(t.stepUntil(() => cw.gate === 'closed', COUNTERWEIGHT_SCENE.cradle.releaseTicks + 30),
    'the gate commits shut after the release window');
  assert.equal(t.cwEvent('gate_closed').length, 1, 'the closing was announced once');
  // The carry held: the tug is braking with the crate still on the line, not teleported home.
  const stillCarried = Object.values(cw.crates).filter((r) => r.state === 'carried' || r.state === 'staged');
  assert.ok(stillCarried.length > 0, 'the interrupted manifest remains physical');
  assert.ok(cw.doorPose01 < 1, 'the door physically returned toward closed');
});

// ── SF-143(d): the watch contract pays per delivered crate through the ordinary owner ─────────

test('SF-143(d) the watch settles per delivered crate — full manifest pays full, a lost crate pays only what crossed', async () => {
  const t = await scene();

  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  const offer = board.slots.find((o) => o && o.type === COUNTERWEIGHT_WATCH_TYPE);
  assert.ok(offer, 'the Tethys board posts the standing Counterweight Watch row');
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(m && m.counterweight, 'acceptance created the durable watch record');

  // The runtime arms its own scene through the facility contract.
  const cw = t.cw();
  assert.ok(t.stepUntil(() => cw.sceneId === m.counterweight.sceneId, 60),
    'the runtime armed the yard through requestCounterweightScene');
  assert.equal(m.counterweight.armedTick != null, true, 'the window clock started at arming');

  // Full manifest: hold the cradle while the tug works both crates through.
  assert.ok(t.stepUntil(() => {
    t.holdCradle();
    return cw.legsDone >= 2;
  }, 9000), 'both crates crossed under the held balance');
  assert.ok(t.stepUntil(() => !t.mission(), 600), 'the manifest resolved the watch');

  const grants = t.byName('economy:grantCredits');
  assert.equal(grants.length, 1, 'exactly one payout — the ordinary completion path');
  const expected = COUNTERWEIGHT_WATCH_TUNING.rewardPerLegCr * 2
    + COUNTERWEIGHT_WATCH_TUNING.completionBonusCr;
  assert.equal(grants[0].amount, expected,
    `full manifest pays ${expected} (2 legs + completion bonus)`);
  assert.equal(t.byName('mission:completed').length, 1, 'the watch completed once');

  // Partial: a fresh watch loses one crate — the yard pays only for what physically crossed.
  const t2 = await scene({ seed: 19087 });
  const board2 = t2.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  const offer2 = board2.slots.find((o) => o && o.type === COUNTERWEIGHT_WATCH_TYPE);
  t2.bus.emit('ui:acceptMission', { missionId: offer2.id });
  const m2 = t2.mission();
  const cw2 = t2.cw();
  assert.ok(t2.stepUntil(() => cw2.sceneId === m2.counterweight.sceneId, 60));

  t2.holdCradle();
  assert.ok(t2.stepUntil(() => cw2.legsDone >= 1, 9000), 'one crate delivered');
  // Destroy the remaining staged crate — the manifest shrinks by a physical fact.
  const remaining = Object.entries(cw2.crates).find(([, row]) => row.state !== 'delivered');
  assert.ok(remaining, 'a crate remains to lose');
  const crateBody = t2.sceneBody(remaining[0]);
  crateBody.hull = 0;
  crateBody.alive = false;
  t2.bus.emit('entity:destroyed', { id: crateBody.id });
  assert.ok(t2.stepUntil(() => !t2.mission(), 600), 'the shrunken manifest resolved the watch');

  const grants2 = t2.byName('economy:grantCredits');
  assert.equal(grants2.length, 1, 'one settlement, not a phantom full manifest');
  assert.equal(grants2[0].amount, COUNTERWEIGHT_WATCH_TUNING.rewardPerLegCr,
    'one delivered crate pays exactly one leg — no bonus, no fabrication');
  assert.deepEqual(m2.counterweight.deliveredStableIds.length, 1,
    'the durable ledger journaled exactly the delivered crate');
  assert.deepEqual(m2.counterweight.lostStableIds.length, 1,
    'and exactly the lost one');
});

// ── SF-143(e): the armed scene snapshots across the sector boundary ───────────────────────────

test('SF-143(e) sector exit snapshots the armed yard; re-entry restores the same bodies', async () => {
  const t = await scene();
  const facilities = t.facilities;
  const cw = t.cw();
  facilities.requestCounterweightScene({ sceneId: 'counterweight:test' });

  // Disturb the manifest: shove a crate off its staging point, then leave.
  const alpha = t.sceneBody(COUNTERWEIGHT_SCENE.crates[0].stableId);
  const moved = { x: alpha.pos.x + 300, z: alpha.pos.z - 200 };
  alpha.pos.x = moved.x;
  alpha.pos.z = moved.z;
  t.step(2);

  t.sim.registry.get('world').enterSector(AWAY_SECTOR_ID);
  assert.ok(Array.isArray(cw.suspendedBodies), 'the armed scene took its body snapshot');
  const alphaSnap = cw.suspendedBodies.find((s) => s.stableId === COUNTERWEIGHT_SCENE.crates[0].stableId);
  assert.ok(alphaSnap, 'the disturbed crate rode the snapshot');
  assert.ok(Math.hypot(alphaSnap.pos.x - moved.x, alphaSnap.pos.z - moved.z) < 1,
    'the snapshot is the body it left, not the staging point');

  t.sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  t.step(5);
  const restored = t.sceneBody(COUNTERWEIGHT_SCENE.crates[0].stableId);
  assert.ok(restored, 'the crate came back with the yard');
  assert.ok(Math.hypot(restored.pos.x - moved.x, restored.pos.z - moved.z) < 50,
    'restored where it physically was — the commitment survives the boundary');
  const allCrates = (t.state.entityList || []).filter((e) => e?.alive !== false
    && e.data?.counterweightStableId != null && e.data?.counterweightRole === 'crate');
  assert.equal(allCrates.length, COUNTERWEIGHT_SCENE.crates.length,
    'no duplicated manifest — the same bodies, re-linked by stableId');
});

// ── SF-147(a): the monitored lane pulses the stolen load ──────────────────────────────────────

test('SF-147(a) monitor posts stand on the lane and pulse a body carrying the run\'s provenance', async () => {
  const t = await scene();

  const monitorRows = [];
  forEachDressingRow(t.state, (row) => {
    if (row.data?.heistFacilityRole === 'monitor_post') monitorRows.push(row);
  });
  assert.equal(monitorRows.length, HOT_RETURN_MONITORS.posts.length,
    'all three Concord monitors stand on the escape lane');

  // Accept the capsule run, launch, take it — now the lane matters.
  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(m && m.heist, 'the heist run is live');
  assert.ok(t.stepUntil(() => t.capsule() !== null, 400), 'the capsule is away');
  const capsule = t.capsule();
  t.bus.emit('tether:latched', { targetId: capsule.id });
  t.step(2);

  // Carry the stolen load through a monitor field — the post scans it.
  const post = HOT_RETURN_MONITORS.posts[0];
  const world = sectorLocalToGlobalForSector(post.localPos, PQ019_HEIST_SECTOR_ID);
  capsule.pos.x = world.x;
  capsule.pos.z = world.z;
  t.step(3);
  const scans = t.byName('heist:monitorScan');
  assert.equal(scans.length, 1, 'one crossing, one scan — bounded, not per-frame chatter');
  assert.equal(scans[0].monitorId, post.id);
  assert.equal(scans[0].payloadEntityId, capsule.id);
  assert.ok(m.heist.monitorScans.includes(post.id),
    'the durable record journaled the monitor contact');
});

// ── SF-147(b): hard knocks shed real units, and the fence pays for what arrives ───────────────

test('SF-147(b) a hard knock sheds a sealed unit pod; the fence pays for the load that arrives', async () => {
  const t = await scene();

  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(m && m.heist);
  assert.ok(t.stepUntil(() => t.capsule() !== null, 400), 'the capsule is away');
  const capsule = t.capsule();
  assert.equal(capsule.data.shipmentUnits, PQ019_CAPSULE.shipmentUnits,
    'the shell launches with its authored manifest');
  t.bus.emit('tether:latched', { targetId: capsule.id });
  t.step(2);

  // A hard knock — real impact energy — sheds exactly one sealed pod.
  const rock = t.sim.spawn({
    type: 'asteroid', team: 2, pos: { x: capsule.pos.x + 10, z: capsule.pos.z },
    radius: 20, mass: 500, collides: true,
  });
  t.bus.emit('physics:impact', {
    tick: (t.state.tick | 0) + 1, aId: capsule.id, bId: rock.id, dp: 80,
    pos: { x: capsule.pos.x, z: capsule.pos.z },
  });
  assert.equal(capsule.data.shipmentUnits, PQ019_CAPSULE.shipmentUnits - 1,
    'the shell\'s load ledger lost one unit');
  const pods = t.unitPods();
  assert.equal(pods.length, 1, 'a real pod exists beside the shell');
  assert.equal(pods[0].data.heistUnitOf, capsule.data.heistPayloadStableId,
    'the pod carries the run\'s provenance, not a manifest line');
  assert.equal(t.byName('heist:shipmentUnit').length, 1, 'one shedding line per hit');

  // Deliver the lightened shell — the fence pays for three of four units. Custody is earned by a
  // physical contact: land the shell ON the receiver head, the same physical-impact seam the
  // routine catch uses.
  const fence = t.head('fence_receiver');
  capsule.pos.x = fence.pos.x;
  capsule.pos.z = fence.pos.z;
  if (capsule.vel) { capsule.vel.x = 0; capsule.vel.z = 0; }
  t.bus.emit('physics:impact', {
    tick: (t.state.tick | 0) + 1, aId: capsule.id, bId: fence.id, dp: 12,
    pos: { x: fence.pos.x, z: fence.pos.z },
  });
  assert.ok(t.stepUntil(() => !t.mission(), 4000),
    'the lightened shell settled through the fence');

  const grants = t.byName('economy:grantCredits');
  assert.equal(grants.length, 1, 'one payout');
  const expected = Math.round(offer.reward_cr * (PQ019_CAPSULE.shipmentUnits - 1) / PQ019_CAPSULE.shipmentUnits);
  assert.equal(grants[0].amount, expected,
    `the fence paid for ${PQ019_CAPSULE.shipmentUnits - 1}/${PQ019_CAPSULE.shipmentUnits} of the manifest — ${expected}, never the full price`);
  assert.equal(m.heist.settledOutcome, 'fenced_success');
  assert.equal(m.heist.unitsFenced | 0, 0, 'no pod was fenced separately');
  assert.equal(m.heist.deliveredUnits, PQ019_CAPSULE.shipmentUnits - 1,
    'the receiver recorded the load it actually consumed');
});

// ── SF-147(c): voluntary leave suspends the same load; voluntary return resumes it ────────────

test('SF-147(c) leaving the sector suspends the taken run; returning re-embodies the same load', async () => {
  const t = await scene();

  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(t.stepUntil(() => t.capsule() !== null, 400));
  const capsule = t.capsule();
  t.bus.emit('tether:latched', { targetId: capsule.id });
  t.step(2);
  // Shed a unit first — the suspended snapshot must carry the REMAINING load, not the manifest.
  const rock = t.sim.spawn({
    type: 'asteroid', team: 2, pos: { x: capsule.pos.x + 10, z: capsule.pos.z },
    radius: 20, mass: 500, collides: true,
  });
  t.bus.emit('physics:impact', {
    tick: (t.state.tick | 0) + 1, aId: capsule.id, bId: rock.id, dp: 80,
    pos: { x: capsule.pos.x, z: capsule.pos.z },
  });
  const remaining = capsule.data.shipmentUnits;
  const posAtExit = { x: capsule.pos.x, z: capsule.pos.z };

  t.sim.registry.get('world').enterSector(AWAY_SECTOR_ID);
  assert.equal(m.heist.suspended, true, 'the taken run parked instead of failing');
  assert.ok(m.heist.suspendedLoad, 'the body snapshot is the durable record');
  assert.equal(m.heist.suspendedLoad.shipmentUnits, remaining,
    'the snapshot carries the REMAINING units, not the original manifest');
  assert.ok(m.heist.suspendedUnits && m.heist.suspendedUnits.length === 1,
    'the shed pod rode the run too');
  assert.ok(t.mission(), 'the contract is still live across the boundary');

  // Voluntary return: the same load re-embodies, run live, window preserved.
  t.sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  assert.ok(t.stepUntil(() => t.capsule() !== null && m.heist.suspended === false, 600),
    'the run re-embodied on return');
  const resumed = t.capsule();
  assert.equal(resumed.data.shipmentUnits, remaining,
    'the re-embodied shell holds exactly what it left with');
  assert.ok(Math.hypot(resumed.pos.x - posAtExit.x, resumed.pos.z - posAtExit.z) < 200,
    'it came back where it left — the same physical run');
  assert.equal(t.unitPods().length, 1, 'the shed pod re-embodied beside it');
});
