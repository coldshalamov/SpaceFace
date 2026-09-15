// PQ-033.03 — the achievement ledger: a recorded event stream unlocks each achievement exactly once,
// the bag survives reload with unknown keys intact, two shells merge instead of clobbering, the
// notice respects one voice, Crucible achievements come from the settled survivalRecords profile, and
// the Steam mirror is idempotent. Headless; payload shapes are copied from the live emit sites.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import {
  ACHIEVEMENTS_FMT,
  ACHIEVEMENTS_STORAGE_KEY,
  ACHIEVEMENT_UNLOCKED_EVENT,
  achievementRows,
  emptyAchievementBag,
  installAchievements,
  loadAchievementBag,
  mergeAchievementBags,
  parseAchievementBag,
  resetAchievementsForTests,
  saveAchievementBag,
  useAchievementClock,
} from '../src/systems/achievements.js';
import {
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { challengeFromRun } from '../src/systems/survivalMutators.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAYER = 1;

function mapStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function harness({ storage = mapStorage(), state = null, shell = null, telemetry = null, voice = true } = {}) {
  const bus = createBus();
  const unlocks = [];
  const said = [];
  bus.on(ACHIEVEMENT_UNLOCKED_EVENT, (payload) => unlocks.push(payload));
  bus.on('voice:say', (payload) => said.push(payload));
  const liveState = state || { playerId: PLAYER, simTime: 100, onboarding: { active: false, finished: true } };
  const ledger = installAchievements({ bus, state: liveState, storage, shell, telemetry, voice });
  return { bus, storage, state: liveState, ledger, unlocks, said };
}

// Recorded from the live emitters' payload shapes (input.js, mining.js, economy.js, missions.js,
// world.js, tetherGameplay.js, masslineThrow.js, masslineImpacts.js, heat.js).
const STREAM = Object.freeze([
  ['dock:docked', { stationId: 'station_helios' }],
  ['mining:yield', { commodityId: 'cmdty_ore_iron', qty: 3, pos: { x: 1, z: 2 }, minerId: 44 }], // an NPC miner
  ['mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2, pos: { x: 1, z: 2 }, minerId: PLAYER }],
  ['economy:tradeCompleted', { stationId: 'station_helios', commodityId: 'cmdty_ore_iron', side: 'sell', qty: 2, unitAvg: 30, total: 60 }],
  ['credits:changed', { delta: 60, reason: 'trade:sell:cmdty_ore_iron', total: 5060 }],
  ['mission:completed', { missionId: 'm1', type: 'cargo_delivery', factionId: 'faction_scn' }],
  ['tether:latched', { targetId: 9, type: 'massline', context: 'selected', previewMatched: true }],
  ['tether:releaseRated', { targetId: 9, sourceId: PLAYER, classification: 'clean', releaseScore: 0.7 }],
  ['tether:releaseRated', { targetId: 9, sourceId: PLAYER, classification: 'razor', releaseScore: 0.91 }],
  ['massline:throw', { releaseId: 'massline:throw:120:9', payloadId: 9, mode: 'aimed', tick: 120 }],
  ['tether:whipImpact', { targetId: 9, victimId: 12, rating: 'solid', relSpeed: 40 }],
  ['tether:whipImpact', { targetId: 9, victimId: 12, rating: 'crushing', relSpeed: 90 }],
  ['heat:changed', { value: 40, previousValue: 10, level: 'hot', wanted: false, wantedCrossed: false }],
  ['heat:changed', { value: 120, previousValue: 40, level: 'wanted', wanted: true, wantedCrossed: true }],
  ['jump:arrive', { sectorId: 'sector_ceres', interdicted: false, ambushCount: 0, toPos: { x: 0, z: 0 } }],
  ['credits:changed', { delta: -500, reason: 'buyShip:ship_hornet', total: 4560 }],
  ['credits:changed', { delta: 99950, reason: 'bounty', total: 104510 }],
]);

const STREAM_UNLOCKS = [
  'berth_assigned', 'rock_has_a_price', 'paper_trail', 'signed_and_delivered', 'made_contact',
  'razor_release', 'light_ships_are_ammunition', 'keep_the_speed', 'paperwork_filed',
  'out_of_the_pocket', 'six_figures',
];

test.beforeEach(() => {
  resetAchievementsForTests();
  resetCrucibleMetaForTests();
  useAchievementClock(() => '2026-09-14T12:00:00.000Z');
  useCrucibleMetaClock(() => '2026-09-14T12:00:00.000Z');
});

test('a recorded event stream unlocks each achievement exactly once, and a replay unlocks nothing', () => {
  const h = harness();
  for (const [event, payload] of STREAM) h.bus.emit(event, payload);

  assert.deepEqual(h.unlocks.map((u) => u.id), STREAM_UNLOCKS);
  assert.ok(h.unlocks.every((u) => u.retroactive === false));
  const snap = h.ledger.snapshot();
  assert.equal(snap.counters.oreUnits, 2, 'the NPC miner yield is not the player');
  assert.equal(snap.counters.razorReleases, 1, 'a clean release is not razor');
  assert.equal(snap.counters.crushingImpacts, 1, 'a solid whip is not crushing');
  assert.equal(snap.counters.wantedTimes, 1, 'rising heat below the gate is not WANTED');
  assert.equal(snap.counters.creditsEarned, 100010, 'spending never counts as earning');
  assert.equal(snap.unlockedCount, STREAM_UNLOCKS.length);

  const before = h.unlocks.length;
  for (const [event, payload] of STREAM) h.bus.emit(event, payload);
  assert.equal(h.unlocks.length, before, 'replaying the same stream unlocks nothing twice');
  assert.equal(h.ledger.snapshot().counters.docks, 2, 'counters keep counting after the unlock');
  console.log(`PQ-033.03 ledger stream: ${STREAM.length} events -> ${h.unlocks.length} unlocks (${STREAM_UNLOCKS.join(',')}); replay -> 0`);
});

test('the bag round-trips through storage, survives reload and never re-announces', () => {
  const storage = mapStorage();
  const first = harness({ storage });
  for (const [event, payload] of STREAM) first.bus.emit(event, payload);
  first.ledger.dispose();

  const raw = JSON.parse(storage.getItem(ACHIEVEMENTS_STORAGE_KEY));
  assert.equal(raw.fmt, ACHIEVEMENTS_FMT);
  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.data.unlocked.berth_assigned.at, '2026-09-14T12:00:00.000Z');
  assert.equal(raw.data.unlocked.berth_assigned.via, 'dock:docked');

  const second = harness({ storage });
  assert.equal(second.unlocks.length, 0, 'reload unlocks nothing new');
  assert.equal(second.said.length, 0, 'reload says nothing');
  assert.deepEqual(Object.keys(second.ledger.snapshot().unlocked).sort(), [...STREAM_UNLOCKS].sort());
  second.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(second.unlocks.length, 0);
});

test('unknown ids, counters and keys from a newer build are preserved on rewrite', () => {
  const storage = mapStorage();
  storage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({
    fmt: ACHIEVEMENTS_FMT,
    schemaVersion: 2,
    savedAt: '2026-09-01T00:00:00.000Z',
    data: {
      schemaVersion: 2,
      unlocked: { future_feat: { at: '2026-09-01T00:00:00.000Z', via: 'future:event', tier: 3 } },
      counters: { futureCounter: 7 },
      crucibleBestByKey: {},
      steam: { future_feat: true },
      seasons: { s1: { rank: 4 } },
    },
  }));
  const h = harness({ storage });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.ledger.dispose();
  const bag = loadAchievementBag(storage);
  assert.equal(bag.unlocked.future_feat.tier, 3, 'unknown unlock row fields survive');
  assert.equal(bag.counters.futureCounter, 7);
  assert.equal(bag.steam.future_feat, true);
  assert.deepEqual(bag.seasons, { s1: { rank: 4 } });
  assert.ok(bag.unlocked.berth_assigned);

  assert.deepEqual(parseAchievementBag('not json'), emptyAchievementBag());
  assert.deepEqual(parseAchievementBag(JSON.stringify({ fmt: ACHIEVEMENTS_FMT, schemaVersion: 0, data: { schemaVersion: 0 } })), emptyAchievementBag());
});

test('two shells merge: union of unlocks with the earliest time, max of counters', () => {
  const browser = { ...emptyAchievementBag(), unlocked: { berth_assigned: { at: '2026-09-10T00:00:00.000Z', via: 'dock:docked' } }, counters: { docks: 4, trades: 1 } };
  const desktop = {
    ...emptyAchievementBag(),
    unlocked: {
      berth_assigned: { at: '2026-09-12T00:00:00.000Z', via: 'dock:docked' },
      made_contact: { at: '2026-09-12T00:00:00.000Z', via: 'tether:latched' },
    },
    counters: { docks: 2, latches: 5 },
    steam: { made_contact: true },
  };
  const merged = mergeAchievementBags(desktop, browser);
  assert.equal(merged.unlocked.berth_assigned.at, '2026-09-10T00:00:00.000Z', 'earliest unlock time wins');
  assert.ok(merged.unlocked.made_contact);
  assert.deepEqual(merged.counters, { docks: 4, latches: 5, trades: 1 });
  assert.equal(merged.steam.made_contact, true);

  // A last-writer-wins store cannot erase the other shell: every write merges what is stored.
  const storage = mapStorage();
  saveAchievementBag(browser, storage);
  saveAchievementBag({ ...emptyAchievementBag(), unlocked: { made_contact: { at: '2026-09-13T00:00:00.000Z', via: 'tether:latched' } } }, storage);
  const stored = loadAchievementBag(storage);
  assert.deepEqual(Object.keys(stored.unlocked).sort(), ['berth_assigned', 'made_contact']);
});

test('save:store-synced merges the other shell into the running ledger without re-announcing', () => {
  const storage = mapStorage();
  const h = harness({ storage });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.deepEqual(h.unlocks.map((u) => u.id), ['berth_assigned']);
  // The other shell's bag lands in local storage through the shared player store sync.
  storage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({
    fmt: ACHIEVEMENTS_FMT, schemaVersion: 1, savedAt: '2026-09-14T13:00:00.000Z',
    data: { schemaVersion: 1, unlocked: { made_contact: { at: '2026-09-14T11:00:00.000Z', via: 'tether:latched' } }, counters: { latches: 1 } },
  }));
  const saidBefore = h.said.length;
  h.bus.emit('save:store-synced', { ok: true });
  const snap = h.ledger.snapshot();
  assert.ok(snap.unlocked.berth_assigned && snap.unlocked.made_contact, 'both shells\' unlocks are kept');
  assert.equal(h.unlocks.length, 1, 'the merged unlock is not announced again');
  assert.equal(h.said.length, saidBefore);
  h.bus.emit('tether:latched', { targetId: 3 });
  assert.equal(h.unlocks.length, 1, 'made_contact is already unlocked after the merge');
});

test('the notice speaks through one voice, holds during the tutorial and carries names forward', () => {
  const state = { playerId: PLAYER, simTime: 10, onboarding: { active: true, finished: false } };
  const h = harness({ state });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: PLAYER });
  assert.equal(h.unlocks.length, 2, 'the unlocks themselves are immediate');
  assert.equal(h.said.length, 0, 'nothing talks over the tutorial');
  assert.equal(h.ledger.pendingNoticeCount(), 2);

  state.onboarding = { active: false, finished: true };
  h.bus.emit('tutorial:finished', {});
  assert.equal(h.said.length, 1, 'one coalesced line once teaching ends');
  assert.deepEqual(
    { channel: h.said[0].channel, kind: h.said[0].kind, id: h.said[0].id, ttl: h.said[0].ttl },
    { channel: 'news', kind: 'achievement', id: 'achievement:notice', ttl: 5 },
  );
  assert.equal(h.said[0].text, '2 achievements unlocked · Rock Has a Price · Berth Assigned', 'newest first');

  state.simTime = 12;
  h.bus.emit('economy:tradeCompleted', { side: 'buy', qty: 1, commodityId: 'cmdty_water', total: 10 });
  assert.equal(h.said[1].text, '3 achievements unlocked · Paper Trail · Rock Has a Price · Berth Assigned', 'a line still on screen keeps its earlier names');
  state.simTime = 13;
  h.bus.emit('jump:arrive', { sectorId: 'sector_ceres' });
  assert.equal(h.said[2].text, '4 achievements unlocked · Out of the Pocket · Paper Trail · Rock Has a Price · …', 'the newest never hides behind the ellipsis');
  state.simTime = 40;
  h.bus.emit('mission:completed', { missionId: 'm2', type: 'bulk_trade' });
  assert.equal(h.said[3].text, 'Achievement unlocked · Signed and Delivered');
  console.log(`PQ-033.03 notice: "${h.said[0].text}"`);
});

test('Crucible achievements come from the settled survivalRecords profile', () => {
  const crucibleStorage = mapStorage();
  useCrucibleMetaStorage(crucibleStorage);
  const h = harness();

  const run = { seed: 3303, arenaId: 'arena_foundry', ruleset: 'swarm', arenaMutators: [] };
  const challenge = challengeFromRun(run);
  const resultFor = (over) => ({
    seed: run.seed, arenaId: run.arenaId, ruleset: challenge.ruleset, mutators: challenge.mutators.slice(),
    kills: 12, wavesCleared: 3, ...over,
  });
  const settle = (result) => {
    settleCrucibleRun({ result, run });
    h.bus.emit('run:resultsReady', result);
  };

  settle(resultFor({ outcome: 'defeat', wave: 4, deepestWave: 4, score: 900 }));
  assert.deepEqual(h.unlocks.map((u) => u.id), ['into_the_crucible']);

  settle(resultFor({ outcome: 'defeat', wave: 6, deepestWave: 6, score: 700 }));
  assert.equal(h.unlocks.length, 1, 'a worse run beats nothing');

  settle(resultFor({ outcome: 'extracted', extracted: true, wave: 10, deepestWave: 10, score: 1400, dailyDateKey: '2026-09-14' }));
  assert.deepEqual(h.unlocks.map((u) => u.id), [
    'into_the_crucible', 'tenth_wave', 'better_than_last_time', 'same_seed_same_day', 'walked_out',
  ]);
  const snap = h.ledger.snapshot();
  assert.deepEqual(snap.crucible, { runs: 3, deepestWave: 10, dailyDays: 1 });
  console.log(`PQ-033.03 crucible: runs=${snap.crucible.runs} deepest=${snap.crucible.deepestWave} daily=${snap.crucible.dailyDays} bests=${snap.counters.crucibleBests} extractions=${snap.counters.crucibleExtractions}`);

  // A player who already has Crucible history gets it retroactively, silently, on first install.
  h.ledger.dispose();
  const fresh = harness();
  assert.deepEqual(fresh.unlocks.map((u) => u.id).sort(), ['into_the_crucible', 'same_seed_same_day', 'tenth_wave', 'walked_out']);
  assert.ok(fresh.unlocks.every((u) => u.retroactive === true));
  assert.equal(fresh.said.length, 0, 'retroactive unlocks do not speak');
});

test('telemetry career aggregates seed counters once, retroactively and silently', () => {
  const telemetry = { getCareerStats: () => ({ navigation: { docks: 3, jumps: 0 }, trades: { buy: 0, sell: 0 }, missions: { completed: 0 }, credits: { earned: 250 } }) };
  const h = harness({ telemetry });
  assert.deepEqual(h.unlocks.map((u) => u.id), ['berth_assigned']);
  assert.equal(h.unlocks[0].via, 'retroactive');
  assert.equal(h.said.length, 0);
  assert.equal(h.ledger.snapshot().counters.creditsEarned, 250);
});

test('the Steam mirror sends each unlock once and backfills earlier unlocks when Steam appears', async () => {
  const calls = [];
  const shell = {
    unlockAchievement: async (id) => { calls.push(id); return { ok: true, available: true, id }; },
    steamStatus: async () => ({ available: true, reason: 'ok' }),
  };
  const storage = mapStorage();
  const offline = harness({ storage, shell: { unlockAchievement: async () => ({ ok: false, available: false, reason: 'sdk-absent' }), steamStatus: async () => ({ available: false, reason: 'sdk-absent' }) } });
  offline.bus.emit('dock:docked', { stationId: 'station_helios' });
  await new Promise((resolve) => setImmediate(resolve));
  offline.ledger.dispose();
  assert.equal(loadAchievementBag(storage).steam.berth_assigned, undefined, 'no Steam, no mirror flag');

  const online = harness({ storage, shell });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['berth_assigned'], 'the earlier unlock is backfilled once Steam is available');
  online.bus.emit('tether:latched', { targetId: 5 });
  online.bus.emit('tether:latched', { targetId: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['berth_assigned', 'made_contact']);
  online.ledger.dispose();
  const bag = loadAchievementBag(storage);
  assert.equal(bag.steam.berth_assigned, true);
  assert.equal(bag.steam.made_contact, true);

  const again = harness({ storage, shell });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['berth_assigned', 'made_contact'], 'mirrored unlocks are not re-sent');
  again.ledger.dispose();
});

test('the ledger is meta state: read-only on GameState and outside the sim registry', () => {
  const state = Object.freeze({ playerId: PLAYER, simTime: 1, onboarding: Object.freeze({ active: false, finished: true }) });
  const h = harness({ state });
  for (const [event, payload] of STREAM) h.bus.emit(event, payload);
  assert.equal(h.unlocks.length, STREAM_UNLOCKS.length, 'a frozen GameState is enough: the ledger never writes it');

  const systemEntry = /systems\/achievements\.js|\[\s*'achievements'\s*,|'achievements'\s*[,\]]/;
  const registry = readFileSync(path.join(ROOT, 'src', 'core', 'registry.js'), 'utf8');
  assert.doesNotMatch(registry, systemEntry, 'no registry system, so no UPDATE_ORDER entry and no golden movement');
  const manifest = readFileSync(path.join(ROOT, 'src', 'runtime', 'authoritativeSystemManifest.js'), 'utf8');
  assert.doesNotMatch(manifest, systemEntry, 'not in the authoritative sim manifest');
  const ledgerSrc = readFileSync(path.join(ROOT, 'src', 'systems', 'achievements.js'), 'utf8');
  assert.doesNotMatch(ledgerSrc, /Math\.random/);

  const snap = h.ledger.snapshot();
  const rows = achievementRows({ schemaVersion: 1, unlocked: snap.unlocked, counters: snap.counters }, { runs: 0, deepestWave: 3, dailyDays: 0 });
  assert.deepEqual(h.ledger.rows().map((row) => row.unlocked), rows.map((row) => row.id !== 'tenth_wave' && row.unlocked), 'the live rows agree with the stored bag');
  assert.equal(rows.length, ACHIEVEMENTS.length);
  const hidden = rows.find((row) => row.id === 'paperwork_filed');
  assert.equal(hidden.unlocked, true);
  assert.equal(hidden.name, 'Paperwork Filed');
  const tenth = rows.find((row) => row.id === 'tenth_wave');
  assert.equal(tenth.status, '3 / 10');
  const lockedHidden = achievementRows(emptyAchievementBag(), null).find((row) => row.id === 'paperwork_filed');
  assert.equal(lockedHidden.masked, true);
  assert.equal(lockedHidden.name, 'Hidden achievement');
  assert.equal(lockedHidden.status, 'Locked');
  assert.equal(rows.find((row) => row.id === 'berth_assigned').status, 'Unlocked 14 Sep 2026');
});

test('before the first shared-store sync the ledger never pushes and never claims to be newest', async () => {
  const previous = { location: globalThis.location, fetch: globalThis.fetch };
  const puts = [];
  globalThis.location = { protocol: 'http:' };
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === 'PUT') puts.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ keys: {} }) };
  };
  const envelope = (savedAt, unlocked) => JSON.stringify({
    fmt: ACHIEVEMENTS_FMT, schemaVersion: 1, savedAt, updatedAt: savedAt,
    data: { schemaVersion: 1, unlocked, counters: {} },
  });
  try {
    const storage = mapStorage();
    storage.setItem(ACHIEVEMENTS_STORAGE_KEY, envelope('2026-09-01T00:00:00.000Z', { made_contact: { at: '2026-09-01T00:00:00.000Z', via: 'tether:latched' } }));
    const h = harness({ storage });
    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(puts.length, 0, 'nothing is pushed while the sync is still pending');
    const local = JSON.parse(storage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    assert.equal(local.savedAt, '2026-09-01T00:00:00.000Z', 'a pre-sync write keeps the stored envelope time');
    assert.ok(local.data.unlocked.berth_assigned, 'the unlock itself is saved locally at once');

    // The sync lands the other shell's newer bag over the local copy.
    storage.setItem(ACHIEVEMENTS_STORAGE_KEY, envelope('2026-09-14T10:00:00.000Z', { paper_trail: { at: '2026-09-14T09:00:00.000Z', via: 'economy:tradeCompleted' } }));
    h.bus.emit('save:store-synced', { ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(puts.length, 1, 'one fresh push after the sync');
    const pushed = JSON.parse(puts[0].keys[ACHIEVEMENTS_STORAGE_KEY]);
    assert.deepEqual(Object.keys(pushed.data.unlocked).sort(), ['berth_assigned', 'made_contact', 'paper_trail'], 'the push is the union of both shells');
    assert.equal(pushed.savedAt, '2026-09-14T12:00:00.000Z');
    assert.equal(h.unlocks.length, 1, 'only the dock was announced');
    h.ledger.dispose();
  } finally {
    globalThis.location = previous.location;
    globalThis.fetch = previous.fetch;
  }
});
