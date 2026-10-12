import { environmentMaterialOf, stampEnvironmentMaterial, environmentSurfaceData } from '../data/environmentMaterials.js';
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
import { queryPhysicalBodies, deliverPhysicalImpulse } from '../combat/physicalEffects.js';
import { queryAsteroidField } from '../world/asteroidField.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { isAnchoredPhysicalBody } from '../core/physicalResponse.js';
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { readRecentImpulseProvenance } from '../combat/impulseKernel.js';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export function environmentBodyRef(entity) {
  const d = entity.data || {};
  return { id: entity.id, sector: entity.homeSectorId || d.homeSectorId || d.sectorId || null,
    field: d.fieldId || d.opticStructureId || null, slot: d.asteroidSlotId ?? d.opticCell ?? null,
    record: d.worldRecordId || null };
}
function sameRef(entity, ref) {
  const own = environmentBodyRef(entity);
  if (ref.field != null && ref.slot != null) return own.sector === ref.sector && own.field === ref.field && String(own.slot) === String(ref.slot);
  if (ref.record) return own.record === ref.record;
  return own.id === ref.id;
}
function threshold(entity, material) {
  if (material === 'crystal') return 48;
  if (material === 'volatile') return 36;
  if (material === 'debris' && num(entity.data?.fuelVolatile ?? entity.fuelVolatile ?? 0.55) >= 0.12) return 36;
  return Infinity;
}
function queueReaction(state, entity, material, origin) {
  const condition = entity.data.materialCondition;
  if (condition.reacted || condition.pending) return;
  condition.pending = true;
  entity.data.playerModified = true;
  (state.materialReactions ||= []).push({ ...environmentBodyRef(entity), material, origin: copy(origin || {}) });
}

// Heat and impact queue durable material work; the environment owner drains it.
export function addEnvironmentHeat(state, entity, amount, origin = {}) {
  if (!['asteroid', 'wreck', 'prop', 'payload', 'cargo_pod', 'pickup'].includes(entity?.type)) return false;
  if (isAnchoredPhysicalBody(entity)) return false;
  // Site structural anatomy and Ceres workfleet machinery answer to their site owner;
  // they are never cook-off/fracture bodies (mirrors farActorTable's residency exemption).
  if (entity?.data?.worldSiteStructural === true || ceresWorkfleetRoleForEntity(entity)) return false;
  const material = environmentMaterialOf(entity);
  if (!material || !entity || entity.alive === false) return false;
  stampEnvironmentMaterial(entity, material);
  const condition = entity.data.materialCondition;
  condition.heat = Math.max(0, (Number(condition.heat) || 0) + (Number(amount) || 0));
  entity.data.heat = condition.heat;
  entity.heat = condition.heat;
  entity.data.playerModified = true;
  if (condition.heat >= threshold(entity, material)) queueReaction(state, entity, material, origin);
  return true;
}

export function queueEnvironmentImpact(state, entity, closingSpeed, origin = {}) {
  if (!['asteroid', 'wreck', 'prop', 'payload', 'cargo_pod', 'pickup'].includes(entity?.type)) return false;
  if (isAnchoredPhysicalBody(entity)) return false;
  if (entity?.data?.worldSiteStructural === true || ceresWorkfleetRoleForEntity(entity)) return false;
  // The Gyre field binds its aggregate through physical strikes: otherwise the first
  // bowled hull bursts the rock and ends the weapon before it can reach the next one.
  // This is impact cohesion, not material immunity; heat still cooks/fractures it.
  const gyre = state.gyreSnare;
  const held = entity?.data?.gyreCore && gyre?.coreId === entity.id
    && (gyre.phase === 'holding' || gyre.phase === 'launching');
  const flight = entity?.data?.gyreLaunched && entity.physicsBody?.impactDamageScale > 1
    && Number(entity.data.despawnAt) > Number(state.simTime)
    && Number(entity.data.gyreLaunchMeta?.holdUntilSim) > Number(state.simTime);
  if (held || flight) return false;
  const material = environmentMaterialOf(entity);
  const impactThreshold = material === 'rock' ? 110 : 60;
  if (!entity || entity.alive === false || !(closingSpeed >= impactThreshold) || !['rock', 'crystal', 'volatile', 'debris'].includes(material)) return false;
  stampEnvironmentMaterial(entity, material);
  if (material !== 'rock' && threshold(entity, material) === Infinity) return false;
  queueReaction(state, entity, material, origin);
  return true;
}

export const environmentMaterials = {
  name: 'environmentMaterials',
  init(ctx) {
    this.destroy();
    Object.assign(this, { state: ctx.state, helpers: ctx.helpers || {}, registry: ctx.registry, bus: ctx.bus });
    this._off = this.bus?.on('physics:impact', p => {
      for (const [id, otherId] of [[p.aId, p.bId], [p.bId, p.aId]]) {
        const body = this.state.entities.get(id);
        const cause = readRecentImpulseProvenance(this.state.entities.get(otherId), this.state.tick)
          || readRecentImpulseProvenance(body, this.state.tick);
        queueEnvironmentImpact(this.state, body, num(p.preSolveClosingSpeed), {
          actorId: p.actorId ?? cause?.actorId, weaponId: cause?.weaponId, tag: 'material_impact',
        });
      }
    });
  },
  destroy() { if (typeof this._off === 'function') this._off(); this._off = null; },
  newGame() { this.state.materialReactions = []; this.state.materialBlasts = []; },
  _resolve(ref, promote = false) {
    const state = this.state;
    let body = state.entities.get(ref.id);
    if (body && sameRef(body, ref)) return body;
    body = state.entityList.find(e => e.alive !== false && sameRef(e, ref));
    if (body) return body;
    const rec = state.world?.asteroidField?.rocks?.find(e => e.alive !== false && sameRef(e, ref));
    if (!rec || !promote) return rec || null;
    return queryPhysicalBodies(state, rec.pos, 0.01, this.helpers, [], { contains: e => sameRef(e, ref) })[0] || null;
  },
  _persist(body) { this.registry?.get('world')?.persistResourceBody?.(body); },
  _cue(body, kind, count = 0) {
    const p = { id: body.id, pos: { ...body.pos }, x: body.pos.x, z: body.pos.z, radius: body.radius, material: body.data.material, count };
    this.bus?.emit(`environment:${kind}`, p);
    this.bus?.emit(kind === 'fractured' ? 'asteroid:destroyed' : 'bomb:exploded', p);
    this.bus?.emit('emergent:audio', { id: kind === 'fractured' ? 'sfx_emergent_crumple' : 'sfx_emergent_cook', x: p.x, z: p.z, gain: 0.8, impulse: 900 });
  },
  _fracture(body) {
    const d = body.data;
    const radius = Math.max(1, num(body.radius));
    const remaining = Math.max(0, num(d.yieldRemainingU ?? d.yieldU) * (1 - Math.min(1, num(d.pctEjected))));
    const count = 4;
    const childRadius = Math.max(1, radius / Math.cbrt(count));
    const material = environmentMaterialOf(body);
    const childMass = resolvePhysicsBodySpec(body).mass / count;
    const ids = [];
    for (let i = 0; i < count; i++) {
      const angle = num(body.rot) + (i + 0.5) * Math.PI * 2 / count;
      const x = Math.cos(angle), z = Math.sin(angle);
      const child = this.helpers.spawnEntity?.({ type: 'asteroid',
        pos: { x: body.pos.x + x * (radius + childRadius), z: body.pos.z + z * (radius + childRadius) },
        vel: { x: num(body.vel?.x) + x * 45, z: num(body.vel?.z) + z * 45 },
        radius: childRadius, mass: childMass,
        physicsBody: { radius: asteroidColliderRadius(d.typeId || 'ast_crystalline', childRadius), mass: childMass },
        hull: Math.max(30, num(body.hullMax) / count), hullMax: Math.max(30, num(body.hullMax) / count),
        collides: true, flags: { persistent: true }, homeSectorId: body.homeSectorId || d.homeSectorId,
        data: environmentSurfaceData(material, { ...d, opticMaterial: undefined, opticStructureId: undefined, opticCell: undefined,
          // Rupture ends the bound aggregate. Fragments are ordinary material, never
          // new armed balls inheriting a stale core/member ledger or hold lifetime.
          gyreCore: undefined, gyreLaunched: undefined, gyreLaunchMeta: undefined,
          gyrePrevImpactScale: undefined, gyrePrevDespawnAt: undefined, gyrePrevTtl: undefined,
          size: childRadius, isChunk: true, materialFragment: true, fractured: true, tetherPayload: true,
          yieldU: remaining / count, yieldRemainingU: remaining / count, yieldMaxU: remaining / count, pctEjected: 0,
          oreHP: Math.max(30, num(body.hullMax) / count), oreHPMax: Math.max(30, num(body.hullMax) / count),
          materialCondition: { heat: 0, reacted: true }, asteroidSlotId: `${d.asteroidSlotId ?? body.id}:shard:${i}`,
          worldRecordId: undefined, resourceBodyId: undefined, despawnAt: num(this.state.simTime) + 90 }) });
      if (child) { ids.push(child.id); this.bus?.emit('asteroid:chunked', { parentId: body.id, chunkId: child.id, massU: 0 }); }
    }
    d.fractured = true; d.destroyed = true; d.oreHP = 0; d.yieldRemainingU = 0;
    body.hull = 0; body.alive = false;
    this._persist(body);
    this._cue(body, 'fractured', ids.length);
  },
  _detonate(body, origin) {
    const state = this.state;
    const radius = Math.max(90, num(body.radius) * 3 + 60);
    const recipients = [...state.entityList, ...queryAsteroidField(state, body.pos, radius, [])]
      .filter(e => e.alive !== false && e.pos && e.id !== body.id && Math.hypot(e.pos.x - body.pos.x, e.pos.z - body.pos.z) <= radius + num(e.radius));
    const seen = new Set();
    const pending = [];
    for (const e of recipients) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      const dx = e.pos.x - body.pos.x, dz = e.pos.z - body.pos.z;
      const distance = Math.hypot(dx, dz);
      pending.push({ ref: environmentBodyRef(e), direction: distance > 0 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 },
        fall: Math.max(0.15, 1 - distance / radius) });
    }
    (state.materialBlasts ||= []).push({ pending, origin: copy(origin), sourceId: body.id });
    body.data.cooked = true; body.data.destroyed = true;
    body.data.fuelVolatile = 0; body.fuelVolatile = 0; body.hull = 0; body.alive = false;
    this._persist(body);
    this._cue(body, 'detonated');
  },
  _drainBlasts() {
    for (const blast of this.state.materialBlasts || []) {
      const waiting = [];
      for (const p of blast.pending) {
        const body = this._resolve(p.ref, true);
        // A compact record waiting on the per-tick promotion budget is real work.
        // A retired recipient is terminal, so an old blast cannot accumulate dead
        // ids forever or strike a replacement body that later reuses the id.
        if (!body) { if (this._resolve(p.ref)) waiting.push(p); continue; }
        if (body.alive === false) continue;
        const evidence = { ...blast.origin, actorId: blast.origin?.actorId ?? blast.sourceId, tag: 'material_blast' };
        deliverPhysicalImpulse(this.state, body, { x: p.direction.x * 1280 * p.fall, z: p.direction.z * 1280 * p.fall }, evidence);
        addEnvironmentHeat(this.state, body, 64 * p.fall, evidence);
        const damage = 40 * p.fall;
        this.helpers.routeCombatDamage?.({ attackerId: evidence.actorId, targetId: body.id,
          packet: { amount: damage, channels: { explosive: damage }, flags: {} }, origin: { kind: 'material_blast' } });
      }
      blast.pending = waiting;
    }
    this.state.materialBlasts = (this.state.materialBlasts || []).filter(b => b.pending.length);
  },
  update(dt, state = this.state) {
    this.state = state;
    if (state.mode !== 'flight') return;
    this._drainBlasts();
    const waiting = [];
    let jobs = 0;
    const queue = state.materialReactions || [];
    state.materialReactions = [];
    for (const job of queue) {
      if (jobs >= 8) { waiting.push(job); continue; }
      const body = this._resolve(job, true);
      if (!body) { if (this._resolve(job)) waiting.push(job); continue; }
      if (body.alive === false) continue;
      if (body.data?.worldSiteStructural === true || ceresWorkfleetRoleForEntity(body)) continue;
      stampEnvironmentMaterial(body, job.material);
      const condition = body.data.materialCondition;
      if (isAnchoredPhysicalBody(body)) {
        condition.pending = false;
        continue;
      }
      if (condition.reacted) continue;
      condition.pending = false; condition.reacted = true; jobs++;
      if (job.material === 'crystal' || job.material === 'rock') this._fracture(body);
      else this._detonate(body, job.origin);
    }
    state.materialReactions.push(...waiting);
    this._drainBlasts();
  },
  serialize() {
    // Recipe-spawned rocks are not persistent entities: record their partial heat too.
    for (const body of [...this.state.entityList, ...(this.state.world?.asteroidField?.rocks || [])]) {
      if (body.type === 'asteroid' && body.data?.materialCondition && (body.data.materialCondition.heat > 0 || body.data.materialCondition.reacted)) this._persist(body);
    }
    return { reactions: copy(this.state.materialReactions || []), blasts: copy(this.state.materialBlasts || []) };
  },
  deserialize(data, entityIdRemap = null) {
    this.state.materialReactions = copy(Array.isArray(data?.reactions) ? data.reactions : []);
    this.state.materialBlasts = copy(Array.isArray(data?.blasts) ? data.blasts : []);
    const remap = id => id == null ? id : (entityIdRemap?.get?.(String(id)) ?? entityIdRemap?.get?.(id) ?? id);
    for (const reaction of this.state.materialReactions) {
      reaction.id = remap(reaction.id);
      if (reaction.origin) {
        reaction.origin.actorId = remap(reaction.origin.actorId);
        reaction.origin.sourceId = remap(reaction.origin.sourceId);
      }
    }
    for (const blast of this.state.materialBlasts) {
      blast.sourceId = remap(blast.sourceId);
      if (blast.origin) {
        blast.origin.actorId = remap(blast.origin.actorId);
        blast.origin.sourceId = remap(blast.origin.sourceId);
      }
      for (const pending of blast.pending || []) if (pending.ref) pending.ref.id = remap(pending.ref.id);
    }
  },
};
