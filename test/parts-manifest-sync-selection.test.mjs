import assert from 'node:assert/strict';
import test from 'node:test';
import { partsManifestSyncSelection, shouldSyncPart } from '../scripts/lib/partsManifestSyncSelection.mjs';
const parts = [{ id: 'lark', bytes: 1 }, { id: 'kit', bytes: 2 }];

test('invalid explicit scopes fail before the caller can mutate rows', () => {
  for (const args of [
    ['--sync', '--only='], ['--sync', '--only= '], ['--sync', '--only=lark,'],
    ['--sync', '--only=lark,lark'], ['--sync', '--only=lark', '--only=kit'],
    ['--sync', '--only'], ['--sync', '--only=missing'], ['--only=lark'],
  ]) {
    const rows = structuredClone(parts);
    assert.throws(() => {
      const selected = partsManifestSyncSelection(args, rows);
      for (const row of rows) if (shouldSyncPart(selected, row.id)) row.bytes = 99;
    });
    assert.deepEqual(rows, parts);
  }
});

test('selected sync updates only the named row and full sync retains its prior behavior', () => {
  for (const [args, expected] of [[['--sync', '--only=lark'], [99, 2]], [['--sync'], [99, 99]]]) {
    const rows = structuredClone(parts), selected = partsManifestSyncSelection(args, rows);
    for (const row of rows) if (shouldSyncPart(selected, row.id)) row.bytes = 99;
    assert.deepEqual(rows.map(row => row.bytes), expected);
  }
});
