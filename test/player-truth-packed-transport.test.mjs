import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePlayerTruthRows, decodePlayerTruthRows } from '../src/testing/playerTruth/packedRows.js';
import { appendReaderDrain, traceJsonChunks } from '../scripts/player-truth/run.mjs';

test('browser binary transport preserves exact rows and the original saved trace schema', () => {
  const rows = [
    [1, 8, NaN, Infinity, -Infinity, -0, 12, 13, 4.2, 3, 4, 5],
    [null, 8, 0, 0, 0, 0, 640, 360, 10, 3, undefined, 7],
  ];
  const savedBuffer = globalThis.Buffer;
  let packet;
  try { globalThis.Buffer = undefined; packet = encodePlayerTruthRows(rows); }
  finally { globalThis.Buffer = savedBuffer; }
  const trace = { meta: { playStartSim: 0 }, samples: [], events: [], longTasks: [], keys: [] };
  appendReaderDrain(trace, { samples: [{ mode: 'flight', e: [], ePacked: packet }], events: [], longTasks: [], keys: [] });
  assert.deepEqual(trace.samples[0].e.map(row => Array.from(row)), rows);
  assert.equal(Object.is(trace.samples[0].e[0][5], -0), true);
  assert.equal('ePacked' in trace.samples[0], false);
  const expected = { meta: trace.meta, samples: [{ mode: 'flight', e: rows }], events: [], longTasks: [], keys: [] };
  assert.equal([...traceJsonChunks(trace)].join(''), JSON.stringify(expected));
});

test('unrecognized rows remain unencoded and truncated packets fail closed', () => {
  assert.equal(encodePlayerTruthRows([[1, 'new-schema']]), null);
  const packet = encodePlayerTruthRows([[1, 8, 0, 0, 0, 0, 0, 0, 1, 3, 4, 5]]);
  assert.throws(() => decodePlayerTruthRows({ ...packet, values: '' }), /Truncated/);
  assert.throws(() => decodePlayerTruthRows({ ...packet, count: NaN }), /Invalid/);
});
