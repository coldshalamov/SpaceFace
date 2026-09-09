#!/usr/bin/env node
/** Publish the PQ-045 NPC work fleet into canonical authoring paths.
 *
 * Finalizes the four Blender-built source GLBs in place (occlusion assignment —
 * the ORM image's R channel carries the AO bake — plus contract tag
 * normalization), copies them into `assets/ships/parts/wholeships/`, and upserts
 * their `parts_manifest.json` rows + `runtimeSlots.hull` entries.
 *
 * Follows the lane precedent of `publish_m4_helios_civilian_family.mjs`:
 * incremental release publication and render-package generation remain explicit
 * controller steps after this script:
 *
 *   node scripts/build-sg04-release-assets.mjs --no-clean --only \
 *     wholeship_ore_barge,wholeship_repair_tender,wholeship_salvage_cutter,wholeship_survey_pin
 *   node scripts/generate-render-package-pilots.mjs
 *   node scripts/build-render-package-pilots.mjs
 *
 * Donor boundary: this publishes the RE-AUTHORED fleet from
 * `assets/ships/npc_work_fleet/` (built by `tools/blender/build_npc_work_fleet.py`),
 * never the incubator donor GLBs, and it touches no accepted asset.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/npc_work_fleet');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PACKET = 'PQ-045-NPC-IDENTITY-WORK-FLEET-001';

const SHIPS = Object.freeze([
  Object.freeze({ id: 'ore_barge', title: 'Ore Barge', trafficRole: 'ore_carrier', role: 'civilian_ore_carrier_barge' }),
  Object.freeze({ id: 'repair_tender', title: 'Repair Tender', trafficRole: 'tender', role: 'civilian_repair_tender' }),
  Object.freeze({ id: 'salvage_cutter', title: 'Salvage Cutter', trafficRole: 'salvor', role: 'civilian_salvage_cutter' }),
  Object.freeze({ id: 'survey_pin', title: 'Survey Pin', trafficRole: 'surveyor', role: 'civilian_survey_pin' }),
  Object.freeze({ id: 'rescue_lifter', title: 'Rescue Lifter', trafficRole: 'rescue', role: 'civilian_rescue_lifter' }),
  Object.freeze({ id: 'volatiles_tanker', title: 'Volatiles Tanker', trafficRole: 'tanker', role: 'civilian_volatiles_tanker' }),
  Object.freeze({ id: 'prospector_skiff', title: 'Prospector Skiff', trafficRole: 'prospector', role: 'civilian_prospector_skiff' }),
  Object.freeze({ id: 'scrap_sweeper', title: 'Scrap Sweeper', trafficRole: 'sweeper', role: 'civilian_scrap_sweeper' }),
  Object.freeze({ id: 'yard_tug', title: 'Yard Tug', trafficRole: 'tug', role: 'civilian_yard_tug' }),
  Object.freeze({ id: 'inspection_cutter', title: 'Inspection Cutter', trafficRole: 'customs', role: 'law_inspection_cutter' }),
  Object.freeze({ id: 'apron_shuttle', title: 'Apron Shuttle', trafficRole: 'shuttle', role: 'civilian_apron_shuttle' }),
]);

function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function rel(id) { return `wholeships/${id}.glb`; }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function finalizeSource(abs, ship) {
  const document = await io.read(abs);
  const root = document.getRoot();

  // AO bake lives in R of each material's packed ORM image; Blender's exporter does
  // not emit the occlusion slot, so bind it here (same texture, no new image).
  for (const material of root.listMaterials()) {
    const orm = material.getMetallicRoughnessTexture();
    if (orm && !material.getOcclusionTexture()) {
      material.setOcclusionTexture(orm);
      material.setOcclusionStrength(1);
    }
  }

  // Contract tag normalization (same rule as the helios finalizer): drive damage is
  // bound by the drive tag itself; `damageRole: drive` is not a contract value.
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (/HOOK_DRIVE_/i.test(name) || sf.drive) {
      if (String(sf.damageRole || '').toLowerCase() === 'drive') delete sf.damageRole;
      if (String(extras.damageRole || '').toLowerCase() === 'drive') delete extras.damageRole;
    }
    if (name.startsWith('SOCKET_')) {
      sf.socket = true;
      extras.socket = true;
    }
    extras.spaceface = sf;
    node.setExtras(extras);
  }

  // Exact world-space bounds across every mesh node (all LODs + the collision helper),
  // vertex-precise, so the manifest and the GLB extras agree with the parts-manifest
  // audit's own measurement by construction.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vertex = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, vertex);
        const v = [
          world[0] * vertex[0] + world[4] * vertex[1] + world[8] * vertex[2] + world[12],
          world[1] * vertex[0] + world[5] * vertex[1] + world[9] * vertex[2] + world[13],
          world[2] * vertex[0] + world[6] * vertex[1] + world[10] * vertex[2] + world[14],
        ];
        for (let axis = 0; axis < 3; axis++) {
          if (v[axis] < min[axis]) min[axis] = v[axis];
          if (v[axis] > max[axis]) max[axis] = v[axis];
        }
      }
    }
  }
  const dimensionsM = min.map((v, i) => Number((max[i] - v).toFixed(4)));

  const asset = root.getAsset();
  const extras = { ...(asset.extras || {}) };
  extras.boundsDimensionsM = dimensionsM;
  extras.spacefaceAsset = {
    ...(extras.spacefaceAsset || {}),
    textureCompression: 'PNG-source',
    textureResolution: '1024x1024/512x512 role-weighted',
    textureAuthorship: 'deterministic role-classified procedural PBR maps (builder)',
    wiringStatus: 'runtime_wired',
    finalize: { occlusionBoundToPackedOrm: true, tool: 'publish_npc_work_fleet.mjs' },
  };
  asset.extras = extras;
  await io.write(abs, document);
  return {
    bounds: {
      min: min.map((v) => Number(v.toFixed(4))),
      max: max.map((v) => Number(v.toFixed(4))),
      dimensionsM,
    },
  };
}

const buildReportPath = resolve(FAMILY, 'evidence/build-report.json');
if (!existsSync(buildReportPath)) throw new Error('missing family build-report.json — run the Blender builder first');
const buildReport = json(buildReportPath);
const reportById = new Map((buildReport.ships || []).map((row) => [row.id, row]));

const manifest = json(MANIFEST_PATH);
if (!Array.isArray(manifest.parts) || !manifest.runtimeSlots || !Array.isArray(manifest.runtimeSlots.hull)) {
  throw new Error('parts manifest shape is not compatible with NPC work fleet publication');
}

const onlyArg = process.argv.includes('--only')
  ? String(process.argv[process.argv.indexOf('--only') + 1] || '').split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const selected = onlyArg ? SHIPS.filter((ship) => onlyArg.includes(ship.id)) : SHIPS;
if (onlyArg && selected.length !== onlyArg.length) {
  throw new Error(`unknown --only id; expected one of ${SHIPS.map((s) => s.id).join(',')}`);
}

const promoted = [];
for (const ship of selected) {
  const source = resolve(FAMILY, 'source/wholeships', `${ship.id}.glb`);
  const report = reportById.get(ship.id);
  if (!existsSync(source) || !report) throw new Error(`${ship.id}: source GLB or build report row missing`);

  const { bounds } = await finalizeSource(source, ship);

  const canonical = resolve(ROOT, 'assets/ships/parts', rel(ship.id));
  mkdirSync(dirname(canonical), { recursive: true });
  copyFileSync(source, canonical);

  const lod0 = (report.lodStats || []).find((row) => row.lod === 'lod0') || {};
  const entry = {
    id: `wholeship_${ship.id}`,
    category: 'wholeships',
    priority: 'P2',
    file: rel(ship.id),
    tris: report.glb.triangles || lod0.triangles || 0,
    bytes: statSync(canonical).size,
    textureSize: 1024,
    tintable: { hull: 'Material_Hull', accent: 'Material_Cyan', warm: 'Material_Warm' },
    hooks: ['HOOK_DRIVE_CORE', 'HOOK_DRIVE_FAN'],
    sockets: [...(report.glb.sockets || [])],
    mount: 'origin',
    bounds,
    note: `${PACKET} — ${ship.title}, live traffic role ${ship.trafficRole}; re-authored from the `
      + `npc_activity_pack donor silhouette (review 2026-08-08 boundary: re-author, never copy), `
      + `explicit LOD0/1/2 (${(report.lodStats || []).map((row) => row.triangles).join('/') } tris), `
      + 'role-classified procedural 1K PBR maps, packed ORM with bound occlusion, stable sockets, '
      + 'no embedded plume. Whole-asset G1/G2/G4 remain OPEN pending independent hash-bound review. '
      + 'Project-original provenance: assets/ships/npc_work_fleet/PROVENANCE.json.',
  };
  const index = manifest.parts.findIndex((part) => part.id === entry.id || part.file === entry.file);
  if (index >= 0) manifest.parts[index] = entry;
  else manifest.parts.push(entry);
  if (!manifest.runtimeSlots.hull.includes(entry.file)) manifest.runtimeSlots.hull.push(entry.file);
  promoted.push({ id: ship.id, trafficRole: ship.trafficRole, file: entry.file, tris: entry.tris, bytes: entry.bytes });
}

writeJson(MANIFEST_PATH, manifest);
console.log(JSON.stringify({
  schema: 'spaceface.npcWorkFleetPublish.v1',
  packet: PACKET,
  promoted,
}, null, 2));
