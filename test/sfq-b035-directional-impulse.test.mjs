// SFQ-B035 — "Hitting a flank gives a different opening than hitting the nose."
// Pins, on seed 4242, through the real bombs owner and its physics/damage seams:
//   1. the same impulse delivered on a flank vs the nose yields different authored outcomes —
//      the signed side comes from the real blast-facing surface point (mirrored flank blasts
//      sign OPPOSITE where the old fabricated +z offset signed both the same), nose hits take
//      the deterministic id-parity fallback, and physicsAuthority receives the contact point
//      plus the def's supported torque cap;
//   2. fauna are blast-eligible by explicit decision on every axis — damage routed, craft
//      status riders withheld, dynamic-body fauna shoved, kinematic fauna motion-exempt, and
//      the proximity fuze still triggers on craft only.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { bombs } from '../src/systems/bombs.js';

const DT = 1 / 60;

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const routed = [];
  const impulses = [];
  const detonated = [];
  const hitstun = [];
  bus.on(HITSTUN_IMPULSE_EVENT, (p) => hitstun.push(p));
  bus.on('bombs:detonated', (p) => detonated.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 100, hullMax: 100, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
    combatPhysics: {
      applyImpulse(req) { impulses.push(req); return true; },
    },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });

  const spawnBomb = (payloadId, x, z, { detonateAt = 10 } = {}) => {
    const bomb = helpers.spawnEntity({
      type: 'bomb', pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 4.2, mass: 2, collides: true, physicsBody: false, collisionMask: 0,
      team: 0, ownerId: 1,
      data: {
        kind: 'bomb', bombId: payloadId, ownerId: 1, phase: 'drift', armed: true,
        armedAt: -1, detonateAt, spawnedAt: 0, fieldStartedAt: 0, fieldEndsAt: 0,
        nextFieldTick: 0, triggered: false, spinRadS: 0, sectorId: null,
        visualRadius: 1.4, retired: false,
      },
    });
    return bomb;
  };
  const ship = (x, z, rot = 0) => helpers.spawnEntity({
    type: 'ship', team: 1, mass: 32, radius: 6, pos: { x, z }, vel: { x: 0, z: 0 }, rot,
  });
  const fauna = (x, z, dynamic) => helpers.spawnEntity({
    type: 'fauna', mass: 20, radius: 5,
    collides: !!dynamic,
    physicsBody: dynamic ? { dynamic: true, material: 'fauna' } : false,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, hull: 60, hullMax: 60,
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.simTime += DT;
      state.tick += 1;
      system.update(DT, state);
    }
  };
  const detonate = (payloadId, x, z, opts) => {
    spawnBomb(payloadId, x, z, opts);
    tick(120);
    assert.equal(detonated.length, 1, 'seeded bomb detonates through the ordinary warning phase');
    return { routed, impulses, hitstun };
  };
  return { state, bus, helpers, routed, impulses, hitstun, detonated, spawnBomb, ship, fauna, tick, detonate };
}

const hitstunFor = (hitstun, victimId) => hitstun.find((p) => p.victimId === victimId);
const impulseFor = (impulses, entityId) => impulses.find((r) => r.entityId === entityId);
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// 1. blasts at equal radius around a +x-facing hull — the flank law and the fake it replaced.
test('B035: mirrored flank blasts sign opposite sides from the surface hit — the +z fake is gone', () => {
  // Two blasts at the same radius, mirrored across the nose-tail axis (same |ix|, opposite z):
  // the honest heading read signs them opposite. The retired fake hit position (victim +z
  // offset) signed both sign(world x) — identical, erasing the flank.
  const D = 28.284271247461902; // sqrt(40^2 / 2)
  const port = boot();
  try {
    const victim = port.ship(0, 0, 0);
    const r = port.detonate('bomb_frag', -D, -D);
    const ev = hitstunFor(r.hitstun, victim.id);
    assert.ok(ev, 'the flank blast publishes its hitstun impulse');
    assert.equal(ev.hitSide, -1, 'port-aft quarter blast signs port');
  } finally { port.bus.clear(); }

  const starboard = boot();
  try {
    const victim = starboard.ship(0, 0, 0);
    const r = starboard.detonate('bomb_frag', -D, D);
    const ev = hitstunFor(r.hitstun, victim.id);
    assert.ok(ev, 'the mirrored flank blast publishes its hitstun impulse');
    assert.equal(ev.hitSide, 1, 'starboard-aft quarter blast signs starboard — opposite of its mirror');
  } finally { starboard.bus.clear(); }
});

test('B035: pure abeam blasts sign port -1 / starboard +1, and the shove is orthogonal to the nose shove', () => {
  let abeamReq = null;
  const port = boot();
  try {
    const victim = port.ship(0, 0, 0);
    const r = port.detonate('bomb_frag', 0, -40);
    const ev = hitstunFor(r.hitstun, victim.id);
    assert.equal(ev.hitSide, -1, 'abeam port blast signs -1');
    const req = impulseFor(r.impulses, victim.id);
    assert.ok(req, 'the victim is shoved');
    assert.equal(req.impulse.x, 0);
    assert.ok(req.impulse.z > 0, 'the abeam port shove pushes across the line of flight');
    abeamReq = req;
  } finally { port.bus.clear(); }

  const nose = boot();
  try {
    const victim = nose.ship(0, 0, 0);
    const r = nose.detonate('bomb_frag', 40, 0);
    const ev = hitstunFor(r.hitstun, victim.id);
    // A dead-nose blast is off the nose-tail axis by zero — the honest signed side falls to
    // the deterministic id-parity fallback, exactly as signedHitSide documents.
    const parity = Math.abs(Math.trunc(victim.id)) % 2 ? 1 : -1;
    assert.equal(ev.hitSide, parity, 'nose blast takes the id-parity fallback, not a fabricated side');
    const req = impulseFor(r.impulses, victim.id);
    assert.ok(req, 'the nose victim is shoved backwards along its heading');
    // Same radius -> the same delivered impulse magnitude; nose vs flank shove along the
    // heading vs across it — materially different follow-up positions.
    assert.ok(close(Math.hypot(req.impulse.x, req.impulse.z), Math.hypot(abeamReq.impulse.x, abeamReq.impulse.z)),
      'the same blast at the same radius delivers the same impulse magnitude');
    const dot = req.impulse.x * abeamReq.impulse.x + req.impulse.z * abeamReq.impulse.z;
    assert.ok(close(dot, 0, 1e-6), 'nose and flank shoves are orthogonal follow-ups');
  } finally { nose.bus.clear(); }
});

test('B035: physicsAuthority receives the blast-facing surface point and the supported torque cap', () => {
  const t = boot();
  try {
    const victim = t.ship(0, 0, 0);
    const r = t.detonate('bomb_frag', 0, -40);
    const req = impulseFor(r.impulses, victim.id);
    assert.ok(req, 'shove request present');
    // Facing surface: center minus the radial direction times the hull radius.
    assert.ok(close(req.point.x, 0) && close(req.point.z, -6),
      `point is the blast-facing surface contact, got (${req.point.x}, ${req.point.z})`);
    assert.equal(req.maxTorque, BOMB_DEFS.bomb_frag.tumbleTorque,
      'the def-authored supported torque cap rides the impulse');
    assert.equal(req.reason, 'bomb_blast');
  } finally { t.bus.clear(); }
});

// 2. fauna eligibility — explicit on every axis, never silence.
test('B035: fauna in the blast take the damage explicitly, without the craft status riders', () => {
  const t = boot();
  try {
    const craft = t.ship(20, 0, 0);
    const ram = t.fauna(-20, 0, true);   // physics species: a real dynamic body
    const grazer = t.fauna(30, 0, false); // kinematic: motion-owned by the ecology drive
    const r = t.detonate('bomb_thermite', 0, -30);
    const targets = r.routed.map((req) => req.targetId);
    assert.ok(targets.includes(craft.id), 'craft takes the blast');
    assert.ok(targets.includes(ram.id), 'physics fauna is blast-damage eligible (accepted, not silence)');
    assert.ok(targets.includes(grazer.id), 'kinematic fauna is blast-damage eligible too');
    const statusOf = (id) => (r.routed.find((req) => req.targetId === id).packet.statuses || []);
    assert.equal(statusOf(craft.id).length, 1, 'the craft wears the thermite rider');
    assert.equal(statusOf(ram.id).length, 0, 'fauna take the blast, never the craft status rider');
    assert.equal(statusOf(grazer.id).length, 0, 'kinematic fauna likewise');
    const shovedIds = r.impulses.map((req) => req.entityId);
    assert.ok(shovedIds.includes(ram.id), 'dynamic-body fauna is shoveable');
    assert.ok(!shovedIds.includes(grazer.id), 'kinematic fauna is explicitly motion-exempt');
    assert.ok(shovedIds.includes(craft.id), 'craft still takes the shove');
  } finally { t.bus.clear(); }
});

test('B035: the proximity fuze still triggers on craft only — a fauna crowd does not cook the bay', () => {
  const t = boot();
  try {
    t.state.entities.get(1).pos = { x: 0, z: 500 }; // the owner is far outside the trigger
    t.spawnBomb('bomb_frag', 0, 0, { detonateAt: 30 }); // fuze beyond the tick window
    t.fauna(5, 0, true);
    t.fauna(8, 0, false);
    t.tick(120);
    assert.equal(t.detonated.length, 0,
      'no craft inside the trigger radius -> no prime: the fuze opt-out is explicit');
  } finally { t.bus.clear(); }
});
