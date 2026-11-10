// Sim-stall and unexpected-screen checks. No browser. The frozen-sim case is the
// Code Work master gate on d88f4d5881: swarm active sat at sim 140.1 while fps climbed,
// because a fire click landed on the race-tape Circuits button and opened raceBoard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STALL_MIN_SIM_S, STALL_WINDOW_MS, OPEN_SCREEN_GRACE_MS,
  createPlayWatch, detectSimStall, detectUnexpectedScreen, formatPlayStop,
} from '../scripts/player-truth/playWatch.mjs';
import { checkPlayInterrupted, checkSimStalled } from '../scripts/player-truth/checks.mjs';

const flight = (wall, sim, extra = {}) => ({ wall, sim, t: wall, phase: 'active', mode: 'flight', top: null, boot: false, ...extra });

test('sim stall needs a full minute of active, non-loading flight', () => {
  const moving = [];
  for (let i = 0; i <= 60; i++) moving.push(flight(i * 1000, 100 + i * 0.13));
  assert.equal(detectSimStall(moving), null);
  const almost = [flight(0, 140.1), flight(STALL_WINDOW_MS - 1, 140.1)];
  assert.equal(detectSimStall(almost), null);
  const stalled = [flight(0, 140.1), flight(STALL_WINDOW_MS, 140.1 + STALL_MIN_SIM_S - 0.01)];
  const hit = detectSimStall(stalled);
  assert.ok(hit);
  assert.ok(hit.simAdvanced < STALL_MIN_SIM_S);
  assert.equal(detectSimStall([flight(0, 10), flight(STALL_WINDOW_MS, 10 + STALL_MIN_SIM_S)]), null);
  assert.equal(detectSimStall([flight(0, 10, { boot: true }), flight(STALL_WINDOW_MS, 10, { boot: true })]), null);
  assert.equal(detectSimStall([flight(0, 10, { mode: 'loading' }), flight(STALL_WINDOW_MS, 10, { mode: 'loading' })]), null);
  assert.equal(detectSimStall([flight(0, 10), flight(30_000, 10, { phase: 'draft' }), flight(STALL_WINDOW_MS, 10)]), null);
});

test('a non-HUD screen during active flight is unexpected; the HUD and draft phase are not', () => {
  assert.deepEqual(detectUnexpectedScreen(flight(0, 1, { top: 'raceBoard' })), { top: 'raceBoard' });
  assert.equal(detectUnexpectedScreen(flight(0, 1)), null);
  assert.equal(detectUnexpectedScreen(flight(0, 1, { top: 'hud' })), null);
  assert.equal(detectUnexpectedScreen(flight(0, 1, { top: 'crucibleDraft', phase: 'draft' })), null);
  assert.equal(detectUnexpectedScreen(flight(0, 1, { top: 'raceBoard', boot: true })), null);
});

test('master-gate Circuits click: screen fails as soon as raceBoard covers the HUD, stall fails once sim stays at 140.1 for 60s', () => {
  const watch = createPlayWatch();
  const click = { kind: 'click', x: 900, y: 28, element: 'button.k-word "Circuits"', t: 1_277_000, sim: 140.1 };
  watch.setInputs({ kind: 'key', code: 'Space' }, click);
  for (let i = 0; i <= 30; i++) {
    assert.equal(watch.observe(flight(i * 1000, 110 + i * 0.13)), null);
  }
  const opened = watch.observe(flight(31_000, 140.1, { top: 'raceBoard', t: 1_277_000 }));
  assert.equal(opened.kind, 'screen');
  assert.match(formatPlayStop(watch), /screen raceBoard opened during active play/);
  assert.match(formatPlayStop(watch), /last input key Space/);
  assert.match(formatPlayStop(watch), /click \(900, 28\) on button\.k-word "Circuits"/);
  let stall = null;
  for (let i = 1; i <= 70; i++) {
    const hit = watch.observe(flight(31_000 + i * 1000, 140.1, { top: 'raceBoard' }));
    if (hit && hit.kind === 'stall') stall = hit;
  }
  assert.ok(stall);
  assert.ok(stall.simAdvanced < STALL_MIN_SIM_S);
  assert.ok(stall.wallMs >= STALL_WINDOW_MS);
  const trace = { meta: { playStartSim: 1 }, playWatch: watch.snapshot() };
  const screen = checkPlayInterrupted(trace);
  const frozen = checkSimStalled(trace);
  assert.equal(screen.status, 'FAIL');
  assert.equal(frozen.status, 'FAIL');
  assert.match(screen.detail, /raceBoard/);
  assert.match(screen.detail, /\(900, 28\) on button\.k-word "Circuits"/);
  assert.match(frozen.detail, /140\.1|0\.00 s sim/);
  assert.match(frozen.detail, /top raceBoard/);
  assert.equal(screen.moments.length, 1);
});

test('a screen already up as the phase goes active gets a short grace; one that replaces the HUD does not', () => {
  const draft = createPlayWatch();
  assert.equal(draft.observe(flight(0, 1, { top: 'crucibleDraft' })), null);
  assert.equal(draft.observe(flight(OPEN_SCREEN_GRACE_MS - 1, 1.2, { top: 'crucibleDraft' })), null);
  assert.equal(draft.observe(flight(OPEN_SCREEN_GRACE_MS, 1.2, { top: 'crucibleDraft' })).kind, 'screen');
  const replaced = createPlayWatch();
  replaced.observe(flight(0, 1));
  assert.equal(replaced.observe(flight(100, 1.1, { top: 'raceBoard' })).kind, 'screen');
});

test('a clean watched flight passes both checks, and an unwatched run does not pretend it passed', () => {
  const watch = createPlayWatch();
  for (let i = 0; i <= 10; i++) watch.observe(flight(i * 1000, i * 0.2));
  const trace = { meta: { playStartSim: 0 }, playWatch: watch.snapshot() };
  assert.equal(checkSimStalled(trace).status, 'PASS');
  assert.equal(checkPlayInterrupted(trace).status, 'PASS');
  assert.match(checkSimStalled(trace).value, /\+2 s/);
  assert.equal(checkSimStalled({ meta: {} }).status, 'N/A');
  assert.equal(checkPlayInterrupted({ meta: { playStartSim: 1 } }).status, 'UNKNOWN');
  assert.match(checkPlayInterrupted({ meta: { playStartSim: 1 } }).detail, /not watched/);
});

test('a HUD freeze names the key that was held when no click was recorded', () => {
  const watch = createPlayWatch();
  watch.setInputs({ kind: 'key', code: 'KeyW' }, null);
  watch.observe(flight(0, 50));
  const hit = watch.observe(flight(STALL_WINDOW_MS, 50.1));
  assert.equal(hit.kind, 'stall');
  assert.match(checkSimStalled({ meta: { playStartSim: 0 }, playWatch: watch.snapshot() }).detail, /last input key KeyW/);
  assert.equal(checkPlayInterrupted({ meta: { playStartSim: 0 }, playWatch: watch.snapshot() }).status, 'PASS');
});
