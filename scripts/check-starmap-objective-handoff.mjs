import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  describeStarmapObjectiveRoute,
  resolveStarmapObjective,
} from '../src/ui/screens/starmap.js';

const source = readFileSync(new URL('../src/ui/screens/starmap.js', import.meta.url), 'utf8');

function nameOf(id) {
  return ({
    sector_helios_prime: 'Helios Prime',
    sector_tethys_junction: 'Tethys Junction',
    sector_mirefield: 'Mirefield Reach',
  })[id] || id;
}

function makeState(overrides = {}) {
  return {
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { trackedMissionId: null },
    missions: { active: [] },
    nav: { route: null, waypoint: null },
    ...overrides,
  };
}

{
  const state = makeState({
    ui: { trackedMissionId: 'm_delivery' },
    missions: {
      active: [{
        id: 'm_delivery',
        status: 'active',
        type: 'cargo_delivery',
        title: 'Deliver food to Tethys',
        destSectorId: 'sector_tethys_junction',
        objectiveProgress: 0,
        objectiveTarget: 1,
      }],
    },
    nav: {
      route: null,
      waypoint: {
        kind: 'mission',
        missionId: 'm_delivery',
        missionType: 'cargo_delivery',
        label: 'Deliver food to Tethys',
        reason: 'Deliver 2u Provisions to Tethys Trade Hub',
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
      },
    },
  });

  const objective = resolveStarmapObjective(state);
  assert.equal(objective.kind, 'mission', 'tracked mission waypoint should resolve as the Star Map objective');
  assert.equal(objective.missionId, 'm_delivery', 'objective should preserve the mission id');
  assert.equal(objective.sectorId, 'sector_tethys_junction', 'mission objective should expose the destination sector');
  assert.match(objective.detail, /Deliver 2u Provisions/, 'mission objective should use the player-facing nav reason');

  const guidance = describeStarmapObjectiveRoute(state, objective, nameOf);
  assert.equal(guidance.state, 'needed', 'off-sector mission with no route should ask for plotting');
  assert.equal(guidance.canPlot, true, 'off-sector mission objective should be plot-capable');
  assert.match(guidance.next, /Plot route to Tethys Junction/, 'route guidance should name the target sector');
}

{
  const state = makeState({
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_tethys',
        commodityId: 'cmdty_food',
        label: 'Tethys Trade Hub - Provisions',
        reason: 'Sell Provisions',
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
      },
      route: {
        legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction', fuel: 12 }],
        totalFuel: 12,
        totalHops: 1,
      },
    },
  });

  const objective = resolveStarmapObjective(state);
  assert.equal(objective.kind, 'trade', 'trade waypoint should resolve as a trade route objective');
  assert.equal(objective.stationId, 'station_tethys', 'trade objective should preserve the destination station');
  assert.equal(objective.commodityId, 'cmdty_food', 'trade objective should preserve the route commodity');

  const guidance = describeStarmapObjectiveRoute(state, objective, nameOf);
  assert.equal(guidance.state, 'plotted', 'matching active route should be recognized');
  assert.equal(guidance.summary, '1 hop / 12F', 'plotted route should summarize hops and fuel');
  assert.match(guidance.next, /Next jump: Tethys Junction/, 'plotted route should name the next jump');
}

{
  const state = makeState({
    world: { currentSectorId: 'sector_tethys_junction' },
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_tethys',
        commodityId: 'cmdty_food',
        label: 'Tethys Trade Hub - Provisions',
        reason: 'Sell Provisions',
        sectorId: 'sector_tethys_junction',
        sectorName: 'Tethys Junction',
        pos: { x: 280, z: -140 },
      },
      route: null,
    },
  });

  const objective = resolveStarmapObjective(state);
  const guidance = describeStarmapObjectiveRoute(state, objective, nameOf);
  assert.equal(guidance.state, 'local', 'same-sector objective should hand off to the Local Map');
  assert.equal(guidance.canPlot, false, 'same-sector objective should not show a route plot CTA');
  assert.match(guidance.summary, /Local Map/, 'same-sector guidance should point at the local map');
}

{
  const state = makeState({
    nav: {
      waypoint: {
        onboarding: true,
        label: '47-A Mass Signal',
        reason: 'Investigate the local anomaly',
        pos: { x: 120, z: -80 },
      },
      route: null,
    },
  });

  const objective = resolveStarmapObjective(state);
  const guidance = describeStarmapObjectiveRoute(state, objective, nameOf);
  assert.equal(objective.kind, 'onboarding', 'onboarding local fix should resolve as tutorial guidance');
  assert.equal(guidance.state, 'local-fix', 'local fix without a sector id should not read as missing');
  assert.match(guidance.summary, /local fix acquired/, 'local fix should tell the player the objective is in local space');
  assert.match(guidance.next, /Local Map/, 'local fix should hand off to the Local Map');
}

{
  const state = makeState({
    ui: { trackedMissionId: 'm_no_waypoint' },
    missions: {
      active: [{
        id: 'm_no_waypoint',
        status: 'active',
        type: 'patrol_clear',
        title: 'Clear Mirefield patrol',
        destSectorId: 'sector_mirefield',
        objectiveProgress: 1,
        objectiveTarget: 4,
      }],
    },
  });

  const objective = resolveStarmapObjective(state);
  assert.equal(objective.kind, 'mission', 'tracked active mission should be a fallback objective when nav waypoint is absent');
  assert.equal(objective.sectorId, 'sector_mirefield', 'fallback mission objective should use destSectorId');
  assert.match(objective.detail, /Clear 1\/4 hostiles/, 'fallback mission objective should summarize mission progress');
}

assert.match(source, /data-objective/, 'Star Map must render an objective panel in the side rail');
assert.match(source, /data-act="objective-route"/, 'objective panel must expose a route plotting action');
assert.match(source, /resolveStarmapObjective\(this\._ctx\.state\)/,
  'Star Map UI must resolve its objective from live state');
assert.match(source, /world:requestRoute/, 'objective route action must reuse world:requestRoute');
assert.match(source, /ui:setCourse/, 'objective route action must reuse ui:setCourse');
assert.match(source, /BINDINGS\.starmap\.label/, 'Star Map visible key labels must read src/ui/bindings.js');
assert.doesNotMatch(source, /<div>M close/, 'Star Map footer must not hard-code the M key label');

console.log('Star Map objective handoff OK - mission/trade waypoints resolve to route guidance and reuse the existing course events.');
