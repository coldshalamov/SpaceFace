// NXB-056 (build_map §1C row 197) — dense instrument text survives long names, large text and
// narrow windows: the data half. Three contracts, each deterministic:
//
//   • signed deltas never wrap — a negative amount keeps U+2212 with its number and NBSP with its
//     unit, so "−3.2 max speed" can never read as two items (NXI-222, already shipped; pinned
//     here against the ascii-minus regression);
//   • the market refusal stays reachable — the trade note is a focusable, id-stable element the
//     commit control is described-by, so a narrow-window keyboard user can read the whole reason
//     without the action moving (NXI-224);
//   • the local-map route panel carries keyboard focus across a repaint by route identity and
//     reveals the focused result only after the new markup's bounds settle — a wrapped long name
//     can't leave the chosen result half-hidden (NXI-223).
//
// Counterexamples covered: an injected quote is escaped; a removed route restores nothing; an
// unchanged repaint rebuilds nothing; a no-rAF host still reveals immediately.
import assert from 'node:assert/strict';

import { marketTradeHtml } from '../src/ui/views/marketPresentation.js';
import { formatPreviewDelta } from '../src/ui/presenters/engineeringPreview.js';
import { localmapScreen } from '../src/ui/screens/localmap.js';

// ── NXI-222: a negative delta is one unbreakable item ─────────────────────────────────────────

{
  const neg = formatPreviewDelta({ delta: -3.2, label: 'Max speed' });
  assert.equal(neg, '−3.2 max speed', 'negative delta: U+2212 minus + NBSP glue');
  assert.ok(!neg.includes('-'), 'no HYPHEN-MINUS that a narrow line could split off the digits');
  assert.ok(!neg.includes(' '), 'no breakable space between amount and unit');
  const pos = formatPreviewDelta({ delta: 12, label: 'Shield' });
  assert.equal(pos, '+12 shield', 'positive deltas keep the same shape');
  const big = formatPreviewDelta({ delta: -127.4, label: 'Stop' });
  assert.equal(big, '−127 stop', 'large negatives round but stay glued');
}

// ── NXI-224: the full refusal reason is reachable without moving the action ────────────────────

{
  const html = marketTradeHtml({
    mode: 'buy', qty: 12, canAct: false, receiptHtml: '',
    note: 'Not enough credits for this quantity.',
  });
  assert.ok(html.includes('id="sx-trade-note"'), 'the note carries a stable id');
  assert.ok(html.includes('tabindex="0"'), 'the note is keyboard-reachable when it holds a reason');
  const goTag = html.match(/<button[^>]*data-go[^>]*>/);
  assert(goTag, 'the live commit control renders');
  assert.ok(goTag[0].includes('aria-describedby="sx-trade-note"'),
    'the action is described-by its own refusal — no modal, no moved control');
  assert.ok(goTag[0].includes('disabled'), 'a refused action stays disabled');
  assert.ok(html.includes('Not enough credits for this quantity.'), 'the reason renders in full');
  // counterexample: an injected reason is escaped, not markup
  const evil = marketTradeHtml({ mode: 'sell', qty: 1, canAct: false, note: 'hold "sealed" <b>cargo</b>' });
  assert.ok(evil.includes('hold &quot;sealed&quot; &lt;b&gt;cargo&lt;/b&gt;'), 'the reason is text');
  assert.ok(!evil.includes('<b>cargo</b>'), 'nothing in the reason becomes markup');
  // a quiet market still mounts the described-by hook — the live update path fills it in place
  const quiet = marketTradeHtml({ mode: 'buy', qty: 0, canAct: true, note: '' });
  assert.ok(quiet.includes('hidden'), 'an empty reason stays out of the way');
  assert.ok(quiet.includes('id="sx-trade-note"'), 'the slot persists for in-place updates');
}

// ── NXI-223: focused route survives the repaint and is revealed after layout settles ──────────

function makeRouteBtn(doc, dest, comm) {
  const listeners = {};
  const btn = {
    ownerDocument: doc,
    isConnected: true,
    scrollCalls: [],
    _attrs: { 'data-act': 'route-nav', 'data-destination': dest, 'data-commodity': comm },
    getAttribute(name) { return this._attrs[name] ?? null; },
    closest(sel) { return sel === '[data-act="route-nav"]' ? this : null; },
    focus() { doc.activeElement = this; },
    scrollIntoView(opts) { this.scrollCalls.push(opts); },
    addEventListener() {},
    remove() { this.isConnected = false; },
  };
  return btn;
}

function makeRoutesPanel(doc) {
  const listeners = {};
  const panel = {
    ownerDocument: doc,
    _html: '',
    _btns: [],
    get innerHTML() { return this._html; },
    set innerHTML(html) {
      this._html = String(html);
      for (const old of this._btns) old.isConnected = false; // repaint detaches the old nodes
      this._btns = [];
      const re = /<button\s+class="lm-route"[^>]*data-destination="([^"]*)"\s+data-commodity="([^"]*)"/g;
      let m;
      while ((m = re.exec(this._html))) this._btns.push(makeRouteBtn(doc, m[1], m[2]));
    },
    querySelectorAll(sel) { return sel === '[data-act="route-nav"]' ? [...this._btns] : []; },
    contains(node) { return this._btns.includes(node); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, ev) { for (const fn of listeners[type] || []) fn(ev); },
  };
  return panel;
}

const route = (originId, destinationId, commodityId, extra = {}) => ({
  originId, destinationId, commodityId,
  reliability: 1, profitPerMinute: 42, expectedProfit: 9000, units: 20, fuel: 12, ...extra,
});

function makeScreen(routes) {
  const doc = { activeElement: null };
  const panel = makeRoutesPanel(doc);
  const screen = Object.create(localmapScreen);
  screen._ctx = { state: {} };
  screen._routesPanel = panel;
  screen._routes = routes;
  screen._routesSig = '';
  screen._renderRoutes();
  return { screen, doc, panel };
}

{
  const raf = { queue: [] };
  const priorRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { raf.queue.push(fn); return raf.queue.length; };
  try {
    const step = () => { const q = raf.queue; raf.queue = []; for (const fn of q) fn(); };

    // focus on a route, then a repaint with the same route still posted
    const { screen, doc, panel } = makeScreen([route('st_a', 'st_b', 'food'), route('st_c', 'st_d', 'ore')]);
    const held = panel._btns[0];
    doc.activeElement = held;
    screen._routes = [route('st_a', 'st_b', 'food'), route('st_e', 'st_f', 'water')];
    screen._renderRoutes();
    const repainted = panel._btns[0];
    assert.notEqual(repainted, held, 'the repaint rebuilt the node');
    assert.equal(doc.activeElement, repainted, 'focus rides onto the same route identity');
    assert.equal(held.isConnected, false, 'the old node is detached');
    assert.equal(repainted.scrollCalls.length, 0, 'reveal waits for the repaint to settle');
    step();
    assert.equal(repainted.scrollCalls.length, 0, 'still settling on the first frame');
    step();
    assert.equal(repainted.scrollCalls.length, 1, 'revealed once the new bounds exist');
    assert.deepEqual(repainted.scrollCalls[0], { block: 'nearest' });

    // the focused route left the board — nothing is aimed, nothing scrolls
    screen._routes = [route('st_e', 'st_f', 'water')];
    doc.activeElement = repainted;
    screen._renderRoutes();
    assert.equal(doc.activeElement, repainted, 'a removed route does not re-grab focus elsewhere');
    for (const btn of panel._btns) assert.equal(btn.scrollCalls.length, 0, 'no stray reveals');

    // an unchanged repaint rebuilds nothing and churns no focus
    const sig = screen._routesSig;
    const before = panel._btns[0];
    screen._renderRoutes();
    assert.equal(screen._routesSig, sig, 'identical markup short-circuits');
    assert.equal(panel._btns[0], before, 'nodes are not rebuilt for identical markup');

    // a keyboard landing on a wrapped route reveals it through the same settled path
    const target = panel._btns[0];
    screen._scheduleSettledReveal(target);
    step(); step();
    assert.equal(target.scrollCalls.length, 1, 'focusin-style reveals wait for settled bounds');
  } finally {
    globalThis.requestAnimationFrame = priorRaf;
  }
}

// ── NXI-223 fallback: a host with no rAF still reveals immediately ────────────────────────────

{
  const priorRaf = globalThis.requestAnimationFrame;
  delete globalThis.requestAnimationFrame;
  try {
    const { screen, doc, panel } = makeScreen([route('st_a', 'st_b', 'food')]);
    doc.activeElement = panel._btns[0];
    screen._routes = [route('st_a', 'st_b', 'food'), route('st_g', 'st_h', 'alloy')];
    screen._renderRoutes();
    const btn = panel._btns[0];
    assert.equal(doc.activeElement, btn, 'focus restored without rAF');
    assert.equal(btn.scrollCalls.length, 1, 'no-rAF host reveals at once');
  } finally {
    globalThis.requestAnimationFrame = priorRaf;
  }
}

console.log('next-wave-nxb-056: OK');
