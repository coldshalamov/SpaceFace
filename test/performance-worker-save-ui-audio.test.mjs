import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acknowledgeSaveSnapshotBoundary,
  captureSaveSnapshotBoundary,
  createSaveDirtyJournal,
} from '../src/save/saveDirtyJournal.js';
import {
  clearHudSignatures,
  hudFieldsUnchanged,
  hudSignatureUnchanged,
} from '../src/ui/hudSkipUnchanged.js';
import { masslineHudInputsUnchanged } from '../src/ui/masslineHud.js';
import { entityNeedsAudioUpdate, entityNeedsExactAudio } from '../src/audio/audioActiveSet.js';
import { PRESENTATION_TIER } from '../src/world/activityClassification.js';

test('save journal snapshots dirty facts at a boundary without serializing during present', () => {
  const journal = createSaveDirtyJournal(16);
  const payload = { id: 'record_1', nested: { value: 1 } };
  journal.record(1, payload);
  payload.nested.value = 9;
  const boundary = captureSaveSnapshotBoundary(journal, { tick: 8, simTime: 2.5 });
  assert.equal(boundary.tick, 8);
  assert.equal(boundary.simTime, 2.5);
  assert.equal(boundary.entries[0].payload.nested.value, 1);
  assert.equal(journal.pending, 1, 'failed saves must retain the captured dirty facts');
  journal.record(2, { id: 'record_2' });
  assert.equal(acknowledgeSaveSnapshotBoundary(journal, boundary), 1);
  assert.equal(journal.pending, 1, 'facts recorded after the boundary stay queued');
});

test('HUD signature cache skips only equivalent inputs and does not pollute saves', () => {
  const state = {};
  assert.equal(hudSignatureUnchanged(state, 'massline', 'idle'), false);
  assert.equal(hudSignatureUnchanged(state, 'massline', 'idle'), true);
  assert.equal(hudSignatureUnchanged(state, 'massline', 'changed'), false);
  assert.equal(Object.hasOwn(state, '_hudSignatures'), false);
  clearHudSignatures(state);
});

test('Massline HUD compares a reusable scalar block and notices movement', () => {
  const state = {
    simTime: 0,
    entities: new Map(),
    massline2: {},
    player: {},
    settings: { video: {}, accessibility: {} },
  };
  const player = { pos: { x: 0, z: 0 } };
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  assert.equal(masslineHudInputsUnchanged(state, player), true);
  // Quiescent frames deliberately exclude player pos — with nothing world-anchored visible it
  // cannot move a pixel, so idle movement does not roll the signature.
  player.pos.x = 1;
  assert.equal(masslineHudInputsUnchanged(state, player), true);
  // Once a world-anchored element is live (a tether), the same movement repaints.
  state.player.tether = { active: true, targetId: 7 };
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  assert.equal(masslineHudInputsUnchanged(state, player), true);
  player.pos.x = 2;
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  let value = 1;
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), false);
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), true);
  value = 2;
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), false);
  clearHudSignatures(state);
});

test('audio active set keeps player/glass/combat voices and drops remote metadata updates', () => {
  const player = { id: 1, alive: true, isPlayer: true };
  const glass = { id: 2, alive: true, activity: { presentationTier: PRESENTATION_TIER.R0_GLASS } };
  const remote = { id: 3, alive: true, activity: { presentationTier: PRESENTATION_TIER.R3_UNLOADED } };
  assert.equal(entityNeedsExactAudio(player, { playerId: 1 }), true);
  assert.equal(entityNeedsAudioUpdate(glass), true);
  assert.equal(entityNeedsAudioUpdate(remote), false);
  assert.equal(entityNeedsExactAudio(remote, { combatId: 3 }), true);
});
