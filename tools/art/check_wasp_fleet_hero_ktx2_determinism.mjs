#!/usr/bin/env node
// Rebuild the scratch KTX2/meshopt Wasp family and prove byte-identical packaging.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/candidate');
const builder = resolve(ROOT, 'tools/art/build_wasp_fleet_hero_candidate.mjs');
const outputs = [
  resolve(candidate, 'wasp_production_v1_golden_ktx2.glb'),
  resolve(candidate, 'wasp_production_v1_golden_lod1_ktx2.glb'),
  resolve(candidate, 'wasp_production_v1_golden_lod2_ktx2.glb'),
];
const before = Object.fromEntries(outputs.map((path) => [relative(path), receipt(path)]));
const run = spawnSync(process.execPath, [builder], {
  cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) throw new Error(`${process.execPath} ${builder}\n${run.error || ''}\n${run.stdout || ''}\n${run.stderr || ''}`);
const after = Object.fromEntries(outputs.map((path) => [relative(path), receipt(path)]));
const files = Object.keys(before).map((path) => ({
  path, before: before[path], after: after[path],
  identical: before[path].bytes === after[path].bytes && before[path].sha256 === after[path].sha256,
}));
const report = {
  schema: 'spaceface.waspFleetHero.ktx2Determinism.v1',
  command: { executable: process.execPath, args: [builder], exitCode: run.status },
  mipFilter: 'box',
  result: files.every((entry) => entry.identical) ? 'pass' : 'fail',
  files,
};
const reportPath = resolve(candidate, 'ktx2-determinism-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (report.result !== 'pass') throw new Error(`KTX2 packaging drift; inspect ${reportPath}`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, files: files.length }, null, 2)}\n`);

function receipt(path) {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}

function relative(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}
