import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recommendMissionBoardOffer } from '../src/ui/screens/stationHub.js';

const source = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');

function mission(overrides = {}) {
  return {
    id: overrides.id || 'mission_offer',
    type: 'cargo_delivery',
    title: 'Starter Delivery',
    factionId: 'faction_mts',
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 0,
    time_limit_s: 900,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 800,
    params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 1, taskTime: 30 },
    ...overrides,
  };
}

function state({ capVolume = 20, usedVolume = 0, credits = 1000 } = {}) {
  return {
    simTime: 0,
    world: { currentSectorId: 'sector_helios_prime' },
    player: {
      credits,
      cargo: { items: {}, usedVolume, usedMass: 0, capVolume, capMass: 100 },
    },
    missions: {
      active: [],
      config: { maxActive: 8, cruiseSpeedRef: 140 },
    },
  };
}

assert.match(source, /export function recommendMissionBoardOffer/,
  'station hub must expose a direct-testable mission recommendation policy');
assert.match(source, /st-mission-recommend/,
  'mission board must render a visible recommendation rail');
assert.match(source, /Accept Recommended/,
  'mission recommendation should offer a clear accept CTA when the pick is ready');
assert.match(source, /st-mission-card\.recommended/,
  'recommended mission cards must have a dedicated visual hook');
assert.match(source, /st-mission-recommended/,
  'recommended mission cards must expose a compact scan-row badge');
assert.match(source, /recommendation && recommendation\.missionId === mid/,
  'recommended card highlighting must follow the recommendation policy output');

let rec = recommendMissionBoardOffer([
  mission({ id: 'risky_bounty', type: 'bounty_hunt', title: 'Risky Bounty', reward_cr: 6000, riskTier: 4, params: {} }),
  mission({ id: 'starter_delivery', title: 'Starter Delivery', reward_cr: 900, riskTier: 0 }),
], state());
assert.equal(rec.missionId, 'starter_delivery',
  'recommendation should prefer clean low-risk starter work over high-risk pay bait');
assert.equal(rec.state, 'ready');
assert.equal(rec.disabled, false);
assert.match(rec.reason, /ready now/i);
assert.match(rec.reason, /Risk 0/);

rec = recommendMissionBoardOffer([
  mission({ id: 'blocked_bulk', title: 'Blocked Bulk', params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 3 } }),
  mission({ id: 'clear_space_first', title: 'Clear Space First', params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 1 } }),
], state({ capVolume: 5, usedVolume: 3 }));
assert.equal(rec.missionId, 'clear_space_first',
  'recommendation should choose a caution offer over an impossible cargo-capacity blocker');
assert.equal(rec.state, 'caution');
assert.equal(rec.disabled, false);
assert.match(rec.reason, /Strong pick after one check/i);
assert.match(rec.reason, /clear space/i);

rec = recommendMissionBoardOffer([
  mission({ id: 'too_big', title: 'Too Big', params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 3 } }),
], state({ capVolume: 1, usedVolume: 0 }));
assert.equal(rec.missionId, 'too_big',
  'when every offer is blocked, recommendation should still name the best prep target');
assert.equal(rec.state, 'blocked');
assert.equal(rec.disabled, true);
assert.equal(rec.label, 'PREP FIRST');
assert.match(rec.reason, /Requires 7\.5u cargo capacity/);

rec = recommendMissionBoardOffer([
  mission({ id: '', title: 'Missing Id' }),
], state());
assert.equal(rec, null,
  'recommendation should not render a CTA for a malformed offer without an id');

console.log('Mission board recommendation OK - station board names the best next contract or prep blocker.');
