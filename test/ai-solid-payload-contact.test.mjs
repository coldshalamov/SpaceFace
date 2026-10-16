import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { SquadCommander } from '../src/ai/squad.js';
import { movementForActivity } from '../src/ai/doctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';

// Semantic shape witnessed on a physical repair module: commodity metadata does
// not make it jettisoned cargo. No private save, authored mission or native host needed.
function payload() {
  return {
    type: 'payload', alive: true, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 55, hull: 100, collides: true, team: 0,
    physicsBody: { dynamic: true, material: 'debris' },
    data: { commodityId: 'cmdty_scrap_metal', amount: 1 },
  };
}

function fixture(spec = payload()) {
  const sim = createSimulation({ seed: 2011, systems: [aiPorts] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', alive: true, team: 0, pos: { x: 400, z: 0 },
    radius: 18, mass: 70, hull: 100, collides: true, data: {},
  });
  sim.state.playerId = player.id;
  const actor = sim.spawn({
    type: 'ship', alive: true, team: 2, pos: { x: 0, z: 0 }, vel: { x: 70, z: 0 },
    radius: 18, mass: 70, hull: 100, collides: true,
    data: { ai: { passive: true, roe: 'hold_fire', squadId: 'courtesy' }, intent: {} },
  });
  const obstacle = sim.spawn(spec);
  const contact = () => sim.helpers.aiSensors.frameFor(actor.id, 1).contacts
    .find(c => c.id === obstacle.id);
  return { sim, actor, player, obstacle, contact };
}

test('ordinary collidable payload reaches real sensors as solid hazard, not cargo objective', () => {
  const h = fixture();
  const contact = h.contact();
  assert(contact, 'physical payload must be sensed');
  assert.equal(contact.kind, 'hazard');
  assert(contact.tags.includes('solid'));
  assert.equal(contact.objectiveValue, 0);
  assert.equal(h.obstacle.data.kind, undefined);
});

test('cargo and wreck precedences remain unchanged', () => {
  for (const [kind, mutate] of [
    ['objective', spec => { spec.data.kind = 'cargo'; }],
    ['hazard', spec => { spec.type = 'wreck'; }],
  ]) {
    const spec = payload();
    mutate(spec);
    assert.equal(fixture(spec).contact().kind, kind);
  }
});

test('dead, noncolliding, ghost payloads and out-of-range bodies remain absent', () => {
  for (const mutate of [
    spec => { spec.alive = false; },
    spec => { spec.collides = false; },
    spec => { spec.physicsBody = false; },
    spec => { spec.physicsBody.material = 'massline_sensor'; },
    spec => { spec.physicsBody.material = 'projectile'; },
    spec => { spec.physicsBody.contact = { ghost: true }; },
    spec => { spec.pos.x = 100000; },
  ]) {
    const spec = payload();
    mutate(spec);
    assert.equal(fixture(spec).contact(), undefined);
  }
});

test('passive vignette plans a real freight detour/brake without fire permission', () => {
  for (const vx of [0, 6]) {
    const spec = payload();
    spec.vel.x = vx;
    const h = fixture(spec);
    const live = { id: 'courtesy', vars: {}, anchor: { x: 0, z: 0 } };
    const runtime = compileVignette({ id: 'courtesy', phases: [
      { id: 'hold', verb: 'motion', seconds: 60, motion: 'hold', next: 'done' },
      { id: 'done', verb: 'resolve' },
    ] });
    const director = { now: () => 0, player: () => h.player, entsOf: () => [h.actor] };
    runtime.fire(director, live, h.sim.state);
    runtime.tick(director, live, h.sim.state, 1);
    const perception = h.sim.helpers.aiSensors.frameFor(h.actor.id, 1);
    const directive = { squadId: 'courtesy', formation: { slot: { x: 240, z: 0 }, bound: 170 } };
    const maneuver = movementForActivity(
      { kind: 'hold', formationBound: 170 }, h.actor.data.ai.activity, directive,
    );
    const planner = new ManeuverPlanner({ seed: 2011, config: {
      inputSlewPerTick: 1, emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
    } });
    const request = planner.plan({
      entityId: h.actor.id, tick: 1, perception, behavior: { maneuver }, directive,
    });
    assert.equal(request.brake, true);
    assert(Math.abs(request.forceLocal.right) > 0.02);
    assert.equal(request.boost, false);
    assert.equal(maneuver.targetId, null);
    assert.deepEqual(authorizeAIEngagement({
      state: h.sim.state, self: h.actor, target: h.obstacle,
      tick: 1, actionKind: 'fire', offensive: true,
    }), { ok: false, reason: 'passive' });
  }
});

test('generic physical hazards cannot become squad attack or cargo objectives', () => {
  const h = fixture();
  h.actor.data.ai.passive = false;
  const frame = h.sim.helpers.aiSensors.frameFor(h.actor.id, 1);
  const hazard = frame.contacts.find(contact => contact.id === h.obstacle.id);
  assert.equal(hazard.kind, 'hazard');
  const commander = new SquadCommander({ seed: 2011, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'probe', doctrine: 'aggressive',
    members: [{ id: h.actor.id, capabilities: ['drive', 'sensor', 'weapon'] }],
  });
  const result = commander.update('probe', 1,
    new Map([[h.actor.id, { ...frame, contacts: [hazard] }]]));
  assert.notEqual(result.directives.get(h.actor.id).objective.targetId, h.obstacle.id);
});

test('collision admission follows true→false→true in same-tick and later sensor reads', () => {
  const h = fixture();
  for (const tick of [1, 2]) {
    h.sim.state.tick = tick;
    for (const collides of [true, false, true]) {
      h.obstacle.collides = collides;
      const contact = h.sim.helpers.aiSensors.frameFor(h.actor.id, tick).contacts
        .find(c => c.id === h.obstacle.id);
      assert.equal(!!contact, collides, `tick${tick} collides${collides}`);
    }
  }
});

test('dense spatial path retains local payload contact without admitting distant payloads', () => {
  const h = fixture();
  for (let i = 0; i < 120; i++) h.sim.spawn({ ...payload(), pos: { x: 10000 + i * 30, z: 0 } });
  const hash = new SpatialHash();
  hash.rebuild(h.sim.state.entityList);
  h.sim.state.spatialHash = hash;
  let queries = 0;
  const query = hash.queryRadius.bind(hash);
  hash.queryRadius = (...args) => { queries++; return query(...args); };
  const frame = h.sim.helpers.aiSensors.frameFor(h.actor.id, 3);
  assert(queries > 0);
  assert(frame.contacts.some(contact => contact.id === h.obstacle.id));
  assert.equal(frame.contacts.filter(contact => contact.kind === 'hazard').length, 1);
});

test('legacy zero collisionMask and nonghost sensor material remain physical hazards', () => {
  for (const mutate of [
    spec => { spec.collisionMask = 0; },
    spec => { spec.physicsBody.material = 'sensor'; },
    spec => { spec.physicsBody.material = 'massline_sensor'; spec.physicsBody.contact = { ghost: false }; },
  ]) {
    const spec = payload();
    mutate(spec);
    const contact = fixture(spec).contact();
    assert.equal(contact.kind, 'hazard');
    assert(contact.tags.includes('solid'));
  }
});
