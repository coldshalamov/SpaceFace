import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { planZoneSpawns, zonesForSector } from '../src/data/sectorZones.js';
import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { world } from '../src/systems/world.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

// ceres-ambush-pack-dart — the first fight a new pilot goes LOOKING for.
//
// The first trade contract routes the player to station_ceres straight past the Belt-Shadow
// ambush lane, so that lane is the opener's true sequel. Before this unit it fielded 1-2
// generic pirates (presence size [1,2] starved by enemyDensity 0.18 → a 2-4 ship ambient grant
// split round-robin across three zones) and the roster's detonator_dart — the tether-able
// flying bomb its own card sells — never appeared anywhere on the tier-1 starter ring. The
// authored fix is data-only: the zone presence carries a [3,4] pack with the dart weighted
// 2-of-4, and the Ceres density funds the grant (planZoneSpawns hands every zoned want its
// base slot before the largest want gets its third, so a pack of >=3 needs a >=5-7 ship pool).
// The encounterDirector change is none: the throughline ambush already adopts exactly this
// squad (item.ships stays [], the durable-record contract stands).
const CERES = 'sector_ceres_belt';
const HELIOS = 'sector_helios_prime';
const AMBUSH_ZONE = 'zone_ceres_ambush';
const SEED = 4242;
const AMBIENT_HEADROOM = 8; // world.js caps the ambient reservation at the same headroom

function ceresSector() {
  return SECTORS.find((sector) => sector.id === CERES);
}

/** Every grant the authored density can produce via world.js's count formula, in [lo,hi]. */
function ambientGrantRange(sector) {
  const density = sector.enemyDensity || 0;
  const di = dangerIndex(sector);
  const countAt = (u) => Math.min(10, Math.round(density * 8 + di * 2 + u * 1.5));
  const lo = countAt(0);
  const hi = countAt(1);
  const grants = [];
  for (let count = lo; count <= hi; count++) grants.push(Math.min(count, AMBIENT_HEADROOM));
  return [...new Set(grants)];
}

test('the authored Ceres density funds a 3+ ambush pack with a detonator dart at every attainable grant', () => {
  const sector = ceresSector();
  const grants = ambientGrantRange(sector);
  assert.deepEqual(grants, [7, 8], 'density 0.73 + dangerIndex 0.34 derives a 7-8 ship ambient grant');

  for (const grant of grants) {
    // The sim's own per-sector stream derivation (world materialize seeds
    // mulberry32(hash32(seed, sectorId, epoch))): a fixed 4242-seeded fixture stream.
    const rng = mulberry32(hash32(SEED, CERES, 0));
    const plan = planZoneSpawns(CERES, grant, sector.enemyLevel, rng);
    const pack = plan.filter((intent) => intent.zoneId === AMBUSH_ZONE);
    assert.ok(pack.length >= 3, `grant ${grant}: ambush fields ${pack.length} of the promised pack`);
    assert.ok(
      pack.some((intent) => intent.archetypeId === 'detonator_dart'),
      `grant ${grant}: the pack carries at least one detonator dart`,
    );
    assert.deepEqual(
      [...new Set(pack.map((intent) => intent.squadId))],
      [AMBUSH_ZONE],
      `grant ${grant}: the whole pack shares the zone squadId the throughline ambush adopts`,
    );
  }

  // The authored presence itself stays the readable contract: a [3,4] pack, dart weighted.
  const zone = zonesForSector(CERES).find((entry) => entry.id === AMBUSH_ZONE);
  assert.deepEqual(zone.presence.size, [3, 4]);
  assert.deepEqual(zone.presence.archetypes, [
    'reaver_pirate', 'wasp_swarmer', 'detonator_dart', 'detonator_dart',
  ]);
});

test('a focused sim entering Ceres on seed 4242 materializes the squad and the throughline cohort counts 3+', () => {
  const sim = createSimulation({ seed: SEED, systems: [world, encounterDirector] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    // The player is still standing in Helios (galactic space) when Ceres materializes — the
    // ordinary first-visit order (materialize runs before _placePlayer), so the zone-hostile
    // player-clearance cannot suppress the belt-shadow squad on the route the first trade
    // contract walks.
    const player = sim.spawn({
      type: 'ship', team: 0, alive: true, radius: 8, mass: 40,
      pos: { x: -2388, z: 1592 }, vel: { x: 0, z: 0 }, data: {},
    });
    state.playerId = player.id;

    sim.registry.get('world').enterSector(CERES, { fromSectorId: HELIOS });

    const squad = [...state.entities.values()].filter((entity) => entity
      && entity.alive !== false
      && entity.data?.ai?.zoneId === AMBUSH_ZONE);
    assert.ok(squad.length >= 3, `the live belt-shadow squad counts ${squad.length}`);
    assert.ok(
      squad.some((entity) => entity.data.silhouette === 'detonator_dart'),
      'the live squad includes the detonator dart (the roster\'s flying bomb)',
    );
    for (const entity of squad) {
      assert.equal(entity.data.ai.squadId, AMBUSH_ZONE);
      assert.match(String(entity.data.worldRecordId || ''), /^wr_npc_/,
        'every member carries the durable record the adoption contract requires');
    }

    // The squad clusters in the Throughline interaction band the crossing ambush springs from.
    const throughlineGlobal = sectorLocalToGlobalForSector(ZONE_CERES_THROUGHLINE.center, CERES);
    for (const entity of squad) {
      const distance = Math.hypot(entity.pos.x - throughlineGlobal.x, entity.pos.z - throughlineGlobal.z);
      assert.ok(distance >= 127 && distance <= 163, `member sits ${distance.toFixed(1)} WU from the Throughline centre`);
    }

    // The throughline ambush adopts the durable squad whole — no director spawn, all armed.
    const director = sim.registry.get('encounterDirector');
    const cohort = director._ceresActivityAmbushCohort();
    assert.ok(cohort.length >= 3, `the authored throughline ambush cohort counts ${cohort.length}`);
    assert.deepEqual(cohort.map((entity) => entity.id).sort(), squad.map((entity) => entity.id).sort(),
      'the cohort is exactly the materialized squad');
    for (const entity of squad) {
      assert.equal(entity.data.ai.passive, true, 'adopted members wait armed, not firing');
      assert.equal(entity.data.ai.roe, 'hold_fire');
      assert.equal(entity.data.ai.ceresActivityAmbushPhase, 'armed');
    }
    // The authored ambush is seeded ARMED (the squad parked passive around the band); the
    // pending item itself queues on the physical outer-to-outer crossing, exactly as the
    // director contract frozen in ceres-activity-ambush-director.test.mjs specifies.
    assert.ok(!state.encounterDirector.stats.ceresActivityAmbush
      || state.encounterDirector.stats.ceresActivityAmbush.phase !== 'done',
    'a fresh sector entry never carries a completed one-shot ambush phase');
  } finally {
    sim.dispose();
  }
});
