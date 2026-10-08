import { RED_KITE as C, RED_KITE_START, RED_KITE_GATES, RED_KITE_MARKS, RED_KITE_LINES,
  redKiteClass, freshRedKiteMemory, normalizeRedKiteMemory, validRedKiteReceipt } from '../data/redKite.js';
import { redKiteGateFrame, redKiteGateCrossing, redKiteCourseObstruction } from '../characters/redKiteRules.js';
import { makeShipEntitySpec } from './ships.js';
import { ManeuverPlanner } from '../ai/maneuver.js';
import { ManeuverKind } from '../ai/contracts.js';
import { getCombatKernel } from '../combat/kernel.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';
import { redKitePhysicalBody } from '../data/redKiteBody.js';

const owners = new WeakMap();
const pose = e => ({ x: e.pos.x, z: e.pos.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ACTIVE = new Set(['countdown', 'race']);
export const RED_KITE_LAUNCH = Object.freeze({ x: RED_KITE_START.x + 75, z: RED_KITE_START.z });

export function redKiteCourierSpec(memory = freshRedKiteMemory()) {
  const saved = memory.courierPose;
  const spec = makeShipEntitySpec('ship_hornet', { team: 2, factionId: 'faction_free',
    pos: saved ? { x: saved.x, z: saved.z } : RED_KITE_LAUNCH,
    rot: saved?.rot ?? Math.atan2(RED_KITE_GATES[0].pos.z - RED_KITE_START.z, RED_KITE_GATES[0].pos.x - RED_KITE_START.x),
    ai: { passive: true, holdFire: true } });
  Object.assign(spec, { name: 'Red Kite', mass: C.mass, radius: C.radius, hull: memory.courierHull,
    hullMax: C.hull, thrust: C.mainAccel, maxSpeed: C.maxSpeed, weapons: [],
    flags: { persistent: true }, vel: saved ? { x: saved.vx, z: saved.vz } : { x: 0, z: 0 },
    physicsBody: redKitePhysicalBody() });
  spec.data = { ...spec.data, weapons: [], fittings: [], miningBeam: null,
    authoredCharacter: 'red_kite', authoredAssetId: C.assetId,
    redKiteActorId: C.actorId, identityKey: C.actorId, persistenceOwner: 'redKite', homeSectorId: C.sectorId,
    scanLabel: 'Red Kite · optional three-handoff relay', callsign: 'RED KITE',
    ai: { passive: true, holdFire: true, archetype: 'fleeing_trader' },
    flightModel: { flightClass: 'scout', mass: C.mass, inertia: 3000, mainAccel: C.mainAccel,
      reverseAccel: 26, strafeAccel: 28, angularAccel: C.yawAccel, angularBrake: 12,
      maxYawRate: 2.8, maxSpeed: C.maxSpeed, boostMult: 1, boostMaxSpeedMult: 1, normalMaxSpeedMult: 1,
      linearDrag: 0, lateralDrag: 0, assistStrength: 0, reverseBrake: 2.4 } };
  // The ordinary ship factory also owns a top-level flightModel. Replace that
  // source model too; otherwise its Hornet profile outranks these derived values.
  spec.flightClass = 'scout'; spec.flightModel = spec.data.flightModel;
  spec.data.derived = { ...spec.data.derived, mass: C.mass, radius: C.radius, hull: memory.courierHull,
    hullMax: C.hull, flightClass: 'scout', flightModel: spec.flightModel, maxSpeed: C.maxSpeed };
  delete spec.data.flightModel;
  return spec;
}

export const redKite = {
  name: 'redKite',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._memory = normalizeRedKiteMemory(ctx.state.redKite); this.state.redKite = this._memory;
    this._courier = null; this._courierLife = null; this._marks = new Map(); this._run = null;
    this._phase = 'await'; this._revision = 0; this._restoring = false; this._lastFlavor = -90;
    this._lastTick = -1; this._nextSafety = 0; this._nextPayment = 0; this._handoff = null;
    this._planner = new ManeuverPlanner({ seed: ctx.state.meta.seed, config: { squadFrames: false, includeTrajectory: false,
      interceptSpeed: 72, approachSpeed: 62, reflexes: false } });
    owners.set(this.state, this); this._subs = [];
    const on = (event, fn) => this._subs.push(this.bus.on(event, fn));
    on('scan:pulse', p => this._scan(p));
    on('redKite:inspect', () => this.offer());
    on('redKite:start', p => { const result = this.start(p?.revision); if (!result.ok) { this._toast(`Relay refused — ${result.reason}.`); this.offer(); } });
    on('redKite:course', () => this.bus.emit('ui:setCourse', { pos: { ...RED_KITE_START }, sectorId: C.sectorId, label: 'Red Kite · public timing buoy' }));
    on('tether:attached', () => {
      const player = this._player();
      if (player && getCombatKernel(this.ctx).attachments.listForEntity(player.id).some(a => a.state === 'active')) this._memory.lineUsed = true;
    });
    on('combat:damage', p => {
      if (ACTIVE.has(this._phase) && [this.state.playerId, this._courier?.id].includes(p?.targetId)
        && p.origin?.kind !== 'impact' && p.origin?.kind !== 'collision'
        && (p.weaponId || p.attackerId != null || p.emp === true)) this.abort('combat');
    });
    on('combat:fire', p => {
      if (ACTIVE.has(this._phase) && p?.ownerId === this.state.playerId) this.abort('combat');
    });
    on('physics:impact', p => { if (this._run && (p?.playerInvolved || [p?.aId, p?.bId].includes(this._courier?.id))) this._run.clean = false; });
    on('entity:killed', p => { if (p?.id === this._courier?.id || p?.targetId === this._courier?.id) this._captureCourierLoss(); });
    on('sector:exit', () => { this.abort('left_course'); });
    on('save:restoring', () => { this._restoring = true; this.abort('continue'); this._courier = null; this._marks.clear(); });
    on('save:loaded', () => this.afterContinue());
  },
  _player() { const e = this.state.entities.get(this.state.playerId); return e?.alive ? e : null; },
  _currentCourier() {
    const e = this._courier;
    return e?.alive && this.state.entities.get(e.id) === e && e.occupantGeneration === this._courierLife
      && e.data?.redKiteActorId === C.actorId ? e : null;
  },
  _captureCourierLoss() {
    const e = this._courier;
    if (!e || this.state.entities.get(e.id) !== e || e.occupantGeneration !== this._courierLife || !(e.hull <= 0)) return;
    this._memory.courierDestroyed = true; this._memory.courierHull = 0; this._handoff = null;
    this.abort('courier_lost'); this._revision++;
  },
  _capture() {
    this._captureCourierLoss(); const e = this._currentCourier(); if (!e) return;
    this._memory.courierHull = Math.max(0, Math.min(C.hull, e.hull));
    this._memory.courierPose = { x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z, rot: e.rot };
  },
  _materialize() {
    if (this._restoring || this.state.world?.currentSectorId !== C.sectorId) return;
    for (const mark of RED_KITE_MARKS) {
      let e = this._marks.get(mark.id);
      if (!e?.alive || this.state.entities.get(e.id) !== e) {
        e = this.state.entityList.find(e => e.alive && e.data?.redKiteMark === mark.id);
        if (!e) e = this.helpers.spawnEntity({ type: 'poi', name: mark.label, team: 2, pos: mark.pos,
          radius: 7, mass: 0, hull: 1, hullMax: 1, collides: false, physicsBody: false,
          flags: { invuln: true }, data: { redKiteMark: mark.id, poiId: mark.id, homeSectorId: C.sectorId,
            scannerSignalKind: 'archive', scanLabel: mark.label, navLabel: mark.label } });
        if (e) this._marks.set(mark.id, e);
      }
    }
    if (this._memory.courierDestroyed || this._currentCourier()) return;
    const existing = this.state.entityList.find(e => e.alive && e.data?.redKiteActorId === C.actorId);
    if (existing) { this._courier = existing; this._courierLife = existing.occupantGeneration; return; }
    if (!this.helpers.spawnBudget || this.helpers.spawnBudget.request(1, C.actorId) < 1) return;
    const e = this.helpers.spawnEntity(redKiteCourierSpec(this._memory));
    if (!e) { this.helpers.spawnBudget.release?.(C.actorId); return; }
    this.helpers.spawnBudget.bindEntity(e.id, C.actorId); this._courier = e; this._courierLife = e.occupantGeneration;
  },
  _scan(p) {
    const player = this._player();
    if (this._restoring || this.state.mode !== 'flight' || !player || p?.source !== 'player-scanner'
      || p.scannerId !== player.id || !p.pos || distance(p.pos, player.pos) > 2) return;
    const target = this.state.entities.get(this.state.player.targetId);
    if (!target?.alive || (target !== this._currentCourier() && target !== this._marks.get('poi_red_kite_start'))
      || distance(player.pos, target.pos) > C.hailRange) return;
    this.offer();
  },
  _obstruction(radius = C.gateRadius) {
    return redKiteCourseObstruction(this.state.entityList, new Set([this.state.playerId, this._courier?.id,
      ...[...this._marks.values()].map(e => e.id)]), radius);
  },
  _combatActive() {
    const ids = new Set([this.state.playerId, this._currentCourier()?.id].filter(id => id != null));
    return this.state.entityList.some(e => e.alive && e.type === 'ship' && !ids.has(e.id)
      && ids.has(e.data?.combat?.targetId) && e.data?.ai?.passive !== true
      && distance(e.pos, this._player()?.pos || RED_KITE_START) < 1800);
  },
  readiness() {
    const player = this._player(), courier = this._currentCourier();
    if (this._restoring || this.state.mode !== 'flight' || this.state.world?.currentSectorId !== C.sectorId || !player || this.state.ui?.docked) return { ok: false, reason: 'reach the surveyed Ceres route' };
    if (!this._memory.lineUsed) return { ok: false, reason: 'try your MassLine first' };
    if (ACTIVE.has(this._phase)) return { ok: false, reason: 'a relay is already running' };
    if (this._combatActive()) return { ok: false, reason: 'combat in the course' };
    if (distance(player.pos, RED_KITE_START) > C.startRange || Math.hypot(player.vel.x, player.vel.z) > 12) return { ok: false, reason: 'slow at the timing buoy to start' };
    if (!this._memory.courierDestroyed && (!courier || distance(courier.pos, RED_KITE_LAUNCH) > C.startRange || Math.hypot(courier.vel.x, courier.vel.z) > 12)) return { ok: false, reason: 'the courier is physically returning to the start' };
    const radius = Math.min(145, Math.max(C.gateRadius, (player.radius || 1) * 3));
    if (this._obstruction(radius)) return { ok: false, reason: 'a heavy body obstructs the surveyed corridor' };
    return { ok: true, player, courier, radius, hullClass: redKiteClass(player), solo: this._memory.courierDestroyed };
  },
  offer() {
    if (this._restoring || this.state.world?.currentSectorId !== C.sectorId) return false;
    const player = this._player(), selected = this.state.entities.get(this.state.player?.targetId);
    if (!player || distance(player.pos, selected?.pos || RED_KITE_START) > C.hailRange || ACTIVE.has(this._phase)) return false;
    if (!this._memory.met) { this._memory.met = true; this._say('offer'); }
    const ready = this.readiness();
    this.bus.emit('redKite:offer', { revision: this._revision, canStart: ready.ok, reason: ready.reason || 'READY', solo: this._memory.courierDestroyed,
      detail: 'About 60–90 seconds: falling corner → outside handoff → long return. Fly through each marked plane in order and forward; choose your own route. Ordinary collision and damage rules apply. Combat or a blocked corridor stops the clock. No entry fee or cargo escrow. First completion: 240 cr; retries record times only. Courier thrust and speed are fixed, with no rubber-banding.' });
    return true;
  },
  start(revision = null) {
    if (revision != null && revision !== this._revision) return { ok: false, reason: 'offer changed' };
    const ready = this.readiness(); if (!ready.ok) return ready;
    this._memory.sequence++; this._revision++;
    this._run = { sequence: this._memory.sequence, player: ready.player, playerLife: ready.player.occupantGeneration,
      courier: ready.courier, courierLife: ready.courier?.occupantGeneration, radius: ready.radius, hullClass: ready.hullClass,
      playerRadius: ready.player.radius, shipId: ready.player.data?.shipId, solo: ready.solo, clean: true,
      countdownEnd: (this.state.tick | 0) + C.countdownTicks, startedTick: null, previousPlayer: pose(ready.player),
      previousCourier: ready.courier ? pose(ready.courier) : null, playerGate: 0, courierGate: 0, playerGates: [], courierGates: [], courierTicks: null };
    this._phase = 'countdown'; this._handoff = null;
    this._toast('Three seconds. Hold at the buoy; flight remains yours.');
    this.bus.emit('redKite:started', { sequence: this._run.sequence, countdownEnd: this._run.countdownEnd });
    return { ok: true };
  },
  abort(reason) {
    if (!ACTIVE.has(this._phase)) return false;
    const run = this._run; this._run = null; this._phase = 'await'; this._revision++; this._handoff = null;
    this._toast(reason === 'combat' ? RED_KITE_LINES.attack_abort : `Clock stopped — ${reason.replaceAll('_', ' ')}. No fee was taken; no finish or reward was recorded.`);
    this.bus.emit('redKite:aborted', { sequence: run.sequence, reason }); return true;
  },
  _advance(e, previous, index, ledger, ticks) {
    if (index < 3 && redKiteGateCrossing(previous, e.pos, index, this._run.radius)) {
      ledger.push({ id: RED_KITE_GATES[index].id, tick: ticks });
      if (e === this._run.courier) this._handoff = { id: `${C.courseId}:run:${this._run.sequence}:courier:${index}`, gateIndex: index, atTick: this.state.tick, life: e.occupantGeneration };
      else this._toast(`Handoff ${index + 1}/3 confirmed${index < 2 ? ` — next: ${RED_KITE_GATES[index + 1].label}.` : '.'}`);
      index++;
    }
    return index;
  },
  _finish(ticks) {
    const run = this._run;
    if (!run || this._phase !== 'race' || this._combatActive() || this._obstruction(run.radius)) { this.abort('course_changed'); return; }
    const receipt = { id: `${C.courseId}:run:${run.sequence}`, sequence: run.sequence, courseId: C.courseId,
      courseVersion: C.courseVersion, hullClass: run.hullClass, ticks, clean: run.clean, solo: run.solo,
      won: !run.courierTicks || ticks < run.courierTicks, courierTicks: run.courierTicks, gates: run.playerGates.map(g => ({ ...g })) };
    if (!validRedKiteReceipt(receipt)) { this.abort('invalid_finish'); return; }
    // Reserve the physical outcome before presentation/payment callbacks can re-enter.
    this._phase = 'await'; this._run = null; this._revision++; this._memory.lastResult = receipt;
    if (!this._memory.firstCompletion) this._memory.firstCompletion = structuredClone(receipt);
    if (run.clean) this._memory.cleanCompletions++;
    const key = `${run.hullClass}:${run.solo ? 'solo' : 'live'}`, best = this._memory.bestTimesByCourseAndHullClass[key];
    if (!best || ticks < best) this._memory.bestTimesByCourseAndHullClass[key] = ticks;
    this._toast(`${run.solo ? 'Public time trial' : receipt.won ? 'Ahead of Red Kite' : 'Red Kite arrived first'} — ${(ticks / 60).toFixed(2)} s · ${run.hullClass}${run.clean ? ' · clean' : ' · ordinary contact recorded'}. Best ${(this._memory.bestTimesByCourseAndHullClass[key] / 60).toFixed(2)} s.`);
    if (!run.solo) this._say(receipt.won ? 'win' : 'loss');
    this.bus.emit('redKite:finished', structuredClone(receipt)); this._settleFirst();
  },
  firstCompletionReceipt(id) { const r = this._memory.firstCompletion; return r?.id === id && validRedKiteReceipt(r) ? structuredClone(r) : null; },
  _settleFirst() {
    const receipt = this._memory.firstCompletion;
    if (receipt) return this.ctx.registry.get('missions')?.settleRedKiteRelay?.(receipt.id);
    return null;
  },
  _motor() {
    const e = this._currentCourier(); if (!e || !physicsBodyNativeReady(e) || !this.helpers.aiManeuver?.request) return;
    const run = this._run, racing = this._phase === 'race' && run?.courier === e && run.courierGate < 3;
    const frame = racing ? redKiteGateFrame(run.courierGate) : null;
    let target = RED_KITE_LAUNCH, courseBrake = false;
    if (frame) {
      const before = (e.pos.x - frame.pos.x) * frame.nx + (e.pos.z - frame.pos.z) * frame.nz;
      const across = (e.pos.x - frame.pos.x) * -frame.nz + (e.pos.z - frame.pos.z) * frame.nx;
      const approach = { x: frame.pos.x - frame.nx * 350, z: frame.pos.z - frame.nz * 350 };
      if (run.courierApproachGate !== run.courierGate || (run.courierCrossing && before > 80)) {
        run.courierApproachGate = run.courierGate; run.courierCrossing = false;
      }
      const sidewaysSpeed = e.vel.x * -frame.nz + e.vel.z * frame.nx;
      const aligned = Math.cos(e.rot) * frame.nx + Math.sin(e.rot) * frame.nz;
      if (!run.courierCrossing && distance(e.pos, approach) < 120 && Math.abs(across) < run.radius * .6
        && Math.abs(sidewaysSpeed) < 8 && aligned > .95 && before < -75)
        run.courierCrossing = true;
      courseBrake = !run.courierCrossing && Math.hypot(e.vel.x, e.vel.z) > 12
        && (Math.abs(sidewaysSpeed) > 8 || aligned < .9);
      // A missed aperture returns behind that same plane; reverse crossings still
      // cannot score. The existing ship controller owns all acceleration/braking.
      target = run.courierCrossing ? { x: frame.pos.x + frame.nx * 180, z: frame.pos.z + frame.nz * 180 } : approach;
    }
    const perception = this.helpers.aiSensors?.liveFrameFor?.(e.id, this.state.tick) || { self: { id: e.id,
      pos: pose(e), vel: { x: e.vel.x, z: e.vel.z }, rot: e.rot, radius: e.radius }, contacts: [], events: [] };
    const behavior = { maneuver: { kind: racing ? ManeuverKind.FORMATION : ManeuverKind.HOLD,
      enemyMindOwned: true, ...(racing ? { flightPoint: target, faceAngle: Math.atan2(frame.nz, frame.nx) } : {}), formationSlot: target,
      formationVelocity: { x: 0, z: 0 }, formationBound: 0, breakFormation: true, reason: 'red-kite-fixed-course' } };
    const request = this._planner.plan({ tick: this.state.tick, entityId: e.id, perception, behavior,
      directive: { formation: { slot: target, velocity: { x: 0, z: 0 }, bound: 0, breakFormation: true } } });
    this.helpers.aiManeuver.request({ ...request, boost: false, brake: request.brake || courseBrake });
  },
  _say(key) {
    if (this.state.simTime - this._lastFlavor < 90) return;
    this._lastFlavor = this.state.simTime;
    const text = `RED KITE: ${RED_KITE_LINES[key]}`;
    if (this.helpers.voice?.say) this.helpers.voice.say({ id: `red-kite:${key}`, channel: 'comms', priority: 28, text, ttl: 6 });
    else this._toast(text);
  },
  _toast(text) { this.bus.emit('toast', { text, kind: 'info', ttl: 5 }); },
  update(_dt, state) {
    if (this._restoring || state.mode !== 'flight' || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')) return;
    if (state.tick === this._lastTick) return; this._lastTick = state.tick;
    this._capture(); this._materialize();
    if (state.world?.currentSectorId !== C.sectorId) { this.abort('left_course'); return; }
    const player = this._player(), run = this._run;
    if (player && !this._memory.lineUsed && getCombatKernel(this.ctx).attachments.listForEntity(player.id).some(a => a.state === 'active')) this._memory.lineUsed = true;
    if (ACTIVE.has(this._phase)) {
      if (!player || player !== run.player || player.occupantGeneration !== run.playerLife
        || player.radius !== run.playerRadius || player.data?.shipId !== run.shipId
        || (!run.solo && (this._currentCourier() !== run.courier || run.courier.occupantGeneration !== run.courierLife))) this.abort('body_changed');
      else if (this._combatActive()) this.abort('combat');
      else if (state.tick >= this._nextSafety && this._obstruction(run.radius)) this.abort('obstruction');
      else if (this._phase === 'countdown') {
        if (distance(player.pos, RED_KITE_START) > C.startRange || Math.hypot(player.vel.x, player.vel.z) > 12) this.abort('left_start_early');
        else if (state.tick >= run.countdownEnd) {
          this._phase = 'race'; run.startedTick = state.tick; run.previousPlayer = pose(player);
          run.previousCourier = run.courier ? pose(run.courier) : null; this._toast('Clock live — falling corner first. Choose your route.');
        }
      } else {
        const ticks = state.tick - run.startedTick;
        if (ticks > C.deadlineTicks || state.ui?.docked) this.abort('clock_expired');
        else {
          if (run.courier && run.courierGate < 3) {
            run.courierGate = this._advance(run.courier, run.previousCourier, run.courierGate, run.courierGates, ticks);
            run.previousCourier = pose(run.courier); if (run.courierGate === 3) run.courierTicks = ticks;
          }
          run.playerGate = this._advance(player, run.previousPlayer, run.playerGate, run.playerGates, ticks);
          run.previousPlayer = pose(player); if (run.playerGate === 3) this._finish(ticks);
        }
      }
      if (state.tick >= this._nextSafety) this._nextSafety = state.tick + 15;
    }
    this._motor();
    if (state.simTime >= this._nextPayment) { this._nextPayment = state.simTime + 1; this._settleFirst(); }
  },
  serialize() { this._capture(); return structuredClone(this._memory); },
  deserialize(raw) {
    this.abort('continue'); this._memory = normalizeRedKiteMemory(raw); this.state.redKite = this._memory;
    this._courier = null; this._marks.clear(); this._run = null; this._phase = 'await'; this._handoff = null;
    this._planner.byEntity.clear(); this._lastTick = -1; this._revision++; this._nextPayment = 0;
  },
  afterContinue() { this._restoring = false; this._courier = null; this._marks.clear(); this._lastTick = -1; this._revision++; },
  newGame() {
    for (const e of [...this.state.entityList]) if (e.data?.redKiteActorId === C.actorId || e.data?.redKiteMark) this.helpers.removeEntity(e.id);
    this.deserialize(null); this._restoring = false;
  },
  destroy() { for (const off of this._subs || []) off(); owners.delete(this.state); this._planner?.byEntity.clear(); },
};

export function redKitePresentation(state, entity) {
  const owner = owners.get(state), physics = owner?.ctx.registry?.get('physics'), native = physics?._sg02;
  const record = native?.records.get(entity?.id), age = state.tick - native?._simTick;
  if (!owner || entity !== owner._currentCourier() || state.mode !== 'flight' || state.world?.currentSectorId !== C.sectorId
    || physics?._diag?.backend !== 'rapier-dynamic' || physics._diag.sg02Ready !== true
    || !physicsBodyNativeReady(entity) || record?.entity !== entity || !record.body
    || record._postStepReadTick !== native.tick || !Number.isInteger(native._simTick) || age < 0 || age > 2) return null;
  // Native ticks restart on Continue. Their current record and the last solved simulation
  // tick establish freshness without turning on fleet-wide diagnostic telemetry.
  const profile = resolveFlightProfile(entity, state), force = record.appliedForce;
  const forward = force.x * Math.cos(entity.rot) + force.z * Math.sin(entity.rot);
  const handoff = owner._handoff;
  return { phase: owner._phase, throttle: Math.max(0, Math.min(1, forward / (profile.mass * profile.mainAccel))),
    angularAcceleration: record.appliedTorque.y / (record.effectiveInertiaY || record.spec.inertiaY),
    handoffReceipt: handoff && handoff.life === entity.occupantGeneration && Number.isInteger(handoff.atTick)
      && handoff.atTick <= state.tick && state.tick - handoff.atTick <= 42 ? { ...handoff } : null };
}
