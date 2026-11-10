// RC-29: the mechanic never says "Clean plate" over a damaged hull. A scar-free
// plate sitting at 86 of 100 reads its dent instead; a genuinely clean hull
// still gets the clean line.

import test from 'node:test';
import assert from 'node:assert/strict';
import { leftoverMechanicLines } from '../src/story/mechanicVoice.js';
import { defaultLivingHull } from '../src/core/livingHull.js';

function stateAtHull(hull, hullMax) {
  return {
    playerId: 1,
    entities: new Map([[1, { id: 1, hull, hullMax }]]),
    player: {
      credits: 5000, heat: 0, activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: defaultLivingHull(0) }],
    },
    ui: { marketNews: { log: [], lastCard: null } },
  };
}

test('RC-29: hull 86 of 100 hears the dent, not "Clean plate"', () => {
  const lines = leftoverMechanicLines(stateAtHull(86, 100));
  const text = lines.join('\n');
  assert.equal(text.includes('Clean plate'), false, 'a dented hull is not a clean plate');
  assert.match(text, /reads 86 of 100/);
});

test('RC-29: a full hull still reads clean', () => {
  const lines = leftoverMechanicLines(stateAtHull(100, 100));
  assert.match(lines.join('\n'), /Clean plate/);
});
