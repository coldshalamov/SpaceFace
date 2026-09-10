import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { livingHullScars } from '../src/core/livingHull.js';
import {
  NEW_GAME_PLUS_SCHEMA,
  buildNewGamePlusCandidate,
  buildNewGamePlusOverlay,
  leftoverNewRunLine,
  normalizeStoryNewGamePlusRecord,
} from '../src/core/newGamePlus.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { THREAD_B_FRAGMENT_ID } from '../src/data/narrative.js';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import { aceMemory as aceMemoryProto } from '../src/systems/aceMemory.js';
import { story as storyProto } from '../src/systems/story.js';
import { createTitlesSystem } from '../src/systems/titles.js';

function completedRunData() {
  return {
    meta: { seed: 4701, playtimeS: 900, createdAt: '', lastSavedAt: '' },
    player: {
      credits: 999999,
      activeShipIndex: 0,
      moduleInventory: [
        { instanceId: 'relic', defId: 'unique_veil_cutter' },
        { instanceId: 'spare', defId: 'mod_market_data_s' },
      ],
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: ['wpn_pulse_laser_s', 'mod_engine_ion_m'],
        livingHull: {
          schema: 'spaceface.livingHull.v1',
          scars: [{
            id: 'weapon:54000:bow',
            cause: 'weapon',
            surface: 'weapon',
            band: 'hard',
            facing: 'bow',
            atT: 880,
            tick: 54000,
            patchedAtT: null,
          }],
        },
      }],
    },
    cargo: { items: {}, capVolume: 40, capMass: 60 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    entities: {
      player: {
        id: 'saved-player', type: 'ship', defId: 'ship_kestrel', pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 100, shield: 100, cap: 100,
        flags: {}, data: {},
      },
      persistent: [], simTime: 900, tick: 54000,
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      story: {
        beatIndex: 7,
        flags: { contract_47a_closed: true, contract_47b_pending: true },
        endgameChoice: 'E',
        endgameResolved: true,
        titlesSeen: [{
          id: 'title_thunderchild:0:player',
          title: 'Thunderchild',
          holderKey: 'player',
          seenAt: 54000,
        }],
        titles: {
          byId: {
            title_thunderchild: {
              status: 'held',
              holderKey: 'player',
              successionCount: 0,
            },
          },
        },
        postEnding: {
          choiceId: 'E',
          endingId: 'E',
          directiveId: 'contract_47b',
          title: 'CONTRACT 47-B',
          sandboxMode: 'working_pilot',
          replayHookId: 'post47a_next_manifest',
        },
      },
    },
    automation: {},
    aceMemory: {
      schemaVersion: 2, news: { old: true }, activeReturns: { 77: { aceId: 'ace_yara_no_cut' } },
      cultureIntros: {},
      ace_yara_no_cut: {
        encountered: true, fled: true, defeated: false, returnScheduled: false,
        returnTier: 2, fleeCount: 3, encounterCount: 4,
      },
      ace_toll_saint_venn: {
        encountered: true, fled: true, defeated: true, returnTier: 3, fleeCount: 2,
      },
      not_an_ace: { fled: true, defeated: false, returnTier: 99 },
    },
    settings: { gameplay: {}, video: {}, audio: {}, controls: {} },
  };
}

function envelopeFor(data, slot = 'legacy') {
  const savedAt = '2026-08-06T12:00:00.000Z';
  return {
    fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt, playtimeS: 900, slot,
    checksum: fnv1a(JSON.stringify(data)), data,
  };
}

function withStorage(entries, fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(entries);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { return fn(storage); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('completed run projects one selectable keepsake and only unresolved named-hunter grudges', () => {
  const data = completedRunData();
  const candidate = buildNewGamePlusCandidate(data, { slot: 'legacy', savedAt: 'now' });
  assert.equal(candidate.schema, NEW_GAME_PLUS_SCHEMA);
  assert.equal(candidate.sourceEnding, 'E');
  assert.equal(candidate.sourceEndingTitle, 'THE NEXT RUN');
  assert.equal(candidate.keepsakes[0].defId, 'unique_veil_cutter', 'authored relics sort first');
  assert.deepEqual(new Set(candidate.keepsakes.map((item) => item.defId)), new Set([
    'unique_veil_cutter', 'mod_market_data_s', 'wpn_pulse_laser_s', 'mod_engine_ion_m',
  ]));
  assert.equal(candidate.grudgeCount, 1, 'defeated and unknown hunters do not carry');
  assert.equal(candidate.scarCount, 1, 'leftover living-hull scars carry');
  assert.equal(candidate.titleCount, 1, 'leftover Thunderchild carries');
  assert.equal(candidate.worldFactCount, 1);
  assert.equal(candidate.worldFactTitle, 'CONTRACT 47-B');
  assert.equal(
    leftoverNewRunLine(candidate),
    'THE NEXT RUN · keep one item · 1 unresolved hunter grudge · 1 scar · 1 title · CONTRACT 47-B',
  );

  const overlay = buildNewGamePlusOverlay(data, { keepsakeId: 'mod_market_data_s' }, { slot: 'legacy' });
  assert.equal(overlay.keepsake.defId, 'mod_market_data_s');
  assert.deepEqual(overlay.grudges, [{
    aceId: 'ace_yara_no_cut', returnTier: 2, fleeCount: 3, encounterCount: 4,
  }]);
  assert.equal(buildNewGamePlusOverlay(data, { keepsakeId: 'not_owned' }, { slot: 'legacy' }), null);
  assert.equal(buildNewGamePlusCandidate({ ...data, missions: { story: { endgameChoice: null } } }), null);
});

test('save owner discovers and revalidates a completed source without exposing the full run', () => {
  const env = envelopeFor(completedRunData());
  withStorage([['sf.save.legacy', JSON.stringify(env)]], () => {
    const candidate = save.getNewGamePlusCandidate();
    assert.equal(candidate.sourceSlot, 'legacy');
    assert.equal(candidate.sourceEnding, 'E');
    assert.equal(candidate.keepsakes.some((item) => item.defId === 'unique_veil_cutter'), true);

    const overlay = save.prepareNewGamePlus({ slot: 'legacy', keepsakeId: 'unique_veil_cutter' });
    assert.equal(overlay.sourceSlot, 'legacy');
    assert.equal(overlay.keepsake.defId, 'unique_veil_cutter');
    assert.equal(Object.hasOwn(overlay, 'player'), false);
    assert.equal(Object.hasOwn(overlay, 'world'), false);
  });
});

test('fresh New Game clears ace memory; New Run+ rebuilds deterministic unresolved pressure only', () => {
  assert.equal(FRESH_RUN_SYSTEMS.includes('aceMemory'), true);
  const state = createGameState(9981);
  const bus = createBus();
  const aceMemory = Object.assign({}, aceMemoryProto);
  aceMemory.init({ state, bus, helpers: {}, registry: { get: () => null } });
  state.aceMemory.stale = { fled: true };
  resetFreshRunSystems({ get: (name) => name === 'aceMemory' ? aceMemory : null });
  assert.equal(state.aceMemory.stale, undefined);

  const carried = [{ aceId: 'ace_yara_no_cut', returnTier: 2, fleeCount: 3, encounterCount: 4 }];
  assert.equal(aceMemory.applyNewGamePlusGrudges(carried), 1);
  const rec = state.aceMemory.ace_yara_no_cut;
  assert.equal(rec.returnScheduled, true);
  assert.equal(rec.returnsBigger, true);
  assert.equal(rec.defeated, false);
  assert.equal(rec.carriedFromPriorRun, true);
  assert.ok(rec.returnAt >= 360 && rec.returnAt < 780);
  assert.deepEqual(state.aceMemory.news, {});
  assert.deepEqual(state.aceMemory.activeReturns, {});

  const state2 = createGameState(9981);
  const aceMemory2 = Object.assign({}, aceMemoryProto);
  aceMemory2.init({ state: state2, bus: createBus(), helpers: {}, registry: { get: () => null } });
  aceMemory2.newGame();
  aceMemory2.applyNewGamePlusGrudges(carried);
  assert.equal(state2.aceMemory.ace_yara_no_cut.returnAt, rec.returnAt);
});

test('story owns a save-safe visible legacy receipt after game start', () => {
  const overlay = buildNewGamePlusOverlay(
    completedRunData(),
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  const state = createGameState(7711);
  state.onboarding = { active: true, finished: false };
  const bus = createBus();
  const started = [];
  bus.on('story:newGamePlusStarted', (payload) => started.push(payload));
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry: { get: () => null } });
  bus.emit('game:started', { newGamePlus: overlay });

  assert.equal(started.length, 1);
  assert.equal(state.story.newGamePlus.sourceEnding, 'E');
  assert.equal(state.story.newGamePlus.keepsakeId, 'unique_veil_cutter');
  assert.equal(state.story.newGamePlus.hunterGrudgeCount, 1);
  assert.equal(state.player.cargo.items[THREAD_B_FRAGMENT_ID], 1, 'ordinary opening fragment remains');
  assert.deepEqual(
    normalizeStoryNewGamePlusRecord(JSON.parse(JSON.stringify(state.story.newGamePlus))),
    state.story.newGamePlus,
  );
});

function startedStoryState(seed, overlay) {
  const state = createGameState(seed);
  state.onboarding = { active: true, finished: false };
  const bus = createBus();
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry: { get: () => null } });
  if (overlay) bus.emit('game:started', { newGamePlus: overlay });
  return { state, story };
}

test('the legacy receipt rides the real save carrier, and a pre-New-Run+ save still loads', () => {
  const overlay = buildNewGamePlusOverlay(
    completedRunData(),
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  const source = startedStoryState(7711, overlay).state;

  // The live carrier is missions.serialize(), which returns { ..., story: state.story }; on load
  // missions.deserialize assigns that parsed story wholesale and the story owner re-normalizes what
  // it owns. Exercise that order, not a bare JSON clone of the record.
  const written = JSON.parse(JSON.stringify({ story: source.story }));
  assert.equal(written.story.newGamePlus.keepsakeId, 'unique_veil_cutter', 'the save payload carries the receipt');
  // A persisted record is untrusted text: the ending title is re-read from the authored ending and
  // unknown fields are dropped, so this fails if the story owner ever stops normalizing on load.
  written.story.newGamePlus.sourceEndingTitle = 'STALE TITLE';
  written.story.newGamePlus.injected = 'not a legacy field';

  const loaded = startedStoryState(4242, null);
  loaded.state.story = written.story;
  loaded.story.deserialize(written);
  assert.deepEqual(loaded.state.story.newGamePlus, source.story.newGamePlus);

  // A save written before New Run+ existed carries no receipt; loading it must leave a clean null,
  // not a broken record.
  const preLegacy = JSON.parse(JSON.stringify({ story: source.story }));
  delete preLegacy.story.newGamePlus;
  const older = startedStoryState(4242, null);
  older.state.story = preLegacy.story;
  older.story.deserialize(preLegacy);
  assert.equal(older.state.story.newGamePlus, null, 'an absent receipt stays absent');
});

test('leftover New Run+ writes scars, Thunderchild, and CONTRACT 47-B onto the fresh run', () => {
  const overlay = buildNewGamePlusOverlay(
    completedRunData(),
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  assert.equal(overlay.scars[0].id, 'weapon:54000:bow');
  assert.equal(overlay.titles[0].id, 'title_thunderchild');
  assert.equal(overlay.titles[0].status, 'held');
  assert.equal(overlay.worldFacts.title, 'CONTRACT 47-B');
  assert.deepEqual(overlay.worldFacts.flags, ['contract_47a_closed', 'contract_47b_pending']);

  const state = createGameState(7711);
  state.onboarding = { active: true, finished: false };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  state.entities.set(state.playerId, {
    id: state.playerId,
    type: 'ship',
    data: {},
  });
  const bus = createBus();
  const hullEvents = [];
  bus.on('ship:livingHullChanged', (payload) => hullEvents.push(payload));
  const titles = createTitlesSystem();
  titles.init({ state, bus, helpers: {}, registry: { get: () => null } });
  titles.newGame();
  assert.equal(state.story.titles.byId.title_thunderchild.status, 'vacant');

  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry: { get: () => null } });
  bus.emit('game:started', { newGamePlus: overlay });

  assert.equal(state.story.newGamePlus.scars[0].id, 'weapon:54000:bow');
  assert.equal(state.story.flags.contract_47b_pending, true);
  assert.equal(state.story.flags.contract47bPending, true);
  assert.equal(state.story.postEnding && state.story.postEnding.directiveId, 'contract_47b');
  assert.equal(state.story.titles.byId.title_thunderchild.status, 'held');
  assert.equal(state.story.titles.byId['title_thunderchild:0:player'], undefined);
  const carriedScar = livingHullScars(state.player.ownedShips[0].livingHull)
    .find((scar) => scar.id === 'weapon:54000:bow');
  assert.equal(carriedScar && carriedScar.atT, 0, 'leftover scar restamps to the new run clock');
  assert.equal(
    livingHullScars(state.player.ownedShips[0].livingHull).some((scar) => scar.id === 'weapon:54000:bow'),
    true,
    'leftover scar lands on the new hull without editing ships.js',
  );
  assert.equal(hullEvents[0] && hullEvents[0].source, 'new_game_plus');
});

test('leftover Thunderchild recovers from the byId map key when titlesSeen is empty', () => {
  const data = completedRunData();
  data.missions.story.titlesSeen = [];
  const overlay = buildNewGamePlusOverlay(
    data,
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  assert.equal(overlay.titles[0].id, 'title_thunderchild');
  assert.equal(overlay.titles[0].status, 'held');
});

// Input truth: live holderKeys are entity.data.worldRecordId (titles.js holderKeyOf). The only
// hold-opener, _observeCombatant, requires isDurableNpcShip, which excludes state.playerId, and
// nothing assigns worldRecordId to the player hull. So the live Thunderchild sighting id is
// title_thunderchild:<succession>:<world record id> — the holder half is never 'player'.
test('leftover Thunderchild peels a live NPC sighting id and carries that dead holder key', () => {
  const npcKey = 'wr_ship_1a2b3c4d';
  const data = completedRunData();
  data.missions.story.titlesSeen = [{
    id: `title_thunderchild:0:${npcKey}`,
    title: 'Thunderchild',
    seenAt: 54000,
    holderKey: npcKey,
  }];
  data.missions.story.titles.byId.title_thunderchild = {
    status: 'held',
    holderKey: npcKey,
    holder: { shipDefId: 'ship_wasp', factionId: 'faction_syndicate', displayName: 'Yara No-Cut' },
    successionCount: 0,
  };
  const overlay = buildNewGamePlusOverlay(
    data,
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  assert.equal(overlay.titles[0].id, 'title_thunderchild', 'the live composite peels to the authored id');
  assert.equal(overlay.titles[0].status, 'held');
  assert.equal(overlay.titles[0].holderKey, npcKey, 'the carried holder is the previous run NPC, not the player');

  const state = createGameState(7711);
  state.onboarding = { active: true, finished: false };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  const playerEntity = { id: state.playerId, type: 'ship', alive: true, data: {} };
  state.entities.set(state.playerId, playerEntity);
  state.entityList.push(playerEntity);
  const bus = createBus();
  const titles = createTitlesSystem();
  titles.init({ state, bus, helpers: {}, registry: { get: () => null } });
  titles.newGame();
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry: { get: () => null } });
  bus.emit('game:started', { newGamePlus: overlay });

  assert.equal(state.story.titles.byId.title_thunderchild.status, 'held');
  assert.equal(
    state.story.titles.byId[`title_thunderchild:0:${npcKey}`],
    undefined,
    'no phantom composite byId row',
  );
  assert.equal(
    state.story.titles.byId.title_thunderchild.holderKey,
    npcKey,
    'apply keeps the previous run NPC holder key',
  );
  // syncTitleStamp matches entity.data.worldRecordId against that key, so the fresh hull is skipped:
  // the carried title is a state row plus a Ledger sighting, not something the new ship wears.
  assert.equal(playerEntity.data.titleId, undefined, 'the new hull is not stamped with the carried title');
});
