// inf-ram-mass-law (WF-05, CH-02) — ram damage for everyone.
// Before: below HEAVY_AS_TERRAIN_MASS craft contact read its damage off the solver's bounded Δv
// (min(mass) x MAX_CONTACT_DV per tick, the 12-tick pair cooldown dropping the rest), so a
// 130 WU/s ram dealt exactly what a 55 WU/s bump did and the striker's mass never entered — a
// 90-mass Ironback ploughing into a 16-mass Wasp dented it like a peer. Now the victim's
// mass-ratio share of the pre-solve closing speed (closing * mStriker / (mStriker + mVictim))
// feeds the same energy proxy, multiplier and cap, and only ever raises the bounded read.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRAFT_RAM_LAW,
  HEAVY_AS_TERRAIN_MASS,
  craftRamDeltaV,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';

// Mirrored, not imported: src/core/sg02DynamicBodyOwner.js MAX_CONTACT_DV (the physics backend
// stays out of a kernel-only test, the same guard pq-140-01-heavy-terrain uses).
const MAX_CONTACT_DV = 40;

function hull(id, mass) {
  return { id, type: 'ship', mass, physicsBody: { mass }, radius: 12 };
}

function provenanceFor(actorId) {
  return { actorId, weaponId: null, tag: 'direct_contact', appliedTick: 100 };
}

function contact(target, other, exchangedMomentum, closingSpeed) {
  return resolveCollisionConsequence({
    tick: 100,
    target,
    other,
    exchangedMomentum,
    preSolveClosingSpeed: closingSpeed,
    pos: { x: 0, z: 0 },
    normal: { x: -1, z: 0 },
    provenance: provenanceFor(other.id),
  });
}

// What the live solver can hand the kernel: the honest dead-collision exchange, clamped to
// min(mass) x MAX_CONTACT_DV.
function routeMomentum(victimMass, strikerMass, closingSpeed) {
  const honest = closingSpeed * victimMass * strikerMass / (victimMass + strikerMass);
  return Math.min(honest, Math.min(victimMass, strikerMass) * MAX_CONTACT_DV);
}

test('a heavy ramming a light wrecks it: closing speed and striker mass enter the damage', () => {
  const wasp = hull('wasp', 16);
  const ironback = hull('ironback', 90); // heavy-ish, still under HEAVY_AS_TERRAIN_MASS
  const hard = contact(wasp, ironback, routeMomentum(16, 90, 130), 130);
  const soft = contact(wasp, ironback, routeMomentum(16, 90, 55), 55);
  const peer = contact(wasp, hull('wasp_b', 16), routeMomentum(16, 16, 130), 130);
  assert.ok(hard && soft && peer, 'every contact produces a consequence');
  // Both rams saturate the solver bound, so the old read gave them the same number.
  assert.equal(hard.deltaV, soft.deltaV, 'the solver Δv is the same bounded 40 WU/s for both');
  assert.ok(hard.impactDamage > soft.impactDamage * 3,
    `a 130 WU/s ram (${hard.impactDamage}) dwarfs a 55 WU/s bump (${soft.impactDamage})`);
  assert.ok(hard.impactDamage > peer.impactDamage,
    `the Ironback wrecks harder (${hard.impactDamage}) than a peer Wasp at the same speed (${peer.impactDamage})`);
  assert.ok(hard.impactDamage > 150 + 25, 'past a Wasp\'s hull and shield: wrecked');
  assert.equal(hard.ramDeltaV, craftRamDeltaV(130, 16, 90));
  assert.ok(hard.ramDeltaV > 100, `the light takes nearly the whole closing speed (${hard.ramDeltaV})`);
});

test('two equals both crumple, and past the solver ceiling the peer ram keeps growing', () => {
  const a = hull('mule_a', 55);
  const b = hull('mule_b', 55);
  const momentum = routeMomentum(55, 55, 90);
  const sideA = contact(a, b, momentum, 90);
  const sideB = contact(b, a, momentum, 90);
  assert.ok(sideA && sideB);
  assert.equal(sideA.impactDamage, sideB.impactDamage, 'identical peers take an identical read');
  assert.ok(sideA.impactDamage > 0.4 * 380, `a committed peer ram crumples a Mule (${sideA.impactDamage})`);
  // Two Wasps: the bounded read saturates at the clamp; a head-on past it now reads harder.
  const waspA = hull('wasp_a', 16);
  const waspB = hull('wasp_b', 16);
  const clamped = contact(waspA, waspB, routeMomentum(16, 16, 100), 100);
  const headOn = contact(waspA, waspB, routeMomentum(16, 16, 190), 190);
  assert.equal(clamped.deltaV, headOn.deltaV, 'the solver reports the same bounded Δv for both');
  assert.ok(headOn.impactDamage > clamped.impactDamage * 1.5,
    `a 190 WU/s head-on (${headOn.impactDamage}) is not a 100 WU/s clip (${clamped.impactDamage})`);
  assert.equal(headOn.ramDeltaV, 95, 'equals split the closing speed half and half');
});

test('a light ramming a heavy bounces off hurt while the heavy keeps a scratch', () => {
  const wasp = hull('wasp', 16);
  const ironback = hull('ironback', 90);
  const momentum = routeMomentum(16, 90, 110);
  const lightSide = contact(wasp, ironback, momentum, 110);
  const heavySide = contact(ironback, wasp, momentum, 110);
  assert.ok(lightSide && heavySide);
  assert.ok(lightSide.impactDamage > heavySide.impactDamage * 10,
    `the light (${lightSide.impactDamage}) pays for the ram, the heavy (${heavySide.impactDamage}) does not`);
  assert.ok(heavySide.impactDamage < 0.05 * 480, 'the Ironback barely marks');
  assert.equal(heavySide.ramDeltaV, undefined, 'the heavy\'s share sits under the crumple floor');
  // PQ-140.01's own pin: a Wasp at cruise into a Warden leaves the Warden exactly unscratched.
  const warden = hull('warden', HEAVY_AS_TERRAIN_MASS);
  const wardenSide = contact(warden, wasp, routeMomentum(16, 150, 105), 105);
  assert.equal(wardenSide.impactDamage, 0, 'a light is not terrain');
  // The PQ-140.01 boundary keeps its own law: a mass-150+ partner is still terrain.
  const terrainSide = contact(wasp, warden, routeMomentum(16, 150, 110), 110);
  assert.equal(terrainSide.ramDeltaV, undefined, 'heavy-as-terrain reads the crumple law, not the ram law');
  assert.ok(terrainSide.impactDamage > 0);
});

test('a bump the solver resolves honestly keeps the bounded read bit-stable', () => {
  const wasp = hull('wasp', 16);
  const mule = hull('mule', 55);
  // 30 WU/s: the honest exchange sits under the clamp, so the solver already reports it.
  const bump = contact(wasp, mule, routeMomentum(16, 55, 30) * 1.0001, 30);
  const legacy = resolveCollisionConsequence({
    tick: 100, target: wasp, other: mule,
    exchangedMomentum: routeMomentum(16, 55, 30) * 1.0001,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 }, provenance: provenanceFor('mule'),
  });
  assert.equal(bump.ramDeltaV, undefined, 'the ram law never touches an unclamped contact');
  assert.equal(bump.impactDamage, legacy.impactDamage);
  // Traffic grinding: a slow scrape stays far below a hull's worth.
  const grind = contact(wasp, mule, routeMomentum(16, 55, 15), 15);
  assert.ok(grind.impactDamage < 1, `grinding is not chaos (${grind.impactDamage})`);
});

test('fail-closed: whip-suppressed craft damage, a massless partner, no closing speed', () => {
  const wasp = hull('wasp', 16);
  const mule = hull('mule', 55);
  const suppressed = resolveCollisionConsequence({
    tick: 100, target: wasp, other: mule,
    exchangedMomentum: routeMomentum(16, 55, 130),
    preSolveClosingSpeed: 130,
    suppressCraftDamage: true,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 }, provenance: provenanceFor('mule'),
  });
  assert.equal(suppressed.impactDamage, 0, 'a whip contact stays two authored packets, no third');
  assert.equal(suppressed.ramDeltaV, undefined);
  const massless = resolveCollisionConsequence({
    tick: 100,
    target: { id: 'x', type: 'ship', mass: 16 },
    other: { id: 'y', type: 'ship' },
    exchangedMomentum: 16 * MAX_CONTACT_DV,
    preSolveClosingSpeed: 130,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 },
  });
  assert.equal(massless.ramDeltaV, undefined, 'no partner mass, no ram read');
  const noClosing = resolveCollisionConsequence({
    tick: 100, target: wasp, other: mule,
    exchangedMomentum: 16 * MAX_CONTACT_DV,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 }, provenance: provenanceFor('mule'),
  });
  assert.equal(noClosing.ramDeltaV, undefined, 'a legacy receipt without a closing speed is untouched');
});

test('the ram law only ever raises the bounded read, and control keeps the solver Δv', () => {
  const pairs = [[16, 90], [55, 55], [90, 16], [48, 48], [24, 120], [140, 140]];
  for (const [victimMass, strikerMass] of pairs) {
    for (const closing of [10, 30, 55, 90, 130, 170]) {
      const victim = hull('v', victimMass);
      const striker = hull('s', strikerMass);
      const momentum = routeMomentum(victimMass, strikerMass, closing);
      if (!(momentum >= 1)) continue;
      const bounded = resolveCollisionConsequence({
        tick: 100, target: victim, other: striker, exchangedMomentum: momentum,
        pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 }, provenance: provenanceFor('s'),
      });
      const withRam = contact(victim, striker, momentum, closing);
      const label = `${victimMass} struck by ${strikerMass} at ${closing}`;
      assert.ok(withRam.impactDamage >= bounded.impactDamage, `${label}: never lower`);
      assert.equal(withRam.control, bounded.control, `${label}: control reads the solver`);
      assert.equal(withRam.deltaV, bounded.deltaV, `${label}: receipt Δv stays the solver's`);
    }
  }
});

test('CRAFT_RAM_LAW is the dead two-body share, unreadable inputs read zero', () => {
  assert.equal(CRAFT_RAM_LAW.restitution, 0);
  assert.equal(CRAFT_RAM_LAW.minShare, 30, 'the crumple family floor');
  assert.ok(Object.isFrozen(CRAFT_RAM_LAW));
  assert.equal(craftRamDeltaV(NaN, 16, 90), 0);
  assert.equal(craftRamDeltaV(-5, 16, 90), 0);
  assert.equal(craftRamDeltaV(120, 0, 90), 0);
  assert.equal(craftRamDeltaV(120, 16, 0), 0);
  assert.equal(craftRamDeltaV(100, 50, 50), 50);
});
