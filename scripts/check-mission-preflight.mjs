// Guards mission-board preflight: impossible one-load cargo contracts must be visible before
// accepting and rejected before collateral is charged or the offer leaves the board.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MISSION_TUNING } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import { missionConsequenceSummary, missionPreflight } from '../src/ui/missionPreflight.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const stationHubSrc = readFileSync(join(ROOT, 'src/ui/screens/stationHub.js'), 'utf8');
const missionPreflightSrc = readFileSync(join(ROOT, 'src/ui/missionPreflight.js'), 'utf8');
const missionsSrc = readFileSync(join(ROOT, 'src/systems/missions.js'), 'utf8');

assert.match(stationHubSrc, /import \{ missionPreflight \} from '\.\.\/missionPreflight\.js'/,
  'stationHub mission board must use the shared mission preflight helper');
assert.match(missionPreflightSrc, /export function missionPreflight/, 'shared mission preflight helper must be exported');
assert.match(stationHubSrc, /missionConsequenceSummary\(m\)/,
  'mission cards must use the shared consequence helper');
assert.match(missionPreflightSrc, /export function missionConsequenceSummary/,
  'shared mission consequence helper must be exported');
assert.match(stationHubSrc, /st-mission-preflight/, 'mission cards must render preflight chips');
assert.match(stationHubSrc, /st-mission-consequences/, 'mission cards must render consequence chips');
assert.match(missionPreflightSrc, /Requires \$\{fmtHoldUnits\(cargoNeed\.volume\)\}u cargo capacity/,
  'mission preflight must flag cargo capacity blockers');
assert.match(stationHubSrc, /st-mission-preflight-warn/, 'mission cards must render non-blocking readiness warnings');
assert.match(missionPreflightSrc, /SECTORS/, 'mission preflight must read the sector graph for route-scope chips');
assert.match(missionPreflightSrc, /Jump to \$\{sectorLabel\(destSectorId\)\}/,
  'mission preflight must explain cross-sector contracts before accept');
assert.match(missionsSrc, /_acceptPreflight\(offer\)/, 'missions.acceptMission must call _acceptPreflight before accepting');
assert.match(missionsSrc, /ONE_LOAD_CARGO_TYPES/, 'missions must define the one-load cargo mission set');
assert.match(missionsSrc, /Need \$\{fmtCargoUnits\(requiredVolume\)\}u cargo capacity/,
  'missions accept guard must explain cargo capacity failures');

function makeOffer(overrides = {}) {
  return {
    id: 'offer_preflight_1',
    type: 'cargo_delivery',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 2 },
    reward_cr: 1200,
    time_limit_s: 900,
    collateral_cr: 500,
    riskTier: 1,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres',
    distance: 1200,
    title: 'Preflight Hydrogen Delivery',
    ...overrides,
  };
}

function makeState(capVolume) {
  return {
    simTime: 0,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 1000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: 999 },
      stats: {},
    },
    missions: {
      boards: { station_helios: { refreshEpoch: 0, slots: [makeOffer()] } },
      active: [],
      completedLog: [],
      nextId: 1,
      config: { ...MISSION_TUNING, maxActive: 8 },
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    ui: {},
    nav: {},
    world: { currentSectorId: 'sector_sol' },
    entities: new Map(),
  };
}

function makeBus() {
  const events = [];
  return {
    events,
    on() {},
    emit(type, payload) { events.push({ type, payload }); },
  };
}

const lowCapState = makeState(1);
const consequence = missionConsequenceSummary(makeOffer());
assert.equal(consequence.reward, 1200, 'consequence helper must surface mission reward credits');
assert.equal(consequence.repReward, 4, 'consequence helper must match risk-scaled completion rep');
assert.equal(consequence.repPenalty, -3, 'consequence helper must match failure/expiry rep penalty');
assert.ok(consequence.chips.some((chip) =>
  chip.label === 'Success' && /\+1,200 cr/.test(chip.text) && /\+4 rep/.test(chip.text) && /collateral returned/.test(chip.text)),
  'success consequence must show credits, rep, and collateral refund');
assert.ok(consequence.chips.some((chip) =>
  chip.label === 'Fail/expire' && /-3 rep/.test(chip.text) && /collateral forfeited/.test(chip.text) && /no payout/.test(chip.text)),
  'failure consequence must show rep penalty, collateral loss, and no payout');
const lowCapUiPreflight = missionPreflight(makeOffer(), lowCapState);
assert.equal(lowCapUiPreflight.blocker, 'Requires 5u cargo capacity',
  'shared UI preflight must surface impossible cargo capacity before accept');
assert.ok(lowCapUiPreflight.chips.some((chip) => chip.kind === 'bad' && chip.text === '5u hold required'),
  'shared UI preflight must render a bad hold-required chip');
const lowCapBus = makeBus();
missions.init({ state: lowCapState, bus: lowCapBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_preflight_1'), false, 'mission should reject impossible cargo-capacity accept');
assert.equal(lowCapState.missions.active.length, 0, 'blocked preflight must not activate the mission');
assert.equal(lowCapState.missions.boards.station_helios.slots.length, 1, 'blocked preflight must leave the board offer posted');
assert.equal(lowCapBus.events.some((event) => event.type === 'economy:chargeCredits'), false,
  'blocked preflight must not charge collateral');
assert.ok(lowCapBus.events.some((event) =>
  event.type === 'toast' && /cargo capacity/.test(event.payload && event.payload.text || '')),
  'blocked preflight must tell the player cargo capacity is the issue');

const lowFreeState = makeState(8);
lowFreeState.player.cargo.usedVolume = 6;
const lowFreeUiPreflight = missionPreflight(makeOffer(), lowFreeState);
assert.equal(lowFreeUiPreflight.blocker, null, 'low free space should warn without blocking a capable hull');
assert.match(lowFreeUiPreflight.warning || '', /clear space/, 'shared UI preflight must tell the player to clear cargo space');

const routeState = makeState(8);
routeState.world.currentSectorId = 'sector_helios_prime';
const routeUiPreflight = missionPreflight(makeOffer({
  destStationId: 'station_beltout',
  destSectorId: 'sector_ceres_belt',
  time_limit_s: 900,
}), routeState);
assert.ok(routeUiPreflight.chips.some((chip) => chip.kind === 'info' && chip.text === 'Jump to Ceres Belt'),
  'cross-sector contracts should tell the player which sector jump is required');
assert.ok(routeUiPreflight.chips.some((chip) => chip.kind === 'ok' && chip.text === 'Timer 15m'),
  'mission preflight should surface timer pacing before the player accepts');

const stationLookupPreflight = missionPreflight(makeOffer({
  destStationId: 'station_beltout',
  destSectorId: null,
  time_limit_s: 900,
}), routeState);
assert.ok(stationLookupPreflight.chips.some((chip) => chip.text === 'Jump to Ceres Belt'),
  'station-only destinations should resolve their sector from the static sector graph');

const localTightState = makeState(8);
localTightState.world.currentSectorId = 'sector_helios_prime';
const localTightPreflight = missionPreflight(makeOffer({
  destStationId: 'station_helios',
  destSectorId: 'sector_helios_prime',
  time_limit_s: 240,
}), localTightState);
assert.ok(localTightPreflight.chips.some((chip) => chip.kind === 'ok' && chip.text === 'Same-sector route'),
  'local station contracts should distinguish same-sector work from jump routes');
assert.ok(localTightPreflight.chips.some((chip) => chip.kind === 'warn' && chip.text === 'Timer 4m tight'),
  'tight contracts should warn directly on the mission card');
assert.match(localTightPreflight.warning || '', /Timer is tight/,
  'tight-timer cards should carry a non-blocking readiness warning');

const readyState = makeState(8);
const readyBus = makeBus();
missions.init({ state: readyState, bus: readyBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_preflight_1'), true, 'mission should accept when hull capacity can carry it');
assert.equal(readyState.missions.active.length, 1, 'accepted preflight should activate the mission');
assert.equal(readyState.missions.boards.station_helios.slots.length, 0, 'accepted preflight should remove the board offer');
assert.ok(readyBus.events.some((event) => event.type === 'economy:chargeCredits'),
  'accepted collateral mission should charge collateral after passing preflight');
assert.ok(readyBus.events.some((event) => event.type === 'mission:accepted'),
  'accepted preflight should emit mission:accepted');

console.log('Mission preflight OK - shared readiness, route scope, timer pace, and consequence stakes are visible before accept.');
