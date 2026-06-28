import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  describeOutfittingPurchase,
  missionFitGuide,
  missionPickForOutfitting,
  recommendOutfittingPurchase,
  slotReadiness,
} from '../src/ui/screens/outfitting.js';
import { buildSlotList, ships } from '../src/systems/ships.js';

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
assert.match(outfitSource, /Buy & Fit/, 'Outfitting shop should expose a Buy & Fit action for empty compatible slots');
assert.match(outfitSource, /Buy to Inventory/, 'Outfitting shop should name inventory-only purchases');
assert.match(outfitSource, /describeOutfittingPurchase/, 'Outfitting shop should centralize purchase guidance');
assert.match(outfitSource, /data-fit-slot/, 'Outfitting shop should carry the target slot index on Buy & Fit buttons');
assert.match(outfitSource, /fitSlotIndex/, 'Outfitting shop should emit fitSlotIndex through ui:buyModule');
assert.match(outfitSource, /aria-label="/, 'Outfitting shop buttons should expose accessible action guidance');
assert.match(outfitSource, /MISSION FIT ADVISOR/, 'Outfitting should explain how the tracked mission maps to the fitting bay');
assert.match(outfitSource, /Pick a contract on the Mission Board/, 'Outfitting should send uncommitted players back to the Mission Board first');
assert.match(outfitSource, /job fit/, 'Outfitting shop should tag modules that match the tracked mission fit');
assert.match(outfitSource, /missionFitGuide/, 'Outfitting should centralize mission-type fit guidance');
assert.match(outfitSource, /recommendOutfittingPurchase/, 'Outfitting should centralize next-buy recommendation guidance');
assert.match(outfitSource, /Next buy:/, 'Outfitting advisor should name the next concrete shop action');
assert.match(outfitSource, /st-outfit-nextbuy/, 'Outfitting advisor should render the next-buy guidance as player-facing copy');

const trackedPick = missionPickForOutfitting({
  ui: { trackedMissionId: 'm_smuggle' },
  missions: {
    active: [
      { id: 'm_haul', type: 'cargo_delivery', status: 'active' },
      { id: 'm_smuggle', type: 'smuggling_run', status: 'active' },
    ],
  },
});
assert.equal(trackedPick.tracked, true, 'outfitting advisor should prefer the tracked mission');
assert.equal(trackedPick.mission.id, 'm_smuggle');

const fallbackPick = missionPickForOutfitting({
  ui: { trackedMissionId: 'missing' },
  missions: {
    active: [
      { id: 'm_failed', type: 'cargo_delivery', status: 'completed' },
      { id: 'm_bounty', type: 'bounty_hunt', status: 'active' },
    ],
  },
});
assert.equal(fallbackPick.tracked, false, 'outfitting advisor should mark untracked active fallback honestly');
assert.equal(fallbackPick.mission.id, 'm_bounty');

assert.deepEqual(missionFitGuide({ type: 'bounty_hunt' }).wants, ['weapon', 'shield', 'engine'],
  'combat contracts should guide the shop toward weapons, shields, and engines');
assert.deepEqual(missionFitGuide({ type: 'mining_quota' }).wants, ['mining', 'cargo', 'shield'],
  'mining contracts should guide the shop toward mining beams, cargo, and shields');
assert.deepEqual(slotReadiness([{ type: 'weapon' }, { type: 'shield' }], { fittings: [null, 'mod_shield_booster_s'] }, 'shield'),
  { kind: 'ok', text: 'SHIELD: 1 fitted' },
  'slot readiness should show fitted mission-critical slots');
assert.deepEqual(slotReadiness([{ type: 'weapon' }, { type: 'shield' }], { fittings: [null, null] }, 'engine'),
  { kind: 'bad', text: 'ENGINE: no slot' },
  'slot readiness should warn when this hull cannot satisfy a mission slot family');

const shipDef = SHIPS.find((entry) => entry.id === 'ship_kestrel');
const slots = buildSlotList(shipDef);
const moduleById = (id) => MODULES.find((entry) => entry.id === id);
const weaponById = (id) => WEAPONS.find((entry) => entry.id === id);

let nextBuy = recommendOutfittingPurchase({
  credits: 10000,
  researchedNodes: [],
}, slots, [], {
  wantedSlots: ['weapon', 'shield', 'engine'],
  tier: 0,
  items: [
    weaponById('wpn_pulse_laser_s'),
    moduleById('mod_shield_booster_s'),
    moduleById('mod_engine_ion_m'),
  ],
});
assert.equal(nextBuy.kind, 'ok', 'affordable mission-fit gear should be a positive recommendation');
assert.equal(nextBuy.state, 'fit', 'next buy should prefer a module that can fit the active hull now');
assert.equal(nextBuy.title, 'Next buy: Pulse Laser S');
assert.match(nextBuy.detail, /Matches the tracked job fit/);

nextBuy = recommendOutfittingPurchase({
  credits: 1000,
  researchedNodes: [],
}, slots, [], {
  wantedSlots: ['shield'],
  tier: 0,
  items: [moduleById('mod_shield_booster_s')],
});
assert.equal(nextBuy.kind, 'warn', 'unaffordable mission-fit gear should be a prep warning');
assert.equal(nextBuy.state, 'funding');
assert.match(nextBuy.title, /Need 5,000 cr: Shield Booster S/);
assert.match(nextBuy.detail, /Run a contract or trade loop/);

nextBuy = recommendOutfittingPurchase({
  credits: 10000,
  researchedNodes: [],
}, slots, [], {
  wantedSlots: ['cargo'],
  tier: 0,
  items: [moduleById('mod_cargo_pod_m')],
});
assert.equal(nextBuy.kind, 'warn', 'gear that cannot fit the current hull should not be pitched as ready');
assert.equal(nextBuy.state, 'hull');
assert.match(nextBuy.title, /Need compatible hull slot: Cargo Pod M/);

let guidance = describeOutfittingPurchase(moduleById('mod_shield_capacitor_m'), {
  credits: 100000,
  researchedNodes: [],
}, slots, []);
assert.equal(guidance.state, 'locked');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Deflector Theory');
assert.match(guidance.title, /requires Deflector Theory/);

guidance = describeOutfittingPurchase(moduleById('mod_shield_booster_s'), {
  credits: 500,
  researchedNodes: [],
}, slots, []);
assert.equal(guidance.state, 'funding');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need 5,500 cr');

guidance = describeOutfittingPurchase(moduleById('mod_shield_booster_s'), {
  credits: 10000,
  researchedNodes: [],
}, slots, []);
assert.equal(guidance.state, 'fit');
assert.equal(guidance.disabled, false);
assert.equal(guidance.label, 'Buy & Fit');
assert.equal(guidance.fitSlotIndex, 1);

guidance = describeOutfittingPurchase(moduleById('mod_shield_booster_s'), {
  credits: 10000,
  researchedNodes: [],
}, slots, [null, 'mod_shield_booster_s']);
assert.equal(guidance.state, 'inventory');
assert.equal(guidance.label, 'Buy to Inventory');
assert.match(guidance.title, /compatible slot is full/);

guidance = describeOutfittingPurchase(moduleById('mod_cargo_pod_m'), {
  credits: 10000,
  researchedNodes: [],
}, slots, []);
assert.equal(guidance.state, 'inventory');
assert.equal(guidance.hasSlot, false);
assert.equal(guidance.label, 'Buy to Inventory');
assert.match(guidance.title, /No compatible cargo M slot/);

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
