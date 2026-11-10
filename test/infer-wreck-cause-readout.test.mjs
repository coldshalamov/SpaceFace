// U4: an ordinary battlefield wreck files its cause at record time, and the scanned
// target readout is where the black-box answer finally gets read out. Unscanned
// hulls stay anonymous; a story-record wreck never doubles the fact.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as targetPanel from '../src/ui/targetPanel.js';

function wreckEntity(id, data) {
  return { id, type: 'wreck', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, data };
}

function stateFor(e) {
  return { entities: new Map([[e.id, e]]), entityList: [e], player: {}, playerId: 'player' };
}

const lineFor = (e) => targetPanel.objectInfoLine(e, stateFor(e), {}, 50);

test('a scanned battlefield wreck names its killer on the facts line', () => {
  const e = wreckEntity('w1', {
    scanned: true,
    salvagePool: { cmdty_scrap_metal: 3 },
    provenance: { killerLabel: 'Vess of the Slag Run', source: 'battle-aftermath' },
    provenanceLine: 'Reaver destroyed in Meridian Reach; black box lists killer Vess of the Slag Run.',
  });
  const line = lineFor(e);
  assert.match(line, /Killer: Vess of the Slag Run/, `cause rides the readout: ${line}`);
  assert.match(line, /Scrap Metal ×3/, 'salvage facts stay beside the cause');
});

test('an unscanned hulk stays anonymous', () => {
  const e = wreckEntity('w2', {
    salvagePool: { cmdty_scrap_metal: 2 },
    provenance: { killerLabel: 'Vess of the Slag Run' },
    provenanceLine: 'Reaver destroyed in Meridian Reach; black box lists killer Vess of the Slag Run.',
  });
  assert.doesNotMatch(lineFor(e), /Killer:/);
});

test('a story-record wreck does not gain a second killer fact', () => {
  const e = wreckEntity('w3', {
    scanned: true,
    scanRevealed: { story: true, daysAgo: 3 },
    provenance: { killerLabel: 'The Kestrel' },
  });
  const line = lineFor(e);
  assert.equal(line.split('Killer:').length - 1, 1, `exactly one killer fact: ${line}`);
  assert.match(line, /3d ago/, 'the record branch still speaks');
});

test('your own hull names who got you, once scanned', () => {
  const e = wreckEntity('w4', {
    scanned: true,
    playerWreck: true,
    provenance: { killerLabel: 'Ashjack Carrion', source: 'player_wreck' },
  });
  assert.match(lineFor(e), /Killer: Ashjack Carrion/);
});
