import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { economy } from '../src/systems/economy.js';
import * as THREE from 'three';
import { routeDigit, planSlotClaim } from '../src/ui/promptDeck.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { PART_LIST, partBodySpec } from '../src/features/rigWorkshop/parts.js';
import { createRigPhysicsAdapter } from '../src/features/rigWorkshop/physics.js';
import { createRigWorkshopSystem, freshRigWorkshop } from '../src/features/rigWorkshop/runtime.js';
import { createWorkshopJobs } from '../src/features/rigWorkshop/jobs.js';
import { createRigWorkshopRender, buildRigWorkshopBody } from '../src/features/rigWorkshop/render.js';
import { captureRigWorkshop, restoreRigWorkshop } from '../src/features/rigWorkshop/persistence.js';
import { rigWorkshopSavePlanEntry, captureRigWorkshopSaveSlot, restoreRigWorkshopSaveSlot } from '../src/features/rigWorkshop/integration.js';
import { createRigWorkshopView } from '../src/features/rigWorkshop/view.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics as productionPhysics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import {
  createRigWorkshopPresentation, rigWorkshopDecision, buildRigWorkshopReadModel,
} from '../src/features/rigWorkshop/presentation.js';

const DT = 1 / 60;
const clone = (value) => JSON.parse(JSON.stringify(value));

async function nativeFixture() {
  const native = await createSg02DynamicBodyOwner();
  const helpers = { combatPhysics: createSg02CombatPhysicsPort(native) };
  const sim = createSimulation({ seed: 8202, systems: [economy], helpers, updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 1000;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 1000, hullMax: 1000, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100,
      inertiaY: 3000, ccd: true, revision: 0, useMeasuredSkin: false }, data: {} });
  state.playerId = player.id;
  const w = state.rigWorkshop = { version: 1, ownerId: 'pilot:8202',
    bench: { pos: { x: 0, z: 0 }, sectorId: state.world.currentSectorId }, rigs: [], stock: 8, jobs: {}, receipts: [] };
  const physics = createRigPhysicsAdapter(sim.registry.ctx);
  const events = [];
  bus.on('economy:grantCredits', (payload) => events.push(payload));
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      sim.step(DT);
      native.syncFromEntities(state.entityList);
      physics.update(DT, state.rigWorkshop);
      physics.kernel.prePhysics(DT);
      native.step(DT);
      physics.kernel.postPhysics();
    }
  };
  return { native, sim, state, bus, get w() { return state.rigWorkshop; }, player, physics, events, step,
    close() { physics.dispose(); native.dispose(); sim.dispose(); } };
}

// Fixture setup moves the unloaded rig to a pickup position. Every metre of
// cargo travel after capture is solved by the actual native owner below; no
// cargo pose, travelled-distance ledger, or reward is forged by the test.
function stageUnloadedRig(h, rig, holder, cargo, offset = { x: -5, z: 0 }) {
  const delta = { x: cargo.pos.x + offset.x - holder.pos.x, z: cargo.pos.z + offset.z - holder.pos.z };
  for (const id of rig.partIds) {
    const body = h.state.entities.get(id);
    body.pos.x += delta.x; body.pos.z += delta.z;
    body.vel.x = 0; body.vel.z = 0; body.angVel = 0;
  }
  h.player.pos.x = cargo.pos.x - 110; h.player.pos.z = cargo.pos.z + 95;
  h.native.syncFromEntities(h.state.entityList);
}

function driveNativeRig(h, jobs, rig, destination, ticks = 4200) {
  const root = h.state.entities.get(rig.partIds[0]);
  const totalMass = rig.partIds.concat(rig.cargoIds).reduce((sum, id) => sum + h.state.entities.get(id).mass, 0);
  for (let i = 0; i < ticks; i++) {
    const dx = destination.x - root.pos.x, dz = destination.z - root.pos.z;
    const d = Math.hypot(dx, dz);
    const v = Math.min(22, d * 0.45);
    const desiredX = d > 0.01 ? dx / d * v : 0, desiredZ = d > 0.01 ? dz / d * v : 0;
    const jx = Math.max(-totalMass * 0.12, Math.min(totalMass * 0.12, (desiredX - root.vel.x) * totalMass * 0.025));
    const jz = Math.max(-totalMass * 0.12, Math.min(totalMass * 0.12, (desiredZ - root.vel.z) * totalMass * 0.025));
    queuePhysicsImpulse(root, { x: jx, z: jz });
    // Scripted helm applies bounded physical counter-torque to the frame. It
    // cannot freeze a cargo body or erase angular momentum through a pose write.
    queuePhysicsTorqueImpulse(root, { y: Math.max(-500, Math.min(500, -root.angVel * totalMass * 16)) });
    h.step();
    jobs.update(h.w);
    const loadSettled = rig.cargoIds.every((id) => {
      const body = h.state.entities.get(id);
      return Math.hypot(body.vel.x, body.vel.z) < 2 && Math.abs(body.angVel || 0) < 0.3;
    });
    if (d < 10 && Math.hypot(root.vel.x, root.vel.z) < 1 && loadSettled) return i + 1;
  }
  return ticks;
}

test('workshop decisions use the existing prompt deck slots, disable invalid edits, and send one intent', () => {
  const bus = createBus();
  const state = { simTime: 4 };
  const entries = new Map();
  const deck = {
    offerDecision(spec) { entries.set(spec.id, { ...spec, seq: 1 }); return true; },
    resolveDecision(id) { entries.delete(id); },
    hasDecision(id) { return entries.has(id); },
  };
  const chosen = [];
  bus.on('rigWorkshop:choose', (intent) => chosen.push(intent));
  const presentation = createRigWorkshopPresentation({ state, bus, getDeck: () => deck });
  const payload = {
    id: 'confirm', revision: 7, title: 'Attach a guard', detail: 'The mount is occupied.',
    options: [
      { id: 'confirm', label: 'Fit guard', disabled: true },
      { id: 'cancel', label: 'Keep the original rig', cancel: true },
    ],
  };
  bus.emit('rigWorkshop:prompt', payload);
  const spec = entries.get('rig-workshop:confirm');
  assert.ok(spec);
  assert.deepEqual(routeDigit([...entries.values()], spec.id, 'Digit1'), {
    type: 'choose', id: spec.id, choiceId: 'cancel',
  });
  assert.deepEqual(planSlotClaim([...entries.values()], spec.id), {
    slots: [1], answers: ['Keep the original rig'],
  });
  spec.onChoose('confirm');
  assert.equal(chosen.length, 0, 'a disabled preview cannot spend through the view');
  spec.onChoose('cancel');
  spec.onChoose('cancel');
  assert.equal(chosen.length, 1, 'one physical press cannot double-commit');
  assert.equal(chosen[0].revision, 7);
  assert.equal(entries.size, 0);
  presentation.destroy();
});

test('presentation re-mount/cleanup cannot multiply decisions or receipts and preserves the next synchronous page', () => {
  const bus = createBus(), state = { simTime: 10 };
  const entries = new Map(), receipts = [], audio = [];
  const deck = {
    offerDecision(spec) { entries.set(spec.id, spec); return true; },
    resolveDecision(id) { entries.delete(id); },
    hasDecision(id) { return entries.has(id); },
  };
  bus.on('toast', (payload) => receipts.push(payload));
  bus.on('audio:cue', (payload) => audio.push(payload));
  const first = createRigWorkshopPresentation({ state, bus, getDeck: () => deck });
  const second = createRigWorkshopPresentation({ state, bus, getDeck: () => deck });
  bus.on('rigWorkshop:choose', () => bus.emit('rigWorkshop:prompt', {
    id: 'next', revision: 2, options: [{ id: 'leave', label: 'Leave' }],
  }));
  bus.emit('rigWorkshop:prompt', { id: 'first', revision: 1, options: [{ id: 'open', label: 'Open bench' }] });
  entries.get('rig-workshop:first').onChoose('open');
  assert.deepEqual([...entries.keys()], ['rig-workshop:next']);
  for (let i = 0; i < 3; i++) bus.emit('rigWorkshop:feedback', { id: 'receipt:1', text: 'Freight delivered.', kind: 'delivery' });
  assert.equal(receipts.length, 1);
  assert.equal(audio.length, 1);
  second.destroy(); first.destroy();
  assert.equal(entries.size, 0);
  bus.emit('rigWorkshop:prompt', { id: 'after', options: [{ id: 'x' }] });
  assert.equal(entries.size, 0);
});

test('presentation forgets old decision revisions across a normal New Game lifecycle', () => {
  const bus = createBus(), state = { simTime: 20 }, entries = new Map();
  const deck = { offerDecision(p) { entries.set(p.id, p); }, resolveDecision(id) { entries.delete(id); }, hasDecision(id) { return entries.has(id); } };
  const view = createRigWorkshopPresentation({ state, bus, getDeck: () => deck });
  bus.emit('rigWorkshop:prompt', { id: 'old', revision: 200, options: [{ id: 'leave', label: 'Leave' }] });
  assert.equal(entries.size, 1);
  bus.emit('game:newGame');
  assert.equal(entries.size, 0);
  bus.emit('rigWorkshop:prompt', { id: 'new', revision: 1, options: [{ id: 'visit', label: 'Visit' }] });
  assert.equal(entries.has('rig-workshop:new'), true, 'the previous run may not suppress the fresh bench');
  view.destroy();
});

test('headless read model is bounded and exposes damage, broken connections, and invalid preview without mutating the sim', () => {
  const part = { id: 2, alive: true, hull: 30, hullMax: 100, pos: { x: 4, z: 8 }, data: { rigWorkshop: { partType: 'bumper' } } };
  const state = {
    entities: new Map([[2, part]]),
    rigWorkshop: {
      activeRigId: 'rig:one', bench: { pos: { x: 0, z: 0 } },
      rigs: [{ id: 'rig:one', name: 'Bad Idea', ownerId: 1, partIds: [2], cargoIds: [8],
        connections: [{ id: 'edge', parentId: 1, childId: 2, state: 'broken', stress: 1.2 }] }],
      preview: { valid: false, reason: 'mount_occupied', partType: 'guard', pos: { x: 7, z: 8 }, warnings: ['Clear the mouth'], cost: 20 },
    },
  };
  const before = clone(state.rigWorkshop);
  const view = buildRigWorkshopReadModel(state);
  assert.equal(view.rigs[0].parts[0].damage, 0.7);
  assert.match(view.rigs[0].status, /separated|retrieve/i);
  assert.equal(view.preview.valid, false);
  assert.equal(view.preview.reason, 'mount_occupied');
  assert.deepEqual(state.rigWorkshop, before);
  assert.equal(rigWorkshopDecision({ id: 'facts', options: [] }), null);
});

test('six source-authored part routes enter the actual native owner and open cradles have an empty mouth', async () => {
  const sim = createSimulation({ seed: 8202, systems: [] });
  const native = await createSg02DynamicBodyOwner();
  try {
    const parts = PART_LIST.map((part, i) => sim.spawn(partBodySpec(part.id, { x: i * 120, z: 0 }, {
      rigId: 'rig:shape-test', ownerId: 'pilot:shape-test', partToken: `part:shape:${part.id}`,
    })));
    native.syncFromEntities(parts);
    assert.equal(PART_LIST.length, 6);
    assert.equal(native.records.size, 6);
    for (const body of parts) {
      assert.equal(resolvePlaceFileForEntity(body), `places/${body.data.placeId}.glb`);
      const rec = native.records.get(body.id);
      assert.ok(rec.body.isDynamic());
      assert.ok(rec.colliders.length > 0);
      assert.ok(rec.colliders.every((c) => !c.isSensor()), 'the machine has solid parts');
      assert.ok(Math.abs(rec.body.mass() - body.mass) < 0.01);
      if (body.data.rigWorkshop.partType === 'cradle' || body.data.rigWorkshop.partType === 'collector') {
        const occupies = (x, z) => rec.colliders.some((c) => c.containsPoint({ x: body.pos.x + x, y: 0, z }));
        assert.equal(occupies(body.radius * 0.45, 0), false, 'the carrying mouth is real free space');
        assert.equal(occupies(0, body.radius * 0.7), true, 'the side cheek is a real obstruction');
      }
    }
  } finally { native.dispose(); sim.dispose(); }
});

test('physical payloads reach the existing authored place renderer through a presentation-only facade', () => {
  for (const definition of PART_LIST) {
    const entity = { ...partBodySpec(definition.id, { x: 17, z: -23 }, {
      rigId: 'rig:render', ownerId: 'pilot:render', partToken: `part:render:${definition.id}`,
    }), id: 31, occupantGeneration: 4 };
    const before = clone(entity);
    const boundary = buildRigWorkshopBody(entity);
    assert.ok(boundary?.isObject3D, definition.id);
    assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission', definition.id);
    assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function', definition.id);
    assert.equal(boundary.userData.presentationEntityId, entity.id);
    assert.equal(boundary.userData.presentationEntityType, 'payload');
    assert.equal(entity.type, 'payload');
    assert.equal(entity.presentationAdmission, 'pending', 'the existing presentation owner receives its pending receipt');
    const { presentationAdmission, ...gameplay } = entity;
    assert.deepEqual(gameplay, before, 'render admission may not alter a native payload');
    boundary.userData?.dispose?.();
  }
});

test('the main view consumes the current floating-origin facade and releases deck and scene ownership on teardown', () => {
  const bus = createBus(), scene = new THREE.Scene(), entries = new Map();
  const deck = { offerDecision(p) { entries.set(p.id, p); }, resolveDecision(id) { entries.delete(id); }, hasDecision(id) { return entries.has(id); } };
  const state = { mode: 'flight', simTime: 1, playerId: 1,
    world: { currentSectorId: 'sector_ceres_belt', frameOrigin: { x: 1000, z: 2000 }, frameOriginSeq: 1 },
    entities: new Map([[1, { pos: { x: 1000, z: 2000 } }]]),
    rigWorkshop: { bench: { pos: { x: 1000, z: 2000 }, sectorId: 'sector_ceres_belt' }, rigs: [] } };
  const before = clone(state.rigWorkshop);
  const view = createRigWorkshopView({ state, bus, scene, getDeck: () => deck });
  bus.emit('rigWorkshop:prompt', { id: 'view', revision: 1, options: [{ id: 'visit', label: 'Visit' }] });
  view.frame(DT);
  const mesh = scene.children.find((e) => e.name === 'SF_RigWorkshopConnectionMarks');
  assert.ok(mesh && mesh.count > 0); assert.equal(entries.size, 1);
  const first = new THREE.Matrix4(); mesh.getMatrixAt(0, first);
  const live = { ...state, world: { ...state.world, frameOrigin: { x: 1100, z: 2250 }, frameOriginSeq: 2 } };
  view.frame(DT, live);
  const moved = new THREE.Matrix4(); mesh.getMatrixAt(0, moved);
  assert.ok(Math.abs(moved.elements[12] - first.elements[12] + 100) < 0.001);
  assert.ok(Math.abs(moved.elements[14] - first.elements[14] + 250) < 0.001);
  assert.deepEqual(state.rigWorkshop, before, 'rebasing is presentation-only');
  assert.deepEqual(state.world.frameOrigin, { x: 1000, z: 2000 });
  view.destroy(); view.destroy(); view.frame(DT, live);
  assert.equal(scene.children.length, 0); assert.equal(entries.size, 0);
  bus.emit('rigWorkshop:prompt', { id: 'closed', revision: 2, options: [{ id: 'visit', label: 'Visit' }] });
  assert.equal(entries.size, 0);
});

test('a late worker facade hydrates one decision, respects explicit close, and supplies the live feedback clock', () => {
  const bus = createBus(), scene = new THREE.Scene(), entries = new Map(), audio = [];
  let offers = 0;
  const deck = { offerDecision(p) { offers++; entries.set(p.id, p); }, resolveDecision(id) { entries.delete(id); }, hasDecision(id) { return entries.has(id); } };
  const state = { mode: 'flight', simTime: 0, playerId: 1, world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[1, { pos: { x: 0, z: 0 } }]]) };
  bus.on('audio:cue', (cue) => audio.push(cue));
  const view = createRigWorkshopView({ state, bus, scene, getDeck: () => deck });
  try {
    assert.equal(entries.size, 0);
    const prompt = { id: 'late', revision: 1, options: [{ id: 'visit', label: 'Visit' }] };
    const live = { ...state, simTime: 10, rigWorkshop: { prompt, bench: { pos: { x: 0, z: 0 }, sectorId: 'sector_ceres_belt' }, rigs: [] } };
    view.frame(DT, live); view.frame(DT, live);
    assert.equal(offers, 1); assert.equal(entries.has('rig-workshop:late'), true);
    bus.emit('rigWorkshop:feedback', { id: 'warning:1', kind: 'warning', text: 'The connection is straining.' });
    view.frame(DT, { ...live, simTime: 11 });
    bus.emit('rigWorkshop:feedback', { id: 'warning:2', kind: 'warning', text: 'Ease the turn.' });
    assert.equal(audio.length, 1, 'repeated strain cues respect the ordinary sound cooldown');
    view.frame(DT, { ...live, simTime: 16 });
    bus.emit('rigWorkshop:feedback', { id: 'warning:3', kind: 'warning', text: 'The load is still straining.' });
    assert.equal(audio.length, 2, 'the current facade clock releases that cooldown');
    bus.emit('rigWorkshop:promptClosed', { id: 'late' });
    assert.equal(entries.size, 0);
    view.frame(DT, { ...live, rigWorkshop: { ...live.rigWorkshop, prompt: null } });
    view.frame(DT, live);
    assert.equal(entries.size, 0, 'a delayed mirror cannot reopen the explicitly closed revision');
    assert.equal(offers, 1);
    bus.emit('game:newGame'); view.frame(DT, live);
    assert.equal(entries.size, 1); assert.equal(offers, 2, 'the next run may reuse a decision ID and revision');
  } finally { view.destroy(); }
  assert.equal(entries.size, 0); assert.equal(scene.children.length, 0);
});

test('render overlay respects the floating origin, is bounded, and cleans its own GPU resources', () => {
  const scene = new THREE.Scene();
  const marks = createRigWorkshopRender({ scene, toLocalXZ(x, z, out) { out.x = x - 1000; out.z = z - 2000; return out; } });
  const state = {
    mode: 'flight', playerId: 1,
    entities: new Map([[1, { pos: { x: 1000, z: 2000 } }]]),
    rigWorkshop: { bench: { pos: { x: 1000, z: 2000 } }, rigs: [],
      preview: { valid: false, partType: 'bumper', pos: { x: 1010, z: 2000 } } },
  };
  const before = clone(state.rigWorkshop);
  marks.update(state);
  assert.ok(marks.mesh.count > 0 && marks.mesh.count <= 384);
  const m = new THREE.Matrix4();
  for (let i = 0; i < marks.mesh.count; i++) {
    marks.mesh.getMatrixAt(i, m);
    assert.ok(Math.abs(m.elements[12]) < 100, 'world X was rebased for the render scene');
    assert.ok(Math.abs(m.elements[14]) < 100, 'world Z was rebased for the render scene');
  }
  assert.deepEqual(state.rigWorkshop, before);
  state.rigWorkshop.bench.sectorId = 'sector_ceres_belt';
  state.world = { currentSectorId: 'sector_helios_prime' };
  marks.update(state);
  assert.equal(marks.mesh.count, 0, 'a bench in another sector has no local overlay');
  state.world.currentSectorId = 'sector_ceres_belt';
  state.ui = { docked: true };
  marks.update(state);
  assert.equal(marks.mesh.count, 0, 'docking clears workshop marks');
  let disposedGeometry = 0, disposedMaterial = 0;
  marks.mesh.geometry.addEventListener('dispose', () => disposedGeometry++);
  marks.mesh.material.addEventListener('dispose', () => disposedMaterial++);
  marks.dispose(); marks.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposedGeometry, 1); assert.equal(disposedMaterial, 1);
});

test('example rigs are seeded once; valid preview spends only after native admission, cancellation is free, and undo restores stock', async () => {
  const h = await nativeFixture();
  try {
    assert.equal(h.physics.ensureTemplates(h.w).ok, true);
    h.step(3);
    assert.equal(h.w.rigs.length, 2);
    const originalIds = h.w.rigs.flatMap((r) => r.partIds);
    assert.equal(new Set(originalIds).size, originalIds.length);
    for (const rig of h.w.rigs) assert.ok(rig.connections.every((e) => e.state === 'active'));
    assert.ok(h.native.attachments.size >= 21, 'all structural braces entered the actual owner');
    h.physics.ensureTemplates(h.w);
    assert.deepEqual(h.w.rigs.flatMap((r) => r.partIds), originalIds);
    const rig = h.w.rigs[0], stock = h.w.stock;
    const invalid = h.physics.previewEdit(h.w, { rigId: rig.id, parentId: rig.partIds[0], partType: 'bumper', mount: 'front' });
    assert.equal(invalid.ok, false, 'existing cradle blocks a new front guard');
    assert.equal(h.physics.commitPreview(h.w).ok, false);
    assert.equal(h.w.stock, stock);
    const edit = { rigId: rig.id, parentId: rig.partIds[0], partType: 'collector', mount: 'starboard' };
    assert.equal(h.physics.previewEdit(h.w, edit).ok, true);
    h.physics.cancelPreview(h.w);
    assert.equal(h.w.preview, null);
    assert.equal(h.w.stock, stock);
    assert.equal(h.physics.previewEdit(h.w, edit).ok, true);
    const abandoned = h.physics.commitPreview(h.w);
    assert.equal(abandoned.ok, true);
    h.physics.cancelPreview(h.w); h.step(2);
    assert.equal(h.w.stock, stock, 'cancelling a pending native fitting returns the unpaid part');
    assert.equal(h.state.entities.has(abandoned.bodyId), false);
    assert.equal(h.native.records.has(abandoned.bodyId), false);
    assert.equal(h.physics.previewEdit(h.w, edit).ok, true);
    const committed = h.physics.commitPreview(h.w);
    assert.equal(committed.ok, true);
    assert.equal(h.w.stock, stock, 'a spawn is not yet a successful physical edit');
    h.step(3);
    assert.equal(h.w.stock, stock - 1);
    assert.equal(rig.modified, true);
    assert.ok(h.native.records.has(committed.bodyId));
    assert.equal(h.physics.undoEdit(h.w).ok, true);
    h.step();
    assert.equal(h.w.stock, stock);
    assert.equal(h.state.entities.has(committed.bodyId), false);
    assert.deepEqual(rig.partIds, originalIds.slice(0, 4));
    assert.equal(h.physics.undoEdit(h.w).ok, false, 'one reclaimed part cannot be refunded twice');
  } finally { h.close(); }
});

test('powered sled moves through native impulses and connected mass; stopping power preserves earned momentum', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs.find((r) => r.template === 'sled');
    const root = h.state.entities.get(rig.partIds[0]);
    const before = root.pos.x;
    assert.equal(h.physics.coupleShip(h.w, rig.id).ok, true);
    h.state.input.moveZ = 1;
    assert.equal(h.physics.setPower(h.w, rig.id, true).ok, true);
    h.step(120);
    assert.ok(root.pos.x > before + 2, 'the frame follows its physically connected drives');
    assert.ok(root.vel.x > 0.5, 'the powered rig acquired actual native momentum');
    const momentum = rig.partIds.reduce((sum, id) => { const b = h.state.entities.get(id); return sum + b.mass * b.vel.x; }, 0);
    assert.ok(momentum > 500, 'work is distributed through the connected machine');
    assert.equal(h.physics.setPower(h.w, rig.id, false).ok, true);
    const x = root.pos.x;
    h.step(15);
    assert.ok(root.pos.x > x, 'turning power off is not an invisible brake');
    assert.ok(rig.connections.every((e) => e.state === 'active'), 'ordinary operation does not mysteriously shatter the loaned rig');
  } finally { h.close(); }
});

test('normal pilot thrust, strafe and brake tow an owned heavy load through production FlightV3, combat and native physics', async () => {
  const modules = { flightSlot: flightV3, physics: productionPhysics, combat, tetherGameplay };
  const sim = createSimulation({ seed: 8202,
    systems: PRODUCTION_INIT_ORDER.filter((id) => modules[id]).map((id) => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter((id) => modules[id]).map((id) => modules[id]) });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const { spec } = buildEntitySpawnSpec({ profile: 'ship.starter', isPlayer: true, role: 'player', team: 0,
    pos: { x: -132, z: 40 }, heading: Math.PI }, state);
  const player = sim.spawn(spec); state.playerId = player.id;
  const w = state.rigWorkshop = { version: 1, ownerId: 'pilot:normal-flight', bench: { pos: { x: 0, z: 0 },
    sectorId: state.world.currentSectorId }, rigs: [], stock: 8, jobs: {}, receipts: [] };
  const adapter = createRigPhysicsAdapter(sim.registry.ctx), physical = sim.registry.get('physics');
  try {
    await physical.prepareBackend(state, {});
    adapter.ensureTemplates(w);
    const step = (n, input = {}) => {
      for (let i = 0; i < n; i++) {
        Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, brake: false, boost: false }, input);
        adapter.update(DT, w); sim.step(DT);
      }
    };
    step(20);
    const rig = w.rigs.find((r) => r.template === 'sled'), root = state.entities.get(rig.rootId);
    const holder = rig.partIds.map((id) => state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'collector');
    const cargo = sim.spawn({ type: 'payload', pos: { x: holder.pos.x + 8, z: holder.pos.z }, radius: 7, mass: 190,
      hull: 400, hullMax: 400, ownerId: player.id,
      physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true, radius: 7, mass: 190, inertiaY: 4655, revision: 0 },
      data: { worldRecordId: 'owned-salvage:flight-proof', payloadType: 'jettisoned_cargo', commodityId: 'scrap', amount: 4 } });
    step(1);
    assert.equal(adapter.captureCargo(w, rig.id, cargo.id).ok, true); step(20);
    assert.equal(cargo.data.worldRecordId, 'owned-salvage:flight-proof');
    assert.equal(cargo.data.amount, 4); assert.equal(cargo.data.commodityId, 'scrap');
    assert.equal(cargo.data.persistenceOwner, 'rigWorkshop', 'the original owned salvage is retained with the machine');
    assert.equal(adapter.coupleShip(w, rig.id).ok, true); step(2);
    assert.equal(adapter.setPower(w, rig.id, true).ok, true);
    const initial = { x: root.pos.x, z: root.pos.z, cargoX: cargo.pos.x };
    step(240, { moveZ: 0.22 });
    const pullSpeed = Math.hypot(cargo.vel.x, cargo.vel.z);
    assert.ok(root.pos.x < initial.x - 10, 'normal ship thrust pulls the original frame');
    assert.ok(cargo.pos.x < initial.cargoX - 10, 'the original heavy cargo follows the actual line');
    assert.ok(pullSpeed > 5);
    step(90, { moveZ: 0.12, moveX: 0.18 });
    assert.ok(Math.abs(root.pos.z - initial.z) > 1, 'normal strafe steers the loaded assembly');
    step(1800, { brake: true });
    assert.ok(Math.hypot(cargo.vel.x, cargo.vel.z) < 6, 'patient normal braking brings the heavy load within the delivery speed');
    assert.ok(Math.hypot(cargo.vel.x, cargo.vel.z) < pullSpeed * 0.4);
    assert.equal(adapter.isCargoSecured(w, rig.id, cargo.id), true);
    assert.equal(state.combat.attachments.byId[rig.towAttachmentId].state, 'active');
    assert.ok(rig.connections.every((edge) => edge.state === 'active'));
    assert.equal(readPhysicsTelemetry(root).dynamic, true);
    assert.equal(state.entities.get(cargo.id), cargo);
    const snapshot = captureRigWorkshop(state);
    assert.equal(snapshot.bodies.filter((e) => e.data.worldRecordId === 'owned-salvage:flight-proof').length, 1);
  } finally { adapter.dispose(); physical.destroy?.(); sim.dispose(); }
});

test('real native overload warns before a brace separates and leaves the original bodies recoverable', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(45);
    const rig = h.w.rigs[0], edge = rig.connections.find((e) => h.state.entities.get(e.childId).data.rigWorkshop.partType === 'cradle');
    const child = h.state.entities.get(edge.childId), root = h.state.entities.get(edge.parentId);
    const events = [];
    h.bus.on('rigWorkshop:strain', () => events.push('strain'));
    h.bus.on('rigWorkshop:jointBroken', () => events.push('broken'));
    for (let i = 0; i < 180 && edge.state !== 'broken'; i++) {
      queuePhysicsImpulse(child, { x: 7000, z: 0 });
      h.step();
    }
    assert.equal(edge.state, 'broken', 'actual solver tension exceeds the authored brace envelope');
    assert.ok(events.includes('strain'), 'load gives an understandable warning');
    assert.ok(events.indexOf('strain') < events.indexOf('broken'));
    assert.equal(h.state.entities.get(child.id), child);
    assert.equal(h.state.entities.get(root.id), root);
    assert.ok(child.hull > 0 && root.hull > 0, 'a separated connection does not delete surviving machinery');
    assert.equal(rig.partIds.includes(child.id), true);
    assert.ok(edge.attachmentIds.every((id) => !h.native.attachments.has(id)));
  } finally { h.close(); }
});

test('ordinary Adventure discovers the fixed workshop, respects refusal, accepts through its deck, and does not clone rigs on return', async () => {
  const h = await nativeFixture();
  const system = createRigWorkshopSystem();
  try {
    delete h.state.rigWorkshop;
    system.init(h.sim.registry.ctx);
    system.update(DT);
    const w = system.workshop;
    assert.ok(w.bench?.entityId);
    assert.equal(w.introduced, true);
    assert.equal(w.prompt.options.some((o) => o.id === 'visit'), true);
    const first = clone(w.prompt);
    assert.equal(system.choose({ promptId: first.id, revision: first.revision, choiceId: 'later' }), true);
    assert.equal(w.prompt, null);
    assert.equal(w.rigs.length, 0, 'declining a distant offer does not mint duplicate loan rigs');
    const position = clone(w.bench.pos);
    h.player.pos.x = position.x; h.player.pos.z = position.z;
    h.state.simTime += 21;
    system.update(DT);
    h.native.syncFromEntities(h.state.entityList);
    system.update(DT);
    const ids = w.rigs.flatMap((r) => r.partIds);
    assert.equal(w.rigs.length, 2);
    assert.ok(ids.length >= 9);
    assert.equal(system.dispatch('jobs').ok, true);
    const prompt = clone(w.prompt);
    assert.equal(system.choose({ promptId: prompt.id, revision: prompt.revision, choiceId: 'job:needle' }), true);
    const offer = clone(w.prompt);
    assert.equal(system.choose({ promptId: offer.id, revision: offer.revision, choiceId: 'refuse' }), true);
    assert.equal(Object.keys(w.jobs).length, 0);
    assert.equal(system.dispatch('acceptJob', { id: 'needle' }).ok, true);
    assert.equal(w.jobs.needle.cargoIds.length, 3);
    assert.ok(Math.hypot(w.jobs.needle.pickup.x - position.x, w.jobs.needle.pickup.z - position.z) > 500);
    const population = h.state.entityList.length;
    assert.equal(system.dispatch('acceptJob', { id: 'needle' }).ok, false);
    assert.equal(h.state.entityList.length, population);
    h.state.world.currentSectorId = 'sector_helios'; system.update(DT);
    h.state.world.currentSectorId = w.bench.sectorId; system.update(DT);
    assert.deepEqual(w.rigs.flatMap((r) => r.partIds), ids);
    assert.deepEqual(w.bench.pos, position);
    assert.equal(h.state.entityList.length, population, 'leave/return reuses every original body');
    const courses = []; h.bus.on('ui:setCourse', (course) => courses.push(course));
    assert.equal(system.dispatch('guide').ok, true);
    const destinations = clone(w.prompt);
    assert.ok(destinations.options.some((o) => o.id === 'pickup'));
    assert.ok(destinations.options.some((o) => o.id === 'receiver'));
    assert.ok(destinations.options.some((o) => o.id === 'bench'));
    assert.equal(system.choose({ promptId: destinations.id, revision: destinations.revision, choiceId: 'receiver' }), true);
    assert.deepEqual(courses.at(-1).pos, w.jobs.needle.destination, 'the receiver marker is reachable before or after pickup');
  } finally { system.destroy(); h.close(); }
});

test('the field deck secures ordinary owned salvage, can recapture a failed restraint, and offers bounded recovery away from the rig', async () => {
  const h = await nativeFixture(), system = createRigWorkshopSystem();
  try {
    system.init(h.sim.registry.ctx); h.physics.ensureTemplates(h.w); h.step(3); system.update(DT);
    const rig = h.w.rigs[0];
    for (const id of rig.partIds) h.state.entities.get(id).pos.x += 400;
    const root = h.state.entities.get(rig.rootId);
    h.player.pos.x = root.pos.x - 80; h.player.pos.z = root.pos.z;
    const holder = rig.partIds.map((id) => h.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'cradle');
    const cargo = h.sim.spawn({ type: 'payload', ownerId: h.player.id, pos: { x: holder.pos.x + 6, z: holder.pos.z },
      radius: 3, mass: 20, hull: 80, hullMax: 80,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 3, mass: 20, inertiaY: 90, revision: 0 },
      data: { worldRecordId: 'ordinary-salvage:deck', payloadType: 'jettisoned_cargo', amount: 2 } });
    h.step(2); system.update(DT);
    const field = clone(h.w.prompt);
    assert.equal(field.options.find((o) => o.id === 'capture').disabled, undefined,
      'owned salvage remains useful without an active order');
    assert.equal(system.choose({ promptId: field.id, revision: field.revision, choiceId: 'capture' }), true);
    assert.equal(h.physics.isCargoSecured(h.w, rig.id, cargo.id), true);
    const edge = rig.connections.find((e) => e.kind === 'cargo' && e.childId === cargo.id);
    h.physics.kernel.attachments.cut(edge.attachmentIds[0], null, 'test_failed_restraint');
    h.step(2);
    assert.equal(rig.cargoIds.includes(cargo.id), true);
    assert.equal(h.physics.isCargoSecured(h.w, rig.id, cargo.id), false);
    const recaptured = system.dispatch('capture');
    assert.equal(recaptured.ok, true, recaptured.reason);
    assert.equal(h.physics.isCargoSecured(h.w, rig.id, cargo.id), true);
    assert.equal(rig.cargoIds.filter((id) => id === cargo.id).length, 1);
    assert.equal(h.state.entities.get(cargo.id), cargo); assert.equal(cargo.data.amount, 2);
    system.dispatch('close');
    h.player.pos.x = 5000; h.player.pos.z = 5000; h.state.simTime += 21; system.update(DT);
    const away = clone(h.w.prompt);
    assert.ok(away.options.some((o) => o.id === 'recover'));
    assert.equal(system.choose({ promptId: away.id, revision: away.revision, choiceId: 'close' }), true);
    h.state.simTime += 21; system.update(DT);
    assert.equal(h.w.prompt, null, 'declining recovery does not nag on every tick');
    h.player.pos.x = 0; h.player.pos.z = 0; system.update(DT);
    h.player.pos.x = 5000; h.player.pos.z = 5000; system.update(DT);
    assert.ok(h.w.prompt?.options.some((o) => o.id === 'recover'), 'a later trip can locate the same machinery again');
  } finally { system.destroy(); h.close(); }
});

test('a changed edit precondition returns a usable deck page instead of consuming the only route', async () => {
  const h = await nativeFixture(), system = createRigWorkshopSystem();
  try {
    system.init(h.sim.registry.ctx); h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs[0], stock = h.w.stock, count = rig.partIds.length;
    assert.equal(system.dispatch('preview', { partType: 'collector', parentId: rig.rootId, mount: 'starboard' }).ok, true);
    const preview = clone(h.w.prompt);
    h.player.vel.x = 20;
    assert.equal(system.choose({ promptId: preview.id, revision: preview.revision, choiceId: 'commit' }), true);
    assert.equal(h.w.stock, stock); assert.equal(rig.partIds.length, count);
    const recovered = clone(h.w.prompt);
    assert.ok(recovered.options.some((o) => o.id === 'edit'));
    h.player.vel.x = 0;
    assert.equal(system.choose({ promptId: recovered.id, revision: recovered.revision, choiceId: 'edit' }), true);
    assert.ok(h.w.prompt.options.some((o) => o.id === 'part:frame'));
    assert.equal(system.choose({ promptId: preview.id, revision: preview.revision, choiceId: 'commit' }), false,
      'the stale card still cannot commit after the player brakes');
  } finally { system.destroy(); h.close(); }
});

test('work sites avoid existing solids, obstructed acceptance spends nothing, and guidance follows the drifting original cargo', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const desired = { x: 670, z: -240 };
    const blocked = h.sim.spawn({ type: 'station', pos: desired, radius: 10000, mass: 100000,
      hull: 1000, collides: true, data: {} });
    const population = h.state.entities.size, stock = h.w.stock;
    const refusal = jobs.accept(h.w, 'needle');
    assert.equal(refusal.ok, false); assert.match(refusal.reason, /obstructed/);
    assert.equal(h.state.entities.size, population); assert.equal(h.w.stock, stock);
    assert.equal(Object.keys(h.w.jobs).length, 0);
    h.physics.removeBody(blocked);
    const obstacle = h.sim.spawn({ type: 'station', pos: desired, radius: 60, mass: 100000,
      hull: 1000, collides: true, physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 60, mass: 100000, revision: 0 }, data: {} });
    const accepted = jobs.accept(h.w, 'needle');
    assert.equal(accepted.ok, true, accepted.reason);
    const job = accepted.job;
    assert.notDeepEqual(job.pickup, desired);
    assert.ok(Math.hypot(job.pickup.x - obstacle.pos.x, job.pickup.z - obstacle.pos.z) > 145 + obstacle.radius);
    const current = [];
    h.bus.on('ui:setCourse', (course) => current.push(course));
    h.step(2);
    for (const id of job.cargoIds) { const cargo = h.state.entities.get(id); queuePhysicsImpulse(cargo, { x: cargo.mass * 15, z: 0 }); }
    h.step(60);
    const result = jobs.guide(h.w, 'pickup');
    assert.equal(result.ok, true, result.reason);
    const course = current.at(-1), cargo = h.state.entities.get(course.targetEntityId);
    assert.ok(job.cargoIds.includes(cargo.id));
    assert.equal(course.pos.x, cargo.pos.x); assert.equal(course.pos.z, cargo.pos.z);
    assert.ok(Math.abs(cargo.pos.x - job.cargo.find((record) => record.id === cargo.id).origin.x) > 5,
      'the guide follows the native body rather than an empty pickup coordinate');
  } finally { h.close(); }
});

test('stale edit preview and lost native admission do not spend materials or leave phantom parts', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(2);
    const rig = h.w.rigs[0], count = rig.partIds.length, stock = h.w.stock;
    const edit = { rigId: rig.id, parentId: rig.partIds[0], partType: 'collector', mount: 'starboard' };
    assert.equal(h.physics.previewEdit(h.w, edit).ok, true);
    rig.revision++;
    assert.equal(h.physics.commitPreview(h.w).reason, 'preview_stale');
    assert.equal(h.w.stock, stock);
    assert.equal(h.physics.previewEdit(h.w, edit).ok, true);
    const failed = []; h.bus.on('rigWorkshop:failed', (event) => failed.push(event));
    const pending = h.physics.commitPreview(h.w);
    assert.equal(pending.ok, true);
    // A real native body can be denied admission. No fake attachment service is
    // substituted: withdrawing this recipe makes the real owner reject its joint.
    h.state.entities.get(pending.bodyId).physicsBody = false;
    h.step(123);
    assert.equal(h.w.stock, stock);
    assert.equal(rig.partIds.length, count);
    assert.equal(h.state.entities.has(pending.bodyId), false);
    assert.equal(h.native.records.has(pending.bodyId), false);
    assert.equal(failed.length, 1, 'a rejected native fitting produces one player-facing refusal');
    h.step(10); assert.equal(failed.length, 1);
  } finally { h.close(); }
});

test('a changed cradle carries original outside cargo through native physics, earns partial pay once, and keeps its reward when the remainder closes', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs[0];
    h.physics.previewEdit(h.w, { rigId: rig.id, parentId: rig.partIds[0], partType: 'collector', mount: 'starboard' });
    assert.equal(h.physics.commitPreview(h.w).ok, true); h.step(3);
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const accepted = jobs.accept(h.w, 'needle');
    assert.equal(accepted.ok, true);
    h.step(2);
    const job = accepted.job, cargo = h.state.entities.get(job.cargoIds[0]);
    const original = { id: cargo.id, token: cargo.data.rigWorkshopCargo.token, origin: clone(cargo.pos) };
    const holder = rig.partIds.map((id) => h.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'cradle');
    stageUnloadedRig(h, rig, holder, cargo);
    assert.equal(h.physics.captureCargo(h.w, rig.id, cargo.id).ok, true);
    jobs.update(h.w);
    assert.equal(job.cargo[0].collectedByRig, rig.id);
    assert.equal(jobs.deliver(h.w).ok, false, 'the pickup field is not the receiver');
    driveNativeRig(h, jobs, rig, job.destination);
    assert.ok(job.cargo[0].travelled > 500, 'the original body travelled through the existing world');
    assert.equal(cargo.id, original.id); assert.equal(cargo.data.rigWorkshopCargo.token, original.token);
    h.player.pos.x = job.destination.x - 80; h.player.pos.z = job.destination.z + 80;
    h.native.syncFromEntities(h.state.entityList);
    // Let the load settle through the same constraints, not a receipt-side velocity reset.
    driveNativeRig(h, jobs, rig, job.destination, 1800);
    // The flight controller is outside this focused fixture. Place the observer
    // beside the receiver only after the native load has completed its route.
    h.player.pos.x = job.destination.x - 80; h.player.pos.z = job.destination.z + 80;
    h.native.syncFromEntities(h.state.entityList);
    const delivery = jobs.deliver(h.w);
    assert.equal(delivery.ok, true, `${delivery.reason}; cargo=${JSON.stringify({ pos: cargo.pos, vel: cargo.vel, spin: cargo.angVel, travel: job.cargo[0].travelled })}`);
    assert.equal(job.delivered.length, 1);
    assert.equal(job.stage, 'partial');
    assert.ok(delivery.amount >= 154, 'damaged salvage still pays and a changed-rig success is recognized');
    assert.equal(h.w.signatureDone, true);
    assert.equal(cargo.ownerId, job.receiverId);
    const credits = h.state.player.credits;
    assert.equal(jobs.deliver(h.w).ok, false);
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.events.length, 1, 'only the actual economy owner receives a payout intent');
    assert.equal(jobs.settlePartial(h.w).ok, true);
    assert.equal(h.state.player.credits, credits);
    assert.equal(jobs.accept(h.w, 'needle').ok, false);
    assert.equal(h.state.entities.get(original.id), cargo, 'settlement does not copy or destroy cargo identity');
    const cold = await nativeFixture();
    try {
      // Credits belong to the ordinary save envelope. Workshop restoration must
      // preserve its custody receipts without issuing a second economy grant.
      cold.state.player.credits = credits;
      const restored = restoreRigWorkshop(cold.state, captureRigWorkshop(h.state), cold.physics);
      assert.equal(restored.ok, true, restored.reason);
      cold.step(3);
      const restoredJobs = createWorkshopJobs({ state: cold.state, bus: cold.bus, physics: cold.physics });
      cold.player.pos.x = job.destination.x; cold.player.pos.z = job.destination.z;
      assert.equal(restoredJobs.deliver(cold.w, 'needle').ok, false);
      assert.equal(restoredJobs.accept(cold.w, 'needle').ok, false);
      assert.equal(cold.state.player.credits, credits);
      assert.equal(cold.events.length, 0, 'a cold restore is not another delivery');
      assert.equal(cold.w.receipts.length, 1);
      assert.equal(cold.state.entities.get(original.id).data.rigWorkshopCargo.delivered, true);
      assert.equal(cold.state.entities.get(original.id).ownerId, job.receiverId);
      const paid = captureRigWorkshop(h.state), remapped = await nativeFixture();
      try {
        remapped.state.player.credits = credits;
        const entityIdRemap = new Map(paid.bodies.map((body) => [String(body.id), body.id + 2000]));
        const result = restoreRigWorkshop(remapped.state, paid, remapped.physics, { entityIdRemap });
        assert.equal(result.ok, true, result.reason);
        const cargoId = entityIdRemap.get(String(original.id)), receiverId = entityIdRemap.get(String(job.receiverId));
        assert.equal(remapped.state.entities.get(cargoId).ownerId, receiverId);
        assert.equal(remapped.state.entities.get(cargoId).data.rigWorkshopCargo.receiverId, receiverId);
        assert.deepEqual(remapped.w.receipts[0].cargoIds, [cargoId]);
        assert.equal(remapped.w.jobs.needle.delivered[0], cargoId);
        assert.equal(remapped.events.length, 0);
      } finally { remapped.close(); }
    } finally { cold.close(); }
  } finally { h.close(); }
});

test('both original heavy stores can be hauled by the sled and settle the second outside order in full', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs.find((r) => r.template === 'sled');
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const accepted = jobs.accept(h.w, 'kiln');
    assert.equal(accepted.ok, true); h.step(2);
    const job = accepted.job;
    assert.equal(job.cargoIds.length, 2);
    const originals = job.cargoIds.map((id) => h.state.entities.get(id));
    assert.ok(originals[1].mass > originals[0].mass, 'the asymmetric load is real mass');
    const holder = rig.partIds.map((id) => h.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'collector');
    for (const cargo of originals) {
      stageUnloadedRig(h, rig, holder, cargo);
      const captured = h.physics.captureCargo(h.w, rig.id, cargo.id);
      assert.equal(captured.ok, true, captured.reason);
      jobs.update(h.w);
      // Line up with the real throat first. A diagonal straight-line autopilot
      // would catch the kiln's fixed freight frames with this wide machine.
      driveNativeRig(h, jobs, rig, { x: job.pickup.x, z: job.pickup.z - 130 }, 3600);
      driveNativeRig(h, jobs, rig, job.destination, 6200);
      h.player.pos.x = job.destination.x - 80; h.player.pos.z = job.destination.z + 80;
      h.native.syncFromEntities(h.state.entityList);
      const delivered = jobs.deliver(h.w);
      assert.equal(delivered.ok, true, `${delivered.reason}; load=${cargo.id}; p=${JSON.stringify(cargo.pos)}; v=${JSON.stringify(cargo.vel)}; root=${JSON.stringify(h.state.entities.get(rig.partIds[0]).pos)}; edges=${JSON.stringify(rig.connections.map(e => [e.kind,e.state,e.stress]))}; travel=${job.cargo.find(c => c.id === cargo.id).travelled}`);
      assert.ok(job.cargo.find((c) => c.id === cargo.id).travelled > 500);
      assert.equal(h.state.entities.get(cargo.id), cargo);
      assert.equal(rig.cargoIds.length, 0, 'receiver custody releases the actual restraint');
    }
    assert.equal(job.settled, true);
    assert.equal(job.stage, 'settled');
    assert.deepEqual(job.delivered, originals.map((e) => e.id));
    assert.equal(h.w.activeJobId, null);
    assert.equal(h.events.length, 2);
    assert.equal(h.w.signatureDone, undefined, 'an unchanged loan rig does not claim a player modification');
    const credits = h.state.player.credits;
    assert.equal(jobs.deliver(h.w, 'kiln').ok, false);
    assert.equal(h.state.player.credits, credits);
    assert.equal(jobs.accept(h.w, 'kiln').ok, false);
  } finally { h.close(); }
});

test('a collector has two native cargo restraints and a broken restraint cannot manufacture carried distance', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs.find((r) => r.template === 'sled');
    const holder = rig.partIds.map((id) => h.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'collector');
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const accepted = jobs.accept(h.w, 'kiln'); assert.equal(accepted.ok, true); h.step(2);
    const job = accepted.job;
    // This is a local capacity/admission fixture. Actual outside route travel is
    // proved separately; these initial positions must never count as transport.
    for (let i = 0; i < job.cargoIds.length; i++) {
      const cargo = h.state.entities.get(job.cargoIds[i]);
      cargo.pos.x = holder.pos.x + 1; cargo.pos.z = holder.pos.z + (i ? 6 : -6);
    }
    h.native.syncFromEntities(h.state.entityList);
    for (const id of job.cargoIds) {
      const result = h.physics.captureCargo(h.w, rig.id, id);
      assert.equal(result.ok, true, result.reason);
      assert.equal(h.physics.isCargoSecured(h.w, rig.id, id), true);
    }
    assert.equal(rig.connections.filter((e) => e.kind === 'cargo').length, 2);
    jobs.update(h.w);
    assert.deepEqual(job.cargo.map((c) => c.travelled), [0, 0], 'pickup fixture relocation earns no carried distance');
    const edge = rig.connections.find((e) => e.kind === 'cargo');
    h.physics.kernel.attachments.cut(edge.attachmentIds[0], null, 'test_load_swing');
    h.step(); jobs.update(h.w);
    assert.equal(h.physics.isCargoSecured(h.w, rig.id, edge.childId), false);
    assert.equal(job.cargo.find((c) => c.id === edge.childId).travelled, 0);
    assert.equal(job.cargo.find((c) => c.id === edge.childId).lastSecuredPos, null);
    const cargo = h.state.entities.get(edge.childId);
    cargo.pos.x = holder.pos.x + 5; cargo.pos.z = holder.pos.z - 4;
    cargo.vel.x = holder.vel.x; cargo.vel.z = holder.vel.z;
    h.native.syncFromEntities(h.state.entityList);
    const recaptured = h.physics.captureCargo(h.w, rig.id, cargo.id);
    assert.equal(recaptured.ok, true, recaptured.reason);
    jobs.update(h.w);
    assert.equal(h.physics.isCargoSecured(h.w, rig.id, cargo.id), true);
    assert.equal(rig.cargoIds.filter((id) => id === cargo.id).length, 1);
    assert.equal(job.cargo.find((c) => c.id === cargo.id).travelled, 0, 'reattachment does not claim the free-flight interval');
  } finally { h.close(); }
});

test('outside freight frames produce actual native contacts and deflect a machine driven into them', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const { job } = jobs.accept(h.w, 'needle'); h.step(2);
    const rig = h.w.rigs[0], root = h.state.entities.get(rig.partIds[0]);
    const obstacle = h.state.entities.get(job.obstacleIds[0]), position = clone(obstacle.pos);
    stageUnloadedRig(h, rig, root, obstacle, { x: -100, z: 0 });
    const initialZ = root.pos.z;
    const mass = rig.partIds.reduce((sum, id) => sum + h.state.entities.get(id).mass, 0);
    const contacts = [];
    for (let i = 0; i < 480; i++) {
      queuePhysicsImpulse(root, { x: Math.max(-mass * 0.1, Math.min(mass * 0.1, (18 - root.vel.x) * mass * 0.02)), z: 0 });
      h.step();
      contacts.push(...h.native.drainContactImpacts().filter((hit) =>
        hit.aId === obstacle.id && rig.partIds.includes(hit.bId) || hit.bId === obstacle.id && rig.partIds.includes(hit.aId)));
    }
    assert.ok(contacts.length > 0, 'a native force receipt names the original machine and freight frame');
    assert.ok(contacts.some((hit) => hit.impulse > 1));
    assert.deepEqual(clone(obstacle.pos), position, 'the freight frame is actually fixed');
    assert.ok(Math.abs(root.pos.z - initialZ) > 1 || root.pos.x < obstacle.pos.x - 5,
      'the wide cradle stops or changes course at the solid frame');
    assert.ok(rig.partIds.every((id) => h.native.records.has(id)));
  } finally { h.close(); }
});

test('the actual world residency owner preserves workshop originals and does not create a second world-record owner', async () => {
  const h = await nativeFixture();
  try {
    const { world } = await import('../src/systems/world.js');
    const owner = Object.create(world); owner.init(h.sim.registry.ctx);
    h.physics.ensureTemplates(h.w); h.step(3);
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    jobs.accept(h.w, 'needle'); h.step(2);
    const originals = new Map([...h.state.entities].filter(([id]) => id !== h.player.id));
    const attachmentIds = [...h.native.attachments.keys()].sort();
    const sectorId = h.w.bench.sectorId;
    owner._demoteSectorToRecordOnly(sectorId);
    for (const [id, body] of originals) assert.equal(h.state.entities.get(id), body);
    for (const body of originals.values()) assert.equal(h.state.world.records.byId[body.data.worldRecordId], undefined,
      'payload persistence is owned once by the workshop envelope');
    h.state.world.currentSectorId = 'sector_helios_prime'; h.step(2);
    h.state.world.currentSectorId = sectorId;
    owner._rematerializeSectorRecords(sectorId, h.state.world.sectorContents[sectorId], 'FULL');
    h.physics.ensureTemplates(h.w); h.step(2);
    for (const [id, body] of originals) assert.equal(h.state.entities.get(id), body);
    assert.deepEqual([...h.native.attachments.keys()].sort(), attachmentIds);
    assert.equal(h.w.rigs.length, 2);
    assert.equal(h.w.jobs.needle.cargoIds.length, 3);
  } finally { h.close(); }
});

test('cold restoration preserves names, part identity, native connections and damage; repeat restoration creates nothing', async () => {
  const source = await nativeFixture(), cold = await nativeFixture();
  try {
    source.physics.ensureTemplates(source.w); source.step(3);
    const rig = source.w.rigs[0]; rig.name = 'The Patient Argument';
    const damaged = source.state.entities.get(rig.partIds[2]); damaged.hull = 61;
    const broken = rig.connections[2];
    for (const id of broken.attachmentIds) source.physics.kernel.attachments.cut(id, null, 'test_impact');
    source.step(2);
    assert.equal(broken.state, 'broken');
    const snapshot = captureRigWorkshop(source.state);
    const wantedIds = snapshot.bodies.map((e) => e.id).sort((a, b) => a - b);
    const wantedAttachments = Object.keys(snapshot.combat.attachments.byId).sort();
    const restored = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(restored.ok, true, restored.reason);
    assert.equal(restored.restored, snapshot.bodies.length);
    assert.equal(cold.w.rigs[0].name, 'The Patient Argument');
    assert.equal(cold.state.entities.get(damaged.id).hull, 61);
    assert.equal(cold.w.rigs[0].connections[2].state, 'broken');
    for (const saved of snapshot.bodies) {
      const live = cold.state.entities.get(saved.id);
      assert.equal(live.data.worldRecordId, saved.data.worldRecordId);
      assert.equal(live.pos.x, saved.pos.x); assert.equal(live.pos.z, saved.pos.z);
      assert.equal(live.vel.x, saved.vel.x); assert.equal(live.vel.z, saved.vel.z);
      assert.equal(live.ownerId, saved.ownerId);
    }
    cold.step(3);
    assert.deepEqual([...cold.native.attachments.keys()].sort(), wantedAttachments);
    const beforeBodies = new Map(cold.state.entities);
    const repeated = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(repeated.ok, true, repeated.reason);
    assert.equal(repeated.restored, 0);
    for (const id of wantedIds) assert.equal(cold.state.entities.get(id), beforeBodies.get(id));
    assert.equal(cold.w.rigs[0].connections[2].state, 'broken', 'load may not repair a snapped joint');
    assert.equal(cold.physics.ensureTemplates(cold.w).ok, true);
    assert.equal(cold.state.entities.size, beforeBodies.size);
    const extra = cold.sim.spawn({ type: 'payload', pos: { x: 5000, z: 5000 }, radius: 2, mass: 1, hull: 1 });
    assert.ok(!wantedIds.includes(extra.id), 'explicit restored IDs advance ordinary spawn allocation');
  } finally { source.close(); cold.close(); }
});

test('cold save refuses duplicate bodies and recycled foreign IDs atomically', async () => {
  const source = await nativeFixture(), cold = await nativeFixture();
  try {
    source.physics.ensureTemplates(source.w); source.step(3);
    const snapshot = captureRigWorkshop(source.state);
    const duplicate = clone(snapshot); duplicate.bodies.push(clone(duplicate.bodies[0]));
    assert.equal(restoreRigWorkshop(cold.state, duplicate, cold.physics).ok, false);
    assert.equal(cold.state.entities.size, 1);
    const id = snapshot.bodies[0].id;
    const stranger = cold.sim.spawn({ id, type: 'payload', pos: { x: 500, z: 500 }, radius: 3, mass: 10, hull: 50, data: { name: 'Foreign machinery' } });
    const before = clone(stranger);
    const rejected = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'workshop_body_id_conflict');
    assert.deepEqual(clone(stranger), before);
    assert.equal(cold.state.entities.size, 2);
  } finally { source.close(); cold.close(); }
});

test('cold restoration adopts ordinary-envelope remapped bodies and rebinds native cargo and structure to their durable tokens', async () => {
  const source = await nativeFixture(), cold = await nativeFixture();
  try {
    source.physics.ensureTemplates(source.w); source.step(3);
    const rig = source.w.rigs[0];
    const jobs = createWorkshopJobs({ state: source.state, bus: source.bus, physics: source.physics });
    const { job } = jobs.accept(source.w, 'needle'); source.step(2);
    const cargo = source.state.entities.get(job.cargoIds[0]);
    const holder = rig.partIds.map((id) => source.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'cradle');
    stageUnloadedRig(source, rig, holder, cargo);
    assert.equal(source.physics.captureCargo(source.w, rig.id, cargo.id).ok, true);
    jobs.update(source.w); source.step(2);
    const snapshot = captureRigWorkshop(source.state);
    const entityIdRemap = new Map(snapshot.bodies.map((body) => [String(body.id), body.id + 1000]));
    const adopted = new Map();
    for (const saved of snapshot.bodies) {
      const id = entityIdRemap.get(String(saved.id));
      adopted.set(id, cold.physics.spawnBody({ ...clone(saved), id }));
    }
    const result = restoreRigWorkshop(cold.state, snapshot, cold.physics, { entityIdRemap });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.restored, 0, 'the ordinary persistent envelope already created these bodies');
    for (const [id, body] of adopted) assert.equal(cold.state.entities.get(id), body);
    const mappedRig = cold.w.rigs[0], mappedCargoId = entityIdRemap.get(String(cargo.id));
    assert.deepEqual(mappedRig.partIds, rig.partIds.map((id) => entityIdRemap.get(String(id))));
    assert.equal(mappedRig.cargoIds[0], mappedCargoId);
    assert.equal(cold.w.jobs.needle.receiverId, entityIdRemap.get(String(job.receiverId)));
    assert.equal(cold.w.jobs.needle.cargo[0].id, mappedCargoId);
    assert.equal(cold.w.jobs.needle.cargo[0].token, job.cargo[0].token);
    cold.step(3);
    assert.equal(cold.physics.isCargoSecured(cold.w, mappedRig.id, mappedCargoId), true);
    assert.equal(cold.native.attachments.size, source.native.attachments.size);
    const again = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(again.ok, true, again.reason);
    assert.equal(again.restored, 0, 'durable-token adoption also works without a retained numeric map');
  } finally { source.close(); cold.close(); }
});

test('ordinary owned salvage follows a changed player ID through cold restore and remains releasable and recapturable', async () => {
  const source = await nativeFixture(), cold = await nativeFixture();
  try {
    source.physics.ensureTemplates(source.w); source.step(3);
    const rig = source.w.rigs[0];
    const holder = rig.partIds.map((id) => source.state.entities.get(id)).find((e) => e.data.rigWorkshop.partType === 'cradle');
    const cargo = source.sim.spawn({ type: 'payload', ownerId: source.player.id,
      pos: { x: holder.pos.x + 6, z: holder.pos.z }, radius: 3, mass: 20, hull: 80, hullMax: 80,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 3, mass: 20, inertiaY: 90, revision: 0 },
      data: { worldRecordId: 'owned-salvage:player-remap', payloadType: 'jettisoned_cargo', amount: 3 } });
    source.step(2);
    assert.equal(source.physics.captureCargo(source.w, rig.id, cargo.id).ok, true);
    const snapshot = captureRigWorkshop(source.state);
    cold.physics.removeBody(cold.player);
    const newPlayer = cold.sim.spawn({ id: 7001, type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8,
      mass: 100, hull: 1000, hullMax: 1000, collides: true,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100, inertiaY: 3000,
        ccd: true, revision: 0, useMeasuredSkin: false }, data: {} });
    cold.state.playerId = newPlayer.id;
    const result = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(result.ok, true, result.reason);
    cold.step(3);
    const restoredCargo = cold.state.entities.get(cargo.id), restoredRig = cold.w.rigs[0];
    assert.equal(restoredCargo.ownerId, newPlayer.id);
    assert.equal(restoredCargo.data.worldRecordId, cargo.data.worldRecordId);
    assert.equal(restoredCargo.data.amount, 3);
    assert.equal(cold.physics.isCargoSecured(cold.w, restoredRig.id, restoredCargo.id), true);
    assert.equal(cold.physics.releaseCargo(cold.w, restoredRig.id, restoredCargo.id).ok, true);
    const recaptured = cold.physics.captureCargo(cold.w, restoredRig.id, restoredCargo.id);
    assert.equal(recaptured.ok, true, recaptured.reason);
    assert.equal(cold.state.entities.get(restoredCargo.id), restoredCargo);
  } finally { source.close(); cold.close(); }
});

test('an undiscovered workshop can be saved and restored before any bodies exist', async () => {
  const source = await nativeFixture(), cold = await nativeFixture();
  try {
    source.state.rigWorkshop = freshRigWorkshop(source.state);
    const snapshot = captureRigWorkshop(source.state);
    assert.equal(snapshot.bodies.length, 0);
    assert.equal(snapshot.workshop.bench, null);
    const result = restoreRigWorkshop(cold.state, snapshot, cold.physics);
    assert.equal(result.ok, true, result.reason);
    assert.equal(cold.w.bench, null);
    assert.equal(cold.w.rigs.length, 0);
    assert.equal(cold.state.entities.size, 1);
  } finally { source.close(); cold.close(); }
});

test('synchronous and chunked save seams capture identical owned data and rejected restoration reaches the ordinary rollback owner', async () => {
  const h = await nativeFixture(), cold = await nativeFixture();
  const system = createRigWorkshopSystem(), coldSystem = createRigWorkshopSystem();
  try {
    system.init(h.sim.registry.ctx); coldSystem.init(cold.sim.registry.ctx);
    h.physics.ensureTemplates(h.w); h.step(3);
    const registry = { get(id) { return id === 'rigWorkshop' ? system : null; } };
    const coldRegistry = { get(id) { return id === 'rigWorkshop' ? coldSystem : null; } };
    const [key, captureChunk] = rigWorkshopSavePlanEntry(registry);
    const data = {};
    const synchronous = captureRigWorkshopSaveSlot(data, registry);
    assert.equal(key, 'rigWorkshop');
    assert.deepEqual(captureChunk(), synchronous);
    const protectedName = h.w.rigs[0].name;
    synchronous.workshop.rigs[0].name = 'Changed only in the captured tree';
    assert.equal(h.w.rigs[0].name, protectedName, 'autosave owns its captured tree');
    assert.equal(restoreRigWorkshopSaveSlot(data, coldRegistry).ok, true);
    assert.equal(cold.w.rigs[0].name, 'Changed only in the captured tree');
    const before = cold.w, count = cold.state.entities.size;
    const bad = clone(data); bad.rigWorkshop.workshop.stock = -1;
    assert.throws(() => restoreRigWorkshopSaveSlot(bad, coldRegistry), /restore refused: invalid_workshop_stock/);
    assert.equal(cold.w, before, 'a rejected save is not replaced with free loan rigs');
    assert.equal(cold.state.entities.size, count);
    assert.throws(() => restoreRigWorkshopSaveSlot(data, { get() { return null; } }), /save owner is not registered/);
    assert.deepEqual(restoreRigWorkshopSaveSlot({}, { get() { return null; } }), { ok: true, absent: true });
  } finally { system.destroy(); coldSystem.destroy(); h.close(); cold.close(); }
});

test('repair reuses surviving bodies and failed native reseating spends no repair stock', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs[0], body = h.state.entities.get(rig.partIds[2]), stock = h.w.stock;
    body.hull = 41;
    const repaired = h.physics.repair(h.w, rig.id);
    assert.equal(repaired.ok, true, repaired.reason);
    assert.equal(body.hull, body.hullMax);
    assert.equal(h.w.stock, stock - 1);
    assert.equal(h.state.entities.get(body.id), body);
    assert.equal(h.physics.repair(h.w, rig.id).ok, false, 'healthy rigs cannot eat stock twice');
    const edge = rig.connections[0];
    for (const id of edge.attachmentIds) h.physics.kernel.attachments.cut(id, null, 'test_impact');
    h.step(2);
    const endpoint = h.state.entities.get(edge.childId);
    endpoint.physicsBody = false;
    const before = h.w.stock;
    assert.equal(h.physics.repair(h.w, rig.id).ok, true);
    h.step(123);
    assert.equal(h.w.stock, before, 'no stock is charged for a rejected native repair');
    assert.equal(h.state.entities.get(endpoint.id), endpoint);
  } finally { h.close(); }
});

test('destroyed roots retire once and repair reconnects surviving originals without replacing or teleporting them', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs[0], oldRoot = h.state.entities.get(rig.rootId), stock = h.w.stock;
    const survivors = new Map(rig.partIds.slice(1).map((id) => [id, h.state.entities.get(id)]));
    const poses = new Map([...survivors].map(([id, e]) => [id, clone(e.pos)]));
    oldRoot.hull = 0; oldRoot.alive = false;
    h.step(2);
    assert.equal(rig.partIds.includes(oldRoot.id), false);
    assert.equal(rig.retiredParts.filter((row) => row.id === oldRoot.id).length, 1);
    assert.ok(survivors.has(rig.rootId));
    assert.equal(h.w.stock, stock, 'losing a part is not a charge or a free replacement');
    const repaired = h.physics.repair(h.w, rig.id);
    assert.equal(repaired.ok, true, repaired.reason);
    for (const [id, body] of survivors) {
      assert.equal(h.state.entities.get(id), body);
      assert.deepEqual(clone(body.pos), poses.get(id), 'repair does not snap survivors to a template');
    }
    h.step(3);
    assert.equal(h.w.stock, stock - 1);
    assert.ok(rig.connections.every((edge) => edge.state === 'active'));
    assert.equal(rig.partIds.length, survivors.size);
    assert.equal(rig.retiredParts.filter((row) => row.id === oldRoot.id).length, 1);
    assert.equal(h.physics.ensureTemplates(h.w).ok, true);
    assert.equal(rig.partIds.includes(oldRoot.id), false, 'the loan template cannot resurrect the root');
  } finally { h.close(); }
});

test('complete loss keeps the rig identity and a new keel costs stock only after native admission, with undo', async () => {
  const h = await nativeFixture();
  const system = createRigWorkshopSystem();
  try {
    system.init(h.sim.registry.ctx);
    h.physics.ensureTemplates(h.w); h.step(3);
    const rig = h.w.rigs[0], id = rig.id, name = rig.name, stock = h.w.stock;
    const lost = [...rig.partIds];
    const oldBodies = lost.map((partId) => h.state.entities.get(partId));
    const oldTokens = oldBodies.map((body) => body.data.rigWorkshop.token);
    for (const partId of lost) { const e = h.state.entities.get(partId); e.hull = 0; e.alive = false; }
    h.step(2);
    assert.equal(rig.partIds.length, 0); assert.equal(rig.rootId, null);
    assert.equal(h.physics.ensureTemplates(h.w).ok, true);
    assert.equal(rig.partIds.length, 0, 'complete loss cannot mint another loan template');
    const preview = h.physics.previewEdit(h.w, { rigId: rig.id, partType: 'frame', mount: 'front' });
    assert.equal(preview.ok, true, preview.reason); assert.equal(preview.preview.seed, true);
    const edit = h.physics.commitPreview(h.w);
    assert.equal(edit.ok, true, edit.reason); assert.equal(h.w.stock, stock);
    h.step(3);
    assert.equal(h.w.stock, stock - 1);
    assert.equal(rig.id, id); assert.equal(rig.name, name);
    assert.ok(h.native.records.has(edit.bodyId));
    const newKeel = h.state.entities.get(edit.bodyId);
    assert.equal(oldBodies.includes(newKeel), false);
    assert.equal(oldTokens.includes(newKeel.data.rigWorkshop.token), false,
      'a reclaimed replacement has a new durable identity even if the numeric slot is recycled');
    assert.equal(rig.rootId, edit.bodyId);
    assert.equal(h.physics.undoEdit(h.w).ok, true);
    assert.equal(h.w.stock, stock); assert.equal(rig.partIds.length, 0);
    assert.equal(h.physics.undoEdit(h.w).ok, false);
    system.dispatch('open');
    const bench = clone(h.w.prompt);
    assert.equal(system.choose({ promptId: bench.id, revision: bench.revision, choiceId: 'edit' }), true);
    const parts = clone(h.w.prompt);
    assert.equal(parts.options.find((o) => o.id === 'part:frame').disabled, false);
    assert.equal(parts.options.find((o) => o.id === 'part:mover').disabled, true);
    assert.equal(system.choose({ promptId: parts.id, revision: parts.revision, choiceId: 'part:frame' }), true);
    assert.equal(h.w.preview.seed, true, 'the ordinary deck reaches a new keel without a missing parent');
    const previewCard = clone(h.w.prompt);
    assert.equal(system.choose({ promptId: previewCard.id, revision: previewCard.revision, choiceId: 'commit' }), true);
    h.step(3);
    assert.equal(rig.partIds.length, 1);
    assert.equal(h.w.stock, stock - 1);
  } finally { system.destroy(); h.close(); }
});
