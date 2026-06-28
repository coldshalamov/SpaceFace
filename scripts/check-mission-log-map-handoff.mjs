import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  missionMapAction,
  recommendedActions,
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
  assert.equal(action.screenId, 'localmap', 'tracked same-sector missions should hand off to the Local Map');
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
  assert.equal(action.screenId, 'starmap', 'tracked off-sector missions should hand off to the Star Map');
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
  assert.equal(actions[0].mapAction.screenId, 'starmap', 'tracked recommendation should carry the Star Map handoff');
}

assert.match(source, /export function missionMapAction/, 'mission map handoff policy must stay directly testable');
assert.match(source, /data-act="openMap"/, 'active mission cards must render map handoff buttons');
assert.match(source, /data-rec-act="openMap"/, 'tracked recommendation must render a map handoff button');
assert.match(source, /sf-mlog-btn-map/, 'active mission map handoff must have a dedicated style hook');
assert.match(source, /sf-mlog-rec-map/, 'recommendation map handoff must have a dedicated style hook');
assert.match(source, /ui:pushScreen/, 'map handoff must fall back to the shared UI screen event');
assert.match(source, /pushScreen\(screenId\)/, 'map handoff must use the live screen manager when available');

console.log('Mission Log map handoff OK: tracked objectives route players to Local Map or Star Map.');
