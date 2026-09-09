// PQ-169.02 — Weekly mutators.
//
// Seed 16920. Four weekly Crucible twists must each change the top strategy.
// The week key is a UTC calendar week, not Date.now() inside the sim.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CRUCIBLE_WEEKLY_ROTATION } from '../src/data/survivalMutators.js';
import {
  applyWeaponsColdLoadout,
  clearQueuedChallenge,
  compileChallenge,
  offerDraftForChallenge,
  weeklyTelemetry,
} from '../src/systems/survivalMutators.js';
import {
  resetCrucibleMetaForTests,
  utcWeekKeyFromIso,
  useCrucibleMetaClock,
  weeklyMutatorForNow,
  weeklyMutatorForWeekKey,
} from '../src/systems/survivalRecords.js';

const SEED = 16920;
const WAVE = 1;

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
}

function strategySignature(row) {
  return JSON.stringify({
    wellCount: row.wellCount,
    heavyCount: row.heavyCount,
    fodder: row.fodder,
    physicsOnly: row.physicsOnly,
    skipDraft: row.skipDraft,
    weaponLock: row.weaponLock,
    reefLayoutId: row.reefLayoutId,
  });
}

test('same UTC week, two clocks yield the same weekly mutator id', () => {
  resetMeta();
  useCrucibleMetaClock(() => '2026-08-31T00:00:00.000Z');
  const keyA = utcWeekKeyFromIso('2026-08-31T00:00:00.000Z');
  const idA = weeklyMutatorForNow();

  useCrucibleMetaClock(() => '2026-09-06T23:59:59.000Z');
  const keyB = utcWeekKeyFromIso('2026-09-06T23:59:59.000Z');
  const idB = weeklyMutatorForNow();

  assert.equal(keyA, '2026-W36');
  assert.equal(keyB, '2026-W36');
  assert.equal(idA, idB);
  assert.equal(idA, 'gravity_slalom');
  assert.equal(weeklyMutatorForWeekKey('2026-W36'), 'gravity_slalom');
  console.log(`WEEKLY_MATCH=1 WEEK=${keyA} ID=${idA}`);
});

test('four consecutive UTC weeks are a permutation of the four weekly mutators', () => {
  resetMeta();
  const starts = [
    '2026-08-31T12:00:00.000Z',
    '2026-09-07T12:00:00.000Z',
    '2026-09-14T12:00:00.000Z',
    '2026-09-21T12:00:00.000Z',
  ];
  const ids = [];
  for (const iso of starts) {
    useCrucibleMetaClock(() => iso);
    ids.push(weeklyMutatorForNow());
  }
  assert.deepEqual(ids, CRUCIBLE_WEEKLY_ROTATION.slice());
  assert.equal(new Set(ids).size, 4);
  console.log(`ROTATION=${ids.join(',')}`);
});

test('weeklyTelemetry on seed 16920 wave 1: four mutators, four strategies', () => {
  resetMeta();
  const before = weeklyTelemetry('', SEED, WAVE);
  assert.equal(before.wellCount, 0);
  assert.equal(before.physicsOnly, false);
  assert.equal(before.skipDraft, false);
  assert.equal(before.reefLayoutId, null);
  assert.equal(before.heavyCount, 0);
  assert.equal(before.fodder, 10);

  const rows = {};
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    rows[id] = weeklyTelemetry(id, SEED, WAVE);
  }
  const slalom = rows.gravity_slalom;
  const heavies = rows.heavies_only;
  const cold = rows.weapons_cold;
  const reef = rows.reef;

  assert.equal(slalom.wellCount, 3);
  assert.notEqual(slalom.wellCount, before.wellCount);

  assert.equal(heavies.heavyCount, 10);
  assert.equal(heavies.fodder, 0);
  assert.notEqual(heavies.heavyCount, before.heavyCount);
  assert.notEqual(heavies.fodder, before.fodder);
  for (const role of heavies.roles) {
    assert.ok(role === 'anchor' || role === 'elite', role);
  }

  assert.equal(cold.physicsOnly, true);
  assert.equal(cold.skipDraft, true);
  assert.equal(cold.weaponLock, 'starting');
  const coldChallenge = compileChallenge(SEED, ['weapons_cold'], 'swarm');
  assert.deepEqual(offerDraftForChallenge({
    seed: SEED,
    wave: WAVE,
    pickCount: 0,
    hullId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', null, null, null, null, null],
  }, coldChallenge).offers, []);
  assert.deepEqual(applyWeaponsColdLoadout([
    { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
    { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
    { slotIndex: 7, defId: 'mod_elastic_whip_m' },
  ]).map((slot) => slot.defId), ['mod_elastic_whip_m']);

  assert.equal(reef.reefLayoutId, 'crucible_reef');
  assert.notEqual(reef.reefLayoutId, before.reefLayoutId);

  const signatures = CRUCIBLE_WEEKLY_ROTATION.map((id) => strategySignature(rows[id]));
  assert.equal(new Set(signatures).size, 4);
  assert.equal(signatures.includes(strategySignature(before)), false);

  console.log(
    'TELEMETRY_16920 '
    + `gravity_slalom wellCount=${slalom.wellCount}`
    + ` | heavies_only heavyCount=${heavies.heavyCount} fodder=${heavies.fodder}`
    + ` | weapons_cold physicsOnly=${cold.physicsOnly} skipDraft=${cold.skipDraft}`
    + ` | reef arena=${reef.reefLayoutId}`,
  );
});
