import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import {
  CONFLICT_REACTION_SURFACES,
  conflictReactionEntries,
  conflictReactionPackId,
  conflictReactionSurfaceForStation,
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

test('ecology corpus carries a six-variant war register for each of the eight station factions', () => {
  const expected = {
    [CONFLICT_REACTION_SURFACES.SKER_GRAFFITI]: 'graffiti',
    [CONFLICT_REACTION_SURFACES.HELIOS_AD]: 'ad_board',
    [CONFLICT_REACTION_SURFACES.DMC_TALLY]: 'ad_board',
    [CONFLICT_REACTION_SURFACES.MTS_MANIFEST]: 'ad_board',
    [CONFLICT_REACTION_SURFACES.QUIET_WHISPER]: 'graffiti',
    [CONFLICT_REACTION_SURFACES.VAEL_KEEL]: 'graffiti',
    [CONFLICT_REACTION_SURFACES.FREE_DOCKLINE]: 'graffiti',
    [CONFLICT_REACTION_SURFACES.CHOIR_LITANY]: 'graffiti',
  };
  for (const [surface, packId] of Object.entries(expected)) {
    const entries = conflictReactionEntries(surface);
    assert.equal(entries.length, 6, `${surface} keeps a full six-variant register`);
    assert.equal(conflictReactionPackId(surface), packId);
    assert.ok(entries.every((entry) => FLAVOR_PACKS[packId].entries.includes(entry)));
  }
  assert.equal(conflictReactionVariantCount(), 48);
});

test('every station-holding faction resolves its own physical surface', () => {
  const stations = {
    station_sker: CONFLICT_REACTION_SURFACES.SKER_GRAFFITI,
    station_helios: CONFLICT_REACTION_SURFACES.HELIOS_AD,
    station_ceres: CONFLICT_REACTION_SURFACES.DMC_TALLY,
    station_tethys: CONFLICT_REACTION_SURFACES.MTS_MANIFEST,
    station_smuggler: CONFLICT_REACTION_SURFACES.QUIET_WHISPER,
    station_ashcache: CONFLICT_REACTION_SURFACES.VAEL_KEEL,
    station_veil: CONFLICT_REACTION_SURFACES.FREE_DOCKLINE,
    station_depot3: CONFLICT_REACTION_SURFACES.CHOIR_LITANY,
  };
  for (const [stationId, surface] of Object.entries(stations)) {
    assert.equal(conflictReactionSurfaceForStation(stationId), surface,
      `${stationId} resolves to ${surface}`);
  }
  assert.equal(conflictReactionSurfaceForStation('poi_merc'), null,
    'a non-station point of interest carries no faction register');
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

  const mts = selectAdBoardNotice({
    seed: h.state.meta.seed,
    stationId: 'station_drift',
    simTime: h.state.simTime,
    conflictFlip: savedFact,
  });
  assert.equal(mts.reaction, 'conflict_flip',
    'the Syndicate board at Drift reads the same saved flip in its own manifest voice');
  assert.ok(mts.id.startsWith('war_mts_'));

  const skerBoard = selectAdBoardNotice({
    seed: h.state.meta.seed,
    stationId: 'station_sker',
    simTime: h.state.simTime,
    conflictFlip: savedFact,
  });
  assert.equal(skerBoard.reaction, undefined,
    'a graffiti-surface station keeps the ordinary ad-board rotation');
});

test('a saved flip surfaces on every faction wall, not only Sker', () => {
  for (const stationId of ['station_smuggler', 'station_ashcache', 'station_veil', 'station_depot3']) {
    const h = harness();
    h.state.conflicts[FLIP.pairKey] = { playerLean: 0, tension: 50, momentum: 0, state: 'tense' };
    h.bus.emit('conflict:flip', FLIP);
    h.bus.emit('dock:docked', { stationId });
    const wall = h.graffiti.find((entry) => entry.source === 'conflict_flip');
    assert.ok(wall, `${stationId} dock emits the saved flip onto its own airlock wall`);
    assert.equal(wall.where, 'airlock');
    assert.notEqual(wall.author, 'Sker wall', `${stationId} speaks in its own register`);
  }
});

test('Continue preserves the exact flip fact and rebuilds faction station surfaces', () => {
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
