import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  FOUNDRY_IBL_TARGET_MEAN_RADIANCE,
  FOUNDRY_IBL_URL,
  IBL_SOURCE_BACKGROUND,
  IBL_SOURCE_FOUNDRY,
  IBL_SOURCE_REFLECTION_CARDS,
  normalizeHdrMeanRadiance,
  resolveIblSource,
} from '../src/render/foundryEnvironment.js';

// AQ-LIGHT — the industrial_workshop_foundry HDRI is the image-based light for authored PBR
// surfaces (paint, rubber, bare metal separate under one industrial light). The visible sky
// stays the sector plate: the texture feeds scene.environment only and is never assigned to
// scene.background. These tests pin the promoted asset, the luminance normalization that keeps
// muzzle/engine emissives dominant, the PMREM source priority, and the renderer's lifecycle
// wiring (load → bake → promote on unfreeze → dispose).

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HDR_PATH = resolve(REPO, 'assets/background/env/industrial_workshop_foundry_2k.hdr');
const RENDERER_PATH = resolve(REPO, 'src/render/renderer.js');

function parseFoundryHdr() {
  // HDRLoader.parse works headless on the file bytes — no fetch needed to prove the data.
  return import('three/addons/loaders/HDRLoader.js').then(({ HDRLoader }) => {
    const loader = new HDRLoader();
    loader.setDataType(THREE.FloatType);
    const buf = readFileSync(HDR_PATH);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return loader.parse(bytes);
  });
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

test('foundry HDRI is promoted into the runtime env dir with RGBE data and provenance', () => {
  assert.ok(existsSync(HDR_PATH), 'assets/background/env/industrial_workshop_foundry_2k.hdr missing');
  const head = readFileSync(HDR_PATH).subarray(0, 16).toString('latin1');
  assert.match(head, /^#\?/, 'HDR file lacks the Radiance RGBE magic header');
  assert.ok(
    existsSync(resolve(REPO, 'assets/background/env/PROVENANCE.md')),
    'env provenance record missing',
  );
  // A sibling of deep-sky: the sector plate manifest/registry must stay untouched.
  assert.equal(FOUNDRY_IBL_URL, '/assets/background/env/industrial_workshop_foundry_2k.hdr');
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
