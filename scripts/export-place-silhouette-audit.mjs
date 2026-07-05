#!/usr/bin/env node
// Visual audit: export concept | GLB | overlap silhouette PNGs for promoted archetypes.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import {
  SILHOUETTE_SIZE,
  rasterizeConceptSilhouette,
  rasterizeGlbSilhouette,
  bestAlignIoU,
  shiftMask,
  flipMaskH,
} from './lib/silhouette-raster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.PLACE_IDENTITY_SCRATCH
  || 'C:/Users/93rob/AppData/Local/Temp/grok-goal-8330956f5882/implementer';
const OUT_DIR = resolve(SCRATCH, 'silhouette-audit');
const SCALE = 4;
const PANEL = SILHOUETTE_SIZE * SCALE;

const authoring = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/blender/authoring.json'), 'utf8'));
const ledger = existsSync(resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json'))
  ? JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json'), 'utf8'))
  : { promotions: {} };

mkdirSync(OUT_DIR, { recursive: true });

function maskToPng(grid, rgb) {
  const png = new PNG({ width: PANEL, height: PANEL });
  for (let y = 0; y < PANEL; y++) {
    for (let x = 0; x < PANEL; x++) {
      const gx = Math.floor(x / SCALE);
      const gy = Math.floor(y / SCALE);
      const on = grid[gy * SILHOUETTE_SIZE + gx] > 0;
      const i = (y * PANEL + x) * 4;
      png.data[i] = on ? rgb[0] : 12;
      png.data[i + 1] = on ? rgb[1] : 16;
      png.data[i + 2] = on ? rgb[2] : 24;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

function stitchPanels(panels) {
  const w = PANEL * panels.length;
  const out = new PNG({ width: w, height: PANEL });
  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    for (let y = 0; y < PANEL; y++) {
      for (let x = 0; x < PANEL; x++) {
        const si = (y * PANEL + x) * 4;
        const di = (y * w + (pi * PANEL + x)) * 4;
        out.data[di] = panel.data[si];
        out.data[di + 1] = panel.data[si + 1];
        out.data[di + 2] = panel.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
}

const report = [];
const slice = authoring.vertical_slice || [];

for (const id of slice) {
  const entry = authoring.entries?.[id];
  if (!entry || entry.method !== 'blender_mcp') continue;
  const conceptPath = resolve(ROOT, entry.concept_path);
  const glbPath = resolve(ROOT, 'assets/ships/parts/places', `${id}.glb`);
  if (!existsSync(conceptPath) || !existsSync(glbPath)) continue;

  const concept = rasterizeConceptSilhouette(conceptPath);
  const glb = await rasterizeGlbSilhouette(glbPath);
  const aligned = bestAlignIoU(concept.grid, glb.grid);
  let conceptAligned = concept.grid;
  if (aligned.flip) conceptAligned = flipMaskH(concept.grid, SILHOUETTE_SIZE);
  conceptAligned = shiftMask(conceptAligned, SILHOUETTE_SIZE, aligned.dx, aligned.dy);

  const overlap = new Uint8Array(SILHOUETTE_SIZE * SILHOUETTE_SIZE);
  for (let i = 0; i < overlap.length; i++) {
    if (conceptAligned[i] && glb.grid[i]) overlap[i] = 1;
    else if (conceptAligned[i] || glb.grid[i]) overlap[i] = 2;
  }
  const overlapPng = new PNG({ width: PANEL, height: PANEL });
  for (let y = 0; y < PANEL; y++) {
    for (let x = 0; x < PANEL; x++) {
      const gx = Math.floor(x / SCALE);
      const gy = Math.floor(y / SCALE);
      const v = overlap[gy * SILHOUETTE_SIZE + gx];
      const i = (y * PANEL + x) * 4;
      if (v === 1) { overlapPng.data[i] = 80; overlapPng.data[i + 1] = 220; overlapPng.data[i + 2] = 120; }
      else if (v === 2) { overlapPng.data[i] = 220; overlapPng.data[i + 1] = 90; overlapPng.data[i + 2] = 70; }
      else { overlapPng.data[i] = 12; overlapPng.data[i + 1] = 16; overlapPng.data[i + 2] = 24; }
      overlapPng.data[i + 3] = 255;
    }
  }

  const composite = stitchPanels([
    maskToPng(conceptAligned, [57, 208, 255]),
    maskToPng(glb.grid, [255, 179, 92]),
    overlapPng,
  ]);
  const outFile = resolve(OUT_DIR, `${id}_silhouette_audit.png`);
  writeFileSync(outFile, PNG.sync.write(composite));
  report.push({
    id,
    iou: Number(aligned.iou.toFixed(4)),
    ledger_iou: ledger.promotions?.[id]?.silhouette_iou ?? null,
    png: outFile,
    panels: 'concept_cyan | glb_amber | overlap_green=intersection_orange=union-only',
  });
}

const manifestPath = resolve(OUT_DIR, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify({ report, generated_at: new Date().toISOString() }, null, 2)}\n`);
writeFileSync(resolve(SCRATCH, 'silhouette-visual-audit.log'),
  `${report.map((r) => `${r.id}: iou=${r.iou} png=${r.png}`).join('\n')}\n`);
console.log(`silhouette visual audit: ${report.length} PNGs → ${OUT_DIR}`);
for (const r of report) console.log(`  ${r.id} iou=${r.iou}`);
process.exit(report.length >= 3 ? 0 : 1);