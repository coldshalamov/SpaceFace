import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NocturneRegistry, NOCTURNE_PRIORITY } from '../src/render/nocturne/registry.js';
import { NocturneDirector } from '../src/render/nocturne/director.js';
import { HeadlightPool } from '../src/render/headlights.js';

function camera() {
  const cam = new THREE.PerspectiveCamera(60, 1.6, 1, 3000);
  cam.position.set(0, 120, 180);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}
function rig(options = {}) {
  const scene = new THREE.Scene();
  const registry = new NocturneRegistry({ capacity: 1200 });
  const renderer = { shadowMap: { enabled: true, needsUpdate: false } };
  const director = new NocturneDirector(scene, { registry, renderer, pointCount: 2, spotCount: 2, ...options });
  return { scene, registry, renderer, director, camera: camera() };
}
function source(registry, id, extra = {}) {
  return registry.register(id, { type: 'point', position: { x: 0, y: 8, z: 0 },
    target: { x: 80, y: 0, z: 0 }, intensity: 4000, range: 150,
    color: 0xffb367, priority: NOCTURNE_PRIORITY.fixture, ...extra });
}
function advance(h, count = 30, options) {
  for (let i = 0; i < count; i++) {
    h.director.update(1 / 60, h.camera, options);
    // Stand in for THREE consuming successfully submitted shadow updates.
    for (const record of h.director.shadowBudget.records) record.slot.light.shadow.needsUpdate = false;
  }
}

test('logical admission is bounded, stale handles retire, and TTL/envelopes do not touch owners', () => {
  const registry = new NocturneRegistry({ capacity: 2 });
  const a = source(registry, 'a', { ttl: 1, envelope: { attack: 0.2, hold: 0.2, decay: 5 } });
  const b = source(registry, 'b');
  assert.equal(source(registry, 'overflow'), null);
  assert.equal(registry.rejected, 1);
  registry.tick(0.1);
  assert.equal(a.gain, 0.5);
  registry.tick(0.5);
  assert.ok(a.gain > 0 && a.gain < 0.5);
  registry.tick(0.4);
  assert.equal(a.registered, false);
  assert.equal(registry.get('a'), null);
  assert.equal(registry.sources[0], b);
  assert.equal(b.index, 0);
  const replacement = source(registry, 'a');
  assert.notEqual(replacement, a);
  assert.ok(replacement.generation > a.generation);
  registry.clear();
  assert.equal(replacement.registered, false);
  assert.equal(registry.size, 0);
});

test('authored sockets inherit hierarchy transforms and detach or missing sockets go dark', () => {
  const registry = new NocturneRegistry();
  const scene = new THREE.Scene(), owner = new THREE.Group(), socket = new THREE.Group();
  socket.name = 'HOOK_WORK_LAMP';
  socket.position.set(5, 6, 0);
  owner.position.set(100, 10, 30);
  owner.rotation.y = Math.PI / 2;
  owner.add(socket); scene.add(owner); scene.updateMatrixWorld(true);
  const ownerData = JSON.stringify(owner.userData);
  const a = source(registry, 'a', { owner, socket: 'HOOK_WORK_LAMP', offset: { x: 1, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 }, power: 0.5, damage: 0.2 });
  const absent = source(registry, 'missing', { owner, socket: 'NOT_AUTHORED' });
  registry.tick(0);
  assert.ok(a.position.distanceTo(new THREE.Vector3(100, 16, 24)) < 1e-8);
  assert.ok(a.direction.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);
  assert.equal(a.gain, 0.4);
  assert.equal(absent.gain, 0);
  assert.equal(JSON.stringify(owner.userData), ownerData);
  socket.removeFromParent(); registry.tick(0);
  assert.equal(a.gain, 0, 'a detached cached socket cannot leave a ghost light on its living owner');
  owner.add(socket); scene.updateMatrixWorld(true); registry.tick(0);
  assert.equal(a.gain, 0.4);
  owner.removeFromParent(); registry.tick(0);
  assert.equal(a.gain, 0);
});

test('500 logical emitters preserve the adopted point/spot census and bounded memory records', () => {
  const points = Array.from({ length: 8 }, () => new THREE.PointLight());
  const spots = Array.from({ length: 3 }, () => new THREE.SpotLight());
  const h = rig({ pointLights: points, spotLights: spots, shadowCount: 1 });
  for (let i = 0; i < 500; i++) source(h.registry, `p${i}`, { position: { x: i % 30 - 15, y: 8, z: i % 19 - 9 } });
  source(h.registry, 'player-searchlight', { type: 'spot', priority: 4, critical: true, shadow: true });
  const records = h.director.slots.slice(), lights = records.map(s => s.light);
  const diagnostics = h.director.getDiagnostics();
  advance(h, 90);
  assert.equal(h.director.slots.length, 11);
  assert.equal(h.director.getDiagnostics(), diagnostics);
  assert.equal(diagnostics.logical, 501);
  assert.equal(diagnostics.active, 9);
  assert.equal(diagnostics.points, 8);
  assert.equal(diagnostics.spots, 3);
  assert.equal(diagnostics.shadowMaps, 1);
  for (let i = 0; i < records.length; i++) {
    assert.equal(h.director.slots[i], records[i]);
    assert.equal(h.director.slots[i].light, lights[i]);
    assert.equal(lights[i].visible, true);
  }
  h.director.update(1 / 60, h.camera, { enabled: false });
  assert.ok(lights.every(l => l.visible && l.intensity === 0));
  assert.equal(spots[0].castShadow, true);
  h.director.dispose();
});

test('frustum influence rejects offscreen decoration while a light volume can enter from offscreen', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0 });
  const offscreen = source(h.registry, 'off', { position: { x: 1100, y: 0, z: 0 }, range: 60 });
  advance(h, 10);
  assert.equal(h.director.slots[0].light.intensity, 0);
  offscreen.position.set(120, 0, 0); offscreen.range = 250;
  h.registry.invalidate(); advance(h, 20);
  assert.equal(h.director.slots[0].source, offscreen);
  assert.ok(h.director.slots[0].light.intensity > 0);
});

test('hysteresis holds near-equal residents but yields to a consequential critical event', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0 });
  const original = source(h.registry, 'original');
  advance(h, 20);
  const weak = source(h.registry, 'weak', { intensity: 4200 });
  advance(h, 30);
  assert.equal(h.director.slots[0].source, original);
  h.registry.update('weak', { priority: 4, critical: true });
  advance(h, 30);
  assert.equal(h.director.slots[0].source, weak);
  assert.ok(h.director.getDiagnostics().replacements > 0);
});

test('preallocated event enable transitions admit immediately and retired records cannot ghost', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0, selectionHz: 1 });
  const flash = source(h.registry, 'flash', { enabled: false, priority: 3 });
  advance(h, 1);
  flash.enabled = true;
  h.director.update(0, h.camera); // same-frame post-VFX flush; no clock is advanced twice
  assert.equal(h.director.slots[0].source, flash);
  assert.ok(h.director.slots[0].light.intensity > 0);
  h.registry.unregister('flash'); h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].light.intensity, 0);
});

test('a malformed moving source cannot upload a NaN pose between selection cadences', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0, selectionHz: 1 });
  const lamp = source(h.registry, 'lamp');
  advance(h, 20);
  lamp.position.x = NaN;
  h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].light.intensity, 0);
  assert.ok(Number.isFinite(h.director.slots[0].light.position.x));
});

test('handoff fades at the old location before moving the GPU light', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0 });
  const a = source(h.registry, 'a', { position: { x: -30, y: 8, z: 0 } });
  advance(h, 30);
  const b = source(h.registry, 'b', { position: { x: 30, y: 8, z: 0 }, importance: 10 });
  h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].source, a);
  assert.equal(h.director.slots[0].light.position.x, -30);
  advance(h, 30);
  assert.equal(h.director.slots[0].source, b);
  assert.equal(h.director.slots[0].light.position.x, 30);
});

test('only one real shadow resource is resident and occlusion-required lamps never leak through fallback', () => {
  const h = rig({ pointCount: 0, spotCount: 2, shadowCount: 1 });
  const player = source(h.registry, 'player', { type: 'spot', shadow: true, requiresOcclusion: true, priority: 4 });
  const required = source(h.registry, 'bulkhead', { type: 'spot', shadow: true, requiresOcclusion: true, priority: 1 });
  const wide = source(h.registry, 'panel', { type: 'area', shadow: false });
  advance(h, 30);
  assert.equal(h.director.slots[0].source, player);
  assert.equal(h.director.slots[1].source, wide);
  assert.ok(!h.director.slots.some(s => s.source === required));
  assert.equal(h.director.slots[0].light.castShadow, true);
  assert.equal(h.director.slots[1].light.castShadow, false);
  assert.ok(h.director.slots[1].light.angle >= 0.8);
  assert.equal(h.director.slots[1].light.penumbra, 1);
  advance(h, 30, { shadowEnabled: false });
  assert.equal(h.director.slots[0].light.castShadow, true);
  assert.equal(h.director.slots[0].light.intensity, 0);
  assert.ok(!h.director.slots.some(s => s.source === required || s.source === player));
});

test('stationary shadows cache until a changed caster, moving lamps update at bounded cadence', () => {
  const h = rig({ pointCount: 0, spotCount: 1, shadowCount: 1 });
  const lamp = source(h.registry, 'lamp', { type: 'spot', shadow: true, stationary: true });
  advance(h, 60);
  const n = h.director.shadowBudget.updates;
  assert.equal(n, 1);
  advance(h, 10, { casterEpoch: 1 });
  assert.equal(h.director.shadowBudget.updates, n + 1);
  lamp.stationary = false;
  const before = h.director.shadowBudget.updates;
  advance(h, 60, { casterEpoch: 1 });
  const movingUpdates = h.director.shadowBudget.updates - before;
  assert.ok(movingUpdates >= 14 && movingUpdates <= 16, `${movingUpdates} depth updates/s`);
  assert.equal(h.director.slots[0].light.shadow.mapSize.x, 512);
});

test('a skipped draw preserves a requested map until the renderer consumes it', () => {
  const h = rig({ pointCount: 0, spotCount: 1, shadowCount: 1 });
  source(h.registry, 'lamp', { type: 'spot', shadow: true, stationary: true });
  h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].light.shadow.needsUpdate, true);
  h.renderer.shadowMap.needsUpdate = false;
  h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].light.shadow.needsUpdate, true);
  assert.equal(h.renderer.shadowMap.needsUpdate, true);
  assert.equal(h.director.shadowBudget.updates, 1);
  h.director.slots[0].light.shadow.needsUpdate = false;
  h.director.update(1 / 60, h.camera);
  assert.equal(h.director.slots[0].light.shadow.needsUpdate, false);
});

test('optional directional adoption changes no rig membership', () => {
  const sun = new THREE.DirectionalLight();
  const h = rig({ pointCount: 0, spotCount: 0, shadowCount: 0, directionalLights: [sun] });
  const direct = source(h.registry, 'key', { type: 'directional', intensity: 2, direction: { x: -1, y: -1, z: 0 } });
  advance(h, 20);
  assert.equal(h.director.slots[0].light, sun);
  assert.equal(h.director.slots[0].source, direct);
  assert.equal(h.director.getDiagnostics().directionals, 1);
  assert.equal(sun.intensity, 2);
});

test('context-loss teardown detaches owned and adopted lights without GPU dispose events', () => {
  const h = rig({ pointCount: 1, spotCount: 0, shadowCount: 0 });
  const headlights = new HeadlightPool(h.scene);
  const adopted = new NocturneDirector(h.scene, { registry: h.registry,
    pointLights: [], spotLights: headlights.slots, shadowCount: 1 });
  source(h.registry, 'lamp', { type: 'spot', shadow: true });
  adopted.update(0.2, h.camera);
  const light = headlights.slots[0].light;
  let gpuDisposes = 0;
  const map = new THREE.WebGLRenderTarget(8, 8), mapPass = new THREE.WebGLRenderTarget(8, 8);
  map.addEventListener('dispose', () => gpuDisposes++);
  mapPass.addEventListener('dispose', () => gpuDisposes++);
  light.shadow.map = map; light.shadow.mapPass = mapPass;
  for (const slot of [...h.director.slots, ...headlights.slots]) slot.light.dispose = () => gpuDisposes++;
  h.director.dispose({ disposeGpu: false });
  adopted.dispose({ disposeGpu: false });
  headlights.dispose({ disposeGpu: false });
  h.director.dispose(); adopted.dispose(); headlights.dispose();
  assert.equal(gpuDisposes, 0);
  assert.equal(light.intensity, 0);
  assert.equal(light.shadow.map, null);
  assert.equal(light.shadow.mapPass, null);
  assert.equal(light.shadow.needsUpdate, false);
  assert.equal(adopted.shadowBudget.renderer, null);
  assert.equal(adopted.shadowBudget.records.length, 0);
  assert.equal(adopted.slots.length, 0);
  assert.equal(headlights.group.children.length, 0);
  assert.equal(h.scene.children.length, 0);
  assert.equal(h.registry.size, 1, 'director does not own the external logical registry');
});

test('normal teardown releases each owned map and light once', () => {
  const h = rig({ pointCount: 1, spotCount: 1, shadowCount: 1 });
  let maps = 0, lights = 0;
  const shadow = h.director.slots[1].light.shadow;
  shadow.map = new THREE.WebGLRenderTarget(8, 8);
  shadow.mapPass = new THREE.WebGLRenderTarget(8, 8);
  shadow.map.addEventListener('dispose', () => maps++);
  shadow.mapPass.addEventListener('dispose', () => maps++);
  for (const slot of h.director.slots) slot.light.dispose = () => lights++;
  h.director.dispose(); h.director.dispose();
  assert.equal(maps, 2);
  assert.equal(lights, 2);
  assert.equal(shadow.map, null);
  assert.equal(h.scene.children.length, 0);
});
