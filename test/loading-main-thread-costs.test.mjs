// Two main-thread costs the 2026-10-13 launch profile named on the loading screen:
//  - openingCompileIssueKey rebuilt a multi-KB composite string for every subject an opening cook
//    walks (0.9 s), now an interned compact key plus a validated per-geometry attribute memo;
//  - the translated-catalog idle warm forced a slice (0.73 s of machineTranslatePart) while the
//    loading shell was animating, now deferred until the shell is gone.
// Neither changes what is compiled or translated: only when, and what string is hashed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { compileIssueKeyTableSize, internCompileIssueKey, openingCompileIssueKey } from '../src/render/renderer.js';
import { loadingShellVisible, mayForceWarmSlice } from '../src/localization/idleWarmPolicy.js';

const THREE = await import('three');

function bigPatchMaterial(tag) {
  const material = new THREE.MeshStandardMaterial();
  // customProgramCacheKey defaults to onBeforeCompile.toString(): a long patch body is the real shape.
  const body = `${tag}:${'x'.repeat(6000)}`;
  material.onBeforeCompile = new Function('shader', `/* ${body} */ shader.fragmentShader += '';`);
  return material;
}

test('the compile issue key stays short however long the material signature is', () => {
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, bigPatchMaterial('a'));
  const key = openingCompileIssueKey(mesh);
  assert.ok(typeof key === 'string' && key.length > 0);
  assert.ok(key.length < 160, `compact key, got ${key.length} chars`);
  const multi = new THREE.Mesh(geometry, [bigPatchMaterial('a'), bigPatchMaterial('b')]);
  assert.ok(openingCompileIssueKey(multi).length < 200, 'multi-material subjects stay compact too');
});

test('interning keeps the dedupe exact: equal signatures share a key, different ones do not', () => {
  const geometry = new THREE.BoxGeometry();
  const a1 = new THREE.Mesh(geometry, bigPatchMaterial('same'));
  const a2 = new THREE.Mesh(geometry, bigPatchMaterial('same'));
  const b = new THREE.Mesh(geometry, bigPatchMaterial('other'));
  assert.equal(openingCompileIssueKey(a1), openingCompileIssueKey(a2), 'identical patch bodies share a key');
  assert.notEqual(openingCompileIssueKey(a1), openingCompileIssueKey(b), 'different patch bodies split');
  const pair = new THREE.Mesh(geometry, [bigPatchMaterial('same'), bigPatchMaterial('other')]);
  const swapped = new THREE.Mesh(geometry, [bigPatchMaterial('other'), bigPatchMaterial('same')]);
  assert.notEqual(openingCompileIssueKey(pair), openingCompileIssueKey(swapped), 'material order is part of the program');
});

test('the per-geometry memo re-derives when the attribute set changes under it', () => {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  const plain = openingCompileIssueKey(mesh);
  assert.equal(openingCompileIssueKey(mesh), plain, 'a repeat read is stable');

  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(72), 3));
  const rgb = openingCompileIssueKey(mesh);
  assert.notEqual(rgb, plain, 'an attribute added after the first read splits the key');

  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(96), 4));
  const rgba = openingCompileIssueKey(mesh);
  assert.notEqual(rgba, rgb, 'a wider replacement attribute (vertexAlphas) splits the key');

  geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(72), 3)];
  const morphed = openingCompileIssueKey(mesh);
  assert.notEqual(morphed, rgba, 'a morph target added after the first read splits the key');
  geometry.morphAttributes.position.push(new THREE.BufferAttribute(new Float32Array(72), 3));
  assert.notEqual(openingCompileIssueKey(mesh), morphed, 'a grown morph array splits the key');
});

test('the memo is exact: swapping one attribute name for another of the same width splits the key', () => {
  // Review R03: a count-plus-width-sum guard cannot see `normal` replaced by `color` (both 3-wide),
  // so a sibling that really keeps normals shared the stale key and one distinct program was never compiled.
  const material = new THREE.MeshStandardMaterial();
  const position = () => new THREE.BufferAttribute(new Float32Array(72), 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position());
  geometry.setAttribute('normal', position());
  const mesh = new THREE.Mesh(geometry, material);
  const withNormal = openingCompileIssueKey(mesh);
  assert.equal(openingCompileIssueKey(mesh), withNormal, 'a repeat read of an unchanged geometry is stable');

  geometry.deleteAttribute('normal');
  geometry.setAttribute('color', position());
  const withColor = openingCompileIssueKey(mesh);
  assert.notEqual(withColor, withNormal, 'normal swapped for color is a different program');

  const sibling = new THREE.BufferGeometry();
  sibling.setAttribute('position', position());
  sibling.setAttribute('normal', position());
  assert.equal(openingCompileIssueKey(new THREE.Mesh(sibling, material)), withNormal,
    'a sibling that still has normals keys exactly like the first read');
  assert.notEqual(openingCompileIssueKey(new THREE.Mesh(sibling, material)), withColor);

  // Same attribute names in a different insertion order are the same program (names are sorted).
  const reordered = new THREE.BufferGeometry();
  reordered.setAttribute('normal', position());
  reordered.setAttribute('position', position());
  assert.equal(openingCompileIssueKey(new THREE.Mesh(reordered, material)), withNormal);
});

test('the memo is exact for morph targets: renaming a morph target with the same length splits the key', () => {
  const material = new THREE.MeshStandardMaterial();
  const morphTarget = () => new THREE.BufferAttribute(new Float32Array(72), 3);
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  geometry.morphAttributes.position = [morphTarget()];
  const onPosition = openingCompileIssueKey(mesh);
  assert.equal(openingCompileIssueKey(mesh), onPosition);

  geometry.morphAttributes = { normal: [morphTarget()] };
  assert.notEqual(openingCompileIssueKey(mesh), onPosition, 'position morphs and normal morphs select different flags');

  const same = new THREE.BoxGeometry();
  same.morphAttributes.position = [morphTarget()];
  assert.equal(openingCompileIssueKey(new THREE.Mesh(same, material)), onPosition);
});

function fakeDoc(shell) {
  return { getElementById: (id) => (id === 'boot-overlay' ? shell : null) };
}
function fakeShell({ display = 'flex', hidden = false } = {}) {
  return { style: { display }, classList: { contains: (name) => name === 'hidden' && hidden } };
}

test('the loading shell counts as visible until it is hidden by class or display', () => {
  assert.equal(loadingShellVisible(fakeDoc(fakeShell())), true);
  assert.equal(loadingShellVisible(fakeDoc(fakeShell({ hidden: true }))), false);
  assert.equal(loadingShellVisible(fakeDoc(fakeShell({ display: 'none' }))), false);
  assert.equal(loadingShellVisible(fakeDoc(null)), false, 'no shell element: nothing is loading');
  assert.equal(loadingShellVisible(null), false);
  assert.equal(loadingShellVisible({ getElementById() { throw new Error('boom'); } }), false);
});

test('a timed-out idle warm may force a slice only when the loading shell is gone', () => {
  const loading = fakeDoc(fakeShell());
  const flying = fakeDoc(fakeShell({ hidden: true }));
  assert.equal(mayForceWarmSlice({ didTimeout: true, doc: loading }), false, 'loading never donates a slice');
  assert.equal(mayForceWarmSlice({ didTimeout: true, doc: flying }), true, 'a busy flight still converges');
  assert.equal(mayForceWarmSlice({ didTimeout: false, doc: flying }), false, 'a real idle gap is taken by the loop, not the forced path');
  assert.equal(mayForceWarmSlice({}), false);
});

test('the compile-key table is capped and ids are never reused, so retention is bounded and nothing aliases', () => {
  const before = compileIssueKeyTableSize();
  const first = internCompileIssueKey('retention-probe-0');
  assert.equal(internCompileIssueKey('retention-probe-0'), first, 'an equal signature keeps its id inside the table');
  // Mint far more distinct signatures than the cap (20 000): the table must not grow without bound.
  const seen = new Set([first]);
  for (let index = 1; index <= 45000; index++) {
    const id = internCompileIssueKey(`retention-probe-${index}`);
    assert.ok(!seen.has(id), `id ${id} for signature ${index} was handed out before`);
    seen.add(id);
  }
  assert.ok(compileIssueKeyTableSize() <= 20000, `the table stays under its cap (${compileIssueKeyTableSize()})`);
  assert.ok(compileIssueKeyTableSize() >= 1 && before >= 0);
  // A signature interned before a clear gets a NEW id after it, never an id some other signature already holds.
  const again = internCompileIssueKey('retention-probe-0');
  assert.ok(!seen.has(again) || again === first, 'a re-interned signature never takes another signature\'s id');
});
