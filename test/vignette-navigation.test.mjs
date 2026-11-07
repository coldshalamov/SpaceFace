import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createSimulation } from '../src/core/sim.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { movementForActivity } from '../src/ai/doctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';

function fixture() {
  const sim = createSimulation({ seed: 2011, systems: [aiPorts] });
  sim.state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', alive: true, team: 0, pos: { x: 400, z: 0 },
    radius: 18, mass: 70, hull: 100, hullMax: 100, collides: true, data: {} });
  sim.state.playerId = player.id;
  const actor = sim.spawn({ type: 'ship', alive: true, team: 2, pos: { x: 0, z: 0 },
    vel: { x: 70, z: 0 }, radius: 18, mass: 70, hull: 100, hullMax: 100, collides: true,
    data: { ai: { passive: true, roe: 'hold_fire', squadId: 'courtesy' }, intent: {} } });
  const live = { id: 'courtesy', vars: {}, anchor: { x: 0, z: 0 } };
  const runtime = compileVignette({ id: 'courtesy', phases: [
    { id: 'hold', verb: 'motion', seconds: 60, motion: 'hold', next: 'done' },
    { id: 'done', verb: 'resolve' },
  ] });
  const director = { now: () => 0, player: () => player, entsOf: () => [actor] };
  runtime.fire(director, live, sim.state);
  return { sim, player, actor, runtime, director, live };
}

test('vignette destination enters the existing passive tactical helm without faction-combat defaults', () => {
  const h = fixture();
  const { sim, actor } = h;
  assert.equal(sim.helpers.aiRoster.listSquads(0).some(s => s.members.some(m => m.id === actor.id)), false);
  h.runtime.tick(h.director, h.live, sim.state, 1);
  assert.equal(actor.data.ai.passive, true);
  assert.equal(actor.data.ai.roe, 'hold_fire');
  assert.equal(actor.data.ai.allowPassiveManeuver, true);
  assert.equal(actor.data.ai.factionPresenceDoctrine, undefined);
  assert.deepEqual(actor.data.ai.activity.anchor, { x: 240, z: 0 });
  assert.equal(actor.data.intent.moveZ, undefined, 'choreography must not bypass collision-aware helm with raw thrust');
  assert.ok(sim.helpers.aiRoster.listSquads(1).some(s => s.members.some(m => m.id === actor.id)));
  assert.deepEqual(authorizeAIEngagement({ state: sim.state, self: actor, target: h.player, tick: 1,
    actionKind: 'fire', offensive: true }), { ok: false, reason: 'passive' });
});

test('vignette helm actually steers and brakes for scenery and slowly moving freight', () => {
  for (const velocity of [0, 6]) {
    const h = fixture();
    const obstacle = h.sim.spawn({ type: 'wreck', alive: true, pos: { x: 90, z: 0 },
      vel: { x: velocity, z: 0 }, radius: 35, mass: velocity ? 200 : 1e9,
      collides: true, data: {} });
    h.runtime.tick(h.director, h.live, h.sim.state, 1);
    const perception = h.sim.helpers.aiSensors.frameFor(h.actor.id, 1);
    assert.ok(perception.contacts.some(c => c.id === obstacle.id && c.tags.includes('solid')));
    const planner = new ManeuverPlanner({ seed: 2011, config: { inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
    const directive = { squadId: 'courtesy', formation: { slot: { x: 240, z: 0 }, bound: 170 } };
    const maneuver = movementForActivity({ kind: 'hold', formationBound: 170 }, h.actor.data.ai.activity, directive);
    const request = planner.plan({ entityId: h.actor.id, tick: 1, perception, behavior: { maneuver }, directive });
    assert.equal(request.brake, true, 'real carried momentum must brake before the obstacle');
    assert.ok(Math.abs(request.forceLocal.right) > 0.02, 'freight/scenery must change physical steering');
    assert.equal(request.boost, false);
    assert.equal(obstacle.collides, true);
  }
});

test('passive vignette reaches the far side of a solid under native flight without striking it', async () => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  const h = await bootRealPath({ seed: 2011,
    systems: ['tacticalAI', 'flightV3', 'aiPorts', 'physics'],
    hulls: [{ hullId: 'ship_hawser', isPlayer: true, pos: { x: 500, z: 0 } }] });
  try {
    const actor = h.spawnShip({ hullId: 'ship_hornet', pos: { x: 0, z: 0 }, team: 2 });
    actor.data.ai = { passive: true, roe: 'hold_fire', squadId: 'courtesy' };
    const obstacle = h.spawnObstacle({ pos: { x: 190, z: 0 }, radius: 40, mass: 1e9 });
    const live = { id: 'courtesy', vars: {}, anchor: { x: 0, z: 0 } };
    const runtime = compileVignette({ id: 'courtesy', phases: [
      { id: 'hold', verb: 'motion', seconds: 90, motion: 'hold', next: 'done' },
      { id: 'done', verb: 'resolve' },
    ] });
    const director = { now: () => h.state.simTime, player: () => h.player, entsOf: () => [actor] };
    runtime.fire(director, live, h.state);
    let hits = 0, maxLateral = 0;
    h.bus.on('physics:impact', p => { if ((p.aId === actor.id && p.bId === obstacle.id)
      || (p.bId === actor.id && p.aId === obstacle.id)) hits++; });
    for (let i = 0; i < 2400; i++) {
      runtime.tick(director, live, h.state, h.state.simTime);
      h.step(1);
      maxLateral = Math.max(maxLateral, Math.abs(actor.pos.z));
    }
    h.assertBodies([actor]);
    assert.ok(h.runtime.getSystem('physics')._sg02.records.get(obstacle.id)?.colliders.length > 0, 'the fixed obstacle has native colliders');
    assert.ok(actor.pos.x > 270, `the actor must pass, not freeze before the obstacle: ${JSON.stringify(actor.pos)}`);
    assert.ok(maxLateral > 58, `a real hull-clearance detour must occur: ${maxLateral}`);
    assert.equal(hits, 0);
    assert.equal(actor.alive, true);
    assert.equal(actor.collides, true);
    assert.equal(obstacle.collides, true);
  } finally { h.dispose(); }
});

test('moving vignette points use transit tracking and never inherit a combat target', () => {
  for (const motion of ['orbit', 'ring', 'weave', 'creep', 'depart']) {
    const h = fixture();
    const runtime = compileVignette({ id: 'motion', phases: [
      { id: 'move', verb: 'motion', seconds: 60, motion, next: 'done' }, { id: 'done', verb: 'resolve' },
    ] });
    runtime.fire(h.director, h.live, h.sim.state);
    runtime.tick(h.director, h.live, h.sim.state, 1);
    const activity = h.actor.data.ai.activity;
    assert.equal(activity.kind, 'transit', motion);
    const maneuver = movementForActivity({ kind: 'orbit', targetId: h.player.id }, activity, {});
    assert.equal(maneuver.kind, 'intercept', motion);
    assert.equal(maneuver.targetId, null, 'a waypoint is never permission to pursue a body');
    assert.equal(maneuver.breakFormation, true);
    assert.deepEqual(maneuver.formationSlot, activity.anchor);
    assert.equal(h.actor.data.ai.passive, true);
    assert.equal(h.actor.data.ai.roe, 'hold_fire');
  }
});

test('a finite column arrives through the existing braking owner without borrowing a combat target', () => {
  const h = fixture();
  try {
    h.actor.pos = { x: 660, z: 0 };
    const runtime = compileVignette({ id: 'column', phases: [
      { id: 'move', verb: 'motion', seconds: 60, motion: 'column', next: 'done' },
      { id: 'done', verb: 'resolve' },
    ] });
    runtime.fire(h.director, h.live, h.sim.state);
    runtime.tick(h.director, h.live, h.sim.state, 1);
    const activity = h.actor.data.ai.activity;
    const directive = { squadId: 'courtesy', formation: { slot: { x: 700, z: 0 }, bound: 170 } };
    const maneuver = movementForActivity({ kind: 'intercept', targetId: h.player.id, formationBound: 170 },
      activity, directive);
    const request = new ManeuverPlanner({ seed: 2011 }).plan({ entityId: h.actor.id, tick: 1,
      perception: h.sim.helpers.aiSensors.frameFor(h.actor.id, 1), behavior: { maneuver }, directive });
    assert.equal(request.brake, true, 'the real 70-WU/s momentum must brake at the finite column station');
    assert.equal(maneuver.kind, 'formation');
    assert.equal(maneuver.targetId, null);
    assert.equal(maneuver.breakFormation, true, 'the authored station remains the destination');
    assert.deepEqual(maneuver.formationSlot, activity.anchor);
    assert.equal(h.actor.data.intent.moveZ, undefined, 'the vignette never supplies its own thrust');
    assert.equal(h.actor.data.ai.passive, true);
    assert.equal(h.actor.data.ai.roe, 'hold_fire');
  } finally { h.sim.dispose(); }
});

test('column arrival selection stays outside moving waypoints and ordinary combat interception', () => {
  const stationary = { kind: 'transit', reason: 'vignette_motion:column', anchor: { x: 700, z: 0 }, targetId: null };
  for (const [label, activity] of [
    ['moving column', { ...stationary, anchorVelocity: { x: 30, z: 0 } }],
    ['moving orbit', { ...stationary, reason: 'vignette_motion:orbit', anchorVelocity: { x: 0, z: 88 } }],
    ['departure', { ...stationary, reason: 'vignette_motion:depart' }],
    ['body pursuit', { ...stationary, targetId: 4 }],
    ['missing authored point', { ...stationary, anchor: null }],
    ['combat run', { ...stationary, kind: 'attack_run', reason: 'interceptor_flyby' }],
  ]) {
    const result = movementForActivity({ kind: 'intercept', targetId: 4 }, activity, {});
    assert.equal(result.kind, 'intercept', label);
  }
});

test('orbit and depart retain moving choreography under the native tactical helm', async t => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  for (const motion of ['depart', 'orbit']) {
    const h = await bootRealPath({ seed: 2011, systems: ['tacticalAI', 'flightV3', 'aiPorts', 'physics'],
      hulls: [{ hullId: 'ship_hawser', isPlayer: true, pos: { x: 0, z: 0 } }] });
    try {
      const actor = h.spawnShip({ hullId: 'ship_hornet', pos: { x: 160, z: 0 }, team: 2 });
      actor.data.ai = { passive: true, roe: 'hold_fire', squadId: 'courtesy' };
      const live = { id: 'motion', vars: {}, anchor: { x: 0, z: 0 } };
      const runtime = compileVignette({ id: 'motion', phases: [
        { id: 'move', verb: 'motion', seconds: 60, motion, next: 'done' }, { id: 'done', verb: 'resolve' },
      ] });
      const director = { now: () => h.state.simTime + 1, player: () => h.player, entsOf: () => [actor] };
      runtime.fire(director, live, h.state);
      let path = 0, previous = { ...actor.pos }, minX = actor.pos.x, maxZ = 0, minZ = 0;
      for (let i = 0; i < 720; i++) {
        runtime.tick(director, live, h.state, director.now()); h.step(1);
        path += Math.hypot(actor.pos.x - previous.x, actor.pos.z - previous.z);
        previous = { ...actor.pos }; minX = Math.min(minX, actor.pos.x);
        maxZ = Math.max(maxZ, actor.pos.z); minZ = Math.min(minZ, actor.pos.z);
      }
      if (motion === 'orbit') {
        t.diagnostic(JSON.stringify({ motion, path, minX, maxZ, minZ }));
        assert.ok(path > 650, `orbit must remain a moving ring, not a center hold: ${path}`);
        assert.ok(minX < -80 && maxZ > 80 && minZ < -80,
          `orbit must visit both sides of its authored ring: ${JSON.stringify({ minX, maxZ, minZ })}`);
      } else {
        assert.ok(actor.pos.x > 700 && actor.pos.z > 140,
          `depart must make useful progress on the authored exit during its phase: ${JSON.stringify(actor.pos)}`);
      }
      assert.equal(actor.data.ai.passive, true);
      assert.equal(actor.data.ai.roe, 'hold_fire');
    } finally { h.dispose(); }
  }
});

test('higher-speed depart tracking still yields to moving freight', async () => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  const h = await bootRealPath({ seed: 2011, systems: ['tacticalAI', 'flightV3', 'aiPorts', 'physics'],
    hulls: [{ hullId: 'ship_hawser', isPlayer: true, pos: { x: 450, z: -180 } }] });
  try {
    const actor = h.spawnShip({ hullId: 'ship_hornet', pos: { x: 0, z: 0 }, team: 2 });
    actor.data.ai = { passive: true, roe: 'hold_fire', squadId: 'courtesy' };
    const freight = h.spawnObstacle({ pos: { x: 300, z: 73 }, radius: 40, mass: 250,
      dynamic: true, vel: { x: 6, z: 0 } });
    const live = { id: 'depart', vars: {}, anchor: { x: 0, z: 0 } };
    const runtime = compileVignette({ id: 'depart', phases: [
      { id: 'move', verb: 'motion', seconds: 60, motion: 'depart', next: 'done' }, { id: 'done', verb: 'resolve' },
    ] });
    const director = { now: () => h.state.simTime + 1, player: () => h.player, entsOf: () => [actor] };
    runtime.fire(director, live, h.state);
    let hits = 0, maxSpeed = 0, minimumClearance = Infinity;
    h.bus.on('physics:impact', p => { if ((p.aId === actor.id && p.bId === freight.id)
      || (p.bId === actor.id && p.aId === freight.id)) hits++; });
    for (let i = 0; i < 1200; i++) {
      runtime.tick(director, live, h.state, director.now()); h.step(1);
      maxSpeed = Math.max(maxSpeed, Math.hypot(actor.vel.x, actor.vel.z));
      minimumClearance = Math.min(minimumClearance, Math.hypot(actor.pos.x - freight.pos.x, actor.pos.z - freight.pos.z));
    }
    h.assertBodies([actor, freight]);
    assert.ok(maxSpeed > 80, `the regression must exercise actual departure speed: ${maxSpeed}`);
    assert.ok(actor.pos.x > 700, `avoidance must make progress: ${actor.pos.x}`);
    assert.ok(minimumClearance > actor.radius + freight.radius,
      `the physical hulls must clear one another: ${minimumClearance}`);
    assert.equal(hits, 0);
    assert.equal(actor.collides, true);
    assert.equal(freight.collides, true);
  } finally { h.dispose(); }
});

test('moving-point speed allowance leaves ordinary intercept caps and obstacle braking intact', () => {
  const perception = { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 },
    vel: { x: 90, z: 0 }, rot: 0, radius: 18, energyFraction: 1, heatFraction: 0 }, contacts: [] };
  const directive = { squadId: 'point', formation: { slot: { x: 500, z: 0 }, bound: 170 } };
  const maneuver = { kind: 'intercept', targetId: null, breakFormation: true,
    formationSlot: { x: 500, z: 0 }, formationVelocity: { x: 88, z: 0 } };
  // Isolate the moving-frame allowance from later authored enemy-cruise tuning:
  // this hull is above its explicit stationary budget, below the 88-WU/s waypoint allowance.
  const plan = (reason, contacts = []) => new ManeuverPlanner({ seed: 2011,
    config: { interceptSpeed: 72 } }).plan({
    entityId: 2, tick: 1, perception: { ...perception, contacts }, directive,
    behavior: { maneuver: { ...maneuver, reason } },
  });
  assert.equal(plan('ordinary_intercept').brake, true, 'ordinary navigation retains its speed cap');
  assert.equal(plan('vignette_motion:orbit').brake, false, 'authored moving frame can match point velocity');
  assert.equal(plan('vignette_motion:orbit', [{ id: 3, kind: 'hazard', alive: true,
    pos: { x: 90, z: 0 }, vel: { x: 6, z: 0 }, radius: 35, tags: ['solid'], confidence: 1 }]).brake,
  true, 'a freight dodge must reclaim emergency braking');
});

test('moving vignette bearings follow the tracking controller velocity at zero and small position error', () => {
  const plan = ({ reason = 'vignette_motion:orbit', point = { x: 0, z: 0 }, velocity = { x: 0, z: 88 } } = {}) =>
    new ManeuverPlanner({ seed: 2011, config: { squadFrames: false, desiredKp: 0.11, desiredKv: 0.55 } }).plan({
      tick: 1, entityId: 2,
      perception: { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 }, rot: 0, radius: 18, energyFraction: 1, heatFraction: 0 }, contacts: [] },
      directive: { squadId: 'point', formation: { slot: point, bound: 170 } },
      behavior: { maneuver: { kind: 'intercept', targetId: null, breakFormation: true,
        formationSlot: point, formationVelocity: velocity, reason } },
    });
  assert.ok(Math.abs(plan().targetHeading - Math.PI / 2) < 1e-9,
    'a pilot already at the moving waypoint faces its travel direction');
  assert.ok(Math.abs(plan({ point: { x: 10, z: 0 } }).targetHeading - Math.atan2(88 + (88 * 45 / 60) * 0.2, 2)) < 1e-9,
    'the bearing uses the same predicted point and existing Kp/Kv tracking gain');
  assert.equal(plan({ reason: 'ordinary_intercept', point: { x: 10, z: 0 } }).targetHeading, 0,
    'ordinary interception keeps its own bearing policy');
  assert.equal(plan({ point: { x: 10, z: 0 }, velocity: { x: 0, z: 0 } }).targetHeading, 0,
    'stationary destinations keep their existing approach bearing');
});
