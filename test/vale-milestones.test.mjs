import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { COMMS } from '../src/data/narrative.js';
import { story as storyProto } from '../src/systems/story.js';

const IDS = Object.freeze({
  profit: 'story_vale_profit_100k',
  conflict: 'story_vale_conflict_flip',
  claim: 'story_vale_claim_charter',
});

function harness({
  onboarding = { active: false, finished: true },
  lifetimeProfit = 0,
  conflicts = {},
  claims = [],
  storyData = null,
} = {}) {
  const state = {
    mode: 'flight',
    simTime: 100,
    meta: { seed: 47 },
    settings: { gameplay: { tutorialHints: false } },
    onboarding: structuredClone(onboarding),
    player: { stats: { lifetimeProfit } },
    conflicts: structuredClone(conflicts),
    claims: { bodies: structuredClone(claims) },
    factions: {},
    world: { sectors: {} },
    story: storyData ? structuredClone(storyData) : {
      beatIndex: 3,
      branch: null,
      flags: {},
      chainProgress: 0,
      seenComms: {},
    },
    entities: new Map(),
  };
  const bus = createBus();
  const popups = [];
  const voiceCalls = [];
  bus.on('comms:popup', (payload) => popups.push(structuredClone(payload)));
  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    helpers: { voice: { say: (payload) => { voiceCalls.push(structuredClone(payload)); return true; } } },
    registry: { get: () => null },
  });
  return { state, bus, story, popups, voiceCalls };
}

function messages(h, id) {
  return h.popups.filter((payload) => payload.id === id);
}

function emitProfit(h, amount) {
  h.state.player.stats.lifetimeProfit = amount;
  h.bus.emit('economy:tradeCompleted', { side: 'sell', profit: 1, total: 100 });
}

function emitConflictFlip(h, { playerLean = 0, pairKey = 'faction_scn:faction_reach' } = {}) {
  h.state.conflicts[pairKey] = {
    tension: 50,
    state: 'tense',
    momentum: 0,
    playerLean,
  };
  h.bus.emit('conflict:flip', {
    pairKey,
    sectorId: 'sector_io_reach',
    newOwner: 'faction_reach',
  });
}

function emitClaim(h, body = { id: 'claim_1', name: 'Prospector’s Rest', sectorId: 'sector_ceres_belt' }) {
  h.state.claims.bodies.push(structuredClone(body));
  h.bus.emit('claim:claimed', { body: structuredClone(body) });
  return body;
}

test('three terse Director Vale milestone entries are canonical narrative data', () => {
  const defs = COMMS.story.filter((entry) => Object.values(IDS).includes(entry.id));
  assert.equal(defs.length, 3);
  for (const def of defs) {
    assert.match(def.sender, /VALE/i);
    assert.equal(def.once, true);
    assert.ok(def.text.trim());
    assert.ok(def.text.split(/\r?\n/).length <= 5, `${def.id} exceeds five lines`);
  }
});

test('first 100,000 lifetime profit fires exactly once through story voice and comms backlog', () => {
  const h = harness();
  emitProfit(h, 99_999);
  assert.equal(messages(h, IDS.profit).length, 0);
  emitProfit(h, 100_000);
  emitProfit(h, 140_000);

  const [message] = messages(h, IDS.profit);
  assert.ok(message);
  assert.equal(message.category, 'story');
  assert.equal(message._viaVoice, true, 'player-addressed line is marked for normal backlog-only logging');
  assert.equal(h.state.story.seenComms[IDS.profit], true);
  const voice = h.voiceCalls.find((payload) => payload.id === IDS.profit);
  assert.equal(voice.channel, 'story');
});

test('only a player-influenced conflict flip earns the first Vale conflict filing', () => {
  const h = harness();
  emitConflictFlip(h, { playerLean: 0 });
  assert.equal(messages(h, IDS.conflict).length, 0, 'NPC-only flip must stay world news, not player credit');
  emitConflictFlip(h, { playerLean: 0.25 });
  emitConflictFlip(h, { playerLean: -0.5 });
  assert.equal(messages(h, IDS.conflict).length, 1);
  assert.equal(h.state.story.seenComms[IDS.conflict], true);
});

test('first claim charter names the claimed body and never duplicates', () => {
  const h = harness();
  const body = emitClaim(h);
  emitClaim(h, { id: 'claim_2', name: 'Second Stake', sectorId: 'sector_io_reach' });
  const [message] = messages(h, IDS.claim);
  assert.ok(message.text.includes(body.name), 'Vale filing must retain first claim identity');
  assert.equal(messages(h, IDS.claim).length, 1);
  assert.equal(h.state.story.seenComms[IDS.claim], true);
});

test('milestones wait for onboarding handoff, then recover all durable facts once', () => {
  const h = harness({ onboarding: { active: true, finished: false } });
  emitProfit(h, 100_000);
  emitConflictFlip(h, { playerLean: 0.4 });
  const firstClaim = emitClaim(h);
  assert.equal(h.popups.filter((payload) => Object.values(IDS).includes(payload.id)).length, 0);
  assert.equal(h.voiceCalls.filter((payload) => Object.values(IDS).includes(payload.id)).length, 0);

  h.state.onboarding.active = false;
  h.state.onboarding.finished = true;
  h.bus.emit('tutorial:finished', {});

  for (const id of Object.values(IDS)) assert.equal(messages(h, id).length, 1, `${id} released once`);
  assert.ok(messages(h, IDS.claim)[0].text.includes(firstClaim.name));
});

test('Continue recovers missed facts and seenComms prevents a second Continue replay', () => {
  const before = harness({ onboarding: { active: true, finished: false } });
  emitProfit(before, 125_000);
  emitConflictFlip(before, { playerLean: -0.3 });
  const firstClaim = emitClaim(before, { id: 'claim_7', name: 'Cinder Charter', sectorId: 'sector_charon_expanse' });
  assert.equal(before.popups.filter((payload) => Object.values(IDS).includes(payload.id)).length, 0);

  const missedStory = structuredClone(before.story.serialize().story);
  const resumed = harness({
    lifetimeProfit: before.state.player.stats.lifetimeProfit,
    conflicts: before.state.conflicts,
    claims: before.state.claims.bodies,
  });
  resumed.story.deserialize({ story: missedStory });
  resumed.bus.emit('save:loaded', { slot: 0 });
  for (const id of Object.values(IDS)) assert.equal(messages(resumed, id).length, 1, `${id} recovered on Continue`);
  assert.ok(messages(resumed, IDS.claim)[0].text.includes(firstClaim.name));

  const deliveredStory = structuredClone(resumed.story.serialize().story);
  const resumedAgain = harness({
    lifetimeProfit: resumed.state.player.stats.lifetimeProfit,
    conflicts: resumed.state.conflicts,
    claims: resumed.state.claims.bodies,
  });
  resumedAgain.story.deserialize({ story: deliveredStory });
  resumedAgain.bus.emit('save:loaded', { slot: 0 });
  assert.equal(resumedAgain.popups.filter((payload) => Object.values(IDS).includes(payload.id)).length, 0);
});
