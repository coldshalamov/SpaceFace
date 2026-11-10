import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { CHASE_CAMERA_DISTANCE, WeaponVfxPresenter } from '../src/render/weapons/index.js';
import { projectileSkipsVisualFactoryMesh } from '../src/render/weapons/recipes.js';

function chaseCamera() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
  camera.position.set(0, 54.9, -CHASE_CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
  return camera;
}

test('worker pulse projectiles reach the weapon presenter and retire through the lane', async () => {
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  const worker = createSimHost();
  let deliver;
  let resolveTick;
  let rejectTick;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') {
        worker.shutdown();
        return;
      }
      const operation = message.kind === 'init'
        ? worker.init({ ...message, scenarioContract })
        : message.kind === 'tick'
          ? worker.tick(message)
          : Promise.resolve({});
      Promise.resolve(operation).then((reply) => {
        const envelope = {
          kind: message.kind === 'init' ? 'ready' : 'tickDone',
          seq: message.seq,
          ...reply,
        };
        deliver(envelope);
        if (message.kind === 'tick' && resolveTick) {
          const resolve = resolveTick;
          resolveTick = null;
          rejectTick = null;
          resolve(envelope);
        }
      }, (error) => {
        deliver({ kind: 'error', seq: message.seq, message: String(error?.message || error),
          stack: error?.stack || null });
        if (message.kind === 'tick' && rejectTick) {
          const reject = rejectTick;
          resolveTick = null;
          rejectTick = null;
          reject(error);
        }
      });
    },
    onMessage(callback) { deliver = callback; },
    terminate() { worker.shutdown(); },
  });

  const state = createGameState(4242);
  const lane = createSimLaneRuntime({
    state,
    registry: {},
    bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory,
  });
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const camera = chaseCamera();
  const tick = () => new Promise((resolve, reject) => {
    resolveTick = resolve;
    rejectTick = reject;
    lane.runner.stepOnce();
  });

  try {
    await lane.readyPromise;
    const shot = worker.host.runtime.spawn({
      type: 'projectile',
      team: 0,
      ownerId: 1,
      radius: 0.7,
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 320, z: 0 },
      data: { weaponId: 'wpn_pulse_laser_s', damageType: 'energy' },
    });
    assert.equal(projectileSkipsVisualFactoryMesh(shot), true,
      'the starter pulse shot is deliberately excluded from generic projectile meshes');

    const firstReply = await tick();
    assert.ok(firstReply.weaponVfxProjectiles.some((row) => row.entityId === shot.id),
      'the worker ships the mesh-skipped pulse pose on its dedicated VFX channel');
    assert.equal(state.entities.has(shot.id), false,
      'the VFX row stays outside the authoritative entity map');
    assert.equal(state.weaponVfxProjectiles.length, 1,
      'the main lane reconciles the dedicated row into the presenter feed');

    presenter.update(1 / 60, { state, camera, interpolationAlpha: 1, viewportHeight: 1000 });
    assert.equal(presenter.bolts.live, 1, 'the main-thread presenter creates the visible bolt');
    assert.equal(presenter.bolts.pos.getX(0), 0);

    shot.prevPos.x = 0;
    shot.pos.x = 20;
    await tick();
    presenter.update(1 / 60, { state, camera, interpolationAlpha: 1, viewportHeight: 1000 });
    assert.equal(presenter.bolts.pos.getX(0), 20,
      'the presented bolt follows the current worker pose');

    worker.host.runtime.getSystem('core').helpers.removeEntity(shot.id, { immediate: true });
    await tick();
    presenter.update(1 / 60, { state, camera, interpolationAlpha: 1, viewportHeight: 1000 });
    assert.equal(state.weaponVfxProjectiles.length, 0,
      'the per-tick replacement channel removes retired projectiles');
    assert.equal(presenter.bolts.live, 0, 'the presenter releases a retired bolt');
  } finally {
    presenter.dispose();
    lane.close();
    worker.shutdown();
  }
});
