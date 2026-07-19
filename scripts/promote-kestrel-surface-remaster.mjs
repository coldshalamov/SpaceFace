#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4');
const APPLY = process.argv.includes('--apply');
const BUILD_REPORT = resolve(FAMILY, 'evidence/build_report.json');
const FINALIZE_REPORT = resolve(FAMILY, 'evidence/finalize_report.json');
const MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME_V4';
const PART_ID = 'kestrel_borrowed_time_v4';
const PACKET = 'SF-K0-BORROWED-TIME-V4-SOURCE-REMASTER-001';
const FACTOR_ONLY_MATERIAL_ROLES = Object.freeze({
  Material_Decal_BorrowedTime: 'decal',
  Material_Decal_Hazard: 'decal',
  Material_Decal_Stencils: 'decal',
  Material_Emissive_Cyan: 'emissive',
  Material_Emissive_DriveCore: 'emissive',
  Material_Emissive_Orange: 'emissive',
  Material_Glass_Canopy: 'canopy',
});
const MEMBERS = Object.freeze([
  Object.freeze({ lod: 0, id: 'wholeship_kestrel', familyFile: 'kestrel_borrowed_time_v4_lod0.glb', live: 'kestrel.glb' }),
  Object.freeze({ lod: 1, id: 'wholeship_kestrel_lod1', familyFile: 'kestrel_borrowed_time_v4_lod1.glb', live: 'kestrel_lod1.glb' }),
  Object.freeze({ lod: 2, id: 'wholeship_kestrel_lod2', familyFile: 'kestrel_borrowed_time_v4_lod2.glb', live: 'kestrel_lod2.glb' }),
]);
const SOCKET_CONTRACT = Object.freeze({
  SOCKET_Weapon_Front: Object.freeze({ position: [12.62, 1.43, 0], role: 'weapon_muzzle', forward: [1, 0, 0] }),
  SOCKET_Mining_Front: Object.freeze({ position: [12.26, -1.08, 0], role: 'mining_emitter', forward: [1, 0, 0] }),
  SOCKET_Engine_Main: Object.freeze({ position: [-13.85, 0, 0], role: 'engine_exhaust', forward: [-1, 0, 0] }),
  SOCKET_Trail_Main: Object.freeze({ position: [-14.05, 0, 0], role: 'engine_trail', forward: [-1, 0, 0] }),
  SOCKET_Utility_Dorsal: Object.freeze({ position: [-1.45, 1.95, -3.8], role: 'utility_dorsal', forward: [0, 1, 0] }),
  SOCKET_Cargo_Ventral: Object.freeze({ position: [-0.8, -2.1, 0], role: 'cargo_ventral', forward: [0, -1, 0] }),
  SOCKET_Camera_Focus: Object.freeze({ position: [0, 0.35, 0], role: 'camera_focus', forward: [1, 0, 0] }),
  SOCKET_RCS_Port: Object.freeze({ position: [1.6, 0.45, -6.6], role: 'rcs_port', forward: [0, 0, -1] }),
  SOCKET_RCS_Starboard: Object.freeze({ position: [1.6, 0.45, 6.6], role: 'rcs_starboard', forward: [0, 0, 1] }),
});

const build = JSON.parse(readFileSync(BUILD_REPORT, 'utf8'));
const finalize = JSON.parse(readFileSync(FINALIZE_REPORT, 'utf8'));
if (build.surfaceRemasterId !== 'kestrel-role-surface-v5') {
  throw new Error(`unexpected surface remaster: ${build.surfaceRemasterId || 'missing'}`);
}
if (!Array.isArray(build.surfaceRemaster) || build.surfaceRemaster.length !== 30) {
  throw new Error('surface remaster must report all 30 Kestrel PBR maps');
}
if (build.goldenPassId !== 'kestrel-golden-asset-v5' || build.goldenAsset?.objectsAdded !== 54) {
  throw new Error('golden-asset V5 geometry/material pass is missing from the deterministic build');
}
if (finalize.ok !== true || !Array.isArray(finalize.determinism)) {
  throw new Error(`finalized candidate is not accepted: ${(finalize.errors || []).join('; ')}`);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const lod0Proof = finalize.proofs?.find((entry) => entry.name === 'close_fore' && entry.lod === 0);
if (!lod0Proof?.meta?.visibleMin || !lod0Proof?.meta?.visibleMax || !lod0Proof?.meta?.size) {
  throw new Error('finalize report is missing the accepted LOD0 world-bounds proof');
}
const acceptedLod0Bounds = Object.freeze({
  min: lod0Proof.meta.visibleMin,
  max: lod0Proof.meta.visibleMax,
  dimensionsM: lod0Proof.meta.size,
});
const planned = [];
for (const member of MEMBERS) {
  const source = resolve(FAMILY, 'source/wholeships', member.familyFile);
  const candidate = resolve(FAMILY, 'release_candidates/wholeships', member.familyFile);
  const live = resolve(ROOT, 'assets/ships/parts/wholeships', member.live);
  const proof = finalize.determinism.find((entry) => entry.lod === member.lod);
  const candidateHash = sha256(candidate);
  if (!proof?.equal || proof.firstSha256?.toLowerCase() !== candidateHash) {
    throw new Error(`LOD${member.lod} candidate does not match its determinism proof`);
  }
  // The hand-authored parts manifest owns the selected LOD0 body. LOD1/LOD2 are explicit
  // WHOLE_SHIP_FILES inputs owned by the generated SG04 release builder.
  const entry = manifest.parts.find((part) => part.id === member.id) || null;
  if (member.lod === 0 && !entry) throw new Error(`parts manifest entry missing: ${member.id}`);
  planned.push({ member, source, candidate, live, entry, candidateHash });
}

if (APPLY) {
  for (const item of planned) {
    copyFileSync(item.source, item.live);
    const metrics = stampAcceptedSource(item.live, item.member, item.candidateHash);
    item.bytes = statSync(item.live).size;
    item.triangles = metrics.triangles;
    if (item.entry) {
      item.entry.bytes = item.bytes;
      item.entry.tris = metrics.triangles;
      item.entry.bounds = acceptedLod0Bounds;
      item.entry.note = `K0 Borrowed Time V5-plus live promotion 2026-07-18 — accepted source-faithful player-only LOD0 (${finalize.lods[0].triangles.toLocaleString('en-US')} visible tris / ${finalize.lods[0].draws} semantic draws) with independently authored retained LOD1/LOD2 family (${finalize.lods[1].triangles.toLocaleString('en-US')} / ${finalize.lods[2].triangles.toLocaleString('en-US')} visible tris), 9 stable sockets, 92%-fit collision hull, KTX2/meshopt release path, no embedded plume, and exact project-original provenance at assets/ships/kestrel_borrowed_time_v4/PROVENANCE.json. Graphics surface remaster ${build.surfaceRemasterId} plus ${build.goldenPassId}: layered functional construction, role-specific coated paint, structural and directional metal, engine ceramic, radiator, canopy glass, utility hardware, integrated service markings, and identity surfaces calibrated for the normal game camera.`;
    }
  }
  if (manifest.budgets?.maxBytesPerWholeShipNote) {
    manifest.budgets.maxBytesPerWholeShipNote = `Structural source/package guard, not a quality ceiling. Raised for the accepted source-faithful Kestrel V5-plus LOD0 (${(planned[0].bytes / 1_000_000).toFixed(2)}MB source, ${planned[0].triangles.toLocaleString('en-US')} total tris, ${finalize.lods[0].draws} semantic draws); every live family member remains below GitHub's 100MiB hard limit and release residency is measured independently.`;
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  ok: true,
  applied: APPLY,
  surfaceRemasterId: build.surfaceRemasterId,
  goldenPassId: build.goldenPassId,
  next: APPLY ? 'npm run build:sg04:release-assets' : 'rerun with --apply after review',
  members: planned.map((item) => ({
    lod: item.member.lod,
    source: repoPath(item.source),
    candidate: repoPath(item.candidate),
    live: repoPath(item.live),
    bytes: APPLY ? item.bytes : statSync(item.source).size,
    acceptedCandidateSha256: item.candidateHash,
  })),
}, null, 2));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function stampAcceptedSource(path, member, acceptedCandidateSha256) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`not a GLB v2 file: ${path}`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`GLB JSON chunk missing: ${path}`);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
  const triangles = countTriangles(document);
  // Keep the complete semantic exception contract on every family member so
  // source and compressed release LODs advertise the same material language.
  // Individual material extras below are still stamped only when that LOD
  // actually contains the material.
  const factorOnlyMaterials = Object.keys(FACTOR_ONLY_MATERIAL_ROLES);
  const boundsDimensionsM = member.lod === 0 ? acceptedLod0Bounds.dimensionsM : undefined;
  document.asset = document.asset || {};
  document.asset.extras = document.asset.extras || {};
  document.asset.extras.assetId = ASSET_ID;
  document.asset.extras.partId = member.id;
  document.asset.extras.category = 'wholeships';
  document.asset.extras.priority = 'P0';
  document.asset.extras.triangleCount = triangles;
  document.asset.extras.textureSize = 1024;
  document.asset.extras.forwardAxis = '+X';
  document.asset.extras.upAxis = '+Y';
  document.asset.extras.starboardAxis = '+Z';
  document.asset.extras.unit = 'metre';
  if (boundsDimensionsM) document.asset.extras.boundsDimensionsM = boundsDimensionsM;
  document.asset.extras.spacefaceAsset = {
    ...(document.asset.extras.spacefaceAsset || {}),
    contractVersion: 2,
    assetId: ASSET_ID,
    partId: PART_ID,
    packet: PACKET,
    family: PART_ID,
    category: 'wholeships',
    slot: 'hull',
    lod: `lod${member.lod}`,
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    tangentConvention: 'MikkTSpace',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    chamfered: true,
    factorOnlyMaterials,
    textureCompression: 'PNG-source',
    geometrySource: 'user Revamp ZIP source blend',
    sourceGeometryPreservation: '85-95 percent',
    embeddedPlume: false,
    deliverableRole: `source-faithful-runtime-lod${member.lod}`,
    surfaceRemasterId: build.surfaceRemasterId,
    goldenPassId: build.goldenPassId,
    acceptedCandidateSha256: acceptedCandidateSha256.toUpperCase(),
    acceptanceClaim: true,
    wiringStatus: member.lod === 0 ? 'live_player_only' : 'retained_lod_family_member',
  };
  for (const material of document.materials || []) {
    const materialRole = FACTOR_ONLY_MATERIAL_ROLES[material.name];
    if (!materialRole) continue;
    material.extras = material.extras || {};
    material.extras.spaceface = {
      ...(material.extras.spaceface || {}),
      factorOnly: true,
      materialRole,
    };
  }
  const seenSockets = new Set();
  for (const node of document.nodes || []) {
    const contract = SOCKET_CONTRACT[node.name];
    if (!contract) continue;
    node.translation = contract.position;
    node.extras = {
      ...(node.extras || {}),
      socket: true,
      spaceface: { socket: true, role: contract.role, forward: contract.forward },
    };
    seenSockets.add(node.name);
  }
  if (seenSockets.size !== Object.keys(SOCKET_CONTRACT).length) {
    throw new Error(`accepted source has ${seenSockets.size}/9 canonical sockets: ${path}`);
  }
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
  return { triangles };
}

function countTriangles(document) {
  return (document.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || []).reduce((meshSum, primitive) => {
    if ((primitive.mode ?? 4) !== 4) return meshSum;
    const indexAccessor = document.accessors?.[primitive.indices];
    const positionAccessor = document.accessors?.[primitive.attributes?.POSITION];
    return meshSum + Math.floor((indexAccessor?.count ?? positionAccessor?.count ?? 0) / 3);
  }, 0), 0);
}

function repoPath(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}
