// test/loading-intro-grade.test.mjs
//
// Ghost-field grade contract for the loading visualizer (2026-09): the five
// authored figures stay half-buried in the signal swirl — a pseudo-abstract
// phosphor visualizer with a barely-visible horror/cyberpunk cast — rather
// than reading as clean illustration plates.
//
// What this pins, and why it is shaped this way:
//  - The tableau factory's svg() output is its public, deterministic, Node-
//    runnable surface: stroke counts, the alpha envelope, the curl-formation
//    bbox spread, sustained motion, reduced-motion stability, and the dark
//    grade are all asserted as numbers, not screenshots.
//  - The GL composite constants have no other Node-observable seam (they run
//    inside the worker/GL hosts), so they are pinned as source anchors in the
//    installer's own style. A deliberate re-grade updates these pins.
//  - Runtime proof lives outside this file: scripts/loading-signal-tableaux-
//    proof.html imports the actual intro host, and this grade was reviewed in
//    headless Edge (all five acts, reduced motion, forced 2D fallback) before
//    these bounds were set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSignalTableaux } from '../src/ui/loadingSignalTableaux.js';

const ACT_SECONDS = 6.5;
const BRIGHTS = ['#8fd8c8', '#86cbc9', '#c9c4ea', '#c7a07a', '#adaadd'];

function parseSvg(svg) {
  const paths = [...svg.matchAll(/<path d="([^"]+)" fill="([^"]+)" stroke="([^"]+)" stroke-width="[^"]+" opacity="([^"]+)"/g)]
    .map((m) => ({ d: m[1], fill: m[2], stroke: m[3], opacity: Number(m[4]) }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let finite = true;
  for (const p of paths) {
    const nums = p.d.match(/-?\d+\.?\d*/g).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i], y = nums[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) { finite = false; continue; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const meanOpacity = paths.reduce((a, p) => a + p.opacity, 0) / Math.max(1, paths.length);
  return { paths, meanOpacity, finite, area: (maxX - minX) * (maxY - minY) };
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

test('every act emits rich, finite, ghost-graded linework', () => {
  const factory = createSignalTableaux({});
  for (let act = 0; act < 5; act++) {
    const svg = factory.svg({ act, time: act * ACT_SECONDS + 3.25 });
    assert.ok(svg.includes('viewBox="0 0 1440 900"'), `act ${act}: plate size preserved`);
    const m = parseSvg(svg);
    assert.ok(m.paths.length >= 90, `act ${act}: ${m.paths.length} strokes, expected a full scene`);
    assert.ok(m.finite, `act ${act}: all coordinates finite`);
    // The envelope modulates: never flat-opaque plates, never invisible art.
    // Measured mid-act means: 0.37–0.71 across the five scenes.
    assert.ok(m.meanOpacity > 0.2 && m.meanOpacity < 0.78,
      `act ${act}: mean opacity ${m.meanOpacity.toFixed(3)} outside the ghost band`);
    // The dark grade: each act's bright phosphor tone is present by exact hex.
    const strokes = new Set(m.paths.map((p) => p.stroke));
    assert.ok(strokes.has(BRIGHTS[act]), `act ${act}: bright tone ${BRIGHTS[act]} missing`);
    // Fills are blood-black silhouettes, never paper.
    for (const p of m.paths) {
      if (p.fill === 'none') continue;
      assert.ok(luminance(p.fill) < 0.15, `act ${act}: fill ${p.fill} too hot for the grade`);
    }
  }
});

test('figures form from a wide curl and dissolve back into it', () => {
  const factory = createSignalTableaux({});
  for (let act = 0; act < 5; act++) {
    const t0 = act * ACT_SECONDS;
    const mid = parseSvg(factory.svg({ act, time: t0 + 3.25 }));
    const form = parseSvg(factory.svg({ act, time: t0 + ACT_SECONDS * 0.08 }));
    const dis = parseSvg(factory.svg({ act, time: t0 + ACT_SECONDS * 0.94 }));
    // Measured: formation 2.78–4.26x, dissolution 2.24–3.87x the mid-act bbox.
    assert.ok(form.area >= mid.area * 2.2, `act ${act}: formation spread ${form.area.toFixed(0)} too tight`);
    assert.ok(dis.area >= mid.area * 1.9, `act ${act}: dissolution spread ${dis.area.toFixed(0)} too tight`);
  }
});

test('figures stay animated, and reduced motion holds them fixed', () => {
  const factory = createSignalTableaux({});
  for (let act = 0; act < 5; act++) {
    const t0 = act * ACT_SECONDS;
    const a = factory.svg({ act, time: t0 + 3.1 });
    const b = factory.svg({ act, time: t0 + 3.6 });
    assert.notEqual(a, b, `act ${act}: mid-act figure must keep moving`);
    const r1 = factory.svg({ act, time: t0 + 1.0, reduced: true });
    const r2 = factory.svg({ act, time: t0 + 5.0, reduced: true });
    assert.equal(r1, r2, `act ${act}: reduced motion must freeze figure geometry`);
  }
});

test('the retuned factory still survives worker serialization', () => {
  const factory = createSignalTableaux({});
  const revived = new Function(`return (${createSignalTableaux.toString()})`)()({});
  for (let act = 0; act < 5; act++) {
    assert.equal(revived.svg({ act }), factory.svg({ act }),
      `act ${act}: serialized factory must render byte-identical geometry`);
  }
});

test('the GL host keeps the field dominant and the figure ghostly', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../src/ui/loadingTerminalArt.js', import.meta.url)), 'utf8');
  // Figure ghosts through at half strength — never an opaque plate.
  assert.ok(src.includes('figure.rgb*1.38'), 'figure exposure pin');
  assert.ok(src.includes('figure.a*0.50*artOn'), 'figure mix pin (half strength)');
  // The swirl survives under the figure instead of being crushed to ~3%.
  assert.ok(src.includes('mix(1.0, 0.55, artOn)'), 'injector restoration pin');
  assert.ok(src.includes('mix(1.0, 0.50, artOn)'), 'fog restoration pin');
  assert.ok(src.includes('mix(0.96, 0.82, legibility)'), 'feedback persistence pin');
  // The kaleidoscope keeps folding through figures instead of dying to 0.01.
  assert.ok(src.includes('mix(0.60, 0.30, artHold)'), 'symmetry survival pin');
  // Accessibility is not negotiable: no post flash, no seam glitch under
  // reduced motion. The 0.45 seam unrest applies to full motion only, in both
  // the 2D and GL engines (exactly two sites).
  assert.ok(src.includes("gl.uniform1f(gl.getUniformLocation(progPost, 'uFlash'), 0)"),
    'post flash must stay hard zero');
  const glitchSites = src.split('glitch *= reduced ? 0 : 0.45;').length - 1;
  assert.equal(glitchSites, 2, `expected 2 seam-glitch sites, found ${glitchSites}`);
});
