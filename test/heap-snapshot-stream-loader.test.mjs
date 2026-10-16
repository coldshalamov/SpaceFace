import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { aggregate, loadHeapSnapshot } from '../scripts/lib/heapSnapshotDiff.mjs';

async function withSnapshot(snapshot, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spaceface-heap-loader-'));
  const filePath = path.join(dir, 'sample.heapsnapshot');
  try {
    await writeFile(filePath, JSON.stringify(snapshot));
    return await run(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fixture() {
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [['object', 'string'], 'string', 'number', 'number', 'number'],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['property', 'element'], 'string_or_number', 'node'],
      },
      node_count: 3,
      edge_count: 1,
    },
    nodes: [
      0, 0, 4294967297, -2147483649, 1,
      0, 1, 9007199254740991, 2147483648, 0,
      1, 2, 17, 0, 0,
    ],
    edges: [0, 1, 5],
    locations: [0, 1, 2, 3, 4],
    strings: ['Object', 'rocket 🚀', 'child'],
  };
}

test('heap loader streams arrays, preserves numeric identity, and decodes split unicode strings', async () => {
  const longUnicodeString = `${'x'.repeat(100_000)}🚀${'y'.repeat(100_000)}`;
  const snapshot = fixture();
  snapshot.strings.push(longUnicodeString);
  snapshot.nodes[6] = 3;

  await withSnapshot(snapshot, async (filePath) => {
    const loaded = await loadHeapSnapshot(filePath, { arrays: ['nodes', 'edges'], includeStrings: true });

    assert.ok(loaded.nodes instanceof Float64Array);
    assert.ok(loaded.edges instanceof Float64Array);
    assert.deepEqual([...loaded.nodes], snapshot.nodes);
    assert.deepEqual([...loaded.edges], snapshot.edges);
    assert.equal(loaded.strings[3], longUnicodeString);
    assert.equal('locations' in loaded, false, 'unrequested arrays are not retained');

    const classes = aggregate(loaded).byClass;
    assert.equal(classes.get('objectObject').bytes, -2147483649,
      'negative self-size remains wider than a signed 32-bit integer');
    assert.equal(classes.get('objectObject').count, 1);
  });
});

test('heap loader rejects a truncated capture instead of returning partial arrays', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spaceface-heap-loader-truncated-'));
  const filePath = path.join(dir, 'truncated.heapsnapshot');
  try {
    const text = JSON.stringify(fixture());
    await writeFile(filePath, text.slice(0, -7));
    await assert.rejects(
      loadHeapSnapshot(filePath, { arrays: ['nodes'], includeStrings: true }),
      /Parser|expected|unexpected|invalid/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
