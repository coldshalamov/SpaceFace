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
  // The first-hour difficulty pass later kept elite and multi-squad ambient encounters out of the
  // tier-1 Helios neighborhood. Remove those live admission gates when reconstructing the earlier
  // module-split baseline; this test proves that migration, not that gameplay can never evolve.
  for (const id of ['pirate_toll', 'ambush_snare', 'named_hunter', 'distress_call']) {
    delete catalog[id].gates.minSectorTier;
  }
  // The live swarm-density pass later raised these ranges and split guaranteed anchors from light
  // pools. Remove the live anchor field when reconstructing the migration-era random pools.
  // Reconstruct the exact migration-era compositions here; the fixture remains an immutable proof
  // of the module split rather than becoming a golden for current gameplay tuning.
  catalog.ambush_snare.squad.archetypes = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
  delete catalog.ambush_snare.squad.anchorArchetype;
  catalog.ambush_snare.squad.size = [2, 4];
  catalog.claim_threat.squad.archetypes = ['wasp_swarmer', 'reaver_pirate'];
  delete catalog.claim_threat.squad.anchorArchetype;
  catalog.claim_threat.squad.size = [2, 2];
  catalog.distress_call.genuine.threat.archetypes = ['reaver_pirate', 'wasp_swarmer'];
  delete catalog.distress_call.genuine.threat.anchorArchetype;
  catalog.distress_call.genuine.threat.size = [1, 2];
  catalog.distress_call.bait.squad.archetypes = ['reaver_pirate', 'corsair_raider', 'wasp_swarmer'];
  delete catalog.distress_call.bait.squad.anchorArchetype;
  catalog.distress_call.bait.squad.size = [3, 4];
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
  assert.deepEqual(
    intentionalDrift,
    ['pirate_toll', 'ambush_snare', 'claim_threat', 'named_hunter', 'distress_call'],
    'only the later claim-defense and first-hour admission gates may differ from the F2 migration baseline',
  );
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
// PQ-020 later reshaped the existing `zone_ceres_belt` from center (300, -300), radius 1100
// to center (500, -700), radius 850 while adding its route-harness place. That is legitimate live
// world evolution too, but unlike an appended place it must be explicitly reconstructed here.
//
// Holding the authored places out is therefore reconstruction, not relaxation: the hash still pins
// the full planner output across all 60 sector-day-seed combinations, and a change to the core
// authored zones, to the planner, or to the catalogue still fails it. The list is derived from
// AUTHORED_PLACE_ZONES rather than hard-coded so the next authored place does not re-break it.
//
// Two later planner/enemy stamps also land on every planned item without moving the schedule
// identity (shape, zone, delay, archetypes, positions). Measured 2026-08-23: stripping them restores
// 332c517a… exactly, while live-vs-baseline still only moves Ceres (Throughline Weigh) and Tethys
// (Driftmark + Anvil). Reconstruct them here the same way the catalogue gates are reconstructed.
const AUTHORED_PLACE_ZONE_IDS = new Set(
  Object.values(AUTHORED_PLACE_ZONES).flat().map((zone) => zone.id),
);

const MIGRATION_ZONE_OVERRIDES = Object.freeze({
  zone_ceres_belt: Object.freeze({
    sectorId: 'sector_ceres_belt',
    center: Object.freeze({ x: 300, z: -300 }),
    radius: 1100,
  }),
});

const MIGRATION_ERA_SHIP_DOCTRINE = Object.freeze({
  reaver_pirate: 'tether_control_raider',
  corsair_raider: 'tether_control_raider',
});

function migrationBaselineZones(sectorId) {
  return zonesForSector(sectorId)
    .filter((zone) => !AUTHORED_PLACE_ZONE_IDS.has(zone.id))
    .map((zone) => {
      const override = MIGRATION_ZONE_OVERRIDES[zone.id];
      if (!override) return zone;
      return {
        ...zone,
        center: { ...override.center },
        radius: override.radius,
      };
    });
}

function migrationBaselinePlan(plan) {
  return plan.map((item) => {
    const copy = { ...item };
    delete copy.predation;
    copy.ships = item.ships.map((ship) => {
      const next = { ...ship };
      const doctrine = MIGRATION_ERA_SHIP_DOCTRINE[ship.archetype];
      if (doctrine !== undefined) next.combatDoctrineId = doctrine;
      return next;
    });
    return copy;
  });
}

test('encounter migration preserves the seeded 60-schedule matrix', () => {
  const migrationCatalog = migrationBaselineCatalog();
  const rows = [];
  for (const sectorId of fixture.scheduleMatrix.sectors) {
    const zones = migrationBaselineZones(sectorId);
    for (const day of fixture.scheduleMatrix.days) {
      for (const seed of fixture.scheduleMatrix.seeds) {
        rows.push([sectorId, day, seed, migrationBaselinePlan(planEncounters(seed, sectorId, day, zones, null, migrationCatalog))]);
      }
    }
  }
  assert.equal(hash(rows), fixture.scheduleMatrix.hash);

  // The reconstruction above must stay honest: whatever the live world adds may only move rows in
  // sectors that actually received an authored place. If a core zone, the planner, or the catalogue
  // drifts, it moves a row somewhere else and this fails — the hold-out cannot hide it.
  const sectorsWithExpectedZoneDrift = new Set([
    ...Object.keys(AUTHORED_PLACE_ZONES),
    ...Object.values(MIGRATION_ZONE_OVERRIDES).map((override) => override.sectorId),
  ]);
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
  const unexplained = [...movedSectors].filter((id) => !sectorsWithExpectedZoneDrift.has(id));
  assert.deepEqual(unexplained, [],
    'only sectors with an authored place or explicit migration-era geometry may differ from live zones');
});
