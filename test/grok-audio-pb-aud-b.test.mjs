// Row 144 — SF-231 comms yield, SF-235 ammo vs target refusal.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio, arbitrateCommsLine } from '../src/audio/audioSystem.js';
import {
  REFUSAL_VOICE,
  resolveRefusalRecipe,
  refusalReasonClass,
} from '../src/audio/combatVerbCues.js';

test('SF-231 an immediate line plays and chatter yields without a caption', () => {
  const held = arbitrateCommsLine({
    situation: 'scan',
    immediateHeld: true,
    context: 'sector_helios_prime|combat',
  });
  assert.equal(held.play, false);
  assert.equal(held.caption, false);
  assert.equal(held.reason, 'yield');

  const urgent = arbitrateCommsLine({
    situation: 'warn',
    immediateHeld: true,
    context: 'sector_helios_prime|combat',
  });
  assert.equal(urgent.play, true);
  assert.equal(urgent.caption, true);
  assert.equal(urgent.immediate, true);

  const stale = arbitrateCommsLine({
    situation: 'attack',
    context: 'sector_sker_haven|combat',
    lineContext: 'sector_helios_prime|flight',
  });
  assert.equal(stale.play, false);
  assert.equal(stale.reason, 'stale');

  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (id) => { plays.push(id); return { id }; };
  host.bus = { emit(_ev, payload) { captions.push(payload); } };
  host.state = { world: { currentSectorId: 'sector_helios_prime' }, simTime: 4 };
  host.rt = { ctx: { currentTime: 4 }, _commsImmediateUntilS: 9, musicState: 'combat' };
  host._onBarkVoice({ situation: 'taunt', factionId: 'faction_reach', text: 'You fly like cargo.' });
  assert.equal(plays.length, 0, 'chatter does not key the mic while an immediate line is up');
  assert.equal(captions.length, 0, 'a yielded line is not captioned');

  host.rt._commsImmediateUntilS = 0;
  host._onBarkVoice({ situation: 'distress', factionId: 'faction_free', text: 'Hull is open.' });
  assert.ok(plays.length > 0, 'distress keys the mic');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, 'Hull is open.');
});

test('SF-235 ammo and invalid-target refusals do not share the generic deny', () => {
  assert.equal(refusalReasonClass('no_stock'), 'ammo');
  assert.equal(refusalReasonClass('empty_rack'), 'ammo');
  assert.equal(refusalReasonClass('not_loaded'), 'ammo');
  assert.equal(refusalReasonClass('no_target'), 'target');
  assert.equal(refusalReasonClass('invalid_target'), 'target');
  assert.equal(refusalReasonClass('out_of_range'), 'generic');
  assert.equal(refusalReasonClass('out-of-range'), 'generic');
  assert.equal(refusalReasonClass('blocked'), 'generic');
  assert.equal(refusalReasonClass('cut_rejected'), 'generic');

  const ammo = resolveRefusalRecipe('no_ammo');
  const target = resolveRefusalRecipe('invalid_target');
  const generic = resolveRefusalRecipe('blocked');
  assert.equal(generic, REFUSAL_VOICE);
  assert.notEqual(ammo, generic);
  assert.notEqual(target, generic);
  assert.notEqual(ammo, target);
  assert.equal(ammo, 'sfx_refusal_empty');
  assert.equal(target, 'sfx_refusal_target');
});
