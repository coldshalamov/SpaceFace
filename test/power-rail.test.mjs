// J06 Power Rail — the slot-claim contract and binding resolution.
//
// Claim precedence is the part of this feature most likely to break quietly: a stale claim that is
// never released, or a prompt opening on top of a prompt, degrades into "the number keys stopped
// working" rather than a crash. These run headless against the pure exports so the contract is
// pinned without driving nine buttons through a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SWEEP_CIRCUMFERENCE,
  RAIL_SLOTS,
  BAND_ORDNANCE,
  BAND_FIELDWORK,
  BAND_RIG,
  CLAIM_SINGLE,
  CLAIM_PARTIAL,
  CLAIM_FULL,
  codeToLabel,
  resolveSlotLabels,
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

test('the rank is three bands of three', () => {
  assert.equal(RAIL_SLOTS.length, 9);
  for (const band of [BAND_ORDNANCE, BAND_FIELDWORK, BAND_RIG]) {
    assert.equal(RAIL_SLOTS.filter((s) => s.band === band).length, 3, `${band} holds three slots`);
  }
  assert.deepEqual(RAIL_SLOTS.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('FIELDWORK and RIG name the physics verbs that are actually bound today', () => {
  const fieldwork = RAIL_SLOTS.filter((s) => s.band === BAND_FIELDWORK).map((s) => s.action);
  assert.deepEqual(fieldwork, ['deployMassSeed', 'deployWell', 'deployRepulsor']);
  const rig = RAIL_SLOTS.filter((s) => s.band === BAND_RIG).map((s) => s.action);
  assert.deepEqual(rig, ['toggleClearingCone', 'toggleSkimCollector', null]);
});

test('codeToLabel renders the key a player recognises, not the DOM code', () => {
  assert.equal(codeToLabel('Digit4'), '4');
  assert.equal(codeToLabel('Numpad7'), 'Num7');
  assert.equal(codeToLabel('KeyB'), 'B');
  assert.equal(codeToLabel('CapsLock'), 'CapsLock');
  assert.equal(codeToLabel(''), '');
  assert.equal(codeToLabel(null), '');
});

test('labels come from the live binding table, so a rebind moves the label', () => {
  const stock = resolveSlotLabels({
    deployMassSeed: ['Digit4'], deployWell: ['Digit5'], deployRepulsor: ['Digit6'],
    toggleClearingCone: ['Digit7'], toggleSkimCollector: ['Digit8'],
  });
  assert.equal(stock[4], '4');
  assert.equal(stock[8], '8');
  // Unbound ORDNANCE slots must not claim a key that does nothing.
  assert.equal(stock[1], '');

  const rebound = resolveSlotLabels({ deployMassSeed: ['KeyG'] });
  assert.equal(rebound[4], 'G', 'a rebound verb relabels rather than lying about Digit4');
  assert.equal(rebound[5], '', 'an action missing from the table has no label');
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
  assert.equal(out.slots[0].answer, 'Accept');
  assert.equal(out.slots[0].claimedBy, 'hail');
  assert.equal(out.slots[3].answer, null, 'slot 4 keeps its power');
  assert.equal(out.slots[3].claimedBy, null);
});

test('a FULL claim blanks every slot it has no answer for', () => {
  const out = applyClaims(baseSlots(), [
    { claimId: 'surrender', answers: ['Yes', 'No'], mode: CLAIM_FULL },
  ], 1000);
  assert.equal(out.slots[0].answer, 'Yes');
  assert.equal(out.slots[1].answer, 'No');
  // Without this, a live power would sit beside a prompt answer and imply both keys respond.
  assert.equal(out.slots[3].answer, null);
  assert.equal(out.slots[3].state, 'empty', 'unanswered slots go inert under a FULL claim');
});

test('the newest claim wins a contested slot, and releasing restores what was underneath', () => {
  const first = { claimId: 'a', slots: [1], answers: ['First'], mode: CLAIM_PARTIAL };
  const second = { claimId: 'b', slots: [1], answers: ['Second'], mode: CLAIM_PARTIAL };
  const both = applyClaims(baseSlots(), [first, second], 1000);
  assert.equal(both.slots[0].answer, 'Second');
  assert.equal(both.slots[0].claimedBy, 'b');

  const afterRelease = applyClaims(baseSlots(), [first], 1000);
  assert.equal(afterRelease.slots[0].answer, 'First', 'the older claim is still underneath');
});

test('an expired claim is dropped, so a prompt that dies cannot wedge the rail', () => {
  const stale = { claimId: 'ghost', slots: [1, 2], answers: ['X', 'Y'], mode: CLAIM_PARTIAL, expiresAt: 500 };
  const out = applyClaims(baseSlots(), [stale], 1000);
  assert.equal(out.claimed, false, 'a claim past its deadline is not honoured');
  assert.equal(out.slots[0].answer, null);

  const stillLive = applyClaims(baseSlots(), [stale], 400);
  assert.equal(stillLive.claimed, true, 'and is honoured before the deadline');
});

test('a claim naming a slot that does not exist is ignored, not thrown', () => {
  const out = applyClaims(baseSlots(), [
    { claimId: 'bad', slots: [42], answers: ['Nope'], mode: CLAIM_PARTIAL },
  ], 1000);
  assert.equal(out.slots.length, 9);
  assert.ok(out.slots.every((s) => s.answer === null));
});

test('the CSS sweep keyframe matches the JS ring circumference', () => {
  // The keyframe lives in injectHudCss and cannot read a JS constant. If these drift, the radial
  // stops at the wrong angle and a slot LOOKS ready while it is still cooling — a silent lie, and
  // exactly the class of cross-file drift that a comment alone has never prevented in this repo.
  const css = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
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
