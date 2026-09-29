// NXI-117 — an empty-hold estimate is not shown as the turn of a fully loaded hold.
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import { handlingProfileForShip } from '../src/ui/panels/handlingProfile.js';
import {
  estimateAtCargoBasis,
  shipCapabilityVerbs,
  turnRecordText,
} from '../src/systems/shipCapabilities.js';

const HULL = 'ship_kestrel';

function hold(usedMass) {
  return { cargo: { items: {}, usedMass, usedVolume: 0, capVolume: 80 } };
}

test('NXI-117: an empty hold is not labeled as a loaded turn', () => {
  const emptyDerived = getDerivedStats(HULL, [], hold(0));
  const loadedDerived = getDerivedStats(HULL, [], hold(40));
  assert.ok(!(emptyDerived.cargoMass > 0), 'the empty fixture has no cargo mass');
  assert.ok(loadedDerived.cargoMass > 0, 'the loaded fixture carries cargo mass');

  const empty = estimateAtCargoBasis({ derived: emptyDerived, basis: 'specified', fittings: [] });
  const loaded = estimateAtCargoBasis({ derived: loadedDerived, basis: 'specified', fittings: [] });
  assert.equal(empty.basis, 'empty');
  assert.equal(empty.fullHold, false);
  assert.equal(loaded.basis, 'specified');
  assert.equal(loaded.fullHold, true);
  assert.notEqual(empty.basis, loaded.basis);
  assert.equal(empty.sentence.includes('Loaded hold'), false);
  assert.equal(empty.sentence.includes('fully loaded'), false);
  assert.equal(empty.sentence.includes('Empty hold'), true);
  assert.equal(loaded.sentence.includes('Loaded hold'), true);

  const emptyVerbs = shipCapabilityVerbs({ derived: emptyDerived, fittings: [] });
  const loadedVerbs = shipCapabilityVerbs({ derived: loadedDerived, fittings: [] });
  assert.equal(empty.tow.massT, emptyVerbs.tow.massT);
  assert.equal(empty.slam.speedWuPerS, emptyVerbs.slam.speedWuPerS);
  assert.equal(empty.line.speedWuPerS, emptyVerbs.line.speedWuPerS);
  assert.equal(loaded.tow.massT, loadedVerbs.tow.massT);
  assert.equal(loaded.slam.speedWuPerS, loadedVerbs.slam.speedWuPerS);
  assert.equal(loaded.line.speedWuPerS, loadedVerbs.line.speedWuPerS);
  assert.equal(empty.turnRate, emptyDerived.turnRate);
  assert.equal(loaded.turnRate, loadedDerived.turnRate);

  const emptyProfile = handlingProfileForShip(HULL, { player: hold(0), fittings: [] });
  const loadedProfile = handlingProfileForShip(HULL, { player: hold(40), fittings: [] });
  assert.ok(Math.abs(empty.turnRadiusWu - emptyProfile.predictions.turnRadiusWu) < 0.001);
  assert.ok(Math.abs(loaded.turnRadiusWu - loadedProfile.predictions.turnRadiusWu) < 0.001);

  const emptyRecord = turnRecordText(emptyDerived);
  const loadedRecord = turnRecordText(loadedDerived);
  assert.equal(emptyRecord.includes('empty hold'), true);
  assert.equal(emptyRecord.includes('loaded hold'), false);
  assert.equal(loadedRecord.includes('cargo aboard'), true);
  assert.equal(loadedRecord.includes('empty hold'), false);
  assert.equal(emptyRecord.startsWith(String(Math.round(emptyDerived.turnRate * 100) / 100)), true);
});

test('NXI-117: a loaded hold asked as empty is not relabeled empty', () => {
  const loadedDerived = getDerivedStats(HULL, [], hold(40));
  const estimate = estimateAtCargoBasis({ derived: loadedDerived, basis: 'empty', fittings: [] });
  assert.notEqual(estimate.basis, 'empty');
  assert.equal(estimate.fullHold, false);
  assert.equal(estimate.sentence.includes('Empty hold'), false);
  const current = estimateAtCargoBasis({ derived: loadedDerived, basis: 'current', fittings: [] });
  assert.equal(current.basis, 'current');
  assert.equal(estimate.basis, current.basis);
});
