// inf-war-desk — the desk says the house's own war.
//
// War states existed sim-side (state.conflicts pair records with tension and stance) and the
// chart rendered them, but docking into a faction at war read like any other visit — the one
// place that speaks for the house said nothing about the war it is fighting. The arrival
// greeting now carries one war-posture clause naming the rival, from the same record, pure.
import assert from 'node:assert/strict';
import test from 'node:test';

import { stationWarPostureLineFor } from '../src/ui/station/stationArrival.js';
import { FACTION_KITS } from '../src/data/factions/index.js';

const KIT_IDS = FACTION_KITS.map((kit) => kit.id);

test('a war pair names the rival in the house’s own register', () => {
  const [a, b] = KIT_IDS;
  const state = { conflicts: { [`${a}:${b}`]: { state: 'war', tension: 80 } } };
  const line = stationWarPostureLineFor(state, a);
  assert.ok(line.includes('at war'), 'the clause names the war');
  const kit = FACTION_KITS.find((entry) => entry.id === b);
  const rivalName = (kit && (kit.short || kit.name)) || b.replace(/^faction_/, '');
  assert.ok(line.includes(rivalName), 'the rival is named by its authored display name');
  // The other member of the same pair reads the mirrored line.
  const mirrored = stationWarPostureLineFor(state, b);
  assert.ok(mirrored && mirrored.includes('at war'), 'both houses speak their own war');
});

test('cold and tense pairs stay quiet at the desk', () => {
  const [a, b] = KIT_IDS;
  const cold = { conflicts: { [`${a}:${b}`]: { state: 'cold', tension: 10 } } };
  const tense = { conflicts: { [`${a}:${b}`]: { state: 'tense', tension: 55 } } };
  assert.equal(stationWarPostureLineFor(cold, a), null);
  assert.equal(stationWarPostureLineFor(tense, a), null, 'tension alone is not war');
});

test('a station of a faction outside the pair never speaks another house’s war', () => {
  const [a, b] = KIT_IDS;
  const third = KIT_IDS.find((id) => id !== a && id !== b);
  const state = { conflicts: { [`${a}:${b}`]: { state: 'war', tension: 90 } } };
  assert.equal(stationWarPostureLineFor(state, third), null,
    'a bystander house does not claim the war');
});

test('corrupt and missing records fail closed', () => {
  assert.equal(stationWarPostureLineFor(null, KIT_IDS[0]), null);
  assert.equal(stationWarPostureLineFor({}, KIT_IDS[0]), null);
  assert.equal(stationWarPostureLineFor({ conflicts: { [`${KIT_IDS[0]}:${KIT_IDS[1]}`]: null } }, KIT_IDS[0]), null);
  assert.equal(stationWarPostureLineFor({ conflicts: { [`${KIT_IDS[0]}:${KIT_IDS[1]}`]: { state: 'WAR' } } }, KIT_IDS[0]) !== null, true,
    'the stance read matches the chart’s own case-insensitive tolerance');
});
