// Wreck Court picture. Each body cites a Forge place. The shipping draw is not an extruded polygon.

import { WRECK_COURT_PLACES } from '../../data/wreckCourt/places.js';
import { WRECK_COURT_VARIANTS } from '../../data/wreckCourt/variants.js';

export function presentCourt(view) {
  const draws = [];
  for (const body of view.bodies || []) {
    const variant = WRECK_COURT_VARIANTS[body.variant];
    const placeId = WRECK_COURT_PLACES[body.variant];
    if (!variant || !placeId) continue;
    draws.push({
      id: body.id,
      variant: body.variant,
      role: variant.role,
      material: variant.material,
      placeId,
      extruded: false,
      x: body.x,
      z: body.z,
      heading: body.heading || 0,
      radius: body.radius,
      destroyed: !!body.destroyed,
    });
  }
  const player = view.player || { x: 0, z: 0 };
  return {
    draws,
    camera: { x: player.x, y: 180, z: player.z + 0.01, lookAt: { x: player.x, y: 0, z: player.z } },
    light: { direction: { x: 0.35, y: 0.8, z: 0.2 }, color: '#f4efe4', fill: '#6e88a8' },
  };
}
