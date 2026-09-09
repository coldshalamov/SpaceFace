// PQ-032.00 — beats 1–3 are PQ-152 set pieces with physical headline verbs.
// Seed 3200. Headless. Prints beat id + headline verb.
import assert from 'node:assert/strict';
import test from 'node:test';

import { Masks } from '../src/core/entity.js';
import { createSimulation } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECE_HEADLINE,
  PQ032_BEAT_SET_PIECES,
  STORY_BEATS,
  listPq032SpineSetPieces,
} from '../src/data/missions.js';
import {
  buildMissionBoardContract,
  validateEmbodiedDialogue,
  validateEmbodiedMissions,
} from '../src/story/campaign47a/index.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { missions } from '../src/systems/missions.js';

const SEED = 3200;

function printSpine() {
  for (const row of listPq032SpineSetPieces()) {
    console.log(`PQ-032.00 ${row.id} ${row.headlineVerb} (${row.setPiece})`);
  }
}

function boot() {
  const sim = createSimulation({
    seed: SEED, systems: [missions, masslineImpacts], updateOrder: [],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;
  const completed = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  return { sim, state, player, completed, missionsSys: sim.registry.get('missions') };
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function targetsByRole(state, mission, role) {
  return (mission.targetEntityIds || []).map((id) => state.entities.get(id)).filter((e) => (
    e && e.alive !== false && roleOf(e) === role
  ));
}

function acceptStory(h, stationId, storyTag) {
  const board = h.missionsSys.ensureBoard(stationId);
  const offer = (board.slots || []).find((row) => row && row.storyTag === storyTag);
  assert.ok(offer, `missing ${storyTag} at ${stationId}`);
  assert.equal(h.missionsSys.acceptMission(offer.id), true, `accept ${storyTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === storyTag);
  assert.ok(mission, `active ${storyTag}`);
  return mission;
}

function ensureBerth(h, mission) {
  const found = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  if (found) return found;
  return h.sim.spawn({
    type: 'station', pos: { x: 80, z: 40 }, radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  });
}

function wuBetween(a, b) {
  return Math.round(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
}

function storyLatchDockLimitWu(station, cargo) {
  const hullR = Number(station && station.radius);
  const dockR = Number(station && station.data && station.data.dockRadius);
  const berthR = Math.max(
    Number.isFinite(hullR) && hullR > 0 ? hullR : 0,
    Number.isFinite(dockR) && dockR > 0 ? dockR : 0,
  );
  const cargoR = Number(cargo && cargo.radius);
  return berthR + (Number.isFinite(cargoR) && cargoR > 0 ? cargoR : 0) + 24;
}

// Every event below is one the SHIPPING systems emit, with the field names those emitters write.
// The mission listeners are in src/systems/missions.js (`_onPhysicalThrow`, `_onPhysicalTetherLatched`,
// `_tryPhysicalDockComplete`); the emitters are named per branch.
function completeSetPiece(h, mission) {
  h.state.world.currentSectorId = mission.destSectorId;
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  // Live equivalent: missions.update() re-runs this every 15 ticks (src/systems/missions.js:894-897).
  // This harness registers no updateOrder, so the spawn pass is called directly.
  h.missionsSys._ensureMissionTargets(mission);
  if (mission.type === 'demolition') {
    const tower = targetsByRole(h.state, mission, 'demolition_tower')[0];
    assert.ok(tower, 'wrecking-ball contract needs a tower');
    assert.ok((tower.collisionMask & Masks.ASTEROID) && (tower.collisionMask & Masks.PROJECTILE),
      'mission tower must be solid to thrown mass and shots');
    // Do NOT inject `tether:whipImpact`. Drive leftover latch / aim / release, then a leftover
    // masslineImpacts tick with the rock overlapping the tower. That emitter is the only live
    // contact. A throw that only names aimTargetId must not settle the beat.
    const impactsSys = h.sim.registry.get('masslineImpacts');
    assert.ok(impactsSys, 'leftover masslineImpacts must be on the harness');
    const rock = h.sim.spawn({
      type: 'asteroid', team: 2, radius: 6, mass: 40, hull: 60, hullMax: 60,
      pos: { x: tower.pos.x - 60, z: tower.pos.z },
      vel: { x: 0, z: 0 },
    });
    h.state.player.tether = {
      active: true, targetId: rock.id, strain: 0, load: 0,
      attachmentId: null, restLength: 0, phase: 'loaded',
    };
    h.sim.bus.emit('tether:latched', { targetId: rock.id, type: 'tether_standard' });
    impactsSys.update(1 / 60, h.state);
    const beatBeforeThrow = h.state.story.beatIndex;
    h.sim.bus.emit('massline:throw', {
      releaseId: `massline:throw:${h.state.tick}:${rock.id}`,
      payloadId: rock.id, aimTargetId: tower.id, aimSynthetic: false, mode: 'aimed',
    });
    assert.equal(h.state.story.beatIndex, beatBeforeThrow,
      'throw release must not settle wrecking_ball');
    rock.pos.x = tower.pos.x;
    rock.pos.z = tower.pos.z;
    rock.vel.x = 80;
    rock.vel.z = 0;
    h.state.player.tether.active = false;
    h.state.player.tether.targetId = null;
    impactsSys.update(1 / 60, h.state);
    const whipSettled = h.state.story.beatIndex > beatBeforeThrow;
    console.log(`PQ-032.00 whip contact settled B1: ${whipSettled ? 'yes' : 'no'}`);
    return;
  }
  if (mission.type === 'rescue_under_fire' || mission.type === 'tow_recovery') {
    const role = mission.type === 'rescue_under_fire' ? 'life_pod' : 'slag_core';
    const cargo = targetsByRole(h.state, mission, role)[0];
    assert.ok(cargo, `${mission.type} needs a ${role}`);
    const berth = ensureBerth(h, mission);
    // src/systems/tetherGameplay.js:501 emits `tether:latched` { targetId, type, ... }.
    h.sim.bus.emit('tether:latched', { targetId: cargo.id, type: 'tether_standard' });
    const dist = wuBetween(cargo, berth);
    const gate = storyLatchDockLimitWu(berth, cargo);
    const beatBeforeDock = h.state.story.beatIndex;
    console.log(`PQ-032.00 ${mission.type} story latch-dock gate ${gate} WU`);
    console.log(`PQ-032.00 ${mission.type} ${role} sits ${dist} WU from the berth at turn-in`);
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    const paidFar = h.state.story.beatIndex > beatBeforeDock;
    console.log(`PQ-032.00 ${mission.type} paid with cargo ${dist} WU away: ${paidFar ? 'yes' : 'no'}`);
    assert.equal(paidFar, false, `${role} at ${dist} WU must not settle ${mission.type}`);
    cargo.pos.x = berth.pos.x;
    cargo.pos.z = berth.pos.z;
    const near = wuBetween(cargo, berth);
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    const paidNear = h.state.story.beatIndex > beatBeforeDock;
    console.log(`PQ-032.00 ${mission.type} paid with cargo ${near} WU away: ${paidNear ? 'yes' : 'no'}`);
    assert.equal(paidNear, true, `${role} at the dest dock must settle ${mission.type}`);
    return;
  }
  assert.fail(`unexpected type ${mission.type}`);
}

test('PQ-032.00 leftover beats 1–3 name physical headline verbs', () => {
  printSpine();
  // PQ032_BEAT_SET_PIECES is DERIVED from STORY_BEATS (src/data/missions.js), so the deepEqual rows
  // and the `beat.headlineVerb === row.headlineVerb` check below are self-referential — they pin the
  // spelling of the table, not any behaviour. The load-bearing assertions in this test are the
  // buildMissionBoardContract ones: what the station board actually posts.
  assert.equal(PQ032_BEAT_SET_PIECES.length, 3);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.id), [
    'honest_work', 'first_blood', 'bigger_boat',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.headlineVerb), [
    'knock', 'pull', 'tow',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.setPiece), [
    'wrecking-ball contract', 'pod rescue under fire', 'long tow',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.physicalType), [
    'demolition', 'rescue_under_fire', 'tow_recovery',
  ]);
  for (const row of PQ032_BEAT_SET_PIECES) {
    const beat = STORY_BEATS[row.beat];
    assert.equal(beat.id, row.id);
    assert.equal(beat.headlineVerb, row.headlineVerb);
    assert.match(beat.objective, new RegExp(`^${row.headlineVerb}\\b`, 'i'));
    const offer = buildMissionBoardContract(row.beat, { seed: SEED, epoch: 1 });
    assert.ok(offer, `${row.id} must post a board contract`);
    assert.equal(offer.type, row.physicalType);
    assert.equal(offer.params.authoredSetPieceId, row.authoredSetPieceId);
    assert.equal(offer.params.completionMethods.length, 2);
    assert.match(offer.title, AUTHORED_SET_PIECE_HEADLINE);
    assert.equal(offer.title.toLowerCase().startsWith(row.headlineVerb), true);
  }
  assert.deepEqual(validateEmbodiedMissions(), { ok: true, errors: [] });
  assert.deepEqual(validateEmbodiedDialogue(), { ok: true, errors: [] });
});

test('PQ-032.00 seed 3200 plays the three set pieces as one linear spine', () => {
  printSpine();
  const h = boot();
  h.sim.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.sim.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  const b1 = acceptStory(h, 'station_helios', 'campaign47a:b1:honest_work');
  assert.equal(b1.type, 'demolition');
  assert.equal(b1.params.physicalVerb, 'knock_down');
  completeSetPiece(h, b1);
  assert.equal(h.state.story.beatIndex, 2, 'knocking the tower advances Honest Work');

  const b2 = acceptStory(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(b2.type, 'rescue_under_fire');
  assert.equal(b2.params.physicalVerb, 'pull');
  completeSetPiece(h, b2);
  assert.equal(h.state.story.beatIndex, 3, 'pulling pods advances First Blood');
  assert.equal(h.state.story.flags.elroy_outcome, undefined, 'pod rescue adds no branch choice');

  h.sim.bus.emit('ship:purchased', { defId: 'ship_drifter', stationId: 'station_tethys', price: 9000 });
  assert.equal(h.state.story.beatIndex, 3, 'a hull buy cannot settle the long tow');

  const b3 = acceptStory(h, 'station_tethys', 'campaign47a:b3:bigger_boat');
  assert.equal(b3.type, 'tow_recovery');
  assert.equal(b3.params.physicalVerb, 'tow');
  completeSetPiece(h, b3);
  assert.equal(h.state.story.beatIndex, 4, 'the long tow advances Bigger Boat');

  // Name the methods the spine actually settled on, with no `||` fallback to the mission TYPE —
  // a type is what was posted, a completionMethod is what the player did.
  assert.deepEqual(h.completed.map((row) => row.completionMethod), [
    'wrecking_ball', 'stage_tow', 'tow_in',
  ]);
  h.sim.dispose();
});
