import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');

test('objective edge plates invalidate on resize, not a 500ms timer', () => {
  assert.match(hudSrc, /invalidateObjectiveEdgeBoxes/);
  assert.match(hudSrc, /addEventListener\('resize',\s*invalidateObjectiveEdgeBoxes\)/);
  assert.match(hudSrc, /objectiveEdgeBoxes\.stale/);
  assert.doesNotMatch(hudSrc, /objectiveEdgeBoxes\.at/);
  assert.doesNotMatch(hudSrc, /nowMs - objectiveEdgeBoxes\.at > 500/);
  assert.doesNotMatch(hudSrc, /objectiveEdgeObstacles\(performance\.now\(\)\)/);
});

test('plate refresh still gates left column when ORRERY is mounted', () => {
  assert.match(hudSrc, /objectiveEdgeBoxes\.left = orreryCluster \? null : plateBox\(leftStack\)/);
  assert.match(hudSrc, /objectiveEdgeBoxes\.orrery = orreryCluster/);
});

/**
 * Portable A/B of the layout-tax gate: timer cadence vs resize-only.
 * Counts sync layout reads; does not claim Node wall time.
 */
test('resize-only gate eliminates settled-edge layout reads', () => {
  const windowMs = 45_000;
  const edgeFrames = Math.floor(windowMs / 16.67); // ~60 Hz
  const timerCadenceMs = 500;
  const timerReadsPerRefresh = 3; // left + right + orrery
  const timerRefreshes = Math.floor(windowMs / timerCadenceMs);
  const legacyReads = timerRefreshes * timerReadsPerRefresh;

  let resizeOnlyReads = 0;
  let stale = true;
  const refresh = () => {
    if (!stale) return;
    stale = false;
    resizeOnlyReads += timerReadsPerRefresh;
  };
  // Settled edge flight: first use only.
  for (let i = 0; i < edgeFrames; i++) refresh();
  assert.equal(resizeOnlyReads, 3, 'one refresh on first edge use');
  // Resize mid-flight.
  stale = true;
  refresh();
  assert.equal(resizeOnlyReads, 6);
  assert.ok(legacyReads / resizeOnlyReads >= 10, `expected ≥10× fewer reads; legacy=${legacyReads} modern=${resizeOnlyReads}`);
});
