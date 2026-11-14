import assert from 'node:assert/strict';
import test from 'node:test';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';
import { applyReleaseColorTextureProfile } from '../scripts/lib/releaseColorTextureProfiles.mjs';

const decode = bytes => { const p = PNG.sync.read(Buffer.from(bytes)); return { data: p.data, width: p.width, height: p.height }; };
function fixture(slot = 'baseColor') {
  const image = new PNG({ width: 4, height: 4 }); image.data.fill(210);
  const bytes = PNG.sync.write(image), doc = new Document();
  const selected = doc.createTexture('helios_lark_panel_albedo').setImage(bytes).setMimeType('image/png');
  const other = doc.createTexture('forge_panel_normal').setImage(bytes).setMimeType('image/png');
  const material = doc.createMaterial();
  if (slot === 'baseColor') material.setBaseColorTexture(selected); else material.setNormalTexture(selected);
  doc.createMaterial().setNormalTexture(other);
  return { doc, selected, other, bytes };
}

test('Lark named albedo becomes mipmapped sRGB ETC1S without touching another slot', async () => {
  const { doc, selected, other, bytes } = fixture();
  const profile = await applyReleaseColorTextureProfile(doc, 'wholeship_helios_lark', decode);
  assert.match(profile.baseColorTexture, /^ETC1S/);
  assert.equal(selected.getMimeType(), 'image/ktx2');
  const ktx = Buffer.from(selected.getImage()), dfd = ktx.readUInt32LE(48);
  assert.equal(ktx.readUInt32LE(20), 4); // pixelWidth
  assert.equal(ktx.readUInt32LE(40), 3); // levels: 4, 2, 1
  assert.equal(ktx[dfd + 12], 163); // KHR_DF_MODEL_ETC1S
  assert.equal(ktx[dfd + 14], 2); // KHR_DF_TRANSFER_SRGB
  assert.deepEqual(Buffer.from(other.getImage()), bytes);
  assert.equal(other.getMimeType(), 'image/png');
});

test('the same texture name on another asset keeps its existing encoding', async () => {
  const { doc, selected, bytes } = fixture();
  assert.equal(await applyReleaseColorTextureProfile(doc, 'wholeship_other', decode), null);
  assert.deepEqual(Buffer.from(selected.getImage()), bytes);
});

test('a named profile cannot silently encode a normal slot as color', async () => {
  const { doc } = fixture('normal');
  await assert.rejects(applyReleaseColorTextureProfile(doc, 'wholeship_helios_lark', decode), /base-color-only/);
});

test('duplicate configured texture names reject before encoding either texture', async () => {
  const { doc, selected, bytes } = fixture();
  const duplicate = doc.createTexture('helios_lark_panel_albedo').setImage(bytes).setMimeType('image/png');
  doc.createMaterial().setNormalTexture(duplicate);
  await assert.rejects(applyReleaseColorTextureProfile(doc, 'wholeship_helios_lark', decode), /ambiguous duplicate/);
  assert.deepEqual(Buffer.from(selected.getImage()), bytes);
  assert.deepEqual(Buffer.from(duplicate.getImage()), bytes);
  assert.equal(selected.getMimeType(), 'image/png');
  assert.equal(duplicate.getMimeType(), 'image/png');
});

test('reviewed cockpit trim is reduced in the release while its other textures remain untouched', async () => {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('assets/ships/parts/cockpits/cockpit_dome.glb');
  const textures = doc.getRoot().listTextures();
  const selected = textures.find(texture => texture.getName() === 'cockpit_dome_trim_sheet_1k');
  const other = textures.find(texture => texture.getName() === 'spaceface_neutral_normal_1024');
  const otherBytes = Buffer.from(other.getImage());
  const profile = await applyReleaseColorTextureProfile(doc, 'cockpit_dome', decode);
  assert.match(profile.baseColorTexture, /256px/);
  const ktx = Buffer.from(selected.getImage()), dfd = ktx.readUInt32LE(48);
  assert.equal(selected.getMimeType(), 'image/ktx2');
  assert.equal(ktx.readUInt32LE(20), 256);
  assert.equal(ktx.readUInt32LE(24), 256);
  assert.equal(ktx.readUInt32LE(40), 9);
  assert.equal(ktx[dfd + 12], 163);
  assert.equal(ktx[dfd + 14], 2);
  assert.deepEqual(Buffer.from(other.getImage()), otherBytes);
});

test('an unreviewed replacement cockpit sheet keeps its default profile', async () => {
  const doc = new Document(), image = new PNG({ width: 4, height: 4 }); image.data.fill(120);
  const bytes = PNG.sync.write(image);
  const texture = doc.createTexture('cockpit_dome_trim_sheet_1k').setImage(bytes).setMimeType('image/png');
  doc.createMaterial().setBaseColorTexture(texture);
  assert.equal(await applyReleaseColorTextureProfile(doc, 'cockpit_dome', decode), null);
  assert.deepEqual(Buffer.from(texture.getImage()), bytes);
});
