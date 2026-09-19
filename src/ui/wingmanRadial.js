// src/ui/wingmanRadial.js — the wingman command radial (Micro-Loops: "surfacing them as a quick
// radial on the comms key gives the player a taste of fleet control without leaving the cockpit").
//
// A four-wedge radial that pops at screen-center on the fleet-command key (bindings.fleetCommand / Z),
// issues one batched ui:wingOrder intent and closes. The hub cycles ALL / a selected recipient;
// the surrounding four-wedge geometry remains unchanged.
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
  hub.innerHTML = '<span class="sf-wradial__hub-title">ALL</span><span class="sf-wradial__hub-count mono">0</span><span class="sf-wradial__hub-scope mono">TAB</span>';
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
    wedge.innerHTML =
      `<span class="sf-wradial__glyph">${dpIcon(opt.icon, 24)}</span>` +
      `<span class="sf-wradial__label">${opt.label}</span>` +
      `<span class="sf-wradial__key mono">${opt.key}</span>`;
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
    hubTitle.textContent = scope === 'all' ? 'ALL' : 'SELECTED';
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
  /* Deckplate (FRONTEND_PROGRAM Wave 1): the wingman radial is a physical command dial - a round
     binnacle hub (machined ring around glass) and four command keycaps with LED pips, the filled
     icon family and the device's own key cap. Amber only on what is armed or focused. */
  .sf-wradial { position:fixed; left:50%; top:50%; width:420px; height:320px; transform:translate(-50%,-50%);
    z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; }
  .sf-wradial::before { content:""; position:absolute; inset:-30px; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle, rgb(5 7 10 / .62) 0%, rgb(5 7 10 / .38) 48%, transparent 70%); }
  .sf-wradial[hidden] { display:none; }
  .sf-wradial.sf-wradial--in { opacity:1; }
  .sf-wradial__hub { position:absolute; left:50%; top:50%; width:92px; height:92px; transform:translate(-50%,-50%) scale(.9);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; border-radius:50%;
    border:7px solid transparent; box-sizing:border-box;
    background:var(--dp-glass-layers, #0c1118) padding-box,
      radial-gradient(circle at 38% 30%, #6b7384, #2d333e 55%, #14171d) border-box;
    box-shadow:0 10px 26px rgb(0 0 0 / .55), inset 0 3px 8px rgb(0 0 0 / .6), 0 0 0 1px #05070a;
    transition:transform .14s ease; color:var(--dp-ink, #e8e2d4); cursor:pointer; padding:0; pointer-events:auto; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:4px; }
  .sf-wradial__hub-title { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 760, "wdth" 70;
    font-size:12px; letter-spacing:.2em; color:var(--dp-ink-mute, #96948e); }
  .sf-wradial__hub-count { font-family:var(--dp-face-read, sans-serif); font-weight:650; font-size:22px; line-height:1;
    font-variant-numeric:tabular-nums; color:var(--dp-lamp-hot, #ffd98c); text-shadow:0 0 12px var(--dp-lamp-bloom, rgb(242 185 80 / .34)); }
  .sf-wradial__hub-scope { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 760, "wdth" 70;
    font-size:12px; letter-spacing:.14em; color:var(--dp-ink-mute, #96948e); }
  .sf-wradial__wedge { position:absolute; left:50%; top:50%; width:156px; height:76px; margin:-38px 0 0 -78px; box-sizing:border-box;
    display:grid; grid-template-columns:auto 1fr; grid-template-rows:1fr auto; align-items:center; column-gap:8px; row-gap:3px;
    border-style:solid; border-color:transparent; border-width:10px 10px 12px;
    border-image:url("/assets/ui/deckplate/hw/keycap.svg") 10 10 12 / 10px 10px 12px / 0 stretch;
    background:var(--dp-tex-brushed, none) 0 0 / 512px repeat border-box, var(--dp-metal-3, #232833);
    padding:0 8px 0 18px; color:var(--dp-ink-dim, #b7b4a6); cursor:pointer; pointer-events:auto; text-align:left;
    font-family:var(--dp-face-etch, sans-serif);
    transition:transform .16s cubic-bezier(.2,.9,.3,1.2), filter .12s, color .12s, opacity .12s; }
  .sf-wradial__wedge::before { content:""; position:absolute; left:2px; top:50%; width:7px; height:7px; margin-top:-3.5px; border-radius:50%;
    background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%);
    box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .6); }
  .sf-wradial__wedge:hover, .sf-wradial__wedge:focus-visible { color:var(--dp-ink, #e8e2d4); filter:brightness(1.12); }
  #sf-wingman-radial .sf-wradial__wedge:focus, #sf-wingman-radial .sf-wradial__wedge:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:3px; }
  .sf-wradial__wedge:hover::before, .sf-wradial__wedge:focus-visible::before {
    background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot, #ffd98c) 22%, var(--dp-lamp, #f2b950) 55%, var(--dp-lamp-dim, #8a6b3a) 100%);
    box-shadow:0 0 6px var(--dp-lamp-bloom, rgb(242 185 80 / .34)), 0 0 14px var(--dp-lamp-bloom-soft, rgb(242 185 80 / .16)); }
  .sf-wradial__wedge--disabled { opacity:.42; filter:saturate(.5); }
  .sf-wradial__wedge--disabled:hover { filter:saturate(.5); }
  .sf-wradial__wedge--disabled:hover::before { background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); box-shadow:none; }
  .sf-wradial__wedge:disabled { cursor:not-allowed; }
  .sf-wradial__glyph { grid-row:1 / span 2; width:24px; height:24px; display:flex; align-items:center; justify-content:center; color:var(--dp-ink-dim, #b7b4a6); }
  .sf-wradial__glyph svg { display:block; }
  .sf-wradial__glyph .accent { fill:var(--dp-lamp-dim, #8a6b3a); }
  .sf-wradial__wedge:hover .sf-wradial__glyph, .sf-wradial__wedge:focus-visible .sf-wradial__glyph { color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__wedge:hover .sf-wradial__glyph .accent, .sf-wradial__wedge:focus-visible .sf-wradial__glyph .accent { fill:var(--dp-lamp, #f2b950); }
  .sf-wradial__label { align-self:end; font-variation-settings:"wght" 760, "wdth" 72; font-size:12px; letter-spacing:.12em;
    text-transform:uppercase; white-space:normal; line-height:1.1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .sf-wradial__key { align-self:start; justify-self:start; display:inline-grid; place-items:center; min-width:18px; height:18px; padding:0 5px;
    box-sizing:border-box; border-radius:2px; background:rgb(0 0 0 / .55); box-shadow:inset 0 1px 1px rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .08);
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; color:var(--dp-ink, #e8e2d4); }
  /* wedge placement: the transform slides each key out from the hub to its compass point. */
  .sf-wradial__wedge--top    { transform:translate(0,-100px); }
  .sf-wradial__wedge--right  { transform:translate(136px,0); }
  .sf-wradial__wedge--bottom { transform:translate(0,100px); }
  .sf-wradial__wedge--left   { transform:translate(-136px,0); }
  .sf-wradial:not(.sf-wradial--in) .sf-wradial__wedge { transform:translate(0,0); opacity:0; }
  @media (prefers-reduced-motion:reduce) { .sf-wradial, .sf-wradial__hub, .sf-wradial__wedge { transition:none; } }
  @media (forced-colors:active) {
    .sf-wradial__hub, .sf-wradial__wedge { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
    .sf-wradial__wedge::before { forced-color-adjust:none; background:ButtonText; box-shadow:none; }
  }
  @media (max-width: 760px) {
    .sf-wradial { width:260px; height:260px; }
    .sf-wradial__wedge { width:104px; margin-left:-52px; }
    .sf-wradial__wedge--top { transform:translate(0,-86px); }
    .sf-wradial__wedge--right { transform:translate(100px,0); }
    .sf-wradial__wedge--bottom { transform:translate(0,86px); }
    .sf-wradial__wedge--left { transform:translate(-100px,0); }
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
