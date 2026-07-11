import test from 'node:test';
import assert from 'node:assert/strict';
import { frameToGlobal, globalToFrame } from '../src/core/coordinates.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const ORIGIN = Object.freeze({ x: 12_000_000, z: -8_000_000 });
const POS_A = Object.freeze({ x: 12_000_120.5, z: -8_000_040.25 });
const POS_B = Object.freeze({ x: 12_000_180.5, z: -8_000_040.25 });
const NEXT_ORIGIN = Object.freeze({ x: 12_008_192, z: -8_004_096 });

function ship(id, pos, options = {}) {
  return {
    id, type: 'ship', alive: true, collides: true, radius: 4, mass: 12,
    pos: { ...pos }, prevPos: { ...pos },
    vel: { x: options.vx ?? 0, z: options.vz ?? 0 },
    rot: options.yaw ?? 0.35, angVel: options.wy ?? 0,
    maxSpeed: 200,
    flags: { boosting: false, docked: false, invuln: false, noInterp: !!options.noInterp },
    physicsBody: {
      schemaVersion: 1, mass: 12, inertiaY: 40, centerOfMass: { x: 0, y: 0, z: 0 },
      radius: 4, dynamic: true, ccd: true, material: 'ship', thrusters: [], revision: 0,
    },
  };
}

function record(owner, id) {
  const rec = owner.records.get(id);
  assert.ok(rec, `missing body ${id}`);
  return rec;
}

function localPosition(owner, id) {
  const p = record(owner, id).body.translation();
  return { x: p.x, z: p.z };
}

test('body creation is frame-local while writeback and snapshot remain global', async () => {
  const owner = await createSg02DynamicBodyOwner({ frameOrigin: ORIGIN, frameOriginSeq: 1, publishTelemetry: false });
  try {
    const entity = ship('alpha', POS_A);
    owner.syncFromEntities([entity]);
    const expected = globalToFrame(POS_A, ORIGIN);
    const local = localPosition(owner, 'alpha');
    assert.ok(Math.abs(local.x - expected.x) < 1e-6);
    assert.ok(Math.abs(local.z - expected.z) < 1e-6);
    owner.step(1 / 60);
    assert.ok(Math.abs(entity.pos.x - POS_A.x) < 1e-4);
    assert.ok(Math.abs(entity.pos.z - POS_A.z) < 1e-4);
    const snapshot = owner.quantizedSnapshot();
    assert.ok(Math.abs(snapshot[0].x - POS_A.x) < 1e-3);
    assert.ok(Math.abs(snapshot[0].z - POS_A.z) < 1e-3);
  } finally { owner.dispose(); }
});

test('origin rebase preserves global poses, handles, velocity, distance, and tether identity', async () => {
  const owner = await createSg02DynamicBodyOwner({ frameOrigin: ORIGIN, frameOriginSeq: 1, publishTelemetry: false });
  try {
    const a = ship('alpha', POS_A, { vx: 11, vz: -4, yaw: 0.8, wy: 0.2 });
    const b = ship('bravo', POS_B, { vx: -2, vz: 5, yaw: -0.4, wy: -0.05 });
    owner.syncFromEntities([a, b]);
    const recA = record(owner, 'alpha');
    const recB = record(owner, 'bravo');
    const handles = [recA.body.handle, recB.body.handle];
    const distance = Math.hypot(recB.body.translation().x - recA.body.translation().x, recB.body.translation().z - recA.body.translation().z);
    const snapshot = owner.quantizedSnapshot();
    const attachment = owner.createAttachment({
      attachmentId: 'tether-1', defId: 'tether_standard', ownerId: 'alpha', targetId: 'bravo',
      sourceWorld: a.pos, targetWorld: b.pos, restLength: distance,
    });
    assert.equal(attachment.attachmentId, 'tether-1');
    const restLength = owner.getAttachmentTelemetry({ attachmentId: 'tether-1' }).restLength;

    assert.equal(owner.setFrameOrigin(NEXT_ORIGIN, 2), true);
    assert.deepEqual(a.pos, POS_A);
    assert.deepEqual(b.pos, POS_B);
    assert.deepEqual([record(owner, 'alpha').body.handle, record(owner, 'bravo').body.handle], handles);
    const nextA = localPosition(owner, 'alpha');
    assert.deepEqual(frameToGlobal(nextA, NEXT_ORIGIN), POS_A);
    const nextDistance = Math.hypot(localPosition(owner, 'bravo').x - nextA.x, localPosition(owner, 'bravo').z - nextA.z);
    assert.ok(Math.abs(nextDistance - distance) < 1e-5);
    assert.equal(owner.getAttachmentTelemetry({ attachmentId: 'tether-1' }).restLength, restLength);
    assert.deepEqual(owner.quantizedSnapshot(), snapshot);
    assert.ok(Math.abs(recA.body.linvel().x - 11) < 1e-5);
    assert.ok(Math.abs(recA.body.angvel().y - 0.2) < 1e-5);
    assert.equal(owner.setFrameOrigin(NEXT_ORIGIN, 2), false);
  } finally { owner.dispose(); }
});

test('authoritative teleport resyncs an existing body before step without recreating it', async () => {
  const owner = await createSg02DynamicBodyOwner({ frameOrigin: ORIGIN, frameOriginSeq: 0, publishTelemetry: false });
  try {
    const entity = ship('alpha', POS_A, { vx: 9, vz: 1 });
    owner.syncFromEntities([entity]);
    const handle = record(owner, 'alpha').body.handle;
    const teleported = { x: POS_A.x + 2500, z: POS_A.z - 1800 };
    Object.assign(entity.pos, teleported);
    Object.assign(entity.prevPos, teleported);
    entity.vel.x = 0; entity.vel.z = 0; entity.flags.noInterp = true;
    owner.syncFromEntities([entity]);
    assert.equal(record(owner, 'alpha').body.handle, handle);
    assert.equal(entity.flags.noInterp, false);
    const local = localPosition(owner, 'alpha');
    const expected = globalToFrame(teleported, ORIGIN);
    assert.ok(Math.abs(local.x - expected.x) < 1e-6);
    assert.ok(Math.abs(local.z - expected.z) < 1e-6);
    owner.step(1 / 60);
    assert.ok(Math.abs(entity.pos.x - teleported.x) < 1e-3);
    assert.ok(Math.abs(entity.pos.z - teleported.z) < 1e-3);
  } finally { owner.dispose(); }
});

test('non-finite origins normalize to zero without moving global entity state', async () => {
  const owner = await createSg02DynamicBodyOwner({ frameOrigin: { x: NaN, z: Infinity }, frameOriginSeq: -1, publishTelemetry: false });
  try {
    const entity = ship('alpha', { x: 100, z: -50 });
    owner.syncFromEntities([entity]);
    assert.deepEqual(localPosition(owner, 'alpha'), { x: 100, z: -50 });
    assert.equal(owner.setFrameOrigin({ x: Infinity, z: NaN }, 1), true);
    assert.deepEqual(entity.pos, { x: 100, z: -50 });
  } finally { owner.dispose(); }
});
