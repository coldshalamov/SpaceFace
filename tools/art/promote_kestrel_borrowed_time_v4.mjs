import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FAMILY_ROOT = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4');
const LIVE_SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/wholeships');
const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const LIVE_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME_V4';
const FACTOR_ONLY_MATERIAL_ROLES = Object.freeze({
  Material_Decal_BorrowedTime: 'decal',
  Material_Decal_Hazard: 'decal',
  Material_Decal_Stencils: 'decal',
  Material_Emissive_Cyan: 'emissive',
  Material_Emissive_DriveCore: 'emissive',
  Material_Emissive_Orange: 'emissive',
  Material_Glass_Canopy: 'canopy',
});
const SOCKET_CONTRACT = Object.freeze({
  SOCKET_Weapon_Front: Object.freeze({ translation: [12.62, 1.43, 0], forward: [1, 0, 0], role: 'weapon_muzzle' }),
  SOCKET_Mining_Front: Object.freeze({ translation: [12.26, -1.08, 0], forward: [1, 0, 0], role: 'mining_emitter' }),
  SOCKET_Engine_Main: Object.freeze({ translation: [-13.85, 0, 0], forward: [-1, 0, 0], role: 'engine_exhaust' }),
  SOCKET_Trail_Main: Object.freeze({ translation: [-14.05, 0, 0], forward: [-1, 0, 0], role: 'engine_trail' }),
  SOCKET_Utility_Dorsal: Object.freeze({ translation: [-1.45, 1.95, -3.8], forward: [0, 1, 0], role: 'utility_dorsal' }),
  SOCKET_Cargo_Ventral: Object.freeze({ translation: [-0.8, -2.1, 0], forward: [0, -1, 0], role: 'cargo_ventral' }),
  SOCKET_Camera_Focus: Object.freeze({ translation: [0, 0.35, 0], forward: [1, 0, 0], role: 'camera_focus' }),
  // SpaceFace's authored contract is +Z starboard. The accepted candidate exported
  // these two labels on the opposite sides, so promotion corrects the semantic seam.
  SOCKET_RCS_Port: Object.freeze({ translation: [1.6, 0.45, -6.6], forward: [0, 0, -1], role: 'rcs_port' }),
  SOCKET_RCS_Starboard: Object.freeze({ translation: [1.6, 0.45, 6.6], forward: [0, 0, 1], role: 'rcs_starboard' }),
});

const FAMILY = Object.freeze([
  Object.freeze({
    lod: 0,
    candidate: 'source/wholeships/kestrel_borrowed_time_v4_lod0.glb',
    candidateSha256: '2EAC62E9796707D910938A474A73AD86F0DC51606797C0D0BBBB0A5814888B9D',
    live: 'kestrel.glb',
  }),
  Object.freeze({
    lod: 1,
    candidate: 'source/wholeships/kestrel_borrowed_time_v4_lod1.glb',
    candidateSha256: '33BE2EBB0D5274DF4D28CD324926C99F4E8EE6740C6D0F499266B6FCC7BCE3E0',
    live: 'kestrel_lod1.glb',
  }),
  Object.freeze({
    lod: 2,
    candidate: 'source/wholeships/kestrel_borrowed_time_v4_lod2.glb',
    candidateSha256: '1F19E69C16FB4FA15E1BC731A80C615D669337A10B0BD6ECD42A9F067BE48241',
    live: 'kestrel_lod2.glb',
  }),
]);

mkdirSync(LIVE_SOURCE_ROOT, { recursive: true });
const receipt = [];
for (const member of FAMILY) {
  const candidatePath = resolve(FAMILY_ROOT, member.candidate);
  const candidateBytes = readFileSync(candidatePath);
  const candidateHash = sha256(candidateBytes);
  if (candidateHash !== member.candidateSha256) {
    throw new Error(`accepted V4 LOD${member.lod} hash drift: ${candidateHash}`);
  }

  const livePath = resolve(LIVE_SOURCE_ROOT, member.live);
  const liveBytes = patchLiveMetadata(candidateBytes, member);
  writeAtomic(livePath, liveBytes);
  receipt.push({
    lod: member.lod,
    acceptedCandidate: `assets/ships/kestrel_borrowed_time_v4/${member.candidate}`,
    acceptedCandidateSha256: candidateHash,
    liveSource: `assets/ships/parts/wholeships/${member.live}`,
    liveSourceSha256: sha256(liveBytes),
    liveSourceBytes: liveBytes.length,
  });
}

console.log(JSON.stringify({
  schema: 'spaceface.kestrelBorrowedTimeV4.livePromotion.v1',
  assetId: LIVE_ASSET_ID,
  playerOnly: true,
  runtimeLod: 'lod0',
  retainedLodFamily: FAMILY.map(({ lod, live }) => ({ lod, file: `wholeships/${live}` })),
  members: receipt,
}, null, 2));

function patchLiveMetadata(bytes, member) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error(`LOD${member.lod} is not GLB v2`);
  }
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`LOD${member.lod} length mismatch`);

  const chunks = [];
  let offset = 12;
  let patchedJson = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset + 8 + length > bytes.length) throw new Error(`LOD${member.lod} chunk overrun`);
    if (type === JSON_CHUNK) {
      const json = JSON.parse(data.toString('utf8').trim());
      const semanticMaterials = (json.materials || [])
        .filter((material) => FACTOR_ONLY_MATERIAL_ROLES[material.name]);
      const unknownSemanticMaterials = (json.materials || [])
        .filter((material) => /^Material_(?:Decal|Emissive|Glass)_/.test(material.name || ''))
        .filter((material) => !FACTOR_ONLY_MATERIAL_ROLES[material.name]);
      if (unknownSemanticMaterials.length) {
        throw new Error(`LOD${member.lod} has undeclared semantic materials: ${unknownSemanticMaterials.map(({ name }) => name).join(', ')}`);
      }
      json.asset = json.asset || {};
      json.asset.generator = appendGeneratorStep(json.asset.generator, 'build_v4.py');
      json.asset.generator = appendGeneratorStep(json.asset.generator, 'promote_kestrel_borrowed_time_v4.mjs');
      json.asset.extras = json.asset.extras || {};
      const current = json.asset.extras.spacefaceAsset || {};
      json.asset.extras.assetId = LIVE_ASSET_ID;
      json.asset.extras.partId = 'wholeship_kestrel';
      json.asset.extras.category = 'wholeships';
      json.asset.extras.priority = 'P0';
      json.asset.extras.triangleCount = [19_906, 13_962, 12_584][member.lod];
      json.asset.extras.textureSize = 1024;
      json.asset.extras.forwardAxis = '+X';
      json.asset.extras.upAxis = '+Y';
      json.asset.extras.starboardAxis = '+Z';
      json.asset.extras.unit = 'metre';
      json.asset.extras.boundsDimensionsM = [27.83963108062744, 6.942143213439421, 14.03888473658594];
      json.asset.extras.spacefaceAsset = {
        ...current,
        contractVersion: 2,
        assetId: LIVE_ASSET_ID,
        partId: 'wholeship_kestrel',
        packet: 'K0-V4-LIVE-PROMOTION-001',
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
        textureCompression: 'PNG-source',
        geometrySource: 'user Revamp ZIP source blend',
        sourceGeometryPreservation: '85-95 percent',
        meshCompression: 'source-uncompressed',
        chamfered: true,
        factorOnlyMaterials: semanticMaterials.map(({ name }) => name),
        embeddedPlume: false,
        wiringStatus: member.lod === 0 ? 'live_player_only' : 'retained_lod_family_member',
        acceptanceClaim: true,
        acceptedCandidateSha256: member.candidateSha256,
        liveRuntimeFile: `wholeships/${member.live}`,
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
  const temp = `${target}.v4-promote-${process.pid}.tmp`;
  writeFileSync(temp, bytes);
  try {
    renameSync(temp, target);
    return;
  } catch (error) {
    // Windows can refuse replace-by-rename while a scanner has the existing GLB
    // mapped. Copying over the file still preserves the completed temp payload.
    if (!isTransientWindowsReplaceError(error)) throw error;
  }
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      copyFileSync(temp, target);
      unlinkSync(temp);
      return;
    } catch (error) {
      if (!isTransientWindowsReplaceError(error)) throw error;
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  throw lastError || new Error(`unable to replace ${target}`);
}

function isTransientWindowsReplaceError(error) {
  return ['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'UNKNOWN'].includes(error?.code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}
