import assert from 'node:assert/strict';
import test from 'node:test';

import { freezeStaticChildMatrices, shouldFreezeStaticChild } from '../src/render/staticChildMatrices.js';

function node(userData = {}, extras = {}) {
  return {
    userData,
    matrixAutoUpdate: true,
    updated: false,
    children: extras.children || [],
    isLight: extras.isLight === true,
    updateMatrix() { this.updated = true; },
    traverse(fn) {
      fn(this);
      for (const child of this.children) {
        if (typeof child.traverse === 'function') child.traverse(fn);
        else fn(child);
      }
    },
  };
}

test('static children freeze; sockets lights and animated nodes stay live', () => {
  const plate = node();
  const socket = node({ spacefaceSocket: true });
  const light = node({}, { isLight: true });
  const root = node({}, { children: [plate, socket, light] });
  assert.equal(shouldFreezeStaticChild(plate, root), true);
  assert.equal(shouldFreezeStaticChild(socket, root), false);
  assert.equal(shouldFreezeStaticChild(light, root), false);
  assert.equal(freezeStaticChildMatrices(root), 1);
  assert.equal(plate.matrixAutoUpdate, false);
  assert.equal(plate.updated, true);
  assert.equal(socket.matrixAutoUpdate, true);
  assert.equal(root.matrixAutoUpdate, true);
});
