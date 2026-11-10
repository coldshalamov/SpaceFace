#!/usr/bin/env node
/** Finalize and validate the isolated Pelican production candidate. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const DIR = dirname(fileURLToPath(import.meta.url));
const FAMILY = resolve(DIR, '..');
const ROOT = resolve(FAMILY, '../../..');
const PACKET = 'SF-MULE-PRODUCTION-V1-001';
const ASSET_ID = 'SF_MULE_PRODUCTION_V1';
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Trail_Port', 'SOCKET_Trail_Starboard',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const REQUIRED_MATERIALS = [
  'Material_Hull', 'Material_Armor', 'Material_Mechanical',
  'Material_Warning', 'Material_Canopy', 'Material_Thruster',
];
const SOURCE = [0, 1, 2].map((lod) => resolve(FAMILY, `source/wholeships/mule_production_v1_lod${lod}.glb`));
const CANDIDATE = [0, 1, 2].map((lod) => resolve(FAMILY, `release_candidates/wholeships/mule_production_v1_lod${lod}.glb`));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const rel = (path) => path.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');

const reports = [];
for (let lod = 0; lod < 3; lod++) reports.push(await finalize(lod));

const report = {
  schema: 'spaceface.muleProductionV1.finalize.v1',
  packet: PACKET,
  assetId: ASSET_ID,
  status: 'technical_candidate',
  promoted: false,
  lods: reports,
  checks: {
    allUnder100MiB: reports.every((entry) => entry.bytes < 100 * 1024 * 1024),
    allSocketsPresent: reports.every((entry) => entry.missingSockets.length === 0),
    semanticMaterialsPresent: reports.every((entry) => entry.missingMaterials.length === 0),
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
  const names = new Set();
  const sockets = [];
  let hullTriangles = 0;
  let embeddedPlume = false;
  for (const node of root.listNodes()) {
    let name = node.getName() || '';
    if (/^SOCKET_/i.test(name)) {
      name = name.replace(/\.\d+$/, '');
      node.setName(name);
    }
    names.add(name);
    if (name.startsWith('SOCKET_')) sockets.push(name);
    const extras = node.getExtras() || {};
    if (extras.embeddedPlume === true) embeddedPlume = true;
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (name.includes('Hull') || name.includes('Pressure')) {
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        hullTriangles += indices ? Math.floor(indices.getCount() / 3) : 0;
      }
    }
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (mat) names.add(mat.getName() || '');
    }
  }
  await io.write(candidate, document);
  const materials = root.listMaterials().map((mat) => mat.getName());
  const bytes = readFileSync(candidate).byteLength;
  return {
    lod,
    path: rel(candidate),
    sourcePath: rel(source),
    bytes,
    sha256: sha256(candidate),
    hullTriangles,
    materials,
    sockets: sockets.sort(),
    missingSockets: REQUIRED_SOCKETS.filter((name) => !sockets.includes(name)),
    missingMaterials: REQUIRED_MATERIALS.filter((name) => !materials.includes(name) && ![...names].includes(name)),
    embeddedPlume,
    under100MiB: bytes < 100 * 1024 * 1024,
  };
}
