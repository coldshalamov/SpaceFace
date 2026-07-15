#!/usr/bin/env node
// Promote bootstrap_pending place archetype → blender_mcp while recording silhouette diagnostics.
//
// Usage:
//   node scripts/promote-place-archetype.mjs place_station_trade_hub
//   node scripts/promote-place-archetype.mjs --all
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureConceptGlbResemblance } from './lib/silhouette-raster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const LEDGER_PATH = resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json');
const SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/places');

const argv = process.argv.slice(2);
const promoteAll = argv.includes('--all');
const partId = argv.find((a) => !a.startsWith('--'));

if (!promoteAll && !partId) {
  console.error('usage: promote-place-archetype.mjs <place_id> | --all');
  process.exit(2);
}

const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
const verticalSlice = authoring.vertical_slice ?? [];
const targets = promoteAll ? verticalSlice : [partId];

const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  : { schemaVersion: 1, promotions: {} };
if (!ledger.promotions) ledger.promotions = {};

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

let promoted = 0;
let rejected = 0;

for (const id of targets) {
  const entry = authoring.entries?.[id];
  if (!entry) {
    console.error(`FAIL ${id}: not in authoring.json`);
    rejected++;
    continue;
  }
  if (entry.method === 'blender_mcp' && ledger.promotions[id]) {
    console.log(`SKIP ${id}: already promoted (iou=${ledger.promotions[id].silhouette_iou})`);
    continue;
  }
  if (entry.method !== 'bootstrap_pending' && entry.method !== 'blender_mcp') {
    console.error(`FAIL ${id}: method=${entry.method} (expected bootstrap_pending)`);
    rejected++;
    continue;
  }

  const conceptPath = resolve(ROOT, entry.concept_path);
  const glbPath = resolve(SOURCE_ROOT, `${id}.glb`);
  const blendPath = entry.blend_path ? resolve(ROOT, entry.blend_path) : null;

  if (!existsSync(conceptPath) || !existsSync(glbPath)) {
    console.error(`FAIL ${id}: missing concept or GLB`);
    rejected++;
    continue;
  }

  const result = await measureConceptGlbResemblance(conceptPath, glbPath);
  entry.method = 'blender_mcp';
  if (blendPath) entry.blend_path = entry.blend_path;

  ledger.promotions[id] = {
    concept_sha256: sha256File(conceptPath),
    glb_sha256: sha256File(glbPath),
    blend_mtime: blendPath && existsSync(blendPath) ? statSync(blendPath).mtimeMs : null,
    silhouette_iou: Number(result.iou.toFixed(4)),
    align: result.align,
    promoted_at: new Date().toISOString(),
    silhouette_metric_role: 'diagnostic',
  };

  console.log(`PROMOTED ${id}: silhouette_iou=${result.iou.toFixed(4)} (diagnostic; visual acceptance is independent)`);
  promoted++;
}

writeFileSync(AUTHORING_PATH, `${JSON.stringify(authoring, null, 2)}\n`);
writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`\npromote-place-archetype: promoted=${promoted} rejected=${rejected}`);
process.exit(rejected ? 1 : 0);
