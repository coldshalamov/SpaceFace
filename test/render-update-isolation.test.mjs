import assert from 'node:assert/strict';
import test from 'node:test';

import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';

function phase() {
  const calls = [];
  return {
    calls,
    render: {
      prepareFrame() {
        calls.push('prepare');
        return true;
      },
      drawPreparedFrame() {
        calls.push('draw');
      },
    },
    vfx: {
      update() {
        calls.push('vfx');
      },
    },
    feel: {
      frame() {
        calls.push('feel');
      },
    },
    ui: {
      frame() {
        calls.push('ui');
      },
    },
    state: { ui: { docked: false } },
  };
}

test('a VFX throw still paints feel and HUD and accepts the presentation frame', (t) => {
  t.mock.method(console, 'error', () => {});
  const ctx = phase();
  ctx.vfx.update = () => {
    ctx.calls.push('vfx');
    throw new Error('snap particle owner invalid');
  };

  const accepted = runRenderUpdatePhase({
    ...ctx,
    alpha: 1,
    frameDt: 1 / 60,
  });

  assert.equal(accepted, true);
  assert.deepEqual(ctx.calls, ['prepare', 'vfx', 'draw', 'feel', 'ui']);
});

test('a prepare-frame throw still paints HUD, skips draw, then rethrows the world error', () => {
  const ctx = phase();
  const worldError = new Error('prepare failed');
  ctx.render.prepareFrame = () => {
    ctx.calls.push('prepare');
    throw worldError;
  };

  assert.throws(() => runRenderUpdatePhase({
    ...ctx,
    alpha: 1,
    frameDt: 1 / 60,
  }), worldError);
  assert.deepEqual(ctx.calls, ['prepare', 'vfx', 'feel', 'ui']);
});

test('a feel throw still paints HUD, then rethrows', () => {
  const ctx = phase();
  const feelError = new Error('feel failed');
  ctx.feel.frame = () => {
    ctx.calls.push('feel');
    throw feelError;
  };

  assert.throws(() => runRenderUpdatePhase({
    ...ctx,
    alpha: 1,
    frameDt: 1 / 60,
  }), feelError);
  assert.deepEqual(ctx.calls, ['prepare', 'vfx', 'draw', 'feel', 'ui']);
});

test('docked presentation skips the world pass and still paints HUD', () => {
  const ctx = phase();
  ctx.state.ui.docked = true;

  const accepted = runRenderUpdatePhase({
    ...ctx,
    alpha: 1,
    frameDt: 1 / 60,
  });

  assert.equal(accepted, false);
  assert.deepEqual(ctx.calls, ['feel', 'ui']);
});
