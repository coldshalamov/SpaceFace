import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import { chromium } from 'playwright';

const asset = String(process.argv[2] || '/assets/ships/parts/cockpits/cockpit_slab.glb');
if (!asset.startsWith('/')) throw new Error('asset must be a server-relative path beginning with /');
const baseUrl = process.env.SF_PREVIEW_BASE_URL || 'http://127.0.0.1:41731';
const azimuth = Number(process.env.SF_PREVIEW_AZ ?? -38);
if (!Number.isFinite(azimuth)) throw new Error('SF_PREVIEW_AZ must be a finite number');
const stem = basename(asset, extname(asset));
const output = resolve(process.argv[3] || `.devshots/graphics/catalog-pbr-models/${stem}`);
const scenarios = [
  { id: 'close', mode: 'close', width: 960, height: 960 },
  { id: 'mid', mode: 'mid', width: 960, height: 720 },
  { id: 'game', mode: 'far', width: 640, height: 360 },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
    const url = new URL('/tools/art/three_surface_preview.html', baseUrl);
    url.searchParams.set('asset', asset);
    url.searchParams.set('mode', scenario.mode);
    url.searchParams.set('w', String(scenario.width));
    url.searchParams.set('h', String(scenario.height));
    url.searchParams.set('az', String(azimuth));
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__SF?.ready === true, null, { timeout: 30_000 });
    const renderState = await page.evaluate(() => window.__SF);
    const path = resolve(output, `${stem}_${scenario.id}.png`);
    await page.locator('canvas').screenshot({ path });
    const bytes = await readFile(path);
    captures.push({
      id: scenario.id,
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      url: url.href,
      viewport: [scenario.width, scenario.height],
      renderState,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const result = {
  schema: 'spaceface.catalogPartSurfaceCapture.v1',
  asset,
  baseUrl,
  azimuth,
  captures,
};
await writeFile(resolve(output, 'capture-result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
