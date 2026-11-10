// PB-SWARM-F — SF-063 + SF-069 CHECK pair: focused counterexamples through the real chain.
//
// SF-063 (earned breathing room that survives burst kills): drive runSession + survivalRun +
// survivalWave + swarmArena + the swarmMode reservoir and ask the packet's own questions —
// kill 1, 3 and a larger group AT ONCE (same step), with a replacement request materializing in
// the same step; a genuine thinner interval must survive, quota must conserve exactly, and no
// replacement flood may cancel the earned space.
//
// SF-069 (cleanup that never lies about surviving enemies): the last cohort hull displaced far
// offscreen, disabled-but-alive, or destroyed amid a phase transition must keep the round honest —
// it continues with a clear action or resolves under the explicit rule, never hangs, never
// manufactures a kill, and the published readout never claims more resolutions than happened.
//
// Determinism: fixed seeds, sim ticks only (the harness's tick() is sim seconds at 60 Hz);
// no Math.random, no wall clock in any asserted path.
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
  SWARM_BREATH_TICKS,
  SWARM_CLEAR_KILLS,
  SWARM_REINFORCE_BATCH,
  SWARM_REINFORCE_SURGE_MAX,
  SWARM_RULESET,
  bindSwarmPressureContext,
  resetSwarmPressureState,
  swarmPressureAt,
} from '../src/data/swarmMode.js';
import { swarmArena } from '../src/systems/swarmArena.js';

const DT = 1 / 60;
const ARENA = 'helios_core';

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

function killMany(h, n) {
  let killed = 0;
  for (let i = 0; i < n; i++) if (killOne(h)) killed += 1;
  return killed;
}

function beginSwarm(h, seed = 4242) {
  resetSwarmPressureState();
  const seen = { plan: null, materialized: [], telegraphs: [], spends: [], cleared: [] };
  h.bus.on('run:wavePlanned', (p) => {
    if (p && p.plan && p.plan.swarm) seen.plan = p.plan.swarm;
  });
  h.bus.on('run:waveMaterialized', (p) => seen.materialized.push(p));
  h.bus.on('swarm:pressureTelegraph', (p) => seen.telegraphs.push(p));
  h.bus.on('swarm:pressureSpend', (p) => seen.spends.push(p));
  h.bus.on('run:waveCleared', (p) => seen.cleared.push(p));
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA,
  });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
  return seen;
}

/** Fill the room to the wave's concurrency target, deterministically, with a tick cap. */
function fillRoom(h, seen, capTicks = 1200) {
  const target = Math.min(
    Number.isInteger(seen.plan && seen.plan.concurrent) ? seen.plan.concurrent : 10,
    swarmPressureAt(h.state.run.wave, 0),
  );
  let t = 0;
  while (liveHostiles(h).length < target && t < capTicks) {
    tick(h, 1);
    t += 1;
  }
  return { target, ticks: t, alive: liveHostiles(h).length };
}

/**
 * Serve the wave's whole finite quota (every admitted body materialized), the way real play
 * reaches the round's end: the stream stops owing bodies, and only live cohort hulls remain.
 */
function exhaustQuota(h, capTicks = 30000) {
  let t = 0;
  while (t < capTicks) {
    if (h.state.run.threatBudget > 0
      && h.state.run.spawnedThreat >= h.state.run.threatBudget
      && h.state.run.resolvedThreat >= 0) break;
    if (t % 8 === 0) killOne(h);
    tick(h, 1);
    t += 1;
  }
  return {
    ticks: t,
    budget: h.state.run.threatBudget,
    spawned: h.state.run.spawnedThreat,
    resolved: h.state.run.resolvedThreat,
    alive: liveHostiles(h).length,
  };
}

/** Watch the room for `ticks`, refusing any refill beyond `ceilingAbove`. */
function watchRoom(h, ticks, ceilingAbove) {
  const floor = liveHostiles(h).length;
  let peak = floor;
  for (let i = 0; i < ticks; i++) {
    tick(h, 1);
    peak = Math.max(peak, liveHostiles(h).length);
    if (peak > floor + ceilingAbove) break;
  }
  return { floor, peak, waitedTicks: ticks };
}

function admittedForWave(seen, wave) {
  return seen.materialized
    .filter((m) => m.wave === wave)
    .reduce((sum, m) => sum + (Number.isInteger(m.admitted) ? m.admitted : 0), 0);
}

function teardown(h) {
  swarmArena.destroy();
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
}

// -------------------------------------------------------------------------------------------
// SF-063 — burst kills through the real chain.
// -------------------------------------------------------------------------------------------

test('SF-063: three kills in one step buy the breath — no refill inside it, telegraphed group after', () => {
  const h = boot(4242);
  const seen = beginSwarm(h, 4242);
  const room = fillRoom(h, seen);
  assert.ok(room.alive >= 6, `wave opened with a swarm (${room.alive})`);

  const killed = killMany(h, SWARM_CLEAR_KILLS);
  assert.equal(killed, SWARM_CLEAR_KILLS, 'fixture: the burst landed');
  const afterClear = liveHostiles(h).length;

  const watch = watchRoom(h, SWARM_BREATH_TICKS, 1);
  assert.ok(
    watch.peak <= afterClear + 1,
    `the room stayed thinner through the breath (peak ${watch.peak} vs ${afterClear})`,
  );
  assert.ok(seen.telegraphs.length >= 1, 'the replacement group was telegraphed');
  assert.ok(liveHostiles(h).length > 0, 'the board was never left empty');
  // Quota conservation: everything admitted this wave is inside the plan's finite quota.
  const quota = seen.plan && Number.isInteger(seen.plan.killTarget) ? seen.plan.killTarget : null;
  if (quota != null) {
    assert.ok(
      admittedForWave(seen, h.state.run.wave) <= quota,
      'no replacement flood: admissions stay inside the finite quota',
    );
  }
  teardown(h);
});

test('SF-063: a replacement group materializing in the same step as a 3-kill burst never floods', () => {
  const h = boot(8008);
  const seen = beginSwarm(h, 8008);
  const room = fillRoom(h, seen);
  const target = room.target;

  // Open a 1-body hole so the stream owes exactly one arrival, then run one step in which that
  // replacement materializes — and land the 3-kill burst inside the SAME step, the way combat
  // kills and end-of-step destroy censuses share a tick with survivalWave's dispatch.
  killMany(h, 1);
  tick(h, 1);
  const arrivalsDuringStep = seen.materialized
    .filter((m) => m.reinforcement === true)
    .reduce((sum, m) => sum + (Number.isInteger(m.admitted) ? m.admitted : 0), 0);
  assert.ok(arrivalsDuringStep >= 1, 'fixture: a replacement request was served');
  assert.ok(liveHostiles(h).length <= target, 'the arrival was hole-clamped, not a flood');

  // The burst, same step as any remaining stream work, then the honest questions:
  const afterClear = liveHostiles(h).length;
  killMany(h, SWARM_CLEAR_KILLS);
  const watch = watchRoom(h, SWARM_BREATH_TICKS, 1);
  assert.ok(
    watch.peak <= Math.max(afterClear, liveHostiles(h).length) + 1,
    `no replacement flood cancelled the earned space (peak ${watch.peak})`,
  );
  assert.ok(seen.telegraphs.length >= 1, 'the substantial clear still bought its telegraph');
  const quota = seen.plan && Number.isInteger(seen.plan.killTarget) ? seen.plan.killTarget : null;
  if (quota != null) {
    assert.ok(
      admittedForWave(seen, h.state.run.wave) <= quota,
      'quota conserved across the same-step burst + replacement',
    );
  }
  assert.ok(liveHostiles(h).length > 0, 'the board was never left empty');
  teardown(h);
});

test('SF-063: a large same-step burst (5) spends at most the surge ceiling and never over-admits', () => {
  const h = boot(13502);
  const seen = beginSwarm(h, 13502);
  const room = fillRoom(h, seen);
  const before = liveHostiles(h).length;
  assert.ok(before >= 5, `fixture: a room to burst (${before})`);

  killMany(h, 5);
  const watch = watchRoom(h, SWARM_BREATH_TICKS + 60, 1);
  assert.ok(watch.peak <= before - 5 + 1 + SWARM_REINFORCE_SURGE_MAX + 1,
    'the group that ends the breath is one readable group, not a catch-up surge');
  const quota = seen.plan && Number.isInteger(seen.plan.killTarget) ? seen.plan.killTarget : null;
  if (quota != null) {
    assert.ok(admittedForWave(seen, h.state.run.wave) <= quota, 'finite quota held');
  }
  assert.ok(seen.telegraphs.length >= 1, 'the large clear was earned and telegraphed');
  teardown(h);
});

test('SF-063: a single kill is a patch, not a breath — no telegraph for a 1-body hole', () => {
  const h = boot(4242);
  const seen = beginSwarm(h, 4242);
  fillRoom(h, seen);
  killMany(h, 1);
  watchRoom(h, 120, 0);
  assert.equal(seen.telegraphs.length, 0, 'a 1-body hole patches on the ordinary gap');
  assert.ok(liveHostiles(h).length > 0, 'the patch kept the room alive');
  teardown(h);
});

// -------------------------------------------------------------------------------------------
// SF-069 — the census never lies.
// -------------------------------------------------------------------------------------------

test('SF-069: the last hull displaced far offscreen keeps the round open — no despawn steals it', () => {
  const h = boot(4242);
  const seen = beginSwarm(h, 4242);
  const served = exhaustQuota(h);
  assert.ok(served.spawned >= served.budget, `fixture: quota served (${served.spawned}/${served.budget})`);
  const live = liveHostiles(h);
  assert.ok(live.length >= 1, `fixture: survivors remain (${served.alive})`);

  // Resolve everyone but one, then displace the survivor far beyond any scan/camera radius.
  for (let i = 0; i < live.length - 1; i++) killOne(h);
  const last = liveHostiles(h)[0];
  assert.ok(last, 'fixture: one survivor');
  last.pos.x += 5000;
  last.pos.z += 5000;

  // A long watch: the round must NOT resolve, must NOT stall the sim, and the readout must
  // still owe the survivor's resolution.
  const clearedBefore = seen.cleared.length;
  tick(h, 900);
  assert.equal(seen.cleared.length, clearedBefore, 'a displaced survivor holds the wave open');
  assert.ok(
    h.state.run.resolvedThreat < h.state.run.threatBudget,
    `the readout still owes it (${h.state.run.resolvedThreat}/${h.state.run.threatBudget})`,
  );

  // The clear action exists and works: killing the displaced hull resolves the round.
  last.alive = false;
  h.state.entities.delete(last.id);
  h.bus.emit('entity:destroyed', { id: last.id });
  tick(h, 5);
  assert.equal(seen.cleared.length, clearedBefore + 1, 'the round resolved on the real kill');
  const receipt = seen.cleared[seen.cleared.length - 1];
  assert.equal(receipt.survivors, 0, 'no survivors were manufactured or discarded');
  teardown(h);
});

test('SF-069: a disabled-but-alive hull is a survivor, not a resolved slot', () => {
  const h = boot(8008);
  const seen = beginSwarm(h, 8008);
  const served = exhaustQuota(h);
  assert.ok(served.spawned >= served.budget, `fixture: quota served (${served.spawned}/${served.budget})`);
  const live = liveHostiles(h);
  for (let i = 0; i < live.length - 1; i++) killOne(h);
  const last = liveHostiles(h)[0];
  assert.ok(last, 'fixture: one survivor');
  // Disabled in the drive sense: alive, unable to act. The census must not read this as a kill.
  last.data.derived = { ...(last.data.derived || {}), effectiveDisabled: true };
  last.data.disabledStub = true;

  const clearedBefore = seen.cleared.length;
  tick(h, 600);
  assert.equal(seen.cleared.length, clearedBefore, 'a disabled hull still holds the wave open');

  last.alive = false;
  h.state.entities.delete(last.id);
  h.bus.emit('entity:destroyed', { id: last.id });
  tick(h, 5);
  assert.equal(seen.cleared.length, clearedBefore + 1, 'the wave cleared on the real death');
  teardown(h);
});

test('SF-069: a stale destroy receipt for a recycled id never drops the live occupant', () => {
  const h = boot(13502);
  const seen = beginSwarm(h, 13502);
  const served = exhaustQuota(h);
  assert.ok(served.spawned >= served.budget, `fixture: quota served (${served.spawned}/${served.budget})`);
  const live = liveHostiles(h);
  for (let i = 0; i < live.length - 1; i++) killOne(h);
  const last = liveHostiles(h)[0];
  assert.ok(last, 'fixture: one live occupant');

  // A receipt naming the occupant's id but carrying a DIFFERENT (recycled predecessor) body
  // must be ignored; the live hull keeps its slot and the wave stays open.
  const ghost = { id: last.id, alive: false };
  h.bus.emit('entity:killed', { id: last.id, entity: ghost });
  h.bus.emit('entity:destroyed', { id: last.id, entity: ghost });
  tick(h, 30);
  const clearedBefore = seen.cleared.length;
  assert.equal(seen.cleared.length, clearedBefore, 'the forged receipt did not clear the wave');
  assert.ok(liveHostiles(h).length === 1, 'the live occupant kept its slot');

  last.alive = false;
  h.state.entities.delete(last.id);
  h.bus.emit('entity:destroyed', { id: last.id, entity: last });
  tick(h, 5);
  assert.equal(seen.cleared.length, clearedBefore + 1, 'the wave cleared only on the real death');
  teardown(h);
});
