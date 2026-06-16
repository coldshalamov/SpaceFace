// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// New Game / Continue / Load / Settings. Continue enabled iff a save exists.
// The game currently boots straight into flight; this screen is reachable from Pause
// ("Main Menu") and on a future state.mode==='menu' boot.

const STYLE_ID = 'sf-menu-style';
const LS_PREFIX = 'sf.save.';

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-menu { display:flex; flex-direction:column; gap:14px; padding:26px 30px; min-width:360px;
    max-width:min(92vw,920px); max-height:88vh; overflow:auto; pointer-events:auto; }
  .sf-menu-narrow { min-width:300px; width:340px; }
  .sf-menu-wide { width:min(92vw,820px); }
  .sf-menu h1 { margin:0 0 4px; font-family:var(--mono); letter-spacing:.32em; font-size:20px;
    color:var(--accent); text-shadow:0 0 18px rgba(57,208,255,.45); text-transform:uppercase; text-align:center; }
  .sf-menu h2 { margin:14px 0 4px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu .sf-col { display:flex; flex-direction:column; gap:8px; }
  .sf-menu button.sf-btn { width:100%; text-align:center; padding:11px 14px; font-size:14px; letter-spacing:.06em; }
  .sf-menu .sf-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .sf-menu .sf-row > label { color:var(--ink-dim); font-size:13px; flex:0 0 38%; }
  .sf-menu .sf-row > .sf-ctl { flex:1; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); }
  .sf-menu select, .sf-menu input[type=text], .sf-menu input[type=number] {
    font-family:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--panel-edge);
    border-radius:5px; padding:6px 8px; pointer-events:auto; }
  .sf-menu .sf-val { font-family:var(--mono); color:var(--accent); min-width:46px; text-align:right; }
  .sf-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--panel-edge); padding-bottom:8px; flex-wrap:wrap; }
  .sf-tabbar button.sf-tab.active { border-color:var(--accent); color:#fff; box-shadow:0 0 10px rgba(57,208,255,.35); }
  .sf-menu .sf-grid2 { display:grid; grid-template-columns:auto 1fr; gap:6px 18px; align-items:center; font-size:13px; }
  .sf-menu .sf-grid2 .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; }
  .sf-menu .sf-grid2 .v { color:var(--ink); }
  .sf-menu .sf-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
  .sf-menu .sf-muted { color:var(--ink-mute); font-size:12px; }
  .sf-slot { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--panel-edge);
    border-radius:6px; background:var(--panel); }
  .sf-slot.sel { border-color:var(--accent); box-shadow:0 0 10px rgba(57,208,255,.3); }
  .sf-slot .sf-slot-main { flex:1; min-width:0; }
  .sf-slot .sf-slot-name { font-size:14px; color:var(--ink); }
  .sf-slot .sf-slot-sub { font-size:11px; color:var(--ink-mute); font-family:var(--mono); }
  .sf-slot.empty .sf-slot-name { color:var(--ink-mute); font-style:italic; }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(label) { const b = document.createElement('button'); b.className = 'sf-btn'; b.textContent = label; return b; }

function hasSave(ctx) {
  const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
  if (sys) {
    if (typeof sys.hasAnySave === 'function') { try { return !!sys.hasAnySave(); } catch (e) {} }
    if (typeof sys.listSlots === 'function') { try { return Object.keys(sys.listSlots() || {}).length > 0; } catch (e) {} }
    if (sys.index && typeof sys.index === 'object') return Object.keys(sys.index).length > 0;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX) && k !== LS_PREFIX + 'index') return true;
      }
    }
  } catch (e) {}
  return false;
}

let refs = null;

export const mainMenuScreen = {
  id: 'mainMenu',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-menu-narrow');

    rootEl.appendChild(el('h1', 'sf-title-logo', 'SPACEFACE'));
    rootEl.appendChild(el('div', 'sf-title-tag', 'A trade & combat sandbox'));

    const col = el('div', 'sf-col');
    rootEl.appendChild(col);

    const bNew = button('New Game');
    const bContinue = button('Continue');
    const bLoad = button('Load Game');
    const bSettings = button('Settings');
    col.appendChild(bNew); col.appendChild(bContinue); col.appendChild(bLoad); col.appendChild(bSettings);

    // "Watch Intro Cinematic" — directly plays one of our generated 6s C-INTRO videos (pro touch, uses the cinematic assets we created for the plan).
    const bCine = button('Watch Intro Cinematic');
    col.appendChild(bCine);
    bCine.addEventListener('click', () => {
      const ui = ctx.registry && ctx.registry.get && ctx.registry.get('ui');
      if (ui && ui.playCinematic) ui.playCinematic('assets/cinematics/C-INTRO-02_6s.mp4', 'Fighter Close-up — 60° Chase');
      else if (window.playSpaceFaceCinematic) window.playSpaceFaceCinematic('assets/cinematics/C-INTRO-02_6s.mp4', 'Fighter Close-up — 60° Chase');
    });

    bNew.addEventListener('click', () => nav(ctx, 'pushScreen', 'newGame'));
    bContinue.addEventListener('click', () => {
      // Continue = load the most recent save. Defer slot choice to the save system; emit a
      // plain game:load with no slot (save resolves "latest"); else open the slot list.
      ctx.bus.emit('game:load', { slot: 'latest' });
    });
    bLoad.addEventListener('click', () => nav(ctx, 'pushScreen', 'saveLoad'));
    bSettings.addEventListener('click', () => nav(ctx, 'pushScreen', 'settings'));

    refs = { bContinue };
    this._render(ctx);
  },

  _render(ctx) {
    if (!refs) return;
    refs.bContinue.disabled = !hasSave(ctx);
  },

  onShow(ctx) {
    // Ensure sim is frozen while at the title.
    ctx.state.timeScale = 0;
    this._render(ctx);
    if (refs && refs.bContinue && !refs.bContinue.disabled) try { refs.bContinue.focus(); } catch (e) {}
  },
  onHide() {},
  refresh(ctx) { this._render(ctx); },
};
