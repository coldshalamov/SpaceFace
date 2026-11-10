// The station ledger's tape (src/ui/orrery/ledgerTape.js) places each credit figure in the first clear
// slot and leaves a figure off when no slot is clear (PR #395). This file locks in that a figure the
// tape leaves off is never lost: its tick still stands on the tape and picks the entry, the ledger list
// still carries the entry and its credits, and the reading (the entry picked) leads with that figure.
// It also checks the review fixes: label widths are measured once per size, the reading's rect is read
// once per relayout, and the tape does not reorder the entries it is given.
//
// No browser: a small fake DOM stands in for the SVG layer (a label is 7px per character).
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShipLedger } from '../src/systems/shipLedger.js';
import { shipLedgerEntryAriaLabel } from '../src/ui/shipLedgerPanel.js';
import { readingOf } from '../src/ui/station/screens/ledger.js';
import { createLedgerTape } from '../src/ui/orrery/ledgerTape.js';

const CHAR_W = 7;
// the axis numerals print wider than the column the tape reserves for them; a test can widen them
let AXIS_CHAR_W = CHAR_W;
let textMeasures = 0;

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this._text = '';
    const cls = new Set();
    this.classList = {
      add: (...c) => { for (const x of c) cls.add(x); this.attrs.set('class', [...cls].join(' ')); },
      remove: (...c) => { for (const x of c) cls.delete(x); this.attrs.set('class', [...cls].join(' ')); },
      contains: (c) => cls.has(c),
      _set: (v) => { cls.clear(); for (const x of String(v).split(/\s+/).filter(Boolean)) cls.add(x); },
    };
    this.style = { setProperty() {} };
  }
  setAttribute(k, v) { if (k === 'class') this.classList._set(v); this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.children.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  remove() { if (!this.parentNode) return; const p = this.parentNode; p.children = p.children.filter((c) => c !== this); this.parentNode = null; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v); }
  addEventListener(t, fn) { this.listeners.set(t, fn); }
  removeEventListener(t) { this.listeners.delete(t); }
  closest(sel) { const c = sel.replace(/^\./, ''); for (let n = this; n; n = n.parentNode) if (n.classList.contains(c)) return n; return null; }
  getComputedTextLength() { textMeasures += 1; return this._text.length * (this.classList.contains('orr-ltape__axis-n') ? AXIS_CHAR_W : CHAR_W); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

function installDoc() {
  const head = new FakeNode('head');
  const documentElement = new FakeNode('html');
  documentElement.classList.add('sf-reduce-motion');
  const doc = {
    head,
    documentElement,
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createElement: (tag) => new FakeNode(tag),
    getElementById: (id) => head.all((n) => n.getAttribute('id') === id || n.id === id)[0] || null,
  };
  globalThis.document = doc;
  return doc;
}

function fakeHost(doc, w, h, top = 0) {
  const n = new FakeNode('div');
  n.ownerDocument = doc;
  n.clientWidth = w;
  n.clientHeight = h;
  n.rectReads = 0;
  n.getBoundingClientRect = () => { n.rectReads += 1; return { top, left: 0, width: w, height: h, bottom: top + h, right: w }; };
  return n;
}

// receipts a few seconds apart in one cycle, the "many trades in a row" case the tape crowds on
const RECEIPTS = Array.from({ length: 12 }, (_, i) => ({
  side: i % 4 === 3 ? 'sell' : 'buy',
  qty: 5 + i,
  commodityId: 'cmdty_fuel_cells',
  stationId: 'station_helios',
  total: [750, 480, 1900, 220, 640, 2400, 90, 1200, 3100, 310, 1450, 860][i],
  seenAt: 3605 + i * 12,
}));

// the same mapping the station ledger uses (ledger.js tapeEntryOf): sold is credits in, bought is out
function tapeEntryOf(entry) {
  const t = entry.tokens || {};
  const credits = t.credits != null ? Number(String(t.credits).replace(/[^0-9.]/g, '')) : NaN;
  const amount = entry.type === 'trade' && Number.isFinite(credits) ? (t.verbPast === 'sold' ? 1 : -1) * credits : null;
  return { id: entry.id, type: entry.type, at: Number(entry.at) || 0, cycleLabel: entry.cycleLabel || '', amount };
}

const signed = (n) => `${n > 0 ? '+' : '\u2212'}${Math.abs(n).toLocaleString('en-US')}`;
const ticksOf = (host) => host.all((n) => n.classList.contains('orr-ltape__tick'));
const figureOf = (tick) => tick.all((n) => n.classList.contains('orr-ltape__figure'))[0] || null;

function seededLedger() {
  const model = buildShipLedger({ simTime: 3800, player: { tradeLedger: RECEIPTS } }, {});
  assert.equal(model.entries.length, RECEIPTS.length, 'every receipt is a ledger entry');
  return model;
}

test('a figure with no clear slot leaves the tape but stays in the list and the reading', () => {
  const doc = installDoc();
  const model = seededLedger();
  const entries = model.entries.map(tapeEntryOf);
  const host = fakeHost(doc, 640, 120);
  const picked = [];
  const tape = createLedgerTape(host, { onPick: (id) => picked.push(id) });
  tape.set({ entries, selectedId: null, nowCycle: 'CYCLE 0007' });

  const ticks = ticksOf(host);
  assert.equal(ticks.length, entries.length, 'every entry keeps its tick on the tape');
  const dropped = ticks.filter((t) => !figureOf(t));
  const printed = ticks.filter((t) => figureOf(t));
  assert.ok(printed.length > 0, 'the tape still prints the figures that fit');
  assert.ok(dropped.length > 0, 'the crowded fixture leaves at least one figure off the tape');

  for (const tick of dropped) {
    const id = tick.getAttribute('data-id');
    const entry = model.entries.find((e) => e.id === id);
    assert.ok(entry, `the dropped tick ${id} is a ledger entry`);
    const amount = tapeEntryOf(entry).amount;
    const credits = Math.abs(amount).toLocaleString('en-US');

    // the list: the entry is a row, and its row says the credits
    assert.match(entry.text, new RegExp(credits.replace(',', '\\,')), 'the list row carries the figure');
    assert.match(shipLedgerEntryAriaLabel(entry), new RegExp(credits.replace(',', '\\,')), "the row's label carries the figure");

    // the tick still picks the entry, and the reading leads with its signed figure
    host.children[0].listeners.get('click')({ target: tick });
    assert.equal(picked.at(-1), id, 'tapping the bare tick picks its entry');
    assert.equal(readingOf(entry).hero, signed(amount), 'the reading leads with the figure the tape left off');

    // picked, the tick becomes the Hand: the reading is its label, so the tape adds no figure for it
    tape.set({ entries, selectedId: id, nowCycle: 'CYCLE 0007' });
    const chosen = ticksOf(host).find((t) => t.getAttribute('data-id') === id);
    assert.ok(chosen.classList.contains('is-chosen'), 'the picked tick is the chosen one');
    assert.equal(host.all((n) => n.classList.contains('orr-ltape__hand')).length, 1, 'the Hand points at it');
    tape.set({ entries, selectedId: null, nowCycle: 'CYCLE 0007' });
  }

  // no figure the tape printed sits on another
  const texts = host.all((n) => n.tagName === 'text' && n.classList.contains('orr-ltape__figure') && n.parentNode.classList.contains('orr-ltape__tick'));
  assert.equal(texts.length, printed.length);
  tape.dispose();
});

test('label widths are measured once per size and the reading is read once per relayout', () => {
  const doc = installDoc();
  const model = seededLedger();
  const entries = model.entries.map(tapeEntryOf);
  const before = entries.map((e) => e.id).join(',');
  const host = fakeHost(doc, 640, 120, 0);
  const read = fakeHost(doc, 300, 80, 200); // below the tape: no floor change
  const tape = createLedgerTape(host, { readingHost: read });

  textMeasures = 0;
  tape.set({ entries, selectedId: null, nowCycle: 'CYCLE 0007' });
  const first = textMeasures;
  assert.ok(first > 0, 'the first layout measures its labels');
  assert.equal(read.rectReads, 1, "the reading's rect is read once in a relayout");

  textMeasures = 0;
  tape.set({ entries, selectedId: entries[3].id, nowCycle: 'CYCLE 0007' });
  assert.equal(textMeasures, 0, 'a pick at the same size measures nothing again');
  assert.equal(read.rectReads, 2, 'one more rect read for the one more relayout');

  host.clientWidth = 700;
  textMeasures = 0;
  tape.set({ entries, selectedId: null, nowCycle: 'CYCLE 0007' });
  assert.ok(textMeasures > 0, 'a new size measures again');

  assert.equal(entries.map((e) => e.id).join(','), before, 'the entries handed to the tape keep their order');
  tape.dispose();
});

// ui-polish-37: the axis numerals are in the clear set at their printed width. "3,000 cr" runs past the
// fixed axis column, so a big credit near the origin used to slide just past the column and print on it
test('no figure prints on an axis numeral, whatever its width', () => {
  const doc = installDoc();
  AXIS_CHAR_W = 9; // "3,000 cr" 72px from x0 + 9: past the 64px column, as the live 12px face prints it
  const amounts = [1806, -420, -1210, 2950, -640, 980, -2200, 1500, -300, 2600, -760, 1806];
  const entries = amounts.map((amount, i) => ({ id: `e${i}`, type: 'trade', at: 3000 + i * 25, cycleLabel: 'CYCLE 0007', amount }));
  const boxOf = (n, pad) => {
    const x = Number(n.getAttribute('x'));
    const yy = Number(n.getAttribute('y'));
    const w = n.textContent.length * (n.classList.contains('orr-ltape__axis-n') ? AXIS_CHAR_W : CHAR_W);
    const anchor = n.getAttribute('text-anchor');
    const l = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return { s: n.textContent, l, r: l + w, t: yy - pad, b: yy + 2 };
  };
  for (const [w, h] of [[480, 120], [640, 120], [640, 160], [960, 140]]) {
    const host = fakeHost(doc, w, h);
    const tape = createLedgerTape(host, {});
    tape.set({ entries, selectedId: null, nowCycle: 'CYCLE 0007' });
    const numerals = host.all((n) => n.tagName === 'text' && n.classList.contains('orr-ltape__axis-n')).map((n) => boxOf(n, 9));
    assert.ok(numerals.some((b) => b.s === '3,000 cr'), 'the fixture tops out at a 3,000 cr ceiling');
    const figures = host.all((n) => n.tagName === 'text' && n.classList.contains('orr-ltape__figure')).map((n) => boxOf(n, 11));
    assert.ok(figures.length > 0, 'figures print');
    for (const f of figures) for (const a of numerals) {
      const over = f.l < a.r && a.l < f.r && f.t < a.b && a.t < f.b;
      assert.ok(!over, `${f.s} prints on the ${a.s} numeral at ${w}x${h}`);
    }
    tape.dispose();
  }
  AXIS_CHAR_W = CHAR_W;
});
