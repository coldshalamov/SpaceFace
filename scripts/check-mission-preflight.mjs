// Guards mission-board preflight: impossible one-load cargo contracts must be visible before
// accepting and rejected before collateral is charged or the offer leaves the board.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MISSION_TUNING } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import {
  missionConsequenceSummary,
  missionPreflight,
  missionRouteScope,
  missionShipReadiness,
  missionTimePacing,
} from '../src/ui/missionPreflight.js';
import { missionBoardReadiness } from '../src/ui/screens/stationHub.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const stationHubSrc = readFileSync(join(ROOT, 'src/ui/screens/stationHub.js'), 'utf8');
const missionPreflightSrc = readFileSync(join(ROOT, 'src/ui/missionPreflight.js'), 'utf8');
const missionsSrc = readFileSync(join(ROOT, 'src/systems/missions.js'), 'utf8');

assert.match(stationHubSrc, /import \{ missionPreflight \} from '\.\.\/missionPreflight\.js'/,
  'stationHub mission board must use the shared mission preflight helper');
assert.match(missionPreflightSrc, /export function missionPreflight/, 'shared mission preflight helper must be exported');
assert.match(missionPreflightSrc, /export function missionRouteScope/,
  'shared mission preflight helper must expose route-scope policy for direct tests');
assert.match(missionPreflightSrc, /export function missionTimePacing/,
  'shared mission preflight helper must expose timer-pacing policy for direct tests');
assert.match(missionPreflightSrc, /export function missionShipReadiness/,
  'shared mission preflight helper must expose ship-readiness policy for direct tests');
assert.match(stationHubSrc, /missionConsequenceSummary\(m\)/,
  'mission cards must use the shared consequence helper');
assert.match(missionPreflightSrc, /export function missionConsequenceSummary/,
  'shared mission consequence helper must be exported');
assert.match(stationHubSrc, /st-mission-preflight/, 'mission cards must render preflight chips');
assert.match(stationHubSrc, /st-mission-consequences/, 'mission cards must render consequence chips');
assert.match(missionPreflightSrc, /Jump route: \$\{sectorName\(targetSectorId\)\}/,
  'mission preflight must label off-sector destination scope before accept');
assert.match(missionPreflightSrc, /STATION_SECTOR_BY_ID/,
  'mission preflight must resolve station-only destinations into route-scope chips');
assert.match(missionPreflightSrc, /TIMER_CRITICAL_S/,
  'mission preflight must distinguish critical timers before accept');
assert.match(missionPreflightSrc, /deadline_s/,
  'mission preflight must support active absolute mission deadlines as well as board timers');
assert.match(missionPreflightSrc, /DANGEROUS_MISSION_TYPES/,
  'mission preflight must distinguish risky/combat contracts for ship-readiness warnings');
assert.match(missionPreflightSrc, /Hull is worn/,
  'mission preflight must explain damaged-hull risk before recommending dangerous work');
assert.match(missionPreflightSrc, /Requires \$\{fmtHoldUnits\(cargoNeed\.volume\)\}u cargo capacity/,
  'mission preflight must flag cargo capacity blockers');
assert.match(stationHubSrc, /st-mission-preflight-warn/, 'mission cards must render non-blocking readiness warnings');
assert.match(stationHubSrc, /st-mission-readiness/, 'mission cards must render a fast readiness badge');
assert.match(stationHubSrc, /missionBoardReadiness\(preflight\)/,
  'mission cards must derive the readiness badge from shared preflight state');
assert.match(stationHubSrc, /aria-label="' \+ escapeHtml\(acceptTitle\)/,
  'mission accept buttons must expose exact ready/blocked guidance to assistive tech');
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
    destSectorId: 'sector_ceres_belt',
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
    world: { currentSectorId: 'sector_helios_prime' },
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

function stageShip(state, { hull = 100, hullMax = 100, fuel = 100, fuelMax = 100 } = {}) {
  state.entities.set(state.playerId, { id: state.playerId, type: 'ship', hull, hullMax });
  state.fuel = { current: fuel, max: fuelMax };
  return state;
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
assert.equal(missionBoardReadiness(lowCapUiPreflight).state, 'blocked',
  'mission board readiness should mark cargo-capacity blockers as blocked');
assert.equal(missionBoardReadiness(lowCapUiPreflight).label, 'BLOCKED',
  'blocked mission cards should be scannable before reading details');
assert.equal(lowCapUiPreflight.blocker, 'Requires 5u cargo capacity',
  'shared UI preflight must surface impossible cargo capacity before accept');
assert.ok(lowCapUiPreflight.chips.some((chip) => chip.kind === 'info' && chip.text === 'Jump route: Ceres Belt'),
  'shared UI preflight must show off-sector route scope before accept');
assert.ok(lowCapUiPreflight.chips.some((chip) => chip.kind === 'ok' && chip.text === '15m timer'),
  'shared UI preflight must show deadline length before accept');
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
assert.equal(missionBoardReadiness(lowFreeUiPreflight).state, 'caution',
  'mission board readiness should mark non-blocking cargo-space warnings as caution');
assert.equal(missionBoardReadiness(lowFreeUiPreflight).label, 'CHECK',
  'caution mission cards should ask the player to check prep details');
assert.equal(lowFreeUiPreflight.blocker, null, 'low free space should warn without blocking a capable hull');
assert.match(lowFreeUiPreflight.warning || '', /clear space/, 'shared UI preflight must tell the player to clear cargo space');

const localScope = missionRouteScope(makeOffer({
  destStationId: 'station_helios',
  destSectorId: 'sector_helios_prime',
  distance: 0,
}), makeState(8));
assert.equal(localScope.text, 'Local sector', 'route scope should distinguish local-sector work');

const stationFallbackScope = missionRouteScope(makeOffer({
  destStationId: 'station_beltout',
  destSectorId: null,
}), makeState(8));
assert.equal(stationFallbackScope.text, 'Jump route: Ceres Belt',
  'route scope should resolve station-only destinations through the static sector graph');

const deadlinePacing = missionTimePacing(makeOffer({
  deadline_s: 420,
  time_limit_s: null,
  distance: 0,
  params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 2, taskTime: 20 },
}), { ...makeState(8), simTime: 120 });
assert.equal(deadlinePacing.chip.text, 'Tight 5m timer',
  'absolute active deadlines should count down from state.simTime');

const tightOffer = makeOffer({ time_limit_s: 240, distance: 1200, params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 2, taskTime: 20 } });
const tightPacing = missionTimePacing(tightOffer, makeState(8));
assert.equal(tightPacing.chip.kind, 'warn', 'tight route timers should render as warning chips');
assert.match(tightPacing.warning || '', /launch directly/, 'tight route timers should explain the player action');
const criticalPacing = missionTimePacing(makeOffer({
  time_limit_s: 90,
  distance: 1200,
  params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 2, taskTime: 20 },
}), makeState(8));
assert.equal(criticalPacing.chip.kind, 'bad', 'critical route timers should render as bad chips');
assert.match(criticalPacing.warning || '', /critical/, 'critical route timers should explain the risk');
const tightLowFreeState = makeState(8);
tightLowFreeState.player.cargo.usedVolume = 6;
const tightLowFreePreflight = missionPreflight(tightOffer, tightLowFreeState);
assert.match(tightLowFreePreflight.warning || '', /clear space/,
  'cargo-space warnings should remain first when a tight timer also applies');

const damagedBountyState = stageShip(makeState(8), { hull: 60, fuel: 100 });
const damagedBountyOffer = makeOffer({
  type: 'bounty_hunt',
  riskTier: 2,
  params: {},
  collateral_cr: 0,
  title: 'Damaged Bounty Check',
});
const damagedReadiness = missionShipReadiness(damagedBountyOffer, damagedBountyState);
assert.ok(damagedReadiness.chips.some((chip) => chip.kind === 'warn' && chip.text === 'Hull 60%'),
  'ship readiness should flag a worn hull for risky combat work');
assert.match(damagedReadiness.warning || '', /repair before accepting combat/,
  'ship readiness should explain the damaged-hull action before risky work');
const damagedBountyPreflight = missionPreflight(damagedBountyOffer, damagedBountyState);
assert.equal(missionBoardReadiness(damagedBountyPreflight).state, 'caution',
  'risky offers with a worn hull should be CHECK instead of READY');
assert.ok(damagedBountyPreflight.chips.some((chip) => chip.text === 'Hull 60%'),
  'shared mission preflight should render the hull readiness chip on the mission card');

const lowFuelRouteState = stageShip(makeState(8), { hull: 100, fuel: 20 });
const lowFuelRoutePreflight = missionPreflight(makeOffer({ params: {}, collateral_cr: 0 }), lowFuelRouteState);
assert.equal(missionBoardReadiness(lowFuelRoutePreflight).state, 'caution',
  'off-sector routed offers with critical fuel should be CHECK instead of READY');
assert.ok(lowFuelRoutePreflight.chips.some((chip) => chip.kind === 'bad' && chip.text === 'Critical fuel 20%'),
  'shared mission preflight should render a critical fuel chip before accepting routed work');
assert.match(lowFuelRoutePreflight.warning || '', /refuel before accepting/,
  'critical fuel warnings should tell the player to refuel before accepting routed work');

const readyState = makeState(8);
assert.equal(missionBoardReadiness(missionPreflight(makeOffer(), readyState)).state, 'ready',
  'mission board readiness should mark clean offers as ready');
assert.equal(missionBoardReadiness(missionPreflight(makeOffer(), readyState)).label, 'READY',
  'ready mission cards should be scannable before accept');
const readyBus = makeBus();
missions.init({ state: readyState, bus: readyBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_preflight_1'), true, 'mission should accept when hull capacity can carry it');
assert.equal(readyState.missions.active.length, 1, 'accepted preflight should activate the mission');
assert.equal(readyState.missions.boards.station_helios.slots.length, 0, 'accepted preflight should remove the board offer');
assert.ok(readyBus.events.some((event) => event.type === 'economy:chargeCredits'),
  'accepted collateral mission should charge collateral after passing preflight');
assert.ok(readyBus.events.some((event) => event.type === 'mission:accepted'),
  'accepted preflight should emit mission:accepted');

console.log('Mission preflight OK - shared route scope, timer pacing, ship readiness, and consequence stakes are visible before accept.');
