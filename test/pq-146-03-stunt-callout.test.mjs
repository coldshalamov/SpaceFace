// PQ-146 Phase 3 — the game NAMES what the player just did (Crucible presentation).
//
// Pure, deterministic: a synthetic round is played through the REAL stunt combo accounting
// (src/systems/stuntCombo.js — the single writer), and the callout/results builders are asserted
// against what that round actually produced. No DOM required except a minimal double for the
// overlay mount, and no sim clock — every builder takes its tick explicitly.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bankActive,
  createComboState,
  recordBridge,
  recordTrick,
} from '../src/systems/stuntCombo.js';
import { stuntRoundRows, trickCountRows } from '../src/systems/survivalResults.js';
import {
  CALLOUT_TTL_MS,
  bankCalloutText,
  calloutNow,
  calloutTextFor,
  comboReadout,
  createStuntCallout,
  ensureStuntCallout,
  releaseStuntCallout,
  trickCalloutName,
  trickSpokenText,
} from '../src/ui/stuntCallout.js';

/** A detector-shaped trick for one id, with the evidence the scoring contract requires. */
function trickFor(over = {}) {
  const id = over.trickId ?? 'wrecking_ball';
  const names = {
    wrecking_ball: 'Wrecking Ball',
    bank_job: 'Bank Job',
    bolas: 'Bolas',
  };
  const families = { wrecking_ball: 'tether', bank_job: 'rebound', bolas: 'tether' };
  return {
    schemaVersion: 2,
    actorId: 1,
    trickId: id,
    name: names[id] ?? id,
    rarity: 'uncommon',
    family: families[id] ?? null,
    episodeId: over.episodeId ?? 'ep1',
    tick: 600,
    modifiers: { razorRelease: null, collateralCount: 1, closeShave: false },
    victimLives: [{ lifeId: `v-${over.episodeId ?? 'ep1'}`, threatClass: 'boss', dead: true }],
    metrics: { payloadMass: 20, playerDryHullMass: 20, usefulDeltaV: 0, referenceCruise: 100 },
    ...over,
  };
}

/** A fresh boss-budget trick lands its full candidate style (no victim-budget clamp). */
test('the callout names the act and its earned modifiers as one line', () => {
  assert.equal(
    trickCalloutName(trickFor({ modifiers: { razorRelease: 'razor', collateralCount: 3, closeShave: false } })),
    'Razor Wrecking Ball · Collateral ×3',
  );
  assert.equal(trickCalloutName(trickFor({ trickId: 'bolas', name: 'Bolas' })), 'Bolas');
  assert.equal(trickCalloutName(null), '');
  // An unknown id still names itself from its words — never "undefined" on the glass.
  assert.match(trickCalloutName(trickFor({ trickId: 'mystery_move', name: null })), /Mystery Move/);
  assert.equal(trickSpokenText(trickFor({ modifiers: { razorRelease: null, collateralCount: 3, closeShave: false } })),
    'Wrecking Ball, Collateral times 3');
});

test('the open chain reads out its names, multiplier, window and banked total', () => {
  const combo = createComboState();
  assert.equal(comboReadout(combo, 600), null, 'no open line, no meter');
  assert.equal(comboReadout(null, 600), null);

  assert.ok(recordTrick(combo, trickFor({
    modifiers: { razorRelease: 'razor', collateralCount: 3, closeShave: false },
  })) > 0, 'the synthetic act is entitled to raw style');
  let readout = comboReadout(combo, 600);
  assert.ok(readout.active);
  assert.deepEqual(readout.names, ['Razor Wrecking Ball · Collateral ×3']);
  assert.equal(readout.multiplier, 1, 'one act starts at ×1.00');
  assert.equal(readout.windowFrac, 1, 'the window is full the tick the line opens');
  assert.ok(readout.windowLeftS <= 5 && readout.windowLeftS > 4.9, 'a five-second window');

  assert.ok(recordTrick(combo, trickFor({ trickId: 'bank_job', episodeId: 'ep2', tick: 660 })) > 0);
  assert.ok(recordBridge(combo, { kind: 'close_shave', tick: 670, setupId: 's1', preventedInterception: true }),
    'a close shave is an eligible bridge');
  readout = comboReadout(combo, 670);
  assert.deepEqual(readout.names, ['Razor Wrecking Ball · Collateral ×3', 'Bank Job']);
  assert.equal(readout.multiplier, 1.5, 'two acts from two families: ×1.50');
  assert.equal(readout.bridges, 1, 'one bridge notch');
  assert.ok(readout.windowFrac < 1 && readout.windowFrac > 0.9, 'the scale has begun to drain');
  assert.ok(readout.points > 0 && Number.isInteger(readout.points), 'raw style rides the readout');

  // A bridge-extended window drains against the window the line actually earned.
  const later = comboReadout(combo, 1000);
  assert.ok(later.windowLeftS < readout.windowLeftS, 'the window shrinks with the sim tick');
});

test('banking closes the meter and the receipt names what settled', () => {
  const combo = createComboState();
  recordTrick(combo, trickFor());
  recordTrick(combo, trickFor({ trickId: 'bank_job', episodeId: 'ep2', tick: 660 }));
  const amount = bankActive(combo, { tick: 700 });
  assert.ok(amount > 0);
  assert.equal(comboReadout(combo, 700), null, 'a settled chain is not a meter');
  const bank = combo.banks.at(-1);
  assert.match(bankCalloutText(bank), /Banked \+\d+ · ×1\.50/);
  assert.match(bankCalloutText({ ...bank, reason: 'hard_crash', multiplier: 1 }), /Crash settle \+\d+/);
  assert.doesNotMatch(bankCalloutText({ ...bank, reason: 'hard_crash', multiplier: 1 }), /×/, 'a crash settles at ×1 and says so');
  assert.equal(bankCalloutText(null), '');
});

function playSyntheticRound() {
  const combo = createComboState();
  recordTrick(combo, trickFor({
    modifiers: { razorRelease: 'razor', collateralCount: 3, closeShave: false },
  }));
  recordTrick(combo, trickFor({ trickId: 'bank_job', episodeId: 'ep2', tick: 660 }));
  bankActive(combo, { tick: 700 });
  recordTrick(combo, trickFor({ episodeId: 'ep3', tick: 900 }));
  bankActive(combo, { tick: 1100 });
  return combo;
}

test('the round rows name the top tricks with counts, the best chain and the banked total', () => {
  const combo = playSyntheticRound();
  const rows = stuntRoundRows(combo);
  const byLabel = new Map(rows);
  assert.deepEqual(byLabel.get('Wrecking Ball'), '×2 · 185 style', 'two episodes, style summed');
  assert.deepEqual(byLabel.get('Bank Job'), '×1 · 90 style');
  assert.match(byLabel.get('Best chain'), /^2 tricks · \d+ banked$/, 'the combo chain keeps its own word');
  assert.ok(Number(byLabel.get('Banked style')) > 0, 'the banked total is printed');
  assert.ok(rows.findIndex(([l]) => l === 'Wrecking Ball') < rows.findIndex(([l]) => l === 'Bank Job'),
    'higher counts lead');
});

test('an act is counted once however many mirrors carry it, and rows are deterministic', () => {
  const combo = playSyntheticRound();
  // combo.lastTricks mirrors the last chain's acts, which also live in the settled bank —
  // the episode dedupe must hold the count at the truth.
  assert.ok(combo.lastTricks.length > 0 && combo.banks.length > 0);
  const rows = stuntRoundRows(combo);
  assert.deepEqual(stuntRoundRows(combo), rows, 'same snapshot, same rows');
  assert.deepEqual(stuntRoundRows(JSON.parse(JSON.stringify(combo))), rows, 'rows survive the results clone');
  assert.deepEqual(trickCountRows(null), [], 'no combo, no rows — an honest empty');
  assert.deepEqual(stuntRoundRows({}), [], 'a combo with no named acts prints nothing');
  const capped = trickCountRows(playSyntheticRound(), { limit: 1 });
  assert.equal(capped.length, 1, 'the limit bounds the column');
});

/* --- the Crucible overlay, mounted against a minimal document double. ----------------------- */

function fakeElement(tag) {
  const el = {
    tag,
    children: [],
    attributes: {},
    className: '',
    textContent: '',
    hidden: false,
    parentNode: null,
    classList: {
      add(...names) { for (const n of names) if (!el._classes.has(n)) el._classes.add(n); },
      remove(...names) { for (const n of names) el._classes.delete(n); },
      contains(name) { return el._classes.has(name); },
      toggle(name, on) { const want = on === undefined ? !el._classes.has(name) : !!on; if (want) el._classes.add(name); else el._classes.delete(name); return want; },
    },
    _classes: new Set(),
    style: {
      setProperty(name, value) { el._styles[name] = String(value); },
      removeProperty(name) { delete el._styles[name]; },
      display: '',
      left: '',
    },
    _styles: {},
    setAttribute(name, value) { el.attributes[name] = String(value); },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) {
      el.children = el.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
  };
  return el;
}

function fakeDocument() {
  const doc = {
    head: fakeElement('head'),
    body: fakeElement('body'),
    documentElement: fakeElement('html'),
  };
  doc.getElementById = () => null;
  doc.createElement = (tag) => fakeElement(tag);
  return doc;
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) { handlers.set(event, cb); return () => handlers.delete(event); },
    emit(event, payload) { const cb = handlers.get(event); if (cb) cb(payload); },
  };
}

function calloutState(combo, over = {}) {
  return {
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    mode: 'flight',
    ui: { screenStack: [] },
    tick: 670,
    playerId: 1,
    stunts: { combo },
    settings: { video: { motionReduce: false } },
    ...over,
  };
}

test('the overlay names the trick, meters the chain and banks out loud — Crucible only', () => {
  const doc = fakeDocument();
  const bus = fakeBus();
  const combo = createComboState();
  const state = calloutState(combo);
  const owner = createStuntCallout({ state, bus, doc });
  assert.ok(owner.root, 'the layer mounts');

  recordTrick(combo, trickFor({
    modifiers: { razorRelease: 'razor', collateralCount: 3, closeShave: false },
  }));
  bus.emit('stunt:trickDetected', trickFor({
    modifiers: { razorRelease: 'razor', collateralCount: 3, closeShave: false },
  }));
  owner.update(0);
  let text = calloutTextFor(owner.root);
  assert.match(text, /Razor Wrecking Ball · Collateral ×3/, 'the act is named on the glass');
  assert.match(text, /×1\.00/, 'the multiplier rides the meter');

  recordTrick(combo, trickFor({ trickId: 'bank_job', episodeId: 'ep2', tick: 660 }));
  bus.emit('stunt:trickAmended', trickFor({ trickId: 'bank_job', episodeId: 'ep2', tick: 660 }));
  owner.update(10);
  text = calloutTextFor(owner.root);
  assert.match(text, /Bank Job/, 'the second act joins the line');
  assert.match(text, /×1\.50/, 'the meter follows the multiplier');
  assert.match(text, /window/, 'the chain window carries its seconds');

  bus.emit('stunt:styleBanked', { bankId: 1, tick: 700, reason: 'quiet', points: 345, raw: 230, multiplier: 1.5, acts: [] });
  owner.update(20);
  text = calloutTextFor(owner.root);
  assert.match(text, /Banked \+345 · ×1\.50/, 'the bank receipt names what settled');

  // Scope law: outside a live survival flight the layer is dark and hears nothing.
  const adventure = createStuntCallout({ state: calloutState(combo, { run: null, mode: 'adventure' }), bus: fakeBus(), doc: fakeDocument() });
  bus.emit('stunt:trickDetected', trickFor({ episodeId: 'epX' }));
  adventure.update(0);
  assert.ok(adventure.root.hidden, 'adventure flight never sees a score popup');
  assert.equal(calloutTextFor(adventure.root), '', 'and nothing rendered into it');

  owner.destroy();
  assert.equal(owner.root.parentNode, null, 'destroy unmounts the layer');
});

test('the overlay gates on the run, the stack and the clock; lines expire, reduce motion is static', () => {
  const doc = fakeDocument();
  const bus = fakeBus();
  const combo = createComboState();
  const state = calloutState(combo);
  const owner = createStuntCallout({ state, bus, doc });

  assert.equal(owner.update(0), false, 'a paused menu (modal open) stays dark');
  assert.ok(owner.root.hidden);
  state.ui.screenStack = ['pause'];
  bus.emit('stunt:trickDetected', trickFor());
  assert.equal(owner.update(0), false, 'receipts behind a modal are ignored');
  state.ui.screenStack = [];
  state.run.phase = 'inactive';
  owner.update(0);
  assert.ok(owner.root.hidden, 'an inactive run is dark');
  state.run.phase = 'active';
  assert.ok(owner.update(0) === false, 'nothing to show yet');

  bus.emit('stunt:trickDetected', trickFor());
  const firstLine = owner.root.children[0].children[0];
  assert.ok(firstLine.classList.contains('sf-stuntcall__rise'), 'full motion rises in');
  const t0 = calloutNow();
  owner.update(t0 + 1);
  assert.ok(!owner.root.hidden, 'the callout is up');
  assert.equal(owner.active(), true);
  assert.ok(owner.update(t0 + 2), 'the frame listener stays alive while a line is up');

  // Expiry is wall-clock driven: the driver passes values on the layer's own exported clock. The
  // lines die, and the open chain's meter alone would keep the layer awake — so bank the chain
  // out to assert the full sleep.
  owner.update(t0 + CALLOUT_TTL_MS + 50);
  assert.doesNotMatch(calloutTextFor(owner.root.children[0]), /Wrecking Ball/, 'expired callouts leave the glass');
  bankActive(combo, { tick: 2000 });
  assert.equal(owner.update(t0 + CALLOUT_TTL_MS + 60), false, 'expired lines and a closed chain put the layer to sleep');
  assert.ok(owner.root.hidden, 'nothing lingers');

  state.settings.video.motionReduce = true;
  bus.emit('stunt:trickDetected', trickFor({ episodeId: 'ep2', trickId: 'bank_job', tick: 660 }));
  const reducedLine = owner.root.children[0].children.at(-1);
  assert.ok(!reducedLine.classList.contains('sf-stuntcall__rise'), 'reduce motion is a static cut');

  // A second mount is the same layer; destroy unmounts.
  owner.destroy();
  assert.equal(owner.root.parentNode, null, 'destroy unmounts the layer');
});

test('the mount is node-inert and the singleton release is safe without a document', () => {
  const inert = createStuntCallout({ doc: {} });
  assert.equal(inert.root, null, 'no document, no layer');
  assert.equal(inert.active(), false);
  assert.doesNotThrow(() => inert.update(0));
  const held = ensureStuntCallout({ state: null, bus: null });
  assert.equal(held.root, null, 'node tests hold an inert mount');
  assert.doesNotThrow(() => releaseStuntCallout());
  assert.doesNotThrow(() => releaseStuntCallout(), 'release is idempotent');
});
