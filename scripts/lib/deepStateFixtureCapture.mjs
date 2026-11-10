// Deep-state fixture CAPTURE + RESTORE-PROOF library (packets G02 / G03).
//
// The F13 ladder (scripts/lib/deepStateFixtureLadder.mjs) VALIDATES captured fixtures; nothing in
// the repository could PRODUCE one until this file. A capture is only honest when all four hold:
//
//   1. PUBLIC ROUTE — the save is produced by the G01 pilot core driving the real game with
//      ordinary keyboard/pointer input (runGoldCorridorPublicPilot; injectedState: false). The
//      manifest capturePolicy is explicit: injected setup may diagnose but cannot populate the
//      ladder.
//   2. REAL ARTIFACT — the fixture file is the EXACT byte string the game wrote to
//      localStorage['sf.save.quick'] (the live save envelope), hashed with SHA-256 and bound to
//      the capturing commit.
//   3. RESTORE PROOF — a FRESH browser context is seeded with those exact bytes as its persistence
//      medium (localStorage is where saves live in the browser runtime; seeding it is loading a
//      save file, not injecting gameplay state), and the game itself restores through the public
//      Continue path. The fixture's requiredClaims are then asserted against the RESTORED runtime.
//   4. DURABLE EVIDENCE — artifact + capture receipt + restore receipt live under
//      test/fixtures/deep-state-ladder/ and are meant to be COMMITTED: the ladder validator
//      re-hashes the artifact and requires the receipt file to exist on every checkout, which is
//      only possible for tracked files. (The G02 roadmap row's "ignored artifact" wording predates
//      the validator's design; screenshots/logs stay ignored under .devshots/, the fixture and
//      receipts do not.)
//
// Runtime: browser only. The Electron variant of the pilot does not exist yet (recorded G18/M1
// debt); the ladder's artifactFormat is runtime-agnostic ('spaceface-save').

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  GOLD_CORRIDOR_SAVE_STORAGE_KEY,
  runGoldCorridorPublicPilot,
} from './goldCorridorPublicPilot.mjs';

export const DEEP_STATE_CAPTURE_SCHEMA = 'spaceface.deepStateCapture.v1';
export const DEEP_STATE_RESTORE_SCHEMA = 'spaceface.deepStateRestore.v1';
export const DEEP_STATE_FIXTURE_DIR = 'test/fixtures/deep-state-ladder';

/** Per-fixture route plan: which pilot stop produces the state, and what the claims mean. */
export const CAPTURE_PLANS = Object.freeze({
  'fresh-start': Object.freeze({
    // Title → New Game → Launch → flight armed. The pilot's own save step only runs much later
    // (after first dock), so fresh-start saves explicitly right after launch via public F5.
    pilotStop: 'launch',
    saveAfterStop: true,
    restoreExpectsMode: 'flight',
  }),
  'first-station': Object.freeze({
    // Title → … → first dock → service → F5 save: the pilot's own 'save-written' milestone.
    pilotStop: 'save',
    saveAfterStop: false,
    restoreExpectsMode: 'station',
  }),
});

export function sha256Hex(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** Read the exact save-envelope byte string the game wrote for the pilot slot. */
export async function readSaveEnvelope(page) {
  return page.evaluate(
    (key) => window.localStorage.getItem(key),
    GOLD_CORRIDOR_SAVE_STORAGE_KEY,
  );
}

/** Public manual save: the F5 binding routes through ui/input to bus 'game:save' slot quick. */
export async function publicQuickSave(page, { timeoutMs = 30_000 } = {}) {
  await page.evaluate(() => {
    window.__DEEP_STATE_SAVED__ = false;
    const bus = window.SF && window.SF.bus;
    if (bus && typeof bus.on === 'function') {
      bus.on('save:completed', () => { window.__DEEP_STATE_SAVED__ = true; });
    }
  });
  await page.keyboard.press('F5');
  await page.waitForFunction(
    (key) => window.__DEEP_STATE_SAVED__ === true || !!window.localStorage.getItem(key),
    GOLD_CORRIDOR_SAVE_STORAGE_KEY,
    { timeout: timeoutMs },
  );
}

/** Snapshot the runtime facts the fixture claims speak about (read-only observation). */
export async function readClaimSnapshot(page) {
  return page.evaluate(() => {
    const SF = window.SF || {};
    const state = SF.state || {};
    const player = state.entities && state.entities.get
      ? state.entities.get(state.playerId) : null;
    const playerPresent = !!(player && player.alive !== false);
    const missions = Array.isArray(state.missions && state.missions.active)
      ? state.missions.active.length
      : (Array.isArray(state.missions) ? state.missions.length : 0);
    const dockTabs = document.querySelectorAll('.sx-dock [data-nav]').length;
    const undock = document.querySelector('[data-act="undock"]');
    return {
      mode: state.mode || null,
      hasPlayerEntity: playerPresent,
      playerShipDefId: (player && (player.defId || player.shipDefId
        || (player.data && (player.data.defId || player.data.shipDefId)))) || null,
      pilotName: (state.meta && state.meta.pilotName) || (state.player && state.player.name) || null,
      careers: state.careers ? {
        hasOrigins: !!state.careers.origins,
        hasLadders: !!state.careers.ladders,
      } : null,
      activeMissionCount: missions,
      currentSectorId: (state.world && state.world.currentSectorId) || null,
      docked: !!(state.ui && state.ui.docked),
      dockedStationId: (state.ui && state.ui.dockedStationId) || null,
      dockTabCount: dockTabs,
      undockControlPresent: !!undock,
    };
  });
}

/**
 * Restore proof: seed a FRESH context's persistence medium with the exact artifact bytes, boot the
 * real game, and continue through the PUBLIC menu path. Returns the claim snapshot plus the raw
 * step evidence. The context must have been created with no prior storage.
 */
export async function proveRestore({ context, rootUrl, artifactText, plan, log = () => {} }) {
  await context.addInitScript(({ key, value }) => {
    try {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
    } catch (_) { /* storage unavailable = the boot itself will fail loudly */ }
  }, { key: GOLD_CORRIDOR_SAVE_STORAGE_KEY, value: artifactText });

  const page = await context.newPage();
  const steps = [];
  const step = (name, ok, note = '') => { steps.push({ name, ok, note }); log(`[restore] ${name}: ${ok ? 'ok' : 'FAIL'}${note ? ` — ${note}` : ''}`); };

  await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 90_000 });
  step('boot', true);

  // Dismiss the intro if present, then reach the main menu (same publicly visible path the
  // pilot walks; selectors verified against src/ui/screens/mainMenu.js).
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 60_000 });
  step('menu-visible', true);

  await continueButton.click();
  step('continue-clicked', true);

  // The pilot's proven continue predicate (goldCorridorPublicPilot.mjs:952): either playable
  // mode, player present, not dead.
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return (state?.mode === 'flight' || state?.mode === 'station') && player && player.alive !== false;
  }, null, { timeout: 180_000 });
  step('restored', true, 'playable mode reached');

  if (plan.restoreExpectsMode === 'station') {
    // SHIPPED SAVE SEMANTICS: 'docked' is a documented TRANSIENT entity flag (saveSystem.js
    // TRANSIENT_ENTITY_FLAGS), so a save written while docked deliberately restores to FLIGHT
    // beside the berth — the same behavior the original G01 full-route evidence recorded. The
    // honest reachability proof for the first-station claims is therefore the trivial PUBLIC
    // re-dock: the restored run sits inside prompt range, one E hold re-enters the station, and
    // the claims are then asserted literally against the re-docked runtime.
    const deadline = Date.now() + 90_000;
    let docked = false;
    while (Date.now() < deadline) {
      const snap = await page.evaluate(() => {
        const state = window.SF?.state || {};
        const prompt = document.querySelector('.sf-alert--dock');
        const promptVisible = !!(prompt && prompt.offsetWidth > 0 && prompt.offsetHeight > 0);
        return { docked: !!(state.ui && state.ui.docked), promptVisible };
      });
      if (snap.docked) { docked = true; break; }
      if (snap.promptVisible) {
        await page.keyboard.down('KeyE');
        await page.waitForTimeout(250);
        await page.keyboard.up('KeyE').catch(() => {});
        await page.waitForTimeout(350);
      } else {
        await page.waitForTimeout(300);
      }
    }
    step('re-docked', docked, docked ? 'public E hold' : 'dock prompt never satisfied');
  }

  const snapshot = await readClaimSnapshot(page);
  await page.close();
  return { steps, snapshot };
}

/**
 * Evaluate the fixture's requiredClaims against capture + restore snapshots plus the pilot run
 * facts. Round-3 hardening: no claim may be true by construction — the no-injection claim is
 * DERIVED from the pilot run (milestone evidence + no blocker + real public actions), the
 * objective claim requires the RESTORED runtime (a capture-side fallback would mask restore-side
 * loss), and the ship/career comparisons require non-null identity on both sides.
 */
export function evaluateClaims(fixtureId, captureSnapshot, restoreSnapshot, pilotFacts = {}) {
  const claims = [];
  const claim = (text, ok, evidence) => claims.push({ text, ok: !!ok, evidence });
  if (fixtureId === 'fresh-start') {
    claim('player entity and career-progression state are restorable',
      restoreSnapshot.hasPlayerEntity && !!restoreSnapshot.careers
        && !!captureSnapshot.pilotName
        && restoreSnapshot.pilotName === captureSnapshot.pilotName
        && !!captureSnapshot.playerShipDefId
        && restoreSnapshot.playerShipDefId === captureSnapshot.playerShipDefId
        && JSON.stringify(restoreSnapshot.careers) === JSON.stringify(captureSnapshot.careers),
      {
        restoredPlayer: restoreSnapshot.hasPlayerEntity,
        careers: [captureSnapshot.careers, restoreSnapshot.careers],
        pilotName: [captureSnapshot.pilotName, restoreSnapshot.pilotName],
        ship: [captureSnapshot.playerShipDefId, restoreSnapshot.playerShipDefId],
      });
    claim('starter objective is reachable',
      restoreSnapshot.activeMissionCount >= 1,
      { restoredActiveMissions: restoreSnapshot.activeMissionCount });
    claim('save contains no injected support state',
      pilotFacts.blocker == null
        && Array.isArray(pilotFacts.milestones) && pilotFacts.milestones.includes('run-started')
        && (pilotFacts.publicActionCount || 0) > 0,
      {
        producer: 'runGoldCorridorPublicPilot (static no-injection contract over its own source)',
        milestones: pilotFacts.milestones || [],
        publicActionCount: pilotFacts.publicActionCount || 0,
        blocker: pilotFacts.blocker || null,
      });
  } else if (fixtureId === 'first-station') {
    claim('saved berth remains reachable and re-docks to the same station identity',
      restoreSnapshot.docked && !!captureSnapshot.dockedStationId
        && restoreSnapshot.dockedStationId === captureSnapshot.dockedStationId
        && restoreSnapshot.currentSectorId === captureSnapshot.currentSectorId,
      {
        stationId: [captureSnapshot.dockedStationId, restoreSnapshot.dockedStationId],
        sectorId: [captureSnapshot.currentSectorId, restoreSnapshot.currentSectorId],
        note: 'docked is a shipped TRANSIENT save flag; restore lands beside the berth and one public KeyE hold re-docks',
      });
    claim('station services remain reachable',
      restoreSnapshot.dockTabCount >= 1,
      { dockTabs: restoreSnapshot.dockTabCount });
    claim('undock remains available',
      restoreSnapshot.undockControlPresent,
      { undockControl: restoreSnapshot.undockControlPresent });
  }
  return claims;
}

/**
 * Orchestrate one fixture capture end to end. The caller owns server/browser/page/context
 * lifecycles (driver pattern, mirroring check-gold-corridor-public-pilot.mjs).
 */
export async function captureDeepStateFixture({
  fixtureId,
  page,
  context,
  browser,
  rootUrl,
  root,
  career = 'hauler',
  timeoutScale = 1,
  commit,
  outputDir,
  log = () => {},
}) {
  const plan = CAPTURE_PLANS[fixtureId];
  if (!plan) throw new Error(`no capture plan for fixture '${fixtureId}'`);

  const pilotResult = await runGoldCorridorPublicPilot({
    page,
    outputDir,
    expectedRootUrl: rootUrl,
    career,
    stop: plan.pilotStop,
    timeoutScale,
    log,
  });
  const reached = (pilotResult.milestones || []).map((m) => m.id);
  const stopReached = !pilotResult.classification;
  if (!stopReached) {
    return { ok: false, stage: 'pilot', pilotResult };
  }

  if (plan.saveAfterStop) {
    await publicQuickSave(page);
    log('[capture] public F5 save written');
  }

  const captureSnapshot = await readClaimSnapshot(page);
  const artifactText = await readSaveEnvelope(page);
  if (!artifactText) return { ok: false, stage: 'artifact-missing', pilotResult };
  const artifactSha = sha256Hex(artifactText);

  const artifactRel = `${DEEP_STATE_FIXTURE_DIR}/artifacts/${fixtureId}.spaceface-save.json`;
  const captureReceiptRel = `${DEEP_STATE_FIXTURE_DIR}/receipts/${fixtureId}-capture.json`;
  const restoreReceiptRel = `${DEEP_STATE_FIXTURE_DIR}/receipts/${fixtureId}-restore.json`;
  await mkdir(path.join(root, DEEP_STATE_FIXTURE_DIR, 'artifacts'), { recursive: true });
  await mkdir(path.join(root, DEEP_STATE_FIXTURE_DIR, 'receipts'), { recursive: true });
  await writeFile(path.join(root, artifactRel), artifactText, 'utf8');

  // Restore proof in a genuinely fresh context (new storage, same browser + server).
  const freshContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let restore;
  try {
    restore = await proveRestore({ context: freshContext, rootUrl, artifactText, plan, log });
  } finally {
    await freshContext.close().catch(() => {});
  }

  const claims = evaluateClaims(fixtureId, captureSnapshot, restore.snapshot, {
    milestones: reached,
    publicActionCount: Array.isArray(pilotResult.actions) ? pilotResult.actions.length : 0,
    blocker: pilotResult.classification ? pilotResult.classification.blocker : null,
  });
  const claimsOk = claims.every((c) => c.ok);

  const captureReceipt = {
    schema: DEEP_STATE_CAPTURE_SCHEMA,
    fixtureId,
    commit,
    career,
    pilotStop: plan.pilotStop,
    savedVia: plan.saveAfterStop ? 'public-F5-after-stop' : 'pilot-save-milestone',
    inputSource: 'playwright-keyboard-pointer',
    injectedState: false,
    milestones: reached,
    artifact: artifactRel,
    artifactSha256: artifactSha,
    captureSnapshot,
  };
  const restoreReceipt = {
    schema: DEEP_STATE_RESTORE_SCHEMA,
    fixtureId,
    commit,
    seededKey: GOLD_CORRIDOR_SAVE_STORAGE_KEY,
    restoredThrough: plan.restoreExpectsMode === 'station'
      ? 'public-menu-continue + public-KeyE-redock (docked is a shipped transient flag)'
      : 'public-menu-continue',
    steps: restore.steps,
    restoreSnapshot: restore.snapshot,
    claims,
    claimsOk,
  };
  await writeFile(path.join(root, captureReceiptRel), `${JSON.stringify(captureReceipt, null, 2)}\n`, 'utf8');
  await writeFile(path.join(root, restoreReceiptRel), `${JSON.stringify(restoreReceipt, null, 2)}\n`, 'utf8');

  return {
    ok: claimsOk,
    stage: claimsOk ? 'complete' : 'claims-failed',
    fixtureId,
    artifactRel,
    artifactSha,
    captureReceiptRel,
    restoreReceiptRel,
    claims,
    pilotResult,
    manifestPatch: {
      status: 'captured',
      artifact: artifactRel,
      sha256: artifactSha,
      capture: { commit, publicRouteReceipt: captureReceiptRel, restoreReceipt: restoreReceiptRel },
    },
  };
}
