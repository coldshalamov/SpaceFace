import { KILNBACK as C, KILNBACK_CASK_IDS, freshKilnbackActor, normalizeKilnbackActor,
  kilnbackCoolant, kilnbackPointPose } from '../data/kilnback.js';
import { KILNBACK_RADIUS, KILNBACK_CASK_RADIUS, kilnbackPhysicalBody, kilnbackCaskPhysicalBody,
  kilnbackCaskSocket, kilnbackMouthSocket } from '../data/kilnbackBody.js';
import { authorizeAIEngagement } from '../ai/engagementAuthority.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

const owners = new WeakMap();
const dist = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const keyFor = (key, id) => `${key}:${id}`;
const pose = e => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z, rot: e.rot || 0, spin: e.angVel || 0 });

export const kilnbackEncounter = Object.freeze({
  fire(d, live, state) {
    if (state.entityList.some(e => e.alive && e.data?.lootTableId === C.enemyId)) return d.abort(live, 'kilnback_already_live');
    live.deadlineAt = d.now() + C.encounterSeconds;
    const ids = d.spawnShips(live, live.plan.ships);
    const e = ids.map(id => state.entities.get(id)).find(e => e?.data?.lootTableId === C.enemyId);
    if (!e) return d.abort(live, 'no_kilnback_budget');
    owners.get(state)?.bind(e, live.id);
    live.phase = 'conflict';
    d.say(live, 'alert', 'KILNBACK — two finite coolant casks. Cross its charging nose or tow it into its own heat.', null,
      { literal: true, primary: true });
  },
  tick(d, live) {
    if (d.aliveCount(live) === 0) return d.resolve(live, 'cleared', { speak: false });
    if (d.now() >= live.deadlineAt) { d.despawnAll(live, 8); d.resolve(live, 'escaped', { speak: false }); }
  },
});

// Source phases/cask fates only. Existing AI/flight, field lifetime and SG-03 own actuation.
export const kilnback = {
  name: 'kilnback',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._actors = new Map(); this._bindings = new Map(); this._subs = []; this._restoring = false;
    this._introduced = false; this._nextRequest = 0; this._lastTick = -1;
    owners.set(ctx.state, this);
    const on = (event, fn) => this._subs.push(ctx.bus.on(event, fn));
    on('combat:damage', p => this._damage(p));
    on('entity:killed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id));
    on('entity:destroyed', p => this._lost(p?.id, p?.entity));
    on('save:restoring', () => { this._restoring = true; this._bindings.clear(); });
    on('save:loaded', () => this.afterContinue());
    on('fields:thermalHit', p => { if (p?.selfBurn) this._selfBurn(p); });
  },
  bind(entity, identity = null) {
    if (!entity?.alive || entity.data?.lootTableId !== C.enemyId) return null;
    const key = entity.data.kilnbackKey || `kilnback:${identity ?? entity.occupantGeneration}`;
    let row = this._actors.get(key);
    if (!row) { row = freshKilnbackActor(key, this.state.tick); this._actors.set(key, row); }
    entity.data.kilnbackKey = key; entity.data.kilnback = row;
    entity.data.weapons = []; entity.weapons = [];
    entity.data.persistenceOwner = C.persistenceOwner;
    entity.flags = { ...entity.flags, persistent: true };
    this._bindings.set(keyFor(key, 'caster'), { entity, life: entity.occupantGeneration });
    this._syncBody(entity, row);
    return row;
  },
  _find(key, id = 'caster') {
    const token = keyFor(key, id), hit = this._bindings.get(token);
    if (hit && this.state.entities.get(hit.entity.id) === hit.entity && hit.entity.alive
      && hit.entity.occupantGeneration === hit.life) return hit.entity;
    this._bindings.delete(token);
    let found = null;
    for (const e of this.state.entityList) if (e.alive && e.data?.kilnbackKey === key
      && (e.data.kilnbackCaskId || 'caster') === id && e.data.persistenceOwner === C.persistenceOwner) {
      if (found) return null; found = e;
    }
    if (found) this._bindings.set(token, { entity: found, life: found.occupantGeneration });
    return found;
  },
  _native(e) {
    const p = this.ctx.registry?.get('physics'), r = p?._sg02?.records.get(e?.id);
    return !p?._nativeRestorePending && !p?._nativeRestoreDeferred && r?.entity === e && r.body && physicsBodyNativeReady(e) ? r : null;
  },
  _ready(e) { return this.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic' || !!this._native(e); },
  _attached(row) { return KILNBACK_CASK_IDS.filter(id => row.casks[id].status === 'attached'); },
  _syncBody(e, row) {
    const body = kilnbackPhysicalBody(this._attached(row), row.bodyRevision);
    if (e.physicsBody?.collisionProxyManifest?.id === body.collisionProxyManifest.id && e.physicsBody?.revision === body.revision) return;
    e.physicsBody = body; e.mass = body.mass; e.radius = KILNBACK_RADIUS;
    if (e.flightModel) { e.flightModel.mass = body.mass; e.flightModel.inertia = body.inertiaY; }
    if (e.data?.derived?.flightModel) { e.data.derived.flightModel.mass = body.mass; e.data.derived.flightModel.inertia = body.inertiaY; }
  },
  _releaseReady(e) {
    if (this.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return true;
    const p = this.ctx.registry?.get('physics'); if (!p?._sg02 || p._nativeRestorePending || p._nativeRestoreDeferred) return false;
    if (!e) {
      for (const r of p._sg02.records.values()) if (r.entity?.data?.kilnbackKey
        && !r.entity.data.kilnbackCaskId && r.entity.data.persistenceOwner === C.persistenceOwner) return false;
      return true;
    }
    const r = this._native(e); return !!r && r.proxyId === e.physicsBody.collisionProxyManifest.id && r.revision === e.physicsBody.revision;
  },
  sever(key, id) {
    const row = this._actors.get(key), cask = row?.casks[id], e = this._find(key);
    if (!e || cask?.status !== 'attached') return { ok: false, reason: 'cask_not_attached' };
    cask.pose = kilnbackPointPose(e, kilnbackCaskSocket(id), this._native(e)?.body);
    cask.status = 'releasing'; row.bodyRevision++; this._syncBody(e, row);
    this._cue(e, row, 'CASK FREE — tow the loose tank, then rupture it to lay a local coolant patch.');
    this.bus.emit('kilnback:caskReleased', { sourceKey: key, caskId: id, revision: row.bodyRevision, tick: this.state.tick });
    return { ok: true };
  },
  _materialize(row) {
    const caster = this._find(row.key); if (caster) this._syncBody(caster, row);
    for (const id of KILNBACK_CASK_IDS) {
      const cask = row.casks[id]; if (!['releasing', 'drifting'].includes(cask.status) || this._find(row.key, id)) continue;
      if (cask.status === 'releasing' && !this._releaseReady(caster)) continue;
      if (!cask.pose || !(cask.hull > 0)) { cask.status = 'destroyed'; continue; }
      const p = cask.pose;
      const e = this.helpers.spawnEntity({ type: 'payload', team: 1, factionId: 'faction_reach',
        pos: { x: p.x, z: p.z }, vel: { x: p.vx, z: p.vz }, rot: p.rot, angVel: p.spin,
        mass: kilnbackCaskPhysicalBody(id).mass, radius: KILNBACK_CASK_RADIUS, hull: cask.hull, hullMax: C.caskHull,
        flags: { persistent: true }, physicsBody: kilnbackCaskPhysicalBody(id),
        data: { kilnbackKey: row.key, kilnbackCaskId: id, persistenceOwner: C.persistenceOwner,
          identityKey: keyFor(row.key, id), worldRecordId: keyFor(row.key, id), authoredAssetId: 'SF_PROP_KILNBACK_CASK',
          name: cask.coolant > 0 ? 'Kilnback coolant cask' : 'Kilnback empty cask', scannable: true,
          scanLabel: cask.coolant > 0 ? 'Towable coolant · rupture for a four-second local patch' : 'Empty original cask',
          lifetimeS: Infinity, salvagePool: {}, authoredSalvagePool: {} } });
      if (e) { cask.status = 'drifting'; this._bindings.set(keyFor(row.key, id), { entity: e, life: e.occupantGeneration }); }
    }
  },
  _damage(p) {
    const e = this.state.entities.get(p?.targetId), row = this._actors.get(e?.data?.kilnbackKey);
    if (!row || !(p.hullDamage > 0)) return;
    const id = e.data.kilnbackCaskId;
    if (id) { row.casks[id].hull = e.hull; return; }
    if (!p.pos || row.phase === 'lost') return;
    let hit = null, nearest = KILNBACK_CASK_RADIUS + 1;
    for (const cid of this._attached(row)) {
      const d = dist(p.pos, kilnbackPointPose(e, kilnbackCaskSocket(cid)));
      if (d < nearest) { hit = cid; nearest = d; }
    }
    if (hit) { const c = row.casks[hit]; c.collar = Math.max(0, c.collar - p.hullDamage); if (!c.collar) this.sever(row.key, hit); }
  },
  _coolant(row, id, position) {
    const cask = row.casks[id]; if (cask.fieldCreated || !(cask.coolant > 0)) return;
    // Reserve once before synchronous field/event callbacks. A failed deploy cannot refill the tank.
    cask.fieldCreated = true; cask.coolant = 0;
    const f = this.ctx.registry?.get('fields')?.registerThermal({ id: `${keyFor(row.key, id)}:coolant`,
      kind: 'well', center: { x: position.x, z: position.z }, radius: C.coolantRadius, durationS: C.coolantSeconds,
      thermal: { family: 'kilnback', kind: 'coolant', sourceKey: row.key } });
    this.bus.emit('kilnback:coolantReleased', { sourceKey: row.key, caskId: id, fieldId: f?.id ?? null, tick: this.state.tick });
    if (f) this.bus.emit('toast', { text: 'COOLANT PATCH — local furnace heat suppressed for four seconds.', kind: 'info', ttl: 4 });
  },
  _lost(entityId, supplied = null) {
    if (this._restoring) return;
    const e = supplied || this.state.entities.get(entityId), row = this._actors.get(e?.data?.kilnbackKey);
    if (!row || (this.state.entities.get(entityId) !== e && !supplied)) return;
    const id = e.data.kilnbackCaskId;
    const binding = this._bindings.get(keyFor(row.key, id || 'caster'));
    if (binding && (binding.entity !== e || binding.life !== e.occupantGeneration)) return;
    const killed = e.alive === false || e.hull <= 0;
    if (id) {
      const c = row.casks[id]; if (['spent', 'destroyed'].includes(c.status)) return;
      c.pose = pose(e); c.hull = 0; c.status = killed ? 'spent' : 'destroyed';
      if (killed) this._coolant(row, id, e.pos); else c.coolant = 0;
    } else if (row.phase !== 'lost') {
      row.phase = 'lost';
      for (const cid of this._attached(row)) { const c = row.casks[cid];
        c.pose = kilnbackPointPose(e, kilnbackCaskSocket(cid), this._native(e)?.body);
        c.status = killed ? 'releasing' : 'destroyed'; if (!killed) c.coolant = 0; }
      row.bodyRevision++;
    }
    this._bindings.delete(keyFor(row.key, id || 'caster'));
  },
  _cue(e, row, text) {
    this.bus.emit('kilnback:phase', { entityId: e.id, sourceKey: row.key, phase: row.phase,
      phaseStartTick: row.phaseStartTick, coolant: kilnbackCoolant(row), aimAngle: row.aimAngle, tick: this.state.tick });
    this.bus.emit('toast', { text, kind: 'warn', ttl: 2.5 });
  },
  _phase(e, row, phase) {
    row.phase = phase; row.phaseStartTick = this.state.tick;
    const text = phase === 'preheat' ? 'FURNACE CHARGING — cross its nose; its aim is committed.'
      : phase === 'burn' ? 'HEAT LANE — use cover or pull the furnace into its own expelled heat.'
      : phase === 'vent' ? 'VENT OPEN — long recovery; the cask collars are exposed.'
      : 'COOLANT EMPTY — the furnace is retreating.';
    this._cue(e, row, text);
  },
  _selfBurn(p) {
    const row = this._actors.get(p.sourceKey), e = this._find(p.sourceKey);
    if (!row || !e || row.selfBurnAttack === p.attackId) return;
    row.selfBurnAttack = p.attackId;
    this.bus.emit('toast', { text: 'BURNBACK — its own expelled heat is hitting the furnace.', kind: 'info', ttl: 2 });
  },
  _drive(e, row) {
    if (row.phase === 'lost' || !this._ready(e)) return;
    const tick = this.state.tick, target = this.state.entities.get(row.targetId ?? this.state.playerId);
    const visible = target?.alive && dist(e.pos, target.pos) <= C.sightRange
      && witnessLineOfSight(this.state, e, target.pos, [target.id]);
    if (row.phase === 'approach') {
      if (visible) row.aimPoint = { ...target.pos };
      if (!kilnbackCoolant(row)) return this._phase(e, row, 'retreat');
      if (!visible || dist(e.pos, target.pos) > C.acquireRange) return;
      const authority = authorizeAIEngagement({ state: this.state, self: e, target,
        objectiveReason: 'combat_doctrine:brawler_commit:commit' });
      if (!authority.ok) return;
      row.targetId = target.id; row.targetLife = target.occupantGeneration;
      row.aimAngle = Math.atan2(target.pos.z - e.pos.z, target.pos.x - e.pos.x);
      row.attack++; row.pulse = 0; return this._phase(e, row, 'preheat');
    }
    if (row.phase === 'preheat' && tick - row.phaseStartTick >= C.preheatTicks) {
      if (!kilnbackCoolant(row)) return this._phase(e, row, 'retreat');
      let cost = 1;
      for (const id of KILNBACK_CASK_IDS) { const c = row.casks[id];
        if (c.status === 'attached') { const used = Math.min(cost, c.coolant); c.coolant -= used; cost -= used; } }
      this._phase(e, row, 'burn');
    }
    if (row.phase === 'burn') {
      const age = tick - row.phaseStartTick;
      if (age >= C.burnTicks) return this._phase(e, row, 'vent');
      const due = Math.min(6, Math.floor(age / C.pulseTicks) + 1);
      if (row.pulse >= due) return;
      // Consume the pulse even if its real lane is now blocked/revoked. No delayed surprise salvo.
      row.pulse = due;
      if (!visible || target.occupantGeneration !== row.targetLife || !authorizeAIEngagement({ state: this.state,
        self: e, target, objectiveReason: 'combat_doctrine:brawler_commit:commit' }).ok) return;
      const fields = this.ctx.registry?.get('fields'), mouth = kilnbackPointPose(e, kilnbackMouthSocket(), this._native(e)?.body);
      if (fields?.thermalPointCooled(mouth)) return;
      fields?.registerThermal({ id: `${row.key}:heat:${row.attack}:${due}`, kind: 'cone', center: { x: mouth.x, z: mouth.z },
        dir: { x: Math.cos(e.rot || 0), z: Math.sin(e.rot || 0) }, radius: C.range, halfAngleRad: C.halfAngle,
        edgeSoftRad: 0, durationS: C.pulseSeconds, ownerId: e.id,
        thermal: { family: 'kilnback', kind: 'burn', sourceKey: row.key, ownerLife: e.occupantGeneration,
          attackId: `${row.key}:attack:${row.attack}`, damagePerSecond: C.damagePerSecond, heatPerSecond: C.heatPerSecond } });
    } else if (row.phase === 'vent' && tick - row.phaseStartTick >= C.ventTicks) {
      if (!kilnbackCoolant(row)) return this._phase(e, row, 'retreat');
      row.phase = 'approach'; row.phaseStartTick = tick;
    }
  },
  _introduce() {
    const s = this.state, player = s.entities.get(s.playerId);
    if (this._introduced || !player?.alive || s.simTime < C.earliestSeconds || s.simTime < this._nextRequest
      || s.world?.currentSectorId !== C.sectorId || s.ui?.docked || !this.ctx.registry?.get('scissorwake')?.serialize()?.introduced
      || s.entityList.some(e => e.alive && ['scissorwake', C.enemyId].includes(e.data?.lootTableId))) return;
    this._nextRequest = s.simTime + 5;
    const result = this.ctx.registry?.get('encounterDirector')?.requestAuthoredEncounter({ shapeId: C.encounterId,
      encounterId: 'kilnback:first-furnace', sectorId: C.sectorId,
      anchor: { x: player.pos.x + 360, z: player.pos.z + 120 }, respectPacing: true });
    if (result?.ok) this._introduced = true;
  },
  update(_dt, state) {
    if (this._restoring || state.mode !== 'flight' || state.tick === this._lastTick
      || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')) return;
    this._lastTick = state.tick;
    for (const e of state.entityList) if (e.alive && e.data?.lootTableId === C.enemyId && !e.data.kilnbackCaskId) this.bind(e);
    for (const row of this._actors.values()) {
      this._materialize(row); const e = this._find(row.key); if (e) this._drive(e, row);
      for (const id of KILNBACK_CASK_IDS) { const c = this._find(row.key, id); if (c) { row.casks[id].pose = pose(c); row.casks[id].hull = c.hull; } }
    }
    this._introduce();
  },
  serialize() { return { revision: 1, introduced: this._introduced, actors: [...this._actors.values()].map(r => structuredClone(r)) }; },
  deserialize(raw, remap = new Map()) {
    this._actors.clear(); this._bindings.clear(); this._introduced = raw?.introduced === true;
    for (const saved of (raw?.actors || []).slice(0, 12)) if (typeof saved.key === 'string') {
      const row = normalizeKilnbackActor(saved, saved.key, this.state.tick);
      row.targetId = remap.get(String(row.targetId)) ?? row.targetId;
      row.targetLife = this.state.entities.get(row.targetId)?.occupantGeneration ?? null;
      this._actors.set(row.key, row);
    }
    this._nextRequest = 0; this._lastTick = -1;
  },
  afterContinue() {
    this._restoring = false; this._bindings.clear(); this._lastTick = -1;
    for (const row of this._actors.values()) { const e = this._find(row.key); if (e) { e.data.kilnback = row; this._syncBody(e, row); }
      row.targetLife = this.state.entities.get(row.targetId)?.occupantGeneration ?? null; }
  },
  newGame() { this.deserialize(null); this._restoring = false; },
  destroy() { for (const off of this._subs) off(); owners.delete(this.state); this._bindings.clear(); },
};

export function kilnbackPresentation(state, entity) {
  const owner = owners.get(state), row = owner?._actors.get(entity?.data?.kilnbackKey);
  if (!row || entity !== owner._find(row.key, entity.data.kilnbackCaskId || 'caster')) return null;
  const r = owner._native(entity);
  return { phase: row.phase, phaseStartTick: row.phaseStartTick, tick: state.tick, coolant: kilnbackCoolant(row),
    attachedCaskIds: owner._attached(row), casks: structuredClone(row.casks), aimAngle: row.aimAngle,
    attack: row.attack, pulse: row.pulse, nativeBodyReady: !!r && r.proxyId === entity.physicsBody?.collisionProxyManifest?.id
      && r.revision === entity.physicsBody?.revision };
}
