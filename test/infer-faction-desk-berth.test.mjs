import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { factionPresence } from '../src/systems/factionPresence.js';

function harness() {
  const state = createGameState(174);
  state.factions.faction_archive = { rep: 25 };
  const bus = createBus();
  const events = [];
  bus.on('comms:popup', receipt => events.push(receipt));
  bus.on('toast', receipt => events.push(receipt));
  const owner = Object.create(factionPresence);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  bus.emit('dock:docked', { stationId: 'station_drift' });
  return { state, bus, owner, events };
}

for (const berth of [null, 'station_tethys']) {
  test(`a cached Archive desk cannot be used from ${berth || 'flight'}`, () => {
    const h = harness();
    h.state.ui.docked = berth != null;
    h.state.ui.dockedStationId = berth;
    h.bus.emit(berth ? 'dock:docked' : 'dock:undocked', berth ? { stationId: berth } : {});
    h.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: 'archive_reading_room' });
    assert.equal(Object.keys(h.state.factionPresence.serviceReceipts).length, 0);
    assert.equal(h.events.filter(event => event.sender === 'Archive Reading Room').length, 0);
    assert.ok(h.events.some(event => /dock|berth/i.test(event.text)));
    h.owner.destroy();
  });
}

test('the Archive desk still works at its live berth', () => {
  const h = harness();
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = 'station_drift';
  h.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: 'archive_reading_room' });
  assert.ok(h.events.some(event => event.sender === 'Archive Reading Room'));
  assert.ok(Object.keys(h.state.factionPresence.serviceReceipts).length > 0);
  h.owner.destroy();
});

test('a delayed dock receipt from a replaced pilot cannot authorize a faction desk', () => {
  const h = harness();
  h.bus.emit('dock:undocked', {});
  h.state.mode = 'flight';
  const oldPilot = { id: 1, alive: true, hull: 10, occupantGeneration: 2 };
  h.state.playerId = 1;
  h.state.entities.set(1, oldPilot);
  const receipt = createDockIntent(h.state, { stationId: 'station_drift' }, oldPilot);
  h.state.entities.set(1, { ...oldPilot });
  h.bus.emit('dock:docked', receipt);
  h.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: 'archive_reading_room' });
  assert.equal(Object.keys(h.state.factionPresence.serviceReceipts).length, 0);
  assert.equal(h.events.filter(event => event.sender === 'Archive Reading Room').length, 0);
  h.owner.destroy();
});
