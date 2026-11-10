import assert from 'node:assert/strict';
import test from 'node:test';
import { newGameScreen } from '../src/ui/screens/newGame.js';

function observeFormAccess(navigator, coarse = false) {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  let reads = 0;
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: coarse }) });
    newGameScreen._emitEmbarkSpec.call({ get _embarkSpecActive() { reads++; return false; } });
    return reads;
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
    if (oldMatchMedia) Object.defineProperty(globalThis, 'matchMedia', oldMatchMedia);
    else delete globalThis.matchMedia;
  }
}

test('iPhone form never enters whole-sector speculative preparation', () => {
  assert.equal(observeFormAccess({ userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 }), 0);
});

test('tablet with desktop user agent also defers speculative preparation', () => {
  assert.equal(observeFormAccess({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5 }, true), 0);
});

test('desktop form retains its ordinary speculation path', () => {
  assert.equal(observeFormAccess({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 }), 1);
});
