export const DISTANCE_DEFAULT = 144;
export const DISTANCE_CLOSE = 58;

export const PLAY_CHASE_WIDTH_FRAC = Object.freeze([0.08, 0.22]);
const closeScale = DISTANCE_DEFAULT / DISTANCE_CLOSE;
export const PLAY_CHASE_CLOSE_WIDTH_FRAC = Object.freeze(
  PLAY_CHASE_WIDTH_FRAC.map((bound) => bound * closeScale),
);

export function occupancyInBand(widthFrac, { close = false, cropped = false } = {}) {
  const band = close ? PLAY_CHASE_CLOSE_WIDTH_FRAC : PLAY_CHASE_WIDTH_FRAC;
  return !cropped && widthFrac >= band[0] && widthFrac <= band[1];
}
