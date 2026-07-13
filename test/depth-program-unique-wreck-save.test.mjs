import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const WRECK_ID = 'wreck_choir_tender';

function boot(seed = 77231) {
  const sim = createSimulation({ seed, systems: [salvageActions, uniqueWrecks, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.cargo.capVolume = 40;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['uniqueWreck:rumorRecorded', 'uniqueWreck:bearingFixed', 'uniqueWreck:salvaged', 'module:granted']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, events, system: sim.registry.get('uniqueWrecks') };
}

function hear(t) {
  t.bus.emit('news:headline', {
    headline: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST',
    wreckId: WRECK_ID,
    sourceRef: 'news.tragedy_at_helios',
    channelId: 'news',
  });
  return t.state.player.uniqueWrecks.bearings[WRECK_ID];
}

function salvage(t) {
  const wreck = t.state.entityList.find((entry) => entry.data && entry.data.uniqueWreckId === WRECK_ID);
  assert.ok(wreck);
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'save-test' });
}

function normalizedEvents(events) {
  return events.map(({ name, payload }) => ({
    name,
    wreckId: payload && payload.wreckId || null,
    defId: payload && payload.defId || null,
    phase: payload && payload.phase || null,
  }));
}

test('player save blob round-trips the bounded sidecar before sector rematerialization', () => {
  const a = boot();
  try {
    const record = hear(a);
    a.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    salvage(a);
    const serializedSystem = a.system.serialize();
    const serializedPlayer = save._serializePlayer.call({ state: a.state });
    assert.deepEqual(serializedPlayer.uniqueWrecks, serializedSystem);
    assert.equal(JSON.stringify(serializedPlayer.uniqueWrecks).includes('runtimeEntityId'), false);
    assert.equal(serializedPlayer.uniqueWrecks.receipts.length <= 24, true);

    const b = boot();
    try {
      save._restorePlayer.call({ state: b.state }, serializedPlayer);
      b.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
      const restored = b.state.player.uniqueWrecks.bearings[WRECK_ID];
      assert.equal(restored.phase, 'salvaged');
      assert.equal(b.state.entityList.some((entry) => entry.data && entry.data.uniqueWreckId === WRECK_ID), false,
        'Continue cannot respawn a recovered one-per-save wreck');
      const medicalBefore = b.state.player.cargo.items.cmdty_medical || 0;
      const modulesBefore = b.state.player.moduleInventory.filter((entry) => entry.defId === 'unique_knitbots').length;
      b.bus.emit('salvage:completed', { wreckId: 999999, loot: {} });
      assert.equal(b.state.player.cargo.items.cmdty_medical || 0, medicalBefore);
      assert.equal(b.state.player.moduleInventory.filter((entry) => entry.defId === 'unique_knitbots').length, modulesBefore);
    } finally {
      b.sim.dispose();
    }
  } finally {
    a.sim.dispose();
  }
});

test('save/load mid-tape produces the same durable unique-wreck state and owner receipts', () => {
  const uninterrupted = boot(88004);
  const interruptedA = boot(88004);
  try {
    const uRecord = hear(uninterrupted);
    uninterrupted.bus.emit('scan:pulse', { pos: { ...uRecord.exactPos } });
    salvage(uninterrupted);

    const iRecord = hear(interruptedA);
    const checkpoint = interruptedA.system.serialize();
    const interruptedB = boot(88004);
    try {
      interruptedB.system.deserialize(checkpoint);
      interruptedB.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
      interruptedB.bus.emit('scan:pulse', { pos: { ...iRecord.exactPos } });
      salvage(interruptedB);

      assert.deepEqual(interruptedB.system.serialize(), uninterrupted.system.serialize());
      assert.deepEqual(
        normalizedEvents([...interruptedA.events, ...interruptedB.events]),
        normalizedEvents(uninterrupted.events),
      );
    } finally {
      interruptedB.sim.dispose();
    }
  } finally {
    uninterrupted.sim.dispose();
    interruptedA.sim.dispose();
  }
});
