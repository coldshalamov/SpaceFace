// Late scored-wave tail: once every scheduled threat is in the field and the wave has
// outlived its round budget (the finite SWARM_WAVE_DURATION_TICKS fallback = 60 s), the
// last ≤3 live hulls commit to the pilot — combatDoctrineId 'brawler_commit' — instead of
// orbiting at range. Regression for the gauntlet-repaired gate: seed 4242 wave 2 sat
// `active` through the 420 s cap with res 9/10 because one live wasp kiter kept jousting
// 5–8 km out. The committed body stays actionable and still has to be killed — this is
// engagement pacing, never a despawn/resolve/timer win.
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
const BUDGET_TICKS = 3600; // SWARM_WAVE_DURATION_TICKS — the reused finite duration policy

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
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
      raw.emit('entity:destroyed', { id });
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

function beginAndReachActive(harness, ruleset = 'scored') {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset, seed: SEED, arenaId: ARENA,
  });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);
  if (ruleset === 'swarm') {
    // A swarm run's opening stop is the armory: loadout -> draft, and the draft only
    // leaves on a resolve. The emit is a no-op if the wave auto-skips the stop.
    harness.bus.emit('run:draftResolved', {});
    tick(harness, 1);
  }
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
  return harness.state.run;
}

function killEntity(harness, entity) {
  entity.alive = false;
  harness.bus.emit('entity:killed', { id: entity.id });
}

function cohort(harness) {
  return harness.spawned.filter((entity) => entity && entity.id !== harness.player.id);
}

function killAllBut(harness, keepIds) {
  const keep = new Set(keepIds);
  for (const entity of [...cohort(harness)]) {
    if (keep.has(entity.id)) continue;
    killEntity(harness, entity);
  }
}

test('a late scored tail commits to the pilot but still has to be killed', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600); // the whole wave-1 schedule is in the field (~10 s elapsed)
  assert.equal(h.state.run.phase, 'active');
  const survivor = cohort(h).find((entity) => entity.data && entity.data.ai);
  assert.ok(survivor, 'a materialized cohort hull with an ai block');
  killAllBut(h, [survivor.id]);
  tick(h, BUDGET_TICKS); // elapsed ≈ 70 s — past the finite round budget
  assert.equal(survivor.data.ai.combatDoctrineId, 'brawler_commit',
    'the tail commits to the pilot instead of orbiting at range');
  assert.equal(survivor.data.ai.swarmLastStand, true);
  assert.equal(h.state.run.phase, 'active',
    'a committed live body still holds the wave open — engagement pacing, not a win');
  assert.equal(h.emitted.filter((e) => e.event === 'run:waveCleared').length, 0);

  killEntity(h, survivor);
  tick(h, 2);
  assert.equal(h.state.run.phase, 'cleanup', 'the wave only clears on the actual kill');
});

test('an early tail does not commit before the round budget', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const survivor = cohort(h).find((entity) => entity.data && entity.data.ai);
  killAllBut(h, [survivor.id]);
  tick(h, 1200); // elapsed ≈ 30 s — a normal round pace, well inside the budget
  assert.notEqual(survivor.data.ai.swarmLastStand, true,
    'no commitment while the round is still inside its authored pacing');
  assert.equal(h.state.run.phase, 'active');
});

test('a full wave does not commit — only a small tail does', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const alive = cohort(h);
  assert.ok(alive.length > 3, `wave-1 cohort must exceed the last-stand tail (got ${alive.length})`);
  killAllBut(h, alive.slice(0, 4).map((entity) => entity.id)); // four actionable > tail max
  tick(h, BUDGET_TICKS);
  for (const entity of alive.slice(0, 4)) {
    assert.notEqual(entity.data && entity.data.ai && entity.data.ai.swarmLastStand, true,
      `cohort member ${entity.id} must not commit while the wave is not a tail`);
  }
  assert.equal(h.state.run.phase, 'active');
});

test('a stalled admission ledger cannot keep a late swarm tail orbiting', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h, 'swarm');
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  assert.ok(survivalWave._swarm && survivalWave._swarm.killTarget > 0,
    'a swarm kill-target round is running');
  const survivor = cohort(h).find((entity) => entity.data && entity.data.ai);
  assert.ok(survivor, 'a materialized cohort hull with an ai block');
  killAllBut(h, [survivor.id]);
  // The swarm-repaired stall, minimized: the quota ledger is still owed one body and a
  // batch sits in _pending forever (a refused arrival retrying), which also holds the
  // reinforcement gate — exactly the trap that left round 2's tail untouched for 150+ s.
  survivalWave._plannedBodies = survivalWave._admittedTotal + 1;
  survivalWave._pending.push({ entry: { count: 20, atTick: Number.MAX_SAFE_INTEGER } });
  tick(h, BUDGET_TICKS); // elapsed ≈ 70 s — past the finite round budget
  assert.equal(survivor.data.ai.combatDoctrineId, 'brawler_commit',
    'owed quota is debt, not arrival — the late tail still commits to the pilot');
  assert.equal(survivor.data.ai.swarmLastStand, true);
  assert.equal(h.state.run.phase, 'active',
    'the owed quota still holds the wave open — the clear keeps its strict ledger');
  assert.equal(h.emitted.filter((e) => e.event === 'run:waveCleared').length, 0);
});

test('a stalled admission ledger cannot pin a far straggler past the budget', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h, 'swarm');
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const survivor = cohort(h).find((entity) => entity.data && entity.data.ai);
  assert.ok(survivor, 'a materialized cohort hull with an ai block');
  killAllBut(h, [survivor.id]);
  survivor.pos.x = 4000; // far past the 1800 wu straggler leash, like the DISTANT target
  survivalWave._plannedBodies = survivalWave._admittedTotal + 1;
  survivalWave._pending.push({ entry: { count: 20, atTick: Number.MAX_SAFE_INTEGER } });
  tick(h, BUDGET_TICKS); // budget + the 8 s straggler grace
  assert.equal(h.state.entities.has(survivor.id), false,
    'the far straggler releases once the round has outlived its budget');
  assert.equal(h.state.run.phase, 'active',
    'owed quota still holds the wave open — release resolves a slot, not the round');
  assert.equal(h.emitted.filter((e) => e.event === 'run:waveCleared').length, 0);
});

test('a boss-marked tail never commits', () => {
  const h = boot();
  h.state.mode = 'flight';
  beginAndReachActive(h);
  tick(h, 600);
  assert.equal(h.state.run.phase, 'active');
  const boss = cohort(h).find((entity) => entity.data && entity.data.ai);
  boss.data.missionTag = 'capital_boss';
  killAllBut(h, [boss.id]);
  tick(h, BUDGET_TICKS);
  assert.notEqual(boss.data.ai.swarmLastStand, true,
    'a mission-tagged boss keeps its own defeat authority');
  delete boss.data.missionTag;
  boss.data.bossDressing = { staged: true };
  tick(h, 120);
  assert.notEqual(boss.data.ai.swarmLastStand, true,
    'a boss-dressed hull keeps its own defeat authority');
  assert.equal(h.state.run.phase, 'active', 'the skipped boss still blocks the wave');
});
