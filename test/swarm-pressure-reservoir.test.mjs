// PQ-174.08 — earned breathing room: the pressure reservoir.
//
// After a ≥3-kill clear the live stream holds replacement for 4 s, then spends the stored
// pressure as one telegraphed group. Same roster, same concurrent ceiling, same hull values.
// An empty board still refills on the next tick.
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
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import {
  SWARM_BREATH_SECONDS,
  SWARM_BREATH_TICKS,
  SWARM_CLEAR_KILLS,
  SWARM_REINFORCE_BATCH,
  SWARM_REINFORCE_SURGE_MAX,
  SWARM_RULESET,
  bindSwarmPressureContext,
  createSwarmPressureState,
  noteSwarmPressureKills,
  resetSwarmPressureState,
  swarmReinforceCount,
  swarmReinforceDecision,
} from '../src/data/swarmMode.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { measureSwarmRun } from '../scripts/lib/bench/swarmMetrics.mjs';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEEDS = [4242, 8008, 13502];

function boot(seed = 4242) {
  resetSwarmPressureState();
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
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, helpers, budget, ctx, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

function liveHostiles(h) {
  const out = [];
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.alive === false) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(entity);
  }
  return out;
}

function killOne(h) {
  const live = liveHostiles(h);
  if (live.length === 0) return false;
  const victim = live[0];
  victim.alive = false;
  h.state.entities.delete(victim.id);
  h.bus.emit('entity:destroyed', { id: victim.id });
  return true;
}

function beginSwarm(h, seed = 4242) {
  resetSwarmPressureState();
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA,
  });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
  return h.state.run;
}

function teardown(h) {
  swarmArena.destroy();
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
}

test('pure reservoir: a 3-body hole holds for 4 s, then spends a readable group', () => {
  const state = createSwarmPressureState();
  assert.equal(swarmReinforceDecision(state, 1, { alive: 9 }).count, 1);
  assert.equal(swarmReinforceDecision(state, 2, { alive: 8 }).count, 2);

  const first = swarmReinforceDecision(state, 3, { alive: 7 });
  assert.equal(first.count, 0);
  assert.equal(first.telegraph, true);
  assert.equal(state.holding, true);

  for (let i = 0; i < SWARM_BREATH_TICKS - 1; i++) {
    const step = swarmReinforceDecision(state, 3, { alive: 7 });
    assert.equal(step.count, 0, `still holding at tick ${i + 1}`);
  }
  const spend = swarmReinforceDecision(state, 3, { alive: 7 });
  assert.equal(spend.count, SWARM_REINFORCE_BATCH);
  assert.equal(spend.spent, SWARM_REINFORCE_BATCH);
  assert.equal(state.holding, false);
});

test('pure reservoir: empty board emergency-fills, even after a 3-kill', () => {
  const state = createSwarmPressureState();
  noteSwarmPressureKills(3, state);
  const empty = swarmReinforceDecision(state, 10, { alive: 0 });
  assert.equal(empty.count, SWARM_REINFORCE_BATCH);
  assert.equal(empty.telegraph, false);
  assert.equal(state.holding, false);
});

test('pure reservoir: a spent group never exceeds the surge ceiling or the live hole', () => {
  const fresh = createSwarmPressureState();
  swarmReinforceDecision(fresh, 12, { alive: 4 });
  for (let i = 0; i < SWARM_BREATH_TICKS - 1; i++) swarmReinforceDecision(fresh, 12, { alive: 4 });
  const spend = swarmReinforceDecision(fresh, 12, { alive: 4 });
  assert.ok(spend.count <= SWARM_REINFORCE_SURGE_MAX);
  assert.ok(spend.count <= 12);
  assert.ok(spend.count >= SWARM_REINFORCE_BATCH);
});

test('live wrapper: swarmReinforceCount stays a number and fires telegraph once', () => {
  resetSwarmPressureState();
  let holds = 0;
  let spends = 0;
  bindSwarmPressureContext({
    getAlive: () => 7,
    onHoldStart: () => { holds += 1; },
    onSpend: () => { spends += 1; },
  });
  assert.equal(swarmReinforceCount(3), 0);
  assert.equal(holds, 1);
  for (let i = 0; i < SWARM_BREATH_TICKS - 1; i++) assert.equal(swarmReinforceCount(3), 0);
  assert.equal(swarmReinforceCount(3), SWARM_REINFORCE_BATCH);
  assert.equal(holds, 1);
  assert.equal(spends, 1);
  bindSwarmPressureContext(null);
  resetSwarmPressureState();
});

for (const seed of SEEDS) {
  test(`seed ${seed}: a ≥3-kill clear buys ≥4 s of thinner air, then a telegraphed group`, () => {
    const h = boot(seed);
    beginSwarm(h, seed);
    tick(h, 40);
    const before = liveHostiles(h).length;
    assert.ok(before >= 6, `wave opened with a swarm (${before})`);

    let killed = 0;
    for (let i = 0; i < SWARM_CLEAR_KILLS; i++) {
      if (killOne(h)) killed += 1;
    }
    assert.equal(killed, SWARM_CLEAR_KILLS);
    const afterClear = liveHostiles(h).length;
    assert.equal(afterClear, before - SWARM_CLEAR_KILLS);

    const telegraphs = [];
    const spends = [];
    h.bus.on('swarm:pressureTelegraph', (p) => telegraphs.push(p));
    h.bus.on('swarm:pressureSpend', (p) => spends.push(p));
    h.bus.on('alert', (p) => {
      if (p && p.key === 'swarm-pressure-inbound') telegraphs.push(p);
    });

    const occupancy = [];
    let peakDuringBreath = afterClear;
    for (let i = 0; i < SWARM_BREATH_TICKS; i++) {
      tick(h, 1);
      const n = liveHostiles(h).length;
      occupancy.push(n);
      peakDuringBreath = Math.max(peakDuringBreath, n);
    }
    const heldTicks = occupancy.filter((n) => n <= afterClear + 1).length;
    assert.ok(
      peakDuringBreath <= afterClear + 1,
      `room stayed thinner than the pre-clear ${before} (peak ${peakDuringBreath} vs post-clear ${afterClear})`,
    );
    assert.ok(
      heldTicks / 60 >= SWARM_BREATH_SECONDS,
      `emptier space lasted ${heldTicks / 60}s, need ≥${SWARM_BREATH_SECONDS}s`,
    );
    assert.ok(telegraphs.length >= 1, 'reinforcement was telegraphed before it landed');

    tick(h, 8);
    const afterSpend = liveHostiles(h).length;
    assert.ok(
      afterSpend >= afterClear + SWARM_REINFORCE_BATCH
        || spends.length >= 1,
      `telegraphed group spent the reservoir (alive ${afterSpend}, spends ${spends.length})`,
    );
    assert.ok(liveHostiles(h).length > 0, 'the board was never left empty');
    teardown(h);
  });
}

test('quota still flows: a 3-kill breath does not stall wave 1', () => {
  const h = boot(4242);
  beginSwarm(h, 4242);
  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null) cleared = p; });
  for (let i = 0; i < 8000 && h.state.run.wave < 2; i++) {
    if (i % 8 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'wave 1 still met its kill quota');
  assert.ok(cleared.killed >= 15, `quota flowed (${cleared.killed} kills)`);
  assert.ok(cleared.survivors > 0, 'survivors still roll into wave 2');
  teardown(h);
});

test('headless measure: occupancy after a 3-kill burst reports ≥4 s emptier space', () => {
  const occupancyTrace = [];
  const eventTrace = [
    { tick: 0, type: 'run:wavePlanned', data: { wave: 1, quota: 15 } },
    { tick: 3, type: 'hostile:spawned', data: { archetype: 'wasp_swarmer' } },
  ];
  // 10 alive, then 3 kills at t=10s, stay at 7 for 4s, then jump to 10.
  for (let tick = 0; tick <= 900; tick += 15) {
    const seconds = tick / 60;
    let alive = 10;
    if (seconds >= 10 && seconds < 14) alive = 7;
    else if (seconds >= 14) alive = 10;
    occupancyTrace.push({ tick, seconds, alive, wave: 1 });
  }
  for (const t of [600, 610, 620]) {
    eventTrace.push({
      tick: t,
      type: 'entity:killed',
      data: { cause: 'weapon', targetId: t, archetype: 'fighter' },
    });
  }
  eventTrace.push({
    tick: 600,
    type: 'swarm:pressureTelegraph',
    data: { wave: 1, etaTicks: 240, stored: 3 },
  });
  eventTrace.push({
    tick: 840,
    type: 'swarm:pressureSpend',
    data: { wave: 1, count: 3 },
  });
  eventTrace.push({ tick: 2000, type: 'run:waveCleared', data: { wave: 1 } });

  const swarm = measureSwarmRun({
    loadoutId: 'physics_toolkit',
    seed: 4242,
    arenaId: 'helios_core',
    stopReason: 'tick_cap',
    simSeconds: 40,
    ticks: 2400,
    eventTrace,
    occupancyTrace,
  });
  assert.equal(swarm.clearBreath.available, true);
  assert.equal(swarm.clearBreath.met, true);
  assert.ok(swarm.clearBreath.seconds >= 4);
});

test('headless measure: historical traces without occupancy stay n/a, not a fake zero', () => {
  const swarm = measureSwarmRun({
    loadoutId: 'energy_baseline',
    seed: 8008,
    stopReason: 'player_dead',
    simSeconds: 16.27,
    ticks: 976,
    eventTrace: [
      { tick: 2, type: 'run:wavePlanned', data: { wave: 1 } },
      { tick: 728, type: 'entity:killed', data: { cause: 'weapon', targetId: 9, archetype: 'fighter' } },
    ],
  });
  assert.equal(swarm.clearBreath.available, false);
  assert.equal(swarm.clearBreath.seconds, null);
  assert.ok(swarm.clearBreath.reason);
  assert.equal(swarm.quietSecondsAfterWave1.available, false);
});
