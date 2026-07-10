// finalize_part.mjs — post-process a Blender-exported part GLB so it satisfies the
// SF_SHIP_PARTS_V1 contract enforced by scripts/check-parts-manifest.mjs, then patch
// the manifest entry (tris/bytes/bounds) to match.
//
// Usage:  node tools/art/finalize_part.mjs <exported.glb> <partId>
//
// The exported GLB comes straight from Blender (geometry + embedded PNG textures +
// node names + spaceface.* node extras). This script:
//   1. parses it,
//   2. computes triangle count + world-space bounds EXACTLY as the checker does,
//   3. derives + writes asset.generator/version/extras + scenes[0].extras,
//   4. ensures spaceface.tint extras on root + LOD meshes (faction recolor),
//   5. re-serialises with 4-byte-aligned chunks,
//   6. writes the final GLB to its manifest path under assets/ships/parts/,
//   7. patches the manifest entry (tris, bytes, bounds) and rewrites the manifest.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import * as THREE from 'three';

import { validateEngineDriveSurface } from './lib/engineDriveSurfaceValidation.mjs';
import {
  allowsFactorOnlySource,
  applyPartProvenance,
  generatorForAuthoringMethod,
  isBlenderAuthoringMethod,
} from './lib/partProvenance.mjs';
import { validateSourceTextureRoleCoverage } from './lib/sourceTextureRoleValidation.mjs';
import { resolvePartOutputPath } from './lib/partOutputPathContainment.mjs';
import { parseStrictEmbeddedGlb } from './lib/strictGlbValidation.mjs';
import { publishTwoFileTransaction } from './lib/twoFileTransaction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART_ROOT = resolve(ROOT, 'assets/ships/parts');
const MANIFEST_PATH = resolve(PART_ROOT, 'parts_manifest.json');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');

function loadAuthoringEntry(partId) {
  if (!existsSync(AUTHORING_PATH)) return null;
  const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
  return authoring?.entries?.[partId] ?? null;
}

function resolveAuthoringMethod(partId, methodArg, authoringEntry) {
  if (methodArg && authoringEntry?.method && methodArg !== authoringEntry.method) {
    throw new Error(`authoring method mismatch for '${partId}': registry=${authoringEntry.method} cli=${methodArg}`);
  }
  const method = methodArg ?? authoringEntry?.method ?? null;
  generatorForAuthoringMethod(method);
  if (isBlenderAuthoringMethod(method) && !authoringEntry) {
    throw new Error(`Blender-authored part '${partId}' must be registered in ${AUTHORING_PATH}`);
  }
  return method;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const SLOT_BY_CATEGORY = {
  hulls: 'hull', cockpits: 'cockpit', engines: 'engine', weapons: 'weapon',
  fins: 'fin', greebles: 'greeble', gear: 'gear', pods: 'pod', places: 'place',
};

function countTriangles(gltf) {
  return (gltf.meshes || []).reduce((sum, mesh) =>
    sum + (mesh.primitives || []).reduce((m, p) => {
      if ((p.mode ?? 4) !== 4) return m;
      const ia = gltf.accessors?.[p.indices];
      const pa = gltf.accessors?.[p.attributes?.POSITION];
      const count = ia?.count ?? pa?.count ?? 0;
      return m + Math.floor(count / 3);
    }, 0), 0);
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new THREE.Matrix4().fromArray(node.matrix);
  const p = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
  const q = new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);
  const s = new THREE.Vector3().fromArray(node.scale || [1, 1, 1]);
  return new THREE.Matrix4().compose(p, q, s);
}

function worldBounds(gltf, binary) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const visit = (idx, parent) => {
    const node = gltf.nodes?.[idx];
    if (!node) return;
    const world = parent.clone().multiply(nodeMatrix(node));
    if (node.mesh != null) {
      for (const prim of gltf.meshes?.[node.mesh]?.primitives || []) {
        const acc = gltf.accessors?.[prim.attributes?.POSITION];
        const view = gltf.bufferViews?.[acc?.bufferView];
        if (!acc || !view || acc.type !== 'VEC3' || acc.componentType !== 5126) continue;
        const stride = view.byteStride || 12;
        const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
        const pt = new THREE.Vector3();
        for (let i = 0; i < acc.count; i++) {
          const o = start + i * stride;
          pt.set(data.getFloat32(o, true), data.getFloat32(o + 4, true), data.getFloat32(o + 8, true)).applyMatrix4(world);
          min.min(pt); max.max(pt);
        }
      }
    }
    for (const c of node.children || []) visit(c, world);
  };
  const roots = gltf.scenes?.[gltf.scene || 0]?.nodes || gltf.scenes?.[0]?.nodes || [];
  for (const r of roots) visit(r, new THREE.Matrix4());
  return { min: min.toArray(), max: max.toArray() };
}

function round(v, d = 4) { const f = 10 ** d; return Math.round(v * f) / f; }

function serializeGlb(gltf, binary) {
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) json = Buffer.concat([json, Buffer.from(' '.repeat(jsonPad))]);
  let bin = binary;
  const binPad = (4 - (bin.length % 4)) % 4;
  if (binPad) bin = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(GLB_MAGIC, o); o += 4;
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(json.length, o); o += 4;
  out.writeUInt32LE(CHUNK_JSON, o); o += 4;
  json.copy(out, o); o += json.length;
  if (bin.length) {
    out.writeUInt32LE(bin.length, o); o += 4;
    out.writeUInt32LE(CHUNK_BIN, o); o += 4;
    bin.copy(out, o); o += bin.length;
  }
  return out;
}

function textureImageIndex(texture) {
  return texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source ?? null;
}

function embeddedImageBytes(gltf, binary, image) {
  if (image?.bufferView == null || image.uri) {
    throw new Error(`source image '${image?.name || '<unnamed>'}' must be embedded in the GLB`);
  }
  const view = gltf.bufferViews?.[image.bufferView];
  if (!view || (view.buffer ?? 0) !== 0) {
    throw new Error(`source image '${image?.name || '<unnamed>'}' has an invalid bufferView`);
  }
  const start = view.byteOffset || 0;
  return binary.subarray(start, start + view.byteLength);
}

function toPng(bytes, mimeType) {
  let decoded;
  if (mimeType === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    decoded = PNG.sync.read(Buffer.from(bytes));
  } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    decoded = JPEG.decode(Buffer.from(bytes), { useTArray: true });
  } else {
    throw new Error(`unsupported canonical source image type '${mimeType || '<missing>'}'`);
  }
  const png = new PNG({ width: decoded.width, height: decoded.height });
  png.data = Buffer.from(decoded.data);
  const opaque = png.data.every((value, index) => index % 4 !== 3 || value === 255);
  return PNG.sync.write(png, {
    colorType: opaque ? 2 : 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
  });
}

function repackBufferViews(gltf, binary, replacements) {
  const chunks = [];
  let offset = 0;
  for (let index = 0; index < (gltf.bufferViews || []).length; index++) {
    const view = gltf.bufferViews[index];
    if ((view.buffer ?? 0) !== 0) throw new Error(`unsupported non-GLB bufferView ${index}`);
    const start = view.byteOffset || 0;
    const payload = replacements.get(index) || binary.subarray(start, start + view.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    view.byteOffset = offset;
    view.byteLength = payload.length;
    chunks.push(Buffer.from(payload));
    offset += payload.length;
  }
  const tailPad = (4 - (offset % 4)) % 4;
  if (tailPad) chunks.push(Buffer.alloc(tailPad));
  const packed = Buffer.concat(chunks);
  gltf.buffers = gltf.buffers || [{}];
  gltf.buffers[0] = { ...(gltf.buffers[0] || {}), byteLength: packed.length };
  delete gltf.buffers[0].uri;
  return packed;
}

function appendEmbeddedPng(gltf, binary, payload) {
  const pad = (4 - (binary.length % 4)) % 4;
  const offset = binary.length + pad;
  const packed = Buffer.concat([binary, Buffer.alloc(pad), payload]);
  const bufferView = (gltf.bufferViews || (gltf.bufferViews = [])).length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: payload.length });
  gltf.buffers = gltf.buffers || [{}];
  gltf.buffers[0] = { ...(gltf.buffers[0] || {}), byteLength: packed.length };
  delete gltf.buffers[0].uri;
  return { binary: packed, bufferView };
}

function solidPng(size, rgba) {
  const png = new PNG({ width: size, height: size });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = rgba[0];
    png.data[offset + 1] = rgba[1];
    png.data[offset + 2] = rgba[2];
    png.data[offset + 3] = rgba[3];
  }
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}

export function ensureSourceTextureContract(gltf, binary, textureSize, allowFactorOnly, label) {
  const images = gltf.images || (gltf.images = []);
  const textures = gltf.textures || (gltf.textures = []);
  if (images.length === 0 && allowFactorOnly) return binary;
  const embeddedPng = images.length > 0 && images.every((image) =>
    image.bufferView != null && !image.uri && image.mimeType === 'image/png');
  const embeddedKtx2 = images.length > 0 && textures.length > 0 && images.every((image) =>
    image.bufferView != null && !image.uri && image.mimeType === 'image/ktx2')
    && textures.every((texture) => texture.extensions?.KHR_texture_basisu);
  if (!embeddedKtx2 && images.some((image) => image.mimeType === 'image/ktx2')) {
    throw new Error('mixed or incomplete KTX2 source texture transport');
  }

  let packed = binary;
  if (images.length > 0 && !embeddedPng && !embeddedKtx2) {
    const replacements = new Map();
    for (const image of images) {
      const viewIndex = image.bufferView;
      const png = toPng(embeddedImageBytes(gltf, binary, image), image.mimeType);
      const previous = replacements.get(viewIndex);
      if (previous && !previous.equals(png)) {
        throw new Error(`source images sharing bufferView ${viewIndex} decode to different payloads`);
      }
      replacements.set(viewIndex, png);
      image.mimeType = 'image/png';
      delete image.uri;
    }
    packed = repackBufferViews(gltf, binary, replacements);
  }

  const roles = {
    baseColor: { name: 'baseColor', rgba: [255, 255, 255, 255] },
    normal: { name: 'normal', rgba: [128, 128, 255, 255] },
    orm: { name: 'orm', rgba: [255, 255, 255, 255] },
  };

  const materials = gltf.materials || [];
  if (materials.length === 0) throw new Error(`source texture contract for '${label}' requires at least one material`);

  const resolveTexture = (textureIndex) => {
    const texture = Number.isInteger(textureIndex) ? textures[textureIndex] : null;
    const imageIndex = textureImageIndex(texture);
    const image = Number.isInteger(imageIndex) ? images[imageIndex] : null;
    return texture && image ? { textureIndex, texture, imageIndex, image } : null;
  };

  const neutralTextures = new Map();
  const addNeutralTexture = (role) => {
    if (neutralTextures.has(role.name)) return neutralTextures.get(role.name);
    if (embeddedKtx2) {
      throw new Error(`KTX2 source for '${label}' is missing a distinct ${role.name} role; re-export that authored map instead of synthesizing mixed transport`);
    }
    const appended = appendEmbeddedPng(gltf, packed, solidPng(textureSize, role.rgba));
    packed = appended.binary;
    const imageIndex = images.length;
    images.push({
      bufferView: appended.bufferView,
      mimeType: 'image/png',
      name: `spaceface_neutral_${role.name}_${textureSize}`,
    });
    if ((gltf.samplers || []).length === 0) {
      gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    }
    const textureIndex = textures.length;
    textures.push({ sampler: textures[0]?.sampler ?? 0, source: imageIndex });
    const result = { textureIndex, imageIndex };
    neutralTextures.set(role.name, result);
    return result;
  };

  const hasRoleBinding = (material) => [
    material.pbrMetallicRoughness?.baseColorTexture,
    material.normalTexture,
    material.pbrMetallicRoughness?.metallicRoughnessTexture,
    material.occlusionTexture,
  ].some((info) => Number.isInteger(info?.index));
  const validFactorOnly = (material) => {
    const factor = material.pbrMetallicRoughness?.baseColorFactor;
    return Array.isArray(factor)
      && factor.length === 4
      && factor.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  };
  const anyBoundMaterial = materials.some(hasRoleBinding);
  const repairTargets = materials.filter((material, index) =>
    hasRoleBinding(material) || !validFactorOnly(material) || (!anyBoundMaterial && index === 0));

  for (const material of repairTargets) {
    const pbr = material.pbrMetallicRoughness || (material.pbrMetallicRoughness = {});
    let base = resolveTexture(pbr.baseColorTexture?.index);
    if (!base) {
      base = addNeutralTexture(roles.baseColor);
      pbr.baseColorTexture = { index: base.textureIndex };
    }

    let normal = resolveTexture(material.normalTexture?.index);
    if (!normal || normal.imageIndex === base.imageIndex) {
      normal = addNeutralTexture(roles.normal);
      material.normalTexture = { index: normal.textureIndex };
    }

    const metallicRoughness = resolveTexture(pbr.metallicRoughnessTexture?.index);
    const occlusion = resolveTexture(material.occlusionTexture?.index);
    let orm = metallicRoughness
      && occlusion
      && metallicRoughness.textureIndex === occlusion.textureIndex
      ? metallicRoughness
      : null;
    if (!orm || orm.imageIndex === base.imageIndex || orm.imageIndex === normal.imageIndex) {
      orm = addNeutralTexture(roles.orm);
      pbr.metallicRoughnessTexture = { index: orm.textureIndex };
      material.occlusionTexture = { index: orm.textureIndex };
    }
  }
  gltf.images = images;
  gltf.textures = textures;
  validateSourceTextureRoleCoverage(gltf, label);
  return packed;
}

function materialTextureInfos(material) {
  const infos = [];
  const visit = (value, key = '') => {
    if (!value || typeof value !== 'object') return;
    if (key.endsWith('Texture') && Number.isInteger(value.index)) {
      infos.push(value);
      return;
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  };
  visit(material);
  return infos;
}

function canonicalizeSourceTextureTopology(gltf) {
  const oldTextures = gltf.textures || [];
  if (oldTextures.length === 0) return;
  const infos = (gltf.materials || []).flatMap(materialTextureInfos);
  const canonicalTextures = [];
  const canonicalByKey = new Map();
  const oldToCanonical = new Map();
  for (const info of infos) {
    const oldIndex = info.index;
    if (!oldToCanonical.has(oldIndex)) {
      const texture = oldTextures[oldIndex];
      if (!texture) throw new Error(`material references missing texture ${oldIndex}`);
      const keyTexture = structuredClone(texture);
      delete keyTexture.name;
      const key = JSON.stringify(keyTexture);
      let canonicalIndex = canonicalByKey.get(key);
      if (canonicalIndex == null) {
        canonicalIndex = canonicalTextures.length;
        canonicalTextures.push(structuredClone(texture));
        canonicalByKey.set(key, canonicalIndex);
      }
      oldToCanonical.set(oldIndex, canonicalIndex);
    }
    info.index = oldToCanonical.get(oldIndex);
  }

  // Mirror the release builder's role split without rewriting the document through
  // glTF-Transform: base-color and normal slots may share source pixels, but they require
  // different color-space/encoder profiles. Each material therefore receives its own normal
  // texture object when Blender had collapsed those incompatible roles together.
  for (const material of gltf.materials || []) {
    const base = material.pbrMetallicRoughness?.baseColorTexture;
    const normal = material.normalTexture;
    if (!base || !normal || base.index !== normal.index) continue;
    const clone = structuredClone(canonicalTextures[normal.index]);
    if (clone.name) clone.name = `${clone.name}_normal_slot`;
    normal.index = canonicalTextures.length;
    canonicalTextures.push(clone);
  }
  gltf.textures = canonicalTextures;
}

async function main() {
  const argv = process.argv.slice(2);
  const methodArg = argv.find((a) => a.startsWith('--method='))?.split('=')[1] ?? null;
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [glbPath, partId] = positional;
  if (!glbPath || !partId) {
    console.error('usage: finalize_part.mjs <exported.glb> <partId> [--method=blender_mcp|blender_generic|procedural_fallback]');
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const entry = manifest.parts.find((p) => p.id === partId);
  if (!entry) { console.error(`part '${partId}' not in manifest`); process.exit(2); }
  const destPath = resolvePartOutputPath(PART_ROOT, entry.file);

  const authoringEntry = loadAuthoringEntry(partId);
  const authoringMethod = resolveAuthoringMethod(partId, methodArg, authoringEntry);
  if (isBlenderAuthoringMethod(authoringMethod)) {
    if (!authoringEntry?.blend_path) {
      console.error(`Blender-authored part '${partId}' is missing blend_path in ${AUTHORING_PATH}`);
      process.exit(2);
    }
    const blendAbs = resolve(ROOT, authoringEntry.blend_path);
    if (!existsSync(blendAbs)) {
      console.error(`Blender-authored part '${partId}' missing blend at ${blendAbs}`);
      process.exit(2);
    }
    if (authoringEntry.exporter_path && !existsSync(resolve(ROOT, authoringEntry.exporter_path))) {
      console.error(`Blender-authored part '${partId}' missing exporter at ${resolve(ROOT, authoringEntry.exporter_path)}`);
      process.exit(2);
    }
    if (authoringMethod === 'blender_generic' && !authoringEntry.exporter_path) {
      console.error(`Generic Blender part '${partId}' is missing exporter_path in ${AUTHORING_PATH}`);
      process.exit(2);
    }
    if (authoringMethod === 'blender_generic' && authoringEntry.texture_role_owner !== 'finalizer-v1') {
      console.error(`Generic Blender part '${partId}' must declare texture_role_owner=finalizer-v1 in ${AUTHORING_PATH}`);
      process.exit(2);
    }
  }

  const parsed = parseStrictEmbeddedGlb(readFileSync(glbPath), `${partId} source GLB`);
  const { gltf } = parsed;
  // Blender prunes unreferenced materials, but manifest tint roles are part of the runtime
  // contract. Restore them before texture-role binding so every published material is covered.
  gltf.materials = gltf.materials || [];
  for (const matName of Object.values(entry.tintable || {})) {
    if (!gltf.materials.some((material) => material.name === matName)) {
      gltf.materials.push({
        name: matName,
        pbrMetallicRoughness: {
          baseColorFactor: [0.12, 0.5, 0.62, 1],
          metallicFactor: 0.4,
          roughnessFactor: 0.5,
        },
      });
    }
  }
  const binary = ensureSourceTextureContract(
    gltf,
    parsed.binary,
    entry.textureSize,
    allowsFactorOnlySource(authoringMethod, authoringEntry),
    partId,
  );
  canonicalizeSourceTextureTopology(gltf);
  const factorOnlyBlender = allowsFactorOnlySource(authoringMethod, authoringEntry)
    && (gltf.images || []).length === 0
    && (gltf.materials || []).length > 0
    && (gltf.materials || []).every((material) =>
      Array.isArray(material.pbrMetallicRoughness?.baseColorFactor)
      && material.pbrMetallicRoughness.baseColorFactor.length === 4);
  const tris = countTriangles(gltf);
  const b = worldBounds(gltf, binary);
  const dims = [round(b.max[0] - b.min[0]), round(b.max[1] - b.min[1]), round(b.max[2] - b.min[2])];
  const slot = SLOT_BY_CATEGORY[entry.category];
  const assetId = 'SF_' + partId.toUpperCase();

  if (entry.category === 'engines') {
    validateEngineDriveSurface(gltf, binary, partId, entry.hooks || []);
  }

  const sfAsset = {
    assetId, slot, forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
    normalConvention: 'OpenGL', ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source', chamfered: true,
  };
  applyPartProvenance(gltf, {
    authoringMethod,
    authoringEntry,
    sfAsset,
    assetExtras: {
      assetId,
      partId,
      category: entry.category,
      priority: entry.priority,
      unit: 'metre',
      upAxis: '+Y',
      forwardAxis: '+X',
      starboardAxis: '+Z',
      triangleCount: tris,
      textureSize: entry.textureSize,
      boundsDimensionsM: dims,
    },
    textureRoleContract: {
      version: 1,
      mode: factorOnlyBlender ? 'factor-only' : 'bound-base-normal-orm',
    },
  });

  // Ensure faction-tint node extras survive: root + every LOD mesh node carry spaceface.tint.
  for (const node of gltf.nodes || []) {
    if (!node.name) continue;
    if (node.name.endsWith('_ROOT')) {
      node.extras = node.extras || {};
      node.extras.spaceface = { ...(node.extras.spaceface || {}), tint: 'hull', chamfered: true };
    } else if (node.name.startsWith('LOD0')) {
      node.extras = node.extras || {};
      node.extras.spaceface = { lod: 'lod0', tint: 'hull', chamfered: true, ...(node.extras.spaceface || {}) };
    }
  }

  const finalBuf = serializeGlb(gltf, binary);
  // Canonical sources retain the Blender/procedural transport that was actually authored.
  // SG-04 owns any temporary texture-role normalization required for release parity; writing a
  // glTF-Transform document back over the source loses provenance and repackages source images.
  entry.tris = tris;
  entry.bytes = finalBuf.length;
  entry.bounds = {
    min: b.min.map((v) => round(v)),
    max: b.max.map((v) => round(v)),
    dimensionsM: dims,
  };
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await publishTwoFileTransaction({
    files: [
      {
        path: destPath,
        bytes: finalBuf,
        validate: async (_stagedPath, stagedBytes) => {
          const stagedParsed = parseStrictEmbeddedGlb(stagedBytes, `${partId} staged GLB`);
          const staged = stagedParsed.gltf;
          if (staged.asset?.extras?.partId !== partId) {
            throw new Error(`staged GLB extras partId mismatch: ${staged.asset?.extras?.partId}`);
          }
          if (!factorOnlyBlender) validateSourceTextureRoleCoverage(staged, partId);
          if (entry.category === 'engines') {
            validateEngineDriveSurface(staged, stagedParsed.binary, partId, entry.hooks || []);
          }
        },
      },
      {
        path: MANIFEST_PATH,
        bytes: manifestBuf,
        validate: async (_stagedPath, stagedBytes) => {
          const stagedManifest = JSON.parse(stagedBytes.toString('utf8'));
          const stagedEntry = stagedManifest.parts?.find((part) => part.id === partId);
          if (!stagedEntry) throw new Error(`staged manifest is missing '${partId}'`);
          if (stagedEntry.bytes !== finalBuf.length || stagedEntry.tris !== tris) {
            throw new Error(`staged manifest metrics mismatch for '${partId}'`);
          }
        },
      },
    ],
  });

  const imgCount = (gltf.images || []).length;
  const textureCount = (gltf.textures || []).length;
  const mats = (gltf.materials || []).map((m) => m.name).join(',');
  console.log(JSON.stringify({
    partId,
    file: entry.file,
    tris,
    bytes: finalBuf.length,
    dims,
    images: imgCount,
    textures: textureCount,
    materials: mats,
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
