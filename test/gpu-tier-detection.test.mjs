// Weak-laptop GPU detection (W1-C). detectGpu must put AMD Ryzen APUs and integrated Arc on the
// `integrated` tier (pixel-ratio cap, background tier, dynamic-resolution floor all key on it),
// leave dedicated cards `discrete` — including the ones that share a family word with an
// integrated part (Radeon RX Vega 64, Radeon Pro 5500M, Arc A770) — and report a browser that
// hides the GPU name as `unknown`, not `discrete`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detectGpu,
  dynResFloorForTier,
  dynamicResolutionAllowedForTier,
  shouldSuggestIntegratedPreset,
} from '../src/render/adaptiveQuality.js';

const RENDERER_PARAM = 0x9246;
const VENDOR_PARAM = 0x9245;

function fakeRenderer(renderer, vendor = 'Google Inc.') {
  return {
    getContext: () => ({
      getExtension: (name) => (name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: RENDERER_PARAM, UNMASKED_VENDOR_WEBGL: VENDOR_PARAM }
        : null),
      getParameter: (p) => (p === RENDERER_PARAM ? renderer : vendor),
    }),
  };
}

// The extension is blocked or absent: the only name left is gl.RENDERER / gl.VENDOR.
function maskedRenderer(renderer, vendor = 'WebKit') {
  const RENDERER = 0x1f01;
  const VENDOR = 0x1f00;
  return {
    getContext: () => ({
      RENDERER,
      VENDOR,
      getExtension: () => null,
      getParameter: (p) => (p === RENDERER ? renderer : p === VENDOR ? vendor : ''),
    }),
  };
}

const tierOf = (renderer) => detectGpu(fakeRenderer(renderer)).tier;

// Real strings as Chrome/ANGLE (Windows), Safari, and Mesa (Linux) report them.
const INTEGRATED = [
  ['Intel UHD 620 (ANGLE)', 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Iris Xe (ANGLE)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc iGPU (Meteor Lake)', 'ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc 140V (Lunar Lake)', 'ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc B390 (Panther Lake iGPU, B-series but integrated)', 'ANGLE (Intel, Intel(R) Arc(TM) B390 Graphics (0x0000B0B0) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc B370 (Panther Lake iGPU)', 'ANGLE (Intel, Intel(R) Arc(TM) B370 Graphics (0x0000B0B1) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Steam Deck LCD (Custom GPU 0405)', 'ANGLE (AMD, AMD Custom GPU 0405 (radeonsi, vangogh, LLVM 15.0.7, DRM 3.49, 5.13.0-valve21-1-neptune-02), OpenGL ES 3.2 Mesa 22.2.0)'],
  ['Steam Deck OLED (Custom GPU 0932)', 'AMD Custom GPU 0932 (radeonsi, vangogh, LLVM 15.0.7, DRM 3.54)'],
  ['Mesa Intel UHD', 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)'],
  ['Ryzen APU "Radeon(TM) Graphics"', 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Ryzen APU "Radeon Graphics" (Mesa)', 'AMD Radeon Graphics (renoir, LLVM 15.0.7, DRM 3.49, 6.1.0)'],
  ['Ryzen 2500U Vega 8', 'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics (0x000015DD) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Ryzen 2200G Vega 8, bare', 'AMD Radeon Vega 8 Graphics'],
  ['Ryzen 2400G "RX Vega 11 Graphics" (collides with RX)', 'ANGLE (AMD, AMD Radeon(TM) RX Vega 11 Graphics (0x000015DD) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon 780M mobile APU', 'ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon 680M, (TM) form', 'ANGLE (AMD, AMD Radeon(TM) 680M (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon 610M', 'ANGLE (AMD, AMD Radeon 610M (0x00001506) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Kaveri-era "Radeon R5 Graphics"', 'ANGLE (AMD, AMD Radeon(TM) R5 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Old Mesa APU codename', 'AMD RENOIR (DRM 3.40.0, 5.11.0, LLVM 11.0.0)'],
  ['Apple silicon', 'Apple M2 Pro'],
  ['Safari "Apple GPU"', 'Apple GPU'],
  ['Snapdragon X Adreno', 'ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU (0x36334330) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Mali phone/Chromebook', 'Mali-G78'],
];

const DISCRETE = [
  ['Radeon RX 6600', 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon RX 7900 XTX', 'ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon RX 6800M laptop (digits + M, but RX)', 'ANGLE (AMD, AMD Radeon RX 6800M (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon RX Vega 64 (Vega + digits, no Graphics)', 'ANGLE (AMD, AMD Radeon RX Vega 64 (0x00006863) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Radeon Pro Vega 20 (MacBook Pro)', 'AMD Radeon Pro Vega 20 OpenGL Engine'],
  ['Radeon Pro 5500M (digits + M, but Pro)', 'AMD Radeon Pro 5500M OpenGL Engine'],
  ['Radeon Pro W6800 workstation', 'ANGLE (AMD, AMD Radeon Pro W6800 (0x000073A3) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Mesa Radeon RX 6600', 'AMD Radeon RX 6600 (navi23, LLVM 15.0.7, DRM 3.49, 6.1.0)'],
  ['GeForce RTX 3060 Laptop', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002520) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['GeForce MX150 (weak but dedicated)', 'ANGLE (NVIDIA, NVIDIA GeForce MX150 (0x00001D12) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['GeForce GTX 1650 (GL form)', 'NVIDIA GeForce GTX 1650/PCIe/SSE2'],
  ['Intel Arc A770 desktop', 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc A370M laptop', 'ANGLE (Intel, Intel(R) Arc(TM) A370M Graphics (0x00005693) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc B580 Battlemage', 'ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics (0x0000E20B) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc B570 Battlemage', 'ANGLE (Intel, Intel(R) Arc(TM) B570 Graphics (0x0000E20C) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel Arc Pro B60', 'ANGLE (Intel, Intel(R) Arc(TM) Pro B60 Graphics (0x0000E211) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Mesa Intel Arc A380', 'Mesa Intel(R) Arc(tm) A380 Graphics (DG2)'],
  ['Mesa Radeon RX 6700 XT (navi22, no APU codename)', 'AMD Radeon RX 6700 XT (navi22, LLVM 15.0.7, DRM 3.49, 6.1.0)'],
  ['Mesa Radeon RX Vega (vega10, dedicated)', 'AMD Radeon RX Vega (vega10, LLVM 15.0.7, DRM 3.49, 6.1.0)'],
  ['Mesa Radeon RX 580 (polaris10)', 'AMD Radeon RX 580 Series (polaris10, LLVM 15.0.7, DRM 3.49, 6.1.0)'],
  ['Intel Arc Pro A40', 'ANGLE (Intel, Intel(R) Arc(TM) Pro A40 Graphics (0x000056BC) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
];

for (const [label, renderer] of INTEGRATED) {
  test(`integrated: ${label}`, () => {
    assert.equal(tierOf(renderer), 'integrated', renderer);
  });
}

for (const [label, renderer] of DISCRETE) {
  test(`discrete: ${label}`, () => {
    assert.equal(tierOf(renderer), 'discrete', renderer);
  });
}

test('the matrix covers at least twelve real strings both ways', () => {
  assert.ok(INTEGRATED.length >= 12, `integrated rows: ${INTEGRATED.length}`);
  assert.ok(DISCRETE.length >= 12, `discrete rows: ${DISCRETE.length}`);
});

test('software backends still win over every other word in the string', () => {
  assert.equal(tierOf('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), 'software');
  assert.equal(tierOf('llvmpipe (LLVM 15.0.7, 256 bits)'), 'software');
  assert.equal(tierOf('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)'), 'software');
  const gpu = detectGpu(fakeRenderer('Intel(R) UHD Graphics 620', 'Google SwiftShader'));
  assert.equal(gpu.tier, 'software');
  assert.equal(gpu.software, true);
});

test('a browser that hides the GPU name reports unknown, not discrete', () => {
  // Chromium with the unmasked-renderer extension blocked: gl.RENDERER is the fixed wrapper name.
  assert.equal(detectGpu(maskedRenderer('WebKit WebGL')).tier, 'unknown');
  assert.equal(detectGpu(maskedRenderer('Mozilla', 'Mozilla')).tier, 'unknown');
  assert.equal(detectGpu(maskedRenderer('')).tier, 'unknown');
  // No context at all (headless inventory): unchanged.
  assert.equal(detectGpu(null).tier, 'unknown');
  // The extension answering with the same wrapper name is the same verdict.
  assert.equal(tierOf('WebKit WebGL'), 'unknown');
  assert.equal(tierOf('  Mozilla  '), 'unknown');
  // The raw string is still reported so a bug report can show what the browser said.
  assert.equal(detectGpu(maskedRenderer('WebKit WebGL')).renderer, 'WebKit WebGL');
});

test('a real name that merely contains a wrapper word is not unknown', () => {
  assert.equal(tierOf('ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11) WebGL'), 'discrete');
  assert.equal(tierOf('Mozilla Intel(R) UHD Graphics'), 'integrated');
});

test('every ANGLE string classifies the same with the vendor field blank', () => {
  for (const [, renderer] of [...INTEGRATED, ...DISCRETE]) {
    const withVendor = detectGpu(fakeRenderer(renderer, 'Google Inc. (AMD)')).tier;
    const blankVendor = detectGpu(fakeRenderer(renderer, '')).tier;
    assert.equal(withVendor, blankVendor, renderer);
  }
});

test('dynamic resolution may run on software, integrated, and unknown tiers only', () => {
  assert.equal(dynamicResolutionAllowedForTier('software'), true);
  assert.equal(dynamicResolutionAllowedForTier('integrated'), true);
  assert.equal(dynamicResolutionAllowedForTier('unknown'), true);
  assert.equal(dynamicResolutionAllowedForTier('discrete'), false);
  assert.equal(dynamicResolutionAllowedForTier(undefined), false);
  assert.equal(dynamicResolutionAllowedForTier('mid'), false);
});

test('the newly integrated machines get the integrated floor and the preset suggestion', () => {
  const gpu = detectGpu(fakeRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'));
  assert.equal(gpu.tier, 'integrated');
  assert.equal(dynResFloorForTier(gpu.tier), 0.5);
  assert.equal(shouldSuggestIntegratedPreset(gpu, { qualityPreset: 'medium' }), true);
  const arc = detectGpu(fakeRenderer('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'));
  assert.equal(shouldSuggestIntegratedPreset(arc, { qualityPreset: 'medium' }), false,
    'a dedicated Arc card is not offered the integrated bundle');
  assert.equal(dynResFloorForTier(arc.tier), 0.6);
});
