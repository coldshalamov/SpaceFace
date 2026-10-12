import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitRoundHandoff } from '../scripts/player-truth/run.mjs';

async function withPage({ phases, button = null, onClick = null }, run) {
  const previousWindow = globalThis.window; const previousDocument = globalThis.document;
  const state = { simTime: 60, run: { wave: 1, phase: 'cleanup' } };
  const pending = phases.slice(); const clicks = [];
  const setPhase = (snapshot) => { state.simTime = snapshot.sim ?? state.simTime; state.run = { wave: snapshot.wave, phase: snapshot.phase }; };
  globalThis.window = { SF: { state } };
  globalThis.document = { querySelectorAll: () => button ? [button] : [] };
  const publicButton = {
    async isVisible() { return !!button?.offsetParent; },
    async isEnabled() { return !!button && !button.disabled; },
    async click() {
      assert.ok(button?.offsetParent && !button.disabled, 'only a real available public button is clicked');
      clicks.push(button.textContent); onClick?.(setPhase);
    },
  };
  const page = {
    async waitForFunction(predicate, args) {
      for (let turn = 0; turn <= phases.length; turn++) {
        if (pending.length) setPhase(pending.shift());
        const value = predicate(args);
        if (value) return { jsonValue: async () => value, dispose: async () => {} };
      }
      throw new Error('fixture transition did not become available');
    },
    async evaluate(predicate, args) { return predicate(args); },
    locator() { return { filter: () => ({ first: () => publicButton }) }; },
  };
  try { await run({ page, state, clicks, setPhase }); }
  finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
}

test('native cleanup launches the actual next wave without waiting for or clicking a button', async () => {
  await withPage({ phases: [
    { phase: 'cleanup', wave: 1, sim: 60 }, { phase: 'active', wave: 1, sim: 60.1 },
    { phase: 'active', wave: 2, sim: 62 },
  ], button: { textContent: 'Launch round 2', offsetParent: {}, disabled: true } }, async ({ page, clicks }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1 });
    assert.equal(result.kind, 'active'); assert.equal(result.wave, 2); assert.equal(result.sim, 62);
    assert.equal(typeof result.t, 'number'); assert.deepEqual(clicks, []);
  });
});

test('a genuine public draft launch is clicked once and records its resulting active wave', async () => {
  await withPage({ phases: [{ phase: 'draft', wave: 5, sim: 310 }],
    button: { textContent: 'Launch round 6 Esc', offsetParent: {}, disabled: false },
    onClick: (setPhase) => setPhase({ phase: 'active', wave: 6, sim: 310.2 }),
  }, async ({ page, clicks }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 5 });
    assert.deepEqual(clicks, ['Launch round 6 Esc']);
    assert.equal(result.kind, 'active'); assert.equal(result.wave, 6); assert.equal(result.sim, 310.2);
  });
});

test('automatic activation while the screen capture settles does not click a stale launch control', async () => {
  const button = { textContent: 'Continue', offsetParent: {}, disabled: false };
  await withPage({ phases: [{ phase: 'cleanup', wave: 1, sim: 60 }], button }, async ({ page, clicks, setPhase }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1,
      beforeLaunch: async () => { setPhase({ phase: 'active', wave: 2, sim: 62 }); button.offsetParent = null; },
    });
    assert.equal(result.kind, 'active'); assert.equal(result.wave, 2); assert.deepEqual(clicks, []);
  });
});

test('an ended run or exhausted sim cap leaves the public launch untouched', async () => {
  for (const phase of ['ended', 'victory']) await withPage({ phases: [{ phase, wave: 1, sim: 61 }],
    button: { textContent: 'Continue', offsetParent: {}, disabled: false },
  }, async ({ page, clicks }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1 });
    assert.equal(result.kind, 'terminal'); assert.equal(result.phase, phase); assert.deepEqual(clicks, []);
  });
  await withPage({ phases: [{ phase: 'cleanup', wave: 1, sim: 61 }],
    button: { textContent: 'Continue', offsetParent: {}, disabled: false },
  }, async ({ page, clicks }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1, simLimit: 60 });
    assert.equal(result.kind, 'cap'); assert.deepEqual(clicks, []);
  });
});
