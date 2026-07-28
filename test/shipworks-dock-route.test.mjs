import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shipworksDockIdForState,
  syncShipworksDockForState,
} from '../src/ui/station/screens/shipworks.js';

function dockedAt(stationId) {
  return { ui: { dockedStationId: stationId } };
}

test('modern Shipworks resolves the authored dock backdrop from the docked station', () => {
  assert.equal(shipworksDockIdForState(dockedAt('station_helios')), 'place_dock_interior');
  assert.equal(shipworksDockIdForState(dockedAt('station_coalition')), 'place_dock_interior');
  assert.equal(shipworksDockIdForState(dockedAt('station_smuggler')), 'place_dock_interior');
});

test('modern Shipworks uses the neutral authored dock when station identity is unavailable', () => {
  assert.equal(shipworksDockIdForState(null), 'place_dock_interior');
  assert.equal(shipworksDockIdForState({ ui: {} }), 'place_dock_interior');
  assert.equal(shipworksDockIdForState(dockedAt('station_unknown')), 'place_dock_interior');
});

test('a cached Shipworks mount resynchronizes its accepted dock on every station show', () => {
  const calls = [];
  const mount = { setDockId: (id) => calls.push(id) };
  assert.equal(
    syncShipworksDockForState(mount, dockedAt('station_coalition')),
    'place_dock_interior',
  );
  assert.equal(
    syncShipworksDockForState(mount, dockedAt('station_smuggler')),
    'place_dock_interior',
  );
  assert.deepEqual(calls, ['place_dock_interior', 'place_dock_interior']);
});
