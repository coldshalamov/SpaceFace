// test/dust-community-personality.test.mjs
// DUST P1d — community personality cards (src/data/communityPersonality.js, design/program/dust/
// TONE_BIBLE.md §3): schema completeness, uniqueness, line caps, real-place anchoring, reader
// lookups, and purity. Cards are pure data; the anchoring maps may only alias real ids.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import {
  COMMUNITY_PERSONALITY,
  COMMUNITY_BY_ID,
  STATION_COMMUNITY,
  SECTOR_COMMUNITY,
  communityCard,
  stationLine,
  sectorLine,
} from '../src/data/communityPersonality.js';

// TONE_BIBLE §2 rule 8: the house comms cap is 12 words; any voiceSample can surface in comms,
// so every sample must obey it. 90 characters is the hard line-length guard for the same surfaces.
const MAX_SAMPLE_WORDS = 12;
const MAX_SAMPLE_CHARS = 90;

const CARD_FIELDS = [
  'id', 'bit', 'wound', 'institution', 'obsession', 'runningGag',
  'voiceSamples', 'silhouette', 'radioAccent',
];
const STRING_FIELDS = CARD_FIELDS.filter((field) => field !== 'voiceSamples');

// The real-place universe: sector ids and station ids straight from sectors.js.
const SECTOR_IDS = new Set(SECTORS.map((sector) => sector.id));
const STATION_IDS = new Set(
  SECTORS.flatMap((sector) => (sector.stations || []).map((station) => station.id)),
);

test('all 8 cards carry the complete TONE_BIBLE §3 schema with string fields', () => {
  assert.equal(COMMUNITY_PERSONALITY.length, 8, 'one card per DUST-voiced community');
  for (const card of COMMUNITY_PERSONALITY) {
    for (const field of CARD_FIELDS) {
      assert.ok(field in card, `${card.id}.${field} present`);
    }
    for (const field of STRING_FIELDS) {
      assert.equal(typeof card[field], 'string', `${card.id}.${field} is a string`);
      assert.ok(card[field].trim().length > 0, `${card.id}.${field} is non-empty`);
    }
    assert.ok(Array.isArray(card.voiceSamples), `${card.id}.voiceSamples is an array`);
    assert.ok(
      card.voiceSamples.length >= 3 && card.voiceSamples.length <= 5,
      `${card.id}.voiceSamples has 3-5 entries (has ${card.voiceSamples.length})`,
    );
    for (const [index, sample] of card.voiceSamples.entries()) {
      assert.equal(typeof sample, 'string', `${card.id}.voiceSamples[${index}] is a string`);
      assert.ok(sample.trim().length > 0, `${card.id}.voiceSamples[${index}] is non-empty`);
      assert.equal(sample, sample.trim(), `${card.id}.voiceSamples[${index}] is trimmed`);
    }
  }
});

test('card ids and institutions are unique', () => {
  const ids = COMMUNITY_PERSONALITY.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length, 'card ids are unique');
  const institutions = COMMUNITY_PERSONALITY.map((card) => card.institution);
  assert.equal(new Set(institutions).size, institutions.length, 'institutions are unique');
});

test('every voiceSample obeys the ≤12-word, ≤90-character comms cap', () => {
  for (const card of COMMUNITY_PERSONALITY) {
    for (const [index, sample] of card.voiceSamples.entries()) {
      const words = sample.split(/\s+/).filter(Boolean).length;
      assert.ok(
        words <= MAX_SAMPLE_WORDS,
        `${card.id}.voiceSamples[${index}] has ${words} words (cap ${MAX_SAMPLE_WORDS}): "${sample}"`,
      );
      assert.ok(
        sample.length <= MAX_SAMPLE_CHARS,
        `${card.id}.voiceSamples[${index}] is ${sample.length} chars (cap ${MAX_SAMPLE_CHARS}): "${sample}"`,
      );
    }
  }
});

test('every card id and anchoring key resolves against real sector/station data', () => {
  for (const card of COMMUNITY_PERSONALITY) {
    assert.ok(STATION_IDS.has(card.id), `${card.id} is a real station id in sectors.js`);
  }
  for (const [key, value] of Object.entries(STATION_COMMUNITY)) {
    assert.ok(STATION_IDS.has(key), `STATION_COMMUNITY key ${key} is a real station id`);
    assert.ok(COMMUNITY_BY_ID.has(value), `STATION_COMMUNITY[${key}] -> known card ${value}`);
  }
  for (const [key, value] of Object.entries(SECTOR_COMMUNITY)) {
    assert.ok(SECTOR_IDS.has(key), `SECTOR_COMMUNITY key ${key} is a real sector id`);
    assert.ok(COMMUNITY_BY_ID.has(value), `SECTOR_COMMUNITY[${key}] -> known card ${value}`);
  }
});

test('communityCard resolves direct ids, station aliases, and sectors; unknown ids are null', () => {
  assert.equal(communityCard('station_helios'), COMMUNITY_BY_ID.get('station_helios'));
  assert.equal(communityCard('station_helios').id, 'station_helios');
  // Anchoring aliases: real ids that share a community's voice.
  assert.equal(communityCard('station_coalition'), COMMUNITY_BY_ID.get('station_helios'));
  assert.equal(communityCard('station_vesta_outlying_yard'), COMMUNITY_BY_ID.get('station_forge'));
  assert.equal(communityCard('station_depot3'), COMMUNITY_BY_ID.get('station_forge'));
  assert.equal(communityCard('sector_ceres_belt'), COMMUNITY_BY_ID.get('station_ceres'));
  // Unknown and non-string ids keep the authored-fallback contract (null).
  assert.equal(communityCard('station_no_such_place'), null);
  assert.equal(communityCard('sector_no_such_place'), null);
  assert.equal(communityCard(''), null);
  assert.equal(communityCard(null), null);
  assert.equal(communityCard(undefined), null);
  assert.equal(communityCard(42), null);
});

test('stationLine and sectorLine return deterministic samples and wrap negative indexes', () => {
  const helios = COMMUNITY_BY_ID.get('station_helios');
  assert.equal(stationLine('station_helios'), helios.voiceSamples[0], 'default sampleIndex is 0');
  assert.equal(stationLine('station_helios', 2), helios.voiceSamples[2]);
  assert.equal(stationLine('station_helios', 5), helios.voiceSamples[0], 'index wraps by length');
  assert.equal(
    stationLine('station_helios', -1),
    helios.voiceSamples[helios.voiceSamples.length - 1],
    'negative index wraps to the end',
  );
  assert.equal(stationLine('station_helios', -7), helios.voiceSamples[3], 'large negative wraps');
  assert.equal(stationLine('station_no_such_place', 0), null, 'unknown station has no line');
  assert.equal(stationLine(null), null);

  assert.equal(sectorLine('sector_helios_prime', 0), helios.voiceSamples[0]);
  assert.equal(
    sectorLine('sector_vesta_forge', 1),
    COMMUNITY_BY_ID.get('station_forge').voiceSamples[1],
  );
  assert.equal(sectorLine('sector_ceres_belt', -1), COMMUNITY_BY_ID.get('station_ceres')
    .voiceSamples[COMMUNITY_BY_ID.get('station_ceres').voiceSamples.length - 1]);
  assert.equal(sectorLine('sector_no_such_place'), null, 'unknown sector has no line');
  assert.equal(sectorLine('station_helios'), null, 'sectorLine does not answer station ids');
});

test('module is pure: double import yields the same frozen structures', async () => {
  const again = await import('../src/data/communityPersonality.js');
  assert.equal(again.COMMUNITY_PERSONALITY, COMMUNITY_PERSONALITY, 'cards are module-level data');
  assert.equal(again.COMMUNITY_BY_ID, COMMUNITY_BY_ID);
  assert.equal(again.STATION_COMMUNITY, STATION_COMMUNITY);
  assert.equal(again.SECTOR_COMMUNITY, SECTOR_COMMUNITY);

  assert.ok(COMMUNITY_PERSONALITY instanceof Array);
  assert.equal(Object.isFrozen(COMMUNITY_PERSONALITY), true);
  assert.equal(COMMUNITY_BY_ID instanceof Map, true);
  assert.equal(Object.isFrozen(COMMUNITY_BY_ID), true);
  assert.equal(Object.isFrozen(STATION_COMMUNITY), true);
  assert.equal(Object.isFrozen(SECTOR_COMMUNITY), true);
  for (const card of COMMUNITY_PERSONALITY) {
    assert.equal(Object.isFrozen(card), true, `${card.id} card is frozen`);
    assert.equal(Object.isFrozen(card.voiceSamples), true, `${card.id}.voiceSamples is frozen`);
    for (const sample of card.voiceSamples) {
      assert.equal(Object.isFrozen(sample), true, `${card.id} sample "${sample}" is frozen`);
    }
  }
  // Frozen means frozen: adding an anchoring key or a roster entry must not silently succeed.
  assert.throws(() => { STATION_COMMUNITY.station_fake = 'station_helios'; }, TypeError);
  assert.throws(() => { COMMUNITY_PERSONALITY.push(COMMUNITY_PERSONALITY[0]); }, TypeError);
});
