// PQ-142.00 — "capabilities, not percentages".
//
// The packet's own failure mode is the thing these tests refuse: "shipping a capability as a
// percentage". Every one of the four verbs has to be a sentence about a thing you can now do, with
// a physical number behind it, and it has to change when the fit changes — including when the only
// thing that changed is what is in the hold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDerivedStats } from '../src/systems/ships.js';
import {
  CAPABILITY_LAW,
  fieldDeployFor,
  shipCapabilityVerbs,
  slamSurvivalSpeedFor,
  towClassMassFor,
} from '../src/systems/shipCapabilities.js';
import { capabilityBandModel } from '../src/ui/ship/shipBandModels.js';

const HITCH = 'ship_kestrel';
const STARTER_FIT = ['wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', null, null];
const DRIFTER = 'ship_drifter';
const DRIFTER_BARE = [null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, null, null, null];
const DRIFTER_CHAFF = [null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, 'mod_chaff_dispenser_m', null, null];

const VERB_SENTENCE =
  'An upgrade makes the player imagine a possibility, not compare a percentage.';

function verbsFor(shipId, fittings, holdMassT = 0) {
  const derived = getDerivedStats(shipId, fittings, { isPlayer: true, cargo: { usedMass: holdMassT } });
  return { derived, verbs: shipCapabilityVerbs({ derived, fittings }) };
}

test('every fit states all four physical verbs, always', () => {
  const cases = [
    [HITCH, [], 0],
    [HITCH, STARTER_FIT, 0],
    [HITCH, STARTER_FIT, 200],
    [DRIFTER, DRIFTER_BARE, 0],
    [DRIFTER, DRIFTER_CHAFF, 400],
    ['ship_atlas', [], 0],
  ];
  for (const [shipId, fittings, hold] of cases) {
    const { verbs } = verbsFor(shipId, fittings, hold);
    assert.deepEqual(
      verbs.rows.map((row) => row.id),
      ['tow_class', 'slam_survival', 'line_load', 'field_deploy'],
      `${VERB_SENTENCE} — ${shipId} must state all four verbs in the canonical order`,
    );
    for (const row of verbs.rows) {
      assert.equal(typeof row.verb, 'string', `${shipId} ${row.id} must state a sentence`);
      assert.ok(row.verb.length > 0, `${shipId} ${row.id} sentence must not be empty`);
      assert.ok(typeof row.why === 'string' && row.why.length > 0, `${shipId} ${row.id} must explain itself`);
    }
  }
});

test('not one of the four verbs is a percentage', () => {
  const { verbs } = verbsFor(DRIFTER, DRIFTER_CHAFF, 100);
  for (const row of verbs.rows) {
    assert.ok(
      !row.verb.includes('%'),
      `${VERB_SENTENCE} — "${row.verb}" reads as a percentage`,
    );
    assert.ok(
      !String(row.sub || '').includes('%'),
      `${VERB_SENTENCE} — the sub-line "${row.sub}" reads as a percentage`,
    );
  }
});

test('the tow verb names a ship, and a full hold takes it away', () => {
  const empty = verbsFor(HITCH, STARTER_FIT, 0);
  const loaded = verbsFor(HITCH, STARTER_FIT, 200);
  assert.match(empty.verbs.tow.verb, /^Can tow an? \w+/, 'the empty hull names the heaviest hull it can tow');
  assert.ok(empty.verbs.tow.hullName, 'the empty hull has a tow class');
  assert.equal(loaded.verbs.tow.hullName, null, 'a full hold leaves nothing to spare for a tow');
  assert.ok(
    towClassMassFor(empty.derived) > towClassMassFor(loaded.derived),
    'tow class must fall as the ship is loaded — the same mass law the drive obeys',
  );
});

test('the slam verb is the closing speed the live crumple law writes this hull off at', () => {
  const empty = verbsFor(HITCH, STARTER_FIT, 0);
  const slam = slamSurvivalSpeedFor(empty.derived);
  assert.equal(slam.unbreakable, false, 'a starter hull is breakable by rock');
  assert.ok(slam.speedWuPerS > 30 && slam.speedWuPerS < 200,
    `a starter hull should die to rock somewhere in the fighting band, got ${slam.speedWuPerS}`);
  assert.match(empty.verbs.slam.verb, /Survives rock up to \d+ WU\/s/);

  const loaded = verbsFor(HITCH, STARTER_FIT, 200);
  assert.equal(slamSurvivalSpeedFor(loaded.derived).unbreakable, true,
    'mass is the crumple law\'s denominator: a loaded hull is the one thing a rock cannot write off');
  assert.equal(loaded.verbs.slam.isWall, true,
    'past the heavy-as-terrain mass the hull IS the wall, and the sentence says so');
});

test('the line verb falls as the ship is loaded and names a reachable swing on a rated line', () => {
  const snareFit = [null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, 'mod_transverse_snare_m', null, null];
  const empty = verbsFor(DRIFTER, snareFit, 0);
  const loaded = verbsFor(DRIFTER, snareFit, 200);
  assert.ok(empty.verbs.line.speedWuPerS > loaded.verbs.line.speedWuPerS,
    'everything you carry pulls the rated swing down');
  assert.equal(empty.verbs.line.reachable, true, 'a fitted snare line has a swing speed you can actually reach');
  assert.match(empty.verbs.line.verb, /Line holds a \d+ WU\/s swing/);
  assert.equal(CAPABILITY_LAW.lineSwingRadiusWu, 100,
    'the line verb quotes FEEL_CONTRACT B7\'s own 100 WU reference line');
});

test('the field verb is a thing you cannot do at all without the module', () => {
  assert.equal(fieldDeployFor(DRIFTER_BARE).available, false);
  const withKit = fieldDeployFor(DRIFTER_CHAFF);
  assert.equal(withKit.available, true);
  assert.ok(withKit.radiusWu > 0 && withKit.durationS > 0, 'a field has a size and a life');
  const bare = verbsFor(DRIFTER, DRIFTER_BARE, 0);
  const kitted = verbsFor(DRIFTER, DRIFTER_CHAFF, 0);
  assert.equal(bare.verbs.field.verb, 'Cannot deploy a field');
  assert.match(kitted.verbs.field.verb, /Can deploy a chaff cloud \d+ m across/);
});

test('the fit screen states the four verbs first, ahead of every module chip', () => {
  const derived = getDerivedStats(DRIFTER, DRIFTER_CHAFF, { isPlayer: true, cargo: { usedMass: 0 } });
  const model = capabilityBandModel({ derived, state: { player: {} }, fittings: DRIFTER_CHAFF });
  const ids = model.chips.map((chip) => chip.id);
  assert.deepEqual(
    ids.slice(0, 4),
    ['tow_class', 'slam_survival', 'line_load', 'field_deploy'],
    'the physical verbs are the answer to "what can I do now?" and lead the rack',
  );
  for (const chip of model.chips.slice(0, 4)) {
    assert.ok(chip.why && chip.why.length > 20, `${chip.id} carries its own why on the chip`);
  }
});

test('the live Shipworks screen hands the fit to the capability band', () => {
  const source = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');
  const call = source.match(/capabilityBandModel\(\{[\s\S]{0,400}?\}\)/);
  assert.ok(call, 'Shipworks must build its capability band from capabilityBandModel');
  assert.match(
    call[0],
    /fittings/,
    'the field-deploy verb is a question about what is bolted on, so the live screen must pass the fit itself',
  );
});
