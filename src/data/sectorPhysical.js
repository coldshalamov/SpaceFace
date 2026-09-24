// §22 B6 — each of six sectors keeps one physical number that is not Helios's.
// Helios is the baseline (every ratio 1). A ratio is consumed by the sim:
// rock mass by asteroid spawn, patrol response by the distress ETA.

export const HELIOS_SECTOR_ID = 'sector_helios_prime';

const ROW = (rockMass, trafficSpeed, gravity, patrolResponse) => Object.freeze({
  rockMass, trafficSpeed, gravity, patrolResponse,
});

export const SECTOR_PHYSICAL = Object.freeze({
  sector_helios_prime: ROW(1, 1, 1, 1),
  sector_ceres_belt: ROW(1.8, 1, 1, 1),
  sector_tethys_junction: ROW(1, 1, 1, 0.8),
  sector_vesta_forge: ROW(2.2, 1, 1, 1),
  sector_pallas_drift: ROW(1, 1, 1, 1.75),
  sector_io_reach: ROW(0.65, 1, 1, 1),
  sector_charon_expanse: ROW(1, 1, 1, 2.2),
});

/** The six sectors the row names, in chart order. Helios is the comparison, not a member. */
export const B6_SECTOR_IDS = Object.freeze([
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_io_reach',
  'sector_charon_expanse',
]);

const KEYS = Object.freeze(['rockMass', 'trafficSpeed', 'gravity', 'patrolResponse']);

export function sectorPhysical(sectorId) {
  return SECTOR_PHYSICAL[sectorId] || SECTOR_PHYSICAL[HELIOS_SECTOR_ID];
}

export function scaleBySector(sectorId, key, base) {
  const ratio = Number(sectorPhysical(sectorId)[key]);
  const n = Number(base);
  if (!(ratio > 0) || !Number.isFinite(n)) return n;
  return n * ratio;
}

/** Which physical keys differ from Helios. A B6 sector has exactly one. */
export function differingPhysical(sectorId) {
  const row = sectorPhysical(sectorId);
  const helios = sectorPhysical(HELIOS_SECTOR_ID);
  return KEYS.filter((key) => row[key] !== helios[key]);
}

/** Belt-rock mass. Optic lattices do not use this — they are not ore. */
export function asteroidMass(sectorId, size) {
  const span = Number(size);
  const base = 200 + (Number.isFinite(span) ? span : 0) * 40;
  return scaleBySector(sectorId, 'rockMass', base);
}
