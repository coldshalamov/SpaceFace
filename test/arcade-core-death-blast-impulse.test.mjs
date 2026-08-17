// Plan 31 physics rule: "Explosion impulses are real: point-blank ships get shoved."
//
// The Ember and Heavy tiers already shipped their own authored pulses. This route covers the
// ordinary tier that had none: a light or medium hull dying next to a live body must move it, the
// shove must fall off with distance, stay bounded, never touch health, and never stack on a death
// some other tier already owns.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEATH_BLAST } from '../src/combat/cookOff.js';
import { readRecentImpulseProvenance, recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';

function body({ x, z, mass = 44, hull = 400, radius = 10, team = 1, data = null }) {
  return {
    type: 'ship',
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius,
    mass,
    hull,
    hullMax: hull,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 0,
    capMax: 0,
    drag: 0,
    collides: true,
    data: data || {},
    physicsBody: {
      dynamic: true,
      ccd: true,
      radius,
      mass,
      inertiaY: 0.5 * mass * radius * radius,
      material: 'ship',
      shape: 'ball',
    },
  };
}

async function liveSim(t, seed) {
  const systems = [physics, collisionConsequences, actions, flightV3, weapons, combat];
  const updateOrder = [actions, flightV3, weapons, physics, collisionConsequences, combat];
  const sim = createSimulation({ seed, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  // SG-02 dynamic authority resolves asynchronously; without this the membrane rejects every
  // impulse and the route would pass its receipt assertions while moving nothing at all.
  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  return sim;
}

function speedOf(entity) {
  return Math.hypot(Number(entity.vel?.x) || 0, Number(entity.vel?.z) || 0);
}

test('an ordinary death physically shoves the bodies standing next to it, and the shove falls off', async (t) => {
  const sim = await liveSim(t, 0xac3110);
  const { state, bus } = sim;
  const combatSystem = sim.registry.get('combat');

  // Medium hull: radius 20 buys a 60 WU reach and a 140 peak through the authored ladder.
  const victim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
  const near = sim.spawn(body({ x: 0, z: 22, mass: 44 }));
  const far = sim.spawn(body({ x: 0, z: 52, mass: 44 }));
  const outside = sim.spawn(body({ x: 0, z: 300, mass: 44 }));
  const nearHullBefore = near.hull;

  // One step registers the new bodies with SG-02; an impulse aimed at an unregistered body is
  // rejected by the membrane, which would silently turn this route into a receipt-only test.
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);


  const receipts = [];
  bus.on('combat:deathBlast', (payload) => receipts.push(structuredClone(payload)));

  combatSystem.kill(victim, null, {});
  // Provenance is read at the tick it was stamped: the reader's recency window is measured against
  // the tick passed in, so sampling it after the settle loop reports a stale record as absent.
  const provenance = readRecentImpulseProvenance(near, state.tick);
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);

  assert.equal(receipts.length, 1, 'the ordinary death publishes exactly one blast receipt');
  const receipt = receipts[0];
  assert.equal(receipt.sourceId, victim.id);
  assert.equal(receipt.radiusWu, 60, 'reach scales off the victim radius the size ladder reads');
  assert.equal(receipt.peakImpulse, 140, 'peak impulse scales off that same radius');

  const nearSpeed = speedOf(near);
  const farSpeed = speedOf(far);
  assert.ok(nearSpeed > 0.5, `the point-blank body is really moved (got ${nearSpeed})`);
  assert.ok(farSpeed > 0, 'the body inside the rim is moved too');
  assert.ok(nearSpeed > farSpeed * 1.5,
    `the shove falls off with distance (near ${nearSpeed} vs far ${farSpeed})`);
  assert.equal(speedOf(outside), 0, 'a body beyond the rim is untouched');

  // Direction is radial: the witnesses sit at +z, so they must be pushed further out in +z.
  assert.ok(near.vel.z > 0, 'the shove points away from the death, not through it');
  assert.ok(far.vel.z > 0);

  assert.equal(near.hull, nearHullBefore,
    'the blast is impulse-only: combat stays the sole health writer');

  assert.ok(provenance, 'the shove is attributable');
  assert.equal(provenance.tag, DEATH_BLAST.provenance);
});

test('the ordinary blast is bounded and declines any death another tier already owns', async (t) => {
  const sim = await liveSim(t, 0xac3111);
  const { state, bus } = sim;
  const combatSystem = sim.registry.get('combat');

  const receipts = [];
  bus.on('combat:deathBlast', (payload) => receipts.push(structuredClone(payload)));

  // Ten eligible bodies well inside the rim; only maxAffected may be paid for.
  const crowdVictim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
  // A ring at 35 WU: inside the 60 WU rim, but spaced wider than two hull radii so the bodies are
  // not spawned interpenetrating and flung out of range before the death lands.
  for (let index = 0; index < 10; index++) {
    const angle = (index / 10) * Math.PI * 2;
    sim.spawn(body({ x: Math.cos(angle) * 35, z: Math.sin(angle) * 35, mass: 44 }));
  }
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
  combatSystem.kill(crowdVictim, null, {});
  sim.step(SIM_DT);
  assert.equal(receipts.length, 1);
  assert.ok(receipts[0].affected.length <= DEATH_BLAST.maxAffected,
    `one common death cannot pay for an unbounded crowd (got ${receipts[0].affected.length})`);
  assert.ok(receipts[0].affected.length > 0, 'but it does move somebody');

  // A Heavy corpse: the Heavy cook-off owns its shove, so no second smaller pulse is added.
  receipts.length = 0;
  const heavyVictim = sim.spawn(body({
    x: 900, z: 0, radius: 30, mass: 120, hull: 90,
    data: { killRewardTier: 'heavy', shipClass: 'gunship' },
  }));
  sim.spawn(body({ x: 900, z: 24, mass: 44 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
  combatSystem.kill(heavyVictim, null, {});
  sim.step(SIM_DT);
  assert.equal(receipts.length, 0, 'the Heavy tier keeps sole ownership of its own death shove');

  // An authored Ember cook-off likewise owns its death.
  receipts.length = 0;
  const emberVictim = sim.spawn(body({
    x: -900, z: 0, radius: 8, mass: 16, hull: 40,
    data: { deathCookOff: { radiusWu: 130, impulse: 340, maxAffected: 12 } },
  }));
  sim.spawn(body({ x: -900, z: 20, mass: 44 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
  combatSystem.kill(emberVictim, null, {});
  sim.step(SIM_DT);
  assert.equal(receipts.length, 0, 'an authored Ember death is not shoved twice');
});

test('the blast pushes a body another actor already owns without stealing its attribution', async (t) => {
  const sim = await liveSim(t, 0xac3113);
  const { state, bus } = sim;
  const combatSystem = sim.registry.get('combat');

  const victim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
  const owned = sim.spawn(body({ x: 0, z: 22, mass: 44 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);

  // Somebody else acted on this body first - a weapon, a tether, a debris chunk. Whoever it was
  // still owns any collision it goes on to cause; collisionConsequences reads the latest record.
  recordImpulseProvenance(owned, {
    actorId: 4242, weaponId: 'wpn_prior_actor', tag: 'prior_actor', appliedTick: state.tick,
  });

  const receipts = [];
  bus.on('combat:deathBlast', (payload) => receipts.push(structuredClone(payload)));
  combatSystem.kill(victim, null, {});
  const after = readRecentImpulseProvenance(owned, state.tick);
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);

  assert.equal(receipts.length, 1);
  const entry = receipts[0].affected.find((row) => row.entityId === owned.id);
  assert.ok(entry, 'the owned body is still physically shoved');
  assert.equal(entry.attributed, false, 'and the receipt says so honestly');
  assert.ok(speedOf(owned) > 0.5, 'the push is real even though the claim was declined');
  assert.equal(after?.tag, 'prior_actor', 'the earlier actor keeps the body');
  assert.equal(after?.actorId, 4242);
});

test('the same death produces the same shove on a replayed seed', async (t) => {
  const run = async (seed) => {
    const sim = await liveSim(t, seed);
    const combatSystem = sim.registry.get('combat');
    const receipts = [];
    sim.bus.on('combat:deathBlast', (payload) => receipts.push(structuredClone(payload)));
    const victim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
    sim.spawn(body({ x: 0, z: 22, mass: 44 }));
    sim.spawn(body({ x: 15, z: -15, mass: 44 }));
    for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
    combatSystem.kill(victim, null, {});
    sim.step(SIM_DT);
    return receipts;
  };

  const first = await run(0xac3112);
  const second = await run(0xac3112);
  assert.deepEqual(second, first, 'the blast is a deterministic function of the death');
});
