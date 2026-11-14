import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion } from 'three';
import { fitLegacyMultiroleCockpit } from '../src/render/modularMultiroleCockpitPlacement.js';

const hull = { assetId: 'SF_HULL_MULTIROLE' }, fin = { assetId: 'SF_PART_FIN_SWEPT_SMUGGLER' };
const cockpit = { assetId: 'SF_COCKPIT_RECESSED', metadata: { spacefaceCockpitDesign: 'recessed-v5' } };
function jsonGlb(path) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
}
function mounts() {
  const json = jsonGlb('../assets/ships/release/parts/hulls/hull_multirole.glb');
  const placement = node => ({ position: node.translation.map(v => v * .14010628434949612),
    quaternion: new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    mountScale: node.scale || [1, 1, 1], mountKey: node.name, targetLength: .58 });
  return { seat: placement(json.nodes.find(n => n.name === 'MOUNT_COCKPIT')),
    fins: json.nodes.filter(n => /^MOUNT_FIN_[LR]$/.test(n.name)).map(placement) };
}

test('V5 fits actual legacy mounts without mutating placement, scale or fin inputs', () => {
  const { seat, fins } = mounts(), before = JSON.stringify({ seat, fins });
  const result = fitLegacyMultiroleCockpit(hull, cockpit, fin, seat, () => fins);
  assert.notEqual(result, seat);
  assert.deepEqual(result.position, [seat.position[0], .2520811811864766, 0]);
  assert.deepEqual(result.quaternion.toArray(), [0, 0, -.14188997085178007, .9898824355304426]);
  assert.equal(result.mountScale, seat.mountScale);
  assert.equal(result.targetLength, seat.targetLength);
  assert.equal(result.mountKey, seat.mountKey);
  assert.equal(JSON.stringify({ seat, fins }), before);
  assert.equal(fitLegacyMultiroleCockpit(hull, cockpit, fin, result, () => fins), result);
});

test('legacy cockpit metadata and other combinations stay unchanged without resolving fins', () => {
  const json = jsonGlb('../assets/ships/release/parts/cockpits/cockpit_recessed.glb');
  const metadata = { ...(json.scenes[0].extras?.spacefaceAsset || json.asset.extras?.spacefaceAsset || {}) };
  // Retain the legacy contract regression after a future V5 asset promotion.
  delete metadata.spacefaceCockpitDesign;
  const { seat } = mounts(), unexpected = () => { throw Error('Unrelated fit resolved fins'); };
  for (const [h, c, f] of [
    [hull, { assetId: cockpit.assetId, metadata }, fin],
    [{ assetId: 'SF_HULL_FIGHTER' }, cockpit, fin],
    [hull, { ...cockpit, assetId: 'SF_COCKPIT_DOME' }, fin],
    [hull, cockpit, { assetId: 'SF_PART_FIN_RADIATOR_GRID' }],
    [hull, { ...cockpit, metadata: { spacefaceCockpitDesign: 'recessed-v6' } }, fin],
  ]) assert.equal(fitLegacyMultiroleCockpit(h, c, f, seat, unexpected), seat);
});

test('corrected or changed cockpit and fin mounts remain authored', () => {
  for (const change of [
    ({ seat }) => { seat.position = [.15, .25, 0]; },
    ({ seat }) => { seat.quaternion.set(0, .1, 0, Math.sqrt(.99)); },
    ({ seat }) => { seat.mountScale = [2, 2, 2]; },
    ({ fins }) => { fins[0].position = [-.1, .01, -.15]; },
    ({ fins }) => { fins.pop(); },
  ]) {
    const input = mounts(); change(input);
    assert.equal(fitLegacyMultiroleCockpit(hull, cockpit, fin, input.seat, () => input.fins), input.seat);
  }
});
