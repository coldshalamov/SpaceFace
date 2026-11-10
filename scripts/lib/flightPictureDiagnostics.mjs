import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureStationHandoffScreenshot } from './stationHandoffDiagnostics.mjs';

// Separate from the acceptance collector: keep bounded graphics warnings and otherwise-ignored
// validation messages as evidence, without weakening or adding any acceptance filter.
export function observeGraphicsMessages(page) {
  const messages = [];
  const listener = (message) => {
    const type = message.type();
    const text = message.text();
    if (!/GPU:|shader|webgl|context.?lost|swiftshader/i.test(text)) return;
    if (messages.length < 24) messages.push({ type, text: text.slice(0, 1600) });
  };
  page.on('console', listener);
  return { snapshot: () => messages.slice(), dispose: () => page.off('console', listener) };
}

// This runs in the page. No gameplay or quality mutation. Existing getReport refreshes
// diagnostic telemetry (including busFaults). Never enable overlays, force quality, advance simulation,
// or treat prepareFrame's presentCount as GPU completion.
export function readFlightPictureSnapshot() {
  const state = window.SF?.state;
  const render = state?.render;
  let post = null;
  let postError = null;
  try { post = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.()?.post ?? null; }
  catch (error) { postError = String(error?.message || error).slice(0, 1000); }
  const bloom = post?.bloom;
  return {
    observedAtMs: performance.now(), mode: state?.mode ?? null,
    presentCount: render?.presentCount ?? null,
    presentCountMeaning: 'prepareFrame entries, not GPU completion',
    firstPlayableFrameAt: render?.firstPlayableFrameAt ?? null,
    gpu: render?.gpu ? { ...render.gpu } : null,
    softwareRenderer: render?.softwareRenderer ?? null,
    dynResScale: render?.dynResScale ?? null,
    video: state?.settings?.video ? { ...state.settings.video } : null,
    postError,
    post: post ? {
      activePath: post.activePath ?? null,
      effectiveSceneScale: post.effectiveSceneScale ?? null,
      drawingBufferWidth: post.drawingBufferWidth ?? null,
      drawingBufferHeight: post.drawingBufferHeight ?? null,
      nativeFallbackReason: post.nativeFallbackReason ?? null,
      renderGraphFallbackReason: post.renderGraphFallbackReason ?? null,
      contentWidth: bloom?.contentWidth ?? null, contentHeight: bloom?.contentHeight ?? null,
      contentScale: bloom?.contentScale ?? null, casSharpenActive: bloom?.casSharpenActive ?? null,
      grain: bloom?.grain ?? null,
    } : null,
  };
}

export async function captureFlightPicturePair(page, {
  graphicsMessages = () => [],
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  capture = captureStationHandoffScreenshot,
  save = async report => {
    const dir = resolve('scratch/check-ci-report/station-handoff');
    await mkdir(dir, { recursive: true });
    const path = resolve(dir, `${Date.now()}-47a-picture-pair.json`);
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    return path;
  },
} = {}) {
  const startedAt = now();
  const deadline = startedAt + 10000;
  let observationClosed = false;
  const beforeScreenshotDispatch = () => {
    if (observationClosed || now() >= deadline) throw new Error('picture observation deadline exceeded');
  };
  // Per-capture cap for this diagnostic only; evaluated after filesystem preparation.
  const screenshotTimeoutMs = () => Math.min(4000, Math.max(1, deadline - now()));
  const report = {
    schema: 'spaceface.flightPicturePair.v1',
    label: '47-A CI flight after actor/safety checks and post-opening dialogue fixture',
    visualAcceptance: false, status: 'unavailable', samples: [], screenshots: [], errors: [],
    elapsedMs: 0, graphicsMessages: [],
  };
  const bounded = async operation => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('picture observation deadline exceeded');
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => { timer = setTimeout(() => { observationClosed = true; reject(new Error('picture observation deadline exceeded')); }, remaining); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  try {
    const first = await bounded(() => page.evaluate(readFlightPictureSnapshot));
    report.samples.push(first);
    report.screenshots.push(await bounded(() => capture(page, { boundary: '47a-actors-bound' }, { beforeScreenshotDispatch, screenshotTimeoutMs })));
    // Wait at least two wall seconds from the first observation, plus renderer progression.
    // Poll cheap scalar state only; expensive getReport runs at most twice in the entire hook.
    const firstObservedAt = now();
    let progressed = false;
    while (now() - firstObservedAt < 2000 || !progressed) {
      await bounded(() => sleep(Math.min(250, Math.max(1, deadline - now()))));
      const count = await bounded(() => page.evaluate(() => window.SF?.state?.render?.presentCount ?? null));
      progressed = Number.isFinite(first?.presentCount) && Number.isFinite(count) && count > first.presentCount;
    }
    const second = await bounded(() => page.evaluate(readFlightPictureSnapshot));
    report.samples.push(second);
    report.screenshots.push(await bounded(() => capture(page, { boundary: '47a-picture-later' }, { beforeScreenshotDispatch, screenshotTimeoutMs })));
    const complete = report.samples.every(s => Number.isFinite(s?.post?.effectiveSceneScale)
      && Number.isFinite(s?.dynResScale) && Number.isFinite(s?.firstPlayableFrameAt) && s?.gpu);
    report.status = !complete ? 'telemetry-incomplete'
      : first.post.effectiveSceneScale === second.post.effectiveSceneScale
        && first.dynResScale === second.dynResScale ? 'scale-unchanged-not-visual-acceptance' : 'scale-changing';
  } catch (error) {
    report.status = /deadline exceeded/.test(String(error?.message)) ? 'observation-timeout' : 'observation-failed';
    report.errors.push(String(error?.message || error).slice(0, 1000));
  }
  observationClosed = true;
  report.elapsedMs = now() - startedAt;
  report.graphicsMessages = graphicsMessages().slice(0, 24);
  // A timed-out page request cannot be cancelled by Playwright, but no later page operation is
  // started here. Normal checker cleanup closes the owned browser. Saving never alters its gates.
  const path = await save(report);
  return { path, report };
}
