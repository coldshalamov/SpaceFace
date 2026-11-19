// T8C: the calm preset is one press in Settings > Access (the first-run modal that used to offer it is gone).
// Run: node --test test/t8c-calm-preset-button.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { settingsScreen } from '../src/ui/screens/settings.js';
import { FIRST_LIGHT_PRESET } from '../src/ui/accessibility.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function shimDocument() {
  const doc = fakeDom();
  const realMake = doc._make;
  doc.createElement = (tag) => {
    const n = realMake(tag);
    n.ownerDocument = doc;
    const oa = n.appendChild.bind(n);
    const oap = n.append.bind(n);
    n.appendChild = (c) => { const r = oa(c); return r; };
    n.append = (...kids) => { oap(...kids); };
    n.insertBefore = (c, ref) => {
      c.parentNode = n;
      const i = n.children.indexOf(ref);
      n.children.splice(i < 0 ? n.children.length : i, 0, c);
      return c;
    };
    n.contains = (o) => !!(o && (o === n || n.children.some((c) => c === o || (typeof c.contains === 'function' && c.contains(o)))));
    const m = (e, sel) => (sel.startsWith('.') ? e.classList.contains(sel.slice(1))
      : sel.startsWith('[') && sel.endsWith(']') ? e.getAttribute(sel.slice(1, -1)) !== null : e.tagName === sel);
    n.matches = (sel) => m(n, sel);
    n.querySelectorAll = (sel) => findAll(n, (c) => c !== n && m(c, sel));
    n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
    return n;
  };
  return doc;
}

test('Settings > Access: one press applies the calm preset, shows it on, and is idempotent', () => {
  const prev = globalThis.document;
  const doc = shimDocument();
  globalThis.document = doc;
  try {
    const settings = { audio: {}, video: {}, gameplay: {}, uiScale: 1, controls: {},
      accessibility: { highContrast: false, flashReduce: false, textScale: 1, captions: false, captionSize: 'small', captionBackground: false, motionPreference: 'full' } };
    const emitted = [];
    const bus = { emit: (name, payload) => emitted.push({ name, payload }), on: () => () => {} };
    const ctx = { state: { settings }, bus, registry: { get: () => null }, helpers: {} };
    const root = doc.createElement('div');
    settingsScreen.mount(root, ctx);
    settingsScreen._select(ctx, 'Access');
    const button = () => findAll(root, (n) => n.tagName === 'button' && /^Calm preset/.test(n.textContent || '')).pop(); // fake DOM never clears innerHTML: the newest render is last

    assert.equal(button().textContent, 'Calm preset', 'off until pressed');
    for (const fn of button().listeners.click || []) fn();

    const a = settings.accessibility;
    for (const k of Object.keys(FIRST_LIGHT_PRESET)) assert.equal(a[k], FIRST_LIGHT_PRESET[k], k);
    assert.equal(a.motionPreference, 'reduce');
    assert.equal(settings.video.motionReduce, true);
    assert.ok(emitted.some((e) => e.name === 'settings:changed' && e.payload.key === 'highContrast' && e.payload.value === true), 'published');
    assert.equal(button().textContent, 'Calm preset · on', 'the control shows it is applied');

    const rowFor = (label) => findAll(root, (n) => n.tagName === 'li' && findAll(n, (c) => c.textContent === label).length > 0).pop();
    const hc = rowFor('High contrast');
    const on = findAll(hc, (c) => c.tagName === 'button' && c.dataset.action === 'on')[0];
    assert.equal(on.getAttribute('aria-pressed'), 'true', 'individual rows reflect the new value');

    const before = JSON.stringify(settings);
    const published = emitted.length;
    for (const fn of button().listeners.click || []) fn();
    assert.equal(JSON.stringify(settings), before, 'a second press changes nothing');
    assert.equal(emitted.length, published, 'and publishes nothing');
    assert.equal(button().textContent, 'Calm preset · on');

    // Pressing a bundled control's own Off drops the "on" claim at once — no re-render needed.
    const off = findAll(hc, (c) => c.tagName === 'button' && c.dataset.action === 'off')[0];
    for (const fn of off.listeners.click || []) fn();
    assert.equal(a.highContrast, false, 'the Off button wrote the setting');
    assert.equal(button().textContent, 'Calm preset', 'the label follows the change immediately');
  } finally {
    globalThis.document = prev;
  }
});
