// Target acquisition without thrash (packet 02, design/combat-convergence/02_COMBAT_READABILITY_AND_TARGETING.md).
//
// PURE and TOTAL: no state, no clock, no rng — a caller supplies the candidates, the player's
// intent and the sim time, and keeps one small tracker per player. Nothing here writes
// `state.player.targetId` (UI/input-owned); it only answers "which contact should an AUTOMATIC
// lock sit on right now?" so two crossing ships do not hand the lock back and forth every refresh.
//
// What it guarantees:
//   * INTENT, NOT PROXIMITY. With a live cursor the contact is chosen by how close the cursor is to
//     the hull's edge (the player's explicit intent), with range as a weak tie-break. With no cursor
//     (pad, keyboard) it is the contact nearest the aim RAY. It is never simply "nearest hostile".
//   * NEVER BEHIND THE PLAYER. A contact more than `rearHalfAngleRad` off the intent direction is
//     not acquired automatically — unless the cursor is actually on it. Tab / click remain the
//     deliberate way to take any contact. (A contact already held that drifts behind stays held.)
//   * HYSTERESIS + DWELL. A held contact is only replaced when a challenger is inside the ENTRY
//     radius of the cursor and beats it by `marginWu` of cost for `dwellS` of continuous sim time
//     (or the cursor has left the incumbent's EXIT radius). A challenger that changes restarts the
//     dwell, so a crossing pair never alternates.
//   * STABLE TIES. Equal costs break by id, never by iteration order.
//   * IDENTITY. Candidates carry the occupant token; a recycled id is not the incumbent.
//
// Every number is a PROTOTYPE starting hypothesis, measured at the default camera and scaled by
// camera zoom (more world per pixel when zoomed out) — not a universal constant. Tune through the
// session-shape review, never by editing a golden.

export const ACQUISITION_PROTOTYPE = Object.freeze({
  enterWu: 36,            // cursor-to-hull-edge distance that makes a contact a NEW candidate
  exitWu: 60,             // an incumbent stays "held by the cursor" out to here
  marginWu: 16,           // a challenger must beat the incumbent's cost by this much
  dwellS: 0.24,           // ...continuously for this long (sim clock; pause freezes it)
  rangeWeight: 0.25,      // cost = cursor-edge distance + rangeWeight * range (existing SF-2b #8 weighting)
  rearHalfAngleRad: (100 * Math.PI) / 180,
  zoomRef: 144,           // gameState camera.zoom at which the wu values above were set
  zoomClamp: Object.freeze([0.5, 4]),
});

const FALLBACK_TIE = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function createAcquisitionTracker() {
  return { id: null, gen: 0, challengerId: null, challengerGen: 0, since: 0 };
}

export function resetAcquisitionTracker(tracker) {
  if (!tracker) return tracker;
  tracker.id = null; tracker.gen = 0; tracker.challengerId = null; tracker.challengerGen = 0; tracker.since = 0;
  return tracker;
}

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function sameOccupant(id, gen, c) {
  return !!c && c.id === id && (gen === 0 || !(c.gen > 0) || c.gen === gen);
}

function tieBreak(a, b) {
  return FALLBACK_TIE(String(a.id), String(b.id));
}

/**
 * Scale for the wu thresholds from the camera: zoom is the camera distance, so a larger zoom shows
 * more world per pixel and the same on-screen reach is more wu.
 */
export function acquisitionScale(zoom, proto = ACQUISITION_PROTOTYPE) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : proto.zoomRef;
  const [lo, hi] = proto.zoomClamp;
  return Math.min(hi, Math.max(lo, z / proto.zoomRef));
}

/**
 * The intent direction: player → cursor when the cursor is explicit and far enough from the hull to
 * mean something, else the aim angle, else the nose. Returns radians.
 */
export function intentAngle(intent) {
  if (intent.hasCursor) {
    const dx = intent.cx - intent.px;
    const dz = intent.cz - intent.pz;
    if (dx * dx + dz * dz > 20 * 20) return Math.atan2(dz, dx);
  }
  if (Number.isFinite(intent.aimAngle)) return intent.aimAngle;
  return finite(intent.heading, 0);
}

function score(c, intent, dirX, dirZ, enter, proto) {
  const dx = c.x - intent.px;
  const dz = c.z - intent.pz;
  const range = Math.hypot(dx, dz);
  // bearing of the contact relative to the intent direction
  const cos = range > 1e-6 ? (dx * dirX + dz * dirZ) / range : 1;
  const ahead = cos >= Math.cos(proto.rearHalfAngleRad);
  let cursorEdge;
  let lateral;
  if (intent.hasCursor) {
    cursorEdge = Math.max(0, Math.hypot(c.x - intent.cx, c.z - intent.cz) - finite(c.radius, 0));
    lateral = cursorEdge;
  } else {
    // aim ray: perpendicular distance to the ray through the player along the intent direction
    cursorEdge = Math.max(0, Math.abs(dx * dirZ - dz * dirX) - finite(c.radius, 0));
    lateral = cursorEdge;
  }
  const onCursor = intent.hasCursor && cursorEdge <= enter;
  const eligible = ahead || onCursor;
  return { c, range, cursorEdge, onCursor, eligible, ahead, cost: lateral + proto.rangeWeight * range };
}

/**
 * One acquisition step. `candidates` are already filtered for legality (hostile, observed,
 * scanner range, presentation) by the caller: [{id, gen, x, z, radius}]. `intent`:
 *   { px, pz, hasCursor, cx, cz, aimAngle?, heading? }
 * Returns { id, gen, switched, challengerId } and updates `tracker` in place.
 * `id` is null when no contact is acquirable (free aim).
 */
export function stepAcquisition(tracker, candidates, intent, now, opts = null) {
  const proto = opts && opts.proto ? opts.proto : ACQUISITION_PROTOTYPE;
  const scale = acquisitionScale(opts && opts.zoom, proto);
  const enter = proto.enterWu * scale;
  const exit = proto.exitWu * scale;
  const margin = proto.marginWu * scale;
  const angle = intentAngle(intent);
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  let best = null;       // best eligible contact overall (by cost, then id)
  let bestOnCursor = null; // best contact the cursor is actually on (entry radius)
  let incumbent = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const s = score(candidates[i], intent, dirX, dirZ, enter, proto);
    if (sameOccupant(tracker.id, tracker.gen, s.c)) incumbent = s;
    if (!s.eligible) continue;
    if (!best || s.cost < best.cost || (s.cost === best.cost && tieBreak(s.c, best.c) < 0)) best = s;
    if (intent.hasCursor ? s.onCursor : s.eligible) {
      if (!bestOnCursor || s.cost < bestOnCursor.cost
        || (s.cost === bestOnCursor.cost && tieBreak(s.c, bestOnCursor.c) < 0)) bestOnCursor = s;
    }
  }

  const result = { id: null, gen: 0, switched: false, challengerId: null };

  if (!incumbent) {
    // Nothing held (or the held contact is no longer a legal automatic lock): take the contact the
    // cursor is on; failing that the best forward contact — never one behind the player. A contact
    // that WAS legitimately acquired and has since drifted behind the player is still held: the
    // rear gate guards new acquisition, it does not rip a lock off an enemy on your tail.
    const pick = bestOnCursor || best;
    tracker.challengerId = null; tracker.challengerGen = 0; tracker.since = 0;
    if (!pick) { tracker.id = null; tracker.gen = 0; return result; }
    result.switched = tracker.id !== pick.c.id;
    tracker.id = pick.c.id; tracker.gen = finite(pick.c.gen, 0);
    result.id = tracker.id; result.gen = tracker.gen;
    return result;
  }

  // An incumbent exists and is still acquirable.
  const heldByCursor = !intent.hasCursor || incumbent.cursorEdge <= exit;
  let challenger = null;
  if (bestOnCursor && !sameOccupant(tracker.id, tracker.gen, bestOnCursor.c)) {
    if (!heldByCursor || bestOnCursor.cost + margin < incumbent.cost) challenger = bestOnCursor;
  }
  result.id = tracker.id; result.gen = tracker.gen;
  if (!challenger) {
    tracker.challengerId = null; tracker.challengerGen = 0; tracker.since = 0;
    return result;
  }
  result.challengerId = challenger.c.id;
  if (tracker.challengerId === challenger.c.id && (tracker.challengerGen === 0
    || tracker.challengerGen === finite(challenger.c.gen, 0))) {
    if (now - tracker.since >= proto.dwellS) {
      tracker.id = challenger.c.id; tracker.gen = finite(challenger.c.gen, 0);
      tracker.challengerId = null; tracker.challengerGen = 0; tracker.since = 0;
      result.id = tracker.id; result.gen = tracker.gen; result.switched = true;
    }
  } else {
    tracker.challengerId = challenger.c.id;
    tracker.challengerGen = finite(challenger.c.gen, 0);
    tracker.since = now;
  }
  return result;
}

/**
 * What an input at this contact would COMMIT TO, so the picture can tell a prop from an attack
 * target before the press. Pure on the facts the caller passes (hostile = the scanner's verdict).
 *   'attack' — a hostile ship/drone: selecting it addresses the guns.
 *   'prop'   — an interactable body (rock, wreck, cargo, station, work site): tools, not guns.
 *   'info'   — a friendly/neutral hull: selecting it only informs.
 */
export function classifyPickIntent(entity, hostile) {
  if (!entity) return 'info';
  const t = entity.type;
  if (t === 'ship' || t === 'drone') return hostile ? 'attack' : 'info';
  if (t === 'asteroid' || t === 'wreck' || t === 'derelict' || t === 'pickup' || t === 'payload'
    || t === 'station' || (entity.data && entity.data.worldSiteTargetable === true)) return 'prop';
  return 'info';
}
