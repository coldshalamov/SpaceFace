import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  collectCompileSubjects,
  compileSubjectsAcrossPresents,
  revealSubjectForCompile,
  shouldSliceCompileAcrossPresents,
} from '../src/render/compilePresentSlice.js';

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
});

test('live flight compile uses the present-sliced helper', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /shouldSliceCompileAcrossPresents/);
  assert.match(source, /compileSubjectsAcrossPresents/);
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
