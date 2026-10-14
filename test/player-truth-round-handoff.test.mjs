import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitRoundHandoff, screenshotHudOccluders } from '../scripts/player-truth/run.mjs';

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

test('screenshot occlusion includes the complete target and contact-list dock', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { querySelectorAll(selector) {
    assert.equal(selector, '#hud .sf-rightdock');
    return [
      { offsetParent: {}, getBoundingClientRect: () => ({ left: 1040, top: 90, right: 1280, bottom: 650 }) },
      { offsetParent: null, getBoundingClientRect() { throw new Error('hidden HUD is not a pixel cover'); } },
    ];
  } };
  try { assert.deepEqual(screenshotHudOccluders(), [[1040, 90, 1280, 650]]); }
  finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

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

test('a control disappearing during click waits for native activation', async () => {
  const button = { textContent: 'Launch round 2', offsetParent: {}, disabled: false };
  await withPage({ phases: [{ phase: 'draft', wave: 1 }, { phase: 'active', wave: 2, sim: 62 }], button,
    onClick: (setPhase) => {
      button.offsetParent = null;
      setPhase({ phase: 'wave_intro', wave: 2 });
      throw new Error('locator.click: Timeout 1000ms exceeded');
    },
  }, async ({ page, clicks }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1 });
    assert.equal(result.kind, 'active'); assert.equal(result.wave, 2);
    assert.deepEqual(clicks, ['Launch round 2']);
  });
});

test('an available control with a persistent click failure still reports the error', async () => {
  await withPage({ phases: [{ phase: 'draft', wave: 1 }],
    button: { textContent: 'Launch round 2', offsetParent: {}, disabled: false },
    onClick: () => { throw new Error('persistent click failure'); },
  }, async ({ page }) => {
    const result = await awaitRoundHandoff(page, { previousWave: 1 });
    assert.equal(result.kind, 'launch-error'); assert.match(result.message, /persistent click failure/);
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
