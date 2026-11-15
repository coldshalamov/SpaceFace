// PRI-11a — round one opens with three Wasps; the pack and the Brood follow the first
// kill, the pilot's first act plus ten active seconds, or a twenty-second ceiling.
//
// Drives the REAL wave owner and the REAL arena (with the real Brood engine) on a real
// seed — the same room() fixture swarm-course-cast drives — so the arrivals asserted
// here are the same materialization path the game runs, not a stub of it. The beat's
// own ledger lives in the wave owner; the Brood only ever asks it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { applyOpeningLesson, planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmGateFor, resetSwarmPressureState } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

// One wave's live room: a real swarm run state, the real wave owner, the real arena
// and its real Brood engine — the wavePlanned/waveStarted pair the phase machine
// emits, scripted straight onto the bus.
function room(seed = SEED, wave = 1, { retireToken = 1 } = {}) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    { wave, phase: 'active', retireToken },
  );
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = {
    id: state.nextEntityId++, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400, data: {},
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id, p && p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = {
        ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((e) => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  const waveSys = Object.create(survivalWave);
  const ctx = {
    state,
    bus,
    helpers,
    // The Brood asks the wave owner whether the beat is open; in production the
    // registry resolves by system name. Here the same seam returns the live owner.
    registry: { get: (name) => (name === 'survivalWave' ? waveSys : null) },
  };
  waveSys.init(ctx);
  const arena = Object.create(swarmArena);
  arena.init(ctx);
  return { state, bus, helpers, events, budget, player, waveSys, arena, ctx };
}

function beginWave(h, wave = h.state.run.wave, seed = h.state.run.seed, plan = null) {
  const resolved = plan || planWave({ seed, arenaId: ARENA, wave, ruleset: 'swarm' });
  assert.ok(resolved && resolved.ok !== false, `wave ${wave} plans clean`);
  h.bus.emit('run:wavePlanned', { wave, plan: resolved });
  h.bus.emit('run:waveStarted', { wave });
  return resolved;
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.arena.update();
    h.waveSys.update();
  }
}

function liveHostiles(h) {
  return h.state.entityList.filter((e) => e
    && e.alive !== false && e.data && e.data.runCohort === 'survival'
    && e.data.swarmGateFlare !== true && e.type !== 'beacon');
}

function liveWasps(h) {
  // The cohort's combatants are ships; flares and beacons are already filtered out.
  // The seat-fillers the full-room test parks are asteroids — they count toward the
  // concurrency ledger without ever reading as one of the round's Wasps.
  return liveHostiles(h).filter((e) => e.type === 'ship');
}

function broodAlive(h) {
  const engine = h.arena && h.arena._brood;
  return engine && typeof engine.census === 'function' ? engine.census().alive : -1;
}

// The kill path the real emitters use, minus combat: the killed receipt resolves the
// cohort member, and the destroy receipt drops it and frees the spawn slot.
function kill(h, entity) {
  entity.alive = false;
  h.bus.emit('entity:killed', { id: entity.id, tick: h.state.tick });
  h.helpers.removeEntity(entity.id);
}

function materialized(h) {
  return h.events.filter((e) => e.event === 'run:waveMaterialized'
    && e.payload && e.payload.admitted > 0 && typeof e.payload.enemyId === 'string');
}

function beatEnded(h) {
  return h.events.filter((e) => e.event === 'swarm:openingBeatEnded');
}

function distanceToPlayer(h, entity) {
  return Math.hypot(entity.pos.x - h.player.pos.x, entity.pos.z - h.player.pos.z);
}

// ---------------------------------------------------------------------------
// the authored split
// ---------------------------------------------------------------------------

test('round 1 plans ten Wasps total: three at tick 0, seven owed to the beat, one gate', () => {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: 'swarm' });
  const wasps = plan.schedule.filter((e) => e.enemyId === 'wasp_swarmer');
  assert.equal(wasps.reduce((s, e) => s + e.count, 0), 10, 'the cast still fields ten Wasps');
  const openers = wasps.filter((e) => e.afterOpeningBeat !== true);
  const owed = wasps.filter((e) => e.afterOpeningBeat === true);
  assert.equal(openers.reduce((s, e) => s + e.count, 0), 3, 'three Wasps open the round');
  assert.equal(owed.reduce((s, e) => s + e.count, 0), 7, 'seven are owed to the beat');
  assert.equal(new Set(wasps.map((e) => e.gateGroup)).size, 1, 'all ten come through one gate');
  assert.equal(openers[0].gateGroup, owed[0].gateGroup, 'the pack follows through the same gate');
});

test('ordinary launch: three Wasps land on the first tick, nothing else, no Brood', () => {
  const h = room();
  beginWave(h, 1);
  const first = materialized(h);
  assert.equal(first.length, 1, 'one materialization receipt on the opening tick');
  assert.equal(first[0].payload.enemyId, 'wasp_swarmer');
  assert.equal(first[0].payload.admitted, 3);
  assert.equal(liveWasps(h).length, 3, 'exactly three bodies stand in the room');
  assert.equal(broodAlive(h), 0, 'the Brood waits for the beat to end');
  // The three stand alone through the beat — no stream top-up beside them.
  tick(h, 120);
  assert.equal(liveWasps(h).length, 3, 'two seconds in, still the three');
  assert.equal(broodAlive(h), 0, 'the Brood is still held');
  assert.equal(beatEnded(h).length, 0, 'an idle pilot has not ended the beat');
});

test('kill one of the three: the seven follow through the same gate and the Brood begins', () => {
  const h = room();
  beginWave(h, 1);
  const opening = materialized(h)[0].payload;
  const victim = liveWasps(h)[0];
  kill(h, victim);
  // The kill ending releases the Brood on the owner's word — synchronously, not on a
  // second timer.
  assert.equal(beatEnded(h).length, 1, 'the beat ended exactly once');
  assert.equal(beatEnded(h)[0].payload.reason, 'kill');
  assert.equal(beatEnded(h)[0].payload.wave, 1);
  assert.ok(broodAlive(h) > 0, 'the Brood launches on the beat\'s end');
  // The pack dispatches on the owner's next update — through the ordinary owed path.
  tick(h, 1);
  assert.equal(liveWasps(h).length, 9, 'two survivors plus the seven the round was owed');
  const rest = materialized(h).filter((e, i) => i > 0);
  assert.ok(rest.length >= 1, 'the owed package materialized after the kill');
  assert.equal(rest[0].payload.enemyId, 'wasp_swarmer');
  assert.equal(rest[0].payload.gateGroup, opening.gateGroup, 'same gate as the opening three');
  assert.equal(rest[0].payload.gateGroup, swarmGateFor(1, 0), 'the authored gate itself');
  for (const wasp of liveWasps(h)) {
    const d = distanceToPlayer(h, wasp);
    assert.ok(Number.isFinite(d) && d > 10, `a wasp materialized in place, not on the pilot (d=${d})`);
  }
});

test('never act: the rest arrive on the twenty-second ceiling, not before', () => {
  const h = room();
  beginWave(h, 1);
  // Nineteen and a half seconds of a pilot who never fires and never moves.
  tick(h, 19 * 60 + 30);
  assert.equal(liveWasps(h).length, 3, 'still the three just shy of the ceiling');
  assert.equal(broodAlive(h), 0);
  assert.equal(beatEnded(h).length, 0);
  tick(h, 90); // past twenty seconds
  const ended = beatEnded(h);
  assert.equal(ended.length, 1, 'the beat ended exactly once');
  assert.equal(ended[0].payload.reason, 'ceiling');
  assert.ok(ended[0].payload.tick >= 19 * 60 + 30,
    `the beat held past 19.5s (ended at tick ${ended[0].payload.tick})`);
  assert.ok(ended[0].payload.tick <= 21 * 60,
    `and released by twenty-one seconds (ended at tick ${ended[0].payload.tick})`);
  assert.ok(liveWasps(h).length > 3, 'the pack is in the room');
  assert.ok(broodAlive(h) > 0, 'the Brood followed the same ending');
});

test('act without killing: the rest arrive ten active seconds after the first act', () => {
  const h = room();
  beginWave(h, 1);
  tick(h, 60); // one quiet second — still only the three
  assert.equal(liveWasps(h).length, 3);
  // A trigger pull is the honest first act: the same input field input.js reads.
  h.state.input.fire = true;
  tick(h, 1);
  h.state.input.fire = false;
  tick(h, 9 * 60); // ~10 s in, under ten since the act
  assert.equal(liveWasps(h).length, 3, 'still the three inside the acted window');
  assert.equal(beatEnded(h).length, 0);
  tick(h, 90); // past eleven seconds elapsed — comfortably past act+10s
  const ended = beatEnded(h);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].payload.reason, 'acted');
  assert.ok(ended[0].payload.tick < 20 * 60, 'the acted ending lands well before the ceiling');
  assert.ok(liveWasps(h).length > 3);
  assert.ok(broodAlive(h) > 0);
});

test('pause during the beat spends nothing; resume continues on the same clock', () => {
  const h = room();
  beginWave(h, 1);
  h.state.input.fire = true;
  tick(h, 1);
  h.state.input.fire = false;
  tick(h, 300); // five seconds of active sim — the acted window is counting
  assert.equal(liveWasps(h).length, 3);
  // A pause is the sim not ticking: no updates, no simTime advance, however long the
  // player is away. On resume the beat must measure only the seconds that ran.
  const eventsAtPause = h.events.length;
  tick(h, 240); // four more active seconds — at ~9 s elapsed, still inside act+10
  assert.equal(liveWasps(h).length, 3, 'the acted window has not closed yet');
  tick(h, 120); // past it — the pack lands on the same act+10s clock an unpaused run used
  const ended = beatEnded(h);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].payload.reason, 'acted');
  assert.ok(h.events.length > eventsAtPause);
  assert.ok(liveWasps(h).length > 3);
});

test('a second update inside one tick cannot double-spend the beat clock', () => {
  const h = room();
  beginWave(h, 1);
  h.state.input.fire = true;
  tick(h, 1);
  h.state.input.fire = false;
  // Sit one update short of the acted window closing, then run the owner's update
  // twice inside the same tick. simTime did not move, so nothing may release.
  tick(h, 9 * 60 - 1);
  const waspsBefore = liveWasps(h).length;
  h.waveSys.update();
  h.waveSys.update();
  assert.equal(liveWasps(h).length, waspsBefore, 'a doubled update spent no beat time');
  tick(h, 90);
  assert.equal(beatEnded(h).length, 1, 'the release event fires exactly once');
});

test('a stale release receipt cannot free the current run\'s Brood hold', () => {
  const h = room();
  beginWave(h, 1);
  assert.equal(broodAlive(h), 0);
  // A receipt stamped by a different wave cannot free this run's hold.
  h.bus.emit('swarm:openingBeatEnded', { wave: 2, runToken: 1, reason: 'kill', tick: 0 });
  assert.equal(broodAlive(h), 0, 'a mismatched wave did not free the hold');
  // Nor one stamped by a run that no longer exists.
  h.bus.emit('swarm:openingBeatEnded', { wave: 1, runToken: 99, reason: 'kill', tick: 0 });
  assert.equal(broodAlive(h), 0, 'a stale run token did not free the hold');
  // Nor one signed by nobody.
  h.bus.emit('swarm:openingBeatEnded', { wave: 1, reason: 'kill', tick: 0 });
  assert.equal(broodAlive(h), 0, 'an unsigned release did not free the hold');
  assert.equal(liveWasps(h).length, 3, 'the held pack never moved either');
  // The owner's own word still lands — one genuine kill ends it.
  kill(h, liveWasps(h)[0]);
  assert.ok(broodAlive(h) > 0, 'the owner\'s matching receipt releases the Brood');
});

test('retry re-arms the beat on the new run token: three Wasps again', () => {
  const h = room();
  beginWave(h, 1);
  // The pilot acts in run one — its first-act stamp is keyed to run one's token.
  h.state.input.fire = true;
  tick(h, 1);
  h.state.input.fire = false;
  for (const wasp of [...liveWasps(h)]) kill(h, wasp);
  h.bus.emit('run:ended', { outcome: 'defeat' });
  // Retry mints a new run object with a new retireToken — the same path runSession
  // takes on its next beginRequested.
  h.state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED }),
    { wave: 1, phase: 'active', retireToken: 2 },
  );
  beginWave(h, 1);
  assert.equal(liveWasps(h).length, 3, 'a retried round one opens with the three again');
  assert.equal(broodAlive(h), 0, 'and the Brood waits again');
  // Run one's act must not count for run two — the beat waits out its own ten seconds
  // past a new act, or the ceiling without one.
  tick(h, 12 * 60);
  assert.equal(liveWasps(h).length, 3, 'the stale first-act stamp did not release the pack');
  tick(h, 9 * 60);
  const ended = beatEnded(h).filter((e) => e.payload && e.payload.runToken === 2);
  assert.equal(ended.length, 1, 'the retried beat ended once, on run two\'s token');
  assert.equal(ended[0].payload.reason, 'ceiling', 'with no new act it took the ceiling');
  assert.ok(liveWasps(h).length > 3);
});

test('round 2 is byte-for-byte the round it was: five Wasps up front, Brood at the bell', () => {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 2, ruleset: 'swarm' });
  assert.ok(plan.schedule.every((e) => e.afterOpeningBeat !== true), 'no beat debt rides round 2');
  const firstTick = plan.schedule.filter((e) => e.atTick === 0);
  assert.equal(firstTick.length, 1);
  assert.equal(firstTick[0].enemyId, 'wasp_swarmer');
  assert.equal(firstTick[0].count, 5, 'round 2 still opens with five Wasps through the front gate');
  assert.equal(firstTick[0].gateGroup, 'front');
  const h = room(SEED, 2);
  beginWave(h, 2);
  assert.equal(liveWasps(h).length, 5, 'the live room fields the same five it did');
  assert.ok(broodAlive(h) > 0, 'and the Brood launches with the wave as it always did');
  assert.equal(beatEnded(h).length, 0, 'round 2 has no opening beat');
});

test('the training lesson keeps its own law: one Wasp, the forty-five-second hold', () => {
  const h = room();
  const base = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: 'swarm' });
  beginWave(h, 1, SEED, applyOpeningLesson(base));
  const wasps = liveWasps(h);
  assert.equal(wasps.length, 1, 'the lesson fields its single Wasp');
  assert.equal(broodAlive(h), 0, 'the Brood waits on the lesson hold as today');
  tick(h, 120);
  assert.equal(liveWasps(h).length, 1, 'two seconds in the pack is still held');
  kill(h, liveWasps(h)[0]);
  // The lesson releases on the kill the way it always has — the pack lands a short
  // beat later through the held schedule, not through the beat's twenty seconds.
  assert.ok(h.events.some((e) => e.event === 'run:openingLessonReleased'
    || e.event === 'swarm:openingBeatEnded'), 'a release receipt fired');
  tick(h, 240); // the lesson's short release beat
  assert.ok(liveWasps(h).length > 1, 'the pack follows the lesson\'s own release');
  assert.ok(broodAlive(h) > 0, 'the Brood follows it too');
});

test('a full room keeps the owed pack owed — it retries, it does not burst or teleport', () => {
  const h = room();
  beginWave(h, 1);
  // Stand eight more cohort members in the room before ending the beat — joined
  // through the public cohortJoined seam a called pack uses, so the same concurrency
  // ledger the dispatch clamp reads is the one filling. With it full the seven must
  // stay owed at the ordinary retry cadence rather than forcing themselves in.
  const standIns = [];
  for (let i = 0; i < 8; i++) {
    standIns.push(h.helpers.spawnEntity({
      type: 'asteroid', pos: { x: 900 + i * 20, z: 900 }, vel: { x: 0, z: 0 },
      radius: 10, mass: 400, data: { runCohort: 'survival', runWave: 1 },
    }));
  }
  h.bus.emit('survivalWave:cohortJoined', { wave: 1, ids: standIns.map((e) => e.id) });
  kill(h, liveWasps(h)[0]); // ends the beat
  tick(h, 1);
  assert.equal(liveWasps(h).length, 2, 'the pack could not seat — it stays owed');
  tick(h, 60);
  assert.equal(liveWasps(h).length, 2, 'still owed a second of retries later');
  // Free the room and the owed pack lands through the same gate — bounded, not a
  // burst. The stream may top up beside it, so the proof is the owed package's own
  // receipt: one scheduled landing of seven through the authored gate.
  for (const e of standIns) h.helpers.removeEntity(e.id);
  tick(h, 60);
  const owedLandings = materialized(h).filter((e) => e.payload
    && e.payload.reinforcement !== true && e.payload.admitted === 7);
  assert.equal(owedLandings.length, 1, 'the owed seven landed as one package once seats existed');
  assert.equal(owedLandings[0].payload.gateGroup, swarmGateFor(1, 0), 'through the authored gate');
  assert.ok(liveWasps(h).length >= 9, 'the room seats the pack (and any stream top-up)');
  for (const wasp of liveWasps(h)) {
    const d = distanceToPlayer(h, wasp);
    assert.ok(d > 10 && d < 600, `an arrival through the gate ring, not a teleport (d=${d})`);
  }
});

test('same seed, same room, same wave: the opening is deterministic', () => {
  const positionsOf = (h) => liveWasps(h)
    .map((e) => `${Math.round(e.pos.x)},${Math.round(e.pos.z)}`).sort();
  const a = room();
  beginWave(a, 1);
  const b = room();
  beginWave(b, 1);
  assert.deepEqual(positionsOf(a), positionsOf(b), 'the three land identically under one seed');
});
