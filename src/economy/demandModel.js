// Pure persistent-demand projection.
//
// Observable when present, averaged when absent: this model reads the existing coarse sector field
// and factions-owned conflict records. It never counts ships, battles, cargo entities, or wall time.

import {
  DEMAND_MULTIPLIER_BOUNDS,
  DEMAND_DEPLETION_GATE,
  ECONOMY_DEMAND_PROFILES,
} from '../data/economyDemandProfiles.js';
import { conflictPairsForSector } from '../data/conflictZones.js';
import { thresholdGate } from '../data/economyContractTemplates.js';
import { sectorSignalFor } from '../systems/sectorSim.js';
import { sectorDepletionPressure } from '../systems/fieldDepletion.js';

export { DEMAND_MULTIPLIER_BOUNDS } from '../data/economyDemandProfiles.js';
export { DEMAND_DEPLETION_GATE } from '../data/economyDemandProfiles.js';

const clamp = (value, lo, hi) => value < lo ? lo : value > hi ? hi : value;

function categoryName(commodity) {
  return String(commodity && commodity.category || 'goods').replace(/\s+/g, ' ').trim();
}

function deltaFor(profile, commodity) {
  if (!profile || !commodity) return 0;
  const legality = commodity.legality || 'legal';
  // A blockade's baseline transport premium describes lawful supply. Contraband already has its
  // own access/scarcity mechanics and should not silently inherit a lawful relief premium.
  const defaultDelta = profile === ECONOMY_DEMAND_PROFILES.blockade && legality !== 'legal'
    ? 0
    : Number(profile.defaultDelta) || 0;
  const categoryDelta = Number(profile.categoryDelta && profile.categoryDelta[commodity.category]) || 0;
  const commodityDelta = Number(profile.commodityDelta && profile.commodityDelta[commodity.id]) || 0;
  return defaultDelta + categoryDelta + commodityDelta;
}

function driverFor(profile, commodity, delta, detail) {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const subject = commodity.id === 'cmdty_fuel_cells' ? 'fuel' : categoryName(commodity);
  const directionMark = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '—';
  const compactProfile = profile.id === 'war-footing'
    ? 'War'
    : profile.id === 'blockade-relief'
      ? 'Blockade'
      : profile.id === 'depletion-scarcity'
        ? 'Depleted belts'
        : 'Expansion';
  let explanation;
  if (profile.id === 'war-footing') {
    explanation = `Active faction war raises local demand for ${commodity.name}.`;
  } else if (profile.id === 'blockade-relief') {
    explanation = direction === 'down'
      ? `Blockade conditions suppress discretionary demand for ${commodity.name}.`
      : `Disrupted supply lanes increase local demand for ${commodity.name}.`;
  } else if (profile.id === 'depletion-scarcity') {
    explanation = `Local belts are worked out; ${commodity.name} carries a regional scarcity premium.`;
  } else {
    explanation = `Sustained sector throughput increases industrial demand for ${commodity.name}.`;
  }
  return Object.freeze({
    id: profile.id,
    label: profile.label,
    shortLabel: `${compactProfile} · ${subject} ${directionMark}`,
    explanation,
    direction,
    delta,
    multiplier: 1 + delta,
    detail: detail || null,
  });
}

function isWarSector(state, sectorId) {
  const conflicts = state && state.conflicts;
  if (!conflicts) return null;
  for (const pairKey of conflictPairsForSector(sectorId)) {
    const conflict = conflicts[pairKey];
    if (conflict && conflict.state === 'war') return { pairKey, conflict };
  }
  return null;
}

function isIndustrialExpansion(signal) {
  if (!signal || !signal.driver) return false;
  // route_surplus is a persistent averaged throughput signal. Limit the effect to reasonably open
  // lanes; a surplus in a dangerous/disrupted sector is stock congestion, not expansion.
  return signal.driver.pricePressure === 'route_surplus'
    && Number(signal.pricePressure) < -0.12
    && Number(signal.danger) < 0.62;
}

/**
 * Local field memory as a demand context. Reads the same durable depletion scalar the mining and
 * world systems write; intensity is 0 at the gate and 1 at a fully worked sector, so the premium
 * scales with how hard the belts have actually been hit instead of toggling on a threshold.
 */
function depletionContext(state, sectorId) {
  const pressure = sectorDepletionPressure(state, sectorId);
  if (!pressure || pressure.fields <= 0) return null;
  if (pressure.depletion < DEMAND_DEPLETION_GATE) return null;
  const span = Math.max(1e-6, 1 - DEMAND_DEPLETION_GATE);
  const intensity = clamp((pressure.depletion - DEMAND_DEPLETION_GATE) / span, 0, 1);
  if (intensity <= 0) return null;
  return {
    profile: ECONOMY_DEMAND_PROFILES.depletionScarcity,
    detail: intensity,
    intensity,
    fields: pressure.fields,
  };
}

export function effectiveDemandFor({ state, sectorId, commodity } = {}) {
  if (!state || !sectorId || !commodity) {
    return Object.freeze({ multiplier: 1, drivers: Object.freeze([]), context: Object.freeze({}) });
  }
  const signal = sectorSignalFor(state, sectorId);
  const contexts = [];
  const war = isWarSector(state, sectorId);
  if (war) contexts.push({ profile: ECONOMY_DEMAND_PROFILES.war, detail: war.pairKey });
  if (signal && thresholdGate(signal, 'blockade')) {
    contexts.push({ profile: ECONOMY_DEMAND_PROFILES.blockade, detail: signal.driver.pricePressure });
  }
  if (isIndustrialExpansion(signal)) {
    contexts.push({ profile: ECONOMY_DEMAND_PROFILES.industrialExpansion, detail: signal.driver.pricePressure });
  }
  const depletion = depletionContext(state, sectorId);
  if (depletion) contexts.push(depletion);

  let delta = 0;
  const drivers = [];
  for (const context of contexts) {
    const scale = Number.isFinite(context.intensity) ? context.intensity : 1;
    const amount = deltaFor(context.profile, commodity) * scale;
    if (Math.abs(amount) < 1e-9) continue;
    delta += amount;
    drivers.push(driverFor(context.profile, commodity, amount, context.detail));
  }
  const multiplier = clamp(1 + delta, DEMAND_MULTIPLIER_BOUNDS.min, DEMAND_MULTIPLIER_BOUNDS.max);
  return Object.freeze({
    multiplier,
    drivers: Object.freeze(drivers),
    context: Object.freeze({
      war: !!war,
      blockade: !!(signal && thresholdGate(signal, 'blockade')),
      industrialExpansion: isIndustrialExpansion(signal),
      depletion: !!depletion,
    }),
  });
}

export function applyPersistentDemand(mid, demand) {
  const base = Number(mid);
  if (!Number.isFinite(base)) return 0;
  const multiplier = Number(demand && demand.multiplier != null ? demand.multiplier : demand);
  return base * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
}
