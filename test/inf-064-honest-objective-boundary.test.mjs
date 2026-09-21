// INF-064 — the objective text stays bound by the completion predicate. Escort is the
// weakest mission: its dock predicate (missions.js _onDockedObjectives escort branch gated on
// _escorteeArrivedOk) holds the contract open until the CONVOY docks too, but the shared
// objective projection used to read a bare `Escort to X` — the player sits inside the destination
// marker with nothing left to do per the text while the predicate refuses completion. The text
// must expose the missing convoy-arrival condition, and only when a live escortee is pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { objectiveText } from '../src/ui/screens/missionLog.js';

const base = {
  type: 'escort',
  title: 'Convoy screen',
  destStationId: 'station_helios',
  objectiveProgress: 0,
  objectiveTarget: 1,
  params: {},
};

// Should-NOT-complete state: a live escortee exists and has not arrived. Mirrors the predicate
// `_escorteeId != null && alive && !_escorteeArrived` refusing the dock turn-in.
const convoyPending = { ...base, _escorteeId: 42, _escorteeArrived: false };
const convoyArrived = { ...base, _escorteeId: 42, _escorteeArrived: true };
const noLiveEscortee = { ...base };

test('a pending convoy is exposed in the objective text, not hidden behind the destination', () => {
  const text = objectiveText(convoyPending);
  assert.match(text, /Helios Station/, 'still names the destination');
  assert.match(text, /convoy/i, 'exposes the missing convoy-arrival condition');
});

test('no pending escortee means no convoy clause (predicate satisfied by default)', () => {
  assert.equal(objectiveText(noLiveEscortee), 'Escort to Helios Station', 'clean text when nothing gates');
  assert.equal(objectiveText(convoyArrived), 'Escort to Helios Station', 'clean text once the convoy arrives');
});

test('the text condition tracks the live dock predicate, not a copy of it', () => {
  const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /if \(t === 'escort'\) \{[\s\S]*?_escorteeArrivedOk\(m\)/,
    'escort dock completion is still gated on escortee arrival',
  );
  for (const m of [convoyPending, convoyArrived, noLiveEscortee]) {
    const revived = JSON.parse(JSON.stringify(m));
    assert.equal(objectiveText(revived), objectiveText(m), 'wording survives a save round trip');
  }
});
