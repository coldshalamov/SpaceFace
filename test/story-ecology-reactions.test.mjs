import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import {
  CONFLICT_REACTION_SURFACES,
  conflictReactionEntries,
  conflictReactionVariantCount,
  normalizeConflictFlipFact,
  selectConflictReaction,
} from '../src/data/conflictReactions.js';
import { story as storyProto } from '../src/systems/story.js';
import { selectAdBoardNotice } from '../src/ui/station/adBoard.js';

const FLIP = Object.freeze({
  pairKey: 'faction_reach:faction_scn',
  sectorId: 'sector_helios_prime',
  newOwner: 'faction_reach',
});

test('ecology corpus contains exactly six Sker mourning and six Helios denial variants', () => {
  const sker = conflictReactionEntries(CONFLICT_REACTION_SURFACES.SKER_GRAFFITI);
  const helios = conflictReactionEntries(CONFLICT_REACTION_SURFACES.HELIOS_AD);
  assert.equal(sker.length, 6);
  assert.equal(helios.length, 6);
  assert.equal(conflictReactionVariantCount(), 12);
  assert.ok(sker.every((entry) => FLAVOR_PACKS.graffiti.entries.includes(entry)));
  assert.ok(helios.every((entry) => FLAVOR_PACKS.ad_board.entries.includes(entry)));
});

test('reaction selection is deterministic and resolves live sector/faction identities', () => {
  assert.equal(normalizeConflictFlipFact({ ...FLIP, newOwner: 'faction_unknown' }), null,
    'a reaction cannot invent a winner outside the authoritative conflict pair');
  const flip = normalizeConflictFlipFact({ ...FLIP, sequence: 3, t: 240 });
  const input = {
    surface: CONFLICT_REACTION_SURFACES.SKER_GRAFFITI,
    seed: 47,
    flip,
  };
  const first = selectConflictReaction(input);
  assert.deepEqual(selectConflictReaction(input), first);
  assert.equal(first.factId, flip.id);
  assert.doesNotMatch(first.text, /\{(?:sector|winner|loser)\}/);
  assert.match(first.text, /HELIOS PRIME|REACH|CONCORD/);

  const ad = selectConflictReaction({
    surface: CONFLICT_REACTION_SURFACES.HELIOS_AD,
    seed: 47,
    flip,
    cycle: 2,
  });
  assert.equal(ad.packId, 'ad_board');
  assert.doesNotMatch(ad.text, /\{(?:sector|winner|loser)\}/);
});

test('authoritative conflict flip reaches Sker wall and Helios board without changing pre-flip ads', () => {
  const h = harness();
  const preFlip = selectAdBoardNotice({
    seed: 0x56324c49,
    stationId: 'station_helios',
    simTime: 12,
  });
  assert.equal(preFlip.id, 'ad_09', 'ordinary Helios rotation stays byte-for-byte on its prior row');
  assert.equal(preFlip.reaction, undefined);

  h.state.conflicts[FLIP.pairKey] = { playerLean: 0, tension: 50, momentum: 0, state: 'tense' };
  h.bus.emit('conflict:flip', FLIP);
  const savedFact = h.state.story.conflictReaction.latestFlip;
  assert.ok(savedFact);
  assert.equal(savedFact.sequence, 1);
  assert.equal(savedFact.newOwner, 'faction_reach');

  h.bus.emit('dock:docked', { stationId: 'station_sker' });
  const wall = h.graffiti.find((entry) => entry.source === 'conflict_flip');
  assert.ok(wall, 'Sker dock emits the saved flip onto the existing airlock wall');
  assert.equal(wall.where, 'airlock');
  assert.equal(wall.author, 'Sker wall');

  const helios = selectAdBoardNotice({
    seed: h.state.meta.seed,
    stationId: 'station_helios',
    simTime: h.state.simTime,
    conflictFlip: savedFact,
  });
  assert.equal(helios.reaction, 'conflict_flip');
  assert.equal(helios.factId, savedFact.id);
  assert.ok(FLAVOR_PACKS.ad_board.entries.some((entry) => entry.id === helios.id));

  const elsewhere = selectAdBoardNotice({
    seed: h.state.meta.seed,
    stationId: 'station_drift',
    simTime: h.state.simTime,
    conflictFlip: savedFact,
  });
  assert.equal(elsewhere.reaction, undefined, 'the denial campaign stays physically at Helios');
});

test('Continue preserves the exact flip fact and rebuilds both existing station surfaces', () => {
  const before = harness();
  before.state.conflicts[FLIP.pairKey] = { playerLean: 0, tension: 50, momentum: 0, state: 'tense' };
  before.bus.emit('conflict:flip', FLIP);
  before.bus.emit('dock:docked', { stationId: 'station_sker' });
  const firstWall = before.graffiti.find((entry) => entry.source === 'conflict_flip');
  const savedStory = structuredClone(before.story.serialize().story);

  const resumed = harness();
  resumed.story.deserialize({ story: savedStory });
  resumed.bus.emit('save:loaded', { slot: 0 });
  resumed.bus.emit('dock:docked', { stationId: 'station_sker' });
  const resumedWall = resumed.graffiti.find((entry) => entry.source === 'conflict_flip');
  assert.equal(resumedWall.line, firstWall.line);
  assert.deepEqual(resumed.state.story.conflictReaction, savedStory.conflictReaction);

  const resumedAd = selectAdBoardNotice({
    seed: resumed.state.meta.seed,
    stationId: 'station_coalition',
    simTime: resumed.state.simTime,
    conflictFlip: resumed.state.story.conflictReaction.latestFlip,
  });
  assert.equal(resumedAd.reaction, 'conflict_flip');
});

function harness() {
  const state = {
    mode: 'flight',
    simTime: 300,
    meta: { seed: 47 },
    settings: { gameplay: { tutorialHints: false } },
    onboarding: { active: false, finished: true },
    player: { stats: { lifetimeProfit: 0 }, cargo: { items: {} } },
    conflicts: {},
    claims: { bodies: [] },
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    story: { beatIndex: 3, branch: null, flags: {}, chainProgress: 0, seenComms: {} },
    entities: new Map(),
  };
  const bus = createBus();
  const graffiti = [];
  bus.on('graffiti:show', (payload) => graffiti.push(structuredClone(payload)));
  const story = Object.create(storyProto);
  story.init({
    state,
    bus,
    helpers: { voice: { say: () => true } },
    registry: { get: () => null },
  });
  return { state, bus, story, graffiti };
}
