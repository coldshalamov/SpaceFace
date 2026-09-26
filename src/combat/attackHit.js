// Live AttackSpec hit resolver (PQ-133). The gun calls this from the fire/hit path.
// Bounce consumes a physics-owned surface receipt and continues the same body.
// Chain hops use the spatial query the caller supplies. Untraited shots never enter here.

import { queryNearbyEntities } from '../core/spatialQuery.js';
import {
  SURFACE_RESPONSE,
  isSurfaceContactReceipt,
  surfaceResponseFor,
} from '../core/surfaceContact.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { entityKey } from './runtime.js';
import { canAct } from './attackLineage.js';
import { tryPierce, tryChain, trySplit } from './attackPropagation.js';
import { resolvePayload } from './attackPayload.js';
import { resolveRicochet } from './surfaceReflection.js';
import { bossSurfaceAuthoringOf, resolveBossSurfaceContact } from './bossSurface.js';
import { refreshFlightAfterBounce } from './projectileFlight.js';

const CONTINUE_ARMED = new WeakSet();
const CONTINUE_NEXT = new WeakSet();
const SURFACE_TYPES = new Set(['asteroid', 'station', 'wreck']);
const ENTITY_TYPES = new Set(['ship', 'drone']);

// PQ-133.04 R4 — the compiled-continuation causal tap. resolveLiveAttackHit stays pure combat
// machinery: the bus is BOUND by the presentation orchestrator (the receipt event's only
// consumer) and publishing is a no-op before that. The event leaves this module synchronously,
// at the same seam that produced the receipt — no queue, no reorder, no second source of truth.
let CAUSAL_BUS = null;

export function bindAttackCausalBus(bus) {
  CAUSAL_BUS = bus && typeof bus.emit === 'function' ? bus : null;
}

function publishBounceContinuation(event) {
  if (CAUSAL_BUS) CAUSAL_BUS.emit('combat:bounceContinued', event);
}

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

function statusIdsOf(state, entity) {
  const combat = state && state.combat;
  const table = combat && combat.entities;
  if (!table || entity == null || entity.id == null) return [];
  const runtime = table[entityKey(entity.id)];
  const bag = runtime && runtime.statuses;
  if (!bag || typeof bag !== 'object') return [];
  return Object.keys(bag);
}

function isSurfaceTarget(target) {
  if (!target) return false;
  const material = target.surfaceMaterial
    || target.surfaceKind
    || (target.data && (target.data.surfaceMaterial || target.data.surfaceKind));
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

/** Fail-closed (PQ-133.04): combat consumes a physics receipt; it never invents one. */
function receiptForContact(payload) {
  return payload && isSurfaceContactReceipt(payload.receipt) ? payload.receipt : null;
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

  // PQ-133.04 R4: a target carrying boss-surface authoring is itself a surface. The gate opens
  // for it exactly as for a reflective room solid; every receipt check below stays fail-closed,
  // and a boss contact that cannot be proven a prow contact is consumed as ordinary armor.
  const bossAuthoring = target ? bossSurfaceAuthoringOf(target) : null;
  if (target && (isSurfaceTarget(target) || bossAuthoring)) {
    const receipt = receiptForContact(payload);
    if (!receipt) {
      return { ok: false, reason: 'no_physics_receipt', consume: true, hops };
    }
    // A receipt from another tick, or for another surface, cannot authorize this contact.
    if (receipt.tick !== tick) {
      return { ok: false, reason: 'stale_receipt', consume: true, hops };
    }
    if (receipt.surfaceId != null && receipt.surfaceId !== target.id) {
      return { ok: false, reason: 'receipt_surface_mismatch', consume: true, hops };
    }
    // The boss-surface consult runs BEFORE the ricochet, and only for AUTHORED surfaces: outside
    // the prow arc (or when the contact cannot be proven at all) the surface is ordinary armor —
    // the shot is consumed without spending a bounce, and the ordinary hit pipeline owns the
    // damage. No budget moves. Unauthored surfaces take the unchanged ricochet path below.
    if (bossAuthoring) {
      const bossSurface = resolveBossSurfaceContact({ surface: target, receipt });
      if (!(bossSurface.ok === true && bossSurface.response === 'reflect')) {
        return {
          ok: false,
          reason: 'boss_surface_armor',
          consume: true,
          hops,
          bossSurface,
        };
      }
    }
    const bounced = resolveRicochet(runtime, spec, receipt, projectile, {
      hostiles: input.hostiles,
      state: input.state,
      surface: target,
    });
    if (bounced.ok) {
      requestAttackContinue(projectile);
      const owner = input.state && input.state.entities && projectile.ownerId != null
        ? input.state.entities.get(projectile.ownerId)
        : null;
      refreshFlightAfterBounce(projectile, owner && owner.pos);
      // The compiled continuation is published with its receipt identity so the semantic
      // arbiter can present — and dedupe — the causal fact. Pure receipt echo, no fabrication.
      publishBounceContinuation({
        projectileId: projectile.id,
        ownerId: projectile.ownerId != null ? projectile.ownerId : null,
        targetId: target.id != null ? target.id : null,
        surfaceId: receipt.surfaceId,
        material: receipt.material,
        tick: receipt.tick,
        receipt,
        incoming: { x: receipt.velocity.x, z: receipt.velocity.z },
        outgoing: { x: bounced.velocity.x, z: bounced.velocity.z },
      });
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
