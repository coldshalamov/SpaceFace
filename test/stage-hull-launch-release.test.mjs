import assert from 'node:assert/strict';
import test from 'node:test';

import { createStageHull } from '../src/ui/screens/stageHull.js';

function fakeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: '',
    attributes: {},
    dataset: {},
    children: [],
    parentNode: null,
    isConnected: true,
    clientWidth: 640,
    clientHeight: 360,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    prepend(child) {
      child.parentNode = this;
      this.children.unshift(child);
    },
    remove() {
      if (!this.parentNode) return;
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    },
  };
}
globalThis.document = { createElement: fakeElement };

function fakeMountFactory(mounts) {
  return (canvas) => {
    const mount = {
      canvas,
      active: true,
      disposed: false,
      shown: [],
      show(defId) { this.shown.push(defId); },
      setZoom() {},
      frame() {},
      rotateBy() {},
      setActive(value) { this.active = !!value; },
      getAssetState: () => 'authored',
      dispose() { this.disposed = true; },
    };
    mounts.push(mount);
    return mount;
  };
}

test('Launch releases the stage hull context and a failed start rebuilds it on a fresh canvas', () => {
  const mounts = [];
  const stage = fakeElement('div');
  const hull = createStageHull(stage, { rootEl: fakeElement('section'), mountFactory: fakeMountFactory(mounts) });
  assert.equal(mounts.length, 1);
  const launchCanvas = hull.canvas;
  assert.equal(stage.children[0], launchCanvas);
  hull.show('ship_kestrel');
  hull.activate({});
  hull.deactivate();
  assert.equal(mounts[0].active, false, 'Launch stops the drift and the mount loop at once');

  assert.equal(hull.release(), true);
  assert.equal(mounts[0].disposed, true, 'release disposes the mount, which force-loses its WebGL context');
  assert.equal(hull.hasMount(), false);
  assert.equal(launchCanvas.parentNode, null, 'the lost-context canvas leaves the stage');
  assert.equal(hull.release(), false, 'a second release is a no-op');
  hull.show('ship_kestrel');
  hull.activate({});
  hull.deactivate();

  assert.equal(hull.restore(), true, 'a failed start rebuilds the hull');
  assert.equal(mounts.length, 2);
  assert.notEqual(hull.canvas, launchCanvas, 'a force-lost context cannot be revived on its old canvas');
  assert.equal(stage.children[0], hull.canvas);
  assert.equal(hull.hasMount(), true);
  assert.equal(hull.restore(), false, 'restore without a release builds nothing');

  hull.dispose();
  assert.equal(mounts[1].disposed, true);
  assert.equal(hull.canvas.parentNode, null);
});
