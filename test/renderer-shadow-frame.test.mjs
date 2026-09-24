import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareActiveShadowCamera, render } from '../src/render/renderer.js';
import { SHADOW_TEXEL_WORLD_SIZE } from '../src/render/shadowCasterPolicy.js';

// The thesis under test is that the RESOLVED RECEIVER TALLY, not the user setting or the pinned
// program-key flags, is what gates per-frame shadow work. shadowMap.enabled and castShadow stay
// pinned while the setting is on because both are baked into every lit material's program key —
// flapping them with the tally rekeyed the scene and linked variants inside presented frames.
// So the harness must never hand-write renderer.shadowMap.enabled — it drives the real
// _syncShadowMapEnabled from a settings flag plus a controllable receiver count, exactly as
// prepareFrame does, and publishes the tally-derived camera the way the frame loop does.
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
      return prepareActiveShadowCamera(
        harness.renderer, harness.keyLight, harness._shadowReceiverCount,
      );
    },
    setReceivers(next) {
      receiverCount = next;
      harness._shadowReceiversDirty = true;
    },
  };
  return harness;
}

test('zero receivers gate the depth pass and culling camera while the program-key flags stay pinned', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 0 });

  const shadowCamera = harness.frame();

  // Both halves of the split are observed, not assumed: the setting is untouched, and the
  // key-visible flags stay armed so live programs and admission compiles agree on one variant.
  assert.equal(harness._shadowSettingOn, true, 'zero receivers must not rewrite the user setting');
  assert.equal(harness.renderer.shadowMap.enabled, true,
    'the key-visible map flag stays pinned while the setting is on');
  assert.equal(harness.keyLight.castShadow, true,
    'numDirLightShadows must not flap with the receiver tally');
  assert.equal(shadowCamera, null, 'zero receivers still publish no culling camera');
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

function assertVec3Close(actual, expected, eps, message) {
  assert.ok(actual, `${message}: missing position`);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < eps,
      `${message}: component ${i} ${actual[i]} vs ${expected[i]}`);
  }
}

test('an active shadow map follows the local player and prepares each matrix exactly once', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 3 });

  const shadowCamera = harness.frame();

  assert.equal(harness.renderer.shadowMap.enabled, true);
  assert.equal(harness.keyLight.castShadow, true);
  // The follow point snaps on the shadow camera's own u/v/w lattice — light-direction space, not
  // world XZ — so a tilted key light still lands texels on fixed world surfaces. The target can
  // leave the y=0 plane by a fraction of a texel; the light-to-target direction is unchanged.
  assertVec3Close(harness.positions.light, [340.1021, 139.9761, -140.1583], 1e-3,
    'key offset remains +60/+140/+40 on the stable shadow-camera lattice');
  assertVec3Close(harness.positions.target, [280.1021, -0.0239, -180.1583], 1e-3,
    'target follows the local player at shadow-texel resolution');
  const dir = harness.positions.light.map((v, i) => v - harness.positions.target[i]);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  assertVec3Close(dir.map((v) => v / len), [60 / Math.hypot(60, 140, 40),
    140 / Math.hypot(60, 140, 40), 40 / Math.hypot(60, 140, 40)], 1e-6,
    'the authored light direction survives the snap exactly');
  assert.equal(shadowCamera, harness.shadowCamera, 'the prepared camera reaches asteroid culling');
  assert.deepEqual(harness.matrixCalls, [['light', true], ['target', true], ['shadow', true]],
    'light and target matrices update once each, before shadow.updateMatrices');
});

test('re-enabling shadows re-follows the moved player before the culling camera is published', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 2 });

  assert.equal(harness.frame(), harness.shadowCamera, 'baseline frame renders shadows');
  assertVec3Close(harness.positions.light, [340.1021, 139.9761, -140.1583], 1e-3);

  // Every receiver disappears. The tally now gates the camera publication; the rig may still
  // follow (a moving node costs nothing when no map renders), but no camera is published.
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
  assertVec3Close(harness.positions.light, [159.8512, 139.9133, 139.6653], 1e-3,
    'the rig re-followed to the NEW quantized position');
  assertVec3Close(harness.positions.target, [99.8512, -0.0867, 99.6653], 1e-3);
  assert.deepEqual(harness.matrixCalls, [['light', true], ['target', true], ['shadow', true]],
    'the re-enabled frame refreshes the matrices before publishing the camera');
});

test('shadow follow stays stable within one texel and defers a crossing until commit', () => {
  const harness = createShadowHarness({ shadowSetting: true, receivers: 1 });
  assert.equal(harness.frame(), harness.shadowCamera);
  const firstLight = [...harness.positions.light];
  const firstTarget = [...harness.positions.target];

  harness.player.pos.x += SHADOW_TEXEL_WORLD_SIZE * 0.25;
  assert.equal(render._updateShadowFollow.call(harness, false), false);
  assert.deepEqual(harness.positions.light, firstLight);
  assert.deepEqual(harness.positions.target, firstTarget);

  harness.player.pos.x += SHADOW_TEXEL_WORLD_SIZE;
  assert.equal(render._updateShadowFollow.call(harness, false), true);
  assert.deepEqual(harness.positions.light, firstLight, 'a scheduled refresh owns the light move');
  assert.equal(render._updateShadowFollow.call(harness, true), true);
  assert.notDeepEqual(harness.positions.light, firstLight);
});
