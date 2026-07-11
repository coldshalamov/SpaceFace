import assert from 'node:assert/strict';
import {
  BEAT_COMMS,
  CONTACT_CARDS,
  MAX_COMMS_WORDS,
  commsForChoice,
  primaryCommsForBeat,
  recoveryCommsForBeat,
  validateEmbodiedDialogue,
  wordCount,
} from '../src/story/campaign47a/embodiedDialogue.js';

console.log('story-campaign47a-embodied-dialogue');
assert.deepEqual(validateEmbodiedDialogue(), { ok: true, errors: [] });
for (let beat = 0; beat <= 7; beat++) {
  assert.ok(primaryCommsForBeat(beat), `B${beat} primary`);
  assert.ok(recoveryCommsForBeat(beat), `B${beat} recovery`);
}
for (const choice of ['A', 'B', 'C', 'D', 'E']) assert.equal(commsForChoice(choice).length, 1);
for (const line of BEAT_COMMS) assert.ok(wordCount(line.text) <= MAX_COMMS_WORDS, line.id);
assert.ok(CONTACT_CARDS.some((card) => card.id === 'contact_elroy'));
assert.ok(CONTACT_CARDS.some((card) => card.namedCaptainId === 'cap_sable_iask'));
assert.ok(CONTACT_CARDS.every((card) => card.portrait === false && card.hudPortrait === false && card.visorMotif === false));
console.log('story-campaign47a-embodied-dialogue: all checks passed');
