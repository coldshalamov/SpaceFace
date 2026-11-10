// ORRERY arc rail width pass (D136): a grouped row seats head + verbs on one line from its arc
// anchor. A longer localization can run the line past the host's right edge where the tail verbs
// clip. splitGroupedRowsForWidth (src/ui/orrery/arcRail.js) measures the seated line and splits the
// overrun into consecutive rows sharing the head — the dial carries one more stop per split, and an
// arc carries at most nine, so a row that cannot fit whole stays whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitGroupedRowsForWidth, arcRailGeometry } from '../src/ui/orrery/arcRail.js';

const li = (w) => ({ offsetWidth: w, dataset: {}, hidden: false, getAttribute: () => null });
const row = (group, items) => ({ group, items });
const geo = (x) => ({ anchors: [{ x }] });

// pause rail at 1280x720: pivot ~72, ri ~256 -> the furthest anchor sits ~x300, runway ~960.
const W = 1280;
const G = geo(300);
const RUNWAY = W - 300 - 24; // 956
// The seated-line bound, checked at the authored WORST case rather than the helper's own guess:
// the head size caps at 26 px and the legend's letter-spacing puts a cap near .95 em — so a plan
// that fits at ~25 px/cap survives any head the dial can actually engrave.
const worstHeadW = (g) => String(g).length * 25;
const lineW = (g, items) => 30 + worstHeadW(g) + items.reduce((s, l) => s + l.offsetWidth + 22, -22);

test('a fitting grouped dial passes through untouched', () => {
  const rows = [row(null, [li(160)]), row('Game', [li(120), li(90), li(80)]), row('Ship', [li(150), li(110)])];
  assert.equal(splitGroupedRowsForWidth(rows, W, G), rows, 'same list, no copies');
});

test('an over-long group splits into consecutive rows that each fit the runway', () => {
  // 'Ship' = 4 pseudo verbs ~250 px each: 30 + 72 + 4*(250+22) - 22 = 1168 > 956
  const items = [li(250), li(250), li(250), li(250)];
  const rows = [row(null, [li(160)]), row('Ship', items), row('Exit', [li(140), li(110)])];
  const out = splitGroupedRowsForWidth(rows, W, G);
  assert.notEqual(out, rows);
  assert.equal(out.length, 4, 'one extra stop, within the nine-stop arc');
  const shipRows = out.filter((r) => r.group === 'Ship');
  assert.equal(shipRows.length, 2);
  assert.deepEqual(shipRows.flatMap((r) => r.items), items, 'every verb survives in order');
  for (const r of shipRows) assert.ok(lineW(r.group, r.items) <= RUNWAY, 'each seated line fits');
});

test('rows with no group head and one-item rows never split', () => {
  const big = [li(900), li(900), li(900)]; // 2744 px line, no group -> nothing to continue under
  const rows = [row(null, big), row('Dev', [li(980)])];
  assert.equal(splitGroupedRowsForWidth(rows, W, G), rows);
});

test('the nine-stop cap keeps a row whole rather than mint a tenth stop', () => {
  // eight rows already seated: one spare stop. 'Media' at 500 px verbs needs its own row each
  // (4 stops from one row = three extra) -> over the cap, so it stays whole.
  const wide = row('Media', [li(500), li(500), li(500), li(500)]); // 30+90+4*522-22=2186
  const rows = [
    row(null, [li(80)]), row('A', [li(80)]), row('B', [li(80)]), row('C', [li(80)]),
    row('D', [li(80)]), row('E', [li(80)]), row('F', [li(80)]), wide,
  ];
  const out = splitGroupedRowsForWidth(rows, W, G);
  assert.equal(out, rows, 'eight rows + a four-way split = eleven stops > nine: left whole');
});

test('a two-way split is spent when exactly one stop is spare', () => {
  const wide = row('Media', [li(380), li(380), li(380)]); // 30+90+3*402-22=1304 -> 2 rows of ~782
  const rows = [
    row(null, [li(80)]), row('A', [li(80)]), row('B', [li(80)]), row('C', [li(80)]),
    row('D', [li(80)]), row('E', [li(80)]), row('F', [li(80)]), wide,
  ];
  const out = splitGroupedRowsForWidth(rows, W, G);
  assert.equal(out.length, 9);
  assert.deepEqual(out[7].items, [wide.items[0], wide.items[1]]);
  assert.deepEqual(out[8].items, [wide.items[2]]);
  assert.ok(lineW('Media', out[7].items) <= RUNWAY && lineW('Media', out[8].items) <= RUNWAY);
});

test('the runway measures from the furthest anchor, not the first', () => {
  const near = geo(900); // tiny host or a dial seated far right: runway = 1280-900-24 = 356
  const rows = [row('Ship', [li(200), li(200)])]; // 30+72+2*222-22 = 524 > 356 -> splits 1+1
  const out = splitGroupedRowsForWidth(rows, W, near);
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.items.length === 1));
});

test('the real pause geometry leaves the split rows inside the dial', () => {
  // the live pause call: grouped, dense, span 56, pivot left-of-centre on a 1280x720 host
  const g = arcRailGeometry(1280, 720, 6, {
    span: 56, pivotY: 0.56,
    place: (w, h) => ({ pivot: { x: Math.min(112, Math.max(56, Math.round(w * 0.056))), y: Math.round(h * 0.55) }, re: Math.round(h * 0.3), centerDeg: 90 }),
  });
  const items = [li(250), li(250), li(250), li(250)];
  const out = splitGroupedRowsForWidth([row(null, [li(160)]), row('Ship', items), row('Exit', [li(140)])], 1280, g);
  assert.equal(out.length, 4);
  const g2 = arcRailGeometry(1280, 720, out.length, { span: 56, place: (w, h) => ({ pivot: { x: 72, y: 396 }, re: 216, centerDeg: 90 }) });
  // the real end-to-end claim: against the second-pass geometry's own anchors, every seated line —
  // head at authored worst case plus its verbs — lands inside the dial's runway
  for (let i = 0; i < out.length; i += 1) {
    const a = g2.anchors[i];
    assert.ok(a, 'every seated row owns a stop');
    assert.ok(lineW(out[i].group, out[i].items) <= 1280 - a.x - 24,
      `row ${i} (${out[i].group}) seats inside the runway from anchor ${Math.round(a.x)}`);
  }
});
