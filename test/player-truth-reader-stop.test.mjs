// The flight tape's Circuits button used to take a fightBeat click. The race board
// froze sim time and the in-page reader kept every frame until the heap died.
// A HUD hit, a closing page, or 30s of wall time with no drain stops that loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installPlayerTruthReader, isFlightHudControlEvent, readerStopReason, READER_UNDRAINED_MS,
} from '../src/testing/playerTruth/reader.js';
import { PAGE_STALL_MS } from '../scripts/player-truth/driver.mjs';

function controlTarget(tag, label, { screen = false } = {}) {
  const screens = screen ? { closest() { return screens; } } : null;
  const control = {
    tagName: tag,
    innerText: label,
    closest(sel) {
      if (sel === '#screens') return screens;
      if (String(sel).includes('button')) return control;
      return null;
    },
  };
  return control;
}

test('readerStopReason names a HUD hit, a closed page, and 30s without a drain', () => {
  assert.ok(READER_UNDRAINED_MS > PAGE_STALL_MS, 'the undrained window must outlast one stalled evaluate');
  assert.equal(readerStopReason({}), null);
  assert.match(readerStopReason({ hudLabel: 'Circuits' }), /fightBeat hit a HUD control \(Circuits\)/);
  assert.equal(readerStopReason({ pageClosing: true, hudLabel: 'Circuits' }), 'player-truth: page closed');
  assert.match(readerStopReason({ undrainedMs: READER_UNDRAINED_MS, sampleCount: 1 }), /samples were not drained/);
  assert.equal(readerStopReason({ undrainedMs: READER_UNDRAINED_MS - 1, sampleCount: 60 * 30 }), null);
  assert.equal(readerStopReason({ undrainedMs: READER_UNDRAINED_MS, sampleCount: 0 }), null);
  assert.equal(readerStopReason({ undrainedMs: PAGE_STALL_MS, sampleCount: 60 * (PAGE_STALL_MS / 1000) }), null);
});

test('a canvas click is not a HUD hit, and a #screens button is the route', () => {
  const canvas = { tagName: 'CANVAS', closest() { return null; } };
  assert.equal(isFlightHudControlEvent({ type: 'mousedown', target: canvas }, 'flight'), false);
  const circuits = controlTarget('BUTTON', 'Circuits');
  assert.equal(isFlightHudControlEvent({ type: 'mousedown', target: circuits }, 'flight'), true);
  assert.equal(isFlightHudControlEvent({ type: 'keydown', code: 'Space', target: circuits }, 'flight'), true);
  assert.equal(isFlightHudControlEvent({ type: 'keydown', code: 'KeyW', target: circuits }, 'flight'), false);
  assert.equal(isFlightHudControlEvent({ type: 'mousedown', target: circuits }, 'menu'), false);
  const launch = controlTarget('BUTTON', 'Launch round 2', { screen: true });
  assert.equal(isFlightHudControlEvent({ type: 'mousedown', target: launch }, 'flight'), false);
});

function fakeWindow() {
  let raf = null;
  let nowMs = 0;
  const listeners = new Map();
  const win = {
    performance: { now: () => nowMs },
    advance(ms) { nowMs += ms; },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    removeEventListener(name, fn) {
      const list = listeners.get(name) || [];
      listeners.set(name, list.filter((f) => f !== fn));
    },
    requestAnimationFrame(fn) { raf = fn; return 1; },
    cancelAnimationFrame() { raf = null; },
    SF: {
      state: { mode: 'flight', simTime: 1, playerId: 1, entityList: [], render: {} },
      THREE: { Vector3: class { set() { return this; } }, Box3: class {} },
    },
    fire(name, ev) {
      for (const fn of listeners.get(name) || []) fn(ev);
    },
    step() { if (raf) raf(); },
  };
  return win;
}

test('a Circuits mousedown stops the reader; a Launch click does not', () => {
  const win = fakeWindow();
  const reader = installPlayerTruthReader(win);
  reader.start();
  win.fire('mousedown', { isTrusted: true, type: 'mousedown', button: 0, target: controlTarget('BUTTON', 'Launch round 2', { screen: true }) });
  assert.equal(reader.drain().fatal, null);
  win.fire('mousedown', { isTrusted: true, type: 'mousedown', button: 0, target: controlTarget('BUTTON', 'Circuits') });
  const drained = reader.drain();
  assert.match(drained.fatal, /fightBeat hit a HUD control \(Circuits\)/);
  win.step();
  assert.equal(reader.drain().samples.length, 0, 'the loop does not keep sampling after the hit');
});

test('60 fps across the evaluate stall window does not stop the reader', () => {
  const win = fakeWindow();
  const reader = installPlayerTruthReader(win);
  reader.start();
  const frames = 60 * (PAGE_STALL_MS / 1000);
  for (let i = 0; i < frames; i++) {
    win.advance(1000 / 60);
    win.step();
  }
  const drained = reader.drain();
  assert.equal(drained.fatal, null);
  assert.equal(drained.samples.length, frames);
});

test('no drain for 30s of wall time stops the reader', () => {
  const win = fakeWindow();
  const reader = installPlayerTruthReader(win);
  reader.start();
  win.advance(1);
  win.step();
  win.advance(READER_UNDRAINED_MS - 2);
  win.step();
  win.advance(5);
  win.step();
  const drained = reader.drain();
  assert.equal(drained.samples.length, 3);
  assert.match(drained.fatal, /samples were not drained/);
  win.step();
  assert.equal(reader.drain().samples.length, 0);
});

test('a drain resets the undrained clock', () => {
  const win = fakeWindow();
  const reader = installPlayerTruthReader(win);
  reader.start();
  win.advance(1);
  win.step();
  assert.equal(reader.drain().fatal, null);
  win.advance(READER_UNDRAINED_MS + 1000);
  win.step();
  const drained = reader.drain();
  assert.equal(drained.fatal, null);
  assert.equal(drained.samples.length, 1);
});

test('pagehide stops the reader and drops the buffer', () => {
  const win = fakeWindow();
  const reader = installPlayerTruthReader(win);
  reader.start();
  win.step();
  win.fire('pagehide', {});
  const drained = reader.drain();
  assert.equal(drained.fatal, 'player-truth: page closed');
  assert.equal(drained.samples.length, 0);
});
