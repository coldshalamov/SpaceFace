/** Screen-space size floor so a bolt still reads at the chase camera. */

export const CHASE_CAMERA_DISTANCE = 144;
export const CHASE_CAMERA_FOV_DEG = 50;
export const CHASE_CAMERA_VIEWPORT_HEIGHT = 1000;
export const DEFAULT_BOLT_MIN_PIXELS = 12;
export const DEFAULT_BOLT_MIN_LENGTH_PIXELS = 56;

export function worldSizeForPixels(
  distance,
  pixelCount,
  fovDeg = CHASE_CAMERA_FOV_DEG,
  viewportHeight = CHASE_CAMERA_VIEWPORT_HEIGHT,
) {
  const dist = Math.max(0.01, Number(distance) || 0);
  const pixels = Math.max(0, Number(pixelCount) || 0);
  const height = Math.max(1, Number(viewportHeight) || CHASE_CAMERA_VIEWPORT_HEIGHT);
  const fov = Number.isFinite(fovDeg) ? fovDeg : CHASE_CAMERA_FOV_DEG;
  const viewHeight = 2 * dist * Math.tan((fov * Math.PI / 180) * 0.5);
  return pixels / height * viewHeight;
}

export function resolveFloorWidth(authoredWidth, distance, minPixels, fovDeg, viewportHeight) {
  const authored = Math.max(0.01, Number(authoredWidth) || 0.01);
  return Math.max(authored, worldSizeForPixels(distance, minPixels, fovDeg, viewportHeight));
}

export function tanHalfFov(fovDeg = CHASE_CAMERA_FOV_DEG) {
  const fov = Number.isFinite(fovDeg) ? fovDeg : CHASE_CAMERA_FOV_DEG;
  return Math.tan((fov * Math.PI / 180) * 0.5);
}
