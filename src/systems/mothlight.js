import { MOTHLIGHT as C, MOTHLIGHT_LAMP_IDS, freshMothlightActor, normalizeMothlightActor,
  mothlightStock, mothlightActiveLampIds, mothlightPointPose, registerMothlightOwner } from '../data/mothlight.js';
import { mothlightPhysicalBody, mothlightLampPhysicalBody, mothlightLampSocket,
  MOTHLIGHT_RADIUS, MOTHLIGHT_VISUAL_RADIUS, MOTHLIGHT_LAMP_RADIUS } from '../data/mothlightBody.js';
import { authorizeAIEngagement } from '../ai/engagementAuthority.js';
import { setEntityDoctrine } from '../ai/doctrine.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';
import { physicsBodyNativeReady, queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { drawSeeded, wrapAngle } from '../core/rng.js';
import { syncEntitySectorMembership } from '../core/coreSystem.js';

const owners = new WeakMap();
const token = (key, id = 'tender') => `${key}:${id}`;
const dist = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const pose = e => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z, rot: e.rot || 0, spin: e.angVel || 0 });

export const mothlightEncounter = Object.freeze({
  fire(d, live, state) {
    const owner = owners.get(state);
    if (!owner?._eligible() || owner._introduced) return d.abort(live, 'mothlight_not_eligible');
    if (state.entityList.some(e => e.alive && e.data?.lootTableId === C.enemyId)) return d.abort(live, 'mothlight_already_live');
    live.deadlineAt = d.now() + C.encounterSeconds;
    const ids = d.spawnShips(live, live.plan.ships);
    const e = ids.map(id => state.entities.get(id)).find(e => e?.data?.lootTableId === C.enemyId);
    if (!e || !owner.bind(e, live.id)) return d.abort(live, 'mothlight_source_unavailable');
    owner._introduced = true; live.phase = 'conflict';
    d.say(live, 'alert', 'MOTHLIGHT — its six-petal iris is the real gun. Small lamps only drift; scan or extinguish them.', null,
      { literal: true, primary: true });
  },
  tick(d, live) {
    if (!d.aliveCount(live)) return d.resolve(live, 'cleared', { speak: false });
    if (d.now() >= live.deadlineAt) { d.despawnAll(live, 8); d.resolve(live, 'escaped', { speak: false }); }
  },
});

// Phases and original-part fates only. Tactical AI/flight own movement, weapons/combat own
// shots and damage, Rapier owns actual lamp drift, and the director owns encounter admission.
export const mothlight = { name: 'mothlight', init(ctx) {
  this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
  this._actors = new Map(); this._bindings = new Map(); this._bodyCache = new WeakMap(); this._subs = [];
  this._introduced = false; this._restoring = false; this._nextRequest = 0; this._lastTick = -1; this._scanSeq = 0;
  owners.set(ctx.state, this); registerMothlightOwner(ctx.state, this);
  const on = (event, fn) => this._subs.push(this.bus.on(event, fn));
  on('combat:fire', p => this._acceptedFire(p));
  on('combat:damage', p => { const e = this.state.entities.get(p?.targetId);
    if (e?.data?.mothlightLampId && p.hullDamage > 0 && e.hull <= 0) this._lost(e.id, e); });
  on('entity:killed', p => this._lost(p?.id ?? p?.targetId));
  on('entity:destroyed', p => this._lost(p?.id, p?.entity));
  on('scan:pulse', p => this._scan(p));
  on('save:restoring', () => { this._restoring = true; this._bindings.clear(); });
  on('save:loaded', () => this.afterContinue());
}, bind(e, identity = null) {
  if (!e?.alive || e.data?.lootTableId !== C.enemyId) return null;
  const key = e.data.mothlightKey || `mothlight:${identity ?? e.occupantGeneration}`;
  let row = this._actors.get(key); const old = this._bindings.get(token(key));
  if (row?.phase === 'lost' || old && (old.entity !== e || old.life !== e.occupantGeneration)) return null;
  if (!row) { row = freshMothlightActor(key, this.state.tick); this._actors.set(key, row); }
  e.data.mothlightKey = key; e.data.persistenceOwner = C.persistenceOwner;
  e.data.homeSectorId = e.data.homeSectorId || this.state.world?.currentSectorId;
  e.data.identityKey = token(key); e.data.worldRecordId = token(key); e.data.authoredAssetId = 'SF_SHIP_MOTHLIGHT_TENDER';
  e.data.visualRadius = MOTHLIGHT_VISUAL_RADIUS; e.data.name = 'Mothlight tender';
  e.flags = { ...e.flags, persistent: true };
  syncEntitySectorMembership(this.state && this.state.entityIndex, e);
  this._bindings.set(token(key), { entity: e, life: e.occupantGeneration }); this._syncBody(e, row);
  return row;
}, _find(key, id = 'tender', terminal = false) {
  const row = this._actors.get(key);
  if (!row || !terminal && (id === 'tender' ? row.phase === 'lost' : !['releasing', 'drifting'].includes(row.lamps[id]?.status))) return null;
  const hit = this._bindings.get(token(key, id));
  if (hit) return this.state.entities.get(hit.entity.id) === hit.entity && hit.entity.alive
    && hit.entity.occupantGeneration === hit.life ? hit.entity : null;
  let found = null;
  for (const e of this.state.entityList) if (e.alive && e.data?.persistenceOwner === C.persistenceOwner
    && e.data.mothlightKey === key && (e.data.mothlightLampId || 'tender') === id) {
    if (found) return null; found = e;
  }
  if (found) this._bindings.set(token(key, id), { entity: found, life: found.occupantGeneration });
  return found;
}, _native(e) {
  const p = this.ctx.registry?.get('physics'), r = p?._sg02?.records.get(e?.id);
  return !p?._nativeRestorePending && !p?._nativeRestoreDeferred && r?.entity === e && r.body
    && physicsBodyNativeReady(e) ? r : null;
}, _nativeSolved(e) {
  const native = this.ctx.registry?.get('physics')?._sg02, r = this._native(e), age = this.state.tick - native?._simTick;
  return !!r && r.proxyId === (e.physicsBody?.collisionProxyManifest?.id ?? null) && r.revision === e.physicsBody?.revision
    && r._postStepReadTick === native.tick && Number.isInteger(native._simTick) && age >= 0 && age <= 2;
}, _ready(e) { return this.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic' || this._nativeSolved(e); },
_syncBody(e, row) {
  const stock = mothlightStock(row); let cached = this._bodyCache.get(row);
  if (!cached || cached.stock !== stock || cached.revision !== row.bodyRevision) {
    cached = { stock, revision: row.bodyRevision, body: mothlightPhysicalBody(stock, row.bodyRevision) }; this._bodyCache.set(row, cached);
  }
  const body = cached.body;
  if (e.physicsBody?.collisionProxyManifest?.id === body.collisionProxyManifest.id && e.physicsBody?.revision === body.revision) return;
  // The same actual engine and helm remain after a two-mass lamp leaves its bay.
  for (const model of new Set([e.flightModel, e.data?.derived?.flightModel])) if (model) {
    const massRatio = (model.mass || body.mass) / body.mass, yawRatio = (model.inertia || body.inertiaY) / body.inertiaY;
    for (const key of ['mainAccel', 'reverseAccel', 'strafeAccel']) if (Number.isFinite(model[key])) model[key] *= massRatio;
    for (const key of ['angularAccel', 'angularBrake']) if (Number.isFinite(model[key])) model[key] *= yawRatio;
    model.mass = body.mass; model.inertia = body.inertiaY;
  }
  e.physicsBody = body; e.mass = body.mass; e.radius = MOTHLIGHT_RADIUS;
}, _release(e, row) {
  if (mothlightActiveLampIds(row).length >= 2) return false;
  const id = MOTHLIGHT_LAMP_IDS.find(id => row.lamps[id].status === 'stowed'); if (!id || !this._ready(e)) return false;
  const lamp = row.lamps[id], index = MOTHLIGHT_LAMP_IDS.indexOf(id);
  lamp.pose = mothlightPointPose(e, mothlightLampSocket(index), this._native(e)?.body);
  // The authored native COM stays at the tender origin. Its departing off-axis mass carries
  // point velocity, so the retained body must receive the matching linear reaction.
  queuePhysicsImpulse(e, { x: C.lampMass * ((e.vel?.x || 0) - lamp.pose.vx),
    z: C.lampMass * ((e.vel?.z || 0) - lamp.pose.vz) });
  lamp.status = 'releasing'; lamp.expiresAt = this.state.simTime + C.lampLifetimeS;
  row.bodyRevision++; this._syncBody(e, row); this._milestone(row, 'deployed');
  this.bus.emit('mothlight:lampReleased', { sourceKey: row.key, lampId: id, tick: this.state.tick, sourceRevision: row.bodyRevision });
  return true;
}, _materialize(row) {
  const e = this._find(row.key); if (e) this._syncBody(e, row);
  for (const id of MOTHLIGHT_LAMP_IDS) {
    const lamp = row.lamps[id]; if (lamp.status !== 'releasing') continue;
    if (!e) { lamp.status = 'destroyed'; continue; }
    if (!this._ready(e)) continue; // consumed reduced parent mass precedes the loose body
    if (!lamp.pose || !(lamp.hull > 0) || this.state.simTime >= lamp.expiresAt) { lamp.status = 'expired'; continue; }
    const p = lamp.pose, body = mothlightLampPhysicalBody();
    const loose = this.helpers.spawnEntity({ type: 'payload', team: e.team, factionId: e.factionId,
      pos: { x: p.x, z: p.z }, vel: { x: p.vx, z: p.vz }, rot: p.rot, angVel: p.spin,
      mass: body.mass, radius: MOTHLIGHT_LAMP_RADIUS, hull: 1, hullMax: 1, shield: 0,
      flags: { persistent: true }, physicsBody: body,
      data: { mothlightKey: row.key, mothlightLampId: id, persistenceOwner: C.persistenceOwner,
        homeSectorId: e.data.homeSectorId || this.state.world.currentSectorId,
        identityKey: token(row.key, id), worldRecordId: token(row.key, id),
        authoredAssetId: 'SF_PROP_MOTHLIGHT_LAMP', authoredPayloadAssetId: 'SF_PROP_MOTHLIGHT_LAMP',
        name: 'Mothlight needle lamp', scanLabel: lamp.scanned ? 'DECOY · ballistic lamp · no weapon or engine' : 'Needle lamp · unresolved',
        scannable: true, salvagePool: {}, authoredSalvagePool: {}, amount: 0, bountyCr: 0, loot: null,
        lifetimeS: Infinity } });
    if (loose) { lamp.status = 'drifting'; this._bindings.set(token(row.key, id), { entity: loose, life: loose.occupantGeneration }); }
  }
}, _lost(id, supplied = null) {
  if (this._restoring) return;
  const e = supplied || this.state.entities.get(id), row = this._actors.get(e?.data?.mothlightKey);
  if (!row || e.data.persistenceOwner !== C.persistenceOwner) return;
  const part = e.data.mothlightLampId || 'tender', binding = this._bindings.get(token(row.key, part));
  if (!binding || binding.entity !== e || binding.life !== e.occupantGeneration) return;
  if (part === 'tender') {
    row.phase = 'lost'; row.nextAttackTick = null;
    for (const lamp of Object.values(row.lamps)) if (['stowed', 'releasing'].includes(lamp.status)) lamp.status = 'destroyed';
  } else { row.lamps[part].status = 'destroyed'; row.lamps[part].hull = 0; }
}, _milestone(row, id) { if (!row.milestones.includes(id)) row.milestones.push(id); },
_phase(e, row, phase) {
  row.phase = phase; row.phaseStartTick = this.state.tick; row.nextAttackTick = null;
  if (phase === 'true_charge') {
    row.attack++; row.nextAttackTick = this.state.tick + C.chargeTicks;
    // This one-tick action must land on a real tactical decision, never between cached frames.
    // Alignment can lengthen the warning by at most one decision interval, never shorten it.
    const ai = this.ctx.registry?.get('tacticalAI'), interval = ai?.decisionIntervalTicks, last = ai?.stack?.lastTick;
    if (Number.isInteger(interval) && interval >= 1 && interval <= 12 && Number.isInteger(last) && last >= 0)
      row.nextAttackTick += (interval - (row.nextAttackTick - last) % interval) % interval;
  }
  if (phase === 'retreat') {
    this._milestone(row, 'empty'); setEntityDoctrine(e, { activity: { kind: 'flee', startedTick: this.state.tick }, roe: 'hold_fire' });
  }
  this.bus.emit('mothlight:phase', { entityId: e.id, ownerLife: e.occupantGeneration, sourceKey: row.key,
    phase, phaseStartTick: row.phaseStartTick, nextAttackTick: row.nextAttackTick, attack: row.attack });
}, _target(e) {
  const id = e.data?.intent?.targetId ?? e.data?.combat?.targetId ?? this.state.playerId;
  const target = this.state.entities.get(id);
  return target?.alive && dist(e.pos, target.pos) <= C.range ? target : null;
}, gunCadence(e) {
  const row = this._actors.get(e?.data?.mothlightKey);
  if (this._restoring || e?.data?.lootTableId !== C.enemyId || this._find(row?.key) !== e || !this._ready(e)) return null;
  return Object.freeze({ ownerId: e.id, ownerLife: e.occupantGeneration, sampledTick: this.state.tick,
    phase: row.phase, phaseStartTick: row.phaseStartTick, nextAttackTick: row.nextAttackTick,
    targetId: row.targetId, targetLife: row.targetLife });
}, allowsFire(e) {
  const row = this._actors.get(e?.data?.mothlightKey), ws = e?.data?.weapons;
  if (!row || row.phase !== 'true_charge' || row.nextAttackTick !== this.state.tick
    || row.acceptedAttack?.attack === row.attack || this._find(row.key) !== e || !this._ready(e)
    || !Array.isArray(ws) || ws.length !== 1 || ws[0].defId !== C.weaponId || ws[0].slotIndex !== 0) return false;
  const target = this.state.entities.get(row.targetId), intent = e.data.intent;
  if (!target?.alive || target.occupantGeneration !== row.targetLife || this._target(e) !== target
    || !intent?.fire || !Number.isFinite(intent.aimAngle) || Math.abs(wrapAngle(intent.aimAngle - e.rot)) > .22
    || !witnessLineOfSight(this.state, e, target.pos, [target.id])) return false;
  return authorizeAIEngagement({ state: this.state, self: e, target,
    objectiveReason: 'combat_doctrine:ranged_disengager:fire_window' }).ok === true;
}, _acceptedFire(p) {
  const e = this.state.entities.get(p?.ownerId), row = this._actors.get(e?.data?.mothlightKey);
  if (!row || p.weaponId !== C.weaponId || p.hardpointIdx !== 0 || !this.allowsFire(e)) return;
  // Reserve the accepted action before the phase event can recursively service this gun.
  row.acceptedAttack = { attack: row.attack, tick: this.state.tick, ownerLife: e.occupantGeneration,
    receiptId: `${row.key}:shot:${row.attack}`, weaponId: p.weaponId, hardpointIdx: p.hardpointIdx };
  this._milestone(row, 'true_shot'); this._phase(e, row, 'reload');
}, scannerReading(e) {
  const row = this._actors.get(e?.data?.mothlightKey), id = e?.data?.mothlightLampId;
  if (!id || row?.lamps[id]?.scanned !== true || this._find(row.key, id) !== e || !this._ready(e)) return null;
  return { kind: 'ship', label: 'DECOY · NEEDLE LAMP', detail: 'Ballistic original · no weapon or engine · one hit extinguishes it' };
}, _scan(p) {
  const s = this.state;
  if (this._restoring || s.mode !== 'flight' || p?.source !== 'player-scanner' || p.scannerId !== s.playerId
    || !Number.isSafeInteger(p.seq) || p.seq <= this._scanSeq || p.simTime !== s.simTime
    || !Number.isFinite(p.radius) || p.radius <= 0 || !s.entities.get(s.playerId)?.alive) return;
  this._scanSeq = p.seq;
  for (const row of this._actors.values()) for (const id of mothlightActiveLampIds(row)) {
    const e = this._find(row.key, id), lamp = row.lamps[id];
    if (!e || !this._ready(e) || dist(p.pos, e.pos) > p.radius || lamp.scanned) continue;
    lamp.scanned = true; e.data.scanned = true; e.data.scanLabel = 'DECOY · ballistic lamp · no weapon or engine';
    this._milestone(row, 'identified');
    if (!row.learnedDecoy) { row.learnedDecoy = true;
      this.bus.emit('mothlight:identified', { sourceKey: row.key, lampId: id, entityId: e.id, ownerLife: e.occupantGeneration, tick: s.tick }); }
  }
}, _drive(e, row) {
  if (['lost', 'retreat'].includes(row.phase) || !this._ready(e)) return;
  const target = this._target(e), age = this.state.tick - row.phaseStartTick;
  if (row.phase === 'approach') {
    if (!target || !authorizeAIEngagement({ state: this.state, self: e, target,
      objectiveReason: 'combat_doctrine:ranged_disengager:fire_window' }).ok) return;
    row.targetId = target.id; row.targetLife = target.occupantGeneration;
    return this._phase(e, row, mothlightStock(row) ? 'deploy' : 'observe');
  }
  if (row.phase === 'deploy' && age >= C.deployTicks) { this._release(e, row); return this._phase(e, row, 'observe'); }
  if (row.phase === 'observe' && age >= C.observeTicks) {
    row.falseLampId = mothlightActiveLampIds(row)[Math.floor(drawSeeded(row, 'localRngState', 1) * mothlightActiveLampIds(row).length)] || null;
    return this._phase(e, row, row.falseLampId ? 'false_charge' : 'true_charge');
  }
  // Extinguishing the bluff ends it, but still earns the complete real iris warning.
  if (row.phase === 'false_charge' && (age >= C.chargeTicks || !this._find(row.key, row.falseLampId)))
    return this._phase(e, row, 'true_charge');
  if (row.phase === 'true_charge' && this.state.tick > row.nextAttackTick) return this._phase(e, row, 'reload');
  if (row.phase === 'reload' && age >= C.reloadTicks) return this._phase(e, row, 'reposition');
  if (row.phase === 'reposition' && age >= C.repositionTicks) {
    if (!mothlightStock(row) && !mothlightActiveLampIds(row).length) return this._phase(e, row, 'retreat');
    if (!target || target.occupantGeneration !== row.targetLife) return this._phase(e, row, 'approach');
    return this._phase(e, row, mothlightStock(row) && mothlightActiveLampIds(row).length < 2 ? 'deploy' : 'observe');
  }
}, _eligible() {
  const s = this.state;
  return s.mode === 'flight' && s.entities.get(s.playerId)?.alive && s.simTime >= C.earliestSeconds
    && s.world?.currentSectorId === C.sectorId && s.world?.discovery?.[C.sectorId]?.discovered === true
    && !s.ui?.docked && !(s.run?.kind === 'survival' && s.run.phase !== 'inactive')
    && this.ctx.registry?.get('scissorwake')?.serialize()?.introduced === true
    && !s.entityList.some(e => e.alive && ['scissorwake', 'kilnback'].includes(e.data?.lootTableId));
}, _introduce() {
  const s = this.state, player = s.entities.get(s.playerId);
  if (this._introduced || !this._eligible() || s.simTime < this._nextRequest
    || s.entityList.some(e => e.alive && e.data?.lootTableId === C.enemyId)) return;
  this._nextRequest = s.simTime + 5;
  this.ctx.registry?.get('encounterDirector')?.requestAuthoredEncounter({ shapeId: C.encounterId,
    encounterId: 'mothlight:first-lights', sectorId: C.sectorId,
    anchor: { x: player.pos.x + 360, z: player.pos.z + 120 }, respectPacing: true });
}, update(_dt, state) {
  if (this._restoring || state.mode !== 'flight' || state.tick === this._lastTick
    || state.run?.kind === 'survival' && state.run.phase !== 'inactive') return;
  this._lastTick = state.tick;
  for (const e of state.entityList) if (e.alive && e.data?.lootTableId === C.enemyId) this.bind(e);
  for (const row of this._actors.values()) {
    for (const id of mothlightActiveLampIds(row)) { const e = this._find(row.key, id), lamp = row.lamps[id];
      if (lamp.status === 'drifting' && !e) { lamp.status = 'destroyed'; lamp.hull = 0; }
      else if (state.simTime >= lamp.expiresAt) { lamp.status = 'expired'; lamp.hull = 0; if (e) this.helpers.removeEntity(e.id); }
      else if (e) { lamp.pose = pose(e); lamp.hull = e.hull; }
    }
    this._materialize(row); const e = this._find(row.key); if (e) this._drive(e, row);
    else if (row.phase !== 'lost') { row.phase = 'lost'; row.nextAttackTick = null;
      for (const lamp of Object.values(row.lamps)) if (['stowed', 'releasing'].includes(lamp.status)) lamp.status = 'destroyed'; }
  }
  this._introduce();
}, serialize() {
  for (const row of this._actors.values()) for (const id of mothlightActiveLampIds(row)) {
    const e = this._find(row.key, id); if (e) { row.lamps[id].pose = pose(e); row.lamps[id].hull = e.hull; }
  }
  return { revision: 1, introduced: this._introduced, actors: [...this._actors.values()].map(r => structuredClone(r)) };
}, deserialize(raw, remap = new Map()) {
  this._actors.clear(); this._bindings.clear(); this._introduced = raw?.introduced === true;
  for (const saved of (raw?.actors || []).slice(0, 12)) if (typeof saved.key === 'string' && saved.key.length < 180) {
    const row = normalizeMothlightActor(saved, saved.key, this.state.tick);
    row.targetId = remap.get(String(row.targetId)) ?? row.targetId; this._actors.set(row.key, row);
  }
  this._nextRequest = 0; this._lastTick = -1; this._scanSeq = 0;
}, afterContinue() {
  this._restoring = false; this._bindings.clear(); this._lastTick = -1; this._scanSeq = 0;
  for (const row of this._actors.values()) { const e = this._find(row.key);
    row.nextAttackTick = null; row.acceptedAttack = null; row.targetLife = this.state.entities.get(row.targetId)?.occupantGeneration ?? null;
    if (e) { this._syncBody(e, row); if (row.phase !== 'retreat') this._phase(e, row, 'reload'); }
    else { row.phase = 'lost'; for (const lamp of Object.values(row.lamps)) if (['stowed', 'releasing'].includes(lamp.status)) lamp.status = 'destroyed'; }
    for (const id of MOTHLIGHT_LAMP_IDS) { const lamp = row.lamps[id], loose = this._find(row.key, id, true);
      if (lamp.status === 'drifting' && !loose) { lamp.status = 'destroyed'; lamp.hull = 0; }
      if (loose && !['drifting', 'releasing'].includes(lamp.status)) this.helpers.removeEntity(loose.id);
    }
  }
}, newGame() {
  this._restoring = true;
  for (const e of [...this.state.entityList]) if (e.data?.persistenceOwner === C.persistenceOwner) this.helpers.removeEntity(e.id);
  this.deserialize(null); this._restoring = false;
}, destroy() { for (const off of this._subs || []) off(); this._bindings.clear(); owners.delete(this.state); registerMothlightOwner(this.state, null); },
};

export function mothlightPresentation(state, entity) {
  const owner = owners.get(state), row = owner?._actors.get(entity?.data?.mothlightKey), id = entity?.data?.mothlightLampId;
  if (!row || state.mode !== 'flight' || row.phaseStartTick > state.tick || owner._find(row.key, id || 'tender') !== entity) return null;
  return { sourceKey: row.key, phase: row.phase, phaseStartTick: row.phaseStartTick, tick: state.tick,
    simTime: state.simTime, ownerLife: entity.occupantGeneration, nativeBodyReady: owner._nativeSolved(entity),
    sourceRevision: id ? entity.physicsBody?.revision : row.bodyRevision,
    stockRemaining: mothlightStock(row), activeDecoyIds: mothlightActiveLampIds(row),
    stowedLampIds: MOTHLIGHT_LAMP_IDS.filter(id => row.lamps[id].status === 'stowed'),
    releasingLampIds: MOTHLIGHT_LAMP_IDS.filter(id => row.lamps[id].status === 'releasing'),
    deployingLampId: row.phase === 'deploy' ? MOTHLIGHT_LAMP_IDS.find(id => row.lamps[id].status === 'stowed') || null : null,
    lampId: id || null, scanned: id ? row.lamps[id].scanned : row.learnedDecoy,
    falseLampId: row.falseLampId || null, nextAttackTick: row.nextAttackTick,
    acceptedAttack: row.acceptedAttack && row.acceptedAttack.tick <= state.tick ? { ...row.acceptedAttack } : null,
    milestones: [...row.milestones] };
}
