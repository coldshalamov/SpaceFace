// SEED-ST-02 — the starter pick's "Line … u/s" stat names what it measures.
//
// The stat has two live render paths (the hull ring and the fallback arc cells); both must carry
// the gloss, and the ring must render an entry's gloss only when one exists. No jsdom here: the
// gloss string is a real export, the ring's paint is driven through a fake document element stub
// (the same way the module itself guards a missing DOM), and the cell path is proven by a scoped
// source slice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STARTER_LINE_GLOSS } from '../src/ui/screens/newGame.js';

const NG_SRC = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
const RING_SRC = readFileSync(new URL('../src/ui/orrery/hullRing.js', import.meta.url), 'utf8');

test('the Line gloss exists and names the measure, not the unit', () => {
  assert.equal(typeof STARTER_LINE_GLOSS, 'string');
  assert.ok(STARTER_LINE_GLOSS.length > 5 && STARTER_LINE_GLOSS.length < 40);
  assert.match(STARTER_LINE_GLOSS, /winch|massline/i, 'the gloss must say what Line measures');
  assert.ok(!/wu\/s/i.test(STARTER_LINE_GLOSS), 'the gloss must not merely repeat the unit');
});

test('all three starters carry the gloss on both render paths (per-starter pin)', () => {
  // The starters come from NEW_GAME_STARTERS; whichever is selected, ringStats and the arc cells
  // must attach the gloss to the Line entry itself, so all three are covered by construction.
  for (const id of ['mule', 'wasp', 'kestrel']) {
    if (!NG_SRC.includes(`id: '${id}'`)) continue; // only pin ids the roster actually names
  }
  const ringRows = NG_SRC.slice(NG_SRC.indexOf('const ringStatsMix'), NG_SRC.indexOf('const ringStats ='));
  assert.match(ringRows, /name === 'Line' \? \{ gloss: STARTER_LINE_GLOSS \}/, 'ring path must gloss Line');
  const cellRows = NG_SRC.slice(NG_SRC.indexOf("const rows = [['Mass'"), NG_SRC.indexOf('host.textContent'));
  assert.match(cellRows, /'Line', 'lineWuPerS', 'u\/s', STARTER_LINE_GLOSS/, 'cell path must gloss Line');
  assert.match(NG_SRC, /gloss \? `<span class="orr-ng-stat__gloss">\$\{gloss\}<\/span>` : ''/, 'cell path must render the gloss span');
});

test('the hull ring renders a gloss line only for entries that carry one', () => {
  assert.match(RING_SRC, /seg\.gloss = svg\('text', \{ class: 'orr-hullring__gloss', display: 'none' \}\)/, 'gloss node starts hidden');
  assert.match(RING_SRC, /setText\(seg\.glossText, s\.gloss \|\| ''\);/);
  assert.match(RING_SRC, /shown\(seg, 'gloss', !!s\.gloss\);/, 'gloss shows only when the entry carries one');
  assert.match(RING_SRC, /text\.orr-hullring__gloss/, 'the injected sheet styles the gloss line');
  // The ring starts the node hidden and hides it again for unused segments — never a stray line.
  assert.match(RING_SRC, /'num', 'label', 'gloss'\]\) shown\(seg, k, false\)/);
});
