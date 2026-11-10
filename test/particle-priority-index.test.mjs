import assert from 'node:assert/strict';
import test from 'node:test';
import { createParticlePriorityIndex } from '../src/render/particlePriorityIndex.js';

test('priority index matches the existing scan across spawns, eviction, expiration and reuse', () => {
  const cap = 257, priorities = new Float64Array(cap), serials = new Float64Array(cap);
  const activePositions = new Int32Array(cap); activePositions.fill(-1);
  const active = [], free = Array.from({ length: cap }, (_, i) => i);
  const index = createParticlePriorityIndex(cap, priorities, serials, activePositions);
  let seed = 47, serial = 0;
  const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0);
  const scan = () => active.reduce((lowest, slot) => lowest < 0 || priorities[slot] < priorities[lowest]
    || priorities[slot] === priorities[lowest] && serials[slot] < serials[lowest] ? slot : lowest, -1);
  const retire = slot => {
    index.remove(slot);
    const at = activePositions[slot], moved = active.pop();
    if (at < active.length) { active[at] = moved; activePositions[moved] = at; index.changed(moved); }
    activePositions[slot] = -1; free.push(slot);
  };
  for (let i = 0; i < 20000; i++) {
    assert.equal(index.peek(), scan());
    if (active.length && random() % 7 === 0) retire(active[random() % active.length]);
    else {
      if (!free.length) retire(scan());
      const slot = free.pop(); priorities[slot] = random() % 5; serials[slot] = serial++;
      activePositions[slot] = active.length; active.push(slot); index.add(slot);
    }
  }
  while (active.length) { assert.equal(index.peek(), scan()); retire(active[0]); }
  assert.equal(index.peek(), -1);
});

test('equal priority and serial preserve active-list tie ordering after swap removal', () => {
  const p = new Float64Array(4), s = new Float64Array(4), a = new Int32Array([0, 1, 2, 3]);
  const index = createParticlePriorityIndex(4, p, s, a);
  for (let i = 0; i < 4; i++) index.add(i);
  assert.equal(index.peek(), 0);
  index.remove(0); a[3] = 0; a[0] = -1; index.changed(3);
  assert.equal(index.peek(), 3);
});
