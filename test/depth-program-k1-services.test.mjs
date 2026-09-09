import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { factionPresenceServiceRows } from '../src/ui/station/serviceQuotes.js';

function serviceRuntime() {
  const state = createGameState(0x47a);
  state.factions = {
    ...(state.factions || {}),
    faction_archive: { rep: 24 },
    faction_pitborn: { rep: 0 },
  };
  const bus = createBus();
  const events = [];
  for (const event of ['comms:popup', 'toast', 'factionPresence:serviceAction']) {
    bus.on(event, (payload) => events.push({ event, payload }));
  }
  const system = Object.create(factionPresence);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, events, system };
}

test('Archive reading room is a persistent Services card with a live rep gate', () => {
  const rt = serviceRuntime();
  rt.bus.emit('dock:docked', { stationId: 'station_drift' });
  assert.ok(rt.state.factionPresence.servicesByStation.station_drift);
  let rows = factionPresenceServiceRows(rt.state, 'station_drift');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'archive_reading_room');
  assert.equal(rows[0].available, false);
  assert.match(rows[0].disabledReason, /25/);

  rt.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: rows[0].id });
  assert.equal(rt.events.some((row) => row.event === 'comms:popup'), false);

  rt.state.factions.faction_archive.rep = 25;
  rt.bus.emit('dock:docked', { stationId: 'station_drift' });
  rows = factionPresenceServiceRows(rt.state, 'station_drift');
  assert.equal(rows[0].available, true);
  rt.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: rows[0].id });
  rt.bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: rows[0].id });
  const popups = rt.events.filter((row) => row.event === 'comms:popup');
  assert.equal(popups.length, 2, 'the persistent reading may be reopened');
  assert.equal(popups[0].payload.text, popups[1].payload.text, 'reading selection is seeded and stable');
  assert.equal(rt.state.factionPresence.receipts.filter((row) => row.kind === 'archiveReading').length, 1);
});

test('Pitborn Services cards only expose surfaces each real station actually offers', () => {
  const rt = serviceRuntime();
  const expected = {
    station_forge: [['pitborn_yard', 'shipyard'], ['pitborn_fence', 'market']],
    station_ceres: [['pitborn_fence', 'market']],
    station_ashcache: [],
  };
  for (const [stationId, rowsExpected] of Object.entries(expected)) {
    rt.bus.emit('dock:docked', { stationId });
    const rows = factionPresenceServiceRows(rt.state, stationId);
    assert.deepEqual(rows.map((row) => [row.id, row.targetTab]), rowsExpected, stationId);
    assert.equal(rows.every((row) => row.available), true);
    for (const row of rows) {
      rt.bus.emit('ui:factionPresenceService', { stationId, serviceId: row.id, targetTab: row.targetTab });
    }
  }
  assert.deepEqual(
    rt.events.filter((row) => row.event === 'factionPresence:serviceAction').map((row) => row.payload.targetTab),
    ['shipyard', 'market', 'market'],
  );
});

test('Understory wreck buyer is a live Services row backed by the loss ledger', () => {
  const rt = serviceRuntime();
  rt.state.world.currentSectorId = 'sector_charon_expanse';
  rt.state.lossLedger = {
    entries: [{ lossId: 'loss_service', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule' }],
    bySector: { sector_charon_expanse: [{ lossId: 'loss_service', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule' }] },
  };
  rt.bus.emit('dock:docked', { stationId: 'station_expanse' });
  const rows = factionPresenceServiceRows(rt.state, 'station_expanse');
  assert.deepEqual(rows.map((row) => row.id), ['understory_wreck_buy']);
  rt.bus.emit('ui:factionPresenceService', { stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  assert.equal(rt.events.some((row) => row.event === 'comms:popup'
    && /ship_mule|recorded hull/i.test(row.payload.text)), true);
  assert.equal(rt.events.some((row) => row.event === 'factionPresence:serviceAction'
    && row.payload.factionId === 'faction_understory'), true);
});
