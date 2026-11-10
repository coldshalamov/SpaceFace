import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../src/data/theBolus.js';
import { syncBolusView, disposeBolusView } from '../src/render/bolusView.js';
import { syncMarrowCone, disposeMarrowCone } from '../src/render/marrowCone.js';
import { lightCensusSignature, shadowCensusEpoch } from '../src/render/shadowDepthAdmission.js';

test('Bolus lights invalidate census on membership changes and remain stable across exit and reentry', () => {
  const renderer = {
    scene: new THREE.Scene(),
    state: { meta: { seed: 7 }, simTime: 0, world: { currentSectorId: 'sector_helios' }, entityList: [] },
    _frameMembrane: { toLocal(pos, out) { out.x = pos.x - 100; out.z = pos.z + 50; return out; } },
  };
  const initialEpoch = shadowCensusEpoch();
  const emptySignature = lightCensusSignature(renderer.scene);
  syncBolusView(renderer);
  syncMarrowCone(renderer);
  assert.equal(shadowCensusEpoch(), initialEpoch, 'ordinary sectors allocate and invalidate nothing');

  try {
    renderer.state.world.currentSectorId = BOLUS_SECTOR_ID;
    syncBolusView(renderer);
    assert.ok(shadowCensusEpoch() > initialEpoch, 'first lantern mount invalidates the memo');
    const lanternEpoch = shadowCensusEpoch();
    syncMarrowCone(renderer);
    assert.ok(shadowCensusEpoch() > lanternEpoch, 'first spotlight mount also invalidates the memo');
    const view = renderer._bolusView;
    const spot = renderer._marrowSpot;
    const mountedEpoch = shadowCensusEpoch();
    const mountedSignature = lightCensusSignature(renderer.scene);
    assert.notEqual(mountedSignature, emptySignature);
    assert.deepEqual(view.lightGroup.position.toArray(), view.group.position.toArray());
    assert.ok(view.lights.every((light) => light.intensity > 0));
    assert.ok(spot.intensity > 0);

    renderer.state.world.currentSectorId = 'sector_helios';
    syncBolusView(renderer);
    syncMarrowCone(renderer);
    assert.equal(view.group.visible, false);
    assert.ok(view.lights.every((light) => light.intensity === 0));
    assert.equal(spot.intensity, 0);
    assert.equal(lightCensusSignature(renderer.scene), mountedSignature,
      'inactive lights remain in the same rendered census');
    assert.equal(shadowCensusEpoch(), mountedEpoch);

    renderer.state.world.currentSectorId = BOLUS_SECTOR_ID;
    syncBolusView(renderer);
    syncMarrowCone(renderer);
    assert.equal(renderer._bolusView, view);
    assert.equal(renderer._marrowSpot, spot);
    assert.ok(view.lights.every((light) => light.intensity > 0));
    assert.ok(spot.intensity > 0);
    assert.equal(lightCensusSignature(renderer.scene), mountedSignature);
    assert.equal(shadowCensusEpoch(), mountedEpoch);

    disposeBolusView(renderer);
    assert.ok(shadowCensusEpoch() > mountedEpoch, 'lantern teardown invalidates the memo');
    const afterLanternRemoval = shadowCensusEpoch();
    disposeMarrowCone(renderer);
    assert.ok(shadowCensusEpoch() > afterLanternRemoval, 'spotlight teardown invalidates the memo');
    assert.equal(lightCensusSignature(renderer.scene), emptySignature);
    assert.equal(view.lightGroup.parent, null);
    const retiredEpoch = shadowCensusEpoch();
    disposeBolusView(renderer);
    disposeMarrowCone(renderer);
    assert.equal(shadowCensusEpoch(), retiredEpoch, 'repeat retirement does not invalidate');
  } finally {
    disposeBolusView(renderer);
    disposeMarrowCone(renderer);
  }
});
