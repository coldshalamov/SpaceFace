import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ORCUS_ANCHOR } from '../src/data/anchorLandmark.js';
import { ORCUS_GRAVITY_EDDY } from '../src/data/anomalySites.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';

const DT = 1 / 60;

function playerSpec() {
  return {
    type: 'ship', team: 0, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 7, mass: 28, hull: 300, hullMax: 300,
    flags: { docked: false },
    physicsBody: {
      schemaVersion: 1, radius: 7, mass: 28, inertiaY: 240,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {},
  };
}

async function boot(seed = 250250) {
  const sim = createSimulation({
    seed,
    systems: [economy, world, anomalyRuntime, fields, physics],
    // World is the event/materialization owner here; the live force pass remains
    // anomalyRuntime -> fields -> physics, matching production order.
    updateOrder: [anomalyRuntime, fields, physics],
  });
  const worldOwner = sim.registry.get('world');
  worldOwner.newGame();
  const player = sim.spawn(playerSpec());
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  sim.state.player.credits = 2_000;
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(sim.state), true,
    'the default Rapier owner starts for the physical route');
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    worldOwner,
    fieldsOwner: sim.registry.get('fields'),
    cleanup() {
      if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') {
        physicsOwner._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

function liveStation(state) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'station' && entity.data?.stationId === ORCUS_ANCHOR.stationId);
}

function spawnProbe(sim, anchor) {
  return sim.spawn({
    type: 'projectile', team: 7, collides: true,
    pos: { x: anchor.x + 210, z: anchor.z },
    vel: { x: 0, z: 88 }, rot: Math.PI * 0.5,
    radius: 1.2, mass: 0.2, hull: 1, hullMax: 1,
    physicsBody: {
      schemaVersion: 1, radius: 1.2, mass: 0.2, inertiaY: 0.1,
      dynamic: true, ccd: true, material: 'projectile', revision: 0,
    },
    data: { kind: 'anchor_slingshot_probe' },
  });
}

test('Kepler rumor leads to one station-scale black market at the canonical Orcus well', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const route = await boot();
  try {
    const sector = SECTORS.find((candidate) => candidate.id === ORCUS_ANCHOR.sectorId);
    const catalogStation = sector?.stations.find((candidate) => candidate.id === ORCUS_ANCHOR.stationId);
    assert.ok(catalogStation, 'The Anchor is admitted to the ordinary sector catalog');
    assert.equal(catalogStation.type, 'blackmarket');
    assert.ok(catalogStation.services.includes('black_market'));

    const offer = frontierRumorOffer(route.state, ORCUS_ANCHOR.sourceStationId);
    assert.equal(offer?.id, ORCUS_ANCHOR.rumorId);
    assert.equal(offer?.targetId, ORCUS_ANCHOR.signalPoiId);
    assert.equal(offer?.targetName, ORCUS_ANCHOR.name);
    assert.match(offer?.text || '', /station refuses to fall|fence is inside the ring/i);
    const creditsBefore = route.state.player.credits;
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: ORCUS_ANCHOR.rumorId,
      stationId: ORCUS_ANCHOR.sourceStationId,
    });
    assert.ok(route.state.player.credits < creditsBefore, 'Economy owns the real rumor debit');
    assert.equal(route.state.world.frontierRumors.byId[ORCUS_ANCHOR.rumorId]?.phase, 'rumored');

    route.worldOwner.enterSector(ORCUS_ANCHOR.sectorId, { placePlayer: false });
    const station = liveStation(route.state);
    assert.ok(station, 'ordinary Orcus entry materializes The Anchor');
    assert.equal(station.data.stationTypeId, 'blackmarket');
    assert.equal(station.data.archetypeGlb, 'place_station_blackmarket');
    assert.ok(station.data.services.includes('black_market'));
    assert.equal(station.collides, true);
    assert.equal(station.radius, 42, 'L-station collision body is physically substantial');

    const expected = sectorLocalToGlobalForSector(ORCUS_ANCHOR.fixedLocalPos, ORCUS_ANCHOR.sectorId);
    assert.deepEqual({ x: station.pos.x, z: station.pos.z }, expected,
      'the station occupies the exact authored field center');
    assert.equal(buildSystemModel(route.state, ORCUS_ANCHOR.sectorId).points
      .some((point) => point.stationId === ORCUS_ANCHOR.stationId
        && point.entityId === station.id), true,
    'the ordinary system map resolves the catalog landmark to the same live station');
  } finally {
    route.cleanup();
    FIELD_FLAGS.enabled = previous;
  }
});

test('The Anchor shares the existing field kernel and materially bends a real Rapier body', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const route = await boot(250251);
  try {
    route.worldOwner.enterSector(ORCUS_ANCHOR.sectorId, { placePlayer: false });
    route.sim.step(DT);
    const station = liveStation(route.state);
    const field = route.fieldsOwner._kernel.list()
      .find((entry) => entry.id === ORCUS_GRAVITY_EDDY.field.id);
    assert.ok(station && field,
      `one live station and the canonical environmental field coexist: ${JSON.stringify({
        station: !!station,
        mode: route.state.mode,
        sectorId: route.state.world.currentSectorId,
        anomaly: route.sim.registry.get('anomalyRuntime').diagnostics(),
      })}`);
    assert.deepEqual(field.center, { x: station.pos.x, z: station.pos.z },
      'station and force owner use one world-space center');

    const probe = spawnProbe(route.sim, station.pos);
    const startX = probe.pos.x;
    for (let tick = 0; tick < 90; tick++) route.sim.step(DT);
    assert.ok(probe.vel.x < -8, `shared field bends inward with vx=${probe.vel.x}`);
    assert.ok(probe.pos.x < startX - 5, 'the curved trajectory separates from straight flight');
    assert.equal(station.alive, true, 'the slingshot route does not replace the market with a prop');
  } finally {
    route.cleanup();
    FIELD_FLAGS.enabled = previous;
  }
});
