// Fail-closed static contract over the textile-journey harness (ADR D11).
//
// The journey check boots a real browser and takes minutes, so it cannot run in every gate. This
// contract runs in milliseconds and pins the properties that make that expensive run MEAN anything:
//
//   * the harness cannot inject the outcomes it grades;
//   * it grades all eleven steps the ADR names, and cannot silently drop one;
//   * plot/engage separation is asserted as a PAIR, not as a single half;
//   * instrument truth is a cross-check against sim state, not a presence check;
//   * arrival is graded on the sector the ship is in, never on the executor's own claim.
//
// These are exactly the properties a well-meaning edit under schedule pressure would erode first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JOURNEY_STEPS, JOURNEY_TEXTILE_SCHEMA } from '../scripts/lib/journeyTextileSteps.mjs';
import { TRAVEL_PUBLIC_HELPERS, bootToAuthoredFlight } from '../scripts/lib/professionalTravelPublicRoute.mjs';

const STEPS_SRC = readFileSync(new URL('../scripts/lib/journeyTextileSteps.mjs', import.meta.url), 'utf8');
const CHECK_SRC = readFileSync(new URL('../scripts/check-journey-textile.mjs', import.meta.url), 'utf8');
const ROUTE_SRC = readFileSync(new URL('../scripts/lib/professionalTravelPublicRoute.mjs', import.meta.url), 'utf8');
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const stripComments = (value) => String(value || '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');

const CODE = stripComments(STEPS_SRC) + '\n' + stripComments(CHECK_SRC);

// ─── the eleven steps ────────────────────────────────────────────────────────────────────────────

test('the journey grades exactly the eleven steps the ADR names, in order', () => {
  assert.equal(JOURNEY_STEPS.length, 11, 'D11 names eleven steps; dropping one silently shrinks the finish line');
  assert.deepEqual(JOURNEY_STEPS.map((s) => s.id), [
    'accept-mission',
    'open-map',
    'identify-position',
    'inspect-destination',
    'compare-and-plot',
    'engage-separately',
    'truthful-instruments',
    'interrupt-route',
    'recover-itinerary',
    'arrive-and-deliver',
    'save-load-states',
  ]);
  for (const s of JOURNEY_STEPS) {
    assert.ok(s.title && s.title.length > 3, `step ${s.id} must carry a human-readable title`);
  }
});

test('the schema is versioned so evidence files can never be silently reinterpreted', () => {
  assert.match(JOURNEY_TEXTILE_SCHEMA, /^spaceface\.journeyTextile\.v\d+$/);
});

// ─── the harness must not manufacture what it grades ─────────────────────────────────────────────

test('the harness cannot inject gameplay events or write simulation state', () => {
  const forbidden = [
    [/bus\.emit\(\s*['"]jump:/, 'must not inject jump:* events'],
    [/bus\.emit\(\s*['"]sector:(?:enter|exit)/, 'must not inject sector membership'],
    [/bus\.emit\(\s*['"]dock:docked/, 'must not inject docking — the dock key is the public path'],
    [/bus\.emit\(\s*['"]mission:accepted/, 'must not inject mission acceptance'],
    [/bus\.emit\(\s*['"]nav:engageRoute/, 'must not inject route engagement — the Engage control is the public path'],
    [/bus\.emit\(\s*['"]cargo:delivered/, 'must not inject the delivery receipt it grades'],
    [/\bstate\.mode\s*=(?!=)/, 'must not assign mode'],
    [/\bstate\.jump\.[A-Za-z_$]+\s*=/, 'must not assign jump fields'],
    [/(?:state\.)?world\.currentSectorId\s*=(?!=)/, 'must not assign the current sector'],
    [/\bplayer\.pos\.(?:x|z)\s*=(?!=)/, 'must not teleport the player'],
    [/missions\.acceptMission\s*\(/, 'must not call the mission system directly'],
    [/\benterSector\s*\(/, 'must not call sector transitions'],
    [/\bdebugFlight\b/, 'must not use debug-flight'],
    [/[?&]debug=/, 'must not use query debug flags'],
  ];
  const failures = [];
  for (const [re, msg] of forbidden) {
    if (re.test(CODE)) failures.push(msg);
  }
  assert.deepEqual(failures, [], `journey harness must observe, not inject: ${failures.join('; ')}`);
});

test('the harness drives the game through the public input surface', () => {
  assert.match(CODE, /keyboard\.press\(['"]KeyE['"]\)/, 'must dock with the public dock key');
  assert.match(CODE, /keyboard\.press\(['"]Key[NM]['"]\)/, 'must open the chart with the public map key');
  assert.match(CODE, /keyboard\.press\(['"]F5['"]\)/, 'must quick-save through F5');
  assert.match(CODE, /getByRole\(\s*['"]button['"]/, 'must click real controls by their accessible role');
});

test('station waypoint setup cannot open Pause by pressing Escape after the map already closed', () => {
  assert.match(STEPS_SRC, /const mapStillVisible = await page\.locator\('\[data-screen="galaxyMap"\]'\)[\s\S]*?if \(mapStillVisible\) \{[\s\S]*?keyboard\.press\('Escape'\)/,
    'Escape may close a still-visible map, but must not fire unconditionally after Set Waypoint');
  assert.match(STEPS_SRC, /const flightResumed = await page\.waitForFunction\(\(\) => window\.SF\?\.state\?\.mode === 'flight'/,
    'the approach must prove the public map flow returned to flight before waiting on movement');
});

// ─── the assertions that carry the weight ────────────────────────────────────────────────────────

test('plot/engage separation is asserted as a PAIR — stillness after plot AND movement after engage', () => {
  assert.match(CODE, /measureStillnessAfterPlot/, 'must measure that plotting alone does not move the ship');
  assert.match(CODE, /measureMovementAfterEngage/, 'must measure that engaging does move the ship');
  // Both halves must be consumed by the step, or the pair degenerates into a single claim.
  const step = CODE.slice(CODE.indexOf("await step('engage-separately'"), CODE.indexOf("const engagedOk"));
  assert.match(step, /still\.driftWU/, 'the step must read the post-plot drift it measured');
  assert.match(step, /moving\.moved/, 'the step must read the post-engage movement it measured');
  assert.match(step, /PLOT ALONE MOVED THE SHIP/, 'a plot that moves the ship must fail loudly and by name');
});

test('instrument truth is a cross-check against sim state, not a presence check', () => {
  assert.match(CODE, /INSTRUMENT_TOLERANCE/, 'display tolerances must be declared, not improvised inline');
  // Each graded instrument must have an independently recomputed counterpart.
  assert.match(CODE, /actualSpeed\s*=/, 'velocity must be recomputed from the velocity vector');
  assert.match(CODE, /actualStop\s*=/, 'stopping distance must be recomputed independently');
  assert.match(CODE, /actualEta\s*=/, 'ETA must be recomputed independently');
  assert.match(CODE, /agrees:/, 'the comparison must produce an explicit agreement verdict');
  // A displayed value that is simply absent must not count as agreement.
  assert.match(CODE, /absent/, 'an absent instrument must be reported, never treated as truthful');
});

test('arrival is graded on the sector the ship is in, never on the executor claim alone', () => {
  assert.match(CODE, /inDestinationSector/, 'arrival must be decided by the ship\'s actual sector');
  assert.match(CODE, /executorClaimedArrived/, 'the executor claim must be recorded SEPARATELY so a disagreement is visible');
  const step = CODE.slice(CODE.indexOf("await step('arrive-and-deliver'"), CODE.indexOf("await step('save-load-states'"));
  assert.match(step, /if\s*\(!arrive\.inDestinationSector\)/, 'the step must fail when the ship is not physically at the destination');
});

test('the itinerary recovery step distinguishes "kept" from "re-plotted"', () => {
  assert.match(CODE, /routeSurvived/, 'must assert the itinerary was not orphaned');
  assert.match(CODE, /sameLeg/, 'resuming on a different leg is a restart, not a recovery, and must be caught');
});

test('a cargo contract is only accepted when its destination is in another sector', () => {
  assert.match(CODE, /crossSector/, 'a same-sector delivery would not exercise the travel spine at all');
});

// ─── honest reporting ────────────────────────────────────────────────────────────────────────────

test('every step outcome is one of the four honest verdicts', () => {
  const verdicts = [...CODE.matchAll(/outcome:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(verdicts.length >= 11, 'every step must declare outcomes explicitly');
  for (const v of verdicts) {
    assert.ok(['pass', 'fail', 'blocked', 'not-implemented'].includes(v), `unexpected verdict "${v}"`);
  }
});

test('a late failure cannot erase the record of earlier passes', () => {
  assert.match(CODE, /const step = async \(id, fn\) => \{[\s\S]*?catch \(error\) \{[\s\S]*?record\(id, 'fail'/,
    'a throwing step must be recorded as a failure rather than aborting the journey');
});

test('the check exits non-zero unless every step passes, and writes evidence either way', () => {
  assert.match(CHECK_SRC, /process\.exit\(1\)/, 'the gate must actually fail the process');
  assert.match(CHECK_SRC, /pass:\s*!!\(journeyResult && journeyResult\.pass\)/, 'the gate must key on the journey verdict');
  const evidenceIdx = CHECK_SRC.indexOf("writeFile(path.join(STAGING, 'evidence.json')");
  const exitIdx = CHECK_SRC.indexOf('process.exit(1)');
  assert.ok(evidenceIdx > 0 && evidenceIdx < exitIdx,
    'evidence must be written BEFORE the failure exit — a failing journey\'s step record is the most valuable artifact it produces');
  assert.match(CHECK_SRC, /cleanupReport\?\.pass\s*===\s*true/,
    'the published verdict must fail closed when owned-resource cleanup fails');
});

test('publishing evidence cannot fail a run whose journey succeeded', () => {
  // The sibling travel check crashes on Windows with EPERM at the final rename, after a fully
  // successful run. This gate must not inherit that.
  assert.match(CHECK_SRC, /publishEvidence/, 'evidence publication must be a guarded operation');
  assert.match(CHECK_SRC, /cp\(staging, accepted/, 'must fall back to a copy when rename is refused');
});

// ─── extension, not a fork ───────────────────────────────────────────────────────────────────────

test('the journey extends the professional-travel route harness rather than forking it', () => {
  assert.equal(typeof bootToAuthoredFlight, 'function', 'the boot sequence must come from the route harness');
  assert.match(STEPS_SRC + CHECK_SRC, /from '\.\/lib\/professionalTravelPublicRoute\.mjs'|professionalTravelPublicRoute/,
    'the journey must import the ancestor harness');
  for (const name of ['searchAndSelect', 'clickPersistentButton', 'readTravelSnapshot', 'waitVisibleSafe']) {
    assert.equal(typeof TRAVEL_PUBLIC_HELPERS[name], 'function', `shared helper ${name} must be exported for reuse`);
  }
  const routeStart = ROUTE_SRC.indexOf('export async function runProfessionalTravelPublicRoute');
  const sharedStart = ROUTE_SRC.indexOf('export async function bootToAuthoredFlight');
  assert.ok(routeStart >= 0 && sharedStart > routeStart, 'the route and shared boot functions must both exist');
  assert.match(ROUTE_SRC.slice(routeStart, sharedStart), /await bootToAuthoredFlight\s*\(/,
    'the ancestor route itself must call the shared boot implementation so the journey cannot drift');
});

test('the check is registered so it can actually be run as a gate', () => {
  assert.ok(PKG.scripts['check:journey:textile'], 'D11 names check:journey:textile as the program finish line');
  assert.match(PKG.scripts['check:journey:textile'], /check-journey-textile\.mjs/);
  assert.match(PKG.scripts['check:journey:textile'], /journey-textile-contract\.test\.mjs/,
    'the fast contract must gate the expensive browser run');
});
