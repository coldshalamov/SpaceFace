import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { economy } from '../src/systems/economy.js';

function setup(entity, withEconomy = false) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.credits = 1000;
  state.player.bounty = 73;
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  state.entities.set(1, player);
  state.entities.set(entity.id, entity);
  state.entityList = [player, entity];
  const bus = createBus();
  const spoken = [], receipts = [], logs = [];
  bus.on('barkDirector:voice', (event) => receipts.push(event));
  bus.on('comms:log', (event) => logs.push(event));
  const money = withEconomy ? Object.assign({}, economy) : null;
  if (money) money.init({ state, bus, helpers: {} });
  const director = Object.assign({}, barkDirector);
  director.init({ state, bus, helpers: { voice: { say: (event) => { spoken.push(event); return true; } } } });
  return { state, bus, spoken, receipts, logs, director };
}

function body(id, type, label, manifest = null) {
  return { id, type, alive: false, pos: { x: 10, z: 0 }, factionId: 'faction_free',
    data: { name: label, displayName: label, label, scanLabel: label,
      ...(manifest ? { cargoManifest: manifest } : {}) } };
}

function kill(h, entity) {
  h.bus.emit('entity:killed', { id: entity.id, type: entity.type, killerId: 1, pos: entity.pos });
}

test('a live named cargo owner retains its bounty voice and identity', () => {
  const victim = body(7, 'ship', 'Mira Bluepack', {
    ownerId: 'lane_mira_bluepack', ownerName: 'Mira Bluepack', originId: 'station_ceres',
    destStationId: 'station_helios_prime',
  });
  const h = setup(victim);
  try {
    kill(h, victim);
    assert.equal(h.spoken[0].text, 'Mira Bluepack posted a bounty. That cargo had a name.');
    assert.equal(h.receipts[0].ownerId, 'lane_mira_bluepack');
    assert.equal(h.receipts[0].ownerName, 'Mira Bluepack');
    assert.equal(h.receipts[0].reaction, 'bounty');
    assert.equal(h.receipts[0].originId, 'station_ceres');
    assert.equal(h.receipts[0].destinationId, 'station_helios_prime');
    assert.equal(h.logs[0].from, 'Mira Bluepack');
  } finally { h.director.destroy(); }
});

for (const label of ['Hull Debris', 'Salvage Wreck', 'Starboard Stabilizer Break']) {
  test(`${label} is a recovery notice, while the existing bounty citation remains`, () => {
    const wreck = body(42, 'wreck', label);
    const h = setup(wreck);
    try {
      kill(h, wreck);
      assert.equal(h.spoken[0].text, 'Cargo recovery notice: bounty after the spill.');
      assert.equal(h.logs[0].from, 'Cargo recovery notice');
      assert.equal(h.logs[0].text, h.spoken[0].text);
      assert.equal(h.receipts[0].reaction, 'bounty');
      assert.equal(h.receipts[0].ownerId, '42');
      assert.equal(h.receipts[0].ownerName, label);
      assert.equal(h.state.player.bounty, 73);
    } finally { h.director.destroy(); }
  });
}

test('a genuine named claimant on a wreck remains named', () => {
  const wreck = body(42, 'wreck', 'Salvage Wreck', {
    ownerId: 42, ownerName: 'Mira Bluepack', originId: 'station_ceres',
  });
  const h = setup(wreck);
  try {
    kill(h, wreck);
    assert.equal(h.spoken[0].text, 'Mira Bluepack posted a bounty. That cargo had a name.');
    assert.equal(h.logs[0].ownerName, 'Mira Bluepack');
    assert.equal(h.receipts[0].reaction, 'bounty');
  } finally { h.director.destroy(); }
});

test('a wreck fallback on a freight spill keeps the real restitution debit and receipt', () => {
  const wreck = body(42, 'wreck', 'Hull Debris');
  const h = setup(wreck, true);
  try {
    h.bus.emit('freight:cargoSpilled', {
      carrierId: 42, attackerId: 1, playerCaused: true, levyCr: 180,
      commodityId: 'cmdty_ore_iron', qty: 4, cause: 'combat_fire',
    });
    assert.equal(h.spoken[0].text, 'Cargo recovery notice: restitution after the spill.');
    assert.equal(h.receipts[0].reaction, 'restitution');
    assert.equal(h.logs[0].reaction, 'restitution');
    assert.equal(h.state.player.credits, 820);
    assert.equal(h.state.player.bounty, 73);
    assert.ok(h.state.player.sessionSinks.some((receipt) => receipt.kind === 'restitution' && receipt.amount === 180));
  } finally { h.director.destroy(); }
});
