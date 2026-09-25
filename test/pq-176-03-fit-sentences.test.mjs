// PQ-176.03 — the fit screen says the burst, the turn, and what each fitted module does.
//
// The screen model is handlingBandModel, which shipworks already reads. The burst is the gun's
// own energy draw, heat and cooling. The turn line is the radius the profile already predicts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { buildSlotList, fits, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const SINK_ID = 'mod_thermal_sink_s';

function starterModel(starter) {
  const fittings = fittingsFromDefaultModules(starter.shipId, starter.fittedModules);
  return {
    fittings,
    model: handlingBandModel({ shipId: starter.shipId, fittings, player: null }),
  };
}

function withModule(shipId, fittings, moduleId) {
  const moduleDef = MODULES.find((row) => row.id === moduleId);
  const shipDef = SHIPS.find((row) => row.id === shipId);
  const slots = buildSlotList(shipDef);
  const next = fittings.slice();
  const index = slots.findIndex((slot, i) => !next[i] && fits(slot, moduleDef));
  assert.ok(index >= 0, `${moduleId} has an empty slot on ${shipId}`);
  next[index] = moduleId;
  return next;
}

test('the starter fit says the burst, the turn radius, and one line per module', () => {
  const hitch = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_hitch');
  const { fittings, model } = starterModel(hitch);
  assert.ok(model, 'the fit screen model exists for the Hitch');

  const fire = model.sustainedFire;
  assert.equal(fire.limit, 'heat', 'the starter gun is stopped by heat, not by a made-up timer');
  assert.ok(fire.seconds > 0 && Number.isFinite(fire.seconds), 'the burst is a real length');
  assert.ok(fire.energyDrawPerS > 0, 'energy draw is part of the burst');
  assert.ok(fire.heatPerS > fire.coolingPerS, 'heat outruns cooling, which is why the burst ends');
  assert.ok(fire.coolingPerS > 0, 'cooling is part of the burst');
  const fromRates = fire.heatMax / (fire.heatPerS - fire.coolingPerS);
  assert.ok(Math.abs(fire.seconds - fromRates) < 0.002, 'the burst is heat max over heat minus cooling');
  assert.match(fire.sentence, /holds for .* s before the heat stops it/);
  assert.equal(fire.sentence.includes('\n'), false);
  assert.ok(model.crestSentence.includes(fire.sentence), 'the line the screen prints includes the burst');

  assert.ok(model.profile.predictions.turnRadiusWu > 0, 'the profile predicts a turn radius');
  assert.match(model.turnSentence, /turn radius is \d+ m/);
  assert.ok(model.crestSentence.includes(model.turnSentence), 'the screen says the turn radius before commit');
  assert.ok(model.profile.predictions.reversalTimeS > 0, 'reversal is already predicted');
  assert.match(model.reversalSentence, /reversal takes .* s/);
  assert.ok(model.crestSentence.includes(model.reversalSentence));

  const byId = new Map(model.moduleSentences.map((row) => [row.id, row]));
  for (const id of hitch.fittedModules) {
    const row = byId.get(id);
    assert.ok(row, `${id} is on the fit screen model`);
    assert.equal(typeof row.sentence, 'string');
    assert.ok(row.sentence.length > 0, `${id} has a sentence`);
    assert.equal(row.sentence.includes('\n'), false, `${id} is one line`);
  }
});

test('fitting a heatsink changes how long the gun can keep firing', () => {
  const hitch = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_hitch');
  const beforeFit = fittingsFromDefaultModules(hitch.shipId, hitch.fittedModules);
  const afterFit = withModule(hitch.shipId, beforeFit, SINK_ID);
  const before = handlingBandModel({ shipId: hitch.shipId, fittings: beforeFit, player: null });
  const after = handlingBandModel({ shipId: hitch.shipId, fittings: afterFit, player: null });
  assert.ok(after.sustainedFire.coolingPerS > before.sustainedFire.coolingPerS);
  assert.ok(after.sustainedFire.seconds > before.sustainedFire.seconds);
  assert.notEqual(before.sustainedFire.seconds, after.sustainedFire.seconds);
  assert.equal(after.sustainedFire.energyDrawPerS, before.sustainedFire.energyDrawPerS,
    'the sink changes cooling, not the gun\'s energy draw');
});

test('every starter fit and every module the player can fit has one line', () => {
  for (const starter of NEW_GAME_STARTERS) {
    const { model } = starterModel(starter);
    const byId = new Map(model.moduleSentences.map((row) => [row.id, row]));
    for (const id of starter.fittedModules) {
      const row = byId.get(id);
      assert.ok(row && row.sentence && !row.sentence.includes('\n'), `${starter.id} ${id}`);
    }
    assert.match(model.turnSentence, /turn radius/);
    assert.ok(model.sustainedFire.sentence.length > 0, `${starter.id} states a burst`);
  }
  const missing = MODULES.filter((mod) => typeof mod.sentence !== 'string' || !mod.sentence.trim() || mod.sentence.includes('\n'));
  assert.deepEqual(missing.map((mod) => mod.id), [], 'every module carries one player sentence');
});
