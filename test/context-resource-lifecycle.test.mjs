import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detachStaleWebGlDisposeListeners } from '../src/render/contextResourceLifecycle.js';

test('context loss detaches only stale Three renderer GPU dispose listeners', () => {
  function onGeometryDispose() {}
  function onMaterialDispose() {}
  function onTextureDispose() {}
  function appDisposeListener() {}

  const texture = resource({ isTexture: true }, [onTextureDispose, appDisposeListener]);
  const material = resource({
    isMaterial: true,
    map: texture,
    uniforms: { glowMap: { value: texture } },
  }, [onMaterialDispose, appDisposeListener]);
  const geometry = resource({ isBufferGeometry: true }, [onGeometryDispose, appDisposeListener]);
  const mesh = { geometry, material, skeleton: { boneTexture: texture } };
  const root = { traverse(visitor) { visitor(mesh); visitor(mesh); } };

  const receipt = detachStaleWebGlDisposeListeners([root, material]);

  assert.deepEqual(receipt, {
    objects: 1,
    geometries: 1,
    materials: 1,
    textures: 1,
    renderTargets: 0,
    listenersDetached: 3,
  });
  assert.deepEqual(geometry._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(material._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(texture._listeners.dispose, [appDisposeListener]);
});

test('context loss covers render-target attachments once and ignores unrelated objects', () => {
  function onRenderTargetDispose() {}
  function onTextureDispose() {}
  const color = resource({ isTexture: true }, [onTextureDispose]);
  const depth = resource({ isTexture: true }, [onTextureDispose]);
  const target = resource({ isWebGLRenderTarget: true, texture: color, textures: [color], depthTexture: depth }, [onRenderTargetDispose]);

  const receipt = detachStaleWebGlDisposeListeners([target, {}, null]);

  assert.equal(receipt.renderTargets, 1);
  assert.equal(receipt.textures, 2);
  assert.equal(receipt.listenersDetached, 3);
});

function resource(fields, listeners) {
  return {
    ...fields,
    _listeners: { dispose: [...listeners] },
    removeEventListener(type, listener) {
      this._listeners[type] = this._listeners[type].filter((candidate) => candidate !== listener);
    },
  };
}
