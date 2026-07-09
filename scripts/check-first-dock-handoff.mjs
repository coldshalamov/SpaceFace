// Guards the first dock handoff rail.
// The rail is non-blocking UI, but it must keep the opening station loop explicit:
// sell cargo (Hold), take one safe job (Missions), then fix launch risks / undock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const stationSource = readFileSync(join(ROOT, 'src/ui/screens/stationHub.js'), 'utf8');
const onboardingSource = readFileSync(join(ROOT, 'src/systems/onboarding.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

assert.match(stationSource, /export function firstDockHandoffVisible\(state, stationId\)/,
  'station hub must keep first dock handoff visibility directly testable');
assert.match(stationSource, /export function firstDockHandoffSteps\(state = \{\}\)/,
  'station hub must keep first dock handoff step planning directly testable');
assert.ok(stationSource.includes("handoff.className = 'st-handoff'"),
  'station hub must render a visible first dock handoff container');
assert.ok(stationSource.includes('First dock — do these three') || stationSource.includes('First Dock Handoff'),
  'handoff rail must have a player-facing title');
assert.ok(
  stationSource.includes('Sell what you hauled')
    || stationSource.includes('Open your hold')
    || stationSource.includes('Audit hold / sell cargo'),
  'handoff rail must start with a truthful sell/hold step');
assert.doesNotMatch(stationSource, /Sell the sample|Sample cleared|Sell mined cargo/i,
  'first dock handoff must not claim a sample or mined cargo exists when the hold can be empty');
assert.ok(
  stationSource.includes('Take one easy job')
    || stationSource.includes('Accept one low-risk job'),
  'handoff rail must send players to a safe first contract');
assert.ok(
  stationSource.includes('Safe to undock')
    || stationSource.includes('Fix launch risks')
    || stationSource.includes('Launch when safe'),
  'handoff rail must end by reinforcing Departure Check / undock readiness');
assert.ok(stationSource.includes('data-handoff-tab'),
  'handoff rail steps must be clickable tab actions');
assert.ok(stationSource.includes('data-handoff-dismiss') || stationSource.includes('st-handoff-dismiss'),
  'first dock handoff must be dismissible (single strip, not permanent chrome)');
assert.match(stationSource, /target\.getAttribute\('data-handoff-tab'\)[\s\S]*this\.setTab\(tabId, \{ focusRail: true \}\)/,
  'handoff clicks must route through the same focus-aware station tab path as the rail');
assert.ok(stationSource.includes("targetTab: hasCargo || marketDone ? 'hold' : 'market'")
  || stationSource.includes("targetTab: 'hold'"),
  'cargo handoff step should prefer Hold when the player has cargo to sell');
assert.match(stationSource, /ctx\.bus\.emit\('audio:cue', \{ id: 'ui_tab' \}\)/,
  'handoff clicks should use the existing tab audio cue');
assert.match(stationSource, /function firstDockDepartureTarget\(chips\)/,
  'handoff departure step must reuse Departure Check chips instead of inventing launch readiness');
assert.match(stationSource, /departureReadinessChips\(state\)/,
  'handoff departure step must read shared departure readiness');
assert.match(stationSource, /this\._refreshHandoff\(\)/,
  'station hub must refresh the handoff rail from lifecycle and event paths');
assert.match(stationSource, /const refreshHandoff = \(\) => \{ if \(this\._visible\(\)\) this\._refreshHandoff\(\); \};/,
  'handoff refresh must stay visible-screen scoped');

for (const eventName of [
  'economy:tradeCompleted',
  'cargo:changed',
  'ship:statsChanged',
  'fuel:changed',
  'nav:waypoint',
  'mission:updated',
  'mission:accepted',
  'mission:completed',
]) {
  assert.ok(stationSource.includes(`bus.on('${eventName}'`),
    `first dock handoff must react to ${eventName}`);
}

assert.doesNotMatch(stationSource, /codex/i,
  'first dock handoff slice must not touch Codex responsibilities');
assert.doesNotMatch(onboardingSource, /tab labels at top/i,
  'first dock onboarding copy must not describe the old top-tab layout');
assert.match(onboardingSource, /left rail/,
  'first dock onboarding copy must teach the actual station left rail');
assert.match(onboardingSource, /audit the hold, accept one low-risk job/,
  'first dock onboarding copy must match the handoff rail loop');
assert.match(onboardingSource, /Departure Check looks safe/,
  'first dock onboarding copy must reinforce Departure Check before undocking');

assert.equal(pkg.scripts['check:first-dock-handoff'], 'node scripts/check-first-dock-handoff.mjs',
  'package.json must expose the first dock handoff guard');
assert.ok(pkg.scripts.check.includes('npm run check:first-dock-handoff'),
  'npm run check must include the first dock handoff guard');
assert.ok(pkg.scripts['check:ci'].includes('npm run check:first-dock-handoff'),
  'npm run check:ci must include the first dock handoff guard');

console.log('First dock handoff OK - station rail links Market, Missions, and Departure Check with current left-rail onboarding copy.');
