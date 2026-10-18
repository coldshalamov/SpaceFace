import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { vfx } from '../src/render/vfx.js';

async function fixture(t) {
  const worker = createSimHost();
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  let deliver, resolveTick, rejectTick, requestedSteps = 1;
  const state = createGameState(4242);
  const lane = createSimLaneRuntime({ state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      post(message) {
        if (message.kind === 'shutdown') return worker.shutdown();
        const operation = message.kind === 'init'
          ? worker.init({ ...message, scenarioContract }) : worker.tick({ ...message, steps: requestedSteps });
        Promise.resolve(operation).then(reply => {
          const envelope = { kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply };
          // Match the worker boundary: no shared attachment objects can leak into the renderer.
          deliver(structuredClone(envelope));
          if (message.kind === 'tick') resolveTick(envelope);
        }, error => {
          deliver({ kind: 'error', seq: message.seq, message: error.message });
          rejectTick?.(error);
        });
      },
      onMessage(callback) { deliver = callback; },
      terminate() { worker.shutdown(); },
    }),
  });
  t.after(() => { lane.close(); worker.shutdown(); });
  await lane.readyPromise;
  const physics = worker.host.runtime.getSystem('physics');
  assert.equal(await physics.prepareBackend(worker.host.state), true);
  worker.host.state.mode = 'flight';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
  camera.position.set(0, 300, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  state.render = { scene, camera, interpolationAlpha: 1 };
  state.settings.video.particleQuality = 'low';
  state.settings.video.engineTrails = false;
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: { player: () => state.entities.get(state.playerId) } });
  t.after(() => system.destroy());
  const tick = (steps = 0) => new Promise((resolve, reject) => {
    // Zero-step replies exercise the real transport with a fixed physical load sample;
    // one-step replies below exercise the native body's live pose publication.
    requestedSteps = steps;
    resolveTick = resolve; rejectTick = reject;
    lane.runner.stepOnce();
  });
  const kernel = worker.host.runtime.getSystem('combat').kernel;
  const ship = (x, z = 0) => worker.host.runtime.spawn({
    type: 'ship', team: 0, radius: 6, mass: 80, hull: 100, hullMax: 100,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    data: { ai: { passive: true }, intent: { fire: false, thrust: 0, turn: 0 } },
  });
  worker.host.state.playerId = ship(0, 100).id;
  const line = (owner, target, controlMode, controller = null) => {
    physics._sg02.syncFromEntities(worker.host.state.entityList);
    const result = kernel.attachments.create({ defId: 'tether_standard',
      ownerId: owner.id, targetId: target.id, controlMode,
      ...(controller ? { controllerId: controller.id } : {}),
      sourceWorld: { x: owner.pos.x + 5, z: owner.pos.z },
      targetWorld: { x: target.pos.x - 5, z: target.pos.z },
    });
    assert.equal(result.ok, true, result.reason);
    return result.attachment;
  };
  const draw = () => system.update(1 / 60);
  const visible = () => scene.getObjectByName('SF_NpcMasslineCables')?.children.filter(child => child.visible) || [];
  return { worker, state, scene, camera, system, kernel, physics, ship, line, tick, draw, visible };
}

function assertAnchors(cable, source, target, originX = 0, originZ = 0) {
  const positions = cable.children[0].geometry.attributes.position;
  // Average the ribbon's two edges to recover each attachment point.
  const last = cable.children[0].geometry.drawRange.count / 6 * 2;
  assert.ok(Math.abs((positions.getX(0) + positions.getX(1)) / 2 - (source.x + 5 - originX)) < 1e-3);
  assert.ok(Math.abs((positions.getZ(0) + positions.getZ(1)) / 2 - (source.z - originZ)) < 1e-3);
  assert.ok(Math.abs((positions.getX(last) + positions.getX(last + 1)) / 2 - (target.x - 5 - originX)) < 1e-3);
  assert.ok(Math.abs((positions.getZ(last) + positions.getZ(last + 1)) / 2 - (target.z - originZ)) < 1e-3);
}

for (const controlMode of ['bounty_contest', 'wingman_brace', 'npc_tow']) {
  test(`${controlMode}: real worker attachment draws one persistent cable and retires on break`, async t => {
    const f = await fixture(t);
    const owner = f.ship(-50), target = f.ship(50);
    const link = f.line(owner, target, controlMode);
    link.lastTension = link.tetherPolicy.break.maxTension * 0.6;
    const reply = await f.tick();
    const shipped = f.state.combat.attachments.byId[link.id];
    assert.ok(reply.domainUpdates.some(u => u.segs.join('.') === 'combat.attachments'));
    for (const key of ['id', 'ownerId', 'targetId', 'state', 'lastTension', 'controlMode']) {
      assert.equal(shipped[key], link[key], `real transport preserves ${key}`);
    }
    assert.notEqual(shipped, link, 'rendering uses a transported record, not the simulation object');
    f.draw();
    assert.equal(f.visible().length, 1, 'an active NPC attachment must draw exactly one cable');
    const cable = f.visible()[0];
    assert.equal(cable.userData.attachmentId, link.id);
    assertAnchors(cable, owner.pos, target.pos);
    assert.equal(cable.children[0].material.uniforms.uTension.value, 0.6);
    const initialWidth = Math.abs(cable.children[0].geometry.attributes.position.getZ(1)
      - cable.children[0].geometry.attributes.position.getZ(0));
    const color = cable.children[0].material.uniforms.uColor.value.clone();
    assert.equal(f.physics._sg02.applyImpulse({ entityId: owner.id, impulse: { x: 0, z: 1600 } }), true);
    f.physics._sg02.applyImpulse({ entityId: target.id, impulse: { x: 0, z: 1600 } });
    await f.tick(1);
    await f.tick(1);
    link.lastTension = link.tetherPolicy.break.maxTension * 0.9;
    await f.tick(); f.draw();
    assert.equal(f.visible()[0], cable, 'the mesh is pooled across moving worker replies');
    assert.ok(f.state.entities.get(owner.id).pos.z > 0, 'a real native-body step publishes a moved endpoint');
    assertAnchors(cable, f.state.entities.get(owner.id).pos, f.state.entities.get(target.id).pos);
    assert.equal(cable.children[0].material.uniforms.uTension.value, 0.9);
    assert.notDeepEqual(cable.children[0].material.uniforms.uColor.value, color);
    assert.ok(Math.abs(cable.children[0].geometry.attributes.position.getZ(1)
      - cable.children[0].geometry.attributes.position.getZ(0)) > initialWidth,
    'real line load widens the same authored cable profile');
    f.draw();
    assert.equal(f.visible().length, 1, 'no event refresh is required for the persistent cable');
    assert.equal(f.kernel.attachments.breakAttachment(link.id, 'manual_cut', owner.id).ok, true);
    await f.tick(); f.draw();
    assert.equal(f.state.combat.attachments.byId[link.id].state, 'broken');
    assert.equal(f.visible().length, 0, 'a transported cut removes the cable on the next reply');
  });
}

test('real worker batch: cap six, nearest first, cull both offscreen, preserve player cable and pooled buffers', async t => {
  const f = await fixture(t);
  const links = [];
  for (let i = 8; i >= 0; i--) {
    const owner = f.ship(-50, i * 8), target = f.ship(50, i * 8);
    links.push(f.line(owner, target, i % 2 ? 'wingman_brace' : 'bounty_contest'));
  }
  const offscreen = f.line(f.ship(10000), f.ship(10100), 'npc_tow');
  const player = f.worker.host.state.entities.get(f.worker.host.state.playerId);
  const target = f.ship(100);
  const playerLine = f.line(player, target, 'player');
  const playerTether = { active: true, attachmentId: playerLine.id,
    targetId: target.id, restLength: playerLine.restLength, strain: 0, load: 0.55, phase: 'loaded' };
  const targeted = f.line(f.ship(70), player, 'bounty_contest');
  const remote = f.line(f.ship(-40), f.ship(40), 'remote', player);
  await f.tick();
  f.state.player.tether = playerTether;
  f.draw();
  assert.equal(f.visible().length, 6);
  const expected = links.slice(-6).reverse().map(link => link.id);
  assert.deepEqual(f.visible().map(cable => cable.userData.attachmentId), expected);
  assert.ok(!f.visible().some(cable => [offscreen.id, playerLine.id, targeted.id, remote.id].includes(cable.userData.attachmentId)));
  assert.equal(f.system._tetherCable.mesh.visible, true, 'the original player renderer keeps its cable');
  const pool = f.scene.getObjectByName('SF_NpcMasslineCables');
  const playerBytes = f.system._tetherCable.core.positions.slice();
  f.system._npcCableFx.update(f.state);
  assert.deepEqual(f.system._tetherCable.core.positions, playerBytes,
    'NPC presentation leaves the existing player cable buffer byte-identical');
  const geometries = pool.children.map(cable => cable.children[0].geometry.attributes.position.array);
  f.draw();
  assert.equal(pool.children.length, 6, 'the hard pool never grows');
  for (let i = 0; i < pool.children.length; i++) {
    assert.equal(pool.children[i].children[0].geometry.attributes.position.array, geometries[i]);
  }

  f.camera.position.x = 10050; f.camera.lookAt(10050, 0, 0); f.camera.updateMatrixWorld();
  f.draw();
  assert.deepEqual(f.visible().map(cable => cable.userData.attachmentId), [offscreen.id]);
  f.camera.position.x = 0; f.camera.lookAt(0, 0, 0); f.camera.updateMatrixWorld();
  f.state.settings.video.motionReduce = true;
  f.state.settings.accessibility.flashReduce = true;
  f.draw();
  assert.equal(f.visible().length, 6, 'accessibility preserves the load-bearing cables');
  assert.equal(f.visible()[0].children[0].material.uniforms.uPulseSpeed.value, 0);
  for (const link of links) f.kernel.attachments.breakAttachment(link.id, 'manual_cut', link.ownerId);
  await f.tick(); f.draw();
  assert.equal(f.visible().length, 0, 'large attachment tables also retire on the next worker reply');
  assert.equal(f.system._tetherCable.mesh.visible, true);
  assert.ok(f.system._vfxOwnerRoots().includes(pool), 'renderer lifetime tracking owns the cable pool');
  f.system.destroy();
  assert.equal(pool.parent, null, 'teardown removes all pooled meshes');
});
