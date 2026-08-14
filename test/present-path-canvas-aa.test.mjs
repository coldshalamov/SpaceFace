import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESENT_ROUTE,
  defaultPresentRoute,
  resolveWebGlRendererFlags,
  shouldEnableCanvasAntialias,
} from '../src/render/presentPath.js';
import { createGameState } from '../src/core/gameState.js';

test('default video settings still enable bloom and do not lower scale or particles', () => {
  const video = createGameState(1).settings.video;
  assert.equal(video.bloom, true);
  assert.ok(video.renderScale >= 1);
  assert.equal(video.particleQuality, 'medium');
  assert.ok(video.pixelRatioCap >= 2);
  assert.equal(defaultPresentRoute(video), PRESENT_ROUTE.BLOOM);
});

test('default bloom/graph present path does not request canvas MSAA', () => {
  assert.equal(shouldEnableCanvasAntialias({ presentRoute: PRESENT_ROUTE.BLOOM }), false);
  assert.equal(shouldEnableCanvasAntialias({ presentRoute: PRESENT_ROUTE.GRAPH }), false);
  const flags = resolveWebGlRendererFlags({ video: createGameState(1).settings.video });
  assert.equal(flags.antialias, false);
  assert.equal(flags.preserveDrawingBuffer, false);
  assert.equal(flags.presentRoute, PRESENT_ROUTE.BLOOM);
});

test('native straight-to-canvas fallback is the only path that keeps canvas MSAA', () => {
  assert.equal(shouldEnableCanvasAntialias({ presentRoute: PRESENT_ROUTE.STRAIGHT }), true);
  assert.equal(shouldEnableCanvasAntialias({ nativeFallback: true }), true);
  const flags = resolveWebGlRendererFlags({
    presentRoute: PRESENT_ROUTE.STRAIGHT,
    preserveDrawingBuffer: true,
  });
  assert.equal(flags.antialias, true);
  assert.equal(flags.preserveDrawingBuffer, true);
});
