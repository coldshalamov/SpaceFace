// objective-lines — every contract type reads as an instruction, never a bare "0/1".
//
// objectiveText (src/ui/screens/missionLog.js) is the single objective projection behind the HUD
// tracker, the local map, the mission log and the station Contracts list. Its switch used to
// stop at the original ten types, so a tow job, a demolition, a pod rescue or a race fell through
// to `${prog}/${tgt}` on all four surfaces. This pins the whole MISSION_TYPES table, so a type
// added later cannot silently fall back to a bare count or a raw snake_case id.
import test from 'node:test';
import assert from 'node:assert/strict';

import { objectiveText } from '../src/ui/screens/missionLog.js';
import { MISSION_TYPES } from '../src/data/missions.js';

const blank = (type, extra = {}) => ({
  type,
  params: {},
  objectiveProgress: 0,
  objectiveTarget: 1,
  ...extra,
});

// A raw internal id in player text: snake_case ("tow_recovery") or camelCase ("towRecovery").
const SNAKE = /[A-Za-z0-9]_[A-Za-z0-9]/;
const CAMEL = /\b[a-z]+[A-Z][A-Za-z]*\b/;

function assertReadable(text, label) {
  assert.equal(typeof text, 'string', `${label}: a string`);
  assert.ok(text.trim().length > 0, `${label}: non-empty`);
  assert.doesNotMatch(text, /^\s*\d+\s*\/\s*\d+\s*$/, `${label}: not a bare count (${text})`);
  assert.doesNotMatch(text, SNAKE, `${label}: no snake_case id token (${text})`);
  assert.doesNotMatch(text, CAMEL, `${label}: no camelCase id token (${text})`);
  assert.doesNotMatch(text, /undefined|null|NaN/, `${label}: no leaked placeholder (${text})`);
}

test('every MISSION_TYPES id has a readable objective line at 0/1', () => {
  assert.ok(MISSION_TYPES.length >= 20, 'the table is the live one, not a stub');
  for (const def of MISSION_TYPES) {
    assertReadable(objectiveText(blank(def.type)), def.type);
  }
});

test('every MISSION_TYPES id stays readable mid-progress with a multi-unit target', () => {
  for (const def of MISSION_TYPES) {
    assertReadable(objectiveText(blank(def.type, { objectiveProgress: 2, objectiveTarget: 5 })), `${def.type} 2/5`);
  }
});

test('the physical-job types say what to do', () => {
  assert.match(objectiveText(blank('tow_recovery')), /^Tow the slag core home, or sling it into the yard$/);
  assert.match(
    objectiveText(blank('tow_recovery', { destStationId: 'station_helios' })),
    /^Tow the slag core to Helios Station, or sling it into the yard$/,
  );
  assert.match(
    objectiveText(blank('tow_recovery', { params: { variant: 'drift_hulk' } })),
    /^Tow the dead freighter home/,
  );
  assert.match(objectiveText(blank('demolition')), /^Knock down the marked tower$/);
  assert.match(
    objectiveText(blank('demolition', { params: { variant: 'guarded_tower' } })),
    /^Knock down the picketed tower$/,
  );
  assert.match(objectiveText(blank('rescue_under_fire')), /^Pull the life pods out of the field$/);
  assert.match(objectiveText(blank('capital_boss')), /^Destroy the capital ship$/);
});

test('a named destination sector is spoken, not hidden', () => {
  const text = objectiveText(blank('demolition', { destSectorId: 'sector_helios_prime' }));
  assert.match(text, /^Knock down the marked tower in .+/, text);
  assertReadable(text, 'demolition in sector');
  const pods = objectiveText(blank('rescue_under_fire', { destSectorId: 'sector_helios_prime' }));
  assert.match(pods, /^Pull the life pods out of [A-Z]/, pods);
});

test('counts show up only as progress riding on a sentence', () => {
  assert.match(
    objectiveText(blank('rescue_under_fire', { objectiveProgress: 1, objectiveTarget: 2 })),
    /^Pull 1\/2 life pods out of /,
  );
  assert.equal(
    objectiveText(blank('race', {
      objectiveProgress: 2, objectiveTarget: 6, params: { courseName: 'Kiln Run' },
    })),
    'Run the Kiln Run gates in order · 2/6 cleared',
  );
  assert.equal(objectiveText(blank('race')), 'Run the gate course and finish');
  assert.match(
    objectiveText(blank('split_manifest', { objectiveProgress: 1, objectiveTarget: 2 })),
    /^Land the cargo nets on the yard pad · 1\/2 landed$/,
  );
  assert.match(
    objectiveText(blank('bulk_haul', { objectiveProgress: 10, objectiveTarget: 40, destStationId: 'station_helios' })),
    /^Tether-haul 10\/40u bulk ore to Helios Station$/,
  );
});

test('authored set pieces speak their own words', () => {
  assert.equal(
    objectiveText(blank('authored_set_piece', { brief: 'Swing mass through the tower, or cut it down.' })),
    'Swing mass through the tower, or cut it down.',
  );
  assert.equal(
    objectiveText(blank('authored_set_piece', { title: 'Knock the dead tower' })),
    'Knock the dead tower',
  );
  assert.equal(objectiveText(blank('authored_set_piece')), 'Finish the physical job');
});

test('unknown types fall back to the contract words, then a plain type name, never a bare count', () => {
  assert.equal(objectiveText(blank('survey_the_deep', { brief: 'Map the trench wall.' })), 'Map the trench wall.');
  assert.equal(objectiveText(blank('survey_the_deep', { navReason: 'Fix the trench bearing' })), 'Fix the trench bearing');
  assert.equal(objectiveText(blank('survey_the_deep')), 'Survey The Deep');
  assert.equal(
    objectiveText(blank('survey_the_deep', { objectiveProgress: 1, objectiveTarget: 3 })),
    'Survey The Deep · 1/3',
  );
  assert.equal(objectiveText({ params: {} }), 'Contract', 'a mission with no type still reads as a sentence');
});

test('the original ten types keep their wording', () => {
  assert.equal(objectiveText(blank('bounty_hunt')), 'Eliminate target');
  assert.equal(objectiveText(blank('patrol_clear', { objectiveProgress: 1, objectiveTarget: 3 })), 'Clear 1/3 hostiles');
  assert.equal(objectiveText(blank('recon_scan', { objectiveProgress: 0, objectiveTarget: 2 })), 'Scan 0/2 targets');
});
