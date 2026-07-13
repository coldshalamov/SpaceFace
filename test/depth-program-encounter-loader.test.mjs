import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ENCOUNTERS as COMPAT_ENCOUNTERS } from '../src/data/encounters.js';
import {
  ENCOUNTERS,
  ENCOUNTER_MODULES,
} from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { planEncounters } from '../src/systems/encounterDirector.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/depth-program-encounters-v0.json', import.meta.url),
  'utf8',
));

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function migrationBaselineCatalog() {
  const catalog = structuredClone(Object.fromEntries(
    fixture.order.map((id) => [id, ENCOUNTERS[id]]),
  ));
  // Claim defense deliberately became an externally requested set piece after the F2 migration.
  // Reconstruct that one pre-feature definition when proving the migration itself remained lossless.
  delete catalog.claim_threat.gates.externalOnly;
  delete catalog.claim_threat.motive;
  delete catalog.claim_threat.engagementTrigger;
  catalog.claim_threat.squad.formation = 'loose';
  return catalog;
}

test('generated encounter index is fresh and exposes one self-describing module per archetype', () => {
  const check = spawnSync(process.execPath, ['scripts/build-encounter-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(ENCOUNTER_MODULES.length >= fixture.order.length, true);
  assert.deepEqual(
    Object.keys(ENCOUNTERS).slice(0, fixture.order.length),
    fixture.order,
    'the migration-era catalogue remains the stable prefix as direct-only authored entries append',
  );
  assert.equal(ENCOUNTERS, COMPAT_ENCOUNTERS, 'compatibility surface must re-export the generated catalogue');

  for (const module of ENCOUNTER_MODULES) {
    assert.equal(Number.isInteger(module.encounterOrder), true);
    assert.equal(typeof module.trigger, 'object');
    assert.equal(module.default.id, module.trigger.id);
    for (const key of ['tier', 'deck', 'weight', 'zoneTypes', 'script', 'pressureCost', 'cooldownS', 'proximity', 'gates']) {
      assert.deepEqual(module.default[key], module.trigger[key], `${module.default.id}.${key} must come from its trigger header`);
    }
  }
});

test('encounter migration preserves every definition byte-for-byte under JSON serialization', () => {
  const migrated = migrationBaselineCatalog();
  assert.equal(hash(migrated), fixture.catalogHash);
  assert.deepEqual(
    Object.fromEntries(Object.entries(migrated).map(([id, value]) => [id, hash(value)])),
    fixture.shapeHashes,
  );
  const intentionalDrift = fixture.order.filter((id) => hash(ENCOUNTERS[id]) !== fixture.shapeHashes[id]);
  assert.deepEqual(intentionalDrift, ['claim_threat'], 'only the later claim-defense gate may differ from the F2 migration baseline');
  assert.equal(ENCOUNTERS.claim_threat.gates.externalOnly, true, 'claim defense is requested by the claims system, never ambient-scheduled');
});

test('encounter migration preserves the seeded 60-schedule matrix', () => {
  const migrationCatalog = migrationBaselineCatalog();
  const rows = [];
  for (const sectorId of fixture.scheduleMatrix.sectors) {
    const zones = zonesForSector(sectorId);
    for (const day of fixture.scheduleMatrix.days) {
      for (const seed of fixture.scheduleMatrix.seeds) {
        rows.push([sectorId, day, seed, planEncounters(seed, sectorId, day, zones, null, migrationCatalog)]);
      }
    }
  }
  assert.equal(hash(rows), fixture.scheduleMatrix.hash);
});
