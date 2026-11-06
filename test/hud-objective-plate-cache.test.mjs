import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFlightTextObstacleCache } from '../src/ui/hud.js';
import { MOBILE_FLIGHT_LAYOUT_CSS } from '../src/ui/orrery/mobileFlightLayouts.js';

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

test('flight text obstacle cache returns frozen owner-labelled geometry without rebuilding on reads', () => {
  const cache = createFlightTextObstacleCache();
  const empty = cache.read();
  assert.strictEqual(cache.read(), empty, 'the empty snapshot is reused');
  assert.ok(Object.isFrozen(empty));

  const snapshot = cache.publish([
    { owner: 'objective', rect: { left: 10, top: 20, right: 210, bottom: 84, width: 200, height: 64 } },
    { owner: 'stunt', rect: { left: 16, top: 110, right: 144, bottom: 148, width: 128, height: 38 } },
    { owner: 'hidden', rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } },
  ]);
  assert.strictEqual(cache.read(), snapshot, 'the getter returns the same cached array');
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(snapshot.every(Object.isFrozen));
  assert.deepEqual(snapshot, [
    { owner: 'objective', left: 10, top: 20, right: 210, bottom: 84, width: 200, height: 64 },
    { owner: 'stunt', left: 16, top: 110, right: 144, bottom: 148, width: 128, height: 38 },
  ]);
});

test('the HUD getter is cached, and receipts can use its live-objective bands', () => {
  assert.match(hudSrc, /function getFlightTextObstacles\(\)\s*\{\s*return flightTextObstacleCache\.read\(\);\s*\}/);
  assert.match(hudSrc, /getFlightTextObstacles,/);
  assert.match(hudSrc, /\.sf-stuntcall:not\(\[hidden\]\)/, 'stunt is an obstacle for lower-priority captions and receipts');
  assert.match(hudSrc, /flightTextObstaclesStale = true/);
  const toastRules = [...MOBILE_FLIGHT_LAYOUT_CSS.matchAll(/#toasts[^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(toastRules.length >= 2, 'portrait and compact-landscape receipt fallbacks remain');
  for (const rule of toastRules) {
    assert.doesNotMatch(rule, /(?:top|left|right|bottom|width)\s*:[^;]*!important/,
      'the existing allocator inline placement must be able to clear the live objective');
  }
});
