// inf-tow-work-voice — the crew you hired names its own two milestones.
//
// A hired tug spoke at grant (the fee toast) and at loss, but the hook and the delivery —
// the two moments the player waits through — said nothing, so the lease read as a fee and a
// silent cable drag. The hook speaks once when the line takes, the delivery once at the sink;
// both ride the arbiter floor plus a barkDirector:voice receipt with the same voiceId, so a
// queued line never sounds early and a dropped line never sounds at all. No corpus rows.
import assert from 'node:assert/strict';
import test from 'node:test';

import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

function rig(hullAlive = true, withVoice = true) {
  const said = [];
  const receipts = [];
  const toasts = [];
  const hull = { id: 'hull_1', alive: hullAlive, factionId: 'faction_mts' };
  const self = {
    state: {
      simTime: 1200,
      entities: new Map([['hull_1', hull]]),
    },
    helpers: withVoice ? {
      voice: { say: (call) => said.push(call) },
    } : {},
    bus: {
      emit: (name, payload) => {
        if (name === 'barkDirector:voice') receipts.push(payload);
        if (name === 'toast') toasts.push(payload);
      },
    },
  };
  return { self, hull, said, receipts, toasts };
}

// The hook/delivery methods call _speakTowWorkLine through `this` — bind the real one.
function withSpeaker(self) {
  self._speakTowWorkLine = npcJobsRuntime._speakTowWorkLine;
  return self;
}

test('the hook speaks once through the arbiter floor with a matching radio receipt', () => {
  const { self, hull, said, receipts, toasts } = rig();
  const entry = { towAssist: { feeCr: 120 }, towOwnerRef: hull };
  const jobId = 'job:ceres_tow_1';

  npcJobsRuntime._speakTowWorkLine.call(self, entry, hull, 'Got it on the line. Hauling it in.', `towHook:${jobId}`);
  assert.equal(said.length, 1);
  assert.equal(said[0].channel, 'bark');
  assert.equal(said[0].kind, 'barkDirector');
  assert.equal(said[0].id, 'towHook:job:ceres_tow_1');
  assert.equal(said[0].factionId, 'faction_mts');
  assert.equal(said[0].valid(), true, 'a live hull passes the floor validity gate');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].voiceId, said[0].id, 'the radio receipt carries the same voiceId');
  assert.equal(receipts[0].situation, 'tow-assist');
  assert.equal(toasts.length, 0, 'a voiced line is not also toasted');
});

test('a reaped hull answers nothing — dropped lines never sound', () => {
  const { self, hull, said, receipts } = rig();
  const entry = { towAssist: {}, towOwnerRef: hull };

  npcJobsRuntime._speakTowWorkLine.call(self, entry, hull, 'Got it on the line. Hauling it in.', 'towHook:j1');
  assert.equal(said.length, 1);
  assert.equal(receipts.length, 1, 'one say rides one radio receipt');

  hull.alive = false;
  npcJobsRuntime._speakTowWorkLine.call(self, entry, hull, 'Delivered. Weigh it and pay the crew.', 'towDelivered:j1');
  assert.equal(said.length, 1, 'a reaped hull says nothing');
  assert.equal(receipts.length, 1);
});

test('a hull without the voice helper still answers, on a toast', () => {
  const { self, hull, said, toasts } = rig(true, false);
  npcJobsRuntime._speakTowWorkLine.call(self, { towAssist: {} }, hull, 'Got it on the line. Hauling it in.', 'towHook:j2');
  assert.equal(said.length, 0);
  assert.equal(toasts.length, 1, 'the unvoiced route is a toast, not silence');
});

test('the delivery names the sink moment; the hook stamps gate re-attaches', () => {
  const { self, hull, said } = rig();
  const entry = { towAssist: { feeCr: 90 }, towOwnerRef: hull };

  // Hook-site law: only a real hired assist speaks, orchard dispatches never do, once per job.
  npcJobsRuntime._attachTowAssistHookSpeak.call(withSpeaker(self), entry, hull, 'job:t1', { orchard: false });
  assert.equal(entry.towHookSpoken, true);
  assert.equal(said.length, 1);
  npcJobsRuntime._attachTowAssistHookSpeak.call(withSpeaker(self), entry, hull, 'job:t1', { orchard: false });
  assert.equal(said.length, 1, 'a re-attach in the same hire never re-speaks the hook');

  const orchard = { towAssist: {}, orchardAssist: { lease: true }, towOwnerRef: hull };
  npcJobsRuntime._attachTowAssistHookSpeak.call(withSpeaker(self), orchard, hull, 'job:t2', { orchard: true });
  assert.equal(orchard.towHookSpoken, undefined, 'orchard dispatches stay out of this register');
});
