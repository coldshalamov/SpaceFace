import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NpcCableFx } from '../src/render/combat/npcCableFx.js';
import { resolveMasslineAccessibilityPolicy } from '../src/render/vfx.js';
import { createGameState } from '../src/core/gameState.js';

test('borrowed Ceres cable uses the resident pool, follows both sockets, and retires on cast-off', t => {
  const state = createGameState(47), scene = new THREE.Scene();
  state.playerId = 1; state.render = { scene, interpolationAlpha: 1 };
  state.entities.set(2, { id: 2, alive: true, pos: { x: 10, z: 20 }, rot: Math.PI / 2 });
  state.entities.set(3, { id: 3, alive: true, pos: { x: 110, z: 120 }, rot: 0 });
  const line = { id: 'att_000001', defId: 'attachment_transport_clamp', controlMode: 'ceres_anchor_winch',
    ownerId: 2, targetId: 3, state: 'active', sourceAnchorLocal: { x: 2, z: 0 },
    targetAnchorLocal: { x: 0, z: -3 }, restLength: 150, lastTension: 200, load: .6 };
  state.combat = { attachments: { byId: { [line.id]: line } } };
  const fx = new NpcCableFx(scene, (x, z, out) => { out.x = x; out.z = z; }, resolveMasslineAccessibilityPolicy);
  t.after(() => fx.dispose());
  const pool = fx.cables.slice(), before = JSON.stringify(line);
  fx.update(state);
  const visible = () => fx.cables.filter(c => c.group.visible);
  assert.equal(visible().length, 1);
  assert.equal(visible()[0].group.userData.attachmentId, line.id);
  assert.deepEqual(fx.a, { x: 10, z: 22 }); assert.deepEqual(fx.b, { x: 110, z: 117 });
  assert.ok(visible()[0].core.geometry.drawRange.count > 0);
  assert.equal(JSON.stringify(line), before, 'presentation never mutates the constraint');
  state.settings.video.motionReduce = true; state.settings.accessibility.flashReduce = true;
  fx.update(state); assert.equal(visible().length, 1);
  assert.equal(visible()[0].group.children[0].material.uniforms.uPulseSpeed.value, 0);
  line.state = 'broken'; fx.update(state); assert.equal(visible().length, 0);
  assert.deepEqual(fx.cables, pool, 'no new meshes or pool slots');
});

test('ordinary transport clamps remain invisible as cables', t => {
  const state = createGameState(47), scene = new THREE.Scene();
  state.playerId = 1; state.render = { scene, interpolationAlpha: 1 };
  state.entities.set(2, { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0 });
  state.entities.set(3, { id: 3, alive: true, pos: { x: 100, z: 0 }, rot: 0 });
  state.combat = { attachments: { byId: { clamp: { id: 'clamp', state: 'active',
    defId: 'attachment_transport_clamp', ownerId: 2, targetId: 3, restLength: 100 } } } };
  const fx = new NpcCableFx(scene, (x, z, out) => { out.x = x; out.z = z; }, resolveMasslineAccessibilityPolicy);
  t.after(() => fx.dispose()); fx.update(state);
  assert.equal(fx.cables.filter(c => c.group.visible).length, 0);
});
