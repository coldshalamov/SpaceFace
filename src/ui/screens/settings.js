// Settings screen (ARCHITECTURE §3.3, §5; design/specs/09).
// Tabs: Audio / Video / Gameplay / Controls. Every change writes state.settings and
// emits settings:changed {section,key,value} (audio/render/save listen + live-apply).
// UI reads state.settings for display; the write to state.settings is the UI/settings
// module's own owned subtree (§3.3 owner: ui/settings), so writing it here is in-scope.

const STYLE_ID = 'sf-menu-style';

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
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); height:26px; cursor:pointer;
    touch-action:none; -webkit-appearance:none; appearance:none; background:transparent; }
  .sf-menu input[type=range]::-webkit-slider-runnable-track { height:6px; border-radius:3px;
    background:linear-gradient(90deg,var(--accent),var(--panel-edge-2)); }
  .sf-menu input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none;
    width:20px; height:20px; margin-top:-7px; border-radius:50%; background:var(--accent);
    border:2px solid #06121e; box-shadow:0 0 8px rgba(57,208,255,.6); cursor:grab; }
  .sf-menu input[type=range]:active::-webkit-slider-thumb { cursor:grabbing; transform:scale(1.12); }
  .sf-menu input[type=range]::-moz-range-track { height:6px; border-radius:3px; background:var(--panel-edge-2); }
  .sf-menu input[type=range]::-moz-range-thumb { width:20px; height:20px; border-radius:50%;
    background:var(--accent); border:2px solid #06121e; box-shadow:0 0 8px rgba(57,208,255,.6); }
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
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1'); h.textContent = title; rootEl.appendChild(h);
  return rootEl;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

const TABS = ['Audio', 'Video', 'Gameplay', 'Controls'];
// Default keybind cheat-sheet (also used by Help). Flight keys are owned by input/flight,
// listed here for the player's reference (§5.6).
const KEYBINDS = [
  ['Throttle', '↑↓ / W S'],
  ['Steer (yaw + bank)', '←→ / A D'],
  ['Aim weapons', 'Mouse'],
  ['Boost', 'Shift'],
  ['Fire (group 1)', 'LMB / Space'],
  ['Fire (group 2)', 'RMB'],
  ['Mine beam', 'RMB (on rock)'],
  ['Auto-fire toggle', 'F'],
  ['Weapon group', 'Q / E'],
  ['Target nearest', 'T'],
  ['Cycle target', 'Tab'],
  ['Dock', 'Enter (when prompted)'],
  ['Pause', 'ESC / P'],
  ['Star-map', 'M'],
  ['Tech tree', 'T'],
  ['Missions', 'J'],
  ['Help', 'F1 / H'],
  ['Quick save', 'F5'],
  ['Quick load', 'F9'],
];

let refs = null;

export const settingsScreen = {
  id: 'settings',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Settings', 'sf-menu-wide');

    const bar = el('div', 'sf-tabbar');
    const pane = el('div', 'sf-col');
    rootEl.appendChild(bar);
    rootEl.appendChild(pane);

    const foot = el('div', 'sf-foot');
    const back = el('button', 'sf-btn'); back.textContent = 'Back'; back.style.width = 'auto';
    back.addEventListener('click', () => nav(ctx, 'popScreen'));
    foot.appendChild(back);
    rootEl.appendChild(foot);

    const tabBtns = {};
    TABS.forEach((t) => {
      const b = el('button', 'sf-tab', t);
      b.addEventListener('click', () => this._select(ctx, t));
      bar.appendChild(b);
      tabBtns[t] = b;
    });

    refs = { pane, tabBtns, active: 'Audio' };
    this._select(ctx, 'Audio');
  },

  _select(ctx, tab) {
    if (!refs) return;
    refs.active = tab;
    Object.entries(refs.tabBtns).forEach(([t, b]) => b.classList.toggle('active', t === tab));
    this._render(ctx);
  },

  _set(ctx, section, key, value) {
    const s = ctx.state.settings;
    if (section && s[section] && typeof s[section] === 'object') s[section][key] = value;
    else s[key] = value;
    ctx.bus.emit('settings:changed', { section, key, value });
  },

  _render(ctx) {
    if (!refs) return;
    const pane = refs.pane;
    pane.innerHTML = '';
    const s = ctx.state.settings;

    const rowSlider = (label, get, min, max, step, fmt, onInput) => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, label));
      const ctl = el('div', 'sf-ctl');
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
      const v = el('span', 'sf-val', fmt(get()));
      r.addEventListener('input', () => { onInput(parseFloat(r.value)); v.textContent = fmt(parseFloat(r.value)); });
      ctl.appendChild(r); ctl.appendChild(v); row.appendChild(ctl); pane.appendChild(row);
    };
    const rowToggle = (label, get, onChange) => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, label));
      const ctl = el('div', 'sf-ctl');
      const b = el('button', 'sf-tab', get() ? 'On' : 'Off');
      if (get()) b.classList.add('active');
      b.style.minWidth = '64px';
      b.addEventListener('click', () => { const nv = !get(); onChange(nv); b.textContent = nv ? 'On' : 'Off'; b.classList.toggle('active', nv); });
      ctl.appendChild(b); row.appendChild(ctl); pane.appendChild(row);
    };
    const rowSelect = (label, get, options, onChange) => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, label));
      const ctl = el('div', 'sf-ctl');
      const sel = el('select');
      options.forEach(([val, txt]) => { const o = el('option', null, txt); o.value = val; if (val === get()) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => onChange(sel.value));
      ctl.appendChild(sel); row.appendChild(ctl); pane.appendChild(row);
    };

    const pct = (v) => Math.round(v * 100) + '%';

    if (refs.active === 'Audio') {
      const a = s.audio;
      // Prominent first control: a big Mute-all button so silence is always one click away.
      rowToggle('Mute all', () => a.muted, (v) => this._set(ctx, 'audio', 'muted', v));
      rowSlider('Master', () => a.master, 0, 1, 0.01, pct, (v) => this._set(ctx, 'audio', 'master', v));
      rowSlider('SFX', () => a.sfx, 0, 1, 0.01, pct, (v) => this._set(ctx, 'audio', 'sfx', v));
      rowSlider('Music', () => a.music, 0, 1, 0.01, pct, (v) => this._set(ctx, 'audio', 'music', v));
    } else if (refs.active === 'Video') {
      const vd = s.video;
      rowToggle('Bloom', () => vd.bloom, (v) => this._set(ctx, 'video', 'bloom', v));
      rowSlider('Bloom strength', () => vd.bloomStrength, 0, 2, 0.05, (x) => x.toFixed(2), (v) => this._set(ctx, 'video', 'bloomStrength', v));
      rowSlider('Render scale', () => vd.renderScale, 0.5, 2, 0.05, (x) => x.toFixed(2) + 'x', (v) => this._set(ctx, 'video', 'renderScale', v));
      rowSlider('FOV', () => vd.fov, 35, 90, 1, (x) => Math.round(x) + '°', (v) => this._set(ctx, 'video', 'fov', v));
      rowSelect('Particle quality', () => vd.particleQuality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => this._set(ctx, 'video', 'particleQuality', v));
      rowToggle('VSync', () => vd.vsync, (v) => this._set(ctx, 'video', 'vsync', v));
      rowSlider('UI scale', () => s.uiScale, 0.75, 1.5, 0.05, (x) => x.toFixed(2) + 'x', (v) => {
        this._set(ctx, null, 'uiScale', v);
        const root = document.getElementById('ui-root'); if (root) root.style.setProperty('--ui-scale', v);
      });
    } else if (refs.active === 'Gameplay') {
      const g = s.gameplay;
      rowSelect('Difficulty', () => g.difficulty, [['casual', 'Casual'], ['standard', 'Standard'], ['veteran', 'Veteran'], ['ironman', 'Ironman']], (v) => this._set(ctx, 'gameplay', 'difficulty', v));
      rowSelect('Autosave', () => String(g.autosaveIntervalS), [['0', 'Off'], ['60', '60s'], ['120', '120s'], ['300', '300s']], (v) => this._set(ctx, 'gameplay', 'autosaveIntervalS', parseInt(v, 10)));
      rowToggle('Tutorial hints', () => g.tutorialHints, (v) => this._set(ctx, 'gameplay', 'tutorialHints', v));
      rowToggle('Damage numbers', () => s.showDamageNumbers, (v) => this._set(ctx, null, 'showDamageNumbers', v));
    } else if (refs.active === 'Controls') {
      pane.appendChild(el('p', 'sf-muted', 'Control reference (rebinding coming soon).'));
      const grid = el('div', 'sf-grid2');
      KEYBINDS.forEach(([action, keys]) => {
        grid.appendChild(el('div', 'k', keys));
        grid.appendChild(el('div', 'v', action));
      });
      pane.appendChild(grid);
    }
  },

  onShow(ctx) { this._render(ctx); },
  onHide() {},
  // IMPORTANT: must be a no-op. uiRoot.frame() calls screenManager.refreshTop() every ~0.3s for
  // any open screen; if this rebuilt the DOM it would destroy a slider/select mid-drag (the
  // "can't drag below 3% / have to keep the mouse on the line" bug). The panel is fully
  // event-driven — its own controls update their own value labels — so there is nothing to refresh.
  refresh() {},
};
