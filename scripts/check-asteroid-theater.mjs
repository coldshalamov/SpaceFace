#!/usr/bin/env node
// check-asteroid-theater.mjs — design law §11 headless invariants for the Asteroid Works
// theater (PQ-130.01). Boots the real game, opens the works screen on a live asteroid, and
// asserts the DOM-side laws the chrome reboot owns:
//   §11.2 sovereign board — .ast-canvas client area ≥ 88% of the window (1920×1080 + 1280×720)
//   §11.3 word budget    — ≤ 15 words of visible text under .ast-screen in the default drive view
//   §11.4 type           — no computed font-size < 12px; zero uppercase transforms; no Saira
//   §11.5 palette ban    — no banned blue-gray computed color/background in the chrome
// (§11.1 flatness is structural this leaf: zero yaw/pitch ortho over flat square pads; the
// whole-theater stills carry the eyeball evidence.)
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
