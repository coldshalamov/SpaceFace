import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../src/audio/audioSystem.js';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function hostFor(ctx) {
  const host = Object.create(audio);
  host.rt = { ctx, _lifecycleSuspended: false, _resumeAfterLifecycle: true, _contextEverRan: true };
  host.starts = 0;
  host.resumes = 0;
  host._startFrameLoop = () => host.starts++;
  host._resumeMusicSchedulers = () => host.resumes++;
  return host;
}

test('a superseded device resume cannot start audio in the next runtime', async () => {
  const pending = deferred();
  const ctx = { state: 'suspended', resume: () => pending.promise };
  const host = hostFor(ctx);
  const promise = host._resumeAudioContext(true);
  host.rt = { ctx: { state: 'suspended' }, _lifecycleSuspended: false, _contextEverRan: false };
  ctx.state = 'running';
  pending.resolve();
  await promise;
  assert.equal(host.starts, 0);
  assert.equal(host.resumes, 0);
  assert.equal(host.rt._contextEverRan, false);
});

test('a dead graph cannot restart its loop when a delayed resume resolves', async () => {
  const pending = deferred();
  const ctx = { state: 'suspended', resume: () => pending.promise };
  const host = hostFor(ctx);
  const promise = host._resumeAudioContext(true);
  host.rt._destroyed = true;
  ctx.state = 'running';
  pending.resolve();
  await promise;
  assert.equal(host.starts, 0);
});

test('an old suspension completing cannot resume the new autoplay-locked graph', async () => {
  const pending = deferred();
  const host = hostFor({ state: 'running', suspend: () => pending.promise });
  host._suspendRunningContext();
  const old = host.rt;
  host.rt = { ctx: { state: 'suspended' }, _lifecycleSuspended: false };
  let attempts = 0;
  host._resumeAudioContext = () => attempts++;
  pending.resolve();
  await old._lifecycleSuspendPromise;
  assert.equal(attempts, 0);
});

test('a delayed lifecycle-return continuation cannot act on a reinitialized runtime bag', async () => {
  const pending = deferred();
  const host = hostFor({ state: 'suspended' });
  host.rt._lifecycleSuspendPromise = pending.promise;
  host.resumeFromLifecycle();
  host.rt.ctx = { state: 'suspended' };
  let attempts = 0;
  host._resumeAudioContext = () => attempts++;
  pending.resolve();
  await pending.promise;
  assert.equal(attempts, 0);
});
