import { stableId } from './contracts.js';
import {
  OPTIC_MAX_FAMILY,
  OPTIC_MAX_GENERATION,
  OPTIC_RAY_COUNT,
  OPTIC_RAY_RADIUS,
  OPTIC_RAY_RANGE,
  opticHeadings,
  opticMaterialOf,
  traceOpticRay,
} from '../combat/opticField.js';
import { WEAPONS } from '../data/weapons.js';

export const FRIENDLY_FIRE_CORRIDOR_WU = 6;
const CLEAR = Object.freeze({ clear: true, blockerId: null, reason: null });

/**
 * Pure ballistic-lane gate. The firing adapter supplies its exact lead angle; this function checks
 * the finite segment from the shooter to the target range against allied ship/drone hulls. It does
 * not change targeting or maneuver state, so an obstructed pilot holds fire instead of jittering.
 */
export function assessFriendlyFireLane({ shooter, target, aimAngle, entities, corridor = FRIENDLY_FIRE_CORRIDOR_WU } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return CLEAR;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const targetRange = Math.hypot(dx, dz);
  if (!(targetRange > 1e-6)) return CLEAR;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const source = Array.isArray(entities)
    ? entities
    : (entities && typeof entities.values === 'function' ? entities.values() : []);
  let blocker = null;
  let bestAlong = Infinity;
  for (const ally of source) {
    if (!ally || ally.alive === false || ally.id === shooter.id || ally.id === target.id) continue;
    if (ally.type !== 'ship' && ally.type !== 'drone') continue;
    if (ally.team == null || ally.team !== shooter.team) continue;
    const ax = ally.pos.x - shooter.pos.x;
    const az = ally.pos.z - shooter.pos.z;
    const along = ax * dirX + az * dirZ;
    const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
    const laneEnd = targetRange + Math.max(0, Number(target.radius) || 0);
    if (along <= muzzleClear || along >= laneEnd) continue;
    const lateralSq = Math.max(0, ax * ax + az * az - along * along);
    const clearance = Math.max(0, Number(ally.radius) || 0) + Math.max(0, corridor);
    if (lateralSq > clearance * clearance) continue;
    if (along < bestAlong || (along === bestAlong && stableId(ally.id) < stableId(blocker && blocker.id))) {
      blocker = ally;
      bestAlong = along;
    }
  }
  if (!blocker) return CLEAR;
  return Object.freeze({ clear: false, blockerId: blocker.id, reason: 'ally_in_lane' });
}

const WEAPON_DEF_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const OPTIC_HEADINGS = opticHeadings(OPTIC_RAY_COUNT);
export const OPTIC_SPLINTER_RETURN_REASON = 'optic_splinter_return';

/**
 * Does this mount's volley contain an energy bolt? Mirrors weapons.js's resolution
 * (`w.damageType || def.damageType || 'kinetic'`). A defensive-only mount cannot be part of an
 * offensive salvo, and hitscan/continuous beams never spawn a bolt entity, so neither can light
 * the lattice. Kinetic/explosive ships are unaffected by the gate — their rounds do not prism.
 */
export function firesEnergyVolley(weapons) {
  if (!Array.isArray(weapons)) return false;
  for (const w of weapons) {
    if (isOpticVolleyWeapon(w)) return true;
  }
  return false;
}

/**
 * Does this mount's hold contain an energy beam? A continuous beam prisms a diamond exactly
 * like a bolt — weapons.js stamps the burst's opticFamilyId and the lattice throws the ring
 * once per burst — so a beam-only battery belongs inside the awareness layer. Fixed beams
 * also follow the ship's aim angle (`_hardpointDir`), which makes them corridor-capable
 * where turrets and homing mounts are not.
 */
function isOpticBeamWeapon(w) {
  if (!w || w.defensiveOnly === true) return false;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  const tracking = w.tracking || (def && def.tracking);
  if (tracking !== 'hitscan' && !(def && def.continuous) && w.continuous !== true) return false;
  const type = w.damageType || (def && def.damageType) || 'kinetic';
  return type === 'energy';
}

/** Energy bolt mounts or energy beam mounts — every shot that can light a lattice. */
export function firesPrismableSalvo(weapons) {
  if (!Array.isArray(weapons)) return false;
  for (const w of weapons) {
    if (isOpticVolleyWeapon(w) || isOpticBeamWeapon(w)) return true;
  }
  return false;
}

/**
 * Per-mount half of firesEnergyVolley. Callers steering a planned bearing need to know WHICH
 * mounts can field an energy bolt — a ship whose optic-capable battery is all turrets can never
 * aim a corridor, since a turret leads the target itself and ignores the ship's aim angle.
 */
function isOpticVolleyWeapon(w) {
  if (!w || w.defensiveOnly === true) return false;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  const tracking = w.tracking || (def && def.tracking);
  if (tracking === 'hitscan' || (def && def.continuous) || w.continuous === true) return false;
  const type = w.damageType || (def && def.damageType) || 'kinetic';
  return type === 'energy';
}

/**
 * The resolved tracking mode of an optic-capable mount ('fixed', 'auto_turret', 'homing', …),
 * or null when the mount cannot field an energy bolt. Aims-side callers use it to tell mounts
 * that follow the ship's aim angle from mounts that solve their own.
 */
export function opticVolleyMountTracking(w) {
  if (!isOpticVolleyWeapon(w)) return null;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  return w.tracking || (def && def.tracking) || 'fixed';
}

/**
 * The resolved tracking mode of a prismable mount ('fixed', 'hitscan', …) — bolts AND beams —
 * or null when the mount cannot light a lattice. Corridor-capable checks use this so a
 * beam-only battery reads as steerable instead of bolt-blind.
 */
export function opticPrismableMountTracking(w) {
  if (!isOpticVolleyWeapon(w) && !isOpticBeamWeapon(w)) return null;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  return w.tracking || (def && def.tracking) || 'fixed';
}

/** The furthest a mount's shot can travel: bolt range, or the beam's ray length. */
function prismableShotRange(w) {
  if (!isOpticVolleyWeapon(w) && !isOpticBeamWeapon(w)) return 0;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  const r = Number.isFinite(w.range) ? w.range : (def && Number.isFinite(def.range) ? def.range : 0);
  return r;
}

/**
 * Does this mount's barrel follow the ship's aim angle through its hardpoint gimbal? Fixed guns
 * and continuous beams release along `rot + facing ± gimbalArc` (weapons.js `_hardpointDir`), so a
 * committed corridor they can bear is realizable. Turrets and homing mounts solve their own
 * direction from the locked target — `aimAngle` never reaches them — and deploy mounts lay
 * payloads at the hull, so none of those can fly a committed line either.
 */
export function mountFollowsAimAngle(w) {
  if (!w || w.defensiveOnly === true || w.facing === 'turret') return false;
  const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
  const tracking = w.tracking || (def && def.tracking) || 'fixed';
  return tracking !== 'auto_turret' && tracking !== 'homing' && tracking !== 'deploy';
}

function opticLaneIterable(entities) {
  if (Array.isArray(entities)) return entities;
  if (entities && typeof entities.values === 'function') return entities.values();
  return [];
}

/** Anything a bolt or splinter can strike: a live colliding body with a real hull circle. */
function splinterBody(entity) {
  return !!entity
    && entity.alive !== false
    && entity.type !== 'projectile'
    && entity.collides !== false
    && !!entity.pos
    && (Number(entity.radius) || 0) > 0;
}

/**
 * Replay one prism cascade the way `settleOpticContact` resolves it: the struck diamond throws
 * the eight-way ring once per family, each splinter dies on the first body it meets, and chained
 * diamonds re-prism under the generation/family caps. Returns the Set of `bodies` indexes a live
 * splinter corridor lands on. Pure — no spend bookkeeping, no clocks.
 */
function opticCascadeHits(bodies, originIndex) {
  const hits = new Set();
  if (originIndex < 0) return hits;
  const visited = new Set();
  const queue = [{ index: originIndex, rayGeneration: 1 }];
  let spawned = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { index, rayGeneration } = queue[cursor];
    if (visited.has(index)) continue;
    visited.add(index);
    // planOpticContact emits the first `count` headings of the ring and spends them from the
    // family budget — a dried-up family prisms nothing further down the chain.
    const count = Math.min(OPTIC_HEADINGS.length, Math.max(0, OPTIC_MAX_FAMILY - spawned));
    if (count <= 0) break;
    spawned += count;
    // Mirror the grammar's own emit exactly: a partial ring re-derives headings at `count`,
    // not the first count of the fixed eight.
    const headings = opticHeadings(count);
    for (let h = 0; h < count; h++) {
      const hit = traceOpticRay(bodies, index, headings[h]);
      if (hit < 0) continue;
      hits.add(hit);
      if (rayGeneration < OPTIC_MAX_GENERATION) {
        const hitEntity = bodies[hit].entity;
        const hitMaterial = opticMaterialOf(hitEntity);
        if (hitMaterial && hitMaterial.response === 'prism' && !visited.has(hit)) {
          queue.push({ index: hit, rayGeneration: rayGeneration + 1 });
        }
      }
    }
  }
  return hits;
}

/** True when `entity` is the shooter or a same-team hull a splinter must never land on. */
function cascadeThreatensOwnSide(entity, shooter) {
  if (!entity || entity === shooter) return true;
  return (entity.type === 'ship' || entity.type === 'drone')
    && entity.team != null && entity.team === shooter.team;
}

/**
 * Optic fire discipline — the "don't light the field in your own face" gate. When an
 * energy-armed shooter's firing lane strikes a pale diamond, that diamond throws an eight-way
 * splinter ring (and chained diamonds re-prism down the fuse, one prism per surface per shot —
 * the same book-keeping `settleOpticContact` applies at impact). This gate replays that cascade
 * with the grammar's own `traceOpticRay` and holds fire when a live splinter corridor lands on
 * the shooter's own position or a same-team hull. A ring that dies in the stone border, or one
 * that reaches the target, is a safe shot and stays clear.
 *
 * `entities` is every body a bolt or splinter could meet — the live collidable index or the
 * entity list in minimal states. Iterated twice; never copied. Only reachable from
 * `applyAIFiringIntent`, which owns aimAngle.
 */
export function assessOpticSplinterReturn({ shooter, target, aimAngle, entities, weapons } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return CLEAR;
  if (!firesPrismableSalvo(weapons)) return CLEAR;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const targetRange = Math.hypot(dx, dz);
  if (!(targetRange > 1e-6)) return CLEAR;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
  // A bolt flies to the target; a beam ray terminates at its own range whether or not the
  // target is that far. The refusal must cover a diamond inside EITHER mount's reach.
  let laneEnd = 0;
  let hasBolt = false;
  let beamReach = 0;
  for (const w of weapons || []) {
    if (isOpticVolleyWeapon(w)) hasBolt = true;
    else if (isOpticBeamWeapon(w)) {
      const r = prismableShotRange(w);
      if (r > beamReach) beamReach = r;
    }
  }
  if (hasBolt) laneEnd = targetRange + Math.max(0, Number(target.radius) || 0);
  if (beamReach > laneEnd) laneEnd = beamReach;
  if (!(laneEnd > muzzleClear)) return CLEAR;

  // First contact on the firing lane. A bolt absorbed by stone or stopped by any nearer body
  // never reaches a diamond, so only the closest hit on the segment decides.
  let firstOptic = null;
  let firstOpticAlong = Infinity;
  let firstSolidAlong = Infinity;
  for (const body of opticLaneIterable(entities)) {
    if (!splinterBody(body) || body === shooter || body === target) continue;
    const bx = body.pos.x - shooter.pos.x;
    const bz = body.pos.z - shooter.pos.z;
    const along = bx * dirX + bz * dirZ;
    if (along <= muzzleClear || along >= laneEnd || along >= firstSolidAlong) continue;
    const lateralSq = Math.max(0, bx * bx + bz * bz - along * along);
    const reach = (Number(body.radius) || 0) + OPTIC_RAY_RADIUS;
    if (lateralSq > reach * reach) continue;
    firstSolidAlong = along;
    if (opticMaterialOf(body)) {
      firstOptic = body;
      firstOpticAlong = along;
    }
  }
  if (!firstOptic || firstOpticAlong > firstSolidAlong) return CLEAR;
  const material = opticMaterialOf(firstOptic);
  if (!material || material.response !== 'prism') return CLEAR;

  // The shot prisms `firstOptic`. Map every lane-solid body into the flat {x,z,radius} shape the
  // optic tracer consumes, then walk the cascade exactly like the family book: each diamond
  // fires once, splinters under OPTIC_MAX_GENERATION re-prism the next diamond they meet.
  const corpus = opticLaneCorpus(entities);
  const bodies = corpus.bodies;
  const originIndex = corpus.indexOf.get(firstOptic) ?? -1;
  const hits = opticCascadeHits(bodies, originIndex);
  for (const hit of hits) {
    if (cascadeThreatensOwnSide(bodies[hit].entity, shooter)) {
      return Object.freeze({
        clear: false,
        blockerId: firstOptic.id != null ? firstOptic.id : null,
        reason: OPTIC_SPLINTER_RETURN_REASON,
      });
    }
  }
  return CLEAR;
}

/**
 * Per-lane flat-corpus scratch, plus a per-tick memo: the splinter scan replays over the same
 * body set once per armed shooter per tick, so the row array and the indexOf Map are pooled
 * per iterable and the whole corpus is stamped once per tick instead of twice per shooter.
 * The memo key is the iterable's `sig()` — aiFireIntent's pooled shelved wrapper carries one
 * that reads the live `state.tick`, `entityIndex.version`, and `asteroidField.version`, so a
 * mid-pass spawn (which bumps the version) invalidates exactly when membership does. Iterables
 * without a sig (plain arrays in headless calls/tests) rebuild every call like before. Every
 * row is still re-stamped from the live entity on each rebuild — poses stay current and the
 * splinterBody re-test keeps membership identical to a fresh walk.
 */
const OPTIC_LANE_SCRATCH = new WeakMap();
const OPTIC_CORPUS_MEMO = new WeakMap();

function opticLaneScratch(entities) {
  const keyable = entities && (typeof entities === 'object' || typeof entities === 'function');
  let scratch = keyable ? OPTIC_LANE_SCRATCH.get(entities) : null;
  if (!scratch) {
    scratch = { rows: [], spare: [], indexOf: new Map() };
    if (keyable) OPTIC_LANE_SCRATCH.set(entities, scratch);
  }
  return scratch;
}

/** Flat {x,z,radius,entity} rows + the entity→row Map — the shapes the optic tracers consume. */
function opticLaneCorpus(entities) {
  const scratch = opticLaneScratch(entities);
  const keyable = entities && (typeof entities === 'object' || typeof entities === 'function');
  const sig = entities && typeof entities.sig === 'function' ? entities.sig() : null;
  const memo = keyable && sig ? OPTIC_CORPUS_MEMO.get(entities) : null;
  if (memo && memo.sig === sig) return memo;
  const bodies = scratch.rows;
  const spare = scratch.spare;
  let n = 0;
  for (const entity of opticLaneIterable(entities)) {
    if (!splinterBody(entity)) continue;
    let row = n < bodies.length ? bodies[n] : (spare.length ? spare.pop() : null);
    if (!row) {
      row = { x: 0, z: 0, radius: 0, entity: null };
      bodies.push(row);
    }
    row.x = entity.pos.x;
    row.z = entity.pos.z;
    row.radius = Number(entity.radius) || 0;
    row.entity = entity;
    n++;
  }
  for (let i = n; i < bodies.length; i++) spare.push(bodies[i]);
  bodies.length = n;
  const indexOf = scratch.indexOf;
  indexOf.clear();
  for (let i = 0; i < n; i++) indexOf.set(bodies[i].entity, i);
  const corpus = { sig, bodies, indexOf };
  if (keyable && sig) OPTIC_CORPUS_MEMO.set(entities, corpus);
  return corpus;
}

/**
 * Optic bank shot — the offensive half of the same grammar. When the firing lane dies on a
 * body that is not the target and not a prism (a stone wall, a plain rock, a station — anything
 * that eats the bolt cold), the shooter looks for a diamond it CAN reach whose ring lands on
 * the target. A candidate must clear three proofs: the shooter→cell lane puts the cell first
 * (a bolt that strikes anything else en route never prisms it), the replayed cascade hits the
 * target, and no corridor lands on the shooter or a same-team hull — the bank inherits the
 * splinter-return refusal instead of routing around it. A prism already first on the direct
 * lane needs no override: the aimed shot lands on the lattice and the gate above has already
 * judged its cascade. The nearest reachable cell wins; equal distances keep collidable-index
 * order, which is deterministic for a fixed spawn pass.
 */
export function planOpticBankShot({ shooter, target, aimAngle, entities, weapons } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return null;
  if (!firesPrismableSalvo(weapons)) return null;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const targetRange = Math.hypot(target.pos.x - shooter.pos.x, target.pos.z - shooter.pos.z);
  if (!(targetRange > 1e-6)) return null;
  const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
  // The aimed bolt reaches the target only if nothing's entry distance beats the target's own:
  // center projection would let a big body parked past the target but leaning back over the
  // lane count as nothing while the bolt strikes its edge first.
  const targetEntry = targetRange - ((Number(target.radius) || 0) + OPTIC_RAY_RADIUS);
  let firstSolid = null;
  let firstEntry = Infinity;
  for (const entity of opticLaneIterable(entities)) {
    if (!splinterBody(entity) || entity === shooter || entity === target) continue;
    const bx = entity.pos.x - shooter.pos.x;
    const bz = entity.pos.z - shooter.pos.z;
    const along = bx * dirX + bz * dirZ;
    const lateralSq = Math.max(0, bx * bx + bz * bz - along * along);
    const reach = (Number(entity.radius) || 0) + OPTIC_RAY_RADIUS;
    if (lateralSq > reach * reach) continue;
    const entry = along - Math.sqrt(reach * reach - lateralSq);
    if (entry <= muzzleClear || entry >= targetEntry) continue;
    if (entry < firstEntry) { firstEntry = entry; firstSolid = entity; }
  }
  if (!firstSolid) return null;
  const firstMaterial = opticMaterialOf(firstSolid);
  if (firstMaterial && firstMaterial.response === 'prism') return null;

  // A certified corridor is only worth the volley if a bolt can physically reach the cell:
  // bound candidates by the furthest-ranging optic-capable mount (range-less mounts fall back
  // to the grammar's own ray cap).
  let maxBoltRange = 0;
  for (const w of weapons || []) {
    const r = prismableShotRange(w);
    if (r > maxBoltRange) maxBoltRange = r;
  }
  const boltReach = maxBoltRange > 0 ? Math.min(maxBoltRange, OPTIC_RAY_RANGE) : OPTIC_RAY_RANGE;

  // Direct fire is a wasted bolt. The replay needs the flat body set — build it only now.
  const corpus = opticLaneCorpus(entities);
  const bodies = corpus.bodies;
  const indexOf = corpus.indexOf;
  const targetIndex = indexOf.get(target);
  if (targetIndex == null) return null; // a bank can only bank onto a body the sim can see

  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const cell = bodies[i];
    if (cell.entity === firstSolid || cell.entity === shooter || cell.entity === target) continue;
    const material = opticMaterialOf(cell.entity);
    if (!material || material.response !== 'prism') continue;
    const px = cell.x - shooter.pos.x;
    const pz = cell.z - shooter.pos.z;
    const dist = Math.hypot(px, pz);
    if (!(dist > muzzleClear) || dist > boltReach || dist >= bestDist) continue;

    // The bolt must reach this cell: the cell must be the first contact on the corridor —
    // entry-distance ordering, so a body leaning over the approach from just past the cell's
    // center cannot sneak a shadow lane.
    const cDirX = px / dist;
    const cDirZ = pz / dist;
    const cellEntry = dist - (cell.radius + OPTIC_RAY_RADIUS);
    let blocked = false;
    for (let j = 0; j < bodies.length; j++) {
      if (j === i) continue;
      const other = bodies[j];
      if (other.entity === shooter) continue;
      const ox = other.x - shooter.pos.x;
      const oz = other.z - shooter.pos.z;
      const oalong = ox * cDirX + oz * cDirZ;
      const olateralSq = Math.max(0, ox * ox + oz * oz - oalong * oalong);
      const oreach = other.radius + OPTIC_RAY_RADIUS;
      if (olateralSq > oreach * oreach) continue;
      const oentry = oalong - Math.sqrt(oreach * oreach - olateralSq);
      if (oentry <= muzzleClear) continue;
      if (oentry < cellEntry) { blocked = true; break; }
    }
    if (blocked) continue;

    const hits = opticCascadeHits(bodies, i);
    if (!hits.has(targetIndex)) continue;
    let unsafe = false;
    for (const hit of hits) {
      if (cascadeThreatensOwnSide(bodies[hit].entity, shooter)) { unsafe = true; break; }
    }
    if (unsafe) continue;
    best = { index: i, dist };
    bestDist = dist;
  }
  if (!best) return null;
  const cell = bodies[best.index];
  return Object.freeze({
    aimAngle: Math.atan2(cell.z - shooter.pos.z, cell.x - shooter.pos.x),
    opticId: cell.entity.id != null ? cell.entity.id : null,
  });
}
