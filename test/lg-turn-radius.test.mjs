// VERB-37 — the turn line is the circle a held turn flies.
//
// The test steps the shipped propulsion kernel with velocity vectoring on.
// It does not call the fit-screen helper. Fight speed over the yaw ceiling
// is the old line, and it must not pass.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const DT = 1 / 60;
const HOLD = 60 * 12;
const WINDOW = 60 * 2;
const STEADY = 0.15;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function flownCircle(shipId) {
  const derived = getDerivedStats(shipId, [], null);
  const self = derived.operationalMass || derived.mass;
  const entity = { id: 'turn-probe', isPlayer: true, mass: self, data: { derived } };
  const profile = resolvePropulsionProfile(entity, { playerId: 'turn-probe', seed: 4242 });
  const speed0 = profile.combatSpeed || profile.maxSpeed;
  let runtime = createPropulsionRuntime(profile);
  const body = {
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: self, inertia: Math.max(1, self), radius: 14,
  };
  if (profile.family === 'torch') {
    let speed = 0;
    for (let i = 0; i < 240; i += 1) {
      body.vel.x = Math.min(speed, speed0);
      body.vel.z = 0;
      const step = stepPropulsion({
        dt: DT, body,
        input: { throttle: 1, assistMode: 'assisted', velocityVectoring: true },
        profile, runtime,
      });
      runtime = step.runtime;
      speed += (finite(step.force && step.force.x, 0) / self) * DT;
      if (speed < 0) speed = 0;
      if (step.telemetry && step.telemetry.spool >= 0.98) break;
    }
  }
  body.vel.x = speed0;
  body.vel.z = 0;
  body.rot = 0;
  body.angVel = 0;
  const radii = [];
  const speeds = [];
  let heading = 0;
  for (let i = 0; i < HOLD; i += 1) {
    const step = stepPropulsion({
      dt: DT, body,
      input: { throttle: 1, turn: 1, assistMode: 'assisted', velocityVectoring: true },
      profile, runtime,
    });
    runtime = step.runtime;
    body.vel.x += (finite(step.force && step.force.x, 0) / self) * DT;
    body.vel.z += (finite(step.force && step.force.z, 0) / self) * DT;
    if (step.impulse) {
      body.vel.x += finite(step.impulse.x, 0) / self;
      body.vel.z += finite(step.impulse.z, 0) / self;
    }
    body.angVel += finite(step.telemetry && step.telemetry.angularAcceleration, 0) * DT;
    body.rot += body.angVel * DT;
    const nextHeading = Math.atan2(body.vel.z, body.vel.x);
    let dHead = nextHeading - heading;
    while (dHead > Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    heading = nextHeading;
    if (i < HOLD - WINDOW) continue;
    const speed = Math.hypot(body.vel.x, body.vel.z);
    const pathRate = dHead / DT;
    speeds.push(speed);
    if (Math.abs(pathRate) > 1e-6) radii.push(speed / Math.abs(pathRate));
  }
  if (radii.length < WINDOW / 2) return { radius: 0, atFightSpeed: false };
  const mean = radii.reduce((sum, n) => sum + n, 0) / radii.length;
  const variance = radii.reduce((sum, n) => sum + (n - mean) ** 2, 0) / radii.length;
  if (!(mean > 0) || Math.sqrt(variance) / mean > STEADY) return { radius: 0, atFightSpeed: false };
  const meanSpeed = speeds.reduce((sum, n) => sum + n, 0) / speeds.length;
  return {
    radius: mean,
    atFightSpeed: Math.abs(meanSpeed - speed0) / speed0 <= STEADY,
  };
}

function statedMetres(shipId) {
  const model = handlingBandModel({ shipId, fittings: [], player: null });
  const guess = model.profile.predictions.turnRadiusWu;
  return { model, guess };
}

test('seed 4242 the turn line is the circle you fly', () => {
  const hitch = statedMetres('ship_kestrel');
  const hitchFlown = flownCircle('ship_kestrel');
  const hitchMatch = hitch.model.turnSentence.match(/At fight speed the turn radius is (\d+) m/);
  assert.ok(hitchMatch, hitch.model.turnSentence);
  const hitchMetres = Number(hitchMatch[1]);
  assert.ok(Math.abs(hitchMetres - hitchFlown.radius) <= 2, `${hitchMetres} vs ${hitchFlown.radius}`);
  assert.ok(hitchFlown.atFightSpeed);
  // SF-2b (#3): the cruise W+turn now flies ~0.57 of max yaw (was ~0.33), so the real circle
  // (~139 m unfitted) sits closer to the yaw-cap guess (~80 m) than the old ~230 m did. The line
  // must still be the flown circle, not that guess.
  assert.ok(Math.abs(hitchMetres - Math.round(hitch.guess)) >= 40, `line ${hitchMetres} still the yaw-cap guess ${hitch.guess}`);

  const hawser = statedMetres('ship_hawser');
  const hawserFlown = flownCircle('ship_hawser');
  const hawserMatch = hawser.model.turnSentence.match(/At fight speed the turn radius is (\d+) m/);
  assert.ok(hawserMatch, hawser.model.turnSentence);
  const hawserMetres = Number(hawserMatch[1]);
  assert.ok(Math.abs(hawserMetres - hawserFlown.radius) <= 2, `${hawserMetres} vs ${hawserFlown.radius}`);
  assert.ok(Math.abs(hawserMetres - Math.round(hawser.guess)) >= 50, `hawser ${hawserMetres} still ${hawser.guess}`);

  const hornet = statedMetres('ship_hornet');
  const hornetFlown = flownCircle('ship_hornet');
  assert.equal(hornetFlown.atFightSpeed, false);
  const hornetMatch = hornet.model.turnSentence.match(/Holding the turn, the turn radius is (\d+) m/);
  assert.ok(hornetMatch, hornet.model.turnSentence);
  assert.doesNotMatch(hornet.model.turnSentence, /At fight speed/);
  const hornetMetres = Number(hornetMatch[1]);
  assert.ok(Math.abs(hornetMetres - hornetFlown.radius) <= 2, `${hornetMetres} vs ${hornetFlown.radius}`);
  assert.ok(Math.abs(hornetMetres - Math.round(hornet.guess)) >= 20);

  const ranger = statedMetres('ship_ranger');
  assert.ok(ranger.guess > 0);
  assert.equal(ranger.model.turnSentence, '');
  assert.equal(flownCircle('ship_ranger').radius, 0);

  const iron = statedMetres('ship_ironback');
  assert.ok(iron.guess > 0);
  assert.equal(iron.model.turnSentence, '');
  assert.equal(flownCircle('ship_ironback').radius, 0);
});
