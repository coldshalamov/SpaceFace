import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import { deduplicateExactEmbeddedTextures } from '../scripts/lib/deduplicateExactEmbeddedTextures.mjs';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=',
  'base64',
);

test('exact texture interning keeps each material slot sampler, UV, and transform', () => {
  const document = new Document();
  const image = new Uint8Array(PNG_1X1);
  const first = document.createTexture('shared trim').setImage(image).setMimeType('image/png')
    .setExtras({ authoring: { region: 'trim' } });
  const second = document.createTexture('shared trim').setImage(image.slice()).setMimeType('image/png')
    .setExtras({ authoring: { region: 'trim' } });
  const firstMaterial = document.createMaterial('mechanical').setBaseColorTexture(first);
  const secondMaterial = document.createMaterial('hull').setBaseColorTexture(second);
  const firstInfo = firstMaterial.getBaseColorTextureInfo()
    .setMagFilter(9728).setMinFilter(9984).setWrapS(33071).setWrapT(33648).setTexCoord(1);
  const secondInfo = secondMaterial.getBaseColorTextureInfo()
    .setMagFilter(9729).setMinFilter(9987).setWrapS(10497).setWrapT(33071).setTexCoord(2);
  const transformExtension = document.createExtension(KHRTextureTransform);
  const firstTransform = transformExtension.createTransform().setOffset([0.1, 0.2]).setRotation(0.3).setScale([2, 3]).setTexCoord(3);
  const secondTransform = transformExtension.createTransform().setOffset([0.4, 0.5]).setRotation(0.6).setScale([4, 5]).setTexCoord(4);
  firstInfo.setExtension('KHR_texture_transform', firstTransform);
  secondInfo.setExtension('KHR_texture_transform', secondTransform);

  deduplicateExactEmbeddedTextures(document);

  assert.equal(document.getRoot().listTextures().length, 1);
  assert.equal(firstMaterial.getBaseColorTexture(), secondMaterial.getBaseColorTexture());
  assert.equal(firstInfo.getMagFilter(), 9728);
  assert.equal(firstInfo.getMinFilter(), 9984);
  assert.equal(firstInfo.getWrapS(), 33071);
  assert.equal(firstInfo.getWrapT(), 33648);
  assert.equal(firstInfo.getTexCoord(), 1);
  assert.deepEqual(firstInfo.getExtension('KHR_texture_transform').getOffset(), [0.1, 0.2]);
  assert.equal(firstInfo.getExtension('KHR_texture_transform').getRotation(), 0.3);
  assert.deepEqual(firstInfo.getExtension('KHR_texture_transform').getScale(), [2, 3]);
  assert.equal(firstInfo.getExtension('KHR_texture_transform').getTexCoord(), 3);
  assert.equal(secondInfo.getMagFilter(), 9729);
  assert.equal(secondInfo.getMinFilter(), 9987);
  assert.equal(secondInfo.getWrapS(), 10497);
  assert.equal(secondInfo.getWrapT(), 33071);
  assert.equal(secondInfo.getTexCoord(), 2);
  assert.deepEqual(secondInfo.getExtension('KHR_texture_transform').getOffset(), [0.4, 0.5]);
  assert.equal(secondInfo.getExtension('KHR_texture_transform').getRotation(), 0.6);
  assert.deepEqual(secondInfo.getExtension('KHR_texture_transform').getScale(), [4, 5]);
  assert.equal(secondInfo.getExtension('KHR_texture_transform').getTexCoord(), 4);
});

test('exact texture interning refuses otherwise-identical images with different names or extras', () => {
  const document = new Document();
  const image = new Uint8Array(PNG_1X1);
  const textures = [
    document.createTexture('named A').setImage(image).setMimeType('image/png').setExtras({ role: 'shared' }),
    document.createTexture('named B').setImage(image.slice()).setMimeType('image/png').setExtras({ role: 'shared' }),
    document.createTexture('same name').setImage(image.slice()).setMimeType('image/png').setExtras({ role: 'left' }),
    document.createTexture('same name').setImage(image.slice()).setMimeType('image/png').setExtras({ role: 'right' }),
  ];
  textures.forEach((texture, index) => {
    document.createMaterial(`material ${index}`).setBaseColorTexture(texture);
  });

  deduplicateExactEmbeddedTextures(document);

  assert.equal(document.getRoot().listTextures().length, 4);
  assert.deepEqual(document.getRoot().listTextures().map((texture) => texture.getName()), [
    'named A', 'named B', 'same name', 'same name',
  ]);
});
