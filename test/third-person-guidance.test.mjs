import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { render } from '../src/render/renderer.js';
import { objectiveBearingGlyph, objectiveBearingDeg } from '../src/ui/hud.js';
import { resolveFlightEdgePlacement, resolveSelectedTargetMarker } from '../src/ui/flightViewProjection.js';

function fixture(yaw) {
  const player = { id: 1, pos: { x: 700, z: -900 }, rot: yaw };
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  camera.position.set(player.pos.x - fx * 58, 22, player.pos.z - fz * 58);
  camera.lookAt(player.pos.x + fx * 36, 0, player.pos.z + fz * 36);
  camera.updateMatrixWorld();
  const host = Object.assign(Object.create(render), { cam: { obj: camera }, _frameMembrane: null });
  const state = { entities: new Map([[1, player]]), playerId: 1, settings: { gameplay: { steeringView: 'racing' } }, camera: { obj: camera } };
  return { player, state, host, target(forward, right = 0) {
    return { alive: true, pos: { x: player.pos.x + fx * forward - fz * right, z: player.pos.z + fz * forward + fx * right } };
  } };
}

test('selected contact and objective edge directions follow each chase heading, including aft', () => {
  const old = globalThis.window; globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const f = fixture(yaw);
      for (const [forward, right, edge, glyph] of [[-500, 0, 'bottom', '↓'], [0, 500, 'right', '→'], [0, -500, 'left', '←']]) {
        const target = f.target(forward, right), projected = f.host.worldToScreen(target.pos);
        const marker = resolveSelectedTargetMarker(f.player, target, projected, 1280, 720);
        assert.equal(marker.offscreen, true);
        assert.equal(marker.edge, edge, `selected target edge, yaw ${yaw}`);
        assert.equal(resolveFlightEdgePlacement(1280, 720, projected).edge, edge, 'objective uses the same bearing');
        assert.equal(objectiveBearingGlyph(f.state, { pos: target.pos }), glyph);
        if (forward < 0) assert.equal(marker.aft, true);
      }
      assert.equal(objectiveBearingGlyph(f.state, { pos: f.target(500).pos }), '↑');
      assert.ok(Math.abs(objectiveBearingDeg(f.state, { pos: f.target(500).pos })) < 1e-6);
    }
  } finally { if (old === undefined) delete globalThis.window; else globalThis.window = old; }
});

test('unarmed selected targets transition from on-screen to edge and clear when destroyed', () => {
  const f = fixture(0), target = f.target(100), out = {};
  const before = JSON.stringify(target);
  assert.equal(resolveSelectedTargetMarker(f.player, target, { x: 500, y: 300, onScreen: true }, 1280, 720, out), out);
  assert.equal(out.offscreen, false); assert.equal(out.x, 500);
  resolveSelectedTargetMarker(f.player, target, { x: 1500, y: 300, onScreen: false }, 1280, 720, out);
  assert.equal(out.offscreen, true); assert.equal(out.edge, 'right'); assert.ok(out.x < 1280);
  assert.equal(JSON.stringify(target), before, 'guidance never writes an entity');
  target.alive = false;
  assert.equal(resolveSelectedTargetMarker(f.player, target, { x: 500, y: 300 }, 1280, 720), null);
  assert.equal(resolveSelectedTargetMarker(f.player, null, { x: 500, y: 300 }, 1280, 720), null);
});

test('near-centered aft projection remains a finite downward cue on narrow screens', () => {
  const edge = resolveFlightEdgePlacement(360, 640, { x: 180, y: 320, behind: true }, 34);
  assert.equal(edge.edge, 'bottom'); assert.equal(edge.y, 606);
  assert.ok(Number.isFinite(edge.x) && Number.isFinite(edge.angleRad));
});

test('bearing follows camera turn lag, while overhead retains fixed world orientation', () => {
  const f = fixture(0), point = f.target(500);
  f.player.rot = Math.PI;
  assert.equal(objectiveBearingGlyph(f.state, { pos: point.pos }), '↑', 'picture, not ahead-of-camera hull yaw');
  f.state.settings.gameplay.steeringView = 'overhead';
  assert.equal(objectiveBearingGlyph(f.state, { pos: point.pos }), '←');
});
