import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  FOUNDRY_IBL_BAKED_MANIFEST_URL,
  FOUNDRY_IBL_BAKED_SCHEMA,
  FOUNDRY_IBL_BAKED_URL,
  FOUNDRY_IBL_TARGET_MEAN_RADIANCE,
  FOUNDRY_IBL_URL,
  IBL_PMREM_CUBE_SIZE,
  IBL_SOURCE_BACKGROUND,
  IBL_SOURCE_FOUNDRY,
  IBL_SOURCE_REFLECTION_CARDS,
  loadBakedFoundryIblTexture,
  loadFoundryIblTexture,
  neutralizeHdrGreenCast,
  normalizeHdrMeanRadiance,
  resolveIblSource,
} from '../src/render/foundryEnvironment.js';
import {
  SPACE_REFLECTION_PMREM_CUBE_SIZE,
} from '../src/render/spaceReflectionEnvironment.js';

// AQ-LIGHT — the authored deep-space env (scripts/generate-space-ibl.mjs) is the default
// image-based light for authored PBR surfaces: dark sky, warm sun lobe, cool planet bounce and
// rim fields, star-band glints. The retired Poly Haven foundry HDRI stays on disk as an
// alternate source and still exercises the decode/normalize/neutralize transforms. The visible
// sky stays the sector plate: the env feeds scene.environment only and is never assigned to
// scene.background. These tests pin the promoted default asset, the luminance normalization
// that keeps muzzle/engine emissives dominant, the PMREM source priority, and the renderer's
// lifecycle wiring (load → bake → promote on unfreeze → dispose).

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HDR_PATH = resolve(REPO, 'assets/background/env/deep_space_2k.hdr');
const FOUNDRY_HDR_PATH = resolve(REPO, 'assets/background/env/industrial_workshop_foundry_2k.hdr');
const RENDERER_PATH = resolve(REPO, 'src/render/renderer.js');

function parseHdrFile(path) {
  // HDRLoader.parse works headless on the file bytes — no fetch needed to prove the data.
  return import('three/addons/loaders/HDRLoader.js').then(({ HDRLoader }) => {
    const loader = new HDRLoader();
    loader.setDataType(THREE.FloatType);
    const buf = readFileSync(path);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return loader.parse(bytes);
  });
}

function parseFoundryHdr() {
  // The retired foundry HDRI remains the richest fixture for the transform chain (painted
  // green floor, hot furnace peaks). The default-source tests parse HDR_PATH directly.
  return parseHdrFile(FOUNDRY_HDR_PATH);
}

function meanLuminance(data, channels) {
  let sum = 0;
  let samples = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    sum += 0.2126 * Math.max(0, r) + 0.7152 * Math.max(0, g) + 0.0722 * Math.max(0, b);
    samples += 1;
  }
  return samples > 0 ? sum / samples : 0;
}

test('default deep-space IBL is promoted into the runtime env dir with RGBE data and provenance', () => {
  assert.ok(existsSync(HDR_PATH), 'assets/background/env/deep_space_2k.hdr missing');
  const head = readFileSync(HDR_PATH).subarray(0, 16).toString('latin1');
  assert.match(head, /^#\?/, 'HDR file lacks the Radiance RGBE magic header');
  assert.ok(
    existsSync(resolve(REPO, 'assets/background/env/PROVENANCE.md')),
    'env provenance record missing',
  );
  assert.equal(FOUNDRY_IBL_URL, '/assets/background/env/deep_space_2k.hdr');
  // The retired foundry source stays available as an alternate.
  assert.ok(existsSync(FOUNDRY_HDR_PATH), 'retired foundry .hdr missing from the env dir');
});

test('HDR parses as 2k float equirect radiance data', async () => {
  const parsed = await parseFoundryHdr();
  assert.ok(parsed.data instanceof Float32Array, 'HDRLoader did not yield float pixel data');
  assert.equal(parsed.width, 2048);
  assert.equal(parsed.height, 1024);
  assert.ok(meanLuminance(parsed.data, 4) > 0, 'HDR carries no radiance');
});

test('normalization lands the HDR mean on the card rig band and preserves foundry peaks', async () => {
  const parsed = await parseFoundryHdr();
  const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height);
  const stats = normalizeHdrMeanRadiance(texture, FOUNDRY_IBL_TARGET_MEAN_RADIANCE);
  assert.ok(stats, 'normalization refused float HDR data');
  assert.ok(stats.meanBefore > 0, 'unscaled foundry carries no mean radiance');
  assert.ok(
    Math.abs(stats.scaleFactor - FOUNDRY_IBL_TARGET_MEAN_RADIANCE / stats.meanBefore) < 1e-9,
    'scale factor is not target/mean',
  );
  assert.ok(
    Math.abs(meanLuminance(parsed.data, 4) - FOUNDRY_IBL_TARGET_MEAN_RADIANCE) < 1e-4,
    'scaled mean luminance did not land on the card-rig band',
  );
  // The lamps/molten structure must survive the scale — a flattened env is the card rig again.
  let peak = 0;
  for (let i = 0; i + 2 < parsed.data.length; i += 4) {
    const lum = 0.2126 * parsed.data[i] + 0.7152 * parsed.data[i + 1] + 0.0722 * parsed.data[i + 2];
    if (lum > peak) peak = lum;
  }
  assert.ok(
    peak > 25 * FOUNDRY_IBL_TARGET_MEAN_RADIANCE,
    `foundry specular structure lost: peak ${peak} after normalization`,
  );
});

test('green-cast pass neutralizes the painted floor and leaves warm content alone', async () => {
  const parsed = await parseFoundryHdr();
  const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height);
  const before = parsed.data.slice();
  const touched = neutralizeHdrGreenCast(texture);
  assert.ok(touched > 0, 'no green-dominant texels found in the foundry HDR');
  // The floor's strong greens must land on the warm-neutral side; warm/neutral texels must be
  // byte-identical so furnace and window structure survives untouched.
  let strongGreenLeft = 0;
  let warmChanged = 0;
  for (let i = 0; i + 2 < parsed.data.length; i += 4) {
    const r = parsed.data[i], g = parsed.data[i + 1], b = parsed.data[i + 2];
    if (g > Math.max(r, b) * 1.3) strongGreenLeft += 1;
    const br = before[i], bg = before[i + 1], bb = before[i + 2];
    if (bg <= Math.max(br, bb) && (r !== br || g !== bg || b !== bb)) warmChanged += 1;
  }
  assert.equal(strongGreenLeft, 0, 'green-dominant texels remain after the neutralize pass');
  assert.equal(warmChanged, 0, 'warm/neutral texels were altered');
});

test('neutralizeHdrGreenCast preserves luminance and rejects non-float data', () => {
  const fake = { image: { data: new Uint16Array(12), width: 2, height: 2 } };
  assert.equal(neutralizeHdrGreenCast(fake), null);
  // One green-dominant texel beside one warm texel.
  const tex = new THREE.DataTexture(
    new Float32Array([0.2, 0.9, 0.15, 1, 0.8, 0.5, 0.3, 1]),
    2, 1,
  );
  const lumBefore = 0.2126 * 0.2 + 0.7152 * 0.9 + 0.0722 * 0.15;
  const touched = neutralizeHdrGreenCast(tex);
  assert.equal(touched, 1);
  const d = tex.image.data;
  const lumAfter = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  assert.ok(Math.abs(lumAfter - lumBefore) < 1e-6, `luminance drifted ${lumBefore} -> ${lumAfter}`);
  assert.ok(d[1] <= Math.max(d[0], d[2]), 'green still dominant after neutralize');
  for (const [k, want] of [[4, 0.8], [5, 0.5], [6, 0.3]]) {
    assert.ok(Math.abs(d[k] - want) < 1e-7, `warm texel channel ${k} altered`);
  }
});

test('normalizeHdrMeanRadiance rejects non-float data and degenerate targets', () => {
  const fake = { image: { data: new Uint16Array(12), width: 2, height: 2 } };
  assert.equal(normalizeHdrMeanRadiance(fake, 1), null);
  const tex = new THREE.DataTexture(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]), 2, 1);
  assert.equal(normalizeHdrMeanRadiance(tex, 0), null);
  assert.equal(normalizeHdrMeanRadiance(tex, Number.NaN), null);
  const stats = normalizeHdrMeanRadiance(tex, 0.5);
  assert.equal(stats.scaleFactor, 0.5);
  assert.deepEqual([...tex.image.data.slice(0, 3)], [0.5, 0.5, 0.5]);
});

test('PMREM source priority: foundry > sector plate > emissive card rig', () => {
  const tex = { isTexture: true };
  assert.equal(resolveIblSource({ foundryTexture: tex, background: tex }), IBL_SOURCE_FOUNDRY);
  assert.equal(resolveIblSource({ foundryTexture: null, background: tex }), IBL_SOURCE_BACKGROUND);
  assert.equal(resolveIblSource({ foundryTexture: null, background: null }), IBL_SOURCE_REFLECTION_CARDS);
  assert.equal(resolveIblSource({}), IBL_SOURCE_REFLECTION_CARDS);
});

// --- baked IBL artifact (scripts/bake-foundry-ibl.mjs → .f32.bin + .f32.json) ---------------

const BAKED_BIN_PATH = resolve(REPO, 'assets/background/env/deep_space_2k.f32.bin');
const BAKED_MANIFEST_PATH = resolve(REPO, 'assets/background/env/deep_space_2k.f32.json');
const FOUNDRY_BIN_PATH = resolve(REPO, 'assets/background/env/industrial_workshop_foundry_2k.f32.bin');
const FOUNDRY_MANIFEST_PATH = resolve(REPO, 'assets/background/env/industrial_workshop_foundry_2k.f32.json');

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Serves the served URLs straight from disk — lets the baked load path run headless with its
// real fetch + sha256 verification intact.
function fileFetchImpl(url) {
  const path = resolve(REPO, String(url).replace(/^\//, ''));
  if (!existsSync(path)) return Promise.resolve({ ok: false, status: 404 });
  const bytes = readFileSync(path);
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(JSON.parse(bytes.toString('utf8'))),
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  });
}

// The bake contract: this recomputation IS the runtime algorithm (same HDRLoader decode, same
// exported transforms, same order) against the DEFAULT source the loader now serves. If the
// artifact ever stops matching it, the bake script's --check and this suite both fail.
function computeRuntimePixels() {
  return parseHdrFile(HDR_PATH).then((parsed) => {
    const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height);
    normalizeHdrMeanRadiance(texture, FOUNDRY_IBL_TARGET_MEAN_RADIANCE);
    neutralizeHdrGreenCast(texture);
    return { width: parsed.width, height: parsed.height, data: texture.image.data };
  });
}

test('baked default artifact + manifest exist and agree with each other', () => {
  assert.ok(existsSync(BAKED_BIN_PATH), 'deep_space_2k.f32.bin missing — run scripts/bake-foundry-ibl.mjs --source=deep_space_2k');
  assert.ok(existsSync(BAKED_MANIFEST_PATH), 'deep_space_2k.f32.json missing');
  const manifest = JSON.parse(readFileSync(BAKED_MANIFEST_PATH, 'utf8'));
  const payload = readFileSync(BAKED_BIN_PATH);
  assert.equal(manifest.schema, FOUNDRY_IBL_BAKED_SCHEMA);
  assert.equal(manifest.pixelFormat, 'float32-rgba');
  assert.equal(manifest.channels, 4);
  assert.equal(manifest.payloadBytes, payload.length);
  assert.equal(payload.length, manifest.width * manifest.height * 4 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(manifest.sha256, sha256Hex(payload), 'manifest sha256 does not match the payload');
  const hdrSha = sha256Hex(readFileSync(HDR_PATH));
  assert.equal(manifest.source.sha256, hdrSha, 'manifest does not record the .hdr it was baked from — stale artifact');
});

test('retired foundry artifact stays consistent with its own source', () => {
  assert.ok(existsSync(FOUNDRY_BIN_PATH) && existsSync(FOUNDRY_MANIFEST_PATH),
    'retired foundry baked artifact missing');
  const manifest = JSON.parse(readFileSync(FOUNDRY_MANIFEST_PATH, 'utf8'));
  const payload = readFileSync(FOUNDRY_BIN_PATH);
  assert.equal(manifest.sha256, sha256Hex(payload));
  assert.equal(manifest.source.sha256, sha256Hex(readFileSync(FOUNDRY_HDR_PATH)));
});

test('baked artifact bytes are identical to the runtime decode + transforms', async () => {
  const baked = readFileSync(BAKED_BIN_PATH);
  const runtime = await computeRuntimePixels();
  const runtimeBytes = Buffer.from(runtime.data.buffer, runtime.data.byteOffset, runtime.data.byteLength);
  assert.ok(baked.equals(runtimeBytes), 'baked .f32.bin differs from decode+normalize+neutralize — bake output must equal runtime output');
});

test('baked load path verifies sha256 and returns an identical DataTexture', async () => {
  const texture = await loadBakedFoundryIblTexture(THREE, { fetchImpl: fileFetchImpl });
  assert.ok(texture && texture.isTexture, 'baked path did not produce a texture');
  assert.equal(texture.type, THREE.FloatType);
  assert.equal(texture.image.width, 2048);
  assert.equal(texture.image.height, 1024);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.minFilter, THREE.LinearFilter);
  assert.equal(texture.mapping, THREE.EquirectangularReflectionMapping);
  // The runtime check must have run and stamped the texture as the verified baked value.
  assert.equal(texture.userData.foundryIblBaked.verified, true);
  const runtime = await computeRuntimePixels();
  const textureBytes = Buffer.from(texture.image.data.buffer, texture.image.data.byteOffset, texture.image.data.byteLength);
  const runtimeBytes = Buffer.from(runtime.data.buffer, runtime.data.byteOffset, runtime.data.byteLength);
  assert.ok(textureBytes.equals(runtimeBytes), 'baked texture pixels differ from runtime-computed pixels');
});

test('loadFoundryIblTexture prefers the verified bake and still lands identical pixels', async () => {
  const texture = await loadFoundryIblTexture(THREE, { fetchImpl: fileFetchImpl });
  assert.ok(texture && texture.isTexture, 'loadFoundryIblTexture returned no texture with the baked path available');
  assert.equal(texture.userData.foundryIblBaked.verified, true, 'baked fast path was not used');
  const runtime = await computeRuntimePixels();
  const textureBytes = Buffer.from(texture.image.data.buffer, texture.image.data.byteOffset, texture.image.data.byteLength);
  const runtimeBytes = Buffer.from(runtime.data.buffer, runtime.data.byteOffset, runtime.data.byteLength);
  assert.ok(textureBytes.equals(runtimeBytes));
});

test('baked path rejects a tampered manifest instead of trusting unverified pixels', async () => {
  const tamperedManifest = JSON.parse(readFileSync(BAKED_MANIFEST_PATH, 'utf8'));
  tamperedManifest.sha256 = '0'.repeat(64);
  const fetchImpl = (url) => {
    if (String(url).endsWith('.f32.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(tamperedManifest), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }
    return fileFetchImpl(url);
  };
  const texture = await loadBakedFoundryIblTexture(THREE, { fetchImpl });
  assert.equal(texture, null, 'sha mismatch must reject the baked payload');
  const missing = await loadBakedFoundryIblTexture(THREE, { fetchImpl: () => Promise.resolve({ ok: false, status: 404 }) });
  assert.equal(missing, null, 'missing artifact must fall back, not fabricate a texture');
});

test('renderer wires the foundry as env input only — the visible sky is never reassigned', () => {
  const src = readFileSync(RENDERER_PATH, 'utf8');
  // Source selection runs through the shared resolver with the foundry texture.
  assert.match(src, /resolveIblSource\(\{\s*foundryTexture:\s*this\._foundryEnvTexture,\s*background:\s*scene\.background,\s*\}\)/);
  // Load once at init, promote on unfreeze, and release on dispose — the full lifecycle.
  assert.match(src, /this\._loadFoundryIbl\(\);/);
  assert.match(src, /this\._envMapSource !== IBL_SOURCE_FOUNDRY\)\s*\{\s*this\._bakeEnv\(\{ force: true \}\)/);
  assert.match(src, /invokeRendererDisposer\(owner\._foundryEnvTexture/);
  // The contract's failure mode: nothing may draw the foundry as the visible sky.
  assert.doesNotMatch(src, /scene\.background\s*=\s*[^;]*foundry/i);
  const module = readFileSync(resolve(REPO, 'src/render/foundryEnvironment.js'), 'utf8');
  assert.doesNotMatch(module, /scene\.background\s*=/);
});

// The PMREM output texture's cubeUV height is part of every lit material's shader program key
// (envMapCubeUVHeight). fromEquirectangular sizes the bake from the input width, so a bake source
// swap mid-flight — foundry promotion on unfreeze, or a re-bake after context restore — would
// re-key and re-link every standard material inside a presented pass. All sources must go through
// a fixed-size scene capture so the key never moves when the env texture is upgraded.
test('every PMREM bake pins one cube size so env swaps never rekey lit programs', () => {
  // 512 is the card rig's tuned size: SPACE_REFLECTION_PMREM_SIGMA_RADIANS sits just under the
  // 20-tap blur ceiling at 512px — a larger pin clips the kernel and warns on every bake.
  assert.equal(IBL_PMREM_CUBE_SIZE, 512);
  assert.equal(IBL_PMREM_CUBE_SIZE, SPACE_REFLECTION_PMREM_CUBE_SIZE,
    'the IBL pin and the card-rig pin must resolve to the same cube size');
  const src = readFileSync(RENDERER_PATH, 'utf8');
  assert.doesNotMatch(src, /pmrem\.fromEquirectangular\(/,
    'equirect bakes must not size the PMREM target from the input width');
  const bakes = src.match(
    /pmrem\.fromScene\([^;]*size:\s*(?:IBL_PMREM_CUBE_SIZE|SPACE_REFLECTION_PMREM_CUBE_SIZE)/gs,
  ) || [];
  assert.equal(bakes.length, 2, 'both the equirect wrap scene and the card rig must bake pinned');
});
