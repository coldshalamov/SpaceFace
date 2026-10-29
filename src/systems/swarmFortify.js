// Physical build owner for the Swarm Fortify pilot. UI commands are data-only; this owner checks
// phase, identity, socket clearance, and the actual run wallet in the authoritative sim.

import { Masks } from '../core/entity.js';
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { runLifetime, runSession } from './runSession.js';
import { fields as fieldOwner } from './fields.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { swarmPlacementIsClear } from './swarmSafety.js';
import { createSwarmFortifyEffects } from './swarmFortifyEffects.js';
import { ActivityKind, setEntityDoctrine } from '../ai/doctrine.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import {
  SWARM_FORTIFY_COMMAND,
  SWARM_FORTIFY_DEVICES,
  SWARM_FORTIFY_MIN_PILOT_GAP,
  SWARM_FORTIFY_PHASES,
  SWARM_FORTIFY_RECEIPT,
  SWARM_FORTIFY_RELOAD_COMMAND,
  SWARM_FORTIFY_REPAIR_COMMAND,
  SWARM_FORTIFY_SCHEMA_VERSION,
  SWARM_FORTIFY_SIEGE_REACH,
  SWARM_FORTIFY_SOCKETS,
  SWARM_FORTIFY_STATE,
  SWARM_FORTIFY_STATE_REQUESTED,
  swarmFortifyDevice,
  swarmFortifyCorridorForGate,
  swarmFortifyPosition,
  swarmFortifySocket,
} from '../data/swarmFortify.js';

let nextFortifyRunToken = 1;

function fortifyRuntime(lifetime, create = false) {
  if (!lifetime || typeof lifetime !== 'object') return null;
  if (!lifetime.swarmFortify && create) {
    lifetime.swarmFortify = {
      schemaVersion: SWARM_FORTIFY_SCHEMA_VERSION,
      runToken: nextFortifyRunToken++,
      nextOrdinal: 1,
      fortifiedIngress: false,
      structures: new Map(),
      structureRows: [],
      commandHighWatermark: 0,
      commandReceipts: new Map(),
    };
  }
  const runtime = lifetime.swarmFortify;
  return runtime && runtime.schemaVersion === SWARM_FORTIFY_SCHEMA_VERSION
    && runtime.structures instanceof Map && Array.isArray(runtime.structureRows)
    && runtime.commandReceipts instanceof Map ? runtime : null;
}

function liveSwarmBuildRun(state) {
  const run = state && state.run;
  return run && run.kind === 'survival' && isSwarmRuleset(run.ruleset)
    && SWARM_FORTIFY_PHASES.includes(run.phase) && Number.isInteger(run.wave) && run.wave >= 1
    ? run : null;
}

function physicalStructureSpec({ run, device, position, socket, player, requestId, runToken, ordinal, endpointIndex = null }) {
  const fieldId = `swarm-fortify-field-${runToken}-${ordinal}`;
  const pairId = device.id === 'tesla_pair' ? `swarm-fortify-pair-${runToken}-${ordinal}` : null;
  const fortifyData = {
    schemaVersion: SWARM_FORTIFY_SCHEMA_VERSION,
    deviceId: device.id,
    requestId,
    runWave: run.wave,
    socketId: socket.id,
    runToken,
    ordinal,
    operational: true,
    ...(device.effect ? { effect: { ...device.effect } } : {}),
    ...(device.pulse ? { pulse: { ...device.pulse } } : {}),
    ...(device.effect?.ammo != null ? { ammo: device.effect.ammo } : {}),
    ...(pairId ? { pairId, endpointIndex } : {}),
  };
  return {
    type: 'beacon',
    pos: { x: position.x, z: position.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: device.colliderRadius,
    mass: device.bodyMass,
    hull: device.hull,
    hullMax: device.hull,
    collides: true,
    collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
    physicsBody: {
      schemaVersion: 1,
      radius: device.colliderRadius,
      mass: device.bodyMass,
      inertiaY: device.bodyMass * device.colliderRadius ** 2,
      dynamic: false,
      ccd: false,
      material: 'debris',
      revision: 0,
    },
    team: player.team,
    ownerId: player.id,
    factionId: player.factionId,
    data: {
      swarmFortify: fortifyData,
      ...(device.field ? { fieldAnchor: {
        ...device.field,
        fieldId,
        presentationTag: 'environmental',
        filters: {
          excludeIds: [player.id],
          excludeOwnerIds: [player.id],
          ...(Number.isFinite(player.team) && player.team !== 0 ? { excludeTeams: [player.team] } : {}),
        },
      } } : {}),
    },
  };
}

export const swarmFortify = {
  name: 'swarmFortify',

  init(ctx) {
    this.destroy();
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this.runSessionOwner = this.registry?.get?.('runSession') || runSession;
    this.fieldOwner = this.registry?.get?.('fields') || fieldOwner;
    this.effects = createSwarmFortifyEffects({
      state: this.state,
      bus: this.bus,
      helpers: this.helpers,
      registry: this.registry,
    });
    this._unsubs = [];
    this._activeLifetime = runLifetime(this.state && this.state.run);
    fortifyRuntime(this._activeLifetime, true);
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(
        this.bus.on(SWARM_FORTIFY_COMMAND, (request) => this.build(request)),
        this.bus.on(SWARM_FORTIFY_REPAIR_COMMAND, (request) => this.repair(request)),
        this.bus.on(SWARM_FORTIFY_RELOAD_COMMAND, (request) => this.reloadTurret(request)),
        this.bus.on(SWARM_FORTIFY_STATE_REQUESTED, (request) => this._publishReadModel(request)),
        this.bus.on('run:started', () => this._onRunStarted()),
        this.bus.on('run:wavePlanned', () => this._onWavePlanned()),
        this.bus.on('run:ended', () => this._onRunEnded()),
        this.bus.on('entity:destroyed', (receipt) => this._onEntityDestroyed(receipt)),
        this.bus.on('entity:spawned', (receipt) => this._onSiegeSpawned(receipt)),
        this.bus.on('game:new', () => this._cleanupAll('new_game')),
        this.bus.on('game:exitToMenu', () => this._cleanupAll('exit_to_menu')),
        this.bus.on('save:restoring', () => this._cleanupAll('save_restoring')),
        this.bus.on('save:loaded', () => this._cleanupAll('save_loaded')),
      );
    }
  },

  update() {
    this._updateRepulsors();
    const runtime = fortifyRuntime(runLifetime(this.state && this.state.run));
    this.effects?.update?.(1 / 60, runtime?.structures);
  },

  newGame() {
    this._cleanupAll('new_game');
    this._activeLifetime = null;
  },

  getReadModel(requestId = null) {
    const run = this.state && this.state.run;
    const lifetime = runLifetime(run);
    const runtime = fortifyRuntime(lifetime);
    const player = this.state?.entities?.get?.(this.state.playerId) || null;
    const playerPose = player?.pos ? {
      x: player.pos.x,
      z: player.pos.z,
      rotation: Number.isFinite(player.rot) ? player.rot : 0,
    } : null;
    const structuresByPurchase = new Map();
    for (const record of runtime?.structures.values() || []) {
      const entity = this.state?.entities?.get?.(record.entityId) || record.entity;
      if (!entity || entity.alive === false) continue;
      let row = structuresByPurchase.get(record.requestId);
      if (!row) {
        row = {
          id: record.pairId || `fortify-${record.runToken || runtime.runToken}-${record.ordinal}`,
          entityId: record.pairId || record.entityId,
          requestId: record.requestId,
          deviceId: record.deviceId,
          socketId: record.socketId,
          entityIds: [],
          positions: [],
          hull: 0,
          hullMax: 0,
          heat: 0,
          ammo: null,
          operational: true,
        };
        structuresByPurchase.set(record.requestId, row);
      }
      row.entityIds.push(record.entityId);
      row.positions.push({ x: entity.pos?.x ?? 0, z: entity.pos?.z ?? 0 });
      row.hull += Math.max(0, Number(entity.hull) || 0);
      row.hullMax += Math.max(0, Number(entity.hullMax) || 0);
      row.heat = Math.max(row.heat, Number(record.heat) || 0);
      if (Number.isFinite(entity.data?.swarmFortify?.ammo)) row.ammo = entity.data.swarmFortify.ammo;
      row.operational = row.operational && entity.data?.swarmFortify?.operational !== false
        && entity.data?.swarmFortify?.offline !== true;
    }
    const structures = [...structuresByPurchase.values()].map((row) => ({
      ...row,
      entityIds: [...row.entityIds],
      positions: [...row.positions],
      repairCost: swarmFortifyDevice(row.deviceId)?.repairCost ?? null,
      ammoMax: Number.isSafeInteger(swarmFortifyDevice(row.deviceId)?.effect?.ammo)
        ? swarmFortifyDevice(row.deviceId).effect.ammo : null,
      serviceCostPerRound: Number.isSafeInteger(swarmFortifyDevice(row.deviceId)?.serviceCostPerRound)
        ? swarmFortifyDevice(row.deviceId).serviceCostPerRound : null,
      serviceCost: Number.isSafeInteger(swarmFortifyDevice(row.deviceId)?.effect?.ammo)
        && Number.isSafeInteger(swarmFortifyDevice(row.deviceId)?.serviceCostPerRound)
        && Number.isSafeInteger(row.ammo)
        ? Math.max(0, swarmFortifyDevice(row.deviceId).effect.ammo - row.ammo)
          * swarmFortifyDevice(row.deviceId).serviceCostPerRound
        : null,
    }));
    const occupied = new Set(structures.map((row) => row.socketId));
    const sockets = Object.values(SWARM_FORTIFY_SOCKETS).map((socket) => {
      const anchor = runtime?.arenaAnchor || null;
      const position = anchor ? swarmFortifyPosition(anchor, socket, anchor.rotation) : null;
      const devices = Object.fromEntries(Object.values(SWARM_FORTIFY_DEVICES).map(device =>
        [device.id, this._placement(runtime, device, socket, player)]));
      return {
        id: socket.id,
        label: socket.label,
        x: position?.x ?? null,
        z: position?.z ?? null,
        occupied: occupied.has(socket.id),
        blocked: devices.gravity_beacon.blocked,
        devices,
      };
    });
    const anchor = runtime?.arenaAnchor;
    const terrain = anchor ? (this.state?.entityList || []).filter(entity =>
      entity.alive !== false && entity.collides !== false && entity.pos
      && !entity.data?.swarmFortify && entity.id !== this.state.playerId
      && (['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity.type)
        || entity.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'))
      .map(entity => ({ id: entity.id, type: entity.type, x: entity.pos.x, z: entity.pos.z,
        radius: resolvePhysicsBodySpec(entity)?.radius ?? entity.radius ?? 10 }))
      .filter(body => Math.hypot(body.x - anchor.x, body.z - anchor.z) < 650 + body.radius)
      .sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z))
      .slice(0, 48) : [];
    return {
      requestId,
      runToken: runtime?.runToken ?? null,
      phase: run?.phase ?? 'inactive',
      wave: Number.isInteger(run?.wave) ? run.wave : 0,
      credits: Number.isFinite(run?.credits) ? run.credits : 0,
      fortified: runtime?.fortifiedIngress === true,
      player: playerPose,
      arena: runtime?.arenaAnchor ? { ...runtime.arenaAnchor, radius: null } : null,
      sockets,
      structures,
      terrain,
    };
  },

  // Preview and commit ask the same geometry question, including both Tesla endpoints.
  _placement(runtime, device, socket, player) {
    const anchor = runtime?.arenaAnchor;
    const position = anchor && swarmFortifyPosition(anchor, socket, anchor.rotation);
    if (!position || !player?.pos) return { blocked: true, reason: 'socket_unavailable', positions: [] };
    const gap = Math.hypot(position.x - player.pos.x, position.z - player.pos.z);
    if (gap < SWARM_FORTIFY_MIN_PILOT_GAP) return { blocked: true, reason: 'pilot_clearance', positions: [position] };
    const radialX = (position.x - anchor.x) / socket.distance;
    const radialZ = (position.z - anchor.z) / socket.distance;
    const positions = device.id === 'tesla_pair' ? [
      { x: position.x - radialZ * device.pairSpan / 2,
        z: position.z + radialX * device.pairSpan / 2 },
      { x: position.x + radialZ * device.pairSpan / 2,
        z: position.z - radialX * device.pairSpan / 2 },
    ] : [position];
    const reserved = [];
    for (const at of positions) {
      if (!swarmPlacementIsClear(this.state, at, device.colliderRadius, { clearance: 10, reserved })) {
        return { blocked: true, reason: 'socket_blocked', positions };
      }
      reserved.push({ alive: true, collides: true, pos: at, radius: device.colliderRadius });
    }
    return { blocked: false, reason: null, positions };
  },

  getArenaAnchor() {
    const runtime = fortifyRuntime(runLifetime(this.state && this.state.run));
    const anchor = runtime?.arenaAnchor;
    return anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z)
      ? { x: anchor.x, z: anchor.z, rotation: Number.isFinite(anchor.rotation) ? anchor.rotation : 0 }
      : null;
  },

  getIngressPolicy() {
    const runtime = fortifyRuntime(runLifetime(this.state && this.state.run));
    const anchor = runtime?.arenaAnchor;
    if (runtime?.fortifiedIngress !== true || !anchor
      || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) return null;
    return {
      gateGroupPolicy: 'fortify-three-corridor-v1',
      anchor: { x: anchor.x, z: anchor.z, rotation: Number.isFinite(anchor.rotation) ? anchor.rotation : 0 },
    };
  },

  _publishReadModel(request) {
    this._prepareBuildAnchor();
    const readModel = this.getReadModel(request && request.requestId);
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(SWARM_FORTIFY_STATE, readModel);
    return readModel;
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._cleanupAll('system_destroy');
    this.ctx = null;
    this.state = null;
    this.bus = null;
    this.helpers = null;
    this.registry = null;
    this.runSessionOwner = null;
    this.fieldOwner = null;
    this.effects = null;
    this._activeLifetime = null;
  },

  build(request) {
    const requestId = request && request.requestId;
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return this._resolve({ requestId, accepted: false, reason: 'invalid_request' });
    }
    const lifetime = runLifetime(this.state && this.state.run);
    const runtime = fortifyRuntime(lifetime, true);
    const prior = this.runSessionOwner.purchaseReceipt(requestId);
    const cached = prior || runtime?.commandReceipts.get(requestId) || null;
    if (cached) {
      const structureId = cached.accepted
        ? [...(runtime?.structures.values() || [])].find((entry) => entry.requestId === requestId)?.entityId ?? null
        : null;
      return this._resolve({ ...cached, structureId });
    }
    if (runtime && requestId <= runtime.commandHighWatermark) {
      return this._resolve({ requestId, accepted: false, reason: 'stale_request' });
    }
    if (runtime) runtime.commandHighWatermark = requestId;
    const fail = (reason) => this._rememberCommand(runtime, { requestId, accepted: false, reason });
    if (!runtime || request.runToken !== runtime.runToken) return fail('stale_run');
    const run = liveSwarmBuildRun(this.state);
    if (!run) return fail('phase_closed');
    const device = swarmFortifyDevice(request.deviceId);
    const socket = swarmFortifySocket(request.socketId);
    if (!device || !socket) return fail('unknown_build_option');
    const player = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    if (!player || player.alive === false || !player.pos) return fail('pilot_unavailable');
    this._prepareBuildAnchor();
    if (!runtime?.arenaAnchor) return fail('arena_anchor_unavailable');
    const placement = this._placement(runtime, device, socket, player);
    if (placement.blocked) return fail(placement.reason);

    if (!runtime || lifetime !== this._activeLifetime) return fail('run_lifetime_changed');
    const ordinal = runtime.nextOrdinal;
    const positions = placement.positions;
    const specs = positions.map((at, endpointIndex) => physicalStructureSpec({
      run, device, position: at, socket, player, requestId, runToken: runtime.runToken, ordinal,
      endpointIndex: device.id === 'tesla_pair' ? endpointIndex : null,
    }));
    const receipt = this.runSessionOwner.purchase({
      requestId,
      deviceId: device.id,
      socketId: socket.id,
      credits: device.cost,
      reason: `swarm_fortify:${device.id}`,
    }, () => {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return { ok: false, reason: 'spawn_unavailable' };
      const entities = [];
      try {
        for (const spec of specs) {
          const entity = spawn(spec);
          if (!entity || entity.alive === false || entity.id == null) throw new Error('spawn_refused');
          entities.push(entity);
          if (this.state.run !== run) throw new Error('run_replaced');
        }
      } catch {
        for (const entity of entities) this._removeEntity(entity, 'spawn_failed');
        this._removePartialSpawn(requestId, 'spawn_failed');
        return { ok: false, reason: this.state.run === run ? 'spawn_failed' : 'run_changed_during_purchase' };
      }
      if (device.pulse) {
        const registered = this.fieldOwner.registerAnchoredField?.(this.state, entities[0]);
        const armed = registered && this.fieldOwner.setAnchorArmed(this.state, entities[0].id, false, this.state.tick);
        if (!armed) {
          for (const entity of entities) this._removeEntity(entity, 'field_owner_unavailable');
          return { ok: false, reason: 'field_owner_unavailable' };
        }
      }
      const records = entities.map((entity, index) => ({
        entityId: entity.id, entity, deviceId: device.id, socketId: socket.id, requestId, ordinal,
        runToken: runtime.runToken,
        endpointIndex: device.id === 'tesla_pair' ? index : null,
        pairId: device.id === 'tesla_pair' ? specs[index].data.swarmFortify.pairId : null,
        nextPulseTick: this.state.tick + (device.pulse?.intervalTicks || device.effect?.intervalTicks || 0),
        pulseUntilTick: null,
        heat: 0,
        overloadUntilTick: 0,
      }));
      if (device.id === 'repulsor_pylon') {
        entities[0].data.swarmFortify.heat = 0;
        entities[0].data.swarmFortify.offline = false;
      }
      for (const record of records) {
        runtime.structures.set(record.entityId, record);
        runtime.structureRows.push(record);
      }
      runtime.nextOrdinal = ordinal + 1;
      return {
        ok: true,
        rollback: () => {
          for (const record of records) this._retireStructure(runtime, record, 'purchase_rollback');
        },
      };
    });
    const records = [...runtime.structures.values()].filter((entry) => entry.requestId === requestId);
    const modeActivated = receipt.accepted === true && runtime.fortifiedIngress !== true;
    const result = {
      requestId,
      accepted: receipt.accepted === true,
      modeActivated,
      reason: receipt.reason,
      credits: receipt.credits,
      totalCredits: receipt.totalCredits,
      structureId: receipt.accepted ? records[0]?.entityId ?? null : null,
      structureIds: receipt.accepted ? records.map((entry) => entry.entityId) : [],
      deviceId: device.id,
      socketId: socket.id,
    };
    if (receipt.accepted) runtime.fortifiedIngress = true;
    return this._rememberCommand(runtime, result);
  },

  repair(request) {
    const requestId = request && request.requestId;
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return this._resolve({ requestId, accepted: false, repaired: false, reason: 'invalid_request' });
    }
    const lifetime = runLifetime(this.state && this.state.run);
    const runtime = fortifyRuntime(lifetime, true);
    const cached = this.runSessionOwner.purchaseReceipt(requestId) || runtime?.commandReceipts.get(requestId) || null;
    if (cached) return this._resolve({ ...cached });
    if (runtime && requestId <= runtime.commandHighWatermark) {
      return this._rememberCommand(runtime, { requestId, accepted: false, repaired: false, reason: 'stale_request' });
    }
    if (runtime) runtime.commandHighWatermark = requestId;
    const fail = (reason) => this._rememberCommand(runtime, { requestId, accepted: false, repaired: false, reason });
    if (!runtime || request.runToken !== runtime.runToken) return fail('stale_run');
    const run = liveSwarmBuildRun(this.state);
    if (!run) return fail('phase_closed');
    if (lifetime !== this._activeLifetime) return fail('run_lifetime_changed');
    const target = [...runtime.structures.values()].filter((record) => {
      if (record.pairId) return record.pairId === request.entityId;
      return record.entityId === request.entityId;
    });
    if (!target.length) return fail('structure_unavailable');
    const device = swarmFortifyDevice(target[0].deviceId);
    if (!device || !Number.isFinite(device.repairCost) || device.repairCost <= 0) return fail('repair_unavailable');
    const prepareRepairHulls = this.helpers && this.helpers.prepareRepairCombatHulls;
    if (typeof prepareRepairHulls !== 'function') return fail('repair_owner_unavailable');
    const targets = target.map((record) => ({ entityId: record.entityId, amount: device.hull }));
    let repairPlan = null;
    const receipt = this.runSessionOwner.purchase({
      requestId,
      deviceId: device.id,
      entityId: request.entityId,
      credits: device.repairCost,
      reason: `swarm_fortify_repair:${device.id}`,
    }, () => {
      if (this.state.run !== run || runLifetime(this.state.run) !== lifetime) {
        return { ok: false, reason: 'run_lifetime_changed' };
      }
      repairPlan = prepareRepairHulls(targets, `swarm_fortify:${device.id}`);
      if (!repairPlan || repairPlan.ok !== true || !Array.isArray(repairPlan.repairs)
        || !repairPlan.repairs.some((row) => row.applied > 0)) {
        return { ok: false, reason: repairPlan?.reason || 'repair_refused' };
      }
      const committed = repairPlan.commit();
      if (!committed || committed.ok !== true) {
        return { ok: false, reason: committed?.reason || 'repair_commit_failed' };
      }
      return { ok: true, rollback: () => repairPlan.rollback() };
    });
    if (receipt.accepted && repairPlan) repairPlan.finalize();
    const result = {
      requestId,
      accepted: receipt.accepted === true,
      repaired: receipt.accepted === true,
      reason: receipt.reason,
      credits: receipt.credits,
      totalCredits: receipt.totalCredits,
      entityId: request.entityId,
      deviceId: device.id,
    };
    return this._rememberCommand(runtime, result);
  },

  reloadTurret(request) {
    const requestId = request && request.requestId;
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return this._resolve({ requestId, accepted: false, serviced: false, reason: 'invalid_request' });
    }
    const lifetime = runLifetime(this.state && this.state.run);
    const runtime = fortifyRuntime(lifetime, true);
    const cachedCommand = runtime?.commandReceipts.get(requestId) || null;
    if (cachedCommand) return this._resolve({ ...cachedCommand });
    const cachedPurchase = this.runSessionOwner.purchaseReceipt(requestId);
    if (cachedPurchase) {
      if (cachedPurchase.reason === 'swarm_fortify_reload:kinetic_turret'
        && cachedPurchase.entityId === request.entityId) {
        return this._resolve({ ...cachedPurchase, serviced: cachedPurchase.accepted === true });
      }
      return this._resolve({ requestId, accepted: false, serviced: false, reason: 'request_id_conflict' });
    }
    if (runtime && requestId <= runtime.commandHighWatermark) {
      return this._rememberCommand(runtime, { requestId, accepted: false, serviced: false, reason: 'stale_request' });
    }
    if (runtime) runtime.commandHighWatermark = requestId;
    const fail = (reason, deviceId = null) => this._rememberCommand(runtime, {
      requestId, accepted: false, serviced: false, reason, entityId: request?.entityId ?? null, deviceId,
    });
    if (!runtime || request.runToken !== runtime.runToken) return fail('stale_run');
    const run = liveSwarmBuildRun(this.state);
    if (!run) return fail('phase_closed');
    if (lifetime !== this._activeLifetime) return fail('run_lifetime_changed');
    const record = runtime.structures.get(request.entityId);
    const device = record && swarmFortifyDevice(record.deviceId);
    if (!record || !device || device.id !== 'kinetic_turret') return fail('turret_unavailable');
    const entity = this.state?.entities?.get?.(record.entityId) || record.entity;
    const mark = entity?.data?.swarmFortify;
    if (!entity || entity.alive === false || !mark || mark.schemaVersion !== SWARM_FORTIFY_SCHEMA_VERSION
      || mark.runToken !== runtime.runToken || mark.deviceId !== device.id) return fail('turret_unavailable', device.id);
    const ammoMax = device.effect?.ammo;
    const ammo = mark.ammo;
    if (!Number.isSafeInteger(ammoMax) || ammoMax <= 0 || !Number.isSafeInteger(ammo)
      || ammo < 0 || ammo > ammoMax) return fail('ammo_state_invalid', device.id);
    const amount = ammoMax - ammo;
    if (amount === 0) return fail('already_full', device.id);
    const costPerRound = device.serviceCostPerRound;
    const credits = Number.isSafeInteger(costPerRound) && costPerRound > 0 ? amount * costPerRound : 0;
    if (!Number.isSafeInteger(credits) || credits <= 0) return fail('service_unavailable', device.id);
    const prepareReload = this.effects && this.effects.prepareTurretReload;
    if (typeof prepareReload !== 'function') return fail('service_owner_unavailable', device.id);

    let reloadPlan = null;
    const receipt = this.runSessionOwner.purchase({
      requestId,
      deviceId: device.id,
      entityId: request.entityId,
      credits,
      reason: `swarm_fortify_reload:${device.id}`,
    }, () => {
      if (this.state.run !== run || runLifetime(this.state.run) !== lifetime
        || lifetime !== this._activeLifetime || request.runToken !== runtime.runToken) {
        return { ok: false, reason: 'run_lifetime_changed' };
      }
      reloadPlan = prepareReload(record.entityId, runtime.runToken, amount);
      if (!reloadPlan || reloadPlan.ok !== true) {
        return { ok: false, reason: reloadPlan?.reason || 'service_refused' };
      }
      const committed = reloadPlan.commit();
      if (!committed || committed.ok !== true) {
        return { ok: false, reason: committed?.reason || 'service_commit_failed' };
      }
      return { ok: true, rollback: () => reloadPlan.rollback() };
    });
    if (receipt.accepted && reloadPlan) reloadPlan.finalize();
    const result = {
      requestId,
      accepted: receipt.accepted === true,
      serviced: receipt.accepted === true,
      reason: receipt.reason,
      credits: receipt.credits,
      totalCredits: receipt.totalCredits,
      entityId: request.entityId,
      deviceId: device.id,
    };
    return this._rememberCommand(runtime, result);
  },

  _rememberCommand(runtime, result) {
    if (runtime && Number.isSafeInteger(result.requestId)) {
      runtime.commandReceipts.set(result.requestId, Object.freeze({ ...result }));
      while (runtime.commandReceipts.size > 64) {
        const oldest = runtime.commandReceipts.keys().next();
        if (oldest.done) break;
        runtime.commandReceipts.delete(oldest.value);
      }
    }
    return this._resolve(result);
  },

  _resolve(result) {
    const readModel = this.getReadModel(result && result.requestId);
    const receipt = { ...result, runToken: readModel.runToken, readModel };
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(SWARM_FORTIFY_RECEIPT, receipt);
    return receipt;
  },

  _removePartialSpawn(requestId, reason) {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return false;
    let removed = false;
    for (const entity of entities.values()) {
      if (entity?.data?.swarmFortify?.requestId !== requestId) continue;
      removed = this._removeEntity(entity, reason) || removed;
    }
    return removed;
  },

  _removeEntity(entity, reason) {
    this.effects?.remove?.(entity?.id);
    if (entity && entity.id != null) this.fieldOwner.unregisterAnchoredFields(this.state, entity.id, reason);
    const remove = this.helpers && this.helpers.removeEntity;
    if (typeof remove === 'function') return remove(entity.id, { immediate: true, reason });
    return false;
  },

  _retireStructure(runtime, record, reason) {
    if (!record || runtime.structures.get(record.entityId) !== record) return false;
    if (this.state?.entities?.get?.(record.entityId) !== record.entity) {
      runtime.structures.delete(record.entityId);
      this._removeStructureRow(runtime, record);
      return true;
    }
    const removed = this._removeEntity(record.entity, reason);
    if (removed) {
      runtime.structures.delete(record.entityId);
      this._removeStructureRow(runtime, record);
    }
    return removed;
  },

  _removeStructureRow(runtime, record) {
    const rows = runtime?.structureRows;
    if (!Array.isArray(rows)) return false;
    const index = rows.indexOf(record);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  },

  _cleanupLifetime(lifetime, reason) {
    const runtime = fortifyRuntime(lifetime);
    if (!runtime) return 0;
    let removed = 0;
    for (const record of [...runtime.structures.values()]) {
      if (this._retireStructure(runtime, record, reason)) removed++;
    }
    return removed;
  },

  _cleanupAll(reason) {
    this._cleanupLifetime(this._activeLifetime, reason);
    if (this.state?.run && runLifetime(this.state.run) !== this._activeLifetime) {
      this._cleanupLifetime(runLifetime(this.state.run), reason);
    }
    this.effects?.update?.(0, []);
  },

  _updateRepulsors() {
    const run = this.state && this.state.run;
    const runtime = fortifyRuntime(runLifetime(run));
    if (!runtime) return;
    const tick = Number.isInteger(this.state?.tick) ? this.state.tick : 0;
    const active = run?.kind === 'survival' && isSwarmRuleset(run.ruleset) && run.phase === 'active';
    for (const record of runtime.structures.values()) {
      if (record.deviceId !== 'repulsor_pylon') continue;
      const entity = this.state?.entities?.get?.(record.entityId);
      const device = swarmFortifyDevice(record.deviceId);
      if (!entity || entity.alive === false || !device?.pulse) continue;
      const pulse = device.pulse;
      record.heat = Math.max(0, record.heat - pulse.coolingPerTick);
      const data = entity.data && entity.data.swarmFortify;
      if (!data) continue;
      if (record.pulseUntilTick != null && (!active || tick >= record.pulseUntilTick)) {
        this.fieldOwner.setAnchorArmed(this.state, entity.id, false, tick);
        record.pulseUntilTick = null;
      }
      if (tick < record.overloadUntilTick) {
        data.heat = Math.round(record.heat);
        data.offline = true;
        continue;
      }
      if (data.offline === true) data.offline = false;
      if (!active || record.pulseUntilTick != null || tick < record.nextPulseTick) {
        data.heat = Math.round(record.heat);
        continue;
      }
      if (record.heat + pulse.heatPerPulse >= pulse.overloadAt) {
        record.overloadUntilTick = tick + pulse.overloadTicks;
        record.nextPulseTick = record.overloadUntilTick + pulse.intervalTicks;
        data.heat = Math.round(record.heat);
        data.offline = true;
        this.fieldOwner.setAnchorArmed(this.state, entity.id, false, tick);
        continue;
      }
      if (!this.fieldOwner.setAnchorArmed(this.state, entity.id, true, tick)) {
        data.offline = true;
        continue;
      }
      record.heat += pulse.heatPerPulse;
      record.pulseUntilTick = tick + pulse.activeTicks;
      record.nextPulseTick = tick + pulse.intervalTicks;
      data.heat = Math.round(record.heat);
      data.offline = false;
    }
  },

  _onEntityDestroyed(receipt) {
    const entity = receipt && receipt.entity;
    if (!entity || !entity.data?.swarmFortify) return;
    const lifetime = runLifetime(this.state && this.state.run) || this._activeLifetime;
    const runtime = fortifyRuntime(lifetime);
    const record = runtime?.structures.get(entity.id);
    if (record && record.entity === entity) {
      this.effects?.remove?.(entity.id);
      this.fieldOwner.unregisterAnchoredFields(this.state, entity.id, 'fortify_destroyed');
      runtime.structures.delete(entity.id);
      this._removeStructureRow(runtime, record);
    }
  },

  _onSiegeSpawned(receipt) {
    const entity = receipt?.entity;
    const run = this.state?.run;
    const data = entity?.data;
    const ai = data?.ai;
    if (!entity || entity.alive === false || run?.phase !== 'active'
      || !Number.isInteger(run.wave) || data.runWave !== run.wave
      || typeof data.swarmGateGroup !== 'string'
      || ai?.activity?.reason !== 'survival_pursuit') return false;
    const runtime = fortifyRuntime(runLifetime(run));
    if (!runtime?.structureRows?.length) return false;
    const corridor = swarmFortifyCorridorForGate(data.swarmGateGroup, run.wave);
    if (!corridor) return false;
    const player = this.state.entities?.get?.(this.state.playerId);
    if (!player || !isHostileForAI(this.state, entity, player)) return false;

    let selected = null;
    let selectedHealth = Infinity;
    let selectedDistance = Infinity;
    for (const record of runtime.structureRows) {
      if (swarmFortifySocket(record.socketId)?.corridor !== corridor) continue;
      const target = this.state.entities?.get?.(record.entityId);
      if (!target || target.alive === false || !(target.hull > 0) || !target.pos
        || !isHostileForAI(this.state, entity, target)) continue;
      const distance = Math.hypot(target.pos.x - entity.pos.x, target.pos.z - entity.pos.z);
      if (distance > SWARM_FORTIFY_SIEGE_REACH) continue;
      const health = target.hull / Math.max(1, target.hullMax || target.hull);
      if (health < selectedHealth || (health === selectedHealth && distance < selectedDistance)
        || (health === selectedHealth && distance === selectedDistance
          && String(target.id).localeCompare(String(selected?.id)) < 0)) {
        selected = target;
        selectedHealth = health;
        selectedDistance = distance;
      }
    }
    if (!selected) return false;
    // Orders go through the shared AI doctrine seam. TacticalAI retains target validation,
    // perception and firing authorization; this owner chooses only the authored siege objective.
    setEntityDoctrine(entity, {
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'swarm_fortify:siege',
        targetId: selected.id,
        anchor: { x: selected.pos.x, z: selected.pos.z },
        preferredRange: Math.max(48, (Number(selected.radius) || 56) + 24),
      },
    });
    return true;
  },

  _onRunStarted() {
    const nextLifetime = runLifetime(this.state && this.state.run);
    if (nextLifetime !== this._activeLifetime) this._cleanupAll('run_replaced');
    this._activeLifetime = nextLifetime;
    fortifyRuntime(this._activeLifetime, true);
  },

  _onWavePlanned() {
    const runtime = fortifyRuntime(runLifetime(this.state && this.state.run), true);
    if (!runtime || runtime.arenaAnchor) return;
    const player = this.state?.entities?.get?.(this.state.playerId);
    if (!player?.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) return;
    runtime.arenaAnchor = {
      x: player.pos.x,
      z: player.pos.z,
      rotation: Number.isFinite(player.rot) ? player.rot : 0,
    };
  },

  // The ordinary first wave follows the pilot. Establish the construction field where that
  // wave actually ended, when the paused build view opens. The first accepted device pins it
  // for this run; later purchases are remote field commands and cannot require a paused pilot
  // to fly back to the base before a socket becomes usable.
  _prepareBuildAnchor() {
    if (!liveSwarmBuildRun(this.state)) return;
    const runtime = fortifyRuntime(runLifetime(this.state.run));
    if (!runtime || runtime.fortifiedIngress || runtime.structures.size > 0) return;
    const player = this.state.entities?.get?.(this.state.playerId);
    if (!player || player.alive === false || !Number.isFinite(player.pos?.x)
      || !Number.isFinite(player.pos?.z)) return;
    runtime.arenaAnchor = {
      x: player.pos.x,
      z: player.pos.z,
      rotation: Number.isFinite(player.rot) ? player.rot : 0,
    };
  },

  _onRunEnded() {
    const lifetime = runLifetime(this.state && this.state.run) || this._activeLifetime;
    this._cleanupLifetime(lifetime, 'run_ended');
    if (lifetime !== this._activeLifetime) this._cleanupLifetime(this._activeLifetime, 'run_ended');
  },
};

export default swarmFortify;
