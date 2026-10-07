// VERB-34 — opening a hull says how it flies, in the fit screen's own words.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEntity } from '../src/ui/entityResolver.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

test('seed 4242 a hull record says how the Hitch flies', () => {
  const band = handlingBandModel({ shipId: 'ship_kestrel', fittings: [], player: null });
  assert.ok(band && band.crestSentence);
  const brake = band.bars.find((row) => row.id === 'brake');
  assert.ok(brake && brake.why);
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'hull:ship_kestrel');
  assert.ok(dossier);
  const flies = dossier.lines.find((line) => line.label === 'Flies');
  const stops = dossier.lines.find((line) => line.label === 'Stops');
  assert.equal(flies && flies.text, band.crestSentence);
  assert.equal(stops && stops.text, brake.why);
  assert.match(stops.text, /need \d+ m to stop/);
  assert.equal(dossier.lines.some((line) => line.label === 'Handling'), false);
});
