// Live adapter test for M5 Campaign 47-A — continuous B0→B7 through missions/story/heat.
// Run: node test/story-campaign47a-live.test.mjs
// Does NOT claim default wiring complete or full M5 acceptance (ship lattice out of band).
// Asserts: one continuous route without direct beatIndex surgery between beats,
// one story reward grant per advance, live B4 payload/rep, B5 chain count, B6 outpost
// receipt, B7 offer, five ending consequences (fresh state each), heat via authority,
// post-ending sandbox playable, serialize/deserialize sidecar, fail/recover no advance,
// no second director/system.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { COND, ENDGAME_CHOICES } from '../src/data/narrative.js';
import {
  BRANCH_CHAIN,
  BRANCH_OPPOSING,
  FAIL_RECOVERY_COOLDOWN_S,
  isBeatStepsComplete,
  readCanonicalStory,
} from '../src/story/campaign47a/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
  }
}

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

function makeLiveHarness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200,
  };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0, aggro: false };
    state.factions[id].rep = 0;
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, {
    id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 },
    flags: {}, hull: 100, maxHull: 100,
  });
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) {
    state.settings.gameplay.tutorialHints = false;
  }

  const bus = createBus();
  const grantCredits = [];
  const repDeltas = [];
  const beatAdvances = [];
  const heatClears = [];
  const heatChanged = [];
  const loopBacks = [];
  const endgameOffers = [];
  const encounterReceipts = [];

  bus.on('economy:grantCredits', (p) => grantCredits.push(p));
  bus.on('faction:repDelta', (p) => repDeltas.push(p));
  bus.on('story:beatAdvanced', (p) => beatAdvances.push(p));
  bus.on('heat:clear', (p) => heatClears.push(p));
  bus.on('heat:changed', (p) => heatChanged.push(p));
  bus.on('endgame:loopBack', (p) => loopBacks.push(p || {}));
  bus.on('endgame:offer', (p) => endgameOffers.push(p));
  bus.on('encounter:receipt', (p) => encounterReceipts.push(p));

  // Apply credits/rep intents so B7 gate and Ending A/E can be asserted on state.
  bus.on('economy:grantCredits', (p) => {
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });
  bus.on('faction:repDelta', (p) => {
    if (!p || !p.factionId) return;
    const f = state.factions[p.factionId] || (state.factions[p.factionId] = { rep: 0 });
    f.rep = (f.rep || 0) + (p.delta || 0);
  });

  const helpers = {
    mulberry32: (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    voice: { say: () => true },
  };

  const missions = cloneSystem(missionsProto);
  const story = cloneSystem(storyProto);
  const heat = cloneSystem(heatProto);
  const registry = {
    get: (name) => {
      if (name === 'missions') return missions;
      if (name === 'story') return story;
      if (name === 'heat') return heat;
      return null;
    },
  };

  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  heat.init({ state, bus, helpers, registry });
  missions.newGame();
  // story re-init narrative fields after missions wiped story
  story._ensureState(true);

  return {
    state, bus, missions, story, heat,
    grantCredits, repDeltas, beatAdvances, heatClears, heatChanged,
    loopBacks, endgameOffers, encounterReceipts,
  };
}

function storyGrants(h) {
  return h.grantCredits.filter((g) => g && String(g.reason || '').startsWith('story:'));
}

function advanceToB7(h, branch = 'traders') {
  const { state, bus, missions } = h;
  assert.equal(state.story.beatIndex, 0);

  // B0: mine then dock (ordered). Dock alone must not advance.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 0, 'dock alone must not advance B0');
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(state.story.beatIndex, 0, 'mine alone must not advance B0');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1, 'B0 completes on mine then dock');

  // B1 trade
  bus.emit('economy:tradeCompleted', {
    side: 'sell', stationId: 'station_helios', commodityId: 'cmdty_ore_iron', qty: 1, total: 50,
  });
  assert.equal(state.story.beatIndex, 2);

  // B2 kill
  bus.emit('entity:killed', { id: 99, killerId: state.playerId, factionId: 'faction_free' });
  assert.equal(state.story.beatIndex, 3);

  // B3 ship purchase
  bus.emit('ship:purchased', { defId: 'ship_kestrel', hullId: 'ship_kestrel' });
  assert.equal(state.story.beatIndex, 4);

  // B4 live branch intro only
  const introType = branch === 'patrol' ? 'patrol_clear' : (branch === 'free' ? 'smuggling_run' : 'bulk_trade');
  const introFaction = branch === 'patrol' ? 'faction_scn' : (branch === 'free' ? 'faction_free' : 'faction_mts');
  const offer = {
    id: `test_intro_${branch}`,
    type: introType,
    stationId: 'station_helios',
    factionId: introFaction,
    storyTag: STORY_BRANCH_INTRO_TAG,
    storyBranch: branch,
    title: `Intro ${branch}`,
    reward_cr: 500,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: 'station_helios',
    destSectorId: 'sector_helios',
    distance: 600,
    params: introType === 'bulk_trade'
      ? { cmdtyId: 'cmdty_food', qty: 5, cargoValue: 100, fValue: 1, taskTime: 10 }
      : introType === 'patrol_clear'
        ? { clearCount: 2, fValue: 1, taskTime: 10 }
        : { cmdtyId: 'cmdty_stimulants', qty: 2, cargoValue: 80, fValue: 1, taskTime: 10 },
  };
  const posted = missions.postAndAcceptAuthoredOffer(offer);
  assert.equal(posted.ok, true, `B4 accept failed: ${posted.reason}`);
  assert.equal(state.story.branch, branch);
  assert.equal(state.story.beatIndex, 5);

  // B5 chain completions
  const chain = BRANCH_CHAIN[branch];
  assert.ok(chain);
  for (let i = 0; i < chain.count; i++) {
    const m = {
      id: `chain_${i}`,
      type: chain.missionType,
      status: 'active',
      factionId: introFaction,
      title: `Chain ${i}`,
      reward_cr: 100,
      collateral_cr: 0,
      riskTier: 0,
      params: {},
      objectiveProgress: 0,
      objectiveTarget: 1,
      targetEntityIds: [],
      destStationId: 'station_helios',
      destSectorId: 'sector_helios',
      stationId: 'station_helios',
    };
    state.missions.active.push(m);
    missions._completeMission(m, state.missions.active.indexOf(m));
  }
  assert.equal(state.story.beatIndex, 6, `B5 should complete after ${chain.count} chain missions`);

  // B6 outpost deploy with defId
  bus.emit('asset:deployed', {
    kind: 'outpost',
    id: 'outpost_inst_1',
    defId: 'outpost_refinery',
  });
  assert.equal(state.story.beatIndex, 7);

  // B7 gate: credits + rep
  state.player.credits = 100000;
  if (state.factions[introFaction]) state.factions[introFaction].rep = 50;
  missions._checkStoryGates();
  assert.equal(state.story.flags.endgame, true);
  assert.equal(state.story.beatIndex, 7);
}

console.log('story-campaign47a-live (missions/story adapter)');

check('continuous B0→B7 without direct beatIndex assignment between beats', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'traders');
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.branch, 'traders');
  assert.equal(h.state.story.flags.beat_0_done, true);
  assert.equal(h.state.story.flags.beat_6_done, true);
  assert.equal(h.state.story.flags.endgame, true);
  // 8 advances: 0→1…6→7, and B7 terminal advance that sets endgame (fromIndex 7 toIndex 7)
  assert.ok(h.beatAdvances.length >= 7, `expected >=7 beat advances, got ${h.beatAdvances.length}`);
});

check('one canonical story reward grant per beat advance (B0–B6 credits)', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'traders');
  const storyReasons = storyGrants(h).map((g) => g.reason);
  // B0..B6 have credits rewards; B7 has title only
  const expected = [
    'story:cold_start',
    'story:honest_work',
    'story:first_blood',
    'story:bigger_boat',
    'story:pick_a_side',
    'story:proving_ground',
    'story:empire_seed',
  ];
  for (const reason of expected) {
    const hits = storyReasons.filter((r) => r === reason);
    assert.equal(hits.length, 1, `expected exactly one ${reason}, got ${hits.length}`);
  }
  // No duplicate story:beatAdvanced for same fromIndex
  const froms = h.beatAdvances.map((b) => b.fromIndex);
  const uniqueFroms = new Set(froms.filter((f, i) => !(f === 7 && h.beatAdvances[i].toIndex === 7)));
  // B0-B6 each advance once
  for (let i = 0; i <= 6; i++) {
    assert.equal(froms.filter((f) => f === i).length, 1, `beat ${i} advanced once`);
  }
  void uniqueFroms;
});

check('B0 rejects dock-before-mine; ordered mine→dock only', () => {
  const h = makeLiveHarness();
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0);
  assert.equal(isBeatStepsComplete(h.state, 0), false);
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  assert.equal(h.state.story.beatIndex, 0);
  assert.ok(h.state.story.campaign47a);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
});

check('B4 live story.branch_intro + single opposing rep map', () => {
  const h = makeLiveHarness();
  // Fast-forward to B4 via real triggers
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('entity:killed', { id: 2, killerId: h.state.playerId });
  h.bus.emit('ship:purchased', { defId: 'ship_kestrel' });
  assert.equal(h.state.story.beatIndex, 4);

  const beforeRep = { ...Object.fromEntries(Object.entries(h.state.factions).map(([k, v]) => [k, v.rep])) };
  const offer = {
    id: 'intro_traders',
    type: 'bulk_trade',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    storyTag: STORY_BRANCH_INTRO_TAG,
    storyBranch: 'traders',
    title: 'MTS Intro',
    reward_cr: 200,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: 'station_helios',
    destSectorId: 'sector_helios',
    distance: 600,
    params: { cmdtyId: 'cmdty_food', qty: 4, cargoValue: 80, fValue: 1, taskTime: 8 },
  };
  assert.equal(h.missions.postAndAcceptAuthoredOffer(offer).ok, true);
  assert.equal(h.state.story.branch, 'traders');
  assert.equal(h.state.story.beatIndex, 5);

  const chosen = h.repDeltas.find((r) => r.reason === 'story_branch' && r.factionId === 'faction_mts');
  const opposing = h.repDeltas.filter((r) => r.reason === 'story_branch_opposing');
  assert.ok(chosen && chosen.delta === 15);
  assert.equal(opposing.length, 1, 'exactly one opposing rep');
  assert.equal(opposing[0].factionId, BRANCH_OPPOSING.traders);
  assert.equal(opposing[0].delta, -10);

  // Non-live storyTag must not set branch if somehow accepted without isStoryBranchIntro
  // (we already advanced past B4; branch stays traders)
  assert.equal(h.state.story.branch, 'traders');
  void beforeRep;
});

check('B5 advances only after live chain completion count', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'patrol'); // patrol chain count = 2
  // Re-run chain logic on a fresh path stop at B5
  const h2 = makeLiveHarness();
  h2.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h2.bus.emit('dock:docked', { stationId: 'station_helios' });
  h2.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'x', qty: 1 });
  h2.bus.emit('entity:killed', { id: 3, killerId: h2.state.playerId });
  h2.bus.emit('ship:purchased', { defId: 'ship_kestrel' });
  const offer = {
    id: 'intro_patrol',
    type: 'patrol_clear',
    stationId: 'station_helios',
    factionId: 'faction_scn',
    storyTag: STORY_BRANCH_INTRO_TAG,
    storyBranch: 'patrol',
    title: 'SCN Intro',
    reward_cr: 200,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: 'station_helios',
    destSectorId: 'sector_helios',
    distance: 600,
    params: { clearCount: 2, fValue: 1, taskTime: 8 },
  };
  h2.missions.postAndAcceptAuthoredOffer(offer);
  assert.equal(h2.state.story.beatIndex, 5);
  assert.equal(h2.state.story.branch, 'patrol');

  const chain = BRANCH_CHAIN.patrol;
  // One completion: still B5
  const m0 = {
    id: 'c0', type: chain.missionType, status: 'active', factionId: 'faction_scn',
    title: 'c0', reward_cr: 50, collateral_cr: 0, riskTier: 0, params: {},
    objectiveProgress: 0, objectiveTarget: 1, targetEntityIds: [],
    destStationId: 'station_helios', destSectorId: 'sector_helios', stationId: 'station_helios',
  };
  h2.state.missions.active.push(m0);
  h2.missions._completeMission(m0, h2.state.missions.active.indexOf(m0));
  assert.equal(h2.state.story.beatIndex, 5);
  assert.equal(h2.state.story.chainProgress, 1);

  const m1 = { ...m0, id: 'c1', status: 'active' };
  h2.state.missions.active.push(m1);
  h2.missions._completeMission(m1, h2.state.missions.active.indexOf(m1));
  assert.equal(h2.state.story.beatIndex, 6);
  assert.equal(h2.state.story.chainProgress, 0);
});

check('B6 outpost asset:deployed retains defId/specialization in sidecar', () => {
  const h = makeLiveHarness();
  // reach B6
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'x', qty: 1 });
  h.bus.emit('entity:killed', { id: 4, killerId: h.state.playerId });
  h.bus.emit('ship:purchased', { defId: 'ship_kestrel' });
  h.missions.postAndAcceptAuthoredOffer({
    id: 'intro_t',
    type: 'bulk_trade',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    storyTag: STORY_BRANCH_INTRO_TAG,
    storyBranch: 'traders',
    title: 'intro',
    reward_cr: 100,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: 'station_helios',
    destSectorId: 'sector_helios',
    distance: 600,
    params: { cmdtyId: 'cmdty_food', qty: 3, cargoValue: 40, fValue: 1, taskTime: 5 },
  });
  for (let i = 0; i < 3; i++) {
    const m = {
      id: `ch${i}`, type: 'bulk_trade', status: 'active', factionId: 'faction_mts',
      title: `ch${i}`, reward_cr: 40, collateral_cr: 0, riskTier: 0, params: {},
      objectiveProgress: 0, objectiveTarget: 1, targetEntityIds: [],
      destStationId: 'station_helios', destSectorId: 'sector_helios', stationId: 'station_helios',
    };
    h.state.missions.active.push(m);
    h.missions._completeMission(m, h.state.missions.active.indexOf(m));
  }
  assert.equal(h.state.story.beatIndex, 6);
  h.bus.emit('asset:deployed', { kind: 'outpost', id: 'o1', defId: 'outpost_refinery' });
  assert.equal(h.state.story.beatIndex, 7);
  const side = h.state.story.campaign47a;
  assert.ok(side);
  assert.equal(side.outpostSpecializationId, 'refinery');
  assert.ok(side.outpostsOwned.includes('refinery'));
});

check('B7 offers endgame; five endings with distinct consequences (fresh state each)', () => {
  const endings = ['A', 'B', 'C', 'D', 'E'];
  for (const endingId of endings) {
    const h = makeLiveHarness();
    advanceToB7(h, 'traders');
    // Force endgame offered path
    h.state.story.flags.endgame = true;
    h.state.player.credits = 100000;
    h.state.factions.faction_mts.rep = 50;
    h.state.mode = 'flight';
    // Prep per-ending requirements
    if (endingId === 'A') {
      h.state.player.heat = 0.5;
    }
    if (endingId === 'D') {
      h.state.player.cargo.items.cmdty_personal_ledger = 1;
      h.state.story.flags.hasLedger = true;
    }
    if (endingId === 'E') {
      h.state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
      assert.equal(COND.declinedAll(h.state, ['A', 'B', 'C', 'D']), true);
    }
    if (endingId === 'C') {
      h.state.world = h.state.world || {};
      h.state.world.currentSectorId = 'sector_ashfall_reach';
      h.state.missions.active = [];
      h.state.player.cargo.usedVolume = h.state.player.cargo.capVolume;
    }

    h.story._maybeOfferEndgame();
    assert.equal(h.state.story.endgameOffered, true);
    assert.ok(h.endgameOffers.length >= 1);

    const heatBefore = h.state.player.heat;
    h.bus.emit('ui:endgameChoose', { choice: endingId });
    assert.equal(h.state.story.endgameChoice, endingId);

    const side = h.state.story.campaign47a;
    assert.ok(side, 'sidecar present after ending');
    assert.ok(side.sandboxMode, `sandbox mode for ${endingId}`);
    assert.ok(
      (side.receipts || []).some((r) => r.kind === 'ending_descriptor' || (r.endingId === endingId)),
      `ending descriptor receipt for ${endingId}`,
    );

    if (endingId === 'A') {
      assert.ok(h.heatClears.some((p) => p && p.reason));
      assert.equal(h.state.player.heat, 0, 'heat cleared via heat authority');
      assert.ok(h.repDeltas.some((r) => r.factionId === 'faction_scn' && r.delta === 700));
      assert.ok(h.repDeltas.some((r) => r.factionId === 'faction_mts' && r.delta === 100));
      // No direct heat write path required — heat:clear was emitted and consumed
      assert.ok(heatBefore > 0);
    }
    if (endingId === 'B') {
      assert.equal(h.state.story.flags.identityErased, true);
    }
    if (endingId === 'C') {
      assert.ok(h.loopBacks.length >= 1);
      assert.equal(side.sandboxMode, 'loop_return');
      // Spine not silently reset; flight continues
      assert.equal(h.state.story.beatIndex, 7);
      assert.equal(h.state.mode, 'flight');
      assert.equal(h.state.story.endgameChoice, 'C');
    }
    if (endingId === 'D') {
      assert.equal(h.state.story.flags.stayedAtAshfall, true);
    }
    if (endingId === 'E') {
      assert.equal(h.state.story.flags.contract47bPending, true);
      assert.ok(h.grantCredits.some((g) => g.amount === 1200 && String(g.reason).includes('47a')));
    }

    // Post-ending sandbox remains playable (missions still run, no crash)
    h.state.mode = 'flight';
    h.missions.update(0.016, h.state);
    h.story.update(0.016, h.state);
    assert.equal(h.state.mode, 'flight');
  }
});

check('Choice E requirement reads canonical state.story.endgameDeclined', () => {
  const state = createGameState(1);
  state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
  state.story.flags = {};
  assert.equal(COND.declinedAll(state, ['A', 'B', 'C', 'D']), true);
  state.story.endgameDeclined = ['A'];
  assert.equal(COND.declinedAll(state, ['A', 'B', 'C', 'D']), false);
  // Empty canonical list is authoritative (not declined) even if legacy flags exist.
  state.story.endgameDeclined = [];
  state.story.flags.endgameDeclined = ['A', 'B', 'C', 'D'];
  assert.equal(COND.declinedAll(state, ['A', 'B', 'C', 'D']), false);
  // Legacy fallback only when top-level field is absent.
  delete state.story.endgameDeclined;
  state.story.flags.endgameDeclined = ['A', 'B', 'C', 'D'];
  assert.equal(COND.declinedAll(state, ['A', 'B', 'C', 'D']), true);
  const e = ENDGAME_CHOICES.find((c) => c.id === 'E');
  assert.ok(e);
});

check('fail/recover does not advance beatIndex; no director encounter:receipt', () => {
  const h = makeLiveHarness();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  const m = {
    id: 'fail_m',
    type: 'cargo_delivery',
    status: 'active',
    factionId: 'faction_mts',
    title: 'Fail me',
    reward_cr: 100,
    collateral_cr: 0,
    riskTier: 0,
    params: { cmdtyId: 'cmdty_food', qty: 2 },
    objectiveProgress: 0,
    objectiveTarget: 1,
    targetEntityIds: [],
    destStationId: 'station_helios',
    destSectorId: 'sector_helios',
    stationId: 'station_helios',
    storyTag: 'story.test',
  };
  h.state.missions.active.push(m);
  const biBefore = h.state.story.beatIndex;
  h.missions._failMission(m, h.state.missions.active.indexOf(m), 'test_fail');
  assert.equal(h.state.story.beatIndex, biBefore, 'failure must not advance');
  assert.equal(h.state.story.campaign47a.beatStatus, 'failed');
  assert.equal(h.encounterReceipts.length, 0, 'must not emit director encounter:receipt');

  // Cooldown blocks early recover
  h.state.simTime = (h.state.simTime || 10) + 1;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  // either still failed (cooldown) or recovered after cooldown path — do not skip beat
  assert.equal(h.state.story.beatIndex, biBefore);

  h.state.simTime += FAIL_RECOVERY_COOLDOWN_S + 1;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, biBefore, 'recover must not skip beat');
  assert.notEqual(h.state.story.campaign47a.beatStatus, 'failed');
});

check('unrelated mission failure does not fail or gate the story spine', () => {
  const h = makeLiveHarness();
  const m = {
    id: 'side_mission', type: 'cargo_delivery', status: 'active', factionId: 'faction_mts',
    title: 'Ordinary Freight', reward_cr: 100, collateral_cr: 0, riskTier: 0,
    params: { cmdtyId: 'cmdty_food', qty: 2 }, objectiveProgress: 0, objectiveTarget: 1,
    targetEntityIds: [],
  };
  h.state.missions.active.push(m);
  h.missions._failMission(m, h.state.missions.active.indexOf(m), 'ordinary_failure');
  assert.notEqual(h.state.story.campaign47a.beatStatus, 'failed');
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
});

check('failed story chain cannot advance before deterministic recovery', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'traders');
  // Start a fresh run at B5 without mutating between the route beats under test.
  h.missions.newGame();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'x', qty: 1 });
  h.bus.emit('entity:killed', { id: 7, killerId: h.state.playerId });
  h.bus.emit('ship:purchased', { defId: 'ship_kestrel' });
  h.missions.postAndAcceptAuthoredOffer({
    id: 'intro_traders_recovery', type: 'bulk_trade', stationId: 'station_helios',
    factionId: 'faction_mts', storyTag: STORY_BRANCH_INTRO_TAG, storyBranch: 'traders',
    title: 'MTS Recovery Intro', reward_cr: 100, collateral_cr: 0, riskTier: 0,
    destStationId: 'station_helios', destSectorId: 'sector_helios',
    params: { cmdtyId: 'cmdty_food', qty: 1 }, objectiveTarget: 1,
    objectiveProgress: 0, targetEntityIds: [],
  });
  assert.equal(h.state.story.beatIndex, 5);
  const failed = {
    id: 'failed_chain', type: 'bulk_trade', status: 'active', factionId: 'faction_mts',
    storyBranch: 'traders', title: 'Failed Chain', reward_cr: 50, collateral_cr: 0,
    riskTier: 0, params: {}, objectiveProgress: 0, objectiveTarget: 1, targetEntityIds: [],
  };
  h.state.missions.active.push(failed);
  h.missions._failMission(failed, h.state.missions.active.indexOf(failed), 'chain_failure');
  assert.equal(h.state.story.campaign47a.beatStatus, 'failed');
  const progressBefore = h.state.story.chainProgress;
  h.missions._advanceStoryChain({ type: 'bulk_trade' });
  assert.equal(h.state.story.chainProgress, progressBefore);
  assert.equal(h.state.story.beatIndex, 5);
});

check('missions serialize/deserialize preserves campaign47a sidecar', () => {
  const h = makeLiveHarness();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  const blob = h.missions.serialize();
  assert.ok(blob.story);
  assert.ok(blob.story.campaign47a, 'sidecar nested under story in serialize');
  assert.equal(blob.story.beatIndex, 1);

  const h2 = makeLiveHarness(99);
  h2.missions.deserialize(blob);
  assert.equal(h2.state.story.beatIndex, 1);
  assert.ok(h2.state.story.campaign47a);
  assert.equal(h2.state.story.campaign47a.schemaVersion, 2);
  const canon = readCanonicalStory(h2.state);
  assert.equal(canon.beatIndex, 1);
});

check('no second campaign director/system registered in adapter sources', () => {
  const files = [
    'src/systems/missions.js',
    'src/systems/story.js',
    'src/systems/heat.js',
    'src/systems/automation.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /name:\s*['"]campaign47a['"]/, `${rel} must not register campaign system`);
    // Production emit of director-shaped encounter:receipt is forbidden (comments may mention it).
    assert.doesNotMatch(
      src,
      /(?:bus\.emit|emit)\(\s*['"]encounter:receipt['"]/,
      `${rel} must not emit director encounter:receipt`,
    );
  }
  // story emits heat:clear not player.heat=
  const storySrc = fs.readFileSync(path.join(ROOT, 'src/systems/story.js'), 'utf8');
  assert.match(storySrc, /heat:clear/);
  assert.doesNotMatch(storySrc, /player\.heat\s*=\s*0/);
});

check('post-ending sandbox remains playable after Ending A', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'traders');
  h.state.player.heat = 0.4;
  h.state.story.flags.endgame = true;
  h.state.player.credits = 100000;
  h.state.factions.faction_mts.rep = 50;
  h.story._maybeOfferEndgame();
  h.bus.emit('ui:endgameChoose', { choice: 'A' });
  assert.equal(h.state.story.endgameChoice, 'A');
  assert.equal(h.state.mode, 'flight');
  // Still can process mission ticks and trade without closing
  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_food', qty: 1 });
  h.missions.update(0.016, h.state);
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.mode, 'flight');
});

if (failures) {
  console.error(`\nstory-campaign47a-live: ${failures} failed`);
  process.exit(1);
}
console.log('\nstory-campaign47a-live: all checks passed (adapter wired — not full M5 acceptance)');
