import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bindCommittedRange, settingsScreen } from '../src/ui/screens/settings.js';

function fakeRange(value) {
  const listeners = new Map();
  return {
    value: String(value),
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
}

test('range edits apply live but request profile persistence only when committed', () => {
  const range = fakeRange(0.7);
  const label = { textContent: '' };
  const changes = [];
  bindCommittedRange(range, label, (value) => `${Math.round(value * 100)}%`, (value, persist) => {
    changes.push({ value, persist });
  });

  for (const value of [0.65, 0.5, 0.35]) {
    range.value = String(value);
    range.dispatch('input');
  }

  assert.deepEqual(changes, [
    { value: 0.65, persist: false },
    { value: 0.5, persist: false },
    { value: 0.35, persist: false },
  ]);
  assert.equal(label.textContent, '35%', 'the live value label follows every intermediate edit');

  range.dispatch('change');
  assert.deepEqual(changes.at(-1), { value: 0.35, persist: true });
  assert.equal(changes.filter(({ persist }) => persist).length, 1, 'one edit commits one profile write');
});

test('settings events preserve live state while exposing the persistence intent', () => {
  const events = [];
  const ctx = {
    state: { settings: { audio: { master: 0.7 } } },
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  };

  settingsScreen._set(ctx, 'audio', 'master', 0.4, false);
  settingsScreen._set(ctx, 'audio', 'master', 0.4, true);

  assert.equal(ctx.state.settings.audio.master, 0.4);
  assert.deepEqual(events, [
    { name: 'settings:changed', payload: { section: 'audio', key: 'master', value: 0.4, persist: false } },
    { name: 'settings:changed', payload: { section: 'audio', key: 'master', value: 0.4 } },
  ]);
});
