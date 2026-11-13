// Headless tests for the Section F "In the Pit" inference plants (PL-114..PL-226).
// Each plant is driven exactly as production emits: run:waveStarted while active, run:waveCleared
// while active (survivalWave.js:1876), then run:transitioned {previousPhase, phase, reason, tick}
// (runSession.js:217 — the phase is already committed when the receipt lands). Purchase receipts
// carry `accepted` (runSession.js:334); room solids carry data.roomKind/roomToyId
// (survivalArena.js:2210); arena ids are the_hive / cryo_drift / storm_lattice / helios_core
// (survivalCircuit.js). Plain state objects are fine here — the plant modules are the only
// consumers in these tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';

import { sponsorshipPlant, PLANTS_SPONSORSHIP_EVENT, SPONSORSHIP_KILN_LINE } from '../src/systems/plants/sponsorshipPlant.js';
import { litUpPlant, PLANTS_LIT_UP_EVENT, laneCorridorFrom, lightsOutWaveFor, distanceToCorridor } from '../src/systems/plants/litUpPlant.js';
import { badMagnetPlant, PLANTS_BAD_MAGNET_EVENT, BAD_MAGNET_KILN_LINE, nearestBarrel } from '../src/systems/plants/badMagnetPlant.js';
import { onTheCallPlant, PLANTS_ON_THE_CALL_EVENT, crowdTailFor } from '../src/systems/plants/onTheCallPlant.js';
import { gateGawkerPlant, PLANTS_GATE_GAWKER_EVENT, bobOffsetS } from '../src/systems/plants/gateGawkerPlant.js';
import { reversedRobberyPlant, PLANTS_REVERSED_ROBBERY_EVENT, REVERSED_ROBBERY_KILN_LINE, isReaverKill, isThrownIntoGateKill } from '../src/systems/plants/reversedRobberyPlant.js';
import { rungPlant, PLANTS_RUNG_EVENT, isRungKill } from '../src/systems/plants/rungPlant.js';
import { waveBackPlant, PLANTS_WAVE_BACK_EVENT, waveBackVerdict, isShotAtStands } from '../src/systems/plants/waveBackPlant.js';
import { sweeperRoutePlant, PLANTS_SWEEPER_ROUTE_EVENT, sweeperRoute, routeProgress } from '../src/systems/plants/sweeperRoutePlant.js';
import { oneShotShortPlant, PLANTS_ONE_SHOT_SHORT_EVENT, oneShotShortVerdict } from '../src/systems/plants/oneShotShortPlant.js';
import { nightlyGhostPlant, PLANTS_NIGHTLY_GHOST_EVENT, betterLine } from '../src/systems/plants/nightlyGhostPlant.js';
import { broodShortcutPlant, PLANTS_BROOD_SHORTCUT_EVENT, isHiveArena, cutReceiptKind } from '../src/systems/plants/broodShortcutPlant.js';
import { figureheadPlant, PLANTS_FIGUREHEAD_EVENT, isStuckWaspKill, bargePositionAt, isCryoArena } from '../src/systems/plants/figureheadPlant.js';
import { dingPlant, PLANTS_DING_EVENT, dingScheduleFromWarning, isStormArena } from '../src/systems/plants/dingPlant.js';

const ALL_PLANTS = [
  sponsorshipPlant, litUpPlant, badMagnetPlant, onTheCallPlant, gateGawkerPlant,
  reversedRobberyPlant, rungPlant, waveBackPlant, sweeperRoutePlant, oneShotShortPlant,
  nightlyGhostPlant, broodShortcutPlant, figureheadPlant, dingPlant,
];

const PLANT_EVENTS = [
  PLANTS_SPONSORSHIP_EVENT, PLANTS_LIT_UP_EVENT, PLANTS_BAD_MAGNET_EVENT, PLANTS_ON_THE_CALL_EVENT,
  PLANTS_GATE_GAWKER_EVENT, PLANTS_REVERSED_ROBBERY_EVENT, PLANTS_RUNG_EVENT, PLANTS_WAVE_BACK_EVENT,
  PLANTS_SWEEPER_ROUTE_EVENT, PLANTS_ONE_SHOT_SHORT_EVENT, PLANTS_NIGHTLY_GHOST_EVENT,
  PLANTS_BROOD_SHORTCUT_EVENT, PLANTS_FIGUREHEAD_EVENT, PLANTS_DING_EVENT,
];

// ---- harness --------------------------------------------------------------------------------------------

function swarmRun(overrides = {}) {
  return {
    kind: 'survival',
    ruleset: 'swarm',
    seed: 1234,
    arenaId: 'helios_core',
    phase: 'active',
    wave: 1,
    credits: 0,
    score: 0,
    ...overrides,
  };
}

function makeEnv({ run = swarmRun(), simTime = 0 } = {}) {
  const bus = createBus();
  const state = {
    playerId: 7,
    simTime,
    tick: Math.round(simTime * 60),
    run: run === null ? null : { ...run },
    entities: new Map(),
  };
  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const e = {
        id: nextId++, alive: true,
        type: spec.type, pos: { x: spec.pos.x, z: spec.pos.z },
        vel: { x: spec.vel ? spec.vel.x : 0, z: spec.vel ? spec.vel.z : 0 },
        radius: spec.radius, hull: spec.hull, mass: spec.mass,
        data: { ...(spec.data || {}) },
      };
      spawned.push(e);
      state.entities.set(e.id, e);
      return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      state.entities.delete(id);
    },
  };
  // recorders
  const voice = [];
  const cues = [];
  const receipts = new Map(PLANT_EVENTS.map((name) => [name, []]));
  bus.on('voice:say', (p) => voice.push(p));
  bus.on('audio:cue', (p) => cues.push(p));
  for (const name of PLANT_EVENTS) bus.on(name, (p) => receipts.get(name).push(p));
  const plants = ALL_PLANTS.map((plant) => {
    const p = Object.create(plant);
    p.init({ state, bus, helpers });
    return p;
  });
  return {
    bus, state, helpers, spawned, voice, cues, receipts, plants,
    emit(name, payload) { bus.emit(name, payload); },
    /** The real round-end sequence: cleared while active, then the machine commits the phase. */
    endRound(wave, nextPhase = 'cleanup') {
      this.emit('run:waveCleared', { wave, completionKind: 'clear', durationTicks: 600 });
      this.state.run.phase = nextPhase; // runSession commits the phase before emitting
      this.emit('run:transitioned', { previousPhase: 'active', phase: nextPhase, reason: 'wave_complete', tick: this.state.tick });
    },
    /** The real round-start sequence: the machine commits wave_intro/active, then the wave starts. */
    startRound(wave) {
      this.state.run.phase = 'active';
      this.state.run.wave = wave;
      this.emit('run:waveStarted', { wave, tick: this.state.tick });
    },
    advance(seconds, dt = 0.25) {
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        state.simTime += dt;
        state.tick += Math.round(dt * 60);
        for (const p of plants) p.update(dt);
      }
    },
    stepAll(dt = 0.25) {
      for (const p of plants) p.update(dt);
    },
    ofPlant(plId) {
      return this.spawned.filter((e) => e.data && e.data.plants && e.data.plants[plId]);
    },
  };
}

function addEntity(env, id, fields = {}) {
  const e = { id, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...fields };
  env.state.entities.set(id, e);
  return e;
}

/** A real room solid: type 'station', data.roomKind/roomToyId/roomOwner (survivalArena.js:2208). */
function gateSolid(env, id, pos) {
  return addEntity(env, id, {
    type: 'station', pos,
    data: { roomOwner: 'arena', roomSolidId: id, roomToyId: 'foundry_gate_a', roomKind: 'gate', roomDynamic: false },
  });
}

function relaySolid(env, id, toyId, pos) {
  return addEntity(env, id, {
    type: 'station', pos,
    data: { roomOwner: 'arena', roomSolidId: id, roomToyId: toyId, roomKind: 'pylon', roomDynamic: false },
  });
}

// ---- PL-114 Sponsorship ---------------------------------------------------------------------------------

test('PL-114: between rounds the banner drone circles; into the lane arms the banner; Kiln speaks only when a Wasp takes it', () => {
  const env = makeEnv({ run: swarmRun({ seed: 42, wave: 3, phase: 'active' }) });
  env.startRound(3);
  env.endRound(3, 'cleanup');
  const drones = env.ofPlant('pl114').filter((e) => e.data.plants.pl114.role === 'banner_drone');
  assert.equal(drones.length, 1, 'drone spawned in the between-round window');
  const drone = drones[0];
  assert.equal(drone.data.swarmFloorPad.label, 'SPONSORS <3 U');

  // thrown into the lane: the drone dies to a throw/crush receipt — banner armed, Kiln silent yet
  env.emit('combat:crushed', { entityId: drone.id, toyId: 55, t: 0 });
  const armed = env.receipts.get(PLANTS_SPONSORSHIP_EVENT).find((r) => r.kind === 'banner_armed');
  assert.ok(armed, 'banner armed receipt');
  assert.equal(env.voice.length, 0, 'no Kiln line without a Wasp to stamp');

  // the next Wasp through wears it, blind — and NOW Kiln speaks
  const wasp = { id: 555, data: { lootTableId: 'wasp_swarmer' } };
  env.emit('entity:spawned', { id: 555, type: 'ship', entity: wasp });
  const blind = env.receipts.get(PLANTS_SPONSORSHIP_EVENT).find((r) => r.kind === 'blind_wasp');
  assert.ok(blind, 'blind wasp receipt');
  assert.equal(wasp.data.plants.pl114.blind, true);
  assert.equal(env.voice.length, 1);
  assert.equal(env.voice[0].text, SPONSORSHIP_KILN_LINE);
  assert.equal(env.voice[0].id, 'plants:pl114:kiln');

  // a second banner still only gets one Kiln line per run
  env.startRound(4); // drone despawned with the round
  env.endRound(4, 'cleanup');
  const drone2 = env.ofPlant('pl114').filter((e) => e.data.plants.pl114.role === 'banner_drone').pop();
  assert.ok(drone2, 'second window spawns a fresh drone');
  env.emit('combat:crushed', { entityId: drone2.id });
  env.emit('entity:spawned', { id: 556, type: 'ship', entity: { id: 556, data: { lootTableId: 'wasp_swarmer' } } });
  assert.equal(env.voice.length, 1, 'no second Kiln line');
  assert.equal(env.receipts.get(PLANTS_SPONSORSHIP_EVENT).filter((r) => r.kind === 'blind_wasp').length, 2);
});

test('PL-114 negatives: no run, active round, non-Wasp spawns', () => {
  const dead = makeEnv({ run: null });
  dead.emit('run:transitioned', { previousPhase: 'active', phase: 'cleanup', tick: 0 });
  assert.equal(dead.ofPlant('pl114').length, 0);

  const env = makeEnv({ run: swarmRun({ phase: 'active' }) });
  env.emit('run:transitioned', { previousPhase: 'wave_intro', phase: 'active', tick: 0 });
  assert.equal(env.ofPlant('pl114').length, 0, 'transitioned to active spawns nothing');

  // a non-Wasp spawn while armed does not take the banner
  const env2 = makeEnv({ run: swarmRun({ seed: 43, phase: 'active', wave: 3 }) });
  env2.endRound(3, 'cleanup');
  const drone = env2.ofPlant('pl114')[0];
  env2.emit('combat:crushed', { entityId: drone.id });
  env2.emit('entity:spawned', { id: 557, type: 'ship', entity: { id: 557, data: { lootTableId: 'reaver_pirate' } } });
  assert.equal(env2.voice.length, 0, 'Reaver is not the next Wasp through');
  assert.equal(env2.receipts.get(PLANTS_SPONSORSHIP_EVENT).filter((r) => r.kind === 'blind_wasp').length, 0);
});

// ---- PL-115 Lit up ---------------------------------------------------------------------------------------

test('PL-115: on the Lights Out wave, bodies crossing the lane show for a second', () => {
  const wave = lightsOutWaveFor();
  assert.equal(wave, 13, 'Lights Out is the authored course round');
  const env = makeEnv({ run: swarmRun({ wave }) });
  const ghost = addEntity(env, 300, { pos: { x: 0, z: 20 }, data: { lootTableId: 'quiet_ghost' } });
  const rock = addEntity(env, 301, { type: 'debris', pos: { x: 10, z: -5 }, vel: { x: 90, z: 0 } });
  const farBody = addEntity(env, 302, { pos: { x: 0, z: 2000 }, data: { lootTableId: 'wasp_swarmer' } });

  env.advance(0.4); // first scan fires at the 0.25 s throttle tick
  assert.equal(ghost.data.lampsFlashing, true, 'Quiet Ghost revealed');
  assert.equal(ghost.data.lampFlashUntil, 1.25, 'shows for a second from the reveal tick');
  assert.equal(rock.data.lampsFlashing, true, 'the thrown rock shows too');
  assert.equal(farBody.data.lampsFlashing, undefined, 'far from the lane stays dark');
  const lit = env.receipts.get(PLANTS_LIT_UP_EVENT);
  assert.equal(lit.filter((r) => r.id === 300).length, 1, 'one receipt per reveal');
  assert.ok(lit.some((r) => r.id === 301 && r.kind === 'thrown_body'), 'rock receipt');

  // per-entity cooldown: no immediate re-reveal, then it can show again
  env.advance(0.5);
  assert.equal(lit.filter((r) => r.id === 300).length, 1, 'still in cooldown');
  env.advance(3.2);
  assert.ok(lit.filter((r) => r.id === 300).length >= 2, 'reveals again after cooldown');
  assert.ok(lit.every((r) => r.kind === 'swarm_body' || r.kind === 'thrown_body'));
});

test('PL-115 negatives: other rounds and phases never reveal; corridor provenance is honest', () => {
  const env = makeEnv({ run: swarmRun({ wave: 12, phase: 'active' }) });
  addEntity(env, 400, { pos: { x: 0, z: 0 }, data: { lootTableId: 'wasp_swarmer' } });
  env.advance(1);
  assert.equal(env.receipts.get(PLANTS_LIT_UP_EVENT).length, 0, 'not the Lights Out wave');

  const idle = makeEnv({ run: swarmRun({ wave: 13, phase: 'refit' }) });
  addEntity(idle, 401, { pos: { x: 0, z: 0 }, data: { lootTableId: 'wasp_swarmer' } });
  idle.advance(1);
  assert.equal(idle.receipts.get(PLANTS_LIT_UP_EVENT).length, 0, 'round not live');

  // corridor geometry is pure: the fallback is the plant's invention, not an authored lane
  const fallback = laneCorridorFrom({ entities: new Map() });
  assert.equal(fallback.authored, false);
  assert.equal(distanceToCorridor({ x: 0, z: 80 }, fallback), 80);
  assert.equal(distanceToCorridor({ x: 0, z: 0 }, fallback), 0);
  const entities = new Map();
  entities.set(1, { alive: true, pos: { x: 30, z: -20 }, data: { kind: 'conveyor', laneDirX: 0, laneDirZ: 1 } });
  const real = laneCorridorFrom({ entities });
  assert.equal(real.authored, true, 'a real lane solid is authored');
  assert.deepEqual({ x: real.x, z: real.z }, { x: 30, z: -20 });
});

// ---- PL-137 Bad magnet ------------------------------------------------------------------------------------

test('PL-137: with no live barrel on the floor the row stays silent; with one, it joins the pull', () => {
  // no barrel bodies exist yet (red barrels row OPEN): honest silence
  const silent = makeEnv({ run: swarmRun({ seed: 9, phase: 'active', wave: 2 }) });
  addEntity(silent, 7, { pos: { x: 0, z: 0 }, data: {} });
  silent.emit('swarm:dropCollected', { id: 90, dropId: 'magnet', name: 'Magnet', wave: 2 });
  assert.equal(silent.voice.length, 0, 'no Kiln line without a barrel body');
  assert.equal(silent.receipts.get(PLANTS_BAD_MAGNET_EVENT).length, 0);
  assert.equal(silent.cues.length, 0);

  // a live barrel exists: it joins the pull, Kiln rates it
  const env = makeEnv({ run: swarmRun({ seed: 9, phase: 'active', wave: 2 }) });
  addEntity(env, 7, { pos: { x: 0, z: 0 }, data: {} }); // the player
  const barrel = addEntity(env, 50, { pos: { x: 300, z: 0 }, data: { kind: 'barrel' } });
  addEntity(env, 51, { pos: { x: 900, z: 0 }, data: { barrel: true } });
  env.emit('swarm:dropCollected', { id: 90, dropId: 'magnet', name: 'Magnet', wave: 2 });
  assert.equal(env.voice.length, 1);
  assert.equal(env.voice[0].text, BAD_MAGNET_KILN_LINE);
  const pulled = env.receipts.get(PLANTS_BAD_MAGNET_EVENT)[0];
  assert.equal(pulled.kind, 'barrel_pulled');
  assert.equal(pulled.barrelId, 50, 'the NEAREST barrel, not just any');
  assert.equal(barrel.data.lampsFlashing, true);

  // dedupe is per drop: a different drop collects again (another receipt), the same drop id
  // redelivered does not
  env.emit('swarm:dropCollected', { id: 91, dropId: 'magnet', name: 'Magnet', wave: 3 });
  assert.equal(env.receipts.get(PLANTS_BAD_MAGNET_EVENT).length, 2);
  assert.equal(env.voice.length, 2);
  env.emit('swarm:dropCollected', { id: 90, dropId: 'magnet', name: 'Magnet', wave: 3 });
  assert.equal(env.receipts.get(PLANTS_BAD_MAGNET_EVENT).length, 2, 'same drop id handled once');

  // pure: nearest wins
  const near = nearestBarrel(
    [{ pos: { x: 10, z: 0 }, data: { kind: 'barrel' } }, { pos: { x: 5, z: 0 }, data: { barrel: true } }],
    { x: 0, z: 0 }, 1200,
  );
  assert.equal(near.pos.x, 5);
});

test('PL-137 negatives: other drops, no run', () => {
  const env = makeEnv({ run: swarmRun({ seed: 10, phase: 'active' }) });
  addEntity(env, 7, { pos: { x: 0, z: 0 }, data: {} });
  addEntity(env, 52, { pos: { x: 100, z: 0 }, data: { kind: 'barrel' } });
  env.emit('swarm:dropCollected', { id: 92, dropId: 'big_bang', name: 'Big Bang', wave: 2 });
  assert.equal(env.voice.length, 0);
  assert.equal(env.receipts.get(PLANTS_BAD_MAGNET_EVENT).length, 0);

  const dead = makeEnv({ run: null });
  dead.emit('swarm:dropCollected', { dropId: 'magnet' });
  assert.equal(dead.voice.length, 0);
});

// ---- PL-163 On the call ------------------------------------------------------------------------------------

test('PL-163: a collision kill while Kiln says the round name gets the crowd shouting the end of it', () => {
  const env = makeEnv({ run: swarmRun({ wave: 4, phase: 'active' }) }); // Mind the Gap
  env.emit('run:waveStarted', { wave: 4, tick: 60 });
  env.emit('entity:killed', {
    id: 800, killerId: 7, type: 'ship', cause: 'ship_collision', impactorId: 33,
    pos: { x: 40, z: 0 }, lootTableId: 'wasp_swarmer', victimClass: 'wasp_swarmer',
    presentation: {},
  });
  assert.equal(env.voice.length, 1);
  assert.equal(env.voice[0].text, 'GAP!', 'the crowd shouts the end of the name');
  const shout = env.receipts.get(PLANTS_ON_THE_CALL_EVENT)[0];
  assert.equal(shout.kind, 'crowd_shout');
  assert.equal(shout.roundName, 'Mind the Gap');

  // once per round
  env.emit('entity:killed', { id: 801, killerId: 7, cause: 'terrain_collision', impactorId: 34, pos: { x: 0, z: 0 }, presentation: {} });
  assert.equal(env.voice.length, 1);

  // next round arms again
  env.state.simTime = 10;
  env.startRound(5); // the machine commits wave 5, then the wave starts
  env.emit('entity:killed', { id: 802, killerId: 7, cause: 'ship_collision', impactorId: 35, pos: { x: 0, z: 0 }, presentation: {} });
  assert.equal(env.voice.length, 2);
  assert.equal(env.voice[1].text, 'MAW!', 'Iron Maw shouts its tail');
});

test('PL-163 negatives: wrong cause, late kill, no run', () => {
  const env = makeEnv({ run: swarmRun({ wave: 4, phase: 'active' }) });
  env.emit('run:waveStarted', { wave: 4, tick: 60 });
  env.emit('entity:killed', { id: 803, killerId: 7, cause: 'kinetic', pos: { x: 0, z: 0 }, presentation: {} });
  assert.equal(env.voice.length, 0, 'not a collision kill');

  env.state.simTime = 5.5; // past the saying window
  env.emit('entity:killed', { id: 804, killerId: 7, cause: 'ship_collision', impactorId: 1, pos: { x: 0, z: 0 }, presentation: {} });
  assert.equal(env.voice.length, 0, 'Kiln finished the name');

  const dead = makeEnv({ run: null });
  dead.emit('run:waveStarted', { wave: 4 });
  dead.emit('entity:killed', { killerId: 7, cause: 'ship_collision', impactorId: 1, pos: { x: 0, z: 0 } });
  assert.equal(dead.voice.length, 0);

  // pure tails
  assert.equal(crowdTailFor('Doors Open'), 'OPEN!');
  assert.equal(crowdTailFor(''), null);
});

// ---- PL-164 The gate gawker ---------------------------------------------------------------------------------

test('PL-164: between rounds a gawker watches the gate; accepted purchases make it bob more', () => {
  const env = makeEnv({ run: swarmRun({ phase: 'active', wave: 2 }) });
  gateSolid(env, 'survival-room-w2-foundry_gate_a', { x: 500, z: 0 });
  env.endRound(2, 'refit'); // shopping happens in the refit window
  const gawkers = env.ofPlant('pl164').filter((e) => e.data.plants.pl164.role === 'gawker');
  assert.equal(gawkers.length, 1, 'gawker spawned in the between-round window');
  const gawker = gawkers[0];
  assert.equal(gawker.data.swarmFloorPad.label, 'A WASP WATCHES');

  env.emit('run:purchaseResolved', { accepted: true, requestId: 1, reason: 'swarm_fortify', credits: 40, totalCredits: 910 });
  const bob = env.receipts.get(PLANTS_GATE_GAWKER_EVENT).filter((r) => r.kind === 'bob_more');
  assert.equal(bob.length, 1);
  assert.equal(bob[0].bobBoost, 1);

  env.emit('run:purchaseResolved', { accepted: true, requestId: 2, reason: 'swarm_fortify', credits: 40, totalCredits: 870 });
  assert.equal(env.receipts.get(PLANTS_GATE_GAWKER_EVENT).filter((r) => r.kind === 'bob_more').length, 2);

  // it bobs on a deterministic phase around the gate mouth
  env.state.simTime = 1.1;
  env.stepAll();
  assert.equal(gawker.pos.z, 26 + bobOffsetS(1.1, 2), 'parked a crack off the gate, on the bob');
  assert.equal(gawker.pos.x, 500);

  // the round starts: the gawker is gone
  env.startRound(3);
  assert.equal(gawker.alive, false, 'despawned when the round starts');

  // rejected purchase: no bob
  const before = env.receipts.get(PLANTS_GATE_GAWKER_EVENT).length;
  env.emit('run:purchaseResolved', { accepted: false, requestId: 3, reason: 'wallet_commit_failed' });
  assert.equal(env.receipts.get(PLANTS_GATE_GAWKER_EVENT).length, before);
});

test('PL-164 negatives: no gate, active round', () => {
  const env = makeEnv({ run: swarmRun({ phase: 'active' }) });
  gateSolid(env, 'survival-room-w1-foundry_gate_a', { x: 0, z: 0 });
  env.emit('run:transitioned', { previousPhase: 'wave_intro', phase: 'active', tick: 0 });
  env.endRound(1, 'cleanup');
  env.state.run.phase = 'active'; // transitioned to active: the window closed
  env.emit('run:transitioned', { previousPhase: 'cleanup', phase: 'active', tick: 10 });
  assert.equal(env.ofPlant('pl164').filter((e) => e.data.plants.pl164.role === 'gawker' && e.alive !== false).length, 0, 'not between rounds');

  const gateless = makeEnv({ run: swarmRun({ phase: 'active' }) });
  gateless.endRound(1, 'refit');
  assert.equal(gateless.ofPlant('pl164').length, 0, 'no gate solid, no gawker');
});

// ---- PL-188 Reversed robbery ---------------------------------------------------------------------------------

test('PL-188: lining a Reaver into the gate mouth spills the haul', () => {
  const env = makeEnv({ run: swarmRun({ seed: 3, wave: 6, phase: 'active' }) });
  gateSolid(env, 'survival-room-w6-foundry_gate_a', { x: 100, z: 100 });

  // far from any gate: nothing
  env.emit('entity:killed', {
    id: 810, killerId: 7, cause: 'massline_whip', impactorId: 9,
    pos: { x: 3000, z: 3000 }, lootTableId: 'reaver_pirate', victimClass: 'reaver_pirate', presentation: {},
  });
  assert.equal(env.voice.length, 0);

  // wrong cause near the gate: nothing
  env.emit('entity:killed', {
    id: 811, killerId: 7, cause: 'kinetic',
    pos: { x: 110, z: 100 }, lootTableId: 'reaver_pirate', presentation: {},
  });
  assert.equal(env.voice.length, 0);

  // lined in the gate mouth
  env.emit('entity:killed', {
    id: 812, killerId: 7, cause: 'ship_collision', impactorId: 10,
    pos: { x: 130, z: 90 }, lootTableId: 'reaver_pirate', victimClass: 'reaver_pirate', presentation: {},
  });
  assert.equal(env.voice.length, 1);
  assert.equal(env.voice[0].text, REVERSED_ROBBERY_KILN_LINE);
  const spill = env.receipts.get(PLANTS_REVERSED_ROBBERY_EVENT)[0];
  assert.equal(spill.kind, 'haul_spilled');
  assert.equal(spill.spawnedPickups, 3, 'yours and two other pilots');
  const pickups = env.spawned.filter((e) => e.type === 'pickup');
  assert.equal(pickups.length, 3);
  assert.ok(pickups.every((p) => p.data.wallet === 'run' && p.data.credits > 0));

  // once per run
  env.emit('entity:killed', {
    id: 813, killerId: 7, cause: 'massline_whip', impactorId: 11,
    pos: { x: 120, z: 100 }, lootTableId: 'reaver_pirate', presentation: {},
  });
  assert.equal(env.receipts.get(PLANTS_REVERSED_ROBBERY_EVENT).length, 1);
});

test('PL-188 pure helpers', () => {
  assert.equal(isReaverKill({ lootTableId: 'reaver_pirate' }), true);
  assert.equal(isReaverKill({ lootTableId: 'wasp_swarmer' }), false);
  assert.equal(isThrownIntoGateKill({ cause: 'massline_whip', impactorId: null }), true);
  assert.equal(isThrownIntoGateKill({ cause: 'ship_collision', impactorId: 3 }), true);
  assert.equal(isThrownIntoGateKill({ cause: 'ship_collision', impactorId: null }), false);
  assert.equal(isThrownIntoGateKill({ cause: 'explosive', impactorId: 3 }), false);
});

// ---- PL-189 Rung ---------------------------------------------------------------------------------------------

test('PL-189: with no gong body on the floor the row is honestly inert', () => {
  const env = makeEnv({ run: swarmRun({ wave: 7, phase: 'active' }) });
  // a collision kill right where a gong would hang — but nothing authors the body (PL-67 OPEN)
  env.emit('entity:killed', { id: 822, killerId: 7, cause: 'ship_collision', impactorId: 3, pos: { x: 60, z: 0 }, presentation: {} });
  assert.equal(env.receipts.get(PLANTS_RUNG_EVENT).length, 0, 'no receipts');
  assert.equal(env.voice.length, 0, 'no narration');
  assert.equal(env.cues.length, 0, 'no crowd audio');
});

test('PL-189: an enemy through the gong rings it and the crowd drowns Kiln', () => {
  const env = makeEnv({ run: swarmRun({ wave: 7, phase: 'active' }) });
  const gong = addEntity(env, 80, { pos: { x: 0, z: 0 }, data: { plantsGong: true } }); // PL-67's declared body convention

  // far from the gong: nothing
  env.emit('entity:killed', { id: 820, killerId: 7, cause: 'ship_collision', impactorId: 2, pos: { x: 900, z: 0 }, presentation: {} });
  assert.equal(env.receipts.get(PLANTS_RUNG_EVENT).length, 0);

  // wrong cause near the gong: nothing
  env.emit('entity:killed', { id: 821, killerId: 7, cause: 'explosive', pos: { x: 10, z: 0 }, presentation: {} });
  assert.equal(env.receipts.get(PLANTS_RUNG_EVENT).length, 0);

  // through the gong
  env.emit('entity:killed', { id: 822, killerId: 7, cause: 'ship_collision', impactorId: 3, pos: { x: 60, z: 0 }, presentation: {} });
  const roar = env.receipts.get(PLANTS_RUNG_EVENT)[0];
  assert.equal(roar.kind, 'crowd_roar');
  assert.equal(gong.data.lampsFlashing, true, 'the plate rings');
  assert.ok(env.cues.length >= 1, 'the crowd is audible');
  assert.equal(env.voice.length, 0, 'the crowd is louder than Kiln: no line spent');

  // once per round
  env.emit('entity:killed', { id: 823, killerId: 7, cause: 'terrain_collision', impactorId: 4, pos: { x: 0, z: 10 }, presentation: {} });
  assert.equal(env.receipts.get(PLANTS_RUNG_EVENT).length, 1);

  assert.equal(isRungKill({ pos: { x: 0, z: 0 }, cause: 'ship_collision' }, { x: 0, z: 0 }, 180), true);
  assert.equal(isRungKill({ pos: { x: 500, z: 0 }, cause: 'ship_collision' }, { x: 0, z: 0 }, 180), false);
});

// ---- PL-212 The wave-back --------------------------------------------------------------------------------------

test('PL-212: gunfire at the stands between rounds benches a section and flashes it back in lamps', () => {
  const env = makeEnv({ run: swarmRun({ phase: 'active', wave: 3 }) });
  env.endRound(3, 'refit');
  const benched = env.receipts.get(PLANTS_WAVE_BACK_EVENT).find((r) => r.kind === 'section_benched');
  assert.ok(benched, 'a rail section is benched once per run');
  const beacons = env.ofPlant('pl212').filter((e) => e.data.plants.pl212.role === 'rail_beacon');
  assert.equal(beacons.length, 4, '3-4 small rail beacon props');

  // a second window does not bench twice
  env.state.run.phase = 'draft';
  env.emit('run:transitioned', { previousPhase: 'refit', phase: 'draft', reason: 'draft_open', tick: 0 });
  assert.equal(env.ofPlant('pl212').filter((e) => e.data.plants.pl212.role === 'rail_beacon').length, 4);

  // active round: no wave-back
  env.state.run.phase = 'active';
  env.emit('combat:fire', { ownerId: 7, origin: { x: 900, z: 0 } });
  env.emit('combat:fire', { ownerId: 7, origin: { x: 900, z: 0 } });
  assert.equal(env.receipts.get(PLANTS_WAVE_BACK_EVENT).filter((r) => r.kind === 'section_flashes_back').length, 0);
  env.state.run.phase = 'refit';

  // someone else's flash does nothing
  env.emit('combat:fire', { ownerId: 12, origin: { x: 900, z: 0 } });
  assert.equal(env.receipts.get(PLANTS_WAVE_BACK_EVENT).filter((r) => r.kind === 'section_flashes_back').length, 0);

  // too far from the stands: nothing
  env.emit('combat:fire', { ownerId: 7, origin: { x: 10, z: 0 } });
  assert.equal(env.receipts.get(PLANTS_WAVE_BACK_EVENT).filter((r) => r.kind === 'section_flashes_back').length, 0);

  // two flashes near the rail inside the window: the nearest beacons answer in lamps
  env.emit('combat:fire', { ownerId: 7, origin: { x: 900, z: 0 } });
  env.emit('combat:fire', { ownerId: 7, origin: { x: 920, z: 0 } });
  const flash = env.receipts.get(PLANTS_WAVE_BACK_EVENT).find((r) => r.kind === 'section_flashes_back');
  assert.ok(flash, 'the section flashes back');
  assert.equal(flash.lamps, 12, 'a whole section');
  assert.equal(flash.beaconIds.length, 2, 'the nearest section in lamps');
  for (const id of flash.beaconIds) {
    assert.equal(env.state.entities.get(id).data.lampsFlashing, true, 'beacon visibly flashing');
  }

  // once per window
  env.emit('combat:fire', { ownerId: 7, origin: { x: 900, z: 0 } });
  env.emit('combat:fire', { ownerId: 7, origin: { x: 900, z: 0 } });
  assert.equal(env.receipts.get(PLANTS_WAVE_BACK_EVENT).filter((r) => r.kind === 'section_flashes_back').length, 1);

  assert.equal(waveBackVerdict(2), 'flashback');
  assert.equal(waveBackVerdict(1), 'waiting');
  assert.equal(isShotAtStands({ x: 10, z: 0 }), false);
  assert.equal(isShotAtStands({ x: 900, z: 0 }), true);
});

// ---- PL-213 The sweeper's route ---------------------------------------------------------------------------------

test('PL-213: in the between-round window the sweeper crosses the clean line, bending round hazards', () => {
  const env = makeEnv({ run: swarmRun({ phase: 'active', wave: 4 }) });
  addEntity(env, 90, { pos: { x: 200, z: 50 }, data: { kind: 'barrel' } });
  addEntity(env, 91, { pos: { x: -300, z: -20 }, data: { kind: 'mine' } });
  env.endRound(4, 'cleanup');
  const sweepers = env.ofPlant('pl213').filter((e) => e.data.plants.pl213.role === 'sweeper');
  assert.equal(sweepers.length, 1, 'sweeper out in the between-round window');
  const sweeper = sweepers[0];
  assert.equal(sweeper.data.swarmFloorPad.label, 'THE SWEEPER');

  const route = env.receipts.get(PLANTS_SWEEPER_ROUTE_EVENT).find((r) => r.kind === 'route');
  assert.ok(route, 'route receipt (learn the room)');
  assert.equal(route.hazards, 2);
  assert.ok(route.waypoints.length >= 4, 'start + bends + end');

  // it actually moves along the route
  const x0 = sweeper.pos.x;
  env.advance(2, 0.5);
  assert.notEqual(sweeper.pos.x, x0, 'sweeper crosses the floor');

  // the round starts: the sweeper is gone
  env.startRound(5);
  assert.equal(sweeper.alive, false, 'despawned when the round starts');

  // active round: no sweeper
  const live = makeEnv({ run: swarmRun({ phase: 'active' }) });
  live.emit('run:transitioned', { previousPhase: 'wave_intro', phase: 'active', tick: 0 });
  assert.equal(live.ofPlant('pl213').length, 0);

  // pure route math
  const wps = sweeperRoute({ x: 0, z: 0 }, [{ x: 100, z: 10 }]);
  assert.equal(wps.length, 4);
  const start = routeProgress(wps, 0);
  assert.deepEqual({ x: start.x, z: start.z }, { x: wps[0].x, z: wps[0].z });
  const end = routeProgress(wps, 1e9);
  assert.equal(end.done, true);
  assert.deepEqual({ x: end.x, z: end.z }, { x: wps[3].x, z: wps[3].z });
  // the bend goes around the hazard, not through it
  assert.equal(wps[1].x, 100);
  assert.equal(wps[1].z, -120);
});

// ---- PL-222 One shot short --------------------------------------------------------------------------------------

test('PL-222: failing the round-five dare by exactly one shot gets the crowd laugh and Kiln silence', () => {
  const env = makeEnv({ run: swarmRun({ wave: 5, phase: 'active' }) });
  env.emit('run:waveStarted', { wave: 5, tick: 300 });
  env.emit('combat:fire', { ownerId: 7, origin: { x: 0, z: 0 } }); // exactly one
  env.emit('combat:fire', { ownerId: 12, origin: { x: 0, z: 0 } }); // not yours
  env.emit('run:waveCleared', { wave: 5, completionKind: 'clear', durationTicks: 600 });
  const laugh = env.receipts.get(PLANTS_ONE_SHOT_SHORT_EVENT)[0];
  assert.equal(laugh.kind, 'crowd_laugh');
  assert.equal(laugh.shots, 1);
  assert.equal(env.voice.length, 0, 'Kiln says nothing at all');

  // once per run
  env.emit('run:waveCleared', { wave: 5, completionKind: 'clear', durationTicks: 600 });
  assert.equal(env.receipts.get(PLANTS_ONE_SHOT_SHORT_EVENT).length, 1);
});

test('PL-222 negatives: dare kept or sprayed is silent', () => {
  const kept = makeEnv({ run: swarmRun({ wave: 5, phase: 'active' }) });
  kept.emit('run:waveStarted', { wave: 5, tick: 300 });
  kept.emit('run:waveCleared', { wave: 5, completionKind: 'clear', durationTicks: 600 });
  assert.equal(kept.receipts.get(PLANTS_ONE_SHOT_SHORT_EVENT).length, 0, 'dare kept: no laugh');

  const sprayed = makeEnv({ run: swarmRun({ wave: 5, phase: 'active' }) });
  sprayed.emit('combat:fire', { ownerId: 7, origin: { x: 0, z: 0 } });
  sprayed.emit('combat:fire', { ownerId: 7, origin: { x: 1, z: 0 } });
  sprayed.emit('combat:fire', { ownerId: 7, origin: { x: 2, z: 0 } });
  sprayed.emit('run:waveCleared', { wave: 5, completionKind: 'clear', durationTicks: 600 });
  assert.equal(sprayed.receipts.get(PLANTS_ONE_SHOT_SHORT_EVENT).length, 0, 'sprayed: no laugh');

  assert.equal(oneShotShortVerdict(0), 'dare_kept');
  assert.equal(oneShotShortVerdict(1), 'one_shot_short');
  assert.equal(oneShotShortVerdict(4), 'sprayed');
});

// ---- PL-223 Your own ghost ---------------------------------------------------------------------------------------

test('PL-223: the board keeps the winning line as your ghost', () => {
  const env = makeEnv({ run: swarmRun({ wave: 2, phase: 'active' }) });

  env.state.simTime = 10;
  env.emit('run:waveStarted', { wave: 2, tick: 600 });
  env.state.simTime = 14;
  env.emit('run:waveCleared', { wave: 2, completionKind: 'clear', durationTicks: 240 });
  let row = env.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT)[0];
  assert.equal(row.kind, 'ghost_beaten');
  assert.equal(row.durationS, 4);
  assert.equal(row.ghostS, null);

  // slower: the ghost stands
  env.state.simTime = 20;
  env.emit('run:waveStarted', { wave: 2, tick: 1200 });
  env.state.simTime = 26; // 6 s, ghost is 4
  env.emit('run:waveCleared', { wave: 2, completionKind: 'clear', durationTicks: 240 });
  row = env.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT)[1];
  assert.equal(row.kind, 'ghost_stands');
  assert.equal(row.ghostS, 4);

  // faster: new ghost
  env.state.simTime = 30;
  env.emit('run:waveStarted', { wave: 2, tick: 1800 });
  env.state.simTime = 32.5; // 2.5 s
  env.emit('run:waveCleared', { wave: 2, completionKind: 'clear', durationTicks: 240 });
  row = env.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT)[2];
  assert.equal(row.kind, 'ghost_beaten');
  assert.equal(row.ghostS, 4);

  // the Nightly summary on results
  env.emit('run:resultsReady', { outcome: 'victory' });
  const summary = env.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT).find((r) => r.kind === 'nightly_lines');
  assert.ok(summary, 'nightly lines receipt');
  assert.equal(summary.ghosts.length, 1);
  assert.equal(summary.ghosts[0].durationS, 2.5);

  assert.equal(betterLine(null, 3), true);
  assert.equal(betterLine(4, 5), false);
  assert.equal(betterLine(4, null), false);
});

test('PL-223 negative: no run, no timing', () => {
  const dead = makeEnv({ run: null });
  dead.emit('run:waveStarted', { wave: 2 });
  dead.emit('run:waveCleared', { wave: 2, completionKind: 'clear', durationTicks: 240 });
  assert.equal(dead.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT).length, 0);

  const env = makeEnv({ run: swarmRun({ wave: 2, phase: 'active' }) });
  env.emit('run:waveCleared', { wave: 2, completionKind: 'clear', durationTicks: 240 }); // cleared without a start
  assert.equal(env.receipts.get(PLANTS_NIGHTLY_GHOST_EVENT).length, 0);
});

// ---- PL-224 The Brood's shortcut ----------------------------------------------------------------------------------

test('PL-224: in the Hive every sac cut is kept for the run and the Brood follows from the second', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'the_hive', phase: 'active', wave: 8 }) }); // survivalCircuit.js:204
  addEntity(env, 77, { pos: { x: 5, z: 5 }, data: {} });

  env.emit('swarm:hiveSacKilled', { wave: 8, sacId: 77 });
  let receipt = env.receipts.get(PLANTS_BROOD_SHORTCUT_EVENT)[0];
  assert.equal(receipt.kind, 'cut_open');
  assert.equal(receipt.cutCount, 1);
  assert.ok(receipt.markerId != null, 'the cut stays cut: marker spawned');

  env.emit('swarm:hiveSacKilled', { wave: 8, sacId: 77 });
  receipt = env.receipts.get(PLANTS_BROOD_SHORTCUT_EVENT)[1];
  assert.equal(receipt.kind, 'brood_follows');
  assert.equal(receipt.cutCount, 2);
  assert.ok(env.cues.some((c) => c.id === 'warning'), 'the Brood coming through is audible');

  assert.equal(isHiveArena('the_hive'), true);
  assert.equal(isHiveArena('helios_core'), false);
  assert.equal(isHiveArena('hive_marrow_1'), false, 'no such arena id exists');
  assert.equal(cutReceiptKind(1), 'cut_open');
  assert.equal(cutReceiptKind(3), 'brood_follows');
});

test('PL-224 negative: not the Hive floor', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'helios_core', phase: 'active', wave: 8 }) });
  env.emit('swarm:hiveSacKilled', { wave: 8, sacId: 78 });
  assert.equal(env.receipts.get(PLANTS_BROOD_SHORTCUT_EVENT).length, 0);
});

// ---- PL-225 The figurehead ------------------------------------------------------------------------------------------

test('PL-225: in the Cryo Drift a Wasp thrown against the passing barge sticks frozen, rides, then despawns', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'cryo_drift', phase: 'active', wave: 14 }) }); // survivalCircuit.js:184
  env.state.simTime = 0;
  env.emit('run:waveStarted', { wave: 14, tick: 840 });
  const barge = env.ofPlant('pl225').find((e) => e.data.plants.pl225.role === 'barge');
  assert.ok(barge, 'the ice barge is out');
  assert.equal(barge.data.swarmFloorPad.label, 'ICE BARGE');
  const at0 = bargePositionAt(0);
  assert.equal(barge.pos.x, at0.x, 'barge starts its circuit at angle 0');

  // far throw: misses the hull
  env.emit('entity:killed', {
    id: 830, killerId: 7, cause: 'ship_collision', impactorId: 2,
    pos: { x: 0, z: 0 }, lootTableId: 'wasp_swarmer', presentation: {},
  });
  assert.equal(env.receipts.get(PLANTS_FIGUREHEAD_EVENT).filter((r) => r.kind === 'stuck').length, 0);

  // thrown against the barge
  env.emit('entity:killed', {
    id: 831, killerId: 7, cause: 'ship_collision', impactorId: 3,
    pos: { x: at0.x + 20, z: at0.z }, lootTableId: 'wasp_swarmer', victimClass: 'wasp_swarmer', presentation: {},
  });
  const stuck = env.receipts.get(PLANTS_FIGUREHEAD_EVENT).find((r) => r.kind === 'stuck');
  assert.ok(stuck, 'it sticks');
  assert.equal(stuck.rideS, 40, 'riding the lane a full circuit');
  assert.equal(barge.data.lampsFlashing, true);

  // it rides with the barge
  const fig = env.state.entities.get(stuck.figureheadId);
  env.state.simTime = 6;
  env.stepAll();
  assert.notEqual(fig.pos.x, at0.x + 20, 'the figurehead rides the lane, not the kill spot');

  // once per run
  env.emit('entity:killed', {
    id: 832, killerId: 7, cause: 'terrain_collision', impactorId: 4,
    pos: { x: at0.x + 10, z: at0.z }, lootTableId: 'wasp_swarmer', presentation: {},
  });
  assert.equal(env.receipts.get(PLANTS_FIGUREHEAD_EVENT).filter((r) => r.kind === 'stuck').length, 1);

  // a full circuit later it thaws off and despawns (no orphan)
  env.state.simTime = 45;
  env.stepAll();
  const thawed = env.receipts.get(PLANTS_FIGUREHEAD_EVENT).find((r) => r.kind === 'thawed_off');
  assert.ok(thawed, 'thaw receipt');
  assert.equal(env.state.entities.has(stuck.figureheadId), false, 'thawed figurehead despawned');

  assert.equal(isStuckWaspKill({ cause: 'ship_collision', lootTableId: 'wasp_swarmer' }), true);
  assert.equal(isStuckWaspKill({ cause: 'kinetic', lootTableId: 'wasp_swarmer' }), false);
  assert.equal(isCryoArena('cryo_drift'), true);
  assert.equal(isCryoArena('storm_lattice'), false);
});

test('PL-225 negative: no barge outside the Cryo Drift', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'storm_lattice', phase: 'active', wave: 14 }) }); // survivalCircuit.js:190
  env.emit('run:waveStarted', { wave: 14, tick: 840 });
  assert.equal(env.spawned.length, 0, 'no barge on a storm floor');
});

// ---- PL-226 The ding --------------------------------------------------------------------------------------------------

test('PL-226: in the Storm Lattice the dings land before the arc, one per relay pylon', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'storm_lattice', phase: 'active', wave: 21 }) });
  // real room solids: id 'survival-room-w<wave>-<toyId>', data.roomToyId carries the toy id
  const relayA = relaySolid(env, 'survival-room-w21-relay_1', 'relay_1', { x: 0, z: 0 });
  relaySolid(env, 'survival-room-w21-relay_2', 'relay_2', { x: 100, z: 0 });

  env.emit('survivalArena:stormWarning', {
    wave: 21, serial: 1, atSim: env.state.simTime, expiresAtSim: env.state.simTime + 4, warningS: 4,
    segments: [], nodes: [{ x: 0, z: 0, radius: 90 }, { x: 100, z: 0, radius: 90 }],
  });
  const schedule = env.receipts.get(PLANTS_DING_EVENT).find((r) => r.kind === 'schedule');
  assert.ok(schedule, 'schedule receipt');
  assert.equal(schedule.dings, 2);

  // pure: every ding strictly inside the warning window
  const dings = dingScheduleFromWarning({ atSim: 0, warningS: 4, nodes: [{ x: 0, z: 0 }, { x: 1, z: 1 }] });
  assert.equal(dings.length, 2);
  assert.ok(dings.every((d) => d.at > 0 && d.at < 4), 'move on the ding, not the arc');

  // dings fire as sim time passes and pulse the nearest relay (matched by data.roomToyId)
  env.advance(1.5);
  assert.ok(env.receipts.get(PLANTS_DING_EVENT).some((r) => r.kind === 'ding'), 'first ding fired');
  assert.equal(relayA.data.lampsFlashing, true);
  env.advance(2);
  assert.equal(env.receipts.get(PLANTS_DING_EVENT).filter((r) => r.kind === 'ding').length, 2, 'both dings fired');

  // one schedule per warning serial
  env.emit('survivalArena:stormWarning', {
    wave: 21, serial: 1, atSim: env.state.simTime, warningS: 4, segments: [], nodes: [{ x: 0, z: 0 }],
  });
  assert.equal(env.receipts.get(PLANTS_DING_EVENT).filter((r) => r.kind === 'schedule').length, 1);

  // cancel clears pending dings
  env.emit('survivalArena:stormWarning', {
    wave: 21, serial: 2, atSim: env.state.simTime, warningS: 4, segments: [], nodes: [{ x: 5, z: 5 }],
  });
  env.emit('survivalArena:stormCancel', { wave: 21, serial: 2 });
  const dingCount = env.receipts.get(PLANTS_DING_EVENT).filter((r) => r.kind === 'ding').length;
  env.advance(5);
  assert.equal(env.receipts.get(PLANTS_DING_EVENT).filter((r) => r.kind === 'ding').length, dingCount, 'cancelled schedule stays silent');
});

test('PL-226 negative: not a storm floor', () => {
  const env = makeEnv({ run: swarmRun({ arenaId: 'helios_core', phase: 'active', wave: 21 }) });
  env.emit('survivalArena:stormWarning', { serial: 9, atSim: 0, warningS: 4, segments: [], nodes: [{ x: 0, z: 0 }] });
  assert.equal(env.receipts.get(PLANTS_DING_EVENT).length, 0);
  assert.equal(isStormArena('storm_lattice'), true);
  assert.equal(isStormArena('helios_core'), false);
});

// ---- determinism smoke: identical double-run --------------------------------------------------------------------------

test('determinism: the same scripted Pit session produces byte-identical plant receipts', () => {
  const sorta = (v) => {
    if (Array.isArray(v)) return v.map(sorta);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorta(v[k])]));
    }
    return v;
  };
  const scenario = () => {
    const env = makeEnv({ run: swarmRun({ seed: 777, wave: 4, phase: 'active' }) });
    addEntity(env, 7, { pos: { x: 0, z: 0 }, data: {} });
    gateSolid(env, 'survival-room-w4-foundry_gate_a', { x: 100, z: 100 });
    addEntity(env, 80, { pos: { x: 0, z: 0 }, data: { plantsGong: true } });
    addEntity(env, 50, { pos: { x: 300, z: 0 }, data: { kind: 'barrel' } });
    env.emit('run:waveStarted', { wave: 4, tick: 240 });
    env.endRound(4, 'cleanup');
    const drone = env.ofPlant('pl114').find((e) => e.data.plants.pl114.role === 'banner_drone');
    if (drone) env.emit('combat:crushed', { entityId: drone.id });
    env.emit('entity:spawned', { id: 900, type: 'ship', entity: { id: 900, data: { lootTableId: 'wasp_swarmer' } } });
    env.state.run.phase = 'active';
    env.state.simTime = 1;
    env.state.tick = 60;
    env.emit('entity:killed', {
      id: 901, killerId: 7, cause: 'ship_collision', impactorId: 5,
      pos: { x: 30, z: 0 }, lootTableId: 'wasp_swarmer', presentation: {},
    });
    env.emit('entity:killed', {
      id: 902, killerId: 7, cause: 'terrain_collision', impactorId: 6,
      pos: { x: 40, z: 0 }, lootTableId: 'reaver_pirate', presentation: {},
    });
    env.emit('swarm:dropCollected', { id: 903, dropId: 'magnet', name: 'Magnet', wave: 4 });
    env.state.simTime = 2;
    env.state.tick = 120;
    env.emit('survivalArena:stormWarning', {
      wave: 4, serial: 3, atSim: 2, warningS: 4,
      segments: [], nodes: [{ x: 0, z: 0 }, { x: 50, z: 0 }],
    });
    env.advance(3, 0.5);
    const lines = env.voice.map((v) => `${v.id}|${v.text}`);
    const receipts = [];
    for (const [name, rows] of env.receipts) for (const r of rows) receipts.push(`${name}|${JSON.stringify(sorta(r))}`);
    const cues = env.cues.map((c) => `${c.id}|${c.gain}|${c.rate}`);
    return { lines, receipts, cues };
  };
  const a = scenario();
  const b = scenario();
  assert.deepEqual(a, b, 'two identical runs, identical receipts');
});
