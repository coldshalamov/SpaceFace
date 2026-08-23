#!/usr/bin/env node
// Measures, on EVERY station tab, whether the stage overflows the viewport and whether any content
// collides with the persistent shell widgets in the footer.
//
// The station review found the ACTIVE MISSIONS card sliced by the frame bottom on Missions, and the
// STATION COMMS badge overlapped by a row button on Bar and by a caption on Factions. Two different
// tabs colliding with the same shell widget is a structural fault — the shell does not reserve its
// own footer space — so it is measured per tab rather than patched per tab.
//
// Numbers reported:
//   belowFold  — element bottom past the viewport bottom (content the player cannot read)
//   collisions — element rect intersecting a persistent shell widget's rect
//
// Usage: node scripts/probe-station-overflow.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'station-overflow');
const TABS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];
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
    window.SF.bus.emit('game:new', { name: 'Overflow Probe', seed: 47 });
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

  const measure = async (tab) => page.evaluate((tabName) => {
    const root = document.querySelector('[data-screen="station"]');
    if (!root) return { tab: tabName, error: 'no station root' };
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }; };
    const label = (el) => {
      const cls = (el.className && String(el.className) || '').split(/\s+/).find((c) => c.startsWith('sx-')) || el.tagName.toLowerCase();
      return `${cls}«${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    // Persistent shell widgets that content must not sit under.
    const widgets = [...root.querySelectorAll('[class*="comms"], [class*="__foot"], [class*="footer"]')]
      .filter(visible).map((el) => ({ el, rect: rect(el), name: label(el) }));

    // An element clipped by an ancestor scroller is REACHABLE (or already hidden) — it is not
    // content the viewport ate, so it must not be counted. Without this the probe reports the
    // Shipworks verb bar as cut when it simply sits lower inside a scrolling stats pane.
    const clippedByAncestor = (el) => {
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
        const pr = p.getBoundingClientRect();
        if (r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true;
      }
      return false;
    };
    // A box covering most of the stage is a container, not content: it encloses the fixed badge
    // by construction, and counting that as a collision buries the real ones.
    const isContainer = (el) => {
      const r = el.getBoundingClientRect();
      return (r.width * r.height) > (vw * vh * 0.35);
    };

    const all = [...root.querySelectorAll('*')].filter(visible);
    const belowFold = [];
    const collisions = [];
    for (const el of all) {
      if (el.children.length > 0 && el.scrollHeight > el.clientHeight + 4) continue; // scrollers own their overflow
      if (isContainer(el) || clippedByAncestor(el)) continue;
      const r = rect(el);
      if (r.h < 400 && r.bottom > vh + 1 && r.y < vh) {
        // Only leaf-ish content: an element whose own text is cut.
        if (el.children.length <= 3) belowFold.push({ name: label(el), rect: r, cutBy: +(r.bottom - vh).toFixed(1) });
      }
      for (const w of widgets) {
        if (w.el === el || w.el.contains(el) || el.contains(w.el)) continue;
        const ox = Math.min(r.right, w.rect.right) - Math.max(r.x, w.rect.x);
        const oy = Math.min(r.bottom, w.rect.bottom) - Math.max(r.y, w.rect.y);
        if (ox > 2 && oy > 2 && el.children.length <= 3) {
          collisions.push({ name: label(el), widget: w.name, ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
        }
      }
    }
    const dedupe = (arr, key) => { const seen = new Set(); return arr.filter((o) => { const k = key(o); if (seen.has(k)) return false; seen.add(k); return true; }); };
    return {
      tab: tabName, vw, vh,
      widgets: widgets.map((w) => ({ name: w.name, rect: w.rect })),
      belowFold: dedupe(belowFold, (o) => o.name).slice(0, 10),
      collisions: dedupe(collisions, (o) => o.name + '|' + o.widget).slice(0, 10),
    };
  }, tab);

  const results = [];
  for (const tab of TABS) {
    await page.evaluate((id) => {
      const root = document.querySelector('[data-screen="station"]');
      const t = root && (root.querySelector(`[data-nav="${id}"]`) || root.querySelector(`[data-tab="${id}"]`));
      if (t) t.click();
    }, tab);
    await page.waitForTimeout(500);
    const r = await measure(tab);
    results.push(r);
    const nBelow = (r.belowFold || []).length;
    const nColl = (r.collisions || []).length;
    console.log(`${tab.padEnd(11)} belowFold=${String(nBelow).padStart(2)}  collisions=${String(nColl).padStart(2)}`);
    for (const b of (r.belowFold || []).slice(0, 4)) console.log(`    CUT ${b.cutBy}px  ${b.name}`);
    for (const c of (r.collisions || []).slice(0, 4)) console.log(`    HITS ${c.widget}  <-  ${c.name}`);
  }

  writeFileSync(join(OUT, 'station-overflow.json'), JSON.stringify(results, null, 2));
  const totalBelow = results.reduce((n, r) => n + (r.belowFold || []).length, 0);
  const totalColl = results.reduce((n, r) => n + (r.collisions || []).length, 0);
  console.log(`\nTOTAL belowFold=${totalBelow}  collisions=${totalColl}`);
  console.log('wrote →', join(OUT, 'station-overflow.json'));
} catch (err) {
  console.error('probe-station-overflow failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
