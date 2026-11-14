// The legacy multirole markers store lateral offsets on Y despite declaring Y-up.
// This reviewed fit seats the swept blade roots into the hull's welded side rails.
// Match the normalized authored signature so corrected/future mounts stay authoritative.
const NORMALIZATION = 0.14010628434949612;
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-6;

export function fitLegacyMultiroleFins(hullRecord, cockpitRecord, finRecord, placements) {
  if (hullRecord?.assetId !== 'SF_HULL_MULTIROLE'
    || cockpitRecord?.assetId !== 'SF_COCKPIT_RECESSED'
    || finRecord?.assetId !== 'SF_PART_FIN_SWEPT_SMUGGLER'
    || placements?.length !== 2) return placements;
  const sides = new Set();
  for (const placement of placements) {
    const [x, y, z] = placement.position || [];
    const side = Math.sign(y);
    const q = placement.quaternion;
    if (!near(x, -.8 * NORMALIZATION) || !near(Math.abs(y), 1.7 * NORMALIZATION)
      || !near(z, .05 * NORMALIZATION) || !q
      || !near(q.x, 0) || !near(q.y, 0) || !near(q.z, 0) || !near(Math.abs(q.w), 1)
      || !placement.mountScale?.every(value => near(value, 1))
      || placement.mountScale.length !== 3) return placements;
    sides.add(side);
  }
  if (sides.size !== 2) return placements;
  return placements.map(placement => ({
    ...placement,
    position: [placement.position[0], placement.position[2], -Math.sign(placement.position[1]) * .15],
  }));
}
