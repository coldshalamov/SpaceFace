// U3: a convoy the pilot defended docks safe — the destination desk remembers the
// wingman on its traffic rail, and the berth-arrival card reads the line back.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary } from '../src/systems/stationContactLoadBoundary.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

function harness() {
  const bus = createBus();
  const state = { simTime: 900, player: {}, world: { currentSectorId: 'sector_vesta_forge' } };
  const contacts = { ...stationContacts };
  const boundary = { ...stationContactLoadBoundary };
  contacts.init({ state, bus });
  boundary.init({ state, bus });
  return { bus, state, contacts, boundary };
}

test('the escorted resolve writes one wingman line at the destination station', () => {
  const h = harness();
  try {
    h.bus.emit('encounter:convoyEscorted', {
      stationId: 'station_vesta', sectorId: 'sector_vesta_forge', encounterId: 'convoy-77',
    });
    const line = h.state.stationLife.traffic.find((e) => e.stationId === 'station_vesta');
    assert.ok(line, 'traffic rail holds the escort memory');
    assert.equal(line.kind, 'convoy_escort');
    assert.match(line.text, /wingman/i);
    assert.equal(line.intentId, 'encounter:convoyEscorted:convoy-77');
  } finally { h.boundary.destroy(); h.contacts.destroy(); }
});

test('a second escorted resolve for the same convoy cannot double the memory', () => {
  const h = harness();
  try {
    const payload = { stationId: 'station_vesta', sectorId: 'sector_vesta_forge', encounterId: 'convoy-77' };
    h.bus.emit('encounter:convoyEscorted', payload);
    const before = h.state.stationLife.traffic.length;
    h.bus.emit('encounter:convoyEscorted', { ...payload });
    assert.equal(h.state.stationLife.traffic.length, before, 'intentId dedupes the replay');
  } finally { h.boundary.destroy(); h.contacts.destroy(); }
});

test('a convoy with no destination station tells no story', () => {
  const h = harness();
  try {
    h.bus.emit('encounter:convoyEscorted', { stationId: null, sectorId: 'sector_vesta_forge', encounterId: 'convoy-9' });
    h.bus.emit('encounter:convoyEscorted', { sectorId: 'sector_vesta_forge', encounterId: 'convoy-10' });
    assert.equal(h.state.stationLife.traffic.some((e) => e.kind === 'convoy_escort'), false);
  } finally { h.boundary.destroy(); h.contacts.destroy(); }
});

test('the memory reads back on the destination dock card', () => {
  const h = harness();
  try {
    h.bus.emit('encounter:convoyEscorted', {
      stationId: 'station_vesta', sectorId: 'sector_vesta_forge', encounterId: 'convoy-88',
    });
    const view = buildDockArrival({
      player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
      missions: { active: [] },
      ui: { marketNews: { log: [], lastCard: null } },
      stationLife: h.state.stationLife,
    }, { id: 'station_vesta', services: ['trade', 'refuel', 'repair'] });
    assert.ok(
      view.traffic && view.traffic.includes('lane wingman'),
      `berth traffic line carries the wingman memory, got: ${JSON.stringify(view.traffic)}`,
    );
  } finally { h.boundary.destroy(); h.contacts.destroy(); }
});
