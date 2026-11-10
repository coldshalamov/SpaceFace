import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBarkVoice } from '../src/audio/barkVoice.js';

test('RC-38: two lines from one faction resolve different hashed rates within ±3%', () => {
  const rates = new Set();
  for (let i = 0; i < 12; i++) {
    const v = resolveBarkVoice({ factionId: 'faction_scn', situation: 'scan', line: `Line number ${i} on the wire.` });
    rates.add(v.speech.rate);
    assert.ok(Math.abs(v.speech.rate - 0.94) <= 0.031, `rate ${v.speech.rate} beyond the ±3% walk of register 0.94`);
  }
  assert.ok(rates.size > 1, 'every line paced identically');
});

test('RC-38: the same line always resolves the same rate — hashed, never Math.random', () => {
  const a = resolveBarkVoice({ factionId: 'faction_reach', situation: 'warn', line: 'Back off the lane.' });
  const b = resolveBarkVoice({ factionId: 'faction_reach', situation: 'warn', line: 'Back off the lane.' });
  assert.equal(a.speech.rate, b.speech.rate);
});
