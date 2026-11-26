// PQ-169.00 — Daily seed and local board.
//
// Seed 16900. Two machines on the same UTC calendar day must hash to the same
// Crucible run seed. A daily settle must survive load + a second storage JSON.
// The sim never reads wall clock; the date key is calendar input, not Date.now().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createGameState } from '../src/core/gameState.js';

import {
  CRUCIBLE_META_STORAGE_KEY,
  dailySeedForDateKey,
  dailySeedForNow,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
  settleCrucibleRun,
  utcDateKeyFromIso,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { circuitEntryBlocker } from '../src/systems/survivalCircuit.js';
import { clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { SURVIVAL_WAVE_INTRO_TICKS } from '../src/systems/survivalRun.js';
import { clearCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen, crucibleScreen, todayBoardFigures } from '../src/ui/screens/crucible.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';

const SEED = 16900;
const DATE_A = '2026-09-06';
const DATE_B = '2026-09-07';
const SEED_A = 1537801443;
const SEED_B = 1521023824;

function memoryStorage() {
  const map = new Map();
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
}

function dailyResult(seed, dateKey, score, deepestWave) {
  return {
    outcome: 'defeat',
    seed,
    arenaId: 'helios_core',
    wave: deepestWave,
    deepestWave,
    wavesCleared: deepestWave,
    kills: 10,
    score,
    credits: 0,
    xp: 0,
    picks: [],
    dailyDateKey: dateKey,
  };
}

function dailyRun(seed, dateKey) {
  return {
    kind: 'survival',
    seed,
    arenaId: 'helios_core',
    ruleset: 'swarm',
    dailyDateKey: dateKey,
  };
}

test('two machines on the same UTC day get the same daily seed', () => {
  resetMeta();
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA._map, storageB._map);

  useCrucibleMetaStorage(storageA);
  useCrucibleMetaClock(() => `${DATE_A}T23:59:59.000Z`);
  const seedLate = dailySeedForNow();

  useCrucibleMetaStorage(storageB);
  useCrucibleMetaClock(() => `${DATE_A}T00:00:00.000Z`);
  const seedEarly = dailySeedForNow();

  assert.equal(utcDateKeyFromIso(`${DATE_A}T23:59:59.000Z`), DATE_A);
  assert.equal(utcDateKeyFromIso(`${DATE_A}T00:00:00.000Z`), DATE_A);
  assert.equal(seedLate, seedEarly);
  assert.equal(seedLate, dailySeedForDateKey(DATE_A));
  assert.equal(seedLate, SEED_A);
  assert.equal(dailySeedForDateKey(DATE_B), SEED_B);
  assert.notEqual(seedLate, dailySeedForDateKey(DATE_B));
  assert.ok(seedLate >= 1 && seedLate <= 0xffffffff);

  console.log(`DATES_MATCH=1 DATE_A=${DATE_A} SEED_A=${seedLate} DATE_B=${DATE_B} SEED_B=${SEED_B}`);
});

test('daily board persists across save reload and a second storage JSON', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => `${DATE_A}T12:00:00.000Z`);
  const seed = dailySeedForDateKey(DATE_A);
  assert.equal(seed, SEED_A);

  settleCrucibleRun({
    result: dailyResult(seed, DATE_A, SEED, 12),
    run: dailyRun(seed, DATE_A),
    storage,
  });

  const reloaded = loadCrucibleMeta(storage);
  const row = reloaded.daily.byDate[DATE_A];
  assert.ok(row);
  assert.equal(row.bestScore, SEED);
  assert.equal(row.deepestWave, 12);
  assert.equal(row.seed, seed);
  assert.equal(row.attempts, 1);

  const json = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
  assert.ok(json);
  const independent = memoryStorage();
  independent.setItem(CRUCIBLE_META_STORAGE_KEY, json);
  const otherMachine = loadCrucibleMeta(independent);
  assert.equal(otherMachine.daily.byDate[DATE_A].bestScore, SEED);
  assert.equal(otherMachine.daily.byDate[DATE_A].seed, seed);

  const today = todayBoardFigures(otherMachine, DATE_A);
  assert.ok(today);
  assert.equal(today.label, 'Today');
  assert.equal(today.score, SEED);
  assert.equal(today.wave, 12);

  console.log(`BOARD_PERSIST=1 SCORE=${SEED} WAVE=12 SEED=${seed}`);
});

test('a free run on seed 16900 does not write today\'s daily board', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => `${DATE_A}T12:00:00.000Z`);
  settleCrucibleRun({
    result: dailyResult(SEED, null, SEED, 4),
    run: { kind: 'survival', seed: SEED, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
  const profile = loadCrucibleMeta(storage);
  assert.deepEqual(profile.daily.byDate, {});
  assert.equal(todayBoardFigures(profile, DATE_A), null);
  assert.equal(profile.history.length, 1);
  assert.equal(profile.history[0].seed, SEED);
});

test('Daily overrides a checkpoint and Retry keeps the original board date across midnight', async () => {
  resetMeta();
  clearCrucibleSetup();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  let now = `${DATE_A}T23:59:59.000Z`;
  useCrucibleMetaClock(() => now);
  const profile = loadCrucibleMeta(storage);
  profile.ladder.arenas.helios_core = { zones: { 0: { stars: 1 } }, checkpoint: 1, bestWave: 10 };
  saveCrucibleMeta(profile, storage);
  const lane = createSimHost();
  const door = Object.create(crucibleScreen);
  const debrief = Object.create(crucibleResultsScreen);
  const oldDocument = globalThis.document;
  const click = (mounted, match) => {
    const button = mounted.buttons.find(match);
    assert.ok(button, 'the public control must be mounted');
    globalThis.document = mounted.doc;
    try { button.listeners.click[0](); } finally { globalThis.document = oldDocument; }
  };
  const launchDaily = (mounted) => {
    click(mounted, b => b.className.split(' ').includes('sf-crd-daily'));
    click(mounted, b => b.textContent === 'Play today');
    return launchRequest(mounted);
  };
  function launchRequest(mounted) {
    const event = mounted.emitted.find(e => e.event === 'game:new');
    assert.ok(event, 'launch uses the ordinary New Game request');
    return structuredClone(event.payload);
  }
  try {
    const match = mountScreen(door, { ctx: { state: createGameState(SEED_A) } });
    click(match, b => b.className.includes('sf-crd-zone-pick') && textLines(b).join(' ').includes('Round 11'));
    const original = launchDaily(match);
    assert.equal(original.crucibleSetup.survivalSetup.wave, 1);
    assert.equal(original.crucibleSetup.survivalSetup.seed, SEED_A);
    assert.match(textLines(match.root).join(' '), /Clear 5 rounds for a one-time 150 cr bonus/);
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    const init = await lane.init({ profile: 'production', seed: SEED_A, scenarioContract });
    const { state, registry } = lane.host;
    let tick = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    async function send(commands, steps = 0) {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = reply.rebuild?.end ?? ackEnd;
      return reply;
    }
    async function flyAndLose(opts, score) {
      clearQueuedChallenge(); // Only the serialized launch crosses into the worker.
      const reply = await send([{ kind: 'mode', mode: 'loading' },
        { kind: 'rpc', id: 'daily-boot', op: 'newGameBoot', args: { opts } }]);
      assert.equal(reply.rpcAcks.find(r => r.id === 'daily-boot')?.ok, true);
      assert.equal(state.run.telemetry.dailyDateKey, DATE_A);
      assert.equal(state.run.seed, SEED_A);
      assert.match(circuitEntryBlocker(state.run), /Daily/);
      await send([{ kind: 'mode', mode: 'flight' },
        { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } }], SURVIVAL_WAVE_INTRO_TICKS + 2);
      assert.equal(state.run.phase, 'active');
      assert.equal(state.run.wave, 1);
      await send([{ kind: 'domEvent', d: { type: 'keydown', code: 'KeyW', pressed: true } }], 1);
      registry.get('runSession').award({ score, credits: 100, reason: 'daily_fixture' });
      registry.get('combat').kill(state.entities.get(state.playerId), null, { context: 'collision_terrain' });
      const owner = registry.get('survivalResults');
      const result = owner.lastResult();
      assert.equal(result.stopReason, 'player_death');
      assert.equal(result.dailyDateKey, DATE_A);
      assert.equal(result.score, score);
      assert.equal(result.bankedBounty, 50, 'earned Swarm salvage retains its own settlement rule');
      return owner;
    }
    const owner = await flyAndLose(original, 170);
    assert.equal(loadCrucibleMeta(storage).daily.byDate[DATE_A].attempts, 1);
    now = `${DATE_B}T00:00:01.000Z`;
    const result = mountScreen(debrief, { ctx: { state }, registryGet: name => name === 'survivalResults' ? owner : null });
    click(result, b => b.textContent === 'Run it again — same seed');
    await flyAndLose(launchRequest(result), 230);
    const board = loadCrucibleMeta(storage).daily.byDate;
    assert.equal(board[DATE_A].attempts, 2);
    assert.equal(board[DATE_A].bestScore, 230);
    assert.equal(board[DATE_B], undefined);

    const nextDoor = Object.create(crucibleScreen);
    try {
      const next = launchDaily(mountScreen(nextDoor, { ctx: { state: createGameState(SEED_B) } }));
      assert.equal(next.crucibleSetup.dailyDateKey, DATE_B);
      assert.equal(next.crucibleSetup.survivalSetup.seed, SEED_B);
    } finally { nextDoor.dispose(); }
  } finally {
    lane.shutdown();
    door.dispose();
    debrief.dispose();
    clearCrucibleSetup();
    resetMeta();
  }
});
