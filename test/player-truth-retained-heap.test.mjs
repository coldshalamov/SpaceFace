import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { appendReaderDrain } from '../scripts/player-truth/run.mjs';

test('packed observations keep indexed iteration and the array methods used by graders', () => {
  const original = [[1, 6, 2, 3, 0, 0, 20, 30, 4, 3, 0, 0],
    [2, 6, 5, 6, 0, 0, 50, 60, 4, 3, 0, 0]];
  const trace = { meta: { playStartSim: 0 }, samples: [], events: [], longTasks: [], keys: [] };
  appendReaderDrain(trace, { samples: [{ e: original }], events: [], longTasks: [], keys: [] });
  const rows = trace.samples[0].e;
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  assert.equal(0 in rows, true);
  assert.equal(1 in rows, true);
  assert.equal(2 in rows, false);
  assert.deepEqual([...rows].map(row => Array.from(row)), original);
  assert.deepEqual(rows.map(row => row[0]), [1, 2]);
  assert.deepEqual(Array.from(rows.find(row => row[0] === 2)), original[1]);
  assert.deepEqual(rows.filter(row => row[0] === 1).map(row => Array.from(row)), [original[0]]);
  assert.equal(rows.every(row => row.length === 12), true);
  assert.equal(rows.reduce((total, row) => total + row[0], 0), 3);
});

test('a thousand dense Racing frames retain numeric storage without a heap object per body', () => {
  const child = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=256',
    '--input-type=module', '-e', `
      import { appendReaderDrain } from './scripts/player-truth/run.mjs';
      global.gc();
      const before = process.memoryUsage();
      const trace = { meta: { playStartSim: 0 }, samples: [], events: [], longTasks: [], keys: [] };
      for (let batch = 0; batch < 100; batch++) {
        const samples = Array.from({ length: 10 }, () => ({ mode: 'flight',
          e: Array.from({ length: 1300 }, (_, id) => [id, 6, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0]) }));
        appendReaderDrain(trace, { samples, events: [], longTasks: [], keys: [] });
      }
      global.gc();
      const after = process.memoryUsage();
      console.log(JSON.stringify({ frames: trace.samples.length,
        lastId: trace.samples.at(-1).e.at(-1)[0],
        heapMiB: (after.heapUsed - before.heapUsed) / 1048576,
        numericBytes: after.arrayBuffers - before.arrayBuffers }));
    `], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  const measured = JSON.parse(child.stdout.trim());
  assert.equal(measured.frames, 1000);
  assert.equal(measured.lastId, 1299, 'the complete body census is retained');
  assert.equal(measured.numericBytes, 1000 * 1300 * 12 * Float64Array.BYTES_PER_ELEMENT);
  assert.ok(measured.heapMiB < 48,
    `${measured.heapMiB.toFixed(1)} MiB retained heap: numeric storage must not retain 1.3 million row views`);
});
