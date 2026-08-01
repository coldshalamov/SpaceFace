import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLUEPRINTS } from '../src/data/blueprints.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { combat } from '../src/systems/combat.js';
import {
  formatLootAuditSummary,
  runDepthProgramLootAudit,
} from '../scripts/lib/depthProgramLootAudit.mjs';

const manifest = JSON.parse(readFileSync(new URL('../design/depth-program/unique-loot-reservations.json', import.meta.url), 'utf8'));
const catalogs = {
  blueprints: BLUEPRINTS,
  commodities: COMMODITIES,
  modules: MODULES,
  ships: SHIPS,
  weapons: WEAPONS,
};

function audit(overrides = {}) {
  return runDepthProgramLootAudit({
    runs: 1000,
    seedStart: 1,
    manifest,
    declaredWrecks: UNIQUE_WRECKS,
    enemyTypes: ENEMY_TYPES,
    combatRollLoot: combat.rollLoot,
    makeCombatRng: (seed, sourceId) => mulberry32(hash32(seed, 'combat', sourceId)),
    catalogs,
    ...overrides,
  });
}

const liveReport = audit();

test('GT1 groundwork audits all live combat loot across 1,000 deterministic seeds', () => {
  assert.equal(liveReport.ok, true, JSON.stringify(liveReport.issues, null, 2));
  assert.equal(liveReport.runs, 1000);
  assert.ok(liveReport.normalLootSources >= 8, 'the audited normal-loot source baseline cannot shrink silently');
  assert.equal(liveReport.normalLootRolls, liveReport.normalLootSources * liveReport.runs,
    'every normal-loot source is exercised for every deterministic seed');
  assert.ok(liveReport.enumeratedNormalItems >= 17, 'the enumerated normal-loot catalog cannot shrink silently');
  assert.ok(liveReport.stationAcquisitionItems >= 105,
    'the audited station-acquisition catalog cannot shrink silently');
  assert.ok(liveReport.stationAcquisitionSurfaces >= liveReport.stationAcquisitionItems,
    'every station-acquisition item must have at least one enumerated surface');
  assert.ok(liveReport.normalItemDrops > 0);
  assert.match(liveReport.rollHash, /^[a-f0-9]{64}$/);
  assert.ok(liveReport.rarestNormalDrops.length > 0);
  assert.ok(liveReport.rarestNormalDrops.every((row) => row.hits > 0));
});

test('reserved unique loot never enters normal rolls or station acquisition surfaces', () => {
  assert.equal(liveReport.reservedUniqueDrops, 14);
  assert.equal(liveReport.declaredUniqueDrops, 14);
  assert.equal(liveReport.equipmentUniqueDrops, 12);
  assert.equal(liveReport.storyUniqueDrops, 2);
  assert.equal(liveReport.uniqueNormalLootHits, 0);
  assert.deepEqual(liveReport.stationAcquisitionHits, []);
  assert.match(formatLootAuditSummary(liveReport), /14 reserved uniques \(12 equipment, 2 story\)/);
});

test('the live combat roller produces a byte-stable receipt for the same seed interval', () => {
  const replay = audit();
  assert.equal(replay.ok, true, JSON.stringify(replay.issues, null, 2));
  assert.equal(replay.rollHash, liveReport.rollHash);
  assert.deepEqual(replay.rarestNormalDrops, liveReport.rarestNormalDrops);
  assert.equal(replay.definitionHash, liveReport.definitionHash);

  const reordered = audit({ enemyTypes: [...ENEMY_TYPES].reverse() });
  assert.equal(reordered.rollHash, liveReport.rollHash,
    'catalog iteration order must not change the per-source deterministic receipt');
  assert.equal(reordered.definitionHash, liveReport.definitionHash);
  assert.deepEqual(reordered.rarestNormalDrops, liveReport.rarestNormalDrops);
});

test('the audit fails closed when a live unique declaration is absent from the reservation manifest', () => {
  const report = audit({
    declaredWrecks: [
      ...UNIQUE_WRECKS,
      {
        id: 'wreck_fixture_unreserved',
        uniqueDrops: [{ id: 'unique_fixture_unreserved', kind: 'story_data' }],
      },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.declaredUniqueDrops, 15);
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-declared-unreserved'
    && row.path === 'unique_fixture_unreserved'));
});

test('the audit fails if a reserved unique leaks into a normal combat table', () => {
  const leakedId = manifest.wrecks[0].uniqueDrops[0].id;
  const report = audit({
    enemyTypes: [
      ...ENEMY_TYPES,
      {
        id: 'fixture_unique_leak',
        loot: {
          creditsRange: [0, 0],
          guaranteed: [{ id: leakedId, qtyRange: [1, 1] }],
        },
      },
    ],
  });
  assert.equal(report.ok, false);
  assert.ok(report.uniqueNormalLootHits > 0);
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-normal-table'));
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-normal-hit'));
});

test('weighted nested drops and table aliases cannot hide a reserved unique from static enumeration', () => {
  const leakedId = manifest.wrecks[0].uniqueDrops[0].id;
  const report = audit({
    enemyTypes: [
      ...ENEMY_TYPES,
      {
        id: 'fixture_nested_unique_leak',
        loot: {
          creditsRange: [0, 0],
          drops: [{ chance: 0.000001, entries: [{ id: leakedId, weight: 1, qtyRange: [1, 1] }] }],
        },
      },
      {
        id: 'fixture_alias_unique_leak',
        lootTableId: 'fixture_reserved_pool',
      },
    ],
    normalLootTables: {
      fixture_reserved_pool: {
        creditsRange: [0, 0],
        drops: [{ id: leakedId, chance: 0.000001, qtyRange: [1, 1] }],
      },
      fixture_orphan_reserved_pool: {
        creditsRange: [0, 0],
        entries: [{ itemId: leakedId, weight: 1, qtyRange: [1, 1] }],
      },
    },
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-normal-table'
    && row.path.includes('fixture_nested_unique_leak')));
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-normal-table'
    && row.path.includes('fixture_alias_unique_leak')));
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-normal-table'
    && row.path.includes('fixture_orphan_reserved_pool')));
  assert.ok(report.issues.some((row) => row.code === 'audit.normal-table-not-rollable'));
  assert.ok(report.issues.some((row) => row.code === 'audit.normal-table-unreferenced'
    && row.path === 'fixture_orphan_reserved_pool'));
});

test('the audit fails if a reserved unique becomes manufacturable', () => {
  const leakedId = manifest.wrecks[0].uniqueDrops[0].id;
  const report = audit({
    runs: 1,
    catalogs: {
      ...catalogs,
      blueprints: [
        ...BLUEPRINTS,
        { id: 'bp_fixture_unique_leak', outputs: { kind: 'weapon', id: leakedId, qty: 1 } },
      ],
    },
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.stationAcquisitionHits, [
    { id: leakedId, surfaces: ['manufacture:bp_fixture_unique_leak'] },
  ]);
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-purchasable'));
});

test('nested and multi-output blueprints are included in station acquisition enumeration', () => {
  const leakedId = manifest.wrecks[0].uniqueDrops[0].id;
  const report = audit({
    runs: 1,
    catalogs: {
      ...catalogs,
      blueprints: [
        ...BLUEPRINTS,
        {
          id: 'bp_fixture_nested_unique_leak',
          outputs: [{ kind: 'weapon', id: leakedId, qty: 1 }],
        },
      ],
    },
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.stationAcquisitionHits, [
    { id: leakedId, surfaces: ['manufacture:bp_fixture_nested_unique_leak'] },
  ]);
  assert.ok(report.issues.some((row) => row.code === 'audit.unique-purchasable'));
});

test('acceptance cannot be claimed with fewer than 1,000 seeds', () => {
  const report = audit({ runs: 999 });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((row) => row.code === 'audit.run-count'));
});
