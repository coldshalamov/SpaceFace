import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  percentile,
  median,
  bindingZoomTerm,
  summarizeBodyScaleSamples,
} from '../scripts/lib/bodyScaleStats.mjs';

test('percentile interpolates and ignores non-finite values', () => {
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentile([10, 20, 30, 40], 0), 10);
  assert.equal(percentile([40, 10, NaN, 30, 20, Infinity], 1), 40);
  assert.equal(percentile([], 0.5), null);
  assert.equal(median([5, 1, 9]), 5);
});

test('bindingZoomTerm names the dominant term', () => {
  const base = { base: 100, speedZoomFactor: 1, contextZoomBias: 0, boostZoomFactor: 1, pushZoom: 0, contextMinZoom: 0, directorMode: 'FOLLOW' };
  assert.equal(bindingZoomTerm({ zoom: base }), 'base');
  assert.equal(bindingZoomTerm({ zoom: { ...base, speedZoomFactor: 1.18 } }), 'speedZoomFactor');
  assert.equal(bindingZoomTerm({ zoom: { ...base, contextZoomBias: 0.4 } }), 'contextZoomBias');
  assert.equal(bindingZoomTerm({ zoom: { ...base, contextMinZoom: 250 } }), 'contextMinZoom');
  assert.equal(bindingZoomTerm({ zoom: { ...base, boostZoomFactor: 1.06 } }), 'boostZoomFactor');
  assert.equal(bindingZoomTerm({ zoom: { ...base, pushZoom: -0.45 } }), 'pushZoom');
  assert.equal(bindingZoomTerm({ zoom: { ...base, contextZoomCap: 90 } }), 'contextZoomCap');
  assert.equal(bindingZoomTerm({ zoom: { ...base, directorMode: 'GATE_APPROACH' } }), 'director:GATE_APPROACH');
  // A floor that never binds is not the binding term.
  assert.equal(bindingZoomTerm({ zoom: { ...base, contextMinZoom: 50 } }), 'base');
  assert.equal(bindingZoomTerm({ zoom: null }), 'unknown');
});

test('summarizeBodyScaleSamples aggregates a synthetic run', () => {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    samples.push({
      simTime: i,
      speedWu: 100 + i,
      zoom: {
        base: 144, dynamic: 144 + i * 10, speedZoomFactor: i < 5 ? 1.18 : 1,
        contextZoomBias: 0, boostZoomFactor: 1, pushZoom: 0, contextMinZoom: 0,
        directorMode: 'FOLLOW',
      },
      player: { pxMax: 20 + i, centerOffsetPx: 50 },
      plumeCoversHull: i < 5,
      hostiles: { inFrame: i < 3 ? 2 : 0, outOfFrame: 1, medianPx: 8, minPx: 4 },
    });
  }
  const s = summarizeBodyScaleSamples(samples);
  assert.equal(s.samples, 10);
  assert.equal(s.playerHullPx.p50, 24.5);
  assert.equal(s.plumeCoversHullFraction, 0.5);
  assert.equal(s.hostilesInFrameFraction, 0.3);
  assert.equal(s.bindingFraction.speedZoomFactor, 0.5);
  assert.equal(s.bindingFraction.base, 0.5);
  assert.equal(s.activeFraction.speedZoomFactor, 0.5);
  assert.equal(s.zoom.dynamicP50, 189);
});

test('summarize tolerates empty and malformed input', () => {
  const s = summarizeBodyScaleSamples([]);
  assert.equal(s.samples, 0);
  assert.equal(s.playerHullPx.p50, null);
  assert.equal(s.plumeCoversHullFraction, null);
});
