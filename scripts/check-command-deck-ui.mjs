#!/usr/bin/env node
// check-command-deck-ui.mjs — operational UI lifecycle and accessibility contract lint.
//
// STATIC source analysis — deterministic, zero DOM/WebGL, zero network. Live mount/unmount, tab
// navigation, and per-screen rendering are owned by the Playwright *-runtime checks
// (check-station-tab-navigation-runtime, check-mission-accept-handoff-runtime, …). The final section
// is IMPORT-SAFETY + the structural mount/unmount contract: what stays honestly green even while a
// panel's runtime onShow is mid-refactor (a broken onShow is a runtime bug the *-runtime checks own,
// not a module-load bug). We NEVER invoke mount() here — several screens need a live ctx or a WebGL
// context (shipyard's engineering stage) that a Node harness cannot supply.
//
// This check intentionally does not enforce a component vocabulary, palette, blur recipe, or visual
// technique. Those choices need player-route evidence. It keeps the machine-verifiable contracts:
// effects sleep when hidden, transient messaging stays one-voice, controls remain labelled,
// reduced-motion is respected, and every registered surface remains importable and mountable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCREENS_DIR = 'src/ui/screens';

// Captured surfaces. Legacy entries carry `file` relative to SCREENS_DIR; an entry may instead
// carry an explicit repo-root-relative `path` (the live station lives under src/ui/station/**).
// exportName: the top-level screen def to structurally verify (mount/onHide). Panels (market /
// outfitting / shipyard / factions are stationHub children) have no top-level def → null.
const SCREENS = [
  { key: 'main-menu',   file: 'mainMenu.js',        exportName: 'mainMenuScreen' },
  { key: 'galaxy-map',  file: 'starmap.js',         exportName: 'starmapScreen' },
  { key: 'station-hub', file: 'stationHub.js',      exportName: 'stationHub' },
  { key: 'hold',        file: 'stationHub.js',      exportName: null },
  { key: 'market',      file: 'market.js',          exportName: null },
  { key: 'outfitting',  file: 'outfitting.js',      exportName: null },
  { key: 'shipyard',    file: 'shipyard.js',        exportName: null },
  { key: 'missions',    file: 'stationHub.js',      exportName: null },
  { key: 'automation',  file: 'automationPanel.js', exportName: 'automationScreen' },
  { key: 'factions',    file: 'factions.js',        exportName: null },
  { key: 'anomaly',     file: 'codex.js',           exportName: 'codexScreen' },
  // Live docked station ("Orbital Command", src/ui/station/**) — what the player actually sees on
  // every dock. stationScreen is the registered screen def; the rest are the app shell, the seven
  // destination screens (panel modules, each exporting a create<Name>Screen(ctx) factory), and the
  // command dock fascia.
  { key: 'station-shell',     path: 'src/ui/station/stationScreen.js',      exportName: 'stationScreen' },
  { key: 'station-app',       path: 'src/ui/station/stationApp.js',         exportName: null },
  { key: 'station-market',    path: 'src/ui/station/screens/market.js',     exportName: null },
  { key: 'station-shipworks', path: 'src/ui/station/screens/shipworks.js',  exportName: null },
  { key: 'station-industry',  path: 'src/ui/station/screens/industry.js',   exportName: null },
  { key: 'station-contracts', path: 'src/ui/station/screens/contracts.js',  exportName: null },
  { key: 'station-factions',  path: 'src/ui/station/screens/factions.js',   exportName: null },
  { key: 'station-bar',       path: 'src/ui/station/screens/bar.js',        exportName: null },
  { key: 'station-ledger',    path: 'src/ui/station/screens/ledger.js',     exportName: null },
  { key: 'station-dock',      path: 'src/ui/station/dock.js',               exportName: null },
];

// Repo-root-relative source path for an entry (legacy `file` entries resolve into SCREENS_DIR).
function srcPath(s) { return s.path || join(SCREENS_DIR, s.file); }

// Emoji-proper ranges. Deliberately EXCLUDES geometric shapes (U+25xx ▲▼—) and the
// arrows block (U+2190-21FF) — those are legit non-emoji UI glyphs (market role marks, list carets).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

let pass = 0;
let fail = 0;
const fails = [];
function ok(msg) { pass++; console.log('ok   ' + msg); }
function bad(msg) { fail++; fails.push(msg); console.log('FAIL ' + msg); }
function want(cond, msg) { if (cond) ok(msg); else bad(msg); }

// Strip comments while keeping string/template CSS intact. The [^:] guard leaves http:// URLs alone.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const cache = new Map();
function read(path) {
  if (!cache.has(path)) {
    const raw = readFileSync(join(ROOT, path), 'utf8');
    cache.set(path, { raw, scan: stripComments(raw) });
  }
  return cache.get(path);
}

// ── 1. No unauthorized idle animation: no free-running (infinite) CSS animation that is not gated ─
//    by a state class (.is-*, .active, .trace-run, .sel, .done). Motion means state change (§1).
for (const s of SCREENS) {
  const src = read(srcPath(s)).scan;
  const offenders = [];
  // Find each CSS rule-ish chunk that declares an infinite animation and check its selector prefix.
  const re = /([.#][^{};\n]{0,120}?)\{[^{}]*animation[^;{}]*\binfinite\b[^{}]*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1];
    const gated = /(\.is-|\.active|\.trace-run|\.sel\b|--done|\.flowing|\.on\b|\.open\b|:hover|:focus|:active)/.test(selector);
    if (!gated) offenders.push(`${srcPath(s)}: ${selector.trim().slice(0, 60)}`);
  }
  want(offenders.length === 0, `[1] ${s.key} has no ungated infinite animation (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 2. No active rAF after hide: a screen that owns an rAF loop must cancel it; a screen that ─────
//    activates effects must park them (setActive(false)) on hide.
for (const s of SCREENS) {
  const src = read(srcPath(s)).scan;
  // Only an ASSIGNED handle (x = / this._raf = requestAnimationFrame) is a cancellable LOOP that must
  // be parked on hide. A one-shot deferred rAF — requestAnimationFrame(fn) whose id is not stored,
  // e.g. shipyard's "re-fit the 3D stage on the next frame" — self-completes and needs no cancel.
  const ownsRafLoop = /(=|:)\s*requestAnimationFrame\s*\(/.test(src);
  const usesEffects = /_setEffectsActive\s*\(\s*true|\.setActive\s*\(\s*true|createRouteBeam|createCircularGauge|createRippleField|createFlickerGrid|createGlyphMatrix|createMorphLabel|createDockRail/.test(src);
  if (!ownsRafLoop && !usesEffects) { ok(`[2] ${s.key} owns no rAF loop / effect (nothing to park)`); continue; }
  const cancelsRaf = !ownsRafLoop || /cancelAnimationFrame\s*\(/.test(src);
  const parksEffects = !usesEffects || /_setEffectsActive\s*\(\s*false|\.setActive\s*\(\s*false/.test(src);
  want(cancelsRaf && parksEffects,
    `[2] ${s.key} parks its rAF/effects on hide (cancelAnimationFrame=${cancelsRaf}, setActive(false)=${parksEffects})`);
}

// ── 3. No duplicate top-center transient text surface (the one-voice floor lives in alerts.js). ──
//    No captured SCREEN may define a centered-fixed transient pill (that would race the arbiter).
for (const s of SCREENS) {
  const src = read(srcPath(s)).scan;
  const offenders = [];
  const re = /([.#][^{};\n]{0,80}?)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sel = m[1]; const body = m[2];
    const centeredFixed = /position\s*:\s*(fixed|absolute)/.test(body) &&
      /(left\s*:\s*50%|translateX\(-50%\)|translate\(-50%)/.test(body) &&
      /top\s*:/.test(body);
    const transient = /(voice|toast|floor|pill|banner|announce)/i.test(sel);
    if (centeredFixed && transient) offenders.push(`${srcPath(s)}: ${sel.trim().slice(0, 50)}`);
  }
  want(offenders.length === 0, `[3] ${s.key} defines no competing top-center transient surface (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 4. Icon-only buttons carry an aria-label (an emoji/glyph button with no text is unlabelled). ──
for (const s of SCREENS) {
  const src = read(srcPath(s)).raw;
  const offenders = [];
  // <button …>EMOJI</button> with no aria-label/aria-labelledby/title in the opening tag.
  const re = /<button\b([^>]*)>\s*([^<]{0,6})<\/button>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1]; const content = m[2];
    if (EMOJI_RE.test(content) && !/aria-label|aria-labelledby|title=/.test(attrs)) {
      offenders.push(`${srcPath(s)}: <button>${content.trim()}</button>`);
    }
  }
  want(offenders.length === 0, `[4] ${s.key} icon-only buttons are labelled (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 5. Reduced-motion disables shimmer/ripple/beam: any screen that defines such an animation ────
//    must also disable it under prefers-reduced-motion / html.sf-reduce-motion. (Effects in
//    src/ui/effects/* already ship this; screens must not introduce an unguarded one.)
for (const s of SCREENS) {
  const src = read(srcPath(s)).scan;
  const definesMotion = /@keyframes\s+[\w-]*(shimmer|ripple|beam|march|flow|pulse|sweep)/i.test(src) ||
    /animation\s*:\s*[^;]*(shimmer|ripple|beam|march|flow|pulse|sweep)/i.test(src);
  if (!definesMotion) { ok(`[5] ${s.key} defines no shimmer/ripple/beam animation (nothing to guard)`); continue; }
  const guarded = /prefers-reduced-motion/.test(src) || /sf-reduce-motion/.test(src);
  want(guarded, `[5] ${s.key} disables its shimmer/ripple/beam under reduced motion`);
}

// ── 6. Import-safety + structural mount/unmount contract (NOT a live mount — see header). ─────────
{
  const seen = new Set();
  for (const s of SCREENS) {
    const modKey = srcPath(s);
    if (seen.has(modKey)) continue;
    seen.add(modKey);
    let mod;
    try {
      mod = await import(new URL(`../${srcPath(s)}`, import.meta.url));
      ok(`[6] ${srcPath(s)} imports without throwing (module scope safe)`);
    } catch (e) {
      bad(`[6] ${srcPath(s)} threw on import: ${String(e && e.message).split('\n')[0]}`);
      continue;
    }
    // Structural: a top-level screen def must expose mount() AND an unmount half (onHide/dispose);
    // a panel module must expose at least one callable builder.
    if (s.exportName) {
      const def = mod[s.exportName];
      const hasMount = def && typeof def.mount === 'function';
      const hasUnmount = def && (typeof def.onHide === 'function' || typeof def.dispose === 'function' || typeof def.onShow === 'function');
      want(hasMount && hasUnmount,
        `[6] ${s.exportName} exposes mount()+onHide/onShow/dispose contract (mount=${hasMount}, unmount=${hasUnmount})`);
    } else {
      const hasFactory = Object.values(mod).some((v) => typeof v === 'function');
      want(hasFactory, `[6] ${srcPath(s)} exposes at least one callable panel builder`);
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
if (fail) {
  console.log(`\ncheck-command-deck-ui FAILED — ${fail} assertion(s):`);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(1);
}
console.log(`\nCommand-Deck UI OK — ${pass} operational assertions green.`);
