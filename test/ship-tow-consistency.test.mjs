// P1 — one tow law on one screen.
//
// The Ship Sheet prints Muscle from `towClassMassFor` (the steady-state line rating). The
// capability band must name a hull from the same rating: the heaviest roster hull at or under it.
// A band that names a hull from a separate 1.5 s kernel window can contradict the bar beside it
// (a higher Muscle number naming a lighter hull), which is the defect this file locks out.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import {
  dryTowClassMassFor,
  hasTowRating,
  towClassMassFor,
} from '../src/systems/shipCapabilities.js';
import { capabilityBandModel } from '../src/ui/ship/shipBandModels.js';
import { shipStatSheet } from '../src/ui/ship/shipStats.js';

const SHIP_BY_NAME = new Map(SHIPS.map((ship) => [ship.name, ship]));

function sheetFor(shipId, player = null) {
  return shipStatSheet({ shipId, fittings: [], player });
}

function muscleOf(sheet) {
  return sheet.stats.find((stat) => stat.id === 'muscle');
}

/** The roster mass the band's lead names; Infinity for "any hull", 0 for "none in reach". */
function leadMassFor(sheet) {
  const derived = getDerivedStats(sheet.shipId, [], null);
  const model = capabilityBandModel({ derived, state: {}, fittings: [] });
  return {
    lead: model.lead,
    mass: leadMassFrom(model.lead),
  };
}

function leadMassFrom(lead) {
  if (!lead) return 0;
  if (lead.value === 'no Line load') return null;
  if (lead.word === 'any hull') return Infinity;
  if (lead.word === 'too loaded' || lead.value === 'no hull') return 0;
  const name = String(lead.word || '').replace(/^(an? )/i, '');
  const hull = SHIP_BY_NAME.get(name);
  return hull ? Number(hull.mass) : null;
}

test('Atlas and Hawser: the higher Muscle bar names the heavier hull', () => {
  const atlas = sheetFor('ship_atlas');
  const hawser = sheetFor('ship_hawser');
  assert.ok(muscleOf(hawser).tenths > muscleOf(atlas).tenths,
    `the tug out-tows the heavy hauler (${muscleOf(hawser).raw} vs ${muscleOf(atlas).raw})`);
  const atlasLead = leadMassFor(atlas);
  const hawserLead = leadMassFor(hawser);
  assert.ok(atlasLead.mass != null && hawserLead.mass != null, 'both rated hulls name a lead');
  assert.ok(hawserLead.mass > atlasLead.mass,
    `Hawser Muscle ${muscleOf(hawser).raw} names ${hawserLead.mass} t, Atlas Muscle ${muscleOf(atlas).raw} names ${atlasLead.mass} t`);
});

test('Mule against Ironback: a rated hull names a tow, an unrated hull says it rams', () => {
  const mule = sheetFor('ship_mule');
  const ironback = sheetFor('ship_ironback');
  assert.ok(muscleOf(mule).raw > muscleOf(ironback).raw);
  const muleLead = leadMassFor(mule);
  const ironbackLead = leadMassFor(ironback);
  assert.ok(muleLead.mass > 0, 'the Mule has a real Line load');
  assert.equal(ironbackLead.lead.value, 'no Line load');
  assert.equal(ironbackLead.lead.word, 'rams instead');
  assert.doesNotMatch(ironbackLead.lead.why, /too loaded/i);
  assert.equal(hasTowRating(getDerivedStats('ship_ironback', [], null)), false);
});

test('every roster pair with a rating keeps Muscle rank and band lead rank in step', () => {
  const rated = SHIPS.map((ship) => ({
    ship,
    sheet: sheetFor(ship.id),
    derived: getDerivedStats(ship.id, [], null),
    lead: leadMassFor(sheetFor(ship.id)),
  })).filter((row) => hasTowRating(row.derived) && muscleOf(row.sheet).raw > 0);
  assert.ok(rated.length >= 2, 'the roster has rated hulls to compare');

  for (const row of rated) {
    const rating = muscleOf(row.sheet).raw;
    assert.ok(Math.abs(rating - towClassMassFor(row.derived)) < 0.06,
      `${row.ship.id} sheet Muscle ${rating} is the tow rating ${towClassMassFor(row.derived)}`);
    assert.ok(row.lead.mass == null || row.lead.mass === 0 || row.lead.mass === Infinity
      || row.lead.mass <= rating + 1e-9,
      `${row.ship.id} names ${row.lead.mass} t against a ${rating} t rating`);
  }

  for (let i = 0; i < rated.length; i += 1) {
    for (let j = i + 1; j < rated.length; j += 1) {
      const a = rated[i];
      const b = rated[j];
      const ratingA = muscleOf(a.sheet).raw;
      const ratingB = muscleOf(b.sheet).raw;
      if (Math.abs(ratingA - ratingB) < 1e-9) {
        assert.equal(a.lead.mass, b.lead.mass,
          `${a.ship.id} and ${b.ship.id} share a rating and must name the same class of hull`);
      } else if (ratingA > ratingB) {
        assert.ok(a.lead.mass >= b.lead.mass,
          `${a.ship.id} (${ratingA} t -> ${a.lead.mass}) must not name a lighter hull than ${b.ship.id} (${ratingB} t -> ${b.lead.mass})`);
      } else {
        assert.ok(b.lead.mass >= a.lead.mass,
          `${b.ship.id} (${ratingB} t -> ${b.lead.mass}) must not name a lighter hull than ${a.ship.id} (${ratingA} t -> ${a.lead.mass})`);
      }
    }
  }
});

test('hasTowRating reads the dry load factor, so a full hold cannot erase the rating', () => {
  for (const shipId of ['ship_atlas', 'ship_mule', 'ship_hawser']) {
    const dry = getDerivedStats(shipId, [], { cargo: { usedMass: 0 } });
    const loaded = getDerivedStats(shipId, [], { cargo: { usedMass: 600 } });
    assert.equal(hasTowRating(dry), true, `${shipId} has a dry rating`);
    assert.equal(hasTowRating(loaded), true, `${shipId} keeps its rating with a full hold`);
    assert.ok(Math.abs(dryTowClassMassFor(dry) - dryTowClassMassFor(loaded)) < 1e-9,
      `${shipId} dry rating does not move with cargo`);
    assert.equal(towClassMassFor(loaded), 0, `${shipId} cannot spend the rating while overloaded`);
  }
});
