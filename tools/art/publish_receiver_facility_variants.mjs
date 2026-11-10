#!/usr/bin/env node
// Publish the PQ-019 receiver-facility KEEP candidates under their own heist place ids.
//
// WHY THIS EXISTS
// ---------------
// PQ-022.heist-receivers-promote: the two KEEP re-authors in
// assets/ships/m5_claim_outposts/{source,release}_candidates/... are identical and unpackaged: they
// carry no asset-level identity and no parts_manifest/release_manifest rows. The shared
// place_claim_outpost_base / place_claim_outpost_refinery bodies still belong to the World Site
// stages, so promoting the candidates onto those ids would silently change every world site.
// Instead this tool stamps the candidates with their own place identity — place_claim_outpost_catcher
// (from the base/KEEP catcher candidate) and place_claim_outpost_fence (from the refinery/KEEP fence
// candidate) — writes them as canonical sources, inserts their parts_manifest rows (surgical text
// splice; the manifest has mixed inline/multiline styles that a full re-serialize would churn), and
// inserts the release_manifest placeholder rows that scripts/build-place-release-assets.mjs patches
// when it builds the KTX2/meshopt release pair. It never touches the shared base/refinery files,
// rows, or bindings; geometry, sockets, collision hull, AABB and the +X approach are byte-preserved
// from the reviewed candidate except for the identity metadata.
//
// Usage: node tools/art/publish_receiver_facility_variants.mjs [--check]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  collectLodTriangleCounts,
  nodeLod,
} from '../../scripts/lib/partsManifestMetrics.mjs';
import { decodedAccessorBounds } from '../../scripts/lib/partsManifestAssetContract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const CANDIDATE_ROOT = 'assets/ships/m5_claim_outposts/source_candidates/receiver_facility_material_truth_v1/places';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const VARIANTS = Object.freeze([
  Object.freeze({
    partId: 'place_claim_outpost_catcher',
    assetId: 'SF_PLACE_CLAIM_OUTPOST_CATCHER',
    rootNode: 'SF_PLACE_CLAIM_OUTPOST_CATCHER_ROOT',
    role: 'heist_lawful_catcher',
    title: 'Lawful Catcher',
    candidate: `${CANDIDATE_ROOT}/place_claim_outpost_base.glb`,
    insertAfter: 'place_claim_outpost_base',
    note: 'PQ-022 Tethys heist lawful catcher; open-mouth impound fork re-authored from the KEEP '
      + 'receiver-facility candidate. PLACEHOLDER_NOTE',
  }),
  Object.freeze({
    partId: 'place_claim_outpost_fence',
    assetId: 'SF_PLACE_CLAIM_OUTPOST_FENCE',
    rootNode: 'SF_PLACE_CLAIM_OUTPOST_FENCE_ROOT',
    role: 'heist_fence_receiver',
    title: 'Quiet Fence Receiver',
    candidate: `${CANDIDATE_ROOT}/place_claim_outpost_refinery.glb`,
    insertAfter: 'place_claim_outpost_refinery',
    note: 'PQ-022 Tethys heist covert fence; asymmetric shielded-handoff receiver re-authored from '
      + 'the KEEP receiver-facility candidate. PLACEHOLDER_NOTE',
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

// Mirrors scripts/check-parts-manifest.mjs collectWorldBounds with the default `all` metric:
// every mesh node contributes; only a caller-supplied `lod` filter narrows the set.
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
  const rawContract = sceneExtras.spacefaceAssetJson;
  if (typeof rawContract !== 'string') {
    throw new Error(`${variant.partId}: candidate is missing scenes[0].extras.spacefaceAssetJson`);
  }
  const contract = {
    ...JSON.parse(rawContract),
    assetId: variant.assetId,
    partId: variant.partId,
    liveId: variant.partId,
    role: variant.role,
    title: variant.title,
    promotedBy: 'tools/art/publish_receiver_facility_variants.mjs',
    sourceCandidate: variant.candidate,
  };
  const identityExtras = { assetId: variant.assetId, partId: variant.partId, spacefaceAsset: contract };

  gltf.asset = gltf.asset || {};
  gltf.asset.extras = { ...(gltf.asset.extras || {}), ...identityExtras };
  scene.extras = { ...sceneExtras, ...identityExtras };

  const rootNode = (gltf.nodes || []).find((node) => (node.name || '').endsWith('_ROOT'));
  if (!rootNode) throw new Error(`${variant.partId}: candidate has no _ROOT node`);
  rootNode.name = variant.rootNode;
  rootNode.extras = {
    ...(rootNode.extras || {}),
    'spaceface.assetId': variant.assetId,
    'spaceface.partId': variant.partId,
    spacefaceAssetJson: JSON.stringify(contract),
    spacefaceAsset: contract,
  };

  const published = serializeGlb(gltf, parsed.binary);

  const lodTriangles = collectLodTriangleCounts(gltf);
  const bounds = worldBounds(gltf, parsed.binary);
  const dimensionsM = bounds.max.map((value, index) => round4(value - bounds.min[index]));
  const sockets = [...new Set((gltf.nodes || [])
    .map((node) => node.name)
    .filter((name) => typeof name === 'string' && name.startsWith('SOCKET_')))].sort();

  return {
    variant,
    output: resolve(ROOT, `assets/ships/parts/places/${variant.partId}.glb`),
    bytes: published.length,
    sha256: sha256(published),
    published,
    tris: lodTriangles.lod0,
    lodTriangles,
    bounds: {
      min: bounds.min.map(round4),
      max: bounds.max.map(round4),
      dimensionsM,
    },
    sockets,
  };
}

// The parts manifest is hand-edited text with mixed inline/multiline array styles; re-serializing
// it would rewrite unrelated whitespace. Splice the new row directly after its reviewed sibling.
function splicePartRow(manifestText, entry) {
  const { partId, insertAfter } = entry.variant;
  if (manifestText.includes(`"id": "${partId}"`)) {
    throw new Error(`${partId} is already present in parts_manifest.json`);
  }
  const anchor = manifestText.indexOf(`"id": "${insertAfter}"`);
  if (anchor < 0) throw new Error(`missing template row ${insertAfter}`);
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

// Rebuild only the runtimeSlots.place array block with the two published files appended.
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
  const templateById = new Map(partManifest.parts.map((part) => [part.id, part]));

  for (const entry of staged) {
    const template = templateById.get(entry.variant.insertAfter);
    if (!template) throw new Error(`missing template row ${entry.variant.insertAfter}`);
    entry.row = {
      id: entry.variant.partId,
      category: 'places',
      priority: template.priority,
      file: `places/${entry.variant.partId}.glb`,
      textureSize: template.textureSize,
      tintable: structuredClone(template.tintable),
      factionAccentVariants: structuredClone(template.factionAccentVariants),
      mount: 'origin',
      tris: entry.tris,
      bytes: entry.bytes,
      hooks: [],
      sockets: entry.sockets,
      bounds: entry.bounds,
      note: entry.variant.note.replace(
        'PLACEHOLDER_NOTE',
        `${entry.tris} tris LOD0; ${Object.keys(template.tintable || {}).length} tint roles. `
        + `Promoted from ${entry.variant.candidate} (KEEP review 2026-08-10); source ${entry.sha256.slice(0, 12)}.`,
      ),
      triangleMetric: 'lod0',
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
  if (process.env.SF_DUMP_MANIFEST) {
    writeFileSync(process.env.SF_DUMP_MANIFEST, nextPartManifestText);
  }
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
      const after = releaseManifest.assets.findIndex((asset) => asset.id === entry.variant.insertAfter);
      releaseManifest.assets.splice(after + 1, 0, row);
    }
  }
  const nextReleaseManifestText = `${JSON.stringify(releaseManifest, null, 2)}\n`;

  for (const entry of staged) {
    console.log(`[receivers] ${entry.variant.partId}: ${entry.bytes} bytes sha256=${entry.sha256}`);
    console.log(`[receivers]   tris lod0/1/2=${entry.lodTriangles.lod0}/${entry.lodTriangles.lod1}/${entry.lodTriangles.lod2}`
      + ` dims=${entry.bounds.dimensionsM.join(',')} sockets=${entry.sockets.length}`);
  }

  if (checkOnly) {
    console.log('[receivers] --check: validated candidates; no files written');
    return;
  }

  for (const entry of staged) writeFileSync(entry.output, entry.published);
  writeFileSync(PART_MANIFEST, nextPartManifestText);
  writeFileSync(RELEASE_MANIFEST, nextReleaseManifestText);
  console.log('[receivers] wrote canonical sources, parts_manifest rows, and release_manifest placeholders');
}

main();
