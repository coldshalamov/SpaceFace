import { KILNBACK as C, KILNBACK_CASK_IDS, freshKilnbackActor, normalizeKilnbackActor,
  kilnbackCoolant, kilnbackPointPose, kilnbackFlightModel } from '../data/kilnback.js';
import { KILNBACK_RADIUS, KILNBACK_CASK_RADIUS, kilnbackPhysicalBody, kilnbackCaskPhysicalBody,
  kilnbackCaskSocket, kilnbackMouthSocket } from '../data/kilnbackBody.js';
import { authorizeAIEngagement } from '../ai/engagementAuthority.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';
import { hasExplicitPickupAcceptance, resolvePickupAcceptance } from '../core/pickupAcceptance.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

const owners = new WeakMap();
const dist = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const keyFor = (key, id) => `${key}:${id}`;
const pose = e => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z, rot: e.rot || 0, spin: e.angVel || 0 });

export const kilnbackEncounter = Object.freeze({
  fire(d, live, state) {
    const owner = owners.get(state);
    if (!owner || !owner._eligible()) return d.abort(live, 'kilnback_not_eligible');
    if (state.entityList.some(e => e.alive && e.data?.lootTableId === C.enemyId)) return d.abort(live, 'kilnback_already_live');
    if (owner._introduced) return d.abort(live, 'kilnback_introduction_complete');
    live.deadlineAt = d.now() + C.encounterSeconds;
    const ids = d.spawnShips(live, live.plan.ships);
    const e = ids.map(id => state.entities.get(id)).find(e => e?.data?.lootTableId === C.enemyId);
    if (!e) return d.abort(live, 'no_kilnback_budget');
    if (!owner.bind(e, live.id)) return d.abort(live, 'kilnback_source_not_bound');
    owner._introduced = true;
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
    this._actors = new Map(); this._bodyCache = new WeakMap(); this._bindings = new Map(); this._pendingCollections = new Map(); this._subs = []; this._restoring = false;
    this._introduced = false; this._nextRequest = 0; this._lastTick = -1;
    owners.set(ctx.state, this);
    const on = (event, fn) => this._subs.push(ctx.bus.on(event, fn));
    on('pickup:collected', p => {
      const e = this.state.entities.get(p?.pickupId);
      if (e?.data?.persistenceOwner === C.persistenceOwner && e.data.kilnbackCaskId)
        this._pendingCollections.set(e, { payload: p, life: e.occupantGeneration });
    });
    on('combat:damage', p => this._damage(p));
    on('entity:killed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id));
    on('entity:destroyed', p => this._lost(p?.id, p?.entity));
    on('save:restoring', () => { this._restoring = true; this._bindings.clear(); this._pendingCollections.clear(); });
    on('save:loaded', () => this.afterContinue());
    on('fields:thermalHit', p => { if (p?.selfBurn) this._selfBurn(p); });
  },
  bind(entity, identity = null) {
    if (!entity?.alive || entity.data?.lootTableId !== C.enemyId) return null;
    const key = entity.data.kilnbackKey || `kilnback:${identity ?? entity.occupantGeneration}`;
    let row = this._actors.get(key);
    const prior = this._bindings.get(keyFor(key, 'caster'));
    if (row?.phase === 'lost' || (prior && (prior.entity !== entity || prior.life !== entity.occupantGeneration))) return null;
    if (!row) { row = freshKilnbackActor(key, this.state.tick); this._actors.set(key, row); }
    entity.data.kilnbackKey = key; entity.data.kilnback = row;
    entity.data.weapons = []; entity.weapons = [];
    entity.data.persistenceOwner = C.persistenceOwner;
    entity.flags = { ...entity.flags, persistent: true };
    this._bindings.set(keyFor(key, 'caster'), { entity, life: entity.occupantGeneration });
    this._syncBody(entity, row);
    return row;
  },
  _find(key, id = 'caster', allowTerminal = false) {
    const row = this._actors.get(key);
    if (!allowTerminal && row && (id === 'caster' ? row.phase === 'lost' : !['releasing', 'drifting'].includes(row.casks[id]?.status))) return null;
    const token = keyFor(key, id), hit = this._bindings.get(token);
    if (hit && this.state.entities.get(hit.entity.id) === hit.entity && hit.entity.alive
      && hit.entity.occupantGeneration === hit.life) return hit.entity;
    // A live-life binding cannot migrate to a recycled id/object. Continue explicitly clears bindings.
    if (hit) return null;
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
  _nativeSolved(e) {
    const native = this.ctx.registry?.get('physics')?._sg02, r = this._native(e);
    const age = this.state.tick - native?._simTick;
    return !!r && r._postStepReadTick === native.tick && Number.isInteger(native._simTick)
      && age >= 0 && age <= 2 && r.proxyId === e.physicsBody?.collisionProxyManifest?.id
      && r.revision === e.physicsBody?.revision;
  },
  _ready(e) { return this.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic' || this._nativeSolved(e); },
  _attached(row) { return KILNBACK_CASK_IDS.filter(id => row.casks[id].status === 'attached'); },
  _syncBody(e, row) {
    const attached = this._attached(row), bitmap = attached.join(','), cached = this._bodyCache.get(row);
    const body = cached?.revision === row.bodyRevision && cached.bitmap === bitmap ? cached.body
      : kilnbackPhysicalBody(attached, row.bodyRevision);
    if (cached?.body !== body) this._bodyCache.set(row, { bitmap, revision: row.bodyRevision, body });
    const model = e.flightModel;
    if (e.physicsBody?.collisionProxyManifest?.id === body.collisionProxyManifest.id
      && e.physicsBody?.revision === body.revision && model?.mass === body.mass && model.inertia === body.inertiaY
      && model.maxSpeed === 45 && model.maxYawRate === .55 && Math.abs(model.mainAccel * body.mass - 3240) < 1e-8) return;
    e.flightModel = kilnbackFlightModel(body, e.flightModel);
    if (e.data?.derived) e.data.derived.flightModel = kilnbackFlightModel(body, e.data.derived.flightModel);
    if (e.physicsBody?.collisionProxyManifest?.id === body.collisionProxyManifest.id && e.physicsBody?.revision === body.revision) return;
    e.physicsBody = body; e.mass = body.mass; e.radius = KILNBACK_RADIUS;
    if (e.flightModel) { e.flightModel.mass = body.mass; e.flightModel.inertia = body.inertiaY; }
    if (e.data?.derived?.flightModel) { e.data.derived.flightModel.mass = body.mass; e.data.derived.flightModel.inertia = body.inertiaY; }
  },
  _releaseReady(e, key) {
    if (this.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return true;
    const p = this.ctx.registry?.get('physics'); if (!p?._sg02 || p._nativeRestorePending || p._nativeRestoreDeferred) return false;
    if (!e) {
      for (const r of p._sg02.records.values()) if (r.entity?.data?.kilnbackKey === key
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
      const cask = row.casks[id]; if (cask.status !== 'releasing' || this._find(row.key, id)) continue;
      if (!this._releaseReady(caster, row.key)) continue;
      if (!cask.pose || !(cask.hull > 0)) { cask.status = 'destroyed'; continue; }
      const p = cask.pose;
      if (!row.rewardCaskId && !row.rewardClaimed && cask.coolant > 0) row.rewardCaskId = id;
      const pool = row.rewardCaskId === id && !row.rewardClaimed && cask.coolant > 0 ? { cmdty_fuel_cells: 1 } : {};
      const e = this.helpers.spawnEntity({ type: 'payload', team: 1, factionId: 'faction_reach',
        pos: { x: p.x, z: p.z }, vel: { x: p.vx, z: p.vz }, rot: p.rot, angVel: p.spin,
        mass: kilnbackCaskPhysicalBody(id).mass, radius: KILNBACK_CASK_RADIUS, hull: cask.hull, hullMax: C.caskHull,
        flags: { persistent: true }, physicsBody: kilnbackCaskPhysicalBody(id),
        data: { kilnbackKey: row.key, kilnbackCaskId: id, persistenceOwner: C.persistenceOwner,
          identityKey: keyFor(row.key, id), worldRecordId: keyFor(row.key, id), authoredAssetId: 'SF_PROP_KILNBACK_CASK',
          authoredPayloadAssetId: 'SF_PROP_KILNBACK_CASK',
          name: cask.coolant > 0 ? 'Kilnback coolant cask' : 'Kilnback empty cask', scannable: true,
          scanLabel: cask.coolant > 0 ? 'Towable coolant · rupture for a four-second local patch' : 'Empty original cask',
          lifetimeS: Infinity, commodityId: 'cmdty_fuel_cells', amount: Object.keys(pool).length,
          salvagePool: { ...pool }, authoredSalvagePool: { ...pool } } });
      if (e) { cask.status = 'drifting'; this._bindings.set(keyFor(row.key, id), { entity: e, life: e.occupantGeneration }); }
    }
  },
  _damage(p) {
    const e = this.state.entities.get(p?.targetId), row = this._actors.get(e?.data?.kilnbackKey);
    if (!row || !(p.hullDamage > 0)) return;
    const id = e.data.kilnbackCaskId;
    // Damage is delivered before kill/wreck listeners. Remove original cask mass before
    // those owners snapshot the core, so a death cannot mint parent + detached cargo.
    if (e.hull <= 0) { this._lost(e.id, e); return; }
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
  _settleCollections() {
    for (const [e, pending] of this._pendingCollections) {
      const p = pending.payload, row = this._actors.get(e.data?.kilnbackKey), id = e.data?.kilnbackCaskId;
      if (row && e.occupantGeneration === pending.life && row.rewardCaskId === id && !row.rewardClaimed
        && p.collectorId === this.state.playerId && p.commodityId === 'cmdty_fuel_cells'
        && hasExplicitPickupAcceptance(p) && resolvePickupAcceptance(p, 1).accepted === 1) {
        row.rewardClaimed = true; row.casks[id].status = 'collected'; row.casks[id].coolant = 0;
        e.data.salvagePool = {}; e.data.amount = 0; e.alive = false;
        this._bindings.delete(keyFor(row.key, id));
        this.bus.emit('kilnback:caskSalvaged', { sourceKey: row.key, caskId: id, tick: this.state.tick });
      }
      if (hasExplicitPickupAcceptance(p)) this._pendingCollections.delete(e);
    }
  },
  _lost(entityId, supplied = null) {
    if (this._restoring) return;
    this._settleCollections();
    const e = supplied || this.state.entities.get(entityId), row = this._actors.get(e?.data?.kilnbackKey);
    if (!row || (this.state.entities.get(entityId) !== e && !supplied)) return;
    const id = e.data.kilnbackCaskId;
    const binding = this._bindings.get(keyFor(row.key, id || 'caster'));
    if (binding && (binding.entity !== e || binding.life !== e.occupantGeneration)) return;
    const killed = e.hull <= 0;
    if (id) {
      const c = row.casks[id]; if (['spent', 'destroyed', 'collected'].includes(c.status)) return;
      c.pose = pose(e); c.hull = 0; c.status = killed ? 'spent' : 'destroyed';
      if (killed) this._coolant(row, id, e.pos); else c.coolant = 0;
    } else if (row.phase !== 'lost') {
      row.phase = 'lost';
      for (const cid of this._attached(row)) { const c = row.casks[cid];
        c.pose = kilnbackPointPose(e, kilnbackCaskSocket(cid), this._native(e)?.body);
        c.status = killed ? 'releasing' : 'destroyed'; if (!killed) c.coolant = 0; }
      row.bodyRevision++; this._syncBody(e, row);
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
      // Severing both originals shuts off new heat immediately; emitted lanes retain their finite life.
      if (!this._attached(row).length) return this._phase(e, row, 'retreat');
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
  _eligible() {
    const s = this.state;
    return s.mode === 'flight' && s.entities.get(s.playerId)?.alive && s.simTime >= C.earliestSeconds
      && s.world?.currentSectorId === C.sectorId && !s.ui?.docked
      && !(s.run?.kind === 'survival' && s.run.phase !== 'inactive')
      && this.ctx.registry?.get('scissorwake')?.serialize()?.introduced === true
      && !s.entityList.some(e => e.alive && e.data?.lootTableId === 'scissorwake');
  },
  _introduce() {
    const s = this.state, player = s.entities.get(s.playerId);
    if (this._introduced || !this._eligible() || s.simTime < this._nextRequest
      || s.entityList.some(e => e.alive && e.data?.lootTableId === C.enemyId)) return;
    this._nextRequest = s.simTime + 5;
    this.ctx.registry?.get('encounterDirector')?.requestAuthoredEncounter({ shapeId: C.encounterId,
      encounterId: 'kilnback:first-furnace', sectorId: C.sectorId,
      anchor: { x: player.pos.x + 360, z: player.pos.z + 120 }, respectPacing: true });
    // The accepted live actor in fire(), rather than a nominal request, owns the one-time receipt.
  },
  update(_dt, state) {
    if (this._restoring || state.mode !== 'flight' || state.tick === this._lastTick
      || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')) return;
    this._lastTick = state.tick; this._settleCollections();
    for (const e of state.entityList) if (e.alive && e.data?.lootTableId === C.enemyId && !e.data.kilnbackCaskId) this.bind(e);
    for (const row of this._actors.values()) {
      for (const id of KILNBACK_CASK_IDS) if (row.casks[id].status === 'drifting' && !this._find(row.key, id)) {
        row.casks[id].status = 'destroyed'; row.casks[id].coolant = 0;
      }
      this._materialize(row); const e = this._find(row.key); if (e) this._drive(e, row);
      for (const id of KILNBACK_CASK_IDS) { const c = this._find(row.key, id); if (c) { row.casks[id].pose = pose(c); row.casks[id].hull = c.hull; } }
    }
    this._introduce();
  },
  serialize() {
    this._settleCollections();
    for (const row of this._actors.values()) for (const id of KILNBACK_CASK_IDS) {
      const e = this._find(row.key, id); if (e) { row.casks[id].pose = pose(e); row.casks[id].hull = e.hull; }
    }
    return { revision: 1, introduced: this._introduced, actors: [...this._actors.values()].map(r => structuredClone(r)) }; },
  deserialize(raw, remap = new Map()) {
    this._actors.clear(); this._bindings.clear(); this._pendingCollections.clear(); this._introduced = raw?.introduced === true;
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
    for (const row of this._actors.values()) { const e = this._find(row.key);
      if (e) { e.data.kilnback = row; this._syncBody(e, row); }
      else if (row.phase !== 'lost') {
        row.phase = 'lost';
        for (const id of this._attached(row)) { row.casks[id].status = 'destroyed'; row.casks[id].coolant = 0; }
      }
      row.targetLife = this.state.entities.get(row.targetId)?.occupantGeneration ?? null;
      for (const id of KILNBACK_CASK_IDS) {
        const c = row.casks[id], loose = this._find(row.key, id, true);
        if (c.status === 'drifting' && !loose) { c.status = 'destroyed'; c.coolant = 0; }
        if (['spent', 'destroyed', 'collected'].includes(c.status) && loose) loose.alive = false;
        if (loose && (row.rewardClaimed || row.rewardCaskId !== id || c.coolant <= 0)) { loose.data.salvagePool = {}; loose.data.amount = 0; }
      }
    }
  },
  newGame() {
    for (const e of [...this.state.entityList]) if (e.data?.persistenceOwner === C.persistenceOwner) this.helpers.removeEntity(e.id);
    this.deserialize(null); this._restoring = false; },
  destroy() { for (const off of this._subs) off(); owners.delete(this.state); this._bindings.clear(); },
};

export function kilnbackPresentation(state, entity) {
  const owner = owners.get(state), row = owner?._actors.get(entity?.data?.kilnbackKey);
  if (!row || state.mode !== 'flight' || row.phaseStartTick > state.tick
    || entity !== owner._find(row.key, entity.data.kilnbackCaskId || 'caster')) return null;
  const nativeReady = owner._nativeSolved(entity);
  return { phase: row.phase, phaseStartTick: row.phaseStartTick, tick: state.tick, coolant: kilnbackCoolant(row),
    attachedCaskIds: owner._attached(row), casks: structuredClone(row.casks), aimAngle: row.aimAngle,
    attack: row.attack, pulse: row.pulse, nativeBodyReady: nativeReady,
    sourceRevision: row.bodyRevision, ownerLife: entity.occupantGeneration,
    activeHeatLanes: nativeReady ? (owner.ctx.registry?.get('fields')?.thermalFieldsForSource(row.key, entity.occupantGeneration) || [])
      .filter(f => f.kind === 'burn') : [] };
}
