// Settings screen (ARCHITECTURE §3.3, §5; design/specs/09).
// Tabs: Audio / Video / Gameplay / Controls. Every change writes state.settings and
// emits settings:changed {section,key,value} (audio/render/save listen + live-apply).
// UI reads state.settings for display; the write to state.settings is the UI/settings
// module's own owned subtree (§3.3 owner: ui/settings), so writing it here is in-scope.

import { DEFAULTS as INPUT_DEFAULTS } from '../../systems/input.js';

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
  .sf-bind-btn { font-family:var(--mono) !important; letter-spacing:.04em; text-align:center !important; }
  .sf-bind-btn--capture { border-color:var(--accent) !important; color:var(--accent) !important;
    box-shadow:0 0 12px rgba(57,208,255,.5) inset; animation:sf-bind-pulse 1s ease-in-out infinite; }
  @keyframes sf-bind-pulse { 0%,100%{opacity:1;} 50%{opacity:.55;} }
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

const TABS = ['Audio', 'Video', 'Gameplay', 'Access', 'Controls'];

let refs = null;

// --- Key rebinding (V2 §12) ---
// DEFAULT_BINDINGS is the source of truth in input.js; mirror it here so the UI never desyncs.
const DEFAULT_BINDINGS = INPUT_DEFAULTS.BINDINGS;
// Flight actions the player may rebind. (Mouse buttons + Space-as-fire-alt are ergonomic constants
// and stay out of the rebind grid to keep the model simple.)
const REBINDABLE = ['forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'boost', 'autoFire'];
const REBIND_LABELS = {
  forward: 'Throttle up',
  reverse: 'Throttle down (reverse)',
  yawLeft: 'Steer left',
  yawRight: 'Steer right',
  strafeLeft: 'Lateral thrust left',
  strafeRight: 'Lateral thrust right',
  boost: 'Boost',
  autoFire: 'Toggle auto-fire',
};
// Turn a KeyboardEvent.code into a short, readable label: 'KeyW' -> 'W', 'ShiftLeft' -> 'L-Shift',
// 'ArrowUp' -> '↑', 'Space' -> 'Space'.
function humanizeCode(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'AltLeft') return 'L-Alt';
  return code;
}

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
      b.type = 'button';
      b.setAttribute('aria-pressed', String(get()));
      if (get()) b.classList.add('active');
      b.style.minWidth = '64px';
      b.addEventListener('click', () => { const nv = !get(); onChange(nv); b.textContent = nv ? 'On' : 'Off'; b.setAttribute('aria-pressed', String(nv)); b.classList.toggle('active', nv); });
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
      // HDR energy materials (spec §14.5): shader-driven thruster plume + Massline ribbon that write
      // HDR radiance into the bloom target. On by default for the beautiful flight look.
      if (vd.energyMaterials == null) vd.energyMaterials = true;
      rowToggle('HDR energy materials', () => !!vd.energyMaterials, (v) => this._set(ctx, 'video', 'energyMaterials', v));
      // Modern render graph (spec §14.6 / INTEGRATION_MAP §8.1): GTAO-lite contact depth + multiscale
      // bloom + ACES/grade composite. Replaces the bloom path when on; falls back on low-end GPUs.
      if (vd.renderGraph == null) vd.renderGraph = false;
      rowToggle('Render graph (GTAO + bloom)', () => !!vd.renderGraph, (v) => this._set(ctx, 'video', 'renderGraph', v));
      rowSlider('Render scale', () => vd.renderScale, 0.5, 2, 0.05, (x) => x.toFixed(2) + 'x', (v) => this._set(ctx, 'video', 'renderScale', v));
      rowSlider('FOV', () => vd.fov, 35, 90, 1, (x) => Math.round(x) + '°', (v) => this._set(ctx, 'video', 'fov', v));
      rowSelect('Particle quality', () => vd.particleQuality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => this._set(ctx, 'video', 'particleQuality', v));
      rowToggle('VSync', () => vd.vsync, (v) => this._set(ctx, 'video', 'vsync', v));
      // Accessibility (V2 §9/§12): vestibular-sensitive players get hit feedback (numbers, audio,
      // smoke) with the camera shake / FOV punch / hit-stop freeze suppressed. Live-applied: the
      // feel module reads settings.video.motionReduce every trigger, so toggling takes effect now.
      rowToggle('Reduce motion', () => !!vd.motionReduce, (v) => this._set(ctx, 'video', 'motionReduce', v));
      rowSlider('UI scale', () => s.uiScale, 0.75, 2, 0.05, (x) => x.toFixed(2) + 'x', (v) => {
        this._set(ctx, null, 'uiScale', v);
        const root = document.getElementById('ui-root'); if (root) root.style.setProperty('--ui-scale', v);
      });
    } else if (refs.active === 'Gameplay') {
      const g = s.gameplay;
      if (!s.controls) s.controls = { bindings: null, flightMode: 'assisted' };
      if (!s.controls.flightMode) s.controls.flightMode = 'assisted';
      g.physicsBackend = 'rapier-dynamic';
      g.aiBackend = 'sg06-tactical';
      g.flightBackend = 'v3';
      rowSelect('Difficulty', () => g.difficulty, [['casual', 'Casual'], ['standard', 'Standard'], ['veteran', 'Veteran'], ['ironman', 'Ironman']], (v) => this._set(ctx, 'gameplay', 'difficulty', v));
      rowSelect('Flight model', () => s.controls.flightMode || 'assisted', [['assisted', 'Assisted'], ['drift', 'Drift'], ['newtonian', 'Newtonian']], (v) => this._set(ctx, 'controls', 'flightMode', v));
      rowSelect('Autosave', () => String(g.autosaveIntervalS), [['0', 'Off'], ['60', '60s'], ['120', '120s'], ['300', '300s']], (v) => this._set(ctx, 'gameplay', 'autosaveIntervalS', parseInt(v, 10)));
      rowToggle('Tutorial hints', () => g.tutorialHints, (v) => this._set(ctx, 'gameplay', 'tutorialHints', v));
      rowToggle('Damage numbers', () => s.showDamageNumbers, (v) => this._set(ctx, null, 'showDamageNumbers', v));
    } else if (refs.active === 'Access') {
      const ac = s.accessibility || (s.accessibility = { colorblindMode: 'none', highContrast: false, flashReduce: false, dyslexiaFont: false });
      rowSelect('Colorblind palette', () => ac.colorblindMode || 'none',
        [['none', 'Off'], ['protanopia', 'Protanopia (red-weak)'], ['deuteranopia', 'Deuteranopia (green-weak)'], ['tritanopia', 'Tritanopia (blue-weak)']],
        (v) => this._set(ctx, 'accessibility', 'colorblindMode', v));
      rowToggle('High contrast', () => !!ac.highContrast, (v) => this._set(ctx, 'accessibility', 'highContrast', v));
      rowToggle('Reduce flashing', () => !!ac.flashReduce, (v) => this._set(ctx, 'accessibility', 'flashReduce', v));
      rowToggle('Readable font', () => !!ac.dyslexiaFont, (v) => this._set(ctx, 'accessibility', 'dyslexiaFont', v));
      // Reduce-motion mirror — the field lives under video (feel/vfx read it there); surfaced here too.
      rowToggle('Reduce motion', () => !!s.video.motionReduce, (v) => this._set(ctx, 'video', 'motionReduce', v));
      pane.appendChild(el('p', 'sf-muted', 'UI scale is on the Video tab. Colorblind mode also recolors radar blips and adds redundant shapes.'));
    } else if (refs.active === 'Controls') {
      pane.appendChild(el('p', 'sf-muted', 'Click a key to rebind it, then press a new key. Mouse buttons (fire/mine) are fixed.'));
      this._renderControlsRebind(ctx, pane);
      this._renderGamepadSettings(ctx, pane);
    }
  },

  _renderGamepadSettings(ctx, pane) {
    pane.appendChild(el('h2', null, 'Gamepad'));
    const s = ctx.state.settings;
    if (!s.controls) s.controls = { bindings: null, flightMode: 'assisted' };
    if (!s.controls.gamepad) s.controls.gamepad = { enabled: true, deadzone: 0.12, invertY: false };
    const gp = s.controls.gamepad;

    const rowToggle = (label, get, onChange) => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, label));
      const ctl = el('div', 'sf-ctl');
      const b = el('button', 'sf-tab', get() ? 'On' : 'Off');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(get()));
      if (get()) b.classList.add('active');
      b.style.minWidth = '64px';
      b.addEventListener('click', () => {
        const nv = !get();
        onChange(nv);
        b.textContent = nv ? 'On' : 'Off';
        b.setAttribute('aria-pressed', String(nv));
        b.classList.toggle('active', nv);
      });
      ctl.appendChild(b); row.appendChild(ctl); pane.appendChild(row);
    };
    const rowSlider = (label, get, min, max, step, fmt, onInput) => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, label));
      const ctl = el('div', 'sf-ctl');
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
      const v = el('span', 'sf-val', fmt(get()));
      r.addEventListener('input', () => { onInput(parseFloat(r.value)); v.textContent = fmt(parseFloat(r.value)); });
      ctl.appendChild(r); ctl.appendChild(v); row.appendChild(ctl); pane.appendChild(row);
    };

    rowToggle('Gamepad enabled', () => !!gp.enabled, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp, enabled: v }));
    rowSlider('Stick deadzone', () => gp.deadzone, 0, 0.5, 0.01, (x) => Math.round(x * 100) + '%', (v) => this._set(ctx, 'controls', 'gamepad', { ...gp, deadzone: v }));
    rowToggle('Invert right-stick Y', () => !!gp.invertY, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp, invertY: v }));
    pane.appendChild(el('p', 'sf-muted', 'Default layout: left stick fly, right stick aim, RT fire, RB boost, LB brake, X target, View star map, Y codex, Start pause.'));

    // Touch (P1-12): virtual dual-stick + buttons for touchscreens. Auto-detects on touch devices;
    // this toggle lets the player force-enable (e.g. a touchscreen laptop) or force-disable.
    pane.appendChild(el('h2', null, 'Touch'));
    if (!s.controls.touch) s.controls.touch = { enabled: null }; // null = auto-detect
    const tc = s.controls.touch;
    rowToggle('Touch controls', () => (tc.enabled == null ? 'auto' : tc.enabled), (v) => {
      // Cycle auto → on → off → auto so all three states are reachable from one control.
      const cur = tc.enabled == null ? 'auto' : (tc.enabled ? 'on' : 'off');
      const next = cur === 'auto' ? true : (cur === 'on' ? false : null);
      this._set(ctx, 'controls', 'touch', { ...tc, enabled: next });
      const tp = ctx.touch;
      if (tp) tp.persistEnabled(next);
    });
    pane.appendChild(el('p', 'sf-muted', 'Virtual sticks: left = fly, right = aim, buttons = fire/mine/boost. Auto-enabled on touch devices.'));
  },

  // Live rebind UI for flight actions. Reads defaults from input.js + any saved overrides in
  // settings.controls.bindings. Capture-on-click: a clicked button enters "listening" mode and the
  // next keydown sets the binding (with conflict detection — can't bind the same key to two actions
  // in the movement cluster). Escape cancels capture, Backspace clears the binding to default.
  _renderControlsRebind(ctx, pane) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = { bindings: null };
    // Live bindings = defaults overlaid with saved overrides.
    const live = {};
    for (const a in DEFAULT_BINDINGS) live[a] = (DEFAULT_BINDINGS[a] || []).slice();
    if (s.controls.bindings) for (const a in s.controls.bindings) live[a] = (s.controls.bindings[a] || []).slice();

    const grid = el('div', 'sf-grid2');
    grid.style.gridTemplateColumns = '1fr 140px';
    REBINDABLE.forEach((action) => {
      const label = el('div', 'v', REBIND_LABELS[action] || action);
      const btn = el('button', 'sf-btn sf-bind-btn');
      btn.style.minWidth = '120px';
      const codes = live[action] || [];
      btn.textContent = codes.map(humanizeCode).join(' / ') || '—';
      btn.addEventListener('click', () => this._capture(ctx, btn, action, live, grid));
      grid.appendChild(label);
      grid.appendChild(btn);
    });
    pane.appendChild(grid);

    // reset button
    const resetRow = el('div', 'sf-row');
    resetRow.style.marginTop = '12px';
    const reset = el('button', 'sf-btn');
    reset.textContent = 'Reset to defaults';
    reset.style.width = 'auto';
    reset.addEventListener('click', () => {
      s.controls.bindings = null; // null => input.js falls back to DEFAULT_BINDINGS
      ctx.bus.emit('settings:changed', { section: 'controls', key: 'bindings', value: null });
      this._render(ctx);
    });
    const note = el('span', 'sf-muted');
    note.style.marginLeft = '10px';
    note.style.fontSize = '12px';
    note.textContent = 'Arrow keys always also work for movement.';
    resetRow.appendChild(reset);
    resetRow.appendChild(note);
    pane.appendChild(resetRow);
  },

  // Capture the next keydown as the new binding for `action`. Only ONE code per action in the UI
  // (we keep arrow-cluster compatibility by leaving movement's secondary arrow code alone if the
  // primary is being rebound — simplest mental model: "set the WASD key").
  _capture(ctx, btn, action, live, grid) {
    if (this._capturing) return;
    this._capturing = true;
    const prev = btn.textContent;
    btn.textContent = 'Press a key…';
    btn.classList.add('sf-bind-btn--capture');

    const done = (commit) => {
      this._capturing = false;
      btn.classList.remove('sf-bind-btn--capture');
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onClickAway, true);
      this._activeCapture = null;
      if (!commit) btn.textContent = prev;
    };
    const onKey = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      // Escape cancels; Backspace resets this action to default.
      if (ev.code === 'Escape') { done(false); return; }
      if (ev.code === 'Backspace' || ev.code === 'Delete') {
        this._commitBind(ctx, action, null, live, grid);
        done(true);
        return;
      }
      // Conflict check: don't let the same code be the PRIMARY (index 0) of two rebindable actions.
      for (const other of REBINDABLE) {
        if (other === action) continue;
        if ((live[other] || [])[0] === ev.code) {
          btn.textContent = 'In use: ' + (REBIND_LABELS[other] || other);
          setTimeout(() => done(false), 900);
          return;
        }
      }
      this._commitBind(ctx, action, ev.code, live, grid);
      done(true);
    };
    const onClickAway = (ev) => { if (ev.target !== btn) done(false); };
    this._activeCapture = done;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClickAway, true);
  },

  // Persist a new primary binding for `action` into settings.controls.bindings. We preserve any
  // secondary code (e.g. ArrowUp alongside KeyW) so arrow players keep working after a rebind.
  _commitBind(ctx, action, code, live, grid) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = {};
    if (!s.controls.bindings) s.controls.bindings = {};
    const def = DEFAULT_BINDINGS[action] || [];
    if (code == null) {
      delete s.controls.bindings[action]; // reset to default
      live[action] = def.slice();
    } else {
      // keep the arrow-cluster secondary if the default had one and it's not the code being set
      const secondary = def.length > 1 ? def[1] : null;
      const arr = (secondary && secondary !== code) ? [code, secondary] : [code];
      s.controls.bindings[action] = arr;
      live[action] = arr;
    }
    ctx.bus.emit('settings:changed', { section: 'controls', key: action, value: s.controls.bindings[action] });
    this._render(ctx); // refresh the grid to show the new label
  },

  onShow(ctx) { this._render(ctx); },
  // If the screen closes mid key-capture, bail out so the global keydown/mousedown listeners
  // don't leak / swallow keys after the player navigates away.
  onHide() { if (this._capturing && this._activeCapture) this._activeCapture(false); },
  // IMPORTANT: must be a no-op. uiRoot.frame() calls screenManager.refreshTop() every ~0.3s for
  // any open screen; if this rebuilt the DOM it would destroy a slider/select mid-drag (the
  // "can't drag below 3% / have to keep the mouse on the line" bug). The panel is fully
  // event-driven — its own controls update their own value labels — so there is nothing to refresh.
  refresh() {},
};
