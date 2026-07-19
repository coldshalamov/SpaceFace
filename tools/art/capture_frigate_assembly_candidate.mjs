#!/usr/bin/env node
// Immutable-input, non-promoting ship_warden assembly proof for the scratch frigate hull candidate.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { chromium } from 'playwright';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 41734);
const outputDir = resolve(args.out || '.devshots/graphics/fleet-frigate-golden-v2/assembled-warden');
const inputDir = resolve(outputDir, 'input');
mkdirSync(inputDir, { recursive: true });
const sourceInputs = {
  hull: resolve(args.hull || '.devshots/graphics/fleet-frigate-golden-v2/candidate/hull_frigate_golden_v2.glb'),
  cockpit: resolve(args.cockpit || 'assets/ships/parts/cockpits/cockpit_recessed.glb'),
  engine: resolve(args.engine || 'assets/ships/parts/engines/engine_plasma_ring.glb'),
  fin: resolve(args.fin || 'assets/ships/parts/fins/fin_stabilator.glb'),
};

const manifest = {
  schema: 'spaceface.frigateAssemblyProof.inputs.v1',
  routeIdentity: 'player|ship_warden|civilian',
  runtimePlan: {
    hull: 'hulls/hull_frigate.glb', cockpit: 'cockpits/cockpit_recessed.glb',
    engine: 'engines/engine_plasma_ring.glb', fin: 'fins/fin_stabilator.glb',
  },
  files: {},
};
for (const [slot, source] of Object.entries(sourceInputs)) {
  const destination = resolve(inputDir, `${slot}-${basename(source)}`);
  manifest.files[slot] = snapshotStable(source, destination);
}
const manifestPath = resolve(outputDir, 'INPUT_MANIFEST.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const cases = [
  { name: 'close', width: 960, height: 960, mode: 'close', azimuth: -38, lod: 0 },
  { name: 'default-route-equivalent', width: 1280, height: 720, mode: 'default', azimuth: -38, lod: 1 },
  { name: 'maximum-route-equivalent', width: 1280, height: 720, mode: 'maximum', azimuth: -38, lod: 2 },
  { name: 'close-rear', width: 960, height: 960, mode: 'close', azimuth: 142, lod: 0 },
  { name: 'default-rear-lod1', width: 960, height: 960, mode: 'close', azimuth: 142, elevation: -0.16, lod: 1, hullLod: 0, focus: 'aft-modules' },
  { name: 'maximum-rear-lod2', width: 960, height: 960, mode: 'close', azimuth: 142, elevation: -0.16, lod: 2, hullLod: 0, focus: 'aft-modules' },
];
const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height } });
    const urlFor = (slot) => `/${relativeUrl(manifest.files[slot].snapshot)}`;
    const query = new URLSearchParams({
      w: String(entry.width), h: String(entry.height), mode: entry.mode, az: String(entry.azimuth),
      el: String(entry.elevation ?? 0.44),
      lod: String(entry.lod),
      hullLod: String(entry.hullLod ?? entry.lod),
      focus: entry.focus || 'ship',
      hull: urlFor('hull'), cockpit: urlFor('cockpit'), engine: urlFor('engine'), fin: urlFor('fin'),
    });
    const url = `http://127.0.0.1:${port}/tools/art/three_frigate_assembly_preview.html?${query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SF?.ready === true || window.__SF?.error, null, { timeout: 90_000 });
    const diagnostics = await page.evaluate(() => window.__SF);
    if (!diagnostics?.ready) throw new Error(`${entry.name}: ${diagnostics?.error || 'assembly preview failed'}`);
    const path = resolve(outputDir, `${entry.name}.png`);
    await page.screenshot({ path, type: 'png' });
    captures.push({ ...entry, path, sha256: sha256(readFileSync(path)), diagnostics });
    await page.close();
  }
} finally {
  await browser.close();
}
const report = {
  schema: 'spaceface.frigateAssemblyProof.capture.v1',
  status: 'scratch_candidate_evidence',
  promotionPerformed: false,
  inputManifest: { path: manifestPath, sha256: sha256(readFileSync(manifestPath)) },
  captures,
};
const reportPath = resolve(outputDir, 'capture-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, captures: captures.length }, null, 2)}\n`);

function snapshotStable(source, destination) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = statSync(source);
    const bytes = readFileSync(source);
    const after = statSync(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.size !== bytes.length) continue;
    copyFileSync(source, destination);
    const copied = readFileSync(destination);
    if (sha256(bytes) !== sha256(copied)) continue;
    return {
      source, snapshot: destination, bytes: copied.length, sourceMtimeMs: before.mtimeMs,
      sha256: sha256(copied),
    };
  }
  throw new Error(`source changed while snapshotting: ${source}`);
}

function relativeUrl(path) {
  const root = `${resolve('.')}\\`;
  if (!path.toLowerCase().startsWith(root.toLowerCase())) throw new Error(`snapshot outside repo server root: ${path}`);
  return path.slice(root.length).replaceAll('\\', '/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}
