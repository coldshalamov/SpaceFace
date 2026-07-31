// Phase H1 Row 8 — static readiness for the single shipped-Electron sanity attempt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const source = () => readFileSync(new URL('scripts/check-h1-electron-e2e.mjs', ROOT), 'utf8');
const recordedFailure = () => JSON.parse(readFileSync(new URL(
  'design/program/roadmap/evidence/h1/row8-electron-e2e/failure-state.json',
  ROOT,
), 'utf8'));

const REQUIRED_STILLS = Object.freeze([
  '01-main-menu.png',
  '02-new-game.png',
  '03-flight.png',
  '04-dock-prompt.png',
  '05-station.png',
  '06-ledger.png',
]);

test('Row 8 owns exactly one isolated headed Electron launch', () => {
  const text = source();
  assert.equal((text.match(/electron\.launch\(/g) || []).length, 1);
  assert.ok(text.includes("createIsolatedElectronLaunch({ root: ROOT, taskId: 'h1-electron-e2e' })"));
  assert.ok(text.includes('electron.launch(isolatedLaunch.options)'));
  assert.doesNotMatch(text, /chromium\.launch|firefox\.launch|webkit\.launch/);
});

test('the attempt is consumed before Electron launch and refuses any retry', () => {
  const text = source();
  const consume = text.indexOf('consumeAttempt(candidateCommit)');
  const launch = text.indexOf('electron.launch(isolatedLaunch.options)');
  assert.ok(consume >= 0 && launch > consume);
  assert.ok(text.includes('attempt already consumed'));
  assert.ok(text.includes('attemptsConsumed: 1'));
  assert.ok(text.includes('retryPerformed: false'));
  assert.ok(text.includes("launches: { browser: 0, electron: electronLaunches }"));
});

test('the proven about:blank to canonical-root ownership and cleanup pattern surrounds the route', () => {
  const text = source();
  const firstWindow = text.indexOf('electronApp.firstWindow');
  const tracker = text.indexOf('createElectronCanonicalUrlTracker(page');
  const canonical = text.indexOf('waitForCanonicalRoot', tracker);
  const loadState = text.indexOf("waitForLoadState('domcontentloaded'", canonical);
  assert.ok(firstWindow >= 0 && tracker > firstWindow && canonical > tracker && loadState > canonical);
  for (const required of [
    'assertIsolatedElectronRootUrl(rootUrl)',
    'inspectCanonicalRootUrl(page.url(), rootUrl)',
    'closeOwnedElectronRuntime({',
    'isolatedLaunch.cleanup({ runtimeClosed: true })',
    'createElectronProcessMonitor',
    'createStrictElectronApplicationIssueTracker',
    'assessElectronProcessHealth',
  ]) assert.ok(text.includes(required), `missing Electron ownership contract: ${required}`);
});

test('the visible public route is menu to fixed-seed New Game to authored flight', () => {
  const text = source();
  for (const required of [
    "await waitForVisible(newGameButton, 30_000, 'Main Menu')",
    "getByRole('button', { name: 'New Game', exact: true })",
    "[data-screen=\"newGame\"]",
    "page.fill('#sf-ng-seed', String(FIXED_SEED))",
    "getByRole('button', { name: 'Launch', exact: true })",
    'page.waitForFunction(flightReadyInPage',
    "flight.mode, 'flight'",
    'SwiftShader|llvmpipe|software',
  ]) assert.ok(text.includes(required), `missing public launch contract: ${required}`);
});

test('the recorded visible Main Menu uses one role-locator authority, not a second selector sample', () => {
  const failure = recordedFailure();
  assert.equal(failure.phase, 'main-menu');
  assert.equal(failure.snapshot.mode, 'menu');
  assert.deepEqual(failure.snapshot.visibleScreens, ['mainMenu']);
  assert.match(failure.snapshot.activeElement, /<button\b[^>]*>New Game<\/button>/);

  const text = source();
  assert.ok(text.includes("const newGameButton = page.getByRole('button', { name: 'New Game', exact: true })"));
  assert.ok(text.includes("visibilityAuthority: 'role:button[name=\"New Game\"]'"));
  assert.doesNotMatch(text, /readSurfaceSnapshot\('mainMenu'\)/,
    'the menu must not be re-sampled through querySelector after the role locator proves visibility');
  assert.doesNotMatch(text, /document\.querySelector\(`\[data-screen="\$\{id\}"\]`\)/,
    'the removed generic surface sampler must not return under a different caller');
});

test('docking uses the public map, autopilot, visible dock prompt, and held E input', () => {
  const text = source();
  for (const required of [
    "page.keyboard.press('KeyN')",
    "waitForVisible('#sf-galaxymap'",
    "searchInput.fill('Helios Station')",
    "getByRole('button', { name: 'Set Waypoint', exact: true })",
    "page.locator('.sf-alert--dock')",
    "page.keyboard.down('KeyE')",
    "window.SF?.state?.ui?.docked === true",
    "[data-screen=\"station\"] .sx-dock",
  ]) assert.ok(text.includes(required), `missing physical dock contract: ${required}`);
  assert.doesNotMatch(text, /bus\.emit\(['"]dock:docked|state\.ui\.docked\s*=(?!=)/,
    'Row 8 must not inject dock state');
});

test('Ledger is opened through the visible station command dock', () => {
  const text = source();
  for (const required of [
    "[data-screen=\"station\"] .sx-dock [data-nav=\"ledger\"]",
    "[data-screen=\"station\"] .st-ledger",
    "ledger.tabSelected, true",
    "ledger.labelledBy, 'st-ledger-station-title'",
    "ledger.title, \"The Ship's Ledger\"",
    'ledger.hasContentSurface, true',
  ]) assert.ok(text.includes(required), `missing Ledger contract: ${required}`);
  assert.doesNotMatch(text, /screenManager\.(?:pushScreen|replace|show)|requestCodexTab/,
    'Row 8 must use the rendered Ledger destination rather than screen-manager injection');
});

test('all step stills and failure artifacts are named before the attempt', () => {
  const text = source();
  for (const still of REQUIRED_STILLS) assert.ok(text.includes(still), `missing still ${still}`);
  assert.ok(text.includes('failure-row8.png'));
  assert.ok(text.includes("'failure-state.json'"));
  assert.ok(text.includes("'report.json'"));
  assert.ok(text.includes("'run.log'"));
});

test('Row 8 carries the H1 evidence boundary and no performance sampler', () => {
  const text = source();
  assert.ok(text.includes('informational_contended: true'));
  assert.ok(text.includes('noPerformanceEvidence: true'));
  assert.ok(text.includes('Matched performance remains Phase H3'));
  assert.doesNotMatch(text, /startReadOnlyPerformanceSampler|renderer\.info(?:\.|\[)|performance\.now\(|requestAnimationFrame\(/,
    'Row 8 must not collect renderer or per-frame performance evidence');
});
