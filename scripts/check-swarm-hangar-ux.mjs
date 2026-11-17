#!/usr/bin/env node
// Public-input regression for title hit targets and ship-first Swarm preparation.
// Run under the shared game lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/check-swarm-hangar-ux.mjs [--live | --live-only]
// Bench evidence covers the actual screen modules and launch intent. --live additionally
// checks a fresh-profile title -> hangar -> opening armory -> combat route. --live-only runs
// that source route independently of the bench. Neither is a performance measurement or a
// substitute for looking at the captured screens.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium } from './player-truth/browser.mjs';
import { bootToMenu, waitBootOverlayGone } from './player-truth/routes.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('check-swarm-hangar-ux.mjs [--live | --live-only] [--viewports=1920x1080,1440x900,960x540,390x844] [--out=.devshots/swarm-hangar-ux]');
  console.log('--live adds the live source route after the bench; --live-only runs only that route. --viewports configures the bench; the live route uses 1440x900.');
  process.exit(0);
}
for (const arg of args) assert.ok(arg === '--live' || arg === '--live-only' || arg.startsWith('--viewports=') || arg.startsWith('--out='), `Unknown option: ${arg}`);
const liveOnly = args.includes('--live-only');
const runLive = liveOnly || args.includes('--live');
assert.ok(!(liveOnly && args.includes('--live')), 'Use either --live or --live-only.');
const LIVE_VIEWPORT = { width: 1440, height: 900 };
const out = path.resolve(repo, args.find(arg => arg.startsWith('--out='))?.slice(6) || '.devshots/swarm-hangar-ux');
const allowedOut = path.join(repo, '.devshots') + path.sep;
assert.ok(out.startsWith(allowedOut), 'Probe output must stay inside the ignored .devshots tree.');
const sizes = (args.find(arg => arg.startsWith('--viewports='))?.slice(12) || '1920x1080,1440x900,960x540,390x844').split(',').map(value => {
  const match = /^(\d+)x(\d+)$/.exec(value);
  assert.ok(match && Number(match[1]) > 0 && Number(match[2]) > 0, `Invalid viewport: ${value}`);
  return { width: Number(match[1]), height: Number(match[2]) };
});
mkdirSync(out, { recursive: true });
const S = {
  title: 'li.of-title-door.is-swarm > button[data-action="swarm"]',
  root: '.orr-swarm-hangar', hull: '[data-swarm-hull]', kit: '[data-swarm-kit]',
  preview: '.sf-hangar-shipstage', next: '.sf-hangar-next', review: '.sf-swarm-enter-key',
  arena: '.sf-crd-arena-choice[data-arena-id]', difficulty: '.sf-crd-stake[data-stake-id]',
};
const report = {
  pass: false, startedAt: new Date().toISOString(), viewports: liveOnly ? [LIVE_VIEWPORT] : sizes,
  bench: { requested: !liveOnly, viewports: liveOnly ? [] : sizes }, checks: [], screenshots: [], previewCaptures: [],
  animationSettlements: [], equipmentGeometry: [], initialReadiness: [], pointerGeometry: [],
  browserErrors: [], requestFailures: [], live: { requested: runLive, completed: false, viewport: LIVE_VIEWPORT },
  scope: 'Real mouse and keyboard input. DOM, bench log and runtime state are read-only observers. '
    + (liveOnly ? 'Public source route only; no bench fixtures. Runtime combat evidence is required for completion.'
      : 'Bench launch is an intent, not proof of combat.'),
};
const check = (name, evidence = {}) => { report.checks.push({ name, ...evidence }); console.log(`[hangar-ux] ${name}`); };
const shipAssetRequests = new WeakMap();
let server, browser, currentPage;
const cleanup = async () => {
  if (browser) { const closing = browser; browser = null; await closing.close().catch(() => {}); }
  if (server) { const closing = server; server = null; await closing.close().catch(() => {}); }
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129));
});

function observeErrors(page, label) {
  const assets = { pending: new Map(), recent: [] };
  shipAssetRequests.set(page, assets);
  page.on('request', request => {
    if (!request.url().includes('/assets/ships/')) return;
    assets.pending.set(request, { url: request.url(), type: request.resourceType(),
      startedAt: new Date().toISOString(), startedMs: performance.now() });
  });
  const finishAsset = (request, outcome) => {
    const entry = assets.pending.get(request);
    if (!entry) return;
    assets.pending.delete(request);
    assets.recent.push({ ...entry, outcome, elapsedMs: Math.round(performance.now() - entry.startedMs) });
    if (assets.recent.length > 40) assets.recent.shift();
  };
  page.on('requestfinished', request => finishAsset(request, 'finished'));
  page.on('pageerror', error => report.browserErrors.push({ route: label, error: String(error) }));
  page.on('requestfailed', request => {
    // Navigation intentionally cancels preview fetches; preserve these as diagnostics, not
    // asset-failure verdicts. Required visible art is checked at its actual use below.
    report.requestFailures.push({ route: label, url: request.url(), error: request.failure()?.errorText });
    finishAsset(request, request.failure()?.errorText || 'failed');
  });
}
async function shot(page, name) {
  const filename = `${name}.png`;
  const capture = { screenshot: filename, startedAt: new Date().toISOString(), completed: false };
  (report.captureTimings ||= []).push(capture);
  const started = performance.now();
  try {
    // Software GL can delay compositor readback after the controls are ready. Keep
    // input/readiness deadlines separate, and retain capture cost as evidence.
    await page.screenshot({ path: path.join(out, filename), timeout: 60000 });
    capture.completed = true;
  } finally { capture.elapsedMs = Math.round(performance.now() - started); }
  report.screenshots.push(filename);
}
async function shipShot(page, name, { hullId, posterUrl, selector = S.preview }) {
  const stage = page.locator(selector);
  await stage.waitFor({ state: 'visible' });
  await stage.scrollIntoViewIfNeeded();
  const readiness = await page.waitForFunction(async ({ selector, hullId, posterUrl }) => {
    const host = document.querySelector(selector);
    if (!host || host.dataset.hullId !== hullId) return false;
    const visible = element => {
      if (!element || element.hidden) return false;
      const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && css.display !== 'none'
        && css.visibility !== 'hidden' && Number(css.opacity) > 0;
    };
    if (!visible(host)) return false;
    const canvas = host.querySelector('canvas');
    // is-live is the stage owner's authored-asset settlement signal. A merely mounted
    // canvas can still be blank while the selected hull streams in; neither proves GPU completion.
    if (host.classList.contains('is-live') && visible(canvas) && canvas.width > 0 && canvas.height > 0) {
      return { mode: 'live', hullId, backingWidth: canvas.width, backingHeight: canvas.height };
    }
    const poster = [...host.querySelectorAll('img')].find(image =>
      visible(image) && image.complete && image.naturalWidth > 0
      && (image.currentSrc || image.src) === posterUrl);
    if (!poster) return false;
    try { await poster.decode(); } catch { return false; }
    // The source can change while decode is in flight. Do not photograph the previous hull.
    if (host.dataset.hullId !== hullId || (poster.currentSrc || poster.src) !== posterUrl || !visible(poster)) return false;
    return { mode: 'fallback', hullId, posterUrl, decoded: true,
      naturalWidth: poster.naturalWidth, naturalHeight: poster.naturalHeight };
  }, { selector, hullId, posterUrl });
  const evidence = await readiness.jsonValue();
  await readiness.dispose();
  await settleFiniteAnimations(page, selector === S.preview ? S.root : selector, name);
  if (selector === S.preview) await assertEquipmentGeometry(page, name);
  await shot(page, name);
  report.previewCaptures.push({ screenshot: `${name}.png`, selector, ...evidence });
  return evidence;
}
async function settleFiniteAnimations(page, selector, capture) {
  // Observe the real finish; do not pause/finish animations or sample after a fixed sleep.
  // Infinite ambience and scroll-driven effects have no finite resting state to await.
  await page.evaluate(() => document.fonts.ready);
  const pending = element => element.getAnimations({ subtree: true }).filter(animation =>
    (animation.playState === 'running' || animation.pending)
      && (!animation.timeline || animation.timeline === document.timeline)
      && Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => ({
    name: animation.animationName || animation.transitionProperty || animation.id || 'web-animation',
    target: animation.effect?.target?.className?.toString() || '',
    currentTime: animation.currentTime, endTime: animation.effect.getComputedTiming().endTime,
  }));
  const before = await page.locator(selector).evaluate(pending);
  const evidence = { capture, selector, pendingBefore: before, settled: false };
  report.animationSettlements.push(evidence);
  try {
    await page.waitForFunction(selector => {
      const element = document.querySelector(selector);
      return element && !element.getAnimations({ subtree: true }).some(animation =>
        (animation.playState === 'running' || animation.pending)
          && (!animation.timeline || animation.timeline === document.timeline)
          && Number.isFinite(animation.effect?.getComputedTiming().endTime));
    }, selector, { polling: 'raf', timeout: 5000 });
    evidence.settled = true;
  } finally {
    evidence.pendingAfter = await page.locator(selector).evaluate(pending).catch(() => []);
  }
}
async function assertEquipmentGeometry(page, capture) {
  const geometry = await page.evaluate(() => {
    const box = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.right - rect.left, height: rect.bottom - rect.top });
    const intersect = (a, b) => {
      if (!a || !b) return null;
      const result = box({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
      return result.width > 0 && result.height > 0 ? result : null;
    };
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const visibleClip = element => {
      let clip = viewport;
      for (let node = element; node && clip; node = node.parentElement) {
        const css = getComputedStyle(node);
        if (node.hidden || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return null;
        const clipX = /^(auto|scroll|hidden|clip)$/.test(css.overflowX);
        const clipY = /^(auto|scroll|hidden|clip)$/.test(css.overflowY);
        if (!clipX && !clipY) continue;
        const rect = node.getBoundingClientRect();
        const scaleX = node.offsetWidth ? rect.width / node.offsetWidth : 1;
        const scaleY = node.offsetHeight ? rect.height / node.offsetHeight : 1;
        const left = rect.left + node.clientLeft * scaleX, top = rect.top + node.clientTop * scaleY;
        clip = intersect(clip, {
          left: clipX ? left : clip.left, right: clipX ? left + node.clientWidth * scaleX : clip.right,
          top: clipY ? top : clip.top, bottom: clipY ? top + node.clientHeight * scaleY : clip.bottom,
        });
      }
      return clip;
    };
    const manifest = document.querySelector('.sf-hangar-manifest');
    const items = [...(manifest?.querySelectorAll('.sf-hangar-fitting') || [])].map((item, index) => {
      const rect = box(item.getBoundingClientRect()), clip = visibleClip(item);
      const labels = [...item.querySelectorAll('small,strong')].map(label => {
        const range = document.createRange(); range.selectNodeContents(label);
        const rects = [...range.getClientRects()].map(box); range.detach();
        const textClip = visibleClip(label), css = getComputedStyle(label);
        return { tag: label.tagName, text: label.textContent.trim(), rect: box(label.getBoundingClientRect()),
          rects, visibleRects: rects.map(rect => intersect(rect, textClip)).filter(Boolean),
          fontSize: css.fontSize, lineHeight: css.lineHeight, position: css.position, transform: css.transform };
      });
      return { index, text: item.textContent.trim(), rect, clip, visibleRect: intersect(rect, clip), labels };
    });
    const overlaps = [];
    const add = (kind, a, b, rect, labels) => {
      // Shared edges and subpixel rounding are not positive-area collisions.
      if (rect && rect.width > .5 && rect.height > .5) overlaps.push({ kind, items: [a.index, b.index], rect, ...(labels ? { labels } : {}) });
    };
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const left = items[a], right = items[b];
      add('item-boxes', left, right, intersect(left.visibleRect, right.visibleRect));
      for (const first of left.labels) for (const second of right.labels)
        for (const ra of first.visibleRects) for (const rb of second.visibleRects)
          add('text-lines', left, right, intersect(ra, rb), [first.text, second.text]);
    }
    return { viewport: box(viewport), manifest: manifest ? { rect: box(manifest.getBoundingClientRect()),
      scrollTop: manifest.scrollTop, scrollHeight: manifest.scrollHeight, clientHeight: manifest.clientHeight } : null,
      items, visibleItems: items.filter(item => item.visibleRect).length, overlaps };
  });
  report.equipmentGeometry.push({ capture, ...geometry });
  assert.ok(geometry.items.length, 'Selected ship has no installed-equipment entries to inspect.');
  assert.deepEqual(geometry.overlaps, [], `Installed-equipment entries overlap at ${capture}; see equipmentGeometry in checks.json.`);
}
async function waitArenaImage(page) {
  await page.waitForFunction(async () => {
    const image = document.querySelector('.orr-door-hero__art.is-on');
    if (!image?.complete || image.naturalWidth < 1) return false;
    const src = image.currentSrc || image.src;
    try { await image.decode(); } catch { return false; }
    return image.classList.contains('is-on') && (image.currentSrc || image.src) === src
      && !document.querySelector('.orr-door-hero__words.is-turning');
  });
}
function inspectPointerTarget(element, fraction) {
  const rect = element.getBoundingClientRect();
  const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const point = { x: rect.x + rect.width * fraction.x, y: rect.y + rect.height * fraction.y };
  const control = element.closest('button,summary,input,textarea,[role="button"]') || element;
  const target = document.elementFromPoint(point.x, point.y);
  return { box, point, viewport: { width: innerWidth, height: innerHeight },
    fullyInside: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
      && rect.right <= innerWidth && rect.bottom <= innerHeight,
    intendedHit: target === control || control.contains(target),
    control: { tag: control.tagName, action: control.getAttribute('data-action'),
      label: control.getAttribute('aria-label') || control.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) },
    hit: target ? { tag: target.tagName, class: target.getAttribute('class') } : null };
}
async function pointFor(locator, fraction = { x: .5, y: .5 }) {
  await locator.waitFor({ state: 'visible' });
  const before = await locator.evaluate(inspectPointerTarget, fraction);
  const evidence = { fraction, before, branch: before.fullyInside && before.intendedHit ? 'already-visible' : 'scroll', after: null };
  report.pointerGeometry.push(evidence);
  const started = performance.now();
  try {
    // Scrolling an already visible target invokes Playwright's stability wait even
    // when no scroll is needed. Use its current native hit target in that case.
    if (evidence.branch === 'scroll') await locator.scrollIntoViewIfNeeded();
    // Re-read geometry after either branch; clickAt still checks enabled/inert and
    // elementFromPoint immediately before sending the real mouse event.
    const after = evidence.after = await locator.evaluate(inspectPointerTarget, fraction);
    assert.ok(after.box.width > 0 && after.box.height > 0, 'The public control has no clickable box.');
    return after.point;
  } finally { evidence.elapsedMs = Math.round(performance.now() - started); }
}
async function assertControlEnabled(locator, reason = 'Public control must accept input') {
  const state = await locator.evaluate(element => {
    const control = element.closest('button,summary,input,textarea,[role="button"]') || element;
    return {
      tag: control.tagName,
      action: control.getAttribute('data-action'),
      label: control.getAttribute('aria-label') || control.textContent.trim().replace(/\s+/g, ' ').slice(0, 160),
      disabled: control.matches(':disabled'),
      ariaDisabled: !!control.closest('[aria-disabled="true"]'),
      inert: !!control.closest('[inert]'),
    };
  });
  assert.ok(!state.disabled && !state.ariaDisabled && !state.inert, `${reason}: ${JSON.stringify(state)}`);
}
async function clickAt(page, locator, fraction) {
  const point = await pointFor(locator, fraction);
  await assertControlEnabled(locator, 'Cannot click a disabled public control');
  const hit = await locator.evaluate((element, p) => {
    const control = element.closest('button,summary,input,textarea,[role="button"]') || element;
    const target = document.elementFromPoint(p.x, p.y);
    return target === control || control.contains(target);
  }, point);
  assert.ok(hit, `Another surface intercepts ${await locator.getAttribute('class') || await locator.getAttribute('aria-label')} at ${JSON.stringify(point)}`);
  await page.mouse.click(point.x, point.y);
  return point;
}
async function tabTo(page, locator) {
  // Tab, not programmatic focus: this checks the real focus order and hidden-control escape.
  const limit = await page.locator('button,input,textarea,select,a[href],[tabindex],summary').count() + 2;
  for (let count = 0; count < limit; count++) {
    if (await locator.evaluate(element => element === document.activeElement)) return count;
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.sf-hangar-source-controls')), false,
      'Hidden canonical controls must never take keyboard focus.');
  }
  throw new Error('Public control was not reachable by Tab.');
}
async function assertNoSelection(page, locator) {
  const point = await pointFor(locator);
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
  assert.equal(await page.evaluate(() => window.getSelection()?.toString() || ''), '', 'Menu text became selected after a double-click.');
}
async function assertNoOverflow(page) {
  const box = await page.locator(S.root).evaluate(element => ({
    scrollWidth: element.scrollWidth, width: element.clientWidth, viewport: innerWidth,
    left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(box.scrollWidth <= box.width + 1 && box.left >= -1 && box.right <= box.viewport + 1
    && box.documentWidth <= box.viewport + 1, `Horizontal overflow: ${JSON.stringify(box)}`);
  return box;
}
async function initialAuthoredHangarReady(page, { allowPosterFallback = false } = {}) {
  // Initial authored loading has its own finite boundary. It does not enlarge the
  // ordinary input/read deadlines or excuse an unresponsive control after arrival.
  const timeoutMs = 60000, started = performance.now();
  const evidence = { startedAt: new Date().toISOString(), url: page.url(), viewport: page.viewportSize(),
    timeoutMs, allowPosterFallback, completed: false, observations: 0, coherentFrames: 0, largestObservationGaps: [], lastState: null,
    meaning: 'Selected authored-stage settlement (or an explicitly certified decoded poster on the source route) '
      + 'and two responsive animation-frame observations; '
      + 'not a GPU-completion witness or a performance result.' };
  report.initialReadiness.push(evidence);
  const assetContext = () => {
    const assets = shipAssetRequests.get(page);
    return { pending: [...(assets?.pending.values() || [])].map(({ startedMs, ...entry }) =>
      ({ ...entry, ageMs: Math.round(performance.now() - startedMs) })),
    recent: (assets?.recent || []).map(({ startedMs, ...entry }) => entry) };
  };
  let stopped = false, timer, previousFrame = null, previousKey = null;
  const observe = async () => {
    while (!stopped) {
      const dispatched = performance.now();
      const state = await page.evaluate(({ selectors, allowPosterFallback }) => new Promise(resolve => {
        const requestedAt = performance.now();
        requestAnimationFrame(async frameAt => {
          const rafWaitMs = performance.now() - requestedAt;
          const box = element => {
            if (!element) return null;
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          const visible = element => {
            if (!element?.isConnected) return false;
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0
              || rect.left >= innerWidth || rect.top >= innerHeight) return false;
            for (let node = element; node; node = node.parentElement) {
              const css = getComputedStyle(node);
              if (node.hidden || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) <= 0) return false;
            }
            return true;
          };
          const root = document.querySelector(selectors.root);
          const hulls = [...(root?.querySelectorAll(`${selectors.hull}[aria-pressed="true"]`) || [])];
          const kits = [...(root?.querySelectorAll(`${selectors.kit}[aria-pressed="true"]`) || [])];
          const nav = root?.querySelector('[data-swarm-step="0"]');
          const stage = root?.querySelector(selectors.preview), canvas = stage?.querySelector('canvas');
          const poster = stage?.querySelector('img');
          const posterSrc = poster?.currentSrc || poster?.src;
          const selectedPosterSrc = hulls[0]?.querySelector('img')?.src;
          let posterDecoded = false;
          // Only the adapter knows whether a live mount exists. Its explicit no-mount
          // marker may certify the authored still on the source route; a covering poster
          // while a live model is pending cannot satisfy this check. The bench stays live-only.
          if (allowPosterFallback && root?.dataset.kReady === '1' && root.dataset.hangarVisual === 'ship-poster'
            && posterSrc && posterSrc === selectedPosterSrc && visible(poster) && poster.complete && poster.naturalWidth > 0) {
            try {
              await poster.decode();
              posterDecoded = root.dataset.kReady === '1' && root.dataset.hangarVisual === 'ship-poster'
                && stage.isConnected && stage.dataset.hullId === hulls[0]?.dataset.swarmHull
                && root.querySelector(`${selectors.hull}[aria-pressed="true"]`) === hulls[0]
                && (poster.currentSrc || poster.src) === posterSrc && poster.complete && poster.naturalWidth > 0 && visible(poster);
            } catch { /* A failed decode remains a readiness failure. */ }
          }
          const result = {
            frameAtMs: frameAt, observedAtMs: performance.now(), rafWaitMs,
            rootPresent: !!root, rootVisible: visible(root), step: root?.dataset.prepStep || null,
            ownerReady: root?.dataset.kReady === '1', ownerVisual: root?.dataset.hangarVisual || null,
            navPresent: !!nav, navVisible: visible(nav), navCurrent: nav?.getAttribute('aria-current') || null,
            selectedHullCount: hulls.length, selectedHull: hulls[0]?.dataset.swarmHull || null,
            selectedHullName: hulls[0]?.querySelector('strong')?.textContent.trim() || null,
            selectedKitCount: kits.length, selectedKit: kits[0]?.dataset.swarmKit || null,
            selectedKitDisabled: kits[0]?.getAttribute('aria-disabled') === 'true',
            previewHull: stage?.dataset.hullId || null, stageVisible: visible(stage), stageBox: box(stage),
            authoredSettled: !!stage?.classList.contains('is-live'),
            canvas: { visible: visible(canvas), width: canvas?.width || 0, height: canvas?.height || 0, box: box(canvas) },
            poster: poster ? { src: poster.currentSrc || poster.src, expectedSrc: selectedPosterSrc,
              complete: poster.complete, decoded: posterDecoded, width: poster.naturalWidth, visible: visible(poster) } : null,
            shipName: root?.querySelector('.sf-hangar-shipname')?.textContent.trim() || null,
            manifest: [...(root?.querySelectorAll('.sf-hangar-fitting') || [])].map(item => item.textContent.trim()),
            reviewVisible: visible(root?.querySelector(selectors.review)),
            visibleBypasses: [...document.querySelectorAll('.sf-swarm-play-key,.sf-swarm-customise-key,.sf-swarm-quick-key')]
              .filter(visible).map(element => element.className),
          };
          const liveReady = result.ownerReady && result.ownerVisual === 'ship-live'
            && result.authoredSettled && result.canvas.visible && result.canvas.width > 0 && result.canvas.height > 0;
          result.previewMode = liveReady ? 'live' : allowPosterFallback && posterDecoded ? 'fallback' : 'unready';
          result.missing = [];
          if (!result.rootVisible || result.step !== '0') result.missing.push('visible ship step');
          if (!result.navVisible || result.navCurrent !== 'step') result.missing.push('current ship navigation');
          if (result.selectedHullCount !== 1 || !result.selectedHull) result.missing.push('one selected hull');
          if (result.selectedKitCount !== 1 || !result.selectedKit || result.selectedKitDisabled) result.missing.push('one enabled selected loadout');
          if (result.previewHull !== result.selectedHull || !result.stageVisible) result.missing.push('matching visible ship stage');
          if (result.previewMode === 'unready') result.missing.push('selected authored stage settlement');
          if (!result.shipName || result.shipName !== result.selectedHullName || !result.manifest.length) result.missing.push('coherent ship name and equipment');
          if (result.reviewVisible || result.visibleBypasses.length) result.missing.push('ship setup without launch bypass');
          resolve(result);
        });
      }), { selectors: S, allowPosterFallback });
      if (stopped) return;
      const elapsedMs = Math.round(performance.now() - started);
      const gap = { observation: ++evidence.observations, elapsedMs,
        roundTripMs: Math.round(performance.now() - dispatched),
        frameGapMs: previousFrame === null ? null : Math.round(state.frameAtMs - previousFrame),
        rafWaitMs: Math.round(state.rafWaitMs) };
      evidence.largestObservationGaps.push(gap);
      evidence.largestObservationGaps.sort((a, b) => b.roundTripMs - a.roundTripMs);
      evidence.largestObservationGaps.length = Math.min(evidence.largestObservationGaps.length, 5);
      evidence.lastState = state;
      const key = JSON.stringify([state.selectedHull, state.selectedKit, state.previewHull, state.previewMode, state.shipName, state.manifest]);
      evidence.coherentFrames = !state.missing.length
        ? previousKey === key && previousFrame !== null && state.frameAtMs > previousFrame ? evidence.coherentFrames + 1 : 1
        : 0;
      previousKey = state.missing.length ? null : key;
      previousFrame = state.frameAtMs;
      if (evidence.coherentFrames >= 2) { evidence.completed = true; return; }
    }
  };
  try {
    await Promise.race([observe(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Initial authored hangar readiness exceeded ${timeoutMs} ms; `
        + `last state: ${JSON.stringify(evidence.lastState)}`)), timeoutMs);
    })]);
  } finally {
    stopped = true; clearTimeout(timer);
    evidence.elapsedMs = Math.round(performance.now() - started);
    evidence.assetContext = assetContext();
  }
}
async function hangarReady(page, { initialAuthored = false, allowPosterFallback = false } = {}) {
  if (initialAuthored) await initialAuthoredHangarReady(page, { allowPosterFallback });
  await page.locator(S.root).waitFor({ state: 'visible' });
  await page.locator(`${S.hull}[aria-pressed="true"]`).waitFor({ state: 'visible' });
  assert.equal(await page.locator(S.root).getAttribute('data-prep-step'), '0', 'Swarm must open on ship choice.');
  assert.equal(await page.locator('[data-swarm-step="0"]').getAttribute('aria-current'), 'step');
  assert.equal(await page.locator(S.review).isVisible(), false, 'Equipment review cannot precede ship setup.');
  assert.equal(await page.locator('.sf-swarm-play-key:visible,.sf-swarm-customise-key:visible,.sf-swarm-quick-key:visible').count(), 0,
    'The default route exposes a launch bypass.');
}
async function selectedBuild(page) {
  return page.evaluate(() => ({
    hull: document.querySelector('[data-swarm-hull][aria-pressed="true"]')?.dataset.swarmHull,
    kit: document.querySelector('[data-swarm-kit][aria-pressed="true"]')?.dataset.swarmKit,
    previewHull: document.querySelector('.sf-hangar-shipstage')?.dataset.hullId,
    name: document.querySelector('.sf-hangar-shipname')?.textContent.trim(),
    manifest: document.querySelector('.sf-hangar-manifest')?.textContent.trim(),
  }));
}
async function launchIntents(page) {
  return page.evaluate(() => window.BENCH.log.filter(line => /^game:new\(/.test(line)).length);
}
async function openBenchTitle(page, size) {
  await page.setViewportSize(size);
  await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=title&chrome=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BENCH_READY === true);
  await page.locator(S.title).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  // __BENCH_READY must mean the public screen can accept input. Fail at the
  // actual readiness fault; do not disguise it as a later navigation timeout.
  await assertControlEnabled(page.locator(S.title), 'Bench reported ready with Swarm unavailable');
}
async function titlePointerRoute(page, region, captureName, { allowPosterFallback = false } = {}) {
  const title = page.locator(S.title);
  assert.equal(await title.evaluate(element => element.tagName), 'BUTTON');
  assert.equal(await title.locator('.dp-lit__note').count(), 1, 'The description must belong to the same native button as its art and border.');
  await assertNoSelection(page, page.locator('[data-screen="mainMenu"] h1').first());
  await title.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const normal = await title.evaluate(element => {
    const c = getComputedStyle(element);
    return [c.borderColor, c.backgroundColor, c.boxShadow, c.outlineStyle, c.outlineColor].join('|');
  });
  const hover = await pointFor(title, { x: .8, y: .35 });
  await page.mouse.move(hover.x, hover.y);
  await page.waitForFunction(({ selector, normal }) => {
    const c = getComputedStyle(document.querySelector(selector));
    return [c.borderColor, c.backgroundColor, c.boxShadow, c.outlineStyle, c.outlineColor].join('|') !== normal;
  }, { selector: S.title, normal });
  if (captureName) await shot(page, captureName);
  const target = region === 'description' ? title.locator('.dp-lit__note') : title;
  const fraction = region === 'padding' ? { x: .025, y: .22 } : region === 'art' ? { x: .8, y: .35 } : undefined;
  const point = await clickAt(page, target, fraction);
  await hangarReady(page, { initialAuthored: true, allowPosterFallback });
  return { region, point };
}
async function chooseShip(page, { requirePreset = false } = {}) {
  const initial = await selectedBuild(page);
  const roster = await page.locator(S.hull).evaluateAll(elements => elements.map(element => ({
    id: element.dataset.swarmHull, tag: element.tagName, disabled: element.getAttribute('aria-disabled') === 'true',
    image: element.querySelector('img')?.src, name: element.querySelector('strong')?.textContent.trim(),
  })));
  assert.ok(roster.length > 1, 'The hangar has no meaningful ship choice.');
  assert.equal(new Set(roster.map(row => row.id)).size, roster.length, 'One hull is repeated as several ship choices.');
  assert.equal(new Set(roster.map(row => row.image)).size, roster.length, 'Distinct hull choices reuse the same portrait.');
  assert.ok(roster.every(row => row.tag === 'BUTTON'), 'Ship choices must support native keyboard activation.');
  const available = roster.filter(row => !row.disabled && row.id !== initial.hull);
  assert.ok(available.length, 'The profile has no alternate selectable hull.');
  let chosen;
  for (const candidate of available) {
    const tile = page.locator(`${S.hull}[data-swarm-hull="${candidate.id}"]`);
    await clickAt(page, tile.locator('img'));
    await page.waitForFunction(id => document.querySelector('[data-swarm-hull][aria-pressed="true"]')?.dataset.swarmHull === id, candidate.id);
    const presets = page.locator(`${S.kit}[aria-disabled="false"]`).filter({ hasNot: page.locator('strong', { hasText: /^Choose equipment$/ }) });
    if (requirePreset && !(await presets.count())) continue;
    if (await presets.count()) await clickAt(page, presets.first());
    chosen = candidate;
    break;
  }
  assert.ok(chosen, 'No alternate hull with an available starting preset was offered.');
  let build = await selectedBuild(page);
  assert.equal(build.hull, chosen.id);
  assert.equal(build.previewHull, chosen.id, 'The preview did not follow the selected actual hull.');
  assert.equal(build.name, chosen.name, 'The selected ship name and preview disagree.');
  assert.ok(build.kit && build.manifest, 'The chosen ship must show its selected loadout and installed slots.');
  await assertNoSelection(page, page.locator('.sf-hangar-shipname'));
  // Select a different loadout through the keyboard, verify the actual manifest changes,
  // then restore the equipped preset for the eventual live deployment.
  const alternate = page.locator(`${S.kit}[aria-disabled="false"]:not([aria-pressed="true"])`).first();
  if (await alternate.count()) {
    const firstKit = build.kit;
    await tabTo(page, alternate);
    await page.keyboard.press('Space');
    const changed = await selectedBuild(page);
    assert.notEqual(changed.kit, build.kit);
    assert.equal(changed.previewHull, build.hull);
    assert.notEqual(changed.manifest, build.manifest, 'Changing equipment left the preview manifest unchanged.');
    await clickAt(page, page.locator(`${S.kit}[data-swarm-kit="${firstKit}"]`));
    build = await selectedBuild(page);
  }
  return { build, roster, posterUrl: chosen.image };
}
async function changeRunOptions(page, build, { inputs = false } = {}) {
  await clickAt(page, page.locator(S.next));
  assert.equal(await page.locator(S.root).getAttribute('data-prep-step'), '1');
  assert.equal(await page.locator('[data-swarm-step="1"]').getAttribute('aria-current'), 'step');
  assert.equal(await page.locator(S.next).isVisible(), false);
  assert.equal(await page.locator(S.review).isVisible(), true);
  const before = await page.locator('.sf-crd-stake-sub').innerText();
  const difficultyId = await page.locator(`${S.difficulty}:not([aria-pressed="true"]):not([disabled])`).first().getAttribute('data-stake-id');
  // Keep the chosen identity after input: an "unselected" locator resolves to a
  // different control as soon as the intended selection succeeds.
  const otherDifficulty = page.locator(`${S.difficulty}[data-stake-id="${difficultyId}"]`);
  // CSS can capitalize a control independently of the summary. Compare its
  // authored name while preserving the rendered words in the failure evidence.
  const difficultyLabel = (await otherDifficulty.locator('strong').textContent()).trim();
  assert.ok((await otherDifficulty.getAttribute('aria-label')).length > difficultyLabel.length,
    'Difficulty has a name but no accessible explanation of its effects.');
  await clickAt(page, otherDifficulty);
  assert.equal(await otherDifficulty.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await page.locator('.sf-crd-stake-sub').innerText(), before, 'Difficulty selection left the explanation stale.');
  const difficultySummary = await page.locator('.sf-hangar-summary').innerText();
  (report.runOptionSelections ||= []).push({ difficultyId, difficultyLabel,
    renderedLabel: await otherDifficulty.locator('strong').innerText(), summary: difficultySummary });
  assert.ok(difficultySummary.includes(difficultyLabel),
    `Selected difficulty ${JSON.stringify(difficultyLabel)} is absent from summary ${JSON.stringify(difficultySummary)}.`);
  const arenaId = await page.locator(`${S.arena}:not([aria-pressed="true"]):not([aria-disabled="true"]):not([disabled])`).first().getAttribute('data-arena-id');
  const otherArena = page.locator(`${S.arena}[data-arena-id="${arenaId}"]`);
  const arenaName = (await otherArena.locator('.fh-tile-legend').innerText()).replace(/\s+/g, ' ').trim();
  await page.waitForFunction(() => document.querySelector('.orr-door-hero__name')?.textContent.trim()
    && !document.querySelector('.orr-door-hero__words.is-turning'));
  const previousArena = await page.locator('.orr-door-hero__name').innerText();
  await clickAt(page, otherArena);
  assert.equal(await otherArena.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(expected => document.querySelector('.orr-door-hero__name')?.textContent.replace(/\s+/g, ' ').trim() === expected
    && !document.querySelector('.orr-door-hero__words.is-turning'), arenaName);
  assert.notEqual(await page.locator('.orr-door-hero__name').innerText(), previousArena, 'Arena preview kept the previous arena name.');
  const challenges = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Optional challenges$/ }) });
  assert.equal(await challenges.getAttribute('open'), null, 'Optional challenges must not crowd the default run choices.');
  assert.equal(await challenges.locator(S.hull).count(), 0);
  if (inputs) {
    const disclosure = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Custom runs & records$/ }) });
    await clickAt(page, disclosure.locator('summary'));
    const seed = page.getByRole('textbox', { name: 'Run seed', exact: true });
    const previous = await seed.inputValue();
    await clickAt(page, seed);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('424242');
    await page.keyboard.press('ControlOrMeta+a');
    const selection = await seed.evaluate(element => ({ value: element.value, start: element.selectionStart, end: element.selectionEnd }));
    assert.deepEqual(selection, { value: '424242', start: 0, end: 6 }, 'Text selection must remain available in editable inputs.');
    await page.keyboard.type(previous);
    await page.keyboard.press('Tab');
    await clickAt(page, disclosure.locator('summary'));
  }
  await clickAt(page, page.locator('[data-swarm-step="0"]'));
  assert.deepEqual(await selectedBuild(page), build, 'Ship or loadout changed while visiting run settings.');
  await clickAt(page, page.locator('[data-swarm-step="1"]'));
  assert.equal(await page.locator(`${S.difficulty}[data-stake-id="${difficultyId}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator(`${S.arena}[data-arena-id="${arenaId}"]`).getAttribute('aria-pressed'), 'true');
  await assertNoOverflow(page);
  return { difficultyId, difficultyLabel, arenaId, arenaName };
}
async function benchViewport(size, index) {
  const label = `bench-${size.width}x${size.height}`;
  const context = await browser.newContext({ viewport: size });
  const page = currentPage = await context.newPage();
  page.setDefaultTimeout(15000);
  observeErrors(page, label);
  try {
    await openBenchTitle(page, size);
    const pointer = await titlePointerRoute(page, ['art', 'description', 'padding'][index % 3], `${label}-title`);
    const { build, roster, posterUrl } = await chooseShip(page);
    await assertNoOverflow(page);
    const preview = await shipShot(page, `${label}-ship`, { hullId: build.hull, posterUrl });
    const run = await changeRunOptions(page, build, { inputs: index === 0 });
    await page.locator(S.review).scrollIntoViewIfNeeded();
    await waitArenaImage(page);
    await shot(page, `${label}-run`);
    assert.equal(await launchIntents(page), 0, 'Selecting ship, kit or run options started the game.');
    await clickAt(page, page.locator(S.review));
    assert.equal(await launchIntents(page), 1, 'Review equipment must issue exactly one canonical launch request.');
    check(`${label}: title ${pointer.region} click, hull/loadout, settings, reachable equipment review`, { pointer, build, preview, run, hullCount: roster.length });
    if (index === 0) {
      for (const key of ['Enter', 'Space']) {
        await openBenchTitle(page, size);
        const tabs = await tabTo(page, page.locator(S.title));
        const focus = await page.locator(S.title).evaluate(element => {
          const css = getComputedStyle(element);
          return { visible: element.matches(':focus-visible'), outline: css.outlineStyle, width: css.outlineWidth, shadow: css.boxShadow };
        });
        assert.ok(focus.visible && ((focus.outline !== 'none' && parseFloat(focus.width) > 0) || focus.shadow !== 'none'),
          'Keyboard focus has no visible treatment.');
        await page.keyboard.press(key);
        await hangarReady(page, { initialAuthored: true });
        assert.equal(await launchIntents(page), 0);
        check(`Native title ${key} opens ship setup without launching`, { tabs, focus });
      }
    }
  } catch (error) {
    await shot(page, `${label}-failure`).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
// Runtime snapshots verify the consequences of public input. They never choose a control,
// change a fitting, emit an intent, or advance the simulation.
async function livePreparation(page) {
  return page.evaluate(() => {
    const sf = window.SF, s = sf.state, run = s.run;
    const ship = s.player?.ownedShips?.[s.player.activeShipIndex];
    const entity = s.entities?.get?.(s.playerId);
    return {
      phase: run?.phase, mode: s.mode, token: run?.retireToken, wave: run?.wave,
      top: sf.ctx.screenManager.top(),
      hull: ship?.defId || entity?.data?.defId,
      fittings: [...(ship?.fittings || entity?.data?.fittings || [])],
      inventory: (s.player?.moduleInventory || []).map(item => item.defId).sort(),
      credits: run?.credits,
      settings: {
        ruleset: run?.ruleset, arenaId: run?.arenaId, seed: run?.seed, practice: run?.practice,
        stake: run?.telemetry?.swarmStake, startWave: run?.telemetry?.startWave || 1,
      },
      receipt: sf.registry.get('survivalDraft')?.preparationReceipt?.() || null,
      result: sf.registry.get('survivalResults')?.lastResult?.() || null,
      worker: sf.ctx.simLane === 'worker',
      lane: sf.ctx.simLane,
    };
  });
}

async function buyLiveEquipment(page, initial, rememberedName = null) {
  const screen = page.locator('[data-screen="crucibleDraft"]');
  const currentBuild = screen.locator('.orr-armory-build');
  if (await currentBuild.getAttribute('open') === null) await clickAt(page, currentBuild.locator('summary'));
  const installedNames = await currentBuild.locator('li > span > span').allTextContents();
  assert.ok(installedNames.some(name => name.trim() && name.trim() !== 'Empty'),
    'The Current build disclosure does not identify the selected preset equipment.');
  const browse = screen.locator('.sf-cru-foot button').filter({ hasText: /^Browse all\b/ });
  if (await browse.isVisible()) await clickAt(page, browse);
  await clickAt(page, screen.locator('[data-category="Weapons"]'));
  await screen.locator('.sf-cru-cards').waitFor({ state: 'visible' });
  // The actor chooses only from the visible catalog, its price/availability treatment, and
  // the Current build disclosure. Hidden owner offers are not an input to this decision.
  const offers = await screen.locator('.sf-cru-cards .sf-cru-card:not(.is-unavail):not(.is-fitted)').evaluateAll(rows =>
    rows.map(row => ({
      id: row.dataset.offerId,
      name: row.querySelector('.sf-cru-name')?.textContent.trim(),
      price: Number((row.querySelector('.sf-cru-price')?.textContent.match(/[\d,]+/)?.[0] || '').replaceAll(',', '')),
    })));
  const choice = offers.find(row => row.name && row.price > 0
    && !installedNames.map(name => name.trim()).includes(row.name)
    && (!rememberedName || row.name === rememberedName));
  assert.ok(choice, 'The public Weapons catalog has no affordable distinct fitting' + (rememberedName ? ': ' + rememberedName : '.'));
  await clickAt(page, screen.locator('.sf-cru-cards [data-offer-id=' + JSON.stringify(choice.id) + ']'));
  assert.equal((await screen.locator('.orr-armory-reading__name').textContent()).trim(), choice.name);
  const inspected = await livePreparation(page);
  assert.deepEqual(inspected.fittings, initial.fittings, 'Inspecting an item changed installed equipment before purchase.');
  assert.equal(inspected.credits, initial.credits, 'Inspecting an item spent credits before purchase.');
  const install = screen.locator('.orr-armory-purchase');
  await assertControlEnabled(install, 'The advertised affordable fitting cannot be installed');
  assert.ok((await install.getAttribute('aria-label')).includes(choice.name), 'Install refers to a different item than the inspected one.');
  await clickAt(page, install);
  await page.waitForFunction(offerId => {
    const receipt = window.SF.registry.get('survivalDraft')?.preparationReceipt?.();
    return receipt?.offerId === offerId && receipt.outcome !== 'pending';
  }, choice.id, { timeout: 20000 });
  const purchased = await livePreparation(page), receipt = purchased.receipt;
  assert.equal(receipt.outcome, 'accepted', 'The fitting authority refused the public purchase: ' + JSON.stringify(receipt));
  assert.equal(receipt.charged, true);
  assert.equal(receipt.price, choice.price, 'The receipt charged a different price than the public offer.');
  assert.equal(purchased.credits, initial.credits - choice.price, 'The run wallet did not pay exactly once.');
  assert.equal(purchased.hull, initial.hull, 'An equipment purchase changed the chosen ship.');
  assert.ok(Number.isInteger(receipt.slotIndex) && receipt.defId && !initial.fittings.includes(receipt.defId));
  const expected = [...initial.fittings]; expected[receipt.slotIndex] = receipt.defId;
  assert.deepEqual(purchased.fittings, expected, 'The committed fitting differs from the accepted purchase.');
  await page.waitForFunction(name => [...document.querySelectorAll(
    '[data-screen="crucibleDraft"] .orr-armory-build li > span > span',
  )].some(node => node.textContent.trim() === name), choice.name);
  return { ...choice, defId: receipt.defId, slotIndex: receipt.slotIndex, purchased };
}

async function liveRoute() {
  const context = await browser.newContext({ viewport: LIVE_VIEWPORT });
  const page = currentPage = await context.newPage();
  page.setDefaultTimeout(20000);
  observeErrors(page, 'live');
  const issues = collectPageIssues(page);
  const live = report.live;
  const progress = () => page.evaluate(() => ({
    meta: localStorage.getItem('sf.save.crucible_meta'),
    campaign: localStorage.getItem('sf.save.auto'),
  }));
  const navigate = async (label, action) => {
    // Snapshot only requests already in flight before this deliberate transition. End
    // attribution BEFORE input or its waits: new-route requests must remain strict even
    // while the previous screen is being replaced. HTTP failures are never excused.
    const token = issues.beginExpectedNavigation(label);
    issues.endExpectedNavigation(token);
    return action();
  };
  const noAssetFailures = () => assert.deepEqual(issues.errorIssues(), [],
    'The live route has HTTP, network, console or page failures; see live.browserIssues.');
  const openArmory = async (label) => navigate(label, async () => {
    await clickAt(page, page.locator(S.review));
    await page.locator('[data-screen="crucibleDraft"]').waitFor({ state: 'visible', timeout: 180000 });
    await page.waitForFunction(() => window.SF.state.run?.phase === 'draft', null, { timeout: 20000 });
    await waitBootOverlayGone(page, 180000);
  });
  try {
    await navigate('fresh title navigation', () => bootToMenu(page, server.baseUrl,
      (name, pass, detail) => check('Live: ' + name, { pass, detail })));
    await waitBootOverlayGone(page, 180000);
    await navigate('title to hangar', () => titlePointerRoute(page, 'padding', 'live-title', { allowPosterFallback: true }));
    const { build, posterUrl } = await navigate('selected ship preview', () => chooseShip(page, { requirePreset: true }));
    live.build = build;
    live.hangarPreview = await shipShot(page, 'live-selected-ship', { hullId: build.hull, posterUrl });
    const run = live.run = await navigate('ship to run options', () => changeRunOptions(page, build));
    const before = await page.evaluate(() => ({ phase: window.SF.state.run?.phase, mode: window.SF.state.mode }));
    assert.ok(!['active', 'wave_intro', 'draft'].includes(before.phase), 'Combat/run preparation started before Review equipment.');
    await openArmory('opening equipment preparation');
    const armory = live.armory = await livePreparation(page);
    assert.equal(armory.hull, build.hull, 'Opening armory substituted a different ship.');
    assert.ok(armory.credits > 0, 'The selected difficulty needs a positive equipment allowance for this purchase route.');
    assert.equal(armory.settings.arenaId, run.arenaId);
    assert.equal(armory.settings.stake, run.difficultyId);
    live.armoryPreview = await shipShot(page, 'live-opening-armory', {
      hullId: build.hull, posterUrl, selector: '[data-screen="crucibleDraft"] .orr-armory-ship-stage',
    });
    noAssetFailures();
    const permanentBefore = await progress();
    const purchase = live.purchase = await navigate('inspect and install equipment', () => buyLiveEquipment(page, armory));
    await shipShot(page, 'live-purchased-equipment', {
      hullId: build.hull, posterUrl, selector: '[data-screen="crucibleDraft"] .orr-armory-ship-stage',
    });
    const back = page.locator('[data-screen="crucibleDraft"] .sf-cru-back-to-hangar');
    const note = page.locator('#sf-cru-preparation-return-note');
    await back.waitFor({ state: 'visible' });
    assert.equal(await note.isVisible(), true, 'Back to hangar has no visible explanation of discarded purchases.');
    live.returnNotice = await note.innerText();
    // Subscribe only to receipts. This observer cannot retire the run or alter screen state.
    const [returned] = await Promise.all([
      page.evaluate(token => new Promise(resolve => {
        const bus = window.SF.bus, forbidden = [], unsubs = [];
        const finish = receipt => {
          clearTimeout(timer); for (const off of unsubs) off();
          resolve({ receipt, forbidden });
        };
        for (const name of ['run:resultsReady', 'player:death', 'run:waveCleared'])
          unsubs.push(bus.on(name, () => forbidden.push(name)));
        unsubs.push(bus.on('run:preparationCancelResolved', receipt => {
          if (receipt?.token === token) finish({ ...receipt });
        }));
        const timer = setTimeout(() => finish(null), 20000);
      }), armory.token),
      navigate('Back to hangar after purchase', async () => {
        await clickAt(page, back);
        await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucible'
          && window.SF.state.mode === 'menu' && window.SF.state.run?.phase === 'inactive',
        null, { timeout: 20000 });
        await hangarReady(page);
      }),
    ]);
    live.cancellation = returned;
    assert.deepEqual(returned.receipt, { token: armory.token, ok: true, reason: 'preparation_cancelled' });
    assert.deepEqual(returned.forbidden, [], 'Cancelling initial preparation produced combat or results events.');
    assert.equal(await page.locator('[data-screen="crucibleResults"]:visible,[data-screen="crucibleDraft"]:visible').count(), 0);
    assert.deepEqual(await progress(), permanentBefore, 'Cancelling preparation changed persistent progress or the campaign save.');
    assert.equal((await livePreparation(page)).result, null, 'Cancelling preparation fabricated a run result.');
    assert.deepEqual(await selectedBuild(page), build, 'Back to hangar lost the selected ship or preset.');
    await shipShot(page, 'live-returned-hangar', { hullId: build.hull, posterUrl });
    await navigate('review retained run settings', async () => {
      await clickAt(page, page.locator('[data-swarm-step="1"]'));
      assert.equal(await page.locator(S.difficulty + '[data-stake-id="' + run.difficultyId + '"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator(S.arena + '[data-arena-id="' + run.arenaId + '"]').getAttribute('aria-pressed'), 'true');
    });
    await openArmory('reopen equipment preparation');
    const reopened = live.reopened = await livePreparation(page);
    assert.notEqual(reopened.token, armory.token, 'Re-entry reused the cancelled run.');
    assert.equal(reopened.hull, armory.hull);
    assert.deepEqual(reopened.settings, armory.settings, 'Re-entry changed the selected run settings.');
    assert.equal(reopened.credits, armory.credits, 'New preparation did not receive its original equipment allowance.');
    assert.deepEqual(reopened.fittings, armory.fittings, 'The cancelled purchase survived in installed equipment.');
    assert.deepEqual(reopened.inventory, armory.inventory, 'The cancelled purchase or displaced fitting survived as a free spare.');
    assert.equal(reopened.receipt, null, 'New preparation retained the old purchase receipt.');
    assert.equal(reopened.result, null);
    assert.deepEqual(await progress(), permanentBefore, 'Re-entry changed persistent progress before combat.');
    check('Live: Back discards only preparation purchases and preserves ship, preset, settings and permanent progress', {
      token: armory.token, successor: reopened.token, discardedItem: purchase.name,
      originalCredits: armory.credits, spentCredits: purchase.purchased.credits, reopenedCredits: reopened.credits,
    });

    // Reinstall the same publicly named item to prove that a purchase the player DOES accept
    // reaches combat. The previous transaction was discarded, not credited as free inventory.
    live.acceptedPurchase = await navigate('reinstall chosen equipment', () => buyLiveEquipment(page, reopened, purchase.name));
    const prepared = live.acceptedPurchase.purchased;
    assert.equal(live.acceptedPurchase.defId, purchase.defId);
    await shipShot(page, 'live-equipped-to-launch', {
      hullId: build.hull, posterUrl, selector: '[data-screen="crucibleDraft"] .orr-armory-ship-stage',
    });
    const deploy = page.locator('[data-screen="crucibleDraft"] .sf-cru-foot .k-word--primary');
    assert.equal(await deploy.count(), 1, 'Opening armory needs one clear deployment control.');
    live.deployLabel = await deploy.innerText();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert.equal((await livePreparation(page)).phase, 'draft', 'Cancel unexpectedly deployed the prepared ship.');
    await navigate('explicit deployment', async () => {
      await tabTo(page, deploy);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => ['active', 'wave_intro'].includes(window.SF.state.run?.phase)
        && window.SF.state.mode === 'flight', null, { timeout: 60000 });
      await waitBootOverlayGone(page, 60000);
    });
    // Phase alone is insufficient: demand the engine's required authored assets and a real
    // submitted flight frame, then observe a subsequent submitted frame without stepping it.
    const frame = await page.waitForFunction(() => {
      const sf = window.SF, picture = sf.loop?.getPresentationFrame?.();
      const readiness = sf.authoredVisualReadiness?.();
      return sf.state.mode === 'flight' && readiness?.ready === true
        && picture?.worldSubmitted === true && Number.isFinite(picture.completedTick?.simTime)
        ? { sequence: picture.sequence, tick: picture.completedTick.tick,
          simTime: picture.completedTick.simTime, playerStatus: readiness.playerStatus } : false;
    }, null, { timeout: 60000 });
    live.firstCombatFrame = await frame.jsonValue(); await frame.dispose();
    await page.waitForFunction(previous => {
      const frame = window.SF.loop?.getPresentationFrame?.();
      return window.SF.state.mode === 'flight' && frame?.worldSubmitted === true
        && frame.sequence > previous.sequence && frame.completedTick?.simTime > previous.simTime;
    }, live.firstCombatFrame, { timeout: 20000 });
    const combat = live.combat = await livePreparation(page);
    assert.equal(combat.hull, build.hull, 'Deployment substituted a different ship.');
    assert.deepEqual(combat.fittings, prepared.fittings, 'Deployment changed the purchased loadout.');
    assert.deepEqual(combat.inventory, prepared.inventory, 'Deployment changed the prepared spare equipment.');
    assert.equal(combat.token, reopened.token, 'Deployment launched a different run.');
    await shot(page, 'live-deployed');
    noAssetFailures();
  } catch (error) {
    await shot(page, 'live-failure').catch(() => {});
    throw error;
  } finally {
    const token = issues.beginExpectedNavigation('completed live probe context teardown');
    try { await context.close(); } finally { issues.endExpectedNavigation(token); }
    live.browserIssues = issues.errorIssues();
    live.expectedNavigationDiagnostics = issues.ignoredIssues;
  }
  noAssetFailures();
  live.completed = true;
  check('Live public route: purchase, return, fresh preparation and explicit deployment retain the chosen build', live);
}
try {
  server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const launched = await launchChromium(chromium, {
    headless: true, ...(process.env.SF_CHROMIUM ? { executablePath: process.env.SF_CHROMIUM } : {}),
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browser = launched.browser;
  report.browser = { executable: process.env.SF_CHROMIUM || launched.executable, version: browser.version(), renderer: 'SwiftShader; no performance claim' };
  if (!liveOnly) for (const [index, size] of sizes.entries()) await benchViewport(size, index);
  if (runLive) await liveRoute();
  assert.deepEqual(report.browserErrors, [], 'Browser exceptions occurred on the tested route.');
  report.pass = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (currentPage && !currentPage.isClosed()) await shot(currentPage, 'failure').catch(() => {});
  console.error(`[hangar-ux] FAIL: ${error.stack || error}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  await cleanup();
  console.log(JSON.stringify({ pass: report.pass, checks: report.checks.length, live: report.live.completed, out }, null, 2));
}
