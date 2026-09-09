// PQ-032.00 — beats 1–3 are PQ-152 set pieces with physical headline verbs.
// Seed 3200. Headless. Prints beat id + headline verb.
import assert from 'node:assert/strict';
import test from 'node:test';

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
import { missions } from '../src/systems/missions.js';

const SEED = 3200;

function printSpine() {
  for (const row of listPq032SpineSetPieces()) {
    console.log(`PQ-032.00 ${row.id} ${row.headlineVerb} (${row.setPiece})`);
  }
}

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [missions], updateOrder: [] });
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

function completeSetPiece(h, mission) {
  h.state.world.currentSectorId = mission.destSectorId;
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missionsSys._ensureMissionTargets(mission);
  if (mission.type === 'demolition') {
    const tower = targetsByRole(h.state, mission, 'demolition_tower')[0];
    assert.ok(tower, 'wrecking-ball contract needs a tower');
    h.sim.bus.emit('tether:whipImpact', {
      victimId: tower.id, targetId: h.player.id, rating: 'solid', relSpeed: 80,
    });
    return;
  }
  if (mission.type === 'rescue_under_fire') {
    const pod = targetsByRole(h.state, mission, 'life_pod')[0];
    assert.ok(pod, 'pod rescue needs a life pod');
    if (![...h.state.entities.values()].some((e) => e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId)) {
      h.sim.spawn({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 80 },
      });
    }
    h.sim.bus.emit('tether:latched', { targetId: pod.id });
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  if (mission.type === 'tow_recovery') {
    const core = targetsByRole(h.state, mission, 'slag_core')[0];
    assert.ok(core, 'long tow needs a slag core');
    if (![...h.state.entities.values()].some((e) => e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId)) {
      h.sim.spawn({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 80 },
      });
    }
    h.sim.bus.emit('tether:latched', { targetId: core.id });
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  assert.fail(`unexpected type ${mission.type}`);
}

test('PQ-032.00 leftover beats 1–3 name physical headline verbs', () => {
  printSpine();
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

  const verbs = h.completed.map((row) => row.completionMethod || row.type);
  assert.ok(verbs.includes('wrecking_ball') || h.completed.some((row) => row.type === 'demolition'));
  h.sim.dispose();
});
