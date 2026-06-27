import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

function eventPayload(events, name) {
  const event = events.find((entry) => entry.name === name);
  return event && event.payload;
}

const outfitSource = readFileSync(new URL('../src/ui/screens/outfitting.js', import.meta.url), 'utf8');
assert.match(outfitSource, /Buy &amp; Fit/, 'Outfitting shop should expose a Buy & Fit action for empty compatible slots');
assert.match(outfitSource, /data-fit-slot/, 'Outfitting shop should carry the target slot index on Buy & Fit buttons');
assert.match(outfitSource, /fitSlotIndex/, 'Outfitting shop should emit fitSlotIndex through ui:buyModule');

const bus = createBus();
const state = {
  tick: 17,
  playerId: 1,
  entities: new Map(),
  player: {
    credits: 10000,
    activeShipIndex: 0,
    ownedShips: [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }],
    moduleInventory: [],
    researchedNodes: [],
    efficiencyMods: {},
    cargo: { usedVolume: 0, capVolume: 40, items: {} },
  },
};
state.entities.set(1, {
  id: 1,
  alive: true,
  type: 'ship',
  data: { defId: 'ship_kestrel' },
  hull: 120,
  hullMax: 120,
  shield: 40,
  shieldMax: 40,
  cap: 80,
  capMax: 80,
});

const sys = Object.create(ships);
sys.init({ state, bus, helpers: {} });

const ok = sys.buyModule({ defId: 'mod_shield_booster_s', fitSlotIndex: 1 });

assert.equal(ok, true, 'buyModule should accept a valid buy-and-fit request');
assert.equal(state.player.ownedShips[0].fittings[1], 'mod_shield_booster_s',
  'buy-and-fit should equip the purchased module into the requested slot');
assert.equal(state.player.moduleInventory.length, 0,
  'buy-and-fit should not leave a duplicate inventory item after equipping');
assert.equal(eventPayload(bus.events, 'economy:chargeCredits').amount, 6000,
  'buy-and-fit should still route credits through the economy charge event');
assert.equal(eventPayload(bus.events, 'module:purchased').fitSlotIndex, 1,
  'module:purchased should report the fitted slot for UI/probe confidence');
assert.equal(eventPayload(bus.events, 'module:equipped').defId, 'mod_shield_booster_s',
  'buy-and-fit should emit the canonical module:equipped event');
assert(bus.events.some((entry) => entry.name === 'toast' && /Purchased and equipped Shield Booster S/.test(entry.payload && entry.payload.text)),
  'buy-and-fit should tell the player the module was equipped immediately');

console.log('Outfitting buy-and-fit checks OK');
