#!/usr/bin/env node
// ui-bench.mjs — start the UI bench server, and optionally shoot a screen from it.
//
// The bench (tools/ui-bench.html) mounts a real screen module over a frozen still with a synthetic
// state: no game boot, no renderer, ~2 s per look. It is for composition, type, spacing, hover and
// "what does this control do"; live acceptance stays with `ui-look` / `ui:stills`.
//
//   node scripts/ui-bench.mjs                      # serve it; prints the URL for a browser
//   node scripts/ui-bench.mjs --shot=pause         # one PNG of that screen over the still
//   node scripts/ui-bench.mjs --shot=pause,settings
//   node scripts/ui-bench.mjs --shot=pause --bg=.devshots/ui-stills/flight.png --viewport=1280x720
//
// Output (with --shot): .devshots/ui-bench/<screen>.png

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { startFreshServer } from './capture-ui-matrix.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = parseArgs(process.argv.slice(2));

process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const server = await startFreshServer();
const base = `${server.baseUrl}tools/ui-bench.html`;
const stop = () => { server.kill(); process.exit(0); };
process.on('SIGINT', stop);

if (!args.shots.length) {
  console.log('ui-bench is serving. Open a screen directly, e.g.:');
  for (const id of ['pause', 'settings', 'saveLoad', 'help', 'codex', 'missionLog', 'mainMenu', 'techTree']) {
    console.log(`  ${base}?screen=${id}`);
  }
  console.log('\nAdd &bg=<path> to stand the screen on any still you have captured.');
  console.log('Ctrl+C stops the server.');
} else {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: !args.headed });
  const outDir = path.resolve(ROOT, args.out || '.devshots/ui-bench');
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: args.viewport });
  for (const id of args.shots) {
    const url = `${base}?screen=${encodeURIComponent(id)}${args.bg ? `&bg=${encodeURIComponent(args.bg)}` : ''}`;
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(args.settle);
    const file = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: file });
    const note = await page.evaluate(() => (document.getElementById('bench-intent')?.textContent || '').split('\n').slice(-3).join(' | '));
    console.log(`  ${id.padEnd(16)} ${path.relative(ROOT, file)}`);
    if (note) console.log(`    ${note}`);
  }
  await browser.close();
  server.kill();
}

function parseArgs(argv) {
  const parsed = { shots: [], bg: null, out: null, headed: false, settle: 900, viewport: { width: 1920, height: 1080 } };
  for (const arg of argv) {
    if (arg.startsWith('--shot=')) parsed.shots = arg.slice('--shot='.length).split(',').map((s) => s.trim()).filter(Boolean);
    if (arg.startsWith('--bg=')) parsed.bg = arg.slice('--bg='.length);
    if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    if (arg.startsWith('--settle=')) parsed.settle = Number(arg.slice('--settle='.length)) || parsed.settle;
    if (arg.startsWith('--viewport=')) {
      const match = /^(\d+)x(\d+)$/.exec(arg.slice('--viewport='.length));
      if (match) parsed.viewport = { width: Number(match[1]), height: Number(match[2]) };
    }
    if (arg === '--headed') parsed.headed = true;
  }
  return parsed;
}
