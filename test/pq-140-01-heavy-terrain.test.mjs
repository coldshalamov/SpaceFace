// PQ-140.01 — a heavy is moving terrain.
// The proof stays headless: authored mass makes Pulse negligible on a heavy, the heavy keeps
// carrying speed through a line change, and the existing collision consequence law makes a light
// hull's committed contact lethal without adding an HP aura.
//
// Read the last two tests together. The collision-law kill is real *kernel* arithmetic but it is
// fed a momentum the live solver cannot produce: `sg02DynamicBodyOwner.js:107` bounds every
// per-contact momentum exchange to `min(mass) x MAX_CONTACT_DV` before the kernel ever sees it
// (`design/FEEL_CONTRACT.md` A6). At that bound the light survives. This file pins both numbers so
// the gap between the law and the route is a fact the next reader inherits, not a surprise.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind } from '../src/ai/contracts.js';
import { resolveCollisionConsequence, resolveHitstunLaw } from '../src/combat/impulseKernel.js';
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

function directContactReceipt(target, other, exchangedMomentum) {
  return resolveCollisionConsequence({
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

// The route number. The heavy half of B11 holds here — a heavy is genuinely unmoved by contact with
// a light. The light half of B6 does not: at the bound the thrown light keeps most of its
// durability, so "a light that hits one dies" is not yet true on the live path through this law.
// `TERRAIN_CRUMPLE_LAW` does not rescue it either — the kernel gates the crumple bypass on
// `worldSurface` (terrain/structure), so craft-vs-craft contact stays on the bounded-Δv energy
// proxy. Both assertions below hold at either authored `energyDamageScale` (HEAD 0.007 -> 34.4
// damage, working tree 0.011 -> 54.1), so this test does not pin the dirty constant.
test('at the live contact bound the same throw does not kill the light', () => {
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
