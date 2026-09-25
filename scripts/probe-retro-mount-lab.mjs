#!/usr/bin/env node
/**
 * Offline look-dev probe for the bow retro HARDWARE (retroMounts.js).
 * Serves the repo, loads scripts/retro-mount-lookdev-lab.html (no game boot),
 * and captures stills of the mounts on real hull geometry from several views.
 * Writes to .devshots/retro-mounts-lab/.
 *
 *   node scripts/probe-retro-mount-lab.mjs [--hulls=hull_starter,kestrel] [--views=game,bow,top]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'retro-mounts-lab');

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }));

const HULLS = {
  starter: { url: '/assets/ships/parts/hulls/hull_starter.glb', def: 'ship_kestrel', radius: 14 },
  kestrel: { url: '/assets/ships/parts/wholeships/kestrel.glb', def: 'ship_kestrel', radius: 14 },
  fighter: { url: '/assets/ships/parts/hulls/hull_fighter.glb', def: 'ship_wasp', radius: 14 },
  freighter: { url: '/assets/ships/parts/hulls/hull_freighter.glb', def: 'ship_mule', radius: 18 },
};
const VIEWS = ['bow', 'bowtop', 'game', 'quarter', 'top', 'side'];

const wantedHulls = String(args.hulls || 'starter,kestrel').split(',').filter(Boolean);
const wantedViews = String(args.views || 'bow,bowtop,game,quarter').split(',').filter(Boolean);

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function freePort(start) {
  for (let p = start; p < start + 60; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('no free port');
}

const port = await freePort(8270);
const baseUrl = `http://127.0.0.1:${port}/`;
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
});
let serverOut = '';
child.stdout.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });
child.stderr.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });

const { chromium } = await loadPlaywright();
const executablePath = findBrowser();
const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'],
});

async function capture(page, url, name) {
  await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.__labReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(120);
  const report = await page.evaluate(() => window.__labReport);
  const dataUrl = await page.evaluate(() => window.__lab.capture());
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  await writeFile(join(OUT, name), buf);
  console.log(`wrote ${name}`);
  return report;
}

try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(baseUrl).then((r) => r.ok).catch(() => false)) break;
    if (child.exitCode != null) throw new Error(`server died: ${serverOut}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`console.${m.type()}:`, m.text().slice(0, 300));
  });
  await mkdir(OUT, { recursive: true });

  const reports = {};
  for (const hullKey of wantedHulls) {
    const spec = HULLS[hullKey];
    if (!spec) { console.log(`unknown hull ${hullKey}`); continue; }
    for (const view of wantedViews) {
      const url = new URL(`${baseUrl}scripts/retro-mount-lookdev-lab.html`);
      url.searchParams.set('hull', spec.url);
      url.searchParams.set('def', spec.def);
      url.searchParams.set('radius', String(spec.radius));
      url.searchParams.set('view', view);
      if (args.debug) url.searchParams.set('debug', String(args.debug));
      if (args.mounts != null) url.searchParams.set('mounts', String(args.mounts));
      const name = `${hullKey}-${view}.png`;
      reports[`${hullKey}/${view}`] = await capture(page, String(url), name);
    }
  }
  await writeFile(join(OUT, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('report:', JSON.stringify(Object.values(reports)[0], null, 1));
} finally {
  await browser.close();
  child.kill();
}
