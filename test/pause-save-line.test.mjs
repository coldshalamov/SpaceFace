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

const withAutosave = (intervalS, extra = {}) => ({
  settings: { gameplay: { autosaveIntervalS: intervalS } },
  save: {},
  meta: {},
  ...extra,
});

test('the unsaved-run line reads the Autosave setting instead of a fixed list', () => {
  assert.equal(
    saveLine(withAutosave(120)),
    'Unsaved run. Use Save or F5 before quitting. Autosave runs about every 120 s and when you dock, jump or finish a contract.',
  );
  assert.equal(
    saveLine(withAutosave(300)),
    'Unsaved run. Use Save or F5 before quitting. Autosave runs about every 300 s and when you dock, jump or finish a contract.',
  );
  assert.equal(
    saveLine(withAutosave(0)),
    'Unsaved run. Timed autosave is Off. It still saves when you dock, jump or finish a contract — use Save or F5 before quitting.',
    'an Off player is warned, and told the truth: Off stops the timer, not the dock/jump/contract saves',
  );
});

test('the loaded-but-nothing-saved line says the same thing about autosave', () => {
  assert.equal(
    saveLine(withAutosave(60, { save: { currentSlot: 'quick' } })),
    'Loaded the quick slot. Nothing saved this session. Use Save or F5 before quitting. Autosave runs about every 60 s and when you dock, jump or finish a contract.',
  );
  assert.equal(
    saveLine(withAutosave(0, { save: { currentSlot: 'auto' } })),
    'Loaded autosave. Nothing saved this session. Timed autosave is Off. It still saves when you dock, jump or finish a contract — use Save or F5 before quitting.',
  );
});

test('missing or corrupt settings read as the shipped 120 s default, never a raw value', () => {
  const shipped = 'Unsaved run. Use Save or F5 before quitting. Autosave runs about every 120 s and when you dock, jump or finish a contract.';
  assert.equal(saveLine({ save: {}, meta: {} }), shipped);
  assert.equal(saveLine(withAutosave(undefined)), shipped);
  assert.equal(saveLine(withAutosave(-5)), shipped);
  assert.equal(saveLine(withAutosave('soon')), shipped);
});

test('a saved run and an arena run keep their own lines whatever Autosave says', () => {
  const now = new Date().toISOString();
  assert.equal(saveLine(withAutosave(0, { save: { currentSlot: 'quick' }, meta: { lastSavedAt: now } })), 'Saved just now to the quick slot.');
  assert.match(saveLine(withAutosave(0, { run: { phase: 'active', kind: 'survival' } })), /^This run is not saved\./);
});
