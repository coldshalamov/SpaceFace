import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReaderDrain, preparationSnapshot, awaitPreparationChoice, launchPreparationChoice } from '../scripts/player-truth/run.mjs';
import { fitFreeStartingGun } from '../scripts/player-truth/routes.mjs';

async function withPreparation({ buttons, run = { kind: 'survival', ruleset: 'swarm', phase: 'draft', wave: 0 } }, fn) {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const state = { mode: 'flight', simTime: 0, run };
  globalThis.window = { SF: { state } };
  globalThis.document = { querySelectorAll: () => buttons };
  const clicks = [];
  const page = { async waitForFunction(predicate, args, options) {
    assert.equal(options.timeout, Array.isArray(args) ? 240000 : 600000, 'existing public route limits are retained');
    const value = predicate(args); assert.ok(value, 'fixture exposes a genuine available preparation state');
    return { jsonValue: async () => value, dispose: async () => {} };
  }, locator() { return { filter({ hasText }) { return { first() { return { async click() {
    const button = buttons.find((b) => b.offsetParent && !b.disabled && b.textContent.includes(hasText));
    assert.ok(button, 'only an available public button can be clicked');
    clicks.push(button.textContent); button.onClick?.();
  } }; } }; } }; } };
  try { await fn({ page, state, clicks }); }
  finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
}

test('the initial public Rearm choice is available without waiting for an absent Launch label', async () => {
  await withPreparation({ buttons: [
    { textContent: 'Launch round 1 Esc', offsetParent: null, disabled: false },
    { textContent: 'Continue', offsetParent: {}, disabled: true },
    { textContent: 'Keep current loadout Esc', offsetParent: {}, disabled: false },
  ] }, async ({ page }) => {
    const ready = await awaitPreparationChoice(page, { ruleset: 'swarm' });
    assert.deepEqual(ready, { kind: 'launch', word: 'Keep current loadout', ruleset: 'swarm', phase: 'draft' });
  });
});

test('preparation observes real activation and refuses to certify another native ruleset', async () => {
  await withPreparation({ buttons: [], run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 } }, async ({ page }) => {
    assert.equal((await awaitPreparationChoice(page, { ruleset: 'swarm' })).kind, 'active');
  });
  await withPreparation({ buttons: [{ textContent: 'Keep current loadout Esc', offsetParent: {}, disabled: false }],
    run: { kind: 'survival', ruleset: 'scored', phase: 'draft', wave: 0 } }, async ({ page }) => {
    await assert.rejects(awaitPreparationChoice(page, { ruleset: 'swarm' }), /expected survival\/swarm.*survival\/scored.*draft/);
  });
});

test('the actor answers public Keep current loadout and waits for actual requested native activation', async () => {
  const keep = { textContent: 'Keep current loadout Esc', offsetParent: {}, disabled: false };
  await withPreparation({ buttons: [keep] }, async ({ page, state, clicks }) => {
    keep.onClick = () => { state.run.phase = 'active'; state.run.wave = 1; };
    const ready = await awaitPreparationChoice(page, { ruleset: 'swarm' });
    const active = await launchPreparationChoice(page, { ruleset: 'swarm', word: ready.word });
    assert.deepEqual(clicks, ['Keep current loadout Esc']);
    assert.equal(active.kind, 'active'); assert.equal(active.ruleset, 'swarm'); assert.equal(active.wave, 1);
  });
});

test('a legitimate public refit choice resumes the requested native run', async () => {
  const keep = { textContent: 'Keep current loadout Esc', offsetParent: {}, disabled: false };
  await withPreparation({ buttons: [keep], run: { kind: 'survival', ruleset: 'swarm', phase: 'refit', wave: 0 } },
    async ({ page, state, clicks }) => {
      keep.onClick = () => { state.run.phase = 'active'; state.run.wave = 1; };
      const ready = await awaitPreparationChoice(page, { ruleset: 'swarm' });
      assert.equal(ready.phase, 'refit');
      const active = await launchPreparationChoice(page, { ruleset: 'swarm', word: ready.word });
      assert.deepEqual(clicks, ['Keep current loadout Esc']);
      assert.equal(active.kind, 'active'); assert.equal(active.ruleset, 'swarm');
    });
});

test('a hidden or held public preparation choice does not advance the actor', async () => {
  await withPreparation({ buttons: [
    { textContent: 'Keep current loadout Esc', offsetParent: null, disabled: false },
    { textContent: 'Launch round 1 Esc', offsetParent: {}, disabled: true },
  ] }, () => assert.equal(preparationSnapshot({ ruleset: 'swarm' }), null));
});

test('the ordinary free shelf audits a public fit against zero charge and the exact fitted instance', async () => {
  const savedWindow = globalThis.window;
  try {
    assert.equal(await fitFreeStartingGun({ getByRole() { return { isVisible: async () => false }; } }), null);
    for (const defect of [null, 'charge', 'wrong instance']) {
      const defId = 'wpn_autocannon_s';
      const start = { credits: 0, modifiers: [] };
      const ship = { fittings: [null], fittedInstances: {} };
      const clicks = [];
      let receipt = null;
      globalThis.window = { SF: { state: { run: start, player: { ownedShips: [ship], activeShipIndex: 0 } },
        registry: new Map([['survivalDraft', { preparationReceipt: () => receipt }]]) } };
      const price = { text: 'Free' };
      const page = {
        getByRole(role, { name, exact }) {
          if (role === 'heading') {
            assert.equal(name, 'Starting guns');
            assert.equal(exact, true);
            return { isVisible: async () => true };
          }
          assert.equal(role, 'button');
          assert.match('Fit free: Autocannon S', name);
          return { async click() {
            assert.deepEqual(clicks, ['inspect']);
            clicks.push('fit');
            receipt = { offerId: 'sidearm', outcome: 'accepted', name: 'Autocannon S', defId, slotIndex: 0,
              price: defect === 'charge' ? 18 : 0, charged: defect === 'charge' };
            ship.fittings[0] = defId;
            ship.fittedInstances[0] = { defId, instanceId: 'mi_0_1' };
            start.modifiers.push({ startingEquipment: true, offerId: 'sidearm', defId, slotIndex: 0,
              instanceId: defect === 'wrong instance' ? 'mi_0_2' : 'mi_0_1' });
          } };
        },
        locator(selector, opts) {
          if (selector === '.sf-cru-price') { assert.match(price.text, opts.hasText); return price; }
          assert.match(selector, /:visible:not\(\.is-unavail\):not\(\.is-fitted\)$/);
          return { filter({ has }) { assert.equal(has, price); return { first: () => ({
            getAttribute: async name => { assert.equal(name, 'data-offer-id'); return 'sidearm'; },
            click: async () => { clicks.push('inspect'); },
          }) }; } };
        },
        evaluate: async fn => fn(),
        async waitForFunction(fn, arg) {
          const accepted = fn(arg);
          if (!accepted) throw new Error('no matching free fit receipt');
          return { jsonValue: async () => accepted };
        },
      };
      if (defect) await assert.rejects(fitFreeStartingGun(page), /no matching free fit receipt/);
      else assert.deepEqual(await fitFreeStartingGun(page), { ...receipt, instanceId: 'mi_0_1', credits: 0 });
      assert.deepEqual(clicks, ['inspect', 'fit']);
    }
  } finally { globalThis.window = savedWindow; }
});

test('long paused preparation drains stay bounded while all actual opening samples and input receipts survive', () => {
  const trace = { meta: { rounds: true }, samples: [], events: [], longTasks: [], keys: [] };
  const active = { f: 1, mode: 'flight', sim: 3.6, run: { ph: 'active', w: 1 }, p: {}, e: [[97, 2, 1, 2, 0, 0]] };
  const input = { ev: 'input', kind: 'mousedown', tgt: 'CANVAS', sim: 3.7, t: 20 };
  const kill = { ev: 'killed', sim: 3.8, id: 97, byPlayer: false };
  for (let batch = 0; batch < 400; batch++) {
    const samples = Array.from({ length: 90 }, (_, n) => ({ f: 2 + batch * 90 + n,
      mode: 'flight', sim: 4, run: { ph: 'draft', w: 1 }, e: [[97, 2, 1, 2, 0, 0]] }));
    if (batch === 0) samples.unshift(active);
    appendReaderDrain(trace, { samples, events: batch === 0 ? [input, kill] : [],
      longTasks: batch === 0 ? [{ t: 21, duration: 300 }] : [], keys: ['authored-key'], firstInput: input });
    assert.ok(trace.samples.length <= 121, 'paused preparation cannot grow the retained dense sample buffer');
  }
  assert.strictEqual(trace.samples[0], active, 'the first active frame is never replaced by a later round poll');
  assert.deepEqual(trace.events, [input, kill]);
  assert.strictEqual(trace.firstInput, input);
  assert.deepEqual(trace.keys, ['authored-key']);
  assert.equal(trace.longTasks.length, 1);
  const nextActive = { ...active, f: 40000, sim: 4.1 };
  appendReaderDrain(trace, { samples: [nextActive], events: [], longTasks: [], keys: ['authored-key'], firstInput: input });
  assert.ok(trace.samples.includes(nextActive));
  trace.meta.playStartSim = 3.6;
  const afterStart = Array.from({ length: 200 }, (_, f) => ({ f: 40001 + f, mode: 'flight', sim: 4.2, run: { ph: 'draft', w: 1 }, e: [] }));
  appendReaderDrain(trace, { samples: afterStart, events: [], longTasks: [], keys: ['authored-key'], firstInput: input });
  assert.deepEqual(trace.samples.slice(-200), afterStart, 'after play starts no round transition or other recorded sample is discarded');
});

test('ordinary Adventure flight is preserved even before the actor has announced spawn', () => {
  const trace = { meta: { rounds: false }, samples: [], events: [], longTasks: [], keys: [] };
  const samples = Array.from({ length: 300 }, (_, f) => ({ f, mode: 'flight', sim: f / 60, run: { ph: 'inactive' }, e: [] }));
  appendReaderDrain(trace, { samples, events: [], longTasks: [], keys: [] });
  assert.deepEqual(trace.samples, samples);
});
