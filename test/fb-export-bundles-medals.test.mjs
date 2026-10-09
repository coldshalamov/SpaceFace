// FB-104 — the export bundle carries the two profile side bags (achievement ledger + crucible
// records) next to the save envelope, import merges them additively after the envelope validates,
// and an import without an explicit destination lands in the first empty numbered slot rather
// than silently overwriting quick.
// Run: node --test test/fb-export-bundles-medals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import {
  ACHIEVEMENTS_STORAGE_KEY,
  parseAchievementBag,
} from '../src/systems/achievements.js';
import {
  CRUCIBLE_META_STORAGE_KEY,
  mergeCrucibleProfiles,
  parseCrucibleMeta,
  recordKey,
  saveCrucibleMeta,
} from '../src/systems/survivalRecords.js';
import {
  gzipEnvelopeJson,
  handleSaveWorkerRequestAsync,
  isGzippedSaveText,
  SAVE_GZIP_FORMAT,
} from '../src/save/saveWorker.js';

const TWENTY_MEDALS = ACHIEVEMENTS.slice(0, 20).map((row) => row.id);
assert.equal(TWENTY_MEDALS.length, 20, 'fixture needs twenty authored achievement ids');

function makeEnvelope({ slot = 'quick', savedAt = '2026-09-28T00:00:00.000Z', playtimeS = 600 } = {}) {
  const data = {
    meta: { seed: 4242, playtimeS, createdAt: savedAt, lastSavedAt: savedAt },
    player: {
      credits: 2500,
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    },
    cargo: { items: {}, capVolume: 40, capMass: 40 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    entities: {
      player: {
        id: 'saved-player',
        type: 'ship',
        defId: 'ship_kestrel',
        pos: { x: 10, z: 20 },
        vel: { x: 0, z: 0 },
        rot: 0,
        angVel: 0,
        hull: 100,
        shield: 100,
        cap: 100,
        flags: {},
        data: {},
      },
      persistent: [],
      simTime: playtimeS,
      tick: playtimeS * 60,
    },
    missions: { active: [], completed: [] },
    settings: { gameplay: {}, video: {}, audio: {}, controls: {} },
  };
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt,
    playtimeS,
    slot,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

function installHarness(storage) {
  const previousStorage = globalThis.localStorage;
  const previousWorker = globalThis.Worker;
  const original = {
    state: save.state,
    bus: save.bus,
    restore: save._restore,
    serialize: save.serialize,
    hasPlayer: save._hasPlayerEntity,
    restoring: save._restoring,
    rollbackInProgress: save._rollbackInProgress,
    restoreSequence: save._restoreSequence,
    requestSaveWorker: save._requestSaveWorker,
  };
  const events = [];
  globalThis.localStorage = storage;
  save.state = {
    meta: { playtimeS: 600, lastSavedAt: '' },
    save: { currentSlot: null },
    player: { credits: 2500, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }] },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    nav: {},
    missions: { active: [] },
    story: { beatIndex: 0 },
    ui: {},
    mode: 'flight',
    jump: { state: 'IDLE' },
  };
  save.bus = { emit(name, payload) { events.push({ name, payload }); } };
  save._restoring = false;
  save._rollbackInProgress = false;
  save._restoreSequence = 0;
  save._hasPlayerEntity = () => false;

  const restored = [];
  save._restore = (data, slot) => { restored.push({ data, slot }); return { restored: true, slot }; };

  // The async (gzip) import lane runs the real worker protocol in-process.
  globalThis.Worker = class {};
  let requestId = 0;
  save._requestSaveWorker = (type, payload, onResult) => {
    const id = ++requestId;
    Promise.resolve()
      .then(() => handleSaveWorkerRequestAsync({ id, type, payload }))
      .then((response) => { if (response) onResult(response); });
    return true;
  };

  return {
    events,
    restored,
    restore() {
      save.state = original.state;
      save.bus = original.bus;
      save._restore = original.restore;
      save.serialize = original.serialize;
      save._hasPlayerEntity = original.hasPlayer;
      save._restoring = original.restoring;
      save._rollbackInProgress = original.rollbackInProgress;
      save._restoreSequence = original.restoreSequence;
      save._requestSaveWorker = original.requestSaveWorker;
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      if (previousWorker === undefined) delete globalThis.Worker;
      else globalThis.Worker = previousWorker;
    },
  };
}

/* ── profile fixtures ─────────────────────────────────────────────────────────────────────── */

function seedAchievementBag(storage, ids = TWENTY_MEDALS, { counters = { kills: 5, deaths: 2 }, extra = {} } = {}) {
  const unlocked = {};
  for (const id of ids) unlocked[id] = { at: '2026-06-01T00:00:00.000Z', via: 'test' };
  const bag = {
    schemaVersion: 1,
    unlocked,
    counters,
    crucibleBestByKey: {},
    crucibleBestByRunKey: {},
    steam: {},
    ...extra,
  };
  storage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({
    fmt: 'spaceface-achievements',
    schemaVersion: 1,
    savedAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    data: bag,
  }));
  return bag;
}

// A canonical compact run row — the same shape settleCrucibleRun files into history/bestResult,
// with the full record-rules stamp so compareRunRecords can order two rows under one key.
function compactRun(over = {}) {
  return {
    schemaVersion: 1,
    outcome: 'defeat',
    seed: 4242,
    arenaId: 'arena_ceres_ring',
    ruleset: 'standard',
    trialId: null,
    mutators: [],
    wave: 12,
    deepestWave: 12,
    wavesCleared: 11,
    kills: 60,
    score: 18450,
    credits: 900,
    xp: 300,
    confidence: 0.9,
    picks: [{ verb: 'refit', defId: 'mod_shield_s', wave: 6 }],
    unlocksEarned: ['trial_first_wave'],
    highestRoundEntered: 12,
    lastRoundCleared: 11,
    roundThreatBudget: 1000,
    roundThreatResolved: 1000,
    remainingEnemies: 0,
    recordRules: {
      mode: 'standard',
      arenaId: 'arena_ceres_ring',
      balanceRevision: 3,
      physicsRevision: 2,
      scoringRevision: 1,
      difficulty: 'veteran',
      loadoutRules: 'kit_kestrel',
      simulationAssistProfile: 'assist_none',
      mutators: [],
    },
    ...over,
  };
}

function ghostRow(over = {}) {
  return {
    seed: 4242,
    hullId: 'ship_kestrel',
    frames: [
      { t: 0, x: 0, z: 0, r: 0 },
      { t: 12, x: 300, z: 40, r: 1.5 },
      { t: 24, x: 620, z: -110, r: 3.0 },
    ],
    recordedAt: '2026-09-28T12:00:00.000Z',
    ...over,
  };
}

function seedCrucibleProfile(storage, { runOver = {}, historyExtra = [], lifetimeOver = {}, dailyOver = {} } = {}) {
  const run = compactRun(runOver);
  const key = recordKey(run);
  const profile = {
    schemaVersion: 1,
    unlocks: {
      trial_first_wave: { at: '2026-09-28T10:00:00.000Z', wave: 12 },
      trial_veteran_clear: { at: '2026-09-28T11:00:00.000Z', wave: 20 },
    },
    records: {
      byKey: {
        [key]: {
          attempts: 4,
          victories: 1,
          bestScore: run.score,
          deepestWave: run.deepestWave,
          bestKills: run.kills,
          bestSeed: run.seed,
          bestResult: run,
          tiedResults: [run],
          tieCount: 1,
        },
      },
      lifetime: { runs: 4, victories: 1, defeats: 3, aborted: 0, deepestWave: 12, bestScore: 18450, bestKills: 60, ...lifetimeOver },
    },
    history: [run, ...historyExtra],
    daily: {
      byDate: {
        '2026-09-28': {
          dateKey: '2026-09-28', seed: 4242, bestScore: 18450, deepestWave: 12,
          attempts: 4, lastOutcome: 'defeat', recordedAt: '2026-09-28T12:00:00.000Z', ...dailyOver,
        },
      },
    },
    ghosts: { byHash: { }, lastHash: null },
    bestLines: [],
  };
  const ghost = ghostRow();
  profile.ghosts.byHash['424242'] = { ...ghost, hash: 424242, frameCount: ghost.frames.length, recordRules: null };
  profile.ghosts.lastHash = 424242;
  saveCrucibleMeta(profile, storage);
  return { profile, run, key };
}

/* ── tests ──────────────────────────────────────────────────────────────────────────────── */

test('export bundles both profile side bags and import restores them after wiping', async () => {
  const storage = memoryStorage();
  const h = installHarness(storage);
  try {
    const envelope = makeEnvelope({ slot: 'quick' });
    const storedRaw = JSON.stringify(envelope);
    storage.setItem('sf.save.quick', storedRaw);
    const bag = seedAchievementBag(storage);
    const { profile, key } = seedCrucibleProfile(storage);

    const exported = save.exportSlot('quick');
    assert.equal(typeof exported, 'string');
    const bundle = JSON.parse(exported);
    assert.equal(bundle.fmt, 'spaceface-save');
    assert.equal(bundle.version, CURRENT_VERSION);
    // The envelope rides untouched: the bags live beside it under `profile`, never inside data.
    assert.deepEqual(bundle.data, envelope.data);
    assert.equal(bundle.profile.achievements.fmt, 'spaceface-achievements');
    assert.deepEqual(bundle.profile.achievements.data.unlocked, bag.unlocked);
    assert.equal(bundle.profile.crucibleMeta.fmt, 'spaceface-crucible-meta');
    assert.equal(bundle.profile.crucibleMeta.data.records.byKey[key].bestScore, 18450);

    // Wipe the profile side bags — the machine-change scenario — then import into slot 3.
    storage.removeItem(ACHIEVEMENTS_STORAGE_KEY);
    storage.removeItem(CRUCIBLE_META_STORAGE_KEY);
    assert.equal(save.importString(exported, '3'), true);
    assert.equal(h.restored.length, 1);
    assert.equal(h.restored[0].slot, '3', 'explicit destination slot wins');
    assert.equal(storage.getItem('sf.save.quick'), storedRaw, 'quick bytes untouched by the import');

    const restoredBag = parseAchievementBag(storage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    assert.deepEqual(Object.keys(restoredBag.unlocked).sort(), TWENTY_MEDALS.slice().sort(),
      'all twenty medal states come back');
    for (const id of TWENTY_MEDALS) {
      assert.equal(restoredBag.unlocked[id].at, '2026-06-01T00:00:00.000Z');
    }
    assert.equal(restoredBag.counters.kills, 5);

    const restoredMeta = parseCrucibleMeta(storage.getItem(CRUCIBLE_META_STORAGE_KEY));
    assert.deepEqual(restoredMeta.history, profile.history, 'crucible history round-trips');
    assert.equal(restoredMeta.records.byKey[key].bestScore, 18450);
    assert.equal(restoredMeta.records.byKey[key].deepestWave, 12);
    assert.equal(restoredMeta.records.lifetime.bestScore, 18450);
    assert.deepEqual(restoredMeta.unlocks, profile.unlocks);
    assert.deepEqual(restoredMeta.daily, profile.daily);
    assert.equal(Object.keys(restoredMeta.ghosts.byHash).length, 1);
    assert.equal(h.events.some((event) => event.name === 'save:profile-imported'), true);
    assert.equal(h.events.filter((event) => event.name === 'save:error').length, 0);
  } finally { h.restore(); }
});

test('import merges additively — counters max, unlocks union, a best is never lowered', () => {
  const storage = memoryStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', JSON.stringify(makeEnvelope({ slot: 'quick' })));
    seedAchievementBag(storage, TWENTY_MEDALS);
    const { profile } = seedCrucibleProfile(storage);
    const exported = save.exportSlot('quick');

    // The destination machine already owns a richer ledger: a higher counter, one extra medal,
    // a stronger crucible record under the same rules key, and a history row the file lacks.
    seedAchievementBag(storage, ['berth_assigned', 'rock_has_a_price', 'paper_trail'], {
      counters: { kills: 99, deaths: 2 },
    });
    const storedRun = compactRun({
      outcome: 'victory', seed: 777, wave: 15, deepestWave: 15, wavesCleared: 14,
      kills: 90, score: 26000, highestRoundEntered: 15, lastRoundCleared: 14,
    });
    const storedNewer = compactRun({ outcome: 'defeat', seed: 9001, wave: 3, deepestWave: 3, score: 1200,
      highestRoundEntered: 3, lastRoundCleared: 2, confidence: 0.8 });
    seedCrucibleProfile(storage, {
      runOver: { outcome: 'victory', seed: 777, wave: 15, deepestWave: 15, wavesCleared: 14, kills: 90, score: 26000,
        highestRoundEntered: 15, lastRoundCleared: 14 },
      historyExtra: [storedNewer],
      lifetimeOver: { runs: 9, victories: 3, bestScore: 26000, deepestWave: 15, bestKills: 90 },
      dailyOver: { bestScore: 26000, deepestWave: 15, attempts: 9, lastOutcome: 'victory', recordedAt: '2026-09-29T08:00:00.000Z' },
    });

    assert.equal(save.importString(exported, '3'), true);

    const mergedBag = parseAchievementBag(storage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    assert.equal(mergedBag.counters.kills, 99, 'the higher stored counter wins');
    assert.equal(Object.keys(mergedBag.unlocked).length, 20, 'twenty file medals + zero new — stored set is a subset');
    for (const id of TWENTY_MEDALS) assert.ok(mergedBag.unlocked[id], `medal ${id} survived the merge`);

    const mergedMeta = parseCrucibleMeta(storage.getItem(CRUCIBLE_META_STORAGE_KEY));
    const key = recordKey(storedRun); // same rules stamp → same key as the file's row
    assert.equal(mergedMeta.records.byKey[key].bestScore, 26000, 'best score is never lowered by an import');
    assert.equal(mergedMeta.records.byKey[key].deepestWave, 15);
    assert.equal(mergedMeta.records.byKey[key].attempts, 4);
    assert.equal(mergedMeta.records.byKey[key].bestResult.highestRoundEntered, 15,
      'the stronger comparable run keeps the best slot');
    assert.equal(mergedMeta.records.lifetime.bestScore, 26000);
    assert.equal(mergedMeta.records.lifetime.runs, 9);
    // History is a union: the file's row plus both stored rows (its run and the newer tail),
    // no duplicates, stored rows appended after the file's own.
    assert.equal(mergedMeta.history.length, 3);
    assert.equal(mergedMeta.history[0].seed, 4242);
    assert.equal(mergedMeta.history[2].seed, 9001);
    assert.equal(mergedMeta.daily.byDate['2026-09-28'].bestScore, 26000);
    assert.equal(mergedMeta.daily.byDate['2026-09-28'].lastOutcome, 'victory',
      'the newer stamp owns the displayed outcome');
    assert.equal(Object.keys(mergedMeta.unlocks).length, 2);
    // Profile survives untouched on this envelope anyway — world data equality stays exact.
    assert.equal(h.restored.length, 1);
    assert.equal(h.restored[0].slot, '3');
  } finally { h.restore(); }
});

test('an import without a destination lands in the first empty numbered slot, never quick', () => {
  const storage = memoryStorage();
  const h = installHarness(storage);
  try {
    const quickRaw = JSON.stringify(makeEnvelope({ slot: 'quick' }));
    storage.setItem('sf.save.quick', quickRaw);
    storage.setItem('sf.save.1', JSON.stringify(makeEnvelope({ slot: '1' })));
    seedAchievementBag(storage, TWENTY_MEDALS.slice(0, 3));
    const exported = save.exportSlot('quick');

    assert.equal(save.importString(exported), true, 'no slot given — first empty slot is 2');
    assert.equal(h.restored[0].slot, '2');
    assert.equal(storage.getItem('sf.save.quick'), quickRaw, 'quick was never the silent answer');

    // Slot 2 remains free in storage (imports restore live state, they do not write slots), so a
    // second silent import also lands at 2 — the rule is about the world destination, not files.
    assert.equal(save.importString(exported), true);
    assert.equal(h.restored[1].slot, '2');

    // With 1 and 2 marked occupied the default walks to 3; a recovery-only slot also counts.
    storage.setItem('sf.save.2', JSON.stringify(makeEnvelope({ slot: '2' })));
    storage.setItem('sf.recovery.3', JSON.stringify(makeEnvelope({ slot: '3' })));
    assert.equal(save.importString(exported), true);
    assert.equal(h.restored[2].slot, '4');
    assert.equal(storage.getItem('sf.save.quick'), quickRaw);
  } finally { h.restore(); }
});

test('a gzipped export bundle carries profile on the wrapper and merges it on import', async () => {
  const storage = memoryStorage();
  const h = installHarness(storage);
  try {
    const envelope = makeEnvelope({ slot: 'quick' });
    const gz = JSON.parse(await gzipEnvelopeJson(JSON.stringify(envelope)));
    seedAchievementBag(storage, TWENTY_MEDALS);
    seedCrucibleProfile(storage);
    gz.profile = {
      achievements: JSON.parse(storage.getItem(ACHIEVEMENTS_STORAGE_KEY)),
      crucibleMeta: JSON.parse(storage.getItem(CRUCIBLE_META_STORAGE_KEY)),
    };
    const bundleText = JSON.stringify(gz);
    assert.equal(isGzippedSaveText(bundleText), true);
    assert.equal(JSON.parse(bundleText).fmt, SAVE_GZIP_FORMAT);

    storage.removeItem(ACHIEVEMENTS_STORAGE_KEY);
    storage.removeItem(CRUCIBLE_META_STORAGE_KEY);
    const out = save.importString(bundleText, '3');
    assert.equal(typeof out.then === 'function', true, 'compressed import takes the async lane');
    assert.equal(await out, true, JSON.stringify(h.events.filter((e) => e.name === 'save:error')));
    assert.equal(h.restored.length, 1);
    assert.equal(h.restored[0].slot, '3');

    const restoredBag = parseAchievementBag(storage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    assert.deepEqual(Object.keys(restoredBag.unlocked).sort(), TWENTY_MEDALS.slice().sort());
    const restoredMeta = parseCrucibleMeta(storage.getItem(CRUCIBLE_META_STORAGE_KEY));
    assert.equal(restoredMeta.history.length, 1);
    assert.equal(restoredMeta.records.lifetime.bestScore, 18450);
  } finally { h.restore(); }
});

test('a rejected envelope never touches the side bags', () => {
  const storage = memoryStorage();
  const h = installHarness(storage);
  try {
    const envelope = makeEnvelope({ slot: 'quick' });
    storage.setItem('sf.save.quick', JSON.stringify(envelope));
    seedAchievementBag(storage, TWENTY_MEDALS.slice(0, 2));
    const exported = save.exportSlot('quick');

    // Corrupt the envelope while keeping the profile section: validation must abort before
    // any bag merge runs.
    const bundle = JSON.parse(exported);
    bundle.data.player.credits = 999999;
    const rejected = JSON.stringify(bundle);
    const beforeAchievements = storage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    const beforeCrucible = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
    assert.equal(save.importString(rejected, '3'), false);
    assert.equal(h.restored.length, 0);
    assert.equal(storage.getItem(ACHIEVEMENTS_STORAGE_KEY), beforeAchievements);
    assert.equal(storage.getItem(CRUCIBLE_META_STORAGE_KEY), beforeCrucible);
    const err = h.events.find((event) => event.name === 'save:error');
    assert.equal(err.payload.reason, 'checksum');
  } finally { h.restore(); }
});

test('mergeCrucibleProfiles merges upward under one record key and stays idempotent', () => {
  const weaker = compactRun({ seed: 1, wave: 8, deepestWave: 8, score: 5000,
    highestRoundEntered: 8, lastRoundCleared: 7, kills: 30 });
  const stronger = compactRun({ seed: 2, wave: 15, deepestWave: 15, score: 26000,
    highestRoundEntered: 15, lastRoundCleared: 14, kills: 90 });
  const key = recordKey(weaker);
  assert.equal(key, recordKey(stronger), 'same rules stamp → same record key');
  const a = {
    schemaVersion: 1,
    unlocks: { u1: { at: 'a' } },
    records: { byKey: { [key]: { attempts: 2, victories: 0, bestScore: 5000, deepestWave: 8,
      bestKills: 30, bestSeed: 1, bestResult: weaker, tiedResults: [weaker], tieCount: 1 } },
      lifetime: { runs: 2, victories: 0, defeats: 2, aborted: 0, deepestWave: 8, bestScore: 5000, bestKills: 30 } },
    history: [weaker],
    daily: { byDate: {} },
    ghosts: { byHash: {}, lastHash: null },
    bestLines: [],
  };
  const b = {
    schemaVersion: 1,
    unlocks: { u2: { at: 'b' } },
    records: { byKey: { [key]: { attempts: 7, victories: 3, bestScore: 26000, deepestWave: 15,
      bestKills: 90, bestSeed: 2, bestResult: stronger, tiedResults: [stronger], tieCount: 2 } },
      lifetime: { runs: 7, victories: 3, defeats: 4, aborted: 0, deepestWave: 15, bestScore: 26000, bestKills: 90 } },
    history: [stronger],
    daily: { byDate: {} },
    ghosts: { byHash: {}, lastHash: null },
    bestLines: [],
  };
  const merged = mergeCrucibleProfiles(a, b);
  assert.equal(merged.records.byKey[key].bestScore, 26000);
  assert.equal(merged.records.byKey[key].attempts, 7);
  assert.equal(merged.records.byKey[key].bestResult.highestRoundEntered, 15);
  assert.equal(merged.records.lifetime.runs, 7);
  assert.equal(merged.records.lifetime.deepestWave, 15);
  assert.equal(merged.history.length, 2);
  assert.deepEqual(Object.keys(merged.unlocks).sort(), ['u1', 'u2']);
  // Idempotent: merging the output against itself changes nothing.
  assert.deepEqual(mergeCrucibleProfiles(merged, merged), merged);
  // Direction-safe: the same merge in the other argument order still keeps the best.
  const reverse = mergeCrucibleProfiles(b, a);
  assert.equal(reverse.records.byKey[key].bestScore, 26000);
  assert.equal(reverse.records.byKey[key].bestResult.highestRoundEntered, 15);
});
