#!/usr/bin/env node
// Concept ↔ GLB silhouette IoU gate for blender_mcp vertical-slice archetypes.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureConceptGlbResemblance } from './lib/silhouette-raster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const LEDGER_PATH = resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json');
const SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/places');

const VERBOSE = process.argv.includes('--verbose');
const MIN_IOU = Number(process.env.PLACE_SILHOUETTE_MIN_IOU || '0.12');
const partFilter = process.argv.find((a) => a.startsWith('--part='))?.split('=')[1];

const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
const verticalSlice = authoring.vertical_slice ?? [];
const entries = authoring.entries ?? {};

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

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  : { schemaVersion: 1, promotions: {} };

const targets = (partFilter ? [partFilter] : verticalSlice)
  .filter((id) => entries[id]?.method === 'blender_mcp');

for (const id of targets) {
  const entry = entries[id];
  const conceptPath = resolve(ROOT, entry.concept_path);
  const glbPath = resolve(SOURCE_ROOT, `${id}.glb`);
  check(`${id}: concept exists`, existsSync(conceptPath), entry.concept_path);
  check(`${id}: source GLB exists`, existsSync(glbPath), glbPath);
  if (!existsSync(conceptPath) || !existsSync(glbPath)) continue;

  const result = await measureConceptGlbResemblance(conceptPath, glbPath);
  check(`${id}: concept fill meaningful`, result.conceptFill > 0.02,
    `fill=${(result.conceptFill * 100).toFixed(1)}%`);
  check(`${id}: glb fill meaningful`, result.glbFill > 0.02,
    `fill=${(result.glbFill * 100).toFixed(1)}%`);
  check(`${id}: silhouette IoU >= ${MIN_IOU}`, result.iou >= MIN_IOU,
    `iou=${result.iou.toFixed(4)} align=dx${result.align.dx},dy${result.align.dy},flip=${result.align.flip}`);

  const ledgerEntry = ledger.promotions?.[id];
  if (ledgerEntry) {
    check(`${id}: ledger records IoU`, typeof ledgerEntry.silhouette_iou === 'number',
      `ledger_iou=${ledgerEntry.silhouette_iou}`);
    check(`${id}: ledger IoU matches remeasure`, Math.abs(ledgerEntry.silhouette_iou - result.iou) < 0.02,
      `ledger=${ledgerEntry.silhouette_iou} now=${result.iou.toFixed(4)}`);
    const conceptSha = sha256File(conceptPath);
    const glbSha = sha256File(glbPath);
    check(`${id}: ledger concept_sha256 current`, ledgerEntry.concept_sha256 === conceptSha);
    check(`${id}: ledger glb_sha256 current`, ledgerEntry.glb_sha256 === glbSha);
  } else {
    check(`${id}: iteration ledger entry present`, false, 'missing from iteration_ledger.json');
  }
}

if (!targets.length) {
  check('at least one blender_mcp vertical-slice target', false, 'none promoted yet');
}

const summary = `\nplace-concept-resemblance: ${ok} ok, ${fail} fail (min_iou=${MIN_IOU})`;
transcript.push(summary.trim());
console.log(summary);

if (process.env.PLACE_IDENTITY_TRANSCRIPT) {
  writeFileSync(process.env.PLACE_IDENTITY_TRANSCRIPT, `${transcript.join('\n')}\n`);
}
process.exit(fail ? 1 : 0);