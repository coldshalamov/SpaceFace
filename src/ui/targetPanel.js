// Target panel (ARCHITECTURE §5, spec "Target panel") — the selected-target readout above
// the radar. Populated from state.player.targetId → entity lookup. Shows name, faction tag,
// hull%/shield% mini-bars, distance (wu) and closing speed. Hidden when targetId is null/dead.
//
// Cheap per-frame path: bar widths via transform:scaleX, text via textContent. No DOM churn.

import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

function entityName(e) {
  if (!e) return '—';
  if (e.type === 'ship') {
    const def = e.data && e.data.defId ? SHIP_BY_ID.get(e.data.defId) : null;
    return (e.data && e.data.name) || (def && def.name) || 'Unknown Ship';
  }
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return e.data.name || 'Jump Gate';
    return (e.data && (e.data.name || e.data.stationName || e.data.stationId)) || 'Station';
  }
  if (e.type === 'asteroid') return 'Asteroid';
  if (e.type === 'wreck') return 'Wreck';
  if (e.type === 'drone') return 'Drone';
  return e.type || 'Contact';
}

export function createTargetPanel(ctx) {
  const { state } = ctx;
  const el = document.createElement('div');
  // NOTE: deliberately NOT using the `.panel` class — that's the modal-screen surface (heavy
  // 40px box-shadow + 10px radius). This is a small HUD sub-panel sitting above the radar; it
  // gets the lighter `.sf-hudpanel` treatment instead.
  el.className = 'sf-target sf-hudpanel';
  el.style.display = 'none';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = `
    <div class="sf-target__head">
      <span class="sf-target__name">—</span>
      <span class="sf-target__faction"></span>
    </div>
    <div class="sf-bar sf-bar--sm sf-bar--hull"><div class="sf-bar__fill"></div></div>
    <div class="sf-bar sf-bar--sm sf-bar--shield"><div class="sf-bar__fill"></div></div>
    <div class="sf-target__meta">
      <span class="sf-target__dist mono">0 wu</span>
      <span class="sf-target__closing mono"></span>
    </div>`;

  const elName = el.querySelector('.sf-target__name');
  const elFac = el.querySelector('.sf-target__faction');
  const fillHull = el.querySelector('.sf-bar--hull .sf-bar__fill');
  const fillShield = el.querySelector('.sf-bar--shield .sf-bar__fill');
  const elDist = el.querySelector('.sf-target__dist');
  const elClose = el.querySelector('.sf-target__closing');
  let lastTargetId = null;
  let lastName = null;
  let lastFactionId = null;
  let lastHullScale = '';
  let lastShieldScale = '';
  let lastDistText = '';
  let lastCloseText = '';
  let lastCloseColor = '';
  let tickN = 0;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function update() {
    tickN++;
    const tid = state.player.targetId;
    const t = tid != null ? state.entities.get(tid) : null;
    if (!t || !t.alive) {
      if (el.style.display !== 'none') el.style.display = 'none';
      lastTargetId = null;
      return;
    }
    if (el.style.display === 'none') el.style.display = 'block';

    const nextName = entityName(t);
    const targetChanged = tid !== lastTargetId || nextName !== lastName || t.factionId !== lastFactionId;
    if (targetChanged) {
      lastTargetId = tid;
      lastName = nextName;
      lastFactionId = t.factionId || null;
      setText(elName, nextName);
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      if (fac) {
        setText(elFac, fac.short || fac.name);
        const color = fac.color || 'var(--ink-dim)';
        if (elFac.style.color !== color) elFac.style.color = color;
      } else {
        setText(elFac, '');
      }
    }

    const hullFrac = t.hullMax ? Math.max(0, Math.min(1, t.hull / t.hullMax)) : 0;
    const shieldFrac = t.shieldMax ? Math.max(0, Math.min(1, t.shield / t.shieldMax)) : 0;
    const hullScale = `scaleX(${hullFrac})`;
    const shieldScale = `scaleX(${shieldFrac})`;
    if (hullScale !== lastHullScale) { fillHull.style.transform = hullScale; lastHullScale = hullScale; }
    if (shieldScale !== lastShieldScale) { fillShield.style.transform = shieldScale; lastShieldScale = shieldScale; }

    const p = state.entities.get(state.playerId);
    if (p && (targetChanged || (tickN % 6) === 0)) {
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const distText = dist > 1000 ? (dist / 1000).toFixed(1) + 'k wu' : Math.round(dist) + ' wu';
      if (distText !== lastDistText) { elDist.textContent = distText; lastDistText = distText; }
      // closing speed = -dot(relVel, normalize(relPos)); positive = approaching
      const rvx = t.vel.x - p.vel.x, rvz = t.vel.z - p.vel.z;
      const inv = dist > 0.001 ? 1 / dist : 0;
      const closing = -((rvx * dx + rvz * dz) * inv);
      const closeText = (closing >= 0 ? '▲' : '▼') + ' ' + Math.abs(Math.round(closing)) + ' wu/s';
      const closeColor = closing >= 0 ? 'var(--danger)' : 'var(--good)';
      if (closeText !== lastCloseText) { elClose.textContent = closeText; lastCloseText = closeText; }
      if (closeColor !== lastCloseColor) { elClose.style.color = closeColor; lastCloseColor = closeColor; }
    }
  }

  function forceRefresh() {
    lastTargetId = null;
    tickN = 5;
  }

  return { el, update, forceRefresh };
}
