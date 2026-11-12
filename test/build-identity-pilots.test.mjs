// The progression vertical's build-identity contract, pinned fast (no runtime boot).
//
// The full proof — four fits flying the same fixed-seed combat content on the real runtime with
// measured verb profiles — is `node scripts/check-build-identities.mjs` (slow, real path). This
// test pins the invariants that make that proof meaningful:
//   1. four identities exist, on the same hull, each with a DISTINCT signature verb set;
//   2. every fitted module/weapon id is real catalog gear and tech-reachable (researchable);
//   3. every fit's derived block actually carries its identity's capability keys — the verbs
//      are folded from the fit, not asserted into existence.
import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import {
  ARCHETYPES,
  ARCHETYPE_SEED,
  RAIDER_COUNT,
  archetypeById,
  l1,
  normalize,
  scorePilotRuns,
} from '../scripts/lib/bench/archetypePilotData.mjs';

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const TECH_UNLOCKED_IDS = new Set(
  TECH_NODES.flatMap((node) => [
    ...((node.unlocks && node.unlocks.modules) || []),
    ...((node.unlocks && node.unlocks.ships) || []),
  ]),
);

test('four build identities exist on the same hull with distinct signature verb sets', () => {
  assert.equal(ARCHETYPES.length >= 4, true, 'at least four identities');
  const hulls = new Set(ARCHETYPES.map((row) => row.hullId));
  assert.equal(hulls.size, 1, 'all identities fly the same hull so the diff is the fit');
  assert.equal(SHIPS.some((s) => s.id === ARCHETYPES[0].hullId), true, 'the shared hull is roster gear');

  const sigKeys = ARCHETYPES.map((row) => [...row.signature].sort().join('+'));
  assert.equal(new Set(sigKeys).size, ARCHETYPES.length, 'signature verb sets are pairwise distinct');
  for (const row of ARCHETYPES) {
    assert.ok(row.signature.length >= 2, `${row.id}: at least two signature verbs`);
    assert.ok(typeof row.policyId === 'string' && row.policyId.length > 0, `${row.id}: a pilot policy is bound`);
  }
});

test('every fitted module across the identities is real, tech-reachable gear', () => {
  for (const row of ARCHETYPES) {
    const shipDef = SHIPS.find((s) => s.id === row.hullId);
    assert.ok(shipDef, `hull ${row.hullId} exists`);
    for (const id of row.fittings) {
      if (!id) continue;
      const def = MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id);
      assert.ok(def, `${row.id} fits ${id}, which exists in the module/weapon catalog`);
      if (def.requiresTech) {
        assert.equal(TECH_UNLOCKED_IDS.has(id), true,
          `${id} is unlocked by ${def.requiresTech} so a player can actually research and buy it`);
      }
    }
  }
});

test('each fit derives its own identity verbs (capability keys folded from the modules)', () => {
  const expected = {
    momentum_predator: { masslineHeadId: 'elastic_whip', swingDrive: true },
    control_specialist: { masslineHeadId: 'transverse_snare' },
    precision_pilot: { masslineHeadId: 'monofilament_sweep' },
    salvage_industrial: { masslineHeadId: 'frame_coupler', towFlail: true },
  };
  for (const row of ARCHETYPES) {
    const derived = getDerivedStats(row.hullId, row.fittings, null);
    const want = expected[row.id];
    assert.ok(want, `${row.id} has expected capability keys`);
    for (const [key, value] of Object.entries(want)) {
      assert.deepEqual(derived[key], value, `${row.id}: derived.${key}`);
    }
  }
  // The loot magnet and the point-defense servo ride their own fits' inventory: the magnet is a
  // derived radius, the servo is a fittings-record reader like the cloak trio.
  const magnetFit = [...ARCHETYPES].find((row) => row.fittings.includes('mod_loot_magnet_s'));
  if (magnetFit) {
    const derived = getDerivedStats(magnetFit.hullId, magnetFit.fittings, null);
    assert.ok(derived.lootMagnetRange > 0, 'loot magnet fit derives a magnet radius');
  }
});

test('the pilot scorer separates profiles and fails silent runs', () => {
  // Distinct profiles pass.
  const runs = ARCHETYPES.map((row, i) => ({
    archetypeId: row.id,
    label: row.label,
    completed: true,
    playerAlive: true,
    raidersDown: RAIDER_COUNT,
    ticks: 1000,
    signature: row.signature,
    verbs: Object.fromEntries(row.signature.map((key) => [key, 10 + i])),
  }));
  const ok = scorePilotRuns(runs);
  assert.equal(ok.ok, true, `synthetic completed runs score ok (${ok.problems.join('; ')})`);

  // A silent run (signature verb never fired) fails.
  const silent = runs.map((run) => ({ ...run, verbs: Object.fromEntries(Object.keys(run.verbs).map((key) => [key, 0])) }));
  const bad = scorePilotRuns(silent);
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((problem) => problem.includes('signature verb')));

  // Two identical profiles fail the distance gate.
  const twins = runs.map((run) => ({ ...run, verbs: { ...runs[0].verbs } }));
  const same = scorePilotRuns(twins);
  assert.equal(same.ok, false);
  assert.ok(same.problems.some((problem) => problem.includes('too alike')));

  // normalize/l1 behave.
  assert.equal(l1(normalize({ a: 3, b: 1 }), normalize({ a: 1, b: 3 })) > 0.9, true);
  assert.equal(archetypeById('momentum_predator').signature.length >= 2, true);
  assert.equal(archetypeById('nope'), null);
  assert.equal(Number.isInteger(ARCHETYPE_SEED), true, 'the acceptance seed is fixed');
});
