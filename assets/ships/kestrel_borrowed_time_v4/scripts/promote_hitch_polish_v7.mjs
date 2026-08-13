#!/usr/bin/env node
/**
 * Promote the accepted Hitch V7 polish family over live Hitch.
 *
 * Copies hash-bound V7 source/release candidates into the live wholeship paths,
 * stamps the live wiring contract, and updates the Hitch-owned manifest rows.
 * Does not reuse the old V4 promote hashes.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FAMILY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/wholeships');
const LIVE_RELEASE_ROOT = resolve(ROOT, 'assets/ships/release/parts/wholeships');
const PARTS_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const BUILD_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/build_report.json');
const FINALIZE_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/finalize_report.json');
const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const LIVE_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME_V4';
const PACKET = 'SF-K0-HITCH-POLISH-V7-001';
const FACTOR_ONLY_MATERIAL_ROLES = Object.freeze({
  Material_Emissive_Cyan: 'emissive',
  Material_Emissive_DriveCore: 'emissive',
  Material_Emissive_Orange: 'emissive',
  Material_Glass_Canopy: 'canopy',
  Material_V6_MarkingIvory: 'marking',
});
const SOCKET_CONTRACT = Object.freeze({
  SOCKET_Weapon_Front: Object.freeze({ translation: [12.62, 1.43, 0], forward: [1, 0, 0], role: 'weapon_muzzle' }),
  SOCKET_Mining_Front: Object.freeze({ translation: [12.26, -1.08, 0], forward: [1, 0, 0], role: 'mining_emitter' }),
  SOCKET_Engine_Main: Object.freeze({ translation: [-13.85, 0, 0], forward: [-1, 0, 0], role: 'engine_exhaust' }),
  SOCKET_Trail_Main: Object.freeze({ translation: [-14.05, 0, 0], forward: [-1, 0, 0], role: 'engine_trail' }),
  SOCKET_Utility_Dorsal: Object.freeze({ translation: [-1.45, 1.95, -3.8], forward: [0, 1, 0], role: 'utility_dorsal' }),
  SOCKET_Cargo_Ventral: Object.freeze({ translation: [-0.8, -2.1, 0], forward: [0, -1, 0], role: 'cargo_ventral' }),
  SOCKET_Camera_Focus: Object.freeze({ translation: [0, 0.35, 0], forward: [1, 0, 0], role: 'camera_focus' }),
  SOCKET_RCS_Port: Object.freeze({ translation: [1.6, 0.45, -6.6], forward: [0, 0, -1], role: 'rcs_port' }),
  SOCKET_RCS_Starboard: Object.freeze({ translation: [1.6, 0.45, 6.6], forward: [0, 0, 1], role: 'rcs_starboard' }),
});
const FAMILY_MEMBERS = Object.freeze([
  Object.freeze({ lod: 0, live: 'kestrel.glb', manifestId: 'wholeship_kestrel' }),
  Object.freeze({ lod: 1, live: 'kestrel_lod1.glb', manifestId: 'wholeship_kestrel_lod1' }),
  Object.freeze({ lod: 2, live: 'kestrel_lod2.glb', manifestId: 'wholeship_kestrel_lod2' }),
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sha256File = (path) => sha256(readFileSync(path));

if (!existsSync(BUILD_REPORT) || !existsSync(FINALIZE_REPORT)) {
  throw new Error('V7 build/finalize reports missing');
}
const build = JSON.parse(readFileSync(BUILD_REPORT, 'utf8'));
const finalize = JSON.parse(readFileSync(FINALIZE_REPORT, 'utf8'));
if (build.status !== 'complete' || finalize.status !== 'complete') {
  throw new Error('V7 candidate is not complete');
}
if (build.generationFingerprint !== finalize.generationFingerprint) {
  throw new Error('V7 build/finalize fingerprint mismatch');
}

const receipt = [];
for (const member of FAMILY_MEMBERS) {
  const sourcePath = resolve(FAMILY, build.lods[member.lod].path);
  const releasePath = resolve(ROOT, finalize.releases[member.lod].path);
  const sourceHash = sha256File(sourcePath);
  const releaseHash = sha256File(releasePath);
  if (sourceHash !== build.lods[member.lod].sha256) {
    throw new Error(`V7 source hash drift LOD${member.lod}`);
  }
  if (sourceHash !== finalize.sources[member.lod].sha256) {
    throw new Error(`V7 finalize source hash drift LOD${member.lod}`);
  }
  if (releaseHash !== finalize.releases[member.lod].sha256) {
    throw new Error(`V7 release hash drift LOD${member.lod}`);
  }

  const liveSourcePath = resolve(LIVE_SOURCE_ROOT, member.live);
  const liveReleasePath = resolve(LIVE_RELEASE_ROOT, member.live);
  const liveSourceBytes = patchLiveMetadata(readFileSync(sourcePath), member, {
    acceptedCandidateSha256: sourceHash,
    textureCompression: 'PNG-source',
    meshCompression: 'source-uncompressed',
    generatorStep: 'promote_hitch_polish_v7.mjs',
  });
  const liveReleaseBytes = patchLiveMetadata(readFileSync(releasePath), member, {
    acceptedCandidateSha256: sourceHash,
    textureCompression: 'KTX2/BasisU+mips',
    meshCompression: 'EXT_meshopt_compression',
    generatorStep: 'promote_hitch_polish_v7.mjs',
  });
  writeAtomic(liveSourcePath, liveSourceBytes);
  writeAtomic(liveReleasePath, liveReleaseBytes);
  receipt.push({
    lod: member.lod,
    acceptedCandidateSha256: sourceHash,
    liveSource: `assets/ships/parts/wholeships/${member.live}`,
    liveSourceSha256: sha256(liveSourceBytes),
    liveSourceBytes: liveSourceBytes.length,
    liveRelease: `assets/ships/release/parts/wholeships/${member.live}`,
    liveReleaseSha256: sha256(liveReleaseBytes),
    liveReleaseBytes: liveReleaseBytes.length,
    triangles: finalize.sources[member.lod].triangles,
    draws: finalize.sources[member.lod].draws,
  });
}

const partsManifest = JSON.parse(readFileSync(PARTS_MANIFEST, 'utf8'));
const lod0 = receipt[0];
const kestrelPart = partsManifest.parts.find((part) => part.id === 'wholeship_kestrel');
if (!kestrelPart) throw new Error('parts manifest missing wholeship_kestrel');
kestrelPart.tris = lod0.triangles;
kestrelPart.bytes = lod0.liveSourceBytes;
kestrelPart.hooks = [
  'HOOK_NAV_PORT',
  'HOOK_NAV_STARBOARD',
  'HOOK_DRIVE_CORE',
  'HOOK_SENSOR_DISH',
  'HOOK_ARMOR_PORT',
  'HOOK_SECONDARY_POD',
];
kestrelPart.note = 'Hitch V7 polish live promotion — same boat, manufactured drive/sensor/shoulders/radiators, DIE LAUGHING spray stencil, role-mapped PBR, nine sockets, no baked plume.';
writeFileSync(PARTS_MANIFEST, `${JSON.stringify(partsManifest, null, 2)}\n`);

const releaseManifest = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
for (const member of FAMILY_MEMBERS) {
  const row = receipt[member.lod];
  const entry = releaseManifest.assets.find((asset) => asset.id === member.manifestId);
  if (!entry) throw new Error(`release manifest missing ${member.manifestId}`);
  entry.sourceSha256 = row.liveSourceSha256.toLowerCase();
  entry.releaseSha256 = row.liveReleaseSha256.toLowerCase();
  entry.sourceBytes = row.liveSourceBytes;
  entry.releaseBytes = row.liveReleaseBytes;
}
writeFileSync(RELEASE_MANIFEST, `${JSON.stringify(releaseManifest, null, 2)}\n`);

const promoteReport = {
  schema: 'spaceface.hitchPolishV7.livePromotion.v1',
  status: 'complete',
  assetId: LIVE_ASSET_ID,
  packet: PACKET,
  generationFingerprint: build.generationFingerprint,
  playerOnly: true,
  runtimeLod: 'lod0',
  members: receipt,
};
writeFileSync(
  resolve(FAMILY, 'evidence/hitch_polish_v7/promote_report.json'),
  `${JSON.stringify(promoteReport, null, 2)}\n`,
);
process.stdout.write(`HITCH_POLISH_V7_PROMOTE=${JSON.stringify(promoteReport)}\n`);

function patchLiveMetadata(bytes, member, options) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error(`LOD${member.lod} is not GLB v2`);
  }
  const chunks = [];
  let offset = 12;
  let patchedJson = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      const json = JSON.parse(data.toString('utf8').replace(/\0+$/, '').trim());
      const semanticMaterials = (json.materials || [])
        .filter((material) => FACTOR_ONLY_MATERIAL_ROLES[material.name]);
      const unknownSemanticMaterials = (json.materials || [])
        .filter((material) => /^Material_(?:Decal|Emissive|Glass)_/.test(material.name || ''))
        .filter((material) => !FACTOR_ONLY_MATERIAL_ROLES[material.name])
        .filter((material) => !material.pbrMetallicRoughness?.baseColorTexture);
      if (unknownSemanticMaterials.length) {
        throw new Error(
          `LOD${member.lod} has undeclared semantic materials: `
          + unknownSemanticMaterials.map(({ name }) => name).join(', '),
        );
      }
      json.asset = json.asset || {};
      json.asset.generator = appendGeneratorStep(json.asset.generator, options.generatorStep);
      json.asset.extras = json.asset.extras || {};
      const current = json.asset.extras.spacefaceAsset || {};
      json.asset.extras.assetId = LIVE_ASSET_ID;
      json.asset.extras.partId = 'wholeship_kestrel';
      json.asset.extras.category = 'wholeships';
      json.asset.extras.spacefaceAsset = {
        ...current,
        contractVersion: 2,
        assetId: LIVE_ASSET_ID,
        partId: 'wholeship_kestrel',
        packet: PACKET,
        family: 'kestrel_borrowed_time_v4',
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
        textureCompression: options.textureCompression,
        meshCompression: options.meshCompression,
        chamfered: true,
        factorOnlyMaterials: semanticMaterials.map(({ name }) => name).sort(),
        embeddedPlume: false,
        wiringStatus: member.lod === 0 ? 'live_player_only' : 'retained_lod_family_member',
        acceptanceClaim: true,
        acceptedCandidateSha256: options.acceptedCandidateSha256,
        liveRuntimeFile: `wholeships/${member.live}`,
        polishPassId: 'kestrel-hitch-polish-v7',
        surfaceRemasterId: 'kestrel-hitch-polish-v7-surface',
      };
      for (const material of semanticMaterials) {
        const materialRole = FACTOR_ONLY_MATERIAL_ROLES[material.name];
        material.extras = material.extras || {};
        material.extras.spaceface = {
          ...(material.extras.spaceface || {}),
          factorOnly: true,
          materialRole,
        };
      }
      const seenSockets = new Set();
      for (const node of json.nodes || []) {
        const socket = SOCKET_CONTRACT[node.name];
        if (!socket) continue;
        seenSockets.add(node.name);
        node.translation = [...socket.translation];
        node.extras = node.extras || {};
        node.extras.socket = true;
        node.extras.spaceface = {
          ...(node.extras.spaceface || {}),
          socket: true,
          role: socket.role,
          forward: [...socket.forward],
        };
      }
      const missingSockets = Object.keys(SOCKET_CONTRACT).filter((name) => !seenSockets.has(name));
      if (missingSockets.length) {
        throw new Error(`LOD${member.lod} missing required sockets: ${missingSockets.join(', ')}`);
      }
      const encoded = Buffer.from(JSON.stringify(json), 'utf8');
      const padding = (4 - (encoded.length % 4)) % 4;
      chunks.push({ type, data: Buffer.concat([encoded, Buffer.alloc(padding, 0x20)]) });
      patchedJson = true;
    } else {
      chunks.push({ type, data: Buffer.from(data) });
    }
    offset += 8 + length;
  }
  if (!patchedJson) throw new Error(`LOD${member.lod} has no JSON chunk`);
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const out = Buffer.allocUnsafe(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(GLB_VERSION, 4);
  out.writeUInt32LE(total, 8);
  offset = 12;
  for (const chunk of chunks) {
    out.writeUInt32LE(chunk.data.length, offset);
    out.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(out, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return out;
}

function appendGeneratorStep(generator, step) {
  const parts = String(generator || 'Khronos glTF Blender I/O')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(step)) parts.push(step);
  return parts.join(' | ');
}

function writeAtomic(target, bytes) {
  const temp = `${target}.v7-promote-${process.pid}.tmp`;
  writeFileSync(temp, bytes);
  try {
    renameSync(temp, target);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
}
