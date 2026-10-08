// SFQ-B203 — band:bearingUnavailable is said on the tuner, and the helm keeps focus.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bearingRefusalLine, paintBearingRefusal } from '../src/ui/orrery/bearingRefusal.js';
import { createBandHud } from '../src/ui/bandHud.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('SFQ-B203 seed 4242 a refused bearing names the reason and does not take focus', () => {
  assert.equal(bearingRefusalLine('no-unread-canonical-wrecks'), 'No unread wreck left on this band');
  assert.equal(bearingRefusalLine('canonical-source-missing'), 'That bearing has no source');
  assert.equal(bearingRefusalLine('canonical-record-rejected'), 'The band refused that bearing');
  assert.equal(bearingRefusalLine('something-else'), 'Bearing unavailable');

  const previous = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const focused = [];
  try {
    const button = doc.createElement('button');
    button.focus = () => { focused.push(button); };
    paintBearingRefusal(button, 'canonical-record-rejected');
    assert.equal(button.textContent, 'The band refused that bearing');
    assert.equal(button.getAttribute('aria-live'), 'polite');
    assert.equal(button.getAttribute('data-bearing-refusal'), 'canonical-record-rejected');
    assert.match(button.getAttribute('aria-label'), /The band refused that bearing/);
    assert.equal(focused.length, 0);

    const host = doc._make('div');
    const listeners = {};
    const bus = {
      on(name, fn) {
        (listeners[name] = listeners[name] || []).push(fn);
        return () => {};
      },
      emit(name, payload) {
        for (const fn of listeners[name] || []) fn(payload);
      },
    };
    const hud = createBandHud(
      { state: { mode: 'flight', ui: { docked: false }, bandRadio: {} }, bus },
      { documentRef: doc, host },
    );
    let tookFocus = false;
    hud.button.focus = () => { tookFocus = true; };
    bus.emit('band:bearingUnavailable', { reason: 'no-unread-canonical-wrecks', requestId: 4242 });
    assert.equal(hud.button.textContent, 'No unread wreck left on this band');
    assert.equal(hud.button.getAttribute('data-bearing-refusal'), 'no-unread-canonical-wrecks');
    assert.equal(hud.button.getAttribute('aria-live'), 'polite');
    assert.equal(tookFocus, false);
    bus.emit('save:loaded', {});
    assert.equal(hud.button.getAttribute('data-bearing-refusal'), null);
    assert.equal(hud.button.getAttribute('aria-live'), 'off');
    assert.match(hud.button.textContent, /BAND/);
    hud.root.removeEventListener = () => {};
    hud.button.removeEventListener = () => {};
    hud.destroy();
  } finally {
    globalThis.document = previous;
  }
});
