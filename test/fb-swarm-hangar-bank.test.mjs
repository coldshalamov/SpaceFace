// SWARM-01 — the hangar banks the run wallet and never the adventure purse. Seed 4242.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import {
  buyHull,
  buyTrack,
  emptyHangar,
  magnetMultiplier,
  migrateHangar,
  purseBonusFor,
} from '../src/data/swarmHangar.js';
import { MAGNET_RANGE, playerPickupMagnetRange } from '../src/systems/mining.js';
import { runSession } from '../src/systems/runSession.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { bankableRunCredits, requestSurvivalPartialBank, securedBountyOf } from '../src/systems/survivalExtraction.js';
import {
  emptyCrucibleProfile,
  loadCrucibleMeta,
  parseCrucibleMeta,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { crucibleHullSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { applySandboxSetup } from '../src/ui/sandbox/sandboxSetup.js';

const SEED = 4242;

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-03T00:00:00.000Z');
}

function settle(storage, fields) {
  return settleCrucibleRun({
    result: {
      seed: SEED,
      arenaId: 'helios_core',
      wave: fields.wavesCleared,
      wavesCleared: fields.wavesCleared,
      credits: fields.credits,
      outcome: fields.outcome,
      cashOut: fields.cashOut === true,
      runId: fields.runId,
      score: 0,
      kills: 0,
      xp: 0,
      picks: [],
    },
    run: {
      kind: 'survival',
      ruleset: 'swarm',
      seed: SEED,
      wave: fields.wavesCleared,
    },
    storage,
  });
}

function launchEasySwarm(t, storage) {
  resetMeta();
  useCrucibleMetaStorage(storage);
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  t.after(() => { runtime.dispose(); resetCrucibleMetaForTests(); });
  const { state, bus } = runtime;
  state.mode = 'loading';
  state.ui.screenStack = [];
  const setup = crucibleHullSetupFor({ hullId: 'ship_hornet', seed: SEED, swarmStake: 'exhibition' }).value;
  const ships = runtime.getSystem('ships');
  ships.buyShip({ defId: setup.hullId, setActive: true, grant: true });
  state.playerId = runtime.spawn(makeShipEntitySpec(setup.hullId, {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
  })).id;
  const launch = applySandboxSetup({
    state, bus, registry: { get: name => runtime.getSystem(name) }, helpers: runtime.getHelpers(),
  }, crucibleLaunchConfig(setup, 'swarm', { openingLesson: false, swarmStake: 'exhibition' }));
  assert.equal(launch.ok, true);
  state.mode = 'flight';
  assert.equal(state.run.credits, 2400);
  return { runtime, state, bus, ships, results: runtime.getSystem('survivalResults') };
}

test('Easy defeat immediately after a production launch banks none of the starting credits', t => {
  const { bus, results } = launchEasySwarm(t, memoryStorage());
  bus.emit('player:death', {});
  const result = results.lastResult();
  assert.equal(result.outcome, 'defeat');
  assert.equal(result.credits, 2400, 'the results can still show the spendable run purse');
  assert.equal(result.bankedBounty, 0);
  assert.equal(loadCrucibleMeta().hangar.bounty, 0);
});

test('a fresh same-seed retry can bank earned credits at the same defeat tick', t => {
  const storage = memoryStorage();
  const first = launchEasySwarm(t, storage);
  first.bus.emit('player:death', {});
  const previousEnd = first.results.lastResult().endedAt;
  first.runtime.dispose();
  const retry = launchEasySwarm(t, storage);
  retry.bus.emit('run:awardRequested', { credits: 100, reason: 'crucible:wave1:chip' });
  retry.bus.emit('player:death', {});
  assert.deepEqual(retry.results.lastResult().endedAt, previousEnd);
  assert.equal(retry.results.lastResult().bankedBounty, 50);
  assert.equal(loadCrucibleMeta().hangar.bounty, 50);
});

test('buying, reselling, and refunding starting equipment leaves no bounty on defeat', t => {
  const { runtime, state, bus, ships, results } = launchEasySwarm(t, memoryStorage());
  const draft = runtime.getSystem('survivalDraft');
  const offer = draft.currentOffers().find(row => row.catalog && row.available && Number.isInteger(row.slotIndex));
  assert.ok(offer);
  assert.equal(draft.resolvePick({ offerId: offer.id }), true);
  assert.equal(state.run.credits, 2400 - offer.price);
  assert.equal(draft.refitSell({ slotIndex: offer.slotIndex }), true);
  const purse = state.run.credits;
  assert.ok(purse > 2400 - offer.price, 'the normal sale returned spendable credits');
  const rejected = draft.currentOffers().find(row => row.catalog && row.available && Number.isInteger(row.slotIndex));
  assert.ok(rejected);
  const fit = ships.fitModule;
  ships.fitModule = () => false;
  try { assert.equal(draft.resolvePick({ offerId: rejected.id }), false); }
  finally { ships.fitModule = fit; }
  assert.equal(state.run.credits, purse);
  assert.equal(bankableRunCredits(state.run), 0);
  bus.emit('player:death', {});
  assert.equal(results.lastResult().bankedBounty, 0);
  assert.equal(loadCrucibleMeta().hangar.bounty, 0);
});

test('earned credits survive a mixed funding refund, partial bank, and one final settlement', t => {
  const { runtime, state, bus, ships, results } = launchEasySwarm(t, memoryStorage());
  bus.emit('run:spendRequested', { credits: 2000, reason: 'opening_equipment' });
  bus.emit('run:awardRequested', { credits: 100, reason: 'crucible:wave1:chip' });
  assert.equal(state.run.credits, 500);
  assert.equal(bankableRunCredits(state.run), 100);

  const draft = runtime.getSystem('survivalDraft');
  const offer = draft.currentOffers().find(row => row.catalog && row.available && row.price > 1
    && Number.isInteger(row.slotIndex));
  assert.ok(offer);
  bus.emit('run:spendRequested', { credits: 401 - offer.price, reason: 'opening_equipment' });
  assert.equal(bankableRunCredits(state.run), 100);
  const fit = ships.fitModule;
  ships.fitModule = () => false;
  try { assert.equal(draft.resolvePick({ offerId: offer.id }), false); }
  finally { ships.fitModule = fit; }
  assert.equal(bankableRunCredits(state.run), 100, 'refund returned the original mix of spent credits');

  state.run.wave = 10;
  bus.emit('run:transitionRequested', { expectedPhase: 'draft', nextPhase: 'refit' });
  assert.equal(state.run.phase, 'refit');
  requestSurvivalPartialBank(bus);
  assert.equal(securedBountyOf(state.run), 50);
  assert.equal(bankableRunCredits(state.run), 50);
  bus.emit('player:death', {});
  assert.equal(results.lastResult().bankedBounty, 75, 'secured 50 plus half of the remaining earned 50');
  bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  assert.equal(loadCrucibleMeta().hangar.bounty, 75);
});

test('Retire keeps the earned deposit and discards the unbanked purse across reload', t => {
  const storage = memoryStorage();
  const { state, bus, results } = launchEasySwarm(t, storage);
  bus.emit('run:awardRequested', { credits: 100, reason: 'crucible:wave1:chip' });
  state.run.wave = 10;
  bus.emit('run:transitionRequested', { expectedPhase: 'draft', nextPhase: 'refit' });
  requestSurvivalPartialBank(bus);
  assert.equal(securedBountyOf(state.run), 50);
  assert.equal(state.run.credits, 2450);

  const token = state.run.retireToken;
  bus.emit('run:retireRequested', { token });
  const receipt = results.lastResult();
  assert.equal(receipt.unranked, true);
  assert.equal(receipt.bankedBounty, 50);
  assert.equal(loadCrucibleMeta().hangar.bounty, 50);
  bus.emit('run:retireRequested', { token });
  bus.emit('run:ended', { outcome: 'aborted', reason: 'player_retired' });
  const snapshot = JSON.parse(JSON.stringify({ result: receipt, run: state.run }));
  resetCrucibleMetaForTests();
  assert.equal(settleCrucibleRun({ ...snapshot, storage }), null, 'a reloaded receipt cannot pay again');
  assert.equal(loadCrucibleMeta(storage).hangar.bounty, 50, 'fresh profile load keeps exactly one deposit');
  assert.equal(loadCrucibleMeta(storage).history.length, 0, 'retirement is still unranked');
});

test('death banks half even after a boss wave', () => {
  resetMeta();
  const storage = memoryStorage();
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const settled = settle(storage, {
    outcome: 'defeat',
    wavesCleared: 10,
    credits: 100,
    runId: 'death-after-boss',
  });
  assert.equal(settled.result.bankedBounty, 50);
  assert.equal(settled.result.hangarBounty, 50);
  assert.equal(settled.result.cashOut, false);
  assert.equal(settled.profile.hangar.bounty, 50);
  assert.equal(Number.isInteger(settled.result.overconfidenceStreak), true);
  const word = settle(storage, {
    outcome: 'death',
    wavesCleared: 20,
    credits: 80,
    runId: 'death-word',
  });
  assert.equal(word.result.bankedBounty, 40);
  assert.equal(word.profile.hangar.bounty, 90);
  assert.equal(state.player.credits, 4242);
});

test('cash-out after a boss banks all', () => {
  resetMeta();
  const storage = memoryStorage();
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const settled = settle(storage, {
    outcome: 'extracted',
    cashOut: true,
    wavesCleared: 10,
    credits: 100,
    runId: 'cash-after-boss',
  });
  assert.equal(settled.result.bankedBounty, 100);
  assert.equal(settled.result.hangarBounty, 100);
  assert.equal(settled.result.cashOut, true);
  assert.equal(settled.profile.hangar.bounty, 100);
  assert.equal(state.player.credits, 4242);
});

test('cash-out before a boss banks half', () => {
  resetMeta();
  const storage = memoryStorage();
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const settled = settle(storage, {
    outcome: 'extracted',
    cashOut: true,
    // S14 cadence (483dff1723) put the first champion at wave 5, so "before a boss" is any
    // round below it — 9 clears a champion and banks in full.
    wavesCleared: 4,
    credits: 100,
    runId: 'cash-before-boss',
  });
  assert.equal(settled.result.bankedBounty, 50);
  assert.equal(settled.result.hangarBounty, 50);
  assert.equal(settled.result.cashOut, false);
  assert.equal(state.player.credits, 4242);
});

test('second settle banks 0', () => {
  resetMeta();
  const storage = memoryStorage();
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const first = settle(storage, {
    outcome: 'extracted',
    cashOut: true,
    wavesCleared: 10,
    credits: 100,
    runId: 'same-run',
  });
  const second = settle(storage, {
    outcome: 'extracted',
    cashOut: true,
    wavesCleared: 10,
    credits: 100,
    runId: 'same-run',
  });
  assert.equal(first.result.bankedBounty, 100);
  assert.equal(second.result.bankedBounty, 0);
  assert.equal(second.result.hangarBounty, 100);
  assert.equal(second.profile.hangar.bounty, 100);
  assert.equal(second.profile.hangar.settledKeys.includes('run:same-run'), true);
  assert.equal(state.player.credits, 4242);
});

test('state.player.credits is unchanged by the bank', () => {
  resetMeta();
  const storage = memoryStorage();
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const settled = settle(storage, {
    outcome: 'death',
    wavesCleared: 10,
    credits: 250,
    runId: 'wallet-stays',
  });
  assert.equal(settled.result.bankedBounty, 125);
  assert.equal(state.player.credits, 4242);
  assert.notEqual(state.player.credits, settled.profile.hangar.bounty);
});

test('buyTrack spends hangar bounty', () => {
  const bought = buyTrack(migrateHangar({ bounty: 250, ranks: {} }), 'plating');
  assert.equal(bought.ok, true);
  assert.equal(bought.price, 100);
  assert.equal(bought.rank, 1);
  assert.equal(bought.hangar.bounty, 150);
  assert.equal(bought.hangar.ranks.plating, 1);
});

test('buyHull refuses any id matching /saucer/i', () => {
  for (const hullId of ['saucer', 'Saucer', 'ship_saucer', 'enemy_SAUCER_mk2']) {
    const bag = migrateHangar({ bounty: 999, ranks: {}, ownedHulls: [] });
    const refused = buyHull(bag, hullId, 1);
    assert.equal(refused.ok, false, hullId);
    assert.equal(refused.reason, 'refused', hullId);
    assert.equal(refused.hangar.bounty, 999, hullId);
    assert.equal(refused.hangar.ownedHulls.includes(hullId), false, hullId);
  }
});

test('migrateProfile at schema 1 keeps hangar', () => {
  const parsed = parseCrucibleMeta({
    schemaVersion: 1,
    unlocks: { keep: { at: 'yes' } },
    records: { byKey: {}, lifetime: { runs: 1, victories: 0, defeats: 1, aborted: 0, deepestWave: 4, bestScore: 10, bestKills: 1 } },
    history: [],
    hangar: {
      bounty: 42,
      ranks: { plating: 3, magnet: 1 },
      settledKeys: ['run:4242'],
      ownedHulls: ['ship_kestrel', 'raider_saucer'],
      rerollsUsed: 2,
    },
  });
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.unlocks.keep.at, 'yes');
  assert.equal(parsed.hangar.bounty, 42);
  assert.equal(parsed.hangar.ranks.plating, 3);
  assert.equal(parsed.hangar.ranks.magnet, 1);
  assert.deepEqual(parsed.hangar.settledKeys, ['run:4242']);
  assert.deepEqual(parsed.hangar.ownedHulls, ['ship_kestrel']);
  assert.equal(parsed.hangar.rerollsUsed, 2);
  const fresh = emptyCrucibleProfile();
  assert.deepEqual(fresh.hangar, emptyHangar());
});

test('magnet multiplier applies only for survival', () => {
  const hangar = migrateHangar({ ranks: { magnet: 2 } });
  const mul = magnetMultiplier(hangar);
  assert.equal(mul, 1.3);
  const survival = {
    run: { kind: 'survival', telemetry: { hangar } },
    playerId: null,
    entities: null,
  };
  const adventure = {
    run: { kind: 'adventure', telemetry: { hangar } },
    playerId: null,
    entities: null,
  };
  const unranked = {
    run: { kind: 'survival', telemetry: { hangar: emptyHangar() } },
    playerId: null,
    entities: null,
  };
  assert.equal(playerPickupMagnetRange(survival), MAGNET_RANGE * mul);
  assert.equal(playerPickupMagnetRange(adventure), MAGNET_RANGE);
  assert.equal(playerPickupMagnetRange(unranked), MAGNET_RANGE);
});

test('purse award happens only when run credits are still 0', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const profile = emptyCrucibleProfile();
  profile.hangar = migrateHangar({ ranks: { war_chest: 2 } });
  assert.equal(purseBonusFor(profile.hangar), 200);
  assert.equal(saveCrucibleMeta(profile, storage), true);
  const state = createGameState(SEED);
  state.player.credits = 4242;
  const bus = createBus();
  const economy = [];
  const reasons = [];
  bus.on('economy:grantCredits', (payload) => economy.push(payload));
  bus.on('economy:chargeCredits', (payload) => economy.push(payload));
  bus.on('run:awarded', (payload) => reasons.push(payload && payload.reason));
  runSession.init({ state, bus });
  try {
    runSession.begin({ kind: 'survival', ruleset: 'swarm', seed: SEED });
    assert.equal(state.run.credits, 200);
    assert.equal(state.run.telemetry.hangar.ranks.war_chest, 2);
    assert.deepEqual(reasons, ['hangar_war_chest']);
    assert.equal(state.player.credits, 4242);
    assert.deepEqual(economy, []);

    state.run = createRunState();
    bus.on('run:started', () => {
      runSession.award({ credits: 40, reason: 'already_funded' });
    });
    runSession.begin({ kind: 'survival', ruleset: 'swarm', seed: SEED });
    assert.equal(state.run.credits, 40);
    assert.deepEqual(reasons, ['hangar_war_chest', 'already_funded']);
    assert.equal(state.player.credits, 4242);
    assert.deepEqual(economy, []);
  } finally {
    runSession.destroy();
    resetCrucibleMetaForTests();
  }
});
