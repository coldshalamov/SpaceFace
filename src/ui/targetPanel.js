// Target panel (ARCHITECTURE §5, spec "Target panel") — the selected-target readout above
// the radar. Populated from state.player.targetId → entity lookup. Shows name, faction tag,
// three segmented bars, distance (wu) and closing speed. Hidden when targetId is null/dead.
//
// Cheap per-frame path: bar widths via transform:scaleX, text via textContent. No DOM churn.

import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { DAMAGE_MODEL } from '../data/combatDefs.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer } from '../systems/scanner.js';
import { LANE_GIMMICK_LABELS } from '../data/laneContacts.js';

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
  // Ambient traffic roles (traffic.js TRAFFIC_ROLES) — short, scannable.
  hauler: 'Hauler', courier: 'Courier', miner: 'Miner', patrol: 'Patrol',
  escort: 'Escort', smuggler: 'Smuggler', pirate: 'Raider', rescue: 'Rescue',
};

const GIMMICK_LABELS = {
  'tether-cutter': 'MASSLINE CUTTER',
  'tether_cutter': 'MASSLINE CUTTER',
  'massline-cutter': 'MASSLINE CUTTER',
  'massline_cutter': 'MASSLINE CUTTER',
  'pd-screen': 'PD SCREEN',
  'pd_screen': 'PD SCREEN',
  'ram-plate': 'RAM-PLATE',
  'ram_plate': 'RAM-PLATE',
  sniper: 'SNIPER',
  rammer: 'RAMMER',
  screen: 'SCREEN',
  ...LANE_GIMMICK_LABELS,
};

function getGimmickLabel(gimmick) {
  if (!gimmick) return '';
  const normalized = String(gimmick).toLowerCase().replace(/_/g, '-');
  return GIMMICK_LABELS[normalized] || GIMMICK_LABELS[String(gimmick).toLowerCase()] || String(gimmick).toUpperCase();
}

export function targetDisplayName(e) {
  if (!e) return '—';
  if (e.type === 'ship') {
    const d = e.data || {};
    const ai = d.ai || {};
    // Named/gimmick-readable identity first (lane contacts, bosses, callsigns) — never portraits.
    const named = d.name || ai.name || d.callsign || d.scanLabel || d.trafficLabel;
    if (named) return named;
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
    return (def && def.name) || 'Unidentified';
  }
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return e.data.name || 'Jump Gate';
    return (e.data && (e.data.name || e.data.stationName || e.data.stationId)) || 'Station';
  }
  if (e.type === 'asteroid') return 'Asteroid';
  if (e.type === 'wreck') return 'Wreck';
  if (e.type === 'drone') return (e.data && (e.data.callsign || e.data.name)) || 'Unidentified';
  return e.type || 'Contact';
}

function entityClass(e) {
  if (!e) return '';
  if (e.type === 'ship') {
    const d = e.data || {};
    // Traffic role beats hull class for ambient readability (HAULER vs "Freighter").
    const trafficRole = d.trafficRole || d.role;
    if (trafficRole && ROLE_LABEL[trafficRole]) return ROLE_LABEL[trafficRole];
    if (trafficRole) return trafficRole;
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
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

const MOTIVE_LABEL = Object.freeze({
  cargo_extortion: 'ROBBERY', predation: 'PREDATION', bounty: 'BOUNTY', contract_bounty: 'BOUNTY',
  retaliation: 'RETALIATION', territorial: 'TERRITORIAL', security: 'LAW ENFORCEMENT',
  law_enforcement: 'LAW ENFORCEMENT', escort_duty: 'ESCORT DUTY', defense: 'DEFENSE',
  salvage_claim: 'SALVAGE CLAIM', piracy: 'PIRACY', patrol: 'PATROL DUTY', trade: 'TRADE ROUTE',
  mining: 'MINING', rescue: 'RESCUE', unknown: 'UNKNOWN',
});

function readableMotive(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MOTIVE_LABEL[key] || (key ? key.replace(/_/g, ' ').toUpperCase() : '');
}

function playerWeaponRange(player) {
  const data = player && player.data || {};
  const weapons = Array.isArray(data.weapons) ? data.weapons : [];
  let range = Number(data.weaponRange || data.derived?.weaponRange) || 0;
  for (const weapon of weapons) {
    range = Math.max(range, Number(weapon && (weapon.range || weapon.maxRange || weapon.rangeWu)) || 0);
  }
  return range > 0 ? range : 900;
}

export function targetRangeBand(distance, player) {
  const dist = Math.max(0, Number(distance) || 0);
  const range = playerWeaponRange(player);
  if (dist <= Math.min(450, range * 0.55)) return 'CLOSE';
  if (dist <= range) return 'IN RANGE';
  if (dist <= range * 1.6) return 'APPROACH';
  return 'DISTANT';
}

export function targetIntelReadout(target, player, state, distance = Infinity) {
  if (!target) return null;
  const data = target.data || {};
  const ai = data.ai || {};
  const intentData = data.intent || {};
  const engagement = data.engagement || {};
  const playerTeam = player ? player.team : 0;
  const hostile = isHostileToPlayer(target, playerTeam, state);
  const allied = !hostile && playerTeam !== 0 && target.team === playerTeam;
  const intent = allied ? 'ALLY' : contactStateWord(target, playerTeam, state);
  const authoredMotive = engagement.motive || ai.motive || data.motive || intentData.motive;
  let motive = readableMotive(authoredMotive);
  if (!motive && ai.retaliationTargetId === state?.playerId) motive = 'RETALIATION';
  if (!motive && ai.lawful) motive = 'LAW ENFORCEMENT';
  if (!motive && (ai.forcePlayerTarget || ai.huntPlayer)) motive = 'HUNTING YOU';
  if (!motive && hostile) motive = 'HOSTILE INTENT';
  if (!motive && allied) motive = 'SUPPORT';
  if (!motive && ai.passive) motive = 'NONCOMBATANT';
  if (!motive) motive = 'UNRESOLVED';
  const threatTier = contactThreatTier(target, hostile);
  return Object.freeze({
    hostile,
    allied,
    intent,
    motive,
    threatTier,
    threatPips: tierPips(threatTier),
    rangeBand: targetRangeBand(distance, player),
  });
}

export function createTargetPanel(ctx) {
  const { state } = ctx;
  const el = document.createElement('div');
  el.className = 'sf-target';
  el.style.display = 'none';
  el.dataset.hudSlot = 'current-threat';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Current target');
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
    <div class="sf-target__intent mono" style="display:none;margin-top:3px;font-size:10px;line-height:1.3;letter-spacing:.04em;color:var(--text-primary);"></div>
    <div class="sf-target__meta">
      <span class="sf-target__dist mono">0 wu</span>
      <span class="sf-target__range mono" style="color:var(--visor-amber);"></span>
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
  const elIntent = el.querySelector('.sf-target__intent');
  const elRange = el.querySelector('.sf-target__range');
  let lastTriKey = null;
  let lastIdentityKey = null;
  let lastIntelKey = null;

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

    const nextName = targetDisplayName(t);
    const nextClass = entityClass(t);
    const targetChanged = tid !== lastTargetId || nextName !== lastName || nextClass !== lastClass || t.factionId !== lastFactionId;
    if (targetChanged) {
      lastTargetId = tid;
      lastName = nextName;
      lastClass = nextClass;
      lastFactionId = t.factionId || null;
      const classText = nextClass && nextClass.toLowerCase() !== nextName.toLowerCase()
        ? ` · ${nextClass}`.toUpperCase()
        : '';
      setText(elName, `${nextName}${classText}`);
      el.setAttribute('aria-label', `Current target: ${nextName}${nextClass ? `, ${nextClass}` : ''}`);
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

    // Identity is stable; live intent/motive/threat is a separate tactical receipt below it.
    if (t.type === 'ship' || t.type === 'drone') {
      const player = state.entities.get(state.playerId);
      const role = entityClass(t);
      const level = t.data && t.data.level;
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      const facShort = fac ? (fac.short || fac.name) : '—';
      const callsign = t.data && t.data.callsign;
      const idKey = `${tid}:${facShort}:${role}:${level}:${callsign || ''}`;
      if (idKey !== lastIdentityKey) {
        lastIdentityKey = idKey;
        const levelBit = level != null ? ` · L${level}` : '';
        setText(elIdentity, `${facShort} · ${role}${levelBit}`);
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

    // Gimmick / readable quirk tag (bounty hunters + named lane freighters)
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
      const tacticalTarget = t.type === 'ship' || t.type === 'drone';
      const intel = tacticalTarget ? targetIntelReadout(t, p, state, dist) : null;
      const intelKey = intel
        ? `${tid}:${intel.intent}:${intel.motive}:${intel.threatTier}:${intel.rangeBand}`
        : '';
      if (intel && intelKey !== lastIntelKey) {
        lastIntelKey = intelKey;
        setText(elIntent, `INTENT ${intel.intent} · MOTIVE ${intel.motive} · THREAT ${intel.threatPips}`);
        setText(elRange, intel.rangeBand);
        if (elIntent.style.display !== 'block') elIntent.style.display = 'block';
        el.setAttribute('aria-label', `Current target: ${nextName}, ${nextClass || 'contact'}, intent ${intel.intent}, motive ${intel.motive}, threat ${intel.threatTier}, ${intel.rangeBand}`);
      } else if (!intel) {
        lastIntelKey = null;
        if (elIntent.style.display !== 'none') elIntent.style.display = 'none';
        setText(elRange, targetRangeBand(dist, p));
      }
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
    lastIntelKey = null;
    tickN = 5;
  }

  return { el, update, forceRefresh };
}
