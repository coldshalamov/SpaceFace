#!/usr/bin/env node
// Shader + render-module integrity gate.
//
// WHY THIS EXISTS
// ---------------
// Before this check, NOTHING in the repo compiled GLSL or even parsed the render modules in a
// browser. Every render check either runs pure-node logic or inspects data structures, so the whole
// suite could be green while the game showed a blank starfield — or did not boot at all.
//
// That is not hypothetical. During the W3-A velocity-language work a backtick inside a GLSL comment
// terminated the surrounding JS template literal in src/render/spaceBackground.js. The module failed
// to parse, `stepPropulsion`'s renderer never came up, and the game would not boot — while
// check:speed-lines, check:sim:compare, check:sim:v3:compare, check:render-hotpath, check:flight:v3
// and check:actuator-telemetry ALL still reported PASS. It was caught only by hand-booting a browser.
//
// Two distinct failure classes are covered here, and neither is visible to a node-only test:
//   1. A render module that does not PARSE or throws on import (the template-literal trap above).
//      Surfaces as a page error.
//   2. GLSL that parses as JS but fails to COMPILE or LINK on the GPU. Surfaces in THREE's
//      per-program diagnostics — a broken program silently renders nothing rather than throwing.
//
// This is deliberately a boot-and-inspect check rather than an offline GLSL parser: the shaders that
// matter are the ones THREE actually assembles, with its own prelude, defines and injected uniforms.
// Compiling the raw source strings out of context would prove something weaker and drift from
// reality.
//
// A note on scope: this gate does NOT judge how the frame LOOKS. It asserts the pipeline is intact.
// Visual regression belongs to check:visual-stability.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const EVIDENCE_DIR = fileURLToPath(new URL('../.devshots/', import.meta.url));
const EVIDENCE_PATH = fileURLToPath(new URL('../.devshots/shader-compile-evidence.json', import.meta.url));

// A boot that produces implausibly few programs means the render graph never really came up, and a
// "zero broken programs" result would then be vacuously true. Chosen well below the ~46 observed on
// a healthy boot so ordinary content changes never trip it.
const MIN_EXPECTED_PROGRAMS = 8;

const pageErrors = [];
const consoleShaderErrors = [];

let server = null;
let browser = null;
let context = null;
let exitCode = 0;

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: true,
    args: ['--incognito', '--no-first-run', '--disable-extensions'],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  // Both listeners are armed BEFORE navigation: a module that fails to parse does so during the
  // very first evaluation, and a listener attached after goto() would miss the only report of it.
  page.on('pageerror', (error) => { pageErrors.push(String(error && error.message ? error.message : error)); });
  page.on('console', (msg) => {
    const text = msg.text();
    if (/shader|program|glsl|webgl/i.test(text) && /error|fail|invalid|could not|unable/i.test(text)) {
      consoleShaderErrors.push(text);
    }
  });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    const failurePrefix = '[render] opening submission post-submit validation failed ';
    const originalInfo = console.info;
    if (typeof originalInfo !== 'function') return;
    const [MAX_GEOMETRY_IDS, MAX_OWNERS, MAX_TRAVERSED_OBJECTS, MAX_ANCESTRY] = [8, 8, 20_000, 12];
    const packageKeys = ['flightRenderPackage', 'renderPackage', 'spacefaceRenderPackage', 'openingSubmissionPackage'];
    let captured = false;
    const text = (value, max = 160) => value == null ? null
      : typeof value === 'string' ? value.slice(0, max)
      : typeof value === 'number' || typeof value === 'boolean' ? value : null;
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const delta = (value) => value && typeof value === 'object' ? {
      programs: finite(value.programs), geometries: finite(value.geometries), textures: finite(value.textures),
    } : null;
    const list = (value, limit = MAX_GEOMETRY_IDS) => {
      if (!Array.isArray(value)) return [];
      const output = [], seen = new Set();
      for (let index = 0; index < value.length && output.length < limit; index++) {
        const entry = text(value[index]);
        const key = entry == null ? '' : String(entry);
        if (!key || seen.has(key)) continue;
        seen.add(key); output.push(key);
      }
      return output;
    };
    const attachedToScene = (object, scene) => {
      if (!object || !scene) return null;
      for (let cursor = object, depth = 0; cursor && depth < MAX_ANCESTRY * 2;
        depth++, cursor = cursor.parent || null) if (cursor === scene) return true;
      return false;
    };
    const ancestry = (object) => {
      const path = []; let cursor = object;
      for (; cursor && path.length < MAX_ANCESTRY; cursor = cursor.parent || null) {
        const parent = cursor.parent || null;
        path.push({ childIndex: parent && Array.isArray(parent.children) ? parent.children.indexOf(cursor) : null,
          name: text(cursor.name), type: text(cursor.type) });
      }
      return { path: path.reverse(), truncated: !!cursor };
    };
    const packageStamp = (object) => {
      let fallback = null;
      for (let cursor = object, depth = 0; cursor && depth < MAX_ANCESTRY * 2;
        depth++, cursor = cursor.parent || null) {
        const data = cursor.userData || {};
        for (const source of packageKeys) {
          const pkg = data[source];
          if (!pkg || typeof pkg !== 'object') continue;
          const stamp = { source, schema: text(pkg.schema), assetId: text(pkg.assetId),
            hash: text(pkg.hash ?? pkg.contentHash), producer: text(pkg.producer) };
          if (!fallback) fallback = stamp;
          if (stamp.hash != null && stamp.hash !== '') return stamp;
        }
      }
      return fallback;
    };
    const captureFailure = (validation) => {
      const value = validation && typeof validation === 'object' ? validation : {};
      const rawIds = Array.isArray(value.uncapturedGeometryBufferIds) ? value.uncapturedGeometryBufferIds : [];
      const geometryIds = list(rawIds), ids = new Set(geometryIds);
      const render = window.SF?.state?.render || null;
      const receiptPlan = render?.openingSubmissionReceipt?.plan || null;
      const planSubjects = Array.isArray(receiptPlan?.compileSubjects)
        ? receiptPlan.compileSubjects.filter((subject) => subject && typeof subject === 'object') : [];
      const plannedLeaves = new Set(planSubjects);
      const firstDrawObjects = render?.openingFirstDrawIdentityCensus?.objects instanceof Map
        ? render.openingFirstDrawIdentityCensus.objects : null;
      const scene = window.SF?.registry?.get?.('render')?.scene || null;
      const owners = [], seenObjects = new WeakSet();
      let traversedObjects = 0, traversalTruncated = false, ownersTruncated = false;
      const inspect = (object, attachedHint) => {
        const geometry = object.geometry || null;
        const uuid = text(geometry?.uuid), id = text(geometry?.id);
        if (!geometry || !((uuid != null && (ids.has(String(uuid)) || ids.has(`uuid:${uuid}`)))
          || (id != null && (ids.has(String(id)) || ids.has(`id:${id}`))))) return;
        if (owners.length >= MAX_OWNERS) { ownersTruncated = true; return; }
        const inCensus = firstDrawObjects ? firstDrawObjects.has(object) : null;
        const censusEntry = inCensus ? firstDrawObjects.get(object) : null;
        owners.push({ geometry: { uuid, id },
          object: { uuid: text(object.uuid), name: text(object.name), type: text(object.type) },
          ancestry: ancestry(object), visible: typeof object.visible === 'boolean' ? object.visible : null,
          layerMask: finite(object.layers?.mask),
          attachedToLiveScene: attachedHint == null ? attachedToScene(object, scene) : attachedHint,
          directPlanMembership: receiptPlan ? plannedLeaves.has(object) : null,
          firstDrawCensusHasObject: inCensus,
          priorGeometryUuid: text(censusEntry?.geometry?.uuid) ?? text(censusEntry?.priorGeometryUuid),
          nearestHashStamp: packageStamp(object) });
      };
      const scan = (roots, attachedHint) => {
        for (const root of roots) {
          if (!root || typeof root !== 'object') continue;
          const stack = [root];
          while (stack.length) {
            if (traversedObjects >= MAX_TRAVERSED_OBJECTS) { traversalTruncated = true; return; }
            const object = stack.pop();
            if (!object || typeof object !== 'object' || seenObjects.has(object)) continue;
            seenObjects.add(object); traversedObjects++; inspect(object, attachedHint);
            const children = object.children;
            if (Array.isArray(children)) for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
          }
        }
      };
      if (geometryIds.length) { scan(planSubjects, null); if (!traversalTruncated && scene) scan([scene], true); }
      return { schema: 'spaceface.shaderOpeningFailure.v1', observedAt: Date.now(),
        sourceValidation: { ok: typeof value.ok === 'boolean' ? value.ok : null, reason: text(value.reason),
          uncaptured: list(value.uncaptured), uncapturedGeometryBufferIds: geometryIds, delta: delta(value.delta),
          firstVisibleDelta: delta(value.firstVisibleGpuCounts?.delta) },
        uncapturedGeometryBufferIds: geometryIds, geometryIdCount: rawIds.length,
        geometryIdsTruncated: rawIds.length > geometryIds.length, owners, ownersTruncated,
        traversal: { traversedObjects, maxObjects: MAX_TRAVERSED_OBJECTS, truncated: traversalTruncated,
          plannedLeaves: planSubjects.length },
        timestamps: { worldSubmittedFrames: finite(render?.worldSubmittedFrames),
          openingSubmissionFirstDrawSubmittedAt: finite(render?.openingSubmissionFirstDrawSubmittedAt),
          firstPlayableFrameAt: finite(render?.firstPlayableFrameAt), firstPlayablePaintAt: finite(render?.firstPlayablePaintAt) } };
    };
    console.info = function (...args) {
      try {
        if (!captured && typeof args[0] === 'string' && args[0].startsWith(failurePrefix)) {
          captured = true;
          window.__SF_SHADER_OPENING_FAILURE__ = captureFailure(args[1]);
        }
      } catch (error) {
        window.__SF_SHADER_OPENING_FAILURE__ = { schema: 'spaceface.shaderOpeningFailure.v1',
          observedAt: Date.now(), captureError: text(error && error.message ? error.message : error) };
      } finally { return Reflect.apply(originalInfo, this, args); }
    };
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await bootToFlight(page);

  // Let the renderer settle so lazily-compiled programs (post FX, background, VFX) are assembled.
  // Programs compile on first use, so sampling too early would under-count and weaken the gate.
  await page.waitForTimeout(2_500);

  const diagnostics = await readProgramDiagnostics(page);
  const openingFailure = await page.evaluate(
    () => window.__SF_SHADER_OPENING_FAILURE__ || null,
  ).catch(() => null);

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify({
    schema: 'spaceface.shaderCompile.v1',
    programs: diagnostics.programs,
    broken: diagnostics.broken,
    pageErrors,
    consoleShaderErrors,
    openingFailure,
  }, null, 2)}\n`, 'utf8');

  // --- Assertions, ordered so the most diagnostic failure reports first ---------------------

  assert.deepEqual(pageErrors, [],
    `a render/module page error means the game does not boot; a node-only suite cannot see this:\n${pageErrors.join('\n')}`);

  assert.equal(diagnostics.rendererFound, true,
    'no THREE renderer was reachable for inspection — the render system did not initialize');

  assert.ok(diagnostics.programs >= MIN_EXPECTED_PROGRAMS,
    `only ${diagnostics.programs} GL programs compiled (expected >= ${MIN_EXPECTED_PROGRAMS}); `
    + 'the render graph did not fully come up, which would make a "no broken shaders" result vacuous');

  assert.deepEqual(diagnostics.broken, [],
    `GLSL failed to compile or link. A broken program renders NOTHING rather than throwing, so this `
    + `is invisible to every other check:\n${diagnostics.broken.map((b) => `  ${b.name}: ${b.log}`).join('\n')}`);

  assert.deepEqual(consoleShaderErrors, [],
    `WebGL reported shader errors on the console:\n${consoleShaderErrors.join('\n')}`);

  console.log(`[shader-compile] PASS — ${diagnostics.programs} GL programs compiled and linked, 0 broken, 0 page errors`);
  console.log(`[shader-compile] evidence: ${EVIDENCE_PATH.replace(ROOT, '')}`);
} catch (error) {
  exitCode = 1;
  console.error(`[shader-compile] FAIL: ${error && error.message ? error.message : error}`);
  if (pageErrors.length) console.error(`[shader-compile] page errors:\n${pageErrors.join('\n')}`);
  if (consoleShaderErrors.length) console.error(`[shader-compile] shader console errors:\n${consoleShaderErrors.join('\n')}`);
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.release?.().catch(() => {});
}

process.exit(exitCode);

async function bootToFlight(page) {
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), null, {
    timeout: 60_000,
  });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  // Gate on flight mode only. This check is about pipeline integrity, so it must NOT depend on
  // authored-asset readiness — see the D11 predicate correction in
  // scripts/lib/professionalTravelPublicRoute.mjs for why an asset-readiness condition does not
  // belong in a gate that is asking a different question.
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, null, { timeout: 180_000 });
  const begin = page.getByRole('button', { name: /begin/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
}

async function readProgramDiagnostics(page) {
  return page.evaluate(() => {
    const renderer = window.SF?.state?.render?.renderer || window.SF?.renderer || null;
    const programs = renderer?.info?.programs || null;
    if (!renderer || !programs) return { rendererFound: false, programs: 0, broken: [] };
    // THREE only populates `diagnostics` when the context has debug info available; a program with
    // no diagnostics object is reported as healthy rather than assumed broken, so this gate cannot
    // produce false failures on drivers that withhold the extension.
    const broken = programs
      .filter((program) => program.diagnostics && program.diagnostics.runnable === false)
      .map((program) => ({
        name: String(program.name || 'unnamed'),
        log: String(program.diagnostics.programLog || program.diagnostics.fragmentShader?.log
          || program.diagnostics.vertexShader?.log || 'no log'),
      }));
    return { rendererFound: true, programs: programs.length, broken };
  });
}
