// VERB-31 — the fit screen's stop line is a held brake from fight speed.
//
// The brake bar used to print v²/2a off the published reverse acceleration. That is not the
// brake the player holds. This test drives stepPropulsion itself and reads the sentence.
// It does not call the screen's distance helper. A torch is brought up to a spooled fight
// speed first, because that is what "flat out" is. A hull whose speed does not fall does
// not get to claim a distance.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const DT = 1 / 60;
const SEED = 4242;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function statedStop(model) {
  const bar = model && model.bars && model.bars.find((row) => row.id === 'brake');
  const why = (bar && bar.why) || '';
  const match = why.match(/need (\d+) m to stop/);
  return match ? Number(match[1]) : null;
}

/** Metres a held assisted brake uses, measured on the flight tick. 0 means it does not stop. */
function flownStopMetres(shipId, player = null) {
  const derived = getDerivedStats(shipId, [], player);
  const self = finite(derived && derived.operationalMass, finite(derived && derived.mass, 0));
  if (!(self > 0)) return 0;
  const entity = { id: 'stop-predict', isPlayer: true, mass: self, data: { derived } };
  const state = { playerId: 'stop-predict', seed: SEED };
  assert.equal(state.seed, 4242);
  const profile = resolvePropulsionProfile(entity, state);
  const speed0 = finite(profile && profile.combatSpeed, finite(profile && profile.maxSpeed, 0));
  if (!(speed0 > 0)) return 0;
  const dead = finite(profile.assist && profile.assist.deadSpeed, 0.18);
  let runtime = createPropulsionRuntime(profile);
  const body = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: self,
    inertia: Math.max(1, self),
    radius: 14,
  };
  if (profile.family === 'torch') {
    let speed = 0;
    for (let i = 0; i < 60 * 4; i += 1) {
      body.vel.x = Math.min(speed, speed0);
      body.vel.z = 0;
      const step = stepPropulsion({
        dt: DT,
        body,
        input: { throttle: 1, assistMode: 'assisted' },
        profile,
        runtime,
      });
      runtime = step.runtime;
      speed += (finite(step.force && step.force.x, 0) / self) * DT;
      if (speed < 0) speed = 0;
      if (step.telemetry && step.telemetry.spool >= 0.98) break;
    }
  }
  let speed = speed0;
  let dist = 0;
  let ticks = 0;
  while (speed > dead && ticks < 60 * 20) {
    body.vel.x = speed;
    body.vel.z = 0;
    const step = stepPropulsion({
      dt: DT,
      body,
      input: { throttle: 0, brake: true, assistMode: 'assisted' },
      profile,
      runtime,
    });
    runtime = step.runtime;
    const v0 = speed;
    speed += (finite(step.force && step.force.x, 0) / self) * DT;
    if (speed < 0) speed = 0;
    dist += ((v0 + speed) / 2) * DT;
    ticks += 1;
  }
  if (!(speed <= dead)) return 0;
  return dist;
}

test('seed 4242 the fit screen stop line matches a held brake', () => {
  let named = 0;
  let silent = 0;
  for (const ship of SHIPS) {
    const flown = flownStopMetres(ship.id);
    const stated = statedStop(handlingBandModel({ shipId: ship.id, fittings: [] }));
    if (!(flown > 0)) {
      assert.equal(stated, null, `${ship.id} does not claim a stop it does not fly`);
      silent += 1;
      continue;
    }
    assert.ok(stated != null, `${ship.id} names the stop`);
    assert.ok(Math.abs(stated - Math.round(flown)) <= 2, `${ship.id} says ${stated} m, the brake uses ${Math.round(flown)} m`);
    named += 1;
  }
  assert.ok(named >= 8, 'the roster that can stop says so');
  assert.ok(silent >= 1, 'a hull that does not slow stays quiet');

  const hitchDerived = getDerivedStats('ship_kestrel', []);
  const published = hitchDerived.propulsion;
  const quadratic = (published.combatSpeed * published.combatSpeed) / (2 * published.reverseAccel);
  const empty = statedStop(handlingBandModel({ shipId: 'ship_kestrel', fittings: [] }));
  assert.ok(Math.abs(empty - Math.round(quadratic)) > 20, 'the line is not v squared over twice the published reverse acceleration');
  const loadedPlayer = { cargo: { usedMass: 80 } };
  const loaded = statedStop(handlingBandModel({
    shipId: 'ship_kestrel',
    fittings: [],
    player: loadedPlayer,
  }));
  const loadedFlown = flownStopMetres('ship_kestrel', loadedPlayer);
  assert.ok(loaded > empty, 'a loaded Hitch is told it needs more room');
  assert.ok(Math.abs(loaded - Math.round(loadedFlown)) <= 2, 'the loaded line is the loaded brake');
});
