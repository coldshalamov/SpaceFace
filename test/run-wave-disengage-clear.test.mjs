// A cohort member the morale rules take out of the fight — surrendered or broken off —
// resolves its wave slot instead of holding the round open. Regression for the scored
// Gauntlet gate: seed 4242 wave 2 stranded `active` for 246 sim-seconds with 8/10 resolved
// because the two survivors surrendered (ai.fsm='surrender', ai.passive=true, drifting at
// ~5 wu/s) — alive per the ledger but out of the fight per combatOutcome, and dropped from
// the hostile target seam so the round could never end through public controls.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 4242;

function boot(seed = SEED) {
  const state = createGameState(seed);
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
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

function beginAndReachActive(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA,
  });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
  return harness.state.run;
}

/** Kill a cohort body the way combat does: dead first, then the receipt. */
function killEntity(harness, entity) {
  entity.alive = false;
  harness.bus.emit('entity:killed', { id: entity.id });
}

/** The morale outcome markSurrendered/markFleeing stamps in pirateDisengage.js. */
function stampSurrendered(entity) {
  entity.data = entity.data || {};
  const ai = entity.data.ai || (entity.data.ai = {});
  ai.fsm = 'surrender';
  ai.passive = true;
  ai.pirateDisengaged = true;
  ai.roe = 'hold_fire';
  entity.data.pirateDisengage = { squadId: 'entity:' + entity.id, phase: 'surrender', reason: 'damage-critical', until: 0 };
}

function stampFled(entity) {
  entity.data = entity.data || {};
  const ai = entity.data.ai || (entity.data.ai = {});
  ai.fsm = 'flee';
  ai.passive = true;
  ai.pirateDisengaged = true;
  entity.data.pirateDisengage = { squadId: 'entity:' + entity.id, phase: 'flee', reason: 'damage-retreat', until: 0 };
}

function cohortIds(harness) {
  return harness.spawned
    .filter((entity) => entity && entity.id !== harness.player.id)
    .map((entity) => entity.id);
}

test('a surrendered cohort member resolves instead of holding the wave open', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600); // let the whole wave-1 schedule dispatch
  assert.equal(h.state.run.phase, 'active');
  const ids = cohortIds(h);
  assert.ok(ids.length > 0, 'wave-1 cohort materialized');
  const surrenderedId = ids[0];
  const surrendered = h.state.entities.get(surrenderedId);
  stampSurrendered(surrendered);
  for (const entity of [...h.spawned]) {
    if (entity.id === surrenderedId) continue;
    killEntity(h, entity);
  }
  tick(h, 2);
  assert.equal(h.state.run.phase, 'cleanup',
    'the wave must clear once the last fightable hull is down — surrender is already the win');
  const cleared = h.emitted.filter((e) => e.event === 'run:waveCleared').at(-1);
  assert.ok(cleared, 'run:waveCleared emitted');
  // Resolved, not executed: the surrendered hull stays alive for the
  // surrender-recovery/aftermath flow that owns its fate.
  assert.equal(surrendered.alive, true, 'surrendered crew is not auto-executed at clear');
});

test('a broken-off (fled) cohort member does not pin the round', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const ids = cohortIds(h);
  assert.ok(ids.length > 0);
  const fledId = ids[0];
  stampFled(h.state.entities.get(fledId));
  for (const entity of [...h.spawned]) {
    if (entity.id === fledId) continue;
    killEntity(h, entity);
  }
  tick(h, 2);
  assert.equal(h.state.run.phase, 'cleanup');
  assert.equal(h.state.entities.get(fledId).alive, true, 'a fleeing crew is not auto-executed at clear');
});

test('a living boss retreat intent does not resolve its wave slot', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const boss = h.state.entities.get(cohortIds(h)[0]);
  boss.data.isBoss = true;
  boss.data.ai.forceFlee = true;
  for (const entity of [...h.spawned]) {
    if (entity.id === boss.id) continue;
    killEntity(h, entity);
  }
  tick(h, 2);
  assert.equal(boss.alive, true);
  assert.equal(h.state.run.phase, 'active', 'a boss phase retreat is not a defeat');
  assert.equal(h.emitted.filter((e) => e.event === 'run:waveCleared').length, 0);

  killEntity(h, boss);
  tick(h, 2);
  assert.equal(h.state.run.phase, 'cleanup', 'the existing boss death receipt still clears the wave');
});

test('a live fightable hull still holds the wave open (no premature clear)', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const ids = cohortIds(h);
  const keepId = ids[0];
  h.state.entities.get(keepId).data.ai.fsm = 'flee';
  for (const entity of [...h.spawned]) {
    if (entity.id === keepId) continue;
    killEntity(h, entity);
  }
  tick(h, 30);
  assert.equal(h.state.run.phase, 'active', 'a transient AI retreat state without a morale outcome still blocks');
  assert.equal(h.emitted.filter((e) => e.event === 'run:waveCleared').length, 0);
});
