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
//   §11.8 events         — drill:yield draws a floater/particle expression and leaves no new
//                          visible text row; a gas breach kicks the camera within 200ms, raises an
//                          EDGE vignette (never a full-glass modal wash), floods vapor and vents
//                          the pocket permanently; the hover box is a hairline, and never cyan
//   §6.4  cursor lens    — hovering a seam cell raises a .aw-lens of ≤ 2 text lines, ≤ 14 words,
//                          ≤ 5 chips all drawn from the enumerated bank, and it is GONE once the
//                          pointer moves onto chrome (PQ-130.06)
//   §7    networks      — a built spine draws one run per SIM component; a lane with stock carries
//                          flow dots; a lane bolted to nothing goes dim AND desaturated (both
//                          directions asserted); the port's crate pile tracks the export buffer at
//                          two different stages; site zoom sheds the armour for clean lines
//   §6.5  lens cycle    — V walks none → Faces → Network → Plan → none through the SHIPPED key, and
//                          the Network lens measurably brightens the run it names
//   §6.7  build board   — mint seats appear with a ghost, and gridline strengthening rises entering
//                          build mode and returns to zero on the way out (PQ-130.10b)
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
// The drill field is 45 rows deep; a cadence measurement needs ~7 rows of headroom below
// the cursor or a clamped edge would read as a stalled clock.
const ROWS_GUARD = 34;

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

    // ---------------------------------------------------------------- §11.8 events (PQ-130.07)
    // "drill:yield produces a floater/particle expression (overlay or renderer hook observable) and
    //  no new permanently-visible text row; a gas breach applies a nonzero camera kick within
    //  200ms." Asserted through the LIVE renderer's own hook and the LIVE DOM, never against a
    // re-implementation: `kickPx()` asks the same function that is posing the camera this frame.
    //
    // Deliberately non-destructive to everything that follows: the yield only spawns expression,
    // and the breach is raised on a gas cell the later blocks never touch. The block ends by
    // waiting the floater's own 700ms life out, so the word budget re-measured with the palette up
    // is measuring the chrome and not a number still in the air.
    const ev = await page.evaluate(async () => {
      const out = { problems: [], notes: {} };
      const canvas = document.querySelector('.ast-canvas');
      const hook = canvas && canvas.__ast3d;
      const root = document.querySelector('.ast-screen');
      if (!hook || !root) { out.problems.push('§11.8 renderer hook or screen root missing'); return out; }
      if (typeof hook.events !== 'function' || typeof hook.kickPx !== 'function') {
        out.problems.push('§11.8 the renderer publishes no event surface (events/kickPx)');
        return out;
      }
      const sf = window.SF;
      const d = sf.state.drill;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const wait = async (ms) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) await frame();
      };
      const rowsOfText = () => {
        // Every visible word under the screen root, so "a new permanently-visible text row" is a
        // measured count and not a class name we trust.
        const words = [];
        for (const el of root.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
          let own = '';
          for (const n of el.childNodes) if (n.nodeType === 3) own += ` ${n.nodeValue}`;
          for (const w of own.trim().split(/\s+/)) if (/[a-zA-Z0-9]/.test(w)) words.push(w);
        }
        return words;
      };
      const wordsBefore = rowsOfText().length;

      // ---- ORE EXTRACTED ----
      const before = hook.events();
      let vein = null;
      for (let c = 0; c < hook.cols && !vein; c++) {
        for (let r = 0; r < hook.rows; r++) {
          const a = hook.cellAppearance(c, r);
          if (a && a.type === 'vein' && a.ore) { vein = { c, r, ore: a.ore }; break; }
        }
      }
      if (!vein) { out.problems.push('§11.8 vacuous: no vein on the board to pay out'); return out; }
      sf.bus.emit('drill:yield', { commodityId: vein.ore, qty: 4, pos: { col: vein.c, row: vein.r } });
      await wait(130);
      const midYield = hook.fx();
      const afterYield = hook.events();
      out.notes.yield = { chunks: midYield.oreChunks, floaters: midYield.floaters, count: afterYield.yields };
      if (afterYield.yields <= before.yields) out.problems.push('§11.8 drill:yield never reached the board');
      if (!(midYield.oreChunks > 0 || midYield.floaters > 0)) {
        out.problems.push('§11.8 drill:yield produced no floater and no particle expression');
      }

      // ---- GAS POCKET BREACHED: a nonzero camera kick within 200ms ----
      let gas = null;
      for (let c = 0; c < hook.cols && !gas; c++) {
        for (let r = 0; r < hook.rows; r++) {
          const a = hook.cellAppearance(c, r);
          if (a && a.type === 'gas') { gas = { c, r }; break; }
        }
      }
      if (!gas) { out.problems.push('§11.8 vacuous: no gas pocket on the board to breach'); return out; }
      const t0 = performance.now();
      sf.bus.emit('drill:gasHit', { dmg: 1, pos: { col: gas.c, row: gas.r } });
      let peakKick = 0;
      let kickAtMs = -1;
      while (performance.now() - t0 < 200) {
        await frame();
        const k = hook.kickPx();
        if (k > peakKick) { peakKick = k; kickAtMs = performance.now() - t0; }
      }
      const vig = hook.vignette();
      const fx = hook.fx();
      const afterGas = hook.events();
      out.notes.gas = {
        peakKickPx: Number(peakKick.toFixed(2)), kickAtMs: Math.round(kickAtMs),
        vignette: Number((vig.alpha || 0).toFixed(2)), vignetteFull: !!vig.full,
        vapor: fx.vapor, roverScars: fx.roverScars, ventedScars: fx.ventedScars,
        breaches: afterGas.gasBreaches,
      };
      if (afterGas.gasBreaches <= before.gasBreaches) out.problems.push('§11.8 the gas breach was never expressed on the board');
      if (!(peakKick > 0)) out.problems.push('§11.8 a gas breach applied NO camera kick within 200ms');
      if (peakKick > 12) out.problems.push(`§11.8 the gas kick peaked at ${peakKick.toFixed(1)}px — law §5 says 4`);
      if (!(vig.alpha > 0)) out.problems.push('§11.8/§9 a gas breach raised no edge vignette');
      if (vig.full) out.problems.push('§11.8/§9 the damage wash covers the whole glass — law §9 wants a vignette, never a modal');
      if (!(fx.vapor > 0)) out.problems.push('§11.8 no vapor flooded the tunnel after the breach');
      if (!(fx.ventedScars > 0)) out.problems.push('§11.8 the breached pocket did not become the vented texture');

      // ---- HOPPER FULL: the lid clunks shut and the next chunk BOUNCES OFF IT ----
      // The .05 lid latches on the refusal AND on a genuinely full hold (it re-opens the moment
      // volume frees up), so the hold has to actually be full for the latch to survive a frame.
      // Fill the cached volume for the assertion window and put it back afterwards — the palette
      // block below pays for a Core out of this same hold.
      const cargoRef = sf.state.player.cargo;
      const usedWas = cargoRef.usedVolume;
      cargoRef.usedVolume = cargoRef.capVolume;
      const beforeCargo = hook.events().cargoRefusals;
      sf.bus.emit('drill:cargoFull', { commodityId: vein.ore, qty: 2, pos: { col: d.avatar.col, row: d.avatar.row } });
      await wait(90);
      const cargoFx = hook.fx();
      const afterCargo = hook.events();
      out.notes.cargo = {
        refusals: afterCargo.cargoRefusals, chunks: cargoFx.particles, latched: cargoFx.hopperLid,
      };
      if (afterCargo.cargoRefusals <= beforeCargo) out.problems.push('§11.8 drill:cargoFull was never expressed on the board');
      if (!(cargoFx.particles > 0)) out.problems.push('§11.8 nothing bounced off the shut lid');
      if (!(cargoFx.hopperLid > 0)) out.problems.push('§5 the hopper lid never latched shut on the refusal');
      // …and the same refusal, repeated at once, must not replay (law §5, 5s)
      const suppressedBefore = hook.events().refusalsSuppressed;
      sf.bus.emit('drill:cargoFull', { commodityId: vein.ore, qty: 2, pos: { col: d.avatar.col, row: d.avatar.row } });
      await wait(60);
      const rep2 = hook.events();
      if (rep2.cargoRefusals > afterCargo.cargoRefusals) {
        out.problems.push('§5 an identical hopper-full refusal replayed inside the 5s window');
      }
      if (rep2.refusalsSuppressed <= suppressedBefore) {
        out.problems.push(`§5 vacuous: the repeat rule was never reached by the second refusal`
          + ` (suppressed ${suppressedBefore} -> ${rep2.refusalsSuppressed},`
          + ` refusals ${afterCargo.cargoRefusals} -> ${rep2.cargoRefusals},`
          + ` rover ${d.avatar.col},${d.avatar.row})`);
      }
      cargoRef.usedVolume = usedWas;
      await wait(220);                       // let the lid slide back open before anything else looks

      // ---- and no permanently-visible text row is left behind ----
      await wait(1300);                      // the floater's own 700ms life, generously
      const wordsAfter = rowsOfText().length;
      out.notes.words = { before: wordsBefore, after: wordsAfter };
      if (wordsAfter > wordsBefore) {
        out.problems.push(`§11.8 the events left ${wordsAfter - wordsBefore} new visible word(s) on the glass`);
      }
      const rest = hook.fx();
      if (rest.floaters > 0) out.problems.push(`§11.8 ${rest.floaters} floater(s) outlived their 700ms`);

      return out;
    });
    notes.push(`${label}: §11.8 events — ${JSON.stringify(ev.notes)}`);
    for (const p of ev.problems || []) failures.push(`${label}: ${p}`);

    // ---------------------------------------------------------------- §6.4 cursor lens (PQ-130.06)
    // The default-view word budget above is asserted with NO pointer on the board — that is the
    // lens's other half of the law (§2.5: it must vanish when the pointer leaves). Now hover a real
    // seam cell and prove the card that appears is a field-notebook tag, not the context bay that
    // used to live in a well: two text lines at most, stamps from an enumerated bank, and a hard
    // volume cap so "no tutorial copy" is measured rather than asserted by class name.
    const target = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      if (!hook) return null;
      let best = null;
      for (let c = 0; c < hook.cols; c++) {
        for (let r = 0; r < hook.rows; r++) {
          const a = hook.cellAppearance(c, r);
          if (!a || a.type !== 'vein') continue;
          const p = hook.projectCell(c, r);
          if (!p) continue;
          const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
          const x = (Math.min(...xs) + Math.max(...xs)) / 2;
          const y = (Math.min(...ys) + Math.max(...ys)) / 2;
          if (x < 120 || y < 120 || x > window.innerWidth - 120 || y > window.innerHeight - 120) continue;
          const score = (a.seam ? a.seam.count : 0);
          if (!best || score > best.score) best = { x, y, col: c, row: r, score };
        }
      }
      return best;
    });
    if (!target) {
      failures.push(`${label}: §6.4 no on-glass seam cell to hover — the lens was never exercised`);
    } else {
      // Two moves: the first lands the pointer, the second guarantees a mousemove with a real
      // delta. 400ms clears the 150ms hover delay plus a frame of slack.
      await page.mouse.move(target.x - 4, target.y - 4);
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(400);
      const lens = await page.evaluate(() => {
        const out = { problems: [], words: 0, chips: [], lines: 0, text: '' };
        const el = document.querySelector('.aw-lens');
        if (!el) { out.problems.push('§6.4 no .aw-lens in the DOM'); return out; }
        const visible = (n) => {
          if (!n.getClientRects().length) return false;
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          const r = n.getBoundingClientRect();
          return r.width >= 2 && r.height >= 2;
        };
        if (!visible(el)) { out.problems.push('§6.4 the lens did not appear on a 400ms hover'); return out; }
        const rect = el.getBoundingClientRect();
        out.box = { w: Math.round(rect.width), h: Math.round(rect.height) };
        if (rect.width > 260) out.problems.push(`§6.4 lens is ${Math.round(rect.width)}px wide (max 260)`);
        if (getComputedStyle(el).pointerEvents !== 'none') {
          out.problems.push('§6.4 the lens is not pointer-transparent — it can eat its own hover');
        }
        // The swatch is the law's first element: a colour sampled from the board. A machine/ghost
        // trades it for a lamp dot, but a hovered CELL must show a painted swatch.
        const mark = el.querySelector('.aw-lens-swatch');
        const markPaint = mark && visible(mark)
          ? getComputedStyle(mark).backgroundImage + '|' + getComputedStyle(mark).backgroundColor : '';
        if (!mark || !visible(mark)) out.problems.push('§6.4 the lens has no swatch');
        else if (/^none\|rgba\(0, 0, 0, 0\)$/.test(markPaint)) out.problems.push('§6.4 the swatch is unpainted');

        // Chips come from an enumerated bank — the UI never invents chip text. Restated here on
        // purpose: a chip word renamed in the module fails this check instead of riding along.
        const BANK = [/^Bore \d+u$/, /^Farm$/, /^Hazard$/, /^Locked Mk\d+$/, /^Splits seam$/,
          /^Valid seat$/, /^Blocked$/];
        const chipEls = [...el.querySelectorAll('.aw-lens-chip')].filter(visible);
        out.chips = chipEls.map((c) => c.textContent.replace(/\s+/g, ' ').trim());
        if (chipEls.length > 5) out.problems.push(`§6.4 ${chipEls.length} chips (max 5)`);
        for (const t of out.chips) {
          if (!BANK.some((re) => re.test(t))) out.problems.push(`§6.4 chip "${t}" is not in the bank`);
        }
        for (const c of chipEls) {
          if (Math.round(c.getBoundingClientRect().height) > 22) {
            out.problems.push(`§6.4 chip is ${Math.round(c.getBoundingClientRect().height)}px tall (20px)`);
          }
          if (!c.querySelector('svg')) out.problems.push(`§6.4 chip "${c.textContent.trim()}" has no icon glyph`);
        }

        // Text volume — the ungameable half. Count OWN text on every visible descendant, group the
        // non-chip ones into visual lines by their top edge, and cap the raw word count. Tutorial
        // copy is a volume, not a class name.
        const owners = [];
        for (const n of el.querySelectorAll('*')) {
          if (!visible(n)) continue;
          const cs = getComputedStyle(n);
          const fs = parseFloat(cs.fontSize);
          const own = [...n.childNodes].filter((k) => k.nodeType === Node.TEXT_NODE)
            .map((k) => k.textContent.trim()).join(' ').trim();
          if (!own) continue;
          if (Number.isFinite(fs) && fs < 12) out.problems.push(`§11.4 lens glyph at ${fs}px < 12px ("${own}")`);
          if (cs.textTransform === 'uppercase') out.problems.push(`§11.4 uppercase in the lens ("${own}")`);
          if (/saira/i.test(cs.fontFamily || '')) out.problems.push(`§11.4 Saira in the lens ("${own}")`);
          const words = own.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
          out.words += words.length;
          if (words.length > 6) out.problems.push(`§6.4 "${own}" is ${words.length} words — that is prose`);
          const chip = n.closest('.aw-lens-chip');
          const box = n.getBoundingClientRect();
          owners.push({ chip: !!chip, mid: box.top + box.height / 2, own });
        }
        out.text = owners.map((o) => o.own).join(' / ');
        // Cluster by LINE BOX, not by exact top: the 14px name and the 13px numerals are centred
        // on the same row and their top edges differ by a pixel. Anything within 9px of a
        // established line's centre is on that line.
        const mids = owners.filter((o) => !o.chip).map((o) => o.mid).sort((a, b) => a - b);
        const lines = [];
        for (const m of mids) {
          if (!lines.length || m - lines[lines.length - 1] > 9) lines.push(m);
        }
        out.lines = lines.length;
        if (out.lines > 2) out.problems.push(`§6.4 ${out.lines} text lines (max 2): ${out.text}`);
        if (out.words > 14) out.problems.push(`§6.4 ${out.words} words in the lens: ${out.text}`);
        return out;
      });
      notes.push(`${label}: lens over vein ${target.col},${target.row} — ${lens.box ? lens.box.w + 'x' + lens.box.h : '?'}px,`
        + ` ${lens.lines} text lines, ${lens.words} words, chips [${(lens.chips || []).join(', ')}]`);
      for (const p of lens.problems || []) failures.push(`${label}: ${p}`);

      // Law §2.5/§6.4: the pointer leaves, the card goes. Move onto the crest (chrome, 40px tall,
      // outside the canvas) — the same gesture a player makes reaching for Leave.
      await page.mouse.move(Math.round(viewport.width / 2), 8);
      await page.waitForTimeout(300);
      const gone = await page.evaluate(() => {
        const el = document.querySelector('.aw-lens');
        if (!el) return true;
        if (!el.getClientRects().length) return true;
        const cs = getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
      });
      if (!gone) failures.push(`${label}: §6.4 the lens survived the pointer leaving the board`);
      // Restore the no-hover default view for anything that follows.
      await page.mouse.move(0, 0);
    }

    // ---------------------------------------------------------------- §3.2 the hover box (.07)
    // Taken with the pointer ACTUALLY on a cell — `frameMat` is shared with the build ghost, so a
    // reading snatched while nothing is hovered reports whatever the last mode left behind and
    // asserts nothing. Re-hover the seam cell the lens block just used, then read.
    if (target) {
      const box = await page.evaluate(async (t) => {
        const canvas = document.querySelector('.ast-canvas');
        const hook = canvas.__ast3d;
        const r = canvas.getBoundingClientRect();
        const c = hook.projectCell(t.col, t.row);
        const cx = r.left + (c[0].x + c[2].x) / 2;
        const cy = r.top + (c[0].y + c[2].y) / 2;
        canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true }));
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
        return typeof hook.hoverFrame === 'function' ? hook.hoverFrame() : null;
      }, target);
      if (!box) {
        failures.push(`${label}: §3.2 the renderer publishes no hover box reading`);
      } else {
        notes.push(`${label}: §3.2 hover box ${box.hex} @${box.opacity} · ${box.thicknessPx.toFixed(2)}px · visible=${box.visible}`);
        if (!box.visible) failures.push(`${label}: §3.2 vacuous — the hover box was not on the glass when it was read`);
        const hex = String(box.hex || '').toLowerCase();
        const rr = parseInt(hex.slice(1, 3), 16);
        const gg = parseInt(hex.slice(3, 5), 16);
        const bb = parseInt(hex.slice(5, 7), 16);
        // §3.2 reserves cyan (--aw-sky) for material FLOW; the cursor is not flow.
        if (Number.isFinite(rr) && bb > rr + 24 && gg > rr + 12) {
          failures.push(`${label}: §3.2 the hover box draws in a flow-cyan (${hex}) — cyan is material flow only`);
        }
        if (box.thicknessPx > 3) failures.push(`${label}: §3.2 the hover outline is ${box.thicknessPx.toFixed(1)}px — a hairline, not a frame`);
        if (box.opacity > 0.75) failures.push(`${label}: §3.2 the hover outline sits at ${box.opacity} alpha — the loudest thing on the board`);
      }
      // The hover above is a synthetic MouseEvent on the canvas. Playwright's cursor is
      // already at (0,0) from the lens-gone move, so `page.mouse.move(0, 0)` is a no-op and
      // never fires mouseleave — the lens stays armed and later counts against the palette
      // word budget. Dispatch the board's real leave path, then park on chrome.
      await releaseSyntheticBoardHover(page);
      if (!(await isLensGone(page))) {
        failures.push(`${label}: §3.2 synthetic hover left the lens armed after release`);
      }
    }

    // ---------------------------------------------------------------- §6.3 earned palette (.09)
    // The half that is easy to fake green is the FIRST one: before a Core is owned there must be
    // no palette element in the DOM at all — not a hidden one, not a disabled row of gray
    // placeholders (law §6.3 "locked machines are absent"; the playfield brief calls a restyled
    // always-visible 3x3 grid a FAIL). So it is asserted against a rock that provably has no site
    // yet, and only then is a Core installed and the row demanded into existence.
    const paletteBefore = await page.evaluate(() => {
      const owner = window.SF.registry.get('asteroidSites');
      const site = owner && owner.siteForAsteroid(window.SF.state.drill.asteroidId);
      return {
        site: !!site,
        cores: site ? site.machines.filter((m) => m.defId === 'sm_massline_core').length : 0,
        roots: document.querySelectorAll('.ast-screen .aw-palette').length,
        keys: document.querySelectorAll('.ast-screen .aw-build-key').length,
      };
    });
    if (paletteBefore.site || paletteBefore.cores) {
      failures.push(`${label}: §6.3 vacuous — this rock already owns a site/Core, so "no palette before a Core" asserted nothing`);
    }
    if (paletteBefore.roots || paletteBefore.keys) {
      failures.push(`${label}: §6.3 the palette exists before a Core is owned (${paletteBefore.roots} rows, ${paletteBefore.keys} keys)`);
    }

    // Install the first Core through the OWNER (the subject here is the palette, not the economy):
    // hollow a cell beside the rover, pay for it, and assert the install actually landed — a
    // silently refused install produces "no palette" and sends the next reader hunting a
    // presentation bug that does not exist.
    const coreInstall = await page.evaluate(() => {
      const sf = window.SF;
      const st = sf.state;
      const owner = sf.registry.get('asteroidSites');
      const d = st.drill;
      const ent = st.entities.get(d.asteroidId);
      const cargo = st.player.cargo;
      cargo.capVolume = Math.max(cargo.capVolume || 0, 400);
      for (const [k, q] of Object.entries({
        cmdty_regocrete: 12, cmdty_control_unit: 4, cmdty_refined_metals: 6,
      })) cargo.items[k] = (cargo.items[k] || 0) + q;
      const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
      let seat = null;
      for (const [dc, dr] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
        const c = d.avatar.col + dc;
        const r = d.avatar.row + dr;
        if (c < 0 || c > 27 || r < 1 || r > 44) continue;
        if (d.field[c][r].type !== 'empty') {
          d.field[c][r] = EMPTY();
          if (ent && ent.data) {
            if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
            const idx = r * 28 + c;
            if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
          }
          sf.bus.emit('drill:break', { col: c, row: r, type: 'matrix', ore: null, wasVein: false, wasGas: false });
        }
        seat = { col: c, row: r };
        break;
      }
      if (!seat) return { ok: false, reason: 'no seat beside the rover' };
      const res = owner.installMachine({
        asteroidId: d.asteroidId, defId: 'sm_massline_core', col: seat.col, row: seat.row,
      });
      return { ok: res.ok === true, reason: res.reason || null, seat };
    });
    if (!coreInstall.ok) {
      failures.push(`${label}: §6.3 could not install the first Core (${coreInstall.reason}) — every palette assertion below would be vacuous`);
    } else {
      // The palette mounts on the install frame; the HUD cadence is 150ms, so give it a beat plus
      // the 300ms §9 settle.
      await page.waitForTimeout(800);
      const palette = await page.evaluate(() => {
        const out = { problems: [], keys: [], words: 0, wordList: [] };
        const screen = document.querySelector('.ast-screen');
        const row = screen && screen.querySelector('.aw-palette');
        if (!row) { out.problems.push('§6.3 no .aw-palette after a Core was installed'); return out; }
        const visible = (n) => {
          if (!n.getClientRects().length) return false;
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          const r = n.getBoundingClientRect();
          return r.width >= 2 && r.height >= 2;
        };
        if (!visible(row)) { out.problems.push('§6.3 the palette mounted but is not on the glass'); return out; }
        const STATES = ['ready', 'armed', 'unaffordable'];
        const keyEls = [...row.querySelectorAll('.aw-build-key')];
        if (!keyEls.length) out.problems.push('§6.3 the palette mounted with zero keys');
        for (const k of keyEls) {
          const box = k.getBoundingClientRect();
          const cs = getComputedStyle(k);
          const id = k.dataset.itemId || '?';
          out.keys.push(`${id}:${k.dataset.keyState || '?'}`);
          if (!visible(k)) out.problems.push(`§6.3 key ${id} is not visible`);
          if (Math.round(box.width) !== 46 || Math.round(box.height) !== 46) {
            out.problems.push(`§6.3 key ${id} is ${Math.round(box.width)}x${Math.round(box.height)} (46x46)`);
          }
          if (parseFloat(cs.borderTopLeftRadius) !== 8) {
            out.problems.push(`§6.3 key ${id} radius is ${cs.borderTopLeftRadius} (8px)`);
          }
          if (!STATES.includes(k.dataset.keyState)) {
            out.problems.push(`§6.3 key ${id} publishes state "${k.dataset.keyState}" (ready|armed|unaffordable)`);
          }
          const glyph = k.querySelector('svg.aw-build-glyph');
          if (!glyph) out.problems.push(`§6.3 key ${id} has no silhouette glyph`);
          else {
            const g = glyph.getBoundingClientRect();
            if (Math.round(g.width) !== 22 || Math.round(g.height) !== 22) {
              out.problems.push(`§6.3 key ${id} glyph is ${Math.round(g.width)}x${Math.round(g.height)} (22px)`);
            }
            // A silhouette, not a hairline: the law asks for the board sprite's MASS.
            if (getComputedStyle(glyph).fill === 'none') {
              out.problems.push(`§6.3 key ${id} glyph is stroke-only — not a silhouette`);
            }
          }
          const hk = k.querySelector('.aw-build-hotkey');
          if (!hk || !/^[1-9]$/.test(hk.textContent.trim())) {
            out.problems.push(`§6.3 key ${id} has no hotkey numeral`);
          } else if (parseFloat(getComputedStyle(hk).fontSize) < 12) {
            out.problems.push(`§11.4 key ${id} numeral is under the 12px floor`);
          }
          // The NAME must not be on the glass by default — that is the hover tip's job (law §2.5).
          const tip = k.querySelector('.aw-build-tip');
          if (!tip) out.problems.push(`§6.3 key ${id} has no hover tip to carry its name`);
          else if (visible(tip)) out.problems.push(`§2.5 key ${id} prints its name on the default view`);
        }
        // The three states must be three PAINTS, not three attribute values. `.aw-build-key` lost
        // its background once already to a higher-specificity `.ast-screen button { background:
        // none }`, and every state assertion above stayed green while the plates rendered fully
        // transparent over the rock. So read what the browser computed.
        const paintOf = (el) => {
          const cs = getComputedStyle(el);
          const g = el.querySelector('svg.aw-build-glyph');
          return {
            bg: cs.backgroundColor,
            ink: g ? getComputedStyle(g).color : cs.color,
            shadow: cs.boxShadow,
          };
        };
        const byState = {};
        for (const k of keyEls) byState[k.dataset.keyState] = byState[k.dataset.keyState] || paintOf(k);
        out.paints = Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, `${v.bg}/${v.ink}`]));
        const TRANSPARENT = /rgba\(0, 0, 0, 0\)|transparent/;
        for (const [stateName, paint] of Object.entries(byState)) {
          if (TRANSPARENT.test(paint.bg)) {
            out.problems.push(`§6.3 the "${stateName}" key has no background — it is not a plate`);
          }
          if (TRANSPARENT.test(paint.ink)) out.problems.push(`§6.3 the "${stateName}" glyph has no colour`);
        }
        if (byState.ready && byState.armed && byState.ready.shadow === byState.armed.shadow) {
          out.problems.push('§6.3 armed and ready keys carry the same shadow — there is no gold ring');
        }
        if (byState.ready && byState.unaffordable) {
          if (byState.ready.bg === byState.unaffordable.bg) {
            out.problems.push(`§6.3 ready and unaffordable keys share a background (${byState.ready.bg})`);
          }
          if (byState.ready.ink === byState.unaffordable.ink) {
            out.problems.push(`§6.3 ready and unaffordable glyphs share an ink (${byState.ready.ink})`);
          }
          if (!/none/.test(byState.unaffordable.shadow)) {
            out.problems.push('§6.3 the unaffordable key is still raised — law §6.3 wants it flat');
          }
        }

        // A unique machine that already stands here is ABSENT, never a disabled placeholder.
        if (row.querySelector('[data-item-id="sm_massline_core"]')) {
          out.problems.push('§6.3 the built Core still has a key — an unpressable key is a placeholder');
        }
        if (!row.querySelector('[data-item-id="sm_extractor"]')) {
          out.problems.push('§6.3 no extractor key after the Core — the palette did not grow');
        }
        // The palette must not eat the §6.2 rig cluster.
        const rig = screen.querySelector('.aw-rig');
        if (rig) {
          const a = row.getBoundingClientRect();
          const b = rig.getBoundingClientRect();
          if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) {
            out.problems.push('§6.3 the palette overlaps the rig cluster');
          }
        }
        // §11.3 again, with the palette on the glass: the row must cost the drive view no words.
        const lens = screen.querySelector('.aw-lens');
        if (lens && visible(lens)) {
          out.problems.push('§11.3 the cursor lens is still on the glass while the palette word budget is counted');
        }
        const words = [];
        for (const el of screen.querySelectorAll('*')) {
          if (!visible(el)) continue;
          const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent.trim()).join(' ');
          const w = own.split(/\s+/).filter((x) => /[a-zA-Z]/.test(x));
          if (w.length) { words.push(...w); out.wordList.push(w.join(' ')); }
        }
        out.words = words.length;
        if (words.length > 15) {
          out.problems.push(`§11.3 word budget blown with the palette up: ${words.length} — ${out.wordList.join(' / ')}`);
        }
        return out;
      });
      notes.push(`${label}: palette after first Core — ${palette.keys.length} keys [${palette.keys.join(', ')}],`
        + ` paints ${JSON.stringify(palette.paints || {})},`
        + ` ${palette.words} visible words (${palette.wordList.join(' / ')})`);
      for (const p of palette.problems || []) failures.push(`${label}: ${p}`);

      // §6.7: BUILD arms exactly one key and the row reads live. Driven through the shipped key.
      await page.keyboard.press('KeyB');
      await page.waitForTimeout(300);
      const armed = await page.evaluate(() => {
        const screen = document.querySelector('.ast-screen');
        const row = screen && screen.querySelector('.aw-palette');
        return {
          mode: screen ? screen.dataset.mode : null,
          live: !!(row && row.classList.contains('live')),
          armed: row ? [...row.querySelectorAll('.aw-build-key')]
            .filter((k) => k.dataset.keyState === 'armed').map((k) => k.dataset.itemId) : [],
          pressed: row ? row.querySelectorAll('.aw-build-key[aria-pressed="true"]').length : 0,
        };
      });
      if (armed.mode !== 'build') failures.push(`${label}: §6.7 B did not arm build mode (${armed.mode})`);
      if (!armed.live) failures.push(`${label}: §6.3 the palette does not read live in build mode`);
      if (armed.armed.length !== 1) {
        failures.push(`${label}: §6.3 ${armed.armed.length} keys are armed (exactly 1): [${armed.armed.join(', ')}]`);
      }
      if (armed.pressed !== 1) failures.push(`${label}: §6.3 aria-pressed disagrees with the armed key (${armed.pressed})`);
      notes.push(`${label}: build mode arms [${armed.armed.join(', ')}]`);

      // ------------------------------------------------------------ §11.7 for the BUILD cursor
      // The law's cadence rule ("one tap ⇒ exactly one cell of displacement; a held key < 180ms ⇒
      // no second cell") was only ever asserted for the rig. PQ-130.09 gave the build cursor the
      // same clock, so it gets the same measurement — against the cell the screen publishes, not
      // against a re-implementation of the timer here. Note this is a REAL test of the clock:
      // Playwright never emits key auto-repeat, so any cell after the first can only have come
      // from the controller's own tick(dt).
      const readCursor = () => page.evaluate(() => {
        const raw = document.querySelector('.ast-screen')?.dataset.cursor;
        if (!raw) return null;
        const [c, r] = raw.split(',').map(Number);
        return Number.isFinite(c) && Number.isFinite(r) ? { col: c, row: r } : null;
      });
      await page.keyboard.press('ArrowDown'); // seed a known cursor (it is unset until first move)
      await page.waitForTimeout(120);
      const c0 = await readCursor();
      if (!c0) {
        failures.push(`${label}: §11.7 the screen publishes no build cursor — the cadence is unmeasured`);
      } else if (c0.row > ROWS_GUARD) {
        failures.push(`${label}: §11.7 the build cursor starts at row ${c0.row}, too close to the board floor to measure a hold`);
      } else {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(120);
        const tap = await readCursor();
        const tapCells = tap ? tap.row - c0.row : -1;
        if (tapCells !== 1) failures.push(`${label}: §11.7 one tap moved the build cursor ${tapCells} cells (exactly 1)`);

        // A hold shorter than MOVE_HOLD_DELAY_S (180ms) must not buy a second cell. Keep the
        // headed sample 80ms clear of the boundary: at the 1920 route, Playwright command delivery
        // can consume the old 40ms margin even though the controller's deterministic boundary test
        // remains exact in asteroid-drive-cadence.test.mjs.
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.up('ArrowDown');
        await page.waitForTimeout(140);
        const shortHold = await readCursor();
        const shortCells = shortHold && tap ? shortHold.row - tap.row : -1;
        if (shortCells !== 1) {
          failures.push(`${label}: §11.7 a 100ms hold moved the build cursor ${shortCells} cells (exactly 1)`);
        }

        // A real hold cruises — otherwise the assertion above is satisfied by a cursor that simply
        // cannot repeat at all, which would be a different bug wearing the same green.
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(760);
        await page.keyboard.up('ArrowDown');
        await page.waitForTimeout(140);
        const longHold = await readCursor();
        const longCells = longHold && shortHold ? longHold.row - shortHold.row : -1;
        if (!(longCells >= 3 && longCells <= 5)) {
          failures.push(`${label}: §11.7 a 760ms hold moved the build cursor ${longCells} cells (expected 3-5 on the 180ms seat + 240ms cruise)`);
        }
        notes.push(`${label}: build cursor cadence — tap ${tapCells}, 100ms hold ${shortCells}, 760ms hold ${longCells}`);
      }

      await page.keyboard.press('Escape');
    }

    // ---------------------------------------------------------------- PQ-130.10b "the site reads"
    // Law §7/§6.5/§6.7. Everything below is measured off `canvas.__ast3d` — the LIVE objects the
    // renderer is drawing this frame, not a re-derivation — and every rule is asserted in BOTH
    // directions, because a rule that only ever checks the interesting half passes its own mutation.
    if (coreInstall.ok) {
      // Build a real site: a bored corridor, a port at one end, a machine at the other, one shared
      // power+lane spine between them — and, deliberately, a SECOND lane cell bolted to nothing so
      // the island drawing has a real island to find.
      const wired = await page.evaluate((seat) => {
        const sf = window.SF;
        const st = sf.state;
        const sites = sf.registry.get('asteroidSites');
        const d = st.drill;
        const astId = d.asteroidId;
        const cargo = st.player.cargo;
        cargo.capVolume = Math.max(cargo.capVolume || 0, 900);
        for (const [k, q] of Object.entries({
          cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_electronics: 8,
          cmdty_refined_metals: 20, cmdty_purified_silica: 20,
        })) cargo.items[k] = (cargo.items[k] || 0) + q;
        const ent = st.entities.get(astId);
        const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
        const hollow = (c, r) => {
          if (c < 0 || c > 27 || r < 1 || r > 44) return false;
          if (d.field[c][r].type === 'empty') return true;
          d.field[c][r] = EMPTY();
          if (ent && ent.data) {
            if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
            const idx = r * 28 + c;
            if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
          }
          sf.bus.emit('drill:break', { col: c, row: r, type: 'matrix', ore: null, wasVein: false, wasGas: false });
          return true;
        };
        const row = Math.min(40, Math.max(3, seat.row + 2));
        const c0 = Math.max(1, Math.min(20, seat.col - 2));
        const spine = [];
        for (let i = 0; i < 6; i++) { if (hollow(c0 + i, row)) spine.push([c0 + i, row]); }
        if (spine.length < 5) return { ok: false, reason: 'no corridor' };
        const portAt = spine[spine.length - 1];
        const machAt = spine[0];
        const port = sites.installMachine({ asteroidId: astId, defId: 'sm_cargo_port', col: portAt[0], row: portAt[1] });
        const mach = sites.installMachine({ asteroidId: astId, defId: 'sm_extractor', col: machAt[0], row: machAt[1] });
        const siteId = (port.siteId || mach.siteId
          || (sites.siteForAsteroid(astId) && sites.siteForAsteroid(astId).id));
        for (const [c, r] of spine.slice(1, spine.length - 1)) {
          sites.setOverlay(siteId, 'power', c, r, true);
          sites.setOverlay(siteId, 'lane', c, r, true);
        }
        // THE ISLAND: a painted lane cell four rows down, touching nothing. Nobody delivers here.
        let island = null;
        for (let dr = 4; dr <= 8 && !island; dr++) {
          const c = c0 + 2;
          const r = row + dr;
          if (hollow(c, r)) { sites.setOverlay(siteId, 'lane', c, r, true); island = [c, r]; }
        }
        const site = sites.getSite(siteId);
        sites._runtime(site);
        // Stock on the spine so its lane has a buffer to carry; the island stays empty by design.
        for (const ls of site.laneStores) {
          if ((ls.cells || []).includes(portAt[1] * 28 + portAt[0])) ls.store.cmdty_silicate = 40;
        }
        for (let i = 0; i < 40; i++) { st.simTime += 1; sites.update(1, st); }
        return {
          ok: !!siteId, siteId, island, portAt, machAt, spine,
          installs: { port: [port.ok, port.reason], mach: [mach.ok, mach.reason] },
        };
      }, coreInstall.seat).catch((e) => ({ ok: false, reason: String((e && e.message) || e) }));

      if (!wired.ok) {
        failures.push(`${label}: §7 could not wire a test network (${wired.reason}) — every network assertion below would be vacuous`);
      } else {
        // Wait for the authored mount to settle instead of a fixed sleep: the conduit packages
        // decode asynchronously and a heavy package ahead of them (the port's UASTC atlas) can
        // legitimately push the first mount past a fixed 700 ms without any stall.
        const readNet = () => page.evaluate(() => {
          const canvas = document.querySelector('.ast-canvas');
          const h = canvas && canvas.__ast3d;
          if (!h) return { broken: `no ast3d hook (canvas=${!!canvas}, mode=${window.SF.state.mode})` };
          try {
            const net = h.networks();
            if (!net || !Array.isArray(net.runs)) return { broken: `bad networks shape: ${typeof net}` };
            return { net, lens: h.lens(), crates: h.crates(), faces: h.faces() };
          } catch (error) {
            return { broken: `hook read failed: ${error.message}` };
          }
        });
        let n0 = await readNet();
        const mountSettled = (read) => {
          if (!read || read.broken || !read.net || !Array.isArray(read.net.runs)) return true;
          return read.net.runs.length >= 2
            || (read.net.mount && read.net.mount.phase !== 'loading');
        };
        for (let waited = 0; !mountSettled(n0) && waited < 15000; waited += 250) {
          await page.waitForTimeout(250);
          n0 = await readNet();
        }
        // The mount settles the moment the pieces exist; the live/dark material dimming is a
        // per-frame pass that lands a beat later. Give it a few frames before sampling — the
        // island invariant below is still asserted in both directions on the settled state.
        await page.waitForTimeout(500);
        n0 = await readNet();
        if (n0.broken) {
          failures.push(`${label}: §7 the drill canvas lost its renderer hook while waiting for the mount: ${n0.broken}`);
        }
        notes.push(`${label}: §7 networks — ${n0.net.runs.length} runs `
          + `[${n0.net.runs.map((r) => `${r.kind}:${r.key}:${r.live ? 'live' : 'dark'}@${r.emissive}`).join(', ')}]`
          + ` · ${n0.net.flowDots} dots on ${n0.net.flowRoutes} routes`
          + ` · lanes ${JSON.stringify(n0.net.lanes)}`);
        if (n0.net.runs.length < 2) {
          failures.push(`${label}: §7 the built spine drew ${n0.net.runs.length} network runs (expected a lane and a cable at least)`
            + ` mount=${JSON.stringify(n0.net.mount || null)}`);
        }
        // ---- islands, BOTH directions. A live run and a dark one must differ in colour AND in
        // emissive, or "dim and desaturated" is a claim nothing on the glass is making.
        const lives = n0.net.runs.filter((r) => r.live);
        const darks = n0.net.runs.filter((r) => !r.live);
        if (!lives.length) failures.push(`${label}: §7 no run reads live — the island test would pass vacuously`);
        if (!darks.length) {
          failures.push(`${label}: §7 the disconnected lane cell drew no dark run — islands are not being dimmed`);
        }
        if (lives.length && darks.length) {
          const liveLane = lives.find((r) => r.kind === 'lane') || lives[0];
          const darkLane = darks.find((r) => r.kind === 'lane') || darks[0];
          if (darkLane.emissive >= liveLane.emissive) {
            failures.push(`${label}: §7 the dark island is not dimmer than the live run (${darkLane.emissive} vs ${liveLane.emissive})`);
          }
          if (darkLane.kind === liveLane.kind && darkLane.hex === liveLane.hex) {
            failures.push(`${label}: §7 the dark island wears the live jacket colour (${darkLane.hex}) — nothing is desaturated`);
          }
        }
        // ---- flow: stock on a lane puts dots on the glass; an empty lane puts none.
        if (!(n0.net.flowDots > 0)) {
          failures.push(`${label}: §7 a lane holding ${JSON.stringify(n0.net.lanes.map((l) => l.stored))} carried no flow dots`);
        }
        // §7 "the buffer reads as dot density" — measured in BOTH directions on the same topology,
        // because a fixed number of dots satisfies "there are dots" forever. A lane still in use with
        // an empty buffer keeps a trickle by design (goods consumed the tick they arrive), so the
        // law being asserted here is the SLOPE, plus the idle floor when nothing is moving at all.
        const setStock = async (units) => {
          await page.evaluate((arg) => {
            const site = window.SF.registry.get('asteroidSites').getSite(arg.siteId);
            for (const ls of site.laneStores) {
              for (const k of Object.keys(ls.store)) delete ls.store[k];
              if (arg.units > 0 && (ls.cells || []).length > 1) ls.store.cmdty_silicate = arg.units;
            }
            site.exportBuffer = {};
          }, { siteId: wired.siteId, units });
          // The projection/render bridge advances on its own cadence. A fixed 400 ms sleep raced
          // that cadence at 1920x1080 and sampled 0 -> 0 even though the same 1280x720 cell reached
          // 0 -> 4. Wait for the live renderer reading that this assertion actually consumes.
          await page.waitForFunction((expected) => {
            const h = document.querySelector('.ast-canvas')?.__ast3d;
            if (!h) return false;
            const lanes = h.networks().lanes;
            if (!lanes.length) return false;
            return expected > 0
              ? lanes.some((lane) => lane.stored >= expected)
              : lanes.every((lane) => lane.stored === 0);
          }, units, { timeout: 2500, polling: 50 });
          return readNet();
        };
        const nEmpty = await setStock(0);
        const nFull = await setStock(240);
        notes.push(`${label}: §7 flow density — empty ${nEmpty.net.flowDots} dots, full ${nFull.net.flowDots} dots`);
        if (!(nFull.net.flowDots > nEmpty.net.flowDots)) {
          failures.push(`${label}: §7 filling the lane did not add flow dots (${nEmpty.net.flowDots} -> ${nFull.net.flowDots}) — density is not the buffer`);
        }
        if (!nEmpty.net.lanes.some((l) => l.active) && nEmpty.net.flowDots !== 0) {
          failures.push(`${label}: §7 an empty, idle lane still carries ${nEmpty.net.flowDots} flow dots`);
        }
        // ---- the port stacks crates, keyed to the buffer at two different fills.
        const crateAt = async (units) => page.evaluate((arg) => {
          const sf = window.SF;
          const site = sf.registry.get('asteroidSites').getSite(arg.siteId);
          site.exportBuffer = arg.units > 0 ? { cmdty_silicate: arg.units } : {};
          return true;
        }, { siteId: wired.siteId, units }).then(() => page.waitForTimeout(300))
          .then(() => page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.crates()));
        const cEmpty = await crateAt(0);
        const cLow = await crateAt(2);
        const cHigh = await crateAt(30);
        notes.push(`${label}: §7 port crates — buffer 0 -> stage ${cEmpty.stage}, 2 -> ${cLow.stage}, 30 -> ${cHigh.stage}`);
        if (cEmpty.stage !== 0 || cEmpty.visible) failures.push(`${label}: §7 an empty port still shows a crate pile (stage ${cEmpty.stage})`);
        if (!(cLow.stage > 0)) failures.push(`${label}: §7 a stocked port shows no crates (stage ${cLow.stage})`);
        if (!(cHigh.stage > cLow.stage)) {
          failures.push(`${label}: §7 the crate pile does not grow with the buffer (${cLow.stage} -> ${cHigh.stage})`);
        }
        if (!cHigh.visible) failures.push(`${label}: §7 the crate pile is not on the glass at stage ${cHigh.stage}`);

        // ---- §6.5 the lens cycle, through the SHIPPED KEY. Four presses, four states, home again.
        const lensNow = () => page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens().active);
        const seen = [await lensNow()];
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('KeyV');
          await page.waitForTimeout(140);
          seen.push(await lensNow());
        }
        notes.push(`${label}: §6.5 V cycle — [${seen.map((v) => v || 'none').join(' -> ')}]`);
        if (seen[0] !== null) failures.push(`${label}: §6.5 the default drive view already had a lens up (${seen[0]})`);
        if (seen[1] !== 'faces' || seen[2] !== 'network' || seen[3] !== 'plan') {
          failures.push(`${label}: §6.5 V did not walk Faces/Network/Plan — got [${seen.join(', ')}] (a dead key reads [null, null, ...])`);
        }
        if (seen[4] !== null) failures.push(`${label}: §6.5 the fourth V did not return to no lens (${seen[4]})`);

        // ---- the Network lens must MOVE something, not merely set a flag.
        await page.evaluate((siteId) => {
          const site = window.SF.registry.get('asteroidSites').getSite(siteId);
          site.exportBuffer = { cmdty_silicate: 18 };
          for (const ls of site.laneStores) if ((ls.cells || []).length > 1) ls.store.cmdty_silicate = 40;
        }, wired.siteId);
        await page.waitForTimeout(300);
        const offNet = await readNet();
        await page.keyboard.press('KeyV');
        await page.keyboard.press('KeyV');
        await page.waitForTimeout(300);
        const onNet = await readNet();
        const brightest = (r) => r.net.runs.reduce((m, x) => Math.max(m, x.emissive), 0);
        if (await lensNow() !== 'network') {
          failures.push(`${label}: §6.5 two V presses did not land on the Network lens`);
        } else if (!(brightest(onNet) > brightest(offNet))) {
          failures.push(`${label}: §6.5 the Network lens changed no run's emissive (${brightest(offNet)} -> ${brightest(onNet)})`);
        } else {
          notes.push(`${label}: §6.5 Network lens brightens runs ${brightest(offNet)} -> ${brightest(onNet)}`);
        }

        // ---- §7 authored conduits retain physical width at both resident LOD registers; topology
        // and component ownership stay present while the renderer flips only tagged visibility.
        const work = await readNet();
        await page.keyboard.press('KeyZ');
        await page.waitForTimeout(700);
        const siteReg = await readNet();
        notes.push(`${label}: §7 register work(authored ${work.net.authoredCount}/${work.net.mount?.authoredCount || 0},`
          + ` lod0/lod1 ${work.net.visibleLods?.lod0 || 0}/${work.net.visibleLods?.lod1 || 0}, lane ${work.net.laneWidthPx}px,`
          + ` seam α ${work.lens.seamAlpha}) -> site(authored ${siteReg.net.authoredCount}/${siteReg.net.mount?.authoredCount || 0},`
          + ` lod0/lod1 ${siteReg.net.visibleLods?.lod0 || 0}/${siteReg.net.visibleLods?.lod1 || 0},`
          + ` lane ${siteReg.net.laneWidthPx}px, seam α ${siteReg.lens.seamAlpha})`);
        if (siteReg.net.register !== 'site') failures.push(`${label}: §7 Z did not reach the site register`);
        const assertAuthoredNetwork = (net, register, visibleLod) => {
          if (net.mount?.phase !== 'authored' || net.authoredCount !== net.runs.length
            || net.mount?.authoredCount !== net.authoredCount) {
            failures.push(`${label}: §7 ${register} authored mount is incomplete (${JSON.stringify(net.mount)})`);
          }
          const families = new Set(net.runs.map((run) => run.kind));
          if (!families.has('power') || !families.has('lane')) {
            failures.push(`${label}: §7 ${register} lacks authored power/lane topology (${[...families].join(',')})`);
          }
          if (!(net.visibleLods?.[visibleLod] > 0)) {
            failures.push(`${label}: §7 ${register} has no visible resident ${visibleLod} conduit meshes (${JSON.stringify(net.visibleLods)})`);
          }
          const other = visibleLod === 'lod0' ? 'lod1' : 'lod0';
          if ((net.visibleLods?.[other] || 0) !== 0) {
            failures.push(`${label}: §7 ${register} leaked ${other} conduit meshes (${JSON.stringify(net.visibleLods)})`);
          }
        };
        assertAuthoredNetwork(work.net, 'work', 'lod0');
        assertAuthoredNetwork(siteReg.net, 'site', 'lod1');
        // Keep the flat-line prohibition: authored body width must survive at the site register.
        if (!(work.net.laneWidthPx > siteReg.net.laneWidthPx)) {
          failures.push(`${label}: §7 register probe width did not update (${work.net.laneWidthPx} -> ${siteReg.net.laneWidthPx})`);
        }
        if (!(siteReg.net.laneWidthPx >= 6)) {
          failures.push(`${label}: §7 the lane run is ${siteReg.net.laneWidthPx}px across at the site register — a hairline, not a conveyor`);
        }
        if (!(siteReg.net.runs.length > 0)) failures.push(`${label}: §7 the site register drew no network runs at all`);
        if (!(siteReg.lens.seamAlpha < work.lens.seamAlpha)) {
          failures.push(`${label}: §7 seam outlines did not thin at the site register (${work.lens.seamAlpha} -> ${siteReg.lens.seamAlpha})`);
        }
        await page.keyboard.press('KeyZ');
        await page.waitForTimeout(600);
        await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.setLens(null));

        // ---- §6.5 the Plan lens must MOVE the board, not just take a name in the cycle. Its seam
        // weight is the deterministic half (the count/rate chips need a producing site, which the
        // capture stages and photographs); assert it here in both directions.
        {
          const off = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens());
          await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.setLens('plan'));
          await page.waitForTimeout(300);
          const on = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens());
          notes.push(`${label}: §6.5 Plan lens seam weight ${off.seamAlpha} -> ${on.seamAlpha}`
            + ` · chips ${off.chips} -> ${on.chips}`);
          if (on.active !== 'plan') failures.push(`${label}: §6.5 setLens('plan') did not take`);
          if (!(on.seamAlpha > off.seamAlpha)) {
            failures.push(`${label}: §6.5 the Plan lens left the seam outlines at ${on.seamAlpha} — it drew nothing`);
          }
          await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.setLens(null));
          await page.waitForTimeout(300);
          const back = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens());
          if (back.seamAlpha !== off.seamAlpha) {
            failures.push(`${label}: §6.5 the Plan lens leaked its seam weight after it closed (${back.seamAlpha})`);
          }
        }

        // ---- §6.7 the board in build mode: mint seats under a ghost, and gridline strengthening
        // that rises AND falls. PQ-130.09's lesson was state leaking out of build mode.
        const driveFaces = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
        await page.keyboard.press('KeyB');
        await page.waitForTimeout(500);
        const buildFaces = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
        notes.push(`${label}: §6.7 grid strength drive ${driveFaces.gridStrength} -> build ${buildFaces.gridStrength}`
          + ` · mint seats ${buildFaces.seats} · why-glyphs ${buildFaces.whyGlyphs}`);
        if (driveFaces.gridStrength !== 0) {
          failures.push(`${label}: §6.7 the drive board already carries ${driveFaces.gridStrength} of gridline strengthening`);
        }
        if (!(buildFaces.gridStrength > 0.1 && buildFaces.gridStrength <= 0.2)) {
          failures.push(`${label}: §6.7 build mode strengthened the gridlines by ${buildFaces.gridStrength} (law says ~15%)`);
        }
        if (!(buildFaces.seats > 0)) {
          failures.push(`${label}: §6.7 a live ghost lit no valid machine seats on the board`);
        }
        // ---- the WHY-GLYPHS, exercised for real. The extractor is affordable and the site is
        // anchored, so nothing it can refuse produces a plate — every blocked cell near the cursor
        // is `occupied` or `rover-here`, which the board already answers with a visible object. The
        // gas tap does: `needs-gas-contact` refuses every seat that is not against a pocket, which
        // is deterministic, needs no cargo fiddling, and is exactly the invisible cause a plate is
        // for. Without this the whole glyph bank ships unexercised.
        {
          const at = await page.evaluate((cell) => {
            const canvas = document.querySelector('.ast-canvas');
            const quad = canvas.__ast3d.projectCell(cell[0], cell[1]);
            if (!quad) return null;
            const r = canvas.getBoundingClientRect();
            return { x: r.left + (quad[0].x + quad[2].x) / 2, y: r.top + (quad[0].y + quad[2].y) / 2 };
          }, wired.spine[2]);
          if (!at) {
            failures.push(`${label}: §6.7 the spine cell used to aim the why-glyph test is off glass`);
          } else {
            await page.mouse.move(at.x, at.y);
            await page.keyboard.press('Digit2');       // the gas tap: refuses any seat off a pocket
            await page.waitForTimeout(600);
            const why = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
            notes.push(`${label}: §6.7 gas tap armed — ${why.whyGlyphs} why-glyph plate(s),`
              + ` reasons [${[...new Set(why.reasons)].join(', ')}], ${why.seats} seats`);
            if (!(why.whyGlyphs > 0)) {
              failures.push(`${label}: §6.7 a machine that cannot be seated anywhere drew no why-glyph`
                + ` (reasons seen: ${[...new Set(why.reasons)].join(', ') || 'none'})`);
            }
            if (why.whyGlyphs > 6) {
              failures.push(`${label}: §6.7 ${why.whyGlyphs} why-glyph plates on the board at once — the cap is not holding`);
            }
            await page.keyboard.press('Digit1');       // back to the extractor for the exit assertions
            await page.waitForTimeout(300);
          }
        }
        // OWNER RULING 2026-08-21 — "NO solid cell fills, ever, for any lens or build feedback."
        // A seat mark is corner brackets on the block's bevel ring: this is the drawn ink as a
        // fraction of the cell, and a painted face would report an order of magnitude more.
        if (!(buildFaces.seatInkFrac > 0 && buildFaces.seatInkFrac < 0.2)) {
          failures.push(`${label}: §6.7 a seat mark covers ${(buildFaces.seatInkFrac * 100).toFixed(1)}% of its cell`
            + ' — that is a painted face, not an edge treatment');
        }
        notes.push(`${label}: §6.7 seat mark ink ${(buildFaces.seatInkFrac * 100).toFixed(1)}% of a cell`
          + ` · ${buildFaces.seatMarks} marks drawn`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const backFaces = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
        if (backFaces.gridStrength !== 0) {
          failures.push(`${label}: §6.7 gridline strengthening leaked out of build mode (${backFaces.gridStrength})`);
        }
        if (backFaces.seats !== 0) {
          failures.push(`${label}: §6.7 ${backFaces.seats} mint seats are still lit in the drive view`);
        }
      }
    }

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

async function isLensGone(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.aw-lens');
    if (!el) return true;
    if (!el.getClientRects().length) return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
  });
}

async function releaseSyntheticBoardHover(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.ast-canvas');
    if (!canvas) return;
    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  });
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  await page.mouse.move(Math.round(vp.width / 2), 8);
  await page.waitForTimeout(300);
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
