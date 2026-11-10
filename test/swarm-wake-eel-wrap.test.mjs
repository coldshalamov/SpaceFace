// W-BLOOM-LOW wake eel wrap — the authored `wrapRange`/`wrapS` pair is now a real beat.
//
// The living eel still trails the signature's wake, but inside `wrapRange` it commits to the
// coil: a planted windup that speaks the family's authored line once, and a signature still
// inside when `wrapS` ends takes the grip — a bounded constriction that rides the hull like
// a latched leech and brakes it through the same budgeted impulse. The outs are the tier's
// own verbs: leave the reach during the coil, kill the body, or scrape it off on a wall.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import {
  createBroodEngine,
  BROOD_ATTACK_ARRIVAL_S,
  BROOD_PHASE_FLOCK,
  BROOD_PHASE_WINDUP,
  BROOD_PHASE_WRAPPED,
} from '../src/systems/swarmBrood.js';
import {
  SWARM_BROOD_MAX,
  swarmBroodFamily,
} from '../src/data/swarmBrood.js';

const SEED = 4242;
const DT = 1 / 60;

function boot({ wave = 15 } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const rock = {
    id: state.nextEntityId++, alive: true, type: 'asteroid', collides: true,
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 18, mass: 99999,
  };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [rock],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  return { state, bus, emitted, player, rock };
}

function makeEngine(h) {
  return createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: () => null,
    routeDamage: () => ({ ok: true }),
  });
}

function stepTicks(engine, state, n) {
  for (let t = 0; t < n; t++) {
    state.simTime += DT;
    state.tick = (state.tick || 0) + 1;
    engine.step(state);
  }
}

function familySlot(engine, familyId) {
  const idx = engine._bodies.liveFamilyId.indexOf(familyId);
  if (idx < 0) return -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) return i;
  }
  return -1;
}

/** The first live cell of the named family, alone in the room: every other cell is
 *  moved far away and killed, so no burst or shard can reach the probe. */
function isolate(h, engine, familyId, wave) {
  const i = familySlot(engine, familyId);
  assert.ok(i >= 0, `wave ${wave} fields ${familyId}`);
  engine._bodies.px[i] = 9000;
  engine._bodies.pz[i] = 9000;
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (!engine._bodies.alive[k] || k === i) continue;
    engine._bodies.px[k] = 9000 + k;
    engine._bodies.pz[k] = 9000;
    engine._killDirectForTest(k, 'terrain');
  }
  engine._bodies.vx[i] = 0;
  engine._bodies.vz[i] = 0;
  return i;
}

function telegraphs(h, familyId) {
  return h.emitted.filter((e) => e.event === 'swarm:broodTelegraph'
    && (!familyId || e.payload.familyId === familyId));
}

function remains(h, familyId) {
  return h.emitted.filter((e) => e.event === 'swarm:broodRemains'
    && (!familyId || e.payload.familyId === familyId));
}

/** Remains events at (x,z) — the isolation kills drop bodies for the other cells too. */
function remainsAt(h, familyId, x, z) {
  return remains(h, familyId).filter((e) => e.payload.pos
    && Math.abs(e.payload.pos.x - x) < 30 && Math.abs(e.payload.pos.z - z) < 30);
}

test('the eel inside wrapRange speaks its authored line once per wrap attempt', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 1);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the coil is a planted windup');
  assert.equal(telegraphs(h, 'wake_eel').length, 1, 'the wrap speaks once at coil start');
  const tele = swarmBroodFamily('wake_eel').telegraph;
  const tell = telegraphs(h, 'wake_eel')[0].payload;
  assert.equal(tell.bark, tele.bark);
  assert.equal(tell.line, tele.line, 'the authored wrap line verbatim');
  assert.equal(tell.cue, tele.cue);
  // The whole coil is one tell, not a stream.
  stepTicks(engine, h.state, 60);
  assert.equal(telegraphs(h, 'wake_eel').length, 1, 'a held coil never repeats its line');
});

test('after wrapS the constricting grip applies for a bounded window, then releases', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  const wrapS = swarmBroodFamily('wake_eel').wrapS;
  stepTicks(engine, h.state, Math.ceil(wrapS / DT) + 2);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WRAPPED, 'the finished coil lands the grip');
  // The constriction is the latch's brake: a hull-opposing impulse while the eel rides.
  h.player.vel.x = 30;
  stepTicks(engine, h.state, 1);
  const during = consumePhysicsCommand(h.player);
  assert.ok(during && during.impulses.length >= 1, 'the wrap brakes the hull while it holds');
  assert.ok(during.impulses[0].x < 0, 'the impulse opposes the hull motion');
  // The eel rides the hull at an offset — it is on the hull, not chasing it.
  const dx = engine._bodies.px[i] - h.player.pos.x;
  const dz = engine._bodies.pz[i] - h.player.pos.z;
  assert.ok(Math.hypot(dx, dz) < 20, 'the wrapped eel rides the hull');
  // Bounded window: the grip lets go on its own clock.
  let wrappedTicks = 0;
  for (let t = 0; t < 400 && engine._bodies.phase[i] === BROOD_PHASE_WRAPPED; t++) {
    consumePhysicsCommand(h.player);
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    engine.step(h.state);
    wrappedTicks += 1;
  }
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_FLOCK, 'the grip releases on its own timer');
  assert.ok(wrappedTicks > 60 && wrappedTicks < 200,
    `the hold is a beat, not a latch (${wrappedTicks} ticks)`);
  consumePhysicsCommand(h.player); // drain the release tick's last brake
  stepTicks(engine, h.state, 1);
  const after = consumePhysicsCommand(h.player);
  assert.ok(!after || after.impulses.length === 0, 'no brake once the wrap lets go');
});

test('the authored out: leaving wrapRange mid-coil whiffs the wrap', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 1);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the coil armed');
  // Outrun it: the signature leaves the authored reach and the wrap whiffs.
  h.player.pos.x = 300;
  stepTicks(engine, h.state, 3);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_FLOCK, 'the coil whiffed');
  assert.equal(telegraphs(h, 'wake_eel').length, 1, 'a whiff adds no second tell');
  stepTicks(engine, h.state, 90);
  assert.notEqual(engine._bodies.phase[i], BROOD_PHASE_WRAPPED, 'no grip lands on an empty hull');
});

test('the authored out: the wall scrape sheds a landed wrap, and drops the body', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  const wrapS = swarmBroodFamily('wake_eel').wrapS;
  stepTicks(engine, h.state, Math.ceil(wrapS / DT) + 2);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WRAPPED, 'the grip landed');
  // The leecher's verb verbatim: a fast scrape on a rock kills the wrapped body.
  h.player.pos.x = h.rock.pos.x;
  h.player.pos.z = h.rock.pos.z;
  h.player.vel.x = 40;
  const before = remainsAt(h, 'wake_eel', h.player.pos.x, h.player.pos.z).length;
  stepTicks(engine, h.state, 2);
  assert.equal(engine._bodies.alive[i], 0, 'the scrape sheds the wrap by killing the eel');
  assert.equal(remainsAt(h, 'wake_eel', h.player.pos.x, h.player.pos.z).length, before + 1,
    'the shed eel still leaves its body where it died');
});

test('an eel outside wrapRange never coils and never speaks', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 40;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 30);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_FLOCK, 'out of reach it just trails');
  assert.equal(telegraphs(h, 'wake_eel').length, 0, 'no reach, no tell');
});

test('spawnAt clears the reserve flags: a reused slot never inherits a dead mother\'s tide', () => {
  const h = boot({ wave: 23 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 23);
  engine.spawnWave(h.state);
  stepTicks(engine, h.state, 30); // let deferred arrivals land
  const m = familySlot(engine, 'brood_mother');
  assert.ok(m >= 0, 'wave 23 fields the brood mother');
  // Free a slot, then let her birth once so the told-flag is really set.
  const mite = familySlot(engine, 'mite');
  engine._killDirectForTest(mite, 'terrain');
  stepTicks(engine, h.state, 90);
  assert.equal(engine._bodies.birthTold[m], 1, 'she spoke her birth tell');
  assert.ok(engine._bodies.birthLeft[m] < 12, 'she spent a share of her tide');
  engine._killDirectForTest(m, 'direct');
  // The stale flags are exactly what a reused slot must not keep (kill() already returns
  // the tide share; the told-flag and any hand-seeded remainder are the leak under test).
  assert.equal(engine._bodies.birthTold[m], 1, 'the dead slot still carries the stale flag');
  engine._bodies.birthLeft[m] = 9;
  // The splitter's release lands mid-wave spawns on the first free slots — the mother's.
  const s = familySlot(engine, 'splitter');
  assert.ok(s >= 0, 'wave 23 fields a splitter');
  engine._killDirectForTest(s, 'direct');
  assert.equal(engine._bodies.alive[m], 1, 'the dead slot was reused mid-wave');
  assert.equal(engine._bodies.liveFamilyId[engine._bodies.family[m]], 'mite');
  assert.equal(engine._bodies.birthTold[m], 0, 'the told-flag did not leak');
  assert.equal(engine._bodies.birthLeft[m], 0, 'the tide share did not leak');
});

test('killing the eel mid-wrap ends the grip and still drops its remains', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  const wrapS = swarmBroodFamily('wake_eel').wrapS;
  stepTicks(engine, h.state, Math.ceil(wrapS / DT) + 2);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WRAPPED, 'the grip landed');
  h.player.vel.x = 30;
  const before = remainsAt(h, 'wake_eel', h.player.pos.x, h.player.pos.z).length;
  engine._killDirectForTest(i, 'collision');
  assert.equal(engine._bodies.alive[i], 0, 'the eel is dead');
  assert.equal(remainsAt(h, 'wake_eel', h.player.pos.x, h.player.pos.z).length, before + 1,
    'the killed eel leaves its authored body');
  stepTicks(engine, h.state, 1);
  const after = consumePhysicsCommand(h.player);
  assert.ok(!after || after.impulses.length === 0, 'a dead eel cannot constrict');
});

test('a mid-coil kill also ends the attempt cleanly', () => {
  const h = boot({ wave: 15 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 15);
  engine.spawnWave(h.state);
  const i = isolate(h, engine, 'wake_eel', 15);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 2);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'coiling');
  engine._killDirectForTest(i, 'explosive');
  assert.equal(engine._bodies.alive[i], 0, 'a blast pops the coil');
  assert.equal(remainsAt(h, 'wake_eel', 10, 0).length, 1, 'still leaves the whip body');
});
