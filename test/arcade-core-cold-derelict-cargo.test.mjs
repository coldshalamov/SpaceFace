import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { save } from '../src/save/saveSystem.js';
import {
  AFTERMATH_FRESH_WINDOW_S,
  COLD_DERELICT_CUT_THRESHOLD,
  aftermathForSector,
  aftermathWrecks,
  coldDerelictOutcomeFor,
} from '../src/systems/aftermathWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';

const SECTOR_ID = 'sector_helios_prime';

function boot(seed) {
  const sim = createSimulation({
    seed,
    systems: [aftermathWrecks, cargo, mining, save],
    updateOrder: [aftermathWrecks, mining, cargo, save],
  });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 8,
    hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos: { x: pos.x + 100, z: pos.z },
    vel: { x: 0, z: 0 }, radius: 7, hull: 0, hullMax: 80, flags: {},
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: `Cold Freight ${seed}` },
  });
  victim.alive = false;
  sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    vel: { ...victim.vel },
    sectorId: SECTOR_ID,
    data: victim.data,
  });
  const collected = [];
  sim.bus.on('pickup:collected', (payload) => collected.push(payload));
  return { sim, state, player, aftermath: sim.registry.get('aftermathWrecks'), collected };
}

function liveWreck(state, markerId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.markerId === markerId);
}

function liveExtractionBodies(state, markerId) {
  return state.entityList.filter((entity) => entity && entity.alive !== false && entity.data
    && entity.data.coldDerelictMarkerId === markerId);
}

function openHatch(route) {
  const marker = aftermathForSector(route.state, SECTOR_ID)[0];
  const wreck = liveWreck(route.state, marker.markerId);
  route.state.simTime = marker.t + AFTERMATH_FRESH_WINDOW_S;
  route.state.tick = 30;
  route.aftermath.update(0.5, route.state);
  route.state.player.targetId = wreck.id;
  route.state.player.tether = { active: true, targetId: wreck.id, attachmentId: 'massline:cold-cargo' };
  route.state.input.fireGroup = 2;
  for (let i = 0; i < 4 && wreck.data.coldDerelictBoarding.phase !== 'extracted'; i++) {
    route.sim.step(1);
  }
  assert.equal(wreck.data.coldDerelictBoarding.cutProgress, COLD_DERELICT_CUT_THRESHOLD);
  assert.equal(wreck.data.coldDerelictBoarding.phase, 'extracted');
  return { marker, wreck };
}

test('cold non-survivor hulks deterministically branch into timed cargo or one conserved physical recorder', () => {
  const cargoRoute = boot(1);
  const recorderRoute = boot(3);
  try {
    const cargoMarker = aftermathForSector(cargoRoute.state, SECTOR_ID)[0];
    const recorderMarker = aftermathForSector(recorderRoute.state, SECTOR_ID)[0];
    assert.equal(coldDerelictOutcomeFor(cargoRoute.state, cargoMarker), 'cargo');
    assert.equal(coldDerelictOutcomeFor(recorderRoute.state, recorderMarker), 'black_box');

    const cargoOpened = openHatch(cargoRoute);
    assert.match(cargoOpened.wreck.data.scanLabel, /HATCH OPEN/);
    const cargoBodies = liveExtractionBodies(cargoRoute.state, cargoOpened.marker.markerId);
    assert.equal(cargoBodies.filter((entity) => entity.data.payloadType === 'cold_derelict_hatch_plate').length, 1,
      'the marked plate becomes one physical, valueless tetherable body');
    assert.equal(cargoBodies.filter((entity) => entity.type === 'pickup').length, 0,
      'opening the hatch does not teleport the conserved hold into cargo');
    const cargoBefore = Object.values(cargoOpened.marker.salvagePool).reduce((sum, qty) => sum + qty, 0);
    cargoRoute.sim.step(2);
    const looseCargo = liveExtractionBodies(cargoRoute.state, cargoOpened.marker.markerId)
      .filter((entity) => entity.type === 'pickup');
    const collectedCargo = cargoRoute.collected.filter((payload) => payload.lotSource
      && payload.lotSource.recordId === cargoOpened.marker.markerId);
    assert.ok(looseCargo.length + collectedCargo.length > 0,
      'continued beam time pulls physical cargo out hand over fist through pickup/vacuum');
    const cargoAfter = Object.values(cargoOpened.marker.salvagePool).reduce((sum, qty) => sum + qty, 0);
    assert.equal(cargoBefore - cargoAfter,
      looseCargo.reduce((sum, entity) => sum + entity.data.amount, 0)
        + collectedCargo.reduce((sum, payload) => sum + payload.amount, 0),
      'every loose unit was removed from the existing durable wreck pool');
    assert.ok(looseCargo.every((entity) => entity.flags && entity.flags.persistent === true),
      'loose custody remains physical through Continue instead of vanishing from the depleted pool');
    const looseCargoQty = looseCargo.reduce((sum, entity) => sum + entity.data.amount, 0);
    const cargoPoolSnapshot = structuredClone(cargoOpened.marker.salvagePool);
    const cargoSave = cargoRoute.sim.registry.get('save');
    const cargoEnvelope = cargoSave.serialize('plan26-cold-cargo');
    assert.equal(cargoSave.loadEnvelope(structuredClone(cargoEnvelope), 'plan26-cold-cargo'), true);
    const restoredCargoMarker = aftermathForSector(cargoRoute.state, SECTOR_ID)[0];
    assert.deepEqual(restoredCargoMarker.salvagePool, cargoPoolSnapshot);
    assert.equal(liveExtractionBodies(cargoRoute.state, restoredCargoMarker.markerId)
      .filter((entity) => entity.type === 'pickup')
      .reduce((sum, entity) => sum + entity.data.amount, 0), looseCargoQty,
    'real Continue retains exactly the already-extracted loose cargo');

    recorderRoute.state.player.cargo.capVolume = 0;
    const recorderOpened = openHatch(recorderRoute);
    const recorderBodies = liveExtractionBodies(recorderRoute.state, recorderOpened.marker.markerId);
    const plate = recorderBodies.find((entity) => entity.data.payloadType === 'cold_derelict_hatch_plate');
    const recorder = recorderBodies.find((entity) => entity.data.coldDerelictBlackBox === true);
    assert.ok(plate && recorder, 'cutting the marked hatch ejects a plate and a distinct flight recorder');
    assert.equal(plate.data.salvagePool && Object.keys(plate.data.salvagePool).length, 0,
      'the hatch plate is consequence, not a second loot pool');
    assert.equal(recorder.type, 'pickup');
    assert.equal(recorder.data.kind, 'cargo');
    assert.equal(recorder.data.commodityId, 'cmdty_salvage_electronics');
    assert.equal(recorder.data.amount, 1);
    assert.equal(recorder.flags.persistent, true);
    assert.equal(recorderOpened.marker.salvagePool.cmdty_salvage_electronics, undefined,
      'the physical recorder consumes the marker-owned electronics unit exactly once');

    const saveOwner = recorderRoute.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan26-cold-recorder');
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan26-cold-recorder'), true,
      'the production save owner completes a real Continue');
    const restoredMarker = aftermathForSector(recorderRoute.state, SECTOR_ID)[0];
    assert.equal(restoredMarker.coldDerelictBoarding.phase, 'extracted');
    assert.equal(restoredMarker.coldDerelictBoarding.outcome, 'black_box');
    assert.equal(restoredMarker.salvagePool.cmdty_salvage_electronics, undefined);
    const restoredBodies = liveExtractionBodies(recorderRoute.state, restoredMarker.markerId);
    assert.equal(restoredBodies.filter((entity) => entity.data.payloadType === 'cold_derelict_hatch_plate').length, 1);
    assert.equal(restoredBodies.filter((entity) => entity.data.coldDerelictBlackBox === true).length, 1,
      'Continue retains one recorder and cannot manufacture another');

    const restoredWreck = liveWreck(recorderRoute.state, restoredMarker.markerId);
    recorderRoute.state.player.targetId = restoredWreck.id;
    recorderRoute.state.player.tether = {
      active: true, targetId: restoredWreck.id, attachmentId: 'massline:continued-recorder',
    };
    recorderRoute.state.input.fireGroup = 2;
    recorderRoute.sim.step(0.25);
    assert.equal(liveExtractionBodies(recorderRoute.state, restoredMarker.markerId)
      .filter((entity) => entity.data.coldDerelictBlackBox === true).length, 1);

    const restoredRecorder = liveExtractionBodies(recorderRoute.state, restoredMarker.markerId)
      .find((entity) => entity.data.coldDerelictBlackBox === true);
    const restoredPlayer = recorderRoute.state.entities.get(recorderRoute.state.playerId);
    recorderRoute.state.player.cargo.capVolume = 100;
    restoredPlayer.pos.copy(restoredRecorder.pos);
    restoredPlayer.prevPos.copy(restoredRecorder.pos);
    recorderRoute.state.input.fireGroup = 0;
    recorderRoute.sim.step(1);
    assert.equal(recorderRoute.state.player.cargo.items.cmdty_salvage_electronics, 1,
      'the physical recorder enters the hold through Mining pickup and Cargo acceptance');
  } finally {
    cargoRoute.sim.dispose();
    recorderRoute.sim.dispose();
  }
});
