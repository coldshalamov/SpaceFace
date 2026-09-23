// FidelityFX Contrast Adaptive Sharpening (AQ-CAS) — sharpen-only CasFilter for frames the
// pipeline drew below the display resolution. The canvas backing store IS the low-res frame:
// the browser upscales it to the display, so this pass runs CasFilter with noScaling=true —
// sharpen the buffer, let the compositor upscale. (vendor/fidelityfx-cas/README.md)
//
// The AMD headers are NOT rewritten: casHeaders.generated.js carries ffx_a.h byte-exact and
// ffx_cas.h with exactly one documented ES3 uint-literal fix inside CasSetup (the CPU-side
// function — see applyEs3Compat in scripts/build-cas-shader.mjs). CasSetup runs once per
// resize on the CPU — its constants ride up as uvec4 uniforms, matching the header's
// bit-cast contract.
import { FFX_A_H, FFX_CAS_H } from './casHeaders.generated.js';

// AMD's documented default. 0 = recommended sharpness (lower ringing), 1 = maximum.
export const CAS_SHARPNESS = 0;

/**
 * The done-when gate: a frame drawn below the display resolution sharpens; a full-res (or
 * supersampled) frame is left alone. buffer* is the drawing-buffer size the bloom targets use;
 * display* is the canvas's physical pixel footprint (CSS size × devicePixelRatio).
 */
export function resolveCasSharpenActive(bufferW, bufferH, displayW, displayH) {
  const bw = Math.floor(Number(bufferW) || 0);
  const bh = Math.floor(Number(bufferH) || 0);
  const dw = Math.floor(Number(displayW) || 0);
  const dh = Math.floor(Number(displayH) || 0);
  return bw > 0 && bh > 0 && (dw > bw || dh > bh);
}

// --- CPU CasSetup --------------------------------------------------------------
// Port of ffx_cas.h CasSetup() to JS. The constants are bit-cast containers (floatBitsToUint),
// so the shader reads them back with uintBitsToFloat exactly like the upstream integration.

const _bits = new ArrayBuffer(4);
const _f32 = new Float32Array(_bits);
const _u32 = new Uint32Array(_bits);
function f2u(f) { _f32[0] = f; return _u32[0]; }

// float32 -> IEEE 754 half bits, round-to-nearest. const1.y is packed half data — only the
// scaling path of CasFilter consumes it, but the port stays complete so the constants are
// honest under either mode.
function floatToHalfBits(value) {
  _f32[0] = value;
  const x = _u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exponent = (x >>> 23) & 0xff;
  const mantissa = x & 0x7fffff;
  if (exponent === 255) return sign | (mantissa ? 0x7e00 : 0x7c00);
  const e = exponent - 127 + 15;
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    const m = mantissa | 0x800000;
    const shift = 14 - e;
    return sign | ((m >> shift) + ((m >> (shift - 1)) & 1));
  }
  return sign | (e << 10) | ((mantissa + 0x1000) >> 13);
}

export function createCasUniforms() {
  return {
    tSrc: { value: null },
    uConst0: { value: new Uint32Array(4) },
    uConst1: { value: new Uint32Array(4) },
  };
}

export function applyCasSetup(uniforms, sharpness, inW, inH, outW, outH) {
  const c0 = uniforms.uConst0.value;
  const c1 = uniforms.uConst1.value;
  const s = Math.max(0, Math.min(1, Number(sharpness) || 0));
  c0[0] = f2u(inW / outW);
  c0[1] = f2u(inH / outH);
  c0[2] = f2u(0.5 * inW / outW - 0.5);
  c0[3] = f2u(0.5 * inH / outH - 0.5);
  const sharp = -1 / (8 + (5 - 8) * s);
  c1[0] = f2u(sharp);
  c1[1] = floatToHalfBits(sharp) | (floatToHalfBits(0) << 16);
  c1[2] = f2u(8 * inW / outW);
  c1[3] = 0;
}

// --- Fragment shader -------------------------------------------------------------
// Assembly order per vendor/fidelityfx-cas/README.md: A_GPU/A_GLSL defines, ffx_a.h,
// CasLoad (integer texelFetch, edge-clamped — the documented injection seam), no-op
// CasInput, ffx_cas.h, then a fullscreen main() that calls CasFilter sharpen-only.
export const CAS_FRAG = /* glsl */`
#define A_GPU 1
#define A_GLSL 1
// WebGL2 GLSL ES 3.00 lacks the ES 3.10 bitfield builtins that ABfe/ABfiM reference inside
// ffx_a.h. CasFilter never calls them, but the function definitions must still compile —
// provide identical semantics and remap the builtin names. The vendored text is untouched.
highp uint sfBitfieldExtract(highp uint v,int off,int bits){
  if(bits<=0)return 0u;
  highp uint m=(bits>=32)?0xffffffffu:((1u<<bits)-1u);
  return (v>>off)&m;
}
highp uint sfBitfieldInsert(highp uint v,highp uint ins,int off,int bits){
  highp uint m=(bits>=32)?0xffffffffu:((1u<<bits)-1u);
  return (v&~(m<<off))|((ins&m)<<off);
}
#define bitfieldExtract sfBitfieldExtract
#define bitfieldInsert sfBitfieldInsert
${FFX_A_H}
uniform highp sampler2D tSrc;
AF3 CasLoad(ASU2 p){
  ASU2 bounds=ASU2(textureSize(tSrc,0))-ASU2(1);
  return texelFetch(tSrc,clamp(p,ASU2(0),bounds),0).rgb;
}
void CasInput(inout AF1 r,inout AF1 g,inout AF1 b){}
${FFX_CAS_H}
uniform highp uvec4 uConst0;
uniform highp uvec4 uConst1;
// GLSL3 materials declare their own output (three defines gl_FragColor only for GLSL1).
layout(location = 0) out highp vec4 sfCasOut;
void main(){
  AU2 ip=AU2(ASU2(gl_FragCoord.xy));
  AF3 c=AF3(0.0,0.0,0.0);
  CasFilter(c.r,c.g,c.b,ip,uConst0,uConst1,true);
  sfCasOut=vec4(c,1.0);
}
`;
