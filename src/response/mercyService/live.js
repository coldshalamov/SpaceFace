// Production rescue host. Kinematics and joints belong to the existing physics
// owner; this pass only observes them and queues bounded physical/tool intents.
import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../../core/physicsAuthority.js';
import { SECTORS } from '../../data/sectors.js';
import { stationBerthAdmits } from '../../data/frontierRumors.js';
import { createMercyRuntime, beginIncident, snapshotMercy, restoreMercy, report, measureMercyIncident, failMercyIncident } from './runtime.js';
import { boardIncidents, incidentById } from './incidents.js';
import { advanceLatches, notePhase } from './gates.js';
import { secureCapability, toolRange } from './equipment.js';
import { MERCY_MODELS, refreshModel } from './models.js';
import { settleDelivery, settleLeave, settleLost } from './settlement.js';
import { MERCY_DT, CLAMP_REL_SPEED, STAB_RATE } from './constants.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const toolGap = (a, b) => Math.max(0, dist(a.pos, b.pos) - (a.radius || 0) - (b.radius || 0));
const adventure = (state) => state.mode === 'flight' && !state.physicsVenueSession && !state.physicsVenue?.active
  && (!state.run || state.run.phase === 'inactive' || state.run.kind === 'adventure');
function publishedPlaceId(modelId) {
  const file = MERCY_MODELS[modelId] && MERCY_MODELS[modelId].publishedGlb;
  return String(file || '').replace(/^.*\//, '').replace(/\.glb$/i, '');
}

// World place props. The renderer mounts these as type fx with a placeId that
// placeFileForEntity resolves; that resolved GLB is the mesh.
export const MERCY_LIVE_PLACE_IDS = Object.freeze(Object.fromEntries(
  Object.keys(MERCY_MODELS).map((modelId) => [modelId, publishedPlaceId(modelId)]),
));

export function createLiveMercyServiceSystem() {
  return {
    name: 'mercyService',
    init(ctx) {
      this.ctx = ctx; this.destroying = false; this.off = []; this.sectors = {}; this.failures = {}; this.rt = null;
      const on = (event, fn) => { const off = ctx.bus?.on?.(event, fn); if (typeof off === 'function') this.off.push(off); };
      on('sector:exit', () => this.leave());
      on('game:newGame', () => { this.leave(); this.sectors = {}; this.failures = {}; });
      on('scan:pulse', (pulse) => this.scan(pulse));
      on('signal:investigate', (p) => {
        if (this.offer && (p?.signalId === this.offer.signalId || p?.id === this.offer.signalId)) {
          const missions = ctx.registry?.get?.('missions');
          if (missions?.acceptMission) missions.acceptMission(this.offer.id);
          else this.startIncident({ incidentId: this.offer.incidentId, origin: this.offer.origin, offerId: this.offer.id });
        }
      });
      on('mercyService:accept', (p) => this.startIncident(p));
      on('mission:accepted', (p) => {
        const m = ctx.state.missions?.active?.find((m) => m.id === p?.missionId) || p;
        if (m?.params?.mercyIncidentId) this.startIncident({ incidentId: m.params.mercyIncidentId, origin: m.params.mercyOrigin, offerId: m.id });
      });
      on('mercyService:tool', (p) => {
        const result = this.seatTool(p); ctx.bus.emit('mercyService:toolResult', result);
        ctx.bus.emit('toast', { text: result.ok ? `${p.tool} seated on rescue body.` : `Cannot seat tool: ${result.reason}. Move within 16 WU and match velocity.`, kind: result.ok ? 'info' : 'warn', ttl: 4 });
      });
      on('mercyService:order', (p) => {
        const inc = this.rt?.focus;
        if (inc && !inc.latches.stabilized && Object.hasOwn(inc.def.orders, p?.order)) { inc.intentOrder = p.order; inc.meters = { ...inc.meters, approach: 0, assess: 0 }; }
      });
    },
    entity(body, allowDead = false) {
      const entity = this.ctx.state.entities.get(body.entityId);
      const stamp = entity?.data?.mercyService;
      return entity && (allowDead || entity.alive) && stamp?.uid === body.incidentUid && stamp.localId === body.localId ? entity : null;
    },
    startIncident({ incidentId = 'ms_pod_traffic', origin, offerId = null } = {}) {
      const { state } = this.ctx;
      if (!adventure(state) || !this.ctx.helpers?.spawnEntity) return { ok: false, reason: 'not-in-adventure' };
      const player = state.entities.get(state.playerId);
      if (!player?.alive) return { ok: false, reason: 'no-player' };
      if (!incidentById(incidentId)) return { ok: false, reason: 'unknown-incident' };
      if (this.rt?.focus && !this.rt.focus.latches.settled && !this.rt.focus.failedForward) return { ok: false, reason: 'rescue-active' };
      const requested = origin && Number.isFinite(origin.x) && Number.isFinite(origin.z) ? origin : { x: player.pos.x + 90, z: player.pos.z + 40 };
      const point = this.clearOrigin(incidentId, requested);
      if (!point) return { ok: false, reason: 'no-clear-space' };
      if (!this.rt) this.rt = createMercyRuntime({ seed: hash32(state.meta.seed, state.world.currentSectorId, 'mercy'), sectorId: state.world.currentSectorId, bus: this.ctx.bus });
      this.rt.liveNamespace ||= `mercy:${this.rt.seed}:${state.world.currentSectorId}`;
      const opened = beginIncident(this.rt, incidentId, { origin: point, keepPlayer: true });
      if (!opened.ok || opened.queued) return opened;
      const inc = this.rt.incidents[opened.uid]; inc.offerId = offerId; inc.scanUntil = 0;
      for (const body of inc.bodyList) this.spawn(body);
      this.sectors[state.world.currentSectorId] = 'active';
      this.ctx.bus.emit('mercyService:started', { uid: inc.uid, incidentId, title: inc.def.title, priority: inc.def.priority });
      this.ctx.bus.emit('toast', { text: `${inc.def.title}. ${inc.def.priority}`, kind: 'info', ttl: 8 });
      return opened;
    },
    clearOrigin(id, requested) {
      const def = incidentById(id);
      for (let n = 0; n < 32; n++) {
        const ring = n ? 130 * Math.ceil(n / 8) : 0, angle = n * Math.PI / 4;
        const point = { x: requested.x + Math.cos(angle) * ring, z: requested.z + Math.sin(angle) * ring };
        const clear = def.bodies.every((b) => ['beacon', 'berth', 'barge', 'well'].includes(b.role)
          || !(this.ctx.state.entityList || []).some((e) => e.alive && e.collides !== false && e.physicsBody !== false
            && Math.hypot(e.pos.x - point.x - b.pos.x, e.pos.z - point.z - b.pos.z) < (e.radius || 0) + Math.max(2.5, b.radius) + 12));
        if (clear) return point;
      }
      return null;
    },
    spawn(body) {
      const { state, helpers } = this.ctx;
      const old = (state.entityList || []).find((e) => e.alive && e.data?.mercyService?.uid === body.incidentUid && e.data.mercyService.localId === body.localId);
      if (old) { body.entityId = old.id; return old; }
      const marker = ['berth', 'barge', 'well'].includes(body.role);
      const entity = helpers.spawnEntity({ type: 'fx', ttl: Infinity, team: 2, alive: true,
        pos: { x: body.pos.x, y: 0, z: body.pos.z }, vel: { x: body.vel.x, y: 0, z: body.vel.z },
        rot: body.rot, angVel: body.angVel, radius: Math.max(2.5, body.radius), mass: body.mass,
        hull: body.hull, hullMax: body.hullMax, collides: !marker,
        physicsBody: marker ? false : { shape: 'ball', mass: body.mass, radius: Math.max(2.5, body.radius), dynamic: body.role !== 'beacon', ccd: true },
        data: { placeId: MERCY_LIVE_PLACE_IDS[body.model], placeTargetRadius: Math.max(2.5, body.radius), worldOneOff: true,
          masslineTetherable: !marker, mercyService: { uid: body.incidentUid, localId: body.localId, role: body.role, modelId: body.model },
          displayName: `Mercy ${body.role}`, scanLabel: body.role === 'beacon' ? 'Mercy Service distress beacon' : body.role, salvageProtected: true },
        flags: { persistent: true } });
      body.entityId = entity.id; return entity;
    },
    newGame() { this.leave(); this.sectors = {}; this.failures = {}; this.offer = null; },
    scan(pulse) {
      if (pulse?.source !== 'player-scanner' || !adventure(this.ctx.state)) return;
      const { state } = this.ctx; const player = state.entities.get(state.playerId);
      if (!player?.alive) return;
      if (this.rt) for (const inc of Object.values(this.rt.incidents)) {
        if (!inc.latches.settled && !inc.failedForward) inc.scanUntil = state.simTime + 3;
      }
      if (this.rt?.focus && !this.rt.focus.latches.settled) return;
      const sectorId = state.world.currentSectorId;
      if (this.sectors[sectorId]) return;
      const sector = SECTORS.find((s) => s.id === sectorId);
      const reachable = (s, sec) => stationBerthAdmits(s, state.factions?.[s.factionId || sec.factionId]?.rep || 0, state);
      const station = sector?.stations?.find((s) => reachable(s, sector) && s.services?.includes('missions'))
        || SECTORS.flatMap((s) => (s.stations || []).filter((st) => reachable(st, s))).find((s) => s.services?.includes('missions'));
      if (!station) return;
      const origin = { x: player.pos.x + 90, z: player.pos.z + 40 };
      const id = `mercy_${sectorId}`;
      const board = boardIncidents(); const incidentId = board[hash32(state.meta.seed, sectorId, 'mercy-board') % board.length].id;
      const def = incidentById(incidentId);
      this.offer = { id, signalId: `mercy:${id}`, incidentId, origin };
      this.ctx.bus.emit('mission:offered', { id, offerId: id, stationId: station?.id || null, sectorId,
        source: 'mercyService', type: 'recon_scan', title: def.title, description: def.priority, summary: def.priority,
        destSectorId: sectorId, destStationId: station.id, factionId: null, minRep: -1000,
        collateral_cr: 0, expiresAtEpoch: Number.MAX_SAFE_INTEGER,
        params: { mercyIncidentId: this.offer.incidentId, mercyOrigin: origin, scanTargets: 1, settlesExternally: true }, reward_cr: 0, reward_rep: 0 });
      const signal = { id: this.offer.signalId, classification: 'MERCY DISTRESS',
        pos: origin, confidence: 1, distance: dist(player.pos, origin), strength: 1, trackable: true, manualInvestigation: true,
        detail: def.priority };
      this.ctx.bus.emit('signal:scanResults', { sectorId, primary: signal, signals: [signal], total: 1 });
    },
    seatTool({ tool, targetId } = {}) {
      const player = this.ctx.state.entities.get(this.ctx.state.playerId);
      const body = this.rt && Object.values(this.rt.bodies).find((b) => b.entityId === targetId);
      const entity = body && this.entity(body);
      if (!['clamp', 'containment', 'stabilizer'].includes(tool) || !player?.alive || !entity || toolGap(player, entity) > toolRange(tool)) return { ok: false, reason: 'out-of-range' };
      if (tool === 'clamp' && Math.hypot(player.vel.x - entity.vel.x, player.vel.z - entity.vel.z) <= CLAMP_REL_SPEED) {
        const port = this.ctx.helpers.combatPhysics, id = `mercy-clamp:${body.id}`;
        if (!port?.getAttachmentTelemetry?.({ attachmentId: id }) && !port?.createAttachment?.({ attachmentId: id,
          defId: 'mercy-safety-clamp', ownerId: player.id, targetId: entity.id, sourceWorld: player.pos, targetWorld: entity.pos,
          restLength: Math.max(8, dist(player.pos, entity.pos)), tick: this.ctx.state.tick,
          spring: { mode: 'spring', K: 360, zeta: 0.95, maxForce: 3600 }, break: { maxTension: 3600, maxStretchRatio: 2 } })) return { ok: false, reason: 'physics-not-ready' };
        body.clampAttached = true; body.clampId = id; body.driveHeld = !!(body.driven || body.role === 'door' || body.role === 'gantry');
      }
      else if (tool === 'containment' && body.volatile) body.rigAttached = true;
      else if (tool === 'stabilizer') body.liveStabilizer = true;
      else return { ok: false, reason: 'cannot-seat' };
      const inc = this.rt.incidents[body.incidentUid]; if (!inc.toolsSeen.includes(tool)) inc.toolsSeen.push(tool);
      return { ok: true };
    },
    update(dt, state) {
      if (!this.rt || !adventure(state) || dt !== MERCY_DT) return;
      const player = state.entities.get(state.playerId); if (!player?.alive) { this.noteShipLoss(); return; }
      const rt = this.rt; rt.simTime = state.simTime; rt.tick = state.tick;
      Object.assign(rt.player, { alive: true, pos: { x: player.pos.x, z: player.pos.z }, vel: { x: player.vel.x, z: player.vel.z } });
      for (const inc of Object.values(rt.incidents)) {
        if (inc.latches.settled || inc.failedForward) continue;
        const rescueSubject = inc.def.orders[inc.intentOrder]?.subject;
        inc.tensionNow = 0;
        for (const body of inc.bodyList) {
          const e = this.entity(body); body.prev = { ...body.pos }; const speed0 = Math.hypot(body.vel.x, body.vel.z);
          if (!e) { body.alive = false; continue; }
          Object.assign(body, { pos: { x: e.pos.x, z: e.pos.z }, vel: { x: e.vel.x, z: e.vel.z }, rot: e.rot, angVel: e.angVel || 0, hull: e.hull, alive: e.alive });
          refreshModel(body);
          const line = Object.values(state.combat?.attachments?.byId || {}).find((a) => a.state === 'active' && a.ownerId === player.id && a.targetId === e.id);
          if (line && body.localId === rescueSubject) {
            const tension = Math.max(0, Number(line.lastTension) || 0);
            inc.tensionNow = Math.max(inc.tensionNow, tension);
            inc.arrest += tension * dt + Math.max(0, speed0 - Math.hypot(e.vel.x, e.vel.z)) * body.mass;
          }
          if (body.clampId) {
            const clamp = this.ctx.helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: body.clampId });
            body.clampAttached = !!clamp;
            if (clamp && body.localId === rescueSubject) inc.arrest += Math.max(0, Number(clamp.tension) || 0) * dt;
            else body.driveHeld = false;
          }
          if (body.liveStabilizer && toolGap(player, e) <= toolRange('stabilizer')) {
            queuePhysicsTorqueImpulse(e, { y: -(e.angVel || 0) * (e.physicsBody?.inertiaY || body.mass * 8) * Math.min(1, STAB_RATE * dt) });
            if (body.localId === rescueSubject) inc.arrest += Math.abs(body.angVel) * body.mass * dt;
          }
          let drive = body.driveHeld ? { x: 0, z: 0 } : body.driveVel || (body.kinematic && !['beacon', 'berth', 'barge', 'well'].includes(body.role) ? { ...inc.def.bodies.find((b) => b.localId === body.localId).vel } : null);
          const pursued = body.pursue && inc.bodyList.find((b) => b.localId === body.pursue && b.alive);
          if (pursued && !body.driveHeld) { const d = dist(body.pos, pursued.pos) || 1; drive = { x: (pursued.pos.x - body.pos.x) / d * body.speed, z: (pursued.pos.z - body.pos.z) / d * body.speed }; }
          if (drive && e.physicsBody) queuePhysicsImpulse(e, { x: (drive.x - e.vel.x) * body.mass * Math.min(1, dt * 3), y: 0, z: (drive.z - e.vel.z) * body.mass * Math.min(1, dt * 3) });
          if (e.physicsBody && (body.driveHeld || body.angVelDrive != null)) queuePhysicsTorqueImpulse(e, { y: ((body.driveHeld ? 0 : body.angVelDrive) - body.angVel) * body.mass * 8 * Math.min(1, dt * 3) });
          const well = inc.well;
          if (well?.alive && !body.kinematic && body !== well) {
            const d = dist(body.pos, well.pos);
            if (d > 0.5 && d < well.field) { const force = well.strength * (1 - d / well.field) * body.mass * dt / d;
              queuePhysicsImpulse(e, { x: (well.pos.x - body.pos.x) * force, y: 0, z: (well.pos.z - body.pos.z) * force }); }
          }
          if (body.volatile && !body.rigAttached) body.spread += body.ventPerS * dt;
        }
        this.hazards(inc, dt);
        if (inc.failedForward || inc.latches.settled) continue;
        const order = inc.def.orders[inc.intentOrder]; const subject = inc.bodyList.find((b) => b.localId === order.subject);
        if (!subject?.alive) { settleLost(rt, inc, 'lost'); continue; }
        const sample = measureMercyIncident(rt, inc); sample.reading = inc.scanUntil >= state.simTime ? sample.reading : null;
        sample.secureOk = secureCapability(subject, inc.def, inc.tensionNow);
        const receiver = inc.bodyList.find((b) => b.localId === order.dest);
        const travelled = dist(subject.pos, subject.prev);
        if (receiver && dist(subject.pos, receiver.pos) > receiver.recoveryRadius) subject.wasOutside = true;
        else if (travelled > inc.def.maxStep) subject.wasOutside = false;
        const delivered = inc.latches.secured && subject.wasOutside && receiver && travelled <= inc.def.maxStep
          && dist(subject.pos, receiver.pos) <= receiver.recoveryRadius && Math.hypot(subject.vel.x, subject.vel.z) <= inc.def.extractSpeed;
        subject.crossHold = delivered ? (subject.crossHold || 0) + dt : 0;
        if (subject.crossHold >= inc.def.extractHold) Object.assign(sample, { delivered: true, deliveredId: subject.id, deliveredTo: receiver.localId, resolvedOrder: inc.intentOrder });
        advanceLatches(inc, sample, dt); notePhase(inc);
        if (inc.latches.extracted && !inc.latches.settled) {
          settleDelivery(rt, inc, subject, inc.bodyList.some((b) => b.role === 'beacon' && b.alive && b.emits));
          this.sectors[rt.sectorId] = 'settled';
          this.ctx.bus.emit('mercyService:completed', { offerId: inc.offerId, uid: inc.uid, incidentId: inc.defId, outcome: inc.outcome });
          if (inc.offerId) this.ctx.bus.emit('mission:venueProof', { missionId: inc.offerId, source: this.name, receiptId: inc.uid, kind: 'rescue-delivered' });
        }
      }
      state.mercyService = state.mercyServicePublic = this.report();
    },
    hurt(body, amount, cause) {
      const entity = this.entity(body); if (!entity || !(amount > 0)) return false;
      const hit = this.ctx.registry?.get?.('combat')?.onHit?.({ targetId: entity.id, ownerId: null, pos: entity.pos,
        damagePacket: { channels: { kinetic: amount }, flags: { allowAnyTarget: true, ignoreFriendlyFire: true } },
        origin: { kind: 'mercyService', id: cause } });
      if (hit?.ok) { body.hull = entity.hull; body.alive = entity.alive; if (!body.alive) body.killedBy = cause; }
      return !!hit?.ok;
    },
    hazards(inc, dt) {
      const port = this.ctx.helpers.combatPhysics;
      for (const hazard of inc.bodyList) {
        if (!hazard.alive || !hazard.damagePerS) continue;
        for (const contact of port?.sampleSolidContacts?.(hazard.entityId) || []) {
          if (!(contact.normalImpulse > 0 || contact.separation <= 0.02)) continue;
          const otherId = contact.sourceId === hazard.entityId ? contact.targetId : contact.sourceId;
          const victim = inc.bodyList.find((b) => b.entityId === otherId && b.alive);
          if (victim) this.hurt(victim, hazard.damagePerS * dt, hazard.localId);
        }
      }
      const fail = inc.def.failure, subject = inc.bodyList.find((b) => b.localId === fail?.subject);
      const hazard = inc.bodyList.find((b) => b.localId === fail?.hazard);
      if (!subject) return;
      let cause = !subject.alive ? subject.killedBy || 'lost' : null;
      if (subject.alive && ((fail.kind === 'spread' && subject.spread >= 1)
        || (fail.kind === 'horizon' && hazard && dist(subject.pos, hazard.pos) < hazard.horizon))) {
        this.hurt(subject, Math.max(1, subject.hull) * 10, fail.kind); if (!subject.alive) cause = fail.kind;
      }
      if (subject.alive && fail.kind === 'capture' && hazard?.alive && !inc.latches.secured && dist(subject.pos, hazard.pos) <= hazard.captureR) {
        subject.owner = 'rival'; cause = 'capture';
      }
      if (!cause) return;
      const owned = inc.bodyList.map((b) => ({ body: b, entity: this.entity(b, true) }));
      failMercyIncident(this.rt, inc, subject, cause);
      if (inc.childUid) {
        for (const { body, entity } of owned) { if (body.clampId) port?.cutAttachment?.({ attachmentId: body.clampId, reason: 'rescue-failed' }); if (entity) this.ctx.helpers.removeEntity(entity.id, { immediate: true }); }
        const child = this.rt.incidents[inc.childUid]; child.offerId = inc.offerId; child.scanUntil = 0;
        for (const b of child.bodyList) this.spawn(b);
        this.ctx.bus.emit('toast', { text: `${child.def.title}. ${child.def.priority}`, kind: 'info', ttl: 8 });
      }
      else if (inc.latches.settled) this.failMission(inc, 'rescue-lost');
      this.ctx.bus.emit('mercyService:failedForward', { uid: inc.uid, childUid: inc.childUid || null, cause });
    },
    verifyMissionProof(p) {
      const m = this.ctx.state.missions?.active?.find((m) => m.id === p?.missionId);
      const inc = this.rt?.incidents?.[p?.receiptId];
      return { ok: !!(m && m.params?.mercyIncidentId && p.source === this.name && p.kind === 'rescue-delivered'
        && inc?.offerId === m.id && inc.latches.extracted && inc.latches.settled && inc.settlementReceipt) };
    },
    failMission(inc, kind) {
      if (this.destroying || !inc.offerId || this.failures[inc.uid]) return;
      const p = { missionId: inc.offerId, source: this.name, receiptId: inc.uid, kind };
      this.failures[inc.uid] = p; this.ctx.bus.emit('mission:venueFailure', p);
    },
    verifyMissionFailure(p) {
      const m = this.ctx.state.missions?.active?.find((m) => m.id === p?.missionId), saved = this.failures[p?.receiptId];
      return { ok: !!(m?.params?.mercyIncidentId && saved && saved.missionId === m.id && p.source === this.name && saved.kind === p.kind) };
    },
    report() {
      if (!this.rt) return { live: true, phase: 'idle' };
      const inc = this.rt.focus;
      return { ...report(this.rt), live: true, title: inc?.def.title, priority: inc?.def.priority,
        order: inc?.intentOrder, orders: inc ? Object.entries(inc.def.orders).map(([id, order]) => ({ id, label: `${order.subject} → ${order.dest}${order.tools.length ? ` (${order.tools.join(', ')})` : ''}`, ...order })) : [],
        bodies: (inc?.bodyList || []).filter((b) => b.alive).map((b) => ({ entityId: b.entityId, localId: b.localId, role: b.role,
          x: b.pos.x, z: b.pos.z, radius: b.radius, hull: b.hull, hullMax: b.hullMax, mass: b.mass, volatile: b.volatile,
          spread: b.spread, clampAttached: b.clampAttached, rigAttached: b.rigAttached, recoveryRadius: b.recoveryRadius,
          tools: ['beacon', 'berth', 'barge', 'well'].includes(b.role) ? [] : ['clamp', 'stabilizer', ...(b.volatile ? ['containment'] : [])] })) };
    },
    serialize() { return { schema: 2, sectors: clone(this.sectors), failures: clone(this.failures), offer: this.offer ? clone(this.offer) : null, runtime: this.rt ? snapshotMercy(this.rt) : null }; },
    deserialize(raw) {
      if (!raw || raw.schema !== 2 || !raw.sectors || typeof raw.sectors !== 'object' || Array.isArray(raw.sectors)) return false;
      if (raw.runtime && (!Number.isFinite(raw.runtime.seed) || !Number.isFinite(raw.runtime.simTime))) return false;
      const next = createMercyRuntime({ seed: raw.runtime?.seed || 1, bus: this.ctx.bus });
      try {
        if (raw.runtime && (!restoreMercy(next, raw.runtime).ok || Object.values(next.bodies).some((b) => !Number.isFinite(b.pos.x) || !Number.isFinite(b.pos.z) || !Number.isFinite(b.vel.x) || !Number.isFinite(b.vel.z)))) return false;
      } catch { return false; }
      this.rt = raw.runtime ? next : null; this.sectors = clone(raw.sectors || {}); this.failures = clone(raw.failures || {}); this.offer = raw.offer ? clone(raw.offer) : null;
      if (this.rt) for (const b of Object.values(this.rt.bodies)) if (b.alive) this.spawn(b);
      this.ctx.state.mercyService = this.ctx.state.mercyServicePublic = this.report();
      return true;
    },
    noteShipLoss() {
      if (!this.rt) return;
      for (const inc of Object.values(this.rt.incidents)) {
        if (inc.latches.settled || inc.failedForward) continue;
        this.failMission(inc, 'rescue-lost');
      }
    },
    leave(kind = 'rescue-left') {
      if (!this.rt) return;
      for (const inc of Object.values(this.rt.incidents)) if (!inc.latches.settled && !inc.failedForward) {
        if (kind === 'rescue-lost') settleLost(this.rt, inc, 'ship_loss'); else settleLeave(this.rt, inc);
        this.failMission(inc, kind);
      }
      for (const body of Object.values(this.rt.bodies)) { if (body.clampId) this.ctx.helpers.combatPhysics?.cutAttachment?.({ attachmentId: body.clampId, reason: 'sector-exit' }); const e = this.entity(body, true); if (e) this.ctx.helpers.removeEntity(e.id, { immediate: true }); }
      this.rt = null; this.offer = null;
      this.ctx.state.mercyService = this.ctx.state.mercyServicePublic = this.report();
    },
    destroy() { this.destroying = true; this.leave(); for (const off of this.off || []) off(); this.off = []; },
  };
}
