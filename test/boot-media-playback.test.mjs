import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootMediaPlayback, BOOT_MEDIA } from '../src/ui/bootMediaPlayback.js';

class Video extends EventTarget {
  constructor() {
    super(); this.paused = true; this.readyState = 4; this.duration = 17.5;
    this.time = 0; this.seeks = []; this.plays = 0; this.loads = 0; this.frames = new Map(); this.next = 0;
  }
  get currentTime() { return this.time; }
  set currentTime(value) { this.time = value; this.seeks.push(value); }
  load() { this.loads++; this.paused = true; }
  play() { this.plays++; this.paused = false; return this.playResult || Promise.resolve(); }
  pause() { this.paused = true; }
  requestVideoFrameCallback(fn) { const id = ++this.next; this.frames.set(id, fn); return id; }
  cancelVideoFrameCallback(id) { this.frames.delete(id); }
  present(time) {
    this.time = time;
    const frames = [...this.frames.values()]; this.frames.clear();
    for (const fn of frames) fn(0, { mediaTime: time });
  }
  event(type) { this.dispatchEvent(new Event(type)); }
}
function fixture(options = {}) {
  const video = new Video(), timers = new Map(), states = []; let serial = 0, fallbacks = 0;
  const host = { setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  const ctl = createBootMediaPlayback({ video, host, onState: s => states.push(s),
    onFallback: () => fallbacks++, ...options });
  return { video, ctl, states, timers, fallbacks: () => fallbacks,
    deadline() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); } };
}
const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };

test('readiness requires two distinct presented media frames, not play fulfillment', async () => {
  const f = fixture(); let settled = false;
  f.ctl.ready.then(() => { settled = true; }); f.ctl.start(); await microtasks();
  assert.equal(settled, false);
  f.video.present(1); f.video.present(1); await microtasks(); assert.equal(settled, false);
  f.video.present(1.042); const result = await f.ctl.ready;
  assert.equal(result.proofFrames, 2); assert.equal(result.status, 'video');
  assert.equal(f.video.frames.size, 0, 'native video needs no per-frame JS once proof is complete');
  assert.equal(f.timers.size, 0); f.ctl.destroy();
});
test('hundreds of starts never seek, reload, or restart a playing cinematic', async () => {
  const f = fixture(); f.ctl.start(); await microtasks();
  f.video.present(6); f.video.present(6.1);
  for (let i = 0; i < 300; i++) f.ctl.start();
  assert.equal(f.video.loads, 1); assert.equal(f.video.plays, 1);
  assert.deepEqual(f.video.seeks, []); assert.equal(f.video.currentTime, 6.1); f.ctl.destroy();
});
test('stop and resume retain movie position and require no fresh download', async () => {
  const f = fixture(); f.ctl.start(); await microtasks(); f.video.present(7); f.video.present(7.1);
  f.ctl.stop(); assert.equal(f.video.paused, true); assert.equal(f.video.frames.size, 0);
  f.ctl.start(); await microtasks();
  assert.equal(f.video.plays, 2); assert.equal(f.video.loads, 1); assert.deepEqual(f.video.seeks, []);
  assert.equal(f.video.currentTime, 7.1); f.ctl.destroy();
});
test('startup deadline releases boot but late decoded frames recover the movie', async () => {
  const f = fixture(); f.ctl.start(); f.deadline();
  assert.equal((await f.ctl.ready).reason, 'startup-media-deadline');
  assert.equal(f.fallbacks(), 0, 'slow networking must not start a competing renderer');
  f.video.present(1); f.video.present(1.1); assert.equal(f.ctl.inspect().status, 'video'); f.ctl.destroy();
});
test('error tries original movie once, then falls back exactly once', async () => {
  const f = fixture(); f.ctl.start(); f.video.event('error');
  assert.equal(f.video.src, BOOT_MEDIA.original); f.video.event('error'); f.video.event('error');
  assert.equal(f.fallbacks(), 1); assert.equal((await f.ctl.ready).status, 'fallback');
  f.ctl.start(); assert.equal(f.video.loads, 2); f.ctl.destroy();
});
test('reduced-flash variant never falls through to a flashier movie', async () => {
  const f = fixture({ flashReduced: () => true }); f.ctl.start();
  assert.equal(f.video.src, BOOT_MEDIA.quiet); f.video.event('error');
  assert.equal(f.video.loads, 1); assert.equal(f.fallbacks(), 1); f.ctl.destroy();
});
test('reduced motion starts on a still without downloading or playing a movie', async () => {
  let reduced = true; const f = fixture({ motionReduced: () => reduced }); f.ctl.start();
  assert.equal((await f.ctl.ready).reason, 'reduced-motion');
  assert.equal(f.video.plays, 0); assert.equal(f.video.loads, 0);
  reduced = false; f.ctl.refresh(); f.video.present(1); f.video.present(1.1);
  assert.equal(f.ctl.inspect().status, 'video'); f.ctl.destroy();
});
test('motion preference changes pause and resume without rewinding or stale poster state', async () => {
  let reduced = false; const f = fixture({ motionReduced: () => reduced }); f.ctl.start(); await microtasks();
  f.video.present(2); f.video.present(2.1);
  reduced = true; f.ctl.refresh(); assert.equal(f.video.paused, true);
  reduced = false; f.ctl.refresh(); await microtasks(); f.video.present(2.2); f.video.present(2.3);
  assert.equal(f.ctl.inspect().status, 'video'); assert.deepEqual(f.video.seeks, []); f.ctl.destroy();
});
test('a real variant switch preserves media position, ordinary refreshes do not seek', async () => {
  let quiet = false; const f = fixture({ flashReduced: () => quiet }); f.ctl.start(); await microtasks();
  f.video.present(5); f.video.present(5.1); quiet = true; f.ctl.refresh();
  assert.equal(f.video.src, BOOT_MEDIA.quiet); f.video.event('loadedmetadata');
  assert.deepEqual(f.video.seeks, [5.1]);
  for (let i = 0; i < 100; i++) f.ctl.refresh();
  assert.deepEqual(f.video.seeks, [5.1]); f.ctl.destroy();
});
test('late play rejection after stop cannot revive or destroy a hidden surface', async () => {
  const f = fixture(); let reject;
  f.video.playResult = new Promise((_r, fail) => { reject = fail; }); f.ctl.start(); f.ctl.stop();
  reject(new Error('aborted by pause')); await microtasks();
  assert.equal(f.video.paused, true); assert.equal(f.fallbacks(), 0); assert.equal(f.video.loads, 1); f.ctl.destroy();
});
test('visibility hold pauses decoding; visibility return resumes the same position', async () => {
  let hidden = false; const f = fixture({ hidden: () => hidden }); f.ctl.start(); await microtasks();
  f.video.present(4); f.video.present(4.1); hidden = true; f.ctl.refresh();
  assert.equal(f.video.paused, true); hidden = false; f.ctl.refresh();
  assert.equal(f.video.paused, false); assert.equal(f.video.currentTime, 4.1); f.ctl.destroy();
});
test('real buffering has a recovery path without reload or seeking', async () => {
  const f = fixture(); f.ctl.start(); f.video.present(3); f.video.present(3.1);
  f.video.event('waiting'); assert.equal(f.ctl.inspect().status, 'buffering');
  f.video.present(3.2); f.video.present(3.3); assert.equal(f.ctl.inspect().status, 'video');
  assert.equal(f.video.loads, 1); assert.deepEqual(f.video.seeks, []); f.ctl.destroy();
});
test('old hosts prove advancing decoded time without requestVideoFrameCallback', async () => {
  const f = fixture(); f.video.requestVideoFrameCallback = undefined; f.ctl.start();
  f.video.time = 1; f.video.event('timeupdate'); f.video.time = 1.1; f.video.event('timeupdate');
  assert.equal((await f.ctl.ready).status, 'video'); f.ctl.destroy();
});
test('destroy cancels proof, listeners and deadline, and settles a pending caller', async () => {
  const f = fixture(); f.ctl.start(); const pending = [...f.video.frames.values()]; f.ctl.destroy();
  assert.equal((await f.ctl.ready).status, 'destroyed'); assert.equal(f.timers.size, 0);
  assert.equal(f.video.frames.size, 0); f.video.event('error');
  for (const fn of pending) fn(0, { mediaTime: 1 });
  assert.equal(f.fallbacks(), 0); assert.equal(f.ctl.inspect().status, 'destroyed');
});
