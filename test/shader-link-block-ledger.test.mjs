// The link-block ledger: every first-use draw that blocked on a still-linking program is recorded
// (milliseconds, program name, a short stack for the long ones). The 2026-10-13 launch profile put
// 19 s of a 61 s launch in exactly this wait; the ledger names each stall so a change is judged by
// the stall it removes on any host load.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLinkBlockLedger, installShaderLinkReporter } from '../src/render/shaderLinkReporter.js';

const COMPLETION_STATUS_KHR = 0x82cf;
const LINK_STATUS = 0x8b82;

function harness({ complete = false } = {}) {
  const state = { complete };
  const gl = {
    LINK_STATUS,
    isContextLost: () => false,
    getExtension: (name) => (name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR } : null),
    getProgramParameter: (program, pname) => (pname === COMPLETION_STATUS_KHR ? state.complete : true),
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
  };
  const renderer = {
    debug: { checkShaderErrors: true },
    info: { programs: [] },
    userData: {},
    domElement: { addEventListener() {} },
    getContext: () => gl,
  };
  installShaderLinkReporter(renderer);
  return { renderer, state };
}

// Shaped like three's WebGLProgram; its first use "blocks" for a controllable time.
function program(name, firstUseMs = 0) {
  let cached;
  const firstUse = () => {
    if (cached === undefined) {
      const until = performance.now() + firstUseMs;
      while (performance.now() < until) { /* the driver link: the main thread waits */ }
      cached = { discovered: true };
    }
    return cached;
  };
  return { name, type: 'ShaderMaterial', program: { id: name }, getUniforms: () => firstUse(), getAttributes: () => firstUse() };
}

test('a draw that waits on a still-linking program is recorded with its name and time', () => {
  const { renderer } = harness({ complete: false });
  const ledger = renderer.userData.spacefaceLinkBlocks;
  assert.ok(ledger, 'the ledger is published on the renderer for the launch probes');
  assert.equal(ledger.count, 0);

  const slow = program('SlowHullPaint', 25);
  renderer.info.programs.push(slow);
  slow.getUniforms();

  assert.equal(ledger.count, 1);
  assert.equal(ledger.waits, 1, 'one real wait');
  assert.equal(ledger.programs, 1, 'on one program');
  assert.ok(ledger.totalMs >= 20, `recorded the wait: ${ledger.totalMs.toFixed(1)} ms`);
  assert.equal(ledger.worst.length, 1);
  assert.equal(ledger.worst[0].name, 'SlowHullPaint');
  assert.ok(ledger.worst[0].ms >= 20);
  assert.equal(typeof ledger.worst[0].stack, 'string', 'a long wait carries a stack naming the draw');
  assert.equal(ledger.byName.SlowHullPaint.count, 1);
});

test('a program that has already settled is never recorded', () => {
  const { renderer } = harness({ complete: true });
  const ledger = renderer.userData.spacefaceLinkBlocks;
  const fine = program('Settled', 0);
  renderer.info.programs.push(fine);
  fine.getUniforms();
  fine.getAttributes();
  assert.equal(ledger.count, 0, 'a settled link costs no wait, so nothing is logged');
});

test('the second accessor of one program adds a draw-path call but no wait', () => {
  const { renderer } = harness({ complete: false });
  const ledger = renderer.userData.spacefaceLinkBlocks;
  const p = program('Once', 12);
  renderer.info.programs.push(p);
  p.getUniforms();
  assert.equal(ledger.count, 1);
  const afterFirst = ledger.totalMs;
  p.getAttributes();
  assert.equal(ledger.count, 2, 'the second accessor is still a draw-path call (and costs ~nothing)');
  assert.equal(ledger.waits, 1, 'only the first-use call was a real wait');
  assert.equal(ledger.programs, 1);
  assert.ok(ledger.totalMs - afterFirst < 5, 'but it adds no wait: the first-use work was already done');
});

test('the worst list is bounded, longest first, and reset clears everything', () => {
  const ledger = createLinkBlockLedger();
  const { renderer } = harness({ complete: false });
  renderer.userData.spacefaceLinkBlocks.reset();
  const real = renderer.userData.spacefaceLinkBlocks;
  for (let i = 0; i < 30; i++) {
    const p = program(`P${i}`, i % 3);
    renderer.info.programs.push(p);
    p.getUniforms();
  }
  assert.equal(real.count, 30);
  assert.ok(real.worst.length <= 24, `bounded: ${real.worst.length}`);
  for (let i = 1; i < real.worst.length; i++) assert.ok(real.worst[i - 1].ms >= real.worst[i].ms, 'sorted longest first');
  real.reset();
  assert.equal(real.count, 0);
  assert.equal(real.totalMs, 0);
  assert.equal(real.worst.length, 0);
  assert.deepEqual(Object.keys(real.byName), []);
  assert.equal(ledger.count, 0, 'a standalone ledger starts empty');
});
