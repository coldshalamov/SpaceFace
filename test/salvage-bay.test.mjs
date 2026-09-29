// Hull-burst overhaul, slice D: the salvage bay (design doc section 7.5; flag `combat.salvageBay`).
//
// Owner, 2026-09-29: "I don't want to make this the kind of game wherein you kill something and then look at its
// loot and weigh its value against how much room you have in your pack", and (the correction that shaped this)
// making the ordinary hold 5x bigger everywhere would multiply the whole trade and mining economy. So the player's
// own KILL loot goes to a separate bay (about 5x the hold, floor 600 so a small hull has a usable one), the trade hold
// is untouched, and docking cashes the bay in at a scrap rate through the economy owner.
//
//   1. combat loot is banked in the bay, never the hold; ordinary pickups still fill the hold;
//   2. the bay's cap is max(600, 5 x hold); a full bay refuses (mining converts the remainder to credits);
//   3. run wallets (Survival/Crucible) and the flag-off profile are untouched;
//   4. docking sells the bay at the scrap rate through economy:grantCredits and empties it;
//   5. it saves and loads as an OPTIONAL key of the cargo record (an old save, and a save with an empty bay, are
//      byte-identical to before), and nothing is created for a player who never fights.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  SALVAGE_BAY, addSalvage, cargo, cashInSalvage, salvageBayCap, salvageBayReading,
} from '../src/systems/cargo.js';
import { save } from '../src/save/saveSystem.js';

const SCRAP = COMMODITIES.find((c) => c.id === 'cmdty_scrap_metal');
const OTHER = COMMODITIES.find((c) => c.id !== 'cmdty_scrap_metal' && c.basePrice > 0 && !c.persistent && c.volPerU <= 1);

function withFlag(value, fn) {
  const previous = COMBAT_FLAGS.salvageBay;
  COMBAT_FLAGS.salvageBay = value;
  try { return fn(); } finally { COMBAT_FLAGS.salvageBay = previous; }
}

function harness({ holdCap = 250 } = {}) {
  const state = createGameState(11);
  state.playerId = 1;
  state.player.cargo.capVolume = holdCap;
  const bus = createBus();
  const events = [];
  for (const type of ['economy:grantCredits', 'salvage:bayCashedIn', 'salvage:changed', 'toast']) bus.on(type, (p) => events.push({ type, p }));
  const pickups = new Map();
  state.entities = new Map();
  cargo.init({ state, bus, helpers: {} });
  /** Collect a pickup the way mining/physics do: one mutable payload, cargo writes the acceptance. */
  const collect = ({ amount = 10, data = {}, commodityId = 'cmdty_scrap_metal' } = {}) => {
    const id = 100 + pickups.size;
    const pickup = { id, type: 'pickup', alive: true, data: { kind: 'ore', commodityId, amount, ...data } };
    pickups.set(id, pickup);
    state.entities.set(id, pickup);
    const payload = { pickupId: id, collectorId: 1, kind: 'ore', amount, commodityId };
    bus.emit('pickup:collected', payload);
    return payload;
  };
  return { state, bus, events, collect };
}

test('kill loot is banked in the bay; the trade hold is untouched; ordinary ore still fills the hold', () => {
  withFlag(true, () => {
    const h = harness();
    const combat = h.collect({ amount: 12, data: { combatLoot: true } });
    assert.equal(combat.acceptedAmount, 12);
    assert.equal(h.state.player.cargo.usedVolume, 0, 'the hold did not move');
    assert.equal(h.state.player.salvageBay.items.cmdty_scrap_metal, 12, 'the bay holds it');
    const ordinary = h.collect({ amount: 5 });
    assert.equal(ordinary.acceptedAmount, 5);
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 5, 'a mined/jettisoned pickup still fills the hold');
    assert.equal(h.state.player.salvageBay.items.cmdty_scrap_metal, 12, 'and leaves the bay alone');
  });
});

test('the bay is max(floor, 5 x hold) and a full bay refuses so mining can convert the remainder', () => {
  assert.equal(SALVAGE_BAY.capMult, 5);
  const big = createGameState(1);
  big.player.cargo.capVolume = 250;
  assert.equal(salvageBayCap(big), 1250, '5 x a 250 hold');
  const small = createGameState(1);
  small.player.cargo.capVolume = 120;
  assert.equal(salvageBayCap(small), SALVAGE_BAY.capFloor, 'a small hull still gets a usable bay (floor)');
  withFlag(true, () => {
    const h = harness({ holdCap: 100 });
    const cap = salvageBayCap(h.state);
    const volPerU = SCRAP.volPerU > 0 ? SCRAP.volPerU : 1;
    const fits = Math.floor(cap / volPerU);
    const first = h.collect({ amount: fits - 3, data: { combatLoot: true } });
    assert.equal(first.acceptedAmount, fits - 3);
    const second = h.collect({ amount: 10, data: { combatLoot: true } });
    assert.equal(second.acceptedAmount, 3, 'only what fits');
    assert.equal(second.rejectedAmount, 7, 'and the rest is refused (mining pays it out as credits)');
    assert.ok(h.state.player.salvageBay.usedVolume <= cap + 1e-9);
  });
});

test('run wallets and the flag-off profile never use the bay', () => {
  withFlag(true, () => {
    const h = harness();
    h.collect({ amount: 8, data: { combatLoot: true, wallet: 'run' } });
    assert.equal(h.state.player.salvageBay, undefined, 'a Survival/Crucible run does not touch the campaign bay');
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 8, 'it behaves exactly as it did');
  });
  withFlag(false, () => {
    const h = harness();
    h.collect({ amount: 8, data: { combatLoot: true } });
    assert.equal(h.state.player.salvageBay, undefined, 'flag off: no bay is created');
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 8);
  });
});

test('docking cashes the bay in at the scrap rate through the economy owner, and empties it', () => {
  withFlag(true, () => {
    const h = harness();
    h.collect({ amount: 30, data: { combatLoot: true } });
    h.collect({ amount: 20, data: { combatLoot: true }, commodityId: OTHER.id });
    const expected = Math.floor(30 * SCRAP.basePrice * SALVAGE_BAY.saleRate) + Math.floor(20 * OTHER.basePrice * SALVAGE_BAY.saleRate);
    h.events.length = 0;
    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    const grant = h.events.find((e) => e.type === 'economy:grantCredits');
    assert.ok(grant, 'credits are granted through the economy owner, not written here');
    assert.equal(grant.p.amount, expected);
    assert.equal(grant.p.reason, 'salvage:bay_sale');
    const cashed = h.events.find((e) => e.type === 'salvage:bayCashedIn');
    assert.equal(cashed.p.units, 50);
    assert.deepEqual(h.state.player.salvageBay.items, {}, 'the bay is empty');
    assert.equal(h.state.player.salvageBay.usedVolume, 0);
    assert.ok(h.events.some((e) => e.type === 'toast' && /cashed in/.test(e.p.text)), 'the player is told');
    h.events.length = 0;
    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(h.events.filter((e) => e.type === 'economy:grantCredits').length, 0, 'an empty bay pays nothing and says nothing');
  });
  withFlag(false, () => {
    const h = harness();
    h.state.player.salvageBay = { items: { cmdty_scrap_metal: 5 }, usedVolume: 5 };
    h.events.length = 0;
    h.bus.emit('dock:docked', {});
    assert.equal(h.events.filter((e) => e.type === 'economy:grantCredits').length, 0, 'flag off: no sale');
  });
});

test('the reading the tooltip shows, and pure helpers', () => {
  const state = createGameState(3);
  state.player.cargo.capVolume = 250;
  assert.equal(salvageBayReading(state), null, 'never held anything: nothing to show');
  assert.equal(addSalvage(state, 'cmdty_scrap_metal', 40), 40);
  const reading = salvageBayReading(state);
  assert.equal(reading.units, 40);
  assert.equal(reading.cap, 1250);
  assert.ok(reading.used > 0);
  assert.equal(addSalvage(state, 'cmdty_not_a_thing', 5), 0, 'unknown commodities are refused');
  assert.equal(cashInSalvage(createGameState(3)), null, 'no bay, no sale');
});

test('the bay saves and loads as an optional key of the cargo record; nothing is written when it is empty', () => {
  const state = createGameState(5);
  state.player.cargo.capVolume = 250;
  const writer = Object.create(save);
  writer.state = state;
  assert.equal(Object.hasOwn(writer._serializeCargo(), 'salvageBay'), false, 'a player who never fought: byte-identical to before');
  addSalvage(state, 'cmdty_scrap_metal', 25);
  const written = writer._serializeCargo();
  assert.deepEqual(written.salvageBay, { items: { cmdty_scrap_metal: 25 } }, 'items only: usedVolume is a cache');
  const loaded = createGameState(6);
  loaded.player.cargo.capVolume = 250;
  const reader = Object.create(save);
  reader.state = loaded;
  reader._restoreCargo(JSON.parse(JSON.stringify(written)));
  assert.equal(loaded.player.salvageBay.items.cmdty_scrap_metal, 25);
  // The cargo owner rebuilds the volume cache from the items right after a restore.
  cargo.init({ state: loaded, bus: createBus(), helpers: {} });
  cargo.recompute(loaded);
  assert.ok(loaded.player.salvageBay.usedVolume > 0, 'the cache is recomputed');
  // An old save (no key) clears any bay the previous session had.
  reader._restoreCargo({ items: {}, capVolume: 250, capMass: 999 });
  assert.equal(Object.hasOwn(loaded.player, 'salvageBay'), false, 'an old save loads with no bay');
});

test('the bay is saved ONCE: it is in the cargo record, never also in the player blob', () => {
  const state = createGameState(9);
  state.player.cargo.capVolume = 250;
  addSalvage(state, 'cmdty_scrap_metal', 25);
  const writer = Object.create(save);
  writer.state = state;
  const player = writer._serializePlayer();
  assert.equal(Object.hasOwn(player, 'salvageBay'), false, 'not in the player record');
  assert.equal(Object.hasOwn(writer._serializeCargo(), 'salvageBay'), true, 'in the cargo record');
});
