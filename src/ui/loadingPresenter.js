import { getBootVisualizer } from './bootVisualizer.js';
import { mountBootRing } from './orrery/bootRing.js';
import { createLoadingProgressDriver } from './loadingProgressDriver.js';
import { observeBootWork, createBootWorkAccumulator } from '../core/bootWork.js';
import { dataState } from './uiPrimitives.js';
import { NEW_GAME } from '../data/newGameDefaults.js';

const DEFAULT_STAGE = Object.freeze({ id: 'restoring-save', progress: .05,
  label: 'Restoring flight state', detail: 'Rebuilding the current sector and critical visuals' });
const NO_ART = { updateProgress() {}, start() {}, stop() {}, destroy() {} };
const NOOP = { show() {}, hide() {}, destroy() {} };
// Row 473 — the loading shell names where the player is going. Boot stages are not a destination;
// they are the command deck coming up.
const BOOT_DESTINATION = 'Command deck';
// A sector we cannot name still gets friendly words rather than a raw id.
const UNKNOWN_DESTINATION = 'Uncharted destination';
// The ordinary Adventure route before its sector is named: the route is known, the place is not yet.
const ADVENTURE_DESTINATION = 'Adventure';
// An Adventure embark carries the pilot's picks (name / hull / starter / difficulty). A bare
// payload is a toy or sandbox launch with no named route, so it gets the generic slate instead of
// borrowing the Adventure opening's sector name.
const ADVENTURE_EMBARKS = ['name', 'shipId', 'starter', 'difficulty'];
// Launch marks that are NOT the Adventure world. `crucibleLaunch` is the one
// `gameNewOptionsForSandboxConfig` writes for a survival/sparring launch (the setup nests at
// `crucibleSetup.survivalSetup`); racing and physics ride top-level booleans of their own.
const SPECIALIZED_ROUTES = Object.freeze({
  crucibleLaunch: 'Crucible',
  racingSession: 'Circuits',
  physicsVenueSession: 'Physics challenges',
});
// Longest the flight reveal waits on the opening first draw before lifting the veil anyway.
export const FIRST_DRAW_REVEAL_CAP_MS = 20000;
export const FIRST_DRAW_STAGE_LABEL_MS = 3000;
export const ADMISSION_QUIET_MS = 400;
export const ADMISSION_DRAIN_CAP_MS = 3000;
// Needle settle before the shell starts its fade.
export const REVEAL_FINISH_MS = 200;

/** One presenter for browser/Electron, boot/New Game/Continue; rendering never authorizes flight. */
// Sets the flight-veil sim hold and tells the presentation runner at once, so a worker-owned sim
// clock stops when the veil arms instead of at the next (possibly seconds-late) rAF.
function setFlightVeilHold(render, held) {
  if (!render) return;
  if (render.flightVeilHoldsSim === held) return;
  render.flightVeilHoldsSim = held;
  try { render.onFlightVeilHoldChanged?.(held); } catch (_) { /* the frame loop re-syncs */ }
}

export function createLoadingPresenter({ document, bus, state, hideDelayMs = 600 } = {}) {
  if (!document || !bus || typeof bus.on !== 'function') return NOOP;
  const overlay = document.getElementById?.('boot-overlay');
  if (!overlay) return NOOP;
  const label = document.querySelector?.('[data-loading-label]');
  const detail = document.querySelector?.('[data-loading-detail]');
  const progress = document.querySelector?.('[data-loading-progress]');
  const pctEl = document.querySelector?.('[data-loading-pct]');
  const host = document.defaultView || globalThis;
  const raf = host.requestAnimationFrame?.bind(host);
  const cancelRaf = host.cancelAnimationFrame?.bind(host);
  const now = () => host.performance?.now?.() ?? Date.now();
  let ring;
  try { ring = mountBootRing(document, overlay); } catch { ring = null; }
  if (!ring?.mounted) ring = createLoadingProgressDriver(host);
  // Only phase sentences are live. Numeric progress is a queryable progressbar, not 10 spoken
  // announcements per second; the existing hidden span hooks remain available to tools.
  overlay.setAttribute('aria-live', 'off');
  label?.setAttribute?.('role', 'status'); label?.setAttribute?.('aria-live', 'polite');
  let terminalArt = null, retainWorkerArt = false, retainedCanvas = null;
  let retainedPointerMove = null, needsPointerBridge = false;
  let hideTimer = null, activeStage = null, revealRaf = null, revealPollTimer = null, revealDeadlineTimer = null, revealCapTimer = null, revealStageTimer = null;
  let workTimer = null, pendingWork = null, accumulator = null, disposed = false;
  let startupFailure = null, failurePane = null;
  const lockup = overlay.querySelector?.('.boot-lockup') || null;
  const priorLockupDisplay = lockup?.style?.display || '';
  let session = 0;
  // --- destination slate (row 473) -----------------------------------------------------------------
  // A separate, transient value: stage label/detail are rewritten by every progress receipt, the
  // destination is not. `destinationRoute` latches WHAT this launch is (null = the ordinary
  // Adventure world); once latched, sector/scene refreshes cannot rename it.
  let destinationText = '';
  let destinationRoute = null;
  let destinationEl = null;
  let ordinarySectorName = '';
  let ordinarySectorUnnamed = false;
  let loadPending = false;
  let restoredNamed = false;
  let loadingSlot = null;
  const visible = () => overlay.style.display !== 'none' && !overlay.classList.contains('hidden');

  /** The one destination span, found in the authored lockup or created beside its label. Reuses the
   *  shell's own type (`.boot-detail`); no inline layout and no new stylesheet. */
  function destinationNode() {
    if (destinationEl) return destinationEl;
    if (!document || typeof document.createElement !== 'function') return null;
    const existing = lockup?.querySelector?.('[data-loading-destination]') || null;
    if (existing) { destinationEl = existing; return destinationEl; }
    const host = lockup || overlay;
    if (!host) return null;
    const node = document.createElement('span');
    node.className = 'boot-detail';
    node.setAttribute('data-loading-destination', '');
    const before = lockup?.querySelector?.('[data-loading-label]') || null;
    if (before && before.parentNode === host && typeof host.insertBefore === 'function') host.insertBefore(node, before);
    else host.appendChild(node);
    destinationEl = node;
    return destinationEl;
  }
  function paintDestination() {
    const node = destinationNode();
    if (!node) return;
    if (node.textContent !== destinationText) node.textContent = destinationText;
  }
  function setDestination(route, text) {
    destinationRoute = route;
    destinationText = typeof text === 'string' ? text : '';
    paintDestination();
  }
  /** A sector's display name from the live world, tolerating a lane facade / headless state. */
  function sectorNameFromWorld(sectorId) {
    if (!sectorId) return '';
    let sector = null;
    try { sector = state && state.world && state.world.sectors ? state.world.sectors[sectorId] : null; }
    catch (_) { sector = null; }
    const name = sector && (sector.name || sector.label);
    return typeof name === 'string' && name.trim() ? name.trim() : '';
  }
  /** The envelope names its own sector — the slotCardFromEnvelopeData convention, which still reads
   *  ids the live catalogue no longer knows. Falls back to the current world catalogue. */
  function sectorNameFromEnvelope(payload) {
    const data = payload && (payload.data || (payload.envelope && payload.envelope.data));
    const world = data && data.world && typeof data.world === 'object' ? data.world : null;
    if (!world) return '';
    const sectorId = typeof world.currentSectorId === 'string' ? world.currentSectorId : '';
    if (!sectorId) return '';
    const sector = world.sectors && typeof world.sectors === 'object' ? world.sectors[sectorId] : null;
    const name = sector && (sector.name || sector.label);
    if (typeof name === 'string' && name.trim()) return name.trim();
    return sectorNameFromWorld(sectorId);
  }
  function ordinaryDestinationText() {
    if (ordinarySectorName) return `Adventure · ${ordinarySectorName}`;
    return ordinarySectorUnnamed ? UNKNOWN_DESTINATION : ADVENTURE_DESTINATION;
  }
  /** Only an ordinary (Adventure) destination is allowed to follow the world. */
  function refreshOrdinaryDestination(preferredSectorId) {
    if (destinationRoute !== null) return;
    const id = preferredSectorId || NEW_GAME.startingSectorId || NEW_GAME.startSectorId;
    const named = sectorNameFromWorld(id);
    if (named) { ordinarySectorName = named; ordinarySectorUnnamed = false; }
    setDestination(null, ordinaryDestinationText());
  }
  function resetDestination() {
    destinationRoute = null;
    destinationText = '';
    ordinarySectorName = '';
    ordinarySectorUnnamed = false;
    loadPending = false;
    restoredNamed = false;
    loadingSlot = null;
    paintDestination();
  }
  /** An Adventure embark names the pilot's picks; a bare payload is a toy/sandbox launch. */
  function looksLikeAdventureEmbark(opts) {
    if (!opts || typeof opts !== 'object') return false;
    return ADVENTURE_EMBARKS.some((key) => opts[key] != null);
  }
  function beginNewGame(opts = {}) {
    // A new launch clears the previous destination: the slate describes THIS run only.
    ordinarySectorName = '';
    ordinarySectorUnnamed = false;
    loadPending = false;
    restoredNamed = false;
    loadingSlot = null;
    destinationRoute = null;
    const mark = Object.keys(SPECIALIZED_ROUTES).find((key) => opts[key] === true);
    if (mark) { setDestination(SPECIALIZED_ROUTES[mark], SPECIALIZED_ROUTES[mark]); return; }
    // A plain Sandbox/toy launch (pendingConfig without a route mark) rides game:new with no
    // embark picks: it is not the Adventure opening and not one of the named modes, so it reads
    // the friendly generic slate.
    if (!looksLikeAdventureEmbark(opts)) { setDestination(null, UNKNOWN_DESTINATION); return; }
    refreshOrdinaryDestination();
  }
  function beginRestore(payload = {}) {
    ordinarySectorName = '';
    ordinarySectorUnnamed = false;
    loadPending = true;
    loadingSlot = payload && payload.slot != null ? String(payload.slot) : null;
    setDestination('restore', 'Restoring destination');
  }
  function nameRestore(payload = {}) {
    // Correlate to the most recent game:load: the receipt carries no generation, so the slot is the
    // only handle that can refuse an envelope prepared for some other restore.
    if (!loadPending) return;
    const slot = payload && payload.slot != null ? String(payload.slot) : null;
    if (loadingSlot != null && slot != null && slot !== loadingSlot) return;
    loadPending = false;
    const name = sectorNameFromEnvelope(payload);
    setDestination('restore', name ? `Continue · ${name}` : 'Restoring destination');
    restoredNamed = true;
  }
  /** game:scenePrepared and loading-time sector:enter refresh ONLY the ordinary Adventure slate. */
  function refreshSceneDestination(payload = {}) {
    if (destinationRoute !== null) return;   // a latched mode owns its words
    if (!visible()) return;
    if (!eventMatchesCurrentGeneration(payload)) return;
    refreshOrdinaryDestination();
  }
  function nameSectorFromEnter(payload = {}) {
    if (destinationRoute !== null) return;
    if (!visible()) return;                  // a background enter must never light the loader
    const sector = payload && payload.sector;
    const name = sector && typeof sector.name === 'string' ? sector.name.trim() : '';
    const id = payload && typeof payload.sectorId === 'string' ? payload.sectorId : '';
    const resolved = name || sectorNameFromWorld(id);
    if (resolved) { ordinarySectorName = resolved; ordinarySectorUnnamed = false; }
    else if (id) { ordinarySectorUnnamed = true; }
    setDestination(null, ordinaryDestinationText());
  }

  function artwork() {
    if (terminalArt) return terminalArt;
    try {
      terminalArt = getBootVisualizer(document) || NO_ART;
      // Native playback and its fallback are owned together, on every host.
      // Retain the paused owner across New Game / Continue, not just on hosts
      // with Worker support. Its start() never seeks back to the first frame.
      retainWorkerArt = terminalArt !== NO_ART;
      retainedCanvas = null;
    } catch (error) {
      console.warn('[boot] loading artwork failed; continuing without it', error);
      retainWorkerArt = false; retainedCanvas = null; terminalArt = NO_ART;
    }
    return terminalArt;
  }
  function detachPointer() {
    if (retainedPointerMove) overlay.removeEventListener?.('pointermove', retainedPointerMove);
    retainedPointerMove = null;
  }
  function attachPointer() {
    if (!needsPointerBridge || retainedPointerMove || !retainWorkerArt || !retainedCanvas) return;
    const receive = terminalArt?.__engine?.receive;
    if (typeof receive !== 'function') return;
    retainedPointerMove = (event) => {
      const rect = retainedCanvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      receive.call(terminalArt.__engine, { type: 'pointer',
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((event.clientY - rect.top) / rect.height) * 2 - 1 });
    };
    overlay.addEventListener?.('pointermove', retainedPointerMove, { passive: true });
    needsPointerBridge = false;
  }
  function clearWork() {
    if (workTimer !== null) clearTimeout(workTimer);
    workTimer = null; pendingWork = null;
  }
  function cancelRevealWait() {
    if (revealRaf !== null) cancelRaf?.(revealRaf);
    revealRaf = null;
    if (revealPollTimer !== null) clearTimeout(revealPollTimer);
    revealPollTimer = null;
    if (revealDeadlineTimer !== null) clearTimeout(revealDeadlineTimer);
    revealDeadlineTimer = null;
    if (revealCapTimer !== null) clearTimeout(revealCapTimer);
    revealCapTimer = null;
    if (revealStageTimer !== null) clearTimeout(revealStageTimer);
    revealStageTimer = null;
  }
  function paint(fraction, formatted) {
    if (!visible() || disposed || startupFailure) return;
    if (progress) progress.style.width = raf ? `${(fraction * 100).toFixed(2)}%` : `${Math.round(fraction * 100)}%`;
    if (pctEl && pctEl.textContent !== formatted) pctEl.textContent = formatted;
    (terminalArt || NO_ART).updateProgress({ id: activeStage?.id || 'loading', progress: fraction });
  }
  const unsubscribePaint = ring?.subscribe(paint) || (() => {});
  const unsubscribeWork = observeBootWork((receipt) => {
    if (!visible() || !accumulator || disposed || !activeStage || startupFailure) return;
    if (!['authored-library', 'authored-visuals', 'render-pipelines', 'gpu-resources'].includes(activeStage.id)) return;
    if (!receipt.owner || (receipt.owner !== state?.render && receipt.owner !== state?.render?.renderer)) return;
    const work = accumulator.accept(receipt);
    if (!work) return;
    pendingWork = work;
    if (workTimer !== null) return;
    const ownerSession = session;
    // Coalesce receipts, not progress animation: 100 texture completions do not post 100 UI writes.
    workTimer = setTimeout(() => {
      workTimer = null;
      if (ownerSession !== session || !visible() || !pendingWork || disposed) return;
      const current = pendingWork; pendingWork = null;
      ring?.report({ ...activeStage, progress: current.progress });
      if (detail && current.total > 0) {
        detail.textContent = `${current.completed} of ${current.total} resources prepared in this pass`;
      }
    }, 80);
  });

  function show(stage = DEFAULT_STAGE) {
    // A new load must never inherit a held sim from the previous reveal's fade.
    if (pendingRelease) releaseHoldNow();
    if (disposed || startupFailure) return;
    cancelRevealWait();
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
    const wasHidden = !visible();
    // New run/restore restarts a completed/retiring session. Late progress inside one session
    // cannot rewind it. The first presenter inherits the entry worker's existing boot progress.
    const fresh = wasHidden || stage.reset === true;
    const changed = !activeStage || activeStage.id !== stage.id || fresh;
    if (changed) { session++; clearWork(); accumulator = createBootWorkAccumulator(stage); }
    activeStage = stage;
    overlay.style.display = 'flex'; overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'true'); overlay.dataset.loadingStage = String(stage.id || 'loading');
    if (label) label.textContent = String(stage.label || DEFAULT_STAGE.label);
    if (detail) detail.textContent = String(stage.detail || 'Preparing the playable scene');
    // Row 473: the initial boot stages are the command deck coming up, not a place in the world.
    // The discriminator is the same one the mode:changed handler uses for boot stages.
    if (String(stage.id || '').startsWith('boot-')) {
      ordinarySectorName = '';
      ordinarySectorUnnamed = false;
      setDestination(null, BOOT_DESTINATION);
    }
    ring?.report(stage, { reset: fresh }); ring?.start();
    if (!ring || !raf) {
      const amount = Math.max(0, Math.min(.997, Number(stage.progress) || 0));
      paint(amount, `${(Math.floor(amount * 1000) / 10).toFixed(1)}%`);
    }
    const needsStart = wasHidden || !terminalArt;
    const art = artwork(); if (needsStart) art.start(); attachPointer();
    const shown = Number(ring?.snapshot().shown);
    const staged = Number(stage.progress);
    art.updateProgress({ ...stage, progress: Number.isFinite(shown) ? shown : (Number.isFinite(staged) ? staged : 0) });
  }
  /** completed=false on error/timeout/menu cancellation: never celebrate a failed load as 100%. */
  // The sim stays held through the veil fade and until a real frame has been presented after it,
  // so the first frame the player can see and steer is the spawn state (the fade itself covers
  // the playfield). A bounded fallback releases it even if no frame ever lands.
  let pendingRelease = null;
  function releaseHoldNow() {
    if (pendingRelease) {
      if (pendingRelease.raf !== null) cancelRaf?.(pendingRelease.raf);
      clearTimeout(pendingRelease.fallback);
      pendingRelease = null;
    }
    setFlightVeilHold(state?.render, false);
  }
  function releaseHoldAfterPresentedFrame() {
    if (!pendingRelease) return;
    const base = frameNow();
    if (base === null || !raf) { releaseHoldNow(); return; }
    const check = () => {
      if (!pendingRelease) return;
      pendingRelease.raf = null;
      if (frameNow() > base) { releaseHoldNow(); return; }
      pendingRelease.raf = raf(check);
    };
    pendingRelease.raf = raf(check);
  }
  function hide({ completed = true, releaseAfterFade = false } = {}) {
    if (!releaseAfterFade || disposed) releaseHoldNow();
    else if (!pendingRelease) {
      pendingRelease = { raf: null, fallback: setTimeout(releaseHoldNow, hideDelayMs + 1000) };
    }
    if (disposed) return;
    if (startupFailure) return;
    cancelRevealWait(); clearWork(); accumulator = null; session++;
    if (completed) ring?.finish();
    overlay.classList.add('hidden'); overlay.setAttribute('aria-busy', 'false');
    ring?.stop();
    const retiring = terminalArt || NO_ART; retiring.stop(); detachPointer();
    if (retiring === terminalArt && !retainWorkerArt) {
      retiring.destroy(); terminalArt = null; retainedCanvas = null;
    } else if (retiring === terminalArt) needsPointerBridge = true;
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      // The `hidden` class is added at fade start and persists across repeat hide() calls, so the
      // completion receipt must be gated on the flip actually happening this time.
      let flipped = false;
      if (overlay.classList.contains('hidden')) {
        flipped = overlay.style.display !== 'none';
        overlay.style.display = 'none';
      }
      releaseHoldAfterPresentedFrame();
      // Row 473: the authoritative "the shell is gone now" signal the title's first-light offer
      // waits for. Fires inside this timer, so `show`, `showStartupFailure` and `destroy` — which
      // all clear hideTimer — suppress a stale notification for free.
      if (flipped) bus.emit('ui:loadingHidden', { mode: state?.mode });
    }, hideDelayMs);
  }
  const frameNow = () => {
    const count = state?.render?.renderer?.info?.render?.frame;
    return Number.isFinite(count) ? count : null;
  };
  function hideAfterFirstFlightFrame() {
    if (startupFailure) return;
    cancelRevealWait(); clearWork(); accumulator = null;
    const baseline = frameNow();
    if (baseline === null || !raf || !visible()) { hide({ completed: false }); return; }
    // Reserve the final arc until the existing renderer-frame handoff gate actually advances.
    ring?.report({ id: 'entering-flight', progress: .96, ceiling: .997, label: 'Presenting the first frame' });
    // rAF alone can starve the whole escape window on a throttled host (background tab,
    // occluded window) while the game presents frames on its own cadence — pair it with a
    // self-clearing timer channel like the continue-fade veil so the shell still lifts.
    // A renderer frame alone is not the world: the opening first draw can hold for seconds
    // after flight starts (15 s on headless SwiftShader), and lifting then revealed the HUD over a
    // black playfield. Wait for the renderer's first playable paint too — firstPlayableFrameAt is
    // stamped after the first draw reached the screen (renderers without that field keep the
    // frame gate) — bounded by a cap below the 20.5 s escape so the veil can never stick.
    // The fade itself is unchanged.
    const render = state?.render;
    const tracksFirstDraw = !!render && Object.prototype.hasOwnProperty.call(render, 'firstPlayableFrameAt');
    const firstDrawSubmitted = () => !tracksFirstDraw || Number.isFinite(render.firstPlayableFrameAt);
    let capped = false;
    // After the first playable paint, keep the veil (sim still held) while the renderer's
    // per-object pipeline admissions drain: streamed meshes for what the camera sees compile and
    // take their exact-target admission draw here instead of in the first playable seconds.
    // Ready after a short quiet window with nothing pending; the cap still bounds the wait.
    let admissionsQuietSince = null;
    const clockNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : Date.now());
    let firstDrawSeenAt = null;
    const admissionsSettled = () => {
      // The drain has its own short cap past the first draw: smooth-from-the-first-second must
      // not cost a long load. Whatever is still pending then links after the lift.
      if (firstDrawSeenAt === null) firstDrawSeenAt = clockNow();
      if (clockNow() - firstDrawSeenAt >= ADMISSION_DRAIN_CAP_MS) return true;
      const pendingFn = render && render.pendingPipelineAdmissions;
      if (typeof pendingFn !== 'function') return true;
      let pending = 0;
      try { pending = Number(pendingFn()) || 0; } catch (_) { return true; }
      if (pending > 0) { admissionsQuietSince = null; return false; }
      if (admissionsQuietSince === null) admissionsQuietSince = clockNow();
      return clockNow() - admissionsQuietSince >= ADMISSION_QUIET_MS;
    };
    // A long first-draw wait (≈15–17 s on software GPUs) with the needle parked near 96% reads as
    // a hang: past a short grace, name the stage the shell is actually waiting on.
    revealStageTimer = setTimeout(() => {
      revealStageTimer = null;
      if (disposed || firstDrawSubmitted()) return;
      if (render) render.veilStage = 'rendering-sector';
      ring?.report({ id: 'rendering-sector', progress: .96, ceiling: .997, label: 'Rendering the sector…' });
    }, FIRST_DRAW_STAGE_LABEL_MS);
    // Hold the sim at spawn while the veil waits (presentationRunner reads this); every hide clears it.
    if (tracksFirstDraw) setFlightVeilHold(render, true);
    revealCapTimer = setTimeout(() => {
      revealCapTimer = null; capped = true;
      if (!firstDrawSubmitted()) console.info('[loading] veil lifted by the first-draw cap', { capMs: FIRST_DRAW_REVEAL_CAP_MS });
      poll('cap');
    }, FIRST_DRAW_REVEAL_CAP_MS);
    // Each channel clears only its own handle: the cap must not orphan a live poll timer.
    const poll = (source) => {
      if (source === 'timer') revealPollTimer = null; else if (source === 'raf') revealRaf = null;
      if (disposed) return;
      if (frameNow() > baseline && (capped || (firstDrawSubmitted() && admissionsSettled()))) {
        // Debug flag: tells a capped lift apart from a first-draw lift.
        if (render) render.veilLiftReason = firstDrawSubmitted() ? 'first-draw' : 'cap';
        // The sim stays held through the fade (hide releases it after a presented frame).
        cancelRevealWait(); ring?.finish();
        // A small, bounded finish interval lets the needle settle before removing the shell.
        if (ring?.mounted) revealDeadlineTimer = setTimeout(() => hide({ releaseAfterFade: true }), REVEAL_FINISH_MS);
        else hide({ releaseAfterFade: true }); // no decorative instrument to finish on minimal shells
        return;
      }
      if (raf && revealRaf === null) revealRaf = raf(() => poll('raf'));
      if (revealPollTimer === null) revealPollTimer = setTimeout(() => poll('timer'), 200);
    };
    revealRaf = raf(() => poll('raf'));
    revealPollTimer = setTimeout(() => poll('timer'), 200);
    // Preserve the pre-existing escape hatch; timeout is NOT evidence of readiness or 100%.
    revealDeadlineTimer = setTimeout(() => hide({ completed: false }), 20500);
  }
  function removeFailurePane() {
    if (failurePane) {
      failurePane.parentNode?.removeChild(failurePane);
      failurePane = null;
    }
    if (lockup?.style) lockup.style.display = priorLockupDisplay;
    delete overlay.dataset.startupFailure;
  }
  function clearStartupFailure({ dismiss = false } = {}) {
    if (!startupFailure) return false;
    startupFailure = null;
    removeFailurePane();
    activeStage = null;
    if (dismiss) hide({ completed: false });
    return true;
  }
  function eventMatchesCurrentGeneration(payload) {
    const eventGeneration = payload?.transitionGeneration
      ?? payload?.admissionRunGeneration
      ?? payload?.generation
      ?? payload?.transitionToken?.generation;
    const currentGeneration = state?.render?.admissionRunGeneration;
    return eventGeneration == null || currentGeneration == null
      || eventGeneration === currentGeneration;
  }
  function startupFailureCopy(payload = {}) {
    const failure = payload.failure && typeof payload.failure === 'object' ? payload.failure : {};
    const codeText = payload.code ?? failure.code ?? 'GAME_START_FAILED';
    const normalizedCode = String(codeText).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 40);
    const code = /^[A-Z][A-Z0-9_]{1,39}$/.test(normalizedCode)
      ? normalizedCode : 'GAME_START_FAILED';
    const stageValue = payload.stage ?? failure.stage ?? 'startup';
    const stage = String(stageValue || 'startup');
    const messageValue = payload.originalMessage ?? payload.error ?? failure.originalMessage
      ?? failure.error ?? payload.message ?? failure.message ?? payload.causes?.[0];
    const message = messageValue && typeof messageValue === 'object' && 'message' in messageValue
      ? String(messageValue.message) : String(messageValue ?? 'No technical detail was provided.');
    return { code, stage, message };
  }
  function showStartupFailure(payload = {}) {
    if (disposed || startupFailure || !eventMatchesCurrentGeneration(payload)) return false;
    cancelRevealWait(); clearWork(); accumulator = null; pendingWork = null; session++;
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
    startupFailure = startupFailureCopy(payload);
    activeStage = null;
    // Row 473: a failed launch has no destination to promise.
    resetDestination();
    ring?.stop();
    (terminalArt || NO_ART).stop();
    detachPointer();
    if (lockup?.style) lockup.style.display = 'none';
    const pane = dataState('error', {
      code: startupFailure.code,
      headline: 'Startup could not finish',
      fills: `The launch stopped during ${startupFailure.stage}.`,
      detail: startupFailure.message,
      verb: { label: 'Retry', onActivate: () => bus.emit('game:retryStart', { source: 'startup-failure-overlay' }) },
    });
    pane.setAttribute('data-startup-failure', 'true');
    // Keep recovery above the positioned cinematic canvas, which otherwise intercepts taps.
    pane.style.position = 'relative';
    pane.style.zIndex = '1';
    pane.style.maxHeight = 'calc(100% - 48px)';
    pane.style.overflowY = 'auto';
    pane.style.overflowWrap = 'anywhere';
    pane.setAttribute('data-startup-stage', startupFailure.stage);
    const body = pane.querySelector?.('.sf-state__body');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'sf-state__verb';
    back.textContent = 'Back to menu';
    back.setAttribute('data-sf-verb', 'back-to-menu');
    back.addEventListener('click', () => {
      bus.emit('game:exitToMenu', { source: 'startup-failure-overlay' });
      bus.emit('ui:closeAll', {});
      bus.emit('ui:pushScreen', { id: 'mainMenu', source: 'startup-failure-overlay' });
    });
    body?.appendChild(back);
    failurePane = pane;
    overlay.appendChild(pane);
    overlay.style.display = 'flex'; overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'false');
    overlay.dataset.startupFailure = startupFailure.code;
    pane.sfStateVerb?.focus?.();
    return true;
  }
  function resetForNewSession() {
    if (!clearStartupFailure()) return;
    hide({ completed: false });
  }
  const unsubs = [
    bus.on('game:loadingProgress', (stage) => {
      if (!startupFailure && eventMatchesCurrentGeneration(stage)) show(stage);
    }),
    bus.on('mode:changed', ({ mode } = {}) => {
      if (state?.mode != null && state.mode !== mode) return;
      if (mode === 'loading') {
        clearStartupFailure();
        show(activeStage || DEFAULT_STAGE);
      }
      else if (mode === 'flight') {
        if (startupFailure && state?.mode === 'flight') clearStartupFailure();
        if (!startupFailure) { activeStage = null; hideAfterFirstFlightFrame(); }
      }
      else if (mode === 'menu') {
        if (startupFailure) return;
        if (activeStage?.id?.startsWith('boot-')) return; // initial menu is revealed by main after init
        activeStage = null; hide({ completed: false });
        // Row 473: a cancelled or aborted load leaves no destination slate behind.
        resetDestination();
      }
    }),
    bus.on('game:startFailed', (payload = {}) => { showStartupFailure(payload); }),
    bus.on('game:new', resetForNewSession),
    bus.on('game:load', resetForNewSession),
    bus.on('game:exitToMenu', () => {
      if (clearStartupFailure()) hide({ completed: false });
      resetDestination();
    }),
    bus.on('save:error', (payload = {}) => {
      if (startupFailure) return;
      const loadingRoute = state?.mode === 'loading'
        || (activeStage && !activeStage.id?.startsWith('boot-'));
      if (payload.reason === 'load_failed' && loadingRoute && visible()) {
        const failure = {
          ...payload,
          code: payload.code || 'SAVE_LOAD_FAILED',
          stage: payload.stage || 'save-restore',
          error: payload.originalMessage ?? payload.error ?? payload.message,
          source: 'startup-save-error',
        };
        showStartupFailure(failure);
        bus.emit('game:startFailed', failure);
        return;
      }
      hide({ completed: false });
    }),
    // Row 473 — the destination slate. These are its own door: `resetForNewSession` above is a
    // no-op on the normal path (it only clears a startup failure), so the slate needs its own
    // listeners. `destroy` drains this same array.
    bus.on('game:new', (opts = {}) => { beginNewGame(opts && typeof opts === 'object' ? opts : {}); }),
    bus.on('game:load', (payload = {}) => { beginRestore(payload && typeof payload === 'object' ? payload : {}); }),
    bus.on('save:envelopePrepared', (payload = {}) => { nameRestore(payload && typeof payload === 'object' ? payload : {}); }),
    // A restore that never rode game:load — an envelope import, an in-flight rollback, a lane
    // sync — emits no envelopePrepared, so without these two the slate kept whatever a previous
    // session latched while mode:changed re-showed the overlay. Re-arm the generic words at
    // restore start and, once the world has applied, name the sector it actually resumed at.
    bus.on('save:restoring', () => {
      if (!restoredNamed) setDestination('restore', 'Restoring destination');
    }),
    bus.on('save:loaded', () => {
      if (destinationRoute === 'restore' && !restoredNamed) {
        const name = sectorNameFromWorld(state && state.world && state.world.currentSectorId);
        if (name) setDestination('restore', `Continue · ${name}`);
      }
      restoredNamed = false;
    }),
    bus.on('game:scenePrepared', (payload = {}) => { refreshSceneDestination(payload && typeof payload === 'object' ? payload : {}); }),
    bus.on('sector:enter', (payload = {}) => { nameSectorFromEnter(payload && typeof payload === 'object' ? payload : {}); }),
  ];
  if (visible()) {
    // Do not replace boot-modules with restoring-save at the entry -> main handoff.
    ring?.start(); const art = artwork(); art.start();
    art.updateProgress({ id: 'boot-state', progress: ring?.snapshot().shown || .14 });
  }
  return { show, hide, destroy() {
    releaseHoldNow();
    if (disposed) return;
    for (const unsub of unsubs) if (typeof unsub === 'function') unsub();
    unsubscribePaint(); unsubscribeWork(); cancelRevealWait(); clearWork();
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null; detachPointer(); removeFailurePane(); (terminalArt || NO_ART).destroy();
    terminalArt = null; retainedCanvas = null; ring?.destroy(); disposed = true;
  } };
}
