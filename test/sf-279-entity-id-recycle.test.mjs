// SF-279 — destruction must clear or invalidate attachments before an entity id can be reused.
// Scope: entity ids recycle through state.freeIds while entity:destroyed receipts sit in the
// deferred bus queue. Without an occupant proof, a numeric id that flushes against a recycled
// id either severs the replacement's lines or — worse, when the receipt is correctly guarded —
// leaves the dead body's line welded to the heir. These tests exercise the real kernel, bus
// deferral, allocator, attachment service, action pipeline, persistence round-trip, tether
// mirror, and selection sweep through that exact window:
//   A ↔ B attach → destroy B → recycle B's id to C → flush the queued receipt after C exists.
// The dead body's lines break; the replacement keeps its own; delayed effects refuse to re-aim.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  allocateEntityId,
  stampOccupantGeneration,
  occupantGenerationOf,
  worldLedgerHoldsId,
} from '../src/core/entity.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { attachmentBindsOccupant } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import {
  applyWorldObjectSelection,
  createWorldObjectInteraction,
} from '../src/ui/worldObjectInteraction.js';

function makePhysics() {
  return {
    creates: [],
    cuts: [],
    createAttachment(spec) {
      this.creates.push({ ...spec });
      return { id: `joint-${this.creates.length}` };
    },
    cutAttachment(spec) {
      this.cuts.push({ ...spec });
      return true;
    },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0 }; },
    setAttachmentReel() { return true; },
    applyImpulse() { return true; },
  };
}

function makeHarness() {
  const bus = createBus();
  const entities = new Map();
  const state = {
    schemaVersion: 1,
    tick: 1,
    simTime: 1 / 60,
    mode: 'flight',
    entities,
    entityList: [],
    freeIds: [],
    nextEntityId: 1,
    nextOccupantGeneration: 1,
    playerId: null,
    player: {},
    ui: {},
    input: { actions: {} },
    world: {},
    runtime: { features: {} },
    combat: undefined,
  };
  const physics = makePhysics();
  const helpers = { combatPhysics: physics };
  const kernel = createCombatKernel(
    { state, bus, helpers, registry: { get: () => null } },
    { catalog: createCombatCatalog() },
  );
  return { state, bus, entities, physics, helpers, kernel };
}

function spawn(h, spec = {}) {
  const id = allocateEntityId(h.state);
  const entity = {
    id,
    type: spec.type || 'ship',
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: spec.radius || 10,
    mass: spec.mass || 40,
    cap: spec.cap == null ? 500 : spec.cap,
    team: spec.team == null ? 0 : spec.team,
    flags: spec.flags || {},
    data: spec.data || {},
  };
  stampOccupantGeneration(h.state, entity);
  h.entities.set(id, entity);
  h.state.entityList.push(entity);
  if (h.bus) h.bus.queue('entity:spawned', { id, entity });
  return entity;
}

// Mirror of coreSystem._removeEntityAtIndex: mark dead, unmap, free the id, queue the receipt —
// the receipt keeps the corpse object because subscribers must compare occupant, not number.
function destroy(h, entity) {
  entity.alive = false;
  h.entities.delete(entity.id);
  const i = h.state.entityList.indexOf(entity);
  if (i >= 0) h.state.entityList.splice(i, 1);
  if (!worldLedgerHoldsId(h.state.world, entity.id)) h.state.freeIds.push(entity.id);
  h.bus.queue('entity:destroyed', {
    id: entity.id,
    type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
    radius: entity.radius,
    entity,
  });
}

function attach(h, owner, target, defId = 'attachment_massline') {
  const created = h.kernel.attachments.create({ defId, ownerId: owner.id, targetId: target.id });
  assert.equal(created.ok, true, `attach ${owner.id}->${target.id}: ${created.reason}`);
  return created.attachment;
}



test('SF-279 a stale destruction receipt breaks the dead occupant\'s line, not the replacement\'s', () => {
  const h = makeHarness();
  const a = spawn(h, { x: 0, z: 0 });
  const b = spawn(h, { x: 50, z: 0 });
  h.state.playerId = a.id;
  const lineAB = attach(h, a, b);
  assert.equal(lineAB.targetGeneration, occupantGenerationOf(b), 'the line binds B the body, not id 2');
  h.bus.flush(); // spawn receipts

  destroy(h, b);
  // B's id recycles before the queued receipt flushes — this is the SF-279 window.
  const c = spawn(h, { x: 90, z: 0 });
  assert.equal(c.id, b.id, 'the allocator must hand B\'s id to C for this fixture to prove anything');
  assert.notEqual(occupantGenerationOf(c), occupantGenerationOf(b));
  const lineCA = attach(h, c, a); // C legitimately holds a line on the recycled id
  h.bus.flush(); // destroyed(B) flushes while the map resolves its id to C

  assert.equal(lineAB.state, 'broken', 'the dead occupant\'s line must still break');
  assert.equal(lineAB.breakReason, 'entity_destroyed');
  assert.equal(lineCA.state, 'active', 'the replacement\'s own line is not collateral');
  assert.ok(
    h.physics.cuts.some((cut) => cut.attachmentId === lineAB.id)
      && !h.physics.cuts.some((cut) => cut.attachmentId === lineCA.id),
    'only the dead occupant\'s physics joint is cut',
  );
  // The replacement owns the id's combat runtime now — the receipt was never B's to wipe it.
  assert.ok(h.state.combat.entities[String(c.id)], 'C keeps the combat runtime bound to its id');
});

test('SF-279 the orphan sweep reads the occupant, not the id — a stale endpoint breaks even without a receipt', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  const line = attach(h, a, b);
  // A path that drops the receipt (far-shelving, load boundaries) still owes the line a break:
  // swap the id's occupant directly, then sweep.
  h.entities.delete(b.id);
  b.alive = false;
  const c = { ...b, alive: true };
  stampOccupantGeneration(h.state, c); // different occupant token on the same id
  h.entities.set(b.id, c);
  assert.equal(h.kernel.attachments.breakOrphans(), 1);
  assert.equal(line.state, 'broken');
  assert.equal(line.breakReason, 'target_lost');
});

test('SF-279 a deferred attach request refuses to re-aim at the recycled occupant', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  h.state.playerId = a.id;
  h.bus.flush();
  const rejected = [];
  h.bus.on('combat:actionRejected', (p) => rejected.push(p));

  const queued = h.kernel.actions.requestAction({
    actorId: a.id,
    actionId: 'action_attach',
    targetId: b.id,
    notBeforeTick: h.state.tick + 5,
    source: 'player',
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.request.target.entityGeneration, occupantGenerationOf(b));

  destroy(h, b);
  const c = spawn(h, { x: 60 });
  assert.equal(c.id, b.id);
  h.state.tick += 5;
  h.bus.flush();
  h.kernel.actions.advance();

  assert.equal(h.state.combat.actions.requests.length, 0, 'the stale request is consumed, not parked');
  assert.deepEqual(rejected.map((r) => r.reason), ['target_missing']);
  assert.equal(Object.keys(h.state.combat.attachments.byId).length, 0, 'no line may weld onto C');
});

test('SF-279 a committed attach effect refuses the recycled target on its active tick', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  h.bus.flush();
  h.kernel.actions.requestAction({
    actorId: a.id,
    actionId: 'action_attach',
    targetId: b.id,
    notBeforeTick: h.state.tick,
    source: 'player',
  });
  h.kernel.actions.advance(); // startup phase begins — target was B and legal at commit
  const instance = h.state.combat.actions.activeByActor[String(a.id)];
  assert.ok(instance, 'the attach instance committed while B was the occupant');

  destroy(h, b);
  const c = spawn(h, { x: 60 });
  h.state.tick += 1;
  h.bus.flush();
  h.kernel.actions.advance(); // activeStart: createAttachment would bind C without the gen proof

  assert.equal(Object.keys(h.state.combat.attachments.byId).length, 0,
    'the weld must not land on the replacement');
  assert.ok(
    !h.physics.creates.some((call) => call.targetId === c.id),
    'physics never sees a joint addressed to C',
  );
});

test('SF-279 save/restore re-pins endpoints to the spawned bodies and still catches a later recycle', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60, flags: { persistent: true } });
  h.state.playerId = a.id;
  const line = attach(h, a, b);
  const payload = serializeCombatState(h.state);

  const saved = payload.attachments.byId[line.id];
  assert.ok(saved, 'the active line serializes');
  for (const key of Object.keys(saved)) {
    assert.ok(!/Generation$/.test(key), `${key} is a runtime occupant proof — it must not save`);
  }
  assert.equal(saved.ownerId, undefined);
  assert.equal(saved.targetId, undefined);

  // Continue: B's persistent saveId remaps onto a different numeric id in the new run.
  const bus2 = createBus();
  const restored = {
    tick: 7, simTime: 0.12, entities: new Map(), entityList: [], freeIds: [],
    nextEntityId: 20, nextOccupantGeneration: 1, playerId: 20, world: {},
    runtime: { features: {} }, mode: 'flight', input: { actions: {} }, ui: {}, player: {},
  };
  const a2 = { id: 20, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 40, cap: 500, team: 0, flags: {}, data: {} };
  const b2 = { id: 30, type: 'ship', alive: true, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 40, cap: 500, team: 0, flags: { persistent: true }, data: {} };
  stampOccupantGeneration(restored, a2);
  stampOccupantGeneration(restored, b2);
  restored.entities.set(20, a2);
  restored.entities.set(30, b2);
  restored.entityList.push(a2, b2);
  const physics2 = makePhysics();
  const kernel2 = createCombatKernel(
    { state: restored, bus: bus2, helpers: { combatPhysics: physics2 }, registry: { get: () => null } },
    { catalog: createCombatCatalog() },
  );
  const summary = restoreCombatState(restored, payload, (ref) => {
    if (ref && ref.kind === 'player') return 20;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(b.id)) return 30;
    return null;
  });
  assert.equal(summary.restoredAttachments, 1);
  const restoredLine = restored.combat.attachments.byId[line.id];
  assert.equal(restoredLine.targetId, 30, 'the endpoint remapped to this run\'s id');
  assert.equal(restoredLine.targetGeneration, occupantGenerationOf(b2),
    'the restored record re-pins to the body that spawned this run');

  // Post-restore the same recycle law holds: the restored record is not a legacy id-only line.
  restored.entities.delete(30);
  b2.alive = false;
  const b3 = { ...b2, alive: true };
  stampOccupantGeneration(restored, b3);
  restored.entities.set(30, b3);
  assert.equal(kernel2.attachments.breakOrphans(), 1);
  assert.equal(restoredLine.state, 'broken');
  assert.equal(restoredLine.breakReason, 'target_lost');
});

test('SF-279 the tether mirror never adopts or holds a line bound to the dead occupant', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  h.state.playerId = a.id;
  const sys = Object.create(tetherGameplay);
  sys.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: (name) => (name === 'combat' ? { kernel: h.kernel } : null) },
  });
  const line = attach(h, a, b);

  // Recycle the id silently (no receipt yet): adoption must not claim the stale record.
  destroy(h, b);
  const c = spawn(h, { x: 60 });
  assert.equal(c.id, b.id);
  sys._adoptExisting(h.kernel.attachments, h.state);
  assert.equal(sys._active, null, 'a line bound to the dead occupant is never adopted as live');

  // A legitimate player-owned line on the replacement still adopts normally: same numeric id,
  // different occupant token — the recorded generation is what proves which body is bound.
  const legit = attach(h, a, c, 'tether_standard');
  sys._adoptExisting(h.kernel.attachments, h.state);
  assert.ok(sys._active, 'the replacement\'s own line is adoptable');
  assert.equal(sys._active.attachmentId, legit.id);
  h.bus.flush();
});

test('SF-279 a live tether line cut-paths off the recycled occupant on the next tick', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  h.state.playerId = a.id;
  const sys = Object.create(tetherGameplay);
  sys.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: (name) => (name === 'combat' ? { kernel: h.kernel } : null) },
  });
  const line = attach(h, a, b);
  sys._active = { attachmentId: line.id, targetId: b.id, type: line.defId };

  // The id moves to C before the destruction receipt flushes: the very next tether tick must
  // read the occupant token and run the target_lost cut, never reel or mirror the heir.
  destroy(h, b);
  const c = spawn(h, { x: 60 });
  const broke = [];
  h.bus.on('tether:broke', (p) => broke.push(p));
  sys.update(1 / 60, h.state);
  assert.equal(sys._active, null, 'the mirror drops the dead occupant\'s line');
  assert.equal(line.state, 'broken');
  assert.equal(line.breakReason, 'target_lost');
  assert.deepEqual(broke.map((p) => p.targetId), [b.id]);
  h.bus.flush();
});

test('SF-279 a deliberate selection clears when the picked id recycles', () => {
  const h = makeHarness();
  const b = spawn(h, { x: 60 });
  applyWorldObjectSelection(h.state, b, 'pointer');
  assert.equal(h.state.player.targetId, b.id);
  assert.equal(h.state.ui.objectSelection.occupantGeneration, occupantGenerationOf(b));

  const woi = createWorldObjectInteraction(
    { state: h.state, bus: h.bus, registry: { get: () => null } },
    { isOpen: () => false, isLiveOverlay: () => false },
  );
  destroy(h, b);
  const c = spawn(h, { x: 60 });
  assert.equal(c.id, b.id);
  woi.tick(1 / 60);
  assert.equal(h.state.ui.objectSelection, null, 'the pick named the dead body — the heir does not inherit it');
  assert.equal(h.state.player.targetId, null);
  woi.destroy();
});

test('SF-279 attachmentBindsOccupant is the honest split between corpse lines and heir lines', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  const line = attach(h, a, b);
  assert.equal(attachmentBindsOccupant(line, b.id, occupantGenerationOf(b)), true);
  assert.equal(attachmentBindsOccupant(line, b.id, 999), false, 'another generation never claims the binding');
  assert.equal(attachmentBindsOccupant(line, b.id, null), false, 'unprovable never claims the binding');
  assert.equal(attachmentBindsOccupant(line, a.id, occupantGenerationOf(b)), false);
  assert.equal(attachmentBindsOccupant(null, b.id, occupantGenerationOf(b)), false);
});

test('SF-279 the ordinary (unrecycled) destruction receipt still strips the combatant', () => {
  const h = makeHarness();
  const a = spawn(h);
  const b = spawn(h, { x: 60 });
  h.bus.flush();
  const line = attach(h, a, b);
  destroy(h, b);
  h.bus.flush();
  assert.equal(line.state, 'broken');
  assert.equal(line.breakReason, 'entity_destroyed');
  assert.equal(h.state.combat.entities[String(b.id)] || null, null,
    'with no replacement occupant the runtime row is removed as before');
});
