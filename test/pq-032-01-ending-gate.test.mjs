// PQ-032.01 — ending gate at the heavy-verb tier with a combat stake alternative.
// Headless. Prints combat-only and builder paths. No soak. No headed capture.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { receiptText } from '../src/data/encounters.js';
import { aceById } from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import {
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDING_IDS,
  TOW_CLASS_MIN,
  evaluateEndingEligibility,
  listUniqueEndingIds,
  snapshotEndingFacts,
} from '../src/story/endings/index.js';

const SEED = 3201;
const ACE_ID = 'ace_yara_no_cut';

function leftoverB7(extra = {}) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free']) {
    state.factions[id] = { rep: 0, aggro: false };
  }
  state.story.beatIndex = 7;
  state.story.flags = { endgame: true };
  state.story.endgameOffered = true;
  state.story.endgameChoice = null;
  state.story.endgameResolved = false;
  state.story.endgameDeclined = [];
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.missions = state.missions || { active: [], boards: {}, completedLog: [] };
  state.missions.active = [];
  state.claims = { bodies: [] };
  state.automation = { outposts: [] };
  state.story.campaign47a = { outpostsOwned: [], outpostSpecializationId: null };
  Object.assign(state, extra);
  return state;
}

function combatOnlyState() {
  const state = leftoverB7();
  state.story.branch = 'patrol';
  state.factions.faction_scn.rep = ENDGAME_REP_MIN;
  state.careers = { origins: { hunter: { status: 'completed', acceptedAtS: 1 } } };
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: ['mod_massline_spool_m'],
  }];
  state.world.discovery = {
    sector_ashfall_reach: { discovered: true, visitedCount: 1, fieldsDepleted: { f_ash_grave: 1 } },
  };
  state.aceMemory = {
    ace_yara_no_cut: { id: 'ace_yara_no_cut', defeated: true, encountered: true },
  };
  return state;
}

function builderState() {
  const state = leftoverB7();
  state.story.branch = 'free';
  state.factions.faction_free.rep = ENDGAME_REP_MIN;
  state.careers = { origins: { hauler: { status: 'completed', acceptedAtS: 1 } } };
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: ['mod_frame_coupler_m'],
  }];
  state.world.discovery = {
    sector_ashfall_reach: { discovered: true, visitedCount: 1, fieldsDepleted: { f_ash_grave: 1 } },
  };
  state.claims = { bodies: [{ id: 'claim_builder' }] };
  state.automation.outposts = [{ id: 'outpost_builder', defId: 'outpost_refinery' }];
  return state;
}

function printPath(kind, endingId, title) {
  console.log(`PQ-032.01 ${kind} ${endingId} ${title}`);
}

test('PQ-032.01 leftover combat-only dies on empire stake before the widen', () => {
  const state = leftoverB7();
  state.story.branch = 'patrol';
  state.factions.faction_scn.rep = ENDGAME_REP_MIN;
  state.careers = { origins: { hunter: { status: 'completed', acceptedAtS: 1 } } };
  const facts = snapshotEndingFacts(state);
  const a = evaluateEndingEligibility(state, 'A');
  assert.equal(facts.empireStake, false);
  assert.equal(facts.combatStake, false);
  assert.equal(a.eligible, false);
  assert.ok(a.unmet.some((row) => row.code === 'empire_stake'), a.unmet.map((row) => row.code).join(','));
});

test('PQ-032.01 combat-only run reaches an ending', () => {
  const state = combatOnlyState();
  const facts = snapshotEndingFacts(state);
  assert.equal(facts.empireStake, false, 'combat-only must not need capital / claim / outpost');
  assert.equal(facts.combatStake, true);
  assert.equal(facts.towClassOk, true);
  assert.ok(towRank(facts.towClass) >= towRank(TOW_CLASS_MIN), facts.towClass);
  assert.equal(facts.hasField, true);
  assert.equal(facts.acesBeaten, 1);
  assert.ok(facts.netWorthCr >= ENDGAME_NET_WORTH_CR);
  assert.ok(facts.branchRep >= ENDGAME_REP_MIN);

  const a = evaluateEndingEligibility(state, 'A');
  assert.equal(a.eligible, true, a.unmet.map((row) => row.code).join(',') || 'A');
  printPath('combat-only', a.id, a.def.title);
});

test('PQ-032.01 builder run reaches an ending', () => {
  const state = builderState();
  const facts = snapshotEndingFacts(state);
  assert.equal(facts.combatStake, false, 'builder path uses leftover empire stake');
  assert.equal(facts.empireStake, true);
  assert.equal(facts.hasClaim, true);
  assert.equal(facts.hasOutpost, true);
  assert.equal(facts.capitalOwned, false);
  assert.equal(facts.towClassOk, true);
  assert.equal(facts.hasField, true);

  const b = evaluateEndingEligibility(state, 'B');
  assert.equal(b.eligible, true, b.unmet.map((row) => row.code).join(',') || 'B');
  printPath('builder', b.id, b.def.title);
});

// The combat stake is only honest if PRODUCTION can set it. The fixtures above stamp
// aceMemory directly; this one makes the live writer do it. There is no emitter of
// `namedAce:defeated` anywhere in src/ — the only live path that sets `defeated` is
// encounterDirector's `encounter:receipt`, and it carries no aceId, so the ace is
// recovered by parsing the receipt COPY (aceFromText). That parse is the whole stake.
test('PQ-032.01 combat stake is written by production, not stamped by the fixture', () => {
  const ace = aceById(ACE_ID);
  assert.ok(ace, `${ACE_ID} must be a real roster ace, not a fixture invention`);

  // Byte-for-byte the payload encounterDirector.resolve emits when the named_hunter boss
  // dies: src/systems/encounterScripts.js sets `live.vars.name = cap.name`, then
  // src/systems/encounterDirector.js emits { shape: live.shapeId, outcome, text } with no aceId.
  const text = receiptText('named_hunter', 'killed', { name: ace.name });
  assert.ok(
    text.includes(ace.name),
    `live receipt copy must still name the ace or the combat stake dies silently: "${text}"`,
  );

  const sim = createSimulation({ seed: SEED, systems: [aceMemory] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ashfall_reach';
  bus.emit('encounter:receipt', {
    encounterId: 'namedHunter:pq32',
    shape: 'named_hunter',
    outcome: 'killed',
    text,
    t: 0,
    fingerprint: null,
    motiveId: null,
  });

  const written = state.aceMemory[ACE_ID];
  assert.equal(
    written && written.defeated, true,
    'live aceMemory must mark the ace defeated from the receipt the director actually emits',
  );

  // Hand the production-written bag to the gate — no stamped ace anywhere in this path.
  const gate = leftoverB7();
  gate.story.branch = 'patrol';
  gate.factions.faction_scn.rep = ENDGAME_REP_MIN;
  gate.aceMemory = state.aceMemory;
  const facts = snapshotEndingFacts(gate);
  assert.equal(facts.empireStake, false, 'still no capital / claim / outpost');
  assert.equal(facts.combatStake, true);
  assert.deepEqual(facts.aceIdsBeaten, [ACE_ID]);

  const a = evaluateEndingEligibility(gate, 'A');
  assert.equal(a.eligible, true, a.unmet.map((row) => row.code).join(',') || 'A');
  printPath('combat-only-live-writer', a.id, a.def.title);
});

// Negative control: the combat stake is live but it hangs on three exact couplings, and a
// rename at any one of them kills it silently (the stamped fixtures above would stay green).
test('PQ-032.01 combat stake couplings — outcome word, receipt copy, payload key', () => {
  const ace = aceById(ACE_ID);
  const liveText = receiptText('named_hunter', 'killed', { name: ace.name });
  const defeatedBy = (payload) => {
    const sim = createSimulation({ seed: SEED, systems: [aceMemory] });
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = 'sector_ashfall_reach';
    sim.bus.emit('encounter:receipt', payload);
    const rec = sim.state.aceMemory[ACE_ID];
    return !!(rec && rec.defeated);
  };

  assert.equal(defeatedBy({ shape: 'named_hunter', outcome: 'killed', text: liveText }), true);
  // `cleared` is what the sibling bountyHunter script resolves with on a wipe; aceMemory
  // only accepts `killed` / `escaped`, so namedHunter must keep saying `killed`.
  assert.equal(defeatedBy({ shape: 'named_hunter', outcome: 'cleared', text: liveText }), false);
  // The ace is recovered from the display copy, so an unfilled {name} var loses the stake.
  assert.equal(
    defeatedBy({ shape: 'named_hunter', outcome: 'killed', text: receiptText('named_hunter', 'killed', {}) }),
    false,
  );
  // Request sites spell it `shapeId`; the receipt spells it `shape`. Normalising the two
  // would silently drop every ace defeat.
  assert.equal(defeatedBy({ shapeId: 'named_hunter', outcome: 'killed', text: liveText }), false);
});

test('PQ-032.01 one linear spine — no new endings or branch menu', () => {
  assert.deepEqual(listUniqueEndingIds(), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(ENDING_IDS, ['A', 'B', 'C', 'D', 'E']);
  const combat = evaluateEndingEligibility(combatOnlyState(), 'A');
  const builder = evaluateEndingEligibility(builderState(), 'B');
  assert.equal(combat.eligible, true);
  assert.equal(builder.eligible, true);
  assert.equal(combat.def.boardEligible, true);
  assert.equal(builder.def.boardEligible, true);
});

function towRank(name) {
  return name === 'heavy' ? 3 : name === 'medium' ? 2 : name === 'light' ? 1 : 0;
}
