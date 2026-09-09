// PQ-147.03 — pure cluster-and-detonate rating.
//
// The well + primed-light chain is physics (fields pull, impulseCharges cooks the slam).
// This module only classifies RECEIPTS into secondary consequence kinds. It never explodes
// a body and never writes primed state.

import { WELL_CLUSTER } from '../../data/fields.js';

export const CLUSTER_SECONDARY_KINDS = WELL_CLUSTER.secondaryKinds;

const TERRAIN_SURFACES = new Set(['terrain', 'asteroid', 'structure']);
const CARGO_TYPES = new Set(['pickup', 'payload', 'wreck']);

function idOf(value) {
  return value == null ? null : value;
}

function tickOf(payload, fallback = 0) {
  const tick = payload && payload.tick;
  return Number.isFinite(tick) ? (tick | 0) : fallback;
}

function asIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.ids)) return value.ids;
  return [value];
}

function isCargoId(id, ctx) {
  if (id == null) return false;
  if (ctx.cargoIds && (ctx.cargoIds.has(id) || ctx.cargoIds.has(String(id)))) return true;
  const entity = ctx.entityOf && ctx.entityOf(id);
  return !!(entity && CARGO_TYPES.has(entity.type));
}

function isTerrainId(id, ctx) {
  if (id == null) return false;
  if (ctx.terrainIds && (ctx.terrainIds.has(id) || ctx.terrainIds.has(String(id)))) return true;
  const entity = ctx.entityOf && ctx.entityOf(id);
  return !!(entity && (entity.type === 'asteroid' || entity.type === 'station'));
}

function skipActor(id, ctx) {
  if (id == null) return true;
  if (id === ctx.playerId) return true;
  return false;
}

/**
 * A primed light in a well is ammunition: withhold the convergence velocity term so the
 * inbound fall is a slam, not a parked clump. Unmarked craft keep the 137.09 band.
 */
export function wellWithholdsVelocityTerm(primed) {
  return primed === true;
}

/**
 * Classify one bus receipt into zero or more secondary rows.
 * `ctx`: { primedId, playerId, actionTick, cargoIds, terrainIds, primedTumbled, chainStarted, entityOf }
 */
export function classifyClusterReceipt(eventName, payload, ctx) {
  if (!payload || !ctx) return [];
  const tick = tickOf(payload, ctx.nowTick || 0);
  if (Number.isFinite(ctx.actionTick) && tick < (ctx.actionTick | 0)) return [];

  const primedId = ctx.primedId;
  const out = [];

  if (eventName === 'charge:detonated' || eventName === 'chain:detonated') {
    const trigger = payload.trigger || (eventName === 'chain:detonated' ? 'sympathetic' : 'manual');
    if (trigger === 'manual') return out;
    const hostId = payload.hostId != null ? payload.hostId : payload.sourceId;
    if (hostId === primedId || payload.sourceId === primedId) ctx.chainStarted = true;
    const hits = asIdList(payload.hits);
    for (let i = 0; i < hits.length; i++) {
      const id = idOf(hits[i]);
      if (skipActor(id, ctx) || id === primedId) continue;
      if (isCargoId(id, ctx)) out.push({ kind: 'cargo_thrown', id, tick, detail: `blast threw cargo #${id}` });
      else if (isTerrainId(id, ctx)) out.push({ kind: 'terrain_slam', id, tick, detail: `blast reached terrain #${id}` });
      else out.push({ kind: 'other_body_hit', id, tick, detail: `blast hit #${id}` });
    }
    return out;
  }

  if (eventName === 'combat:tumbled') {
    const victimId = payload.victimId;
    if (skipActor(victimId, ctx)) return out;
    if (victimId === primedId && !ctx.primedTumbled) {
      ctx.primedTumbled = true;
      return out;
    }
    if (victimId === primedId || ctx.chainStarted || ctx.primedTumbled) {
      out.push({ kind: 'second_tumble', id: victimId, tick, detail: `#${victimId} lost the helm (${payload.source || 'unknown'})` });
    }
    return out;
  }

  if (eventName === 'combat:collisionConsequence' || eventName === 'physics:impact') {
    const aId = payload.targetId != null ? payload.targetId : payload.aId;
    const bId = payload.otherId != null ? payload.otherId : payload.bId;
    const surface = payload.surface;
    if (skipActor(aId, ctx) && skipActor(bId, ctx)) return out;
    const terrain = TERRAIN_SURFACES.has(surface) || isTerrainId(aId, ctx) || isTerrainId(bId, ctx);
    const cargo = isCargoId(aId, ctx) || isCargoId(bId, ctx);
    const involvesPrimed = aId === primedId || bId === primedId;
    if (terrain && (ctx.chainStarted || involvesPrimed)) {
      const id = isTerrainId(aId, ctx) ? aId : (isTerrainId(bId, ctx) ? bId : (aId === primedId ? bId : aId));
      out.push({ kind: 'terrain_slam', id, tick, detail: `terrain slam #${aId}×#${bId}` });
    }
    if (cargo && (ctx.chainStarted || involvesPrimed)) {
      const id = isCargoId(aId, ctx) ? aId : bId;
      if (!skipActor(id, ctx)) out.push({ kind: 'cargo_thrown', id, tick, detail: `cargo #${id} struck` });
    }
    if (ctx.chainStarted && !involvesPrimed && !terrain) {
      const id = skipActor(aId, ctx) ? bId : aId;
      if (!skipActor(id, ctx) && id !== primedId && !isCargoId(id, ctx)) {
        out.push({ kind: 'other_body_hit', id, tick, detail: `secondary body #${id} hit` });
      }
    }
    return out;
  }

  if (eventName === 'chain:slam') {
    if (payload.victimId === primedId) ctx.chainStarted = true;
    return out;
  }

  return out;
}

/** Dedup by kind+id, preserve first-seen order. */
export function mergeClusterSecondaries(existing, incoming) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(list.map((row) => `${row.kind}:${row.id}`));
  const extra = Array.isArray(incoming) ? incoming : [];
  for (let i = 0; i < extra.length; i++) {
    const row = extra[i];
    if (!row || !row.kind) continue;
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(row);
  }
  return list;
}

export function rateClusterMoment(secondaries) {
  const rows = Array.isArray(secondaries) ? secondaries : [];
  const kinds = [];
  const kindSet = new Set();
  for (let i = 0; i < rows.length; i++) {
    const kind = rows[i] && rows[i].kind;
    if (!kind || kindSet.has(kind)) continue;
    kindSet.add(kind);
    kinds.push(kind);
  }
  return {
    count: rows.length,
    kinds,
    rated: rows.length >= 3,
  };
}
