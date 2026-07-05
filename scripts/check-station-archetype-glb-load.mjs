#!/usr/bin/env node
// Provenance gate for station archetype GLBs: Blender vertical slice + load sanity.
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

import { measureConceptGlbResemblance } from './lib/silhouette-raster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json');
const MIN_SILHOUETTE_IOU = Number(process.env.PLACE_SILHOUETTE_MIN_IOU || '0.12');
const RELEASE_ROOT = resolve(ROOT, 'assets/ships/release/parts/places');
const SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/places');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const authoring = existsSync(AUTHORING_PATH)
  ? JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'))
  : null;
const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  : { promotions: {} };
const VERBOSE = process.argv.includes('--verbose');

const ARCHETYPES = [
  'place_station_trade_hub',
  'place_station_refinery',
  'place_station_military',
  'place_station_blackmarket',
  'place_station_fab',
  'place_station_mining',
  'place_station_research',
  'place_gate_jump_ring',
];

const BOX_FALLBACK_MAX_TRIS = 12;
const MIN_BLENDER_SLICE = 3;
const MIN_CONCEPT_BYTES = 8000;

function isRasterImage(path) {
  if (!existsSync(path)) return false;
  const head = readFileSync(path).subarray(0, 4);
  const jpg = head[0] === 0xff && head[1] === 0xd8;
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  return jpg || png;
}

function readGlbGenerator(glbPath) {
  const bytes = readFileSync(glbPath);
  const jsonLen = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, ''));
  return String(json.asset?.generator || '');
}

function bboxKey(doc) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
        minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1]);
        minZ = Math.min(minZ, arr[i + 2]); maxZ = Math.max(maxZ, arr[i + 2]);
      }
    }
  }
  const dx = Math.round((maxX - minX) * 10) / 10;
  const dy = Math.round((maxY - minY) * 10) / 10;
  const dz = Math.round((maxZ - minZ) * 10) / 10;
  return { key: `${dx}x${dy}x${dz}`, dx, dy, dz };
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});

let ok = 0;
let fail = 0;
const transcript = [];
function check(label, cond, detail = '') {
  const line = cond
    ? `OK    ${label}${detail ? ` — ${detail}` : ''}`
    : `FAIL  ${label}${detail ? ` — ${detail}` : ''}`;
  transcript.push(line);
  if (VERBOSE || !cond) console.log(line);
  if (cond) ok++;
  else fail++;
}

function countTris(doc) {
  let tris = 0;
  let meshes = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    meshes++;
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += indices.getCount() / 3;
      else {
        const pos = prim.getAttribute('POSITION');
        if (pos) tris += Math.max(0, pos.getCount() - 2);
      }
    }
  }
  return { tris: Math.round(tris), meshes };
}

const manifestById = new Map((MANIFEST.parts || []).map((p) => [p.id, p]));
const entries = authoring?.entries ?? {};
const verticalSlice = authoring?.vertical_slice ?? [];
const minBlenderTris = authoring?.min_tris_blender_mcp ?? 1500;
const blenderBboxes = new Map();

let blenderMcpCount = 0;
for (const id of verticalSlice) {
  const entry = entries[id];
  check(`${id}: listed in vertical_slice`, !!entry, 'missing authoring entry');
  if (!entry) continue;
  if (entry.method === 'bootstrap_pending') {
    check(`${id}: bootstrap_pending GLB exported`, existsSync(resolve(SOURCE_ROOT, `${id}.glb`)));
    if (entry.concept_path) {
      const conceptAbs = resolve(ROOT, entry.concept_path);
      check(`${id}: concept on disk (bootstrap)`, existsSync(conceptAbs), entry.concept_path);
    }
    continue;
  }
  if (entry.method === 'blender_mcp') {
    blenderMcpCount++;
    check(`${id}: blender_mcp method`, entry.method === 'blender_mcp');
    if (entry.blend_path) {
      check(`${id}: blend on disk`, existsSync(resolve(ROOT, entry.blend_path)), entry.blend_path);
    }
    if (entry.concept_path) {
      const conceptAbs = resolve(ROOT, entry.concept_path);
      check(`${id}: concept on disk`, existsSync(conceptAbs), entry.concept_path);
      if (existsSync(conceptAbs)) {
        const bytes = statSync(conceptAbs).size;
        check(`${id}: concept JPG loadable raster`, isRasterImage(conceptAbs), entry.concept_path);
        check(`${id}: concept reference non-trivial size`, bytes >= MIN_CONCEPT_BYTES, `bytes=${bytes}`);
      }
      const src = resolve(SOURCE_ROOT, `${id}.glb`);
      const generator = existsSync(src) ? readGlbGenerator(src) : '';
      check(`${id}: concept-linked GLB generator`, generator.includes('author_place_archetype.py'),
        `generator=${generator}`);
    }
    const manifestTris = manifestById.get(id)?.tris ?? 0;
    check(`${id}: manifest tris >= blender floor`, manifestTris >= (entry.min_tris ?? minBlenderTris),
      `tris=${manifestTris} min=${entry.min_tris ?? minBlenderTris}`);
    const sourcePath = resolve(SOURCE_ROOT, `${id}.glb`);
    if (existsSync(sourcePath)) {
      const srcDoc = await io.read(sourcePath);
      const srcTris = countTris(srcDoc).tris;
      check(`${id}: source tris >= blender floor`, srcTris >= (entry.min_tris ?? minBlenderTris), `srcTris=${srcTris}`);
      blenderBboxes.set(id, bboxKey(srcDoc));
      const bb = blenderBboxes.get(id);
      check(`${id}: silhouette bbox non-degenerate`, bb.dx > 2 && bb.dy > 2 && bb.dz > 2, bb.key);
      const relPath = resolve(RELEASE_ROOT, `${id}.glb`);
      if (existsSync(relPath)) {
        const relTris = countTris(await io.read(relPath)).tris;
        check(`${id}: release tris match source`, relTris >= srcTris * 0.9, `release=${relTris} source=${srcTris}`);
      }
      if (entry.concept_path && existsSync(resolve(ROOT, entry.concept_path))) {
        const resemblance = await measureConceptGlbResemblance(
          resolve(ROOT, entry.concept_path),
          sourcePath,
        );
        check(`${id}: concept↔GLB silhouette IoU >= ${MIN_SILHOUETTE_IOU}`,
          resemblance.iou >= MIN_SILHOUETTE_IOU,
          `iou=${resemblance.iou.toFixed(4)} align=dx${resemblance.align.dx},dy${resemblance.align.dy},flip=${resemblance.align.flip}`);
        const promo = ledger.promotions?.[id];
        if (promo) {
          check(`${id}: ledger silhouette_iou matches`, Math.abs(promo.silhouette_iou - resemblance.iou) < 0.02,
            `ledger=${promo.silhouette_iou} now=${resemblance.iou.toFixed(4)}`);
        }
      }
    }
  } else {
    check(`${id}: still procedural_fallback (vertical slice incomplete)`, false, `method=${entry.method}`);
  }
}
check(`vertical slice blender_mcp count >= ${MIN_BLENDER_SLICE}`, blenderMcpCount >= MIN_BLENDER_SLICE, `count=${blenderMcpCount}`);

const blenderIds = [...blenderBboxes.keys()];
for (let i = 0; i < blenderIds.length; i++) {
  for (let j = i + 1; j < blenderIds.length; j++) {
    const a = blenderIds[i];
    const b = blenderIds[j];
    check(`${a} vs ${b}: distinct silhouette bbox`,
      blenderBboxes.get(a).key !== blenderBboxes.get(b).key,
      `${blenderBboxes.get(a).key} vs ${blenderBboxes.get(b).key}`);
  }
}

for (const id of ARCHETYPES) {
  const glbPath = resolve(RELEASE_ROOT, `${id}.glb`);
  check(`${id}: release file exists`, existsSync(glbPath), glbPath);
  if (!existsSync(glbPath)) continue;

  const doc = await io.read(glbPath);
  const { tris, meshes } = countTris(doc);
  check(`${id}: release loads`, !!doc);
  check(`${id}: mesh count > 1`, meshes > 1, `meshes=${meshes}`);
  check(`${id}: release tris exceed box fallback`, tris > BOX_FALLBACK_MAX_TRIS, `tris=${tris}`);

  const matNames = new Set();
  for (const mat of doc.getRoot().listMaterials()) matNames.add(mat.getName());
  check(`${id}: Material_Hull present`, matNames.has('Material_Hull'), [...matNames].join(','));
}

const summary = `\nstation-archetype-glb-load: ${ok} ok, ${fail} fail`;
transcript.push(summary.trim());
console.log(summary);
if (process.env.PLACE_IDENTITY_TRANSCRIPT) {
  writeFileSync(process.env.PLACE_IDENTITY_TRANSCRIPT, `${transcript.join('\n')}\n`);
}
process.exit(fail ? 1 : 0);