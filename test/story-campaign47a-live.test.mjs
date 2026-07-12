// Live adapter test for M5 Campaign 47-A — continuous B0→B7 through missions/story/heat.
// Run: node test/story-campaign47a-live.test.mjs
// Does NOT claim default wiring complete or full M5 acceptance (ship lattice out of band).
// Asserts: one continuous route without direct beatIndex surgery between beats,
// one story reward grant per advance, live B4 payload/rep, B5 chain count, B6 automation
// seed, physical B7 operation, five ending consequences (fresh state each), heat via authority,
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
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList = state.entityList || [];
      state.entityList.push(entity);
      return entity;
    },
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

function acceptEmbodiedOffer(h, stationId, expectedTag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((candidate) => candidate && candidate.storyTag === expectedTag);
  assert.ok(offer, `missing authored offer ${expectedTag} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${expectedTag}`);
  const mission = h.state.missions.active.find((candidate) => candidate.storyTag === expectedTag);
  assert.ok(mission, `missing active mission ${expectedTag}`);
  return mission;
}

function advanceEmbodiedB1B2(h, outcome = 'force') {
  const { state, bus, missions } = h;
  assert.equal(state.story.beatIndex, 1);
  // Unrelated trade cannot advance the campaign.
  bus.emit('economy:tradeCompleted', { side: 'sell', stationId: 'station_helios', commodityId: 'cmdty_ore_iron', qty: 1 });
  assert.equal(state.story.beatIndex, 1);
  acceptEmbodiedOffer(h, 'station_helios', 'campaign47a:b1:honest_work');
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(state.story.beatIndex, 2);

  // Unrelated kills cannot advance First Blood.
  bus.emit('entity:killed', { id: 9999, killerId: state.playerId, factionId: 'faction_free' });
  assert.equal(state.story.beatIndex, 2);
  const bounty = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(bounty.storyTarget && bounty.storyTarget.id, 'npc_elroy');
  state.world.currentSectorId = bounty.destSectorId;
  missions.spawnTargetsForSector(bounty.destSectorId);
  const targetId = bounty.targetEntityIds[0];
  const target = state.entities.get(targetId);
  assert.ok(target && target.data.storyTargetId === 'npc_elroy', 'Elroy must be a physical mission target');
  state.player.targetId = targetId;
  const player = state.entities.get(state.playerId);
  player.pos.x = target.pos.x + 100;
  player.pos.z = target.pos.z;
  bus.emit('scan:completed', { targetId });
  assert.equal(bounty.params.investigationStage, 'identified');
  if (outcome === 'custody') {
    bus.emit('tether:reel', { actorId: state.playerId, targetId, before: 72, after: 60 });
  } else {
    bus.emit('entity:killed', {
      id: targetId, killerId: state.playerId, factionId: target.factionId,
      type: target.type, pos: { x: target.pos.x, z: target.pos.z }, sectorId: bounty.destSectorId,
    });
  }
  assert.equal(state.story.beatIndex, 3);
  assert.equal(state.story.flags.elroy_outcome, outcome);
}

const PHYSICAL_ROUTE = Object.freeze({
  custody: Object.freeze({
    branch: 'patrol', b3StationId: 'station_helios', b4StationId: 'station_coalition',
    program: 'patrol_guard', shipId: 'ship_drifter', factionId: 'faction_scn',
  }),
  force: Object.freeze({
    branch: 'traders', b3StationId: 'station_tethys', b4StationId: 'station_tethys',
    program: 'mine_to_depot', shipId: 'ship_drifter', factionId: 'faction_mts',
  }),
});

function completePhysicalMission(h, mission) {
  assert.ok(mission && mission.status === 'active', 'physical mission must be active');
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  assert.ok(mission.targetEntityIds.length > 0, `${mission.storyTag} must materialize physical targets`);
  for (const targetId of [...mission.targetEntityIds]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}

function completeB3(h, outcome) {
  const route = PHYSICAL_ROUTE[outcome];
  h.bus.emit('dock:docked', { stationId: route.b3StationId });
  h.bus.emit('ship:purchased', {
    defId: route.shipId, hullId: route.shipId, stationId: route.b3StationId, price: 9000,
  });
  assert.equal(h.state.story.beatIndex, 4, 'B3 requires the outcome-specific yard and tier-two hull');
}

function acceptCurrentStoryOffer(h, stationId, tagPrefix) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board.slots.find((row) => String(row.storyTag || '').startsWith(tagPrefix));
  assert.ok(offer, `missing physical story offer ${tagPrefix} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${offer.storyTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
  assert.ok(mission, `missing active mission ${offer.storyTag}`);
  return mission;
}

function completeB4(h, outcome) {
  const route = PHYSICAL_ROUTE[outcome];
  const mission = acceptCurrentStoryOffer(h, route.b4StationId, STORY_BRANCH_INTRO_TAG);
  assert.equal(h.state.story.beatIndex, 4, 'accepting B4 cannot settle the stake');
  completePhysicalMission(h, mission);
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.state.story.branch, route.branch);
}

function completeB5(h, outcome) {
  const route = PHYSICAL_ROUTE[outcome];
  const count = BRANCH_CHAIN[route.branch].count;
  for (let completed = 0; completed < count; completed++) {
    const mission = acceptCurrentStoryOffer(
      h, route.b4StationId, `campaign47a:b5:${route.branch}:${completed + 1}`,
    );
    completePhysicalMission(h, mission);
    if (completed < count - 1) assert.equal(h.state.story.beatIndex, 5);
  }
  assert.equal(h.state.story.beatIndex, 6);
}

function completeB6(h, outcome, assetId = 'seed-2') {
  const route = PHYSICAL_ROUTE[outcome];
  h.bus.emit('asset:deployed', {
    kind: 'drone', id: assetId, defId: 'drone_mk1', sectorId: 'sector_tethys_junction',
  });
  assert.equal(h.state.story.beatIndex, 6, 'deployment alone cannot settle B6');
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: assetId, templateId: route.program });
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.empire_seed_asset_id, assetId);
}

function completeB7(h, outcome) {
  const route = PHYSICAL_ROUTE[outcome];
  // The adapter gate accelerates the late-game economy/reputation prerequisite, never the story spine.
  h.state.player.credits = Math.max(100_000, h.state.player.credits || 0);
  h.state.factions[route.factionId].rep = Math.max(50, h.state.factions[route.factionId].rep || 0);
  const mission = acceptCurrentStoryOffer(h, route.b4StationId, 'campaign47a:b7:');
  completePhysicalMission(h, mission);
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.endgame, true);
}

function advanceToB5(h, branch = 'traders') {
  const { state, bus } = h;
  const outcome = branch === 'patrol' ? 'custody' : 'force';
  assert.equal(state.story.beatIndex, 0);

  // B0: mine then dock (ordered). Dock alone must not advance.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 0, 'dock alone must not advance B0');
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(state.story.beatIndex, 0, 'mine alone must not advance B0');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1, 'B0 completes on mine then dock');

  advanceEmbodiedB1B2(h, outcome);
  completeB3(h, outcome);
  completeB4(h, outcome);
  return outcome;
}

function advanceToB7(h, branch = 'traders') {
  const outcome = advanceToB5(h, branch);
  completeB5(h, outcome);
  completeB6(h, outcome);
  completeB7(h, outcome);
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
  // B1/B2 pay through their authored mission exactly once; the other beats retain story grants.
  const expected = [
    'story:cold_start',
    'story:bigger_boat',
    'story:pick_a_side',
    'story:proving_ground',
    'story:empire_seed',
  ];
  for (const reason of expected) {
    const hits = storyReasons.filter((r) => r === reason);
    assert.equal(hits.length, 1, `expected exactly one ${reason}, got ${hits.length}`);
  }
  assert.equal(storyReasons.includes('story:honest_work'), false, 'B1 must not double-pay its mission reward');
  assert.equal(storyReasons.includes('story:first_blood'), false, 'B2 must not double-pay its mission reward');
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
  // Reach and settle B4 through the force-specific physical Tethys contract.
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  advanceEmbodiedB1B2(h, 'force');
  completeB3(h, 'force');
  assert.equal(h.state.story.beatIndex, 4);

  const mission = acceptCurrentStoryOffer(h, 'station_tethys', STORY_BRANCH_INTRO_TAG);
  assert.equal(h.state.story.branch, null, 'acceptance alone does not settle the branch');
  completePhysicalMission(h, mission);
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
});

check('B5 advances only after live chain completion count', () => {
  const h = makeLiveHarness();
  advanceToB7(h, 'patrol'); // patrol chain count = 2
  // Re-run the physical custody path on a fresh route and stop at B5.
  const h2 = makeLiveHarness();
  advanceToB5(h2, 'patrol');
  assert.equal(h2.state.story.beatIndex, 5);
  assert.equal(h2.state.story.branch, 'patrol');

  const chain = BRANCH_CHAIN.patrol;
  const m0 = acceptCurrentStoryOffer(h2, 'station_coalition', 'campaign47a:b5:patrol:1');
  completePhysicalMission(h2, m0);
  assert.equal(h2.state.story.beatIndex, 5);
  assert.equal(h2.state.story.chainProgress, 1);

  const m1 = acceptCurrentStoryOffer(h2, 'station_coalition', 'campaign47a:b5:patrol:2');
  completePhysicalMission(h2, m1);
  assert.equal(h2.state.story.beatIndex, 6);
  assert.equal(h2.state.story.chainProgress, 0);
  assert.equal(chain.count, 2);
});

check('B6 requires a deployed drone with the outcome-specific automation program', () => {
  const h = makeLiveHarness();
  advanceToB5(h, 'traders');
  completeB5(h, 'force');
  assert.equal(h.state.story.beatIndex, 6);
  h.bus.emit('asset:deployed', { kind: 'drone', id: 'seed-proof', defId: 'drone_mk1' });
  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(h.state.story.flags.empire_seed_pending_id, 'seed-proof');
  h.bus.emit('automation:programAssigned', {
    kind: 'drone', id: 'seed-proof', templateId: PHYSICAL_ROUTE.force.program,
  });
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.empire_seed_asset_id, 'seed-proof');
  assert.equal(h.state.story.flags.empire_seed_variant, 'force_logistics');
});

check('B7 offers endgame; five endings with distinct consequences (fresh state each)', () => {
  const endings = ['A', 'B', 'C', 'D', 'E'];
  for (const endingId of endings) {
    const h = makeLiveHarness();
    advanceToB7(h, 'traders');
    // Force endgame offered path + empire stake (capital/claim)
    h.state.story.flags.endgame = true;
    h.state.player.credits = 100000;
    h.state.factions.faction_mts.rep = 50;
    h.state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
    h.state.claims = { bodies: [{ id: 'claim_test' }] };
    h.state.mode = 'flight';
    // Prep per-ending causal requirements
    if (endingId === 'A') {
      h.state.player.heat = 0.5;
      h.state.factions.faction_scn.rep = 50; // lawful alignment for Clean Uniform
      h.state.careers = { origins: { hunter: { status: 'completed' } } };
    }
    if (endingId === 'B') {
      h.state.factions.faction_free.rep = 50; // quiet alignment
      h.state.careers = { origins: { hauler: { status: 'completed' } } };
    }
    if (endingId === 'D') {
      h.state.player.cargo.items.cmdty_personal_ledger = 1;
      h.state.story.flags.hasLedger = true;
      h.state.world = h.state.world || {};
      h.state.world.currentSectorId = 'sector_ashfall_reach';
    }
    if (endingId === 'E') {
      h.state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
      assert.equal(COND.declinedAll(h.state, ['A', 'B', 'C', 'D']), true);
      h.state.world = h.state.world || {};
      h.state.world.currentSectorId = 'sector_ashfall_reach';
    }
    if (endingId === 'C') {
      h.state.world = h.state.world || {};
      h.state.world.currentSectorId = 'sector_ashfall_reach';
      h.state.missions.active = [];
      h.state.player.cargo.usedVolume = h.state.player.cargo.capVolume;
    }

    h.story._maybeOfferEndgame();
    assert.equal(h.state.story.endgameOffered, true);
    assert.equal(h.endgameOffers.length, 0, 'B7 must not reopen the legacy five-card modal');
    const ashfall = h.state.missions.boards.station_ashcache;
    assert.ok(ashfall, 'Ashfall board should exist');
    // Board posts only currently eligible A/B contracts (causal, not always both).
    const boardIds = ashfall.slots
      .filter((offer) => offer.storyDisposition)
      .map((offer) => offer.storyDisposition)
      .sort();
    for (const id of boardIds) assert.ok(id === 'A' || id === 'B', `board only A/B, got ${id}`);

    const heatBefore = h.state.player.heat;
    // confirm:true is the irreversible one-shot (board would stage then confirm via UI).
    h.bus.emit('ui:endgameChoose', { choice: endingId, confirm: true });
    assert.equal(h.state.story.endgameChoice, endingId);
    assert.equal(h.state.story.endgameResolved, true);

    const side = h.state.story.campaign47a;
    assert.ok(side, 'sidecar present after ending');
    assert.ok(side.sandboxMode, `sandbox mode for ${endingId}`);
    assert.ok(
      (side.receipts || []).some((r) =>
        r.kind === 'ending_resolution' || r.kind === 'ending_descriptor' || (r.endingId === endingId)),
      `ending receipt for ${endingId}`,
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
  // Start a fresh physical route and stop at B5 without direct spine mutation.
  h.missions.newGame();
  advanceToB5(h, 'traders');
  assert.equal(h.state.story.beatIndex, 5);
  const failed = acceptCurrentStoryOffer(h, 'station_tethys', 'campaign47a:b5:traders:1');
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
  h.state.factions.faction_scn.rep = 50;
  h.state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  h.state.claims = { bodies: [{ id: 'claim_test' }] };
  h.state.careers = { origins: { hunter: { status: 'completed' } } };
  h.story._maybeOfferEndgame();
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
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
