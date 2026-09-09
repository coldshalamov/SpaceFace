#!/usr/bin/env node
/** Finalize and validate the isolated Wasp production candidate. No runtime promotion. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const DIR = dirname(fileURLToPath(import.meta.url));
const FAMILY = resolve(DIR, '..');
const ROOT = resolve(FAMILY, '../../..');
const PACKET = 'SF-WASP-PRODUCTION-V1-001';
const ASSET_ID = 'SF_WASP_PRODUCTION_V1';
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Trail_Port', 'SOCKET_Trail_Starboard',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const REQUIRED_MATERIALS = [
  'Material_Hull', 'Material_Armor', 'Material_Mechanical', 'Material_Accent',
  'Material_Warning', 'Material_Canopy', 'Material_Thruster',
];
const TEXTURE_PREFIX_BY_MATERIAL = new Map([
  ['Material_Hull', 'hull'],
  ['Material_Armor', 'armor_dark'],
  ['Material_Mechanical', 'mechanical'],
  ['Material_Accent', 'frontier_cyan'],
  ['Material_Warning', 'warning_orange'],
]);
const SOURCE = [0, 1, 2].map((lod) => resolve(FAMILY, `source/wholeships/wasp_production_v1_lod${lod}.glb`));
const CANDIDATE = [0, 1, 2].map((lod) => resolve(FAMILY, `release_candidates/wholeships/wasp_production_v1_lod${lod}.glb`));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const rel = (path) => path.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
const role = (name = '') => {
  const token = name.toLowerCase();
  if (token.includes('canopy')) return 'glass';
  if (token.includes('thruster')) return 'thruster';
  if (token.includes('warning')) return 'warning';
  if (token.includes('accent')) return 'accent';
  if (token.includes('mechanical')) return 'mechanical';
  if (token.includes('armor')) return 'armor';
  return 'hull';
};

const reports = [];
for (let lod = 0; lod < 3; lod++) reports.push(await finalize(lod));

const report = {
  schema: 'spaceface.waspProductionV1.finalize.v1',
  packet: PACKET,
  assetId: ASSET_ID,
  status: 'technical_candidate_no_promote',
  promoted: false,
  lods: reports,
  checks: {
    allUnder100MiB: reports.every((entry) => entry.bytes < 100 * 1024 * 1024),
    allSocketsPresent: reports.every((entry) => entry.missingSockets.length === 0),
    semanticMaterialsPresent: reports.every((entry) => entry.missingMaterials.length === 0),
    boundedDraws: reports.every((entry) => entry.renderDraws <= REQUIRED_MATERIALS.length),
    authoredHullBody: reports.every((entry) => entry.hullTriangles >= 800),
    noEmbeddedPlume: reports.every((entry) => entry.embeddedPlume === false),
  },
};
report.ok = Object.values(report.checks).every(Boolean);
mkdirSync(resolve(FAMILY, 'evidence'), { recursive: true });
writeFileSync(resolve(FAMILY, 'evidence/finalize_report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

async function finalize(lod) {
  const source = SOURCE[lod];
  const candidate = CANDIDATE[lod];
  if (!existsSync(source)) throw new Error(`missing source LOD${lod}: ${rel(source)}`);
  mkdirSync(dirname(candidate), { recursive: true });
  copyFileSync(source, candidate);
  const document = await io.read(candidate);
  const root = document.getRoot();
  const contract = {
    contractVersion: 2,
    assetId: ASSET_ID,
    partId: 'wasp_production_v1',
    packet: PACKET,
    family: 'wasp_production_v1',
    category: 'wholeships',
    slot: 'hull',
    lod: `lod${lod}`,
    forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
    normalConvention: 'OpenGL', ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    factorOnlyMaterials: ['Material_Canopy', 'Material_Thruster'],
    embeddedPlume: false,
    wiringStatus: 'isolated_candidate_no_promote',
  };
  const asset = root.getAsset();
  asset.generator = `${asset.generator || ''}; SpaceFace finalize_wasp_v1.mjs`.replace(/^; /, '');
  asset.extras = { ...(asset.extras || {}), spacefaceAsset: contract, assetId: ASSET_ID };
  for (const scene of root.listScenes()) scene.setExtras({ ...(scene.getExtras() || {}), spacefaceAsset: contract });

  // Embed the exact first-party PNG sources rather than accepting Blender's
  // version-dependent AUTO image conversion.  AO, roughness, and metallic all
  // reference one Texture object, preserving the packed R/G/B contract.
  for (const material of root.listMaterials()) {
    if (contract.factorOnlyMaterials.includes(material.getName())) continue;
    const prefix = TEXTURE_PREFIX_BY_MATERIAL.get(material.getName());
    if (!prefix) throw new Error(`${material.getName()} has no semantic texture source mapping`);
    const texture = (suffix, label) => {
      const path = resolve(FAMILY, `textures/${prefix}_${suffix}.png`);
      if (!existsSync(path)) throw new Error(`missing ${material.getName()} ${label} source: ${rel(path)}`);
      return document.createTexture(`${prefix}_${label}`)
        .setImage(readFileSync(path))
        .setMimeType('image/png');
    };
    const baseColor = texture('basecolor', 'baseColor');
    const normal = texture('normal', 'normal');
    const orm = texture('orm', 'orm');
    material.setBaseColorTexture(baseColor);
    material.setNormalTexture(normal);
    material.setNormalScale(0.38);
    material.setOcclusionTexture(orm);
    material.setMetallicRoughnessTexture(orm);
  }

  const socketNames = [];
  let renderDraws = 0;
  let hullTriangles = 0;
  let triangles = 0;
  let embeddedPlume = false;
  const materialNames = new Set(root.listMaterials().map((material) => material.getName()));
  const meshNodes = [];
  for (const node of root.listNodes()) {
    let name = node.getName() || '';
    if (/^SOCKET_/i.test(name)) {
      // Blender requires globally unique object names while all authored LODs
      // coexist in the production blend.  Each exported GLB is independent, so
      // strip Blender's .001/.002 suffix back to the stable runtime contract.
      name = name.replace(/\.\d+$/, '');
      node.setName(name);
      socketNames.push(name);
      node.setExtras({ ...(node.getExtras() || {}), socket: true, spaceface: { socket: true } });
    }
    const mesh = node.getMesh();
    if (!mesh) continue;
    const current = node.getExtras() || {};
    const nonRender = Boolean(current.nonRender || current.spaceface?.nonRender || /COLLISION/i.test(name));
    let meshTriangles = 0;
    const roles = new Set();
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const positions = primitive.getAttribute('POSITION');
      const count = indices?.getCount() ?? positions?.getCount() ?? 0;
      meshTriangles += Math.floor(count / 3);
      const materialName = primitive.getMaterial()?.getName() || '';
      roles.add(role(materialName));
      if (/plume/i.test(`${name} ${mesh.getName()} ${materialName}`)) embeddedPlume = true;
    }
    const semanticRole = roles.size === 1 ? [...roles][0] : 'hull';
    const tint = semanticRole === 'glass' ? 'none'
      : semanticRole === 'thruster' ? 'thruster'
        : semanticRole === 'accent' || semanticRole === 'warning' ? 'accent'
          : semanticRole === 'mechanical' || semanticRole === 'armor' ? 'dark'
            : 'hull';
    if (semanticRole === 'armor' && !/hull/i.test(name)) {
      name = name.replace(/Armor/i, 'Hull_Armor');
      node.setName(name);
      if (mesh.getName()) mesh.setName(mesh.getName().replace(/Armor/i, 'Hull_Armor'));
    }
    triangles += meshTriangles;
    if (!nonRender) {
      renderDraws += mesh.listPrimitives().length;
      if (roles.has('hull') || roles.has('armor')) hullTriangles += meshTriangles;
      meshNodes.push({ name, mesh: mesh.getName(), triangles: meshTriangles, roles: [...roles] });
    }
    node.setExtras({
      ...current,
      spaceface: {
        ...(current.spaceface || {}), lod: `lod${lod}`, nonRender,
        chamfered: true, bevelRadiusM: 0.025, tint,
        canopy: semanticRole === 'glass', semanticRoles: [...roles], embeddedPlume: false,
      },
    });
  }
  await io.write(candidate, document);

  return {
    lod,
    path: rel(candidate),
    bytes: statSync(candidate).size,
    sha256: sha256(candidate),
    triangles,
    hullTriangles,
    renderDraws,
    meshNodes,
    materials: [...materialNames].sort(),
    missingMaterials: REQUIRED_MATERIALS.filter((name) => !materialNames.has(name)),
    sockets: socketNames.sort(),
    missingSockets: REQUIRED_SOCKETS.filter((name) => !socketNames.includes(name)),
    embeddedPlume,
  };
}
