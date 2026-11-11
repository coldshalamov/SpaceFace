// src/ui/contextWheel.js — the G18-02 "one set of keys" context wheel (EC-G18).
//
// Every verb that is not on the unified six-input table lives here: hold Q (or hold-Y on a pad)
// to open, aim at a slice, release to choose. Tap slices fire one edge; level slices are
// input-owned LATCHES — choose once to engage, choose again to release — and the bezel lamp on
// a latched slice stays lit while it runs. Only slices the current input context admits are
// shown (a fight hides the travel drive until the hull is low, station/map contexts never open).
//
// The dial speaks the wingman radial's language (annular clip-path keys in one machined ring,
// bezel lamps, glass hub) so the two hold-to-pick surfaces read as one component family.
//
// Slice choices reach the sim through the input system's applyWheelVerb — a direct call on the
// main lane, a 'wheelVerb' DOM descriptor through the lane facade under worker sim.

import { contextActionAllowed } from '../data/inputContexts.js';
import { isSwarmControls } from '../data/swarmControls.js';
import { selectedWorldSiteTarget } from '../systems/input.js';
import { injectFlightRadialsLayouts, syncRadialOwnsFrame } from './orrery/flight-radialsLayouts.js';
import { injectContextWheelLayouts } from './orrery/contextWheelLayouts.js';
import { laneDomEvent } from '../core/simLaneCommands.js';
import { dpIcon } from './deckplate/icons.js';

const DIAL = 400;
const C = DIAL / 2;
const R_IN = 74;
const R_OUT = 156;
const R_FACE = 116;
const R_LAMP = 166;
const GAP = (2.5 * Math.PI) / 180;    // hairline seams between keys
const CHOOSE_DEADZONE = 0.32;         // stick/pointer this far inside the hub picks nothing

// phase 'toggle' = latch slice; 'tap' = one edge. Order is the authored seat on the ring —
// combat context re-filters the list, so every seat lands on a live slice wherever it opens.
// Exported so help/settings surfaces can ask "is this verb a wheel slice" from one source.
export const SLICES = Object.freeze([
  { action: 'brake',            label: 'Full Stop',    icon: 'brake',    phase: 'toggle' },
  { action: 'aimedMine',        label: 'Mine Beam',    icon: 'mining',   phase: 'toggle', mineSlice: true },
  { action: 'siteBeam',         label: 'Site Beam',    icon: 'asteroid', phase: 'toggle', needsSite: true },
  { action: 'reelIn',           label: 'Winch In',     icon: 'line',     phase: 'toggle' },
  { action: 'reelOut',          label: 'Winch Out',    icon: 'line',     phase: 'toggle' },
  { action: 'strafeLeft',       label: 'Strafe ←',     icon: 'chevron-left',  phase: 'toggle' },
  { action: 'strafeRight',      label: 'Strafe →',     icon: 'chevron-right', phase: 'toggle' },
  { action: 'bulletTime',       label: 'Bullet Time',  icon: 'clock',    phase: 'toggle' },
  { action: 'gyreSnare',        label: 'Gyre Lash',    icon: 'cone',     phase: 'toggle' },
  { action: 'cloak',            label: 'Cloak',        icon: 'pod',      phase: 'tap' },
  { action: 'countermeasure',   label: 'Counter',      icon: 'shield',   phase: 'tap' },
  { action: 'scanPulse',        label: 'Scan',         icon: 'scan',     phase: 'tap' },
  { action: 'cycleBomb',        label: 'Ordnance',     icon: 'munitions', phase: 'tap' },
  { action: 'autoFire',         label: 'Auto-Aim',     icon: 'target',   phase: 'tap' },
  { action: 'travelBurn',       label: 'Travel Burn',  icon: 'drive',    phase: 'tap' },
  { action: 'cruise',           label: 'Cruise',       icon: 'engine',   phase: 'tap' },
  { action: 'jettisonLot',      label: 'Jettison',     icon: 'cargo',    phase: 'tap' },
  { action: 'deployBeacon',     label: 'Beacon',       icon: 'beacon',   phase: 'tap' },
  { action: 'deployShieldPylon', label: 'Pylon',       icon: 'energy',   phase: 'tap' },
  // Swarm only: deploys the next bought called charge (turret, wing, dome, decoy). The slice
  // exists only while the swarmCallins director holds a pending call — the allowlist alone
  // would show it in every Swarm round, charged or not.
  { action: 'callIn',           label: 'Call-in',      icon: 'hail',     phase: 'tap', needsCallin: true },
]);

function polarX(r, a) { return C + r * Math.cos(a); }
function polarY(r, a) { return C + r * Math.sin(a); }
function pt(r, a) { return `${polarX(r, a).toFixed(2)} ${polarY(r, a).toFixed(2)}`; }
function sectorPath(a0, a1) {
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  return `M${pt(R_OUT, a0)}A${R_OUT} ${R_OUT} 0 ${large} 1 ${pt(R_OUT, a1)}`
    + `L${pt(R_IN, a1)}A${R_IN} ${R_IN} 0 ${large} 0 ${pt(R_IN, a0)}Z`;
}

/** Is this slice usable in the place the player is standing? Mirrors the tick's gates. */
function sliceAllowed(state, slice, callinPending = 0) {
  if (slice.mineSlice) return !isSwarmControls(state);
  if (!contextActionAllowed(state, slice.action)) return false;
  if (slice.needsSite && !selectedWorldSiteTarget(state)) return false;
  if (slice.needsCallin && callinPending <= 0) return false;
  return true;
}

/** The live slices, in ring order. Exported so tests can pin reachability. */
export function contextWheelSlices(state, callinPending = 0) {
  return SLICES.filter((slice) => sliceAllowed(state, slice, callinPending));
}

export function createContextWheel(ctx) {
  const { bus, state } = ctx;
  const root = typeof document !== 'undefined' ? document.getElementById('ui-root') : null;
  if (!root) return { tick() {}, destroy() {} };

  injectContextWheelLayouts();
  injectFlightRadialsLayouts();

  const overlay = document.createElement('div');
  overlay.className = 'sf-cwheel';
  overlay.id = 'sf-context-wheel';
  overlay.setAttribute('role', 'menu');
  overlay.setAttribute('aria-label', 'Context wheel — hold, aim, release to choose');
  overlay.hidden = true;

  overlay.insertAdjacentHTML('beforeend',
    `<svg class="sf-cwheel__dial" viewBox="0 0 400 400" aria-hidden="true" focusable="false">`
    + `<circle class="sf-cwheel__bed" cx="${C}" cy="${C}" r="${R_OUT + 8}"/>`
    + `<circle class="sf-cwheel__bezel-edge" cx="${C}" cy="${C}" r="${R_LAMP}"/>`
    + `</svg>`);

  const hub = document.createElement('div');
  hub.className = 'sf-cwheel__hub';
  hub.innerHTML = '<span class="sf-cwheel__hub-title" data-k="title">CONTEXT</span>'
    + '<span class="sf-cwheel__hub-sub mono" data-k="sub">HOLD · AIM · RELEASE</span>';
  overlay.appendChild(hub);
  const hubTitle = hub.querySelector('[data-k="title"]');
  const hubSub = hub.querySelector('[data-k="sub"]');

  const wedgeHost = document.createElement('div');
  wedgeHost.className = 'sf-cwheel__wedgehost';
  overlay.appendChild(wedgeHost);

  root.appendChild(overlay);

  let open = false;
  let destroyed = false;
  let wedgeEls = [];
  let wedgeSlices = [];
  let aimIndex = -1;
  let lastSig = '';
  // A pointer choice closes the dial while the key is still held — don't reopen on the next
  // tick until the hold actually ends.
  let awaitRelease = false;
  // Swarm call-in depth, mirrored from the director's swarm:callinQueued publishes — the
  // queue itself is sim-owned, so the slice gates on this signal rather than reaching in.
  let callinPending = 0;
  const busOffs = [];

  function simInput() {
    const registry = ctx && ctx.registry;
    const sys = registry && typeof registry.get === 'function' ? registry.get('input') : null;
    return sys || null;
  }

  function latchOn(slice) {
    const sys = simInput();
    if (sys && typeof sys.wheelLatchOn === 'function') {
      try { return sys.wheelLatchOn(slice.action) === true; } catch (_) {}
    }
    const latches = state.input && state.input.wheelLatches;
    return !!(latches && latches[slice.action]);
  }

  // The slices usable right now. A wheel that re-sorts while held would move the aim off the
  // pilot's slice, so the layout is captured at open and only the ON lamps refresh per tick.
  function liveSlices() {
    return SLICES.filter((slice) => sliceAllowed(state, slice, callinPending));
  }

  function buildWedges() {
    wedgeHost.replaceChildren();
    wedgeEls = [];
    const slices = wedgeSlices;
    const n = slices.length;
    const span = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const slice = slices[i];
      // Seat 0 at twelve o'clock, clockwise — the same compass the wingman dial teaches.
      const a = -Math.PI / 2 + i * span;
      const a0 = a - span / 2 + GAP / 2;
      const a1 = a + span / 2 - GAP / 2;
      const wedge = document.createElement('button');
      wedge.type = 'button';
      wedge.className = 'sf-cwheel__wedge';
      wedge.dataset.action = slice.action;
      wedge.setAttribute('role', 'menuitem');
      wedge.setAttribute('aria-label', `${slice.label}${slice.phase === 'toggle' ? ' (latch)' : ''}`);
      const d = sectorPath(a0, a1);
      wedge.style.clipPath = `path('${d}')`;
      wedge.innerHTML =
        `<svg class="sf-cwheel__seg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
        + `<span class="sf-cwheel__face" style="left:${polarX(R_FACE, a).toFixed(1)}px;top:${polarY(R_FACE, a).toFixed(1)}px">`
        + `<span class="sf-cwheel__glyph">${dpIcon(slice.icon, 22)}</span>`
        + `<span class="sf-cwheel__label">${slice.label}</span></span>`;
      wedge.style.setProperty('--wr-delay', `${i * 14}ms`);
      const lamp = document.createElement('span');
      lamp.className = 'sf-cwheel__lamp';
      lamp.setAttribute('aria-hidden', 'true');
      lamp.style.left = `${polarX(R_LAMP, a).toFixed(1)}px`;
      lamp.style.top = `${polarY(R_LAMP, a).toFixed(1)}px`;
      wedgeHost.appendChild(lamp);
      wedge.dataset.lampIndex = String(wedgeHost.childElementCount - 1);
      // Pointer taps work too: a click fires the slice without waiting for the key release.
      wedge.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); choose(slice, 'pointer'); });
      wedgeHost.appendChild(wedge);
      wedgeEls.push(wedge);
      slice._lamp = lamp;
      slice._angle = a;
    }
  }

  function refreshLamps() {
    for (const slice of wedgeSlices) {
      const on = slice.phase === 'toggle' && latchOn(slice);
      if (slice._lamp) slice._lamp.classList.toggle('is-on', on);
    }
    // The hub names what the pilot is aiming at — the wingman dial's one-reading rule.
    const aimed = aimIndex >= 0 && aimIndex < wedgeSlices.length ? wedgeSlices[aimIndex] : null;
    const text = aimed ? aimed.label.toUpperCase() : 'CONTEXT';
    if (hubTitle.textContent !== text) hubTitle.textContent = text;
    const sub = aimed && aimed.phase === 'toggle' && latchOn(aimed)
      ? 'ON — RELEASE TO STOP'
      : aimed
        ? (aimed.phase === 'toggle' ? 'LATCH ON' : 'TAP')
        : 'HOLD · AIM · RELEASE';
    if (hubSub.textContent !== sub) hubSub.textContent = sub;
  }

  // Aim comes from wherever the player's attention already is: the pointer position for a
  // mouse hand, the aim stick for a pad hand. Both read as an angle from the hub.
  function aimAngleFromInputs() {
    const inp = state.input;
    const ps = inp && inp.pointerScreen;
    const rect = overlay.getBoundingClientRect();
    if (ps && ps.active && Number.isFinite(ps.x) && Number.isFinite(ps.y)) {
      const dx = ps.x - (rect.left + rect.width / 2);
      const dy = ps.y - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) > CHOOSE_DEADZONE * rect.width * 0.5) return Math.atan2(dy, dx);
      return null;
    }
    const gp = ctx && ctx.gamepad;
    if (gp && typeof gp.isConnected === 'function' && gp.isConnected() && gp.axes) {
      const rx = Number(gp.axes.rightX) || 0;
      const ry = Number(gp.axes.rightY) || 0;
      const lx = Number(gp.axes.leftX) || 0;
      const ly = Number(gp.axes.leftY) || 0;
      if (Math.hypot(rx, ry) > CHOOSE_DEADZONE) return Math.atan2(ry, rx);
      if (Math.hypot(lx, ly) > CHOOSE_DEADZONE) return Math.atan2(ly, lx);
    }
    return null;
  }

  function updateAim() {
    const n = wedgeSlices.length;
    let index = -1;
    const angle = aimAngleFromInputs();
    if (angle != null && n) {
      const span = (Math.PI * 2) / n;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        let d = angle - wedgeSlices[i]._angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < best) { best = Math.abs(d); index = i; }
      }
      if (best > span) index = -1;
    }
    if (index !== aimIndex) {
      aimIndex = index;
      for (let i = 0; i < wedgeEls.length; i++) {
        wedgeEls[i].classList.toggle('is-aimed', i === aimIndex);
      }
    }
  }

  function applyVerb(slice) {
    const sys = simInput();
    const payload = { action: slice.action, phase: slice.phase };
    if (sys && typeof sys.applyWheelVerb === 'function') {
      try { if (sys.applyWheelVerb(payload) === true) return true; } catch (_) {}
    }
    // Worker lane: the facade ships the same descriptor the sim's ingest handles.
    return laneDomEvent({ type: 'wheelVerb', action: slice.action, phase: slice.phase });
  }

  function choose(slice, source = 'wheel-release') {
    if (!slice) return false;
    const ok = applyVerb(slice);
    if (ok) {
      bus.emit('audio:cue', { id: 'ui_confirm' });
    } else {
      bus.emit('audio:cue', { id: 'ui_deny' });
    }
    awaitRelease = true;
    close();
    return ok;
  }

  function openWheel() {
    if (open || destroyed) return false;
    const slices = liveSlices();
    if (!slices.length) return false;
    open = true;
    wedgeSlices = slices;
    aimIndex = -1;
    lastSig = slices.map((s) => s.action).join('|');
    buildWedges();
    overlay.hidden = false;
    overlay.classList.remove('sf-cwheel--in');
    void overlay.offsetWidth;
    overlay.classList.add('sf-cwheel--in');
    if (state.ui) state.ui.contextWheelOpen = true;
    syncRadialOwnsFrame();
    bus.emit('audio:cue', { id: 'ui_open' });
    refreshLamps();
    return true;
  }

  function close(chooseAimed = false) {
    if (!open) return;
    const aimed = chooseAimed && aimIndex >= 0 && aimIndex < wedgeSlices.length
      ? wedgeSlices[aimIndex] : null;
    if (aimed) { choose(aimed); return; }
    open = false;
    wedgeSlices = [];
    wedgeEls = [];
    aimIndex = -1;
    lastSig = '';
    overlay.classList.remove('sf-cwheel--in');
    if (state.ui) state.ui.contextWheelOpen = false;
    wedgeHost.replaceChildren();
    // let the fade-out play before hiding
    setTimeout(() => { if (!open) { overlay.hidden = true; syncRadialOwnsFrame(); } }, 160);
  }

  function tick() {
    if (destroyed) return;
    const held = !!(state.input && state.input.actions && state.input.actions.contextWheel === true);
    if (!held) awaitRelease = false;
    if (held && !open && !awaitRelease) openWheel();
    else if (!held && open) close(true);
    if (!open) return;
    // The context may re-filter mid-hold (a fight ends, a site deselects): the seat layout is
    // stable for the hold, but a slice that went illegal in context simply can't fire.
    const sig = wedgeSlices.map((s) => s.action).join('|');
    if (sig !== lastSig) { /* layout is open-owned; sig kept for future rebalance */ lastSig = sig; }
    updateAim();
    refreshLamps();
  }

  function destroy() {
    destroyed = true;
    if (open) close();
    if (state.ui) state.ui.contextWheelOpen = false;
    for (const off of busOffs) {
      try { if (typeof off === 'function') off(); } catch (_) {}
    }
    busOffs.length = 0;
    overlay.remove();
  }

  // Flight is left (dock / death / screen) → the verb drops with it, same contract as the
  // neutralized flight input the wheel feeds.
  if (bus && typeof bus.on === 'function') {
    busOffs.push(bus.on('mode:changed', () => { if (open && state.mode !== 'flight') close(); }));
    busOffs.push(bus.on('dock:docked', () => close()));
    // The Call-in slice is gated on a charge actually waiting for deploy — a new run starts
    // with an empty pile even if the last one ended charged.
    busOffs.push(bus.on('swarm:callinQueued', (p) => {
      callinPending = Math.max(0, (p && Number.isFinite(p.pending) ? p.pending : 0) | 0);
    }));
    busOffs.push(bus.on('run:started', () => { callinPending = 0; }));
    busOffs.push(bus.on('run:ended', () => { callinPending = 0; }));
  }

  return { tick, destroy, get isOpen() { return open; }, choose, open: openWheel, close };
}
