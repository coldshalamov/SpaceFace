// Proximity admission for authored work sites. The ordinary weighted deck can take hours
// to select one new civilian shape; visiting a real salvage zone should be enough to find it.
// This producer requests the EXISTING director, retaining its pressure, pacing, gates and
// runtime dispatch. It never force-fires a meeting or falls back to direct source creation.
import { zonesForSector } from '../../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { trigger } from '../../data/encounters/8204-pro-salvage-outfits.js';
import { SALVAGE_SITUATIONS } from './catalog.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** A fixed source identity per authored zone, never a timer-based refill of a worked wreck. */
export function salvageOutfitsDiscoveryId(state, zoneId) {
  return `outfits:${Number(state.meta?.seed ?? state.seed) >>> 0}:site:${zoneId}`;
}

export function discoverSalvageOutfits({ state, registry, helpers }) {
  const sectorId = state.world?.currentSectorId;
  if (state.mode !== 'flight' || state.ui?.docked || state.physicsVenue?.active
    || state.run?.kind === 'survival' && state.run.phase !== 'inactive'
    || !trigger.gates.sectorIds.includes(sectorId)) return { ok: false, reason: 'not_adventure' };
  const player = state.entities?.get(state.playerId);
  if (!player?.alive || !player.pos) return { ok: false, reason: 'no_pilot' };
  const director = registry?.get?.('encounterDirector');
  if (!director?.requestAuthoredEncounter) return { ok: false, reason: 'no_director' };
  if (!(helpers?.spawnBudget?.available?.() >= 2)) return { ok: false, reason: 'crew_budget' };
  const meetings = Object.values(state.salvageOutfits?.meetings || {});
  const local = meetings.filter(m => m.sectorId === sectorId);
  if (local.some(m => m.status === 'working')) return { ok: false, reason: 'site_busy' };
  const lastStart = local.reduce((last, m) => Math.max(last, m.createdAt), -Infinity);
  if ((state.simTime || 0) - lastStart < trigger.cooldownS) return { ok: false, reason: 'cooldown' };
  const zones = zonesForSector(sectorId).filter(z => trigger.zoneTypes.includes(z.type));
  let chosen = null;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i], anchor = sectorLocalToGlobalForSector(zone.center, sectorId);
    const encounterId = salvageOutfitsDiscoveryId(state, zone.id);
    // An ordinary random-deck meeting at this same work pocket also consumes the first
    // proximity visit. Coming back to that original must reveal its outcome, not refill it.
    if (state.salvageOutfits?.meetings?.[encounterId]
      || local.some(m => distance(m.anchor, anchor) < 160)) continue;
    const gap = distance(player.pos, anchor);
    if (gap > trigger.fireWithinWu || chosen && gap >= chosen.gap) continue;
    chosen = { zone, anchor, encounterId, gap, variant: SALVAGE_SITUATIONS[i % SALVAGE_SITUATIONS.length].id };
  }
  if (!chosen) return { ok: false, reason: 'no_unworked_zone_nearby' };
  return director.requestAuthoredEncounter({
    shapeId: trigger.id, encounterId: chosen.encounterId, sectorId,
    zoneId: chosen.zone.id, anchor: chosen.anchor, respectPacing: true,
    data: { salvageOutfitsVariant: chosen.variant, salvageOutfitsDiscovery: 'authored_zone' },
  });
}
