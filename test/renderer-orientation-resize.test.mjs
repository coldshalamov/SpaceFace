import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { render, runWebGlContextRestoreRebuild, disposeObjectNode, disposeRendererOwnedResources } from '../src/render/renderer.js';
import { createUnreadyDrawableGuard } from '../src/render/bloom.js';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  detachPackageTexture,
  LIVE_PACKAGE_CPU_PAYLOAD,
  measureLivePackageCpuPayloads,
  orientationDetachedHoldActive,
  presentedDetachRehydrateInFlight,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

function harness() {
  const sizes = [], postSizes = [];
  let ratio = 1;
  const canvas = { width: 390, height: 664, style: {}, picture: 'last complete world' };
  const renderer = {
    domElement: canvas,
    properties: new Map(),
    info: { programs: [] },
    renderBufferDirect() {},
    getPixelRatio: () => ratio,
    setPixelRatio(value) { ratio = value; },
    getDrawingBufferSize(out) { return out.set(canvas.width, canvas.height); },
    setSize(w, h) {
      sizes.push([w, h]);
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.picture = 'cleared by buffer resize';
    },
  };
  const owner = Object.assign(Object.create(render), {
    renderer,
    state: { mode: 'flight', settings: { video: {} }, render: {} },
    _drawBufferAspectClass: 'port',
    _rendererGeneration: 1,
    _rendererResourcesDisposed: false,
    _contextRecovery: { generation: 0 },
    _authoredPreparationEpoch: 0,
    cam: { onResize() {} },
    bloom: { setSize(w, h) { postSizes.push([w, h]); }, setContentScale() {}, render() {} },
  });
  return { owner, renderer, canvas, sizes, postSizes };
}

test('live shared payloads resize immediately without decoding the scene or a cached package', async () => {
  resetPackageDetachManifestsForTests();
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 };
  const h = harness(), scene = new THREE.Scene();
  h.owner.scene = scene;
  h.owner._installLivePackageCpuPayloads(scene);
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.DataTexture(new Uint8Array([20, 40, 60, 255]), 1, 1);
  texture.needsUpdate = true;
  let decodes = 0;
  createPackageDetachManifest({ contentHash: 'live-shared-resize', resources: [geometry, texture] }, {
    redecode: () => { decodes++; throw new Error('live resources were unexpectedly cold'); },
    collectResources: value => value.resources,
  });
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const first = new THREE.Mesh(geometry, material), second = new THREE.Mesh(geometry, material.clone());
  const a = new THREE.Group(), b = new THREE.Group();
  a.add(first); b.add(second); scene.add(a, b);
  a.userData.presentationEntityId = 1;
  b.userData.presentationEntityId = 2;
  h.owner.state.entities = new Map([[1, { id: 1, alive: true }], [2, { id: 2, alive: true }]]);
  try {
    const retain = scene[LIVE_PACKAGE_CPU_PAYLOAD];
    const releaseFirst = retain(a, first, new Set([first]));
    retain(b, second, new Set([second]));
    assert.equal(retain(new THREE.Group(), new THREE.Group(), new Set([first])), null,
      'an unmounted speculative owner cannot retain live CPU bytes');
    const warm = new THREE.Group(); warm.userData.rosterPrewarm = 'existing-species-warm';
    warm.userData.presentationEntityId = 1; scene.add(warm);
    assert.equal(retain(warm, new THREE.Group(), new Set([first])), null,
      'a mounted roster specimen is still speculative, even when it copies a real entity ID');
    const unbound = new THREE.Group(); scene.add(unbound);
    assert.equal(retain(unbound, new THREE.Group(), new Set([first])), null);
    assert.equal(detachPackageGeometry(geometry), false);
    assert.equal(detachPackageTexture(texture), false);
    const bytes = measureLivePackageCpuPayloads(h.owner._livePackageCpuPayloads);
    const one = measureLivePackageCpuPayloads([{ geometries: [geometry], textures: [texture] }]);
    assert.equal(bytes.liveCpuBufferBytes, one.liveCpuBufferBytes, 'shared owners do not double-count backing buffers');
    h.owner.onResize();
    assert.deepEqual(h.sizes, [[844, 390]], 'CPU-ready orientation commits in the actual resize call');
    assert.equal(h.owner._orientationResizePending, undefined);
    assert.equal(orientationDetachedHoldActive(h.renderer), false);
    assert.equal(presentedDetachRehydrateInFlight(), null);
    assert.equal(decodes, 0);
    releaseFirst();
    assert.equal(detachPackageGeometry(geometry), false, 'the second live owner still holds the geometry');
    assert.equal(detachPackageTexture(texture), false);
    // Private pass reparenting is not resource disposal and cannot expire the lease.
    const staging = new THREE.Scene(); staging.add(second); b.add(second);
    assert.equal(detachPackageTexture(texture), false);
    disposeObjectNode(second);
    assert.equal(detachPackageGeometry(geometry), true);
    assert.equal(detachPackageTexture(texture), true);
    assert.equal(h.owner._livePackageCpuPayloads.size, 0);
    disposeRendererOwnedResources(h.owner);
    assert.equal(scene[LIVE_PACKAGE_CPU_PAYLOAD], undefined);
  } finally {
    h.owner._releaseLivePackageCpuPayloads?.();
    globalThis.window = previousWindow;
    resetPackageDetachManifestsForTests();
  }
});

async function withPendingRefill(run, { failFirstRefill = false } = {}) {
  resetPackageDetachManifestsForTests();
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 };
  const h = harness();
  const geometry = new THREE.BoxGeometry();
  const fresh = geometry.clone();
  let release;
  let decodeCount = 0;
  const ready = new Promise(resolve => { release = resolve; });
  createPackageDetachManifest({
    contentHash: 'orientation-resize-fixture', assetId: 'orientation-resize-fixture', resources: [geometry],
  }, {
    redecode: async () => {
      await ready;
      if (failFirstRefill && ++decodeCount === 1) throw new Error('actual fixture refill failure');
      return { resources: [fresh] };
    },
    collectResources: value => value.resources,
  });
  assert.equal(detachPackageGeometry(geometry, h.renderer), true);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const scene = new THREE.Scene();
  scene.add(mesh);
  h.owner.scene = scene;
  try {
    await run({ ...h, mesh, scene, release });
  } finally {
    release();
    await presentedDetachRehydrateInFlight();
    await h.owner._orientationResizePending;
    resetPackageDetachManifestsForTests();
    globalThis.window = previousWindow;
  }
}

test('rotation keeps the last complete world until detached resources can draw again', async () => {
  await withPendingRefill(async ({ owner, renderer, canvas, sizes, postSizes, scene, mesh, release }) => {
    owner.onResize();
    assert.equal(orientationDetachedHoldActive(renderer), true);
    const guard = createUnreadyDrawableGuard(renderer);
    guard.hide(scene);
    assert.equal(mesh.layers.mask, 0, 'the real draw guard must still protect released arrays');
    guard.restore();
    assert.deepEqual(sizes, [], 'do not clear the canvas before the refill finishes');
    assert.deepEqual(postSizes, [], 'keep the last complete post targets too');
    assert.equal(canvas.picture, 'last complete world');
    assert.equal(owner.drawPreparedFrame(), false, 'never replace it with a frame that hides the hull');

    // Repeated resize/dynamic-size callbacks must share the refill and consume the latest size.
    const pending = owner._orientationResizePending;
    window.innerWidth = 900;
    owner.onResize();
    assert.equal(owner._orientationResizePending, pending);
    assert.deepEqual(sizes, []);
    release();
    await pending;
    assert.equal(orientationDetachedHoldActive(renderer), false);
    assert.equal(detachPackageGeometry(mesh.geometry, renderer), false,
      'an admission cannot re-release restored bytes before the resized scene draws');
    assert.deepEqual(sizes, [], 'refill completion alone cannot clear the last picture');
    owner._renderPostRoute('bloom', new THREE.Scene(), new THREE.PerspectiveCamera());
    assert.deepEqual(sizes, [], 'a private warm pass cannot consume the pending resize');
    owner._renderPostRoute('bloom', scene, new THREE.PerspectiveCamera());
    assert.deepEqual(sizes, [[900, 390]]);
    assert.deepEqual(postSizes, [[900, 390]]);
    assert.equal(owner._drawBufferAspectClass, 'land');
    guard.hide(scene);
    assert.equal(mesh.layers.mask, 1, 'the resumed scene includes the refilled hull');
    guard.restore();
    assert.equal(detachPackageGeometry(mesh.geometry, renderer), true,
      'the resize releases its temporary CPU lease in the draw task');
  });
});

test('the actual resize owner requests its scene cohort rather than an offscreen package', async () => {
  await withPendingRefill(async ({ owner, scene, sizes, release }) => {
    const cached = new THREE.BoxGeometry(), fresh = cached.clone();
    let releaseCached, cachedDecodes = 0;
    const wait = new Promise(resolve => { releaseCached = resolve; });
    createPackageDetachManifest({ contentHash: 'offscreen-resize-fixture', resources: [cached] }, {
      redecode: async () => { cachedDecodes++; await wait; return { resources: [fresh] }; },
      collectResources: value => value.resources,
    });
    assert.equal(detachPackageGeometry(cached), true);
    try {
      owner.onResize();
      release();
      await new Promise(setImmediate);
      assert.equal(owner._orientationResizeReady, true, 'the real canonical scene collectors exclude cached geometry');
      assert.equal(cachedDecodes, 0);
      owner._renderPostRoute('bloom', scene, new THREE.PerspectiveCamera());
      assert.deepEqual(sizes, [[844, 390]]);
    } finally { releaseCached(); }
  });
});

for (const retire of ['disposed', 'replaced']) {
  test(`a ${retire} renderer cannot resize from an old refill completion`, async () => {
    await withPendingRefill(async ({ owner, sizes, release }) => {
      owner.onResize();
      const pending = owner._orientationResizePending;
      if (retire === 'disposed') owner._rendererResourcesDisposed = true;
      else owner.renderer = {};
      release();
      await pending;
      assert.deepEqual(sizes, []);
      assert.equal(owner._orientationResizePending, null);
      assert.equal(owner._orientationResizeRelease, null);
      assert.equal(owner._orientationResizeReady, false);
    });
  });
}

for (const restoreBeforeRefill of [false, true]) {
  test(`context recovery ${restoreBeforeRefill ? 'before' : 'after'} refill settlement retires the old resize and permits a fresh draw`, async () => {
    await withPendingRefill(async ({ owner, sizes, scene, release }) => {
      owner.onResize();
      const pending = owner._orientationResizePending;
      owner._contextLost = true;
      const restore = () => runWebGlContextRestoreRebuild(owner, owner._contextRecovery, async () => {});
      if (restoreBeforeRefill) assert.equal((await restore()).ok, true);
      release();
      await pending;
      assert.equal(owner._orientationResizePending, null, 'retired promise must not leave drawing permanently gated');
      assert.equal(owner._orientationResizeReady, false, 'an old context cannot publish resize readiness');
      assert.equal(owner._orientationResizeRelease, null);
      if (!restoreBeforeRefill) assert.equal((await restore()).ok, true);
      assert.equal(owner._contextLost, false);
      owner.onResize();
      const current = owner._orientationResizePending;
      assert.notEqual(current, pending);
      await current;
      owner._renderPostRoute('bloom', scene, new THREE.PerspectiveCamera());
      assert.deepEqual(sizes, [[844, 390]], 'the actual restored owner can resize and draw');
    });
  });
}

test('a retired refill cannot clear a newer renderer resize owner', async () => {
  await withPendingRefill(async ({ owner, release }) => {
    owner.onResize();
    const old = owner._orientationResizePending;
    const current = Promise.resolve();
    owner._rendererGeneration++;
    owner._orientationResizePending = current;
    release();
    await old;
    assert.equal(owner._orientationResizePending, current);
    owner._orientationResizePending = null;
  });
});

test('rotation back during refill uses the latest viewport without clearing early', async () => {
  await withPendingRefill(async ({ owner, sizes, canvas, scene, release }) => {
    owner.onResize();
    const pending = owner._orientationResizePending;
    window.innerWidth = 390; window.innerHeight = 664;
    owner.onResize();
    assert.equal(owner._orientationResizePending, pending);
    assert.equal(canvas.picture, 'last complete world');
    release();
    await pending;
    owner._renderPostRoute('bloom', scene, new THREE.PerspectiveCamera());
    assert.deepEqual(sizes, [[390, 664]]);
    assert.equal(owner._drawBufferAspectClass, 'port');
  });
});

test('a genuine refill failure releases its resize owner and allows a later real retry', async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    await withPendingRefill(async ({ owner, sizes, canvas, scene, release }) => {
      owner.onResize();
      release();
      await owner._orientationResizePending;
      assert.equal(owner._orientationResizePending, null);
      assert.equal(owner._orientationResizeRelease, null);
      assert.equal(owner._orientationResizeReady, false);
      assert.equal(canvas.picture, 'last complete world');
      assert.ok(warnings.some(args => args.some(value => String(value).includes('orientation resize refill failed'))));
      owner.onResize();
      await owner._orientationResizePending;
      owner._renderPostRoute('bloom', scene, new THREE.PerspectiveCamera());
      assert.deepEqual(sizes, [[844, 390]]);
    }, { failFirstRefill: true });
  } finally { console.warn = previousWarn; }
});

test('same-aspect sizing stays synchronous', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 400, innerHeight: 700, devicePixelRatio: 1 };
  try {
    const { owner, sizes } = harness();
    owner.onResize();
    assert.deepEqual(sizes, [[400, 700]]);
    assert.equal(owner._orientationResizePending, undefined);
  } finally { globalThis.window = previousWindow; }
});
