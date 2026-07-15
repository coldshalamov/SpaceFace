#!/usr/bin/env node
/** Candidate-only structural gate for the isolated Helios Hub V6.1 family. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_hub_v6_1');
const PACKET = 'PROFESSIONAL-HELIOS-HUB-VISUAL-V6.1-CODEX-001';
const LIMIT_100MB = 100 * 1024 * 1024;
const ASSETS = [
  { id: 'helios_gate', lod0Max: 30000, materials: 4 },
  { id: 'helios_support_gantry', lod0Max: 3000, materials: 3 },
  { id: 'helios_support_dock_arm', lod0Max: 3000, materials: 3 },
  { id: 'helios_nav_spire', lod0Max: 3000, materials: 3 },
];

let errors = 0;
const ok = (message) => console.log(`ok - ${message}`);
const fail = (message) => { errors++; console.error(`FAIL - ${message}`); };
function need(path, label) {
  if (!existsSync(path)) { fail(`missing ${label}`); return false; }
  if (statSync(path).isFile() && statSync(path).size === 0) { fail(`empty ${label}`); return false; }
  return true;
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function glbJson(path) {
  const buffer = readFileSync(path);
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not GLB: ${path}`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').replace(/\0+$/, '').trim());
    }
    offset += length;
  }
  throw new Error(`GLB JSON chunk missing: ${path}`);
}
function meshTriangles(doc, meshIndex) {
  const mesh = doc.meshes?.[meshIndex];
  if (!mesh) return 0;
  let total = 0;
  for (const primitive of mesh.primitives || []) {
    const accessor = primitive.indices ?? primitive.attributes?.POSITION;
    const count = doc.accessors?.[accessor]?.count || 0;
    total += Math.floor(count / 3);
  }
  return total;
}
function lodTriangles(doc) {
  const totals = { lod0: 0, lod1: 0, lod2: 0 };
  for (const node of doc.nodes || []) {
    const name = String(node.name || '').toLowerCase();
    const lod = name.includes('lod0') ? 'lod0' : name.includes('lod1') ? 'lod1' : name.includes('lod2') ? 'lod2' : null;
    if (lod && node.mesh != null) totals[lod] += meshTriangles(doc, node.mesh);
  }
  return totals;
}

const donor = resolve(ROOT, 'assets/ships/m4_helios_hub_v6/source/reference/blenderkit_scifi_station/blenderkit_scifi_station_cc0.blend');
const donorProv = resolve(ROOT, 'assets/ships/m4_helios_hub_v6/source/reference/blenderkit_scifi_station/PROVENANCE.json');
const adaptation = resolve(FAMILY, 'PROVENANCE.json');
if (need(donor, 'dense CC0 station donor') && need(donorProv, 'donor provenance')) {
  const sourceText = JSON.stringify(json(donorProv)).toLowerCase();
  sourceText.includes('cc0') || sourceText.includes('cc_zero')
    ? ok('dense station donor has CC0 provenance') : fail('station donor provenance is not CC0');
}
if (need(adaptation, 'source adaptation record')) {
  const receipt = json(adaptation);
  receipt.packet === PACKET ? ok('delta provenance packet exact') : fail(`delta provenance packet mismatch: ${receipt.packet}`);
  receipt.candidateOnly === true && receipt.livePromotion === false
    ? ok('candidate isolation recorded') : fail('adaptation record does not preserve isolation');
}

const finalizePath = resolve(FAMILY, 'evidence/finalize_report.json');
if (need(finalizePath, 'finalize report')) {
  const report = json(finalizePath);
  report.packet === PACKET ? ok('finalizer packet exact') : fail(`finalizer packet mismatch: ${report.packet}`);
  report.okCount === ASSETS.length && report.failCount === 0
    ? ok(`finalizer covers all ${ASSETS.length} assets`) : fail(`finalizer result ${report.okCount}/${report.failCount}`);
  report.promote === false && report.acceptanceClaim === false
    ? ok('finalizer did not promote or self-accept') : fail('finalizer isolation/self-accept contract broken');
  report.threeReport?.ok === true && report.threeReport?.shotCount >= ASSETS.length * 3
    ? ok(`Three.js gameplay evidence ${report.threeReport.shotCount} shots`)
    : fail('Three.js close/mid/far gameplay evidence incomplete');
}

for (const asset of ASSETS) {
  const source = resolve(FAMILY, 'source/places', `${asset.id}.glb`);
  const candidate = resolve(FAMILY, 'release_candidates/places', `${asset.id}.glb`);
  const productionBlend = resolve(FAMILY, 'blender', `${asset.id}_production.blend`);
  const render = resolve(FAMILY, 'evidence/renders', asset.id, `${asset.id}_gamesky_forward_34.png`);
  if (![source, candidate, productionBlend, render].every((path, index) => need(path, `${asset.id} ${['source GLB', 'candidate GLB', 'production blend', 'gamesky render'][index]}`))) continue;
  statSync(candidate).size < LIMIT_100MB
    ? ok(`${asset.id} candidate ${(statSync(candidate).size / 1048576).toFixed(2)} MiB`)
    : fail(`${asset.id} exceeds GitHub 100 MiB limit`);

  let doc;
  try { doc = glbJson(candidate); } catch (error) { fail(error.message); continue; }
  const used = doc.extensionsUsed || [];
  used.includes('EXT_meshopt_compression') ? ok(`${asset.id} Meshopt`) : fail(`${asset.id} missing Meshopt`);
  used.includes('KHR_texture_basisu') ? ok(`${asset.id} KTX2`) : fail(`${asset.id} missing KTX2`);
  const names = (doc.nodes || []).map((node) => node.name || '');
  names.includes('SOCKET_Structure_Core') ? ok(`${asset.id} structure socket`) : fail(`${asset.id} missing structure socket`);
  names.includes('COLLISION_HULL') ? ok(`${asset.id} collision helper`) : fail(`${asset.id} missing collision helper`);
  (doc.materials || []).length >= asset.materials
    ? ok(`${asset.id} material separation ${(doc.materials || []).length}`)
    : fail(`${asset.id} insufficient material roles ${(doc.materials || []).length}/${asset.materials}`);

  const lod = lodTriangles(doc);
  lod.lod0 > lod.lod1 && lod.lod1 > lod.lod2 && lod.lod2 > 0
    ? ok(`${asset.id} monotonic LODs ${lod.lod0}/${lod.lod1}/${lod.lod2}`)
    : fail(`${asset.id} non-monotonic LODs ${JSON.stringify(lod)}`);
  lod.lod0 <= asset.lod0Max ? ok(`${asset.id} LOD0 budget ${lod.lod0}/${asset.lod0Max}`)
    : fail(`${asset.id} LOD0 over budget ${lod.lod0}/${asset.lod0Max}`);
  const l1 = lod.lod1 / Math.max(1, lod.lod0);
  const l2 = lod.lod2 / Math.max(1, lod.lod0);
  l1 >= 0.30 && l1 <= 0.55 ? ok(`${asset.id} LOD1 retention ${(l1 * 100).toFixed(1)}%`)
    : fail(`${asset.id} LOD1 retention ${(l1 * 100).toFixed(1)}% outside 30-55%`);
  l2 >= 0.08 && l2 <= 0.22 ? ok(`${asset.id} LOD2 retention ${(l2 * 100).toFixed(1)}%`)
    : fail(`${asset.id} LOD2 retention ${(l2 * 100).toFixed(1)}% outside 8-22%`);
}

console.error(`\ncheck-m4-helios-hub-v6-1: ${errors ? 'FAIL' : 'PASS'} (${errors} errors)`);
process.exitCode = errors ? 1 : 0;
