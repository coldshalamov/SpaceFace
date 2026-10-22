import assert from 'node:assert/strict';
import test from 'node:test';

import { POST_DITHER_LSB, SPACE_POST_PRESENTATION_GLSL } from '../src/render/bloom.js';

const GLSL = SPACE_POST_PRESENTATION_GLSL;
const fract = (v) => v - Math.floor(v);
const squash = (s) => s.replace(/\s+/g, ' ').trim();

// The shipped GLSL is the single source of truth: its scalar statements are executed as JS (the
// technique test/bloom-contrast-lut.test.mjs uses), so the statistics below run on what ships
// rather than on a hand-copied port that could drift from it.
function shipped() {
  const fn = GLSL.indexOf('vec3 composeSpacePostPresentation(');
  assert.notEqual(fn, -1, 'composeSpacePostPresentation exists');
  const grain = GLSL.indexOf('srgb += noise * grainAmount', fn);
  const start = GLSL.indexOf('float sfDitherN', fn);
  assert.notEqual(grain, -1, 'grain term exists inside the compose function');
  assert.notEqual(start, -1, 'dither block exists inside the compose function');
  assert.ok(start > grain, 'dither is the last writer of srgb: it runs after the grain term');
  const end = GLSL.indexOf('return clamp(srgb, 0.0, 1.0);', start);
  assert.notEqual(end, -1, 'dither block sits directly before the final encode clamp');
  const block = GLSL.slice(start, end);
  const statements = block.replace(/\/\/[^\n]*/g, '').split(';').map(squash).filter(Boolean);
  assert.equal(statements.length, 3, 'the block is exactly noise tap, remap, apply');
  assert.equal(statements[0], 'float sfDitherN = spaceGrainNoise(fragCoord) * 2.0 - 1.0',
    'single tap samples fragCoord');
  assert.equal(statements[1],
    'float sfDither = sign(sfDitherN) * (1.0 - sqrt(clamp(1.0 - abs(sfDitherN), 0.0, 1.0)))',
    'triangular remap, sqrt argument clamped to [0, 1]');
  const apply = statements[2].match(
    /^srgb \+= vec3\(sfDither \* (\d+\.\d+)\) \* step\(vec3\((\d+\.\d+) \/ (\d+\.\d+)\), srgb\)$/);
  assert.ok(apply, `the dither is added to srgb through a step() gate: ${statements[2]}`);

  const noise = GLSL.match(/float spaceGrainNoise\(vec2 p\) \{\s*return ([^;]+);\s*\}/);
  assert.ok(noise, 'spaceGrainNoise is a single-return scalar function');
  const grainFn = new Function('p', 'fract', `"use strict";return ${noise[1]};`);
  const remap = new Function('spaceGrainNoise', 'fragCoord', 'sign', 'abs', 'sqrt', 'clamp',
    `"use strict";${statements.slice(0, 2).map((s) => s.replace(/^float /, 'const ')).join(';')};return sfDither;`);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    block,
    amplitude: Number(apply[1]),
    threshold: Number(apply[2]) / Number(apply[3]),
    ditherAt: (x, y) => remap((p) => grainFn(p, fract), { x, y }, Math.sign, Math.abs, Math.sqrt, clamp),
  };
}

test('the sRGB encode carries a static, gated dither with a 1/255 amplitude literal', () => {
  const { block, amplitude, threshold } = shipped();
  assert.doesNotMatch(block, /sfDitherB/, 'no second correlated tap');
  assert.ok(
    Math.abs(amplitude - POST_DITHER_LSB / 255) < 1e-8,
    `amplitude literal ${amplitude} equals POST_DITHER_LSB/255 to 8 decimals`,
  );
  // The distribution tests below run on a unit-amplitude dither and the ramp test only needs a 3x
  // gain, so without this bound the amplitude itself could drift unnoticed. A triangular dither
  // only decorrelates the quantisation error from about half an LSB peak, and past about 1.5 LSB it
  // is visible noise rather than dither; docs/visual-assets/COLOR_LIGHTING_STANDARD.md section 5
  // quotes the shipped 1.0 (about 0.41 LSB RMS).
  assert.ok(
    POST_DITHER_LSB >= 0.5 && POST_DITHER_LSB <= 1.5,
    `POST_DITHER_LSB ${POST_DITHER_LSB} stays inside the 0.5..1.5 LSB dither range`,
  );
  assert.equal(threshold, 0.5 / 255, 'the gate sits at half an LSB: below it the encode rounds to 0 anyway');
  assert.doesNotMatch(block, /uTime/, 'no time uniform: the dither is static');
  assert.doesNotMatch(block, /grainFrame/, 'no grain frame: the dither is static');
  assert.doesNotMatch(block, /uniform/, 'the block declares no new uniforms');
});

test('the triangular dither is bounded, tone-neutral and unimodal', () => {
  const { ditherAt } = shipped();
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

test('neighbouring dither samples are decorrelated: it is noise, not a ramp or a stripe', () => {
  // A uniform, zero-mean histogram is also what a diagonal sawtooth produces; only neighbour
  // correlation tells interleaved-gradient noise from a gradient that would stripe the picture.
  const { ditherAt } = shipped();
  const correlation = (dx, dy) => {
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    let n = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const a = ditherAt(x + 0.5, y + 0.5);
        const b = ditherAt(x + dx + 0.5, y + dy + 0.5);
        sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
      }
    }
    return (sab / n - (sa / n) * (sb / n))
      / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
  };
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const r = correlation(dx, dy);
    assert.ok(Math.abs(r) <= 0.45, `lag (${dx},${dy}) correlation ${r.toFixed(3)} stays within +-0.45`);
  }
});

test('the dither shrinks the box-filtered ramp error and identical-byte runs at least 3x', () => {
  const { ditherAt, amplitude: amp, threshold } = shipped();
  const N = 2048;
  const lo = 8 / 255;
  const hi = 11 / 255;
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
      const gate = v >= threshold ? 1 : 0;
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

test('exact black stays exactly black through the dither and gate, the first lit byte still dithers', () => {
  const { ditherAt, amplitude: amp, threshold } = shipped();
  const step = (edge, x) => (x < edge ? 0 : 1); // GLSL step(edge, x)
  assert.equal(step(threshold, 0), 0, 'exact black is gated out');
  assert.equal(step(threshold, 1 / 255), 1, 'the first lit byte is inside the gate');
  const lit = new Set();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = ditherAt(x + 0.5, y + 0.5) * amp;
      // The gate assertion above already makes `d * 0` exact, so the black byte can only miss 0
      // through a non-finite dither (NaN * 0 is still NaN, in GLSL as here: a sqrt of a hair under
      // zero would poison every pixel, black included). This finiteness check is what the loop adds.
      assert.ok(Number.isFinite(d), `dither at ${x},${y} is finite (got ${d})`);
      const black = Math.round((0 + d * step(threshold, 0)) * 255);
      assert.equal(black, 0, `black pixel at ${x},${y} quantizes to 0`);
      lit.add(Math.round(Math.min(1, Math.max(0, 1 / 255 + d * step(threshold, 1 / 255))) * 255));
    }
  }
  assert.deepEqual([...lit].sort(), [0, 1, 2], 'a byte-1 pixel dithers across 0, 1 and 2');
});
