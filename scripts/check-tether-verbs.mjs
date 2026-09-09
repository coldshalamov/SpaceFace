import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

const ROOT = new URL('../', import.meta.url);
const checks = [];

check('SPEC3-17 attach/reel/cut lifecycle works through the attachment service', () => {
  const harness = createHarness();
  const service = createAttachmentService(harness);

  const created = service.create({
    defId: 'tether_standard',
    ownerId: 1,
    targetId: 2,
    sourceWorld: { x: 0, y: 0, z: 0 },
    targetWorld: { x: 125, y: 0, z: 0 },
  });
  assert.equal(created.ok, true, `create should succeed: ${created.reason || 'unknown'}`);
  assert.equal(created.attachment.state, 'active', 'created tether should be active');
  assert.equal(harness.events.filter((event) => event.name === 'tether:attached').length, 1,
    'attach must emit tether:attached once');

  const before = created.attachment.restLength;
  const reeled = service.reel(created.attachment.id, -24, 18);
  assert.equal(reeled.ok, true, `reel should succeed: ${reeled.reason || 'unknown'}`);
  assert(reeled.attachment.restLength < before, 'reel-in should shorten rest length');
  assert.equal(harness.events.filter((event) => event.name === 'tether:reel').length, 1,
    'reel must emit tether:reel once');

  const cut = service.cut(created.attachment.id, 1, 'tether_cut');
  assert.equal(cut.ok, true, `cut should succeed: ${cut.reason || 'unknown'}`);
  assert.equal(cut.attachment.state, 'broken', 'cut should close the joint lifecycle');
  assert.equal(cut.attachment.breakReason, 'tether_cut', 'cut reason should be preserved');
  assert.equal(harness.events.filter((event) => event.name === 'tether:broken').length, 1,
    'current lower-level cut path emits tether:broken once');
});

check('socket attachments preserve exact local anchors for deterministic physics rebuilds', () => {
  const harness = createHarness();
  harness.state.entities.get(1).rot = 1.1;
  harness.state.entities.get(2).rot = -0.7;
  const service = createAttachmentService(harness);

  const created = service.create({
    defId: 'tether_standard',
    ownerId: 1,
    targetId: 2,
  });

  assert.equal(created.ok, true, `socket create should succeed: ${created.reason || 'unknown'}`);
  assert(created.attachment.sourceAnchorLocal, 'semantic attachment should retain its source socket local anchor');
  assert(created.attachment.targetAnchorLocal, 'semantic attachment should retain its target socket local anchor');
  const physicsSpec = harness.handles.get(created.attachment.id);
  assert.deepEqual(physicsSpec.sourceAnchorLocal, created.attachment.sourceAnchorLocal,
    'physics owner should receive the exact source local anchor instead of re-deriving it from world space');
  assert.deepEqual(physicsSpec.targetAnchorLocal, created.attachment.targetAnchorLocal,
    'physics owner should receive the exact target local anchor instead of re-deriving it from world space');
});

check('ownership transfer rebinds physics and the new owner socket anchor', () => {
  const harness = createHarness();
  const service = createAttachmentService(harness);
  const created = service.create({
    defId: 'tether_standard',
    ownerId: 1,
    targetId: 2,
  });

  assert.equal(created.ok, true, `socket create should succeed: ${created.reason || 'unknown'}`);
  assert(created.attachment.sourceSocketId, 'socket create should select a source socket');
  assert(created.attachment.sourceAnchorLocal, 'socket create should retain a source local anchor');
  const previousAnchor = { ...created.attachment.sourceAnchorLocal };

  const transferred = service.transfer(created.attachment.id, 1, 3);
  assert.equal(transferred.ok, true, `transfer should succeed: ${transferred.reason || 'unknown'}`);
  assert.equal(transferred.attachment.ownerId, 3, 'transfer should update semantic ownership');
  assert(transferred.attachment.sourceSocketId, 'transfer should select a socket on the new owner');
  assert(transferred.attachment.sourceAnchorLocal, 'transfer should retain the new owner socket local anchor');
  assert.notDeepEqual(transferred.attachment.sourceAnchorLocal, previousAnchor,
    'transfer must not apply the previous owner local anchor to the new owner');
  const reboundPhysics = harness.handles.get(created.attachment.id);
  assert.equal(reboundPhysics.ownerId, 3,
    'transfer must replace the live physics handle so it is owned by the new semantic owner');
  assert.deepEqual(reboundPhysics.sourceAnchorLocal, transferred.attachment.sourceAnchorLocal,
    'the rebound physics handle must consume the new owner exact local anchor');
  assert(created.attachment.targetAnchorLocal,
    'transfer should preserve the unchanged target endpoint local anchor');
});

check('failed ownership rebind restores the previous physical attachment', () => {
  const harness = createHarness({ rejectCreateOwnerId: 3 });
  const service = createAttachmentService(harness);
  const created = service.create({ defId: 'tether_standard', ownerId: 1, targetId: 2 });
  assert.equal(created.ok, true, `initial create should succeed: ${created.reason || 'unknown'}`);
  const previousAnchor = { ...created.attachment.sourceAnchorLocal };

  const transferred = service.transfer(created.attachment.id, 1, 3);
  assert.equal(transferred.ok, false, 'a rejected new-owner physics attachment should fail transfer');
  assert.equal(created.attachment.ownerId, 1, 'failed transfer should restore semantic ownership');
  assert.deepEqual(created.attachment.sourceAnchorLocal, previousAnchor,
    'failed transfer should restore the previous exact local anchor');
  assert.equal(harness.handles.get(created.attachment.id)?.ownerId, 1,
    'failed transfer should recreate the previous live physics attachment');
});

check('double transfer failure closes the attachment instead of leaving a zombie', () => {
  const harness = createHarness();
  const service = createAttachmentService(harness);
  const created = service.create({ defId: 'tether_standard', ownerId: 1, targetId: 2 });
  assert.equal(created.ok, true, `initial create should succeed: ${created.reason || 'unknown'}`);
  harness.rejectCreateOwnerIds.add(3);
  harness.rejectCreateOwnerIds.add(1);

  const transferred = service.transfer(created.attachment.id, 1, 3);
  assert.equal(transferred.ok, false, 'double physics rejection should fail transfer');
  assert.equal(created.attachment.ownerId, 1, 'double failure should restore semantic ownership');
  assert.equal(created.attachment.state, 'broken',
    'an attachment with no recoverable physics handle must close instead of consuming active limits');
  assert.equal(created.attachment.breakReason, 'physics_transfer_rollback_failed');
  assert.equal(harness.handles.has(created.attachment.id), false,
    'double failure should not retain a stale physics handle');
});

check('physics reconciliation rejects malformed restored local anchors', () => {
  const harness = createHarness();
  const service = createAttachmentService(harness);
  const created = service.create({ defId: 'tether_standard', ownerId: 1, targetId: 2 });
  assert.equal(created.ok, true, `initial create should succeed: ${created.reason || 'unknown'}`);
  created.attachment.sourceAnchorLocal = { x: Number.NaN, z: 999 };
  harness.handles.delete(created.attachment.id);

  const reconciled = service.reconcilePhysics();
  assert.equal(reconciled.recreated, 1, 'missing physics should rebuild from the authored source socket');
  const sourceAnchor = harness.handles.get(created.attachment.id)?.sourceAnchorLocal;
  assert(sourceAnchor && Number.isFinite(sourceAnchor.x) && Number.isFinite(sourceAnchor.z),
    'malformed persisted anchors must fall back to a finite authored socket anchor');
  assert.deepEqual(created.attachment.sourceAnchorLocal, sourceAnchor,
    'the repaired semantic anchor should match the exact anchor consumed by physics');
});

check('SPEC3-17 cut event exposes velocity and slingshot boolean', () => {
  const tetherSrc = readFileSync(new URL('src/systems/tetherGameplay.js', ROOT), 'utf8');
  const attachmentSrc = readFileSync(new URL('src/combat/attachments.js', ROOT), 'utf8');
  const joined = `${tetherSrc}\n${attachmentSrc}`;
  assert.match(joined, /tether:cut/,
    'SPEC3 cut surface must emit tether:cut { speed|velocity, slingshot } instead of only released/broken');
  assert.match(joined, /slingshot/,
    'SPEC3 cut payload must include a slingshot boolean');
});

check('SPEC3-17 slingshot state is granted after high-speed tangent cut', () => {
  const tetherSrc = readFileSync(new URL('src/systems/tetherGameplay.js', ROOT), 'utf8');
  assert.match(tetherSrc, /slingT|slingshotT|slingshotTimer/,
    'tether gameplay must grant a 1.0s slingshot state on qualifying cuts');
  assert.match(tetherSrc, /1\.4/,
    'slingshot state threshold must be at least 1.4x max thrust speed');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} tether verb checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} tether verb checks passed.`);

function createHarness(options = {}) {
  const events = [];
  const handles = new Map();
  const rejectCreateOwnerIds = new Set(
    options.rejectCreateOwnerId == null ? [] : [options.rejectCreateOwnerId],
  );
  const state = {
    tick: 0,
    entities: new Map([
      [1, makeEntity({ id: 1, type: 'ship', x: 0, z: 0, radius: 12, mass: 16 })],
      [2, makeEntity({ id: 2, type: 'asteroid', x: 125, z: 0, radius: 18, mass: 640 })],
      [3, makeEntity({ id: 3, type: 'ship', x: -40, z: 25, radius: 11, mass: 18 })],
    ]),
  };
  ensureCombatState(state);
  return {
    state,
    catalog: createCombatCatalog(),
    helpers: {
      combatPhysics: {
        createAttachment(spec) {
          if (rejectCreateOwnerIds.has(spec.ownerId)) return false;
          handles.set(spec.attachmentId, { ...spec });
          return { id: spec.attachmentId };
        },
        setAttachmentReel(spec) {
          const handle = handles.get(spec.attachmentId);
          if (handle) handle.restLength = spec.restLength;
          return { restLength: spec.restLength };
        },
        cutAttachment(spec) {
          handles.delete(spec.attachmentId);
          return true;
        },
        getAttachmentTelemetry(spec) {
          const handle = handles.get(spec.attachmentId);
          if (!handle) return null;
          return {
            restLength: handle.restLength,
            distance: handle.restLength,
            stretch: 0,
            relativeSpeed: 0,
            tension: 0,
            impulse: 0,
            phase: 'loaded',
          };
        },
      },
    },
    bus: {
      emit(name, payload) { events.push({ name, payload }); },
    },
    events,
    handles,
    rejectCreateOwnerIds,
  };
}

function makeEntity({ id, type, x, z, radius, mass }) {
  return {
    id,
    type,
    alive: true,
    pos: { x, z },
    rot: 0,
    radius,
    mass,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    armorHp: 0,
    armorMax: 0,
    data: {},
  };
}

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
  }
}
