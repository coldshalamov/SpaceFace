import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const SPAWN = { x: 1480, z: -330 };

// Two bodies co-created on one authored point — the aftermath wreck and the manifest payload
// both spawn at victim.pos — would land f32-identical collider centers on Rapier's narrow
// phase, which returns a degenerate ~10^6-unit penetration depth. At seed 4242 the witnessed
// kill teleported the pair to -758,305 / +1,742,654 WU and the law responder flew at the
// corrupted anchor forever. The owner guard claims the smallest free +x ladder slot instead.

function dynamicBody(id, { type = 'payload', shape = 'ball', material = 'payload', mass = 24, radius = 5 } = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    radius,
    pos: { x: SPAWN.x, z: SPAWN.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
    data: {},
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * radius * radius,
      shape,
      dynamic: true,
      ccd: false,
      material,
      revision: 0,
    },
  };
}

function staticBody(id, { material = 'station', radius = 40 } = {}) {
  const entity = dynamicBody(id, { type: 'station', material, radius, mass: 800 });
  entity.physicsBody.dynamic = false;
  entity.physicsBody.ccd = false;
  return entity;
}

test('co-spawned dynamic bodies on one authored point never collide coincident', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const wreck = dynamicBody(10, { type: 'wreck', shape: 'capsule', material: 'debris', mass: 55, radius: 18 });
    const pod = dynamicBody(11);
    owner.syncFromEntities([wreck, pod]);
    // The guard fired at creation: the second co-created body claimed the +2.5 ladder slot
    // (2.5 WU clears the measured ~1.5 WU degenerate window along a capsule partner's axis).
    assert.ok(Math.abs(wreck.pos.x - SPAWN.x) < 0.01, `wreck keeps the authored point (${wreck.pos.x})`);
    assert.ok(Math.abs(pod.pos.x - (SPAWN.x + 2.5)) < 0.01,
      `pod claims the +2.5 ladder slot (got ${pod.pos.x})`);
    owner.step(DT);
    owner.step(DT);
    const sep = Math.hypot(wreck.pos.x - pod.pos.x, wreck.pos.z - pod.pos.z);
    assert.ok(sep > 0.1 && sep < 100,
      `the pair must resolve to an ordinary shallow contact, not a teleport (sep=${sep})`);
    for (const entity of [wreck, pod]) {
      assert.ok(Math.abs(entity.pos.x - SPAWN.x) < 100 && Math.abs(entity.pos.z - SPAWN.z) < 100,
        `#${entity.id} must stay near the kill point (got ${entity.pos.x.toFixed(1)},${entity.pos.z.toFixed(1)})`);
    }
  } finally {
    owner.dispose();
  }
});

test('a coincident spawn in a later pass nudges off the earlier body', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const first = dynamicBody(20);
    owner.syncFromEntities([first]);
    owner.step(DT);
    const second = dynamicBody(21);
    owner.syncFromEntities([first, second]);
    assert.ok(Math.abs(second.pos.x - (SPAWN.x + 2.5)) < 0.01,
      `late coincident body takes the +2.5 slot (got ${second.pos.x})`);
    owner.step(DT);
    const sep = Math.hypot(first.pos.x - second.pos.x, first.pos.z - second.pos.z);
    assert.ok(sep > 0.1 && sep < 100, `bounded separation (sep=${sep})`);
  } finally {
    owner.dispose();
  }
});

test('coincidence ladder stacks: third body lands +1.0, production layer path', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const a = dynamicBody(30);
    const b = dynamicBody(31);
    const c = dynamicBody(32);
    owner.syncFromEntityLayers([], [a, b, c], 1, null);
    assert.ok(Math.abs(b.pos.x - (SPAWN.x + 2.5)) < 0.01, `b at +2.5 (got ${b.pos.x})`);
    assert.ok(Math.abs(c.pos.x - (SPAWN.x + 5.0)) < 0.01, `c at +5.0 (got ${c.pos.x})`);
    owner.step(DT);
    for (const e of [a, b, c]) {
      assert.ok(Math.abs(e.pos.x - SPAWN.x) < 100, `#${e.id} bounded (${e.pos.x.toFixed(1)})`);
    }
  } finally {
    owner.dispose();
  }
});

test('a dead partner record does not force a nudge off the authored point', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const victim = dynamicBody(40, { type: 'ship', shape: 'capsule', material: 'ship', mass: 60, radius: 14 });
    owner.syncFromEntities([victim]);
    owner.step(DT);
    victim.alive = false;
    const wreck = dynamicBody(41, { type: 'wreck', shape: 'capsule', material: 'debris', mass: 55, radius: 18 });
    owner.syncFromEntities([wreck]);
    assert.ok(Math.abs(wreck.pos.x - SPAWN.x) < 0.01,
      `wreck lands exactly on the kill point — a dead record is on its way out (got ${wreck.pos.x})`);
  } finally {
    owner.dispose();
  }
});

test('ghost-material bodies neither nudge nor force nudges', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const solid = dynamicBody(50);
    owner.syncFromEntities([solid]);
    owner.step(DT);
    // A ghost candidate on an occupied point keeps its authored pose.
    const ghost = dynamicBody(51, { type: 'pickup', material: 'default' });
    owner.syncFromEntities([solid, ghost]);
    assert.ok(Math.abs(ghost.pos.x - SPAWN.x) < 0.01, `ghost stays on the authored point (${ghost.pos.x})`);
    // And a solid body co-spawned onto a ghost is unaffected — ghosts form no pairs.
    const ghost2 = dynamicBody(52, { type: 'pickup', material: 'default' });
    const solid2 = dynamicBody(53);
    ghost2.pos = { x: 2000, z: 2000 };
    solid2.pos = { x: 2000, z: 2000 };
    owner.syncFromEntities([solid, ghost, ghost2, solid2]);
    assert.ok(Math.abs(solid2.pos.x - 2000) < 0.01,
      `solid body ignores a coincident ghost (${solid2.pos.x})`);
    owner.step(DT);
  } finally {
    owner.dispose();
  }
});

test('the +x slot is safe against a rotated capsule partner (axis off-x)', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    // Partner capsule axis lies along world Z; a +x nudge is perpendicular to its axis.
    const wreck = dynamicBody(64, { type: 'wreck', shape: 'capsule', material: 'debris', mass: 55, radius: 18 });
    wreck.rot = Math.PI / 2;
    const pod = dynamicBody(65);
    owner.syncFromEntities([wreck, pod]);
    assert.ok(Math.abs(pod.pos.x - (SPAWN.x + 2.5)) < 0.01, `pod claims the +2.5 slot (${pod.pos.x})`);
    owner.step(DT);
    owner.step(DT);
    const sep = Math.hypot(wreck.pos.x - pod.pos.x, wreck.pos.z - pod.pos.z);
    assert.ok(sep > 0.1 && sep < 100, `bounded separation against rotated partner (sep=${sep})`);
    for (const e of [wreck, pod]) {
      assert.ok(Math.abs(e.pos.x - SPAWN.x) < 100 && Math.abs(e.pos.z - SPAWN.z) < 100,
        `#${e.id} stays near the kill point (${e.pos.x.toFixed(1)},${e.pos.z.toFixed(1)})`);
    }
  } finally {
    owner.dispose();
  }
});

test('a scripted teleport onto an occupied point cannot land coincident', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const home = dynamicBody(66);
    const mover = dynamicBody(67);
    mover.pos = { x: 3000, z: 3000 };
    owner.syncFromEntities([home, mover]);
    owner.step(DT);
    // A teleport-by-entity.pos (noInterp-style scripted placement) must get the same guard.
    mover.flags = { noInterp: true };
    mover.pos.x = SPAWN.x;
    mover.pos.z = SPAWN.z;
    owner.syncFromEntities([home, mover]);
    assert.ok(Math.abs(mover.pos.x - (SPAWN.x + 2.5)) < 0.01,
      `teleported body is written back to the free slot (${mover.pos.x})`);
    const rec = owner.records.get(67);
    assert.ok(Math.abs(rec.body.translation().x - (SPAWN.x + 2.5)) < 0.02,
      `the body itself lands on the free slot (${rec.body.translation().x})`);
    owner.step(DT);
    const sep = Math.hypot(home.pos.x - mover.pos.x, home.pos.z - mover.pos.z);
    assert.ok(sep > 0.1 && sep < 100, `bounded separation (sep=${sep})`);
  } finally {
    owner.dispose();
  }
});

test('a static record coincident with a live dynamic is nudged off it', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const dyn = dynamicBody(60);
    owner.syncFromEntities([dyn]);
    owner.step(DT);
    const stat = staticBody(61);
    owner.syncFromEntities([dyn, stat]);
    assert.ok(Math.abs(stat.pos.x - (SPAWN.x + 2.5)) < 0.01,
      `static candidate yields to the live dynamic (${stat.pos.x})`);
    owner.step(DT);
    assert.ok(Math.abs(dyn.pos.x - SPAWN.x) < 100, `dynamic stays home (${dyn.pos.x.toFixed(1)})`);
  } finally {
    owner.dispose();
  }
});

test('static-static coincidence is left alone — fixed pairs never form contacts', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const s1 = staticBody(70);
    owner.syncFromEntities([s1]);
    const s2 = staticBody(71);
    owner.syncFromEntities([s1, s2]);
    assert.ok(Math.abs(s2.pos.x - SPAWN.x) < 0.01,
      `second static keeps its authored point (${s2.pos.x})`);
  } finally {
    owner.dispose();
  }
});
