import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLine } from '../src/ui/screens/pause.js';

test('the pause brief names the save slot in words, not as a bare key', () => {
  const now = new Date().toISOString();
  assert.equal(saveLine({ save: { currentSlot: 'quick' }, meta: { lastSavedAt: now } }), 'Saved just now to the quick slot.');
  assert.equal(saveLine({ save: { currentSlot: 'auto' }, meta: { lastSavedAt: now } }), 'Saved just now to autosave.');
  assert.equal(saveLine({ save: { currentSlot: '2' }, meta: { lastSavedAt: now } }), 'Saved just now to slot 2.');
  assert.match(saveLine({ save: { currentSlot: 'quick' }, meta: {} }), /^Loaded the quick slot\. /);
});
