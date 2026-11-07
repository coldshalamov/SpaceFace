// VERB-34 — opening a hull says how it flies, in the fit screen's own words.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEntity } from '../src/ui/entityResolver.js';
import { shipStatSheet, shipSheetSentence } from '../src/ui/ship/shipStats.js';

test('seed 4242 a hull record reads the Ship Sheet, not the old profile paragraph', () => {
  const sheet = shipStatSheet({ shipId: 'ship_kestrel', fittings: [], player: null });
  assert.ok(sheet && sheet.identity);
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'hull:ship_kestrel');
  assert.ok(dossier);
  const build = dossier.lines.find((line) => line.label === 'Build');
  const flies = dossier.lines.find((line) => line.label === 'Flies');
  assert.equal(build && build.text, `${sheet.roleLabel} \u00b7 ${sheet.identity.label}`);
  assert.equal(flies && flies.text, shipSheetSentence(sheet));
  assert.equal(dossier.lines.some((line) => line.label === 'Stops'), false,
    'the raw turn-radius / stop-distance paragraph is gone');
  assert.equal(dossier.lines.some((line) => line.label === 'Mass'), false,
    'raw engineering is behind the sheet Details door, not the hull record');
  assert.equal(dossier.lines.some((line) => line.label === 'Handling'), false);
});
