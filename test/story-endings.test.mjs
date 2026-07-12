// Deterministic gate for M5 five embodied endings + sandbox continuation.
// Run: node test/story-endings.test.mjs
// Asserts: five unique endings, eligibility truth, disabled reasons, one-shot resolution,
// save/reload idempotency, canonical intents, sandbox continuation, no duplicate rewards, 20 seeds.

import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import {
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDING_IDS,
  SANDBOX_ID,
  SANDBOX_MODE_OPEN_FRONTIER,
  assertEndingUniqueness,
  endingDef,
  evaluateEndingEligibility,
  listBoardEligibleEndingIds,
  listEndingEligibility,
  listUniqueEndingIds,
  planEndingResolution,
  planPendingConfirmation,
  snapshotEndingFacts,
} from '../src/story/endings/index.js';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  }
}

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

/** Minimal B7-ready state with configurable facts. */
function makeB7State(seed = 47, extra = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 1000;
  state.meta = state.meta || {};
  state.meta.seed = seed;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.heat = 0.4;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200,
  };
  state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = { rep: 0, aggro: false };
  }
  state.story.beatIndex = 7;
  state.story.branch = 'patrol';
  state.story.flags = { endgame: true };
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
  Object.assign(state, extra);
  return state;
}

function makeLiveHarness(seed = 47) {
  const state = makeB7State(seed);
  const bus = createBus();
  const events = {
    grantCredits: [],
    repDeltas: [],
    heatClears: [],
    loopBacks: [],
    confirmRequired: [],
    promptSandbox: [],
    chosen: [],
    sandboxContinued: [],
    ineligible: [],
  };
  bus.on('economy:grantCredits', (p) => {
    events.grantCredits.push(p);
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });
  bus.on('faction:repDelta', (p) => {
    events.repDeltas.push(p);
    if (!p || !p.factionId) return;
    const f = state.factions[p.factionId] || (state.factions[p.factionId] = { rep: 0 });
    f.rep = (f.rep || 0) + (p.delta || 0);
  });
  bus.on('heat:clear', (p) => {
    events.heatClears.push(p);
    state.player.heat = 0;
  });
  bus.on('endgame:loopBack', (p) => events.loopBacks.push(p || {}));
  bus.on('endgame:confirmRequired', (p) => events.confirmRequired.push(p));
  bus.on('endgame:promptSandbox', (p) => events.promptSandbox.push(p));
  bus.on('endgame:chosen', (p) => events.chosen.push(p));
  bus.on('endgame:sandboxContinued', (p) => events.sandboxContinued.push(p));
  bus.on('endgame:ineligible', (p) => events.ineligible.push(p));

  const story = cloneSystem(storyProto);
  const heat = cloneSystem(heatProto);
  const missions = cloneSystem(missionsProto);
  const registry = {
    get(name) {
      if (name === 'missions') return missions;
      if (name === 'story') return story;
      if (name === 'heat') return heat;
      return null;
    },
  };
  const helpers = { voice: { say: () => true } };
  const ctx = { state, bus, helpers, registry };
  heat.init(ctx);
  missions.init(ctx);
  story.init(ctx);
  return { state, bus, story, heat, missions, events };
}

function qualifyFor(state, endingId) {
  // Shared empire already set by makeB7State
  state.story.flags.endgame = true;
  state.story.endgameOffered = true;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_bastion' }];
  state.claims = { bodies: [{ id: 'c1' }] };

  if (endingId === 'A') {
    state.story.branch = 'patrol';
    state.factions.faction_scn.rep = ENDGAME_REP_MIN;
    state.careers = { origins: { hunter: { status: 'completed' } } };
  }
  if (endingId === 'B') {
    state.story.branch = 'free';
    state.factions.faction_free.rep = ENDGAME_REP_MIN;
    state.careers = { origins: { hauler: { status: 'completed' } } };
  }
  if (endingId === 'C') {
    state.story.branch = 'traders';
    state.factions.faction_mts.rep = ENDGAME_REP_MIN;
    state.world.currentSectorId = 'sector_ashfall_reach';
    state.missions.active = [];
    state.player.cargo.usedVolume = state.player.cargo.capVolume;
  }
  if (endingId === 'D') {
    state.story.branch = 'traders';
    state.factions.faction_mts.rep = ENDGAME_REP_MIN;
    state.world.currentSectorId = 'sector_ashfall_reach';
    state.player.cargo.items.cmdty_personal_ledger = 1;
    state.story.flags.hasLedger = true;
  }
  if (endingId === 'E') {
    state.story.branch = 'traders';
    state.factions.faction_mts.rep = ENDGAME_REP_MIN;
    state.world.currentSectorId = 'sector_ashfall_reach';
    state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
  }
  if (endingId === SANDBOX_ID) {
    state.story.branch = 'traders';
    state.factions.faction_mts.rep = ENDGAME_REP_MIN;
  }
}

console.log('story-endings (five endings + sandbox)');

// ── Uniqueness ─────────────────────────────────────────────────────────────
check('five unique ending ids/keys/modes/titles', () => {
  assert.equal(listUniqueEndingIds().length, 5);
  assert.deepEqual(listUniqueEndingIds(), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(assertEndingUniqueness(), true);
  const modes = ENDING_IDS.map((id) => endingDef(id).sandboxMode);
  assert.equal(new Set(modes).size, 5);
  assert.ok(!modes.includes(SANDBOX_MODE_OPEN_FRONTIER));
  assert.equal(endingDef(SANDBOX_ID).isEnding, false);
});

// ── Eligibility truth + disabled reasons ───────────────────────────────────
check('shared gate blocks when net worth/rep/empire stake missing', () => {
  const state = makeB7State(1);
  state.player.credits = 1000;
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.claims = { bodies: [] };
  state.factions.faction_scn.rep = 0;
  const elig = evaluateEndingEligibility(state, 'A');
  assert.equal(elig.eligible, false);
  const codes = elig.unmet.map((u) => u.code);
  assert.ok(codes.includes('net_worth'), codes.join(','));
  assert.ok(codes.includes('branch_rep'), codes.join(','));
  assert.ok(codes.includes('empire_stake'), codes.join(','));
  for (const u of elig.unmet) {
    assert.ok(u.text && u.text.length > 0, 'player-visible unmet text');
  }
});

check('live automation outposts satisfy the empire-stake gate', () => {
  const state = makeB7State(11);
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.claims = { bodies: [] };
  state.story.campaign47a = { outpostsOwned: [], outpostSpecializationId: null };
  state.automation.outposts = [{ id: 'outpost_live', defId: 'outpost_refinery' }];
  const facts = snapshotEndingFacts(state);
  assert.equal(facts.hasOutpost, true);
  assert.equal(facts.empireStake, true);
  assert.equal(evaluateEndingEligibility(state, 'A').unmet.some((u) => u.code === 'empire_stake'), false);
});

check('A requires lawful alignment; B requires quiet alignment', () => {
  const state = makeB7State(2);
  // Traders branch, MTS only — no SCN, no hunter
  state.story.branch = 'traders';
  state.factions.faction_mts.rep = 80;
  state.factions.faction_scn.rep = 0;
  state.factions.faction_free.rep = 0;
  state.careers = { origins: {} };
  assert.equal(evaluateEndingEligibility(state, 'A').eligible, false);
  assert.ok(evaluateEndingEligibility(state, 'A').unmet.some((u) => u.code === 'alignment'));
  assert.equal(evaluateEndingEligibility(state, 'B').eligible, false);
  assert.ok(evaluateEndingEligibility(state, 'B').unmet.some((u) => u.code === 'alignment'));

  // SCN standing unlocks A without patrol branch
  state.factions.faction_scn.rep = ENDGAME_REP_MIN;
  assert.equal(evaluateEndingEligibility(state, 'A').eligible, true);

  // Free standing unlocks B
  state.factions.faction_free.rep = ENDGAME_REP_MIN;
  assert.equal(evaluateEndingEligibility(state, 'B').eligible, true);
});

check('C/D/E world gates produce distinct unmet reasons', () => {
  const state = makeB7State(3);
  state.story.branch = 'traders';
  state.factions.faction_mts.rep = 60;
  state.world.currentSectorId = 'sector_helios';
  state.missions.active = [{ id: 'm1' }];
  state.player.cargo.usedVolume = 0;

  const c = evaluateEndingEligibility(state, 'C');
  assert.equal(c.eligible, false);
  assert.ok(c.unmet.some((u) => u.code === 'sector'));
  assert.ok(c.unmet.some((u) => u.code === 'full_load'));
  assert.ok(c.unmet.some((u) => u.code === 'no_missions'));

  const d = evaluateEndingEligibility(state, 'D');
  assert.equal(d.eligible, false);
  assert.ok(d.unmet.some((u) => String(u.code).includes('cargo') || u.code === 'ledger' || u.code === 'sector'));

  const e = evaluateEndingEligibility(state, 'E');
  assert.equal(e.eligible, false);
  assert.ok(e.unmet.some((u) => String(u.code).startsWith('decline:')));
});

check('listEndingEligibility returns five endings + sandbox', () => {
  const state = makeB7State(4);
  const rows = listEndingEligibility(state);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.id), ['A', 'B', 'C', 'D', 'E', SANDBOX_ID]);
});

check('offer surfaces sandbox when no final disposition is currently fileable', () => {
  const h = makeLiveHarness(12);
  h.state.story.endgameOffered = false;
  h.state.story.branch = 'traders';
  h.state.factions.faction_mts.rep = ENDGAME_REP_MIN;
  h.state.factions.faction_scn.rep = 0;
  h.state.factions.faction_free.rep = 0;
  h.state.careers = { origins: {} };
  h.state.player.cargo.usedVolume = 0;
  h.state.player.cargo.items = {};
  h.state.story.endgameDeclined = [];
  h.story._maybeOfferEndgame();
  assert.equal(h.events.promptSandbox.length, 1);
});

// ── Resolution intents (pure) ──────────────────────────────────────────────
check('planEndingResolution emits only canonical owner intents', () => {
  const state = makeB7State(5);
  qualifyFor(state, 'A');
  const r = planEndingResolution(state, 'A');
  assert.equal(r.ok, true, r.reason);
  const events = r.plan.intents.map((i) => i.event);
  assert.ok(events.includes('faction:repDelta'));
  assert.ok(events.includes('heat:clear'));
  assert.ok(!events.includes('player.credits'));
  assert.equal(r.plan.isEnding, true);
  assert.ok(r.plan.resolution);
  assert.ok(r.plan.receipt.id.startsWith('ending_receipt:A:'));

  qualifyFor(state, 'E');
  const e = planEndingResolution(state, 'E');
  assert.equal(e.ok, true, e.reason);
  assert.ok(e.plan.intents.some((i) => i.event === 'economy:grantCredits' && i.payload.amount === 1200));
});

check('pending confirmation then resolve is one-shot', () => {
  const state = makeB7State(6);
  qualifyFor(state, 'A');
  const pend = planPendingConfirmation(state, 'A');
  assert.equal(pend.ok, true);
  assert.equal(pend.pending.choice, 'A');
  assert.ok(pend.pending.confirmPrompt);

  const once = planEndingResolution(state, 'A');
  assert.equal(once.ok, true);
  // Simulate applied
  state.story.endgameChoice = 'A';
  state.story.endgameResolved = true;
  const twice = planEndingResolution(state, 'A');
  assert.equal(twice.ok, false);
  assert.ok(twice.reason === 'already_resolved' || twice.reason === 'already_applied');
});

// ── Live story integration: confirm + apply + sandbox ──────────────────────
check('live: each of five endings unique consequences via confirm', () => {
  const seenModes = new Set();
  const seenReceipts = new Set();
  for (const id of ENDING_IDS) {
    const h = makeLiveHarness(10 + id.charCodeAt(0));
    qualifyFor(h.state, id);
    if (id === 'A') h.state.player.heat = 0.55;

    // Stage (no confirm) → pending
    h.bus.emit('ui:endgameChoose', { choice: id });
    assert.equal(h.state.story.endgameChoice, null, `${id} not applied without confirm`);
    assert.equal(h.state.story.endgamePending && h.state.story.endgamePending.choice, id);
    assert.ok(h.events.confirmRequired.some((p) => p && p.choice === id));

    // Confirm → apply once
    h.bus.emit('ui:endgameConfirm', { choice: id });
    assert.equal(h.state.story.endgameChoice, id);
    assert.equal(h.state.story.endgameResolved, true);
    assert.equal(h.state.story.endgamePending, null);

    // Second confirm is no-op
    const repCount = h.events.repDeltas.length;
    const grantCount = h.events.grantCredits.length;
    const heatCount = h.events.heatClears.length;
    h.bus.emit('ui:endgameConfirm', { choice: id });
    h.bus.emit('ui:endgameChoose', { choice: id, confirm: true });
    assert.equal(h.events.repDeltas.length, repCount, `${id} no duplicate rep`);
    assert.equal(h.events.grantCredits.length, grantCount, `${id} no duplicate credits`);
    assert.equal(h.events.heatClears.length, heatCount, `${id} no duplicate heat clear`);

    const side = h.state.story.campaign47a;
    assert.ok(side && side.sandboxMode, `${id} sandbox mode`);
    seenModes.add(side.sandboxMode);
    const rid = side.receipts && side.receipts.find((r) => r.kind === 'ending_resolution' || r.endingId === id);
    if (rid && rid.id) seenReceipts.add(rid.id);

    if (id === 'A') {
      assert.equal(h.state.player.heat, 0);
      assert.ok(h.events.heatClears.length >= 1);
      assert.ok(h.events.repDeltas.some((r) => r.factionId === 'faction_scn' && r.delta === 700));
    }
    if (id === 'B') assert.equal(h.state.story.flags.identityErased, true);
    if (id === 'C') {
      assert.ok(h.events.loopBacks.length >= 1);
      assert.equal(h.state.mode, 'flight');
      assert.equal(h.state.story.beatIndex, 7);
    }
    if (id === 'D') assert.equal(h.state.story.flags.stayedAtAshfall, true);
    if (id === 'E') {
      assert.equal(h.state.story.flags.contract47bPending, true);
      assert.ok(h.events.grantCredits.some((g) => g.amount === 1200));
    }

    // Post-ending play continues
    h.story.update(0.016, h.state);
    assert.equal(h.state.mode, 'flight');
  }
  assert.equal(seenModes.size, 5, 'five distinct sandbox modes');
});

check('live: sandbox continuation preserves world without faking an ending', () => {
  const h = makeLiveHarness(20);
  qualifyFor(h.state, SANDBOX_ID);
  const creditsBefore = h.state.player.credits;
  const beatBefore = h.state.story.beatIndex;
  const branchBefore = h.state.story.branch;

  h.bus.emit('ui:endgameSandbox', { choice: 'A', confirm: true });
  assert.equal(h.state.story.endgameChoice, null, 'sandbox is not an ending id');
  assert.equal(h.state.story.endgameResolved, true);
  assert.equal(h.state.story.flags.sandboxContinued, true);
  assert.equal(h.state.story.beatIndex, beatBefore);
  assert.equal(h.state.story.branch, branchBefore);
  assert.equal(h.state.player.credits, creditsBefore, 'no reward credits');
  assert.equal(h.events.grantCredits.length, 0);
  assert.equal(h.events.repDeltas.length, 0);
  assert.equal(h.events.heatClears.length, 0);
  assert.ok(h.events.sandboxContinued.length >= 1);
  const side = h.state.story.campaign47a;
  assert.equal(side.sandboxMode, SANDBOX_MODE_OPEN_FRONTIER);
  assert.equal(h.state.mode, 'flight');

  // Cannot re-file after sandbox
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(h.state.story.endgameChoice, null);
});

check('live: ineligible choose reports unmet conditions', () => {
  const h = makeLiveHarness(21);
  h.state.story.branch = 'traders';
  h.state.factions.faction_mts.rep = 80;
  h.state.factions.faction_scn.rep = 0;
  h.state.careers = { origins: {} };
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(h.state.story.endgameChoice, null);
  assert.ok(h.events.ineligible.some((p) => p && p.choice === 'A' && Array.isArray(p.unmet) && p.unmet.length));
});

check('save/load idempotency: no second rewards after deserialize', () => {
  const h = makeLiveHarness(22);
  qualifyFor(h.state, 'A');
  h.state.player.heat = 0.3;
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(h.state.story.endgameChoice, 'A');
  const blob = h.story.serialize();
  assert.equal(blob.story.endgameChoice, 'A');
  assert.equal(blob.story.endgameResolved, true);

  const h2 = makeLiveHarness(22);
  h2.story.deserialize(blob);
  // Ensure story fields restored
  h2.state.story.endgameChoice = blob.story.endgameChoice;
  h2.state.story.endgameResolved = blob.story.endgameResolved;
  h2.state.story.flags = Object.assign({}, blob.story.flags || {});
  if (blob.story.campaign47a) h2.state.story.campaign47a = JSON.parse(JSON.stringify(blob.story.campaign47a));

  const repBefore = h2.events.repDeltas.length;
  const heatBefore = h2.events.heatClears.length;
  h2.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  h2.bus.emit('ui:endgameConfirm', { choice: 'A' });
  assert.equal(h2.events.repDeltas.length, repBefore);
  assert.equal(h2.events.heatClears.length, heatBefore);
  assert.equal(h2.state.story.endgameChoice, 'A');
});

check('board eligibility lists only qualified A/B contracts', () => {
  const state = makeB7State(30);
  state.story.branch = 'patrol';
  state.factions.faction_scn.rep = 60;
  state.factions.faction_free.rep = 0;
  state.careers = { origins: { hunter: { status: 'completed' } } };
  const board = listBoardEligibleEndingIds(state);
  assert.ok(board.includes('A'));
  assert.ok(!board.includes('B'));
});

// ── 20 seeds determinism ───────────────────────────────────────────────────
check('20 seeds: identical eligibility + receipt ids for same facts', () => {
  const seeds = [];
  for (let i = 0; i < 20; i++) seeds.push(1000 + i);
  const snapshots = [];
  for (const seed of seeds) {
    const state = makeB7State(seed);
    qualifyFor(state, 'C');
    state.simTime = 5000;
    const facts = snapshotEndingFacts(state);
    const elig = listEndingEligibility(state);
    const plan = planEndingResolution(state, 'C');
    assert.equal(plan.ok, true, plan.reason);
    snapshots.push({
      seed,
      eligible: elig.map((r) => ({ id: r.id, ok: r.eligible, codes: r.unmet.map((u) => u.code) })),
      receiptId: plan.plan.receipt.id,
      intents: plan.plan.intents.map((i) => i.event + ':' + JSON.stringify(i.payload)),
    });
  }
  // Same facts → same eligibility codes and intent list shape across seeds
  const baseElig = JSON.stringify(snapshots[0].eligible);
  const baseIntents = JSON.stringify(snapshots[0].intents);
  for (const s of snapshots) {
    assert.equal(JSON.stringify(s.eligible), baseElig, `seed ${s.seed} eligibility drift`);
    assert.equal(JSON.stringify(s.intents), baseIntents, `seed ${s.seed} intent drift`);
    // Receipt includes seed → different seeds different ids
    assert.ok(s.receiptId.includes(`:${s.seed}`) || s.receiptId.includes('ending_receipt:C:'));
  }
  // Different seeds → different receipt ids when seed encoded
  const ids = new Set(snapshots.map((s) => s.receiptId));
  assert.equal(ids.size, 20, '20 unique receipt ids across seeds');
});

check('confirm:true one-shot shortcut resolves without separate pending', () => {
  const h = makeLiveHarness(40);
  qualifyFor(h.state, 'B');
  h.bus.emit('ui:endgameChoose', { choice: 'B', confirm: true });
  assert.equal(h.state.story.endgameChoice, 'B');
  assert.equal(h.state.story.flags.identityErased, true);
  assert.equal(h.events.confirmRequired.length, 0);
});

if (failures) {
  console.error(`\nstory-endings: ${failures} failed`);
  process.exit(1);
}
console.log('\nstory-endings: all checks passed');
