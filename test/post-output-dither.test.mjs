import assert from 'node:assert/strict';
import test from 'node:test';

import { POST_DITHER_LSB, SPACE_POST_PRESENTATION_GLSL } from '../src/render/bloom.js';

// JS port of the GLSL dither in composeSpacePostPresentation: one spaceGrainNoise tap remapped
// to a triangular PDF over [-1, 1].
const fract = (v) => v - Math.floor(v);
const spaceGrainNoise = (x, y) => fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y));
const tri = (n) => Math.sign(n * 2 - 1) * (1 - Math.sqrt(1 - Math.abs(n * 2 - 1)));
const ditherAt = (x, y) => tri(spaceGrainNoise(x, y));

function ditherBlock() {
  const start = SPACE_POST_PRESENTATION_GLSL.indexOf('float sfDitherN');
  const end = SPACE_POST_PRESENTATION_GLSL.indexOf('return clamp(srgb, 0.0, 1.0);', start);
  assert.notEqual(start, -1, 'dither block exists');
  assert.notEqual(end, -1, 'dither block sits before the final encode clamp');
  return SPACE_POST_PRESENTATION_GLSL.slice(start, end);
}

test('the sRGB encode carries a static, gated dither with a 1/255 amplitude literal', () => {
  const block = ditherBlock();
  assert.match(block, /spaceGrainNoise\(fragCoord\) \* 2\.0 - 1\.0/, 'single tap samples fragCoord');
  assert.match(block, /sign\(sfDitherN\) \* \(1\.0 - sqrt\(1\.0 - abs\(sfDitherN\)\)\)/, 'triangular remap');
  assert.doesNotMatch(block, /sfDitherB/, 'no second correlated tap');
  const amplitude = block.match(/\* (\d+\.\d+)\) \* step\(/);
  assert.ok(amplitude, 'amplitude literal feeds the srgb increment');
  assert.ok(
    Math.abs(Number(amplitude[1]) - POST_DITHER_LSB / 255) < 1e-8,
    `amplitude literal ${amplitude[1]} equals POST_DITHER_LSB/255 to 8 decimals`,
  );
  assert.match(block, /step\(vec3\(0\.5 \/ 255\.0\), srgb\)/, 'exact black is gated out');
  assert.doesNotMatch(block, /uTime/, 'no time uniform: the dither is static');
  assert.doesNotMatch(block, /grainFrame/, 'no grain frame: the dither is static');
  assert.doesNotMatch(block, /uniform/, 'the block declares no new uniforms');
});

test('the triangular dither is bounded, tone-neutral and unimodal', () => {
  const bins = new Array(8).fill(0);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const d = ditherAt(x + 0.5, y + 0.5);
      sum += d;
      sumSq += d * d;
      n++;
      min = Math.min(min, d);
      max = Math.max(max, d);
      bins[Math.min(7, Math.floor((d + 1) / 0.25))]++;
    }
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  assert.ok(min >= -1 && max <= 1, `|d| <= 1 (got ${min}..${max})`);
  assert.ok(Math.abs(mean) <= 0.02, `dither mean ${mean} stays within +-0.02 of 0`);
  assert.ok(variance >= 0.14 && variance <= 0.19, `variance ${variance} is triangular ~1/6`);
  // Triangular histogram: the two centre bins dominate and the two outer bins are nearly empty.
  for (const i of [3, 4]) assert.ok(bins[i] / n >= 0.19, `centre bin ${i} share ${bins[i] / n}`);
  for (const i of [0, 7]) assert.ok(bins[i] / n <= 0.05, `outer bin ${i} share ${bins[i] / n}`);
});

test('the dither shrinks the box-filtered ramp error and identical-byte runs at least 3x', () => {
  const N = 2048;
  const lo = 8 / 255;
  const hi = 11 / 255;
  const amp = POST_DITHER_LSB / 255;
  const quantize = (v) => Math.round(v * 255);
  const box17 = (arr, i) => {
    let s = 0;
    let c = 0;
    for (let k = i - 8; k <= i + 8; k++) {
      if (k < 0 || k >= arr.length) continue;
      s += arr[k];
      c++;
    }
    return s / c / 255;
  };
  const ramp = (x) => lo + ((hi - lo) * x) / (N - 1);
  let errPlain = 0;
  let errDithered = 0;
  let longestPlain = 1;
  let longestDithered = 1;
  for (const row of [100, 333, 700]) {
    const bytesPlain = [];
    const bytesDithered = [];
    let runPlain = 1;
    let runDithered = 1;
    for (let x = 0; x < N; x++) {
      const v = ramp(x);
      const gate = v >= 0.5 / 255 ? 1 : 0;
      const bP = quantize(v);
      const bD = quantize(v + ditherAt(x + 0.5, row + 0.5) * amp * gate);
      runPlain = bP === bytesPlain[bytesPlain.length - 1] ? runPlain + 1 : 1;
      runDithered = bD === bytesDithered[bytesDithered.length - 1] ? runDithered + 1 : 1;
      longestPlain = Math.max(longestPlain, runPlain);
      longestDithered = Math.max(longestDithered, runDithered);
      bytesPlain.push(bP);
      bytesDithered.push(bD);
    }
    for (let x = 0; x < N; x++) {
      errPlain += Math.abs(box17(bytesPlain, x) - ramp(x));
      errDithered += Math.abs(box17(bytesDithered, x) - ramp(x));
    }
  }
  assert.ok(
    errDithered * 3 <= errPlain,
    `17-px box-filtered error is at least 3x smaller (${(errPlain / errDithered).toFixed(2)}x)`,
  );
  assert.ok(
    longestPlain >= 3 * longestDithered,
    `longest identical-byte run shrinks at least 3x (${longestPlain} -> ${longestDithered})`,
  );
});

test('exact black stays exactly black through the dither and gate', () => {
  const amp = POST_DITHER_LSB / 255;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const gate = 0 >= 0.5 / 255 ? 1 : 0;
      const byte = Math.round((0 + ditherAt(x + 0.5, y + 0.5) * amp * gate) * 255);
      assert.equal(byte, 0, `black pixel at ${x},${y} quantizes to 0`);
    }
  }
});
