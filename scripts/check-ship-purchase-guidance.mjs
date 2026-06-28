import assert from 'node:assert/strict';

import { ships } from '../src/systems/ships.js';

function createBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makeSystem(credits) {
  const bus = createBus();
  const state = {
    tick: 1,
    playerId: 1,
    entities: new Map(),
    player: {
      credits,
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }],
      moduleInventory: [],
      researchedNodes: [],
      efficiencyMods: {},
      cargo: { usedVolume: 0, capVolume: 40, items: {} },
    },
  };
  const sys = Object.create(ships);
  sys.init({ state, bus, helpers: {} });
  return { sys, bus, state };
}

let h = makeSystem(500);
assert.equal(h.sys.buyModule({ defId: 'mod_shield_booster_s' }), false);
assert.equal(h.bus.events.at(-1).payload.text, 'Need 5,500 more cr for Shield Booster S');
assert.doesNotMatch(h.bus.events.at(-1).payload.text, /Insufficient credits|6000/);
assert.equal(h.state.player.moduleInventory.length, 0, 'failed module purchases must not grant inventory');

h = makeSystem(500);
assert.equal(h.sys.buyShip({ defId: 'ship_pelican' }), false);
assert.equal(h.bus.events.at(-1).payload.text, 'Need 21,500 more cr for Pelican');
assert.doesNotMatch(h.bus.events.at(-1).payload.text, /Insufficient credits|22000/);
assert.equal(h.state.player.ownedShips.length, 1, 'failed ship purchases must not grant a hull');

console.log('Ship purchase guidance OK - direct purchase blockers show missing credits and target names.');
