#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ManeuverKind, wrapAngle } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

const ENTITY_ID = 101;
const TARGET_ID = 900;

const orbitMetrics = runManeuverProbe(ManeuverKind.ORBIT, 220, 180);
assert.equal(orbitMetrics.nonEmergencyBoosts, 0, 'orbit/standoff ships must not afterburner through the player by default');
assert.ok(orbitMetrics.maxTorqueDelta <= 0.15, `orbit torque request snapped by ${orbitMetrics.maxTorqueDelta}`);
assert.ok(orbitMetrics.maxForceDelta <= 0.18, `orbit thrust request snapped by ${orbitMetrics.maxForceDelta}`);
assert.ok(orbitMetrics.highFrequencyYawFlips <= 1, `orbit produced ${orbitMetrics.highFrequencyYawFlips} high-frequency yaw flip-flops`);
assert.ok(orbitMetrics.maxObservedSpeed <= 118, `orbit speed envelope leaked to ${orbitMetrics.maxObservedSpeed}`);

const interceptMetrics = runManeuverProbe(ManeuverKind.INTERCEPT, 620, 180);
assert.equal(interceptMetrics.nonEmergencyBoosts, 0, 'intercept ships must close under controlled thrust, not routine boost bursts');
assert.ok(interceptMetrics.maxTorqueDelta <= 0.15, `intercept torque request snapped by ${interceptMetrics.maxTorqueDelta}`);
assert.ok(interceptMetrics.maxForceDelta <= 0.18, `intercept thrust request snapped by ${interceptMetrics.maxForceDelta}`);
assert.ok(interceptMetrics.highFrequencyYawFlips <= 1, `intercept produced ${interceptMetrics.highFrequencyYawFlips} high-frequency yaw flip-flops`);
assert.ok(interceptMetrics.maxObservedSpeed <= 132, `intercept speed envelope leaked to ${interceptMetrics.maxObservedSpeed}`);

const escapeMetrics = runManeuverProbe(ManeuverKind.ESCAPE_TETHER, 120, 90, { tether: true });
assert.ok(escapeMetrics.boostRequests > 0, 'escape-tether remains allowed to boost once aligned because that is an authored counter-tether move');

process.stdout.write(JSON.stringify({
  schema: 'spaceface.sg06.maneuver_stability.v1',
  orbit: orbitMetrics,
  intercept: interceptMetrics,
  escapeTether: escapeMetrics,
}, null, 2) + '\n');

function runManeuverProbe(kind, initialDistance, ticks, options = {}) {
  const planner = new ManeuverPlanner({ seed: 0x6a1f0611 });
  const self = {
    id: ENTITY_ID,
    team: 1,
    pos: { x: -initialDistance, z: options.tether ? 0 : -40 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    hullFraction: 1,
    energyFraction: 1,
    heatFraction: 0,
    disabled: false,
    tethered: !!options.tether,
    capabilities: ['drive', 'weapon', 'sensor'],
    subsystemFractions: {},
  };
  const target = {
    id: TARGET_ID,
    kind: options.tether ? 'tether' : 'ship',
    team: 0,
    classification: options.tether ? 'massline' : 'player_ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: options.tether ? 2 : 15,
    confidence: 1,
    threat: 0.85,
    tags: options.tether ? ['hostile', 'overloadable'] : ['armed'],
  };
  const friendly = {
    id: 102,
    kind: 'ship',
    team: 1,
    classification: 'wingmate',
    pos: { x: self.pos.x - 32, z: self.pos.z + 18 },
    vel: { x: 0, z: 0 },
    radius: 12,
    confidence: 1,
    threat: 0,
    tags: [],
  };

  let previous = null;
  const metrics = {
    maxTorqueDelta: 0,
    maxForceDelta: 0,
    highFrequencyYawFlips: 0,
    boostRequests: 0,
    nonEmergencyBoosts: 0,
    brakeRequests: 0,
    maxObservedSpeed: 0,
  };

  for (let tick = 0; tick < ticks; tick++) {
    if (!options.tether) {
      target.pos.x = Math.sin(tick / 90) * 18;
      target.pos.z = Math.cos(tick / 120) * 14;
    }
    const request = planner.plan({
      tick,
      entityId: ENTITY_ID,
      perception: {
        tick,
        self: cloneSelf(self),
        contacts: [target, friendly],
        events: [],
      },
      behavior: {
        maneuver: {
          kind,
          targetId: TARGET_ID,
          preferredRange: kind === ManeuverKind.ORBIT ? 240 : 0,
          formationSlot: { x: -initialDistance, z: 0 },
          formationVelocity: { x: 0, z: 0 },
          formationBound: 170,
          breakFormation: true,
          reason: `${kind}_stability_probe`,
        },
      },
      directive: {
        squadId: 'stability_probe',
        formation: {
          slot: { x: -initialDistance, z: 0 },
          velocity: { x: 0, z: 0 },
          bound: 170,
          breakFormation: true,
        },
      },
    });

    if (request.boost) metrics.boostRequests++;
    if (request.boost && kind !== ManeuverKind.RETREAT && kind !== ManeuverKind.ESCAPE_TETHER && kind !== ManeuverKind.CLEAR_DEADLOCK) {
      metrics.nonEmergencyBoosts++;
    }
    if (request.brake) metrics.brakeRequests++;
    if (previous) {
      metrics.maxTorqueDelta = Math.max(metrics.maxTorqueDelta, round6(Math.abs(request.torqueYaw - previous.torqueYaw)));
      const forceDelta = Math.hypot(
        request.forceLocal.forward - previous.forceLocal.forward,
        request.forceLocal.right - previous.forceLocal.right,
      );
      metrics.maxForceDelta = Math.max(metrics.maxForceDelta, round6(forceDelta));
      if (Math.sign(request.torqueYaw) !== Math.sign(previous.torqueYaw) && Math.abs(request.torqueYaw) > 0.24 && Math.abs(previous.torqueYaw) > 0.24) {
        metrics.highFrequencyYawFlips++;
      }
    }
    integrate(self, request);
    metrics.maxObservedSpeed = Math.max(metrics.maxObservedSpeed, round6(Math.hypot(self.vel.x, self.vel.z)));
    previous = request;
  }
  return metrics;
}

function integrate(self, request) {
  const dt = 1 / 60;
  const headingError = wrapAngle(request.targetHeading - self.rot);
  self.rot = wrapAngle(self.rot + clamp(headingError, -0.18, 0.18) * 0.52 + request.torqueYaw * 0.018);
  const c = Math.cos(self.rot), s = Math.sin(self.rot);
  const accel = request.boost ? 220 : 150;
  self.vel.x += (c * request.forceLocal.forward - s * request.forceLocal.right) * accel * dt;
  self.vel.z += (s * request.forceLocal.forward + c * request.forceLocal.right) * accel * dt;
  const drag = request.brake ? 0.84 : 0.985;
  self.vel.x *= drag;
  self.vel.z *= drag;
  self.pos.x += self.vel.x * dt;
  self.pos.z += self.vel.z * dt;
  self.energyFraction = Math.min(1, self.energyFraction + 0.0025);
  self.heatFraction = Math.max(0, self.heatFraction - 0.0035);
}

function cloneSelf(self) {
  return {
    ...self,
    pos: { ...self.pos },
    vel: { ...self.vel },
    capabilities: self.capabilities.slice(),
    subsystemFractions: { ...self.subsystemFractions },
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
