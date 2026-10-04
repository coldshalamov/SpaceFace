import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  collectCompileSubjects,
  collectUniqueCompileSubjects,
  compileSubjectsAcrossPresents,
  revealSubjectForCompile,
  revealSubjectWithAncestors,
  shouldSliceCompileAcrossPresents,
  shouldSliceFlightAdmission,
} from '../src/render/compilePresentSlice.js';
import { openingCompileIssueKey } from '../src/render/renderer.js';

test('collects mesh-like children and falls back to the root', () => {
  const leaf = { isMesh: true, name: 'hull' };
  const glass = { isMesh: true, name: 'canopy' };
  const root = {
    name: 'ship',
    traverse(fn) {
      fn(this);
      fn(leaf);
      fn(glass);
    },
  };
  assert.deepEqual(collectCompileSubjects(root).map((item) => item.name), ['hull', 'canopy']);
  assert.deepEqual(collectCompileSubjects({ name: 'empty' }).map((item) => item.name), ['empty']);
  assert.deepEqual(
    collectCompileSubjects({
      traverse(fn) { fn({ isSprite: true, name: 'spark' }); },
    }).map((item) => item.name),
    ['spark'],
  );
});

test('flight after first paint yields between compile subjects; loading does not slice', async () => {
  assert.equal(shouldSliceCompileAcrossPresents({ mode: 'loading', firstPlayable: true }), false);
  assert.equal(shouldSliceCompileAcrossPresents({ mode: 'flight', firstPlayable: true }), true);
  assert.equal(shouldSliceCompileAcrossPresents({ mode: 'flight', firstPlayable: false }), false);

  const order = [];
  let t = 0;
  await compileSubjectsAcrossPresents(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    async (subject) => {
      order.push(`compile:${subject.id}`);
      t += 5;
      return subject.id;
    },
    async () => { order.push('yield'); },
    { budgetMs: 4, now: () => t },
  );
  assert.deepEqual(order, ['compile:a', 'yield', 'compile:b', 'yield', 'compile:c']);

  const cheap = [];
  let cheapT = 0;
  await compileSubjectsAcrossPresents(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    async (subject) => {
      cheap.push(`compile:${subject.id}`);
      cheapT += 1;
      return subject.id;
    },
    async () => { cheap.push('yield'); },
    { budgetMs: 4, now: () => cheapT },
  );
  assert.deepEqual(cheap, ['compile:a', 'compile:b', 'compile:c'],
    'cheap compiles stay on one present');

  const holes = [];
  await compileSubjectsAcrossPresents(
    [null, { id: 'kept' }, undefined],
    async (subject) => {
      holes.push(subject.id);
      return subject.id;
    },
    async () => { holes.push('yield'); },
    { budgetMs: 4, now: () => 0 },
  );
  assert.deepEqual(holes, ['kept'], 'null compile holes are skipped without a filter copy');
});

test('flight admission slicing yields only to an urgent single-root whole-batch compile', () => {
  assert.equal(
    shouldSliceFlightAdmission({ mode: 'flight', firstPlayable: true, urgent: true, rootCount: 1 }),
    false,
    'an urgent single root takes the whole-root compile branch — no per-mesh present waits');
  assert.equal(
    shouldSliceFlightAdmission({ mode: 'flight', firstPlayable: true, urgent: true, rootCount: 3 }),
    true,
    'an urgent multi-root batch keeps present slicing');
  assert.equal(
    shouldSliceFlightAdmission({ mode: 'flight', firstPlayable: true, urgent: false, rootCount: 1 }),
    true,
    'an ambient single root keeps the 4ms sliced lane');
  assert.equal(
    shouldSliceFlightAdmission({ mode: 'loading', firstPlayable: true, urgent: true, rootCount: 1 }),
    false,
    'loading never slices — unchanged');
  assert.equal(
    shouldSliceFlightAdmission({ mode: 'flight', firstPlayable: false, urgent: true, rootCount: 1 }),
    false,
    'flight before first paint never slices — unchanged');
});

test('live flight compile uses the present-sliced helper', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /compileSubjectsAcrossPresents/);
  assert.match(source, /collectUniqueCompileSubjects\(root, openingCompileIssueKey\)/,
    'the live sliced list dedupes identical full program signatures per root');
  assert.match(source, /shouldSliceFlightAdmission\(\{\s*mode: state\.mode,[\s\S]*urgent: compileOptions && compileOptions\.urgent === true,\s*rootCount: batch\.length,/,
    'the live branch forwards compile urgency and the real root count');
});

test('admission compile selection ranks urgent ahead of explicit ahead of ambient', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const helperStart = source.indexOf('export function compilePipelineSubject');
  assert.ok(helperStart > 0, 'the selection helper is exported for coverage');
  const helper = source.slice(helperStart, helperStart + 800);
  const urgentAt = helper.indexOf('urgent === true');
  const explicitAt = helper.indexOf('explicit === true');
  assert.ok(urgentAt > 0 && explicitAt > urgentAt,
    'an on-glass explicit admission must ride the urgent lane, not the ambient-fold batch');
  assert.match(helper, /compile\(subject, \{ \.\.\.options, urgent: true \}\)/,
    'the urgent lane forwards the caller option surface with the flag set');
  assert.match(source, /compilePipelineSubject\(\s*pipelineAdmissions, subject, admissionOptions, urgent,/,
    'admitSubjectPipelines routes the live chain through the shared selection');
});

test('unique compile subjects collapse identical signatures inside one root only', async () => {
  const THREE = await import('three');
  const geo = new THREE.BoxGeometry();
  const mat = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  for (let i = 0; i < 24; i++) root.add(new THREE.Mesh(geo, mat));
  assert.equal(collectCompileSubjects(root).length, 24);
  const unique = collectUniqueCompileSubjects(root, openingCompileIssueKey);
  assert.equal(unique.length, 1,
    '24 meshes sharing one full program signature issue a single compile candidate');
  assert.equal(unique[0], root.children[0], 'the first occurrence keeps the compile slot');

  const second = new THREE.Group();
  second.add(new THREE.Mesh(geo, mat));
  second.add(new THREE.Mesh(geo, mat));
  assert.equal(collectUniqueCompileSubjects(second, openingCompileIssueKey).length, 1,
    'a second root keeps its own candidate — signature dedupe never crosses roots');

  const varied = new THREE.Group();
  const coloredGeo = new THREE.BoxGeometry();
  coloredGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(72), 3));
  varied.add(new THREE.Mesh(geo, mat));
  varied.add(new THREE.Mesh(coloredGeo, mat));
  varied.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  assert.equal(collectUniqueCompileSubjects(varied, openingCompileIssueKey).length, 3,
    'distinct attribute or material signatures keep their own compiles');

  const unkeyedA = { isMesh: true, name: 'a' };
  const keyedMesh = { isMesh: true, name: 'keyed' };
  const unkeyedB = { isMesh: true, name: 'b' };
  const mixed = {
    traverse(fn) { fn(this); fn(unkeyedA); fn(keyedMesh); fn(unkeyedB); },
  };
  assert.equal(collectUniqueCompileSubjects(mixed, () => null).length, 3,
    'null keys never dedupe — every unknown issues its own compile');
  const keyed = collectUniqueCompileSubjects(mixed, (s) => (s === unkeyedA || s === unkeyedB ? 'same' : null));
  assert.equal(keyed.length, 2, 'equal non-null keys collapse to the first occurrence');
  assert.equal(keyed[0], unkeyedA, 'first-occurrence order is preserved');
  assert.equal(keyed[1], keyedMesh, 'a null key between duplicates is still retained');
  assert.equal(collectUniqueCompileSubjects(null, () => 'x').length, 0);
  assert.equal(collectUniqueCompileSubjects(root, null).length, 24,
    'no key function returns the full collect list');
});

test('reveal for compile shows hidden instanced meshes and restores count', () => {
  const mesh = {
    isInstancedMesh: true,
    visible: false,
    frustumCulled: true,
    count: 0,
  };
  const restore = revealSubjectForCompile(mesh);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.frustumCulled, false);
  assert.equal(mesh.count, 1);
  restore();
  assert.equal(mesh.visible, false);
  assert.equal(mesh.frustumCulled, true);
  assert.equal(mesh.count, 0);
});

test('reveal for compile opens a zero drawRange so residency can upload the buffer', () => {
  const geometry = {
    drawRange: { start: 0, count: 0 },
    index: { count: 12 },
    attributes: { position: { count: 8 } },
  };
  const mesh = {
    isMesh: true,
    visible: false,
    frustumCulled: true,
    geometry,
  };
  const restore = revealSubjectForCompile(mesh);
  assert.equal(mesh.visible, true);
  assert.equal(geometry.drawRange.count, 12);
  restore();
  assert.equal(mesh.visible, false);
  assert.equal(geometry.drawRange.count, 0);
});

test('reveal for compile hides a null-geometry sprite instead of revealing it into the draw', () => {
  // D102: isSprite joined requiresGeometry — a torn-down sprite whose shared
  // quad reference was nulled reaches the same WebGLGeometries.get geometry.id
  // read as a null-geometry mesh, so the reveal must not force it visible.
  const sprite = {
    isSprite: true,
    visible: true,
    frustumCulled: true,
    geometry: null,
  };
  const restore = revealSubjectForCompile(sprite);
  assert.equal(sprite.visible, false,
    'a visible geometryless sprite is hidden for the compile draw, not revealed into it');
  assert.equal(sprite.frustumCulled, true, 'frustum culling untouched for the hidden node');
  restore();
  assert.equal(sprite.visible, true, 'visibility restored after the reveal');
});

test('reveal with ancestors unhides the holder chain so a parked subject actually draws', () => {
  // render() skips a hidden object's whole subtree: a pool mesh held under a visible:false
  // holder was "touched" without ever drawing, so its program still linked inside the first
  // presented bloomScene. The reveal must reach the ancestors, not just the subject.
  const scene = { visible: true };
  const holder = { visible: false, parent: scene };
  const mesh = { isMesh: true, visible: false, frustumCulled: true, parent: holder };
  scene.parent = null;
  const restore = revealSubjectWithAncestors(mesh);
  assert.equal(mesh.visible, true, 'subject revealed');
  assert.equal(holder.visible, true, 'hidden holder revealed');
  assert.equal(scene.visible, true, 'scene root untouched-value preserved');
  restore();
  assert.equal(mesh.visible, false);
  assert.equal(holder.visible, false, 'holder re-hidden after the touch');
  assert.equal(scene.visible, true);
});

test('reveal with ancestors never unhides an authored-fallback holder', () => {
  // Fallback layers are never-live content: revealSubjectForCompile refuses them at the
  // subject level, and the ancestor walk must obey the same rule one level up.
  const scene = { visible: true, parent: null };
  const holder = { visible: false, parent: scene, userData: { authoredReadableFallbackLayer: true } };
  const mesh = { isMesh: true, visible: true, frustumCulled: true, parent: holder };
  const restore = revealSubjectWithAncestors(mesh);
  assert.equal(holder.visible, false, 'tagged fallback holder stays hidden');
  restore();
  assert.equal(holder.visible, false);
});

test('reveal with ancestors restores ancestors when the subject reveal throws', () => {
  const scene = { visible: true, parent: null };
  const holder = { visible: false, parent: scene };
  const mesh = {
    isMesh: true,
    visible: true,
    parent: holder,
    traverse() { throw new Error('traverse boom'); },
  };
  assert.throws(() => revealSubjectWithAncestors(mesh), /traverse boom/);
  assert.equal(holder.visible, false, 'ancestor visibility restored on throw');
});
