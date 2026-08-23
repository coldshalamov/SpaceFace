// PQ-133.07a — Survival style scoring: variety boosts, repeats decay, direct never scores 0.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { killScoreFor, survivalRewards } from '../src/systems/survivalRewards.js';
import {
  applyStyleKill,
  emptyStyle,
  scoreWithStyle,
  styleCauseFromKill,
} from '../src/systems/survivalStyle.js';

const SEED = 7;
const ARENA = 'helios_core';

test('direct kills never score zero, even with a decayed multiplier', () => {
  assert.equal(scoreWithStyle(10, 1, 'direct'), 10);
  assert.equal(scoreWithStyle(10, 0, 'direct'), 10);
  assert.equal(scoreWithStyle(10, 2, 'direct'), 20);
  assert.ok(scoreWithStyle(killScoreFor(1), 1, 'direct') > 0);
});

test('variety across causes raises the multiplier; repeating the last cause decays it', () => {
  let style = emptyStyle();
  assert.equal(style.multiplier, 1);

  style = applyStyleKill(style, 'direct');
  const afterDirect = style.multiplier;
  assert.ok(afterDirect > 1, 'a new cause raises the multiplier');

  style = applyStyleKill(style, 'explosive');
  const afterVariety = style.multiplier;
  assert.ok(afterVariety > afterDirect, 'a different cause raises it further');

  style = applyStyleKill(style, 'explosive');
  assert.ok(style.multiplier < afterVariety, 'repeating the last cause decays toward 1');
  assert.ok(style.multiplier >= 1);
});

test('presentation causes map onto style causes', () => {
  assert.equal(styleCauseFromKill({ presentation: { cause: 'kinetic' } }), 'direct');
  assert.equal(styleCauseFromKill({ presentation: { cause: 'generic' } }), 'direct');
  assert.equal(styleCauseFromKill({ presentation: { cause: 'explosive' } }), 'explosive');
  assert.equal(styleCauseFromKill({ presentation: { cause: 'terrain_collision' } }), 'terrain');
  assert.equal(styleCauseFromKill({ presentation: { cause: 'ship_collision' } }), 'collision');
  assert.equal(styleCauseFromKill({ styleCause: 'direct' }), 'direct');
});

function boot() {
  const state = createGameState(SEED);
  state.player.credits = 1000;
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
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });
  return { state, bus, emitted, player };
}

function beginSurvival(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed: SEED,
    arenaId: ARENA,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from,
      nextPhase: next,
      reason: 'test',
      tick: 0,
    });
    from = next;
  }
}

function spawnAndKill(harness, cause) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id,
    alive: true,
    type: 'ship',
    team: 1,
    pos: { x: 40, z: 0 },
    data: { level: 1, runWave: 1, runCohort: 'survival' },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  entity.alive = false;
  harness.bus.emit('entity:killed', {
    id,
    killerId: harness.player.id,
    type: entity.type,
    pos: entity.pos,
    presentation: { cause },
  });
  return entity;
}

test('the first kill still pays base score; variety then lifts later kills', () => {
  const harness = boot();
  beginSurvival(harness);
  spawnAndKill(harness, 'kinetic');
  const base = killScoreFor(1);
  assert.equal(harness.state.run.score, base, 'first direct kill uses multiplier 1');
  assert.ok(harness.state.run.style.multiplier > 1);

  spawnAndKill(harness, 'explosive');
  assert.ok(harness.state.run.score > base * 2, 'a second distinct cause is worth more than two base kills');
  assert.ok(harness.state.run.style.recentCauses.includes('direct'));
  assert.ok(harness.state.run.style.recentCauses.includes('explosive'));
});
