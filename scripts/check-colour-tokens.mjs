#!/usr/bin/env node
// A colour that has a token must be written as that token.
//
// WHY. The live stylesheets carried 1,313 colour literals holding 955 distinct rgba values against a
// design system that defines 25 named colours with documented meanings and proven contrast ratios.
// The palette was not merely under-used, it was BYPASSED: `#7af7d0` -- which IS `--sf-you` -- was
// hand-typed 16 times at 5 different alphas across 4 files while the token sat in the same file.
//
// That is not a tidiness problem. The token layer is a THEMING layer:
//
//   * `html.sf-high-contrast` remaps --panel / --ink / --panel-edge for accessibility.
//   * `.screen.sf-menu` remaps the whole ramp for the menu's softer look.
//
// An override can only reach a TOKEN. Every hand-typed literal is a place where high-contrast mode
// silently fails to apply and where a theme silently does not take. So this check is an
// accessibility and theming guard, not a style preference.
//
// WHAT IT ALLOWS. A literal that is genuinely a NEW colour is fine -- the repository has plenty of
// legitimate one-off surface tints, and inventing a token for each would be worse. This only fails
// a literal that is within SAFE_DISTANCE of a colour the system has ALREADY NAMED, in the scope
// where the literal appears. That is, by construction, a copy.
//
// SCOPE MATTERS AND IS COMPUTED. `#4ec3e6` is not a stray cyan -- it is the menu scope's own
// `--accent`. Judging it against the ROOT palette would both mis-report it and, if auto-fixed,
// repaint the menu. Each file is therefore resolved against root tokens overridden by whatever
// tokens that file itself defines.

import { readFileSync } from 'node:fs';

const ROOT_TOKENS = {
  '--bg': '#05070d',
  '--panel': '#0b1220',
  '--panel-2': '#111d30',
  '--panel-edge': '#1d3350',
  '--panel-edge-2': '#2b4a72',
  '--ink': '#d3e6ff',
  '--ink-dim': '#84a0c8',
  '--ink-mute': '#5a7aa0',
  '--accent': '#39d0ff',
  '--accent-2': '#7af7d0',
  '--accent-3': '#c08bff',
  '--warn': '#ffb347',
  '--danger': '#ff5470',
  '--good': '#62e08a',
  '--energy': '#ffd84a',
  '--sf-you': '#7af7d0',
  '--sf-foe': '#ff5470',
  '--sf-goal': '#ffb347',
  '--sf-calm': '#84a0c8',
  '--sf-paper': '#d3e6ff',
  '--sf-surface': '#0b1220',
  '--sf-edge': '#1d3350',
};

// Stylesheets the GAME loads. `graphics-lab.css` serves a dev harness page and is deliberately out
// of scope -- gating a lab tool on the product's grammar buys nothing.
const LIVE = [
  'ui.css', 'menu.css', 'intro.css', 'asteroid-ops.css',
  'station-workbench.css', 'station.css', 'station-berth.css', 'commsradial.css',
];

// `accessibility.css` is the override layer itself: its literals are the high-contrast values and
// must stay literal, or the override would resolve to the very token it exists to replace.
const SAFE_DISTANCE = 10;

function hexToRgb(h) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

function parseLiteral(tok) {
  const t = String(tok).toLowerCase().replace(/\s+/g, '');
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (!m) return null;
  const p = m[1].split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
  if (p.length < 3) return null;
  const num = (s) => (s.endsWith('%') ? parseFloat(s) * 2.55 : parseFloat(s));
  const r = num(p[0]); const g = num(p[1]); const b = num(p[2]);
  if (![r, g, b].every(Number.isFinite)) return null;
  let a = 1;
  if (p[3] != null) a = p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
  return { r, g, b, a: Number.isFinite(a) ? a : 1 };
}

export function auditColourTokens(files = LIVE, readFile = (f) => readFileSync(`styles/${f}`, 'utf8')) {
  const findings = [];
  let literals = 0;
  for (const file of files) {
    let src;
    try { src = readFile(file); } catch { continue; }
    const lines = src.split('\n');

    const local = { ...ROOT_TOKENS };
    for (const ln of lines) {
      const m = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;?/.exec(ln);
      if (m && Object.prototype.hasOwnProperty.call(local, m[1])) {
        const v = parseLiteral(m[2]);
        if (v && v.a >= 0.999) {
          local[m[1]] = `#${[v.r, v.g, v.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
        }
      }
    }
    const palette = Object.entries(local).map(([k, v]) => ({ k, ...hexToRgb(v) }));

    lines.forEach((line, idx) => {
      if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) return;  // a token definition owns its literal
      const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const before = line.slice(0, m.index);
        const opens = (before.match(/var\(/g) || []).length;
        const closes = (before.match(/\)/g) || []).length;
        if (opens > closes) continue;                     // a var() fallback is not a bypass
        const c = parseLiteral(m[0]);
        if (!c) continue;
        literals += 1;
        let best = null;
        for (const p of palette) {
          const d = Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b);
          // Several tokens deliberately share a value (--sf-you IS --accent-2). Name the SEMANTIC
          // one: INSTRUMENT_GRAMMAR binds colour by meaning, so that is the name to write.
          const tie = best && Math.abs(d - best.d) < 1e-9;
          if (!best || d < best.d - 1e-9
            || (tie && p.k.startsWith('--sf-') && !best.k.startsWith('--sf-'))) {
            best = { k: p.k, d };
          }
        }
        if (best && best.d <= SAFE_DISTANCE) {
          findings.push({ file, line: idx + 1, literal: m[0], token: best.k, distance: +best.d.toFixed(1) });
        }
      }
    });
  }
  return { literals, findings };
}

const IS_DIRECT = process.argv[1] && process.argv[1].endsWith('check-colour-tokens.mjs');
if (IS_DIRECT) {
  const { literals, findings } = auditColourTokens();
  console.log(`colour literals inspected in live stylesheets: ${literals}`);
  if (findings.length) {
    console.error(`\nFAIL — ${findings.length} literal(s) duplicate a colour the system already names.`);
    console.error('A theme or high-contrast override cannot reach these; they will silently not apply.\n');
    for (const f of findings.slice(0, 40)) {
      console.error(`  styles/${f.file}:${f.line}  ${f.literal}  is  ${f.token}  (distance ${f.distance})`);
    }
    if (findings.length > 40) console.error(`  ... and ${findings.length - 40} more`);
    console.error('\nWrite var(--token), or color-mix(in srgb, var(--token) N%, transparent) when it carries alpha.');
    process.exit(1);
  }
  console.log('Colour tokens OK — no live stylesheet re-types a colour the design system already names.');
}
