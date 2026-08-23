// CRU-011 — survivalRun ticking phase machine (PQ-133 / §27.4–§27.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { LEGACY47A_SYSTEM_IDS } from '../src/runtime/runtimeProfiles.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_REFIT_EVERY,
  SURVIVAL_RUN_WAVE_COUNT,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';

const DT = 1 / 60;
const NOOP_TICKS = 600;
const WAVE_COUNT = 30;
const REFIT_EVERY = 10;
const LIVE_ARENA_ID = 'helios_core';
const BOSS_CLEANUP_TICKS = 240;

function cleanupTicksForWave(wave) {
  const template = ((wave - 1) % 10) + 1;
  return template === 10 ? BOSS_CLEANUP_TICKS : SURVIVAL_CLEANUP_TICKS;
}

function snapshotTree(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return value;
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Map) {
    const entries = [];
    for (const [key, entry] of value.entries()) {
      entries.push([snapshotTree(key, seen), snapshotTree(entry, seen)]);
    }
    return { __type: 'Map', entries };
  }
  if (value instanceof Set) {
    const values = [];
    for (const entry of value.values()) values.push(snapshotTree(entry, seen));
    return { __type: 'Set', values };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) out[i] = snapshotTree(value[i], seen);
    return out;
  }
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    out[key] = snapshotTree(value[key], seen);
  }
  return out;
}

function captureState(state) {
  const identities = {};
  const keys = Object.keys(state);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    identities[key] = state[key];
  }
  return { keys, identities, tree: snapshotTree(state) };
}

function assertStateUnchanged(before, state, label) {
  assert.deepEqual(Object.keys(state), before.keys, `${label}: keys`);
  for (let i = 0; i < before.keys.length; i++) {
    const key = before.keys[i];
    assert.equal(state[key], before.identities[key], `${label}: ${key} identity`);
  }
  assert.deepEqual(snapshotTree(state), before.tree, `${label}: deep tree`);
}

function ownershipSnapshot(state) {
  return {
    player: snapshotTree(state.player),
    economy: snapshotTree(state.economy),
    factions: snapshotTree(state.factions),
    world: snapshotTree(state.world),
    combat: snapshotTree(state.combat),
    entities: snapshotTree(state.entities),
    entityList: state.entityList.slice(),
    nextEntityId: state.nextEntityId,
    playerRef: state.player,
    economyRef: state.economy,
    factionsRef: state.factions,
    worldRef: state.world,
    combatRef: state.combat,
    entitiesRef: state.entities,
  };
}

function boot(seed = 1, { runSessionOn = true } = {}) {
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
  if (runSessionOn) runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  return { state, bus, emitted };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function transitionPairs(emitted) {
  return named(emitted, 'run:transitionRequested').map((entry) => [
    entry.payload.expectedPhase,
    entry.payload.nextPhase,
    entry.payload.reason,
  ]);
}

function expectedTransitionWalk() {
  const out = [];
  out.push(['loadout', 'arena_intro', 'ready']);
  out.push(['arena_intro', 'wave_intro', 'intro_done']);
  for (let wave = 1; wave <= WAVE_COUNT; wave++) {
    out.push(['wave_intro', 'active', 'wave_start']);
    out.push(['active', 'cleanup', 'wave_clear']);
    if (wave >= WAVE_COUNT) {
      if (wave % REFIT_EVERY === 0) {
        out.push(['cleanup', 'refit', 'refit_open']);
        out.push(['refit', 'victory', 'act_complete']);
      } else {
        out.push(['cleanup', 'victory', 'act_complete']);
      }
    } else if (wave % REFIT_EVERY === 0) {
      out.push(['cleanup', 'refit', 'refit_open']);
      out.push(['refit', 'wave_intro', 'refit_done']);
    } else {
      out.push(['cleanup', 'draft', 'draft_open']);
      out.push(['draft', 'wave_intro', 'pick_done']);
    }
  }
  return out;
}

function tick(n = 1) {
  for (let i = 0; i < n; i++) survivalRun.update(DT);
}

function beginSurvival(bus, seed = 7) {
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed,
    arenaId: LIVE_ARENA_ID,
  });
}

function driveFullSurvival(seed = 7) {
  const harness = boot(seed);
  const { bus, state } = harness;
  beginSurvival(bus, seed);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  for (let wave = 1; wave <= WAVE_COUNT; wave++) {
    tick(SURVIVAL_WAVE_INTRO_TICKS);
    bus.emit(WAVE_CLEARED_SEAM, { wave });
    tick(1);
    tick(cleanupTicksForWave(wave));
    if (wave >= WAVE_COUNT && wave % REFIT_EVERY === 0) {
      bus.emit('run:refitClosed', {});
      tick(1);
    } else if (wave >= WAVE_COUNT) {
      // victory requested from cleanup; no extra receipt
    } else if (wave % REFIT_EVERY === 0) {
      bus.emit('run:refitClosed', {});
      tick(1);
    } else {
      bus.emit('run:draftResolved', {});
      tick(1);
    }
  }
  return harness;
}

function assertStrictNoop(state, emitted, startCount, label) {
  const before = captureState(state);
  const beforeCount = emitted.length;
  for (let i = 0; i < NOOP_TICKS; i++) {
    assert.doesNotThrow(() => survivalRun.update(DT));
  }
  assertStateUnchanged(before, state, label);
  assert.equal(emitted.length, beforeCount, `${label}: no bus emission`);
  assert.ok(startCount >= 0);
}

test('v1 cadence matches the first authored ten-wave block', () => {
  assert.equal(SURVIVAL_RUN_WAVE_COUNT, WAVE_COUNT);
  assert.equal(SURVIVAL_REFIT_EVERY, REFIT_EVERY);
  assert.equal(SURVIVAL_ARENA_INTRO_TICKS, 1);
  assert.equal(SURVIVAL_WAVE_INTRO_TICKS, 1);
  assert.equal(SURVIVAL_CLEANUP_TICKS, 180);
  assert.equal(BOSS_CLEANUP_TICKS, 240);
});

test('golden-safety: run-less update is a strict no-op for 600 ticks', () => {
  const absent = boot(3);
  delete absent.state.run;
  assert.equal(Object.prototype.hasOwnProperty.call(absent.state, 'run'), false);
  assertStrictNoop(absent.state, absent.emitted, 0, 'absent run');

  const adventure = boot(5);
  assert.equal(adventure.state.run.kind, 'adventure');
  assert.equal(adventure.state.run.phase, 'inactive');
  assertStrictNoop(adventure.state, adventure.emitted, 0, 'inactive adventure');

  const liveAdventure = boot(9);
  liveAdventure.bus.emit('run:beginRequested', { kind: 'adventure', seed: 9 });
  assert.equal(liveAdventure.state.run.kind, 'adventure');
  assert.equal(liveAdventure.state.run.phase, 'loadout');
  assertStrictNoop(liveAdventure.state, liveAdventure.emitted, 1, 'adventure loadout');

  const malformed = boot(15);
  malformed.state.run = { kind: 'survival', phase: 'active', wave: 1 };
  assertStrictNoop(malformed.state, malformed.emitted, 0, 'malformed survival run');

  const schemaPresent = boot(16);
  const envelope = createRunState({ kind: 'survival', seed: 16 });
  envelope.phase = 'active';
  envelope.wave = 1;
  envelope.arenaId = LIVE_ARENA_ID;
  delete envelope.telemetry;
  schemaPresent.state.run = envelope;
  assertStrictNoop(schemaPresent.state, schemaPresent.emitted, 0, 'schema-present malformed survival run');
});

test('survivalRun is in both production orders and update ⊆ init', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('survivalRun'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('survivalRun'));
  const initSet = new Set(PRODUCTION_INIT_ORDER);
  const missing = PRODUCTION_UPDATE_ORDER.filter((id) => !initSet.has(id));
  assert.deepEqual(missing, []);
  assert.ok(PRODUCTION_INIT_ORDER.indexOf('runSession') < PRODUCTION_INIT_ORDER.indexOf('survivalRun'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('scenarioRuntime') < PRODUCTION_UPDATE_ORDER.indexOf('survivalRun'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('survivalRun') < PRODUCTION_UPDATE_ORDER.indexOf('heat'));
});

test('production Node runtime constructs with survivalRun in both lookup tables', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    createSimulation: false,
  });
  assert.ok(runtime);
  assert.ok(runtime.manifest);
  assert.ok(runtime.manifest.authoritativeSystemIds.includes('survivalRun'));
  assert.ok(runtime.manifest.authoritativeUpdateOrderIds.includes('survivalRun'));
  const systems = runtime.manifest.authoritativeSystems || [];
  assert.ok(systems.some((system) => system && system.name === 'survivalRun'));
  const updates = runtime.manifest.authoritativeUpdateOrder || [];
  assert.ok(updates.some((system) => system && system.name === 'survivalRun'));
});

test('survivalRun is absent from the legacy 47a curated set', () => {
  assert.ok(!LEGACY47A_SYSTEM_IDS.includes('survivalRun'));
});

test('phase machine walks loadout → … → victory only via compare-and-swap requests', () => {
  const { state, emitted } = driveFullSurvival(11);
  assert.equal(state.run.phase, 'victory');
  assert.equal(state.run.kind, 'survival');
  assert.equal(state.run.wave, WAVE_COUNT);

  const requested = named(emitted, 'run:transitionRequested');
  const expected = expectedTransitionWalk();
  assert.deepEqual(transitionPairs(emitted), expected);

  for (let i = 0; i < requested.length; i++) {
    const payload = requested[i].payload;
    assert.equal(payload.expectedPhase, expected[i][0]);
    assert.equal(payload.nextPhase, expected[i][1]);
    assert.equal(payload.reason, expected[i][2]);
    assert.equal(Number.isInteger(payload.tick), true);
  }

  for (const entry of emitted) {
    assert.notEqual(entry.event, 'run:phaseAssigned');
  }
  assert.equal(state.run.phase, 'victory');
});

test('no phase is inferred from entity counts', () => {
  const { state, bus } = boot(13);
  beginSurvival(bus, 13);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  tick(SURVIVAL_WAVE_INTRO_TICKS);
  assert.equal(state.run.phase, 'active');
  assert.equal(state.run.wave, 1);

  state.entityList.length = 0;
  state.entities.clear();
  tick(40);
  assert.equal(state.run.phase, 'active');

  bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  tick(1);
  assert.equal(state.run.phase, 'cleanup');

  const second = boot(14);
  beginSurvival(second.bus, 14);
  second.bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  tick(SURVIVAL_WAVE_INTRO_TICKS);
  assert.equal(second.state.run.phase, 'active');
  const hostile = { id: 'hostile_1', kind: 'ship', faction: 'pirate', alive: true };
  second.state.entities.set(hostile.id, hostile);
  second.state.entityList.push(hostile);
  second.bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  tick(1);
  assert.equal(second.state.run.phase, 'cleanup');
  assert.equal(second.state.entityList.length, 1);
  assert.equal(second.state.entities.get('hostile_1'), hostile);
});

test('wave index advances once per wave_intro, never past the run wave count', () => {
  const { state, bus, emitted } = boot(17);
  beginSurvival(bus, 17);
  assert.equal(state.run.wave, 0);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);

  tick(SURVIVAL_WAVE_INTRO_TICKS);
  assert.equal(state.run.phase, 'active');
  assert.equal(state.run.wave, 1);
  tick(8);
  assert.equal(state.run.wave, 1);

  bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  tick(1);
  tick(SURVIVAL_CLEANUP_TICKS);
  bus.emit('run:draftResolved', {});
  tick(1);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 2);
  const toWaveIntro = named(emitted, 'run:transitionRequested').filter((entry) => (
    entry.payload.nextPhase === 'wave_intro'
  ));
  assert.equal(toWaveIntro.length, 2);

  const full = driveFullSurvival(19);
  assert.equal(full.state.run.wave, WAVE_COUNT);
  assert.equal(full.state.run.phase, 'victory');
  const waveIntroEntries = named(full.emitted, 'run:transitionRequested').filter((entry) => (
    entry.payload.nextPhase === 'wave_intro'
  ));
  assert.equal(waveIntroEntries.length, WAVE_COUNT);
  tick(12);
  assert.equal(full.state.run.wave, WAVE_COUNT);
});

test('§27.5: owns none of campaign credits, entities, economy, factions, world, or combat', () => {
  const { state, bus, emitted } = boot(21);
  state.player.credits = 840;
  state.player.heat = 0.31;
  state.economy.econClock.ticksElapsed = 4;
  state.factions = { heliopause: { rep: 12 } };
  state.world.currentSectorId = 'sector_helios_prime';
  state.combat.beams.push({ id: 'beam_keep' });
  const kept = { id: 'npc_keep', kind: 'ship' };
  state.entities.set(kept.id, kept);
  state.entityList.push(kept);
  state.nextEntityId = 9;

  const before = ownershipSnapshot(state);
  beginSurvival(bus, 21);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  for (let wave = 1; wave <= WAVE_COUNT; wave++) {
    tick(SURVIVAL_WAVE_INTRO_TICKS);
    bus.emit(WAVE_CLEARED_SEAM, { wave });
    tick(1);
    tick(cleanupTicksForWave(wave));
    if (wave >= WAVE_COUNT && wave % REFIT_EVERY === 0) {
      bus.emit('run:refitClosed', {});
      tick(1);
    } else if (wave < WAVE_COUNT && wave % REFIT_EVERY !== 0) {
      bus.emit('run:draftResolved', {});
      tick(1);
    } else if (wave < WAVE_COUNT) {
      bus.emit('run:refitClosed', {});
      tick(1);
    }
  }

  const after = ownershipSnapshot(state);
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.economy, before.economy);
  assert.deepEqual(after.factions, before.factions);
  assert.deepEqual(after.world, before.world);
  assert.deepEqual(after.combat, before.combat);
  assert.deepEqual(after.entities, before.entities);
  assert.deepEqual(after.entityList, before.entityList);
  assert.equal(after.nextEntityId, before.nextEntityId);
  assert.equal(after.playerRef, before.playerRef);
  assert.equal(after.economyRef, before.economyRef);
  assert.equal(after.entitiesRef, before.entitiesRef);
  assert.equal(state.entities.get('npc_keep'), kept);
  assert.ok(!emitted.some((entry) => entry.event.startsWith('economy:')));
  assert.equal(state.run.phase, 'victory');
});

test('determinism: same seed and inputs emit the same ordered {event, payload} list', () => {
  const a = driveFullSurvival(23);
  const b = driveFullSurvival(23);
  assert.deepEqual(a.emitted, b.emitted);
  assert.equal(a.emitted.length, b.emitted.length);
  assert.ok(a.emitted.length > 0);
});

test('no Math.random / Date.now / performance.now on a full cycle', () => {
  const boom = () => {
    throw new Error('nondeterministic source');
  };
  const origRandom = Math.random;
  const origNow = Date.now;
  const origPerf = performance.now;
  Math.random = boom;
  Date.now = boom;
  performance.now = boom;
  try {
    const { state, emitted } = driveFullSurvival(29);
    assert.equal(state.run.phase, 'victory');
    assert.ok(named(emitted, 'run:transitionRequested').length > 0);
  } finally {
    Math.random = origRandom;
    Date.now = origNow;
    performance.now = origPerf;
  }
});

test('rejected transition is retried on the next tick', () => {
  const { state, bus, emitted } = boot(31, { runSessionOn: false });
  const run = createRunState({ kind: 'survival', seed: 31 });
  run.phase = 'loadout';
  run.arenaId = LIVE_ARENA_ID;
  state.run = run;
  bus.emit('run:loadoutReady', {});
  tick(1);
  assert.equal(named(emitted, 'run:transitionRequested').length, 1);
  assert.deepEqual(transitionPairs(emitted), [['loadout', 'arena_intro', 'ready']]);
  assert.equal(state.run.phase, 'loadout');
  tick(1);
  assert.equal(named(emitted, 'run:transitionRequested').length, 2);
  assert.deepEqual(transitionPairs(emitted), [
    ['loadout', 'arena_intro', 'ready'],
    ['loadout', 'arena_intro', 'ready'],
  ]);
  assert.equal(state.run.phase, 'loadout');
});

test('run:transitioned into wave_intro is idempotent', () => {
  const { state, bus, emitted } = boot(41);
  beginSurvival(bus, 41);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);
  assert.equal(named(emitted, 'run:wavePlanned').length, 1);

  bus.emit('run:transitioned', { previousPhase: 'arena_intro', phase: 'wave_intro' });
  bus.emit('run:transitioned', { previousPhase: 'arena_intro', phase: 'wave_intro' });

  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);
  assert.equal(named(emitted, 'run:wavePlanned').length, 1);
});

test('unknown arena mid-run holds the phase and does not apply an empty plan', () => {
  const { state, bus, emitted } = boot(43);
  beginSurvival(bus, 43);
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  tick(SURVIVAL_WAVE_INTRO_TICKS);
  assert.equal(state.run.phase, 'active');
  assert.equal(state.run.wave, 1);
  assert.equal(named(emitted, 'run:wavePlanned').length, 1);

  bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  tick(1);
  tick(SURVIVAL_CLEANUP_TICKS);
  state.run.arenaId = 'arena_does_not_exist';
  bus.emit('run:draftResolved', {});
  tick(1);

  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);
  assert.equal(named(emitted, 'run:wavePlanned').length, 1);
  const failures = named(emitted, 'run:wavePlanFailed');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].payload.error, 'invalid_input');
  assert.ok((failures[0].payload.issues || []).some((issue) => issue && issue.path === 'arenaId'));

  tick(30);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);
  assert.equal(named(emitted, 'run:wavePlanFailed').length, 1);
  assert.equal(named(emitted, 'run:wavePlanned').length, 1);
});
