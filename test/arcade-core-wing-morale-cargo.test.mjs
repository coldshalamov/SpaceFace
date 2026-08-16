import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { cargo } from '../src/systems/cargo.js';
import { wingMorale } from '../src/systems/wingMorale.js';

function ship(id, role, options = {}) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x: options.x ?? id * 20, z: options.z ?? 0 },
    vel: { x: options.vx ?? 40, z: options.vz ?? 0 }, radius: 7, mass: 12,
    data: {
      ai: { squadId: 'wing-one', encounterRole: role },
      intent: { fire: true, fireGroup: 1 },
      ...(options.fleeCargo ? { fleeCargo: { ...options.fleeCargo } } : {}),
    },
  };
}

function runScatter() {
  const bus = createBus();
  const player = ship(1, 'player', { x: -100, vx: 0 });
  player.team = 0;
  const leader = ship(2, 'leader', { x: 0, vx: 0 });
  const member = ship(3, 'member', {
    x: 30, vx: 40, fleeCargo: { commodityId: 'cmdty_scrap_metal', qty: 1, dumped: false },
  });
  const empty = ship(4, 'member', { x: 45, vx: 35 });
  const state = {
    simTime: 10, tick: 600, playerId: player.id,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 60 } },
    entities: new Map([[player.id, player], [leader.id, leader], [member.id, member], [empty.id, empty]]),
    entityList: [player, leader, member, empty],
  };
  let nextId = 100;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...structuredClone(spec) };
      spawned.push(entity);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const cargoSystem = Object.create(cargo);
  cargoSystem.init({ state, bus, helpers: {} });
  const morale = Object.create(wingMorale);
  morale.init({ state, bus, helpers });
  leader.alive = false;
  bus.emit('entity:killed', { id: leader.id, killerId: player.id, pos: { ...leader.pos } });
  return { bus, state, leader, member, empty, spawned, morale, cargoSystem };
}

test('leader loss drives an eight-second Tactical-AI flee and one physical collectible cargo dump', () => {
  const first = runScatter();
  try {
    assert.equal(first.member.data.ai.forceFlee, true);
    assert.equal(first.member.data.ai.fsm, 'flee');
    assert.equal(first.member.data.intent.fire, false);
    assert.equal(first.member.data.ai._wingMoraleUntil, 18);
    assert.equal(first.spawned.length, 1, 'only the ship with a pre-authored reserve can dump');
    const pickup = first.spawned[0];
    assert.equal(pickup.type, 'pickup');
    assert.equal(pickup.collides, true);
    assert.equal(pickup.data.kind, 'cargo');
    assert.equal(pickup.data.commodityId, 'cmdty_scrap_metal');
    assert.equal(pickup.data.amount, 1);
    assert.equal(Object.hasOwn(pickup.data, 'pickupEmbargoUntil'), false);
    assert.equal(first.member.data.fleeCargo.qty, 0, 'reserve is conserved into the physical pod');
    assert.equal(first.member.data.fleeCargo.dumped, true);

    first.bus.emit('entity:killed', { id: first.leader.id, killerId: first.state.playerId, pos: first.leader.pos });
    assert.equal(first.spawned.length, 1, 'duplicate leader death cannot mint a second pod');

    first.bus.emit('pickup:collected', {
      pickupId: pickup.id, collectorId: first.state.playerId,
      kind: 'cargo', commodityId: pickup.data.commodityId, amount: pickup.data.amount,
    });
    assert.equal(first.state.player.cargo.items.cmdty_scrap_metal, 1,
      'the ordinary cargo owner accepts the physical dump');

    first.state.simTime = 17.99;
    first.morale.update(1 / 60, first.state);
    assert.equal(first.member.data.ai.forceFlee, true, 'flee survives the full eight-second window');
    first.state.simTime = 18;
    first.morale.update(1 / 60, first.state);
    assert.equal(first.member.data.ai.forceFlee, undefined);
  } finally {
    first.morale.destroy();
    first.bus.clear();
  }
});

test('flee cargo placement is deterministic from squad, entity, and tick', () => {
  const a = runScatter();
  const b = runScatter();
  try {
    assert.deepEqual(a.spawned[0].pos, b.spawned[0].pos);
    assert.deepEqual(a.spawned[0].vel, b.spawned[0].vel);
    assert.deepEqual(a.spawned[0].data.fleeCargoDump, b.spawned[0].data.fleeCargoDump);
  } finally {
    a.morale.destroy(); b.morale.destroy();
    a.bus.clear(); b.bus.clear();
  }
});
