// PRO-08 — the touch overlay has a size and a layout.
//
// Before this, `controls.touch` was `{ enabled }` only: `_buildOverlay()` took no arguments and read
// no settings, so a phone pilot could not grow the sticks or mirror them for a left thumb. These
// tests pin that both keys are read by the builder, that they survive a save round-trip, and that a
// hostile or legacy value cannot write CSS outside the authored range.
//
// DOM-free paths (the normalizers, the settings read, the save sanitizer) are asserted directly;
// the builder assertions use the same minimal document fixture shape as
// test/automation-panel-focus.test.mjs, since _buildOverlay touches document/head/body.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOUCH_LAYOUTS,
  TOUCH_LAYOUT_DEFAULT,
  TOUCH_SCALE_DEFAULT,
  TOUCH_SCALE_MAX,
  TOUCH_SCALE_MIN,
  createTouch,
  normalizeTouchLayout,
  normalizeTouchScale,
  readTouchOverlayConfig,
} from '../src/systems/touch.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';

// ---------------------------------------------------------------------------
// Minimal document fixture — only what _buildOverlay / _wireSticks / _wireButtons touch.
// ---------------------------------------------------------------------------

class FakeElement {
  constructor(tagName, doc) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = new Map();
    this.style = { props: new Map(), setProperty(k, v) { this.props.set(k, String(v)); }, remove() {} };
    this.textContent = '';
    this.innerHTML = '';
    this.classList = { add() {}, remove() {} };
    this.parentNode = null;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  // The overlay's markup is authored as one innerHTML string; the fixture parses it into a real
  // tree far enough to hand _wireSticks / _wireButtons the elements they look up by class.
  set innerHTML(html) {
    this.innerHTMLValue = String(html);
    this.children = [];
    const stack = [this];
    for (const m of this.innerHTMLValue.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
      const [, closing, tag, attrs, selfClose] = m;
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const el = new FakeElement(tag, this.ownerDocument);
      const classes = (attrs.match(/class="([^"]*)"/) || [null, ''])[1].split(/\s+/).filter(Boolean);
      el.classes = classes;
      const act = (attrs.match(/data-act="([^"]*)"/) || [])[1];
      if (act) el.setAttribute('data-act', act);
      const parent = stack[stack.length - 1];
      el.parentNode = parent;
      parent.children.push(el);
      if (!selfClose) stack.push(el);
    }
  }
  get innerHTML() { return this.innerHTMLValue; }
  _all(pred) {
    const out = [];
    for (const child of this.children) {
      if (pred(child)) out.push(child);
      out.push(...child._all(pred));
    }
    return out;
  }
  querySelector(sel) {
    const want = sel.split('.').filter(Boolean);
    return this._all((el) => want.every((c) => (el.classes || []).includes(c)))[0] || null;
  }
  querySelectorAll(sel) {
    const want = sel.split('.').filter(Boolean);
    return this._all((el) => want.every((c) => (el.classes || []).includes(c)));
  }
  appendChild(child) {
    if (this.tagName === 'HEAD' || this.tagName === 'BODY') this.ownerDocument.register(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
    }
    this.ownerDocument.unregister(this);
  }
  addEventListener() {}
}

function installDocument() {
  const byId = new Map();
  const doc = {};
  doc.head = new FakeElement('head', doc);
  doc.body = new FakeElement('body', doc);
  doc.createElement = (tagName) => new FakeElement(tagName, doc);
  doc.getElementById = (id) => byId.get(id) || null;
  doc.register = (el) => { if (el && el.id) byId.set(el.id, el); };
  doc.unregister = (el) => { if (el && el.id) byId.delete(el.id); };
  doc.byId = byId;
  globalThis.document = doc;
  return doc;
}

function stateWithTouch(touch) {
  return { tick: 0, simTime: 0, settings: { controls: { touch } } };
}

// ---------------------------------------------------------------------------
// The vocabulary itself.
// ---------------------------------------------------------------------------

test('PRO-08: a scale is clamped to the slider range and snapped to the step', () => {
  assert.equal(TOUCH_SCALE_MIN, 0.8);
  assert.equal(TOUCH_SCALE_MAX, 1.6);
  assert.equal(normalizeTouchScale(undefined), TOUCH_SCALE_DEFAULT);
  assert.equal(normalizeTouchScale(1), 1);

  assert.equal(normalizeTouchScale(0.2), TOUCH_SCALE_MIN, 'too small clamps up to the floor');
  assert.equal(normalizeTouchScale(99), TOUCH_SCALE_MAX, 'absurdly large clamps down to the ceiling');
  assert.equal(normalizeTouchScale(1.234), 1.25, 'an off-step value snaps to the authored step');
  assert.equal(normalizeTouchScale(NaN), TOUCH_SCALE_DEFAULT, 'NaN falls back rather than writing NaN');
  assert.equal(normalizeTouchScale(-3), TOUCH_SCALE_DEFAULT, 'a negative scale is not a scale');
  assert.equal(normalizeTouchScale('abc'), TOUCH_SCALE_DEFAULT, 'a string is not a scale');
  assert.equal(normalizeTouchScale('1.4'), 1.4, 'a numeric string from a hand-edited save is accepted');
});

test('PRO-08: there are exactly three layouts and an unknown one falls back to standard', () => {
  assert.deepEqual([...TOUCH_LAYOUTS], ['standard', 'lefty', 'compact']);
  assert.equal(normalizeTouchLayout('lefty'), 'lefty');
  assert.equal(normalizeTouchLayout('compact'), 'compact');
  assert.equal(normalizeTouchLayout(undefined), TOUCH_LAYOUT_DEFAULT);
  assert.equal(normalizeTouchLayout('diamond'), TOUCH_LAYOUT_DEFAULT,
    'an invented layout is refused, not passed through into a class attribute');
});

// ---------------------------------------------------------------------------
// The read: legacy saves are untouched, new saves are honoured.
// ---------------------------------------------------------------------------

test('PRO-08: a save with no touch size or layout keeps the authored overlay', () => {
  assert.deepEqual(readTouchOverlayConfig({ controls: { touch: { enabled: null } } }),
    { scale: 1, layout: 'standard' });
  assert.deepEqual(readTouchOverlayConfig(undefined), { scale: 1, layout: 'standard' },
    'no settings at all still builds a usable overlay');
});

test('PRO-08: readTouchOverlayConfig returns the player choice, normalized', () => {
  const cfg = readTouchOverlayConfig({ controls: { touch: { enabled: true, scale: 1.35, layout: 'lefty' } } });
  assert.equal(cfg.scale, 1.35);
  assert.equal(cfg.layout, 'lefty');
});

// ---------------------------------------------------------------------------
// The builder actually reads them.
// ---------------------------------------------------------------------------

test('PRO-08: the overlay builder stamps the configured scale and layout onto the overlay', () => {
  const doc = installDocument();
  const state = stateWithTouch({ enabled: true, scale: 1.4, layout: 'lefty' });
  const touch = createTouch({ state, bus: { emit() {} } });

  touch.setEnabled(true);

  const ov = doc.getElementById('sf-touch-overlay');
  assert.ok(ov, 'the overlay was built');
  assert.equal(ov.getAttribute('data-sf-touch-scale'), '1.4',
    'the builder read controls.touch.scale rather than the authored default');
  assert.equal(ov.getAttribute('data-sf-touch-layout'), 'lefty');

  const style = doc.getElementById('sf-touch-style');
  assert.ok(style, 'the style block exists');
  assert.ok(style.textContent.includes('--sf-touch-scale:1.4'),
    'the authored default geometry is expressed as a multiplier of the chosen scale');
  assert.ok(style.textContent.includes('data-sf-touch-layout="lefty"'),
    'the mirrored hand layout ships real CSS, not only a class name');
  assert.ok(style.textContent.includes('var(--sf-touch-scale)'),
    'every sized rule multiplies the player scale instead of hard-coding pixels');
});

test('PRO-08: the standard layout leaves the authored geometry in place', () => {
  const doc = installDocument();
  const state = stateWithTouch({ enabled: true });
  const touch = createTouch({ state, bus: { emit() {} } });
  touch.setEnabled(true);

  const ov = doc.getElementById('sf-touch-overlay');
  assert.equal(ov.getAttribute('data-sf-touch-scale'), '1');
  assert.equal(ov.getAttribute('data-sf-touch-layout'), 'standard');

  const style = doc.getElementById('sf-touch-style').textContent;
  // The Steam Deck / narrow-viewport gate must survive this change untouched.
  assert.ok(style.includes('@media (max-width: 760px)'), 'the small-viewport gate is unchanged');
  assert.ok(style.includes('var(--sf-touch-scale)'), 'the gate scales with the player setting too');
});

// ---------------------------------------------------------------------------
// Live re-apply: a pilot can resize mid-flight without a disable/enable cycle.
// ---------------------------------------------------------------------------

test('PRO-08: moving the setting resizes an already-visible overlay', () => {
  const doc = installDocument();
  const state = stateWithTouch({ enabled: true, scale: 1 });
  const touch = createTouch({ state, bus: { emit() {} } });
  touch.setEnabled(true);
  const ov = doc.getElementById('sf-touch-overlay');
  assert.equal(ov.getAttribute('data-sf-touch-scale'), '1');

  // This is exactly what the Settings row does: write, then let the overlay re-read.
  state.settings.controls.touch.scale = 1.6;
  state.settings.controls.touch.layout = 'compact';
  const returned = touch.applyOverlayConfig();

  assert.deepEqual(returned, { scale: 1.6, layout: 'compact' });
  assert.equal(ov.getAttribute('data-sf-touch-scale'), '1.6', 'the live overlay grew');
  assert.equal(ov.getAttribute('data-sf-touch-layout'), 'compact', 'the live overlay re-laid out');
  assert.equal(doc.getElementById('sf-touch-style').style.props.get('--sf-touch-scale'), '1.6',
    'the CSS multiplier is re-stamped, so calc() re-evaluates without a teardown');
});

test('PRO-08: applyOverlayConfig is safe before the overlay has ever been built', () => {
  installDocument();
  const state = stateWithTouch({ enabled: null, scale: 1.2 });
  const touch = createTouch({ state, bus: { emit() {} } });
  assert.deepEqual(touch.applyOverlayConfig(), { scale: 1.2, layout: 'standard' });
  assert.equal(touch.active, false, 'reading the config does not silently switch touch on');
});

// ---------------------------------------------------------------------------
// Persistence: the choice must survive a save/reload, and a hostile save must be neutralized.
// ---------------------------------------------------------------------------

test('PRO-08: a chosen size and layout survive a real save/load round-trip', () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const PROFILE_KEY = 'sf.settings.profile.v1';

  const state = createGameState(11);
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });

  state.settings.controls.touch = { enabled: true, scale: 1.25, layout: 'lefty' };
  bus.emit('settings:changed', { section: 'controls', key: 'touch', value: state.settings.controls.touch });

  const stored = JSON.parse(storage.getItem(PROFILE_KEY));
  assert.equal(stored.settings.controls.touch.scale, 1.25, 'the profile store keeps the chosen size');
  assert.equal(stored.settings.controls.touch.layout, 'lefty', 'the profile store keeps the chosen layout');

  // A later boot reads that same profile back through the sanitizer the real load path uses.
  const booted = createGameState(22);
  save.init({ state: booted, bus: createBus(), helpers: {}, registry: { get: () => null } });

  assert.equal(booted.settings.controls.touch.scale, 1.25, 'the chosen size survives a reload');
  assert.equal(booted.settings.controls.touch.layout, 'lefty', 'the chosen layout survives a reload');
});

test('PRO-08: a hostile or legacy touch object is normalized rather than trusted', () => {
  // Out of range, off-step, wrong types, and an invented layout — all through the real load path.
  const load = (touch) => {
    globalThis.localStorage = makeStorage();
    const state = createGameState(11);
    save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
    save._restoreSettings({ controls: { touch } });
    return state.settings.controls.touch;
  };

  const oversized = load({ enabled: true, scale: 99, layout: 'diamond' });
  assert.equal(oversized.scale, TOUCH_SCALE_MAX, 'an oversized scale is clamped to the ceiling');
  assert.equal(oversized.layout, undefined, 'an invented layout is dropped, not stored');

  assert.equal(load({ enabled: null, scale: 0.01 }).scale, TOUCH_SCALE_MIN);
  assert.equal(load({ enabled: null, scale: 'huge' }).scale, undefined, 'a non-numeric scale is dropped');

  const legacy = load({ enabled: true });
  assert.equal(legacy.scale, undefined, 'a legacy save gains no invented size');
  assert.equal(legacy.layout, undefined, 'a legacy save gains no invented layout');
  assert.deepEqual(readTouchOverlayConfig({ controls: { touch: legacy } }),
    { scale: 1, layout: 'standard' }, 'and therefore still builds the authored overlay');

  const corrupted = load('yes');
  assert.equal(corrupted.enabled, null,
    'a corrupted touch block still yields the auto-detect tri-state rather than throwing');
});

function makeStorage() {
  const map = new Map();
  return {
    getItem(key) { key = String(key); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

