import { lineClassForIndex } from '../data/lineProgression.js';
const WIDTH_FIELDS = Object.freeze(['coreHalfWidth', 'sheathHalfWidth', 'collarCrownHalfWidth', 'collarLipHalfWidth']);

/** Presentation reads the saved class and live winch, never derives a new progression value. */
export function readLineVisualProfile(state, out = {}) {
  const bag = state?.lineProgression;
  const arcade = state?.run?.kind === 'survival' && state.run.phase !== 'inactive';
  const permanent = !arcade && !state?.survival?.active && !state?.gauntlet?.active && !state?.racing?.active;
  const cls = lineClassForIndex(permanent ? bag?.classIndex : 1);
  const active = !!state?.player?.tether?.active;
  out.classIndex = cls.index;
  out.label = cls.label;
  out.hardware = cls.hardware;
  out.headScale = .25 + (cls.index - 1) * .055;
  out.padScale = .16 + (cls.index - 1) * .012;
  out.padCount = cls.hardware.anchorPads;
  out.width = cls.hardware.cableWidth;
  out.color = cls.hardware.cableColor;
  out.heat = permanent ? Math.max(0, Math.min(1, Number(bag?.winchHeat) || 0)) : 0;
  out.overClass = permanent && active && bag?.overClass === true;
  out.ceilingT = cls.fullControlMassT;
  out.active = active;
  return out;
}

/** Apply after the existing shape owner has chosen the cable's cross section. */
export function applyLineClassCableProfile(profile, line) {
  if (!profile || !line) return profile;
  for (const field of WIDTH_FIELDS) {
    if (Number.isFinite(profile[field])) profile[field] *= line.width;
  }
  // Give sustained heat a coloured skirt beyond the white filament at gameplay scale.
  // This is presentation coverage only; the physical line and class width stay unchanged.
  if (Number.isFinite(profile.sheathHalfWidth)) profile.sheathHalfWidth *= 1 + line.heat * 2;
  return profile;
}
