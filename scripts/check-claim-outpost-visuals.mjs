#!/usr/bin/env node
// Focused acceptance for the authored player-claim growth family.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = [
  ['place_claim_outpost_base', null],
  ['place_claim_outpost_refinery', 'spec_refinery'],
  ['place_claim_outpost_relay', 'spec_relay'],
  ['place_claim_outpost_bastion', 'spec_bastion'],
];
const sourceRoot = resolve(ROOT, 'assets/ships/parts/places');
const releaseRoot = resolve(ROOT, 'assets/ships/release/parts/places');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const manifestById = new Map(manifest.parts.map((part) => [part.id, part]));
const claimsSource = readFileSync(resolve(ROOT, 'src/systems/claims.js'), 'utf8');

globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {} }),
  getElementById: () => null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
const { resolvePlaceFileForEntity } = await import('../src/render/partsLibrary.js');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let ok = 0; let fail = 0;
function check(label, condition, detail = '') {
  if (condition) ok++;
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}
function metrics(doc) {
  const lod = { lod0: 0, lod1: 0, lod2: 0 };
  const materials = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  const sockets = new Set(doc.getRoot().listNodes().map((n) => n.getName()).filter((n) => n.startsWith('SOCKET_')));
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = node.getName();
    const match = name.match(/^LOD([012])_/i);
    if (!match) continue;
    const key = `lod${match[1]}`;
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      lod[key] += indices ? indices.getCount() / 3 : Math.max(0, (prim.getAttribute('POSITION')?.getCount() || 0) - 2);
    }
  }
  return { lod, materials, sockets };
}

for (const [id, specId] of IDS) {
  const source = resolve(sourceRoot, `${id}.glb`);
  const release = resolve(releaseRoot, `${id}.glb`);
  check(`${id}: source exists`, existsSync(source));
  check(`${id}: release exists`, existsSync(release));
  check(`${id}: source below 100MB`, existsSync(source) && statSync(source).size < 100_000_000);
  check(`${id}: release below 100MB`, existsSync(release) && statSync(release).size < 100_000_000);
  if (!existsSync(source) || !existsSync(release)) continue;
  const srcDoc = await io.read(source);
  const relDoc = await io.read(release);
  const src = metrics(srcDoc); const rel = metrics(relDoc);
  check(`${id}: explicit decreasing LODs`, src.lod.lod0 > src.lod.lod1 && src.lod.lod1 > src.lod.lod2,
    JSON.stringify(src.lod));
  check(`${id}: release geometry parity`, rel.lod.lod0 === src.lod.lod0 && rel.lod.lod1 === src.lod.lod1 && rel.lod.lod2 === src.lod.lod2,
    `source=${JSON.stringify(src.lod)} release=${JSON.stringify(rel.lod)}`);
  for (const mat of ['Material_Hull', 'Material_Mechanical', 'Material_Accent']) {
    check(`${id}: ${mat}`, src.materials.has(mat), [...src.materials].join(','));
  }
  for (const socket of ['SOCKET_Structure_Core', 'SOCKET_Module_Depot', 'SOCKET_Module_Refinery', 'SOCKET_Module_Defense', 'SOCKET_Module_Teleporter']) {
    check(`${id}: ${socket}`, src.sockets.has(socket), [...src.sockets].join(','));
  }
  const manifestEntry = manifestById.get(id);
  check(`${id}: manifest entry`, !!manifestEntry);
  check(`${id}: runtime slot`, manifest.runtimeSlots.place.includes(`places/${id}.glb`));
  const entity = { type: 'fx', data: specId ? { claimSpecId: specId, landmarkGlb: 'place_asteroid_rock_a' } : { claimOwned: true } };
  check(`${id}: runtime resolver`, resolvePlaceFileForEntity(entity) === `places/${id}.glb`, resolvePlaceFileForEntity(entity));
}

check('claims: live POI gets presentation ownership stamp',
  /e\.data\.claimOwned\s*=\s*body\.owned\s*===\s*true/.test(claimsSource));
check('claims: all bodies refresh their live POI presentation',
  /_applyAllPoiLabels\(\)\s*\{[\s\S]*?for\s*\(const body[\s\S]*?\)\s*\{\s*this\._applyPoiLabel\(body\);/.test(claimsSource));

console.log(`\nclaim-outpost-visuals: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
