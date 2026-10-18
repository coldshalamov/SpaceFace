import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const hudStylesSrc = readFileSync(root('src/ui/views/hudStyles.js'), 'utf8');

// The phone rules live inside one media block; slice it so each assertion reads that block only.
function smallScreenBlock() {
  const open = /@media\s*\(\s*max-width:\s*959px\s*\)\s*,\s*\(\s*max-height:\s*599px\s*\)\s*\{/.exec(hudStylesSrc);
  assert.ok(open, 'must declare the (max-width: 959px), (max-height: 599px) block');
  const from = open.index + open[0].length;
  const next = hudStylesSrc.indexOf('\n  @media', from);
  return hudStylesSrc.slice(from, next > from ? next : undefined);
}

test('D202b: a real phone keeps a text-scale floor of >= 0.75 below 960x600; a small desktop window keeps its authored fit', () => {
  // Pre-change defect: below 960x600 the HUD edge-fit scale shrank blocks to .62, so declared 12px
  // text landed at 7.44px (0.372x once nested in the cluster). The floor is scoped to the mobile
  // deck: a small desktop window keeps the authored .62 fit (raising it there made the larger radar
  // cover the V-MAX label and the keytag legends were lost).
  const block = smallScreenBlock();
  const base = /^\s*#hud\s*\{[^}]*--sf-hud-edge-fit:\s*([0-9.]+)[^}]*--sf-vtape-fit:\s*([0-9.]+)/m.exec(block);
  assert.ok(base, 'small-window base fit must be declared');
  assert.equal(parseFloat(base[1]), 0.62, 'a small desktop window keeps edge fit .62');
  assert.equal(parseFloat(base[2]), 0.68, 'a small desktop window keeps vtape fit .68');
  const mobile = /\[data-sf-mobile="1"\]\s+#hud\s*\{[^}]*--sf-hud-edge-fit:\s*([0-9.]+)[^}]*--sf-vtape-fit:\s*([0-9.]+)/.exec(block);
  assert.ok(mobile, 'the mobile deck must declare its own text-scale floor');
  assert.ok(parseFloat(mobile[1]) >= 0.75, `phone --sf-hud-edge-fit (${mobile[1]}) must be >= 0.75 so 12px text lands at >= 9px effective`);
  assert.ok(parseFloat(mobile[2]) >= 0.78, `phone --sf-vtape-fit (${mobile[2]}) must be >= 0.78`);
});

test('D202b: phone flight HUD prevents compound double-scaling of radar and right dock', () => {
  // Pre-change defect: on mobile flight, .sf-radar-wrap was scaled by 0.4 on top of .sf-rightdock scaled by 0.62,
  // producing compound 0.248x scale (radar readouts at ~3px, ring legends at ~1.7px).
  const hasDockTransformReset = /\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\]\s+#hud\s+\.sf-rightdock\s*\{[^}]*transform:\s*none/i.test(hudStylesSrc);
  assert.ok(hasDockTransformReset, 'mobile flight rightdock must reset transform to prevent compound scaling of nested radar');

  const hasRadarScaleFloor = /\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\]\s+#hud\s+\.sf-radar-wrap\s*\{[^}]*transform:\s*scale\(\s*0?\.7[5-9]/i.test(hudStylesSrc);
  assert.ok(hasRadarScaleFloor, 'mobile flight radar wrap must enforce a scale floor of >= 0.75');
});

test('D202b: phone viewports keep ring legends and dial micro-text at >= 9px effective', () => {
  // Pre-change defect: circularText and compass engraved legends were authored at 6.5px - 8px,
  // landing at 1.7px - 2.4px on phone-sized viewports.
  const hasRadarTextBoost = /#hud\s+\.sf-radar-orrery\s+text\s*\{[^}]*font-size:\s*1[5-9]px/i.test(hudStylesSrc);
  assert.ok(hasRadarTextBoost, 'radar orrery SVG text must have font-size >= 15px at phone width for >= 9px effective');

  const hasClusterMicroBoost = /#hud\s+\.orr-hud-cluster\s+\.orr-micro\s+text\s*\{[^}]*font-size:\s*(?:2\d|1[89])px/i.test(hudStylesSrc);
  assert.ok(hasClusterMicroBoost, 'cluster ring legend SVG text must have font-size >= 18px at phone width for >= 9px effective');
});

test('D202b: phone viewports hide lowest-priority non-touch items to prevent overlap with flight controls', () => {
  const hidesKeytags = /#hud\s+\.orr-cluster__keytag[^}]*display:\s*none\s*!important/i.test(hudStylesSrc);
  assert.ok(hidesKeytags, 'phone layout must hide keyboard numpad keytags on cluster');

  const hidesRadioTape = /#hud\s+\.sf-commtape[^}]*display:\s*none\s*!important/i.test(hudStylesSrc);
  assert.ok(hidesRadioTape, 'phone layout must hide ambient commtape ticker to prevent overlap with controls');
});

test('D202b quiet/negative: the phone-only rules never apply to a desktop window', () => {
  const block = smallScreenBlock();
  const start = block.indexOf('D202b: Hide lowest-priority');
  assert.ok(start >= 0, 'D202b rules present');
  // Every selector line of a D202b rule must be scoped to the mobile deck.
  const selectors = block.slice(start).split('\n').filter((line) => /^\s*(:root|#hud)[^{}]*[,{]\s*$/.test(line));
  assert.ok(selectors.length >= 8, `found the D202b selectors (${selectors.length})`);
  for (const line of selectors) assert.match(line, /data-sf-mobile="1"/, `unscoped D202b selector: ${line.trim()}`);
});

test('D202b quiet/negative: desktop sizes stay pixel-identical and intermediate breakpoints remain intact', () => {
  const match1279 = /@media\s*\(\s*max-width:\s*1279px\s*\)\s*,\s*\(\s*max-height:\s*719px\s*\)\s*\{[^}]*--sf-hud-edge-fit:\s*([0-9.]+)/.exec(hudStylesSrc);
  assert.ok(match1279, 'must preserve 1279px intermediate breakpoint');
  assert.equal(parseFloat(match1279[1]), 0.85, '1279px intermediate edge fit must remain 0.85');

  const match1099 = /@media\s*\(\s*max-width:\s*1099px\s*\)\s*,\s*\(\s*max-height:\s*659px\s*\)\s*\{[^}]*--sf-hud-edge-fit:\s*([0-9.]+)/.exec(hudStylesSrc);
  assert.ok(match1099, 'must preserve 1099px intermediate breakpoint');
  assert.equal(parseFloat(match1099[1]), 0.75, '1099px intermediate edge fit must remain 0.75');

  // Verify desktop (#hud base without media queries) has NO transform applied to stacks
  assert.doesNotMatch(hudStylesSrc.slice(0, 700), /#hud\s+\.sf-rightdock\s*\{[^}]*transform:\s*scale/,
    'desktop rightdock has no scale transform outside media queries');
});
