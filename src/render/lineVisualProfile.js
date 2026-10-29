import { lineClassForIndex } from '../data/lineProgression.js';
const WIDTH_FIELDS = Object.freeze(['coreHalfWidth', 'sheathHalfWidth', 'collarCrownHalfWidth', 'collarLipHalfWidth']);

// Row 500 — the rim mark shows on the hull part. A fitted §7.1 head's tier mark
// tints the head hardware's rim emissive; the cable keeps the class colour.
const MARK_COLORS = Object.freeze({
  copper: 0xd98a4a,
  silver: 0xc8d4e0,
  gold: 0xe8b84a,
  pearl: 0xf4f0ff,
  paper: 0xe8e0c8,
});

/** Presentation reads the saved class and live winch, never derives a new progression value. */
export function readLineVisualProfile(state, out = {}) {
  const bag = state?.lineProgression;
  // Ephemeral scored runs (Crucible survival, Combat Lab, sandbox) hold a borrowed state
  // and never read the career ladder — the same kinds _campaignSaveSuppressed seals.
  const kind = state?.run?.kind;
  const arcade = (kind === 'survival' || kind === 'lab' || kind === 'sandbox') && state.run.phase !== 'inactive';
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
  // A fitted §7.1 behaviour head stamps `data.derived.lineHead` (systems/ships.js):
  // the head part shows its authored colour and the tier's rim mark — read-only
  // presentation of the sim stamp, never a derived value of our own.
  const holder = state?.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  const lineHead = holder && holder.data && holder.data.derived && holder.data.derived.lineHead;
  out.headId = lineHead && typeof lineHead.headId === 'string' ? lineHead.headId : null;
  out.headMark = lineHead && typeof lineHead.mark === 'string' ? lineHead.mark : null;
  out.headColor = lineHead && lineHead.cableColor != null ? lineHead.cableColor : null;
  out.markColor = out.headMark && MARK_COLORS[out.headMark] != null ? MARK_COLORS[out.headMark] : null;
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
