// PQ-032.03 — NG+ carries a legacy. Ship scars, the player's own titles, the lead ace grudge, one
// keepsake and the ending's world facts carry; titles the player only witnessed do not. The berth
// mechanic names the carried history while any of it is still live. Headless; every carried title
// below is produced by the live producer (the stunt title path, the Thunderchild hold reducer), not
// hand-typed, so no assertion rests on an id the game cannot write.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { livingHullScars, livingHullWithPatchedScars } from '../src/core/livingHull.js';
import {
  NEW_GAME_PLUS_SCHEMA,
  buildNewGamePlusCandidate,
  buildNewGamePlusOverlay,
  legacyFlightLine,
  leftoverNewRunLine,
  normalizeStoryNewGamePlusRecord,
} from '../src/core/newGamePlus.js';
import { bindStuntEvidence, bodyLife, journalFor, observeConstraint, observeRelease } from '../src/combat/stuntEvidence.js';
import { observeStuntWitnesses } from '../src/combat/stuntWitnesses.js';
import { isPlayerHeldTitleRecord } from '../src/data/titles.js';
import { leftoverMechanicLines } from '../src/story/mechanicVoice.js';
import { aceMemory as aceMemoryProto } from '../src/systems/aceMemory.js';
import { story as storyProto } from '../src/systems/story.js';
import { createTitlesSystem } from '../src/systems/titles.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

// design/VISION.md — the fantasy these carries serve.
const VISION_SHIP = 'The ship itself should become a long-lived personal machine. It gets scars. '
  + 'It gets weird fittings. People recognize it.';
const VISION_HISTORY = 'Eventually the player\'s ship should become deeply personal. Not because of a '
  + 'character creator. Because of accumulated history. Damage. Repairs.';

const NPC_KEY = 'wr_ship_1a2b3c4d';
const ENDING_TITLE = 'THE NEXT RUN';

// ── Live producers ──────────────────────────────────────────────────────────────────────────────

function recordingBus() {
  const handlers = new Map();
  return {
    on(k, f) { if (!handlers.has(k)) handlers.set(k, new Set()); handlers.get(k).add(f); },
    off(k, f) { handlers.get(k)?.delete(f); },
    emit(k, p) { for (const f of [...(handlers.get(k) || [])]) f(p); },
  };
}

function shipHull(id, x, z, extra = {}) {
  return {
    id, type: 'ship', alive: true, collides: true, radius: 2, mass: 100, hull: 100, hullMax: 100,
    team: 1, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { displayName: `Hull ${id}`, encounterId: 'encounter:1' }, ...extra,
  };
}

/**
 * The player earns Knotmaker through the titles system's own stunt path: a real tether journal,
 * a real witness sampled for six ticks, and the stunt:trickDetected bus event (same scene as
 * pq146-narrative). Returns the story bag a save would write.
 */
function storyWithPlayerStuntTitle() {
  const player = shipHull(0, 0, 0, { team: 0 });
  const source = shipHull(1, 20, 0);
  const target = shipHull(2, 50, 0);
  const witness = shipHull(3, 20, 50, { factionId: 'faction_free' });
  const state = {
    tick: 0, simTime: 0, mode: 'flight', playerId: 0, player: {},
    entities: new Map([player, source, target, witness].map((e) => [e.id, e])),
    meta: { seed: 4701 }, world: { currentSectorId: 'sector_helios_prime' },
    settings: { audio: { master: 1 }, accessibility: { captions: true } },
    story: { titles: { byId: {} }, titlesSeen: [] },
  };
  bindStuntEvidence(state);
  const bus = recordingBus();
  const titles = createTitlesSystem();
  titles.init({ state, bus });
  const attachment = {
    id: 'rope:1', ownerId: player.id, owner: { entity: player }, target: { entity: source },
    springState: { lastTension: 5 }, defId: 'grapple',
  };
  for (let i = 0; i < 6; i += 1) {
    state.tick = i;
    state.simTime = i / 60;
    observeConstraint(attachment, { x: i, z: 0 }, { x: i + 1, z: 0 }, i, state);
    observeStuntWitnesses(state);
  }
  state.tick = 6;
  observeRelease(attachment.id, 6, 'player', state);
  for (let i = 6; i <= 12; i += 1) {
    state.tick = i;
    state.simTime = i / 60;
    observeStuntWitnesses(state);
  }
  const root = [...journalFor(state).roots.values()][0];
  bus.emit('stunt:trickDetected', {
    trickId: 'bolas', name: 'Bolas', actorId: 0, targetId: 2, episodeId: root.id, rootId: root.id,
    rootTick: root.tick, tick: 12, firstPayoffTick: 12, amendmentDeadline: 192,
    victimLives: [{ lifeId: bodyLife(target, state).id, dead: true }],
    consequence: { killed: true, hullDamage: 100, hullMax: 100 },
    causeChain: root.nodes.map((n) => ({ ...n, type: n.kind })), evidenceRevision: 2,
    sourceName: 'Thrown Hull', targetName: 'Victim Hull',
  });
  titles.destroy();
  return JSON.parse(JSON.stringify({ titles: state.story.titles, titlesSeen: state.story.titlesSeen }));
}

/**
 * An NPC earns Thunderchild through the titles reducer: a durable NPC ship (worldRecordId) and a
 * qualifying title:holdResolved receipt. This is the only way a live Thunderchild row is written.
 */
function storyWithNpcThunderchild() {
  const state = createGameState(4701);
  const npc = shipHull(41, 300, 0, {
    factionId: 'faction_syndicate',
    data: { worldRecordId: NPC_KEY, shipDefId: 'ship_wasp', displayName: 'Iron Vesk' },
  });
  state.entities.set(npc.id, npc);
  const bus = createBus();
  const titles = createTitlesSystem();
  titles.init({ state, bus, helpers: {}, registry: { get: () => null } });
  bus.emit('title:holdResolved', {
    receiptId: `title:natural-hold:${NPC_KEY}:100`, entityId: npc.id, startedTick: 100, endedTick: 4000,
    alliedThreat: 1, hostileThreat: 3, hostileOutcomes: 3, candidateKills: 3, survived: true,
    source: 'combat_observation',
  });
  titles.destroy();
  return JSON.parse(JSON.stringify({ titles: state.story.titles, titlesSeen: state.story.titlesSeen }));
}

// ── The completed source run ────────────────────────────────────────────────────────────────────

function completedRunData(titleStory) {
  return {
    meta: { seed: 4701, playtimeS: 900, createdAt: '', lastSavedAt: '' },
    player: {
      credits: 999999,
      activeShipIndex: 0,
      moduleInventory: [{ instanceId: 'relic', defId: 'unique_veil_cutter' }],
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: ['wpn_pulse_laser_s'],
        livingHull: {
          schema: 'spaceface.livingHull.v1',
          scars: [{
            id: 'weapon:54000:bow', cause: 'weapon', surface: 'weapon', band: 'hard', facing: 'bow',
            atT: 880, tick: 54000, patchedAtT: null,
          }],
        },
      }],
    },
    entities: { player: { id: 'saved-player', type: 'ship', data: {} }, persistent: [], simTime: 900, tick: 54000 },
    missions: {
      story: {
        beatIndex: 7,
        flags: { contract_47a_closed: true, contract_47b_pending: true },
        endgameChoice: 'E',
        endgameResolved: true,
        ...titleStory,
      },
    },
    aceMemory: {
      schemaVersion: 2,
      ace_yara_no_cut: {
        encountered: true, fled: true, defeated: false, returnTier: 2, fleeCount: 3, encounterCount: 4,
      },
    },
  };
}

/** New Run+ through the live order: aceMemory rebuilds grudges, then game:started (main.js). */
function startNewRun(overlay, seed = 7711) {
  const state = createGameState(seed);
  state.onboarding = { active: true, finished: false };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  const playerEntity = { id: state.playerId, type: 'ship', alive: true, data: {} };
  state.entities.set(state.playerId, playerEntity);
  const bus = createBus();
  const registry = { get: () => null };
  const titles = createTitlesSystem();
  titles.init({ state, bus, helpers: {}, registry });
  const aceMemory = Object.assign({}, aceMemoryProto);
  aceMemory.init({ state, bus, helpers: {}, registry });
  aceMemory.newGame();
  aceMemory.applyNewGamePlusGrudges(overlay.grudges);
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry });
  bus.emit('game:started', { newGamePlus: overlay });
  return { state, bus, titles, story, playerEntity };
}

function overlayFor(data) {
  return buildNewGamePlusOverlay(
    data,
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
}

// ── 1. A title the player actually earned carries ────────────────────────────────────────────────

test('a stunt title the player earned carries into New Run+, is named, and is held by the player', () => {
  const titleStory = storyWithPlayerStuntTitle();
  const seen = titleStory.titlesSeen.find((row) => row.trickId === 'bolas');
  // The live stunt path keys the title to the pilot id (stuntWitnesses incidentIdentity), not 'player'.
  assert.equal(seen && seen.id, 'title_bolas:pilot:4701', 'live producer wrote the stunt sighting row');
  assert.equal(titleStory.titles.byId.title_bolas.status, 'held');
  assert.equal(titleStory.titles.byId.title_bolas.holderKey, 'pilot:4701');
  assert.equal(isPlayerHeldTitleRecord(titleStory.titles.byId.title_bolas), true, VISION_SHIP);

  const data = completedRunData(titleStory);
  const candidate = buildNewGamePlusCandidate(data, { slot: 'legacy' });
  assert.equal(candidate.titleCount, 1, VISION_SHIP);
  assert.equal(candidate.leadTitleName, 'Knotmaker', VISION_SHIP);
  assert.equal(
    leftoverNewRunLine(candidate),
    `${ENDING_TITLE} · keep one item · Yara No-Cut still hunting · weapon scar on the bow · Knotmaker · CONTRACT 47-B`,
    VISION_SHIP,
  );

  const overlay = overlayFor(data);
  assert.deepEqual(overlay.titles, [{
    id: 'title_bolas', title: 'Knotmaker', holderKey: 'pilot:4701', status: 'held', trickId: 'bolas',
  }]);

  const { state } = startNewRun(overlay);
  assert.equal(state.story.newGamePlus.titles[0].title, 'Knotmaker');
  assert.match(legacyFlightLine(state.story.newGamePlus), /Knotmaker/, VISION_SHIP);
  const carried = state.story.titlesSeen.filter((row) => row.title === 'Knotmaker');
  assert.equal(carried.length, 1, 'one carried sighting row');
  assert.equal(carried[0].holderKey, 'player', VISION_SHIP);
  assert.equal(carried[0].trickId, 'bolas');
  assert.equal(state.story.titles.byId.title_bolas.status, 'held');
  assert.equal(state.story.titles.byId.title_bolas.holderKey, 'player');
  assert.equal(isPlayerHeldTitleRecord(state.story.titles.byId.title_bolas), true,
    'the save slot card rule counts the carried title as the player\'s');
  assert.equal(state.story.titles.byId['title_bolas:pilot:4701'], undefined, 'no phantom composite byId row');
});

// ── 2. A title the player only witnessed does not ────────────────────────────────────────────────

test('a live NPC-held Thunderchild does not carry and writes no contradictory holder', () => {
  const titleStory = storyWithNpcThunderchild();
  const seen = titleStory.titlesSeen[0];
  assert.equal(seen && seen.id, `title_thunderchild:0:${NPC_KEY}`, 'live reducer wrote the sighting row');
  assert.equal(titleStory.titles.byId.title_thunderchild.status, 'held');
  assert.equal(titleStory.titles.byId.title_thunderchild.holderKey, NPC_KEY);
  assert.equal(isPlayerHeldTitleRecord(titleStory.titles.byId.title_thunderchild), false);

  const data = completedRunData(titleStory);
  const candidate = buildNewGamePlusCandidate(data, { slot: 'legacy' });
  assert.equal(candidate.titleCount, 0, 'a stranger\'s title is not the player\'s history');
  assert.equal(candidate.leadTitleName, '');
  assert.doesNotMatch(leftoverNewRunLine(candidate), /Thunderchild|title/);

  const overlay = overlayFor(data);
  assert.deepEqual(overlay.titles, []);

  const { state, titles, playerEntity } = startNewRun(overlay);
  assert.deepEqual(state.story.newGamePlus.titles, []);
  assert.doesNotMatch(legacyFlightLine(state.story.newGamePlus), /Thunderchild/);
  const own = state.story.titles.byId.title_thunderchild;
  assert.equal(own.status, 'vacant', 'the new run\'s Thunderchild waits for a new holder');
  assert.equal(own.holderKey, null);
  assert.equal(own.holder, null, 'no "you" under anyone\'s key');
  assert.equal(state.story.titlesSeen.some((row) => row.title === 'Thunderchild'), false);
  assert.equal(state.story.titles.byId[`title_thunderchild:0:${NPC_KEY}`], undefined);
  assert.equal(playerEntity.data.titleId, undefined, 'the new hull wears nothing it did not earn');

  // Defence for records written before this fix: apply refuses an NPC-keyed carry outright.
  assert.equal(titles.applyNewGamePlusTitles([
    { id: 'title_thunderchild', title: 'Thunderchild', holderKey: NPC_KEY, status: 'held' },
  ]), 0);
  assert.equal(state.story.titles.byId.title_thunderchild.status, 'vacant');
  assert.equal(state.story.titlesSeen.some((row) => row.holderKey === NPC_KEY || row.title === 'Thunderchild'), false);

  // A record with no holderKey and no trickId has no claimant at all: refused, not adopted as
  // the player's. The live producer (leftoverTitleRecord) never writes one, so the only records
  // that can look like this are hand-built or from a save written before holderKey existed.
  assert.equal(titles.applyNewGamePlusTitles([
    { id: 'title_bolas', title: 'Knotmaker', status: 'held' },
  ]), 0, 'missing holderKey + no trickId is refused');
  assert.equal(state.story.titles.byId.title_bolas, undefined);
  assert.equal(titles.applyNewGamePlusTitles([
    { id: 'title_bolas', title: 'Knotmaker', holderKey: 'player', status: 'held' },
  ]), 1, 'an explicit player holderKey still carries');
});

// ── 3. Save migration: an older record loads clean ───────────────────────────────────────────────

function olderRecord() {
  // spaceface.newGamePlus.v1 as the pre-PQ-032.03 carry wrote it: no named grudge, and an
  // NPC-keyed Thunderchild taken from the source run's sightings.
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceEnding: 'E',
    sourceEndingTitle: ENDING_TITLE,
    sourceSlot: 'legacy',
    sourceSavedAt: '2026-08-06T12:00:00.000Z',
    keepsakeId: 'unique_veil_cutter',
    keepsakeName: 'Veil Cutter',
    hunterGrudgeCount: 1,
    startedSeed: 7711,
    scars: [{
      id: 'weapon:54000:bow', cause: 'weapon', surface: 'weapon', band: 'hard', facing: 'bow',
      atT: 0, tick: 0, patchedAtT: null,
    }],
    titles: [{ id: 'title_thunderchild', title: 'Thunderchild', holderKey: NPC_KEY, status: 'held' }],
    worldFacts: {
      endingId: 'E', sandboxMode: 'working_pilot', directiveId: 'contract_47b', title: 'CONTRACT 47-B',
      replayHookId: 'post47a_next_manifest', flags: ['contract_47a_closed', 'contract_47b_pending'],
    },
  };
}

test('an older New Run+ record migrates: NPC title dropped, missing grudge fields become empty', () => {
  const migrated = normalizeStoryNewGamePlusRecord(olderRecord());
  assert.deepEqual(migrated.titles, [], 'the NPC-keyed title migrates out');
  assert.equal(migrated.leadGrudgeName, '');
  assert.equal(migrated.leadGrudgeAceId, '');
  assert.equal(migrated.hunterGrudgeCount, 1);
  assert.equal(migrated.scars[0].id, 'weapon:54000:bow', 'scars still carry');
  assert.equal(migrated.worldFacts.title, 'CONTRACT 47-B', 'world facts still carry');

  let line = '';
  assert.doesNotThrow(() => { line = legacyFlightLine(migrated); });
  assert.match(line, /1 GRUDGE/, 'no name on an old record: the flight line falls back to the count');
  assert.match(line, /weapon scar on the bow/, VISION_HISTORY);
  assert.doesNotMatch(line, /Thunderchild/);

  // Through the real save carrier: missions.serialize() writes state.story; on load the story
  // owner re-normalizes the parsed bag (same order as new-game-plus.test.mjs).
  const written = JSON.parse(JSON.stringify({ story: { newGamePlus: olderRecord() } }));
  const loadedState = createGameState(4242);
  const loaded = Object.assign({}, storyProto);
  loaded.init({ state: loadedState, bus: createBus(), helpers: { voice: { say() {} } }, registry: { get: () => null } });
  loadedState.story = written.story;
  loaded.deserialize(written);
  assert.deepEqual(loadedState.story.newGamePlus, migrated);
  assert.deepEqual(
    normalizeStoryNewGamePlusRecord(JSON.parse(JSON.stringify(loadedState.story.newGamePlus))),
    migrated,
    'migration is stable across a second round-trip',
  );
});

test('a new record names its lead ace by id and survives the save round-trip', () => {
  const { state } = startNewRun(overlayFor(completedRunData(storyWithPlayerStuntTitle())));
  const record = state.story.newGamePlus;
  assert.equal(record.leadGrudgeName, 'Yara No-Cut');
  assert.equal(record.leadGrudgeAceId, 'ace_yara_no_cut');
  const reread = normalizeStoryNewGamePlusRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(reread, record);
  const forged = normalizeStoryNewGamePlusRecord({ ...JSON.parse(JSON.stringify(record)), leadGrudgeAceId: 'ace_not_real' });
  assert.equal(forged.leadGrudgeAceId, '', 'an unknown ace id does not survive the load');
});

// ── 4. The mechanic names the carried history ────────────────────────────────────────────────────

test('the berth mechanic names the ending, the carried scar and the ace until each is settled', () => {
  const { state } = startNewRun(overlayFor(completedRunData(storyWithPlayerStuntTitle())));
  const owned = state.player.ownedShips[0];
  assert.equal(livingHullScars(owned.livingHull).some((scar) => scar.id === 'weapon:54000:bow'), true,
    'the carried scar is on the new hull');
  assert.equal(state.aceMemory.ace_yara_no_cut.defeated, false);

  let lines = leftoverMechanicLines(state);
  const scarLine = 'Hard scar on the bow. That is a real hit.';
  const legacyLine =
    `This hull came over from ${ENDING_TITLE}. Weapon scar on the bow came with it. Yara No-Cut is still out there.`;
  assert.equal(lines[0], scarLine,
    `the spoken line is the live scar, not the carried history — ${VISION_HISTORY}`);
  assert.ok(lines.includes(legacyLine), 'the legacy line is still in the berth list');
  assert.ok(lines.indexOf(legacyLine) > lines.indexOf(scarLine),
    'the legacy line follows the scar-class lines');
  const arrival = buildDockArrival(state, { id: 'station_helios', name: 'Helios Station' });
  assert.ok(String(arrival.mechanicLine).startsWith(lines[0]), 'the dock arrival opens with the scar line');
  assert.match(String(arrival.mechanicLine), /came over from/, 'the card body still carries the history');

  state.aceMemory.ace_yara_no_cut.defeated = true;
  lines = leftoverMechanicLines(state);
  assert.equal(lines[0], scarLine, 'the spoken line stays the live scar');
  assert.ok(lines.includes(`This hull came over from ${ENDING_TITLE}. Weapon scar on the bow came with it.`),
    'a settled grudge drops out of the history');

  owned.livingHull = livingHullWithPatchedScars(owned.livingHull, 30);
  lines = leftoverMechanicLines(state);
  assert.equal(lines.some((line) => /came over from/.test(line)), false,
    'patched and settled: the history is no longer news');
  assert.ok(lines.some((line) => /Yard patched the bow/.test(line)), 'the repair line still speaks');
});

test('the legacy line keeps only what is still live, and never claims a hull that did not come over', () => {
  const { state } = startNewRun(overlayFor(completedRunData(storyWithPlayerStuntTitle())));
  const owned = state.player.ownedShips[0];
  owned.livingHull = livingHullWithPatchedScars(owned.livingHull, 30);
  let lines = leftoverMechanicLines(state);
  const hunterLegacy = `This hull came over from ${ENDING_TITLE}. Yara No-Cut is still out there.`;
  const repairIdx = lines.findIndex((line) => /Yard patched the bow/.test(line));
  assert.ok(repairIdx >= 0, 'the repair line still speaks');
  assert.ok(lines.indexOf(hunterLegacy) > repairIdx,
    'patched scar, live hunter: the legacy line follows the repair line');

  owned.livingHull = { schema: 'spaceface.livingHull.v1', scars: [] };
  lines = leftoverMechanicLines(state);
  const boughtLegacy = `You came over from ${ENDING_TITLE}. Yara No-Cut is still out there.`;
  assert.ok(lines.includes(boughtLegacy), 'a hull without the carried scar is not "this hull"');
  assert.ok(lines.indexOf(boughtLegacy) > lines.indexOf('Clean plate. Nothing on this hull to file.'),
    'the legacy line still trails the hull lines');

  // An older record has no ace id: the grudge clause is simply omitted.
  const fresh = startNewRun(overlayFor(completedRunData(storyWithPlayerStuntTitle()))).state;
  fresh.story.newGamePlus = normalizeStoryNewGamePlusRecord(olderRecord());
  assert.ok(leftoverMechanicLines(fresh).includes(
    `This hull came over from ${ENDING_TITLE}. Weapon scar on the bow came with it.`));

  const plain = createGameState(9);
  plain.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  assert.equal(leftoverMechanicLines(plain).some((line) => /came over from/.test(line)), false,
    'no New Run+, no legacy line');
});

test('a fresh non-carried scar is the spoken line, not the carried history', () => {
  const { state } = startNewRun(overlayFor(completedRunData(storyWithPlayerStuntTitle())));
  const owned = state.player.ownedShips[0];
  // A hull that did not come over: one fresh heavy scar, nothing carried on it. audioSystem
  // speaks lines[0] on dock, so a first-position legacy line would bury this for the whole run.
  owned.livingHull = {
    schema: 'spaceface.livingHull.v1',
    scars: [{
      id: 'weapon:60000:stern', cause: 'weapon', surface: 'weapon', band: 'heavy',
      facing: 'stern', atT: 60, tick: 60, patchedAtT: null,
    }],
  };
  const lines = leftoverMechanicLines(state);
  assert.equal(lines[0], 'Heavy scar on the stern. Do not call it weather.',
    'the fresh scar is the spoken line');
  const legacyIdx = lines.findIndex((line) => /came over from/.test(line));
  assert.ok(legacyIdx > 0, 'the carried history still follows the live-hull lines');
});
