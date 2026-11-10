import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner, planarProxyObbHalfHeight } from '../src/core/sg02DynamicBodyOwner.js';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetCollision } from '../src/data/ceresWorkfleet.js';
import { CERES_WORKFLEET_SLIDE_SECONDS, ceresWorkfleetSlide, ceresWorkfleetSlideRole,
  poseCeresWorkfleetPrimitive, sweepCeresWorkfleetPrimitive, ceresWorkfleetRigPose,
} from '../src/data/ceresWorkfleetArticulation.js';
import { expandProxyPrimitives, resolveCollisionProxyManifest, corridorStateFor } from '../src/data/collisionProxyManifests.js';
import { segmentHitsProxy } from '../src/combat/lineOfSight.js';
import { sweepCollisionProxyInto } from '../src/core/collisionProxySweep.js';

const DT = 1 / 60;
function hardware(role, fraction = 0, id = 700) {
  const a = C.assets[role];
  return { id, type: role === 'breaker' ? 'ship' : 'wreck', alive: true, collides: true,
    occupantGeneration: 1, hull: 1000, hullMax: 1000, radius: a.radius, mass: a.mass,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    data: { ceresWorkfleetRole: role, worldRecordId: C.identities[role === 'breaker' ? 'worker' : role],
      ceresWorkfleetSlide: fraction, ceresWorkfleetSlideTarget: fraction },
    physicsBody: { schemaVersion: 1, dynamic: role !== 'cradle', radius: a.radius, mass: a.mass,
      inertiaY: a.mass * 1000, material: 'wreck', ccd: true, revision: 0,
      collisionProxyManifest: ceresWorkfleetCollision(role) } };
}
function pin(x, z, radius = .005, id = 701) {
  return { id, type: 'debris', alive: true, collides: true, radius, mass: 1,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, hull: 1, data: {},
    physicsBody: { schemaVersion: 1, dynamic: false, radius, mass: 1, shape: 'ball', useMeasuredSkin: false } };
}
const world = (e, x, z) => ({ x: e.pos.x + Math.cos(e.rot) * x - Math.sin(e.rot) * z,
  y: 0, z: e.pos.z + Math.sin(e.rot) * x + Math.cos(e.rot) * z });
const near = (a, b, label, eps = 2e-5) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} != ${b}`);
function parity(owner, e, rec) {
  const manifest = resolveCollisionProxyManifest(e), primitives = expandProxyPrimitives(manifest, { entity: e });
  const role = e.data.ceresWorkfleetRole;
  assert.equal(primitives.length, C.assets[role].states.open.boxes.length);
  primitives.forEach((p, i) => {
    const c = rec.colliders[i], offset = c.translationWrtParent(), half = c.shape.halfExtents;
    near(offset.x, p.x * e.radius, `${p.id} native x`);
    near(offset.z, p.z * e.radius, `${p.id} native z`);
    near(half.x, p.hx * e.radius, `${p.id} native half x`);
    near(half.z, p.hz * e.radius, `${p.id} native half z`);
    near(half.y, planarProxyObbHalfHeight(p.hx * e.radius, p.hz * e.radius), `${p.id} planar extrusion`);
    assert.equal(c.density(), 0, `${p.id} changes no authored mass`);
  });
  for (let z = -72.31; z < 80; z += 13.713) {
    const a = world(e, -105, z), b = world(e, 105, z), len = Math.hypot(b.x - a.x, b.z - a.z);
    const ray = new owner.RAPIER.Ray(a, { x: (b.x - a.x) / len, y: 0, z: (b.z - a.z) / len });
    const hit = rec.colliders.some(c => c.castRay(ray, len, true) >= 0);
    assert.equal(segmentHitsProxy(e, a, b), hit, `LOS ${role}/${ceresWorkfleetSlide(e)}/${z}`);
    assert.equal(sweepCollisionProxyInto({}, e, manifest, a, b), hit, `projectile ${role}/${ceresWorkfleetSlide(e)}/${z}`);
  }
}

test('101 exact source poses include changing rams and fixed-root glTF transforms', () => {
  for (const role of ['breaker', 'cradle']) {
    const a = C.assets[role], manifest = ceresWorkfleetCollision(role), delta = role === 'breaker' ? 6 : 36;
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      manifest.primitives.forEach((p, index) => {
        const posed = poseCeresWorkfleetPrimitive(p, role, f), open = a.states.open.boxes[index], end = a.states.retained.boxes[index];
        for (const axis of ['x', 'z']) {
          near(posed[axis] * a.radius, open.center[axis] + (end.center[axis] - open.center[axis]) * f, 'source centre', 1e-10);
          near(posed[`h${axis}`] * a.radius * 2, open.size[axis] + (end.size[axis] - open.size[axis]) * f, 'source size', 1e-10);
        }
        const swept = sweepCeresWorkfleetPrimitive(p, role, 0, 1);
        assert.ok(posed.x - posed.hx >= swept.x - swept.hx - 1e-12 && posed.x + posed.hx <= swept.x + swept.hx + 1e-12);
        assert.ok(posed.z - posed.hz >= swept.z - swept.hz - 1e-12 && posed.z + posed.hz <= swept.z + swept.hz + 1e-12);
      });
      const axis = role === 'breaker' ? 'z' : 'x', root = role === 'breaker' ? -54 : -84;
      const rig = { pivotWU: axis === 'z' ? [-20, 0, root] : [root, 0, -48], runtimeAxis: axis,
        retainedDeltaWU: 0, retainedScale: role === 'breaker' ? 2.5 : 10 };
      const pose = ceresWorkfleetRigPose(rig, f);
      near(pose.position[axis] * 2, root, 'ram root fixed');
      near(4 * pose.scale[axis], 4 + delta * f, 'physical ram length');
    }
  }
});

for (const role of ['breaker', 'cradle']) test(`${role}: 101 restored native poses match queries before first step`, async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const e = hardware(role); e.rot = .317;
    owner.syncFromEntities([e]);
    const rec = owner.records.get(e.id), handles = rec.colliders.map(c => c.handle), mass = rec.body.mass(), inertia = rec.body.principalInertia().y;
    for (let i = 0; i <= 100; i++) {
      e.data.ceresWorkfleetSlide = i / 100;
      owner.syncFromEntities([e]);
      owner.world.propagateModifiedBodyPositionsToColliders();
      parity(owner, e, rec);
      assert.deepEqual(rec.colliders.map(c => c.handle), handles);
      near(rec.body.mass(), mass, 'unchanged mass'); near(rec.body.principalInertia().y, inertia, 'unchanged inertia', 1);
    }
  } finally { owner.dispose(); }
});

for (const role of ['breaker', 'cradle']) test(`${role}: native motor closes and reverses through bounded catch-up without handle churn`, async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const e = hardware(role); owner.syncFromEntityLayers(role === 'cradle' ? [e] : [], role === 'breaker' ? [e] : [], 1);
    const rec = owner.records.get(e.id), handles = rec.colliders.map(c => c.handle), mass = rec.body.mass();
    e.data.ceresWorkfleetSlideTarget = 1;
    let prior = 0;
    for (let i = 0; i < 15; i++) {
      owner.step(.25);
      assert.ok(ceresWorkfleetSlide(e) - prior <= .25 / CERES_WORKFLEET_SLIDE_SECONDS + 1e-10);
      prior = ceresWorkfleetSlide(e);
      owner.syncFromEntityLayers(role === 'cradle' ? [e] : [], role === 'breaker' ? [e] : [], 1);
    }
    assert.equal(ceresWorkfleetSlide(e), 1); assert.equal(e.data.ceresWorkfleetSlideBlocked, false);
    e.data.ceresWorkfleetSlideTarget = 0;
    for (let i = 0; i < 190; i++) owner.step(DT);
    assert.equal(ceresWorkfleetSlide(e), 0);
    assert.deepEqual(rec.colliders.map(c => c.handle), handles); near(rec.body.mass(), mass, 'mass after motor');
    parity(owner, e, rec);
  } finally { owner.dispose(); }
});

test('full linear sweep catches a newly admitted thin intermediate obstacle with clear endpoints', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 3 });
  try {
    const e = hardware('cradle'), obstacle = pin(-55, 0); e.data.ceresWorkfleetSlideTarget = 1;
    for (const f of [0, 1]) {
      e.data.ceresWorkfleetSlide = f;
      assert.equal(sweepCollisionProxyInto({}, e, resolveCollisionProxyManifest(e), obstacle.pos, obstacle.pos, obstacle.radius), false);
    }
    e.data.ceresWorkfleetSlide = 0; owner.syncFromEntities([e, obstacle]);
    for (let i = 0; i < 12; i++) owner.step(.25);
    assert.equal(ceresWorkfleetSlide(e), 0); assert.equal(e.data.ceresWorkfleetSlideBlocked, true);
    assert.equal(e.data.ceresWorkfleetSlideBlocker, obstacle.id);
    owner.syncFromEntities([e]);
    for (let i = 0; i < 12; i++) owner.step(.25);
    assert.equal(ceresWorkfleetSlide(e), 1);
  } finally { owner.dispose(); }
});

test('pads cannot close around live carrier or a misaligned section; authored touching endpoint is honest', async () => {
  for (const peerKind of ['carrier', 'misaligned-section', 'aligned-section']) {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      const e = hardware('cradle'), peer = peerKind === 'carrier' ? hardware('breaker', 0, 702) : pin(0, 0, 1, 702);
      if (peerKind === 'carrier') { peer.pos.z = -27; peer.rot = Math.PI / 2; }
      else {
        peer.pos.x = peerKind === 'misaligned-section' ? 1 : 0;
        peer.physicsBody.collisionProxyManifest = { schemaVersion: 1, id: 'section-proof', referenceRadius: 'radius',
          primitives: C.existing.section.boxes.map(b => ({ kind: 'obb', id: b.id, x: b.center.x, z: b.center.z, hx: b.size.x / 2, hz: b.size.z / 2 })) };
      }
      e.data.ceresWorkfleetSlideTarget = 1; owner.syncFromEntities([e, peer]);
      for (let i = 0; i < 190; i++) owner.step(DT);
      if (peerKind === 'aligned-section') assert.ok(ceresWorkfleetSlide(e) > .99, `aligned fraction ${ceresWorkfleetSlide(e)}`);
      else { assert.ok(ceresWorkfleetSlide(e) < 1); assert.equal(e.data.ceresWorkfleetSlideBlocked, true); }
      const a = owner.records.get(e.id), b = owner.records.get(peer.id);
      for (const pad of a.colliders) for (const collider of b.colliders) {
        const contact = pad.contactCollider(collider, 0);
        assert.ok(!contact || contact.distance >= -1e-5, `closure penetrates ${peerKind}: ${contact?.distance}`);
      }
      const from = ceresWorkfleetSlide(e); e.data.ceresWorkfleetSlideTarget = 0;
      for (let i = 0; i < 190; i++) owner.step(DT);
      assert.equal(ceresWorkfleetSlide(e), 0, `reverse from ${from}/${peerKind}`);
    } finally { owner.dispose(); }
  }
});

test('exact identity opt-in excludes unrelated bodies; real ghost filters do not block slides', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const e = hardware('breaker'); e.data.worldRecordId = 'ordinary-ship'; e.data.ceresWorkfleetSlideTarget = 1;
    owner.syncFromEntities([e]); for (let i = 0; i < 200; i++) owner.step(DT);
    assert.equal(ceresWorkfleetSlideRole(e), null); assert.equal(ceresWorkfleetSlide(e), 0); assert.equal(owner.ceresWorkfleetRecords.size, 0);
    const cradle = hardware('cradle', 0, 703), ghost = pin(-55, 0);
    ghost.physicsBody.material = 'projectile'; ghost.physicsBody.dynamic = true; ghost.type = 'projectile';
    cradle.data.ceresWorkfleetSlideTarget = 1; owner.syncFromEntities([cradle, ghost]);
    for (let i = 0; i < 190; i++) owner.step(DT);
    assert.equal(ceresWorkfleetSlide(cradle), 1);
  } finally { owner.dispose(); }
});

test('cold, dead, disabled, stale-life and removed rigs never advance; reused ID is registered once', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const e = hardware('breaker', .37); e.data.ceresWorkfleetSlideTarget = 1;
    owner.step(.25); assert.equal(ceresWorkfleetSlide(e), .37, 'cold');
    owner.syncFromEntities([e]); const rec = owner.records.get(e.id);
    for (const [set, unset] of [
      [() => { e.data.ceresWorkfleetSlideDisabled = true; }, () => { delete e.data.ceresWorkfleetSlideDisabled; }],
      [() => { e.alive = false; }, () => { e.alive = true; }],
      [() => { e.hull = 0; }, () => { e.hull = 1000; }],
      [() => { e.occupantGeneration++; }, () => { e.occupantGeneration--; }],
    ]) { set(); owner.step(.25); assert.equal(ceresWorkfleetSlide(e), .37); unset(); }
    owner.syncFromEntities([]); assert.equal(owner.ceresWorkfleetRecords.size, 0);
    owner.step(.25); assert.equal(ceresWorkfleetSlide(e), .37);
    const replacement = hardware('cradle', .62, e.id); owner.syncFromEntities([replacement]);
    assert.notEqual(owner.records.get(e.id), rec); assert.equal(owner.ceresWorkfleetRecords.size, 1);
    replacement.data.ceresWorkfleetSlideTarget = 0; owner.step(DT);
    near(ceresWorkfleetSlide(replacement), .62 - DT / CERES_WORKFLEET_SLIDE_SECONDS, 'one registered motor', 1e-10);
  } finally { owner.dispose(); assert.equal(owner.ceresWorkfleetRecords.size, 0); }
});

test('Continue/rebind, mass-only updates and attached native rebuild preserve accepted pose and one motor', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const restoredOwner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const e = hardware('breaker', .43), head = pin(-130, 0, 4); head.physicsBody.dynamic = true;
    owner.syncFromEntities([e, head]); let rec = owner.records.get(e.id); const handle = rec.body.handle;
    const restored = JSON.parse(JSON.stringify(e)); restoredOwner.syncFromEntities([restored]);
    parity(restoredOwner, restored, restoredOwner.records.get(restored.id));
    assert.equal(owner.rebindEntity(restored), true); owner.syncFromEntities([restored, head]);
    assert.equal(owner.records.get(e.id).body.handle, handle);
    restored.physicsBody.mass += 100; restored.mass += 100; restored.physicsBody.revision++;
    owner.syncFromEntities([restored, head]); assert.equal(owner.records.get(e.id).body.handle, handle);
    parity(owner, restored, rec); near(rec.body.mass(), 3300, 'mass-only authored update', .01);
    assert.ok(owner.createAttachment({ attachmentId: 'held', ownerId: restored.id, targetId: head.id,
      sourceWorld: { x: -90, z: 0 }, targetWorld: { x: -130, z: 0 }, restLength: 40 }));
    const line = owner.attachments.get('held');
    restored.physicsBody.radius += .1; restored.radius += .1; restored.physicsBody.revision++;
    owner.syncFromEntities([restored, head]); rec = owner.records.get(restored.id);
    assert.notEqual(rec.body.handle, handle); assert.equal(owner.attachments.get('held'), line);
    assert.equal(line.owner, rec); assert.equal(owner.ceresWorkfleetRecords.size, 1); parity(owner, restored, rec);
    restored.data.ceresWorkfleetSlideTarget = 1; owner.step(DT);
    near(ceresWorkfleetSlide(restored), .43 + DT / CERES_WORKFLEET_SLIDE_SECONDS, 'one motor after rebuild', 1e-10);
  } finally { owner.dispose(); restoredOwner.dispose(); }
});


test('berth/LOS/projectile caches use accepted fraction, never the requested target', () => {
  const e = hardware('cradle'), manifest = e.physicsBody.collisionProxyManifest;
  manifest.docking = { corridorBearingDeg: 0,
    corridor: { mouthRadius: 2, halfWidthDeg: 10, speedGate: 10, headingGateDeg: 30 },
    capture: { outerRadius: 2, halfWidth: .01, speedGate: 10 },
    berth: { radius: .001, dockRadius: 30, speedGate: 1 },
    assist: { kp: 1, kd: 1, maxAccel: 1 } };
  const a = { x: -60, z: 0 }, b = { x: 0, z: 0 };
  const capture = () => corridorStateFor(manifest, e, a, { x: 0, z: 0 }).inCapture;
  assert.equal(capture(), true);
  e.data.ceresWorkfleetSlideTarget = 1;
  assert.equal(capture(), true); assert.equal(segmentHitsProxy(e, a, b), false);
  e.data.ceresWorkfleetSlide = 1;
  assert.equal(capture(), false); assert.equal(segmentHitsProxy(e, a, b), true);
  assert.equal(sweepCollisionProxyInto({}, e, manifest, a, b), true);
  e.data.ceresWorkfleetSlideTarget = 0;
  assert.equal(capture(), false);
  e.data.ceresWorkfleetSlide = 0;
  assert.equal(capture(), true); assert.equal(segmentHitsProxy(e, a, b), false);
});

test('swept broad bound includes offset compounds with tiny gameplay radius', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 3 });
  try {
    const e = hardware('cradle'), obstacle = pin(100, 0, 1);
    obstacle.physicsBody.collisionProxyManifest = { schemaVersion: 1, id: 'offset-obstacle', referenceRadius: 'radius',
      primitives: [{ kind: 'obb', id: 'pin', x: -155, z: 0, hx: .005, hz: .005 }] };
    e.data.ceresWorkfleetSlideTarget = 1; owner.syncFromEntities([e, obstacle]);
    for (let i = 0; i < 12; i++) owner.step(.25);
    assert.equal(ceresWorkfleetSlide(e), 0); assert.equal(e.data.ceresWorkfleetSlideBlocked, true);
    assert.ok(owner.records.get(obstacle.id).collectorSweepRadius > 155);
  } finally { owner.dispose(); }
});

test('restored invalid fractions normalize safely and cold colliders start at accepted pose', async () => {
  for (const [value, expected] of [[-2, 0], [NaN, 0], [Infinity, 0], [2, 1], [.638, .638]]) {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      const e = hardware('cradle', value); e.data.ceresWorkfleetSlideTarget = 1 - expected;
      owner.syncFromEntities([e]); assert.equal(ceresWorkfleetSlide(e), expected);
      parity(owner, e, owner.records.get(e.id));
    } finally { owner.dispose(); }
  }
});
