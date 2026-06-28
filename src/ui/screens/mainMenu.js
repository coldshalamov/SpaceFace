// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// New Game / Continue / Load / Settings. Continue is enabled iff a save exists and shows
// the exact latest slot metadata so players trust resume before committing to a load.
// Browser, Electron dev, and packaged desktop all arrive here through the same player route.

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
function screenReady(ctx, id) {
  const mgr = getManager(ctx);
  return !!(!mgr || typeof mgr.hasScreen !== 'function' || mgr.hasScreen(id));
}
function setScreenButtonReady(button, ctx, id, label) {
  if (!button) return;
  const ready = screenReady(ctx, id);
  button.disabled = !ready;
  button.title = ready ? '' : label + ' is initializing';
}
function pushWhenReady(ctx, id, label) {
  if (!screenReady(ctx, id)) {
    if (ctx && ctx.bus && ctx.bus.emit) {
      ctx.bus.emit('toast', { text: label + ' is initializing - try again in a moment', kind: 'info', ttl: 2200 });
    }
    return;
  }
  nav(ctx, 'pushScreen', id);
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
  .sf-menu-save-summary { border:1px solid var(--panel-edge); border-radius:6px; padding:9px 11px;
    background:rgba(8,14,26,.45); color:var(--ink-dim); font-size:12px; line-height:1.45; }
  .sf-menu-save-summary.has-save { color:var(--ink); border-color:rgba(57,208,255,.3);
    box-shadow:inset 2px 0 0 rgba(57,208,255,.45); }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(label) { const b = document.createElement('button'); b.className = 'sf-btn'; b.textContent = label; return b; }

function readSaveIndex(ctx) {
  const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
  if (sys) {
    if (typeof sys.listSlots === 'function') { try { return normalizeSlots(sys.listSlots()); } catch (e) {} }
    if (sys.index && typeof sys.index === 'object') { try { return normalizeSlots(sys.index); } catch (e) {} }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const idxRaw = localStorage.getItem(LS_PREFIX + 'index');
      if (idxRaw) { try { return normalizeSlots(JSON.parse(idxRaw)); } catch (e) {} }
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_PREFIX) || k === LS_PREFIX + 'index') continue;
        const slot = k.slice(LS_PREFIX.length);
        try {
          const env = JSON.parse(localStorage.getItem(k));
          const data = env && env.data;
          const player = data && data.player;
          const ownedShips = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
          const owned = ownedShips[(player && player.activeShipIndex) || 0] || null;
          out[slot] = {
            slot,
            savedAt: (env && env.savedAt) || (data && data.meta && data.meta.lastSavedAt) || '',
            playtimeS: (env && env.playtimeS) || (data && data.meta && data.meta.playtimeS) || 0,
            credits: player && player.credits,
            sectorName: '',
            shipName: owned && owned.defId,
          };
        } catch (e) {}
      }
      return out;
    }
  } catch (e) {}
  return {};
}

function normalizeSlots(idx) {
  if (!idx) return {};
  const out = {};
  if (Array.isArray(idx)) {
    for (const item of idx) if (item && item.slot != null) out[String(item.slot)] = Object.assign({ slot: String(item.slot) }, item);
    return out;
  }
  for (const slot in idx) if (idx[slot]) out[slot] = Object.assign({ slot }, idx[slot]);
  return out;
}

function isOccupied(meta) {
  return !!meta && (meta.savedAt || meta.lastSavedAt || meta.playtimeS != null);
}

function latestSave(slots) {
  let best = null;
  let bestScore = -Infinity;
  for (const slot in (slots || {})) {
    const meta = slots[slot];
    if (!isOccupied(meta)) continue;
    const when = meta.savedAt || meta.lastSavedAt || '';
    const savedAtScore = Date.parse(when) || 0;
    const playtimeS = Number(meta.playtimeS);
    const playtimeScore = Number.isFinite(playtimeS) ? playtimeS : 0;
    const score = savedAtScore || playtimeScore;
    if (score >= bestScore) { bestScore = score; best = { slot, meta }; }
  }
  return best;
}

function slotLabel(id) {
  if (id === 'quick' || id === 'autosave' || id === 'auto') return id.charAt(0).toUpperCase() + id.slice(1);
  return 'Slot ' + id;
}

function fmtPlaytime(playtimeS) {
  const s = Number(playtimeS);
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? (h + 'h ' + (m % 60) + 'm played') : (m + 'm played');
}

function fmtCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US') + ' CR';
}

function titleCaseWords(s) {
  return String(s).split(/[\s_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function shipLabel(id) {
  if (!id) return '';
  return titleCaseWords(String(id).replace(/^ship_/, ''));
}

function saveSummaryText(slot, meta) {
  const parts = [slotLabel(slot)];
  if (meta && meta.sectorName) parts.push(meta.sectorName);
  if (meta && meta.shipName) parts.push(shipLabel(meta.shipName));
  const objective = objectiveSummaryText(meta);
  if (objective) parts.push(objective);
  const playtime = fmtPlaytime(meta && meta.playtimeS);
  if (playtime) parts.push(playtime);
  const credits = fmtCredits(meta && meta.credits);
  if (credits) parts.push(credits);
  const when = meta && (meta.savedAt || meta.lastSavedAt);
  if (when) {
    const d = new Date(when);
    if (Number.isFinite(d.getTime())) parts.push('saved ' + d.toLocaleString());
  }
  return parts.filter(Boolean).join(' - ');
}

function objectiveSummaryText(meta) {
  if (!meta) return '';
  return meta.objectiveSummary || meta.navObjectiveSummary || meta.missionSummary || meta.storySummary || '';
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

    const saveSummary = el('div', 'sf-menu-save-summary', 'Checking saves...');
    rootEl.appendChild(saveSummary);

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

    bNew.addEventListener('click', () => pushWhenReady(ctx, 'newGame', 'New Game'));
    bContinue.addEventListener('click', () => {
      // Continue = load the most recent save. Defer slot choice to the save system; emit a
      // plain game:load with no slot (save resolves "latest"); else open the slot list.
      ctx.bus.emit('game:load', { slot: 'latest' });
    });
    bLoad.addEventListener('click', () => pushWhenReady(ctx, 'saveLoad', 'Load Game'));
    bSettings.addEventListener('click', () => pushWhenReady(ctx, 'settings', 'Settings'));

    refs = { bNew, bContinue, bLoad, bSettings, saveSummary };
    this._render(ctx);
  },

  _render(ctx) {
    if (!refs) return;
    setScreenButtonReady(refs.bNew, ctx, 'newGame', 'New Game');
    setScreenButtonReady(refs.bLoad, ctx, 'saveLoad', 'Load Game');
    setScreenButtonReady(refs.bSettings, ctx, 'settings', 'Settings');
    const latest = latestSave(readSaveIndex(ctx));
    refs.bContinue.disabled = !latest;
    refs.saveSummary.classList.toggle('has-save', !!latest);
    if (latest) {
      const summary = saveSummaryText(latest.slot, latest.meta);
      refs.saveSummary.textContent = 'Continue: ' + summary;
      refs.bContinue.title = 'Load ' + summary;
    } else {
      refs.saveSummary.textContent = 'No save found - New Game starts Contract 47-A from the shared browser/desktop route.';
      refs.bContinue.title = 'No save found yet';
    }
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
