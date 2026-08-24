// test/native-title-sweep.test.mjs — the native-title sweep, functionally exercised.
//
// PACKET TITLE-SWEEP. Proves:
//   • the ban regex matches real attribute writes and REJECTS the hyphenated false positive that
//     inflated the packet's 66-count to a real 65 (data-career-title in missionLog.js);
//   • every banned live file carries zero native title= writes; shipworks carries exactly its two
//     pinned truncation shims (open layout debt, not a blessed pattern);
//   • the converted wiring is present (data-why writers + keyboard seats), via the check module's
//     own audit so the two can never drift;
//   • KEYBOARD FOCUS reveals the converted whys through the REAL shared reveal
//     (src/ui/whyReveal.js) for three converted carrier shapes — a galaxyMap action reason
//     (button), a targetPanel VULN segment (tabindex span), and a stationApp vital act (button) —
//     and that no second tooltip mechanism appeared.
//
// Run directly: node test/native-title-sweep.test.mjs   (also run by scripts/check-ui-native-titles.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NATIVE_TITLE_RE, nativeTitlePropWrites, BANNED_FILES, ALLOWLIST, auditNativeTitles,
} from '../scripts/check-ui-native-titles.mjs';

const src = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

// ── 1. the ban regex: real writes in, false positives out ────────────────────────────────────
test('ban regex matches native title writes and rejects hyphenated data attributes', () => {
  assert.ok(NATIVE_TITLE_RE.test('<button title="why">'), 'plain write');
  assert.ok(NATIVE_TITLE_RE.test("<span title='single'>"), 'single-quoted write');
  assert.ok(NATIVE_TITLE_RE.test('a ? "x" : \'\'" title="y"'), 'mid-template write');
  assert.ok(!NATIVE_TITLE_RE.test('data-career-title="Choice"'), 'hyphenated attribute is NOT a native title');
  assert.ok(!NATIVE_TITLE_RE.test('aria-title="x"'), 'prefixed attribute is not a native title');
  assert.ok(!NATIVE_TITLE_RE.test("function f(title = 'Open Star Map')"), 'JS default parameter is not markup');
  assert.ok(!NATIVE_TITLE_RE.test("title = 'Open Star Map'"), 'spaced JS assignment is not markup');
  assert.ok(!NATIVE_TITLE_RE.test("btn.title='x'"), 'property write is not markup (own regex below)');
  assert.ok(!NATIVE_TITLE_RE.test('const title = cost.title;'), 'property read is not a write');
});

test('property-form inspector catches el.title writes and exempts teardown clears', () => {
  const writes = (code) => nativeTitlePropWrites(code).map((w) => w.rhs);
  assert.deepEqual(writes("backlogBtn.title = 'Comms log (C)';"), ["'Comms log (C)';"], 'string property write');
  assert.deepEqual(writes('jetBtn.title = `Jettison all ${qty} units`;'), ['`Jettison all ${qty} units`;'], 'template property write');
  assert.deepEqual(writes('btn.title = someReason;'), ['someReason;'], 'identifier property write');
  assert.deepEqual(writes("el.title = '';"), [], 'clearing to empty string is teardown');
  assert.deepEqual(writes('el.title = null;'), [], 'clearing to null is teardown');
  assert.deepEqual(writes('el.title = undefined;'), [], 'clearing to undefined is teardown');
});

// ── 2. the live files are clean; the shim file is exactly as dirty as its debt ────────────────
test('banned live files carry zero native titles in both forms', () => {
  for (const rel of BANNED_FILES) {
    const body = src(rel);
    const attrHits = [...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))];
    assert.equal(attrHits.length, 0, `${rel} still writes ${attrHits.length} title= attribute(s)`);
    const propHits = nativeTitlePropWrites(body);
    assert.equal(propHits.length, 0, `${rel} still writes .title at line(s) ${propHits.map((p) => p.line).join(', ')}`);
  }
});

test('shipworks carries exactly its two pinned truncation shims', () => {
  const body = src('src/ui/station/screens/shipworks.js');
  const total = [...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))].length;
  assert.equal(total, Object.values(ALLOWLIST).flat().length,
    'shipworks must match its ALLOWLIST entry count exactly — a change means the layout debt moved');
  for (const shim of ALLOWLIST['src/ui/station/screens/shipworks.js']) {
    assert.ok(body.includes(shim), `pinned shim drifted: ${shim}`);
  }
});

test('the check module audit passes against the real tree (shared truth with the CLI check)', () => {
  const { failures } = auditNativeTitles();
  assert.deepEqual(failures, []);
});

// ── 3. keyboard focus reveals the converted whys through the REAL reveal ─────────────────────
// Hand-rolled DOM (check-ui-effects house pattern, same subset whyReveal touches).
class FakeStyle {}
class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.textContent = '';
    this._id = '';
    this.offsetWidth = 280;
    this.offsetHeight = 40;
    this.listeners = [];
  }
  get id() { return this._id; }
  set id(v) { this._id = String(v); if (this.ownerDocument) this.ownerDocument._byId.set(this._id, this); }
  get isConnected() {
    for (let p = this.parentNode; p; p = p.parentNode) if (p === this.ownerDocument.body) return true;
    return false;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    if (child._id) this.ownerDocument._byId.set(child._id, child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  matches(selector) {
    const m = /^\[([a-zA-Z-]+)\]$/.exec(selector);
    return !!m && this.attributes.has(m[1]);
  }
  closest(selector) {
    for (let el = this; el; el = el.parentNode) {
      if (el instanceof FakeElement && el.matches(selector)) return el;
    }
    return null;
  }
  contains(node) { for (let el = node; el; el = el.parentNode) if (el === this) return true; return false; }
  getBoundingClientRect() { return { left: 40, top: 100, right: 200, bottom: 140, width: 160, height: 40 }; }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); }
}
class FakeDocument {
  constructor() {
    this._byId = new Map();
    this.listeners = [];
    this.body = this.createElement('body');
    this.documentElement = this.createElement('html');
  }
  createElement(tag) { const el = new FakeElement(tag); el.ownerDocument = this; return el; }
  getElementById(id) { return this._byId.get(id) || null; }
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: !!capture }); }
  removeEventListener(type, fn, capture) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === !!capture));
  }
}
function fire(doc, type, target, props = {}) {
  for (const l of [...doc.listeners]) {
    if (l.type !== type) continue;
    l.fn({ type, target, relatedTarget: null, clientX: 0, clientY: 0, ...props });
  }
}

test('keyboard focus reveals three converted carrier shapes through the one shared reveal', async () => {
  assert.equal(typeof globalThis.document, 'undefined', 'harness must start with no document installed');
  const { mountWhyReveal } = await import('../src/ui/whyReveal.js');

  const doc = new FakeDocument();
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  const handle = mountWhyReveal();

  // Three converted sites, each rebuilt with the exact attribute grammar its writer now emits.
  const cases = [
    {
      name: 'galaxyMap place action (button, unavailable action keeps a focus seat)',
      tag: 'button',
      attrs: { 'data-place-action': 'open-system', 'aria-disabled': 'true', 'data-why': 'This mark has no parent sector' },
      why: 'This mark has no parent sector',
    },
    {
      name: 'targetPanel VULN segment (tabindex span)',
      tag: 'span',
      attrs: { class: 'sf-tri sf-tri--e', tabindex: '0', role: 'img', 'aria-label': 'Vulnerability to energy weapons', 'data-why': 'Energy' },
      why: 'Energy',
    },
    {
      name: 'stationApp vital act (button, quote reason)',
      tag: 'button',
      attrs: { 'data-vital-act': 'refuel', 'data-why': 'Refuel · Fuel 40/100 · 60u @ 3 cr/u · 180 credits' },
      why: 'Refuel · Fuel 40/100 · 60u @ 3 cr/u · 180 credits',
    },
  ];

  for (const c of cases) {
    const el = doc.createElement(c.tag);
    for (const [k, v] of Object.entries(c.attrs)) el.setAttribute(k, v);
    doc.body.appendChild(el);
    fire(doc, 'focusin', el);
    const tip = doc.getElementById('sf-why-tip');
    assert.ok(tip && tip.style.display === 'block', `${c.name}: tip visible on focus, no pointer involved`);
    assert.equal(tip.textContent, c.why, `${c.name}: EXACT converted phrase, never composed`);
    assert.equal(el.getAttribute('aria-describedby'), 'sf-why-tip', `${c.name}: carrier described by the tip while shown`);
    fire(doc, 'focusout', el, { relatedTarget: doc.body });
    assert.equal(doc.getElementById('sf-why-tip').style.display, 'none', `${c.name}: focus leaving hides the tip`);
    doc.body.removeChild(el);
  }

  handle.destroy();
  delete globalThis.document;
  delete globalThis.window;
});

test('the sweep built no second tooltip: exactly one tip element id exists in the mechanism', async () => {
  const body = src('src/ui/whyReveal.js');
  assert.equal((body.match(/const TIP_ID = /g) || []).length, 1, 'one shared tip id, not a family');
  assert.ok(!/createElement\('div'\)[\s\S]{0,120}title=/.test(body), 'the shared tip is never a native-title element');
});
