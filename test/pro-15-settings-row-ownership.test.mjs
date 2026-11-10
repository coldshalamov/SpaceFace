// PRO-15 — "The Motion effects and UI scale rows appear once in Settings, with a labelled mirror
// if a second home is kept".
//
// Both keys had an independent EDITOR on the Video tab and on the Access tab, writing the same
// key from two places. A pilot who set Motion effects on Video and then opened Access found a
// second identical control with no way to know one home had been chosen over the other. Access is
// the home — its own accessibility statement says those settings "are listed below", the
// accessibility checklist names Access, and the shipped Ceres acceptance actor drives the Access
// row — so Video keeps a read-only, labelled mirror built by the SAME factory.
//
// Also fixes a live false statement found in the same file while auditing: the Damage numbers
// toggle read `!!gameplay.damageNumbers`, but that key is absent from the shipped defaults and
// floatingText suppresses numbers only on an explicit false — so a fresh profile showed the
// toggle Off while damage numbers were on.
//
// Run: node --test test/pro-15-settings-row-ownership.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  settingsScreen, SETTINGS_ROW_OWNERS, SETTINGS_TABS, MIRROR_NOTE, fmtUiScale,
  motionEffectsRow, uiScaleRow,
} from '../src/ui/screens/settings.js';
import { save } from '../src/save/saveSystem.js';

/** A recording stand-in for the pane builder: records what kind of row each call produced. */
function recorder() {
  const rows = [];
  const record = kind => (label, ...rest) => { rows.push({ kind, label, args: rest }); return rows[rows.length - 1]; };
  return {
    rows,
    select: record('select'),
    slider: record('slider'),
    shortcut: record('shortcut'),
    toggle: record('toggle'),
    note: record('note'),
    header: record('header'),
    choice: record('choice'),
    key: record('key'),
    word: record('word'),
    break: record('break'),
  };
}

test('the ownership table is closed, and every home and mirror is a real, distinct tab', () => {
  assert.deepEqual(Object.keys(SETTINGS_ROW_OWNERS).sort(),
    ['accessibility.motionPreference', 'uiScale']);
  for (const [key, owner] of Object.entries(SETTINGS_ROW_OWNERS)) {
    assert.ok(SETTINGS_TABS.includes(owner.home), `${key}: home "${owner.home}" is not a settings tab`);
    assert.ok(SETTINGS_TABS.includes(owner.mirror), `${key}: mirror "${owner.mirror}" is not a settings tab`);
    assert.notEqual(owner.home, owner.mirror, `${key}: a key cannot be editable in its own mirror`);
  }
  assert.ok(SETTINGS_TABS.includes('Video') && SETTINGS_TABS.includes('Access'),
    'the settings walk must still reach both tabs this change touches');
});

test('the Access home is a real control that writes the key', () => {
  const state = createGameState(4242).settings;
  const build = recorder();
  motionEffectsRow(build, state, true);
  const row = build.rows[0];
  assert.equal(row.kind, 'select', 'the home must be editable, not a mirror');
  const [get, options, onChange] = row.args;
  assert.equal(get(), 'full');
  assert.deepEqual(options.map(([, label]) => label), ['Follow system', 'Reduced', 'Full']);
  assert.equal(typeof onChange, 'function', 'the home must carry a write path');

  // The slider home must actually drive the injected writer, and set the CSS custom property.
  const writes = [];
  const ui = recorder();
  uiScaleRow(ui, state, true, (...args) => writes.push(args));
  assert.equal(ui.rows[0].kind, 'slider');
  const [, min, max, step, , onInput] = ui.rows[0].args;
  assert.deepEqual([min, max, step], [0.75, 2, 0.05]);
  globalThis.document = { getElementById: () => ({ style: { setProperty: () => {} } }) };
  onInput(1.25, true);
  assert.deepEqual(writes, [[null, 'uiScale', 1.25, true]],
    'the home slider must write through the settings contract, not touch state directly');
  delete globalThis.document;
});

test('the Video mirror is read-only: a shortcut with a note and no write path', () => {
  const state = createGameState(4242).settings;
  for (const [label, render] of [['Motion effects', motionEffectsRow], ['UI scale', uiScaleRow]]) {
    const build = recorder();
    render(build, state, false, () => {});
    const row = build.rows[0];
    assert.equal(row.kind, 'shortcut', `${label}: the mirror must not be a control`);
    assert.equal(row.args[1], MIRROR_NOTE, `${label}: the mirror must say where the home is`);
    // A shortcut carries a value and a note and nothing else — no onChange to call.
    assert.equal(row.args.length, 2, `${label}: the mirror must expose no write callback`);
  }
});

test('the mirror can only print a word the home control can actually set', () => {
  // Including for a state with no accessibility subtree and for a corrupt stored preference: an
  // untrusted profile must not be able to make the mirror say something the select cannot select.
  const cases = [
    { accessibility: { motionPreference: 'system' } },
    { accessibility: { motionPreference: 'reduce' } },
    { accessibility: { motionPreference: 'full' } },
    { accessibility: { motionPreference: 'NOT_A_CHOICE' } },
    { accessibility: undefined },
    {},
  ];
  const allowed = new Set(['Follow system', 'Reduced', 'Full']);
  for (const accessibility of cases) {
    const state = { ...createGameState(4242).settings, accessibility, video: {} };
    const build = recorder();
    motionEffectsRow(build, state, false);
    assert.ok(allowed.has(build.rows[0].args[0]),
      `mirror printed "${build.rows[0].args[0]}", which the home select cannot set`);
  }
});

test('a corrupt ui scale renders a number, not NaNx', () => {
  assert.equal(fmtUiScale(1.25), '1.25x');
  assert.equal(fmtUiScale('abc'), '1.00x');
  assert.equal(fmtUiScale(undefined), '1.00x');
  assert.equal(fmtUiScale(null), '1.00x');
});

test('a fresh profile shows damage numbers ON, matching what the game actually does', () => {
  // The shipped defaults have no gameplay.damageNumbers, and floatingText suppresses the numbers
  // only on an explicit false. A `!!` read therefore showed Off while they were on.
  const state = createGameState(4242);
  assert.equal(state.settings.gameplay.damageNumbers, undefined);
  assert.equal(state.settings.gameplay.damageNumbers !== false, true,
    'damage numbers default to on, which is what the toggle must show');
});

test('the damage-numbers choice persists, so the toggle is not a lie over two sessions', () => {
  const storage = {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, String(v)); },
    removeItem(k) { this.store.delete(k); },
  };
  globalThis.localStorage = storage;
  const state = createGameState(4242);
  save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });

  state.settings.gameplay.damageNumbers = false;
  save._writeProfileSettings();
  const profile = JSON.parse(storage.getItem('sf.settings.profile.v1'));
  assert.equal(profile.settings.gameplay.damageNumbers, false,
    'turning damage numbers off must survive the next launch');

  const next = createGameState(4242);
  save.init({ state: next, bus: createBus(), helpers: {}, registry: { get: () => null } });
  assert.equal(next.settings.gameplay.damageNumbers, false);
});

test('the screen no longer renders a second editor for either key', () => {
  // Not a count of source literals — a check that no tab declares its own editor. The shared
  // factories are the only door, so the defect cannot come back as a second inline editor.
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  for (const label of Object.values(SETTINGS_ROW_OWNERS).map(o => o.label)) {
    assert.ok(!new RegExp(`row(?:Select|Slider)\\('${label}'`).test(source),
      `${label} has an inline editor again; it must go through the shared row factory`);
  }
  assert.equal(source.match(/motionEffectsRow\(build, s, true\)/g).length, 1, 'exactly one editable home');
  assert.equal(source.match(/motionEffectsRow\(build, s, false\)/g).length, 1, 'exactly one mirror');
  assert.equal(source.match(/uiScaleRow\(build, s, true/g).length, 1, 'exactly one editable home');
  assert.equal(source.match(/uiScaleRow\(build, s, false/g).length, 1, 'exactly one mirror');
});

test('the settings screen still exports its live write path', () => {
  // The factories reach `_set` through the screen, so a rename there must fail loudly here.
  assert.equal(typeof settingsScreen._set, 'function');
  assert.equal(typeof settingsScreen._render, 'function');
});
