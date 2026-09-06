// Guards the first dock handoff rail.
// The rail is non-blocking UI, but it must keep the opening station loop explicit:
// sell cargo (Market → Selling), take one safe job (Missions), then fix launch risks / undock.
// The pure step planner lives in src/ui/station/stationDepartureModel.js; the live
// "Orbital Command" shell (src/ui/station/stationApp.js) renders it on every docked refresh.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const departureModelPath = join(ROOT, 'src/ui/station/stationDepartureModel.js');
const stationAppPath = join(ROOT, 'src/ui/station/stationApp.js');
const modelSource = readFileSync(departureModelPath, 'utf8');
const appSource = readFileSync(stationAppPath, 'utf8');
const onboardingSource = readFileSync(join(ROOT, 'src/systems/onboarding.js'), 'utf8');
// The first-use LINES live in hudAttention, not in the system that fires them. Asserting the copy
// against onboarding.js reported a correct game as broken: hudAttention.js has carried
// "Use the left rail. Departure Check owns undock." all along, while onboarding.js only ever held
// the trigger and a comment about the layout.
const firstUseCopySource = readFileSync(join(ROOT, 'src/ui/hudAttention.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

assert.match(modelSource, /export function firstDockHandoffVisible\(state, stationId\)/,
  'station departure model must keep first dock handoff visibility directly testable');
assert.match(modelSource, /export function firstDockHandoffSteps\(state = \{\}\)/,
  'station departure model must keep first dock handoff step planning directly testable');
assert.ok(modelSource.includes('Sell what you hauled')
  || modelSource.includes('Open your hold')
  || modelSource.includes('Audit hold / sell cargo'),
  'handoff rail must start with a truthful sell/hold step');
assert.doesNotMatch(modelSource, /Sell the sample|Sample cleared|Sell mined cargo/i,
  'first dock handoff must not claim a sample or mined cargo exists when the hold can be empty');
assert.ok(
  modelSource.includes('Take one easy job')
    || modelSource.includes('Accept one low-risk job'),
  'handoff rail must send players to a safe first contract');
assert.ok(
  modelSource.includes('Safe to undock')
    || modelSource.includes('Fix launch risks')
    || modelSource.includes('Launch when safe'),
  'handoff rail must end by reinforcing Departure Check / undock readiness');
assert.ok(
  modelSource.includes("targetTab: hasCargo ? 'market' : 'hold'")
    || modelSource.includes("tradeMode: hasCargo ? 'sell'"),
  'cargo handoff step should open Market → Selling when the player has cargo to sell');
assert.ok(modelSource.includes('tradeMode'),
  'sell handoff must pass tradeMode so Market opens in Selling filter');
assert.match(modelSource, /function firstDockDepartureTarget\(chips\)/,
  'handoff departure step must reuse Departure Check chips instead of inventing launch readiness');
assert.match(modelSource, /departureReadinessChips\(state\)/,
  'handoff departure step must read shared departure readiness');
assert.match(modelSource, /beatDoneAt\.dock/,
  'handoff sell step must complete from the live B4 receipt');
assert.match(modelSource, /beatDoneAt\.choice/,
  'handoff must hide/complete from the live B5 receipt');
assert.doesNotMatch(modelSource, /ob\.done|done\.sell|done\.next/,
  'handoff must not consume the obsolete onboarding.done shape');

// The live shell renders the handoff strip and routes steps to real destinations.
assert.match(appSource, /firstDockHandoffVisible\(s, stationId\(\)\)/,
  'the docked shell must gate the handoff strip through the shared visibility planner');
assert.match(appSource, /firstDockHandoffSteps\(s\)/,
  'the docked shell must render steps from the shared planner');
assert.ok(appSource.includes('sxb-handoff'),
  'live shell must render a visible first dock handoff container');
assert.ok(appSource.includes('data-handoff'),
  'handoff rail steps must be clickable destination actions');
assert.ok(appSource.includes('data-handoff-mode'),
  'sell handoff must carry trade mode so Market opens in Selling filter');
assert.match(appSource, /screenMemory\.read\('station', 'firstDockHandoffDismissed', false\)/,
  'handoff dismissal must use the existing per-save Station screen-memory bag');
assert.ok(appSource.includes('data-handoff-dismiss'),
  'handoff rail must provide a user-operable dismissal control');
assert.match(appSource, /aria-label="Dismiss getting started guidance"/,
  'handoff dismissal must have an accessible name');
assert.match(appSource, /screenMemory\.set\('station', \{ firstDockHandoffDismissed: true \}\)/,
  'handoff dismissal must persist a benign UI preference rather than bypass onboarding state');
assert.match(appSource, /function renderHandoff\(\)/,
  'the docked shell must refresh the handoff rail from its render path');
assert.match(appSource, /renderHandoff\(\)/,
  'shell refresh must repaint the handoff strip from live onboarding state');

assert.doesNotMatch(modelSource, /codex/i,
  'first dock handoff slice must not touch Codex responsibilities');
for (const [label, source] of [['onboarding', onboardingSource], ['first-use copy', firstUseCopySource]]) {
  assert.doesNotMatch(source, /tab labels at top/i,
    `${label} must not describe the old top-tab layout`);
}
assert.match(firstUseCopySource, /left rail/,
  'first dock onboarding copy must teach the actual station left rail');
assert.match(firstUseCopySource, /Use the left rail\. Departure Check owns undock\./,
  'firstHub copy must point at the handoff owner without repeating its full checklist');
assert.match(onboardingSource, /_tutorialRailOwnsVoice\(\)/,
  'firstHub hint must yield while the staged B0-B5 tutorial is active');

assert.equal(pkg.scripts['check:first-dock-handoff'], 'node scripts/check-first-dock-handoff.mjs',
  'package.json must expose the first dock handoff guard');
assert.ok(pkg.scripts.check.includes('npm run check:first-dock-handoff'),
  'npm run check must include the first dock handoff guard');
// CI membership, stated as intent rather than as a literal chain string. `check:ci` used to be its
// own explicit `&&` chain; it now delegates to `check:ci:report`, which expands the `check` chain into
// individual commands and runs them all. So this guard is still in CI — transitively, via the `check`
// membership asserted immediately above — but the old substring test could not see that and had been
// failing ever since the delegation landed.
const ciScript = pkg.scripts['check:ci'] || '';
assert.ok(
  ciScript.includes('npm run check:first-dock-handoff')
  || (ciScript.includes('check:ci:report') && pkg.scripts.check.includes('npm run check:first-dock-handoff')),
  'npm run check:ci must include the first dock handoff guard, directly or through the check:ci:report runner',
);

console.log('First dock handoff OK - station rail links Market→Selling, Missions, and Departure Check with current left-rail onboarding copy.');
