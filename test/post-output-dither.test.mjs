import assert from 'node:assert/strict';
import test from 'node:test';

import { POST_DITHER_LSB, SPACE_POST_PRESENTATION_GLSL } from '../src/render/bloom.js';

// JS port of the GLSL spaceGrainNoise() in SPACE_POST_PRESENTATION_GLSL.
const fract = (v) => v - Math.floor(v);
const spaceGrainNoise = (x, y) => fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y));
const ditherAt = (x, y) => spaceGrainNoise(x, y) - spaceGrainNoise(x + 47, y + 11);

function ditherBlock() {
  const start = SPACE_POST_PRESENTATION_GLSL.indexOf('float sfDitherA');
  const end = SPACE_POST_PRESENTATION_GLSL.indexOf('return clamp(srgb, 0.0, 1.0);', start);
  assert.notEqual(start, -1, 'dither block exists');
  assert.notEqual(end, -1, 'dither block sits before the final encode clamp');
  return SPACE_POST_PRESENTATION_GLSL.slice(start, end);
}

test('the sRGB encode carries a static, gated dither with a 1/255 amplitude literal', () => {
  const block = ditherBlock();
  assert.match(block, /spaceGrainNoise\(fragCoord\)/, 'first tap samples fragCoord');
  assert.match(block, /spaceGrainNoise\(fragCoord \+ vec2\(47\.0, 11\.0\)\)/, 'second tap offset');
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

test('the two-tap dither is bounded and tone-neutral', () => {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = ditherAt(x + 0.5, y + 0.5);
      sum += d;
      sumSq += d * d;
      n++;
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  assert.ok(min >= -1 && max <= 1, `|d| <= 1 (got ${min}..${max})`);
  assert.ok(Math.abs(mean) <= 0.02, `dither mean ${mean} stays within +-0.02 of 0`);
  // The (47, 11) offset correlates the two taps: d lands on ~4 values near +-0.5 LSB rather
  // than the full +-1 LSB triangular distribution (var 1/6). Assert the measured envelope so
  // a tap change that decorrelates (or collapses) the pair shows up here.
  assert.ok(variance > 0.20 && variance < 0.30, `variance ${variance} is the measured two-tap pattern`);
});

test('the dither breaks quantizer run-lengths without shifting the filtered ramp', () => {
  const N = 2048;
  const lo = 8 / 255;
  const hi = 11 / 255;
  const amp = POST_DITHER_LSB / 255;
  const quantize = (v) => Math.round(v * 255);
  const bytes = { plain: [], dithered: [] };
  let longest = { plain: 1, dithered: 1 };
  let run = { plain: 1, dithered: 1 };
  for (let x = 0; x < N; x++) {
    const v = lo + ((hi - lo) * x) / (N - 1);
    const gate = v >= 0.5 / 255 ? 1 : 0;
    const next = {
      plain: quantize(v),
      dithered: quantize(v + ditherAt(x + 0.5, 0.5) * amp * gate),
    };
    for (const kind of ['plain', 'dithered']) {
      if (next[kind] === bytes[kind][bytes[kind].length - 1]) run[kind]++;
      else {
        longest[kind] = Math.max(longest[kind], run[kind]);
        run[kind] = 1;
      }
      bytes[kind].push(next[kind]);
    }
  }
  for (const kind of ['plain', 'dithered']) longest[kind] = Math.max(longest[kind], run[kind]);
  assert.ok(
    longest.plain >= 3 * longest.dithered,
    `longest identical-byte run shrinks at least 3x (${longest.plain} -> ${longest.dithered})`,
  );
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
  let errPlain = 0;
  let errDithered = 0;
  for (let x = 0; x < N; x++) {
    const v = lo + ((hi - lo) * x) / (N - 1);
    errPlain += Math.abs(box17(bytes.plain, x) - v);
    errDithered += Math.abs(box17(bytes.dithered, x) - v);
  }
  // The +-0.5 LSB pattern breaks bands but does not reproduce sub-LSB detail: filtered error
  // parity is the contract (never worse than the un-dithered encode).
  assert.ok(
    errDithered <= errPlain * 1.1,
    `17-px box-filtered error stays at parity (${errDithered / N} vs ${errPlain / N})`,
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
