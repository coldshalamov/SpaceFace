import assert from 'node:assert/strict';
import test from 'node:test';

import { secondaryPreviewWebGlBlocked, secondaryPreviewWebGlWhen } from '../src/ui/shipPreviewMount.js';

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

test('a UI preview defers its own WebGL context while the opening or a warm batch holds the GPU queue (D195)', () => {
  // The Swarm armory opens while mode is still 'loading' and the arena cooks behind it. A second
  // context created then waits behind that whole backlog on the main thread (about 18 min on software GL).
  // The deferral must not touch GL: it is polled.
  const trap = { isContextLost: () => { throw new Error('GL touched while deferring'); }, getExtension: () => { throw new Error('GL touched while deferring'); }, getParameter: () => { throw new Error('GL touched while deferring'); } };
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'loading', render: { renderer: { getContext: () => trap } } }, trap), 'defer');
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'flight', render: { swarmDeferredWarm: { pending: true }, renderer: { getContext: () => trap } } }, trap), 'defer');
});

test('a settled GPU queue falls back to the standing per-GPU policy', () => {
  const intel = fakeGl('ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)');
  const nvidia = fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)');
  const settled = { pending: false };
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'flight', ui: { docked: false }, render: { swarmDeferredWarm: settled } }, intel), 'never');
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'flight', ui: { docked: false }, render: { swarmDeferredWarm: settled } }, nvidia), 'allow');
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'flight', ui: { docked: false } }, nvidia), 'allow');
  // No live state (a menu with nothing rendering) and the menu modes keep the authored preview.
  assert.equal(secondaryPreviewWebGlWhen(null, intel), 'allow');
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'menu' }, intel), 'allow');
});

test('software GL keeps the schematic crew: a second context there costs tens of seconds on the CPUs the live one needs', () => {
  const swiftshader = fakeGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)');
  const llvmpipe = fakeGl('llvmpipe (LLVM 15.0.7, 256 bits)');
  const nvidia = fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)');
  const flight = (gl) => ({ mode: 'flight', ui: { docked: false }, render: { renderer: { getContext: () => gl } } });
  assert.equal(secondaryPreviewWebGlWhen(flight(swiftshader), swiftshader), 'never');
  assert.equal(secondaryPreviewWebGlWhen(flight(llvmpipe), llvmpipe), 'never');
  assert.equal(secondaryPreviewWebGlWhen(flight(nvidia), nvidia), 'allow');
  // The standing dock/hangar policy is unchanged: software GL still gets those previews.
  assert.equal(secondaryPreviewWebGlBlocked({ mode: 'flight', ui: { docked: true } }, swiftshader), false);
  // A context that will not answer is not treated as software.
  assert.equal(secondaryPreviewWebGlWhen({ mode: 'flight', ui: { docked: false } }, { getParameter: () => { throw new Error('lost'); } }), 'allow');
});

test('the renderer string is read once per context, not on every policy question', () => {
  // Each read is a synchronous round trip to a GPU process that can be busy linking for seconds.
  let reads = 0;
  const gl = { ...fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)'), getParameter: (pname) => { reads += 1; return pname === 0x9246 ? 'NVIDIA GeForce RTX 4070' : ''; } };
  const state = { mode: 'flight', ui: { docked: false }, render: { renderer: { getContext: () => gl } } };
  for (let i = 0; i < 4; i++) {
    assert.equal(secondaryPreviewWebGlWhen(state, gl), 'allow');
    assert.equal(secondaryPreviewWebGlBlocked(state, gl), false);
  }
  assert.equal(reads, 1);
});
