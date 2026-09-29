#!/usr/bin/env node
// Solid-truth scoreboard: how far is each body's LIVE collider from the shape you can see?
//
// Reads the measured census (src/data/modelTruthCensus.json — written only by
// scripts/model-truth-census.mjs) and compares, per row, the collider the physics authority really
// builds against the model's measured silhouette:
//
//   craft  (ships, drones, traffic, enemies)  live capsule  = data.proportions x entityRadius
//   fixed  (stations, places, rocks)          live compound = measured skin (must sit inside tolerance)
//   wreck / pod / buoy                        live ball or skin, per gameplay.colliderKind
//
// Findings (all in world units):
//   FAT      collider wider than the hull: things bounce off empty space, docking is loose
//   THIN     collider narrower than the hull: the visible hull pokes into what it touches ("morphing")
//   SHORT/LONG  collider length off the hull length
//   COARSE   census says the collider misses the outline by more than the flight-plane tolerance
//   NOSKIN   solid with no measured collider at all
//
//   node scripts/check-solid-truth.mjs            print the scoreboard, write .devshots/solid-truth/
//   node scripts/check-solid-truth.mjs --strict   exit 1 while any finding remains
//   node scripts/check-solid-truth.mjs --id=ship_atlas
//
// The thresholds are the definition of "realistic" for this game; change them here, not per row.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_SUBSTANCE_TABLE, modelTruthRows } from '../src/data/modelTruth.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'solid-truth');
const STRICT = process.argv.includes('--strict');
const ONLY = (process.argv.find((a) => a.startsWith('--id=')) || '').slice(5);

export const SOLID_TRUTH_THRESHOLDS = Object.freeze({
  fatRatio: 1.35,     // live half-width / measured half-width above this = FAT
  thinRatio: 0.85,    // below this = THIN (hull pokes through its own collider)
  lengthTolerance: 0.15,
  minWidthToleranceWu: 2,
});

const T = SOLID_TRUTH_THRESHOLDS;
const isCraft = (row) => /hull/.test(row.family) || row.family === 'drone';

export function auditRow(row) {
  const findings = [];
  const gp = row.gameplay || {};
  const R = Number(gp.entityRadius) || 0;
  const entry = { id: row.id, family: row.family, radius: R, colliderKind: gp.colliderKind || 'none', findings };

  if (isCraft(row) && gp.proportions && row.measuredProportions && R > 0) {
    const live = gp.proportions;
    const meas = row.measuredProportions;
    const liveW = live.halfWidth * R;
    const measW = meas.halfWidth * R;
    const liveL = live.length * R;
    const measL = meas.length * R;
    entry.live = { halfWidth: +liveW.toFixed(2), length: +liveL.toFixed(2) };
    entry.measured = { halfWidth: +measW.toFixed(2), length: +measL.toFixed(2) };
    const wRatio = measW > 0 ? liveW / measW : 1;
    const excessWu = Math.abs(liveW - measW);
    entry.widthRatio = +wRatio.toFixed(2);
    if (excessWu > T.minWidthToleranceWu) {
      if (wRatio > T.fatRatio) findings.push({ kind: 'FAT', detail: `collider half-width ${liveW.toFixed(1)} vs hull ${measW.toFixed(1)} (${wRatio.toFixed(2)}x)` });
      else if (wRatio < T.thinRatio) findings.push({ kind: 'THIN', detail: `collider half-width ${liveW.toFixed(1)} vs hull ${measW.toFixed(1)} (${wRatio.toFixed(2)}x)` });
    }
    const lRatio = measL > 0 ? liveL / measL : 1;
    if (lRatio > 1 + T.lengthTolerance) findings.push({ kind: 'LONG', detail: `collider length ${liveL.toFixed(1)} vs hull ${measL.toFixed(1)}` });
    else if (lRatio < 1 - T.lengthTolerance) findings.push({ kind: 'SHORT', detail: `collider length ${liveL.toFixed(1)} vs hull ${measL.toFixed(1)}` });
  }

  const collider = row.collider || {};
  if (collider.overTolerance) {
    findings.push({
      kind: 'COARSE',
      detail: `gap ${Number(collider.gapWu || 0).toFixed(1)} WU / stick-out ${Number(collider.stickWu || 0).toFixed(1)} WU vs tolerance ${Number(collider.toleranceWu || 0).toFixed(1)}`,
    });
  }
  if (gp.colliderKind === 'none' && !collider.overTolerance) {
    findings.push({ kind: 'NOSKIN', detail: 'no measured collider for a visible solid' });
  }
  return entry;
}

export function auditCensus(rows = modelTruthRows()) {
  const entries = rows.filter((row) => !ONLY || row.id === ONLY).map(auditRow);
  const byKind = {};
  for (const entry of entries) for (const f of entry.findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return {
    thresholds: T,
    rows: entries.length,
    clean: entries.filter((e) => e.findings.length === 0).length,
    findingsByKind: byKind,
    entries,
    substance: MODEL_SUBSTANCE_TABLE,
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = auditCensus();
  const dirty = result.entries.filter((e) => e.findings.length);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(result, null, 1));
  const lines = [
    '# Solid-truth scoreboard',
    '',
    `${result.clean}/${result.rows} rows clean. Findings: ${JSON.stringify(result.findingsByKind)}`,
    '',
    '| row | family | finding | detail |',
    '|---|---|---|---|',
    ...dirty.flatMap((e) => e.findings.map((f) => `| ${e.id} | ${e.family} | ${f.kind} | ${f.detail} |`)),
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'));
  console.log(`[solid-truth] ${result.clean}/${result.rows} rows clean; findings ${JSON.stringify(result.findingsByKind)}`);
  for (const e of dirty.slice(0, 12)) console.log(`  ${e.id}: ${e.findings.map((f) => f.kind).join(',')}`);
  if (dirty.length > 12) console.log(`  ... ${dirty.length - 12} more in ${path.relative(ROOT, path.join(OUT_DIR, 'report.md'))}`);
  if (STRICT && dirty.length) process.exitCode = 1;
}
