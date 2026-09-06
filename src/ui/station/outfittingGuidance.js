// Pure purchase, fit, and engineering guidance shared by Station tooling and checks.
// This module intentionally has no panel factory or DOM lifecycle.
import {
  buildSlotList,
  findMasslineHeadConflict,
  fits,
  outfitBudgetBlocker,
  outfitBudgetForFittings,
} from '../../systems/ships.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { SECTORS } from '../../data/sectors.js';
import { TECH_NODES } from '../../data/tech.js';
import { escapeHtml } from '../comms.js';
import {
  presentGaugePacket,
  presentModuleFitPreview,
  presentShopModuleDelta,
} from '../presenters/engineeringPreview.js';
import { buildMassDelta } from '../panels/massDelta.js';
import {
  handlingProfileDomain,
  handlingProfileForShip,
} from '../panels/handlingProfile.js';
import { moduleRiskStrip } from '../panels/moduleRisk.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));

const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction', gravimetric: 'Gravimetric', pulse_plate: 'Pulse Plate',
  torch: 'Torch', field_sail: 'Field Sail',
};
function driveLabelFor(defId) {
  const def = SHIP_BY_ID.get(defId);
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}
const FITTABLE_BY_ID = new Map();
for (const m of MODULES) FITTABLE_BY_ID.set(m.id, m);
for (const w of WEAPONS) if (!FITTABLE_BY_ID.has(w.id)) FITTABLE_BY_ID.set(w.id, w);
const HANDLING_PROFILE_DOMAIN = handlingProfileDomain();

const ALL_BUYABLE = [...MODULES, ...WEAPONS].filter((d) => d.price > 0);
ALL_BUYABLE.sort((a, b) => {
  if (a.slotType < b.slotType) return -1;
  if (a.slotType > b.slotType) return 1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  return a.price - b.price;
});

const SIZE_RANK = { S: 1, M: 2, L: 3 };

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

function fitBlockerForSlot(shipDef, fittings, slotIndex, def) {
  const conflict = findMasslineHeadConflict(fittings, slotIndex, def);
  if (conflict) return { reason: 'massline_head_conflict', text: 'Unfit ' + conflict.name + ' before fitting another head' };
  if (!shipDef) return null;
  const prospective = Array.isArray(fittings) ? fittings.slice() : [];
  prospective[slotIndex] = def.id;
  return outfitBudgetBlocker(shipDef, prospective);
}

export function describeOutfittingPurchase(def, player = {}, slots = [], fittings = [], shipDef = null) {
  if (!def) {
    return {
      state: 'missing',
      unlocked: false,
      afford: false,
      hasSlot: false,
      fitSlotIndex: -1,
      disabled: true,
      label: 'Unavailable',
      title: 'Select a module to inspect purchase options.',
    };
  }
  const researched = new Set(player.researchedNodes || player.researched || []);
  const credits = Math.max(0, Number(player.credits) || 0);
  const price = Math.max(0, Number(def.price) || 0);
  const unlocked = !def.requiresTech || researched.has(def.requiresTech);
  const afford = credits >= price;
  const safeSlots = Array.isArray(slots) ? slots : [];
  const safeFittings = Array.isArray(fittings) ? fittings : [];
  const hasSlot = safeSlots.some((s) => s.type === def.slotType && SIZE_RANK[s.size] >= SIZE_RANK[def.size]);
  const emptyCompatibleSlots = safeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot, index }) => !safeFittings[index] && fits(slot, def));
  const fitSlotIndex = emptyCompatibleSlots.find(({ index }) =>
    !fitBlockerForSlot(shipDef, safeFittings, index, def))?.index ?? -1;
  const fitBlocker = fitSlotIndex < 0 && emptyCompatibleSlots.length
    ? fitBlockerForSlot(shipDef, safeFittings, emptyCompatibleSlots[0].index, def)
    : null;

  if (!unlocked) {
    const req = techName(def.requiresTech);
    return {
      state: 'locked',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: true,
      label: 'Research ' + req,
      title: def.name + ' requires ' + req + ' before purchase.',
    };
  }
  if (!afford) {
    const missing = Math.max(0, price - credits);
    return {
      state: 'funding',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: def.name + ' costs ' + fmtCr(price) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  if (fitSlotIndex >= 0) {
    const slot = safeSlots[fitSlotIndex] || {};
    return {
      state: 'fit',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: false,
      label: 'Buy & Fit',
      title: 'Buy ' + def.name + ' and fit it to the ' + (slot.type || def.slotType) + ' ' + (slot.size || def.size) + ' slot.',
    };
  }
  if (hasSlot) {
    return {
      state: 'inventory',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: false,
      label: 'Buy to Inventory',
      title: fitBlocker && fitBlocker.text
        ? def.name + ' cannot fit now: ' + fitBlocker.text + '. Buy it into inventory or lighten the build first.'
        : def.name + ' fits this hull, but every compatible slot is full. Buy it into inventory or unfit a module first.',
      fitBlocker,
    };
  }
  return {
    state: 'inventory',
    unlocked,
    afford,
    hasSlot,
    fitSlotIndex,
    disabled: false,
    label: 'Buy to Inventory',
    title: 'No compatible ' + def.slotType + ' ' + def.size + ' slot on this hull. Buy it into inventory for another ship.',
  };
}

function normalizeWantedSlots(value) {
  if (value instanceof Set) return new Set([...value].filter(Boolean));
  if (Array.isArray(value)) return new Set(value.filter(Boolean));
  return value ? new Set([value]) : new Set();
}

function tierAllows(def, tier) {
  const stationTierValue = Number(tier);
  if (!Number.isFinite(stationTierValue)) return true;
  return (Number(def && def.tier) || 0) <= stationTierValue + 1;
}

function purchaseRecommendationScore(def, purchase, wantedSlots) {
  const wanted = wantedSlots.size === 0 || wantedSlots.has(def.slotType);
  let score = wanted ? 10000 : 0;
  if (!purchase.disabled && purchase.hasSlot) score += 5000;
  if (purchase.state === 'fit') score += 1500;
  else if (purchase.state === 'inventory' && purchase.hasSlot) score += 900;
  else if (purchase.state === 'funding') score += 700;
  else if (purchase.state === 'locked') score += 500;
  else if (!purchase.hasSlot) score += 250;
  score += (Number(def.tier) || 0) * 100;
  score -= Math.max(0, Number(def.price) || 0) / 1000;
  return score;
}

export function recommendOutfittingPurchase(player = {}, slots = [], fittings = [], opts = {}) {
  const wantedSlots = normalizeWantedSlots(opts.wantedSlots);
  const buyable = Array.isArray(opts.items) ? opts.items : ALL_BUYABLE;
  const candidates = buyable
    .filter((def) => def && tierAllows(def, opts.tier))
    .map((def) => ({
      def,
      purchase: describeOutfittingPurchase(def, player, slots, fittings, opts.shipDef || null),
    }));
  const missionPool = wantedSlots.size
    ? candidates.filter((entry) => wantedSlots.has(entry.def.slotType))
    : candidates;
  const pool = missionPool.length ? missionPool : candidates;

  if (!pool.length) {
    return {
      state: 'empty',
      kind: 'info',
      title: 'No next buy',
      detail: 'This station has no modules that match the current job or hull tier.',
    };
  }

  const sorted = pool.slice().sort((a, b) =>
    purchaseRecommendationScore(b.def, b.purchase, wantedSlots) -
    purchaseRecommendationScore(a.def, a.purchase, wantedSlots));
  const currentHullBuy = sorted.find((entry) => entry.purchase.state === 'fit');
  const pick = currentHullBuy || sorted[0];
  const missionFit = wantedSlots.has(pick.def.slotType);

  if (currentHullBuy) {
    return {
      state: pick.purchase.state,
      kind: 'ok',
      defId: pick.def.id,
      title: 'Next buy: ' + pick.def.name,
      label: pick.purchase.label,
      detail: pick.purchase.title + (missionFit ? ' Matches the tracked job fit.' : ' Improves the current hull.'),
    };
  }

  if (!pick.purchase.hasSlot) {
    return {
      state: 'hull',
      kind: 'warn',
      defId: pick.def.id,
      title: 'Need compatible hull slot: ' + pick.def.name,
      label: 'Hull slot',
      detail: pick.purchase.title + ' Switch hulls or buy a ship with the required slot before making this the job fit.',
    };
  }

  const blockerTail = pick.purchase.state === 'locked'
    ? ' Track the prerequisite in the Tech Tree before buying.'
    : (pick.purchase.state === 'funding'
      ? ' Run a contract or trade loop to fund the upgrade.'
      : ' Clear the blocker, then return to Outfitting.');
  return {
    state: pick.purchase.state,
    kind: 'warn',
    defId: pick.def.id,
    title: pick.purchase.label + ': ' + pick.def.name,
    label: pick.purchase.label,
    detail: pick.purchase.title + blockerTail,
  };
}

function stationTier(stationId) {
  for (const sec of SECTORS) {
    for (const st of sec.stations || []) {
      if (st.id === stationId) return sec.tier;
    }
  }
  return 0;
}

export function masslineHeadOutcome(def) {
  const headId = def && def.mods && def.mods.masslineHeadId;
  const outcomes = {
    tractor: 'Massline Tractor head',
    elastic_whip: 'Massline spring-energy head',
    frame_coupler: 'Massline separation-damping head',
    monofilament_sweep: 'Massline hostile-cut sweep head',
    transverse_snare: 'Massline free-target crossing snare',
    twin_bridle: 'Massline two-endpoint world tether',
  };
  return outcomes[headId] || '';
}

export function statSnippet(def) {
  const parts = [];
  if (def.dps != null) parts.push(Math.round(def.dps) + ' dps');
  if (def.range != null) parts.push(def.range + ' rng');
  if (def.dmg != null && def.rof != null) parts.push(def.dmg + 'x' + def.rof.toFixed(1));
  const m = def.mods;
  if (m) {
    if (m.shieldFlat) parts.push('+' + m.shieldFlat + ' shd');
    if (m.shieldRegenFlat) parts.push('+' + m.shieldRegenFlat + ' regen');
    if (m.topSpeed) parts.push(m.topSpeed + ' spd');
    if (m.accelMult != null) parts.push(m.accelMult.toFixed(1) + 'x accel');
    if (m.cargoFlat) parts.push('+' + m.cargoFlat + ' cargo');
    if (m.cargoCapPct) parts.push('+' + Math.round(m.cargoCapPct * 100) + '% cap');
    if (m.damageReductionPct) parts.push('-' + Math.round(m.damageReductionPct * 100) + '% dmg');
    if (m.ramDamageDealtMult) parts.push('+' + Math.round((m.ramDamageDealtMult - 1) * 100) + '% ram dmg');
    if (m.boostTopSpeedPct) parts.push('+' + Math.round(m.boostTopSpeedPct * 100) + '% boost');
    if (Number.isFinite(m.magnetRange) && m.magnetRange > 0) parts.push(Math.round(m.magnetRange) + ' wu ore magnet');
    const masslineOutcome = masslineHeadOutcome(def);
    if (masslineOutcome) parts.push(masslineOutcome.replace(/^Massline\s+/i, ''));
    if (m.cloakBaseRadius) parts.push(m.cloakBaseRadius + ' detection ring');
    if (m.cloakDrainPerS) parts.push(Math.round(m.cloakDrainPerS * 100) + '% cloak drain/s');
    if (m.cloakRechargePerS) parts.push(Math.round(m.cloakRechargePerS * 100) + '% cloak recharge/s');
    if (m.impulseChargeCapacity) parts.push(m.impulseChargeCapacity + ' charges');
    if (m.bombPropulsion) parts.push('aft-drop enabled');
    if (m.weaponRangePct) parts.push('+' + Math.round(m.weaponRangePct * 100) + '% wpn rng');
    if (m.weaponDmgPct) parts.push('+' + Math.round(m.weaponDmgPct * 100) + '% wpn dmg');
    if (m.weaponHeatDissipPct) parts.push('+' + Math.round(m.weaponHeatDissipPct * 100) + '% wpn cool');
    if (m.radarRangePct) parts.push('+' + Math.round(m.radarRangePct * 100) + '% radar');
    if (m.hullRepairOOC) parts.push('+' + m.hullRepairOOC + ' hull/s');
    if (m.droneBay) parts.push('drone bay');
    if (m.jumpDriveTier) parts.push('jump T' + m.jumpDriveTier);
    if (m.revealCargo) parts.push('scan cargo');
    if (m.marketIntel) parts.push('market data');
  }
  if (def.dps != null && def.slotType === 'mining') {
    parts.length = 0;
    parts.push(def.dps + ' ore/s');
    if (def.range) parts.push(def.range + ' rng');
    if (def.rareOreChance) parts.push(Math.round(def.rareOreChance * 100) + '% rare');
    if (def.directToCargo) parts.push('direct');
  }
  return parts.join(' · ');
}

// One read-only packet for the engineering panel. The three older fitting-feel helpers were
// previously check-covered but had no production caller; keep their live-stat authority intact and
// compose them here instead of cloning their formulas into the DOM layer.
export function buildOutfittingEngineeringFeel({
  shipId,
  fittings = [],
  preview = null,
  player = null,
} = {}) {
  if (!SHIP_BY_ID.has(shipId)) return null;
  const beforeFittings = Array.isArray(fittings) ? fittings.slice() : [];
  let previewPacket = null;
  if (preview && (preview.defId || preview.remove)) {
    previewPacket = presentModuleFitPreview({
      defId: shipId,
      fittings: beforeFittings,
      moduleId: preview.defId,
      slotIndex: preview.slotIndex,
      remove: preview.remove === true,
      player,
    });
  }

  const afterFittings = previewPacket && previewPacket.ok
    ? previewPacket.afterFittings.slice()
    : beforeFittings.slice();
  const profile = handlingProfileForShip(shipId, {
    fittings: afterFittings,
    player,
    domain: HANDLING_PROFILE_DOMAIN,
  });
  const risks = moduleRiskStrip(afterFittings, {
    shipId,
    fittings: afterFittings,
    player,
  });
  const delta = previewPacket && previewPacket.ok
    ? buildMassDelta(shipId, {
      beforeFittings,
      afterFittings,
      player,
    })
    : null;

  const budget = outfitBudgetForFittings(shipId, afterFittings);
  return Object.freeze({
    shipId,
    mode: preview
      ? (previewPacket && previewPacket.ok ? 'preview' : 'unavailable')
      : 'current',
    previewName: previewPacket && previewPacket.moduleName
      || (preview && FITTABLE_BY_ID.get(preview.defId)?.name)
      || null,
    detail: preview && preview.detail || previewPacket && previewPacket.detail || null,
    beforeFittings: Object.freeze(beforeFittings),
    afterFittings: Object.freeze(afterFittings),
    profile,
    delta,
    risks,
    budget,
  });
}

function engineeringNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const scale = 10 ** digits;
  return String(Math.round(number * scale) / scale);
}

function engineeringDelta(metric) {
  const delta = Number(metric && metric.delta) || 0;
  const sign = delta > 0 ? '+' : '';
  if (metric.unit === 'pct') return sign + engineeringNumber(metric.pct, 1) + '%';
  if (metric.unit === 'wu') return sign + String(Math.round(delta)) + ' wu';
  return sign + engineeringNumber(delta, 2);
}

function meaningfulEngineeringDelta(metric) {
  if (!metric) return false;
  if (metric.unit === 'pct') return Math.abs(Number(metric.pct) || 0) >= 0.1;
  if (metric.unit === 'wu') return Math.abs(Number(metric.delta) || 0) >= 0.5;
  return Math.abs(Number(metric.delta) || 0) >= 0.01;
}

export function outfittingEngineeringFeelHtml(packet) {
  if (!packet || !packet.profile) {
    return '<div class="st-outfit-feel-empty">Select an active hull to inspect its flight feel.</div>';
  }

  const profile = packet.profile;
  const axes = profile.axes.map((axis) => {
    const bar = Math.max(0, Math.min(100, Math.round(Number(axis.bar) || 0)));
    const label = escapeHtml(axis.label);
    const phrase = escapeHtml(axis.higherMeans || 'relative');
    return '<div class="st-outfit-feel-axis">' +
      '<div class="st-outfit-feel-axis__head"><span>' + label + '</span><span class="mono">' +
        escapeHtml(engineeringNumber(axis.raw, 1)) + '</span></div>' +
      '<div class="st-outfit-feel-bar" role="progressbar" aria-label="' + label + ', ' + phrase +
        ' relative to shipped hulls" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + bar + '">' +
        '<span class="st-outfit-feel-bar__fill" style="width:' + bar + '%"></span>' +
      '</div>' +
      '<div class="st-outfit-feel-axis__sense">more is ' + phrase + '</div>' +
    '</div>';
  }).join('');

  let changeHtml;
  if (packet.mode === 'unavailable') {
    changeHtml = '<div class="st-outfit-feel-note st-outfit-feel-note--warn"><b>Preview unavailable.</b> ' +
      escapeHtml(packet.detail || 'No compatible hardpoint on this hull.') + '</div>';
  } else if (packet.mode === 'preview' && packet.delta && packet.delta.ok) {
    const changed = packet.delta.metrics.filter(meaningfulEngineeringDelta);
    const chips = changed.map((metric) =>
      '<span class="st-outfit-feel-delta" title="' + escapeHtml(metric.verb) + '">' +
        escapeHtml(metric.label) + ' <b>' + escapeHtml(engineeringDelta(metric)) + '</b></span>').join('');
    changeHtml = '<div class="st-outfit-feel-preview"><b>' +
      escapeHtml(packet.previewName || 'Fitting') + ' preview</b>' +
      (chips || '<span class="st-outfit-feel-note">No handling change in the live flight model.</span>') +
      '</div>';
  } else {
    changeHtml = '<div class="st-outfit-feel-note">Current fitted profile. Hover or focus a compatible module to preview its handling change.</div>';
  }

  const risks = packet.risks && Array.isArray(packet.risks.risks) ? packet.risks.risks : [];
  const riskHtml = risks.length
    ? risks.map((risk) => {
      const safeTone = ['illegal', 'loud', 'heavy', 'hot'].includes(risk.tone) ? risk.tone : 'neutral';
      return '<span class="st-outfit-feel-risk st-outfit-feel-risk--' + safeTone + '" title="' +
        escapeHtml(risk.basis && risk.basis.detail || risk.label) + '">' + escapeHtml(risk.label) + '</span>';
    }).join('')
    : '<span class="st-outfit-feel-note">No declared loadout risks in live module data.</span>';

  const budget = packet.budget;
  const budgetHtml = budget
    ? '<div class="st-outfit-feel-section"><span class="st-outfit-feel-label">Fit mass</span>' +
      '<div class="st-outfit-feel-note mono">' +
      escapeHtml(budget.used + '/' + budget.outfitSpace + ' t total · ' +
        budget.weaponUsed + '/' + budget.weaponCapacity + ' t weapons · ' +
        budget.engineUsed + '/' + budget.engineCapacity + ' t engine') +
      '</div></div>'
    : '';

  return '<div class="st-outfit-feel__head"><span>Flight feel</span><span class="mono">' +
      escapeHtml(profile.driveLabel || profile.flightClass || 'ship') + '</span></div>' +
    '<div class="st-outfit-feel-axes">' + axes + '</div>' +
    budgetHtml +
    '<div class="st-outfit-feel-section"><span class="st-outfit-feel-label">Fit change</span>' + changeHtml + '</div>' +
    '<div class="st-outfit-feel-section"><span class="st-outfit-feel-label">Declared risks</span><div class="st-outfit-feel-risks">' +
      riskHtml + '</div></div>';
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function prettyMissionType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function missionPickForOutfitting(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (trackedId != null) {
    const tracked = active.find((m) => m && m.status === 'active' && String(missionId(m)) === String(trackedId));
    if (tracked) return { mission: tracked, tracked: true };
  }
  const fallback = active.find((m) => m && m.status === 'active') || null;
  return { mission: fallback, tracked: false };
}

export function missionFitGuide(mission) {
  if (!mission) return null;
  switch (mission.type) {
    case 'cargo_delivery':
    case 'bulk_trade':
      return { label: 'Haulage Fit', text: 'Cargo space is the payout lever; add engine or shield margin only after the hold can carry the contract cleanly.', wants: ['cargo', 'engine', 'shield'] };
    case 'mining_quota':
      return { label: 'Mining Fit', text: 'Mining beams and cargo racks shorten the loop; shields keep the ore run from turning into debris.', wants: ['mining', 'cargo', 'shield'] };
    case 'salvage_retrieval':
      return { label: 'Recovery Fit', text: 'Bring cargo space for the claim and enough shield or utility support to survive the wreck field.', wants: ['cargo', 'shield', 'utility'] };
    case 'smuggling_run':
      return { label: 'Smuggling Fit', text: 'Speed and cargo beat fair fights here; shields are the apology letter if a patrol gets curious.', wants: ['engine', 'cargo', 'shield'] };
    case 'passenger_transport':
      return { label: 'Courier Fit', text: 'Engine and shield upgrades protect the schedule; cargo is secondary unless the job also asks for freight.', wants: ['engine', 'shield', 'utility'] };
    case 'bounty_hunt':
    case 'patrol_clear':
      return { label: 'Combat Fit', text: 'Weapons make the timer honest; shields and engines decide whether you leave with the bounty or become it.', wants: ['weapon', 'shield', 'engine'] };
    case 'escort':
      return { label: 'Escort Fit', text: 'Sustained weapons and shields matter more than cargo; fit to stay alive beside the convoy.', wants: ['weapon', 'shield', 'utility'] };
    case 'recon_scan':
      return { label: 'Scout Fit', text: 'Utility and engine upgrades shorten the sweep; shields cover mistakes in dirty lanes.', wants: ['utility', 'engine', 'shield'] };
    default:
      return { label: 'Mission Fit', text: 'Use the tracked contract to buy toward a job instead of buying anonymous numbers in a vacuum.', wants: ['weapon', 'shield', 'cargo'] };
  }
}

export function slotReadiness(slots, owned, slotType) {
  const fittings = owned && owned.fittings || [];
  let total = 0, fitted = 0, open = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].type !== slotType) continue;
    total++;
    if (fittings[i]) fitted++;
    else open++;
  }
  if (!total) return { kind: 'bad', text: slotType.toUpperCase() + ': no slot' };
  if (fitted > 0) return { kind: 'ok', text: slotType.toUpperCase() + ': ' + fitted + ' fitted' };
  if (open > 0) return { kind: 'warn', text: slotType.toUpperCase() + ': ' + open + ' open' };
  return { kind: 'bad', text: slotType.toUpperCase() + ': blocked' };
}
