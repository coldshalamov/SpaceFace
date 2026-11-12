import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPipSpannerRig, createPipSpannerMotion, createPipSpannerPreview } from '../src/ui/orrery/pipSpannerPreview.js';

const positions = { SPANNER_ROOT: [0, 0, 0], CLAW_L: [1.62, .3, -3.6], CLAW_R: [1.62, .3, 3.6],
  ITEM_CRADLE: [1.25, .8, 0], PIP_ROOT: [-8.4, 1.9, -4.4], PIP_POINTER: [-7.9, 1.78, -3.61] };
function blueprint() {
  const material = new THREE.MeshStandardMaterial({ color: 0xa69d8a });
  material.userData = { spacefaceFinish: 'forge-v1', spacefaceMaterialRole: 'hull' };
  return { assetId: 'sf20_19_pip_spanner', metadata: { previewOnly: true, worldEntity: false },
    markers: Object.entries(positions).map(([name, position]) => ({ name, matrix: new THREE.Matrix4().makeTranslation(...position) })),
    primitives: Object.entries(positions).map(([name, position]) => ({ name: `LOD0_${name}__Hull`,
      geometry: new THREE.BoxGeometry(1, 1, 1), material,
      matrix: new THREE.Matrix4().makeTranslation(position[0] + .4, position[1] + .2, position[2] + .1) })) };
}
function closeBlueprint(value) { for (const primitive of value.primitives) primitive.geometry.dispose(); value.primitives[0].material.dispose(); }
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function previewFixture({ load = Promise.resolve(blueprint()), compile = async () => ({ ready: true }) } = {}) {
  const counts = { draws: 0, ready: 0, errors: 0, release: 0, dispose: 0, lost: 0 };
  const canvas = { getContext() {}, clientWidth: 360, clientHeight: 216, addEventListener() {}, removeEventListener() {} };
  const context = { isContextLost: () => false };
  const renderer = { setPixelRatio() {}, setClearColor() {}, setSize() {}, render() { counts.draws++; },
    info: { programs: [] }, getContext: () => context,
    dispose() { counts.dispose++; }, forceContextLoss() { counts.lost++; } };
  const view = createPipSpannerPreview({ canvas, doc: { defaultView: {} }, rendererFactory: () => renderer,
    leaseFactory: () => ({ load: () => load, release() { counts.release++; } }), compile,
    onReady() { counts.ready++; }, onError() { counts.errors++; } });
  return { view, counts };
}

test('independent rigid groups preserve flattened world transforms, including the nested pointer', () => {
  const value = blueprint(), rig = buildPipSpannerRig(value);
  try {
    rig.root.updateMatrixWorld(true);
    for (const primitive of value.primitives) {
      const mesh = rig.root.getObjectByName(primitive.name);
      assert.deepEqual(mesh.matrixWorld.elements, primitive.matrix.elements, primitive.name);
    }
    assert.equal(rig.groups.PIP_POINTER.parent, rig.groups.PIP_ROOT);
    assert.deepEqual(rig.groups.PIP_POINTER.position.toArray().map(n => Number(n.toFixed(2))), [.5, -.12, .79]);
    rig.groups.CLAW_L.rotation.y = -.17; rig.root.updateMatrixWorld(true);
    assert.deepEqual(rig.groups.SPANNER_ROOT.children.find(child => child.isMesh).matrixWorld.elements, value.primitives[0].matrix.elements,
      'bearing/body stays fixed while the independent jaw moves');
  } finally { rig.dispose(); closeBlueprint(value); }
});

test('crew pose stays bounded and reduced motion stops immediately without an idle frame loop', () => {
  const value = blueprint(), rig = buildPipSpannerRig(value); let time = 0, reduced = false, next = null, draws = 0;
  const motion = createPipSpannerMotion(rig, { now: () => time, reduced: () => reduced, width: () => 10000,
    schedule(fn) { next = fn; return 1; }, cancel() { next = null; }, draw() { draws++; } });
  try {
    const step = at => { time = at; const fn = next; next = null; fn(); };
    motion.play('confirm'); step(325);
    assert(Math.abs(rig.groups.CLAW_L.rotation.y + .17) < 1e-8);
    assert(Math.abs(rig.groups.CLAW_R.rotation.y - .17) < 1e-8);
    step(650); assert.equal(next, null); assert(Math.abs(rig.groups.CLAW_L.rotation.y) < 1e-8);
    motion.play('focus'); step(870);
    const delta = rig.groups.PIP_ROOT.position.clone().sub(rig.rest.PIP_ROOT.position);
    assert(Math.hypot(delta.x, delta.z) * 10000 / 20.5 <= 30 + 1e-8);
    reduced = true; motion.play('confirm'); assert.equal(next, null);
    assert.deepEqual(rig.groups.ITEM_CRADLE.position.toArray(), rig.rest.ITEM_CRADLE.position.toArray());
    assert(draws >= 4);
  } finally { motion.dispose(); rig.dispose(); closeBlueprint(value); }
});

test('retiring a pending asset never publishes or draws into a replacement screen', async () => {
  const gate = deferred(), value = blueprint(), { view, counts } = previewFixture({ load: gate.promise });
  view.dispose(); view.dispose(); gate.resolve(value);
  assert.equal(await view.ready, false);
  assert.deepEqual(counts, { draws: 0, ready: 0, errors: 0, release: 1, dispose: 1, lost: 1 });
  closeBlueprint(value);
});

test('closing during safe pipeline compilation withholds late readiness and releases the exact preview once', async () => {
  const gate = deferred(), value = blueprint(), { view, counts } = previewFixture({ load: Promise.resolve(value), compile: () => gate.promise });
  await Promise.resolve(); await Promise.resolve();
  view.dispose(); gate.resolve({ ready: true });
  assert.equal(await view.ready, false); assert.equal(counts.ready, 0); assert.equal(counts.draws, 0);
  assert.equal(counts.release, 1); assert.equal(counts.dispose, 1);
  closeBlueprint(value);
});

test('an admitted preview draws once at rest and owns neither shared geometry nor transaction state', async () => {
  const value = blueprint(), { view, counts } = previewFixture({ load: Promise.resolve(value) });
  let geometryDisposals = 0; value.primitives[0].geometry.addEventListener('dispose', () => geometryDisposals++);
  assert.equal(await view.ready, true); assert.equal(counts.ready, 1); assert.equal(counts.draws, 1);
  view.receipt({ outcome: 'accepted', offerId: 'old' }, 'new'); assert.equal(counts.draws, 1);
  view.dispose(); assert.equal(geometryDisposals, 0, 'the authored lease owns shared geometry');
  assert.equal(counts.release, 1); closeBlueprint(value);
});
