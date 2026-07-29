import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareActiveShadowCamera, render } from '../src/render/renderer.js';

// The thesis under test is that the RENDERER'S shadow-map state, not the user's shadows setting, is
// what gates per-frame shadow work: the setting can stay on while zero receivers disable the map.
// So the harness must never hand-write renderer.shadowMap.enabled — it drives the real
// _syncShadowMapEnabled from a settings flag plus a controllable receiver count, exactly as
// prepareFrame does. Hardcoding the boolean would leave the derivation untested, and a regression
// that stopped clearing it at zero receivers would sail through green.
function createShadowHarness({ shadowSetting = true, receivers = 1 } = {}) {
  const matrixCalls = [];
  const positions = { light: null, target: null };
  const shadowCamera = { name: 'shadow-camera' };
  const player = { pos: { x: 5080, z: -2180 } };
  let receiverCount = receivers;

  const keyLight = {
    castShadow: false,
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
        matrixCalls.push(['shadow', true]);
      },
    },
  };

  const harness = {
    renderer: { shadowMap: { enabled: false } },
    scene: {
      // _syncShadowMapEnabled counts receivers by traversing the scene; yield exactly as many
      // shadow-receiving objects as the test asked for.
      traverse(visit) {
        for (let i = 0; i < receiverCount; i++) visit({ receiveShadow: true });
        visit({ receiveShadow: false });
      },
    },
    _shadowSettingOn: shadowSetting,
    _shadowReceiversDirty: true,
    _shadowReceiverCount: 0,
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
    player,
    // Re-run the ordering prepareFrame uses: derive the map state, follow, then prepare the camera
    // the asteroid pool consumes. Returns whatever would be assigned to asteroid culling.
    frame() {
      matrixCalls.length = 0;
      positions.light = null;
      positions.target = null;
      render._syncShadowMapEnabled.call(harness);
      render._updateShadowFollow.call(harness);
      return prepareActiveShadowCamera(harness.renderer, harness.keyLight);
    },
    setReceivers(next) {
      receiverCount = next;
      harness._shadowReceiversDirty = true;
    },
  };
  return harness;
}

test('the shadows setting stays on at zero receivers while the map itself gates the work', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 0 });

  const shadowCamera = harness.frame();

  // Both halves of the split are observed, not assumed: the setting is untouched, and the map the
  // real derivation produced from it is off.
  assert.equal(harness._shadowSettingOn, true, 'zero receivers must not rewrite the user setting');
  assert.equal(harness.renderer.shadowMap.enabled, false,
    'the derivation clears the map when nothing can receive a shadow');
  assert.equal(harness.keyLight.castShadow, false);
  assert.equal(shadowCamera, null, 'an inactive shadow map publishes no culling camera');
  assert.deepEqual(harness.positions, { light: null, target: null }, 'the shadow rig is not moved');
  assert.deepEqual(harness.matrixCalls, [], 'no shadow matrix work is performed');
});

test('the shadows setting off gates the work regardless of receiver count', () => {
  const harness = createShadowHarness({ shadowSetting: false, receivers: 12 });

  const shadowCamera = harness.frame();

  assert.equal(harness.renderer.shadowMap.enabled, false);
  assert.equal(harness.keyLight.castShadow, false);
  assert.equal(shadowCamera, null);
  assert.deepEqual(harness.matrixCalls, []);
});

test('an active shadow map follows the local player and prepares each matrix exactly once', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 3 });

  const shadowCamera = harness.frame();

  assert.equal(harness.renderer.shadowMap.enabled, true);
  assert.equal(harness.keyLight.castShadow, true);
  assert.deepEqual(harness.positions.light, [340, 140, -140], 'key offset remains +60/+140/+40');
  assert.deepEqual(harness.positions.target, [280, 0, -180], 'target remains at local player XZ');
  assert.equal(shadowCamera, harness.shadowCamera, 'the prepared camera reaches asteroid culling');
  assert.deepEqual(harness.matrixCalls, [['light', true], ['target', true], ['shadow', true]],
    'light and target matrices update once each, before shadow.updateMatrices');
});

test('re-enabling shadows re-follows the moved player before the culling camera is published', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 2 });

  assert.equal(harness.frame(), harness.shadowCamera, 'baseline frame renders shadows');
  assert.deepEqual(harness.positions.light, [340, 140, -140]);

  // Every receiver disappears. The follow now early-returns, so the key light FREEZES where it was.
  harness.setReceivers(0);
  assert.equal(harness.frame(), null, 'a zero-receiver frame publishes no camera');
  assert.deepEqual(harness.matrixCalls, [], 'and does no matrix work');

  // The player travels while shadows are off, then receivers come back. If the re-enabled frame
  // published a camera without re-following first, asteroid culling would receive a shadow frustum
  // centred on the stale pre-disable position and could drop rocks that cast into view.
  harness.player.pos.x = 4900;
  harness.player.pos.z = -1900;
  harness.setReceivers(2);

  const shadowCamera = harness.frame();

  assert.equal(shadowCamera, harness.shadowCamera);
  assert.deepEqual(harness.positions.light, [160, 140, 140], 'the rig re-followed to the NEW position');
  assert.deepEqual(harness.positions.target, [100, 0, 100]);
  assert.deepEqual(harness.matrixCalls, [['light', true], ['target', true], ['shadow', true]],
    'the re-enabled frame refreshes the matrices before publishing the camera');
});
