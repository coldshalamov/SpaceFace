import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createSpecialistWorldTellSystem,
  disposeSpecialistWorldTellSystem,
  inspectSpecialistWorldTellSystem,
  PD_INTERCEPT_TELL_CAPACITY,
  reprojectSpecialistWorldTellSystem,
  resetSpecialistWorldTellSystem,
  spawnPdInterceptTell,
  spawnTenderWeldTell,
  TENDER_WELD_TELL_CAPACITY,
  updateJackalMineWakeTells,
  updateSpecialistWorldTellSystem,
} from '../src/render/specialistWorldTells.js';
import { vfx } from '../src/render/vfx.js';
import {
  audio,
  resolveSpecialistPresentationAudioCue,
  SPECIALIST_AUDIO_SIGNATURES,
} from '../src/audio/audioSystem.js';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
      return () => {
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

function descendants(root, predicate) {
  const found = [];
  root.traverse((object) => { if (predicate(object)) found.push(object); });
  return found;
}

test('PD and Tender tells use fixed hard world-geometry pools', () => {
  const scene = new THREE.Scene();
  const system = createSpecialistWorldTellSystem(scene);
  assert.equal(system.group.children.length, 6);
  assert.equal(system.pdSlots.length, PD_INTERCEPT_TELL_CAPACITY);
  assert.equal(system.weldSlots.length, TENDER_WELD_TELL_CAPACITY);
  assert.equal(descendants(system.group, (object) => object.isSprite || object.isPoints).length, 0);
  assert.ok(descendants(system.group, (object) => object.material)
    .every((object) => object.material.transparent !== true));

  assert.equal(spawnPdInterceptTell(system, {
    sourceId: 10, defenderId: 11, incomingId: 12, interceptorId: 13, tick: 90,
  }, { x: 8, z: 6 }, Math.PI / 4, false), true);
  assert.equal(spawnTenderWeldTell(system, {
    sourceId: 20, droneId: 21, targetId: 22, applied: 2, tick: 91,
  }, { x: 30, z: -4 }, { x: 18, z: -4 }, 12, false), true);
  assert.equal(updateJackalMineWakeTells(system, [{
    id: 30, alive: true, type: 'mine', radius: 6,
    pos: { x: 18, z: 4 }, vel: { x: 36, z: 0 }, data: { mineLayerWake: true },
  }], (x, z, out) => Object.assign(out, { x, z }), false), 1);
  updateSpecialistWorldTellSystem(system, 1 / 30);
  let report = inspectSpecialistWorldTellSystem(system);
  assert.deepEqual([report.activePd, report.activeWeld], [1, 1]);
  assert.equal(report.pdBladeInstances, 2);
  assert.equal(report.pdLineVertices, 6);
  assert.equal(report.mineWakeVertices, 8);
  assert.equal(report.mineWakeBladeInstances, 3);
  assert.equal(report.weldBarInstances, 4);
  assert.equal(report.weldLineVertices, 12);

  const pdX = system.pdSlots.find((slot) => slot.alive).x;
  const weldZ = system.weldSlots.find((slot) => slot.alive).z;
  assert.equal(reprojectSpecialistWorldTellSystem(system, 100, -50), 2);
  assert.equal(system.pdSlots.find((slot) => slot.alive).x, pdX + 100);
  assert.equal(system.weldSlots.find((slot) => slot.alive).z, weldZ - 50);

  for (let frame = 0; frame < 10; frame++) updateSpecialistWorldTellSystem(system, 0.1);
  report = inspectSpecialistWorldTellSystem(system);
  assert.deepEqual([report.activePd, report.activeWeld], [0, 0]);
  assert.deepEqual([report.pdBladeInstances, report.weldBarInstances], [0, 0]);
  resetSpecialistWorldTellSystem(system);
  disposeSpecialistWorldTellSystem(system);
  assert.equal(scene.children.includes(system.group), false);
});

test('only physics interception and successful combat repair receipts drive the VFX owner', () => {
  const scene = new THREE.Scene();
  const bus = makeBus();
  const pd = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, radius: 18, data: {} };
  const defended = { id: 2, alive: true, type: 'ship', pos: { x: 30, z: 0 }, radius: 16, data: {} };
  const drone = { id: 3, alive: true, type: 'drone', pos: { x: 46, z: 22 }, radius: 4, data: {} };
  const repaired = { id: 4, alive: true, type: 'ship', pos: { x: 60, z: 22 }, radius: 14, data: {} };
  const entities = [pd, defended, drone, repaired];
  const state = {
    playerId: 999, simTime: 1, tick: 60,
    entities: new Map(entities.map((entity) => [entity.id, entity])), entityList: entities,
    settings: { video: { particleQuality: 'low', motionReduce: false }, accessibility: { flashReduce: false } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  assert.ok(system._vfxOwnerRoots().includes(system._specialistWorldTells.group));

  bus.emit('combat:projectileIntercepted', {
    schemaVersion: 1, tick: 61, defenderId: defended.id, sourceId: pd.id,
    shooterId: pd.id, interceptorId: 101, incomingId: 102, position: { x: 22, z: 0 },
  });
  system.update(1 / 60);
  assert.equal(system.inspect().specialistWorldTells.activePd, 1);
  assert.equal(system.inspect().subsystems.lastFrame.specialistPresentation, 1);

  bus.emit('combat:hullRepaired', {
    sourceId: 5, droneId: drone.id, targetId: repaired.id, applied: 2, tick: 62,
    cue: 'green_weld_flashes', pos: repaired.pos,
  });
  system.update(1 / 60);
  assert.equal(system.inspect().specialistWorldTells.activeWeld, 1);

  const before = system.inspect().specialistWorldTells.activeWeld;
  bus.emit('combat:hullRepaired', {
    droneId: drone.id, targetId: repaired.id, applied: 0, tick: 63,
    cue: 'green_weld_flashes', pos: repaired.pos,
  });
  assert.equal(system.inspect().specialistWorldTells.activeWeld, before,
    'a zero-application receipt cannot invent a weld tell');
  bus.emit('sector:exit', {});
  assert.deepEqual([
    system.inspect().specialistWorldTells.activePd,
    system.inspect().specialistWorldTells.activeWeld,
  ], [0, 0]);
  system.destroy();
});

test('Tender weld audio is receipt-authoritative and cooldown-bounded', () => {
  const receipt = {
    sourceId: 9, droneId: 10, targetId: 11, applied: 2,
    cue: 'green_weld_flashes', pos: { x: 24, z: -6 },
  };
  assert.equal(resolveSpecialistPresentationAudioCue('combat:hullRepaired', receipt),
    SPECIALIST_AUDIO_SIGNATURES.tenderGreenWeld);
  assert.equal(resolveSpecialistPresentationAudioCue('combat:hullRepaired', { ...receipt, applied: 0 }), null);
  assert.equal(resolveSpecialistPresentationAudioCue('combat:damage', receipt), null);

  const bus = makeBus();
  const played = [];
  const system = Object.create(audio);
  system.play = (id, options) => { played.push({ id, options }); return true; };
  const state = { settings: { audio: {} }, entities: new Map(), entityList: [], simTime: 1 };
  system.init({ state, bus, helpers: {} });
  bus.emit('combat:hullRepaired', receipt);
  assert.equal(played.length, 1);
  assert.equal(played[0].id, SPECIALIST_AUDIO_SIGNATURES.tenderGreenWeld.recipeId);
  assert.deepEqual(played[0].options.position, receipt.pos);
  bus.emit('combat:hullRepaired', receipt);
  assert.equal(played.length, 1, 'weld chatter is bounded within the receipt cooldown');
  state.simTime += SPECIALIST_AUDIO_SIGNATURES.tenderGreenWeld.cooldownS + 0.01;
  bus.emit('combat:hullRepaired', receipt);
  assert.equal(played.length, 2);
  system.destroy();
});
