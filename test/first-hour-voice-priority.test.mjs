// ONEVOICE-PRIORITY-IMPL — first-hour voice priority contract.
//
// Pins taste-law ordering (danger > tutorial > objective > comms > flavor), the named
// `comms` tier, tutorial protection during active onboarding (non-danger story/flavor
// cannot occupy the floor while a persistent or audible tutorial beat owns teaching),
// post-onboarding load-bearing story, and
// deterministic interrupt / dismiss / coalesce behavior.
//
// Run:
//   node test/first-hour-voice-priority.test.mjs
// Adjacent:
//   npm run check:one-voice

import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  CHANNEL_PRIORITY,
  DANGER_PRIORITY,
  VoiceQueue,
  canInterrupt,
  isDangerVoice,
  isOnboardingTeaching,
  voiceArbiter,
} from '../src/ui/voiceArbiter.js';

let passes = 0;
let failures = 0;

function check(name, fn) {
  try {
    fn();
    passes++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.message ? err.message : err}`);
  }
}

// ── Named priority ladder ────────────────────────────────────────────────────

check('named channel priorities match danger > tutorial > objective > comms > flavor', () => {
  assert.equal(CHANNEL_PRIORITY.tutorial, 70);
  assert.equal(CHANNEL_PRIORITY.objective, 60);
  assert.ok(Number.isFinite(CHANNEL_PRIORITY.comms), 'comms must be a named channel');
  assert.equal(CHANNEL_PRIORITY.comms, 55);
  assert.equal(CHANNEL_PRIORITY.bark, 50);
  assert.equal(CHANNEL_PRIORITY.story, 100);
  assert.equal(CHANNEL_PRIORITY.alert, 80);
  assert.equal(DANGER_PRIORITY, 110);

  // Spec law on named tiers (danger is alert/DANGER override, not the story default).
  assert.ok(CHANNEL_PRIORITY.alert > CHANNEL_PRIORITY.tutorial);
  assert.ok(CHANNEL_PRIORITY.tutorial > CHANNEL_PRIORITY.objective);
  assert.ok(CHANNEL_PRIORITY.objective > CHANNEL_PRIORITY.comms);
  assert.ok(CHANNEL_PRIORITY.comms > CHANNEL_PRIORITY.bark, 'comms above bark/flavor');
  assert.ok(CHANNEL_PRIORITY.bark > CHANNEL_PRIORITY.news);
  assert.ok(CHANNEL_PRIORITY.news > CHANNEL_PRIORITY.info);
  // Load-bearing story stays above the alert default (danger uses DANGER_PRIORITY override).
  assert.ok(CHANNEL_PRIORITY.story > CHANNEL_PRIORITY.alert);
  assert.ok(DANGER_PRIORITY > CHANNEL_PRIORITY.story);
});

check('isDangerVoice recognizes alert channel and DANGER_PRIORITY override', () => {
  assert.equal(isDangerVoice({ channel: 'alert', priority: 80 }), true);
  assert.equal(isDangerVoice({ channel: 'story', priority: DANGER_PRIORITY }), true);
  assert.equal(isDangerVoice({ channel: 'story', priority: 100 }), false);
  assert.equal(isDangerVoice({ channel: 'comms', priority: 55 }), false);
  assert.equal(isDangerVoice(null), false);
});

check('comms enqueue resolves to the named priority (not info fallback)', () => {
  const q = new VoiceQueue();
  const e = q.enqueue({ channel: 'comms', text: 'Dock denied.', ttl: 2 }, 0);
  assert.equal(e.priority, CHANNEL_PRIORITY.comms);
  assert.equal(e.channel, 'comms');
});

// ── Tutorial protection during onboarding ────────────────────────────────────

check('during tutorialProtect, story cannot preempt a held tutorial beat', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'tutorial', text: 'Thrust to the beacon.', ttl: 10, id: 'tutorial:beat' }, 0);
  assert.equal(q.step(0).text, 'Thrust to the beacon.');

  q.enqueue({ channel: 'story', text: 'Cold-start story line.', ttl: 10, id: 'story:cold' }, 100);
  const policy = { tutorialProtect: true };
  assert.equal(q.step(100, policy), null, 'story must not cut the tutorial floor during onboarding');
  assert.equal(q.active.channel, 'tutorial');
  assert.equal(q.active.text, 'Thrust to the beacon.');
  assert.equal(q.pending.length, 1, 'story stays queued for after the beat');
  assert.equal(q.pending[0].channel, 'story');
});

check('during tutorialProtect, a persistent tutorial objective reserves an otherwise empty floor', () => {
  const q = new VoiceQueue();
  const policy = { tutorialProtect: true };

  q.enqueue({ channel: 'bark', text: 'Ambient transponder query.', ttl: 10, id: 'bark:scan' }, 0);
  q.enqueue({ channel: 'story', text: 'Contextual signal chatter.', ttl: 10, id: 'story:signal' }, 0);
  assert.equal(q.step(0, policy), null,
    'non-danger chatter cannot fill the transient floor while persistent onboarding owns teaching');
  assert.equal(q.active, null);

  q.enqueue({ channel: 'tutorial', text: 'Thrust to the beacon.', ttl: 10, id: 'tutorial:beat' }, 100);
  assert.equal(q.step(100, policy).text, 'Thrust to the beacon.',
    'an audible tutorial update may use the reserved floor');

  q.enqueue({
    channel: 'alert',
    text: 'SHIELDS DOWN',
    ttl: 2,
    priority: DANGER_PRIORITY,
    id: 'danger',
  }, 200);
  assert.equal(q.step(200, policy).text, 'SHIELDS DOWN',
    'genuine danger may still interrupt the reserved tutorial floor');
});

check('during tutorialProtect, flavor (bark/news/info/comms) cannot preempt tutorial', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'tutorial', text: 'Latch it. Massline.', ttl: 10, id: 'tutorial:beat' }, 0);
  assert.equal(q.step(0).text, 'Latch it. Massline.');
  const policy = { tutorialProtect: true };

  for (const channel of ['bark', 'news', 'info', 'comms', 'objective']) {
    q.enqueue({ channel, text: `${channel} noise`, ttl: 10, id: `noise:${channel}` }, 50);
    assert.equal(
      q.step(50, policy),
      null,
      `${channel} must not preempt tutorial under tutorialProtect`,
    );
  }
  assert.equal(q.active.channel, 'tutorial');
});

check('during tutorialProtect, danger (alert / DANGER_PRIORITY) CAN preempt tutorial', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'tutorial', text: 'Teach line', ttl: 10, id: 'tutorial:beat' }, 0);
  assert.equal(q.step(0).text, 'Teach line');

  q.enqueue({ channel: 'alert', text: 'SHIELDS DOWN', ttl: 2, priority: DANGER_PRIORITY, id: 'danger' }, 100);
  const policy = { tutorialProtect: true };
  const cut = q.step(100, policy);
  assert.equal(cut.text, 'SHIELDS DOWN');
  assert.equal(q.active.channel, 'alert');
  // Interrupted tutorial is re-queued (deterministic interrupt), not dropped.
  assert.ok(
    q.pending.some((e) => e.channel === 'tutorial' && e.text === 'Teach line'),
    'preempted tutorial must re-queue to resume after danger',
  );
});

check('without tutorialProtect, load-bearing story still preempts tutorial (post-onboarding)', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'tutorial', text: 'late hint', ttl: 10, id: 't' }, 0);
  assert.equal(q.step(0).text, 'late hint');

  q.enqueue({ channel: 'story', text: 'Ending: Vale', ttl: 8, id: 's' }, 100);
  const cut = q.step(100, {}); // no protection after onboarding
  assert.equal(cut.text, 'Ending: Vale');
  assert.equal(q.active.channel, 'story');
});

check('isOnboardingTeaching gates protection from state.onboarding', () => {
  assert.equal(isOnboardingTeaching({ onboarding: { active: true, finished: false } }), true);
  assert.equal(isOnboardingTeaching({ onboarding: { active: false, finished: true } }), false);
  assert.equal(isOnboardingTeaching({ onboarding: { active: true, finished: true } }), false);
  assert.equal(isOnboardingTeaching({}), false);
  assert.equal(isOnboardingTeaching(null), false);
});

check('system wrapper applies tutorialProtect while onboarding is teaching', () => {
  const bus = createBus();
  const state = {
    simTime: 0,
    onboarding: { active: true, finished: false },
  };
  const helpers = {};
  const surfaces = [];
  bus.on('voice:surface', (p) => surfaces.push(p));

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();

  helpers.voice.say({ channel: 'tutorial', text: 'Thrust to the beacon.', ttl: 5, id: 'tutorial:beat' });
  voiceArbiter.update(0, state);
  assert.equal(surfaces[surfaces.length - 1].text, 'Thrust to the beacon.');

  helpers.voice.say({ channel: 'story', text: 'Story tries to cut in.', ttl: 5, id: 'story:x' });
  state.simTime = 0.2;
  voiceArbiter.update(0.2, state);
  assert.equal(
    surfaces[surfaces.length - 1].text,
    'Thrust to the beacon.',
    'wrapper must keep tutorial floor during active onboarding',
  );
  assert.equal(voiceArbiter.queue.active.channel, 'tutorial');

  // After onboarding finishes, the previously queued story may preempt tutorial again
  // (load-bearing story is restored — protection is policy-gated only).
  state.onboarding = { active: false, finished: true };
  state.simTime = 0.3;
  voiceArbiter.update(0.1, state);
  assert.equal(voiceArbiter.queue.active.channel, 'story');
  assert.equal(surfaces[surfaces.length - 1].text, 'Story tries to cut in.');

  // A fresh post-onboarding story line still wins the named story tier over flavor.
  helpers.voice.say({ channel: 'bark', text: 'flavor bark', ttl: 5, id: 'bark:z' });
  state.simTime = 0.4;
  voiceArbiter.update(0.1, state);
  assert.equal(voiceArbiter.queue.active.channel, 'story', 'story remains load-bearing over flavor');
});

check('system wrapper reserves an empty floor for persistent onboarding and restores post-tutorial voice', () => {
  const bus = createBus();
  const state = {
    simTime: 0,
    onboarding: { active: true, finished: false },
  };
  const helpers = {};
  const surfaces = [];
  bus.on('voice:surface', (p) => surfaces.push(p));

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  helpers.voice.say({ channel: 'bark', text: 'Ambient transponder query.', ttl: 5, id: 'bark:scan' });
  helpers.voice.say({ channel: 'story', text: 'Contextual signal chatter.', ttl: 5, id: 'story:signal' });
  voiceArbiter.update(0, state);
  assert.equal(surfaces.length, 0, 'persistent tutorial UI reserves the otherwise empty voice floor');
  assert.equal(voiceArbiter.queue.active, null);

  helpers.voice.say({
    channel: 'alert',
    text: 'SHIELDS DOWN',
    ttl: 1,
    priority: DANGER_PRIORITY,
    id: 'danger',
  });
  state.simTime = 0.1;
  voiceArbiter.update(0.1, state);
  assert.equal(surfaces.at(-1).text, 'SHIELDS DOWN', 'danger still reaches the reserved floor');

  state.onboarding = { active: false, finished: true };
  state.simTime = 1.2;
  voiceArbiter.update(1.1, state);
  assert.equal(surfaces.at(-1).text, 'Contextual signal chatter.',
    'a still-live load-bearing line resumes under ordinary post-tutorial priority');
});

// ── Deterministic interrupt / dismiss / coalesce ─────────────────────────────

check('canInterrupt is pure and priority-strict', () => {
  const low = { channel: 'info', priority: 10 };
  const mid = { channel: 'comms', priority: 55 };
  const high = { channel: 'story', priority: 100 };
  const tut = { channel: 'tutorial', priority: 70 };
  const danger = { channel: 'alert', priority: DANGER_PRIORITY };

  assert.equal(canInterrupt(null, low), true);
  assert.equal(canInterrupt(low, mid), true);
  assert.equal(canInterrupt(mid, low), false);
  assert.equal(canInterrupt(mid, mid), false, 'equal priority never preempts');
  assert.equal(canInterrupt(tut, high, { tutorialProtect: true }), false);
  assert.equal(canInterrupt(tut, danger, { tutorialProtect: true }), true);
  assert.equal(canInterrupt(tut, high, { tutorialProtect: false }), true);
});

check('coalesce: same-id replace is in-place (no stack, seq preserved)', () => {
  const q = new VoiceQueue();
  const a = q.enqueue({ channel: 'tutorial', text: 'old', id: 'tutorial:beat', ttl: 10 }, 0);
  const b = q.enqueue({ channel: 'tutorial', text: 'new', id: 'tutorial:beat', ttl: 10 }, 50);
  assert.equal(q.size, 1);
  assert.equal(b.seq, a.seq, 'coalesce keeps insertion seq');
  assert.equal(q.step(50).text, 'new');
  // Coalesce while active
  q.enqueue({ channel: 'tutorial', text: 'newer', id: 'tutorial:beat', ttl: 10 }, 100);
  assert.equal(q.active.text, 'newer');
  assert.equal(q.pending.length, 0);
  assert.equal(q.size, 1);
});

check('dismiss drops the floor and promotes next deterministically', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'first', ttl: 10, id: 'a' }, 0);
  q.enqueue({ channel: 'comms', text: 'second', ttl: 10, id: 'b' }, 0);
  assert.equal(q.step(0).text, 'second', 'higher priority surfaces first');
  // second holds floor; first is still pending
  const next = q.dismiss(100, {});
  assert.equal(next.text, 'first', 'dismiss promotes the next best pending line');
  assert.equal(q.active.text, 'first');
});

check('interrupt re-queues preempted line; equal-priority FIFO is stable', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'A', ttl: 30, id: 'a' }, 0);
  q.enqueue({ channel: 'info', text: 'B', ttl: 30, id: 'b' }, 0);
  assert.equal(q.step(0).text, 'A');
  assert.equal(q.step(100), null, 'B waits (equal priority)');

  q.enqueue({ channel: 'alert', text: 'ALERT', ttl: 2, id: 'd' }, 200);
  assert.equal(q.step(200).text, 'ALERT');
  // A re-queued; B still pending. Both must remain until their expireAt.
  assert.deepEqual(q.pending.map((e) => e.text).sort(), ['A', 'B']);

  // After alert expires, earliest seq among equals resumes first (A before B).
  assert.equal(q.step(2200).text, 'A');
  // A still holds until its original expireAt (30s); force dismiss to hand off to B.
  assert.equal(q.dismiss(2300).text, 'B');
});

check('wrapper voice:dismiss clears presentation deterministically', () => {
  const bus = createBus();
  const state = { simTime: 0, onboarding: { active: false, finished: true } };
  const helpers = {};
  const surfaces = [];
  const clears = [];
  bus.on('voice:surface', (p) => surfaces.push(p.text));
  bus.on('voice:clear', (p) => clears.push(p.id));

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  helpers.voice.say({ channel: 'comms', text: 'Hail.', ttl: 5, id: 'c1' });
  voiceArbiter.update(0, state);
  assert.equal(surfaces[0], 'Hail.');

  bus.emit('voice:dismiss');
  assert.ok(clears.length >= 1, 'dismiss emits voice:clear');
  assert.equal(voiceArbiter.queue.active, null);
});

// ── Report ───────────────────────────────────────────────────────────────────

const total = passes + failures;
console.log(`first-hour-voice-priority: ${passes}/${total} passed`);
if (failures) process.exit(1);
