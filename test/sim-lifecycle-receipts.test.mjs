import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { projectBridgeEvent, flattenEventPayload, resolveEventEntityRef } from '../scripts/lib/simEventBridge.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { destructionReceiptMatchesPresentationOwner } from '../src/render/renderer.js';
import { createPlayerTruthLifeTracker, createPlayerTruthDrawIdentity, installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';
import { checkPopping, checkLodChurn, CLS, VIS } from '../scripts/player-truth/checks.mjs';

test('plain position-bearing receipts keep their meaning while actual entities become life-qualified refs', () => {
  const entity = makeEntity({ id: 391, type: 'asteroid', pos: { x: -1831.8, z: -2252 } });
  stampOccupantGeneration({ nextOccupantGeneration: 42 }, entity);
  const receipt = { id: entity.id, type: entity.type, pos: { x: entity.pos.x, z: entity.pos.z },
    killerId: 1, reason: 'impact', occupantGeneration: 42, entity };
  for (const type of ['entity:killed', 'entity:destroyed', 'asteroid:destroyed']) {
    const projected = projectBridgeEvent(type, receipt);
    assert.equal(projected.dropped, false);
    assert.deepEqual(projected.flat, { ...receipt, entity: { entityRef: 391, occupantGeneration: 42 } });
    assert.deepEqual(structuredClone(projected.flat), projected.flat);
  }
  assert.deepEqual(flattenEventPayload(entity), { entityRef: 391, occupantGeneration: 42 });
  const token = flattenEventPayload(entity);
  assert.equal(resolveEventEntityRef(token, new Map([[391, entity]])), entity);
  const successor = { id: 391, occupantGeneration: 43 };
  assert.equal(resolveEventEntityRef(token, new Map([[391, successor]])), token,
    'a delayed victim ref never resolves to its successor');
  assert.equal(projectBridgeEvent('entity:spawned', { id: 391, type: 'asteroid', entity }).flat.occupantGeneration, 42);
});

test('native combat/fracture and queued core retirement retain emit-time life through immediate id reuse', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { runtime, state } = lane.host;
    const victim = runtime.spawn({ type: 'ship', team: 3, radius: 10, pos: { x: -1800, z: -2200 }, data: { defId: 'ship_wasp' } });
    const oldLife = victim.occupantGeneration;
    runtime.getSystem('combat').kill(victim, state.playerId);
    runtime.getSystem('core').helpers.removeEntity(victim.id, { immediate: true, reason: 'native-fixture-kill' });
    const next = runtime.spawn({ id: victim.id, type: 'asteroid', radius: 12, data: { isChunk: true } });
    assert.notEqual(next.occupantGeneration, oldLife);
    runtime.getSystem('swarmArena')._fractureDebris(next);
    const reply = await lane.tick({ tick: 1, steps: 0, commands: [], ackEnd: init.initRebuild?.end ?? 0 });
    const killed = reply.events.find(e => e.t === 'entity:killed' && e.p.id === victim.id);
    const destroyed = reply.events.find(e => e.t === 'entity:destroyed' && e.p.id === victim.id);
    const fractured = reply.events.find(e => e.t === 'asteroid:destroyed' && e.p.id === next.id);
    assert.equal(killed.p.type, 'ship'); assert.deepEqual(killed.p.pos, { x: -1800, z: -2200 });
    assert.equal(killed.p.occupantGeneration, oldLife);
    assert.equal(destroyed.p.reason, 'native-fixture-kill');
    assert.equal(destroyed.p.occupantGeneration, oldLife);
    assert.deepEqual(destroyed.p.entity, { entityRef: victim.id, occupantGeneration: oldLife });
    assert.equal(fractured.p.occupantGeneration, next.occupantGeneration);
    assert.equal(next.alive, false, 'the explicit asteroid receipt comes from a real native fracture');
    assert.equal(killed.p.simTime, state.simTime);
  } finally { lane.shutdown(); }
});

test('main replay applies a new occupant first but delivers the old receipt without substituting it', async () => {
  const state = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 1, ui: { screenStack: [] } };
  const bus = createBus(), posts = []; let receive;
  const lane = createSimLaneRuntime({ state, registry: {}, bus,
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({ post: msg => posts.push(msg), onMessage: fn => { receive = fn; }, terminate() {} }) });
  try {
    receive({ kind: 'ready', seq: posts[0].seq, spawnInfos: [{ entityId: 391, occupantGeneration: 42, type: 'ship', x: 0, z: 0 }] });
    await lane.readyPromise;
    let receipt, spawnReceipt;
    bus.on('entity:destroyed', p => { receipt = p; });
    bus.on('entity:spawned', p => { spawnReceipt = p; });
    lane.runner.stepOnce();
    receive({ kind: 'tickDone', seq: posts.at(-1).seq, stateTick: 1, simTime: 1 / 60,
      spawnInfos: [{ entityId: 391, occupantGeneration: 43, type: 'asteroid', x: 5, z: 5 }],
      events: [{ t: 'entity:spawned', p: { id: 391, entityId: 391, type: 'ship', occupantGeneration: 42 } },
        { t: 'entity:destroyed', p: { id: 391, occupantGeneration: 42, pos: { x: 0, z: 0 }, entity: { entityRef: 391, occupantGeneration: 42 } } }] });
    assert.equal(state.entities.get(391).occupantGeneration, 43);
    assert.equal(receipt.id, 391); assert.equal(receipt.occupantGeneration, 42);
    assert.deepEqual(receipt.entity, { entityRef: 391, occupantGeneration: 42 });
    assert.deepEqual(spawnReceipt.entity, { entityRef: 391, occupantGeneration: 42 });
  } finally { lane.close(); }
});

test('a delayed death does not own a successor mesh or admission', () => {
  const mesh = new THREE.Group(); mesh.userData.presentationOccupantGeneration = 43;
  assert.equal(destructionReceiptMatchesPresentationOwner({ id: 391, occupantGeneration: 42 },
    { id: 391, occupantGeneration: 43 }, mesh), false);
  assert.equal(destructionReceiptMatchesPresentationOwner({ id: 391, occupantGeneration: 42 }, null, mesh), false);
  mesh.userData.presentationOccupantGeneration = 42;
  assert.equal(destructionReceiptMatchesPresentationOwner({ id: 391, occupantGeneration: 42 }, null, mesh), true);
});

function readerFixture() {
  const bus = createBus(); let callback;
  const rock = { id: 391, type: 'asteroid', occupantGeneration: 42, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const win = { performance: { now: () => 100 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, bus, state: { mode: 'flight', simTime: 10, entityList: [rock], entities: new Map([[391, rock]]), render: {} } } };
  const reader = installPlayerTruthReader(win, { pxEvery: 0 });
  reader.start(); callback(); reader.stop();
  return { reader, bus, win, rock, sample() { reader.start(); callback(); reader.stop(); } };
}

test('reader resolves late old-life deaths from history and records generic retirement separately', () => {
  const f = readerFixture();
  try {
    const next = { ...f.rock, occupantGeneration: 43 }; f.win.SF.state.entities.set(391, next);
    f.win.SF.state.entityList = [next]; f.reader.start(); f.reader.stop();
    f.bus.emit('entity:killed', { id: 391, occupantGeneration: 42, type: 'asteroid', simTime: 9.95 });
    f.bus.emit('asteroid:destroyed', { id: 391, occupantGeneration: 43, simTime: 10 });
    f.bus.emit('entity:destroyed', { id: 391, occupantGeneration: 43, reason: 'far-shelve' });
    const events = f.reader.drain().events;
    assert.equal(events[0].id, 391); assert.equal(events[0].sim, 9.95);
    assert.notEqual(events[1].id, 391);
    assert.equal(events[1].ev, 'asteroid-destroyed');
    assert.equal(events[2].id, events[1].id); assert.equal(events[2].ev, 'destroyed');
  } finally { f.reader.dispose(); }
  const ids = createPlayerTruthLifeTracker();
  assert.equal(ids.observe({ id: 391, occupantGeneration: 42 }), 391);
  const nextId = ids.observe({ id: 391, occupantGeneration: 43 });
  assert.equal(ids.receiptId({ id: 391, occupantGeneration: 42 }), 391);
  assert.equal(ids.observe({ id: 391, occupantGeneration: 43 }), nextId);
});

function recorded({ events = [], keys = ['a|rock|lod1|authored'], key = () => 0, id = 391, gone = false } = {}) {
  const samples = Array.from({ length: 60 }, (_, i) => ({ f: i, t: i * 100, sim: 10 + i * 0.1,
    mode: 'flight', vw: 1280, vh: 720, p: null,
    e: gone && i >= 30 ? [] : [[id, CLS.asteroid, 0, 0, 0, 0, 640, 360, 12, VIS.onscreen, key(i), 0]] }));
  return { meta: { mode: 'adventure' }, samples, events, keys };
}

test('only a timely explicit same-life death excuses removal; shelving, future kills and other lives still fail', () => {
  const fixture = events => checkPopping(recorded({ gone: true, events }));
  assert.equal(fixture([{ ev: 'asteroid-destroyed', id: 391, sim: 13 }]).status, 'PASS');
  assert.equal(fixture([{ ev: 'killed', id: 391, sim: 13 }]).status, 'PASS');
  assert.equal(fixture([{ ev: 'destroyed', id: 391, sim: 13, reason: 'far-shelve' }]).status, 'FAIL');
  assert.equal(fixture([{ ev: 'killed', id: 1000391, sim: 13 }]).status, 'FAIL');
  assert.equal(fixture([{ ev: 'killed', id: 391, sim: 15 }]).status, 'FAIL');
  assert.equal(fixture([]).status, 'FAIL');
});

test('draw identity stays cached across frames and sees real marker, material and LOD replacements', () => {
  const identity = createPlayerTruthDrawIdentity();
  const root = new THREE.Group(); root.userData.authoredAssetState = 'awaiting-authored-admission';
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(), new THREE.MeshBasicMaterial()); root.add(marker);
  let walks = 0; const original = root.traverse.bind(root);
  root.traverse = fn => { walks++; original(fn); };
  const first = identity(root); for (let i = 0; i < 60; i++) assert.equal(identity(root), first);
  assert.equal(walks, 1, 'stable frames add no subtree traversal');
  root.userData.authoredAssetState = 'loading'; assert.equal(identity(root), first);
  root.userData.authoredAssetState = 'compiling-pipelines'; assert.equal(identity(root), first);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 2), new THREE.MeshBasicMaterial());
  root.remove(marker); root.add(hull); root.userData.hull = hull; root.userData.authoredAssetState = 'authored';
  const committed = identity(root); assert.notEqual(committed, first, 'first admission is still a real visual swap');
  hull.geometry = new THREE.TetrahedronGeometry(); root.userData._appliedLodLevel = 'lod2';
  const lod = identity(root); assert.notEqual(lod, committed);
  hull.material = new THREE.MeshStandardMaterial(); root.userData.authoredAssetState = 'authored-rebuilt';
  assert.notEqual(identity(root), lod, 'material replacement is also visible content');
});

test('an adopted pool leaf retains its drawn geometry identity and honors real LOD detail hiding', () => {
  const identity = createPlayerTruthDrawIdentity(); const root = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(leaf);
  root.userData._appliedLodLevel = 'lod0'; const initial = identity(root);
  leaf.visible = false; leaf.userData.asteroidInstanceAdopted = true;
  root.userData.authoredAssetState = 'authored';
  assert.equal(identity(root), initial, 'instance handoff preserves actual body contents');
  leaf.userData.poolLeafVisible = false; root.userData._appliedLodLevel = 'lod2';
  assert.notEqual(identity(root), initial, 'a hidden LOD detail is not still drawn by the pool');
});

test('the live reader key records unchanged draws across pending phases and a real authored commit', () => {
  const f = readerFixture(); const root = new THREE.Group(); const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-100, 100, 60, -60, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(), new THREE.MeshBasicMaterial()); root.add(marker); scene.add(root); scene.updateMatrixWorld(true);
  f.win.SF.state.render = { scene, camera, meshes: new Map([[391, root]]) };
  try {
    f.reader.drain();
    const names = [];
    for (const state of ['awaiting-authored-admission', 'loading', 'compiling-pipelines']) {
      root.userData.authoredAssetState = state; f.sample();
      const record = f.reader.drain(); names.push(record.keys[record.samples[0].e[0][10]]);
    }
    assert.notEqual(names[0], names[1], 'admission diagnostics remain recorded');
    const drawn = names.map(name => name.split('|draw:')[1]);
    assert.equal(drawn[0], drawn[1]); assert.equal(drawn[1], drawn[2]);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2), marker.material);
    root.remove(marker); root.add(hull); root.userData.authoredAssetState = 'authored';
    f.sample(); const committed = f.reader.drain();
    assert.notEqual(committed.keys[committed.samples[0].e[0][10]].split('|draw:')[1], drawn[0]);
  } finally { f.reader.dispose(); }
});

test('LOD check keeps state diagnostics but grades actual draws, including first admission and legacy flapping', () => {
  const same = recorded({ keys: ['a|rock|lod1|loading|draw:hull', 'a|rock|lod1|compiling-pipelines|draw:hull'], key: i => i % 2 });
  assert.equal(checkLodChurn(same).status, 'PASS');
  assert.match(checkLodChurn(same).detail, /59 metadata-only transitions/);
  const changed = recorded({ keys: ['a|rock|lod1|loading|draw:marker', 'a|rock|lod1|authored|draw:hull'], key: i => i % 2 });
  assert.equal(checkLodChurn(changed).status, 'FAIL');
  assert.match(checkLodChurn(changed).value, /59 loading/);
  const initial = recorded({ keys: changed.keys, key: i => i >= 30 ? 1 : 0 });
  assert.match(checkLodChurn(initial).value, /1 loading/, 'first admission is counted');
  const legacy = recorded({ keys: ['a|rock|lod1|loading', 'a|rock|lod1|compiling-pipelines'], key: i => i % 2 });
  assert.equal(checkLodChurn(legacy).status, 'FAIL', 'old traces retain their conservative interpretation');
});
