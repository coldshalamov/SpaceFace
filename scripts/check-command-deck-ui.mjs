#!/usr/bin/env node
// check-command-deck-ui.mjs — Command-Deck UI contract lint. REJECTS GENERIC MENU WORK, enforcing
// design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md (§0 thesis "every major screen is a
// PLAYABLE INSTRUMENT, not a document", §2 per-screen centerpiece plan, §5 anti-generic checklist).
//
// STATIC source analysis — deterministic, zero DOM/WebGL, zero network. Live mount/unmount, tab
// navigation, and per-screen rendering are owned by the Playwright *-runtime checks
// (check-station-tab-navigation-runtime, check-mission-accept-handoff-runtime, …). Here assertion 12
// is IMPORT-SAFETY + the structural mount/unmount contract: what stays honestly green even while a
// panel's runtime onShow is mid-refactor (a broken onShow is a runtime bug the *-runtime checks own,
// not a module-load bug). We NEVER invoke mount() here — several screens need a live ctx or a WebGL
// context (shipyard's engineering stage) that a Node harness cannot supply.
//
// Coverage model (the honest middle — a real guardrail that passes on today's tree):
//   DONE     — screens that already carry a real instrument centerpiece. FULL contract enforced:
//              a data-centerpiece of a valid type on a genuine non-generic node (canvas/svg/effect).
//   PENDING  — type-screens whose bespoke centerpiece is not built yet. Hygiene rules (3-12) run;
//              the list is SHRINK-ONLY — the moment a pending screen declares its centerpiece the
//              check FAILS and tells you to promote it to DONE, so coverage can only grow.
//   CAPTURE  — surfaces with no centerpiece slug in the vocabulary (main menu title tableau,
//              outfitting). Hygiene rules run; no centerpiece required.
// Teeth: no new generic screen can appear, no DONE screen can regress, everyone obeys hygiene.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCREENS_DIR = 'src/ui/screens';

// ── The closed centerpiece vocabulary (assertion 2). One instrument per major screen. ────────────
const CENTERPIECE_TYPES = Object.freeze([
  'map-command-table',
  'station-service-console',
  'cargo-hold-schematic',
  'trade-intel-scope',
  'ship-hangar-stage',
  'contract-route-board',
  'fleet-ops-table',
  'faction-territory-board',
  'anomaly-glyph-console',
]);
const TYPE_SET = new Set(CENTERPIECE_TYPES);

// ── The captured surfaces (assertion "CAPTURE" list). file is relative to SCREENS_DIR. ───────────
// exportName: the top-level screen def to structurally verify (mount/onHide). Panels (market /
// outfitting / shipyard / factions are stationHub children) have no top-level def → null.
const SCREENS = [
  { key: 'main-menu',   file: 'mainMenu.js',        exportName: 'mainMenuScreen',  status: 'capture', type: null,                        rail: true },
  { key: 'galaxy-map',  file: 'starmap.js',         exportName: 'starmapScreen',   status: 'done',    type: 'map-command-table',         rail: false },
  { key: 'station-hub', file: 'stationHub.js',      exportName: 'stationHub',      status: 'done',    type: 'station-service-console',   rail: true },
  { key: 'hold',        file: 'stationHub.js',      exportName: null,              status: 'pending', type: 'cargo-hold-schematic',      rail: true },
  { key: 'market',      file: 'market.js',          exportName: null,              status: 'done',    type: 'trade-intel-scope',         rail: false },
  { key: 'outfitting',  file: 'outfitting.js',      exportName: null,              status: 'capture', type: null,                        rail: false },
  { key: 'shipyard',    file: 'shipyard.js',        exportName: null,              status: 'pending', type: 'ship-hangar-stage',         rail: false },
  { key: 'missions',    file: 'stationHub.js',      exportName: null,              status: 'done',    type: 'contract-route-board',      rail: true },
  { key: 'automation',  file: 'automationPanel.js', exportName: 'automationScreen', status: 'pending', type: 'fleet-ops-table',          rail: true },
  { key: 'factions',    file: 'factions.js',        exportName: null,              status: 'pending', type: 'faction-territory-board',   rail: false },
  { key: 'anomaly',     file: 'codex.js',           exportName: 'codexScreen',     status: 'pending', type: 'anomaly-glyph-console',     rail: false },
];

// Real-instrument signals (assertion 4): a node that is NOT a card/tab/table — a canvas, an SVG the
// screen draws into, a getContext handle, a registered command-deck effect, or an sf-fx-* effect class.
const INSTRUMENT_RE = /<canvas|createElementNS|\.getContext\(|createRouteBeam|createCircularGauge|createRippleField|createMorphLabel|createFlickerGrid|createGlyphMatrix|createHexPattern|createDockRail|createSupplyTree|sf-fx-|drawSparkline/;

// Emoji-proper ranges (assertion 3/10). Deliberately EXCLUDES geometric shapes (U+25xx ▲▼—) and the
// arrows block (U+2190-21FF) — those are legit non-emoji UI glyphs (market role marks, list carets).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const RAIL_MARKER = /(st-rail|st-tab|sf-rail|au-tab|au-rail|primary-rail|command-bar|role="tab"|data-tab=)/;

let pass = 0;
let fail = 0;
const fails = [];
function ok(msg) { pass++; console.log('ok   ' + msg); }
function bad(msg) { fail++; fails.push(msg); console.log('FAIL ' + msg); }
function want(cond, msg) { if (cond) ok(msg); else bad(msg); }

// Strip comments so prose ("no backdrop-filter", "// emoji…") can't trip the source bans, while
// keeping string/template CSS intact. The [^:] guard leaves http:// URLs alone. (check-ui-effects pattern.)
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const cache = new Map();
function read(file) {
  if (!cache.has(file)) {
    const raw = readFileSync(join(ROOT, SCREENS_DIR, file), 'utf8');
    cache.set(file, { raw, scan: stripComments(raw) });
  }
  return cache.get(file);
}

// A screen may declare its centerpiece either as a template/HTML attribute (data-centerpiece="TYPE")
// or, for a createElement-built node, via setAttribute('data-centerpiece','TYPE'). Accept both idioms.
function centerpieceDecls(src) {
  const types = [];
  let m;
  const attrRe = /data-centerpiece=["']([^"']*)["']/g;
  while ((m = attrRe.exec(src))) types.push(m[1]);
  const setRe = /setAttribute\(\s*["']data-centerpiece["']\s*,\s*["']([^"']*)["']\s*\)/g;
  while ((m = setRe.exec(src))) types.push(m[1]);
  return types;
}
function declaresCenterpiece(src, type) { return centerpieceDecls(src).includes(type); }

// ── 0. Coverage report (loud, per the plan — PENDING must be visible, never silently swallowed). ──
const byStatus = { done: [], pending: [], capture: [] };
for (const s of SCREENS) byStatus[s.status].push(s.key + (s.type ? ' → ' + s.type : ''));
console.log('── Command-Deck UI coverage ─────────────────────────────────────────');
console.log('  DONE (full centerpiece contract enforced): ' + byStatus.done.join(', '));
console.log('  PENDING centerpiece (shrink-only, hygiene enforced): ' + byStatus.pending.join(', '));
console.log('  CAPTURE-only (no centerpiece slug; hygiene enforced): ' + byStatus.capture.join(', '));
console.log('─────────────────────────────────────────────────────────────────────');

// ── 1 & 2. Every DONE screen declares a data-centerpiece of a valid type; PENDING is shrink-only. ─
for (const s of SCREENS) {
  if (s.status === 'done') {
    want(declaresCenterpiece(read(s.file).raw, s.type),
      `[1+2] ${s.key} declares data-centerpiece="${s.type}" (${s.file})`);
  } else if (s.status === 'pending') {
    // Shrink-only: a pending screen must NOT yet declare its centerpiece. If it does, it is built —
    // promote it to DONE so the full contract is enforced. Coverage can only grow.
    want(!declaresCenterpiece(read(s.file).raw, s.type),
      `[shrink-only] ${s.key} is still PENDING — promote to DONE now that it declares data-centerpiece="${s.type}"`);
  }
}

// Assertion 2 (global): every data-centerpiece anywhere in a captured file uses a known slug — no
// rogue vocabulary can leak in. (Guards against typos and off-plan centerpieces.)
{
  const seenFiles = new Set();
  const rogue = [];
  for (const s of SCREENS) {
    if (seenFiles.has(s.file)) continue;
    seenFiles.add(s.file);
    for (const t of centerpieceDecls(read(s.file).raw)) { if (!TYPE_SET.has(t)) rogue.push(`${s.file}:${t}`); }
  }
  want(rogue.length === 0, `[2] every data-centerpiece uses a vocabulary slug (rogue: ${rogue.join(', ') || 'none'})`);
}

// ── 3. No emoji in a primary nav rail (glyphs must be SVG/text, not emoji). ───────────────────────
for (const s of SCREENS) {
  if (!s.rail) continue;
  const lines = read(s.file).raw.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (RAIL_MARKER.test(line) && EMOJI_RE.test(line)) offenders.push(`${s.file}:${i + 1}`);
  });
  want(offenders.length === 0, `[3] ${s.key} primary rail is emoji-free (offenders: ${offenders.join(', ') || 'none'})`);
}

// ── 4. No DONE screen is only tabs/cards/tables — it carries a real instrument node. ──────────────
for (const s of SCREENS) {
  if (s.status !== 'done') continue;
  want(INSTRUMENT_RE.test(read(s.file).raw),
    `[4] ${s.key} has a real centerpiece node (canvas/svg/effect), not only cards/tabs/tables`);
}

// ── 5. No unauthorized idle animation: no free-running (infinite) CSS animation that is not gated ─
//    by a state class (.is-*, .active, .trace-run, .sel, .done). Motion means state change (§1).
for (const s of SCREENS) {
  const src = read(s.file).scan;
  const offenders = [];
  // Find each CSS rule-ish chunk that declares an infinite animation and check its selector prefix.
  const re = /([.#][^{};\n]{0,120}?)\{[^{}]*animation[^;{}]*\binfinite\b[^{}]*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1];
    const gated = /(\.is-|\.active|\.trace-run|\.sel\b|--done|\.flowing|\.on\b|\.open\b|:hover|:focus|:active)/.test(selector);
    if (!gated) offenders.push(`${s.file}: ${selector.trim().slice(0, 60)}`);
  }
  want(offenders.length === 0, `[5] ${s.key} has no ungated infinite animation (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 6. No active rAF after hide: a screen that owns an rAF loop must cancel it; a screen that ─────
//    activates effects must park them (setActive(false)) on hide.
for (const s of SCREENS) {
  const src = read(s.file).scan;
  // Only an ASSIGNED handle (x = / this._raf = requestAnimationFrame) is a cancellable LOOP that must
  // be parked on hide. A one-shot deferred rAF — requestAnimationFrame(fn) whose id is not stored,
  // e.g. shipyard's "re-fit the 3D stage on the next frame" — self-completes and needs no cancel.
  const ownsRafLoop = /(=|:)\s*requestAnimationFrame\s*\(/.test(src);
  const usesEffects = /_setEffectsActive\s*\(\s*true|\.setActive\s*\(\s*true|createRouteBeam|createCircularGauge|createRippleField|createFlickerGrid|createGlyphMatrix|createMorphLabel|createDockRail/.test(src);
  if (!ownsRafLoop && !usesEffects) { ok(`[6] ${s.key} owns no rAF loop / effect (nothing to park)`); continue; }
  const cancelsRaf = !ownsRafLoop || /cancelAnimationFrame\s*\(/.test(src);
  const parksEffects = !usesEffects || /_setEffectsActive\s*\(\s*false|\.setActive\s*\(\s*false/.test(src);
  want(cancelsRaf && parksEffects,
    `[6] ${s.key} parks its rAF/effects on hide (cancelAnimationFrame=${cancelsRaf}, setActive(false)=${parksEffects})`);
}

// ── 7. No duplicate top-center transient text surface (the one-voice floor lives in alerts.js). ──
//    No captured SCREEN may define a centered-fixed transient pill (that would race the arbiter).
for (const s of SCREENS) {
  const src = read(s.file).scan;
  const offenders = [];
  const re = /([.#][^{};\n]{0,80}?)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sel = m[1]; const body = m[2];
    const centeredFixed = /position\s*:\s*(fixed|absolute)/.test(body) &&
      /(left\s*:\s*50%|translateX\(-50%\)|translate\(-50%)/.test(body) &&
      /top\s*:/.test(body);
    const transient = /(voice|toast|floor|pill|banner|announce)/i.test(sel);
    if (centeredFixed && transient) offenders.push(`${s.file}: ${sel.trim().slice(0, 50)}`);
  }
  want(offenders.length === 0, `[7] ${s.key} defines no competing top-center transient surface (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 8. No backdrop-filter (composites over the live WebGL canvas every frame; §0 hard wall). ─────
for (const s of SCREENS) {
  want(!/backdrop-filter/.test(read(s.file).scan), `[8] ${s.key} uses no backdrop-filter`);
}

// ── 9. No unauthorized colors on the centerpiece markup (scoped): a data-centerpiece element must ─
//    not carry an inline raw-hex color, and any [data-centerpiece]-scoped CSS rule stays token-only.
//    (check-wcag-contrast owns the rest of screen colour; we only police what we add.)
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
for (const s of SCREENS) {
  if (s.status !== 'done') continue;
  const src = read(s.file).scan;
  const offenders = [];
  // Inline style on the same tag as data-centerpiece.
  const tagRe = /<[^>]*data-centerpiece="[^"]*"[^>]*>/g;
  let m;
  while ((m = tagRe.exec(src))) { if (/style="[^"]*#[0-9a-fA-F]{3,8}/.test(m[0])) offenders.push(`${s.file}: inline hex on centerpiece tag`); }
  // Template-built tag: a data-centerpiece attribute concatenated with an inline hex style nearby.
  const jsTagRe = /data-centerpiece=\\?["'][^"']*\\?["'][^\n]*style=\\?["'][^"'\n]*#[0-9a-fA-F]{3,8}/g;
  while ((m = jsTagRe.exec(src))) offenders.push(`${s.file}: inline hex on templated centerpiece tag`);
  // [data-centerpiece]-scoped CSS rule must be token-only.
  const cssRe = /\[data-centerpiece[^\]]*\][^{]*\{([^{}]*)\}/g;
  while ((m = cssRe.exec(src))) { if (HEX_RE.test(m[1])) offenders.push(`${s.file}: hex in [data-centerpiece] CSS`); }
  want(offenders.length === 0, `[9] ${s.key} centerpiece markup is token-only (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 10. Icon-only buttons carry an aria-label (an emoji/glyph button with no text is unlabelled). ─
for (const s of SCREENS) {
  const src = read(s.file).raw;
  const offenders = [];
  // <button …>EMOJI</button> with no aria-label/aria-labelledby/title in the opening tag.
  const re = /<button\b([^>]*)>\s*([^<]{0,6})<\/button>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1]; const content = m[2];
    if (EMOJI_RE.test(content) && !/aria-label|aria-labelledby|title=/.test(attrs)) {
      offenders.push(`${s.file}: <button>${content.trim()}</button>`);
    }
  }
  want(offenders.length === 0, `[10] ${s.key} icon-only buttons are labelled (offenders: ${offenders.join(' | ') || 'none'})`);
}

// ── 11. Reduced-motion disables shimmer/ripple/beam: any screen that defines such an animation ───
//    must also disable it under prefers-reduced-motion / html.sf-reduce-motion. (Effects in
//    src/ui/effects/* already ship this; screens must not introduce an unguarded one.)
for (const s of SCREENS) {
  const src = read(s.file).scan;
  const definesMotion = /@keyframes\s+[\w-]*(shimmer|ripple|beam|march|flow|pulse|sweep)/i.test(src) ||
    /animation\s*:\s*[^;]*(shimmer|ripple|beam|march|flow|pulse|sweep)/i.test(src);
  if (!definesMotion) { ok(`[11] ${s.key} defines no shimmer/ripple/beam animation (nothing to guard)`); continue; }
  const guarded = /prefers-reduced-motion/.test(src) || /sf-reduce-motion/.test(src);
  want(guarded, `[11] ${s.key} disables its shimmer/ripple/beam under reduced motion`);
}

// ── 12. Import-safety + structural mount/unmount contract (NOT a live mount — see header). ────────
{
  const seen = new Set();
  for (const s of SCREENS) {
    const modKey = s.file;
    if (seen.has(modKey)) continue;
    seen.add(modKey);
    let mod;
    try {
      mod = await import(new URL(`../${SCREENS_DIR}/${s.file}`, import.meta.url));
      ok(`[12] ${s.file} imports without throwing (module scope safe)`);
    } catch (e) {
      bad(`[12] ${s.file} threw on import: ${String(e && e.message).split('\n')[0]}`);
      continue;
    }
    // Structural: a top-level screen def must expose mount() AND an unmount half (onHide/dispose);
    // a panel module must expose at least one callable builder.
    if (s.exportName) {
      const def = mod[s.exportName];
      const hasMount = def && typeof def.mount === 'function';
      const hasUnmount = def && (typeof def.onHide === 'function' || typeof def.dispose === 'function' || typeof def.onShow === 'function');
      want(hasMount && hasUnmount,
        `[12] ${s.exportName} exposes mount()+onHide/onShow/dispose contract (mount=${hasMount}, unmount=${hasUnmount})`);
    } else {
      const hasFactory = Object.values(mod).some((v) => typeof v === 'function');
      want(hasFactory, `[12] ${s.file} exposes at least one callable panel builder`);
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
console.log(`\nCommand-Deck UI OK — ${pass} assertions green. Generic menu work rejected; centerpiece contract + hygiene enforced.`);
