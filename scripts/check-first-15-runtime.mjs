#!/usr/bin/env node
// Browser acceptance for the ordinary B0–B5 First Shift. The actor reads only visible DOM/canvas
// controls. Runtime state is sampled after each action as an observer receipt and is never fed back
// into target selection, movement, or any other actor decision.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAYER_STORE_DIR = mkdtempSync(join(tmpdir(), 'sf-first-15-store-'));
const BROWSER_PROFILE_DIR = mkdtempSync(join(tmpdir(), 'sf-first-15-profile-'));
const EVIDENCE_DIR = join(ROOT, '.devshots', 'first-15-runtime');
const START_TIMEOUT_MS = 90000;
const { chromium } = await loadPlaywright();
const receipts = [];
let phase = 'BOOT';
let server = null;
let context = null;
let page = null;
const issueCollectors = [];

assertNoActorShortcuts();
mkdirSync(EVIDENCE_DIR, { recursive: true });

try {
  server = await startFreshServer();
  ({ context, page } = await openPlayerContext());
  issueCollectors.push(collectPageIssues(page));
  await bootToNewGame(page);
  await verifyNewGameRail(page);

  phase = 'OPENING_SPLASH';
  await launchPublicly(page);
  await screenshot(page, 'opening-splash-cleared.png');

  phase = 'B0_WAKE';
  await assertB0PublicContract(page);
  await screenshot(page, 'b0-wake.png');
  await observe(page, phase);
  await runWake(page);

  phase = 'B1_DERELICT';
  await runDerelict(page);
  await screenshot(page, 'b1-derelict.png');
  await observe(page, phase);

  phase = 'B3_GUNNERY';
  await runGunnery(page);
  await screenshot(page, 'b3-gunnery.png');
  await observe(page, phase);

  phase = 'B2_SEAM';
  await runSeam(page);
  await screenshot(page, 'b2-seam.png');
  await observe(page, phase);

  phase = 'B4_DOCK';
  await runFirstTrade(page);
  await screenshot(page, 'b4-first-trade.png');
  await observe(page, phase);

  phase = 'B5_CHOICE';
  const beforeContinue = await runChoice(page);
  await screenshot(page, 'b5-choice.png');
  await observe(page, phase);

  phase = 'SAVE_SLOT_1';
  await undockForPublicSave(page);
  await saveToSlotOne(page);
  await observe(page, phase);

  // A cold persistent-context restart exercises the same isolated browser profile and server-side
  // player store. It is intentionally not an in-page `game:load` shortcut.
  await context.close();
  server.kill();
  server = await startFreshServer();
  ({ context, page } = await openPlayerContext());
  issueCollectors.push(collectPageIssues(page));
  phase = 'COLD_CONTINUE';
  await coldContinuePublicly(page);
  const afterContinue = await reopenPublicShipworks(page, beforeContinue.mission);
  assert.deepEqual(afterContinue, beforeContinue,
    'Slot 1 Continue must preserve the visible mission, fitted weapon/class, and location context');
  await screenshot(page, 'cold-continue.png');
  await observe(page, phase);
  assert.deepEqual(
    issueCollectors.flatMap((collector) => collector.errorIssues()),
    [],
    'First Shift route must not record page errors before or after cold restart',
  );

  console.log(`First Shift browser route OK: ${JSON.stringify({ phase, receipts, beforeContinue, afterContinue })}`);
} catch (error) {
  const failure = page ? await observerReceipt(page).catch(() => null) : null;
  if (page) await screenshot(page, `failure-${phase.toLowerCase()}.png`).catch(() => {});
  console.error(`FIRST_SHIFT_FAILURE phase=${phase} observer=${JSON.stringify(failure)} receipts=${JSON.stringify(receipts)}`);
  throw error;
} finally {
  if (context) await context.close();
  if (server) server.kill();
  try { rmSync(PLAYER_STORE_DIR, { recursive: true, force: true }); } catch (_) {}
  try { rmSync(BROWSER_PROFILE_DIR, { recursive: true, force: true }); } catch (_) {}
}

async function openPlayerContext() {
  const opened = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await opened.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  const openedPage = opened.pages()[0] || await opened.newPage();
  return { context: opened, page: openedPage };
}

async function bootToNewGame(actor) {
  await actor.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForVisible(actor, '[data-screen="mainMenu"]', START_TIMEOUT_MS, 'main menu');
  await waitForBootOverlayGone(actor);
  assert.equal(await clickButton(actor, 'New Game'), true, 'main menu exposes New Game');
  await waitForVisible(actor, '[data-screen="newGame"] .sf-ng-route', 15000, 'new-game route rail');
}

async function verifyNewGameRail(actor) {
  const rail = await actor.locator('[data-screen="newGame"] .sf-ng-route').innerText();
  for (const phrase of ['Wake at the beacon', 'Tether the derelict', 'Mine the first seam', 'Dock and pick work']) {
    assert.match(rail, new RegExp(phrase, 'i'), `first-shift rail includes ${phrase}`);
  }
}

async function launchPublicly(actor) {
  const launch = actor.getByRole('button', { name: 'Launch', exact: true }).first();
  assert.ok(await launch.count(), 'New Game exposes Launch');
  // Launch starts an SPA run and its real pointer handler synchronously enters shader preparation.
  // A Locator click waits for that long main-thread handler (and historically for a navigation
  // which never occurs), turning healthy cold shader work into a 10 s action timeout. Dispatch the
  // same visible button through a literal pointer coordinate, then observe each startup phase.
  const launchBox = await launch.boundingBox();
  assert.ok(launchBox && launchBox.width > 0 && launchBox.height > 0,
    'New Game Launch has a visible pointer target');
  await actor.mouse.click(
    launchBox.x + launchBox.width / 2,
    launchBox.y + launchBox.height / 2,
  );
  await waitForVisible(actor, 'canvas', START_TIMEOUT_MS, 'play canvas');
  await waitForBootOverlayGone(actor, START_TIMEOUT_MS);
  await waitForVisible(actor, '.sf-firstrun-splash', 15000, 'first-run splash');
  await actor.waitForFunction(() => !document.querySelector('.sf-firstrun-splash'), null, {
    timeout: START_TIMEOUT_MS,
  }).catch((error) => {
    throw new Error(`Timed out waiting for first-run splash detachment: ${error.message}`);
  });
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /thrust until speed passes forty/i,
    START_TIMEOUT_MS, 'B0 public objective after splash');
}

async function assertB0PublicContract(actor) {
  const report = await actor.evaluate(() => {
    const read = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { visible: false, text: '' };
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    };
    return {
      panel: read('#sf-onboarding .sf-ob-title'),
      tracker: read('.sf-mission-tracker .sf-mt-obj'),
      controls: read('#control-hints'),
      missionLog: read('[data-screen="missionLog"]'),
    };
  });
  assert.ok(report.panel.visible || report.tracker.visible, 'B0 exposes one visible persistent objective');
  assert.equal(report.panel.visible && !!report.panel.text && report.tracker.visible && !!report.tracker.text, false,
    'B0 keeps onboarding-panel and HUD tracker objective copy mutually exclusive');
  assert.doesNotMatch(report.controls.text,
    /W thrusts|W\/Up to thrust|Left stick flies|Nose follows the mouse|A\/D \(or arrows\) turn/i,
    'B0 defers the generic firstFlight control wall');
  assert.equal(report.missionLog.visible, false, 'B0 does not force-open Mission Log');
  await actor.keyboard.press('KeyJ');
  await waitForVisible(actor, '[data-screen="missionLog"]', 10000, 'Mission Log opened with public J binding');
  await waitForText(actor, '[data-screen="missionLog"]', /current action|recommended next/i,
    10000, 'Mission Log public route context');
  await actor.keyboard.press('Escape');
  await actor.waitForFunction(() => {
    const el = document.querySelector('[data-screen="missionLog"]');
    return !el || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden';
  }, null, { timeout: 10000 });
}

async function runWake(actor) {
  await holdKeys(actor, ['KeyW'], 1500);
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /brake below ten/i, 20000, 'B0 brake cue');
  // Pilot S is reverse plus brake. The dedicated zero-thrust brake proves the same public lesson
  // without seeding a variable backward approach to the trainer spawned directly ahead.
  await holdKeys(actor, ['Digit0'], 1400);
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /follow the amber diamond/i, 20000, 'B0 trainer cue');
  // The marker is authored directly ahead of the live hull. Keep the default Pilot heading and
  // use the visible cue as feedback; turning from the fixed-world HUD arrow would steer away.
  await thrustForwardUntil(actor, /hold course/i, 'B0 trainer approach');
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /target the marked derelict/i,
    20000, 'B1 derelict cue');
}

async function runDerelict(actor) {
  // Ctrl is the public nearest-target modifier; the actor uses the visible Derelict objective, not
  // a private entity id. Holding tether plus thrust reels the live line; a tap cuts it.
  await tapChord(actor, ['ControlLeft', 'Space']);
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /winch in|cut and coast/i,
    12000, 'B1 latch/winch cue');
  await holdKeys(actor, ['Space', 'KeyW'], 3500);
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /cut and coast/i, 12000, 'B1 cut cue');
  await actor.keyboard.press('Space');
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /fire a short burst/i,
    20000, 'B3 gunnery cue');
}

async function runGunnery(actor) {
  await aimAtPublicObjective(actor);
  for (let shot = 0; shot < 3; shot++) await holdMouse(actor, 'left', 180);
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /release\. let the heat bar clear/i,
    12000, 'B3 cooling cue');
  await actor.waitForTimeout(5000);
  await driveAwayFromObjectiveUntil(actor, /pulse the scanner/i, 14, 'B3 disengage');
}

async function runSeam(actor) {
  await holdKeys(actor, ['Digit0'], 1400);
  await aimAtPublicObjective(actor);
  // Gunnery disengagement leaves the ship coasting away from the seam. The seam is still inside
  // the standard Massline's 390 WU reach, but can sit beyond the 220 WU mining beam. Use the same
  // public nearest-latch and reel grammar taught on the derelict, then brake while the live line
  // holds the physical approach. This is player flight, not a hidden position correction.
  await tapChord(actor, ['ControlLeft', 'Space']);
  await waitForVisible(actor, '.sf-ml-instrument:not([hidden])',
    12000, 'B2 seam Massline latch');
  await holdKeys(actor, ['Space', 'KeyW'], 3000);
  await holdKeys(actor, ['Digit0'], 1400);
  await aimAtPublicObjective(actor);
  await actor.keyboard.press('KeyC');
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /beam the bright seams/i,
    12000, 'B2 scan receipt');
  await aimAtPublicObjective(actor);
  await actor.keyboard.down('Digit0');
  try {
    await holdMouse(actor, 'right', 8000);
  } finally {
    await actor.keyboard.up('Digit0');
  }
  await waitForText(actor, '#sf-onboarding .sf-ob-progress', /SAMPLE:\s*3\s*\/\s*3/i,
    30000, 'B2 collected samples');
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /helios\. dock when close/i,
    20000, 'B4 dock cue');
}

async function runFirstTrade(actor) {
  // The ordinary public flight computer owns long approaches. Set Waypoint physically flies the
  // ship; no hidden position or injected arrival is used by this actor.
  await armPublicWaypoint(actor, 'Helios Station');
  await waitForText(actor, '.sf-alert--dock .sf-alert__text', /dock at station/i,
    START_TIMEOUT_MS, 'B4 Helios physical dock range');
  await actor.keyboard.press('KeyE');
  await waitForVisible(actor, '.sx-dock', 15000, 'Helios station command dock');

  await actor.locator('button[data-nav="market"]').click();
  await waitForVisible(actor, '[data-mode="sell"]', 10000, 'market sell control');
  await actor.locator('[data-mode="sell"]').click();
  const salvage = actor.locator('[data-cmdty]').filter({ hasText: /salvage/i }).first();
  assert.ok(await salvage.count(), 'B4 exposes visibly-held salvage to sell');
  await salvage.click();
  await actor.getByRole('button', { name: 'Confirm Sale', exact: true }).click();

  await actor.locator('button[data-nav="contracts"]').click();
  await waitForText(actor, '.sx-ct-dispatch__label', /recommended delivery/i, 12000, 'B4 recommended contract');
  const recommended = actor.locator('.sx-ct-row').filter({ hasText: /recommended|first trade/i }).first();
  assert.ok(await recommended.count(), 'B4 presents the real recommended delivery row');
  await recommended.click();
  await actor.locator('[data-accept]').click();

  await undockStationPublicly(actor, 'Helios departure before Star Map');
  await travelToCeresThroughPublicMap(actor);
  await armPublicWaypoint(actor, 'Ceres Refinery');
  await waitForText(actor, '.sf-alert--dock .sf-alert__text', /dock at station/i,
    START_TIMEOUT_MS, 'B4 Ceres physical dock range');
  await actor.keyboard.press('KeyE');
  await waitForVisible(actor, '.sx-dock', 15000, 'Ceres station command dock');
}

async function travelToCeresThroughPublicMap(actor) {
  await actor.keyboard.press('KeyN');
  await waitForVisible(actor, '#sf-galaxymap', 15000, 'Star Map');
  const search = actor.locator('#sf-galaxymap .gm-search-input');
  await search.fill('Ceres');
  const ceres = actor.locator('#sf-galaxymap .gm-search-item').filter({ hasText: /ceres/i }).first();
  assert.ok(await ceres.count(), 'Star Map shows the Ceres destination publicly');
  await ceres.click();
  const jump = actor.getByRole('button', { name: /set course.*jump/i }).first();
  assert.ok(await jump.count(), 'Star Map exposes Set Course & Jump for Ceres');
  await jump.click({ noWaitAfter: true });
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', /ceres|dock/i, 45000, 'Ceres mission guidance');
}

async function runChoice(actor) {
  await actor.locator('button[data-nav="contracts"]').click();
  await waitForText(actor, '.sx-ct-dispatch__label', /pick one.*haul.*bounty.*survey/i,
    15000, 'B5 visible choices');
  const choice = actor.getByRole('tab', { name: /\b(HAUL|BOUNTY|SURVEY)\b/i }).first();
  assert.ok(await choice.count(), 'B5 has a visible HAUL, BOUNTY, or SURVEY choice');
  const choiceTitle = (await choice.locator('.sx-ct-row__title').innerText()).replace(/\s+/g, ' ').trim();
  assert.ok(choiceTitle, 'B5 choice exposes its own public contract title');
  await choice.click();
  await actor.locator('[data-accept]').click();
  const active = actor.locator('.sx-job').filter({ has: actor.locator('.sx-job__title', { hasText: choiceTitle }) }).first();
  await waitForVisible(actor, '.sx-job__title', 12000, 'chosen B5 active mission title');
  assert.ok(await active.count(), `B5 active mission preserves visible choice title ${choiceTitle}`);
  assert.equal((await active.locator('.sx-job__title').innerText()).replace(/\s+/g, ' ').trim(), choiceTitle,
    'B5 active job title equals the accepted public contract title');
  const track = active.locator('.sx-job__track');
  if (await track.getAttribute('aria-pressed') !== 'true') await track.click();
  await actor.waitForFunction((title) => {
    const jobs = [...document.querySelectorAll('.sx-job')];
    const job = jobs.find((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().includes(title));
    return !!(job && job.querySelector('.sx-job__track[aria-pressed="true"]'));
  }, choiceTitle, { timeout: 12000 });

  // Capture the fitted class/weapon through the ordinary Shipworks tab before saving. No loadout
  // or mission data is read from runtime state to decide an action.
  await actor.locator('button[data-nav="shipworks"]').click();
  await waitForVisible(actor, '.sx-hardpoint', 10000, 'Shipworks public fit surface');
  await screenshot(actor, 'b5-fit.png');
  return publicFingerprint(actor, { mission: choiceTitle, tracked: true });
}

async function undockForPublicSave(actor) {
  await undockStationPublicly(actor, 'public station undock before Save');
}

async function undockStationPublicly(actor, label) {
  await actor.locator('.sxb-launch').click();
  const launchAnyway = actor.locator('[data-pop-launch]');
  if (await launchAnyway.count() && await launchAnyway.isVisible()) await launchAnyway.click();
  await actor.waitForFunction(() => !document.querySelector('.sx-dock'), null, { timeout: 15000 })
    .catch((error) => { throw new Error(`Timed out waiting for ${label}: ${error.message}`); });
  await waitForVisible(actor, 'canvas', 10000, `${label} flight canvas`);
}

async function saveToSlotOne(actor) {
  await actor.keyboard.press('Escape');
  await waitForVisible(actor, '[data-screen="pause"]', 10000, 'pause menu');
  await actor.getByRole('button', { name: 'Save', exact: true }).click();
  await waitForVisible(actor, '[data-screen="saveLoad"]', 10000, 'Save / Load');
  const slotOneSave = actor.locator('[data-why="Save to Slot 1"]');
  assert.ok(await slotOneSave.count(), 'visible Save / Load exposes exact Slot 1 Save control');
  await slotOneSave.click();
  await actor.waitForFunction(() => {
    const row = [...document.querySelectorAll('.sf-slot')]
      .find((el) => /slot 1/i.test(el.querySelector('.sf-slot-name')?.textContent || ''));
    return !!(row && !row.classList.contains('empty')
      && /Current|Latest/.test(row.textContent || ''));
  }, null, { timeout: 15000 });
}

async function coldContinuePublicly(actor) {
  await actor.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForVisible(actor, '[data-screen="mainMenu"]', START_TIMEOUT_MS, 'cold main menu');
  await waitForBootOverlayGone(actor);
  const continueButton = actor.getByRole('button', { name: 'Continue', exact: true }).first();
  assert.ok(await continueButton.count(), 'main menu exposes Continue from Slot 1');
  await waitForText(actor, '.sf-menu-save-summary', /slot 1/i, 30000, 'public Slot 1 Continue summary');
  assert.equal(await continueButton.isDisabled(), false, 'Continue is enabled for the public Slot 1 save');
  await continueButton.click({ noWaitAfter: true });
  await waitForVisible(actor, 'canvas', START_TIMEOUT_MS, 'continued play canvas');
  await waitForVisible(actor, '.sf-mission-tracker', 30000, 'continued active mission tracker');
}

async function reopenPublicShipworks(actor, expectedMissionTitle) {
  await waitForText(actor, '.sf-alert--dock .sf-alert__text', /dock at station/i, 30000,
    'public dock availability after Continue');
  await actor.keyboard.press('KeyE');
  await waitForVisible(actor, '.sx-dock', 15000, 'continued station command dock');
  await actor.locator('button[data-nav="shipworks"]').click();
  await waitForVisible(actor, '.sx-hardpoint', 10000, 'continued Shipworks fit surface');
  await actor.locator('button[data-nav="contracts"]').click();
  await waitForVisible(actor, '.sx-job__title', 10000, 'continued public active mission surface');
  const active = actor.locator('.sx-job').filter({ has: actor.locator('.sx-job__title', { hasText: expectedMissionTitle }) }).first();
  assert.ok(await active.count(), 'Continue restores the accepted public mission title');
  const restoredTitle = (await active.locator('.sx-job__title').innerText()).replace(/\s+/g, ' ').trim();
  const restoredTracked = await active.locator('.sx-job__track').getAttribute('aria-pressed') === 'true';
  assert.equal(restoredTracked, true,
    'Continue restores the public tracked-mission state');
  await actor.locator('button[data-nav="shipworks"]').click();
  await waitForVisible(actor, '.sx-hardpoint', 10000, 'restored Shipworks fit surface');
  return publicFingerprint(actor, { mission: restoredTitle, tracked: restoredTracked });
}

async function thrustForwardUntil(actor, cue, label) {
  // Headless fixed-step progress varies with shader/CPU load. Hold the ordinary public control
  // until the next visible verb instead of guessing how many wall-clock pulses equal 390 WU.
  await actor.keyboard.down('KeyW');
  try {
    await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', cue, START_TIMEOUT_MS, label);
  } finally {
    await actor.keyboard.up('KeyW');
  }
}

async function armPublicWaypoint(actor, placeName) {
  await actor.keyboard.press('KeyN');
  const map = actor.locator('#sf-galaxymap');
  await map.waitFor({ state: 'visible', timeout: 15000 });
  const search = map.locator('.gm-search-input');
  await search.fill(placeName);
  const result = map.locator('.gm-search-item').filter({ hasText: new RegExp(placeName, 'i') }).first();
  await result.waitFor({ state: 'visible', timeout: 10000 });
  await result.click();
  const setWaypoint = actor.getByRole('button', { name: 'Set Waypoint', exact: true });
  await setWaypoint.waitFor({ state: 'visible', timeout: 10000 });
  const box = await setWaypoint.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${placeName} exposes a public Set Waypoint target`);
  await actor.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await actor.waitForTimeout(250);
  if (await map.isVisible().catch(() => false)) await actor.keyboard.press('Escape');
  await map.waitFor({ state: 'hidden', timeout: 10000 });
}

async function driveAwayFromObjectiveUntil(actor, cue, attempts, label) {
  // Pilot reverse is primarily a brake under assisted flight. A coasting D hold exercises the
  // authored full-yaw control for one half-turn; after the yaw damps, forward thrust opens range.
  await holdKeys(actor, ['KeyD'], 1050);
  await actor.waitForTimeout(350);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await visibleTextMatches(actor, '.sf-mission-tracker .sf-mt-obj', cue)) return;
    await holdKeys(actor, ['KeyW'], 850);
  }
  await waitForText(actor, '.sf-mission-tracker .sf-mt-obj', cue, 10000, label);
}

async function aimAtPublicObjective(actor) {
  const point = await objectiveArrowPoint(actor);
  await actor.mouse.move(point.x, point.y);
}

async function objectiveArrowPoint(actor) {
  const point = await actor.evaluate(() => {
    const el = document.querySelector('.sf-objarrow');
    if (!el) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  // A centered pointer is an ordinary neutral camera input when the goal is already on glass.
  return point || { x: 640, y: 400 };
}

async function publicFingerprint(actor, missionFingerprint) {
  return actor.evaluate((publicMission) => {
    const text = (selector) => (document.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
    const hardpoints = [...document.querySelectorAll('.sx-hardpoint')]
      .map((el) => el.getAttribute('aria-label') || '').filter(Boolean);
    return {
      mission: publicMission.mission,
      tracked: publicMission.tracked === true,
      hardpoints,
      identity: text('.sx-sw-circuit__identity'),
      flow: text('.sx-sw-circuit'),
      location: text('.sxb-berth__name') || text('.sf-mission-tracker .sf-mt-obj'),
    };
  }, missionFingerprint);
}

async function observe(actor, name) {
  receipts.push({ phase: name, observer: await observerReceipt(actor) });
}

async function observerReceipt(actor) {
  return actor.evaluate(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return {
      mode: state?.mode || null,
      onboarding: state?.onboarding ? {
        currentBeat: state.onboarding.currentBeat,
        active: state.onboarding.active,
        finished: state.onboarding.finished,
      } : null,
      playerAlive: !!(player && player.alive),
      visibleObjective: (document.querySelector('.sf-mission-tracker .sf-mt-obj')?.textContent || '').trim(),
      visibleTarget: (document.querySelector('.sf-target__name')?.textContent || '').trim(),
      visibleStation: !!document.querySelector('.sx-dock'),
    };
  });
}

async function screenshot(actor, name) {
  await actor.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: false });
}

async function waitForText(actor, selector, pattern, timeoutMs, label) {
  await actor.waitForFunction(({ selector: sel, source, flags }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 1 && rect.height > 1
      && new RegExp(source, flags).test((el.textContent || '').replace(/\s+/g, ' ').trim());
  }, { selector, source: pattern.source, flags: pattern.flags }, { timeout: timeoutMs })
    .catch((error) => { throw new Error(`Timed out waiting for ${label}: ${error.message}`); });
}

async function visibleTextMatches(actor, selector, pattern) {
  return pattern.test(await visibleText(actor, selector));
}

async function visibleText(actor, selector) {
  return actor.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return '';
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width < 2 || rect.height < 2) return '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }, selector);
}

async function holdKeys(actor, codes, milliseconds) {
  for (const code of codes) await actor.keyboard.down(code);
  try { await actor.waitForTimeout(milliseconds); } finally {
    for (const code of [...codes].reverse()) await actor.keyboard.up(code);
  }
}

async function tapChord(actor, codes) {
  await holdKeys(actor, codes, 120);
}

async function holdMouse(actor, button, milliseconds) {
  await actor.mouse.down({ button });
  try { await actor.waitForTimeout(milliseconds); } finally { await actor.mouse.up({ button }); }
}

async function waitForVisible(actor, selector, timeoutMs, label) {
  await actor.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
  }, selector, { timeout: timeoutMs }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error.message}`);
  });
}

async function clickButton(actor, label) {
  const button = actor.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() <= 0) return false;
  const box = await button.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${label} has a visible public pointer target`);
  await actor.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

async function waitForBootOverlayGone(actor, timeoutMs = START_TIMEOUT_MS) {
  await actor.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return true;
    const style = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') || style.pointerEvents === 'none'
      || style.display === 'none' || style.visibility === 'hidden';
  }, null, { timeout: timeoutMs });
}

function assertNoActorShortcuts() {
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const actorStart = self.indexOf('async function bootToNewGame');
  const observerStart = self.indexOf('async function publicFingerprint');
  const actorSource = self.slice(actorStart, observerStart);
  for (const forbidden of [
    new RegExp('screenManager\\.'), new RegExp('bus\\.emit\\('),
    new RegExp('spawn' + 'Entity\\('), new RegExp('tele' + 'port', 'i'),
  ]) {
    assert.doesNotMatch(actorSource, forbidden,
      `First Shift actor must not use hidden shortcut ${forbidden}; use public DOM/input only`);
  }
}

async function startFreshServer() {
  const port = await findFreePort(8130);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: PLAYER_STORE_DIR },
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before readiness\n${child.probeOutput()}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for First Shift runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const candidate = createNetServer();
    candidate.once('error', () => resolve(false));
    candidate.once('listening', () => candidate.close(() => resolve(true)));
    candidate.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { return (await fetch(url, { method: 'GET' })).ok; } catch (_) { return false; }
}
