#!/usr/bin/env node
// Where do the cut pixels come from? Walks the station shell from the root down the chain that
// actually owns the clipped content, printing each box's height, its overflow mode, and whether it
// scrolls. Content cut by 12-24px on three tabs means the shell's height budget exceeds the
// viewport by that much — this finds which box overspends it.
//
// Usage: node scripts/probe-station-shell-budget.mjs [tab]
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TAB = process.argv[2] || 'factions';
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'station-overflow');
mkdirSync(OUT, { recursive: true });

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
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
  browser = await chromium.launch({ headless: process.env.SF_CAPTURE_HEADLESS === '1', args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ } });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => { window.SF.bus.emit('game:new', { name: 'Shell Budget', seed: 47 }); window.SF.bus.emit('ui:closeAll', {}); });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) => e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate((id) => {
    const root = document.querySelector('[data-screen="station"]');
    const t = root && (root.querySelector(`[data-nav="${id}"]`) || root.querySelector(`[data-tab="${id}"]`));
    if (t) t.click();
  }, TAB);
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const vh = window.innerHeight;
    const root = document.querySelector('[data-screen="station"]');
    const cls = (el) => (el.className && String(el.className) || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.') || el.tagName.toLowerCase();
    // Find the deepest element cut by the fold, then walk back up to the root.
    const all = [...root.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.bottom > vh + 1 && r.y < vh && r.height < 400;
    });
    const deepest = all.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
    const chain = [];
    let node = deepest;
    while (node && node !== document.documentElement) {
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      chain.push({
        sel: cls(node),
        y: +r.y.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1),
        overBy: +(r.bottom - vh).toFixed(1),
        overflowY: cs.overflowY,
        scrolls: node.scrollHeight > node.clientHeight + 1,
        scrollH: node.scrollHeight, clientH: node.clientHeight,
        minH: cs.minHeight, maxH: cs.maxHeight, height: cs.height,
        padB: cs.paddingBottom, marB: cs.marginBottom,
        display: cs.display, gridRows: cs.gridTemplateRows && cs.gridTemplateRows.slice(0, 90),
        position: cs.position,
      });
      node = node.parentElement;
    }
    const comms = document.querySelector('.sx-comms');
    return {
      vh,
      deepest: deepest ? cls(deepest) + ' :: ' + (deepest.textContent || '').trim().slice(0, 40) : null,
      chain: chain.reverse(),
      comms: comms ? (() => { const r = comms.getBoundingClientRect(); const cs = getComputedStyle(comms); return { y: +r.y.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), position: cs.position, zIndex: cs.zIndex }; })() : null,
    };
  });

  console.log(`viewport height ${report.vh}`);
  console.log(`deepest cut element: ${report.deepest}\n`);
  for (const c of report.chain) {
    console.log(`${c.sel.padEnd(30)} y=${String(c.y).padStart(7)} h=${String(c.h).padStart(7)} bottom=${String(c.bottom).padStart(7)} `
      + `over=${String(c.overBy).padStart(6)} ovfY=${c.overflowY.padEnd(7)} scrolls=${c.scrolls ? 'YES' : 'no '} `
      + `padB=${c.padB} minH=${c.minH} disp=${c.display}`);
  }
  if (report.comms) console.log(`\n.sx-comms  position=${report.comms.position} y=${report.comms.y} h=${report.comms.h} bottom=${report.comms.bottom} z=${report.comms.zIndex}`);
  writeFileSync(join(OUT, `shell-budget-${TAB}.json`), JSON.stringify(report, null, 2));
  console.log('\nwrote →', join(OUT, `shell-budget-${TAB}.json`));
} catch (err) {
  console.error('probe-station-shell-budget failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
