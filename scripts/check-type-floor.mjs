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

import { readFileSync } from 'node:fs';

const LIVE = [
  'ui.css', 'menu.css', 'intro.css', 'asteroid-ops.css',
  'station-workbench.css', 'station.css', 'station-berth.css', 'commsradial.css',
];
const FLOOR = 12;

export function auditTypeFloor(files = LIVE, readFile = (f) => readFileSync(`styles/${f}`, 'utf8')) {
  const findings = [];
  let inspected = 0;
  for (const file of files) {
    let src;
    try { src = readFile(file); } catch { continue; }
    src.split('\n').forEach((line, i) => {
      // strip comments so a size quoted in prose is not reported
      const code = line.replace(/\/\*.*?\*\//g, '');
      const longhand = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g;
      let m;
      while ((m = longhand.exec(code)) !== null) {
        inspected += 1;
        const v = parseFloat(m[1]);
        if (v > 0 && v < FLOOR) findings.push({ file, line: i + 1, size: v, how: 'font-size' });
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
  return { inspected, findings };
}

const IS_DIRECT = process.argv[1] && process.argv[1].endsWith('check-type-floor.mjs');
if (IS_DIRECT) {
  const { inspected, findings } = auditTypeFloor();
  console.log(`type sizes inspected in live stylesheets: ${inspected}`);
  if (findings.length) {
    console.error(`\nFAIL — ${findings.length} declaration(s) render below the ${FLOOR}px floor.`);
    console.error('INSTRUMENT_GRAMMAR §3 is binding: nothing renders below 12px, ever.\n');
    for (const f of findings.slice(0, 40)) {
      console.error(`  styles/${f.file}:${f.line}  ${f.size}px  (${f.how})`);
    }
    if (findings.length > 40) console.error(`  ... and ${findings.length - 40} more`);
    process.exit(1);
  }
  console.log(`Type floor OK — nothing in a live stylesheet renders below ${FLOOR}px.`);
}
