import assert from 'node:assert/strict';
import path from 'node:path';

import {
  classifyHardwareGpu,
  inspectCanonicalRootUrl,
  validateComputedUndockRoleProofs,
  validateFinalStationFrameSuffix,
} from './alphaLiveBaselineContracts.mjs';

export {
  evaluateCanonicalUrlAcceptance,
  inspectCanonicalRootUrl,
} from './alphaLiveBaselineContracts.mjs';

const SCREENSHOTS = Object.freeze({
  mainMenu: '01-main-menu.png',
  newGame: '02-new-game.png',
  flightAfterInput: '03-flight-after-input.png',
  galaxyMap: '04-galaxy-map.png',
  dockPrompt: '05-dock-prompt.png',
  stationHub: '06-station-hub.png',
});

export async function runBrowserPublicRoute({
  page,
  outputDir,
  expectedRootUrl,
  log = () => {},
  flightTimeoutMs = 150_000,
  dockTimeoutMs = 90_000,
  skipStationHubAcceptance = false,
  seed = null,
  onAuthoredFlightReady = null,
} = {}) {
  assert(page, 'public-route runner requires a Playwright page');
  assert(outputDir, 'public-route runner requires a guarded output directory');
  assert(expectedRootUrl, 'public-route runner requires the originally requested canonical root URL');
  assert(onAuthoredFlightReady == null || typeof onAuthoredFlightReady === 'function',
    'public-route authored-flight hook must be a function when provided');

  const steps = [];
  const urlChecks = [];
  const sampler = startReadOnlyPerformanceSampler(page);
  let phase = 'boot';
  try {
    const mark = (name, detail = {}) => {
      detail = detail || {};
      const record = { name, at: new Date().toISOString(), ...detail };
      steps.push(record);
      log(`[route] ${name}${detail.note ? ` - ${detail.note}` : ''}`);
      return record;
    };
    const recordCanonicalUrl = (boundary) => {
      const check = { boundary, ...inspectCanonicalRootUrl(page.url(), expectedRootUrl) };
      urlChecks.push(check);
      assert.deepEqual(check.failures, [], `${boundary} left the canonical root: ${JSON.stringify(check)}`);
      return check;
    };

    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 30_000 });
    recordCanonicalUrl('boot-ready');

    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5_000 });
      mark('intro-dismissed', { note: 'visible cinematic dismissed with Space' });
    } else {
      mark('intro-not-shown', { note: 'fresh route reached the menu without a visible cinematic' });
    }

    phase = 'main-menu';
    await page.waitForFunction(() => {
      const visible = (element) => {
        if (!element || element.hidden) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
          && rect.width > 1 && rect.height > 1;
      };
      return visible(document.querySelector('[data-screen="mainMenu"]'))
        || visible(document.querySelector('[data-screen="newGame"]'));
    }, null, { timeout: 30_000 });
    const titleLanding = await readTitleLanding(page);
    assert.equal(
      titleLanding.mainMenuVisible,
      true,
      `intro dismissal must land on Main Menu before New Game; title landing=${JSON.stringify(titleLanding)}`,
    );
    assert.equal(titleLanding.newGameVisible, false,
      `intro dismissal must not activate New Game; title landing=${JSON.stringify(titleLanding)}`);
    await waitForVisible(page, '[data-screen="mainMenu"]', 30_000, 'Main Menu');
    await waitForBootOverlayGone(page);
    await screenshot(page, outputDir, SCREENSHOTS.mainMenu);
    mark('main-menu-visible');
    recordCanonicalUrl('main-menu');

    phase = 'new-game';
    const newGameButton = page.getByRole('button', { name: 'New Game', exact: true });
    await newGameButton.click({ timeout: 30_000 });
    await waitForVisible(page, '[data-screen="newGame"]', 30_000, 'New Game');
    if (seed != null) {
      assert(Number.isSafeInteger(Number(seed)) && Number(seed) > 0, 'public-route seed must be a positive safe integer');
      const seedInput = page.locator('#sf-ng-seed');
      await seedInput.fill(String(seed));
      assert.equal(await seedInput.inputValue(), String(seed), 'public route must enter the broker-fixed universe seed');
    }
    await screenshot(page, outputDir, SCREENSHOTS.newGame);
    mark('new-game-visible', seed == null ? {} : { seed: Number(seed) });
    recordCanonicalUrl('new-game');

    phase = 'launch';
    const launchButton = page.getByRole('button', { name: 'Launch', exact: true });
    await launchButton.click({ timeout: 30_000 });
    await page.waitForFunction(flightReadyInPage, null, { timeout: flightTimeoutMs });
    const launchSnapshot = await readFlightSnapshot(page);
    assert.equal(launchSnapshot.mode, 'flight', 'Launch must enter flight');
    assert.equal(launchSnapshot.player?.alive, true, 'Launch must leave the player alive');
    assert.equal(launchSnapshot.authored?.ready, true, 'Launch must display authored ship visuals only');
    assert.equal(launchSnapshot.modalOpen, false, 'Launch must leave no modal screen open');
    assert.equal(launchSnapshot.firstRunSplashVisible, false, 'Launch must leave no first-run splash visible');
    mark('authored-flight-ready', { tick: launchSnapshot.tick, authored: launchSnapshot.authored });
    recordCanonicalUrl('authored-flight-ready');
    if (onAuthoredFlightReady) {
      await onAuthoredFlightReady({ page, launchSnapshot });
    }

    phase = 'flight-input';
    const canvas = page.locator('#gl-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const canvasBox = await canvas.boundingBox();
    assert(canvasBox && canvasBox.width > 100 && canvasBox.height > 100, 'flight canvas must have a visible pointer target');
    await page.mouse.move(
      Math.round(canvasBox.x + canvasBox.width * 0.58),
      Math.round(canvasBox.y + canvasBox.height * 0.46),
    );
    await canvas.focus();

    // Authored readiness no longer implies the hull has settled: readiness can resolve within a
    // few ticks of launch while berth placement/depenetration is still writing player.pos
    // (velocity stays ~0 through positional correction, so a speed check alone passes mid-slide).
    // Gate the released baseline on a hull that is both slow and positionally stable across a
    // sim-time window; otherwise the powered window must out-displace launch drift, which is a
    // property of when readiness resolved, not of keyboard causality.
    const waitForSettledAnchor = () => page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      if (!player || player.alive === false) return false;
      const speed = Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0));
      const x = Number(player.pos?.x || 0);
      const z = Number(player.pos?.z || 0);
      const simNow = Number(state.simTime || 0);
      const probe = window.__SF_FLIGHT_SETTLE__ || (window.__SF_FLIGHT_SETTLE__ = { x: null, z: null, simTime: -1 });
      if (probe.x == null || Math.hypot(x - probe.x, z - probe.z) > 0.25 || speed > 0.5) {
        probe.x = x; probe.z = z; probe.simTime = simNow;
        return false;
      }
      return simNow - probe.simTime >= 0.75 ? { x, z } : false;
    }, null, { timeout: 30_000, polling: 100 }).then((handle) => handle.jsonValue());

    // The baseline sample must itself be settle-confirmed: a positional correction that starts
    // between the gate and the read would land inside the measured window unobserved. Verify the
    // snapshot still sits at the settled anchor; if the hull moved, re-anchor and wait again.
    let settledCandidate = null;
    for (let attempt = 0; attempt < 8 && !settledCandidate; attempt++) {
      const anchor = await waitForSettledAnchor();
      await page.waitForTimeout(250);
      const candidate = await readFlightSnapshot(page);
      const drift = Math.hypot(
        Number(candidate.player?.pos?.x || 0) - anchor.x,
        Number(candidate.player?.pos?.z || 0) - anchor.z,
      );
      if (drift <= 0.5 && Number(candidate.player?.speed || 0) <= 0.5) settledCandidate = candidate;
    }
    const baselineStart = settledCandidate;
    assert(baselineStart, 'released baseline never observed a settled hull');
    await page.waitForTimeout(500);
    const baselineEnd = await readFlightSnapshot(page);
    let wHeld = null;
    let boostHeld = null;
    try {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(500);
      wHeld = await readFlightSnapshot(page);
      await page.keyboard.down('Shift');
      await page.waitForTimeout(400);
      boostHeld = await readFlightSnapshot(page);
    } finally {
      await page.keyboard.up('Shift').catch(() => {});
      await page.keyboard.up('KeyW').catch(() => {});
    }
    // Shader admission can briefly occupy the page immediately after launch. Wait for the public
    // keyup events to reach a later fixed tick instead of sampling the still-held fields in the
    // same blocked frame. This remains a player-input proof; it does not write input or sim state.
    await page.waitForFunction((heldTick) => {
      const state = window.SF?.state;
      return Number(state?.tick || 0) > heldTick
        && Math.abs(Number(state?.input?.moveZ || 0)) < 0.02
        && state?.input?.boost !== true;
    }, Number(boostHeld?.tick || 0), { timeout: 30_000 });
    const released = await readFlightSnapshot(page);
    const flightInputCausality = evaluateFlightInputCausality({
      baselineStart,
      baselineEnd,
      wHeld,
      boostHeld,
      released,
    });
    assert.deepEqual(flightInputCausality.failures, [],
      `ordinary keyboard flight input did not prove causal response: ${JSON.stringify(flightInputCausality)}`);
    const flightInput = {
      baselineStart,
      baselineEnd,
      wHeld,
      boostHeld,
      released,
      causality: flightInputCausality,
    };
    await screenshot(page, outputDir, SCREENSHOTS.flightAfterInput);
    mark('ordinary-flight-input', {
      baselineStart: compactFlight(baselineStart),
      baselineEnd: compactFlight(baselineEnd),
      wHeld: compactFlight(wHeld),
      boostHeld: compactFlight(boostHeld),
      released: compactFlight(released),
      causality: flightInputCausality.metrics,
    });
    recordCanonicalUrl('ordinary-flight-input');

    phase = 'galaxy-map';
    await page.keyboard.press('KeyN');
    // The flagship map mounts directly onto the cached ScreenManager element and promotes that
    // element to the stable #sf-galaxymap surface. Playwright can report the generic cached-screen
    // wrapper as hidden while the fixed map surface is visibly painting; bind acceptance to the
    // player-facing surface that owns the canvas, controls, and accessibility tree.
    await waitForVisible(page, '#sf-galaxymap', 20_000, 'galaxy map');
    await screenshot(page, outputDir, SCREENSHOTS.galaxyMap);
    mark('galaxy-map-visible');
    recordCanonicalUrl('galaxy-map');

    // The Helios waypoint arm is a reusable public-map flow: the approach below re-arms
    // through the same UI when a corridor-brake pulse strands the ship outside assist reach.
    const armHeliosWaypoint = async (markName) => {
      if (!(await page.locator('#sf-galaxymap').isVisible().catch(() => false))) {
        await page.keyboard.press('KeyN');
      }
      await waitForVisible(page, '#sf-galaxymap', 20_000, 'galaxy map');
      const searchInput = page.locator('.gm-search-input');
      await page.keyboard.press('/');
      const shortcutFocused = await page.waitForFunction(
        () => document.activeElement?.matches('.gm-search-input') === true,
        null,
        { timeout: 1_000 },
      ).then(() => true, () => false);
      if (!shortcutFocused) await searchInput.click({ timeout: 10_000 });
      await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true, null, { timeout: 5_000 });
      await page.keyboard.type('Helios Station');
      await page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first().waitFor({ state: 'visible', timeout: 10_000 });
      await page.keyboard.press('Enter');
      const setWaypointButton = page.getByRole('button', { name: 'Set Waypoint', exact: true });
      await setWaypointButton.waitFor({ state: 'visible', timeout: 10_000 });
      const inspectorText = await page.locator('.gm-inspector-content').innerText();
      assert.match(inspectorText, /Helios Station/i, 'map inspector must visibly identify Helios Station');
      await clickWaypointWithPointer(page, setWaypointButton);
      const navSnapshot = await readNavigationSnapshot(page);
      mark(markName, navSnapshot);
      recordCanonicalUrl(markName);
      return navSnapshot;
    };
    const navSnapshot = await armHeliosWaypoint('helios-waypoint-armed');

    phase = 'autopilot-dock-approach';
    const dockPrompt = page.locator('.sf-alert--dock');
    const dockDeadline = Date.now() + dockTimeoutMs;
    let approachSnapshot = null;
    // An autopilot can hold a fast hull in a tangential limit cycle inside the capture volume —
    // inside the corridor but over the berth speed gate, so the prompt never shows. A pilot
    // whose autopilot can't park takes the brake: pulse the public binding once (it disengages
    // the autopilot) and let the capture assist finish the berth.
    let corridorBrakePulsed = false;
    let reArms = 0;
    let strandIterations = 0;
    while (Date.now() < dockDeadline) {
      approachSnapshot = await readApproachSnapshot(page);
      if (approachSnapshot.playerAlive !== true) {
        // The combat/law observer is installed before the baseline route starts (when present),
        // so an approach death can name its killer instead of arriving as a bare hull:0.
        const observer = await page.evaluate(() => {
          const obs = window.__M3_DAMAGE_OBSERVER__;
          if (!obs) return null;
          return {
            playerHits: (obs.playerHits || []).slice(-8),
            deaths: (obs.deaths || []).slice(-3),
            lawIncidents: (obs.lawIncidents || []).slice(-6),
            outgoingHits: (obs.outgoingHits || []).length,
          };
        }).catch(() => null);
        assert.fail(`player died during public autopilot approach: ${JSON.stringify(approachSnapshot)} observer=${JSON.stringify(observer)}`);
      }
      if (await dockPrompt.isVisible().catch(() => false)) break;
      if (!corridorBrakePulsed && approachSnapshot.autopilot?.active === true
        && approachSnapshot.corridor?.inCapture === true && Number(approachSnapshot.speed) > 26) {
        corridorBrakePulsed = true;
        mark('dock-corridor-brake', approachSnapshot);
        try {
          await page.keyboard.down('Digit0');
          await page.waitForTimeout(900);
        } finally {
          await page.keyboard.up('Digit0').catch(() => {});
        }
      }
      // A ship parked in 'approach' space with the autopilot disengaged is stranded whether
      // the brake pulse caused it or the autopilot simply 'arrived' short of the berth:
      // manual, slow, and well outside the berth envelope with no prompt coming. A pilot
      // re-engages through the same public map flow (bounded: the deadline still applies).
      const stranded = approachSnapshot.autopilot?.active !== true
        && approachSnapshot.corridor?.phase === 'approach'
        && Number(approachSnapshot.corridor?.distToBerth || 0) > 90;
      if (stranded) strandIterations += 1; else strandIterations = 0;
      if (strandIterations > 80 && reArms < 2) {
        reArms += 1;
        strandIterations = 0;
        await armHeliosWaypoint('helios-waypoint-rearmed');
      }
      await page.waitForTimeout(250);
    }
    assert.equal(await dockPrompt.isVisible().catch(() => false), true,
      `public autopilot did not reach a physical dock prompt within ${dockTimeoutMs} ms; last=${JSON.stringify(approachSnapshot)}`);
    const dockPromptText = (await dockPrompt.innerText()).trim();
    assert.match(dockPromptText, /\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i,
      `physical dock prompt must expose the public E binding, got ${JSON.stringify(dockPromptText)}`);
    phase = 'dock-input';
    await canvas.focus();
    // The prompt gates on berth proximity AND a speed gate (Helios: 20 wu / 12 wu·s⁻¹); an
    // autopilot still driving carries the ship back out of the envelope between the prompt
    // check and the key tap — the screenshot readback alone stalls rAF for seconds on an iGPU.
    // A docking player's own brake is the public disengage: pulse it to shed approach speed,
    // then release so the corridor's capture assist (suppressed while any input is held) can
    // pull an edge-parked ship back onto the berth. Brake to a VERIFIED near-stop before the
    // screenshot: on a throttled box one 900 ms pulse leaves residual velocity, and the
    // multi-second readback stall then advances the sim far enough to drift the ship clean
    // out of the capture volume.
    for (let brakePulses = 0; brakePulses < 6; brakePulses += 1) {
      const settle = brakePulses === 0 ? null : await readApproachSnapshot(page).catch(() => null);
      if (settle && Number(settle.speed) <= 2 && settle.autopilot?.active !== true) break;
      try {
        await page.keyboard.down('Digit0');
        await page.waitForTimeout(600);
      } finally {
        await page.keyboard.up('Digit0').catch(() => {});
      }
    }
    await screenshot(page, outputDir, SCREENSHOTS.dockPrompt);
    mark('physical-dock-prompt', { text: dockPromptText, approach: approachSnapshot });
    recordCanonicalUrl('physical-dock-prompt');

    // Hold the public binding across several fixed sim ticks immediately while the prompt is
    // known visible. A zero-duration press can be missed, and waiting to retry lets the active
    // autopilot carry the ship back out of the interaction envelope.
    //
    // E is DUAL-USE: it confirms the dock prompt while visible, but it is flight
    // strafe-right otherwise (src/systems/input.js). Every E-hold below is gated on a fresh
    // prompt-visible read — holding it blind strafes the ship out of the berth envelope,
    // which is exactly the fly-away an ungated retry loop produces and then reports.
    let quickDocked = false;
    if (await dockPrompt.isVisible().catch(() => false)) {
      try {
        await page.keyboard.down('KeyE');
        await page.waitForTimeout(250);
      } finally {
        await page.keyboard.up('KeyE').catch(() => {});
      }
      quickDocked = await page.waitForFunction(() => window.SF?.state?.ui?.docked === true,
        null, { timeout: 1_000 }).then(() => true, () => false);
    }
    if (!quickDocked) {
      // A zero-duration synthetic press can fall entirely between headed-browser fixed sim ticks.
      // Retry while the public prompt remains visible, as a player would while the autopilot
      // finishes braking inside the interaction envelope. The E-hold only fires while a fresh
      // poll sees the prompt; a lost prompt brakes (Digit0) instead so the corridor capture
      // assist can pull the ship back on — E without the prompt is strafe-right.
      const attempts = [];
      let lastObservation = null;
      let reDockArms = 0;
      let deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await dockPrompt.isVisible().catch(() => false)) {
          try {
            await page.keyboard.down('KeyE');
            await page.waitForTimeout(250);
          } finally {
            await page.keyboard.up('KeyE').catch(() => {});
          }
        } else {
          // Prompt lost mid-dock: hold nothing. Kill drift with the single-purpose brake,
          // then release all input so the corridor capture assist can pull the ship back
          // onto the berth. A ship that has drifted clean out of the capture volume cannot
          // be braked back onto the berth — a pilot re-engages the public waypoint and lets
          // the autopilot fly the corridor in again (bounded; the deadline still applies).
          const farFromBerth = lastObservation
            && lastObservation.dockPromptVisible === false
            && lastObservation.corridorPhase === 'approach'
            && Number(lastObservation.distToBerth || 0) > 90;
          if (lastObservation?.autopilot?.active === true) {
            // A re-approach is already flying — hold nothing and let it park.
          } else if (farFromBerth && reDockArms < 2) {
            reDockArms += 1;
            mark('dock-reapproach-arm', lastObservation);
            await armHeliosWaypoint('helios-waypoint-redock');
            deadline = Date.now() + 120_000;
          } else {
            mark('dock-prompt-recover', await readApproachSnapshot(page).catch(() => null));
            try {
              await page.keyboard.down('Digit0');
              await page.waitForTimeout(900);
            } finally {
              await page.keyboard.up('Digit0').catch(() => {});
            }
          }
        }
        const observation = await page.evaluate(() => {
          const state = window.SF?.state;
          const player = state?.entities?.get?.(state.playerId);
          const corridor = state?.dockingCorridor || null;
          return {
            docked: state?.ui?.docked === true,
            mode: state?.mode || null,
            activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
            dockPromptVisible: (() => {
              const el = document.querySelector('.sf-alert--dock');
              if (!el || el.hidden) return false;
              const style = getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            })(),
            speed: player?.vel ? Number(Math.hypot(player.vel.x, player.vel.z).toFixed(1)) : null,
            pos: player?.pos
              ? { x: Number(player.pos.x.toFixed(1)), z: Number(player.pos.z.toFixed(1)) }
              : null,
            tether: player?.tether
              ? { active: player.tether.active === true, phase: player.tether.phase || null,
                  targetId: player.tether.targetId ?? null }
              : null,
            dockInRange: state?.ui?.dockInRange === true,
            dockDeny: state?.ui?.dockDeny || null,
            hull: Number.isFinite(player?.hull) ? player.hull : null,
            distToBerth: corridor ? corridor.distToBerth : null,
            corridorPhase: corridor ? corridor.phase : null,
            corridorAssist: corridor?.assist || null,
            autopilot: state?.nav?.autopilot
              ? { active: state.nav.autopilot.active, status: state.nav.autopilot.status }
              : null,
            visibleScreens: [...document.querySelectorAll('[data-screen]')]
              .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
              .map((el) => el.getAttribute('data-screen')),
          };
        });
        attempts.push(observation);
        lastObservation = observation;
        if (observation.docked) break;
        await page.waitForTimeout(500);
      }
      assert.equal(attempts.at(-1)?.docked, true,
        `visible dock prompt rejected ordinary held E taps: ${JSON.stringify(attempts.slice(-6))}`);
    }
    await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 });
    await waitForVisible(page, '[data-screen="station"]', 20_000, 'station hub');
    // Product-specific acceptance routes may validate the current station shell themselves. The
    // shared M0 baseline keeps its stricter historical station contract by default.
    const stableStation = skipStationHubAcceptance ? null : await waitForStableStationHub(page, 30);
    await screenshot(page, outputDir, SCREENSHOTS.stationHub);
    mark('station-hub-settled', stableStation);
    recordCanonicalUrl('station-hub-settled');

    const gpu = await readHardwareGpu(page);
    assert.deepEqual(gpu.classification.failures, [],
      `browser baseline requires affirmative hardware GPU proof: ${JSON.stringify(gpu)}`);
    mark('hardware-webgl', { gpu: gpu.identity });

    const performanceTelemetry = summarizePerformanceSamples(await sampler.stop());
    assert(performanceTelemetry.frameMs.sampleCount > 0, 'read-only route performance sampler must capture frames');
    mark('performance-captured', { sampleCount: performanceTelemetry.frameMs.sampleCount });
    const finalUrlCheck = recordCanonicalUrl('before-route-return');

    return {
      pass: true,
      steps,
      screenshots: Object.values(SCREENSHOTS),
      launchSnapshot,
      flightInput,
      navSnapshot,
      approachSnapshot,
      stableStation,
      gpu,
      performanceTelemetry,
      urlChecks,
      finalUrlCheck,
    };
  } catch (error) {
    const samples = await sampler.stop().catch(() => []);
    error.routePhase = phase;
    error.routeProgress = steps.slice();
    error.performanceTelemetry = summarizePerformanceSamples(samples);
    error.urlChecks = urlChecks.slice();
    throw error;
  }
}

export function evaluateFlightInputCausality({ baselineStart, baselineEnd, wHeld, boostHeld, released } = {}) {
  const failures = [];
  for (const [name, snapshot] of Object.entries({ baselineStart, baselineEnd, wHeld, boostHeld, released })) {
    if (!snapshot?.player || !snapshot?.controls) failures.push(`${name} snapshot is incomplete`);
  }
  if (failures.length) return { pass: false, failures, metrics: null };

  const baseline = phaseMotionMetrics(baselineStart, baselineEnd);
  const powered = phaseMotionMetrics(baselineEnd, boostHeld);
  if (!(baselineEnd.tick > baselineStart.tick)) failures.push('released baseline did not advance simulation ticks');
  if (!(wHeld.tick > baselineEnd.tick)) failures.push('W hold did not advance simulation ticks');
  if (!(boostHeld.tick > wHeld.tick)) failures.push('W+Shift hold did not advance simulation ticks');
  if (!(released.tick > boostHeld.tick)) failures.push('post-keyup observation did not advance simulation ticks');
  if (Math.abs(Number(baselineStart.controls.moveZ || 0)) >= 0.02 || baselineStart.controls.boost === true) {
    failures.push('released baseline started with active flight controls');
  }
  if (Math.abs(Number(baselineEnd.controls.moveZ || 0)) >= 0.02 || baselineEnd.controls.boost === true) {
    failures.push('released baseline ended with active flight controls');
  }
  if (Math.abs(Number(wHeld.controls.moveZ || 0)) < 0.5) failures.push('W hold did not appear in the live forward input field');
  if (Math.abs(Number(boostHeld.controls.moveZ || 0)) < 0.5) failures.push('forward input was lost during W+Shift hold');
  if (boostHeld.controls.boost !== true) failures.push('Shift hold did not appear in the live boost input field');
  if (Math.abs(Number(released.controls.moveZ || 0)) >= 0.02) failures.push('KeyW release did not clear the live forward input field');
  if (released.controls.boost === true) failures.push('Shift release did not clear the live boost input field');

  if (!(powered.displacementPerSecond > baseline.displacementPerSecond + 0.5)) {
    failures.push('powered displacement rate did not exceed the released baseline');
  }
  if (!(powered.speedChange > baseline.speedChange + 0.25)) {
    failures.push('powered speed change did not exceed the released baseline');
  }
  if (!(powered.accelerationPerSecond > baseline.accelerationPerSecond + 0.5)) {
    failures.push('powered acceleration did not exceed the released baseline');
  }

  return {
    pass: failures.length === 0,
    failures,
    metrics: { baseline, powered },
  };
}

export function summarizePerformanceSamples(samples) {
  const valid = (Array.isArray(samples) ? samples : []).filter((sample) => Number.isFinite(sample?.frameMs) && sample.frameMs > 0);
  const frameValues = valid.map((sample) => sample.frameMs).sort((a, b) => a - b);
  const memoryKeys = ['geometries', 'textures', 'programs'];
  const memory = {};
  for (const key of memoryKeys) {
    memory[key] = numericRange(valid.map((sample) => sample?.memory?.[key]));
  }
  const latest = valid.length ? valid[valid.length - 1] : null;
  return {
    kind: 'descriptive-public-route-samples',
    thresholdsClaimed: false,
    frameMs: {
      sampleCount: frameValues.length,
      p50: round(percentile(frameValues, 0.50)),
      p95: round(percentile(frameValues, 0.95)),
      p99: round(percentile(frameValues, 0.99)),
      max: round(frameValues.length ? frameValues[frameValues.length - 1] : null),
      hitchesOver32Ms: frameValues.filter((value) => value > 32).length,
    },
    memory,
    heapBytes: numericRange(valid.map((sample) => sample.heap)),
    lastDiagnosticAggregate: latest?.diagnosticFrame || null,
    lastRender: latest?.render || null,
    lastCounts: latest?.counts || null,
    notes: [
      'Samples are periodic read-only observations of the game diagnostics during this public route.',
      'Screenshot and automation overhead is included; this record does not claim Milestone-6 performance thresholds.',
    ],
  };
}

function startReadOnlyPerformanceSampler(page, intervalMs = 125) {
  const samples = [];
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      await delay(intervalMs);
      if (stopped || page.isClosed()) continue;
      try {
        const sample = await page.evaluate(() => {
          const diag = window.__THREE_GAME_DIAGNOSTICS__;
          const report = diag && typeof diag.getReport === 'function' ? diag.getReport() : null;
          const heap = performance?.memory?.usedJSHeapSize;
          return {
            atMs: performance.now(),
            frameMs: Number(report?.frameMs?.last),
            diagnosticFrame: report?.frameMs || null,
            render: report?.render || null,
            memory: report?.memory || null,
            counts: report?.counts || null,
            heap: Number.isFinite(heap) ? heap : null,
            tick: Number(window.SF?.state?.tick),
          };
        });
        if (sample && Number.isFinite(sample.frameMs) && sample.frameMs > 0) samples.push(sample);
      } catch (_) {
        if (!stopped && !page.isClosed()) throw _;
      }
    }
  })();
  let stopPromise = null;
  return {
    stop() {
      if (!stopPromise) {
        stopped = true;
        stopPromise = loop.then(() => samples.slice());
      }
      return stopPromise;
    },
  };
}

async function readHardwareGpu(page) {
  const observation = await page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (!gl) {
      return {
        hasContext: false,
        debugExtensionAvailable: false,
        unmaskedVendor: '',
        unmaskedRenderer: '',
        maskedVendor: '',
        maskedRenderer: '',
        runtimeGpu: null,
      };
    }
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const maskedVendor = String(gl.getParameter(gl.VENDOR) || '');
    const maskedRenderer = String(gl.getParameter(gl.RENDERER) || '');
    const unmaskedVendor = extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) || '') : '';
    const unmaskedRenderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || '') : '';
    const stateGpu = window.SF?.state?.render?.gpu || null;
    return {
      hasContext: true,
      debugExtensionAvailable: !!extension,
      unmaskedVendor,
      unmaskedRenderer,
      maskedVendor,
      maskedRenderer,
      runtimeGpu: stateGpu ? {
        vendor: stateGpu.vendor || '',
        renderer: stateGpu.renderer || '',
        tier: stateGpu.tier || '',
        software: typeof stateGpu.software === 'boolean' ? stateGpu.software : null,
      } : null,
    };
  });
  const classification = classifyHardwareGpu(observation);
  return { ...observation, classification, identity: classification.identity };
}

async function readTitleLanding(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const mainMenu = document.querySelector('[data-screen="mainMenu"]');
    const newGame = document.querySelector('[data-screen="newGame"]');
    const active = document.activeElement;
    return {
      mode: state?.mode || null,
      screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : [],
      mainMenuVisible: isVisible(mainMenu),
      newGameVisible: isVisible(newGame),
      focusedTag: active?.tagName || null,
      focusedText: String(active?.textContent || '').trim().slice(0, 120),
    };

    function isVisible(element) {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
        && rect.width > 1 && rect.height > 1;
    }
  });
}

async function readFlightSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const ships = Array.isArray(state?.entityList)
      ? state.entityList.filter((item) => item?.type === 'ship' && item.alive !== false)
      : [];
    const authored = summarizeAuthoredPresentation(ships, player);
    const firstRunSplash = document.querySelector('[data-screen="firstRun"], .sf-first-run, [data-first-run]');
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      simTime: Number(state?.simTime || 0),
      player: player ? {
        id: player.id,
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull || 0),
        pos: { x: Number(player.pos?.x || 0), z: Number(player.pos?.z || 0) },
        vel: { x: Number(player.vel?.x || 0), z: Number(player.vel?.z || 0) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      } : null,
      authored,
      controls: {
        moveX: Number(state?.input?.moveX || 0),
        moveZ: Number(state?.input?.moveZ || 0),
        boost: state?.input?.boost === true,
      },
      modalOpen: document.body.classList.contains('ui-modal-open'),
      firstRunSplashVisible: isVisible(firstRunSplash),
      screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : [],
    };

    function isVisible(element) {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
        && rect.width > 1 && rect.height > 1;
    }

    function summarizeAuthoredPresentation(liveShips, livePlayer) {
      const result = {
        ready: false,
        shipCount: liveShips.length,
        presentedShipCount: 0,
        pendingShipCount: 0,
        fallbackShipCount: 0,
        statuses: [],
      };
      for (const ship of liveShips) {
        const status = ship?.mesh?.userData?.authoredAssetState || 'missing';
        const admission = ship?.presentationAdmission || null;
        result.statuses.push(status);
        if ((status === 'authored' || status === 'authored-with-cleanup-error')
            && (admission === 'ready' || admission == null)) result.presentedShipCount++;
        else if (admission === 'pending' && (
          status === 'awaiting-authored-admission'
          || status === 'loading'
          || status === 'compiling-pipelines'
        )) result.pendingShipCount++;
        else result.fallbackShipCount++;
      }
      // Same correction as flightReadyInPage: the engine's own readiness contract is the
      // verdict; the per-ship counts stay as receipt diagnostics, not a pass condition.
      const readiness = typeof window.SF?.authoredVisualReadiness === 'function'
        ? window.SF.authoredVisualReadiness()
        : null;
      result.ready = !!(readiness && readiness.ready);
      return result;
    }
  });
}

export function flightReadyInPage() {
  const state = window.SF?.state;
  const player = state?.entities?.get(state.playerId);
  // Ask the engine its own question: authoredCriticalVisualReadiness().ready covers the
  // player flight package, the starting hub, the opening authored composition, and the
  // glass/runway role set — everything the player can actually see on the first frame.
  // Requiring EVERY ship in the sector to hold an authored mesh is unsatisfiable by
  // construction: distant NPCs stay dormant on purpose (asset-npc-authored-binding.test
  // pins that), so meshless residency-deferred ships are not fallback presentations.
  // See the same correction in professionalTravelPublicRoute.flightReadyInPage.
  const readiness = typeof window.SF?.authoredVisualReadiness === 'function'
    ? window.SF.authoredVisualReadiness()
    : null;
  // Fail closed: if the contract is unavailable the route must not pass on mode alone.
  const authoredPresentationReady = !!(readiness && readiness.ready);
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashStyle = splash ? getComputedStyle(splash) : null;
  const splashVisible = !!(splash && !splash.hidden && splashStyle?.display !== 'none' && splashStyle?.visibility !== 'hidden');
  const firstRun = document.querySelector('[data-screen="firstRun"], .sf-first-run, [data-first-run]');
  const firstRunStyle = firstRun ? getComputedStyle(firstRun) : null;
  const firstRunVisible = !!(firstRun && !firstRun.hidden && firstRunStyle?.display !== 'none' && firstRunStyle?.visibility !== 'hidden');
  return state?.mode === 'flight' && player && player.alive !== false && Number(player.hull) > 0
    && authoredPresentationReady && !modalOpen && !splashVisible && !firstRunVisible;
}

async function readNavigationSnapshot(page) {
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
        target: nav.autopilot.target ? { x: Number(nav.autopilot.target.x), z: Number(nav.autopilot.target.z) } : null,
        targetEntityId: nav.autopilot.targetEntityId ?? null,
        arrivalRadius: Number(nav.autopilot.arrivalRadius || 0),
      } : null,
    };
  });
}

async function readApproachSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const nav = state?.nav?.autopilot;
    const corridor = state?.dockingCorridor || null;
    return {
      tick: Number(state?.tick || 0),
      playerAlive: !!(player && player.alive !== false && Number(player.hull) > 0),
      hull: Number(player?.hull || 0),
      pos: player ? { x: Number(player.pos?.x || 0), z: Number(player.pos?.z || 0) } : null,
      speed: player ? Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)) : null,
      autopilot: nav ? {
        active: nav.active === true,
        status: nav.status || '',
        distance: Number(nav.distance || 0),
        label: nav.label || '',
      } : null,
      corridor: corridor ? {
        phase: corridor.phase,
        distToBerth: corridor.distToBerth,
        inCorridor: corridor.inCorridor === true,
        inCapture: corridor.inCapture === true,
        headingOk: corridor.headingOk,
      } : null,
      tether: player?.tether
        ? { active: player.tether.active === true, phase: player.tether.phase || null,
            targetId: player.tether.targetId ?? null }
        : null,
    };
  });
}

export function observeStableStationFramesInPage({ maximumFrames }) {
  return new Promise((resolve) => {
    const frames = [];
    const canonicalUndockSelector = 'button[data-act="undock"]';
    const sample = (frameTimestampMs) => {
      const state = window.SF?.state;
      const screen = document.querySelector('[data-screen="station"]');
      const overlay = document.querySelector('#sf-dock-overlay');
      const screenVisibility = visibilityOf(screen);
      const visibleTabs = Array.from(screen?.querySelectorAll('[role="tab"][data-tab], [role="tab"][data-nav]') || [])
        .filter((tab) => visibilityOf(tab).visible);
      const undockMatches = Array.from(document.querySelectorAll(canonicalUndockSelector));
      const visibleUndockMatches = undockMatches.filter((candidate) => visibilityOf(candidate).visible);
      const undock = undockMatches[0] || null;
      const undockVisibility = visibilityOf(undock);
      const undockLabel = String(undock?.textContent || '').replace(/\s+/g, ' ').trim();
      const undockAccessibleName = accessibleNameOf(undock);
      const undockAncestry = inspectAccessibilityAncestry(undock);
      const content = String(screen?.innerText || '').replace(/\s+/g, ' ').trim();
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const overlayRect = overlay?.getBoundingClientRect();
      frames.push({
        index: frames.length,
        source: 'requestAnimationFrame',
        frameTimestampMs: Number(frameTimestampMs),
        docked: state?.ui?.docked === true,
        stationId: state?.ui?.dockedStationId || null,
        screenVisible: screenVisibility.visible,
        screenRect: visibilityDiagnosticsOf(screenVisibility),
        visibleTabLabels: visibleTabs.map((tab) => String(tab.getAttribute('data-tab') || tab.getAttribute('data-nav') || tab.textContent || '').trim()),
        contentFingerprint: fingerprint(content),
        contentLength: content.length,
        contentPreview: content.slice(0, 240),
        undockVisible: undockVisibility.visible,
        undockAction: {
          selector: canonicalUndockSelector,
          canonicalMatchCount: undockMatches.length,
          visibleCanonicalMatchCount: visibleUndockMatches.length,
          present: !!undock,
          visible: undockVisibility.visible,
          visibilityDiagnostics: visibilityDiagnosticsOf(undockVisibility),
          isConnected: undock?.isConnected === true,
          containedByStationScreen: !!(screen && undock && screen.contains(undock)),
          effectiveAriaHidden: undockAncestry.effectiveAriaHidden,
          effectiveInert: undockAncestry.effectiveInert,
          effectiveAriaDisabled: undockAncestry.effectiveAriaDisabled,
          ariaHiddenAncestry: undockAncestry.ariaHiddenAncestry,
          inertAncestry: undockAncestry.inertAncestry,
          ariaDisabledAncestry: undockAncestry.ariaDisabledAncestry,
          accessibleName: undockAccessibleName.name,
          accessibleNameSource: undockAccessibleName.source,
          labelledByIds: undockAccessibleName.labelledByIds,
          label: undockLabel,
          normalizedLabel: undockLabel.toLowerCase(),
          readiness: undock?.getAttribute('data-readiness') || null,
          disabled: undock?.matches(':disabled') === true,
          ownDisabled: undock?.disabled === true,
          ariaDisabled: undock?.getAttribute('aria-disabled') || null,
        },
        overlay: overlay ? {
          present: true,
          hidden: overlay.hidden === true,
          display: overlayStyle?.display || '',
          visibility: overlayStyle?.visibility || '',
          opacity: Number(overlayStyle?.opacity),
          width: Number(overlayRect?.width || 0),
          height: Number(overlayRect?.height || 0),
          ariaHidden: overlay.getAttribute('aria-hidden'),
          pointerEvents: overlayStyle?.pointerEvents || '',
        } : { present: false },
      });
      if (frames.length >= maximumFrames) resolve(frames);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    function visibilityOf(element) {
      const viewportWidth = Math.max(0, Number(window.innerWidth || document.documentElement?.clientWidth || 0));
      const viewportHeight = Math.max(0, Number(window.innerHeight || document.documentElement?.clientHeight || 0));
      if (!element) return {
        visible: false,
        width: 0,
        height: 0,
        intersectionWidth: 0,
        intersectionHeight: 0,
        intersectionArea: 0,
        viewportWidth,
        viewportHeight,
        effectiveOpacity: 0,
        hiddenByAncestor: true,
      };
      const rect = element.getBoundingClientRect();
      const left = Number(rect.left || 0);
      const top = Number(rect.top || 0);
      const width = Math.max(0, Number(rect.width || 0));
      const height = Math.max(0, Number(rect.height || 0));
      const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
      const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
      const intersectionWidth = Math.max(0, Math.min(right, viewportWidth) - Math.max(left, 0));
      const intersectionHeight = Math.max(0, Math.min(bottom, viewportHeight) - Math.max(top, 0));
      const intersectionArea = intersectionWidth * intersectionHeight;
      let effectiveOpacity = 1;
      let hiddenByAncestor = false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const opacity = Number.parseFloat(style.opacity);
        effectiveOpacity *= Number.isFinite(opacity) ? opacity : 1;
        if (node.hidden === true || style.display === 'none'
          || ['hidden', 'collapse'].includes(String(style.visibility || '').toLowerCase())) {
          hiddenByAncestor = true;
        }
      }
      return {
        visible: !hiddenByAncestor && effectiveOpacity > 0.01 && width > 1 && height > 1
          && intersectionWidth > 1 && intersectionHeight > 1 && intersectionArea > 1,
        width,
        height,
        intersectionWidth,
        intersectionHeight,
        intersectionArea,
        viewportWidth,
        viewportHeight,
        effectiveOpacity,
        hiddenByAncestor,
      };
    }

    function visibilityDiagnosticsOf(observation) {
      const { visible: _visible, ...diagnostics } = observation;
      return diagnostics;
    }

    function accessibleNameOf(element) {
      if (!element) return { name: '', source: 'none', labelledByIds: [] };
      const labelledByIds = normalizeDomText(element.getAttribute('aria-labelledby'))
        .split(' ')
        .filter(Boolean);
      const labelledByName = labelledByIds
        .map((id) => document.getElementById(id))
        .map((label) => normalizeDomText(label?.textContent))
        .filter(Boolean)
        .join(' ');
      if (labelledByName) return { name: labelledByName, source: 'aria-labelledby', labelledByIds };

      const ariaLabel = normalizeDomText(element.getAttribute('aria-label'));
      if (ariaLabel) return { name: ariaLabel, source: 'aria-label', labelledByIds };

      const visibleText = normalizeDomText(element?.innerText);
      if (visibleText) return { name: visibleText, source: 'visible-text', labelledByIds };

      const textContent = normalizeDomText(element?.textContent);
      if (textContent) return { name: textContent, source: 'text-content', labelledByIds };

      const title = normalizeDomText(element.getAttribute('title'));
      if (title) return { name: title, source: 'title', labelledByIds };
      return { name: '', source: 'none', labelledByIds };
    }

    function inspectAccessibilityAncestry(element) {
      const ariaHiddenAncestry = [];
      const inertAncestry = [];
      const ariaDisabledAncestry = [];
      for (let node = element; node; node = node.parentElement) {
        const identity = describeDomNode(node);
        if (normalizeDomText(node.getAttribute?.('aria-hidden')).toLowerCase() === 'true') {
          ariaHiddenAncestry.push(identity);
        }
        if (node.hasAttribute('inert') || node.inert === true) inertAncestry.push(identity);
        if (normalizeDomText(node.getAttribute?.('aria-disabled')).toLowerCase() === 'true') {
          ariaDisabledAncestry.push(identity);
        }
      }
      return {
        effectiveAriaHidden: ariaHiddenAncestry.length > 0,
        effectiveInert: inertAncestry.length > 0,
        effectiveAriaDisabled: ariaDisabledAncestry.length > 0,
        ariaHiddenAncestry,
        inertAncestry,
        ariaDisabledAncestry,
      };
    }

    function describeDomNode(element) {
      if (!element) return 'missing';
      const tag = String(element.localName || element.tagName || 'element').toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList || []).slice(0, 4).map((name) => `.${name}`).join('');
      return `${tag}${id}${classes}`;
    }

    function normalizeDomText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function fingerprint(value) {
      let hash = 0x811c9dc5;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }
  });
}

async function waitForStableStationHub(page, requiredObservations) {
  assert(requiredObservations >= 30, 'station acceptance requires at least 30 consecutive animation frames');
  const maximumFrames = Math.max(90, requiredObservations * 3);
  const computedRoleBefore = await readComputedUndockRoleProof(page, 'before-settlement');
  const observations = await page.evaluate(observeStableStationFramesInPage, { maximumFrames });
  const computedRoleAfter = await readComputedUndockRoleProof(page, 'after-settlement');
  const finalSuffix = validateFinalStationFrameSuffix(observations, { minFrames: requiredObservations });
  const computedRoleAuthority = validateComputedUndockRoleProofs([computedRoleBefore, computedRoleAfter]);
  const settlementFailures = [...finalSuffix.failures, ...computedRoleAuthority.failures];
  assert.equal(settlementFailures.length, 0,
    `station hub final ${requiredObservations}-frame suffix was not settled: ${JSON.stringify(settlementFailures)}`);
  return {
    ...finalSuffix,
    computedRoleAuthority,
    rawObservationCount: observations.length,
    observationSequence: observations,
  };
}

async function readComputedUndockRoleProof(page, boundary) {
  const canonicalUndock = page.locator('button[data-act="undock"]');
  const computedUndockRole = page.getByRole('button', { name: /\bundock\b/i });
  const identityBoundUndock = canonicalUndock.and(computedUndockRole);
  const [canonicalCount, computedRoleCount, identityBoundCount] = await Promise.all([
    canonicalUndock.count(),
    computedUndockRole.count(),
    identityBoundUndock.count(),
  ]);
  const canonicalVisible = canonicalCount === 1
    ? await canonicalUndock.first().isVisible().catch(() => false)
    : false;
  const canonicalEnabled = canonicalCount === 1
    ? await canonicalUndock.first().isEnabled().catch(() => false)
    : false;
  const ariaSnapshot = identityBoundCount === 1
    ? await identityBoundUndock.first().ariaSnapshot().catch(() => '')
    : '';
  return {
    boundary,
    selector: 'button[data-act="undock"]',
    canonicalCount,
    computedRoleCount,
    identityBoundCount,
    canonicalVisible,
    canonicalEnabled,
    ariaSnapshot,
  };
}

async function clickWaypointWithPointer(page, locator) {
  const deadline = Date.now() + 10_000;
  let lastBox = null;
  while (Date.now() < deadline) {
    // The inspector renders the button below the fold under the chart layer:
    // Playwright reports it visible while elementFromPoint returns the overlay.
    // scrollIntoViewIfNeeded lifts it into the inspector's clear band before we
    // read the box, otherwise every pointer click lands on the covering screen.
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    lastBox = await locator.boundingBox().catch(() => null);
    if (lastBox && lastBox.width > 2 && lastBox.height > 2) {
      const x = Math.round(lastBox.x + lastBox.width / 2);
      const y = Math.round(lastBox.y + lastBox.height / 2);
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      const armed = await page.waitForFunction(() => {
        const nav = window.SF?.state?.nav;
        return nav?.autopilot?.active === true && /Helios Station/i.test(String(nav.autopilot.label || ''));
      }, null, { timeout: 750 }).then(() => true, () => false);
      if (armed) return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Visible Set Waypoint pointer click did not arm autopilot; last bounding box=${JSON.stringify(lastBox)}`);
}

async function waitForVisible(page, selector, timeout, label) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout }).catch((error) => {
    throw new Error(`Timed out waiting for visible ${label}: ${error.message}`);
  });
}

async function waitForBootOverlayGone(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return true;
    const style = getComputedStyle(overlay);
    return overlay.hidden || overlay.classList.contains('hidden') || style.display === 'none' || style.visibility === 'hidden';
  }, null, { timeout: 30_000 });
}

async function screenshot(page, outputDir, fileName) {
  await page.screenshot({ path: path.join(outputDir, fileName), type: 'png', animations: 'allow' });
}

function compactFlight(snapshot) {
  return {
    tick: snapshot.tick,
    simTime: snapshot.simTime,
    pos: snapshot.player?.pos || null,
    speed: round(snapshot.player?.speed),
    controls: snapshot.controls,
  };
}

function phaseMotionMetrics(start, end) {
  const simSeconds = Math.max(0, Number(end?.simTime || 0) - Number(start?.simTime || 0));
  const displacement = distance2d(start?.player?.pos, end?.player?.pos);
  const speedChange = Number(end?.player?.speed || 0) - Number(start?.player?.speed || 0);
  return {
    tickDelta: Number(end?.tick || 0) - Number(start?.tick || 0),
    simSeconds: round(simSeconds),
    displacement: round(displacement),
    displacementPerSecond: round(simSeconds > 0 ? displacement / simSeconds : 0),
    speedStart: round(Number(start?.player?.speed || 0)),
    speedEnd: round(Number(end?.player?.speed || 0)),
    speedChange: round(speedChange),
    accelerationPerSecond: round(simSeconds > 0 ? speedChange / simSeconds : 0),
  };
}

function distance2d(left, right) {
  if (!left || !right) return 0;
  return Math.hypot(Number(right.x || 0) - Number(left.x || 0), Number(right.z || 0) - Number(left.z || 0));
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * ratio))];
}

function numericRange(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return { sampleCount: 0, first: null, last: null, min: null, max: null };
  return {
    sampleCount: valid.length,
    first: valid[0],
    last: valid[valid.length - 1],
    min: Math.min(...valid),
    max: Math.max(...valid),
  };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
