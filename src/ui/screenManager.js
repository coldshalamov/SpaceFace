// ScreenManager (ARCHITECTURE §5.1) — owns the modal screen stack.
//
//   state.ui.screenStack: string[]   (top = active modal; empty = pure flight HUD)
//
// Every modal screen is built ONCE and cached in #screens; only the top of the stack is
// display:flex, all others display:none (DOM retained so scroll/tab state persists).
// Pushing a PAUSING screen adds `.ui-modal-open` to <body> (CSS hides #hud + shows the backdrop);
// pushing a non-pausing "live" screen (maps, tech tree, mission log, automation) adds
// `.ui-live-screen` instead — the sim keeps running, so the HUD, reticle and alerts stay
// readable at reduced opacity under a light dim (FRONTEND_DIRECTION §3.5).
// Popping back to an empty stack removes both → the flight HUD returns.
//
// Screens that "pause the sim" (pause / menus) request a freeze while at least one such screen is
// open and emit sim:pause/sim:resume exactly once at the aggregate boundary. Screen modules do not
// own timeScale.

import { createTimeEffects } from '../core/timeEffects.js';
import { createScreenMemory } from './screenMemory.js';

const PAUSING_SCREENS = new Set(['pause', 'mainMenu', 'newGame', 'gameOver', 'settings', 'saveLoad', 'help', 'codex', 'drill', 'base', 'station', 'sandbox',
  // Owner ruling 2026-08-15 (build map §11.3): menus pause the world, Skyrim-style. The four
  // instruments are full-depth strategic screens; 'ship' and 'range' land now, the rest join as
  // they are built. Quick mid-combat verbs stay on the non-pausing tier instead.
  'ship', 'range', 'footprint',
  // Chart maps now pause with the rest of strategic instruments (J12, fact 2).
  'galaxyMap', 'localmap']);
const PAUSE_REQUEST = Object.freeze({ scale: 0 });

export function createScreenManager(ctx) {
  const { state, bus } = ctx;
  const timeEffects = ctx.timeEffects || createTimeEffects(state);
  const screensRoot = document.getElementById('screens');
  const backdrop = document.getElementById('modal-backdrop');

  // id -> { def, el, mounted, exitTimer }
  const registry = new Map();
  // ensure the stack lives on ui state (transient; reset on load)
  if (!Array.isArray(state.ui.screenStack)) state.ui.screenStack = [];
  const stack = state.ui.screenStack;

  let pauseEmitted = false;
  let destroyed = false;

  // J4 screen state memory (build map §11.12). A per-screen bag persisted per save, so the map, the
  // ship and the station open where the player left them. Published on ctx so screens read/write it
  // in their own onShow/onHide — the manager cannot know what a screen considers state.
  //
  // The manager DOES own scroll position generically: it is the one piece of per-screen state that
  // is uniform across every screen, invisible until missing, and costs each screen zero code. Tabs,
  // filters and layer sets are screen-specific and stay opt-in.
  const screenMemory = ctx.screenMemory || createScreenMemory(state);
  ctx.screenMemory = screenMemory;

  const SCROLL_KEY = '__scroll';
  function scrollables(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('[data-sf-scroll]'));
  }
  /** Capture scroll offsets for any element the screen opted in with `data-sf-scroll="<name>"`. */
  function captureScroll(id, rec) {
    if (!rec || !rec.el) return;
    const map = {};
    for (const el of scrollables(rec.el)) {
      const name = el.getAttribute('data-sf-scroll');
      if (name && el.scrollTop > 0) map[name] = Math.round(el.scrollTop);
    }
    if (Object.keys(map).length) screenMemory.set(id, { [SCROLL_KEY]: map });
  }
  /** Restore them after onShow, so the screen has rendered the content being scrolled. */
  function restoreScroll(id, rec) {
    if (!rec || !rec.el) return;
    const map = screenMemory.read(id, SCROLL_KEY, null);
    if (!map) return;
    for (const el of scrollables(rec.el)) {
      const name = el.getAttribute('data-sf-scroll');
      if (name && map[name] != null) el.scrollTop = Number(map[name]) || 0;
    }
  }

  // UX-6: focus management. On each push we snapshot the currently-focused element so popScreen can
  // restore it — keyboard + screen-reader users return to the button that opened the modal instead
  // of being dropped at the document root. Paired with a focus trap (Tab/Shift-Tab cycle inside the
  // active screen) so focus can't escape into the inert HUD.
  const focusStack = [];   // [HTMLElement|null] — the element focused before each push
  function _focusableInside(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => {
      if (el.disabled) return false;
      if (el.inert) return false;
      if (el.hidden) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.style && el.style.display === 'none') return false;
      if (el.style && el.style.visibility === 'hidden') return false;
      const t = el.getAttribute('tabindex');
      if (t != null && Number(t) < 0) return false;
      // skip elements in a hidden subtree
      let p = el.parentNode;
      while (p && p !== root) {
        if (p.inert) return false;
        if (p.hidden) return false;
        if (p.style && p.style.display === 'none') return false;
        if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
        p = p.parentNode;
      }
      return true;
    });
  }
  function _trapKeydown(ev) {
    if (ev.key !== 'Tab') return;
    const topId = stack[stack.length - 1];
    if (!topId) return;
    const rec = registry.get(topId);
    if (!rec || !rec.el || rec.el.style.display === 'none') return;
    const items = _focusableInside(rec.el);
    if (!items.length) { ev.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !rec.el.contains(active)) { ev.preventDefault(); last.focus(); }
    } else {
      if (active === last || !rec.el.contains(active)) { ev.preventDefault(); first.focus(); }
    }
  }
  function _focusFirst() {
    const topId = stack[stack.length - 1];
    const rec = topId && registry.get(topId);
    if (!rec || !rec.el) return;
    const items = _focusableInside(rec.el);
    const target = items[0] || rec.el;
    try { target.focus({ preventScroll: true }); } catch (e) {
      try { target.focus(); } catch (_) { /* no focus target available */ }
    }
  }
  // Opener is restorable only when still connected, visible, and not inert/disabled.
  // Hidden or detached openers fall through to the deterministic top-screen fallback.
  function _isRestorableOpener(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (!el.isConnected || typeof el.focus !== 'function') return false;
    if (el.disabled) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
    let p = el.parentNode;
    while (p && p !== document && p !== document.documentElement) {
      if (p.hidden) return false;
      if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
      if (p.style && (p.style.display === 'none' || p.style.visibility === 'hidden')) return false;
      p = p.parentNode;
    }
    return true;
  }
  function _restoreFocus(el, visibleRoot) {
    if (!_isRestorableOpener(el)) return false;
    if (visibleRoot && !visibleRoot.contains(el)) return false;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try { el.focus(); } catch (_) { return false; }
    }
    return document.activeElement === el;
  }
  function _ensureFocusIn(rec) {
    if (!rec || !rec.el) return;
    const active = document.activeElement;
    // `autoFocus:false` lets a screen (the galaxy map, for example) choose its own initial
    // control during onShow. It must never permit focus to remain in the covered dialog that is
    // now aria-hidden/inert. Preserve an explicit in-screen choice; otherwise use the common
    // first-operable/root fallback.
    if (!active || !rec.el.contains(active) || !_isRestorableOpener(active)) _focusFirst();
  }
  // one document-level trap listener (active whenever a modal is open)
  document.addEventListener('keydown', _trapKeydown);

  function register(def) {
    if (!def || !def.id) throw new Error('screen def needs an id');
    registry.set(def.id, { def, el: null, mounted: false, exitTimer: null });
  }

  function cancelPendingExit(rec) {
    if (!rec || rec.exitTimer == null) return;
    clearTimeout(rec.exitTimer);
    rec.exitTimer = null;
  }

  function build(id) {
    const rec = registry.get(id);
    if (!rec) return null;
    if (!rec.mounted) {
      const el = document.createElement('div');
      el.className = 'screen';
      el.dataset.screen = id;
      el.style.display = 'none';
      // Cached screens stay mounted for scroll/tab continuity. Keep every inactive screen out of
      // both keyboard navigation and the accessibility tree until it becomes the stack owner.
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', _screenAccessibleName(rec.def, id));
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('tabindex', '-1');
      el.inert = true;
      screensRoot.appendChild(el);
      rec.el = el;
      try { if (rec.def.mount) rec.def.mount(el, ctx); }
      catch (err) { console.error(`[screenManager] mount("${id}") failed:`, err); }
      rec.mounted = true;
    }
    return rec;
  }

  function syncVisibility() {
    const top = stack[stack.length - 1] || null;
    for (const [id, rec] of registry) {
      if (!rec.el) continue;
      if (id === top) {
        // A cached screen may be reopened before its previous 200ms exit transition settles.
        // Cancel that stale callback so it cannot hide the newly active screen.
        cancelPendingExit(rec);
        rec.el.style.display = 'flex';
        rec.el.removeAttribute('aria-hidden');
        rec.el.setAttribute('aria-modal', 'true');
        rec.el.inert = false;
        // Trigger enter animation: start invisible, then fade in next frame
        rec.el.classList.remove('sf-screen--exiting');
        rec.el.classList.add('sf-screen--entering');
        requestAnimationFrame(() => {
          rec.el.classList.remove('sf-screen--entering');
          rec.el.classList.add('sf-screen--visible');
        });
      } else {
        rec.el.classList.remove('sf-screen--visible', 'sf-screen--entering');
        rec.el.style.display = 'none';
        rec.el.setAttribute('aria-hidden', 'true');
        rec.el.removeAttribute('aria-modal');
        rec.el.inert = true;
      }
    }
    const open = stack.length > 0;
    // When no modal is open, hide the #screens container ENTIRELY — it carries a full-screen
    // background image (the menu art) at z-index 100, which would otherwise sit on top of the
    // flight canvas (z-index 10) and blank the screen after New Game even though the sim is live.
    if (screensRoot) {
      screensRoot.style.display = open ? 'flex' : 'none';
      screensRoot.inert = !open;
      if (open) screensRoot.removeAttribute('aria-hidden');
      else screensRoot.setAttribute('aria-hidden', 'true');
    }
    // Live overlays: non-pausing screens (maps, tech tree, mission log, automation) sit over a
    // RUNNING sim. They must not blind the player — the old blanket `.ui-modal-open` zeroed the
    // HUD, reticle and alerts while enemies kept shooting (FRONTEND_DIRECTION §3.5). Only a
    // pausing screen, docking, or a fulfillment blackout keeps the full modal treatment.
    const externalModal = state.ui.docked === true || state.ui.fulfillmentBlackoutActive === true;
    const liveOverlay = open && !externalModal && stack.every((id) => !PAUSING_SCREENS.has(id));
    const modalOpen = open && !liveOverlay || externalModal;
    document.body.classList.toggle('ui-modal-open', modalOpen);
    document.body.classList.toggle('ui-live-screen', liveOverlay);
    syncHudAccessibility(open || externalModal || state.mode !== 'flight');
    if (backdrop) {
      backdrop.hidden = !open;
      // The dimmer is visual chrome; the active screen owns the dialog semantics.
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.style.pointerEvents = open ? 'auto' : 'none';
    }
    syncPause();
  }

  function syncHudAccessibility(hidden) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    if (hidden) hud.setAttribute('aria-hidden', 'true');
    else hud.removeAttribute('aria-hidden');
    if ('inert' in hud) hud.inert = hidden;
  }

  function _screenAccessibleName(def, id) {
    const declared = def && def.data && (def.data.ariaLabel || def.data.title);
    if (declared) return String(declared);
    return String(id || 'screen')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function clearModalFocus() {
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (screensRoot && screensRoot.contains(active) && typeof active.blur === 'function') active.blur();
  }

  // Reconcile the request unconditionally. A new game/load resets transient effects, so a visible
  // pausing stack must repair its request even while pauseEmitted still reflects the same boundary.
  // pauseEmitted gates only the aggregate event pair.
  function syncPause() {
    const wantPause = state.ui.docked === true || stack.some((id) => PAUSING_SCREENS.has(id));
    if (wantPause) timeEffects.set('ui:pausing-screen', PAUSE_REQUEST);
    else timeEffects.clear('ui:pausing-screen');
    if (wantPause && !pauseEmitted) {
      pauseEmitted = true;
      bus.emit('sim:pause', {});
    } else if (!wantPause && pauseEmitted) {
      pauseEmitted = false;
      // only resume if the sim is in flight (not at the main menu)
      if (state.mode === 'flight' || state.mode === 'paused') {
        if (state.mode === 'paused') state.mode = 'flight';
      }
      bus.emit('sim:resume', {});
    }
  }

  function top() { return stack[stack.length - 1] || null; }
  function activeDef() { const id = top(); const rec = id && registry.get(id); return rec ? rec.def : null; }

  function pushScreen(id) {
    if (!registry.has(id)) { console.warn(`[screenManager] unknown screen "${id}"`); return; }
    const active = document.activeElement;
    focusStack.push(active && active !== document.body ? active : null);
    // hide currently-visible top
    const prevId = top();
    const prev = activeDef();
    if (prev && prev.onHide) { try { prev.onHide(); } catch (e) { console.error(e); } }
    if (prevId) captureScroll(prevId, registry.get(prevId));
    const rec = build(id);
    stack.push(id);
    syncVisibility();
    if (rec && rec.def.onShow) { try { rec.def.onShow(ctx); } catch (e) { console.error(e); } }
    if (rec && rec.def.refresh) { try { rec.def.refresh(ctx); } catch (e) { console.error(e); } }
    // After onShow AND refresh: the content being scrolled has to exist before an offset means
    // anything. Restoring earlier silently clamps to 0 on an empty container.
    restoreScroll(id, rec);
    _ensureFocusIn(rec);
  }

  function popScreen() {
    if (!stack.length) return;
    const closingId = stack[stack.length - 1];
    const closingRec = closingId && registry.get(closingId);
    const closing = activeDef();
    if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
    // Capture AFTER onHide so a screen's own onHide write lands first and this cannot clobber it.
    if (closingId) captureScroll(closingId, closingRec);

    // Fade out the closing screen before removing it
    if (closingRec && closingRec.el) {
      const el = closingRec.el;
      cancelPendingExit(closingRec);
      el.classList.remove('sf-screen--visible', 'sf-screen--entering');
      el.classList.add('sf-screen--exiting');
      closingRec.exitTimer = setTimeout(() => {
        closingRec.exitTimer = null;
        el.classList.remove('sf-screen--exiting');
        el.style.display = 'none';
      }, 200); // matches the 0.2s exiting transition
    }

    stack.pop();
    const restoreTarget = focusStack.pop();
    syncVisibility();
    const next = activeDef();
    if (next && next.onShow) { try { next.onShow(ctx); } catch (e) { console.error(e); } }
    if (next && next.refresh) { try { next.refresh(ctx); } catch (e) { console.error(e); } }
    // Focus after visibility + onShow so the newly exposed top screen is the fallback root.
    if (stack.length) {
      const nextId = stack[stack.length - 1];
      const nextRec = nextId && registry.get(nextId);
      restoreScroll(nextId, nextRec);
      // Prefer the captured opener when still connected, visible, and inside the top screen.
      // Invalid openers → deterministic first focusable in the exposed screen (locked root menu too).
      if (!_restoreFocus(restoreTarget, nextRec && nextRec.el)) _ensureFocusIn(nextRec);
    } else {
      // Empty stack: restore outside-screens opener (HUD / previous control) when still valid.
      const canRestoreOutsideScreens = restoreTarget && (!screensRoot || !screensRoot.contains(restoreTarget));
      if (!canRestoreOutsideScreens || !_restoreFocus(restoreTarget, null)) clearModalFocus();
    }
  }

  function replaceScreen(id) {
    if (stack.length) {
      const closing = activeDef();
      if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
      stack.pop();
      focusStack.pop();
      clearModalFocus();
    }
    pushScreen(id);
  }

  function closeAll() {
    while (stack.length) {
      const closing = activeDef();
      if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
      stack.pop();
    }
    focusStack.length = 0;
    syncVisibility();
    clearModalFocus();
  }

  function isOpen() { return stack.length > 0; }
  function hasScreen(id) { return registry.has(id); }
  function getActiveScreenDef() { return activeDef(); }
  function refreshTop() { const d = activeDef(); if (d && d.refresh) { try { d.refresh(ctx); } catch (e) { console.error(e); } } }
  function locked() {
    const d = activeDef();
    if (d && d.data && d.data.locked) return true;
    return state.mode === 'menu' && stack.length === 1 && top() === 'mainMenu';
  }

  function dismissTopFromBackdrop() {
    if (!isOpen() || locked()) return;
    const d = activeDef();
    if (d && d.id === 'station') {
      // Implicit station Back: route through the station-exit owner (clean → confirm →
      // committed undock). Nested screens above still pop via the branch below.
      bus.emit('station:exitRequest', {
        intent: 'implicit',
        source: 'backdrop',
        opener: typeof document !== 'undefined' ? document.activeElement : null,
      });
      return;
    }
    popScreen();
  }

  function shieldModalPointerEvent(ev) {
    if (!isOpen()) return;
    if (ev.type === 'contextmenu') ev.preventDefault();
    ev.stopPropagation();
  }

  // Backdrop click dismisses the top screen (unless mid-transaction locked). Station is special:
  // dismissing it is an implicit Back (station:exitRequest) so transient clean + confirm run before
  // any committed dock:undocked — same owner as Esc/B/E, distinct from the explicit Undock control.
  const shieldedPointerEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'];
  if (screensRoot) {
    shieldedPointerEvents.forEach((type) => {
      screensRoot.addEventListener(type, shieldModalPointerEvent);
    });
  }
  if (backdrop) {
    shieldedPointerEvents.forEach((type) => {
      backdrop.addEventListener(type, shieldModalPointerEvent);
    });
    backdrop.addEventListener('click', dismissTopFromBackdrop);
  }

  // Runtime reset/load paths can clear transient requests without changing the visible stack.
  // Reconcile on their mode/error signals so UI state and the request cannot drift apart.
  const runtimeUnsubscribers = [
    bus.on('mode:changed', syncPause),
    bus.on('save:error', syncPause),

    // J4, two hooks that are not optional:
    //
    // FLUSH BEFORE A SAVE. The chart is a non-pausing live overlay, so the interval autosave keeps
    // firing while it is open. Without this, every autosave taken with a screen up records the
    // PREVIOUS session's bag — "it remembers, but one session late", which is maddening to debug.
    bus.on('save:started', () => {
      const id = top();
      const rec = id && registry.get(id);
      if (!rec || !rec.def) return;
      if (typeof rec.def._rememberScreenState === 'function') {
        try { rec.def._rememberScreenState(); } catch (_) {}
      }
      captureScroll(id, rec);
    }),

    // NOTE — there is deliberately NO `save:loaded` handler clearing the bag here. saveSystem emits
    // save:loaded AFTER it calls _restoreScreenMemory, so clearing on that event would wipe the bag
    // it had just restored. (Written that way first; caught by reading the emit order, not by a
    // test, because an empty bag silently degrades to authored defaults and looks like "the screen
    // just didn't remember.")
    //
    // Cross-save bleed is handled where it actually lives instead: screenMemory.deserialize()
    // REPLACES the bag wholesale, and each screen's restore starts from its authored defaults
    // rather than merging over whatever the singleton happens to be holding from the last save.
  ];

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', _trapKeydown);
    if (screensRoot) {
      shieldedPointerEvents.forEach((type) => {
        screensRoot.removeEventListener(type, shieldModalPointerEvent);
      });
    }
    if (backdrop) {
      shieldedPointerEvents.forEach((type) => {
        backdrop.removeEventListener(type, shieldModalPointerEvent);
      });
      backdrop.removeEventListener('click', dismissTopFromBackdrop);
    }
    for (const unsubscribe of runtimeUnsubscribers.splice(0)) {
      try { unsubscribe(); } catch (_) {}
    }
    timeEffects.clear('ui:pausing-screen');
    for (const rec of registry.values()) {
      cancelPendingExit(rec);
      if (rec && rec.mounted && rec.def && rec.def.onHide) {
        try { rec.def.onHide(); } catch (_) {}
      }
      if (rec && rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    }
    registry.clear();
    focusStack.length = 0;
    stack.length = 0;
    if (screensRoot) {
      screensRoot.style.display = 'none';
      screensRoot.inert = true;
      screensRoot.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.style.pointerEvents = 'none';
    }
    const externalModal = state.ui.docked === true
      || state.ui.fulfillmentBlackoutActive === true;
    document.body.classList.toggle('ui-modal-open', externalModal);
    document.body.classList.remove('ui-live-screen');
    syncHudAccessibility(externalModal || state.mode !== 'flight');
  }

  function isLiveOverlay() {
    if (!stack.length) return false;
    if (state.ui.docked === true || state.ui.fulfillmentBlackoutActive === true) return false;
    return stack.every((id) => !PAUSING_SCREENS.has(id));
  }

  return {
    register, pushScreen, popScreen, replaceScreen, closeAll,
    isOpen, hasScreen, top, getActiveScreenDef, refreshTop, syncVisibility, syncHudAccessibility,
    isLiveOverlay, locked, destroy,
    screenMemory,
  };
}
