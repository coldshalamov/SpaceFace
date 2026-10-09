// Row 278 LG-TOW-PREDICT — the fit screen predicts tow class before you pay (M2).
//
// Done when: the predicted hull, towed on the player flight kernel, lands within 20%
// of the under-way bar on seed 4242, and the fit screen names that hull with the
// same article the capability chip uses. The kernel step is the measurement. Rebuilding
// towClassMassFor from the published accel is not a tow.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import {
  CAPABILITY_LAW,
  shipCapabilityVerbs,
  towClassMassFor,
  withArticle,
} from '../src/systems/shipCapabilities.js';
import { handlingProfileForShip } from '../src/ui/panels/handlingProfile.js';
import { handlingBandModel, towSentence } from '../src/ui/ship/shipBandModels.js';
import { SHIPS } from '../src/data/ships.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';

const SEED = 4242;
const DT = 1 / 60;
const WINDOW_S = CAPABILITY_LAW.towUnderWaySeconds;
const TARGET_SPEED = CAPABILITY_LAW.towUnderWaySpeed;

/** Independent of underwayTowSpeed: a 1.5 s assisted hold, speed kept, force shared with the load. */
function towSpeedAtWindow(tugId, loadMass) {
  const derived = getDerivedStats(tugId, [], null);
  const self = derived.operationalMass || derived.mass || 0;
  const entity = { id: 'pilot', isPlayer: true, mass: self, data: { derived } };
  const state = { playerId: 'pilot', seed: SEED };
  assert.equal(state.seed, SEED);
  const profile = resolvePropulsionProfile(entity, state);
  const body = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: self,
    inertia: Math.max(1, self),
    radius: 14,
  };
  let runtime = createPropulsionRuntime(profile);
  let speed = 0;
  const ticks = Math.max(1, Math.round(WINDOW_S / DT));
  const coupled = self + loadMass;
  for (let i = 0; i < ticks; i += 1) {
    body.vel.x = speed;
    body.vel.z = 0;
    const step = stepPropulsion({
      dt: DT,
      body,
      input: { throttle: 1, assistMode: 'assisted' },
      profile,
      runtime,
    });
    runtime = step.runtime;
    speed += (Number(step.force.x) || 0) / coupled * DT;
    if (speed < 0) speed = 0;
  }
  return speed;
}

test('predictions carry tow class off the live tow law (seed 4242)', () => {
  const profile = handlingProfileForShip('ship_kestrel', { fittings: [] });
  const derived = getDerivedStats('ship_kestrel', [], null);
  const expected = towClassMassFor(derived);
  assert.ok(Number.isFinite(profile.predictions.towClassMassT), 'towClassMassT is a number');
  assert.equal(profile.predictions.towClassMassT, Math.round(expected * 1000) / 1000);
});

test('the crest uses an before a vowel hull', () => {
  assert.equal(towSentence({ towableHullName: 'Atlas' }), 'Can tow an Atlas.');
  assert.equal(towSentence({ towableHullName: 'Ironback' }), 'Can tow an Ironback.');
  assert.equal(towSentence({ towableHullName: 'Hawser' }), 'Can tow a Hawser.');
  assert.equal(towSentence({ towableHullName: '' }), '');
  assert.equal(towSentence({ towCoversRoster: true }), 'Can tow anything on the roster.');
});

test('seed 4242: a 1.5 s tow of the named hull lands within 20% of 60 WU/s', () => {
  let vowelCrest = false;
  const heaviest = SHIPS.reduce((best, ship) => (ship.mass > best.mass ? ship : best));
  for (const ship of SHIPS) {
    const derived = getDerivedStats(ship.id, [], null);
    const model = handlingBandModel({ shipId: ship.id, fittings: [] });
    const name = model.profile.predictions.towableHullName;
    const named = SHIPS.find((row) => row.id === model.profile.predictions.towableHullId);
    const expectedSentence = name
      ? `Can tow ${withArticle(name)}.`
      : (model.profile.predictions.towCoversRoster ? 'Can tow anything on the roster.' : '');
    assert.equal(model.towSentence, expectedSentence, ship.id);
    if (expectedSentence) {
      assert.ok(model.crestSentence.startsWith(expectedSentence), model.crestSentence);
    }
    const verbs = shipCapabilityVerbs({ derived });
    if (name) {
      assert.equal(verbs.tow.verb, `Can tow ${withArticle(name)}`);
      assert.equal(verbs.tow.hullId, named.id);
      const speed = towSpeedAtWindow(ship.id, named.mass);
      const err = Math.abs(speed - TARGET_SPEED) / TARGET_SPEED;
      assert.ok(
        err <= 0.2,
        `${ship.id} towing ${named.id}: ${speed.toFixed(1)} WU/s after ${WINDOW_S} s vs ${TARGET_SPEED} (${(err * 100).toFixed(1)}%)`,
      );
      if (/^[AEIOU]/i.test(name)) {
        vowelCrest = true;
        assert.match(model.towSentence, /^Can tow an /);
      }
    } else if (model.profile.predictions.towCoversRoster) {
      assert.equal(verbs.tow.verb, 'Can tow anything on the roster');
      const speed = towSpeedAtWindow(ship.id, heaviest.mass);
      assert.ok(
        speed >= TARGET_SPEED * 0.8,
        `${ship.id} says any hull is under way, but ${heaviest.id} made ${speed.toFixed(1)} WU/s in ${WINDOW_S} s`,
      );
    }
  }
  assert.equal(vowelCrest, true, 'a live fit names a vowel hull, so the article is on the screen');
  const hitch = handlingBandModel({ shipId: 'ship_kestrel', fittings: [] });
  assert.ok(hitch.profile.predictions.towableHullName, 'seed 4242 hitch names a hull');
});
