// src/ui/screens/outfitting.js — STATION "Outfitting" tab panel.
// Premium 3D engineering view: file-tree fit hierarchy, central 3D stage with hardpoint highlights
// and power-flow beams, circular stat gauges, ghost preview on hover, and amber/red invalid-fit
// path interruption. Fit/unfit emits ui:fitModule / ui:unfitModule; ships system owns mutation.
// Module shop emits ui:buyModule. Read-only over sim state; UI emits intents only.
import { buildSlotList, getDerivedStats, fits } from '../../systems/ships.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { SECTORS } from '../../data/sectors.js';
import { TECH_NODES } from '../../data/tech.js';
import { confirm } from '../confirm.js';
import { escapeHtml } from '../comms.js';
import { createShipEngineeringStage } from '../shipEngineeringStage.js';
import { createFitTree } from '../fitTree.js';
import { createMorphLabel } from '../effects/index.js';

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

export function describeOutfittingPurchase(def, player = {}, slots = [], fittings = []) {
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
  const fitSlotIndex = safeSlots.findIndex((s, i) => !safeFittings[i] && fits(s, def));

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
      title: def.name + ' fits this hull, but every compatible slot is full. Buy it into inventory or unfit a module first.',
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
      purchase: describeOutfittingPurchase(def, player, slots, fittings),
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
  const currentHullBuy = sorted.find((entry) => !entry.purchase.disabled && entry.purchase.hasSlot);
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

function statSnippet(def) {
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
    if (m.boostTopSpeedPct) parts.push('+' + Math.round(m.boostTopSpeedPct * 100) + '% boost');
    if (m.magnetRange) parts.push(m.magnetRange + ' magnet');
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

  // Center: 3D stage
  const stageWrap = document.createElement('div');
  stageWrap.className = 'st-outfit-stage-wrap';
  engineering.appendChild(stageWrap);

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
      return;
    }
    ensureStage();
    stage.setShip(def.id);
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

    // Stats: use preview fittings if any.
    const previewFittings = previewFit ? fittings.slice() : null;
    if (previewFittings) {
      if (previewFit.remove) previewFittings[previewFit.slotIndex] = null;
      else previewFittings[previewFit.slotIndex] = previewFit.defId;
    }
    const stats = getDerivedStats(def.id, previewFittings || fittings, ctx.state.player);
    stage.setGauges({
      mass: stats.mass,
      capMax: stats.capMax,
      capRegen: stats.capRegen,
      shieldMax: stats.shieldMax,
      cargoCap: stats.cargoCap,
      maxSpeed: stats.maxSpeed,
      continuousDrain: stats.continuousDrain,
    });
    stage.setLabel('<span class="mono">' + escapeHtml(def.name) + '</span>' +
      (previewFit ? ' <span class="st-outfit-ghost-label">preview</span>' : ''));
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
      const compatible = owned && slots.some((s, i) => !owned.fittings[i] && fits(s, def));
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

      const purchase = describeOutfittingPurchase(def, p, slots, fittings);

      let deltaHtml = '';
      if (owned && def.mods) {
        const fittedSlotIdx = slots.findIndex((s, i) => s.type === def.slotType && owned.fittings[i]);
        const fittedDef = fittedSlotIdx >= 0 ? FITTABLE_BY_ID.get(owned.fittings[fittedSlotIdx]) : null;
        if (fittedDef && fittedDef.mods) {
          const deltas = [];
          const allKeys = new Set([...Object.keys(def.mods), ...Object.keys(fittedDef.mods)]);
          for (const key of allKeys) {
            const nv = def.mods[key]; const ov = fittedDef.mods[key];
            if (typeof nv !== 'number' || typeof ov !== 'number') continue;
            const d = nv - ov;
            if (Math.abs(d) < 0.001) continue;
            const sign = d > 0 ? '+' : '';
            const cls = d > 0 ? 'up' : 'down';
            deltas.push('<span class="st-delta ' + cls + '">' + sign + (Number.isInteger(d) ? d : d.toFixed(1)) + ' ' + key.replace(/([A-Z])/g, ' $1').toLowerCase() + '</span>');
          }
          if (deltas.length) deltaHtml = '<div class="st-shop-delta">' + deltas.join(' ') + '</div>';
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
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)) ? selectedSlot : -1;
    if (target < 0) target = slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
    if (target < 0) {
      ctx.bus.emit('toast', { text: 'No compatible empty slot for ' + def.name, kind: 'warn', ttl: 3 });
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
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)) ? selectedSlot : slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
    if (target >= 0) previewFit = { slotIndex: target, defId: def.id };
    else previewFit = { slotIndex: -1, defId: def.id }; // invalid fit path
    refreshStage();
  });

  invList.addEventListener('mouseout', () => { previewFit = null; refreshStage(); });

  shopList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="buy"]');
    if (!btn || btn.disabled) return;
    const defId = btn.closest('[data-shop]').getAttribute('data-shop');
    const fitSlotIndex = Number(btn.getAttribute('data-fit-slot'));
    const payload = { defId };
    if (Number.isInteger(fitSlotIndex) && fitSlotIndex >= 0) payload.fitSlotIndex = fitSlotIndex;
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
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)) ? selectedSlot : slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
    if (target >= 0) previewFit = { slotIndex: target, defId };
    else previewFit = { slotIndex: -1, defId };
    refreshStage();
  });

  shopList.addEventListener('mouseout', () => { previewFit = null; refreshStage(); });

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
