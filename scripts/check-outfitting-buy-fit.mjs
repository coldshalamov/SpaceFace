import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  describeOutfittingPurchase,
  buildOutfittingEngineeringFeel,
  missionFitGuide,
  missionPickForOutfitting,
  outfittingEngineeringFeelHtml,
  recommendOutfittingPurchase,
  slotReadiness,
  statSnippet,
} from '../src/ui/station/outfittingGuidance.js';
import {
  MASS_LOAD_LAW,
  buildSlotList,
  designMassForHull,
  findMasslineHeadConflict,
  fittingsFromDefaultModules,
  getDerivedStats,
  massLoadFactor,
  outfitBudgetBlocker,
  outfitBudgetForFittings,
  ships,
} from '../src/systems/ships.js';

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

const ramPlate = moduleById('mod_ram_plate');
assert.equal(statSnippet(ramPlate), '+80% ram dmg',
  'the shop describes the Ram Plate combat verb before purchase');
assert.equal(getDerivedStats(shipDef.id, fittingsFromDefaultModules(shipDef.id, [ramPlate.id])).ramDamageDealtMult, 1.8,
  'a fitted Ram Plate reaches the live derived ship state');
assert.equal(getDerivedStats(shipDef.id, []).ramDamageDealtMult, 0,
  'ordinary craft contact remains non-damaging without a Ram Plate');

for (const hull of SHIPS) {
  assert.ok(Number.isFinite(hull.outfitSpace) && hull.outfitSpace > 0, hull.id + ' authors outfitSpace');
  assert.ok(Number.isFinite(hull.weaponCapacity) && hull.weaponCapacity >= 0, hull.id + ' authors weaponCapacity');
  assert.ok(Number.isFinite(hull.engineCapacity) && hull.engineCapacity >= 0, hull.id + ' authors engineCapacity');
}

const starterFittings = fittingsFromDefaultModules('ship_kestrel', [
  'wpn_pulse_laser_s',
  'mod_mining_laser_s',
  'mod_engine_ion_m',
  'mod_shield_booster_s',
]);
const starterBudget = outfitBudgetForFittings(shipDef, starterFittings);
assert.equal(starterBudget.fits, true, 'the shipped starter fit remains inside all nested budgets');
assert.equal(outfitBudgetBlocker(shipDef, starterFittings), null);
assert.match(outfittingEngineeringFeelHtml(buildOutfittingEngineeringFeel({
  shipId: shipDef.id,
  fittings: starterFittings,
})), /Fit mass[\s\S]*\d+\/20 t total[\s\S]*weapons[\s\S]*engine/,
'the live engineering readout exposes all three authored budgets');

const overloadedStarter = fittingsFromDefaultModules('ship_kestrel', [
  'wpn_autocannon_s',
  'mod_shield_booster_s',
  'mod_engine_fusion_m',
  'mod_smuggler_hold',
  'mod_mining_laser_s',
  'mod_ram_plate',
]);
assert.equal(outfitBudgetBlocker(shipDef, overloadedStarter)?.reason, 'outfit_space',
  'a slot-compatible heavy build is still rejected by the master pool');

const waspDef = SHIPS.find((entry) => entry.id === 'ship_wasp');
const waspSlots = buildSlotList(waspDef);
const oneHeavyGun = fittingsFromDefaultModules(waspDef.id, ['wpn_autocannon_s']);
const secondGunPurchase = describeOutfittingPurchase(
  weaponById('wpn_autocannon_s'),
  { credits: 10000, researchedNodes: ['tech_combat_basics'] },
  waspSlots,
  oneHeavyGun,
  waspDef,
);
assert.equal(secondGunPurchase.state, 'inventory', 'an over-cap second gun is not promised as Buy & Fit');
assert.equal(secondGunPurchase.fitBlocker?.reason, 'weapon_capacity');
assert.match(secondGunPurchase.title, /Weapon capacity exceeded \(8\/7 t\)/);
let feel = buildOutfittingEngineeringFeel({
  shipId: 'ship_kestrel',
  fittings: starterFittings,
  player: { cargo: { usedMass: 0 }, efficiencyMods: {} },
});
assert.equal(feel.mode, 'current');
assert.equal(feel.profile.axes.length, 4, 'current fit exposes all four live flight-model axes');
assert.equal(feel.delta, null, 'current fit does not manufacture a before/after change');

const engineSlot = slots.findIndex((slot) => slot.type === 'engine');
feel = buildOutfittingEngineeringFeel({
  shipId: 'ship_kestrel',
  fittings: starterFittings,
  preview: { slotIndex: engineSlot, defId: 'mod_engine_fusion_m' },
  player: { cargo: { usedMass: 0 }, efficiencyMods: {} },
});
assert.equal(feel.mode, 'preview');
assert.equal(feel.afterFittings[engineSlot], 'mod_engine_fusion_m');
assert.ok(feel.delta.metrics.some((metric) => metric.id === 'topSpeed' && metric.delta > 0),
  'engine hover previews the real derived top-speed change');
assert.match(outfittingEngineeringFeelHtml(feel), /Fusion Drive M preview/);
assert.match(outfittingEngineeringFeelHtml(feel), /Top speed <b>\+/,
  'player-facing panel renders the measured fitting delta');

const cargoSlot = slots.findIndex((slot) => slot.type === 'cargo');
feel = buildOutfittingEngineeringFeel({
  shipId: 'ship_kestrel',
  fittings: starterFittings,
  preview: { slotIndex: cargoSlot, defId: 'mod_smuggler_hold' },
  player: { cargo: { usedMass: 0 }, efficiencyMods: {} },
});
assert.ok(feel.risks.risks.some((risk) => risk.id === 'contraband'),
  'previewed fit exposes a risk already declared by live module data');
assert.match(outfittingEngineeringFeelHtml(feel), /Contraband/);

feel = buildOutfittingEngineeringFeel({
  shipId: 'ship_kestrel',
  fittings: starterFittings,
  preview: { slotIndex: cargoSlot, defId: 'mod_cargo_pod_m' },
});
assert.equal(feel.mode, 'unavailable', 'incompatible preview fails closed');
assert.match(outfittingEngineeringFeelHtml(feel), /Preview unavailable/);

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

// Swing Drive M rides the first station's rack: Helios stocks it at first-haul price with no
// Drive Tuning stop; the catalog price and the research gate stand everywhere else.
const swingDrive = moduleById('mod_swing_drive_m');
assert.equal(swingDrive.price, 19000, 'the catalog keeps the Swing Drive price');
assert.equal(swingDrive.requiresTech, 'tech_drive_tuning', 'the Swing Drive stays on its tech node');
assert.match(statSnippet(swingDrive), /dash swings around a taut line/i,
  'the shop describes the Swing Drive pendulum verb before purchase');
assert.doesNotMatch(statSnippet(swingDrive), /%/, 'the shop sentence carries no percentage');
guidance = describeOutfittingPurchase(swingDrive, {
  credits: 12000,
  researchedNodes: [],
}, slots, [], shipDef, { stationId: 'station_helios' });
assert.equal(guidance.unlocked, true, 'the first-station listing waives the research stop');
assert.equal(guidance.price, 12000, 'one starter-field haul pays the listing price');
assert.equal(guidance.disabled, false, 'the first station sells it to an unresearched pilot');
guidance = describeOutfittingPurchase(swingDrive, {
  credits: 12000,
  researchedNodes: [],
}, slots, [], shipDef, { stationId: 'station_tethys' });
assert.equal(guidance.state, 'locked', 'off the first station the research gate still stands');
assert.equal(guidance.price, 19000, 'off the first station the catalog price stands');

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

bus.events.length = 0;
assert.equal(sys.buyModule({ defId: 'mod_shield_booster_s', fitSlotIndex: 1 }), true,
  'buy-and-fit can replace the selected occupied compatible slot');
assert.equal(state.player.ownedShips[0].fittings[1], 'mod_shield_booster_s',
  'replacement keeps the purchased module in the selected slot');
assert.equal(state.player.moduleInventory.length, 1,
  'replacement returns the removed module to inventory');
assert.equal(state.player.moduleInventory[0].defId, 'mod_shield_booster_s',
  'replacement inventory record is the displaced fitting');
assert.equal(eventPayload(bus.events, 'module:purchased').fitSlotIndex, 1,
  'replacement purchase receipt retains the selected fitting slot');

const drifterDef = SHIPS.find((entry) => entry.id === 'ship_drifter');
const drifterSlots = buildSlotList(drifterDef);
const utilitySlotIndexes = drifterSlots.filter((slot) => slot.type === 'utility').map((slot) => slot.index);
const tractor = moduleById('mod_tractor_beam_m');
const elasticWhip = moduleById('mod_elastic_whip_m');
const drifterFittings = new Array(drifterSlots.length).fill(null);
drifterFittings[utilitySlotIndexes[0]] = tractor.id;
assert.equal(findMasslineHeadConflict(drifterFittings, utilitySlotIndexes[1], elasticWhip), tractor,
  'a second Massline head in another utility slot is an exclusive-fit conflict');
assert.equal(findMasslineHeadConflict(drifterFittings, utilitySlotIndexes[0], elasticWhip), null,
  'replacing the head in its current slot remains valid');

guidance = describeOutfittingPurchase(elasticWhip, {
  credits: 100000,
  researchedNodes: ['tech_tractor_systems'],
}, drifterSlots, drifterFittings);
assert.equal(guidance.fitSlotIndex, -1, 'compatibility Outfitting must not promise a second head will fit');
assert.equal(guidance.state, 'inventory', 'a conflicting head remains an explicit inventory-only purchase');

const conflictBus = createBus();
const conflictState = {
  tick: 18,
  playerId: 1,
  entities: new Map(),
  player: {
    credits: 100000,
    activeShipIndex: 0,
    ownedShips: [{ defId: drifterDef.id, fittings: drifterFittings.slice() }],
    moduleInventory: [],
    researchedNodes: ['tech_tractor_systems'],
    efficiencyMods: {},
    cargo: { usedVolume: 0, capVolume: 40, items: {} },
  },
};
const conflictSystem = Object.create(ships);
conflictSystem.init({ state: conflictState, bus: conflictBus, helpers: {} });
assert.equal(conflictSystem.buyModule({ defId: elasticWhip.id, fitSlotIndex: utilitySlotIndexes[1] }), false,
  'a rejected second-head Buy & Fit must fail atomically');
assert.deepEqual(conflictState.player.ownedShips[0].fittings, drifterFittings,
  'failed Buy & Fit must preserve the loadout');
assert.equal(conflictState.player.moduleInventory.length, 0,
  'failed Buy & Fit must not deposit an unwanted inventory item');
assert.equal(conflictBus.events.some((entry) => entry.name === 'economy:chargeCredits'), false,
  'failed Buy & Fit must not charge credits');
assert.equal(conflictBus.events.some((entry) => entry.name === 'module:purchased'), false,
  'failed Buy & Fit must not publish a purchase receipt');

const capacityBus = createBus();
const capacityState = {
  tick: 19,
  playerId: 1,
  entities: new Map(),
  player: {
    credits: 10000,
    activeShipIndex: 0,
    ownedShips: [{ defId: waspDef.id, fittings: oneHeavyGun.slice() }],
    moduleInventory: [{ instanceId: 'capacity_gun', defId: 'wpn_autocannon_s' }],
    researchedNodes: ['tech_combat_basics'],
    efficiencyMods: {},
    cargo: { usedVolume: 0, capVolume: 15, items: {} },
  },
};
const capacitySystem = Object.create(ships);
capacitySystem.init({ state: capacityState, bus: capacityBus, helpers: {} });
assert.equal(capacitySystem.fitModule({ slotIndex: 1, instanceId: 'capacity_gun' }), false,
  'inventory fitting cannot exceed the weapon sub-pool');
assert.deepEqual(capacityState.player.ownedShips[0].fittings, oneHeavyGun,
  'a rejected capacity fit preserves the installed loadout');
assert.deepEqual(capacityState.player.moduleInventory,
  [{ instanceId: 'capacity_gun', defId: 'wpn_autocannon_s' }],
  'a rejected capacity fit preserves inventory');
assert.match(eventPayload(capacityBus.events, 'toast').text, /Weapon capacity exceeded \(8\/7 t\)/,
  'the runtime explains the exact over-cap budget');

capacityBus.events.length = 0;
assert.equal(capacitySystem.buyModule({ defId: 'wpn_autocannon_s', fitSlotIndex: 1 }), false,
  'Buy & Fit rejects the same over-cap loadout before mutation');
assert.equal(capacityState.player.credits, 10000, 'a rejected capacity Buy & Fit does not spend credits');
assert.equal(capacityState.player.moduleInventory.length, 1, 'a rejected capacity Buy & Fit does not add inventory');
assert.equal(capacityBus.events.some((entry) => entry.name === 'economy:chargeCredits'), false);
assert.equal(capacityBus.events.some((entry) => entry.name === 'module:purchased'), false);

// ---------------------------------------------------------------------------------------------
// PQ-176.00 — mass is the law. The migration clause of the leaf's done-when: adding a drive rating
// to every hull may not invalidate a single fit that was legal before it, and may not silently move
// a ship that was already at or under its rating (that is what keeps every bare-hull bench, every
// unfitted NPC and every default-fit golden tape bit-identical).
for (const hull of SHIPS) {
  const design = designMassForHull(hull);
  assert.ok(Number.isFinite(hull.designMass) && hull.designMass > 0,
    hull.id + ' authors a positive designMass (the operational mass its drive is rated for)');
  assert.ok(design >= hull.mass,
    hull.id + ' cannot be rated below its own dry hull: an empty hull would fly worse than new');
  assert.ok(design <= hull.mass + hull.outfitSpace,
    hull.id + ' rating must be reachable and exceedable — a rating above hull + full outfit space '
    + 'would make module mass free forever');

  // The empty hull and the hull loaded exactly to its rating keep 100 % of the authored drive.
  assert.equal(massLoadFactor(hull, hull.mass), 1,
    hull.id + ' bare hull must keep its authored acceleration exactly (no golden may move for this law)');
  assert.equal(massLoadFactor(hull, design), 1,
    hull.id + ' at its design rating must keep its authored acceleration exactly');

  // One tonne over the rating already costs something, and the loss is monotone in mass and floored.
  const overOne = massLoadFactor(hull, design + 1);
  const overTen = massLoadFactor(hull, design * 10);
  assert.ok(overOne < 1, hull.id + ' must lose acceleration the moment it is heavier than its rating');
  assert.ok(overTen < overOne, hull.id + ' overload loss must be monotone in operational mass');
  assert.ok(overTen >= MASS_LOAD_LAW.floor,
    hull.id + ' can never be loaded into being unsteerable — the floor is the safety net');

  // Every hull can still be filled to its own outfit space and remain a legal, flyable fit.
  const maxLoad = massLoadFactor(hull, hull.mass + hull.outfitSpace);
  assert.ok(maxLoad > MASS_LOAD_LAW.floor,
    hull.id + ' fully outfitted with an empty hold must stay well above the acceleration floor');
}

// The shipped starter fit is exactly what the Hitch is rated for: a new game flies bit-identically.
const starterDerived = getDerivedStats('ship_kestrel', starterFittings, null);
assert.equal(starterDerived.massLoadFactor, 1,
  'the shipped starter fit must sit at or under the Hitch rating — a new game may not fly slower for this law');
assert.equal(
  starterDerived.propulsion.mainAccel,
  getDerivedStats('ship_kestrel', [], null).propulsion.mainAccel,
  'the shipped starter fit and the bare hull must publish the same main acceleration',
);

// A loaded hold reaches the propulsion profile — the one thing that was broken before this leaf.
const loadedStarter = getDerivedStats('ship_kestrel', starterFittings, {
  cargo: { usedMass: 400 },
});
assert.ok(loadedStarter.operationalMass > starterDerived.operationalMass,
  'cargo mass must reach the derived operational mass');
assert.ok(loadedStarter.propulsion.mainAccel < starterDerived.propulsion.mainAccel,
  'a loaded hold must cost main acceleration — mass enters through the propulsion profile, never a drag write');
assert.equal(loadedStarter.propulsion.combatSpeed, starterDerived.propulsion.combatSpeed,
  'mass costs acceleration, never the governed speed the pilot is allowed to reach');
assert.ok(!('drag' in loadedStarter.propulsion),
  'the mass law may never introduce a drag term into the propulsion profile');

console.log('Outfitting buy-and-fit checks OK');
