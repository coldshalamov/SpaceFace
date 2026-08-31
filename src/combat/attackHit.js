// Live AttackSpec hit resolver (PQ-133). The gun calls this from the fire/hit path.
// Bounce consumes a physics-owned surface receipt and continues the same body.
// Chain hops use the spatial query the caller supplies. Untraited shots never enter here.

import { queryNearbyEntities } from '../core/spatialQuery.js';
import {
  SURFACE_RESPONSE,
  isSurfaceContactReceipt,
  surfaceContactFromBodies,
  surfaceResponseFor,
} from '../core/surfaceContact.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { entityKey } from './runtime.js';
import { canAct } from './attackLineage.js';
import { tryPierce, tryChain, trySplit } from './attackPropagation.js';
import { resolvePayload } from './attackPayload.js';
import { resolveRicochet } from './surfaceReflection.js';

const CONTINUE_ARMED = new WeakSet();
const CONTINUE_NEXT = new WeakSet();
const SURFACE_TYPES = new Set(['asteroid', 'station', 'wreck']);
const ENTITY_TYPES = new Set(['ship', 'drone']);

export function armAttackContinue(body) {
  if (!body || CONTINUE_ARMED.has(body)) return body;
  CONTINUE_ARMED.add(body);
  let alive = body.alive !== false;
  Object.defineProperty(body, 'alive', {
    configurable: true,
    enumerable: true,
    get() { return alive; },
    set(value) {
      if (value === false && CONTINUE_NEXT.has(body)) {
        CONTINUE_NEXT.delete(body);
        return;
      }
      alive = !!value;
    },
  });
  return body;
}

export function requestAttackContinue(body) {
  if (body) CONTINUE_NEXT.add(body);
}

function nudgeAlongVelocity(body) {
  if (!body || !body.pos || !body.vel) return;
  const speed = Math.hypot(body.vel.x || 0, body.vel.z || 0);
  if (!(speed > 0)) return;
  const pad = (body.radius || 0.7) + 0.05;
  body.pos.x += (body.vel.x / speed) * pad;
  body.pos.z += (body.vel.z / speed) * pad;
}

function statusIdsOf(state, entity) {
  const combat = state && state.combat;
  const table = combat && combat.entities;
  if (!table || entity == null || entity.id == null) return [];
  const runtime = table[entityKey(entity.id)];
  const bag = runtime && runtime.statuses;
  if (!bag || typeof bag !== 'object') return [];
  return Object.keys(bag);
}

function wrapAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function directionalSurfaceMaterial(target, hitPos) {
  const directional = target && target.data && target.data.directionalSurface;
  if (!directional || !hitPos || !target.pos) return null;
  const dx = hitPos.x - target.pos.x;
  const dz = hitPos.z - target.pos.z;
  if (!(Math.hypot(dx, dz) > 1e-6)) return null;
  const localBearing = wrapAngle(Math.atan2(dz, dx) - (Number(target.rot) || 0));
  const center = Number.isFinite(directional.arcCenter) ? directional.arcCenter : 0;
  const half = Number.isFinite(directional.arcHalfWidth) ? Math.max(0, directional.arcHalfWidth) : 0;
  return Math.abs(wrapAngle(localBearing - center)) <= half
    ? directional.material || null
    : null;
}

function contactMaterial(target, payload) {
  return directionalSurfaceMaterial(target, payload && payload.pos)
    || target.surfaceMaterial
    || target.surfaceKind
    || (target.data && (target.data.surfaceMaterial || target.data.surfaceKind));
}

function isSurfaceTarget(target, payload) {
  if (!target) return false;
  const material = contactMaterial(target, payload);
  const response = surfaceResponseFor(material);
  if (response === SURFACE_RESPONSE.reflect || response === SURFACE_RESPONSE.absorb) return true;
  return SURFACE_TYPES.has(target.type);
}

export function collectAttackCandidates(state, origin, range, scratch, ownerId, ownerTeam) {
  const nearby = queryNearbyEntities(
    state,
    origin,
    range,
    scratch || [],
    state && state.entityList,
  );
  const owner = ownerId != null && state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(ownerId)
    : null;
  const out = [];
  const list = Array.isArray(nearby) ? nearby : [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (ownerId != null && entity.id === ownerId) continue;
    if (!ENTITY_TYPES.has(entity.type)) continue;
    if (owner) {
      if (!isHostileForAI(state, owner, entity)) continue;
    } else if (ownerTeam != null && entity.team != null && entity.team === ownerTeam) continue;
    out.push({
      id: entity.id,
      pos: entity.pos,
      score: Number.isFinite(entity.score) ? entity.score : 0,
      statuses: statusIdsOf(state, entity),
      valid: true,
    });
  }
  return out;
}

function receiptForContact(projectile, target, payload, tick) {
  if (payload && isSurfaceContactReceipt(payload.receipt)) return payload.receipt;
  if (!projectile || !target) return null;
  return surfaceContactFromBodies(projectile, target, {
    point: payload && payload.pos,
    normal: payload && payload.normal,
    velocity: projectile.vel,
    material: contactMaterial(target, payload),
  }, tick);
}

/**
 * Resolve one live contact for a traited projectile.
 * Untraited weapons never call this.
 */
export function resolveLiveAttackHit(input = {}) {
  const spec = input.spec;
  const runtime = input.runtime;
  const projectile = input.projectile;
  const target = input.target;
  const payload = input.payload || {};
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const hops = [];

  if (!spec || !runtime || !projectile) {
    return { ok: false, reason: 'no_live_attack', consume: true, hops };
  }

  if (target && isSurfaceTarget(target, payload)) {
    const receipt = receiptForContact(projectile, target, payload, tick);
    const bounced = resolveRicochet(runtime, spec, receipt, projectile, {
      hostiles: input.hostiles,
    });
    if (bounced.ok) {
      requestAttackContinue(projectile);
      nudgeAlongVelocity(projectile);
      return {
        ok: true,
        consume: false,
        bounce: bounced,
        hops,
        projectile,
      };
    }
    return { ok: false, reason: bounced.reason, consume: true, bounce: bounced, hops };
  }

  if (!target || target.id == null) {
    return { ok: false, reason: 'no_target', consume: true, hops };
  }

  const pierced = tryPierce(runtime, { targetId: target.id, tick });
  if (pierced && pierced.continue) requestAttackContinue(projectile);

  if (pierced && pierced.applyPayload === false) {
    return {
      ok: true,
      consume: !(pierced && pierced.continue),
      pierce: pierced,
      payload: null,
      hops,
      children: [],
      projectile,
      runtime,
    };
  }

  const tetherAnchorId = input.tetherAnchorId != null ? input.tetherAnchorId : null;
  const resolved = resolvePayload(spec, {
    targetId: target.id,
    tetherAnchorId,
    generation: runtime.generation,
    hasBounced: runtime.hasBounced,
  });

  const children = [];
  const splitSpec = spec.propagation && spec.propagation.split;
  if (splitSpec && runtime.remaining && runtime.remaining.splits > 0 && canAct(runtime, 'split')) {
    const split = trySplit(runtime, spec, { targetId: target.id, tick });
    if (split && split.ok && Array.isArray(split.children)) {
      for (let i = 0; i < split.children.length; i++) children.push(split.children[i]);
    }
  }

  let current = runtime;
  let from = target;
  const chain = spec.propagation && spec.propagation.chain;
  const range = chain && Number.isFinite(chain.range) ? chain.range : 0;
  const canHop = range > 0;
  if (canHop) {
    for (;;) {
      const origin = from.pos || payload.pos || projectile.pos;
      const candidates = typeof input.candidates === 'function'
        ? input.candidates(origin, range, current)
        : (input.candidates || []);
      const hop = tryChain(current, spec, {
        targetId: from.id,
        tick,
        pos: origin,
      }, candidates);
      if (!hop.ok) break;
      const hopResolved = resolvePayload(spec, {
        targetId: hop.target.id,
        tetherAnchorId,
        generation: hop.runtime.generation,
        hasBounced: hop.runtime.hasBounced,
      });
      if (typeof input.applyHopDamage === 'function') {
        input.applyHopDamage({
          target: hop.target,
          runtime: hop.runtime,
          resolved: hopResolved,
          fromId: hop.fromId,
        });
      }
      hops.push(hop.target.id);
      current = hop.runtime;
      from = hop.target;
    }
  }

  return {
    ok: true,
    consume: !(pierced && pierced.continue),
    pierce: pierced,
    payload: resolved,
    hops,
    children,
    projectile,
    runtime: current,
  };
}
