// SWARM-04 — the curated ladder (SWARM_ARCADE §6, §10 step 3): one authored seed per arena,
// named zones of ten with stars, checkpoint starts with a working purse, the next-round
// preview, and the eligibility/migration/settlement plumbing that keeps side doors (Daily,
// Custom seed, practice, mutator contracts) off the ladder.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { fields } from '../src/systems/fields.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';
import {
  SWARM_ARCADE_SEEDS,
  SWARM_ARENA_STAR_GATES,
  SWARM_LADDER_ARENA_ORDER,
  applySwarmLadderResult,
  emptySwarmLadder,
  isSwarmLadderRun,
  migrateSwarmLadder,
  swarmArcadeSeedFor,
  swarmArenaIsUnlocked,
  swarmCheckpointPurseFor,
  swarmCheckpointStartWave,
  swarmLadderStarTotal,
  swarmLadderZonesCleared,
  swarmRoundPreview,
  swarmZoneChainTarget,
  swarmZoneFor,
  swarmZoneIndexFor,
  swarmZoneStars,
} from '../src/data/swarmLadder.js';
import { SURVIVAL_ARENAS } from '../src/data/survivalArenas.js';
import {
  compactRunResult,
  emptyCrucibleProfile,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { crucibleSetupFor, crucibleHullSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';

const LADDER_SEED = swarmArcadeSeedFor('helios_core');
const DT = 1 / 60;

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    _map: map,
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
  useCrucibleMetaClock(() => '2026-10-05T00:00:00.000Z');
}

function resultFixture(overrides = {}) {
  return {
    outcome: 'defeat',
    seed: LADDER_SEED,
    arenaId: 'helios_core',
    wave: 10,
    deepestWave: 10,
    wavesCleared: 10,
    kills: 12,
    score: 400,
    credits: 80,
    xp: 200,
    picks: [],
    ...overrides,
  };
}

function runFixture(overrides = {}) {
  const state = createGameState(LADDER_SEED);
  state.run.kind = 'survival';
  state.run.phase = 'ended';
  state.run.seed = LADDER_SEED;
  state.run.arenaId = 'helios_core';
  state.run.ruleset = 'swarm';
  state.run.wave = 10;
  Object.assign(state.run, overrides);
  return state.run;
}

test('one authored arcade seed per ladder arena, distinct, null outside the roster', () => {
  // The five rooms the door offers are exactly the five the ladder covers.
  for (const arenaId of SWARM_LADDER_ARENA_ORDER) {
    assert.equal(SURVIVAL_ARENAS.some((a) => a.id === arenaId), true, `${arenaId} must be a real arena`);
    assert.equal(Number.isInteger(swarmArcadeSeedFor(arenaId)), true, `${arenaId} needs a seed`);
    assert.equal(SWARM_ARENA_STAR_GATES[arenaId] != null, true, `${arenaId} needs a star gate`);
  }
  const seeds = Object.values(SWARM_ARCADE_SEEDS);
  assert.equal(new Set(seeds).size, seeds.length, 'seeds must be distinct');
  assert.equal(swarmArcadeSeedFor('ceres_belt'), null);
  assert.equal(swarmArcadeSeedFor('no_such_room'), null);
  assert.equal(swarmArcadeSeedFor(null), null);
});

test('zones of ten: index, names, boss wave, and the hardened cycle', () => {
  assert.equal(swarmZoneIndexFor(1), 0);
  assert.equal(swarmZoneIndexFor(10), 0);
  assert.equal(swarmZoneIndexFor(11), 1);
  assert.equal(swarmZoneIndexFor(20), 1);
  assert.equal(swarmZoneIndexFor(0), 0); // defensive: a bad wave reads as the first zone
  const pack = swarmZoneFor(1);
  assert.equal(pack.name, 'The Pack');
  assert.equal(pack.startWave, 1);
  assert.equal(pack.bossWave, 10);
  assert.equal(swarmZoneFor(11).name, 'The Wing');
  assert.equal(swarmZoneFor(21).name, 'The Anvil');
  assert.equal(swarmZoneFor(31).name, 'The Choir');
  // Zone 5 repeats the first name under a numeral so deep runs still name a place.
  assert.equal(swarmZoneFor(41).name, 'The Pack II');
  assert.equal(swarmZoneFor(41).number, 5);
});

test('star math: clear+no death is two stars, the chain target buys the third', () => {
  const target = swarmZoneChainTarget(0);
  // ★ beat the boss + ★ no deaths inside the zone = every clean clear banks two. The third is
  // the zone's chain ask. A defeat inside the zone (a spent revive, the day Second Wind ships)
  // takes the flawless star and leaves the clear's one.
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 0, bestChainInZone: 0 }).stars, 2);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 0, bestChainInZone: 0 }).flawless, true);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 1, bestChainInZone: 0 }).stars, 1);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 1, bestChainInZone: 0 }).flawless, false);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 0, bestChainInZone: target }).stars, 3);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 0, bestChainInZone: target }).chainHit, true);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 0, bestChainInZone: target - 1 }).stars, 2);
  assert.equal(swarmZoneStars({ zoneIndex: 0, deathsInZone: 1, bestChainInZone: target }).stars, 2);
  // The ask climbs so the late zones still ask for play.
  assert.ok(swarmZoneChainTarget(3) > swarmZoneChainTarget(0));
});

test('checkpoints: zone index to start wave, purse sized to a real mid-build', () => {
  assert.equal(swarmCheckpointStartWave(0), 1);
  assert.equal(swarmCheckpointStartWave(1), 11);
  assert.equal(swarmCheckpointStartWave(2), 21);
  assert.equal(swarmCheckpointPurseFor(0), 0);
  assert.ok(swarmCheckpointPurseFor(1) > 0);
  assert.ok(swarmCheckpointPurseFor(2) > swarmCheckpointPurseFor(1));
});

test('zones cleared counts a zone only when its boss wave fell inside the clear span', () => {
  assert.deepEqual(swarmLadderZonesCleared(1, 9), []);
  assert.deepEqual(swarmLadderZonesCleared(1, 10), [0]);
  assert.deepEqual(swarmLadderZonesCleared(1, 20), [0, 1]);
  assert.deepEqual(swarmLadderZonesCleared(1, 15), [0]);
  assert.deepEqual(swarmLadderZonesCleared(11, 15), []); // died mid-zone: no boss, no zone
  assert.deepEqual(swarmLadderZonesCleared(11, 20), [1]);
  assert.deepEqual(swarmLadderZonesCleared(11, 10), []); // cleared nothing from the checkpoint
});

test('ladder eligibility: only the arena seed under plain swarm settles', () => {
  const base = { ruleset: 'swarm', arenaId: 'helios_core', seed: LADDER_SEED, mutators: [] };
  assert.equal(isSwarmLadderRun(base), true);
  assert.equal(isSwarmLadderRun({ ...base, seed: LADDER_SEED + 1 }), false, 'a typed Custom seed is a side door');
  assert.equal(isSwarmLadderRun({ ...base, dailyDateKey: '2026-10-05' }), false, 'the Daily is a side door');
  assert.equal(isSwarmLadderRun({ ...base, weeklyMutatorId: 'draftless' }), false, 'the weekly rides a mutator');
  assert.equal(isSwarmLadderRun({ ...base, mutators: ['draftless'] }), false, 'challenge mutators rewrite the waves');
  assert.equal(isSwarmLadderRun({ ...base, mode: 'practice' }), false, 'practice never pays stars');
  assert.equal(isSwarmLadderRun({ ...base, ruleset: 'scored', mode: 'scored' }), false, 'the arc is not the ladder');
  assert.equal(isSwarmLadderRun({ ...base, arenaId: 'ceres_belt' }), false, 'no ladder in a room with no seed');
  // The compact-result shape settlement actually reads: recordRules carries the mode.
  assert.equal(isSwarmLadderRun({ ...base, recordRules: { mode: 'practice' } }), false);
  assert.equal(isSwarmLadderRun({ ...base, recordRules: { mode: 'swarm' } }), true);
  // A ghost on the ladder seed is still the ladder — the tape never touched generation.
  assert.equal(isSwarmLadderRun({ ...base, ghostHash: 1234 }), true);
});

test('migration: a profile with no ladder (or a rotten one) gets a clean slice', () => {
  assert.deepEqual(migrateSwarmLadder(null), { arenas: {} });
  assert.deepEqual(migrateSwarmLadder('garbage'), { arenas: {} });
  assert.deepEqual(migrateSwarmLadder(42), { arenas: {} });
  const migrated = migrateSwarmLadder({
    arenas: {
      helios_core: {
        checkpoint: 2,
        bestWave: 20,
        zones: {
          0: { stars: 5, bestChain: 12, junk: 'dropped' }, // stars clamp at 3
          1: { stars: 1 },
          bad: 'dropped',
        },
        extra: 'dropped',
      },
      '': { zones: {} },
    },
  });
  assert.equal(migrated.arenas.helios_core.checkpoint, 2);
  assert.equal(migrated.arenas.helios_core.zones['0'].stars, 3);
  assert.equal(migrated.arenas.helios_core.zones['0'].bestChain, 12);
  assert.equal(migrated.arenas.helios_core.zones['0'].junk, undefined);
  assert.equal(migrated.arenas.helios_core.extra, undefined);
  assert.deepEqual(emptyCrucibleProfile().ladder, emptySwarmLadder());
});

test('applySwarmLadderResult: a fresh ten-clear pays zone stars and opens the checkpoint', () => {
  const { ladder, delta } = applySwarmLadderResult(emptySwarmLadder(), {
    arenaId: 'helios_core',
    startWave: 1,
    lastClearedWave: 10,
    deepestWave: 10,
    zoneChains: { 0: swarmZoneChainTarget(0) + 2 },
    zoneDeaths: {},
  });
  const rec = ladder.arenas.helios_core;
  assert.equal(rec.zones['0'].stars, 3);
  assert.equal(rec.checkpoint, 1, 'beating The Pack opens The Wing at Round 11');
  assert.equal(rec.bestWave, 10);
  assert.equal(delta.newStars, 3);
  assert.deepEqual(delta.newCheckpoint, { zoneIndex: 1, startWave: 11, purse: swarmCheckpointPurseFor(1) });
  assert.equal(delta.zones['0'].gained, 3);
  assert.equal(delta.zones['0'].flawless, true);
  assert.equal(delta.zones['0'].chainHit, true);
});

test('applySwarmLadderResult: a checkpoint run settles the zone it actually fought', () => {
  // First clear The Pack, then a Round-11 entry that reaches the next boss.
  const first = applySwarmLadderResult(emptySwarmLadder(), {
    arenaId: 'helios_core', startWave: 1, lastClearedWave: 10, deepestWave: 10,
    zoneChains: {}, zoneDeaths: {},
  });
  const second = applySwarmLadderResult(first.ladder, {
    arenaId: 'helios_core', startWave: 11, lastClearedWave: 20, deepestWave: 20,
    zoneChains: { 1: swarmZoneChainTarget(1) }, zoneDeaths: {},
  });
  const rec = second.ladder.arenas.helios_core;
  assert.equal(rec.zones['1'].stars, 3, 'the zone the checkpoint start fought is the one paid');
  assert.equal(rec.checkpoint, 2, 'beating The Wing opens The Anvil at Round 21');
  // A mid-zone death pays nothing and loses nothing.
  const third = applySwarmLadderResult(second.ladder, {
    arenaId: 'helios_core', startWave: 21, lastClearedWave: 25, deepestWave: 26,
    zoneChains: { 2: 50 }, zoneDeaths: { 2: 1 },
  });
  assert.equal(third.delta.newStars, 0);
  assert.equal(third.delta.newCheckpoint, null);
  assert.equal(third.ladder.arenas.helios_core.zones['2'] ?? null, null, 'uncleared zone banks nothing');
  assert.equal(third.ladder.arenas.helios_core.bestWave, 26, 'deepest still records');
});

test('applySwarmLadderResult: stars never decay and a death inside the zone costs the flawless star', () => {
  const first = applySwarmLadderResult(emptySwarmLadder(), {
    arenaId: 'helios_core', startWave: 1, lastClearedWave: 10, deepestWave: 10,
    zoneChains: { 0: swarmZoneChainTarget(0) }, zoneDeaths: {},
  });
  assert.equal(first.ladder.arenas.helios_core.zones['0'].stars, 3);
  // A worse attempt later — a death inside the zone, no chain — cannot take the stars back.
  const second = applySwarmLadderResult(first.ladder, {
    arenaId: 'helios_core', startWave: 1, lastClearedWave: 10, deepestWave: 10,
    zoneChains: { 0: 0 }, zoneDeaths: { 0: 1 },
  });
  assert.equal(second.ladder.arenas.helios_core.zones['0'].stars, 3);
  assert.equal(second.delta.newStars, 0, 'no NEW stars — but none lost');
  assert.equal(second.delta.zones['0'].gained, 0);
});

test('arena gates: cumulative stars open the rooms in the authored order', () => {
  assert.equal(swarmArenaIsUnlocked(null, 'helios_core'), true, 'the Foundry is always open');
  assert.equal(swarmArenaIsUnlocked(null, 'lagrange_crucible'), false);
  const ladder = migrateSwarmLadder({
    arenas: { helios_core: { checkpoint: 2, zones: { 0: { stars: 3 } } } },
  });
  assert.equal(swarmLadderStarTotal(ladder), 3);
  assert.equal(swarmArenaIsUnlocked(ladder, 'lagrange_crucible'), true, 'three stars open Lagrange');
  assert.equal(swarmArenaIsUnlocked(ladder, 'cinder_sluice'), false, 'four needed for Cinder');
  assert.equal(swarmArenaIsUnlocked(ladder, 'no_such_room'), false);
});

test('round preview: the plan card names count, roster, newcomer, event and boss', () => {
  const opener = swarmRoundPreview({ arenaId: 'helios_core', wave: 1, seed: LADDER_SEED });
  assert.equal(opener.wave, 1);
  assert.equal(opener.zone.name, 'The Pack');
  assert.ok(opener.killTarget > 0);
  assert.ok(opener.concurrent > 0);
  assert.ok(opener.roster.length > 0);
  const boss = swarmRoundPreview({ arenaId: 'helios_core', wave: 10, seed: LADDER_SEED });
  assert.ok(boss.boss, 'wave ten is the zone boss — the preview names it');
  const event = swarmRoundPreview({ arenaId: 'helios_core', wave: 5, seed: LADDER_SEED });
  assert.ok(event.event && event.event.name, 'an event wave names its card');
  // Deterministic: same (arena, wave, seed) always draws the same card.
  assert.deepEqual(
    swarmRoundPreview({ arenaId: 'helios_core', wave: 5, seed: LADDER_SEED }),
    swarmRoundPreview({ arenaId: 'helios_core', wave: 5, seed: LADDER_SEED }),
  );
});

test('the launch path carries the checkpoint: schema wave through both door builders', () => {
  const kit = crucibleSetupFor({ starterId: 'ricochet_runner', seed: LADDER_SEED, startWave: 11 });
  assert.equal(kit.ok, true, JSON.stringify(kit.issues));
  assert.equal(kit.value.wave, 11);
  const bare = crucibleHullSetupFor({ hullId: 'ship_kestrel', seed: LADDER_SEED, startWave: 21 });
  assert.equal(bare.ok, true, JSON.stringify(bare.issues));
  assert.equal(bare.value.wave, 21);
  const fresh = crucibleSetupFor({ starterId: 'ricochet_runner', seed: LADDER_SEED });
  assert.equal(fresh.value.wave, 1, 'no checkpoint picked means round one');
});

test('runSession.begin parks the wave counter before the bought entry point', () => {
  const state = createGameState(LADDER_SEED);
  const bus = createBus();
  runSession.init({ state, bus, helpers: {} });
  bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: LADDER_SEED, arenaId: 'helios_core', startWave: 11,
  });
  assert.equal(state.run.wave, 10, 'the planner adds one — wave 11 is the first fight');
  assert.equal(state.run.telemetry.startWave, 11);
  assert.equal(state.run.phase, 'loadout');
  // A fresh run parks at zero and stamps no checkpoint fact.
  runSession.destroy();
  const state2 = createGameState(LADDER_SEED);
  const bus2 = createBus();
  runSession.init({ state: state2, bus: bus2, helpers: {} });
  bus2.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: LADDER_SEED, arenaId: 'helios_core',
  });
  assert.equal(state2.run.wave, 0);
  assert.equal(state2.run.telemetry?.startWave ?? null, null);
  runSession.destroy();
  // Non-swarm rulesets never checkpoint: a startWave on the arc is ignored.
  const state3 = createGameState(LADDER_SEED);
  const bus3 = createBus();
  runSession.init({ state: state3, bus: bus3, helpers: {} });
  bus3.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: LADDER_SEED, arenaId: 'helios_core', startWave: 11,
  });
  assert.equal(state3.run.wave, 0);
  runSession.destroy();
});

test('compactRunResult files startWave so a mid-ladder run settles the right zone', () => {
  const run = runFixture({ telemetry: { startWave: 11 } });
  const compact = compactRunResult(resultFixture({ startWave: 11, wavesCleared: 10 }), run, []);
  assert.equal(compact.startWave, 11);
  const fresh = compactRunResult(resultFixture(), runFixture(), []);
  assert.equal(fresh.startWave, 1);
});

// ── THE REAL DOOR, END TO END ─────────────────────────────────────────────────
// Same harness shape as test/round-zero-teaching-bodies.test.mjs: requestCrucibleRun →
// game:started → applySandboxSetup → run:beginRequested. The hook is a module singleton —
// the first bus it binds keeps the subscription while launchCtx repoints.

let launchBus = null;
let launchCtx = null;

function bootDoor(seed = LADDER_SEED) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 } };
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
  const registry = { get: (name) => (name === 'fields' ? fields : null) };
  const ctx = { state, bus, helpers, registry };
  fields.init(ctx);
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, ctx };
}

function armDoorLaunch(h) {
  launchCtx = h.ctx;
  if (launchBus) return;
  launchBus = h.bus;
  installSandboxGameStartedHook(h.bus, () => launchCtx);
}

test('the door, end to end: a checkpoint pick enters Round 11 with the purse already in the wallet', () => {
  resetMeta();
  useCrucibleMetaStorage(memoryStorage());
  const h = bootDoor();
  armDoorLaunch(h);

  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: LADDER_SEED, startWave: 11 });
  assert.equal(setup.ok, true);
  requestCrucibleRun(h.bus, setup.value);
  launchBus.emit('game:started');

  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.ruleset, 'swarm');
  assert.equal(begin.payload.startWave, 11, 'the bought entry point rides the begin request');
  assert.equal(h.state.run.wave, 10, 'parked one wave back — the planner adds the first fight');
  assert.equal(h.state.run.telemetry.startWave, 11);

  const awards = h.emitted.filter((e) => e.event === 'run:awardRequested');
  const checkpointAward = awards.find((a) => a.payload.reason === 'swarm:checkpoint:w11');
  assert.ok(checkpointAward, 'the checkpoint purse lands through the wallet seam');
  assert.equal(checkpointAward.payload.credits, swarmCheckpointPurseFor(1));
  assert.ok(checkpointAward.payload.credits > 0, 'a mid-build needs real money, not a round-one wallet');

  // A fresh ladder run (Round 1) asks for no checkpoint purse.
  resetMeta();
  const h2 = bootDoor();
  launchCtx = h2.ctx;
  const fresh = crucibleSetupFor({ starterId: 'ricochet_runner', seed: LADDER_SEED });
  requestCrucibleRun(h2.bus, fresh.value);
  launchBus.emit('game:started');
  const begins2 = h2.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begins2.payload.startWave ?? null, null, 'no checkpoint picked, no startWave');
  assert.equal(h2.state.run.wave, 0);
  assert.equal(
    h2.emitted.filter((e) => e.event === 'run:awardRequested'
      && String(e.payload.reason).startsWith('swarm:checkpoint')).length,
    0,
    'no checkpoint purse on a fresh run',
  );
});

test('settleCrucibleRun: the ladder run pays stars+checkpoint; side doors leave it untouched', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);

  // The ladder run — the arena's authored seed, ten rounds cleared, no deaths, the chain met.
  const ladderSettle = settleCrucibleRun({
    result: resultFixture({
      zoneChains: { 0: swarmZoneChainTarget(0) + 5 },
      zoneDeaths: {},
    }),
    run: runFixture(),
    storage,
  });
  const ladder = ladderSettle.profile.ladder;
  assert.equal(ladder.arenas.helios_core.checkpoint, 1);
  assert.equal(ladder.arenas.helios_core.zones['0'].stars, 3);
  assert.equal(ladderSettle.result.ladderDelta.newStars, 3);
  assert.equal(ladderSettle.result.ladderDelta.newCheckpoint.startWave, 11);

  // A checkpoint run: entered at Round 11, cleared through the second boss — zone 1 is paid,
  // never zone 0 a second time.
  const second = settleCrucibleRun({
    result: resultFixture({
      startWave: 11, wave: 20, deepestWave: 20, wavesCleared: 10,
      zoneChains: { 1: swarmZoneChainTarget(1) }, zoneDeaths: {},
    }),
    run: runFixture({ wave: 20, telemetry: { startWave: 11 } }),
    storage,
  });
  assert.equal(second.profile.ladder.arenas.helios_core.zones['1'].stars, 3);
  assert.equal(second.profile.ladder.arenas.helios_core.zones['0'].stars, 3, 'earned stars stay');
  assert.equal(second.profile.ladder.arenas.helios_core.checkpoint, 2);

  // A Custom seed on the same room, same ten clears: honest play, no ladder.
  settleCrucibleRun({
    result: resultFixture({ seed: 999999, zoneChains: { 0: 50 } }),
    run: runFixture({ seed: 999999 }),
    storage,
  });
  assert.equal(loadCrucibleMeta(storage).ladder.arenas.helios_core.checkpoint, 2,
    'a custom seed settles nothing new');

  // The Daily on the same seed is still the daily, not the ladder.
  settleCrucibleRun({
    result: resultFixture({ dailyDateKey: '2026-10-05', zoneChains: { 0: 50 } }),
    run: runFixture(),
    storage,
  });
  assert.equal(loadCrucibleMeta(storage).ladder.arenas.helios_core.checkpoint, 2,
    'a daily settles nothing new');

  // A mutator contract on the ladder seed rewrites the waves — it cannot pay stars.
  settleCrucibleRun({
    result: resultFixture({ zoneChains: { 0: 50 } }),
    run: runFixture({ arenaMutators: ['draftless'] }),
    storage,
  });
  assert.equal(loadCrucibleMeta(storage).ladder.arenas.helios_core.checkpoint, 2,
    'a mutator run settles nothing new');

  // A practice replay of the ladder seed settles nothing either.
  settleCrucibleRun({
    result: resultFixture({ practice: true, zoneChains: { 0: 50 } }),
    run: runFixture({ practice: true }),
    storage,
  });
  assert.equal(loadCrucibleMeta(storage).ladder.arenas.helios_core.checkpoint, 2,
    'practice settles nothing new');
});
