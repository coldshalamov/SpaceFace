#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = resolve(ROOT, '.devshots/graphics/geology-landmark-family-v3');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const APPLY = process.argv.includes('--apply');
const PIPELINE = 'tools/blender/remaster_geology_landmark_family_v1.py';
const MAP_PIPELINE = 'tools/art/build_geology_landmark_maps_v1.py';

const MEMBERS = Object.freeze([
  Object.freeze({
    id: 'place_asteroid_seamed',
    priority: 'P0',
    candidateBase: 'place_asteroid_seamed_geology_v3',
    candidateSha256: '0A7F1449C5C74EF29C859AD51E0630F97178AD3288D64724C21DD127DA644D82',
    blendSha256: '4E87738CD557709F4EB2FDDB9D9A8F2DC441C3947FC5D7749396F96EAEFFA8E0',
    assetId: 'SF_PLACE_ASTEROID_SEAMED_GEOLOGY_V3',
    sourceBlend: 'place_asteroid_seamed_authored.blend',
    hooks: [],
    landmarks: ['LANDMARK_MineralSeam'],
    sockets: ['SOCKET_Scan_Target'],
    language: 'dry-bedded-regolith-with-surveyed-mineral-fracture',
    lod: Object.freeze({ lod0: 8_340, lod1: 3_552, lod2: 1_448 }),
    blenderBounds: Object.freeze({
      min: [-14.233109474182129, -12.745527267456055, -10.274117469787598],
      max: [14.450972557067871, 11.860407829284668, 11.491243362426758],
    }),
  }),
  Object.freeze({
    id: 'place_asteroid_graffiti',
    priority: 'P1',
    candidateBase: 'place_asteroid_graffiti_geology_v3',
    candidateSha256: '2835807FA48E381192F74493C05946C39C5C0379C18F5B607B850B8D95E9C15B',
    blendSha256: '7E6AA41C866EF085E7766B47738D7C90C829F1FC814D6A458070E1AE15F69838',
    assetId: 'SF_PLACE_ASTEROID_GRAFFITI_GEOLOGY_V3',
    sourceBlend: 'place_asteroid_graffiti_authored.blend',
    hooks: [],
    landmarks: ['LANDMARK_ProspectorTags'],
    sockets: ['SOCKET_Camera_Focus'],
    language: 'dry-fractured-regolith-with-nonemissive-prospector-history',
    lod: Object.freeze({ lod0: 9_876, lod1: 2_472, lod2: 1_108 }),
    blenderBounds: Object.freeze({
      min: [-12.515837669372559, -9.92920207977295, -8.960908889770508],
      max: [12.232428550720215, 9.7459135055542, 9.357056617736816],
    }),
  }),
]);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
const planned = MEMBERS.map((member) => planMember(member, manifest));

if (APPLY) {
  for (const item of planned) {
    copyFileSync(item.candidateGlb, item.liveGlb);
    const metrics = stampAcceptedSource(item.liveGlb, item.member, item.runtimeBounds);
    if (metrics.triangles !== item.triangles) {
      throw new Error(`${item.member.id} triangle drift: ${metrics.triangles} != ${item.triangles}`);
    }
    copyFileSync(item.candidateBlend, item.liveBlend);
    item.bytes = statSync(item.liveGlb).size;
    item.entry.tris = metrics.triangles;
    item.entry.bytes = item.bytes;
    item.entry.textureSize = 1024;
    item.entry.hooks = [...item.member.hooks];
    item.entry.sockets = [...item.member.sockets];
    item.entry.mount = 'origin';
    item.entry.bounds = item.runtimeBounds;
    delete item.entry.tintable;
    delete item.entry.factionAccentVariants;
    item.entry.note = `Geology landmark V3 live promotion 2026-07-19 — ${item.member.language}; authored LOD0/1/2 (${item.member.lod.lod0.toLocaleString('en-US')} / ${item.member.lod.lod1.toLocaleString('en-US')} / ${item.member.lod.lod2.toLocaleString('en-US')} tris), six functional PBR material roles with bound base-color/normal/ORM maps, explicit runtime geology/mechanical/warning roles, recessed fracture seats, preserved pivot and interaction markers, deterministic texture generation, no emission substitute, and dry nonuniform roughness reviewed at close/default/far standalone game-camera assumptions before live-route admission.`;
    authoring.entries[item.member.id] = {
      method: 'blender_generic',
      blend_path: repoPath(item.liveBlend),
      exporter_path: PIPELINE,
      texture_role_owner: 'blender-source-v1',
      min_tris: item.member.lod.lod0,
      pipeline: PIPELINE,
      texture_pipeline: MAP_PIPELINE,
      family: 'geology_landmark_family_v3',
      packet: 'GEOLOGY-LANDMARK-FAMILY-01',
    };
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(AUTHORING_PATH, `${JSON.stringify(authoring, null, 2)}\n`);
}

console.log(JSON.stringify({
  ok: true,
  applied: APPLY,
  family: 'geology_landmark_family_v3',
  members: planned.map((item) => ({
    id: item.member.id,
    candidate: repoPath(item.candidateGlb),
    candidateSha256: item.member.candidateSha256,
    liveGlb: repoPath(item.liveGlb),
    liveBlend: repoPath(item.liveBlend),
    triangles: item.triangles,
    bytes: APPLY ? item.bytes : statSync(item.candidateGlb).size,
    bounds: item.runtimeBounds,
  })),
  next: APPLY
    ? 'rebuild only place_asteroid_seamed and place_asteroid_graffiti release assets'
    : 'rerun with --apply after controller review',
}, null, 2));

function planMember(member, currentManifest) {
  const candidateDir = resolve(SCRATCH, 'candidates', member.id);
  const candidateGlb = resolve(candidateDir, `${member.candidateBase}.glb`);
  const candidateBlend = resolve(candidateDir, `${member.candidateBase}.blend`);
  verifyHash(candidateGlb, member.candidateSha256);
  verifyHash(candidateBlend, member.blendSha256);
  const entry = currentManifest.parts.find((part) => part.id === member.id);
  if (!entry) throw new Error(`parts manifest entry missing: ${member.id}`);
  if (entry.category !== 'places' || entry.priority !== member.priority) {
    throw new Error(`unexpected live catalog identity for ${member.id}`);
  }
  const triangles = Object.values(member.lod).reduce((sum, value) => sum + value, 0);
  return {
    member,
    entry,
    triangles,
    candidateGlb,
    candidateBlend,
    liveGlb: resolve(ROOT, 'assets/ships/parts/places', `${member.id}.glb`),
    liveBlend: resolve(ROOT, 'assets/ships/parts/blender', member.sourceBlend),
    runtimeBounds: blenderBoundsToGltf(member.blenderBounds),
  };
}

function stampAcceptedSource(path, member, runtimeBounds) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`not a GLB v2 file: ${path}`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`GLB JSON chunk missing: ${path}`);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
  const triangles = countTriangles(document);
  document.asset = document.asset || {};
  const spacefaceAsset = {
    contractVersion: 1,
    assetId: member.assetId,
    partId: member.id,
    family: 'geology_landmark_family_v3',
    packet: 'GEOLOGY-LANDMARK-FAMILY-01',
    category: 'places',
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    tangentConvention: 'MikkTSpace',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    embeddedPlume: false,
    authoredEmission: false,
    geologyLanguage: member.language,
    lodTriangles: member.lod,
    acceptanceClaim: false,
    wiringStatus: 'live_place_catalog_pending_route_acceptance',
  };
  document.asset.extras = {
    ...(document.asset.extras || {}),
    assetId: member.assetId,
    partId: member.id,
    category: 'places',
    priority: member.priority,
    triangleCount: triangles,
    textureSize: 1024,
    forwardAxis: '+X',
    upAxis: '+Y',
    starboardAxis: '+Z',
    unit: 'metre',
    boundsDimensionsM: runtimeBounds.dimensionsM,
    sourceProvenance: {
      textureRoleContractVersion: 1,
      textureRoleMode: 'bound-base-normal-orm',
      sourceBlend: `assets/ships/parts/blender/${member.sourceBlend}`,
      geometryPipeline: PIPELINE,
      texturePipeline: MAP_PIPELINE,
      acceptedCandidateSha256: member.candidateSha256,
      packedEditableTextures: true,
    },
    spacefaceAsset,
  };
  const defaultScene = document.scenes?.[document.scene ?? 0];
  if (!defaultScene) throw new Error(`${member.id} has no default glTF scene`);
  defaultScene.extras = { ...(defaultScene.extras || {}), spacefaceAsset };
  for (const name of [...member.landmarks, ...member.sockets]) {
    if (!(document.nodes || []).some((node) => node.name === name)) {
      throw new Error(`${member.id} is missing required marker ${name}`);
    }
  }
  writeGlbJson(path, bytes, jsonLength, document);
  return { triangles };
}

function writeGlbJson(path, bytes, jsonLength, document) {
  const json = Buffer.from(JSON.stringify(document));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const suffix = bytes.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + paddedLength + suffix.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  suffix.copy(output, 20 + paddedLength);
  writeFileSync(path, output);
}

function countTriangles(document) {
  return (document.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || []).reduce((meshSum, primitive) => {
    if ((primitive.mode ?? 4) !== 4) return meshSum;
    const indexAccessor = document.accessors?.[primitive.indices];
    const positionAccessor = document.accessors?.[primitive.attributes?.POSITION];
    return meshSum + Math.floor((indexAccessor?.count ?? positionAccessor?.count ?? 0) / 3);
  }, 0), 0);
}

function blenderBoundsToGltf(bounds) {
  const min = [bounds.min[0], bounds.min[2], -bounds.max[1]];
  const max = [bounds.max[0], bounds.max[2], -bounds.min[1]];
  return {
    min,
    max,
    dimensionsM: max.map((value, index) => value - min[index]),
  };
}

function verifyHash(path, expected) {
  const actual = sha256(path).toUpperCase();
  if (actual !== expected) throw new Error(`${repoPath(path)} hash drift: ${actual} != ${expected}`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function repoPath(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}
