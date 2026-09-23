import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBloom } from '../src/render/bloom.js';
import {
  CAS_FRAG,
  CAS_SHARPNESS,
  applyCasSetup,
  createCasUniforms,
  resolveCasSharpenActive,
} from '../src/render/cas.js';
import { FFX_A_H, FFX_CAS_H } from '../src/render/casHeaders.generated.js';
import { buildCasHeadersModule } from '../scripts/build-cas-shader.mjs';

const _bits = new ArrayBuffer(4);
const _f32 = new Float32Array(_bits);
const _u32 = new Uint32Array(_bits);
function f2u(f) { _f32[0] = f; return _u32[0]; }
function u2f(u) { _u32[0] = u; return _f32[0]; }

function rendererHarness() {
  const events = [];
  let activeTarget = null;
  const name = (t) => (t ? `${t.width}x${t.height}` : 'screen');
  const renderer = {
    capabilities: { isWebGL2: true, maxSamples: 0 },
    autoClear: true,
    setRenderTarget(t) { activeTarget = t; events.push(`target:${name(t)}`); },
    getRenderTarget() { return activeTarget; },
    clear() { events.push(`clear:${name(activeTarget)}`); },
    render(scene) {
      if (renderer.autoClear) renderer.clear();
      events.push(`render:${scene && scene.kind || 'quad'}:${name(activeTarget)}`);
    },
  };
  return { renderer, events };
}

test('CAS gate: below-display-resolution frames sharpen, full-res and supersampled frames do not', () => {
  // renderScale 0.5 on a 1x display, dyn-res dip on a 2x display, DPR cap below native.
  assert.equal(resolveCasSharpenActive(960, 540, 1920, 1080), true);
  assert.equal(resolveCasSharpenActive(1920, 1080, 3840, 2160), true);
  assert.equal(resolveCasSharpenActive(1280, 720, 1920, 1080), true);
  // Full-res frames are left alone.
  assert.equal(resolveCasSharpenActive(1920, 1080, 1920, 1080), false);
  assert.equal(resolveCasSharpenActive(1280, 720, 1280, 720), false);
  // Supersampled frames are left alone too (renderScale > 1).
  assert.equal(resolveCasSharpenActive(3840, 2160, 1920, 1080), false);
  // Missing/zero display footprint means "no evidence of below-res" — off.
  assert.equal(resolveCasSharpenActive(640, 360, 0, 0), false);
  assert.equal(resolveCasSharpenActive(640, 360, undefined, undefined), false);
});

test('CAS fragment shader embeds the vendored AMD headers byte-for-byte — the filter is not rewritten', () => {
  // The generated module must match a fresh regen of the vendor headers (drift check).
  const generatedPath = new URL('../src/render/casHeaders.generated.js', import.meta.url);
  assert.equal(readFileSync(generatedPath, 'utf8'), buildCasHeadersModule(),
    'casHeaders.generated.js is stale — regenerate with node scripts/build-cas-shader.mjs');

  // Provenance: ffx_a.h is byte-identical to the vendor file; ffx_cas.h differs only by the
  // generator's documented ES3 uint-literal fix inside CasSetup (CPU-side, never called on
  // the GPU — the runtime uses the JS port). Nothing else may diverge.
  const rawA = readFileSync(new URL('../vendor/fidelityfx-cas/ffx_a.h', import.meta.url), 'utf8');
  const rawCas = readFileSync(new URL('../vendor/fidelityfx-cas/ffx_cas.h', import.meta.url), 'utf8');
  assert.equal(FFX_A_H, rawA, 'ffx_a.h is byte-identical to vendor');
  assert.equal(FFX_CAS_H.replace('const1[3]=0u;', 'const1[3]=0;'), rawCas,
    'the only ffx_cas.h divergence is the documented ES3 uint literal in CasSetup');

  // WebGL2 ES 3.00 has no bitfieldExtract/bitfieldInsert (ES 3.10) — ABfe/ABfiM need the
  // shim + builtin-name remap injected before ffx_a.h or the headers cannot compile.
  const posShim = CAS_FRAG.indexOf('sfBitfieldExtract');
  const posRemap = CAS_FRAG.indexOf('#define bitfieldExtract sfBitfieldExtract');
  assert.ok(posShim > 0 && posRemap > posShim, 'ES3 bitfield shim precedes the headers');

  // README recipe order: A_GPU/A_GLSL defines -> ffx_a.h -> CasLoad/CasInput -> ffx_cas.h -> main.
  const defGpu = CAS_FRAG.indexOf('#define A_GPU');
  const defGlsl = CAS_FRAG.indexOf('#define A_GLSL');
  const posA = CAS_FRAG.indexOf(FFX_A_H);
  const posLoad = CAS_FRAG.indexOf('AF3 CasLoad(ASU2 p)');
  const posInput = CAS_FRAG.indexOf('void CasInput(inout AF1 r,inout AF1 g,inout AF1 b){}');
  const posCas = CAS_FRAG.indexOf(FFX_CAS_H, posLoad);
  const posMain = CAS_FRAG.indexOf('void main()', posCas);
  assert.ok(defGpu >= 0 && defGlsl > defGpu, 'A_GPU/A_GLSL precede the headers');
  assert.ok(posA > posRemap, 'ffx_a.h ships inside the shader after the bitfield remap');
  assert.ok(posLoad > posA + FFX_A_H.length - 1, 'CasLoad follows ffx_a.h');
  assert.ok(posInput > posLoad, 'CasInput follows CasLoad');
  assert.ok(posCas > posInput, 'ffx_cas.h follows the injection seams');
  assert.ok(posMain > posCas, 'main() follows ffx_cas.h');

  // Sharpen-only: the noScaling literal is `true` — the browser owns the display upscale.
  assert.ok(CAS_FRAG.includes('CasFilter(c.r,c.g,c.b,ip,uConst0,uConst1,true)'),
    'CasFilter is invoked with the noScaling=true literal');
  // Integer-pixel sampling, edge-clamped — the documented injection seam.
  assert.ok(CAS_FRAG.includes('texelFetch(tSrc,clamp('), 'CasLoad samples at integer pixels');
  // One filter, one pass: a second invocation would be the sharpen-twice failure mode.
  // (Count the exact call; ffx_cas.h's own doc examples also contain the token.)
  assert.equal(CAS_FRAG.split('CasFilter(c.r,c.g,c.b,ip,uConst0,uConst1,true)').length - 1, 1,
    'CasFilter is invoked exactly once');
});

test('applyCasSetup matches the ffx_cas.h CasSetup contract', () => {
  const uniforms = createCasUniforms();
  assert.ok(uniforms.uConst0.value instanceof Uint32Array
    && uniforms.uConst1.value instanceof Uint32Array,
    'constant uniforms carry bit-cast containers');

  applyCasSetup(uniforms, 0, 1280, 720, 1920, 1080);
  const c0 = uniforms.uConst0.value;
  const c1 = uniforms.uConst1.value;
  // const0.xy = input/output ratio; const0.zw = half-texel offset in output space.
  // Constants are float32 bit-cast containers — compare within float32 precision.
  assert.ok(Math.abs(u2f(c0[0]) - 1280 / 1920) < 1e-7);
  assert.ok(Math.abs(u2f(c0[1]) - 720 / 1080) < 1e-7);
  assert.ok(Math.abs(u2f(c0[2]) - (0.5 * (1280 / 1920) - 0.5)) < 1e-7);
  // sharpness 0 -> sharp = -1/8 (AMD default, lower ringing).
  assert.ok(Math.abs(u2f(c1[0]) - (-1 / 8)) < 1e-7);
  // const1.z = 8 * input/output x.
  assert.ok(Math.abs(u2f(c1[2]) - 8 * (1280 / 1920)) < 1e-6);

  // Sharpness saturates: 1 -> -1/5 (maximum, higher ringing).
  applyCasSetup(uniforms, 1, 640, 360, 640, 360);
  assert.ok(Math.abs(u2f(uniforms.uConst1.value[0]) - (-1 / 5)) < 1e-7);
  // Identity sizes -> unit ratio, zero offset.
  assert.equal(u2f(uniforms.uConst0.value[0]), 1);
  assert.equal(u2f(uniforms.uConst0.value[2]), 0);
  assert.equal(CAS_SHARPNESS, 0, 'shipping sharpness is AMD default');
});

test('below-res bloom frame runs composite into rtPost then CasFilter to screen', () => {
  const harness = rendererHarness();
  const bloom = createBloom(harness.renderer, 640, 360);
  try {
    // Below-res: 640x360 buffer on a 1280x720 display footprint.
    bloom.setSize(640, 360, 1280, 720);
    assert.equal(bloom.diagnostics().casSharpenActive, true);
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    const renders = harness.events.filter((e) => e.startsWith('render:'));
    assert.deepEqual(renders, [
      'render:scene:640x360',
      'render:quad:320x180',
      'render:quad:160x90',
      'render:quad:640x360', // composite presents into rtPost instead of screen
      'render:quad:screen',  // CasFilter sharpens rtPost onto the canvas
    ]);
    assert.equal(bloom.diagnostics().passFamilies.cas, 1);

    // Full-res: the same buffer at a same-size display footprint skips CAS entirely —
    // composite writes straight to screen like it always has.
    harness.events.length = 0;
    bloom.setSize(640, 360, 640, 360);
    assert.equal(bloom.diagnostics().casSharpenActive, false);
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    assert.deepEqual(harness.events.filter((e) => e.startsWith('render:')), [
      'render:scene:640x360',
      'render:quad:320x180',
      'render:quad:160x90',
      'render:quad:screen',
    ]);
    assert.equal(bloom.diagnostics().passFamilies.cas, 0);
  } finally {
    bloom.dispose();
  }
});

test('a frame returning to full resolution drops the CAS pass without losing rtPost on rebuild', () => {
  const harness = rendererHarness();
  const bloom = createBloom(harness.renderer, 640, 360);
  try {
    bloom.setSize(640, 360, 1280, 720);
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    // Dynamic-res recovery: back to full res mid-session.
    bloom.setSize(640, 360, 640, 360);
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    const tail = harness.events.filter((e) => e.startsWith('render:')).slice(-1)[0];
    assert.equal(tail, 'render:quad:screen', 'CAS pass fully retires at full res');
    // Context restore while active re-arms the post target at the current size.
    bloom.setSize(640, 360, 1280, 720);
    bloom.rebuild();
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    const last2 = harness.events.filter((e) => e.startsWith('render:')).slice(-2);
    assert.deepEqual(last2, ['render:quad:640x360', 'render:quad:screen']);
  } finally {
    bloom.dispose();
  }
});
