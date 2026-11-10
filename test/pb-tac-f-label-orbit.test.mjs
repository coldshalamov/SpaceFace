// PB-TAC-F — SF-058/SF-059 pair.
//
// SF-058 (lawful-motive verify): friendly traffic must not become a target by label. The final
// authority seams already encode this — team-2 civilians are never auto-hostile, same-team pairs
// need a named incident (securityTargetId / retaliationTargetId), a grazed jettisoned pod does
// not aggro its owner, and station protection converts retaliation into withdrawal. These tests
// pin that contract so a future label/team shortcut cannot regress it silently.
//
// SF-059 (terrain-aware orbit): an orbit whose ring intersects solid terrain used to rely on the
// reactive dodge cone alone — steer in, get kicked to the shoulder, steer back in: pinball. The
// planner now sweeps a bounded fan of tangential directions against perceived obstacles and picks
// the widest clear arc biased for continuity, so the hull skims the wall and resumes the ring
// once clear.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import {
  authorizeAIEngagement,
  isHostileForAI,
} from '../src/ai/engagementAuthority.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';

// ---------- SF-058: friendly traffic is not a target by label ----------

function liveShip(id, team, pos, ai = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { ai: { ...ai }, intent: { fire: false }, combat: {} },
  };
}

function worldWith(entities, options = {}) {
  const map = new Map(entities.map((entity) => [entity.id, entity]));
  return {
    tick: options.tick ?? 240,
    playerId: options.playerId ?? 1,
    player: { heat: options.heat ?? 0 },
    world: { currentSectorId: options.sectorId || 'sector_tethys_junction' },
    entities: map,
    entityList: [...map.values()],
    lawSecurity: {},
  };
}

test('SF-058: an armed neutral and a same-team raider are not hostile by label', () => {
  // An armed neutral: a team-2 civilian fitted with a weapon — armament is not a motive.
  const civilian = liveShip(10, 2, { x: 0, z: 0 }, {
    archetype: 'miner',
    passive: false,
  });
  const raider = liveShip(11, 1, { x: 120, z: 0 }, {
    archetype: 'pirate',
    passive: false,
  });
  const state = worldWith([civilian, raider]);

  assert.equal(isHostileForAI(state, raider, civilian), false,
    'a raider label cannot make armed civilian traffic a target');
  assert.equal(isHostileForAI(state, civilian, raider), false,
    'a civilian cannot turn hostile because a nearby hull resembles an enemy');

  // Shared team value: patrols and raiders both sit on team 1 — resemblance must not fire.
  const patrol = liveShip(12, 1, { x: -80, z: 0 }, { lawful: true, archetype: 'patrol' });
  const pirate = liveShip(13, 1, { x: 40, z: 0 }, { archetype: 'pirate' });
  const sameTeam = worldWith([patrol, pirate]);
  assert.equal(isHostileForAI(sameTeam, patrol, pirate), false,
    'a patrol cannot make a same-team raider hostile by label alone');
  assert.equal(isHostileForAI(sameTeam, pirate, patrol), false,
    'a raider cannot make a same-team patrol hostile by label alone');
});

test('SF-058: actual harm names the attacker — retaliation stays attacker-scoped', () => {
  const player = liveShip(1, 0, { x: 0, z: 0 });
  const civilian = liveShip(10, 2, { x: 90, z: 0 }, { archetype: 'miner' });
  const bystander = liveShip(11, 2, { x: 140, z: 0 }, { archetype: 'trader' });
  const state = worldWith([player, civilian, bystander]);

  // Real harm occurred: the named incident overrides the team-2 floor for that attacker only.
  civilian.data.ai.retaliationTargetId = player.id;
  assert.equal(isHostileForAI(state, civilian, player), true,
    'a harmed civilian may lawfully answer its attacker');
  assert.equal(isHostileForAI(state, civilian, bystander), false,
    'the grudge does not widen to the bystander sharing the attacker shape');
  assert.equal(isHostileForAI(state, bystander, player), false,
    'the bystander never inherits the label of the harmed ship');
});

test('SF-058: striking jettisoned cargo does not aggro the owner, direct harm does', () => {
  const player = liveShip(1, 0, { x: 0, z: 0 });
  const hauler = liveShip(10, 2, { x: 220, z: 0 }, {
    archetype: 'hauler',
    passive: false,
    spawnContext: 'convoy_civilian',
  });
  const pod = {
    id: 30,
    type: 'payload',
    alive: true,
    team: 2,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: { payloadType: JETTISONED_CARGO_PAYLOAD_TYPE, ownerId: 10 },
  };
  const state = worldWith([player, hauler, pod]);
  const emitted = [];
  lawSecurity.init({
    state,
    bus: { on() {}, emit: (event, payload) => emitted.push({ event, payload }) },
  });

  lawSecurity._handleDamage({ attackerId: 1, targetId: 30, applied: 5 });
  assert.equal(hauler.data.ai.retaliationTargetId, undefined,
    'a grazed cargo pod must not convert the owning hauler');
  assert.equal(hauler.data.ai.motive, undefined,
    'the pod strike writes no motive onto the hauler');
  assert.equal(isHostileForAI(state, hauler, player), false,
    'the hauler stays neutral toward the player who only hit its jettison');

  // Contrast: a hit on the hull itself is real harm — legitimate retaliation is preserved.
  lawSecurity._handleDamage({ attackerId: 1, targetId: 10, applied: 5 });
  assert.equal(hauler.data.ai.retaliationTargetId, player.id,
    'a direct hit names the attacker for lawful retaliation');
  assert.equal(isHostileForAI(state, hauler, player), true,
    'the harmed hauler may answer the player who shot it');
});

function retaliatingPursuer(overrides = {}) {
  return {
    passive: false,
    lawful: false,
    motive: 'self_defense',
    engagementTrigger: 'player_attack',
    zoneId: 'zone_tethys_lane',
    approachTelegraph: 'return_fire_warning',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    retaliationTargetId: 1,
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'self_defense:return_fire',
      anchor: { x: 0, z: 0 },
      leashRadius: 2200,
      startedTick: 0,
    }),
    roe: RulesOfEngagement.WEAPONS_FREE,
    ...overrides,
  };
}

test('SF-058: station protection ends the retaliation the moment the target is covered', () => {
  const player = liveShip(1, 0, { x: 0, z: 0 });
  const station = {
    id: 3,
    type: 'station',
    alive: true,
    factionId: 'faction_scn',
    pos: { x: 0, z: 60 },
    radius: 42,
    data: { stationId: 'station_tethys_north', dockRadius: 72 },
  };
  const pursuer = liveShip(10, 2, { x: 300, z: 0 }, retaliatingPursuer());
  const state = worldWith([player, station, pursuer]);

  const covered = authorizeAIEngagement({
    state,
    self: pursuer,
    target: player,
    tick: state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  });
  assert.equal(covered.ok, false);
  assert.equal(covered.reason, 'station_protection',
    'a self-defending pursuer cannot keep firing once the target is under station guns');

  // Same pair out in open lane space: the retaliation motive authorizes fire — the protection
  // boundary is jurisdictional, not a blanket immunity that erases the wound. The station is
  // genuinely present on the list, just 9000 WU beyond its protection ring.
  const farStation = { ...station, pos: { x: 0, z: 9000 } };
  const open = worldWith([player, farStation, pursuer]);
  const exposed = authorizeAIEngagement({
    state: open,
    self: pursuer,
    target: player,
    tick: open.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  });
  assert.equal(exposed.ok, true,
    `legitimate retaliation survives outside jurisdiction: ${JSON.stringify(exposed)}`);
});

// ---------- SF-059: terrain-aware orbit ----------

function orbitPerception(ship, target, obstacles) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: ship.x, z: ship.z },
      vel: { x: ship.vx, z: ship.vz },
      rot: ship.rot,
      radius: ship.radius,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon'],
      activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'orbit_fixture', anchor: { x: 0, z: 0 } }),
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [target, ...obstacles],
    events: [],
  };
}

function orbitIntent(targetId, preferredRange) {
  return {
    kind: ManeuverKind.ORBIT,
    targetId,
    preferredRange,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    lateralSign: 1,
    reason: 'terrain_orbit_fixture',
  };
}

function orbitDirective(targetId) {
  return {
    squadId: 'terrain_orbit',
    objective: { kind: ObjectiveKind.FOCUS, targetId, reason: 'fixture' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  };
}

function shipContact(id, x, z, radius) {
  return {
    id,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.5,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    tags: [],
  };
}

function wallContact(id, x, z, radius) {
  return {
    id,
    kind: ContactKind.HAZARD,
    alive: true,
    valid: true,
    visible: true,
    hostile: false,
    confidence: 1,
    threat: 0,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    tags: ['solid'],
  };
}

// One honest physics loop shared by the orbit cases: an ORBIT intent has no faceTarget, so
// request.targetHeading IS the planner's desired direction of travel. Servo the velocity
// toward that commanded heading at the orbit envelope — a first-order model of "the hull goes
// where the planner asks" that isolates steering quality (the thing SF-059 is about) from the
// unrelated thrust-channel dynamics.
function flyOrbit({ seed, ship, target, obstacles, ticks }) {
  const traceEvents = [];
  const planner = new ManeuverPlanner({
    seed,
    trace: { emit: (entry) => traceEvents.push(entry) },
  });
  const orbitRadius = 240;
  const log = [];
  for (let tick = 0; tick < ticks; tick++) {
    const request = planner.plan({
      tick,
      entityId: 2,
      perception: orbitPerception(ship, target, obstacles),
      behavior: { maneuver: orbitIntent(target.id, orbitRadius) },
      directive: orbitDirective(target.id),
    });
    const err = wrap(request.targetHeading - ship.rot);
    ship.rot = wrap(ship.rot + clamp(err, -0.09, 0.09));
    const cap = request.brake ? 24 : 68;
    const tx = Math.cos(request.targetHeading) * cap;
    const tz = Math.sin(request.targetHeading) * cap;
    const accel = 3.2;
    ship.vx += clamp(tx - ship.vx, -accel, accel);
    ship.vz += clamp(tz - ship.vz, -accel, accel);
    ship.x += ship.vx;
    ship.z += ship.vz;
    log.push({ x: ship.x, z: ship.z, vx: ship.vx, vz: ship.vz });
  }
  return { log, traceEvents };
}

test('SF-059: an orbit beside solid terrain skims the wall and resumes the ring', () => {
  const target = shipContact(1, 0, 0, 18);
  // A large solid body swallowing the ring's east arc: the tangential path runs a long way
  // inside its face. This is the geometry where the pure reactive dodge chatters — measured
  // 140/1800 dodge takeovers before the fan, 39/1800 after — so the assertion pins steering
  // quality, not just collision survival.
  const wall = wallContact(9, 170, 0, 150);
  const startAngle = -Math.PI / 2;
  const run = flyOrbit({
    seed: 7,
    ship: {
      x: 240 * Math.cos(startAngle),
      z: 240 * Math.sin(startAngle),
      vx: 0, vz: 0, rot: 0, radius: 14,
    },
    target,
    obstacles: [wall],
    ticks: 60 * 30,
  });

  let minWallGap = Infinity;
  let tangentFlips = 0;
  let lastSign = 0;
  let sweptRadians = 0;
  let lastAngle = startAngle;
  for (const step of run.log) {
    const wallGap = Math.hypot(step.x - wall.pos.x, step.z - wall.pos.z) - wall.radius;
    minWallGap = Math.min(minWallGap, wallGap);
    // Orbit direction: sign of the cross product radial × velocity. A pinballing hull
    // reverses its travel direction every time the dodge cone kicks it out.
    const rx = step.x - target.pos.x, rz = step.z - target.pos.z;
    const cross = rx * step.vz - rz * step.vx;
    if (Math.abs(cross) > 6) {
      const sign = Math.sign(cross);
      if (lastSign !== 0 && sign !== lastSign) tangentFlips++;
      lastSign = sign;
    }
    const angle = Math.atan2(rz, rx);
    sweptRadians += Math.abs(wrap(angle - lastAngle));
    lastAngle = angle;
  }

  assert.ok(minWallGap > 0, `the hull never enters the wall body (gap ${minWallGap.toFixed(1)})`);
  assert.ok(tangentFlips <= 1, `orbit direction must not oscillate at the wall (${tangentFlips} reversals)`);
  assert.ok(sweptRadians > Math.PI * 2.5,
    `the orbit keeps making progress around the target instead of stalling on the wall (swept ${sweptRadians.toFixed(2)} rad)`);
  const dodges = run.traceEvents.filter((e) => e.context && e.context.obstacleAvoidance === true).length;
  const frac = dodges / run.traceEvents.length;
  assert.ok(frac < 0.05,
    `the reactive dodge stays a backstop, not the steering plan (${dodges}/${run.traceEvents.length} dodged)`);
});

test('SF-059: clear terrain leaves the authored orbit untouched', () => {
  const target = shipContact(1, 0, 0, 18);
  const planner = new ManeuverPlanner({ seed: 7 });
  const ship = { x: 300, z: 40, vx: 0, vz: 0, rot: 0, radius: 14 };
  const request = planner.plan({
    tick: 0,
    entityId: 2,
    perception: orbitPerception(ship, target, []),
    behavior: { maneuver: orbitIntent(target.id, 240) },
    directive: orbitDirective(target.id),
  });
  // The commanded heading must be exactly the authored tangent+radial blend — no terrain
  // machinery may perturb a ring that is not threatened.
  const dx = target.pos.x - ship.x, dz = target.pos.z - ship.z;
  const dist = Math.hypot(dx, dz);
  const radial = clamp((dist - 240) / 240, -1, 1);
  const expectX = (-dz / dist) + (dx / dist) * radial * 1.15;
  const expectZ = (dx / dist) + (dz / dist) * radial * 1.15;
  const expected = Math.atan2(expectZ, expectX);
  assert.ok(Math.abs(wrap(request.targetHeading - expected)) < 1e-6,
    `clear-terrain heading ${request.targetHeading.toFixed(4)} must equal authored orbit heading ${expected.toFixed(4)}`);
});

test('SF-059: the terrain pick is deterministic for a seed', () => {
  const target = shipContact(1, 0, 0, 18);
  const wall = wallContact(9, 170, 0, 150);
  const ship = () => ({ x: 0, z: -240, vx: 0, vz: 0, rot: 0, radius: 14 });
  const a = flyOrbit({ seed: 7, ship: ship(), target, obstacles: [wall], ticks: 300 });
  const b = flyOrbit({ seed: 7, ship: ship(), target, obstacles: [wall], ticks: 300 });
  assert.deepEqual(a.log.at(-1), b.log.at(-1), 'same seed must fly the same arc');
});

function wrap(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
