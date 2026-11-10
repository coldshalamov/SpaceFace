import test from 'node:test';
import assert from 'node:assert/strict';

import {
  impulseCharges,
  resolveImpulseChargeCapacity,
} from '../src/systems/impulseCharges.js';

function entity(id, type, x, z, rot = 0) {
  return {
    id, type, alive: true, rot, prevRot: rot,
    pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 },
    radius: type === 'charge' ? 1.2 : 6,
  };
}

test('a sticky impulse charge preserves local orientation as its host turns', () => {
  const host = entity(1, 'asteroid', 20, -5, 0.35);
  const charge = entity(2, 'charge', 26, -3, 1.1);
  charge.data = {
    chargeId: 'charge_standard', ownerId: 99, spawnedAt: 0,
    hostId: null, localOffset: null, localRot: null, armed: false,
  };
  const state = {
    simTime: 1,
    entityList: [host, charge],
    entities: new Map([[host.id, host], [charge.id, charge]]),
  };
  const system = Object.create(impulseCharges);
  system.state = state;
  system.bus = { emit() {} };
  system._stickScratch = [];

  system._tryStick(charge, charge.data, state);
  assert.equal(charge.data.hostId, host.id);
  assert.ok(Number.isFinite(charge.data.localRot));
  const localRot = charge.data.localRot;

  host.rot += 0.8;
  host.pos.x += 4;
  host.pos.z -= 3;
  system._tickCharges(1 / 60, state);

  const expected = ((host.rot + localRot + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  assert.ok(Math.abs(charge.rot - expected) < 1e-9, 'charge must rotate rigidly with its host');
  assert.equal(charge.data.armed, true);
});

test('legacy stuck charges initialize local rotation without a visible first-tick snap', () => {
  const host = entity(10, 'ship', 0, 0, 0.75);
  const charge = entity(11, 'charge', 8, 0, -0.4);
  charge.data = { chargeId: 'charge_standard', hostId: host.id, localOffset: { x: 8, z: 0 }, armed: true };
  const state = { entityList: [host, charge], entities: new Map([[host.id, host], [charge.id, charge]]) };
  const system = Object.create(impulseCharges);

  system._tickCharges(1 / 60, state);

  assert.ok(Number.isFinite(charge.data.localRot));
  assert.ok(Math.abs(charge.rot - (-0.4)) < 1e-9, 'legacy pose should be preserved when local rotation is inferred');
});

function throwWithFit(fittings, activeCount) {
  const player = entity(99, 'ship', 0, 0, 0);
  player.team = 1;
  player.data = {};
  const charges = Array.from({ length: activeCount }, (_, index) => {
    const charge = entity(200 + index, 'charge', 20 + index, 0, 0);
    charge.data = {
      chargeId: 'charge_standard',
      ownerId: player.id,
      spawnedAt: index,
      armed: true,
    };
    return charge;
  });
  const state = {
    simTime: 20,
    tick: 1200,
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: fittings.slice() }],
      moduleInventory: [{ instanceId: 'stored-rack', defId: 'mod_charge_rack' }],
      cargo: {
        items: { cmdty_impulse_charge: 1 },
        usedVolume: 2,
        usedMass: 1,
        capVolume: 40,
        capMass: 60,
      },
    },
    input: { aimAngle: 0, actions: { chargeThrow: true } },
    ui: { screenStack: [] },
    entityList: [player, ...charges],
    entities: new Map([[player.id, player], ...charges.map((charge) => [charge.id, charge])]),
  };
  const system = Object.create(impulseCharges);
  system.state = state;
  system.bus = { emit() {} };
  system.helpers = {
    spawnEntity(spec) {
      const spawned = {
        ...spec,
        id: 500,
        alive: true,
        prevPos: { ...spec.pos },
        prevRot: spec.rot,
      };
      state.entityList.push(spawned);
      state.entities.set(spawned.id, spawned);
      return spawned;
    },
  };

  system._handleThrow(player, { throwCdT: 0 }, state);
  return { charges, state };
}

test('Impulse Charge Rack raises the live deployment limit from four to eight', () => {
  const storedOnly = {
    player: {
      activeShipIndex: 0,
      ownedShips: [{ fittings: [] }],
      moduleInventory: [{ instanceId: 'stored-rack', defId: 'mod_charge_rack' }],
    },
  };
  assert.equal(resolveImpulseChargeCapacity(storedOnly), 4,
    'an inventory rack must not improve the active hull');
  assert.equal(resolveImpulseChargeCapacity({
    player: { activeShipIndex: 0, ownedShips: [{ fittings: ['mod_charge_rack'] }] },
  }), 8);

  const unfitted = throwWithFit([], 4);
  assert.equal(unfitted.charges[0].alive, false,
    'the fifth unfitted charge evicts the oldest of four');

  const fitted = throwWithFit(['mod_charge_rack'], 4);
  assert.equal(fitted.charges[0].alive, true,
    'the fitted rack keeps all four existing charges when the fifth is thrown');
  assert.equal(fitted.state.entityList.filter((entry) => entry.type === 'charge' && entry.alive).length, 5);
});
