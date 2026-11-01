// DUST P2b — the ending-gate meter (src/ui/station/dust/endingMeter.js, design/program/dust
// README packet P2). Before this component no surface read out progress toward the ending gates;
// this file locks the meter's three contracts:
//   1. one row per gate the board endings name, with figures that come from endingDefs.js
//      constants (imported there, never restated here);
//   2. the component is READ-ONLY — a deeply frozen GameState survives a render unmutated;
//   3. the identity-erasure contract (publicIdentity) seals the standing figure.
//
// No browser: the same fake-DOM approach as test/ledger-tape-yield.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEndingMeter, endingMeterModel } from '../src/ui/station/dust/endingMeter.js';
import {
  ENDING_DEFS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
} from '../src/story/endings/endingDefs.js';
import { freeze } from '../src/story/endings/value.js';

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this._text = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    const cls = new Set();
    this.classList = {
      add: (...c) => { for (const x of c) cls.add(x); this.attrs.set('class', [...cls].join(' ')); },
      remove: (...c) => { for (const x of c) cls.delete(x); this.attrs.set('class', [...cls].join(' ')); },
      contains: (c) => cls.has(c),
      _set: (v) => { cls.clear(); for (const x of String(v).split(/\s+/).filter(Boolean)) cls.add(x); },
    };
  }
  setAttribute(k, v) { if (k === 'class') this.classList._set(v); this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  // the kit's el() assigns `className` directly; keep it and classList the same set
  set className(v) { this.classList._set(v); }
  get className() { return this.attrs.get('class') || ''; }
  appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.children.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  remove() { if (!this.parentNode) return; const p = this.parentNode; p.children = p.children.filter((c) => c !== this); this.parentNode = null; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v); }
  addEventListener(t, fn) { this.listeners.set(t, fn); }
  removeEventListener(t) { this.listeners.delete(t); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

function installDoc() {
  const head = new FakeNode('head');
  const doc = {
    head,
    documentElement: new FakeNode('html'),
    createElement: (tag) => new FakeNode(tag),
    getElementById: (id) => head.all((n) => n.getAttribute('id') === id)[0] || null,
  };
  globalThis.document = doc;
  return doc;
}

/** A live-shaped GameState for the lifeLedger reader: patrol branch, 60 Concord rep, 20,000 cr. */
function fakeState({ rep = 60, branch = 'patrol', credits = 20000, flags = {} } = {}) {
  return {
    simTime: 4200,
    player: { credits, debt: 0, ownedShips: [], stats: {}, heatIncidentsApplied: {}, cargo: { items: {} } },
    factions: { faction_scn: { rep }, faction_mts: { rep: 0 }, faction_free: { rep: 0 } },
    story: { branch, flags, moralMemory: {}, campaign47a: {} },
    missions: { completedLog: [], active: [] },
    world: { discovery: {}, currentSectorId: 'sector_helios_prime' },
    careers: {}, claims: {}, automation: {}, aceMemory: {}, morrow: {},
  };
}

const rowOf = (root, gate) => root.all((n) => n.dataset && n.dataset.gate === gate)[0] || null;

test('renders one row per ending gate, figures straight from the endingDefs constants', () => {
  installDoc();
  const state = fakeState();
  const meter = createEndingMeter(state);
  const gates = meter.all((n) => n.dataset && n.dataset.gate).map((n) => n.dataset.gate);
  assert.deepEqual(gates.sort(), ['branch', 'net-worth', 'standing'], 'exactly the three named gates');

  // The figures quote the imported constants — the meter never restates a gate number.
  const worth = rowOf(meter, 'net-worth').all((n) => n.classList.contains('dust-em__fig'))[0];
  assert.equal(worth.textContent, `20,000 / ${ENDGAME_NET_WORTH_CR.toLocaleString('en-US')} cr`,
    'net worth figure is live value / ENDGAME_NET_WORTH_CR');
  const standing = rowOf(meter, 'standing').all((n) => n.classList.contains('dust-em__fig'))[0];
  assert.equal(standing.textContent, `60 / ${ENDGAME_REP_MIN}`,
    'standing figure is live rep / ENDGAME_REP_MIN');
  const branch = rowOf(meter, 'branch').all((n) => n.classList.contains('dust-em__fig'))[0];
  assert.match(branch.textContent, /patrol/i, 'a filed branch names itself');

  // Quantity rows carry a real progressbar; the binary branch row carries none.
  for (const gate of ['net-worth', 'standing']) {
    const bar = rowOf(meter, gate).all((n) => n.getAttribute('role') === 'progressbar')[0];
    assert.ok(bar, `${gate} has a progressbar`);
    assert.equal(bar.getAttribute('aria-valuemax'), String(gate === 'net-worth' ? ENDGAME_NET_WORTH_CR : ENDGAME_REP_MIN));
  }
  assert.equal(rowOf(meter, 'branch').all((n) => n.getAttribute('role') === 'progressbar').length, 0);
});

test('met flags follow the def constants at the boundary, not restated numbers', () => {
  installDoc();
  const atEdge = endingMeterModel(fakeState({ rep: ENDGAME_REP_MIN, credits: ENDGAME_NET_WORTH_CR }));
  const byGate = Object.fromEntries(atEdge.rows.map((r) => [r.gate, r]));
  assert.equal(byGate.standing.met, true, 'rep exactly at ENDGAME_REP_MIN is met');
  assert.equal(byGate['net-worth'].met, true, 'worth exactly at ENDGAME_NET_WORTH_CR is met');
  assert.equal(atEdge.metCount, 3, 'a fully-gated pilot reads three of three');

  const justShort = endingMeterModel(fakeState({ rep: ENDGAME_REP_MIN - 1, credits: ENDGAME_NET_WORTH_CR - 1 }));
  const shortByGate = Object.fromEntries(justShort.rows.map((r) => [r.gate, r]));
  assert.equal(shortByGate.standing.met, false, 'one rep short stays open');
  assert.equal(shortByGate['net-worth'].met, false, 'one credit short stays open');

  // The meter names the board endings from the defs it imported, never a second table.
  assert.deepEqual(endingMeterModel(fakeState()).boardEndings,
    ENDING_DEFS.filter((d) => d.boardEligible).map((d) => d.title));
});

test('read-only: a deeply frozen GameState survives a render unchanged', () => {
  installDoc();
  const state = freeze(fakeState());
  const before = JSON.stringify(state);
  // Strict-mode ESM: any attempted write on the frozen tree throws, so a clean render is proof.
  const meter = createEndingMeter(state);
  assert.ok(meter.all((n) => n.dataset && n.dataset.gate).length >= 3, 'the meter rendered rows');
  assert.equal(JSON.stringify(state), before, 'no field of state changed');
  // And no listener was wired against the state or the document.
  assert.equal(meter.listeners.size, 0, 'the meter subscribes to nothing');
});

test('identity erasure seals the standing figure', () => {
  installDoc();
  const sealed = endingMeterModel(fakeState({ flags: { identity_erased: true } }));
  const standing = sealed.rows.find((r) => r.gate === 'standing');
  assert.equal(standing.figure, 'sealed by request', 'the number stands down under Choice B');
  assert.equal(standing.value, null, 'no bar carries the sealed number');
});
