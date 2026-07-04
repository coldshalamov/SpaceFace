// src/ui/wingmanRadial.js — the wingman command radial (Micro-Loops: "surfacing them as a quick
// radial on the comms key gives the player a taste of fleet control without leaving the cockpit").
//
// A four-wedge radial that pops at screen-center on the fleet-command key (bindings.fleetCommand / Z),
// issues a single order to the WHOLE deployed wing, and closes. Orders route through the existing
// ui:fleetOrder contract → automation.handleOrder → wingmen._onFleetOrder, so no new order plumbing:
//   Attack My Target → orderAttack (carries the player's current target id)
//   Form Up          → orderEscort (stick near the player)
//   Defend Me        → orderGuard  (hold near + protect the player)
//   Hold Position    → orderRecall (idle / hang back)
//
// Pure DOM + event listeners; reads state for the fleet + target, never mutates sim state (§0.6).
// The radial keeps the player's hands on thrust/trigger — open, pick, gone — matching the cockpit feel.

import { BINDINGS } from './bindings.js';

const STYLE_ID = 'sf-wingman-radial-style';

// N / E / S / W wedges. `order` is the ui:fleetOrder kind; `key` is the number-key shortcut.
const OPTIONS = [
  { key: '1', order: 'orderAttack', label: 'Attack Target', glyph: '⌖', pos: 'top', needsTarget: true },
  { key: '2', order: 'orderEscort', label: 'Form Up', glyph: '⛊', pos: 'right' },
  { key: '3', order: 'orderGuard', label: 'Defend Me', glyph: '⚔', pos: 'bottom' },
  { key: '4', order: 'orderRecall', label: 'Hold', glyph: '✦', pos: 'left' },
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

  const hub = document.createElement('div');
  hub.className = 'sf-wradial__hub';
  hub.innerHTML = '<span class="sf-wradial__hub-title">FLEET</span><span class="sf-wradial__hub-count mono">0</span>';
  overlay.appendChild(hub);
  const hubCount = hub.querySelector('.sf-wradial__hub-count');

  const wedgeEls = [];
  for (const opt of OPTIONS) {
    const wedge = document.createElement('button');
    wedge.type = 'button';
    wedge.className = `sf-wradial__wedge sf-wradial__wedge--${opt.pos}`;
    wedge.setAttribute('role', 'menuitem');
    wedge.innerHTML =
      `<span class="sf-wradial__glyph">${opt.glyph}</span>` +
      `<span class="sf-wradial__label">${opt.label}</span>` +
      `<span class="sf-wradial__key mono">${opt.key}</span>`;
    wedge.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); issue(opt); });
    overlay.appendChild(wedge);
    wedgeEls.push(wedge);
  }

  root.appendChild(overlay);

  let open = false;

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
    if (state.ui) state.ui.wingmanRadialOpen = true;
    hubCount.textContent = String(count);
    // Grey the Attack wedge when there's no target to focus.
    const hasTarget = state.player && state.player.targetId != null;
    wedgeEls[0].classList.toggle('sf-wradial__wedge--disabled', !hasTarget);
    overlay.hidden = false;
    overlay.classList.remove('sf-wradial--in'); void overlay.offsetWidth;
    overlay.classList.add('sf-wradial--in');
    document.addEventListener('keydown', onKey, true);
    bus.emit('audio:cue', { id: 'ui_open' });
  }

  function close() {
    if (!open) return;
    open = false;
    if (state.ui) state.ui.wingmanRadialOpen = false;
    overlay.classList.remove('sf-wradial--in');
    document.removeEventListener('keydown', onKey, true);
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
    const targetRef = opt.order === 'orderAttack' ? (state.player && state.player.targetId) : null;
    for (const fs of f) {
      bus.emit('ui:fleetOrder', { shipId: fs.id, order: opt.order, targetRef });
    }
    bus.emit('toast', { text: `Wing (${f.length}): ${opt.label}`, kind: 'good', ttl: 2 });
    bus.emit('audio:cue', { id: 'ui_confirm' });
    close();
  }

  function onKey(ev) {
    if (!open) return;
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      bus.emit('audio:cue', { id: 'ui_back' });
      close();
      return;
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
    background:rgba(6,12,22,.9); border:1px solid var(--visor-cyan, #39d0ff);
    box-shadow:0 0 18px rgba(57,208,255,.25), inset 0 0 14px rgba(57,208,255,.08);
    transition:transform .14s ease; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub-title { font-family:var(--mono); font-size:9px; letter-spacing:.18em; color:var(--visor-cyan, #39d0ff); }
  .sf-wradial__hub-count { font-family:var(--mono); font-size:16px; color:var(--text-primary, #eaf4ff); text-shadow:0 0 6px rgba(57,208,255,.5); }
  .sf-wradial__wedge { position:absolute; left:50%; top:50%; width:96px; height:66px; margin:-33px 0 0 -48px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
    background:rgba(6,12,22,.86); border:1px solid var(--panel-edge, rgba(120,160,200,.3)); border-radius:10px;
    color:var(--text-primary, #eaf4ff); font-family:var(--mono); cursor:pointer; pointer-events:auto;
    transition:transform .16s cubic-bezier(.2,.9,.3,1.2), border-color .12s, box-shadow .12s, opacity .12s; }
  .sf-wradial__wedge:hover, .sf-wradial__wedge:focus-visible {
    border-color:var(--visor-cyan, #39d0ff); box-shadow:0 0 16px rgba(57,208,255,.35); outline:none; }
  .sf-wradial__wedge--disabled { opacity:.4; }
  .sf-wradial__wedge--disabled:hover { border-color:var(--panel-edge, rgba(120,160,200,.3)); box-shadow:none; }
  .sf-wradial__glyph { font-size:18px; color:var(--visor-cyan, #39d0ff); line-height:1; }
  .sf-wradial__label { font-size:10px; letter-spacing:.04em; white-space:nowrap; }
  .sf-wradial__key { font-size:9px; color:var(--text-secondary, #9fb4cc); border:1px solid var(--panel-edge, rgba(120,160,200,.3));
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
