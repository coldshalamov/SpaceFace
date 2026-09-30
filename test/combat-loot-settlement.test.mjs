import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo, addSalvage, cargo, salvageBayCap } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { mining } from '../src/systems/mining.js';

const DT = 1 / 60;
const SCRAP = COMMODITIES.find((c) => c.id === 'cmdty_scrap_metal');
const OVERFLOW_RATE = 0.08;
const BAY_SALE_RATE = 0.6;

function boot() {
  const state = createGameState(31);
  state.mode = 'flight';
  state.nextEntityId = 500;
  const player = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const bus = createBus();
  const events = [];
  for (const type of ['loot:overflowConverted', 'economy:grantCredits', 'pickup:collected']) {
    bus.on(type, (p) => events.push({ type, p }));
  }
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: state.nextEntityId++, alive: true, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const miningSys = Object.create(mining);
  const cargoSys = Object.create(cargo);
  const economySys = Object.create(economy);
  const registry = {
    get: (name) => (name === 'cargo' ? cargoSys : name === 'economy' ? economySys : null),
  };
  miningSys.init({ state, bus, helpers, registry });
  cargoSys.init({ state, bus, helpers });
  economySys.init({ state, bus, helpers, registry });
  return { state, bus, events, miningSys };
}

function withLootFlags(fn) {
  const loot = COMBAT_FLAGS.arcadeLoot;
  const bay = COMBAT_FLAGS.salvageBay;
  COMBAT_FLAGS.arcadeLoot = true;
  COMBAT_FLAGS.salvageBay = true;
  try {
    return fn();
  } finally {
    COMBAT_FLAGS.arcadeLoot = loot;
    COMBAT_FLAGS.salvageBay = bay;
  }
}

function spawnKillScrap({ state, bus }, qty = 15) {
  const before = state.entityList.length;
  bus.emit('loot:drop', {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    source: 'kill_burst',
    items: [{ commodityId: 'cmdty_scrap_metal', qty }],
  });
  assert.equal(state.entityList.length, before + 1, 'the kill burst must spawn exactly one pickup');
  const pickup = state.entityList[state.entityList.length - 1];
  assert.equal(pickup.type, 'pickup');
  assert.equal(pickup.data.combatLoot, true, 'the kill burst stamps combatLoot');
  assert.equal(pickup.data.commodityId, 'cmdty_scrap_metal');
  assert.equal(pickup.data.amount, qty);
  pickup.pos.x = 4;
  pickup.pos.z = 0;
  state.simTime = 1;
  return pickup;
}

function scrapVolPerU() {
  return SCRAP.volPerU > 0 ? SCRAP.volPerU : 1;
}

test('a full trade hold never strands kill loot: the burst settles into the salvage bay', () => {
  withLootFlags(() => {
    const h = boot();
    assert.ok(addCargo(h.state, 'cmdty_ore_iron', 999) > 0, 'fill the trade hold first');
    assert.ok(h.state.player.cargo.usedVolume >= h.state.player.cargo.capVolume, 'the hold is full');
    const items0 = { ...h.state.player.cargo.items };
    const vol0 = h.state.player.cargo.usedVolume;
    const credits0 = h.state.player.credits;

    const pickup = spawnKillScrap(h, 15);
    h.miningSys.update(DT, h.state);

    assert.equal(pickup.alive, false, 'the kill pickup is consumed, not left floating');
    assert.equal(h.state.player.salvageBay.items.cmdty_scrap_metal, 15,
      'kill ore lands in the salvage bay even with a full hold');
    assert.deepEqual(h.state.player.cargo.items, items0, 'the full trade hold does not move');
    assert.equal(h.state.player.cargo.usedVolume, vol0);
    assert.equal(h.state.player.credits, credits0, 'nothing converts or sells on pickup');
    assert.equal(h.events.filter((e) => e.type === 'loot:overflowConverted').length, 0);
  });
});

test('a full salvage bay converts refused kill ore to credits once, through the economy owner', () => {
  withLootFlags(() => {
    const h = boot();
    const cap = salvageBayCap(h.state);
    const fits = Math.floor(cap / scrapVolPerU());
    assert.equal(addSalvage(h.state, 'cmdty_scrap_metal', fits), fits, 'fill the bay to its cap');
    const bayItems0 = { ...h.state.player.salvageBay.items };
    const bayVol0 = h.state.player.salvageBay.usedVolume;
    const credits0 = h.state.player.credits;

    const pickup = spawnKillScrap(h, 15);
    h.miningSys.update(DT, h.state);

    const expected = Math.max(1, Math.floor(15 * SCRAP.basePrice * OVERFLOW_RATE));
    const conversions = h.events.filter((e) => e.type === 'loot:overflowConverted');
    assert.equal(conversions.length, 1, 'exactly one overflow conversion');
    assert.equal(conversions[0].p.units, 15);
    assert.equal(conversions[0].p.credits, expected);
    assert.equal(pickup.alive, false, 'converted ore does not linger');
    assert.deepEqual(h.state.player.salvageBay.items, bayItems0, 'a full bay does not move');
    assert.equal(h.state.player.salvageBay.usedVolume, bayVol0);
    assert.equal(h.state.player.credits, credits0 + expected,
      'the economy owner grants exactly the scrap-rate credit');

    const creditsAfter = h.state.player.credits;
    h.miningSys.update(DT, h.state);
    assert.equal(h.state.player.credits, creditsAfter, 'a later tick cannot pay a dead pickup twice');
    assert.equal(h.events.filter((e) => e.type === 'loot:overflowConverted').length, 1);
  });
});

test('a bay with room for exactly two units takes two and converts only the remainder', () => {
  withLootFlags(() => {
    const h = boot();
    const fits = Math.floor(salvageBayCap(h.state) / scrapVolPerU());
    assert.equal(addSalvage(h.state, 'cmdty_scrap_metal', fits - 2), fits - 2,
      'leave room for exactly 2 units');
    const credits0 = h.state.player.credits;

    const pickup = spawnKillScrap(h, 15);
    h.miningSys.update(DT, h.state);

    assert.equal(h.state.player.salvageBay.items.cmdty_scrap_metal, fits,
      'the last two units land in the bay');
    const collected = h.events.filter((e) => e.type === 'pickup:collected' && e.p.pickupId === pickup.id);
    assert.equal(collected.length, 1);
    assert.equal(collected[0].p.acceptedAmount, 2, 'the bay accepted exactly its remaining room');
    const expected = Math.max(1, Math.floor(13 * SCRAP.basePrice * OVERFLOW_RATE));
    const conversions = h.events.filter((e) => e.type === 'loot:overflowConverted');
    assert.equal(conversions.length, 1);
    assert.equal(conversions[0].p.units, 13, 'only the refused remainder pays out');
    assert.equal(conversions[0].p.credits, expected);
    assert.equal(h.state.player.credits, credits0 + expected);
    assert.equal(pickup.alive, false);

    const creditsAfter = h.state.player.credits;
    h.miningSys.update(DT, h.state);
    assert.equal(h.state.player.credits, creditsAfter);
    assert.equal(h.events.filter((e) => e.type === 'loot:overflowConverted').length, 1);
  });
});

test('docking cashes the salvage bay in through the economy owner exactly once', () => {
  withLootFlags(() => {
    const h = boot();
    assert.equal(addSalvage(h.state, 'cmdty_scrap_metal', 30), 30);
    const credits0 = h.state.player.credits;
    const expected = Math.floor(30 * SCRAP.basePrice * BAY_SALE_RATE);

    h.bus.emit('dock:docked', {});

    assert.equal(h.state.player.credits, credits0 + expected, 'the bay sale pays the scrap rate');
    const grant = h.events.find((e) => e.type === 'economy:grantCredits' && e.p.reason === 'salvage:bay_sale');
    assert.ok(grant, 'the sale settles through economy:grantCredits');
    assert.equal(grant.p.amount, expected);
    assert.deepEqual(h.state.player.salvageBay.items, {}, 'the bay empties on cash-in');
    assert.equal(h.state.player.salvageBay.usedVolume, 0);

    const creditsAfter = h.state.player.credits;
    h.bus.emit('dock:docked', {});
    assert.equal(h.state.player.credits, creditsAfter, 'a second dock pays nothing on an empty bay');
  });
});
