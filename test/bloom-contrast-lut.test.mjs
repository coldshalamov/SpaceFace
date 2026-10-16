import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTRAST_LUT_FORMAT,
  CONTRAST_LUT_SIZE,
  SPACE_POST_PRESENTATION_GLSL,
  buildContrastLutData,
  contrastShapedSquared,
  createBloom,
  sampleContrastLutData,
} from '../src/render/bloom.js';
import { LOOK_POST_UNIFORMS } from '../src/render/look.js';
import { LOOK_MOODS, resolveLookMood } from '../src/data/lookMoods.js';

const LUMA = [0.2126, 0.7152, 0.0722];

function srgb(value) {
  const c = Math.max(0, value);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

function contrastRgb(rgb, contrast, lut = null, curve = contrastShapedSquared) {
  const y = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  const value = Math.sqrt(Math.max(0, Math.min(1, y)));
  const shapedSquared = lut
    ? sampleContrastLutData(lut, value)
    : curve(value, contrast);
  const scale = y > 0.00001 ? Math.min(shapedSquared / y, 4) : 1;
  return rgb.map((channel) => srgb(channel * scale));
}

// Execute the shipped scalar shader body against the independent two-power CPU reference.
// This checks its arithmetic and power-call reduction, without claiming GPU timing/compilation.
function defaultShaderContrast() {
  const functions = [...SPACE_POST_PRESENTATION_GLSL.matchAll(
    /float spaceContrastShapedSquared\(float value\) \{([\s\S]*?)\n  \}/g,
  )];
  assert.equal(functions.length, 2, 'both optional LUT and default arithmetic variants exist');
  const body = functions[1][1].replace(/\bfloat\s+(\w+)/g, 'let $1');
  const run = new Function('value', 'uLookContrast', 'pow', 'min', 'max', `"use strict";${body}`);
  let powers = 0;
  const pow = (value, exponent) => { powers++; return value ** exponent; };
  return {
    evaluate(value, contrast) { return run(value, contrast, pow, Math.min, Math.max); },
    resetPowers() { powers = 0; },
    get powers() { return powers; },
  };
}

function authoredTransitionContrasts() {
  const authored = [...new Set(Object.keys(LOOK_MOODS).map(id => resolveLookMood(id).post.contrast))];
  const contrasts = new Set(authored);
  for (const from of authored) for (const to of authored) for (let step = 1; step < 8; step++) {
    const raw = step / 8;
    const blend = raw * raw * (3 - 2 * raw);
    contrasts.add(from + (to - from) * blend);
  }
  return [...contrasts];
}

test('default shader uses one power while retaining every authored contrast and mood transition', () => {
  const shader = defaultShaderContrast();
  let maxError = 0;
  const edges = [0, 1e-15, 1e-10, 1e-7, 1 - 1e-7, 1 - 1e-10, 1 - 1e-15, 1];
  for (const contrast of [0.5, 1, 2, ...authoredTransitionContrasts()]) {
    assert.equal(shader.evaluate(0, contrast), 0, 'black stays exact');
    assert.equal(shader.evaluate(1, contrast), 1, 'white stays exact');
    shader.resetPowers();
    shader.evaluate(0.37, contrast);
    assert.equal(shader.powers, 1, 'the actual default shader evaluates a single power');
    for (const value of edges) {
      maxError = Math.max(maxError, Math.abs(shader.evaluate(value, contrast) - contrastShapedSquared(value, contrast)));
    }
    for (let i = 0; i <= 2048; i++) {
      const value = i / 2048;
      maxError = Math.max(maxError, Math.abs(shader.evaluate(value, contrast) - contrastShapedSquared(value, contrast)));
    }
  }
  assert.ok(maxError < 2e-14, `max arithmetic error ${maxError}`);
});

test('single-power contrast preserves dark, saturated and HDR presentation values', () => {
  const shader = defaultShaderContrast();
  const curve = (value, contrast) => shader.evaluate(value, contrast);
  const colors = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [0.0001, 0.00001, 0.001], [1, 0.1, 0.01], [2, 1, 0.5], [100, 20, 5]];
  for (let i = 0; i <= 128; i++) {
    const value = 10 ** (-10 + i / 16);
    colors.push([value, value, value]);
  }
  let maxByteError = 0;
  for (const contrast of authoredTransitionContrasts()) for (const color of colors) {
    const reference = contrastRgb(color, contrast);
    const actual = contrastRgb(color, contrast, null, curve);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Number.isFinite(actual[channel]));
      maxByteError = Math.max(maxByteError, Math.abs(reference[channel] - actual[channel]) * 255);
    }
  }
  assert.ok(maxByteError < 1e-8, `max final sRGB arithmetic error ${maxByteError} bytes`);
});

test('unusual tuning retains the original two-power denominator floor and endpoint behavior', () => {
  const shader = defaultShaderContrast();
  for (const contrast of [-2, -0.5, 0, 0.49, 2.01, 8, 16, 32, 128]) {
    for (const value of [0, 1e-10, 0.01, 0.37, 0.5, 0.99, 1 - 1e-10, 1]) {
      shader.resetPowers();
      assert.equal(shader.evaluate(value, contrast), contrastShapedSquared(value, contrast));
      assert.equal(shader.powers, 2, 'out-of-range tuning keeps the original expression');
    }
  }
  assert.ok(shader.evaluate(0.5, 32) < 1e-8, 'the existing denominator floor remains load-bearing');
});

function rendererHarness({ webgl2 = true } = {}) {
  let activeTarget = null;
  const gl = {
    FRAMEBUFFER: 0x8D40,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    isContextLost: () => false,
    getExtension: () => ({}),
    checkFramebufferStatus() { return this.FRAMEBUFFER_COMPLETE; },
  };
  const renderer = {
    capabilities: { isWebGL2: webgl2, maxSamples: 0 },
    autoClear: true,
    userData: {},
    info: { programs: [], memory: { geometries: 0, textures: 0 } },
    getContext: () => gl,
    getRenderTarget: () => activeTarget,
    setRenderTarget(value) { activeTarget = value; },
    initRenderTarget() {},
  };
  return renderer;
}

test('contrast LUT uses portable RG8 encoding and stays within one final sRGB byte', () => {
  let maxScalarError = 0;
  for (const contrast of [1.04, 1.05, 1.06, 1.07, 1.08]) {
    const data = buildContrastLutData(contrast);
    assert.equal(data.length, CONTRAST_LUT_SIZE * 2);
    assert.equal(data[0], 0);
    assert.equal(data[1], 0);
    assert.equal(data.at(-2), 255);
    assert.equal(data.at(-1), 255);
    for (let i = 0; i <= 20000; i++) {
      const value = i / 20000;
      maxScalarError = Math.max(
        maxScalarError,
        Math.abs(contrastShapedSquared(value, contrast) - sampleContrastLutData(data, value)),
      );
    }
  }
  assert.ok(maxScalarError < 0.00005, `max scalar error ${maxScalarError}`);

  // Include the dark edge where sRGB expands linear error, saturated channels, and HDR values
  // after the existing luma-ratio step. These are scene-linear inputs, before final sRGB encode.
  const colors = [
    [0, 0, 0], [1e-7, 2e-7, 3e-7], [1e-5, 2e-5, 3e-5],
    [0.0001, 0.00001, 0.001], [0.001, 0.0001, 0.00001],
    [0.1, 0.01, 0.001], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 0.1, 0.01], [0.01, 1, 0.1], [0.1, 0.01, 1],
    [2, 1, 0.5], [10, 2, 0.1], [100, 20, 5],
  ];
  let maxByteError = 0;
  for (const contrast of [1.04, 1.05, 1.06, 1.07, 1.08]) {
    const data = buildContrastLutData(contrast);
    for (const color of colors) {
      const exact = contrastRgb(color, contrast);
      const approximated = contrastRgb(color, contrast, data);
      for (let channel = 0; channel < 3; channel++) {
        maxByteError = Math.max(maxByteError, Math.abs(exact[channel] - approximated[channel]) * 255);
      }
    }
    // Sweep the toe threshold separately: both paths must remain finite through the branch where
    // the authored shader intentionally stops applying a luma ratio to near-black pixels.
    for (let i = 0; i <= 320; i++) {
      const value = i === 0 ? 0 : 10 ** (-8 + (i / 320) * 3);
      const exact = contrastRgb([value, value, value], contrast);
      const approximated = contrastRgb([value, value, value], contrast, data);
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Number.isFinite(exact[channel]) && Number.isFinite(approximated[channel]));
        maxByteError = Math.max(maxByteError, Math.abs(exact[channel] - approximated[channel]) * 255);
      }
    }
  }
  assert.ok(maxByteError < 1, `max final sRGB error ${maxByteError} bytes`);
});

test('contrast LUT is opt-in, rebuilds on contrast changes, and fails closed without WebGL2', () => {
  const renderer = rendererHarness();
  const bloom = createBloom(renderer, 640, 360);
  try {
    let diag = bloom.diagnostics();
    assert.equal(diag.contrastLutRequested, false);
    assert.equal(diag.contrastLutEnabled, false);
    assert.equal(diag.contrastLutFormat, null);
    assert.equal(bloom.openingProgramMaterials()[1].defines?.SF_CONTRAST_LUT, undefined);

    bloom.setContrastLutEnabled(true);
    diag = bloom.diagnostics();
    assert.equal(diag.contrastLutRequested, true);
    assert.equal(diag.contrastLutEnabled, true);
    assert.equal(diag.contrastLutFormat, CONTRAST_LUT_FORMAT);
    assert.equal(diag.contrastLutSize, CONTRAST_LUT_SIZE);
    assert.equal(bloom.openingProgramMaterials()[1].defines.SF_CONTRAST_LUT, 1);
    const lutTexture = bloom.openingProgramMaterials()[1].uniforms.tLookContrastLut.value;
    const stableVersion = lutTexture.version;
    bloom.setContrastLutEnabled(true);
    assert.equal(lutTexture.version, stableVersion, 'unchanged contrast must reuse the uploaded table');
    const previousContrast = LOOK_POST_UNIFORMS.uLookContrast.value;
    try {
      LOOK_POST_UNIFORMS.uLookContrast.value = 1.08;
      bloom.setContrastLutEnabled(true);
      assert.ok(lutTexture.version > stableVersion, 'contrast change must refresh the table payload');
    } finally {
      LOOK_POST_UNIFORMS.uLookContrast.value = previousContrast;
    }
    bloom.setContrastLutEnabled(true);

    const beforeRestore = lutTexture.version;
    bloom.rebuild();
    assert.equal(bloom.diagnostics().contrastLutEnabled, true);
    assert.ok(lutTexture.version > beforeRestore, 'context rebuild must re-upload the retained LUT payload');
    bloom.setOptions({ contrastLut: false });
    diag = bloom.diagnostics();
    assert.equal(diag.contrastLutEnabled, false);
    assert.equal(diag.contrastLutSize, 0);
    assert.equal(bloom.openingProgramMaterials()[1].defines?.SF_CONTRAST_LUT, undefined);
  } finally {
    bloom.dispose();
  }

  const webgl1 = createBloom(rendererHarness({ webgl2: false }), 320, 180);
  try {
    webgl1.setContrastLutEnabled(true);
    const diag = webgl1.diagnostics();
    assert.equal(diag.contrastLutRequested, true);
    assert.equal(diag.contrastLutEnabled, false);
    assert.equal(diag.contrastLutReason, 'webgl2-required');
  } finally {
    webgl1.dispose();
  }
});
