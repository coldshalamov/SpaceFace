import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the shipping probe's functions, replacing only its browser/module/timer transport.
// Optional source text allows the same cases to discriminate the immutable public baseline.
const source = process.env.SF_CONFIRM_OBSERVATION_SOURCE_TEXT
  || readFileSync(new URL('../scripts/check-confirm-dialog-safety.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function openConfirm(page, opts) {');
const end = source.indexOf('async function focusedConfirmRole(page)', start);
assert.ok(start >= 0 && end > start, 'production observation functions located');
const observationSource = source.slice(start, end).replace(
  "await import('/src/ui/confirm.js')", 'await loadConfirmModule()');

function fixture({ missing = false } = {}) {
  const window = {};
  let current = null, opener = null, resolve;
  const document = {
    activeElement: null,
    body: { appendChild(el) { el.isConnected = true; opener = el; }, classList: { contains: () => true } },
    getElementById: () => opener,
    createElement: () => ({ isConnected: false, focus() { document.activeElement = this; } }),
    querySelector: () => current,
  };
  const original = { isConnected: true, getAttribute: () => null };
  const button = { classList: { contains: (name) => name === 'sf-confirm__cancel' } };
  const mod = {
    confirm() {
      current = missing ? null : original;
      document.activeElement = button;
      return new Promise((res) => { resolve = res; });
    },
    isConfirmOpen: () => !!current,
  };
  const factory = new Function('document', 'window', 'requestAnimationFrame', 'setTimeout',
    'loadConfirmModule', 'CONFIRM_RESULT_TIMEOUT_MS',
    observationSource + '\nreturn { openConfirm, waitForConfirmResult };');
  const observation = factory(document, window, (fn) => fn(), (fn) => fn(), async () => mod, 30000);
  const page = {
    evaluate: (fn, arg) => fn(arg),
    waitForFunction: async (fn, arg, opts) => {
      assert.equal(opts.timeout, 30000, 'production timeout retained');
      assert.equal(fn(arg), true, 'result must settle before observation');
    },
  };
  return {
    ...observation, page, original, window,
    async settle({ retained = false, restored = true, value = true } = {}) {
      original.isConnected = retained;
      current = retained ? original : null;
      document.activeElement = restored ? opener : button;
      resolve(value);
      await Promise.resolve();
    },
    replace() { current = { isConnected: true }; document.activeElement = button; },
    removeLater() { current = null; original.isConnected = false; document.activeElement = opener; },
  };
}

test('legitimate replacement cannot masquerade as failed teardown of the accepted dialog', async () => {
  const h = fixture(); await h.openConfirm(h.page, { danger: true });
  await h.settle(); h.replace();
  const result = await h.waitForConfirmResult(h.page);
  assert.equal(result.result, true);
  assert.equal(result.dialogOpen, false, 'accepted original must be detached');
});

test('focus restoration is captured at settlement, before a later dialog legitimately takes focus', async () => {
  const h = fixture(); await h.openConfirm(h.page, { danger: true });
  await h.settle({ value: false }); h.replace();
  const result = await h.waitForConfirmResult(h.page);
  assert.equal(result.result, false);
  assert.equal(result.focusRestored, true);
});

test('genuinely retained original remains detectable', async () => {
  const h = fixture(); await h.openConfirm(h.page, {});
  await h.settle({ retained: true });
  const result = await h.waitForConfirmResult(h.page);
  assert.equal(result.dialogOpen, true);
  assert.throws(() => assert.equal(result.dialogOpen, false), assert.AssertionError);
});

test('late removal cannot conceal failed teardown at promise resolution', async () => {
  const h = fixture(); await h.openConfirm(h.page, {});
  await h.settle({ retained: true }); h.removeLater();
  assert.equal((await h.waitForConfirmResult(h.page)).dialogOpen, true);
});

test('failed focus restoration remains detectable even if focus is repaired later', async () => {
  const h = fixture(); await h.openConfirm(h.page, {});
  await h.settle({ restored: false }); h.removeLater();
  const result = await h.waitForConfirmResult(h.page);
  assert.equal(result.focusRestored, false);
  assert.throws(() => assert.equal(result.focusRestored, true), assert.AssertionError);
});

test('a missing original dialog fails closed rather than passing absence as teardown', async () => {
  const h = fixture({ missing: true });
  await assert.rejects(() => h.openConfirm(h.page, {}), /did not mount/);
});
