// Nursery habitat goals use the existing fauna movement owner, never root motion.
// Bounds from veilRayNurseryVisuals: adult tail radius <23.51 WU;
// mineral inner radial edge 57 WU. A 29 + 1.5 WU center envelope leaves clearance.
export const NURSERY_HABITAT_RADIUS = 29;
export const NURSERY_HABITAT_DRIFT = 1.5;
const SITE_ID = 'veil_ray_nursery';
const TAU = Math.PI * 2;

export function nurseryHabitatOffset(faunaKey, now = 0, phase = 0) {
  const match = /^veil_ray_nursery:veil_ray:([0-2])$/.exec(faunaKey || '');
  if (!match) return null;
  const slot = Number(match[1]);
  const a = Math.PI + slot * TAU / 3;
  const drift = (Number.isFinite(now) ? now : 0) * .08 + (Number.isFinite(phase) ? phase : 0);
  return { x: Math.cos(a) * NURSERY_HABITAT_RADIUS + Math.cos(drift) * NURSERY_HABITAT_DRIFT,
    z: Math.sin(a) * NURSERY_HABITAT_RADIUS + Math.sin(drift) * NURSERY_HABITAT_DRIFT };
}

// Only a newly materialized undisturbed habitat may start in its shelter.
// Existing live entities are skipped by the ecology owner before this is called.
export function nurseryInitialHabitatOffset(site, rec, member, now) {
  if (site?.siteId !== SITE_ID || member?.speciesId !== 'veil_ray'
      || rec?.nursery?.relocation || ![undefined, 'QUIET'].includes(rec?.nursery?.mode)) return null;
  return nurseryHabitatOffset(member.faunaKey, now, member.phase);
}

export function nurseryHabitatGoal(site, rec, entity, center, now) {
  const eco = entity?.data?.ecology, n = rec?.nursery;
  if (site?.siteId !== SITE_ID || eco?.siteId !== SITE_ID || eco?.speciesId !== 'veil_ray'
      || eco.aggregate || !n || !['QUIET', 'RECOVERING'].includes(n.mode)
      || !['forage', 'return'].includes(eco.driveState)
      || n.relocation?.scattered || n.relocation?.move || n.relocation?.tow
      || (n.relocation && n.relocation.status !== 'rehomed')
      || !Number.isFinite(center?.x) || !Number.isFinite(center?.z)) return null;
  const offset = nurseryHabitatOffset(eco.faunaKey, now, eco.phase);
  if (!offset) return null;
  return { x: center.x + offset.x, z: center.z + offset.z };
}

// Conservative all-yaw envelope includes the long tail, not only semantic radius18.
// Goal coordinates never qualify a survey: read the living bodies themselves.
export const NURSERY_ADULT_PLANAR_RADIUS = 23.51;
export const NURSERY_SHELTER_RADIUS = 56;
export function nurseryShelterQualified(adults, center, nursery) {
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z)
      || nursery?.relocation?.scattered || nursery?.relocation?.move || nursery?.relocation?.tow) return false;
  const living = adults.filter(e => e.alive !== false && e.hull > 0);
  return living.length > 0 && living.every(e => Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z)
    && Math.hypot(e.pos.x - center.x, e.pos.z - center.z) + NURSERY_ADULT_PLANAR_RADIUS <= NURSERY_SHELTER_RADIUS);
}
