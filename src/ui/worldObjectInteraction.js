import { createWorldObjectPicker } from '../render/worldObjectPicking.js';
import { createWorldObjectHoverPresentation } from '../render/objectHoverFeedback.js';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';
import { occupantGenerationOf } from '../core/entity.js';
import { isBeamTargetEligible, beamRangeFor } from '../systems/mining.js';
import { initialMouseToolLane } from '../systems/input.js';
import { interactionDisplayName, interactionProfileForEntity, presentationStatusWord } from '../data/entityInteractionProfiles.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { isConfirmOpen } from './confirm.js';
import { targetDisplayName } from './targetPanel.js';
import { createHoverTag, placeHoverTag, paintHoverTagVitals } from './orrery/hoverTag.js';

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

function classWord(entity) {
  const profile = interactionProfileForEntity(entity);
  if (profile.kind === 'unstable_reactor_wreck') return 'Hazardous Salvage';
  if (profile.kind === 'wreck') return 'Salvage';
  if (profile.classLabel) return profile.classLabel;
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
  if (prevId !== entity.id && state.ui) state.ui.componentSelection = null;
  state.player.targetId = entity.id;
  if (!state.ui) state.ui = {};
  state.ui.objectSelection = {
    targetId: entity.id,
    source: source || 'pointer',
    stableKey: entity.stableKey != null ? entity.stableKey : entity.id,
    // The pick binds the occupant, not the number: when the id recycles, a recorded token that
    // no longer matches the resolved subject tells the sweep the picked body is gone.
    occupantGeneration: occupantGenerationOf(entity),
  };
  if (state.input) state.input.targetAssistDisabled = false;
  return true;
}

export function clearWorldObjectSelection(state) {
  if (!state || !state.player) return;
  state.player.targetId = null;
  if (state.ui) {
    state.ui.objectSelection = null;
    state.ui.componentSelection = null;
  }
  if (state.input) state.input.targetAssistDisabled = true;
}

export function createWorldObjectInteraction(ctx, screenManager) {
  const state = ctx.state;
  const bus = ctx.bus || null;
  const canvas = (typeof document !== 'undefined') ? document.getElementById('gl-canvas') : null;
  const hudRoot = (typeof document !== 'undefined') ? document.getElementById('hud') : null;
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
  let lastRepickX = null;
  let lastRepickY = null;
  let previewTextKey = '';

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
    if (inp && hasOwn(inp, 'worldObjectTargetId')) delete inp.worldObjectTargetId;
  }

  function endGesture() {
    gestureActive = false;
    gestureTargetId = null;
    const inp = state && state.input;
    if (inp && hasOwn(inp, 'worldObjectTargetId')) delete inp.worldObjectTargetId;
  }

  function clearSelectionMeta() {
    const sel = state.ui && state.ui.objectSelection;
    if (sel && state.player && state.player.targetId === sel.targetId) {
      state.player.targetId = null;
    }
    if (state.ui) state.ui.objectSelection = null;
  }

  function setHover(entity) {
    hoverEntity = entity || null;
    hoverId = hoverEntity ? hoverEntity.id : null;
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
    if (tag) tag.el.hidden = true;
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
    inp.worldObjectTargetId = hit && hit.entity ? hit.entity.id : null;
    gestureActive = true;
    gestureTargetId = inp.worldObjectTargetId;
    if (hit && hit.entity) {
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
    listen(canvas, usePointer ? 'pointerdown' : 'mousedown', onRightDown);
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
        state.ui.objectSelection = null;
        if (state.player && state.player.targetId === sel.targetId) state.player.targetId = null;
      }
    }
    if (hoverId != null && !presentableSubject(state, hoverId)) setHover(null);
    if (gestureTargetId != null && !presentableSubject(state, gestureTargetId)) {
      cancelGesture('subject-gone');
      gestureActive = false;
      gestureTargetId = null;
    }
  }

  function beamHint(entity, player) {
    const lane = initialMouseToolLane(state, entity && entity.id);
    if (lane === 'sling') {
      return { sling: true, text: 'RMB select · hold to aim sling', beam: false };
    }
    if (lane !== 'beam') {
      return { sling: false, text: 'RMB select', beam: false };
    }
    if (!isBeamTargetEligible(entity, state)) {
      const depleted = !!(entity && entity.data && entity.data.respawnAt != null);
      return {
        sling: false,
        text: `RMB select · ${beamVerbWord(entity)} ${depleted ? 'depleted' : 'unavailable'}`,
        beam: false,
      };
    }
    const range = beamRangeFor(player, state);
    if (range != null && player && player.pos && entity.pos) {
      const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      if (d > range + (entity.radius || 0)) {
        return { sling: false, text: `RMB select · ${beamVerbWord(entity)} out of range`, beam: false };
      }
    }
    return { sling: false, text: 'RMB select · hold ' + beamVerbWord(entity), beam: true };
  }

  function previewFor(entity) {
    if (!tag || !entity) return;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    const name = targetDisplayName(entity) || interactionDisplayName(entity);
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
      rangeTxt = ' · ' + Math.round(d) + ' wu';
    }
    const hint = beamHint(entity, player);
    const status = presentationStatusWord(entity);
    const selected = !!(state.player && state.player.targetId === entity.id);
    const key = [name, classWord(entity), relation, rangeTxt, hint.text, status || '', selected ? 'sel' : ''].join('|');
    if (key !== previewTextKey) {
      previewTextKey = key;
      tag.nameEl.textContent = name;
      tag.metaEl.textContent = classWord(entity) + ' · ' + relation + rangeTxt
        + (status ? ' · ' + status : '');
      tag.hintEl.textContent = hint.text;
      tag.el.dataset.beam = hint.beam ? '1' : '0';
      tag.el.dataset.sling = hint.sling ? '1' : '0';
      tag.el.dataset.selected = selected ? '1' : '0';
      tag.el.dataset.relation = relation.toLowerCase();
    }
    tag.el.dataset.bars = paintHoverTagVitals(tag, entity) ? '1' : '0';
    const pt = lastPoint || pointerPoint(null);
    if (pt) {
      placeHoverTag(tag.el, pt.x, pt.y,
        typeof innerWidth === 'number' ? innerWidth : 1200,
        typeof innerHeight === 'number' ? innerHeight : 800);
    }
    tag.el.hidden = false;
  }

  function tick(dt) {
    if (destroyed) return;
    hoverPresentation.update();
    if (!acceptingInput()) {
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
        setHover(null);
      } else {
        repickIdleS += Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
        const moved = lastRepickX == null
          || Math.abs(pt.x - lastRepickX) > 0.5
          || Math.abs(pt.y - lastRepickY) > 0.5;
        // Without a ResizeObserver the cached bounds can lie at any time; only the
        // observed path may sit out a repick.
        if (moved || !viewportObserved || repickIdleS >= 0.125) {
          repickIdleS = 0;
          lastRepickX = pt.x;
          lastRepickY = pt.y;
          const hit = pickAt(pt);
          setHover(hit && hit.entity ? hit.entity : null);
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
