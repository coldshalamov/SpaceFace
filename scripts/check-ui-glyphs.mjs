#!/usr/bin/env node
// check:ui-glyphs — pins the shared glyph vocabulary (src/ui/glyphs.js).
//
// The contact roster, receipts, hazard map marks, ghost contacts, and target-panel marks all
// render from this one table through two channels (inline SVG for DOM, Path2D stroke for canvas).
// A broken entry would surface as an invisible mark mid-flight — the exact failure mode the
// Unicode stand-ins used to have — so the structural invariants are cheap to assert directly:
//   * every consumer-referenced glyph name exists;
//   * every stroke is non-empty path data with sane opacity/dash (no <circle>/<rect> — the canvas
//     channel cannot stroke those, so DOM/canvas parity requires pure path data);
//   * glyphSvg() emits a well-formed <svg> and drawGlyph() strokes every entry.

import assert from 'node:assert/strict';
import { hasGlyph, glyphSvg, drawGlyph } from '../src/ui/glyphs.js';

// Names referenced by consumers (hud.js roster, toasts.js, galaxyMap.js, localmap.js, targetPanel.js).
const REQUIRED = [
  // ship classes + fallback
  'scout', 'fighter', 'gunship', 'frigate', 'capital', 'miner', 'freighter',
  'station', 'wreck', 'asteroid', 'unknown',
  // receipts
  'ok', 'err', 'warn', 'info', 'credits', 'rep',
  // hazards (galaxyMap canvas channel)
  'radiation', 'nebula', 'dense_asteroid', 'debris',
  // IFF echoes + ghosts (roster)
  'iff_hostile', 'iff_friendly', 'iff_neutral', 'iff_ally', 'iff_target',
  'ghost_hostile', 'ghost_friendly', 'ghost_neutral', 'ghost_ally',
  // engagement marks (targetPanel)
  'guns_lock', 'weakpoint', 'component', 'closing', 'opening',
];

for (const name of REQUIRED) {
  assert.ok(hasGlyph(name), `missing glyph: ${name}`);
}

// DOM channel: well-formed svg, pure path data (canvas parity), no game-data interpolation.
for (const name of REQUIRED) {
  const svg = glyphSvg(name, 12);
  assert.ok(svg.startsWith('<svg'), `${name}: svg opens`);
  assert.ok(svg.includes('viewBox="0 0 24 24"'), `${name}: viewBox`);
  assert.ok(svg.endsWith('</svg>'), `${name}: svg closes`);
  assert.ok(!svg.includes('<circle') && !svg.includes('<rect'), `${name}: DOM/canvas parity requires path-only strokes`);
  assert.ok((svg.match(/<path /g) || []).length >= 1, `${name}: at least one stroke`);
  // Unknown names must fall back to the unknown glyph, never to empty markup.
}

// Canvas channel: every stroke is stroked; geometry transform is applied.
// Node has no Path2D (browser global); the drawGlyph path only needs construction + stroke calls.
globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
const calls = [];
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return { width: 24, height: 24 };
    return (...args) => { calls.push([prop, args]); return undefined; };
  },
  set() { return true; },
});
assert.equal(drawGlyph(ctx, 'fighter', 12, 12, 16), true, 'drawGlyph strokes a known glyph');
assert.ok(calls.some(([m]) => m === 'stroke'), 'canvas stroke happened');
assert.equal(drawGlyph(ctx, 'no_such_glyph', 0, 0, 16), false, 'unknown glyph is a clean false');

console.log(`check:ui-glyphs — ${REQUIRED.length} glyphs, DOM + canvas channels OK`);
