import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

const REMOTE_DEF = Object.freeze({
  id: 'attachment_remote_test',
  version: 1,
  sourceSocketTags: ['tether'],
  targetSocketTags: ['tether'],
  ownership: { policy: 'initiator', transferable: false },
  break: { maxTension: 500, maxImpulse: 250, graceTicks: 1 },
  spring: { K: 120, zeta: 0.8, captureS: 0.25 },
  limits: { maxPerOwner: 1 },
  cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
});

test('controller-owned rebind keeps one attachment id and never makes the player a body endpoint', () => {
  const h = harness();
  const original = h.service.create({
    defId: REMOTE_DEF.id,
    ownerId: h.player.id,
    targetId: h.a.id,
  });
  assert.equal(original.ok, true);

  const rebound = h.service.rebind(original.attachment.id, h.player.id, {
    ownerId: h.a.id,
    targetId: h.b.id,
    controllerId: h.player.id,
    controlMode: 'twin_bridle',
  });

  assert.equal(rebound.ok, true);
  assert.equal(rebound.attachment.id, original.attachment.id, 'transaction must not create a second logical line');
  assert.deepEqual(
    [rebound.attachment.ownerId, rebound.attachment.targetId],
    [h.a.id, h.b.id],
    'the player is controller, never a hidden third body endpoint',
  );
  assert.equal(rebound.attachment.controllerId, h.player.id);
  assert.equal(rebound.attachment.controlMode, 'twin_bridle');
  assert.equal(h.physics.cuts.length, 1);
  assert.equal(h.physics.creates.length, 2);
  assert.deepEqual(h.service.listControlledBy(h.player.id).map((entry) => entry.id), [original.attachment.id]);

  assert.equal(h.service.cut(original.attachment.id, 999, 'unauthorized').reason, 'not_attachment_owner');
  assert.equal(h.service.get(original.attachment.id).state, 'active');
  assert.equal(h.service.cut(original.attachment.id, h.player.id, 'pilot_cut').ok, true);
  assert.equal(h.service.get(original.attachment.id).state, 'broken');
});

test('a rejected endpoint commit recreates the exact prior joint instead of leaving partial state', () => {
  const h = harness({ createResults: [{ id: 'joint-original' }, false, { id: 'joint-rollback' }] });
  const original = h.service.create({
    defId: REMOTE_DEF.id,
    ownerId: h.player.id,
    targetId: h.a.id,
  });
  const before = {
    ownerId: original.attachment.ownerId,
    targetId: original.attachment.targetId,
    controllerId: original.attachment.controllerId,
    controlMode: original.attachment.controlMode,
    restLength: original.attachment.restLength,
  };

  const result = h.service.rebind(original.attachment.id, h.player.id, {
    ownerId: h.a.id,
    targetId: h.b.id,
    controllerId: h.player.id,
    controlMode: 'twin_bridle',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'physics_rebind_rejected');
  assert.deepEqual({
    ownerId: original.attachment.ownerId,
    targetId: original.attachment.targetId,
    controllerId: original.attachment.controllerId,
    controlMode: original.attachment.controlMode,
    restLength: original.attachment.restLength,
  }, before);
  assert.equal(original.attachment.state, 'active');
  assert.deepEqual(original.attachment.physicsHandle, { id: 'joint-rollback' });
  assert.equal(h.physics.cuts.length, 1);
  assert.equal(h.physics.creates.length, 3);
});

test('controller loss breaks a remote line through attachment authority', () => {
  const h = harness();
  const created = h.service.create({
    defId: REMOTE_DEF.id,
    ownerId: h.a.id,
    targetId: h.b.id,
    controllerId: h.player.id,
    controlMode: 'twin_bridle',
  });
  assert.equal(created.ok, true);

  h.player.alive = false;
  assert.equal(h.service.breakOrphans(), 1);
  assert.equal(created.attachment.state, 'broken');
  assert.equal(created.attachment.breakReason, 'controller_lost');
});

test('save/Continue remaps a remote controller separately from both physical endpoints', () => {
  const h = harness();
  h.a.flags = { persistent: true };
  h.b.flags = { persistent: true };
  const created = h.service.create({
    defId: REMOTE_DEF.id,
    ownerId: h.a.id,
    targetId: h.b.id,
    controllerId: h.player.id,
    controlMode: 'twin_bridle',
  });
  assert.equal(created.ok, true);

  const payload = serializeCombatState(h.state);
  const saved = payload.attachments.byId[created.attachment.id];
  assert.deepEqual(saved.controllerRef, { kind: 'player' });
  assert.deepEqual(saved.ownerRef, { kind: 'persistent', saveId: String(h.a.id) });
  assert.deepEqual(saved.targetRef, { kind: 'persistent', saveId: String(h.b.id) });
  assert.equal(saved.controllerId, undefined, 'runtime numeric ids must not leak into a save');

  const restored = { playerId: 10 };
  ensureCombatState(restored);
  const summary = restoreCombatState(restored, payload, (ref) => {
    if (ref?.kind === 'player') return 10;
    if (ref?.kind === 'persistent' && ref.saveId === String(h.a.id)) return 20;
    if (ref?.kind === 'persistent' && ref.saveId === String(h.b.id)) return 30;
    return null;
  });
  const line = restored.combat.attachments.byId[created.attachment.id];
  assert.equal(summary.restoredAttachments, 1);
  assert.deepEqual([line.ownerId, line.targetId, line.controllerId], [20, 30, 10]);
  assert.equal(line.controlMode, 'twin_bridle');
  assert.equal(line.physicsHandle, null);
});

function harness(options = {}) {
  const player = entity(1, 'ship', 0, 0);
  const a = entity(2, 'asteroid', 80, 0);
  const b = entity(3, 'asteroid', 140, 30);
  const entities = new Map([[player.id, player], [a.id, a], [b.id, b]]);
  const state = {
    tick: 12,
    simTime: 0.2,
    playerId: player.id,
    entities,
    entityList: [...entities.values()],
    runtime: { features: { massline2: { enabled: true } } },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog({ attachments: [REMOTE_DEF] });
  const createResults = [...(options.createResults || [])];
  const physics = {
    creates: [],
    cuts: [],
    createAttachment(spec) {
      this.creates.push({ ...spec });
      return createResults.length ? createResults.shift() : { id: `joint-${this.creates.length}` };
    },
    cutAttachment(spec) {
      this.cuts.push({ ...spec });
      return true;
    },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0 }; },
    setAttachmentReel() { return true; },
  };
  const events = [];
  const bus = { emit(type, payload) { events.push({ type, payload }); } };
  const service = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  return { state, player, a, b, physics, events, service };
}

function entity(id, type, x, z) {
  return {
    id,
    type,
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: type === 'ship' ? 8 : 12,
    mass: type === 'ship' ? 40 : 240,
    data: {},
  };
}
