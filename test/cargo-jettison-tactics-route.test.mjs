import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';

const DT = SIM_DT;
const ORE_ID = 'cmdty_ore_iron';

test('jettison creates a solid mass-bearing pod that physically damages a pursuer with player provenance', async (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const systems = [physics, collisionConsequences, combat, jettisonImpulse, cargo];
  const updateOrder = [physics, collisionConsequences, combat, jettisonImpulse, cargo];
  const sim = createSimulation({ seed: 0xac4101, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn(makeShipEntitySpec('ship_hitch', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_hitch'),
  }));
  state.playerId = player.id;
  const pursuer = sim.spawn(physicalShip({ x: -205, z: 0, hull: 85, mass: 18, team: 1 }));
  const impacts = [];
  const strikes = [];
  const damage = [];
  bus.on('physics:impact', (payload) => impacts.push(structuredClone(payload)));
  bus.on('cargo:podStrike', (payload) => strikes.push(structuredClone(payload)));
  bus.on('combat:damage', (payload) => damage.push(structuredClone(payload)));

  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  const cargoSystem = sim.registry.get('cargo');
  assert.equal(cargoSystem.addCargo(ORE_ID, 40), 40);
  const beforeHull = pursuer.hull;
  assert.equal(cargoSystem.jettison(ORE_ID, 40), 40);
  const pod = state.entityList.find((entity) => entity.alive !== false && entity.data?.recoverableCargoPod === true);
  assert.ok(pod, 'the ordinary cargo writer materializes one recoverable pod');
  assert.equal(pod.type, 'payload');
  assert.ok(pod.mass >= 4 && pod.physicsBody?.mass === pod.mass);
  assert.equal(pod.collides, false, 'the two-second launch clearance starts non-solid');
  assert.equal(pod.physicsBody.material, 'massline_sensor');

  for (let tick = 0; tick < 360 && pursuer.hull === beforeHull; tick++) sim.step(DT);

  assert.equal(pod.collides, true, 'the live jettison owner admits the same pod to Rapier after clearance');
  assert.equal(pod.physicsBody.material, 'payload');
  assert.ok(impacts.some((payload) => pairIncludes(payload, pod.id, pursuer.id)),
    'the damage begins with an actual Rapier pod-to-pursuer contact');
  assert.ok(strikes.some((payload) => payload.podId === pod.id && payload.targetId === pursuer.id));
  assert.ok(pursuer.hull < beforeHull || pursuer.alive === false,
    'the mass-bearing cargo pod routes kinetic damage through the existing collision owner');
  assert.ok(damage.some((payload) => payload.targetId === pursuer.id && payload.attackerId === player.id),
    'the pod preserves the jettisoning player as the collision actor');
});

test('a manual pod drop during an active pirate scan diverts the real squad and ends the toll without hostility', async (t) => {
  const tactical = createTacticalAISystem();
  const systems = [pirateParley, tactical, flightV3, aiPorts, physics, jettisonImpulse, cargo];
  const updateOrder = [pirateParley, tactical, flightV3, aiPorts, physics, jettisonImpulse, cargo];
  const sim = createSimulation({ seed: 0xac4102, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  const player = sim.spawn(makeShipEntitySpec('ship_hitch', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_hitch'),
  }));
  state.playerId = player.id;
  const pirate = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 3, { x: -360, z: 0 }));
  pirate.data.ai = {
    ...(pirate.data.ai || {}),
    doctrine: 'toll',
    motive: 'cargo_extortion',
    squadId: 'plan41:decoy-squad',
    encounterId: 'plan41:decoy-squad',
    passive: true,
    intent: pirate.data.intent || {},
  };
  pirate.data.encounter = true;
  const decoyEvents = [];
  const resolutions = [];
  bus.on('pirateParley:decoyed', (payload) => decoyEvents.push(structuredClone(payload)));
  bus.on('pirateParley:resolved', (payload) => resolutions.push(structuredClone(payload)));

  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  const cargoSystem = sim.registry.get('cargo');
  assert.equal(cargoSystem.addCargo(ORE_ID, 24), 24);
  sim.step(DT);
  const rec = state.pirateParley.squads['plan41:decoy-squad'];
  assert.equal(rec?.phase, 'scan');

  assert.equal(cargoSystem.jettison(ORE_ID, 8), 8);
  const pod = state.entities.get(rec.decoyPodId);
  assert.ok(pod);
  assert.equal(rec.phase, 'decoy');
  assert.equal(pirate.data.ai.activity.targetId, pod.id);
  assert.equal(pirate.data.ai.activity.kind, 'scan_approach');
  assert.equal(pirate.data.ai.roe, 'hold_fire');
  const startDistance = distance(pirate, pod);

  for (let tick = 0; tick < 1200 && !rec.resolved; tick++) sim.step(DT);

  assert.equal(rec.outcome, 'decoyed', 'physical recovery of the false target resolves the scan');
  assert.ok(distance(pirate, pod) < startDistance - 80,
    'the production Tactical/Flight/Rapier route materially closes on the world pod');
  assert.equal(decoyEvents.length, 1);
  assert.equal(resolutions.filter((payload) => payload.outcome === 'decoyed').length, 1);
  assert.equal(pirate.data.ai.passive, true);
  assert.equal(pirate.data.ai.huntPlayer, false);
  assert.equal(pirate.data.ai.roe, 'hold_fire');
});

test('a slow physical player contact recovers the same pod through the canonical cargo writer', () => {
  const sim = createSimulation({ seed: 0xac4103, systems: [jettisonImpulse, cargo], updateOrder: [jettisonImpulse, cargo] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn(physicalShip({ x: 0, z: 0, hull: 100, mass: 18, team: 0 }));
  state.playerId = player.id;
  const cargoSystem = sim.registry.get('cargo');
  assert.equal(cargoSystem.addCargo(ORE_ID, 5), 5);
  assert.equal(cargoSystem.jettison(ORE_ID, 5), 5);
  const pod = state.entityList.find((entity) => entity.data?.recoverableCargoPod === true);
  state.simTime = pod.data.pickupEmbargoUntil;
  sim.step(DT);
  pod.pos.x = player.pos.x + player.radius + pod.radius;
  pod.pos.z = player.pos.z;
  pod.vel.x = player.vel.x;
  pod.vel.z = player.vel.z;
  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: 'route-test',
    tick: state.tick,
    aId: pod.id,
    bId: player.id,
    impulse: 12,
    pos: { x: pod.pos.x, z: pod.pos.z },
    normal: { x: -1, z: 0 },
  });

  assert.equal(pod.alive, false);
  assert.equal(state.player.cargo.items[ORE_ID], 5);
});

function physicalShip({ x, z, hull, mass, team }) {
  const radius = 8;
  return {
    type: 'ship',
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius,
    mass,
    hull,
    hullMax: hull,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 0,
    capMax: 0,
    drag: 0,
    collides: true,
    physicsBody: {
      dynamic: true,
      ccd: true,
      radius,
      mass,
      inertiaY: 0.5 * mass * radius * radius,
      material: 'ship',
      shape: 'ball',
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1, ramDamageDealtMult: 0 },
      intent: {},
      ai: {},
    },
  };
}

function pairIncludes(payload, aId, bId) {
  return (payload.aId === aId && payload.bId === bId)
    || (payload.aId === bId && payload.bId === aId);
}

function distance(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}
