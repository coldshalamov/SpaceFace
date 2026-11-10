import assert from 'node:assert/strict';
import test from 'node:test';

import { ships } from '../src/systems/ships.js';

function host() {
  const events = [];
  const owned = { defId: 'ship_kestrel', fittings: [] };
  const api = Object.create(ships);
  api.bus = { emit(name, payload) { events.push({ name, payload }); } };
  api.state = {
    player: {
      moduleInventory: [{ instanceId: 'm1', defId: 'mod_engine_ion_m' }],
      credits: 0,
    },
  };
  api.ownedShip = () => owned;
  api.events = events;
  api.owned = owned;
  return api;
}

test('a refused fit keeps the module in the hold and names the slot', () => {
  const api = host();
  api.moduleFitBlocker = () => ({ reason: 'incompatible_slot', text: 'That module does not fit this slot.' });
  const ok = api.fitModule({ shipIndex: 0, slotIndex: 2, instanceId: 'm1' });
  assert.equal(ok, false);
  assert.equal(api.state.player.moduleInventory.length, 1);
  assert.equal(api.state.player.moduleInventory[0].instanceId, 'm1');
  assert.equal(api.owned.fittings[2], undefined);
  const refusal = api.events.find((event) => event.name === 'module:fitRefused');
  assert.ok(refusal);
  assert.equal(refusal.payload.slotIndex, 2);
  assert.equal(refusal.payload.reason, 'incompatible_slot');
  assert.ok(api.events.some((event) => event.name === 'toast'));
});

test('a fit the hull accepts still moves that one module into the slot', () => {
  const api = host();
  api.moduleFitBlocker = () => null;
  api.recomputeIfActive = () => {};
  api.nextInstanceId = () => 'next';
  api.shipIdFor = () => 'kestrel-1';
  const ok = api.fitModule({ shipIndex: 0, slotIndex: 0, instanceId: 'm1' });
  assert.equal(ok, true);
  assert.equal(api.state.player.moduleInventory.length, 0);
  assert.equal(api.owned.fittings[0], 'mod_engine_ion_m');
  assert.equal(api.events.some((event) => event.name === 'module:fitRefused'), false);
  assert.ok(api.events.some((event) => event.name === 'module:equipped'));
});
