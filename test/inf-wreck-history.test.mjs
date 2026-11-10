// inf-wreck-history (WF-16): a scanned battlefield wreck reads as a history, not just a
// salvage pile. The aftermath owner already recorded how the hull died (cause evidence),
// what shipment it flew (freight identity), and when (kill stamp); the target readout is
// where that record finally gets read. Unscanned hulks stay anonymous; story-record wrecks
// keep their own branch without doubling.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as targetPanel from '../src/ui/targetPanel.js';

function wreckEntity(id, data) {
  return { id, type: 'wreck', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, data };
}

function stateFor(e, simTime = 1800) {
  return { entities: new Map([[e.id, e]]), entityList: [e], player: {}, playerId: 'player', simTime };
}

const lineFor = (e, simTime) => targetPanel.objectInfoLine(e, stateFor(e, simTime), {}, 50);

const AMBUSH_HISTORY = {
  scanned: true,
  salvagePool: { cmdty_scrap_metal: 3 },
  provenance: {
    source: 'battle-aftermath', killerLabel: 'Vess of the Slag Run',
    freightIdentity: { manifestId: 'BRF-2219', freighterKey: 'hauler_brisk', role: 'hauler' },
  },
  causeContract: {
    actor: 'Reach ambush wing', motiveId: 'predation',
    evidence: 'Snare harmonics and attack vectors identify a prepared ambush.',
  },
  killedAt: 600,
};

test('a scanned wreck reads how it died from the recorded black-box evidence', () => {
  const line = lineFor(wreckEntity('w1', { ...AMBUSH_HISTORY }));
  assert.match(line, /Black box: Snare harmonics and attack vectors identify a prepared ambush\./,
    `how-it-died rides the readout: ${line}`);
  assert.match(line, /Killer: Vess of the Slag Run/, 'the who stays beside the how');
});

test('the dead hull names the manifest it was flying', () => {
  const line = lineFor(wreckEntity('w2', { ...AMBUSH_HISTORY }));
  assert.match(line, /Manifest BRF-2219/, `freight identity rides the readout: ${line}`);
});

test('the kill stamp reads as an age on the world day', () => {
  const line = lineFor(wreckEntity('w3', { ...AMBUSH_HISTORY }), 1800);
  assert.match(line, /2d ago/, `age rides the readout: ${line}`);
  const fresh = lineFor(wreckEntity('w3f', { ...AMBUSH_HISTORY, killedAt: 1800 }), 1800);
  assert.doesNotMatch(fresh, /0d ago/, 'a fresh kill does not claim an age');
});

test('an unscanned hulk stays anonymous — no black box, no manifest, no age', () => {
  const line = lineFor(wreckEntity('w4', { ...AMBUSH_HISTORY, scanned: false }));
  assert.doesNotMatch(line, /Black box:/);
  assert.doesNotMatch(line, /Manifest /);
  assert.doesNotMatch(line, /d ago/);
  assert.doesNotMatch(line, /Killer:/);
});

test('a story-record wreck keeps its own branch; the black box does not double', () => {
  const line = lineFor(wreckEntity('w5', {
    scanned: true,
    scanRevealed: { story: true, daysAgo: 3 },
    causeContract: { evidence: 'A registered collection contract.' },
    provenance: { killerLabel: 'The Kestrel' },
  }));
  assert.equal(line.split('Killer:').length - 1, 1, `exactly one killer fact: ${line}`);
  assert.match(line, /3d ago/, 'the record branch still speaks');
  assert.doesNotMatch(line, /Black box:/, 'the battlefield black box stays out of a story record');
});

test('a legacy wreck without cause records still renders its ordinary facts', () => {
  const line = lineFor(wreckEntity('w6', {
    scanned: true,
    salvagePool: { cmdty_scrap_metal: 2 },
    provenance: { killerLabel: 'unidentified' },
  }));
  assert.match(line, /Holds Scrap Metal ×2/);
  assert.match(line, /Killer: unidentified/);
  assert.doesNotMatch(line, /Black box:/);
  assert.doesNotMatch(line, /Manifest /);
});
