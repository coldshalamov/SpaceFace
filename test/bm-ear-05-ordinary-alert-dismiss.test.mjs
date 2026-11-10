// BM-05 — an ordinary alert-channel warning is dismissable; only the danger class holds.
// The arbiter's contract (isCriticalSquelchLine: "channel alone is not critical squelch")
// and VoiceQueue.dismiss both refuse only critical squelch — but the voice:dismiss bus
// handler also early-returned on isDangerVoice, which is true for EVERY alert-channel
// line. So an ordinary warn/info pill (alerts.js announce, fragileCargo, volatileExposure,
// mine-cap refusal) stuck for its full TTL and the Delete/F6 key looked dead. The key
// path now matches the queue: critical squelch (danger class) and the onboarding
// tutorial floor stay protected; ordinary warnings clear.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  DANGER_PRIORITY,
  isCriticalSquelchLine,
  isDangerVoice,
  voiceArbiter,
} from '../src/ui/voiceArbiter.js';

const SEED = 4242;

function boot(onboarding = { active: false, finished: true }) {
  const bus = createBus();
  const state = { simTime: 0, onboarding };
  const helpers = {};
  const clears = [];
  bus.on('voice:clear', (p) => clears.push(p.id));
  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  return { bus, state, helpers, clears };
}

test('seed 4242: an ordinary alert-channel warning clears on voice:dismiss', () => {
  assert.equal(SEED, 4242);
  const t = boot();
  // Live shape from alerts.js announce({ sev: 'warn' }): alert channel, sub-critical
  // priority, non-danger kind — danger-class by channel, ordinary by squelch law.
  t.helpers.voice.say({
    channel: 'alert', priority: 80, kind: 'warn',
    text: 'Shields at half.', ttl: 30, id: 'alert:shield-warn',
  });
  voiceArbiter.update(0, t.state);
  assert.equal(voiceArbiter.queue.active.text, 'Shields at half.');
  assert.equal(isDangerVoice(voiceArbiter.queue.active), true);
  assert.equal(isCriticalSquelchLine(voiceArbiter.queue.active), false);

  t.bus.emit('voice:dismiss', { source: 'keyboard' });
  assert.equal(voiceArbiter.queue.active, null, 'an ordinary warning must not hold the pill');
  assert.ok(t.clears.includes('alert:shield-warn'), 'the presenter hears the clear');
});

test('seed 4242: a danger-class alert still holds the floor against voice:dismiss', () => {
  assert.equal(SEED, 4242);
  const t = boot();
  // Live shape from alerts.js announce({ sev: 'danger' }).
  t.helpers.voice.say({
    channel: 'alert', priority: DANGER_PRIORITY, kind: 'danger',
    text: 'HULL BREACH', ttl: 30, id: 'alert:hull',
  });
  voiceArbiter.update(0, t.state);
  assert.equal(voiceArbiter.queue.active.text, 'HULL BREACH');

  t.bus.emit('voice:dismiss', { source: 'keyboard' });
  assert.equal(voiceArbiter.queue.active.text, 'HULL BREACH', 'danger still holds the floor');
  assert.equal(t.clears.length, 0, 'no clear is presented for a held danger line');
});

test('seed 4242: the onboarding tutorial floor stays protected from voice:dismiss', () => {
  assert.equal(SEED, 4242);
  const t = boot({ active: true, finished: false });
  t.helpers.voice.say({ channel: 'tutorial', text: 'Thrust to the beacon.', ttl: 30, id: 'tutorial:beat' });
  voiceArbiter.update(0, t.state);
  assert.equal(voiceArbiter.queue.active.channel, 'tutorial');

  t.bus.emit('voice:dismiss', { source: 'keyboard' });
  assert.equal(voiceArbiter.queue.active.channel, 'tutorial', 'onboarding keeps its floor');
});
