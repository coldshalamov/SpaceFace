import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import {
  buildSlotList,
  ships as shipsPrototype,
  stationShopOffer,
} from '../src/systems/ships.js';
import { describeOutfittingPurchase, statSnippet } from '../src/ui/station/outfittingGuidance.js';
import { describeOutfittingSpendConfirm } from '../src/ui/outfittingSpendConfirm.js';

// Swing Drive M lands on the first station's rack: Helios stocks it at first-haul price with no
// Drive Tuning stop. Everywhere else the catalog price and the research gate stand unchanged.
const SWING = MODULES.find((d) => d.id === 'mod_swing_drive_m');
const KESTREL = SHIPS.find((s) => s.id === 'ship_kestrel');
const DRIFTER = SHIPS.find((s) => s.id === 'ship_drifter');
const kestrelSlots = buildSlotList(KESTREL);
const drifterSlots = buildSlotList(DRIFTER);
const drifterUtilityM = drifterSlots.findIndex((s) => s.type === 'utility' && s.size === 'M');

function buildHarness({ docked = true, stationId = 'station_helios', shipDefId = 'ship_kestrel', credits = 12000, researchedNodes = [] } = {}) {
  const state = createGameState(0x5a17);
  state.player.credits = credits;
  state.player.researchedNodes = researchedNodes;
  const slots = buildSlotList(SHIPS.find((s) => s.id === shipDefId));
  state.player.ownedShips = [{ defId: shipDefId, fittings: new Array(slots.length).fill(null) }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  state.ui.docked = docked;
  state.ui.dockedStationId = stationId;

  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, toasts };
}

test('the catalog entry keeps its price and research gate, with no added drawback', () => {
  assert.equal(SWING.price, 19000, 'catalog price is unchanged');
  assert.equal(SWING.requiresTech, 'tech_drive_tuning', 'the module stays on the Drive Tuning node');
  assert.deepEqual(Object.keys(SWING.mods), ['swingDrive'], 'no drawback mods were added');
  assert.equal(SWING.legality, undefined, 'no legality drawback was added');
  assert.equal(SWING.energyDraw, 3, 'energy draw unchanged');
});

test('the shop listing resolves only at the first station at first-haul price', () => {
  const offer = stationShopOffer(SWING, 'station_helios');
  assert.equal(offer.price, 12000, 'one starter-field haul pays for it');
  assert.equal(stationShopOffer(SWING, 'station_tethys'), null, 'another shipyard stocks nothing special');
  assert.equal(stationShopOffer(SWING, null), null);
  assert.equal(stationShopOffer(MODULES.find((d) => d.id === 'mod_ram_plate'), 'station_helios'), null,
    'no other module carries the listing');
});

test('outfitting guidance sells it unresearched at the first station', () => {
  const noTech = { credits: 12000, researchedNodes: [] };
  const atHelios = describeOutfittingPurchase(SWING, noTech, kestrelSlots, [], KESTREL, { stationId: 'station_helios' });
  assert.equal(atHelios.unlocked, true);
  assert.equal(atHelios.price, 12000);
  assert.equal(atHelios.disabled, false);
  assert.equal(atHelios.state, 'inventory', 'the Hitch has no M utility slot — it buys to the hold');
  assert.equal(atHelios.label, 'Buy to Inventory');

  const onDrifter = describeOutfittingPurchase(SWING, noTech, drifterSlots, [], DRIFTER, { stationId: 'station_helios' });
  assert.equal(onDrifter.state, 'fit');
  assert.equal(onDrifter.label, 'Buy & Fit');
  assert.equal(onDrifter.price, 12000);
});

test('outfitting guidance keeps the research stop at every other station', () => {
  const noTech = { credits: 12000, researchedNodes: [] };
  for (const stationId of ['station_tethys', 'station_forge', null]) {
    const view = describeOutfittingPurchase(SWING, noTech, drifterSlots, [], DRIFTER, { stationId });
    assert.equal(view.state, 'locked', `expected locked at ${stationId}`);
    assert.equal(view.label, 'Research Drive Tuning');
    assert.equal(view.price, 19000, 'catalog price stands elsewhere');
  }
});

test('the rest of the Drive Tuning node stays locked at the first station', () => {
  const noTech = { credits: 500000, researchedNodes: [] };
  for (const defId of ['mod_afterburner_m', 'mod_cloak_mk2', 'mod_jump_drive_m', 'mod_sensor_scrambler_m', 'mod_engine_fusion_m']) {
    const def = MODULES.find((d) => d.id === defId);
    const view = describeOutfittingPurchase(def, noTech, drifterSlots, [], DRIFTER, { stationId: 'station_helios' });
    assert.equal(view.state, 'locked', `${defId} must still require Drive Tuning at Helios`);
    assert.equal(view.price, def.price, `${defId} keeps its catalog price`);
  }
});

test('the shop sentence says what the ship does, not a percentage', () => {
  const snippet = statSnippet(SWING);
  assert.match(snippet, /dash swings around a taut line/i);
  assert.doesNotMatch(snippet, /%/, 'no percentage wording');
});

test('the spend confirm quotes the station price, not the catalog price', () => {
  const confirm = describeOutfittingSpendConfirm(SWING, 12000, { price: 12000 });
  assert.match(confirm.body, /Cost: 12,000 CR/);
  assert.doesNotMatch(confirm.body, /19,000/);
  assert.equal(confirm.danger, true, 'a whole-haul spend is honestly flagged as heavy');
});

test('docked at the first station, ui:buyModule sells it without research at the listing price', () => {
  const h = buildHarness({ stationId: 'station_helios', credits: 12000 });
  h.bus.emit('ui:buyModule', { defId: 'mod_swing_drive_m' });
  assert.equal(h.state.player.moduleInventory.length, 1);
  assert.equal(h.state.player.moduleInventory[0].defId, 'mod_swing_drive_m');
  assert.equal(h.state.player.credits, 0, 'charged the 12,000 listing price, not the 19,000 catalog price');
});

test('docked at the first station, Buy & Fit installs it into an M utility slot', () => {
  const h = buildHarness({ stationId: 'station_helios', shipDefId: 'ship_drifter', credits: 12000 });
  h.bus.emit('ui:buyModule', { defId: 'mod_swing_drive_m', fitSlotIndex: drifterUtilityM });
  assert.equal(h.state.player.ownedShips[0].fittings[drifterUtilityM], 'mod_swing_drive_m');
  assert.equal(h.state.player.credits, 0);
});

test('a 500-credit-short haul still cannot pay for it', () => {
  const h = buildHarness({ stationId: 'station_helios', credits: 11500 });
  h.bus.emit('ui:buyModule', { defId: 'mod_swing_drive_m' });
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.state.player.credits, 11500);
  assert.match(h.toasts[0].text, /Need 500 more cr/);
});

test('another shipyard still refuses the purchase without Drive Tuning', () => {
  const h = buildHarness({ stationId: 'station_tethys', credits: 250000 });
  h.bus.emit('ui:buyModule', { defId: 'mod_swing_drive_m' });
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.state.player.credits, 250000);
  assert.match(h.toasts[0].text, /Research required: Drive Tuning/);
});

test('researched Drive Tuning buys at catalog price off the first station', () => {
  const h = buildHarness({ stationId: 'station_tethys', credits: 250000, researchedNodes: ['tech_drive_tuning'] });
  h.bus.emit('ui:buyModule', { defId: 'mod_swing_drive_m' });
  assert.equal(h.state.player.moduleInventory.length, 1);
  assert.equal(h.state.player.credits, 250000 - 19000, 'catalog price applies where no listing exists');
});

test('undocked, the listing does not exist and the research gate applies', () => {
  const h = buildHarness({ docked: false, stationId: null, credits: 250000 });
  assert.equal(h.ships.buyModule({ defId: 'mod_swing_drive_m' }), false);
  assert.equal(h.state.player.credits, 250000);
});
