// PQ-153.01 — hazard geometry per sector. A blind reviewer names the sector
// from motion (headless). Seed 15310. Never hazard type `radiation`: belts
// are `nebula`, currents are `debris` / `debris_current`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import {
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { ZONE_TETHYS_ANVIL } from '../src/data/authoredPlaces.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_MINES,
  PALLAS_REEF_SECTOR_ID,
  VESTA_WEATHER_SECTOR_ID,
  WEATHER_VOLUMES,
  cinderSluicePhase,
  pallasReefPhase,
  weatherPhase,
  weatherScanScale,
  weatherVolumesForSector,
} from '../src/data/environmentalMachinery.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_WAY_OF_LIFE, WAY_OF_LIFE_SECTOR_IDS } from '../src/data/sectorWayOfLife.js';
import { zonesForSector, ZONE_TYPES } from '../src/data/sectorZones.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';

const LONG = { timeout: 180_000 };
const SEED = 15310;
const SURGE_S = 2.4;
const PROFILE = { mass: 8, type: 'pickup', marked: false };
const PLAYER_HULL_ID = 'ship_kestrel';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';
const VESTA = 'sector_vesta_forge';
const PALLAS = 'sector_pallas_drift';
const SKER = 'sector_sker_haven';

const STORM = WEATHER_VOLUMES.find((row) => row.id === 'vesta_storm_lane');
const BELT = WEATHER_VOLUMES.find((row) => row.id === 'vesta_radiation_belt');

function sector(id) {
  return SECTORS.find((row) => row.id === id);
}

function hazardTypes(id) {
  return (sector(id).hazards || []).map((row) => row.type);
}

function fightZones(id) {
  return zonesForSector(id).filter((row) => ZONE_TYPES[row.type] && ZONE_TYPES[row.type].hazard);
}

function alongPoint(field, along, across = 0) {
  const dir = field.dir || { x: 1, z: 0 };
  const perp = { x: -dir.z, z: dir.x };
  return {
    x: field.center.x + dir.x * along + perp.x * across,
    z: field.center.z + dir.z * along + perp.z * across,
  };
}

function mag(ax, az) {
  return Math.hypot(ax, az);
}

function envCount(state) {
  return ((state.fields && state.fields.snapshot) || [])
    .filter((row) => row && (row.tag === 'environmental' || row.tag === 'external')).length;
}

function kernelFingerprints() {
  const sluice = normalizeField({ ...CINDER_SLUICE_FIELD, strength: CINDER_SLUICE_FIELD.strength });
  const sluiceAccel = sampleFieldAcceleration(
    alongPoint(CINDER_SLUICE_FIELD, 90, 0), { x: 0, z: 0 }, [sluice], SURGE_S, PROFILE, { ax: 0, az: 0 },
  );
  const sluiceAlong = sluiceAccel.ax * CINDER_SLUICE_FIELD.dir.x + sluiceAccel.az * CINDER_SLUICE_FIELD.dir.z;

  const planet = normalizeField({
    id: 'planet_tethys_anvil_pull',
    kind: 'well',
    center: { x: 0, z: 0 },
    radius: PLANET_SITE.field.radius,
    strength: PLANET_SITE.field.strength,
    falloff: PLANET_SITE.field.falloff,
    innerRadius: PLANET_SITE.field.innerRadius,
    innerSoft: PLANET_SITE.field.innerSoft,
  });
  const inside = sampleFieldAcceleration({ x: 400, z: 0 }, { x: 0, z: 0 }, [planet], SURGE_S, PROFILE, { ax: 0, az: 0 });
  const sling = sampleFieldAcceleration({ x: 1200, z: 0 }, { x: 0, z: 0 }, [planet], SURGE_S, PROFILE, { ax: 0, az: 0 });

  const stormField = normalizeField({ ...STORM.field, strength: STORM.field.strength });
  const beltField = normalizeField({ ...BELT.field, strength: BELT.field.strength });
  const stormPos = alongPoint(STORM.field, 90, 36);
  const vel = { x: STORM.field.dir.x * 140, z: STORM.field.dir.z * 140 };
  const vacuum = projectFieldTrajectory(stormPos, vel, [], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: SURGE_S,
  });
  const bent = projectFieldTrajectory(stormPos, vel, [stormField], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: SURGE_S,
  });
  const beltPos = { x: BELT.field.center.x + 120, z: BELT.field.center.z };
  const beltAccel = sampleFieldAcceleration(beltPos, { x: 0, z: 0 }, [beltField], SURGE_S, PROFILE, { ax: 0, az: 0 });

  const reef = normalizeField({ ...PALLAS_REEF_FIELD, strength: PALLAS_REEF_FIELD.strength });
  const reefAccel = sampleFieldAcceleration(
    alongPoint(PALLAS_REEF_FIELD, 90, 0), { x: 0, z: 0 }, [reef], SURGE_S, PROFILE, { ax: 0, az: 0 },
  );
  const reefAlong = reefAccel.ax * PALLAS_REEF_FIELD.dir.x + reefAccel.az * PALLAS_REEF_FIELD.dir.z;

  return {
    heliosAccel: 0,
    ceresSluiceAlong: sluiceAlong,
    tethysInsideWell: mag(inside.ax, inside.az),
    tethysSlingWell: mag(sling.ax, sling.az),
    vestaStormBend: Math.hypot(bent.end.x - vacuum.end.x, bent.end.z - vacuum.end.z),
    vestaBeltMag: mag(beltAccel.ax, beltAccel.az),
    vestaScan: weatherScanScale(VESTA_WEATHER_SECTOR_ID, beltPos, SURGE_S),
    pallasReefAlong: reefAlong,
    pallasMines: PALLAS_REEF_MINES.length,
    skerDense: hazardTypes(SKER).filter((type) => type === 'dense_asteroid').length,
  };
}

function nameFromMotion(fp) {
  const names = [];
  if (fp.heliosAccel === 0) names.push({ id: HELIOS, label: 'calm-zero-field' });
  if (fp.ceresSluiceAlong > 20) names.push({ id: CERES, label: 'cone-current-sluice' });
  if (fp.tethysInsideWell < 1 && fp.tethysSlingWell > 8) names.push({ id: TETHYS, label: 'annular-gravity-well' });
  if (fp.vestaStormBend > 8 && fp.vestaBeltMag > 8 && fp.vestaScan < 1) {
    names.push({ id: VESTA, label: 'sheet-storm-plus-nebula-well' });
  }
  if (fp.pallasReefAlong > 20 && fp.pallasMines >= 5) names.push({ id: PALLAS, label: 'cone-current-reef-mines' });
  if (fp.skerDense >= 2) names.push({ id: SKER, label: 'dense-rock-plus-bounty-wrecks' });
  return names;
}

test('PQ-153.01 the six already carry distinct authored situations matching the table', () => {
  assert.deepEqual([...WAY_OF_LIFE_SECTOR_IDS], [HELIOS, CERES, TETHYS, VESTA, PALLAS, SKER]);

  assert.deepEqual(hazardTypes(HELIOS), []);
  assert.equal(fightZones(HELIOS).length, 0);
  assert.equal(weatherVolumesForSector(HELIOS).length, 0);

  assert.ok(hazardTypes(CERES).includes('dense_asteroid'));
  assert.equal(CINDER_SLUICE_SECTOR_ID, CERES);
  assert.equal(KILL_MACHINES.length, 3);

  const anvil = fightZones(TETHYS).find((row) => row.id === 'zone_tethys_anvil');
  assert.ok(anvil, 'The Anvil is an authored planetary_mass zone');
  assert.equal(anvil.type, 'planetary_mass');
  assert.equal(ZONE_TETHYS_ANVIL.id, 'zone_tethys_anvil');
  assert.equal(PLANET_SITE.zoneId, 'zone_tethys_anvil');
  assert.equal(PLANET_SITE.sectorId, TETHYS);

  const weather = weatherVolumesForSector(VESTA);
  assert.deepEqual(weather.map((row) => `${row.role}:${row.hazardType}:${row.field.kind}`).sort(), [
    'radiation_belt:nebula:well',
    'storm:debris_current:sheet',
  ]);
  assert.ok(!weather.some((row) => row.hazardType === 'radiation'));
  assert.ok(!WEATHER_VOLUMES.some((row) => row.hazardType === 'radiation'));
  assert.ok(!KILL_MACHINES.some((row) => row.hazardType === 'radiation'));

  assert.equal(PALLAS_REEF_SECTOR_ID, PALLAS);
  assert.equal(PALLAS_REEF_FIELD.kind, 'cone');
  assert.equal(PALLAS_REEF_MINES.length, 5);

  assert.equal(hazardTypes(SKER).filter((type) => type === 'dense_asteroid').length, 2);
  assert.ok((sector(SKER).pois || []).some((poi) => poi.id === 'poi_bounty' && poi.type === 'wreck'));
  assert.ok(UNIQUE_WRECKS.some((wreck) => wreck.id === 'wreck_nestbreaker' && wreck.sectorId === SKER));

  for (const row of SECTOR_WAY_OF_LIFE) {
    assert.equal(typeof row.hazardGeometry, 'string');
    assert.ok(row.hazardGeometry.length > 8);
  }
});

test('PQ-153.01 seed 15310 a blind reviewer names each sector from motion', LONG, async () => {
  const fp = kernelFingerprints();
  const named = nameFromMotion(fp);
  console.log([
    `PQ-153.01 seed=${SEED}`,
    `heliosAccel=${fp.heliosAccel}`,
    `ceresSluiceAlong=${fp.ceresSluiceAlong.toFixed(1)}`,
    `tethysInside=${fp.tethysInsideWell.toFixed(1)}`,
    `tethysSling=${fp.tethysSlingWell.toFixed(1)}`,
    `vestaBend=${fp.vestaStormBend.toFixed(1)}`,
    `vestaBelt=${fp.vestaBeltMag.toFixed(1)}`,
    `vestaScan=${fp.vestaScan}`,
    `pallasAlong=${fp.pallasReefAlong.toFixed(1)}`,
    `pallasMines=${fp.pallasMines}`,
    `skerDense=${fp.skerDense}`,
    `named=${named.map((row) => row.label).join(',')}`,
  ].join(' '));

  assert.equal(STORM.hazardType, 'debris_current');
  assert.equal(BELT.hazardType, 'nebula');
  assert.equal(named.length, 6, 'six distinct motion fingerprints');
  assert.deepEqual(named.map((row) => row.id), [...WAY_OF_LIFE_SECTOR_IDS]);
  const labels = named.map((row) => row.label);
  assert.equal(new Set(labels).size, 6, 'no two sectors share a motion name');

  const previousFields = FIELD_FLAGS.enabled;
  const previousPlanet = PLANET_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  PLANET_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: SEED,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      planetRuntime,
      terrainAnchors,
      'physics',
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: { x: CINDER_SLUICE_FIELD.center.x, z: CINDER_SLUICE_FIELD.center.z },
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  try {
    const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
    host.state.sites = host.state.sites || { worldById: {}, worldOrder: [] };
    host.state.sites.worldById[CINDER_SLUICE_SITE_ID] = createWorldSiteRecord(manifest, { tick: 0 });
    host.state.world = host.state.world || {};
    const fsys = host.runtime.getSystem('fields');

    const hold = (sectorId) => {
      host.state.world.currentSectorId = sectorId;
      host.state.simTime = SURGE_S;
    };

    hold(HELIOS);
    host.step(2, { before({ state }) { state.world.currentSectorId = HELIOS; state.simTime = SURGE_S; } });
    assert.equal(envCount(host.state), 0, 'Helios registers no fight field');

    hold(CERES);
    host.step(2, { before({ state }) { state.world.currentSectorId = CERES; state.simTime = SURGE_S; } });
    assert.equal(cinderSluicePhase(host.state.sites.worldById[CINDER_SLUICE_SITE_ID], SURGE_S).phase, 'surge');
    assert.equal(fsys.hasExternal(CINDER_SLUICE_FIELD.id), true, 'Ceres sluice is live');
    assert.ok(
      KILL_MACHINES.some((machine) => fsys.hasExternal(machine.fields[0].id)),
      'Ceres yard machines register',
    );

    hold(PALLAS);
    host.step(2, { before({ state }) { state.world.currentSectorId = PALLAS; state.simTime = SURGE_S; } });
    assert.equal(pallasReefPhase(SURGE_S).phase, 'surge');
    assert.equal(fsys.hasExternal(PALLAS_REEF_FIELD.id), true, 'Pallas reef current is live');
    const mines = (host.state.entityList || []).filter((entity) => entity && entity.data && entity.data.reefMine);
    assert.equal(mines.length, PALLAS_REEF_MINES.length, 'Pallas reef mines materialize');

    hold(VESTA);
    host.step(2, { before({ state }) { state.world.currentSectorId = VESTA; state.simTime = SURGE_S; } });
    assert.equal(weatherPhase(STORM, SURGE_S).phase, 'surge');
    assert.equal(fsys.hasExternal(STORM.field.id), true, 'Vesta storm sheet is live');
    assert.equal(fsys.hasExternal(BELT.field.id), true, 'Vesta nebula belt is live');

    hold(TETHYS);
    host.step(3, { before({ state }) { state.world.currentSectorId = TETHYS; state.simTime = SURGE_S; } });
    assert.equal(host.state.planet && host.state.planet.active, true, 'Tethys Anvil registers');
    assert.equal(host.state.planet.zoneId, 'zone_tethys_anvil');
    assert.equal(fsys.hasExternal(host.state.planet.fieldId), true, 'Anvil well is in the kernel');

    hold(SKER);
    host.step(2, { before({ state }) { state.world.currentSectorId = SKER; state.simTime = SURGE_S; } });
    assert.equal(envCount(host.state), 0, 'Sker has no current/well; the situation is rock and wrecks');

    const proof = host.proof();
    console.log(`PQ-153.01 seed=${SEED} backend=${proof.backend} live=helios0/ceresSluice/pallasReef+${mines.length}mines/vestaStormBelt/tethysAnvil/skerRock`);
    assert.equal(proof.backend, 'rapier-dynamic');
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
    PLANET_FLAGS.enabled = previousPlanet;
  }
});
