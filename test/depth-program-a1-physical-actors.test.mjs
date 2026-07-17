// A1 physical Quiessence / Hush carriers — materialize on sector entry and drive Band proximity.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { world } from '../src/systems/world.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

function boot(seed) {
  const sim = createSimulation({ seed, systems: [spawnBudget, world, bandRadio] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui = state.ui || {};
  state.ui.docked = false;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    radius: 6,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

function entitiesWith(state, predicate) {
  const out = [];
  for (const entity of state.entities.values()) {
    if (entity && entity.alive !== false && predicate(entity)) out.push(entity);
  }
  return out;
}

test('Pallas Drift materializes a stamped Quiessence memorial and 17 census hulls', () => {
  const { sim, state, bus, player } = boot(91);
  const worldSys = sim.registry.get('world');
  worldSys.enterSector('sector_pallas_drift');

  const memorials = entitiesWith(state, (e) => e.data && e.data.poiId === 'poi_quiessence'
    && e.data.flavorTargetRef === 'landmark_c14_quiessence');
  assert.equal(memorials.length, 1, 'one Quiessence memorial POI');
  assert.equal(memorials[0].data.bandProximityRadius, 1600);

  const hulls = entitiesWith(state, (e) => e.data && e.data.memorialHull === true
    && e.data.flavorTargetRef === 'landmark_c14_quiessence');
  assert.equal(hulls.length, 17, 'seventeen dark freighter census markers');
  const indexes = new Set(hulls.map((e) => e.data.quiessenceShipIndex));
  assert.equal(indexes.size, 17);
  for (let i = 1; i <= 17; i += 1) assert.ok(indexes.has(i), `shipIndex ${i}`);

  // Place player on the memorial; Band should derive landmark proximity without bus injection.
  const memorial = memorials[0];
  player.pos.x = memorial.pos.x;
  player.pos.z = memorial.pos.z;
  state.world.currentSectorId = 'sector_pallas_drift';
  const band = sim.registry.get('bandRadio');
  bus.emit('band:tune', { channelId: 'concord_bulletin' });
  state.simTime = 1;
  band.update(1, state);
  assert.ok(state.bandRadio.proximitySources.landmark_quiessence >= 0.55,
    'nearby physical Quiessence drives Band landmark bleed');
  assert.equal(state.bandRadio.effectiveSourceId, 'landmark_quiessence');
});

test('Eunomia Gulf materializes a stamped Hush world and drives RF-void proximity', () => {
  const { sim, state, bus, player } = boot(92);
  const worldSys = sim.registry.get('world');
  worldSys.enterSector('sector_eunomia_gulf');

  const hush = entitiesWith(state, (e) => e.data && e.data.poiId === 'poi_hush'
    && e.data.flavorSourceId === 'planet_hush');
  assert.equal(hush.length, 1, 'one Hush physical carrier');
  assert.equal(hush[0].data.bandProximityRadius, 2400);
  assert.ok(hush[0].radius >= 100, 'Hush reads as a world-scale body');

  player.pos.x = hush[0].pos.x;
  player.pos.z = hush[0].pos.z;
  state.world.currentSectorId = 'sector_eunomia_gulf';
  const band = sim.registry.get('bandRadio');
  bus.emit('band:tune', { channelId: 'concord_bulletin' });
  state.simTime = 1;
  band.update(1, state);
  assert.ok(state.bandRadio.proximitySources.planet_hush >= 0.6,
    'nearby physical Hush drives Band RF-void override');
  assert.equal(state.bandRadio.effectiveSourceId, 'planet_hush');

  // Leave the falloff envelope — proximity clears without injection.
  player.pos.x = hush[0].pos.x + 8000;
  player.pos.z = hush[0].pos.z;
  state.simTime = 2;
  band.update(1, state);
  assert.equal(state.bandRadio.proximitySources.planet_hush, undefined);
});

test('Quiessence memorial uses galactic-global placement from sector-local authored pos', () => {
  const { sim, state } = boot(93);
  sim.registry.get('world').enterSector('sector_pallas_drift');
  const memorial = entitiesWith(state, (e) => e.data && e.data.poiId === 'poi_quiessence')[0];
  assert.ok(memorial);
  const expected = sectorLocalToGlobalForSector({ x: -1080, z: 540 }, 'sector_pallas_drift');
  assert.ok(Math.hypot(memorial.pos.x - expected.x, memorial.pos.z - expected.z) < 1e-6);
});
