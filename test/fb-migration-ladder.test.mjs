// FB-115 — one minimal fixture per save version walks the whole contiguous migration chain
// (v1→…→v14 today), the migrated result validates as a CURRENT_VERSION save, every step is
// re-runnable, and readSaveVersion rejects anything newer than current with the named reason.
// Run: node --test test/fb-migration-ladder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION, MIGRATIONS } from '../src/save/migrations.js';
import { readSaveVersion, runMigrations, save } from '../src/save/saveSystem.js';
import { COORDINATE_SCHEMA } from '../src/core/coordinates.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const FIXTURE_VERSIONS = Array.from({ length: CURRENT_VERSION }, (_, i) => i + 1);

function fixture(version) {
  const name = `fb-save-v${String(version).padStart(2, '0')}.json`;
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Ceres Belt origin — the v1–v8 fixtures keep sector-local positions that the v8→v9 step lifts
// into galactic-global space; v9+ fixtures store the same positions already global.
const CERES = sectorGlobalOrigin('sector_ceres_belt');
const GLOBAL_PLAYER_POS = { x: 512 + CERES.x, z: -256 + CERES.z };

test('every fixture version migrates to current, validates, and re-runs as a no-op', () => {
  assert.equal(CURRENT_VERSION, 14, 'ladder assumes v14; extend fixtures when the schema bumps');
  for (const version of FIXTURE_VERSIONS) {
    const envelope = fixture(version);
    assert.equal(envelope.fmt, 'spaceface-save');
    assert.equal(envelope.version, version);

    // The real prepare lane: format → version → preflight → checksum → migrate → normalize.
    const prepared = save._prepareEnvelopeString(JSON.stringify(envelope));
    assert.equal(prepared.ok, true, `v${version} fixture must prepare: ${prepared.reason || ''}`);
    assert.equal(prepared.version, version, 'prepare reports the version it migrated from');

    const data = prepared.data;
    // Fields each migration step seeds or normalizes, asserted on the final shape.
    assert.equal(typeof data.crafting.queues, 'object', `v${version}: crafting.queues`);
    assert.equal(typeof data.sectorSim.sectors, 'object', `v${version}: sectorSim.sectors`);
    assert.equal(data.combat.combatSchemaVersion, 1, `v${version}: combat bag`);
    assert.ok('route' in data.nav && 'waypoint' in data.nav, `v${version}: nav bag`);
    assert.ok(Array.isArray(data.lossLedger.entries), `v${version}: lossLedger`);
    assert.equal(data.aftermathWrecks.schemaVersion, 1, `v${version}: aftermathWrecks`);
    assert.equal(data.world.coordinateSchema, COORDINATE_SCHEMA, `v${version}: global coords`);
    assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
    assert.equal(data.world.frameOriginSeq, 0);
    assert.deepEqual(data.entities.player.pos, GLOBAL_PLAYER_POS,
      `v${version}: player position is galactic-global after migration`);
    assert.deepEqual(data.entities.persistent[0].pos, { x: 10 + CERES.x, z: 10 + CERES.z },
      `v${version}: persistent entity position is galactic-global`);
    assert.equal(data.careerOrigins.schemaId, 'spaceface.careerOrigins.v1');
    assert.equal(data.world.records.schemaId, 'spaceface.worldRecords.v1');
    assert.equal(data.world.resourceBodies.schemaId, 'spaceface.resourceBodyRecords.v2');
    assert.equal(typeof data.npcJobs.byId, 'object', `v${version}: npcJobs`);
    assert.equal(data.uiScreenMemory.v, 1, `v${version}: uiScreenMemory`);
    assert.equal(data.provenance.v, 1, `v${version}: provenance ledger`);
    assert.ok(data.entities.player && typeof data.entities.player === 'object', 'restorable player');

    // Re-running the chain on the migrated data is a no-op — the header contract.
    const rerun = clone(data);
    assert.equal(runMigrations(rerun, CURRENT_VERSION), true);
    assert.deepEqual(rerun, data, `v${version}: re-running migrations must not mutate`);

    // The migrated result validates as a current-version save through the same reader.
    const asCurrent = {
      fmt: 'spaceface-save',
      version: CURRENT_VERSION,
      savedAt: envelope.savedAt,
      checksum: fnv1a(JSON.stringify(data)),
      data,
    };
    const reprepared = save._prepareEnvelopeString(JSON.stringify(asCurrent));
    assert.equal(reprepared.ok, true, `v${version}: migrated data must validate as current`);
  }
});

test('the v1 fixture walks all thirteen steps and each step is re-runnable on its own output', () => {
  const data = clone(fixture(1).data);
  let v = 1;
  const seen = [];
  while (v < CURRENT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === v);
    assert.ok(step, `migration chain is missing a step from v${v}`);
    step.fn(data);
    const once = clone(data);
    step.fn(data);
    assert.deepEqual(data, once, `migration v${step.from}→v${step.to} must be idempotent`);
    seen.push(`v${step.from}→v${step.to}`);
    v = step.to;
  }
  assert.equal(v, CURRENT_VERSION);
  assert.equal(seen.length, CURRENT_VERSION - 1, 'thirteen contiguous steps v1→v14');
  assert.deepEqual(seen, Array.from({ length: CURRENT_VERSION - 1 }, (_, i) => `v${i + 1}→v${i + 2}`),
    'the chain is contiguous, one step per version, no gaps or skips');
});

test('readSaveVersion refuses versions above current with the named reason', () => {
  assert.deepEqual(readSaveVersion(CURRENT_VERSION + 1), { ok: false, reason: 'newer_version' });
  assert.deepEqual(readSaveVersion(CURRENT_VERSION + 1000), { ok: false, reason: 'newer_version' });
  assert.deepEqual(readSaveVersion(CURRENT_VERSION), { ok: true, version: CURRENT_VERSION });
  assert.equal(readSaveVersion(1).version, 1);
  for (const bad of [0, -3, 1.5, NaN, Infinity, '14', undefined, null]) {
    assert.deepEqual(readSaveVersion(bad), { ok: false, reason: 'bad_format' }, `version ${String(bad)}`);
  }
  // Integration: the same named reason surfaces through the prepare lane, before migration.
  const newer = { ...fixture(CURRENT_VERSION), version: CURRENT_VERSION + 1 };
  const prepared = save._prepareEnvelopeString(JSON.stringify(newer));
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, 'newer_version');
});
