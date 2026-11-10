// Station screen walk coverage.
//
// The route tier names one `ui-bench --walk` command for the station module. This test keeps
// that command honest: every station surface the bench can mount (tabs, dock, special fixtures)
// must be named in the walk, and every named id must resolve in the committed catalog. Adding a
// station destination without adding its walk is a route-coverage regression, not a UI detail.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { UI_BENCH_SHOTS, listShotIds, resolveShot } from '../scripts/lib/uiBenchCatalog.mjs';
import { readTierFile } from '../scripts/lib/testTier.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function stationWalk() {
  const entries = readTierFile(ROOT, 'route').entries;
  return entries.find((line) => line.includes('scripts/ui-bench.mjs')
    && line.includes('--walk') && line.includes('station'));
}

test('the route tier has one station walk command and every named shot resolves', () => {
  const line = stationWalk();
  assert.ok(line, 'route.txt must name the station ui-bench walk');
  const match = /--shot=([^\s]+)/.exec(line);
  assert.ok(match, 'the station walk names its shots with --shot=');
  const ids = match[1].split(',').filter(Boolean);
  assert.ok(ids.length >= 8, 'the walk covers the station destinations');
  for (const id of ids) assert.ok(resolveShot(id), `station walk shot does not resolve: ${id}`);
});

test('every mountable station surface in the bench catalog is walked', () => {
  const line = stationWalk();
  const ids = new Set(/--shot=([^\s]+)/.exec(line)[1].split(',').filter(Boolean));
  const stationShots = UI_BENCH_SHOTS
    .filter((shot) => shot.screen === 'station' && !shot.overlay)
    .map((shot) => shot.id);
  assert.ok(stationShots.length >= 8);
  for (const id of stationShots) assert.ok(ids.has(id), `station shot missing from the walk: ${id}`);
});

test('the walk exercises both viewports and activation, not just a screenshot', () => {
  const line = stationWalk();
  assert.match(line, /--walk\b/);
  assert.match(line, /--viewports=960x540,1920x1080/);
});

test('the catalog itself has no duplicate ids and every id resolves back to itself', () => {
  const ids = listShotIds();
  assert.equal(new Set(ids).size, ids.length, 'duplicate ui-bench shot id');
  for (const id of ids) assert.equal(resolveShot(id)?.id, id);
});
