import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import { HeadlightPool } from '../src/render/headlights.js';
import { WeaponLightPool } from '../src/render/weapons/weaponLights.js';
import { createFlightOverheadPresentation } from '../src/render/flightOverheadPresentation.js';
import { NocturneRuntime } from '../src/render/nocturne/runtime.js';
import { nocturneForScene, eventPriorityClass } from '../src/render/nocturne/bridge.js';
import { registerMaterialOwner, unregisterMaterialOwner } from '../src/render/vfx/materialDirector.js';

function harness() {
  const scene = new THREE.Scene();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 8,
    hull: 100, hullMax: 100, vel: { x: 0, z: 0 }, data: {}, flags: {} };
  const state = { mode: 'flight', simTime: 0, playerId: 1,
    entities: new Map([[1, player]]), entityList: [player],
    settings: { video: {}, accessibility: {} }, render: { scene } };
  const renderer = { shadowMap: { enabled: false, needsUpdate: false }, toneMappingExposure: 1 };
  const bus = createBus();
  const headlights = new HeadlightPool(scene);
  const runtime = new NocturneRuntime({ scene, renderer, state, headlights, bus });
  const camera = new THREE.PerspectiveCamera(60, 1.6, 1, 2000);
  camera.position.set(0, 120, 180); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const system = Object.create(vfx);
  Object.assign(system, { _scene: scene, state, _admissionSerial: 0,
    _spawnLocalXZ: { x: 0, z: 0 }, _spawnAdmissionPriority: 0.8 });
  system._initEventLights();
  return { scene, state, renderer, bus, headlights, runtime, camera, system };
}
function census(scene) {
  const counts = { points: 0, spots: 0, shadowSpots: 0 };
  scene.traverse(o => {
    if (o.isPointLight) counts.points++;
    if (o.isSpotLight) { counts.spots++; if (o.castShadow) counts.shadowSpots++; }
  });
  return counts;
}

test('real VFX, weapon and engine adapters share eight GPU points and three spots', () => {
  const h = harness();
  const expected = { points: 8, spots: 3, shadowSpots: 1 };
  assert.deepEqual(census(h.scene), expected);
  const weapons = new WeaponLightPool(h.scene);
  const overhead = createFlightOverheadPresentation(h.scene);
  assert.ok(h.system._lights.length > 6, 'logical event capacity is independent of the old GPU pool');
  assert.ok(weapons.size > 2, 'logical weapon capacity is independent of old two-light residency');
  assert.deepEqual(census(h.scene), expected);
  assert.equal(h.system._flashLight({ x: 8, z: 0 }, 0xff6010, 4, 8, 140, 0.9), true);
  h.system._decayEventLights(1 / 60);
  const weapon = weapons.spawn({ x: -10, y: 7, z: 0, color: '#51baff', intensity: 4,
    distance: 160, life: 0.18, priority: 0.9 });
  assert.ok(weapon?.light._nocturneSource);
  h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.some(light => light.intensity > 0), 'same-frame effects light real surfaces');
  assert.deepEqual(census(h.scene), expected);
  h.system._releaseTransientEventLights(); weapons.clear(); h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
  overhead.dispose(); weapons.dispose(); h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
  assert.equal(nocturneForScene(h.scene), null);
  assert.deepEqual(census(h.scene), { points: 0, spots: 0, shadowSpots: 0 });
});

test('normalized existing event priorities retain their gameplay meaning', () => {
  assert.equal(eventPriorityClass(0.9), 3);
  assert.equal(eventPriorityClass(0.5), 2);
  assert.equal(eventPriorityClass(0.1), 1);
  const h = harness();
  const slot = h.system._claimEventLightSlot(0.9);
  assert.equal(slot.obj._nocturneSource.priority, 3);
  assert.ok(slot.obj._nocturneSource.importance >= 1.9);
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('Nocturne shadow admission starts from settings and follows later toggle changes', () => {
  const scene = new THREE.Scene();
  const renderer = { shadowMap: { enabled: false } };
  const state = { settings: { video: { nocturne: true, nocturneShadows: false } } };
  const headlights = new HeadlightPool(scene);
  const runtime = new NocturneRuntime({ scene, renderer, state, headlights });
  assert.equal(runtime.shadowConfigured, true, 'the structural spot-light census remains mounted');
  assert.equal(renderer.shadowMap.enabled, true, 'the structural shader key remains pinned');
  assert.equal(runtime.shadowsEnabled, false, 'default-off settings do not request a depth pass');
  assert.equal(runtime._directorOptions.shadowEnabled, false);

  state.settings.video.nocturneShadows = true;
  runtime.setEnabled(true);
  assert.equal(runtime.shadowsEnabled, true, 'the local-shadow option can be enabled live');
  assert.equal(runtime._directorOptions.shadowEnabled, true);

  state.settings.video.nocturne = false;
  runtime.setEnabled(false);
  assert.equal(runtime.shadowsEnabled, false, 'disabling Nocturne disables its shadow contribution');
  assert.equal(runtime._directorOptions.enabled, false);
  runtime.dispose();
  headlights.dispose();
});

test('material contact stays secondary while a gyre payload uses the normalized major-event priority', () => {
  const h = harness();
  const materialRoot = new THREE.Group(); h.scene.add(materialRoot);
  const contact = { active: true, x: 10, y: 8, z: 0, r: 1, g: 0.3, b: 0.1, intensity: 4, range: 100 };
  const materialOwner = { renderer: materialRoot, live: 1, contactLight: contact };
  registerMaterialOwner(materialOwner);
  h.system._syncMaterialContactLight();
  const secondary = h.system._findSustainedEventLight('living-material-contact');
  assert.equal(secondary.admissionPriority, 0.24);
  assert.equal(secondary.obj._nocturneSource.priority, 1);
  assert.equal(secondary.obj._nocturneSource.importance, 1.24);
  h.system._gyreSnareFx = { payloadLight: { ...contact, color: '#ffa366' } };
  h.system._updateGyrePayloadLight();
  const major = h.system._findSustainedEventLight('gyre-payload');
  assert.equal(major.admissionPriority, 0.9);
  assert.equal(major.obj._nocturneSource.priority, 3);
  assert.equal(major.obj._nocturneSource.importance, 1.9);
  assert.deepEqual(census(h.scene), { points: 8, spots: 3, shadowSpots: 1 });
  unregisterMaterialOwner(materialOwner); materialRoot.removeFromParent();
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('VFX teardown retires logical sources before reinitialization in the same renderer', () => {
  const h = harness();
  const beforeEvents = h.runtime.registry.size - h.system._lights.length;
  const slot = h.system._claimEventLightSlot(0.9);
  slot.obj.intensity = 6000;
  const oldSource = slot.obj._nocturneSource;
  h.system.destroy();
  assert.equal(oldSource.registered, false);
  assert.equal(h.runtime.registry.size, beforeEvents);
  const next = Object.create(vfx);
  Object.assign(next, { _scene: h.scene, state: h.state, _admissionSerial: 0 });
  next._initEventLights();
  assert.notEqual(next._lights[0].obj._nocturneSource, oldSource);
  assert.ok(next._lights.every(entry => entry.obj.intensity === 0));
  h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
  next.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('retiring an old bridge generation cannot dispose its replacement', () => {
  const h = harness();
  const old = h.runtime.createLight('fixture:reused', 'point', { priority: 3 });
  old.dispose();
  const replacement = h.runtime.createLight('fixture:reused', 'point', { priority: 3 });
  assert.notEqual(replacement, old);
  replacement.position.set(10, 8, 0); replacement.intensity = 8000;
  old.dispose();
  assert.equal(h.runtime.registry.get('fixture:reused'), replacement._nocturneSource);
  h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.some(light => light.intensity > 0));
  replacement.dispose();
  assert.equal(h.runtime.registry.get('fixture:reused'), null);
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('manual lighting controls apply to an immediate flush and respect the saved preference', () => {
  const h = harness();
  const effect = h.runtime.createLight('fixture:toggle', 'point', { priority: 3 });
  effect.position.set(10, 8, 0); effect.intensity = 8000;
  h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.some(light => light.intensity > 0));
  const settings = JSON.stringify(h.state.settings);
  h.runtime.setEnabled(false); h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
  h.runtime.setEnabled(true); h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.some(light => light.intensity > 0));
  assert.equal(JSON.stringify(h.state.settings), settings, 'render-only A/B does not write player preferences');
  h.state.settings.video.nocturne = false;
  h.runtime.setEnabled(false); h.runtime.setEnabled(true); h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
  assert.equal(effect.intensity, 8000, 'logical emitter remains authored while contribution is disabled');
  assert.deepEqual(census(h.scene), { points: 8, spots: 3, shadowSpots: 1 });
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('actual save, game and sector boundaries clear transient light without removing GPU residency', () => {
  const h = harness();
  const effect = h.runtime.createLight('fixture:boundary-event', 'point', { priority: 3 });
  effect.position.set(10, 8, 0); effect.intensity = 8000; effect.distance = 140;
  for (const event of ['save:restoring', 'game:new', 'game:exitToMenu', 'sector:exit']) {
    effect.intensity = 8000;
    h.runtime.flush(h.camera);
    assert.ok(h.runtime.pointLights.some(light => light.intensity > 0));
    h.bus.emit(event, {});
    assert.equal(effect.intensity, 0, event);
    assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
    assert.deepEqual(census(h.scene), { points: 8, spots: 3, shadowSpots: 1 });
  }
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('exiting to menu retires VFX CPU envelopes before the next light update', () => {
  const h = harness();
  h.system.bus = h.bus;
  h.system._subs = [];
  h.system._subscribe();
  assert.equal(h.system._flashLight({ x: 8, z: 0 }, 0xff6010, 4, 2, 140, 0.9), true);
  h.system._decayEventLights(1 / 60);
  const slot = h.system._lights.find(entry => entry.active);
  assert.ok(slot?.peak > 0 && slot.intensity > 0, 'a transient still has a live CPU envelope');
  h.runtime.flush(h.camera);
  assert.ok(h.runtime.pointLights.some(light => light.intensity > 0));

  h.state.mode = 'menu';
  h.bus.emit('game:exitToMenu', {});
  assert.equal(slot.obj.intensity, 0, 'runtime boundary clears the published logical light');
  assert.equal(slot.active, false, 'the producer must also retire its envelope');
  assert.equal(slot.peak, 0);
  assert.equal(h.system._activeLightCount, 0);
  assert.equal(h.system._freeLightCount, h.system._lights.length);
  assert.equal(h.system._decayEventLights(1 / 60), false);
  h.runtime.flush(h.camera);
  assert.equal(slot.obj.intensity, 0, 'the next menu update cannot resurrect the old flash');
  assert.ok(h.runtime.pointLights.every(light => light.intensity === 0));
  assert.deepEqual(census(h.scene), { points: 8, spots: 3, shadowSpots: 1 });
  h.system.destroy(); h.runtime.dispose(); h.headlights.dispose();
});

test('retained runtime handles release old world references and dispose only once', () => {
  for (const disposeGpu of [true, false]) {
    const h = harness();
    const root = new THREE.Group(); h.scene.add(root);
    const meshes = new Map([[1, root]]);
    const membrane = { toLocal(source, out) { out.x = source.x; out.z = source.z; return out; } };
    h.runtime.prepare(1 / 60, h.camera, membrane, meshes);
    assert.ok(h.runtime.headlights._chosen.includes(h.state.entities.get(1)));
    h.runtime.clear();
    assert.ok(h.runtime.headlights._chosen.every(entity => entity === null), 'boundary clears candidate ownership');
    h.runtime.prepare(1 / 60, h.camera, membrane, meshes);
    assert.equal(h.runtime._options.meshes, meshes);
    assert.ok(h.runtime.headlights._chosen.includes(h.state.entities.get(1)));

    let pointDisposals = 0, mapDisposals = 0;
    for (const light of h.runtime.pointLights) light.dispose = () => pointDisposals++;
    const shadow = h.runtime.shadowLight.shadow;
    shadow.map = new THREE.WebGLRenderTarget(32, 32);
    shadow.map.addEventListener('dispose', () => mapDisposals++);
    h.runtime.dispose({ disposeGpu });
    h.runtime.dispose({ disposeGpu: true });
    assert.equal(pointDisposals, disposeGpu ? 8 : 0, 'a later dispose cannot enter a retired GPU generation');
    assert.equal(mapDisposals, disposeGpu ? 1 : 0);
    assert.equal(shadow.map, null);
    for (const key of ['scene', 'state', 'renderer', 'gpu', 'bloom', 'graph', 'shadowLight', 'atmosphere']) {
      assert.equal(h.runtime[key], null, `retired ${key} reference`);
    }
    assert.equal(h.runtime._options.meshes, null);
    assert.equal(h.runtime._options.camera, null);
    assert.equal(h.runtime._directorOptions.renderer, null);
    assert.equal(h.runtime._lightInputs.length, 0);
    assert.equal(h.runtime.pointLights.length, 0);
    assert.equal(h.runtime.headlights.rows.length, 0);
    assert.equal(h.runtime.headlights._chosen.length, 0);
    assert.equal(h.runtime.headlights.registry, null);
    assert.equal(h.runtime.registry.size, 0);
    assert.equal(nocturneForScene(h.scene), null);
    assert.equal(h.runtime.getDiagnostics().enabled, false);
    let retiredBoundaryCalls = 0;
    h.runtime.clear = () => retiredBoundaryCalls++;
    h.bus.emit('game:exitToMenu', {});
    assert.equal(retiredBoundaryCalls, 0, 'old runtime no longer subscribes');
    h.system.destroy(); h.headlights.dispose({ disposeGpu }); root.removeFromParent();
  }
});
