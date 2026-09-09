import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';

function createBus() {
  const listeners = new Map();
  return {
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
      return () => {
        const current = listeners.get(name) || [];
        const index = current.indexOf(fn);
        if (index >= 0) current.splice(index, 1);
      };
    },
    emit(name, payload) {
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
  };
}

test('profile bootstrap executes before registry construction', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const bootstrapAt = source.indexOf('bootstrapProfileSettingsBeforeRegistry(state)');
  const registryAt = source.indexOf('createRegistry(ctx)');
  assert.ok(bootstrapAt >= 0, 'main must consume profile before registry');
  assert.ok(registryAt > bootstrapAt, 'profile bootstrap must precede renderer/VFX registry initialization');
});

test('load reconciliation emits video and audio without persisting the profile', () => {
  const source = fs.readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(source, /section:\s*'video',\s*key:\s*null,\s*persist:\s*false/);
  assert.match(source, /section:\s*'audio',\s*key:\s*null,\s*persist:\s*false/);
  assert.match(source, /payload\.persist\s*!==\s*false/);
});

test('persist:false reconciliation leaves raw profile byte-identical; user edits still persist', () => {
  const raw = JSON.stringify({
    version: 1,
    updatedAt: 'stable-byte-fixture',
    settings: { video: { particleQuality: 'high', shadows: true } },
  });
  let stored = raw;
  let writes = 0;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return key === PROFILE_SETTINGS_KEY ? stored : null; },
    setItem(key, value) {
      if (key === PROFILE_SETTINGS_KEY) {
        stored = value;
        writes++;
      }
    },
  };

  try {
    const bus = createBus();
    save.init({ state: createGameState(7), bus, helpers: {}, registry: { get() { return null; } } });
    assert.equal(stored, raw, 'profile read during init must not rewrite bytes');
    assert.equal(writes, 0);

    bus.emit('settings:changed', { section: 'video', key: null, persist: false, source: 'save-load' });
    assert.equal(stored, raw, 'Continue reconciliation must not rewrite profile bytes');
    assert.equal(writes, 0);

    bus.emit('settings:changed', { section: 'video', key: 'shadows', value: false });
    assert.equal(writes, 1, 'a user settings edit must persist');
    assert.notEqual(stored, raw);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
