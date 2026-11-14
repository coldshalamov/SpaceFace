import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { navigateToFleetLookReady } from '../scripts/lib/fleetLookReadiness.mjs';

test('a fatal module error ends startup without waiting for the readiness deadline', async () => {
  const page = new EventEmitter();
  page.goto = () => new Promise(() => {});
  page.waitForFunction = () => { throw new Error('must not be reached'); };
  const pending = navigateToFleetLookReady(page, 'http://localhost/', { timeoutMs: 600000 });
  page.emit('pageerror', new SyntaxError("The requested module '/partsLibrary.js' does not provide an export named 'changed'"));
  await assert.rejects(pending, { code: 'FLEET_LOOK_FATAL_STARTUP' });
  assert.equal(page.listenerCount('pageerror'), 0);
});

test('a nonfatal page error does not prevent a ready capture', async () => {
  const page = new EventEmitter();
  let resolveReady;
  page.goto = async () => {};
  page.waitForFunction = () => new Promise((resolve) => { resolveReady = resolve; });
  const pending = navigateToFleetLookReady(page, 'http://localhost/', { timeoutMs: 1000 });
  await Promise.resolve();
  page.emit('pageerror', new Error('optional asset unavailable'));
  resolveReady('ready');
  assert.equal(await pending, 'ready');
  assert.equal(page.listenerCount('pageerror'), 0);
});
