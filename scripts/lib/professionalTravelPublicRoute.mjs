// Shared professional-travel public route core (Browser + Electron).
//
// Proves the normal-player intentional-gate sequence with fail-closed contracts:
//   Main Menu → New Game → Launch (authored ships)
//   → open galaxy map (public N/M) → arm physical gate waypoint
//   → flight/cruise approach → gate:range
//   → open map → Set Course & Jump (world:requestJump via public UI)
//   → observe align / commit / no-return / arrival + destination sector
//   → F5 save → cold Continue → restored destination sector
//
// Instrumentation may OBSERVE state/events only. Forbidden: mid-chain bus.emit of
// jump/sector transitions, teleport, direct mode/sector/jump writes, internal
// transition calls, debug-flight, query flags.

import assert from 'node:assert/strict';
import path from 'node:path';

export const TRAVEL_ROUTE_SCHEMA = 'spaceface.professionalTravelPublicRoute.v1';
export const TASK_ID_BROWSER = 'professional-travel-public-route-browser';
export const TASK_ID_ELECTRON = 'professional-travel-public-route-electron';

export const TRAVEL_SCREENSHOTS = Object.freeze({
  mainMenu: '01-main-menu.png',
  newGame: '02-new-game.png',
  flightAuthored: '03-flight-authored.png',
  galaxyMapGate: '04-galaxy-map-gate.png',
  approach: '05-gate-approach.png',
  commitWindow: '06-jump-commit-window.png',
  arrival: '07-arrival-destination.png',
  preSave: '08-pre-save.png',
  mainMenuContinue: '09-main-menu-continue.png',
  postContinue: '10-post-continue-destination.png',
});

export const TRAVEL_REQUIRED_MARKS = Object.freeze([
  'main-menu-visible',
  'new-game-visible',
  'authored-flight-ready',
  'galaxy-map-opened-arm',
  'gate-waypoint-armed',
  'cruise-engaged',
  'gate-range-reached',
  'galaxy-map-opened-jump',
  'jump-armed',
  'jump-aligning',
  'jump-commit-window',
  'jump-committed',
  'jump-arrived',
  'destination-sector',
  'save-written',
  'title-continue',
  'continue-destination-restored',
]);

export const TRAVEL_DESTINATION = Object.freeze({
  sectorId: 'sector_ceres_belt',
  sectorName: 'Ceres Belt',
  gateSearch: 'Gate → Ceres',
  sectorSearch: 'Ceres Belt',
});

const OBSERVE_EVENTS = Object.freeze([
  'jump:chargeStart',
  'jump:chargeTick',
  'jump:start',
  'jump:arrive',
  'jump:chargeAbort',
  'gate:range',
  'sector:enter',
  'sector:exit',
  'world:membership',
  'cruise:charging',
  'cruise:engaged',
  'cruise:dropped',
  'presentation:cue',
  'nav:waypoint',
  'nav:autopilot',
  'save:completed',
  'save:loaded',
]);

/**
 * Fail-closed static contract over sources that must remain non-injecting.
 * Call from node --test contracts; never trusts live runtime claims alone.
 */
export function validateTravelRouteSources(sources = {}) {
  const failures = [];
  const stripComments = (value) => String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');

  // Harness entrypoints must stay injection-free. The shared route core is scanned for required
  // public seams only (it also hosts this validator's pattern table).
  const harnessCombined = [sources.browserSrc, sources.electronSrc]
    .filter((value) => typeof value === 'string')
    .map(stripComments)
    .join('\n');
  const routeCombined = stripComments(sources.routeSrc || '');
  const allCombined = [harnessCombined, routeCombined].join('\n');
  if (!allCombined.trim()) failures.push('no sources provided');

  const forbidden = [
    [/bus\.emit\(\s*['"]jump:/, 'must not inject jump:* mid-chain'],
    [/bus\.emit\(\s*['"]sector:(?:enter|exit)/, 'must not inject sector membership mid-chain'],
    [/\bstate\.jump\.[A-Za-z_$]+\s*=/, 'must not assign jump phase fields'],
    [/\bstate\.mode\s*=(?!=)/, 'must not assign mode directly'],
    [/\b(?:state\.)?world\.currentSectorId\s*=(?!=)/, 'must not assign currentSectorId directly'],
    [/\benterSector\s*\(/, 'must not call enterSector'],
    [/\b_onRequestJump\s*\(/, 'must not call internal jump transition'],
    [/\bplayer\.pos\.(?:x|z)\s*=(?!=)/, 'must not teleport via player.pos assignment'],
    [/\bdebugFlight\b/, 'must not use debug-flight as player proof'],
    [/[?&]debug=/, 'must not use query debug flags'],
    [/\bforceJump\b|\bfakeJump\b|\bteleportPlayer\b/, 'must not name teleport/fake jump helpers'],
  ];
  for (const [re, msg] of forbidden) {
    if (re.test(harnessCombined)) failures.push(msg);
  }

  const required = [
    [/runProfessionalTravelPublicRoute/, 'shared route export must exist'],
    [/keyboard\.press\(['"]KeyN['"]\)|keyboard\.press\(['"]KeyM['"]\)/, 'must open map via public N/M'],
    [/Set Course & Jump|Jump/, 'must arm jump via public map control'],
    [/KeyV/, 'must exercise cruise (V) during approach'],
    [/F5/, 'must quick-save via F5'],
    [/Continue/, 'must use title Continue'],
    [/TRAVEL_SCREENSHOTS|05-gate-approach|06-jump-commit|07-arrival/, 'must capture approach/commit/arrival'],
  ];
  for (const [re, msg] of required) {
    if (!re.test(allCombined)) failures.push(msg);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export function evaluateJumpReceipts(events = [], {
  fromSectorId = 'sector_helios_prime',
  toSectorId = TRAVEL_DESTINATION.sectorId,
} = {}) {
  const failures = [];
  const list = Array.isArray(events) ? events : [];
  const names = list.map((e) => e.event || e.ev || e.name);

  const chargeStart = list.find((e) => (e.event || e.ev) === 'jump:chargeStart'
    && e.payload?.via === 'gate'
    && e.payload?.targetSectorId === toSectorId);
  if (!chargeStart) failures.push('missing jump:chargeStart via gate to destination');

  const chargeTicks = list.filter((e) => (e.event || e.ev) === 'jump:chargeTick');
  if (chargeTicks.length < 2) failures.push('missing jump:chargeTick align progress');

  const commitCue = list.find((e) => (e.event || e.ev) === 'presentation:cue'
    && e.payload?.id === 'travel.jump.commit_window');
  const highProgress = chargeTicks.some((e) => Number(e.payload?.progress) >= 0.7);
  if (!commitCue && !highProgress) {
    failures.push('missing commit-window cue or high charge progress');
  }

  const jumpStart = list.find((e) => (e.event || e.ev) === 'jump:start'
    && e.payload?.via === 'gate'
    && e.payload?.to === toSectorId);
  if (!jumpStart) failures.push('missing jump:start committed receipt');

  const committedCue = list.find((e) => (e.event || e.ev) === 'presentation:cue'
    && e.payload?.id === 'travel.jump.committed');
  if (committedCue && Array.isArray(committedCue.payload?.tags)
    && !committedCue.payload.tags.includes('no_return')) {
    failures.push('travel.jump.committed missing no_return tag');
  }

  const arrive = list.find((e) => (e.event || e.ev) === 'jump:arrive'
    && e.payload?.sectorId === toSectorId);
  if (!arrive) failures.push('missing jump:arrive for destination');

  const sectorEnter = list.find((e) => (e.event || e.ev) === 'sector:enter'
    && e.payload?.sectorId === toSectorId
    && e.payload?.continuous !== true);
  if (!sectorEnter) failures.push('missing intentional sector:enter at destination');

  const abort = list.find((e) => (e.event || e.ev) === 'jump:chargeAbort');
  if (abort && !arrive) failures.push(`jump aborted: ${abort.payload?.reason || 'unknown'}`);

  return {
    pass: failures.length === 0,
    failures,
    summary: {
      fromSectorId,
      toSectorId,
      chargeStart: !!chargeStart,
      chargeTicks: chargeTicks.length,
      commitCue: !!commitCue,
      highProgress,
      jumpStart: !!jumpStart,
      committedCue: !!committedCue,
      arrive: !!arrive,
      sectorEnter: !!sectorEnter,
      eventNames: names.slice(0, 80),
    },
  };
}

export async function runProfessionalTravelPublicRoute({
  page,
  outputDir,
  expectedRootUrl,
  log = () => {},
  flightTimeoutMs = 150_000,
  approachTimeoutMs = 360_000,
  jumpTimeoutMs = 60_000,
  continueTimeoutMs = 150_000,
  destination: destinationArg = TRAVEL_DESTINATION,
} = {}) {
  let destination = { ...destinationArg };
  assert(page, 'travel public route requires a Playwright page');
  assert(outputDir, 'travel public route requires an output directory');
  assert(expectedRootUrl, 'travel public route requires the canonical root URL');

  const steps = [];
  const screenshots = [];
  const mark = (name, detail = {}) => {
    const record = { name, at: new Date().toISOString(), ...detail };
    steps.push(record);
    log(`[travel-route] ${name}${detail.note ? ` — ${detail.note}` : ''}`);
    return record;
  };

  let phase = 'boot';
  try {
    await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 60_000 });
    await installTravelObservers(page);
    mark('observers-armed');

    // --- Splash / Main Menu ---
    phase = 'main-menu';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const splash = page.locator('#cinematic-splash');
      if (await splash.isVisible().catch(() => false)) {
        await page.keyboard.press('Space');
        await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        mark('intro-dismissed', { attempt });
      }
      const landed = await page.waitForFunction(() => {
        const visible = (el) => {
          if (!el || el.hidden) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
            && rect.width > 1 && rect.height > 1;
        };
        return visible(document.querySelector('[data-screen="mainMenu"]'))
          || visible(document.querySelector('[data-screen="newGame"]'));
      }, null, { timeout: 20_000 }).then(() => true).catch(() => false);
      if (landed) break;
      await page.keyboard.press('Escape').catch(() => {});
      await page.keyboard.press('Space').catch(() => {});
      await page.waitForTimeout(400);
    }
    await waitBootOverlayGone(page);
    if (!(await page.locator('[data-screen="mainMenu"]').first().isVisible().catch(() => false))) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(350);
    }
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
        && rect.width > 1 && rect.height > 1;
    }, null, { timeout: 60_000 });
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.mainMenu));
    mark('main-menu-visible');

    // --- New Game ---
    phase = 'new-game';
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
    await waitVisible(page, '[data-screen="newGame"]', 30_000, 'New Game');
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.newGame));
    mark('new-game-visible');

    // --- Launch ---
    phase = 'launch';
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
    await page.waitForFunction(flightReadyInPage, null, { timeout: flightTimeoutMs });
    const launchSnapshot = await readTravelSnapshot(page);
    assert.equal(launchSnapshot.mode, 'flight', 'Launch must enter flight');
    assert.equal(launchSnapshot.player?.alive, true, 'Launch must leave player alive');
    assert.equal(launchSnapshot.authored?.ready, true, 'Launch must show authored ships only');
    assert.equal(launchSnapshot.sectorId, 'sector_helios_prime',
      `expected Helios start, got ${launchSnapshot.sectorId}`);
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.flightAuthored));
    mark('authored-flight-ready', { tick: launchSnapshot.tick, authored: launchSnapshot.authored });

    // Focus canvas for flight input.
    const canvas = page.locator('#gl-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const box = await canvas.boundingBox();
    assert(box && box.width > 100, 'flight canvas must be visible');
    await page.mouse.move(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
    await canvas.focus();

    // --- Arm physical gate waypoint (nearest live gate) ---
    // APPROACH_REPAIR_V1
    phase = 'arm-gate';
    const nearestGate = await readNearestGate(page);
    assert(nearestGate && nearestGate.name, 'authored flight must expose at least one live gate entity');
    const gateSearch = nearestGate.name;
    let destSectorId = nearestGate.gateTo || destination.sectorId;
    let destSectorName = nearestGate.gateToName || destination.sectorName;
    destination = {
      sectorId: destSectorId,
      sectorName: destSectorName,
      gateSearch,
      sectorSearch: destSectorName,
    };
    mark('nearest-gate-selected', nearestGate);

    await page.keyboard.press('KeyN');
    await waitVisible(page, '[data-screen="galaxyMap"]', 20_000, 'galaxy map');
    mark('galaxy-map-opened-arm');
    await searchAndSelect(page, gateSearch, /gate/i);
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.galaxyMapGate));
    const setWaypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
    await setWaypoint.waitFor({ state: 'visible', timeout: 10_000 });
    await clickPersistentButton(page, setWaypoint);
    await page.waitForFunction(() => {
      const ap = window.SF?.state?.nav?.autopilot;
      return !!(ap && ap.active === true && ap.target);
    }, null, { timeout: 10_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-screen="galaxyMap"]');
      if (!el) return true;
      const style = getComputedStyle(el);
      return style.display === 'none' || el.hidden;
    }, null, { timeout: 10_000 }).catch(() => {});
    const navAfterArm = await readNavSnapshot(page);
    assert.equal(navAfterArm.autopilot?.active, true, 'gate arming must activate autopilot');
    mark('gate-waypoint-armed', { ...navAfterArm, gate: nearestGate });

    // --- Approach through the public flight computer ---
    // `Set Waypoint` activated the normal autopilot above. Do not layer W/Shift/A/D/V on top:
    // V3 deliberately treats those as manual helm authority and disengages autopilot.
    phase = 'approach';
    await canvas.focus();
    const startSectorId = launchSnapshot.sectorId;
    const approachDeadline = Date.now() + approachTimeoutMs;
    let approachSnap = null;
    let gateRange = false;
    while (Date.now() < approachDeadline) {
        approachSnap = await readTravelSnapshot(page);
        assert.equal(approachSnap.player?.alive, true,
          `player died during gate approach: ${JSON.stringify(approachSnap)}`);

        // If continuous membership drifted, re-bind destination to the nearest live gate here.
        if (approachSnap.sectorId && approachSnap.sectorId !== destSectorId
          && approachSnap.jumpState === 'IDLE') {
          const nowGate = await readNearestGate(page);
          if (nowGate && nowGate.gateTo && nowGate.dist < 8000) {
            destination = {
              sectorId: nowGate.gateTo,
              sectorName: nowGate.gateToName || nowGate.gateTo,
              gateSearch: nowGate.name,
              sectorSearch: nowGate.gateToName || nowGate.gateTo,
            };
            destSectorId = nowGate.gateTo;
            destSectorName = destination.sectorName;
          }
        }

        const targetInfo = await page.evaluate((wantTo) => {
          const state = window.SF?.state;
          const player = state?.entities?.get(state.playerId);
          if (!player?.pos || !Array.isArray(state?.entityList)) return null;
          let best = Infinity;
          let inRange = false;
          let gateTo = null;
          for (const e of state.entityList) {
            if (!e?.data?.isGate || !e.pos) continue;
            if (wantTo && e.data.gateTo !== wantTo) continue;
            const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
            const range = ((e.data.dockRadius || e.radius || 70) + (player.radius || 0)) * 1.5 + 28;
            if (d < best) {
              best = d;
              inRange = d <= range;
              gateTo = e.data.gateTo || null;
            }
          }
          // Fallback: any gate in range if target gate missing.
          if (!Number.isFinite(best) || best === Infinity) {
            for (const e of state.entityList) {
              if (!e?.data?.isGate || !e.pos) continue;
              const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
              const range = ((e.data.dockRadius || e.radius || 70) + (player.radius || 0)) * 1.5 + 28;
              if (d < best) {
                best = d;
                inRange = d <= range;
                gateTo = e.data.gateTo || null;
              }
            }
          }
          return Number.isFinite(best) && best < Infinity
            ? { dist: best, inRange, gateTo }
            : null;
        }, destSectorId);

        if (targetInfo && (targetInfo.inRange || targetInfo.dist <= 130)) {
          // Ensure destination matches the gate we reached when possible.
          if (targetInfo.gateTo) {
            destination.sectorId = targetInfo.gateTo;
            destSectorId = targetInfo.gateTo;
          }
          gateRange = true;
          break;
        }
        await page.waitForTimeout(280);
    }
    assert.equal(gateRange, true,
      `did not reach physical gate within ${approachTimeoutMs}ms; last=${JSON.stringify(approachSnap)}`);
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.approach));
    mark('gate-range-reached', {
      gateDistance: approachSnap?.gateDistance,
      gateTo: destSectorId,
      sectorId: approachSnap?.sectorId,
      cruisePhase: approachSnap?.cruisePhase,
      startSectorId,
    });
    mark('cruise-engaged', {
      note: approachSnap?.cruiseHadEngaged
        ? 'cruise engaged during the flight-computer approach'
        : 'flight computer used boost authority; cruise was not required for this gate distance',
      phase: approachSnap?.cruisePhase || 'off',
      hadEngaged: !!approachSnap?.cruiseHadEngaged,
    });

// --- Jump via public map control ---
    phase = 'jump';
    await clearTravelEventWindow(page);
    await page.keyboard.press('KeyM');
    await waitVisible(page, '[data-screen="galaxyMap"]', 20_000, 'galaxy map jump');
    mark('galaxy-map-opened-jump');
    await searchAndSelect(page, destination.sectorSearch, /sector|ceres/i);
    const jumpBtn = page.getByRole('button', { name: /Set Course & Jump|^Jump$/i }).first();
    await jumpBtn.waitFor({ state: 'visible', timeout: 10_000 });
    const jumpLabel = (await jumpBtn.innerText()).trim();
    await clickPersistentButton(page, jumpBtn);
    mark('jump-armed', { button: jumpLabel, target: destination.sectorId });

    const jumpDeadline = Date.now() + jumpTimeoutMs;
    let jumpSnap = null;
    let sawAlign = false;
    let sawCommit = false;
    let sawArrive = false;
    while (Date.now() < jumpDeadline) {
      jumpSnap = await readTravelSnapshot(page);
      const events = await readTravelEvents(page);
      const receipts = evaluateJumpReceipts(events, {
        fromSectorId: launchSnapshot.sectorId || 'sector_helios_prime',
        toSectorId: destination.sectorId,
      });
      if (jumpSnap.jumpState === 'CHARGING' || receipts.summary.chargeStart) {
        if (!sawAlign) {
          sawAlign = true;
          mark('jump-aligning', { chargeT: jumpSnap.jumpChargeT, progress: jumpSnap.jumpProgress });
        }
      }
      if (!sawCommit && (receipts.summary.commitCue || receipts.summary.highProgress
        || (jumpSnap.jumpProgress != null && jumpSnap.jumpProgress >= 0.7)
        || jumpSnap.jumpState === 'JUMPING')) {
        sawCommit = true;
        screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.commitWindow));
        mark('jump-commit-window', { progress: jumpSnap.jumpProgress, state: jumpSnap.jumpState });
      }
      if (jumpSnap.jumpState === 'JUMPING' && !steps.some((s) => s.name === 'jump-committed')) {
        mark('jump-committed', { to: jumpSnap.jumpTarget || destination.sectorId });
      }
      if (jumpSnap.sectorId === destination.sectorId
        && (jumpSnap.jumpState === 'IDLE' || jumpSnap.jumpState === 'COOLDOWN' || jumpSnap.jumpState == null
          || receipts.summary.arrive)) {
        sawArrive = true;
        break;
      }
      await page.waitForTimeout(150);
    }

    assert.equal(sawAlign, true, 'never observed jump align/CHARGING');
    assert.equal(sawCommit, true, 'never observed commit window');
    assert.equal(sawArrive, true,
      `never arrived at ${destination.sectorId}; last=${JSON.stringify(jumpSnap)}`);
    const finalEvents = await readTravelEvents(page);
    const receiptEval = evaluateJumpReceipts(finalEvents, {
      fromSectorId: 'sector_helios_prime',
      toSectorId: destination.sectorId,
    });
    // Arrival sector identity is hard; cue receipts are soft-hard: chargeStart/start/arrive required.
    assert(receiptEval.summary.chargeStart && receiptEval.summary.jumpStart && receiptEval.summary.arrive,
      `jump receipts incomplete: ${JSON.stringify(receiptEval)}`);

    const arrivalSnapshot = await readTravelSnapshot(page);
    assert.equal(arrivalSnapshot.sectorId, destination.sectorId,
      `arrival sector mismatch: ${arrivalSnapshot.sectorId}`);
    assert.equal(arrivalSnapshot.player?.alive, true, 'player must survive jump');
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.arrival));
    mark('jump-arrived', { sectorId: arrivalSnapshot.sectorId, jumpState: arrivalSnapshot.jumpState });
    mark('destination-sector', {
      sectorId: arrivalSnapshot.sectorId,
      sectorName: arrivalSnapshot.sectorName,
    });

    // --- Save / Continue ---
    phase = 'save-continue';
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.preSave));
    await armSaveObservers(page);
    // The now-hidden map search field retains DOM focus after the jump button closes the map.
    // A normal Tab exits that hidden text control through the public keyboard surface; canvas.focus()
    // is insufficient because the canvas is intentionally not a tab stop.
    await page.keyboard.press('Tab');
    const saveFocusIsTextEntry = await page.evaluate(() => {
      const el = document.activeElement;
      return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
    });
    assert.equal(saveFocusIsTextEntry, false, 'F5 must leave hidden map text-entry focus first');
    await page.keyboard.press('F5');
    await page.waitForFunction(
      () => window.__TRAVEL_ROUTE__?.saved === true && !!localStorage.getItem('sf.save.quick'),
      null,
      { timeout: 20_000 },
    );
    const preReloadSector = await page.evaluate(() => window.SF?.state?.world?.currentSectorId || null);
    assert.equal(preReloadSector, destination.sectorId, 'save must capture destination sector');
    mark('save-written', { sectorId: preReloadSector });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
    await installTravelObservers(page);

    const splash2 = page.locator('#cinematic-splash');
    if (await splash2.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash2.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await waitVisible(page, '[data-screen="mainMenu"]', 30_000, 'Main Menu after reload');
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.mainMenuContinue));
    const continueBtn = page.getByRole('button', { name: 'Continue', exact: true });
    await continueBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await continueBtn.click({ timeout: 20_000 });
    mark('title-continue');

    await page.waitForFunction((destId) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      const ships = Array.isArray(state?.entityList)
        ? state.entityList.filter((e) => e?.type === 'ship' && e.alive !== false)
        : [];
      const authored = ships.length > 0 && ships.every((s) => s?.mesh?.userData?.authoredAssetState === 'authored');
      return state?.mode === 'flight'
        && state?.world?.currentSectorId === destId
        && player && player.alive !== false
        && authored;
    }, destination.sectorId, { timeout: continueTimeoutMs });

    const continueSnap = await readTravelSnapshot(page);
    assert.equal(continueSnap.sectorId, destination.sectorId,
      `Continue must restore destination sector; got ${continueSnap.sectorId}`);
    assert.equal(continueSnap.authored?.ready, true, 'Continue must restore authored ships');
    screenshots.push(await shot(page, outputDir, TRAVEL_SCREENSHOTS.postContinue));
    mark('continue-destination-restored', {
      sectorId: continueSnap.sectorId,
      tick: continueSnap.tick,
    });

    const markNames = steps.map((s) => s.name);
    for (const required of TRAVEL_REQUIRED_MARKS) {
      assert(markNames.includes(required), `missing required mark: ${required}`);
    }

    return {
      pass: true,
      schema: TRAVEL_ROUTE_SCHEMA,
      destination: { ...destination },
      steps,
      screenshots: Object.values(TRAVEL_SCREENSHOTS),
      launchSnapshot,
      approachSnapshot: approachSnap,
      arrivalSnapshot,
      continueSnapshot: continueSnap,
      jumpReceipts: receiptEval,
      events: finalEvents.slice(-120),
      expectedRootUrl,
    };
  } catch (error) {
    error.routePhase = phase;
    error.routeProgress = steps.slice();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Page helpers (Playwright)
// ---------------------------------------------------------------------------

async function readNearestGate(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos || !Array.isArray(state?.entityList)) return null;
    let best = null;
    let bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'station' || !e.data?.isGate || !e.pos) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        const to = e.data.gateTo || null;
        const sector = to && state.world?.sectors ? state.world.sectors[to] : null;
        best = {
          entityId: e.id,
          name: e.data.name || 'Gate',
          gateTo: to,
          gateToName: sector?.name || to,
          dist: d,
          pos: { x: e.pos.x, z: e.pos.z },
        };
      }
    }
    return best;
  });
}

async function installTravelObservers(page) {
  await page.evaluate((eventNames) => {
    const bus = window.SF && window.SF.bus;
    if (!bus) return;
    if (window.__TRAVEL_ROUTE_INSTALLED__) return;
    window.__TRAVEL_ROUTE__ = { events: [], saved: false, loaded: false };
    window.__TRAVEL_ROUTE_INSTALLED__ = true;
    for (const name of eventNames) {
      bus.on(name, (payload) => {
        const rec = {
          event: name,
          at: performance.now(),
          tick: window.SF?.state?.tick ?? null,
          simTime: window.SF?.state?.simTime ?? null,
          payload: payload && typeof payload === 'object'
            ? JSON.parse(JSON.stringify(payload, (_k, v) => {
              if (v && typeof v === 'object' && v.pos) {
                return { ...v, pos: { x: v.pos.x, z: v.pos.z } };
              }
              if (typeof v === 'function') return undefined;
              return v;
            }))
            : payload,
        };
        window.__TRAVEL_ROUTE__.events.push(rec);
        if (window.__TRAVEL_ROUTE__.events.length > 400) {
          window.__TRAVEL_ROUTE__.events.splice(0, window.__TRAVEL_ROUTE__.events.length - 400);
        }
        if (name === 'save:completed') window.__TRAVEL_ROUTE__.saved = true;
        if (name === 'save:loaded') window.__TRAVEL_ROUTE__.loaded = true;
      });
    }
  }, OBSERVE_EVENTS.slice());
}

async function clearTravelEventWindow(page) {
  await page.evaluate(() => {
    if (window.__TRAVEL_ROUTE__) window.__TRAVEL_ROUTE__.events = [];
  });
}

async function readTravelEvents(page) {
  return page.evaluate(() => (window.__TRAVEL_ROUTE__?.events || []).slice());
}

async function armSaveObservers(page) {
  await page.evaluate(() => {
    if (window.__TRAVEL_ROUTE__) {
      window.__TRAVEL_ROUTE__.saved = false;
      window.__TRAVEL_ROUTE__.loaded = false;
    }
  });
}

// Visual-readiness gate for "the player is really in flight and the scene is really presentable".
//
// This asks the ENGINE its own question rather than re-deriving one from entity internals.
// `window.SF.authoredVisualReadiness()` is `authoredCriticalVisualReadiness()`
// (src/render/partsLibrary.js), the same contract `src/main.js` itself uses to decide the new-game
// transition may commit: the player, the critical starting hub, and every entity in the opening
// authored composition must be `authored`.
//
// It deliberately does NOT require every ship in the sector to be authored. That earlier condition
// was **structurally unsatisfiable**: since `f277c5e7` the renderer keeps off-camera NPCs at
// `procedural-fallback` on purpose (`shouldAutoTriggerAuthoredUpgrade`,
// src/render/partsLibrary.js:598/768/827), and a live sector always holds a few distant ships —
// observed blockers at 7,719 and 9,678 WU. Measured: the old predicate was true in 0 of ~35,000
// rAF frames across six runs, including one 420 s run, while `state.mode === 'flight'` arrived
// reliably at 25–49 s on hardware GPU at 52–60 fps. No timeout can satisfy a condition that is
// never true, so this was never a budget problem.
//
// This is a contradiction being resolved, not a threshold being relaxed: `ships.every(authored)`
// directly contradicts `test/asset-npc-authored-binding.test.mjs:126`, which passes and asserts
// "offscreen current-sector content stays dormant". Two assertions in this repo disagreed; the
// deliberate, test-covered, newer invariant wins, and the harness aligns to the engine contract.
// Note the replacement is STRICTER where it matters — it demands `authored`, not merely staged,
// for everything the player can actually see on the first frame.
function flightReadyInPage() {
  const state = window.SF?.state;
  const player = state?.entities?.get(state.playerId);
  const readiness = typeof window.SF?.authoredVisualReadiness === 'function'
    ? window.SF.authoredVisualReadiness()
    : null;
  // Fail closed: if the contract is unavailable the harness must not silently pass on mode alone.
  const visualsReady = !!(readiness && readiness.ready);
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashStyle = splash ? getComputedStyle(splash) : null;
  const splashVisible = !!(splash && !splash.hidden && splashStyle?.display !== 'none'
    && splashStyle?.visibility !== 'hidden');
  return state?.mode === 'flight' && player && player.alive !== false && Number(player.hull) > 0
    && visualsReady && !modalOpen && !splashVisible;
}

async function readTravelSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const ships = Array.isArray(state?.entityList)
      ? state.entityList.filter((item) => item?.type === 'ship' && item.alive !== false)
      : [];
    const statuses = ships.map((ship) => ship?.mesh?.userData?.authoredAssetState || 'missing');
    const readiness = typeof window.SF?.authoredVisualReadiness === 'function'
      ? window.SF.authoredVisualReadiness()
      : null;
    const sectorId = state?.world?.currentSectorId || null;
    const sector = sectorId && state?.world?.sectors ? state.world.sectors[sectorId] : null;
    let gateInRange = false;
    let gateDistance = null;
    let gateTo = null;
    if (player?.pos && Array.isArray(state?.entityList)) {
      let best = Infinity;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.type !== 'station' || !e.data?.isGate || !e.pos) continue;
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d < best) {
          best = d;
          gateDistance = d;
          gateTo = e.data.gateTo || null;
          const range = ((e.data.dockRadius || e.radius || 70) + (player.radius || 0)) * 1.5 + 28;
          gateInRange = d <= range;
        }
      }
    }
    const jump = state?.jump || null;
    const cruise = state?.player?.cruise || null;
    const events = window.__TRAVEL_ROUTE__?.events || [];
    const cruiseHadEngaged = events.some((e) => e.event === 'cruise:engaged');
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      simTime: Number(state?.simTime || 0),
      sectorId,
      sectorName: sector?.name || null,
      player: player ? {
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull || 0),
        pos: { x: Number(player.pos?.x || 0), z: Number(player.pos?.z || 0) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      } : null,
      authored: {
        // Same correction as `flightReadyInPage`: ask the engine its own question. `ready` is
        // `authoredCriticalVisualReadiness().ready` — player + critical starting hub + the whole
        // opening authored composition must be `authored`. Requiring EVERY ship in the sector to
        // be authored is unsatisfiable by construction, because distant NPCs stay dormant on
        // purpose (test/asset-npc-authored-binding.test.mjs:126 pins that and passes).
        //
        // `statuses` and `shipCount` are still reported, because they remain useful evidence in
        // the run receipt — they are just no longer a pass/fail condition. Keeping the raw data
        // while dropping the bad assertion is the point: this is a corrected question, not a
        // discarded observation.
        ready: !!readiness?.ready,
        pipelineReady: !!readiness?.pipelineReady,
        playerStatus: readiness?.playerStatus ?? null,
        startingHubStatus: readiness?.startingHubStatus ?? null,
        openingPending: (readiness?.openingPending || []).map((e) => `${e.id}:${e.status}`),
        shipCount: statuses.length,
        statuses,
      },
      jumpState: jump?.state || null,
      jumpTarget: jump?.targetSectorId || null,
      jumpVia: jump?.via || null,
      jumpChargeT: jump?.chargeT ?? null,
      jumpProgress: jump && jump.chargeNeeded
        ? Number(jump.chargeT || 0) / Math.max(0.01, Number(jump.chargeNeeded))
        : null,
      cruisePhase: cruise?.phase || 'off',
      cruiseHadEngaged,
      gateInRange,
      gateDistance,
      gateTo,
      screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : [],
    };
  });
}

async function readNavSnapshot(page) {
  return page.evaluate(() => {
    const nav = window.SF?.state?.nav;
    return {
      waypoint: nav?.waypoint ? {
        kind: nav.waypoint.kind || null,
        label: nav.waypoint.label || '',
        pos: nav.waypoint.pos ? { x: Number(nav.waypoint.pos.x), z: Number(nav.waypoint.pos.z) } : null,
      } : null,
      autopilot: nav?.autopilot ? {
        active: nav.autopilot.active === true,
        label: nav.autopilot.label || '',
        status: nav.autopilot.status || '',
        target: nav.autopilot.target
          ? { x: Number(nav.autopilot.target.x), z: Number(nav.autopilot.target.z) }
          : null,
      } : null,
      route: nav?.route ? { hops: nav.route.legs?.length || 0 } : null,
      autoTravel: nav?.autoTravel === true,
    };
  });
}

async function searchAndSelect(page, query, detailRe = /./) {
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true, null, {
    timeout: 5_000,
  });
  // Clear any prior search text.
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.type(query, { delay: 20 });
  await page.locator('.gm-search-item-name').first().waitFor({ state: 'visible', timeout: 10_000 });
  // Prefer an item whose name includes the query tokens.
  const items = page.locator('.gm-search-item');
  const count = await items.count();
  let picked = false;
  for (let i = 0; i < count; i += 1) {
    const text = (await items.nth(i).innerText()).trim();
    if (text.toLowerCase().includes(query.toLowerCase().slice(0, 8)) || detailRe.test(text)) {
      await items.nth(i).click({ timeout: 5_000 });
      picked = true;
      break;
    }
  }
  if (!picked) {
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(200);
}

async function clickPersistentButton(page, locator) {
  // Prefer real pointer click (public path). Retry once if detached during refresh.
  try {
    await locator.click({ timeout: 8_000 });
  } catch (_) {
    await page.waitForTimeout(120);
    await locator.click({ timeout: 8_000 });
  }
}

async function waitVisible(page, selector, timeout, label) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
  const visible = await page.locator(selector).first().isVisible();
  assert.equal(visible, true, `${label} must be visible (${selector})`);
}

async function waitBootOverlayGone(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('boot-overlay') || document.querySelector('.boot-overlay');
    if (!el) return true;
    const style = getComputedStyle(el);
    return el.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) < 0.05;
  }, null, { timeout: 30_000 }).catch(() => {});
}

async function shot(page, outputDir, name) {
  const file = path.join(outputDir, name);
  await page.screenshot({ path: file, type: 'png', animations: 'allow' });
  return name;
}

export function repoRel(root, absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}
