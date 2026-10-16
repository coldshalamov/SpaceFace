import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearTitleContinueLoadFailure,
  handleTitleContinueLoadFailure,
  presentTitleContinueLoadFailure,
} from '../src/ui/screens/mainMenu.js';
import { saveErrorText, shouldToastSaveError } from '../src/ui/saveFeedback.js';

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

test('only a title-visible load failure replaces the global toast with the title alert', () => {
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, false), true);
  assert.equal(shouldToastSaveError({ reason: 'quota' }, true), true,
    'other save receipts keep the existing global presenter');
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
