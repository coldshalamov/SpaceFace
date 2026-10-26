// D195 — the swarm wave-stall watchdog.
//
// The pressure reservoir (src/data/swarmMode.js) releases a hold only while the stream keeps
// consulting it: every breath tick is one `swarmReinforceCount` call. A hold that lands while
// the schedule still owes bodies can freeze instead — the held batches themselves keep the room
// census at target, so the decision is never reached again — and the emergency refill needs an
// EMPTY room, which a held pending list never is. The round then starves on a finite quota it
// can no longer reach.
//
// survivalWave now watches for exactly that: owed kills + hold-suppressed work + no spawn/kill
// progress for SWARM_STALL_RELEASE_TICKS (9 s — a lawful breath is 4 s). Past the window it lifts
// the hold with the same reset a new run uses, and the stream's own law resumes the round.
//
// Two sibling starvation laws ride the same file. A batch the concurrency clamp cannot seat is
// owed on the same short retry a held batch rides — never dropped to the stream's accounting —
// and a hold carried across run:wavePlanned has its clock expired at the boundary: the debt
// still pays out on the new wave's first real deficit, but its grip can never starve the new
// opening, and a fresh deficit earns a real breath exactly as before.
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
import { SWARM_STALL_RELEASE_TICKS, survivalWave } from '../src/systems/survivalWave.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { SWARM_SPAWN_RETRY_TICKS } from '../src/systems/swarmSafety.js';
import {
  SWARM_BREATH_TICKS,
  SWARM_RULESET,
  bindSwarmPressureContext,
  resetSwarmPressureState,
  swarmPressureIsHolding,
  swarmPressureSuppressing,
  swarmQuota,
} from '../src/data/swarmMode.js';
import { swarmArena } from '../src/systems/swarmArena.js';

const DT = 1 / 60;
const ARENA = 'helios_core';

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
  // The arena owns the production pressure binding: cohort census into the reservoir and the
  // kill count that earns a breath. The watchdog runs without it; with it the healthy-wave
  // test exercises real holds, not only forced ones.
  swarmArena.init(ctx);
  return { state, bus, emitted, helpers, budget, ctx, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
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

function killId(h, id) {
  const victim = h.state.entities.get(id);
  if (!victim) return false;
  victim.alive = false;
  h.state.entities.delete(id);
  h.bus.emit('entity:destroyed', { id });
  return true;
}

/** Drive the run to the next wave's `active` exactly the way the player does: clear, shop, launch. */
function driveToWave(h, wave) {
  let guard = 0;
  while (!(h.state.run.phase === 'active' && h.state.run.wave === wave) && guard++ < 60 * 240) {
    const phase = h.state.run.phase;
    if (phase === 'draft') h.bus.emit('run:draftResolved', {});
    else if (phase === 'refit') h.bus.emit('run:refitClosed', {});
    tick(h, 1);
  }
}

function beginSwarm(h, seed) {
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

/** Arm the frozen hold the tick wave 1's plan lands — after the arena's own wave-1 reset. */
function freezeHoldOnPlan(h) {
  let forced = false;
  h.bus.on('run:wavePlanned', (p) => {
    if (forced || !p || p.wave !== 1) return;
    forced = true;
    Object.assign(resetSwarmPressureState(), {
      holding: true,
      holdTicks: 0,
      stored: 6,
      killsSinceReinforce: 0,
      telegraphed: true,
    });
  });
}

test('a healthy quota wave rides its breaths and never trips the stall watchdog', () => {
  const h = boot(4242);
  const releases = [];
  const telegraphs = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));
  h.bus.on('swarm:pressureTelegraph', (p) => telegraphs.push(p));
  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null && p && p.wave === 1) cleared = p; });

  beginSwarm(h, 4242);
  assert.equal(h.state.run.phase, 'active');
  for (let i = 0; i < 12000 && !cleared; i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'wave 1 cleared on its quota');
  assert.ok(telegraphs.length >= 1, 'the run earned at least one real breathing hold');
  assert.equal(releases.length, 0, 'working breaths never reach the watchdog window');
  teardown(h);
});

test('a hold frozen over owed quota starves the wave, then the watchdog lifts it', () => {
  const h = boot(4242);
  const releases = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));
  freezeHoldOnPlan(h);

  beginSwarm(h, 4242);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(swarmPressureIsHolding(), true, 'the carried hold is live at the wave open');

  // Starvation is the defect: the whole opening schedule is held, nothing materializes, and
  // the wave cannot reach its quota. It stays starved until the watchdog's window passes.
  let waited = 0;
  while (releases.length === 0 && waited < SWARM_STALL_RELEASE_TICKS + 600) {
    tick(h, 1);
    waited += 1;
    assert.equal(liveHostiles(h).length, 0, `tick ${waited}: the hold starved the opening burst`);
  }
  assert.equal(releases.length, 1, 'the watchdog released the frozen hold');
  assert.equal(releases[0].wave, 1);
  assert.equal(releases[0].heldTicks, SWARM_STALL_RELEASE_TICKS);
  assert.equal(releases[0].cause, 'pressure_hold');
  assert.equal(swarmPressureIsHolding(), false, 'the release cleared the hold itself');

  // The stream's own law resumes: the held schedule lands on the next dispatches.
  for (let i = 0; i < 120 && liveHostiles(h).length === 0; i++) tick(h, 1);
  assert.ok(liveHostiles(h).length > 0, 'the held opening burst materialized after the release');
  const materialized = h.emitted.filter((e) => e.event === 'run:waveMaterialized');
  assert.ok(materialized.length > 0, 'the wave reported its arrivals');

  // And the round still completes on its quota — the release freed the stream, not the kills.
  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null && p && p.wave === 1) cleared = p; });
  for (let i = 0; i < 12000 && !cleared; i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'the starved round still met its kill quota once the hold lifted');
  assert.equal(cleared.killed, swarmQuota(1), 'the clear came from real resolutions, not a bypass');
  assert.equal(releases.length, 1, 'no repeat fire once the stream is moving again');
  teardown(h);
});

test('the release receipt fires once per stall, not on every suppressed tick', () => {
  const h = boot(8008);
  const releases = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));
  freezeHoldOnPlan(h);

  beginSwarm(h, 8008);
  let waited = 0;
  while (releases.length === 0 && waited < SWARM_STALL_RELEASE_TICKS + 600) {
    tick(h, 1);
    waited += 1;
  }
  assert.equal(releases.length, 1);

  // Idle through another full watchdog window: with the hold lifted the schedule lands, the
  // room fills, and nothing re-arms a second release — one stall, one receipt.
  for (let i = 0; i < SWARM_STALL_RELEASE_TICKS + 300; i++) tick(h, 1);
  assert.equal(releases.length, 1, 'a released stall does not re-fire while nothing suppresses');
  assert.ok(liveHostiles(h).length > 0, 'the room filled after the release');
  teardown(h);
});

test('a clamp-refused batch is owed on a short retry — the quota is met without the watchdog', () => {
  const h = boot(4242);
  const releases = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));

  beginSwarm(h, 4242);
  assert.equal(h.state.run.phase, 'active');

  // Wave 1 opens on two groups of five (ticks 0 and 12) under a concurrency of ten. The first
  // group landed at wave start; fill the rest of the room with stand-ins so the second group
  // arrives to a full house and the concurrency clamp refuses it.
  assert.equal(liveHostiles(h).length, 5, 'the opening group landed');
  const fillers = [];
  while (survivalWave._cohort.size < survivalWave._concurrent) {
    const body = h.helpers.spawnEntity({
      type: 'ship',
      pos: { x: 40, z: 40 },
      data: { runCohort: SURVIVAL_COHORT_TAG },
    });
    survivalWave._cohort.set(body.id, { role: 'mass', entity: body });
    fillers.push(body.id);
  }
  assert.equal(survivalWave._cohort.size, 10, 'the room is exactly full when the batch comes due');

  tick(h, 12);
  assert.equal(survivalWave._pending.length, 1,
    'the refused batch stayed owed on the schedule instead of dropping to the stream');
  assert.equal(survivalWave._pending[0].entry.count, 5, 'it is owed whole, not clamped-shaved');
  assert.equal(survivalWave._pending[0].entry.atTick, 12 + SWARM_SPAWN_RETRY_TICKS,
    'it retries on the same short delay a held batch already rides');

  // Room frees: the owed batch lands on its retry tick, not whenever the stream got to it.
  for (const id of fillers) killId(h, id);
  for (let i = 0; i < SWARM_SPAWN_RETRY_TICKS + 30 && survivalWave._pending.length > 0; i++) tick(h, 1);
  assert.equal(survivalWave._pending.length, 0, 'the owed batch delivered on its retry');
  assert.equal(survivalWave._admittedTotal, 10, 'both opening groups are in the room now');

  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null && p && p.wave === 1) cleared = p; });
  for (let i = 0; i < 12000 && !cleared; i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'the wave still cleared');
  assert.equal(cleared.admitted, 15, 'every planned body was delivered — none lost to the clamp');
  assert.equal(cleared.killed, 20, 'the five stand-ins resolved too');
  assert.equal(releases.length, 0, 'no starvation ever reached the watchdog');
  teardown(h);
});

test('a hold carried across the wave boundary expires — the next opening is not starved', () => {
  const h = boot(8008);
  const releases = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));
  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null && p && p.wave === 1) cleared = p; });

  beginSwarm(h, 8008);
  for (let i = 0; i < 12000 && !cleared; i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'wave 1 cleared on its quota');

  // The defect: a hold armed late in wave 1 has nothing left to suppress, yet the pressure bag
  // deliberately carries into wave 2 — and the wave it is still holding is gone.
  Object.assign(resetSwarmPressureState(), {
    holding: true,
    holdTicks: 0,
    stored: 4,
    killsSinceReinforce: 0,
    telegraphed: true,
  });

  let plannedBag = null;
  h.bus.on('run:wavePlanned', (p) => {
    if (!plannedBag && p && p.wave === 2) {
      plannedBag = { holding: swarmPressureIsHolding(), suppressing: swarmPressureSuppressing() };
    }
  });
  driveToWave(h, 2);
  assert.equal(h.state.run.wave, 2);
  assert.equal(h.state.run.phase, 'active');

  assert.ok(plannedBag, 'the wave-2 plan was consumed');
  assert.equal(plannedBag.holding, true, 'the debt carried — the authored bag preservation stands');
  assert.equal(plannedBag.suppressing, false, 'its clock expired at the boundary: no grip remains');
  assert.ok(liveHostiles(h).length > 0, 'the new wave\'s opening burst landed on its authored beat');

  for (let i = 0; i < 30; i++) tick(h, 1);
  assert.equal(releases.length, 0, 'the boundary expiry released nothing through the watchdog');
  teardown(h);
});

test('after the boundary expiry a fresh wave-2 deficit still earns a real breath', () => {
  const h = boot(8008);
  const releases = [];
  const spends = [];
  const telegraphs = [];
  h.bus.on('swarm:stallReleased', (p) => releases.push(p));
  h.bus.on('swarm:pressureSpend', (p) => spends.push(p));
  h.bus.on('swarm:pressureTelegraph', (p) => telegraphs.push(p));
  let cleared = null;
  h.bus.on('run:waveCleared', (p) => { if (cleared == null && p && p.wave === 1) cleared = p; });

  beginSwarm(h, 8008);
  for (let i = 0; i < 12000 && !cleared; i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(cleared, 'wave 1 cleared on its quota');
  Object.assign(resetSwarmPressureState(), {
    holding: true,
    holdTicks: 0,
    stored: 4,
    killsSinceReinforce: 0,
    telegraphed: true,
  });
  driveToWave(h, 2);
  assert.equal(h.state.run.phase, 'active');

  // The carried debt is not cancelled: the new wave's first real deficit pays it through the
  // ordinary spend, count and all.
  for (let i = 0; i < 4000 && !spends.some((p) => p && p.wave === 2); i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(spends.some((p) => p && p.wave === 2), 'the carried debt paid out on the first deficit');

  // And the breath law still works: three quick kills under target re-raise a hold that the
  // wave itself announces, holds on, and releases through the same door — no watchdog.
  for (let i = 0; i < 4000 && !telegraphs.some((p) => p && p.wave === 2); i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(telegraphs.some((p) => p && p.wave === 2), 'a fresh wave-2 deficit earned a real breath');
  assert.equal(swarmPressureIsHolding(), true, 'the fresh breath is holding');

  const heldHostiles = liveHostiles(h).length;
  for (let i = 0; i < 90; i++) tick(h, 1);
  assert.equal(liveHostiles(h).length, heldHostiles, 'the breath holds the stream shut while it runs');

  for (let i = 0; i < SWARM_BREATH_TICKS + 400 && swarmPressureIsHolding(); i++) {
    if (i % 5 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.equal(swarmPressureIsHolding(), false, 'the breath released through the ordinary spend');
  assert.ok(spends.filter((p) => p && p.wave === 2).length >= 2, 'debt spend plus breath spend');
  assert.equal(releases.length, 0, 'no starvation ever reached the watchdog');
  teardown(h);
});
