// src/ui/screens/outfitting.js — STATION "Outfitting" tab panel.
// Premium 3D engineering view: file-tree fit hierarchy, central 3D stage with hardpoint highlights
// and power-flow beams, circular stat gauges, ghost preview on hover, and amber/red invalid-fit
// path interruption. Fit/unfit emits ui:fitModule / ui:unfitModule; ships system owns mutation.
// Module shop emits ui:buyModule after shared confirm for positive-cost buys.
// Read-only over sim state; UI emits intents only.
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
import { confirm, isConfirmOpen } from '../confirm.js';
import { escapeHtml } from '../comms.js';
import {
  describeOutfittingSpendConfirm,
  isOutfittingSpendDanger,
} from '../outfittingSpendConfirm.js';
import { createShipEngineeringStage } from '../shipEngineeringStage.js';
import { createFitTree } from '../fitTree.js';
import { createMorphLabel } from '../effects/index.js';
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

export { describeOutfittingSpendConfirm, isOutfittingSpendDanger };

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
  const researched = new Set(player.researchedNodes || []);
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
    if (m.magnetRange) parts.push(m.magnetRange + ' magnet');
    if (m.masslineHeadId === 'tractor') parts.push('tractor head');
    if (m.masslineHeadId === 'elastic_whip') parts.push('spring-energy head');
    if (m.masslineHeadId === 'frame_coupler') parts.push('separation-damping head');
    if (m.masslineHeadId === 'monofilament_sweep') parts.push('hostile-cut sweep head');
    if (m.masslineHeadId === 'transverse_snare') parts.push('free-target crossing snare');
    if (m.masslineHeadId === 'twin_bridle') parts.push('two-endpoint world tether');
    if (m.cloakBaseRadius) parts.push(m.cloakBaseRadius + ' detection ring');
    if (m.cloakDrainPerS) parts.push(Math.round(m.cloakDrainPerS * 100) + '% cloak drain/s');
    if (m.cloakRechargePerS) parts.push(Math.round(m.cloakRechargePerS * 100) + '% cloak recharge/s');
    if (m.impulseChargeCapacity) parts.push(m.impulseChargeCapacity + ' charges');
    if (m.bombPropulsion) parts.push('aft-drop enabled');
    if (m.weaponRangePct) parts.push('+' + Math.round(m.weaponRangePct * 100) + '% wpn rng');
    if (m.weaponDmgPct) parts.push('+' + Math.round(m.weaponDmgPct * 100) + '% wpn dmg');
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

function missionAdvisorChipHtml(chip) {
  return '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>';
}

export function createOutfittingPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-outfit';

  const advisor = document.createElement('div');
  advisor.className = 'st-mission-guide st-outfit-advisor';
  root.appendChild(advisor);

  const engineering = document.createElement('div');
  engineering.className = 'st-outfit-engineering';
  root.appendChild(engineering);

  // Left: fit tree
  const treeWrap = document.createElement('div');
  treeWrap.className = 'st-outfit-tree-wrap';
  engineering.appendChild(treeWrap);

  // Center: 3D stage + truthful handling/risk preview.
  const centerWrap = document.createElement('div');
  centerWrap.className = 'st-outfit-center';
  engineering.appendChild(centerWrap);

  const stageWrap = document.createElement('div');
  stageWrap.className = 'st-outfit-stage-wrap';
  centerWrap.appendChild(stageWrap);

  const feelWrap = document.createElement('section');
  feelWrap.className = 'st-outfit-feel';
  feelWrap.setAttribute('aria-label', 'Current and previewed flight feel');
  feelWrap.setAttribute('aria-live', 'polite');
  centerWrap.appendChild(feelWrap);

  let stage = null;
  function ensureStage() {
    if (stage) return stage;
    stage = createShipEngineeringStage(stageWrap, {
      envMap: ctx.state && ctx.state.render && ctx.state.render.envMap,
    });
    return stage;
  }

  // Right: inventory + shop
  const rightWrap = document.createElement('div');
  rightWrap.className = 'st-outfit-right';
  engineering.appendChild(rightWrap);

  const invWrap = document.createElement('div');
  invWrap.className = 'st-outfit-inv';
  invWrap.innerHTML = '<div class="st-sub-h">Module Inventory</div><div class="st-inv-list"></div>';
  rightWrap.appendChild(invWrap);
  const invList = invWrap.querySelector('.st-inv-list');

  const shopWrap = document.createElement('div');
  shopWrap.className = 'st-outfit-shop';
  shopWrap.innerHTML =
    '<div class="st-sub-h">Module Shop</div>' +
    '<div class="st-shop-head"><span class="st-shop-credits mono"></span></div>' +
    '<div class="st-shop-list"></div>';
  rightWrap.appendChild(shopWrap);
  const shopList = shopWrap.querySelector('.st-shop-list');
  const shopCredits = shopWrap.querySelector('.st-shop-credits');

  const creditsMount = document.createElement('span');
  shopCredits.appendChild(creditsMount);
  const creditsLabel = createMorphLabel(creditsMount, { numeric: true });

  // Fit tree
  const fitTree = createFitTree(treeWrap, {
    onSelect: (idx) => { selectedSlot = idx; refreshStage(); },
    onHover: (idx) => { hoverSlot = idx; refreshStage(); },
    onLeave: () => { hoverSlot = null; refreshStage(); },
  });

  let panel = { stationId: null };
  let selectedSlot = null;
  let hoverSlot = null;
  let previewFit = null; // { slotIndex, defId }

  function activeOwned() {
    const p = ctx.state.player;
    return (p.ownedShips || [])[p.activeShipIndex] || null;
  }

  function activeShipDef() {
    const owned = activeOwned();
    return owned ? SHIP_BY_ID.get(owned.defId) : null;
  }

  function activeSlots() {
    const def = activeShipDef();
    return def ? buildSlotList(def) : [];
  }

  function refreshStage() {
    const owned = activeOwned();
    const def = activeShipDef();
    if (!owned || !def) {
      if (stage) stage.setActive(false);
      feelWrap.innerHTML = outfittingEngineeringFeelHtml(null);
      return;
    }
    ensureStage();
    // Your current ship + fitted modules. Hitch always uses the flight hero mesh.
    stage.setShip(def.id, {
      fittings: owned.fittings || [],
      weapons: owned.weapons || null,
      isPlayer: true,
    });
    stage.setActive(true);
    // Re-fit the canvas to the laid-out stage size (the canvas may have been created before the
    // tab panel was visible/sized). Idempotent; cheap when already correct.
    try { stage.resize(); } catch (_) {}

    const slots = activeSlots();
    const fittings = owned.fittings || [];

    // Power-flow beams to every fitted / hovered system.
    const beamSpecs = [];
    slots.forEach((slot, i) => {
      const filled = !!fittings[i];
      const isHover = hoverSlot === i;
      const isSelected = selectedSlot === i;
      if (filled || isHover || isSelected) {
        let kind = slot.type === 'weapon' ? 'danger' : slot.type === 'shield' ? 'shield' : slot.type === 'engine' ? 'warn' : 'accent';
        if (previewFit && previewFit.slotIndex === i) {
          const previewDef = FITTABLE_BY_ID.get(previewFit.defId);
          if (previewDef && !fits(slot, previewDef)) kind = 'heat'; // amber invalid
        }
        beamSpecs.push({ slotIndex: i, kind, active: filled || (previewFit && previewFit.slotIndex === i) });
      }
    });
    stage.setPowerFlow(beamSpecs);

    const targetSlot = hoverSlot != null ? hoverSlot : selectedSlot;
    if (targetSlot != null) stage.setHighlightSlot(targetSlot);

    // Ghost preview: if hovering a shop/inventory item, show it on the tree + beams.
    if (previewFit) {
      fitTree.setPreview(previewFit.slotIndex, previewFit.defId);
    } else {
      fitTree.setPreview(-1, null);
    }

    // Stats: live fittings, or ghost preview via canonical engineering presenter.
    let gauges;
    let ghostLabel = false;
    if (previewFit && previewFit.defId && previewFit.slotIndex >= 0 && !previewFit.remove) {
      const ghost = presentModuleFitPreview({
        defId: def.id,
        fittings,
        moduleId: previewFit.defId,
        slotIndex: previewFit.slotIndex,
        player: ctx.state.player,
      });
      gauges = ghost.ok ? ghost.gauges : presentGaugePacket(def.id, fittings, ctx.state.player);
      ghostLabel = !!ghost.ok;
    } else if (previewFit && previewFit.remove && previewFit.slotIndex >= 0) {
      const ghost = presentModuleFitPreview({
        defId: def.id,
        fittings,
        slotIndex: previewFit.slotIndex,
        remove: true,
        player: ctx.state.player,
      });
      gauges = ghost.ok ? ghost.gauges : presentGaugePacket(def.id, fittings, ctx.state.player);
      ghostLabel = !!ghost.ok;
    } else {
      gauges = presentGaugePacket(def.id, fittings, ctx.state.player);
    }
    if (gauges && gauges.ok !== false && gauges.mass != null) {
      stage.setGauges({
        mass: gauges.mass,
        capMax: gauges.capMax,
        capRegen: gauges.capRegen,
        shieldMax: gauges.shieldMax,
        cargoCap: gauges.cargoCap,
        maxSpeed: gauges.maxSpeed,
        continuousDrain: gauges.continuousDrain,
      });
    }
    const unavail = previewFit && previewFit.slotIndex < 0
      ? ' <span class="st-outfit-ghost-label" title="No compatible hardpoint">unavailable</span>'
      : '';
    stage.setLabel(
      'YOUR SHIP · <span class="mono">' + escapeHtml(def.name) + '</span>'
      + ' · T' + (def.tier || 0)
      + ' · fit modules here · new ships in Shipyard'
      + (ghostLabel ? ' <span class="st-outfit-ghost-label">preview</span>' : '')
      + unavail,
    );
    feelWrap.innerHTML = outfittingEngineeringFeelHtml(buildOutfittingEngineeringFeel({
      shipId: def.id,
      fittings,
      preview: previewFit,
      player: ctx.state.player,
    }));
  }

  function renderMissionAdvisor() {
    const pick = missionPickForOutfitting(ctx.state);
    const mission = pick.mission;
    const owned = activeOwned();
    const shipDef = owned ? SHIP_BY_ID.get(owned.defId) : null;
    const slots = shipDef ? buildSlotList(shipDef) : [];
    if (!mission) {
      advisor.innerHTML =
        '<div><span class="st-mission-preflight-chip st-mission-preflight-chip--info">MISSION FIT ADVISOR</span></div>' +
        '<div class="st-mission-purpose"><b>Pick a contract on the Mission Board before buying gear.</b> Then this bay turns into a checklist: haulage wants cargo, combat wants weapons and shields, scans want utility.</div>';
      return;
    }
    const guide = missionFitGuide(mission);
    const chips = guide.wants.map((slotType) => missionAdvisorChipHtml(slotReadiness(slots, owned, slotType))).join('');
    const status = pick.tracked ? 'TRACKED JOB' : 'ACTIVE JOB';
    const nextBuy = recommendOutfittingPurchase(ctx.state.player, slots, (owned && owned.fittings) || [], {
      wantedSlots: guide.wants,
      tier: stationTier(panel.stationId),
      shipDef,
    });
    advisor.innerHTML =
      '<div class="st-mission-preflight">' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">MISSION FIT ADVISOR</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--ok">' + escapeHtml(status) + '</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + escapeHtml(nextBuy.kind) + '">' + escapeHtml(nextBuy.state.toUpperCase()) + '</span>' +
        chips +
      '</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyMissionType(mission.type)) + '</div>' +
      '<div class="st-mission-purpose"><b>' + escapeHtml(guide.label) + ':</b> ' + escapeHtml(guide.text) + '</div>' +
      '<div class="st-mission-purpose st-outfit-nextbuy"><b>' + escapeHtml(nextBuy.title) + ':</b> ' + escapeHtml(nextBuy.detail) + '</div>';
  }

  function rebuildInventory() {
    const p = ctx.state.player;
    const inv = p.moduleInventory || [];
    invList.textContent = '';
    if (!inv.length) { invList.innerHTML = '<div class="st-empty">Inventory empty. Unfit or buy modules to stock it.</div>'; return; }
    const owned = activeOwned();
    const shipDef = owned ? SHIP_BY_ID.get(owned.defId) : null;
    const slots = shipDef ? buildSlotList(shipDef) : [];
    const frag = document.createDocumentFragment();
    for (const m of inv) {
      const def = FITTABLE_BY_ID.get(m.defId);
      if (!def) continue;
      const compatible = owned && slots.some((s, i) =>
        !owned.fittings[i] && fits(s, def) && !fitBlockerForSlot(shipDef, owned.fittings, i, def));
      const item = document.createElement('div');
      item.className = 'st-inv-item' + (compatible ? '' : ' incompat');
      item.setAttribute('data-inst', m.instanceId);
      item.setAttribute('data-def', m.defId);
      item.innerHTML =
        '<span class="st-inv-name">' + escapeHtml(def.name) + '</span>' +
        '<span class="st-inv-meta mono">' + escapeHtml(def.slotType) + ' ' + escapeHtml(def.size) + '</span>';
      frag.appendChild(item);
    }
    invList.appendChild(frag);
  }

  function rebuildShop() {
    const p = ctx.state.player;
    const owned = activeOwned();
    const shipDef = owned ? SHIP_BY_ID.get(owned.defId) : null;
    const slots = shipDef ? buildSlotList(shipDef) : [];
    const fittings = owned && Array.isArray(owned.fittings) ? owned.fittings : [];
    const tier = stationTier(panel.stationId);
    const mission = missionPickForOutfitting(ctx.state).mission;
    const guide = missionFitGuide(mission);
    const wantedSlots = new Set(guide ? guide.wants : []);

    creditsLabel.set(fmtCr(p.credits));

    shopList.textContent = '';
    const frag = document.createDocumentFragment();
    let lastSlotType = '';

    for (const def of ALL_BUYABLE) {
      if (def.tier > tier + 1) continue;
      const alreadyOwned = (p.moduleInventory || []).some((m) => m.defId === def.id);
      const missionFit = wantedSlots.has(def.slotType);

      if (def.slotType !== lastSlotType) {
        lastSlotType = def.slotType;
        const hdr = document.createElement('div');
        hdr.className = 'st-shop-group';
        hdr.textContent = def.slotType.toUpperCase();
        frag.appendChild(hdr);
      }

      const purchase = describeOutfittingPurchase(def, p, slots, fittings, shipDef);

      // Truthful loadout deltas: ships.getDerivedStats via engineeringPreview (never raw mods keys).
      let deltaHtml = '';
      if (owned) {
        const shopDelta = presentShopModuleDelta({
          defId: owned.defId,
          fittings,
          moduleId: def.id,
          player: p,
        });
        if (shopDelta.ok && shopDelta.chips.length) {
          const chips = shopDelta.chips.map((chip) => {
            const cls = chip.tone === 'better' ? 'up' : (chip.tone === 'worse' ? 'down' : '');
            return '<span class="st-delta' + (cls ? ' ' + cls : '') + '">' + escapeHtml(chip.label) + '</span>';
          });
          deltaHtml = '<div class="st-shop-delta" title="' + escapeHtml(shopDelta.detail || 'Derived loadout preview') + '">' +
            chips.join(' ') + '</div>';
        } else if (!shopDelta.ok && purchase.hasSlot === false) {
          deltaHtml = '<div class="st-shop-delta st-shop-delta--unavail" title="' +
            escapeHtml(shopDelta.detail || 'Unavailable') + '">' +
            '<span class="st-delta">' + escapeHtml(shopDelta.detail || 'No compatible hardpoint') + '</span></div>';
        }
      }

      const row = document.createElement('div');
      row.className = 'st-shop-row' + (!purchase.unlocked ? ' locked' : '') + (!purchase.afford ? ' noafford' : '') + (!purchase.hasSlot ? ' nofit' : '') + (missionFit ? ' mission-fit' : '');
      row.setAttribute('data-shop', def.id);
      const fitAttr = purchase.fitSlotIndex >= 0 ? ' data-fit-slot="' + purchase.fitSlotIndex + '"' : '';
      const actionAttrs = purchase.disabled ? ' disabled' : ' data-act="buy"' + fitAttr;
      const btnHtml = '<button' + actionAttrs + ' title="' + escapeHtml(purchase.title) + '" aria-label="' + escapeHtml(purchase.title) + '">' + escapeHtml(purchase.label) + '</button>';

      row.innerHTML =
        '<span class="c-name">' + escapeHtml(def.name) +
          (missionFit ? ' <span class="st-tag st-tag-active">job fit</span>' : '') +
          (alreadyOwned ? ' <span class="st-tag st-tag-owned">owned</span>' : '') +
          (!purchase.hasSlot && purchase.unlocked ? ' <span class="st-tag">no slot</span>' : '') +
        '</span>' +
        '<span class="c-num st-shop-slot mono">' + escapeHtml(def.slotType[0].toUpperCase()) + ':' + escapeHtml(def.size) + '</span>' +
        '<span class="c-num st-shop-stats">' + escapeHtml(statSnippet(def)) + deltaHtml + '</span>' +
        '<span class="c-num st-shop-price mono">' + fmtCr(def.price) + '</span>' +
        '<span class="c-act">' + btnHtml + '</span>';
      frag.appendChild(row);
    }
    if (!frag.childElementCount) {
      shopList.innerHTML = '<div class="st-empty">No modules available at this station.</div>';
    } else {
      shopList.appendChild(frag);
    }
  }

  // ---- event listeners ----
  invList.addEventListener('click', (ev) => {
    const item = ev.target.closest('[data-inst]');
    if (!item) return;
    const instanceId = item.getAttribute('data-inst');
    const defId = item.getAttribute('data-def');
    const def = FITTABLE_BY_ID.get(defId);
    const owned = activeOwned();
    if (!owned) return;
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)
      && !fitBlockerForSlot(shipDef, owned.fittings, selectedSlot, def)) ? selectedSlot : -1;
    if (target < 0) target = slots.findIndex((s, i) =>
      !owned.fittings[i] && fits(s, def) && !fitBlockerForSlot(shipDef, owned.fittings, i, def));
    if (target < 0) {
      const physicalSlot = slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
      const blocker = physicalSlot >= 0
        ? fitBlockerForSlot(shipDef, owned.fittings, physicalSlot, def)
        : null;
      ctx.bus.emit('toast', { text: blocker && blocker.text || 'No compatible empty slot for ' + def.name, kind: 'warn', ttl: 3 });
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    ctx.bus.emit('ui:fitModule', { slotIndex: target, instanceId });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    selectedSlot = null; previewFit = null;
    refresh();
  });

  invList.addEventListener('mouseover', (ev) => {
    const item = ev.target.closest('[data-inst]');
    if (!item) { previewFit = null; refreshStage(); return; }
    const owned = activeOwned();
    if (!owned) return;
    const def = FITTABLE_BY_ID.get(item.getAttribute('data-def'));
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)
      && !fitBlockerForSlot(shipDef, owned.fittings, selectedSlot, def)) ? selectedSlot : slots.findIndex((s, i) =>
      !owned.fittings[i] && fits(s, def) && !fitBlockerForSlot(shipDef, owned.fittings, i, def));
    if (target >= 0) previewFit = { slotIndex: target, defId: def.id };
    else {
      const physicalSlot = slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
      const blocker = physicalSlot >= 0
        ? fitBlockerForSlot(shipDef, owned.fittings, physicalSlot, def)
        : null;
      previewFit = { slotIndex: -1, defId: def.id, detail: blocker && blocker.text || 'No compatible hardpoint on this hull.' };
    }
    refreshStage();
  });

  invList.addEventListener('mouseout', () => { previewFit = null; refreshStage(); });

  // Single native Buy path for pointer / keyboard / gamepad activation (button click). Paid buys
  // await shared confirm before ui:buyModule; free actions skip the dialog. Re-entry while a
  // confirm is open cannot double-emit.
  let buyConfirmBusy = false;
  shopList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act="buy"]');
    if (!btn || btn.disabled) return;
    if (buyConfirmBusy || isConfirmOpen()) return;

    const row = btn.closest('[data-shop]');
    if (!row) return;
    const defId = row.getAttribute('data-shop');
    const def = FITTABLE_BY_ID.get(defId);
    const fitSlotRaw = btn.getAttribute('data-fit-slot');
    const fitSlotIndex = fitSlotRaw == null || fitSlotRaw === '' ? NaN : Number(fitSlotRaw);
    const payload = { defId };
    if (Number.isInteger(fitSlotIndex) && fitSlotIndex >= 0) payload.fitSlotIndex = fitSlotIndex;

    const price = Math.max(0, Number(def && def.price) || 0);
    if (price > 0) {
      // Ensure cancel restores focus to this Buy control (confirm captures activeElement as opener).
      try { btn.focus({ preventScroll: true }); } catch (_) {
        try { btn.focus(); } catch (__) {}
      }
      const credits = Math.max(0, Number(ctx.state.player && ctx.state.player.credits) || 0);
      const confirmOpts = describeOutfittingSpendConfirm(def, credits, {
        fitSlotIndex: payload.fitSlotIndex,
      });
      if (confirmOpts) {
        buyConfirmBusy = true;
        let ok = false;
        try {
          ok = await confirm(confirmOpts);
        } finally {
          buyConfirmBusy = false;
        }
        if (!ok) {
          ctx.bus.emit('audio:cue', { id: 'ui_deny' });
          return;
        }
      }
    }

    ctx.bus.emit('ui:buyModule', payload);
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    setTimeout(() => refresh(), 50);
  });

  shopList.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest('[data-shop]');
    if (!row) { previewFit = null; refreshStage(); return; }
    const defId = row.getAttribute('data-shop');
    const def = FITTABLE_BY_ID.get(defId);
    const owned = activeOwned();
    if (!owned || !def) return;
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)
      && !fitBlockerForSlot(shipDef, owned.fittings, selectedSlot, def)) ? selectedSlot : slots.findIndex((s, i) =>
      !owned.fittings[i] && fits(s, def) && !fitBlockerForSlot(shipDef, owned.fittings, i, def));
    if (target >= 0) previewFit = { slotIndex: target, defId };
    else {
      const physicalSlot = slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
      const blocker = physicalSlot >= 0
        ? fitBlockerForSlot(shipDef, owned.fittings, physicalSlot, def)
        : null;
      previewFit = { slotIndex: -1, defId, detail: blocker && blocker.text || 'No compatible hardpoint on this hull.' };
    }
    refreshStage();
  });

  shopList.addEventListener('mouseout', () => { previewFit = null; refreshStage(); });
  // The existing ghost preview was pointer-only. A focused Buy control now drives the exact same
  // read-only packet, so keyboard/gamepad users can inspect the handling/risk consequence before
  // confirming a purchase.
  shopList.addEventListener('focusin', (ev) => {
    const row = ev.target.closest('[data-shop]');
    if (!row) return;
    const defId = row.getAttribute('data-shop');
    const def = FITTABLE_BY_ID.get(defId);
    const owned = activeOwned();
    if (!owned || !def) return;
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    const target = (selectedSlot != null && fits(slots[selectedSlot], def)
      && !fitBlockerForSlot(shipDef, owned.fittings, selectedSlot, def))
      ? selectedSlot
      : slots.findIndex((slot, index) =>
        !owned.fittings[index] && fits(slot, def) && !fitBlockerForSlot(shipDef, owned.fittings, index, def));
    if (target >= 0) previewFit = { slotIndex: target, defId };
    else {
      const physicalSlot = slots.findIndex((slot, index) => !owned.fittings[index] && fits(slot, def));
      const blocker = physicalSlot >= 0
        ? fitBlockerForSlot(shipDef, owned.fittings, physicalSlot, def)
        : null;
      previewFit = { slotIndex: -1, defId, detail: blocker && blocker.text || 'No compatible hardpoint on this hull.' };
    }
    refreshStage();
  });
  shopList.addEventListener('focusout', (ev) => {
    if (ev.relatedTarget && shopList.contains(ev.relatedTarget)) return;
    previewFit = null;
    refreshStage();
  });

  function refresh() {
    renderMissionAdvisor();
    const owned = activeOwned();
    const def = activeShipDef();
    fitTree.setShip(def ? def.id : null, owned ? owned.fittings : []);
    fitTree.setSelected(selectedSlot);
    rebuildInventory();
    rebuildShop();
    refreshStage();
    creditsLabel.set(fmtCr(ctx.state.player.credits || 0));
  }

  return {
    el: root,
    stationId: null,
    onShow(c) {
      if (c && c.stationId) panel.stationId = c.stationId;
      selectedSlot = null;
      previewFit = null;
      refresh();
      // Stage often mounts while the tab is display:none (0×0). Re-fit after layout paint.
      const refit = () => {
        try {
          if (stage && typeof stage.resize === 'function') stage.resize();
          else refreshStage();
        } catch (_) { /* best-effort */ }
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(refit));
      } else {
        setTimeout(refit, 32);
      }
    },
    refresh,
    dispose() { if (stage) { try { stage.dispose(); } catch (e) {} stage = null; } if (fitTree) fitTree.dispose(); },
  };
}
