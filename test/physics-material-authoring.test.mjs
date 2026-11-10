import assert from 'node:assert/strict';
import test from 'node:test';

import { PHYSICS_MATERIALS } from '../src/data/physicsMaterials.js';
import {
  defaultMass,
  ensurePhysicsBodySpec,
  resolvePhysicsBodySpec,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { fieldBodyProfile } from '../src/systems/fields.js';

const DT = 1 / 60;

function bodyEntity(id, overrides = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 4,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    ...overrides,
  };
}

test('material catalog carries the settled contact table and solid densities', () => {
  assert.ok(Object.isFrozen(PHYSICS_MATERIALS));
  assert.ok(Object.isFrozen(PHYSICS_MATERIALS.rock));
  assert.equal(PHYSICS_MATERIALS.ship.restitutionCombine, 'min');
  for (const key of Object.keys(PHYSICS_MATERIALS)) {
    if (key === 'ship') continue;
    assert.equal(PHYSICS_MATERIALS[key].restitutionCombine, undefined,
      `${key}: only ship authors a combine rule; everything else keeps the Rapier average default`);
  }
  assert.equal(PHYSICS_MATERIALS.rock.restitution, 0.22);
  assert.equal(PHYSICS_MATERIALS.rock.density, 0.25);
  assert.equal(PHYSICS_MATERIALS.debris.restitution, 0.16);
  assert.equal(PHYSICS_MATERIALS.payload.density, 0.08);
  assert.equal(PHYSICS_MATERIALS.buoy.density, 0.06);
  assert.equal(PHYSICS_MATERIALS.projectile.ghost, true);
  assert.equal(PHYSICS_MATERIALS.massline_sensor.ghost, true);
  assert.equal(PHYSICS_MATERIALS.default.restitution, 0.15);
});

test('authored density derives volume mass only when no explicit mass exists', () => {
  const small = bodyEntity(1, { physicsBody: { schemaVersion: 1, density: 0.5 } });
  const big = bodyEntity(2, { radius: 8, physicsBody: { schemaVersion: 1, radius: 8, density: 0.5 } });
  assert.equal(ensurePhysicsBodySpec(small).mass, Math.round(0.5 * 4 * 4 * 4));
  assert.equal(ensurePhysicsBodySpec(big).mass, Math.round(0.5 * 8 * 8 * 8));
  assert.equal(
    ensurePhysicsBodySpec(big).mass / ensurePhysicsBodySpec(small).mass, 8,
    'cube size doubles radius: mass scales by the volume factor 8',
  );
  const stale = bodyEntity(3, { mass: 9999, physicsBody: { schemaVersion: 1, density: 0.5 } });
  assert.equal(ensurePhysicsBodySpec(stale).mass, Math.round(0.5 * 4 * 4 * 4),
    'an authored density wins over a stale legacy entity.mass');
  const explicit = bodyEntity(4, { physicsBody: { schemaVersion: 1, density: 0.5, mass: 77 } });
  assert.equal(ensurePhysicsBodySpec(explicit).mass, 77, 'an explicit authored mass still wins');
  const legacy = bodyEntity(5, { mass: 6400 });
  assert.equal(ensurePhysicsBodySpec(legacy).mass, Math.round(0.25 * 4 * 4 * 4),
    'solid types ignore a stale legacy mass and keep the density default');
  assert.equal(defaultMass(bodyEntity(6), 4), Math.round(0.25 * 4 * 4 * 4));
});

test('contact override normalizes, clamps, and stays off the default resolved spec', () => {
  const plain = bodyEntity(1, { type: 'ship', physicsBody: { schemaVersion: 1 } });
  const spec = resolvePhysicsBodySpec(plain);
  for (const key of ['contact', 'density', 'impactDamageScale', 'fieldResponseMult']) {
    assert.equal(key in spec, false, `default resolved spec carries no ${key} key`);
  }
  const authored = bodyEntity(2, {
    type: 'ship',
    physicsBody: {
      schemaVersion: 1,
      contact: { friction: 2, restitution: -1, angularDamping: 99, restitutionCombine: 'bogus', ghost: true },
      impactDamageScale: 2,
      fieldResponseMult: 0.5,
    },
  });
  const spec2 = resolvePhysicsBodySpec(authored);
  assert.deepEqual(spec2.contact, { friction: 1, restitution: 0, angularDamping: 8 },
    'contact clamps to legal ranges and drops non-authorable keys');
  assert.equal(spec2.impactDamageScale, 2);
  assert.equal(spec2.fieldResponseMult, 0.5);
  const roundtrip = JSON.parse(JSON.stringify(authored.physicsBody));
  const reloaded = bodyEntity(3, { type: 'ship', physicsBody: roundtrip });
  const spec3 = resolvePhysicsBodySpec(reloaded);
  assert.deepEqual(spec3.contact, spec2.contact, 'contact override survives a save roundtrip');
  assert.equal(spec3.impactDamageScale, spec2.impactDamageScale);
  assert.equal(spec3.fieldResponseMult, spec2.fieldResponseMult);
  const combine = bodyEntity(4, {
    type: 'ship',
    physicsBody: { schemaVersion: 1, contact: { restitutionCombine: 'max' } },
  });
  assert.equal(resolvePhysicsBodySpec(combine).contact.restitutionCombine, 'max');
});

test('live collider consumes the merged material and tumble exit restores the override', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const entity = bodyEntity(1, {
      type: 'asteroid',
      physicsBody: {
        schemaVersion: 1,
        radius: 4,
        mass: 32,
        inertiaY: 256,
        dynamic: true,
        ccd: false,
        material: 'rock',
        contact: { friction: 0.5, restitution: 0.9, angularDamping: 2, restitutionCombine: 'max' },
        revision: 0,
      },
    });
    owner.syncFromEntities([entity]);
    owner.step(DT);
    const rec = owner.records.get(1);
    const rules = owner.RAPIER.CoefficientCombineRule;
    const collider = rec.colliders[0];
    const near = (got, want) => Math.abs(got - want) < 1e-6;
    assert.ok(near(collider.friction(), 0.5), 'authored friction reaches the live collider');
    assert.ok(near(collider.restitution(), 0.9), 'authored restitution reaches the live collider');
    assert.equal(collider.restitutionCombineRule(), rules.Max, 'authored combine rule reaches the live collider');
    owner._syncTumbleMaterial(rec, true);
    assert.ok(near(collider.restitution(), 0.6), 'tumble swaps in the fling material');
    owner._syncTumbleMaterial(rec, false);
    assert.ok(near(collider.restitution(), 0.9), 'exiting tumble restores the AUTHORED restitution');
    assert.equal(collider.restitutionCombineRule(), rules.Max,
      'exiting tumble restores the authored combine rule');
    entity.physicsBody.contact = { friction: 0.5, restitution: 0.1, angularDamping: 2, restitutionCombine: 'average' };
    entity.physicsBody.revision += 1;
    owner.syncFromEntities([entity]);
    owner.step(DT);
    const rebuilt = owner.records.get(1).colliders[0];
    assert.ok(near(rebuilt.restitution(), 0.1), 'a revision bump rebuilds/retunes the collider material');
    assert.equal(rebuilt.restitutionCombineRule(), rules.Average);
  } finally {
    owner.dispose();
  }
});

test('collision consequences read physicsBody mass first and scale damage by impactDamageScale', () => {
  const target = { id: 1, type: 'ship', mass: 5, physicsBody: { mass: 80 } };
  const rock = { id: 2, type: 'asteroid', mass: 1000, physicsBody: { mass: 1000 } };
  const receipt = resolveCollisionConsequence({
    target, other: rock, exchangedMomentum: 200, tick: 1,
    pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 },
  });
  assert.ok(Math.abs(receipt.deltaV - 2.5) < 1e-9,
    `deltaV divides momentum by physicsBody mass, not the stale legacy mass (got ${receipt.deltaV})`);
  const lightOther = { id: 3, type: 'ship', mass: 10, physicsBody: { mass: 10 } };
  const heavyOther = { id: 4, type: 'ship', mass: 10, physicsBody: { mass: 200 } };
  const slam = { exchangedMomentum: 300, preSolveClosingSpeed: 60, tick: 2, pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 } };
  const lightHit = resolveCollisionConsequence({ target: { ...target }, other: lightOther, ...slam });
  const heavyHit = resolveCollisionConsequence({ target: { ...target }, other: heavyOther, ...slam });
  assert.ok(Math.abs(lightHit.impactDamage - heavyHit.impactDamage) > 1e-9,
    'the heavy-as-terrain threshold reads physicsBody.mass, not the stale legacy mass');
  const soft = { id: 5, type: 'asteroid', mass: 1000, physicsBody: { mass: 1000, impactDamageScale: 0 } };
  const hard = { id: 6, type: 'asteroid', mass: 1000, physicsBody: { mass: 1000, impactDamageScale: 2 } };
  const softHit = resolveCollisionConsequence({ target: { ...target }, other: soft, ...slam });
  const hardHit = resolveCollisionConsequence({ target: { ...target }, other: hard, ...slam });
  assert.equal(softHit.impactDamage, 0, 'impactDamageScale 0 makes a soft surface harmless');
  const plainHit = resolveCollisionConsequence({ target: { ...target }, other: rock, ...slam });
  assert.ok(hardHit.impactDamage >= plainHit.impactDamage,
    'a harder striker never lands softer than the default material');
  assert.ok(hardHit.impactDamage <= 2 * plainHit.impactDamage + 1e-9,
    `impactDamageScale multiplies the surface multiplier before the cap (hard=${hardHit.impactDamage} plain=${plainHit.impactDamage})`);
});

test('fieldBodyProfile multiplies the earned status coupling by fieldResponseMult', () => {
  const state = {
    combat: {
      entities: {
        7: { multipliers: { fieldCoupling: 0.5 }, physicsResponse: { massScale: 1 } },
      },
    },
  };
  const authored = { id: 7, type: 'asteroid', mass: 40, physicsBody: { mass: 40, fieldResponseMult: 2 } };
  assert.equal(fieldBodyProfile(authored, state).fieldResponseMult, 1,
    'earned coupling 0.5 x authored 2 = 1');
  const deaf = { id: 8, type: 'asteroid', mass: 40, physicsBody: { mass: 40, fieldResponseMult: 0 } };
  assert.equal(fieldBodyProfile(deaf, state).fieldResponseMult, 0,
    'fieldResponseMult 0 deafens the body to the field coupling');
  const plain = { id: 9, type: 'asteroid', mass: 40 };
  assert.equal(fieldBodyProfile(plain, state).fieldResponseMult, 1,
    'no authored multiplier and no earned status keeps the default response');
});

test('an authored mass drives momentum: the same impulse moves the heavy hull less', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const light = bodyEntity(1, {
      type: 'ship',
      physicsBody: { schemaVersion: 1, radius: 4, mass: 10, inertiaY: 80, dynamic: true, ccd: true, revision: 0 },
    });
    const heavy = bodyEntity(2, {
      type: 'ship', mass: 10,
      pos: { x: 0, z: 200 },
      physicsBody: { schemaVersion: 1, radius: 4, mass: 160, inertiaY: 1280, dynamic: true, ccd: true, revision: 0 },
    });
    owner.syncFromEntities([light, heavy]);
    owner.step(DT);
    owner.applyImpulse({ entityId: 1, impulse: { x: 400, y: 0, z: 0 }, reason: 'material-test' });
    owner.applyImpulse({ entityId: 2, impulse: { x: 400, y: 0, z: 0 }, reason: 'material-test' });
    owner.step(DT);
    const lightSpeed = Math.hypot(light.vel.x, light.vel.z);
    const heavySpeed = Math.hypot(heavy.vel.x, heavy.vel.z);
    assert.ok(lightSpeed > heavySpeed * 4,
      `the same impulse moves the heavy hull far less (light=${lightSpeed.toFixed(2)} heavy=${heavySpeed.toFixed(2)})`);
    assert.ok(Math.abs(heavySpeed - 400 / 160) < 0.6,
      `the heavy hull's response is its authored mass, not the stale legacy mass (${heavySpeed.toFixed(2)})`);
  } finally {
    owner.dispose();
  }
});

test('a combined mass + contact revision retunes the live collider, not just mass', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const entity = bodyEntity(1, {
      type: 'asteroid',
      physicsBody: {
        schemaVersion: 1,
        radius: 4,
        mass: 32,
        inertiaY: 256,
        dynamic: true,
        ccd: false,
        material: 'rock',
        contact: { friction: 0.5, restitution: 0.9 },
        revision: 0,
      },
    });
    owner.syncFromEntities([entity]);
    owner.step(DT);
    const rec = owner.records.get(1);
    assert.ok(Math.abs(rec.colliders[0].restitution() - 0.9) < 1e-6);
    entity.physicsBody.mass = 160;
    entity.physicsBody.contact.restitution = 0.05;
    entity.physicsBody.revision += 1;
    owner.syncFromEntities([entity]);
    owner.step(DT);
    const after = owner.records.get(1);
    assert.ok(Math.abs(after.colliders[0].restitution() - 0.05) < 1e-6,
      'a contact change in the same revision as a mass change cannot keep stale collider values');
    assert.ok(Math.abs(after.body.mass() - 160) < 1e-6, 'the mass change still lands');
    entity.physicsBody.contact.restitution = 5;
    entity.physicsBody.revision += 1;
    owner.syncFromEntities([entity]);
    owner.step(DT);
    assert.ok(Math.abs(owner.records.get(1).colliders[0].restitution() - 1) < 1e-6,
      'a mutated out-of-range override is re-clamped on the next revision');
  } finally {
    owner.dispose();
  }
});
