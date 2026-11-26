import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createOpaqueStateSort, __test } from '../src/render/opaqueStateSort.js';

// Fake renderer.properties: material -> { currentProgram: { id } }.
function rendererWith(programs) {
  return { properties: { get: (m) => (programs.has(m) ? { currentProgram: { id: programs.get(m) } } : undefined) } };
}
let nextId = 1;
const mat = (extra = {}) => ({ id: nextId++, colorWrite: true, depthTest: true, depthWrite: true,
  stencilWrite: false, depthFunc: 3 /* LessEqualDepth */, ...extra });
const item = (name, material, z = 0, renderOrder = 0) => ({ name, material, z, renderOrder });

test('ordinary opaque draws group by program, then material, then front-to-back', () => {
  const a = mat(); const b = mat(); const c = mat();
  const sort = createOpaqueStateSort(rendererWith(new Map([[a, 7], [b, 3], [c, 7]])));
  const list = [item('a-far', a, 9), item('b', b, 5), item('c', c, 1), item('a-near', a, 2)];
  sort(list);
  assert.deepEqual(list.map((i) => i.name), ['b', 'a-near', 'a-far', 'c']);
});

test('order-sensitive draws are barriers: nothing crosses them', () => {
  const lit = mat(); const other = mat();
  const prepass = mat({ colorWrite: false });
  const overlay = mat({ depthTest: false });
  const sort = createOpaqueStateSort(rendererWith(new Map([[lit, 9], [other, 1], [prepass, 2], [overlay, 0]])));
  const list = [item('lit1', lit), item('prepass', prepass), item('lit2', lit), item('other', other),
    item('overlay', overlay), item('lit3', lit), item('other2', other)];
  sort(list);
  assert.deepEqual(list.map((i) => i.name),
    ['lit1', 'prepass', 'other', 'lit2', 'overlay', 'other2', 'lit3']);
  assert.equal(__test.isBarrier(mat({ depthWrite: false })), true);
  assert.equal(__test.isBarrier(mat({ stencilWrite: true })), true);
  assert.equal(__test.isBarrier(mat({ depthFunc: 6 })), true);
  assert.equal(__test.isBarrier(mat()), false);
});

test('renderOrder still orders inside a segment (big occluders first, under-layers last)', () => {
  const grout = mat(); const plate = mat();
  const sort = createOpaqueStateSort(rendererWith(new Map([[grout, 1], [plate, 50]])));
  const list = [item('grout', grout, 0, 1), item('plate', plate, 0, 0)];
  sort(list);
  assert.deepEqual(list.map((i) => i.name), ['plate', 'grout']);
});

test('called as a plain comparator by an unpatched three it keeps traversal order', () => {
  const sort = createOpaqueStateSort(rendererWith(new Map()));
  const list = [item('x', mat()), item('y', mat()), item('z', mat())];
  list.sort(sort);
  assert.deepEqual(list.map((i) => i.name), ['x', 'y', 'z']);
  assert.equal(sort.sortsWholeList, true);
});
