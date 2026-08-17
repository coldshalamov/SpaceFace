// Plan 30 — The Face: the game's signature secret.
//
// "One moon whose cratered far side, seen from a specific approach arc, is unmistakably a face. No
// UI tells you. Scanning it grants the codex entry 'It Was There First' and a decal."
//
// ANCHOR: the graph contains exactly two bodies authored as moons, both claim sites. The Lacuna
// Survey Moon is the L-class one, it is already drawn as a cratered rock, and it sits in a nebula
// sector — so the secret is attached to a body that already exists rather than to a sphere invented
// to carry it. Claiming the moon and finding the face are independent; that the two can both be
// true is the point of the entry's name.
//
// THE ARC IS REAL GEOMETRY, NOT A FLAG. The face resolves only from a bearing wedge on the moon's
// far side, at a range where the whole limb is in frame. Approach from anywhere else and the scan
// returns an ordinary survey. Nothing in the HUD points at the wedge.
//
// Purity contract: frozen constants + pure solvers. World owns the durable record.

export const THE_FACE_SCHEMA_VERSION = 1;

export const THE_FACE = Object.freeze({
  schemaVersion: THE_FACE_SCHEMA_VERSION,
  recordId: 'the-face:lacuna:v1',
  sectorId: 'sector_veil_nebula',
  poiId: 'poi_claim_lacuna',
  signalId: 'signal:poi:poi_claim_lacuna',
  bodyName: 'Lacuna Survey Moon',
  codexTitle: 'It Was There First',
  rumorId: 'frontier-rumor:station_veil:lacuna-far-side',
  rumorText: 'Survey crews out of the Veil will not take the Lacuna approach from galactic south-west. They give different reasons. None of them is the reason.',

  // Bearing FROM the moon TO the ship, degrees, atan2(z, x) measured in the usual world frame.
  // 214° is the far side relative to the sector's worked lanes: nobody flies it on purpose.
  approachBearingDeg: 214,
  approachHalfWidthDeg: 15,

  // Range band. Too close and the limb overruns the frame; too far and the craters stop resolving.
  minRangeWu: 70,
  maxRangeWu: 320,

  markingId: 'it_was_there_first',
});

function normalizeDegrees(deg) {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Signed shortest angular distance between two bearings, in degrees. */
export function bearingDeltaDeg(a, b) {
  const delta = normalizeDegrees(a) - normalizeDegrees(b);
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

/**
 * The whole discovery test, as one pure function of two positions. Returns null only when a
 * position is unusable — never a silent "yes".
 */
export function faceApproachSolution(shipPos, bodyPos) {
  // Guard the objects before coercing: `Number(null)` is 0, so a missing position would otherwise
  // read as the origin and silently produce a real-looking bearing.
  if (!shipPos || typeof shipPos !== 'object' || !bodyPos || typeof bodyPos !== 'object') return null;
  const sx = Number(shipPos.x);
  const sz = Number(shipPos.z);
  const bx = Number(bodyPos.x);
  const bz = Number(bodyPos.z);
  if (![sx, sz, bx, bz].every(Number.isFinite)) return null;
  const dx = sx - bx;
  const dz = sz - bz;
  const distanceWu = Math.hypot(dx, dz);
  const bearingDeg = normalizeDegrees(Math.atan2(dz, dx) * 180 / Math.PI);
  const offAxisDeg = Math.abs(bearingDeltaDeg(bearingDeg, THE_FACE.approachBearingDeg));
  const withinArc = offAxisDeg <= THE_FACE.approachHalfWidthDeg;
  const withinRange = distanceWu >= THE_FACE.minRangeWu && distanceWu <= THE_FACE.maxRangeWu;
  return {
    bearingDeg,
    offAxisDeg,
    distanceWu,
    withinArc,
    withinRange,
    resolved: withinArc && withinRange,
  };
}

export function freshTheFaceState() {
  return { schemaVersion: THE_FACE_SCHEMA_VERSION, phase: 'unseen', seenAt: null, bearingDeg: null };
}

export function normalizeTheFaceState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshTheFaceState();
  if (source.phase !== 'seen') return out;
  const seenAt = Number(source.seenAt);
  const bearingDeg = Number(source.bearingDeg);
  // A `seen` claim must carry the bearing it was earned from, and that bearing must still fall
  // inside the authored arc. A save cannot assert the find without the geometry that produced it.
  if (!Number.isFinite(seenAt) || seenAt < 0 || !Number.isFinite(bearingDeg)) return out;
  const offAxisDeg = Math.abs(bearingDeltaDeg(bearingDeg, THE_FACE.approachBearingDeg));
  if (offAxisDeg > THE_FACE.approachHalfWidthDeg) return out;
  out.phase = 'seen';
  out.seenAt = seenAt;
  out.bearingDeg = normalizeDegrees(bearingDeg);
  return out;
}

export function theFaceSeen(state) {
  const own = state && state.world && state.world.theFace;
  return normalizeTheFaceState(own).phase === 'seen';
}

/** Scanner copy. Deliberately says nothing about a face until the arc has already delivered it. */
export function theFaceSignalCopy(seen) {
  return seen
    ? {
      classification: 'LACUNA FAR SIDE',
      detail: 'The crater field resolves into a face from this bearing and from no other. It predates every survey on file.',
    }
    : {
      classification: 'SURVEY MOON',
      detail: 'An unworked L-class body under an old survey charter. The far-side crater field is unmapped.',
    };
}
