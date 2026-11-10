// SF-075 — a rematch reveals mastery, not a bigger score. Returning to the same sea (same
// ruleset + arena + seed) compares this run's physical play against the last attempt's and
// names what actually moved: hull hits taken, kills the room made for you, breaths bought.
// When nothing real moved, the results stay quiet — no motivational copy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { rematchLineFor, survivalResults } from '../src/systems/survivalResults.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 11;
const ARENA = 'swarm_pit';

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, emitted, player };
}

// One full run: begin → take the emitted physical facts → die. Returns the published result.
function runOnce(h, { seed = SEED, arena = ARENA, ruleset = SWARM_RULESET, wave = 6,
  collisions = 0, improvised = 0, breaths = 0, shots = 0 } = {}) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed, arenaId: arena });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    h.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  h.state.run.wave = wave;
  h.bus.emit('run:waveStarted', { wave }); // the phase machine's own receipt — sets the wave as entered
  for (let i = 0; i < shots; i++) kill(h, null);
  for (let i = 0; i < improvised; i++) kill(h, 'terrain_collision');
  for (let i = 0; i < collisions; i++) {
    // physics:impact is the channel player contact actually travels: the player is always
    // aId or bId with playerInvolved, never the combat-consequence target.
    h.bus.emit('physics:impact', {
      aId: 77 + i, bId: 1, playerInvolved: true, preSolveClosingSpeed: 30, tick: 100 + i,
    });
  }
  for (let i = 0; i < breaths; i++) h.bus.emit('swarm:pressureSpend', {});
  h.bus.emit('player:death', { attacker: 'Wasp Swarmer', cause: 'rammed', vitalsPct: {} });
  const ready = h.emitted.filter((e) => e.event === 'run:resultsReady');
  const result = ready[ready.length - 1].payload;
  h.emitted.length = 0;
  // The player reads the plate, backs out to the menu, and launches again — the run tears down
  // to inactive before the next begin is legal.
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'ended', nextPhase: 'inactive', reason: 'return_to_menu', tick: 0,
  });
  return result;
}

function kill(h, cause) {
  const id = h.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'ship', team: 1, pos: { x: 5, z: 5 },
    data: { level: 1, runCohort: 'survival' },
  };
  h.state.entities.set(id, entity);
  entity.alive = false;
  // The production kill receipt carries the cause under presentation.cause.
  h.bus.emit('entity:killed', {
    id, killerId: 1, type: 'ship', pos: { x: 5, z: 5 },
    presentation: cause ? { cause } : undefined,
  });
}

test('the first attempt on a sea carries no comparison — memory starts empty', () => {
  const h = boot();
  const result = runOnce(h, { collisions: 2, improvised: 1 });
  assert.equal(result.rematch.attempt, 1);
  assert.equal(result.rematch.prior, null);
  assert.equal(result.rematch.line, null);
  assert.ok(!result.moments.some((m) => /Same sea/.test(m.text)),
    'no rematch line leaks into the story on a first attempt');
});

test('the rematch names a real physical difference — cleaner hull, deadlier room', () => {
  const h = boot();
  const sea = 21; // rematch memory is per-sea per session — each test sails its own seed
  runOnce(h, { seed: sea, collisions: 4, improvised: 1, wave: 5 });
  const second = runOnce(h, { seed: sea, collisions: 1, improvised: 4, wave: 5 });

  assert.equal(second.rematch.attempt, 2);
  assert.equal(second.rematch.prior.collisions, 4);
  assert.equal(second.rematch.prior.improvised, 1);
  assert.match(second.rematch.line, /Same sea, attempt 2/);
  assert.match(second.rematch.line, /hull 4 times last run — 1 this time/);
  assert.match(second.rematch.line, /it killed 4 for you — 1 before/);
  // The rematch sentence leads the story — it is the headline of a rematched run.
  assert.equal(second.moments[0].text, second.rematch.line);
});

test('a run where nothing physical moved stays silent — no score-vibe filler', () => {
  const h = boot();
  const sea = 22;
  const first = runOnce(h, { seed: sea, collisions: 3, improvised: 2, breaths: 1, wave: 6 });
  const second = runOnce(h, { seed: sea, collisions: 3, improvised: 2, breaths: 1, wave: 8, shots: 12 });

  assert.equal(second.rematch.attempt, 2);
  assert.equal(second.rematch.line, null, 'deeper wave and more kills are a score story, not a physical one');
  assert.ok(!second.moments.some((m) => /Same sea/.test(m.text)));
  // The raw record still ships so the results plate can show the comparison quietly.
  assert.equal(second.rematch.prior.wave, first.wave);
});

test('a different sea never borrows the last sea\'s memory', () => {
  const h = boot();
  const sea = 23;
  runOnce(h, { seed: sea, collisions: 4, improvised: 3 });
  const otherSea = runOnce(h, { seed: sea + 90, collisions: 0, improvised: 0 });
  assert.equal(otherSea.rematch.attempt, 1, 'a different seed is a different sea');
  assert.equal(otherSea.rematch.prior, null);
  const otherArena = runOnce(h, { seed: sea, arena: 'other_pit', collisions: 0 });
  assert.equal(otherArena.rematch.attempt, 1, 'a different arena is a different sea');
  const otherRuleset = runOnce(h, { seed: sea, ruleset: 'scored', collisions: 0 });
  assert.equal(otherRuleset.rematch.attempt, 1, 'a different ruleset is a different sea');
});

test('attempts keep counting and the comparison always reads the latest attempt', () => {
  const h = boot();
  const sea = 24;
  runOnce(h, { seed: sea, collisions: 5 });
  runOnce(h, { seed: sea, collisions: 5 });
  const third = runOnce(h, { seed: sea, collisions: 0, breaths: 2 });
  assert.equal(third.rematch.attempt, 3);
  assert.equal(third.rematch.prior.collisions, 5, 'attempt 2\'s numbers, not attempt 1\'s');
  assert.match(third.rematch.line, /attempt 3/);
  assert.match(third.rematch.line, /hull 5 times last run — 0 this time/);
});

test('collision ticks dedupe — one bump cannot count twice, and hits on others do not count', () => {
  const h = boot();
  const sea = 25;
  runOnce(h, { seed: sea });
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: sea, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    h.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  h.state.run.wave = 3;
  h.bus.emit('run:waveStarted', { wave: 3 });
  h.bus.emit('physics:impact', { aId: 7, bId: 1, playerInvolved: true, preSolveClosingSpeed: 40, tick: 50 });
  h.bus.emit('physics:impact', { aId: 7, bId: 1, playerInvolved: true, preSolveClosingSpeed: 40, tick: 50 }); // same pair, same tick — a re-emitted receipt
  h.bus.emit('physics:impact', { aId: 9, bId: 5, playerInvolved: false, preSolveClosingSpeed: 40, tick: 50 }); // not the player
  h.bus.emit('physics:impact', { aId: 8, bId: 1, playerInvolved: true, preSolveClosingSpeed: 3, tick: 51 }); // below the scar floor — a graze
  h.bus.emit('physics:impact', { aId: 8, bId: 1, playerInvolved: true, preSolveClosingSpeed: 40, tick: 51 });
  h.bus.emit('player:death', { attacker: 'X', cause: 'rammed', vitalsPct: {} });
  const result = h.emitted.filter((e) => e.event === 'run:resultsReady').pop().payload;
  // Prior run had 0 collisions; this run took exactly 2.
  assert.match(result.rematch.line, /hull 2 times — 0 last run/);
});

test('a run abandoned before the fight is not an attempt and never overwrites the sea', () => {
  const h = boot();
  const sea = 26;
  const real = runOnce(h, { seed: sea, collisions: 4 });
  assert.equal(real.rematch.attempt, 1);
  // Abort the next run while it is still in loadout — no waveStarted ever fires.
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: sea, arenaId: ARENA });
  h.bus.emit('run:ended', { outcome: 'aborted', reason: 'return_to_menu' });
  const aborted = h.emitted.filter((e) => e.event === 'run:resultsReady').pop().payload;
  assert.equal(aborted.rematch, null, 'a run that never entered a wave publishes no rematch');
  // The next real attempt still compares against the first run — the abort wrote nothing.
  const next = runOnce(h, { seed: sea, collisions: 0 });
  assert.equal(next.rematch.attempt, 2);
  assert.equal(next.rematch.prior.collisions, 4, 'baseline survived the aborted run');
});

test('rematchLineFor is a pure comparator — it never invents a difference', () => {
  const prior = { collisions: 3, improvised: 1, breaths: 0, wave: 5, kills: 20 };
  assert.equal(rematchLineFor(null, prior, 2), null);
  assert.equal(rematchLineFor(prior, null, 2), null);
  assert.equal(rematchLineFor('junk', prior, 2), null);
  assert.equal(rematchLineFor(prior, { ...prior }, 2), null, 'identical run: nothing to say');
  // Missing keys coerce to zero rather than producing NaN sentences.
  const line = rematchLineFor(prior, { collisions: 0, improvised: 4, breaths: 0 }, 2);
  assert.match(line, /attempt 2/);
  assert.match(line, /it killed 4 for you — 1 before/);
});
