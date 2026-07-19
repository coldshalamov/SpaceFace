#!/usr/bin/env node
// Read-only contract inspector for scratch Warden donor snapshots and remaster candidates.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const inputs = String(args.input || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => resolve(ROOT, value));
const output = resolve(ROOT, args.out || '.devshots/graphics/warden-module-triad-v1/contract-audit.json');
if (!inputs.length) throw new Error('--input requires a comma-separated GLB list');
for (const input of inputs) if (!existsSync(input)) throw new Error(`missing input: ${input}`);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const assets = [];
for (const input of inputs) {
  const document = await io.read(input);
  const root = document.getRoot();
  const scenes = root.listScenes();
  const bounds = scenes.length ? getBounds(scenes[0]) : { min: [0, 0, 0], max: [0, 0, 0] };
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
  assets.push({
    path: normalize(relative(ROOT, input)),
    bytes: readFileSync(input).length,
    sha256: sha256(input),
    bounds: {
      min: rounded(bounds.min),
      max: rounded(bounds.max),
      size: rounded(bounds.max.map((value, index) => value - bounds.min[index])),
    },
    counts: {
      scenes: scenes.length,
      nodes: nodes.length,
      meshes: meshes.length,
      primitives: primitives.length,
      materials: root.listMaterials().length,
      textures: root.listTextures().length,
      triangles: primitives.reduce((sum, primitive) => sum + triangleCount(primitive), 0),
      uv0: primitives.filter((primitive) => primitive.getAttribute('TEXCOORD_0')).length,
      tangents: primitives.filter((primitive) => primitive.getAttribute('TANGENT')).length,
    },
    semanticNodes: nodes
      .filter((node) => /^(?:HOOK|MOUNT|SOCKET|LOD|COLLISION|ROOT)/i.test(node.getName() || ''))
      .map((node) => ({
        name: node.getName(),
        parent: node.getParentNode()?.getName() || node.getParent()?.getName?.() || null,
        translation: rounded(node.getTranslation()),
        rotation: rounded(node.getRotation()),
        scale: rounded(node.getScale()),
        worldTranslation: rounded(node.getWorldTranslation()),
        mesh: node.getMesh()?.getName() || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    meshNodes: nodes
      .filter((node) => node.getMesh())
      .map((node) => ({
        name: node.getName(),
        mesh: node.getMesh()?.getName() || null,
        translation: rounded(node.getTranslation()),
        scale: rounded(node.getScale()),
      })),
  });
}
const report = { schema: 'spaceface.wardenModuleContractAudit.v1', assets };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, output, assets: assets.length }, null, 2)}\n`);

function triangleCount(primitive) {
  const indices = primitive.getIndices();
  if (indices) return Math.floor(indices.getCount() / 3);
  return Math.floor((primitive.getAttribute('POSITION')?.getCount() || 0) / 3);
}

function rounded(values) {
  return Array.from(values || []).map((value) => Math.round(Number(value) * 1e6) / 1e6);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function normalize(path) {
  return path.replaceAll('\\', '/');
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
