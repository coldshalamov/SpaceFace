// inf-sac-death-voice — the Hive sac's death speaks the Hive's own acid voice.
//
// The player story: a Hive spawn sac is the room's win lever — the tide it was feeding
// stops early, the brood mourn the corpse, and the net names the tide law the first time
// one dies. Yet on the glass the sac died an anonymous rock's death: the same grey
// conchoidal cleavage and the same default-ore flash as every barren stone, so nothing
// ever told you which body you had broken or that its death took the tide with it. Now
// the shatter re-voices the break when the body carries the Hive's spawn-sac tag: the
// shatter light wears the marker green, and the two-beat burst (membrane tear, acid
// breath, lit star) layers over the physical fracture. Ordinary rocks never play it.
//
// These tests pin the pure decision layer (src/render/vfx/hiveSacRead.js); the vfx
// adapter layers exactly what the voice names inside _onAsteroidShatter.
import assert from 'node:assert/strict';
import test from 'node:test';

import { isHiveSacBody, HIVE_SAC_VOICE } from '../src/render/vfx/hiveSacRead.js';
import { HIVE_SAC_TAG } from '../src/systems/theHiveArena.js';

test('the voice answers only the Hive\'s own tag — never an ordinary rock', () => {
  assert.equal(isHiveSacBody(null), false);
  assert.equal(isHiveSacBody({}), false);
  assert.equal(isHiveSacBody({ data: {} }), false, 'an untagged rock stays an anonymous rock');
  assert.equal(isHiveSacBody({ data: { hiveWall: true } }), false,
    'a wall nub is not a sac — walls close, they do not feed');
  assert.equal(isHiveSacBody({ data: { [HIVE_SAC_TAG]: true } }), true);
  assert.equal(isHiveSacBody({ data: { [HIVE_SAC_TAG]: 'yes' } }), false,
    'the tag is a boolean stamp, not a truthy string');
});

test('the voice is the Hive\'s own acid family, not the ore default', () => {
  // The brood presentation's marker green is the family voice the sac now wears.
  assert.equal(HIVE_SAC_VOICE.lightColor, '#6cff9a');
  // The three beats are distinct colours in the acid family: membrane, breath, lit body.
  const hues = new Set([HIVE_SAC_VOICE.tear.color, HIVE_SAC_VOICE.vent.color, HIVE_SAC_VOICE.star.color]);
  assert.equal(hues.size, 3, 'the beats are not one colour stamped three times');
  for (const c of hues) assert.match(c, /^#[0-9a-f]{6}$/);
});

test('the star outlives the tear — the read survives the flash', () => {
  assert.ok(HIVE_SAC_VOICE.star.life > HIVE_SAC_VOICE.tear.life * 2,
    'the lit acid body keeps the corpse readable after the membrane burn dies');
  assert.ok(HIVE_SAC_VOICE.vent.life > HIVE_SAC_VOICE.tear.life,
    'the acid breath lingers over where the sac fed');
});

test('the tear reads bigger than an ordinary rock\'s shatter beat', () => {
  // The ordinary destroyed path draws its flash at size0 3.0 / size1 8.0 (vfx.js
  // _onAsteroidShatter); the sac's membrane beat clears it on both numbers.
  assert.ok(HIVE_SAC_VOICE.tear.size0 > 3.0 && HIVE_SAC_VOICE.tear.size1 > 8.0,
    'the room lost an organ — the burst says so');
  assert.ok(HIVE_SAC_VOICE.vent.drift > 0, 'the acid drifts out over where it fed');
});
