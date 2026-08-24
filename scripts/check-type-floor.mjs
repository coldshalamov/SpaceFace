#!/usr/bin/env node
// INSTRUMENT_GRAMMAR §3: "12 px is the floor. Nothing renders below it, ever."
// §12.2 repeats it as a per-screen definition of done.
//
// That rule was binding and completely unenforced. 64 declarations sat below it across four live
// stylesheets when this check was written -- including 8 px and 8.5 px text on the intro screen,
// which is not small, it is unreadable. `check:data-states` reads font sizes but only inside its own
// block, so the rule held on one screen and nowhere else.
//
// Reads the `font:` SHORTHAND as well as `font-size:`. That is not hypothetical: the build map
// records an 11 px keycap shipping inside a block whose own comment claimed a 12 px floor, precisely
// because a previous check scanned only the longhand.
//
// `font-size: 0` is left alone -- it is the deliberate idiom for suppressing a glyph or collapsing
// inline whitespace, not text rendered too small to read.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// CSS-IN-JS COUNTS, AND IT IS WHERE THE PROBLEM ACTUALLY LIVES. Scanning only styles/*.css reported
// 69 violations; the same rule applied to the UI modules found 373 more -- 117 in the station hub,
// 67 in the HUD's own injected block, 60 in the chart. The HUD does not have a stylesheet at all:
// uiRoot.js injects ~500 rules from a template literal. A gate that reads only styles/ is the
// "green check inspects a convenient stand-in" failure this repository has been bitten by before,
// so it reads both.
const JS_ROOTS = ['src/ui'];

const LIVE = [
  'ui.css', 'menu.css', 'intro.css', 'asteroid-ops.css',
  'station-workbench.css', 'station.css', 'station-berth.css', 'commsradial.css',
];
const FLOOR = 12;

// A configured path may be absent only if named here. An empty allowlist means every LIVE
// stylesheet and every JS_ROOTS entry is required; there is no implicit optional file.
const OPTIONAL_ALLOWLIST = Object.freeze([]);

function isOptional(rel) {
  const norm = String(rel).split('\\').join('/');
  return OPTIONAL_ALLOWLIST.some((p) => p === norm || p === path.posix.basename(norm));
}

function infra(file, how) {
  return { file, line: 0, size: 0, how, kind: 'infra' };
}

function walkJs(dir, out, findings) {
  const rel = dir.split(path.sep).join('/');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if (!isOptional(rel)) findings.push(infra(rel, `enumeration failed: ${err.code || err.message}`));
    return out;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    const fullRel = full.split(path.sep).join('/');
    let st;
    try {
      st = statSync(full);
    } catch (err) {
      if (!isOptional(fullRel)) findings.push(infra(fullRel, `stat failed: ${err.code || err.message}`));
      continue;
    }
    if (st.isDirectory()) walkJs(full, out, findings);
    else if (name.endsWith('.js')) out.push(fullRel);
  }
  return out;
}

export function auditTypeFloor(files = null, readFile = null) {
  const findings = [];
  const usingDefaults = files == null;
  const configured = files || LIVE;
  if (configured.length === 0 && (usingDefaults ? JS_ROOTS.length === 0 : true)) {
    findings.push(infra('(config)', 'no configured roots/files to observe'));
  }
  const styleFiles = configured.map((f) => (f.includes('/') ? f : `styles/${f}`));
  const jsFiles = usingDefaults
    ? JS_ROOTS.flatMap((d) => {
        const found = [];
        const before = findings.length;
        walkJs(d, found, findings);
        const rootRel = d.split(path.sep).join('/');
        const rootFailed = findings.slice(before).some((f) => f.file === rootRel);
        if (found.length === 0 && !rootFailed && !isOptional(d)) {
          findings.push(infra(d, 'configured root observed no .js files'));
        }
        return found;
      })
    : [];
  let inspected = 0;
  for (const file of [...styleFiles, ...jsFiles]) {
    let src;
    try {
      src = readFile ? readFile(file) : readFileSync(file, 'utf8');
    } catch (err) {
      if (!isOptional(file) && !isOptional(path.posix.basename(file))) {
        findings.push(infra(file, `read failed: ${err.code || err.message}`));
      }
      continue;
    }
    src.split('\n').forEach((line, i) => {
      // Strip comments so a size quoted in PROSE is not reported. Both forms matter: the modules
      // that document this very bug quote `var(--mono)` in a `//` comment, and reporting those was
      // the first thing the canvas rule did.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      const code = line.replace(/\/\*.*?\*\//g, '');
      const longhand = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g;
      let m;
      while ((m = longhand.exec(code)) !== null) {
        inspected += 1;
        const v = parseFloat(m[1]);
        if (v > 0 && v < FLOOR) findings.push({ file, line: i + 1, size: v, how: 'font-size' });
      }
      // CANVAS FONTS THAT SILENTLY DO NOTHING. Canvas 2D parses `ctx.font` with the CSS font
      // shorthand parser, which does NOT resolve custom properties. `ctx.font = '11px var(--mono)'`
      // is invalid, the assignment is DISCARDED, and the context keeps its previous value --
      // initially `10px sans-serif`. Verified in a live browser, not assumed. So this is a type
      // violation by another route: the text renders at the browser default size, below the floor,
      // in the wrong typeface, and no stylesheet check can see it. Resolve tokens through
      // src/ui/canvasFonts.js instead.
      const canvasVar = /(?:\.font\s*=|font\s*:)\s*[`'"][^`'"]*var\(--/g;
      while ((m = canvasVar.exec(code)) !== null) {
        findings.push({ file, line: i + 1, size: 'var()', how: 'canvas font shorthand cannot resolve a CSS variable' });
      }

      // `font: <style> <weight> <size>px/<lh> <family>` -- the size is the px value before the family
      const shorthand = /(^|[;{]|\s)font:\s*[^;}]*?([0-9]+(?:\.[0-9]+)?)px/g;
      while ((m = shorthand.exec(code)) !== null) {
        inspected += 1;
        const v = parseFloat(m[2]);
        if (v > 0 && v < FLOOR) findings.push({ file, line: i + 1, size: v, how: 'font shorthand' });
      }
    });
  }
  if (inspected === 0) {
    findings.push(infra('(coverage)', 'zero inspected declarations'));
  }
  return { inspected, findings };
}

const IS_DIRECT = process.argv[1] && process.argv[1].endsWith('check-type-floor.mjs');
if (IS_DIRECT) {
  const { inspected, findings } = auditTypeFloor();
  console.log(`type sizes inspected in live stylesheets: ${inspected}`);
  if (findings.length) {
    const infraHits = findings.filter((f) => f.kind === 'infra');
    const typeHits = findings.filter((f) => f.kind !== 'infra');
    if (infraHits.length) {
      console.error(`\nFAIL — ${infraHits.length} coverage/read problem(s); every configured live file must be observed.`);
      for (const f of infraHits.slice(0, 40)) {
        console.error(`  ${f.file}  (${f.how})`);
      }
      if (infraHits.length > 40) console.error(`  ... and ${infraHits.length - 40} more`);
    }
    if (typeHits.length) {
      console.error(`\nFAIL — ${typeHits.length} declaration(s) render below the ${FLOOR}px floor.`);
      console.error('INSTRUMENT_GRAMMAR §3 is binding: nothing renders below 12px, ever.\n');
      for (const f of typeHits.slice(0, 40)) {
        const size = f.size === 'var()' ? 'var()' : `${f.size}px`;
        console.error(`  ${f.file}:${f.line}  ${size}  (${f.how})`);
      }
      if (typeHits.length > 40) console.error(`  ... and ${typeHits.length - 40} more`);
    }
    process.exit(1);
  }
  console.log(`Type floor OK — nothing in a live stylesheet renders below ${FLOOR}px.`);
}
