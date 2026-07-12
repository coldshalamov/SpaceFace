#!/usr/bin/env node
/**
 * Finalize isolated M4 Ashline V2 source-adapted wholeships into release_candidates/ with
 * real EXT_meshopt_compression (MeshoptEncoder) + KTX2/BasisU textures,
 * matching the SG04 release pattern.
 *
 * Does NOT write into assets/ships/parts or assets/ships/release (default play).
 *
 * Usage:
 *   node tools/art/finalize_m4_ashline_candidate.mjs
 *   node tools/art/finalize_m4_ashline_candidate.mjs dart
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const PACKET = 'M4-ASHLINE-SOURCE-FAMILY-V2-001';
const TEXTURE_SIZE = 1024;

const SHIPS = Object.freeze({
  dart: Object.freeze({
    id: 'ashline_v2_dart',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_DART',
    partId: 'wholeship_ashline_v2_dart',
    role: 'flyby_interceptor',
  }),
  lode: Object.freeze({
    id: 'ashline_v2_lode',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_LODE',
    partId: 'wholeship_ashline_v2_lode',
    role: 'heavy_brawler',
  }),
  rig: Object.freeze({
    id: 'ashline_v2_rig',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_RIG',
    partId: 'wholeship_ashline_v2_rig',
    role: 'tether_control_raider',
  }),
});

function sha256(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex').toUpperCase();
}

function sourcePath(id) {
  return resolve(FAMILY, 'source/wholeships', `${id}.glb`);
}

function candidatePath(id) {
  return resolve(FAMILY, 'release_candidates/wholeships', `${id}.glb`);
}

function rel(abs) {
  return abs.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function decodeImage(buffer) {
  try {
    return decodePng(buffer);
  } catch {
    const decoded = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    };
  }
}

function splitIncompatibleTextureSlots(document) {
  const root = document.getRoot();
  for (const material of root.listMaterials()) {
    const baseTexture = material.getBaseColorTexture();
    const normalTexture = material.getNormalTexture();
    if (!baseTexture || !normalTexture || baseTexture !== normalTexture) continue;
    const image = normalTexture.getImage();
    if (!image) continue;
    const clone = document.createTexture(normalTexture.getName()
      ? `${normalTexture.getName()}_normal_slot`
      : 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

async function prepareSourceContract(abs, spec, io) {
  const document = await io.read(abs);
  const root = document.getRoot();
  normalizeContractNodeTags(root);
  applyContractTextures(document, root, spec);
  const asset = root.getAsset();
  const extras = { ...(asset.extras || {}) };
  extras.textureSize = TEXTURE_SIZE;
  extras.spacefaceAsset = {
    ...(extras.spacefaceAsset || {}),
    assetId: spec.assetId,
    partId: spec.partId,
    family: 'ashline',
    role: spec.role,
    packet: PACKET,
    textureCompression: 'PNG-source',
    textureResolution: `${TEXTURE_SIZE}x${TEXTURE_SIZE}`,
  };
  asset.extras = extras;
  const tmp = `${abs}.source.${process.pid}.${Date.now()}.glb`;
  await io.write(tmp, document);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      if (existsSync(abs)) unlinkSync(abs);
      renameSync(tmp, abs);
      return;
    } catch (error) {
      if (attempt === 11) {
        try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 80 * (attempt + 1)));
    }
  }
}

function normalizeContractNodeTags(root) {
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (/HOOK_DRIVE_/i.test(name) || sf.drive) {
      if (String(sf.damageRole || '').toLowerCase() === 'drive') delete sf.damageRole;
      if (String(extras.damageRole || '').toLowerCase() === 'drive') delete extras.damageRole;
    }
    extras.spaceface = sf;
    node.setExtras(extras);
  }
}

function applyContractTextures(document, root, spec) {
  let index = 0;
  for (const material of root.listMaterials()) {
    const name = material.getName() || `Material_${index}`;
    const seed = hashString(`${spec.id}:${name}`);
    const base = document.createTexture(`${spec.id}_${safeName(name)}_baseColor`)
      .setImage(makeBaseColorPng(material.getBaseColorFactor(), seed, name))
      .setMimeType('image/png');
    const normal = document.createTexture(`${spec.id}_${safeName(name)}_normal`)
      .setImage(makeNormalPng(seed))
      .setMimeType('image/png');
    const orm = document.createTexture(`${spec.id}_${safeName(name)}_orm`)
      .setImage(makeOrmPng(material.getRoughnessFactor(), material.getMetallicFactor(), seed))
      .setMimeType('image/png');
    material
      .setBaseColorTexture(base)
      .setNormalTexture(normal)
      .setNormalScale(1)
      .setOcclusionTexture(orm)
      .setOcclusionStrength(1)
      .setMetallicRoughnessTexture(orm);
    index++;
  }
}

function makeBaseColorPng(factor, seed, materialName) {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  const rgba = Array.isArray(factor) && factor.length >= 4 ? factor : [1, 1, 1, 1];
  const token = String(materialName || '').toLowerCase();
  const emissiveRole = token.includes('cyan') || token.includes('warm');
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const seam = seamAmount(x, y, seed);
      const wear = chipNoise(x, y, seed);
      const shade = emissiveRole ? 1 : clamp(0.82 + wear * 0.25 - seam * 0.28, 0.42, 1.12);
      png.data[i] = byte(rgba[0] * 255 * shade);
      png.data[i + 1] = byte(rgba[1] * 255 * shade);
      png.data[i + 2] = byte(rgba[2] * 255 * shade);
      png.data[i + 3] = byte(rgba[3] * 255);
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

function makeNormalPng(seed) {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const sx = signedSeamNormal(x, 104 + (seed % 41));
      const sy = signedSeamNormal(y, 128 + ((seed >>> 5) % 37));
      const nx = sx * 0.2;
      const ny = sy * 0.2;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      png.data[i] = byte(128 + nx * 127);
      png.data[i + 1] = byte(128 + ny * 127);
      png.data[i + 2] = byte(128 + nz * 127);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

function makeOrmPng(roughnessFactor, metallicFactor, seed) {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  const roughness = clamp(Number.isFinite(roughnessFactor) ? roughnessFactor : 0.58, 0.18, 0.92);
  const metallic = clamp(Number.isFinite(metallicFactor) ? metallicFactor : 0.12, 0, 0.9);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const seam = seamAmount(x, y, seed);
      const wear = chipNoise(x, y, seed ^ 0x9e3779b9);
      png.data[i] = byte(238 - seam * 58 - wear * 10);
      png.data[i + 1] = byte((roughness + seam * 0.08 + wear * 0.035) * 255);
      png.data[i + 2] = byte((metallic + (wear - 0.5) * 0.035) * 255);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

function seamAmount(x, y, seed) {
  const wx = 104 + (seed % 41);
  const wy = 128 + ((seed >>> 5) % 37);
  const dx = Math.min(x % wx, wx - (x % wx));
  const dy = Math.min(y % wy, wy - (y % wy));
  return Math.max(dx <= 2 ? 1 - dx / 3 : 0, dy <= 2 ? 1 - dy / 3 : 0);
}

function signedSeamNormal(value, width) {
  const distance = value % width;
  if (distance <= 2) return -1 + distance / 2;
  if (distance >= width - 2) return 1 - (width - distance) / 2;
  return 0;
}

function chipNoise(x, y, seed) {
  let hash = (x * 374761393 + y * 668265263 + seed * 362437) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) & 255) / 255;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i++) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function safeName(value) {
  return String(value || 'material').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'material';
}

function byte(value) { return Math.max(0, Math.min(255, Math.round(value))); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function markContractNodes(document, sourceCollisionBounds = null) {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (name.startsWith('SOCKET_')) {
      sf.socket = true;
      sf.keep = true;
      extras.socket = true;
      extras.spaceface = sf;
      node.setExtras(extras);
    }
    if (name === 'COLLISION_HULL' || sf.collision || extras.collision) {
      sf.collision = true;
      sf.helper = true;
      sf.nonRender = true;
      sf.role = 'collision';
      if (sourceCollisionBounds && !sf.bounds) sf.bounds = sourceCollisionBounds;
      extras.collision = true;
      extras.nonRender = true;
      extras.spaceface = sf;
      if (sourceCollisionBounds && !extras.bounds) extras.bounds = sourceCollisionBounds;
      node.setExtras(extras);
    }
  }
}

function countTextures(document) {
  return document.getRoot().listTextures().length;
}

function inspectGlbRaw(abs) {
  const buf = readFileSync(abs);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not GLB: ${abs}`);
  let off = 12;
  let json = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
      break;
    }
    off += len;
  }
  if (!json) throw new Error(`no JSON chunk: ${abs}`);
  const images = json.images || [];
  const textures = json.textures || [];
  const bufferViews = json.bufferViews || [];
  let ktx2Count = 0;
  for (const img of images) {
    const mime = (img.mimeType || '').toLowerCase();
    if (mime.includes('ktx') || mime.includes('basis')) ktx2Count += 1;
  }
  const meshoptViews = bufferViews.filter(
    (bv) => bv.extensions && bv.extensions.EXT_meshopt_compression,
  ).length;
  const extensionsUsed = json.extensionsUsed || [];
  return {
    imageCount: images.length,
    textureCount: textures.length,
    ktx2ImageCount: ktx2Count,
    meshoptBufferViewCount: meshoptViews,
    extensionsUsed,
    hasMeshoptExt: extensionsUsed.includes('EXT_meshopt_compression'),
    hasBasisuExt: extensionsUsed.includes('KHR_texture_basisu'),
    nodeNames: (json.nodes || []).map((n) => n.name).filter(Boolean),
    materials: (json.materials || []).map((m) => m.name).filter(Boolean),
  };
}

function stampReleaseMeta(document, spec, sourceTextureCount, proof, sourceSf = {}) {
  const root = document.getRoot();
  const asset = root.getAsset();
  asset.generator = `${asset.generator || ''}; SpaceFace tools/art/finalize_m4_ashline_candidate.mjs`.replace(/^; /, '');
  const extras = { ...(asset.extras || {}) };
  const sf = { ...(sourceSf || {}), ...(extras.spacefaceAsset || {}) };
  // Preserve float axis proof through quantization (accessor min/max become unusable)
  if (sourceSf.lod0AabbSize) sf.lod0AabbSize = sourceSf.lod0AabbSize;
  if (sourceSf.collisionBounds) sf.collisionBounds = sourceSf.collisionBounds;
  sf.assetId = sf.assetId || spec.assetId;
  sf.partId = sf.partId || spec.partId;
  sf.role = sf.role || spec.role;
  sf.family = 'ashline';
  sf.packet = PACKET;
  sf.wiringStatus = 'production_candidate';
  sf.textureCompression = sourceTextureCount > 0 ? 'KTX2/BasisU' : (sf.textureCompression || 'none');
  sf.finalize = {
    meshopt: proof.meshoptApplied,
    ktx2: proof.ktx2Applied,
    meshoptBufferViews: proof.meshoptBufferViewCount,
    ktx2Images: proof.ktx2ImageCount,
    sourceTextureCount,
    releaseTextureCount: proof.textureCount,
    tool: 'finalize_m4_ashline_candidate.mjs',
    pattern: 'SG04 MeshoptEncoder + ktx2-encoder',
  };
  extras.spacefaceAsset = sf;
  extras.assetId = spec.assetId;
  extras.partId = spec.partId;
  asset.extras = extras;

  for (const scene of root.listScenes()) {
    const se = scene.getExtras() || {};
    const base = se.spacefaceAsset || sourceSf || {};
    scene.setExtras({
      ...se,
      spacefaceAsset: {
        ...base,
        textureCompression: sf.textureCompression,
        packet: PACKET,
        lod0AabbSize: sf.lod0AabbSize || base.lod0AabbSize,
        collisionBounds: sf.collisionBounds || base.collisionBounds,
      },
    });
  }
}

async function finalizeOne(key, spec, io) {
  const src = sourcePath(spec.id);
  const dst = candidatePath(spec.id);
  if (!existsSync(src)) {
    throw new Error(`missing source GLB: ${src}`);
  }
  await prepareSourceContract(src, spec, io);
  mkdirSync(dirname(dst), { recursive: true });

  const sourceRaw = inspectGlbRaw(src);
  const sourceTextureCount = sourceRaw.textureCount || sourceRaw.imageCount;
  // Capture float-space axis/collision stamps before transforms (quantize destroys accessor AABB)
  const sourceDocJson = (() => {
    try {
      const buf = readFileSync(src);
      let off = 12;
      while (off + 8 <= buf.length) {
        const len = buf.readUInt32LE(off);
        const type = buf.readUInt32LE(off + 4);
        off += 8;
        if (type === 0x4e4f534a) {
          return JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
        }
        off += len;
      }
    } catch { /* ignore */ }
    return null;
  })();
  const sourceSf = sourceDocJson?.asset?.extras?.spacefaceAsset || {};

  const document = await io.read(src);
  markContractNodes(document, sourceSf.collisionBounds || null);
  splitIncompatibleTextureSlots(document);

  const transforms = [];
  let ktx2Applied = false;
  if (sourceTextureCount > 0) {
    // Already-KTX2 sources skip re-encode (pngjs cannot read KTX2).
    const alreadyKtx2 = sourceRaw.ktx2ImageCount > 0
      && sourceRaw.ktx2ImageCount === sourceRaw.imageCount;
    if (!alreadyKtx2) {
      transforms.push(
        ktx2({
          slots: /^baseColorTexture$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2({
          slots: /^normalTexture$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isNormalMap: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
        ktx2({
          slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
      );
      ktx2Applied = true;
    } else {
      ktx2Applied = true; // already native
    }
  }

  transforms.push(meshopt({
    encoder: MeshoptEncoder,
    level: 'high',
    quantizePosition: 14,
    quantizeNormal: 10,
    quantizeTexcoord: 12,
    quantizeColor: 8,
    quantizeWeight: 8,
    quantizeGeneric: 12,
  }));

  await document.transform(...transforms);

  // Re-mark after transforms (some paths may rewrite extras)
  markContractNodes(document, sourceSf.collisionBounds || null);

  // Pre-write texture count from document graph
  const docTextureCount = countTextures(document);

  const proofStub = {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: 0,
    ktx2ImageCount: 0,
    textureCount: docTextureCount,
  };
  // Write via temp + rename to avoid Windows file-lock UNKNOWN errors on overwrite.
  async function writeAtomic(documentToWrite, targetPath) {
    const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}.glb`;
    await io.write(tmp, documentToWrite);
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        if (existsSync(targetPath)) {
          try { unlinkSync(targetPath); } catch { /* retry */ }
        }
        renameSync(tmp, targetPath);
        return;
      } catch (err) {
        if (attempt === 11) {
          try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
          throw err;
        }
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
      }
    }
  }

  stampReleaseMeta(document, spec, sourceTextureCount, proofStub, sourceSf);
  await writeAtomic(document, dst);

  if (!existsSync(dst) || statSync(dst).size < 100) {
    throw new Error(`finalize write failed for ${spec.id}: ${dst}`);
  }

  const releaseRaw = inspectGlbRaw(dst);

  // Hard contract: sockets + collision must survive
  for (const need of [
    'SOCKET_Weapon_Front',
    'SOCKET_Mining_Front',
    'SOCKET_Engine_Main',
    'SOCKET_Trail_Main',
    'SOCKET_Utility_Dorsal',
    'SOCKET_Cargo_Ventral',
    'SOCKET_Camera_Focus',
    'SOCKET_RCS_Port',
    'SOCKET_RCS_Starboard',
  ]) {
    if (!releaseRaw.nodeNames.includes(need)) {
      throw new Error(`${spec.id}: missing contract node after finalize: ${need}`);
    }
  }
  const collisionNodes = releaseRaw.nodeNames.filter((name) => name.startsWith('COLLISION_HULL_'));
  if (collisionNodes.length < 3) {
    throw new Error(`${spec.id}: compound collision helpers dropped after finalize: ${collisionNodes.length}/3`);
  }

  if (!releaseRaw.hasMeshoptExt || releaseRaw.meshoptBufferViewCount < 1) {
    throw new Error(
      `${spec.id}: EXT_meshopt_compression not present after finalize `
      + `(views=${releaseRaw.meshoptBufferViewCount}, used=${JSON.stringify(releaseRaw.extensionsUsed)})`,
    );
  }

  if (sourceTextureCount > 0) {
    if (releaseRaw.textureCount < sourceTextureCount) {
      throw new Error(
        `${spec.id}: texture count dropped ${sourceTextureCount} → ${releaseRaw.textureCount}`,
      );
    }
    if (releaseRaw.ktx2ImageCount !== releaseRaw.imageCount || releaseRaw.imageCount < 1) {
      throw new Error(
        `${spec.id}: not all release images are KTX2 `
        + `(ktx2=${releaseRaw.ktx2ImageCount}/${releaseRaw.imageCount})`,
      );
    }
  }

  // Re-stamp with proven raw metrics only (no unprovable claims)
  const document2 = await io.read(dst);
  stampReleaseMeta(document2, spec, sourceTextureCount, {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: releaseRaw.meshoptBufferViewCount,
    ktx2ImageCount: releaseRaw.ktx2ImageCount,
    textureCount: releaseRaw.textureCount,
  }, sourceSf);
  await writeAtomic(document2, dst);
  const finalRaw = inspectGlbRaw(dst);

  return {
    id: spec.id,
    key,
    assetId: spec.assetId,
    source: rel(src),
    candidate: rel(dst),
    sourceBytes: statSync(src).size,
    candidateBytes: statSync(dst).size,
    sourceSha256: sha256(src),
    candidateSha256: sha256(dst),
    sourceTextureCount,
    releaseTextureCount: finalRaw.textureCount,
    releaseImageCount: finalRaw.imageCount,
    ktx2ImageCount: finalRaw.ktx2ImageCount,
    meshoptBufferViewCount: finalRaw.meshoptBufferViewCount,
    extensionsUsed: finalRaw.extensionsUsed,
    materials: finalRaw.materials,
    meshopt: finalRaw.hasMeshoptExt ? 'EXT_meshopt_compression' : 'none',
    ktx2: finalRaw.ktx2ImageCount > 0 ? 'KHR_texture_basisu/KTX2' : 'none',
  };
}

async function buildEvidenceContacts() {
  const familyEvidence = resolve(FAMILY, 'evidence/family');
  mkdirSync(familyEvidence, { recursive: true });
  const panels = [
    ['dart', 'DART'], ['lode', 'MAUL'], ['rig', 'HOOK'],
  ];
  const width = 480;
  const height = 270;
  const composites = [];
  for (let i = 0; i < panels.length; i++) {
    const [key, label] = panels[i];
    const image = resolve(FAMILY, `evidence/${key}/renders/gamesky_forward_34.png`);
    if (!existsSync(image)) continue;
    const input = await sharp(image).resize(width, height, { fit: 'cover' }).png().toBuffer();
    const title = Buffer.from(`<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="32" fill="#09111bcc"/><text x="18" y="23" fill="#f5a06b" font-family="monospace" font-size="18" font-weight="700">ASHLINE V2 ${label}</text></svg>`);
    composites.push({ input, left: i * width, top: 0 });
    composites.push({ input: title, left: i * width, top: 0 });
  }
  await sharp({ create: { width: width * 3, height, channels: 4, background: '#09111b' } })
    .composite(composites)
    .png()
    .toFile(resolve(familyEvidence, 'runtime_lineup.png'));

  const distance = [];
  const distanceFiles = [
    ['evidence/dart/renders/readability_under45px.png', 'FAR 45 PX'],
    ['evidence/dart/renders/readability_120px.png', 'MID 120 PX'],
    ['evidence/dart/renders/readability_close.png', 'CLOSE'],
  ];
  for (let i = 0; i < distanceFiles.length; i++) {
    const [relPath, label] = distanceFiles[i];
    const input = await sharp(resolve(FAMILY, relPath)).resize(width, height, { fit: 'contain', background: '#111820' }).png().toBuffer();
    const title = Buffer.from(`<svg width="${width}" height="${height}"><text x="18" y="28" fill="#dbe8ef" font-family="monospace" font-size="18">${label}</text></svg>`);
    distance.push({ input, left: i * width, top: 0 }, { input: title, left: i * width, top: 0 });
  }
  await sharp({ create: { width: width * 3, height, channels: 4, background: '#111820' } })
    .composite(distance)
    .png()
    .toFile(resolve(familyEvidence, 'distance_readability_contact.png'));
}

const evidenceOnly = process.argv.slice(2).includes('--evidence-only');
if (evidenceOnly) {
  await buildEvidenceContacts();
  console.log('[m4-finalize] wrote runtime lineup and distance-readability contact sheets');
  process.exit(0);
}

const selected = process.argv.slice(2).map((s) => s.toLowerCase());
const keys = selected.length ? selected : Object.keys(SHIPS);
for (const k of keys) {
  if (!SHIPS[k]) {
    console.error(`Unknown ship "${k}". Expected: ${Object.keys(SHIPS).join(', ')}`);
    process.exit(2);
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const results = [];
for (const k of keys) {
  const r = await finalizeOne(k, SHIPS[k], io);
  results.push(r);
  console.log(
    `[m4-finalize] ${k}: ${r.sourceBytes} → ${r.candidateBytes} bytes `
    + `(meshoptViews=${r.meshoptBufferViewCount}, ktx2=${r.ktx2ImageCount}/${r.releaseImageCount}, `
    + `tex ${r.sourceTextureCount}→${r.releaseTextureCount})`,
  );
}

const out = {
  schema: 'spaceface.m4AshlineSourceFamilyFinalize.v1',
  packet: PACKET,
  family: 'ashline_v2',
  isolation: {
    defaultPlayWired: false,
    partsManifestTouched: false,
    releasePartsTouched: false,
    k0HeliosUntouched: true,
  },
  finalized: results,
};

const evidencePath = resolve(FAMILY, 'evidence/family/finalize_report.json');
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, JSON.stringify(out, null, 2));
await buildEvidenceContacts();
console.log(JSON.stringify(out, null, 2));
