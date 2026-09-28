import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import {
  factionPresenceServiceRows,
  runFactionPresenceDockAction,
} from '../src/ui/station/serviceQuotes.js';

function boot() {
  const state = createGameState(0x47a);
  state.factions = {
    ...(state.factions || {}),
    faction_archive: { rep: 25 },
    faction_pitborn: { rep: 8 },
  };
  const bus = createBus();
  const events = [];
  bus.on('ui:factionPresenceService', (payload) => events.push(payload));
  bus.on('comms:popup', (payload) => events.push({ comms: payload }));
  const system = Object.create(factionPresence);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, events, system };
}

test('dock command palette can fire Archive and Pitborn presence desks', () => {
  const rt = boot();
  try {
    rt.bus.emit('dock:docked', { stationId: 'station_drift' });
    const rows = factionPresenceServiceRows(rt.state, 'station_drift');
    assert.ok(rows.some((row) => row.id === 'archive_reading_room' && row.available));
    const result = runFactionPresenceDockAction(
      rt.bus, rt.state, 'station_drift', 'archive_reading_room',
    );
    assert.equal(result.ok, true);
    assert.ok(rt.events.some((row) => row.serviceId === 'archive_reading_room'));
    assert.ok(rt.events.some((row) => row.comms && row.comms.sender === 'Archive Reading Room'));
  } finally {
    rt.bus.clear();
  }
});

test('a gated presence desk explains itself instead of opening', () => {
  const rt = boot();
  try {
    rt.state.factions.faction_archive.rep = 0;
    rt.bus.emit('dock:docked', { stationId: 'station_drift' });
    const result = runFactionPresenceDockAction(
      rt.bus, rt.state, 'station_drift', 'archive_reading_room',
    );
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /reputation/i);
  } finally {
    rt.bus.clear();
  }
});
