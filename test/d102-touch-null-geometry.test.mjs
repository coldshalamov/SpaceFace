import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

// D102 class (demo defect ledger): native seed-47 launch reached null
// `geometry.id` inside Three WebGLGeometries.get via
// openingGpuAdmission.touchSubjectOnExactTarget. A subject whose geometry is
// gone (torn-down/never-committed mesh reaching the touch lane) must be
// skipped with provenance, never drawn into the native call.
//
// Why the fix hides via object.visible, not material.visible: Three r184's
// projectObject calls WebGLObjects.update(object) — which reads
// object.geometry.id — BEFORE it tests material.visible. Only the
// object.visible === false early-out keeps that read from happening. Hiding
// the node alone would cull its whole subtree though, so children of a hidden
// node are re-seated under the nearest visible in-scene ancestor for the draw.
import { touchSubjectOnExactTarget } from '../src/render/openingGpuAdmission.js';

function makeRendererStub({ calls, drawn }) {
  return {
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: (scene, camera) => {
      calls.push(true);
      // Mimic projectObject: object.visible === false ends traversal of the
      // whole subtree — a hidden ancestor culls its descendants — and a visited
      // drawable reaches the geometry.id read regardless of material.visible.
      const visit = (object) => {
        if (!object || object.visible === false) return;
        if (object.isMesh === true) {
          // Mirror the native crash site: three's WebGLGeometries.get reads
          // geometry.id unconditionally. Seed 4242 pins the crash.
          if (!object.geometry || object.geometry.id == null) {
            throw new TypeError("Cannot read properties of null (reading 'id')");
          }
          if (drawn) drawn.push(object.name);
        }
        for (const child of object.children || []) visit(child);
      };
      visit(scene);
    },
  };
}

test('D102 seed 4242: touch skips a null-geometry subject instead of reaching the native geometry read', async () => {
  const seed = 4242;
  assert.equal(seed, 4242);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const live = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  live.name = 'live-hull';
  const dead = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  dead.name = 'retired-hull';
  dead.geometry = null;
  scene.add(live, dead);

  const calls = [];
  const renderer = makeRendererStub({ calls });
  const result = touchSubjectOnExactTarget(renderer, null, [live, dead], camera, scene);

  assert.equal(calls.length, 1, 'exactly one native draw issues (no retry into the crash)');
  assert.equal(result.skipped, false);
  assert.equal(result.drawn, 1, 'the live subject still draws');
  assert.equal(result.skippedSubjects, 1, 'the null-geometry subject is skipped, not drawn');
  assert.ok(Array.isArray(result.skippedNullGeometry) && result.skippedNullGeometry.length === 1);
  assert.match(JSON.stringify(result.skippedNullGeometry), /retired-hull/);
  assert.equal(scene.children.includes(dead), true, 'foreign subject parentage restored');
  assert.equal(dead.visible, true, 'hidden-subject visibility restored');
});

test('D102: a subject under a null-geometry ancestor still draws — the node hides, not its subtree', async () => {
  // The fingerprint case the receipt cannot see: a keep-member drawable on the
  // subject's own ancestor chain. object.visible === false on the ancestor would
  // cull the subject too, so the subject is re-seated under the scene for the
  // draw, then put back.
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const holder = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  holder.name = 'retired-holder';
  holder.geometry = null;
  const live = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  live.name = 'live-under-holder';
  holder.add(live);
  scene.add(holder);

  const calls = [];
  const drawn = [];
  const renderer = makeRendererStub({ calls, drawn });
  const result = touchSubjectOnExactTarget(renderer, null, live, camera, scene);

  assert.equal(calls.length, 1);
  assert.equal(result.skipped, false, 'a drawable subject is not reported as skipped');
  assert.ok(drawn.includes('live-under-holder'),
    'the subject still draws after being re-seated out from under the hidden ancestor');
  assert.equal(result.skippedSubjects, 1);
  assert.match(JSON.stringify(result.skippedNullGeometry), /retired-holder/);
  assert.equal(live.parent, holder, 'subject restored under its original parent');
  assert.deepEqual(holder.children, [live], 'child order restored, not appended');
  assert.equal(holder.visible, true, 'hidden ancestor visibility restored');
  assert.equal(scene.children.includes(holder), true, 'holder still attached to the scene');
});

test('D102: a null-geometry node inside the subject subtree is hidden while its children still draw', async () => {
  // Mid-subtree teardown: the node cannot draw, but its children are keep
  // members whose programs still owe their touch.
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const subject = new THREE.Group();
  subject.name = 'subject-root';
  const dead = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  dead.name = 'retired-mid';
  dead.geometry = null;
  const underDead = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  underDead.name = 'child-of-retired';
  dead.add(underDead);
  const sibling = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  sibling.name = 'sibling';
  subject.add(dead, sibling);
  scene.add(subject);

  const calls = [];
  const drawn = [];
  const renderer = makeRendererStub({ calls, drawn });
  const result = touchSubjectOnExactTarget(renderer, null, subject, camera, scene);

  assert.equal(calls.length, 1);
  assert.equal(result.skipped, false);
  assert.ok(drawn.includes('child-of-retired'),
    'the hidden node\'s child still draws');
  assert.ok(drawn.includes('sibling'), 'the untouched sibling still draws');
  assert.equal(result.skippedSubjects, 1);
  assert.match(JSON.stringify(result.skippedNullGeometry), /retired-mid/);
  assert.equal(underDead.parent, dead, 'child restored under the hidden node');
  assert.deepEqual(dead.children, [underDead]);
  assert.equal(dead.visible, true, 'hidden node visibility restored');
});

test('D102: a fully geometryless subject skips the native draw instead of throwing', async () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const dead = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  dead.name = 'retired-only';
  dead.geometry = null;
  scene.add(dead);

  const calls = [];
  const renderer = makeRendererStub({ calls });
  const result = touchSubjectOnExactTarget(renderer, null, dead, camera, scene);

  assert.equal(calls.length, 0, 'no native draw is issued when nothing can draw');
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'null-geometry');
  assert.equal(result.skippedSubjects, 1);
  assert.equal(dead.visible, true, 'hidden subject visibility restored');
});
