// inf-wreck-resolve-read — the wreck you scan answers at the hull.
// `scan:wreckResolved` (first resolve: manifest named, hull named) had no render consumer,
// and the sim's own pingedUntil window never showed in the world — the wreck you just
// identified looked like every anonymous hulk around it. wreckResolveRead.js owns the plan;
// this file pins its decisions. Pure module — no sim chain, no three.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWreckResolveMoment,
  wreckResolveHue,
  wreckResolveColorCss,
  wreckResolvePlan,
  WRECK_PING_WINDOW_S,
  WRECK_MARKER_MIN_S,
  WRECK_MARKER_MAX_S,
  WRECK_RESOLVE_PRIORITY,
} from '../src/render/vfx/wreckResolveRead.js';

const RESOLVE = { wreckId: 411, markerId: 'mk_9', sectorId: 'ceres_belt', pos: { x: 220, z: -80 } };

test('gate: a resolve reads only from a wreck id and a finite position', () => {
  assert.equal(isWreckResolveMoment(RESOLVE), true);
  assert.equal(isWreckResolveMoment({ ...RESOLVE, wreckId: null }), false, 'no wreck, no beat');
  assert.equal(isWreckResolveMoment({ ...RESOLVE, pos: { x: 1, z: NaN } }), false);
  assert.equal(isWreckResolveMoment(null), false);
});

test('hue: the resolve wears the belt scanner-lit family, core pushed white-hot', () => {
  const hue = wreckResolveHue();
  for (const c of hue) assert.ok(c >= 0 && c <= 1);
  assert.match(wreckResolveColorCss(hue), /^rgb\(\d+,\d+,\d+\)$/);
});

test('plan: the landing core obeys the S8 flash law; the marker lamp holds the ping window', () => {
  const full = wreckResolvePlan();
  assert.ok(full.landing.core.life <= 0.2, `flash core inside the 0.2 s cap (got ${full.landing.core.life})`);
  assert.ok(full.landing.ring.life > full.landing.core.life, 'the ring runs past the core');
  assert.equal(full.marker.life, WRECK_PING_WINDOW_S, 'the lamp holds the scanner window');
  assert.ok(full.marker.life > full.landing.ring.life * 10, 'the lamp is the long answer');
});

test('plan: a live profile window clamps; reduced motion halves the beat, keeps the lamp', () => {
  const long = wreckResolvePlan(3600);
  assert.equal(long.marker.life, WRECK_MARKER_MAX_S, 'a runaway window clamps');
  const short = wreckResolvePlan(2);
  assert.equal(short.marker.life, WRECK_MARKER_MIN_S, 'a too-short window still reads');
  const reduced = wreckResolvePlan(WRECK_PING_WINDOW_S, true);
  assert.equal(reduced.marker.life, WRECK_PING_WINDOW_S, 'the lamp is the utility — never silenced');
  assert.ok(reduced.landing.ring.life < wreckResolvePlan(WRECK_PING_WINDOW_S, false).landing.ring.life,
    'reduced motion halves the landing beat');
});

test('priority: a utility read admits below the combat bursts', () => {
  assert.ok(WRECK_RESOLVE_PRIORITY > 0 && WRECK_RESOLVE_PRIORITY <= 1);
});
