// Guards the live station departure readiness contract.
// The Undock tile is non-blocking UI, but it must keep reading live mission/cargo/fuel/hull state.
//
// Coverage: the pure departure model computes the READY/CHECK/RISK summary and chips from live
// sim state (behavior), and the live "Orbital Command" shell (src/ui/station/stationApp.js)
// paints that summary onto the Undock control, opens the Departure Check for a non-ready launch,
// and keeps undock reachable ("Launch Anyway") — committed through the canonical bus event.
// Source-matching runs on comment-stripped source so a block-commented read cannot satisfy it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  departureReadinessChips,
  departureReadinessSummary,
} from '../src/ui/station/stationDepartureModel.js';

const ROOT = new URL('.', import.meta.url);
const appSource = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');
const uiRootSource = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
const modelSource = readFileSync(new URL('../src/ui/station/stationDepartureModel.js', import.meta.url), 'utf8');

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const app = stripJsComments(appSource);
const model = stripJsComments(modelSource);

assert.equal(typeof departureReadinessSummary, 'function',
  'station departure model must export its pure summary contract for behavioral verification');
assert.equal(typeof departureReadinessChips, 'function',
  'station departure model must export its pure chip projection for behavioral verification');

// ── 1) Summary contract: exact visual label + semantic Undock name ──────────
const readySummary = departureReadinessSummary([
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

const checkSummary = departureReadinessSummary([
  { kind: 'warn', label: 'Fuel', text: '32%' },
]);
assert.equal(checkSummary.label, '⏏ UNDOCK · CHECK', 'CHECK must retain the exact visual Undock label');
assert.equal(checkSummary.accessibleLabel, `Undock. ${checkSummary.title}`,
  'CHECK accessible name must begin with Undock and include the live warning explanation');
assert.match(checkSummary.accessibleLabel, /^Undock\. Departure Check: CHECK\. Fuel: 32%\./,
  'CHECK accessible name must expose its current readiness detail');

const riskSummary = departureReadinessSummary([
  { kind: 'bad', label: 'Hull', text: '12%' },
]);
assert.equal(riskSummary.label, '⏏ UNDOCK · RISK', 'RISK must retain the exact visual Undock label');
assert.equal(riskSummary.accessibleLabel, `Undock. ${riskSummary.title}`,
  'RISK accessible name must begin with Undock and include the live risk explanation');
assert.match(riskSummary.accessibleLabel, /^Undock\. Departure Check: RISK\. Hull: 12%\./,
  'RISK accessible name must expose its current readiness detail');
console.log('ok    summary: READY/CHECK/RISK keep exact Undock label + accessible explanation');

// ── 2) Chips read live state: dropping fuel flips the same docked state to RISK ──
function readyState() {
  const player = { hull: 100, hullMax: 100 };
  return {
    ui: {
      docked: true,
      dockedStationId: 'station_helios',
      trackedMissionId: 'mission_ready',
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

{
  const before = departureReadinessSummary(departureReadinessChips(readyState()));
  assert.equal(before.state, 'ready', 'fixture must read READY from live tracked+supplied state');

  const risky = readyState();
  risky.fuel.current = 10;
  const after = departureReadinessSummary(departureReadinessChips(risky));
  assert.notEqual(after.state, before.state,
    'live fuel dropping below the bad threshold must flip departure readiness');
  assert.equal(after.state, 'risk', 'fuel at 10% must paint RISK before undock');
  assert.match(after.title, /Fuel: 10%/, 'the risk explanation must name the failing surface');
  console.log(`ok    live state: departure readiness flips ${before.state} → ${after.state} when fuel drops`);
}

// ── 3) The live shell paints the summary and keeps undock reachable ──────────
assert.match(app, /chips = departureReadinessChips\(s\)/,
  'the docked shell must compute departure chips from live state');
assert.match(app, /sum = departureReadinessSummary\(chips\)/,
  'the docked shell must summarize departure readiness for the Undock command');
assert.match(app, /launchEl\.setAttribute\('data-state', depState\)/,
  'Undock command must expose its readiness state for styling and inspection');
assert.match(app, /launchEl\.setAttribute\('aria-label', `Undock\. \$\{dep\.title\}`\)/,
  'Undock command must consume the behaviorally verified accessible departure label');
assert.match(app, /if \(dep\.state !== 'ready'\) \{ openDeparturePop\(\); return false; \}/,
  'launching while not ready must open the Departure Check instead of stranding the player');
assert.match(app, /data-pop-launch/,
  'the Departure Check must keep a visible Launch Anyway control');
assert.match(app, /if \(ev\.target\.closest\('\[data-pop-launch\]'\)\) \{ closePop\(\); commitUndock\(\); \}/,
  'Launch Anyway must commit the canonical undock');
assert.match(app, /function commitUndock\(\) \{\s*if \(ctx && ctx\.bus\) ctx\.bus\.emit\('dock:undocked', \{ committed: true, intent: 'explicit', source: 'sx-dock' \}\);\s*\}/,
  'committed departure emits the single canonical dock:undocked');
console.log('ok    live shell: Undock reads live readiness, Departure Check + Launch Anyway reachable');

// ── 4) Readiness stays live: refresh re-renders the tile from current state ──
assert.match(uiRootSource, /def\.refresh\(this\.ctx, \{ periodic: true \}\)/,
  'the UI heartbeat must re-refresh modal screens so the Undock tile stays current');
assert.match(app, /function refresh\(_nextCtx, options = \{\}\) \{\s*renderStatus\(\);/,
  'every shell refresh must repaint status (vitals + Undock readiness) from live state');
console.log('ok    liveness: shell refresh repaints Undock readiness from live state each heartbeat');

// ── 5) Chip projection keeps routing players to real destinations ────────────
assert.match(model, /function departureReadinessChips\(state\)/,
  'departure readiness must compute chips from live state');
assert.match(model, /departureMissionChip\(state\)/, 'departure readiness must include tracked mission/nav state');
assert.match(model, /function departureTradeWaypointChip\(state, waypoint\)/,
  'departure readiness must summarize trade route waypoints');
assert.match(model, /trackedMissionId/, 'departure readiness must read trackedMissionId');
assert.match(model, /activeJobs\.length > 0/,
  'departure readiness must distinguish active-but-untracked missions from having no job');
assert.match(model, /1 untracked job/,
  'departure readiness must tell players when an active mission still needs tracking');
assert.match(model, /Open Mission Log to track the active job/,
  'untracked mission readiness must route players to the Mission Log with a clear action');
assert.match(model, /state && state\.nav && state\.nav\.waypoint/, 'departure readiness must fall back to nav waypoint');
assert.match(model, /waypoint\.kind !== 'trade'/, 'departure readiness must identify trade waypoints');
assert.match(model, /commodityId/, 'departure trade route readiness must read waypoint commodity ids');
assert.match(model, /targetTab: 'market'/, 'trade and hold readiness chips must route to Market');
assert.match(model, /targetScreen: 'missionLog'/, 'tracked objective readiness chips must route to Mission Log');
assert.match(model, /Open Missions to accept and track a job/,
  'empty mission readiness must still route players to the station contract board');
assert.match(model, /targetTab: 'missions'/, 'contract-board readiness chips must route to Missions');
assert.match(model, /targetTab: 'services'/, 'fuel and hull readiness chips must route to Services');
assert.match(model, /actionLabel:/, 'actionable departure chips must expose clear accessible action labels');
assert.match(model, /departureCargoChip\(state\)/, 'departure readiness must include cargo hold free space');
assert.match(model, /capVolume/, 'departure readiness must read cargo capVolume');
assert.match(model, /departureFuelChip\(state\)/, 'departure readiness must include fuel state');
assert.match(model, /state && state\.fuel/, 'departure readiness must read state.fuel');
assert.match(model, /departureHullChip\(state\)/, 'departure readiness must include hull state');
assert.match(model, /state\.entities\.get\(state\.playerId\)/, 'departure readiness must read the live player entity');
assert.match(model, /Undock remains available/,
  'departure summary must explain that readiness warnings do not hard-block undock');
console.log('ok    chips: track/trade-route/hold/fuel/hull projections keep destination routing');

// ── 6) Live station services resolve from the docked station record ────────
assert.match(app, /function resolveStation\(ctx\)/,
  'the live station shell must resolve the docked station before rendering vitals');
assert.match(app, /const id = ctx && ctx\.state && ctx\.state\.ui && ctx\.state\.ui\.dockedStationId/,
  'the live station shell must read the authoritative docked station id');
assert.match(app, /const rec = id && STATION_REC\.get\(id\)/,
  'the live station shell must resolve services from the docked station record');
assert.match(app, /services: Array\.isArray\(s\.services\) \? s\.services\.slice\(\) : \[\]/,
  'the live station shell must carry the station service list into its vital controls');

console.log('Station departure readiness OK - tracked objective, trade route, hold, fuel, and hull are visible before undock.');
