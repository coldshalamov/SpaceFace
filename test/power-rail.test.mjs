// J06 Power Rail — the slot-claim contract and binding resolution.
//
// Claim precedence is the part of this feature most likely to break quietly: a stale claim that is
// never released, or a prompt opening on top of a prompt, degrades into "the number keys stopped
// working" rather than a crash. These run headless against the pure exports so the contract is
// pinned without driving nine buttons through a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveImpulseChargeCapacity } from '../src/systems/impulseCharges.js';
import {
  SWEEP_CIRCUMFERENCE,
  RAIL_SLOTS,
  BAND_DRIVE,
  BAND_PULL,
  BAND_SHOVE,
  BAND_PIN,
  BAND_RIG,
  BAND_BAY,
  BAND_LINE,
  POWER_SLOT,
  CLAIM_SINGLE,
  CLAIM_PARTIAL,
  CLAIM_FULL,
  codeToLabel,
  resolveSlotLabels,
  resolveSlotKeys,
  railSlotTip,
  readRailModel,
  slotDescription,
  worstState,
  applyClaims,
} from '../src/ui/powerRail.js';

function baseSlots(overrides = {}) {
  return RAIL_SLOTS.map((s) => ({
    index: s.index,
    band: s.band,
    name: s.name,
    glyph: s.glyph,
    state: overrides[s.index] || 'ready',
    cooldownMs: 0,
    answer: null,
    claimedBy: null,
  }));
}

test('the rank is the drive lamp, the five powers on 1–5, and the Line', () => {
  // FB-002: slot 0 rides ahead of the hotbar as the DRIVE state lamp — it owns no digit. The
  // five powers (owner 2026-10-22) replaced the nine overlapping verbs: each power is its own
  // band, so the Cluster prints each by name.
  assert.equal(RAIL_SLOTS.length, 7);
  for (const band of [BAND_DRIVE, BAND_PULL, BAND_SHOVE, BAND_PIN, BAND_BAY, BAND_RIG, BAND_LINE]) {
    assert.equal(RAIL_SLOTS.filter((s) => s.band === band).length, 1, band);
  }
  assert.deepEqual(RAIL_SLOTS.map((s) => s.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(RAIL_SLOTS[0].action, 'travelBurn', 'slot 0 is the travel-drive latch');
});

test('each socket names the power verb that is actually bound today', () => {
  assert.deepEqual(RAIL_SLOTS.map((s) => s.action), ['travelBurn', 'pull', 'shove', 'pin', 'bomb', 'rig', 'tether']);
  for (const [power, index] of Object.entries(POWER_SLOT)) {
    assert.equal(RAIL_SLOTS[index].action, power === 'line' ? 'tether' : power, `${power} sits at ${index}`);
  }
});

test('codeToLabel renders the key a player recognises, not the DOM code', () => {
  assert.equal(codeToLabel('Digit4'), '4');
  assert.equal(codeToLabel('Numpad7'), 'Num7');
  assert.equal(codeToLabel('KeyB'), 'B');
  assert.equal(codeToLabel('CapsLock'), 'Caps Lock');
  assert.equal(codeToLabel(''), '');
  assert.equal(codeToLabel(null), '');
});

test('codeToLabel never leaks a raw DOM code — modifier and punctuation keys get friendly names', () => {
  assert.equal(codeToLabel('MetaLeft'), 'L-Meta');
  assert.equal(codeToLabel('Semicolon'), ';');
  assert.equal(codeToLabel('NumpadEnter'), 'Num Enter');
  assert.equal(codeToLabel('PageUp'), 'Pg Up');
  assert.equal(codeToLabel('IntlRo'), 'Intl Ro');
});

test('labels come from the live binding table, so a rebind moves the label', () => {
  const stock = resolveSlotLabels({
    pull: ['Digit1'], shove: ['Digit2'], pin: ['Digit3'], bomb: ['Digit4'], rig: ['Digit5'],
  });
  assert.equal(stock[1], '1');
  assert.equal(stock[5], '5');
  // An unbound Line must not claim a key that does nothing.
  assert.equal(stock[6], '');

  const rebound = resolveSlotLabels({ pin: ['KeyG'] });
  assert.equal(rebound[3], 'G', 'a rebound verb relabels rather than lying about Digit3');
  assert.equal(rebound[1], '', 'an action missing from the table has no label');
});

test('worstState escalates rather than averaging', () => {
  assert.equal(worstState('ready', 'cooling'), 'cooling');
  assert.equal(worstState('locked', 'cooling'), 'locked');
  assert.equal(worstState('ready', 'ready'), 'ready');
  assert.equal(worstState('empty', 'ready'), 'empty');
});

test('no claims leaves the rail untouched', () => {
  const out = applyClaims(baseSlots(), [], 1000);
  assert.equal(out.claimed, false);
  assert.equal(out.mode, null);
  assert.ok(out.slots.every((s) => s.claimedBy === null && s.answer === null));
});

test('a SINGLE claim borrows one slot and leaves the rest live', () => {
  const out = applyClaims(baseSlots(), [
    { claimId: 'hail', slots: [1], answers: ['Accept'], mode: CLAIM_SINGLE },
  ], 1000);
  assert.equal(out.claimed, true);
  assert.equal(out.slots[1].answer, 'Accept');
  assert.equal(out.slots[1].claimedBy, 'hail');
  assert.equal(out.slots[0].answer, null, 'slot 0 is a state lamp, never an answer key');
  assert.equal(out.slots[4].answer, null, 'slot 4 keeps its power');
  assert.equal(out.slots[4].claimedBy, null);
});

test('a FULL claim blanks every slot it has no answer for', () => {
  const out = applyClaims(baseSlots(), [
    { claimId: 'surrender', answers: ['Yes', 'No'], mode: CLAIM_FULL },
  ], 1000);
  assert.equal(out.slots[1].answer, 'Yes');
  assert.equal(out.slots[2].answer, 'No');
  assert.equal(out.slots[0].answer, null, 'the drive lamp cannot answer a prompt');
  assert.equal(out.slots[0].state, 'ready', 'and it never goes inert under a claim');
  // Without this, a live power would sit beside a prompt answer and imply both keys respond.
  assert.equal(out.slots[4].answer, null);
  assert.equal(out.slots[4].state, 'empty', 'unanswered slots go inert under a FULL claim');
});

test('the newest claim wins a contested slot, and releasing restores what was underneath', () => {
  const first = { claimId: 'a', slots: [1], answers: ['First'], mode: CLAIM_PARTIAL };
  const second = { claimId: 'b', slots: [1], answers: ['Second'], mode: CLAIM_PARTIAL };
  const both = applyClaims(baseSlots(), [first, second], 1000);
  assert.equal(both.slots[1].answer, 'Second');
  assert.equal(both.slots[1].claimedBy, 'b');

  const afterRelease = applyClaims(baseSlots(), [first], 1000);
  assert.equal(afterRelease.slots[1].answer, 'First', 'the older claim is still underneath');
});

test('an expired claim is dropped, so a prompt that dies cannot wedge the rail', () => {
  const stale = { claimId: 'ghost', slots: [1, 2], answers: ['X', 'Y'], mode: CLAIM_PARTIAL, expiresAt: 500 };
  const out = applyClaims(baseSlots(), [stale], 1000);
  assert.equal(out.claimed, false, 'a claim past its deadline is not honoured');
  assert.equal(out.slots[1].answer, null);

  const stillLive = applyClaims(baseSlots(), [stale], 400);
  assert.equal(stillLive.claimed, true, 'and is honoured before the deadline');
});

test('a claim naming a slot that does not exist is ignored, not thrown', () => {
  const out = applyClaims(baseSlots(), [
    { claimId: 'bad', slots: [42], answers: ['Nope'], mode: CLAIM_PARTIAL },
  ], 1000);
  assert.equal(out.slots.length, RAIL_SLOTS.length);
  assert.ok(out.slots.every((s) => s.answer === null));
  // Slot 0 is not claimable either — a prompt that names it by index still cannot borrow the lamp.
  const lamp = applyClaims(baseSlots(), [
    { claimId: 'lampjack', slots: [0], answers: ['Steal'], mode: CLAIM_PARTIAL },
  ], 1000);
  assert.equal(lamp.slots[0].answer, null);
  assert.equal(lamp.slots[0].claimedBy, null);
});

test('the CSS sweep keyframe matches the JS ring circumference', () => {
  // The keyframe lives in injectHudCss and cannot read a JS constant. If these drift, the radial
  // stops at the wrong angle and a slot LOOKS ready while it is still cooling — a silent lie, and
  // exactly the class of cross-file drift that a comment alone has never prevented in this repo.
  const css = readFileSync(new URL('../src/ui/views/hudStyles.js', import.meta.url), 'utf8');
  // Match the `to` stop specifically. A lazy `[^}]*` here grabs the `from` stop (0) instead and the
  // assertion then compares 0 against the circumference — which is how this test first failed
  // against correct CSS.
  const rule = /@keyframes sf-pslot-sweep\b[\s\S]*?to\s*\{[^}]*stroke-dashoffset:\s*([\d.]+)/.exec(css);
  assert.ok(rule, 'sf-pslot-sweep keyframe must declare a `to` stroke-dashoffset stop');
  const cssValue = Number(rule[1]);
  assert.ok(
    Math.abs(cssValue - SWEEP_CIRCUMFERENCE) < 0.01,
    `keyframe stroke-dashoffset ${cssValue} must equal 2*PI*SWEEP_R (${SWEEP_CIRCUMFERENCE.toFixed(2)})`,
  );
});

test('claims do not mutate the caller\'s slot model', () => {
  const original = baseSlots();
  applyClaims(original, [{ claimId: 'x', slots: [1], answers: ['A'], mode: CLAIM_FULL }], 1000);
  assert.equal(original[0].answer, null, 'applyClaims is pure');
  assert.equal(original[0].claimedBy, null);
});

test('the rank reads as one hotbar: a slot shows its own digit whenever the action carries it', () => {
  // The defect this pins: the player reads the shelf as a number-row hotbar, but a seat whose verb
  // also carries a letter used to print the letter (Y/R) while its neighbours printed digits — so
  // the row looked half-bound. Each seat prefers the digit that IS its rank when the action has it.
  const stock = resolveSlotLabels({
    pull: ['Digit1'], shove: ['KeyR', 'Digit2'], pin: ['Digit3'], bomb: ['KeyY', 'Digit4'], tether: ['Space', 'KeyF'],
  });
  assert.equal(stock[1], '1');
  assert.equal(stock[2], '2');
  assert.equal(stock[3], '3');
  assert.equal(stock[4], '4');
  assert.equal(stock[6], 'Space', 'the Line has no digit of its own');
  // The letter keys stay bound; they just do not own the label. The tip lists them all.
  const keys = resolveSlotKeys({ bomb: ['KeyY', 'Digit4'], tether: ['Space', 'KeyF'] });
  assert.equal(keys[4], '4 · Y');
  assert.equal(keys[6], 'Space · F');
  // The label never invents a key: only the slot's own digit counts, and a digitless rebind
  // falls back to the primary code.
  assert.equal(resolveSlotLabels({ bomb: ['KeyY'] })[4], 'Y');
  assert.equal(resolveSlotLabels({ bomb: ['KeyY', 'Digit5'] })[4], 'Y');
});

test('every verb carries its explanation bank, and a tip names the verb, the keys and the live state', () => {
  for (const slot of RAIL_SLOTS) {
    assert.ok(slot.description && slot.description.length > 8,
      `${slot.name} (slot ${slot.index}) must carry a player-facing description`);
    assert.ok(slotDescription(slot.index) === slot.description);
  }
  assert.equal(
    railSlotTip({ name: 'Line', keys: 'Space · F', description: slotDescription(POWER_SLOT.line), why: 'Ready' }),
    'Line — throw the tether line onto a body and haul it — tap to latch or cut (Space · F)\nReady',
  );
  assert.equal(railSlotTip({ name: 'Seed', description: 'goes somewhere' }), 'Seed — goes somewhere',
    'no keys and no state invent nothing');
});

test('readRailModel answers WHY a verb is not ready, not only that it is not', () => {
  const state = {
    player: { cargo: { items: { cmdty_impulse_charge: 0 } }, massSeed: { cooldownUntil: 0 } },
    fields: { cooldowns: { well: 4 }, coneActive: true },
    entities: { get: () => null },
    entityList: [],
  };
  const model = readRailModel(state, 1);
  assert.equal(model[POWER_SLOT.pull].why, 'Recharging — 3s');
  assert.equal(model[POWER_SLOT.shove].why, 'Ready', 'nothing armed: SHOVE is the repulsor, ready');
  assert.equal(model[POWER_SLOT.pin].why, 'Ready');
  assert.equal(model[POWER_SLOT.rig].why, 'Cone is on — press to fold it');
  assert.equal(model[POWER_SLOT.line].why, 'Ready');
  // With charges aboard the charge leads, and BOMB answers with the charge's capacity.
  const charged = { ...state, player: { ...state.player, cargo: { items: { cmdty_impulse_charge: 2 } } } };
  const capacity = resolveImpulseChargeCapacity(charged);
  const bomb = readRailModel(charged, 1)[POWER_SLOT.bomb];
  assert.equal(bomb.capacity, capacity);
  assert.equal(bomb.why, `Ready · up to ${capacity}`);
  for (const slot of RAIL_SLOTS) {
    assert.ok(model[slot.index].why, `slot ${slot.index} must say why it reads as it does`);
  }
});
