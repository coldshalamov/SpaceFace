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
import { AUTHORED_PLACE_ZONES } from '../src/data/authoredPlaces.js';
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

// The schedule matrix is a proof about the MIGRATION — that splitting the encounter catalogue into
// authored modules did not move a single planned item. `planEncounters` takes its zone list as an
// argument, so the proof has to hold that argument at the migration-era value the same way
// `migrationBaselineCatalog()` holds the catalogue at its migration-era value; otherwise the hash
// silently absorbs world content and stops saying anything about the migration.
//
// It did absorb some. `src/data/sectorZones.js` now runs its authored map through
// `appendAuthoredZones` (added by 9462634f, PQ-013 "planetary sling, skim, harvest, reentry
// vertical"), which appends `zone_tethys_driftmark` (anomaly_deep) and `zone_tethys_anvil`
// (planetary_mass) to sector_tethys_junction. That is an intended content addition — a new place in
// the world, arriving through the additive seam built for it — and it changes what `pickZoneFor`
// can draw. Measured on master 2026-07-27: with the authored zones in, the matrix hashes
// eba685c5…; with them held out it hashes 332c517a…, the fixture value, exactly. 5 of the 60 rows
// moved and all 5 are sector_tethys_junction (seeds 7/47/1234 on day 0, seed 1 on days 1 and 2).
// No other sector moved, so nothing else in the planner's inputs drifted.
//
// Holding the authored places out is therefore reconstruction, not relaxation: the hash still pins
// the full planner output across all 60 sector-day-seed combinations, and a change to the core
// authored zones, to the planner, or to the catalogue still fails it. The list is derived from
// AUTHORED_PLACE_ZONES rather than hard-coded so the next authored place does not re-break it.
const AUTHORED_PLACE_ZONE_IDS = new Set(
  Object.values(AUTHORED_PLACE_ZONES).flat().map((zone) => zone.id),
);

function migrationBaselineZones(sectorId) {
  return zonesForSector(sectorId).filter((zone) => !AUTHORED_PLACE_ZONE_IDS.has(zone.id));
}

test('encounter migration preserves the seeded 60-schedule matrix', () => {
  const migrationCatalog = migrationBaselineCatalog();
  const rows = [];
  for (const sectorId of fixture.scheduleMatrix.sectors) {
    const zones = migrationBaselineZones(sectorId);
    for (const day of fixture.scheduleMatrix.days) {
      for (const seed of fixture.scheduleMatrix.seeds) {
        rows.push([sectorId, day, seed, planEncounters(seed, sectorId, day, zones, null, migrationCatalog)]);
      }
    }
  }
  assert.equal(hash(rows), fixture.scheduleMatrix.hash);

  // The reconstruction above must stay honest: whatever the live world adds may only move rows in
  // sectors that actually received an authored place. If a core zone, the planner, or the catalogue
  // drifts, it moves a row somewhere else and this fails — the hold-out cannot hide it.
  const sectorsWithAuthoredPlaces = new Set(Object.keys(AUTHORED_PLACE_ZONES));
  const movedSectors = new Set();
  for (const sectorId of fixture.scheduleMatrix.sectors) {
    const live = zonesForSector(sectorId);
    const baseline = migrationBaselineZones(sectorId);
    for (const day of fixture.scheduleMatrix.days) {
      for (const seed of fixture.scheduleMatrix.seeds) {
        const a = planEncounters(seed, sectorId, day, live, null, migrationCatalog);
        const b = planEncounters(seed, sectorId, day, baseline, null, migrationCatalog);
        if (hash(a) !== hash(b)) movedSectors.add(sectorId);
      }
    }
  }
  const unexplained = [...movedSectors].filter((id) => !sectorsWithAuthoredPlaces.has(id));
  assert.deepEqual(unexplained, [],
    'only sectors carrying an authored place may differ between the live and migration-era zone sets');
});
