/**
 * VERB-15 — the velocity-vectoring assist turns off in Gameplay settings like the other
 * three assists.
 *
 * flightV3 already honors `settings.gameplay.velocityVectoring === false` (absent/true = the
 * authored band defaults; lab objects still override). What was missing was the switch: no
 * Gameplay row, and `profileSettingsSnapshot` did not carry the key, so a UI-only row would
 * silently reset at next launch. This pins the whole seam on seed 4242:
 *
 *   - the real Gameplay pane exposes the toggle through the shared paneBuilder control;
 *   - Off emits one `settings:changed` {section:'gameplay',key:'velocityVectoring',value:false};
 *   - a real profile write + fresh restore round-trips explicit false (and true), while an old
 *     profile that never stored the key defaults ON;
 *   - on the real flight path the setting gates the kernel assist packet (telemetry.vectoring
 *     absent when off, live when on) — the law itself is unchanged.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { settingsScreen } from '../src/ui/screens/settings.js';
import { save } from '../src/save/saveSystem.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';
import { writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { bootPlayer, settle } from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';

const SETTINGS_LABEL = 'Velocity vectoring assist';

/** fake-dom plus the small DOM surface the settings mount actually touches. */
function shimDocument() {
  const doc = fakeDom();
  const realMake = doc._make;
  doc.createElement = (tag) => {
    const n = realMake(tag);
    n.ownerDocument = doc;
    const origAppendChild = n.appendChild.bind(n);
    const origAppend = n.append.bind(n);
    n.appendChild = (c) => { const r = origAppendChild(c); c.parentElement = n; return r; };
    n.append = (...kids) => { origAppend(...kids); for (const k of kids) if (k && typeof k === 'object') k.parentElement = n; };
    n.insertBefore = (c, ref) => {
      c.parentNode = n; c.parentElement = n;
      const i = n.children.indexOf(ref);
      n.children.splice(i < 0 ? n.children.length : i, 0, c);
      return c;
    };
    n.contains = (o) => !!(o && (o === n || n.children.some(
      (c) => c === o || (typeof c.contains === 'function' && c.contains(o)))));
    const matchSel = (el2, sel) => {
      if (sel.startsWith('.')) return el2.classList.contains(sel.slice(1));
      if (sel.startsWith('[') && sel.endsWith(']')) return el2.getAttribute(sel.slice(1, -1)) !== null;
      return el2.tagName === sel;
    };
    n.matches = (sel) => matchSel(n, sel);
    n.querySelectorAll = (sel) => findAll(n, (c) => c !== n && matchSel(c, sel));
    n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
    return n;
  };
  return doc;
}

function mountGameplay(settings) {
  const prevDoc = globalThis.document;
  const doc = shimDocument();
  globalThis.document = doc;
  const emitted = [];
  const bus = { emit: (name, payload) => emitted.push({ name, payload }), on: () => () => {} };
  const ctx = { state: { settings }, bus, registry: { get: () => null }, helpers: {} };
  const root = doc.createElement('div');
  try {
    settingsScreen.mount(root, ctx);
    settingsScreen._select(ctx, 'Gameplay');
  } finally {
    globalThis.document = prevDoc;
  }
  const row = findAll(root, (n) => n.tagName === 'li'
    && findAll(n, (c) => c.textContent === SETTINGS_LABEL).length > 0)[0] || null;
  const word = (action) => row && findAll(row,
    (c) => c.tagName === 'button' && c.dataset.action === action)[0] || null;
  return { root, emitted, ctx, row, off: word('off'), on: word('on') };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

function bootSave(settings) {
  const handlers = {};
  const bus = {
    emit(name, p) { for (const fn of handlers[name] || []) fn(p); },
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); return () => {}; },
  };
  const sys = Object.create(save);
  // init loads the stored profile first — this is a boot, not a blank writer.
  sys.init({ state: { settings }, bus, helpers: {}, registry: { get: () => null } });
  return { sys, bus };
}

test('the Gameplay pane exposes the assist as an Off/On word toggle, defaulting on', () => {
  const settings = { audio: {}, video: {}, gameplay: {}, uiScale: 1, accessibility: {}, controls: {} };
  const { row, off, on, emitted, ctx } = mountGameplay(settings);
  assert.ok(row && off && on, `a "${SETTINGS_LABEL}" toggle row exists on the Gameplay pane`);
  assert.equal(on.getAttribute('aria-pressed'), 'true', 'missing key reads On — the default is assist on');
  assert.equal(off.getAttribute('aria-pressed'), 'false');

  off.click();
  assert.equal(ctx.state.settings.gameplay.velocityVectoring, false, 'Off writes the real setting');
  assert.deepEqual(emitted.filter((e) => e.name === 'settings:changed'), [
    { name: 'settings:changed', payload: { section: 'gameplay', key: 'velocityVectoring', value: false } },
  ], 'one committed change announces itself');

  on.click();
  assert.equal(ctx.state.settings.gameplay.velocityVectoring, true, 'On writes true, not a deleted key');
});

test('the profile snapshot round-trips explicit false and true; an old profile without the key defaults on', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    // Boot with the switch Off, then the committed change writes the profile — the same
    // settings:changed wiring the Gameplay row uses.
    const writer = bootSave({ audio: {}, video: {}, gameplay: {}, controls: {} });
    writer.sys.state.settings.gameplay.velocityVectoring = false;
    writer.bus.emit('settings:changed', { section: 'gameplay', key: 'velocityVectoring', value: false });
    const stored = JSON.parse(globalThis.localStorage.getItem(PROFILE_SETTINGS_KEY));
    assert.equal(stored.settings.gameplay.velocityVectoring, false,
      'an explicit Off must land in the stored profile, not silently drop');

    const reader = bootSave({ audio: {}, video: {}, gameplay: {}, controls: {} });
    assert.equal(reader.sys.state.settings.gameplay.velocityVectoring, false,
      'a fresh boot restores Off');

    // The next session flips it back on and that choice must also persist.
    reader.sys.state.settings.gameplay.velocityVectoring = true;
    reader.bus.emit('settings:changed', { section: 'gameplay', key: 'velocityVectoring', value: true });
    const readerOn = bootSave({ audio: {}, video: {}, gameplay: {}, controls: {} });
    assert.equal(readerOn.sys.state.settings.gameplay.velocityVectoring, true,
      'an explicit On survives too');

    // A profile written before the switch existed never stored the key — it must read as On.
    globalThis.localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({
      version: 1, settings: { audio: {}, video: {}, gameplay: { tutorialHints: true }, controls: {} },
    }));
    const legacy = bootSave({ audio: {}, video: {}, gameplay: {}, controls: {} });
    assert.notEqual(legacy.sys.state.settings.gameplay.velocityVectoring, false,
      'an old profile keeps the assist on');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('the real flight path lets the setting gate the assist packet — off strips it, on keeps it live', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    const observe = (ticks) => {
      const seen = { present: 0, active: 0 };
      host.step(ticks, {
        before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
        after: () => {
          const v = host.player._flightFrame && host.player._flightFrame.vectoring;
          if (v) { seen.present++; if (v.active === true) seen.active++; }
        },
      });
      return seen;
    };

    settle(host);
    host.state.settings.gameplay.velocityVectoring = false;
    const off = observe(180);
    assert.equal(off.present, 0, 'with the assist off the kernel never sees a vectoring packet');

    host.state.settings.gameplay.velocityVectoring = true;
    const on = observe(180);
    assert.ok(on.present > 0 && on.active > 0,
      `with the assist on the real path keeps it live (present ${on.present}, active ${on.active})`);

    delete host.state.settings.gameplay.velocityVectoring;
    const missing = observe(120);
    assert.ok(missing.present > 0, 'an absent key keeps the authored default — assist on');
  } finally {
    host.dispose();
  }
});
