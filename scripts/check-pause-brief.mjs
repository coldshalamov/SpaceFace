#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pauseStatusLines } from '../src/ui/screens/pause.js';

const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');

assert.match(pauseSrc, /FLIGHT BRIEF/, 'pause menu should render a visible flight brief panel');
assert.match(pauseSrc, /aria-live/, 'flight brief should announce refreshed objective state politely');
assert.match(pauseSrc, /Mission Log \(' \+ BINDINGS\.missionLog\.label \+ '\)/,
  'pause menu should label the Mission Log action with the live binding');
assert.match(pauseSrc, /export function pauseStatusLines/, 'pause brief policy should stay directly testable');

const trackedState = {
  simTime: 100,
  ui: { trackedMissionId: 'mission_helios_run' },
  missions: {
    active: [{
      id: 'mission_helios_run',
      status: 'active',
      type: 'cargo_delivery',
      title: 'Helios Priority Run',
      objectiveProgress: 1,
      objectiveTarget: 2,
      deadline_s: 460,
      destStationName: 'Helios Gate',
    }],
  },
  meta: { lastSavedAt: '2026-06-28T12:00:00.000Z' },
  save: { currentSlot: 'quick' },
};

let lines = pauseStatusLines(trackedState);
assert.match(lines.objective, /^TRACKED/);
assert.match(lines.objective, /Helios Priority Run/);
assert.match(lines.objective, /50% complete/);
assert.match(lines.objective, /6m left/);
assert.match(lines.next, /Helios Gate/);
assert.match(lines.save, /Quick/);
assert.match(lines.save, /F5 quick-saves/);

lines = pauseStatusLines({
  ...trackedState,
  ui: { trackedMissionId: null },
});
assert.match(lines.objective, /^UNTRACKED CONTRACT/);
assert.match(lines.next, /Mission Log \(J\).*Track Nav/);

lines = pauseStatusLines({
  simTime: 10,
  missions: { active: [] },
  nav: { waypoint: { label: 'Sell Food at Vesta Exchange' } },
  meta: {},
  save: {},
});
assert.match(lines.objective, /^NAV SET/);
assert.match(lines.objective, /Sell Food at Vesta Exchange/);
assert.match(lines.save, /^Unsaved run/);

lines = pauseStatusLines({
  simTime: 10,
  missions: { active: [] },
  meta: {},
  save: { currentSlot: 'auto' },
});
assert.equal(lines.objective, 'NO ACTIVE CONTRACT');
assert.match(lines.next, /dock at a station/);
assert.match(lines.save, /Loaded Auto/);

console.log('ok pause brief');
