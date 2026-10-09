// FB-129 — the filed ending announces itself and lands in the Codex Archive.
//
// Resolving an ending on the live story owner must:
//   1. Emit `endgame:finaleReady` and `endgame:archive` carrying the `spaceface.endingArchive.v1`
//      manuscript (transmission + epilogue + evidence basis).
//   2. Speak exactly ONE persistent comms announcement — "…is filed. It will not be offered
//      again." — through the one-voice comms path, latched by `seenComms.finale_announced`.
//   3. Keep the manuscript durable: `state.story.writtenFinale` survives serialize/deserialize,
//      and the Archive's data source (`writtenEndingArchive`) still returns it after load.
//   4. Surface in the Codex: `codex.js` refreshes on `endgame:archive` and its Archive tab renders
//      the 'Filed Ending' section from `state.story.writtenFinale` (no parallel presenter).
//
// Run: node --test test/fb-ending-announced.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { writtenEndingArchive } from '../src/story/endings/index.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';

const SEED = 4242;
const ENDING_A_TITLE = 'THE CLEAN UNIFORM';

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

/** A resolved-ending-ready captain: B7 cleared, Concord-qualified for Choice A. */
function makeState(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 1000;
  state.meta = state.meta || {};
  state.meta.seed = seed;
  state.playerId = 1;
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {} });
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.heat = 0.4;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = { rep: 0, aggro: false };
  }
  state.story.beatIndex = 7;
  state.story.branch = 'patrol';
  state.story.flags = {
    endgame: true,
    deep_reach_operation_complete: true,
    ashfall_visited: true,
    deep_reach_ashfall_docked: true,
    kurtz_desk_opened: true,
  };
  state.story.endgameOffered = true;
  state.story.endgameChoice = null;
  state.story.endgameResolved = false;
  state.story.endgameDeclined = [];
  state.story.endgamePending = null;
  state.factions.faction_scn.rep = ENDGAME_REP_MIN;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.missions = state.missions || { active: [], boards: {}, completedLog: [] };
  state.missions.active = [];
  state.claims = { bodies: [{ id: 'claim_test' }] };
  state.careers = { origins: { hunter: { status: 'completed', acceptedAtS: 1 } } };
  return state;
}

function makeHarness(seed = SEED) {
  const state = makeState(seed);
  const bus = createBus();
  const events = { finaleReady: [], archive: [], chosen: [], comms: [], ineligible: [] };
  const voiceLines = [];
  bus.on('endgame:finaleReady', (p) => events.finaleReady.push(p));
  bus.on('endgame:archive', (p) => events.archive.push(p));
  bus.on('endgame:chosen', (p) => events.chosen.push(p));
  bus.on('comms:popup', (p) => events.comms.push(p));
  bus.on('endgame:ineligible', (p) => events.ineligible.push(p));
  const story = cloneSystem(storyProto);
  const heat = cloneSystem(heatProto);
  const missions = cloneSystem(missionsProto);
  const registry = { get: (n) => (n === 'story' ? story : n === 'heat' ? heat : n === 'missions' ? missions : null) };
  const helpers = {
    mulberry32,
    voice: { say: (line) => { voiceLines.push(line); return true; } },
  };
  const ctx = { state, bus, helpers, registry };
  heat.init(ctx);
  missions.init(ctx);
  story.init(ctx);
  return { state, bus, story, heat, missions, events, voiceLines };
}

const announced = (h) => h.events.comms.filter((p) => p && p.id === 'finale_announced');

test('FB-129: resolving an ending announces it through comms and files the archive once', () => {
  const h = makeHarness();
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });

  assert.equal(h.state.story.endgameChoice, 'A', 'the ending resolved');
  assert.equal(h.state.story.endgameResolved, true);
  assert.deepEqual(h.events.ineligible, [], 'the A-qualified captain is eligible');
  assert.equal(h.events.chosen.length, 1);
  assert.equal(h.events.chosen[0].choice, 'A');

  // finaleReady carries the manuscript; the archive event repeats it for readers.
  assert.equal(h.events.finaleReady.length, 1);
  const ready = h.events.finaleReady[0];
  assert.equal(ready.schema, 'spaceface.endingArchive.v1');
  assert.equal(ready.choiceId, 'A');
  assert.equal(ready.title, ENDING_A_TITLE);
  assert.ok(ready.transmission.length > 0, 'the written ending carries its transmission');
  assert.ok(ready.epilogue.length > 0, 'the written ending carries its epilogue');
  assert.ok(ready.basis && ready.receiptId, 'the archive cites its evidence basis and receipt');
  assert.equal(h.events.archive.length, 1, 'the codex-facing archive signal fires at filing time');
  assert.equal(h.events.archive[0].schema, 'spaceface.endingArchive.v1');

  // One comms announcement, once, named and persistent.
  assert.equal(announced(h).length, 1, 'the filing is announced exactly once');
  const line = announced(h)[0];
  assert.equal(line.sender, 'CONCORD ADMIN');
  assert.equal(line.category, 'story');
  assert.ok(line.text.includes(ENDING_A_TITLE), 'the announcement names the ending');
  assert.ok(line.text.includes('filed'), 'the announcement says the ending is filed');
  assert.ok(line.persist === true, 'the announcement persists in the comms record');
  assert.equal(h.state.story.seenComms.finale_announced, true);
  assert.ok(h.state.story.facts.some((f) => f.kind === 'finale' && f.id === 'finale:A'),
    'a finale story fact receipts the filing');

  // The latch holds: reopening the archive re-reads it, but nothing is announced twice.
  h.bus.emit('ui:endingArchiveOpen');
  assert.equal(h.events.archive.length, 2, 'archive open re-emits the manuscript');
  assert.equal(announced(h).length, 1, 'no second announcement');
  h.story._announceFinaleReady();
  assert.equal(announced(h).length, 1, 'the announce path is idempotent');
  h.bus.emit('ui:endgameChoose', { choice: 'B', confirm: true });
  assert.equal(h.state.story.endgameChoice, 'A', 'a resolved ending never re-resolves');
});

test('FB-129: the filed archive survives save/load and stays announced', () => {
  const h = makeHarness();
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(announced(h).length, 1);
  const before = writtenEndingArchive(h.state.story.writtenFinale);
  assert.ok(before, 'the manuscript exists before save');

  const blob = JSON.parse(JSON.stringify(h.story.serialize()));
  const h2 = makeHarness();
  h2.state.story = h2.state.story || {};
  h2.story.deserialize(blob);

  assert.equal(h2.state.story.endgameChoice, 'A');
  assert.equal(h2.state.story.endgameResolved, true);
  assert.equal(h2.state.story.seenComms.finale_announced, true,
    'the announced latch rides the save');
  const after = h2.story.getWrittenEndingArchive();
  assert.ok(after, 'the manuscript survives the load');
  assert.equal(after.schema, 'spaceface.endingArchive.v1');
  assert.equal(after.choiceId, 'A');
  assert.equal(after.title, ENDING_A_TITLE);
  assert.deepEqual(after.transmission, before.transmission, 'the transmission is byte-stable');
  h2.story._announceFinaleReady();
  assert.equal(h2.events.comms.filter((p) => p && p.id === 'finale_announced').length, 0,
    'a loaded life never re-announces a filed ending');
});

test('FB-129: the Codex Archive reads the filed ending from state, refreshed by its signal', () => {
  // The Archive tab must consume the story owner's archive — not a parallel presenter. These are
  // the two wiring seams codex.js owns: it re-renders on `endgame:archive`, and its Archive
  // section builds the 'Filed Ending' entry from `state.story.writtenFinale` via the same
  // `writtenEndingArchive` projection the story owner serves.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'screens', 'codex.js'),
    'utf8',
  );
  assert.ok(src.includes("on('endgame:archive'"), 'codex subscribes to the archive signal');
  assert.ok(src.includes('writtenEndingArchive'), 'codex uses the owner projection');
  assert.ok(src.includes('Filed Ending'), 'codex renders the filed-ending section');
  assert.ok(src.includes('endgame:filed'), 'the filed ending is a deep-linkable entry id');
});
