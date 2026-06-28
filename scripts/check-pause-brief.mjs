#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pauseExitConfirmBody, pauseMapAction, pauseStatusLines } from '../src/ui/screens/pause.js';

const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
const uiInputSrc = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');

assert.match(pauseSrc, /FLIGHT BRIEF/, 'pause menu should render a visible flight brief panel');
assert.match(pauseSrc, /aria-live/, 'flight brief should announce refreshed objective state politely');
assert.match(pauseSrc, /Mission Log \(' \+ BINDINGS\.missionLog\.label \+ '\)/,
  'pause menu should label the Mission Log action with the live binding');
assert.match(pauseSrc, /function pauseMapAction\(state\)/,
  'pause menu should keep contextual map routing policy directly testable');
assert.match(pauseSrc, /pauseMapAction\(ctx && ctx\.state\)[\s\S]*nav\(ctx, 'pushScreen', mapAction\.id\)/,
  'pause menu should expose a contextual map action when a waypoint is set');
assert.match(pauseSrc, /export function pauseStatusLines/, 'pause brief policy should stay directly testable');
assert.match(pauseSrc, /export function pauseExitConfirmBody/,
  'pause exit confirmation policy should stay directly testable');
assert.match(pauseSrc, /body: pauseExitConfirmBody\(ctx && ctx\.state, 'load'\)/,
  'Load confirmation should repeat the live run context before opening load slots');
assert.match(pauseSrc, /body: pauseExitConfirmBody\(ctx && ctx\.state, 'menu'\)/,
  'Main Menu confirmation should repeat the live run context before closing the session');
assert.doesNotMatch(pauseSrc, /Loading will discard any unsaved progress in the current session\./,
  'Pause Load confirmation must not fall back to generic unsaved-progress copy');
assert.doesNotMatch(pauseSrc, /Any unsaved progress will be lost\. You can Save first if you want to keep it\./,
  'Pause Main Menu confirmation must not fall back to generic unsaved-progress copy');

assert.match(uiInputSrc, /function allowsMissionLogShortcut\(def\)/,
  'UI input should keep modal Mission Log shortcut scope explicit');
assert.match(uiInputSrc, /def\.id === 'station' \|\| def\.id === 'pause'/,
  'Mission Log shortcut should work from station and Pause, not every modal route');
assert.match(uiInputSrc, /allowsMissionLogShortcut\(def\) && matchesBinding\(ev, BINDINGS\.missionLog\)[\s\S]*screenManager\.pushScreen\('missionLog'\)/,
  'Pause and station should honor the live Mission Log binding over modal UI');

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

let body = pauseExitConfirmBody(trackedState, 'load');
assert.match(body, /Opening Load lets you review slots/);
assert.match(body, /TRACKED - Helios Priority Run/);
assert.match(body, /Helios Gate/);
assert.match(body, /Save status: Saved .* to Quick/);
assert.match(body, /If you complete a load, unsaved progress is lost/);

body = pauseExitConfirmBody(trackedState, 'menu');
assert.match(body, /Returning to main menu closes the current session/);
assert.match(body, /TRACKED - Helios Priority Run/);
assert.match(body, /Save status: Saved .* to Quick/);
assert.match(body, /Unsaved progress will be lost/);

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
assert.match(lines.next, /Star Map \(/);
assert.match(lines.save, /^Unsaved run/);

let mapAction = pauseMapAction({
  nav: { waypoint: { label: 'Local salvage marker', pos: { x: 10, z: 20 } } },
  world: { currentSectorId: 'sector_helios_prime' },
});
assert.equal(mapAction.id, 'localmap');
assert.match(mapAction.label, /Local Map \(/);

mapAction = pauseMapAction({
  nav: { waypoint: { label: 'Off-sector trade', sectorId: 'sector_vesta' } },
  world: { currentSectorId: 'sector_helios_prime' },
});
assert.equal(mapAction.id, 'starmap');
assert.match(mapAction.label, /Star Map \(/);

body = pauseExitConfirmBody({
  simTime: 10,
  missions: { active: [] },
  nav: { waypoint: { label: 'Sell Food at Vesta Exchange' } },
  meta: {},
  save: {},
}, 'menu');
assert.match(body, /NAV SET - Sell Food at Vesta Exchange/);
assert.match(body, /Save status: Unsaved run/);
assert.match(body, /Use Save or F5 before quitting/);

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
