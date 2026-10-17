// SFQ-B134 — a pressure sac's attachment point is the shove.
// Seed 4242, through the real impulse-charge detonate path:
//   a plate stuck on the port bow and the same plate on the starboard bow spin the hull
//   opposite ways and land the physics shove on two different surface points;
//   a plate dead on the nose (heading cross is zero) takes the id-parity side, never NaN or 0.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';

const DT = 1 / 60;
const PLAYER_ID = 1;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function boot(victimId) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 0;
  state.tick = 0;
  state.playerId = PLAYER_ID;
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0, isPlayer: true,
    mass: 32, radius: 6, rot: 0,
    pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 },
    data: { impulseCharges: { throwCdT: 0 } },
  };
  const victim = {
    id: victimId, type: 'ship', alive: true, team: 1,
    mass: 32, radius: 10, rot: Math.PI / 2,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    physicsBody: {
      schemaVersion: 1, radius: 10, mass: 32, inertiaY: 1600,
      dynamic: true, ccd: true, revision: 0,
    },
  };
  state.entities.set(player.id, player);
  state.entities.set(victim.id, victim);
  state.entityList = [player, victim];
  const bus = createBus();
  const impulses = [];
  const hitstun = [];
  bus.on(HITSTUN_IMPULSE_EVENT, (payload) => hitstun.push(payload));
  const system = Object.create(impulseCharges);
  system.init({
    state,
    bus,
    helpers: {
      routeCombatDamage() { return { ok: true }; },
      combatPhysics: {
        applyImpulse(req) { impulses.push(req); return true; },
      },
    },
  });
  const stick = (localOffset) => {
    const charge = {
      id: victimId + 20, type: 'charge', alive: true, team: 0,
      radius: 1.2, mass: 0.5, collides: false, physicsBody: false,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      data: {
        kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: PLAYER_ID,
        hostId: victim.id, localOffset: { x: localOffset.x, z: localOffset.z },
        localRot: 0, armed: true, spawnedAt: 0,
      },
    };
    state.entities.set(charge.id, charge);
    state.entityList.push(charge);
    state.input.actions = { chargeDetonate: true };
    system.update(DT, state);
    return charge;
  };
  return { state, bus, system, victim, impulses, hitstun, stick };
}

function victimHit(hitstun, victimId) {
  return hitstun.find((payload) => payload.victimId === victimId);
}

function victimImpulse(impulses, victimId) {
  return impulses.find((req) => req.entityId === victimId);
}

// The blast-facing skin: hull center minus the radial from the plate, times the hull radius.
function surfaceContact(victim, chargePos) {
  const dx = victim.pos.x - chargePos.x;
  const dz = victim.pos.z - chargePos.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dx / dist;
  const dirZ = dz / dist;
  return {
    dirX, dirZ,
    x: victim.pos.x - dirX * victim.radius,
    z: victim.pos.z - dirZ * victim.radius,
  };
}

test('B134: port-bow and starboard-bow plates spin opposite ways and land on different surface points', () => {
  const port = boot(2);
  const star = boot(2);
  try {
    const portCharge = port.stick({ x: 8, z: -6 });
    const starCharge = star.stick({ x: 8, z: 6 });
    const portEv = victimHit(port.hitstun, port.victim.id);
    const starEv = victimHit(star.hitstun, star.victim.id);
    const portReq = victimImpulse(port.impulses, port.victim.id);
    const starReq = victimImpulse(star.impulses, star.victim.id);
    assert.ok(portEv && starEv, 'each bow plate publishes a hitstun impulse');
    assert.equal(portEv.hitSide, -1, 'port bow spins one way');
    assert.equal(starEv.hitSide, 1, 'starboard bow spins the other way');
    assert.ok(portEv.dirX < 0 && starEv.dirX > 0, 'the shove directions cross the hull opposite ways');
    assert.ok(portEv.dirZ < 0 && starEv.dirZ < 0, 'both bow plates shove the hull back off the bow');
    assert.ok(portReq && starReq, 'each plate delivers a physics impulse');
    assert.ok(portReq.impulse.x < 0 && starReq.impulse.x > 0, 'physics receives opposite cross-hull shove vectors');
    assert.notEqual(Math.sign(portReq.impulse.x), Math.sign(starReq.impulse.x));
    const portSkin = surfaceContact(port.victim, portCharge.pos);
    const starSkin = surfaceContact(star.victim, starCharge.pos);
    assert.ok(portReq.point && starReq.point, 'the shove names the attachment point, not the center of mass');
    assert.ok(close(portReq.point.x, portSkin.x) && close(portReq.point.z, portSkin.z),
      `port point is the plate's surface contact, got (${portReq.point && portReq.point.x}, ${portReq.point && portReq.point.z})`);
    assert.ok(close(starReq.point.x, starSkin.x) && close(starReq.point.z, starSkin.z),
      `starboard point is the plate's surface contact, got (${starReq.point && starReq.point.x}, ${starReq.point && starReq.point.z})`);
    assert.ok(portReq.point.x > 0 && starReq.point.x < 0, 'port and starboard contacts sit on opposite sides of the hull');
    assert.ok(Math.hypot(portReq.point.x - starReq.point.x, portReq.point.z - starReq.point.z) > 1,
      'the two attachment points are not the same coordinate');
  } finally {
    port.bus.clear();
    star.bus.clear();
  }
});

test('B134: a dead-nose plate takes the id-parity side, and a second press does not shove again', () => {
  const even = boot(2);
  const odd = boot(3);
  try {
    const evenCharge = even.stick({ x: 10, z: 0 });
    const oddCharge = odd.stick({ x: 10, z: 0 });
    const evenEv = victimHit(even.hitstun, even.victim.id);
    const oddEv = victimHit(odd.hitstun, odd.victim.id);
    assert.ok(evenEv && oddEv, 'a nose plate still publishes hitstun');
    // Even id → numericParity 0 → -1. Odd id → 1. Never 0, never NaN.
    assert.equal(evenEv.hitSide, -1, 'even hull id falls to the negative parity side');
    assert.equal(oddEv.hitSide, 1, 'odd hull id falls to the positive parity side');
    assert.ok(evenEv.hitSide === -1 || evenEv.hitSide === 1);
    assert.equal(Number.isFinite(evenEv.hitSide) && Number.isFinite(oddEv.hitSide), true);
    const evenReq = victimImpulse(even.impulses, even.victim.id);
    const oddReq = victimImpulse(odd.impulses, odd.victim.id);
    const evenSkin = surfaceContact(even.victim, evenCharge.pos);
    const oddSkin = surfaceContact(odd.victim, oddCharge.pos);
    assert.ok(evenReq && evenReq.point, 'the nose shove still names a surface point');
    assert.ok(close(evenReq.point.x, evenSkin.x) && close(evenReq.point.z, evenSkin.z),
      `nose point is the plate's surface contact, got (${evenReq.point && evenReq.point.x}, ${evenReq.point && evenReq.point.z})`);
    assert.ok(oddReq && oddReq.point && close(oddReq.point.x, oddSkin.x) && close(oddReq.point.z, oddSkin.z));
    const impulsesBefore = even.impulses.length;
    const hitstunBefore = even.hitstun.length;
    even.state.input.actions = { chargeDetonate: true };
    even.system.update(DT, even.state);
    assert.equal(even.impulses.length, impulsesBefore, 'a spent plate does not shove the hull a second time');
    assert.equal(even.hitstun.length, hitstunBefore, 'a spent plate does not publish a second spin');
  } finally {
    even.bus.clear();
    odd.bus.clear();
  }
});
