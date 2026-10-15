import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  PACKED_HDR_MODE,
  createBloom,
  normalizePackedHdrMode,
  packedHdrTargetOptions,
  probePackedHdrCapability,
} from '../src/render/bloom.js';
import { estimateGpuResourceBytes } from '../src/render/assetResidency.js';

function rendererHarness({ webgl2 = true, extension = true, complete = true } = {}) {
  let activeTarget = null;
  const sentinel = { name: 'caller-target' };
  const gl = {
    FRAMEBUFFER: 0x8D40,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    isContextLost: () => false,
    getExtension(name) { return name === 'EXT_color_buffer_float' && extension ? {} : null; },
    checkFramebufferStatus() { return complete ? this.FRAMEBUFFER_COMPLETE : 0x8CD6; },
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
  activeTarget = sentinel;
  return {
    renderer,
    gl,
    sentinel,
    currentTarget: () => activeTarget,
  };
}

test('packed HDR mode normalizes and preserves explicit target formats', () => {
  assert.equal(normalizePackedHdrMode(true), PACKED_HDR_MODE.PYRAMID);
  assert.equal(normalizePackedHdrMode('all-color-targets'), PACKED_HDR_MODE.ALL);
  assert.equal(normalizePackedHdrMode('pyramid-only'), PACKED_HDR_MODE.PYRAMID);
  assert.equal(normalizePackedHdrMode('unexpected'), PACKED_HDR_MODE.OFF);

  const ordinary = packedHdrTargetOptions(PACKED_HDR_MODE.OFF, true);
  assert.equal(ordinary.format, THREE.RGBAFormat);
  assert.equal(ordinary.type, THREE.HalfFloatType);
  assert.equal(ordinary.depthBuffer, true);

  const packed = packedHdrTargetOptions(PACKED_HDR_MODE.PYRAMID);
  assert.equal(packed.format, THREE.RGBFormat);
  assert.equal(packed.type, THREE.UnsignedInt101111Type);
  assert.equal(packed.depthBuffer, false);
});

test('packed HDR capability probe restores the caller target and fails closed', () => {
  const supported = rendererHarness();
  const result = probePackedHdrCapability(supported.renderer);
  assert.equal(result.supported, true);
  assert.equal(result.reason, 'framebuffer-complete');
  assert.strictEqual(supported.currentTarget(), supported.sentinel);

  const incomplete = rendererHarness({ complete: false });
  const rejected = probePackedHdrCapability(incomplete.renderer);
  assert.equal(rejected.supported, false);
  assert.match(rejected.reason, /^framebuffer-incomplete:/);
  assert.equal(rejected.framebufferStatus, 0x8CD6);
  assert.strictEqual(incomplete.currentTarget(), incomplete.sentinel);

  const webgl1 = rendererHarness({ webgl2: false });
  assert.deepEqual(probePackedHdrCapability(webgl1.renderer), {
    supported: false,
    reason: 'webgl2-required',
    framebufferStatus: null,
  });
});

test('bloom keeps HalfFloat by default, supports pyramid/all opt-in modes, and re-probes restore', () => {
  const h = rendererHarness();
  const bloom = createBloom(h.renderer, 640, 360);
  try {
    const initial = bloom.diagnostics();
    assert.equal(initial.packedHdrRequested, PACKED_HDR_MODE.OFF);
    assert.equal(initial.packedHdrMode, PACKED_HDR_MODE.OFF);
    assert.equal(initial.packedHdrFormat, 'rgba16f');
    assert.equal(bloom.contextLossResources()[0].texture.format, THREE.RGBAFormat);
    assert.equal(bloom.contextLossResources()[0].texture.type, THREE.HalfFloatType);

    bloom.setPackedHdrMode(PACKED_HDR_MODE.PYRAMID);
    let diag = bloom.diagnostics();
    assert.equal(diag.packedHdrRequested, PACKED_HDR_MODE.PYRAMID);
    assert.equal(diag.packedHdrMode, PACKED_HDR_MODE.PYRAMID);
    assert.equal(diag.packedHdrFormat, 'r11g11b10f');
    const pyramidTargets = bloom.contextLossResources();
    assert.equal(pyramidTargets[0].texture.type, THREE.HalfFloatType, 'pyramid mode keeps scene precision');
    assert.ok(pyramidTargets.slice(1).every((target) => target.texture.format === THREE.RGBFormat));
    assert.ok(pyramidTargets.slice(1).every((target) => target.texture.type === THREE.UnsignedInt101111Type));

    bloom.setOptions({ packedHdr: PACKED_HDR_MODE.ALL });
    diag = bloom.diagnostics();
    assert.equal(diag.packedHdrMode, PACKED_HDR_MODE.ALL);
    assert.ok(bloom.contextLossResources().every((target) => target.texture.format === THREE.RGBFormat));
    assert.ok(bloom.contextLossResources().every((target) => target.texture.type === THREE.UnsignedInt101111Type));

    h.gl.getExtension = () => null;
    bloom.rebuild();
    diag = bloom.diagnostics();
    assert.equal(diag.packedHdrRequested, PACKED_HDR_MODE.ALL);
    assert.equal(diag.packedHdrMode, PACKED_HDR_MODE.OFF);
    assert.equal(diag.packedHdrCapability.reason, 'ext-color-buffer-float-required');
    assert.ok(bloom.contextLossResources().every((target) => target.texture.type === THREE.HalfFloatType));
  } finally {
    bloom.dispose();
  }
});

test('residency accounts packed RGB HDR as one four-byte word per pixel', () => {
  const texture = new THREE.Texture({ width: 2, height: 3 });
  texture.format = THREE.RGBFormat;
  texture.type = THREE.UnsignedInt101111Type;
  texture.generateMipmaps = false;
  assert.equal(estimateGpuResourceBytes(texture).gpuResidentBytes, 2 * 3 * 4);
});
