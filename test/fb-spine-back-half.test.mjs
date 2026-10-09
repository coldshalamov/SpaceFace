// FB-063 — the back half of the spine (B4–B7) rides the authored step machine, and a player who
// fails a proving leg hears the authored recovery line once the beat re-arms.
//
// What this pins, on the live route (missions + story + heat over a real bus, seed 4242):
//   1. The eight-beat walk B0→B7 advances only through authored accept signals — the sidecar's
//      per-beat step rows (requiresPrior/accept) are what gate story:beatAdvanced, in order.
//   2. A scripted beat-5 failure puts the sidecar in 'failed', speaks NO rearm line while the
//      cooldown holds, then speaks CAMPAIGN_BEATS[5].recovery.line exactly once on the rearm
//      signal (dock:docked) — through the one-voice comms path — and the chain resumes.
//
// Run: node --test test/fb-spine-back-half.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  CAMPAIGN_BEATS,
  BRANCH_CHAIN,
  FAIL_RECOVERY_COOLDOWN_S,
  beatDefAt,
  getBeatStepStatus,
  isBeatStepsComplete,
} from '../src/story/campaign47a/index.js';

const SEED = 4242;

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

function makeHarness(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
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
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const beatAdvances = [];
  const commsPopups = [];
  const voiceLines = [];
  const grantCredits = [];
  const repDeltas = [];
  bus.on('story:beatAdvanced', (p) => beatAdvances.push(p));
  bus.on('comms:popup', (p) => commsPopups.push(p));
  bus.on('economy:grantCredits', (p) => {
    grantCredits.push(p);
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });
  bus.on('faction:repDelta', (p) => {
    repDeltas.push(p);
    if (!p || !p.factionId) return;
    const f = state.factions[p.factionId] || (state.factions[p.factionId] = { rep: 0 });
    f.rep = (f.rep || 0) + (p.delta || 0);
  });

  const helpers = {
    mulberry32,
    voice: { say: (line) => { voiceLines.push(line); return true; } },
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
    get: (name) => (name === 'missions' ? missions
      : name === 'story' ? story
        : name === 'heat' ? heat : null),
  };
  const ctx = { state, bus, helpers, registry };
  missions.init(ctx);
  story.init(ctx);
  heat.init(ctx);
  missions.newGame();
  story._ensureState(true);

  return { state, bus, missions, story, heat, helpers, beatAdvances, commsPopups, voiceLines, grantCredits, repDeltas };
}

// ── The live-route walk (the same physical mechanics story-campaign47a-live proves). ─────────

function acceptEmbodiedOffer(h, stationId, expectedTag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((c) => c && c.storyTag === expectedTag);
  assert.ok(offer, `missing authored offer ${expectedTag} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${expectedTag}`);
  const mission = h.state.missions.active.find((c) => c.storyTag === expectedTag);
  assert.ok(mission, `missing active mission ${expectedTag}`);
  return mission;
}

function acceptStoryOffer(h, stationId, tagPrefix) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board.slots.find((row) => String(row.storyTag || '').startsWith(tagPrefix));
  assert.ok(offer, `missing story offer ${tagPrefix} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${offer.storyTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
  assert.ok(mission, `missing active mission ${offer.storyTag}`);
  return mission;
}

function completeSpineSetPiece(h, mission) {
  assert.ok(mission && mission.status === 'active', 'set piece must be active');
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  if (mission.type === 'demolition' || mission.type === 'authored_set_piece') {
    const role = mission.type === 'authored_set_piece'
      ? (mission.params && mission.params.primaryRole)
      : null;
    const targetId = role
      ? mission.targetEntityIds
        .map((id) => h.state.entities.get(id))
        .find((e) => e && e.data && e.data.physicalRole === role).id
      : mission.targetEntityIds[0];
    assert.ok(targetId, `${mission.type} needs a physical target`);
    h.bus.emit('tether:whipImpact', {
      victimId: targetId, targetId: h.state.playerId, rating: 'solid', relSpeed: 90,
    });
    return;
  }
  if (mission.type === 'rescue_under_fire' || mission.type === 'tow_recovery') {
    const role = mission.type === 'rescue_under_fire' ? 'life_pod' : 'slag_core';
    const target = mission.targetEntityIds
      .map((id) => h.state.entities.get(id))
      .find((e) => e && e.data && e.data.physicalRole === role);
    assert.ok(target, `${mission.type} needs ${role}`);
    let berth = [...h.state.entities.values()].find((e) => (
      e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
    ));
    if (!berth) {
      berth = h.helpers.spawnEntity({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 80 },
      });
    }
    h.bus.emit('tether:latched', { targetId: target.id });
    target.pos = { x: berth.pos.x, z: berth.pos.z };
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  completePhysicalMission(h, mission);
}

function completePhysicalMission(h, mission) {
  assert.ok(mission && mission.status === 'active', 'physical mission must be active');
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  if (mission.type === 'smuggling_run') {
    const qty = Math.max(1, mission.params.qty || 1);
    const loaded = addCargo(h.state, mission.params.cmdtyId, qty);
    assert.equal(loaded, qty, `${mission.storyTag} contraband must fit the hold`);
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  assert.ok(mission.targetEntityIds.length > 0, `${mission.storyTag} must materialize targets`);
  for (const targetId of [...mission.targetEntityIds]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}

function completeB0(h) {
  const { state, bus } = h;
  assert.equal(state.story.beatIndex, 0);
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1, 'B0 completes on ordered mine then dock');
}

/** The live B1→B4 route (no outcome token — the pod-rescue route of the running game). */
function advanceB1ToB5(h) {
  const { state, bus } = h;
  assert.equal(state.story.beatIndex, 1);

  completeSpineSetPiece(h, acceptEmbodiedOffer(h, 'station_helios', 'campaign47a:b1:honest_work'));
  assert.equal(state.story.beatIndex, 2);
  const rescue = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(rescue.type, 'rescue_under_fire');
  completeSpineSetPiece(h, rescue);
  assert.equal(state.story.beatIndex, 3);

  bus.emit('ship:purchased', {
    defId: 'ship_drifter', hullId: 'ship_drifter', stationId: 'station_tethys', price: 9000,
  });
  assert.equal(state.story.beatIndex, 3, 'a hull buy cannot settle the long tow');
  completeSpineSetPiece(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:bigger_boat'));
  assert.equal(state.story.beatIndex, 4);

  const intro = acceptStoryOffer(h, 'station_tethys', STORY_BRANCH_INTRO_TAG);
  assert.equal(state.story.branch, null, 'accepting the intro only pends the branch');
  completePhysicalMission(h, intro);
  assert.equal(state.story.branch, 'traders');
  assert.equal(state.story.beatIndex, 5);
}

function completeB5Chain(h) {
  const count = BRANCH_CHAIN.traders.count;
  for (let completed = 0; completed < count; completed++) {
    const mission = acceptStoryOffer(h, 'station_tethys', `campaign47a:b5:traders:${completed + 1}`);
    completePhysicalMission(h, mission);
    if (completed < count - 1) assert.equal(h.state.story.beatIndex, 5);
  }
  assert.equal(h.state.story.beatIndex, 6);
}

function completeB6(h) {
  h.bus.emit('asset:deployed', {
    kind: 'drone', id: 'seed-live', defId: 'drone_mk1', sectorId: 'sector_helios_prime',
  });
  assert.equal(h.state.story.beatIndex, 6, 'deployment alone cannot settle B6');
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-live', templateId: 'mine_to_depot' });
  assert.equal(h.state.story.beatIndex, 7);
}

function completeB7(h) {
  h.state.player.credits = Math.max(250_000, h.state.player.credits || 0);
  for (const factionId of ['faction_scn', 'faction_mts', 'faction_free']) {
    h.state.factions[factionId].rep = Math.max(80, h.state.factions[factionId].rep || 0);
  }
  h.missions.update(0.016, h.state);
  assert.equal(h.state.story.flags.endgame, undefined, 'net worth alone must not bypass the climax');
  const board = h.missions.ensureBoard('station_ashcache');
  const ops = board.slots.filter((row) => String(row.storyTag || '').startsWith('campaign47a:b7:'));
  assert.equal(ops.length, 1, 'exactly one authored Deep Reach op posts');
  const mission = acceptStoryOffer(h, 'station_ashcache', 'campaign47a:b7:');
  completeSpineSetPiece(h, mission);
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.endgame, true);
}

// ── Tests ──────────────────────────────────────────────────────────────────────────────────

test('FB-063: the eight-beat walk on seed 4242 advances only through authored steps', () => {
  const h = makeHarness();
  const sidecar = () => h.state.story.campaign47a;

  // B0's ordered recipe: dock alone and mine alone cannot advance; the sidecar records each step.
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0, 'dock before mine must not advance B0');
  assert.equal(isBeatStepsComplete(h.state, 0), false);
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(h.state.story.beatIndex, 0, 'mine without the dock step must not advance B0');
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  // B4's authored step is a mission:accepted carrying the branch-intro tag — nothing else counts.
  advanceB1ToB5(h);
  const b4 = getBeatStepStatus(h.state, 4);
  assert.equal(b4.stepsComplete, true, 'B4 recorded its authored accept step');
  assert.deepEqual(b4.completed, ['branch_intro_accept']);

  // B5's authored step requires the chain count, not any mission:completed.
  completeB5Chain(h);
  const b5 = getBeatStepStatus(h.state, 5);
  assert.equal(b5.stepsComplete, true);
  assert.deepEqual(b5.completed, ['chain_complete']);

  completeB6(h);
  const b6 = getBeatStepStatus(h.state, 6);
  assert.deepEqual(b6.completed, ['asset_deploy']);

  completeB7(h);
  assert.equal(h.state.story.beatIndex, 7);

  // Ordered advances only — each canonical beat fires once, in sequence, off the authored steps.
  const froms = h.beatAdvances.map((p) => p.fromIndex);
  for (let i = 0; i <= 6; i++) {
    assert.equal(froms.filter((f) => f === i).length, 1, `beat ${i} advanced exactly once`);
  }
  assert.deepEqual(
    froms.slice(0, 7),
    [0, 1, 2, 3, 4, 5, 6],
    'beats advance in authored order',
  );
  assert.equal(sidecar().observedBeatIndex, 7, 'the sidecar tracks the canonical B7 cursor');
  assert.equal(beatDefAt(7).observeOnly, true, 'B7 is observe-only — the sidecar owns no completion');
});

test('FB-063: a scripted beat-5 failure speaks the authored recovery line once, after cooldown', () => {
  const h = makeHarness();
  completeB0(h);
  advanceB1ToB5(h);
  const recoveryLine = CAMPAIGN_BEATS[5].recovery.line;
  assert.ok(recoveryLine, 'beat 5 carries an authored recovery line');
  const heard = () => h.commsPopups.filter((p) => p && p.text === recoveryLine);

  // A non-chain completion cannot satisfy the authored step; a chain failure fails the beat.
  const leg = acceptStoryOffer(h, 'station_tethys', 'campaign47a:b5:traders:1');
  h.missions._failMission(leg, h.state.missions.active.indexOf(leg), 'proving_failure');
  const own = h.state.story.campaign47a;
  assert.equal(own.beatStatus, 'failed');
  assert.equal(own.failuresByBeat['5'], 1);
  assert.equal(h.state.story.beatIndex, 5, 'failure never advances the cursor');
  // The failure-time missions line is a different authored row; the rearm line has not spoken.
  assert.equal(heard().length, 0, 'no rearm line while the cooldown holds');

  // Cooldown is real: an immediate rearm signal stays silent.
  h.state.simTime += 1;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(heard().length, 0);
  assert.equal(own.beatStatus, 'failed');

  // After the cooldown, the authored rearmOn signal recovers the beat and speaks its line once —
  // through the voice arbiter and onto the comms feed, with a story fact receipt.
  h.state.simTime += FAIL_RECOVERY_COOLDOWN_S + 1;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.story.update(0.016, h.state);
  assert.equal(heard().length, 1, 'exactly one authored recovery line');
  const line = heard()[0];
  assert.equal(line.sender, beatDefAt(5).title);
  assert.equal(line.category, 'story');
  assert.ok(h.voiceLines.some((v) => v && String(v.text).includes(recoveryLine)),
    'the one-voice arbiter voiced the recovery line');
  assert.equal(own.beatStatus, 'tracking', 'the beat re-armed');
  assert.equal(h.state.story.seenComms['story_recovery_5_1'], true);
  assert.ok(h.state.story.facts.some((f) => f.id === 'story_recovery_5_1' && f.kind === 'recovery'));

  // It does not repeat: another dock keeps the once-per-failure count.
  h.state.simTime += 30;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.story.update(0.016, h.state);
  assert.equal(heard().length, 1);

  // Recovery is real, not cosmetic: the proving chain still completes the beat.
  completeB5Chain(h);
  completeB6(h);
  completeB7(h);
  assert.equal(h.state.story.beatIndex, 7);
});
