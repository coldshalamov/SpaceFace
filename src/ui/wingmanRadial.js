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
// W-F6 (Wave 3 recall-B): disc r170→150 — R_OUT 166→145 (bed r150 exactly),
// face + lamps re-seated on the same offsets (face mid-annulus, lamps bed+7).
const DIAL = 400;
const C = DIAL / 2;
const R_IN = 74;
const R_OUT = 145;
const HALF_SPAN = (44 * Math.PI) / 180;   // 88-degree keys, 2-degree hairline seams
const R_FACE = 110;                       // where each key's legend sits
const R_LAMP = 157;                       // the bezel lamps, one per key
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
    d += `M${pt(i % 15 === 0 ? 164 : 168, a)}L${pt(173, a)}`;
  }
  return d;
}
// W6: one static path for all four dividers — 1px bone 35% (see injectCss), each
// stopping 6px short of the hub and the rim.
function dividerPath() {
  let d = '';
  for (const deg of [45, 135, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    d += `M${pt(R_IN + 6, a)}L${pt(R_OUT - 6, a)}`;
  }
  return d;
}
// W1: the bed feathers out over its outer 40px through this radial alpha mask —
// one static SVG layer, zero per-frame cost (and no backdrop-filter over flight).
// W-F4 (recall-B): the segment paths share this mask, so the whole rim — bed
// AND segments — feathers 40px instead of the segments ending crisp at R_OUT.
const BED_FEATHER = 40;
const BED_OPAQUE_PCT = (((R_OUT + 5 - BED_FEATHER) / (R_OUT + 5)) * 100).toFixed(1);
const DIAL_SVG = '<svg class="sf-wradial__dial" viewBox="0 0 400 400" aria-hidden="true" focusable="false">'
  // The dial is printed (owner, 2026-09-22: no CSS or SVG imitating a material). It used to wear a
  // brushed-steel ring -- a metal gradient, a lit chamfer and a 512px brushed-texture pattern --
  // around smoked-glass wedges. Now: a flat bed, one hairline ring, flat wedges.
  + '<defs><radialGradient id="sf-wradial-bedfade" cx="50%" cy="50%" r="50%">'
  + `<stop offset="${BED_OPAQUE_PCT}%" stop-color="#fff"/>`
  + '<stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>'
  + `<mask id="sf-wradial-bedmask"><circle cx="${C}" cy="${C}" r="${R_OUT + 5}" fill="url(#sf-wradial-bedfade)"/></mask></defs>`
  + `<circle class="sf-wradial__bed" cx="${C}" cy="${C}" r="${R_OUT + 5}" mask="url(#sf-wradial-bedmask)"/>`
  + `<circle class="sf-wradial__bezel-edge" cx="${C}" cy="${C}" r="${R_LAMP}"/>`
  + `<path class="sf-wradial__graticule" d="${graticulePath()}"/>`
  + `<path class="sf-wradial__divider" d="${dividerPath()}"/>`
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
  hub.innerHTML = '<span class="sf-wradial__hub-title">ALL WINGS</span><span class="sf-wradial__hub-pips" aria-hidden="true"></span>'
    + '<span class="sf-wradial__hub-count mono">0</span>'
    + '<span class="sf-wradial__hub-switch"><span class="sf-wradial__hub-scope mono">TAB</span><span class="sf-wradial__hub-switchlabel">SWITCH WING</span></span>';
  overlay.insertAdjacentHTML('beforeend', DIAL_SVG);
  overlay.appendChild(hub);
  const hubTitle = hub.querySelector('.sf-wradial__hub-title');
  const hubCount = hub.querySelector('.sf-wradial__hub-count');
  const hubPips = hub.querySelector('.sf-wradial__hub-pips');
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
      `<svg class="sf-wradial__seg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><path d="${d}" mask="url(#sf-wradial-bedmask)"/></svg>` +
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
    wedge.addEventListener('mouseenter', () => pointHand(opt.pos));
    wedge.addEventListener('focus', () => pointHand(opt.pos));
    overlay.appendChild(wedge);
    wedgeEls.push(wedge);
  }

  // W2: the Hand — an amber arm from the hub edge to the chosen segment's outline,
  // swinging on transform (compositor) with a bead riding its tip. It sits above the
  // wedges; its root starts at the hub rim so it never crosses the hub content.
  const hand = document.createElement('div');
  hand.className = 'sf-wradial__hand';
  hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = '<span class="sf-wradial__hand-arm" aria-hidden="true"></span><span class="sf-wradial__hand-bead" aria-hidden="true"></span>';
  overlay.appendChild(hand);

  root.appendChild(overlay);

  let handAngle = null;
  function pointHand(pos) {
    const radians = POS_ANGLE[pos];
    if (radians == null) return;
    const deg = Math.round((radians * 180) / Math.PI);
    if (deg === handAngle) return;
    handAngle = deg;
    overlay.style.setProperty('--wr-hand', `${deg}deg`);
    // W-F1 (recall-B): the wedge under the Hand is the chosen verb — mark it
    // so its legend + fill carry chosen-state contrast. Same write cadence as
    // --wr-hand (selection change only), zero per-frame cost.
    for (let i = 0; i < wedgeEls.length; i++) {
      wedgeEls[i].classList.toggle('is-armed', !!OPTIONS[i] && OPTIONS[i].pos === pos && !wedgeEls[i].disabled);
    }
  }

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
    // The Hand rests on the first order the pilot can actually give.
    pointHand(!hasTarget && OPTIONS.length > 1 ? OPTIONS[1].pos : OPTIONS[0].pos);
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
    // One lamp per wingman (up to eight), lit for every recipient of the next order.
    const shown = Math.min(8, f.length);
    let pips = '';
    for (let i = 0; i < shown; i++) pips += `<i class="${scope === 'all' || i === selectedIndex ? 'is-on' : ''}"></i>`;
    hubPips.innerHTML = pips;
    const who = selected && (selected.name || selected.id);
    hubCount.textContent = scope === 'all'
      ? `${f.length} CRAFT`
      : String(who || `WING ${selectedIndex + 1}`).toUpperCase();
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
  /* W-F6: disc center y745 at 1080p (bottom lands ~895, clear of the drive block). */
  .sf-wradial { position:fixed; left:50%; top:69%; width:400px; height:400px; transform:translate(-50%,-50%);
    z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; --wr-type:12px; }
  .sf-wradial::before { content:""; position:absolute; inset:-50px; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle, rgb(5 7 10 / .62) 0%, rgb(5 7 10 / .38) 55%, transparent 70%); }
  .sf-wradial[hidden] { display:none; }
  .sf-wradial.sf-wradial--in { opacity:1; }
  .sf-wradial__dial { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  .sf-wradial__bed { fill:rgb(8 10 14 / .55); stroke:none; }
  .sf-wradial__bezel-edge { fill:none; stroke:rgb(232 226 212 / .22); stroke-width:1.5; }
  .sf-wradial__graticule { fill:none; stroke:rgb(232 226 212 / .3); stroke-width:1.2; stroke-linecap:round; }
  .sf-wradial__divider { fill:none; stroke:rgb(232 226 212 / .35); stroke-width:1; }

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
  /* W-F4: segments to 55% glass (the bed already is); the armed wedge holds
     .85 under W-F1 so the chosen verb keeps its contrast. */
  .sf-wradial__seg path { fill:rgb(12 15 20 / .55); stroke:rgb(232 226 212 / .12); stroke-width:1.5; transition:stroke .12s, fill .12s; }
  /* one sheet of glass, one reflection: a crisp-edged plane across the upper dial, so the top key
     catches most of it, the side keys its lower edge, the bottom key none; plus an inner shadow
     where the key seats into the ring */
  .sf-wradial__wedge::after { content:""; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(168deg, rgb(255 250 240 / .09) 0%, rgb(255 250 240 / .035) 36%, rgb(255 250 240 / 0) 37.5%),
      none; }
  .sf-wradial__face { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column;
    align-items:center; gap:5px; width:112px; pointer-events:none; text-align:center; }
  .sf-wradial__glyph { width:24px; height:24px; display:flex; align-items:center; justify-content:center;
    color:var(--dp-lamp-dim, #8a6b3a); opacity:.7; }
  .sf-wradial__glyph svg { display:block; }
  .sf-wradial__glyph .accent { fill:var(--dp-lamp-dim, #8a6b3a); }
  .sf-wradial__label { font-variation-settings:"wght" 760, "wdth" 72; font-size:var(--wr-type); letter-spacing:.14em;
    text-transform:uppercase; line-height:1.15; text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  /* W-F9: digits in the phos 12px numeral face (tabular), labels stay bone. */
  .sf-wradial__key { position:relative; z-index:0; display:inline-grid; place-items:center; width:22px; height:22px; padding:0 0 1px;
    box-sizing:border-box; background:none; border:0;
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 75; font-size:var(--wr-type);
    font-variant-numeric:tabular-nums;
    line-height:1; letter-spacing:.04em; color:var(--dp-phos, #dfeeff); }
  .sf-wradial__key::before { content:""; position:absolute; inset:2px; z-index:-1; transform:rotate(45deg);
    border:1px solid rgb(232 226 212 / .75); background:rgb(8 10 14 / .55); }
  .sf-wradial__hub-scope { display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px;
    box-sizing:border-box; border-style:solid; border-color:transparent; border-width:3px 4px 5px;
    border-image:none;
    background:var(--dp-metal-3, #232833);
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 75; font-size:var(--wr-type);
    line-height:1; letter-spacing:.04em; color:var(--dp-ink, #e8e2d4); }

  /* the bezel lamps: dark lenses at rest, lit over the key under the pilot's hand */
  .sf-wradial__lamp { position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px; border-radius:50%; pointer-events:none;
    background:linear-gradient(var(--dp-rule-hi) 0 0);
    box-shadow:0 1px 0 1.5px rgb(255 236 204 / .1); }

  /* W2: the Hand — a rotating pointer at the dial centre; the visible arm runs from
     the hub rim (r68) to the outline (r145), amber with a geometric bloom twin and a
     bead on its tip. Rotation rides --wr-hand on transform (compositor) with a spring
     swing; JS writes the property only when the chosen segment changes. */
  .sf-wradial__hand { position:absolute; left:200px; top:200px; width:0; height:0; z-index:5;
    transform:rotate(var(--wr-hand, -90deg)); transform-origin:0 50%; pointer-events:none;
    transition:transform .38s cubic-bezier(.2,.9,.25,1.12); }
  /* W-F6: arm re-tipped hub-rim r68 → outline r145. W-F7: the bead's 8px 25%
     halo twin — static geometry, never a filter. */
  .sf-wradial__hand-arm { position:absolute; left:68px; top:-1px; width:77px; height:2px;
    background:linear-gradient(90deg, rgb(242 185 80 / .1), var(--dp-lamp, #f2b950)); }
  .sf-wradial__hand-arm::before { content:""; position:absolute; left:0; top:-2px; width:100%; height:6px;
    background:linear-gradient(90deg, transparent, rgb(242 185 80 / .22)); }
  .sf-wradial__hand-bead { position:absolute; left:141.5px; top:-3.5px; width:7px; height:7px; border-radius:50%;
    background:var(--dp-lamp-hot, #ffd98c);
    box-shadow:0 0 7px rgb(242 185 80 / .5), 0 0 14px rgb(242 185 80 / .25); }
  .sf-wradial__hand-bead::after { content:""; position:absolute; inset:-4px; border-radius:50%;
    background:rgb(242 185 80 / .25); }

  /* selection: lamp lit, legend amber, amber inner edge - one language with every deckplate row */
  .sf-wradial__wedge:is(:hover, :focus-visible) { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__label { text-shadow:0 0 10px var(--dp-lamp-bloom, rgb(242 185 80 / .34)); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph { color:var(--dp-lamp-hot, #ffd98c); opacity:1; }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph .accent { fill:var(--dp-lamp, #f2b950); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__key { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path {
    stroke:var(--dp-lamp, #f2b950); stroke-width:4; filter:drop-shadow(0 0 6px rgb(242 185 80 / .45)); }
  /* W-F1: the chosen verb under the Hand — phos legend (≈L222, ≥4.5:1 on the
     held fill below) on a .85 fill that stays solid while siblings go glass. */
  .sf-wradial__wedge.is-armed .sf-wradial__label { color:var(--dp-phos, #dfeeff);
    text-shadow:0 1px 0 rgb(0 0 0 / .8), 0 0 10px rgb(205 222 255 / .25); }
  .sf-wradial__wedge.is-armed .sf-wradial__seg path { fill:rgb(12 15 20 / .85); }
  .sf-wradial:has(.sf-wradial__wedge--top:is(:hover, :focus-visible)) .sf-wradial__lamp--top,
  .sf-wradial:has(.sf-wradial__wedge--right:is(:hover, :focus-visible)) .sf-wradial__lamp--right,
  .sf-wradial:has(.sf-wradial__wedge--bottom:is(:hover, :focus-visible)) .sf-wradial__lamp--bottom,
  .sf-wradial:has(.sf-wradial__wedge--left:is(:hover, :focus-visible)) .sf-wradial__lamp--left {
    background:linear-gradient(var(--dp-lamp) 0 0);
    box-shadow:0 0 7px var(--dp-lamp-bloom, rgb(242 185 80 / .34)), 0 0 16px var(--dp-lamp-bloom-soft, rgb(242 185 80 / .16)); }
  .sf-wradial--in .sf-wradial__wedge--disabled { opacity:.4; cursor:not-allowed; }
  .sf-wradial__wedge--disabled:hover { color:var(--dp-ink-dim, #b7b4a6); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__glyph { color:var(--dp-lamp-dim, #8a6b3a); opacity:.7; }
  .sf-wradial__wedge--disabled:hover .sf-wradial__key { color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__seg path { stroke:rgb(255 236 204 / .13); stroke-width:2; filter:none; }

  /* the hub: glass seated in a machined collar, naming who the order goes to */
  /* W-F5: content rode ~12px high — padding-top:24px drops the content-box
     center exactly 12px (border-box 140, border 7). */
  .sf-wradial__hub { position:absolute; left:50%; top:50%; width:140px; height:140px; transform:translate(-50%,-50%) scale(.9);
    display:grid; place-content:center; justify-items:center; gap:4px; border-radius:50%; padding:24px 0 0;
    border:7px solid transparent; box-sizing:border-box;
    background:radial-gradient(circle at 50% 30%, rgb(255 244 222 / .06), transparent 60%) padding-box,
      radial-gradient(circle, #121925, #0a0e14) padding-box,
      radial-gradient(circle at 38% 30%, #6b7384, #2d333e 55%, #14171d) border-box;
    box-shadow:none;
    transition:transform .16s ease; color:var(--dp-ink, #e8e2d4); cursor:pointer; pointer-events:auto; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:3px; }
  .sf-wradial__hub-title { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 760, "wdth" 66;
    font-size:var(--wr-type); letter-spacing:.18em; color:var(--dp-ink-dim, #b7b4a6); text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  .sf-wradial__hub-count { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 700, "wdth" 70; font-size:var(--wr-type);
    letter-spacing:.12em; line-height:1; max-width:112px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-variant-numeric:tabular-nums; color:var(--dp-ink, #e8e2d4); text-shadow:0 0 10px rgb(205 222 255 / .18); }
  .sf-wradial__hub-pips { display:flex; gap:5px; justify-content:center; min-height:8px; }
  .sf-wradial__hub-pips i { display:block; width:7px; height:7px; border-radius:50%;
    background:linear-gradient(var(--dp-rule-hi) 0 0); box-shadow:none; }
  .sf-wradial__hub-pips i.is-on { background:linear-gradient(var(--dp-ink) 0 0);
    box-shadow:0 0 5px rgb(232 226 212 / .3); }
  .sf-wradial__hub:hover .sf-wradial__hub-scope, .sf-wradial__hub:focus-visible .sf-wradial__hub-scope { color:var(--dp-lamp-hot, #ffd98c); }
  /* W4: TAB is a key chip with a job title, never bare text. */
  .sf-wradial__hub-switch { display:flex; align-items:center; gap:6px; }
  .sf-wradial__hub-switchlabel { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 700, "wdth" 68;
    font-size:12px; letter-spacing:.06em; line-height:1; white-space:nowrap; color:var(--dp-ink-dim, #b7b4a6); }

  @media (prefers-reduced-motion:reduce) { .sf-wradial, .sf-wradial__hub, .sf-wradial__wedge, .sf-wradial__hand { transition:none; } }
  html.sf-reduce-motion .sf-wradial, html.sf-reduce-motion .sf-wradial__hub, html.sf-reduce-motion .sf-wradial__wedge, html.sf-reduce-motion .sf-wradial__hand { transition:none; }
  html.sf-high-contrast .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:#fff; }
  @media (forced-colors:active) {
    .sf-wradial__bed, .sf-wradial__seg path { fill:Canvas; stroke:CanvasText; filter:none; }
    .sf-wradial__bezel-edge, .sf-wradial__graticule, .sf-wradial__divider { stroke:CanvasText; }
    .sf-wradial__wedge { color:ButtonText; }
    .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:Highlight; }
    .sf-wradial__hub { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
    .sf-wradial__key, .sf-wradial__hub-scope { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
    .sf-wradial__key::before { border-color:ButtonText; background:Canvas; }
    .sf-wradial__glyph { color:CanvasText; opacity:1; }
    .sf-wradial__glyph .accent { fill:CanvasText; }
    .sf-wradial__hand-arm { background:Highlight; }
    .sf-wradial__hand-arm::before { background:none; }
    .sf-wradial__hand-bead { background:Highlight; box-shadow:none; }
    .sf-wradial__hand-bead::after { background:none; }
    .sf-wradial__wedge.is-armed .sf-wradial__label { color:CanvasText; }
    .sf-wradial__wedge.is-armed .sf-wradial__seg path { fill:Canvas; }
    .sf-wradial__hub-switchlabel { color:CanvasText; }
    .sf-wradial__lamp { forced-color-adjust:none; background:Canvas; box-shadow:0 0 0 1px CanvasText; }
  }
  /* W10: below 1400px the host scales to .8 so the disc stops eating the frame;
     the legend size compensates so type holds 12px. */
  @media (max-width:1399px) {
    .sf-wradial { transform:translate(-50%,-50%) scale(.8); --wr-type:15px; }
    .sf-wradial__face { width:140px; }
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
