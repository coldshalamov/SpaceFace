// NXI-184 — a combat-heavy route gets the story entry at a calm opportunity.
//
// Contract: combat:fire / combat:hit involving the player re-stamps story.narrativeCalmUntilS
// (+STORY_CALM_GAP_S each), _pumpScheduled holds any due comms entry while now < calmUntil —
// never dropping it — and the first real lull presents it exactly once (seenComms + one emit).
// A neighboring success is pinned too: an entry scheduled with no combat pressure presents on
// its due time.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { story } from '../src/systems/story.js';

function harness(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  const bus = createBus();
  const comms = [];
  bus.on('comms:popup', (p) => comms.push(p));
  story.init({ state, bus, registry: { get: () => null }, helpers: {} });
  return { state, bus, comms, s: state.story };
}

const tick = (state, seconds) => {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    state.simTime += 1 / 60;
    story.update(1 / 60, state);
  }
};

const heard = (comms, id) => comms.filter((c) => c.id === id);

test('sustained combat holds the beat; the first real lull presents it once', () => {
  const { state, bus, comms, s } = harness();
  const base = state.simTime;
  // A story entry lands mid-fight.
  story._scheduleNarrative(0, {
    kind: 'comms', id: 'nxi184_beat', sender: 'TEST', text: 'calm-window line',
    category: 'story', ttl: 6,
  });
  // Sustained combat: a hit involving the player every second re-stamps the calm window —
  // the entry is due but must not present while the fight owns the channel.
  for (let i = 0; i < 20; i += 1) {
    bus.emit('combat:hit', { ownerId: 99, targetId: state.playerId });
    tick(state, 1);
    assert.equal(heard(comms, 'nxi184_beat').length, 0, `no story line during combat at +${i + 1}s`);
    assert.ok(s.scheduled.some((e) => e.id === 'nxi184_beat'),
      'the durable entry survives the fight — eligibility is not erased');
  }
  // The fight ends; the last re-stamp holds the channel ~8 more seconds.
  tick(state, 4);
  assert.equal(heard(comms, 'nxi184_beat').length, 0, 'the gap is still inside the last calm window');
  tick(state, 5);
  const presented = heard(comms, 'nxi184_beat');
  assert.equal(presented.length, 1, 'the first real lull presents the beat');
  assert.equal(s.seenComms.nxi184_beat, true);
  tick(state, 10);
  assert.equal(heard(comms, 'nxi184_beat').length, 1, 'presented once — the queue never replays it');
  assert.ok(state.simTime > base + 30, 'the whole arc spanned sustained combat + lull');
});

test('the same entry with no combat pressure presents on its due time — a legitimate neighbor', () => {
  const { state, comms, s } = harness();
  story._scheduleNarrative(2, {
    kind: 'comms', id: 'nxi184_calm', sender: 'TEST', text: 'on-time line',
    category: 'story', ttl: 6,
  });
  tick(state, 1);
  assert.equal(heard(comms, 'nxi184_calm').length, 0, 'not early');
  tick(state, 2);
  assert.equal(heard(comms, 'nxi184_calm').length, 1, 'a calm channel presents on schedule');
  assert.equal(s.seenComms.nxi184_calm, true);
});

test('combat that ignores the player does not hold the channel', () => {
  const { state, bus, comms } = harness();
  bus.emit('combat:hit', { ownerId: 42, targetId: 77 }); // NPC-on-NPC: not the player's fight
  assert.equal(state.story.narrativeCalmUntilS || 0, 0, 'no calm stamp for a fight the player is not in');
  story._scheduleNarrative(0, {
    kind: 'comms', id: 'nxi184_npc', sender: 'TEST', text: 'npc-fight line', category: 'story', ttl: 6,
  });
  tick(state, 0.5);
  assert.equal(heard(comms, 'nxi184_npc').length, 1, 'an NPC brawl never delays the entry');
});
