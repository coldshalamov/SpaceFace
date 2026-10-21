import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { captureCharonVfxIsolation, charonVfxIsolationPageOperation } from '../scripts/lib/charonVfxIsolation.mjs';

function fixture({ missing = false, active = false, hideThrows = false, restoreThrows = false,
  screenshotThrows = false, exhaustOnScreenshot = false, restoreTimeout = false, restoredCaptureThrows = false, advanceFrames = true } = {}) {
  let clock = 10000, count = 10, hides = 0, restores = 0;
  const files = [], actions = [];
  const api = { inspect: () => ({ active }), hideAll() { hides++; active = true;
    if (hideThrows) throw new Error('partial hide failure'); },
    restore() { restores++; if (restoreThrows) throw new Error('restore failure'); active = false; } };
  const render = { get presentCount() { return count; }, perfVfxIsolation: missing ? undefined : api };
  const context = vm.createContext({ window: { SF: { state: { render } } }, Date: { now: () => clock } });
  const page = {
    async evaluate(fn, arg) {
      actions.push(arg.action);
      if (restoreTimeout && arg.action === 'restore') return new Promise(() => {});
      if (arg.action === 'sample' && advanceFrames) count++;
      context.arg = arg;
      return vm.runInContext(`(${fn.toString()})(arg)`, context);
    },
    async screenshot(options) {
      if (restoreTimeout) clock = 19999;
      if (restoredCaptureThrows && files.length) throw new Error('restored capture failure');
      if (exhaustOnScreenshot) { clock = 30000; throw new Error('capture exceeded deadline'); }
      if (screenshotThrows) throw new Error('capture failure');
      files.push(options.path);
    },
  };
  const options = { deadline: 20000, now: () => clock, sleep: async ms => { clock += ms; }, mkdirFn: async () => {} };
  return { page, options, context, files, actions, api, state: () => ({ active, hides, restores }) };
}

test('captures isolated and restored diagnostic views after real count advancement, never acceptance', async () => {
  const f = fixture(); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'diagnostic-pair-captured');
  assert.equal(r.visualAcceptance, false); assert.equal(r.readinessEvidence, false);
  assert.match(r.label, /never visual readiness or acceptance/);
  assert.equal(r.screenshots.length, 2);
  assert.match(r.screenshots[0].path, /vfx-isolated-diagnostic\.png$/);
  assert.match(r.screenshots[1].path, /vfx-restored-diagnostic\.png$/);
  assert.ok(r.restoredPresentCount > r.isolatedPresentCount);
  assert.ok(r.screenshots.every(s => s.diagnosticOnly && s.visualAcceptance === false));
  assert.deepEqual(f.state(), { active: false, hides: 1, restores: 1 });
});

test('no work when deadline is absent, exhausted, or too short', async () => {
  for (const deadline of [undefined, 9000, 10500]) {
    const f = fixture(); const r = await captureCharonVfxIsolation(f.page, { ...f.options, deadline });
    assert.equal(r.status, 'skipped'); assert.equal(f.actions.length, 0);
    assert.equal(f.state().hides, 0);
  }
});

test('missing API and preexisting active isolation are untouched', async () => {
  for (const options of [{ missing: true }, { active: true }]) {
    const f = fixture(options); const r = await captureCharonVfxIsolation(f.page, f.options);
    assert.equal(r.status, 'skipped'); assert.equal(f.files.length, 0);
    assert.equal(f.state().hides, 0); assert.equal(f.state().restores, 0);
    assert.equal(f.state().active, options.active === true);
  }
});

test('partially failed hide still restores the exact owner port', async () => {
  const f = fixture({ hideThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().restores, 1); assert.equal(f.state().active, false);
  assert.equal(f.files.length, 0);
});

test('screenshot failure restores in finally and reports incomplete, not acceptance', async () => {
  const f = fixture({ screenshotThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().restores, 1); assert.equal(r.visualAcceptance, false);
});

test('restoration failure is explicit and never marked verified', async () => {
  const f = fixture({ restoreThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.equal(f.state().restores, 1);
  assert.equal(f.files.length, 1);
});

test('deadline exhaustion still dispatches restoration but does not assert its outcome', async () => {
  const f = fixture({ exhaustOnScreenshot: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.equal(f.state().restores, 1);
  assert.match(r.errors.join(' '), /outcome unverified/);
});

test('no fabricated frame: a stalled presentation skips image and restores', async () => {
  const f = fixture({ advanceFrames: false }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(f.files.length, 0);
  assert.equal(f.state().restores, 1); assert.equal(r.restoration.verified, true);
});

test('cleanup fences a delayed begin and never restores somebody else’s active isolation', async () => {
  const f = fixture();
  const args = { token: 'late-operation', deadline: 20000 };
  await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'restore' });
  const result = await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'begin' });
  assert.equal(result.skipped, 'begin-cancelled'); assert.equal(f.state().hides, 0);
  await f.page.evaluate(charonVfxIsolationPageOperation, { token: 'other', deadline: 20000, action: 'begin' });
  await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'restore' });
  assert.equal(f.state().active, true); assert.equal(f.state().restores, 0);
});


test('restore transport timeout is reported as unverified rather than success', async () => {
  const f = fixture({ restoreTimeout: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.ok(f.actions.includes('restore'));
  assert.match(r.errors.join(' '), /timed out/);
});

test('restored screenshot failure does not erase verified restoration', async () => {
  const f = fixture({ restoredCaptureThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().active, false); assert.equal(r.screenshots.length, 1);
});
