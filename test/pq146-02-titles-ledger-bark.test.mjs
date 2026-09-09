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

  const trick = {
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
    tick: state.tick,
  };

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
  assert.equal(bark.title, 'Bolas');
  assert.ok(bark.text.includes('Bolas'), 'bark text references the Bolas title');
  assert.equal(spoken.length, 1, 'voice helper received the bark');
  assert.equal(spoken[0].channel, 'bark');
  assert.equal(spoken[0].kind, 'stuntRecognition');

  // 3. Title state verification in the same session
  const titleRecord = state.story.titles.byId.title_bolas;
  assert.ok(titleRecord, 'title_bolas exists in state.story.titles.byId');
  assert.equal(titleRecord.title, 'Bolas');
  assert.equal(titleRecord.trickId, 'bolas');
  assert.equal(titleRecord.status, 'held');
  assert.equal(titleRecord.holderKey, 'player_hull');

  assert.equal(state.story.titlesSeen.length, 1, 'title was added to state.story.titlesSeen');
  const seenRecord = state.story.titlesSeen[0];
  assert.equal(seenRecord.title, 'Bolas');
  assert.equal(seenRecord.trickId, 'bolas');
  assert.equal(seenRecord.holderKey, 'player_hull');

  // 4. Ship ledger line verification in the same session
  const ledger = buildShipLedger(state);
  const titleEntries = ledger.entries.filter((e) => e.type === 'title');
  assert.equal(titleEntries.length, 1, 'ship ledger contains one title row');
  const row = titleEntries[0];
  assert.equal(row.trickId, 'bolas', 'ship ledger row attaches trickId');
  assert.equal(row.sourceKind, 'story.titlesSeen');
  assert.ok(row.text.includes('Bolas'), 'ship ledger text includes Bolas');

  // 5. Save/restore round-trip verification
  // Save integrity law: entityId must never leak into serialized story
  const savedStory = JSON.parse(JSON.stringify(state.story));
  assert.equal(JSON.stringify(savedStory).includes('entityId'), false, 'save integrity: entityId never leaks into story save');

  // Simulate restore in a fresh session
  const restoredState = createAdventureState({ simTime: 100.0, tick: 6000, seed: 1337 });
  restoredState.story = savedStory;

  const restoredTitles = createTitlesSystem();
  restoredTitles.init({ state: restoredState, bus: createMockBus() });

  // Verify the restored state still has the title and ledger line
  assert.ok(restoredState.story.titles.byId.title_bolas, 'restored state has title_bolas');
  assert.equal(restoredState.story.titles.byId.title_bolas.title, 'Bolas');
  assert.equal(restoredState.story.titlesSeen.length, 1, 'restored state has titlesSeen record');
  assert.equal(restoredState.story.titlesSeen[0].trickId, 'bolas');

  const restoredLedger = buildShipLedger(restoredState);
  const restoredTitleEntries = restoredLedger.entries.filter((e) => e.type === 'title');
  assert.equal(restoredTitleEntries.length, 1, 'restored ledger projects title row');
  assert.equal(restoredTitleEntries[0].trickId, 'bolas');
  assert.ok(restoredTitleEntries[0].text.includes('Bolas'), 'restored ledger text includes Bolas');

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

test('PQ-146.02: a stunt with no witness nearby earns title/ledger line but produces NO bark', () => {
  const state = createAdventureState();
  // Move witness far away out of range
  const witness = state.entities.get('witness_reach_01');
  witness.pos = { x: 99999, y: 0, z: 99999 };

  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  bus.emit('stunt:trickDetected', {
    trickId: 'bolas',
    name: 'Bolas',
    actorId: 'player',
    causeChain: [{ step: 1, type: 'tether_sling' }],
    tick: state.tick,
  });

  // No bark because no witness was in range
  assert.equal(spoken.length, 0, 'no bark spoken when unwitnessed');
  assert.equal(bus.emissions.filter((e) => e.event === 'barkDirector:voice').length, 0);

  // But the stunt title and ledger line are still recorded
  assert.equal(state.story.titlesSeen.length, 1, 'title is recorded in titlesSeen');
  assert.equal(buildShipLedger(state).entries.filter((e) => e.type === 'title').length, 1, 'ledger line recorded');

  titles.destroy();
  barks.destroy();
});

test('PQ-146.02: stunt recognition barks are exempt from post-combat silence window', () => {
  const state = createAdventureState();
  const bus = createMockBus();
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };

  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  // Enter post combat silence
  barks._enterPostCombatSilence();
  assert.ok(state.barkDirector.postCombatSilenceUntil > state.simTime, 'post-combat silence is active');

  // Stunt occurs at tail of combat
  bus.emit('stunt:trickDetected', {
    trickId: 'bolas',
    name: 'Bolas',
    actorId: 'player',
    causeChain: [{ step: 1, type: 'chain_strike' }],
    tick: state.tick,
  });

  assert.equal(spoken.length, 1, 'stunt bark spoke despite post-combat silence');
  assert.equal(spoken[0].kind, 'stuntRecognition');

  barks.destroy();
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