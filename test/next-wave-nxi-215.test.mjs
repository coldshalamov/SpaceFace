// NXI-215 — two tracked destinations do not both read as the current commanded route.
//
// The local map objective panel used to start the tracked-mission card's body from the live
// waypoint's reason, so a tracked delivery (ui.trackedMissionId) plus an unrelated commanded
// course (nav.waypoint from a map click / trade route / scanner fix) folded BOTH destinations
// into one sentence under the mission's title — both read as commanded at once.
//
// Pinned here:
//   1. tracked mission + unrelated course → the body is the mission's own objective projection,
//      the other fix appears only as a separate "Course:" line, and the course's own sentence
//      does not speak inside the tracked-mission card;
//   2. neighboring success — a course laid FOR the tracked mission (waypoint.missionId matches)
//      still speaks its own reason as the body, with no extra Course row (unchanged behavior);
//   3. tracked mission with no waypoint → the plain objective projection, no Course row.
//
// The real screen module drives a minimal fake panel (innerHTML/aria capture only); seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { localmapScreen } from '../src/ui/screens/localmap.js';
import { objectiveText } from '../src/ui/screens/missionLog.js';

const SEED = 4242;

function fakePanel() {
  const attrs = {};
  return {
    hidden: true,
    html: '',
    set innerHTML(v) { this.html = String(v); },
    get innerHTML() { return this.html; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = String(value); },
  };
}

function bootPanel(state) {
  const screen = Object.create(localmapScreen);
  screen._objectivePanel = fakePanel();
  screen._objectiveSig = '';
  const player = { pos: { x: 0, z: 0 } };
  screen._renderObjectivePanel(state, player);
  return screen._objectivePanel.html;
}

function baseState() {
  return {
    simTime: 500,
    ui: { trackedMissionId: 'm_delivery' },
    missions: {
      active: [{
        id: 'm_delivery',
        status: 'active',
        type: 'cargo_delivery',
        title: 'Haul the sample',
        destStationId: 'station_helios',
        deadline_s: 1200,
        objectiveProgress: 0,
        objectiveTarget: 12,
        params: { cmdtyId: 'cmdty_ore_iron', qty: 12 },
      }],
    },
    nav: { waypoint: null, route: null },
    story: { beatIndex: 0 },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
  };
}

test('a tracked mission and an unrelated commanded course stay two distinct destinations', () => {
  const state = baseState();
  state.nav.waypoint = {
    kind: 'local',
    label: 'Repair dock',
    reason: 'Autopilot fix: Repair dock',
    pos: { x: 640, z: 120 },
  };
  const html = bootPanel(state);
  const expectedObjective = objectiveText(state.missions.active[0]);
  assert.match(html, /Tracked Mission/, 'the card still presents the tracked mission');
  assert.match(html, /Haul the sample/, 'under the mission title');
  assert.ok(html.includes(expectedObjective),
    `the body is the mission's own objective projection (${expectedObjective})`);
  assert.ok(!html.includes('Autopilot fix'),
    'the unrelated course sentence does not speak inside the tracked-mission card');
  assert.match(html, /Course: Repair dock/, 'the other destination is named as a course, not the objective');
});

test('a course laid for the tracked mission still reads as its objective (unchanged behavior)', () => {
  const state = baseState();
  state.nav.waypoint = {
    kind: 'mission',
    missionId: 'm_delivery',
    missionTitle: 'Haul the sample',
    label: 'Helios Station',
    reason: 'Deliver the sample to Helios Station',
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    pos: { x: 1410, z: -310 },
  };
  const html = bootPanel(state);
  assert.match(html, /Tracked Mission/);
  assert.match(html, /Deliver the sample to Helios Station/, 'the mission course reason remains the body');
  assert.ok(!html.includes('Course:'), 'no demotion row when the course serves the tracked mission');
});

test('a tracked mission with no waypoint shows only its own objective', () => {
  const state = baseState();
  const html = bootPanel(state);
  assert.match(html, /Tracked Mission/);
  assert.ok(html.includes(objectiveText(state.missions.active[0])));
  assert.ok(!html.includes('Course:'), 'nothing commanded, nothing named as a course');
});
