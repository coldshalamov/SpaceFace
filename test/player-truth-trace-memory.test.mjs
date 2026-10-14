import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { appendReaderDrain, traceJsonChunks, writeTraceGzip } from '../scripts/player-truth/run.mjs';
import { CLS, VIS, runChecks } from '../scripts/player-truth/checks.mjs';

function racingTrace() {
  return { meta: { mode: 'racing', rounds: false, playStartSim: 0 }, samples: [], events: [],
    longTasks: [], keys: ['a|m|lod0|authored', 'b|m|lod1|authored'], rounds: [], probes: [] };
}

function courseFrames(n = 30, bodies = 1300) {
  return Array.from({ length: n }, (_, frame) => ({ f: frame, t: frame * 100, dt: 16,
    sim: frame / 10, mode: 'flight', run: { ph: 'inactive' }, vw: 1280, vh: 720, p: null,
    e: Array.from({ length: bodies }, (_, id) => [id + 1, CLS.other, id + 0.1, id + 0.2,
      0, 0, 640 - frame, 360 + frame, 10.3,
      id === 0 && frame % 4 < 2 ? VIS.hidden : VIS.onscreen, id === 0 ? frame % 2 : 0, 0]) }));
}

test('one nullable observer field cannot disable packing for an entire dense frame', () => {
  const expected = racingTrace(); expected.samples = courseFrames(8, 1300);
  for (const sample of expected.samples) { sample.e[1299][0] = null; sample.e[1299][11] = undefined; }
  const actual = racingTrace();
  appendReaderDrain(actual, { samples: structuredClone(expected.samples), events: [], longTasks: [], keys: expected.keys });
  for (let i = 0; i < actual.samples.length; i++) {
    const rows = actual.samples[i].e;
    assert.ok(rows[0] instanceof Float64Array, 'numeric rows remain packed');
    assert.equal(rows[1299][0], null); assert.equal(rows[1299][11], undefined);
    assert.deepEqual(rows.map(row => Array.from(row)), expected.samples[i].e);
  }
  assert.deepEqual(runChecks(actual), runChecks(expected));
  assert.equal([...traceJsonChunks(actual)].join(''), JSON.stringify(expected));
});

test('large moving-course drains retain every numeric field and every check verdict in packed rows', () => {
  const expected = racingTrace(); expected.samples = courseFrames();
  const actual = racingTrace();
  appendReaderDrain(actual, { samples: structuredClone(expected.samples), events: [], longTasks: [], keys: expected.keys });
  assert.equal(actual.samples.length, expected.samples.length);
  for (let i = 0; i < actual.samples.length; i++) {
    const rows = actual.samples[i].e;
    assert.equal(rows.length, 1300);
    assert.ok(rows.every(row => row instanceof Float64Array));
    assert.equal(new Set(rows.map(row => row.buffer)).size, 1, 'one numeric allocation per frame');
    assert.equal(rows[0].buffer.byteLength, rows.length * 12 * Float64Array.BYTES_PER_ELEMENT);
    assert.deepEqual(rows.map(row => Array.from(row)), expected.samples[i].e);
  }
  const results = runChecks(actual);
  assert.deepEqual(results, runChecks(expected), 'packing cannot soften visibility or LOD failures');
  assert.ok(results.some(row => row.status === 'FAIL'));
});

test('streamed gzip preserves the complete plain-array trace schema without a whole-trace chunk', async () => {
  const expected = { ...racingTrace(), samples: courseFrames(), shots: [{ file: '0001.jpg', play: true }] };
  const actual = racingTrace();
  appendReaderDrain(actual, { samples: structuredClone(expected.samples), events: [], longTasks: [], keys: expected.keys });
  actual.shots = expected.shots;
  const chunks = [...traceJsonChunks(actual)];
  assert.equal(chunks.join(''), JSON.stringify(expected));
  assert.ok(Math.max(...chunks.map(chunk => chunk.length)) < JSON.stringify(expected).length / 10,
    'encoder allocation is bounded to an individual sample');
  const dir = await mkdtemp(path.join(tmpdir(), 'sf-trace-memory-'));
  try {
    const file = path.join(dir, 'trace.json.gz');
    await writeTraceGzip(file, actual);
    assert.deepEqual(JSON.parse(gunzipSync(await readFile(file))), expected);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unknown or malformed reader row schemas remain untouched rather than coerced', () => {
  const rows = [[1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null]];
  const sample = { mode: 'flight', e: rows };
  const trace = racingTrace();
  appendReaderDrain(trace, { samples: [sample], events: [], longTasks: [], keys: [] });
  assert.equal(trace.samples[0].e, rows);
  assert.ok(rows.every(Array.isArray));
});

test('packing preserves nonfinite and signed-zero observations and their existing JSON meaning', () => {
  const expected = racingTrace();
  expected.samples = [{ mode: 'flight', e: [[1, 2, NaN, Infinity, -Infinity, -0, 7, 8, 9, 10, 11, 12]] }];
  const actual = racingTrace();
  appendReaderDrain(actual, { samples: structuredClone(expected.samples), events: [], longTasks: [], keys: expected.keys });
  assert.deepEqual(Array.from(actual.samples[0].e[0]), expected.samples[0].e[0]);
  assert.equal([...traceJsonChunks(actual)].join(''), JSON.stringify(expected));
});
