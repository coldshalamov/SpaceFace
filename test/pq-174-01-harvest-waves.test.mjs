// PQ-174.01 — harvest-wave completion.
//
// The contract that shipped is the finite cohort: a wave closes when every body it admitted has
// resolved (fast clears earn the shop early), progress is a countdown of bodies left, and a live
// wave never has a whole second with nobody on the board. The sixty-second envelope survives only
// as the fallback for legacy timed saves — `durationTicks` rides plan and receipt for them.
// Prints the measured wave-one clear time per seed.
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
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { chipValueForPlan } from '../src/systems/survivalRewards.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import {
  SWARM_BREATH_TICKS,
  SWARM_CLEANUP_TICKS,
  SWARM_RULESET,
  SWARM_WAVE_DURATION_TICKS,
  bindSwarmPressureContext,
  resetSwarmPressureState,
  swarmCurveIsSane,
  swarmLevel,
  swarmPressureIsHolding,
  swarmQuota,
} from '../src/data/swarmMode.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEEDS = [4242, 8008, 13502];

function boot(seed) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
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
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
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

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
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

function beginSwarm(h, seed) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA,
  });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
  return h.state.run;
}

function named(emitted, event) {
  return emitted.filter((e) => e.event === event);
}

function measureWaveOne(seed, { killEvery = 6 } = {}) {
  const h = boot(seed);
  let startedAt = null;
  let cleared = null;
  h.bus.on('run:waveStarted', () => {
    if (startedAt == null) startedAt = h.state.simTime;
  });
  h.bus.on('run:waveCleared', (p) => {
    if (cleared == null && p && p.wave === 1) {
      cleared = { ...p, simTime: h.state.simTime };
    }
  });
  beginSwarm(h, seed);
  assert.equal(h.state.run.phase, 'active');
  let kills = 0;
  for (let i = 0; i < 5000 && !cleared; i++) {
    if (killEvery > 0 && i % killEvery === 0 && h.state.run.phase === 'active') {
      if (killOne(h)) kills += 1;
    }
    tick(h, 1);
  }
  assert.ok(cleared, `seed ${seed} never closed wave 1`);
  const duration = cleared.simTime - startedAt;
  return { h, duration, killed: cleared.killed, kills, survivors: cleared.survivors, cleared };
}

test('plan contract: cohort completion, kill quota, level 1', () => {
  const plan = planWave({ seed: 4242, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET });
  assert.notEqual(plan.ok, false);
  // The finite cohort is the contract: every body the wave owes must be admitted and resolved.
  // `durationTicks` survives on the plan only as the fallback envelope for legacy timed saves.
  assert.equal(plan.completionRules.kind, 'cohort');
  assert.equal(plan.completionRules.requiredPackagesMaterialized, true);
  assert.deepEqual(plan.completionRules.blockingRoles, []);
  assert.equal(plan.completionRules.cleanupTicks, SWARM_CLEANUP_TICKS);
  assert.equal(plan.swarm.durationTicks, SWARM_WAVE_DURATION_TICKS);
  assert.equal(plan.swarm.killTarget, swarmQuota(1));
  assert.equal(plan.swarm.rewardReferenceKills, swarmQuota(1));
  assert.equal(plan.level, 1);
  assert.equal(plan.swarm.level, 1);
  for (const wave of [1, 10, 22, 60, 999]) {
    assert.equal(swarmLevel(wave), 1, `swarmLevel(${wave}) stays 1`);
    assert.ok(swarmCurveIsSane(wave), `wave ${wave} duration/concurrency stay sane`);
  }
  // Chips price off the flat threat table, never the per-spawn purse — a quota wave cannot mint
  // an infinite credit line by farming arrivals.
  assert.equal(chipValueForPlan(plan), 10);
  const spec = makeEnemySpawnSpec('wasp_swarmer', swarmLevel(22), { x: 0, z: 0 });
  const base = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 });
  assert.equal(spec.hull, base.hull, 'swarmLevel 1 does not inflate wasp hull');
});

test('wave 1 clears on its cohort quota, not a clock, on the three .00 seeds (printed)', () => {
  // A wave ends when every body it admitted has resolved — a fast clear earns the shop early
  // instead of waiting out a timer (the shipped swarm contract; crucible-swarm pins the beat).
  for (const seed of SEEDS) {
    const cell = measureWaveOne(seed, { killEvery: 6 });
    console.log(`[pq-174.01] seed=${seed} wave1Duration=${cell.duration.toFixed(6)}s killed=${cell.killed} survivors=${cell.survivors}`);
    assert.equal(cell.cleared.completionKind, 'cohort');
    assert.equal(cell.cleared.durationTicks, SWARM_WAVE_DURATION_TICKS,
      'the duration envelope still rides the receipt for legacy consumers');
    assert.equal(cell.cleared.killed, swarmQuota(1),
      `seed ${seed} resolved fewer than the quota — the wave owed ${swarmQuota(1)} bodies`);
    assert.equal(cell.cleared.survivors, 0, 'a resolved cohort leaves no survivors to carry');
    assert.ok(cell.duration < 3600, `seed ${seed} sat on a clock for ${cell.duration.toFixed(1)}s`);
    assert.ok(cell.killed >= 15, `seed ${seed} cleared before the wave-1 quota of 15`);
  }
});

test('the stream stops at its quota, and a living champion holds its round open', () => {
  // Finite cohort: once the quota's bodies are all admitted and resolved, the wave closes —
  // nothing keeps the stream alive past the number the plan owed.
  const h = boot(4242);
  beginSwarm(h, 4242);
  let kills = 0;
  for (let i = 0; i < 1200 && h.state.run.phase === 'active'; i++) {
    if (i % 4 === 0 && killOne(h)) kills += 1;
    tick(h, 1);
  }
  const clears = named(h.emitted, 'run:waveCleared').filter((e) => e.payload.wave === 1);
  assert.equal(clears.length, 1, 'wave 1 closed on cohort resolution');
  assert.equal(clears[0].payload.killed, swarmQuota(1));
  const materialized = named(h.emitted, 'run:waveMaterialized').length;
  for (let i = 0; i < 120; i++) tick(h, 1);
  assert.equal(named(h.emitted, 'run:waveMaterialized').length, materialized,
    'no hostiles spawn into a cleared round');

  // But a living cohort — boss included — keeps the wave open: no clock rescues a refused fight.
  // Fresh boot on wave 1's active phase: inject the boss plan while the room is still live.
  const h2 = boot(4242);
  beginSwarm(h2, 4242);
  const bossPlan = planWave({ seed: 4242, arenaId: ARENA, wave: 10, ruleset: SWARM_RULESET });
  h2.bus.emit('run:wavePlanned', { wave: 10, plan: bossPlan });
  h2.bus.emit('run:waveStarted', { wave: 10 });
  for (let i = 0; i < 4000; i++) tick(h2, 1);
  assert.equal(
    named(h2.emitted, 'run:waveCleared').filter((e) => e.payload.wave === 10).length,
    0,
    'the boss round must not time out under a live cohort',
  );
  for (let i = 0; i < 6000
    && named(h2.emitted, 'run:waveCleared').filter((e) => e.payload.wave === 10).length === 0; i++) {
    if (i % 4 === 0) killOne(h2);
    tick(h2, 1);
  }
  const bossClears = named(h2.emitted, 'run:waveCleared').filter((e) => e.payload.wave === 10);
  assert.equal(bossClears.length, 1, 'the boss wave cleared once its cohort resolved');
  assert.equal(bossClears[0].payload.completionKind, 'cohort');
});

test('run:waveProgress publishes the cohort countdown — bodies left of the quota', () => {
  const h = boot(4242);
  beginSwarm(h, 4242);
  const first = named(h.emitted, 'run:waveProgress');
  assert.ok(first.length >= 1, 'progress published at activation');
  const open = first[0].payload;
  assert.equal(open.wave, 1);
  assert.equal(open.completionKind, 'cohort');
  assert.equal(open.total, swarmQuota(1));
  assert.equal(open.remaining, swarmQuota(1));
  for (let i = 0; i < 600; i++) {
    if (i % 4 === 0) killOne(h);
    tick(h, 1);
  }
  const later = named(h.emitted, 'run:waveProgress');
  assert.ok(later.length >= 2, 'progress published again when the quota countdown moved');
  const last = later[later.length - 1].payload;
  assert.equal(last.total, swarmQuota(1));
  assert.ok(last.remaining < swarmQuota(1), `remaining ${last.remaining} should drop as bodies resolve`);
});

test('death at the boundary is a death, not a surviving-wave award', () => {
  const h = boot(4242);
  beginSwarm(h, 4242);
  h.player.alive = false;
  for (let i = 0; i < 4000; i++) tick(h, 1);
  assert.equal(named(h.emitted, 'run:waveCleared').length, 0);
});

test('consecutive waves carry reservoir hold; a new run still resets', () => {
  const h = boot(4242);
  swarmArena.init(h.ctx);
  beginSwarm(h, 4242);
  Object.assign(resetSwarmPressureState(), {
    holding: true,
    holdTicks: SWARM_BREATH_TICKS - 40,
    stored: 4,
    telegraphed: true,
    killsSinceReinforce: 0,
  });
  assert.equal(swarmPressureIsHolding(), true);
  const plan2 = planWave({ seed: 4242, arenaId: ARENA, wave: 2, ruleset: SWARM_RULESET });
  h.bus.emit('run:wavePlanned', { wave: 2, plan: plan2 });
  assert.equal(swarmPressureIsHolding(), true, 'wave 2 did not wipe the hold');
  h.bus.emit('run:ended', { outcome: 'defeat' });
  swarmArena.newGame();
  assert.equal(swarmPressureIsHolding(), false, 'a new run still resets');
  swarmArena.destroy();
  bindSwarmPressureContext(null);
});

/**
 * Whole-second occupancy on the spawn-and-clock driver.
 *
 * The .00 printer's quiet second is "no kill, verb, moment or shot". This harness has no
 * verbs, shots or moments, so it counts:
 *   empty  — a whole second with zero live hostiles (the depleted-farm falsifier)
 *   quiet  — a whole second with no kill and no spawn (activity proxy; reservoir holds
 *            of surviving enemies will land here and are not a failure)
 */
function measureQuiet(seed) {
  const h = boot(seed);
  swarmArena.init(h.ctx);
  const alive = [];
  const killAt = [];
  const spawnAt = [];
  let t = 0;
  let wave1ClearTick = null;
  let wave2StartTick = null;
  h.bus.on('run:waveCleared', (p) => {
    if (p && p.wave === 1 && wave1ClearTick == null) wave1ClearTick = t;
  });
  h.bus.on('run:waveStarted', (p) => {
    if (p && p.wave === 2 && wave2StartTick == null) wave2StartTick = t;
  });
  h.bus.on('run:waveMaterialized', () => { spawnAt[t] = true; });

  beginSwarm(h, seed);
  const wave1StartTick = t;
  // Observe through the clear plus a beat afterwards — wave 2 is player-launched, so the loop
  // waits on the clear, not on the next wave arriving on its own.
  for (let i = 0; i < 16000 && (wave1ClearTick == null || t < wave1ClearTick + 300); i++) {
    let killed = false;
    if (i % 6 === 0 && h.state.run.phase === 'active') killed = killOne(h);
    tick(h, 1);
    if (killed) killAt[t] = true;
    alive[t] = liveHostiles(h).length;
    t += 1;
  }

  function wholeSeconds(tickLo, tickHi, pred) {
    const lo = Math.ceil(tickLo / 60);
    const hi = Math.floor(tickHi / 60);
    let n = 0;
    for (let s = lo; s < hi; s++) {
      const a = s * 60;
      const b = a + 60;
      if (b > tickHi || a < tickLo) continue;
      let hit = true;
      for (let k = a; k < b; k++) {
        if (!pred(k)) { hit = false; break; }
      }
      if (hit) n += 1;
    }
    return n;
  }

  const wave1End = wave1ClearTick == null ? t : wave1ClearTick;
  const emptyWave1 = wholeSeconds(wave1StartTick, wave1End, (k) => (alive[k] || 0) === 0);
  const boundaryLo = wave1ClearTick == null ? t : wave1ClearTick;
  const boundaryHi = wave2StartTick == null ? t : Math.min(t, wave2StartTick + 60);
  const emptyBoundary = wholeSeconds(boundaryLo, boundaryHi, (k) => (alive[k] || 0) === 0);
  const memoLo = wave1StartTick + Math.ceil(22.733 * 60);
  const memoHi = wave1StartTick + 3600;
  const emptyMemoWindow = wholeSeconds(memoLo, Math.min(memoHi, wave1End), (k) => (alive[k] || 0) === 0);
  const quietActivityWave1 = wholeSeconds(wave1StartTick, wave1End, (k) => !killAt[k] && !spawnAt[k]);
  const emptyTicksWave1 = alive.slice(wave1StartTick, wave1End).filter((n) => n === 0).length;
  const postClearPhase = h.state.run && h.state.run.phase;
  swarmArena.destroy();
  bindSwarmPressureContext(null);
  return {
    seed,
    t,
    wave1ClearTick,
    wave2StartTick,
    emptyWave1,
    emptyBoundary,
    emptyMemoWindow,
    quietActivityWave1,
    emptyTicksWave1,
    wave1Seconds: (wave1End - wave1StartTick) / 60,
    postClearPhase,
  };
}

test('quiet seconds on 4242/8008/13502: a live wave is never an empty farm', () => {
  // The swarm contract's falsifier is a WHOLE SECOND with nobody on the board while the wave is
  // live. What comes after the clear is the authored break — rounds are player-launched now, so
  // an empty room past waveCleared is the shop window, not a stalled farm.
  for (const seed of SEEDS) {
    const m = measureQuiet(seed);
    console.log(
      `[pq-174.01] seed=${seed} emptyWave1Seconds=${m.emptyWave1} emptyBoundarySeconds=${m.emptyBoundary}`
      + ` emptyMemoWindow22.733..60=${m.emptyMemoWindow} quietNoKillNoSpawnWave1=${m.quietActivityWave1}`
      + ` emptyTicksWave1=${m.emptyTicksWave1} wave1s=${m.wave1Seconds.toFixed(3)}`
      + ` w1clearTick=${m.wave1ClearTick} w2startTick=${m.wave2StartTick}`,
    );
    assert.ok(m.wave1ClearTick != null, `seed ${seed} closed wave 1`);
    assert.equal(m.emptyWave1, 0, `seed ${seed} had ${m.emptyWave1} empty seconds inside wave 1`);
    assert.equal(m.emptyTicksWave1, 0, `seed ${seed} had ${m.emptyTicksWave1} empty ticks inside wave 1`);
    assert.equal(m.emptyMemoWindow, 0, `seed ${seed} had ${m.emptyMemoWindow} empty seconds in 22.733..60`);
    assert.equal(m.postClearPhase !== 'active', true,
      `seed ${seed}: the cleared round must park in a player-gated break, not a live empty room`);
  }
});
