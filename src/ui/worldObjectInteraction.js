import { frameCostFixOn } from '../render/frameCostSwitches.js';
import { isSwarmGlass } from './swarmGlass.js';
import { isAdventureFlight } from './attentionGlass.js';
import { releaseWindowOpen, throwActionCue } from './throwCue.js';
import { verbChip } from './controlPrompts.js';
import { getPromptDevice } from './bindings.js';
import { resolvePlottedSeamWorkpoint, resolveWaypointPresentationEntity } from './navigationWaypoint.js';
import { calloutVoiceLive } from './calloutVoice.js';
import { createWorldObjectPicker } from '../render/worldObjectPicking.js';
import { createWorldObjectHoverPresentation } from '../render/objectHoverFeedback.js';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';
import { occupantGenerationOf } from '../core/entity.js';
import { isBeamTargetEligible, beamRangeFor } from '../systems/miningBeamTargetingRead.js';
import { initialMouseToolLane, recordMouseDownServicePick } from '../systems/input.js';
import { interactionClassLine, interactionDisplayName, presentationStatusWord } from '../data/entityInteractionProfiles.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { DENIAL, denialText, intentDenial } from '../combat/contactClassifier.js';
import { isConfirmOpen } from './confirm.js';
import { targetDisplayName } from './targetPanel.js';
import { createHoverTag, placeHoverTag, paintHoverTagVitals } from './orrery/hoverTag.js';
import { laneInputWrite, laneSetComponentSelection, reconcileLaneComponentSelection } from '../core/simLaneCommands.js';
import { formatDistance } from './units.js';
import { lineRelationWord, lineBodyMassT } from './lineRelation.js';
import { lineLessonBody } from '../data/lineProgression.js';
import { isSwarmControls } from '../data/swarmControls.js';
import { openingQuiet } from '../onboarding/openingQuiet.js';
import { verbBindingLabel } from '../onboarding/verbSpeech.js';

function hasOwn(o, k) {
  return !!o && Object.prototype.hasOwnProperty.call(o, k);
}

function beamVerbWord(entity) {
  if (entity && entity.data && entity.data.worldSiteTargetable === true) return 'work site';
  const t = entity && entity.type;
  if (t === 'asteroid') return 'mine';
  if (t === 'wreck' || t === 'derelict') return 'salvage';
  if (t === 'payload') return 'split';
  if (t === 'ship' || t === 'drone') return 'weld';
  return 'beam';
}

function workToolHint(state, label, directAction, touchText) {
  const device = state.input?.promptDevice || getPromptDevice();
  if (device === 'touch') return touchText;
  const options = { keyboardFallback: false };
  const direct = verbBindingLabel(state, directAction, device, options);
  if (direct) return `${direct} · ${label}`;
  const wheel = verbBindingLabel(state, 'contextWheel', device, options);
  return wheel ? `Hold ${wheel} → ${label}` : label;
}

// R12: the rope verb follows the acquisition verdict the latch itself uses (state.masslineAcquisition: a READY
// receipt for this very body and occupant, still inside its window) - never the mining / inspect branch. A
// bolted frame, a protected body or anything the latch refuses reads no rope verb at all.
export function ropeVerdictWord(state, entity, player) {
  const receipt = state && state.masslineAcquisition;
  const sel = receipt && receipt.selected;
  if (!entity || !sel || sel.status !== 'ready' || sel.targetId !== entity.id) return '';
  const life = occupantGenerationOf(entity);
  if (sel.occupantGeneration != null && life != null && sel.occupantGeneration !== life) return '';
  if (Number.isFinite(receipt.validUntil) && Number.isFinite(state.simTime) && state.simTime > receipt.validUntil) return '';
  return lineRelationWord(entity, lineBodyMassT(player)) || 'LATCH';
}

export function classWord(entity) {
  const line = interactionClassLine(entity);
  if (line) return line;
  const t = entity && entity.type;
  if (t === 'station') return entity.data && entity.data.isGate ? 'Jump Gate' : 'Station';
  if (t === 'asteroid') return 'Asteroid';
  if (t === 'ship') return 'Ship';
  if (t === 'drone') return 'Drone';
  if (typeof t === 'string' && t) {
    return t.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Contact';
}

function presentableSubject(state, id) {
  if (id == null) return null;
  const entity = resolveWorldPresentationEntity(state, id);
  if (!entity || entity.alive === false) return null;
  return entity;
}

export function applyWorldObjectSelection(state, entity, source) {
  if (!state || !entity || entity.id == null) return false;
  if (!state.player) state.player = {};
  const prevId = state.player.targetId;
  if (prevId !== entity.id) laneSetComponentSelection(state, null, null);
  laneInputWrite(state, 'player.targetId', entity.id);
  laneInputWrite(state, 'ui.objectSelection', {
    targetId: entity.id,
    source: source || 'pointer',
    stableKey: entity.stableKey != null ? entity.stableKey : entity.id,
    // The pick binds the occupant, not the number: when the id recycles, a recorded token that
    // no longer matches the resolved subject tells the sweep the picked body is gone.
    occupantGeneration: occupantGenerationOf(entity),
  });
  if (state.input) laneInputWrite(state, 'input.targetAssistDisabled', false);
  return true;
}

export function clearWorldObjectSelection(state) {
  if (!state || !state.player) return;
  laneInputWrite(state, 'player.targetId', null);
  laneSetComponentSelection(state, null, null);
  laneInputWrite(state, 'ui.objectSelection', null);
  laneInputWrite(state, 'input.targetAssistDisabled', true);
}

export function createWorldObjectInteraction(ctx, screenManager) {
  const state = ctx.state;
  const bus = ctx.bus || null;
  const canvas = (typeof document !== 'undefined') ? document.getElementById('gl-canvas') : null;
  const hudRoot = (typeof document !== 'undefined') ? document.getElementById('hud') : null;
  const hoverProjection = { x: 0, y: 0, onScreen: false };
  const listeners = [];
  const unsubs = [];
  let destroyed = false;

  // Canvas bounds are measured once per layout change, not once per pick: a live
  // getBoundingClientRect forces layout after the previous frame's DOM writes. The record is
  // refreshed when the observer or a resize/scroll marks it dirty; hosts where no observer can
  // attach re-measure on every pick so the cached bounds can never go stale.
  const viewport = { width: 1, height: 1, left: 0, top: 0 };
  let viewportDirty = true;
  let viewportObserved = false;
  // Consumed by the next repick: a layout invalidation (scroll/resize/observer) is a real
  // layout change, not world sweep — the hover it produces is trusted immediately.
  let viewportInvalidated = false;
  let viewportObserver = null;

  const picker = createWorldObjectPicker({
    state,
    getCamera: () => state.render && state.render.camera,
    getMeshes: () => state.render && state.render.meshes,
    getScene: () => state.render && state.render.scene,
    getViewport: () => viewport,
  });

  const hoverPresentation = createWorldObjectHoverPresentation(state);

  let hoverId = null;
  let hoverEntity = null;
  // Hover latch state (see applyHoverPick): pick-rate subject swaps strobe the glow/nameplate
  // while the world sweeps under a still cursor in fast flight.
  let hoverCandidateId = null;
  let hoverCandidateStreak = 0;
  let hoverEmptySinceMs = 0;
  let gestureActive = false;
  let gestureTargetId = null;
  let hoverRootPublished = null;
  let insideCanvas = false;
  let lastPoint = null;
  // A motionless cursor does not need a full scene re-raycast every frame — the pick walks every
  // presented leaf (~0.6 ms on the iGPU floor, pure CPU). Repick immediately when the pointer
  // moved; while it sits still the world under it is re-sampled at ~8 Hz, an imperceptible lag
  // for hover feedback. Click/gesture picks stay synchronous and are untouched.
  let repickIdleS = Infinity;
  // HUD-FRAME-BREADTH: the scene raycast runs on the HUD's budgeted 'hover-pick' job at 8 Hz
  // where a scheduler is live; a pointer jump > 48 px, a viewport invalidation or the first
  // pick requests it so it still lands on this presented frame. Without a live scheduler the
  // elapsed gate below behaves exactly as before.
  let hoverPickJobRanAt = -Infinity;
  let queuedHoverPick = null;
  let hoverPickTask;
  function hoverPickJob() {
    if (hoverPickTask !== undefined) return hoverPickTask;
    hoverPickTask = null;
    try {
      const tasks = ctx && ctx.registry && typeof ctx.registry.get === 'function'
        && ctx.registry.get('ui') && ctx.registry.get('ui').hud
        && ctx.registry.get('ui').hud.frameTasks;
      if (tasks && typeof tasks.register === 'function') {
        hoverPickTask = tasks.register('hover-pick', () => {
          hoverPickJobRanAt = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
          if (!frameCostFixOn('hudBreadth')) return;
          const job = queuedHoverPick;
          queuedHoverPick = null;
          if (!job || destroyed || !acceptingInput()) return;
          const hit = pickAt(job.pt);
          applyHoverPick(hit && hit.entity ? hit.entity : null, job.deliberate);
          publishHover();
        }, { hz: 8 });
      }
    } catch (_) { hoverPickTask = null; }
    return hoverPickTask;
  }
  let lastRepickX = null;
  let lastRepickY = null;
  let previewTextKey = '';
  // The massline preview elements live under the persistent #sf-ml2 mount. Keep each found
  // element while it stays connected — the document queries ran on every hovered-entity frame.
  let ml2ThrowCueEl = null;
  let ml2LatchCueEl = null;
  function ml2ThrowCueElement() {
    if (typeof document === 'undefined') return null;
    if (ml2ThrowCueEl && ml2ThrowCueEl.isConnected
        && ml2ThrowCueEl.getAttribute?.('data-throw-cue') === '1') return ml2ThrowCueEl;
    ml2ThrowCueEl = document.querySelector?.('#sf-ml2 .ml2-preview[data-throw-cue="1"]') || null;
    return ml2ThrowCueEl;
  }
  function ml2LatchCueElement() {
    if (typeof document === 'undefined') return null;
    if (ml2LatchCueEl && ml2LatchCueEl.isConnected
        && ml2LatchCueEl.hasAttribute?.('data-target-id')) return ml2LatchCueEl;
    ml2LatchCueEl = document.querySelector?.('#sf-ml2 .ml2-preview[data-target-id]') || null;
    return ml2LatchCueEl;
  }

  let tag = null;
  if (hudRoot && typeof document !== 'undefined') {
    tag = createHoverTag(document);
    if (tag) hudRoot.appendChild(tag.el);
  }

  function listen(target, type, fn, options) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, options);
    listeners.push({ target, type, fn, options });
  }

  function simInput() {
    const registry = ctx && ctx.registry;
    const sys = registry && typeof registry.get === 'function' ? registry.get('input') : null;
    return sys && typeof sys.cancelWorldObjectGesture === 'function' ? sys : null;
  }

  function screenOpen() {
    if (!screenManager) return false;
    if (typeof screenManager.isOpen === 'function' && screenManager.isOpen()) return true;
    if (typeof screenManager.isLiveOverlay === 'function' && screenManager.isLiveOverlay()) return true;
    return false;
  }

  function modalClass() {
    const body = typeof document !== 'undefined' ? document.body : null;
    return !!(body && body.classList
      && (body.classList.contains('ui-modal-open') || body.classList.contains('ui-live-screen')));
  }

  function acceptingInput() {
    return !!(state && state.mode === 'flight'
      && !(state.ui && state.ui.docked === true)
      && !(state.ui && state.ui.fulfillmentBlackoutActive === true)
      && !(state.input && state.input.blocked === true)
      && !screenOpen() && !modalClass() && !isConfirmOpen() && !destroyed);
  }

  function pointerLocked() {
    return !!(typeof document !== 'undefined' && canvas && document.pointerLockElement === canvas);
  }

  function pointerPoint(e) {
    const inp = state && state.input;
    const ps = inp && inp.pointerScreen;
    const autoAim = !!(inp && inp.autoFire);
    if (ps && ps.active && (pointerLocked() || autoAim || !e || !Number.isFinite(e.clientX))) {
      return { x: ps.x, y: ps.y };
    }
    if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      return { x: e.clientX, y: e.clientY };
    }
    if (ps && ps.active) return { x: ps.x, y: ps.y };
    return null;
  }

  function cancelGesture(reason) {
    const owner = simInput();
    if (owner) {
      owner.cancelWorldObjectGesture(reason);
      return;
    }
    const inp = state && state.input;
    if (bus && typeof bus.emit === 'function') {
      try { bus.emit('input:worldGestureCancelled', { reason }); } catch (_) {}
    }
    if (inp && hasOwn(inp, 'worldObjectTargetId')) laneInputWrite(state, 'input.worldObjectTargetId', undefined);
  }

  function endGesture() {
    gestureActive = false;
    gestureTargetId = null;
    const inp = state && state.input;
    if (inp && hasOwn(inp, 'worldObjectTargetId')) laneInputWrite(state, 'input.worldObjectTargetId', undefined);
  }

  function clearSelectionMeta() {
    laneSetComponentSelection(state, null, null);
    const sel = state.ui && state.ui.objectSelection;
    if (sel && state.player && state.player.targetId === sel.targetId) {
      laneInputWrite(state, 'player.targetId', null);
    }
    laneInputWrite(state, 'ui.objectSelection', null);
  }

  function setHover(entity) {
    hoverEntity = entity || null;
    hoverId = hoverEntity ? hoverEntity.id : null;
    hoverCandidateId = null;
    hoverCandidateStreak = 0;
    hoverEmptySinceMs = 0;
  }

  // Hover latch: in fast flight the WORLD moves under a cursor that is still or drifting, so a
  // raw per-repick swap strobes the hull glow and the nameplate between hulls (or in and out of
  // hover) at pick rate. Micro-movement and idle-cadence picks go through the latch: a new
  // subject must survive two consecutive picks before it is believed, an empty pick must persist
  // 150 ms before the hover drops. A deliberate pointer jump (>6 px since the last pick) or the
  // first pick of a session switches immediately — press-time picking is unaffected either way.
  const HOVER_SWEEP_MOVE_PX = 6;
  function applyHoverPick(entity, deliberateMove) {
    if (deliberateMove) {
      setHover(entity);
      return;
    }
    const nextId = entity ? entity.id : null;
    if (nextId === hoverId) {
      hoverCandidateId = null;
      hoverCandidateStreak = 0;
      hoverEmptySinceMs = 0;
      return;
    }
    if (nextId == null) {
      if (!hoverEmptySinceMs) hoverEmptySinceMs = performance.now();
      if (performance.now() - hoverEmptySinceMs >= 150) setHover(null);
      return;
    }
    hoverEmptySinceMs = 0;
    if (nextId === hoverCandidateId) {
      hoverCandidateStreak += 1;
      if (hoverCandidateStreak >= 2) setHover(entity);
    } else {
      hoverCandidateId = nextId;
      hoverCandidateStreak = 1;
    }
  }

  function hoverRoot() {
    if (!hoverEntity) return null;
    const meshes = state.render && state.render.meshes;
    if (meshes && typeof meshes.get === 'function') {
      const root = meshes.get(hoverEntity.id);
      if (root) return root;
    }
    return hoverEntity.mesh || null;
  }

  function hoverTint() {
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!hoverEntity || !player) return 'neutral';
    if (isHostileToPlayer(hoverEntity, player.team, state)) return 'hostile';
    if ((player.team !== 0 && hoverEntity.team === player.team) || (hoverEntity.data && hoverEntity.data.ownerId === player.id)) return 'friendly';
    return 'neutral';
  }

  function publishHover() {
    const root = (acceptingInput() && hoverEntity) ? hoverRoot() : null;
    if (root === hoverRootPublished) return;
    hoverRootPublished = root;
    try { hoverPresentation.setTint(hoverTint()); } catch (_) {}
    try { hoverPresentation.setSubject(root); } catch (_) {}
  }

  function hidePreview() {
    // tick() calls this every idle frame; re-setting [hidden] would invalidate style each time.
    if (tag && !tag.el.hidden) tag.el.hidden = true;
    previewTextKey = '';
  }

  function cancelAll(reason, { dropSelection = false } = {}) {
    if (gestureActive || (state.input && hasOwn(state.input, 'worldObjectTargetId'))) {
      cancelGesture(reason);
    }
    gestureActive = false;
    gestureTargetId = null;
    if (dropSelection) clearSelectionMeta();
    setHover(null);
    publishHover();
    hidePreview();
  }

  function refreshViewport() {
    const rect = (canvas && typeof canvas.getBoundingClientRect === 'function')
      ? canvas.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
      viewport.width = rect.width;
      viewport.height = rect.height;
      viewport.left = rect.left || 0;
      viewport.top = rect.top || 0;
    } else {
      viewport.width = (typeof innerWidth === 'number' ? innerWidth : 1) || 1;
      viewport.height = (typeof innerHeight === 'number' ? innerHeight : 1) || 1;
      viewport.left = 0;
      viewport.top = 0;
    }
    viewportDirty = false;
  }

  function markViewportDirty() {
    if (destroyed) return;
    viewportDirty = true;
    viewportInvalidated = true;
    // A layout change can move the body under a motionless cursor — bypass the idle
    // repick cadence so the next tick re-measures and raycasts fresh.
    repickIdleS = Infinity;
  }

  function pickAt(pt) {
    if (!pt) return null;
    if (viewportDirty || !viewportObserved) refreshViewport();
    return picker.pick(pt.x - viewport.left, pt.y - viewport.top);
  }

  function onRightDown(e) {
    if (e.button !== 2) return;
    if (!acceptingInput()) return;
    insideCanvas = true;
    const pt = pointerPoint(e);
    if (pt) lastPoint = pt;
    const inp = state.input;
    if (!inp) return;
    // A deliberate down must see a just-changed layout even before the observer delivers.
    viewportDirty = true;
    const hit = pickAt(pt);
    laneInputWrite(state, 'input.worldObjectTargetId', hit && hit.entity ? hit.entity.id : null);
    gestureActive = true;
    gestureTargetId = inp.worldObjectTargetId;
    if (hit && hit.entity) {
      const entity = hit.entity;
      if (state.run?.kind === 'adventure' && entity.type === 'fx' && entity.presentationAdmission === 'ready'
          && entity.data?.furnaceCapstanId && entity.data?.masslineTetherable === false) {
        recordMouseDownServicePick(e, entity.id, occupantGenerationOf(entity));
      }
      applyWorldObjectSelection(state, hit.entity, 'pointer');
      setHover(hit.entity);
    } else {
      clearWorldObjectSelection(state);
      setHover(null);
      if (bus && typeof bus.emit === 'function') {
        bus.emit('toast', { text: 'Free aim · Tab to lock', kind: 'info', ttl: 2 });
      }
    }
  }

  function onButtonUp(e) {
    if (e.button !== 2) return;
    endGesture();
  }

  function onPointerMove(e) {
    insideCanvas = true;
    const pt = pointerPoint(e);
    if (pt) lastPoint = pt;
  }

  function onCanvasLeave() {
    insideCanvas = false;
    setHover(null);
    publishHover();
    hidePreview();
  }

  function onBlur() {
    cancelAll('window-blur');
  }

  function onVisibility() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      cancelAll('visibility');
    }
  }

  const usePointer = typeof window !== 'undefined' && 'PointerEvent' in window;
  if (canvas) {
    // Resolve the pick on the same mouse press before either flight adapter samples it.
    listen(canvas, 'mousedown', onRightDown, { capture: true });
    listen(canvas, usePointer ? 'pointermove' : 'mousemove', onPointerMove);
    listen(canvas, usePointer ? 'pointerover' : 'mouseover', onPointerMove);
    listen(canvas, 'pointerleave', onCanvasLeave);
    listen(canvas, 'mouseleave', onCanvasLeave);
  }
  const windowTarget = typeof window !== 'undefined' ? window : null;
  listen(windowTarget, usePointer ? 'pointerup' : 'mouseup', onButtonUp);
  listen(windowTarget, 'blur', onBlur);
  if (typeof document !== 'undefined') listen(document, 'visibilitychange', onVisibility);

  try {
    if (canvas && typeof ResizeObserver === 'function') {
      viewportObserver = new ResizeObserver(markViewportDirty);
      viewportObserver.observe(canvas);
      viewportObserved = true;
    }
  } catch (_) {
    try { if (viewportObserver) viewportObserver.disconnect(); } catch (_) {}
    viewportObserver = null;
    viewportObserved = false;
  }
  listen(windowTarget, 'resize', markViewportDirty);
  // Scroll does not bubble — the captured listener catches offsets moved by nested scrollers.
  if (typeof document !== 'undefined') listen(document, 'scroll', markViewportDirty, true);

  if (bus && typeof bus.on === 'function') {
    unsubs.push(bus.on('mining:start', (payload) => {
      if (!payload || payload.minerId !== state.playerId) return;
      const entity = resolveWorldPresentationEntity(state, payload.targetId);
      if (entity && entity.alive !== false) applyWorldObjectSelection(state, entity, 'beam');
    }));
    for (const name of ['sector:exit', 'sector:enter']) {
      unsubs.push(bus.on(name, () => cancelAll(name, { dropSelection: true })));
    }
    for (const name of ['save:loaded', 'game:new', 'game:started']) {
      unsubs.push(bus.on(name, () => cancelAll(name, { dropSelection: true })));
    }
    unsubs.push(bus.on('dock:docked', () => cancelAll('dock:docked', { dropSelection: true })));
  }

  function sweepDeadSubjects() {
    const component = state.ui?.componentSelection;
    if (component) {
      reconcileLaneComponentSelection(state);
      if (!state.ui.componentSelection) laneSetComponentSelection(state, null, null);
    }
    const sel = state.ui && state.ui.objectSelection;
    if (sel && sel.targetId != null) {
      const subject = presentableSubject(state, sel.targetId);
      // Recycled id: the pick recorded one occupant token and the resolved body carries a
      // different one — the picked body is dead even though the id still presents. Only a
      // present-vs-present mismatch proves that; a ledger row without a token stays honest.
      const generation = subject ? occupantGenerationOf(subject) : null;
      const recycled = !!(subject && sel.occupantGeneration != null && generation != null
        && generation !== sel.occupantGeneration);
      if (!subject || recycled) {
        laneSetComponentSelection(state, null, null);
        laneInputWrite(state, 'ui.objectSelection', null);
        if (state.player && state.player.targetId === sel.targetId) laneInputWrite(state, 'player.targetId', null);
      }
    }
    if (hoverId != null && !presentableSubject(state, hoverId)) setHover(null);
    if (gestureTargetId != null && !presentableSubject(state, gestureTargetId)) {
      cancelGesture('subject-gone');
      gestureActive = false;
      gestureTargetId = null;
    }
  }

  function ropeVerbText(entity, player) {
    const lineWord = ropeVerdictWord(state, entity, player);
    if (!lineWord) return '';
    // OPENING-1b's hush: before the first throw lands, a body you would only swing round stays unlabelled
    // so the light lesson rock is the one thing that speaks.
    const hushed = lineWord === 'ANCHOR' && openingQuiet(state)
      && !(state.onboarding && state.onboarding.firstThrowSeen === true) && !lineLessonBody(entity);
    return hushed ? '' : verbChip(state, 'tether', lineWord);
  }
  // The rope verb (who moves) and the work-tool / wheel guidance are separate segments of one hint.
  function beamHint(entity, player, scanLesson) {
    const hint = beamHintBase(entity, player, scanLesson);
    if (hint.sling) return hint;
    const lineText = ropeVerbText(entity, player);
    const wheelText = hint.text;
    return { ...hint, lineText, wheelText, text: lineText && wheelText ? lineText + ' · ' + wheelText : (lineText || wheelText) };
  }

  function beamHintBase(entity, player, scanLesson) {
    const lane = initialMouseToolLane(state, entity && entity.id);
    if (lane === 'sling') {
      // G18-02: RMB is the Line — while a throwable is latched it arms the throw.
      return { sling: true, text: throwActionCue(state), beam: false };
    }
    if (lane !== 'beam' || isSwarmControls(state)) {
      // Packet 02: say what the press COMMITS to before it happens — an attack target takes the guns,
      // a prop only selects a tool subject, a friendly or neutral hull only informs. RMB still
      // selects under the cursor; under G18-02 the same press also fires the Line.
      // One verb chip, whatever the pick intent: the press latches the Line (guns still lock).
      // R12 (design/overhaul/03_COMBAT.md §2.1): the rope verb itself (TOW / TUG / ANCHOR, with OPENING-1b's
      // hush) is added by beamHint from the acquisition verdict; this lane carries no guidance of its own.
      return { sling: false, text: '', beam: false };
    }
    if (scanLesson || intentDenial(state, entity, null) === DENIAL.UNOBSERVED) {
      return { sling: false, text: workToolHint(state, 'Scan', 'scanPulse', 'Powers → Flight → Scan'), beam: true };
    }
    if (!isBeamTargetEligible(entity, state)) {
      const depleted = !!(entity && entity.data && entity.data.respawnAt != null);
      return {
        sling: false,
        text: depleted ? 'Ore depleted' : '',
        beam: false,
      };
    }
    const range = beamRangeFor(player, state);
    if (range != null && player && player.pos && entity.pos) {
      const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      if (d > range + (entity.radius || 0)) {
        return { sling: false, text: `${beamVerbWord(entity)} · ${denialText(DENIAL.OUT_OF_RANGE)}`, beam: false };
      }
    }
    const site = entity.data?.worldSiteTargetable === true;
    const label = site ? 'Site Beam' : 'Mine Beam';
    return {
      sling: false,
      text: workToolHint(state, label, site ? 'siteBeam' : 'mine', site ? label : 'Hold Mine'),
      beam: true,
    };
  }

  function previewFor(entity) {
    if (!tag || !entity) return;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    const ob = state.onboarding;
    const workpoint = ob?.active && !ob.finished && ob.beatDoneAt?.seam == null
      ? resolvePlottedSeamWorkpoint(state) || state.nav?.waypoint : null;
    const seam = workpoint?.markerId === 'onboarding:seam' && workpoint.presentationEntityGeneration != null
      && resolveWaypointPresentationEntity(state, workpoint) === entity;
    const name = (seam && workpoint.label) || targetDisplayName(entity) || interactionDisplayName(entity);
    const relation = !player || entity.id === player.id
      ? 'You'
      : isHostileToPlayer(entity, player.team, state)
        ? 'Hostile'
        : (player.team !== 0 && entity.team === player.team) || entity.data?.ownerId === player.id
          ? 'Ally'
          : 'Neutral';
    let rangeTxt = '';
    if (player && player.pos && entity.pos) {
      const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      rangeTxt = ' · ' + formatDistance(d);
    }
    // A Swarm centre callout (LATCHED, a kill word) owns the moment: the world chip steps aside
    // for its few seconds instead of printing over it.
    if (isSwarmGlass(state) && calloutVoiceLive()) { tag.el.hidden = true; return; }
    const rawHint = beamHint(entity, player, seam && !ob.firedFollowups?.['seam:scan:hit']);
    // Your own hull is never a thing to latch: the card names it, the verb stays off it.
    // The held-body cue owns the verb only while it is actually painted. Keep identity and
    // vitals here, and keep the ordinary hint if the cue is hidden by another HUD message.
    const tether = state.player && state.player.tether;
    const heldHere = isAdventureFlight(state) && tether?.active && tether.targetId === entity.id;
    const throwCue = heldHere ? ml2ThrowCueElement() : null;
    const heldThrowShown = throwCue && throwCue.style.display !== 'none'
      && throwCue.textContent === throwActionCue(state);
    // One voice on the body (08 §4): the held body's aim tag (RMB · THROW) sits where this card
    // would, so the card steps aside entirely while that tag is painted.
    if (heldThrowShown) { tag.el.hidden = true; return; }
    const disabledRaider = entity.data?.onboardingRaid === true && entity.data?.ai?.passive === true;
    const desktopVisor = isAdventureFlight(state) && document.body?.dataset?.hudSkin === 'orrery'
      && document.documentElement?.dataset?.sfMobileFlight !== '1';
    const latchCue = (disabledRaider || desktopVisor) && !rawHint.sling
      ? ml2LatchCueElement() : null;
    const duplicateLatch = latchCue && latchCue.style.display !== 'none' && latchCue.dataset.targetId === String(entity.id)
      && (latchCue.textContent === rawHint.text || (rawHint.lineText && latchCue.textContent === rawHint.lineText)
        || latchCue.classList.contains('ml2-visor-latch') && !rawHint.beam);
    // A bracket that already names the rope verb keeps only the work-tool guidance on the hover tag.
    const hint = relation === 'You' || heldThrowShown ? { sling: false, beam: false, text: '' }
      : duplicateLatch ? (rawHint.beam && rawHint.wheelText ? { ...rawHint, text: rawHint.wheelText } : { sling: false, beam: false, text: '' })
      : rawHint;
    // In a Swarm round the glass keeps only the name and the verb on the object (rule 2); the
    // class / relation / range read-out is an inspector's line, not a fight HUD line.
    const fight = isSwarmGlass(state);
    const status = fight ? null : presentationStatusWord(entity);
    const selected = !!(state.player && state.player.targetId === entity.id);
    const relationLabel = disabledRaider ? 'Disabled' : relation;
    const key = [name, classWord(entity), relation, relationLabel, rangeTxt, hint.text, status || '', fight ? 'fight' : '', selected ? 'sel' : ''].join('|');
    if (key !== previewTextKey) {
      previewTextKey = key;
      tag.nameEl.textContent = fight ? '' : name;
      // The meta line adds only what the name does not say: no class word that repeats the name
      // ('Asteroid · Asteroid'), and a relation only for things that can take a side.
      const cls = classWord(entity);
      const sided = entity.type === 'ship' || entity.type === 'station' || entity.type === 'drone'
        || relation === 'You' || disabledRaider;
      const metaParts = [];
      if (cls && cls.toLowerCase() !== String(name || '').toLowerCase()) metaParts.push(cls);
      if (sided) metaParts.push(relationLabel);
      const metaHead = metaParts.join(' · ');
      tag.metaEl.textContent = fight ? '' : (metaHead ? metaHead + rangeTxt : rangeTxt.replace(/^ · /, ''))
        + (status ? ' · ' + status : '');
      tag.hintEl.textContent = hint.text;
      tag.el.dataset.beam = hint.beam ? '1' : '0';
      tag.el.dataset.sling = hint.sling ? '1' : '0';
      tag.el.dataset.selected = selected ? '1' : '0';
      tag.el.dataset.relation = relation.toLowerCase();
    }
    // The hover cue lights only for the body selected by the release solver.
    const throwReadyHere = tag.el.dataset.sling === '1' && releaseWindowOpen(state, entity.id);
    tag.el.dataset.window = throwReadyHere ? '1' : '0';
    tag.el.dataset.bars = paintHoverTagVitals(tag, entity) ? '1' : '0';
    const width = typeof innerWidth === 'number' ? innerWidth : 1200;
    const height = typeof innerHeight === 'number' ? innerHeight : 800;
    const projected = desktopVisor && entity.pos ? ctx.helpers?.worldToScreen?.(entity.pos, hoverProjection) : null;
    const anchored = projected?.onScreen && projected.x >= 155 && projected.x <= width - 155
      && projected.y >= 128 && projected.y <= height - 20;
    const anchorMode = anchored ? '1' : '0';
    if (tag.el.dataset.visorAnchor !== anchorMode) tag.el.dataset.visorAnchor = anchorMode;
    const pt = anchored ? projected : lastPoint || pointerPoint(null);
    if (pt) placeHoverTag(tag.el, pt.x, pt.y, width, height);
    tag.el.hidden = false;
  }

  function tick(dt) {
    if (destroyed) return;
    hoverPresentation.update();
    if (!acceptingInput()) {
      queuedHoverPick = null;
      if (gestureActive || (state.input && hasOwn(state.input, 'worldObjectTargetId'))) {
        cancelAll('ui-intercept');
      } else {
        setHover(null);
        publishHover();
        hidePreview();
      }
      return;
    }
    if (gestureActive && !(state.input && hasOwn(state.input, 'worldObjectTargetId'))) {
      gestureActive = false;
      gestureTargetId = null;
    }
    sweepDeadSubjects();
    if (gestureActive) {
      const subject = presentableSubject(state, gestureTargetId);
      setHover(insideCanvas || pointerLocked() ? subject : null);
    } else {
      const pt = insideCanvas || pointerLocked() ? pointerPoint(null) : null;
      const inp = state.input;
      const ps = inp && inp.pointerScreen;
      if (!pt || !ps || !ps.active) {
        repickIdleS = Infinity;
        lastRepickX = null;
        lastRepickY = null;
        queuedHoverPick = null;
        setHover(null);
      } else {
        repickIdleS += Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
        const moved = lastRepickX == null
          || Math.abs(pt.x - lastRepickX) > 0.5
          || Math.abs(pt.y - lastRepickY) > 0.5;
        // Without a ResizeObserver the cached bounds can lie at any time; only the
        // observed path may sit out a repick.
        // Raycasting the whole scene is the expensive part of this tick. Pointer drift
        // repicks at ~7 Hz; a jump (> 48 px), layout change, or first pick is immediate.
        const sweep = lastRepickX == null || viewportInvalidated
          || Math.abs(pt.x - lastRepickX) > 48
          || Math.abs(pt.y - lastRepickY) > 48;
        if ((moved && (sweep || repickIdleS >= 0.14)) || !viewportObserved || repickIdleS >= 0.125) {
          repickIdleS = 0;
          const deliberateMove = viewportInvalidated || lastRepickX == null
            || Math.abs(pt.x - lastRepickX) > HOVER_SWEEP_MOVE_PX
            || Math.abs(pt.y - lastRepickY) > HOVER_SWEEP_MOVE_PX;
          viewportInvalidated = false;
          lastRepickX = pt.x;
          lastRepickY = pt.y;
          const task = hoverPickJob();
          const nowMs = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
          const schedulerLive = !!task && frameCostFixOn('hudBreadth')
            && nowMs - hoverPickJobRanAt < 250;
          if (schedulerLive) {
            queuedHoverPick = { pt, deliberate: deliberateMove };
            // A jump, invalidation or first pick lands on this presented frame's job run;
            // idle repicks simply wait for the 8 Hz cadence.
            if (deliberateMove) task.request();
          } else {
            const hit = pickAt(pt);
            applyHoverPick(hit && hit.entity ? hit.entity : null, deliberateMove);
          }
        }
      }
    }
    publishHover();
    if (hoverEntity) previewFor(hoverEntity);
    else hidePreview();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    laneSetComponentSelection(state, null, null);
    cancelGesture('destroy');
    if (viewportObserver) {
      try { viewportObserver.disconnect(); } catch (_) {}
      viewportObserver = null;
    }
    for (const { target, type, fn, options } of listeners) {
      try { target.removeEventListener(type, fn, options); } catch (_) {}
    }
    listeners.length = 0;
    for (const off of unsubs) {
      try { typeof off === 'function' && off(); } catch (_) {}
    }
    unsubs.length = 0;
    endGesture();
    try { hoverPresentation.dispose(); } catch (_) {}
    if (tag && tag.el.parentNode) tag.el.parentNode.removeChild(tag.el);
  }

  return {
    tick,
    destroy,
    diagnostics() {
      return {
        hoverId,
        hoverName: hoverEntity ? interactionDisplayName(hoverEntity) : null,
        gestureActive,
        gestureTargetId,
        insideCanvas,
        objectSelection: state.ui ? state.ui.objectSelection || null : null,
      };
    },
  };
}
