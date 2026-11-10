#!/usr/bin/env node
// Finalize authored whole-ship Blender exports so they satisfy the runtime
// authored-asset contract enforced by src/render/assetLoader.js.
//
// Usage:
//   node tools/art/finalize_whole_ship.mjs
//   node tools/art/finalize_whole_ship.mjs kestrel

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXTURE_SIZE = 1024;
const BEVEL_RADIUS_M = 0.025;
const CONTRACT = Object.freeze({
  contractVersion: 1,
  slot: 'hull',
  forward: '+X',
  up: '+Y',
  starboard: '+Z',
  unit: 'metre',
  normalConvention: 'OpenGL',
  ormChannels: 'R=AO,G=Roughness,B=Metallic',
  textureCompression: 'PNG-source',
  chamfered: true,
  bevelRadiusM: BEVEL_RADIUS_M,
});

const WHOLE_SHIPS = Object.freeze({
  kestrel: Object.freeze({
    id: 'kestrel',
    assetId: 'SF_WHOLESHIP_KESTREL',
    file: 'assets/ships/parts/wholeships/kestrel.glb',
    seed: 0x4b3557,
  }),
  pelican: Object.freeze({
    id: 'pelican',
    assetId: 'SF_WHOLESHIP_PELICAN',
    file: 'assets/ships/parts/wholeships/pelican.glb',
    seed: 0x71c41d,
  }),
  wasp: Object.freeze({
    id: 'wasp',
    assetId: 'SF_WHOLESHIP_WASP',
    file: 'assets/ships/parts/wholeships/wasp.glb',
    seed: 0xb46a21,
  }),
});

const ACCESSORY_MESH_TOKENS = ['antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit'];
const MIN_WHOLESHIP_HULL_TRIS = 800;

const selected = process.argv.slice(2);
const shipIds = selected.length ? selected : Object.keys(WHOLE_SHIPS);
for (const id of shipIds) {
  if (!WHOLE_SHIPS[id]) {
    console.error(`Unknown whole ship "${id}". Expected one of: ${Object.keys(WHOLE_SHIPS).join(', ')}`);
    process.exit(2);
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const results = [];
for (const id of shipIds) {
  results.push(await finalizeWholeShip(WHOLE_SHIPS[id]));
}

console.log(JSON.stringify({
  schema: 'spaceface.wholeShipFinalize.v1',
  finalized: results,
}, null, 2));

async function finalizeWholeShip(spec) {
  const abs = resolve(ROOT, spec.file);
  if (!existsSync(abs)) throw new Error(`missing whole-ship source GLB: ${spec.file}`);

  const document = await io.read(abs);
  const root = document.getRoot();
  const buffer = root.listBuffers()[0] || document.createBuffer('spaceface_wholeship_buffer');
  const metadata = Object.freeze({ ...CONTRACT, assetId: spec.assetId });

  stampAssetMetadata(root, spec, metadata);
  stampScenes(root, metadata);
  const taggedNodes = stampNodeTags(root);
  const texturedMaterials = applyMaterialTextures(document, root, spec);
  const tangentAccessors = ensureTangents(document, root, buffer);
  const hullAudit = auditWholeShipHull(root, spec);
  if (!hullAudit.ok) {
    throw new Error(`[finalize_whole_ship] ${spec.id}: ${hullAudit.errors.join('; ')}`);
  }

  await io.write(abs, document);

  return {
    id: spec.id,
    file: spec.file,
    assetId: spec.assetId,
    taggedNodes,
    texturedMaterials,
    tangentAccessors,
    hullAudit,
  };
}

function auditWholeShipHull(root, spec) {
  const errors = [];
  let hullTris = 0;
  const meshNames = [];

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const nodeName = node.getName() || '';
    const meshName = mesh.getName() || '';
    meshNames.push(meshName);
    const materials = materialNamesForMesh(mesh).join(' ').toLowerCase();
    const token = `${nodeName} ${meshName} ${materials}`.toLowerCase();

    let tris = 0;
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      if (indices) tris += Math.floor(indices.getCount() / 3);
      else if (position) tris += Math.floor(position.getCount() / 3);
    }

    const isAccessory = ACCESSORY_MESH_TOKENS.some((acc) => token.includes(acc));
    const isHullNode = /material_hull|merged_material_hull/i.test(token)
      || (/lod0_.*_main/i.test(nodeName) && !isAccessory);
    if (isHullNode && !isAccessory) hullTris += tris;

    const lname = nodeName.toLowerCase();
    if (lname.startsWith('merged_material_')) {
      const geo = meshName.toLowerCase();
      if (lname.includes('mechanical') && (!/mechanical|engine|brace/i.test(geo) || /decal/i.test(geo))) {
        errors.push(`wholeship:merged material node mesh mismatch: ${nodeName} -> ${meshName}`);
      }
      if (lname.includes('accent') && !/accent|antenna|decal/i.test(geo)) {
        errors.push(`wholeship:merged material node mesh mismatch: ${nodeName} -> ${meshName}`);
      }
      if (lname.includes('glass') && !/glass|canopy/i.test(geo)) {
        errors.push(`wholeship:merged material node mesh mismatch: ${nodeName} -> ${meshName}`);
      }
      if (lname.includes('hull') && (isAccessory || !/hull|main/i.test(geo))) {
        errors.push(`wholeship:merged material node mesh mismatch: ${nodeName} -> ${meshName}`);
      }
    }
  }

  if (hullTris < MIN_WHOLESHIP_HULL_TRIS) {
    errors.push(`wholeship:missing hull body: hull triangles=${hullTris} < ${MIN_WHOLESHIP_HULL_TRIS}; meshes=${meshNames.join(', ')}`);
  }

  return { ok: errors.length === 0, hullTris, errors };
}

function stampAssetMetadata(root, spec, metadata) {
  const asset = root.getAsset();
  const previousGenerator = asset.generator ? `${asset.generator}; ` : '';
  asset.version = '2.0';
  asset.generator = `${previousGenerator}SpaceFace tools/art/finalize_whole_ship.mjs`;
  asset.extras = {
    ...(asset.extras || {}),
    spacefaceAsset: metadata,
    assetId: spec.assetId,
    partId: `wholeship_${spec.id}`,
    category: 'wholeships',
    unit: 'metre',
    upAxis: '+Y',
    forwardAxis: '+X',
    starboardAxis: '+Z',
    textureSize: TEXTURE_SIZE,
    sourceRole: 'whole-ship hull',
  };
}

function stampScenes(root, metadata) {
  for (const scene of root.listScenes()) {
    scene.setExtras({
      ...(scene.getExtras() || {}),
      spacefaceAsset: metadata,
    });
  }
}

function stampNodeTags(root) {
  let count = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const name = node.getName() || '';
    const current = node.getExtras() || {};
    const spaceface = { ...(current.spaceface || {}) };

    if (mesh) {
      spaceface.lod = spaceface.lod || 'lod0';
      spaceface.chamfered = true;
      spaceface.bevelRadiusM = BEVEL_RADIUS_M;
      const role = tintRoleForMesh(mesh, name);
      if (role) spaceface.tint = role;
      if (isCanopyNode(mesh, name)) spaceface.canopy = true;
      if (/decal/i.test(name)) spaceface.decal = true;
      count++;
    } else if (/^SOCKET_/i.test(name)) {
      spaceface.socket = true;
    }

    if (Object.keys(spaceface).length) {
      node.setExtras({
        ...current,
        spaceface,
      });
    }
  }
  return count;
}

function tintRoleForMesh(mesh, nodeName) {
  const names = materialNamesForMesh(mesh).join(' ').toLowerCase();
  const token = `${nodeName} ${names}`.toLowerCase();
  if (token.includes('glass') || token.includes('canopy') || token.includes('windscreen')) return 'none';
  if (token.includes('accent') || token.includes('decal')) return 'accent';
  if (token.includes('mechanical')) return 'dark';
  return 'hull';
}

function isCanopyNode(mesh, nodeName) {
  const token = `${nodeName} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase();
  return token.includes('glass') || token.includes('canopy') || token.includes('windscreen');
}

function materialNamesForMesh(mesh) {
  const names = [];
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (material && material.getName()) names.push(material.getName());
  }
  return names;
}

function applyMaterialTextures(document, root, spec) {
  let count = 0;
  for (const material of root.listMaterials()) {
    const name = material.getName() || `Material_${count}`;
    const role = roleForMaterialName(name);
    const seed = (spec.seed ^ hashString(name)) >>> 0;
    const base = document.createTexture(`${spec.id}_${safeName(name)}_baseColor`)
      .setImage(makeBaseColorPng(material.getBaseColorFactor(), seed, role))
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
    count++;
  }
  return count;
}

function roleForMaterialName(name) {
  const token = String(name || '').toLowerCase();
  if (token.includes('glass') || token.includes('canopy')) return 'glass';
  if (token.includes('accent') || token.includes('decal')) return 'accent';
  if (token.includes('mechanical')) return 'mechanical';
  return 'hull';
}

function ensureTangents(document, root, buffer) {
  let count = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position || primitive.getAttribute('TANGENT')) continue;
      const array = new Float32Array(position.getCount() * 4);
      for (let i = 0; i < position.getCount(); i++) {
        array[i * 4] = 1;
        array[i * 4 + 1] = 0;
        array[i * 4 + 2] = 0;
        array[i * 4 + 3] = 1;
      }
      const accessor = document.createAccessor(`${mesh.getName() || 'mesh'}_TANGENT`)
        .setType('VEC4')
        .setArray(array)
        .setBuffer(buffer);
      primitive.setAttribute('TANGENT', accessor);
      count++;
    }
  }
  return count;
}

function makeBaseColorPng(factor, seed, role) {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  const rgba = Array.isArray(factor) && factor.length >= 4 ? factor : [1, 1, 1, 1];
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const seam = seamAmount(x, y, seed);
      const chip = chipNoise(x, y, seed);
      const roleBoost = role === 'accent' ? 1.12 : role === 'mechanical' ? 0.82 : role === 'glass' ? 0.72 : 1;
      const shade = clamp(0.88 + chip * 0.14 - seam * 0.22, 0.48, 1.18) * roleBoost;
      png.data[i] = byte(rgba[0] * 255 * shade);
      png.data[i + 1] = byte(rgba[1] * 255 * shade);
      png.data[i + 2] = byte(rgba[2] * 255 * shade);
      png.data[i + 3] = byte((role === 'glass' ? Math.max(rgba[3], 0.55) : rgba[3]) * 255);
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

function makeNormalPng(seed) {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const sx = signedSeamNormal(x, 96 + (seed % 47));
      const sy = signedSeamNormal(y, 112 + (seed % 37));
      const nx = sx * 0.18;
      const ny = sy * 0.18;
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
      const chip = chipNoise(x, y, seed ^ 0x9e3779b9);
      png.data[i] = byte(238 - seam * 52 - chip * 8); // AO
      png.data[i + 1] = byte((roughness + seam * 0.06 + chip * 0.025) * 255);
      png.data[i + 2] = byte((metallic + (chip - 0.5) * 0.025) * 255);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 6 });
}

function seamAmount(x, y, seed) {
  const wx = 96 + (seed % 47);
  const wy = 112 + ((seed >>> 5) % 37);
  const dx = Math.min(x % wx, wx - (x % wx));
  const dy = Math.min(y % wy, wy - (y % wy));
  return Math.max(dx <= 2 ? 1 - dx / 3 : 0, dy <= 2 ? 1 - dy / 3 : 0);
}

function signedSeamNormal(v, width) {
  const d = v % width;
  if (d <= 2) return -1 + d / 2;
  if (d >= width - 2) return 1 - (width - d) / 2;
  return 0;
}

function chipNoise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 362437) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 255) / 255;
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i++) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function safeName(value) {
  return String(value || 'material').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'material';
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
