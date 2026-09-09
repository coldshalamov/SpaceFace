#!/usr/bin/env node
/** Focused production contract for the live M4 Helios civilian ship family. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_civilian');
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const REQUIRED_MATERIALS = [
  'Material_Hull', 'Material_Mechanical', 'Material_Cyan', 'Material_Warm', 'Material_Glass',
];
const SHIPS = [
  { key: 'lark', id: 'helios_lark', assetId: 'SF_WHOLESHIP_HELIOS_LARK', role: 'civilian_courier_scout', trafficRole: 'courier' },
  { key: 'cradle', id: 'helios_cradle', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE', role: 'civilian_miner_tug', trafficRole: 'miner' },
  { key: 'span', id: 'helios_span', assetId: 'SF_WHOLESHIP_HELIOS_SPAN', role: 'civilian_heavy_hauler', trafficRole: 'hauler' },
];

globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {} }),
  getElementById: () => null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
const {
  PART_LIBRARY_CONTRACT,
  resolveRequiredWholeShipRecord,
  wholeShipVisualForEntity,
} = await import('../src/render/partsLibrary.js');

const errors = [];
const warnings = [];
const info = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const ok = (message) => info.push(message);

function sha256(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex').toUpperCase();
}

function readGlb(abs) {
  const bytes = readFileSync(abs);
  if (bytes.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${abs}: not GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/, '').trim());
    if (type === 0x004e4942) bin = chunk;
    offset += length;
  }
  if (!json || !bin) throw new Error(`${abs}: missing JSON/BIN chunks`);
  return { json, bin, bytes };
}

function imageDimensions(doc, image) {
  const view = doc.json.bufferViews?.[image.bufferView];
  if (!view) return null;
  const start = Number(view.byteOffset || 0);
  const b = doc.bin.subarray(start, start + view.byteLength);
  if (b.length >= 24 && b.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), kind: 'png' };
  }
  if (b.length >= 28 && b.toString('hex', 0, 12) === 'ab4b5458203230bb0d0a1a0a') {
    return { width: b.readUInt32LE(20), height: b.readUInt32LE(24), kind: 'ktx2' };
  }
  return null;
}

function nodeTriangles(doc, prefix) {
  let total = 0;
  for (const node of doc.json.nodes || []) {
    if (!String(node.name || '').startsWith(prefix) || node.mesh == null) continue;
    const mesh = doc.json.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      const accessor = doc.json.accessors?.[primitive.indices];
      if (accessor) total += Math.floor(Number(accessor.count || 0) / 3);
    }
  }
  return total;
}

function audit(abs, ship, release) {
  if (!existsSync(abs)) { fail(`${ship.id}: missing ${release ? 'release' : 'source'} ${abs}`); return null; }
  const size = statSync(abs).size;
  if (size >= 100_000_000) fail(`${ship.id}: ${abs} exceeds 100 MB`);
  const doc = readGlb(abs);
  const sf = doc.json.asset?.extras?.spacefaceAsset || {};
  if (sf.assetId !== ship.assetId) fail(`${ship.id}: assetId ${sf.assetId}`);
  if (sf.partId !== `wholeship_${ship.id}`) fail(`${ship.id}: partId ${sf.partId}`);
  if (sf.family !== 'helios_civilian') fail(`${ship.id}: family ${sf.family}`);
  if (sf.role !== ship.role) fail(`${ship.id}: role ${sf.role}`);

  const names = new Set((doc.json.nodes || []).map((node) => node.name).filter(Boolean));
  for (const socket of REQUIRED_SOCKETS) if (!names.has(socket)) fail(`${ship.id}: missing ${socket}`);
  if (!names.has('COLLISION_HULL')) fail(`${ship.id}: missing COLLISION_HULL`);
  for (const lod of ['LOD0_', 'LOD1_', 'LOD2_']) {
    if (![...names].some((name) => name.startsWith(lod))) fail(`${ship.id}: missing ${lod} meshes`);
  }
  if (![...names].some((name) => /HOOK_DRIVE_CORE/i.test(name))) fail(`${ship.id}: missing drive core hook`);
  if (![...names].some((name) => /HOOK_DRIVE_FAN/i.test(name))) fail(`${ship.id}: missing drive fan hook`);
  if (![...names].some((name) => /Gun_Assembly/i.test(name))) fail(`${ship.id}: missing gun hook`);
  if (ship.key === 'cradle' && ![...names].some((name) => /Mining_Emitter/i.test(name))) {
    fail(`${ship.id}: missing mining hook`);
  }

  const materials = new Map((doc.json.materials || []).map((material) => [material.name, material]));
  for (const name of REQUIRED_MATERIALS) if (!materials.has(name)) fail(`${ship.id}: missing ${name}`);
  for (const [name, material] of materials) {
    const pbr = material.pbrMetallicRoughness || {};
    if (!pbr.baseColorTexture) fail(`${ship.id}/${name}: missing baseColorTexture`);
    if (!material.normalTexture) fail(`${ship.id}/${name}: missing normalTexture`);
    if (!material.occlusionTexture) fail(`${ship.id}/${name}: missing occlusionTexture`);
    if (!pbr.metallicRoughnessTexture) fail(`${ship.id}/${name}: missing packed ORM binding`);
  }

  const imageMetrics = (doc.json.images || []).map((image) => ({
    mime: String(image.mimeType || '').toLowerCase(),
    ...imageDimensions(doc, image),
  }));
  if (!imageMetrics.length) fail(`${ship.id}: no embedded textures`);
  if (release) {
    if (!imageMetrics.every((metric) => metric.kind === 'ktx2')) fail(`${ship.id}: release textures are not all KTX2`);
    if (!(doc.json.extensionsUsed || []).includes('EXT_meshopt_compression')) fail(`${ship.id}: missing Meshopt extension`);
    if (!(doc.json.extensionsUsed || []).includes('KHR_texture_basisu')) fail(`${ship.id}: missing BasisU extension`);
    const compressedViews = (doc.json.bufferViews || []).filter((view) => view.extensions?.EXT_meshopt_compression).length;
    if (compressedViews < 1) fail(`${ship.id}: zero Meshopt-compressed bufferViews`);
  } else if (!imageMetrics.every((metric) => metric.kind === 'png' && metric.width === 1024 && metric.height === 1024)) {
    fail(`${ship.id}: source textures are not all informative 1024px PNG maps`);
  }

  const lod = {
    lod0: nodeTriangles(doc, 'LOD0_'),
    lod1: nodeTriangles(doc, 'LOD1_'),
    lod2: nodeTriangles(doc, 'LOD2_'),
  };
  if (!(lod.lod0 > lod.lod1 && lod.lod1 > lod.lod2 && lod.lod2 > 0)) {
    fail(`${ship.id}: non-monotonic LODs ${JSON.stringify(lod)}`);
  }
  const primitiveCount = (doc.json.meshes || []).reduce((n, mesh) => n + (mesh.primitives || []).length, 0);
  if (primitiveCount > 30) fail(`${ship.id}: ${primitiveCount} primitives exceeds structural family ceiling 30`);
  ok(`${ship.id}/${release ? 'release' : 'source'}: ${size} bytes, lod=${lod.lod0}/${lod.lod1}/${lod.lod2}, primitives=${primitiveCount}, images=${imageMetrics.length}`);
  return { size, sha256: sha256(abs), lod, primitiveCount, imageCount: imageMetrics.length };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out); else out.push(abs);
  }
  return out;
}

for (const abs of walk(FAMILY)) {
  if (/\.blend1$|\.tmp(?:\.|$)/i.test(abs)) fail(`ephemeral authoring artifact remains: ${abs}`);
  if (statSync(abs).size >= 100_000_000) fail(`file exceeds 100 MB: ${abs}`);
}

const finalize = JSON.parse(readFileSync(resolve(FAMILY, 'evidence/family/finalize_report.json'), 'utf8'));
const partsManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const releaseManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
const hullContract = new Set(PART_LIBRARY_CONTRACT.slots.hull || []);
const releaseRecords = [];

for (const ship of SHIPS) {
  const familySource = resolve(FAMILY, 'source/wholeships', `${ship.id}.glb`);
  const candidate = resolve(FAMILY, 'release_candidates/wholeships', `${ship.id}.glb`);
  const canonicalSource = resolve(ROOT, 'assets/ships/parts/wholeships', `${ship.id}.glb`);
  const canonicalRelease = resolve(ROOT, 'assets/ships/release/parts/wholeships', `${ship.id}.glb`);
  const sourceMetrics = audit(familySource, ship, false);
  const candidateMetrics = audit(candidate, ship, true);
  const canonicalSourceMetrics = audit(canonicalSource, ship, false);
  const releaseMetrics = audit(canonicalRelease, ship, true);
  if (sourceMetrics && canonicalSourceMetrics && sourceMetrics.sha256 !== canonicalSourceMetrics.sha256) {
    fail(`${ship.id}: canonical source differs from reviewed family source`);
  }
  const finalized = (finalize.finalized || []).find((row) => row.id === ship.id);
  if (!finalized || finalized.sourceSha256 !== sourceMetrics?.sha256 || finalized.candidateSha256 !== candidateMetrics?.sha256) {
    fail(`${ship.id}: finalize report hash mismatch`);
  }
  const file = `wholeships/${ship.id}.glb`;
  const part = (partsManifest.parts || []).find((row) => row.id === `wholeship_${ship.id}` && row.file === file);
  if (!part || part.textureSize !== 1024) fail(`${ship.id}: source manifest row missing/incorrect`);
  if (!(partsManifest.runtimeSlots?.hull || []).includes(file)) fail(`${ship.id}: source runtime hull slot missing`);
  if (!hullContract.has(file)) fail(`${ship.id}: PART_LIBRARY_CONTRACT hull slot missing`);
  const releaseRow = (releaseManifest.assets || []).find((row) => row.id === `wholeship_${ship.id}`);
  if (!releaseRow || releaseRow.releaseSha256?.toUpperCase() !== releaseMetrics?.sha256) {
    fail(`${ship.id}: release manifest row/hash missing`);
  }
  const selection = wholeShipVisualForEntity({ data: { trafficRole: ship.trafficRole, defId: ship.trafficRole === 'courier' ? 'ship_kestrel' : null } });
  if (selection?.file !== file || selection?.assetId !== ship.assetId || selection?.roleId !== ship.trafficRole) {
    fail(`${ship.id}: live traffic selection mismatch ${JSON.stringify(selection)}`);
  }
  releaseRecords.push({ url: `assets/ships/release/parts/${file}`, assetId: ship.assetId, marker: ship.id });
  const resolved = resolveRequiredWholeShipRecord({ data: { trafficRole: ship.trafficRole } }, releaseRecords, { releaseMode: true });
  if (!resolved || resolved.marker !== ship.id) fail(`${ship.id}: required release record does not resolve`);
}

const kestrel = wholeShipVisualForEntity(
  { data: { defId: 'ship_kestrel' } },
  { requiredWholeShip: true },
);
if (kestrel?.file !== 'wholeships/kestrel.glb') fail('player Kestrel mapping changed');
const hostile = wholeShipVisualForEntity({ data: { lootTableId: 'wasp_swarmer' } });
if (hostile?.file !== 'wholeships/ashline_dart.glb') fail('Ashline hostile mapping changed');

const report = {
  schema: 'spaceface.m4HeliosCivilianCheck.v1',
  ok: errors.length === 0,
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
  info,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(`check-m4-helios-civilian-family: FAIL (${errors.length} errors)`);
  process.exit(1);
}
console.error(`check-m4-helios-civilian-family: PASS (${warnings.length} warnings)`);
