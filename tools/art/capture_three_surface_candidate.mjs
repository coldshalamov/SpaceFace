#!/usr/bin/env node
// Fixed-camera Three.js captures for an isolated GLB surface candidate.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 41731);
const asset = String(args.asset || '');
const outputDir = resolve(args.out || '.devshots/graphics/surface-candidate-captures');
if (!asset) throw new Error('--asset URL path is required');
mkdirSync(outputDir, { recursive: true });

const harness = '/tools/art/three_surface_preview.html';
const cases = [
  { name: 'game-camera', width: 1280, height: 720, mode: 'mid', azimuth: -38 },
  { name: 'close-front', width: 960, height: 960, mode: 'close', azimuth: -38 },
  { name: 'close-rear', width: 960, height: 960, mode: 'close', azimuth: 142 },
  { name: 'small-read', width: 320, height: 180, mode: 'mid', azimuth: -38 },
];

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height } });
    const query = new URLSearchParams({
      w: String(entry.width), h: String(entry.height), kind: 'proof', mode: entry.mode,
      az: String(entry.azimuth), asset, lod: String(args.lod || 0),
    });
    const url = `http://127.0.0.1:${port}${harness}?${query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SF?.ready === true || window.__SF?.error, null, { timeout: 90_000 });
    const diagnostics = await page.evaluate(() => window.__SF);
    if (!diagnostics?.ready) throw new Error(`${entry.name}: ${diagnostics?.error || 'preview did not become ready'}`);
    const path = resolve(outputDir, `${entry.name}.png`);
    await page.screenshot({ path, type: 'png' });
    captures.push({
      name: entry.name,
      path,
      sha256: sha256(path),
      camera: { mode: entry.mode, azimuth: entry.azimuth, width: entry.width, height: entry.height },
      diagnostics,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const report = {
  schema: 'spaceface.threeSurfaceCandidateCapture.v1',
  asset,
  port,
  harness,
  captures,
};
const reportPath = resolve(outputDir, 'capture-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, report: reportPath, captures: captures.length }, null, 2));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    result[key] = next && !next.startsWith('--') ? values[++index] : true;
  }
  return result;
}
