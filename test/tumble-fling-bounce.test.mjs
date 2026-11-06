// Hull-burst overhaul, slice A, packet 4: a hull that has lost its helm pings off what it meets.
//
// Owner, 2026-09-29: "the ship tumbling out of control off into another direction and pinging off
// of objects." Ships carry restitution 0 with a Min combine rule on purpose (a piloted hull glancing
// a rock should scrape, not bounce onto a new heading), so a hurled hull used to stop dead on the
// rock face. Under `combat.tumbleFling` a hull whose control mode is 'tumbling' (the tumble AND its
// recovery beat) gets a bouncy Max-rule material, a raised contact bound, a token angular drag, and
// an explicit ricochet against fixed bodies. The current measured compound skin may contact at
// an angle while spinning: restitution is a normal-speed law, not a world-X speed law. With the
// feature off, rotating contact points may still transfer momentum without any restitution.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { SIM_DT } from '../src/core/sim.js';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROCK = () => ({
  id: 3, type: 'asteroid', alive: true, team: -1, collides: true, pos: { x: -100, z: 0 }, vel: { x: 0, z: 0 },
  rot: 0, angVel: 0, radius: 40, mass: 5000,
  physicsBody: { schemaVersion: 1, radius: 40, mass: 5000, inertiaY: 5000, dynamic: false, ccd: false, material: 'rock', revision: 0 },
  data: {},
});

function craft(id, x, vx, spin, team = 1, hull = 'ship_wasp') {
  const entity = makeEntity({ ...makeShipEntitySpec(hull, { team, pos: { x, z: 0 }, rot: Math.PI }), id });
  entity.vel = { x: vx, z: 0 };
  entity.angVel = spin;
  return entity;
}

function withFlag(value, fn) {
  const previous = COMBAT_FLAGS.tumbleFling;
  COMBAT_FLAGS.tumbleFling = value;
  return Promise.resolve().then(fn).finally(() => { COMBAT_FLAGS.tumbleFling = previous; });
}

const CONTROL = {
  tumbling: { mode: 'tumbling', force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, source: 'hitstun_free' },
  piloted: { mode: 'assisted', force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, source: 'test-piloted' },
};

function kineticEnergy(rec) {
  const v = rec.body.linvel();
  const w = rec.body.angvel().y;
  return 0.5 * rec.body.mass() * (v.x * v.x + v.z * v.z)
    + 0.5 * rec.body.principalInertia().y * w * w;
}

/** Real authored body, native force receipts and normal-speed/energy measurements. */
async function hitRock({ speed, spin, mode, hull = 'ship_wasp' }) {
  const ship = craft(2, -20, -speed, spin, 1, hull);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([ship, ROCK()]);
    const rec = owner.records.get(ship.id);
    const initialEnergy = kineticEnergy(rec);
    const contacts = [];
    let nativeVelocity;
    const nativeStep = owner.world.step;
    owner.world.step = function (...args) {
      const result = nativeStep.apply(this, args);
      nativeVelocity = rec.body.linvel();
      return result;
    };
    let awayMax = -Infinity;
    for (let i = 0; i < 100; i++) {
      writePhysicsControl(ship, CONTROL[mode]);
      owner.step(SIM_DT);
      awayMax = Math.max(awayMax, ship.vel.x); // the rock is on the -x side, so away = +x
      for (const receipt of owner.drainContactImpacts()) {
        if (receipt.aId !== ship.id && receipt.bId !== ship.id) continue;
        const sign = receipt.aId === ship.id ? -1 : 1;
        const nx = receipt.normal.x * sign;
        const nz = receipt.normal.z * sign;
        const expected = rec.expected;
        const velocity = rec.body.linvel();
        contacts.push({ tick: owner.tick, normal: { x: nx, z: nz },
          closing: -(expected.vx * nx + expected.vz * nz), leaving: velocity.x * nx + velocity.z * nz,
          velocity, nativeVelocity,
          beforeEnergy: 0.5 * rec.body.mass() * (expected.vx ** 2 + expected.vz ** 2)
            + 0.5 * rec.body.principalInertia().y * expected.wy ** 2,
          afterEnergy: kineticEnergy(rec) });
      }
    }
    return { awayMax, finalVx: ship.vel.x, contacts, initialEnergy, finalEnergy: kineticEnergy(rec),
      mass: rec.body.mass(), inertia: rec.body.principalInertia().y, colliders: rec.colliders.length,
      damping: rec.body.angularDamping(), minRule: owner.RAPIER.CoefficientCombineRule.Min,
      maxRule: owner.RAPIER.CoefficientCombineRule.Max,
      materials: rec.colliders.map(c => ({ restitution: c.restitution(),
        combine: c.restitutionCombineRule(), friction: c.friction() })) };
  } finally { owner.dispose(); }
}

test('spinning authored hulls rebound at 0.6x closing speed along the actual contact normal without gaining energy', async t => {
  await withFlag(true, async () => {
    for (const hull of ['ship_wasp', 'ship_kestrel']) for (const speed of [28, 100]) {
      const hit = await hitRock({ speed, spin: -4.3, mode: 'tumbling', hull });
      assert.ok(hit.colliders > 1, 'use the measured compound hull, not the retired capsule');
      assert.ok(hit.materials.every(m => Math.abs(m.restitution - 0.6) < 1e-6
        && m.combine === hit.maxRule && m.friction === 0));
      const hardContacts = hit.contacts.filter(c => c.closing > 6);
      assert.ok(hardContacts.length > 0, 'the real native contact crosses the ping floor');
      for (const c of hardContacts) {
        assert.ok(c.leaving >= 0.6 * c.closing - 1e-4,
          `${hull} at ${speed}: normal departure ${c.leaving} must meet 0.6 * ${c.closing}`);
        assert.ok(c.afterEnergy <= c.beforeEnergy + 1e-3,
          'this unpowered impact loses energy across the real angular and linear response');
      }
      t.diagnostic(JSON.stringify({ hull, speed, awayMax: hit.awayMax, mass: hit.mass,
        inertia: hit.inertia, colliders: hit.colliders, contact: hardContacts[0] }));
    }
  });
});

test('flag off: spinning authored hulls keep the base material and native linear contact response', async t => {
  await withFlag(false, async () => {
    for (const hull of ['ship_wasp', 'ship_kestrel']) {
      const hit = await hitRock({ speed: 28, spin: -4.3, mode: 'tumbling', hull });
      assert.ok(hit.materials.every(m => m.restitution === 0 && m.combine === hit.minRule && m.friction === 0));
      assert.ok(Math.abs(hit.damping - 0.4) < 1e-6);
      assert.ok(hit.contacts.length > 0);
      for (const c of hit.contacts) {
        assert.ok(Math.hypot(c.velocity.x - c.nativeVelocity.x, c.velocity.z - c.nativeVelocity.z) < 1e-5,
          'flag off passes native linear response without the tumbling ricochet floor');
      }
      assert.ok(hit.contacts[0].afterEnergy < hit.contacts[0].beforeEnergy);
      assert.ok(hit.finalEnergy <= hit.initialEnergy);
      t.diagnostic(JSON.stringify({ hull, awayMax: hit.awayMax, initialEnergy: hit.initialEnergy,
        finalEnergy: hit.finalEnergy, damping: hit.damping, material: hit.materials[0] }));
    }
  });
});

test('a piloted hull keeps scraping even with the flag on: the ping is only for hulls that lost their helm', async () => {
  await withFlag(true, async () => {
    const piloted = await hitRock({ speed: 28, spin: 0, mode: 'piloted' });
    assert.ok(piloted.awayMax < 1.0, `a controlled hull glancing a rock must not bounce onto a new heading (got away ${piloted.awayMax.toFixed(2)})`);
  });
});

test('a graze is not a ping: closing speed under the ricochet floor gets no rebound', async () => {
  await withFlag(true, async () => {
    const graze = await hitRock({ speed: 4, spin: 0, mode: 'tumbling' });
    // The Max-rule material still bounces a slow hull a little (that is the solver, 0.6x), but the
    // explicit ricochet does not fire below the floor, so the total never exceeds the solver's own.
    assert.ok(graze.awayMax <= 0.6 * 4 + 0.2, `a 4 WU/s touch stays a touch (got away ${graze.awayMax.toFixed(2)})`);
  });
});

test('a tumbling hull carries the bigger knock into the next hull; a piloted hull does not', async () => {
  const knock = async (mode) => {
    const a = craft(2, -20, -110, 0);
    const b = craft(4, -60, 0, 0);
    const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
    try {
      owner.syncFromEntities([a, b]);
      let bestB = 0;
      for (let i = 0; i < 90; i++) {
        writePhysicsControl(a, CONTROL[mode]);
        writePhysicsControl(b, CONTROL.piloted);
        owner.step(SIM_DT);
        bestB = Math.min(bestB, b.vel.x); // B is struck from the +x side, so it is pushed toward -x
      }
      return -bestB;
    } finally { owner.dispose(); }
  };
  await withFlag(true, async () => {
    const tumbling = await knock('tumbling');
    const piloted = await knock('piloted');
    assert.ok(tumbling > piloted + 5,
      `the Max-rule bounce hands the second hull more speed than a scraping hull does (${tumbling.toFixed(1)} vs ${piloted.toFixed(1)} WU/s)`);
  });
});

test('a tumbling hull keeps its spin (token angular drag) where a piloted hull\'s damps away', async () => {
  const spinAfter = async (mode) => {
    const ship = craft(2, 0, 0, 6);
    const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
    try {
      owner.syncFromEntities([ship]);
      for (let i = 0; i < 180; i++) {
        writePhysicsControl(ship, CONTROL[mode]);
        owner.step(SIM_DT);
      }
      return Math.abs(ship.angVel);
    } finally { owner.dispose(); }
  };
  await withFlag(true, async () => {
    const tumbling = await spinAfter('tumbling');
    const piloted = await spinAfter('piloted');
    assert.ok(tumbling > 4.8, `3 s in, a tumbling hull still spins at ~85% (got ${tumbling.toFixed(2)} rad/s)`);
    assert.ok(piloted < 3.4, `a piloted hull's RCS-model damping has taken it to ~30% (got ${piloted.toFixed(2)} rad/s)`);
  });
});

test('disabling tumbleFling restores an existing native body contact profile', async t => {
  await withFlag(true, async () => {
    const ship = makeEntity({ ...makeShipEntitySpec('ship_kestrel'), id: 2 });
    const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT });
    try {
      owner.syncFromEntities([ship]);
      writePhysicsControl(ship, CONTROL.tumbling);
      owner.step(SIM_DT);
      const rec = owner.records.get(ship.id);
      const handles = rec.colliders.map(c => c.handle);
      const mass = rec.body.mass();
      const inertia = rec.body.principalInertia().y;
      assert.ok(rec.colliders.every(c => Math.abs(c.restitution() - 0.6) < 1e-6));
      const enabledProfile = { restitution: rec.collider.restitution(),
        combine: rec.collider.restitutionCombineRule(), damping: rec.body.angularDamping() };
      COMBAT_FLAGS.tumbleFling = false;
      writePhysicsControl(ship, CONTROL.tumbling);
      owner.step(SIM_DT);
      assert.ok(rec.colliders.every(c => c.restitution() === 0),
        'flag off removes the previous projectile restitution before the native solve');
      assert.ok(rec.colliders.every(c => c.restitutionCombineRule() === owner.RAPIER.CoefficientCombineRule.Min));
      assert.ok(Math.abs(rec.body.angularDamping() - 0.4) < 1e-6);
      assert.equal(rec._tumbling, false);
      assert.deepEqual(rec.colliders.map(c => c.handle), handles);
      assert.equal(rec.body.mass(), mass);
      assert.equal(rec.body.principalInertia().y, inertia);
      t.diagnostic(JSON.stringify({ enabledProfile, disabledProfile: {
        restitution: rec.collider.restitution(), combine: rec.collider.restitutionCombineRule(),
        damping: rec.body.angularDamping() }, colliders: handles.length, mass, inertia }));
      COMBAT_FLAGS.tumbleFling = true;
      writePhysicsControl(ship, CONTROL.tumbling);
      owner.step(SIM_DT);
      assert.ok(rec.colliders.every(c => Math.abs(c.restitution() - 0.6) < 1e-6));
    } finally { owner.dispose(); }
  });
});
