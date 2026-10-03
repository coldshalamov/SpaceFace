// Board row 242 — FB-029, FB-032, FB-031, FB-128, FB-133.
// Twenty-four sectors do not share one traffic mix, and each has a body, a face, and a sentence.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { ALL_KILL_MACHINES } from '../src/data/environmentalMachinery.js';
import {
  FIELD_JOB_SIGNATURE_CRAFT,
  OCCUPATIONAL_JOB_KIND_BY_ROLE,
} from '../src/data/occupationalTrafficCraft.js';
import { pickNamedLaneContact } from '../src/data/laneContacts.js';
import { sectorCompositionFor } from '../src/data/sectorCompositions.js';
import {
  HELIOS_SECTOR_ID,
  differingPhysical,
  sectorPhysical,
} from '../src/data/sectorPhysical.js';
import { getSectorWayOfLife, SECTOR_WAY_OF_LIFE } from '../src/data/sectorWayOfLife.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { NPC_JOB_SIGNATURE_PROFILES, resolveFieldedCraftSignature } from '../src/render/npcJobSignatureVfx.js';
import { buildPostcard } from '../src/ui/sectorPostcard.js';
import { ambientCountForSector, traffic, trafficRoleMixForSector } from '../src/systems/traffic.js';

const SEED = 4242;
const MACHINE_IDS = new Set(ALL_KILL_MACHINES.map((machine) => machine.id));

function mixKey(sector) {
  return JSON.stringify(trafficRoleMixForSector(sector));
}

function roleCounts(sim) {
  const counts = {};
  for (const rec of sim.state.traffic.freighters || []) {
    const role = rec && rec.role || 'unknown';
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function enterSector(sector) {
  const sim = createSimulation({ seed: SEED, systems: [traffic] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = sector.id;
  const stations = sector.stations && sector.stations.length ? sector.stations : [{ id: 'station_test' }];
  stations.forEach((station, index) => {
    sim.spawn({
      type: 'station', team: 2, pos: { x: index * 800, z: 40 }, vel: { x: 0, z: 0 },
      radius: 40, hull: 1000, hullMax: 1000,
      data: { stationId: station.id, name: station.name || station.id },
    });
  });
  sim.bus.emit('sector:enter', { sectorId: sector.id, sector });
  return sim;
}

test('FB-029 seed 4242: 24 sectors do not share one traffic mix', () => {
  assert.equal(SECTORS.length, 24);
  const seen = new Map();
  for (const sector of SECTORS) {
    const key = mixKey(sector);
    assert.equal(seen.has(key), false, `${sector.id} shares a mix with ${seen.get(key)}`);
    seen.set(key, sector.id);
  }
  const scenic = ['sector_helios_prime', 'sector_tethys_junction', 'sector_veil_nebula'];
  for (const id of scenic) {
    const sector = SECTORS.find((row) => row.id === id);
    assert.ok(trafficRoleMixForSector(sector).tourist > 0, `${id} is scenic`);
  }
  const helios = SECTORS.find((row) => row.id === 'sector_helios_prime');
  assert.equal(ambientCountForSector(helios), 6, 'scenic flags must not raise the Helios ambient count');
  const samples = ['sector_helios_prime', 'sector_tethys_junction', 'sector_nyx_march'].map((id) => {
    const sector = SECTORS.find((row) => row.id === id);
    const sim = enterSector(sector);
    const counts = roleCounts(sim);
    sim.dispose();
    return counts;
  });
  assert.notDeepEqual(samples[0], samples[1]);
  assert.notDeepEqual(samples[1], samples[2]);
  const heliosSim = enterSector(helios);
  const tourist = (heliosSim.state.traffic.freighters || []).some((rec) => rec && rec.role === 'tourist');
  assert.equal(tourist, true, 'a scenic sector shows a tourist inside the first minutes');
  assert.ok((heliosSim.state.simTime || 0) < 600);
  heliosSim.dispose();
});

test('FB-032: every sector has one physical difference and its own arrangement', () => {
  assert.deepEqual(differingPhysical(HELIOS_SECTOR_ID), []);
  assert.equal(sectorPhysical('sector_ceres_belt').patrolResponse, 1.6);
  assert.equal(sectorPhysical('sector_vesta_forge').rockMass, 2.2);
  for (const sector of SECTORS) {
    assert.ok(sectorPhysical(sector.id), sector.id);
    const diff = differingPhysical(sector.id);
    if (sector.id === HELIOS_SECTOR_ID) assert.equal(diff.length, 0);
    else assert.equal(diff.length, 1, `${sector.id} differs on ${diff.join(',')}`);
    assert.ok(sectorCompositionFor(sector.id), `${sector.id} has an arrangement`);
  }
});

test('FB-031: the way-of-life sheet is complete and the arrival card carries the sentence', () => {
  assert.equal(SECTOR_WAY_OF_LIFE.length, 24);
  for (const sector of SECTORS) {
    const life = getSectorWayOfLife(sector.id);
    assert.ok(life, sector.id);
    assert.ok(life.sentence && life.sentence.length > 8);
    assert.ok(life.signatureToy === 'explicitly none' || MACHINE_IDS.has(life.signatureToy), life.signatureToy);
    assert.ok(zonesForSector(sector.id).length > 0, `${sector.id} already has a zone`);
  }
  const state = { meta: { seed: SEED }, ui: {} };
  const card = buildPostcard(state, 'sector_tethys_junction');
  assert.equal(card.wayOfLife, getSectorWayOfLife('sector_tethys_junction').sentence);
  assert.equal(card.signatureToy, 'tethys_weigh_clamp');
});

test('FB-128: every sector resolves one deterministic named face on seed 4242', () => {
  for (const sector of SECTORS) {
    const a = pickNamedLaneContact(sector.id, SEED);
    const b = pickNamedLaneContact(sector.id, SEED);
    assert.ok(a, sector.id);
    assert.equal(a.id, b.id);
    assert.equal(a.name, b.name);
  }
  const sim = createSimulation({ seed: SEED, systems: [traffic] });
  const sys = sim.registry.get('traffic');
  const sector = SECTORS.find((row) => row.id === 'sector_sedna_dark');
  sim.spawn({
    type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, hull: 800, hullMax: 800,
    data: { stationId: 'station_sedna' },
  });
  sys._ensureNamedLaneContact(sector.id, sector, sys._sectorStations());
  const named = (sim.state.traffic.freighters || []).filter((rec) => {
    const entity = sim.state.entities.get(rec.id);
    return entity && entity.data && entity.data.namedLaneContactId;
  });
  assert.equal(named.length, 1);
  const hull = sim.state.entities.get(named[0].id);
  assert.equal(hull.data.namedLaneContactId, 'lane_sedna_dark_tanker');
  assert.equal(hull.data.memoryHook, 'sedna-dry-rim');
  assert.ok(hull.data.hail);
  sim.dispose();
});

test('FB-133: tanker and cutter field on seed 4242 only where the station offers the service', () => {
  const tanker = FIELD_JOB_SIGNATURE_CRAFT.find((row) => row.craftId === 'volatiles_tanker');
  const cutter = FIELD_JOB_SIGNATURE_CRAFT.find((row) => row.craftId === 'inspection_cutter');
  assert.equal(tanker.fielded, true);
  assert.equal(cutter.fielded, true);
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.tanker, 'hauler');
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.customs, 'patrol');
  assert.equal(resolveFieldedCraftSignature('tanker', 'transit', true), NPC_JOB_SIGNATURE_PROFILES.heavy_burn);
  assert.equal(resolveFieldedCraftSignature('customs', 'hold', false), NPC_JOB_SIGNATURE_PROFILES.on_the_pin);

  const bare = { id: 'sector_no_service', security: 0.5, tier: 1, trafficPerMin: 12 };
  const fuel = { ...bare, id: 'sector_fuel', stations: [{ id: 'station_fuel', services: ['refuel'] }] };
  const scan = { ...bare, id: 'sector_scan', stations: [{ id: 'station_scan', services: ['scan'] }] };
  assert.equal(trafficRoleMixForSector(bare).tanker, 0);
  assert.equal(trafficRoleMixForSector(bare).customs, 0);
  assert.ok(trafficRoleMixForSector(fuel).tanker > 0);
  assert.equal(trafficRoleMixForSector(fuel).customs, 0);
  assert.equal(trafficRoleMixForSector(scan).tanker, 0);
  assert.ok(trafficRoleMixForSector(scan).customs > 0);

  const helios = SECTORS.find((row) => row.id === 'sector_helios_prime');
  const heliosMix = trafficRoleMixForSector(helios);
  assert.equal(heliosMix.tanker, 0);
  assert.equal(heliosMix.customs, 0);
  assert.equal(heliosMix.pirate, 0);

  const eunomia = SECTORS.find((row) => row.id === 'sector_eunomia_gulf');
  assert.equal(trafficRoleMixForSector(eunomia).tanker, 0);
  assert.equal(trafficRoleMixForSector(eunomia).customs, 0);

  const fueled = enterSector(fuel);
  const tankerRec = (fueled.state.traffic.freighters || []).find((rec) => rec.role === 'tanker');
  assert.ok(tankerRec, 'a refuel sector fields a tanker');
  const tankerHull = fueled.state.entities.get(tankerRec.id);
  const lines = tankerHull.data.cargoManifest && tankerHull.data.cargoManifest.lines || [];
  assert.ok(lines.some((line) => line.commodityId === 'cmdty_ice_water'));
  assert.equal((fueled.state.traffic.freighters || []).some((rec) => rec.role === 'customs'), false);
  fueled.dispose();

  const scanned = enterSector(scan);
  assert.ok((scanned.state.traffic.freighters || []).some((rec) => rec.role === 'customs'));
  assert.equal((scanned.state.traffic.freighters || []).some((rec) => rec.role === 'tanker'), false);
  scanned.dispose();

  const quiet = enterSector(bare);
  const roles = (quiet.state.traffic.freighters || []).map((rec) => rec.role);
  assert.equal(roles.includes('tanker'), false);
  assert.equal(roles.includes('customs'), false);
  quiet.dispose();
});
