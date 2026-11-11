// inf-radio-distance — the comms band carries the distance, not just the bearing.
//
// A hail was panned by bearing and flat in level on purpose ("radio carries the distance, not the
// volume" — a far patrol's hail must stay heard), but every voice rendered through its register's
// one fixed radio band, so a hauler alongside and a patrol at the edge of scanner range sounded
// equally close. Three honest bands now: near keeps the register byte-for-byte; mid narrows the
// bandpass, lifts the carrier hiss and adds a touch of drive; far narrows further and hisses
// harder. The register — who is talking — always survives; only the channel changes. A named
// contact (factionId null: the instructor, the Hull Ghost) and the mechanic's shop speech are
// intimate voices and never ride a far carrier. Pure, and the PCM cache keys on the band.
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBarkVoice, withRadioBand, radioBandForDistance, RADIO_MID_WU, RADIO_FAR_WU } from '../src/audio/barkVoice.js';
import { cachedBarkBuffer } from '../src/audio/barkPcmCache.js';

const NEAR = resolveBarkVoice({ factionId: 'faction_vael', situation: 'scan', line: 'Contact checked.' });

test('the band buckets: near at hand, mid past 1800 wu, far past 3600', () => {
  assert.equal(radioBandForDistance(null), 'near', 'no distance read is no lie');
  assert.equal(radioBandForDistance(Number.NaN), 'near');
  assert.equal(radioBandForDistance(RADIO_MID_WU - 1), 'near');
  assert.equal(radioBandForDistance(RADIO_MID_WU), 'mid');
  assert.equal(radioBandForDistance(RADIO_FAR_WU - 1), 'mid');
  assert.equal(radioBandForDistance(RADIO_FAR_WU), 'far');
});

test('near keeps the register; mid and far narrow the band, hiss and drive harder', () => {
  assert.equal(withRadioBand(NEAR, 100), NEAR, 'near is the authored voice, untouched');
  const mid = withRadioBand(NEAR, RADIO_MID_WU + 100);
  assert.ok(mid.radio.bandpassLo > NEAR.radio.bandpassLo, 'mid squeezes the low edge up');
  assert.ok(mid.radio.bandpassHi < NEAR.radio.bandpassHi, 'mid squeezes the high edge down');
  assert.ok(mid.radio.noise > NEAR.radio.noise, 'mid hisses more');
  assert.ok(mid.radio.drive > NEAR.radio.drive, 'mid drives the carrier');
  const far = withRadioBand(NEAR, RADIO_FAR_WU + 100);
  assert.ok(far.radio.bandpassLo > mid.radio.bandpassLo, 'far squeezes further');
  assert.ok(far.radio.bandpassHi < mid.radio.bandpassHi, 'far narrows further');
  assert.ok(far.radio.noise > mid.radio.noise, 'far hisses harder');
  assert.equal(far.radioBand, 'far');
  // The register survives every band: identity is the filter, not the words.
  assert.equal(mid.registerId, NEAR.registerId);
  assert.equal(far.registerId, NEAR.registerId);
  assert.equal(far.line, NEAR.line);
});

test('intimate voices never ride a far carrier', () => {
  const mechanic = resolveBarkVoice({ mechanic: true, line: 'Take a look at that drive.' });
  assert.equal(withRadioBand(mechanic, RADIO_FAR_WU + 100), mechanic, 'shop speech stays in the shop');
  const instructor = resolveBarkVoice({ factionId: 'faction_free', situation: 'scan', line: 'x' });
  const named = { ...instructor, factionId: null };
  assert.equal(withRadioBand(named, RADIO_FAR_WU + 100), named, 'a named contact keeps its one voice');
});

test('the PCM cache treats the band as part of the body', () => {
  const ctx = { createBuffer: (ch, len, sr) => ({ length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }) };
  const near = cachedBarkBuffer(ctx, new Map(), NEAR);
  const far = cachedBarkBuffer(ctx, new Map(), withRadioBand(NEAR, RADIO_FAR_WU + 100));
  assert.notEqual(near, far, 'a far hail is a different buffer');
  assert.equal(near.length, far.length, 'same words, same duration');
});
