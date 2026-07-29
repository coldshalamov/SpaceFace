import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareActiveShadowCamera, render } from '../src/render/renderer.js';

function createShadowHarness({ enabled }) {
  const matrixCalls = [];
  const positions = { light: null, target: null };
  const shadowCamera = { name: 'shadow-camera' };
  const player = { pos: { x: 5080, z: -2180 } };

  const keyLight = {
    position: {
      set(x, y, z) { positions.light = [x, y, z]; },
    },
    target: {
      position: {
        set(x, y, z) { positions.target = [x, y, z]; },
      },
      updateMatrixWorld(force) { matrixCalls.push(['target', force]); },
    },
    updateMatrixWorld(force) { matrixCalls.push(['light', force]); },
    shadow: {
      camera: shadowCamera,
      updateMatrices(light) {
        assert.equal(light, keyLight, 'shadow matrices use the configured directional light');
        assert.deepEqual(matrixCalls, [['light', true], ['target', true]],
          'light and target matrices are current before the shadow camera updates');
        assert.deepEqual(positions.light, [340, 140, -140]);
        assert.deepEqual(positions.target, [280, 0, -180]);
        matrixCalls.push(['shadow', true]);
      },
    },
  };

  return {
    renderer: { shadowMap: { enabled } },
    _shadowSettingOn: true,
    _keyLight: keyLight,
    state: {
      playerId: 7,
      entities: new Map([[7, player]]),
    },
    _frameMembrane: {
      toLocal(pos, out) {
        assert.equal(pos, player.pos);
        out.x = pos.x - 4800;
        out.z = pos.z - (-2000);
        return out;
      },
    },
    keyLight,
    matrixCalls,
    positions,
    shadowCamera,
  };
}

test('zero-receiver shadow state skips follow, matrices, and asteroid shadow camera', () => {
  const harness = createShadowHarness({ enabled: false });

  render._updateShadowFollow.call(harness);
  const shadowCamera = prepareActiveShadowCamera(harness.renderer, harness.keyLight);

  assert.equal(harness._shadowSettingOn, true, 'the user setting may remain on with zero receivers');
  assert.equal(shadowCamera, null, 'inactive renderer shadow maps publish no culling camera');
  assert.deepEqual(harness.positions, { light: null, target: null }, 'inactive maps do not move the shadow rig');
  assert.deepEqual(harness.matrixCalls, [], 'inactive maps do no shadow matrix work');
});

test('active shadow state follows local player and prepares each matrix exactly once', () => {
  const harness = createShadowHarness({ enabled: true });

  render._updateShadowFollow.call(harness);
  assert.deepEqual(harness.positions.light, [340, 140, -140], 'key offset remains +60/+140/+40');
  assert.deepEqual(harness.positions.target, [280, 0, -180], 'target remains at local player XZ');
  assert.deepEqual(harness.matrixCalls, [], 'follow only positions the rig before matrix preparation');

  const shadowCamera = prepareActiveShadowCamera(harness.renderer, harness.keyLight);

  assert.equal(shadowCamera, harness.shadowCamera, 'active shadow camera is available to asteroid culling');
  assert.deepEqual(harness.matrixCalls, [['light', true], ['target', true], ['shadow', true]],
    'directional light and target matrices update once before shadow.updateMatrices');
});
