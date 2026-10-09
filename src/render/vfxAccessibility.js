const FULL = Object.freeze({
  id: 'full',
  flashOpacityScale: 1,
  flashSizeScale: 1,
  flashMinLife: 0,
  eventLightPeakScale: 1,
});

const REDUCED_MOTION = Object.freeze({
  id: 'reduced-motion',
  flashOpacityScale: 0.58,
  flashSizeScale: 0.84,
  // FB-077 — reduced motion holds the cue longer (the grammar's 1.8× hold on the ~0.09 s flash
  // floor) and no event light is deleted outright: the light floor is 0.1 of authored peak.
  flashMinLife: 0.16,
  eventLightPeakScale: 0.1,
});

const REDUCED_FLASH = Object.freeze({
  id: 'reduced-flash',
  flashOpacityScale: 0.3,
  flashSizeScale: 0.68,
  flashMinLife: 0.1,
  eventLightPeakScale: 0.24,
});

const REDUCED_BOTH = Object.freeze({
  ...REDUCED_FLASH,
  id: 'reduced-motion-and-flash',
  // Reduced motion is the stricter read for light: the 0.1 floor, not the flash profile's 0.24
  // and never zero — a kill still carries its authored light, just held, not strobe-cut.
  eventLightPeakScale: 0.1,
});

/** Resolve shared immutable policy so hot VFX paths do not allocate per effect. */
export function resolveVfxAccessibilityProfile(settings) {
  const video = settings && settings.video || {};
  const accessibility = settings && settings.accessibility || {};
  const motion = !!video.motionReduce;
  const flash = !!(video.flashReduce || accessibility.flashReduce || accessibility.reducedFlash);
  if (motion && flash) return REDUCED_BOTH;
  if (motion) return REDUCED_MOTION;
  if (flash) return REDUCED_FLASH;
  return FULL;
}

/**
 * Convert a brief additive flash to a lower-amplitude, longer readable cue. `out` allows the pooled
 * runtime to reuse one scratch record; tests and tooling can omit it for a plain value result.
 */
export function applyFlashAccessibility(authored, profile, out = null) {
  if (!profile || profile === FULL) {
    if (!out) return authored;
    Object.assign(out, authored);
    return out;
  }
  const target = out || {};
  target.life = Math.max(authored.life, profile.flashMinLife);
  target.size0 = authored.size0 * profile.flashSizeScale;
  target.size1 = authored.size1 * profile.flashSizeScale;
  target.opacity0 = authored.opacity0 * profile.flashOpacityScale;
  target.opacity1 = authored.opacity1 * profile.flashOpacityScale;
  return target;
}
