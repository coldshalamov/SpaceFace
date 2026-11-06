// inf-hive-tide-close — a Hive wave whose sacs all die before spending their share keeps the
// whole Brood engine grinding on an empty room until the wave refit. The strand is authored
// ("a sac killed early strands its share, which is the tide the player cut" — swarmBrood.js
// B4), but the strand used to be INVISIBLE to the step's own done gate: the gate reads
// `sacBudget <= 0`, a stranded share never drains, and an emptied Hive room paid the full
// per-tick machinery — player/rock/mover caches, the spatial grid rebuild, the aura and
// link passes — on zero bodies for the rest of the wave. The gate now reads the tide's
// heartbeat: a live unspent sac births every HIVE_SAC_PERIOD_S, so a budget silent past
// two full cadences is the strand itself, named in the census and the view, and the gate
// closes. The population story is untouched: the share still never hatches.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { HIVE_ARENA_ID, HIVE_SAC_PERIOD_S } from '../src/systems/theHiveArena.js';

// Past this much silence a held tide is the authored strand, not a pending tide.
const SILENCE_S = HIVE_SAC_PERIOD_S * 2 + 2;

function fixture({ arenaId } = {}) {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.simTime = 60; // a wave installed a breath into the run
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave: 1, phase: 'active', arenaId: arenaId || HIVE_ARENA_ID });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  return { state, bus, player };
}

function hiveEngine(h) {
  const engine = createBroodEngine({ getState: () => h.state, bus: h.bus, fieldList: () => [] });
  engine.prepareWave(h.state.run, h.state.run.wave);
  engine.spawnWave(h.state);
  return engine;
}

test('a Hive wave holds a real reserve, and a fresh tide keeps the step alive', () => {
  const h = fixture();
  const engine = hiveEngine(h);
  const census = engine.census();
  assert.ok(census.sacBudget > 0, `a Hive wave must hold back a reserve (got ${census.sacBudget})`);
  assert.equal(census.sacStranded, 0, 'a fresh tide is deliverable, not stranded');
  assert.ok(census.alive > 0, 'the immediate share fields');
  // A room with live bodies (or a live tide) keeps stepping: the gate stays open.
  assert.equal(engine.step(h.state), true, 'a populated Hive room steps');
  engine.clear();
});

test('all sacs killed unspent: the silenced strand closes the gate on an empty room', () => {
  const h = fixture();
  const engine = hiveEngine(h);
  const held = engine.census().sacBudget;
  assert.ok(held > 0);
  // The tide the player cut: every sac dies before its first birth, then the bodies die too.
  engine.onExplosion({ pos: { x: 0, z: 0 }, radius: 100000, ownerId: h.player.id });
  assert.equal(engine.census().alive, 0, 'the room empties');
  assert.equal(engine.census().sacBudget, held, 'the strand still sits in the budget');

  // Inside the silence window the room honestly waits: a sac could still be approaching
  // its next birth. The step stays open through exactly that margin.
  h.state.simTime += SILENCE_S - 1;
  assert.equal(engine.step(h.state), true, 'inside the cadence margin the tide may still deliver');

  // Past it, the strand is named and the gate closes: no more full-machinery ticks on
  // an empty room for the rest of the wave.
  h.state.simTime += 2;
  assert.equal(engine.step(h.state), false, 'the silenced strand closes the done gate');
  assert.equal(engine.census().sacStranded, held, 'the held share is the named strand');
  assert.equal(engine.census().sacBudget, held, 'the population story is untouched');
  // And the closed gate stays closed — every later tick takes the cheap exit.
  h.state.simTime += 1;
  assert.equal(engine.step(h.state), false, 'the closed gate stays closed');
  engine.clear();
});

test('a live tide never reads as stranded, and a birth refreshes the heartbeat', () => {
  const h = fixture();
  const engine = hiveEngine(h);
  // A sac births: the heartbeat moves to now, the budget draws down.
  const before = engine.census().sacBudget;
  const born = engine.sacRelease(40, -40, 2);
  assert.ok(born > 0, 'a live sac delivers its share');
  assert.equal(engine.census().sacBudget, before - born);
  assert.equal(engine.census().sacStranded, 0, 'a birthing tide is not a strand');
  // Bodies die, but the birth was recent: the room honestly waits out the cadence.
  engine.onExplosion({ pos: { x: 0, z: 0 }, radius: 100000, ownerId: h.player.id });
  h.state.simTime += 1;
  assert.equal(engine.step(h.state), true, 'a fresh heartbeat keeps the gate open');
  // The remaining share goes silent past the margin: the gate closes, the remainder strands.
  h.state.simTime += SILENCE_S + 1;
  assert.equal(engine.step(h.state), false, 'the dried tide closes the gate');
  assert.ok(engine.census().sacStranded > 0, 'the remainder is the named strand');
  engine.clear();
});

test('a non-Hive room never waits on a tide it does not have', () => {
  const h = fixture({ arenaId: 'asteroid_mill' });
  const engine = createBroodEngine({ getState: () => h.state, bus: h.bus, fieldList: () => [] });
  engine.prepareWave(h.state.run, h.state.run.wave);
  engine.spawnWave(h.state);
  assert.equal(engine.census().sacBudget, 0, 'no reserve outside the Hive');
  engine.onExplosion({ pos: { x: 0, z: 0 }, radius: 100000, ownerId: h.player.id });
  assert.equal(engine.census().alive, 0);
  assert.equal(engine.step(h.state), false, 'an emptied ordinary room publishes and rests');
  engine.clear();
});
