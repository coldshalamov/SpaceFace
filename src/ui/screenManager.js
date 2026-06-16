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

const PAUSING_SCREENS = new Set(['pause', 'mainMenu', 'newGame', 'settings', 'saveLoad', 'help']);

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
      rec.el.style.display = id === top ? 'flex' : 'none';
    }
    const open = stack.length > 0;
    document.body.classList.toggle('ui-modal-open', open || state.ui.docked === true);
    if (backdrop) backdrop.style.pointerEvents = open ? 'auto' : 'none';
    syncPause();
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
      if (state.mode === 'flight' || state.mode === 'paused') state.timeScale = 1;
      bus.emit('sim:resume', {});
    }
  }

  function top() { return stack[stack.length - 1] || null; }
  function activeDef() { const id = top(); const rec = id && registry.get(id); return rec ? rec.def : null; }

  function pushScreen(id) {
    if (!registry.has(id)) { console.warn(`[screenManager] unknown screen "${id}"`); return; }
    // hide currently-visible top
    const prev = activeDef();
    if (prev && prev.onHide) { try { prev.onHide(); } catch (e) { console.error(e); } }
    const rec = build(id);
    stack.push(id);
    syncVisibility();
    if (rec && rec.def.onShow) { try { rec.def.onShow(ctx); } catch (e) { console.error(e); } }
    if (rec && rec.def.refresh) { try { rec.def.refresh(ctx); } catch (e) { console.error(e); } }
  }

  function popScreen() {
    if (!stack.length) return;
    const closing = activeDef();
    if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
    stack.pop();
    syncVisibility();
    const next = activeDef();
    if (next && next.onShow) { try { next.onShow(ctx); } catch (e) { console.error(e); } }
    if (next && next.refresh) { try { next.refresh(ctx); } catch (e) { console.error(e); } }
  }

  function replaceScreen(id) {
    if (stack.length) {
      const closing = activeDef();
      if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
      stack.pop();
    }
    pushScreen(id);
  }

  function closeAll() {
    while (stack.length) {
      const closing = activeDef();
      if (closing && closing.onHide) { try { closing.onHide(); } catch (e) { console.error(e); } }
      stack.pop();
    }
    syncVisibility();
  }

  function isOpen() { return stack.length > 0; }
  function getActiveScreenDef() { return activeDef(); }
  function refreshTop() { const d = activeDef(); if (d && d.refresh) { try { d.refresh(ctx); } catch (e) { console.error(e); } } }
  function locked() { const d = activeDef(); return !!(d && d.data && d.data.locked); }

  // Backdrop click pops the top (unless the screen is mid-transaction locked).
  if (backdrop) {
    backdrop.addEventListener('click', () => { if (isOpen() && !locked()) popScreen(); });
  }

  return {
    register, pushScreen, popScreen, replaceScreen, closeAll,
    isOpen, top, getActiveScreenDef, refreshTop, syncVisibility, locked,
  };
}
