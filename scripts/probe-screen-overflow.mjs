#!/usr/bin/env node
// Content the player cannot read, across every screen in the game.
//
// The station shell was destroying 12-24px of real content off the bottom of three tabs while every
// check stayed green, because nothing measured whether rendered text actually fits. That fault was
// structural, not a station quirk: a fixed-position widget with no reserved space, and a hardcoded
// grid row smaller than its contents. Both patterns can occur on any screen, so this asks the same
// question of all of them.
//
// Reported per screen:
//   belowFold — a leaf element whose bottom is past the viewport and which no ancestor scroller
//               can reveal. This is unreachable content, not merely off-screen content.
//   clipped   — a text element whose scrollWidth exceeds its clientWidth with no ellipsis, i.e.
//               words cut mid-character rather than trailed off deliberately.
//
// Elements clipped by a scroller are EXCLUDED: they are reachable. Containers larger than a third
// of the viewport are excluded from collision counting: they enclose smaller widgets by
// construction. Both exclusions were added after the first version reported 60 false positives.
//
// Usage: node scripts/probe-screen-overflow.mjs [screenId ...]
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'screen-overflow');
mkdirSync(OUT, { recursive: true });

// Screens reachable from a fresh flight without special state. Station has its own per-tab probe;
// gameOver and the crucible results need a finished run, so they are named but pushed last.
const SCREENS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'mainMenu', 'newGame', 'pause', 'settings', 'saveLoad', 'help', 'codex', 'missionLog',
  'galaxyMap', 'starmap', 'localmap', 'techTree', 'automation', 'base', 'footprint',
  'range', 'ship', 'crucible', 'crucibleDraft', 'crucibleRefit', 'crucibleResults', 'gameOver',
  // The asteroid works screen keeps the id 'drill'. It matters more than its size suggests:
  // asteroid-ops.css carries SIX local copies of the [hidden] display patch, so its authors hit
  // the same cascade fault repeatedly and worked around it per component. It is the surface most
  // likely to interact with the global rule.
  'drill',
];

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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 160)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => { window.SF.bus.emit('game:new', { name: 'Screen Overflow', seed: 47 }); window.SF.bus.emit('ui:closeAll', {}); });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });

  const measure = (id) => page.evaluate((screenId) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const root = document.querySelector(`[data-screen="${screenId}"]`)
      || document.querySelector('.screen.is-active, .screen[aria-hidden="false"]');
    if (!root) return { screen: screenId, missing: true };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const label = (el) => {
      const cls = (el.className && String(el.className) || '').split(/\s+/)[0] || el.tagName.toLowerCase();
      return `${cls}«${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34)}»`;
    };
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
    const belowFold = [];
    const clipped = [];
    for (const el of [...root.querySelectorAll('*')]) {
      if (!visible(el)) continue;
      if (el.children.length > 3) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > vw * vh * 0.35) continue;
      if (el.scrollHeight > el.clientHeight + 4) continue;
      if (!clippedByAncestor(el)) {
        if (r.height < 400 && r.bottom > vh + 1 && r.top < vh) {
          belowFold.push({ name: label(el), cutBy: +(r.bottom - vh).toFixed(1) });
        }
      }
      const cs = getComputedStyle(el);
      const text = (el.textContent || '').trim();
      if (text && el.children.length === 0 && el.scrollWidth > el.clientWidth + 1
        && cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'visible') {
        clipped.push({ name: label(el), over: el.scrollWidth - el.clientWidth });
      }
    }
    // PHANTOM HIDDEN. `el.hidden = true` only works when no author rule sets `display` on that
    // element — an author `display:grid` outranks the user agent's [hidden]{display:none}. When it
    // loses, the JS believes it hid the element and the element is still on screen. That is exactly
    // how the Footprint board kept rendering its column headers underneath a full-height empty
    // state. Nothing in the codebase measured it, so it stayed invisible to every check.
    const phantomHidden = [];
    for (const el of [...root.querySelectorAll('[hidden]')]) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      phantomHidden.push({ name: label(el), display: cs.display, w: +r.width.toFixed(0), h: +r.height.toFixed(0) });
    }
    const dedupe = (a) => { const s = new Set(); return a.filter((o) => (s.has(o.name) ? false : (s.add(o.name), true))); };
    return { screen: screenId, belowFold: dedupe(belowFold).slice(0, 8), clipped: dedupe(clipped).slice(0, 8),
      phantomHidden: dedupe(phantomHidden).slice(0, 8) };
  }, id);

  const results = [];
  for (const id of SCREENS) {
    const opened = await page.evaluate((sid) => {
      try { window.SF.bus.emit('ui:pushScreen', { id: sid, source: 'probe' }); return true; } catch { return false; }
    }, id);
    // Wait for layout to stop moving rather than sleeping a fixed amount. Several of these screens
    // populate asynchronously, and a fixed 700ms caught the galaxy map's cargo apron mid-layout
    // about half the time, reporting a 6px overflow that settled to zero moments later. A probe
    // that reports phantom defects trains people to ignore it.
    await page.evaluate(() => { window.__sfScreenShape = null; });
    await page.waitForTimeout(300);
    await page.waitForFunction((sid) => {
      const root = document.querySelector(`[data-screen="${sid}"]`)
        || document.querySelector('.screen.is-active, .screen[aria-hidden="false"]');
      if (!root) return true;
      const shape = `${root.scrollHeight}|${root.scrollWidth}|${root.querySelectorAll('*').length}`;
      const settled = window.__sfScreenShape === shape;
      window.__sfScreenShape = shape;
      return settled;
    }, id, { timeout: 8000, polling: 200 }).catch(() => {});
    const r = await measure(id);
    r.opened = opened;
    results.push(r);
    if (r.missing) { console.log(`${id.padEnd(16)} (not mounted)`); }
    else {
      console.log(`${id.padEnd(16)} belowFold=${String(r.belowFold.length).padStart(2)}`
        + `  clipped=${String(r.clipped.length).padStart(2)}  phantomHidden=${String(r.phantomHidden.length).padStart(2)}`);
      for (const b of r.belowFold.slice(0, 3)) console.log(`    CUT ${b.cutBy}px  ${b.name}`);
      for (const c of r.clipped.slice(0, 3)) console.log(`    CLIP ${c.over}px  ${c.name}`);
      for (const p of r.phantomHidden.slice(0, 3)) console.log(`    PHANTOM display:${p.display} ${p.w}x${p.h}  ${p.name}`);
    }
    if (!r.missing && (process.env.SF_PROBE_SHOT === '1'
      || r.belowFold.length || r.clipped.length || r.phantomHidden.length)) {
      await page.screenshot({ path: join(OUT, `defect-${id}.png`) }).catch(() => {});
    }
    await page.evaluate(() => { try { window.SF.bus.emit('ui:closeAll', {}); } catch { /* ok */ } });
    await page.waitForTimeout(250);
  }

  writeFileSync(join(OUT, 'screen-overflow.json'), JSON.stringify({ width: WIDTH, height: HEIGHT, results, errors }, null, 2));
  const measured = results.filter((r) => !r.missing);
  const totBelow = measured.reduce((n, r) => n + r.belowFold.length, 0);
  const totClip = measured.reduce((n, r) => n + r.clipped.length, 0);
  const totPhantom = measured.reduce((n, r) => n + r.phantomHidden.length, 0);
  console.log(`\nmeasured ${measured.length}/${results.length} screens  belowFold=${totBelow}  clipped=${totClip}  phantomHidden=${totPhantom}`);
  if (errors.length) console.log(`page errors: ${errors.length}\n  ${errors.slice(0, 3).join('\n  ')}`);
  console.log('wrote →', join(OUT, 'screen-overflow.json'));
  // Unreachable content is a failure, not an observation. Without this the probe is a report nobody
  // reads rather than a check anything has to obey.
  if (totBelow || totClip || totPhantom) process.exitCode = 1;
} catch (err) {
  console.error('probe-screen-overflow failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
