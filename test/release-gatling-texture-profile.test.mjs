import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {PNG} from 'pngjs';
import {applyReleaseGatlingTextureProfiles} from '../scripts/lib/releaseGatlingTextureProfiles.mjs';

const read = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).read('assets/ships/parts/weapons/weapon_gatling.glb');
const decode = (bytes) => { const p = PNG.sync.read(Buffer.from(bytes)); return {data:p.data,width:p.width,height:p.height}; };
const mechanical = (doc) => doc.getRoot().listMaterials().find(m => m.getName() === 'Material_Mechanical');

test('gatling release maps preserve normal, color and shared material-data roles', async () => {
  const doc = await read(), material = mechanical(doc);
  const normal = material.getNormalTexture(), color = material.getBaseColorTexture(), orm = material.getMetallicRoughnessTexture();
  const other = doc.getRoot().listTextures().find(t => t !== normal && t !== color && t !== orm);
  const otherBytes = Buffer.from(other.getImage());
  assert.equal(material.getOcclusionTexture(), orm);
  const profile = await applyReleaseGatlingTextureProfiles(doc, 'weapon_gatling', decode);
  assert.match(profile.normalTexture, /UASTC normal-map/);
  assert.match(profile.baseColorTexture, /256px/);
  assert.match(profile.metallicRoughnessTexture, /linear/);
  for (const [texture, codec, transfer] of [[normal,166,1],[color,163,2],[orm,163,1]]) {
    const bytes=Buffer.from(texture.getImage()),dfd=bytes.readUInt32LE(48);
    assert.equal(texture.getMimeType(),'image/ktx2');
    assert.equal(bytes.readUInt32LE(20),256);
    assert.equal(bytes.readUInt32LE(24),256);
    assert.equal(bytes.readUInt32LE(40),9);
    assert.equal(bytes[dfd+12],codec);
    assert.equal(bytes[dfd+14],transfer);
  }
  assert.equal(material.getOcclusionTexture(),orm);
  assert.deepEqual(Buffer.from(other.getImage()),otherBytes);
});

test('a changed source sheet keeps the default release encoding', async () => {
  const doc=await read(),normal=mechanical(doc).getNormalTexture(),bytes=Buffer.from(normal.getImage());
  bytes[bytes.length-1]^=1;normal.setImage(bytes);
  const profile=await applyReleaseGatlingTextureProfiles(doc,'weapon_gatling',decode);
  assert.equal(profile.normalTexture,undefined);
  assert.equal(normal.getMimeType(),'image/png');
  assert.deepEqual(Buffer.from(normal.getImage()),bytes);
});

test('a reviewed image reused outside its intended slots is rejected', async () => {
  const doc=await read(),material=mechanical(doc);
  material.setNormalTexture(material.getBaseColorTexture());
  await assert.rejects(applyReleaseGatlingTextureProfiles(doc,'weapon_gatling',decode),/incompatible slot/);
});
