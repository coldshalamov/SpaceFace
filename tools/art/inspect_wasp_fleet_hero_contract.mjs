#!/usr/bin/env node
// Structural/material/socket audit for the immutable Wasp family or its scratch candidate.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const args = parseArgs(process.argv.slice(2));
const inputs = String(args.input || '').split(',').map((value) => resolve(value.trim())).filter(Boolean);
if (!inputs.length) throw new Error('--input requires a comma-separated GLB list');
const output = resolve(args.out || '.devshots/graphics/wasp-fleet-hero-v1/source-contract-audit.json');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const assets = [];
for (const path of inputs) {
  const bytes = readFileSync(path);
  const document = await io.read(path);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  const bounds = getBounds(scene);
  const nodes = root.listNodes();
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const textures = root.listTextures();
  const sockets = nodes.filter((node) => /^SOCKET_/.test(node.getName())).map((node) => ({
    name: node.getName(), translation: round(node.getWorldTranslation()),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const collision = nodes.filter((node) => /collision/i.test(node.getName())).map((node) => ({
    name: node.getName(), mesh: node.getMesh()?.getName() || null,
    translation: round(node.getWorldTranslation()),
    extras: node.getExtras(),
  }));
  assets.push({
    path,
    bytes: bytes.length,
    sha256: sha256(bytes),
    bounds: {
      min: round(bounds.min), max: round(bounds.max),
      size: round(bounds.max.map((value, index) => value - bounds.min[index])),
      center: round(bounds.max.map((value, index) => (value + bounds.min[index]) * 0.5)),
    },
    scenes: root.listScenes().map((entry) => entry.getName()),
    assetRoots: nodes.filter((node) => /WASP_PRODUCTION_V1.*ROOT/i.test(node.getName())).map((node) => ({
      name: node.getName(), extras: node.getExtras(),
    })),
    counts: {
      nodes: nodes.length,
      meshes: root.listMeshes().length,
      primitives: primitives.length,
      triangles: primitives.reduce((sum, primitive) => sum + triangleCount(primitive), 0),
      materials: root.listMaterials().length,
      textures: textures.length,
      textureDecodedBytes: textures.reduce((sum, texture) => {
        const size = texture.getSize();
        return sum + (size ? size[0] * size[1] * 4 : 0);
      }, 0),
    },
    materials: root.listMaterials().map((material) => ({
      name: material.getName(),
      alphaMode: material.getAlphaMode(),
      baseColorFactor: round(material.getBaseColorFactor()),
      roughnessFactor: material.getRoughnessFactor(),
      metallicFactor: material.getMetallicFactor(),
      baseColorTexture: material.getBaseColorTexture()?.getName() || null,
      normalTexture: material.getNormalTexture()?.getName() || null,
      ormTexture: material.getMetallicRoughnessTexture()?.getName() || null,
      aoTexture: material.getOcclusionTexture()?.getName() || null,
      emissiveTexture: material.getEmissiveTexture()?.getName() || null,
      extras: material.getExtras(),
    })),
    textureReceipts: textures.map((texture) => ({
      name: texture.getName(), mimeType: texture.getMimeType(), size: texture.getSize(),
      bytes: texture.getImage()?.byteLength || 0,
      sha256: texture.getImage() ? sha256(texture.getImage()) : null,
    })),
    primitives: nodes.filter((node) => node.getMesh()).map((node) => ({
      node: node.getName(), mesh: node.getMesh().getName(),
      triangles: node.getMesh().listPrimitives().reduce((sum, primitive) => sum + triangleCount(primitive), 0),
      materials: [...new Set(node.getMesh().listPrimitives().map((primitive) => primitive.getMaterial()?.getName() || null))],
      attributes: [...new Set(node.getMesh().listPrimitives().flatMap((primitive) => primitive.listSemantics()))].sort(),
      visibleContract: !/collision/i.test(node.getName()),
    })),
    sockets,
    collision,
  });
}
const report = { schema: 'spaceface.waspFleetHero.contractAudit.v1', assets };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, output, assets: assets.length }, null, 2)}\n`);

function triangleCount(primitive) {
  const indices = primitive.getIndices();
  return indices ? Math.floor(indices.getCount() / 3) : Math.floor((primitive.getAttribute('POSITION')?.getCount() || 0) / 3);
}

function round(values) {
  return Array.from(values || [], (value) => Number(Number(value).toFixed(6)));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
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
