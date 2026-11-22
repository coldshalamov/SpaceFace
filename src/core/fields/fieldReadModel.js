import { isPlayerSaucer } from '../../data/saucer.js';
import { FIELD_DEFS, fieldVolumeOf } from '../../data/fields.js';
import { wellUsesVelocityTerm } from './fieldKernel.js';
import { isAnchoredPhysicalBody, isPhysicalMissionBody } from '../physicalResponse.js';
import { isDynamicPhysicsBodyEntity } from '../physicsAuthority.js';
import { indexedTypeScan } from '../../world/livingWorldViews.js';
import { isHostileToPlayer } from '../../systems/scannerReadModel.js';
import { maxFittedModuleMod } from '../fittedModules.js';
import { pilotPowerReachScale } from '../../systems/powerVerbs.js';
import { pilotHas } from '../../data/pilotTree.js';

export const FIELD_EMITTER_TYPE = 'fieldEmitter';
// The well's velocity-dependent convergence applies to craft; loose bodies and
// projectiles retain their authored positional pull.
export const FIELD_VELOCITY_TERM_TYPES = Object.freeze(new Set(['ship', 'drone']));
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }

export const FIELD_WINDUP_S = 0.4;
export const FIELD_DISSIPATE_S = 0.6;
export const FIELD_PHASE_WINDING = 'winding';
export const FIELD_PHASE_ACTIVE = 'active';
export const FIELD_PHASE_DISSIPATING = 'dissipating';

export function fieldLifecyclePhase(createdAt, expireAt, now) {
  if (!Number.isFinite(createdAt) || !Number.isFinite(expireAt)) {
    return { phase: FIELD_PHASE_ACTIVE, mult: 1 };
  }
  const age = now - createdAt;
  if (age < FIELD_WINDUP_S) {
    return { phase: FIELD_PHASE_WINDING, mult: Math.max(0, Math.min(1, age / FIELD_WINDUP_S)) };
  }
  const remaining = expireAt - now;
  if (remaining < FIELD_DISSIPATE_S) {
    return { phase: FIELD_PHASE_DISSIPATING, mult: Math.max(0, Math.min(1, remaining / FIELD_DISSIPATE_S)) };
  }
  return { phase: FIELD_PHASE_ACTIVE, mult: 1 };
}

/**
 * Is a Collector Maw fitted (any fitted module carrying `mods.pullCollector`)? Fitting is the role
 * choice that makes Pull drop a collector; the rail and the held-key preview read the same answer.
 */
export function collectorFitted(state) {
  return maxFittedModuleMod(state, 'pullCollector', 0) > 0;
}

/**
 * Where a Pull well or a Shove repulsor deploys right now: the Well at the aim point (clamped to
 * deployRange and kept clear of the hull), the Repulsor at the ship. The deploy and the held-key
 * preview (row 493, data/powerPreview.js) both read this, so the preview cannot drift from it.
 */
export function radialFieldDeployCenter(kind, player, state) {
  const def = FIELD_DEFS[kind];
  let cx = player.pos.x, cz = player.pos.z;
  if (kind === 'well') {
    const dir = aimDirection(player, state);
    const aw = state.input && state.input.aimWorld;
    // OVH-01c2 conjurer_wide_bore: the well's throw range reaches as far as the pilot's powers do.
    const deployRange = pilotReachScaled(def.deployRange, player, state);
    let dist = deployRange;
    if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
      dist = Math.min(deployRange, Math.hypot(aw.x - player.pos.x, aw.z - player.pos.z));
    }
    dist = Math.max(finite(player.radius, 6) + def.emitterRadius + def.spawnGap, dist);
    cx = player.pos.x + dir.x * dist;
    cz = player.pos.z + dir.z * dist;
  }
  return { x: cx, z: cz };
}

// OVH-01c2 conjurer_wide_bore — the player's own powers reach ×1.4 (pilot record only; an NPC
// caller or a run without the node keeps the authored number). Applied inside playerFieldSpec and
// the well's deploy center so the deploy and the row-493 preview read one scaled volume, which is
// this file's own contract.
function pilotReachScaled(value, player, state) {
  if (!state || !player || player.id !== state.playerId) return value;
  return value * pilotPowerReachScale(state);
}

// Pilot Tree (progression lead 2026-11-20). conjurer_implode — the player's Pull well is half
// the size and three times as strong: what it catches is crushed into each other.
// conjurer_heavy_shove — the player's Shove pushes twice as hard (everything flies twice as far).
// Player deploys only; the preview reads the same spec, so it shows the bent field.
export const PILOT_IMPLODE_RADIUS = 0.5;
export const PILOT_IMPLODE_STRENGTH = 3;
export const PILOT_HEAVY_SHOVE_STRENGTH = 2;
const UNBENT = Object.freeze({ radius: 1, strength: 1 });
function pilotRadialShape(kind, player, state) {
  if (!state || !player || player.id !== state.playerId) return UNBENT;
  if (kind === 'well' && pilotHas(state, 'conjurer_implode')) {
    return { radius: PILOT_IMPLODE_RADIUS, strength: PILOT_IMPLODE_STRENGTH };
  }
  if (kind === 'repulsor' && pilotHas(state, 'conjurer_heavy_shove')) {
    return { radius: 1, strength: PILOT_HEAVY_SHOVE_STRENGTH };
  }
  return UNBENT;
}

/**
 * The kernel record a player Pull well, Shove repulsor, Rig cone or Rig skim scoop registers when it
 * deploys right now (ids, source and clock left to the caller). The deploys spread this, and the
 * row-493 preview normalizes the same object, so the predicted paths run on the field the press
 * will make.
 */
export function playerFieldSpec(kind, player, state) {
  const def = FIELD_DEFS[kind];
  if (kind === 'skim') {
    const rot = finite(player.rot);
    const dir = { x: Math.cos(rot), z: Math.sin(rot) };
    return {
      kind: def.kind,
      volume: fieldVolumeOf(def),
      center: { x: player.pos.x + dir.x * def.originGap, z: player.pos.z + dir.z * def.originGap },
      dir,
      radius: pilotReachScaled(def.radius, player, state),
      halfWidth: def.halfWidth,
      strength: def.strength,
      falloff: def.falloff,
      durationS: Infinity,
      ownerId: player.id,
      team: player.team,
      filters: { excludeId: player.id },
    };
  }
  if (kind === 'cone') {
    const rot = finite(player.rot);
    const dir = { x: Math.cos(rot), z: Math.sin(rot) };
    const center = { x: player.pos.x + dir.x * def.originGap, z: player.pos.z + dir.z * def.originGap };
    return {
      kind: def.kind, center, dir, radius: pilotReachScaled(def.radius, player, state), strength: def.strength,
      falloff: def.falloff, halfAngleRad: def.halfAngleRad, edgeSoftRad: def.edgeSoftRad,
      volume: fieldVolumeOf(def),
      durationS: Infinity, ownerId: player.id, team: player.team,
      // Owner exclusion, same rule as the deployed tools: the rig never pushes its own hull.
      // The wedge apex sits ahead of the nose so geometry already keeps the player out; this
      // keeps that guarantee true regardless of future originGap/geometry tuning.
      filters: { excludeId: player.id },
    };
  }
  const shape = pilotRadialShape(kind, player, state);
  return {
    kind: def.kind,
    center: radialFieldDeployCenter(kind, player, state),
    radius: pilotReachScaled(def.radius, player, state) * shape.radius,
    strength: def.strength * shape.strength,
    // PQ-137.09 — the deploy path never forwarded the authored damping, so the ONE field record
    // the kernel built for a player-deployed Well or Repulsor always read damping 0 no matter
    // what the data said. Every other register site (the anchor snare, external profiles) does
    // forward it; this one silently dropped it. Without this line the well's convergence law
    // does not exist on the default route and a body just falls faster and faster.
    damping: def.damping,
    falloff: def.falloff,
    volume: fieldVolumeOf(def),
    innerRadius: def.innerRadius || 0,
    innerSoft: def.innerSoft || 0,
    durationS: def.durationS,
    ownerId: player.id,
    team: player.team,
  };
}

/** Bodies a player field can move: dynamic or anchored physical bodies, never emitters or seeds. */
export function isForceableFieldBody(e) {
  if (!e || e.alive === false || !e.pos) return false;
  if (e.type === FIELD_EMITTER_TYPE || e.type === 'massSeed' || (e.type === 'fx' && !isPhysicalMissionBody(e))) return false;
  // Only dynamic Rapier bodies can be moved by an impulse; fixed bodies (stations, gates, static
  // asteroids, the emitters/anchors themselves) ignore it.
  return isDynamicPhysicsBodyEntity(e) || isAnchoredPhysicalBody(e);
}

/**
 * PULL marks the locked target a well lands on (see _pullMarkLockedTarget): the target must sit in
 * the footprint, and a hull must be hostile to the player; a rock, wreck, pod or crate always is.
 */
export function pullMarkTargetEligible(state, player, target, cx, cz, radius) {
  if (!target || !player || target.id === player.id || target.alive === false || !target.pos) return false;
  const dx = finite(target.pos.x) - cx;
  const dz = finite(target.pos.z) - cz;
  if (dx * dx + dz * dz > radius * radius) return false;
  const isShip = target.type === 'ship' || target.type === 'drone';
  return !isShip || isHostileToPlayer(target, player.team, state);
}

// Aim convention shared with impulse charges / mass seed: direction toward the painted world point,
// else the nose. Pure; no allocation beyond the returned vector.
function aimDirection(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
    const dx = aw.x - player.pos.x, dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return { x: dx / len, z: dz / len };
  }
  const inp = state.input;
  const angle = Number.isFinite(inp && inp.aimAngle) ? inp.aimAngle : finite(player.rot);
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function commodityMaterialCategory(id) {
  if (typeof id !== 'string' || !id) return null;
  if (id === 'cmdty_gate_handshake') return 'token';
  if (id === 'cmdty_unclassified_composite') return 'precursor_composite';
  if (id.startsWith('cmdty_ore_') || id.startsWith('cmdty_gem_')
    || id === 'cmdty_silicate' || id === 'cmdty_ice_water' || id === 'cmdty_volatiles') return 'mineral';
  return null;
}

function readMaterialCategory(entity) {
  if (!entity) return null;
  if (typeof entity.materialCategory === 'string' && entity.materialCategory) return entity.materialCategory;
  const data = entity.data;
  if (data && typeof data.materialCategory === 'string' && data.materialCategory) return data.materialCategory;
  if (data && data.machineToken) return 'token';
  const commodity = (data && data.commodityId) || entity.commodityId;
  const fromCommodity = commodityMaterialCategory(commodity);
  if (fromCommodity) return fromCommodity;
  if (entity.type === 'asteroid') return 'mineral';
  return null;
}

/** The membership pass only needs the fields read by the admission and material filters. */
export function fieldBodyMembershipProfile(entity, profile) {
  profile.type = entity && entity.type;
  profile.anchored = isAnchoredPhysicalBody(entity) && entity.physicsBody?.anchorRecoil !== false;
  profile.team = entity && entity.team;
  profile.id = entity && entity.id;
  profile.occupantGeneration = entity && entity.occupantGeneration;
  const data = entity?.data;
  profile.ownerId = data?.cargoIdentity?.ownerId ?? data?.playerJettisonOrigin?.ownerId
    ?? data?.ownerId ?? entity?.ownerId ?? null;
  // Kinematic proxies drop out in the kernel; heavy dynamic hulls still couple by mass.
  profile.dynamic = entity ? isDynamicPhysicsBodyEntity(entity) : true;
  profile.kinematic = profile.dynamic === false;
  profile.materialCategory = readMaterialCategory(entity);
  return profile;
}

/**
 * Build the pure body profile consumed by the field kernel. The optional output record lets the
 * production force loop reuse one scratch object; tests/predictors may omit it for a fresh value.
 * Target selection is intentionally absent: only an earned combat-status multiplier changes field
 * response, so clicking another contact can neither grant nor transfer Gravity Mark.
 */
export function fieldBodyProfile(entity, state, out = null, skipMembership = false) {
  const profile = out || {};
  const id = entity ? entity.id : null;
  const runtime = id != null && state && state.combat && state.combat.entities
    ? state.combat.entities[id]
    : null;
  const fieldResponse = runtime && runtime.multipliers && runtime.multipliers.fieldCoupling;
  const massScale = runtime && runtime.physicsResponse && runtime.physicsResponse.massScale;
  const hullMass = positive(entity && entity.physicsBody && entity.physicsBody.mass, positive(entity && entity.mass, 1));
  const hitchMass = entity && entity.data && Number.isFinite(entity.data.hitchMass) && entity.data.hitchMass > 0
    ? entity.data.hitchMass
    : 0;
  profile.mass = hullMass + hitchMass;
  profile.radius = entity?.radius;
  if (!skipMembership) fieldBodyMembershipProfile(entity, profile);
  profile.coated = state?.combat?.statuses ? gooStatus(state, entity) != null : false;
  const authoredResponse = entity && entity.physicsBody && Number.isFinite(entity.physicsBody.fieldResponseMult)
    ? Math.max(0, entity.physicsBody.fieldResponseMult)
    : 1;
  // A player Saucer cancels field coupling; damage, contact and tether solvers stay live.
  profile.fieldResponseMult = isPlayerSaucer(entity) ? 0
    : (Number.isFinite(fieldResponse) ? Math.max(0, fieldResponse) : 1) * authoredResponse;
  profile.boosting = !!(entity && entity.flags && entity.flags.boosting);
  profile.hitchedTo = null;
  if (id != null && state && state.fields && state.fields.hitches) {
    const hitch = state.fields.hitches[id];
    if (hitch && hitch.sourceId != null) profile.hitchedTo = hitch.sourceId;
  }
  // The transient mass/inertia scale the physics owner will solve this body at (Pinned = 6x,
  // Unmoored = 0.3x). Coupling never reads it — it is not a mass CLASS, it is the effective solver
  // mass the queued impulse has to be authored against. See _applyForces.
  profile.physicsMassScale = positive(massScale, 1);
  return profile;
}

/**
 * RELEASE-TRUTH C2 — the velocity-sampling gate production applies before
 * sampleFieldAcceleration. The well's damping/velocity term only reads ship+drone bodies,
 * and a primed light gets no convergence term at all (the inbound fall is the slam). Any
 * predictor that samples field acceleration must hand the kernel velocity through this same
 * gate or the preview damps bodies production never damps.
 */
export function fieldVelocityTermApplies(entity, profile) {
  return !!(entity && FIELD_VELOCITY_TERM_TYPES.has(entity.type) && wellUsesVelocityTerm(profile));
}

/**
 * RELEASE-TRUTH C2 — the shared "primed light" observation. Extracted from
 * fields._isPrimedLight so a preview can ask the same question the force loop asks without
 * owning the answer. Read-only: it observes impulseCharges (the single primed writer) plus
 * the armed-charge scan; it never writes primed state.
 */
export function fieldEntityIsPrimed(registry, state, entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (state && entity.id === state.playerId) return false;
  const charges = registry && registry.get && registry.get('impulseCharges');
  if (charges && typeof charges.isPrimed === 'function' && charges.isPrimed(entity, state)) {
    return true;
  }
  if (charges && typeof charges._armedChargeOn === 'function') {
    if (charges._armedChargeOn(state, entity.id)) return true;
  }
  const list = indexedTypeScan(state, 'charges');
  if (!list.length) return false;
  for (let i = 0; i < list.length; i++) {
    const charge = list[i];
    if (!charge || charge.alive === false || charge.type !== 'charge') continue;
    const data = charge.data;
    if (data && data.armed && data.hostId === entity.id) return true;
  }
  return false;
}

// Test/consumer seam: pure read of the published field snapshot for a predictor or HUD.
export function activeFieldSnapshot(state) {
  return (state && state.fields && Array.isArray(state.fields.snapshot)) ? state.fields.snapshot : EMPTY_SNAPSHOT;
}
export const EMPTY_SNAPSHOT = Object.freeze([]);

export function gooStatus(state, entity) {
  if (!entity || !state || !state.combat || !state.combat.entities) return null;
  const runtime = state.combat.entities[String(entity.id)];
  const status = runtime && runtime.statuses && runtime.statuses.status_goo;
  if (!status || !(status.stacks > 0)) return null;
  if (status.expiresTick != null && status.expiresTick <= (state.tick | 0)) return null;
  return status;
}
