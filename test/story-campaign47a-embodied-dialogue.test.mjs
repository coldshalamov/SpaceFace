import assert from 'node:assert/strict';
import {
  BEAT_COMMS,
  CONTACT_CARDS,
  commsForChoice,
  primaryCommsForBeat,
  recoveryCommsForBeat,
} from '../src/story/campaign47a/embodiedDialogue.js';
import { CAMPAIGN_BEATS, ENDINGS } from '../src/story/campaign47a/campaignData.js';

console.log('story-campaign47a-embodied-dialogue');
for (let beat = 0; beat <= 7; beat++) {
  assert.ok(primaryCommsForBeat(beat), `B${beat} primary`);
  assert.ok(recoveryCommsForBeat(beat), `B${beat} recovery`);
}
for (const choice of ['A', 'B', 'C', 'D', 'E']) assert.equal(commsForChoice(choice).length, 1);
const contactIds = new Set(CONTACT_CARDS.map((card) => card.id));
const endingIds = new Set(ENDINGS.map((ending) => ending.id));
for (const line of BEAT_COMMS) {
  assert.equal(line.beatId, CAMPAIGN_BEATS[line.beatIndex]?.id, `${line.id}: beat linkage`);
  assert.ok(contactIds.has(line.contactId), `${line.id}: contact linkage`);
  if (line.choiceId) assert.ok(endingIds.has(line.choiceId), `${line.id}: ending linkage`);
  assert.equal(typeof line.text, 'string', `${line.id}: text must be a string`);
  assert.ok(line.text.trim(), `${line.id}: text must be authored`);
  assert.doesNotMatch(line.text, /[\r\n\u2028\u2029]/u, `${line.id}: text must fit the inline comms surface`);
  assert.doesNotMatch(line.text, /[\u0000-\u001f\u007f\ufffd]/u, `${line.id}: invalid control/replacement character`);
}
for (const card of CONTACT_CARDS) {
  assert.equal(typeof card.blurb, 'string', `${card.id}: blurb must be a string`);
  assert.ok(card.blurb.trim(), `${card.id}: blurb must be authored`);
  assert.doesNotMatch(card.blurb, /[\r\n\u2028\u2029]/u, `${card.id}: blurb must fit its inline surface`);
  assert.doesNotMatch(card.blurb, /[\u0000-\u001f\u007f\ufffd]/u, `${card.id}: invalid control/replacement character`);
}
assert.ok(CONTACT_CARDS.some((card) => card.id === 'contact_elroy'));
assert.ok(CONTACT_CARDS.some((card) => card.namedCaptainId === 'cap_sable_iask'));
assert.ok(CONTACT_CARDS.every((card) => card.portrait === false && card.hudPortrait === false && card.visorMotif === false));
console.log('story-campaign47a-embodied-dialogue: all checks passed');
