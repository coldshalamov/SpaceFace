#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const PRELOAD_SOURCE = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

function runPreload({ env = {}, initialStorage = {} } = {}) {
  const values = new Map(Object.entries(initialStorage));
  const exposed = new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
  const electron = {
    contextBridge: {
      exposeInMainWorld(name, value) { exposed.set(name, value); },
    },
    ipcRenderer: {
      on() {},
      send() {},
      invoke() { return Promise.resolve(); },
    },
  };
  const context = vm.createContext({
    console: { error() {}, info() {} },
    localStorage,
    process: { env: { ...env } },
    require(specifier) {
      assert.equal(specifier, 'electron');
      return electron;
    },
  });
  vm.runInContext(PRELOAD_SOURCE, context, { filename: 'electron/preload.cjs' });
  return { values, exposed };
}

test('ordinary preload clears a stale diagnostic domain profile even when env is inherited', () => {
  const { values } = runPreload({
    env: {
      SPACEFACE_ELECTRON_TEST_MODE: 'normal',
      SPACEFACE_DOMAIN_PROFILE: 'commodity',
    },
    initialStorage: { 'sf.domainProfile': 'commodity' },
  });
  assert.equal(values.has('sf.domainProfile'), false);
});

test('isolated-evidence preload accepts the history-bearing diagnostic profile', () => {
  const { values } = runPreload({
    env: {
      SPACEFACE_ELECTRON_TEST_MODE: 'isolated-evidence',
      SPACEFACE_DOMAIN_PROFILE: 'commodity',
    },
    initialStorage: { 'sf.domainProfile': 'station' },
  });
  assert.equal(values.get('sf.domainProfile'), 'commodity');
});

test('isolated-evidence preload rejects unknown profiles and clears stale state', () => {
  const { values } = runPreload({
    env: {
      SPACEFACE_ELECTRON_TEST_MODE: 'isolated-evidence',
      SPACEFACE_DOMAIN_PROFILE: 'commodity-nohist',
    },
    initialStorage: { 'sf.domainProfile': 'commodity' },
  });
  assert.equal(values.has('sf.domainProfile'), false);
});
