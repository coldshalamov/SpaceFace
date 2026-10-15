import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTRAST_LUT_FORMAT,
  CONTRAST_LUT_SIZE,
  buildContrastLutData,
  contrastShapedSquared,
  createBloom,
  sampleContrastLutData,
} from '../src/render/bloom.js';
import { LOOK_POST_UNIFORMS } from '../src/render/look.js';

const LUMA = [0.2126, 0.7152, 0.0722];

function srgb(value) {
  const c = Math.max(0, value);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

function contrastRgb(rgb, contrast, lut = null) {
  const y = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  const value = Math.sqrt(Math.max(0, Math.min(1, y)));
  const shapedSquared = lut
    ? sampleContrastLutData(lut, value)
    : contrastShapedSquared(value, contrast);
  const scale = y > 0.00001 ? Math.min(shapedSquared / y, 4) : 1;
  return rgb.map((channel) => srgb(channel * scale));
}

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
