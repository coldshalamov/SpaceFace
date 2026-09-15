import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTitlesSystem } from '../src/systems/titles.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { barkDirector, STUNT_BARKS, stuntRecognitionBarkFor } from '../src/systems/barkDirector.js';
import { mulberry32 } from '../src/core/rng.js';

function createMockBus() {
  const listeners = new Map();
  const emissions = [];
  return {
    emissions,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    off(event, handler) {
      const set = listeners.get(event);
      if (set) set.delete(handler);
    },
    emit(event, payload) {
      emissions.push({ event, payload });
      const set = listeners.get(event);
      if (set) {
        for (const handler of [...set]) {
          handler(payload);
        }
      }
    },
  };
}

function createAdventureState({ simTime = 42.0, tick = 2520, seed = 1337 } = {}) {
  const rng = mulberry32(seed);
  const playerEntity = {
    id: 'player',
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    data: { displayName: 'Tessera', worldRecordId: 'player_hull' },
  };
  const witnessEntity = {
    id: 'witness_reach_01',
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    alive: true,
    pos: { x: 120, y: 0, z: 0 },
    data: { displayName: 'Vane Scrapper', ai: { fsm: 'pursue' } },
  };

  const entities = new Map([
    [playerEntity.id, playerEntity],
    [witnessEntity.id, witnessEntity],
  ]);

  return {
    mode: 'flight',
    profile: 'production',
    playerId: 'player',
    simTime,
    tick,
    rng,
    meta: { seed },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [playerEntity, witnessEntity],
    story: {
      titles: { schemaVersion: 2, byId: {} },
      titlesSeen: [],
    },
  };
}

function materialTrick(over = {}) {
  return {
    schemaVersion: 1,
    trickId: 'bolas',
    name: 'Bolas',
    rarity: 'rare',
    baseScore: 400,
    description: 'Slung a projectile that entangled or consecutively struck two hostiles.',
    actorId: 'player',
    targetId: 'drone_victim',
    secondaryIds: ['weighted_cable'],
    metrics: { deltaV: 18.5, exchangedMomentum: 3200 },
    causeChain: [
      { step: 1, type: 'tether_sling', entityId: 'player', targetId: 'weighted_cable', detail: 'slung rotating body into flight group' },
      { step: 2, type: 'chain_strike', entityId: 'weighted_cable', targetId: 'drone_victim', detail: 'entangled consecutive targets in one throw' },
    ],
    consequence: { victimId: 'drone_victim', killed: true, hullDamage: 0, hullMax: 60 },
    episodeId: 'ep_bolas_1',
    rootId: 'root_bolas_1',
    rootTick: 2500,
    tick: 2520,
    ...over,
  };
}

function witnessCover(id, over = {}) {
  return { id, sourceTicks: 12, transferTicks: 9, payoffTicks: 8, lineOfSight: true, ...over };
}

test('PQ-146.02: witnessed bolas stunt writes ledger line and NPC bark in one session, and save round-trips', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = {
    voice: {
      say: (p) => {
        spoken.push(p);
        return true;
      },
    },
  };

  const titles = createTitlesSystem();
  titles.init({ state, bus });

  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  const trick = materialTrick({ witnesses: [witnessCover('witness_reach_01')] });

  // 1. Fire the stunt trick detected event on the bus
  bus.emit('stunt:trickDetected', trick);

  // 2. NPC Bark verification in the same session
  const barkVoiceEvents = bus.emissions.filter((e) => e.event === 'barkDirector:voice');
  assert.equal(barkVoiceEvents.length, 1, 'barkDirector:voice was emitted');
  const bark = barkVoiceEvents[0].payload;
  assert.equal(bark.entityId, 'witness_reach_01');
  assert.equal(bark.situation, 'stunt-recognition');
  assert.equal(bark.reason, 'bolas');
  assert.equal(bark.factionId, 'faction_reach');
  assert.equal(bark.trickId, 'bolas');
  assert.equal(bark.title, 'Knotmaker');
  assert.ok(bark.text.includes('Knotmaker'), 'bark text references the Knotmaker title');
  assert.equal(spoken.length, 1, 'voice helper received the bark');
  assert.equal(spoken[0].channel, 'bark');
  assert.equal(spoken[0].kind, 'stuntRecognition');

  // 3. Title state verification in the same session
  const titleRecord = state.story.titles.byId.title_bolas;
  assert.ok(titleRecord, 'title_bolas exists in state.story.titles.byId');
  assert.equal(titleRecord.title, 'Knotmaker');
  assert.equal(titleRecord.trickId, 'bolas');
  assert.equal(titleRecord.status, 'held');
  assert.equal(titleRecord.holderKey, 'player_hull');

  assert.equal(state.story.titlesSeen.length, 1, 'title was added to state.story.titlesSeen');
  const seenRecord = state.story.titlesSeen[0];
  assert.equal(seenRecord.title, 'Knotmaker');
  assert.equal(seenRecord.trickId, 'bolas');
  assert.equal(seenRecord.holderKey, 'player_hull');

  // 4. Ship ledger line verification in the same session
  const ledger = buildShipLedger(state);
  const titleEntries = ledger.entries.filter((e) => e.type === 'title');
  assert.equal(titleEntries.length, 1, 'ship ledger contains one title row');
  const row = titleEntries[0];
  assert.equal(row.trickId, 'bolas', 'ship ledger row attaches trickId');
  assert.equal(row.sourceKind, 'story.titlesSeen');
  assert.ok(row.text.includes('Knotmaker'), 'ship ledger text includes Knotmaker');
  const stuntEntries = ledger.entries.filter((e) => e.type === 'stunt');
  assert.equal(stuntEntries.length, 1, 'ship ledger contains one stunt row');
  assert.equal(stuntEntries[0].trickId, 'bolas');
  assert.equal(stuntEntries[0].sourceKind, 'story.titles.stuntIncidents');
  assert.ok(stuntEntries[0].text.includes('Tessera'), 'stunt row carries the ship snapshot name');
  assert.ok(stuntEntries[0].text.includes('independently witnessed'), 'stunt row carries witness evidence');

  // 5. Save/restore round-trip verification
  // Save integrity law: entityId must never leak into serialized story
  const savedStory = JSON.parse(JSON.stringify(state.story));
  assert.equal(JSON.stringify(savedStory).includes('entityId'), false, 'save integrity: entityId never leaks into story save');

  // Simulate restore in a fresh session
  const restoredState = createAdventureState({ simTime: 100.0, tick: 6000, seed: 1337 });
  restoredState.story = savedStory;
  restoredState.entities.get('player').data.displayName = 'Renamed Hull';

  const restoredTitles = createTitlesSystem();
  restoredTitles.init({ state: restoredState, bus: createMockBus() });

  // Verify the restored state still has the title and ledger line
  assert.ok(restoredState.story.titles.byId.title_bolas, 'restored state has title_bolas');
  assert.equal(restoredState.story.titles.byId.title_bolas.title, 'Knotmaker');
  assert.equal(restoredState.story.titlesSeen.length, 1, 'restored state has titlesSeen record');
  assert.equal(restoredState.story.titlesSeen[0].trickId, 'bolas');

  const restoredLedger = buildShipLedger(restoredState);
  const restoredTitleEntries = restoredLedger.entries.filter((e) => e.type === 'title');
  assert.equal(restoredTitleEntries.length, 1, 'restored ledger projects title row');
  assert.equal(restoredTitleEntries[0].trickId, 'bolas');
  assert.ok(restoredTitleEntries[0].text.includes('Knotmaker'), 'restored ledger text includes Knotmaker');
  const restoredStuntEntries = restoredLedger.entries.filter((e) => e.type === 'stunt');
  assert.equal(restoredStuntEntries.length, 1, 'restored ledger projects stunt row');
  assert.ok(restoredStuntEntries[0].text.includes('Tessera'), 'stunt row keeps the ship snapshot name after rename');

  titles.destroy();
  barks.destroy();
  restoredTitles.destroy();
});

test('PQ-146.02: a trick without a consequence chain is NOT rewarded (no bark, no title, no ledger line)', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  // Empty causeChain
  bus.emit('stunt:trickDetected', {
    trickId: 'bolas',
    name: 'Bolas',
    actorId: 'player',
    causeChain: [],
    tick: state.tick,
  });

  assert.equal(spoken.length, 0, 'no voice call for empty causeChain');
  assert.equal(bus.emissions.filter((e) => e.event === 'barkDirector:voice').length, 0, 'no bark voice event');
  assert.equal(state.story.titlesSeen.length, 0, 'no title in titlesSeen');
  assert.equal(buildShipLedger(state).entries.filter((e) => e.type === 'title').length, 0, 'no ledger line');

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: a trick by an NPC does NOT earn a player title or trigger stunt recognition bark', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  // Actor is an NPC, not player
  bus.emit('stunt:trickDetected', {
    trickId: 'bolas',
    name: 'Bolas',
    actorId: 'enemy_ship_99',
    causeChain: [{ step: 1, type: 'tether_sling' }],
    tick: state.tick,
  });

  assert.equal(spoken.length, 0, 'no voice call for NPC actor');
  assert.equal(state.story.titlesSeen.length, 0, 'no title in titlesSeen');

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: a real material stunt with no witness writes one private black-box row, no title, no bark', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  bus.emit('stunt:trickDetected', materialTrick());

  // The incident is a private black-box record.
  assert.equal(state.story.titles.stuntIncidents.length, 1, 'one private stunt incident recorded');
  assert.equal(state.story.titles.stuntIncidents[0].visibility, 'black-box');
  const stuntRows = buildShipLedger(state).entries.filter((e) => e.type === 'stunt');
  assert.equal(stuntRows.length, 1, 'one private stunt ledger row');
  assert.ok(stuntRows[0].text.includes('no independent witness'), 'row is honest about the missing witness');

  // A nearby NPC hull alone is not evidence: no title and no bark.
  assert.equal(state.story.titlesSeen.length, 0, 'no title without qualified witness coverage');
  assert.equal(state.story.titles.byId.title_bolas == null, true);
  assert.equal(spoken.length, 0, 'no bark spoken when unwitnessed');
  assert.equal(bus.emissions.filter((e) => e.event === 'barkDirector:voice').length, 0);

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: dead or self-owned witnesses cannot qualify a title or bark', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  const dead = state.entities.get('witness_reach_01');
  dead.alive = false;
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_dead', witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.equal(state.story.titles.byId.title_bolas == null, true, 'dead witness earns no title');

  dead.alive = true;
  dead.data.playerOwned = true;
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_owned', witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.equal(state.story.titles.byId.title_bolas == null, true, 'self-owned witness earns no title');

  dead.data.playerOwned = false;
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_short', witnesses: [witnessCover('witness_reach_01', { payoffTicks: 2 })],
  }));
  assert.equal(state.story.titles.byId.title_bolas == null, true, 'thin coverage earns no title');

  assert.equal(spoken.length, 0);
  assert.equal(state.story.titles.stuntIncidents.length, 3, 'incidents still recorded privately');
  assert.equal(state.story.titlesSeen.length, 0);

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: no spoken bark without an accepted voice.say, and no repeat delivery', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const helpers = { voice: {} };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  bus.emit('stunt:trickDetected', materialTrick({ witnesses: [witnessCover('witness_reach_01')] }));
  assert.equal(bus.emissions.filter((e) => e.event === 'barkDirector:voice').length, 0,
    'missing voice.say produces no bark event');
  assert.equal(state.story.titles.stuntIncidents[0].barkDelivered !== true, true,
    'delivery is not recorded without accepted speech');

  const spoken = [];
  helpers.voice.say = (p) => { spoken.push(p); return false; };
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_bolas_2', witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.ok(spoken.length >= 1, 'voice was asked');
  assert.equal(state.story.titles.stuntIncidents[1].barkDelivered !== true, true,
    'rejected speech is not delivery');

  helpers.voice.say = (p) => { spoken.push(p); return true; };
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_bolas_3', witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.equal(state.story.titles.stuntIncidents[2].barkDelivered, true,
    'accepted speech marks the incident delivered');
  const deliveredCalls = spoken.length;
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_bolas_3', witnesses: [witnessCover('witness_reach_01')],
  }));
  bus.emit('story:stuntIncidentRecorded', {
    incident: state.story.titles.stuntIncidents[2],
    trick: materialTrick({ episodeId: 'ep_bolas_3', witnesses: [witnessCover('witness_reach_01')] }),
  });
  assert.equal(spoken.length, deliveredCalls, 'a delivered incident never speaks again');

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: survival run stunts write no story, ledger, or bark', () => {
  const state = createAdventureState();
  state.run = { kind: 'survival', phase: 'active' };
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  bus.emit('stunt:trickDetected', materialTrick({ witnesses: [witnessCover('witness_reach_01')] }));

  assert.equal((state.story.titles.stuntIncidents || []).length, 0, 'no incident under a live run');
  assert.equal(state.story.titlesSeen.length, 0);
  assert.equal(spoken.length, 0);
  assert.equal(buildShipLedger(state).entries.filter((e) => e.type === 'stunt').length, 0);

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: repeated episodes and old replays never duplicate incidents, titles, or barks', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  const trick = materialTrick({ witnesses: [witnessCover('witness_reach_01')] });
  bus.emit('stunt:trickDetected', trick);
  bus.emit('stunt:trickDetected', { ...trick });
  assert.equal(state.story.titles.stuntIncidents.length, 1, 'same episode settles once');
  assert.equal(state.story.titlesSeen.length, 1);
  assert.equal(spoken.length, 1);

  // A stale replay from before the settlement watermark is refused outright.
  bus.emit('stunt:trickDetected', materialTrick({
    episodeId: 'ep_old', tick: 100, rootTick: 90,
    witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.equal(state.story.titles.stuntIncidents.length, 1, 'old replayed incident rejected');

  const savedStory = JSON.parse(JSON.stringify(state.story));
  const restoredState = createAdventureState({ simTime: 100.0, tick: 6000 });
  restoredState.story = savedStory;
  const restoredBus = createMockBus();
  const restoredTitles = createTitlesSystem();
  restoredTitles.init({ state: restoredState, bus: restoredBus });
  const restoredBarks = Object.create(barkDirector);
  restoredBarks.init({ state: restoredState, bus: restoredBus, helpers });

  restoredBus.emit('stunt:trickDetected', { ...trick, tick: 6000 });
  assert.equal(restoredState.story.titles.stuntIncidents.length, 1,
    'replayed episode after save load adds no row');
  assert.equal(restoredState.story.titlesSeen.length, 1, 'no second title after load');
  assert.equal(spoken.length, 1, 'no second bark after load');

  titles.destroy();
  barks.destroy();
  restoredTitles.destroy();
  restoredBarks.destroy();
});

test('PQ-146.02: stunt incidents stay bounded at 240', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const titles = createTitlesSystem();
  titles.init({ state, bus });

  for (let i = 0; i < 260; i += 1) {
    bus.emit('stunt:trickDetected', materialTrick({
      episodeId: `ep_bound_${i}`, rootId: `root_bound_${i}`,
      tick: 2520 + i, rootTick: 2520 + i - 5,
    }));
  }
  assert.equal(state.story.titles.stuntIncidents.length, 240, 'incidents bounded at 240');
  assert.equal(state.story.titles.stuntIncidents[0].id, 'ep_bound_20',
    'oldest incidents are evicted first');
  titles.destroy();
});

test('PQ-146.02: stunt recognition barks are exempt from post-combat silence window', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  // Enter post combat silence
  barks._enterPostCombatSilence();
  assert.ok(state.barkDirector.postCombatSilenceUntil > state.simTime, 'post-combat silence is active');

  // Stunt occurs at tail of combat
  bus.emit('stunt:trickDetected', materialTrick({
    witnesses: [witnessCover('witness_reach_01')],
  }));

  assert.equal(spoken.length, 1, 'stunt bark spoke despite post-combat silence');
  assert.equal(spoken[0].kind, 'stuntRecognition');

  titles.destroy();
  barks.destroy();
});

test('incomplete witness coverage and nonlethal Bolas cannot earn Knotmaker', () => {
  for (const coverage of [undefined, NaN, Infinity]) {
    const state = createAdventureState();
    const bus = createMockBus();
    const titles = createTitlesSystem();
    titles.init({ state, bus });
    bus.emit('stunt:trickDetected', materialTrick({
      witnesses: [witnessCover('witness_reach_01', { sourceTicks: coverage })],
    }));
    assert.equal(state.story.titlesSeen.length, 0);
    assert.equal(state.story.titles.stuntIncidents[0].visibility, 'black-box');
    titles.destroy();
  }
  const state = createAdventureState();
  const bus = createMockBus();
  const titles = createTitlesSystem();
  titles.init({ state, bus });
  bus.emit('stunt:trickDetected', materialTrick({
    consequence: { victimId: 'drone_victim', killed: false, hullDamage: 30, hullMax: 100, helmLossSeconds: 1 },
    witnesses: [witnessCover('witness_reach_01')],
  }));
  assert.equal(state.story.titles.byId.title_bolas, undefined);
  assert.equal(state.story.titles.stuntIncidents.length, 1);
  titles.destroy();
});

test('an earned nickname is not incorrectly applied to a different stunt', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers: { voice: { say: p => { spoken.push(p); return true; } } } });
  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const witnesses = [witnessCover('witness_reach_01')];
  bus.emit('stunt:trickDetected', materialTrick({ witnesses }));
  state.simTime += 9;
  bus.emit('stunt:trickDetected', materialTrick({
    trickId: 'rock_discovery', name: 'Rock Discovery', episodeId: 'rock_episode', rootId: 'rock_root',
    tick: state.tick + 540, witnesses,
  }));
  assert.equal(spoken.length, 2);
  assert.ok(spoken[0].text.includes('Knotmaker'));
  assert.ok(!spoken[1].text.includes('Knotmaker'));
  barks.destroy();
  titles.destroy();
});

test('PQ-146.02: STUNT_BARKS corpus covers all 8 factions with 4 distinct variants each', () => {
  const expectedFactions = [
    'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
    'faction_quiet', 'faction_choir', 'faction_free', 'faction_vael',
  ];

  for (const factionId of expectedFactions) {
    const lines = STUNT_BARKS[factionId];
    assert.ok(Array.isArray(lines), factionId + ' has lines array');
    assert.equal(lines.length, 4, factionId + ' has 4 lines');

    for (let i = 0; i < lines.length; i++) {
      const line = stuntRecognitionBarkFor(factionId, i, { title: 'Bolas' });
      assert.ok(typeof line === 'string' && line.length > 5, factionId + ' line is valid string');
      assert.ok(line.includes('Bolas'), factionId + ' line includes Bolas title');
    }
  }
});