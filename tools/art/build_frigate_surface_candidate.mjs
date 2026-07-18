#!/usr/bin/env node
// Scratch-only KTX2 + meshopt packaging for the hull_frigate golden surface candidate.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const input = resolve(ROOT, args.input || '.devshots/graphics/fleet-frigate-golden-v2/candidate/hull_frigate_golden_v2.glb');
const output = resolve(ROOT, args.output || '.devshots/graphics/fleet-frigate-golden-v2/candidate/hull_frigate_golden_v2_ktx2.glb');
const reportPath = resolve(ROOT, args.report || '.devshots/graphics/fleet-frigate-golden-v2/candidate/ktx2-build-report.json');
const scratchRoot = resolve(ROOT, '.devshots/graphics/fleet-frigate-golden-v2');
if (!existsSync(input)) throw new Error(`missing input candidate: ${input}`);
if (!isWithin(output, scratchRoot) || !isWithin(reportPath, scratchRoot)) {
  throw new Error('scratch candidate builder refuses production/release outputs');
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const document = await io.read(input);
await document.transform(
  ktx2({
    slots: /^(baseColorTexture|emissiveTexture)$/,
    imageDecoder: decodePng,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
  }),
  ktx2({
    slots: /^(normalTexture|clearcoatNormalTexture)$/,
    imageDecoder: decodePng,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isNormalMap: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  }),
  ktx2({
    slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,
    imageDecoder: decodePng,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  }),
  meshopt({
    encoder: MeshoptEncoder,
    level: 'high',
    quantizePosition: 14,
    quantizeNormal: 10,
    quantizeTexcoord: 12,
    quantizeColor: 8,
    quantizeWeight: 8,
    quantizeGeneric: 12,
  }),
);
await mkdir(dirname(output), { recursive: true });
await io.write(output, document);
const root = document.getRoot();
const textures = root.listTextures();
const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
const report = {
  schema: 'spaceface.goldenFrigateSurface.ktx2Build.v1',
  status: 'scratch_candidate_generated',
  input: receipt(input),
  output: receipt(output),
  textures: {
    count: textures.length,
    ktx2: textures.filter((texture) => texture.getMimeType() === 'image/ktx2').length,
    names: textures.map((texture) => texture.getName()),
  },
  geometry: {
    primitives: primitives.length,
    primitivesWithTangents: primitives.filter((primitive) => primitive.getAttribute('TANGENT')).length,
    primitivesWithUv0: primitives.filter((primitive) => primitive.getAttribute('TEXCOORD_0')).length,
  },
};
if (report.textures.count === 0 || report.textures.ktx2 !== report.textures.count) throw new Error('not all textures converted to KTX2');
if (report.geometry.primitivesWithTangents !== report.geometry.primitives) throw new Error('candidate lost tangent attributes');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, output }, null, 2)}\n`);

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
}

function receipt(path) {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}

function isWithin(path, parent) {
  const normalized = resolve(path).toLowerCase();
  const normalizedParent = `${resolve(parent).toLowerCase()}\\`;
  return normalized === resolve(parent).toLowerCase() || normalized.startsWith(normalizedParent);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}
