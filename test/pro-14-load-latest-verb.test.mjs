// PRO-14 — the death screen offers Load latest beside the recovery key.
//
// The Done sentence: a focused test proves the after-action model exposes selectLatestOccupiedSlot's
// result as a verb that loads through the trusted-slot confirmation, and that Ironman deaths do not
// expose it. The "do not": bypass the slot-trust confirmation, offer it in Ironman.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { selectLatestOccupiedSlot } from '../src/save/saveSystem.js';
import { afterActionModel, isIronmanDeath } from '../src/ui/screens/gameOver.js';
import { loadConfirmBody, slotConfirmSummary } from '../src/ui/screens/saveLoad.js';

const OLD = '2026-09-01T00:00:00.000Z';
const NEW = '2026-09-29T00:00:00.000Z';

// A slot index shaped like the live one: meta rows with savedAt, plus an empty slot.
function slotIndex(extra = {}) {
  return {
    auto: { savedAt: NEW, playtimeS: 900, credits: 4242, sectorName: 'Helios' },
    quick: { savedAt: OLD, playtimeS: 120, credits: 10 },
    slot2: { playtimeS: 300, savedAt: '2026-09-15T00:00:00.000Z' },
    slot3: {},
    ...extra,
  };
}

function ctxWith(slots, difficulty = 'standard') {
  return {
    state: {
      save: { slots, currentSlot: 'auto' },
      settings: { gameplay: { difficulty } },
      combat: { lastPlayerDefeat: { causeId: 'wreck' } },
    },
  };
}

// ---------------------------------------------------------------------------------------
// The Done sentence — the model
// ---------------------------------------------------------------------------------------

test('PRO-14: the model exposes the newest occupied slot as a load verb', () => {
  const ctx = ctxWith(slotIndex());
  const model = afterActionModel(ctx);
  // The model must agree with the save system's own rule, not a second copy of it.
  assert.equal(model.latestSlot, selectLatestOccupiedSlot(ctx.state.save.slots),
    'the model resolves the latest slot through the save system rule');
  assert.equal(model.loadLatestSlot, model.latestSlot, 'the verb names that slot');
  assert.equal(model.canLoadLatest, true);
  assert.equal(model.ironman, false);
});

test('PRO-14: an empty slot is never a load target', () => {
  // slot3 exists but has no savedAt/playtimeS — occupied-ness is the save system rule, so the
  // model must not treat a listed-but-empty slot as something to load.
  const ctx = ctxWith({ auto: { savedAt: NEW, playtimeS: 5 }, empty: {} });
  const model = afterActionModel(ctx);
  assert.equal(model.latestSlot, 'auto');
  assert.notEqual(model.loadLatestSlot, 'empty');
});

test('PRO-14: with no saves at all the verb is simply not offered', () => {
  const model = afterActionModel(ctxWith({}));
  assert.equal(model.canLoadLatest, false);
  assert.equal(model.loadLatestSlot, null);
  assert.equal(model.ironman, false, 'an empty drawer is not Ironman');
});

test('PRO-14: Ironman deaths do not expose the verb at all', () => {
  const ctx = ctxWith(slotIndex(), 'ironman');
  assert.equal(isIronmanDeath(ctx), true);
  const model = afterActionModel(ctx);
  assert.equal(model.ironman, true);
  assert.equal(model.canLoadLatest, false, 'Ironman must not offer Load latest');
  assert.equal(model.loadLatestSlot, null);
  // And it must not leak the slot it resolved, so no later code can pick it up by accident.
  assert.equal(model.latestSlot, null, 'Ironman does not even name a target slot');
});

test('PRO-14: the verb survives every non-ironman difficulty', () => {
  for (const difficulty of ['casual', 'standard', 'veteran']) {
    const model = afterActionModel(ctxWith(slotIndex(), difficulty));
    assert.equal(model.canLoadLatest, true, `${difficulty} offers the verb`);
    assert.equal(model.ironman, false);
  }
  // A missing difficulty setting must not be mistaken for ironman.
  assert.equal(isIronmanDeath({ state: {} }), false);
});
// ---------------------------------------------------------------------------------------
// The Done sentence — routed through the trusted-slot confirmation
// ---------------------------------------------------------------------------------------

test('PRO-14: the confirmation the verb shows is the save browser own sentence', () => {
  // The verb must reuse loadConfirmBody verbatim, so the death screen can never drift into
  // quieter, safer-sounding wording than the browser uses for the same destructive action.
  const slots = slotIndex();
  const id = selectLatestOccupiedSlot(slots);
  const body = loadConfirmBody(id, slots[id]);
  assert.ok(body.includes(slotConfirmSummary(slots[id])), 'the summary is the real slot summary');
  assert.match(body, /Unsaved progress is lost/, 'the warning survives');
  assert.match(body, /replace your current game/i, 'the verb names what is replaced');
});

test('PRO-14: the death screen routes the load through that confirmation', () => {
  const src = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
  // One confirm() call, with the shared body and danger: true — never a bare game:load on click.
  assert.match(src, /const ok = await confirm\(\{/, 'the click goes through confirm()');
  assert.match(src, /body: loadConfirmBody\(id, meta\)/, 'it uses the shared trusted-slot sentence');
  assert.match(src, /danger: true/, 'a destructive load is marked dangerous');
  // The slot is re-resolved at click time, so a slot that vanished cannot be loaded.
  assert.match(src, /const model = afterActionModel\(ctx\);[\s\S]{0,200}if \(!model\.canLoadLatest\)/,
    'the click re-checks the model instead of trusting build time');
  // game:load may only fire AFTER the confirmation resolves true.
  const confirmAt = src.indexOf('const ok = await confirm({');
  const loadAt = src.indexOf("ctx.bus.emit('game:load'");
  assert.ok(confirmAt > 0 && loadAt > confirmAt, 'the load is emitted after the confirmation');
  assert.match(src, /if \(!ok\) return;/, 'a declined confirmation does not load');
});

test('PRO-14: the verb sits in the after-action row beside the recovery key', () => {
  const src = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
  const retry = src.indexOf("wordItem(list, 'Continue from recovery berth'");
  const latest = src.indexOf("wordItem(list, 'Load latest'");
  const loadSave = src.indexOf("wordItem(list, 'Load save'");
  assert.ok(retry > 0 && latest > 0 && loadSave > 0, 'all three verbs are built');
  assert.ok(latest > retry, 'Load latest comes after the recovery key — beside it, not before');
  assert.ok(loadSave > retry, 'the full save browser still sits next to the recovery key');
  // Both save routes remain: the quick one and the browser. The browser is not replaced by it.
  assert.ok(loadSave > 0 && latest > 0, 'the death screen keeps both save routes');
  assert.match(src, /\[this\._retryButton, this\._latestButton, this\._loadButton/,
    'the verb is part of the row dressing');
});

// ---------------------------------------------------------------------------------------
// Go-beyond: the two unavailable reasons must not share a lie
// ---------------------------------------------------------------------------------------

test('PRO-14: Ironman hides the verb, an empty drawer explains itself', () => {
  const src = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
  assert.match(src, /if \(model\.ironman\) \{\s*button\.hidden = true;/,
    'Ironman withdraws the verb rather than greying it with an excuse');
  assert.match(src, /No save to load yet/,
    'an empty drawer says the true reason instead of blaming the difficulty');
  assert.match(src, /button\.removeAttribute\('title'\);\s*button\.removeAttribute\('aria-label'\);/,
    'the withdrawn verb leaves no dangling label');
});

test('PRO-14: the model tolerates a half-built state', () => {
  // The screen is built during route transitions; state.save may not exist yet.
  for (const ctx of [{}, { state: {} }, { state: { save: {} } }, { state: { save: { slots: null } } }]) {
    const model = afterActionModel(ctx);
    assert.equal(model.canLoadLatest, false);
    assert.equal(model.loadLatestSlot, null);
  }
});