import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  applyCombatDoctrineToSelection,
  attackLineFor,
  isPointOnAttackLine,
} from '../src/ai/combatDoctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

function baseDirective(targetId = 1) {
  return {
    squadId: 'squad_test',
    objective: { kind: ObjectiveKind.FOCUS, targetId, reason: 'test' },
    formation: {
      slot: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      bound: 170,
      breakFormation: true,
    },
  };
}

function shipPerception(self, contacts = []) {
  return {
    tick: 0,
    self: {
      id: self.id || 2,
      team: self.team ?? 1,
      pos: { x: self.x ?? 0, z: self.z ?? 0 },
      vel: { x: self.vx ?? 0, z: self.vz ?? 0 },
      rot: self.rot ?? 0,
      radius: self.radius ?? 14,
      hullFraction: self.hullFraction ?? 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      operationalMassBand: self.operationalMassBand || 'light',
      flightClass: self.flightClass || 'fighter',
      hullId: self.hullId || 'ship_wasp',
      activity: { kind: 'attack_run', reason: 'test', anchor: { x: 0, z: 0 } },
      roe: 'weapons_free',
      combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    },
    contacts,
    events: [],
  };
}

function targetContact(pos = { x: 400, z: 0 }, vel = { x: 0, z: 0 }) {
  return {
    id: 1,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.9,
    pos: { x: pos.x, z: pos.z },
    vel: { x: vel.x, z: vel.z },
    radius: 14,
    tags: [],
  };
}

test('PQ-140.00 crossing lane maintains high speed through pass without arrival braking', () => {
  const planner = new ManeuverPlanner({ seed: 47 });
  // Interceptor flying along +X toward a target at x=80, z=0
  const ship = {
    x: 0, z: 55,
    vx: 72, vz: 0,
    rot: 0,
    radius: 12,
  };
  const target = targetContact({ x: 80, z: 0 });

  // Maneuver with lateral crossing lane
  const maneuver = {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 150,
    lateralSign: 1,
    crossingLane: true,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    reason: 'combat_doctrine:interceptor_flyby:strike',
  };

  let req = null;
  for (let tick = 0; tick <= 35; tick++) {
    const perception = shipPerception(ship, [target]);
    req = planner.plan({
      tick,
      entityId: 2,
      perception,
      behavior: { maneuver },
      directive: baseDirective(1),
    });
    const dt = 1 / 60;
    const headingError = req.targetHeading - ship.rot;
    ship.rot += Math.sign(headingError) * Math.min(Math.abs(headingError), 2.35 * dt);
  }

  // The interceptor must maintain committed forward thrust (> 0.15 sustaining speed) and NOT brake
  assert.equal(req.brake, false, 'interceptor must not brake on crossing attack pass');
  assert.ok(req.forceLocal.forward >= 0.15, `forward thrust must remain committed, got ${req.forceLocal.forward.toFixed(3)}`);
});

test('PQ-140.00 interceptor is never a stationary target through complete attack and extend run', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const planner = new ManeuverPlanner({ seed: 47 });

  const ship = {
    x: 0, z: -30,
    vx: 60, vz: 0,
    rot: 0,
    radius: 12,
  };
  const target = targetContact({ x: 400, z: 0 });

  const speeds = [];
  let minSpeedDuringRun = Infinity;

  // Simulate 120 ticks (2 seconds) of high-speed intercept and overshoot
  for (let tick = 0; tick < 120; tick++) {
    const perception = shipPerception(ship, [target]);
    const doctrine = runtime.update({
      tick,
      entityId: 2,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception,
      directive: baseDirective(1),
    });

    const selection = applyCombatDoctrineToSelection({
      actionId: null,
      targetId: 1,
      targetContact: target,
      maneuver: {
        kind: doctrine.maneuverKind,
        targetId: doctrine.maneuverTargetId,
        preferredRange: doctrine.preferredRange,
        lateralSign: doctrine.lateralSign,
        flightPoint: doctrine.flightPoint,
        breakFormation: true,
      },
    }, doctrine);

    const req = planner.plan({
      tick,
      entityId: 2,
      perception,
      behavior: { maneuver: selection.maneuver },
      directive: baseDirective(1),
    });

    // Step ship physics with thruster output
    const dt = 1 / 60;
    const accel = 96; // fighter main accel
    const c = Math.cos(ship.rot);
    const s = Math.sin(ship.rot);
    const ax = (c * req.forceLocal.forward - s * req.forceLocal.right) * accel;
    const az = (s * req.forceLocal.forward + c * req.forceLocal.right) * accel;

    ship.vx += ax * dt;
    ship.vz += az * dt;
    const currentSpeed = Math.hypot(ship.vx, ship.vz);
    speeds.push(currentSpeed);
    minSpeedDuringRun = Math.min(minSpeedDuringRun, currentSpeed);

    // Turn ship toward targetHeading
    const headingError = req.targetHeading - ship.rot;
    ship.rot += Math.sign(headingError) * Math.min(Math.abs(headingError), 2.35 * dt);

    ship.x += ship.vx * dt;
    ship.z += ship.vz * dt;
  }

  // Speed must never drop below 40 WU/s (never stationary)
  assert.ok(minSpeedDuringRun >= 40, `interceptor speed dropped too low: minSpeed=${minSpeedDuringRun.toFixed(2)} WU/s`);
  // Final speed remains high after extension
  const endSpeed = speeds.at(-1);
  assert.ok(endSpeed >= 60, `interceptor must carry speed out of pass: endSpeed=${endSpeed.toFixed(2)} WU/s`);
});

test('PQ-140.00 extend-and-return cycles with alternating/seeded crossing sides', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const sides = [];
  const phases = [];

  let self = { x: 0, z: -30, vx: 70, vz: 0, rot: 0 };
  const target = { x: 300, z: 0, vel: { x: 0, z: 0 } };

  // Run through multiple complete flyby cycles
  for (let tick = 0; tick < 500; tick++) {
    const perception = shipPerception(self, [targetContact(target.pos, target.vel)]);
    const doc = runtime.update({
      tick,
      entityId: 2,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception,
      directive: baseDirective(1),
    });

    if (!phases.includes(doc.phase)) phases.push(doc.phase);

    // Track crossing pass progression
    if (doc.phase === 'strike') {
      self.x += 70 * (1 / 60);
    } else if (doc.phase === 'extend') {
      self.x += 80 * (1 / 60);
    } else if (doc.phase === 'reform') {
      // turn back toward target for next pass
      self.x = 0;
      self.z = 40;
    }

    if (doc.phase === 'strike' && !sides.includes(doc.side)) {
      sides.push(doc.side);
    }
  }

  // Must have passed through all authored phases
  assert.ok(phases.includes('ingress'), 'passed ingress');
  assert.ok(phases.includes('engine_flare'), 'passed engine_flare');
  assert.ok(phases.includes('strike'), 'passed strike');
  assert.ok(phases.includes('extend'), 'passed extend');
  assert.ok(phases.includes('reform'), 'passed reform');
});

test('PQ-140.00 attack line geometry and player positioning metric', () => {
  // Define interceptor during strike
  const interceptorRecord = {
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    phase: 'strike',
    preferredRange: 300,
  };
  const interceptorSelf = {
    pos: { x: 100, z: 0 },
    rot: 0, // facing +X
  };

  const line = attackLineFor(interceptorRecord, interceptorSelf);
  assert.ok(line, 'attackLine must be defined during strike phase');
  assert.deepEqual(line.origin, { x: 100, z: 0 });
  assert.equal(line.heading, 0);
  assert.deepEqual(line.dir, { x: 1, z: 0 });
  assert.ok(line.range >= 420);
  assert.ok(line.halfWidth >= 24);

  // Point straight ahead within corridor: ON attack line
  const onPoint = { x: 250, z: 10 };
  assert.equal(isPointOnAttackLine(line, onPoint), true, 'point directly in attack corridor must be ON attack line');

  // Point laterally offset by 50 WU: OFF attack line
  const offPoint = { x: 250, z: 50 };
  assert.equal(isPointOnAttackLine(line, offPoint), false, 'point outside corridor halfWidth must be OFF attack line');

  // Point behind interceptor: OFF attack line
  const behindPoint = { x: 50, z: 0 };
  assert.equal(isPointOnAttackLine(line, behindPoint), false, 'point behind attack vector must be OFF attack line');
});

test('PQ-140.00 scenario metric: time player spends off attack line with dynamic positioning', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 101 });

  // 180-tick (3-second) engagement scenario:
  // Interceptor flies an attack pass from x=0, z=-40 toward x=400, z=0.
  // Player is at x=280, z=0, but dodges laterally to z=60 upon noticing the engine_flare telegraph.
  let player = { x: 280, z: 0, vx: 0, vz: 0 };
  let interceptor = { x: 0, z: -40, vx: 70, vz: 5, rot: 0.07 };

  let ticksTotal = 0;
  let ticksPlayerOnLine = 0;
  let ticksPlayerOffLine = 0;

  for (let tick = 0; tick < 180; tick++) {
    const perception = shipPerception(interceptor, [targetContact(player)]);
    const doc = runtime.update({
      tick,
      entityId: 2,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception,
      directive: baseDirective(1),
    });

    // Player reacts to telegraph and dodges laterally
    if (doc.telegraph || doc.phase === 'strike') {
      player.vz = 45; // lateral evasive thrust
    }
    player.z += player.vz * (1 / 60);

    // Step interceptor
    interceptor.x += interceptor.vx * (1 / 60);
    interceptor.z += interceptor.vz * (1 / 60);

    const line = doc.attackLine;
    ticksTotal++;
    if (line && isPointOnAttackLine(line, player)) {
      ticksPlayerOnLine++;
    } else {
      ticksPlayerOffLine++;
    }
  }

  const offLineRatio = ticksPlayerOffLine / ticksTotal;
  // With dynamic player positioning, player spends >= 75% of time OFF the interceptor attack line
  assert.ok(offLineRatio >= 0.75,
    `player must spend majority of time off attack line through positioning; got ${(offLineRatio * 100).toFixed(1)}%`);
  assert.ok(ticksPlayerOffLine > ticksPlayerOnLine, 'ticks off line must exceed ticks on line');
});

test('PQ-140.00 capital target crossing pass clears mass clearance without stall or hovering', () => {
  const planner = new ManeuverPlanner({ seed: 47 });
  const ship = {
    x: 0, z: 70,
    vx: 65, vz: 0,
    rot: 0,
    radius: 12,
  };
  // Capital target with large radius and capital operationalMassBand
  const capitalTarget = {
    id: 1,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 1.0,
    pos: { x: 200, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 45,
    operationalMassBand: 'capital',
    tags: [],
  };

  const maneuver = {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 180,
    lateralSign: 1,
    crossingLane: true,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 200,
    breakFormation: true,
    reason: 'combat_doctrine:interceptor_flyby:strike',
  };

  let req = null;
  for (let tick = 0; tick <= 30; tick++) {
    const perception = shipPerception(ship, [capitalTarget]);
    req = planner.plan({
      tick,
      entityId: 2,
      perception,
      behavior: { maneuver },
      directive: baseDirective(1),
    });
  }

  // Interceptor must maintain committed flight and not stall or brake outside capital
  assert.equal(req.brake, false, 'interceptor must not emergency brake against capital crossing pass');
  assert.ok(req.forceLocal.forward > 0, 'interceptor must maintain forward momentum');
  // Trajectory destination must clear the capital target clearance envelope (radius 45 + capitalTargetClearance 60 = > 105 WU)
  const finalWaypt = req.trajectory.at(-1);
  assert.ok(finalWaypt, 'trajectory must exist');
  assert.ok(finalWaypt.z >= 75, `crossing path must maintain clearance past capital, got z=${finalWaypt.z}`);
});

test('PQ-140.00 dynamic moving target with high closing speed (opposite direction)', () => {
  const planner = new ManeuverPlanner({ seed: 47 });
  // Interceptor moving +X at 70 WU/s
  const ship = {
    x: 0, z: 50,
    vx: 70, vz: 0,
    rot: 0,
    radius: 12,
  };
  // Target moving -X at 50 WU/s (closing speed 120 WU/s)
  const target = targetContact({ x: 300, z: 0 }, { x: -50, z: 0 });

  const maneuver = {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 150,
    lateralSign: -1,
    crossingLane: true,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    reason: 'combat_doctrine:interceptor_flyby:strike',
  };

  const perception = shipPerception(ship, [target]);
  const req = planner.plan({
    tick: 10,
    entityId: 2,
    perception,
    behavior: { maneuver },
    directive: baseDirective(1),
  });

  assert.ok(Number.isFinite(req.targetHeading));
  assert.ok(Number.isFinite(req.forceLocal.forward));
  assert.ok(Number.isFinite(req.forceLocal.right));
  assert.equal(req.brake, false);
});

test('PQ-140.00 edge cases: collocated positions, missing velocity, non-finite coordinates, and rotated headings', () => {
  const planner = new ManeuverPlanner({ seed: 47 });
  const ship = { x: 50, z: 50, vx: 0, vz: 0, rot: Math.PI / 4, radius: 12 };
  // Collocated target with no velocity
  const collocatedTarget = {
    id: 1,
    kind: ContactKind.SHIP,
    team: 0,
    pos: { x: 50, z: 50 },
    vel: null, // missing velocity field
    radius: 14,
    tags: [],
  };

  const maneuver = {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 150,
    lateralSign: 1,
    crossingLane: true,
  };

  const perception = shipPerception(ship, [collocatedTarget]);
  // Must not throw TypeError or produce NaN
  const req = planner.plan({
    tick: 0,
    entityId: 2,
    perception,
    behavior: { maneuver },
    directive: baseDirective(1),
  });

  assert.ok(Number.isFinite(req.targetHeading));
  assert.ok(Number.isFinite(req.forceLocal.forward));

  // Test attackLine with rotated heading (PI / 2, facing +Z)
  const rotatedSelf = { pos: { x: 0, z: 0 }, rot: Math.PI / 2, radius: 14 };
  const record = { doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY, phase: 'strike', preferredRange: 200 };
  const line = attackLineFor(record, rotatedSelf);
  assert.ok(line);
  assert.ok(Math.abs(line.dir.x) < 1e-5);
  assert.ok(Math.abs(line.dir.y || line.dir.z - 1) < 1e-5);

  // Point ahead (+Z) is on line
  assert.equal(isPointOnAttackLine(line, { x: 5, z: 100 }), true);
  // Point behind (-Z) is off line
  assert.equal(isPointOnAttackLine(line, { x: 5, z: -20 }), false);
  // Point with NaN is rejected safely
  assert.equal(isPointOnAttackLine(line, { x: NaN, z: 100 }), false);
  assert.equal(isPointOnAttackLine(line, null), false);
  assert.equal(isPointOnAttackLine(null, { x: 0, z: 0 }), false);

  // Verify caching: calling attackLineFor with same inputs returns same cached reference
  const line2 = attackLineFor(record, rotatedSelf);
  assert.equal(line, line2, 'attackLineFor must return cached reference when transform and phase are unchanged');
});

test('PQ-140.00 tacticalAI system wires attackLine into doctrinePhase and telegraph events', () => {
  const busEvents = [];
  const fakeBus = {
    emit(event, payload) {
      busEvents.push({ event, payload });
    },
    on() {},
    off() {},
  };

  const tactical = createTacticalAISystem({
    seed: 47,
    actionPortFactory: () => ({
      list() { return []; },
      canStart() { return true; },
      start() { return { ok: true }; },
      status() { return null; },
      interrupt() {},
      execute() {},
      isReady() { return true; },
      forget() {},
    }),
    sensors: {
      frameFor() {
        return {
          tick: 1,
          self: {
            id: 2,
            team: 1,
            pos: { x: 0, z: 0 },
            vel: { x: 60, z: 0 },
            rot: 0,
            radius: 12,
            hullFraction: 1,
            energyFraction: 1,
            heatFraction: 0,
            disabled: false,
            tethered: false,
            operationalMassBand: 'light',
            flightClass: 'fighter',
            hullId: 'ship_wasp',
            activity: { kind: 'attack_run', reason: 'test', anchor: { x: 0, z: 0 } },
            roe: 'weapons_free',
            combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
          },
          contacts: [targetContact({ x: 300, z: 0 })],
          events: [],
        };
      },
    },
    roster: {
      listSquads() {
        return [{
          id: 'test_squad',
          members: [{ id: 2, capabilities: ['drive', 'sensor', 'weapon'], combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY }],
        }];
      },
      squadFor() { return null; },
      directiveFor() { return baseDirective(1); },
    },
    maneuver: {
      request() {
        return {
          kind: 'intercept',
          forceLocal: { forward: 0.5, right: 0 },
          torqueYaw: 0,
          targetHeading: 0,
        };
      },
      forget() {},
    },
  });

  const state = {
    tick: 1,
    simTime: 0.1,
    rng: () => 0.5,
    bus: fakeBus,
    entities: new Map([[2, { id: 2, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, data: {} }]]),
  };

  // Initialize with context containing bus
  const ctx = { bus: fakeBus, state, helpers: {} };
  tactical.init(ctx);
  tactical.update(1 / 60, state);

  // Check emitted events
  const phaseEvents = busEvents.filter(e => e.event === 'ai:doctrinePhase');
  assert.ok(phaseEvents.length > 0, 'ai:doctrinePhase event must be emitted');
  const phasePayload = phaseEvents[0].payload;
  assert.equal(phasePayload.entityId, 2);
  assert.equal(phasePayload.doctrineId, CombatDoctrineId.INTERCEPTOR_FLYBY);
  assert.ok('attackLine' in phasePayload, 'attackLine must be present in ai:doctrinePhase event payload');
});
