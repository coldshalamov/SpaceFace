// The mortal blow read — the decision layer for "the kill you can see" at the CONTACT.
//
// The death itself is already a deep picture: the sim's kill receipt opens the 0.4 s reactor
// overload flare, the phased explosion and the wreck aftermath follow. What was thin is the BLOW
// that ends the hull: `combat:damage` fires for the killing hit exactly like every other hit, so
// in a furball the lethal strike presented as one more vent among many and only half a second of
// flare told you something had died — never WHICH shot did it.
//
// The damage kernel already carries the truth (`before`/`after` vitals snapshots, fresh per
// emit): a strike with `before.hull > 0` and `after.hull <= 0` IS the killing blow. This module
// reads that and shapes the contact's own answer — a punch-through that continues along the
// round's travel and exits the far side, a short white core at the breach, and a `mortal`
// severity for the contact light (preset row `impactMortal`). It decides nothing about damage,
// allocates nothing per call when handed an `out`, and never touches sim state.
//
// Pure: no THREE, no pools, no clock, no RNG. The caller owns drawing and accessibility.

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Is this `combat:damage` receipt the strike that emptied the hull?
 *
 * Only an accepted hull hit qualifies (`hullHit`, amount applied). Legacy/compat receipts that
 * predate the vitals snapshots read exactly as before — the read fails closed to an ordinary hit.
 * DoTs and field ticks carry no measured contact; the caller's direction gate already refuses
 * them an aimed read, and their `before`/`after` still names them mortal — the caller decides
 * which layers survive without a measured axis.
 */
export function isMortalBlowContact(p) {
  if (!p || p.hullHit !== true) return false;
  const before = p.before;
  const after = p.after;
  if (!before || !after) return false;
  return finite(before.hull, -1) > 0 && finite(after.hull, -1) <= 0;
}

/**
 * The mortal-blow contact plan, in world-axis terms the caller can draw directly.
 *
 * `normalX/Z` is the contact normal the damage handler already resolved (faces the incoming
 * round), so the BLOW-THROUGH axis is its negation — the direction the round keeps travelling.
 * When no measured axis exists the plan degrades honestly: the white core and light still name
 * the strike, but no exit is invented (an all-zero axis aims at nothing).
 *
 * Plan fields (all written, so a reused `out` never carries a stale field):
 *   mortal          true only when the caller should draw the read at all
 *   measured        true when a real impact axis exists
 *   exitX/exitZ     unit axis of the blow-through (0,0 when unmeasured)
 *   exitRadius      how far out the far side the exit read sits (world units)
 *   flashSize       white-core footprint (world units)
 *   flashLife       white-core life (seconds; the overload flare opens at 0.4 s, inside this)
 *   pierceLife      blow-through streak life (seconds)
 *   lightSeverity   contact-light severity name (preset row `impact` + this)
 */
export function resolveMortalBlowPlan(input = {}, out = {}) {
  const radius = Math.max(1.5, finite(input.targetRadius, 6));
  const amount = Math.max(0, finite(input.amount, 0));
  const overkill = finite(input.overkill, 0);
  let nx = finite(input.normalX, NaN);
  let nz = finite(input.normalZ, NaN);
  let measured = Number.isFinite(nx) && Number.isFinite(nz) && Math.hypot(nx, nz) > 1e-6;
  if (!measured) {
    const ax = finite(input.approachX, NaN);
    const az = finite(input.approachZ, NaN);
    measured = Number.isFinite(ax) && Number.isFinite(az) && Math.hypot(ax, az) > 1e-6;
    if (measured) {
      const len = Math.hypot(ax, az);
      nx = ax / len;
      nz = az / len;
    }
  }
  // A bigger hit that carries more overkill punches a wider, slightly longer-lived read — the
  // overkill hammer and the finishing chip should not read identically. Bounded, never a hazard.
  const force = clamp01((amount + Math.max(0, overkill)) / 120);

  out.mortal = true;
  out.measured = measured;
  if (measured) {
    const len = Math.hypot(nx, nz) || 1;
    out.exitX = -nx / len;
    out.exitZ = -nz / len;
  } else {
    out.exitX = 0;
    out.exitZ = 0;
  }
  out.exitRadius = radius * (0.92 + force * 0.5);
  out.flashSize = radius * (0.85 + force * 0.5);
  // Inside the 0.4 s overload window: the white core burns out just as the interior flare opens,
  // so the two reads hand off instead of stacking into one long white blob.
  out.flashLife = 0.34 + force * 0.10;
  out.pierceLife = 0.30 + force * 0.12;
  out.lightSeverity = 'mortal';
  return out;
}
