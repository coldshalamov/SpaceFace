import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';

test('covered flight keeps live observations without spending visual probe budgets before reveal', () => {
  let callback;
  let wall = 0;
  const measures = [];
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const player = { id: 1, type: 'ship', alive: true, radius: 4,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    mode: 'flight', simTime: 0, tick: 0, playerId: 1,
    entityList: [player], entities: new Map([[1, player]]),
    render: { camera, scene: new THREE.Scene(), meshes: new Map(), flightVeilHoldsSim: true },
  };
  const win = {
    innerWidth: 1280, innerHeight: 720,
    performance: { now: () => wall, measure: name => measures.push(name), clearMeasures() {} },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state },
  };
  const reader = installPlayerTruthReader(win, { vfxEvery: 1, pxEvery: 1,
    visualEveryMs: 1000, pixelEveryMs: 1000 });
  const frame = () => {
    reader.start(); callback(); reader.stop();
    return reader.drain().samples[0];
  };
  try {
    const covered = frame();
    assert.ok(covered.p, 'live player observation remains available under the veil');
    assert.equal(covered.vfx, null);
    assert.equal(covered.px, undefined);
    assert.ok(!measures.includes('player-truth:reader:px'));
    wall = 16; state.tick++; player.pos.x = 12;
    state.render.flightVeilHoldsSim = false;
    const revealed = frame();
    assert.ok(revealed.vfx, 'reveal gets the first visual slot immediately');
    assert.ok(revealed.px, 'covered flight did not consume the pixel wall budget');
    assert.ok(measures.includes('player-truth:reader:px'));
    assert.notDeepEqual(revealed.p, covered.p, 'player state is observed freshly after reveal');
    wall = 32;
    const next = frame();
    assert.equal(next.vfx, null);
    assert.equal(next.px, undefined, 'ordinary independent wall budgets remain in force');
  } finally {
    reader.dispose();
  }
});

test('entity observations stay fresh while VFX and pixel probes keep independent wall budgets', () => {
  let callback = null;
  let wall = 0;
  const measures = [];
  const enemyPosition = { x: 0, y: 0, z: 0 };
  const enemy = {
    id: 2, type: 'ship', alive: true, team: 1, radius: 8, data: {},
    pos: enemyPosition, vel: { x: 0, z: 0 },
  };
  const player = { id: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4 };
  const entityList = [player, enemy];
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const enemyMesh = new THREE.Mesh(geometry, material);
  enemyMesh.userData.authoredCompositionId = 'cadence-test';
  scene.add(enemyMesh);
  const state = {
    mode: 'flight', simTime: 0, tick: 0, playerId: 1, entityList,
    entities: new Map([[1, player], [2, enemy]]),
    render: { renderer: null, camera, scene, meshes: new Map([[2, enemyMesh]]) },
  };
  const win = {
    innerWidth: 1280, innerHeight: 720,
    performance: {
      now: () => wall,
      measure(name) { measures.push(name); },
      clearMeasures() {},
    },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; },
    cancelAnimationFrame() {},
    SF: { THREE, state },
  };
  const reader = installPlayerTruthReader(win, {
    vfxEvery: 1, pxEvery: 5, visualEveryMs: 1000, pixelEveryMs: 1000,
  });
  const frame = (at, x, visible, lod) => {
    wall = at; state.tick++; enemyPosition.x = x;
    enemyMesh.position.set(x, 0, 0); enemyMesh.visible = visible;
    enemyMesh.userData._appliedLodLevel = lod;
    scene.updateMatrixWorld(true);
    reader.start(); callback(); reader.stop();
    return reader.drain().samples[0];
  };

  try {
    const first = frame(0, 0, true, 'lod0');
    assert.ok(first.vfx, 'the opening frame performs the first VFX scan');
    assert.equal(first.e[0][2], 0);
    assert.equal(first.e[0][9], 3, 'the visible root is recorded on the opening frame');

    const hidden = frame(16, 5, false, 'lod1');
    assert.equal(hidden.vfx, null, 'the frame-aligned VFX slot is wall-gated');
    assert.equal(hidden.px, undefined, 'pixel readback is not due yet');
    assert.notEqual(hidden.e, first.e, 'each frame owns a fresh entity census');
    assert.equal(hidden.e[0][2], 5, 'moving body position is observed immediately');
    assert.equal(hidden.e[0][9], 1, 'root visibility changes are observed immediately');
    assert.notEqual(hidden.e[0][10], first.e[0][10], 'LOD/model identity changes are observed');

    const resumed = frame(32, 9, true, 'lod2');
    assert.equal(resumed.vfx, null, 'a second VFX slot remains inside the wall budget');
    assert.equal(resumed.px, undefined);
    assert.notEqual(resumed.e, hidden.e);
    assert.equal(resumed.e[0][2], 9);
    assert.equal(resumed.e[0][9], 3, 'visibility recovery is recorded on the next frame');
    assert.notEqual(resumed.e[0][10], hidden.e[0][10]);

    const probedVfx = frame(1000, 12, true, 'lod3');
    assert.ok(probedVfx.vfx, 'the VFX wall budget reopens');
    assert.equal(probedVfx.px, undefined);
    assert.equal(probedVfx.e[0][2], 12);
    assert.equal(probedVfx.e[0][9], 3);

    const probedPixel = frame(1032, 15, true, 'lod4');
    assert.equal(probedPixel.vfx, null, 'VFX keeps its own wall budget after the scan');
    assert.ok(probedPixel.px, 'the pixel wall budget reopens independently');
    assert.equal(probedPixel.e[0][2], 15);
    assert.ok(measures.includes('player-truth:reader:px'), 'pixel readback retains its timing tag');
  } finally {
    reader.dispose();
    geometry.dispose();
    material.dispose();
  }
});

test('preparation samples keep scalar state without scanning rows, then the first flight frame is fresh', () => {
  let callback = null;
  let wall = 0;
  let entityReads = 0;
  let meshReads = 0;
  const player = { id: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4 };
  const enemy = { id: 2, type: 'ship', alive: true, team: 2,
    pos: { x: 12, y: 0, z: 8 }, vel: { x: 0, z: 0 }, radius: 8, data: {} };
  const state = {
    mode: 'loading', simTime: 2, tick: 10, playerId: 1,
    render: { renderer: { domElement: null, info: { render: { calls: 7, triangles: 11 } } }, camera: null,
      scene: { traverseVisible() { throw new Error('preparation must not traverse the scene'); } },
      meshes: { get() { meshReads++; return null; } } },
  };
  Object.defineProperty(state, 'entityList', { get() { entityReads++; return [player, enemy]; } });
  const win = {
    innerWidth: 1280, innerHeight: 720,
    performance: { now: () => wall, measure() {}, clearMeasures() {} },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; },
    cancelAnimationFrame() {},
    SF: { THREE, state },
  };
  const reader = installPlayerTruthReader(win, { vfxEvery: 1, pxEvery: 1 });
  const frame = (at) => {
    wall = at; reader.start(); callback(); reader.stop();
    return reader.drain().samples[0];
  };

  try {
    const loading = frame(0);
    assert.equal(loading.mode, 'loading');
    assert.equal(loading.info.calls, 7, 'scalar renderer timing information remains available while loading');
    assert.equal(loading.p, null);
    assert.deepEqual(loading.e, [], 'preparation does not retain an entity census');
    assert.equal(loading.vfx, null);
    assert.equal(loading.px, undefined);
    assert.equal(entityReads, 0, 'loading does not walk the entity list');
    assert.equal(meshReads, 0, 'loading does not resolve per-entity meshes');

    state.mode = 'menu'; state.simTime = 2.05; state.tick = 10;
    const menu = frame(8);
    assert.equal(menu.mode, 'menu');
    assert.equal(menu.p, null);
    assert.deepEqual(menu.e, [], 'menu preparation does not retain an entity census');
    assert.equal(entityReads, 0, 'menu does not walk the entity list');
    assert.equal(meshReads, 0, 'menu does not resolve per-entity meshes');

    state.mode = 'flight'; state.simTime = 2.1; state.tick = 11;
    const firstFlight = frame(16);
    assert.equal(firstFlight.mode, 'flight');
    assert.ok(firstFlight.p, 'the first flight frame records the player immediately');
    assert.equal(firstFlight.e.length, 1, 'the first flight frame has a fresh enemy row');
    assert.equal(firstFlight.e[0][2], 12);
    assert.equal(entityReads, 1);
    assert.equal(meshReads, 2, 'the first flight frame resolves only its player and live entity meshes');
    assert.notEqual(firstFlight.e, loading.e, 'flight does not reuse the preparation array');

    enemy.pos.x = 24; state.simTime = 2.2; state.tick = 12;
    const nextFlight = frame(32);
    assert.equal(nextFlight.e[0][2], 24, 'subsequent flight frames remain fresh');
    assert.notEqual(nextFlight.e, firstFlight.e);
    assert.equal(entityReads, 2);
  } finally {
    reader.dispose();
  }
});
