// ScreenManager (ARCHITECTURE §5.1) — owns the modal screen stack.
//
//   state.ui.screenStack: string[]   (top = active modal; empty = pure flight HUD)
//
// Every modal screen is built ONCE and cached in #screens; only the top of the stack is
// display:flex, all others display:none (DOM retained so scroll/tab state persists).
// Pushing any screen adds `.ui-modal-open` to <body> (CSS hides #hud + shows the backdrop).
// Popping back to an empty stack removes it → the flight HUD returns.
//
// Screens that "pause the sim" (pause / menus) emit sim:pause while at least one such screen
// is open and sim:resume once none remain. Screen modules implement {id,mount,onShow,onHide,refresh}.

const PAUSING_SCREENS = new Set(['pause', 'mainMenu', 'newGame', 'gameOver', 'settings', 'saveLoad', 'help', 'codex', 'drill', 'base']);

export function createScreenManager(ctx) {
  const { state, bus } = ctx;
  const screensRoot = document.getElementById('screens');
  const backdrop = document.getElementById('modal-backdrop');

  // id -> { def, el, mounted }
  const registry = new Map();
  // ensure the stack lives on ui state (transient; reset on load)
  if (!Array.isArray(state.ui.screenStack)) state.ui.screenStack = [];
  const stack = state.ui.screenStack;

  let pauseEmitted = false;

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
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const t = el.getAttribute('tabindex');
      if (t != null && Number(t) < 0) return false;
      // skip elements in a hidden subtree
      let p = el; while (p && p !== root) { if (p.style && p.style.display === 'none') return false; p = p.parentNode; }
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
    if (items.length) { try { items[0].focus(); } catch (e) {} }
  }
  function _restoreFocus(el, visibleRoot) {
    if (!el || !el.isConnected || typeof el.focus !== 'function') return false;
    if (visibleRoot && !visibleRoot.contains(el)) return false;
    try { el.focus(); return document.activeElement === el; } catch (e) { return false; }
  }
  function _ensureFocusIn(rec) {
    if (!rec || !rec.el) return;
    const active = document.activeElement;
    if (!active || !rec.el.contains(active)) _focusFirst();
  }
  // one document-level trap listener (active whenever a modal is open)
  document.addEventListener('keydown', _trapKeydown);

  function register(def) {
    if (!def || !def.id) throw new Error('screen def needs an id');
    registry.set(def.id, { def, el: null, mounted: false });
  }

  function build(id) {
    const rec = registry.get(id);
    if (!rec) return null;
    if (!rec.mounted) {
      const el = document.createElement('div');
      el.className = 'screen';
      el.dataset.screen = id;
      el.style.display = 'none';
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
        rec.el.style.display = 'flex';
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
      }
    }
    const open = stack.length > 0;
    // When no modal is open, hide the #screens container ENTIRELY — it carries a full-screen
    // background image (the menu art) at z-index 100, which would otherwise sit on top of the
    // flight canvas (z-index 10) and blank the screen after New Game even though the sim is live.
    if (screensRoot) screensRoot.style.display = open ? 'flex' : 'none';
    const modalOpen = open || state.ui.docked === true;
    document.body.classList.toggle('ui-modal-open', modalOpen);
    syncHudAccessibility(modalOpen || state.mode !== 'flight');
    if (backdrop) {
      backdrop.hidden = !open;
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

  function clearModalFocus() {
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (screensRoot && screensRoot.contains(active) && typeof active.blur === 'function') active.blur();
  }

  // Pause the sim while any pausing screen sits anywhere in the stack. The pause/menu screens
  // also set state.timeScale in their own onShow/onHide (documented §5.4 exception); driving it
  // here from the stack as well guarantees ANY pausing screen freezes the sim regardless of the
  // entry path. Both write the same derived value (0 then 1), so the duplicate is harmless. We
  // never freeze while mode==='menu' boot (timeScale already 0/handled by the menu screen).
  function syncPause() {
    const wantPause = stack.some((id) => PAUSING_SCREENS.has(id));
    if (wantPause && !pauseEmitted) {
      pauseEmitted = true;
      if (state.mode === 'flight') state.timeScale = 0;
      bus.emit('sim:pause', {});
    } else if (!wantPause && pauseEmitted) {
      pauseEmitted = false;
      // only resume if the sim is in flight (not at the main menu)
      if (state.mode === 'flight' || state.mode === 'paused') {
        state.timeScale = 1;
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
    const prev = activeDef();
    if (prev && prev.onHide) { try { prev.onHide(); } catch (e) { console.error(e); } }
    const rec = build(id);
    stack.push(id);
    syncVisibility();
    if (rec && rec.def.onShow) { try { rec.def.onShow(ctx); } catch (e) { console.error(e); } }
    if (rec && rec.def.refresh) { try { rec.def.refresh(ctx); } catch (e) { console.error(e); } }
    _ensureFocusIn(rec);
  }

  function popScreen() {
    if (!stack.length) return;
    const closingId = stack[stack.length - 1];
    const closingRec = closingId && registry.get(closingId);
    const closing = activeDef();
    if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }

    // Fade out the closing screen before removing it
    if (closingRec && closingRec.el) {
      const el = closingRec.el;
      el.classList.remove('sf-screen--visible', 'sf-screen--entering');
      el.classList.add('sf-screen--exiting');
      setTimeout(() => {
        el.classList.remove('sf-screen--exiting');
        el.style.display = 'none';
      }, 200); // matches the 0.2s exiting transition
    }

    stack.pop();
    const restoreTarget = focusStack.pop();
    syncVisibility();
    if (!stack.length) {
      const canRestoreOutsideScreens = restoreTarget && (!screensRoot || !screensRoot.contains(restoreTarget));
      if (!canRestoreOutsideScreens || !_restoreFocus(restoreTarget, null)) clearModalFocus();
    }
    const next = activeDef();
    if (next && next.onShow) { try { next.onShow(ctx); } catch (e) { console.error(e); } }
    if (next && next.refresh) { try { next.refresh(ctx); } catch (e) { console.error(e); } }
    if (stack.length) {
      const nextId = stack[stack.length - 1];
      const nextRec = nextId && registry.get(nextId);
      if (!_restoreFocus(restoreTarget, nextRec && nextRec.el)) _ensureFocusIn(nextRec);
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

  function shieldModalPointerEvent(ev) {
    if (!isOpen()) return;
    if (ev.type === 'contextmenu') ev.preventDefault();
    ev.stopPropagation();
  }

  // Backdrop click pops the top (unless the screen is mid-transaction locked).
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
    backdrop.addEventListener('click', () => { if (isOpen() && !locked()) popScreen(); });
  }

  return {
    register, pushScreen, popScreen, replaceScreen, closeAll,
    isOpen, hasScreen, top, getActiveScreenDef, refreshTop, syncVisibility, locked,
  };
}
