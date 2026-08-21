import {
  AI_CONTRACT_VERSION,
  ContactKind,
  DirectorPhase,
  NORMALIZED_SENSOR_FRAME_FLAG,
  NORMALIZED_THRUSTER_REQUEST_FLAG,
  makeTrustedSensorFrame,
  normalizeSensorFrame,
  stableId,
  wrapAngle,
} from '../ai/contracts.js';
import { activityAllowsOffense, effectiveActivityForAI, normalizeRoe } from '../ai/doctrine.js';
import { CombatDoctrineId, normalizeCombatDoctrineId } from '../ai/combatDoctrine.js';
import { normalizeFactionBehaviorProfile } from '../ai/factionBehavior.js';
import { authorizeAIEngagement, isHostileForAI } from '../ai/engagementAuthority.js';
import { measureThrusterAuthority, writePhysicsControl } from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';
import { massline2Flag } from '../data/featureFlags.js';
import { tableSimAuthorityWuFromState } from '../render/tabletopPolicy.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../data/sectorActivityPockets.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
import { ensureActivityClassified, entityNeedsAiThink } from '../world/activityRuntime.js';

const DEFAULT_SENSOR_RANGE = 1600;
const DEFAULT_FORMATION_SPACING = 72;
const DEFAULT_FORMATION_BOUND = 170;
const RECENT_EVENT_TICKS = 90;
const ENCOUNTER_COMMAND_RING_CAPACITY = 128;
const ENCOUNTER_COMMAND_TYPES = new Set(['phase', 'request_reinforcement', 'order_retreat', 'narrative_beat']);
const DIRECTOR_PHASES = new Set(Object.values(DirectorPhase));
const NORMALIZED_ROSTER_FLAG = '__spacefaceNormalizedAIRoster';
const ROSTER_SIGNATURE_FLAG = '__spacefaceRosterSignature';
const EMPTY_ATTACHMENTS = Object.freeze([]);
const AI_SPATIAL_MIN_COLLIDABLES = 96;
const LAW_JOB_RESPONSE_HOLDER = 'lawSecurity';
const CERES_LAW_JOB_SLOTS_BY_ID = new Map(CERES_ACTIVITY_POCKETS.flatMap((pocket) => (
  pocket.actorSlots
    .filter((slot) => slot.lawful === true && slot.jobKind === 'patrol')
    .map((slot) => [slot.id, slot])
)));
const OWNED_TETHER_TAGS = Object.freeze(['cuttable_by_self', 'massline', 'owned_by_self', 'severable']);
const HOSTILE_TETHER_TAGS = Object.freeze(['hostile', 'massline', 'overloadable']);
const SOLID_TAGS = Object.freeze(['solid']);
const EMPTY_SUBSYSTEM_FRACTIONS = Object.freeze({});
const CAPABILITY_DEPENDENCIES = Object.freeze({
  drive: Object.freeze(['drive']),
  weapon: Object.freeze(['weapon']),
  sensor: Object.freeze(['sensor']),
  tether: Object.freeze(['tether']),
  power: Object.freeze(['power']),
  ranged: Object.freeze(['weapon', 'sensor']),
  disable: Object.freeze(['weapon', 'sensor']),
  screen: Object.freeze(['drive']),
  steal: Object.freeze(['drive']),
  tug: Object.freeze(['tether']),
  counter_tether_cut: Object.freeze(['sensor']),
  counter_tether_overload: Object.freeze(['drive']),
});

export const aiPorts = {
  name: 'aiPorts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this._pendingManeuvers = new Map();
    this._capabilityCacheTick = -1;
    this._capabilityCache = new Map();
    this._tagCacheTick = -1;
    this._tagCache = new Map();
    this._subsystemFractionCacheTick = -1;
    this._subsystemFractionCache = new Map();
    this._contactBaseCacheTick = -1;
    this._contactBaseCache = new Map();
    this._attachmentCacheTick = -1;
    this._attachmentIndexCache = { all: EMPTY_ATTACHMENTS, byEntity: new Map() };
    this._recentEventCacheTick = -1;
    this._recentEventsByTarget = new Map();
    this._sensorCandidateScratch = [];
    this._sensorContactsScratch = [];
    this._sensorTetherContactsScratch = [];
    this._liveSensorFrameScratch = {
      tick: -1,
      self: null,
      contacts: this._sensorContactsScratch,
      events: EMPTY_ATTACHMENTS,
    };
    Object.defineProperty(this._liveSensorFrameScratch, NORMALIZED_SENSOR_FRAME_FLAG, { value: true });
    this._liveSensorFramesScratch = new Map();
    this._liveSensorBatchRequests = [];
    this._liveSensorBatchEntries = [];
    this._liveSensorBatchEntryCount = 0;
    this._pendingFlushScratch = [];
    this._rosterCandidateScratch = [];
    this._rosterSquadsScratch = new Map();
    ensureEncounterState(this.state);
    this._diag = {
      schemaVersion: AI_CONTRACT_VERSION,
      sensorsInstalled: true,
      rosterInstalled: true,
      maneuverInstalled: true,
      encounterInstalled: true,
      acceptedManeuvers: 0,
      flushedManeuvers: 0,
      droppedManeuvers: 0,
      lastDropReason: null,
      acceptedEncounterCommands: 0,
      rejectedEncounterCommands: 0,
      lastEncounterDropReason: null,
      sensorFrames: 0,
      sensorBatches: 0,
    };

    this.helpers.aiSensors = Object.freeze({
      frameFor: (entityId, tick) => this._sensorFrameFor(entityId, tick),
      liveFrameFor: (entityId, tick) => this._sensorFrameFor(entityId, tick, { freezeResults: false }),
      liveFramesFor: (entityIds, tick, options) => this._sensorFramesFor(entityIds, tick, options),
    });
    this.helpers.aiRoster = Object.freeze({
      listSquads: (tick) => this._listSquads(tick),
      liveListSquads: (tick) => this._listSquads(tick, { freezeResults: false }),
    });
    this.helpers.aiManeuver = Object.freeze({
      request: (request) => this._requestManeuver(request),
    });
    this.helpers.aiEncounter = Object.freeze({
      issue: (command) => this._issueEncounterCommand(command),
    });
    this.helpers.inspectAIPorts = () => this.inspect();
  },

  update(dt, state) {
    clearIneligibleAIFiringIntents(state, this.helpers);
    if (!this._pendingManeuvers || this._pendingManeuvers.size === 0) return;
    if (!usesSg02DynamicAuthority(state) || !sg02Ready(state)) {
      this._dropPending(usesSg02DynamicAuthority(state) ? 'physics_owner_unavailable' : 'physics_backend_unavailable');
      return;
    }

    const pending = this._pendingFlushScratch || (this._pendingFlushScratch = []);
    pending.length = 0;
    for (const entry of this._pendingManeuvers.values()) pending.push(entry);
    pending.sort((a, b) => compareIds(a.request.entityId, b.request.entityId));
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
    pending.length = 0;
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

  _issueEncounterCommand(command = {}) {
    const state = this.state;
    const normalized = normalizeEncounterCommand(command, state && state.tick);
    if (!normalized.ok) {
      this._diag.rejectedEncounterCommands++;
      this._diag.lastEncounterDropReason = normalized.reason;
      return false;
    }
    const encounter = ensureEncounterState(state);
    const record = Object.freeze({
      seq: encounter.nextSeq++,
      ...normalized.command,
    });
    encounter.commands.push(record);
    while (encounter.commands.length > ENCOUNTER_COMMAND_RING_CAPACITY) encounter.commands.shift();
    this._diag.acceptedEncounterCommands++;
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('ai:encounterCommand', record);
    return true;
  },

  _sensorFrameFor(entityId, tick, options = {}) {
    const state = this.state;
    const live = options.freezeResults === false;
    const freeze = live ? identity : Object.freeze;
    const entity = getEntity(state, entityId);
    if (!entity || !entity.alive) return normalizeSensorFrame(null, entityId, tick);
    const range = sensorRangeFor(state, entity);
    const attachmentIndex = this._attachmentIndex();
    const contacts = entityContacts(
      state,
      entity,
      range,
      this.helpers,
      attachmentIndex,
      freeze,
      this._sensorCandidateScratch,
      options.contactsScratch || (live ? this._sensorContactsScratch : null),
      this,
      options.candidates || null,
    );
    const tetherContacts = attachmentContacts(
      state,
      entity,
      range,
      attachmentIndex.all,
      freeze,
      options.tetherContactsScratch || (live ? this._sensorTetherContactsScratch : null),
    );
    for (const contact of tetherContacts) contacts.push(contact);
    if (freeze !== identity) contacts.sort(contactSort);
    if (live) {
      const frame = options.frameScratch || this._liveSensorFrameScratch;
      if (frame[NORMALIZED_SENSOR_FRAME_FLAG] !== true) {
        Object.defineProperty(frame, NORMALIZED_SENSOR_FRAME_FLAG, { value: true });
      }
      frame.tick = tick;
      frame.self = sensorSelf(state, entity, this._capabilitiesFor(entity, tick), attachmentIndex, freeze, this);
      frame.contacts = contacts;
      frame.events = this._recentEventsFor(entity, tick, freeze);
      return frame;
    }
    const frame = {
      tick,
      self: sensorSelf(state, entity, this._capabilitiesFor(entity, tick), attachmentIndex, freeze, this),
      contacts,
      events: this._recentEventsFor(entity, tick, freeze),
    };
    return options.freezeResults === false
      ? makeTrustedSensorFrame(frame, entityId, tick, options)
      : normalizeSensorFrame(frame, entityId, tick);
  },

  _sensorFramesFor(entityIds, tick, options = null) {
    const ids = Array.isArray(entityIds) ? entityIds : [];
    if (options && options.ephemeral === true) return this._ephemeralSensorFramesFor(ids, tick);
    const singleton = ids.length === 1;
    const frames = singleton
      ? (this._liveSensorFramesScratch || (this._liveSensorFramesScratch = new Map()))
      : new Map();
    frames.clear();
    if (!ids.length) return frames;
    if (singleton) {
      const id = ids[0];
      const frame = this._sensorFrameFor(id, tick, { freezeResults: false });
      frames.set(id, frame);
      this._diag.sensorFrames++;
      return frames;
    }
    const state = this.state;
    const index = state && state.entityIndex;
    const dense = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.collidables) &&
      index.collidables.length >= AI_SPATIAL_MIN_COLLIDABLES;
    const hash = state && state.spatialHash;
    const canBatch = dense && hash && typeof hash.queryRadiusBatch === 'function';
    const requests = [];
    if (canBatch) {
      for (const id of ids) {
        const entity = getEntity(state, id);
        if (!entity || !entity.alive) continue;
        requests.push({ id, x: entity.pos.x, z: entity.pos.z, r: sensorRangeFor(state, entity), out: [] });
      }
      hash.queryRadiusBatch(requests, { shareResults: true, shareSupersetResults: true });
      this._diag.sensorBatches++;
    }
    const candidatesById = new Map(requests.map((request) => [request.id, request.out]));
    for (const id of ids) {
      const frame = this._sensorFrameFor(id, tick, {
        freezeResults: false,
        candidates: candidatesById.get(id) || null,
        contactsScratch: [],
        tetherContactsScratch: [],
        frameScratch: {},
      });
      frames.set(id, frame);
      this._diag.sensorFrames++;
    }
    return frames;
  },

  /**
   * Production-only sensor batch. TacticalAIStack consumes every frame synchronously before the
   * next call, so these containers may return to retained high-water scratch. The public two-arg
   * liveFramesFor route above keeps its durable independent-map behavior for tools and tests.
   */
  _ephemeralSensorFramesFor(ids, tick) {
    const frames = this._liveSensorFramesScratch;
    const requests = this._liveSensorBatchRequests;
    const entries = this._liveSensorBatchEntries;
    const previousEntryCount = this._liveSensorBatchEntryCount;
    frames.clear();
    requests.length = 0;

    const state = this.state;
    const index = state && state.entityIndex;
    const dense = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.collidables) &&
      index.collidables.length >= AI_SPATIAL_MIN_COLLIDABLES;
    const hash = state && state.spatialHash;
    const canBatch = ids.length > 1 && dense && hash && typeof hash.queryRadiusBatch === 'function';

    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      const entry = liveSensorBatchEntry(entries, index);
      entry.contacts.length = 0;
      entry.tetherContacts.length = 0;
      entry.frame.self = null;
      entry.frame.events = EMPTY_ATTACHMENTS;
      entry.requestActive = false;
      if (!canBatch) continue;
      const entity = getEntity(state, id);
      if (!entity || !entity.alive) continue;
      const request = entry.request;
      entry.candidates.length = 0;
      request.id = id;
      request.x = entity.pos.x;
      request.z = entity.pos.z;
      request.r = sensorRangeFor(state, entity);
      request.out = entry.candidates;
      entry.requestActive = true;
      requests.push(request);
    }

    if (requests.length) {
      // This caller consumes candidates synchronously and never exposes them. Keeping the shared
      // arrays mutable is what lets the next decision reuse them instead of allocating/freeze-GC.
      hash.queryRadiusBatch(requests, {
        shareResults: true,
        shareSupersetResults: true,
        mutableSharedResults: true,
      });
      this._diag.sensorBatches++;
    }

    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      const entry = liveSensorBatchEntry(entries, index);
      const frame = this._sensorFrameFor(id, tick, {
        freezeResults: false,
        candidates: entry.requestActive ? entry.request.out : null,
        contactsScratch: entry.contacts,
        tetherContactsScratch: entry.tetherContacts,
        frameScratch: entry.frame,
      });
      frames.set(id, frame);
      this._diag.sensorFrames++;
    }

    // Candidate arrays contain authoritative entity references. Release them immediately after
    // contacts have been copied, while retaining only their capacity for the next decision.
    for (let index = 0; index < ids.length; index++) {
      const entry = entries[index];
      if (!entry || !entry.requestActive) continue;
      const shared = entry.request.out;
      if (Array.isArray(shared) && !Object.isFrozen(shared)) shared.length = 0;
      entry.request.out = entry.candidates;
      entry.candidates.length = 0;
      entry.requestActive = false;
    }
    requests.length = 0;

    // A one-time larger formation may establish capacity, but inactive slots must not retain old
    // contact/self/event graphs when the live formation shrinks again.
    for (let index = ids.length; index < previousEntryCount; index++) {
      const entry = entries[index];
      if (!entry) continue;
      entry.candidates.length = 0;
      entry.contacts.length = 0;
      entry.tetherContacts.length = 0;
      entry.frame.self = null;
      entry.frame.events = EMPTY_ATTACHMENTS;
      entry.request.out = entry.candidates;
      entry.requestActive = false;
    }
    this._liveSensorBatchEntryCount = ids.length;
    return frames;
  },

  _listSquads(tick, options = {}) {
    const state = this.state;
    ensureActivityClassified(state);
    const freeze = options.freezeResults === false ? identity : Object.freeze;
    const squads = this._rosterSquadsScratch || (this._rosterSquadsScratch = new Map());
    squads.clear();
    const index = state && state.entityIndex;
    const source = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.aiShips)
      ? index.aiShips
      : (Array.isArray(state.entityList) ? state.entityList : []);
    const candidates = this._rosterCandidateScratch || (this._rosterCandidateScratch = []);
    const authorityRadius = tableSimAuthorityWuFromState(state);
    const player = getEntity(state, state && state.playerId);
    const playerId = player ? player.id : state && state.playerId;
    const playerTeam = player && player.team;
    const authorityOrigin = player && player.pos || null;
    candidates.length = 0;
    for (const entity of source) {
      if (!isLiveCraft(entity) || entity.id === state.playerId) continue;
      const ai = entity.data && entity.data.ai;
      const factionBehavior = normalizeFactionBehaviorProfile(ai && ai.factionPresenceDoctrine);
      if (!ai || (ai.passive && !(ai.allowPassiveManeuver === true && factionBehavior))) continue;
      if (entityNeedsAiThink(entity, state) === false) continue;
      candidates.push(entity);
    }
    candidates.sort((a, b) => compareIds(a && a.id, b && b.id));
    for (const entity of candidates) {
      const ai = entity.data && entity.data.ai;
      const factionBehavior = normalizeFactionBehaviorProfile(ai.factionPresenceDoctrine);
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
          factionBehavior,
          members: [],
          tick,
        };
        squads.set(squadId, squad);
      }
      squad.members.push(freeze({
        id: entity.id,
        preferredRole: ai.preferredRole || ai.role || null,
        capabilities: this._capabilitiesFor(entity, tick),
        combatDoctrineId: normalizeCombatDoctrineId(ai.combatDoctrineId),
        factionBehavior,
        team: entity.team,
        alive: entity.alive !== false,
        pos: entity.pos || null,
        passive: ai.passive === true,
        playerId,
        playerTeam,
        authorityOrigin,
        authorityRadius,
        activity: entity.activity || null,
      }));
    }

    const roster = [];
    for (const squad of squads.values()) {
      const members = freeze(squad.members.sort((a, b) => compareIds(a.id, b.id)));
      const entry = {
        id: squad.id,
        doctrine: squad.doctrine,
        faction: squad.faction,
        formation: squad.formation,
        formationSpacing: squad.formationSpacing,
        formationBound: squad.formationBound,
        factionBehavior: squad.factionBehavior,
        members,
      };
      Object.defineProperty(entry, ROSTER_SIGNATURE_FLAG, { value: rosterSignature(entry) });
      roster.push(freeze(entry));
    }
    roster.sort((a, b) => compareText(a.id, b.id));
    Object.defineProperty(roster, NORMALIZED_ROSTER_FLAG, { value: true });
    candidates.length = 0;
    squads.clear();
    return freeze(roster);
  },

  _capabilitiesFor(entity, tickOverride = null) {
    const state = this.state;
    const tick = Number.isInteger(tickOverride) ? tickOverride : (Number.isInteger(state && state.tick) ? state.tick : -1);
    if (this._capabilityCacheTick !== tick) {
      this._capabilityCacheTick = tick;
      this._capabilityCache.clear();
    }
    const key = stableId(entity && entity.id);
    let capabilities = this._capabilityCache.get(key);
    if (!capabilities) {
      capabilities = Object.freeze(capabilitiesFor(state, entity));
      this._capabilityCache.set(key, capabilities);
    }
    return capabilities;
  },

  _tagsFor(entity, runtime) {
    const state = this.state;
    const tick = Number.isInteger(state && state.tick) ? state.tick : -1;
    if (this._tagCacheTick !== tick) {
      this._tagCacheTick = tick;
      this._tagCache.clear();
    }
    const key = stableId(entity && entity.id);
    let tags = this._tagCache.get(key);
    if (!tags) {
      tags = tagsFor(entity, runtime, Object.freeze);
      this._tagCache.set(key, tags);
    }
    return tags;
  },

  _subsystemFractionsFor(entity, runtime) {
    const state = this.state;
    const tick = Number.isInteger(state && state.tick) ? state.tick : -1;
    if (this._subsystemFractionCacheTick !== tick) {
      this._subsystemFractionCacheTick = tick;
      this._subsystemFractionCache.clear();
    }
    const key = stableId(entity && entity.id);
    let fractions = this._subsystemFractionCache.get(key);
    if (!fractions) {
      fractions = Object.freeze(subsystemFractions(runtime));
      this._subsystemFractionCache.set(key, fractions);
    }
    return fractions;
  },

  _contactBaseFor(entity, runtime, attachmentIndex, kind) {
    const state = this.state;
    const tick = Number.isInteger(state && state.tick) ? state.tick : -1;
    if (this._contactBaseCacheTick !== tick) {
      this._contactBaseCacheTick = tick;
      this._contactBaseCache.clear();
    }
    const key = stableId(entity && entity.id);
    let base = this._contactBaseCache.get(key);
    if (!base) {
      base = buildContactBase(state, entity, runtime, attachmentIndex, kind, identity, this);
      this._contactBaseCache.set(key, base);
    }
    return base;
  },

  _attachmentIndex() {
    const state = this.state;
    const tick = Number.isInteger(state && state.tick) ? state.tick : -1;
    if (this._attachmentCacheTick === tick && this._attachmentIndexCache) return this._attachmentIndexCache;
    const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
    const all = [];
    const byEntity = new Map();
    for (const attachment of Object.values(attachments)) {
      if (!attachment || attachment.state !== 'active') continue;
      all.push(attachment);
      addAttachment(byEntity, attachment.ownerId, attachment);
      addAttachment(byEntity, attachment.targetId, attachment);
    }
    all.sort((a, b) => compareText(String(a.id), String(b.id)));
    this._attachmentCacheTick = tick;
    this._attachmentIndexCache = { all, byEntity };
    return this._attachmentIndexCache;
  },

  _recentEventsFor(entity, tick, freeze = Object.freeze) {
    if (this._recentEventCacheTick !== tick) {
      this._recentEventCacheTick = tick;
      this._recentEventsByTarget = recentEventIndexFor(this.state, tick);
    }
    const list = this._recentEventsByTarget.get(entity && entity.id) || EMPTY_ATTACHMENTS;
    if (freeze === identity) return list;
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) out[i] = freeze({ ...list[i] });
    return out;
  },
};

/**
 * Passive/hold-fire actors are intentionally absent from tactical decisions, so they need a
 * separate fail-closed disarm sweep. This runs before the AI maneuver port's early return and
 * prevents a fire bit from surviving an encounter phase or save/load role transition.
 */
export function clearIneligibleAIFiringIntents(state, helpers = null) {
  if (!state) return 0;
  const index = state.entityIndex;
  const source = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.aiShips)
    ? index.aiShips
    : (Array.isArray(state.entityList)
      ? state.entityList
      : (state.entities && typeof state.entities.values === 'function' ? [...state.entities.values()] : []));
  let cleared = 0;
  for (const entity of source) {
    if (!entity || entity.id === state.playerId || entity.type !== 'ship' || entity.alive === false) continue;
    const data = entity.data;
    const intent = data && data.intent;
    if (!intent || (!intent.fire && intent.fireGroup == null)) continue;
    const ai = data && data.ai;
    const disabledNonlethalTarget = disabledNonlethalTargetFor(state, entity, ai);
    const teamTwoDisarmed = entity.team === 2
      && !authorizedCeresLawJobResponse(state, entity, ai, helpers);
    const ineligible = !ai || ai.passive || teamTwoDisarmed
      || normalizeRoe(ai.roe, ai.passive ? 'hold_fire' : 'weapons_free') === 'hold_fire'
      || !activityAllowsOffense(effectiveActivityForAI(ai))
      || disabledNonlethalTarget;
    if (!ineligible) continue;
    intent.fire = false;
    intent.fireGroup = null;
    if (disabledNonlethalTarget) {
      intent.fireBlockReason = 'target_disabled_nonlethal';
      intent.fireBlockerId = disabledNonlethalTarget.id;
    }
    cleared++;
  }
  return cleared;
}

function authorizedCeresLawJobResponse(state, entity, ai, helpers) {
  if (!state || !entity || !ai || entity.team !== 2 || ai.lawful !== true || ai.passive !== false
    || ai.engagementTrigger !== 'security_response'
    || state.world?.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
  const doctrineId = normalizeCombatDoctrineId(ai.combatDoctrineId);
  if (doctrineId !== CombatDoctrineId.INTERCEPTOR_FLYBY) return false;
  const data = entity.data;
  const slotId = typeof data?.activityActorSlotId === 'string' ? data.activityActorSlotId : null;
  const slot = slotId && CERES_LAW_JOB_SLOTS_BY_ID.get(slotId);
  const worldRecordId = slot ? stableRecordId(
    state.meta?.seed,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  ) : null;
  const jobId = worldRecordId ? `job:${worldRecordId}` : null;
  const targetId = ai.securityTargetId;
  const combat = data && data.combat;
  if (!jobId || !slot || data.worldRecordId !== worldRecordId || data.jobId !== jobId
    || data.ceresActivityCast !== true || data.ceresActivityJobOwned !== true
    || data.sectorId !== CERES_ACTIVITY_SECTOR_ID || targetId == null
    || (data.homeSectorId != null && data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID)
    || (entity.homeSectorId != null && entity.homeSectorId !== CERES_ACTIVITY_SECTOR_ID)
    || !combat || combat.targetId !== targetId || getEntity(state, entity.id) !== entity) return false;

  const target = getEntity(state, targetId);
  if (!target || target.alive === false || !isHostileForAI(state, entity, target)) return false;
  const jobs = helpers && helpers.npcJobs;
  if (!jobs || typeof jobs.byEntity !== 'function' || typeof jobs.controlClaim !== 'function') return false;
  const entry = jobs.byEntity(entity.id);
  const claim = jobs.controlClaim(jobId);
  if (!entry || entry.entityId !== entity.id || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
    || entry.kind !== 'patrol' || entry.worldRecordId !== worldRecordId
    || entry.job?.kind !== 'patrol' || entry.job?.id !== jobId
    || !claim || claim.holder !== LAW_JOB_RESPONSE_HOLDER || claim.claimedEntityId !== entity.id) {
    return false;
  }

  const incidents = state.lawSecurity && state.lawSecurity.incidents;
  if (!incidents || typeof incidents !== 'object') return false;
  let boundIncident = null;
  for (const key in incidents) {
    if (!Object.prototype.hasOwnProperty.call(incidents, key)) continue;
    const incident = incidents[key];
    if (!incident || incident.status !== 'responding' || incident.attackerId !== targetId
      || !Array.isArray(incident.responderIds) || !incident.responderIds.includes(entity.id)) continue;
    if (claim.claimId === `${LAW_JOB_RESPONSE_HOLDER}:${incident.id}:${jobId}`) {
      boundIncident = incident;
      break;
    }
  }
  if (!boundIncident) return false;
  return authorizeAIEngagement({
    state,
    self: entity,
    target,
    tick: state.tick,
    objectiveReason: `combat_doctrine:${doctrineId}:strike`,
  }).ok;
}

function disabledNonlethalTargetFor(state, entity, ai) {
  const profile = normalizeFactionBehaviorProfile(ai && ai.factionPresenceDoctrine);
  if (!profile || profile.destroyTarget !== false) return null;
  const data = entity && entity.data || {};
  const activity = effectiveActivityForAI(ai);
  const combat = data.combat || {};
  const targetId = combat.targetId ?? (activity && activity.targetId) ?? ai.retaliationTargetId;
  const target = targetId == null ? null : getEntity(state, targetId);
  if (!target || target.alive === false) return null;
  return isDisabled(combatRuntimeFor(state, target.id), target) ? target : null;
}

function ensureEncounterState(state) {
  if (!state.aiEncounter || typeof state.aiEncounter !== 'object') {
    state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
  }
  if (state.aiEncounter.schemaVersion !== AI_CONTRACT_VERSION) state.aiEncounter.schemaVersion = AI_CONTRACT_VERSION;
  if (!Number.isInteger(state.aiEncounter.nextSeq) || state.aiEncounter.nextSeq < 1) state.aiEncounter.nextSeq = 1;
  if (!Array.isArray(state.aiEncounter.commands)) state.aiEncounter.commands = [];
  if (state.aiEncounter.commands.length > ENCOUNTER_COMMAND_RING_CAPACITY) {
    state.aiEncounter.commands.splice(0, state.aiEncounter.commands.length - ENCOUNTER_COMMAND_RING_CAPACITY);
  }
  return state.aiEncounter;
}

function normalizeEncounterCommand(command, fallbackTick = 0) {
  if (!command || typeof command !== 'object') return rejectEncounterCommand('command_invalid');
  const type = String(command.type || '');
  if (!ENCOUNTER_COMMAND_TYPES.has(type)) return rejectEncounterCommand('command_type_invalid');
  const base = {
    version: AI_CONTRACT_VERSION,
    tick: Number.isInteger(command.tick) ? command.tick : (Number.isInteger(fallbackTick) ? fallbackTick : 0),
    type,
  };
  if (type === 'phase') {
    const phase = String(command.phase || '');
    if (!DIRECTOR_PHASES.has(phase)) return rejectEncounterCommand('phase_invalid');
    return acceptEncounterCommand({ ...base, phase });
  }
  if (type === 'request_reinforcement') {
    return acceptEncounterCommand({
      ...base,
      packageId: command.packageId == null ? null : String(command.packageId),
      budgetRemaining: Math.max(0, finiteInt(command.budgetRemaining, 0)),
    });
  }
  if (type === 'order_retreat') {
    return acceptEncounterCommand({ ...base, reason: String(command.reason || 'unspecified') });
  }
  if (type === 'narrative_beat') {
    return acceptEncounterCommand({ ...base, beatIndex: Math.max(0, finiteInt(command.beatIndex, 0)) });
  }
  return rejectEncounterCommand('command_type_invalid');
}

function acceptEncounterCommand(command) {
  return { ok: true, command: Object.freeze(command) };
}

function rejectEncounterCommand(reason) {
  return { ok: false, reason };
}

function controlFromManeuver(entity, request, dt, state) {
  const profile = resolveFlightProfile(entity, state);
  const authority = measureThrusterAuthority(entity);
  const axes = localAxes(entity.rot || 0);
  const boostMult = request.boost ? profile.boostMult : 1;
  const forwardInput = clamp(request.forceLocal.forward, -1, 1);
  const rightInput = clamp(request.forceLocal.right, -1, 1) * 0.75;  // damp strafe vs forward to make NPCs behave more like they must broadly face their velocity (more regular ship physics)
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

function sensorSelf(state, entity, capabilities = capabilitiesFor(state, entity), attachmentIndex = null, freeze = Object.freeze, cacheOwner = null) {
  const runtime = combatRuntimeFor(state, entity.id);
  const ai = entity.data && entity.data.ai || {};
  const heatMax = positive(runtime && runtime.heatMax, 100);
  const subsystemFractionView = cacheOwner && typeof cacheOwner._subsystemFractionsFor === 'function'
    ? cacheOwner._subsystemFractionsFor(entity, runtime)
    : freeze(subsystemFractions(runtime));
  const activity = effectiveActivityForAI(ai);
  const bands = operationalBandsFor(state, entity, runtime, attachmentIndex);
  const ramAuthorized = explicitRamAuthorization(entity, ai, activity, bands);
  return freeze({
    id: entity.id,
    team: entity.team == null ? null : entity.team,
    pos: vec2(entity.pos, freeze),
    vel: vec2(entity.vel, freeze),
    rot: wrapAngle(finite(entity.rot)),
    radius: positive(entity.radius, 1),
    hullFraction: fraction(entity.hull, entity.hullMax, 1),
    energyFraction: fraction(entity.cap, entity.capMax, 1),
    heatFraction: clamp(finite(runtime && runtime.heat, 0) / heatMax, 0, 1),
    disabled: isDisabled(runtime, entity),
    tethered: attachmentsFor(attachmentIndex, entity.id).length > 0,
    capabilities,
    subsystemFractions: subsystemFractionView,
    activity,
    roe: normalizeRoe(ai.roe, ai.passive ? 'hold_fire' : 'weapons_free'),
    combatDoctrineId: normalizeCombatDoctrineId(ai.combatDoctrineId),
    factionBehavior: normalizeFactionBehaviorProfile(ai.factionPresenceDoctrine),
    ramAuthorized,
    ...bands,
  });
}

function explicitRamAuthorization(entity, ai, activity, bands) {
  const intent = entity && entity.data && entity.data.intent || {};
  const trigger = String(ai && ai.engagementTrigger || '');
  const telegraph = String(ai && ai.approachTelegraph || '');
  const activityReason = String(activity && activity.reason || '');
  const heavyEnough = bands && (bands.operationalMassBand === 'heavy' || bands.operationalMassBand === 'capital');
  return intent.ramPlate === true
    && heavyEnough
    && ai && ai.passive !== true
    && ai.sanctuaryWithdrawn !== true
    && activity && activity.kind === 'attack_run'
    && !activityReason.includes('station_jurisdiction')
    && trigger.length > 0 && trigger !== 'demand_pending'
    && telegraph.length > 0;
}

// Massline cloak perception gate (Wave M2 §4.2). True when the cloak runtime is active and the
// observing entity sits OUTSIDE the player's live detection radius. Pure read of the cloak
// system's own subtree; flag-gated so headless contract runs never take the branch. Exported for
// check:massline2 (the perception promise is contract-tested directly).
export function cloakHidesPlayerFrom(state, self, player) {
  if (!massline2Flag('cloak')) return false;
  const cloak = state.massline2 && state.massline2.cloak;
  if (!cloak || !cloak.active || !(cloak.radius > 0)) return false;
  if (!self || !self.pos || !player || !player.pos) return false;
  const dx = finite(self.pos.x) - finite(player.pos.x);
  const dz = finite(self.pos.z) - finite(player.pos.z);
  return (dx * dx + dz * dz) > cloak.radius * cloak.radius;
}

function entityContacts(state, self, range, helpers = null, attachmentIndex = null, freeze = Object.freeze, candidateScratch = null, outScratch = null, cacheOwner = null, candidateOverride = null) {
  const out = outScratch || [];
  out.length = 0;
  const candidates = candidateOverride || nearbyEntities(state, self.pos, range, helpers, candidateScratch);
  const rangeSq = range * range;
  for (const other of candidates) {
    if (!other || other === self || !other.alive) continue;
    // Massline cloak (Wave M2 §4.2, flag massline2.cloak — OFF headless): a cloaked player
    // OUTSIDE his live detection radius is never made a contact, so the tactical stack genuinely
    // cannot select or fire on him — honest gating at the single perception seam, no downstream
    // special cases. Inside the ring he is an ordinary contact again.
    if (other.id === state.playerId && cloakHidesPlayerFrom(state, self, other)) continue;
    const kind = contactKindFor(other);
    if (!kind) continue;
    const dx = finite(self.pos && self.pos.x) - finite(other.pos && other.pos.x);
    const dz = finite(self.pos && self.pos.z) - finite(other.pos && other.pos.z);
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > rangeSq) continue;
    const distance = Math.sqrt(distanceSq);
    const runtime = combatRuntimeFor(state, other.id);
    const hostile = isHostileForAI(state, self, other);
    const base = cacheOwner && typeof cacheOwner._contactBaseFor === 'function'
      ? cacheOwner._contactBaseFor(other, runtime, attachmentIndex, kind)
      : buildContactBase(state, other, runtime, attachmentIndex, kind, freeze, cacheOwner);
    out.push({
      ...base,
      confidence: confidenceFor(distance, range, state, self),
      threat: threatFor(state, self, other, hostile),
      hostile,
    });
  }
  return out;
}

function buildContactBase(state, other, runtime, attachmentIndex, kind, freeze, cacheOwner) {
  const tethered = attachmentsFor(attachmentIndex, other.id).length > 0;
  const disabled = isDisabled(runtime, other);
  const tags = cacheOwner && typeof cacheOwner._tagsFor === 'function'
    ? cacheOwner._tagsFor(other, runtime)
    : tagsFor(other, runtime, freeze);
  return {
    id: other.id,
    kind,
    team: other.team == null ? null : other.team,
    classification: classificationFor(other),
    pos: vec2(other.pos, freeze),
    vel: vec2(other.vel, freeze),
    radius: positive(other.radius, 0),
    alive: true,
    valid: true,
    visible: true,
    targetId: other.data && other.data.combat ? other.data.combat.targetId : null,
    ownerId: other.ownerId == null ? null : other.ownerId,
    disabled,
    tethered,
    exposed: false,
    ownedBySelf: false,
    objectiveValue: objectiveValueFor(other),
    massClass: Math.max(1, Math.round(Math.log2(positive(other.mass, 1) + 1))),
    ...operationalBandsFor(state, other, runtime, attachmentIndex, { tethered, disabled }),
    tags,
  };
}

function attachmentContacts(state, self, range, activeAttachments = null, freeze = Object.freeze, outScratch = null) {
  const out = outScratch || [];
  out.length = 0;
  const attachments = activeAttachments || Object.values(state.combat && state.combat.attachments && state.combat.attachments.byId || {})
    .filter((attachment) => attachment && attachment.state === 'active')
    .sort((a, b) => compareText(String(a.id), String(b.id)));
  for (const attachment of attachments) {
    const owner = getEntity(state, attachment.ownerId);
    const target = getEntity(state, attachment.targetId);
    if (!owner || !target) continue;
    const pos = midpoint(owner.pos, target.pos);
    const distance = distance2(self.pos, pos);
    const endpointVisible = attachment.ownerId === self.id || attachment.targetId === self.id;
    if (!endpointVisible && distance > range) continue;
    const hostile = isHostileForAI(state, self, attachment.ownerId === self.id ? target : owner);
    const ownedBySelf = attachment.ownerId === self.id;
    out.push({
      id: attachment.id,
      kind: ContactKind.TETHER,
      team: owner.team == null ? null : owner.team,
      classification: attachment.defId || 'massline',
      pos: freeze(pos),
      vel: freeze(relativeVelocity(owner, target)),
      radius: 2,
      alive: true,
      valid: true,
      visible: true,
      confidence: endpointVisible ? 1 : confidenceFor(distance, range, state, self),
      hostile,
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
      operationalMassBand: 'light',
      mobilityBand: 'low',
      cargoBand: 'empty',
      tetherabilityBand: 'poor',
      tags: tetherTags(ownedBySelf, attachment, owner, target),
    });
  }
  return out;
}

function tetherTags(ownedBySelf, attachment, owner, target) {
  const base = ownedBySelf ? OWNED_TETHER_TAGS : HOSTILE_TETHER_TAGS;
  const length = distance2(owner && owner.pos, target && target.pos);
  const slack = positive(attachment && attachment.restLength, 0) - length;
  return slack >= 6 ? Object.freeze([...base, 'slack']) : base;
}

function recentEventIndexFor(state, tick) {
  const events = state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events : [];
  const byTarget = new Map();
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (!event || event.targetId == null) continue;
    const age = tick - (Number.isInteger(event.tick) ? event.tick : tick);
    if (age < 0 || age > RECENT_EVENT_TICKS) continue;
    let out = byTarget.get(event.targetId);
    if (!out) {
      out = [];
      byTarget.set(event.targetId, out);
    }
    if (out.length >= 12) continue;
    if (event.kind === 'damage.routed') {
      out.push({
        type: 'damage_received',
        sourceId: event.attackerId == null ? null : event.attackerId,
        targetId: event.targetId,
        magnitude: finite(event.totalApplied, finite(event.hullDamage, 0)),
        tags: ['combat'],
      });
    } else if (event.kind === 'subsystem.disabled') {
      out.push({
        type: 'subsystem_disabled',
        sourceId: event.attackerId == null ? null : event.attackerId,
        targetId: event.targetId,
        magnitude: 1,
        tags: [String(event.subsystemId || 'unknown')],
      });
    }
  }
  for (const out of byTarget.values()) out.reverse();
  return byTarget;
}

function normalizeManeuverRequest(request, fallbackTick) {
  if (request && request[NORMALIZED_THRUSTER_REQUEST_FLAG] === true && request.tick === fallbackTick) return request;
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
  const disabled = new Set();
  for (const [name, enabled] of Object.entries(base)) if (enabled === false) disabled.add(name);
  const add = (capability) => {
    if (typeof capability !== 'string') return;
    if (capabilityBlocked(capability, disabled)) return;
    out.add(capability);
  };
  for (const [name, enabled] of Object.entries(base)) if (enabled !== false) out.add(name);
  const ai = entity.data && entity.data.ai || {};
  for (const capability of ai.capabilities || []) add(capability);
  const weapons = entity.data && Array.isArray(entity.data.weapons) ? entity.data.weapons : [];
  if (weapons.length > 0) add('ranged');
  if (weapons.some((weapon) => weapon && weapon.damageType === 'emp')) add('disable');
  const role = String(ai.role || ai.preferredRole || ai.archetype || '').toLowerCase();
  if (role.includes('sniper')) add('ranged');
  if (role.includes('tug')) add('tug');
  if (role.includes('thief')) add('steal');
  if (role.includes('screen')) add('screen');
  if (role.includes('support')) add('disable');
  return [...out].sort();
}

function capabilityBlocked(capability, disabled) {
  const dependencies = CAPABILITY_DEPENDENCIES[capability] || [capability];
  return dependencies.some((dependency) => disabled.has(dependency));
}

function subsystemFractions(runtime) {
  const subsystems = runtime && runtime.subsystems || {};
  if (!Object.keys(subsystems).length) return EMPTY_SUBSYSTEM_FRACTIONS;
  const out = {};
  for (const [id, subsystem] of Object.entries(subsystems)) {
    out[id] = fraction(subsystem.health, subsystem.maxHealth, 1);
  }
  return out;
}

function tagsFor(entity, runtime, freeze = Object.freeze) {
  if ((!runtime || !runtime.capabilities) && entity && entity.collides === true && !entity.factionId) return SOLID_TAGS;
  const tags = new Set();
  if (entity.collides) tags.add('solid');
  if (entity.data && Array.isArray(entity.data.weapons) && entity.data.weapons.length) tags.add('armed');
  if (entity.factionId) tags.add(String(entity.factionId));
  for (const capability of Object.keys(runtime && runtime.capabilities || {})) {
    if (runtime.capabilities[capability] !== false) tags.add(capability);
  }
  return freeze([...tags].sort());
}

function nearbyEntities(state, pos, range, helpers = null, scratch = null) {
  const helper = helpers && helpers.queryRadius;
  if (scratch) scratch.length = 0;
  const index = state && state.entityIndex;
  const collidables = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.collidables)
    ? index.collidables
    : null;
  if (collidables && collidables.length > 0 && collidables.length < AI_SPATIAL_MIN_COLLIDABLES) {
    return collidables;
  }
  if (typeof helper === 'function') return helper(pos, range, scratch || []);
  if (state.spatialHash && state.entityIndex && state.entityIndex.ready && typeof state.spatialHash.queryRadius === 'function') {
    const out = scratch || [];
    state.spatialHash.queryRadius(pos.x, pos.z, range, out);
    return out;
  }
  return Array.isArray(state.entityList) ? state.entityList : [];
}

function liveSensorBatchEntry(entries, index) {
  let entry = entries[index];
  if (entry) return entry;
  const candidates = [];
  entry = {
    candidates,
    contacts: [],
    tetherContacts: [],
    frame: {},
    request: { id: null, x: 0, z: 0, r: 0, out: candidates },
    requestActive: false,
  };
  entries[index] = entry;
  return entry;
}

function addAttachment(byEntity, entityId, attachment) {
  if (entityId == null) return;
  let list = byEntity.get(entityId);
  if (!list) {
    list = [];
    byEntity.set(entityId, list);
  }
  list.push(attachment);
}

function attachmentsFor(index, entityId) {
  if (!index || !index.byEntity || entityId == null) return EMPTY_ATTACHMENTS;
  return index.byEntity.get(entityId) || EMPTY_ATTACHMENTS;
}

function rosterSignature(squad) {
  let text = `${squad.id}|${squad.doctrine}|${squad.faction}|${squad.formation}|${squad.formationSpacing}|${squad.formationBound}|${profileSignature(squad.factionBehavior)}`;
  for (const member of squad.members) {
    text += `;${stableId(member.id)}:${member.preferredRole || ''}:${member.combatDoctrineId || ''}:${profileSignature(member.factionBehavior)}:${(member.capabilities || []).join('+')}`;
  }
  return text;
}

function profileSignature(profile) {
  const value = normalizeFactionBehaviorProfile(profile);
  return value
    ? [
        value.pursuitCommitment,
        value.preferredRange,
        value.liveFormation,
        value.retreatHullFraction,
        value.combatDoctrineId,
        Number(value.disableThenRun),
        Number(value.firstFire),
        JSON.stringify(value.firstFireAgainst),
        value.firstFireCondition || '',
        value.stationDefenseAggression,
        value.disableChance,
        Number(value.destroyTarget),
        Number(value.fixedRoute),
      ].join('/')
    : '';
}

function operationalBandsFor(state, entity, runtime, attachmentIndex, facts = null) {
  const mass = operationalMassFor(state, entity);
  const maxSpeed = positive(entity && entity.maxSpeed, positive(entity && entity.flightModel && entity.flightModel.maxSpeed, 0));
  const turnRate = positive(entity && entity.turnRate, positive(entity && entity.flightModel && entity.flightModel.maxYawRate, 0));
  const cargoMass = cargoMassFor(state, entity);
  const tethered = facts && typeof facts.tethered === 'boolean'
    ? facts.tethered
    : attachmentsFor(attachmentIndex, entity && entity.id).length > 0;
  const disabled = facts && typeof facts.disabled === 'boolean'
    ? facts.disabled
    : isDisabled(runtime, entity);
  return {
    operationalMassBand: mass < 40 ? 'light' : mass < 140 ? 'medium' : mass < 700 ? 'heavy' : 'capital',
    mobilityBand: maxSpeed >= 135 || turnRate >= 2 ? 'high' : (maxSpeed > 0 && maxSpeed < 80) || (turnRate > 0 && turnRate < 0.8) ? 'low' : 'medium',
    cargoBand: cargoMass < 1 ? 'empty' : cargoMass < 10 ? 'light' : cargoMass < 40 ? 'valuable' : 'rich',
    tetherabilityBand: tethered ? 'poor' : disabled ? 'excellent' : mass >= 700 ? 'fair' : mass >= 140 ? 'good' : 'excellent',
  };
}

function operationalMassFor(state, entity) {
  if (!entity) return 1;
  if (state && entity.id === state.playerId) {
    const derived = entity.data && entity.data.derived;
    if (Number.isFinite(derived && derived.operationalMass)) return Math.max(1, derived.operationalMass);
  }
  return positive(entity.mass, positive(entity.physicsBody && entity.physicsBody.mass, 1));
}

function cargoMassFor(state, entity) {
  if (!entity) return 0;
  const data = entity.data || {};
  return Math.max(0, finite(data.cargoMass, finite(data.derived && data.derived.cargoMass)));
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
  if (entity.type === 'asteroid' || entity.type === 'station' || entity.type === 'wreck'
      || entity.type === 'masslineSnare' || entity.type === 'masslineSnareAnchor') return ContactKind.HAZARD;
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

function threatFor(state, self, other, hostile = isHostileForAI(state, self, other)) {
  if (!hostile) return 0;
  const armed = other.data && Array.isArray(other.data.weapons) && other.data.weapons.length ? 0.2 : 0;
  return clamp(0.45 + armed + positive(other.mass, 1) / 400, 0, 1);
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

function vec2(value, freeze = Object.freeze) {
  return freeze({ x: finite(value && value.x), z: finite(value && value.z) });
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
  const kind = compareText(a.kind, b.kind);
  return kind || compareIds(a.id, b.id);
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

function finiteInt(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function identity(value) {
  return value;
}
