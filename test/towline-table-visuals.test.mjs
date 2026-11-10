import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { towlineTable, towlineCrewPresentation } from '../src/systems/towlineTable.js';
import { TOWLINE_TABLE as C, TOWLINE_MEMBERS } from '../src/data/towlineTable.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { createTowlineTableVisualDriver, TOWLINE_MOTION_NODES } from '../src/render/towlineTableVisuals.js';

let flags;
test.before(() => { flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(flags));
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const angle = (node, axis) => new THREE.Euler().setFromQuaternion(node.quaternion)[axis];

// Real Towline owner/attachment transactions with a controlled native-read seam.
// Native force/convex construction is covered by the owner's physical-body tests.
function fixture(memberId) {
  const native = { tick: 900, _simTick: 120, records: new Map() }, handles = new Map();
  const physics = { name: 'physics', init() { this._sg02 = native; this._diag = { backend: 'rapier-dynamic', sg02Ready: true }; } };
  const sim = createSimulation({ seed: 806, systems: [ships, spawnBudget, physics, npcJobsRuntime, towlineTable], helpers: {
    combatPhysics: {
      createAttachment(request) { const handle = { id: request.attachmentId }; handles.set(request.attachmentId, handle); return handle; },
      cutAttachment(request) { return handles.delete(request.attachmentId); },
      getAttachmentTelemetry(request) { return handles.get(request.attachmentId) || null; },
    },
  } });
  const state = sim.state; state.mode = 'flight'; state.tick = 120; state.simTime = 2; state.world.currentSectorId = C.sectorId;
  sim.registry.get('ships').newGame();
  state.missions = { completedLog: [{ type: 'salvage_retrieval', success: 1, count: 1, totalCr: 0 }] };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, pos: { x: 0, z: 330 }, fittings: [] }));
  state.playerId = player.id;
  const station = sim.spawn({ type: 'station', team: 2, pos: { x: 0, z: 0 }, radius: 40, mass: 1e9, hull: 1e9,
    physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 40, mass: 1e9 },
    data: { stationId: C.stationId, dockRadius: 110 } });
  const owner = sim.registry.get('towlineTable'); owner.update(1 / 60, state);
  function solved(tick = state.tick) {
    state.tick = tick; state.simTime = tick / 60; native.tick++; native._simTick = tick;
    for (const e of state.entityList) {
      let record = native.records.get(e.id);
      if (!record) { record = { entity: e, body: { handle: e.id + 10 } }; native.records.set(e.id, record); }
      record.entity = e; record.proxyId = e.physicsBody?.collisionProxyManifest?.id; record.revision = e.physicsBody?.revision || 0;
      record._postStepReadTick = native.tick;
    }
  }
  solved();
  const entity = owner._find(memberId), member = TOWLINE_MEMBERS.find(m => m.id === memberId);
  assert.equal(towlineCrewPresentation(state, entity).nativeBodyReady, true);
  const root = new THREE.Group(), scene = new THREE.Scene(), nodes = {};
  const bank = JSON.parse(readFileSync(new URL(`../assets/ships/motions/towline-${memberId}.motion.json`, import.meta.url)));
  for (const binding of bank.bindings) {
    const node = new THREE.Group(); node.name = binding.node; node.position.fromArray(binding.restPose.translation);
    node.quaternion.fromArray(binding.restPose.rotation); nodes[node.name] = node; root.add(node);
  }
  // Kit's empty patient mounts are authored static geometry, never receipt-driven cargo.
  for (const name of ['EmptyPatientMount-1', 'EmptyPatientMount1']) { const mount = new THREE.Group(); mount.name = name; root.add(mount); }
  root.userData.towlineAuthoredSource = { assetId: member.assetId, file: `assets/ships/release/parts/wholeships/towline_${memberId}.glb` };
  scene.add(root); entity.mesh = root; state.render.scene = scene;
  let driver = createTowlineTableVisualDriver(root, entity);
  const kernel = getCombatKernel(owner.ctx);
  function attach(a = entity, b = owner._find(memberId, 'cleanup')) {
    const result = kernel.attachments.create({ defId: 'attachment_massline', ownerId: a.id, targetId: b.id,
      sourceWorld: a.pos, targetWorld: b.pos }); assert.equal(result.ok, true, result.reason); return result.attachment;
  }
  function receiver(e) {
    const anchor = resolveDockAnchor(station, resolveCollisionProxyManifest(station), e) || { x: 70, z: 0 };
    e.pos.set(anchor.x, 0, anchor.z); e.vel.set(0, 0, 0);
  }
  function earn() {
    const body = owner._find(memberId, 'cleanup'); player.pos.set(body.pos.x + 35, 0, body.pos.z);
    const result = owner.take(memberId, owner._row.revision); assert.equal(result.ok, true, result.reason);
    receiver(player); receiver(body); body.pos.x += 20; receiver(entity); entity.pos.z += 65; solved(); attach(player, body);
    const receipt = owner.deliver(memberId, owner._row.revision); assert.equal(receipt.ok, true, receipt.reason); return receipt;
  }
  return { sim, state, native, handles, owner, entity, root, scene, nodes, solved, attach, earn, kernel,
    step(a11y = {}, now = state.simTime) { driver.update(entity, now, a11y, state); },
    reopen() { driver.dispose(); driver = createTowlineTableVisualDriver(root, entity); },
    close() { driver.dispose(); sim.dispose(); } };
}

test('all crew source tiers retain their sealed mechanisms at real authored support pivots', () => {
  for (const member of TOWLINE_MEMBERS) {
    const bank = JSON.parse(readFileSync(new URL(`../assets/ships/motions/towline-${member.id}.motion.json`, import.meta.url)));
    validateMotionBank(bank);
    assert.deepEqual(bank.bindings.map(b => b.node).sort(), [...TOWLINE_MOTION_NODES[member.id]].sort());
    for (const suffix of ['', '_lod1', '_lod2']) {
      const bytes = readFileSync(new URL(`../assets/ships/parts/wholeships/towline_${member.id}${suffix}.glb`, import.meta.url));
      const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      for (const binding of bank.bindings) {
        const node = doc.nodes.find(n => n.name === binding.node); assert(node);
        assert.deepEqual(node.translation || [0, 0, 0], binding.restPose.translation);
        assert.deepEqual(node.rotation || [0, 0, 0, 1], binding.restPose.rotation);
      }
    }
  }
});

test('Mara closes only her recessed cosmetic shoes on an actual current native joint', () => {
  const h = fixture('mara'); try {
    h.step(); near(angle(h.nodes.MOTION_TOWLINE_JAW_PORT, 'y'), 0);
    const line = h.attach(); h.step(); h.solved(131); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_JAW_PORT, 'y'), 2 * Math.PI / 180);
    near(angle(h.nodes.MOTION_TOWLINE_JAW_STARBOARD, 'y'), -2 * Math.PI / 180);
    const body = structuredClone(h.entity.physicsBody);
    h.kernel.attachments.cut(line.id, h.entity.id, 'visual-fixture-release'); h.step(); h.solved(142); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_JAW_PORT, 'y'), 0); assert.deepEqual(h.entity.physicsBody, body);
    h.attach(); h.step({ reducedMotion: true }); near(angle(h.nodes.MOTION_TOWLINE_JAW_PORT, 'y'), 2 * Math.PI / 180);
    h.handles.clear(); h.step(); h.solved(153); h.step(); near(angle(h.nodes.MOTION_TOWLINE_JAW_PORT, 'y'), 0);
  } finally { h.close(); }
});

test('Odo integrates signed real payout about the source axle; pause, line rebind and gaps cannot invent turns', () => {
  const h = fixture('odo'); try {
    const load = h.owner._find('odo', 'cleanup'); h.entity.pos.set(100, 0, 200); load.pos.set(170, 0, 200);
    h.entity.vel.set(0, 0, 0); load.vel.set(2.4, 0, 0); h.solved(); h.step(); h.solved(121); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0);
    const line = h.attach(); h.step(); h.solved(122); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), -1 / 60);
    h.step({}, 100); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), -1 / 60);
    load.vel.x = -2.4; h.solved(123); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0);
    h.solved(124); h.step({ reducedMotion: true }); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0);
    h.solved(400); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0);
    h.kernel.attachments.cut(line.id, h.entity.id, 'visual-fixture-release'); h.solved(401); h.step();
    h.attach(); h.solved(402); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0);
    h.solved(403); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 1 / 60);
    h.handles.clear(); h.solved(404); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 1 / 60);
  } finally { h.close(); }
});

test('Kit acknowledges one accepted witnessed receipt, keeps berths empty, and does not replay on cold mount', () => {
  const h = fixture('kit'); try {
    h.step(); const staticMounts = ['EmptyPatientMount-1', 'EmptyPatientMount1'].map(name => h.root.getObjectByName(name));
    h.sim.bus.emit('towlineTable:cleanupAccepted', { memberId: 'kit', receipt: { id: 'invented' } });
    h.solved(121); h.step(); near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
    const accepted = h.earn(); assert.equal(towlineCrewPresentation(h.state, h.entity).receiptId, accepted.receipt.id);
    h.step(); h.solved(143); h.step(); assert(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z') < -.13);
    h.solved(165); h.step(); near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
    h.sim.bus.emit('towlineTable:cleanupAccepted', { memberId: 'kit', receipt: accepted.receipt }); h.solved(166); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
    h.reopen(); h.step(); h.solved(188); h.step(); near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
    for (const mount of staticMounts) { assert.equal(mount.children.length, 0); near(mount.quaternion.angleTo(new THREE.Quaternion()), 0); }
  } finally { h.close(); }
});

test('stale native/source/life/scene facts stop the mechanism and fresh visibility never catches up hidden payout', () => {
  const h = fixture('odo'); try {
    const load = h.owner._find('odo', 'cleanup'); h.entity.pos.set(100, 0, 200); load.pos.set(170, 0, 200);
    load.vel.set(2.4, 0, 0); h.attach(); h.step(); h.solved(121); h.step();
    const initial = angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'); assert(initial < 0);
    h.solved(122); h.native.records.get(load.id)._postStepReadTick--;
    h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.solved(123); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.state.tick += 3; h.state.simTime = h.state.tick / 60; h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.solved(127); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.root.visible = false; h.solved(128); h.step(); h.root.visible = true; h.solved(129); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    const record = h.native.records.get(h.entity.id); record.proxyId = 'foreign'; h.solved(130); record.proxyId = 'foreign'; h.step();
    near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.solved(131); h.step(); h.root.userData.towlineAuthoredSource.file = 'assets/ships/parts/wholeships/towline_odo.glb';
    h.solved(132); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.root.userData.towlineAuthoredSource.file = 'assets/ships/release/parts/wholeships/towline_odo.glb';
    h.solved(133); h.step(); h.scene.remove(h.root); h.solved(134); h.step(); h.scene.add(h.root); h.solved(135); h.step();
    near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
    h.entity.occupantGeneration++; h.solved(136); h.step(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), initial);
  } finally { h.close(); near(angle(h.nodes.MOTION_TOWLINE_WINCH, 'z'), 0); }
});

test('reduced motion consumes Kit acknowledgement without a delayed success gesture', () => {
  const h = fixture('kit'); try {
    h.step(); h.solved(121); h.earn(); h.step({ reducedMotion: true });
    h.solved(143); h.step(); near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
    h.owner.deserialize(h.owner.serialize()); h.owner.afterContinue(); h.step();
    h.solved(144); h.step(); near(angle(h.nodes.MOTION_TOWLINE_ACKNOWLEDGE, 'z'), 0);
  } finally { h.close(); }
});
