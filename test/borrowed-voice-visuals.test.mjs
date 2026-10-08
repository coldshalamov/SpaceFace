import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { setPresentationAdmission, PRESENTATION_ADMISSION } from '../src/core/presentationAdmission.js';
import { BORROWED_VOICE as C } from '../src/data/borrowedVoice.js';
import { borrowedVoiceRingBody, borrowedVoiceRecorderBody, borrowedVoiceRingRadius,
  borrowedVoiceRecorderRadius } from '../src/data/borrowedVoiceBody.js';
import { borrowedVoice, borrowedVoicePresentation } from '../src/systems/borrowedVoice.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { createBorrowedVoiceVisualDriver, BORROWED_VOICE_FAN_NODES,
  BORROWED_VOICE_RECEIVER_NODE } from '../src/render/borrowedVoiceVisuals.js';

const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const bankFor = key => JSON.parse(readFileSync(new URL(`../assets/ships/motions/borrowed-voice-${key}.motion.json`, import.meta.url)));
function fixture(key = 'a') {
  const native = { tick: 880, _simTick: 120, records: new Map(), staticRecords: new Map() };
  const physics = { name: 'physics', init() { this._sg02 = native; } };
  const sim = createSimulation({ seed: 1616, systems: [physics, borrowedVoice] }), state = sim.state;
  state.mode = 'flight'; state.tick = 120; state.simTime = 2; state.world.currentSectorId = C.sectorId;
  state.world.alienEcology = { revelation: 2 };
  const player = sim.spawn({ type: 'ship', radius: 1, mass: 12, hull: 100,
    pos: { x: C.center.x + 3, z: C.center.z - 6 }, data: {} }); state.playerId = player.id;
  const owner = sim.registry.get('borrowedVoice'); owner.update(1 / 60, state);
  const ring = owner._find('ring'), a = owner._find('a');
  a.pos.set(ring.pos.x + 7, 0, ring.pos.z); a.rot = Math.PI;
  const views = [], scene = new THREE.Scene(); state.render.scene = scene;
  // The fixture supplies mounted authored sources, as the browser loader now does
  // for both the ring and its recorder payloads before reception is admitted.
  for (const entity of state.entityList) if (entity.data?.persistenceOwner === C.owner)
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
  function solved(tick = state.tick) {
    state.tick = tick; state.simTime = tick / 60; native.tick++; native._simTick = tick;
    for (const entity of state.entityList) {
      if (!entity.physicsBody) continue;
      // SG02 keeps static compound bodies in its canonical records map too.
      const map = native.records;
      let record = map.get(entity.id);
      if (!record) { record = { entity, body: { handle: entity.id + 40 } }; map.set(entity.id, record); }
      record.entity = entity; record.proxyId = entity.physicsBody.collisionProxyManifest?.id;
      record.revision = entity.physicsBody.revision; record._postStepReadTick = native.tick;
    }
  }
  function sample(tick = state.tick) { solved(tick); owner._sample(); }
  sample();
  function addVisual(kind) {
    const entity = owner._find(kind), root = new THREE.Group(), nodes = {};
    for (const binding of bankFor(kind).bindings) {
      const node = new THREE.Group(); node.name = binding.node; node.position.fromArray(binding.restPose.translation);
      node.quaternion.fromArray(binding.restPose.rotation); root.add(node); nodes[node.name] = node;
    }
    const original = new THREE.MeshStandardMaterial({ emissive: 0x578a90, emissiveIntensity: 6.6 });
    original.name = 'Material_Emissive_Cyan'; const traces = [];
    for (let i = 0; i < (kind === 'ring' ? 5 : 1); i++) {
      const node = new THREE.Mesh(new THREE.BoxGeometry(1, .035, .075), original);
      node.name = kind === 'ring' ? `LOD0_HOOK_BORROWED_SIGNAL_${i + 1}_Trace` : 'ActualSignalNotch';
      root.add(node); traces.push(node);
    }
    root.userData.borrowedVoiceAuthoredSource = { assetId: entity.data.authoredAssetId,
      file: `assets/ships/release/parts/wholeships/borrowed_voice_${kind}.glb` };
    scene.add(root); entity.mesh = root;
    let driver = createBorrowedVoiceVisualDriver(root, entity);
    const view = { entity, root, nodes, traces, original,
      step(a11y = {}) { driver.update(entity, state.simTime, a11y, state); },
      reopen() { driver.dispose(); driver = createBorrowedVoiceVisualDriver(root, entity); },
      close() { driver.dispose(); for (const trace of traces) trace.geometry.dispose(); original.dispose(); } };
    views.push(view); return view;
  }
  const main = addVisual(key);
  function recover() {
    for (let tick = state.tick + 12, end = state.tick + 72; tick <= end; tick += 12) sample(tick);
    const result = owner.inspect(a.id); assert.equal(result.recovered, true); return result;
  }
  return { sim, state, native, owner, player, ring, a, scene, main, views, solved, sample, recover, addVisual,
    close() { for (const view of views) view.close(); sim.dispose(); } };
}

test('real native ring retains five convex segments and empty missing space; each source housing is an independent8-mass body', async () => {
  const sim = createSimulation({ seed: 1616, systems: [] }), native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  try {
    const ring = sim.spawn({ type: 'wreck', radius: borrowedVoiceRingRadius, mass: 1e9, hull: 600,
      pos: { x: 0, z: 0 }, physicsBody: borrowedVoiceRingBody(), data: {} });
    const recorders = ['a', 'b', 'c'].map((id, i) => sim.spawn({ type: 'payload', radius: borrowedVoiceRecorderRadius(id),
      mass: 8, hull: 35, pos: { x: 50 + i * 10, z: 0 }, physicsBody: borrowedVoiceRecorderBody(id), data: {} }));
    native.syncFromEntities(sim.state.entityList); native.step(1 / 60);
    const ringRecord = native.records.get(ring.id); assert(ringRecord); assert.equal(ringRecord.colliders.length, 5);
    assert.equal(ringRecord.body.isDynamic(), false);
    const contains = (x, z) => ringRecord.colliders.some(c => c.containsPoint({ x, y: 0, z }));
    assert.equal(contains(0, 0), false); assert.equal(contains(5, 0), false);
    assert.equal(contains(0, 17), false, 'the three missing eighths are actual empty native space');
    assert.equal(contains(16 * Math.cos(Math.PI / 8), -16 * Math.sin(Math.PI / 8)), true);
    for (const recorder of recorders) {
      const record = native.records.get(recorder.id); assert.equal(record.colliders.length, 1);
      assert(record.body.isDynamic()); assert(Math.abs(record.body.mass() - 8) < 1e-5);
      const p = record.colliders[0]; assert(p.containsPoint({ x: recorder.pos.x, y: 0, z: 0 }));
      assert.equal(p.containsPoint({ x: recorder.pos.x + 2.1, y: 0, z: 0 }), false);
    }
  } finally { native.dispose(); sim.dispose(); }
});

test('the source-aligned proxies and sealed supported pivots survive all three authored tiers', () => {
  for (const key of ['ring', 'a', 'b', 'c']) {
    const contract = JSON.parse(readFileSync(new URL(`../assets/ships/forge/sources/borrowed_voice_${key}/measured-contract.json`, import.meta.url)));
    const body = key === 'ring' ? borrowedVoiceRingBody() : borrowedVoiceRecorderBody(key), bank = bankFor(key);
    validateMotionBank(bank); assert.equal(body.revision, 0);
    assert.deepEqual(bank.bindings.map(b => b.node).sort(), key === 'ring' ? [...BORROWED_VOICE_FAN_NODES].sort() : [BORROWED_VOICE_RECEIVER_NODE]);
    for (const part of body.collisionProxyManifest.convexParts) {
      const points = contract.collision.components.find(c => c.id === part.id).verticesGltf;
      for (const p of part.points) assert(points.some(v => Math.abs(v[0] - p.x * body.radius) < 1e-5 && Math.abs(v[2] - p.z * body.radius) < 1e-5));
    }
    for (const suffix of ['', '_lod1', '_lod2']) {
      const bytes = readFileSync(new URL(`../assets/ships/parts/wholeships/borrowed_voice_${key}${suffix}.glb`, import.meta.url));
      const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      for (const binding of bank.bindings) {
        const node = doc.nodes.find(n => n.name === binding.node); assert(node);
        assert.deepEqual(node.translation || [0, 0, 0], binding.restPose.translation);
        assert.deepEqual(node.rotation || [0, 0, 0, 1], binding.restPose.rotation);
      }
    }
  }
});

test('real measured reception controls signal and attached tissue; cosmetic motion cannot improve orientation or evidence', () => {
  const h = fixture(); try {
    const host = h.addVisual('ring'), quality = borrowedVoicePresentation(h.state, h.a).quality; assert(quality > .9);
    h.main.step(); host.step(); near(h.main.traces[0].material.emissiveIntensity, 6.6 * (.04 + .96 * quality));
    near(borrowedVoicePresentation(h.state, h.ring).quality, quality);
    assert(host.nodes.MOTION_BORROWED_VOICE_FAN_1.quaternion.angleTo(new THREE.Quaternion()) > .04);
    const orientation = h.a.rot, before = h.owner.serialize(); h.main.step(); host.step();
    assert.equal(h.a.rot, orientation); assert.deepEqual(h.owner.serialize(), before);
    h.a.rot = 0; h.sample(132); h.main.step(); host.step(); assert.equal(borrowedVoicePresentation(h.state, h.a).quality, 0);
    h.sample(204); h.main.step(); host.step(); near(h.main.traces[0].material.emissiveIntensity, 6.6 * .04);
    near(host.nodes.MOTION_BORROWED_VOICE_FAN_1.quaternion.angleTo(new THREE.Quaternion()), 0);
  } finally { h.close(); }
});

test('one actual recovered fragment traverses the host wire once; locating, forged events and cold mounting never replay it', () => {
  const h = fixture('ring'); try {
    h.main.step(); const base = h.main.traces[0].material.emissiveIntensity;
    assert.equal(h.owner.inspect(h.ring.id).ok, true); h.main.step(); near(h.main.traces[0].material.emissiveIntensity, base);
    h.sim.bus.emit('borrowedVoice:fragmentRecovered', { id: 'invented', revision: 100 }); h.main.step();
    near(h.main.traces[0].material.emissiveIntensity, base);
    h.recover(); h.main.step(); h.sample(210); h.main.step();
    assert(h.main.traces[0].material.emissiveIntensity > base + 2); near(h.main.traces[1].material.emissiveIntensity, base);
    h.sample(246); h.main.step(); assert(h.main.traces[1].material.emissiveIntensity > base + 2);
    h.main.reopen(); h.main.step(); near(h.main.traces[1].material.emissiveIntensity, base);
    assert.equal(h.owner.inspect(h.a.id).recovered, true); h.sample(372); h.main.step();
    for (const trace of h.main.traces) near(trace.material.emissiveIntensity, base);
  } finally { h.close(); }
});

test('only accepted quarantine silences the artifact; the visible physical sources stay present and a reload remains silent', () => {
  const h = fixture('ring'); try {
    const recorder = h.addVisual('a'); h.main.step(); recorder.step();
    assert.equal(h.owner.choose('quarantine', h.owner._row.evidenceRevision).ok, false);
    assert(recorder.traces[0].material.emissiveIntensity > 0);
    h.recover(); h.main.step(); recorder.step(); const held = h.main.nodes.MOTION_BORROWED_VOICE_FAN_1.quaternion.clone();
    assert.equal(h.owner.choose('quarantine', h.owner._row.evidenceRevision).ok, true); h.main.step(); recorder.step();
    for (const trace of [...h.main.traces, ...recorder.traces]) near(trace.material.emissiveIntensity, 0);
    h.sample(240); h.main.step(); recorder.step(); near(h.main.nodes.MOTION_BORROWED_VOICE_FAN_1.quaternion.angleTo(held), 0);
    assert.equal(h.ring.alive, true); assert.equal(h.a.alive, true); assert.equal(h.a.mass, 8); assert.equal(h.a.physicsBody.dynamic, true);
    assert.equal(h.main.root.visible, true); assert.equal(recorder.root.visible, true);
    const saved = h.owner.serialize(); h.owner.deserialize(saved); h.owner.afterContinue(); h.main.reopen(); recorder.reopen();
    h.main.step(); recorder.step(); near(recorder.traces[0].material.emissiveIntensity, 0);
    near(h.main.nodes.MOTION_BORROWED_VOICE_FAN_1.quaternion.angleTo(new THREE.Quaternion()), 0);
  } finally { h.close(); }
});

test('source/life/native freshness and reduced motion prevent stale signal or delayed memory strokes', () => {
  const h = fixture('ring'); try {
    h.main.step(); const record = h.native.records.get(h.a.id);
    record._postStepReadTick--; h.main.step(); near(h.main.traces[0].material.emissiveIntensity, 0);
    h.sample(121); h.main.step(); h.sample(122); h.main.step(); assert(h.main.traces[0].material.emissiveIntensity > 0);
    h.main.root.visible = false; h.sample(123); h.main.step(); near(h.main.traces[0].material.emissiveIntensity, 0);
    h.main.root.visible = true; h.main.step(); h.recover(); h.main.step({ reducedMotion: true, reducedFlash: true });
    const base = h.main.traces[0].material.emissiveIntensity; h.sample(213); h.main.step(); near(h.main.traces[0].material.emissiveIntensity, base);
    h.main.root.userData.borrowedVoiceAuthoredSource.file = 'assets/ships/parts/wholeships/borrowed_voice_ring.glb';
    h.main.step(); near(h.main.traces[0].material.emissiveIntensity, 0);
    h.main.root.userData.borrowedVoiceAuthoredSource.file = 'assets/ships/release/parts/wholeships/borrowed_voice_ring.glb';
    h.main.step(); h.scene.remove(h.main.root); h.main.step(); near(h.main.traces[0].material.emissiveIntensity, 0);
    h.scene.add(h.main.root); h.main.step(); h.ring.occupantGeneration++; h.main.step(); near(h.main.traces[0].material.emissiveIntensity, 0);
  } finally { h.close(); assert.equal(h.main.traces[0].material, h.main.original); }
});
