import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installMobileDrawErrorObserver } from '../scripts/lib/mobileDrawErrorObserver.mjs';

function fixture(options = {}) {
  const target = new EventTarget();
  const scope = { EventTarget, __THREE_DEVTOOLS__: target, performance: { now: () => 123 } };
  runInNewContext(`(${installMobileDrawErrorObserver.toString()})(${JSON.stringify(options)})`, scope);
  const queue = [], calls = [], program = {};
  let fail = true, reads = 0;
  const gl = { NO_ERROR: 0, INVALID_OPERATION: 1282, CURRENT_PROGRAM: 35725,
    getError() { reads++; return queue.shift() || 0; },
    getParameter(key) { assert.equal(key, this.CURRENT_PROGRAM); return program; },
    drawElements(...args) { calls.push({ receiver: this, args }); if (fail) queue.push(1282); return 'draw-result'; },
  };
  const renderer = { isWebGLRenderer: true, domElement: { id: 'gl-canvas' }, getContext: () => gl,
    renderBufferDirect(camera, scene, geometry, material, object, group) {
      assert.equal(this, renderer);
      return gl.drawElements(4, group?.count ?? 3, 5123, 0);
    } };
  const geometry = { uuid: 'geometry-1', name: 'Hull', drawRange: { start: 0, count: Infinity },
    userData: { spacefaceCpuDetach: { kind: 'geometry', contentHash: 'source-hash', ordinal: 4 } },
    index: { count: 3, itemSize: 1, array: new Uint16Array([0, 1, 2]), version: 0 },
    attributes: { normal: { count: 3, itemSize: 3, array: new Float32Array(0), version: 2 } } };
  const material = { uuid: 'material-1', name: 'Ship paint', type: 'MeshStandardMaterial' };
  const object = { uuid: 'mesh-1', name: 'LOD0 hull', type: 'Mesh', userData: {},
    parent: { uuid: 'root-1', name: 'Player ship', userData: { sfBoundEntityId: 71,
      spacefaceRenderPackage: { assetId: 'ship_kestrel', contentHash: 'source-hash' } } } };
  const observe = value => target.dispatchEvent(new CustomEvent('observe', { detail: value }));
  const draw = (g = geometry) => renderer.renderBufferDirect(null, null, g, material, object, { start: 0, count: 3 });
  return { scope, target, gl, renderer, geometry, material, object, observe, draw, queue, calls,
    reads: () => reads, setFail(value) { fail = value; }, api: scope.__SF_MOBILE_DRAW_ERRORS__ };
}

test('a missing renderer or incompatible devtools target is reported unavailable', () => {
  const scope = { EventTarget };
  runInNewContext(`(${installMobileDrawErrorObserver.toString()})()`, scope);
  assert.ok(scope.__THREE_DEVTOOLS__ instanceof EventTarget);
  assert.equal(scope.__SF_MOBILE_DRAW_ERRORS__.snapshot().reason, 'no-renderer-observed');
  scope.__SF_MOBILE_DRAW_ERRORS__.stop();
  const unsupported = { EventTarget, __THREE_DEVTOOLS__: {} };
  runInNewContext(`(${installMobileDrawErrorObserver.toString()})()`, unsupported);
  const report = unsupported.__SF_MOBILE_DRAW_ERRORS__.snapshot();
  assert.equal(report.available, false);
  assert.equal(report.reason, 'three-observer-unavailable');
});

test('standard Three observation joins the real indexed error to bounded source ownership', () => {
  const f = fixture();
  assert.equal(f.api.snapshot().available, false);
  assert.equal(f.api.snapshot().reason, 'no-renderer-observed');
  let foreignObservations = 0;
  f.target.addEventListener('observe', () => foreignObservations++);
  f.observe({ isScene: true });
  f.observe(f.renderer);
  f.observe(f.renderer);
  assert.equal(f.scope.__THREE_DEVTOOLS__, f.target, 'existing devtools target is preserved');
  assert.equal(f.draw(), 'draw-result');
  assert.equal(f.calls[0].receiver, f.gl);
  assert.deepEqual(f.calls[0].args, [4, 3, 5123, 0]);
  const snapshot = JSON.parse(JSON.stringify(f.api.snapshot()));
  assert.equal(snapshot.renderersObserved, 1, 'the same renderer is never wrapped twice');
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.reason, null);
  assert.equal(foreignObservations, 3);
  assert.equal(snapshot.invalidDraws, 1);
  const row = snapshot.witnesses[0];
  assert.equal(row.object.name, 'LOD0 hull');
  assert.equal(row.parents[1].entityId, 71);
  assert.equal(row.parents[1].assetId, 'ship_kestrel');
  assert.equal(row.geometry.detach.contentHash, 'source-hash');
  assert.equal(row.geometry.attributes.normal.bytes, 0);
  assert.equal(row.geometry.index.bytes, 6);
  assert.equal(row.material.uuid, 'material-1');
  assert.equal(row.canvasId, 'gl-canvas');
  assert.deepEqual(row.args, [4, 3, 5123, 0]);
  assert.deepEqual(row.errors, [1282]);
  row.geometry.name = 'changed report';
  assert.equal(f.api.snapshot().witnesses[0].geometry.name, 'Hull', 'reports retain no mutable scene object');
  f.api.stop();
});

test('an earlier GL error and an unowned GL call never become an indexed-draw witness', () => {
  const f = fixture();
  f.observe(f.renderer);
  f.gl.drawElements(4, 3, 5123, 0); // Outside a renderer draw: no owner can be asserted.
  assert.equal(f.reads(), 0);
  f.setFail(false);
  f.draw();
  assert.equal(f.api.snapshot().priorErrors, 1);
  assert.equal(f.api.snapshot().invalidDraws, 0);
  assert.equal(f.api.snapshot().witnesses.length, 0);
  f.api.stop();
});

test('witness capture is bounded and stops GL inspection while preserving subsequent draws', () => {
  const f = fixture({ maxWitnesses: 2 });
  f.observe(f.renderer);
  f.draw();
  f.draw();
  assert.equal(f.api.snapshot().witnesses.length, 1, 'the same failed owner is deduplicated');
  f.draw({ ...f.geometry, uuid: 'geometry-2' });
  assert.equal(f.api.snapshot().witnesses.length, 2);
  assert.equal(f.api.snapshot().captureStopped, true);
  const reads = f.reads();
  assert.equal(f.draw(), 'draw-result');
  assert.equal(f.reads(), reads, 'no driver queries after the capture cap');
  assert.equal(f.calls.length, 4);
  f.api.stop();
});

test('stop leaves later wrapper owners intact and disables observation through their chain', () => {
  const f = fixture();
  f.observe(f.renderer);
  const observed = f.renderer.renderBufferDirect;
  const later = function () { return Reflect.apply(observed, this, arguments); };
  f.renderer.renderBufferDirect = later;
  f.api.stop();
  f.api.stop();
  assert.equal(f.renderer.renderBufferDirect, later);
  const reads = f.reads();
  assert.equal(f.draw(), 'draw-result');
  assert.equal(f.reads(), reads);
  assert.equal(f.api.snapshot().stopped, true);
});
