// VERB-35 — the reversal line is a held reverse thrust, not 2v/a.
//
// The test steps the shipped propulsion kernel itself. It does not call the
// fit-screen helper. A sail with no published reverseAccel still has to speak.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingProfileForShip } from '../src/ui/panels/handlingProfile.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const DT = 1 / 60;

function flownReversalSeconds(shipId) {
  const derived = getDerivedStats(shipId, [], null);
  const self = derived.operationalMass || derived.mass;
  const entity = { id: 'reversal-probe', isPlayer: true, mass: self, data: { derived } };
  const profile = resolvePropulsionProfile(entity, { playerId: 'reversal-probe', seed: 4242 });
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
      const step = stepPropulsion({
        dt: DT, body, input: { throttle: 1, assistMode: 'assisted' }, profile, runtime,
      });
      runtime = step.runtime;
      speed += ((step.force && step.force.x) || 0) / self * DT;
      if (step.telemetry && step.telemetry.spool >= 0.98) break;
    }
  }
  let speed = speed0;
  let ticks = 0;
  while (speed > -speed0 && ticks < 60 * 40) {
    body.vel.x = speed;
    const step = stepPropulsion({
      dt: DT, body, input: { throttle: -1, assistMode: 'assisted' }, profile, runtime,
    });
    runtime = step.runtime;
    speed += ((step.force && step.force.x) || 0) / self * DT;
    ticks += 1;
  }
  assert.ok(speed <= -speed0, `${shipId} never reversed`);
  return ticks * DT;
}

function statedSeconds(shipId) {
  const model = handlingBandModel({ shipId, fittings: [], player: null });
  assert.match(model.crestSentence, /full reversal takes/);
  const match = String(model.reversalSentence).match(/takes ([0-9.]+) s/);
  assert.ok(match, model.reversalSentence);
  return { model, seconds: Number(match[1]) };
}

test('seed 4242 the reversal line is the reverse thrust you hold', () => {
  const hitch = statedSeconds('ship_kestrel');
  const hitchFlown = flownReversalSeconds('ship_kestrel');
  assert.ok(Math.abs(hitch.seconds - hitchFlown) <= 0.15, `${hitch.seconds} vs ${hitchFlown}`);
  const guess = hitch.model.profile.predictions.reversalTimeS;
  assert.ok(Math.abs(hitch.seconds - guess) >= 0.4, `line ${hitch.seconds} still the guess ${guess}`);

  const guessRanger = handlingProfileForShip('ship_ranger', { fittings: [], player: null });
  assert.ok(!(guessRanger.predictions.reversalTimeS > 0));
  const ranger = statedSeconds('ship_ranger');
  const rangerFlown = flownReversalSeconds('ship_ranger');
  assert.ok(Math.abs(ranger.seconds - rangerFlown) <= 0.15, `${ranger.seconds} vs ${rangerFlown}`);
});
