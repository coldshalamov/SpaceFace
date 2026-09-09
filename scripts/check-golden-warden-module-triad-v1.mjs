#!/usr/bin/env node
// Strict structural/PBR/LOD contract for the scratch Warden module triad candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

const ROOT = resolve('.');
const candidateRoot = resolve(process.argv[2] || '.devshots/graphics/warden-module-triad-v1/candidate');
const reportPath = resolve(process.argv[3] || '.devshots/graphics/warden-module-triad-v1/candidate/contract-check.json');
const spec = JSON.parse(readFileSync(resolve('assets/ships/parts/scripts/golden_warden_module_triad_v1.spec.json'), 'utf8'));
const inputRoot = resolve('.devshots/graphics/warden-module-triad-v1/input');
const assets = {
  cockpit_recessed: {
    requiredRoles: ['VARDEN_ARMOR', 'VARDEN_ALLOY', 'DARK_COMPOSITE', 'COCKPIT_GLASS', 'RECESSED_MACHINERY', 'IDENTITY_MARKING', 'POWERED_APERTURE'],
    hooks: { HOOK_Emissive: [0, 0, 0] },
    bounds: { x: [5.69, 5.71], yMax: 0.9, zMax: 1.78 },
    lod0Draws: 7,
  },
  engine_plasma_ring: {
    requiredRoles: ['VARDEN_ALLOY', 'DARK_COMPOSITE', 'ENGINE_CERAMIC', 'HEAT_ALLOY', 'RECESSED_MACHINERY', 'IDENTITY_MARKING', 'POWERED_APERTURE'],
    hooks: { HOOK_DRIVE_CORE: [-0.05, 0, 0], HOOK_DRIVE_FAN: [0.25, 0, 0], HOOK_DRIVE_PLUME: [-0.22, 0, 0] },
    bounds: { x: [2.77, 2.785], yMax: 1.23, zMax: 1.23 },
    lod0Draws: 7,
  },
  fin_stabilator: {
    requiredRoles: ['VARDEN_ARMOR', 'VARDEN_ALLOY', 'DARK_COMPOSITE', 'RADIATOR_LAMINATE', 'RECESSED_MACHINERY', 'IDENTITY_MARKING'],
    hooks: { HOOK_Emissive: [0, 0, 0] },
    bounds: { x: [4.79, 4.81], yMax: 0.58, zMax: 1.62 },
    lod0Draws: 6,
  },
};

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const report = { schema: 'spaceface.goldenWardenModuleTriad.contractCheck.v1', ok: true, inputs: {}, assets: {}, compressed: {} };
for (const [asset, rules] of Object.entries(assets)) {
  const expectedInput = spec.inputs[asset];
  const inputPath = resolve(inputRoot, expectedInput.file);
  const inputBytes = readFileSync(inputPath);
  const inputReceipt = { path: inputPath, bytes: inputBytes.length, sha256: sha256(inputBytes) };
  assert.equal(inputReceipt.bytes, expectedInput.bytes, `${asset}: input snapshot bytes drift`);
  assert.equal(inputReceipt.sha256, expectedInput.sha256, `${asset}: input snapshot hash drift`);
  report.inputs[asset] = inputReceipt;

  const path = resolve(candidateRoot, `${asset}_golden_v1.glb`);
  const document = await io.read(path);
  const root = document.getRoot();
  const nodes = root.listNodes();
  const nodeNames = new Set(nodes.map((node) => node.getName()));
  const materials = root.listMaterials();
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const bounds = getBounds(root.listScenes()[0]);
  const size = bounds.max.map((value, index) => value - bounds.min[index]);
  assert(size[0] >= rules.bounds.x[0] && size[0] <= rules.bounds.x[1], `${asset}: X contract drift ${size[0]}`);
  assert(size[1] <= rules.bounds.yMax, `${asset}: vertical envelope too large ${size[1]}`);
  assert(size[2] <= rules.bounds.zMax, `${asset}: lateral envelope too large ${size[2]}`);
  assert(nodeNames.has(asset), `${asset}: missing exact root node`);
  for (const lod of [0, 1, 2]) assert(nodes.some((node) => node.getName().startsWith(`LOD${lod}_`)), `${asset}: missing LOD${lod}`);
  if (asset === 'engine_plasma_ring') assert(nodeNames.has('LOD0_ENGINE_PLASMA_RING_MAIN'), 'engine: missing runtime main node');
  for (const [name, expected] of Object.entries(rules.hooks)) {
    const node = nodes.find((entry) => entry.getName() === name);
    assert(node, `${asset}: missing semantic ${name}`);
    assert(vectorNear(node.getWorldTranslation(), expected), `${asset}: ${name} transform drift ${node.getWorldTranslation()}`);
  }
  for (const role of rules.requiredRoles) {
    const material = materials.find((entry) => entry.getName() === `SF_WARDEN_V1_${role}`);
    assert(material, `${asset}: missing functional material ${role}`);
    assert(material.getBaseColorTexture(), `${asset}/${role}: missing base color`);
    assert(material.getNormalTexture(), `${asset}/${role}: missing normal`);
    assert(material.getMetallicRoughnessTexture(), `${asset}/${role}: missing ORM`);
    assert(material.getOcclusionTexture(), `${asset}/${role}: missing AO binding`);
    assert.equal(material.getAlphaMode(), 'OPAQUE', `${asset}/${role}: unnecessary transparency`);
    const orm = material.getMetallicRoughnessTexture();
    assert.equal(orm.getMimeType(), 'image/png', `${asset}/${role}: raw ORM must remain PNG`);
    const range = channelRange(PNG.sync.read(Buffer.from(orm.getImage())), 1);
    assert(range.max - range.min >= 20, `${asset}/${role}: roughness effectively constant ${JSON.stringify(range)}`);
    if (role === 'POWERED_APERTURE') assert(material.getEmissiveTexture(), `${asset}: powered aperture missing emissive mask`);
  }
  assert(materials.every((material) => /^SF_WARDEN_V1_/.test(material.getName())), `${asset}: generic donor material remains`);
  assert(primitives.length > 0, `${asset}: no primitives`);
  assert(primitives.every((primitive) => primitive.getAttribute('TEXCOORD_0')), `${asset}: UV0 missing`);
  assert(primitives.every((primitive) => primitive.getAttribute('TANGENT')), `${asset}: tangent missing`);
  assert(nodes.filter((node) => node.getMesh()).every((node) => node.getScale().every((value) => Math.abs(value - 1) < 1e-6)), `${asset}: unapplied mesh scale`);
  const lod0Draws = nodes.filter((node) => node.getMesh() && inheritedLod(node) === 0).length;
  assert.equal(lod0Draws, rules.lod0Draws, `${asset}: unexpected active LOD0 draw count`);
  report.assets[asset] = {
    candidate: receipt(path),
    bounds: { min: rounded(bounds.min), max: rounded(bounds.max), size: rounded(size) },
    counts: { nodes: nodes.length, primitives: primitives.length, lod0Draws, materials: materials.length, textures: root.listTextures().length, triangles: primitives.reduce((sum, primitive) => sum + triangleCount(primitive), 0) },
    semantics: Object.keys(rules.hooks),
    roles: rules.requiredRoles,
    allUv0: true,
    allTangents: true,
    allMeshScalesApplied: true,
    transparentMaterials: 0,
  };

  const compressedPath = resolve(candidateRoot, `${asset}_golden_v1_ktx2.glb`);
  const compressedDocument = await io.read(compressedPath);
  const compressedRoot = compressedDocument.getRoot();
  const compressedTextures = compressedRoot.listTextures();
  assert(compressedTextures.length > 0, `${asset}: compressed candidate has no textures`);
  assert(compressedTextures.every((texture) => texture.getMimeType() === 'image/ktx2'), `${asset}: non-KTX2 texture remains`);
  report.compressed[asset] = { candidate: receipt(compressedPath), textures: compressedTextures.length, allKtx2: true };
}
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function inheritedLod(node) {
  for (let current = node; current; current = current.getParentNode()) {
    const match = (current.getName() || '').match(/^LOD(\d+)_/);
    if (match) return Number(match[1]);
  }
  return null;
}

function triangleCount(primitive) {
  const indices = primitive.getIndices();
  return indices ? Math.floor(indices.getCount() / 3) : Math.floor((primitive.getAttribute('POSITION')?.getCount() || 0) / 3);
}

function vectorNear(actual, expected) {
  return expected.every((value, index) => Math.abs(actual[index] - value) <= 1e-6);
}

function channelRange(png, channel) {
  let min = 255;
  let max = 0;
  for (let offset = channel; offset < png.data.length; offset += 4) {
    min = Math.min(min, png.data[offset]);
    max = Math.max(max, png.data[offset]);
  }
  return { min, max };
}

function receipt(path) {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

function rounded(values) {
  return Array.from(values).map((value) => Math.round(value * 1e6) / 1e6);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}
