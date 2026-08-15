// probe-data-states.mjs — force the J3 primitive through all four states and LOOK at it.
//
// check-data-states.mjs proves the CONTRACT holds (verb present, sweep detaches, tokens legal).
// It cannot prove the result is legible, and this repo has four documented cases of a green check
// over a visibly broken screen (§11.12 J10). So this probe renders the REAL primitive against the
// REAL stylesheet and measures what a check cannot see:
//
//   M1  every state renders all four required parts (word, headline, fills, verb)
//   M2  nothing below the 12px type floor, in any mode
//   M3  no state clips past its own container (the Mission Log defect class)
//   M4  the verb is reachable and focusable by keyboard
//   M5  under forced-colors the block still has visible structure — the mode where gradients,
//       shadows and background-images are stripped and a "styled" block can go blank
//   M6  under reduced-motion the LOADING sweep is actually stopped, not merely slowed
//   M7  +40% string growth (pseudo-localization) does not clip or overlap anything
//
// Captures the matrix to .devshots/data-states/ so the frames can be looked at, not just trusted.
// Read-only: serves the repo, renders in an isolated page, writes a report. Changes no game state.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/data-states/', import.meta.url));
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
  const port = await findFreePort(8460);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited');
    try { const r = await fetch(url); if (r.ok) return { child, baseUrl: url }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never came up');
}

// The four states, authored the way a real pane would author them.
const FIXTURES = [
  ['empty', {
    headline: 'No contracts are posted here.',
    fills: 'Boards fill when a station has cargo it cannot move itself. The nearest active board is Ceres, two jumps out.',
    verb: { label: 'Plot a route to Ceres', action: 'probe:route' },
  }],
  ['loading', {
    headline: 'Reading the hull.',
    fills: 'Waiting on the shipyard optics to resolve your fitted modules — this finishes when the scan does, not on a timer.',
    verb: { label: 'Cancel the scan', action: 'probe:cancel' },
    skeleton: [{ w: '68%', h: 14 }, { w: '92%' }, { w: '46%' }],
  }],
  ['error', {
    headline: 'The market feed did not answer.',
    fills: 'Prices here are from your last visit and may have moved. Retrying re-reads the station ledger.',
    detail: 'Last good read: 14 minutes ago.',
    verb: { label: 'Retry the read', key: 'R', action: 'probe:retry' },
  }],
  ['denied', {
    headline: 'You cannot dock at Vesta Yard.',
    fills: 'Your outstanding bounty is 5,400 credits and this station refuses anyone above 5,000. Paying it clears the refusal immediately.',
    verb: { label: 'Pay 5,400 cr bounty', action: 'probe:pay' },
  }],
];

const PAGE = (fixtures) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles/fonts.css"><link rel="stylesheet" href="/styles/ui.css">
<style>
  html,body{margin:0;background:var(--sf-surface,#0b1220);}
  #grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--sf-edge,#1d3350);min-height:100vh}
  .cell{background:var(--sf-surface,#0b1220);display:flex;align-items:center;justify-content:center;padding:8px;min-width:0}
  /* THE SHIPPING COLUMN. The live adoption sites render inside .gm-right-inspector — 320px minus
     16px padding and a 1px rule = 287px — not the ~535px every earlier frame captured. The narrow
     column is the COMMON case, and it was the one nobody had looked at. */
  #narrow{position:fixed;top:0;right:0;width:287px;height:100vh;overflow:auto;
          background:var(--sf-surface,#0b1220);border-left:1px solid var(--sf-edge,#1d3350);
          display:flex;flex-direction:column;justify-content:center}
</style></head><body><div id="grid"></div>
<script type="module">
  import { dataState } from '/src/ui/uiPrimitives.js';
  const grid = document.getElementById('grid');
  for (const [kind, opts] of ${JSON.stringify(fixtures)}) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.cell = kind;
    cell.appendChild(dataState(kind, opts));
    grid.appendChild(cell);
  }
  // Same four states again, in the real shipping width — two non-compact (as 2 of the 3 live sites
  // are) and the offers state compact, mirroring production.
  const narrow = document.createElement('div');
  narrow.id = 'narrow';
  document.body.appendChild(narrow);
  for (const [kind, opts] of ${JSON.stringify(fixtures)}) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.cell = 'narrow-' + kind;
    cell.appendChild(dataState(kind, kind === 'error' ? { ...opts, compact: true } : opts));
    narrow.appendChild(cell);
  }
  window.__ready = true;
<\/script></body></html>`;

/** Everything measured inside the page. */
const MEASURE = () => {
  const out = { states: [], belowFloor: [], clipped: [], missingParts: [], running: [], wrapping: [] };
  for (const cell of document.querySelectorAll('[data-cell]')) {
    const kind = cell.dataset.cell;
    const node = cell.querySelector('.sf-state');
    if (!node) { out.missingParts.push(`${kind}: no .sf-state rendered`); continue; }
    const parts = {
      word: !!node.querySelector('.sf-state__word'),
      head: !!node.querySelector('.sf-state__head'),
      fills: !!node.querySelector('.sf-state__fills'),
      verb: !!node.querySelector('.sf-state__verb'),
      glyph: !!node.querySelector('.sf-state__glyph svg'),
    };
    for (const [p, ok] of Object.entries(parts)) if (!ok) out.missingParts.push(`${kind}: missing ${p}`);

    // M2 — 12px type floor, computed (not authored).
    for (const el of node.querySelectorAll('*')) {
      if (!el.textContent.trim()) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs && fs < 11.5) out.belowFloor.push(`${kind}: ${el.className || el.tagName} @ ${fs.toFixed(1)}px`);
    }
    // M3 — clipping past the cell.
    const cr = cell.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    if (nr.bottom > cr.bottom + 1 || nr.right > cr.right + 1) {
      out.clipped.push(`${kind}: overflows by ${Math.max(0, nr.bottom - cr.bottom).toFixed(0)}px vertical / ${Math.max(0, nr.right - cr.right).toFixed(0)}px horizontal`);
    }
    // M8 — PATHOLOGICAL WRAPPING. A narrow flex context plus overflow-wrap:anywhere can render
    // prose one character per line. That breaks none of the other measures — type floor, clipping
    // and focus are all satisfied by a 1-char column — so the probe reported OK over a frame that
    // was unreadable. Compare rendered height against the single-line height to get line count.
    const head = node.querySelector('.sf-state__head');
    const fillsEl = node.querySelector('.sf-state__fills');
    for (const [name, elx] of [['head', head], ['fills', fillsEl]]) {
      if (!elx) continue;
      const lh = parseFloat(getComputedStyle(elx).lineHeight) || parseFloat(getComputedStyle(elx).fontSize) * 1.2;
      const lines = Math.round(elx.getBoundingClientRect().height / lh);
      const chars = elx.textContent.trim().length;
      if (lines > 1 && chars / lines < 8) {
        out.wrapping.push(`${kind}: .sf-state__${name} wraps to ${lines} lines for ${chars} chars (~${(chars / lines).toFixed(1)} chars/line)`);
      }
    }

    // M4 — verb focusable.
    const verb = node.querySelector('.sf-state__verb');
    let focusable = false;
    if (verb) { verb.focus(); focusable = document.activeElement === verb; verb.blur(); }

    // M5 — visible structure: the border rail must have real computed width.
    const cs = getComputedStyle(node);
    const rail = parseFloat(cs.borderInlineStartWidth || cs.borderLeftWidth || '0');

    // M6 — is the LOADING sweep actually animating right now?
    let sweeping = false;
    for (const bar of node.querySelectorAll('.sf-state__bar')) {
      const anims = bar.getAnimations ? bar.getAnimations({ subtree: true }) : [];
      if (anims.some((a) => a.playState === 'running')) sweeping = true;
    }
    if (sweeping) out.running.push(kind);

    out.states.push({ kind, parts, focusable, rail, sweeping, bars: node.querySelectorAll('.sf-state__bar').length, w: Math.round(nr.width), h: Math.round(nr.height) });
  }
  return out;
};

const VIEWPORTS = [[2560, 1080], [1920, 1080], [1280, 720]];

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const { child, baseUrl } = await startFreshServer();
  const browser = await chromium.launch();
  const problems = [];
  const report = [];

  // Pseudo-localization: +40% string growth, per A_LIST_GAPS #1 / grammar §12 item 11.
  const grow = (s) => {
    const pad = '·'.repeat(Math.ceil(s.length * 0.4 / 2));
    return `[${pad}${s}${pad}]`;
  };
  const pseudo = FIXTURES.map(([k, o]) => [k, {
    ...o,
    headline: grow(o.headline),
    fills: grow(o.fills),
    ...(o.detail ? { detail: grow(o.detail) } : {}),
    verb: { ...o.verb, label: grow(o.verb.label) },
  }]);

  const MODES = [
    ['default', {}, FIXTURES],
    ['reduced-motion', { reducedMotion: 'reduce' }, FIXTURES],
    ['forced-colors', { forcedColors: 'active' }, FIXTURES],
    ['pseudo-loc', {}, pseudo],
  ];

  for (const [w, h] of VIEWPORTS) {
    for (const [mode, emu, fixtures] of MODES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.setContent(PAGE(fixtures).replace(/src="\//g, `src="${baseUrl}`).replace(/href="\//g, `href="${baseUrl}`), { waitUntil: 'networkidle' });
      if (Object.keys(emu).length) await page.emulateMedia(emu);
      await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
      await page.waitForTimeout(180);

      const m = await page.evaluate(MEASURE);
      const tag = `${w}x${h}·${mode}`;

      if (m.missingParts.length) problems.push(...m.missingParts.map((p) => `[${tag}] ${p}`));
      if (m.belowFloor.length) problems.push(...m.belowFloor.map((p) => `[${tag}] below 12px floor — ${p}`));
      if (m.clipped.length) problems.push(...m.clipped.map((p) => `[${tag}] clipped — ${p}`));
      if (m.wrapping.length) problems.push(...m.wrapping.map((p) => `[${tag}] unreadable wrapping — ${p}`));
      for (const s of m.states) {
        if (!s.focusable) problems.push(`[${tag}] ${s.kind}: verb is not keyboard-focusable`);
        if (!(s.rail > 0)) problems.push(`[${tag}] ${s.kind}: state rail has no computed width — block may read as unstyled`);
      }
      // M6 INVERTED, deliberately. The LOADING skeleton must be PRESENT and must NOT animate:
      // grammar §5 admits no motion without a named state variable behind it, and dataState's
      // callers supply no progress signal, so a perpetual sweep would encode nothing. It would also
      // be the exact compositor-side keyframe check:ui-frame-sleep cannot see. The state is carried
      // by the WORKING word, the arc glyph, aria-busy on the host, and the skeleton's shape.
      if (m.running.length) {
        problems.push(`[${tag}] unbound animation running: ${m.running.join(', ')} — motion needs a state variable behind it (§5)`);
      }
      const loadingHasSkeleton = m.states.some((x) => x.kind.endsWith('loading') && x.bars > 0);
      if (!loadingHasSkeleton) {
        problems.push(`[${tag}] LOADING renders no skeleton — nothing conveys the shape of what is coming`);
      }

      await page.screenshot({ path: `${OUT}${w}x${h}-${mode}.png` });
      report.push({ viewport: `${w}x${h}`, mode, states: m.states, belowFloor: m.belowFloor.length, clipped: m.clipped.length });
      await ctx.close();
    }
  }

  await browser.close();
  child.kill();

  writeFileSync(`${OUT}report.json`, JSON.stringify({ problems, report }, null, 2));
  console.log(`captured ${VIEWPORTS.length * MODES.length} frames -> .devshots/data-states/`);
  if (problems.length) {
    console.error('\nprobe:data-states FOUND PROBLEMS');
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log('probe:data-states OK — all four states legible across default / reduced-motion / forced-colors / pseudo-loc at 3 widths');
};

run().catch((err) => { console.error(err); process.exit(1); });
