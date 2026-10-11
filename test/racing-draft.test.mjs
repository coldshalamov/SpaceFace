import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { racingWake, stepRacingDraft, RACING_DRAFT } from '../src/missions/racingDraft.js';
import { racingAssistIntents, readRaceTape } from '../src/systems/racingSteer.js';

function fixture() {
  const state = createGameState(904), bus = createBus(), helpers = {};
  Object.create(core).init({ state, bus, helpers });
  state.mode = 'flight'; state.simTime = 1; state.world.currentSectorId = 'sector_helios_prime';
  const craft = (x, isPlayer = false) => helpers.spawnEntity({ type: 'ship', pos: { x, z: 0 },
    vel: { x: 160, z: 0 }, rot: 0, radius: 14, mass: 25, isPlayer,
    physicsBody: { dynamic: true, mass: 25, radius: 14 }, data: { name: 'Leader' } });
  const follower = craft(0, true), leader = craft(170); state.playerId = follower.id;
  const mission = { id: 'draft-heat', type: 'race', status: 'active', params: {
    raceMode: 'race', raceStartSimS: 0, courseSectorId: state.world.currentSectorId } };
  state.missions.active = [mission];
  const entrants = [follower, leader].map(entity => ({ entity, status: 'racing' }));
  return { state, helpers, follower, leader, mission, entrants };
}
const impulseX = entity => (consumePhysicsCommand(entity)?.impulses || []).reduce((sum, row) => sum + row.x, 0);

test('the scripted pace light cannot award artificial drafting, including from an old saved pulse', () => {
  const { follower } = fixture(), gates = [{ x: 0, z: 0 }, { x: 1000, z: 0 }];
  for (const raceMode of ['race', 'cup', 'time-trial']) {
    const params = { racingKind: 'draft', raceMode, raceStartSimS: 0, nextGate: 1, draftNextSimS: 100 };
    assert.deepEqual(racingAssistIntents({ params, player: follower, simTime: 0, gatesGlobal: gates }).impulses, []);
    assert.equal(readRaceTape(params, follower, gates, 0).drafting, false);
  }
});

test('wake requires matched forward motion behind a safe gap, with bounded speed headroom', () => {
  const { follower, leader } = fixture();
  assert.ok(racingWake(follower, leader).gain > 0.9);
  follower.pos.z = 90; assert.equal(racingWake(follower, leader).gain, 0);
  follower.pos.z = 0; follower.pos.x = 190; assert.equal(racingWake(follower, leader).gain, 0);
  follower.pos.x = 150; assert.equal(racingWake(follower, leader).gain, 0);
  follower.pos.x = 0; follower.vel.x = -160; assert.equal(racingWake(follower, leader).gain, 0);
  follower.vel.x = 160; follower.rot = Math.PI; assert.equal(racingWake(follower, leader).gain, 0);
  follower.rot = 0; follower.vel.x = 160 + RACING_DRAFT.speedAdvantage;
  assert.equal(racingWake(follower, leader).gain, 0);
});

test('draft enters through physics once per tick, cannot stack leaders, and stops for brake or a blocking body', () => {
  const f = fixture(), { state, mission, entrants, follower, helpers } = f;
  stepRacingDraft(state, mission, entrants, 1 / 60);
  const before = JSON.stringify(follower.vel);
  stepRacingDraft(state, mission, entrants, 1 / 60);
  const gain = impulseX(follower); assert.ok(gain > 0 && gain < 25 * 18 / 60);
  assert.equal(JSON.stringify(follower.vel), before, 'observer never writes velocity');
  state.simTime += 1 / 60; state.input.brake = true;
  stepRacingDraft(state, mission, entrants, 1 / 60); assert.equal(impulseX(follower), 0);
  assert.equal(mission.params.raceDraft.strength, 0);
  state.input.brake = false;
  const rock = helpers.spawnEntity({ type: 'asteroid', pos: { x: 80, z: 0 }, radius: 22, collides: true });
  state.simTime += 1 / 60; stepRacingDraft(state, mission, entrants, 1 / 60);
  assert.equal(impulseX(follower), 0);
  helpers.removeEntity(rock.id, { immediate: true });
  entrants[1].status = 'finished'; state.simTime += 1 / 60;
  stepRacingDraft(state, mission, entrants, 1 / 60); assert.equal(impulseX(follower), 0);
  entrants[1].status = 'racing'; mission.params.raceMode = 'time-trial'; state.simTime += 1 / 60;
  stepRacingDraft(state, mission, entrants, 1 / 60); assert.equal(impulseX(follower), 0);
});

test('physical dressing blocks the wake and menu transitions erase its presentation', () => {
  const { state, mission, entrants, follower } = fixture();
  state.world.dressing = { rows: [{ id: 99, type: 'wreck', alive: true, collides: true,
    pos: { x: 90, z: 0 }, radius: 30, physicsBody: { dynamic: false, mass: 100000, radius: 30 } }] };
  stepRacingDraft(state, mission, entrants, 1 / 60); assert.equal(impulseX(follower), 0);
  state.mode = 'menu'; state.simTime += 1 / 60; stepRacingDraft(state, mission, entrants, 1 / 60);
  assert.equal(mission.params.raceDraftWakes.length, 0); assert.equal(mission.params.raceDraft.strength, 0);
});

test('raw reverse and every explicit stop command immediately break the draft', () => {
  for (const input of [{ moveZ: -1 }, { throttle: -1 }, { fullStop: true }, { flipBurn: true }, { actions: { brake: true } }]) {
    const { state, mission, entrants, follower } = fixture();
    stepRacingDraft(state, mission, entrants, 1 / 60); assert.ok(impulseX(follower) > 0);
    state.input = input; state.simTime += 1 / 60;
    stepRacingDraft(state, mission, entrants, 1 / 60);
    assert.equal(impulseX(follower), 0, JSON.stringify(input));
    assert.equal(mission.params.raceDraft.strength, 0);
  }
  const { state, mission, entrants, follower } = fixture();
  state.playerId = -1; follower.data.intent = { moveZ: -1, brake: false };
  stepRacingDraft(state, mission, entrants, 1 / 60);
  assert.equal(impulseX(follower), 0, 'rival counterthrust must not fight draft propulsion');
});

test('native bodies gain earned forward speed while matched control and leader keep their momentum', async () => {
  const { state, mission, entrants, follower, leader, helpers } = fixture();
  const control = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 500 }, vel: { x: 160, z: 0 },
    radius: 14, mass: 25, physicsBody: { dynamic: true, mass: 25, radius: 14 } });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    owner.syncFromEntities([follower, leader, control]);
    for (let i = 0; i < 120; i++) {
      state.tick = i; state.simTime = 1 + i / 60;
      stepRacingDraft(state, mission, entrants, 1 / 60); owner.step(1 / 60, i);
    }
    assert.ok(follower.vel.x > control.vel.x + 10, JSON.stringify({speed:follower.vel.x,control:control.vel.x,
      leader:leader.vel,pos:follower.pos,leadPos:leader.pos,rot:follower.rot,draft:mission.params.raceDraft,seconds:mission.params.raceDraftSeconds}));
    assert.ok(follower.vel.x <= leader.vel.x + RACING_DRAFT.speedAdvantage + 0.4);
    assert.ok(follower.pos.x > control.pos.x + 8);
    assert.ok(Math.abs(leader.vel.x - control.vel.x) < 0.01);
    assert.equal(owner.drainContactImpacts().length, 0);
    console.log(JSON.stringify({ draftSpeed: follower.vel.x, controlSpeed: control.vel.x,
      earnedDistanceWU: follower.pos.x - control.pos.x, draftSeconds: mission.params.raceDraftSeconds }));
  } finally { owner.dispose(); }
});
