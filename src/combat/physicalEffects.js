// Shared force recipient discovery and arcade response. Rapier still owns motion.
import { hasActiveSpatialHash } from '../core/spatialQuery.js';
import { queryCombatTableEntities, COMBAT_TABLE_FLAGS } from '../core/combatTable.js';
import { resolvePhysicsBodySpec, queuePhysicsImpulse, prepareExternalPhysicsImpulse } from '../core/physicsAuthority.js';
import { environmentResponse, isEnvironmentalBody, isAnchoredPhysicalBody, isPhysicalMissionBody, PHYSICAL_REFERENCE_MASS } from '../core/physicalResponse.js';
import { queryAsteroidField, getAsteroidFieldRock, promoteAsteroidFieldRock } from '../world/asteroidField.js';
import { routeRecoilThroughWinchBrace } from './attachments.js';

// Recoil provenances whose along-line component a taut winch brace (build_map §30.1 RW-01)
// converts into line load instead of hull velocity. Every other impulse kind is untouched.
const WINCH_BRACE_RECOIL_TAGS = new Set(['mass_driver_recoil', 'weapon_recoil']);

export { environmentResponse, isEnvironmentalBody } from '../core/physicalResponse.js';
const RUNTIMES = new WeakMap();
const PROMOTIONS_PER_TICK = 12;
function runtime(state) {
  let rt = RUNTIMES.get(state);
  if (!rt) { rt = { tick: -1, promoted: 0, blasts: [], lastDrain: -1 }; RUNTIMES.set(state, rt); }
  const tick = state.tick || 0;
  if (rt.tick !== tick) { rt.tick = tick; rt.promoted = 0; }
  return rt;
}
const finite = v => Number.isFinite(Number(v)) ? Number(v) : 0;
function eligible(entity, includeAnchored = true) {
  if (!entity || entity.alive === false || !entity.pos || entity.physicsBody === false || (entity.type === 'fx' && !isPhysicalMissionBody(entity))) return false;
  if (entity.type === 'planet') return false;
  if (isAnchoredPhysicalBody(entity)) return includeAnchored;
  const spec = resolvePhysicsBodySpec(entity);
  return !!spec?.dynamic;
}
function distance2(e, center) { return (e.pos.x - center.x) ** 2 + (e.pos.z - center.z) ** 2; }
function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
function ordered(a, b, center) { return distance2(a, center) - distance2(b, center) || compareIds(a.id, b.id); }
function promote(state, record, helpers, rt) {
  const existing = state.entities?.get(record.id);
  if (existing?.alive !== false && existing) return existing;
  if (rt.promoted >= PROMOTIONS_PER_TICK) return null;
  const body = promoteAsteroidFieldRock(state, record.id, helpers, 'physical-effect');
  if (body) rt.promoted++;
  return body;
}

// One candidate walk for every caller: live bodies come from the spatial hash +
// combat table + the entity-index loose lists (the same union the field system's
// HEAD gatherer used); compact rocks come from the asteroid-field grid. With no
// active hash the whole entityList is the live set. Retained scratch below keeps
// the hot path allocation-free; a nested gather (a `contains` predicate that
// queries again) gets a fresh set via the depth counter.
const LOOSE_TYPES = new Set(['pickup', 'wreck', 'payload', 'mine']);
const SHARED_GATHER = { out: [], live: [], records: [], combat: [], seen: new Set(), lists: [] };
let gatherDepth = 0;

function acquireGather() {
  if (gatherDepth++ === 0) return SHARED_GATHER;
  return { out: [], live: [], records: [], combat: [], seen: new Set(), lists: [] };
}
function releaseGather(scratch) {
  if (--gatherDepth <= 0 && scratch === SHARED_GATHER) {
    scratch.out.length = 0;
    scratch.live.length = 0;
    scratch.records.length = 0;
    scratch.combat.length = 0;
    scratch.seen.clear();
    scratch.lists.length = 0;
  }
}

function admitCandidate(e, cx, cz, radius, options, seen, out) {
  if (!e || e.alive === false || !e.pos || e.id === options.excludeId || seen.has(e.id)) return;
  const reach = radius + Math.max(0, finite(e.radius));
  const dx = e.pos.x - cx;
  const dz = e.pos.z - cz;
  if (dx * dx + dz * dz > reach * reach) return;
  if (options.contains && !options.contains(e)) return;
  seen.add(e.id);
  out.push(e);
}

function gatherPhysicalCandidates(state, center, radius, options) {
  const scratch = acquireGather();
  const { out, live, records, combat, seen, lists } = scratch;
  const cx = center.x;
  const cz = center.z;
  try {
    if (hasActiveSpatialHash(state.spatialHash)) {
      state.spatialHash.queryRadius(cx, cz, radius, live);
      queryCombatTableEntities(state, cx, cz, radius, combat,
        COMBAT_TABLE_FLAGS.SHIP | COMBAT_TABLE_FLAGS.PROJECTILE | COMBAT_TABLE_FLAGS.WRECK);
      for (let i = 0; i < combat.length; i++) live.push(combat[i]);
      const index = state.entityIndex;
      if (index && index.__spacefaceEntityIndexV1) {
        lists[0] = index.pickups;
        lists[1] = index.wrecks;
        lists[2] = index.payloads;
        lists[3] = index.mines;
        lists.length = 4;
      } else {
        lists[0] = state.entityList;
        lists.length = 1;
      }
      // The loose lists are the non-hash coverage (jettisoned cargo spawns
      // collides:false and never enters the hash); without a ready index the
      // entityList fallback yields only those same loose types, since ships and
      // table bodies already arrived via hash + combat table.
      for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        if (!list) continue;
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (!e || !LOOSE_TYPES.has(e.type) && !(e.data && e.data.majorDebris)) continue;
          live.push(e);
        }
      }
    } else if (state.entityList) {
      for (let i = 0; i < state.entityList.length; i++) live.push(state.entityList[i]);
    }
    queryAsteroidField(state, center, radius, records);
    for (let i = 0; i < live.length; i++) admitCandidate(live[i], cx, cz, radius, options, seen, out);
    for (let i = 0; i < records.length; i++) admitCandidate(records[i], cx, cz, radius, options, seen, out);
    out.sort((a, b) => ordered(a, b, center));
  } catch (err) {
    releaseGather(scratch);
    throw err;
  }
  return scratch;
}

export function queryPhysicalBodies(state, center, radius, helpers, out = [], options = {}) {
  out.length = 0;
  if (!state || !center || !(radius > 0)) return out;
  const rt = runtime(state);
  const scratch = gatherPhysicalCandidates(state, center, radius, options);
  try {
    const candidates = scratch.out;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      // Visibility/contact queries can choose a recipient before paying the shared promotion
      // budget. Compact bodies remain real blockers even when no physics slot is available.
      const body = state.entities?.get(candidate.id)
        || (options.promote === false ? candidate : promote(state, candidate, helpers, rt));
      if (!eligible(body, options.includeAnchored !== false)) continue;
      out.push(body);
    }
  } finally {
    releaseGather(scratch);
  }
  return out;
}

export function resolvePhysicalImpulse(entity, impulse, options = {}) {
  const spec = resolvePhysicsBodySpec(entity);
  let scale = 1;
  if (isAnchoredPhysicalBody(entity) && options.scaleEnvironment !== false) scale = spec.mass / PHYSICAL_REFERENCE_MASS * 0.08;
  else if (options.scaleEnvironment !== false && isEnvironmentalBody(entity)) {
    scale = spec.mass / PHYSICAL_REFERENCE_MASS * environmentResponse(entity);
  }
  const reference = Number(options.referenceImpulse);
  const length = Math.hypot(finite(impulse?.x), finite(impulse?.z));
  if (Number.isFinite(reference) && reference >= 0 && length > 0 && isEnvironmentalBody(entity)) scale *= reference / length;
  return { x: finite(impulse?.x) * scale, y: 0, z: finite(impulse?.z) * scale };
}

export function deliverPhysicalImpulseDetailed(state, entity, impulse, evidence = null, options = {}) {
  if (!eligible(entity) || entity.flags?.docked || (entity.id === state?.playerId && state?.ui?.docked)) {
    return { accepted: false, impulse: { x: 0, y: 0, z: 0 }, deltaV: 0 };
  }
  let deliveredImpulse = impulse;
  const recoilTag = String(evidence?.tag ?? evidence?.provenance?.tag ?? '');
  if (WINCH_BRACE_RECOIL_TAGS.has(recoilTag)) {
    const braced = routeRecoilThroughWinchBrace(state, entity.id, impulse);
    if (braced) deliveredImpulse = { x: braced.appliedX, z: braced.appliedZ };
  }
  const resolved = resolvePhysicalImpulse(entity, deliveredImpulse, options);
  const meta = { ...evidence, tick: evidence?.tick ?? state?.tick ?? 0, externalEffect: true,
    continuous: options.continuous === true, dt: options.dt ?? 1 / 60,
    isPlayerTarget: entity.id === state?.playerId || entity.isPlayer === true };
  if (!meta.provenance && (meta.actorId != null || meta.weaponId || meta.tag)) {
    meta.provenance = { actorId: meta.actorId ?? null, weaponId: meta.weaponId ?? null, tag: meta.tag || meta.kind || 'physical_effect', tick: meta.tick };
  }
  const prepared = prepareExternalPhysicsImpulse(entity, resolved, meta);
  if (!prepared || Math.hypot(prepared.x, prepared.z) === 0) {
    return { accepted: false, impulse: { x: 0, y: 0, z: 0 }, deltaV: 0 };
  }
  const deliveryEvidence = { ...meta, externalProtected: true };
  let accepted;
  if (options.port?.applyImpulse && !isAnchoredPhysicalBody(entity)) {
    accepted = options.port.applyImpulse({ entityId: entity.id, impulse: prepared,
      ...deliveryEvidence, point: evidence?.point ?? null, provenance: meta.provenance,
      maxTorque: evidence?.maxTorque });
  } else accepted = queuePhysicsImpulse(entity, prepared, deliveryEvidence);
  const mass = resolvePhysicsBodySpec(entity).mass;
  return { accepted: accepted !== false, impulse: prepared, deltaV: Math.hypot(prepared.x, prepared.z) / mass };
}

export function deliverPhysicalImpulse(state, entity, impulse, evidence = null, options = {}) {
  return deliverPhysicalImpulseDetailed(state, entity, impulse, evidence, options).accepted;
}

export function deliverPhysicalAcceleration(state, entity, acceleration, dt, evidence = null, options = {}) {
  const spec = resolvePhysicsBodySpec(entity);
  if (!spec || !(dt > 0)) return false;
  const coupling = isAnchoredPhysicalBody(entity) ? 0.08
    : options.coupleEnvironment !== false && isEnvironmentalBody(entity) ? environmentResponse(entity) : 1;
  const scale = spec.mass * dt * coupling;
  return deliverPhysicalImpulse(state, entity, { x: finite(acceleration?.x ?? acceleration?.ax) * scale,
    z: finite(acceleration?.z ?? acceleration?.az) * scale }, evidence,
  { scaleEnvironment: false, continuous: true, dt, ...options });
}

// Snapshot the recipients at detonation, not their positions on a later tick. Delayed
// compact bodies receive the same blast once, even after the source has disappeared.
export function schedulePhysicalBlast(state, request) {
  if (!state || !request?.center || !(request.radius > 0) || typeof request.onBody !== 'function') return false;
  const center = { x: request.center.x, z: request.center.z };
  const scratch = gatherPhysicalCandidates(state, center, request.radius, request);
  let ids;
  try {
    const candidates = scratch.out;
    ids = new Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) ids[i] = candidates[i].id;
  } finally {
    releaseGather(scratch);
  }
  const job = { ...request, center, pending: ids, delivered: new Set() };
  const rt = runtime(state);
  rt.blasts.push(job);
  drainBlast(state, rt, job, request.helpers);
  if (!job.pending.length) rt.blasts.splice(rt.blasts.indexOf(job), 1);
  return true;
}

function drainBlast(state, rt, job, helpers) {
  const remaining = [];
  for (const id of job.pending) {
    if (job.delivered.has(id)) continue;
    let body = state.entities?.get(id);
    if (!body || body.alive === false) {
      body = null;
      const rec = getAsteroidFieldRock(state, id);
      if (rec) {
        if (rec.liveEntityId != null) {
          const live = state.entities?.get(rec.liveEntityId);
          if (live && live.alive !== false) body = live;
        }
        if (!body) body = promote(state, rec, helpers, rt);
      }
      if (!body) {
        if (rec) remaining.push(id);
        continue;
      }
    }
    if (!eligible(body, job.includeAnchored !== false)) continue;
    job.delivered.add(id);
    job.onBody(body);
  }
  job.pending = remaining;
}

export function tickPhysicalEffects(state, dt, helpers) {
  if (!state) return;
  const rt = runtime(state);
  if (rt.lastDrain === rt.tick) return;
  rt.lastDrain = rt.tick;
  for (const job of [...rt.blasts]) drainBlast(state, rt, job, job.helpers || helpers);
  rt.blasts = rt.blasts.filter(job => job.pending.length);
}

export function clearPhysicalEffects(state) { RUNTIMES.delete(state); }
