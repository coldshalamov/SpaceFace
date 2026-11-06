import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANVIL_ORCHARD, createOrchardRecord, normalizeOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec, orchardPodBodySpec } from '../src/data/anvilOrchardBody.js';
import { createOrchardWorkGuides } from '../src/render/anvilOrchardGuides.js';
import { createOrchardVisualDriver } from '../src/render/anvilOrchardVisuals.js';
import { ORCHARD_FRAME_FILE } from '../src/data/anvilOrchardIdentity.js';
import { registerOrchardPoseReader } from '../src/core/orchardPoseReader.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';

function fixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const frame = { id: 2, occupantGeneration: 1, type: 'wreck', alive: true, radius: G.radius,
    pos: { x: 100, z: 0 }, hull: 100, physicsBody: orchardFrameBodySpec(),
    data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
      placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
      masslineTetherable: false } };
  root.position.set(frame.pos.x, 0, frame.pos.z); scene.updateMatrixWorld(true);
  const row = createOrchardRecord(0);
  row.sourceRemaining = 44;
  row.lots.push({ id: 'anvil_storm_orchard:0:1', socket: 0, cycle: 1, units: 4, outcome: 'retained' });
  Object.assign(row.sockets[0], { cycle: 1, lotId: row.lots[0].id, status: 'stowed' });
  assert.ok(normalizeOrchardRecord(row));
  const state = { mode: 'flight', tick: 1, world: { currentSectorId: ANVIL_ORCHARD.sectorId },
    player: { targetId: frame.id }, entities: new Map([[frame.id, frame]]), render: { scene },
    sites: { anvilOrchard: row }, ui: { componentSelection: { targetId: frame.id,
      stableKey: stableEntityKey(frame), componentId: 'orchard_socket_0' } }, planet: { center: { x: 0, z: 0 } },
    entityIndex: { ready: true, byWorldRecordIdCount: new Map(), byWorldRecordId: new Map() } };
  const guides = createOrchardWorkGuides(root);
  const group = root.getObjectByName('OrchardWorkGuides');
  const pose = Object.freeze({});
  return { scene, root, frame, row, state, guides, group, pose };
}
function release(f) {
  f.state.tick = 30;
  Object.assign(f.row.sockets[0], { status: 'drifting', operation: 'open', progress: 30,
    acceptedTick: 0, completedTick: 30, openedTick: 30, readyTick: 30, handoff: 'ready', targetRevision: 2 });
  assert.ok(normalizeOrchardRecord(f.row));
  const pod = { id: 3, occupantGeneration: 2, type: 'payload', alive: true, radius: G.pod.radius,
    pos: { x: 130, z: 0 }, physicsBody: orchardPodBodySpec({ dynamic: true, revision: 2 }),
    data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'pod', worldRecordId: f.row.lots[0].id,
      identityKey: f.row.lots[0].id, authoredAssetId: G.pod.assetId, authoredPayloadAssetId: G.pod.assetId } };
  pod.mesh = new THREE.Group(); pod.mesh.position.set(130, 0, 0); f.scene.add(pod.mesh); f.scene.updateMatrixWorld(true);
  f.state.entities.set(pod.id, pod);
  f.state.entityIndex.byWorldRecordIdCount.set(pod.data.worldRecordId, 1);
  f.state.entityIndex.byWorldRecordId.set(pod.data.worldRecordId, pod);
  return pod;
}

test('selected real component highlights its actual authored socket and opening progress', () => {
  const f = fixture(), socket = f.group.getObjectByName('OrchardSocketGuide1');
  f.guides.update(f.frame, f.state, f.pose);
  assert.equal(f.group.visible, true);
  assert.deepEqual(socket.position.toArray(), [G.sockets[0].position[0], 18, G.sockets[0].position[2]]);
  assert.equal(socket.userData.guideSelected, true);
  assert.equal(socket.userData.guideStatus, 'stowed');
  assert.equal(socket.children[1].visible, false);
  const calmMaterial = socket.children[0].material;
  f.state.tick = 600;
  f.guides.update(f.frame, f.state, f.pose);
  assert.notEqual(socket.children[0].material, calmMaterial, 'the selected socket shows forecast immediately');
  f.state.tick = 1;
  f.state.tick = 9;
  Object.assign(f.row.sockets[0], { status: 'releasing', operation: 'opening', progress: 9, acceptedTick: 0, completedTick: 9 });
  assert.ok(normalizeOrchardRecord(f.row));
  f.guides.update(f.frame, f.state, f.pose);
  assert.equal(socket.children[1].visible, true);
  assert.equal(socket.children[1].geometry.drawRange.count, 18);
  f.state.ui.componentSelection = { targetId: f.frame.id, stableKey: 'wr:other', componentId: 'orchard_socket_0' };
  f.guides.update(f.frame, f.state, f.pose);
  assert.equal(socket.userData.guideSelected, false, 'stale identity cannot select a new occupant');
  f.guides.dispose();
});

test('outward cue follows the single released live pod and disappears on loss, replacement, or disposal', () => {
  const f = fixture(), pod = release(f), arrow = f.group.getObjectByName('OrchardPodOutwardGuide');
  f.guides.update(f.frame, f.state, f.pose);
  assert.equal(arrow.visible, true);
  assert.deepEqual(arrow.position.toArray(), [30, 10, 0]);
  pod.pos.z = 20; pod.mesh.position.z = 20; f.scene.updateMatrixWorld(true);
  f.guides.update(f.frame, f.state, f.pose);
  assert.equal(arrow.position.z, 20);
  assert.ok(arrow.rotation.y < 0, 'arrow points radially away from the planet');
  f.state.entityIndex.byWorldRecordIdCount.set(pod.data.worldRecordId, 2);
  f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false);
  f.state.entityIndex.byWorldRecordIdCount.set(pod.data.worldRecordId, 1);
  pod.alive = false; f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false);
  pod.alive = true; f.state.entities.delete(pod.id);
  f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false);
  f.state.entities.set(pod.id, pod); f.state.entityIndex.ready = false;
  f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false, 'shelved pods get no proxy cue');
  f.state.entityIndex.ready = true; f.row.lots[0].outcome = 'delivered'; f.row.sockets[0].status = 'delivered';
  f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false, 'handed-back pods get no stale cue');
  f.guides.dispose(); assert.equal(f.root.getObjectByName('OrchardWorkGuides'), undefined);
});

test('the guides withdraw on invalid record, sector, selection, native pose or hidden pod mesh', () => {
  const f = fixture(), pod = release(f), arrow = f.group.getObjectByName('OrchardPodOutwardGuide');
  f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, true);
  pod.mesh.visible = false; f.guides.update(f.frame, f.state, f.pose); assert.equal(arrow.visible, false);
  pod.mesh.visible = true; f.state.player.targetId = 999; f.guides.update(f.frame, f.state, f.pose); assert.equal(f.group.visible, false);
  f.state.player.targetId = f.frame.id; f.guides.update(f.frame, f.state, null); assert.equal(f.group.visible, false);
  f.state.world.currentSectorId = 'sector_helios_prime'; f.guides.update(f.frame, f.state, f.pose); assert.equal(f.group.visible, false);
  f.state.world.currentSectorId = ANVIL_ORCHARD.sectorId; f.row.frameStatus = 'destroyed';
  f.guides.update(f.frame, f.state, f.pose); assert.equal(f.group.visible, false);
  f.guides.dispose();
});

test('the production native-pose lease owns and withdraws the guide on residency loss', () => {
  const f = fixture();
  f.guides.dispose();
  for (const rig of G.rigs) {
    const node = new THREE.Group(); node.name = rig.node; node.position.fromArray(rig.pivotGltf); f.root.add(node);
  }
  f.root.userData.orchardAuthoredSource = { assetId: G.assetId,
    file: `assets/ships/release/parts/${ORCHARD_FRAME_FILE}`,
    sourceSha: G.sourceSha, sourceGlbSha256: G.sourceGlbSha256 };
  f.frame.mesh = f.root;
  const pose = Object.freeze({ kind: 'pose-only', sourceSha: G.sourceSha, bindingRevision: 1,
    completedNativeTick: null, progress: Object.freeze([0, 0, 0]) });
  registerOrchardPoseReader(f.state, { readOrchardFramePose: () => pose });
  const driver = createOrchardVisualDriver(f.root, f.frame);
  assert.ok(driver);
  driver.update(f.frame, 0, {}, f.state);
  assert.equal(f.root.getObjectByName('OrchardWorkGuides').visible, true);
  f.state.entities.delete(f.frame.id);
  driver.update(f.frame, 0, {}, f.state);
  assert.equal(f.root.getObjectByName('OrchardWorkGuides').visible, false);
  f.state.entities.set(f.frame.id, f.frame);
  driver.update(f.frame, 0, {}, f.state);
  assert.equal(f.root.getObjectByName('OrchardWorkGuides').visible, true);
  driver.dispose();
  assert.equal(f.root.getObjectByName('OrchardWorkGuides'), undefined);
});
