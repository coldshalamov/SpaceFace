// Hull-burst overhaul, slice A, packet 4: a hull that has lost its helm pings off what it meets.
//
// Owner, 2026-09-29: "the ship tumbling out of control off into another direction and pinging off
// of objects." Ships carry restitution 0 with a Min combine rule on purpose (a piloted hull glancing
// a rock should scrape, not bounce onto a new heading), so a hurled hull used to stop dead on the
// rock face. Under `combat.tumbleFling` a hull whose control mode is 'tumbling' (the tumble AND its
// recovery beat) gets a bouncy Max-rule material, a raised contact bound, a token angular drag, and
// an explicit ricochet against fixed bodies (the solver alone does not ping a SPINNING capsule: its
// off-centre contact point moves faster than the approach). Controlled hulls keep scraping.
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
  physicsBody: { schemaVersion: 1, radius: 40, mass: 5000, inertiaY: 5000, dynamic: false, ccd: false, material: 'asteroid', revision: 0 },
  data: {},
});

function wasp(id, x, vx, spin, team = 1) {
  const entity = makeEntity({ ...makeShipEntitySpec('ship_wasp', { team, pos: { x, z: 0 }, rot: Math.PI }), id });
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

/** Fly `ship` at the rock with the given control mode and report the best velocity AWAY from it. */
async function hitRock({ speed, spin, mode }) {
  const ship = wasp(2, -20, -speed, spin);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([ship, ROCK()]);
    let awayMax = -Infinity;
    for (let i = 0; i < 100; i++) {
      writePhysicsControl(ship, CONTROL[mode]);
      owner.step(SIM_DT);
      awayMax = Math.max(awayMax, ship.vel.x); // the rock is on the -x side, so away = +x
    }
    return { awayMax, finalVx: ship.vel.x };
  } finally { owner.dispose(); }
}

test('a spinning tumbling hull pings off a rock at 0.6x its approach speed (the case the solver alone fails)', async () => {
  await withFlag(true, async () => {
    const slow = await hitRock({ speed: 28, spin: -4.3, mode: 'tumbling' });
    assert.ok(slow.awayMax >= 0.55 * 28 && slow.awayMax <= 0.65 * 28,
      `28 WU/s in, ~16.8 out (0.6x): got ${slow.awayMax.toFixed(2)}`);
    // Fast enough that the old 40 WU/s per-tick contact bound would have truncated the rebound.
    const fast = await hitRock({ speed: 100, spin: -4.3, mode: 'tumbling' });
    assert.ok(fast.awayMax >= 0.55 * 100, `100 WU/s in, ~60 out despite the old 40 WU/s bound: got ${fast.awayMax.toFixed(2)}`);
  });
});

test('flag off: the same tumbling hull stops dead on the rock, exactly as before', async () => {
  await withFlag(false, async () => {
    const stopped = await hitRock({ speed: 28, spin: -4.3, mode: 'tumbling' });
    // Restitution 0 with a Min rule: no bounce. (A spinning capsule's off-centre contact leaves a few
    // WU/s of solver recoil; the ping this packet adds is ~17 WU/s at the same closing speed.)
    assert.ok(stopped.awayMax < 6, `the hull scrapes to a stop, far below a ping (got away ${stopped.awayMax.toFixed(2)})`);
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
    const a = wasp(2, -20, -110, 0);
    const b = wasp(4, -60, 0, 0);
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
    const ship = wasp(2, 0, 0, 6);
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
