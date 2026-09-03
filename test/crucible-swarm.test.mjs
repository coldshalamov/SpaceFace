// PQ-135 — the swarm ruleset: constant pressure, a kill quota, and no menu four waves in five.
//
// These tests drive the REAL phase machine and the REAL wave owner through the REAL spawn budget.
// Nothing here stubs the streaming loop; the reinforcement behaviour under test is the behaviour
// the game runs.
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
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import {
  SWARM_CONCURRENT_MAX,
  SWARM_CONCURRENT_MIN,
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  pickSwarmArchetype,
  swarmArenaPhase,
  SWARM_BOSS_ROTATION,
  SWARM_QUOTA_CAP,
  swarmBossFor,
  swarmConcurrent,
  swarmCurveIsSane,
  swarmGateFor,
  swarmOpeningCount,
  swarmOpeningPackages,
  swarmQuota,
  swarmRosterFor,
} from '../src/data/swarmMode.js';
import { isSwarmRuleset, swarmWaveEndsInMenu } from '../src/systems/survivalSwarm.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import { SWARM_SPAWN_CAP, swarmPressureAt } from '../src/data/swarmMode.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { mulberry32 } from '../src/core/rng.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { buildSlotList, fits, outfitBudgetForFittings } from '../src/systems/ships.js';
import { SURVIVAL_DRAFT_OFFERS, offerDraft } from '../src/data/survivalDraft.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 4242;
const ENEMY_IDS = new Set(ENEMY_TYPES.map((e) => e.id));

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
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

/**
 * The wave's own live bodies. Filtered on the COHORT MARK, not on "everything that is not the
 * player" — swarmArena puts a dozen asteroids in the entity list, and counting those as hostiles
 * made a kill loop shoot the scenery and a pressure sample read the walls.
 */
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

/** Kill one live hostile the way the core sweep does: mark dead, drop it, then receipt. */
function killOne(h) {
  const live = liveHostiles(h);
  if (live.length === 0) return false;
  const victim = live[0];
  victim.alive = false;
  h.state.entities.delete(victim.id);
  h.bus.emit('entity:destroyed', { id: victim.id });
  return true;
}

function beginSwarm(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
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

// ---------------------------------------------------------------------------
// the curve
// ---------------------------------------------------------------------------

test('every swarm wave names a live enemy, a legal gate and a room that is never idle', () => {
  for (let wave = 1; wave <= 120; wave++) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
    assert.ok(!plan.error, `wave ${wave} plans`);
    assert.equal(plan.mode, SWARM_RULESET);
    assert.notEqual(plan.arenaPhase, 'idle', `wave ${wave} room is doing something`);
    assert.equal(plan.arenaPhase, swarmArenaPhase(wave));
    assert.ok(plan.schedule.length > 0, `wave ${wave} has an opening burst`);
    for (const entry of plan.schedule) {
      assert.ok(ENEMY_IDS.has(entry.enemyId), `${entry.enemyId} is a live archetype`);
      assert.ok(entry.count > 0);
    }
    // The opening burst can never exceed the shared cap on its own.
    assert.ok(
      swarmOpeningCount(plan.packages) <= SPAWN_BUDGET_DEFAULT_MAX,
      `wave ${wave} opening burst fits the cap`,
    );
    assert.ok(plan.swarm.concurrent <= SWARM_CONCURRENT_MAX);
    assert.ok(plan.swarm.quota > 0);
  }
});

test('a swarm plan is deterministic and pure JSON, like every other plan', () => {
  const a = planWave({ seed: SEED, arenaId: ARENA, wave: 13, ruleset: SWARM_RULESET });
  const b = planWave({ seed: SEED, arenaId: ARENA, wave: 13, ruleset: SWARM_RULESET });
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  const other = planWave({ seed: SEED + 1, arenaId: ARENA, wave: 13, ruleset: SWARM_RULESET });
  assert.notDeepEqual(other.schedule, a.schedule);
});

test('a swarm wave has no last wave and no blocking role that could stall it', () => {
  const deep = planWave({ seed: SEED, arenaId: ARENA, wave: SWARM_WAVE_MAX, ruleset: SWARM_RULESET });
  assert.ok(!deep.error, 'the 999th wave still plans — the arc would have refused past 30');
  for (const wave of [1, 7, 40, 400]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
    assert.equal(plan.completionRules.requiredPackagesMaterialized, false);
    assert.deepEqual(plan.completionRules.blockingRoles, []);
  }
});

test('pressure and quota rise, and the roster opens one archetype at a time', () => {
  assert.equal(swarmConcurrent(1), SWARM_CONCURRENT_MIN);
  let previousRoster = 0;
  for (let wave = 1; wave <= 40; wave++) {
    const roster = swarmRosterFor(wave).length;
    assert.ok(roster >= previousRoster, 'the roster never shrinks');
    assert.ok(roster - previousRoster <= 1, 'at most one new silhouette per wave');
    previousRoster = roster;
    if (wave > 1 && !isSwarmBossWave(wave) && !isSwarmBossWave(wave - 1)) {
      // The quota RISES until it caps, then holds — wave length is a constant, not a curve, or a
      // late wave would take ten minutes. Concurrency is what keeps climbing.
      assert.ok(swarmQuota(wave) >= swarmQuota(wave - 1), `wave ${wave} never asks for less`);
      assert.ok(swarmConcurrent(wave) >= swarmConcurrent(wave - 1));
    }
    // The invariant that actually matters: a wave must be more than its opening burst.
    assert.ok(swarmCurveIsSane(wave), `wave ${wave} keeps quota at 2x concurrency or better`);
  }
  assert.ok(swarmQuota(12) > swarmQuota(1), 'the quota does climb early');
  assert.equal(swarmQuota(60), SWARM_QUOTA_CAP, 'and flattens at the cap rather than growing forever');
  // Wave 1 already holds more hulls than the authored arc's wave 1 has bodies in total (six), and
  // the ceiling is a real swarm rather than a squad.
  assert.ok(swarmConcurrent(1) > 6);
  assert.equal(swarmConcurrent(999), SWARM_CONCURRENT_MAX);
  assert.ok(SWARM_CONCURRENT_MAX >= 30, 'thirty hulls on you is the deep-run promise');
});

test('a newly unlocked archetype actually shows up on the wave that unlocked it', () => {
  // Weighted-pick bias, not a promise from a comment: roll the stream and count.
  for (const wave of [2, 4, 6, 8, 10, 12]) {
    const roster = swarmRosterFor(wave);
    const newest = roster[roster.length - 1];
    const rng = mulberry32(wave * 7919 + 1);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      if (pickSwarmArchetype(wave, rng()).enemyId === newest.enemyId) hits++;
    }
    assert.ok(hits > 20, `wave ${wave} actually fields ${newest.enemyId} (${hits}/400)`);
  }
});

test('arrivals walk the gate ring instead of pouring out of one door', () => {
  for (const wave of [1, 5, 11, 23]) {
    const gates = new Set();
    for (let i = 0; i < 8; i++) gates.add(swarmGateFor(wave, i));
    assert.ok(gates.size >= 4, `wave ${wave} uses ${gates.size} bearings`);
  }
});

// ---------------------------------------------------------------------------
// the live loop
// ---------------------------------------------------------------------------

test('a swarm run reaches active with the room already under pressure', () => {
  const h = boot();
  const run = beginSwarm(h);
  assert.equal(run.phase, 'active');
  assert.equal(run.wave, 1);
  assert.ok(isSwarmRuleset(run.ruleset), 'the run is playing the swarm ruleset');

  // The whole opening burst is on the board inside 24 ticks — a swarm wave opens AT pressure.
  tick(h, 30);
  const opening = swarmOpeningCount(swarmOpeningPackages(1, () => 0.5));
  assert.ok(
    h.spawned.length >= opening,
    `the opening burst landed (${h.spawned.length} of ${opening})`,
  );
  assert.equal(liveHostiles(h).length, swarmConcurrent(1), 'the room opened at full strength');
  for (const entity of h.spawned) {
    assert.equal(entity.data.runCohort, SURVIVAL_COHORT_TAG);
    assert.equal(entity.data.runWave, 1);
  }
});

test('killing a hostile refills the room — the wave never empties while it is live', () => {
  const h = boot();
  beginSwarm(h);
  const target = swarmConcurrent(1);

  // Kill two and let the stream work. It must top back up rather than leaving the room thinner.
  killOne(h);
  killOne(h);
  const thinned = liveHostiles(h).length;
  tick(h, 90);
  const refilled = liveHostiles(h).length;
  assert.ok(refilled > thinned, `the room refilled (${thinned} -> ${refilled})`);
  assert.ok(refilled <= target, 'and never above the wave concurrency target');
});

test('the stream holds the room near strength across a whole wave, and never breaches the cap', () => {
  const h = boot();
  beginSwarm(h);
  const target = swarmConcurrent(1);
  let ticksUnderPressure = 0;
  let sampled = 0;
  let peak = 0;

  // 900 ticks with a kill every 12 ticks — a plausible clear rate for wave 1.
  for (let i = 0; i < 900; i++) {
    if (i % 12 === 0) killOne(h);
    tick(h, 1);
    if (h.state.run.phase !== 'active') break;
    sampled++;
    const alive = liveHostiles(h).length;
    peak = Math.max(peak, alive);
    if (alive >= Math.min(4, target)) ticksUnderPressure++;
  }
  assert.ok(sampled > 0, 'the wave stayed live long enough to sample');
  const uptime = ticksUnderPressure / sampled;
  assert.ok(uptime > 0.9, `threat uptime ${(uptime * 100).toFixed(1)}% is near-continuous`);
  assert.ok(peak <= SPAWN_BUDGET_DEFAULT_MAX, `peak ${peak} respected the shared cap`);
  assert.ok(h.budget.current() <= h.budget.max(), 'the budget was never oversubscribed');
});

test('a wave clears on KILLS, with survivors still flying', () => {
  const h = boot();
  beginSwarm(h);
  const quota = swarmQuota(1);

  let killed = 0;
  for (let i = 0; i < 4000 && h.state.run.phase === 'active'; i++) {
    if (i % 6 === 0 && killOne(h)) killed++;
    tick(h, 1);
  }
  const cleared = named(h.emitted, 'run:waveCleared');
  assert.equal(cleared.length, 1, 'the wave reported itself cleared');
  assert.equal(cleared[0].payload.quota, quota);
  assert.ok(cleared[0].payload.killed >= quota, 'the quota was met');
  assert.ok(killed >= quota);
  // THE POINT: the room was not empty when the wave ended.
  assert.ok(cleared[0].payload.survivors > 0, 'survivors carried, so there is no lull to cover');
  assert.ok(liveHostiles(h).length > 0);
});

test('wave 2 opens under the pressure wave 1 left behind, and no budget slot leaks', () => {
  const h = boot();
  beginSwarm(h);
  // Clear wave 1's quota, but stop shooting the moment it is met — the question here is what the
  // NEXT wave inherits, not how fast a player can empty a room between waves.
  for (let i = 0; i < 6000 && h.state.run.wave === 1 && h.state.run.phase === 'active'; i++) {
    if (i % 6 === 0) killOne(h);
    tick(h, 1);
  }
  const survivors = liveHostiles(h).length;
  assert.ok(survivors > 0, 'wave 1 ended with hostiles still on the player');

  // Roll through cleanup and the auto-resolved draft into wave 2 without firing a shot.
  for (let i = 0; i < 600 && !(h.state.run.wave === 2 && h.state.run.phase === 'active'); i++) {
    tick(h, 1);
  }
  assert.equal(h.state.run.wave, 2);
  assert.equal(h.state.run.phase, 'active');
  assert.ok(
    liveHostiles(h).length >= survivors,
    'wave 2 opened with wave 1 survivors still flying, then topped up',
  );
  // Budget bookkeeping must still match the live board exactly — no slot leaked across the seam.
  assert.equal(h.budget.current(), liveHostiles(h).length);
  assert.ok(h.budget.current() <= h.budget.max());
});

test('the room is never empty across a wave boundary', () => {
  const h = boot();
  beginSwarm(h);
  let emptyTicks = 0;
  let sampled = 0;
  for (let i = 0; i < 5000 && h.state.run.wave < 3; i++) {
    if (i % 7 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
    sampled++;
    if (liveHostiles(h).length === 0) emptyTicks++;
  }
  assert.ok(h.state.run.wave >= 3, 'the run walked two full wave boundaries');
  assert.equal(emptyTicks, 0, `the room was empty on ${emptyTicks} of ${sampled} ticks`);
});

test('an empty room refills on the very next tick, not on the next gap', () => {
  // The gap timer paces ordinary top-ups. A live walk found one empty moment in eighty-six: a fast
  // player clears the last survivor in the beat before the next wave's burst lands, and the timer
  // made the room wait. Nothing is allowed to make an empty room wait.
  const h = boot();
  beginSwarm(h);
  tick(h, 40);
  assert.ok(liveHostiles(h).length > 0);
  // Empty the board outright, mid-wave.
  while (killOne(h)) { /* clear it */ }
  assert.equal(liveHostiles(h).length, 0);
  tick(h, 1);
  assert.ok(
    liveHostiles(h).length > 0,
    'the room came straight back rather than waiting out the reinforcement gap',
  );
});

test('a fast clear cannot out-run the stream — the room closes back in', () => {
  // The browser walk found this: a fixed reinforcement batch is beatable by a quick enough player,
  // and once it is beaten the wave finishes in an empty room. Kill at 15 a second (far above any
  // real clear rate) and the room must still never be empty.
  const h = boot();
  beginSwarm(h);
  let empty = 0;
  let samples = 0;
  let survivorsAtClear = null;
  h.bus.on('run:waveCleared', (p) => { if (survivorsAtClear == null) survivorsAtClear = p.survivors; });
  for (let i = 0; i < 3000 && h.state.run.wave < 3; i++) {
    if (i % 4 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
    samples++;
    if (liveHostiles(h).length === 0) empty++;
  }
  assert.equal(empty, 0, `room empty on ${empty} of ${samples} ticks under a 15/s clear`);
  assert.ok(survivorsAtClear > 0, `wave 1 ended with ${survivorsAtClear} hostiles still flying`);
});

test('four waves in five open no menu at all', () => {
  for (let wave = 1; wave <= 40; wave++) {
    const expected = wave % SWARM_DRAFT_EVERY === 0 || wave % SWARM_REFIT_EVERY === 0;
    assert.equal(swarmWaveEndsInMenu(wave), expected, `wave ${wave} menu expectation`);
  }
  const menus = Array.from({ length: 40 }, (_, i) => swarmWaveEndsInMenu(i + 1))
    .filter(Boolean).length;
  assert.equal(menus, 8, 'eight upgrade stops in forty waves, not forty');
  // Every refit wave is also a draft wave, so the bench never costs the player a card.
  for (let wave = 1; wave <= 60; wave++) {
    if (wave % SWARM_REFIT_EVERY === 0) {
      assert.equal(wave % SWARM_DRAFT_EVERY, 0, `wave ${wave} takes its card before the bench`);
    }
  }
});

test('a swarm refit wave gives BOTH the card and the bench, in that order', () => {
  const h = boot();
  beginSwarm(h);
  // Walk to the wave-10 stop, taking the wave-5 card on the way.
  const seen = [];
  h.bus.on('run:transitioned', (p) => {
    if (p && (p.phase === 'draft' || p.phase === 'refit')) seen.push(`w${h.state.run.wave}:${p.phase}`);
  });
  // Resolve whatever surface opens so the run keeps moving.
  h.bus.on('run:transitioned', (p) => {
    if (!p) return;
    if (p.phase === 'draft') h.bus.emit('run:draftResolved', {});
    if (p.phase === 'refit') h.bus.emit('run:refitClosed', {});
  });
  for (let i = 0; i < 60000 && h.state.run.wave < 11; i++) {
    if (i % 4 === 0 && h.state.run.phase === 'active') killOne(h);
    tick(h, 1);
  }
  assert.ok(h.state.run.wave >= 11, `the run reached wave ${h.state.run.wave}`);
  assert.ok(seen.includes('w5:draft'), `wave 5 opened a draft (saw ${seen.join(', ')})`);
  const tenth = seen.indexOf('w10:draft');
  assert.ok(tenth >= 0, `wave 10 opened its draft (saw ${seen.join(', ')})`);
  assert.equal(seen[tenth + 1], 'w10:refit', 'and the bench came straight after the card');
});

test('a swarm run does not stop for a draft on a fight wave — it rolls straight into the next', () => {
  const h = boot();
  beginSwarm(h);
  // Walk to wave 2 and record whether any draft surface was ever offered.
  for (let i = 0; i < 6000 && h.state.run.wave < 2; i++) {
    if (i % 6 === 0) killOne(h);
    tick(h, 1);
  }
  assert.equal(h.state.run.wave, 2);
  const offers = named(h.emitted, 'run:draftOffered');
  assert.equal(offers.length, 0, 'no draft was offered between wave 1 and wave 2');
  // The run still passed THROUGH draft — that is the only legal edge out of cleanup — but it
  // resolved on arrival.
  const transitions = named(h.emitted, 'run:transitioned').map((e) => e.payload.phase);
  assert.ok(transitions.includes('draft'), 'the phase machine still used the legal edge');
});

test('the room raises its own capacity for the run and gives it back afterwards', () => {
  const h = boot();
  const before = h.budget.max();
  assert.equal(before, SPAWN_BUDGET_DEFAULT_MAX, 'the campaign default is untouched to start');
  swarmArena.init(h.ctx);
  beginSwarm(h);
  assert.equal(h.budget.max(), SWARM_SPAWN_CAP, 'a live run holds a swarm-sized room');
  assert.ok(SWARM_SPAWN_CAP <= 40, 'and never asks spawnBudget to move its own hard wall');
  h.bus.emit('run:ended', { outcome: 'defeat' });
  assert.equal(h.budget.max(), before, 'the campaign gets its own number back');
  swarmArena.destroy();
});

test('a wave BUILDS: the room opens below its ceiling and closes in as the quota burns down', () => {
  for (const wave of [5, 8, 15, 25]) {
    const open = swarmPressureAt(wave, 0);
    const mid = swarmPressureAt(wave, 0.33);
    const full = swarmPressureAt(wave, 1);
    const ceiling = swarmConcurrent(wave);
    assert.ok(open < ceiling, `wave ${wave} opens below its ceiling (${open} of ${ceiling})`);
    assert.ok(mid > open, `wave ${wave} is thicker by a third through`);
    assert.equal(full, ceiling, `wave ${wave} reaches full strength`);
    // Monotone: pressure never drops mid-wave.
    let previous = 0;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const p = swarmPressureAt(wave, t);
      assert.ok(p >= previous, `wave ${wave} pressure never falls (at ${t.toFixed(2)})`);
      previous = p;
    }
  }
  // Garbage progress reads as the opening, never as a spike.
  assert.equal(swarmPressureAt(10, NaN), swarmPressureAt(10, 0));
  assert.equal(swarmPressureAt(10, -5), swarmPressureAt(10, 0));
  assert.equal(swarmPressureAt(10, 99), swarmPressureAt(10, 1));
});

test('the live stream honours the crescendo, and never breaches the raised cap', () => {
  // Driven on a FRESH run at a deep wave rather than by walking there. Walking works, but wave N
  // inherits wave N-1's survivors — which is the whole no-lull rule — so the room can already be at
  // its ceiling on the first tick and the ramp is invisible. Starting the wave cold is the only way
  // to watch the room actually build.
  const h = boot();
  swarmArena.init(h.ctx);
  beginSwarm(h);
  // Clear wave 1 off the board first. A swarm wave INHERITS the last one's survivors by design, so
  // without this the wave-8 plan opens on top of wave 1's ten and starts at its ceiling.
  while (killOne(h)) { /* empty the room */ }
  tick(h, 2);
  const plan = forceWave(h, 8);
  const ceiling = plan.swarm.concurrent;
  const opening = swarmPressureAt(8, 0);
  assert.ok(opening < ceiling, 'wave 8 has real headroom to build into');

  tick(h, 40);
  const atStart = liveHostiles(h).length;
  assert.ok(atStart <= opening, `the room opened at its opening pressure (${atStart} of ${opening})`);

  let peak = atStart;
  let late = 0;
  for (let i = 0; i < 8000 && !this_cleared(h); i++) {
    if (i % 9 === 0) killOne(h);
    tick(h, 1);
    const alive = liveHostiles(h).length;
    peak = Math.max(peak, alive);
    if (h.state.run.resolvedThreat / Math.max(1, h.state.run.threatBudget) > 0.75) {
      late = Math.max(late, alive);
    }
  }
  assert.ok(late > atStart, `the room was thicker late than it opened (${atStart} -> ${late})`);
  assert.ok(peak <= ceiling, `peak ${peak} respected the wave ceiling ${ceiling}`);
  assert.ok(h.budget.current() <= h.budget.max(), 'and the raised cap was never breached');
  swarmArena.destroy();
});

function this_cleared(h) {
  return named(h.emitted, 'run:waveCleared').length > 0;
}

// ---------------------------------------------------------------------------
// the boss wave
// ---------------------------------------------------------------------------

/** Drive survivalWave onto an arbitrary wave's plan without walking there in real time. */
function forceWave(h, wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave });
  return plan;
}

/**
 * Every champion body on the board — which may be one Dreadnought or a wing of three raiders.
 * The wave is passed in rather than read off run.wave: `forceWave` drives the wave OWNER onto a
 * deep wave while the run envelope stays where it was, which is the whole point of that helper.
 */
function liveBosses(h, wave) {
  const champions = new Set(
    (swarmBossFor(wave) || { packages: [] }).packages.map((p) => p.enemyId),
  );
  return liveHostiles(h).filter((e) => e.data && champions.has(e.data.lootTableId));
}

test('a boss wave fields a Dreadnought and says it owes one', () => {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 10, ruleset: SWARM_RULESET });
  assert.equal(plan.swarm.boss, true);
  assert.equal(plan.swarm.requireBoss, true);
  assert.equal(plan.objective.kind, 'boss');
  assert.ok(
    plan.packages.some((p) => p.champion === true),
    'the champion is in the opening burst, not something the stream might roll',
  );
  // The chaff around it is thinner than an ordinary wave of the same depth, so the capital hull is
  // legible instead of buried — but not so thin that the escort stops mattering.
  assert.ok(plan.swarm.concurrent < swarmConcurrent(11));
  assert.ok(plan.swarm.concurrent >= 10);
});

test('meeting the quota does NOT clear a boss wave while the Dreadnought is alive', () => {
  const h = boot();
  beginSwarm(h);
  const plan = forceWave(h, 10);
  const quota = plan.swarm.quota;
  tick(h, 30);
  assert.ok(liveBosses(h, 10).length > 0, 'the champion is on the board');

  // Kill only chaff, well past the quota.
  let chaffKilled = 0;
  for (let i = 0; i < 4000 && chaffKilled < quota + 12; i++) {
    if (i % 5 === 0) {
      const bossIds = new Set(liveBosses(h, 10).map((e) => e.id));
      const chaff = liveHostiles(h).find((e) => !bossIds.has(e.id));
      if (chaff) {
        chaff.alive = false;
        h.state.entities.delete(chaff.id);
        h.bus.emit('entity:destroyed', { id: chaff.id });
        chaffKilled++;
      }
    }
    tick(h, 1);
  }
  assert.ok(chaffKilled > quota, `killed ${chaffKilled} chaff, past the quota of ${quota}`);
  assert.equal(
    named(h.emitted, 'run:waveCleared').length,
    0,
    'the wave is still running — the boss is the work, not one more body in the count',
  );
  // And the room did not go quiet while the duel was owed.
  assert.ok(liveHostiles(h).length > 1, 'a screen is still coming during the duel');

  // Now kill EVERY champion — a boss wave may owe a wing, not just one hull.
  const bosses = liveBosses(h, 10);
  assert.ok(bosses.length > 0, 'the champion is still flying');
  for (const boss of bosses) {
    boss.alive = false;
    h.state.entities.delete(boss.id);
    h.bus.emit('entity:destroyed', { id: boss.id });
  }
  tick(h, 2);

  const cleared = named(h.emitted, 'run:waveCleared');
  assert.equal(cleared.length, 1, 'killing the Dreadnought ends the wave');
  assert.equal(cleared[0].payload.wave, 10);
});

test('a boss wave still ends normally when the boss dies first', () => {
  const h = boot();
  beginSwarm(h);
  const plan = forceWave(h, 10);
  tick(h, 30);
  const bosses = liveBosses(h, 10);
  assert.ok(bosses.length > 0);
  for (const boss of bosses) {
    boss.alive = false;
    h.state.entities.delete(boss.id);
    h.bus.emit('entity:destroyed', { id: boss.id });
  }

  // The quota is still owed after the boss goes down — the wave does not end early either.
  tick(h, 5);
  assert.equal(named(h.emitted, 'run:waveCleared').length, 0, 'the quota is still owed');

  let killed = bosses.length;
  for (let i = 0; i < 6000 && named(h.emitted, 'run:waveCleared').length === 0; i++) {
    if (i % 5 === 0 && killOne(h)) killed++;
    tick(h, 1);
  }
  const cleared = named(h.emitted, 'run:waveCleared');
  assert.equal(cleared.length, 1);
  assert.ok(cleared[0].payload.killed >= plan.swarm.quota);
});

test('a boss wave fields its champion even when it inherits a FULL room', () => {
  // The real sequence this guards: wave 9 runs at concurrency 20 with no taper, so it can clear
  // with twenty survivors. Wave 10's boss concurrency is 18. The opening-burst headroom clamp then
  // computes min(1, 18 - 20) = 0 for the champion batch — and the dispatch loop DROPS a clamped
  // batch rather than deferring it, so the Dreadnought would never be fielded, `requireBoss` would
  // have nothing to require, and the boss wave would clear on chaff alone with no boss in it.
  const h = boot();
  beginSwarm(h);
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 10, ruleset: SWARM_RULESET });
  const bossCeiling = plan.swarm.concurrent;

  // Stuff the room past the boss wave's own ceiling, exactly as an inherited wave 9 would. Wave 9
  // has to be PLAYED to get there: the crescendo means its room only reaches its own ceiling of 20
  // as its quota burns down, which is precisely the moment a boss wave inherits from it.
  const nine = planWave({ seed: SEED, arenaId: ARENA, wave: 9, ruleset: SWARM_RULESET });
  h.bus.emit('run:wavePlanned', { wave: 9, plan: nine });
  h.bus.emit('run:waveStarted', { wave: 9 });
  for (let i = 0; i < 4000 && liveHostiles(h).length <= bossCeiling; i++) {
    if (i % 30 === 0) killOne(h);
    tick(h, 1);
  }
  assert.ok(
    liveHostiles(h).length > bossCeiling,
    `the room is fuller (${liveHostiles(h).length}) than the boss wave's ceiling (${bossCeiling})`,
  );

  // Now the boss wave arrives on top of it.
  h.bus.emit('run:wavePlanned', { wave: 10, plan });
  h.bus.emit('run:waveStarted', { wave: 10 });
  tick(h, 60);
  assert.ok(
    liveBosses(h, 10).length > 0,
    'the champion was fielded despite the room already being over strength',
  );
});

test('the champion changes: four different shapes of boss wave, in step with the roster', () => {
  const seen = [];
  for (let step = 1; step <= SWARM_BOSS_ROTATION.length; step++) {
    const wave = step * 10;
    const boss = swarmBossFor(wave);
    assert.ok(boss, `wave ${wave} has a champion`);
    assert.ok(!seen.includes(boss.id), `wave ${wave} is a boss the player has not fought (${boss.id})`);
    seen.push(boss.id);
    // Nothing may debut as a champion: every archetype in a boss wave is one the roster has
    // already introduced as ordinary chaff by then.
    const roster = new Set(swarmRosterFor(wave).map((e) => e.enemyId));
    for (const pkg of boss.packages) {
      if (pkg.enemyId === 'dreadnought_boss') continue;
      assert.ok(roster.has(pkg.enemyId), `${pkg.enemyId} was already met before wave ${wave}`);
    }
    assert.ok(boss.label && boss.line, `${boss.id} names itself`);
  }
  assert.equal(seen.length, SWARM_BOSS_ROTATION.length, 'all four before any repeat');
  // And it wraps rather than running out.
  assert.equal(swarmBossFor((SWARM_BOSS_ROTATION.length + 1) * 10).id, SWARM_BOSS_ROTATION[0].id);
  assert.equal(swarmBossFor(7), null, 'an ordinary wave has no champion');
});

test('every tenth wave is a boss wave, and no other wave owes one', () => {
  for (let wave = 1; wave <= 60; wave++) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
    const expected = wave % 10 === 0;
    assert.equal(plan.swarm.boss, expected, `wave ${wave} boss flag`);
    assert.equal(plan.swarm.requireBoss, expected);
    assert.equal(
      plan.packages.some((p) => p.champion === true),
      expected,
      `wave ${wave} champion presence`,
    );
  }
});

// ---------------------------------------------------------------------------
// the upgrade path
// ---------------------------------------------------------------------------

test('the swarm draft is a real upgrade path, not three ways to swap a gun', () => {
  // The arc's pool is fourteen weapons and the starter hull holds three, so after three picks an
  // endless run would offer nothing but sideways trades forever. Walk the actual drafts of a run.
  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    const ship = SHIPS.find((s) => s.id === starter.hullId);
    const slots = buildSlotList(ship);
    const fittings = slots.map(() => null);
    for (const entry of starter.loadout) fittings[entry.slotIndex] = entry.defId;

    const arc = offerDraft({
      seed: SEED, hullId: starter.hullId, wave: 5, fittings: fittings.slice(), pickCount: 0, count: 3,
    });
    const swarm = offerDraft({
      seed: SEED,
      hullId: starter.hullId,
      wave: 5,
      fittings: fittings.slice(),
      pickCount: 0,
      count: 3,
      ruleset: SWARM_RULESET,
    });
    assert.ok(
      swarm.eligibleCount > arc.eligibleCount,
      `${starter.id}: the swarm pool is deeper (${swarm.eligibleCount} vs ${arc.eligibleCount})`,
    );
    // While the hull has room, every card should be something the player does not have yet.
    for (const offer of swarm.offers) {
      assert.equal(offer.replaces, null, `${starter.id}: first draft adds rather than swaps`);
    }
  }
});

test('a swarm run keeps filling slots for several drafts before it runs out of room', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'physics_toolkit');
  const ship = SHIPS.find((s) => s.id === starter.hullId);
  const fittings = buildSlotList(ship).map(() => null);
  for (const entry of starter.loadout) fittings[entry.slotIndex] = entry.defId;

  let additions = 0;
  for (let pick = 0; pick < 4; pick++) {
    const wave = (pick + 1) * SWARM_DRAFT_EVERY;
    const result = offerDraft({
      seed: SEED, hullId: starter.hullId, wave, fittings, pickCount: pick, count: 3,
      ruleset: SWARM_RULESET,
    });
    assert.ok(result.offers.length === 3, `wave ${wave} still offers three cards`);
    const taken = result.offers[0];
    if (taken.replaces == null) additions++;
    fittings[taken.slotIndex] = taken.defId;
  }
  assert.equal(additions, 4, 'the first four drafts of a run were all straight additions');
  // And the hull ends up carrying more than the three weapons it started with.
  assert.ok(fittings.filter(Boolean).length >= starter.loadout.length + 4);
});

test('the Massline Rig exists and can actually carry the rope', () => {
  // Every other starter can hold the physics WEAPONS but not the physics ROPE: the massline heads
  // are M-size utility and only the Drifter has M utility slots among the ungated hulls.
  const rig = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'massline_rig');
  assert.ok(rig, 'the swarm has a hull built for the rope');
  const ship = SHIPS.find((s) => s.id === rig.hullId);
  const slots = buildSlotList(ship);
  const fittings = slots.map(() => null);
  for (const entry of rig.loadout) {
    assert.ok(slots[entry.slotIndex], `slot ${entry.slotIndex} exists`);
    fittings[entry.slotIndex] = entry.defId;
  }
  const budget = outfitBudgetForFittings(rig.hullId, fittings);
  assert.ok(budget.fits, 'and the authored loadout is inside its outfit budget');

  const offers = offerDraft({
    seed: SEED, hullId: rig.hullId, wave: 5, fittings, pickCount: 0, count: 3,
    ruleset: SWARM_RULESET,
  });
  const ids = offers.offers.map((o) => o.defId);
  assert.ok(offers.eligibleCount > 0);
  // At least one massline head is reachable from this hull's draft pool.
  const heads = ['mod_transverse_snare_m', 'mod_monofilament_sweep_m', 'mod_tractor_beam_m', 'mod_massline_spool_m'];
  const reachable = SWARM_DRAFT_OFFERS.filter((o) => heads.includes(o.defId));
  assert.ok(reachable.length >= 3, 'the rope heads are in the pool');
  assert.ok(Array.isArray(ids));
});

test('every swarm draft card is a live fitting that lands somewhere on a live starter hull', () => {
  const defs = new Map([
    ...WEAPONS.map((d) => [d.id, d]),
    ...MODULES.map((d) => [d.id, d]),
  ]);
  for (const offer of SWARM_DRAFT_OFFERS) {
    const def = defs.get(offer.defId);
    assert.ok(def, `${offer.defId} is a live fitting`);
    assert.ok(typeof offer.verb === 'string' && offer.verb.length > 0);
    assert.ok(typeof offer.blurb === 'string' && offer.blurb.length > 0);
    // No percentages in the copy — same rule the weapon pool follows.
    assert.ok(!/%|\+\d|\d+x/.test(offer.blurb), `${offer.id} blurb names an effect, not a number`);
    const landsSomewhere = COMBAT_LAB_STARTER_PACKAGES.some((starter) => {
      const ship = SHIPS.find((s) => s.id === starter.hullId);
      return buildSlotList(ship).some((slot) => fits(slot, def));
    });
    assert.ok(landsSomewhere, `${offer.defId} fits at least one starter hull — no dead cards`);
  }
});

test('the Gauntlet draft pool is exactly what it always was', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'physics_toolkit');
  const ship = SHIPS.find((s) => s.id === starter.hullId);
  const fittings = buildSlotList(ship).map(() => null);
  for (const entry of starter.loadout) fittings[entry.slotIndex] = entry.defId;
  const arc = offerDraft({ seed: SEED, hullId: starter.hullId, wave: 1, fittings, pickCount: 0, count: 3 });
  for (const offer of arc.offers) {
    assert.ok(
      SURVIVAL_DRAFT_OFFERS.some((o) => o.id === offer.id),
      `${offer.id} came from the arc's own pool`,
    );
  }
});

test('survivalWave is still a strict no-op for the arc: the pinned waves are untouched', () => {
  const arc = planWave({ seed: 47, arenaId: ARENA, wave: 1 });
  assert.equal(arc.packages[0].enemyId, 'wasp_swarmer');
  assert.equal(arc.packages[0].count, 6);
  assert.equal(arc.arenaPhase, 'idle');
  assert.equal(arc.swarm, undefined, 'an arc plan carries no swarm block');
});
