import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { generateExpeditionLayout } from './layout.js';

/** One finite wreck, well beyond Helios and clear of Vesta's slag radiation field. */
export const BLACKBOX_RUNS_SITE = Object.freeze({
  id: 'blackbox_vesta',
  sectorId: 'sector_vesta_forge',
  zoneId: 'zone_vesta_derelict',
  name: 'BLACKBOX RUNS · Morrowglass',
  localOrigin: Object.freeze({ x: 1660, z: -1600 }),
  rotation: -0.28,
  invitationRadius: 1350,
  resumeRadius: 1800,
  minStarterDistance: 1400,
});

export function getExpeditionSiteLayout(seed, descriptor = null) {
  return generateExpeditionLayout({
    seed: Number.isFinite(seed) ? seed >>> 0 : 0,
    siteId: BLACKBOX_RUNS_SITE.id,
    origin: descriptor?.origin || sectorLocalToGlobalForSector(
      BLACKBOX_RUNS_SITE.localOrigin, BLACKBOX_RUNS_SITE.sectorId),
    rotation: Number.isFinite(descriptor?.rotation) ? descriptor.rotation : BLACKBOX_RUNS_SITE.rotation,
    ...(descriptor?.variant ? { variant: descriptor.variant } : {}),
  });
}
