// Wave G3 — a shield hit, a hull hit, a shove, and a dock do not become toast sentences.
// Law and objectives may still use text.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  admitReceipt,
  isFightCaptionSentence,
  toastTextForFightEvent,
} from '../src/ui/hudAttention.js';

test('G3 fight events add nothing to the toast list', () => {
  const feed = [];
  for (const name of ['combat:damage', 'combat:shove', 'dock:docked']) {
    const text = toastTextForFightEvent(name);
    assert.equal(text, null);
    if (text) feed.push(text);
  }
  for (const line of ['TAKING FIRE', 'Hull hit', 'Shield hit', 'Shoved the scout', 'Docked at Helios']) {
    assert.equal(isFightCaptionSentence(line), true);
    assert.equal(admitReceipt({ text: line }).admit, false);
    if (admitReceipt({ text: line }).admit) feed.push(line);
  }
  assert.deepEqual(feed, []);
  assert.equal(admitReceipt({ text: 'WANTED' }).admit, true);
  assert.equal(admitReceipt({ text: 'Reach the gate' }).admit, true);
});
