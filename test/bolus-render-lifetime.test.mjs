import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../src/data/theBolus.js';
import { syncBolusView, disposeBolusView } from '../src/render/bolusView.js';
import { syncMarrowCone, disposeMarrowCone } from '../src/render/marrowCone.js';
import { bolusCableStyle, applyBolusCableProfile } from '../src/render/bolusCable.js';
import { resolveMasslineCableProfile } from '../src/render/masslinePresentation.js';
import { createMasslineCenterline, writeMasslineCenterline, createMasslineRibbonSurface, writeMasslineRibbonSurface } from '../src/render/masslineCableSurface.js';

test('Bolus roots are lazy, retired with their scene, and rebuilt for a new seed', () => {
  const renderer = {
    scene: new THREE.Scene(),
    state: { meta: { seed: 7 }, simTime: 0, world: { currentSectorId: 'sector_helios' }, entityList: [] },
  };
  syncBolusView(renderer);
  syncMarrowCone(renderer);
  assert.equal(renderer.scene.children.length, 0, 'an ordinary sector allocates no interior scene');
  renderer.state.world.currentSectorId = BOLUS_SECTOR_ID;
  syncBolusView(renderer);
  syncMarrowCone(renderer);
  const oldView = renderer._bolusView;
  const oldSpot = renderer._marrowSpot;
  let released = 0;
  oldView.ribs[0].geometry.addEventListener('dispose', () => released++);
  disposeBolusView(renderer);
  disposeMarrowCone(renderer);
  assert.equal(released, 1);
  assert.equal(oldView.group.parent, null);
  assert.equal(oldSpot.parent, null);
  assert.equal(oldSpot.target.parent, null);
  assert.equal(renderer.scene.children.length, 0);
  renderer.scene = new THREE.Scene();
  syncBolusView(renderer);
  syncMarrowCone(renderer);
  assert.notEqual(renderer._bolusView, oldView);
  assert.equal(renderer._bolusView.group.parent, renderer.scene);
  const second = renderer._bolusView;
  renderer.state.meta.seed = 8;
  syncBolusView(renderer);
  assert.notEqual(renderer._bolusView, second);
  assert.equal(second.group.parent, null);
  const lost = renderer._bolusView;
  lost.ribs[0].geometry.addEventListener('dispose', () => released++);
  disposeBolusView(renderer, { disposeGpu: false });
  disposeMarrowCone(renderer, { disposeGpu: false });
  assert.equal(released, 1, 'lost-context retirement detaches without emitting GPU disposal');
});

test('uvula hold styles reach the resident cable shape without mutating attachments', () => {
  const attachment = Object.freeze({ state: 'active', ownerId: 1, targetId: 2 });
  const uvula = { id: 2, data: { bolus: { role: 'uvula', hold: 0.2 } } };
  const state = { playerId: 1, player: { tether: { phase: 'loaded' } },
    combat: { attachments: { byId: { line: attachment } } }, entityList: [uvula] };
  const line = createMasslineCenterline();
  const ribbon = createMasslineRibbonSurface();
  try {
    for (const [hold, sag, width] of [[0.2, 18, 1.2], [0.5, 0, 2.4]]) {
      uvula.data.bolus.hold = hold;
      const style = bolusCableStyle(state);
      const profile = applyBolusCableProfile(resolveMasslineCableProfile({ chord: 100, bowMagnitude: style.sag }), style);
      writeMasslineCenterline(line, { ax: 0, az: 0, dx: 100, dz: 0, px: 0, pz: 1, segments: profile.segments, slackBow: style.sag });
      writeMasslineRibbonSurface(ribbon, line, profile.coreHalfWidth, 1.5);
      assert.equal(style.sag, sag);
      assert.ok(Math.abs(ribbon.positions[2] - ribbon.positions[5] - width) < 0.2);
      assert.equal(profile.coreHalfWidth * 2, width);
      assert.ok(Math.abs(Math.max(...line.z.subarray(0, line.count)) - sag) < 0.3);
    }
    assert.equal(attachment.bolusCable, undefined);
  } finally { ribbon.geometry.dispose(); }
});
