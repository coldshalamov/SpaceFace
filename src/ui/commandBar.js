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
import { buildDamageReadout } from '../combat/playerDefeat.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship', tug: 'Tug',
};

// ORRERY lease (design/frontend/ORRERY.md §3) for the SPEC3-36 dormant skeleton: this strip is
// flag-gated OFF in flight (uiRoot COMMAND_BAR_IN_FLIGHT=false — the three-anchor law retired it;
// its vitals live as arcs in the Cluster) and stays token-true for the day the screen-layer
// header lands. No bordered box and no cut-corner plate: the strip is anchored by the system's
// head veil (--dp-veil-head — occlusion that reaches the frame edge with no inner boundary), and
// cells are separated by the printed hairline rule, which is a sanctioned straight edge.
// Labels are the etched Archivo role, values the tabular numeral face; colour grammar: bone and
// phosphor carry readings, danger red carries threat states (hull/armor/energy/heat failure),
// the one warm lamp accent is the full hold — the pilot's actionable decision point.
// G16-02: the sheet retired to styles/ui.css; the strip seats in the Stage's banner slot.

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
// Bar fill via transform:scaleX (matches the existing HUD pattern at hud.js:200) — no transition.
function setFill(el, frac) {
  if (!el) return;
  const next = Math.round(clamp01(frac) * 1000) / 1000;
  if (el._sfScaleX === next) return;
  el._sfScaleX = next;
  el.style.transform = 'scaleX(' + next.toFixed(3) + ')';
}

export function createCommandBar(ctx) {
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
          <span class="sf-cb-vlabel">ARMR</span>
          <div class="sf-cb-track"><div class="sf-cb-fill sf-cb-fill--armor"></div></div>
          <span class="sf-cb-num" data-k="armor">100</span>
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
    </div>
    <div class="sf-cb-cell sf-cb-cell--impact" role="status" aria-live="off">
      <span class="sf-cb-k">LAST IMPACT</span>
      <span class="sf-cb-v sf-cb-impact" data-k="impact">—</span>
    </div>`;

  // G16-02: the strip seats in the Stage's banner slot (the alerts lane's tier); a host with
  // no live Stage keeps the old #ui-root mount.
  (ctx.stage && typeof ctx.stage.slotEl === 'function' && ctx.stage.slotEl('banner')
    || document.getElementById('ui-root')).appendChild(bar);

  const el = {
    sector: bar.querySelector('[data-k=sector]'),
    hullFill: bar.querySelector('.sf-cb-fill--hull'),
    hullNum: bar.querySelector('[data-k=hull]'),
    armorFill: bar.querySelector('.sf-cb-fill--armor'),
    armorNum: bar.querySelector('[data-k=armor]'),
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
    impact: bar.querySelector('[data-k=impact]'),
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
    const armorFrac = p.armorMax ? clamp01(p.armorHp / p.armorMax) : 0;
    const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
    const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
    const wpnHeat = weaponHeatSummary(p.data && p.data.weapons);
    const heatFrac = wpnHeat.frac;

    setFill(el.hullFill, hullFrac);
    setFill(el.armorFill, armorFrac);
    setFill(el.shieldFill, shieldFrac);
    setFill(el.energyFill, capFrac);
    setFill(el.heatFill, heatFrac);
    setText(el.hullNum, Math.max(0, Math.round(p.hull)) + '');
    setText(el.armorNum, Math.max(0, Math.round(p.armorHp || 0)) + '');
    setText(el.shieldNum, Math.max(0, Math.round(p.shield)) + '');
    setText(el.energyNum, Math.max(0, Math.round(p.cap)) + '');
    setText(el.heatNum, wpnHeat.pct + '%');

    // brightness-encodes-state flags (the load-bearing rule from Slice 1)
    bar.classList.toggle('sf-cb--hull-crit', hullFrac < 0.25);
    bar.classList.toggle('sf-cb--armor-crit', p.armorMax > 0 && armorFrac < 0.25);
    bar.classList.toggle('sf-cb--energy-low', capFrac < 0.2 && capFrac > 0);
    bar.classList.toggle('sf-cb--heat-high', heatFrac > 0.66 || wpnHeat.overheated);
  }

  let impactTimer = 0;
  function showImpact(payload) {
    if (!payload || payload.targetId !== state.playerId) return;
    const receipt = buildDamageReadout(state, payload);
    setText(el.impact, receipt.text);
    el.impact.title = receipt.text + ` · SHIELD ${receipt.shieldPct}% · ARMOR ${receipt.armorPct}% · HULL ${receipt.hullPct}%`;
    bar.classList.add('sf-cb--impact');
    clearTimeout(impactTimer);
    impactTimer = setTimeout(() => bar.classList.remove('sf-cb--impact'), 2400);
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
    setText(el.credits, cr.toLocaleString('en-US'));
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
  bus.on('combat:damage', (p) => {
    if (!p || p.targetId === state.playerId) reconcileVitals();
    showImpact(p);
  }, { presentation: true });
  bus.on('player:death', () => {
    clearTimeout(impactTimer);
    bar.classList.remove('sf-cb--impact');
  });
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
