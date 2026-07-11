import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  missionMapAction,
  recommendedActions,
  tradeRouteMapAction,
} from '../src/ui/screens/missionLog.js';

const source = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

function mission(overrides = {}) {
  return {
    id: 'mission_delivery',
    status: 'active',
    type: 'cargo_delivery',
    title: 'Deliver provisions',
    destStationId: 'station_helios',
    destSectorId: 'sector_helios_prime',
    objectiveProgress: 0,
    objectiveTarget: 1,
    deadline_s: 900,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    simTime: 0,
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { trackedMissionId: 'mission_delivery' },
    nav: { route: null, waypoint: null },
    story: { beatIndex: 1 },
    player: { cargo: { usedVolume: 0, capVolume: 40 } },
    ...overrides,
  };
}

{
  const m = mission();
  const action = missionMapAction(state({
    nav: {
      waypoint: {
        kind: 'mission',
        missionId: m.id,
        sectorId: 'sector_helios_prime',
        sectorName: 'Helios Prime',
        pos: { x: 180, z: -40 },
      },
    },
  }), m, true);
  assert.equal(action.screenId, 'galaxyMap', 'tracked same-sector missions should open the unified galaxyMap');
  assert.equal(action.focus, 'local', 'same-sector handoff should request LOCAL focus');
  assert.equal(action.label, 'LOCAL MAP', 'same-sector handoff should have a player-facing label');
}

{
  const m = mission({ destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction' });
  const action = missionMapAction(state({
    nav: {
      waypoint: {
        kind: 'mission',
        missionId: m.id,
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
      },
    },
  }), m, true);
  assert.equal(action.screenId, 'galaxyMap', 'tracked off-sector missions should open the unified galaxyMap');
  assert.equal(action.focus, 'galaxy', 'off-sector handoff should request GALAXY focus');
  assert.equal(action.label, 'STAR MAP', 'off-sector handoff should have a player-facing label');
}

{
  const m = mission({ destSectorId: 'sector_tethys_junction' });
  assert.equal(missionMapAction(state(), m, false), null, 'untracked missions should not render map handoffs');
}

{
  const m = mission({
    id: 'mission_tracked',
    title: 'Tracked Tethys Run',
    destStationId: 'station_tethys',
    destSectorId: 'sector_tethys_junction',
  });
  const actions = recommendedActions(state({
    ui: { trackedMissionId: m.id },
    nav: {
      waypoint: {
        kind: 'mission',
        missionId: m.id,
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
      },
    },
  }), [m], m.id);
  assert.equal(actions[0].label, 'TRACKED', 'tracked mission should remain the first recommendation');
  assert.equal(actions[0].mapAction.screenId, 'galaxyMap', 'tracked recommendation should open the unified galaxyMap');
  assert.equal(actions[0].mapAction.focus, 'galaxy', 'tracked recommendation should request GALAXY focus');
}

{
  const action = tradeRouteMapAction(state({
    ui: { trackedMissionId: null },
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_tethys',
        commodityId: 'cmdty_food',
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
      },
    },
  }));
  assert.equal(action.screenId, 'galaxyMap', 'off-sector trade routes should open the unified galaxyMap');
  assert.equal(action.focus, 'galaxy', 'off-sector trade handoff should request GALAXY focus');
  assert.equal(action.label, 'STAR MAP', 'off-sector trade handoff should have a player-facing label');
}

{
  const action = tradeRouteMapAction(state({
    ui: { trackedMissionId: null },
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_helios',
        commodityId: 'cmdty_food',
        sectorId: 'sector_helios_prime',
        sectorName: 'Helios Prime',
        pos: { x: 12, z: 24 },
      },
    },
  }));
  assert.equal(action.screenId, 'galaxyMap', 'same-sector trade routes should open the unified galaxyMap');
  assert.equal(action.focus, 'local', 'same-sector trade handoff should request LOCAL focus');
  assert.equal(action.label, 'LOCAL MAP', 'same-sector trade handoff should have a player-facing label');
}

assert.match(source, /export function missionMapAction/, 'mission map handoff policy must stay directly testable');
assert.match(source, /export function tradeRouteMapAction/, 'trade route map handoff policy must stay directly testable');
assert.match(source, /data-act="openMap"/, 'active mission cards must render map handoff buttons');
assert.match(source, /data-rec-act="openMap"/, 'tracked recommendation must render a map handoff button');
assert.match(source, /aria-label="' \+ escapeHtml\(isTracked \? 'Tracking ' \+ titleText : 'Track navigation for ' \+ titleText\)/,
  'Mission Log track buttons must expose the concrete mission tracking action to assistive tech');
assert.match(source, /class="sf-mlog-btn-map" type="button"[\s\S]*aria-label="' \+ escapeHtml\(mapAction\.title\)/,
  'Mission Log map handoff buttons must expose the concrete map destination to assistive tech');
assert.match(source, /class="sf-mlog-btn-abandon" type="button"[\s\S]*aria-label="' \+ escapeHtml\('Abandon ' \+ titleText\)/,
  'Mission Log abandon buttons must expose the concrete mission abandonment action to assistive tech');
assert.match(source, /aria-controls="sf-mlog-completed-list"/,
  'Mission Log completed toggle must expose its controlled completed-mission list');
assert.match(source, /toggle\.setAttribute\('aria-expanded'/,
  'Mission Log completed toggle must update aria-expanded with the visible completed list state');
assert.match(source, /sf-mlog-btn-map/, 'active mission map handoff must have a dedicated style hook');
assert.match(source, /sf-mlog-rec-map/, 'recommendation map handoff must have a dedicated style hook');
assert.match(source, /openGalaxyMap|mapHandoffAction/,
  'map handoff must route through the shared map authority');
assert.match(source, /data-map-focus/,
  'map handoff buttons must expose explicit focus data for the unified map');
assert.match(source, /openGalaxyMap\(ctx/,
  'map handoff must open the unified galaxyMap through map authority');

console.log('Mission Log map handoff OK: tracked objectives open galaxyMap at LOCAL or GALAXY focus.');
