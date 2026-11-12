// PQ-210.01 — frame-budget guards for the Crucible busy-machine bar.
//
// Two pinned contracts:
//   1. HUD DOM write-skip helpers (src/ui/hud.js): an unchanged value must not reach
//      the DOM mutator at all; a changed value writes exactly once. clearAttr must
//      poison setAttr's cache so re-applying the pre-clear value still writes.
//   2. Propulsion profile resolution (src/core/flight/propulsionCatalog.js): an
//      already-normalized profile returns BY IDENTITY (no per-tick re-spread), and
//      the partial-authored merge is memoized per entity — same entity + same
//      authored/base refs resolve to the same profile object.
//
// Both use plain fake elements/entities — no DOM required.

import test from 'node:test';
import assert from 'node:assert/strict';

import { setText, setHidden, setAttr, clearAttr } from '../src/ui/hud.js';
import { normalizeProfile, resolvePropulsionProfile, PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';

function fakeElement() {
  const attrs = new Map();
  let textWrites = 0;
  let hiddenWrites = 0;
  let attrWrites = 0;
  let attrRemoves = 0;
  const el = {
    _text: '',
    _hidden: false,
    get textContent() { return this._text; },
    set textContent(v) { textWrites += 1; this._text = v; },
    get hidden() { return this._hidden; },
    set hidden(v) { hiddenWrites += 1; this._hidden = v; },
    setAttribute(name, value) { attrWrites += 1; attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) { attrRemoves += 1; attrs.delete(name); },
    counts: () => ({ textWrites, hiddenWrites, attrWrites, attrRemoves }),
    attrs,
  };
  return el;
}

test('hud write-skip: unchanged textContent never writes; changed writes once', () => {
  const el = fakeElement();
  setText(el, '100');
  assert.equal(el.counts().textWrites, 1);
  setText(el, '100');
  setText(el, '100');
  assert.equal(el.counts().textWrites, 1, 'unchanged value must not touch the DOM');
  setText(el, '97');
  assert.equal(el.counts().textWrites, 2);
  assert.equal(el.textContent, '97');
});

test('hud write-skip: hidden flag writes only on transitions', () => {
  const el = fakeElement();
  // The first call always writes — it establishes the element-side cache (_sfHidden).
  setHidden(el, true);
  assert.equal(el.counts().hiddenWrites, 1);
  setHidden(el, true);
  setHidden(el, true);
  assert.equal(el.counts().hiddenWrites, 1, 'unchanged flag must not re-write');
  setHidden(el, false);
  assert.equal(el.counts().hiddenWrites, 2);
  assert.equal(el.hidden, false);
  setHidden(el, false);
  assert.equal(el.counts().hiddenWrites, 2);
});

test('hud write-skip: setAttr caches and clearAttr poisons so re-set writes again', () => {
  const el = fakeElement();
  setAttr(el, 'data-stage', 'locked');
  assert.equal(el.counts().attrWrites, 1);
  setAttr(el, 'data-stage', 'locked');
  assert.equal(el.counts().attrWrites, 1, 'unchanged attribute must not write');
  clearAttr(el, 'data-stage');
  assert.equal(el.hasAttribute('data-stage'), false);
  const removesAfterClear = el.counts().attrRemoves;
  clearAttr(el, 'data-stage');
  assert.equal(el.counts().attrRemoves, removesAfterClear, 'second clear on absent attr is a no-op');
  // The lock-ring contract: re-acquiring the same stage after a clear must write —
  // a naive textContent-style cache would skip it and leave the attribute missing.
  setAttr(el, 'data-stage', 'locked');
  assert.equal(el.getAttribute('data-stage'), 'locked');
});

test('propulsion: normalizeProfile returns an already-normalized profile by identity', () => {
  const normalized = PROPULSION_PROFILES.drive_reaction_m;
  assert.equal(normalizeProfile(normalized), normalized, 'normalized profiles must not re-spread');
  const partial = { family: 'reaction', maxThrust: 9 };
  const out = normalizeProfile(partial);
  assert.notEqual(out, partial, 'unstamped input still gets a normalized copy');
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.family, 'reaction');
  // And the copy itself is idempotent through the fast path.
  assert.equal(normalizeProfile(out), out);
});

test('propulsion: partial authored merge is memoized per entity and ref-stable', () => {
  const authored = { id: 'drive_reaction_s', label: 'Tuned scout', maxThrust: 12.5 };
  const entity = { id: 'hostile-1', mass: 20, propulsion: authored };
  const first = resolvePropulsionProfile(entity);
  const second = resolvePropulsionProfile(entity);
  assert.equal(second, first, 'same entity + same authored ref must resolve to one profile object');
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.id, 'drive_reaction_s');
  assert.equal(first.label, 'Tuned scout');
  // A different authored object on the SAME entity (e.g. a fitting rewrite) invalidates the memo.
  entity.propulsion = { ...authored, maxThrust: 13 };
  const third = resolvePropulsionProfile(entity);
  assert.notEqual(third, first);
  assert.equal(third.maxThrust, 13);
});
