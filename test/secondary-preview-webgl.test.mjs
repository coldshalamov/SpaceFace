import assert from 'node:assert/strict';
import test from 'node:test';

import { secondaryPreviewWebGlBlocked } from '../src/ui/shipPreviewMount.js';

function fakeGl(rendererName, { lost = false, debug = true } = {}) {
  return {
    RENDERER: 0x1f01,
    isContextLost: () => lost,
    getExtension: (name) => (debug && name === 'WEBGL_debug_renderer_info'
      ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
      : null),
    getParameter: (pname) => (pname === 0x9246 || pname === 0x1f01 ? rendererName : ''),
  };
}

test('title and menu keep the authored ship preview context', () => {
  const intel = fakeGl('ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11)');
  assert.equal(secondaryPreviewWebGlBlocked({ mode: 'menu', render: { renderer: { getContext: () => intel } } }, intel), false);
  assert.equal(secondaryPreviewWebGlBlocked(null, intel), false);
});

test('Intel flight and dock block a second hangar WebGL context', () => {
  const intel = fakeGl('ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)');
  const flight = { mode: 'flight', ui: { docked: false }, render: { renderer: { getContext: () => intel } } };
  const docked = { mode: 'flight', ui: { docked: true }, render: { renderer: { getContext: () => intel } } };
  assert.equal(secondaryPreviewWebGlBlocked(flight, intel), true);
  assert.equal(secondaryPreviewWebGlBlocked(docked, intel), true);
});

test('lost main context blocks a second preview even on discrete GPUs', () => {
  const lost = fakeGl('NVIDIA GeForce RTX 4070', { lost: true, debug: false });
  assert.equal(secondaryPreviewWebGlBlocked({ mode: 'flight', ui: { docked: true } }, lost), true);
});

test('discrete GPUs keep the authored berth hangar preview', () => {
  const nvidia = fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)');
  assert.equal(secondaryPreviewWebGlBlocked({
    mode: 'flight',
    ui: { docked: true },
    render: { renderer: { getContext: () => nvidia } },
  }, nvidia), false);
});
