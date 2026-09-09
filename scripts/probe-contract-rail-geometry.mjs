#!/usr/bin/env node
// Measures the LIVE geometry of the Missions contract rail in the real game.
//
// This exists because the rail was misdiagnosed four times from the CSS cascade alone. Reading
// station-workbench.css cannot tell you the answer: the file redefines .sx-ct-row and its label
// parts at three different depths, and a later rule silently cancels an earlier one. So measure.
//
// Two ungameable numbers:
//   clipped  — scrollWidth > clientWidth on a label means text is cut, whatever the frame suggests
//   overlaps — pairwise rect intersection between rows means the cards sit on top of each other
//
// A title that is merely too long clips on the RIGHT only. Left-clipping is occlusion, which is a
// stacking problem no ellipsis will ever fix. The two numbers separate those cases.
//
// Usage: node scripts/probe-contract-rail-geometry.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'contract-rail');
mkdirSync(OUT, { recursive: true });

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(baseUrl); if (r.status) return { child, baseUrl }; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server start timeout');
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: process.env.SF_CAPTURE_HEADLESS === '1',
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Rail Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });

  await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) =>
      e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('no station');
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Missions/contracts tab.
  await page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"]');
    const t = root && (root.querySelector('[data-nav="contracts"]') || root.querySelector('[data-tab="contracts"]'));
    if (t) t.click();
  });
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.sx-ct-row')];
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const overlap = (a, b) => {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return (ox > 1 && oy > 1) ? { ox: +ox.toFixed(1), oy: +oy.toFixed(1) } : null;
    };
    const parts = [];
    rows.forEach((row, i) => {
      const mid = row.querySelector('.sx-ct-row__mid');
      const title = row.querySelector('.sx-ct-row__title') || mid;
      const el = title || mid;
      if (!el) return;
      const cs = getComputedStyle(el);
      parts.push({
        i,
        text: (el.textContent || '').trim().slice(0, 48),
        rowRect: rect(row),
        rect: rect(el),
        position: cs.position,
        whiteSpace: cs.whiteSpace,
        textOverflow: cs.textOverflow,
        overflowX: cs.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        clipped: el.scrollWidth > el.clientWidth + 1,
        zIndex: getComputedStyle(row).zIndex,
      });
    });
    const rowOverlaps = [];
    for (let a = 0; a < rows.length; a++) {
      for (let b = a + 1; b < rows.length; b++) {
        const o = overlap(rect(rows[a]), rect(rows[b]));
        if (o) rowOverlaps.push({ a, b, ...o });
      }
    }
    const labelOverlaps = [];
    const labels = parts.map((p) => p.rect);
    for (let a = 0; a < labels.length; a++) {
      for (let b = a + 1; b < labels.length; b++) {
        const o = overlap(labels[a], labels[b]);
        if (o) labelOverlaps.push({ a, b, ...o });
      }
    }
    const railEl = rows[0] && rows[0].parentElement;
    return {
      rowCount: rows.length,
      railRect: railEl ? rect(railEl) : null,
      railOverflowX: railEl ? getComputedStyle(railEl).overflowX : null,
      railDisplay: railEl ? getComputedStyle(railEl).display : null,
      clippedCount: parts.filter((p) => p.clipped).length,
      rowOverlaps,
      labelOverlaps,
      parts,
    };
  });

  writeFileSync(join(OUT, 'rail-geometry.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: join(OUT, 'contracts-tab.png') });

  console.log(`rows=${report.rowCount} display=${report.railDisplay} overflowX=${report.railOverflowX}`);
  console.log(`CLIPPED labels: ${report.clippedCount}/${report.parts.length}`);
  console.log(`ROW overlaps: ${report.rowOverlaps.length}   LABEL overlaps: ${report.labelOverlaps.length}`);
  for (const p of report.parts) {
    console.log(`  [${p.i}] pos=${p.position} ws=${p.whiteSpace} to=${p.textOverflow} `
      + `scroll=${p.scrollWidth} client=${p.clientWidth} ${p.clipped ? 'CLIPPED' : 'fits'} :: ${p.text}`);
  }
  if (report.rowOverlaps.length) console.log('  row overlaps:', JSON.stringify(report.rowOverlaps.slice(0, 8)));
  if (report.labelOverlaps.length) console.log('  label overlaps:', JSON.stringify(report.labelOverlaps.slice(0, 8)));
  console.log('wrote →', join(OUT, 'rail-geometry.json'));
} catch (err) {
  console.error('probe-contract-rail-geometry failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
