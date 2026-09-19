// src/ui/wingmanRadial.js — the wingman command radial (Micro-Loops: "surfacing them as a quick
// radial on the comms key gives the player a taste of fleet control without leaving the cockpit").
//
// A four-key dial that pops at screen-center on the fleet-command key (bindings.fleetCommand / Z),
// issues one batched ui:wingOrder intent and closes. The hub cycles ALL / a selected recipient.
// The keys are four glass arc segments seated in one machined ring; each is a real annular sector
// (clip-path), so hover and click land only on the arc a key names.
//
// Pure DOM + event listeners; reads state for the fleet + target, never mutates sim state (§0.6).
// The radial keeps the player's hands on thrust/trigger — open, pick, gone — matching the cockpit feel.

import { BINDINGS } from './bindings.js';
import { dpIcon } from './deckplate/icons.js';

const STYLE_ID = 'sf-wingman-radial-style';

// N / E / S / W wedges. `order` is the batched ui:wingOrder kind; `key` is the shortcut.
// Glyphs come from the shared drawn icon set (station/icons.js) so the radial speaks the same
// visual language as the rest of the HUD — the old ⛊/✦ Unicode marks rendered at mixed weights
// and ⛊ has no consistent cross-platform glyph.
const OPTIONS = [
  { key: '1', order: 'attack', label: 'Attack Target', icon: 'target', pos: 'top', needsTarget: true },
  { key: '2', order: 'screen', label: 'Screen', icon: 'shield', pos: 'right' },
  { key: '3', order: 'regroup', label: 'Regroup', icon: 'boost', pos: 'bottom' },
  { key: '4', order: 'hold', label: 'Hold', icon: 'clock', pos: 'left' },
];

// The dial's geometry, in its own 400-unit box (the overlay is 400px square).
const DIAL = 400;
const C = DIAL / 2;
const R_IN = 74;
const R_OUT = 166;
const HALF_SPAN = (42 * Math.PI) / 180;   // 84-degree keys, 6-degree seams
const R_FACE = 120;                       // where each key's legend sits
const R_LAMP = 178;                       // the bezel lamps, one per key
const POS_ANGLE = { top: -Math.PI / 2, right: 0, bottom: Math.PI / 2, left: Math.PI };

function polarX(r, a) { return C + r * Math.cos(a); }
function polarY(r, a) { return C + r * Math.sin(a); }
function pt(r, a) { return `${polarX(r, a).toFixed(2)} ${polarY(r, a).toFixed(2)}`; }
function sectorPath(a) {
  const a0 = a - HALF_SPAN;
  const a1 = a + HALF_SPAN;
  return `M${pt(R_OUT, a0)}A${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)}`
    + `L${pt(R_IN, a1)}A${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)}Z`;
}
// One path for the whole graticule (60 ticks, a long one at each key's bearing): one DOM node.
function graticulePath() {
  let d = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    d += `M${pt(i % 15 === 0 ? 185 : 189, a)}L${pt(194, a)}`;
  }
  return d;
}
const DIAL_SVG = '<svg class="sf-wradial__dial" viewBox="0 0 400 400" aria-hidden="true" focusable="false">'
  + '<defs>'
  + '<radialGradient id="sf-wr-glass" cx="200" cy="200" r="170" gradientUnits="userSpaceOnUse">'
  + '<stop offset="0.42" stop-color="#0d131c" stop-opacity="0.9"/><stop offset="1" stop-color="#151d29" stop-opacity="0.86"/></radialGradient>'
  + '<linearGradient id="sf-wr-metal" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#6a7281"/><stop offset="0.38" stop-color="#2f3540"/><stop offset="1" stop-color="#12151b"/></linearGradient>'
  + '</defs>'
  + `<circle class="sf-wradial__bed" cx="${C}" cy="${C}" r="171"/>`
  + `<circle class="sf-wradial__bezel" cx="${C}" cy="${C}" r="${R_LAMP}"/>`
  + `<circle class="sf-wradial__bezel-edge" cx="${C}" cy="${C}" r="183"/>`
  + `<path class="sf-wradial__graticule" d="${graticulePath()}"/>`
  + '</svg>';

export function createWingmanRadial(ctx) {
  const { bus, state } = ctx;
  injectCss();

  const root = document.getElementById('ui-root');
  const overlay = document.createElement('div');
  overlay.className = 'sf-wradial';
  overlay.id = 'sf-wingman-radial';
  overlay.setAttribute('role', 'menu');
  overlay.setAttribute('aria-label', 'Wingman commands');
  overlay.hidden = true;

  const hub = document.createElement('button');
  hub.type = 'button';
  hub.className = 'sf-wradial__hub';
  hub.setAttribute('aria-label', 'Cycle wingman command scope');
  hub.innerHTML = '<span class="sf-wradial__hub-title">ALL WINGS</span><span class="sf-wradial__hub-count mono">0</span><span class="sf-wradial__hub-scope mono">TAB</span>';
  overlay.insertAdjacentHTML('beforeend', DIAL_SVG);
  overlay.appendChild(hub);
  const hubTitle = hub.querySelector('.sf-wradial__hub-title');
  const hubCount = hub.querySelector('.sf-wradial__hub-count');
  hub.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); cycleScope(); });

  const wedgeEls = [];
  for (const opt of OPTIONS) {
    const wedge = document.createElement('button');
    wedge.type = 'button';
    wedge.className = `sf-wradial__wedge sf-wradial__wedge--${opt.pos}`;
    wedge.setAttribute('role', 'menuitem');
    wedge.setAttribute('aria-keyshortcuts', opt.key);
    const a = POS_ANGLE[opt.pos];
    const d = sectorPath(a);
    wedge.style.clipPath = `path('${d}')`;
    wedge.innerHTML =
      `<svg class="sf-wradial__seg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><path d="${d}"/></svg>` +
      `<span class="sf-wradial__face" style="left:${polarX(R_FACE, a).toFixed(1)}px;top:${polarY(R_FACE, a).toFixed(1)}px">` +
      `<span class="sf-wradial__glyph">${dpIcon(opt.icon, 24)}</span>` +
      `<span class="sf-wradial__label">${opt.label}</span>` +
      `<span class="sf-wradial__key mono" aria-hidden="true">${opt.key}</span></span>`;
    // The key's lamp is set into the bezel, outside the key's own clip, so it lives on the overlay.
    const lamp = document.createElement('span');
    lamp.className = `sf-wradial__lamp sf-wradial__lamp--${opt.pos}`;
    lamp.setAttribute('aria-hidden', 'true');
    lamp.style.left = `${polarX(R_LAMP, a).toFixed(1)}px`;
    lamp.style.top = `${polarY(R_LAMP, a).toFixed(1)}px`;
    overlay.appendChild(lamp);
    wedge.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); issue(opt); });
    overlay.appendChild(wedge);
    wedgeEls.push(wedge);
  }

  root.appendChild(overlay);

  let open = false;
  let scope = 'all';
  let selectedIndex = 0;
  let previousFocus = null;

  function fleet() {
    return (state.automation && state.automation.fleet) || [];
  }

  function toggle() {
    if (open) { close(); return; }
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) return;
    const f = fleet();
    if (!f.length) {
      bus.emit('toast', { text: 'No wingmen deployed — assign a fleet at a station', kind: 'info', ttl: 2.5 });
      bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    openRadial(f.length);
  }

  function openRadial(count) {
    open = true;
    previousFocus = document.activeElement;
    if (state.ui) state.ui.wingmanRadialOpen = true;
    selectedIndex = Math.min(selectedIndex, Math.max(0, count - 1));
    refreshScope();
    // Grey the Attack wedge when there's no target to focus.
    const hasTarget = state.player && state.player.targetId != null;
    wedgeEls[0].classList.toggle('sf-wradial__wedge--disabled', !hasTarget);
    wedgeEls[0].disabled = !hasTarget;
    wedgeEls[0].setAttribute('aria-disabled', String(!hasTarget));
    overlay.hidden = false;
    overlay.classList.remove('sf-wradial--in'); void overlay.offsetWidth;
    overlay.classList.add('sf-wradial--in');
    document.addEventListener('keydown', onKey, true);
    bus.emit('audio:cue', { id: 'ui_open' });
    focusSafely(wedgeEls.find((wedge) => !wedge.disabled) || hub);
  }

  function close() {
    if (!open) return;
    open = false;
    if (state.ui) state.ui.wingmanRadialOpen = false;
    overlay.classList.remove('sf-wradial--in');
    document.removeEventListener('keydown', onKey, true);
    const restore = previousFocus;
    previousFocus = null;
    if (restore && restore.isConnected !== false && !restore.disabled) focusSafely(restore);
    // let the fade-out play before hiding
    setTimeout(() => { if (!open) overlay.hidden = true; }, 160);
  }

  function issue(opt) {
    const f = fleet();
    if (!f.length) { close(); return; }
    if (opt.needsTarget && (!state.player || state.player.targetId == null)) {
      bus.emit('toast', { text: `No target — press Tab to select, then ${BINDINGS.fleetCommand.label}`, kind: 'warn', ttl: 2.5 });
      bus.emit('audio:cue', { id: 'ui_deny' });
      return; // keep the radial open so the player can pick another order
    }
    const selected = f[selectedIndex] || null;
    bus.emit('ui:wingOrder', {
      order: opt.order,
      scope,
      selectedWingmanId: scope === 'selected' && selected ? selected.id : null,
      targetId: opt.order === 'attack' ? (state.player && state.player.targetId) : null,
    });
    close();
  }

  function cycleScope() {
    const f = fleet();
    if (!f.length) return;
    if (scope === 'all') {
      scope = 'selected';
      selectedIndex = 0;
    } else if (selectedIndex < f.length - 1) {
      selectedIndex += 1;
    } else {
      scope = 'all';
      selectedIndex = 0;
    }
    refreshScope();
    bus.emit('audio:cue', { id: 'ui_tick' });
  }

  function refreshScope() {
    const f = fleet();
    const selected = f[selectedIndex] || null;
    hubTitle.textContent = scope === 'all' ? 'ALL WINGS' : 'ONE WING';
    hubCount.textContent = scope === 'all' ? String(f.length) : `${selectedIndex + 1}/${f.length}`;
    hub.setAttribute('aria-label', scope === 'all'
      ? `Command all ${f.length} wingmen; activate to select one`
      : `Command selected wingman ${selected && (selected.name || selected.id) || selectedIndex + 1}; activate to cycle`);
  }

  function onKey(ev) {
    if (!open) return;
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      bus.emit('audio:cue', { id: 'ui_back' });
      close();
      return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault(); ev.stopPropagation(); cycleScope(); return;
    }
    const opt = OPTIONS.find((o) => o.key === ev.key);
    if (opt) { ev.preventDefault(); ev.stopPropagation(); issue(opt); return; }
    // Re-pressing the fleet-command key while open closes it (tap-tap dismiss).
    if (ev.code === BINDINGS.fleetCommand.code || ev.key === BINDINGS.fleetCommand.key) {
      ev.preventDefault(); ev.stopPropagation(); close();
    }
  }

  bus.on('ui:wingmanRadial', toggle);
  // Close if flight is left (dock / menu / death) so it can't linger over a modal.
  bus.on('mode:changed', () => { if (open && state.mode !== 'flight') close(); });
  bus.on('dock:docked', () => close());

  return { toggle, open: openRadial, close, get isOpen() { return open; } };
}

function injectCss() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  /* Deckplate (FRONTEND_PROGRAM Wave 1, critic pass 2026-09-19): the wingman radial is one dial -
     four smoked-glass arc keys seated in a machined ring, a lamp set into the bezel over each key,
     and a glass hub that names the scope. The selection language is the kit's: the key's lamp
     lights, its legend goes amber, and its inner edge takes an amber rim. Legends are bone. */
  .sf-wradial { position:fixed; left:50%; top:50%; width:400px; height:400px; transform:translate(-50%,-50%);
    z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; --wr-type:12px; }
  .sf-wradial::before { content:""; position:absolute; inset:-60px; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle, rgb(5 7 10 / .7) 0%, rgb(5 7 10 / .45) 52%, transparent 71%); }
  .sf-wradial[hidden] { display:none; }
  .sf-wradial.sf-wradial--in { opacity:1; }
  .sf-wradial__dial { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  .sf-wradial__bed { fill:rgb(4 6 9 / .78); stroke:#05070a; stroke-width:2; }
  .sf-wradial__bezel { fill:none; stroke:url(#sf-wr-metal); stroke-width:10; }
  .sf-wradial__bezel-edge { fill:none; stroke:rgb(255 236 204 / .14); stroke-width:1; }
  .sf-wradial__graticule { fill:none; stroke:rgb(232 226 212 / .3); stroke-width:1.2; stroke-linecap:round; }

  /* the keys: each button fills the dial box and is clipped to its own arc */
  .sf-wradial__wedge { position:absolute; inset:0; width:400px; height:400px; margin:0; padding:0; border:0;
    background:none; color:var(--dp-ink-dim, #b7b4a6); cursor:pointer; pointer-events:auto;
    font-family:var(--dp-face-etch, sans-serif); transform-origin:200px 200px;
    transform:scale(.9); opacity:0;
    transition:transform .2s cubic-bezier(.2,.9,.3,1.2) var(--wr-delay, 0ms), opacity .14s ease var(--wr-delay, 0ms), color .12s; }
  .sf-wradial__wedge--right { --wr-delay:25ms; }
  .sf-wradial__wedge--bottom { --wr-delay:50ms; }
  .sf-wradial__wedge--left { --wr-delay:75ms; }
  .sf-wradial--in .sf-wradial__wedge { transform:none; opacity:1; }
  .sf-wradial__seg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  .sf-wradial__seg path { fill:url(#sf-wr-glass); stroke:rgb(255 236 204 / .13); stroke-width:2; transition:stroke .12s; }
  /* the glass catches the key light along its top edge */
  .sf-wradial__wedge::after { content:""; position:absolute; inset:0; pointer-events:none;
    background:radial-gradient(60% 45% at 38% 18%, rgb(255 244 222 / .07), transparent 70%); }
  .sf-wradial__face { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column;
    align-items:center; gap:5px; width:112px; pointer-events:none; text-align:center; }
  .sf-wradial__glyph { width:24px; height:24px; display:flex; align-items:center; justify-content:center; color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__glyph svg { display:block; }
  .sf-wradial__glyph .accent { fill:var(--dp-ink-mute, #96948e); }
  .sf-wradial__label { font-variation-settings:"wght" 760, "wdth" 72; font-size:var(--wr-type); letter-spacing:.14em;
    text-transform:uppercase; line-height:1.15; text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  .sf-wradial__key, .sf-wradial__hub-scope { display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px;
    box-sizing:border-box; border-style:solid; border-color:transparent; border-width:3px 4px 5px;
    border-image:url("/assets/ui/deckplate/hw/keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
    background:var(--dp-metal-3, #232833);
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 75; font-size:var(--wr-type);
    line-height:1; letter-spacing:.04em; color:var(--dp-ink, #e8e2d4); }

  /* the bezel lamps: dark lenses at rest, lit over the key under the pilot's hand */
  .sf-wradial__lamp { position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%);
    box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1.5px #06080a, 0 1px 0 1.5px rgb(255 236 204 / .1); }

  /* selection: lamp lit, legend amber, amber inner edge - one language with every deckplate row */
  .sf-wradial__wedge:is(:hover, :focus-visible) { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__label { text-shadow:0 0 10px var(--dp-lamp-bloom, rgb(242 185 80 / .34)); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph .accent { fill:var(--dp-lamp, #f2b950); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__key { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path {
    stroke:var(--dp-lamp, #f2b950); stroke-width:4; filter:drop-shadow(0 0 6px rgb(242 185 80 / .45)); }
  .sf-wradial:has(.sf-wradial__wedge--top:is(:hover, :focus-visible)) .sf-wradial__lamp--top,
  .sf-wradial:has(.sf-wradial__wedge--right:is(:hover, :focus-visible)) .sf-wradial__lamp--right,
  .sf-wradial:has(.sf-wradial__wedge--bottom:is(:hover, :focus-visible)) .sf-wradial__lamp--bottom,
  .sf-wradial:has(.sf-wradial__wedge--left:is(:hover, :focus-visible)) .sf-wradial__lamp--left {
    background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot, #ffd98c) 22%, var(--dp-lamp, #f2b950) 55%, var(--dp-lamp-dim, #8a6b3a) 100%);
    box-shadow:0 0 7px var(--dp-lamp-bloom, rgb(242 185 80 / .34)), 0 0 16px var(--dp-lamp-bloom-soft, rgb(242 185 80 / .16)), 0 0 0 1.5px #06080a; }
  .sf-wradial--in .sf-wradial__wedge--disabled { opacity:.4; cursor:not-allowed; }
  .sf-wradial__wedge--disabled:hover { color:var(--dp-ink-dim, #b7b4a6); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__glyph, .sf-wradial__wedge--disabled:hover .sf-wradial__key { color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__seg path { stroke:rgb(255 236 204 / .13); stroke-width:2; filter:none; }

  /* the hub: glass seated in a machined collar, naming who the order goes to */
  .sf-wradial__hub { position:absolute; left:50%; top:50%; width:124px; height:124px; transform:translate(-50%,-50%) scale(.9);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; border-radius:50%;
    border:7px solid transparent; box-sizing:border-box;
    background:radial-gradient(circle at 50% 30%, rgb(255 244 222 / .06), transparent 60%) padding-box,
      radial-gradient(circle, #121925, #0a0e14) padding-box,
      radial-gradient(circle at 38% 30%, #6b7384, #2d333e 55%, #14171d) border-box;
    box-shadow:0 10px 26px rgb(0 0 0 / .55), inset 0 3px 8px rgb(0 0 0 / .6), 0 0 0 1px #05070a;
    transition:transform .16s ease; color:var(--dp-ink, #e8e2d4); cursor:pointer; padding:0; pointer-events:auto; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:3px; }
  .sf-wradial__hub-title { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 760, "wdth" 66;
    font-size:var(--wr-type); letter-spacing:.18em; color:var(--dp-ink-dim, #b7b4a6); text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  .sf-wradial__hub-count { font-family:var(--dp-face-read, sans-serif); font-weight:650; font-size:24px; line-height:1;
    font-variant-numeric:tabular-nums; color:var(--dp-ink, #e8e2d4); text-shadow:0 0 10px rgb(205 222 255 / .18); }
  .sf-wradial__hub:hover .sf-wradial__hub-scope, .sf-wradial__hub:focus-visible .sf-wradial__hub-scope { color:var(--dp-lamp-hot, #ffd98c); }

  @media (prefers-reduced-motion:reduce) { .sf-wradial, .sf-wradial__hub, .sf-wradial__wedge { transition:none; } }
  html.sf-reduce-motion .sf-wradial, html.sf-reduce-motion .sf-wradial__hub, html.sf-reduce-motion .sf-wradial__wedge { transition:none; }
  html.sf-high-contrast .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:#fff; }
  @media (forced-colors:active) {
    .sf-wradial__bed, .sf-wradial__seg path { fill:Canvas; stroke:CanvasText; filter:none; }
    .sf-wradial__bezel, .sf-wradial__bezel-edge, .sf-wradial__graticule { stroke:CanvasText; }
    .sf-wradial__wedge { color:ButtonText; }
    .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:Highlight; }
    .sf-wradial__hub { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
    .sf-wradial__key, .sf-wradial__hub-scope { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
    .sf-wradial__lamp { forced-color-adjust:none; background:Canvas; box-shadow:0 0 0 1px CanvasText; }
  }
  /* A narrow window scales the whole dial; the legend size compensates so text holds 12px. */
  @media (max-width:760px), (max-height:560px) {
    .sf-wradial { transform:translate(-50%,-50%) scale(.72); --wr-type:16.7px; }
    .sf-wradial__face { width:150px; }
  }
  `;
  document.head.appendChild(s);
}

function focusSafely(element) {
  if (!element || typeof element.focus !== 'function') return false;
  try { element.focus({ preventScroll: true }); }
  catch (_) { try { element.focus(); } catch (_) { return false; } }
  return document.activeElement === element;
}
