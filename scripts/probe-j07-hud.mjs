// scripts/probe-j07-hud.mjs — J07 Tactical HUD Overhaul verification probe.
//
// Boots the REAL game (not a lab fixture) into flight, forces a target selection and a hostile
// swarm, then captures frames and measures live `getBoundingClientRect` for every reserved
// rectangle on the flight layer.
//
// This exists because J06 shipped three defects that every automated check and every lab fixture
// passed: the rail collided with the bottom deck, labels clipped off-screen, and the colour was
// wrong throughout. None of those are visible to a unit test. All three are visible in a rect
// table and a screenshot.
//
//   node scripts/probe-j07-hud.mjs [--tag before|after]
//
// Writes .devshots/j07-hud-<tag>/{*.png, report.json}. Exit code is non-zero when a HARD
// invariant fails (dock/rail overlap, Clear Field intrusion, sub-12px type on the layer).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TAG = (() => {
  const i = process.argv.indexOf('--tag');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'after';
})();
const OUT = fileURLToPath(new URL(`../.devshots/j07-hud-${TAG}/`, import.meta.url));
const { chromium } = await loadPlaywright();

// The reserved rectangles this probe measures. `sel` is the live selector; `req` marks the
// surfaces SCREENS_A §1.4 calls permanent — a missing one is a mounting failure, not a no-op.
const SURFACES = [
  { key: 'rightdock', sel: '.sf-rightdock', req: true },
  { key: 'radar', sel: '.sf-radar', req: true },
  { key: 'overview', sel: '.sf-overview', req: false },
  { key: 'target', sel: '.sf-target', req: false },
  { key: 'targetBars', sel: '.sf-target__bars', req: false },
  { key: 'leftstack', sel: '.sf-leftstack', req: true },
  { key: 'schematic', sel: '.sf-schematic', req: true },
  { key: 'prail', sel: '.sf-prail', req: true },
  { key: 'commandDeck', sel: '.sf-command-deck', req: false },
  { key: 'comms', sel: '#sf-comms', req: false },
];

let server = null;
let browser = null;
const report = { tag: TAG, viewports: {}, failures: [] };

async function startFreshServer() {
  const port = await findFreePort(8320);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('Dev server exited before reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}
async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('no free port');
}
function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

async function bootToFlight(page, baseUrl) {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 20000 });
  if (!(await clickButton(page, 'New Game'))) throw new Error('New Game button not found');
  await page.waitForTimeout(400);
  if (!(await clickButton(page, 'Launch'))) throw new Error('Launch button not found');
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive && p.hull > 0);
  }, null, { timeout: 120000 });
  await page.waitForTimeout(2000);
}

// Build the FIGHT job. Three things have to be true or the target card never mounts:
//   1. `hud.js:4180` suppresses the card while `state.nav.waypoint` is set unless the target is
//      combat-relevant. A fresh save always has a route, so a merely-selected hauler stays hidden.
//   2. `isHostileToPlayer` (systems/scanner.js) needs team ∉ {playerTeam, 0, 2} plus a hunting AI.
//   3. `count` hostiles ≥ SWARM_DENSITY_THRESHOLD (8) exercises the swarm colour suppression.
async function makeFightScene(page, count = 9) {
  return page.evaluate((want) => {
    const st = window.SF.state;
    const p = st.entities.get(st.playerId);
    if (!p) return null;
    const ships = [];
    for (const e of st.entities.values()) {
      if (!e || !e.alive || e.id === p.id) continue;
      if (e.type !== 'ship') continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      ships.push({ e, d: Math.sqrt(dx * dx + dz * dz) });
    }
    ships.sort((a, b) => a.d - b.d);
    const made = [];
    for (const { e, d } of ships.slice(0, want)) {
      e.team = 3;
      e.data = e.data || {};
      e.data.ai = Object.assign({}, e.data.ai, { huntPlayer: true, passive: false });
      made.push({ id: e.id, dist: +d.toFixed(1) });
    }
    const ids = made.map((m) => m.id);
    // Hold hostility open. Both halves of the hud.js:4188 gate are sim-owned and rewritten every
    // tick — the convoy AI restores `data.ai.passive = true` from its archetype and nav re-derives
    // `state.nav.waypoint` — so a one-shot write loses the race. This keeps the radar and the
    // roster in the swarm job even though it cannot reliably win the target-card race.
    clearInterval(window.__sfJ07Hold);
    window.__sfJ07Hold = setInterval(() => {
      const s = window.SF && window.SF.state;
      if (!s) return;
      for (const id of ids) {
        const e = s.entities.get(id);
        if (!e || !e.alive) continue;
        e.team = 3;
        if (e.data && e.data.ai) { e.data.ai.passive = false; e.data.ai.huntPlayer = true; }
      }
    }, 40);
    // Select the nearest rock for the target card. `miningRelevant` (hud.js:4179) is a bare
    // `type === 'asteroid'` test that no system rewrites, so it is the one selection that reliably
    // mounts the contextual card — and prospecting a rock is an ordinary flight state, not a
    // contrivance. Proven by isolation: a rock target reaches display:block, a ship target does not.
    let rock = null, rockD = Infinity;
    for (const e of st.entities.values()) {
      if (!e || !e.alive || e.type !== 'asteroid') continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = dx * dx + dz * dz;
      if (d < rockD) { rockD = d; rock = e; }
    }
    st.player.targetId = rock ? rock.id : ids[0];
    return { hostiles: made.length, nearest: made.slice(0, 3), selectedRock: rock ? { id: rock.id, dist: +Math.sqrt(rockD).toFixed(1) } : null };
  }, count);
}

// Damage the player so the hull wireframe is partially empty rather than a full silhouette —
// a full-hull capture cannot distinguish "wireframe fills correctly" from "wireframe is static".
async function hurtPlayer(page, hullFrac = 0.42, shieldFrac = 0.3) {
  return page.evaluate(({ hullFrac, shieldFrac }) => {
    const st = window.SF.state;
    const p = st.entities.get(st.playerId);
    if (!p) return null;
    if (p.hullMax > 0) p.hull = p.hullMax * hullFrac;
    if (p.shieldMax > 0) p.shield = p.shieldMax * shieldFrac;
    return { hull: p.hull, hullMax: p.hullMax, shield: p.shield, shieldMax: p.shieldMax, shipId: p.data && p.data.shipId };
  }, { hullFrac, shieldFrac });
}

async function measure(page) {
  return page.evaluate((surfaces) => {
    const out = { rects: {}, viewport: { w: innerWidth, h: innerHeight }, smallType: [] };
    for (const s of surfaces) {
      const el = document.querySelector(s.sel);
      if (!el) { out.rects[s.key] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.01;
      out.rects[s.key] = {
        x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), visible,
        // scrollWidth > clientWidth is the overhang signature: a child wider than its content box.
        overflowX: +(el.scrollWidth - el.clientWidth).toFixed(1),
      };
    }
    const card = document.querySelector('.sf-target');
    const bars = document.querySelector('.sf-target__bars');
    if (card && bars && getComputedStyle(bars).display !== 'none') {
      const cs = getComputedStyle(card);
      const cr = card.getBoundingClientRect();
      const contentRight = cr.right - parseFloat(cs.paddingRight || '0') - parseFloat(cs.borderRightWidth || '0');
      const contentLeft = cr.left + parseFloat(cs.paddingLeft || '0') + parseFloat(cs.borderLeftWidth || '0');
      const br = bars.getBoundingClientRect();
      out.overhang = {
        over: +Math.max(0, br.right - contentRight, contentLeft - br.left).toFixed(1),
        barsW: +br.width.toFixed(1), contentW: +(contentRight - contentLeft).toFixed(1),
      };
    }
    // Type floor: SCREENS_A §14.2 — nothing below 12px anywhere on the flight layer.
    const hud = document.getElementById('hud');
    if (hud) {
      for (const el of hud.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (!el.textContent || !el.textContent.trim()) continue;
        const fs = parseFloat(cs.fontSize);
        if (fs > 0 && fs < 12) out.smallType.push({ cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className), fs: +fs.toFixed(1), text: el.textContent.trim().slice(0, 24) });
      }
    }
    return out;
  }, SURFACES);
}

function intersects(a, b) {
  if (!a || !b || !a.visible || !b.visible) return false;
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

async function shot(page, name) {
  await page.screenshot({ path: OUT + name + '.png' });
  console.log('captured', name);
}

async function runViewport(page, w, h, label) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1200);
  const m = await measure(page);
  const R = m.rects;
  const checks = [];

  // HARD 1: the Power Rail and the contact dock must not overlap. This is the J06 defect class.
  if (intersects(R.prail, R.rightdock)) checks.push(`${label}: POWER RAIL overlaps RIGHT DOCK`);
  if (intersects(R.prail, R.leftstack)) checks.push(`${label}: POWER RAIL overlaps LEFT STACK`);
  if (intersects(R.rightdock, R.leftstack)) checks.push(`${label}: RIGHT DOCK overlaps LEFT STACK`);

  // HARD 2: Clear Field (SCREENS_A §1.1) — x [24%,76%], y [12%,68%]. Chrome may not enter it.
  const cf = { x: w * 0.24, right: w * 0.76, y: h * 0.12, bottom: h * 0.68 };
  for (const key of ['rightdock', 'leftstack', 'prail']) {
    const r = R[key];
    if (r && r.visible && r.x < cf.right && cf.x < r.right && r.y < cf.bottom && cf.y < r.bottom) {
      checks.push(`${label}: ${key} intrudes into the Clear Field`);
    }
  }

  // HARD 3: no child may overflow the dock column (the "232px overhang").
  for (const key of ['rightdock', 'target', 'overview']) {
    const r = R[key];
    if (r && r.visible && r.overflowX > 1) checks.push(`${label}: ${key} overflows its content box by ${r.overflowX}px`);
  }
  // The real overhang: a fixed-width child against its parent's CONTENT box, not its border box.
  // `overflow:hidden` on the card clips scrollWidth, so this needs measuring rather than inferring.
  if (m.overhang && m.overhang.over > 1) {
    checks.push(`${label}: .sf-target__bars overhangs the card content box by ${m.overhang.over}px`);
  }

  // HARD 4: required permanent surfaces are mounted and visible.
  for (const s of SURFACES) {
    if (s.req && (!R[s.key] || !R[s.key].visible)) checks.push(`${label}: required surface ${s.sel} is missing or hidden`);
  }

  // HARD 5: the fight job forces a hostile selection, so the target card MUST be mounted. A
  // hidden card here means the contextual surface never arrives when the game gets interesting.
  if (/fight/.test(label) && (!R.target || !R.target.visible)) {
    checks.push(`${label}: target card is hidden with a hostile selected`);
  }

  // SOFT: type floor. Reported, not fatal — pre-existing 8-10px type is widespread here and
  // clearing all of it is outside J07's stated scope.
  report.viewports[label] = { ...m, checks };
  report.failures.push(...checks);
  console.log(`\n── ${label} (${w}x${h}) ──`);
  for (const [k, r] of Object.entries(R)) {
    console.log(`  ${k.padEnd(12)} ${r ? `${String(r.w).padStart(6)} x ${String(r.h).padStart(6)}  @ ${r.x},${r.y}  ${r.visible ? '' : '(hidden)'}${r.overflowX > 1 ? `  OVERFLOW +${r.overflowX}` : ''}` : '(absent)'}`);
  }
  if (m.smallType.length) console.log(`  sub-12px type elements: ${m.smallType.length}`);
  for (const c of checks) console.log('  FAIL ' + c);
  return checks;
}

try {
  mkdirSync(OUT, { recursive: true });
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => { console.log('PAGE ERROR:', err.message); report.failures.push('pageerror: ' + err.message); });

  await bootToFlight(page, server.baseUrl);
  await shot(page, '01-cruise-1440');

  report.target = await makeFightScene(page);
  report.hurt = await hurtPlayer(page);
  await page.waitForTimeout(1500);
  // Prove the gate, don't guess at it: read back the exact values hud.js:4176-4189 branches on.
  report.targetGate = await page.evaluate(() => {
    const st = window.SF.state;
    const tid = st.player && st.player.targetId;
    const t = tid != null ? st.entities.get(tid) : null;
    const el = document.querySelector('.sf-target');
    return {
      targetId: tid ?? null, found: !!t, alive: t ? !!t.alive : null, type: t ? t.type : null,
      team: t ? t.team : null, playerTeam: (st.entities.get(st.playerId) || {}).team ?? null,
      ai: t && t.data ? t.data.ai : null,
      navWaypoint: !!(st.nav && st.nav.waypoint),
      inlineDisplay: el ? el.style.display : '(no .sf-target element)',
    };
  });
  console.log('target gate:', JSON.stringify({ ...report.targetGate, ai: undefined }));
  // De-box audit. "Which surfaces are still plates" is a question about the COMPUTED cascade, and
  // this HUD sets the same selector in three stylesheets — reading any one of them answers nothing.
  report.plates = await page.evaluate(() => {
    const opaque = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c || '');
      if (!m) return false;
      const p = m[1].split(',').map((v) => parseFloat(v));
      return p.length < 4 || p[3] > 0.05;
    };
    const out = [];
    for (const rootSel of ['.sf-leftstack', '.sf-rightdock', '#ui-root']) {
      const root = document.querySelector(rootSel);
      if (!root) continue;
      const scan = rootSel === '#ui-root' ? [...root.children] : [...root.querySelectorAll('*')];
      for (const el of scan) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 14) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const bg = opaque(cs.backgroundColor) || (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage));
        const bd = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth) > 0;
        if (!bg && !bd) continue;
        out.push({
          host: rootSel,
          cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className)) || ('#' + el.id),
          bg: cs.backgroundColor, grad: /gradient/.test(cs.backgroundImage), border: cs.borderTopWidth + ' ' + cs.borderTopColor,
          w: +r.width.toFixed(0), h: +r.height.toFixed(0),
        });
      }
    }
    return out;
  });
  report.hullMark = await page.evaluate(() => {
    const out = {};
    for (const sel of ['.sf-schematic', '.sf-sch-ship-wrap', '.sf-sch-ship--empty', '.sf-sch-ship-fill-crop', '.sf-sch-ship--fill']) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[sel] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                   pos: cs.position, left: cs.left, bottom: cs.bottom, top: cs.top, disp: cs.display };
    }
    const g = document.querySelector('.sf-sch-ship--empty .sf-sch-hull');
    if (g) { try { const bb = g.getBBox(); out.hullBBox = { x: +bb.x.toFixed(1), y: +bb.y.toFixed(1), w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) }; } catch (e) { out.hullBBox = 'err ' + e.message; } }
    const svg = document.querySelector('.sf-sch-ship--empty');
    if (svg) {
      out.svgViewBox = svg.getAttribute('viewBox');
      const scs = getComputedStyle(svg);
      out.svgPaint = { display: scs.display, opacity: scs.opacity, visibility: scs.visibility, overflow: scs.overflow, zIndex: scs.zIndex, filter: scs.filter, transform: scs.transform };
      out.svgHtml = svg.outerHTML.slice(0, 240);
    }
    const path = document.querySelector('.sf-sch-ship--empty .sf-sch-hull path');
    if (path) {
      const pcs = getComputedStyle(path);
      out.pathPaint = { stroke: pcs.stroke, strokeWidth: pcs.strokeWidth, fill: pcs.fill, opacity: pcs.opacity, display: pcs.display, visibility: pcs.visibility };
      const pr = path.getBoundingClientRect();
      out.pathRect = { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) };
    } else { out.pathPaint = 'NO PATH FOUND'; }
    return out;
  });
  console.log('--- hull mark geometry ---');
  console.log(JSON.stringify(report.hullMark, null, 1));
  console.log('--- still plated ---');
  for (const p of report.plates) console.log(`  [${p.host}] ${p.cls}  ${p.w}x${p.h}  bg=${p.bg}${p.grad ? '+grad' : ''} border=${p.border}`);
  await shot(page, '02-fight-1440');
  await runViewport(page, 1440, 900, 'fight-1440x900');

  await runViewport(page, 1280, 720, 'fight-1280x720');
  await shot(page, '03-fight-1280');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  // Crop the right dock and the left ship instrument so the de-box reads at 1:1.
  const dock = await page.evaluate(() => { const e = document.querySelector('.sf-rightdock'); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: r.width + 28, height: r.height + 28 }; });
  await page.screenshot({ path: OUT + '04-dock-crop.png', clip: dock });
  const left = await page.evaluate(() => { const e = document.querySelector('.sf-leftstack'); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: r.width + 28, height: r.height + 28 }; });
  await page.screenshot({ path: OUT + '05-leftstack-crop.png', clip: left });
  const sch = await page.evaluate(() => { const e = document.querySelector('.sf-schematic'); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; });
  await page.screenshot({ path: OUT + '06-schematic.png', clip: sch, scale: 'device' });
  console.log('captured 04-dock-crop, 05-leftstack-crop, 06-schematic');

  writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
  console.log('\nreport →', OUT + 'report.json');
  if (report.failures.length) {
    console.log(`\n${report.failures.length} HARD failure(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nAll hard invariants pass.');
  }
} catch (err) {
  console.error('PROBE FAILED:', err && err.stack || err);
  try { writeFileSync(OUT + 'report.json', JSON.stringify({ ...report, fatal: String(err && err.message || err) }, null, 2)); } catch (_) {}
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
