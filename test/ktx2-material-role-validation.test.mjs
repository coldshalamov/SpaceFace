import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  expectedKtx2ProfileForRole,
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('material roles require explicit codec and transfer-function profiles', () => {
  assert.equal(expectedKtx2ProfileForRole('baseColorTexture').profile, 'ETC1S-sRGB');
  assert.equal(expectedKtx2ProfileForRole('normalTexture').profile, 'UASTC-linear');
  assert.equal(expectedKtx2ProfileForRole('metallicRoughnessTexture').profile, 'ETC1S-linear');
  assert.equal(expectedKtx2ProfileForRole('occlusionTexture').profile, 'ETC1S-linear');
  assert.throws(() => expectedKtx2ProfileForRole('unknownTexture'), /unsupported/);
});

test('a published hull has role-correct KTX2 descriptors and complete mip chains', () => {
  const parsed = parseReleaseGlbPayload(
    readFileSync(resolve(ROOT, 'assets/ships/release/parts/hulls/hull_fighter.glb')),
    'fighter release fixture',
  );
  const report = validateKtx2MaterialRolePayloads(
    parsed.gltf,
    parsed.binary,
    'fighter release fixture',
  );
  assert.equal(report.textureCount, parsed.gltf.textures.length);
  assert.ok(report.textures.every((texture) => texture.levels > 1));
  assert.ok(report.textures.some((texture) => texture.profile === 'ETC1S-sRGB'));
  assert.ok(report.textures.some((texture) => texture.profile === 'UASTC-linear'));
  assert.ok(report.textures.some((texture) => texture.profile === 'ETC1S-linear'));
});
