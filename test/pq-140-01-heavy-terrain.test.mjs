// PQ-140.01 — a heavy is moving terrain.
// The proof stays headless: authored mass makes Pulse negligible on a heavy, the heavy keeps
// carrying speed through a line change, and the existing collision consequence law makes a light
// hull's committed contact lethal without adding an HP aura.
//
// Read the last four tests together. The solver still bounds every per-contact momentum exchange
// to `min(mass) x MAX_CONTACT_DV` before the kernel sees it (`sg02DynamicBodyOwner.js`,
// `design/FEEL_CONTRACT.md` A6), and that bound is untouched: it is a rate limit on the solver.
// What changed on 2026-09-12 is that craft contact with a mass-150+ hull no longer reads its
// DAMAGE off that bound. `HEAVY_AS_TERRAIN_MASS` routes it through the same pre-solve
// closing-speed crumple law PQ-137.06 gave rock, so "a light thrown into a heavy dies" is now true
// at the bound, on the route, without a second damage rule and without touching hull points. The
// legacy no-closing-speed receipt is pinned below unchanged, so nothing that never measured a
// closing speed moved.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind } from '../src/ai/contracts.js';
import {
  HEAVY_AS_TERRAIN_MASS,
  resolveCollisionConsequence,
  resolveHitstunLaw,
} from '../src/combat/impulseKernel.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { shapeHeavyManeuverRequest } from '../src/systems/tacticalAI.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const EPSILON = 1e-9;
// Mirrored, not imported: `MAX_CONTACT_DV` lives in `src/core/sg02DynamicBodyOwner.js:107` and
// importing that module drags the physics backend into a data-only test. Every solver contact is
// bounded to `min(dynamic mass) * MAX_CONTACT_DV` at sg02DynamicBodyOwner.js:1153 and again on the
// merge at :1196, so this is the largest `exchangedMomentum` the kernel can be handed on the route.
const MAX_CONTACT_DV = 40;

function ship(id) {
  const def = SHIP_BY_ID.get(id);
  assert.ok(def, `canonical ship ${id} exists`);
  return def;
}

function turnRequest(entityId, forward = 0, brake = false) {
  return Object.freeze({
    entityId,
    kind: ManeuverKind.INTERCEPT,
    forceLocal: Object.freeze({ forward, right: 0 }),
    targetHeading: Math.PI / 2,
    brake,
  });
}

function directContactReceipt(target, other, exchangedMomentum, preSolveClosingSpeed = undefined) {
  return resolveCollisionConsequence({
    preSolveClosingSpeed,
    target: {
      id: target.id,
      type: 'ship',
      mass: target.mass,
      radius: target.collisionRadius,
    },
    other: {
      id: other.id,
      type: 'ship',
      mass: other.mass,
      radius: other.collisionRadius,
    },
    exchangedMomentum,
    tick: 1,
    pos: { x: 0, z: 0 },
    normal: { x: -1, z: 0 },
    provenance: {
      actorId: 'thrower',
      weaponId: null,
      tag: 'direct_contact',
      appliedTick: 1,
    },
  });
}

test('Hitch stays the light ship_kestrel and every mass-150+ hull is authored heavy', () => {
  assert.equal(ship('ship_kestrel').name, 'Hitch');
  assert.equal(ship('ship_kestrel').mass, 18);

  const heavy = SHIPS.filter((entry) => entry.mass >= 150);
  assert.ok(heavy.length > 0, 'the roster contains mass-150+ hulls');
  assert.ok(heavy.every((entry) => entry.heavyMotion),
    'each heavy hull carries a turn-carry profile');
});

test('a Pulse hit is small on every heavy compared with a Wasp', () => {
  const pulse = WEAPON_BY_ID.get('wpn_pulse_laser_s');
  const wasp = ship('ship_wasp');
  const heavy = SHIPS.filter((entry) => entry.mass >= 150);
  assert.ok(pulse, 'the authored Pulse weapon exists');
  assert.equal(pulse.impulsePerHit, 84, 'PQ-140.01 does not nerf Pulse');

  const waspDeltaV = pulse.impulsePerHit / wasp.mass;
  const heavyDeltaV = heavy.map((entry) => pulse.impulsePerHit / entry.mass);
  assert.equal(waspDeltaV, 5.25);
  assert.ok(Math.max(...heavyDeltaV) <= 0.56 + EPSILON,
    `the heaviest gun-scale response stays near zero (${Math.max(...heavyDeltaV)} WU/s)`);
  assert.ok(waspDeltaV / Math.max(...heavyDeltaV) >= 9,
    'a Wasp must move at least nine times more than the lightest heavy');

  for (const entry of heavy) {
    const law = resolveHitstunLaw({
      deltaV: pulse.impulsePerHit / entry.mass,
      victimCruise: 105,
      attackerMass: wasp.mass,
      victimMass: entry.mass,
    });
    assert.equal(law.durationS, 0, `${entry.id} keeps the helm under one Pulse hit`);
    assert.equal(law.entrySpin, 0, `${entry.id} does not spin under one Pulse hit`);
  }
});

test('heavy steering carries momentum and honors the 150-mass boundary', () => {
  const warden = ship('ship_warden');
  const heavyState = {
    entities: new Map([[
      1,
      {
        id: 1,
        data: { defId: warden.id },
        physicsBody: { mass: warden.mass },
        vel: { x: 40, z: 0 },
        rot: 0,
      },
    ]]),
  };
  const heavyRequest = turnRequest(1);
  const shaped = shapeHeavyManeuverRequest(heavyRequest, heavyState);
  assert.notEqual(shaped, heavyRequest, 'a frozen request is copied only when the heavy needs carry');
  assert.ok(shaped.forceLocal.forward >= warden.heavyMotion.turnCarryForward,
    `heavy keeps forward carry through the turn (${shaped.forceLocal.forward})`);

  const lightState = {
    entities: new Map([[
      2,
      {
        id: 2,
        data: { defId: 'ship_kestrel' },
        physicsBody: { mass: 18 },
        vel: { x: 40, z: 0 },
        rot: 0,
      },
    ]]),
  };
  const lightRequest = turnRequest(2);
  assert.equal(shapeHeavyManeuverRequest(lightRequest, lightState), lightRequest,
    'Hitch is not promoted to heavy by the turn policy');

  const underMassState = {
    entities: new Map([[
      3,
      {
        id: 3,
        data: { defId: 'ship_warden' },
        physicsBody: { mass: 18 },
        vel: { x: 40, z: 0 },
        rot: 0,
      },
    ]]),
  };
  const underMassRequest = turnRequest(3);
  assert.equal(shapeHeavyManeuverRequest(underMassRequest, underMassState), underMassRequest,
    'the authored hull id cannot override a sub-150 live mass');
});

// Kernel arithmetic only. The momentum below is constructed by this test from a hand-written
// elastic exchange, NOT measured from the solver, and it lands ~2.8x above the live contact bound
// pinned by the next test. Read this as "the consequence law would kill a light at that momentum",
// never as "a light thrown into a heavy dies on the route".
test('at a constructed above-bound momentum the collision law kills a light and shrugs a heavy', () => {
  const wasp = ship('ship_wasp');
  const heavy = ship('ship_warden');
  const closingSpeed = 105;
  const restitution = 0.18;
  const exchangedMomentum = (1 + restitution) * closingSpeed
    / (1 / wasp.mass + 1 / heavy.mass);
  assert.ok(exchangedMomentum > Math.min(wasp.mass, heavy.mass) * MAX_CONTACT_DV,
    'this scenario is deliberately above the live solver bound; the next test holds the route number');
  const lightReceipt = directContactReceipt(wasp, heavy, exchangedMomentum);
  const heavyReceipt = directContactReceipt(heavy, wasp, exchangedMomentum);

  assert.equal(lightReceipt.surface, 'craft');
  assert.equal(lightReceipt.provenance.tag, 'direct_contact');
  assert.ok(lightReceipt.impactDamage > wasp.hull + wasp.shield,
    `the committed light impact exceeds Wasp durability (${lightReceipt.impactDamage})`);
  assert.ok(heavyReceipt.impactDamage <= heavy.hull * 0.15,
    `the same contact barely marks the heavy (${heavyReceipt.impactDamage})`);
  assert.ok(lightReceipt.deltaV > 100, `light contact Δv is committed (${lightReceipt.deltaV})`);
  assert.ok(heavyReceipt.deltaV < 15, `heavy contact Δv stays small (${heavyReceipt.deltaV})`);
});

// The legacy receipt, unchanged. A contact that never measured a closing speed still reads its
// damage off the bounded Δv, so every manual/legacy caller is bit-stable. Both assertions hold at
// either authored `energyDamageScale` (HEAD 0.007 -> 34.4 damage, working tree 0.011 -> 54.1), so
// this test does not pin the dirty constant.
test('with no measured closing speed the bounded contact still leaves the light alive', () => {
  const wasp = ship('ship_wasp');
  const heavy = ship('ship_warden');
  const boundedMomentum = Math.min(wasp.mass, heavy.mass) * MAX_CONTACT_DV;
  const lightReceipt = directContactReceipt(wasp, heavy, boundedMomentum);
  const heavyReceipt = directContactReceipt(heavy, wasp, boundedMomentum);

  assert.equal(lightReceipt.deltaV, MAX_CONTACT_DV,
    'the bound spends itself entirely on the light hull');
  assert.ok(lightReceipt.impactDamage < wasp.hull + wasp.shield,
    `the light survives the hardest contact the solver can deliver (${lightReceipt.impactDamage} of ${wasp.hull + wasp.shield})`);
  assert.equal(heavyReceipt.impactDamage, 0,
    'the same contact does not scratch the heavy: its Δv sits under the damage threshold');
  assert.equal(heavyReceipt.control, 'none', 'the heavy never loses the helm to a light');
});

// THE ROUTE NUMBER. "A heavy is moving terrain... the player can throw lights into it" — PQ-140.01,
// and B6's "if it meets a rock at speed it dies" now means the same thing when the rock has engines.
// The momentum handed to the kernel is exactly the live solver bound; only the measured closing
// speed is added, which is what every real `physics:impact` receipt already carries.
test('at the live contact bound a light thrown into a heavy at cruise dies, and the heavy shrugs', () => {
  const wasp = ship('ship_wasp');
  const heavy = ship('ship_warden');
  assert.ok(heavy.mass >= HEAVY_AS_TERRAIN_MASS, 'the Warden is on the heavy side of the boundary');
  const boundedMomentum = Math.min(wasp.mass, heavy.mass) * MAX_CONTACT_DV;
  const closingSpeed = 105; // Wasp governed cruise (pinned by test/pq-026-02-inertial-shunt.test.mjs)

  const lightReceipt = directContactReceipt(wasp, heavy, boundedMomentum, closingSpeed);
  const heavyReceipt = directContactReceipt(heavy, wasp, boundedMomentum, closingSpeed);

  assert.equal(lightReceipt.deltaV, MAX_CONTACT_DV,
    'the solver bound is untouched: it is still a rate limit, not the damage input');
  assert.ok(lightReceipt.impactDamage > wasp.hull + wasp.shield,
    `a light committed into a heavy at cruise dies (${lightReceipt.impactDamage} against ${wasp.hull + wasp.shield})`);
  assert.ok(lightReceipt.debrisCount > 0, 'and it leaves wreckage');
  assert.equal(heavyReceipt.impactDamage, 0,
    'the heavy on the other side of the same contact is not scratched: a light is not terrain');
  assert.equal(heavyReceipt.control, 'none', 'the heavy never loses the helm to a light');
});

// The boundary is mass, and only mass. Two lights meeting at the same speed stay on the old path,
// so ordinary craft-on-craft bumping did not become lethal.
test('a sub-150 hull is not terrain: light-on-light at the same closing speed stays survivable', () => {
  const wasp = ship('ship_wasp');
  const hornet = ship('ship_hornet');
  assert.ok(hornet.mass < HEAVY_AS_TERRAIN_MASS, 'the Hornet is a light');
  const boundedMomentum = Math.min(wasp.mass, hornet.mass) * MAX_CONTACT_DV;
  const receipt = directContactReceipt(wasp, hornet, boundedMomentum, 105);
  assert.ok(receipt.impactDamage < wasp.hull + wasp.shield,
    `a Hornet is not a wall (${receipt.impactDamage} against ${wasp.hull + wasp.shield})`);
});

// A scrape is still a scrape. Below the crumple threshold the heavy does nothing to a light that
// brushes it, which is what keeps "hide behind it" and "swing around it" playable.
test('brushing a heavy under the crumple threshold costs the light nothing', () => {
  const wasp = ship('ship_wasp');
  const heavy = ship('ship_warden');
  const boundedMomentum = Math.min(wasp.mass, heavy.mass) * MAX_CONTACT_DV;
  const receipt = directContactReceipt(wasp, heavy, boundedMomentum, 12);
  assert.equal(receipt.impactDamage, 0, 'a brush is not a throw');
});
