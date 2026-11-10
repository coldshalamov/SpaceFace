import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';

// FIGHT-02 — a defeated boss is announced by the run's own voice: `boss:defeated` produces
// one announcement line per defeat, only for the player's own kill.

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = createBus();
  const said = [];
  bus.on('voice:say', (p) => said.push(p));
  const system = Object.assign({}, survivalAnnounce);
  system.init({ state, bus, helpers: {}, registry: null });
  state.playerId = 7;
  return { state, bus, said, system };
}

test('FIGHT-02: boss:defeated produces one named announcement line', () => {
  const h = boot();
  h.bus.emit('boss:defeated', { sectorId: 'sec_helios', poiId: 'poi_dread', killerId: 7, poiName: 'The Toll-Warden' });
  const lines = h.said.filter((p) => p.id === 'boss:defeated:sec_helios:poi_dread');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].channel, 'objective');
  assert.match(lines[0].text, /Toll-Warden is down\./);
});

test('FIGHT-02: one line per defeat — a replayed emit for the same record stays silent', () => {
  const h = boot();
  const payload = { sectorId: 'sec_helios', poiId: 'poi_dread', killerId: 7, poiName: 'The Toll-Warden' };
  h.bus.emit('boss:defeated', payload);
  h.bus.emit('boss:defeated', payload);
  h.bus.emit('boss:defeated', { sectorId: 'sec_helios', poiId: 'poi_gate_keeper', killerId: 7 });
  assert.equal(h.said.length, 2, 'same defeat deduped; a second defeat still speaks');
});

test('FIGHT-02: an NPC-vs-NPC boss kill is not announced', () => {
  const h = boot();
  h.bus.emit('boss:defeated', { sectorId: 'sec_helios', poiId: 'poi_dread', killerId: 42 });
  h.bus.emit('boss:defeated', { sectorId: 'sec_helios', poiId: 'poi_dread', killerId: null });
  assert.equal(h.said.length, 0);
});
