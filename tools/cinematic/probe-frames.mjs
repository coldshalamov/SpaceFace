#!/usr/bin/env node
// tools/cinematic/probe-frames.mjs — dev probe: screenshot the intro cinematic at given times.
// Usage: node tools/cinematic/probe-frames.mjs [t0 t1 t2 ...] [--out dir]
// Connects to the running Chrome via CDP (localhost:29229) by default, or launches a
// bundled chromium when --launch is passed (requires playwright browsers installed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const times = args.filter(a => !a.startsWith('--')).map(Number);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, '.devshots', 'intro-cine');
const URL_BASE = process.env.CINE_URL || 'http://localhost:8123/tools/cinematic/intro.html';

const { chromium } = await import('playwright-core');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:29229');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(`${URL_BASE}?w=1280&h=720`, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => globalThis.__cine && globalThis.__cine.ready, null, { timeout: 60000 });
} catch (e) {
  console.log('TIMEOUT waiting for __cine');
  for (const l of errs.slice(0, 30)) console.log('  ', l);
  await page.close(); await browser.close();
  process.exit(1);
}
console.log('harness ready. spec:', await page.evaluate(() => ({ d: __cine.duration, fps: __cine.fps, frames: __cine.frames })));

for (const t of times) {
  await page.evaluate((tt) => __cine.render(tt), t);
  const dataUrl = await page.evaluate(() => __cine.snapshot('image/png'));
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const f = join(OUT, `t_${String(t).replace('.', 'p')}.png`);
  writeFileSync(f, buf);
  console.log('wrote', f, buf.length, 'bytes');
}
if (errs.length) { console.log('--- console ---'); for (const l of errs.slice(0, 20)) console.log('  ', l); }
await page.close();
await browser.close();
