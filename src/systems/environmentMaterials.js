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
import { resolveCollisionProxyManifest, proxyOuterRadiusWu, proxyScaleFor } from '../data/collisionProxyManifests.js';
import { articulatedColliderRadius } from '../core/articulatedColliderBounds.js';
import { restoreLifetime } from '../matter/aggregateLifetime.js';

// A child may acquire a measured convex skin instead of its fallback ball. Bound both;
// clearance against existing bodies below uses their actual native compound shapes.
function fragmentReach(entity) {
  const spec = resolvePhysicsBodySpec(entity);
  if (!spec) return 0;
  let reach = spec.radius;
  const proxy = resolveCollisionProxyManifest(entity);
  if (proxy) {
    reach = Math.max(reach, proxyOuterRadiusWu(proxy, entity));
    const scale = proxyScaleFor(entity, proxy);
    for (const points of [proxy.compactHull, proxy.planarPolygon, ...(proxy.convexParts || []).map(p => p.points)]) {
      for (const p of points || []) reach = Math.max(reach, Math.hypot(p.x, p.z) * scale);
    }
  } else if (spec.shape === 'capsule') reach *= 2;
  return reach;
}

function fracturePositions(state, registry, parent, pose, child, parentInertia) {
  const native = registry?.get('physics')?._sg02;
  const reach = fragmentReach(child), gap = 0.25;
  const radius = Math.max(num(parent.radius) + num(child.radius), Math.SQRT2 * reach + gap);
  if (!Number.isFinite(reach) || !(reach > 0) || !Number.isFinite(radius)) return null;
  const origin = native?._frameOrigin || { x: 0, z: 0 };
  const shape = native ? new native.RAPIER.Ball(reach + gap) : null;
  const childBody = resolvePhysicsBodySpec(child);
  const peers = [];
  const searchReach = radius + reach * 2 + gap;
  let shapes = 0;
  const entities = native ? new Set([...native.records.values()].map(r => r.entity).concat(state.entityList || [])) : state.entityList || [];
  for (const entity of entities) {
    if (entity === parent || entity.alive === false || entity.physicsBody === false || entity.collides === false) continue;
    const record = native?.records.get(entity.id);
    const colliders = record?.entity === entity && record.body.isEnabled()
      ? record.colliders.filter(c => c.isEnabled() && !c.isSensor()) : null;
    if (colliders) {
      const at = record.body.translation();
      if (Math.hypot(at.x + origin.x - pose.pos.x, at.z + origin.z - pose.pos.z) > searchReach + articulatedColliderRadius(record)) continue;
      shapes += colliders.length;
      peers.push({ colliders });
    }
    else {
      const spec = resolvePhysicsBodySpec(entity);
      if (spec && spec.material !== 'projectile' && spec.shape !== 'sensor') {
        const outer = fragmentReach(entity);
        if (Math.hypot(entity.pos.x - pose.pos.x, entity.pos.z - pose.pos.z) <= searchReach + outer) peers.push({ entity, reach: outer });
      }
    }
    if (peers.length > 64 || shapes > 256) return null;
  }
  // Keep the quartet symmetric: equal pieces retain the parent's center of mass and
  // translational momentum. Search at most three local rings, never relocate terrain.
  for (let ring = 0; ring < 3; ring++) for (let turn = 0; turn < 16; turn++) {
    const distance = radius + ring * reach * 0.5;
    // A larger represented inertia can absorb fracture energy. A smaller one would
    // gain passive kinetic energy at conserved angular momentum: choose another ring.
    if (pose.angVel && 4 * (childBody.inertiaY + childBody.mass * distance * distance) < parentInertia) continue;
    const positions = [];
    for (let i = 0; i < 4; i++) {
      const angle = pose.rot + (i + 0.5) * Math.PI / 2 + turn * Math.PI / 32;
      const pos = { x: pose.pos.x + Math.cos(angle) * distance, z: pose.pos.z + Math.sin(angle) * distance };
      const at = { x: pos.x - origin.x, y: 0, z: pos.z - origin.z };
      const blocked = peers.some(peer => peer.colliders
        ? peer.colliders.some(c => c.contactShape(shape, at, { x: 0, y: 0, z: 0, w: 1 }, 0)?.distance <= 0)
        : Math.hypot(pos.x - peer.entity.pos.x, pos.z - peer.entity.pos.z) <= reach + gap + peer.reach);
      if (blocked || positions.some(p => Math.hypot(p.x - pos.x, p.z - pos.z) <= 2 * reach + gap)) break;
      positions.push(pos);
    }
    if (positions.length === 4) return positions;
  }
  return null;
}

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
  // Gate order (crowd-cost F1): every check below the type test is a pure read, so the cheap
  // discriminators run first and the expensive material classify (tag join + regex scans for
  // unstamped bodies) runs only for pairs that can still react. The admit set is identical —
  // same predicates, same truth table — only evaluation order moved.
  if (!['asteroid', 'wreck', 'prop', 'payload', 'cargo_pod', 'pickup'].includes(entity?.type)) return false;
  if (entity.alive === false) return false;
  // A stamped substance's breakSpeed IS the impact threshold; absent it, the lowest family
  // default is 60 (volatile) so closingSpeed below this floor can never qualify.
  const breakSpeed = entity.data && entity.data.breakSpeed;
  const impactFloor = Number.isFinite(breakSpeed) ? breakSpeed : 60;
  if (!(closingSpeed >= impactFloor)) return false;
  // The Gyre field binds its aggregate through physical strikes: otherwise the first
  // bowled hull bursts the rock and ends the weapon before it can reach the next one.
  // This is impact cohesion, not material immunity; heat still cooks/fractures it.
  const gyre = state.gyreSnare;
  const held = entity?.data?.gyreCore && gyre?.coreId === entity.id
    && (gyre.phase === 'holding' || gyre.phase === 'launching');
  const flight = entity?.data?.gyreLaunched && entity.physicsBody?.impactDamageScale > 1
    && Number(entity.data.despawnAt) > Number(state.simTime)
    && Number(entity.data.gyreLaunchMeta?.holdUntilSim) > Number(state.simTime);
  // A collector's knot is bound the same way while its emitter holds it (impact cohesion, not immunity).
  const knotHeld = !!entity?.data?.collectorCore;
  if (held || flight || knotHeld) return false;
  if (isAnchoredPhysicalBody(entity)) return false;
  if (entity?.data?.worldSiteStructural === true || ceresWorkfleetRoleForEntity(entity)) return false;
  const material = environmentMaterialOf(entity);
  // Row 509/510: a stamped substance names its own break speed; the family default stands.
  const impactThreshold = Number.isFinite(breakSpeed)
    ? breakSpeed
    : (material === 'rock' ? 110 : 60);
  // Debris (wrecks) detonates through heat cook-off only, never from a kinetic impact. A fresh
  // kill's companion shard shares the victim's momentum and grazes the new wreck above the
  // impact bar, which erased the wreck — and its salvage — within a tenth of a second of the
  // kill (PQ-138.03: the wreck keeps the victim's momentum; wrecks are terrain and ammunition
  // to ricochet off, not ordnance that pops on the first bump). Heat weapons and blasts still
  // cook residual fuel off.
  if (!(closingSpeed >= impactThreshold) || !['rock', 'crystal', 'volatile', 'calcite'].includes(material)) return false;
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
      // Each body's latest provenance is read once for the pair: direction a→b preferred the
      // counterpart's record and direction b→a preferred the other way around — the identical
      // two reads the old [a,b]/[b,a] loop made unconditionally, minus its duplicate fallback
      // reads (same-tick repeat reads return the same record) and its per-emit pair arrays.
      const entities = this.state.entities;
      const a = entities.get(p.aId);
      const b = entities.get(p.bId);
      const tick = this.state.tick;
      const provA = readRecentImpulseProvenance(a, tick);
      const provB = readRecentImpulseProvenance(b, tick);
      const closingSpeed = num(p.preSolveClosingSpeed);
      const causeForA = provB || provA;
      queueEnvironmentImpact(this.state, a, closingSpeed, {
        actorId: p.actorId ?? causeForA?.actorId, weaponId: causeForA?.weaponId, tag: 'material_impact',
      });
      const causeForB = provA || provB;
      queueEnvironmentImpact(this.state, b, closingSpeed, {
        actorId: p.actorId ?? causeForB?.actorId, weaponId: causeForB?.weaponId, tag: 'material_impact',
      });
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
    // Publish the terminal owner before core can recycle this slot; both sim lanes hear this cue.
    const p = { id: body.id, type: body.type, occupantGeneration: body.occupantGeneration,
      simTime: this.state.simTime, pos: { ...body.pos }, x: body.pos.x, z: body.pos.z, radius: body.radius, material: body.data.material,
      substance: body.data.substance, vfxFamily: body.data.impactVfx, count };
    this.bus?.emit(`environment:${kind}`, p);
    this.bus?.emit(kind === 'fractured' ? 'asteroid:destroyed' : 'bomb:exploded', p);
    this.bus?.emit('emergent:audio', { id: kind === 'fractured' ? 'sfx_emergent_crumple' : 'sfx_emergent_cook', x: p.x, z: p.z, gain: 0.8, impulse: 900 });
  },
  _fracture(body) {
    if (typeof this.helpers.spawnEntity !== 'function') return false;
    const d = body.data;
    const radius = Math.max(1, num(body.radius));
    const remaining = Math.max(0, num(d.yieldRemainingU ?? d.yieldU) * (1 - Math.min(1, num(d.pctEjected))));
    const count = 4;
    const childRadius = Math.max(1, radius / Math.cbrt(count));
    const material = environmentMaterialOf(body);
    const parentBody = resolvePhysicsBodySpec(body);
    // All physical mass is represented by these four children; ore yield is a
    // separate extraction ledger, not unrepresented dust to absorb momentum.
    const childMass = parentBody.mass / count;
    const native = this.registry?.get('physics')?._sg02;
    const record = native?.records.get(body.id);
    let pose = body, parentInertia = parentBody.inertiaY;
    if (record?.entity === body && record.body.isEnabled()) {
      // A temporary mass response must end before material can be repartitioned;
      // it is not additional physical material that a fracture may mint.
      if (Math.abs(record.body.mass() - parentBody.mass) > Math.max(1e-4, parentBody.mass * 1e-5)) return false;
      const pos = record.body.worldCom(), origin = native._frameOrigin;
      const rotation = record.body.rotation();
      pose = { pos: { x: pos.x + origin.x, z: pos.z + origin.z },
        vel: record.body.linvel(), rot: -2 * Math.atan2(rotation.y, rotation.w), angVel: -record.body.angvel().y };
      parentInertia = record.body.principalInertia().y;
    } else {
      const com = parentBody.centerOfMass, c = Math.cos(num(body.rot)), s = Math.sin(num(body.rot));
      pose = { ...body, pos: { x: body.pos.x + c * com.x - s * com.z, z: body.pos.z + s * com.x + c * com.z } };
    }
    const childData = environmentSurfaceData(material, { ...d, size: childRadius });
    const childSpec = { type: 'asteroid', radius: childRadius, mass: childMass, collides: true,
      physicsBody: { radius: asteroidColliderRadius(d.typeId || 'ast_crystalline', childRadius), mass: childMass }, data: childData };
    const positions = fracturePositions(this.state, this.registry, body, pose, childSpec, parentInertia);
    if (!positions) return false;
    const childInertia = resolvePhysicsBodySpec(childSpec).inertiaY;
    const totalInertia = positions.reduce((sum, pos) => sum + childInertia
      + childMass * ((pos.x - pose.pos.x) ** 2 + (pos.z - pose.pos.z) ** 2), 0);
    const angular = num(pose.angVel) * parentInertia / totalInertia;
    const ids = [];
    // A tool's temporary hold/throw deadline is not an authored material lifetime.
    // Read the existing hand-back contract on a recipe copy, leaving the parent alone.
    const lifetime = { ttl: body.ttl, data: { ...d } };
    if (d.gyreLaunched && d.despawnAt === d.gyreLaunchMeta?.holdUntilSim) delete lifetime.data.despawnAt;
    restoreLifetime(lifetime, true, num(this.state.simTime));
    const despawnAt = Math.min(num(this.state.simTime) + 90,
      Number.isFinite(lifetime.data.despawnAt) ? lifetime.data.despawnAt : Infinity,
      Number.isFinite(lifetime.ttl) ? num(this.state.simTime) + lifetime.ttl : Infinity);
    for (let i = 0; i < count; i++) {
      const pos = positions[i], dx = pos.x - pose.pos.x, dz = pos.z - pose.pos.z;
      const child = this.helpers.spawnEntity?.({ type: 'asteroid',
        pos,
        vel: { x: num(pose.vel?.x) - angular * dz, z: num(pose.vel?.z) + angular * dx },
        rot: num(pose.rot), angVel: angular,
        radius: childRadius, mass: childMass,
        physicsBody: { radius: asteroidColliderRadius(d.typeId || 'ast_crystalline', childRadius), mass: childMass, inertiaY: childInertia },
        hull: Math.max(30, num(body.hullMax) / count), hullMax: Math.max(30, num(body.hullMax) / count),
        collides: true, flags: { persistent: true }, homeSectorId: body.homeSectorId || d.homeSectorId,
        data: environmentSurfaceData(material, { ...d, opticMaterial: undefined, opticStructureId: undefined, opticCell: undefined,
          // Rupture ends the bound aggregate. Fragments are ordinary material, never
          // new armed balls inheriting a stale core/member ledger or hold lifetime.
          gyreCore: undefined, gyreLaunched: undefined, gyreLaunchMeta: undefined, collectorCore: undefined,
          gyrePrevImpactScale: undefined, gyrePrevDespawnAt: undefined, gyrePrevTtl: undefined,
          size: childRadius, isChunk: true, materialFragment: true, fractured: true, tetherPayload: true,
          // Row 510: a break steps the ladder down one tier — the piece stays a live throwable.
          tier: Math.max(0, num(d.tier) - 1),
          substance: d.substance, impactVfx: d.impactVfx, breakSpeed: d.breakSpeed,
          yieldU: remaining / count, yieldRemainingU: remaining / count, yieldMaxU: remaining / count, pctEjected: 0,
          oreHP: Math.max(30, num(body.hullMax) / count), oreHPMax: Math.max(30, num(body.hullMax) / count),
          materialCondition: { heat: 0, reacted: true }, asteroidSlotId: `${d.asteroidSlotId ?? body.id}:shard:${i}`,
          materialFragmentOf: { ...environmentBodyRef(body), occupantGeneration: body.occupantGeneration },
          worldRecordId: undefined, resourceBodyId: undefined, despawnAt }) });
      if (child) { ids.push(child.id); this.bus?.emit('asteroid:chunked', { parentId: body.id, chunkId: child.id, massU: 0, count, pos: { x: num(body.pos?.x), z: num(body.pos?.z) } }); }
    }
    d.materialCondition.pending = false; d.materialCondition.reacted = true;
    d.fractured = true; d.destroyed = true; d.oreHP = 0; d.yieldRemainingU = 0;
    body.hull = 0; body.alive = false;
    this._persist(body);
    this._cue(body, 'fractured', ids.length);
    return true;
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
      if (Number.isFinite(job.retryAt) && state.simTime < job.retryAt) { waiting.push(job); continue; }
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
      jobs++;
      if (job.material === 'crystal' || job.material === 'rock' || job.material === 'calcite') {
        if (!this._fracture(body)) {
          job.retryAt = num(state.simTime) + 0.5;
          waiting.push(job);
          continue;
        }
      } else {
        condition.pending = false; condition.reacted = true;
        this._detonate(body, job.origin);
      }
      condition.pending = false; condition.reacted = true;
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
