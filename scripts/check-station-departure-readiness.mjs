// Guards the Station Hub departure readiness strip.
// The strip is non-blocking UI, but it must keep reading live mission/cargo/fuel/hull state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');

assert.match(source, /function departureReadinessChips\(state\)/,
  'station hub must compute departure readiness chips from live state');
assert.match(source, /departureMissionChip\(state\)/, 'departure readiness must include tracked mission/nav state');
assert.match(source, /trackedMissionId/, 'departure readiness must read trackedMissionId');
assert.match(source, /state && state\.nav && state\.nav\.waypoint/, 'departure readiness must fall back to nav waypoint');
assert.match(source, /departureCargoChip\(state\)/, 'departure readiness must include cargo hold free space');
assert.match(source, /capVolume/, 'departure readiness must read cargo capVolume');
assert.match(source, /departureFuelChip\(state\)/, 'departure readiness must include fuel state');
assert.match(source, /state && state\.fuel/, 'departure readiness must read state.fuel');
assert.match(source, /departureHullChip\(state\)/, 'departure readiness must include hull state');
assert.match(source, /state\.entities\.get\(state\.playerId\)/, 'departure readiness must read the live player entity');
assert.match(source, /<div class="st-departure-label mono">Departure Check<\/div>/,
  'station hub must render a visible Departure Check strip');
assert.match(source, /st-departure-chip--warn/, 'departure readiness must style warning chips');
assert.match(source, /st-departure-chip--bad/, 'departure readiness must style bad chips');

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
]) {
  assert(source.includes(`bus.on('${eventName}'`), `departure readiness must subscribe to ${eventName}`);
}

assert.match(source, /const refreshDeparture = \(\) => \{ if \(this\._visible\(\)\) this\._refreshDeparture\(\); \};/,
  'station hub must only refresh departure readiness while visible');

console.log('Station departure readiness OK - tracked objective, hold, fuel, and hull are visible before undock.');
