import { AI_CONTRACT_VERSION, ContactKind, normalizeSensorFrame, stableId, wrapAngle } from '../ai/contracts.js';
import { measureThrusterAuthority, writePhysicsControl } from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';

const DEFAULT_SENSOR_RANGE = 1600;
const DEFAULT_FORMATION_SPACING = 72;
const DEFAULT_FORMATION_BOUND = 170;
const RECENT_EVENT_TICKS = 90;

export const aiPorts = {
  name: 'aiPorts',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this._pendingManeuvers = new Map();
    this._diag = {
      schemaVersion: AI_CONTRACT_VERSION,
      sensorsInstalled: true,
      rosterInstalled: true,
      maneuverInstalled: true,
      acceptedManeuvers: 0,
      flushedManeuvers: 0,
      droppedManeuvers: 0,
      lastDropReason: null,
    };

    this.helpers.aiSensors = Object.freeze({
      frameFor: (entityId, tick) => this._sensorFrameFor(entityId, tick),
    });
    this.helpers.aiRoster = Object.freeze({
      listSquads: (tick) => this._listSquads(tick),
    });
    this.helpers.aiManeuver = Object.freeze({
      request: (request) => this._requestManeuver(request),
    });
    this.helpers.inspectAIPorts = () => this.inspect();
  },

  update(dt, state) {
    if (!this._pendingManeuvers || this._pendingManeuvers.size === 0) return;
    if (!usesSg02DynamicAuthority(state) || !sg02Ready(state)) {
      this._dropPending(usesSg02DynamicAuthority(state) ? 'physics_owner_unavailable' : 'physics_backend_unavailable');
      return;
    }

    const pending = [...this._pendingManeuvers.values()].sort((a, b) => compareIds(a.request.entityId, b.request.entityId));
    this._pendingManeuvers.clear();
    for (const entry of pending) {
      const entity = getEntity(state, entry.request.entityId);
      if (!isLiveCraft(entity)) {
        this._diag.droppedManeuvers++;
        this._diag.lastDropReason = 'entity_unavailable';
        continue;
      }
      writePhysicsControl(entity, controlFromManeuver(entity, entry.request, dt, state));
      this._diag.flushedManeuvers++;
    }
  },

  inspect() {
    return Object.freeze({
      ...this._diag,
      pendingManeuvers: this._pendingManeuvers ? this._pendingManeuvers.size : 0,
    });
  },

  _requestManeuver(request = {}) {
    const state = this.state;
    if (!usesSg02DynamicAuthority(state)) return this._rejectManeuver('physics_backend_unavailable');
    if (!sg02Ready(state)) return this._rejectManeuver('physics_owner_unavailable');
    if (!request || request.version !== AI_CONTRACT_VERSION) return this._rejectManeuver('contract_version_mismatch');
    const entity = getEntity(state, request.entityId);
    if (!isLiveCraft(entity)) return this._rejectManeuver('entity_unavailable');
    if (entity.physicsBody && entity.physicsBody.dynamic === false) return this._rejectManeuver('body_not_dynamic');
    const normalized = normalizeManeuverRequest(request, state.tick);
    this._pendingManeuvers.set(stableId(normalized.entityId), Object.freeze({
      request: normalized,
      acceptedTick: state.tick,
    }));
    this._diag.acceptedManeuvers++;
    return true;
  },

  _rejectManeuver(reason) {
    this._diag.droppedManeuvers++;
    this._diag.lastDropReason = reason;
    return false;
  },

  _dropPending(reason) {
    this._diag.droppedManeuvers += this._pendingManeuvers.size;
    this._diag.lastDropReason = reason;
    this._pendingManeuvers.clear();
  },

  _sensorFrameFor(entityId, tick) {
    const state = this.state;
    const entity = getEntity(state, entityId);
    if (!entity || !entity.alive) return normalizeSensorFrame(null, entityId, tick);
    const range = sensorRangeFor(state, entity);
    const contacts = [
      ...entityContacts(state, entity, range, this.helpers),
      ...attachmentContacts(state, entity, range),
    ].sort(contactSort);
    const frame = {
      tick,
      self: sensorSelf(state, entity),
      contacts,
      events: recentEventsFor(state, entity, tick),
    };
    return normalizeSensorFrame(frame, entityId, tick);
  },

  _listSquads(tick) {
    const state = this.state;
    const squads = new Map();
    const source = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of source.slice().sort((a, b) => compareIds(a && a.id, b && b.id))) {
      if (!isLiveCraft(entity) || entity.id === state.playerId) continue;
      const ai = entity.data && entity.data.ai;
      if (!ai || ai.passive) continue;
      const doctrine = String(ai.doctrine || doctrineFor(entity));
      const faction = String(entity.factionId || ai.faction || `team_${entity.team == null ? 'unknown' : entity.team}`);
      const squadId = String(ai.squadId || ai.wingId || `${doctrine}:${faction}`);
      let squad = squads.get(squadId);
      if (!squad) {
        squad = {
          id: squadId,
          doctrine,
          faction,
          formation: String(ai.formation || defaultFormation(doctrine)),
          formationSpacing: positive(ai.formationSpacing, DEFAULT_FORMATION_SPACING),
          formationBound: positive(ai.formationBound, DEFAULT_FORMATION_BOUND),
          members: [],
          tick,
        };
        squads.set(squadId, squad);
      }
      squad.members.push(Object.freeze({
        id: entity.id,
        preferredRole: ai.preferredRole || ai.role || null,
        capabilities: Object.freeze(capabilitiesFor(state, entity)),
      }));
    }

    return Object.freeze([...squads.values()].map((squad) => Object.freeze({
      id: squad.id,
      doctrine: squad.doctrine,
      faction: squad.faction,
      formation: squad.formation,
      formationSpacing: squad.formationSpacing,
      formationBound: squad.formationBound,
      members: Object.freeze(squad.members.sort((a, b) => compareIds(a.id, b.id))),
    })).sort((a, b) => compareText(a.id, b.id)));
  },
};

function controlFromManeuver(entity, request, dt, state) {
  const profile = resolveFlightProfile(entity, state);
  const authority = measureThrusterAuthority(entity);
  const axes = localAxes(entity.rot || 0);
  const boostMult = request.boost ? profile.boostMult : 1;
  const forwardInput = clamp(request.forceLocal.forward, -1, 1);
  const rightInput = clamp(request.forceLocal.right, -1, 1);
  const forwardAuthority = forwardInput >= 0 ? authority.forward : authority.reverse;
  const forwardAccel = forwardInput * (forwardInput >= 0 ? profile.mainAccel : profile.reverseAccel) * forwardAuthority * boostMult;
  const rightAccel = rightInput * profile.strafeAccel * authority.strafe * boostMult;
  const force = {
    x: (axes.fx * forwardAccel + axes.rx * rightAccel) * profile.mass,
    y: 0,
    z: (axes.fz * forwardAccel + axes.rz * rightAccel) * profile.mass,
  };
  if (request.brake) addBrakeForce(force, entity, profile, dt);
  const torqueYaw = clamp(request.torqueYaw, -1, 1) * profile.angularAccel * profile.inertia * authority.yaw;
  return {
    source: 'sg06-ai-maneuver',
    mode: profile.mode,
    force,
    torque: { x: 0, y: torqueYaw, z: 0 },
    authority,
    maxSpeed: profile.maxSpeed * (request.boost ? profile.boostMaxSpeedMult : profile.normalMaxSpeedMult),
  };
}

function addBrakeForce(force, entity, profile, dt) {
  const dtSafe = Math.max(1e-6, Number.isFinite(dt) && dt > 0 ? dt : 1 / 60);
  const vx = finite(entity.vel && entity.vel.x);
  const vz = finite(entity.vel && entity.vel.z);
  const lambda = Math.max(0, profile.linearDrag + profile.reverseBrake);
  const scale = Math.exp(-lambda * dtSafe);
  force.x += ((vx * scale) - vx) * profile.mass / dtSafe;
  force.z += ((vz * scale) - vz) * profile.mass / dtSafe;
}

function sensorSelf(state, entity) {
  const runtime = combatRuntimeFor(state, entity.id);
  const heatMax = positive(runtime && runtime.heatMax, 100);
  return {
    id: entity.id,
    team: entity.team == null ? null : entity.team,
    pos: vec2(entity.pos),
    vel: vec2(entity.vel),
    rot: finite(entity.rot),
    radius: positive(entity.radius, 1),
    hullFraction: fraction(entity.hull, entity.hullMax, 1),
    energyFraction: fraction(entity.cap, entity.capMax, 1),
    heatFraction: clamp(finite(runtime && runtime.heat, 0) / heatMax, 0, 1),
    disabled: isDisabled(runtime, entity),
    tethered: activeAttachmentsFor(state, entity.id).length > 0,
    capabilities: capabilitiesFor(state, entity),
    subsystemFractions: subsystemFractions(runtime),
  };
}

function entityContacts(state, self, range, helpers = null) {
  const out = [];
  const candidates = nearbyEntities(state, self.pos, range, helpers);
  for (const other of candidates) {
    if (!other || other === self || !other.alive) continue;
    const kind = contactKindFor(other);
    if (!kind) continue;
    const distance = distance2(self.pos, other.pos);
    if (distance > range) continue;
    const runtime = combatRuntimeFor(state, other.id);
    out.push({
      id: other.id,
      kind,
      team: other.team == null ? null : other.team,
      classification: classificationFor(other),
      pos: vec2(other.pos),
      vel: vec2(other.vel),
      radius: positive(other.radius, 0),
      confidence: confidenceFor(distance, range, state, self),
      threat: threatFor(self, other),
      targetId: other.data && other.data.combat ? other.data.combat.targetId : null,
      ownerId: other.ownerId == null ? null : other.ownerId,
      disabled: isDisabled(runtime, other),
      tethered: activeAttachmentsFor(state, other.id).length > 0,
      exposed: false,
      ownedBySelf: false,
      objectiveValue: objectiveValueFor(other),
      massClass: Math.max(1, Math.round(Math.log2(positive(other.mass, 1) + 1))),
      tags: tagsFor(other, runtime),
    });
  }
  return out;
}

function attachmentContacts(state, self, range) {
  const out = [];
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  for (const attachment of Object.values(attachments).sort((a, b) => compareText(String(a.id), String(b.id)))) {
    if (!attachment || attachment.state !== 'active') continue;
    const owner = getEntity(state, attachment.ownerId);
    const target = getEntity(state, attachment.targetId);
    if (!owner || !target) continue;
    const pos = midpoint(owner.pos, target.pos);
    const distance = distance2(self.pos, pos);
    const endpointVisible = attachment.ownerId === self.id || attachment.targetId === self.id;
    if (!endpointVisible && distance > range) continue;
    const hostile = isHostile(self, attachment.ownerId === self.id ? target : owner);
    const ownedBySelf = attachment.ownerId === self.id;
    out.push({
      id: attachment.id,
      kind: ContactKind.TETHER,
      team: owner.team == null ? null : owner.team,
      classification: attachment.defId || 'massline',
      pos,
      vel: relativeVelocity(owner, target),
      radius: 2,
      confidence: endpointVisible ? 1 : confidenceFor(distance, range, state, self),
      threat: hostile ? 0.85 : 0.25,
      targetId: attachment.targetId,
      ownerId: attachment.ownerId,
      attachmentId: attachment.id,
      sourceSocketId: attachment.sourceSocketId || null,
      targetSocketId: attachment.targetSocketId || null,
      exposed: ownedBySelf,
      tethered: attachment.targetId === self.id || attachment.ownerId === self.id,
      disabled: false,
      ownedBySelf,
      objectiveValue: 0,
      massClass: 1,
      tags: ownedBySelf
        ? ['cuttable_by_self', 'massline', 'owned_by_self', 'severable']
        : ['hostile', 'massline', 'overloadable'],
    });
  }
  return out;
}

function recentEventsFor(state, entity, tick) {
  const events = state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events : [];
  const out = [];
  for (let index = events.length - 1; index >= 0 && out.length < 12; index--) {
    const event = events[index];
    if (!event || event.targetId !== entity.id) continue;
    const age = tick - (Number.isInteger(event.tick) ? event.tick : tick);
    if (age < 0 || age > RECENT_EVENT_TICKS) continue;
    if (event.kind === 'damage.routed') {
      out.push({
        type: 'damage_received',
        sourceId: event.attackerId == null ? null : event.attackerId,
        targetId: entity.id,
        magnitude: finite(event.totalApplied, finite(event.hullDamage, 0)),
        tags: ['combat'],
      });
    } else if (event.kind === 'subsystem.disabled') {
      out.push({
        type: 'subsystem_disabled',
        sourceId: event.attackerId == null ? null : event.attackerId,
        targetId: entity.id,
        magnitude: 1,
        tags: [String(event.subsystemId || 'unknown')],
      });
    }
  }
  return out.reverse();
}

function normalizeManeuverRequest(request, fallbackTick) {
  const forceLocal = request.forceLocal || {};
  return Object.freeze({
    version: AI_CONTRACT_VERSION,
    entityId: request.entityId,
    tick: Number.isInteger(request.tick) ? request.tick : fallbackTick,
    kind: String(request.kind || 'hold'),
    forceLocal: Object.freeze({
      forward: clamp(finite(forceLocal.forward), -1, 1),
      right: clamp(finite(forceLocal.right), -1, 1),
    }),
    torqueYaw: clamp(finite(request.torqueYaw), -1, 1),
    boost: !!request.boost,
    brake: !!request.brake,
    targetHeading: wrapAngle(finite(request.targetHeading)),
    horizonTicks: clamp(Number.isInteger(request.horizonTicks) ? request.horizonTicks : 30, 1, 240),
    trajectory: Object.freeze(Array.isArray(request.trajectory) ? request.trajectory.slice(0, 8).map((point) => Object.freeze({
      x: finite(point && point.x),
      z: finite(point && point.z),
      tick: Number.isInteger(point && point.tick) ? point.tick : fallbackTick,
    })) : []),
    reason: String(request.reason || 'no_reason'),
  });
}

function capabilitiesFor(state, entity) {
  const runtime = combatRuntimeFor(state, entity.id);
  const out = new Set();
  const base = runtime && runtime.capabilities || {};
  for (const [name, enabled] of Object.entries(base)) if (enabled !== false) out.add(name);
  const ai = entity.data && entity.data.ai || {};
  for (const capability of ai.capabilities || []) if (typeof capability === 'string') out.add(capability);
  const role = String(ai.role || ai.preferredRole || ai.archetype || '').toLowerCase();
  if (role.includes('sniper')) out.add('ranged');
  if (role.includes('tug')) out.add('tug');
  if (role.includes('thief')) out.add('steal');
  if (role.includes('screen')) out.add('screen');
  if (role.includes('support')) out.add('disable');
  return [...out].sort();
}

function subsystemFractions(runtime) {
  const out = {};
  for (const [id, subsystem] of Object.entries(runtime && runtime.subsystems || {})) {
    out[id] = fraction(subsystem.health, subsystem.maxHealth, 1);
  }
  return out;
}

function tagsFor(entity, runtime) {
  const tags = new Set();
  if (entity.collides) tags.add('solid');
  if (entity.data && Array.isArray(entity.data.weapons) && entity.data.weapons.length) tags.add('armed');
  if (entity.factionId) tags.add(String(entity.factionId));
  for (const capability of Object.keys(runtime && runtime.capabilities || {})) {
    if (runtime.capabilities[capability] !== false) tags.add(capability);
  }
  return [...tags].sort();
}

function nearbyEntities(state, pos, range, helpers = null) {
  const helper = helpers && helpers.queryRadius;
  if (typeof helper === 'function') return helper(pos, range, []);
  if (state.spatialHash && state.entityIndex && state.entityIndex.ready && typeof state.spatialHash.queryRadius === 'function') {
    const out = [];
    state.spatialHash.queryRadius(pos.x, pos.z, range, out);
    return out;
  }
  return Array.isArray(state.entityList) ? state.entityList : [];
}

function activeAttachmentsFor(state, entityId) {
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  return Object.values(attachments).filter((attachment) =>
    attachment && attachment.state === 'active' && (attachment.ownerId === entityId || attachment.targetId === entityId));
}

function combatRuntimeFor(state, entityId) {
  return state.combat && state.combat.entities && state.combat.entities[String(entityId)] || null;
}

function sensorRangeFor(state, entity) {
  const ai = entity.data && entity.data.ai || {};
  const runtime = combatRuntimeFor(state, entity.id);
  const sensorFraction = subsystemFraction(runtime, 'subsystem_sensor');
  const base = positive(ai.sensorRange, positive(entity.sensorRange, DEFAULT_SENSOR_RANGE));
  const sensorOnline = !runtime || !runtime.capabilities || runtime.capabilities.sensor !== false;
  return base * (sensorOnline ? 1 : 0.25) * clamp(0.35 + sensorFraction * 0.65, 0.2, 1);
}

function subsystemFraction(runtime, id) {
  const subsystem = runtime && runtime.subsystems && runtime.subsystems[id];
  return subsystem ? fraction(subsystem.health, subsystem.maxHealth, 1) : 1;
}

function contactKindFor(entity) {
  if (entity.type === 'ship' || entity.type === 'drone') return ContactKind.SHIP;
  if (entity.type === 'projectile') return ContactKind.PROJECTILE;
  if (entity.type === 'asteroid' || entity.type === 'station' || entity.type === 'wreck') return ContactKind.HAZARD;
  if (entity.type === 'pickup') return ContactKind.OBJECTIVE;
  return null;
}

function classificationFor(entity) {
  const role = entity.data && (entity.data.scenarioRole || entity.data.role || entity.data.archetype);
  if (role) return String(role);
  if (entity.type === 'ship' && entity.factionId) return `${entity.factionId}_ship`;
  return String(entity.type || 'unknown');
}

function objectiveValueFor(entity) {
  if (entity.type === 'pickup') return 0.7;
  if (entity.data && entity.data.objectiveValue != null) return Math.max(0, finite(entity.data.objectiveValue));
  return 0;
}

function threatFor(self, other) {
  if (!isHostile(self, other)) return 0;
  const armed = other.data && Array.isArray(other.data.weapons) && other.data.weapons.length ? 0.2 : 0;
  return clamp(0.45 + armed + positive(other.mass, 1) / 400, 0, 1);
}

function isHostile(self, other) {
  if (!self || !other || self.team == null || other.team == null) return false;
  return self.team !== other.team;
}

function isDisabled(runtime, entity) {
  if (!entity || entity.alive === false) return true;
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

function doctrineFor(entity) {
  const ai = entity.data && entity.data.ai || {};
  if (ai.doctrine) return ai.doctrine;
  if (entity.factionId === 'faction_scn') return 'official';
  if (entity.factionId === 'faction_vael' || entity.factionId === 'faction_reach') return 'scavenger';
  return 'balanced';
}

function defaultFormation(doctrine) {
  return doctrine === 'official' ? 'line' : 'wedge';
}

function usesSg02DynamicAuthority(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  return !!(gameplay && gameplay.physicsBackend === 'rapier-dynamic');
}

function sg02Ready(state) {
  const diag = state && state.physicsRuntime && state.physicsRuntime.diagnostics;
  return !!(diag && diag.backend === 'rapier-dynamic' && diag.sg02Ready === true);
}

function getEntity(state, id) {
  return state && state.entities && state.entities.get ? state.entities.get(id) || null : null;
}

function isLiveCraft(entity) {
  return !!(entity && entity.alive !== false && (entity.type === 'ship' || entity.type === 'drone'));
}

function localAxes(rot) {
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  return { fx, fz, rx: -fz, rz: fx };
}

function vec2(value) {
  return Object.freeze({ x: finite(value && value.x), z: finite(value && value.z) });
}

function midpoint(a, b) {
  return { x: (finite(a && a.x) + finite(b && b.x)) * 0.5, z: (finite(a && a.z) + finite(b && b.z)) * 0.5 };
}

function relativeVelocity(a, b) {
  return { x: finite(b.vel && b.vel.x) - finite(a.vel && a.vel.x), z: finite(b.vel && b.vel.z) - finite(a.vel && a.vel.z) };
}

function distance2(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function confidenceFor(distance, range, state, entity) {
  const sensorFraction = subsystemFraction(combatRuntimeFor(state, entity.id), 'subsystem_sensor');
  return clamp((1 - distance / Math.max(1, range)) * (0.55 + sensorFraction * 0.45), 0.1, 1);
}

function contactSort(a, b) {
  const ak = `${a.kind}|${stableId(a.id)}`;
  const bk = `${b.kind}|${stableId(b.id)}`;
  return compareText(ak, bk);
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return compareText(stableId(a), stableId(b));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fraction(value, max, fallback) {
  const denom = positive(max, 0);
  if (!(denom > 0)) return fallback;
  return clamp(finite(value, denom) / denom, 0, 1);
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
