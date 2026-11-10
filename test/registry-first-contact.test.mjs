import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { missionCommandBrief, objectiveText } from '../src/ui/screens/missionLog.js';

const CONTRACT_47A_B2_TAG = 'campaign47a:b2:elroy';

function harness() {
  const state = createGameState(472);
  state.mode = 'flight';
  state.simTime = 30;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.player.targetId = null;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };

  let nextId = 10;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  const resolved = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('story:elroyResolved', (payload) => resolved.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.story.beatIndex = 2;
  missions._syncCampaignSidecarAfterAdvance();
  // W-BOOKS-0-2 (§34.7): the register contract posts only after the cinder board, the
  // Compost Run, and the Nest are done — stamp those steps so the departure dispatches
  // the named writ, exactly as a save resuming late in Book 2 would.
  state.story.campaign47a.stepProgress = state.story.campaign47a.stepProgress || {};
  state.story.campaign47a.stepProgress['2'] = {
    completed: ['cinder_board', 'compost', 'nest'], updatedAtS: 30,
  };

  return { state, bus, missions, player, credits, resolved };
}

function departForElroy(h) {
  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === CONTRACT_47A_B2_TAG);
  assert.ok(mission, 'departing Tethys dispatches the register writ');
  assert.equal(mission.type, 'bounty_hunt');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const elroy = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.storyTargetId === 'npc_elroy');
  assert.ok(elroy && elroy.alive, 'the named vessel is a physical mission target');
  return { mission, elroy };
}


test('Registry Writ replaces kill-only instructions with an actionable first scan', () => {
  const h = harness();
  const { mission } = departForElroy(h);
  const before = JSON.stringify(mission);
  const brief = missionCommandBrief(mission, h.state);
  assert.match(brief.what, /Identify.*scan/);
  assert.match(brief.how, /Select it.*1,200.*pulse scan/);
  assert.equal(brief.where, 'Ashfall approach · Charon Expanse');
  assert.match(brief.why, /Check the named vessel.*registry and choose/);
  assert.doesNotMatch(brief.why, /Remove|wreck|destroy/);
  assert.doesNotMatch(brief.how, /take down|deliver|dock/i);
  assert.equal(JSON.stringify(mission), before, 'presentation never identifies or resolves the contact');
});

test('only a valid close scan advances the readout; custody is a physical reel, not delivery', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  elroy.pos = { x: 1201, z: 0 };
  h.bus.emit('scan:completed', { targetId: elroy.id });
  assert.match(objectiveText(mission), /Identify/);
  elroy.pos = { x: 1200, z: 0 };
  h.bus.emit('scan:completed', { targetId: h.player.id });
  assert.match(objectiveText(mission), /Identify/);
  h.bus.emit('scan:completed', { targetId: elroy.id });
  assert.match(objectiveText(mission), /choose custody or force/);
  assert.match(missionCommandBrief(mission, h.state).how, /Civilian maintenance.*tether Elroy.*60 WU or less.*destroy/);
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: elroy.id, after: 61 });
  assert.equal(h.resolved.length, 0);
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: elroy.id, after: 60 });
  assert.equal(h.resolved.length, 1);
  assert.equal(mission.params.investigationOutcome, 'custody');
  assert.match(objectiveText(mission), /taken into custody.*resolved/);
  assert.match(missionCommandBrief(mission, h.state).how, /No station delivery/);
  assert.equal(h.credits.filter(row => row.amount === 800).length, 1);
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: elroy.id, after: 50 });
  assert.equal(h.resolved.length, 1);
  assert.equal(h.credits.filter(row => row.amount === 800).length, 1);
});

test('unscanned custody is not offered as resolved, while force still supports wreck identification', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: elroy.id, after: 50 });
  assert.equal(h.resolved.length, 0);
  assert.match(objectiveText(mission), /Identify/);
  h.bus.emit('entity:killed', { id: elroy.id, killerId: h.state.playerId });
  assert.equal(mission.params.identifiedBy, 'wreck_registry');
  assert.equal(mission.params.investigationOutcome, 'force');
  assert.match(objectiveText(mission), /destroyed.*resolved/);
  assert.equal(h.resolved.length, 1);
});

test('saved mission facts preserve readout, without another scan or an invented custody stage', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  elroy.pos = { x: 5, z: 0 };
  h.bus.emit('scan:completed', { targetId: elroy.id });
  const restored = JSON.parse(JSON.stringify(mission));
  assert.equal(missionCommandBrief(restored, h.state).how, missionCommandBrief(mission, h.state).how);
  assert.match(objectiveText(restored), /choose custody or force/);
  assert.equal(restored.params.investigationOutcome, undefined);
});

test('ordinary bounties and wrong authored identities retain their existing instructions', () => {
  const h = harness();
  const { mission } = departForElroy(h);
  for (const change of [
    { storyTag: undefined },
    { destSectorId: 'sector_tethys_junction' },
    { params: { investigationStage: 'unknown_future_stage' } },
    { storyTag: 'campaign47a:b4:doubled' },
    { storyTarget: { id: 'npc_other', role: 'register_mark' } },
    { storyTarget: { id: 'npc_elroy', role: 'other' } },
    { storyTarget: undefined },
  ]) {
    const other = { ...mission, ...change };
    assert.equal(objectiveText(other), 'Eliminate target');
    assert.match(missionCommandBrief(other).how, /take down the target/);
  }
  const cargo = { ...mission, type: 'cargo_delivery' };
  assert.match(objectiveText(cargo), /Deliver/);
});

test('unresolved archived rows and wrong-sector scans do not fabricate identification', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  elroy.pos = { x: 5, z: 0 };
  h.state.world.currentSectorId = 'sector_tethys_junction';
  h.bus.emit('scan:completed', { targetId: elroy.id });
  assert.match(objectiveText(mission), /Identify/);
  assert.equal(objectiveText({ ...mission, status: 'completed' }), 'Eliminate target');
  assert.equal(objectiveText({ ...mission, status: 'failed' }), 'Eliminate target');
});
