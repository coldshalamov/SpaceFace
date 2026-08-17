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
// J05 metaphor purge: two glyphs here were borrowed from the wrong century. `market` was a medieval
// BALANCE SCALE and `bar` was a COFFEE MUG, sitting beside a hull, a gear and a factory. Both now
// speak the same aerospace-console language as the rest of the set.
//
// `src/ui/station/icons.js` is the canonical vocabulary; `market` below is deliberately the same
// order-book drawing as its `market` entry so the two sets cannot diverge into rival dialects. This
// module keeps its own copy rather than importing because `.sf-glyph` in ui.css supplies the stroke
// weight here, while `icons.js` bakes stroke attributes into each path — one set of paths cannot
// satisfy both conventions without a wider refactor.
const GLYPH_PATHS = {
  // Market — order-book bars on a baseline (trade volume, not a merchant's scale).
  market: '<path d="M4 20V9.5M9.3 20V4.5M14.7 20v-7.4M20 20V7"/><path d="M2.8 20h18.4"/>',
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
  // Bar — two contacts in conversation. The screen's payload is rumors and people, so it is drawn
  // as people; a drinking vessel described the furniture instead of the verb.
  bar: '<circle cx="9" cy="9.2" r="2.7"/><path d="M4 18.6c0-2.7 2.2-4.4 5-4.4s5 1.7 5 4.4"/><circle cx="16.9" cy="10.6" r="2"/><path d="M15.6 18.6c0-2.3 1.3-3.8 3-4.1"/>',
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
// sf-select — the styled replacement for native <select> (FRONTEND_DIRECTION §4.4: native form
// controls are deleted from screens). Listbox pattern per ARIA APG: the field button owns focus and
// keyboard, the list carries role=listbox + aria-activedescendant. Root exposes `.value` and
// dispatches a bubbling DOM `change` event on user commit, so existing screen handlers keep working.
// ---------------------------------------------------------------------------------------------------
const SF_SELECT_CARET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Build an .sf-select. items: [{ value, label, disabled? }]. opts: { value, ariaLabel, className, disabled, onChange }.
 *  User commits dispatch a bubbling `change` event on the root (event.target === root, root.value set). */
export function sfSelect(items = [], opts = {}) {
  const root = el('div', 'sf-select' + (opts.className ? ' ' + opts.className : ''));
  const valueEl = el('span', 'sf-select__value');
  const field = el('button', 'sf-select__field', {
    children: [valueEl],
    attrs: {
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      ...(opts.ariaLabel ? { 'aria-label': opts.ariaLabel } : {}),
    },
  });
  field.insertAdjacentHTML('beforeend', SF_SELECT_CARET);
  const list = el('div', 'sf-select__list', { attrs: { role: 'listbox' } });
  if (opts.ariaLabel) list.setAttribute('aria-label', opts.ariaLabel);
  root.appendChild(field);
  root.appendChild(list);

  let options = [];
  let value = null;
  let open = false;
  let activeIndex = -1;
  let onDocPointer = null;

  function optionByValue(v) {
    for (let i = 0; i < options.length; i++) if (options[i].value === v) return i;
    return -1;
  }

  function renderList() {
    list.textContent = '';
    options.forEach((o, i) => {
      const node = el('div', 'sf-select__opt', {
        text: o.label,
        attrs: {
          role: 'option',
          'data-value': String(o.value),
          'aria-selected': String(o.value === value),
          ...(o.disabled ? { 'aria-disabled': 'true' } : {}),
        },
      });
      if (o.value === value) node.classList.add('is-selected');
      if (i === activeIndex) node.classList.add('is-active');
      node.addEventListener('click', () => { if (!o.disabled) commit(i); });
      list.appendChild(node);
    });
  }

  function syncField() {
    const idx = optionByValue(value);
    valueEl.textContent = idx >= 0 ? options[idx].label : '';
    field.disabled = !!opts.disabled || options.length === 0;
  }

  function setActive(i, focusOption) {
    if (!options.length) return;
    activeIndex = Math.max(0, Math.min(options.length - 1, i));
    renderList();
    const activeId = 'sf-select-opt-' + activeIndex;
    const nodes = list.children;
    if (nodes[activeIndex]) {
      nodes[activeIndex].id = activeId;
      list.setAttribute('aria-activedescendant', activeId);
      if (focusOption !== false) nodes[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function openList() {
    if (open || field.disabled) return;
    open = true;
    root.classList.add('sf-select--open');
    field.setAttribute('aria-expanded', 'true');
    // Flip above the field when the drop-down would leave the viewport.
    const rect = field.getBoundingClientRect();
    root.classList.toggle('sf-select--up', rect.bottom + Math.min(list.scrollHeight || 220, 220) > innerHeight && rect.top > 200);
    setActive(Math.max(0, optionByValue(value)));
    onDocPointer = (ev) => { if (!root.contains(ev.target)) closeList(); };
    document.addEventListener('pointerdown', onDocPointer, true);
  }

  function closeList(returnFocus) {
    if (!open) return;
    open = false;
    root.classList.remove('sf-select--open', 'sf-select--up');
    field.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    if (onDocPointer) { document.removeEventListener('pointerdown', onDocPointer, true); onDocPointer = null; }
    if (returnFocus !== false) { try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); } }
  }

  function commit(i) {
    const o = options[i];
    if (!o || o.disabled || o.value === value) { closeList(); return; }
    value = o.value;
    syncField();
    renderList();
    closeList();
    root.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof opts.onChange === 'function') opts.onChange(value);
  }

  field.addEventListener('click', () => { if (open) closeList(); else openList(); });
  field.addEventListener('keydown', (ev) => {
    switch (ev.key) {
      case 'ArrowDown': ev.preventDefault(); if (!open) openList(); else setActive(activeIndex + 1); break;
      case 'ArrowUp': ev.preventDefault(); if (!open) openList(); else setActive(activeIndex - 1); break;
      case 'Home': ev.preventDefault(); if (open) setActive(0); break;
      case 'End': ev.preventDefault(); if (open) setActive(options.length - 1); break;
      case 'Enter': case ' ': ev.preventDefault(); if (open) commit(activeIndex); else openList(); break;
      case 'Escape': if (open) { ev.preventDefault(); ev.stopPropagation(); closeList(); } break;
      case 'Tab': if (open) closeList(false); break;
    }
  });

  /** Programmatic value set — updates the UI, does NOT dispatch a change event. */
  Object.defineProperty(root, 'value', {
    get: () => (value == null ? '' : value),
    set(v) { value = v; syncField(); renderList(); },
  });
  /** Replace the option set (and optionally the value) in place. */
  root.sfSetOptions = (next, nextValue) => {
    options = (next || []).map((o) => ({ value: o.value, label: o.label, disabled: !!o.disabled }));
    const hadValue = nextValue !== undefined ? nextValue : value;
    const idx = optionByValue(hadValue);
    value = idx >= 0 ? hadValue : (options.length ? options[0].value : null);
    activeIndex = idx >= 0 ? idx : 0;
    syncField();
    renderList();
  };
  root.sfSelectField = field;
  root.sfSetOptions(items, opts.value);

  return root;
}

/** Replace every native <select> under `root` with an .sf-select widget, carrying over id, class,
 *  data-* attributes, aria-label, disabled state, options and current value. Call after assigning
 *  innerHTML; later repopulation goes through `el.sfSetOptions([...], value)`. */
export function enhanceSelects(root) {
  if (!root || !root.querySelectorAll) return [];
  const widgets = [];
  for (const sel of Array.from(root.querySelectorAll('select'))) {
    const items = Array.from(sel.options || []).map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }));
    const widget = sfSelect(items, {
      value: sel.value,
      ariaLabel: sel.getAttribute('aria-label') || sel.getAttribute('aria-labelledby') || undefined,
      className: sel.className,
      disabled: sel.disabled,
    });
    if (sel.id) widget.id = sel.id;
    for (const attr of Array.from(sel.attributes)) {
      if (attr.name === 'id' || attr.name === 'class' || attr.name === 'aria-label' || attr.name === 'disabled') continue;
      if (attr.name === 'value' || attr.name === 'name') continue;
      if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) widget.setAttribute(attr.name, attr.value);
    }
    sel.parentNode.replaceChild(widget, sel);
    widgets.push(widget);
  }
  return widgets;
}

// ---------------------------------------------------------------------------------------------------
// dataState — the FOUR REQUIRED DATA STATES (J3; CANONICAL_BUILD_MAP §11.12, grammar §12 item 9).
//
// "A correct-but-blank screen reads as broken." Every pane must be able to render EMPTY / LOADING /
// ERROR / DENIED, and each state must name WHAT WOULD FILL IT and carry a VERB. Supersedes the dead
// `.sf-empty` class (a centred italic string that named nothing and did nothing).
//
// TWO CONTRACTS THIS MODULE ENFORCES IN CODE, because a doc cannot:
//
//  1. `fills` and `verb` are REQUIRED and throw when absent. If they were options every caller would
//     omit them and this decays back into `.sf-empty` with more ceremony. Authoring-time failure is
//     the point — scripts/check-data-states.mjs asserts the same rule statically.
//
//  2. LOADING's sweep is REMOVED, never hidden. The repo's existing "good" loading state
//     (`.sx-sw__acquiring`) runs `animation: … infinite` and only sets visibility:hidden when done —
//     a compositor-side animation that `check:ui-frame-sleep` cannot see because it inspects rAF.
//     Mounting through `mountDataState()` clears the host, so resolving a load necessarily detaches
//     the animating nodes. `settleDataState()` is the explicit form.
//
// Colour follows grammar §4 roles only — never `--accent`, which is deliberately roleless. At rest a
// state is calm+paper; exactly one hot accent is spent on the rail/glyph, and the verb carries
// `--sf-goal` because it is the way out. Meaning never lives in colour alone: every state prints its
// own state word and carries a distinct glyph silhouette, so `forced-colors` (which strips
// background-image, box-shadow and filter) still reads correctly.
// ---------------------------------------------------------------------------------------------------

/** The four states. `word` is the second, non-colour channel; `role` names the grammar §4 token.
 *
 *  `aria` is the ARIA role, not a guess: `alert` carries implicit assertive+atomic and is what
 *  browsers handle most reliably for a node inserted WITH its content already present, which is
 *  exactly how these mount. `status` + an explicit `aria-live="assertive"` is the non-idiomatic
 *  pairing and was the first version. No explicit aria-live is set on either — both roles carry an
 *  implicit politeness, and restating it is how the two end up disagreeing.
 *
 *  `aria-busy` is NOT here on purpose. It belongs on the HOST being mutated, not on the live region
 *  doing the announcing; on the region itself it can suppress the very announcement the region
 *  exists to make. mountDataState sets and clears it on the host. */
const DATA_STATES = {
  empty:   { word: 'NO_RETURNS',         role: 'calm', aria: 'status' },
  loading: { word: 'BUS_OFFLINE',        role: 'calm', aria: 'status' },
  error:   { word: 'FEED_FAULT',         role: 'foe',  aria: 'alert' },
  denied:  { word: 'CLEARANCE_DENIED',   role: 'foe',  aria: 'alert' },
};

/** Avionics fault id: A-Z / 0-9 / underscore. Generic web copy ("Loading...", "Error") is rejected
 *  so every empty/loading/denied/error pane names a specific instrument failure, not a spinner. */
const STATE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;

function stateCode(kind, opts) {
  const fallback = DATA_STATES[kind].word;
  if (opts.code == null || opts.code === '') return fallback;
  const raw = String(opts.code).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!STATE_CODE_RE.test(raw)) {
    throw new TypeError('dataState(' + kind + '): `code` must be an avionics fault id (A-Z/0-9/_), not generic web copy');
  }
  return raw;
}

// 24×24, stroke=currentColor, distinguishable by SILHOUETTE alone (the mirror-pair test): an open
// socket, a broken arc, a struck triangle, a barred ring.
const STATE_GLYPHS = {
  empty:   '<circle cx="12" cy="12" r="8.2" stroke-dasharray="3 3.4"/>',
  loading: '<path d="M12 3.8a8.2 8.2 0 0 1 8.2 8.2"/><path d="M12 20.2a8.2 8.2 0 0 1-8.2-8.2" opacity=".45"/>',
  error:   '<path d="M12 4.2 21 19.4H3z"/><path d="M12 10v4.1M12 16.8v.1"/>',
  denied:  '<circle cx="12" cy="12" r="8.2"/><path d="M6.2 17.8 17.8 6.2"/>',
};

function stateGlyph(kind) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" '
    + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + STATE_GLYPHS[kind] + '</svg>';
}

/**
 * dataState(kind, opts) -> HTMLElement (detached).
 *
 * kind: 'empty' | 'loading' | 'error' | 'denied'
 * opts.headline  REQUIRED — what is (or is not) here, in the player's words.
 * opts.code      optional avionics fault id replacing the kind's default word (NO_RETURNS,
 *                BUS_OFFLINE, FEED_FAULT, CLEARANCE_DENIED). Must be A-Z/0-9/_ — never "Loading…".
 * opts.fills     REQUIRED — what WOULD fill this pane. For LOADING, the real work being awaited
 *                (never a timer). For DENIED, the rule that blocks it.
 * opts.verb      REQUIRED — { label, onActivate? , action? , key? }. The way out. A pane the player
 *                can only stare at is the failure this primitive exists to prevent. `onActivate` is
 *                a direct listener; `action` emits `data-sf-verb="<action>"` for a host screen's
 *                existing delegated click handler (the only form that survives dataStateHtml).
 * opts.detail    optional second line.
 * opts.skeleton  LOADING only — [{ w, h }] rows echoing the REAL layout, or a row count.
 * opts.compact   dense inline variant (drawer decks, apron tiles).
 *
 * Throws on a missing kind / headline / fills / verb.label — see contract 1 above.
 */
export function dataState(kind, opts = {}) {
  const spec = DATA_STATES[kind];
  if (!spec) throw new TypeError('dataState: unknown kind "' + kind + '" (empty|loading|error|denied)');
  if (!opts.headline) throw new TypeError('dataState(' + kind + '): `headline` is required');
  if (!opts.fills) throw new TypeError('dataState(' + kind + '): `fills` is required — name what would fill this pane');
  const verb = opts.verb;
  if (!verb || !verb.label) {
    throw new TypeError('dataState(' + kind + '): `verb` is required — every data state carries a way out');
  }

  const body = [];
  body.push(el('span', 'sf-state__word', { text: stateCode(kind, opts) }));
  body.push(el('p', 'sf-state__head', { text: String(opts.headline), attrs: { 'data-sf-text': '' } }));
  body.push(el('p', 'sf-state__fills', { text: String(opts.fills), attrs: { 'data-sf-text': '' } }));
  if (opts.detail) body.push(el('p', 'sf-state__detail', { text: String(opts.detail), attrs: { 'data-sf-text': '' } }));

  const verbKids = [el('span', null, { text: String(verb.label) })];
  if (verb.key) verbKids.push(el('kbd', 'sf-state__key', { text: String(verb.key) }));
  const verbAttrs = { type: 'button' };
  if (verb.action) verbAttrs['data-sf-verb'] = String(verb.action);
  const verbBtn = el('button', 'sf-state__verb', { children: verbKids, attrs: verbAttrs });
  if (typeof verb.onActivate === 'function') verbBtn.addEventListener('click', verb.onActivate);
  body.push(verbBtn);

  const kids = [
    el('span', 'sf-state__glyph', { html: stateGlyph(kind), attrs: { 'aria-hidden': 'true' } }),
    el('div', 'sf-state__body', { children: body }),
  ];

  // LOADING renders a skeleton OF THE REAL LAYOUT above the copy, so the pane's shape is legible
  // before its content is. Rows are authored by the caller; a bare count gets an even default.
  if (kind === 'loading' && opts.skeleton) {
    const rows = Array.isArray(opts.skeleton)
      ? opts.skeleton
      : Array.from({ length: Math.max(1, Math.min(8, Number(opts.skeleton) || 3)) }, () => ({}));
    const skel = el('div', 'sf-state__skel', { attrs: { 'aria-hidden': 'true' } });
    for (const r of rows.slice(0, 8)) {
      const bar = el('div', 'sf-state__bar');
      if (r && r.w) bar.style.width = String(r.w);
      if (r && r.h) bar.style.height = (Number(r.h) || 12) + 'px';
      skel.appendChild(bar);
    }
    kids.unshift(skel);
  }

  const node = el('div', 'sf-state sf-state--' + kind + (opts.compact ? ' sf-state--compact' : ''), {
    children: kids,
    attrs: { 'data-sf-state': kind, role: spec.aria },
  });
  node.sfStateVerb = verbBtn;
  return node;
}

/**
 * mountDataState(host, kind, opts) -> the mounted node.
 *
 * CLEARS `host` first. This is the sanctioned mount path precisely because clearing is what makes
 * contract 2 hold: replacing a LOADING state with real content detaches its animating nodes rather
 * than hiding them. Returns null (and leaves the host alone) when `host` is missing.
 */
export function mountDataState(host, kind, opts) {
  if (!host) return null;
  const node = dataState(kind, opts);
  host.textContent = '';
  host.appendChild(node);
  // aria-busy belongs on the HOST being mutated, not on the live region inside it. settleDataState
  // clears it, which is the other half of the contract.
  if (kind === 'loading') host.setAttribute('aria-busy', 'true');
  else host.removeAttribute('aria-busy');
  return node;
}

/**
 * dataStateHtml(kind, opts) -> markup string.
 *
 * Most screens in this repo assemble innerHTML strings (galaxyMap, the station screens), so a
 * DOM-only primitive could not be adopted where the defect actually lives. Built from the SAME
 * dataState() node so the two forms cannot drift apart.
 *
 * The verb must be `verb.action` here: a listener cannot survive serialization, and silently
 * dropping one would ship a dead button — the exact "correct-but-inert" failure this job exists to
 * remove. Host screens route `[data-sf-verb]` through the delegated click handler they already own.
 */
export function dataStateHtml(kind, opts = {}) {
  const verb = opts && opts.verb;
  if (verb && typeof verb.onActivate === 'function' && !verb.action) {
    throw new TypeError('dataStateHtml(' + kind + '): `verb.onActivate` cannot be serialized — use `verb.action`');
  }
  if (verb && !verb.action) {
    throw new TypeError('dataStateHtml(' + kind + '): `verb.action` is required so the verb survives innerHTML');
  }
  return dataState(kind, opts).outerHTML;
}

/**
 * settleDataState(host) — remove every data state under `host`, animation and all.
 *
 * Call this before writing real content by any path other than mountDataState(). A hidden LOADING
 * sweep keeps running on the compositor where no check in this repo can see it.
 */
export function settleDataState(host) {
  if (!host || !host.querySelectorAll) return 0;
  const nodes = Array.from(host.querySelectorAll('.sf-state'));
  if (host.classList && host.classList.contains('sf-state')) nodes.push(host);
  for (const n of nodes) if (n.parentNode) n.parentNode.removeChild(n);
  if (host.removeAttribute) host.removeAttribute('aria-busy');
  return nodes.length;
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
