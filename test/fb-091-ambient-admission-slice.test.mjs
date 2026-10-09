// FB-091 — the ambient lane drains by slice budget, not one root per present.
// A synthetic 40-root queue must admit several roots inside one present while the slice
// has room, then wait for the next present once the clock is spent — the drain is paced
// by milliseconds, never by "one item per frame".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveGeometryAdmissionQueue } from '../src/render/liveGeometryAdmission.js';
import { createAmbientAdmissionYield } from '../src/render/pipelineAutoFlushPolicy.js';

const ROOT_COUNT = 40;

async function drainQueue({ perRootMs = 1.5 } = {}) {
  let now = 0;
  let presents = 0;
  let admitted = 0;
  const prepared = [];
  const yieldToNext = createAmbientAdmissionYield(() => {
    presents += 1;
    return Promise.resolve();
  }, () => now);
  const queue = createLiveGeometryAdmissionQueue({
    compile: () => Promise.resolve(),
    prepare: async () => {
      now += perRootMs; // each root's residency pass burns a fixed slice share
      return { skipped: false };
    },
    yieldToMain: yieldToNext,
    isActive: () => true,
    isUrgent: () => false,
    onReady: (entity) => { admitted += 1; prepared.push(entity.id); },
    onError: () => {},
    priorityOf: () => 0,
  });
  const waits = [];
  for (let i = 0; i < ROOT_COUNT; i++) {
    waits.push(queue.enqueue({ id: i + 1, type: 'asteroid' }, { id: i + 1 }));
  }
  const results = await Promise.all(waits);
  return { presents, admitted, prepared, results };
}

test('a 40-root ambient queue admits multiple roots per present until the slice is spent', async () => {
  const { presents, admitted, prepared, results } = await drainQueue();
  assert.equal(admitted, ROOT_COUNT, 'every queued root must be admitted');
  assert.equal(results.filter(Boolean).length, ROOT_COUNT);
  assert.equal(prepared.length, ROOT_COUNT);
  // One root per present would cost 40 presents; a pure microtask drain would cost 1.
  // The slice lands between: 1.5 ms per root against an 8 ms hard clock — several roots
  // per present, then a real wait.
  assert.ok(presents < ROOT_COUNT, `expected multi-root presents, got ${presents}`);
  assert.ok(presents >= 3, `expected the slice to bound each present, got ${presents} presents`);
});

test('cheaper roots drain more per present; expensive roots fewer — the clock decides', async () => {
  const cheap = await drainQueue({ perRootMs: 0.5 });
  const expensive = await drainQueue({ perRootMs: 4 });
  assert.equal(cheap.admitted, ROOT_COUNT);
  assert.equal(expensive.admitted, ROOT_COUNT);
  assert.ok(cheap.presents < expensive.presents,
    `cheap roots should need fewer presents (${cheap.presents}) than expensive (${expensive.presents})`);
  assert.ok(expensive.presents < ROOT_COUNT,
    'even heavy roots batch at least two to a present under the minimum-item rule');
});
