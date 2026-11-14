import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion } from 'three';
import { fitLegacyMultiroleFins } from '../src/render/modularMultiroleFinPlacement.js';
import { handedFinPlacement } from '../src/render/modularFinHandedness.js';

const hull = { assetId: 'SF_HULL_MULTIROLE' };
const cockpit = { assetId: 'SF_COCKPIT_RECESSED' };
const fin = { assetId: 'SF_PART_FIN_SWEPT_SMUGGLER', url: 'fins/fin_swept_smuggler.glb' };
function authoredPlacements() {
  const bytes = readFileSync(new URL('../assets/ships/release/parts/hulls/hull_multirole.glb', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  return json.nodes.filter(node => /^MOUNT_FIN_[LR]$/.test(node.name)).map(node => ({
    position: node.translation.map(value => value * .14010628434949612),
    quaternion: new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    mountScale: node.scale || [1, 1, 1], mountKey: node.name, targetLength: .62,
  }));
}

test('actual released multirole mounts seat swept fins bilaterally before normal handedness', () => {
  const original = authoredPlacements(), snapshot = JSON.stringify(original);
  const fitted = fitLegacyMultiroleFins(hull, cockpit, fin, original);
  assert.notEqual(fitted, original);
  assert.deepEqual(fitted.map(p => p.position[2]), [-.15, .15]);
  fitted.forEach((p, i) => {
    assert.equal(p.position[0], original[i].position[0]);
    assert.equal(p.position[1], original[i].position[2]);
    assert.equal(p.quaternion, original[i].quaternion);
    assert.equal(p.mountScale, original[i].mountScale);
    assert.equal(p.mountKey, original[i].mountKey);
    assert.equal(p.targetLength, .62);
  });
  assert.equal(handedFinPlacement(fin, fitted[0]).mirrorFinZ, true);
  assert.equal(handedFinPlacement(fin, fitted[1]), fitted[1]);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(fitLegacyMultiroleFins(hull, cockpit, fin, fitted), fitted, 'never correct twice');
});

test('other pairings and corrected, rotated, resized, missing or asymmetric mounts stay authored', () => {
  const p = authoredPlacements();
  assert.equal(fitLegacyMultiroleFins({ assetId: 'SF_HULL_FIGHTER' }, cockpit, fin, p), p);
  assert.equal(fitLegacyMultiroleFins(hull, { assetId: 'SF_COCKPIT_OTHER' }, fin, p), p);
  assert.equal(fitLegacyMultiroleFins(hull, cockpit, { assetId: 'SF_PART_FIN_STABILATOR' }, p), p);
  for (const change of [
    p => { p[0].position = [-.1, .02, -.2]; },
    p => { p[0].quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI); },
    p => { p[0].mountScale = [2, 2, 2]; },
    p => { delete p[0].quaternion; },
    p => { p[1].position = [...p[0].position]; },
    p => { p.pop(); },
  ]) {
    const placements = authoredPlacements(); change(placements);
    assert.equal(fitLegacyMultiroleFins(hull, cockpit, fin, placements), placements);
  }
});
