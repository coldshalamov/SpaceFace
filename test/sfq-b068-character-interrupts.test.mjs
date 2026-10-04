// SFQ-B068 — characters interrupt for reasons.
//
// Contract: a named-character interruption fires ONLY from an observable world/mission fact
// (def.cond over state — cargo aboard, sector security/dwell, faction rep); while a
// higher-priority voice holds the channel the LIVE voice arbiter (src/ui/voiceArbiter.js)
// suppresses it (queued, not surfaced) and re-queues it onto the floor once the higher voice
// expires; a fight holding the narrative calm window makes the poll hold off WITHOUT marking
// the line seen, so the same fact earns the line at the first lull.
// Seed 4242 throughout.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { story } from '../src/systems/story.js';
import { voiceArbiter, DANGER_PRIORITY } from '../src/ui/voiceArbiter.js';
import { OPENING_INSTRUCTION_WINDOW_S } from '../src/ui/hudAttention.js';

const SAMPLE_ID = 'cmdty_47a_assay_sample';
const HIGHSEC = 'sec_b068_highsec';

function harness(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  // No tutorial owns the channel and the opening-instruction window is closed.
  state.onboarding = { active: false, finished: true };
  const bus = createBus();
  const comms = [];
  const surfaced = [];
  bus.on('comms:popup', (p) => comms.push(p));
  bus.on('voice:surface', (p) => surfaced.push(p));
  const helpers = {};
  story.init({ state, bus, registry: { get: () => null }, helpers });
  voiceArbiter.init({ state, bus, helpers });
  state.simTime = OPENING_INSTRUCTION_WINDOW_S + 10;
  // Arm the interrupt poll clock as a warmed session (the lazy +5s grace is boot behavior,
  // not part of these pins) so a due poll fires on the first update tick.
  story._charNextAtS = 0;
  return { state, bus, comms, surfaced, helpers, s: state.story };
}

const tick = (state, seconds) => {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    state.simTime += 1 / 60;
    story.update(1 / 60, state);
    voiceArbiter.update(1 / 60, state);
  }
};

const heard = (comms, id) => comms.filter((c) => c.id === id);

const giveSample = (state) => {
  state.player.cargo.items[SAMPLE_ID] = 1;
  state.story.beatIndex = 1;
};

test('a character interruption fires from the observable fact and takes the free floor once', () => {
  const { state, comms, surfaced, s } = harness();
  giveSample(state);
  tick(state, 1);
  const popups = heard(comms, 'char_kessler_sample_aboard');
  assert.equal(popups.length, 1, 'the fact earns exactly one interruption');
  assert.equal(popups[0].sender, 'TYCHO RELAY — PRIVATE QUEUE');
  assert.equal(popups[0].category, 'personal');
  assert.equal(popups[0]._viaVoice, true, 'voiced through the one-voice arbiter');
  assert.equal(s.seenComms.char_kessler_sample_aboard, true);
  const said = surfaced.filter((e) => e.id === 'char_kessler_sample_aboard');
  assert.equal(said.length, 1, 'the arbiter surfaces it on the free floor');
  assert.match(said[0].text, /KESSLER/);
  tick(state, 12); // several more polls
  assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 1, 'never repeats');
});

test('with the fact absent the interruption never fires and stays eligible for when it holds', () => {
  const { state, comms, s } = harness();
  state.story.beatIndex = 1; // beat alone is not the fact — the sample is
  tick(state, 12);
  assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 0, 'no fact, no line');
  assert.equal(s.seenComms.char_kessler_sample_aboard, undefined, 'eligibility untouched');
  giveSample(state); // the observable fact becomes true
  tick(state, 6); // past the next poll tick (the poll re-arms on CHARACTER_INTERRUPT_POLL_S)
  assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 1, 'the arriving fact earns the line');
});

test('while a higher-priority voice holds the channel the interrupt is suppressed, then re-queued onto the floor', () => {
  const { state, comms, surfaced, helpers } = harness();
  giveSample(state);
  // A life-critical danger voice (priority 110 > story 100) takes and holds the floor.
  helpers.voice.say({
    channel: 'alert', priority: DANGER_PRIORITY, kind: 'danger', ttl: 4,
    id: 'b068_danger_floor', text: 'DANGER: MISSILE LAUNCH — BREAK AND RUN',
  });
  tick(state, 0.5); // danger surfaces; the interrupt poll fires under it
  assert.equal(voiceArbiterName(surfaced), 'b068_danger_floor', 'danger owns the floor');
  assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 1, 'the line was voiced into arbitration');
  const said = surfaced.filter((e) => e.id === 'char_kessler_sample_aboard');
  assert.equal(said.length, 0, 'suppressed — the character never covers an imminent threat');
  assert.ok(voiceArbiter.queue.pending.some((e) => e.id === 'char_kessler_sample_aboard'),
    're-queued behind the higher-priority voice, not dropped');
  tick(state, 4); // the danger ttl expires; the interrupt is still inside its own ttl
  const late = surfaced.filter((e) => e.id === 'char_kessler_sample_aboard');
  assert.equal(late.length, 1, 'the re-queued interruption takes the floor when the danger clears');
});

test('a fight holds the narrative channel: the poll waits without spending the line, the lull presents it', () => {
  const { state, bus, comms, s } = harness();
  giveSample(state);
  for (let i = 0; i < 6; i += 1) {
    bus.emit('combat:hit', { ownerId: 99, targetId: state.playerId }); // re-stamps the calm window
    tick(state, 1);
    assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 0, `no interruption mid-fight at +${i + 1}s`);
    assert.equal(s.seenComms.char_kessler_sample_aboard, undefined, 'eligibility survives the fight');
  }
  tick(state, 12); // past STORY_CALM_GAP_S from the last stamp AND the next poll tick
  assert.equal(heard(comms, 'char_kessler_sample_aboard').length, 1, 'the first lull presents it once');
});

// Highest-priority voice currently presented by the arbiter (last voice:surface id).
function voiceArbiterName(surfaced) {
  return surfaced.length ? surfaced[surfaced.length - 1].id : null;
}
