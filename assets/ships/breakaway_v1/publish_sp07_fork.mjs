#!/usr/bin/env node
// Publish the PQ-195 SP-07 spindle + capture fork blockouts under their own place ids.
//
// PQ-195.00: the two BREAKAWAY candidates in source_candidates/ carry no asset-level
// identity and no manifest rows, so the Third Shift runs with the 6 WU pod visual
// standing in for the 16 WU SP-07 and no fork visual at all. This tool stamps the
// candidates with their own place identity — place_breakaway_sp07 (the moving
// industrial load) and place_breakaway_fork (the static receiver extension in front
// of the Concord Lawful Catcher head) — writes them as canonical sources, inserts
// their parts_manifest rows (surgical text splice; the manifest has mixed
// inline/multiline styles that a full re-serialize would churn), and inserts the
// release_manifest placeholder rows that scripts/build-place-release-assets.mjs
// patches when it builds the release pair. It never touches the shared pod bodies,
// the PQ-022 catcher/fence files/rows/bindings, or any other manifest row;
// geometry, sockets, bounds and the +X forward/inward contract are preserved from
// the reviewed candidates except for the identity metadata (matrix->TRS socket
// normalization keeps positions bit-identical).
//
// This is a promotion pass, not a surfacing pass: see MATERIAL_TRUTH_PREFLIGHT.md.
// G1/G2/G4 whole-asset gates stay open (blockout surfacing).
//
// Usage: node assets/ships/breakaway_v1/publish_sp07_fork.mjs [--check]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  collectLodTriangleCounts,
  nodeLod,
} from '../../../scripts/lib/partsManifestMetrics.mjs';
import { decodedAccessorBounds } from '../../../scripts/lib/partsManifestAssetContract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const VARIANTS = Object.freeze([
  Object.freeze({
    partId: 'place_breakaway_sp07',
    assetId: 'SF_PLACE_BREAKAWAY_SP07',
    rootNode: 'SF_PLACE_BREAKAWAY_SP07_ROOT',
    role: 'heist_sp07_assembly',
    title: 'SP-07 Flywheel Assembly',
    candidate: 'assets/ships/breakaway_v1/source_candidates/sp07-spindle.glb',
    insertAfter: 'place_claim_outpost_catcher',
    socketRoles: Object.freeze({
      socket_tow_front: 'tow_front',
      socket_tow_aft: 'tow_aft',
      socket_service: 'service',
    }),
    note: 'PQ-195 Third Shift SP-07 flywheel assembly; caged industrial load promoted from the '
      + 'packet blockout candidate. PLACEHOLDER_NOTE',
  }),
  Object.freeze({
    partId: 'place_breakaway_fork',
    assetId: 'SF_PLACE_BREAKAWAY_FORK',
    rootNode: 'SF_PLACE_BREAKAWAY_FORK_ROOT',
    role: 'heist_capture_fork',
    title: 'Breakaway Capture Fork',
    candidate: 'assets/ships/breakaway_v1/source_candidates/capture-fork.glb',
    insertAfter: 'place_breakaway_sp07',
    socketRoles: Object.freeze({
      socket_mouth: 'fork_mouth',
      socket_seat: 'fork_seat',
      socket_service: 'service',
    }),
    note: 'PQ-195 Third Shift capture fork; static receiver extension ahead of the Concord Lawful '
      + 'Catcher head, promoted from the packet blockout candidate. PLACEHOLDER_NOTE',
  }),
]);

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

function parseGlb(bytes, label) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${label}: not a GLB`);
  }
  if (bytes.readUInt32LE(4) !== 2) throw new Error(`${label}: unsupported glTF version`);
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${label}: header length mismatch`);
  let offset = 12;
  let gltf = null;
  let binary = null;
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > bytes.length) throw new Error(`${label}: chunk overruns file`);
    if (chunkType === CHUNK_JSON) {
      gltf = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    } else if (chunkType === CHUNK_BIN) {
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }
  if (!gltf) throw new Error(`${label}: missing JSON chunk`);
  if (!binary) throw new Error(`${label}: missing BIN chunk`);
  return { gltf, binary };
}

function serializeGlb(gltf, binary) {
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = pad4(json.length);
  if (jsonPad) json = Buffer.concat([json, Buffer.from(' '.repeat(jsonPad))]);
  let bin = binary;
  const binPad = pad4(bin.length);
  if (binPad) bin = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  let offset = 0;
  out.writeUInt32LE(GLB_MAGIC, offset); offset += 4;
  out.writeUInt32LE(2, offset); offset += 4;
  out.writeUInt32LE(total, offset); offset += 4;
  out.writeUInt32LE(json.length, offset); offset += 4;
  out.writeUInt32LE(CHUNK_JSON, offset); offset += 4;
  json.copy(out, offset); offset += json.length;
  if (bin.length) {
    out.writeUInt32LE(bin.length, offset); offset += 4;
    out.writeUInt32LE(CHUNK_BIN, offset); offset += 4;
    bin.copy(out, offset);
  }
  return out;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new THREE.Matrix4().fromArray(node.matrix);
  const position = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
  const quaternion = new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);
  const scale = new THREE.Vector3().fromArray(node.scale || [1, 1, 1]);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

// Mirrors scripts/check-parts-manifest.mjs collectWorldBounds with the default `all` metric.
function worldBounds(gltf, binary, lod = null) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const roots = gltf.scenes?.[gltf.scene || 0]?.nodes || gltf.scenes?.[0]?.nodes || [];
  const visit = (nodeIndex, parentMatrix, inheritedLod) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;
    const world = parentMatrix.clone().multiply(nodeMatrix(node));
    const effectiveLod = nodeLod(node) || inheritedLod;
    if (node.mesh != null && (!lod || effectiveLod === lod)) {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
        const accessorBounds = decodedAccessorBounds(gltf, gltf.accessors?.[primitive.attributes?.POSITION]);
        if (!accessorBounds?.min || !accessorBounds?.max) continue;
        for (const x of [accessorBounds.min[0], accessorBounds.max[0]]) {
          for (const y of [accessorBounds.min[1], accessorBounds.max[1]]) {
            for (const z of [accessorBounds.min[2], accessorBounds.max[2]]) {
              const point = new THREE.Vector3(x, y, z).applyMatrix4(world);
              min.min(point);
              max.max(point);
            }
          }
        }
      }
    }
    for (const child of node.children || []) visit(child, world, effectiveLod);
  };
  for (const rootIndex of roots) visit(rootIndex, new THREE.Matrix4(), null);
  return { min: min.toArray(), max: max.toArray() };
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

function stampVariant(variant) {
  const candidateBytes = readFileSync(resolve(ROOT, variant.candidate));
  const parsed = parseGlb(candidateBytes, variant.candidate);
  const gltf = parsed.gltf;

  const scene = (gltf.scenes || [])[0];
  if (!scene) throw new Error(`${variant.partId}: candidate has no scene`);
  const sceneExtras = scene.extras || {};
  // Fresh canonical contract: the packet candidates carry geometry truth (the
  // `breakaway` extras block, preserved below) but no SpaceFace asset identity.
  const contract = {
    contractVersion: 1,
    assetId: variant.assetId,
    partId: variant.partId,
    liveId: variant.partId,
    slot: 'place',
    category: 'places',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    role: variant.role,
    title: variant.title,
    promotedBy: 'assets/ships/breakaway_v1/publish_sp07_fork.mjs',
    sourceCandidate: variant.candidate,
    candidateSha256: sha256(candidateBytes),
  };
  const identityExtras = { assetId: variant.assetId, partId: variant.partId, spacefaceAsset: contract };

  gltf.asset = gltf.asset || {};
  gltf.asset.extras = { ...(gltf.asset.extras || {}), ...identityExtras };
  const { role: _candidateRole, ...keptSceneExtras } = sceneExtras;
  scene.extras = { ...keptSceneExtras, ...identityExtras };

  const rootNode = (gltf.nodes || []).find((node) => node.name === 'world');
  if (!rootNode) throw new Error(`${variant.partId}: candidate has no world root node`);
  rootNode.name = variant.rootNode;
  rootNode.extras = {
    ...(rootNode.extras || {}),
    'spaceface.assetId': variant.assetId,
    'spaceface.partId': variant.partId,
    spacefaceAssetJson: JSON.stringify(contract),
    spacefaceAsset: contract,
  };

  // Normalize socket matrices to TRS (positions bit-identical) and stamp the
  // semantic roles the immutable binding pins. Fail closed on any drift.
  const socketNames = [];
  for (const [name, socketRole] of Object.entries(variant.socketRoles)) {
    const node = (gltf.nodes || []).find((candidate) => candidate.name === name);
    if (!node) throw new Error(`${variant.partId}: candidate is missing socket node ${name}`);
    const matrix = nodeMatrix(node);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    if (Math.abs(quaternion.w - 1) > 1e-9
      || Math.abs(scale.x - 1) > 1e-9 || Math.abs(scale.y - 1) > 1e-9 || Math.abs(scale.z - 1) > 1e-9) {
      throw new Error(`${variant.partId}: socket ${name} is not a pure translation`);
    }
    delete node.matrix;
    node.translation = [position.x, position.y, position.z];
    node.extras = { ...(node.extras || {}), 'spaceface.socketRole': socketRole };
    socketNames.push(name);
  }
  socketNames.sort();

  const published = serializeGlb(gltf, parsed.binary);

  const lodTriangles = collectLodTriangleCounts(gltf);
  // Single-LOD blockouts carry no LOD tags, so the row uses the established `all`
  // convention (mirrors collectMetrics in scripts/check-parts-manifest.mjs).
  const totalTriangles = (gltf.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || [])
    .reduce((meshSum, primitive) => {
      if ((primitive.mode ?? 4) !== 4) return meshSum;
      const indexAccessor = gltf.accessors?.[primitive.indices];
      const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
      const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
      return meshSum + Math.floor(count / 3);
    }, 0), 0);
  const bounds = worldBounds(gltf, parsed.binary);
  const dimensionsM = bounds.max.map((value, index) => round4(value - bounds.min[index]));

  return {
    variant,
    output: resolve(ROOT, `assets/ships/parts/places/${variant.partId}.glb`),
    bytes: published.length,
    sha256: sha256(published),
    published,
    tris: totalTriangles,
    lodTriangles,
    bounds: {
      min: bounds.min.map(round4),
      max: bounds.max.map(round4),
      dimensionsM,
    },
    sockets: socketNames,
  };
}

// The parts manifest is hand-edited text with mixed inline/multiline array styles;
// re-serializing it would rewrite unrelated whitespace. Splice the new row directly
// after its anchor sibling.
function splicePartRow(manifestText, entry) {
  const { partId } = entry.variant;
  if (manifestText.includes(`"id": "${partId}"`)) {
    throw new Error(`${partId} is already present in parts_manifest.json`);
  }
  const anchor = manifestText.indexOf(`"id": "${entry.anchorId}"`);
  if (anchor < 0) throw new Error(`missing template row ${entry.anchorId}`);
  let start = manifestText.lastIndexOf('\n    {', anchor);
  let index = start + 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < manifestText.length; index += 1) {
    const character = manifestText[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) { index += 1; break; }
    }
  }
  const rowText = `\n${JSON.stringify(entry.row, null, 2).split('\n').map((line) => `    ${line}`).join('\n')}`;
  return `${manifestText.slice(0, index)},${rowText}${manifestText.slice(index)}`;
}

// Rebuild only the runtimeSlots.place array block with the published files appended.
function splicePlaceSlot(manifestText, placeFiles) {
  const marker = '"place": [';
  const markerIndex = manifestText.indexOf(marker);
  if (markerIndex < 0) throw new Error('parts_manifest is missing runtimeSlots.place');
  const open = markerIndex + marker.length;
  let index = open + 1;
  let inString = false;
  let escaped = false;
  for (; index < manifestText.length; index += 1) {
    const character = manifestText[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === ']') break;
  }
  const entries = placeFiles.map((file) => `\n      ${JSON.stringify(file)},`);
  entries[entries.length - 1] = entries[entries.length - 1].slice(0, -1);
  const block = `${entries.join('')}\n    ]`;
  return `${manifestText.slice(0, open)}${block}${manifestText.slice(index + 1)}`;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const staged = VARIANTS.map(stampVariant);

  const partManifestText = readFileSync(PART_MANIFEST, 'utf8');
  const partManifest = JSON.parse(partManifestText);

  for (const entry of staged) {
    // Flat PBR factors, no textures, no tint roles in this promotion pass; the
    // surfacing pass owns texture/tint authoring (see MATERIAL_TRUTH_PREFLIGHT.md).
    entry.anchorId = entry.variant.insertAfter;
    entry.row = {
      id: entry.variant.partId,
      category: 'places',
      priority: 'P0',
      file: `places/${entry.variant.partId}.glb`,
      textureSize: 1024,
      tintable: {},
      factionAccentVariants: {},
      mount: 'origin',
      tris: entry.tris,
      bytes: entry.bytes,
      hooks: [],
      sockets: entry.sockets,
      bounds: entry.bounds,
      note: entry.variant.note.replace(
        'PLACEHOLDER_NOTE',
        `${entry.tris} tris (all); 0 tint roles. `
        + `Promoted from ${entry.variant.candidate} (blockout silhouette pass, PQ-195.00); source ${entry.sha256.slice(0, 12)}.`,
      ),
      triangleMetric: 'all',
    };
  }

  let nextPartManifestText = partManifestText;
  for (const entry of staged) nextPartManifestText = splicePartRow(nextPartManifestText, entry);
  const runtimePlaceFiles = partManifest.runtimeSlots.place.slice();
  for (const entry of staged) {
    const file = `places/${entry.variant.partId}.glb`;
    if (!runtimePlaceFiles.includes(file)) runtimePlaceFiles.push(file);
  }
  nextPartManifestText = splicePlaceSlot(nextPartManifestText, runtimePlaceFiles);
  JSON.parse(nextPartManifestText); // fail closed on malformed output

  const releaseManifestText = readFileSync(RELEASE_MANIFEST, 'utf8');
  const releaseManifest = JSON.parse(releaseManifestText);
  for (const entry of staged) {
    const row = {
      id: entry.variant.partId,
      kind: 'part:places',
      source: `assets/ships/parts/places/${entry.variant.partId}.glb`,
      release: `assets/ships/release/parts/places/${entry.variant.partId}.glb`,
      sourceSha256: entry.sha256,
      releaseSha256: '0'.repeat(64),
      sourceBytes: entry.bytes,
      releaseBytes: 0,
      textures: 0,
      ktx2Textures: 0,
      meshoptBufferViews: 0,
      contractNodeCount: 0,
    };
    const existing = releaseManifest.assets.findIndex((asset) => asset.id === entry.variant.partId);
    if (existing < 0) {
      const after = releaseManifest.assets.findIndex((asset) => asset.id === entry.anchorId);
      releaseManifest.assets.splice(after + 1, 0, row);
    }
  }
  const nextReleaseManifestText = `${JSON.stringify(releaseManifest, null, 2)}\n`;

  for (const entry of staged) {
    console.log(`[breakaway] ${entry.variant.partId}: ${entry.bytes} bytes sha256=${entry.sha256}`);
    console.log(`[breakaway]   tris lod0/1/2=${entry.lodTriangles.lod0}/${entry.lodTriangles.lod1}/${entry.lodTriangles.lod2}`
      + ` dims=${entry.bounds.dimensionsM.join(',')} sockets=${entry.sockets.join(',')}`);
    console.log(`[breakaway]   bounds min=${entry.bounds.min.join(',')} max=${entry.bounds.max.join(',')}`);
  }

  if (checkOnly) {
    console.log('[breakaway] --check: validated candidates; no files written');
    return;
  }

  for (const entry of staged) writeFileSync(entry.output, entry.published);
  writeFileSync(PART_MANIFEST, nextPartManifestText);
  writeFileSync(RELEASE_MANIFEST, nextReleaseManifestText);
  console.log('[breakaway] wrote canonical sources, parts_manifest rows, and release_manifest placeholders');
}

main();
