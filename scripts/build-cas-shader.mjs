// Regenerates src/render/casHeaders.generated.js from vendor/fidelityfx-cas/.
// The CAS fragment shader embeds AMD's headers byte-for-byte; this script is the only
// sanctioned way that text reaches the runtime. Hand-editing the generated file (or
// paraphrasing the filter) breaks the test/cas-sharpen.test.mjs drift check.
//
//   node scripts/build-cas-shader.mjs            rewrite the generated module
//   node scripts/build-cas-shader.mjs --check    exit non-zero if it is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(root, 'vendor', 'fidelityfx-cas');
const OUT_PATH = join(root, 'src', 'render', 'casHeaders.generated.js');

// GLSL ES 3.00 (WebGL2) has no implicit int->uint conversion, so the upstream line
// `const1[3]=0;` fails strict compilers like ANGLE's (desktop GLSL/D3D tolerate it).
// This is the ONLY divergence from vendored text, and it lives in CasSetup — the CPU-side
// function the runtime ports to JS and never calls on the GPU. CasFilter is untouched.
const ES3_LEGACY = 'const1[3]=0;';
const ES3_FIXED = 'const1[3]=0u;';

export function applyEs3Compat(ffxCas) {
  const count = ffxCas.split(ES3_LEGACY).length - 1;
  if (count !== 1) {
    throw new Error(`[cas-shader] expected exactly one '${ES3_LEGACY}' in ffx_cas.h, found ${count}`);
  }
  return ffxCas.replace(ES3_LEGACY, ES3_FIXED);
}

export function renderCasHeadersModule(ffxA, ffxCas) {
  // JSON.stringify produces an exact, escaping-safe JS string literal — the shader text
  // reaches the GPU byte-identical to the vendored upstream header (ffxCas arrives already
  // patched by applyEs3Compat; ffxA is verbatim).
  return `// GENERATED FILE — do not edit. Regenerate: node scripts/build-cas-shader.mjs
// Source of truth: vendor/fidelityfx-cas/ffx_a.h and ffx_cas.h (AMD, MIT).
// FFX_A_H is byte-identical to ffx_a.h. FFX_CAS_H carries exactly one documented change:
// the ES3 uint-literal fix in CasSetup (see applyEs3Compat in scripts/build-cas-shader.mjs).
// The CAS shader prepends "#define A_GPU 1" / "#define A_GLSL 1" before FFX_A_H, defines
// CasLoad/CasInput, then includes FFX_CAS_H — exactly as vendor/fidelityfx-cas/README.md
// prescribes. CasFilter itself is never rewritten.
export const FFX_A_H = ${JSON.stringify(ffxA)};
export const FFX_CAS_H = ${JSON.stringify(ffxCas)};
`;
}

export function buildCasHeadersModule({ vendorDir = VENDOR_DIR } = {}) {
  const ffxA = readFileSync(join(vendorDir, 'ffx_a.h'), 'utf8');
  const ffxCas = applyEs3Compat(readFileSync(join(vendorDir, 'ffx_cas.h'), 'utf8'));
  return renderCasHeadersModule(ffxA, ffxCas);
}

const invokedAsScript = !!process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const next = buildCasHeadersModule();
  if (process.argv.includes('--check')) {
    let current = null;
    try { current = readFileSync(OUT_PATH, 'utf8'); } catch { /* missing counts as stale */ }
    if (current !== next) {
      console.error('[cas-shader] src/render/casHeaders.generated.js is stale — run node scripts/build-cas-shader.mjs');
      process.exit(1);
    }
    console.log('[cas-shader] generated module matches vendor headers');
  } else {
    writeFileSync(OUT_PATH, next);
    console.log('[cas-shader] wrote src/render/casHeaders.generated.js');
  }
}
