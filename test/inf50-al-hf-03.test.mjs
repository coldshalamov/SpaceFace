// AL-HF-03 — each course publishes three medal times. A time-trial run under silver
// earns silver in local career storage. The bar is the course, not a personal best.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_LEVELS, courseForLevel, medalForCourseTime, racingOfferFor } from '../src/data/raceLevels.js';
import { awardCourseMedal, readRacingCareer, stageRacingMeeting } from '../src/systems/racingCareer.js';
import { raceRecordKey } from '../src/systems/racingSteer.js';
import { formatRaceTime } from '../src/ui/racingMap.js';
import { raceBoardScreen } from '../src/ui/screens/raceBoard.js';
import { rememberRacingResult } from '../src/ui/racingControls.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const LEVEL_ID = 'level_junction_return';
const SEED = 4242;
const CAREER_KEY = 'spaceface.racingCareer.v1';
const RECORD_KEY = 'spaceface.raceRecords.v2';

function memoryStorage() {
  const rows = new Map();
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) { rows.set(key, String(value)); },
  };
}

function boardDocument() {
  const doc = fakeDom();
  const make = (tag) => {
    const node = doc._make(tag);
    node.replaceChildren = (...children) => {
      node.children.length = 0;
      node.append(...children);
    };
    node.insertBefore = (child) => { child.parentNode = node; node.children.unshift(child); return child; };
    return node;
  };
  doc.createElement = make;
  doc.createElementNS = (_ns, tag) => make(tag);
  return doc;
}

test('seed 4242: every course has three ordered medal times that ignore a personal best', () => {
  assert.equal(SEED, 4242);
  for (const level of RACE_LEVELS) {
    const times = courseForLevel(level.id).medalTimes;
    assert.ok(times.gold < times.silver && times.silver < times.bronze, level.id);
    assert.equal(medalForCourseTime(level.id, times.gold), 'Silver');
    assert.equal(medalForCourseTime(level.id, times.gold - 0.01), 'Gold');
    assert.equal(medalForCourseTime(level.id, (times.gold + times.silver) / 2), 'Silver');
    assert.equal(medalForCourseTime(level.id, times.bronze), null);
  }
});

test('seed 4242: a Tethys time under silver is stored as silver and survives the next save', () => {
  const times = courseForLevel(LEVEL_ID).medalTimes;
  const elapsed = (times.gold + times.silver) / 2;
  const storage = memoryStorage();
  const awarded = awardCourseMedal({ levelId: LEVEL_ID, elapsedS: elapsed, raceMode: 'time-trial' }, storage);
  assert.equal(awarded.medal, 'Silver');
  assert.equal(awarded.ok, true);
  assert.equal(awarded.saved, true);
  const raw = storage.getItem(CAREER_KEY);
  const saved = JSON.parse(raw);
  assert.equal(saved.medals[LEVEL_ID].medal, 'Silver');
  assert.deepEqual(Object.keys(saved.medals[LEVEL_ID]).sort(), ['elapsedS', 'medal']);
  for (const key of Object.keys(saved)) assert.equal(/credit|reward/i.test(key), false);
  assert.equal(stageRacingMeeting(storage)?.raceMeetingId, 1);
  const reloaded = memoryStorage();
  reloaded.setItem(CAREER_KEY, storage.getItem(CAREER_KEY));
  assert.equal(readRacingCareer(reloaded).medals[LEVEL_ID].medal, 'Silver');
  const pack = awardCourseMedal({ levelId: LEVEL_ID, elapsedS: elapsed, raceMode: 'race' }, reloaded);
  assert.equal(pack.reason, 'not_time_trial');
  assert.equal(readRacingCareer(reloaded).medals[LEVEL_ID].medal, 'Silver');
  const slow = memoryStorage();
  assert.equal(awardCourseMedal({
    levelId: LEVEL_ID, elapsedS: times.bronze + 1, raceMode: 'time-trial',
  }, slow).reason, 'no_medal');
  assert.equal(readRacingCareer(slow).medals, undefined);
});

test('seed 4242: the Tethys time-trial board shows the three medal times, not the player best', () => {
  const times = courseForLevel(LEVEL_ID).medalTimes;
  const elapsed = (times.gold + times.silver) / 2;
  const storage = memoryStorage();
  const offer = racingOfferFor('practice_level_junction_return');
  const planted = `${raceRecordKey(offer.params)}:fit5-planted`;
  storage.setItem(RECORD_KEY, JSON.stringify({ [planted]: 1.25 }));
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  const previousFit = raceBoardScreen._fit;
  globalThis.document = boardDocument();
  globalThis.localStorage = storage;
  raceBoardScreen._fit = { starter: 'ship_kestrel', drive: 'standard', raceMode: 'time-trial', raceDifficulty: 'club' };
  rememberRacingResult({
    racingContractId: 'practice_level_junction_return',
    levelId: LEVEL_ID,
    raceMode: 'time-trial',
    raceElapsedS: elapsed,
    raceClean: true,
    raceBand: 'standard',
    raceLapTimesS: [elapsed],
  });
  const root = globalThis.document.createElement('div');
  const ctx = {
    bus: { emit() {}, on() { return () => {}; } },
    state: {
      mode: 'menu', simTime: 0, meta: { seed: SEED }, settings: { gameplay: {} }, ui: {},
      world: { currentSectorId: 'sector_tethys_junction' }, missions: { active: [] },
      entities: new Map(), input: { flightMode: 'assisted' },
    },
    screenManager: { popScreen() {} },
  };
  try {
    raceBoardScreen.mount(root, ctx);
    const lines = textLines(root);
    const medal = lines.find((line) => line.startsWith('Tally Circuit medal times'));
    assert.equal(medal, `Tally Circuit medal times · Gold ${formatRaceTime(times.gold)} · Silver ${formatRaceTime(times.silver)} · Bronze ${formatRaceTime(times.bronze)}`);
    assert.equal(medal.includes('1.25'), false);
    assert.ok(lines.some((line) => line.includes('best across fits 1.25s')));
    assert.ok(lines.includes('Your medal: Silver'));
    assert.equal(readRacingCareer(storage).medals[LEVEL_ID].medal, 'Silver');
    const again = JSON.parse(storage.getItem(CAREER_KEY));
    assert.equal(again.medals[LEVEL_ID].medal, 'Silver');
    assert.equal(again.credits, undefined);
  } finally {
    raceBoardScreen.unmount();
    raceBoardScreen._fit = previousFit;
    rememberRacingResult({
      racingContractId: 'practice_level_junction_return',
      raceMode: 'race',
      raceElapsedS: 9999,
      status: 'dnf',
    });
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    globalThis.document = previousDocument;
  }
});
