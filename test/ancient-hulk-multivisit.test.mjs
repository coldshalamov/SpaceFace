import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWreckById, validateUniqueWreckRegistry } from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { ships } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const WRECK_ID = 'wreck_lanebreaker_pale_coil';
const SECTOR_ID = 'sector_phoebe_echo';

function boot(seed = 262626) {
  const sim = createSimulation({ seed, systems: [salvageActions, uniqueWrecks, mining, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 1e9;
  state.player.moduleInventory = [{ defId: 'mod_survey_suite' }];
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['mining:yield', 'uniqueWreck:ancientLayerCleared', 'uniqueWreck:decisionReady']) {
    bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  }
  return {
    sim, state, bus, player, events,
    unique: sim.registry.get('uniqueWrecks'),
    mining: sim.registry.get('mining'),
  };
}

function hearAndFix(t) {
  t.bus.emit('mission:accepted', {
    wreckId: WRECK_ID,
    sourceRef: 'mission.the_lost_coils',
    channelId: 'mission',
  });
  const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
  assert.ok(record, 'the canonical mission rumor records the real ancient hulk');
  t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  assert.equal(record.phase, 'fixed');
  return record;
}

function liveWreck(t) {
  return t.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.uniqueWreckId === WRECK_ID) || null;
}

function leaveAndReturn(t) {
  t.state.world.currentSectorId = 'sector_helios_prime';
  t.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  t.state.world.currentSectorId = SECTOR_ID;
  t.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  return liveWreck(t);
}

function drainCurrentLayer(t) {
  const wreck = liveWreck(t);
  assert.ok(wreck, 'this visit exposes one physical hulk layer');
  t.mining._drainWreck(t.player, wreck, 18, 8);
  assert.equal(wreck.alive, false, 'the exhausted physical layer leaves the live scene');
}

function yieldedPool(events) {
  const pool = {};
  for (const event of events.filter((entry) => entry.name === 'mining:yield')) {
    pool[event.payload.commodityId] = (pool[event.payload.commodityId] || 0) + event.payload.qty;
  }
  return pool;
}

test('ancient authored hulks conserve layered salvage across partial Continue and real return visits', () => {
  assert.deepEqual(validateUniqueWreckRegistry(), { ok: true, errors: [] });
  const def = uniqueWreckById(WRECK_ID);
  assert.equal(def.salvageLayers.length, 3);

  const a = boot();
  let saved;
  let preContinueEvents;
  try {
    const record = hearAndFix(a);
    const first = liveWreck(a);
    assert.ok(first);
    assert.match(first.data.interactionPrompt, /LAYER 1\/3.*OUTER ARMOR/);
    assert.equal(traffic._isSalvageableBody(first), false,
      'the ordinary physical cutter profession cannot fork the player-gated ancient source ledger');

    // Work only one of three units. The mining event carries the exact wreck identity, so the
    // unique-wreck owner checkpoints the same source pool before any save can copy it.
    a.mining._drainWreck(a.player, first, 18, 2.1);
    assert.deepEqual(record.ancientSalvage.remainingPool, { cmdty_scrap_metal: 2 });
    assert.equal(record.ancientSalvage.layerIndex, 0);
    saved = JSON.parse(JSON.stringify(a.unique.serialize()));
    preContinueEvents = [...a.events];
  } finally {
    a.sim.dispose();
  }

  const b = boot();
  try {
    // Exact Continue shape: save:restoring, restored durable player bag, sector re-entry while the
    // restore latch is held, then save:loaded. Continue is not a free additional visit.
    b.bus.emit('save:restoring', {});
    b.unique.deserialize(saved);
    b.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    b.bus.emit('save:loaded', {});
    let record = b.state.player.uniqueWrecks.bearings[WRECK_ID];
    let wreck = liveWreck(b);
    assert.ok(wreck, 'Continue rematerializes the partly stripped current layer');
    assert.deepEqual(wreck.data.salvagePool, { cmdty_scrap_metal: 2 });
    assert.equal(record.ancientSalvage.visitSerial, 0, 'Continue does not unlock a deeper layer');

    drainCurrentLayer(b);
    record = b.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.equal(record.phase, 'fixed');
    assert.equal(record.ancientSalvage.layerIndex, 1);
    assert.deepEqual(record.ancientSalvage.remainingPool, {
      cmdty_salvage_electronics: 2,
      cmdty_alloys: 1,
    });
    b.unique._syncSector(SECTOR_ID);
    assert.equal(liveWreck(b), null, 'same-visit rematerialization cannot skip the departure gate');
    b.bus.emit('sector:enter', { sectorId: SECTOR_ID, continuous: true });
    assert.equal(record.ancientSalvage.visitSerial, 0);
    assert.equal(liveWreck(b), null, 'repeat entry notification is not a new visit without a sector change');

    wreck = leaveAndReturn(b);
    assert.ok(wreck);
    assert.match(wreck.data.interactionPrompt, /LAYER 2\/3.*SPINDLE BUSES/);
    drainCurrentLayer(b);
    assert.equal(record.ancientSalvage.layerIndex, 2);
    assert.equal(liveWreck(b), null);

    wreck = leaveAndReturn(b);
    assert.ok(wreck);
    assert.match(wreck.data.interactionPrompt, /LAYER 3\/3.*SEALED COIL VAULT/);
    drainCurrentLayer(b);
    assert.equal(record.phase, 'decision', 'only the final physical layer opens the authored claim');
    assert.equal(record.ancientSalvage.completedVisits, 3);
    assert.equal(record.ancientSalvage.layerIndex, 3);
    assert.equal(b.events.filter((event) => event.name === 'uniqueWreck:ancientLayerCleared').length, 2);
    assert.equal(b.events.filter((event) => event.name === 'uniqueWreck:decisionReady').length, 1);

    assert.deepEqual(yieldedPool([...preContinueEvents, ...b.events]), {
      cmdty_scrap_metal: 3,
      cmdty_alloys: 1,
      cmdty_salvage_electronics: 2,
      cmdty_quantum_cores: 1,
    }, 'the three visits yield each authored unit exactly once');

    b.bus.emit('uniqueWreck:choose', {
      wreckId: WRECK_ID,
      choiceId: 'claim_hardware',
      source: 'ancient-multivisit-test',
    });
    assert.equal(record.phase, 'salvaged');
    assert.ok(b.state.player.moduleInventory.some((item) => item.defId === 'unique_pale_coil_warp_drive'));
  } finally {
    b.sim.dispose();
  }
});
