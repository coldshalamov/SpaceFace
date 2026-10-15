import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearTitleContinueLoadFailure,
  handleTitleContinueLoadFailure,
  presentTitleContinueLoadFailure,
} from '../src/ui/screens/mainMenu.js';
import { isTitleSaveReadFailure, saveErrorText, shouldToastSaveError } from '../src/ui/saveFeedback.js';

function liveTextTarget() {
  const attributes = new Map();
  return {
    attributes,
    textContent: 'Quick · saved today',
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

test('a failed title Continue uses the shared save copy in its single accessible alert line', () => {
  const target = liveTextTarget();
  const failure = {
    reason: 'load_failed',
    slot: 'achievements',
    error: 'Slot achievements is corrupt or not a SpaceFace save',
  };

  assert.equal(presentTitleContinueLoadFailure(target, failure), true);
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.textContent,
    'Load failed — Slot achievements is corrupt or not a SpaceFace save. Your save is untouched; try again, or export a backup from the Save screen.');
  assert.equal(target.attributes.get('role'), 'alert');
  assert.equal(target.attributes.get('aria-live'), 'assertive');
  assert.equal(target.attributes.get('aria-atomic'), 'true');

  clearTitleContinueLoadFailure(target);
  assert.equal(target.attributes.has('role'), false);
  assert.equal(target.attributes.has('aria-live'), false);
  assert.equal(target.attributes.has('aria-atomic'), false);
});

test('title recovery presents real prepare failures such as the achievements metadata record', () => {
  const target = liveTextTarget();
  const failure = { reason: 'bad_format', slot: 'achievements' };

  assert.equal(isTitleSaveReadFailure(failure), true);
  assert.equal(presentTitleContinueLoadFailure(target, failure), true);
  assert.equal(target.textContent, 'Slot achievements is corrupt or not a SpaceFace save');
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.attributes.get('role'), 'alert');
  assert.equal(target.attributes.get('aria-live'), 'assertive');
});

test('only title-visible read failures replace the global toast with the title alert', () => {
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'bad_format' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'restore_prepare_failed' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, false), true);
  assert.equal(shouldToastSaveError({ reason: 'quota' }, true), true,
    'other save receipts keep the existing global presenter');
  assert.equal(isTitleSaveReadFailure({ reason: 'bad_format', trigger: 'manual' }), false,
    'write receipts remain on the global receipt path');
  assert.equal(shouldToastSaveError({ reason: 'bad_format', trigger: 'manual' }, true), true);
  assert.equal(saveErrorText({ reason: 'no_player', slot: 'quick' }), 'Quick has no playable ship');
  assert.equal(saveErrorText({ reason: 'no_player', slot: 'quick', trigger: 'manual' }),
    'Start or load a game before saving');
  assert.equal(isTitleSaveReadFailure({ reason: 'superseded', slot: 'quick' }), false);
  assert.equal(isTitleSaveReadFailure({ reason: 'read_failed', slot: 'import' }), false,
    'a file-import read error cannot replace the title summary');
  assert.equal(shouldToastSaveError({ reason: 'superseded' }, false), false,
    'intentional route replacement remains quiet');

  const target = liveTextTarget();
  assert.equal(presentTitleContinueLoadFailure(target, { reason: 'quota' }), false);
  assert.equal(target.textContent, 'Quick · saved today');
  assert.equal(target.attributes.size, 0);
});

test('the title presenter ignores a load failure while another screen is on top', () => {
  const target = liveTextTarget();
  const refs = { saveSummary: target };
  const failure = { reason: 'load_failed', slot: 'quick', error: 'damaged save' };

  assert.equal(handleTitleContinueLoadFailure({ screenManager: { top: () => 'saveLoad' } }, refs, failure), false);
  assert.equal(target.textContent, 'Quick · saved today');
  assert.equal(target.attributes.size, 0);
  assert.equal(handleTitleContinueLoadFailure({ screenManager: { top: () => 'mainMenu' } }, refs, failure), true);
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.attributes.get('role'), 'alert');
});
