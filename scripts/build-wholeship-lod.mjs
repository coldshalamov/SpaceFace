// AQ-LOD — build one separate-file whole-ship LOD sibling with meshoptimizer.
//
// The whole-ship LOD path (src/render/wholeShipLodPolicy.js + WHOLE_SHIP_LOD_FAMILY_* maps in
// src/render/partsLibrary.js) selects a different GLB per projected-size tier. Each sibling file
// keeps the source conventions: LOD0_* mesh-node names (the file name carries the tier), SOCKET_*
// marker nodes, an exact COLLISION_HULL helper mesh, the spacefaceAsset scene extras, and a
// <SHIP>_LOD<n>_ROOT scene root.
//
// Simplification runs through glTF-Transform + meshoptimizer: weld, then simplify with locked
// topological borders and a small error bound — a far ship stays that ship, minus the fasteners.
// Fleet sources are vertex soups (each triangle carries its own attribute seam copies, ~4x
// position duplication), so a bitwise weld alone leaves the simplifier no topology to collapse.
// The simplify step therefore welds positions first (meshopt generatePositionRemap), simplifies
// the welded topology, and translates surviving indices back to one canonical attribute copy per
// position. Do not use meshopt_simplifySloppy: it merges features and destroys silhouette
// identity.
//
// Usage:
//   node scripts/build-wholeship-lod.mjs \
//     --source assets/ships/parts/wholeships/ranger_production_v1.glb \
//     --output assets/ships/parts/wholeships/ranger_production_v1_lod1.glb \
//     --level lod1 --ratio 0.45 --error 0.001

import { rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = { ratio: null, error: null, level: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value.`);
      return value;
    };
    if (arg === '--source') options.source = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--level') options.level = next();
    else if (arg === '--ratio') options.ratio = Number(next());
    else if (arg === '--error') options.error = Number(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

const LEVEL_DEFAULTS = Object.freeze({
  lod1: Object.freeze({ ratio: 0.45, error: 0.001 }),
  lod2: Object.freeze({ ratio: 0.2, error: 0.005 }),
});

function countTriangles(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const positions = prim.getAttribute('POSITION');
      triangles += indices ? indices.getCount() / 3 : (positions ? positions.getCount() / 3 : 0);
    }
  }
  return Math.round(triangles);
}

/**
 * Weld positions, simplify the welded topology, and translate the result back onto the
 * primitive's own vertex buffer so one attribute copy survives per position.
 * @returns {{ sourceTris:number, outputTris:number, maxError:number }}
 */
function simplifyPrimitivePositions(prim, ratio, maxError) {
  const position = prim.getAttribute('POSITION');
  if (!position) return { sourceTris: 0, outputTris: 0, maxError: 0 };
  const sourcePositions = position.getArray();
  if (!(sourcePositions instanceof Float32Array)) {
    throw new Error('simplify: POSITION must be float32 (dequantize the source first).');
  }
  const sourceIndices = prim.getIndices();
  const indexArray = sourceIndices
    ? sourceIndices.getArray()
    : Uint32Array.from({ length: position.getCount() }, (_, i) => i);
  const sourceTris = indexArray.length / 3;
  if (sourceTris === 0) return { sourceTris: 0, outputTris: 0, maxError: 0 };

  // (1) Position weld: every vertex gets the index of the first vertex sharing its position.
  const remap = MeshoptSimplifier.generatePositionRemap(sourcePositions, 3);
  const canonicalToWelded = new Map();
  const weldedPositions = [];
  const representative = []; // welded index -> original vertex index (one attribute copy)
  for (let i = 0; i < remap.length; i++) {
    const canonical = remap[i];
    if (!canonicalToWelded.has(canonical)) {
      canonicalToWelded.set(canonical, representative.length);
      representative.push(i);
      weldedPositions.push(sourcePositions[i * 3], sourcePositions[i * 3 + 1], sourcePositions[i * 3 + 2]);
    }
  }
  const weldedIndex = new Uint32Array(indexArray.length);
  for (let i = 0; i < indexArray.length; i++) {
    weldedIndex[i] = canonicalToWelded.get(remap[indexArray[i]]);
  }

  // (2) Simplify the welded topology; borders locked, small error bound.
  const targetCount = Math.max(3, Math.floor((sourceTris * ratio) / 3) * 3);
  const [simplified, achievedError] = MeshoptSimplifier.simplify(
    weldedIndex,
    Float32Array.from(weldedPositions),
    3,
    Math.min(targetCount, indexArray.length),
    maxError,
    ['LockBorder'],
  );

  // (3) Translate back: result references welded verts; each keeps its canonical attribute copy.
  const outputIndices = new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    outputIndices[i] = representative[simplified[i]];
  }
  const document = Document.fromGraph(prim.getGraph());
  prim.setIndices(document.createAccessor()
    .setType('SCALAR')
    .setArray(outputIndices));
  compactPrimitive(prim);
  return { sourceTris, outputTris: outputIndices.length / 3, maxError: achievedError };
}

function usage() {
  console.log([
    'Usage: node scripts/build-wholeship-lod.mjs --source <glb> --output <glb> --level lod1|lod2',
    '          [--ratio N] [--error N]',
    '',
    '  --source  Whole-ship LOD0 source GLB under assets/ships/parts/wholeships/.',
    '  --output  Sibling LOD file to write (same directory, *_lod1.glb / *_lod2.glb).',
    '  --level   Target tier: lod1 (default ratio 0.45) or lod2 (default ratio 0.2).',
    '  --ratio   Fraction of triangles to aim for; meshopt stops early if --error binds first.',
    '  --error   Max deviation as a fraction of mesh radius (default 0.001 — small).',
  ].join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.source || !options.output || !options.level) {
    usage();
    throw new Error('--source, --output and --level are required.');
  }
  if (!Object.hasOwn(LEVEL_DEFAULTS, options.level)) {
    throw new Error(`--level must be one of ${Object.keys(LEVEL_DEFAULTS).join(', ')}.`);
  }
  const ratio = options.ratio == null ? LEVEL_DEFAULTS[options.level].ratio : options.ratio;
  const maxError = options.error == null ? LEVEL_DEFAULTS[options.level].error : options.error;
  if (!(ratio > 0 && ratio < 1)) throw new Error(`--ratio must be in (0, 1); got ${ratio}.`);
  if (!(maxError > 0 && maxError <= 0.01)) {
    throw new Error(`--error must be a small fraction of mesh radius (0, 0.01]; got ${maxError}.`);
  }

  const sourcePath = resolve(ROOT, options.source);
  const outputPath = resolve(ROOT, options.output);

  await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(sourcePath);
  const root = document.getRoot();
  const sourceTriangles = countTriangles(document);

  // The collision helper keeps exact geometry: it is a non-render contract node, never the thing
  // being simplified. Detach it before the transform so simplify cannot weld or collapse it.
  const detached = [];
  for (const node of root.listNodes()) {
    if (node.getName() !== 'COLLISION_HULL') continue;
    const mesh = node.getMesh();
    if (!mesh) continue;
    detached.push([node, mesh]);
    node.setMesh(null);
  }

  // Rename the scene root to the tier convention before writing (<SHIP>_LOD<n>_ROOT).
  const scene = root.getDefaultScene() || root.listScenes()[0];
  let rootRenamed = null;
  for (const child of scene ? scene.listChildren() : []) {
    const name = child.getName() || '';
    const renamed = name.replace(/LOD0_ROOT$/, `${options.level.toUpperCase()}_ROOT`);
    if (renamed !== name) {
      child.setName(renamed);
      rootRenamed = renamed;
    }
  }
  if (!rootRenamed) {
    throw new Error('source scene has no *_LOD0_ROOT child to rename for the sibling file.');
  }

  // Scene extras carry the spacefaceAsset contract block; retag the tier the file serves.
  const extras = scene && scene.getExtras ? scene.getExtras() : {};
  if (extras && extras.spacefaceAsset && typeof extras.spacefaceAsset === 'object') {
    extras.spacefaceAsset = {
      ...extras.spacefaceAsset,
      lod: options.level,
      lodSource: 'meshopt-weld-simplify',
      lodSourceError: maxError,
      lodSourceRatio: ratio,
      lodSourceTriangles: sourceTriangles,
    };
    scene.setExtras(extras);
  }

  // Bitwise weld first (the glTF-Transform pass the lane names), then the position-weld simplify.
  await document.transform(weld());

  let outputTris = 0;
  let worstError = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode();
      if (mode !== 4) continue; // TRIANGLES only — strips/fans are not triangle-list indexed
      const result = simplifyPrimitivePositions(prim, ratio, maxError);
      outputTris += result.outputTris;
      worstError = Math.max(worstError, result.maxError);
    }
  }

  for (const [node, mesh] of detached) node.setMesh(mesh);

  // Write through a sibling temp file so an interrupted run never leaves a truncated GLB where
  // the release pipeline expects a complete asset. writeBinary keeps the GLB container regardless
  // of the temp file's extension.
  const tempOutput = `${outputPath}.${process.pid}.tmp`;
  try {
    const binary = await io.writeBinary(document);
    await writeFile(tempOutput, binary);
    await rename(tempOutput, outputPath);
  } finally {
    await rm(tempOutput, { force: true });
  }
  console.log(JSON.stringify({
    source: options.source,
    output: options.output,
    level: options.level,
    ratio,
    error: maxError,
    lockBorder: true,
    sourceTriangles,
    outputTriangles: Math.round(outputTris),
    reduction: sourceTriangles ? +(1 - outputTris / sourceTriangles).toFixed(3) : null,
    worstAchievedError: +worstError.toFixed(5),
    rootRenamed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
