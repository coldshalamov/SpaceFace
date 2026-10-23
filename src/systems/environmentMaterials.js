import { environmentMaterialOf, stampEnvironmentMaterial, environmentSurfaceData, CRYO_QUENCH } from '../data/environmentMaterials.js';
import { applyRockSubstance, rockSubstanceForSlot, rockTierForRadius } from '../data/rockSubstances.js';
import { resolveSectorVisualProfile } from '../data/sectorVisualProfiles.js';
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
  if (material === 'calcite') return 42;
  if (material === 'crystal') return 48;
  if (material === 'volatile') return 36;
  // RW-04: a cryo rock drained as a heat sink has no cold left to hold together — it cracks
  // through the same fracture owner as crystal, only when the quench spent it.
  if (material === 'cryo') return CRYO_QUENCH.fractureHeat;
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
  // Row 509/510: a stamped substance names its own break speed; the family default stands.
  const impactThreshold = Number.isFinite(entity?.data?.breakSpeed)
    ? entity.data.breakSpeed
    : (material === 'rock' ? 110 : 60);
  // Debris (wrecks) detonates through heat cook-off only, never from a kinetic impact. A fresh
  // kill's companion shard shares the victim's momentum and grazes the new wreck above the
  // impact bar, which erased the wreck — and its salvage — within a tenth of a second of the
  // kill (PQ-138.03: the wreck keeps the victim's momentum; wrecks are terrain and ammunition
  // to ricochet off, not ordnance that pops on the first bump). Heat weapons and blasts still
  // cook residual fuel off.
  if (!entity || entity.alive === false || !(closingSpeed >= impactThreshold) || !['rock', 'crystal', 'volatile', 'calcite'].includes(material)) return false;
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
    const p = { id: body.id, pos: { ...body.pos }, x: body.pos.x, z: body.pos.z, radius: body.radius, material: body.data.material,
      substance: body.data.substance, vfxFamily: body.data.impactVfx, count };
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
          // Row 510: a break steps the ladder down one tier — the piece stays a live throwable.
          tier: Math.max(0, num(d.tier) - 1),
          substance: d.substance, impactVfx: d.impactVfx, breakSpeed: d.breakSpeed,
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
    // Rows 509/510: substance behaviours tick on a slow cadence — sunlight melts ice mass and a
    // survival arena restocks ammunition instead of running dry. 90 ticks ≈ 1.5 s at 60 Hz.
    if (((this._substanceTick = (this._substanceTick || 0) + 1) % 90) === 0) this._tickRockSubstance(state);
    this._drainBlasts();
    // Scratch `waiting` + in-place drain: the old shape allocated a fresh live queue and a
    // spill array every flight tick. Reactions queued mid-drain (queueMaterialReaction inside
    // _fracture/_detonate) appended to the replacement array before — now they append past
    // `drained`, so the copyWithin shift leaves them ahead of the leftovers either way.
    const waiting = this._reactionWaiting || (this._reactionWaiting = []);
    waiting.length = 0;
    let jobs = 0;
    const queue = state.materialReactions || (state.materialReactions = []);
    const drained = queue.length;
    for (let i = 0; i < drained; i++) {
      const job = queue[i];
      if (jobs >= 8) { waiting.push(job); continue; }
      const body = this._resolve(job, true);
      if (!body) { if (this._resolve(job)) waiting.push(job); continue; }
      if (body.alive === false) continue;
      if (isAnchoredPhysicalBody(body) || body.data?.worldSiteStructural === true || ceresWorkfleetRoleForEntity(body)) {
        // Retirement must release the admission latch without restamping protected
        // scenery from an old queued recipe. A later unanchored body can react again.
        if (body.data?.materialCondition) body.data.materialCondition.pending = false;
        continue;
      }
      stampEnvironmentMaterial(body, job.material);
      const condition = body.data.materialCondition;
      if (condition.reacted) continue;
      condition.pending = false; condition.reacted = true; jobs++;
      if (job.material === 'crystal' || job.material === 'rock' || job.material === 'calcite') this._fracture(body);
      else this._detonate(body, job.origin);
    }
    queue.copyWithin(0, drained);
    queue.length -= drained;
    for (let i = 0; i < waiting.length; i++) queue.push(waiting[i]);
    this._drainBlasts();
  },

  /**
   * Row 509 — ice sublimates in sunlight: a `sublimatesPerS` asteroid sheds a live fraction of
   * its mass while the sector reads sunlit, and evaporates outright under 15% of its spawn mass.
   * Row 510 — a survival arena never runs dry: fewer than THROWABLE_FLOOR tetherable bodies in
   * the play radius restocks the ring with substance-stamped ammunition.
   */
  _tickRockSubstance(state) {
    // The sector record lives at world.sectors[world.currentSectorId]; state.sector / state.sectorId are not set in production.
    const world = state.world;
    const sector = (world && world.sectors && world.sectors[world.currentSectorId]) || state.sector || null;
    const profile = sector ? resolveSectorVisualProfile(sector) : null;
    const sunlit = !!(profile && profile.lighting && Number(profile.lighting.key) >= 3.0);
    const now = num(state.simTime);
    if (sunlit) {
      for (const body of state.entityList || []) {
        if (!body || body.type !== 'asteroid' || body.alive === false) continue;
        const d = body.data || {};
        const rate = num(d.sublimatesPerS);
        if (!(rate > 0)) continue;
        const spawnMass = Number.isFinite(d.spawnMass) ? d.spawnMass : (d.spawnMass = num(body.mass, 1));
        body.mass = Math.max(1, num(body.mass, 1) * (1 - rate * 1.5));
        if (Number.isFinite(body.radius) && body.radius > 1) body.radius = Math.max(1, body.radius * Math.sqrt(body.mass / spawnMass) ** 0.5);
        if (body.physicsBody && Number.isFinite(body.physicsBody.mass)) body.physicsBody.mass = body.mass;
        if (body.mass <= spawnMass * 0.15) d.despawnAt = now;
      }
    }
    // Restock: only a live survival run owes the floor; open flight keeps ambient fields.
    if (!(state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive')) return;
    // state.player is the metadata record (no position); the flying ship is the entity it points at.
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || typeof this.helpers?.spawnEntity !== 'function') return;
    const PLAY_RADIUS = 800, FLOOR = 6;
    let live = 0;
    for (const body of state.entityList || []) {
      if (!body || body.alive === false || body.type !== 'asteroid') continue;
      if (!(body.data && (body.data.tetherPayload || body.data.terrainAnchor || body.data.isChunk))) continue;
      if (Math.hypot(body.pos.x - player.pos.x, body.pos.z - player.pos.z) <= PLAY_RADIUS) live++;
    }
    if (live >= FLOOR) return;
    const want = FLOOR - live;
    const seed = (state.meta && state.meta.seed) || 1;
    for (let i = 0; i < want; i++) {
      const bearing = (i * 2.4 + live) + (num(state.tick) % 60) * 0.017;
      const dist = PLAY_RADIUS * 0.75;
      const radius = 14 + ((i + live) % 3) * 6;
      const subId = rockSubstanceForSlot(seed, 'restock', i + num(state.tick));
      const data = {
        typeId: 'ast_common_rock', size: radius, tier: rockTierForRadius(radius),
        terrainAnchor: true, tetherPayload: true, restock: true,
        oreHP: 360, oreHPMax: 360, yieldU: 6, despawnAt: now + 120,
      };
      const density = applyRockSubstance(data, subId);
      this.helpers.spawnEntity({
        type: 'asteroid',
        homeSectorId: player.homeSectorId || (player.data && player.data.homeSectorId) || null,
        pos: { x: player.pos.x + Math.cos(bearing) * dist, z: player.pos.z + Math.sin(bearing) * dist },
        vel: { x: 0, z: 0 },
        radius,
        mass: Math.round(radius * radius * 40 * density),
        angVel: 0.04,
        hull: 360, hullMax: 360,
        collides: true,
        physicsBody: { radius: asteroidColliderRadius('ast_common_rock', radius) },
        data,
      });
    }
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
