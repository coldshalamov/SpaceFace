import { paneBuilder } from '../views/settingsControls.js';
export { bindCommittedRange } from '../views/settingsControls.js';
// Settings screen (ARCHITECTURE §3.3, §5; design/specs/09).
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, settings): the world behind at the
// menu scrim; a left column of section words; the chosen section's controls as rows with hairlines,
// each a label and its value; toggles are two words; nothing is a slider unless it is a number.
// Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS.
// Sections: Audio / Video / Gameplay / Access / Controls. Every change writes state.settings and
// emits settings:changed {section,key,value,persist?} (audio/render/save listen + live-apply/profile-persist).
// UI reads state.settings for display; the write to state.settings is the UI/settings
// module's own owned subtree (§3.3 owner: ui/settings), so writing it here is in-scope.

import {
  DEFAULTS as INPUT_DEFAULTS,
  formatBindingCode,
} from '../../systems/input.js';
import {
  GAMEPAD_BUTTON_LABELS,
  findGamepadBindConflict,
  resolveGamepadBindings,
} from '../../systems/gamepad.js';
import { massline2Flag } from '../../data/featureFlags.js';
import { MASSLINE_BINDING_PROFILE_SPACE } from '../../core/graphicsProfileBootstrap.js';
import { DEFAULT_BLOOM_STRENGTH } from '../../render/bloom.js';
import {
  DEFAULT_QUALITY_PRESET,
  QUALITY_PRESETS,
  applyQualityPreset,
  createFrameCap,
  frameCapLabel,
  normalizeFrameCap,
} from '../../render/adaptiveQuality.js';
import { BINDINGS } from '../bindings.js';
import { setGamepadCaptureHandler } from '../bindings.js';
import { LANGUAGE_OPTIONS, gameLocalization, setGameLocale } from '../../localization/gameLocalization.js';
import { el, words, settle, cue } from '../kit/index.js';

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

const TABS = ['Audio', 'Video', 'Gameplay', 'Access', 'Controls'];

// The locale the picker shows: the player's choice when set, otherwise the live runtime locale.
function chosenLocale(settings) {
  const chosen = settings && settings.locale;
  return chosen || gameLocalization.locale || 'en-US';
}

let refs = null;
// One frame-cap controller for the whole screen. It resolves the effective cap (honouring VSync)
// and publishes it to state.render.frameCap; it never rewrites settings.video, so the persisted
// request and the live value stay separate. TODO(renderer): the render-frame scheduler is outside
// this leaf's write set and does not yet consume state.render.frameCap.
let frameCapController = null;

function publishFrameCap(ctx) {
  const state = ctx && ctx.state;
  if (!state) return null;
  if (!state.render) state.render = {};
  const vd = (state.settings && state.settings.video) || {};
  if (!frameCapController) {
    frameCapController = createFrameCap({
      vsync: vd.vsync !== false,
      apply: (cap) => { state.render.frameCap = cap; },
    });
  }
  frameCapController.setVsync(vd.vsync !== false);
  return frameCapController.setCap(vd.frameCap);
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

// PQ-164.01 pad remap. Every gamepad action is rebindable; labels describe the verb, not the
// default button (the live resolved map prints the button on the right of each row).
const GAMEPAD_REBINDABLE = [
  'accept', 'cancel', 'massline', 'fire', 'mine', 'boost', 'brake', 'cycleTarget', 'autoTarget',
  'map', 'codex', 'pause', 'countermeasure', 'travelBurn', 'tabPrev', 'tabNext',
];
const GAMEPAD_REBIND_LABELS = {
  accept: 'Accept / dock',
  cancel: 'Back / cancel',
  massline: 'Massline: tap latch/cut; hold line control',
  fire: 'Fire',
  mine: 'Mine beam (analog trigger)',
  boost: 'Boost',
  brake: 'Brake / reverse thrust',
  cycleTarget: 'Cycle target',
  autoTarget: 'Auto-target / draw-to-fly toggle',
  map: 'Star map',
  codex: 'Codex / journal',
  pause: 'Pause menu',
  countermeasure: 'Countermeasure',
  travelBurn: 'Travel drive (burn latch)',
  tabPrev: 'Station tab: previous',
  tabNext: 'Station tab: next',
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

/**
 * The pane's row builders (Task B §1.3). Rows are `k-row k-row--static` in a `k-rows` list: the label
 * at body size 62 % on the left, the control on the right. A section header is a `k-caps` row; a note
 * is a sentence between lists.
 */

export const settingsScreen = {
  id: 'settings',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Settings');

    // Title and the one sentence naming the live profile.
    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title', 'Settings'));
    title.appendChild(el('p', 'k-t-emph k-62', 'Saved with your profile.'));
    rootEl.appendChild(title);

    // The section words down the left. `dom.words` owns the arrow-key roving; the list is the
    // tablist and each word a tab (`.sf-tabbar` / `.sf-tab` kept as hooks).
    const pane = el('div', 'k-stage k-stage--scroll sf-settings-pane');
    pane.id = 'sf-settings-pane';
    pane.setAttribute('role', 'tabpanel');
    const hang = el('div', 'k-hang');
    const bar = words(TABS.map((t) => ({ action: 'tab:' + t, label: t, current: t === 'Audio' })), {
      size: 'menu', ariaLabel: 'Settings categories',
      onPick: (action) => this._select(ctx, action.slice('tab:'.length)),
    });
    bar.classList.add('sf-tabbar');
    bar.setAttribute('role', 'tablist');
    const tabBtns = {};
    for (const b of bar.querySelectorAll('.k-word')) {
      const t = b.dataset.action.slice('tab:'.length);
      b.classList.add('sf-tab');
      b.id = `sf-settings-tab-${t.toLowerCase()}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', pane.id);
      b.parentElement.setAttribute('role', 'presentation');
      tabBtns[t] = b;
    }
    hang.appendChild(bar);
    rootEl.appendChild(hang);
    rootEl.appendChild(pane);

    const foot = el('footer', 'k-foot');
    const back = el('button', 'k-word k-word--emph', 'Back');
    back.type = 'button'; back.dataset.action = 'back';
    back.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });
    foot.appendChild(back);
    rootEl.appendChild(foot);

    refs = { root: rootEl, title, hang, pane, foot, tabBtns, active: 'Audio' };
    this._select(ctx, 'Audio', { silent: true });
  },

  _select(ctx, tab, { silent = false } = {}) {
    if (!refs || !TABS.includes(tab)) return;
    refs.active = tab;
    Object.entries(refs.tabBtns).forEach(([t, b]) => {
      const active = t === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', String(active));
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
    });
    refs.pane.setAttribute('aria-labelledby', refs.tabBtns[tab].id);
    this._render(ctx);
    if (!silent) {
      try { settle(refs.pane, { from: 'left', state: 'settings:' + tab }); } catch (e) { /* motion is cosmetic */ }
    }
  },

  _set(ctx, section, key, value, persist = true) {
    const s = ctx.state.settings;
    if (section && s[section] && typeof s[section] === 'object') s[section][key] = value;
    else s[key] = value;
    const payload = { section, key, value };
    if (persist === false) payload.persist = false;
    ctx.bus.emit('settings:changed', payload);
  },

  // Apply a Low/Medium/High preset. `applyQualityPreset` writes only presentation keys, then we
  // publish each changed key so the renderer live-applies exactly what moved.
  _applyPreset(ctx, presetId) {
    const applied = applyQualityPreset(ctx.state.settings, presetId);
    if (!applied) return;
    const video = ctx.state.settings.video;
    for (const key of applied.changed) {
      if (key === 'qualityPreset') this._set(ctx, 'video', 'qualityPreset', applied.preset);
      else this._set(ctx, 'video', key, video[key]);
    }
    this._render(ctx);
  },

  _render(ctx) {
    if (!refs) return;
    const pane = refs.pane;
    pane.innerHTML = '';
    const s = ctx.state.settings;
    const build = paneBuilder(pane);

    const rowSlider = (label, get, min, max, step, fmt, onInput) => build.slider(label, get, min, max, step, fmt, onInput);
    const rowToggle = (label, get, onChange) => build.toggle(label, get, onChange);
    const rowSelect = (label, get, options, onChange) => build.select(label, get, options, onChange);

    const pct = (v) => Math.round(v * 100) + '%';

    if (refs.active === 'Audio') {
      const a = s.audio;
      // First control: Mute all, so silence is always one press away.
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
      // One-click preset: writes the adaptive-quality tier (render scale, particle density, render
      // graph) and keeps the individual rows below as the source of truth for advanced edits.
      rowSelect('Quality preset', () => vd.qualityPreset || DEFAULT_QUALITY_PRESET,
        QUALITY_PRESETS.map((preset) => [preset.id, preset.label]),
        (value) => this._applyPreset(ctx, value));
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
      rowToggle('VSync', () => vd.vsync, (v) => { this._set(ctx, 'video', 'vsync', v); publishFrameCap(ctx); });
      // Frame cap 30 / 60 / 120 / off. The effective cap is the request clamped to the display
      // refresh when VSync is on; off means the display refresh (VSync) or uncapped (VSync off).
      rowSelect('Frame cap', () => String(normalizeFrameCap(vd.frameCap)), [0, 30, 60, 120].map((cap) => [String(cap), frameCapLabel(cap)]),
        (value) => {
          vd.frameCap = normalizeFrameCap(value);
          this._set(ctx, 'video', 'frameCap', vd.frameCap);
          publishFrameCap(ctx);
        });
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
        build.note('The release marker reads RELEASE when the timing window opens; motion and color are optional reinforcement.');
      }
      rowSelect('Autosave', () => String(g.autosaveIntervalS), [['0', 'Off'], ['60', '60s'], ['120', '120s'], ['300', '300s']], (v) => this._set(ctx, 'gameplay', 'autosaveIntervalS', parseInt(v, 10)));
      rowToggle('Tutorial hints', () => g.tutorialHints, (v) => this._set(ctx, 'gameplay', 'tutorialHints', v));
      rowToggle('Damage numbers', () => !!g.damageNumbers, (v) => this._set(ctx, 'gameplay', 'damageNumbers', v));
    } else if (refs.active === 'Access') {
      const ac = s.accessibility || (s.accessibility = { colorblindMode: 'none', highContrast: false, flashReduce: false, dyslexiaFont: false,
        motionPreference: 'system', captions: true, captionSize: 'medium', captionBackground: true });
      // Language: the default route is English; choosing here switches the live locale and re-renders
      // every mounted screen through the shared document bridge (no reload).
      rowSelect('Language', () => chosenLocale(s), LANGUAGE_OPTIONS.map((option) => [option.id, option.label]),
        (value) => {
          setGameLocale(value);
          this._set(ctx, null, 'locale', value);
          this._render(ctx);
        });
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
      build.note('Colorblind mode also recolors radar blips and adds redundant shapes.');
    } else if (refs.active === 'Controls') {
      rowSelect('Control Scheme', () => s.gameplay.controlScheme || 'pilot',
        [['pilot', 'Pilot (keyboard steers, mouse aims)'], ['helm-assist', 'Helm Assist (mouse steering)'], ['classic', 'Classic Throttle']],
        (v) => {
          this._set(ctx, 'gameplay', 'controlScheme', v);
          // Explicit choice: stop the one-time pilot migration (saveSystem) from overriding it.
          this._set(ctx, 'gameplay', 'controlSchemeV2', true);
          this._render(ctx);
        });
      build.note('Press a flight key to rebind it, then press a new key. Fixed ship/system shortcuts are listed below so you do not have to leave Settings to find them.');
      // Each section builds its own lists in order; the pane is one column.
      this._renderControlsRebind(ctx, pane);
      this._renderFixedShortcuts(pane);
      this._renderGamepadSettings(ctx, pane);
    }
  },

  _renderGamepadSettings(ctx, pane, build = paneBuilder(pane)) {
    build.break();
    build.header('Gamepad');
    const s = ctx.state.settings;
    if (!s.controls) s.controls = { bindings: null, flightMode: 'assisted' };
    if (!s.controls.gamepad) s.controls.gamepad = { enabled: true, deadzone: 0.12, invertY: false };
    const gp = () => s.controls.gamepad;

    build.toggle('Gamepad enabled', () => !!gp().enabled, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp(), enabled: v }));
    build.slider('Stick deadzone', () => gp().deadzone, 0, 0.5, 0.01, (x) => Math.round(x * 100) + '%', (v, persist) => this._set(ctx, 'controls', 'gamepad', { ...gp(), deadzone: v }, persist));
    build.toggle('Invert right-stick Y', () => !!gp().invertY, (v) => this._set(ctx, 'controls', 'gamepad', { ...gp(), invertY: v }));
    // Matches src/systems/gamepad.js ACTION_MAP + UI route: Start/menu → pause only;
    // Mission Log is chosen from the Pause menu (no direct gamepad missionLog action).
    build.note('Default layout: left stick fly, right stick aim, RT fire, LT mine, RB boost, LB brake, R3 countermeasure, A/Cross Massline (dock/accept when prompted), X/Square target, D-pad up auto-target (right stick draw-to-fly), View star map, Y/Triangle codex, Start → Pause → Mission Log.');

    // PQ-164.01 pad remap: capture-on-press rows, same grammar as the flight keys above — press
    // a word, then press the pad button. Conflict detection honours the designed context shares
    // (A/Cross accept+Massline, LB brake+tab, RB boost+tab); same-context doubles are denied.
    build.header('Gamepad Buttons');
    const padMap = resolveGamepadBindings(s);
    GAMEPAD_REBINDABLE.forEach((action) => {
      const names = padMap[action] || [];
      const keyText = names.map((n) => GAMEPAD_BUTTON_LABELS[n] || n).join(' / ') || '—';
      build.key(GAMEPAD_REBIND_LABELS[action] || action, keyText,
        (btn) => this._capturePad(ctx, btn, action, padMap));
    });
    build.word('Reset pad layout', () => {
      this._set(ctx, 'controls', 'gamepad', { ...gp(), bindings: null });
      this._render(ctx);
    }, 'Press a row to rebind; Backspace restores one row.');
    if (gp().bindings) build.note('Custom pad layout active — the rows above are your live map, not the defaults.');

    // Touch (P1-12): virtual dual-stick + buttons for touchscreens. Auto-detects on touch devices;
    // this tri-state lets the player force-enable (e.g. a touchscreen laptop), force-disable, or
    // return to automatic detection.
    build.header('Touch');
    if (!s.controls.touch) s.controls.touch = { enabled: null }; // null = auto-detect
    const touchMode = () => {
      const cfg = s.controls.touch || {};
      return cfg.enabled == null ? 'auto' : (cfg.enabled ? 'on' : 'off');
    };
    const commitTouchValue = (next) => {
      const tp = ctx.touch;
      if (tp && typeof tp.persistEnabled === 'function') {
        tp.persistEnabled(next);
      } else {
        this._set(ctx, 'controls', 'touch', { ...(s.controls.touch || {}), enabled: next });
      }
    };
    build.choice('Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], touchMode,
      (mode) => commitTouchValue(mode === 'auto' ? null : mode === 'on'));
    // Touch overlay exposes dedicated Dock/Map/Log/Star/Pause buttons (not only flight sticks).
    build.note('Virtual sticks: left = fly, right = aim; buttons = fire, mine, boost, dock, Map, Log (Mission Log), Star, Pause. Auto-enabled on touch devices.');
  },

  _renderFixedShortcuts(pane, build = paneBuilder(pane)) {
    build.break();
    const header = build.header('Ship/System Shortcuts');
    header.parentElement.classList.add('sf-controls-fixed-shortcuts');
    CONTROL_SHORTCUTS.forEach((shortcut) => {
      build.shortcut(shortcut.label, shortcut.key, shortcut.note);
    });
    build.note('Flight keys above are rebindable here; these interface shortcuts follow the shared binding registry.');
  },

  // Live rebind UI for flight actions. Reads defaults from input.js + any saved overrides in
  // settings.controls.bindings. Capture-on-press: a pressed word enters "listening" mode and the
  // next keydown sets the binding (with conflict detection — can't bind the same key to two actions
  // in the movement cluster). Escape cancels capture, Backspace clears the binding to default.
  _renderControlsRebind(ctx, pane, build = paneBuilder(pane)) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = { bindings: null };
    const { base, live } = mergedBindingsFor(s);

    build.break();
    REBINDABLE.forEach((action) => {
      const codes = live[action] || [];
      const keyText = codes.map((code) => formatBindingCode(code) || '—').join(' / ') || '—';
      // `.sf-bind-btn--digit` marks a bare digit key (a hook kept from the legacy chip styling).
      build.key(REBIND_LABELS[action] || action, keyText,
        (btn) => this._capture(ctx, btn, action, live, base),
        { digit: /^\d$/.test(keyText) });
    });

    // reset word
    build.word('Reset to defaults', () => {
      s.controls.bindings = null;
      s.controls.masslineBindingProfile = MASSLINE_BINDING_PROFILE_SPACE;
      ctx.bus.emit('settings:changed', { section: 'controls', key: 'bindings', value: null });
      this._render(ctx);
    }, 'Arrow keys always also work for movement.');
  },

  // Capture the next keydown as the new binding for `action`. Only ONE code per action in the UI
  // (we keep arrow-cluster compatibility by leaving movement's secondary arrow code alone if the
  // primary is being rebound — simplest mental model: "set the WASD key").
  _capture(ctx, btn, action, live, base) {
    if (this._capturing) return;
    this._capturing = true;
    const prev = btn.textContent;
    btn.textContent = 'Press a key…';
    btn.classList.add('sf-bind-btn--capture');
    btn.setAttribute('aria-pressed', 'true'); // the kit lights a pressed word: this one is listening

    const done = (commit) => {
      this._capturing = false;
      btn.classList.remove('sf-bind-btn--capture');
      btn.removeAttribute('aria-pressed');
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
        this._commitBind(ctx, action, null, live, base);
        done(true);
        return;
      }
      // Conflict check: don't let the same code be the PRIMARY (index 0) of two rebindable actions.
      for (const other of REBINDABLE) {
        if (other === action) continue;
        if ((live[other] || [])[0] === ev.code) {
          btn.textContent = 'In use: ' + (REBIND_LABELS[other] || other);
          cue('deny');
          setTimeout(() => done(false), 900);
          return;
        }
      }
      this._commitBind(ctx, action, ev.code, live, base);
      done(true);
    };
    const onClickAway = (ev) => { if (ev.target !== btn) done(false); };
    this._activeCapture = done;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClickAway, true);
  },

  // Persist a new primary binding for `action` into settings.controls.bindings. We preserve any
  // secondary code (e.g. ArrowUp alongside KeyW) so arrow players keep working after a rebind.
  _commitBind(ctx, action, code, live, base) {
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
    this._render(ctx); // refresh the rows to show the new label
  },

  // --- Gamepad rebinding (PQ-164.01) ---
  // Capture the next pad button press as the new binding for `action`. Pad buttons are not DOM
  // events: the press edge is recorded by src/systems/gamepad.js and forwarded by the UI input
  // tick (src/ui/input.js) to the capture handler registered on the binding registry. While the
  // handler is registered the pad's actions are inert (captureMode), so the press cannot also
  // fire its current verb. Escape cancels, Backspace restores the default, a 30 s timeout or a
  // click away ends the listen so a pad-only player is never trapped in capture.
  _capturePad(ctx, btn, action, liveMap) {
    if (this._capturing) return;
    this._capturing = true;
    // Take effect immediately — don't wait a frame for the UI tick to mirror the handler.
    if (ctx.gamepad) ctx.gamepad.captureMode = true;
    const prev = btn.textContent;
    btn.textContent = 'Press a pad button…';
    btn.classList.add('sf-bind-btn--capture');
    btn.setAttribute('aria-pressed', 'true'); // listening

    const done = (commit) => {
      this._capturing = false;
      btn.classList.remove('sf-bind-btn--capture');
      btn.removeAttribute('aria-pressed');
      setGamepadCaptureHandler(null);
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onClickAway, true);
      this._activeCapture = null;
      if (!commit) btn.textContent = prev;
    };
    const timer = setTimeout(() => done(false), 30000);
    const onKey = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.code === 'Escape') { done(false); return; }
      if (ev.code === 'Backspace' || ev.code === 'Delete') {
        this._commitPadBind(ctx, action, null);
        done(true);
        return;
      }
      // Any other key is not a pad button — keep listening.
    };
    setGamepadCaptureHandler((stdName) => {
      // Conflict check: the row being rebound cannot conflict with itself; test the candidate
      // button against every other action's claim under the live resolved map.
      const others = { ...liveMap, [action]: [] };
      const conflict = findGamepadBindConflict(others, action, stdName);
      if (conflict) {
        btn.textContent = 'In use: ' + (GAMEPAD_REBIND_LABELS[conflict] || conflict);
        cue('deny');
        setTimeout(() => done(false), 900);
        return;
      }
      this._commitPadBind(ctx, action, stdName);
      done(true);
    });
    const onClickAway = (ev) => { if (ev.target !== btn) done(false); };
    this._activeCapture = done;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onClickAway, true);
  },

  // Persist a pad override into settings.controls.gamepad.bindings — a sparse action ->
  // [std button name] map layered over the default layout by resolveGamepadBindings. The whole
  // controls subtree rides the settings profile, so the remap survives boot and old saves.
  _commitPadBind(ctx, action, stdName) {
    const s = ctx.state.settings;
    if (!s.controls) s.controls = {};
    if (!s.controls.gamepad) s.controls.gamepad = { enabled: true, deadzone: 0.12, invertY: false };
    const overrides = { ...(s.controls.gamepad.bindings || {}) };
    if (stdName == null) delete overrides[action];
    else overrides[action] = [stdName];
    const bindings = Object.keys(overrides).length ? overrides : null;
    this._set(ctx, 'controls', 'gamepad', { ...s.controls.gamepad, bindings });
    this._render(ctx); // refresh the rows to show the new glyph
  },

  onShow(ctx) {
    if (!refs) return;
    cue('open');
    this._render(ctx);
    rootReady(refs.root);
    try {
      settle(refs.title, { from: 'top', state: 'settings:open' });
      settle(refs.hang, { from: 'left', state: 'settings:open' });
      settle(refs.pane, { from: 'right', state: 'settings:open' });
      settle(refs.foot, { from: 'bottom', state: 'settings:open' });
    } catch (e) { /* motion is cosmetic */ }
    try { refs.tabBtns[refs.active].focus(); } catch (e) {}
  },
  // If the screen closes mid key-capture, bail out so the global keydown/mousedown listeners
  // don't leak / swallow keys after the player navigates away.
  onHide() {
    cue('close');
    if (this._capturing && this._activeCapture) this._activeCapture(false);
  },
  // IMPORTANT: must be a no-op. uiRoot.frame() calls screenManager.refreshTop() every ~0.3s for
  // any open screen; if this rebuilt the DOM it would destroy a slider/select mid-drag (the
  // "can't drag below 3% / have to keep the mouse on the line" bug). The pane is fully
  // event-driven — its own controls update their own value labels — so there is nothing to refresh.
  refresh() {},
  dispose() { refs = null; },
};

/** A screen with no 3D mount is "ready" as soon as it shows (the capture seam's photograph-me signal). */
function rootReady(rootEl) {
  if (rootEl) rootEl.dataset.kReady = '1';
}
