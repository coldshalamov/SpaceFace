import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';
import { applyReleaseCockpitRecessedTextureProfiles } from '../scripts/lib/releaseCockpitRecessedTextureProfiles.mjs';

const read = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).read('assets/ships/parts/cockpits/cockpit_recessed.glb');
const decode = (bytes) => { const p = PNG.sync.read(Buffer.from(bytes)); return { data: p.data, width: p.width, height: p.height }; };
const material = (doc) => doc.getRoot().listMaterials().find((entry) => entry.getName() === 'Material_Hull');

test('reviewed same-named color and material sheets use their correct transfer functions', async () => {
  const doc = await read(), hull = material(doc);
  const color = hull.getBaseColorTexture(), orm = hull.getMetallicRoughnessTexture(), normal = hull.getNormalTexture();
  const normalBytes = Buffer.from(normal.getImage());
  assert.equal(color.getName(), orm.getName());
  const profile = await applyReleaseCockpitRecessedTextureProfiles(doc, 'cockpit_recessed', decode);
  assert.match(profile.baseColorTexture, /256px/);
  assert.match(profile.metallicRoughnessTexture, /256px/);
  for (const [texture, transfer] of [[color, 2], [orm, 1]]) {
    assert.equal(texture.getMimeType(), 'image/ktx2');
    assert.equal(texture.getName(), 'cockpit_recessed_wear_mask_1k');
    const bytes = Buffer.from(texture.getImage()), dfd = bytes.readUInt32LE(48);
    assert.equal(bytes.readUInt32LE(20), 256);
    assert.equal(bytes.readUInt32LE(24), 256);
    assert.equal(bytes.readUInt32LE(40), 9);
    assert.equal(bytes[dfd + 12], 163); // ETC1S
    assert.equal(bytes[dfd + 14], transfer);
  }
  assert.deepEqual(Buffer.from(normal.getImage()), normalBytes);
});

test('unreviewed sheet bytes keep the default color profile', async () => {
  const doc = await read(), hull = material(doc), color = hull.getBaseColorTexture();
  const changed = Buffer.from(color.getImage()); changed[changed.length - 1] ^= 1; color.setImage(changed);
  const profile = await applyReleaseCockpitRecessedTextureProfiles(doc, 'cockpit_recessed', decode);
  assert.equal(profile.baseColorTexture, undefined);
  assert.equal(color.getMimeType(), 'image/png');
  assert.deepEqual(Buffer.from(color.getImage()), changed);
});

test('a reviewed map reused in a different role is rejected', async () => {
  const doc = await read(), hull = material(doc);
  hull.setNormalTexture(hull.getBaseColorTexture());
  await assert.rejects(applyReleaseCockpitRecessedTextureProfiles(doc, 'cockpit_recessed', decode), /incompatible slot/);
});
