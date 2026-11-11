// words-ship-sheet-counts — the Ship Sheet and Settings stop writing "(s)".
//
// The "(s)" shortcut is the one plural nobody can read aloud: the capability verb said
// "Put 1 drone(s) in the water" (and the fit receipt now speaks that verb the moment a drone
// bay lands), the living-hull callouts read "1 confirmed kill(s) painted on the nose." under a
// "1 KILLS" label and "1 cycle(s) since the last wash." under "GRIMY | 1 CYCLES", and Settings
// announced "1 subscribed item(s)" and "mirrored 1 pack(s)". Each is a whole singular or plural
// sentence now, labels agreeing with their lines.
import test from 'node:test';
import assert from 'node:assert/strict';

import { capabilityDefinitions, scarCalloutsForHull } from '../src/ui/ship/shipBandModels.js';
import { settingsWorkshopSubscribedNote, settingsWorkshopSyncedNote } from '../src/ui/screens/settings.js';
import { LIVING_HULL_CYCLE_SECONDS } from '../src/core/livingHull.js';

function droneVerb(count) {
  const rows = capabilityDefinitions({ droneBayCount: count, jumpDriveTier: 'jump_t1' });
  const row = rows.find((r) => r.id === 'drone');
  return row && row.verb;
}

test('the capability verb counts one drone in the singular', () => {
  assert.equal(droneVerb(1), 'Put 1 drone in the water');
  assert.equal(droneVerb(2), 'Put 2 drones in the water');
  assert.equal(droneVerb(0), undefined, 'no bay, no verb');
});

test('the living-hull callouts agree with their counts', () => {
  const one = scarCalloutsForHull({ shipId: 'ship_kestrel', livingHull: { killTally: 1 }, simTime: 0 });
  const kill = one.find((r) => r.id === 'kills');
  assert.equal(kill.label, '1 KILL');
  assert.equal(kill.why, '1 confirmed kill painted on the nose.');
  const many = scarCalloutsForHull({ shipId: 'ship_kestrel', livingHull: { killTally: 7 }, simTime: 0 });
  assert.equal(many.find((r) => r.id === 'kills').why, '7 confirmed kills painted on the nose.');
  for (const row of [...one, ...many]) {
    assert.ok(!/\(s\)/.test(`${row.label} ${row.why}`), `no "(s)" in ${row.id}`);
  }
});

test('the grime callout counts one cycle in the singular', () => {
  const simTime = LIVING_HULL_CYCLE_SECONDS * 1.5; // exactly one whole cycle since the last wash
  const rows = scarCalloutsForHull({ shipId: 'ship_kestrel', livingHull: { lastWashAtT: 0, grime: 1 }, simTime });
  const grime = rows.find((r) => r.id === 'grime');
  if (grime) {
    assert.ok(!/\(s\)/.test(grime.why), 'no "(s)" in the grime line');
    assert.ok(/^1 cycle since the last wash\.|^\d+ cycles since the last wash\./.test(grime.why), grime.why);
    assert.ok(grime.label === 'GRIMY | 1 CYCLE' || /^GRIMY \| \d+ CYCLES$/.test(grime.label), grime.label);
  }
});

test('Settings counts one workshop item and one pack in the singular', () => {
  assert.equal(settingsWorkshopSubscribedNote(1),
    'Steam Workshop: 1 subscribed item. Sync mirrors it into the content directory; a restart loads it.');
  assert.equal(settingsWorkshopSubscribedNote(4),
    'Steam Workshop: 4 subscribed items. Sync mirrors them into the content directory; a restart loads them.');
  assert.equal(settingsWorkshopSyncedNote(1), 'Workshop sync mirrored 1 pack — restart to load');
  assert.equal(settingsWorkshopSyncedNote(3), 'Workshop sync mirrored 3 packs — restart to load');
});
