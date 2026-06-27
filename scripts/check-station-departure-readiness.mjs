// Guards the Station Hub departure readiness strip.
// The strip is non-blocking UI, but it must keep reading live mission/cargo/fuel/hull state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');

assert.match(source, /function departureReadinessChips\(state\)/,
  'station hub must compute departure readiness chips from live state');
assert.match(source, /departureMissionChip\(state\)/, 'departure readiness must include tracked mission/nav state');
assert.match(source, /function departureTradeWaypointChip\(state, waypoint\)/,
  'departure readiness must summarize trade route waypoints');
assert.match(source, /trackedMissionId/, 'departure readiness must read trackedMissionId');
assert.match(source, /state && state\.nav && state\.nav\.waypoint/, 'departure readiness must fall back to nav waypoint');
assert.match(source, /waypoint\.kind !== 'trade'/, 'departure readiness must identify trade waypoints');
assert.match(source, /commodityId/, 'departure trade route readiness must read waypoint commodity ids');
assert.match(source, /targetTab: 'market'/, 'trade and hold readiness chips must route to Market');
assert.match(source, /targetTab: 'missions'/, 'tracked objective readiness chips must route to Missions');
assert.match(source, /targetTab: 'services'/, 'fuel and hull readiness chips must route to Services');
assert.match(source, /actionLabel:/, 'actionable departure chips must expose clear accessible action labels');
assert.match(source, /departureCargoChip\(state\)/, 'departure readiness must include cargo hold free space');
assert.match(source, /capVolume/, 'departure readiness must read cargo capVolume');
assert.match(source, /departureFuelChip\(state\)/, 'departure readiness must include fuel state');
assert.match(source, /state && state\.fuel/, 'departure readiness must read state.fuel');
assert.match(source, /departureHullChip\(state\)/, 'departure readiness must include hull state');
assert.match(source, /state\.entities\.get\(state\.playerId\)/, 'departure readiness must read the live player entity');
assert.match(source, /<div class="st-departure-label mono">Departure Check<\/div>/,
  'station hub must render a visible Departure Check strip');
assert.match(source, /data-departure-tab/, 'station hub must render actionable departure readiness chips');
assert.match(source, /departureChipHtml\(chip\)/, 'departure chip rendering must preserve action metadata');
assert.match(source, /this\.setTab\(tabId, \{ focusRail: true \}\)/,
  'departure chip actions must use the same tab activation path as the rail');
assert.match(source, /st-departure-chip--warn/, 'departure readiness must style warning chips');
assert.match(source, /st-departure-chip--bad/, 'departure readiness must style bad chips');
assert.match(source, /button\.st-departure-chip:focus-visible/,
  'actionable departure chips must keep keyboard focus visible');

for (const eventName of [
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
]) {
  assert(source.includes(`bus.on('${eventName}'`), `departure readiness must subscribe to ${eventName}`);
}

assert.match(source, /const refreshDeparture = \(\) => \{ if \(this\._visible\(\)\) this\._refreshDeparture\(\); \};/,
  'station hub must only refresh departure readiness while visible');

console.log('Station departure readiness OK - tracked objective, trade route, hold, fuel, and hull are visible before undock.');
