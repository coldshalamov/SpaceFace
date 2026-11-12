// inf-mayday-flare — the mayday's birth reads on the glass, not just in the speaker.
//
// Player story: when a crewed hull dies and its pod tears clear, nothing on screen marked the
// moment — a toast and a voice bark, and the rescue loop's START was invisible in a fight.
// Now the ejection spawns a retro flash, a cold vent whiff, and the beacon's first full-power
// lamp-red star plus a director-owned event light. The drawing itself runs through vfx.js's
// normal admission (covered by its own suites); these tests pin the pure decisions: which
// events are real ejections, and what the moment is made of.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSurvivorEjectMoment,
  SURVIVOR_EJECT_CUE_ID,
  SURVIVOR_EJECT_FLARE_PLAN,
  SURVIVOR_EJECT_PRIORITY,
} from '../src/render/vfx/survivorEjectRead.js';
import { presetFor } from '../src/render/vfxColorLightDirector.js';

test('only a causal eject is an ejection; rematerialized pods never flare', () => {
  assert.equal(isSurvivorEjectMoment({ source: 'causal_eject', entityId: 42 }), true,
    'the kill-site ejection plays');
  assert.equal(isSurvivorEjectMoment({ source: 'player_wreck', entityId: 7 }), false,
    'a parked player pod re-emitting on sector re-entry is not an ejection');
  assert.equal(isSurvivorEjectMoment({ source: 'causal_eject' }), false,
    'a payload without an entity cannot place the flare');
  assert.equal(isSurvivorEjectMoment(null), false, 'no payload, no moment');
});

test('the moment is a flash, a vent, and a lamp-red star that outlives the flash', () => {
  const plan = SURVIVOR_EJECT_FLARE_PLAN;
  for (const part of ['flash', 'vent', 'star']) {
    const p = plan[part];
    assert.ok(p && p.life > 0 && p.life < 3, `${part} is a short lived read (${p && p.life})`);
    assert.ok(p.size0 > 0 && p.size1 > p.size0, `${part} grows from a point`);
    assert.ok(p.op0 > 0 && p.op1 === 0, `${part} fades out fully — no lingering ghost`);
  }
  // The star is the pull: it burns at least three times longer than the retro flash, so the
  // eye keeps a beacon after the explosion of the moment has died.
  assert.ok(plan.star.life >= plan.flash.life * 3,
    `the beacon outlives the flash (${plan.star.life} vs ${plan.flash.life})`);
  assert.equal(plan.star.color, '#ff4a3c',
    'the star is the lamp red — the light and the beacon speak one color');
  assert.ok(plan.vent.drift > 0, 'the vent drifts — cold gas, not a frozen puff');
});

test('the event light rides the director tell/mayday row and resolves cold', () => {
  const row = presetFor('tell', 'mayday');
  assert.ok(row, 'the tell/mayday severity row exists');
  assert.equal(row.color, '#ff4a3c', 'the light keeps the lamp red');
  assert.ok(row.peak >= 3, `the shout starts hot (${row.peak})`);
  assert.ok(row.decay <= 6, `the fade is slow enough to keep (${row.decay})`);
  assert.ok(row.distance >= 200, `the light reaches gameplay range (${row.distance})`);
  const fallback = presetFor('tell', 'nonsense');
  assert.ok(fallback && fallback.color !== '#ff4a3c',
    'an unknown severity falls back to the bare tell row, never into the mayday identity');
});

test('the cue id and admission priority are stable public values', () => {
  assert.equal(SURVIVOR_EJECT_CUE_ID, 'presentation.survivor.eject',
    'the cue lane prefix stays presentation');
  assert.ok(SURVIVOR_EJECT_PRIORITY > 0.3 && SURVIVOR_EJECT_PRIORITY < 0.9,
    `admission sits between scenery and combat deaths (${SURVIVOR_EJECT_PRIORITY})`);
});
