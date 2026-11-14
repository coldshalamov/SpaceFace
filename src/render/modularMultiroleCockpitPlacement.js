import { Quaternion } from 'three';
import { fitLegacyMultiroleFins } from './modularMultiroleFinPlacement.js';

const NORMALIZATION = .14010628434949612;
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-6;

// V5's coaming follows this hull's sloped spine. Old cockpits and future authored
// mounts remain authoritative; resolve fin transforms only for the exact V5 fit.
export function fitLegacyMultiroleCockpit(hull, cockpit, fin, placement, getFinPlacements) {
  if (hull?.assetId !== 'SF_HULL_MULTIROLE'
    || cockpit?.assetId !== 'SF_COCKPIT_RECESSED'
    || fin?.assetId !== 'SF_PART_FIN_SWEPT_SMUGGLER'
    || (cockpit.metadata || cockpit.blueprint?.metadata)?.spacefaceCockpitDesign !== 'recessed-v5') return placement;
  const [x, y, z] = placement.position || [];
  const q = placement.quaternion;
  if (!near(x, 1.1 * NORMALIZATION) || !near(y, 0) || !near(z, .66 * NORMALIZATION)
    || !q || !near(q.x, 0) || !near(q.y, 0) || !near(q.z, 0) || !near(Math.abs(q.w), 1)
    || placement.mountScale?.length !== 3
    || !placement.mountScale.every(value => near(value, 1))) return placement;
  const fins = getFinPlacements();
  if (fitLegacyMultiroleFins(hull, cockpit, fin, fins) === fins) return placement;
  return {
    ...placement,
    position: [x, .2520811811864766, 0],
    quaternion: new Quaternion(0, 0, -.14188997085178007, .9898824355304426),
  };
}
