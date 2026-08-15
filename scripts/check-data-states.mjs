#!/usr/bin/env node
// check-data-states.mjs — J3 (CANONICAL_BUILD_MAP §11.12): the four required data states.
//
// "A correct-but-blank screen reads as broken." Every pane must be able to render EMPTY / LOADING /
// ERROR / DENIED, and each state must name WHAT WOULD FILL IT and carry a VERB.
//
// This check exists because the failure mode is silent. A pane rendering nothing is, by definition,
// not something a screenshot diff flags as broken, and no existing check inspects whether a state
// block offers the player a way out. So the contract is asserted at the two places it can be:
//
//   A. The primitive still ENFORCES its own required arguments. If `verb` ever becomes optional,
//      every caller drops it and this decays into `.sf-empty` (a centred italic string that names
//      nothing and does nothing) with more ceremony.
//   B. Every CALL SITE passes one. A primitive that enforces a rule nobody calls proves nothing.
//
// Plus the two rules the repo has already been bitten by:
//   C. The LOADING sweep is REMOVED, not hidden. `.sx-sw__acquiring` runs `animation: … infinite`
//      and only sets visibility:hidden when done; check:ui-frame-sleep inspects rAF and cannot see
//      a compositor-side keyframe. In a shared primitive that defect multiplies across every pane.
//   D. Class names and colour tokens obey the grammar: no `pulse|blink|flash` (sf-reduce-flash
//      blanket-kills [class*=…] animation), no `panel|card|menu|modal` on gradient-carrying nodes
//      (forced-colors strips background-image/box-shadow), and never `--accent`, which grammar §4
//      leaves deliberately roleless.
//
// Run: node scripts/check-data-states.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const notes = [];

function fail(rule, detail) { failures.push(`${rule}: ${detail}`); }
function read(rel) { return readFileSync(join(ROOT, rel), 'utf8'); }

/** Brace-balanced body of the first at-rule matching `re`, or '' when absent. */
function atRuleBody(css, re) {
  const at = css.search(re);
  if (at < 0) return '';
  let i = css.indexOf('{', at);
  if (i < 0) return '';
  let depth = 0;
  const start = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  return '';
}

// ── A. the primitive enforces its own contract ────────────────────────────────────────────────
const PRIM = 'src/ui/uiPrimitives.js';
const prim = read(PRIM);

const REQUIRED_THROWS = [
  ['headline', "`headline` is required"],
  ['fills', '`fills` is required'],
  ['verb', '`verb` is required'],
];
for (const [arg, needle] of REQUIRED_THROWS) {
  if (!prim.includes(needle)) {
    fail('A/required-arg', `${PRIM} no longer throws on a missing \`${arg}\` — the four-state contract is unenforced`);
  }
}
for (const fn of ['export function dataState(', 'export function dataStateHtml(', 'export function mountDataState(', 'export function settleDataState(']) {
  if (!prim.includes(fn)) fail('A/api', `${PRIM} is missing ${fn.replace('export function ', '')})`);
}
for (const kind of ['empty', 'loading', 'error', 'denied']) {
  if (!new RegExp(`^\\s*${kind}:`, 'm').test(prim)) fail('A/kinds', `DATA_STATES is missing the "${kind}" state`);
}
// The string form must refuse a listener it cannot serialize rather than shipping a dead button.
if (!prim.includes('cannot be serialized')) {
  fail('A/serialize', `${PRIM}: dataStateHtml no longer rejects verb.onActivate — a dropped listener ships an inert verb`);
}

// ── B. every call site passes a verb ──────────────────────────────────────────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (name.endsWith('.js')) yield p;
  }
}

// Match a dataState/dataStateHtml/mountDataState call and capture through its balanced arg list.
function callSites(src) {
  const out = [];
  const re = /\b(dataStateHtml|mountDataState|dataState)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out.push({ fn: m[1], args: src.slice(re.lastIndex, i - 1), index: m.index });
  }
  return out;
}

let siteCount = 0;
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (rel === PRIM) continue;
  const src = readFileSync(abs, 'utf8');
  if (!/\bdataState|mountDataState/.test(src)) continue;
  for (const site of callSites(src)) {
    siteCount++;
    const line = src.slice(0, site.index).split('\n').length;
    if (!/\bverb\s*:/.test(site.args)) {
      fail('B/verb', `${rel}:${line} ${site.fn}() has no \`verb\` — a state the player can only stare at`);
    }
    if (!/\bfills\s*:/.test(site.args)) {
      fail('B/fills', `${rel}:${line} ${site.fn}() has no \`fills\` — it does not name what would fill the pane`);
    }
    if (site.fn === 'dataStateHtml' && !/\baction\s*:/.test(site.args)) {
      fail('B/action', `${rel}:${line} dataStateHtml() verb needs \`action\` — a listener cannot survive innerHTML`);
    }
  }
}
if (siteCount === 0) {
  fail('B/adoption', 'no pane calls the data-state primitive — an unadopted primitive proves nothing');
}
notes.push(`${siteCount} data-state call site${siteCount === 1 ? '' : 's'} checked`);

// ── C. the LOADING sweep is removed, not hidden ───────────────────────────────────────────────
if (!/host\.textContent\s*=\s*''/.test(prim)) {
  fail('C/sweep', `${PRIM}: mountDataState no longer clears its host — a hidden sweep keeps running on the compositor`);
}
if (!/parentNode\.removeChild/.test(prim)) {
  fail('C/sweep', `${PRIM}: settleDataState no longer detaches state nodes (hiding is not stopping)`);
}

// ── D. grammar: class names, colour roles, and the two a11y modes ─────────────────────────────
const CSS = 'styles/ui.css';
const css = read(CSS);
const blockStart = css.indexOf('/* 13 ─ sf-state');
if (blockStart < 0) {
  fail('D/css', `${CSS} has no sf-state block (section 13)`);
} else {
  const block = css.slice(blockStart);
  for (const banned of ['pulse', 'blink', 'flash']) {
    // Only class NAMES matter — sf-reduce-flash matches [class*="…"].
    if (new RegExp(`\\.[\\w-]*${banned}[\\w-]*`, 'i').test(block)) {
      fail('D/naming', `${CSS} sf-state block has a class containing "${banned}" — sf-reduce-flash blanket-kills its animation`);
    }
  }
  for (const banned of ['panel', 'card', 'menu', 'modal']) {
    if (new RegExp(`\\.sf-state[\\w-]*${banned}`, 'i').test(block)) {
      fail('D/naming', `${CSS} sf-state block has a class containing "${banned}" — forced-colors strips its gradient/shadow`);
    }
  }
  if (/var\(--accent[,)]/.test(block)) {
    fail('D/colour', `${CSS} sf-state block uses --accent, which grammar §4 assigns NO role and bans on new surfaces`);
  }
  // Match the AT-RULE, not the word. Substring-matching `forced-colors` here passed against a
  // COMMENT that merely mentioned it while the @media rule was gone — the same "check inspected a
  // convenient stand-in" failure the build map documents four times (§11.12 J10). Comments are
  // stripped first so prose can never satisfy a rule.
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');
  if (!/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(rules)) {
    fail('D/a11y', `${CSS} sf-state block has no @media (prefers-reduced-motion: reduce) rule`);
  }
  if (!/@media\s*\(\s*forced-colors:\s*active\s*\)/.test(rules)) {
    fail('D/a11y', `${CSS} sf-state block has no @media (forced-colors: active) rule (gradients strip to blank)`);
  }
  // The reduced-motion branch must actually STOP the sweep, not merely exist. Read its
  // brace-balanced body — a fixed-size window spills into the adjacent forced-colors block, whose
  // own `animation: none` then satisfies the rule for it. (Caught by negative test, not by reading.)
  if (!/animation:\s*none/.test(atRuleBody(rules, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/))) {
    fail('D/a11y', `${CSS} sf-state reduced-motion branch does not set animation:none on the sweep`);
  }
  if (!/animation:\s*none/.test(atRuleBody(rules, /@media\s*\(\s*forced-colors:\s*active\s*\)/))) {
    fail('D/a11y', `${CSS} sf-state forced-colors branch does not set animation:none on the sweep`);
  }
  // 12px type floor, per the THE SHIP polish pass.
  for (const m of block.matchAll(/font-size:\s*(\d+)px/g)) {
    if (Number(m[1]) < 12) fail('D/type', `${CSS} sf-state block sets font-size:${m[1]}px — below the 12px floor`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('\ncheck:data-states FAILED');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('check:data-states OK — four states enforced, verbs present, sweep detaches, grammar clean');
