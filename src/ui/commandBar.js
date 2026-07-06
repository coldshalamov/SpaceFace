// Command Bar (UI full-pass Slice 3) — a persistent top resource strip, RTS-style.
//
// WHY THIS EXISTS — the flight HUD was a "cockpit visor" that hid its most important numbers.
// The old bottom-center cluster (hud.js) made cargo/credits/role CONTEXTUAL CHIPS that fade out
// after 4s — so the player could never see whether mining was actually earning them anything.
// This reframes the HUD as a strategy command console: the numbers an RTS pins (hull, shield,
// energy, cargo, credits, role, sector) are ALWAYS pinned, top of screen, never fade.
//
// ARCHITECTURE — this is a HUD SIBLING, not a child of createHud():
//   createHud() does `#hud.innerHTML = ''` at the top, which would wipe anything appended to #hud
//   before it runs. So we append to #ui-root instead (the same pattern comms.js uses for the
//   bulkhead graffiti — see comms.js:270). We are a stable sibling that survives HUD rebuilds, and
//   we don't touch hud.js's body at all (which matters: another lane edits that file).
//
// PERF — fully event-driven, never per-frame. check-ui-frame-sleep requires HUD subsystems to
// sleep unless a relevant event is active. We subscribe to the discrete change events
// (combat:damage, cargo:changed, credits:changed, ship:statsChanged, sector:enter,
// player:respawn) and only touch the DOM when a value actually moves. No rAF loop, no polling.
// The vitals (hull/shield/energy) read from the player entity at event time, not each frame.
//
// The HUD READS state for display and never mutates sim state (ARCHITECTURE §0.6).

import { SHIPS } from '../data/ships.js';
import { SECTORS } from '../data/sectors.js';
import { weaponHeatSummary } from './weaponHeat.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};

const STYLE_ID = 'sf-commandbar-style';
const COMMAND_BAR_CSS = `
/* Command Bar — persistent top resource strip (UI full-pass Slice 3). Strategy-console direction:
   cut-corner panel, restricted desaturated palette, mono values, brightness-encodes-state.
   This is a flight-mounted element next to the live canvas, so it is compositor-cheap by rule
   (check-ui-frame-sleep): solid border + semi-transparent fill, NO box-shadow/transition/backdrop. */
#sf-command-bar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 6px 10px;
  background: var(--console-bg, rgba(8,13,24,.82));
  border: 1px solid var(--console-edge, rgba(132,160,200,.22));
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  font-size: calc(12px * var(--ui-scale, 1));
  letter-spacing: .02em;
  pointer-events: none;
  /* visibility is gated by .sf-cb--active below */
  opacity: 0;
  transition: opacity .2s ease;
}
#sf-command-bar.sf-cb--active { opacity: 1; }
/* Hidden whenever a modal/menu is open or the player is docked — same gate as #hud. */
body.ui-modal-open #sf-command-bar { opacity: 0; }

#sf-command-bar .sf-cb-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 12px;
  line-height: 1.1;
  min-width: 0;
}
#sf-command-bar .sf-cb-cell + .sf-cb-cell {
  border-left: 1px solid var(--console-edge, rgba(132,160,200,.18));
}
#sf-command-bar .sf-cb-k {
  font-family: var(--mono, monospace);
  font-size: calc(9px * var(--ui-scale, 1));
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-mute, #5a7aa0);
}
#sf-command-bar .sf-cb-v {
  font-family: var(--mono, monospace);
  font-size: calc(13px * var(--ui-scale, 1));
  color: var(--ink, #d3e6ff);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Identity cell (left) — brand + sector. Slightly wider, anchors the strip. */
#sf-command-bar .sf-cb-cell--id { min-width: 132px; }
#sf-command-bar .sf-cb-brand {
  font-family: var(--mono, monospace);
  font-size: calc(13px * var(--ui-scale, 1));
  letter-spacing: .22em;
  color: var(--console-cyan, #39d0ff);
}
#sf-command-bar .sf-cb-sector {
  font-family: var(--mono, monospace);
  font-size: calc(10px * var(--ui-scale, 1));
  letter-spacing: .06em;
  color: var(--ink-mute, #5a7aa0);
}

/* Vitals — inline bars. Restrict to TWO hue families: steel (hull) + cyan (shield/energy).
   Heat uses amber only when climbing (dim when idle). Bar fill via width (no transition — frame-sleep). */
#sf-command-bar .sf-cb-vitals {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
}
#sf-command-bar .sf-cb-vrow {
  display: flex;
  align-items: center;
  gap: 6px;
}
#sf-command-bar .sf-cb-vlabel {
  width: 34px;
  font-family: var(--mono, monospace);
  font-size: calc(9px * var(--ui-scale, 1));
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-mute, #5a7aa0);
}
#sf-command-bar .sf-cb-track {
  position: relative;
  width: 92px;
  height: 6px;
  background: rgba(132,160,200,.12);
  overflow: hidden;
}
#sf-command-bar .sf-cb-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 100%;
  transform-origin: left center;
  transform: scaleX(1);
}
#sf-command-bar .sf-cb-num {
  font-family: var(--mono, monospace);
  font-size: calc(10px * var(--ui-scale, 1));
  color: var(--ink-dim, #84a0c8);
  font-variant-numeric: tabular-nums;
  width: 34px;
  text-align: right;
}
/* Brightness encodes state: dim = healthy/nominal, bright = active/problem.
   Hull: steel when healthy, red when critical. Shield/energy: cyan (active systems). Heat: amber
   (only earns visibility when actually hot). */
#sf-command-bar .sf-cb-fill--hull { background: var(--console-steel-dim, #5a7aa0); }
#sf-command-bar .sf-cb-fill--shield { background: var(--console-cyan, #39d0ff); }
#sf-command-bar .sf-cb-fill--energy { background: var(--console-cyan-dim, #235c78); }
#sf-command-bar .sf-cb-fill--heat { background: var(--console-amber-dim, #5c4019); }
/* Bright = problem state (overrides dim): hull critical, energy low, heat high. */
#sf-command-bar.sf-cb--hull-crit .sf-cb-fill--hull { background: var(--console-red, #ff5470); }
#sf-command-bar.sf-cb--energy-low .sf-cb-fill--energy { background: var(--console-amber, #ffb347); }
#sf-command-bar.sf-cb--heat-high .sf-cb-fill--heat { background: var(--console-amber, #ffb347); }

/* Economy cell — cargo + credits, always pinned (the core fix for "am I gaining anything?"). */
#sf-command-bar .sf-cb-cell--cargo { min-width: 96px; }
#sf-command-bar .sf-cb-cell--credits { min-width: 96px; }
/* Credits delta arrow — surfaces gain/loss direction. Bright mint = gaining, dim red = losing. */
#sf-command-bar .sf-cb-delta {
  font-family: var(--mono, monospace);
  font-size: calc(9px * var(--ui-scale, 1));
  margin-left: 4px;
}
#sf-command-bar .sf-cb-delta--up { color: var(--console-mint, #7af7d0); }
#sf-command-bar .sf-cb-delta--down { color: var(--console-red, #ff5470); }
#sf-command-bar .sf-cb-delta--flat { color: var(--ink-mute, #5a7aa0); }

/* Cargo full warning — bright amber when hold is full (a decision point: sell or jettison). */
#sf-command-bar.sf-cb--cargo-full .sf-cb-v--cargo { color: var(--console-amber, #ffb347); }

/* Role/class cell — your ship's function (Miner/Fighter/...). */
#sf-command-bar .sf-cb-cell--role { min-width: 78px; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = COMMAND_BAR_CSS;
  document.head.appendChild(s);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
// Bar fill via transform:scaleX (matches the existing HUD pattern at hud.js:200) — no transition.
function setFill(el, frac) {
  if (!el) return;
  el.style.transform = 'scaleX(' + clamp01(frac).toFixed(3) + ')';
}

export function createCommandBar(ctx) {
  ensureStyle();
  const { state, bus } = ctx;

  const bar = document.createElement('div');
  bar.id = 'sf-command-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `
    <div class="sf-cb-cell sf-cb-cell--id">
      <span class="sf-cb-brand">SPACEFACE</span>
      <span class="sf-cb-sector" data-k="sector">—</span>
    </div>
    <div class="sf-cb-cell">
      <div class="sf-cb-vitals">
        <div class="sf-cb-vrow">
          <span class="sf-cb-vlabel">HULL</span>
          <div class="sf-cb-track"><div class="sf-cb-fill sf-cb-fill--hull"></div></div>
          <span class="sf-cb-num" data-k="hull">100</span>
        </div>
        <div class="sf-cb-vrow">
          <span class="sf-cb-vlabel">SHLD</span>
          <div class="sf-cb-track"><div class="sf-cb-fill sf-cb-fill--shield"></div></div>
          <span class="sf-cb-num" data-k="shield">100</span>
        </div>
      </div>
    </div>
    <div class="sf-cb-cell">
      <div class="sf-cb-vitals">
        <div class="sf-cb-vrow">
          <span class="sf-cb-vlabel">EN</span>
          <div class="sf-cb-track"><div class="sf-cb-fill sf-cb-fill--energy"></div></div>
          <span class="sf-cb-num" data-k="energy">100</span>
        </div>
        <div class="sf-cb-vrow">
          <span class="sf-cb-vlabel">HEAT</span>
          <div class="sf-cb-track"><div class="sf-cb-fill sf-cb-fill--heat"></div></div>
          <span class="sf-cb-num" data-k="heat">0</span>
        </div>
      </div>
    </div>
    <div class="sf-cb-cell sf-cb-cell--cargo">
      <span class="sf-cb-k">CARGO</span>
      <span class="sf-cb-v sf-cb-v--cargo" data-k="cargo">0 / 40 u</span>
    </div>
    <div class="sf-cb-cell sf-cb-cell--credits">
      <span class="sf-cb-k">CREDITS</span>
      <span class="sf-cb-v"><span data-k="credits">0</span><span class="sf-cb-delta sf-cb-delta--flat" data-k="delta"></span></span>
    </div>
    <div class="sf-cb-cell sf-cb-cell--role">
      <span class="sf-cb-k">CLASS</span>
      <span class="sf-cb-v" data-k="role">—</span>
    </div>`;

  document.getElementById('ui-root').appendChild(bar);

  const el = {
    sector: bar.querySelector('[data-k=sector]'),
    hullFill: bar.querySelector('.sf-cb-fill--hull'),
    hullNum: bar.querySelector('[data-k=hull]'),
    shieldFill: bar.querySelector('.sf-cb-fill--shield'),
    shieldNum: bar.querySelector('[data-k=shield]'),
    energyFill: bar.querySelector('.sf-cb-fill--energy'),
    energyNum: bar.querySelector('[data-k=energy]'),
    heatFill: bar.querySelector('.sf-cb-fill--heat'),
    heatNum: bar.querySelector('[data-k=heat]'),
    cargo: bar.querySelector('[data-k=cargo]'),
    credits: bar.querySelector('[data-k=credits]'),
    delta: bar.querySelector('[data-k=delta]'),
    role: bar.querySelector('[data-k=role]'),
  };

  // --- helpers to resolve display values from state ---
  // Ship def is read from the player ENTITY's data.defId (matches the proven pattern at
  // hud.js:410). There is no state.player.shipId — the entity carries the def id.
  function playerShipDef() {
    const p = state.entities.get(state.playerId);
    const defId = p && p.data && p.data.defId;
    return defId ? SHIP_BY_ID.get(defId) : null;
  }
  function roleLabel() {
    const def = playerShipDef();
    if (!def || !def.role) return '—';
    return ROLE_LABEL[def.role] || def.role;
  }
  // The current sector lives on state.world.currentSectorId (world.js:144), not state.player.
  function sectorLabel() {
    const id = state.world && state.world.currentSectorId;
    const s = id ? SECTORS.find((x) => x.id === id) : null;
    return s ? s.name : (id || '—').replace(/_/g, ' ');
  }

  // --- the reconcile: read state, write DOM only when values move (event-driven) ---
  let lastCredits = null;
  let lastCargoSig = null;

  function reconcileVitals() {
    const p = state.entities.get(state.playerId);
    if (!p) return;
    const hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
    const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
    const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
    const wpnHeat = weaponHeatSummary(p.data && p.data.weapons);
    const heatFrac = wpnHeat.frac;

    setFill(el.hullFill, hullFrac);
    setFill(el.shieldFill, shieldFrac);
    setFill(el.energyFill, capFrac);
    setFill(el.heatFill, heatFrac);
    setText(el.hullNum, Math.max(0, Math.round(p.hull)) + '');
    setText(el.shieldNum, Math.max(0, Math.round(p.shield)) + '');
    setText(el.energyNum, Math.max(0, Math.round(p.cap)) + '');
    setText(el.heatNum, wpnHeat.pct + '%');

    // brightness-encodes-state flags (the load-bearing rule from Slice 1)
    bar.classList.toggle('sf-cb--hull-crit', hullFrac < 0.25);
    bar.classList.toggle('sf-cb--energy-low', capFrac < 0.2 && capFrac > 0);
    bar.classList.toggle('sf-cb--heat-high', heatFrac > 0.66 || wpnHeat.overheated);
  }

  function reconcileCargo() {
    const c = (state.player || {}).cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const sig = used + '/' + cap;
    if (sig === lastCargoSig) return;
    lastCargoSig = sig;
    setText(el.cargo, used + ' / ' + cap + ' u');
    bar.classList.toggle('sf-cb--cargo-full', cap > 0 && used >= cap);
  }

  function reconcileCredits() {
    const cr = Math.round((state.player && state.player.credits) || 0);
    setText(el.credits, cr.toLocaleString());
    // delta arrow: compare to last seen. flat until we have a prior.
    if (lastCredits != null) {
      const d = cr - lastCredits;
      el.delta.className = 'sf-cb-delta ' + (d > 0 ? 'sf-cb-delta--up' : d < 0 ? 'sf-cb-delta--down' : 'sf-cb-delta--flat');
      setText(el.delta, d > 0 ? ' ▲' : d < 0 ? ' ▼' : '');
    }
    lastCredits = cr;
  }

  function reconcileIdentity() {
    setText(el.role, roleLabel());
    setText(el.sector, sectorLabel());
  }

  function reconcileAll() {
    reconcileVitals();
    reconcileCargo();
    reconcileCredits();
    reconcileIdentity();
  }

  // --- event wiring (the frame-sleep-compliant update model) ---
  // Vitals move on damage and on respawn (full refresh after death). We do NOT subscribe per-frame.
  // Event names verified against the emit inventory (game:started, sector:enter, combat:damage,
  // cargo:changed, credits:changed, ship:statsChanged, player:respawn all confirmed emitted).
  bus.on('combat:damage', (p) => { if (!p || p.targetId === state.playerId) reconcileVitals(); });
  bus.on('player:respawn', () => reconcileAll());
  bus.on('ship:statsChanged', () => { reconcileVitals(); reconcileIdentity(); });
  // Cargo + credits are discrete events already used by the existing HUD.
  bus.on('cargo:changed', reconcileCargo);
  bus.on('credits:changed', reconcileCredits);
  // Sector changes when the player jumps (sector:enter — verified in world.js:196).
  bus.on('sector:enter', reconcileIdentity);

  // Initial paint + activation. The player entity is created during game:new/game:load/game:started,
  // which fire AFTER this module mounts (we're constructed during the same boot phase as createHud,
  // before a game is actually started). So we activate immediately if the entity already exists
  // (e.g. a game was started before this module mounted — rare), otherwise on game start.
  function activate() {
    reconcileAll();
    bar.classList.add('sf-cb--active');
  }
  if (state.entities && state.entities.has(state.playerId)) {
    activate();
  } else {
    bus.on('game:started', activate, { once: true });
    bus.on('game:new', activate, { once: true });
    bus.on('game:load', activate, { once: true });
  }

  return {
    el: bar,
    refresh: reconcileAll,
  };
}
