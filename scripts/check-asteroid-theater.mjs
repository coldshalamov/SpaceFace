#!/usr/bin/env node
// check-asteroid-theater.mjs — design law §11 headless invariants for the Asteroid Works
// theater (PQ-130.01). Boots the real game, opens the works screen on a live asteroid, and
// asserts the DOM-side laws the chrome reboot owns:
//   §11.2 sovereign board — .ast-canvas client area ≥ 88% of the window (1920×1080 + 1280×720)
//   §11.3 word budget    — ≤ 15 words of visible text under .ast-screen in the default drive view
//   §11.4 type           — no computed font-size < 12px; zero uppercase transforms; no Saira
//   §11.5 palette ban    — no banned blue-gray computed color/background in the chrome
//   §11.1 flatness       — every on-glass cell's corners projected through the LIVE camera:
//                          top edge y-delta ≤ 0.5px, left edge x-delta ≤ 0.5px, square within 2%
//   §11.6 no fog         — on a fresh seeded board every solid cell has a drawn material identity
//                          and zero cells render the anonymous/unsurveyed appearance
// §11.1 and §11.6 read the renderer's own canvas.__ast3d hook (PQ-130.04) rather than
// re-deriving the projection or the material table here — see the block below.
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));

const BANNED_HEX = new Set(['#14171d', '#1b2027', '#0b1220', '#2a303a', '#0d0f13']);
const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }];

const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
const failures = [];
const notes = [];

try {
  server = await startFreshServer();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: true,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  } : { headless: true });

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('sf.cinematicSeen', '1');
        localStorage.setItem('sf.firstRunIntroSeen', '1');
      } catch (_) {}
    });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
    await page.evaluate(() => {
      window.SF.bus.emit('game:new', { name: 'Site Engineer', difficulty: 'standard' });
    });
    await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
      const sf = window.SF;
      const st = sf.state;
      const ast = st.entityList.find((e) => e && e.alive !== false && e.type === 'asteroid'
        && e.data && (e.data.yieldU || 0) > 10);
      if (!ast) return { ok: false };
      st.ui.pendingDrillAsteroidId = ast.id;
      sf.ctx.screenManager.pushScreen('drill');
      return { ok: true };
    });
    if (!opened.ok) throw new Error('no live asteroid found for the theater check');
    await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
    await page.waitForTimeout(1500); // camera settle + first HUD frame

    const label = `${viewport.width}x${viewport.height}`;
    const result = await page.evaluate(({ BANNED }) => {
      const out = { problems: [], words: 0, wordList: [] };
      const screen = document.querySelector('.ast-screen');
      const canvas = document.querySelector('.ast-canvas');
      if (!screen || !canvas) { out.problems.push('screen or canvas missing'); return out; }

      // §11.2 sovereign board
      const cRect = canvas.getBoundingClientRect();
      const boardPct = (cRect.width * cRect.height) / (window.innerWidth * window.innerHeight);
      out.boardPct = boardPct;
      if (boardPct < 0.88) out.problems.push(`board only ${(boardPct * 100).toFixed(1)}% of the glass (<88%)`);

      // Visible-text walker: an element contributes words when it renders text itself (no
      // element children with text) and is actually visible.
      const isVisible = (el) => {
        if (!el.getClientRects().length) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false; // sr-only / clipped helpers
        return true;
      };
      const norm = (hex) => hex && hex.length >= 7 ? hex.slice(0, 7).toLowerCase() : hex;
      const words = [];
      const bannedHits = [];
      const seen = new Set();
      for (const el of screen.querySelectorAll('*')) {
        if (!isVisible(el)) continue;
        const cs = getComputedStyle(el);
        // §11.4 type laws
        const fs = parseFloat(cs.fontSize);
        if (Number.isFinite(fs) && fs < 12 && el.textContent.trim()) {
          out.problems.push(`font-size ${fs}px < 12px on <${el.tagName.toLowerCase()} class="${el.className}">`);
        }
        if (cs.textTransform === 'uppercase') {
          out.problems.push(`text-transform:uppercase on <${el.tagName.toLowerCase()} class="${el.className}">`);
        }
        const fam = cs.fontFamily || '';
        if (/saira/i.test(fam)) {
          out.problems.push(`Saira in computed font-family (${fam}) on class "${el.className}"`);
        }
        // §11.5 palette ban (chrome only — the board canvas is scene-rendered, not DOM)
        for (const [prop, val] of [['color', cs.color], ['backgroundColor', cs.backgroundColor]]) {
          const hex = norm(val);
          if (BANNED.includes(hex) && !seen.has(prop + hex + el.className)) {
            seen.add(prop + hex + el.className);
            bannedHits.push(`${prop} ${hex} on class "${el.className}"`);
          }
        }
        // word contribution: own text only
        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join(' ');
        const elWords = ownText.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
        if (elWords.length) {
          words.push(...elWords);
          out.wordList.push(elWords.join(' '));
        }
      }
      if (bannedHits.length) out.problems.push('banned blue-gray: ' + bannedHits.slice(0, 4).join(' | '));
      out.words = words.length;
      if (words.length > 15) out.problems.push(`word budget blown: ${words.length} words — ${out.wordList.join(' / ')}`);
      return out;
    }, { BANNED: [...BANNED_HEX] });

    notes.push(`${label}: board ${(result.boardPct * 100).toFixed(1)}%, ${result.words} visible words (${result.wordList.join(' / ')})`);
    for (const p of result.problems || []) failures.push(`${label}: ${p}`);

    // ---------------------------------------------------------------- §11.1 + §11.6 (PQ-130.04)
    // Both laws are asserted against the LIVE renderer through canvas.__ast3d, never against a
    // re-implementation here: a check that projects the grid with its own copy of the camera maths,
    // or that decides for itself what a cell "should" look like, passes happily while the board on
    // screen lies. The hook returns what the renderer actually drew with.
    const board = await page.evaluate(() => {
      const out = { problems: [], tested: 0, cells: 0, blind: 0, materials: {}, seams: 0 };
      const canvas = document.querySelector('.ast-canvas');
      const hook = canvas && canvas.__ast3d;
      if (!hook) { out.problems.push('renderer debug hook canvas.__ast3d missing'); return out; }
      const drill = window.SF.state.drill;
      if (!drill) { out.problems.push('no live drill state'); return out; }
      const COLS = hook.cols, ROWS = hook.rows;

      // §11.1 FLATNESS — projecting any cell's corners through the live camera: top edge y-delta
      // ≤ 0.5px, left edge x-delta ≤ 0.5px, projected width/height within 2% of square. Only cells
      // actually on the glass are judged; an off-screen cell's projection is not a picture anyone
      // sees. This closes the gap .01–.03 left open ("structural this leaf").
      let worstEdge = 0, worstSquare = 0, minW = Infinity, maxW = 0;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const p = hook.projectCell(c, r);
          if (!p) continue;
          const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
          if (Math.max(...xs) < 0 || Math.min(...xs) > window.innerWidth) continue;
          if (Math.max(...ys) < 0 || Math.min(...ys) > window.innerHeight) continue;
          out.tested++;
          const [tl, tr, br, bl] = p;
          const dyTop = Math.abs(tr.y - tl.y);
          const dxLeft = Math.abs(bl.x - tl.x);
          const w = Math.abs(tr.x - tl.x);
          const h = Math.abs(bl.y - tl.y);
          const sq = Math.abs(w - h) / Math.max(w, h, 1);
          worstEdge = Math.max(worstEdge, dyTop, dxLeft);
          worstSquare = Math.max(worstSquare, sq);
          minW = Math.min(minW, w);
          maxW = Math.max(maxW, w);
          if (out.problems.length < 6) {
            if (dyTop > 0.5) out.problems.push(`§11.1 cell ${c},${r} top edge y-delta ${dyTop.toFixed(3)}px > 0.5`);
            if (dxLeft > 0.5) out.problems.push(`§11.1 cell ${c},${r} left edge x-delta ${dxLeft.toFixed(3)}px > 0.5`);
            if (sq > 0.02) out.problems.push(`§11.1 cell ${c},${r} projects ${w.toFixed(1)}x${h.toFixed(1)} — ${(sq * 100).toFixed(2)}% off square`);
          }
          void br;
        }
      }
      out.worstEdge = worstEdge;
      out.worstSquare = worstSquare;
      out.cellPx = Math.round(minW) + '-' + Math.round(maxW);
      if (!out.tested) out.problems.push('§11.1 no cells projected onto the glass — nothing was asserted');
      // Vacuity guard: a projectCell that returned four identical (or zero) corners would satisfy
      // every delta above while drawing nothing anyone could measure. A real work-zoom cell is a
      // sizeable fraction of the glass, and law §4 puts it at 96-128px at 1920x1080.
      if (out.tested && (minW < 8 || maxW > window.innerWidth * 0.6)) {
        out.problems.push(`§11.1 projected cell widths ${minW.toFixed(1)}-${maxW.toFixed(1)}px are not a real board`);
      }

      // §11.6 NO FOG — every non-bored cell's material identity is queryable and drawn, on a fresh
      // seeded board, for the WHOLE field and not a sample near the rover: isTileSurveyed used to
      // reveal a two-cell local radius, so a rover-local sample would have passed before this leaf
      // and proved nothing. `blind` counts the cells the old gate WOULD have hidden — cells the scan
      // pulse never marked and that sit outside that radius. It must be large, or the assertion is
      // vacuous however green it looks.
      const KNOWN = ['matrix', 'basalt', 'metal', 'ice', 'exotic', 'gas'];
      const ax = drill.avatar.col, ay = drill.avatar.row;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const a = hook.cellAppearance(c, r);
          if (!a) { out.problems.push(`§11.6 cell ${c},${r} has no appearance at all`); return out; }
          if (a.type === 'empty') continue;
          out.cells++;
          out.materials[a.material || 'NONE'] = (out.materials[a.material || 'NONE'] || 0) + 1;
          const tile = drill.field[c][r];
          const far = ((c - ax) * (c - ax) + (r - ay) * (r - ay)) > 4;
          const unmarked = tile && tile.surveyed !== true;
          if (far && unmarked) out.blind++;
          if (out.problems.length >= 12) continue;
          if (a.anonymous) out.problems.push(`§11.6 cell ${c},${r} renders an anonymous appearance`);
          if (!a.material) out.problems.push(`§11.6 cell ${c},${r} (${a.type}) has no material identity`);
          else if (!KNOWN.includes(a.material)) out.problems.push(`§11.6 cell ${c},${r} unknown material '${a.material}'`);
          if (!a.revealed) out.problems.push(`§11.6 cell ${c},${r} is still gated by the survey visibility flag`);
          if (a.type === 'gas' && a.material !== 'gas') out.problems.push(`§11.6 gas pocket ${c},${r} drawn as '${a.material}'`);
        }
      }
      if (out.cells < 100) out.problems.push(`§11.6 only ${out.cells} solid cells — the board is not a fresh field`);
      if (out.blind < 50) out.problems.push(`§11.6 vacuous: only ${out.blind} cells were outside the old reveal radius and unmarked by the pulse`);

      // Seams render as bodies (law §3.5): the renderer must actually be tracking components, and
      // the split preview must be reachable. A board with veins and zero bodies is the feature off.
      const seams = hook.seams();
      out.seams = seams.length;
      out.biggestSeam = seams.reduce((m, s) => Math.max(m, s.count), 0);
      if (!seams.length) out.problems.push('§3.5 no seam bodies computed on a field that has veins');
      if (typeof hook.splitPreview !== 'function') out.problems.push('§3.5 split preview hook missing');
      return out;
    });

    notes.push(`${label}: ${board.tested} cells projected (worst edge ${Number(board.worstEdge || 0).toFixed(3)}px,`
      + ` worst square ${(Number(board.worstSquare || 0) * 100).toFixed(2)}%, cell ${board.cellPx}px);`
      + ` ${board.cells} solid cells, ${board.blind} of them beyond the old reveal radius and unmarked;`
      + ` materials ${JSON.stringify(board.materials)}; ${board.seams} seam bodies (biggest ${board.biggestSeam || 0})`);
    for (const p of board.problems || []) failures.push(`${label}: ${p}`);

    await page.close();
  }
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

for (const n of notes) console.log(n);
if (failures.length) {
  console.error('check-asteroid-theater FAIL:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('check-asteroid-theater: theater invariants hold');
}

function findSystemBrowser() {
  const { existsSync } = require('node:fs');
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

async function startFreshServer() {
  const port = await findFreePort(8230);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', resolve);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for the theater check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
