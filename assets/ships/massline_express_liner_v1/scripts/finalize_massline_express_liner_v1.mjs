#!/usr/bin/env node
/**
 * PQ-049.01 promotion finalizer for the Cycle 36 Massline Express Liner.
 *
 * Copies the frozen family source GLBs into release_candidates/ and
 * assets/ships/parts/wholeships/, stamps the authored-asset extras contract,
 * binds packed-ORM occlusion, and upserts parts_manifest.json. Does not rewrite
 * family source bytes. Release KTX2/meshopt is the existing SG-04 builder.
 *
 * Usage:
 *   node assets/ships/massline_express_liner_v1/scripts/finalize_massline_express_liner_v1.mjs
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

const DIR = dirname(fileURLToPath(import.meta.url));
const FAMILY = resolve(DIR, '..');
const ROOT = resolve(FAMILY, '../../..');
const PACKET = 'PQ-049-MASSLINE-EXPRESS-LINER-V1';
const ASSET_ID = 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1';
const PART_ID = 'wholeship_massline_express_liner_v1';
const PRIORITY = 'P1';
const TEXTURE_SIZE = 1024;
const GLAZING_MATERIAL = 'MAT_SF_Massline_Glazing_SmokedSafety';
const GLAZING_TRANSMISSION = 0.3;
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const FROZEN_SOURCE = Object.freeze({
  lod0: 'AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB',
  lod1: '7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E',
  lod2: 'B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50',
  blend: 'A7AB8524935C312F8550ED70DF99593CBDD3C6D74FA87EF69296B2B9A88FAC36',
});

const REQUIRED_SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Trail_Port',
  'SOCKET_Trail_Starboard',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
  'SOCKET_Dock_Port',
  'SOCKET_Service_Starboard',
  'SOCKET_Tether_Keel',
]);

const LODS = Object.freeze([
  Object.freeze({
    lod: 0,
    sourceName: 'massline_express_liner_v1_lod0.glb',
    fileName: 'massline_express_liner_v1.glb',
    partId: PART_ID,
    frozenSha256: FROZEN_SOURCE.lod0,
  }),
  Object.freeze({
    lod: 1,
    sourceName: 'massline_express_liner_v1_lod1.glb',
    fileName: 'massline_express_liner_v1_lod1.glb',
    partId: `${PART_ID}_lod1`,
    frozenSha256: FROZEN_SOURCE.lod1,
  }),
  Object.freeze({
    lod: 2,
    sourceName: 'massline_express_liner_v1_lod2.glb',
    fileName: 'massline_express_liner_v1_lod2.glb',
    partId: `${PART_ID}_lod2`,
    frozenSha256: FROZEN_SOURCE.lod2,
  }),
]);

const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PARTS_DIR = resolve(ROOT, 'assets/ships/parts/wholeships');
const CANDIDATE_DIR = resolve(FAMILY, 'release_candidates/wholeships');
const EVIDENCE_DIR = resolve(FAMILY, 'evidence');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function rel(path) {
  return path.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB');
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  let binary = Buffer.alloc(0);
  const binOffset = 20 + jsonLength;
  if (binOffset + 8 <= buffer.length) {
    const binLength = buffer.readUInt32LE(binOffset);
    binary = buffer.subarray(binOffset + 8, binOffset + 8 + binLength);
  }
  return { json, binary };
}

function serializeGlb(gltf, binary) {
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) json = Buffer.concat([json, Buffer.from(' '.repeat(jsonPad))]);
  let bin = binary;
  const binPad = (4 - (bin.length % 4)) % 4;
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

function writeAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, bytes);
  try {
    if (existsSync(path)) unlinkSync(path);
    renameSync(tmp, path);
  } catch (error) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
    throw error;
  }
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new THREE.Matrix4().fromArray(node.matrix);
  const position = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
  const quaternion = new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);
  const scale = new THREE.Vector3().fromArray(node.scale || [1, 1, 1]);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

function worldBounds(gltf, binary) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const visit = (index, parent) => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const world = parent.clone().multiply(nodeMatrix(node));
    if (node.mesh != null) {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
        const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
        const view = gltf.bufferViews?.[accessor?.bufferView];
        if (!accessor || !view || accessor.type !== 'VEC3' || accessor.componentType !== 5126) continue;
        const stride = view.byteStride || 12;
        const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
        const point = new THREE.Vector3();
        for (let i = 0; i < accessor.count; i++) {
          const offset = start + i * stride;
          point.set(
            data.getFloat32(offset, true),
            data.getFloat32(offset + 4, true),
            data.getFloat32(offset + 8, true),
          ).applyMatrix4(world);
          min.min(point);
          max.max(point);
        }
      }
    }
    for (const child of node.children || []) visit(child, world);
  };
  const roots = gltf.scenes?.[gltf.scene || 0]?.nodes || gltf.scenes?.[0]?.nodes || [];
  for (const root of roots) visit(root, new THREE.Matrix4());
  return {
    min: min.toArray().map((value) => Number(value.toFixed(4))),
    max: max.toArray().map((value) => Number(value.toFixed(4))),
    dimensionsM: [max.x - min.x, max.y - min.y, max.z - min.z].map((value) => Number(value.toFixed(4))),
  };
}

function countTriangles(gltf, { renderOnly = false } = {}) {
  const collisionMeshes = new Set();
  for (const node of gltf.nodes || []) {
    const extras = node.extras || {};
    if (node.mesh == null) continue;
    if (extras.collision || extras.nonRender || extras.spaceface?.nonRender || /COLLISION/i.test(node.name || '')) {
      collisionMeshes.add(node.mesh);
    }
  }
  let triangles = 0;
  let draws = 0;
  (gltf.meshes || []).forEach((mesh, meshIndex) => {
    if (renderOnly && collisionMeshes.has(meshIndex)) return;
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const indices = gltf.accessors?.[primitive.indices];
      const positions = gltf.accessors?.[primitive.attributes?.POSITION];
      const count = indices?.count ?? positions?.count ?? 0;
      triangles += Math.floor(count / 3);
      draws += 1;
    }
  });
  return { triangles, draws };
}

function glazingTransmission(gltf) {
  const material = (gltf.materials || []).find((entry) => entry.name === GLAZING_MATERIAL);
  return material?.extensions?.KHR_materials_transmission?.transmissionFactor ?? null;
}

function bindPackedOrmOcclusion(gltf) {
  let bound = 0;
  for (const material of gltf.materials || []) {
    const orm = material.pbrMetallicRoughness?.metallicRoughnessTexture;
    if (!orm || !Number.isInteger(orm.index)) continue;
    if (Number.isInteger(material.occlusionTexture?.index)) continue;
    material.occlusionTexture = { index: orm.index };
    bound += 1;
  }
  return bound;
}

function stampContract(gltf, spec, metrics, bounds) {
  const contract = {
    contractVersion: 1,
    assetId: ASSET_ID,
    partId: spec.partId,
    packet: PACKET,
    family: 'massline_express_liner_v1',
    category: 'wholeships',
    slot: 'hull',
    lod: `lod${spec.lod}`,
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    textureResolution: `${TEXTURE_SIZE}x${TEXTURE_SIZE}`,
    textureAuthorship: 'first-party unique-UV cage bakes from Cycle 36 source',
    embeddedPlume: false,
    role: 'civic_pressure_drum_liner',
    wiringStatus: 'live_traffic_express',
    triangleCount: metrics.triangles,
    renderTriangles: metrics.renderTriangles,
    collision: true,
    glazingTransmissionFactor: GLAZING_TRANSMISSION,
    lodFamily: {
      lod0: 'wholeships/massline_express_liner_v1.glb',
      lod1: 'wholeships/massline_express_liner_v1_lod1.glb',
      lod2: 'wholeships/massline_express_liner_v1_lod2.glb',
    },
  };
  const extras = { ...(gltf.asset?.extras || {}) };
  extras.spacefaceAsset = { ...(extras.spacefaceAsset || {}), ...contract };
  extras.assetId = ASSET_ID;
  extras.partId = spec.partId;
  extras.category = 'wholeships';
  extras.priority = PRIORITY;
  extras.triangleCount = metrics.triangles;
  extras.textureSize = TEXTURE_SIZE;
  extras.unit = 'metre';
  extras.upAxis = '+Y';
  extras.forwardAxis = '+X';
  extras.starboardAxis = '+Z';
  extras.boundsDimensionsM = bounds.dimensionsM;
  extras.sourceRole = 'whole-ship hull';
  gltf.asset = {
    ...(gltf.asset || {}),
    version: '2.0',
    generator: `${gltf.asset?.generator || ''}; SpaceFace finalize_massline_express_liner_v1.mjs`.replace(/^; /, ''),
    extras,
  };
  for (const scene of gltf.scenes || []) {
    scene.extras = { ...(scene.extras || {}), spacefaceAsset: extras.spacefaceAsset };
  }
  for (const node of gltf.nodes || []) {
    const name = node.name || '';
    const current = { ...(node.extras || {}) };
    const spaceface = { ...(current.spaceface || {}) };
    if (/^SOCKET_/i.test(name)) {
      current.socket = true;
      spaceface.socket = true;
    }
    if (/COLLISION/i.test(name) || current.collision || current.nonRender) {
      current.collision = true;
      current.nonRender = true;
      spaceface.nonRender = true;
    }
    if (node.mesh != null) spaceface.lod = `lod${spec.lod}`;
    current.spaceface = spaceface;
    node.extras = current;
  }
}

function validateCandidate(gltf, spec) {
  const sockets = (gltf.nodes || []).map((node) => node.name).filter((name) => /^SOCKET_/i.test(name || ''));
  const missingSockets = REQUIRED_SOCKETS.filter((name) => !sockets.includes(name));
  if (missingSockets.length) {
    throw new Error(`${spec.fileName}: missing sockets ${missingSockets.join(', ')}`);
  }
  const extraSockets = sockets.filter((name) => !REQUIRED_SOCKETS.includes(name));
  if (extraSockets.length) {
    throw new Error(`${spec.fileName}: unexpected sockets ${extraSockets.join(', ')}`);
  }
  const collision = (gltf.nodes || []).some((node) => /COLLISION/i.test(node.name || '') || node.extras?.collision);
  if (!collision) throw new Error(`${spec.fileName}: missing COLLISION_HULL`);
  const transmission = glazingTransmission(gltf);
  if (!(Math.abs(Number(transmission) - GLAZING_TRANSMISSION) < 1e-4)) {
    throw new Error(`${spec.fileName}: glazing transmission ${transmission} is not ${GLAZING_TRANSMISSION}`);
  }
  const materials = (gltf.materials || []).map((material) => material.name);
  if (!materials.includes(GLAZING_MATERIAL)) {
    throw new Error(`${spec.fileName}: missing ${GLAZING_MATERIAL}`);
  }
}

function formatPart(part) {
  return JSON.stringify(part, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function replaceJsonObjectById(text, id, formattedObject) {
  const needle = `"id": ${JSON.stringify(id)}`;
  const idAt = text.indexOf(needle);
  if (idAt < 0) return null;
  let start = text.lastIndexOf('\n    {', idAt);
  if (start < 0) start = text.lastIndexOf('{', idAt);
  else start += 1;
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`could not close JSON object for ${id}`);
  return `${text.slice(0, start)}${formattedObject}${text.slice(end)}`;
}

function upsertManifest(parts) {
  let text = readFileSync(MANIFEST_PATH, 'utf8');
  const hullFiles = parts.map((part) => part.file);
  for (const part of parts) {
    const formatted = formatPart(part);
    const replaced = replaceJsonObjectById(text, part.id, formatted);
    if (replaced) {
      text = replaced;
      continue;
    }
    const marker = '\n  ],\n  "runtimeSlots":';
    const at = text.lastIndexOf(marker);
    if (at < 0) throw new Error('parts_manifest.json is missing the parts/runtimeSlots boundary');
    text = `${text.slice(0, at)},\n${formatted}${text.slice(at)}`;
  }
  const hullKey = '"hull": [';
  const hullAt = text.lastIndexOf(hullKey);
  if (hullAt < 0) throw new Error('runtimeSlots.hull array is missing');
  const hullEndRel = text.slice(hullAt).indexOf('\n    ],');
  if (hullEndRel < 0) throw new Error('runtimeSlots.hull array is unclosed');
  const hullStart = hullAt + hullKey.length;
  const hullEnd = hullAt + hullEndRel;
  const missing = hullFiles.filter((file) => !text.slice(hullStart, hullEnd).includes(`"${file}"`));
  if (missing.length) {
    const addition = missing.map((file) => `\n      "${file}"`).join(',');
    const before = text.slice(hullStart, hullEnd).trimEnd();
    const patched = before.endsWith(',')
      ? `${before}${addition}`
      : `${before},${addition}`;
    text = `${text.slice(0, hullStart)}\n      ${patched.trimStart()}${text.slice(hullEnd)}`;
  }
  writeAtomic(MANIFEST_PATH, Buffer.from(text, 'utf8'));
}

function sourcePath(spec) {
  return resolve(FAMILY, 'source/wholeships', spec.sourceName);
}

async function finalizeLod(spec) {
  const source = sourcePath(spec);
  if (!existsSync(source)) throw new Error(`missing frozen source ${rel(source)}`);
  const sourceSha = sha256(source);
  if (sourceSha !== spec.frozenSha256) {
    throw new Error(`frozen source drifted for ${spec.sourceName}: ${sourceSha} != ${spec.frozenSha256}`);
  }
  const parsed = parseGlb(readFileSync(source));
  const occlusionBound = bindPackedOrmOcclusion(parsed.json);
  const totals = countTriangles(parsed.json);
  const render = countTriangles(parsed.json, { renderOnly: true });
  const bounds = worldBounds(parsed.json, parsed.binary);
  stampContract(parsed.json, spec, {
    triangles: totals.triangles,
    renderTriangles: render.triangles,
    draws: render.draws,
  }, bounds);
  validateCandidate(parsed.json, spec);
  const bytes = serializeGlb(parsed.json, parsed.binary);
  const candidate = resolve(CANDIDATE_DIR, spec.fileName);
  const parts = resolve(PARTS_DIR, spec.fileName);
  writeAtomic(candidate, bytes);
  mkdirSync(PARTS_DIR, { recursive: true });
  copyFileSync(candidate, parts);
  return {
    lod: spec.lod,
    partId: spec.partId,
    source: rel(source),
    sourceSha256: sourceSha,
    sourceBytes: statSync(source).size,
    candidate: rel(candidate),
    parts: rel(parts),
    sha256: sha256(candidate),
    bytes: bytes.length,
    triangles: totals.triangles,
    renderTriangles: render.triangles,
    draws: render.draws,
    sockets: REQUIRED_SOCKETS.slice(),
    collision: true,
    glazingTransmissionFactor: glazingTransmission(parsed.json),
    occlusionBound,
    bounds,
    materials: (parsed.json.materials || []).map((material) => material.name),
  };
}

const blendPath = resolve(FAMILY, 'blender/massline_express_liner_v1.blend');
const blendSha = existsSync(blendPath) ? sha256(blendPath) : null;
if (blendSha !== FROZEN_SOURCE.blend) {
  throw new Error(`frozen blend drifted: ${blendSha} != ${FROZEN_SOURCE.blend}`);
}

mkdirSync(CANDIDATE_DIR, { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });
const lods = [];
for (const spec of LODS) lods.push(await finalizeLod(spec));

const lod0 = lods[0];
const manifestParts = lods.map((entry, index) => {
  const spec = LODS[index];
  const row = {
    id: spec.partId,
    assetId: ASSET_ID,
    category: 'wholeships',
    priority: PRIORITY,
    file: `wholeships/${spec.fileName}`,
    status: 'integration_candidate',
    wiringStatus: 'live_traffic_express',
    tris: entry.triangles,
    bytes: entry.bytes,
    textureSize: TEXTURE_SIZE,
    sockets: REQUIRED_SOCKETS.slice(),
    mount: 'origin',
    bounds: entry.bounds,
    note: `${PACKET} — Massline Express Liner ${spec.lod === 0 ? 'LOD0 live express body' : `LOD${spec.lod} family member`}; Cycle 36 frozen source ${entry.sourceSha256}; passenger-only civic pressure-drum; 13 sockets; COLLISION_HULL; 0.30 smoked glazing; common aft pressure/load shroud with open twin throats. Whole-asset G1/G2/G4/G7 remain open. Family source is assets/ships/massline_express_liner_v1/.`,
  };
  if (spec.lod === 0) {
    row.lodFamily = {
      lod0: 'wholeships/massline_express_liner_v1.glb',
      lod1: 'wholeships/massline_express_liner_v1_lod1.glb',
      lod2: 'wholeships/massline_express_liner_v1_lod2.glb',
    };
  }
  return row;
});
upsertManifest(manifestParts);

const report = {
  schema: 'spaceface.masslineExpressLiner.finalize.v1',
  packet: PACKET,
  assetId: ASSET_ID,
  status: 'integration_candidate',
  promoted: true,
  frozenSource: FROZEN_SOURCE,
  blendSha256: blendSha,
  lods,
  checks: {
    frozenSourcePreserved: lods.every((entry, index) => entry.sourceSha256 === LODS[index].frozenSha256),
    blendPreserved: blendSha === FROZEN_SOURCE.blend,
    sockets: lods.every((entry) => entry.sockets.length === REQUIRED_SOCKETS.length),
    collision: lods.every((entry) => entry.collision === true),
    glazing030: lods.every((entry) => Math.abs(entry.glazingTransmissionFactor - GLAZING_TRANSMISSION) < 1e-4),
    occlusionBound: lods.every((entry) => entry.occlusionBound > 0),
  },
};
report.ok = Object.values(report.checks).every(Boolean);
writeAtomic(resolve(EVIDENCE_DIR, 'finalize_report.json'), Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8'));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
void lod0;
