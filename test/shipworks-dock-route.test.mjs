import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateSpatialSlotLayout,
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

test('calculateSpatialSlotLayout keeps hardpoint cards outside the ship silhouette and unstacked', () => {
  const stageWidth = 1100;
  const stageHeight = 460;
  const cx = stageWidth * 0.5; // 550

  // 4 Starter Hitch slots:
  // slot 0: weapon (right wing)
  // slot 1: shield (top dorsal)
  // slot 2: engine (left rear)
  // slot 3: cargo (bottom ventral)
  const projectedSlots = [
    { index: 0, order: 0, x: 620, y: 220, local: { x: 12, y: 0, z: -2 } },
    { index: 1, order: 1, x: 546, y: 160, local: { x: 0, y: 5, z: 0 } },
    { index: 2, order: 2, x: 470, y: 250, local: { x: -10, y: 0, z: 10 } },
    { index: 3, order: 3, x: 554, y: 280, local: { x: 0, y: -4, z: 0 } },
  ];

  const results = calculateSpatialSlotLayout({
    projectedSlots,
    stageWidth,
    stageHeight,
    nodeRadius: 17,
    calloutWidth: 200,
    calloutHeight: 36,
    edgeInset: 12,
    nameplateBottom: 80,
  });

  assert.equal(results.length, 4);

  const leftCards = results.filter((r) => r.isLeft);
  const rightCards = results.filter((r) => !r.isLeft);

  assert.equal(leftCards.length, 2);
  assert.equal(rightCards.length, 2);

  // Left cards must sit completely to the left of the center ship zone
  for (const card of leftCards) {
    assert.ok(card.visualCardRight <= cx - 100, `left card right (${card.visualCardRight}) must clear ship center (${cx - 100})`);
    assert.ok(card.visualCardLeft >= 12, 'left card must stay inside stage bounds');
    assert.ok(card.leaderD.startsWith('M 0 17'), 'left leader line must connect from left reticle edge');
  }

  // Right cards must sit completely to the right of the center ship zone
  for (const card of rightCards) {
    assert.ok(card.visualCardLeft >= cx + 100, `right card left (${card.visualCardLeft}) must clear ship center (${cx + 100})`);
    assert.ok(card.visualCardRight <= stageWidth - 12, 'right card must stay inside stage bounds');
    assert.ok(card.leaderD.startsWith('M 34 17'), 'right leader line must connect from right reticle edge');
  }

  // Cards on the same flank must not overlap vertically
  assert.ok(
    Math.abs(leftCards[0].visualCardTop - leftCards[1].visualCardTop) >= 36,
    'left flank cards must have vertical separation',
  );
  assert.ok(
    Math.abs(rightCards[0].visualCardTop - rightCards[1].visualCardTop) >= 36,
    'right flank cards must have vertical separation',
  );
});

test('calculateSpatialSlotLayout scales gracefully for high slot counts (e.g. battleships)', () => {
  const stageWidth = 1280;
  const stageHeight = 520;
  const cx = stageWidth * 0.5;

  const projectedSlots = [
    { index: 0, order: 0, x: 680, y: 180, local: { x: 15, y: 0, z: -10 } },
    { index: 1, order: 1, x: 670, y: 220, local: { x: 14, y: 0, z: -5 } },
    { index: 2, order: 2, x: 660, y: 260, local: { x: 12, y: 0, z: 0 } },
    { index: 3, order: 3, x: 650, y: 300, local: { x: 10, y: 0, z: 5 } },
    { index: 4, order: 4, x: 600, y: 180, local: { x: -15, y: 0, z: -10 } },
    { index: 5, order: 5, x: 610, y: 220, local: { x: -14, y: 0, z: -5 } },
    { index: 6, order: 6, x: 620, y: 260, local: { x: -12, y: 0, z: 0 } },
    { index: 7, order: 7, x: 630, y: 300, local: { x: -10, y: 0, z: 5 } },
  ];

  const results = calculateSpatialSlotLayout({
    projectedSlots,
    stageWidth,
    stageHeight,
    nodeRadius: 17,
    calloutWidth: 200,
    calloutHeight: 36,
    edgeInset: 12,
    nameplateBottom: 90,
  });

  assert.equal(results.length, 8);
  for (let i = 0; i < results.length; i++) {
    const card = results[i];
    if (card.isLeft) {
      assert.ok(card.visualCardRight <= cx - 100);
    } else {
      assert.ok(card.visualCardLeft >= cx + 100);
    }
  }
});
