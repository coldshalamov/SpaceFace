/** SWITCHBACK's fixed-step production adapter. All movement crosses physicsAuthority. */
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, resolvePhysicsBodySpec, writePhysicsControl } from '../../core/physicsAuthority.js';
import { Masks } from '../../core/entity.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { setEntityDoctrine, ActivityKind, RulesOfEngagement } from '../../ai/doctrine.js';
import { createConvoyRoute } from './route.js';
import { createTrain, synchronizeTrain, planTrainStep, severCoupler, damageCoupler,
  markBodyLost, getCouplerGeometry, serializeTrain, restoreTrain, braceTrain } from './train.js';
import { createRaid, advanceRaid, serializeRaid, restoreRaid } from './controller.js';
import { SWITCHBACK, SWITCHBACK_RECEIPTS } from './catalog.js';

const RUNTIMES = new WeakMap();
const MAX_ACTORS = 12;
const MAX_COMMANDS = 16;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const point = e => ({ x: finite(e?.pos?.x), z: finite(e?.pos?.z), vx: finite(e?.vel?.x), vz: finite(e?.vel?.z) });
const live = e => !!e && e.alive !== false && finite(e.hull, 1) > 0;
const plain = value => JSON.parse(JSON.stringify(value));
const ownTag = e => e?.data?.convoyRaid;
const stable = value => typeof value === 'string' && value.length > 0 && value.length <= 120 ? value : null;
const validRunId = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,100}$/.test(value);
const FREIGHT_MASK = Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE | Masks.PAYLOAD;

export function switchbackEntryPoint() {
  return sectorLocalToGlobalForSector(SWITCHBACK.origin, SWITCHBACK.sectorId);
}

export function getConvoyRaidRuntime(state) { return RUNTIMES.get(state) || null; }

function emptyStore() { return { schemaVersion: 1, active: null, receipts: [], offered: false, nextOfferAt: 0 }; }
function storeOf(state) {
  if (!state.convoyRaid || state.convoyRaid.schemaVersion !== 1) state.convoyRaid = emptyStore();
  return state.convoyRaid;
}

/** Authored container identity goes through the existing payload renderer and measured collider. */
export function buildFreightEntitySpec(body, record) {
  return {
    type: 'payload', team: 2, factionId: SWITCHBACK.factionId,
    pos: { x: body.x, z: body.z }, vel: { x: body.vx, z: body.vz },
    rot: body.angle, angVel: body.omega, radius: body.radius, mass: body.mass,
    hull: body.hp, hullMax: body.maxHp || body.hp, collides: true, collisionMask: FREIGHT_MASK, drag: 0,
    flags: { persistent: true, missionPinned: true },
    physicsBody: { schemaVersion: 1, shape: 'capsule', dynamic: true, ccd: true,
      mass: body.mass, radius: body.radius, inertiaY: body.inertia, material: 'payload',
      // Payload defaults damp spin. This freight instead coasts after release; finite coupled
      // yaw thrusters and real contacts are the only attitude changes while no power acts on it.
      contact: { angularDamping: 0 } },
    data: {
      typeId: 'pod_cargo_container', authoredPayloadAssetId: 'pod_cargo_container',
      proportions: body.role === 'tug' ? { length: 1.72, halfWidth: 0.26, height: 0.38 }
        : { length: 2, halfWidth: body.halfWidth / body.radius, height: 0.5 },
      payloadStableId: `${record.id}:${body.id}`, persistenceOwner: 'convoyRaid',
      homeSectorId: record.sectorId, transitCritical: true, masslineTetherable: true,
      scanLabel: body.target ? `${body.serial || body.id} · SPINDLE CARRIER · release both joints`
        : `${body.serial || body.id} · industrial freight`,
      name: body.target ? 'SWITCHBACK spindle carrier' : 'SWITCHBACK freight carriage',
      convoyRaid: { runId: record.id, bodyId: body.id, role: body.role, target: body.target === true },
      // A contract carriage is not a pickup. No commodity or amount field can auto-scoop it.
      loot: [], salvagePool: {},
    },
  };
}

/**
 * Pure adapter construction; production.js supplies the real ships/combat builders. Keeping the
 * imports there lets the verified scoped source run core/authority tests without omitted assets.
 */
export function createConvoyRaidSystem({ makeShipEntitySpec, makeEnemySpawnSpec } = {}) {
  return {
    name: 'convoyRaid',
    init(ctx) {
      if (this._state) this.destroy();
      this._state = ctx.state; this._bus = ctx.bus; this._helpers = ctx.helpers || {};
      this._registry = ctx.registry; this._unsub = []; this._commands = []; this._pausedForLoad = false;
      this._shipBuilder = makeShipEntitySpec; this._enemyBuilder = makeEnemySpawnSpec;
      this._lastUpdateTick = null; this._lastAiAt = -1;
      storeOf(ctx.state); RUNTIMES.set(ctx.state, this);
      const on = (name, fn) => {
        const off = ctx.bus?.on?.(name, fn); if (typeof off === 'function') this._unsub.push(off);
      };
      on('convoyRaid:command', p => this.command(p));
      on('combat:damage', p => this._onDamage(p));
      on('tether:attached', p => this._onTether(p));
      on('fields:hitchLatched', p => this._onFieldHitch(p));
      // fields._tryMarkPullTarget emits only after the player's mark actually schedules.
      on('fields:pullMarked', p => this._onHandledBody(p?.targetId));
      on('entity:killed', p => this._onGone(p));
      on('entity:destroyed', p => this._onGone(p));
      on('save:restoring', () => { this._pausedForLoad = true; this._commands.length = 0; });
      on('save:loaded', () => { this._pausedForLoad = false; this._lastUpdateTick = null; this.rebind(); });
      on('save:error', () => { this._pausedForLoad = false; });
      on('game:new', () => this.newGame());
      on('sector:exit', p => {
        if (this._pausedForLoad || p?.continuous === true || p?.continuousHandoff === true) return;
        const record = storeOf(this._state).active;
        if (record && record.raid.phase !== 'settled') this._commands.push({ type: 'abandon' });
      });
    },

    newGame() {
      this._commands.length = 0;
      this._lastUpdateTick = null;
      this._state.convoyRaid = emptyStore();
    },

    _owner(name) { return this._registry?.get?.(name) || null; },
    _emit(name, payload) { this._bus?.emit?.(name, payload); },
    _say(text, key = 'status') {
      const record = storeOf(this._state).active;
      if (this._helpers.voice?.say) this._helpers.voice.say({ channel: 'info', text, kind: 'encounter', factionId: SWITCHBACK.factionId });
      else this._emit('toast', { text, kind: 'info', ttl: 5 });
      this._emit('convoyRaid:cue', { runId: record?.id || null, key, text, simTime: this._state.simTime || 0 });
    },

    /** Public entry validates geography; a repeated proximity tick cannot repeatedly offer it. */
    requestOffer() {
      const s = this._state, store = storeOf(s), p = s.entities?.get(s.playerId), entry = switchbackEntryPoint();
      if (s.mode !== 'flight' || s.world?.currentSectorId !== SWITCHBACK.sectorId || !live(p)
        || s.run?.kind === 'survival' && s.run.phase !== 'inactive' || s.physicsVenue?.active
        || store.offered || store.active || store.receipts.length || s.simTime < store.nextOfferAt
        || Math.hypot(p.pos.x - entry.x, p.pos.z - entry.z) > SWITCHBACK.entryRadius) return false;
      const director = this._owner('encounterDirector');
      if (typeof director?.requestAuthoredEncounter !== 'function') return false;
      store.nextOfferAt = (s.simTime || 0) + 5;
      const result = director.requestAuthoredEncounter({
        shapeId: SWITCHBACK.encounterId, encounterId: `switchback:${s.meta?.seed >>> 0}`,
        sectorId: SWITCHBACK.sectorId, zoneId: 'switchback_outer_freight', zoneName: 'Outer freight switchback',
        zoneType: 'mining_belt', zoneRadius: SWITCHBACK.entryRadius, anchor: entry, respectPacing: true,
      });
      if (result?.ok) store.offered = true;
      return result || false;
    },

    /** No body exists until the player takes the optional offer. Starts atomically or rolls back. */
    start({ runId, choice, seed = this._state?.meta?.seed, encounterId = runId } = {}) {
      const s = this._state, store = storeOf(s), id = validRunId(runId) ? runId : null, player = s.entities?.get(s.playerId);
      if (!id || !['escort', 'theft'].includes(choice)) return { ok: false, reason: 'invalid_choice' };
      if (store.active) return { ok: store.active.id === id && store.active.raid.phase !== 'settled', reason: 'already_started' };
      if (store.receipts.some(r => r.runId === id)) return { ok: false, reason: 'already_settled' };
      const entry = switchbackEntryPoint();
      if (s.mode !== 'flight' || s.world?.currentSectorId !== SWITCHBACK.sectorId || !live(player)
        || Math.hypot(player.pos.x - entry.x, player.pos.z - entry.z) > SWITCHBACK.entryRadius + 80) return { ok: false, reason: 'outside_lane' };
      if (typeof this._helpers.spawnEntity !== 'function' || typeof this._shipBuilder !== 'function'
        || typeof this._enemyBuilder !== 'function') return { ok: false, reason: 'owner_builders_unavailable' };
      const route = createConvoyRoute({ seed, origin: entry, heading: SWITCHBACK.heading });
      let train = null;
      // Admission alone chooses a clear starting formation. A live body is never repositioned.
      const solids = (s.entityList || [player]).filter(e => live(e) && e.collides !== false
        && ['ship', 'station', 'asteroid', 'payload', 'wreck'].includes(e.type));
      for (const routeDistance of [180, 280, 380, 480]) {
        const candidate = createTrain({ seed, id, carriageCount: SWITCHBACK.carriageCount, route,
          routeDistance, speed: SWITCHBACK.speed });
        const target = candidate.bodies.find(b => b.id === candidate.targetId);
        const actorPositions = [...candidate.bodies,
          { x: target.x, z: target.z + 100, radius: 30 },
          { x: target.x - 26, z: target.z - 100, radius: 30 },
          ...['lawful', 'illicit'].map(kind => ({ x: route.receivers[kind].x - route.fork.nz * 55,
            z: route.receivers[kind].z + route.fork.nx * 55, radius: 19 }))];
        if (actorPositions.every(b => solids.every(e => Math.hypot(b.x - e.pos.x, b.z - e.pos.z)
          > b.radius + finite(e.radius, 12) + 8))) { train = candidate; break; }
      }
      if (!train) return { ok: false, reason: 'lane_occupied' };
      const record = { schemaVersion: 1, id, seed: seed >>> 0, sectorId: SWITCHBACK.sectorId,
        encounterId: stable(encounterId) || id, train, raid: null, bindings: {}, escortBindings: [],
        raiderBindings: [], receiverBindings: {}, effects: {}, lastAttacker: {}, recovery: {}, startedAt: s.simTime || 0 };
      record.raid = createRaid({ runId: id, seed, train, simTime: s.simTime || 0, sectorId: record.sectorId });
      const spawned = [];
      const budget = this._helpers.spawnBudget, requester = `convoyRaid:${id}`;
      const reserve = budget?.request ? budget.request(3, requester) : 3;
      if (reserve < 3) { budget?.release?.(requester); return { ok: false, reason: 'spawn_budget' }; }
      try {
        for (const body of train.bodies) {
          let spec = buildFreightEntitySpec(body, record);
          if (body.role === 'tug') {
            const hull = this._shipBuilder('ship_hawser', { team: 2, factionId: SWITCHBACK.factionId,
              pos: { x: body.x, z: body.z }, rot: body.angle, ai: null });
            spec = { ...hull, ...spec, type: 'ship', data: { ...hull.data, ...spec.data, typeId: undefined,
              authoredPayloadAssetId: undefined, defId: 'ship_hawser', ai: null, intent: null } };
          }
          const entity = this._spawn(spec, spawned);
          record.bindings[body.id] = this._binding(entity, body.id);
          if (body.role === 'tug') budget?.bindEntity?.(entity.id, requester);
        }
        const target = train.bodies.find(b => b.id === train.targetId);
        for (let i = 0; i < 2; i++) {
          const spec = this._enemyBuilder(i ? 'patrol_lawman' : 'warden_escort', 2,
            { x: target.x - 26 * i, z: target.z + (i ? -1 : 1) * 100 },
            { factionId: SWITCHBACK.factionId, startedTick: s.tick || 0, motive: 'protect_freight',
              engagementTrigger: 'defend_freight', zoneId: 'switchback_outer_freight',
              approachTelegraph: 'Freight escort holds close to the marked carriage.', noFireResponseWindowS: 1.2 });
          spec.team = 2; spec.flags = { ...spec.flags, persistent: true, missionPinned: true };
          spec.data = { ...spec.data, persistenceOwner: 'convoyRaid', homeSectorId: record.sectorId,
            transitCritical: true, convoyRaid: { runId: id, bodyId: `escort:${i}`, role: 'escort' },
            scanLabel: i ? 'Switchback cutter · separates thief from cargo' : 'Switchback warden · recovers freight',
            loot: [], lootTableId: null, bountyCr: 0 };
          const entity = this._spawn(spec, spawned);
          budget?.bindEntity?.(entity.id, requester);
          record.escortBindings.push(this._binding(entity, `escort:${i}`));
        }
        for (const kind of ['lawful', 'illicit']) {
          const receiver = route.receivers[kind], normal = route.fork || { nx: 1, nz: 0 };
          const entity = this._spawn({ type: 'payload', team: 2, factionId: kind === 'lawful' ? SWITCHBACK.factionId : 'faction_quiet',
            pos: { x: receiver.x - normal.nz * 55, z: receiver.z + normal.nx * 55 }, radius: 19, mass: 1e6,
            collisionMask: FREIGHT_MASK,
            hull: 1600, hullMax: 1600, flags: { persistent: true, missionPinned: true },
            physicsBody: { dynamic: false, mass: 1e6, radius: 19, shape: 'capsule', material: 'payload', anchorRecoil: false },
            data: { authoredPayloadAssetId: 'pod_cargo_container', typeId: 'pod_cargo_container',
              persistenceOwner: 'convoyRaid', homeSectorId: record.sectorId, masslineTetherable: false,
              scanLabel: kind === 'lawful' ? 'Ceres freight receiver · legal manifest' : 'Side-fork receiver · one marked carriage',
              convoyRaid: { runId: id, bodyId: `receiver:${kind}`, role: 'receiver' }, loot: [], salvagePool: {} } }, spawned);
          record.receiverBindings[kind] = this._binding(entity, `receiver:${kind}`);
        }
        store.active = record; store.offered = true;
        this._applyEffects(record, advanceRaid(record.raid, this._frame(record, 0), [{ type: 'choose', choice }]));
        this._emit('convoyRaid:started', { runId: id, targetId: train.targetId, entityId: record.bindings[train.targetId].entityId });
        return { ok: true, runId: id };
      } catch (error) {
        for (const e of spawned) this._helpers.removeEntity?.(e.id, { immediate: true, reason: 'switchback_spawn_rollback' });
        budget?.release?.(requester); store.active = null;
        return { ok: false, reason: 'spawn_failed', detail: String(error?.message || error).slice(0, 160) };
      }
    },

    _spawn(spec, spawned = null) {
      const entity = this._helpers.spawnEntity(spec);
      if (!entity || entity.id == null) throw new Error('Entity owner declined a SWITCHBACK body');
      spawned?.push(entity); return entity;
    },
    _binding(entity, bodyId) { return { entityId: entity.id, generation: entity.occupantGeneration, bodyId }; },
    _entity(binding, record = storeOf(this._state).active) {
      if (!binding || !record) return null;
      const entity = this._state.entities?.get(binding.entityId), tag = ownTag(entity);
      return tag?.runId === record.id && tag.bodyId === binding.bodyId
        && (binding.generation == null || entity.occupantGeneration === binding.generation) ? entity : null;
    },

    /** Public player-intent membrane. Physics/combat evidence is not accepted from UI commands. */
    command(input) {
      const record = storeOf(this._state).active;
      if (this._pausedForLoad || this._state.mode !== 'flight' || !record || record.raid.phase !== 'running' || input?.runId !== record.id
        || this._commands.length >= MAX_COMMANDS) return false;
      if (input.type === 'releaseCoupler' && record.train.couplers.some(c => c.id === input.couplerId && !c.severed)) {
        this._commands.push({ type: 'releaseCoupler', couplerId: input.couplerId }); return true;
      }
      if (input.type === 'abandon' || input.type === 'cancelLatch') { this._commands.push({ type: input.type }); return true; }
      return false;
    },

    _pushEvidence(command) { if (this._commands.length < MAX_COMMANDS) this._commands.push(command); },
    _onTether(payload) {
      const playerId = this._state.playerId;
      if (payload?.controllerId !== playerId && payload?.actorId !== playerId) return;
      // Twin Bridle can put freight at EITHER end and the player's controller elsewhere.
      for (const entityId of new Set([payload.actorId, payload.targetId])) this._onHandledBody(entityId);
    },
    _onFieldHitch(payload) {
      const source = this._state.entities?.get(payload?.sourceId);
      if (payload?.sourceId === this._state.playerId || source?.ownerId === this._state.playerId)
        this._onHandledBody(payload?.entityId);
    },
    _onHandledBody(entityId) {
      const record = storeOf(this._state).active;
      if (this._pausedForLoad || !record || record.raid.phase !== 'running') return;
      const target = this._state.entities?.get(entityId), tag = ownTag(target);
      if (tag?.runId === record.id && this._entity(record.bindings[tag.bodyId], record) === target)
        this._pushEvidence({ type: 'interference', bodyId: tag.bodyId });
    },
    _onDamage(payload) {
      const record = storeOf(this._state).active;
      if (this._pausedForLoad || !record || record.raid.phase !== 'running' || !payload || !(payload.applied > 0 || payload.amount > 0)) return;
      const target = this._state.entities?.get(payload.targetId), tag = ownTag(target);
      if (tag?.runId !== record.id) return;
      const actor = payload.attackerId === this._state.playerId ? 'player' : 'other';
      record.lastAttacker[tag.bodyId] = { actor, at: this._state.simTime || 0 };
      if (tag.role === 'raider') {
        if (actor === 'player') this._pushEvidence({ type: 'defend', raiderId: tag.bodyId, actor,
          damage: Math.max(0, finite(payload.applied, payload.amount)) });
        return;
      }
      this._pushEvidence({ type: 'attack', actor, targetId: tag.bodyId });
      if (!record.bindings[tag.bodyId] || !payload.pos || !Number.isFinite(payload.pos.x) || !Number.isFinite(payload.pos.z)) return;
      // Aimed shots must hit the end of a REAL carriage collider, not an invisible detached proxy.
      let best = null, bestDistance = 11;
      for (const joint of record.train.couplers) {
        if (joint.severed || joint.aId !== tag.bodyId && joint.bId !== tag.bodyId) continue;
        const g = getCouplerGeometry(record.train, joint.id); if (!g) continue;
        const p = joint.aId === tag.bodyId ? g.a : g.b;
        if (!p) continue;
        const distance = Math.hypot(payload.pos.x - p.x, payload.pos.z - p.z);
        if (distance < bestDistance) { bestDistance = distance; best = joint; }
      }
      if (best) this._pushEvidence({ type: 'damageCoupler', couplerId: best.id, actor,
        amount: Math.min(1, Math.max(0, finite(payload.applied, payload.amount)) / 65) });
    },
    _onGone(payload) {
      const record = storeOf(this._state).active;
      if (this._pausedForLoad || !record || record.raid.phase !== 'running') return;
      const entity = payload?.entity || this._state.entities?.get(payload?.id ?? payload?.targetId), tag = ownTag(entity);
      if (tag?.runId !== record.id) return;
      const binding = record.bindings[tag.bodyId] || record.escortBindings.find(b => b.bodyId === tag.bodyId);
      if (!binding || binding.entityId !== entity.id || binding.generation != null && binding.generation !== entity.occupantGeneration) return;
      const hit = record.lastAttacker[tag.bodyId];
      const actor = (payload?.killerId ?? payload?.attackerId) === this._state.playerId
        || hit?.actor === 'player' && this._state.simTime - hit.at < 8 ? 'player' : 'other';
      this._pushEvidence({ type: 'bodyLost', bodyId: tag.bodyId, actor });
      if (record.bindings[tag.bodyId]) markBodyLost(record.train, tag.bodyId, { reason: 'body_destroyed', simTime: this._state.simTime || 0 });
    },

    _frame(record, dt) {
      const p = this._state.entities?.get(this._state.playerId);
      const escorts = record.escortBindings.map(binding => {
        const e = this._entity(binding, record);
        return { id: binding.bodyId, ...point(e), hp: live(e) ? e.hull : 0, alive: live(e) };
      });
      const receivers = {};
      const raiders = record.raiderBindings.map(binding => {
        const e = this._entity(binding, record);
        return { id: binding.bodyId, ...point(e), hp: live(e) ? e.hull : 0, alive: live(e) };
      });
      for (const kind of ['lawful', 'illicit']) receivers[kind] = { ...record.train.route.receivers[kind],
        alive: live(this._entity(record.receiverBindings[kind], record)) };
      return { simTime: this._state.simTime || 0, dt, train: record.train, sectorId: this._state.world?.currentSectorId,
        player: { id: 'player', ...point(p), hp: live(p) ? p.hull : 0, alive: live(p) }, escorts, raiders, receivers, spawnRaiders: true };
    },

    update(dt, state = this._state) {
      // The shared clock decides whether the world advances. A shop/docking UI cannot silently
      // disable surviving physical links while the rest of that world still receives ticks.
      if (state !== this._state || this._pausedForLoad || state.timeScale === 0
        || !Number.isFinite(dt) || dt <= 0) return;
      const tick = Number.isInteger(state.tick) ? state.tick : state.simTime;
      if (tick === this._lastUpdateTick) return;
      this._lastUpdateTick = tick;
      const record = storeOf(state).active;
      if (!record) { this.requestOffer(); return; }
      const observations = record.train.bodies.map(body => {
        const e = this._entity(record.bindings[body.id], record);
        if (!live(e)) return { id: body.id, lost: true, hp: 0 };
        const physical = resolvePhysicsBodySpec(e);
        return { id: body.id, ...point(e), angle: finite(e.rot), omega: finite(e.angVel), hp: e.hull,
          mass: physical?.mass, inertia: physical?.inertiaY, lost: false };
      });
      synchronizeTrain(record.train, observations);
      const step = Math.min(dt, 1 / 30);
      // Commands are consumed before solving so a released joint never receives another impulse.
      const commands = this._commands.splice(0, MAX_COMMANDS);
      if (record.raid.phase !== 'settled') this._applyEffects(record, advanceRaid(record.raid, this._frame(record, step), commands));
      // Stock flightV3 visits moving ships even with ai:null. Replace its neutral braking control
      // after flight, before the physics consumer. Impulses from Pin/Shove/collisions stay queued.
      const tug = this._entity(record.bindings[record.train.bodies[0].id], record);
      if (live(tug)) writePhysicsControl(tug, { source: 'convoyRaid:tug', mode: 'actuator',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity });
      const planned = planTrainStep(record.train, step, state.simTime || 0);
      for (const command of planned.impulses || []) {
        const e = this._entity(record.bindings[command.bodyId], record); if (!live(e)) continue;
        queuePhysicsImpulse(e, { x: command.ix, y: 0, z: command.iz }, { source: 'convoyRaid', reason: command.reason, tick: state.tick });
        if (command.angularImpulse) queuePhysicsTorqueImpulse(e, { x: 0, y: command.angularImpulse, z: 0 }, { source: 'convoyRaid', tick: state.tick });
      }
      for (const event of (planned.events || []).slice(0, 10)) this._emit('convoyRaid:physics', { runId: record.id, ...event });
      if ((planned.events || []).some(event => event.type === 'coupler_severed')) {
        braceTrain(record.train, { until: (state.simTime || 0) + 2.4, simTime: state.simTime || 0 });
      }
      if (record.raid.phase !== 'settled') this._stepRecovery(record, step);
    },

    _applyEffects(record, effects) {
      for (const effect of effects.slice(0, SWITCHBACK.maxEffectsPerTick)) {
        switch (effect.type) {
          case 'sever': {
            const result = severCoupler(record.train, effect.couplerId, { reason: effect.reason, simTime: this._state.simTime || 0 });
            if (result) this._emit('convoyRaid:couplerSevered', { runId: record.id, couplerId: effect.couplerId, reason: effect.reason });
            break;
          }
          case 'damageCoupler': {
            const wasIntact = !record.train.couplers.find(c => c.id === effect.couplerId)?.severed;
            damageCoupler(record.train, effect.couplerId, effect.amount,
              { reason: effect.reason, simTime: this._state.simTime || 0 });
            if (wasIntact && record.train.couplers.find(c => c.id === effect.couplerId)?.severed)
              braceTrain(record.train, { until: (this._state.simTime || 0) + 2.4, simTime: this._state.simTime || 0 });
            break;
          }
          case 'brace': braceTrain(record.train, { until: effect.until, simTime: this._state.simTime || 0 }); break;
          case 'escortOrder': this._escortOrder(record, effect); break;
          case 'spawnRaiders': this._spawnRaiders(record, effect); break;
          case 'crime': this._reportCrime(record, effect); break;
          case 'message': this._say(effect.text, effect.key); break;
          case 'settlement': this._settle(record, effect); break;
        }
      }
    },

    _escortOrder(record, order) {
      const binding = record.escortBindings.find(b => b.bodyId === order.escortId), entity = this._entity(binding, record);
      if (!live(entity)) return;
      const victim = record.bindings[order.targetId] && this._entity(record.bindings[order.targetId], record);
      const player = this._state.entities?.get(this._state.playerId);
      const activeTow = record.recovery[order.escortId];
      const destination = order.mode === 'recover' && activeTow ? record.train.route.receivers.lawful : { x: order.x, z: order.z };
      // Tactical AI retains weapons and drive authority for escorts. No private combat loop.
      const chase = order.mode === 'chase';
      const ai = entity.data.ai || (entity.data.ai = {});
      ai.passive = false; ai.motive = 'protect_freight'; ai.engagementTrigger = chase ? 'player_attack' : 'defend_freight';
      ai.zoneId = 'switchback_outer_freight';
      ai.approachTelegraph = chase ? 'Cutter turns away from the freight toward the thief.' : 'Warden stays with the marked carriage.';
      // These are private freight guards. Directly observed interference permits retaliation;
      // WANTED and police dispatch still belong exclusively to lawSecurity/heat.
      ai.lawful = false;
      if (record.raid.crimeCommitted) { entity.team = 1; ai.retaliationTargetId = player?.id; }
      if (ai.factionPresenceDoctrine) ai.factionPresenceDoctrine = {
        ...ai.factionPresenceDoctrine, firstFire: true, firstFireAgainst: ['faction_reach'],
      };
      const kind = chase ? ActivityKind.ATTACK_RUN : order.mode === 'recover' ? ActivityKind.TRANSIT : ActivityKind.SCREEN;
      const targetId = chase ? player?.id : order.mode === 'recover' && !activeTow ? victim?.id : null;
      const reason = activeTow ? 'vignette_motion:switchback_recovery' : `switchback:${order.reason}`;
      const previous = ai.activity;
      const startedTick = previous?.kind === kind && previous?.targetId === targetId && previous?.reason === reason
        ? previous.startedTick : this._state.tick || 0;
      setEntityDoctrine(entity, { activity: { kind, reason, anchor: { x: destination.x, z: destination.z },
        anchorVelocity: victim && !activeTow ? { x: victim.vel.x, z: victim.vel.z } : { x: 0, z: 0 },
        targetId,
        leashRadius: SWITCHBACK.escortRange + 250, preferredRange: order.mode === 'recover' ? 22 : 100,
        startedTick, encounterId: record.encounterId }, roe: RulesOfEngagement.DEFENSIVE });
    },

    _stepRecovery(record, dt) {
      for (const order of record.raid.escortOrders || []) {
        const e = this._entity(record.escortBindings.find(b => b.bodyId === order.escortId), record);
        const b = this._entity(record.bindings[order.targetId], record);
        if (order.mode !== 'recover' || !live(e) || !live(b)) { delete record.recovery[order.escortId]; continue; }
        const dx = b.pos.x - e.pos.x, dz = b.pos.z - e.pos.z, d = Math.hypot(dx, dz);
        const relative = Math.hypot(b.vel.x - e.vel.x, b.vel.z - e.vel.z);
        if (!record.recovery[order.escortId] && d < 60 && relative < 18) record.recovery[order.escortId] = { bodyId: order.targetId };
        if (!record.recovery[order.escortId] || d > 160 || d < 1e-6) { if (d > 160) delete record.recovery[order.escortId]; continue; }
        const nx = dx / d, nz = dz / d;
        const radial = (b.vel.x - e.vel.x) * nx + (b.vel.z - e.vel.z) * nz;
        const magnitude = Math.max(-90, Math.min(900, (d - 42) * 18 + radial * 35)) * dt;
        // An escort tow exchanges momentum; it never writes cargo velocity or heals the coupler.
        queuePhysicsImpulse(e, { x: nx * magnitude, z: nz * magnitude }, { source: 'convoyRaid:recovery' });
        queuePhysicsImpulse(b, { x: -nx * magnitude, z: -nz * magnitude }, { source: 'convoyRaid:recovery' });
      }
    },

    _spawnRaiders(record, effect) {
      if (record.effects.raiders) return;
      record.effects.raiders = true;
      const budget = this._helpers.spawnBudget, requester = `convoyRaid:${record.id}:raiders`;
      const grant = budget?.request ? budget.request(2, requester) : 2;
      // A ship is visible to the normal tactical sensor membrane; payload-only targets are not.
      const target = this._entity(record.bindings[record.train.bodies[0].id], record);
      for (let i = 0; i < Math.min(grant, 2); i++) {
        const spec = this._enemyBuilder(i ? 'reaver_pirate' : 'wasp_swarmer', 2,
          { x: effect.x + i * 70, z: effect.z - i * 55 }, { factionId: 'faction_reach', startedTick: this._state.tick || 0,
            motive: 'cargo_raid', engagementTrigger: 'authorized_hostile_spawn', zoneId: 'switchback_outer_freight',
            approachTelegraph: 'Raiders crossing toward the freight train.', noFireResponseWindowS: 2 });
        spec.flags = { ...spec.flags, persistent: true, missionPinned: true };
        spec.data = { ...spec.data, persistenceOwner: 'convoyRaid', homeSectorId: record.sectorId,
          convoyRaid: { runId: record.id, bodyId: `raider:${i}`, role: 'raider' } };
        if (spec.data.ai?.factionPresenceDoctrine) spec.data.ai.factionPresenceDoctrine = {
          ...spec.data.ai.factionPresenceDoctrine, firstFire: true, firstFireAgainst: [SWITCHBACK.factionId],
        };
        // The shared heist pressure prefix is an existing authoritative-assignment family.
        setEntityDoctrine(spec, { activity: { kind: ActivityKind.ATTACK_RUN, reason: 'heist:pressure:switchback_freight',
          anchor: { x: target?.pos.x || effect.x, z: target?.pos.z || effect.z }, targetId: target?.id,
          leashRadius: 950, startedTick: this._state.tick || 0, encounterId: record.encounterId }, roe: RulesOfEngagement.WEAPONS_FREE });
        const entity = this._helpers.spawnEntity(spec);
        if (entity) { budget?.bindEntity?.(entity.id, requester); record.raiderBindings.push(this._binding(entity, `raider:${i}`)); }
        else budget?.releaseSome?.(requester, 1);
      }
    },

    _reportCrime(record, effect) {
      if (record.effects.crime) return;
      const target = this._entity(record.bindings[record.train.targetId], record);
      const law = this._owner('lawSecurity');
      if (!live(target)) return;
      const receipt = law?.reportIncident?.({ reportId: `${record.id}:freight_theft`, kind: 'payload_theft',
        offenderStableId: 'player', offenderEntityId: this._state.playerId,
        victimEntityId: this._entity(record.bindings[record.train.bodies[0].id], record)?.id,
        payloadStableId: `${record.id}:${record.train.targetId}`, causalTick: Math.max(0, this._state.tick | 0),
        pos: { x: target.pos.x, z: target.pos.z } });
      record.effects.crime = { reportId: `${record.id}:freight_theft`, accepted: receipt?.accepted === true,
        receiptId: receipt?.incidentReceiptId || null, reason: receipt?.reason || (law ? 'denied' : 'law_unavailable') };
      this._say(receipt?.accepted ? 'Freight theft witnessed. Local law has the report.'
        : 'Freight crew hostile; no validated law report. Global WANTED status is unchanged by this report.', 'law');
    },

    _settle(record, effect) {
      const store = storeOf(this._state);
      if (record.effects.settlement || store.receipts.some(r => r.runId === record.id)) return;
      // Receipt precedes all synchronous cross-owner intents and body removal.
      const receipt = { runId: record.id, settlementId: effect.id, outcome: effect.outcome,
        credits: Math.max(0, Math.min(SWITCHBACK.theftReward, finite(effect.credits))),
        reputation: Math.max(-40, Math.min(10, finite(effect.reputation))),
        targetId: record.train.targetId, simTime: this._state.simTime || 0 };
      record.effects.settlement = receipt; store.receipts.push(receipt); store.receipts = store.receipts.slice(-8);
      this._commands.length = 0; record.recovery = {};
      if (effect.consumeTarget) {
        const binding = record.bindings[record.train.targetId], e = this._entity(binding, record);
        if (live(e)) this._helpers.removeEntity?.(e.id, { reason: 'switchback_receiver_accepted' });
        markBodyLost(record.train, record.train.targetId, { reason: 'delivered', simTime: this._state.simTime || 0 });
      }
      if (receipt.credits > 0) this._emit('economy:grantCredits', { amount: receipt.credits,
        reason: `switchback:${effect.outcome}`, causeId: effect.id });
      if (receipt.reputation) this._emit('faction:repDelta', { factionId: SWITCHBACK.factionId,
        delta: receipt.reputation, reason: `switchback:${effect.outcome}`, causeId: effect.id });
      for (const binding of [...record.escortBindings, ...record.raiderBindings]) {
        const e = this._entity(binding, record); if (!live(e)) continue;
        e.data.ai.passive = true;
        setEntityDoctrine(e, { activity: { kind: ActivityKind.DISENGAGE, reason: 'switchback:contract_closed',
          anchor: point(e), leashRadius: 350, startedTick: this._state.tick || 0 }, roe: RulesOfEngagement.HOLD_FIRE });
        e.data.despawnAt = (this._state.simTime || 0) + 45;
      }
      this._say(SWITCHBACK_RECEIPTS[effect.outcome] || 'The freight contract is closed.', 'settled');
      this._emit('convoyRaid:settled', receipt);
    },

    /** Rebind ONLY persisted, tagged surviving entities. Missing actors are losses, never respawns. */
    rebind() {
      const record = storeOf(this._state).active;
      if (!record) return false;
      this._commands.length = 0; record.recovery = {};
      const byBody = new Map();
      for (const e of this._state.entityList || []) {
        const tag = ownTag(e); if (tag?.runId !== record.id || !live(e)) continue;
        // Duplicate identity fails closed for that logical body; never select a convenient clone.
        if (byBody.has(tag.bodyId)) byBody.set(tag.bodyId, null); else byBody.set(tag.bodyId, e);
      }
      const bind = old => {
        const e = old && byBody.get(old.bodyId);
        return e ? this._binding(e, old.bodyId) : old && { ...old, entityId: null, generation: null };
      };
      for (const body of record.train.bodies) {
        const old = record.bindings[body.id] || { bodyId: body.id, entityId: null };
        const next = body.lost ? { ...old, entityId: null, generation: null } : bind(old);
        record.bindings[body.id] = next;
        if (!next?.entityId) markBodyLost(record.train, body.id, { reason: 'absent_on_restore', simTime: this._state.simTime || 0 });
      }
      record.escortBindings = record.escortBindings.slice(0, 2).map(bind);
      record.raiderBindings = record.raiderBindings.slice(0, 2).map(bind);
      for (const kind of ['lawful', 'illicit']) record.receiverBindings[kind] = bind(record.receiverBindings[kind]);
      const raid = restoreRaid(serializeRaid(record.raid), { train: record.train, simTime: this._state.simTime || 0 });
      if (!raid || raid.runId !== record.id) return false;
      record.raid = raid;
      return true;
    },

    serialize() { return serializeConvoyRaid(this._state); },
    /** Save owner stages graph state before persistent entities respawn; save:loaded rebinds IDs. */
    deserialize(saved) {
      this._commands.length = 0; this._lastUpdateTick = null;
      return restoreConvoyRaid(this._state, saved);
    },
    restore(saved) { restoreConvoyRaid(this._state, saved); this._lastUpdateTick = null; return this.rebind(); },
    snapshot() { return storeOf(this._state).active; },
    destroy() {
      for (const off of this._unsub || []) off();
      this._unsub = []; this._commands = [];
      if (this._state && RUNTIMES.get(this._state) === this) RUNTIMES.delete(this._state);
    },
  };
}

export function serializeConvoyRaid(state) {
  const store = storeOf(state), r = store.active;
  return { schemaVersion: 1, offered: store.offered === true, nextOfferAt: finite(store.nextOfferAt),
    receipts: plain(store.receipts.slice(-8)), active: r ? {
      schemaVersion: 1, id: r.id, seed: r.seed, sectorId: r.sectorId, encounterId: r.encounterId,
      train: serializeTrain(r.train), raid: serializeRaid(r.raid), bindings: plain(r.bindings),
      escortBindings: plain(r.escortBindings.slice(0, 2)), raiderBindings: plain(r.raiderBindings.slice(0, 2)),
      receiverBindings: plain(r.receiverBindings), effects: plain(r.effects), lastAttacker: {}, recovery: {}, startedAt: r.startedAt,
    } : null };
}

export function restoreConvoyRaid(state, saved) {
  const store = emptyStore(); state.convoyRaid = store;
  if (saved?.schemaVersion !== 1) return false;
  store.offered = saved.offered === true; store.nextOfferAt = Math.max(0, finite(saved.nextOfferAt));
  store.receipts = (Array.isArray(saved.receipts) ? saved.receipts : []).slice(-8).filter(r => stable(r?.runId)).map(r => ({
    runId: r.runId, settlementId: stable(r.settlementId), outcome: stable(r.outcome),
    credits: Math.max(0, Math.min(SWITCHBACK.theftReward, finite(r.credits))), reputation: Math.max(-40, Math.min(10, finite(r.reputation))),
    targetId: stable(r.targetId), simTime: Math.max(0, finite(r.simTime)) }));
  const r = saved.active;
  if (!r) return true;
  if (!validRunId(r.id) || r.sectorId !== SWITCHBACK.sectorId) { store.offered = true; return false; }
  try {
    const train = restoreTrain(r.train);
    if (!train || train.id !== r.id || !Array.isArray(train.bodies) || train.bodies.length > 6) { store.offered = true; return false; }
    const binding = value => value && stable(value.bodyId) ? { bodyId: value.bodyId,
      entityId: Number.isSafeInteger(value.entityId) && value.entityId > 0 ? value.entityId : null,
      generation: Number.isSafeInteger(value.generation) ? value.generation : null } : null;
    const bindings = {};
    for (const body of train.bodies) bindings[body.id] = binding(r.bindings?.[body.id]) || { bodyId: body.id, entityId: null, generation: null };
    const raid = restoreRaid(r.raid, { train, simTime: state.simTime || 0 });
    if (!raid || raid.runId !== r.id) { store.offered = true; return false; }
    const effects = {};
    if (r.effects?.crime) effects.crime = { accepted: r.effects.crime.accepted === true, receiptId: stable(r.effects.crime.receiptId), reason: stable(r.effects.crime.reason) };
    if (r.effects?.raiders) effects.raiders = true;
    const receipt = store.receipts.find(row => row.runId === r.id);
    if (receipt || r.effects?.settlement) {
      effects.settlement = receipt || { runId: r.id, outcome: raid.outcome };
      raid.phase = 'settled'; raid.outcome = receipt?.outcome || raid.outcome || 'invalid_restore';
    }
    store.active = { schemaVersion: 1, id: r.id, seed: r.seed >>> 0, sectorId: SWITCHBACK.sectorId,
      encounterId: stable(r.encounterId) || r.id, train, raid, bindings,
      escortBindings: (Array.isArray(r.escortBindings) ? r.escortBindings : []).slice(0, 2).map(binding).filter(Boolean),
      raiderBindings: (Array.isArray(r.raiderBindings) ? r.raiderBindings : []).slice(0, 2).map(binding).filter(Boolean),
      receiverBindings: { lawful: binding(r.receiverBindings?.lawful), illicit: binding(r.receiverBindings?.illicit) },
      effects, recovery: {}, lastAttacker: {}, startedAt: finite(r.startedAt) };
    return true;
  } catch (_) { store.offered = true; return false; }
}

export const SWITCHBACK_LIMITS = Object.freeze({ maxActors: MAX_ACTORS, maxPendingCommands: MAX_COMMANDS });
