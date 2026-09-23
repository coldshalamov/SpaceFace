// Pure summarizer for probe-body-scale.mjs samples. No DOM, no THREE — just the numbers the
// probe recorded, so the same code is unit-testable in Node (test/probe-body-scale.test.mjs).

export function percentile(values, q) {
  const sorted = (values || []).filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values) {
  return percentile(values, 0.5);
}

// Which zoom term held the applied distance off the player's base zoom this sample.
// Mirrors camera.js's follow() composition order: base -> speed factor -> context bias ->
// minZoom floor -> boost factor -> push zoom -> context cap; a non-FOLLOW director mode owns
// the whole frame instead.
export function bindingZoomTerm(sample) {
  const z = sample && sample.zoom;
  if (!z || !Number.isFinite(z.base) || z.base <= 0) return 'unknown';
  if (z.directorMode && z.directorMode !== 'FOLLOW') return `director:${z.directorMode}`;
  const speed = Number.isFinite(z.speedZoomFactor) ? z.speedZoomFactor : 1;
  const bias = Number.isFinite(z.contextZoomBias) ? z.contextZoomBias : 0;
  const boost = Number.isFinite(z.boostZoomFactor) ? z.boostZoomFactor : 1;
  const push = Number.isFinite(z.pushZoom) ? z.pushZoom : 0;
  const minZoom = Number.isFinite(z.contextMinZoom) ? z.contextMinZoom : 0;
  const cap = Number.isFinite(z.contextZoomCap) ? z.contextZoomCap : Infinity;
  const steps = [];
  let acc = z.base;
  const step = (name, next) => {
    if (next > 0 && acc > 0) steps.push({ name, delta: Math.abs(Math.log(next / acc)) });
    acc = next;
  };
  step('speedZoomFactor', acc * speed);
  step('contextZoomBias', acc * (1 + bias));
  if (minZoom > acc) step('contextMinZoom', minZoom);
  step('boostZoomFactor', acc * boost);
  step('pushZoom', acc * (1 + push));
  if (acc > cap) step('contextZoomCap', cap);
  const EPS = Math.log(1.005); // sub-half-percent moves are noise, not a binding term
  let best = null;
  for (const s of steps) {
    if (s.delta > EPS && (!best || s.delta > best.delta)) best = s;
  }
  return best ? best.name : 'base';
}

const ACTIVE_THRESHOLDS = [
  ['speedZoomFactor', (z) => Number.isFinite(z.speedZoomFactor) && Math.abs(z.speedZoomFactor - 1) > 0.005],
  ['contextZoomBias', (z) => Number.isFinite(z.contextZoomBias) && Math.abs(z.contextZoomBias) > 0.005],
  ['contextMinZoom', (z) => Number.isFinite(z.contextMinZoom) && z.contextMinZoom > 0],
  ['boostZoomFactor', (z) => Number.isFinite(z.boostZoomFactor) && Math.abs(z.boostZoomFactor - 1) > 0.005],
  ['pushZoom', (z) => Number.isFinite(z.pushZoom) && Math.abs(z.pushZoom) > 0.005],
  ['director', (z) => !!z.directorMode && z.directorMode !== 'FOLLOW'],
  ['hold', (z) => Number.isFinite(z.holdS) && z.holdS > 0],
];

export function summarizeBodyScaleSamples(samples) {
  const list = (samples || []).filter((s) => s && typeof s === 'object');
  const n = list.length;
  const playerPx = list.map((s) => s.player && s.player.pxMax).filter(Number.isFinite);
  const playerCenter = list
    .map((s) => s.player && Number.isFinite(s.player.centerOffsetPx)
      ? s.player.centerOffsetPx : null)
    .filter(Number.isFinite);
  const hostileMedian = list.map((s) => s.hostiles && s.hostiles.medianPx).filter(Number.isFinite);
  const hostileMin = list.map((s) => s.hostiles && s.hostiles.minPx).filter(Number.isFinite);
  const hostileBodyMedian = list.map((s) => s.hostiles && s.hostiles.bodyMedianPx).filter(Number.isFinite);
  const playerBodyPx = list.map((s) => s.bodyPx).filter(Number.isFinite);
  const frameHeightWu = list.map((s) => s.frameHeightWu).filter(Number.isFinite);
  const zoomP50src = list.map((s) => s.zoom && s.zoom.dynamic).filter(Number.isFinite);
  const zoomBase = list.map((s) => s.zoom && s.zoom.base).filter(Number.isFinite);
  const speedWu = list.map((s) => s.speedWu).filter(Number.isFinite);

  const bindingCounts = {};
  const activeCounts = Object.fromEntries(ACTIVE_THRESHOLDS.map(([k]) => [k, 0]));
  let plumeYes = 0;
  let plumeKnown = 0;
  const plumeSources = {};
  let anyHostileInFrame = 0;
  for (const s of list) {
    const b = bindingZoomTerm(s);
    bindingCounts[b] = (bindingCounts[b] || 0) + 1;
    const z = s.zoom || {};
    for (const [name, test] of ACTIVE_THRESHOLDS) {
      try { if (test(z)) activeCounts[name] += 1; } catch { /* malformed sample */ }
    }
    if (s.plumeCoversHull === true) { plumeYes += 1; plumeKnown += 1; }
    else if (s.plumeCoversHull === false) plumeKnown += 1;
    if (s.plumeSource) plumeSources[s.plumeSource] = (plumeSources[s.plumeSource] || 0) + 1;
    if (s.hostiles && s.hostiles.inFrame > 0) anyHostileInFrame += 1;
  }
  const frac = (count) => (n ? count / n : 0);
  return {
    samples: n,
    playerHullPx: { p10: percentile(playerPx, 0.1), p50: percentile(playerPx, 0.5), p90: percentile(playerPx, 0.9) },
    playerBodyPx: { p10: percentile(playerBodyPx, 0.1), p50: percentile(playerBodyPx, 0.5), p90: percentile(playerBodyPx, 0.9) },
    frameHeightWu: { p50: median(frameHeightWu) },
    playerCenterOffsetPx: { p50: median(playerCenter) },
    hostilePx: { median: median(hostileMedian), min: median(hostileMin) },
    hostileBodyPx: { median: median(hostileBodyMedian) },
    zoom: { base: median(zoomBase), dynamicP50: percentile(zoomP50src, 0.5), dynamicP90: percentile(zoomP50src, 0.9) },
    speedWu: { p50: median(speedWu), p90: percentile(speedWu, 0.9) },
    bindingFraction: Object.fromEntries(Object.entries(bindingCounts).map(([k, v]) => [k, frac(v)])),
    activeFraction: Object.fromEntries(Object.entries(activeCounts).map(([k, v]) => [k, frac(v)])),
    plumeCoversHullFraction: plumeKnown ? plumeYes / plumeKnown : null,
    plumePresentFraction: frac(plumeKnown),
    plumeSources: Object.fromEntries(Object.entries(plumeSources).map(([k, v]) => [k, frac(v)])),
    hostilesInFrameFraction: frac(anyHostileInFrame),
  };
}
