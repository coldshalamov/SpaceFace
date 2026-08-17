import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hazardCenterAt, hazardClearanceAt } from '../src/core/hazardMotion.js';
import { save } from '../src/save/saveSystem.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { world } from '../src/systems/world.js';

const WRECK_ID = 'wreck_isc_lighthouse';
const HAZARD_ID = 'hazard_ashfall_burn';
const STEP_S = 0.25;

function boot(seed = 26073) {
  const systems = [world, salvageActions, uniqueWrecks, mining, cargo, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.cargo.capVolume = 0;
  state.player.cargo.capMass = 1e9;
  state.player.beamMode = 'extract';
  state.ui.beamMode = 'extract';
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector('sector_ashfall_reach', { placePlayer: false });
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  return { sim, state, bus, player, toasts };
}

function revealLighthouse(route) {
  const def = uniqueWreckById(WRECK_ID);
  const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef);
  route.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
    wreckId: def.id,
    authoredWreckId: def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
    toIndex: 7,
  });
  const record = route.state.player.uniqueWrecks.bearings[WRECK_ID];
  const wreck = liveWreck(route.state);
  assert.ok(record && wreck, 'the campaign reveal materializes the seeded Lighthouse wreck');
  return { def, record, wreck };
}

function liveWreck(state) {
  return state.entityList.find((entity) => entity.alive !== false
    && entity.data?.uniqueWreckId === WRECK_ID) || null;
}

function looseLighthouseCargo(state) {
  return state.entityList.filter((entity) => entity.alive !== false
    && entity.type === 'pickup'
    && ['cmdty_scrap_metal', 'cmdty_classified_salvage'].includes(entity.data?.commodityId));
}

function cargoTotal(state) {
  return Object.values(state.player.cargo.items).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

function poolTotal(pool) {
  return Object.values(pool || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

function looseCargoTotal(entities) {
  return entities.reduce((sum, entity) => sum + (Number(entity.data?.amount) || 0), 0);
}

function placeAtWreck(route, wreck) {
  route.player.pos.set(wreck.pos.x - 80, 0, wreck.pos.z);
  route.player.prevPos.copy(route.player.pos);
  route.player.vel.set(0, 0, 0);
  route.state.player.targetId = wreck.id;
  route.state.player.tether = {
    active: true,
    targetId: wreck.id,
    attachmentId: 'massline:lighthouse',
  };
}

function setSimTime(route, simTime) {
  route.state.simTime = simTime;
  route.sim.step(1 / 60);
}

function findDeepPhase(hazard, point, { covered, fromS = 0, horizonS = 96, margin = 140 }) {
  for (let simTime = fromS; simTime <= fromS + horizonS; simTime += STEP_S) {
    const clearance = hazardClearanceAt(hazard, point, simTime);
    if (covered ? clearance <= -margin : clearance >= margin) return simTime;
  }
  return null;
}

function findSafeExtractionStart(hazard, point, fromS, durationS = 9.5) {
  for (let simTime = fromS; simTime <= fromS + 96; simTime += STEP_S) {
    let clear = true;
    for (let offset = 0; offset <= durationS; offset += STEP_S) {
      if (hazardClearanceAt(hazard, point, simTime + offset) < 140) {
        clear = false;
        break;
      }
    }
    if (clear) return simTime;
  }
  return null;
}

function beamFor(route, seconds) {
  route.state.input.fireGroup = 2;
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_S) route.sim.step(STEP_S);
  route.state.input.fireGroup = 0;
  route.sim.step(1 / 60);
}

test('Lighthouse extraction is crossed by a real radiation sweep and waiting out the storm survives Continue without cargo duplication', () => {
  const route = boot();
  try {
    const { record, wreck } = revealLighthouse(route);
    const hazard = route.state.world.activeSector.hazards.find((entry) => entry.id === HAZARD_ID);
    assert.ok(hazard?.moving && hazard.motion, 'Ashfall materializes a world-owned moving hazard');
    assert.notDeepEqual(
      hazardCenterAt(hazard, 0),
      hazardCenterAt(hazard, hazard.motion.periodS * 0.25),
      'the radiation center moves through space instead of changing a semantic phase flag',
    );

    const safeScanAt = findDeepPhase(hazard, record.exactPos, { covered: false });
    const coveredAt = findDeepPhase(hazard, record.exactPos, { covered: true });
    assert.notEqual(safeScanAt, null);
    assert.notEqual(coveredAt, null);

    placeAtWreck(route, wreck);
    setSimTime(route, coveredAt);
    const hullBeforePressure = route.player.hull;
    route.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    assert.equal(record.phase, 'rumored', 'the physical radiation body occludes the first bearing fix');
    assert.match(route.toasts.at(-1)?.text || '', /radiation.+crossing.+break away.+after the sweep/i,
      'the blocked scan tells the player how to use the spatial counter-window');

    setSimTime(route, safeScanAt);
    route.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    assert.equal(record.phase, 'fixed', 'the bearing fixes when that same body has moved clear');
    const initialPhysicalUnits = poolTotal(wreck.data.salvagePool);
    assert.ok(initialPhysicalUnits >= 2);

    setSimTime(route, coveredAt);
    beamFor(route, 3.25);
    assert.ok(route.player.hull < hullBeforePressure,
      'radiation drains hull while the player is physically tethered and cutting the wreck');
    const pressuredLoot = looseLighthouseCargo(route.state);
    assert.equal(pressuredLoot.length, 1, 'the pressured beam ejects one conserved physical unit');
    assert.equal(cargoTotal(route.state), 0,
      'the extracted unit does not teleport into cargo');

    route.state.player.cargo.capVolume = 1000;
    route.player.pos.copy(pressuredLoot[0].pos);
    route.player.prevPos.copy(route.player.pos);
    route.sim.step(1);
    assert.equal(cargoTotal(route.state), 1,
      'cargo receives the unit only after physical pickup contact');
    assert.equal(poolTotal(record.salvageRemaining), initialPhysicalUnits - 1);
    const remainingBeforeSave = structuredClone(record.salvageRemaining);

    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan26-lighthouse-storm');
    const centerBeforeContinue = hazardCenterAt(hazard, route.state.simTime);
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan26-lighthouse-storm'), true);
    const restoredHazard = route.state.world.activeSector.hazards.find((entry) => entry.id === HAZARD_ID);
    const restoredWreck = liveWreck(route.state);
    route.player = route.state.entities.get(route.state.playerId);
    assert.ok(restoredHazard && restoredWreck, 'Continue rematerializes the storm and partly stripped wreck');
    assert.deepEqual(hazardCenterAt(restoredHazard, route.state.simTime), centerBeforeContinue,
      'the spatial sweep resumes from saved sim time');
    assert.deepEqual(restoredWreck.data.salvagePool, remainingBeforeSave,
      'Continue cannot mint the collected unit back into the wreck');

    const safeExtractionAt = findSafeExtractionStart(
      restoredHazard,
      restoredWreck.pos,
      route.state.simTime,
    );
    assert.notEqual(safeExtractionAt, null, 'the moving field leaves a bounded extraction counter-window');
    route.player.pos.set(restoredWreck.pos.x + 2600, 0, restoredWreck.pos.z + 2600);
    route.player.prevPos.copy(route.player.pos);
    while (route.state.simTime + STEP_S < safeExtractionAt) route.sim.step(STEP_S);
    setSimTime(route, safeExtractionAt);
    placeAtWreck(route, restoredWreck);
    route.state.player.cargo.capVolume = 0;
    const hullBeforeCounterplay = route.player.hull;
    beamFor(route, 9.25);

    assert.equal(route.player.hull, hullBeforeCounterplay,
      'waiting for the spatial sweep to pass gives a genuine damage-free extraction window');
    const finalLoose = looseLighthouseCargo(route.state);
    assert.equal(looseCargoTotal(finalLoose), initialPhysicalUnits - 1,
      'only the conserved remainder leaves the wreck after Continue');
    assert.equal(cargoTotal(route.state), 1);
    assert.equal(looseCargoTotal(finalLoose) + cargoTotal(route.state), initialPhysicalUnits,
      'physical custody plus collected cargo equals the authored source exactly once');
    assert.equal(route.state.player.uniqueWrecks.bearings[WRECK_ID].phase, 'decision');
  } finally {
    route.sim.dispose();
  }
});
