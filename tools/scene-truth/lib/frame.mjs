import { CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN } from '../../../src/render/camera.js';
import { qualityTierForPreset, QUALITY_PRESETS } from '../../../src/render/adaptiveQuality.js';
import { burstForParticleQuality } from './constants.mjs';

/**
 * Shipping chase default. camera.js keeps DEFAULT_ZOOM private; the number is
 * locked to that declaration by tools/scene-truth/test/inventory.test.mjs.
 */
export const SHIPPING_CHASE_ZOOM = 144;

/** gameState.js settings.video.fov default. */
export const SHIPPING_FOV_DEG = 50;

/** Composition aspect used by clampFocusToPlayerSafeRect when none is passed. */
export const SHIPPING_ASPECT = 16 / 9;

/**
 * Ground half-extents of the shipping chase frame.
 * Same expression as clampFocusToPlayerSafeRect in src/render/camera.js:
 *   halfV = tan(fov/2) * zoom * 0.72
 * The 0.72 factor is the camera's own safe-rect scale, not a scene-truth fudge.
 * A tilted frustum can show more ground than this rect; the atlas states that.
 */
export function frameHalfExtents(zoom, fovDeg = SHIPPING_FOV_DEG, aspect = SHIPPING_ASPECT) {
  const z = Number(zoom);
  const fov = Number(fovDeg);
  const asp = Number(aspect);
  const halfV = Math.tan((fov * Math.PI / 180) * 0.5) * z * 0.72;
  const halfH = halfV * asp;
  return {
    zoom: z,
    fovDeg: fov,
    aspect: asp,
    halfV,
    halfH,
    legal: z >= CAMERA_ZOOM_MIN && z <= CAMERA_ZOOM_MAX,
  };
}

export function legalZooms() {
  return Object.freeze([CAMERA_ZOOM_MIN, SHIPPING_CHASE_ZOOM, CAMERA_ZOOM_MAX]);
}

export function legalQualityTiers() {
  return QUALITY_PRESETS.map((preset) => {
    const tier = qualityTierForPreset(preset.id);
    return Object.freeze({
      id: preset.id,
      label: preset.label,
      particleQuality: tier.particleQuality,
      shadows: tier.shadows === true,
      renderScale: tier.renderScale,
      burst: burstForParticleQuality(tier.particleQuality),
    });
  });
}

export function projectScreen(object, focus, frame) {
  const x = Number(object.pos.x) - Number(focus.x);
  const z = Number(object.pos.z) - Number(focus.z);
  const presented = Number(object.presentedRadius);
  const collider = Number(object.colliderRadius);
  const radius = Number.isFinite(presented) && presented > 0
    ? presented
    : (Number.isFinite(collider) && collider > 0 ? collider : 0);
  const reach = radius;
  const onScreen = Number.isFinite(x) && Number.isFinite(z)
    && Math.abs(x) <= frame.halfH + reach
    && Math.abs(z) <= frame.halfV + reach;
  return {
    x,
    z,
    onScreen,
    w: reach * 2,
    h: reach * 2,
  };
}
