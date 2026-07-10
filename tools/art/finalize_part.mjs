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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import * as THREE from 'three';

import { validateEngineDriveSurface } from './lib/engineDriveSurfaceValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART_ROOT = resolve(ROOT, 'assets/ships/parts');
const MANIFEST_PATH = resolve(PART_ROOT, 'parts_manifest.json');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');

function loadAuthoringEntry(partId) {
  if (!existsSync(AUTHORING_PATH)) return null;
  const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
  return authoring?.entries?.[partId] ?? null;
}

function resolveAuthoringMethod(partId, methodArg) {
  if (methodArg) return methodArg;
  return loadAuthoringEntry(partId)?.method ?? null;
}

function generatorString(method) {
  if (method === 'blender_mcp') {
    return 'SpaceFace tools/art/blender/author_place_archetype.py - Blender-authored place archetype';
  }
  return 'SpaceFace tools/art/generate_ship_parts_library.py - procedural ship parts library v3';
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const SLOT_BY_CATEGORY = {
  hulls: 'hull', cockpits: 'cockpit', engines: 'engine', weapons: 'weapon',
  fins: 'fin', greebles: 'greeble', gear: 'gear', pods: 'pod', places: 'place',
};

function parseGlb(bytes) {
  let off = 12, gltf = null, binary = null;
  while (off < bytes.length) {
    const len = bytes.readUInt32LE(off);
    const type = bytes.readUInt32LE(off + 4);
    const start = off + 8, end = start + len;
    if (type === CHUNK_JSON) gltf = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    else if (type === CHUNK_BIN) binary = bytes.subarray(start, end);
    off = end;
  }
  if (!gltf) throw new Error('missing JSON chunk');
  if (!binary) binary = Buffer.alloc(0);
  return { gltf, binary };
}

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

function setTextureImageIndex(texture, imageIndex) {
  texture.source = imageIndex;
  if (texture.extensions?.KHR_texture_basisu) {
    delete texture.extensions.KHR_texture_basisu;
    if (Object.keys(texture.extensions).length === 0) delete texture.extensions;
  }
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

function ensureSourceTextureContract(gltf, binary, textureSize, allowFactorOnly) {
  const images = gltf.images || (gltf.images = []);
  const textures = gltf.textures || (gltf.textures = []);
  if (images.length === 0 && allowFactorOnly) return binary;
  const embeddedPng = images.length >= 3 && images.every((image) =>
    image.bufferView != null && !image.uri && image.mimeType === 'image/png');
  const embeddedKtx2 = images.length >= 3 && images.every((image) =>
    image.bufferView != null && !image.uri && image.mimeType === 'image/ktx2')
    && textures.every((texture) => texture.extensions?.KHR_texture_basisu);
  if (embeddedPng || embeddedKtx2) return binary;
  if (images.some((image) => image.mimeType === 'image/ktx2')) {
    throw new Error('mixed or incomplete KTX2 source texture transport');
  }

  let packed = binary;
  if (images.length > 0) {
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

  const roles = [
    {
      name: 'normal',
      rgba: [128, 128, 255, 255],
      get: (material) => material.normalTexture,
      set: (material, info) => { material.normalTexture = info; },
    },
    {
      name: 'orm',
      rgba: [255, 255, 255, 255],
      get: (material) => material.pbrMetallicRoughness?.metallicRoughnessTexture || material.occlusionTexture,
      set: (material, info) => {
        material.pbrMetallicRoughness = material.pbrMetallicRoughness || {};
        material.pbrMetallicRoughness.metallicRoughnessTexture = info;
        material.occlusionTexture = { ...info };
      },
    },
    {
      name: 'baseColor',
      rgba: [255, 255, 255, 255],
      get: (material) => material.pbrMetallicRoughness?.baseColorTexture,
      set: (material, info) => {
        material.pbrMetallicRoughness = material.pbrMetallicRoughness || {};
        material.pbrMetallicRoughness.baseColorTexture = info;
      },
    },
  ];
  for (const role of roles) {
    if (images.length >= 3) break;
    const materials = gltf.materials || [];
    const infos = materials.map(role.get).filter((info) => info?.index != null);
    const sourceInfo = infos[0];
    const sourceTexture = textures[sourceInfo?.index];
    const sourceImageIndex = textureImageIndex(sourceTexture);
    const sourceImage = images[sourceImageIndex];
    if (!sourceTexture || !sourceImage) {
      const appended = appendEmbeddedPng(gltf, packed, solidPng(textureSize, role.rgba));
      packed = appended.binary;
      const imageIndex = images.length;
      images.push({
        bufferView: appended.bufferView,
        mimeType: 'image/png',
        name: `spaceface_neutral_${role.name}_${textureSize}`,
      });
      if (textures.length === 0) {
        gltf.samplers = gltf.samplers || [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
      }
      const textureIndex = textures.length;
      textures.push({ sampler: textures[0]?.sampler ?? 0, source: imageIndex });
      for (const material of materials) role.set(material, { index: textureIndex });
      continue;
    }
    const cloneImageIndex = images.length;
    images.push({
      ...sourceImage,
      name: `${sourceImage.name || 'source'}_${role.name}_role`,
    });
    const cloneTextureIndex = textures.length;
    const cloneTexture = structuredClone(sourceTexture);
    if (cloneTexture.name) cloneTexture.name = `${cloneTexture.name}_${role.name}_role`;
    setTextureImageIndex(cloneTexture, cloneImageIndex);
    textures.push(cloneTexture);
    for (const info of infos) {
      if (info.index === sourceInfo.index) info.index = cloneTextureIndex;
    }
  }
  if (images.length < 3 || !images.every((image) => image.bufferView != null
    && !image.uri && image.mimeType === 'image/png')) {
    throw new Error(`source texture contract requires at least three embedded PNG images; found ${images.length}`);
  }
  gltf.images = images;
  gltf.textures = textures;
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
    console.error('usage: finalize_part.mjs <exported.glb> <partId> [--method=blender_mcp|procedural_fallback]');
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const entry = manifest.parts.find((p) => p.id === partId);
  if (!entry) { console.error(`part '${partId}' not in manifest`); process.exit(2); }

  const authoringMethod = resolveAuthoringMethod(partId, methodArg);
  const authoringEntry = loadAuthoringEntry(partId);
  if (authoringEntry?.blend_path && authoringMethod === 'blender_mcp') {
    const blendAbs = resolve(ROOT, authoringEntry.blend_path);
    if (!existsSync(blendAbs)) {
      console.error(`Blender-authored part '${partId}' missing blend at ${blendAbs}`);
      process.exit(2);
    }
  }

  const parsed = parseGlb(readFileSync(glbPath));
  const { gltf } = parsed;
  const binary = ensureSourceTextureContract(
    gltf,
    parsed.binary,
    entry.textureSize,
    authoringMethod === 'blender_mcp',
  );
  canonicalizeSourceTextureTopology(gltf);
  const tris = countTriangles(gltf);
  const b = worldBounds(gltf, binary);
  const dims = [round(b.max[0] - b.min[0]), round(b.max[1] - b.min[1]), round(b.max[2] - b.min[2])];
  const slot = SLOT_BY_CATEGORY[entry.category];
  const assetId = 'SF_' + partId.toUpperCase();

  if (entry.category === 'engines') {
    validateEngineDriveSurface(gltf, partId, entry.hooks || []);
  }

  const sfAsset = {
    assetId, slot, forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
    normalConvention: 'OpenGL', ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source', chamfered: true,
  };
  gltf.asset = gltf.asset || {};
  gltf.asset.version = '2.0';
  gltf.asset.generator = generatorString(authoringMethod);
  gltf.asset.extras = {
    spacefaceAsset: sfAsset, assetId, partId, category: entry.category, priority: entry.priority,
    unit: 'metre', upAxis: '+Y', forwardAxis: '+X', starboardAxis: '+Z',
    triangleCount: tris, textureSize: entry.textureSize, boundsDimensionsM: dims,
  };
  const sceneIdx = gltf.scene || 0;
  gltf.scenes[sceneIdx].extras = { spacefaceAsset: sfAsset };

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

  // Blender's exporter prunes materials no face references, but the manifest may still
  // declare them as tintable roles. Re-add any missing declared material so the contract
  // (and faction-tint lookup by name) holds. A factor-only material needs no bufferView.
  gltf.materials = gltf.materials || [];
  for (const matName of Object.values(entry.tintable || {})) {
    if (!gltf.materials.some((m) => m.name === matName)) {
      gltf.materials.push({
        name: matName,
        pbrMetallicRoughness: { baseColorFactor: [0.12, 0.5, 0.62, 1], metallicFactor: 0.4, roughnessFactor: 0.5 },
      });
    }
  }

  const finalBuf = serializeGlb(gltf, binary);
  const destPath = resolve(PART_ROOT, entry.file);
  writeFileSync(destPath, finalBuf);

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
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

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

await main();
