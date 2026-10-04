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
const BAR = CAPABILITY_LAW.towUnderWaySpeed / CAPABILITY_LAW.towUnderWaySeconds;

function kernelTowAccel(tugId, loadMass) {
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
    inertia: 90,
    radius: 14,
  };
  let runtime = createPropulsionRuntime(profile);
  let best = 0;
  // Hold speed at rest so a spooling drive can reach commanded thrust without the
  // governor eating it. The force is whatever stepPropulsion emits.
  for (let i = 0; i < 300; i += 1) {
    body.vel.x = 0;
    body.vel.z = 0;
    const step = stepPropulsion({
      dt: DT,
      body,
      input: { throttle: 1, assistMode: 'newtonian' },
      profile,
      runtime,
    });
    runtime = step.runtime;
    const force = Math.hypot(step.force.x, step.force.z);
    if (force > best) best = force;
  }
  return best / (self + loadMass);
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

test('seed 4242: the named hull, towed on the flight kernel, lands within 20%', () => {
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
      assert.ok(model.crestSentence.includes(expectedSentence), model.crestSentence);
    }
    const verbs = shipCapabilityVerbs({ derived });
    if (name) {
      assert.equal(verbs.tow.verb, `Can tow ${withArticle(name)}`);
      assert.equal(verbs.tow.hullId, named.id);
      const achieved = kernelTowAccel(ship.id, named.mass);
      const err = Math.abs(achieved - BAR) / BAR;
      assert.ok(
        err <= 0.2,
        `${ship.id} towing ${named.id}: kernel ${achieved.toFixed(2)} WU/s^2 vs bar ${BAR} (${(err * 100).toFixed(1)}%)`,
      );
      if (/^[AEIOU]/i.test(name)) {
        vowelCrest = true;
        assert.match(model.towSentence, /^Can tow an /);
      }
    } else if (model.profile.predictions.towCoversRoster) {
      assert.equal(verbs.tow.verb, 'Can tow anything on the roster');
      const achieved = kernelTowAccel(ship.id, heaviest.mass);
      assert.ok(
        achieved > BAR * 1.2,
        `${ship.id} says the roster is easy, but towing ${heaviest.id} made ${achieved.toFixed(2)} vs bar ${BAR}`,
      );
    }
  }
  assert.equal(vowelCrest, true, 'a live fit names a vowel hull, so the article is on the screen');
  const hitch = handlingBandModel({ shipId: 'ship_kestrel', fittings: [] });
  assert.ok(hitch.profile.predictions.towableHullName, 'seed 4242 hitch names a hull');
});
