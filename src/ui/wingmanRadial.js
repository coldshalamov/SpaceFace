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
import { icon } from './station/icons.js';

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
      `<span class="sf-wradial__glyph">${icon(opt.icon, 18)}</span>` +
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
  .sf-wradial { position:fixed; left:50%; top:50%; width:280px; height:280px; transform:translate(-50%,-50%);
    z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; }
  .sf-wradial[hidden] { display:none; }
  .sf-wradial.sf-wradial--in { opacity:1; }
  .sf-wradial__hub { position:absolute; left:50%; top:50%; width:74px; height:74px; transform:translate(-50%,-50%) scale(.9);
    display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:50%;
    background:rgba(6,12,22,.9); border:1px solid var(--visor-cyan, #4f8fdd);
    box-shadow:0 0 18px rgba(79,143,221,.25), inset 0 0 14px rgba(79,143,221,.08);
    transition:transform .14s ease; color:inherit; cursor:pointer; padding:0; pointer-events:auto; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub-title { font-family:var(--mono); font-size:12px; letter-spacing:.18em; color:var(--visor-cyan, #4f8fdd); }
  .sf-wradial__hub-count { font-family:var(--mono); font-size:16px; color:var(--text-primary, #eaf4ff); text-shadow:0 0 6px rgba(79,143,221,.5); }
  .sf-wradial__hub-scope { font-size:12px; color:var(--text-secondary, #9fb4cc); }
  .sf-wradial__wedge { position:absolute; left:50%; top:50%; width:96px; height:66px; margin:-33px 0 0 -48px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
    background:rgba(6,12,22,.86); border:1px solid var(--panel-edge, rgba(120,160,200,.3)); border-radius:10px;
    color:var(--text-primary, #eaf4ff); font-family:var(--mono); cursor:pointer; pointer-events:auto;
    transition:transform .16s cubic-bezier(.2,.9,.3,1.2), border-color .12s, box-shadow .12s, opacity .12s; }
  .sf-wradial__wedge:hover, .sf-wradial__wedge:focus-visible {
    border-color:var(--visor-cyan, #4f8fdd); box-shadow:0 0 16px rgba(79,143,221,.35); outline:none; }
  .sf-wradial__wedge--disabled { opacity:.4; }
  .sf-wradial__wedge--disabled:hover { border-color:var(--panel-edge, rgba(120,160,200,.3)); box-shadow:none; }
  .sf-wradial__wedge:disabled { cursor:not-allowed; }
  .sf-wradial__glyph { font-size:18px; color:var(--visor-cyan, #4f8fdd); line-height:1; width:18px; height:18px; display:flex; align-items:center; justify-content:center; }
  .sf-wradial__glyph svg { display:block; }
  .sf-wradial__label { font-size:12px; letter-spacing:.04em; white-space:nowrap; }
  .sf-wradial__key { font-size:12px; color:var(--text-secondary, #9fb4cc); border:1px solid var(--panel-edge, rgba(120,160,200,.3));
    border-radius:3px; padding:0 4px; }
  /* wedge placement: the transform slides each wedge out from center to its compass point. */
  .sf-wradial__wedge--top    { transform:translate(0,-92px); }
  .sf-wradial__wedge--right  { transform:translate(96px,0); }
  .sf-wradial__wedge--bottom { transform:translate(0,92px); }
  .sf-wradial__wedge--left   { transform:translate(-96px,0); }
  .sf-wradial:not(.sf-wradial--in) .sf-wradial__wedge { transform:translate(0,0); opacity:0; }
  @media (max-width: 760px) {
    .sf-wradial { width:240px; height:240px; }
    .sf-wradial__wedge { width:84px; }
    .sf-wradial__wedge--top { transform:translate(0,-78px); }
    .sf-wradial__wedge--right { transform:translate(84px,0); }
    .sf-wradial__wedge--bottom { transform:translate(0,78px); }
    .sf-wradial__wedge--left { transform:translate(-84px,0); }
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
