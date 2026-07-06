// Target panel (ARCHITECTURE §5, spec "Target panel") — the selected-target readout above
// the radar. Populated from state.player.targetId → entity lookup. Shows name, faction tag,
// three segmented bars, distance (wu) and closing speed. Hidden when targetId is null/dead.
//
// Cheap per-frame path: bar widths via transform:scaleX, text via textContent. No DOM churn.

import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { DAMAGE_MODEL } from '../data/combatDefs.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer } from '../systems/scanner.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

// Damage triangle (BP-02): the player-facing E/K/X families mapped to the kernel's damage channels
// (weights transcribed from scalarHitToDamagePacket in src/combat/damage.js — keep in sync). The panel
// shows how effective each family is against the target's CURRENT outermost layer (shield→armor→hull),
// so the player can read "shoot energy at that shield, kinetic once it's down" at a glance.
const FAMILY_CHANNELS = {
  energy:    { thermal: 0.72, ion: 0.28 },
  kinetic:   { kinetic: 1.0 },
  explosive: { kinetic: 0.65, thermal: 0.35 },
};
const TRIANGLE_REF = 1.35; // multiplier that maps to a full bar

function tierPips(tier) {
  let s = '';
  for (let i = 0; i < 3; i++) s += i < tier ? '▰' : '▱';
  return s;
}

function outerLayerMultipliers(t) {
  if (t.shieldMax > 0 && t.shield > 0) return { layer: 'shield', mult: DAMAGE_MODEL.shieldMultipliers };
  if (t.armorMax > 0 && t.armorHp > 0) return { layer: 'armor', mult: DAMAGE_MODEL.armorMultipliers };
  return { layer: 'hull', mult: DAMAGE_MODEL.hullMultipliers };
}

function familyEffectiveness(channelMult, weights) {
  let sum = 0;
  for (const ch in weights) sum += weights[ch] * (Number.isFinite(channelMult[ch]) ? channelMult[ch] : 1);
  return sum;
}

const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};

const GIMMICK_LABELS = {
  'tether-cutter': 'MASSLINE CUTTER',
  'tether_cutter': 'MASSLINE CUTTER',
  'massline-cutter': 'MASSLINE CUTTER',
  'massline_cutter': 'MASSLINE CUTTER',
  'pd-screen': 'PD SCREEN',
  'pd_screen': 'PD SCREEN',
  'ram-plate': 'RAM-PLATE',
  'ram_plate': 'RAM-PLATE'
};

function getGimmickLabel(gimmick) {
  if (!gimmick) return '';
  const normalized = String(gimmick).toLowerCase().replace(/_/g, '-');
  return GIMMICK_LABELS[normalized] || String(gimmick).toUpperCase();
}

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

function entityClass(e) {
  if (!e) return '';
  if (e.type === 'ship') {
    const def = e.data && e.data.defId ? SHIP_BY_ID.get(e.data.defId) : null;
    const role = e.role || (def && def.role) || '';
    return ROLE_LABEL[role] || role || 'Ship';
  }
  if (e.type === 'station') {
    return e.data && e.data.isGate ? 'Gate' : 'Station';
  }
  if (e.type === 'wreck') return 'Wreck';
  if (e.type === 'asteroid') return 'Asteroid';
  return e.type || '';
}

export function createTargetPanel(ctx) {
  const { state } = ctx;
  const el = document.createElement('div');
  el.className = 'sf-target sf-hudpanel';
  el.style.display = 'none';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'off');
  el.setAttribute('aria-atomic', 'false');
  el.innerHTML = `
    <div class="sf-target__head">
      <span class="sf-target__name">—</span>
      <span class="sf-target__faction"></span>
    </div>
    <div class="sf-target__bars">
      <div class="sf-bar sf-bar--segmented sf-bar--shield" title="Shield"><div class="sf-bar__fill"></div></div>
      <div class="sf-bar sf-bar--segmented sf-bar--armor" title="Armor"><div class="sf-bar__fill"></div></div>
      <div class="sf-bar sf-bar--segmented sf-bar--hull" title="Hull"><div class="sf-bar__fill"></div></div>
    </div>
    <div class="sf-target__identity mono" style="display:none"></div>
    <div class="sf-target__meta">
      <span class="sf-target__dist mono">0 wu</span>
      <span class="sf-target__closing mono"></span>
    </div>
    <div class="sf-target__triangle" style="display:none">
      <span class="sf-target__tri-label mono">VULN</span>
      <span class="sf-tri sf-tri--e" title="Energy"><span class="sf-tri__k">E</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--k" title="Kinetic"><span class="sf-tri__k">K</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--x" title="Explosive"><span class="sf-tri__k">X</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-target__tri-layer mono"></span>
    </div>
    <div class="sf-target__weak mono" style="display:none"></div>
    <div class="sf-target__gimmick mono" style="display:none"></div>`;

  const elName = el.querySelector('.sf-target__name');
  const elFac = el.querySelector('.sf-target__faction');
  const fillHull = el.querySelector('.sf-bar--hull .sf-bar__fill');
  const fillArmor = el.querySelector('.sf-bar--armor .sf-bar__fill');
  const fillShield = el.querySelector('.sf-bar--shield .sf-bar__fill');
  const elDist = el.querySelector('.sf-target__dist');
  const elClose = el.querySelector('.sf-target__closing');
  const elGimmick = el.querySelector('.sf-target__gimmick');
  const elTriangle = el.querySelector('.sf-target__triangle');
  const triE = el.querySelector('.sf-tri--e');
  const triK = el.querySelector('.sf-tri--k');
  const triX = el.querySelector('.sf-tri--x');
  const triFillE = triE.querySelector('.sf-tri__fill');
  const triFillK = triK.querySelector('.sf-tri__fill');
  const triFillX = triX.querySelector('.sf-tri__fill');
  const elTriLayer = el.querySelector('.sf-target__tri-layer');
  const elWeak = el.querySelector('.sf-target__weak');
  const elIdentity = el.querySelector('.sf-target__identity');
  let lastTriKey = null;
  let lastIdentityKey = null;

  let lastTargetId = null;
  let lastName = null;
  let lastClass = null;
  let lastFactionId = null;
  let lastHullScale = '';
  let lastArmorScale = '';
  let lastShieldScale = '';
  let lastDistText = '';
  let lastCloseText = '';
  let lastCloseColor = '';
  let tickN = 0;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function update(options = {}) {
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
    const nextClass = entityClass(t);
    const targetChanged = tid !== lastTargetId || nextName !== lastName || nextClass !== lastClass || t.factionId !== lastFactionId;
    if (targetChanged) {
      lastTargetId = tid;
      lastName = nextName;
      lastClass = nextClass;
      lastFactionId = t.factionId || null;
      const classText = nextClass ? ` · ${nextClass}`.toUpperCase() : '';
      setText(elName, `${nextName}${classText}`);
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
    const armorFrac = t.armorMax ? Math.max(0, Math.min(1, t.armorHp / t.armorMax)) : 0;
    const shieldFrac = t.shieldMax ? Math.max(0, Math.min(1, t.shield / t.shieldMax)) : 0;
    
    const hullScale = `scaleX(${hullFrac})`;
    const armorScale = `scaleX(${armorFrac})`;
    const shieldScale = `scaleX(${shieldFrac})`;
    
    if (hullScale !== lastHullScale) { fillHull.style.transform = hullScale; lastHullScale = hullScale; }
    if (armorScale !== lastArmorScale) { fillArmor.style.transform = armorScale; lastArmorScale = armorScale; }
    if (shieldScale !== lastShieldScale) { fillShield.style.transform = shieldScale; lastShieldScale = shieldScale; }

    // Contact identity (BP-10): faction · role · threat tier · level — legible combat readout.
    if (t.type === 'ship' || t.type === 'drone') {
      const player = state.entities.get(state.playerId);
      const playerTeam = player ? player.team : 0;
      const hostile = isHostileToPlayer(t, playerTeam, state);
      const tier = contactThreatTier(t, hostile);
      const stateWord = contactStateWord(t, playerTeam, state);
      const role = entityClass(t);
      const level = t.data && t.data.level;
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      const facShort = fac ? (fac.short || fac.name) : '—';
      const idKey = `${tid}:${facShort}:${role}:${stateWord}:${tier}:${level}`;
      if (idKey !== lastIdentityKey) {
        lastIdentityKey = idKey;
        const levelBit = level != null ? ` · L${level}` : '';
        setText(elIdentity, `${facShort} · ${role} · ${stateWord} · ${tierPips(tier)}${levelBit}`);
      }
      if (elIdentity.style.display !== 'block') elIdentity.style.display = 'block';
    } else if (elIdentity.style.display !== 'none') {
      elIdentity.style.display = 'none';
      lastIdentityKey = null;
    }

    // Damage triangle (BP-02): effectiveness of E/K/X against the target's current outer layer.
    // Only recompute when the target or its outer layer changes (values are per-layer constants).
    if (t.type === 'ship' || t.type === 'drone') {
      const { layer, mult } = outerLayerMultipliers(t);
      const triKey = `${tid}:${layer}`;
      if (triKey !== lastTriKey) {
        lastTriKey = triKey;
        const eE = familyEffectiveness(mult, FAMILY_CHANNELS.energy);
        const eK = familyEffectiveness(mult, FAMILY_CHANNELS.kinetic);
        const eX = familyEffectiveness(mult, FAMILY_CHANNELS.explosive);
        const barW = (v) => `scaleX(${Math.max(0.06, Math.min(1, v / TRIANGLE_REF)).toFixed(3)})`;
        triFillE.style.transform = barW(eE);
        triFillK.style.transform = barW(eK);
        triFillX.style.transform = barW(eX);
        const best = Math.max(eE, eK, eX);
        triE.classList.toggle('best', eE === best);
        triK.classList.toggle('best', eK === best);
        triX.classList.toggle('best', eX === best);
        setText(elTriLayer, layer.toUpperCase());
      }
      if (elTriangle.style.display !== 'flex') elTriangle.style.display = 'flex';
    } else {
      if (elTriangle.style.display !== 'none') elTriangle.style.display = 'none';
      lastTriKey = null;
    }

    // Weak-point line (BP-02): shown once a scan pulse has revealed the target's soft spot (hud passes
    // the revealed entry in options.weakPoint). Tells the player what to hit and roughly where.
    const wp = options.weakPoint;
    if (wp && wp.label && (t.type === 'ship' || t.type === 'drone')) {
      setText(elWeak, `◈ WEAK: ${wp.label}${wp.hint ? ' · ' + wp.hint : ''}`);
      if (elWeak.style.display !== 'block') elWeak.style.display = 'block';
    } else if (elWeak.style.display !== 'none') {
      elWeak.style.display = 'none';
    }

    // Gimmick tag
    const gimmick = t.data && (t.data.bountyGimmick || t.data.gimmick || t.data.bountyTag);
    const gimmickLabel = getGimmickLabel(gimmick);
    if (gimmickLabel) {
      setText(elGimmick, gimmickLabel);
      if (elGimmick.style.display !== 'inline-block') elGimmick.style.display = 'inline-block';
    } else {
      if (elGimmick.style.display !== 'none') elGimmick.style.display = 'none';
    }

    const p = state.entities.get(state.playerId);
    if (p && (targetChanged || options.slow || (tickN % 6) === 0)) {
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
    lastTriKey = null;
    tickN = 5;
  }

  return { el, update, forceRefresh };
}
