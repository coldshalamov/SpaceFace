// VERB-36 — the inertia line is the hands-off coast, not 1/linearDrag.
//
// The test steps the shipped propulsion kernel. It does not call the
// fit-screen helper. A sail that never slows has to stay silent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const DT = 1 / 60;
const CAP = 60 * 180;
const CRAWL = 1;
const STALL_DROP = 1e-4;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function flownCoastSeconds(shipId, player = null) {
  const derived = getDerivedStats(shipId, [], player);
  const self = derived.operationalMass || derived.mass;
  const entity = { id: 'coast-probe', isPlayer: true, mass: self, data: { derived } };
  const profile = resolvePropulsionProfile(entity, { playerId: 'coast-probe', seed: 4242 });
  const speed0 = profile.combatSpeed || profile.maxSpeed;
  const dead = (profile.assist && profile.assist.deadSpeed) || 0.18;
  let runtime = createPropulsionRuntime(profile);
  const body = {
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: self, inertia: Math.max(1, self), radius: 14,
  };
  const advance = (speed, step) => {
    let next = speed + (finite(step.force && step.force.x, 0) / self) * DT;
    if (step.impulse) next += finite(step.impulse.x, 0) / self;
    return next < 0 ? 0 : next;
  };
  if (profile.family === 'torch') {
    let speed = 0;
    for (let i = 0; i < 240; i += 1) {
      body.vel.x = Math.min(speed, speed0);
      const step = stepPropulsion({
        dt: DT, body, input: { throttle: 1, assistMode: 'assisted' }, profile, runtime,
      });
      runtime = step.runtime;
      speed = advance(speed, step);
      if (step.telemetry && step.telemetry.spool >= 0.98) break;
    }
  }
  let speed = speed0;
  let ticks = 0;
  while (ticks < CAP) {
    const prev = speed;
    body.vel.x = speed;
    const step = stepPropulsion({
      dt: DT, body, input: { throttle: 0, assistMode: 'assisted' }, profile, runtime,
    });
    runtime = step.runtime;
    speed = advance(speed, step);
    ticks += 1;
    if (speed <= dead) return ticks * DT;
    if (speed <= CRAWL && speed > prev - STALL_DROP) return ticks * DT;
  }
  return 0;
}

function inertiaLine(shipId, player = null) {
  const model = handlingBandModel({ shipId, fittings: [], player });
  const bar = model.bars.find((row) => row.id === 'inertia');
  assert.ok(bar && bar.why, `${shipId} inertia line`);
  return bar.why;
}

function statedSeconds(why) {
  const match = String(why).match(/still moving for ([0-9.]+) s/);
  assert.ok(match, why);
  return Number(match[1]);
}

test('seed 4242 the inertia line is the coast after you let go', () => {
  const hitchWhy = inertiaLine('ship_kestrel');
  const hitchFlown = flownCoastSeconds('ship_kestrel');
  const hitch = statedSeconds(hitchWhy);
  assert.ok(Math.abs(hitch - hitchFlown) <= 0.15, `${hitch} vs ${hitchFlown}`);
  const hitchDerived = getDerivedStats('ship_kestrel', [], null);
  const dragGuess = 1 / hitchDerived.flightModel.linearDrag;
  assert.ok(Math.abs(hitch - dragGuess) >= 8, `line ${hitch} still the drag guess ${dragGuess}`);
  assert.doesNotMatch(hitchWhy, /change your mind/);

  const loadedPlayer = { cargo: { usedMass: 80 } };
  const loadedWhy = inertiaLine('ship_kestrel', loadedPlayer);
  const loaded = statedSeconds(loadedWhy);
  const loadedFlown = flownCoastSeconds('ship_kestrel', loadedPlayer);
  assert.ok(Math.abs(loaded - loadedFlown) <= 0.15, `${loaded} vs ${loadedFlown}`);
  assert.equal(loaded, hitch);
  assert.match(loadedWhy, /costs you \d+% of your push/);
  const loadedDrag = 1 / getDerivedStats('ship_kestrel', [], loadedPlayer).flightModel.linearDrag;
  assert.ok(Math.abs(loaded - loadedDrag) >= 8, `loaded line ${loaded} still ${loadedDrag}`);

  const ironWhy = inertiaLine('ship_ironback');
  const iron = statedSeconds(ironWhy);
  const ironFlown = flownCoastSeconds('ship_ironback');
  assert.ok(Math.abs(iron - ironFlown) <= 0.15, `${iron} vs ${ironFlown}`);
  assert.ok(iron >= 10, `ironback ${iron} is still the drag tenth`);

  const hawserWhy = inertiaLine('ship_hawser');
  const hawser = statedSeconds(hawserWhy);
  const hawserFlown = flownCoastSeconds('ship_hawser');
  assert.ok(Math.abs(hawser - hawserFlown) <= 0.15, `${hawser} vs ${hawserFlown}`);

  const rangerWhy = inertiaLine('ship_ranger');
  assert.equal(flownCoastSeconds('ship_ranger'), 0);
  assert.doesNotMatch(rangerWhy, /still moving/);
  assert.doesNotMatch(rangerWhy, /change your mind/);
});
