import test from 'node:test';
import assert from 'node:assert/strict';

import { pickDecodeRunwayCandidates } from '../src/render/decodeRunwayPick.js';

// Oracle: the pre-optimization kickDecodeRunwayAssets — copy the list, fully sort it with the
// (wave-matched first, then decodeSeconds) comparator, then walk until two eligible entities
// have started. Stub predicates ride on entity fields so both implementations see identical
// inputs; RUNWAY stands in for TABLE_DECODE_RUNWAY_SECONDS.
const RUNWAY = 42;

function oracleStarts(list, pending) {
  const decodeSeconds = (e) => (e ? e.decodeS : NaN);
  const ordered = list.length > 1
    ? list.slice().sort((a, b) => {
      const aw = (a && a.wave) ? 0 : 1;
      const bw = (b && b.wave) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return decodeSeconds(a) - decodeSeconds(b);
    })
    : list;
  const started = [];
  for (let i = 0; i < ordered.length && started.length < 2; i++) {
    const entity = ordered[i];
    if (!entity || entity.alive === false) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    if (!entity.needsDecode) continue;
    if (pending.has(entity.id)) continue;
    if (!entity.wave && !entity.relevant && !(decodeSeconds(entity) <= RUNWAY)) continue;
    pending.add(entity.id);
    started.push(entity);
  }
  return started;
}

// Mirrors the real kickDecodeRunwayAssets evaluate + start loop with the same stub fields.
function newStarts(list, pending) {
  const ordered = pickDecodeRunwayCandidates(list, (entity, key) => {
    if (!entity || entity.alive === false) return false;
    if (entity.type !== 'ship' && entity.type !== 'station') return false;
    if (!entity.needsDecode) return false;
    if (pending.has(entity.id)) return false;
    const wave = !!entity.wave;
    const seconds = entity.decodeS;
    if (!wave && !entity.relevant && !(seconds <= RUNWAY)) return false;
    key.wave = wave ? 0 : 1;
    key.seconds = seconds;
    return true;
  });
  const started = [];
  for (const entity of ordered) {
    pending.add(entity.id);
    started.push(entity);
  }
  return started;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ['ship', 'station', 'ship', 'rock', 'ship', 'projectile', 'station'];

function randomList(rand) {
  const n = Math.floor(rand() * 60);
  const list = [];
  for (let i = 0; i < n; i++) {
    const roll = rand();
    const decodeS = roll < 0.08 ? Infinity
      : roll < 0.14 ? -rand() * 10
      : roll < 0.3 ? Math.floor(rand() * 4) // coarse decodeSeconds values force ordering ties
      : rand() * 200;
    const entity = {
      // Small id space on purpose: same-id duplicates must resolve exactly like the old
      // sorted pending-set walk did (first sorted eligible occurrence claims the id).
      id: `e${Math.floor(rand() * (n * 0.6 + 2))}`,
      alive: rand() < 0.85,
      type: TYPES[Math.floor(rand() * TYPES.length)],
      needsDecode: rand() < 0.7,
      wave: rand() < 0.3,
      relevant: rand() < 0.5,
      decodeS,
    };
    list.push(entity);
    if (rand() < 0.1) list.push(entity); // duplicate list entry
    // No nulls: the real presentation list never carries one, and the oracle's comparator on a
    // null would be non-transitive (NaN reads as equal), which makes sorted order undefined.
  }
  return list;
}

test('linear top-two pick matches the old full-sort oracle on 800 randomized lists', () => {
  const rand = mulberry32(0xDEC0DE);
  for (let c = 0; c < 800; c++) {
    const list = randomList(rand);
    const pending = new Set();
    for (let i = 0; i < Math.floor(rand() * 10); i++) {
      pending.add(`e${Math.floor(rand() * 30)}`);
    }
    const expected = oracleStarts(list, new Set(pending));
    const actual = newStarts(list, new Set(pending));
    assert.equal(actual.length, expected.length, `case ${c}: started count`);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(actual[i], expected[i], `case ${c}: pick ${i} identity`);
    }
  }
});

test('empty and ineligible lists pick nothing', () => {
  const noop = () => { throw new Error('evaluate must not run'); };
  assert.equal(pickDecodeRunwayCandidates(null, noop).length, 0);
  assert.equal(pickDecodeRunwayCandidates([], noop).length, 0);
  const list = [{ id: 'a', alive: true, type: 'ship', needsDecode: true, wave: true, decodeS: 1 }];
  const got = pickDecodeRunwayCandidates(list, () => false);
  assert.equal(got.length, 0);
});

test('wave-matched candidates outrank earlier decode seconds; ties keep list order', () => {
  const list = [
    { id: 'early', alive: true, type: 'ship', needsDecode: true, wave: false, relevant: true, decodeS: 0 },
    { id: 'waveA', alive: true, type: 'ship', needsDecode: true, wave: true, decodeS: 99 },
    { id: 'waveB', alive: true, type: 'ship', needsDecode: true, wave: true, decodeS: 99 },
  ];
  const pending = new Set();
  const started = newStarts(list, pending);
  assert.deepEqual(started.map((e) => e.id), ['waveA', 'waveB']);
});

test('duplicate ids: the first sorted eligible occurrence claims the slot', () => {
  const a5 = { id: 'dup', alive: true, type: 'ship', needsDecode: true, wave: false, relevant: true, decodeS: 5 };
  const b1 = { id: 'b', alive: true, type: 'ship', needsDecode: true, wave: false, relevant: true, decodeS: 1 };
  const c9 = { id: 'c', alive: true, type: 'ship', needsDecode: true, wave: false, relevant: true, decodeS: 9 };
  const a0 = { id: 'dup', alive: true, type: 'ship', needsDecode: true, wave: false, relevant: true, decodeS: 0 };
  // Sorted order is a0, b1, a5(skipped by pending), c9 — so starts are a0 then b1.
  const started = newStarts([a5, b1, c9, a0], new Set());
  assert.deepEqual(started.map((e) => e.id), ['dup', 'b']);
  assert.equal(started[0], a0);
});
