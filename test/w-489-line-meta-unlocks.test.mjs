// w-489: the between-run Line ledger — fixed-seed thresholds and authored
// victories earn head unlocks (records, not boosts), the earned rows persist
// and merge, and a gated head is not for sale until the ledger holds it.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LINE_META_UNLOCKS,
  LINE_META_UNLOCK_FOR_HEAD,
  lineMetaUnlocksForRun,
  lineMetaEarned,
  lineMetaEarnedHeadIds,
  lineMetaRatingFloor,
  lineMetaArenaIds,
  registerLineMetaReader,
} from '../src/data/lineProgression.js';
import { MODULES } from '../src/data/modules.js';
import {
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { ships } from '../src/systems/ships.js';

function shipsWithState(state = {}) {
  return Object.assign(Object.create(ships), {
    state,
    bus: { emit() {} },
  });
}

const BY_ID = new Map(MODULES.map((d) => [d.id, d]));

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function resultFixture(overrides = {}) {
  return {
    ruleset: 'swarm',
    arenaId: 'helios_core',
    seed: 4242,
    outcome: 'defeat',
    wave: 10,
    startWave: 1,
    wavesCleared: 10,
    deepestWave: 10,
    credits: 100,
    kills: 12,
    score: 400,
    xp: 0,
    picks: [],
    runId: 'w489-run',
    endedAt: 't:1',
    ...overrides,
  };
}

function runFixture(overrides = {}) {
  return {
    kind: 'survival',
    ruleset: 'swarm',
    arenaId: 'helios_core',
    seed: 4242,
    wave: 10,
    arenaMutators: [],
    telemetry: {},
    ...overrides,
  };
}

test('w-489: wave thresholds, a cull purse, and an authored victory earn their rows', () => {
  assert.deepEqual(lineMetaUnlocksForRun({ wavesCleared: 4 }).map((r) => r.id), []);
  assert.deepEqual(lineMetaUnlocksForRun({ wavesCleared: 5 }).map((r) => r.id), ['line_head_coupler']);
  assert.deepEqual(
    lineMetaUnlocksForRun({ wavesCleared: 10 }).map((r) => r.id).sort(),
    ['line_head_barb', 'line_head_breaker', 'line_head_coupler'],
  );
  assert.deepEqual(lineMetaUnlocksForRun({ cullPurse: 4000 }).map((r) => r.id), ['line_head_magnet']);
  assert.deepEqual(lineMetaUnlocksForRun({ cullPurse: 3999 }).map((r) => r.id), []);
  assert.deepEqual(lineMetaUnlocksForRun({ authoredVictory: true }).map((r) => r.id), ['line_head_multi_latch']);
  // Records, not boosts: no row carries a stat field.
  for (const row of LINE_META_UNLOCKS) {
    assert.ok(!('stat' in row) && !('bonus' in row), `${row.id} must grant a record, not a boost`);
  }
});

test('w-489: every gated head names its meta-unlock row on the module def', () => {
  const gated = new Set(Object.keys(LINE_META_UNLOCK_FOR_HEAD));
  for (const headId of gated) {
    const def = BY_ID.get(`mod_line_${headId}`);
    assert.ok(def, `${headId} module def missing`);
    assert.equal(def.lineGate, LINE_META_UNLOCK_FOR_HEAD[headId]);
  }
  // Ungated heads carry no gate field at all.
  assert.equal(BY_ID.get('mod_line_head_weld').lineGate, undefined);
  assert.equal(BY_ID.get('mod_line_head_coupler').lineGate, 'line_head_coupler');
});

test('w-489: the read port answers the earned ledger — heads, rating floor, arenas', () => {
  const profile = {
    lineMeta: {
      earned: {
        line_head_coupler: { at: '2026-10-30T00:00:00Z' },
        line_head_breaker: { at: '2026-10-30T01:00:00Z' },
        line_head_barb: { at: '2026-10-30T02:00:00Z' },
      },
    },
  };
  registerLineMetaReader(() => profile);
  try {
    assert.equal(lineMetaEarned('line_head_coupler'), true);
    assert.equal(lineMetaEarned('line_head_magnet'), false);
    assert.deepEqual(lineMetaEarnedHeadIds().sort(), ['head_barb', 'head_breaker', 'head_coupler']);
    assert.equal(lineMetaRatingFloor(), 250, 'the largest earned rating floor wins');
    assert.deepEqual(lineMetaArenaIds(), ['reach_hook_pit']);
  } finally {
    // Restore the production port — survivalRecords registered it at module load.
    registerLineMetaReader(() => loadCrucibleMeta());
  }
  // A missing reader is the empty ledger, never a guessed earn.
  assert.equal(lineMetaEarned('line_head_coupler'), false);
  assert.equal(lineMetaRatingFloor(), 0);
});

test('w-489: settlement settles the ledger — earned rows persist, repeat runs never duplicate', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const settled = settleCrucibleRun({
    result: resultFixture({ runId: 'w489-a' }),
    run: runFixture(),
    storage,
  });
  assert.deepEqual(
    settled.result.lineMetaEarned.slice().sort(),
    ['line_head_barb', 'line_head_breaker', 'line_head_coupler'],
    'ten cleared waves earn coupler, barb and breaker in one settle',
  );
  const reloaded = loadCrucibleMeta(storage);
  assert.deepEqual(
    Object.keys(reloaded.lineMeta.earned).sort(),
    ['line_head_barb', 'line_head_breaker', 'line_head_coupler'],
    'the ledger persists through storage reload',
  );
  assert.equal(lineMetaEarned('line_head_coupler'), true, 'the registered reader sees the reload');
  assert.equal(lineMetaEarned('line_head_magnet'), false, 'an unearned row stays unearned');

  // A second qualifying run earns nothing twice.
  const again = settleCrucibleRun({
    result: resultFixture({ runId: 'w489-b', wavesCleared: 12, deepestWave: 12 }),
    run: runFixture(),
    storage,
  });
  assert.equal(again.result.lineMetaEarned, undefined, 'no fresh rows — no duplicate write');
  assert.equal(Object.keys(again.profile.lineMeta.earned).length, 3);
});

test('w-489: a practice run proves nothing on the Line ledger', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  const drill = settleCrucibleRun({
    result: resultFixture({ runId: 'w489-drill' }),
    run: runFixture({ practice: true }),
    storage,
  });
  assert.equal(drill.result.lineMetaEarned, undefined);
  assert.equal(Object.keys(loadCrucibleMeta(storage).lineMeta.earned).length, 0);
});

test('w-489: stale or malformed profiles migrate to the empty ledger', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  // A profile saved before this packet has no lineMeta key at all.
  storage.setItem('sf.save.crucible_meta', JSON.stringify({ schemaVersion: 1, unlocks: {} }));
  assert.deepEqual(loadCrucibleMeta(storage).lineMeta, { earned: {} });
  // Junk in the bag drops: unknown ids and non-row entries never survive the load.
  storage.setItem('sf.save.crucible_meta', JSON.stringify({
    schemaVersion: 1,
    lineMeta: { earned: { line_head_coupler: 'yes', bogus_id: { at: 'x' }, line_head_barb: { at: 't:9' } } },
  }));
  assert.deepEqual(loadCrucibleMeta(storage).lineMeta, {
    earned: { line_head_barb: { at: 't:9' }, line_head_coupler: { at: null } },
  });
});

test('w-489: the shop gate reads the ledger — unearned heads are not for sale', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const sys = shipsWithState();
  const couplerDef = BY_ID.get('mod_line_head_coupler');
  const weldDef = BY_ID.get('mod_line_head_weld');
  assert.equal(sys.isUnlocked(couplerDef), false, 'coupler is gated before the ledger earns it');
  assert.equal(sys.isUnlocked(weldDef), true, 'an ungated head still answers the normal gate');
  settleCrucibleRun({ result: resultFixture({ runId: 'w489-g' }), run: runFixture(), storage });
  assert.equal(sys.isUnlocked(couplerDef), true, 'the earned row opens the buy gate');
});
