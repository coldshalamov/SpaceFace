// probe-entity-drawer.mjs — J5 "Everything is a link", in the real game.
//
// check-entity-links.mjs proves the resolver's behaviour and asserts the three placement rules from
// source. It cannot prove any of them actually HOLD at runtime, and all three are runtime facts:
//
//   R1  the delegate fires at all — screenManager stopPropagations pointer events on #screens
//       while a modal is open, so a delegate on the wrong node is silently dead
//   R2  the drawer is geometrically correct — `.screen` carries a transform, so it is the
//       containing block for position:fixed, and #screens flex-centres its children. A drawer that
//       "looks fine" in one screen can anchor to a content-sized box in another
//   R3  Tab stays inside — screenManager's trap cycles focus within rec.el and ejects anything
//       parented outside it, and Escape must close the drawer WITHOUT popping the screen behind it
//
// Plus R4: the graph actually walks (a link inside the drawer replaces its content, never stacks).
//
// Read-only: boots the real route, opens the Chart, drives the drawer, captures frames.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/entity-drawer/', import.meta.url));
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
  const port = await findFreePort(8490);
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

const problems = [];
const note = (s) => console.log(`  · ${s}`);

const server = await startFreshServer();
const browser = await chromium.launch();
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => problems.push(`PAGE ERROR: ${e.message}`));
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
  await page.waitForTimeout(1500);

  // Open the Chart and land on a tab that carries entity nouns.
  // ctx.screenManager is the exposed handle (main.js publishes `ctx` on window.SF under SF_DEBUG).
  await page.evaluate(() => window.SF.ctx.screenManager.pushScreen('galaxyMap'));
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="galaxyMap"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="galaxyMap"] .gm-tab[data-tab="threat"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(400);

  const linkCount = await page.evaluate(() => document.querySelectorAll('#screens [data-entity]').length);
  if (!linkCount) problems.push('no [data-entity] link rendered in the Chart — the tagging pass did not take');
  note(`${linkCount} entity link(s) rendered in the Chart`);
  await page.screenshot({ path: `${OUT}01-chart-tagged.png` });

  // ── R1: the delegate fires behind screenManager's pointer shield ────────────────────────────
  const ref = await page.evaluate(() => {
    const l = document.querySelector('#screens [data-entity]');
    if (!l) return null;
    l.click();
    return l.getAttribute('data-entity');
  });
  await page.waitForTimeout(350);
  const opened = await page.evaluate(() => !!document.querySelector('.sf-drawer--entity'));
  if (!opened) problems.push('R1: clicking a [data-entity] link opened no drawer — the delegate never fired');
  else note(`R1 drawer opened for ${ref}`);

  // ── R2: geometry — right-anchored, full viewport height, inside the screen root ──────────────
  const geo = await page.evaluate(() => {
    const d = document.querySelector('.sf-drawer--entity');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const screen = document.querySelector('[data-screen="galaxyMap"]');
    return {
      inScreen: !!(screen && screen.contains(d)),
      top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right),
      width: Math.round(r.width), height: Math.round(r.height),
      vh: window.innerHeight, vw: window.innerWidth,
      position: getComputedStyle(d).position,
      hostStretched: !!(screen && screen.classList.contains('sf-drawerhost')),
      title: (d.querySelector('.sf-drawer__title') || {}).textContent || '',
      facts: d.querySelectorAll('.sf-drawer__facts .sf-tile').length,
      links: d.querySelectorAll('.sf-entity-link').length,
      verbs: d.querySelectorAll('.sf-drawer__verb').length,
    };
  });
  if (!geo) problems.push('R2: no drawer to measure');
  else {
    if (!geo.inScreen) problems.push('R2: drawer is NOT inside the screen root — screenManager\'s focus trap will eject it');
    if (Math.abs(geo.height - geo.vh) > 2) problems.push(`R2: drawer height ${geo.height} != viewport ${geo.vh} — it anchored to a content-sized box, not the frame`);
    if (Math.abs(geo.right - geo.vw) > 2) problems.push(`R2: drawer right edge ${geo.right} != viewport width ${geo.vw} — it is not flush to the frame edge`);
    if (!geo.hostStretched) problems.push('R2: host screen did not receive .sf-drawerhost');
    if (!geo.verbs) problems.push('R2: drawer APRON has no verb (grammar §6)');
    note(`R2 geometry ${geo.width}x${geo.height} at right=${geo.right} (viewport ${geo.vw}x${geo.vh}), position:${geo.position}`);
    note(`R2 dossier "${geo.title.trim()}" — ${geo.facts} facts, ${geo.links} onward links, ${geo.verbs} verbs`);
  }
  await page.screenshot({ path: `${OUT}02-drawer-open.png` });

  // ── R3a: Tab stays inside the screen root and can reach the drawer ──────────────────────────
  let reachedDrawer = false;
  let escapedScreen = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      const screen = document.querySelector('[data-screen="galaxyMap"]');
      return {
        inDrawer: !!(a && a.closest && a.closest('.sf-drawer--entity')),
        inScreen: !!(screen && a && screen.contains(a)),
      };
    });
    if (where.inDrawer) reachedDrawer = true;
    if (!where.inScreen) escapedScreen = true;
  }
  if (!reachedDrawer) problems.push('R3: 40 Tabs never reached a drawer control — the drawer is unreachable by keyboard');
  if (escapedScreen) problems.push('R3: focus escaped the screen root while the drawer was open');
  if (reachedDrawer && !escapedScreen) note('R3 Tab reaches the drawer and never leaves the screen root');

  // ── R4: the graph walks — a link inside the drawer REPLACES, never stacks ────────────────────
  const walked = await page.evaluate(() => {
    const before = (document.querySelector('.sf-drawer__title') || {}).textContent || '';
    const l = document.querySelector('.sf-drawer--entity .sf-entity-link');
    if (!l) return { skipped: true };
    l.click();
    return { before, ref: l.getAttribute('data-entity') };
  });
  await page.waitForTimeout(300);
  if (walked && !walked.skipped) {
    const after = await page.evaluate(() => ({
      title: (document.querySelector('.sf-drawer__title') || {}).textContent || '',
      drawers: document.querySelectorAll('.sf-drawer--entity').length,
      hasBack: [...document.querySelectorAll('.sf-drawer__verb')].some((b) => b.textContent.trim() === 'Back'),
    }));
    if (after.drawers !== 1) problems.push(`R4: ${after.drawers} drawers open — a link must REPLACE, never stack (grammar §7)`);
    if (after.title.trim() === walked.before.trim()) problems.push('R4: following a link did not change the dossier');
    if (!after.hasBack) problems.push('R4: no Back verb after walking the graph');
    note(`R4 walked "${walked.before.trim()}" -> "${after.title.trim()}" (${after.drawers} drawer, Back=${after.hasBack})`);
    await page.screenshot({ path: `${OUT}03-drawer-walked.png` });
  }

  // ── R3b: Escape closes the DRAWER and leaves the screen open ────────────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterEsc = await page.evaluate(() => {
    const screen = document.querySelector('[data-screen="galaxyMap"]');
    return {
      drawer: !!document.querySelector('.sf-drawer--entity'),
      screenOpen: !!(screen && getComputedStyle(screen).display !== 'none'),
      hostStretched: !!(screen && screen.classList.contains('sf-drawerhost')),
      stack: (window.SF.state.ui.screenStack || []).slice(),
    };
  });
  if (afterEsc.drawer) problems.push('R3: Escape did not close the drawer');
  if (!afterEsc.screenOpen) problems.push('R3: Escape closed the SCREEN as well as the drawer — one key did two things');
  if (afterEsc.hostStretched) problems.push('R3: .sf-drawerhost survived the close — the screen stays force-stretched');
  if (!afterEsc.drawer && afterEsc.screenOpen && !afterEsc.hostStretched) {
    note(`R3 Escape closed the drawer only; screen stack still ${JSON.stringify(afterEsc.stack)}`);
  }
  await page.screenshot({ path: `${OUT}04-after-escape.png` });

  writeFileSync(`${OUT}report.json`, JSON.stringify({ linkCount, ref, geo, afterEsc, problems }, null, 2));
} finally {
  await browser.close();
  server.child.kill();
}

if (problems.length) {
  console.error('\nprobe:entity-drawer FOUND PROBLEMS');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('probe:entity-drawer OK — delegate fires, geometry correct, Tab contained, graph walks, Esc scoped');
