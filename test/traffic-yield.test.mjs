import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { planCivilianTrafficYield, predictTrafficContact, TRAFFIC_YIELD_TUNING } from '../src/systems/trafficYield.js';

const DT = 1 / 60;
const PROFILE = { family: 'gravimetric', combatSpeed: 100, maxAccel: 100, maxBrakeAccel: 100 };
const AUTHORITY = { forward: 1, reverse: 1, strafe: 1, yaw: 1 };
function body(id, x, z, vx, vz, extra = {}) {
  return { id, type: 'ship', team: 2, alive: true, collides: true, occupantGeneration: id,
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, radius: 5,
    data: { trafficRole: 'hauler', ai: { passive: true }, intent: { moveZ: 0.5, aimAngle: 0 } }, ...extra };
}
function fixture() {
  const ship = body(2, 0, 10, 50, 0), player = body(1, -100, 0, 100, 0, { team: 0, isPlayer: true });
  const state = { mode: 'flight', tick: 100, playerId: player.id, world: { currentSectorId: 'sector_test' },
    entityList: [ship, player], entities: new Map([[ship.id, ship], [player.id, player]]) };
  const input = { throttle: 0.5, strafe: 0, boost: false };
  return { ship, player, state, input };
}
const plan = h => planCivilianTrafficYield(h.state, h.ship, h.ship.data.intent, h.input, PROFILE, AUTHORITY);

test('swept-circle contact prediction is relative, rejects receding paths, and reports initial overlap', () => {
  const self = { pos: { x: 0, z: 0 }, radius: 5 }, other = { pos: { x: 100, z: 10 }, vel: { x: 0, z: 0 }, radius: 5 };
  const p = predictTrafficContact(self, other, { x: 60, z: 0 });
  assert.ok(p && p.time > 1 && p.time < 2);
  assert.equal(p.overlap, false);
  const shifted = predictTrafficContact({ ...self, pos: { x: 1234, z: -877 } },
    { ...other, pos: { x: 1334, z: -867 }, vel: { x: 300, z: -120 } }, { x: 360, z: -120 });
  assert.deepEqual(shifted, p, 'common coast and translated origins do not change relative contact');
  assert.equal(predictTrafficContact(self, other, { x: -60, z: 0 }), null);
  assert.equal(predictTrafficContact(self, { ...other, pos: { x: 5, z: 0 } }, { x: 60, z: 0 }).overlap, true);
});

test('an ambient civilian yields through a bounded target without mutating its route or either body', () => {
  const h = fixture(), snapshot = structuredClone(h);
  const result = plan(h);
  assert.equal(result.active, true);
  assert.equal(result.otherId, h.player.id);
  assert.ok(result.velocity.z > 0, 'the slower ship makes room on its existing miss side');
  assert.ok(Math.hypot(result.velocity.x - 50, result.velocity.z) <= PROFILE.combatSpeed * TRAFFIC_YIELD_TUNING.maximumSpeedCorrectionFraction);
  assert.deepEqual(h, snapshot);
  assert.deepEqual(plan(structuredClone(h)), result, 'reload needs no hidden latch to reconstruct the command');
});

test('lateral safety requests and diagonal inputs retain the normal cruise envelope', () => {
  for (const diagonal of [false, true]) {
    const h = fixture();
    h.ship.pos.z = 0; h.input.throttle = 1; h.input.strafe = diagonal ? 1 : 0;
    h.ship.vel = diagonal ? { x: 100 / Math.SQRT2, z: 100 / Math.SQRT2 } : { x: 100, z: 0 };
    h.player.pos = diagonal ? { x: 100, z: 100 } : { x: 150, z: 0 };
    h.player.vel = { x: 0, z: 0 };
    const result = plan(h);
    assert.equal(result.active, true);
    assert.ok(Math.hypot(result.velocity.x, result.velocity.z) <= PROFILE.combatSpeed + 1e-8);
  }
});

test('identity, movement ownership, phase and extracted thrust all fail closed', () => {
  const cases = [
    h => { h.ship.data.ai = null; },
    h => { delete h.ship.data.trafficRole; },
    h => { h.ship.data.ai.passive = false; },
    h => { h.ship.team = 1; },
    h => { h.ship.data.missionId = 'mission:script'; },
    h => { h.ship.data.scenarioActorId = 'scripted'; },
    h => { h.ship.data.activityActorSlotId = 'authored'; },
    h => { h.ship.data.worldSiteTrafficHookId = 'route'; },
    h => { h.ship.data.itinerary = { kind: 'anvil_work' }; },
    h => { h.ship.data.jobId = 'job:worker'; },
    h => { h.ship.data.towTargetId = 99; },
    h => { h.ship.data.ai.activity = { kind: 'flee' }; },
    h => { h.ship.data.ai.securityTargetId = 1; },
    h => { h.ship.data.combat = { targetId: 1 }; },
    h => { h.ship.data.intent.boost = true; },
    h => { h.ship.data.intent.fire = true; },
    h => { h.ship.data.intent.brake = true; },
    h => { h.ship.disabled = true; },
    h => { h.ship.data.recoveringUntil = 10; },
    h => { h.state.combat = { entities: { '2': { statuses: { status_tumbling: { id: 'status_tumbling' } } } } }; },
    h => { h.state.mode = 'docked'; },
    h => { h.state.run = { kind: 'survival', phase: 'active' }; },
    h => { h.ship.data.sectorId = 'sector_elsewhere'; },
    h => { h.state.entities.set(h.ship.id, { ...h.ship, occupantGeneration: 200 }); },
  ];
  for (const alter of cases) {
    const h = fixture(); alter(h);
    assert.equal(plan(h).active, false, alter.toString());
  }
  const h = fixture();
  assert.equal(planCivilianTrafficYield(h.state, h.ship, { ...h.ship.data.intent }, h.input, PROFILE, AUTHORITY).active, false);
  assert.deepEqual(planCivilianTrafficYield(h.state, h.ship, h.ship.data.intent, h.input, PROFILE,
    { ...AUTHORITY, strafe: 0 }), { active: false, reason: 'no-authority' });
  h.state.entities.delete(h.player.id);
  assert.equal(plan(h).active, false, 'a stale spatial result cannot supply a threat after its life has left');
});

test('only an eligible civilian participates in right of way, independent of list order', () => {
  const h = fixture();
  h.state.playerId = -1; h.player.isPlayer = false; h.player.team = 2;
  const first = plan(h);
  assert.equal(first.active, true);
  h.state.entityList.reverse();
  assert.deepEqual(plan(h), first);
  assert.equal(planCivilianTrafficYield(h.state, h.player, h.player.data.intent,
    { throttle: 1, strafe: 0 }, PROFILE, AUTHORITY).active, false);
  // A high-ID manual or scripted motor cannot be assumed to perform the reciprocal maneuver.
  h.player.id = 10; h.player.data.missionId = 'mission:route';
  h.state.entities.delete(1); h.state.entities.set(10, h.player);
  assert.equal(plan(h).active, true);
});

test('a candidate cannot steer into an otherwise clear neighbouring body', () => {
  const h = fixture();
  const open = plan(h);
  assert.equal(open.active, true);
  const blocker = body(8, 55, 32, 0, 0, { type: 'asteroid', radius: 10, data: {} });
  assert.ok(predictTrafficContact({ ...h.ship, radius: 5 }, blocker, open.velocity), 'the obstacle actually occupies the proposed path');
  assert.equal(predictTrafficContact({ ...h.ship, radius: 5 }, blocker, { x: 50, z: 0 }), null, 'the original path clears it');
  h.state.entities.set(blocker.id, blocker); h.state.entityList.push(blocker);
  const constrained = plan(h);
  if (constrained.active) {
    assert.equal(predictTrafficContact({ ...h.ship, radius: 5 }, { ...blocker, radius: 10 }, constrained.velocity), null);
  }
  assert.notDeepEqual(constrained.velocity, open.velocity, 'the open-lane command is reconsidered when its lane is occupied');
});

test('traffic brakes through the same servo when both lateral escape paths are occupied', () => {
  const h = fixture();
  h.ship.pos.z = 0; h.ship.vel.x = 100; h.input.throttle = 1;
  h.player.pos = { x: 150, z: 0 }; h.player.vel = { x: 0, z: 0 };
  for (const z of [-30, 30]) {
    const wall = body(z < 0 ? 8 : 9, 70, z, 0, 0, { type: 'asteroid', radius: 10, data: {} });
    h.state.entities.set(wall.id, wall); h.state.entityList.push(wall);
  }
  const result = plan(h);
  assert.equal(result.active, true);
  assert.ok(result.velocity.x < 100);
  assert.equal(result.velocity.z, 0, 'braking does not spend clearance in an occupied side lane');
});

test('pre-contact guidance reports existing overlap and limited authority without disguising either as a safe separation', () => {
  const h = fixture();
  h.player.pos.x = 0;
  assert.deepEqual(plan(h), { active: false, reason: 'existing-overlap' });
  h.player.pos.x = -30;
  const limited = planCivilianTrafficYield(h.state, h.ship, h.ship.data.intent, h.input, PROFILE,
    { ...AUTHORITY, strafe: 0.01 });
  assert.equal(limited.active, true);
  assert.equal(limited.reason, 'authority-limited');
  assert.ok(Math.hypot(limited.velocity.x - 50, limited.velocity.z) <= 1);
});

async function nativeOvertake({ marked = true, offset = 0 } = {}) {
  const state = createGameState(100), bus = createBus();
  const player = { ...makeShipEntitySpec('ship_kestrel', { team: 0, isPlayer: true,
    pos: { x: offset - 200, z: offset } }), id: 1, alive: true, collides: true };
  const ship = { ...makeShipEntitySpec('ship_hornet', { team: 2,
    pos: { x: offset, z: offset + 10 }, ai: { passive: true, archetype: 'fleeing_trader' } }),
    id: 2, alive: true, collides: true };
  if (marked) ship.data.trafficRole = 'hauler';
  player.vel = { x: 195, z: 0 }; ship.vel = { x: 92.4, z: 0 };
  player.rot = ship.rot = 0; player.angVel = ship.angVel = 0;
  state.mode = 'flight'; state.playerId = player.id;
  state.world.currentSectorId = 'sector_yield_fixture';
  state.entities = new Map([[player.id, player], [ship.id, ship]]); state.entityList = [player, ship];
  state.settings = { gameplay: { physicsBackend: 'rapier-dynamic' } };
  state.input = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, brake: false, fire: false };
  ship.data.intent = { moveX: 0, moveZ: 0.55, aimAngle: 0, boost: false, brake: false, fire: false };
  const profile = resolvePropulsionProfile(ship, state);
  const flight = Object.create(flightV3); flight.init({ state, bus, helpers: {} });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: true, fixedDt: DT });
  let contacts = 0, activeTicks = 0, maxSideAcceleration = 0, minSeparation = Infinity, unchangedBeforeStep = true;
  try {
    owner.syncFromEntities([player, ship]);
    for (let tick = 0; tick < 360; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      const pose = [player.pos.x, player.pos.z, player.vel.x, player.vel.z, ship.pos.x, ship.pos.z, ship.vel.x, ship.vel.z];
      flight.update(DT, state);
      unchangedBeforeStep &&= pose.every((v, i) => v === [player.pos.x, player.pos.z, player.vel.x, player.vel.z, ship.pos.x, ship.pos.z, ship.vel.x, ship.vel.z][i]);
      if (ship._flightFrame?.trafficYield?.active) activeTicks++;
      owner.step(DT);
      contacts += owner.drainContactImpacts().length;
      const telemetry = readPhysicsTelemetry(ship);
      maxSideAcceleration = Math.max(maxSideAcceleration, Math.abs(telemetry.force.z) / telemetry.mass);
      minSeparation = Math.min(minSeparation, Math.hypot(player.pos.x - ship.pos.x, player.pos.z - ship.pos.z));
    }
    return { contacts, activeTicks, maxSideAcceleration, maxAllowed: profile.maxAccel,
      minSeparation, unchangedBeforeStep, playerSpeed: Math.hypot(player.vel.x, player.vel.z),
      relativeX: player.pos.x - ship.pos.x, finalSideSpeed: ship.vel.z };
  } finally { owner.dispose(); }
}

test('a real ambient hull yields before an overtake, then resumes cruise through native propulsion and collision ownership', async t => {
  const result = await nativeOvertake();
  t.diagnostic(JSON.stringify(result));
  assert.ok(result.activeTicks > 0, 'the civilian must actually request the maneuver');
  assert.equal(result.contacts, 0);
  assert.equal(result.unchangedBeforeStep, true, 'flight guidance cannot move a body before the physics owner steps');
  assert.ok(result.maxSideAcceleration > 0 && result.maxSideAcceleration <= result.maxAllowed + 1e-4);
  assert.ok(result.relativeX > 200, 'the faster ship completes its pass');
  assert.ok(Math.abs(result.playerSpeed - 195) < 0.1, 'no hidden player compensation');
  assert.ok(Math.abs(result.finalSideSpeed) < 1, 'ordinary cruise recovers once the traffic passes');
  const translated = await nativeOvertake({ offset: 12000 });
  assert.equal(translated.contacts, 0);
  assert.ok(Math.abs(translated.playerSpeed - result.playerSpeed) < 0.01);
});

test('an unmarked scripted motor retains the forced contact path for independent collision proofs', async t => {
  const result = await nativeOvertake({ marked: false });
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.activeTicks, 0);
  assert.ok(result.contacts > 0, 'this is a physical contact proof, unlike successful avoidance');
});
