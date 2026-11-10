import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalArtwork, bootstrapLoadingTerminal } from '../src/ui/loadingTerminalArt.js';

test('createTerminalArtwork returns stable control interface', () => {
  const fakeCanvas = {
    getContext: () => ({
      clearRect() {},
      fillRect() {},
      fillText() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
    }),
    getBoundingClientRect: () => ({ width: 640, height: 380, left: 0, top: 0 }),
  };

  const fakeOverlay = {
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const instance = createTerminalArtwork({
    canvas: fakeCanvas,
    overlay: fakeOverlay,
  });

  assert.equal(typeof instance.start, 'function');
  assert.equal(typeof instance.stop, 'function');
  assert.equal(typeof instance.updateProgress, 'function');
  assert.equal(typeof instance.destroy, 'function');

  instance.start();
  instance.updateProgress({ progress: 0.5, id: 'stage_test' });
  instance.stop();
  instance.destroy();
});

test('bootstrapLoadingTerminal handles missing elements gracefully', () => {
  const fakeDoc = {
    getElementById: (id) => null,
  };

  const instance = bootstrapLoadingTerminal(fakeDoc);
  assert.equal(instance, null);
});
