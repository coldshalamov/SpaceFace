// Ruling (owner, 2026-11-21): the world is never held silently. The focus-loss
// hold stops the clock while effects keep animating and nothing on screen says
// why — indistinguishable from the freeze bug. A pause plate must appear for
// exactly as long as that hold pauses the clock. These pin the plate's contract
// and the hold/plate decision the presentation loop applies.
import assert from 'node:assert/strict';
import test from 'node:test';

import { setFocusPausePlate, focusPausePlateVisible } from '../src/render/focusPausePlate.js';
import { syncFocusLossHold, readFocusLossPrefs } from '../src/core/focusLossHold.js';

function stubElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    listeners: [],
    textContent: '',
    id: '',
    append(...kids) { this.children.push(...kids); },
    appendChild(kid) { this.children.push(kid); return kid; },
    addEventListener(type, fn, opts) { this.listeners.push({ type, fn, opts }); },
    remove() { this.removed = true; },
    preventDefault() { this.defaultPrevented = true; },
  };
  return el;
}

function installDocumentStub() {
  const created = [];
  const body = stubElement('body');
  const doc = {
    body,
    documentElement: stubElement('html'),
    createElement(tag) { const el = stubElement(tag); created.push(el); return el; },
  };
  globalThis.document = doc;
  return { created, body };
}

test('the focus pause plate appears when told, says why, and swallows the resume click', () => {
  const { created } = installDocumentStub();
  try {
    assert.equal(focusPausePlateVisible(), false);
    setFocusPausePlate(true);
    assert.equal(focusPausePlateVisible(), true);
    const plate = created[0];
    assert.equal(plate.id, 'sf-focus-pause');
    assert.equal(plate.children[0].textContent, 'Paused');
    assert.match(plate.children[1].textContent, /click or press any key/i);
    // The click that re-focuses the window must not also reach the ship.
    const swallow = plate.listeners.find((l) => l.type === 'pointerdown');
    assert.ok(swallow, 'plate listens for pointerdown');
    assert.equal(swallow.opts.capture, true);
    const click = stubElement('event');
    swallow.fn(click);
    assert.equal(click.defaultPrevented, true);
    // Idempotent while shown; a second show must not stack a plate.
    setFocusPausePlate(true);
    assert.equal(created.filter((el) => el.id === 'sf-focus-pause').length, 1);
    // Hiding removes it; hiding again is a no-op.
    setFocusPausePlate(false);
    assert.equal(focusPausePlateVisible(), false);
    assert.equal(plate.removed, true);
    setFocusPausePlate(false);
    assert.equal(created.filter((el) => el.id === 'sf-focus-pause').length, 1);
  } finally {
    delete globalThis.document;
    setFocusPausePlate(false);
  }
});

test('the hold the plate reports is exactly the focus-loss hold: default settings pause on blur', () => {
  const state = { render: {}, settings: {}, input: {}, timeEffects: {} };
  const paused = syncFocusLossHold(state, true);
  assert.deepEqual(paused, { paused: true, muted: false },
    'default prefs: blur pauses the clock (the plate must show)');
  const resumed = syncFocusLossHold(state, false);
  assert.equal(resumed.paused, false, 'focus releases the hold (the plate must hide)');
});

test('pauseOnFocusLoss=false keeps the world running, so no plate is warranted', () => {
  const prefs = readFocusLossPrefs({ gameplay: { pauseOnFocusLoss: false } });
  assert.equal(prefs.pause, false);
  const state = { render: {}, settings: { gameplay: { pauseOnFocusLoss: false } }, input: {}, timeEffects: {} };
  assert.equal(syncFocusLossHold(state, true).paused, false,
    'the opt-out never pauses — a plate here would lie about a running world');
});
