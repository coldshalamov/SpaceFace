#!/usr/bin/env node
// Post-boot shader-compile timeline probe (Tier 1 — deterministic counters).
//
// WHY THIS EXISTS
// ---------------
// `check:shader-compile` answers "did every program LINK?" — an integrity question. It samples once,
// after a 2.5 s wall-clock wait, and reports a single total (~46 on a healthy boot).
//
// This probe answers a different and, for performance, far more consequential question:
//
//     "How many GL programs are compiled AFTER boot has settled?"
//
// A shader compile costs 50-300 ms of main-thread stall. In a 16.6 ms frame budget that is a
// guaranteed visible hitch, and it is invisible to source-reading: nothing in the code text says
// `material.needsUpdate = true` will link a new program. `src/render/precompile.js` already runs
// `precompilePipelines` at boot, so every post-boot compile is a precompile cache-key MISS — which
// makes each one directly actionable rather than merely diagnostic.
//
// TIER 1: this reports counts and identities, never durations. An integer is unchanged by CPU
// contention, so this number is valid on this workstation even with many agents running. Do not add
// timing to this probe; that would make its output environment-dependent (see the two-tier evidence
// model in design/program/roadmap/DETERMINISTIC_PERF_INSTRUMENTATION_BRIEF.md §1).
//
// THE BOOT BOUNDARY IS A QUIESCENCE PREDICATE, NOT A TIMEOUT.
// Programs compile lazily on first use, so "post-boot" cannot mean "after N milliseconds" — that
// boundary moves with machine load and the resulting count is not comparable run to run. Here the
// boundary is: the first flight frame after which QUIESCENCE_FRAMES consecutive frames acquired zero
// new programs. That predicate is a counter, so it lands in the same frame on a fast or a loaded
// host.
//
// THE BOOT RAMP IS THE POSITIVE CONTROL.
// A zero-budget counter has a silent failure mode: a dead hook and a healthy system both report 0.
// This probe cannot report a vacuous zero, because the same detector must first observe the boot
// ramp climb from 0 to ~46. `bootRampPrograms` in the output is that proof; the run FAILS if the
// ramp is implausibly small, exactly as check:shader-compile guards its own vacuity.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));

const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
// One second of silence at 60 Hz. Long enough that a lazily-compiled post-FX or VFX program landing
// a few frames late is still counted as boot, short enough that the probe does not idle for minutes.
const QUIESCENCE_FRAMES = Number(argv.quiescence || 60);
const IDLE_FRAMES = Number(argv['idle-frames'] || 600);
const STIMULUS_FRAMES = Number(argv['stimulus-frames'] || 600);
const HEADED = !!(argv.headed || argv.headless === 'false');
const ROUTE = String(argv.route || 'throughline');
// Same vacuity floor as check:shader-compile: a boot that compiled almost nothing means the render
// graph never came up, and every "0 post-boot compiles" claim built on it would be meaningless.
const MIN_BOOT_RAMP_PROGRAMS = 8;
const OUT = argv.out || '.devshots/perf/shader-compile-timeline.json';
// Phases are measured in FRAMES, never milliseconds — that is what makes the counts comparable
// between a fast host and a loaded one. The wall-clock timeout exists only to fail a hung run, so it
// is deliberately generous: headless SwiftShader delivers single-digit fps here, and a tight timeout
// would turn "this machine is slow" into "this probe is broken". Declared with the other config
// because `waitFlightFrames` is hoisted and runs long before the bottom of this file evaluates.
const FRAME_WAIT_TIMEOUT_MS = Number(argv['frame-wait-timeout-ms'] || 900_000);

let server = null;
let browser = null;
let context = null;
let exitCode = 0;
let stage = 'startup';
let diagnosticPage = null;
const pageErrors = [];

function enterStage(next) {
  stage = next;
  console.log(`[shader-timeline] stage: ${next}`);
}

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      // Without these an occluded or backgrounded page has rAF throttled to ~1 Hz, and every
      // frame-counted phase below would take minutes instead of seconds.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => { pageErrors.push(String(error?.message || error)); });

  // Installed BEFORE navigation so the sampler is already running when the very first program is
  // acquired. Attaching after boot would miss the ramp — and the ramp is what proves the detector
  // is alive.
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* private mode */ }

    // Arm the PRODUCTION instrumentation seam (src/core/perfCounters.js + glInstrumentation.js).
    // Set before navigation because the seam is read once, at renderer construction, and installs
    // the GL wrappers there — after that point there is no way to start counting without producing
    // a report whose provenance is invisible.
    //
    // This makes the run a cross-validation rather than a single measurement: the page-level
    // linkProgram wrapper below and the production counters observe the same context by different
    // routes, so a disagreement between them is a defect in one of the two instruments. Unit tests
    // exercise the production seam only against a fake context; this is the only place it meets a
    // real WebGL2RenderingContext.
    window.__SPACEFACE_PERF_COUNTERS__ = true;

    const events = [];
    const seen = new Set();
    const coverage = {
      trafficSeen: 0,
      hostileSeen: 0,
      targetedHostile: false,
      firedAtHostile: false,
      hostilityClassifierReady: false,
    };
    let isHostileToPlayer = null;
    import('/src/systems/scanner.js').then((module) => {
      isHostileToPlayer = module.isHostileToPlayer;
      coverage.hostilityClassifierReady = typeof isHostileToPlayer === 'function';
    }).catch(() => {});
    let frame = 0;
    let flightFrame = -1;

    // --- gl.linkProgram capture -----------------------------------------------------------------
    // Polling renderer.info.programs tells you a program appeared; it cannot tell you WHO caused it,
    // and it misses any program created and released inside one frame interval. Wrapping the GL call
    // gives both: exact ordering and the originating stack.
    //
    // getContext is patched on the prototype only because the context must be caught at creation.
    // The wrapper itself is INSTANCE shadowing (`ctx.linkProgram = ...`), so it cannot leak to any
    // other context. This is the same mechanism the production instrumentation seam will use, so a
    // successful capture here is also the proof that the mechanism works at all.
    const linkEvents = [];
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      const ctx = originalGetContext.call(this, type, ...rest);
      if (ctx && /webgl/i.test(String(type)) && !ctx.__sfLinkInstrumented) {
        ctx.__sfLinkInstrumented = true;
        const originalLinkProgram = ctx.linkProgram;
        ctx.linkProgram = function linkProgram(program) {
          if (linkEvents.length < 500) {
            linkEvents.push({
              frame,
              flightFrame,
              stack: String(new Error().stack || '').split('\n').slice(1, 14).join('\n'),
            });
          }
          return originalLinkProgram.call(this, program);
        };
      }
      return ctx;
    };

    function sample() {
      const state = window.SF && window.SF.state;
      if (state && state.mode === 'flight') flightFrame = flightFrame < 0 ? 0 : flightFrame + 1;

      const entities = state && Array.isArray(state.entityList) ? state.entityList : [];
      let traffic = 0;
      let hostiles = 0;
      let targetedHostile = false;
      const targetId = state && state.player && state.player.targetId;
      for (const entity of entities) {
        if (!entity || entity.alive === false || entity.isPlayer) continue;
        if (entity.data && entity.data.trafficRole) traffic++;
        const player = state?.entities?.get?.(state.playerId);
        const hostile = entity.type === 'ship' && typeof isHostileToPlayer === 'function'
          ? isHostileToPlayer(entity, player?.team || 0, state)
          : false;
        if (hostile) hostiles++;
        if (hostile && entity.id === targetId) targetedHostile = true;
      }
      coverage.trafficSeen = Math.max(coverage.trafficSeen, traffic);
      coverage.hostileSeen = Math.max(coverage.hostileSeen, hostiles);
      coverage.targetedHostile ||= targetedHostile;
      coverage.firedAtHostile ||= targetedHostile && state?.input?.fire === true;

      const renderer = state && state.render && state.render.renderer;
      const programs = renderer && renderer.info && renderer.info.programs;
      if (programs) {
        for (let i = 0; i < programs.length; i++) {
          const program = programs[i];
          // THREE reuses a cached program when the cacheKey matches, incrementing usedTimes rather
          // than linking again. A genuinely NEW entry is therefore exactly one compile+link.
          const cacheKey = String(program.cacheKey || '');
          if (!cacheKey) continue;
          const identity = `key:${cacheKey}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          events.push({
            frame,
            flightFrame,
            id: program.id != null ? program.id : null,
            name: String(program.name || ''),
            cacheKey: String(program.cacheKey || ''),
          });
        }
      }
      frame++;
      requestAnimationFrame(sample);
    }

    requestAnimationFrame(sample);
    window.__SF_PROGRAM_TIMELINE__ = {
      events,
      linkEvents,
      get frame() { return frame; },
      get flightFrame() { return flightFrame; },
      get linkCount() { return linkEvents.length; },
      coverage,
    };
  });

  diagnosticPage = page;
  enterStage('navigate');
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await bootToFlight(page);

  // --- Boot boundary via quiescence -----------------------------------------------------------
  enterStage('quiescence');
  await page.waitForFunction((quiescence) => {
    const timeline = window.__SF_PROGRAM_TIMELINE__;
    if (!timeline || timeline.flightFrame < quiescence) return false;
    const last = timeline.events.length
      ? timeline.events[timeline.events.length - 1].flightFrame
      : -1;
    // last < 0 means every program was acquired before flight mode: already quiescent.
    return last < 0 || (timeline.flightFrame - last) >= quiescence;
  }, QUIESCENCE_FRAMES, { timeout: FRAME_WAIT_TIMEOUT_MS });

  // Tell the production counters where boot ended. The runtime deliberately does not decide this
  // for itself: "boot has settled" is the quiescence predicate evaluated just above, and it belongs
  // with the harness that owns the scenario rather than baked into shipped code.
  const boundary = await page.evaluate(() => ({
    flightFrame: window.__SF_PROGRAM_TIMELINE__.flightFrame,
    eventCount: window.__SF_PROGRAM_TIMELINE__.events.length,
    linkCount: window.__SF_PROGRAM_TIMELINE__.linkCount,
    productionBoundaryFrame: window.__SPACEFACE_PERF__?.tier1?.markBootBoundary?.() ?? null,
    productionLinksAtBoundary: window.__SPACEFACE_PERF__?.getCounterSnapshot?.().totals.shaderLinks ?? null,
  }));
  const openingCensus = await captureProgramCensus(page);

  // --- Phase 1: idle flight (no input) --------------------------------------------------------
  enterStage('idle-flight');
  await waitFlightFrames(page, IDLE_FRAMES);
  const afterIdle = await page.evaluate(() => ({
    flightFrame: window.__SF_PROGRAM_TIMELINE__.flightFrame,
    eventCount: window.__SF_PROGRAM_TIMELINE__.events.length,
    linkCount: window.__SF_PROGRAM_TIMELINE__.linkCount,
  }));
  const idleCensus = await captureProgramCensus(page);

  // --- Phase 2: scripted stimulus -------------------------------------------------------------
  // Idle flight never exercises weapons, boost plumes or countermeasures, so a program that only
  // compiles when the player first fires would read as 0 in an idle-only run. This phase makes the
  // idle number honest about what it does and does not cover.
  if (ROUTE === 'throughline') {
    enterStage('public-jump-to-ceres');
    await jumpToCeres(page);
    enterStage('public-throughline-approach');
    await trackThroughline(page);
    await waitFlightFrames(page, 120);
  }
  enterStage('first-combat-traffic-stimulus');
  await applyStimulus(page, STIMULUS_FRAMES);
  const afterStimulus = await page.evaluate(() => ({
    flightFrame: window.__SF_PROGRAM_TIMELINE__.flightFrame,
    eventCount: window.__SF_PROGRAM_TIMELINE__.events.length,
    linkCount: window.__SF_PROGRAM_TIMELINE__.linkCount,
  }));
  const contactCensus = await captureProgramCensus(page);

  const timeline = await page.evaluate(() => window.__SF_PROGRAM_TIMELINE__.events);
  const environment = await page.evaluate(() => {
    const renderer = window.SF?.state?.render?.renderer || null;
    const gl = renderer?.getContext?.() || null;
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') || null;
    return {
      unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '',
      unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '',
      gpuTier: window.SF?.state?.render?.gpu?.tier || '',
      software: !!window.SF?.state?.render?.gpu?.software,
      totalPrograms: renderer?.info?.programs?.length ?? 0,
    };
  });

  const bootRamp = timeline.slice(0, boundary.eventCount);
  const idleCompiles = timeline.slice(boundary.eventCount, afterIdle.eventCount);
  const stimulusCompiles = timeline.slice(afterIdle.eventCount, afterStimulus.eventCount);

  const linkEvents = await page.evaluate(() => window.__SF_PROGRAM_TIMELINE__.linkEvents);
  const postBootLinks = linkEvents.slice(boundary.linkCount, afterStimulus.linkCount);

  const productionCounters = await page.evaluate(() => (
    window.__SPACEFACE_PERF__?.getCounterSnapshot?.() ?? null));

  const report = {
    schema: 'spaceface.shaderCompileTimeline.v2',
    tier: 1,
    route: ROUTE,
    // Deliberately absent: every duration. See the header note on the two-tier evidence model.
    environment,
    boundary: {
      predicate: 'quiescence',
      quiescenceFrames: QUIESCENCE_FRAMES,
      flightFrameAtBoundary: boundary.flightFrame,
      bootRampPrograms: bootRamp.length,
      lastBootRampFlightFrame: bootRamp.length ? bootRamp[bootRamp.length - 1].flightFrame : null,
    },
    phases: {
      idleFlight: {
        frames: afterIdle.flightFrame - boundary.flightFrame,
        postBootCompiles: idleCompiles.length,
        programs: idleCompiles,
      },
      stimulus: {
        frames: afterStimulus.flightFrame - afterIdle.flightFrame,
        postBootCompiles: stimulusCompiles.length,
        programs: stimulusCompiles,
      },
    },
    totals: {
      postBootCompiles: idleCompiles.length + stimulusCompiles.length,
      programsAtEnd: environment.totalPrograms,
      // gl.linkProgram is the ground truth: it cannot miss a program created and released between
      // two rAF samples, so a gap between this and postBootCompiles means the poller under-counted.
      postBootLinkProgramCalls: postBootLinks.length,
      linkProgramCallsTotal: linkEvents.length,
    },
    keyCensus: {
      keepAlivePrograms: openingCensus.keepAlive.programs,
      keepAliveKeys: uniqueKeys(openingCensus.keepAlive.programs.map((entry) => entry.programKey)),
      opening: openingCensus,
      idle: idleCensus,
      firstCombatTraffic: contactCensus,
      idleAddedKeys: addedKeys(openingCensus.liveKeys, idleCensus.liveKeys),
      contactAddedKeys: addedKeys(idleCensus.liveKeys, contactCensus.liveKeys),
      missingKeepAliveKeys: addedKeys(
        openingCensus.liveKeys,
        uniqueKeys(openingCensus.keepAlive.programs.map((entry) => entry.programKey)),
      ),
      coverage: contactCensus.coverage,
    },
    postBootLinks,
    bootRamp,
    // The production seam's own view of the same run. Two instruments, one context.
    productionCounters,
    pageErrors,
  };

  const outPath = resolve(ROOT, OUT);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // --- Report --------------------------------------------------------------------------------
  console.log(`[shader-timeline] gpu: ${environment.unmaskedRenderer || '(masked)'} tier=${environment.gpuTier || '?'} software=${environment.software}`);
  console.log(`[shader-timeline] boot ramp: ${bootRamp.length} programs, quiescent at flight frame ${boundary.flightFrame}`);
  console.log(`[shader-timeline] retained keep-alive keys: ${report.keyCensus.keepAliveKeys.length}; missing from opening cache: ${report.keyCensus.missingKeepAliveKeys.length}`);
  console.log(`[shader-timeline] route coverage: traffic=${contactCensus.coverage.trafficSeen} hostile=${contactCensus.coverage.hostileSeen} targetedHostile=${contactCensus.coverage.targetedHostile} firedAtHostile=${contactCensus.coverage.firedAtHostile}`);
  console.log('');
  console.log(`[shader-timeline] POST-BOOT SHADER COMPILES, idle-flight (${report.phases.idleFlight.frames} frames): ${idleCompiles.length}`);
  console.log(`[shader-timeline] POST-BOOT SHADER COMPILES, stimulus  (${report.phases.stimulus.frames} frames): ${stimulusCompiles.length}`);
  console.log('');
  for (const [label, list] of [['idle', idleCompiles], ['stimulus', stimulusCompiles]]) {
    for (const program of list) {
      console.log(`  [${label}] flightFrame=${program.flightFrame} name=${program.name || '(unnamed)'} cacheKey=${program.cacheKey.slice(0, 120)}`);
    }
  }

  console.log('');
  console.log(`[shader-timeline] gl.linkProgram calls: ${linkEvents.length} total, ${postBootLinks.length} post-boot`);
  for (const link of postBootLinks) {
    // Print the THREE frames rather than filtering them out: they are what distinguishes the two
    // compile classes, and the distinction decides which fix applies.
    //   ...setProgram <- renderBufferDirect <- WebGLRenderer.render
    //       = a DRAW-TIME cache miss. An object entered the frame with no compiled program and THREE
    //         linked it synchronously mid-render. This is the stall the whole brief is about.
    //   ...prepareMaterial <- traverse
    //       = WebGLRenderer.compile(), i.e. precompilePipelines running. Deliberate work, but if it
    //         lands after the boot boundary it is still a stall in flight.
    console.log(`  [link] flightFrame=${link.flightFrame} class=${classifyLink(link.stack)}`);
    for (const line of link.stack.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8)) {
      console.log(`         ${line}`);
    }
  }

  // --- Cross-validation: production seam vs page-level wrapper --------------------------------
  console.log('');
  if (!productionCounters) {
    throw new Error(
      'the production instrumentation seam never armed: __SPACEFACE_PERF__.getCounterSnapshot() '
      + 'returned nothing. src/core/perfCounters.js and src/render/glInstrumentation.js are then '
      + 'covered only by unit tests against a fake context, and every count they produce in a real '
      + 'browser is unverified',
    );
  }
  console.log(`[shader-timeline] production seam: totals.shaderLinks=${productionCounters.totals.shaderLinks} `
    + `postBoot=${productionCounters.postBoot.shaderLinks} offFrame=${productionCounters.offFrame.shaderLinks} `
    + `frames=${productionCounters.framesObserved}`);
  console.log(`[shader-timeline] page wrapper  : linkProgram=${linkEvents.length} postBoot=${postBootLinks.length}`);
  console.log(`[shader-timeline] draw calls=${productionCounters.totals.drawCalls} `
    + `programSwitches=${productionCounters.totals.programSwitches} `
    + `bufferFull=${productionCounters.totals.bufferFullUploads} `
    + `bufferPartial=${productionCounters.totals.bufferPartialUploads} `
    + `textureUploads=${productionCounters.totals.textureUploads}`);
  console.log(`[shader-timeline] stepsPerFrame histogram: ${JSON.stringify(productionCounters.stepsPerFrameHistogram)}`);
  // Printed loudly because these fields read 0 in the report above and 0 is the answer a reader
  // hopes for. They have no producer wired yet; this run says nothing about them either way.
  if (productionCounters.unsourcedFields?.length) {
    console.log(`[shader-timeline] NOT MEASURED (no producer wired — a 0 here is not a finding): `
      + productionCounters.unsourcedFields.join(', '));
  }

  // Both instruments wrap the same gl.linkProgram, so they must agree. A production count of 0
  // against a page-wrapper count in the dozens means the production wrappers did not install —
  // and 0 is exactly what a healthy result looks like, so nothing else would reveal it.
  if (productionCounters.totals.shaderLinks === 0 && linkEvents.length > 0) {
    throw new Error(
      `the production seam counted 0 shader links while the page wrapper counted ${linkEvents.length}. `
      + 'The production GL wrappers did not install on the real context.',
    );
  }
  if (productionCounters.totals.drawCalls === 0) {
    throw new Error(
      'the production seam counted 0 draw calls. A rendered frame cannot happen without a draw, so '
      + 'this is a dead hook rather than a quiet frame — every zero-budget built on it would be a '
      + 'false pass.',
    );
  }

  if (pageErrors.length) {
    throw new Error(`page errors during capture:\n${pageErrors.join('\n')}`);
  }
  // The GL wrapper is a zero-budget mechanism with the same silent-failure mode as the counters it
  // will serve: if it were never installed, postBootLinks would read 0 and look like good news.
  // Boot cannot happen without linking, so a total of 0 proves the wrapper is dead, not the app quiet.
  if (linkEvents.length === 0) {
    throw new Error(
      'gl.linkProgram was never observed. Boot cannot produce a rendered frame without linking a '
      + 'program, so this means the context wrapper did not install — every link-derived number in '
      + 'this report would be a false zero rather than a healthy one',
    );
  }
  if (bootRamp.length < MIN_BOOT_RAMP_PROGRAMS) {
    throw new Error(
      `boot ramp observed only ${bootRamp.length} programs (expected >= ${MIN_BOOT_RAMP_PROGRAMS}); `
      + 'the detector or the render graph did not come up, so a "0 post-boot compiles" result here '
      + 'would be vacuous rather than healthy',
    );
  }
  console.log(`[shader-timeline] evidence: ${OUT}`);
} catch (error) {
  exitCode = 1;
  console.error(`[shader-timeline] FAIL during stage "${stage}": ${error?.message || error}`);
  if (pageErrors.length) console.error(`[shader-timeline] page errors:\n${pageErrors.join('\n')}`);
  // A timeout here is almost always a predicate that cannot be satisfied rather than a slow host,
  // so dump what the predicate was actually looking at instead of just reporting the elapsed time.
  if (diagnosticPage) {
    const snapshot = await diagnosticPage.evaluate(() => {
      const state = window.SF?.state || null;
      const timeline = window.__SF_PROGRAM_TIMELINE__ || null;
      return {
        hasSF: !!window.SF,
        mode: state?.mode ?? null,
        playerId: state?.playerId ?? null,
        hasPlayer: !!state?.entities?.get?.(state?.playerId),
        rendererFound: !!state?.render?.renderer,
        programs: state?.render?.renderer?.info?.programs?.length ?? null,
        samplerFrames: timeline?.frame ?? null,
        flightFrame: timeline?.flightFrame ?? null,
        programEvents: timeline?.events?.length ?? null,
        visibleScreens: Array.from(document.querySelectorAll('[data-screen]'))
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.getAttribute('data-screen')),
      };
    }).catch((dumpError) => ({ dumpFailed: String(dumpError?.message || dumpError) }));
    console.error(`[shader-timeline] page snapshot: ${JSON.stringify(snapshot, null, 2)}`);
  }
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close?.().catch(() => {});
}

process.exit(exitCode);

async function waitFlightFrames(page, frames) {
  const started = Date.now();
  const target = await page.evaluate((n) => window.__SF_PROGRAM_TIMELINE__.flightFrame + n, frames);
  await page.waitForFunction(
    (goal) => window.__SF_PROGRAM_TIMELINE__.flightFrame >= goal,
    target,
    { timeout: FRAME_WAIT_TIMEOUT_MS },
  );
  const elapsed = (Date.now() - started) / 1000;
  console.log(`[shader-timeline]   +${frames} flight frames in ${elapsed.toFixed(1)}s (${(frames / elapsed).toFixed(1)} fps)`);
}

async function applyStimulus(page, frames) {
  const quarter = Math.max(1, Math.floor(frames / 4));
  await page.keyboard.down('KeyW');
  await waitFlightFrames(page, quarter);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.press('Tab');
  await page.keyboard.press('KeyG');       // autoFire — brings weapon/bolt programs in
  await waitFlightFrames(page, quarter);
  await page.keyboard.press('KeyX');       // countermeasure
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await waitFlightFrames(page, quarter);
  await page.mouse.up();
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await waitFlightFrames(page, quarter);
}

// Boot recipe mirrors scripts/check-shader-compile.mjs. Gate on flight mode only: asset readiness is
// a different question and would make this probe fail for reasons unrelated to shader compilation.
async function bootToFlight(page) {
  enterStage('boot:sf-global');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), null, {
    timeout: 60_000,
  });
  enterStage('boot:main-menu');
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 60_000 });
  if (ROUTE === 'combat-sandbox') {
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    enterStage('boot:combat-sandbox');
    await page.locator('[data-screen="sandbox"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Combat Range/i }).click();
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId);
      return state?.mode === 'flight' && player?.alive !== false && Number(player?.hull) > 0;
    }, null, { timeout: 180_000 });
    return;
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  enterStage('boot:new-game');
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#sf-ng-seed').fill('47');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  enterStage('boot:await-flight');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, null, { timeout: 180_000 });
  const begin = page.getByRole('button', { name: /begin/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
}

/**
 * Separate the two post-boot compile classes. They share a symptom and have opposite fixes, so a
 * report that only counted compiles would send a reader after the wrong one.
 */
function classifyLink(stack) {
  if (/renderBufferDirect|setProgram/.test(stack)) return 'DRAW-TIME-MISS';
  if (/prepareMaterial/.test(stack)) return 'precompile';
  return 'unclassified';
}

async function jumpToCeres(page) {
  await page.keyboard.press('KeyN');
  const map = page.locator('[data-screen="galaxyMap"]').first();
  await map.waitFor({ state: 'visible', timeout: 30_000 });
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 10_000 });
  await search.fill('Ceres Belt');
  const names = page.locator('.gm-search-item-name');
  await names.first().waitFor({ state: 'visible', timeout: 15_000 });
  const labels = (await names.allTextContents()).map((value) => String(value || '').trim());
  const index = labels.findIndex((label) => label.toLowerCase() === 'ceres belt');
  if (index < 0) throw new Error(`public map search did not expose Ceres Belt: ${labels.join(' | ')}`);
  await page.locator('.gm-search-item').nth(index).click();
  const action = page.locator('#gm-set-course-btn');
  await action.waitFor({ state: 'visible', timeout: 15_000 });
  const actionLabel = String(await action.textContent() || '').replace(/\s+/g, ' ').trim();
  if (actionLabel !== 'Set Course & Jump') {
    throw new Error(`Ceres Belt exposed '${actionLabel}' instead of Set Course & Jump`);
  }
  await action.click();
  await map.waitFor({ state: 'hidden', timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.world?.currentSectorId === 'sector_ceres_belt'
      && state?.jump?.state === 'IDLE'
      && player?.alive !== false;
  }, null, { timeout: 180_000 });
}

async function trackThroughline(page) {
  await page.keyboard.press('KeyN');
  const map = page.locator('[data-screen="galaxyMap"]').first();
  await map.waitFor({ state: 'visible', timeout: 30_000 });
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 10_000 });
  await search.fill('Throughline Weigh Beacon');
  const names = page.locator('.gm-search-item-name');
  await names.first().waitFor({ state: 'visible', timeout: 15_000 });
  const labels = (await names.allTextContents()).map((value) => String(value || '').trim());
  const index = labels.findIndex((label) => label.toLowerCase() === 'throughline weigh beacon');
  if (index < 0) {
    throw new Error(`public map search did not expose Throughline Weigh Beacon: ${labels.join(' | ')}`);
  }
  await page.locator('.gm-search-item').nth(index).click();
  const action = page.locator('#gm-set-course-btn');
  await action.waitFor({ state: 'visible', timeout: 15_000 });
  const actionLabel = String(await action.textContent() || '').replace(/\s+/g, ' ').trim();
  if (actionLabel !== 'Track Target') {
    throw new Error(`Throughline Weigh Beacon exposed '${actionLabel}' instead of Track Target`);
  }
  await action.click();
  await map.waitFor({ state: 'hidden', timeout: 30_000 });
  await page.waitForFunction(() => {
    const autopilot = window.SF?.state?.nav?.autopilot;
    return autopilot?.label === 'Throughline Weigh Beacon' && autopilot.active === true;
  }, null, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const autopilot = state?.nav?.autopilot;
    if (player?.alive === false || Number(player?.hull) <= 0) {
      throw new Error('player died during public Throughline approach');
    }
    return autopilot?.label === 'Throughline Weigh Beacon'
      && autopilot.active === false
      && autopilot.status === 'arrived';
  }, null, { timeout: 240_000 });
}

async function captureProgramCensus(page) {
  return page.evaluate(async () => {
    const state = window.SF?.state || null;
    const renderer = state?.render?.renderer || null;
    const scene = state?.render?.scene || null;
    const { getPrecompileKeepAliveDiagnostics } = await import('/src/render/precompile.js');
    const livePrograms = Array.isArray(renderer?.info?.programs) ? renderer.info.programs : [];
    const live = livePrograms.map((program) => ({
      cacheKey: String(program?.cacheKey || ''),
      name: String(program?.name || ''),
    })).filter((program) => program.cacheKey);
    const owners = [];
    scene?.traverse?.((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) {
        const current = renderer?.properties?.get?.(material)?.currentProgram;
        const cacheKey = String(current?.cacheKey || '');
        if (!cacheKey) continue;
        owners.push({
          cacheKey,
          object: String(object.name || object.type || ''),
          material: String(material.name || material.type || ''),
        });
      }
    });
    return {
      liveKeys: [...new Set(live.map((program) => program.cacheKey))].sort(),
      livePrograms: live,
      liveOwners: owners,
      keepAlive: getPrecompileKeepAliveDiagnostics(renderer),
      coverage: { ...window.__SF_PROGRAM_TIMELINE__.coverage },
    };
  });
}

function uniqueKeys(keys) {
  return [...new Set(keys.filter((key) => typeof key === 'string' && key))].sort();
}

function addedKeys(before, after) {
  const previous = new Set(before || []);
  return uniqueKeys(after || []).filter((key) => !previous.has(key));
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > -1) out[token.slice(2, eq)] = token.slice(eq + 1);
    else if (args[i + 1] && !args[i + 1].startsWith('--')) out[token.slice(2)] = args[++i];
    else out[token.slice(2)] = true;
  }
  return out;
}
