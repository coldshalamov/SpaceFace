// Accessibility controller (V2 §9/§12 — vestibular/visual/cognitive support).
//
// WIRED. main.js imports applyAccessibility and calls it on boot + every `settings:changed` +
// `save:loaded`. styles/accessibility.css is <link>d in index.html after ui.css. radar.js imports
// semanticColor / semanticShape to recolor canvas blips under colorblind modes and draw redundant
// shapes. The settings screen exposes an "Access" tab with all toggles.
// Nothing here mutates sim state; it only toggles document-root classes / CSS custom properties
// and exposes runtime booleans for vfx/feel/camera to read.
//
// Why this lives in JS at all: the radar (src/ui/radar.js) draws blips with hardcoded JS hex via
// g.fillStyle — CSS classes can never recolor it. So the colorblind-safe blip palette + redundant
// shapes are defined HERE as data, and the canvas systems consume the registry. The CSS handles the
// DOM/CSS-var-driven UI (status bars, badges, alerts); JS handles the canvas.
//
// TWO SEPARATE motion flags (accessibility contract):
//   - motionReduced  → vestibular: camera shake / FOV punch / hit-stop / parallax. This is the SAME
//     field feel.js:131 and vfx.js:674 already read: settings.video.motionReduce. We do NOT fork a
//     second source of truth — getMotionReduced() derives from that exact field so all three agree.
//   - flashReduced   → photosensitive: strobing/flash/rapid opacity pulses (death flash, alarm blink).
//     This is genuinely NEW — grep confirms nothing reads a flash flag today — so it is our net-new
//     field (settings.accessibility.flashReduce), surfaced via getFlashReduced() for vfx to honor.

// ---------------------------------------------------------------------------------------------------
// Runtime-readable state (other systems poll these every frame; keep them plain module-scope booleans).
// ---------------------------------------------------------------------------------------------------
let _motionReduced = false;   // mirrors settings.video.motionReduce (existing field)
let _flashReduced = false;    // settings.accessibility.flashReduce (new field)
let _motionMediaQuery = null;
let _motionMediaListener = null;
let _motionSettings = null;
let _motionRoot = null;
let _forcedColorsActive = false;
let _forcedColorsMediaQuery = null;
let _forcedColorsMediaListener = null;
let _forcedColorsRoot = null;

/** True when vestibular motion (shake / FOV punch / hit-stop / parallax) should be suppressed.
 *  Mirrors settings.video.motionReduce — the same field feel.js & vfx.js already consult. */
export function getMotionReduced() { return _motionReduced; }

/** True when flashing / strobing / rapid opacity pulses should be suppressed (photosensitivity).
 *  Distinct from motion-reduce: a player may want a steady camera yet still tolerate no strobe. */
export function getFlashReduced() { return _flashReduced; }

/** Runtime OS/browser forced-colors state. This is deliberately not a saved setting. */
export function getForcedColorsActive() { return _forcedColorsActive; }

// ---------------------------------------------------------------------------------------------------
// Colorblind palettes. Keyed by mode; each maps the document-root to a set of CSS custom properties.
// These drive the CSS-var-based UI (status bars, badges, alert severities). `none` is the identity
// palette (the game's shipped colors from styles/ui.css:8-9) so applyAccessibility can always reset.
//
// Values are Okabe-Ito-derived / Bang-Wong colorblind-safe hues, nudged to fit the cyan/orange theme.
// We deliberately keep hull≈red-orange, shield≈blue, energy≈yellow but maximize luminance separation so
// the three remain distinguishable under each dichromacy — and pair every state with a SHAPE/ICON below
// so color is never the sole channel.
// ---------------------------------------------------------------------------------------------------
export const COLORBLIND_MODES = ['none', 'protanopia', 'deuteranopia', 'tritanopia'];
export const MOTION_PREFERENCES = ['system', 'reduce', 'full'];
export const CAPTION_SIZES = ['small', 'medium', 'large'];

const PALETTES = {
  none: {
    // identity — the shipped theme (styles/ui.css:8-9). Listed so we can hard-reset every var.
    '--sf-hostile': '#ff5470', '--sf-neutral': '#9aa8bc', '--sf-friendly': '#62e08a', '--sf-ally': '#39d0ff',
    '--sf-hull': '#ff5470', '--sf-shield': '#39d0ff', '--sf-energy': '#ffd84a', '--sf-cargo': '#7af7d0',
    '--sf-warn': '#ffb347', '--sf-danger': '#ff5470', '--sf-good': '#62e08a',
  },
  // Protan (no L-cones): red is dark/ambiguous. Push hostile toward orange-vermillion, friendly toward
  // bluish-green, keep shield a strong blue; widen luminance gaps.
  protanopia: {
    '--sf-hostile': '#ff7a18', '--sf-neutral': '#9aa8bc', '--sf-friendly': '#00b7c2', '--sf-ally': '#4db4ff',
    '--sf-hull': '#ff7a18', '--sf-shield': '#4db4ff', '--sf-energy': '#f0e442', '--sf-cargo': '#00b7c2',
    '--sf-warn': '#f0e442', '--sf-danger': '#ff7a18', '--sf-good': '#00b7c2',
  },
  // Deutan (no M-cones): red/green confusion. Same strategy — vermillion vs sky-blue vs amber.
  deuteranopia: {
    '--sf-hostile': '#ff6f3c', '--sf-neutral': '#9aa8bc', '--sf-friendly': '#26c6da', '--sf-ally': '#56b4e9',
    '--sf-hull': '#ff6f3c', '--sf-shield': '#56b4e9', '--sf-energy': '#f0e442', '--sf-cargo': '#26c6da',
    '--sf-warn': '#f0e442', '--sf-danger': '#ff6f3c', '--sf-good': '#26c6da',
  },
  // Tritan (no S-cones): blue/yellow confusion. Trade the yellow/blue axis for a red/cyan/pink axis.
  tritanopia: {
    '--sf-hostile': '#ff4d6d', '--sf-neutral': '#aeb6bf', '--sf-friendly': '#2dd4bf', '--sf-ally': '#0aa3c2',
    '--sf-hull': '#ff4d6d', '--sf-shield': '#0aa3c2', '--sf-energy': '#ff9d2f', '--sf-cargo': '#2dd4bf',
    '--sf-warn': '#ff9d2f', '--sf-danger': '#ff4d6d', '--sf-good': '#2dd4bf',
  },
};

// ---------------------------------------------------------------------------------------------------
// SEMANTIC PALETTE REGISTRY — color + REDUNDANT SHAPE/ICON per state. This is the artifact the lead
// imports into radar.js (and could use in hud.js) so that color is never the sole channel.
//
// REAL semantic states + the file:line where color is currently the ONLY differentiator:
//
//   RADAR BLIPS (src/ui/radar.js) — ALL ship/drone blips are identical 3.2px SQUARES (radar.js:102-103);
//   hostile vs neutral vs friendly is conveyed by FILL COLOR ALONE (blipColor radar.js:23-35, COL:18-21,
//   FACTION_COLOR:13-17). Asteroid (small dot, radar.js:99), pickup (diamond, :97) and station (square,
//   :100-101) already have distinct shapes; the gap is ship hostility. Each ship state below therefore
//   carries a distinct `shape` the lead can draw so a protanope can read threat without color.
//     - hostile : e.team !== playerTeam && e.team !== 0           (radar.js:30,33)
//     - neutral : team 0 / unaligned                              (radar.js:34, COL.neutral :19)
//     - friendly: same faction tint, same/ally team              (radar.js:31 returns FACTION_COLOR)
//     - ally    : the player triangle + team-0 allies            (COL.player :19)
//     - target  : currently only a white ring (radar.js:105-108) — already shape-redundant, kept here.
//
//   STATUS BARS (src/ui/hud.js barDefs hud.js:61-67; gradients in src/ui/uiRoot.js:315-319) — hull /
//   shield / energy / heat / boost are distinguished by BAR COLOR + a fixed text label (HULL/SHLD/…).
//   The label already gives a non-color channel, so bars are lower-risk than blips; we still register
//   colorblind-safe hues + an icon for parity and for any future label-less compact HUD.
//
//   ALERT SEVERITY (src/ui/alerts.js, hud.js raises sev:'warn'|'danger') — severity is color-coded;
//   we pair each with an icon glyph so a flashing red vs amber strip is also a ⊘ vs ⚠ strip.
//
// `shape` values are a small enum the canvas code can switch on: 'triangle' (hostile — reads as a
// threat caret), 'square' (neutral), 'diamond' (friendly), 'chevron' (ally heading), 'ring' (target).
//
// ---------------------------------------------------------------------------------------------------
// TWO ICON CHANNELS, AND WHY BOTH MUST STAY
//
// `icon`  — a single PLAIN-TEXT character, for `textContent` call sites.
// `glyph` — a key into `station/icons.js`, for `innerHTML` call sites that want vector art.
//
// They are not redundant, and `icon` must never be replaced with SVG markup. At least one consumer
// writes it as text: `hud.js` builds DOCTRINE_TELL_ICON from `.icon` and renders it through
// `setText(slot.iconEl, icon)`. Assigning SVG markup there prints a literal `<svg viewBox=…>` string
// across the combat HUD — and `check:ui-identity` stays green while it happens, because that check
// verifies the palette is *imported*, not that its glyphs render. If you add a consumer, pick the
// channel that matches how you write it into the DOM.
//
// J05 de-emojified the `icon` column (was 🛡 ⚡ ♨ ⛔). Those four have Unicode
// Emoji_Presentation=Yes, so the OS substituted a full-colour emoji font mid-sentence and the strips
// shipped with cartoon glyphs. Replacements are geometric text-presentation characters that match
// the ▲ ■ ◆ set already here. `⚠` is kept deliberately: it is Emoji_Presentation=No, renders as
// text everywhere, and is the standard warning mark.
// ---------------------------------------------------------------------------------------------------
export const SEMANTIC_PALETTE = {
  // --- radar / target states (canvas — color was the sole channel; shape is the fix) ---
  hostile:  { color: '#ff5470', cssVar: '--sf-hostile',  shape: 'triangle', icon: '▲', glyph: 'target',      label: 'Hostile' },
  neutral:  { color: '#9aa8bc', cssVar: '--sf-neutral',  shape: 'square',   icon: '■', glyph: 'info',        label: 'Neutral' },
  friendly: { color: '#62e08a', cssVar: '--sf-friendly', shape: 'diamond',  icon: '◆', glyph: 'info',        label: 'Friendly' },
  ally:     { color: '#39d0ff', cssVar: '--sf-ally',     shape: 'chevron',  icon: '➤', glyph: 'chevron',     label: 'Ally / You' },
  target:   { color: '#ffffff', cssVar: null,            shape: 'ring',     icon: '◎', glyph: 'target',      label: 'Target' },

  // --- status bars (label-redundant today; registered for completeness + colorblind hues) ---
  hull:     { color: '#ff5470', cssVar: '--sf-hull',     shape: 'bar',      icon: '▣', glyph: 'slot_hull',   label: 'Hull' },
  shield:   { color: '#39d0ff', cssVar: '--sf-shield',   shape: 'bar',      icon: '◇', glyph: 'shield',      label: 'Shield' },
  energy:   { color: '#ffd84a', cssVar: '--sf-energy',   shape: 'bar',      icon: '↯', glyph: 'energy',      label: 'Energy (cap)' },
  // NOTE: the game has no "armor" stat — hull/shield/energy(=cap)/heat/boost are the real bars
  // (gameState.js:14, hud.js:61-67). 'energy' IS the capacitor ('cap' in entity state).
  heat:     { color: '#ff8a3d', cssVar: '--sf-warn',     shape: 'bar',      icon: '≋', glyph: 'heat',        label: 'Heat' },
  boost:    { color: '#c98cff', cssVar: '--sf-cargo',    shape: 'bar',      icon: '»', glyph: 'boost',       label: 'Boost' },

  // --- alert severities (color-coded strips; icon makes them non-color-only) ---
  // ⚠ carries \uFE0E (text presentation): it defaults to color emoji on emoji-font platforms,
  // which would break the monochrome text channel this palette feeds.
  warning:  { color: '#ffb347', cssVar: '--sf-warn',     shape: 'tri-bang', icon: '⚠\uFE0E', glyph: 'warning',     label: 'Warning' },
  danger:   { color: '#ff5470', cssVar: '--sf-danger',   shape: 'octagon',  icon: '⊘', glyph: 'danger',      label: 'Danger' },
};

// ---------------------------------------------------------------------------------------------------
// Settings fields exposed by Settings > Access and Settings > Video. This schema is metadata for
// docs, probes, and future UI work; every field below is part of the shipped settings tree.
//
// The accessibility subtree owns the Access toggles. motionReduce stays under settings.video (where
// feel.js/vfx.js read it) and uiScale stays at root —
// applyAccessibility() reconciles by reading from all three locations.
// ---------------------------------------------------------------------------------------------------
export const ACCESSIBILITY_SETTINGS_SCHEMA = [
  {
    key: 'colorblindMode', path: 'accessibility.colorblindMode', type: 'select',
    options: COLORBLIND_MODES, default: 'none', status: 'EXISTS',
    label: 'Colorblind palette', help: 'Recolors radar blips, bars and alerts for dichromacy.',
  },
  {
    key: 'motionPreference', path: 'accessibility.motionPreference', type: 'select',
    options: MOTION_PREFERENCES, default: 'system', status: 'EXISTS',
    label: 'Motion effects', help: 'Follows the operating system or explicitly reduces motion.',
  },
  {
    key: 'captions', path: 'accessibility.captions', type: 'toggle', default: true, status: 'EXISTS',
    label: 'Gameplay captions', help: 'Shows readable text for important audio and gameplay cues.',
  },
  {
    key: 'captionSize', path: 'accessibility.captionSize', type: 'select',
    options: CAPTION_SIZES, default: 'medium', status: 'EXISTS',
    label: 'Caption size', help: 'Changes caption text size without scaling the flight view.',
  },
  {
    key: 'captionBackground', path: 'accessibility.captionBackground', type: 'toggle',
    default: true, status: 'EXISTS', label: 'Solid caption backing',
    help: 'Places captions on an opaque dark panel for consistent contrast.',
  },
  {
    key: 'highContrast', path: 'accessibility.highContrast', type: 'toggle', default: false, status: 'EXISTS',
    label: 'High contrast', help: 'Stronger panel borders, opaque backdrops, brighter text.',
  },
  {
    key: 'flashReduce', path: 'accessibility.flashReduce', type: 'toggle', default: false, status: 'EXISTS',
    label: 'Reduce flashing', help: 'Suppresses strobe / death-flash / alarm-blink (photosensitivity).',
  },
  {
    key: 'dyslexiaFont', path: 'accessibility.dyslexiaFont', type: 'toggle', default: false, status: 'EXISTS',
    label: 'Readable font', help: 'Switches UI to a higher-legibility font with looser spacing.',
  },
  {
    // Separate from flashReduce by design: this one is the vestibular flag. It remains under
    // settings.video so feel.js, vfx.js, and this accessibility adapter all read one source.
    key: 'motionReduce', path: 'video.motionReduce', type: 'toggle', default: false, status: 'EXISTS',
    label: 'Reduce motion', help: 'Suppresses camera shake, FOV punch, hit-stop, and parallax.',
  },
  {
    // Existing root-level UI scale, driven by the Settings > Video slider and the --ui-scale path.
    key: 'uiScale', path: 'uiScale', type: 'slider', min: 0.75, max: 2, step: 0.05, default: 1, status: 'EXISTS',
    label: 'UI scale', help: 'Scales the HUD and menus for readability.',
  },
];

// ---------------------------------------------------------------------------------------------------
// Document-root tokens / classes the CSS reacts to (kept here so the class contract is one source).
// ---------------------------------------------------------------------------------------------------
const PALETTE_CLASSES = COLORBLIND_MODES.filter((m) => m !== 'none').map((m) => 'sf-cb-' + m);
const CAPTION_SIZE_CLASSES = CAPTION_SIZES.map((size) => `sf-caption-size-${size}`);

function normalizedMotionPreference(settings) {
  const explicit = pick(settings, 'accessibility.motionPreference', null);
  if (MOTION_PREFERENCES.includes(explicit)) return explicit;
  // Old profiles had only the effective boolean. Preserve an explicit reduced choice; otherwise
  // migrate to the professional default that follows the operating-system preference.
  return pick(settings, 'video.motionReduce', false) ? 'reduce' : 'system';
}

function systemMotionReduced() {
  if (_motionMediaQuery) return !!_motionMediaQuery.matches;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

function applyMotionPreference(settings, root) {
  const preference = normalizedMotionPreference(settings);
  const reduced = preference === 'reduce' || (preference === 'system' && systemMotionReduced());
  _motionReduced = reduced;
  // video.motionReduce is the existing runtime contract polled by feel/vfx/camera. Keep it as the
  // effective value while accessibility.motionPreference remains the persisted user choice.
  if (settings && settings.video && typeof settings.video === 'object') settings.video.motionReduce = reduced;
  if (root && root.classList) root.classList.toggle('sf-reduce-motion', reduced);
  return { preference, reduced };
}

function bindSystemMotionPreference(settings, root) {
  _motionSettings = settings || null;
  _motionRoot = root || null;
  if (_motionMediaQuery || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  try { _motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)'); }
  catch (_) { return; }
  _motionMediaListener = () => applyMotionPreference(_motionSettings, _motionRoot);
  if (typeof _motionMediaQuery.addEventListener === 'function') {
    _motionMediaQuery.addEventListener('change', _motionMediaListener);
  } else if (typeof _motionMediaQuery.addListener === 'function') {
    _motionMediaQuery.addListener(_motionMediaListener);
  }
}

function systemForcedColorsActive() {
  if (_forcedColorsMediaQuery) return !!_forcedColorsMediaQuery.matches;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return !!window.matchMedia('(forced-colors: active)').matches; }
  catch (_) { return false; }
}

function applyForcedColors(root) {
  _forcedColorsActive = systemForcedColorsActive();
  if (root && root.classList) root.classList.toggle('sf-forced-colors', _forcedColorsActive);
  return _forcedColorsActive;
}

function bindSystemForcedColors(root) {
  _forcedColorsRoot = root || null;
  if (_forcedColorsMediaQuery || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  try { _forcedColorsMediaQuery = window.matchMedia('(forced-colors: active)'); }
  catch (_) { return; }
  _forcedColorsMediaListener = () => applyForcedColors(_forcedColorsRoot);
  if (typeof _forcedColorsMediaQuery.addEventListener === 'function') {
    _forcedColorsMediaQuery.addEventListener('change', _forcedColorsMediaListener);
  } else if (typeof _forcedColorsMediaQuery.addListener === 'function') {
    _forcedColorsMediaQuery.addListener(_forcedColorsMediaListener);
  }
}

// Pull a value from the settings tree by dotted path, tolerating missing intermediates.
function pick(settings, path, fallback) {
  if (!settings) return fallback;
  let v = settings;
  for (const seg of path.split('.')) {
    if (v == null || typeof v !== 'object') return fallback;
    v = v[seg];
  }
  return v === undefined ? fallback : v;
}

/**
 * Apply accessibility settings to the document root. Idempotent — safe to call on boot and on every
 * `settings:changed`. Reads from three locations (so it works before the lead consolidates):
 *   - settings.accessibility.{colorblindMode,highContrast,flashReduce,dyslexiaFont}  (NEW subtree)
 *   - settings.video.motionReduce                                                    (existing)
 *   - settings.uiScale                                                               (existing, root)
 *
 * @param {object} settings  state.settings (or any object with the same shape)
 * @param {Document|HTMLElement} [target=document.documentElement]  root to toggle classes/vars on
 */
export function applyAccessibility(settings, target) {
  const a = settings && settings.accessibility ? settings.accessibility : {};

  // Resolve the runtime-readable flags FIRST, before any DOM work, so getMotionReduced()/getFlashReduced()
  // are correct even on a headless path (no document) or if the early-return below fires. vfx/feel poll
  // these regardless of the DOM.
  _flashReduced = !!a.flashReduce;

  let mode = a.colorblindMode || 'none';
  if (COLORBLIND_MODES.indexOf(mode) < 0) mode = 'none';
  const highContrast = !!a.highContrast;
  const dyslexia = !!a.dyslexiaFont;
  const captions = a.captions !== false;
  const captionSize = CAPTION_SIZES.includes(a.captionSize) ? a.captionSize : 'medium';
  const captionBackground = a.captionBackground !== false;

  const root = target || (typeof document !== 'undefined' ? document.documentElement : null);
  // Bind the additive forced-colors observer first. A few minimal test/embedded matchMedia shims
  // reuse one listener slot for every query; binding motion last preserves the older live contract.
  bindSystemForcedColors(root);
  const forcedColorsActive = applyForcedColors(root);
  bindSystemMotionPreference(settings, root);
  const motion = applyMotionPreference(settings, root);
  if (!root || !root.classList) {
    // headless / node — booleans above are set; nothing to toggle on the DOM.
    return { motionReduced: motion.reduced, motionPreference: motion.preference, flashReduced: _flashReduced,
      forcedColorsActive, colorblindMode: mode, highContrast, dyslexia, captions, captionSize, captionBackground };
  }

  // --- colorblind palette: one active sf-cb-* class + the var set for that mode ---
  for (const c of PALETTE_CLASSES) root.classList.remove(c);
  if (mode !== 'none') root.classList.add('sf-cb-' + mode);
  const pal = PALETTES[mode] || PALETTES.none;
  for (const k in pal) root.style.setProperty(k, pal[k]);

  // --- toggles → root classes (CSS does the visual work) ---
  root.classList.toggle('sf-high-contrast', highContrast);
  root.classList.toggle('sf-reduce-flash', _flashReduced);
  root.classList.toggle('sf-dyslexia', dyslexia);
  root.classList.toggle('sf-captions-off', !captions);
  root.classList.toggle('sf-caption-backing', captionBackground);
  for (const c of CAPTION_SIZE_CLASSES) root.classList.remove(c);
  root.classList.add(`sf-caption-size-${captionSize}`);

  // UI scale is intentionally NOT managed here — it is owned by the shipped `--ui-scale` path
  // (ui.css #ui-root + uiRoot.js #hud), driven by the Video > UI scale slider. Managing a second
  // scale var here would double-scale the HUD. See styles/accessibility.css UI SCALE note.

  return { motionReduced: motion.reduced, motionPreference: motion.preference, flashReduced: _flashReduced,
    forcedColorsActive, colorblindMode: mode, highContrast, dyslexia, captions, captionSize, captionBackground };
}

/** Resolve a semantic state ('hostile'|'shield'|'danger'|…) to its active color, honoring the current
 *  colorblind mode. Canvas systems (radar.js) call this instead of reading a hardcoded hex, so blips
 *  recolor with the palette. Falls back to the state's base color for unknown modes/states. */
export function semanticColor(state, mode) {
  const def = SEMANTIC_PALETTE[state];
  if (!def) return '#ffffff';
  const pal = PALETTES[mode] || PALETTES.none;
  if (def.cssVar && pal[def.cssVar]) return pal[def.cssVar];
  return def.color;
}

/** Resolve a semantic state to its redundant shape token (for canvas) — the non-color channel. */
export function semanticShape(state) {
  const def = SEMANTIC_PALETTE[state];
  return def ? def.shape : 'square';
}
