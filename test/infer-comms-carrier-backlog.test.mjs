import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../src/audio/audioSystem.js';

function host() {
  const owner = Object.create(audio);
  owner.rt = { ctx: { state: 'running', currentTime: 10 } };
  owner.cues = [];
  owner._playSquelch = (category, startTime) => owner.cues.push({ category, startTime });
  return owner;
}

test('ambient popup bursts cannot prequeue seconds of radio carrier noise', () => {
  const owner = host();
  for (let i = 0; i < 80; i++) owner._onCommsPopup({ category: 'ambient' });
  assert.ok(owner.cues.length <= 3);
  assert.ok(owner.cues.every(cue => cue.startTime <= 10.25));
});

test('a warning sounds when it arrives instead of waiting behind ambient chatter', () => {
  const owner = host();
  for (let i = 0; i < 20; i++) owner._onCommsPopup({ category: 'ambient' });
  owner._onCommsPopup({ category: 'danger' });
  assert.deepEqual(owner.cues.at(-1), { category: 'danger', startTime: 10 });
});

test('a suspended graph accumulates no carrier backlog to play after return', () => {
  const owner = host();
  owner.rt.ctx.state = 'suspended';
  owner._onCommsPopup({ category: 'story' });
  assert.deepEqual(owner.cues, []);
  assert.equal(owner.rt._lastSquelchEndTime, undefined);
});

test('a lifecycle suspension requested before the context settles admits no carrier', () => {
  const owner = host();
  owner.rt._lifecycleSuspended = true;
  owner._onCommsPopup({ category: 'danger' });
  assert.deepEqual(owner.cues, [], 'the graph can still say running during asynchronous suspension');
  assert.equal(owner.rt._lastSquelchEndTime, undefined);
  owner.rt._lifecycleSuspended = false;
  owner._onCommsPopup({ category: 'danger' });
  assert.deepEqual(owner.cues, [{ category: 'danger', startTime: 10 }]);
});
