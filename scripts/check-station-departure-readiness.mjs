// Guards the Station Hub departure readiness strip.
// The strip is non-blocking UI, but it must keep reading live mission/cargo/fuel/hull state.
//
// Primary coverage instantiates stationHub with a stub bus, emits each named data event, and
// asserts _refreshDeparture actually changes Undock readiness. Source-matching is secondary
// and runs on comment-stripped source so a block-commented bus.on cannot satisfy it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import {
  departureReadinessSummary,
  stationHub,
} from '../src/ui/screens/stationHub.js';

const source = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
const servicesSource = readFileSync(new URL('../src/ui/screens/services.js', import.meta.url), 'utf8');

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const stripped = stripJsComments(source);
const servicesStripped = stripJsComments(servicesSource);

const DEPARTURE_EVENTS = [
  'cargo:changed',
  'credits:changed',
  'ship:statsChanged',
  'fuel:changed',
  'mission:updated',
  'mission:accepted',
  'mission:completed',
  'mission:failed',
  'mission:expired',
  'nav:waypoint',
];

assert.equal(typeof departureReadinessSummary, 'function',
  'station hub must export its pure departure summary contract for behavioral verification');

const summarizeDeparture = departureReadinessSummary;
const readySummary = summarizeDeparture([
  { kind: 'ok', label: 'Track', text: 'Contract plotted' },
  { kind: 'ok', label: 'Hold', text: '12u free' },
  { kind: 'ok', label: 'Fuel', text: '100%' },
  { kind: 'ok', label: 'Hull', text: '100%' },
]);
assert.deepEqual(readySummary, {
  state: 'ready',
  status: 'READY',
  label: '⏏ UNDOCK · READY',
  title: 'Departure Check: READY. Tracked work, cargo, fuel, and hull look serviceable.',
  accessibleLabel: 'Undock. Departure Check: READY. Tracked work, cargo, fuel, and hull look serviceable.',
}, 'READY departure summary must preserve the visual label and expose a semantic Undock name with readiness detail');

const checkSummary = summarizeDeparture([
  { kind: 'warn', label: 'Fuel', text: '32%' },
]);
assert.equal(checkSummary.label, '⏏ UNDOCK · CHECK', 'CHECK must retain the exact visual Undock label');
assert.equal(checkSummary.accessibleLabel, `Undock. ${checkSummary.title}`,
  'CHECK accessible name must begin with Undock and include the live warning explanation');
assert.match(checkSummary.accessibleLabel, /^Undock\. Departure Check: CHECK\. Fuel: 32%\./,
  'CHECK accessible name must expose its current readiness detail');

const riskSummary = summarizeDeparture([
  { kind: 'bad', label: 'Hull', text: '12%' },
]);
assert.equal(riskSummary.label, '⏏ UNDOCK · RISK', 'RISK must retain the exact visual Undock label');
assert.equal(riskSummary.accessibleLabel, `Undock. ${riskSummary.title}`,
  'RISK accessible name must begin with Undock and include the live risk explanation');
assert.match(riskSummary.accessibleLabel, /^Undock\. Departure Check: RISK\. Hull: 12%\./,
  'RISK accessible name must expose its current readiness detail');

function makePlayer(hull = 100, hullMax = 100) {
  return { hull, hullMax };
}

function readyState() {
  const player = makePlayer(100, 100);
  return {
    ui: {
      screenStack: ['station'],
      docked: true,
      trackedMissionId: 'mission_ready',
      activeStationTab: 'market',
    },
    missions: {
      active: [{ id: 'mission_ready', status: 'active', title: 'Helios Run', type: 'cargo_delivery' }],
    },
    player: {
      credits: 12000,
      cargo: { usedVolume: 2, capVolume: 20, items: { cmdty_ore: 2 } },
    },
    fuel: { current: 100, max: 100 },
    playerId: 'player',
    entities: new Map([['player', player]]),
    nav: { waypoint: { kind: 'mission', missionId: 'mission_ready', label: 'Helios Gate' } },
  };
}

function makeUndockBtn() {
  const attrs = Object.create(null);
  return {
    textContent: '',
    title: '',
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
  };
}

function installDepartureUnit(state, bus) {
  const undockBtn = makeUndockBtn();
  const footerStyle = { _props: Object.create(null), setProperty(k, v) { this._props[k] = String(v); } };
  stationHub._ctx = { state, bus };
  stationHub._el = { id: 'station-stub' };
  stationHub._panels = {};
  stationHub._departureEl = { innerHTML: '' };
  stationHub._undockBtn = undockBtn;
  stationHub._footerEl = {
    style: footerStyle,
    setAttribute() {},
    getAttribute() { return null; },
  };
  stationHub._handoffEl = null;
  stationHub._missionEls = null;
  stationHub._rail = null;
  stationHub._nodesPane = null;
  stationHub._econBadge = null;
  stationHub._vitalEls = null;
  stationHub._subbed = false;
  stationHub._subscribe();
  return undockBtn;
}

const bus = createBus();
const state = readyState();
const undockBtn = installDepartureUnit(state, bus);

let refreshCalls = 0;
const originalRefresh = stationHub._refreshDeparture.bind(stationHub);
stationHub._refreshDeparture = function wrappedRefreshDeparture() {
  refreshCalls += 1;
  return originalRefresh();
};

function paintReady() {
  const next = readyState();
  state.ui.trackedMissionId = next.ui.trackedMissionId;
  state.ui.screenStack = next.ui.screenStack;
  state.missions.active = next.missions.active;
  state.player.cargo = next.player.cargo;
  state.fuel.current = next.fuel.current;
  state.fuel.max = next.fuel.max;
  const ship = state.entities.get('player');
  ship.hull = 100;
  ship.hullMax = 100;
  state.nav.waypoint = next.nav.waypoint;
  refreshCalls = 0;
  stationHub._refreshDeparture();
  assert.equal(undockBtn.getAttribute('data-readiness'), 'ready', 'fixture must start from READY departure state');
}

function makeRisky() {
  state.fuel.current = 10;
  state.fuel.max = 100;
}

for (const eventName of DEPARTURE_EVENTS) {
  paintReady();
  const before = undockBtn.getAttribute('data-readiness');
  const callsBefore = refreshCalls;
  makeRisky();
  bus.emit(eventName, eventName.startsWith('mission:') ? { missionId: 'mission_ready' } : {});
  const after = undockBtn.getAttribute('data-readiness');
  assert.ok(
    refreshCalls > callsBefore,
    `${eventName} must call _refreshDeparture (got ${refreshCalls - callsBefore} calls)`,
  );
  assert.notEqual(
    after,
    before,
    `${eventName} must refresh live departure readiness (stayed ${before} after fuel dropped to 10%)`,
  );
  assert.equal(
    after,
    'risk',
    `${eventName} must paint RISK after live fuel drops below the bad threshold (got ${after})`,
  );
  console.log(`ok    ${eventName} refreshes departure readiness (${before} → ${after})`);
}

// Secondary: comment-stripped source still names the live chips, Undock contract, and bus.on lines.
assert.match(stripped, /function departureReadinessChips\(state\)/,
  'station hub must compute departure readiness chips from live state');
assert.match(stripped, /function departureReadinessSummary\(chips\)/,
  'station hub must summarize departure readiness on the Undock command');
assert.match(stripped, /label: '⏏ UNDOCK · ' \+ status/,
  'Undock button must show READY, CHECK, or RISK from live departure readiness');
assert.match(stripped, /Undock remains available/,
  'departure summary must explain that readiness warnings do not hard-block undock');
assert.match(stripped, /departureMissionChip\(state\)/, 'departure readiness must include tracked mission/nav state');
assert.match(stripped, /function departureTradeWaypointChip\(state, waypoint\)/,
  'departure readiness must summarize trade route waypoints');
assert.match(stripped, /trackedMissionId/, 'departure readiness must read trackedMissionId');
assert.match(stripped, /activeJobs\.length > 0/,
  'departure readiness must distinguish active-but-untracked missions from having no job');
assert.match(stripped, /1 untracked job/,
  'departure readiness must tell players when an active mission still needs tracking');
assert.match(stripped, /Open Mission Log to track the active job/,
  'untracked mission readiness must route players to the Mission Log with a clear action');
assert.match(stripped, /state && state\.nav && state\.nav\.waypoint/, 'departure readiness must fall back to nav waypoint');
assert.match(stripped, /waypoint\.kind !== 'trade'/, 'departure readiness must identify trade waypoints');
assert.match(stripped, /commodityId/, 'departure trade route readiness must read waypoint commodity ids');
assert.match(stripped, /targetTab: 'market'/, 'trade and hold readiness chips must route to Market');
assert.match(stripped, /targetScreen: 'missionLog'/, 'tracked objective readiness chips must route to Mission Log');
assert.match(stripped, /Open Missions to accept and track a job/,
  'empty mission readiness must still route players to the station contract board');
assert.match(stripped, /targetTab: 'missions'/, 'contract-board readiness chips must route to Missions');
assert.match(stripped, /targetTab: 'services'/, 'fuel and hull readiness chips must route to Services');
assert.match(stripped, /actionLabel:/, 'actionable departure chips must expose clear accessible action labels');
assert.match(stripped, /departureCargoChip\(state\)/, 'departure readiness must include cargo hold free space');
assert.match(stripped, /capVolume/, 'departure readiness must read cargo capVolume');
assert.match(stripped, /departureFuelChip\(state\)/, 'departure readiness must include fuel state');
assert.match(stripped, /state && state\.fuel/, 'departure readiness must read state.fuel');
assert.match(stripped, /departureHullChip\(state\)/, 'departure readiness must include hull state');
assert.match(stripped, /state\.entities\.get\(state\.playerId\)/, 'departure readiness must read the live player entity');
assert.match(stripped, /<div class="st-departure-label mono">Departure Check<\/div>/,
  'station hub must render a visible Departure Check strip');
assert.match(stripped, /this\._undockBtn\.setAttribute\('data-readiness', summary\.state\)/,
  'Undock command must expose its readiness state for styling and inspection');
assert.match(stripped, /this\._undockBtn\.setAttribute\('aria-label', summary\.accessibleLabel\)/,
  'Undock command must consume the behaviorally verified accessible departure label');
assert.match(stripped, /\.st-undock\[data-readiness="risk"\]/,
  'Undock command must visually distinguish risky departure state');
assert.match(stripped, /data-departure-tab/, 'station hub must render actionable departure readiness chips');
assert.match(stripped, /data-departure-screen/, 'station hub must render actionable departure chips for non-station screens');
assert.match(stripped, /departureChipHtml\(chip\)/, 'departure chip rendering must preserve action metadata');
assert.match(stripped, /this\.setTab\(tabId, \{ focusRail: true \}\)/,
  'departure chip actions must use the same tab activation path as the rail');
assert.match(stripped, /pushDepartureScreen\(ctx, screenId\)/,
  'departure screen chip actions must use the shared screen manager path');
assert.match(stripped, /st-departure-chip--warn/, 'departure readiness must style warning chips');
assert.match(stripped, /st-departure-chip--bad/, 'departure readiness must style bad chips');
assert.match(stripped, /button\.st-departure-chip:focus-visible/,
  'actionable departure chips must keep keyboard focus visible');
assert.match(stripped, /function stationRecordId\(stn\)/,
  'station hub must resolve live active-sector station records through stationId, not only entity id');
assert.match(stripped, /stationRecordId\(x\) === sid/,
  'station hub active-sector lookup must match authored station ids carried on live records');
assert.match(stripped, /Object\.values\(sectors\)/,
  'station hub must prefer the runtime sector catalog before falling back to static data');
assert.match(stripped, /stationDefFrom\(catalogRecord \|\| activeRecord, liveStationEntity\(state, sid\), sid\)/,
  'station hub must merge live entity station data when catalog records are thin');
assert.match(servicesStripped, /function stationRecordId\(station\)/,
  'services panel must share stationId-aware live station resolution');
assert.match(servicesStripped, /stationRecordId\(x\) === sid/,
  'services panel active-sector lookup must match stationId records');
assert.match(servicesStripped, /liveStationData\(s, sid\)/,
  'services panel must fall back to live station services when runtime catalogs are thin');

for (const eventName of DEPARTURE_EVENTS) {
  assert(stripped.includes(`bus.on('${eventName}'`), `departure readiness must subscribe to ${eventName}`);
}

assert.match(stripped, /const refreshDeparture = \(\) => \{ if \(this\._visible\(\)\) this\._refreshDeparture\(\); \};/,
  'station hub must only refresh departure readiness while visible');

console.log('Station departure readiness OK - tracked objective, trade route, hold, fuel, and hull are visible before undock.');
