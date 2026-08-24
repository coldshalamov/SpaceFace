// test/tier2-why.test.mjs — the tier-2 "[data-why]" reveal, functionally exercised.
//
// Proves, against the REAL module (src/ui/whyReveal.js) in a hand-rolled DOM (the check-ui-effects
// house pattern — zero dependencies):
//   • hover (pointerover) reveals the EXACT enumerated string; pointerout hides;
//   • keyboard focus (focusin) reveals the same text anchored to the element; focusout hides;
//   • an empty/whitespace [data-why] renders NOTHING — never a guess;
//   • the reveal never listens to click (tier 2 must not become tier 3);
//   • aria-describedby links the carrier to the tip while shown, and is dropped on hide;
//   • causeLedger's market tooltip delegates to the SAME element (one mechanism, not two);
//   • destroy() removes listeners and the tip element.
//
// Run directly: node test/tier2-why.test.mjs   (also run by scripts/check-tier2-why.mjs)
import assert from 'node:assert/strict';

// Import BEFORE any document exists: the module must load headless (causeLedger parity).
assert.equal(typeof globalThis.document, 'undefined', 'harness must start with no document installed');
const { whyTextFor, showWhyTip, hideWhyTip, mountWhyReveal } = await import('../src/ui/whyReveal.js');
console.log('ok   import-before-DOM — whyReveal loads in Node with no document');

// ── hand-rolled DOM (subset the module actually touches) ──────────────────────────────────────
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
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
  }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  matches(selector) {
    // The reveal only ever asks for attribute-presence selectors: '[data-why]'.
    const m = /^\[([a-zA-Z-]+)\]$/.exec(selector);
    return !!m && this.attributes.has(m[1]);
  }
  closest(selector) {
    for (let el = this; el; el = el.parentNode) {
      if (el instanceof FakeElement && el.matches(selector)) return el;
    }
    return null;
  }
  contains(node) {
    for (let el = node; el; el = el.parentNode) if (el === this) return true;
    return false;
  }
  getBoundingClientRect() { return { left: 40, top: 100, right: 200, bottom: 140, width: 160, height: 40 }; }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  removeEventListener(type, fn) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
  }
}
class FakeDocument {
  constructor() {
    this._byId = new Map();
    this.listeners = [];
    this.body = this.createElement('body');
    this.documentElement = this.createElement('html');
  }
  createElement(tag) {
    const el = new FakeElement(tag);
    el.ownerDocument = this;
    return el;
  }
  getElementById(id) { return this._byId.get(id) || null; }
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: !!capture }); }
  removeEventListener(type, fn, capture) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === !!capture));
  }
}
function installDom() {
  const doc = new FakeDocument();
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  return doc;
}
function fire(doc, type, target, props = {}) {
  for (const l of [...doc.listeners]) {
    if (l.type !== type) continue;
    l.fn({ type, target, relatedTarget: null, clientX: 0, clientY: 0, ...props });
  }
}
function carrier(doc, text, tag = 'div') {
  const el = doc.createElement(tag);
  if (text !== null) el.setAttribute('data-why', text);
  doc.body.appendChild(el);
  return el;
}

// ── 1. pure reader: the reveal renders the literal string, nothing else ────────────────────────
{
  assert.equal(whyTextFor(carrier(installDom(), 'contraband scan')), 'contraband scan');
  assert.equal(whyTextFor(carrier(nullifyDom(), '')), '', 'empty attribute → no text');
  assert.equal(whyTextFor(carrier(nullifyDom(), '   ')), '', 'whitespace → no text');
  assert.equal(whyTextFor(carrier(nullifyDom(), null)), '', 'absent attribute → no text');
  assert.equal(whyTextFor(null), '', 'null element → no text, never a throw');
  function nullifyDom() { const d = installDom(); return d; }
  console.log('ok   whyTextFor — literal enumerated text only; empty/whitespace renders nothing');
}

// ── 2. hover reveals; pointerout hides; interior moves do not flicker ─────────────────────────
{
  const doc = installDom();
  const handle = mountWhyReveal();
  const el = carrier(doc, 'Deliver the cargo unopened — no customs confiscation.');
  const inner = doc.createElement('span');
  el.appendChild(inner);

  fire(doc, 'pointerover', inner, { clientX: 100, clientY: 200 });
  let tip = doc.getElementById('sf-why-tip');
  assert.ok(tip, 'tip element created on hover');
  assert.equal(tip.style.display, 'block', 'tip visible on hover');
  assert.equal(tip.textContent, 'Deliver the cargo unopened — no customs confiscation.', 'EXACT enumerated text');
  assert.equal(el.getAttribute('aria-describedby'), 'sf-why-tip', 'carrier is described by the tip');

  // Moving between the carrier's own children must NOT hide (pointerout.relatedTarget inside).
  fire(doc, 'pointerout', el, { relatedTarget: inner });
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'block', 'interior pointer move keeps the tip');

  fire(doc, 'pointerout', el, { relatedTarget: doc.body });
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'none', 'leaving the carrier hides the tip');
  assert.equal(el.getAttribute('aria-describedby'), null, 'aria-describedby dropped on hide');

  // Hovering a non-carrier hides any stale tip.
  fire(doc, 'pointerover', doc.body, { clientX: 5, clientY: 5 });
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'none', 'pointer over a non-carrier hides');
  handle.destroy();
  console.log('ok   hover — exact text, described-by link, clean show/hide, no interior flicker');
}

// ── 3. KEYBOARD FOCUS reveals the same text without any pointer ───────────────────────────────
{
  const doc = installDom();
  const handle = mountWhyReveal();
  const el = carrier(doc, 'faction ship kill · +3', 'button');
  const inner = doc.createElement('b');
  el.appendChild(inner);

  fire(doc, 'focusin', inner);
  const tip = doc.getElementById('sf-why-tip');
  assert.ok(tip && tip.style.display === 'block', 'tip visible on keyboard focus (no pointer involved)');
  assert.equal(tip.textContent, 'faction ship kill · +3', 'same enumerated text as hover');
  assert.equal(el.getAttribute('aria-describedby'), 'sf-why-tip', 'focus carrier described');

  fire(doc, 'focusout', el, { relatedTarget: inner });
  assert.equal(tip.style.display, 'block', 'focus moving within the carrier keeps the tip');

  fire(doc, 'focusout', el, { relatedTarget: doc.body });
  assert.equal(tip.style.display, 'none', 'focus leaving the carrier hides the tip');

  // Focus on a non-carrier hides a stale tip (focusin on body after a pointer reveal).
  fire(doc, 'focusin', doc.body);
  assert.equal(tip.style.display, 'none', 'focus on a non-carrier hides the tip');
  handle.destroy();
  console.log('ok   keyboard focus — same text, anchored, hides on focusout and on foreign focusin');
}

// ── 4. enumerated-only: a cause with no phrase renders NOTHING ────────────────────────────────
{
  const doc = installDom();
  const handle = mountWhyReveal();
  const el = carrier(doc, '');
  fire(doc, 'pointerover', el, { clientX: 10, clientY: 10 });
  let tip = doc.getElementById('sf-why-tip');
  assert.ok(!tip || tip.style.display === 'none', 'empty [data-why] never shows a tip');
  assert.equal(el.getAttribute('aria-describedby'), null, 'no described-by for a phrase-less cause');

  el.setAttribute('data-why', '   ');
  fire(doc, 'focusin', el);
  tip = doc.getElementById('sf-why-tip');
  assert.ok(!tip || tip.style.display === 'none', 'whitespace [data-why] never shows a tip (focus path too)');
  handle.destroy();
  console.log('ok   no phrase → no tooltip — never invented text, on both reveal paths');
}

// ── 5. tier 2 is NOT tier 3: no click listener exists in the mechanism ────────────────────────
{
  const doc = installDom();
  const handle = mountWhyReveal();
  const types = new Set(doc.listeners.map((l) => l.type));
  assert.deepEqual([...types].sort(), ['focusin', 'focusout', 'pointerout', 'pointerover'],
    'the mechanism listens to exactly hover + focus event pairs — never click');
  for (const l of doc.listeners) assert.equal(l.capture, true, 'every listener is document-capture (pointer-shield seat)');
  handle.destroy();
  assert.equal(doc.listeners.length, 0, 'destroy removes every listener');
  assert.equal(doc.getElementById('sf-why-tip'), null, 'destroy removes the tip element');
  console.log('ok   no click, capture-only seat, clean destroy');
}

// ── 6. ONE mechanism: causeLedger's market tooltip renders through the SAME element ───────────
{
  const doc = installDom();
  const { causeLedger } = await import('../src/ui/causeLedger.js');
  const sys = { ...causeLedger };
  sys._showTip('Meridian transmission is moving this price.', 300, 300);
  const tip = doc.getElementById('sf-why-tip');
  assert.ok(tip && tip.style.display === 'block', 'causeLedger display path reaches the shared tip');
  assert.equal(tip.textContent, 'Meridian transmission is moving this price.');
  sys._hideTip();
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'none', 'causeLedger hides through the shared tip');
  console.log('ok   one mechanism — causeLedger delegates display to the shared reveal element');
}

// ── 6b. OWNERSHIP GUARD: a sibling consumer's hide cannot erase another's live tip ────────────
// Regression shape (found live in Chromium): causeLedger hides on EVERY mouseover of a non-market
// row. Without ownership, that sweep erased a [data-why] reveal the pointer was still resting on
// (pointerover shows → mouseover hides, one frame apart). Owners retract only their own tip.
{
  const doc = installDom();
  const handle = mountWhyReveal();
  const { causeLedger } = await import('../src/ui/causeLedger.js');
  const sys = { ...causeLedger };
  const el = carrier(doc, 'faction ship kill · +3');
  fire(doc, 'pointerover', el, { clientX: 50, clientY: 50 }); // the [data-why] reveal shows
  sys._hideTip(); // causeLedger's mouseover sweep fires on a non-market row right after pointerover
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'block',
    'causeLedger hide does NOT erase the live [data-why] reveal (owner mismatch)');
  assert.equal(doc.getElementById('sf-why-tip').textContent, 'faction ship kill · +3');
  fire(doc, 'pointerout', el, { relatedTarget: doc.body });
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'none',
    'the reveal still hides its own tip on pointer-out');
  // And symmetrically: the reveal must not erase a ledger-shown tip when the pointer rests on a
  // non-carrier inside the market.
  sys._showTip('market line', 60, 60);
  fire(doc, 'pointerover', doc.body, { clientX: 1, clientY: 1 });
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'block',
    'reveal hide does NOT erase a causeLedger tip (owner mismatch)');
  sys._hideTip();
  assert.equal(doc.getElementById('sf-why-tip').style.display, 'none', 'ledger retracts its own tip');
  handle.destroy();
  console.log('ok   ownership guard — one element, many writers, each retracts only its own tip');
}

// ── 7. the banks are enumerated: footprint standings and contract clauses ─────────────────────
{
  const { nodeWhy } = await import('../src/ui/screens/footprint.js');
  const { clauseWhyAttr } = await import('../src/ui/station/screens/contracts.js');
  const { contractTermById } = await import('../src/data/contractClauses.js');
  const { REP_REASON_LABELS } = await import('../src/data/repReasons.js');

  // A REAL bank key phrases a standing node; an unknown reason renders nothing.
  const realKey = Object.keys(REP_REASON_LABELS)[3];
  const standingWhy = nodeWhy({ k: 'standing', reason: realKey, delta: 3, newTier: 'Wary' });
  assert.ok(standingWhy.includes(REP_REASON_LABELS[realKey]), 'standing why comes from REP_REASON_LABELS');
  assert.equal(nodeWhy({ k: 'standing', reason: 'not_a_bank_key', delta: 1 }), '',
    'unknown standing reason → empty why (render nothing)');
  const incidentText = 'Customs logged a contraband scan';
  assert.equal(nodeWhy({ k: 'incident', text: incidentText }), incidentText, 'incident why is the receipt text');

  // A REAL clause id phrases a chip; an unknown id emits NO attribute at all.
  const attr = clauseWhyAttr({ id: 'no_kills' });
  assert.ok(attr.includes(`data-why="${contractTermById('no_kills').prose}"`), 'clause why is catalog prose');
  assert.ok(attr.includes('tabindex="0"'), 'clause chip is keyboard focusable');
  assert.equal(clauseWhyAttr({ id: 'not_a_clause' }), '', 'unknown clause id → no attribute, no tooltip');
  assert.equal(clauseWhyAttr(null), '', 'null row → no attribute');
  console.log('ok   banks — standings from REP_REASON_LABELS, clauses from the contract catalog, unknowns render nothing');
}

console.log('\ntier2-why functional tests OK — hover + focus, enumerated-only, one mechanism');
