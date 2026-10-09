import { PALLET_JACK as C, PALLET_JACK_ENEMY, palletJackCargoEligible, palletJackCargoValue,
  palletJackFlightModel, palletJackForkContains, palletJackLocalPoint } from '../data/palletJack.js';
import { PALLET_JACK_RADIUS, palletJackPhysicalBody, palletJackCradleSocket } from '../data/palletJackBody.js';
import { getCombatKernel } from '../combat/kernel.js';
import { ensureCombatant } from '../combat/runtime.js';
import { makeEnemySpawnSpec } from './combat.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { registerPalletJackCarrier, registerPalletJackClamp } from '../core/pickupCustody.js';
import { hasExplicitPickupAcceptance, resolvePickupAcceptance } from '../core/pickupAcceptance.js';
import { sectorGlobalOrigin, sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { sweepCollisionProxyInto } from '../core/collisionProxySweep.js';
import { resolveCollisionProxyManifest } from '../data/collisionProxyManifests.js';
import { primitiveBlocksSegment } from '../combat/lineOfSight.js';

const owners = new WeakMap(), terminal = new Set(['destroyed', 'collected']);
const clone = value => structuredClone(value);
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const savedPose = e => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z, rot: e.rot || 0, spin: e.angVel || 0 });
const finitePose = p => p && ['x', 'z', 'vx', 'vz', 'rot', 'spin'].every(k => Number.isFinite(p[k]));
const activePhases = new Set(['approach', 'target', 'grab', 'acquiring', 'escape', 'negotiating']);
const cargoSnapshot = e => ({ type: e.type, name: e.name, radius: e.radius, mass: e.mass,
  hull: e.hull, hullMax: e.hullMax, team: e.team, factionId: e.factionId,
  physicsBody: e.physicsBody ? clone(e.physicsBody) : undefined, pose: savedPose(e), data: clone(e.data || {}) });

export const palletJackEncounter = {
  fire(d, live, state) {
    const owner = owners.get(state), cargo = owner?._candidate();
    if (!owner?._eligible() || owner._row.introduced || !cargo) return d.abort(live, 'no_real_loose_cargo');
    const ids = d.spawnShips(live, live.plan.ships);
    const thief = ids.map(id => state.entities.get(id)).find(e => e?.data?.lootTableId === C.enemyId);
    if (!thief) return d.abort(live, 'no_pallet_jack_budget');
    if (!owner.begin(thief, cargo, live.id)) return d.abort(live, 'cargo_changed');
    live.phase = 'conflict'; live.deadlineAt = d.now() + C.encounterSeconds;
    d.say(live, 'alert', 'PALLET JACK — loose freight under threat. Move the load, break the front clamp, or hail the wounded thief.', null,
      { literal: true, primary: true });
  },
  tick(d, live, state) {
    const r = owners.get(state)?._row.incident;
    if (!r || !activePhases.has(r.phase)) return d.resolve(live, r?.result || 'cargo_recovered', { speak: false });
    if (d.now() >= live.deadlineAt) owners.get(state)?.release('deadline');
  },
};

// One finite original load. The source stores fate/provenance; attachment, cargo, economy and
// the selected maneuver/flight owners retain physical custody, consumption and actuation.
export const palletJack = {
  name: 'palletJack',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._row = { revision: 1, introduced: false, incident: null }; this._bindings = new Map();
    this._subs = []; this._restoring = false; this._shelving = false; this._nextRequest = 0;
    this._lastTick = -1; this._pendingCollection = null; this._clampOff = null; this._carrierOff = null;
    this._restoreSerial = 0; this._continuedSerial = -1;
    owners.set(ctx.state, this);
    const on = (event, fn) => this._subs.push(ctx.bus.on(event, fn));
    on('palletJack:drop', p => this.demandDrop(p));
    on('palletJack:trail', p => { if (p?.incidentId === this._row.incident?.id) this.plotTrail(); });
    on('scan:pulse', p => { if (p?.source === 'player-scanner' && p.scannerId === this.state.playerId) this.offer(); });
    on('pickup:collected', p => { const cargo = this._find('cargo');
      if (cargo?.id === p?.pickupId) this._pendingCollection = { p, cargo, life: cargo.occupantGeneration }; });
    on('combat:damage', p => { const actor = this._find('actor');
      if (actor?.id === p?.targetId && actor.hull <= 0) this._lost(actor.id, actor); });
    on('entity:killed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id, p?.entity));
    on('entity:destroyed', p => this._lost(p?.id, p?.entity));
    on('sector:exit', () => this._shelve());
    on('save:restoring', () => { this._restoring = true; this._clearReceipts(); this._bindings.clear(); });
    on('save:loaded', () => this.afterContinue());
  },
  _attachments() { return getCombatKernel(this.ctx).attachments; },
  _native(e) {
    const p = this.ctx.registry?.get('physics'), n = p?._sg02, r = n?.records.get(e?.id);
    const age = this.state.tick - n?._simTick;
    return !p?._nativeRestorePending && !p?._nativeRestoreDeferred && r?.entity === e && r.body
      && physicsBodyNativeReady(e) && r._postStepReadTick === n.tick && Number.isInteger(n._simTick)
      && age >= 0 && age <= 2 && (r.proxyId || null) === (e.physicsBody?.collisionProxyManifest?.id || null)
      && (r.revision || 0) === (e.physicsBody?.revision || 0) ? r : null;
  },
  _find(kind) {
    const r = this._row.incident; if (!r || (kind === 'cargo' && terminal.has(r.cargoOutcome))
      || (kind === 'actor' && (r.actorDestroyed || r.actorDeparted))) return null;
    const old = this._bindings.get(kind);
    if (old) return this.state.entities.get(old.e.id) === old.e && old.e.alive
      && old.e.occupantGeneration === old.life ? old.e : null;
    const key = kind === 'cargo' ? r.targetCargoId : `${r.id}:actor`;
    const hits = this.state.entityList.filter(e => e.alive && e.data?.persistenceOwner === C.owner
      && e.data?.palletJackBodyId === key);
    if (hits.length !== 1) return null;
    const e = hits[0]; this._bindings.set(kind, { e, life: e.occupantGeneration });
    if (kind === 'actor') this._carrierOff = registerPalletJackCarrier(e);
    return e;
  },
  _line() {
    const r = this._row.incident, a = this._find('actor'), c = this._find('cargo');
    if (!r?.clampId || !a || !c || !this._native(a) || !this._native(c)) return null;
    const semantic = this.state.combat?.attachments?.byId?.[r.clampId];
    const native = this.ctx.registry.get('physics')._sg02.attachments.get(r.clampId);
    return semantic?.state === 'active' && semantic.ownerId === a.id && semantic.targetId === c.id
      && semantic.ownerGeneration === a.occupantGeneration && semantic.targetGeneration === c.occupantGeneration
      && native?.ownerEntity === a && native.ownerLife === a.occupantGeneration
      && native.targetEntity === c && native.targetLife === c.occupantGeneration ? semantic : null;
  },
  _clearReceipts() { this._clampOff?.(); this._clampOff = null; this._carrierOff?.(); this._carrierOff = null; },
  _publishClamp() {
    const c = this._find('cargo'), a = this._find('actor'); if (!c || !a || !this._line()) return false;
    if (!this._clampOff) this._registerCargoReceipt(a, c);
    c.data.masslineLatched = true; c.data.palletJackLatched = true; return true;
  },
  _registerCargoReceipt(a, c) {
    const r = this._row.incident;
    this._clampOff = registerPalletJackClamp(c, a, () => !!this._line(), () => {
      if (this._row.incident !== r || this._find('actor') !== a || this._find('cargo') !== c) return false;
      if (r.phase === 'acquiring' && r.clampId && r.cargoOutcome === 'carried'
        && Number.isInteger(r.restoreDeadlineTick) && this.state.tick >= r.phaseStartTick
        && this.state.tick <= r.restoreDeadlineTick) return true;
      // A requested cut that the backend has not acknowledged still holds this real original.
      const native = r.releasePending && this.ctx.registry?.get('physics')?._sg02?.attachments.get(r.clampId);
      return !!native && native.ownerEntity === a && native.targetEntity === c
        && native.ownerLife === a.occupantGeneration && native.targetLife === c.occupantGeneration;
    });
  },
  _clearCargoLatch(c = this._find('cargo')) {
    this._clampOff?.(); this._clampOff = null;
    if (c?.data.palletJackLatched) { delete c.data.palletJackLatched; delete c.data.masslineLatched; }
  },
  _eligible() {
    const s = this.state;
    return !this._restoring && s.mode === 'flight' && C.sectors.includes(s.world?.currentSectorId)
      && s.entities.get(s.playerId)?.alive && !s.ui?.docked
      && !(s.run?.kind === 'survival' && s.run.phase !== 'inactive');
  },
  _candidate() {
    const p = this.state.entities.get(this.state.playerId); if (!p) return null;
    return this.state.entityList.filter(e => palletJackCargoEligible(e, this.state.simTime)
      && distance(e.pos, p.pos) <= C.searchRadius && this._native(e)
      && !Object.values(this.state.combat?.attachments?.byId || {}).some(a => a.state === 'active'
        && ((a.targetId === e.id && a.targetGeneration === e.occupantGeneration)
          || (a.ownerId === e.id && a.ownerGeneration === e.occupantGeneration))))
      .sort((a, b) => palletJackCargoValue(b) - palletJackCargoValue(a) || a.id - b.id)[0] || null;
  },
  begin(actor, cargo, id = 'pallet-jack:first-load') {
    if (this._row.introduced || !actor?.alive || actor.data?.lootTableId !== C.enemyId
      || !palletJackCargoEligible(cargo, this.state.simTime) || !this._native(cargo)) return false;
    const sectorId = this.state.world.currentSectorId;
    const targetCargoId = `pallet-jack:${id}:original:${cargo.data?.worldRecordId || cargo.occupantGeneration}`;
    const route = this._route(sectorId, cargo.pos);
    const r = { id, targetCargoId, phase: 'approach', phaseStartTick: this.state.tick,
      revision: 1, grabAttackId: 0, clampId: null, cargoOutcome: 'live', sectorId,
      routeEndpointId: route.sectorId, routeEndpoint: route.pos, actorDestroyed: false,
      actorPose: savedPose(actor), actorHull: actor.hull, cargo: null, contestedTicks: 0,
      result: null, releasePending: null, receipts: [] };
    cargo.data.palletJackBodyId = targetCargoId; cargo.data.persistenceOwner = C.owner;
    cargo.data.palletJackCargoId = targetCargoId; cargo.data.homeSectorId = sectorId;
    delete cargo.data.despawnAt; cargo.flags = { ...cargo.flags, persistent: true };
    actor.data.palletJackBodyId = `${id}:actor`; actor.data.persistenceOwner = C.owner;
    actor.data.palletJackActorId = C.actorId; actor.data.homeSectorId = sectorId;
    actor.data.combatProfileId = 'combat_profile_pallet_jack'; actor.data.weapons = []; actor.weapons = [];
    actor.flags = { ...actor.flags, persistent: true }; actor.physicsBody = palletJackPhysicalBody();
    actor.mass = actor.physicsBody.mass; actor.radius = PALLET_JACK_RADIUS;
    actor.flightModel = palletJackFlightModel(actor.physicsBody, actor.flightModel);
    if (actor.data.derived) actor.data.derived.flightModel = { ...actor.flightModel };
    this._row.introduced = true; this._row.incident = r;
    this._bindings.set('actor', { e: actor, life: actor.occupantGeneration });
    this._bindings.set('cargo', { e: cargo, life: cargo.occupantGeneration });
    this._carrierOff = registerPalletJackCarrier(actor); this._capture(); this._view();
    this._cue('LOOSE FREIGHT UNDER THREAT — move the actual load or break the front clamp.');
    return r;
  },
  _route(sectorId, cargoPos) {
    const sector = this.state.world.sectors?.[sectorId], origin = sectorGlobalOrigin(sectorId);
    const neighbors = (sector?.neighbors || []).filter(id => id !== sectorId).sort();
    const dest = neighbors[0] || (sectorId === 'sector_ceres_belt' ? 'sector_helios_prime' : 'sector_vesta_forge');
    const end = sectorGlobalOrigin(dest), dx = end.x - origin.x, dz = end.z - origin.z, len = Math.hypot(dx, dz) || 1;
    return { sectorId: dest, pos: { x: (origin.x + end.x) / 2 + dx / len * 180,
      z: (origin.z + end.z) / 2 + dz / len * 180 }, from: { ...cargoPos } };
  },
  _phase(phase) {
    const r = this._row.incident; r.phase = phase; r.phaseStartTick = this.state.tick; r.revision++;
    this.bus.emit('palletJack:phase', { incidentId: r.id, phase, tick: this.state.tick, targetCargoId: r.targetCargoId });
  },
  _cue(text) { this.bus.emit('toast', { text: `PALLET JACK — ${text}`, kind: 'info', ttl: 5 }); },
  _grabGate() {
    const r = this._row.incident, a = this._find('actor'), c = this._find('cargo');
    if (!r || !a || !c || !this._native(a) || !this._native(c)
      || !palletJackCargoEligible(c, this.state.simTime, true)) return null;
    const runtime = ensureCombatant(this.state, a, getCombatKernel(this.ctx).catalog);
    if (runtime?.capabilities?.transport_clamp === false) return null;
    const cradle = palletJackLocalPoint(a, palletJackCradleSocket());
    const spin = a.angVel || 0, dx = cradle.x - a.pos.x, dz = cradle.z - a.pos.z;
    const relative = Math.hypot(c.vel.x - (a.vel.x - spin * dz), c.vel.z - (a.vel.z + spin * dx));
    return distance(c.pos, cradle) <= C.grabRange && relative < C.grabSpeed && palletJackForkContains(a, c)
      ? { r, a, c, cradle } : null;
  },
  _grab() {
    const gate = this._grabGate(); if (!gate) { this._phase('approach'); this._cue('CLAMP MISSED — the load moved.'); return false; }
    const { r, a, c, cradle } = gate;
    this._phase('acquiring'); // reserve before the synchronous attachment receipt/callbacks
    const result = this._attachments().create({ defId: 'attachment_transport_clamp', ownerId: a.id,
      targetId: c.id, sourceSocketId: 'socket_pallet_clamp', sourceWorld: cradle, targetWorld: c.pos,
      actionInstanceId: `${r.id}:grab:${r.grabAttackId}` });
    if (!result?.ok) { this._phase('approach'); return false; }
    r.clampId = result.attachment.id;
    if (!this._line()) { r.releasePending = 'grab_unconfirmed'; return false; }
    this._publishClamp(); r.cargoOutcome = 'carried'; this._phase('escape');
    r.receipts.push({ id: `${r.id}:grab:${r.grabAttackId}`, kind: 'grab', atTick: this.state.tick,
      targetCargoId: r.targetCargoId, attachmentId: r.clampId });
    this._cue('ACTUAL LOAD CLAMPED — its own mass is still real. A MassLine can pull against the clamp.');
    return true;
  },
  _blocked(a, c) {
    const r = this._row.incident, dx = r.routeEndpoint.x - a.pos.x, dz = r.routeEndpoint.z - a.pos.z;
    const len = Math.hypot(dx, dz) || 1, end = { x: a.pos.x + dx / len * 120, z: a.pos.z + dz / len * 120 };
    const out = {};
    return this.state.entityList.some(e => {
      if (!e.alive || e.collides === false || e === a || e === c || e.type === 'projectile'
        || e.type === 'pickup' || e.physicsBody === false) return false;
      const manifest = resolveCollisionProxyManifest(e);
      return manifest ? sweepCollisionProxyInto(out, e, manifest, a.pos, end, a.radius)
        : primitiveBlocksSegment(a.pos, end, { kind: 'circle', x: e.pos.x, z: e.pos.z, r: (e.radius || 0) + a.radius });
    });
  },
  _playerPull(a, c) {
    const player = this.state.entities.get(this.state.playerId), native = this.ctx.registry?.get('physics')?._sg02;
    if (!this._native(player) || !this._native(c)) return false;
    const route = this._row.incident.routeEndpoint, ex = route.x - a.pos.x, ez = route.z - a.pos.z, length = Math.hypot(ex, ez) || 1;
    for (const line of Object.values(this.state.combat?.attachments?.byId || {})) {
      if (line.state !== 'active' || line.ownerId !== player.id || line.targetId !== c.id
        || line.ownerGeneration !== player.occupantGeneration || line.targetGeneration !== c.occupantGeneration) continue;
      const live = native.attachments.get(line.id), s = live?.springState;
      if (live?.ownerEntity !== player || live.ownerLife !== player.occupantGeneration
        || live.targetEntity !== c || live.targetLife !== c.occupantGeneration
        || !(s?.lastImpulse > 0) || !(s.lastTension > 0)) continue;
      if (!palletJackForkContains(a, c)) return true;
      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      const pullLength = Math.hypot(dx, dz) || 1;
      if (s.lastTension >= C.contestForce && (dx * ex + dz * ez) / (pullLength * length) < -.15) return true;
    }
    return false;
  },
  release(reason = 'parley') {
    const r = this._row.incident; if (!r || r.releaseDone) return { ok: false, reason: 'already_released' };
    r.releasePending ||= reason;
    const line = r.clampId && this.state.combat?.attachments?.byId?.[r.clampId];
    if (line?.state === 'active') this._attachments().cut(line.id, line.ownerId, `pallet_jack:${r.releasePending}`);
    // The semantic service can close before a deferred backend closes. Never report recovered
    // until the actual native attachment is absent; retry the same original obligation.
    if (r.clampId && this.ctx.registry?.get('physics')?._sg02?.attachments.has(r.clampId))
      return { ok: false, reason: 'native_release_pending' };
    const c = this._find('cargo'); this._clearCargoLatch(c);
    r.clampId = null; r.releaseDone = true; r.cargoOutcome = terminal.has(r.cargoOutcome) ? r.cargoOutcome : 'live';
    r.result = r.releasePending === 'actor_lost' ? 'thief_lost' : 'cargo_recovered';
    const receipt = { id: `${r.id}:release`, kind: 'release', reason: r.releasePending,
      targetCargoId: r.targetCargoId, atTick: this.state.tick };
    r.receipts.push(receipt); r.releasePending = null; this._phase(r.actorDestroyed ? 'lost' : 'drop');
    this.bus.emit('palletJack:released', clone(receipt));
    this._cue(r.actorDestroyed ? 'THIEF LOST — the original load remains separate.'
      : 'CLAMP OPEN — cargo recovered. The thief can leave alive. No transfer or second payment.');
    return { ok: true, receipt: clone(receipt) };
  },
  demandDrop(p = {}) {
    const r = this._row.incident, a = this._find('actor'), player = this.state.entities.get(this.state.playerId);
    if (this._restoring || !r || p.incidentId !== r.id || p.revision !== r.revision
      || !a || !player?.alive || distance(a.pos, player.pos) > C.hailRange || a.hull > a.hullMax * .4
      || !this._line()) return { ok: false, reason: 'parley_changed' };
    return this.release('parley');
  },
  offer() {
    const r = this._row.incident, a = this._find('actor'), c = this._find('cargo'), p = this.state.entities.get(this.state.playerId);
    if (this._restoring || this.state.mode !== 'flight' || !r || !p?.alive
      || (![a?.id, c?.id].includes(this.state.player.targetId)) || distance(p.pos, (a || c)?.pos) > C.hailRange) return false;
    const loaded = !!this._line(), canDemandDrop = loaded && a.hull <= a.hullMax * .4;
    this.bus.emit('palletJack:offer', { incidentId: r.id, revision: r.revision, canDemandDrop,
      status: loaded ? 'ORIGINAL LOAD · NATIVE CLAMP ACTIVE' : terminal.has(r.cargoOutcome) ? r.cargoOutcome.toUpperCase() : 'ORIGINAL LOAD · CLAMP OPEN',
      detail: canDemandDrop ? 'The wounded thief offers its original load. Open the clamp and leave it alive; release preserves title and momentum.'
        : 'Move the freight before the grab, pull against the clamp with your MassLine, or damage the visible front clamp. The marked trail follows this same original body.' });
    return true;
  },
  plotTrail() {
    const r = this._row.incident, c = this._find('cargo'); if (!r || terminal.has(r.cargoOutcome)) return false;
    this.bus.emit('ui:setCourse', { pos: c ? { ...c.pos } : { ...r.cargo.pose }, sectorId: r.sectorId,
      label: 'Pallet Jack · original cargo provenance' }); return true;
  },
  _view() {
    const r = this._row.incident, a = this._find('actor'), c = this._find('cargo'); if (!r || !a) return;
    let flightPoint = r.routeEndpoint, flightVelocity = { x: 0, z: 0 }, faceAngle = a.rot;
    if (['approach', 'target', 'grab', 'acquiring'].includes(r.phase) && c) {
      faceAngle = r.phase === 'approach' ? Math.atan2(c.pos.z - a.pos.z, c.pos.x - a.pos.x) : r.grabAngle;
      const cradle = palletJackCradleSocket();
      flightPoint = r.phase === 'approach' ? { x: c.pos.x - Math.cos(faceAngle) * cradle.x,
        z: c.pos.z - Math.sin(faceAngle) * cradle.x } : r.grabPose || a.pos;
      flightVelocity = r.phase === 'approach' ? { ...c.vel } : { x: 0, z: 0 };
    } else if (['negotiating', 'drop'].includes(r.phase)) flightPoint = a.pos;
    else faceAngle = Math.atan2(r.routeEndpoint.z - a.pos.z, r.routeEndpoint.x - a.pos.x);
    a.data.palletJack = { phase: r.phase, phaseStartTick: r.phaseStartTick, targetEntityId: c?.id ?? null,
      flightPoint: { ...flightPoint }, flightVelocity, faceAngle, loaded: !!this._line() };
  },
  _drive() {
    const r = this._row.incident, a = this._find('actor'), c = this._find('cargo'); if (!r || !a) return;
    if (r.releasePending) { this.release(r.releasePending); return; }
    if (r.phase === 'acquiring' && r.restoreDeadlineTick != null) {
      if (this._line()) { this._publishClamp(); this._phase(r.resumePhase === 'escaped' ? 'escaped' : 'escape');
        delete r.restoreDeadlineTick; delete r.resumePhase; }
      else if (this.state.tick >= r.restoreDeadlineTick) this.release('restore_unconfirmed');
      this._view(); return;
    }
    if (r.actorDestroyed || !c || terminal.has(r.cargoOutcome)) { if (!r.releaseDone) this.release('cargo_lost'); this._view(); return; }
    if (!palletJackCargoEligible(c, this.state.simTime, true)) { this.release('custody_changed'); return; }
    const tick = this.state.tick;
    if (r.phase === 'approach' && this._grabGate()) {
      r.grabPose = { ...a.pos }; r.grabAngle = a.rot; this._phase('target');
      this._cue('CLAMP REACHING — move the load before the jaws close.');
    } else if (r.phase === 'target' && tick - r.phaseStartTick >= C.targetTicks) {
      r.grabAttackId++; this._phase('grab');
    } else if (r.phase === 'grab' && tick - r.phaseStartTick >= C.grabTicks) this._grab();
    else if (['escape', 'negotiating', 'escaped'].includes(r.phase)) {
      if (!this._line()) { this.release('clamp_disabled'); return; }
      this._publishClamp();
      if (a.hull <= a.hullMax * .4 && r.phase !== 'negotiating') { this._phase('negotiating'); this.offer(); }
      // This thief chooses its own escape over fighting a sustained, physically applied opposing
      // pull. A saved/idle semantic rope earns nothing; the player's line is never severed here.
      r.contestedTicks = this._playerPull(a, c) ? r.contestedTicks + 1 : 0;
      if (r.contestedTicks >= C.contestTicks) { this.release('massline_contested'); return; }
      if (r.phase === 'escape' && this._blocked(a, c)) { this.release('exit_blocked'); return; }
      if (r.phase === 'escape' && sectorMembershipAtGlobal(a.pos) === r.routeEndpointId
        && sectorMembershipAtGlobal(c.pos) === r.routeEndpointId) {
        r.sectorId = r.routeEndpointId; r.result = 'escaped'; this._phase('escaped');
        a.data.homeSectorId = r.sectorId; c.data.homeSectorId = r.sectorId;
        r.receipts.push({ id: `${r.id}:escape`, kind: 'escape', targetCargoId: r.targetCargoId,
          routeEndpointId: r.routeEndpointId, atTick: tick }); this._cue('FOLLOW THE PAPERWORK — the same marked load crossed the real sector boundary.');
      }
    } else if (r.phase === 'drop' && tick - r.phaseStartTick >= C.dropTicks) this._phase('flee');
    else if (r.phase === 'flee' && this._native(a) && sectorMembershipAtGlobal(a.pos) === r.routeEndpointId) {
      r.actorDeparted = true; this._shelving = true;
      try { this.helpers.removeEntity(a.id); this._bindings.delete('actor'); this._carrierOff?.(); this._carrierOff = null; }
      finally { this._shelving = false; }
    }
    this._view();
  },
  _settleCollection() {
    const pending = this._pendingCollection; if (!pending) return;
    this._pendingCollection = null; const r = this._row.incident;
    if (!r || pending.cargo.occupantGeneration !== pending.life) return;
    const p = pending.p, accepted = resolvePickupAcceptance(p, Number(p.amount) || 0);
    if ((hasExplicitPickupAcceptance(p) && accepted.accepted > 0) || accepted.legacyFullConsume) {
      if (!pending.cargo.alive || (Number(pending.cargo.data?.amount) || 0) <= 0) {
        r.cargoOutcome = 'collected'; this.release('cargo_collected');
      } else r.cargo = cargoSnapshot(pending.cargo);
    }
  },
  _lost(id, entity = null) {
    if (this._restoring || this._shelving) return;
    this._settleCollection(); const r = this._row.incident; if (!r) return;
    for (const kind of ['actor', 'cargo']) { const b = this._bindings.get(kind);
      if (b?.e.id !== id || (entity && entity !== b.e) || b.e.occupantGeneration !== b.life) continue;
      if (kind === 'actor') { r.actorDestroyed = true; r.actorHull = 0; this.release('actor_lost');
        this.bus.emit('palletJack:lost', { incidentId: r.id }); }
      else if (!terminal.has(r.cargoOutcome)) { r.cargoOutcome = 'destroyed'; this.release('cargo_lost'); }
    }
  },
  _capture() {
    if (this._restoring) return;
    this._settleCollection(); const r = this._row.incident; if (!r) return;
    for (const kind of ['actor', 'cargo']) { const b = this._bindings.get(kind);
      if (b && (!b.e.alive || this.state.entities.get(b.e.id) !== b.e || b.e.occupantGeneration !== b.life)) this._lost(b.e.id, b.e); }
    const a = this._find('actor'), c = this._find('cargo');
    if (a) { r.actorPose = savedPose(a); r.actorHull = a.hull; }
    if (c) r.cargo = cargoSnapshot(c);
  },
  _shelve() {
    if (this._restoring) return;
    this._capture(); const r = this._row.incident; if (!r) return;
    this._shelving = true;
    try {
      const line = r.clampId && this.state.combat?.attachments?.byId?.[r.clampId];
      if (line?.state === 'active') this._attachments().cut(line.id, line.ownerId, 'pallet_jack:sector_shelve');
      r.clampId = null; this._clearCargoLatch(); this._clearReceipts();
      if (activePhases.has(r.phase) || r.phase === 'escaped') {
        r.resumeGrab = true; r.phase = 'approach'; r.phaseStartTick = this.state.tick;
      }
      for (const b of this._bindings.values()) if (this.state.entities.get(b.e.id) === b.e) this.helpers.removeEntity(b.e.id);
      this._bindings.clear();
    } finally { this._shelving = false; }
  },
  _materialize() {
    const r = this._row.incident; if (!r || this._restoring || this.state.world.currentSectorId !== r.sectorId) return;
    if (!terminal.has(r.cargoOutcome) && !this._find('cargo') && !this._bindings.has('cargo') && r.cargo) {
      const saved = clone(r.cargo), p = saved.pose;
      delete saved.pose; delete saved.data.masslineLatched; delete saved.data.palletJackLatched;
      const e = this.helpers.spawnEntity({ ...saved, pos: { x: p.x, z: p.z }, vel: { x: p.vx, z: p.vz },
        rot: p.rot, angVel: p.spin, collides: true, flags: { persistent: true } });
      if (e) this._bindings.set('cargo', { e, life: e.occupantGeneration });
    }
    if (!r.actorDestroyed && !r.actorDeparted && !this._find('actor') && !this._bindings.has('actor')) {
      if (this.helpers.spawnBudget && this.helpers.spawnBudget.request(1, `${r.id}:actor`) < 1) return;
      const p = r.actorPose;
      const spec = makeEnemySpawnSpec(C.enemyId, 2, { x: p.x, z: p.z });
      if (spec.data?.lootTableId !== C.enemyId) { this.helpers.spawnBudget?.release?.(`${r.id}:actor`); return; }
      spec.hull = r.actorHull; spec.rot = p.rot; spec.angVel = p.spin; spec.vel = { x: p.vx, z: p.vz };
      spec.flags = { ...spec.flags, persistent: true }; spec.data = { ...spec.data, palletJackActorId: C.actorId,
        palletJackBodyId: `${r.id}:actor`, persistenceOwner: C.owner, homeSectorId: r.sectorId,
        combatProfileId: 'combat_profile_pallet_jack' };
      const e = this.helpers.spawnEntity(spec); if (e) { this._bindings.set('actor', { e, life: e.occupantGeneration });
        this.helpers.spawnBudget?.bindEntity(e.id, `${r.id}:actor`); this._carrierOff = registerPalletJackCarrier(e); }
    }
  },
  update(_dt, state) {
    if (this._restoring || state.mode !== 'flight' || state.tick === this._lastTick
      || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')) return;
    this._lastTick = state.tick; this._capture(); this._materialize(); this._drive();
    if (!this._row.introduced && this._eligible() && state.simTime >= this._nextRequest) {
      this._nextRequest = state.simTime + C.requestSeconds; const c = this._candidate();
      if (c) this.ctx.registry?.get('encounterDirector')?.requestAuthoredEncounter({ shapeId: C.encounterId,
        encounterId: 'pallet-jack:first-load', sectorId: state.world.currentSectorId,
        anchor: { x: c.pos.x - 100, z: c.pos.z + 70 }, respectPacing: true });
    }
  },
  serialize() { this._capture(); return clone(this._row); },
  deserialize(raw, remap = new Map()) {
    this._restoreSerial++;
    this._clearReceipts(); this._bindings.clear(); this._pendingCollection = null;
    this._row = { revision: 1, introduced: raw?.introduced === true, incident: null };
    const r = raw?.incident;
    if (r && typeof r.id === 'string' && typeof r.targetCargoId === 'string' && finitePose(r.actorPose)
      && typeof r.sectorId === 'string' && typeof r.routeEndpointId === 'string'
      && Number.isFinite(r.routeEndpoint?.x) && Number.isFinite(r.routeEndpoint?.z)
      && finitePose(r.cargo?.pose) && (terminal.has(r.cargoOutcome) || palletJackCargoEligible({ ...r.cargo,
        alive: true, pos: r.cargo.pose, collides: true }, this.state.simTime, true))) {
      this._row.incident = clone(r); const row = this._row.incident;
      row.actorHull = Math.max(0, Math.min(PALLET_JACK_ENEMY.hull, Number(row.actorHull) || 0));
      row.actorDestroyed = row.actorDestroyed === true || row.actorHull <= 0;
      row.actorDeparted = row.actorDeparted === true;
      row.cargoOutcome = ['live', 'carried', 'collected', 'destroyed'].includes(row.cargoOutcome) ? row.cargoOutcome : 'destroyed';
      row.clampId = typeof row.clampId === 'string' ? row.clampId : null;
      row.receipts = (Array.isArray(row.receipts) ? row.receipts : []).slice(-16).filter(p => p?.targetCargoId === row.targetCargoId
        && Number.isInteger(p.atTick) && p.atTick >= 0 && p.atTick <= this.state.tick);
      row.revision = Math.max(1, Math.min(10000, Number(row.revision) || 1)); row.contestedTicks = 0;
      if (!activePhases.has(row.phase) && !['drop', 'flee', 'escaped', 'lost'].includes(row.phase)) row.phase = 'approach';
      if (row.phaseStartTick > this.state.tick || !Number.isInteger(row.phaseStartTick)) {
        row.phase = 'approach'; row.phaseStartTick = this.state.tick;
      }
      // Physical state is restored by the canonical attachment/native owner. No saved flag is custody.
      const existing = this.state.entityList.find(e => e.alive && e.data?.palletJackBodyId === row.targetCargoId);
      if (existing && remap.size) row.cargo.data = clone(existing.data);
    }
    this._nextRequest = 0; this._lastTick = -1;
  },
  afterContinue() {
    if (this._continuedSerial === this._restoreSerial) { this._restoring = false; return; }
    this._continuedSerial = this._restoreSerial;
    this._restoring = false; this._bindings.clear(); this._lastTick = -1;
    const r = this._row.incident; if (!r) return;
    const c = this._find('cargo'); this._find('actor'); this._clearCargoLatch(c);
    if (r.actorDestroyed || terminal.has(r.cargoOutcome)) return;
    if (!this._line() && ['acquiring', 'escape', 'escaped', 'negotiating'].includes(r.phase)) {
      // Defer to the native owner; a bounded full new windup is required if it cannot rebind.
      r.resumePhase = r.phase; r.phase = 'acquiring'; r.phaseStartTick = this.state.tick; r.restoreDeadlineTick = this.state.tick + 120;
      if (c && this._find('actor') && r.clampId && r.cargoOutcome === 'carried') {
        c.data.masslineLatched = true; c.data.palletJackLatched = true;
        this._registerCargoReceipt(this._find('actor'), c);
      }
    } else if (this._line()) { this._publishClamp(); this._phase(r.phase === 'escaped' ? 'escaped' : 'escape'); }
    else if (['target', 'grab'].includes(r.phase)) { r.phase = 'approach'; r.phaseStartTick = this.state.tick; }
    this._view();
  },
  newGame() {
    this._shelving = true;
    try { for (const e of [...this.state.entityList]) if (e.data?.persistenceOwner === C.owner) this.helpers.removeEntity(e.id); }
    finally { this._shelving = false; }
    this.deserialize(null); this._restoring = false;
  },
  destroy() { this._clearReceipts(); for (const off of this._subs || []) off(); owners.delete(this.state); },
};

export function palletJackPresentation(state, entity) {
  const owner = owners.get(state), r = owner?._row.incident, a = owner?._find('actor');
  if (!r || entity !== a || state.mode !== 'flight' || r.phaseStartTick > state.tick) return null;
  const c = owner._find('cargo'), nativeReady = !!owner._native(a), line = nativeReady && owner._line();
  return { phase: r.phase, phaseStartTick: r.phaseStartTick, tick: state.tick, ownerLife: a.occupantGeneration,
    sourceRevision: a.physicsBody?.revision, nativeBodyReady: nativeReady, targetCargoId: r.targetCargoId,
    targetEntityId: c?.id ?? null, targetLife: c?.occupantGeneration ?? null,
    grabAttackId: r.grabAttackId, grabStartTick: r.phase === 'grab' ? r.phaseStartTick : null,
    acceptedAttachmentId: line?.id || null, loaded: !!line,
    lastRelease: r.receipts.findLast(p => p.kind === 'release') || null };
}
