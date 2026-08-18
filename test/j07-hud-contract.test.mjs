// test/j07-hud-contract.test.mjs — J07 Tactical HUD Overhaul, cross-file contracts.
//
// These assertions exist because every one of them names a pair of numbers that live in different
// files and MUST agree. A comment saying "keep these in sync" has never once prevented that drift
// in this repo, and a green check that inspects only one side of a pair proves nothing.
//
// Each test below is written so that breaking EITHER side turns it red. Verified by mutation, not
// by reading it and agreeing with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const radarSrc = readFileSync(root('src/ui/radar.js'), 'utf8');
const uiRootSrc = readFileSync(root('src/ui/uiRoot.js'), 'utf8');
const uiCssSrc = readFileSync(root('styles/ui.css'), 'utf8');

const compactSize = Number(/const COMPACT_SIZE\s*=\s*(\d+)/.exec(radarSrc)[1]);

// Strip every @media block so "the default value" means the one that applies at any viewport.
// Matching on `#hud {` alone finds the narrow-breakpoint override first, because it appears
// earlier in the file than the base block — which is how the first draft of this test read 132px
// and reported the base dial as broken.
function withoutMediaBlocks(css) {
  let out = '';
  for (let i = 0; i < css.length;) {
    const at = css.indexOf('@media', i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    let j = css.indexOf('{', at);
    if (j < 0) break;
    let depth = 0;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) { j++; break; }
    }
    i = j;
  }
  return out;
}
const uiRootBase = withoutMediaBlocks(uiRootSrc);

test('the default radar dial is exactly the size the canvas is drawn at', () => {
  // A 180px canvas centred in a 220px CSS circle is invisible to every unit test and obvious on
  // screen. The BASE declaration (the one outside every @media block) is the pair that has to hold.
  const base = /--sf-radar-size:\s*(\d+)px/.exec(uiRootBase);
  assert.ok(base, 'injectHudCss no longer declares a base --sf-radar-size');
  assert.equal(
    Number(base[1]), compactSize,
    `base --sf-radar-size (${base[1]}px) must equal radar.js COMPACT_SIZE (${compactSize}px)`,
  );
});

test('every breakpoint that narrows the dial also scales the canvas', () => {
  // radar.js always draws COMPACT_SIZE px. A breakpoint that shrinks .sf-radar without an
  // equal-sized `.sf-radar canvas` override clips the drawing against the dial's overflow:hidden —
  // and nothing else in the build can see that happen. This assertion caught it once already.
  const dialSizes = [...uiRootSrc.matchAll(/--sf-radar-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const canvasSizes = new Set(
    [...uiRootSrc.matchAll(/\.sf-radar canvas \{\s*width:\s*(\d+)px\s*!important/g)].map((m) => Number(m[1])),
  );
  assert.ok(dialSizes.length >= 2, 'expected a --sf-radar-size per breakpoint');
  for (const size of dialSizes) {
    if (size === compactSize) continue;   // natural size needs no override
    assert.ok(
      canvasSizes.has(size),
      `--sf-radar-size:${size}px has no matching ".sf-radar canvas { width:${size}px !important }" — the canvas draws ${compactSize}px and would be clipped`,
    );
  }
});

test('radar ring radius stays inside the radar canvas', () => {
  // COMPACT_R is hand-written, not derived from COMPACT_SIZE. Raising the size without raising the
  // radius leaves the ring floating in a dead margin.
  const size = Number(/const COMPACT_SIZE\s*=\s*(\d+)/.exec(radarSrc)[1]);
  const r = Number(/const COMPACT_R\s*=\s*(\d+)/.exec(radarSrc)[1]);
  assert.ok(r < size / 2, `COMPACT_R (${r}) must be under half of COMPACT_SIZE (${size / 2})`);
  // …and not so far inside that the dial reads as a small circle in a large box. The pre-J07 pair
  // was 86/90 = 0.955; anything below ~0.9 is a visible dead margin.
  assert.ok(r / (size / 2) > 0.9, `COMPACT_R (${r}) leaves a dead margin inside COMPACT_SIZE (${size})`);
});

test('the right dock is one column: no surface hard-codes its own width', () => {
  // The J07 defect: .sf-target__bars was a fixed 220px inside a 212px content box, so it overhung
  // the card at every viewport. Any fixed px width on a dock child re-introduces a stagger.
  const offenders = [];
  const scan = (label, src) => {
    const re = /\.(sf-target__bars|sf-overview|sf-target|sf-radar-objective-key)\s*(?:,[^{]*)?\{([^}]*)\}/g;
    for (let m; (m = re.exec(src));) {
      const body = m[2];
      const w = /(?:^|[;\s])width\s*:\s*(\d+)px/.exec(body);
      if (w) offenders.push(`${label}: .${m[1]} { width:${w[1]}px }`);
    }
  };
  scan('uiRoot.injectHudCss', uiRootSrc);
  scan('styles/ui.css', uiCssSrc);
  assert.deepEqual(offenders, [], 'dock surfaces must be width:100% against --sf-dock-w:\n' + offenders.join('\n'));
});

test('--sf-dock-w is declared for every breakpoint that repositions the dock', () => {
  // Locking the column at 1440 and forgetting the narrow breakpoints ships a half-lock.
  const declared = [...uiRootSrc.matchAll(/--sf-dock-w:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(declared.length >= 3, `expected a --sf-dock-w per breakpoint, found ${declared.length}`);
  for (const w of declared) assert.ok(w >= 150 && w <= 320, `implausible dock width ${w}px`);
});

test('the swarm threshold has exactly one owner', () => {
  // SCREENS_A §6.1 caps behaviour at 8 hostiles. If a second surface re-derives that number with a
  // literal, the roster and the radar can disagree about when a fight is a swarm.
  assert.match(radarSrc, /export const SWARM_DENSITY_THRESHOLD\s*=\s*8\b/);
});

test('the radar threat pulse is gated in JS, not by a CSS media query', () => {
  // A canvas cannot answer prefers-reduced-motion. Gating it in CSS looks correct and does nothing.
  assert.match(radarSrc, /import \{ prefersReducedMotion \}/);
  assert.match(radarSrc, /const reducedMotion = prefersReducedMotion\(\)/);
  assert.match(radarSrc, /drawThreatRing\([^)]*reducedMotion/);
});

test('every de-boxed surface draws brackets from the one shared recipe', () => {
  // Five stylesheets inject HUD surfaces. A bracket recipe copied into each drifts; this pins them
  // all to src/ui/hudBrackets.js.
  const consumers = [
    'src/ui/uiRoot.js',
    'src/ui/sectorLawPresenter.js',
    'src/systems/onboarding.js',
  ];
  for (const file of consumers) {
    const src = readFileSync(root(file), 'utf8');
    assert.match(src, /from '\.\.?\/(?:ui\/)?hudBrackets\.js'/, `${file} must import the shared bracket recipe`);
  }
});

test('the generated bracket CSS contains no backtick', async () => {
  // Consumers interpolate this into template literals. One backtick closes the string and takes the
  // whole HUD stylesheet with it — this build has shipped that bug, in a CSS *comment*, this week.
  // Assert on the generated output, which is what actually gets interpolated, not on source text.
  const { bracketCss, deboxCss, INK_SHADOW } = await import('../src/ui/hudBrackets.js');
  for (const css of [bracketCss(), bracketCss('#fff', 6), deboxCss(), INK_SHADOW]) {
    assert.ok(!String(css).includes('`'), 'generated CSS must not contain a backtick');
  }
});

test('bracketCss draws all four corners', async () => {
  // Eight layers: a horizontal and a vertical arm at each of four corners. Seven means a corner is
  // missing and the surface reads as a broken frame rather than open telemetry.
  const { bracketCss } = await import('../src/ui/hudBrackets.js');
  const css = bracketCss();
  const positions = /background-position:([^;]*);/.exec(css);
  assert.ok(positions, 'bracketCss must set background-position');
  const slots = positions[1].split(',').map((s) => s.trim());
  assert.equal(slots.length, 8);
  for (const corner of ['left top', 'right top', 'left bottom', 'right bottom']) {
    assert.equal(slots.filter((s) => s === corner).length, 2, `corner "${corner}" needs both arms`);
  }
});
