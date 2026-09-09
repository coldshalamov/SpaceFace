#!/usr/bin/env node
/** Publish the reviewed Helios civilian family into canonical authoring paths.
 *
 * This copies only the three deterministic source GLBs and upserts their source-manifest rows.
 * Runtime presentation mapping and incremental release publication remain explicit controller steps.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_civilian');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PACKET = 'M4-HELIOS-CIVILIAN-FLEET-BLENDER-001';
const COMMON_SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
]);
const SHIPS = Object.freeze([
  Object.freeze({ key: 'lark', id: 'helios_lark', title: 'Helios Lark', trafficRole: 'courier', role: 'civilian_courier_scout' }),
  Object.freeze({ key: 'cradle', id: 'helios_cradle', title: 'Helios Cradle', trafficRole: 'miner', role: 'civilian_miner_tug' }),
  Object.freeze({ key: 'span', id: 'helios_span', title: 'Helios Span', trafficRole: 'hauler', role: 'civilian_heavy_hauler' }),
]);

function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function rel(id) { return `wholeships/${id}.glb`; }

const manifest = json(MANIFEST_PATH);
if (!Array.isArray(manifest.parts) || !manifest.runtimeSlots || !Array.isArray(manifest.runtimeSlots.hull)) {
  throw new Error('parts manifest shape is not compatible with Helios civilian publication');
}

const promoted = [];
for (const ship of SHIPS) {
  const source = resolve(FAMILY, 'source/wholeships', `${ship.id}.glb`);
  const candidate = resolve(FAMILY, 'release_candidates/wholeships', `${ship.id}.glb`);
  const summaryPath = resolve(FAMILY, `evidence/${ship.key}/build_summary.json`);
  if (!existsSync(source) || !existsSync(candidate) || !existsSync(summaryPath)) {
    throw new Error(`${ship.id}: source/candidate/evidence incomplete`);
  }
  if (statSync(source).size >= 100_000_000 || statSync(candidate).size >= 100_000_000) {
    throw new Error(`${ship.id}: exceeds GitHub 100 MB file limit`);
  }
  const summary = json(summaryPath);
  if (summary.gateOk !== true) throw new Error(`${ship.id}: Blender source gate is not green`);

  const canonical = resolve(ROOT, 'assets/ships/parts', rel(ship.id));
  mkdirSync(dirname(canonical), { recursive: true });
  copyFileSync(source, canonical);

  const hooks = ['HOOK_DRIVE_CORE', 'HOOK_DRIVE_FAN', 'Gun_Assembly'];
  if (ship.key === 'cradle') hooks.push('Mining_Emitter');
  const dimensionsM = (summary.lod0AabbSize || []).map((n) => Number(Number(n).toFixed(4)));
  const entry = {
    id: `wholeship_${ship.id}`,
    category: 'wholeships',
    priority: 'P1',
    file: rel(ship.id),
    tris: Number(summary.totalTriangles) || 0,
    bytes: statSync(canonical).size,
    textureSize: 1024,
    tintable: { hull: 'Material_Hull', accent: 'Material_Cyan', warm: 'Material_Warm' },
    hooks,
    sockets: [...COMMON_SOCKETS],
    mount: 'origin',
    bounds: { dimensionsM },
    note: `${PACKET} — ${ship.title}, live Helios traffic role ${ship.trafficRole}; explicit LOD0/1/2, `
      + `${Object.values(summary.drawEstimates || {}).join('/')} draws, semantic 1K PBR maps, damageable drive/gun`
      + `${ship.key === 'cradle' ? '/mining' : ''} roles, stable sockets, no embedded plume. `
      + 'Project-original provenance: assets/ships/m4_helios_civilian/PROVENANCE.json.',
  };
  const index = manifest.parts.findIndex((part) => part.id === entry.id || part.file === entry.file);
  if (index >= 0) manifest.parts[index] = entry;
  else manifest.parts.push(entry);
  if (!manifest.runtimeSlots.hull.includes(entry.file)) manifest.runtimeSlots.hull.push(entry.file);
  promoted.push({ ...ship, source: entry.file, sourceBytes: entry.bytes, tris: entry.tris, dimensionsM });
}

writeJson(MANIFEST_PATH, manifest);

const familyMetricsPath = resolve(FAMILY, 'evidence/family/family_metrics.json');
if (existsSync(familyMetricsPath)) {
  const metrics = json(familyMetricsPath);
  metrics.packet = PACKET;
  metrics.promotion = {
    canonicalSource: true,
    partsManifestUpdated: true,
    overwritesK0AshlineOrStationAssets: false,
    civilianRoles: promoted.map(({ id, trafficRole, role }) => ({ id, trafficRole, role })),
  };
  delete metrics.isolation;
  writeJson(familyMetricsPath, metrics);
}

const finalizeReportPath = resolve(FAMILY, 'evidence/family/finalize_report.json');
if (existsSync(finalizeReportPath)) {
  const report = json(finalizeReportPath);
  report.packet = PACKET;
  const releasePublished = SHIPS.every((ship) => existsSync(resolve(
    ROOT, 'assets/ships/release/parts/wholeships', `${ship.id}.glb`,
  )));
  const partsLibrarySource = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
  const runtimeWired = SHIPS.every((ship) => partsLibrarySource.includes(rel(ship.id)));
  report.promotion = {
    canonicalSource: true,
    releasePublished,
    runtimeWired,
    releaseBuildPending: !releasePublished,
    runtimeWiringPending: !runtimeWired,
  };
  delete report.isolation;
  writeJson(finalizeReportPath, report);
}

console.log(JSON.stringify({ schema: 'spaceface.m4HeliosCivilianPublish.v1', packet: PACKET, promoted }, null, 2));
