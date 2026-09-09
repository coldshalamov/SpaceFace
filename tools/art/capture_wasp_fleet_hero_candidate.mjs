#!/usr/bin/env node
// Reproducible fixed-camera capture matrix for Wasp source/candidate, LOD, and PBR proof.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 41735);
const asset = String(args.asset || '');
const outputDir = resolve(args.out || '.devshots/graphics/wasp-fleet-hero-v1/evidence/candidate-lod0');
if (!asset) throw new Error('--asset URL path is required');
mkdirSync(outputDir, { recursive: true });
const harness = '/tools/art/wasp_fleet_hero_preview.html';
const set = String(args.set || 'full');
const common = { width: 1280, height: 720, az: -38, tilt: 60, tx: 0, ty: 0.35, tz: 0 };
const cases = set === 'markings' ? [
  { name: 'manufacturer-marking-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -4.5, ty: 0.419, tz: -7.0, surface: 'pbr' },
  { name: 'service-history-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -1.0, ty: 0.5, tz: -7.0, surface: 'pbr' },
] : set === 'review' ? [
  { name: 'grazing-hull-close', width: 960, height: 640, az: -52, tilt: 24, zoom: 18, tx: 1.8, ty: 0.45, tz: -0.8, surface: 'pbr', lighting: 'grazing', keyX: -30, keyY: 3, keyZ: -34, keyIntensity: 3.4 },
  { name: 'grazing-engine-close', width: 960, height: 640, az: 154, tilt: 19, zoom: 14, tx: -7.8, ty: 0.1, tz: 0, surface: 'pbr', lighting: 'grazing', keyX: 28, keyY: 2.5, keyZ: 31, keyIntensity: 3.5 },
  { name: 'aft-engine-crop', width: 960, height: 640, az: 158, tilt: 24, zoom: 17, tx: -7.5, ty: 0.1, tz: 0, surface: 'pbr' },
  { name: 'manufacturer-marking-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -4.5, ty: 0.419, tz: -7.0, surface: 'pbr' },
  { name: 'service-history-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -1.0, ty: 0.5, tz: -7.0, surface: 'pbr' },
  { name: 'roughness-proof', width: 960, height: 960, az: -38, tilt: 47, zoom: 38, tx: 0, ty: 0.35, tz: 0, surface: 'roughness' },
  { name: 'normal-proof', width: 960, height: 960, az: -38, tilt: 47, zoom: 38, tx: 0, ty: 0.35, tz: 0, surface: 'normal' },
] : set === 'lod' ? [
  { name: 'default-route-equivalent', ...common, zoom: 72, surface: 'pbr' },
  { name: 'maximum-route-equivalent', ...common, zoom: 330, surface: 'pbr' },
  { name: 'close-front', width: 960, height: 960, az: -38, tilt: 47, zoom: 38, tx: 0, ty: 0.35, tz: 0, surface: 'pbr' },
  { name: 'close-rear', width: 960, height: 960, az: 142, tilt: 47, zoom: 38, tx: 0, ty: 0.25, tz: 0, surface: 'pbr' },
] : [
  { name: 'default-route-equivalent', ...common, zoom: 72, surface: 'pbr' },
  { name: 'minimum-route-equivalent', ...common, zoom: 45, surface: 'pbr' },
  { name: 'maximum-route-equivalent', ...common, zoom: 330, surface: 'pbr' },
  { name: 'close-front', width: 960, height: 960, az: -38, tilt: 47, zoom: 38, tx: 0, ty: 0.35, tz: 0, surface: 'pbr' },
  { name: 'close-rear', width: 960, height: 960, az: 142, tilt: 47, zoom: 38, tx: 0, ty: 0.25, tz: 0, surface: 'pbr' },
  { name: 'aft-engine-crop', width: 960, height: 640, az: 158, tilt: 24, zoom: 17, tx: -7.5, ty: 0.1, tz: 0, surface: 'pbr' },
  { name: 'weapon-root-crop', width: 960, height: 640, az: -42, tilt: 28, zoom: 18, tx: 4.2, ty: 0.45, tz: 0, surface: 'pbr' },
  { name: 'grazing-hull-close', width: 960, height: 640, az: -52, tilt: 24, zoom: 18, tx: 1.8, ty: 0.45, tz: -0.8, surface: 'pbr', lighting: 'grazing', keyX: -30, keyY: 3, keyZ: -34, keyIntensity: 3.4 },
  { name: 'grazing-engine-close', width: 960, height: 640, az: 154, tilt: 19, zoom: 14, tx: -7.8, ty: 0.1, tz: 0, surface: 'pbr', lighting: 'grazing', keyX: 28, keyY: 2.5, keyZ: 31, keyIntensity: 3.5 },
  { name: 'manufacturer-marking-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -4.5, ty: 0.419, tz: -7.0, surface: 'pbr' },
  { name: 'service-history-crop', width: 960, height: 640, az: 90, tilt: 80, zoom: 6.2, tx: -1.0, ty: 0.5, tz: -7.0, surface: 'pbr' },
  { name: 'normal-hull-close', width: 960, height: 640, az: -52, tilt: 24, zoom: 18, tx: 1.8, ty: 0.45, tz: -0.8, surface: 'normal' },
  { name: 'normal-engine-close', width: 960, height: 640, az: 154, tilt: 19, zoom: 14, tx: -7.8, ty: 0.1, tz: 0, surface: 'normal' },
  ...['wireframe', 'base', 'normal', 'roughness', 'metallic', 'ao', 'emissive'].map((surface) => ({
    name: `${surface}-proof`, width: 960, height: 960, az: -38, tilt: 47, zoom: 38, tx: 0, ty: 0.35, tz: 0, surface,
  })),
  { name: 'emissive-rear-proof', width: 960, height: 960, az: 142, tilt: 47, zoom: 38, tx: 0, ty: 0.25, tz: 0, surface: 'emissive' },
];

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height } });
    const query = new URLSearchParams(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'name').map(([key, value]) => [key, String(value)])));
    query.set('asset', asset);
    const url = `http://127.0.0.1:${port}${harness}?${query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SF?.ready === true || window.__SF?.error, null, { timeout: 120_000 });
    const diagnostics = await page.evaluate(() => window.__SF);
    if (!diagnostics?.ready) throw new Error(`${entry.name}: ${diagnostics?.error || 'preview did not become ready'}`);
    await page.waitForTimeout(150);
    const path = resolve(outputDir, `${entry.name}.png`);
    await page.screenshot({ path, type: 'png' });
    captures.push({ name: entry.name, path, sha256: sha256(path), scenario: entry, diagnostics });
    await page.close();
  }
} finally {
  await browser.close();
}
const reportPath = resolve(outputDir, 'capture-report.json');
writeFileSync(reportPath, `${JSON.stringify({ schema: 'spaceface.waspFleetHero.capture.v1', asset, port, harness, captures }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, captures: captures.length }, null, 2)}\n`);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
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
