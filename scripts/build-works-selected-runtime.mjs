// Build the selected Works runtime GLB from an authored source kit (PQ-131.10).
//
// The Works live registers are LOD0/work and LOD1/site only — LOD2 stays in authoring and
// evidence output and must never become a live fallback. This tool strips the LOD2 registers
// from a copy of the source GLB JSON chunk (bin chunk untouched, mirroring the proven
// selected-runtime builds for the Rover through cargo port), stamps the selected-runtime
// metadata, and writes the parts path the release builder consumes.
//
// Usage: node scripts/build-works-selected-runtime.mjs --source <kit.glb> --out <parts.glb>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { source: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i];
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  if (!args.source || !args.out) {
    throw new Error('usage: build-works-selected-runtime.mjs --source <kit.glb> --out <parts.glb>');
  }
  return args;
}

function readGltf(path) {
  const payload = readFileSync(path);
  if (payload.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${path} is not a GLB`);
  const jsonLength = payload.readUInt32LE(12);
  return {
    payload,
    jsonLength,
    gltf: JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf8')),
  };
}

function stripLod2(gltf) {
  const lod2NodeIdx = [];
  const lod2MeshIdx = new Set();
  gltf.nodes.forEach((node, index) => {
    if (/^LOD2(?:_|$)/u.test(node.name || '')) {
      lod2NodeIdx.push(index);
      if (node.mesh !== undefined) lod2MeshIdx.add(node.mesh);
    }
  });
  if (!lod2NodeIdx.length) throw new Error('source kit has no LOD2 nodes to strip');
  const nodeDropped = new Set(lod2NodeIdx);
  const nodeRemap = new Map();
  let nextNode = 0;
  gltf.nodes.forEach((_, index) => {
    if (!nodeDropped.has(index)) nodeRemap.set(index, nextNode++);
  });
  const meshRemap = new Map();
  let nextMesh = 0;
  gltf.meshes.forEach((_, index) => {
    if (!lod2MeshIdx.has(index)) meshRemap.set(index, nextMesh++);
  });
  const remapChildren = (children) => {
    if (!Array.isArray(children)) return children;
    const mapped = children
      .filter((child) => !nodeDropped.has(child))
      .map((child) => nodeRemap.get(child));
    return mapped;
  };
  const nodes = gltf.nodes
    .filter((_, index) => !nodeDropped.has(index))
    .map((node) => {
      const next = { ...node };
      if (next.children) next.children = remapChildren(next.children);
      if (next.mesh !== undefined) {
        if (!meshRemap.has(next.mesh)) throw new Error(`node ${next.name} meshes into a dropped LOD2 mesh`);
        next.mesh = meshRemap.get(next.mesh);
      }
      return next;
    });
  const meshes = gltf.meshes.filter((_, index) => !lod2MeshIdx.has(index));
  const sceneAsset = gltf.scenes[0]?.extras?.spacefaceAsset || {};
  const selectedAsset = {
    ...sceneAsset,
    deliverableRole: 'selected_runtime',
    wiringStatus: 'selected_runtime_lod2_stripped',
    lods: ['lod0', 'lod1'],
    lodTriangles: { lod0: sceneAsset.lodTriangles?.lod0, lod1: sceneAsset.lodTriangles?.lod1 },
  };
  const scenes = gltf.scenes.map((scene, index) => ({
    ...scene,
    nodes: remapChildren(scene.nodes),
    extras: index === 0
      ? { ...(scene.extras || {}), spacefaceAsset: selectedAsset }
      : scene.extras,
  }));
  return { nodes, meshes, scenes, selectedAsset, strippedNodes: lod2NodeIdx.length, strippedMeshes: lod2MeshIdx.size };
}

const args = parseArgs(process.argv.slice(2));
const { payload, jsonLength, gltf } = readGltf(resolve(ROOT, args.source));

const { nodes, meshes, scenes, selectedAsset, strippedNodes, strippedMeshes } = stripLod2(gltf);

const variantIds = selectedAsset.variants || [];
if (!variantIds.length) throw new Error('source kit scene extras carry no variants list');

const assetStamp = {
  contractVersion: selectedAsset.contractVersion || 1,
  assetId: selectedAsset.assetId,
  partId: selectedAsset.partId,
  liveId: selectedAsset.liveId,
  slot: selectedAsset.slot,
  exportedLods: ['lod0', 'lod1'],
};

const out = {
  ...gltf,
  asset: {
    ...gltf.asset,
    extras: {
      ...(gltf.asset.extras || {}),
      spacefaceAsset: assetStamp,
    },
  },
  scene: gltf.scene,
  scenes,
  nodes,
  meshes,
};
// The stripped runtime renumbers nodes; the sheet-layout root is the scene's single root.
if (out.scenes.length !== 1 || out.scenes[0].nodes.length !== 1) {
  throw new Error('unexpected kit scene shape: expected one root under one scene');
}

const jsonChunk = Buffer.from(JSON.stringify(out), 'utf8');
const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
const binChunk = payload.subarray(20 + jsonLength + 8);
const binPad = (4 - (binChunk.length % 4)) % 4;
const total = 12 + 8 + jsonChunk.length + jsonPad + 8 + binChunk.length + binPad;
const glb = Buffer.alloc(total);
glb.write('glTF', 0, 'ascii');
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(total, 8);
glb.writeUInt32LE(jsonChunk.length + jsonPad, 12);
glb.write('JSON', 16, 'ascii');
jsonChunk.copy(glb, 20);
if (jsonPad) glb.write(' ', 20 + jsonChunk.length);
const binHeaderAt = 20 + jsonChunk.length + jsonPad;
glb.writeUInt32LE(binChunk.length + binPad, binHeaderAt);
glb.write('BIN\0', binHeaderAt + 4, 'ascii');
binChunk.copy(glb, binHeaderAt + 8);
if (binPad) glb.write(' ', binHeaderAt + 8 + binChunk.length);

writeFileSync(resolve(ROOT, args.out), glb);
console.log(`[works-selected-runtime] ${args.source} -> ${args.out}`);
console.log(`  stripped ${strippedNodes} LOD2 nodes / ${strippedMeshes} meshes; variants: ${variantIds.length}`);
console.log(`  bytes ${payload.length} -> ${glb.length}`);
