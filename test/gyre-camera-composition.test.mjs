import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createChaseCamera, GYRE_COMPOSITION_ZOOM_MAX, GYRE_BOWL_COMPOSITION_ZOOM_MAX } from '../src/render/camera.js';

const DT = 1 / 60;
function fixture(axis, reduced = false, zoom = 144) {
  const player = {
    id: 1, type: 'ship', alive: true, hull: 100, team: 0, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 120, bank: 0, data: {},
  };
  const maw = { x: 0, z: 0 }, corePos = { x: 0, z: 0 };
  maw[axis] = 200;
  corePos[axis] = 200 + 64 * 1.2;
  const state = {
    playerId: 1, entities: new Map([[1, player]]),
    player: { cruise: null, tether: { active: false }, flybyFocus: { active: false } },
    settings: { video: { fov: 50, motionReduce: reduced } },
    camera: { zoom, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null }, world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
    gyreSnare: { phase: 'holding', maw, endRadius: 86, coreId: 2, corePos, clumpRadius: 64 },
  };
  const controller = createChaseCamera(state, { innerWidth: 1600, innerHeight: 900 });
  controller.snapToPlayer();
  return { state, controller, player };
}

function steps(controller, count) {
  for (let i = 0; i < count; i++) controller.follow(DT);
}

function projectedExtent(camera, pos, radius) {
  camera.updateMatrixWorld(true);
  let largest = 0;
  for (let latitude = -4; latitude <= 4; latitude++) {
    const elevation = latitude * Math.PI / 8;
    for (let longitude = 0; longitude < 24; longitude++) {
      const heading = longitude * Math.PI / 12;
      const p = new THREE.Vector3(
        pos.x + Math.cos(heading) * Math.cos(elevation) * radius,
        Math.sin(elevation) * radius,
        pos.z + Math.sin(heading) * Math.cos(elevation) * radius,
      ).project(camera);
      largest = Math.max(largest, Math.abs(p.x), Math.abs(p.y));
    }
  }
  return largest;
}

for (const axis of ['x', 'z']) {
  for (const reduced of [false, true]) {
    test(`Gyre +${axis.toUpperCase()} fits player, mouth and orbiting radius64 payload${reduced ? ' with reduced motion' : ''}`, () => {
      const { state, controller, player } = fixture(axis, reduced);
      steps(controller, 300);
      const g = state.gyreSnare;
      for (const [name, pos, radius] of [
        ['player', player.pos, player.radius], ['mouth', g.maw, g.endRadius], ['payload', g.corePos, g.clumpRadius],
      ]) {
        const edge = projectedExtent(controller.obj, pos, radius);
        assert.ok(edge < 0.95, `${name} clipped at NDC ${edge}`);
      }
      assert.equal(state.camera.zoom, 144, 'context does not overwrite the manual zoom');
      assert.ok(controller.zoomDiagnostics().dynamicZoom <= GYRE_COMPOSITION_ZOOM_MAX);
    });
  }
}

test('Gyre entry and release use bounded camera motion and return to the selected manual zoom', () => {
  const { state, controller } = fixture('z', false, 260);
  const g = state.gyreSnare;
  g.phase = 'off';
  steps(controller, 240);
  const ordinary = controller.zoomDiagnostics().dynamicZoom;
  g.phase = 'holding';
  let previous = ordinary;
  for (let i = 0; i < 300; i++) {
    controller.follow(DT);
    const zoom = controller.zoomDiagnostics().dynamicZoom;
    assert.ok(Math.abs(zoom - previous) <= 5.501, 'entry respects existing 330 WU/s camera limit');
    previous = zoom;
  }
  const held = previous;
  g.phase = 'off';
  // Release keeps the last work area briefly, then damps home without snapping its larger cap.
  for (let i = 0; i < 600; i++) {
    controller.follow(DT);
    const zoom = controller.zoomDiagnostics().dynamicZoom;
    assert.ok(Math.abs(zoom - previous) <= 5.501, 'release respects existing camera rate limit');
    if (i === 10) assert.ok(zoom >= held - 1, 'held composition survives the release beat');
    previous = zoom;
  }
  assert.ok(Math.abs(previous - ordinary) < 0.1, `returns to ordinary ${ordinary}, got ${previous}`);
  assert.equal(state.camera.zoom, 260);
});

test('an old launched ball does not start a new Gyre camera composition', () => {
  const { state, controller } = fixture('x');
  state.gyreSnare.phase = 'off';
  state.gyreSnare.launchedId = 2;
  state.gyreSnare.ballPos = { x: 420, z: 0 };
  steps(controller, 240);
  assert.ok(controller.zoomDiagnostics().dynamicZoom < 145);
});

for (const axis of ['x', 'z']) {
  test(`the first launched +${axis.toUpperCase()} ball's three-hit payoff stays framed for 1.6 seconds`, () => {
    const { state, controller, player } = fixture(axis);
    const g = state.gyreSnare;
    g.corePos[axis] = 200;
    steps(controller, 300);
    g.phase = 'launching';
    g.launchedId = g.coreId;
    g.ballPos = { ...g.corePos };
    for (let tick = 1; tick <= 90; tick++) {
      g.ballPos[axis] = 200 + 326 * Math.min(tick / 65, 1);
      g.ballVx = axis === 'x' && tick <= 65 ? 326 / (65 * DT) : 0;
      g.ballVz = axis === 'z' && tick <= 65 ? 326 / (65 * DT) : 0;
      controller.follow(DT);
      if (tick === 65 || tick === 90) {
        const edge = projectedExtent(controller.obj, g.ballPos, 64);
        assert.ok(edge < .98, `ball at tick ${tick} must be visible: edge=${edge}, zoom=${controller.zoomDiagnostics().dynamicZoom}`);
        assert.ok(projectedExtent(controller.obj, player.pos, player.radius) < .95, 'ship remains visible');
      }
      assert.ok(controller.zoomDiagnostics().dynamicZoom <= GYRE_BOWL_COMPOSITION_ZOOM_MAX);
    }
    assert.equal(state.camera.zoom, 144);
    steps(controller, 600);
    assert.ok(controller.zoomDiagnostics().dynamicZoom < 145, 'returns home despite the old ball remaining alive');
  });
}
