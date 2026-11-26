import { normalizeField, sampleFieldAcceleration, couplingScale, fieldFalloff } from '../../core/fields/fieldKernel.js';
import { STORM_LIMITS } from './catalog.js';
import { sampleStormAtPoint } from './controller.js';

const TYPES = new Set(['ship', 'drone', 'asteroid', 'wreck', 'payload', 'cargo_pod', 'debris', 'pod', 'pickup']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const positive = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
const vector = () => ({ x: 0, y: 0, z: 0 });

function massOf(body) {
  return positive(body?.physicsBody?.mass, positive(body?.mass, body?.type === 'ship' ? 16 : 4));
}

function idCompare(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

/** The live adapter may pass the core's bodyProfile after its canonical physical query. The
 * standalone sampler fails closed for opt-outs/kinematic/fixed/protected matter and never
 * normalizes physicsBody on a live entity (that is the physics owner's responsibility). */
export function stormBodyEligibility(body, { state, bodyProfile, excludeIds } = {}) {
  if (!body || body.id == null || !TYPES.has(body.type)) return { eligible: false, reason: 'body_type' };
  if (body.alive === false || body.destroyed === true) return { eligible: false, reason: 'dead' };
  if (!Number.isFinite(body.pos?.x) || !Number.isFinite(body.pos?.z)
    || (body.vel && (!Number.isFinite(body.vel.x) || !Number.isFinite(body.vel.z)))) return { eligible: false, reason: 'nonfinite_body' };
  if (body.physicsBody === false || body.physicsBody?.dynamic === false || body.physicsBody?.kinematic === true
    || bodyProfile?.dynamic === false || bodyProfile?.kinematic === true
    || body.data?.isLandmark || body.data?.isLandmarkRock || body.data?.landmark
    || body.data?.archetype === 'landmark' || body.data?.isGate
    || positive(body.physicsBody?.radius, positive(body.radius, 1)) > 90) return { eligible: false, reason: 'fixed_body' };
  if (body.flags?.docked || body.docked === true || (body.id === state?.playerId && state?.ui?.docked)) return { eligible: false, reason: 'docked' };
  if (body.data?.stormProtected === true || excludeIds?.has?.(body.id)) return { eligible: false, reason: 'protected' };
  const authoredMass = body.physicsBody?.mass ?? body.mass;
  if (authoredMass != null && (!Number.isFinite(authoredMass) || authoredMass <= 0 || authoredMass > 1e12)) return { eligible: false, reason: 'invalid_mass' };
  return { eligible: true, reason: null };
}

/** A heavy body shelters only its downstream wake. It need not belong to this encounter: an
 * existing wreck, pulled cargo stack, or pinned anchor can make the same physical lee. No
 * faction, ownership, or renderer state participates. Candidate work is explicitly bounded. */
export function sampleStormShelter(position, mediumVelocity, covers = [], { bodyId = null } = {}) {
  const speed = Math.hypot(finite(mediumVelocity?.x), finite(mediumVelocity?.z));
  if (!(speed > 1e-6) || !Number.isFinite(position?.x) || !Number.isFinite(position?.z) || !Array.isArray(covers)) {
    return { shelter: 0, coverId: null };
  }
  const ux = mediumVelocity.x / speed, uz = mediumVelocity.z / speed;
  const sorted = covers.slice(0, STORM_LIMITS.maxBodies).filter(cover => cover && cover.id !== bodyId
    && cover.alive !== false && cover.physicsBody !== false && Number.isFinite(cover.pos?.x)
    && Number.isFinite(cover.pos?.z) && massOf(cover) >= STORM_LIMITS.heavyCoverMass
    && positive(cover.physicsBody?.radius, positive(cover.radius, 0)) >= 10).sort(idCompare);
  let shelter = 0, coverId = null;
  for (let index = 0; index < Math.min(sorted.length, STORM_LIMITS.maxCovers); index++) {
    const cover = sorted[index];
    const radius = clamp(positive(cover.physicsBody?.radius, positive(cover.radius, 10)), 10, 90);
    const dx = position.x - cover.pos.x, dz = position.z - cover.pos.z;
    const along = dx * ux + dz * uz;
    if (along <= 0 || along >= STORM_LIMITS.shelterLength + radius) continue;
    const lateral = Math.abs(dx * uz - dz * ux);
    const reach = STORM_LIMITS.shelterLength + radius;
    const wakeWidth = radius * 1.12 + along * 0.12;
    const lateralGate = 1 - smooth((lateral - wakeWidth * 0.6) / (wakeWidth * 0.4));
    const nearGate = smooth(along / Math.max(8, radius * 0.4));
    const farGate = 1 - smooth((along - radius) / (reach - radius));
    const strength = 0.88 * lateralGate * nearGate * farGate;
    if (strength > shelter) { shelter = strength; coverId = cover.id; }
  }
  return { shelter, coverId };
}

function emptyIntent(body, eligibility, dt) {
  return { bodyId: body?.id ?? null, eligible: eligibility.eligible, reason: eligibility.reason,
    dt, exposure: 0, shelter: 0, coverId: null, pinned: false, physicsMassScale: 1,
    mass: 0, effectiveMass: 0, couplingMass: 0, frontIds: [], mediumVelocity: { x: 0, z: 0 }, relativeSpeed: 0,
    acceleration: vector(), force: vector(), impulse: vector(), caps: { acceleration: false, force: false, impulse: false } };
}

/**
 * Compose a current from the EXISTING field kernel's moving-frame viscosity and WELL pressure.
 * Equal baseline well/repulsor terms cancel; their viscosity adds. A bounded inward v²/r well
 * lets a co-moving body follow the curved current. The only new laws are authored storm
 * geometry, cover occlusion, and finite local budgets. This function never integrates
 * position, rewrites velocity, submits physics commands, damages hull, or cancels player input.
 *
 * Return impulse is authored against BASE mass. The physics owner's existing Pin massScale
 * therefore reduces realized acceleration instead of our sampler undoing Pin's resistance.
 * The adapter submits it once through deliverPhysicalImpulseDetailed({scaleEnvironment:false,
 * continuous:true,dt}). That authority adds player protection and owns actual delivery.
 */
export function sampleStormBodyIntent(frame, body, { dt = 1 / 60, state, covers = [], bodyProfile,
  excludeIds } = {}) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, STORM_LIMITS.maxDt) : 0;
  const eligibility = stormBodyEligibility(body, { state, bodyProfile, excludeIds });
  const out = emptyIntent(body, eligibility, step);
  if (!eligibility.eligible || step <= 0 || !frame) return out;
  const point = sampleStormAtPoint(frame, body.pos);
  out.exposure = point.exposure;
  out.frontIds = point.frontIds;
  out.mediumVelocity = point.mediumVelocity;
  const mass = massOf(body);
  // The canonical field profile includes a mechanically hitched load in coupling mass.
  // That does not change the BASE mass the physics owner's impulse command is authored at.
  const couplingMass = positive(bodyProfile?.mass, mass);
  const runtime = state?.combat?.entities?.[String(body.id)];
  const physicsMassScale = clamp(positive(bodyProfile?.physicsMassScale,
    positive(runtime?.physicsResponse?.massScale, positive(body.physicsResponse?.massScale, 1))), 0.25, 8);
  out.mass = mass; out.effectiveMass = mass * physicsMassScale; out.couplingMass = couplingMass;
  out.physicsMassScale = physicsMassScale; out.pinned = physicsMassScale > 1.001;
  if (!(point.exposure > 0)) return out;
  const shelter = sampleStormShelter(body.pos, point.mediumVelocity, covers, { bodyId: body.id });
  out.shelter = shelter.shelter; out.coverId = shelter.coverId;
  const velocity = { x: finite(body.vel?.x), z: finite(body.vel?.z) };
  const relX = point.mediumVelocity.x - velocity.x, relZ = point.mediumVelocity.z - velocity.z;
  const relativeSpeed = Math.hypot(relX, relZ);
  out.relativeSpeed = relativeSpeed;
  if (!(relativeSpeed > 1e-9) && !(point.curvatureAcceleration > 0)) return out;
  // A bounded relative-velocity read makes a corrupt or extreme ballistic body a capped force
  // request, never Infinity. It does not change the body's stored velocity or earned momentum.
  const relativeScale = relativeSpeed > 0 ? Math.min(1, STORM_LIMITS.maxRelativeSpeed / relativeSpeed) : 1;
  const sampledVelocity = { x: point.mediumVelocity.x - relX * relativeScale,
    z: point.mediumVelocity.z - relZ * relativeScale };
  const authoredResponse = Math.max(0, finite(body.physicsBody?.fieldResponseMult, 1));
  const statusResponse = Math.max(0, finite(runtime?.multipliers?.fieldCoupling, 1));
  const baseResponse = Math.max(0, finite(bodyProfile?.fieldResponseMult, authoredResponse * statusResponse));
  // Canonical profiles carry explicit immunities (including the player Saucer). Preserve
  // zero before the kernel's generic boost coupling floor could turn it into a small force.
  if (baseResponse === 0) { out.reason = 'field_immune'; return out; }
  // Weather drag depends on exposed area / mass as well as the kernel's existing coupling.
  // Pin massScale remains distinct from this permanent mass-class response.
  const massResponse = clamp(24 / Math.max(24, couplingMass), 0.12, 1);
  const profile = { id: body.id, type: body.type, mass: couplingMass, radius: positive(body.radius, 1),
    dynamic: true, kinematic: false, anchored: false,
    fieldResponseMult: baseResponse * massResponse, boosting: !!body.flags?.boosting };
  const couple = couplingScale(profile);
  const drag = Math.min(Math.max(0, finite(frame.drag, 1)) * point.exposure * (1 - shelter.shelter),
    couple > 0 ? physicsMassScale / (step * couple) : 0);
  const spec = { center: { x: frame.eye.x, z: frame.eye.z }, radius: frame.outerRadius * 2,
    innerRadius: frame.eye.radius, innerSoft: 18, strength: 1, damping: drag / 2,
    falloff: 1, frame: point.mediumVelocity, createdAt: frame.simTime, durationS: Infinity,
    filters: { types: [body.type] } };
  const fields = [normalizeField({ ...spec, id: `${frame.planId}:flow:in`, kind: 'well' }),
    normalizeField({ ...spec, id: `${frame.planId}:flow:out`, kind: 'repulsor' })];
  const falloff = fieldFalloff(fields[0], point.distance);
  if (falloff > 0) fields[0].strength += point.curvatureAcceleration * (1 - shelter.shelter) / Math.max(1e-6, falloff);
  const acceleration = sampleFieldAcceleration(body.pos, sampledVelocity, fields, frame.simTime, profile);
  let ax = acceleration.ax / physicsMassScale, az = acceleration.az / physicsMassScale;
  let magnitude = Math.hypot(ax, az);
  // Drag is separately bounded against one-step overshoot above. The pressure term is real
  // inward acceleration even at zero relative speed, so it shares the physical total cap.
  const accelCap = STORM_LIMITS.maxAcceleration;
  if (magnitude > accelCap) {
    out.caps.acceleration = true;
    ax *= accelCap / magnitude; az *= accelCap / magnitude; magnitude = accelCap;
  }
  let fx = ax * out.effectiveMass, fz = az * out.effectiveMass;
  const forceMagnitude = Math.hypot(fx, fz);
  if (forceMagnitude > STORM_LIMITS.maxForce) {
    out.caps.force = true;
    fx *= STORM_LIMITS.maxForce / forceMagnitude; fz *= STORM_LIMITS.maxForce / forceMagnitude;
  }
  let ix = fx * step, iz = fz * step;
  const impulseMagnitude = Math.hypot(ix, iz);
  if (impulseMagnitude > STORM_LIMITS.maxImpulse) {
    out.caps.impulse = true;
    ix *= STORM_LIMITS.maxImpulse / impulseMagnitude; iz *= STORM_LIMITS.maxImpulse / impulseMagnitude;
    fx = ix / step; fz = iz / step;
  }
  out.impulse = { x: ix, y: 0, z: iz };
  out.force = { x: fx, y: 0, z: fz };
  out.acceleration = { x: fx / out.effectiveMass, y: 0, z: fz / out.effectiveMass };
  return out;
}

/** Deterministic bounded batch for tests and adapters whose spatial owner already found bodies. */
export function sampleStormBodyIntents(frame, bodies, options = {}) {
  if (!Array.isArray(bodies)) return [];
  return bodies.slice(0, STORM_LIMITS.maxBodies * 2).filter(Boolean).sort(idCompare)
    .slice(0, STORM_LIMITS.maxBodies).map(body => sampleStormBodyIntent(frame, body, options));
}
