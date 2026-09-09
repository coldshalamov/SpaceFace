// PQ-140.01 — a heavy is moving terrain.
// The proof stays headless: authored mass makes Pulse negligible on a heavy, the heavy keeps
// carrying speed through a line change, and the existing collision consequence law makes a light
// hull's committed contact lethal without adding an HP aura.
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

test('a Wasp thrown into a heavy dies through the collision law while the heavy shrugs', () => {
  const wasp = ship('ship_wasp');
  const heavy = ship('ship_warden');
  const closingSpeed = 105;
  const restitution = 0.18;
  const exchangedMomentum = (1 + restitution) * closingSpeed
    / (1 / wasp.mass + 1 / heavy.mass);
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
