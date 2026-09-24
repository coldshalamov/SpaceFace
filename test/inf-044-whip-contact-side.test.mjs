import test from 'node:test';
import assert from 'node:assert/strict';

import { signedHitSide } from '../src/combat/impulseKernel.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { combat } from '../src/systems/combat.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

// INF-044 — the whip-impact family reads the contact side. A whipped mass striking one
// beam of a hull must not spark, cue, or spin like a strike on the opposite beam: the
// receipt carries the hull contact point, the signed outward normal, and the incoming
// relative velocity, and the tumble + damage consumers resolve their side from it.

function makeVictim(id = 7) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 10,
    mass: 60,
    hull: 100,
    hullMax: 120,
    armorHp: 0,
    armorMax: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 160,
    flags: {},
    data: { intent: { fire: true, moveX: 0, moveZ: 0, boost: false, brake: false } },
  };
}

function makeMass(x, z, vx, vz) {
  return {
    id: 9,
    type: 'asteroid',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius: 6,
    mass: 120,
    flags: {},
    data: {},
  };
}

function emitRecord(mass, victim, relSpeed = 60) {
  const seen = [];
  const runtime = { impacts: [] };
  masslineImpacts._emitImpact.call(
    { bus: { emit: (event, payload) => seen.push({ event, payload }) } },
    runtime,
    { tick: 100 },
    100 / 60,
    mass,
    victim,
    relSpeed,
    Math.hypot(mass.vel.x, mass.vel.z),
    false,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].event, 'tether:whipImpact');
  return runtime.impacts[0];
}

test('INF-044: the receipt contacts the struck side with a signed outward normal', () => {
  const victim = makeVictim();
  const rec = emitRecord(makeMass(60, 20, -60, 0), victim);
  const nlen = Math.hypot(rec.normal.x, rec.normal.z);
  assert.ok(Math.abs(nlen - 1) < 1e-9, 'unit outward normal');
  assert.equal(rec.axisSigned, true, 'the mass is genuinely on that side');
  // Contact rides the victim hull facing the mass: +X and +Z offsets, never the center.
  assert.ok(rec.pos.x > 5 && rec.pos.z > 1, `contact on the struck beam (${rec.pos.x}, ${rec.pos.z})`);
  assert.ok(Math.hypot(rec.pos.x, rec.pos.z) - victim.radius < 1e-9, 'contact sits on the hull');
  assert.deepEqual(rec.approach, { x: -1, z: 0 }, 'incoming axis travels with the mass');
  assert.deepEqual(rec.vel, { x: -60, z: 0 }, 'relative velocity is mass-minus-victim');
});

test('INF-044: mirrored strikes mirror the contact and flip the tumble side', () => {
  const a = emitRecord(makeMass(60, 20, -60, 0), makeVictim());
  const b = emitRecord(makeMass(60, -20, -60, 0), makeVictim());
  assert.ok(Math.abs(a.pos.x - b.pos.x) < 1e-9);
  assert.ok(Math.abs(a.pos.z + b.pos.z) < 1e-9, 'port/starboard contacts mirror across the beam');
  const sideA = signedHitSide(makeVictim(), a.vel, { pos: a.pos }, 7);
  const sideB = signedHitSide(makeVictim(), b.vel, { pos: b.pos }, 7);
  assert.ok(sideA === 1 || sideA === -1);
  assert.equal(sideB, -sideA, 'opposite beams spin opposite ways');
});

test('INF-044: a dead-head-on strike keeps the legacy parity fallback', () => {
  const victim = makeVictim(7);
  const rec = emitRecord(makeMass(60, 0, -60, 0), victim);
  assert.ok(Math.abs(rec.pos.z) < 1e-9 && rec.pos.x > 9);
  const side = signedHitSide(victim, rec.vel, { pos: rec.pos }, victim.id);
  assert.equal(side, 1, 'no side information: odd victim id spins +1, exactly as before');
});

function driveTumble(payload) {
  const victim = makeVictim(7);
  const state = {
    mode: 'flight',
    tick: 600,
    simTime: 10.0,
    playerId: 1,
    entities: new Map([[7, victim]]),
    entityList: [victim],
    combat: { entities: {} },
  };
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(event, eventPayload) { events.push({ event, payload: eventPayload }); },
  };
  const kernel = {
    catalog: createCombatCatalog(),
    statuses: {
      schedule(target, runtime, def) {
        runtime.statuses = runtime.statuses || {};
        runtime.statuses[def.id] = { id: def.id, data: def.data };
        return { ok: true };
      },
      clear: () => true,
    },
  };
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.tumble;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.tumble = true;
  tumbleStates.init({ state, bus, helpers: {}, registry: { get: (name) => (name === 'combat' ? { kernel } : null) } });
  try {
    tumbleStates._onWhipImpact({ rating: 'solid', victimId: 7, ...payload });
  } finally {
    tumbleStates.destroy();
    MASSLINE2_FLAGS.tumble = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
  return { events, victim };
}

test('INF-044: whip tumbles spin from the receipt side, opposite beams opposite spins', () => {
  const a = emitRecord(makeMass(60, 20, -60, 0), makeVictim());
  const b = emitRecord(makeMass(60, -20, -60, 0), makeVictim());
  const ra = driveTumble(a);
  const rb = driveTumble(b);
  const announcedA = ra.events.find((e) => e.event === 'massline:tumbled');
  const announcedB = rb.events.find((e) => e.event === 'massline:tumbled');
  assert.ok(announcedA && announcedB, 'both solid whips tumble the victim');
  assert.ok(announcedA.payload.hitSide === 1 || announcedA.payload.hitSide === -1);
  assert.equal(announcedB.payload.hitSide, -announcedA.payload.hitSide,
    'the spin side follows the struck beam, not the victim id');
});

test('INF-044: whip damage lands on the contact with the incoming axis attached', () => {
  const victim = makeVictim();
  const rec = emitRecord(makeMass(60, 20, -60, 0), victim);
  const routed = [];
  const state = {
    tick: 100,
    simTime: 100 / 60,
    playerId: 1,
    entities: new Map([[7, victim]]),
    entityList: [victim],
    combat: {},
  };
  const previous = COMBAT_FLAGS.whipDamage;
  COMBAT_FLAGS.whipDamage = true;
  try {
    combat.onWhipImpact.call(
      { state, ensureKernel: () => ({ routeDamage: (args) => routed.push(args) }) },
      rec,
    );
  } finally {
    COMBAT_FLAGS.whipDamage = previous;
  }
  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0].packet.hit.pos, rec.pos, 'damage sparks vent from the contact, not the center');
  assert.deepEqual(routed[0].packet.hit.approach, rec.approach, 'the incoming axis rides the packet');
  assert.deepEqual(routed[0].packet.hit.normal, rec.normal, 'the outward side rides the packet');
});
