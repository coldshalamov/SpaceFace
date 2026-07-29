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

    function materialLayout(material) {
      if (!material) return null;
      const hashText = (value) => {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return `${(hash >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
      };
      return {
        name: String(material.name || ''),
        type: String(material.type || ''),
        transparent: material.transparent === true,
        depthWrite: material.depthWrite !== false,
        depthTest: material.depthTest !== false,
        side: Number(material.side),
        blending: Number(material.blending),
        forceSinglePass: material.forceSinglePass === true,
        vertexColors: material.vertexColors === true,
        fog: material.fog === true,
        lights: material.lights === true,
        toneMapped: material.toneMapped !== false,
        maps: [
          'map', 'alphaMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap',
        ].filter((key) => !!material[key]),
        hasCustomProgramCacheKey: typeof material.customProgramCacheKey === 'function',
        vertexShader: material.isShaderMaterial ? hashText(material.vertexShader) : null,
        fragmentShader: material.isShaderMaterial ? hashText(material.fragmentShader) : null,
        uniforms: material.uniforms && typeof material.uniforms === 'object'
          ? Object.keys(material.uniforms).sort()
          : [],
        defines: material.defines && typeof material.defines === 'object'
          ? Object.keys(material.defines).sort()
          : [],
      };
    }

    function renderOwner(object, material) {
      const path = [];
      let cursor = object;
      while (cursor && path.length < 8) {
        path.push(String(cursor.name || cursor.type || '(unnamed)'));
        cursor = cursor.parent;
      }
      const data = object && object.userData || {};
      return {
        objectName: String(object?.name || ''),
        objectType: String(object?.type || ''),
        isInstancedMesh: object?.isInstancedMesh === true,
        isPoints: object?.isPoints === true,
        geometryAttributes: object?.geometry?.attributes
          ? Object.keys(object.geometry.attributes).sort()
          : [],
        path,
        material: materialLayout(material),
        role: String(
          data.shipAuxPool
          || data.asteroidInstanceTypeId
          || data.spacefacePartUrl
          || data.kind
          || '',
        ),
        tags: data.spacefaceTags && { ...data.spacefaceTags },
      };
    }

    function installRenderOwnerCapture(renderer) {
      if (!renderer || renderer.__sfRenderOwnerCapture || typeof renderer.renderBufferDirect !== 'function') return;
      renderer.__sfRenderOwnerCapture = true;
      const originalRenderBufferDirect = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function renderBufferDirect(camera, scene, geometry, material, object, group) {
        const linksBeforeDraw = linkEvents.length;
        try {
          return originalRenderBufferDirect.call(this, camera, scene, geometry, material, object, group);
        } finally {
          if (linkEvents.length > linksBeforeDraw) {
            // Diagnostics must never change renderer behavior. Materials and userData are authored
            // extension surfaces and may expose getters/proxies, so attribution is deliberately
            // fail-open and never invokes an arbitrary material callback.
            let owner;
            try {
              owner = renderOwner(object, material);
            } catch (error) {
              owner = {
                objectName: '',
                objectType: '',
                path: [],
                material: null,
                role: '',
                tags: null,
                captureError: String(error?.message || error),
              };
            }
            for (let i = linksBeforeDraw; i < linkEvents.length; i++) {
              if (!linkEvents[i].owner) linkEvents[i].owner = owner;
            }
          }
        }
      };
    }

    function sample() {
      const state = window.SF && window.SF.state;
      if (state && state.mode === 'flight') flightFrame = flightFrame < 0 ? 0 : flightFrame + 1;

      const renderer = state && state.render && state.render.renderer;
      installRenderOwnerCapture(renderer);
      const programs = renderer && renderer.info && renderer.info.programs;
      if (programs) {
        for (let i = 0; i < programs.length; i++) {
          const program = programs[i];
          // THREE reuses a cached program when the cacheKey matches, incrementing usedTimes rather
          // than linking again. A genuinely NEW entry is therefore exactly one compile+link.
          const identity = program.id != null ? `id:${program.id}` : `key:${program.cacheKey}`;
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
    const lastProgram = timeline.events.length
      ? timeline.events[timeline.events.length - 1].flightFrame
      : -1;
    const lastLink = timeline.linkEvents.length
      ? timeline.linkEvents[timeline.linkEvents.length - 1].flightFrame
      : -1;
    const last = Math.max(lastProgram, lastLink);
    // last < 0 means every program/link happened before flight mode: already quiescent.
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

  // --- Phase 1: idle flight (no input) --------------------------------------------------------
  enterStage('idle-flight');
  await waitFlightFrames(page, IDLE_FRAMES);
  const afterIdle = await page.evaluate(() => ({
    flightFrame: window.__SF_PROGRAM_TIMELINE__.flightFrame,
    eventCount: window.__SF_PROGRAM_TIMELINE__.events.length,
    linkCount: window.__SF_PROGRAM_TIMELINE__.linkCount,
  }));

  // --- Phase 2: scripted stimulus -------------------------------------------------------------
  // Idle flight never exercises weapons, boost plumes or countermeasures, so a program that only
  // compiles when the player first fires would read as 0 in an idle-only run. This phase makes the
  // idle number honest about what it does and does not cover.
  await applyStimulus(page, STIMULUS_FRAMES);
  const afterStimulus = await page.evaluate(() => ({
    flightFrame: window.__SF_PROGRAM_TIMELINE__.flightFrame,
    eventCount: window.__SF_PROGRAM_TIMELINE__.events.length,
    linkCount: window.__SF_PROGRAM_TIMELINE__.linkCount,
  }));

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
    schema: 'spaceface.shaderCompileTimeline.v1',
    tier: 1,
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
    if (link.owner) {
      console.log(`         owner=${link.owner.path.join(' <- ')} material=${link.owner.material?.name || '(unnamed)'} `
        + `type=${link.owner.material?.type || '?'} role=${link.owner.role || '-'}`);
    }
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
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  enterStage('boot:new-game');
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
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
