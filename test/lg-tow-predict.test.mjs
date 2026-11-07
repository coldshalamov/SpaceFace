// Row 278 LG-TOW-PREDICT — the fit screen predicts tow class before you pay (M2).
//
// ONE RATING. The value the fit screen predicts, the Ship Sheet prints as Muscle, and the
// capability band names a hull from are all `towClassMassFor`. The old version of this file also
// asserted a 1.5 s kernel window; that window is still a live measurement of the drive, but it is
// not a second rating and must not choose a different hull on the same screen.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import {
  hasTowRating,
  heaviestHullWithin,
  shipCapabilityVerbs,
  towClassMassFor,
  withArticle,
} from '../src/systems/shipCapabilities.js';
import { handlingProfileForShip } from '../src/ui/panels/handlingProfile.js';
import { handlingBandModel, towSentence } from '../src/ui/ship/shipBandModels.js';
import { SHIPS } from '../src/data/ships.js';

const heaviestRosterHull = SHIPS.reduce((best, ship) => (ship.mass > best.mass ? ship : best));

test('predictions carry tow class off the live tow rating', () => {
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

test('every hull names the heaviest roster hull its printed rating covers', () => {
  let vowelCrest = false;
  for (const ship of SHIPS) {
    const derived = getDerivedStats(ship.id, [], null);
    const rating = towClassMassFor(derived);
    const model = handlingBandModel({ shipId: ship.id, fittings: [] });
    const name = model.profile.predictions.towableHullName;
    const named = SHIPS.find((row) => row.id === model.profile.predictions.towableHullId);
    const expected = hasTowRating(derived) && rating > 0
      ? (rating + 1e-9 >= heaviestRosterHull.mass
        ? null
        : heaviestHullWithin(rating))
      : null;
    assert.equal((named && named.id) || null, (expected && expected.id) || null, `${ship.id} names its rating hull`);
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
      assert.match(verbs.tow.why, /rated for/);
      assert.doesNotMatch(verbs.tow.why, /60 WU\/s/);
      if (/^[AEIOU]/i.test(name)) {
        vowelCrest = true;
        assert.match(model.towSentence, /^Can tow an /);
      }
    } else if (model.profile.predictions.towCoversRoster) {
      assert.equal(verbs.tow.verb, 'Can tow anything on the roster');
      assert.ok(rating + 1e-9 >= heaviestRosterHull.mass);
    } else if (!hasTowRating(derived)) {
      assert.equal(verbs.tow.verb, 'No Line load — this hull rams instead');
      assert.equal(verbs.tow.hasTowRating, false);
    }
  }
  assert.equal(vowelCrest, true, 'a live fit names a vowel hull, so the article is on the screen');
  const hitch = handlingBandModel({ shipId: 'ship_kestrel', fittings: [] });
  assert.ok(hitch.profile.predictions.towableHullName, 'the Hitch names a hull');
});
