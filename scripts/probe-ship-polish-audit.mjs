// Diagnostic probe for THE SHIP polish pass (frontend program §11; INSTRUMENT_GRAMMAR §12).
// Measures the three defects found in the build-step-1 review instead of eyeballing frames:
//   D1  asset readiness vs previewReady, and whether a LOADING state is authored (A_LIST_GAPS #2)
//   D2  content clipped past the screen's own bottom edge (the Mission Log defect class)
//   D3  computed font sizes below the grammar's 12px floor on the promoted surface
// Read-only: boots the real route, opens F2, measures, writes a report. Changes nothing.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/ship-polish-audit/', import.meta.url));
const { chromium } = await loadPlaywright();

async function findFreePort(start) {
  for (let p = start; p < start + 60; p++) {
    const ok = await new Promise((res) => {
      const s = createNetServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startFreshServer() {
  const port = await findFreePort(8430);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited');
    try { const r = await fetch(url); if (r.ok) return { child, baseUrl: url }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never came up');
}
async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const list = [...document.querySelectorAll('button')];
    const b = list.find((x) => norm(x.textContent) === norm(wanted)) || list.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

/** Everything the audit measures, evaluated inside the page against the live ship screen. */
const MEASURE = () => {
  const host = document.querySelector('[data-screen="ship"]');
  if (!host) return { error: 'ship screen not mounted' };
  const hostRect = host.getBoundingClientRect();
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = [...host.querySelectorAll('*')].filter(vis);

  // D2 — anything whose painted box escapes the host's own bottom/right edge, or that has
  // hidden overflow while its content is taller than its box (silently clipped, no scrollbar).
  const clipped = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const overBottom = Math.round(r.bottom - hostRect.bottom);
    const cs = getComputedStyle(el);
    const hiddenOverflow = (cs.overflowY === 'hidden' || cs.overflow === 'hidden');
    const contentOver = el.scrollHeight - el.clientHeight;
    if (overBottom > 1) {
      clipped.push({ sel: el.className || el.tagName, kind: 'past-host-bottom', px: overBottom, text: (el.textContent || '').trim().slice(0, 42) });
    } else if (hiddenOverflow && contentOver > 1 && el.clientHeight > 0) {
      clipped.push({ sel: el.className || el.tagName, kind: 'hidden-overflow', px: contentOver, text: (el.textContent || '').trim().slice(0, 42) });
    }
  }

  // D3 — computed sizes below the 12px floor on visible text-bearing nodes.
  const small = {};
  for (const el of all) {
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasOwnText) continue;
    const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    if (px < 12) {
      const k = String(px);
      small[k] = small[k] || { count: 0, examples: [] };
      small[k].count++;
      if (small[k].examples.length < 3) small[k].examples.push({ cls: String(el.className).slice(0, 44), text: el.textContent.trim().slice(0, 30) });
    }
  }

  // D1 — asset readiness truth + whether any loading affordance is authored.
  const canvas = host.querySelector('canvas');
  const stage = host.querySelector('.sx-sw__stage');
  return {
    host: { w: Math.round(hostRect.width), h: Math.round(hostRect.height) },
    d1: {
      previewReady: canvas && canvas.dataset ? canvas.dataset.previewReady : null,
      previewAssetState: canvas && canvas.dataset ? canvas.dataset.previewAssetState : null,
      previewReveal: canvas && canvas.dataset ? canvas.dataset.previewReveal : null,
      stageClasses: stage ? stage.className : null,
      loadingAffordance: !!host.querySelector('[data-sf-state="loading"], .sf-stage__loading, .sx-sw__acquiring'),
    },
    d2: { clippedCount: clipped.length, worst: clipped.sort((a, b) => b.px - a.px).slice(0, 8) },
    d3: { belowFloor: Object.values(small).reduce((n, v) => n + v.count, 0), bySize: small },
  };
};

const server = await startFreshServer();
const browser = await chromium.launch();
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  if (!(await clickButton(page, 'New Game'))) throw new Error('New Game missing');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="newGame"] .sf-ng-route');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 10000 });
  if (!(await clickButton(page, 'Launch'))) throw new Error('Launch missing');
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    const p = s && s.entities && s.entities.get(s.playerId);
    return !!(s && s.mode === 'flight' && p && p.alive);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(2000);

  await page.keyboard.press('F2');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="ship"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });

  // COLD read: the first paint a player actually sees, before the hull settles. This is the
  // frame the build-step-1 review signed off on with an empty stage.
  const cold = await page.evaluate(MEASURE);
  await page.screenshot({ path: `${OUT}01-cold.png` });

  await page.waitForTimeout(3200); // authored hull settle
  const settled = await page.evaluate(MEASURE);
  await page.screenshot({ path: `${OUT}02-settled.png` });

  // LATE read: does the authored hull ever arrive on a cold flight-first open, or does the reveal
  // settle permanently over an empty bay? This distinguishes "slow asset" from "broken path".
  await page.waitForTimeout(12000);
  const late = await page.evaluate(MEASURE);
  await page.screenshot({ path: `${OUT}03-late.png` });

  const report = { viewport: '1440x900', cold, settled, late };
  writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nAUDIT OK -> ${OUT}`);
} finally {
  await browser.close();
  server.child.kill();
}
