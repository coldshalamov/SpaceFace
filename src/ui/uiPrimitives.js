// src/ui/uiPrimitives.js — DOM factory helpers for the SpaceFace UI primitive layer.
//
// Pairs with the "UI PRIMITIVE LAYER" section of styles/ui.css. Every function returns a DETACHED
// element the caller mounts where it likes. This module is VIEW-ONLY: it never imports gameState or
// Three.js and never mutates sim state (ARCHITECTURE §5 — UI reads state and emits intents only).
// No new dependency; pure DOM + inline SVG strings.
//
// The primitives (and the legacy class each supersedes) are documented in styles/ui.css. `.sf-chip`
// is the canonical live-status primitive; `.sf-glyph` retires emoji / unicode tab icons — its first
// consumer is the station hub rail (src/ui/screens/stationHub.js).

// ---------------------------------------------------------------------------------------------------
// tiny DOM helper
// ---------------------------------------------------------------------------------------------------
function el(tag, className, opts = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.html != null) node.innerHTML = opts.html;
  if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  if (opts.children) for (const c of opts.children) if (c) node.appendChild(c);
  return node;
}

// ---------------------------------------------------------------------------------------------------
// Inline SVG glyphs — 24×24 viewBox, stroke=currentColor (see .sf-glyph in ui.css). ONLY the icons the
// station-tab swap actually needs, plus one filled ship silhouette for the asset-stage fallback. Keep
// this set tight: add a glyph when a real surface needs it, never "icons for later." currentColor only
// (a hex baked into a path is invisible to the token discipline and will drift off-palette).
// ---------------------------------------------------------------------------------------------------
const GLYPH_PATHS = {
  // Market — balance scale (trade).
  market: '<path d="M12 3v16M7 20h10M4.5 7h15M4.5 7l-2 5a2.6 2.6 0 0 0 4 0zM19.5 7l-2 5a2.6 2.6 0 0 0 4 0z"/>',
  // Shipyard — hull with a viewport (buy hulls).
  shipyard: '<path d="M12 2.5c2.4 2.8 3.6 6 3.6 10l-3.6 3.2-3.6-3.2c0-4 1.2-7.2 3.6-10z"/><path d="M8.7 13.5 6.7 17M15.3 13.5l2 3.5M9.7 20h4.6"/><circle cx="12" cy="8.4" r="1.5"/>',
  // Outfitting — gear (install modules).
  outfit: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1 16.8 7.2M7.2 16.8 5.1 18.9"/>',
  // Manufacture — factory (fabricate).
  manufacture: '<path d="M3.5 21V11l4.5 2.5V11l4.5 2.5V11l4.5 2.5V7.5h4V21z"/><path d="M8 21v-3.5M16 21v-3.5"/>',
  // Missions — contract star.
  missions: '<path d="M12 3.2 14.5 8.6l6 .8-4.4 4.1 1.1 5.9L12 16.7 6.8 19.4l1.1-5.9L3.5 9.4l6-.8z"/>',
  // Services — refuel droplet.
  services: '<path d="M12 3.2s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z"/><path d="M9.3 14.3a2.7 2.7 0 0 0 2.7 2.7"/>',
  // Factions — standard/crest flag.
  factions: '<path d="M6 3.2V21"/><path d="M6 4.4h12l-2.4 3.4L18 11.2H6z"/>',
  // Bar — mug (rumors, contacts).
  bar: '<path d="M6.5 8.2h9v5.4a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4z"/><path d="M15.5 9.5h1.8a2.1 2.1 0 0 1 0 4.2h-1.8M8.4 3.4v1.8M11.5 3.4v1.8"/>',
};

// Filled ship silhouette for the .sf-asset-stage fallback (uses fill, not stroke — not a .sf-glyph).
const SHIP_SILHOUETTE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
  'd="M12 2.2 15 10.5l4.4 3-4.6.8-2.8 7.5-2.8-7.5-4.6-.8 4.4-3z"/></svg>';

/** Raw inner-SVG string for a named glyph, ready to drop inside a `.sf-glyph` span. Returns '' for an
 *  unknown name so callers can fall back to their existing text icon. */
export function glyphSvg(name) {
  const paths = GLYPH_PATHS[name];
  if (!paths) return '';
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
}

/** A `.sf-glyph` span wrapping the named icon. `size` = 'lg' for the larger variant. */
export function glyph(name, opts = {}) {
  const cls = 'sf-glyph' + (opts.size === 'lg' ? ' sf-glyph--lg' : '');
  return el('span', cls, { html: glyphSvg(name), attrs: { 'aria-hidden': 'true' } });
}

// ---------------------------------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------------------------------

/** Opaque console panel. opts: { cut, hud, raised } modifiers; children[]. */
export function panel(opts = {}) {
  let cls = 'sf-panel';
  if (opts.cut) cls += ' sf-panel--cut';
  if (opts.hud) cls += ' sf-panel--hud';
  if (opts.raised) cls += ' sf-panel--raised';
  return el('div', cls, { children: opts.children });
}

/** Dense info card. opts: { label, value, body }. Reuses the existing .sf-card box + new __* hierarchy. */
export function card(opts = {}) {
  const kids = [];
  if (opts.label != null) kids.push(el('div', 'sf-card__label', { text: opts.label }));
  if (opts.value != null) kids.push(el('div', 'sf-card__value', { text: opts.value }));
  if (opts.body != null) kids.push(el('div', 'sf-card__body', { text: opts.body }));
  return el('div', 'sf-card', { children: kids });
}

const CHIP_TONES = new Set(['info', 'good', 'warn', 'danger', 'story', 'muted']);

/** Live status chip. opts: { tone, dot, glyph, interactive, onClick }.
 *  Interactive chips render as a real <button> (keyboard focus + activation for free). */
export function chip(text, opts = {}) {
  const tone = CHIP_TONES.has(opts.tone) ? opts.tone : 'muted';
  let cls = 'sf-chip sf-chip--' + tone + (opts.interactive ? ' sf-chip--btn' : '');
  const kids = [];
  if (opts.dot) kids.push(el('span', 'sf-chip__dot'));
  if (opts.glyph) kids.push(el('span', 'sf-chip__glyph', { html: glyphSvg(opts.glyph) }));
  kids.push(el('span', null, { text: String(text) }));
  const tag = opts.interactive ? 'button' : 'span';
  const attrs = opts.interactive ? { type: 'button' } : {};
  const node = el(tag, cls, { children: kids, attrs });
  if (opts.interactive && typeof opts.onClick === 'function') node.addEventListener('click', opts.onClick);
  return node;
}

const BAR_TONES = new Set(['shield', 'hull', 'energy', 'cargo', 'heat', 'risk', 'danger']);

/** Segmented value bar. value 0..1. opts: { tone, animate, tall, label }.
 *  Bakes role="meter" + aria-value* (CSS cannot express these and the a11y layer may look). */
export function dataBar(value, opts = {}) {
  let cls = 'sf-data-bar';
  if (BAR_TONES.has(opts.tone)) cls += ' sf-data-bar--' + opts.tone;
  if (opts.animate) cls += ' sf-data-bar--animate';
  if (opts.tall) cls += ' sf-data-bar--tall';
  const v = clamp01(value);
  const bar = el('div', cls, {
    attrs: {
      role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '1', 'aria-valuenow': v.toFixed(2),
      ...(opts.label ? { 'aria-label': opts.label } : {}),
    },
    children: [el('div', 'sf-data-bar__fill')],
  });
  bar.style.setProperty('--sf-bar-v', String(v));
  return bar;
}

/** Update an existing data-bar in place (view-only; sets one custom property, no reflow). */
export function setDataBar(barEl, value) {
  if (!barEl) return;
  const v = clamp01(value);
  barEl.style.setProperty('--sf-bar-v', String(v));
  barEl.setAttribute('aria-valuenow', v.toFixed(2));
}

/** Nav rail. items: [{ id, label, glyph?, help? }]. opts: { horizontal, activeId, onSelect(id) }.
 *  Items are real <button>s in a role="tablist"; the active item carries aria-current. */
export function rail(items = [], opts = {}) {
  const cls = 'sf-rail' + (opts.horizontal ? ' sf-rail--h' : '');
  const node = el('div', cls, { attrs: { role: 'tablist' } });
  for (const it of items) {
    const kids = [];
    if (it.glyph) kids.push(glyph(it.glyph));
    kids.push(el('span', null, { text: it.label }));
    const active = it.id === opts.activeId;
    const btn = el('button', 'sf-rail__item', {
      children: kids,
      attrs: {
        type: 'button', role: 'tab', 'data-id': it.id,
        'aria-current': active ? 'true' : 'false',
        ...(it.help ? { title: it.help, 'aria-label': it.label + ': ' + it.help } : {}),
      },
    });
    if (active) btn.classList.add('active');
    if (typeof opts.onSelect === 'function') btn.addEventListener('click', () => opts.onSelect(it.id));
    node.appendChild(btn);
  }
  return node;
}

/** Dark 3D-preview shell with a fallback ship silhouette. opts: { label }. Mount a canvas as the first
 *  child and add the 'sf-asset-stage--loaded' class to hide the fallback. */
export function assetStage(opts = {}) {
  const fallback = el('div', 'sf-asset-stage__fallback', {
    html: SHIP_SILHOUETTE + '<span>' + escapeText(opts.label || 'No preview') + '</span>',
    attrs: { 'aria-hidden': 'true' },
  });
  return el('div', 'sf-asset-stage', { children: [fallback] });
}

/** Fire the one-shot .sf-border-trace edge sweep on `elm` (which must carry .sf-border-trace). `tone`
 *  optionally = 'good' | 'warn' | 'danger'. Re-adds the class after a reflow so the animation restarts
 *  even on repeated calls. CSS-class driven on purpose: the global reduce-motion kill switch only
 *  neutralises CSS animations, not WAAPI, so we stay in CSS land. */
export function trace(elm, tone) {
  if (!elm || !elm.classList) return;
  elm.classList.remove('is-tracing');
  elm.classList.remove('sf-border-trace--good', 'sf-border-trace--warn', 'sf-border-trace--danger');
  if (tone === 'good' || tone === 'warn' || tone === 'danger') elm.classList.add('sf-border-trace--' + tone);
  // Force reflow so removing + re-adding restarts the animation.
  void elm.offsetWidth;
  elm.classList.add('is-tracing');
}

// ---------------------------------------------------------------------------------------------------
function clamp01(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function escapeText(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
