import { EARLY_TRAILER_ENCOUNTERS } from '../data/trailerMoments.js';
import { zonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

// Existing encounters are visits, rather than a rare-roll lottery, on the first Forge route.
// Every ordinary eligibility, spawn-budget and pacing gate remains the director's authority.
export function tickEarlyTrailerEncounters(owner, dir, state, now) {
  if (now > 3 * 3600 || state.world?.currentSectorId !== 'sector_vesta_forge') return;
  const player = owner.player();
  if (!player?.pos || player.flags?.docked || state.onboarding?.active || state.racing?.active) return;
  const zone = zonesForSector('sector_vesta_forge').find(z => z.type === 'refinery_approach');
  if (!zone) return;
  const anchor = sectorLocalToGlobalForSector(zone.center, 'sector_vesta_forge');
  if (Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > zone.radius + 250) return;
  const visits = dir.stats.trailerVisits || (dir.stats.trailerVisits = {});
  for (const shapeId of EARLY_TRAILER_ENCOUNTERS) {
    if (visits[shapeId]) continue;
    if (state.story?.depthProgramEncounters?.completed?.[shapeId]) { visits[shapeId] = true; continue; }
    if (Object.values(dir.live || {}).some(live => live.shapeId === shapeId)) { visits[shapeId] = true; continue; }
    const result = owner.requestAuthoredEncounter({
      shapeId, encounterId: `trailer:${shapeId}`, sectorId: 'sector_vesta_forge', zoneId: zone.id,
      respectPacing: true, data: { trailerIntroduction: true },
    });
    if (result?.ok) visits[shapeId] = true;
    return;
  }
}
