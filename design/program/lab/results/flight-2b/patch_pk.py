import sys, re
src_path, out_path, variant = sys.argv[1], sys.argv[2], sys.argv[3]  # variant: prod | lab
raw = open(src_path, newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'expected {count} match(es), got {n}: {old[:80]!r}')
    s = s.replace(old, new)

# 1. doc + defaults
rep(""" * the pilot twitches instead of the ship sliding on its old line. The rate falls from
 * `rateLowRadS` at rest to `rateCapRadS` at the governed cap and holds there above it. The force
 * is a pure rotation: speed is preserved to floating-point precision, which is what lets
 * "turn NOW when I twitch" and "keep earned speed" coexist.""",
""" * the pilot twitches instead of the ship sliding on its old line. The path turn rate is authored
 * as fractions of the hull's own max yaw (SF-2b #3, see the keys below) and follows speed from
 * rest through the combat cap to the boost cap. The force is a pure rotation: speed is preserved
 * to floating-point precision, which is what lets "turn NOW when I twitch" and "keep earned
 * speed" coexist.""")

rep(""" * the assist is full within `fadeStartRad` of the command and fades smoothly to zero at
 * `fadeEndRad`, which leaves the flip-and-burn reversal exactly as it was.
 */
export const VELOCITY_VECTORING_DEFAULTS = Object.freeze({
  rateLowRadS: 1.6,
  rateCapRadS: 0.9,
  fadeStartRad: Math.PI / 2,
  fadeEndRad: Math.PI,
});""",
""" * the assist is full within `fadeStartRad` of the command and fades smoothly to zero at
 * `fadeEndRad`, which leaves the flip-and-burn reversal exactly as it was.
 *
 * TURN FEEL DIALS (SF-2b #3). W+turn path rate as a fraction of the hull's max yaw
 * (profile.maxYawRate after the feel envelope), so every hull scales with its own yaw identity:
 *   restYawFrac   at low speed (lerps to cruise by speed / combat cap)
 *   cruiseYawFrac at the combat cap.  Kestrel: 0.57 x 2.646 = 1.51 rad/s, radius ~130 wu at 195 wu/s
 *   boostYawFrac  at the boost cap, held for as long as boost is held.
 *                 Kestrel: 0.375 x 2.646 = 0.99 rad/s, radius ~305 wu at 302 wu/s
 * Between the anchors the rate follows speed, so pressing or releasing boost mid-turn never steps
 * the arc. Above the boost cap (a sling, a travel burn) the lateral acceleration is held at its
 * boost-cap value, so the radius widens with speed instead of pulling unbounded g. A drive below
 * its nominal authority (a spooling torch, a scaled forward channel) vectors proportionally less.
 * Coast (no main drive) is untouched: the throttle gate below is upstream of all of this.
 * FLOOR (legacyFloor, default true): no hull turns slower than it did before #3. The rate is never
 * below the pre-#3 schedule (1.6 -> 0.9 rad/s by speed / governed cap, bounded by the drive's forward
 * authority). Only slow-yaw hulls hit it (the torch hulls Hawser / Colossus / Leviathan, max yaw
 * 0.48-0.76, were already turning the path at ~their full max yaw); set legacyFloor false to apply
 * the fractions strictly to every hull.
 * A packet may still pass absolute `rateLowRadS` / `rateCapRadS`: that selects the pre-#3 schedule
 * (rate lerped by speed / governed cap, bounded by the drive's forward authority) for A/B variants.
 */
export const VELOCITY_VECTORING_DEFAULTS = Object.freeze({
  restYawFrac: 0.60,
  cruiseYawFrac: 0.57,
  boostYawFrac: 0.375,
  legacyFloor: true,
  rateLowRadS: null,
  rateCapRadS: null,
  fadeStartRad: Math.PI / 2,
  fadeEndRad: Math.PI,
});""")

# 2. lead-bound doc
rep(""" * the velocity vector by at most this much; as the lead is approached, yaw eases onto the rate the
 * drive is actually bending the path — see assistedTurnBound. The angle is the hull against the
 * trail, not the strafe-offset command the assist steers toward. A 16 deg park left the straight
 * nozzle jet kinked against the arc, and measuring the command let a strafe hide a ~45 deg crab
 * while telemetry read aligned. Twitch at zero slip stays full yaw, turning back toward the path
 * is never clamped, a zero turn is left alone, and the bound releases inside the flip band.""",
""" * the velocity vector by at most this much; as the lead is approached, yaw eases onto the rate the
 * drive is actually bending the path — see assistedTurnBound. Without Q/E the angle is the hull
 * against the trail (a 16 deg park left the straight nozzle jet kinked against the arc). With Q/E
 * held the bound measures the strafe-offset command against the trail instead (SF-2b #3): the
 * pilot asked for that crab, and measuring the bare hull read the requested 45 deg crab as excess
 * lead on the far side, so W+E+A had the excess-lead correction drive the nose the opposite way to
 * the A key at ~1.3 rad/s. Telemetry still reports the hull-vs-trail slip. Twitch at zero slip
 * stays full yaw, turning back toward the path is never clamped, a zero turn is left alone, and
 * the bound releases inside the flip band.""")

# 3. call sites pass nominal forward
rep("""  const vectoring = velocityVectoringAcceleration(body, input, profile, limits, governor, dt);""",
"""  const vectoring = velocityVectoringAcceleration(body, input, profile, limits, governor, dt,
    reactionLimitsUnscaled(profile, boostMult).forward);""")
rep("""  const vectoring = velocityVectoringAcceleration(body, input, effective, limits, governor, dt);""",
"""  const vectoring = velocityVectoringAcceleration(body, input, effective, limits, governor, dt,
    reactionLimitsUnscaled(profile, effective.boostAccelMult).forward);""")

# 4. vectoring function
rep(""" * current velocity by `deltaRad` over `dt`: a pure rotation, so speed is untouched and the physics
 * owner's thrust-only cap never has to trim it. |R(δ)v − v| / dt = 2·v·sin(δ/2) / dt is bounded by
 * the drive's forward authority (`limits.forward`), so a weak or cold drive vectors as little as
 * it pushes and hull identity survives the assist.
 */
function velocityVectoringAcceleration(body, input, profile, limits, governor, dt) {""",
""" * current velocity by `deltaRad` over `dt`: a pure rotation, so speed is untouched and the physics
 * owner's thrust-only cap never has to trim it. The rate is the hull's max yaw times the speed-
 * scheduled fraction (VELOCITY_VECTORING_DEFAULTS), scaled by how much of its nominal forward
 * authority the drive has this tick (`limits.forward / nominalForward`), so hull identity comes
 * from the hull's yaw and a cold or degraded drive still vectors as little as it pushes. The
 * legacy absolute-rate variant keeps the old bound, |R(δ)v − v| / dt <= limits.forward.
 */
function velocityVectoringAcceleration(body, input, profile, limits, governor, dt, nominalForward = 0) {""")

rep("""  const rate = lerp(tuning.rateLowRadS, tuning.rateCapRadS, clamp(speed / cap, 0, 1)) * alignScale;
  if (!(rate > 0)) return vectoringIdle('faded');
  const requested = Math.min(absError, rate * dt);
  const authority = positive(limits && limits.forward, 0);
  const maxDelta = 2 * Math.asin(clamp(authority * dt / (2 * speed), 0, 1));
  const delta = Math.min(requested, maxDelta);""",
"""  const legacy = tuning.rateLowRadS != null || tuning.rateCapRadS != null;
  const rate = (legacy
    ? lerp(nonNegative(tuning.rateLowRadS, 0), nonNegative(tuning.rateCapRadS, 0), clamp(speed / cap, 0, 1))
    : vectoringYawFracRate(speed, profile, tuning, limits, nominalForward, cap, dt)) * alignScale;
  if (!(rate > 0)) return vectoringIdle('faded');
  const requested = Math.min(absError, rate * dt);
  const authority = positive(limits && limits.forward, 0);
  const maxDelta = legacy ? 2 * Math.asin(clamp(authority * dt / (2 * speed), 0, 1)) : requested;
  const delta = Math.min(requested, maxDelta);""")

rep("""function vectoringIdle(reason) {""",
"""/**
 * SF-2b (#3) path turn rate, rad/s: hull max yaw x the speed-scheduled fraction (rest -> cruise at
 * the combat cap -> boost at the boost cap), constant lateral acceleration above the boost cap,
 * scaled by the drive's share of its nominal forward authority.
 */
function vectoringYawFracRate(speed, profile, tuning, limits, nominalForward, cap, dt) {
  const maxYaw = positive(profile.maxYawRate, 2.5);
  const combat = positive(profile.combatSpeed, 0);
  const boostCap = combat * Math.max(1, positive(profile.boostSpeedMult, 1.55));
  const rest = nonNegative(tuning.restYawFrac, VELOCITY_VECTORING_DEFAULTS.restYawFrac);
  const cruise = nonNegative(tuning.cruiseYawFrac, VELOCITY_VECTORING_DEFAULTS.cruiseYawFrac);
  const boost = nonNegative(tuning.boostYawFrac, VELOCITY_VECTORING_DEFAULTS.boostYawFrac);
  let frac;
  if (speed <= combat) frac = lerp(rest, cruise, clamp(speed / combat, 0, 1));
  else if (speed <= boostCap) frac = lerp(cruise, boost, clamp((speed - combat) / (boostCap - combat), 0, 1));
  else frac = boost * boostCap / speed;
  const drive = nominalForward > 0 ? clamp(positive(limits && limits.forward, 0) / nominalForward, 0, 1) : 1;
  const rate = maxYaw * frac * drive;
  if (tuning.legacyFloor === false) return rate;
  // The pre-#3 rate this hull had, so the fractions only ever raise a turn (see legacyFloor).
  const authority = positive(limits && limits.forward, 0);
  const legacy = Math.min(
    lerp(LEGACY_VECTORING_RATE_LOW_RAD_S, LEGACY_VECTORING_RATE_CAP_RAD_S, clamp(speed / cap, 0, 1)),
    2 * Math.asin(clamp(authority * dt / (2 * speed), 0, 1)) / dt);
  return Math.max(rate, legacy);
}

function vectoringIdle(reason) {""")

# 5. turn bound: command slip
rep("""  const pathHeading = Math.atan2(body.vel.z, body.vel.x);
  const slip = wrapAngle(body.rot - pathHeading);
  if (Math.abs(slip) >= Math.PI / 2) return null;""",
"""  const pathHeading = Math.atan2(body.vel.z, body.vel.x);
  const slip = wrapAngle(body.rot - pathHeading);
  // SF-2b (#3): with the vectoring assist on, the bound measures the command the assist steers
  // toward (nose + the Q/E strafe offset) against the trail. Without Q/E that is the hull itself.
  const boundSlip = tuning && COMMAND_SLIP_BOUND && input.strafe
    ? wrapAngle(body.rot + Math.atan2(input.strafe, input.throttle) - pathHeading)
    : slip;
  if (Math.abs(boundSlip) >= Math.PI / 2) return null;""")
rep("""  return { slip, pathFollowRate, leadRad: tuning ? VECTORING_SLIP_LEAD_RAD : Math.PI / 2 };""",
"""  return { slip, boundSlip, pathFollowRate, leadRad: tuning ? VECTORING_SLIP_LEAD_RAD : Math.PI / 2 };""")

# 6. normalize
rep("""  o.rateLowRadS = nonNegative(raw.rateLowRadS, d.rateLowRadS);
  o.rateCapRadS = nonNegative(raw.rateCapRadS, d.rateCapRadS);""",
"""  o.restYawFrac = nonNegative(raw.restYawFrac, d.restYawFrac);
  o.cruiseYawFrac = nonNegative(raw.cruiseYawFrac, d.cruiseYawFrac);
  o.boostYawFrac = nonNegative(raw.boostYawFrac, d.boostYawFrac);
  o.legacyFloor = raw.legacyFloor === undefined ? d.legacyFloor : raw.legacyFloor !== false;
  o.rateLowRadS = nonNegative(raw.rateLowRadS, d.rateLowRadS);
  o.rateCapRadS = nonNegative(raw.rateCapRadS, d.rateCapRadS);""")
rep("""const _packetVelocityVectoring = { rateLowRadS: 0, rateCapRadS: 0, fadeStartRad: 0, fadeEndRad: 0 };""",
"""const _packetVelocityVectoring = {
  restYawFrac: 0, cruiseYawFrac: 0, boostYawFrac: 0, legacyFloor: true, rateLowRadS: null, rateCapRadS: null, fadeStartRad: 0, fadeEndRad: 0,
};""")

# 7. computeYawControl uses boundSlip
rep("""  if (turnBound && targetYawRate !== 0 && Math.sign(targetYawRate) === Math.sign(turnBound.slip)) {
    const absSlip = Math.abs(turnBound.slip);""",
"""  const boundSlip = turnBound ? (turnBound.boundSlip != null ? turnBound.boundSlip : turnBound.slip) : 0;
  if (turnBound && targetYawRate !== 0 && Math.sign(targetYawRate) === Math.sign(boundSlip)) {
    const absSlip = Math.abs(boundSlip);""")
rep("""      bound = turnBound.slip > 0
        ? Math.min(targetYawRate, turnBound.pathFollowRate - correction)""",
"""      bound = boundSlip > 0
        ? Math.min(targetYawRate, turnBound.pathFollowRate - correction)""")
rep("""      bound = turnBound.slip > 0 ? Math.min(targetYawRate, eased) : Math.max(targetYawRate, eased);""",
"""      bound = boundSlip > 0 ? Math.min(targetYawRate, eased) : Math.max(targetYawRate, eased);""")

rep("""const VECTORING_EXCESS_SLIP_GAIN = 4;""",
"""const VECTORING_EXCESS_SLIP_GAIN = 4;
const COMMAND_SLIP_BOUND = true;
// Pre-#3 absolute vectoring schedule (rad/s at rest / at the governed cap); kept as the legacyFloor.
const LEGACY_VECTORING_RATE_LOW_RAD_S = 1.6;
const LEGACY_VECTORING_RATE_CAP_RAD_S = 0.9;""")

if variant == 'lab':
    # Lab seam: empty = master behaviour (legacy absolute schedule, hull-slip bound).
    rep("""export const VELOCITY_VECTORING_DEFAULTS = Object.freeze({
  restYawFrac: 0.60,
  cruiseYawFrac: 0.57,
  boostYawFrac: 0.375,
  legacyFloor: true,
  rateLowRadS: null,
  rateCapRadS: null,""",
"""export const VELOCITY_VECTORING_DEFAULTS = Object.freeze({
  restYawFrac: 0.60,
  cruiseYawFrac: 0.57,
  boostYawFrac: 0.375,
  legacyFloor: true,
  rateLowRadS: 1.6,
  rateCapRadS: 0.9,""")
    rep("""const COMMAND_SLIP_BOUND = true;""",
"""// TUNING LAB seam (SF-2b #3). Empty = master: legacy absolute rate schedule + hull-slip bound.
// { yawFrac: true, restYawFrac, cruiseYawFrac, boostYawFrac, commandSlip: true }
export const FLIGHT_TURN_LAB = {};
export function setFlightTurnLab(cfg) { for (const k of Object.keys(FLIGHT_TURN_LAB)) delete FLIGHT_TURN_LAB[k]; Object.assign(FLIGHT_TURN_LAB, cfg || {}); }
let COMMAND_SLIP_BOUND = false;
function labTurnTuning(t) {
  COMMAND_SLIP_BOUND = FLIGHT_TURN_LAB.commandSlip === true;
  if (!t || !FLIGHT_TURN_LAB.yawFrac) return t;
  return { ...t, rateLowRadS: null, rateCapRadS: null,
    restYawFrac: FLIGHT_TURN_LAB.restYawFrac ?? 0.60, cruiseYawFrac: FLIGHT_TURN_LAB.cruiseYawFrac ?? 0.57,
    boostYawFrac: FLIGHT_TURN_LAB.boostYawFrac ?? 0.375, legacyFloor: FLIGHT_TURN_LAB.legacyFloor ?? true };
}""")
    rep("""function velocityVectoringAcceleration(body, input, profile, limits, governor, dt, nominalForward = 0) {
  const tuning = input.velocityVectoring;""",
"""function velocityVectoringAcceleration(body, input, profile, limits, governor, dt, nominalForward = 0) {
  const tuning = labTurnTuning(input.velocityVectoring);""")

out = s.replace('\n', '\r\n') if crlf else s
open(out_path, 'w', newline='').write(out)
print('ok', variant)
