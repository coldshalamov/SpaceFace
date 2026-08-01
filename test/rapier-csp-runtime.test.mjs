import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createRapierCspFunctionConstructor,
  withRapierCspFunctionBridge,
} from '../src/core/rapierCompatRuntime.js';

test('Rapier CSP bridge permits only wasm-bindgen legacy global lookup', () => {
  const globalObject = {};
  const SafeFunction = createRapierCspFunctionConstructor(globalObject);

  assert.equal(new SafeFunction('return this')(), globalObject);
  assert.equal(new SafeFunction(' return this; ')(), globalObject);
  assert.throws(() => new SafeFunction('return globalThis'), /rejected dynamic JavaScript source/);
  assert.throws(() => new SafeFunction('value', 'return value'), /rejected dynamic JavaScript source/);
});

test('Rapier CSP bridge restores the native Function binding after success or failure', async () => {
  const original = function NativeFunctionFixture() {};
  const globalObject = {};
  Object.defineProperty(globalObject, 'Function', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: original,
  });

  const result = await withRapierCspFunctionBridge(async () => {
    assert.notEqual(globalObject.Function, original);
    return new globalObject.Function('return this')();
  }, globalObject);
  assert.equal(result, globalObject);
  assert.equal(globalObject.Function, original);

  await assert.rejects(
    withRapierCspFunctionBridge(async () => {
      throw new Error('init failed');
    }, globalObject),
    /init failed/,
  );
  assert.equal(globalObject.Function, original);
});

test('Rapier CSP bridge can retain its capability-limited constructor for lazy Electron lookups', async () => {
  const original = function NativeFunctionFixture() {};
  const globalObject = {};
  Object.defineProperty(globalObject, 'Function', {
    configurable: true,
    writable: true,
    value: original,
  });

  await withRapierCspFunctionBridge(async () => true, globalObject, { retainAfterSuccess: true });
  assert.notEqual(globalObject.Function, original);
  assert.equal(new globalObject.Function('return this')(), globalObject);
  assert.throws(() => new globalObject.Function('return globalThis'), /rejected dynamic JavaScript source/);
});
