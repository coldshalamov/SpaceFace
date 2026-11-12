// PQ-137.09 "Chains go off" — the prime/slam/cook-off rules, unit level.
//
// Every assertion below quotes the vision sentence it serves. These are rules, not tuning: the
// deterministic end-to-end proof (>= 3 secondary consequences from one player action on the real
// physics path, seed 4242) lives in scripts/lib/bench/scenarios/feel.chain_reaction.mjs and is
// pinned for determinism by test/chain-reaction-determinism.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { impulseCharges } from '../src/systems/impulseCharges.js';
import { CHAIN_REACTION, IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { COLLISION_CONSEQUENCE_LIMITS, resolveHitstunLaw } from '../src/combat/impulseKernel.js';

const PHYSICAL = 'Combat should be physical.';
const CONSEQUENCES = 'Consequences or it is thin.';

function ship(id, x, z, { mass = 16, radius = 14, type = 'ship' } = {}) {
  return {
    id, type, alive: true, rot: 0, angVel: 0,
    pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 },
    radius, mass,
    hull: 150, hullMax: 150, shield: 0, shieldMax: 0,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 40, dynamic: true, ccd: false, material: 'ship', revision: 0 },
    data: { derived: { propulsion: { combatSpeed: 105 } } },
  };
}

function charge(id, x, z, hostId, ownerId = 99) {
  const e = {
    id, type: 'charge', alive: true, rot: 0,
    pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 }, radius: 1.2, mass: 0.5,
  };
  e.data = {
    kind: 'impulse_charge', chargeId: 'charge_standard', ownerId,
    hostId, localOffset: { x: 0, z: 0 }, localRot: 0, armed: true, spawnedAt: 0,
  };
  return e;
}

function harness(entityList, { playerId = 1 } = {}) {
  const events = [];
  const handlers = new Map();
  const bus = {
    emit(name, payload) { events.push({ name, payload }); for (const fn of handlers.get(name) || []) fn(payload); },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
  };
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId,
    entityList, entities,
    input: { actions: {} },
    player: { cargo: { items: {}, capVolume: 0, usedVolume: 0, usedMass: 0 } },
  };
  const impulses = [];
  const damage = [];
  const system = Object.create(impulseCharges);
  system.init({
    state,
    bus,
    helpers: {
      combatPhysics: {
        applyImpulse(req) { impulses.push(req); return true; },
      },
      queryRadius: null,
      routeCombatDamage(req) { damage.push(req); return { ok: true }; },
    },
    registry: { get() { return null; } },
  });
  // The production query helper is absent in a fixture; the blast falls back to the entity list,
  // which is what `queryNearbyEntities` does when there is no spatial hash.
  return { system, state, bus, events, impulses, damage };
}

function step(h, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    h.system.update(1 / 60, h.state);
  }
}

test('a hull carrying an armed plate detonates when it SLAMS, and a scrape leaves it alone', () => {
  const carrier = ship(2, 0, 0);
  const victim = ship(3, 0, 28);
  const plate = charge(4, 0, -14, carrier.id);
  const h = harness([carrier, victim, plate]);

  // A scrape: closing speed under the threshold the game already uses to take a helm.
  h.bus.emit('physics:impact', {
    aId: carrier.id, bId: victim.id, tick: 0, impulse: 40, dp: 40,
    preSolveClosingSpeed: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV - 1,
  });
  step(h);
  assert.equal(plate.alive, true,
    `${PHYSICAL} — a scrape is not a slam; a plate that goes off on every bump is not physics, it is a tripwire`);

  h.bus.emit('physics:impact', {
    aId: carrier.id, bId: victim.id, tick: 1, impulse: 900, dp: 900,
    preSolveClosingSpeed: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV + 1,
  });
  step(h);
  assert.equal(plate.alive, false,
    `${PHYSICAL} — a hull carrying a bomb into another hull at slam speed has to answer for it`);
  const detonation = h.events.filter((e) => e.name === 'charge:detonated').pop();
  assert.ok(detonation, 'the slam must publish the same detonation receipt a manual one does');
  assert.equal(detonation.payload.trigger, 'slam');
  assert.ok(detonation.payload.hits.includes(victim.id),
    `${CONSEQUENCES} — the ship that was slammed is inside the blast`);
});

test('a detonation primes exactly what the ONE hitstun law says it knocked past the stun threshold', () => {
  const carrier = ship(2, 0, 0);
  const near = ship(3, 0, 30);      // inside the reach that stuns
  const far = ship(5, 0, 300);      // outside the blast entirely
  const plate = charge(4, 0, 0, carrier.id);
  const h = harness([carrier, near, far, plate]);

  h.bus.emit('physics:impact', {
    aId: carrier.id, bId: near.id, tick: 0, impulse: 900, dp: 900,
    preSolveClosingSpeed: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV + 20,
  });
  step(h);

  const primes = h.events.filter((e) => e.name === 'chain:primed').map((e) => e.payload.victimId);
  const def = IMPULSE_CHARGES.charge_standard;
  const falloff = 1 - 30 / def.radius;
  const deltaV = (def.impulse * falloff) / 16;
  const law = resolveHitstunLaw({ deltaV, victimCruise: 105, attackerMass: 16, victimMass: 16 });
  assert.ok(law.durationS > 0, 'fixture sanity: the near hull is genuinely knocked past the stun threshold');
  assert.ok(primes.includes(near.id),
    `${CONSEQUENCES} — a blast that takes a hull's helm has cooked it; that is the second thing the one action did`);
  assert.ok(!primes.includes(far.id),
    `${PHYSICAL} — a hull the blast never reached cannot be cooked by it`);
  assert.ok(!primes.includes(carrier.id),
    `${PHYSICAL} — a bomb does not cook the ship it was already stuck to`);
});

test('a primed hull cooks off on ITS next slam, and only inside the prime window', () => {
  const a = ship(2, 0, 0);
  const b = ship(3, 0, 28);
  const h = harness([a, b]);

  h.system._prime(a, h.state, { byId: b.id, reason: 'blast' });
  assert.equal(h.system.isPrimed(a, h.state), true);

  // Past the authored window, the prime is gone and the slam is just a slam.
  const windowTicks = Math.round(CHAIN_REACTION.primeWindowS * 60);
  step(h, windowTicks + 2);
  assert.equal(h.system.isPrimed(a, h.state), false,
    `${PHYSICAL} — a cooked hull cools down; a prime that never expires is a permanent trap, not a chain`);

  h.bus.emit('physics:impact', {
    aId: a.id, bId: b.id, tick: h.state.tick, impulse: 900, dp: 900,
    preSolveClosingSpeed: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV + 30,
  });
  step(h);
  assert.equal(h.events.filter((e) => e.name === 'chain:detonated').length, 0,
    'an expired prime must not cook off');

  // Inside the window, the same slam is a cook-off.
  h.system._prime(a, h.state, { byId: b.id, reason: 'blast' });
  h.bus.emit('physics:impact', {
    aId: a.id, bId: b.id, tick: h.state.tick, impulse: 900, dp: 900,
    preSolveClosingSpeed: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV + 30,
  });
  step(h);
  const cook = h.events.filter((e) => e.name === 'chain:detonated');
  assert.equal(cook.length, 1,
    `${CONSEQUENCES} — a primed ship slamming something is the next link, not a footnote`);
  assert.equal(cook[0].payload.sourceId, a.id);
  assert.equal(h.system.isPrimed(a, h.state), false, 'a cook-off consumes the prime');
});

test('the chain is finite: yield decays with link depth and stops at the authored ceiling', () => {
  const a = ship(2, 0, 0);
  const b = ship(3, 0, 28);
  const h = harness([a, b]);

  const first = h.system._sympatheticDetonation(a, { byId: b.id, link: 1 }, h.state);
  const firstImpulse = h.impulses.length ? Math.hypot(h.impulses[0].impulse.x, h.impulses[0].impulse.z) : 0;
  assert.ok(first && firstImpulse > 0, 'fixture sanity: link 1 produces a blast');

  h.impulses.length = 0;
  h.system._sympatheticDetonation(a, { byId: b.id, link: 2 }, h.state);
  const secondImpulse = h.impulses.length ? Math.hypot(h.impulses[0].impulse.x, h.impulses[0].impulse.z) : 0;
  assert.ok(secondImpulse > 0 && secondImpulse < firstImpulse,
    `${PHYSICAL} — each link answers with less than the one before it, so a chain ends on its own arithmetic and not on a clamp`);

  h.impulses.length = 0;
  const beyond = h.system._sympatheticDetonation(a, { byId: b.id, link: CHAIN_REACTION.maxLinks + 1 }, h.state);
  assert.equal(beyond, null, 'past the authored ceiling a chain stops');
  assert.equal(h.impulses.length, 0, 'and produces no blast at all');
});

test('the player is never primed and never cooks off', () => {
  const player = ship(1, 0, 0);
  const other = ship(2, 0, 28);
  const h = harness([player, other], { playerId: player.id });

  assert.equal(h.system._prime(player, h.state, { byId: other.id, reason: 'blast' }), false,
    'PQ-137.11/B13: "the player is never knocked around" — and is never turned into a bomb either');
  assert.equal(h.system.isPrimed(player, h.state), false);
});

test('a well grind primes both hulls it ground together', () => {
  const a = ship(2, 0, 0);
  const b = ship(3, 0, 26);
  const h = harness([a, b]);

  h.bus.emit('well:grind', { schemaVersion: 1, aId: a.id, bId: b.id, fieldId: 'field_well_test', ticks: 24 });
  step(h);

  const primed = h.events.filter((e) => e.name === 'chain:primed');
  assert.equal(primed.length, 2,
    `${CONSEQUENCES} — two hulls a well has been grinding together are one cooked clump, not two bystanders`);
  assert.deepEqual(primed.map((e) => e.payload.reason), ['well_grind', 'well_grind']);
});
