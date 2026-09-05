// Settings screen (ARCHITECTURE §3.3, §5; design/specs/09).
// Tabs: Audio / Video / Gameplay / Controls. Every change writes state.settings and
// emits settings:changed {section,key,value,persist?} (audio/render/save listen + live-apply/profile-persist).
// UI reads state.settings for display; the write to state.settings is the UI/settings
// module's own owned subtree (§3.3 owner: ui/settings), so writing it here is in-scope.

import { DEFAULTS as INPUT_DEFAULTS } from '../../systems/input.js';
import { massline2Flag } from '../../data/featureFlags.js';
import { MASSLINE_BINDING_PROFILE_SPACE } from '../../core/graphicsProfileBootstrap.js';
import { DEFAULT_BLOOM_STRENGTH } from '../../render/bloom.js';
import { BINDINGS } from '../bindings.js';

const STYLE_ID = 'sf-settings-menu-style';

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
  .sf-controls-fixed-shortcuts { margin-top:6px; grid-template-columns:1fr 120px 1.5fr !important; }
  .sf-controls-fixed-shortcuts .k { color:var(--accent); font-family:var(--mono); font-weight:600; }
  .sf-bind-btn {
    font-family:var(--mono) !important;
    letter-spacing:.04em;
    text-align:center !important;
    background:rgba(10,16,24,.8) !important;
    border:1px solid var(--mf-line-2) !important;
    border-radius:3px !important;
    padding:6px 12px !important;
    white-space:nowrap !important; /* "L-SHIFT / R-SHIFT" must not wrap: a two-line key chip breaks the row rhythm */
    font-size:12px !important;
    transition:border-color .12s ease, background .12s ease, box-shadow .12s ease, translate .08s ease !important;
  }
  .sf-bind-btn:hover:not(:disabled) {
    border-color:rgba(78,195,230,.45) !important;
    background:rgba(16,25,36,.95) !important;
  }
  .sf-bind-btn:active:not(:disabled) {
    translate:0 1px !important;
  }
  .sf-bind-btn--capture {
    border-color:var(--accent) !important;
    color:#04202b !important;
    background:var(--accent) !important;
    box-shadow:0 0 14px rgba(78,195,230,.6) !important;
    animation:sf-bind-pulse 0.9s ease-in-out infinite alternate !important;
  }
  .sf-bind-btn--digit { font-family:var(--mf-ui, inherit) !important; letter-spacing:.02em !important; }
  @keyframes sf-bind-pulse { 0%{opacity:1; transform:scale(1);} 100%{opacity:.75; transform:scale(0.98);} }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
  rootEl.dataset.stamp = 'SYSTEMS / CONFIGURATION';
  const h = document.createElement('h1'); h.textContent = title; rootEl.appendChild(h);
  return rootEl;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

const TABS = ['Audio', 'Video', 'Gameplay', 'Access', 'Controls'];

let refs = null;
let controlId = 0;

function nextControlId() { controlId += 1; return `sf-settings-control-${controlId}`; }

export function bindCommittedRange(input, valueLabel, fmt, onValue) {
  // Track fill: the CSS track reads --sf-range-fill so the value is visible at a glance,
  // not just in the numeric readout.
  const paint = () => {
    const min = Number(input.min) || 0;
    const max = Number(input.max);
    const span = Number.isFinite(max) && max > min ? max - min : 100;
    const pct = ((parseFloat(input.value) - min) / span) * 100;
    input.style.setProperty('--sf-range-fill', `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
  };
  const publish = (persist) => {
    paint();
    const value = parseFloat(input.value);
    onValue(value, persist);
    valueLabel.textContent = fmt(value);
  };
  input.addEventListener('input', () => publish(false));
  input.addEventListener('change', () => publish(true));
  paint();
}

// --- Key rebinding (V2 §12) ---
// input.js owns the binding tables; the settings UI mirrors the active control scheme and overlays
// saved custom keys so "reset to defaults" means the defaults for the selected scheme.
const DEFAULT_BINDINGS = INPUT_DEFAULTS.BINDINGS;
// Flight actions the player may rebind. Mouse buttons stay out of the grid; Space is the
// new-profile Massline primary and F remains its permanent alias.
const REBINDABLE = ['forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'boost', 'autoFire',
  'brake', 'siteBeam', 'tether', 'chargeThrow', 'chargeDetonate', 'scanPulse', 'cruise', 'reelIn', 'reelOut',
  'bulletTime', 'cloak', 'travelBurn', 'deployMassSeed', 'deployWell', 'deployRepulsor', 'toggleClearingCone'];
const REBIND_LABELS = {
  forward: 'Throttle up',
  reverse: 'Throttle down (reverse)',
  yawLeft: 'Steer left (Classic scheme)',
  yawRight: 'Steer right (Classic scheme)',
  strafeLeft: 'Lateral thrust left',
  strafeRight: 'Lateral thrust right',
  boost: 'Boost / dash',
  autoFire: 'Toggle auto-target / draw-to-fly',
  brake: 'Brake (0; S / Down also reverse)',
  siteBeam: 'World Site beam (selected target)',
  tether: 'Massline: tap latch/cut; hold line control',
  chargeThrow: 'Impulse charge: throw',
  chargeDetonate: 'Impulse charge: detonate',
  scanPulse: 'Scanner pulse',
  cruise: 'Cruise drive (charge/drop)',
  reelIn: 'Tether winch in',
  reelOut: 'Tether winch out',
  bulletTime: 'Bullet time (hold)',
  cloak: 'Cloak toggle',
  // W1-5. A latch that is rebindable in data but has no row here is not rebindable to a player.
  travelBurn: 'Travel drive (burn latch)',
  // PQ-011. Keyboard verb (same reachability posture as the impulse-charge verbs): no standard
  // gamepad button remains unclaimed, so the pad row stays unbound rather than commandeered.
  deployMassSeed: 'Anchor Mass Seed: deploy',
  // PQ-012 continuous field tools.
  deployWell: 'Field: deploy attractive Well',
  deployRepulsor: 'Field: deploy Repulsor',
  toggleClearingCone: 'Field: toggle Clearing Cone',
};

function controlSchemeFor(settings) {
  const scheme = settings && settings.gameplay && settings.gameplay.controlScheme || 'pilot';
  const schemes = INPUT_DEFAULTS.SCHEMES || {};
  return schemes[scheme] ? scheme : 'pilot';
}

function schemeBindingsFor(settings) {
  const schemes = INPUT_DEFAULTS.SCHEMES || {};
  return schemes[controlSchemeFor(settings)] || DEFAULT_BINDINGS;
}

function mergedBindingsFor(settings) {
  const base = schemeBindingsFor(settings);
  const live = {};
  const keys = new Set([...Object.keys(DEFAULT_BINDINGS || {}), ...Object.keys(base || {})]);
  for (const action of keys) live[action] = ((base && base[action]) || DEFAULT_BINDINGS[action] || []).slice();
  const custom = settings && settings.controls && settings.controls.bindings;
  if (custom) for (const action in custom) live[action] = (custom[action] || []).slice();
  return { base, live };
}

// Fixed interface keys from the live BINDINGS registry (not rebindable flight codes).
// Pause is Esc/P (UI-owned, not in BINDINGS). Mission Log is BINDINGS.missionLog on keyboard/touch;
// gamepad has no direct Mission Log button — Start opens Pause, then choose Mission Log.
export const CONTROL_SHORTCUTS = Object.freeze([
  { label: 'Dock / interact', key: BINDINGS.dock.label, note: 'when prompted' },
  { label: 'Mission Log', key: BINDINGS.missionLog.label, note: 'active + completed contracts; gamepad: Start → Pause → Mission Log' },
  { label: 'Local Map', key: BINDINGS.localmap.label, note: 'same-sector contacts/objectives' },
  { label: 'Star Map', key: BINDINGS.starmap.label, note: 'jump routes and sector objectives' },
  { label: 'Codex', key: BINDINGS.codex.label, note: 'reference and unlocked journal' },
  { label: 'Tech Tree', key: BINDINGS.techTree.label, note: 'unlock path and blockers' },
  { label: 'Cargo Hold', key: BINDINGS.cargo.label, note: 'cargo value and capacity' },
  { label: 'Comms Log', key: BINDINGS.comms.label, note: 'messages and contacts' },
  { label: 'Drill / asteroid base', key: BINDINGS.drill.label, note: 'target asteroid first' },
  { label: 'Claim / open base', key: BINDINGS.claimBase.label, note: 'near claimable body/base' },
  { label: 'Pause', key: 'Esc / P', note: 'pause menu: resume, settings, save/load, map review' },
]);

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
  if (code === 'NumLock') return 'Num Lock';
  if (code === 'CapsLock') return 'Caps Lock';
  if (code === 'Backquote') return '`';
  return code;
}

export const settingsScreen = {
  id: 'settings',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Settings', 'sf-menu-wide');

    const bar = el('div', 'sf-tabbar');
    const pane = el('div', 'sf-settings-pane');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Settings categories');
    pane.id = 'sf-settings-pane';
    pane.setAttribute('role', 'tabpanel');
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
      b.type = 'button';
      b.id = `sf-settings-tab-${t.toLowerCase()}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', pane.id);
      b.addEventListener('click', () => this._select(ctx, t));
      b.addEventListener('keydown', (ev) => {
        const i = TABS.indexOf(t);
        let next = -1;
        if (ev.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
        else if (ev.key === 'ArrowRight') next = (i + 1) % TABS.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = TABS.length - 1;
        if (next < 0) return;
        ev.preventDefault();
        this._select(ctx, TABS[next]);
        refs.tabBtns[TABS[next]].focus();
      });
      bar.appendChild(b);
      tabBtns[t] = b;
    });

    refs = { pane, tabBtns, active: 'Audio' };
    this._select(ctx, 'Audio');
  },

  _select(ctx, tab) {
    if (!refs) return;
    refs.active = tab;
    Object.entries(refs.tabBtns).forEach(([t, b]) => {
      const active = t === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
    });
    refs.pane.setAttribute('aria-labelledby', refs.tabBtns[tab].id);
    refs.pane.classList.remove('sf-pane-anim');
    void refs.pane.offsetWidth;
    refs.pane.classList.add('sf-pane-anim');
    this._render(ctx);
  },

  _set(ctx, section, key, value, persist = true) {
    const s = ctx.state.settings;
    if (section && s[section] && typeof s[section] === 'object') s[section][key] = value;
    else s[key] = value;
    const payload = { section, key, value };
    if (persist === false) payload.persist = false;
    ctx.bus.emit('settings:changed', payload);
  },

  _render(ctx) {
    if (!refs) return;
    const pane = refs.pane;
    pane.innerHTML = '';
    const s = ctx.state.settings;

    const rowSlider = (label, get, min, max, step, fmt, onInput) => {
      const row = el('div', 'sf-row');
      const labelEl = el('label', null, label);
      const id = nextControlId();
      labelEl.htmlFor = id;
      row.appendChild(labelEl);
      const ctl = el('div', 'sf-ctl');
      const r = el('input'); r.id = id; r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
      const v = el('span', 'sf-val', fmt(get()));
      bindCommittedRange(r, v, fmt, onInput);
      ctl.appendChild(r); ctl.appendChild(v); row.appendChild(ctl); pane.appendChild(row);
    };
    const rowToggle = (label, get, onChange) => {
      const row = el('div', 'sf-row');
      const labelEl = el('label', null, label);
      const id = nextControlId();
      labelEl.htmlFor = id;
      row.appendChild(labelEl);
      const ctl = el('div', 'sf-ctl');
      const b = el('button', 'sf-tab', get() ? 'On' : 'Off');
      b.type = 'button';
      b.id = id;
      b.setAttribute('aria-pressed', String(get()));
      if (get()) b.classList.add('active');
      b.style.minWidth = '64px';
      b.addEventListener('click', () => { const nv = !get(); onChange(nv); b.textContent = nv ? 'On' : 'Off'; b.setAttribute('aria-pressed', String(nv)); b.classList.toggle('active', nv); });
      ctl.appendChild(b); row.appendChild(ctl); pane.appendChild(row);
    };
    const rowSelect = (label, get, options, onChange) => {
      const row = el('div', 'sf-row');
      const labelEl = el('label', null, label);
      const id = nextControlId();
      labelEl.htmlFor = id;
      row.appendChild(labelEl);
      const ctl = el('div', 'sf-ctl');
      const sel = el('select'); sel.id = id;
      options.forEach(([val, txt]) => { const o = el('option', null, txt); o.value = val; if (val === get()) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => onChange(sel.value));
      ctl.appendChild(sel); row.appendChild(ctl); pane.appendChild(row);
    };

    const pct = (v) => Math.round(v * 100) + '%';

    if (refs.active === 'Audio') {
      const a = s.audio;
      // Prominent first control: a big Mute-all button so silence is always one click away.
      rowToggle('Mute all', () => a.muted, (v) => this._set(ctx, 'audio', 'muted', v));
      rowSlider('Master', () => a.master, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'master', v, persist));
      rowSlider('SFX', () => a.sfx, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'sfx', v, persist));
      rowSlider('Music', () => a.music, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'music', v, persist));
      rowSlider('Engine', () => a.engine == null ? 0.7 : a.engine, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'engine', v, persist));
      rowSlider('Ambient', () => a.ambient == null ? 0.7 : a.ambient, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'ambient', v, persist));
      rowSlider('Combat', () => a.combat == null ? 0.7 : a.combat, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'combat', v, persist));
      rowSlider('UI', () => a.ui == null ? 0.7 : a.ui, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'ui', v, persist));
      rowSlider('Comms', () => a.comms == null ? 0.7 : a.comms, 0, 1, 0.01, pct, (v, persist) => this._set(ctx, 'audio', 'comms', v, persist));
    } else if (refs.active === 'Video') {
      const vd = s.video;
      rowToggle('Bloom', () => vd.bloom, (v) => this._set(ctx, 'video', 'bloom', v));
      // Shadows are a sun-depth pass of nearby ships/rocks/stations so they darken each other.
      // Empty space does not receive them. Off skips that extra pass. Live-applied.
      rowToggle('Sun shadows (ships/rocks/stations)', () => vd.shadows !== false, (v) => this._set(ctx, 'video', 'shadows', v));
      rowSlider('Bloom strength', () => {
        let v = vd.bloomStrength != null ? vd.bloomStrength : DEFAULT_BLOOM_STRENGTH;
        if (v > 1) v *= 0.5;
        return Math.max(0, Math.min(1, v));
      }, 0, 1, 0.02, pct, (v, persist) => this._set(ctx, 'video', 'bloomStrength', v, persist));
      // HDR energy materials (spec §14.5): shader-driven thruster plume + Massline ribbon that write
      // HDR radiance into the bloom target. On by default for the beautiful flight look.
      if (vd.energyMaterials == null) vd.energyMaterials = true;
      rowToggle('HDR energy materials', () => !!vd.energyMaterials, (v) => this._set(ctx, 'video', 'energyMaterials', v));
      // Modern render graph (spec §14.6 / INTEGRATION_MAP §8.1): GTAO-lite contact depth + multiscale
      // bloom + ACES/grade composite. Replaces the bloom path when on; falls back on low-end GPUs.
      if (vd.renderGraph == null) vd.renderGraph = false;
      rowToggle('Render graph (GTAO + bloom)', () => !!vd.renderGraph, (v) => this._set(ctx, 'video', 'renderGraph', v));
      rowSlider('Render scale', () => vd.renderScale, 0.5, 2, 0.05, (x) => x.toFixed(2) + 'x', (v, persist) => this._set(ctx, 'video', 'renderScale', v, persist));
      // Emergency-only: normal play keeps a stable render size. Structural fixes own performance.
      if (vd.dynamicResolution == null) vd.dynamicResolution = false;
      rowToggle('Emergency dynamic resolution', () => vd.dynamicResolution === true, (v) => this._set(ctx, 'video', 'dynamicResolution', v));
      rowSlider('FOV', () => vd.fov, 35, 90, 1, (x) => Math.round(x) + '°', (v, persist) => this._set(ctx, 'video', 'fov', v, persist));
      rowSelect('Particle quality', () => vd.particleQuality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => this._set(ctx, 'video', 'particleQuality', v));
      rowToggle('Engine trails', () => vd.engineTrails !== false, (v) => this._set(ctx, 'video', 'engineTrails', v));
      rowToggle('VSync', () => vd.vsync, (v) => this._set(ctx, 'video', 'vsync', v));
      // Accessibility (V2 §9/§12): vestibular-sensitive players get hit feedback (numbers, audio,
      // smoke) with the camera shake / FOV punch / hit-stop freeze suppressed. Live-applied: the
      // feel module reads settings.video.motionReduce every trigger, so the preference takes effect now.
      rowSelect('Motion effects', () => (s.accessibility && s.accessibility.motionPreference) || (vd.motionReduce ? 'reduce' : 'system'),
        [['system', 'Follow system'], ['reduce', 'Reduced'], ['full', 'Full']],
        (v) => this._set(ctx, 'accessibility', 'motionPreference', v));
      rowSlider('Screen Shake', () => vd.screenShake != null ? vd.screenShake : 100, 0, 100, 1, (x) => Math.round(x) + '%', (v, persist) => this._set(ctx, 'video', 'screenShake', v, persist));
      rowSlider('UI scale', () => s.uiScale, 0.75, 2, 0.05, (x) => x.toFixed(2) + 'x', (v, persist) => {
        this._set(ctx, null, 'uiScale', v, persist);
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
      rowSelect('Massline orbit assist', () => g.orbitAssistStrength || 'standard', [
        ['full', 'Full'],
        ['standard', 'Standard'],
        ['light', 'Light'],
        ['off', 'Off'],
      ], (v) => this._set(ctx, 'gameplay', 'orbitAssistStrength', v));
      if (massline2Flag('enabled')) {
        rowSelect('Massline release assist', () => g.masslineReleaseAssist || 'arm', [
          ['arm', 'Auto-release on solution (default)'],
          ['snap', 'Snap window on manual release'],
          ['off', 'Off — raw physics'],
        ], (v) => this._set(ctx, 'gameplay', 'masslineReleaseAssist', v));
        pane.appendChild(el('p', 'sf-muted', 'The release marker reads RELEASE when the timing window opens; motion and color are optional reinforcement.'));
      }
      rowSelect('Autosave', () => String(g.autosaveIntervalS), [['0', 'Off'], ['60', '60s'], ['120', '120s'], ['300', '300s']], (v) => this._set(ctx, 'gameplay', 'autosaveIntervalS', parseInt(v, 10)));
      rowToggle('Tutorial hints', () => g.tutorialHints, (v) => this._set(ctx, 'gameplay', 'tutorialHints', v));
      rowToggle('Damage numbers', () => !!g.damageNumbers, (v) => this._set(ctx, 'gameplay', 'damageNumbers', v));
    } else if (refs.active === 'Access') {
      const ac = s.accessibility || (s.accessibility = { colorblindMode: 'none', highContrast: false, flashReduce: false, dyslexiaFont: false,
        motionPreference: 'system', captions: true, captionSize: 'medium', captionBackground: true });
      rowSelect('Colorblind palette', () => ac.colorblindMode || 'none',
        [['none', 'Off'], ['protanopia', 'Protanopia (red-weak)'], ['deuteranopia', 'Deuteranopia (green-weak)'], ['tritanopia', 'Tritanopia (blue-weak)']],
        (v) => this._set(ctx, 'accessibility', 'colorblindMode', v));
      rowToggle('High contrast', () => !!ac.highContrast, (v) => this._set(ctx, 'accessibility', 'highContrast', v));
      rowToggle('Reduce flashing', () => !!ac.flashReduce, (v) => this._set(ctx, 'accessibility', 'flashReduce', v));
      rowToggle('Readable font', () => !!ac.dyslexiaFont, (v) => this._set(ctx, 'accessibility', 'dyslexiaFont', v));
      rowSelect('Motion effects', () => ac.motionPreference || (s.video.motionReduce ? 'reduce' : 'system'),
        [['system', 'Follow system'], ['reduce', 'Reduced'], ['full', 'Full']],
        (v) => this._set(ctx, 'accessibility', 'motionPreference', v));
      rowToggle('Gameplay captions', () => ac.captions !== false, (v) => this._set(ctx, 'accessibility', 'captions', v));
      rowSelect('Caption size', () => ac.captionSize || 'medium',
        [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
        (v) => this._set(ctx, 'accessibility', 'captionSize', v));
      rowToggle('Solid caption backing', () => ac.captionBackground !== false, (v) => this._set(ctx, 'accessibility', 'captionBackground', v));
      rowSlider('UI scale', () => s.uiScale, 0.75, 2, 0.05, (x) => x.toFixed(2) + 'x', (v, persist) => {
        this._set(ctx, null, 'uiScale', v, persist);
        const root = document.getElementById('ui-root'); if (root) root.style.setProperty('--ui-scale', v);
      });
      pane.appendChild(el('p', 'sf-muted', 'Colorblind mode also recolors radar blips and adds redundant shapes.'));
    } else if (refs.active === 'Controls') {
      rowSelect('Control Scheme', () => s.gameplay.controlScheme || 'pilot',
        [['pilot', 'Pilot (keyboard steers, mouse aims)'], ['helm-assist', 'Helm Assist (mouse steering)'], ['classic', 'Classic Throttle']],
        (v) => {
          this._set(ctx, 'gameplay', 'controlScheme', v);
          // Explicit choice: stop the one-time pilot migration (saveSystem) from overriding it.
          this._set(ctx, 'gameplay', 'controlSchemeV2', true);
          this._render(ctx);
        });
      pane.appendChild(el('p', 'sf-muted', 'Click a flight key to rebind it, then press a new key. Fixed ship/system shortcuts are listed below so you do not have to leave Settings to find them.'));
      this._renderControlsRebind(ctx, pane);
      this._renderFixedShortcuts(pane);
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
      bindCommittedRange(r, v, fmt, onInput);
      ctl.appendChild(r); ctl.appendChild(v); row.appendChild(ctl); pane.appendChild(row);
    };

    rowToggle('Gamepad enabled', () => !!gp.enabled, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp, enabled: v }));
    rowSlider('Stick deadzone', () => gp.deadzone, 0, 0.5, 0.01, (x) => Math.round(x * 100) + '%', (v, persist) => this._set(ctx, 'controls', 'gamepad', { ...gp, deadzone: v }, persist));
    rowToggle('Invert right-stick Y', () => !!gp.invertY, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp, invertY: v }));
    // Matches src/systems/gamepad.js ACTION_MAP + UI route: Start/menu → pause only;
    // Mission Log is chosen from the Pause menu (no direct gamepad missionLog action).
    pane.appendChild(el('p', 'sf-muted', 'Default layout: left stick fly, right stick aim, RT fire, LT mine, RB boost, LB brake, R3 countermeasure, A/Cross Massline (dock/accept when prompted), X/Square target, D-pad up auto-target (right stick draw-to-fly), View star map, Y/Triangle codex, Start → Pause → Mission Log.'));

    const touchMode = () => {
      const cfg = s.controls.touch || {};
      return cfg.enabled == null ? 'auto' : (cfg.enabled ? 'on' : 'off');
    };
    const touchModeLabel = (mode) => ({ auto: 'Auto', on: 'On', off: 'Off' }[mode] || 'Auto');
    const nextTouchValue = (mode) => (mode === 'auto' ? true : (mode === 'on' ? false : null));
    const commitTouchValue = (next) => {
      const tp = ctx.touch;
      if (tp && typeof tp.persistEnabled === 'function') {
        tp.persistEnabled(next);
      } else {
        this._set(ctx, 'controls', 'touch', { ...(s.controls.touch || {}), enabled: next });
      }
    };
    const rowTouchMode = () => {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', null, 'Touch controls'));
      const ctl = el('div', 'sf-ctl');
      const b = el('button', 'sf-tab');
      b.type = 'button';
      b.style.minWidth = '78px';
      const sync = () => {
        const mode = touchMode();
        b.textContent = touchModeLabel(mode);
        b.setAttribute('aria-pressed', mode === 'auto' ? 'mixed' : String(mode === 'on'));
        b.classList.toggle('active', mode !== 'off');
      };
      b.addEventListener('click', () => {
        commitTouchValue(nextTouchValue(touchMode()));
        sync();
      });
      sync();
      ctl.appendChild(b); row.appendChild(ctl); pane.appendChild(row);
    };

    // Touch (P1-12): virtual dual-stick + buttons for touchscreens. Auto-detects on touch devices;
    // this tri-state lets the player force-enable (e.g. a touchscreen laptop), force-disable, or
    // return to automatic detection.
    pane.appendChild(el('h2', null, 'Touch'));
    if (!s.controls.touch) s.controls.touch = { enabled: null }; // null = auto-detect
    rowTouchMode();
    // Touch overlay exposes dedicated Dock/Map/Log/Star/Pause buttons (not only flight sticks).
    pane.appendChild(el('p', 'sf-muted', 'Virtual sticks: left = fly, right = aim; buttons = fire, mine, boost, dock, Map, Log (Mission Log), Star, Pause. Auto-enabled on touch devices.'));
  },

  _renderFixedShortcuts(pane) {
    pane.appendChild(el('h2', null, 'Ship/System Shortcuts'));
    const grid = el('div', 'sf-grid2 sf-controls-fixed-shortcuts');
    CONTROL_SHORTCUTS.forEach((shortcut) => {
      grid.appendChild(el('div', 'v', shortcut.label));
      grid.appendChild(el('div', 'k', shortcut.key));
      grid.appendChild(el('div', 'sf-muted', shortcut.note));
    });
    pane.appendChild(grid);
    pane.appendChild(el('p', 'sf-muted', 'Flight keys above are rebindable here; these interface shortcuts follow the shared binding registry.'));
  },

  // Live rebind UI for flight actions. Reads defaults from input.js + any saved overrides in
  // settings.controls.bindings. Capture-on-click: a clicked button enters "listening" mode and the
  // next keydown sets the binding (with conflict detection — can't bind the same key to two actions
  // in the movement cluster). Escape cancels capture, Backspace clears the binding to default.
  _renderControlsRebind(ctx, pane) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = { bindings: null };
    const { base, live } = mergedBindingsFor(s);

    const grid = el('div', 'sf-grid2');
    grid.style.gridTemplateColumns = '1fr 140px';
    REBINDABLE.forEach((action) => {
      const label = el('div', 'v', REBIND_LABELS[action] || action);
      const btn = el('button', 'sf-btn sf-bind-btn');
      btn.style.minWidth = '120px';
      const codes = live[action] || [];
      const keyText = codes.map(humanizeCode).join(' / ') || '—';
      // A bare digit in the mono face reads as "Θ" at this size; use the UI face for digit keys.
      if (/^\d$/.test(keyText)) btn.classList.add('sf-bind-btn--digit');
      btn.textContent = keyText;
      btn.addEventListener('click', () => this._capture(ctx, btn, action, live, grid, base));
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
      s.controls.bindings = null;
      s.controls.masslineBindingProfile = MASSLINE_BINDING_PROFILE_SPACE;
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
  _capture(ctx, btn, action, live, grid, base) {
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
        this._commitBind(ctx, action, null, live, grid, base);
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
      this._commitBind(ctx, action, ev.code, live, grid, base);
      done(true);
    };
    const onClickAway = (ev) => { if (ev.target !== btn) done(false); };
    this._activeCapture = done;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClickAway, true);
  },

  // Persist a new primary binding for `action` into settings.controls.bindings. We preserve any
  // secondary code (e.g. ArrowUp alongside KeyW) so arrow players keep working after a rebind.
  _commitBind(ctx, action, code, live, grid, base) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = {};
    if (!s.controls.bindings) s.controls.bindings = {};
    const schemeBase = base || schemeBindingsFor(s);
    const def = (schemeBase && schemeBase[action]) || DEFAULT_BINDINGS[action] || [];
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
