// Depth Program K1 — live, additive presence for Understory, Fulfillment, Archive, Pitborn,
// and the Verge Layers. The system owns only state.factionPresence receipts. Ships are created
// through the core spawn helper; cargo is changed only through cargo.removeCargo; faction rep and
// loss-ledger state are read-only.

import { hash32 } from '../core/rng.js';
import { shouldRunOnTick } from '../core/activityScheduler.js';
import { normalizeFactionBehaviorProfile } from '../ai/factionBehavior.js';
import { buildSlotList, makeShipEntitySpec } from './ships.js';
import { isPersistentCargo, removeCargo } from './cargo.js';
import { lossesFor } from './lossLedger.js';
import { SHIPS } from '../data/ships.js';
import {
  CERES_ACTIVITY_SECTOR_ID,
  ceresActivityPocket,
} from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  FULFILLMENT_FIXED_ROUTES,
  planFactionPresence,
  presenceServiceForStation,
} from '../data/factionPresence.js';
import {
  RECORD_KIND,
  findLiveEntityForRecord,
  stableRecordId,
} from '../world/worldRecords.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const CERES_REFINERY_ACTIVITY = ceresActivityPocket('ceres_refinery_pocket');
const CERES_REFINERY_TENDER = CERES_REFINERY_ACTIVITY.actorSlots
  .find((slot) => slot.id === 'ceres_refinery_tender');
const TENDER_CANONICAL_FIELDS = Object.freeze([
  'type', 'factionId', 'team', 'radius', 'mass', 'flightClass', 'flightModel', 'propulsion',
  'armorFlat', 'shieldRegenRate', 'shieldRegenDelay', 'capMax', 'capRegen',
  'thrust', 'turnRate', 'maxSpeed', 'drag',
]);

function ensureOwnState(state) {
  if (!state.factionPresence || typeof state.factionPresence !== 'object') {
    state.factionPresence = { active: {}, receipts: [], sequence: 0, boarding: null, processedDisable: {} };
  }
  const own = state.factionPresence;
  if (!own.active || typeof own.active !== 'object') own.active = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!Number.isFinite(own.sequence)) own.sequence = 0;
  if (!own.processedDisable || typeof own.processedDisable !== 'object') own.processedDisable = {};
  if (!own.servicesByStation || typeof own.servicesByStation !== 'object') own.servicesByStation = {};
  if (!own.serviceReceipts || typeof own.serviceReceipts !== 'object') own.serviceReceipts = {};
  if (own.boarding != null && typeof own.boarding !== 'object') own.boarding = null;
  return own;
}

function pushReceipt(state, receipt) {
  const own = ensureOwnState(state);
  own.sequence += 1;
  own.receipts.push({ sequence: own.sequence, ...receipt });
  if (own.receipts.length > 48) own.receipts.splice(0, own.receipts.length - 48);
}

function factionReps(state) {
  const reps = {};
  for (const [id, row] of Object.entries((state && state.factions) || {})) {
    reps[id] = Number(row && row.rep) || 0;
  }
  return reps;
}

function currentStoryInputs(state) {
  const story = (state && state.story) || {};
  const verge = story.verge && typeof story.verge === 'object' ? story.verge : {};
  const storyFlags = {
    vergeLayersRevealed: verge.revealed === true,
    vergeAwake: verge.awake === true,
    valeGatesRevoked: verge.valeGatesRevoked === true,
    playerUsedVergeClosureProtocol: verge.playerUsedClosureProtocol === true,
  };
  const revocationCount = Array.isArray(verge.revocations) ? verge.revocations.length : 0;
  return { storyFlags, revocationCount };
}

function spawnKey(plan) {
  const pos = plan.pos || { x: 0, z: 0 };
  return [plan.sectorId, plan.factionId, plan.lossId || plan.routeId || plan.vergePhase || 'presence', pos.x, pos.z].join(':');
}

function teamFor(plan, profile) {
  if (!profile || plan.passive !== false) return 2;
  // Pitborn first-fire is faction-specific, not membership in the generic hostile team. A distinct
  // combat team lets their authorized shots physically resolve against Concord while the canonical
  // hostility oracle still keeps the ordinary player neutral.
  if (plan.factionId === 'faction_pitborn') return 3;
  return plan.factionId === 'faction_verge_layers' ? 1 : 2;
}

function presenceActivity(plan, profile, state) {
  const startedTick = Number.isInteger(state.tick) ? state.tick : 0;
  if (plan.passive === false && profile) {
    return {
      kind: 'attack_run',
      reason: plan.factionId === 'faction_verge_layers' ? 'verge_gate_closer_response' : 'pitborn_disable_and_run',
      anchor: { ...plan.pos },
      leashRadius: 2200,
      preferredRange: profile.preferredRange,
      startedTick,
      targetId: null,
    };
  }
  if (plan.fixedRoute) {
    return {
      kind: 'transit',
      reason: 'fulfillment_fixed_route',
      routeId: plan.routeId,
      anchor: { ...plan.pos },
      leashRadius: 1400,
      preferredRange: profile ? profile.preferredRange : 0,
      startedTick,
    };
  }
  return {
    kind: 'loiter',
    reason: 'k1_nonhostile_presence',
    anchor: { ...plan.pos },
    leashRadius: 900,
    preferredRange: profile ? profile.preferredRange : 0,
    startedTick,
  };
}

function engagementFields(plan, profile) {
  if (plan.passive !== false || !profile) return {};
  const verge = plan.factionId === 'faction_verge_layers';
  return {
    motive: verge ? 'gate_closure_response' : 'disable_and_escape',
    engagementTrigger: verge ? 'confirmed_gate_closer' : 'concord_target',
    zoneId: plan.sectorId,
    approachTelegraph: verge ? 'verge_lattice_focus' : 'pitborn_yard_pack',
    noFireResponseWindowS: 1,
  };
}

function presenceFittings(plan) {
  // Every K1 doctrine is non-lethal. An omni turret owns the EMP verb by itself; otherwise fill
  // compatible fixed hardpoints so front/rear hulls keep that verb through a retreat turn. S-only
  // hulls receive the pulse and never pretend to fit a disable gun they cannot carry.
  const ship = SHIP_BY_ID.get(plan.shipDefId);
  const slots = ship ? buildSlotList(ship) : [];
  const fittings = new Array(slots.length).fill(null);
  const weaponSlots = slots.filter((slot) => slot.type === 'weapon');
  const turret = weaponSlots.find((slot) => slot.facing === 'turret' && slot.size !== 'S');
  if (turret) {
    fittings[turret.index] = 'wpn_emp_disruptor_m';
  } else {
    for (const slot of weaponSlots) {
      if (slot.size !== 'S') fittings[slot.index] = 'wpn_emp_disruptor_m';
    }
  }
  for (const slot of weaponSlots) {
    if (slot.size === 'S') fittings[slot.index] = 'wpn_pulse_laser_s';
  }
  return fittings;
}

function presenceMarker(plan) {
  return {
    source: 'depth-program-k1',
    factionId: plan.factionId,
    lossId: plan.lossId || null,
    routeId: plan.routeId || null,
    route: plan.route || null,
    fixedRoute: plan.fixedRoute === true,
    observerPrism: plan.observerPrism === true,
    vergePhase: plan.vergePhase || null,
    yardTender: plan.yardTender === true,
    routeStart: plan.routeStart || null,
    routeEnd: plan.routeEnd || null,
    routePeriodS: plan.routePeriodS || null,
    formation: plan.formation || null,
    formationIndex: plan.formationIndex,
    formationCount: plan.formationCount,
    formationSpacing: plan.formationSpacing,
  };
}

function makePresenceSpec(plan, state) {
  const profile = normalizeFactionBehaviorProfile(plan.behavior);
  const activeCombat = plan.passive === false && !!profile;
  const ai = {
    archetype: 'passive',
    passive: !activeCombat,
    allowPassiveManeuver: !!profile,
    spawnContext: plan.fixedRoute ? 'convoy_civilian' : 'faction_presence',
    factionPresenceDoctrine: profile,
    formation: plan.formation || (profile && profile.liveFormation) || null,
    formationSpacing: plan.formationSpacing || null,
    formationBound: Number.isFinite(plan.formationBound) && plan.formationBound > 0
      ? plan.formationBound
      : null,
    combatDoctrineId: profile && profile.combatDoctrineId,
    roe: activeCombat ? 'weapons_free' : 'hold_fire',
    activity: presenceActivity(plan, profile, state),
    ...engagementFields(plan, profile),
  };
  const fittings = presenceFittings(plan);
  ai.capabilities = fittings.includes('wpn_emp_disruptor_m') ? ['disable', 'ranged'] : ['ranged'];
  if (activeCombat && plan.factionId === 'faction_verge_layers'
    && profile.firstFireCondition === 'gate_closer') {
    ai.retaliationTargetId = state.playerId;
    ai.activity.targetId = state.playerId;
  }
  const spec = makeShipEntitySpec(plan.shipDefId, {
    team: teamFor(plan, profile),
    factionId: plan.factionId,
    pos: plan.pos,
    fittings,
    ai,
  });
  spec.data.factionPresence = presenceMarker(plan);
  return spec;
}

function matchesCeresRefineryTender(plan) {
  const match = CERES_REFINERY_TENDER && CERES_REFINERY_TENDER.binding
    && CERES_REFINERY_TENDER.binding.match;
  return !!match
    && plan.sectorId === match.sectorId
    && plan.factionId === match.factionId
    && plan.yardTender === match.yardTender
    && plan.sectorId === CERES_ACTIVITY_SECTOR_ID;
}

function tenderGlobalPoint(offset) {
  const anchor = CERES_REFINERY_ACTIVITY.activityAnchor.localPos;
  return sectorLocalToGlobalForSector({
    x: anchor.x + offset.x,
    z: anchor.z + offset.z,
  }, CERES_ACTIVITY_SECTOR_ID);
}

// The projected job route must reproduce the authored marks EXACTLY — id, label, position and
// `targetRef` — because npcJobsRuntime re-derives each mark from this same authored slot and refuses
// any relationship whose waypoint does not match it field for field. Dropping `targetRef` here (or
// omitting the canonical `speed` below) is indistinguishable, downstream, from the tender having no
// authored service client at all. Both are computed with the identical expressions traffic uses for
// the other Ceres cast routes so the float comparison is exact rather than merely close.
function ceresTenderRoute() {
  return CERES_REFINERY_TENDER.route.marks.map((mark) => {
    const pos = tenderGlobalPoint(mark.offset);
    return { id: mark.id, label: mark.id, pos: { x: pos.x, z: pos.z }, targetRef: mark.targetRef };
  });
}

function ceresTenderRouteSpeed(route) {
  const durationS = CERES_REFINERY_TENDER.route.durationS;
  if (!Number.isFinite(durationS) || durationS <= 0 || route.length !== 2) return null;
  const distance = Math.hypot(
    route[1].pos.x - route[0].pos.x,
    route[1].pos.z - route[0].pos.z,
  );
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const speed = distance / durationS;
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

function ceresTenderContext(plan, seed, createdTick = 0) {
  if (!matchesCeresRefineryTender(plan)) return null;
  const identityKey = CERES_REFINERY_TENDER.worldRecordSlotId;
  const route = ceresTenderRoute();
  return {
    plan: { ...plan, pos: tenderGlobalPoint(CERES_REFINERY_TENDER.spawnOffset) },
    slot: CERES_REFINERY_TENDER,
    identityKey,
    createdTick: createdTick | 0,
    recordId: stableRecordId(seed, CERES_ACTIVITY_SECTOR_ID, RECORD_KIND.NPC, identityKey),
    activeKey: `ceres-activity:${CERES_REFINERY_TENDER.id}`,
    route,
    routeSpeed: ceresTenderRouteSpeed(route),
  };
}

function ceresTenderJobSpec(context) {
  const spec = {
    kind: context.slot.jobKind,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route: context.route,
  };
  // Omit rather than pass a null: the job kernel treats a non-finite speed as "use the kind default",
  // which is the pre-existing authored-route behavior we fall back to if the geometry ever degrades.
  if (Number.isFinite(context.routeSpeed)) spec.speed = context.routeSpeed;
  return spec;
}

function recordIsTerminal(record) {
  return !!record && (record.alive === false
    || record.outcome === 'destroyed'
    || record.outcome === 'defeated');
}

function stampCeresTenderIdentity(entity, context) {
  if (!entity.data) entity.data = {};
  entity.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data.sectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data.worldRecordId = context.recordId;
  entity.data.identityKey = context.identityKey;
  entity.data.durable = true;
  if (!Number.isFinite(entity.data.recordCreatedTick)) {
    entity.data.recordCreatedTick = context.createdTick | 0;
  }
  entity.data.activityActorSlotId = context.slot.id;
  ensureCeresTenderFuelCargo(entity, context.slot.service);
  delete entity.data.trafficRole;
}

function ensureCeresTenderFuelCargo(entity, service) {
  if (!service || !Number.isFinite(service.capacityUnits) || service.capacityUnits <= 0) return;
  const data = entity.data || (entity.data = {});
  const cargoManifest = data.cargoManifest && typeof data.cargoManifest === 'object'
    && !Array.isArray(data.cargoManifest)
    ? data.cargoManifest
    : {};
  const savedLot = cargoManifest.fuelTenderService;
  const sameLot = savedLot && savedLot.lotId === service.cargoLotId;
  const remainingUnits = sameLot && Number.isFinite(savedLot.remainingUnits)
    ? Math.max(0, Math.min(service.capacityUnits, savedLot.remainingUnits))
    : service.capacityUnits;
  data.cargoManifest = {
    ...cargoManifest,
    fuelTenderService: {
      lotId: service.cargoLotId,
      commodityId: service.commodityId,
      capacityUnits: service.capacityUnits,
      remainingUnits,
    },
  };
}

function releaseCeresTenderFromWorldExtras(state, entity) {
  const bag = state.world && state.world.sectorContents
    && state.world.sectorContents[CERES_ACTIVITY_SECTOR_ID];
  const enemies = bag && bag.enemies;
  if (!Array.isArray(enemies) || !entity) return;
  for (let index = enemies.length - 1; index >= 0; index -= 1) {
    if (enemies[index] === entity.id) enemies.splice(index, 1);
  }
}

function rehydrateCeresTenderWeapons(existing, canonical) {
  if (!Array.isArray(canonical)) return [];
  const sameLoadout = Array.isArray(existing)
    && existing.length === canonical.length
    && canonical.every((weapon, index) => existing[index]
      && existing[index].defId === weapon.defId
      && existing[index].slotIndex === weapon.slotIndex);
  return canonical.map((weapon, index) => {
    if (!sameLoadout) return { ...weapon };
    const current = existing[index];
    return {
      ...weapon,
      _cooldown: Number.isFinite(current._cooldown) ? Math.max(0, current._cooldown) : 0,
      _heat: Number.isFinite(current._heat)
        ? Math.max(0, Math.min(weapon.heatMax, current._heat))
        : 0,
    };
  });
}

function rehydrateCeresTender(entity, canonicalSpec, context) {
  const preservedData = entity.data || (entity.data = {});
  for (const field of TENDER_CANONICAL_FIELDS) {
    const value = canonicalSpec[field];
    if (value && typeof value === 'object') {
      entity[field] = Array.isArray(value) ? value.slice() : { ...value };
    } else {
      entity[field] = value;
    }
  }
  entity.cap = Number.isFinite(entity.cap)
    ? Math.max(0, Math.min(canonicalSpec.capMax, entity.cap))
    : 0;
  if (!entity.boost || typeof entity.boost !== 'object') {
    entity.boost = { ...canonicalSpec.boost };
  } else {
    const currentEnergy = Number.isFinite(entity.boost.energy) ? entity.boost.energy : 0;
    const currentCooldown = Number.isFinite(entity.boost.dashCdT) ? entity.boost.dashCdT : 0;
    entity.boost = {
      ...canonicalSpec.boost,
      energy: Math.max(0, Math.min(canonicalSpec.boost.max, currentEnergy)),
      dashCdT: Math.max(0, Math.min(canonicalSpec.boost.dashCd, currentCooldown)),
    };
  }
  for (const field of ['defId', 'derived', 'miningBeam', 'fittings', 'appearance', 'livingHull']) {
    const value = canonicalSpec.data[field];
    if (Array.isArray(value)) preservedData[field] = value.slice();
    else if (value && typeof value === 'object') preservedData[field] = { ...value };
    else preservedData[field] = value;
  }
  preservedData.weapons = rehydrateCeresTenderWeapons(
    preservedData.weapons,
    canonicalSpec.data.weapons,
  );
  if (!preservedData.combat) preservedData.combat = { ...canonicalSpec.data.combat };
  preservedData.ai = canonicalSpec.data.ai;
  preservedData.factionId = canonicalSpec.data.factionId;
  preservedData.team = canonicalSpec.data.team;
  preservedData.factionPresence = canonicalSpec.data.factionPresence;
  stampCeresTenderIdentity(entity, context);
  return entity;
}

export const factionPresence = {
  name: 'factionPresence',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._boardingRepairRequested = false;
    ensureOwnState(this.state);
    this._unsub = [
      this.bus.on('sector:enter', (payload) => this._onSectorEnter(payload || {})),
      this.bus.on('sector:exit', (payload) => this._onSectorExit(payload || {})),
      this.bus.on('dock:docked', (payload) => this._onDocked(payload || {})),
      this.bus.on('lossLedger:recorded', (payload) => this._onLossRecorded(payload || {})),
      this.bus.on('combat:subsystemDisabled', (payload) => this._onSubsystemDisabled(payload || {})),
      this.bus.on('combat:subsystemEnabled', (payload) => this._onSubsystemEnabled(payload || {})),
      this.bus.on('combat:damage', (payload) => this._onCombatDamage(payload || {})),
      this.bus.on('ui:factionPresenceService', (payload) => this._onServiceAction(payload || {})),
      this.bus.on('entity:spawned', (payload) => this._onEntitySpawned(payload || {})),
      this.bus.on('save:loaded', () => this._onSaveLoaded()),
    ];
  },

  newGame() {
    this._boardingRepairRequested = false;
    this.state.factionPresence = {
      active: {}, receipts: [], sequence: 0, boarding: null, processedDisable: {},
      servicesByStation: {}, serviceReceipts: {},
    };
  },

  update() {
    // Reconcile against the live entity set rather than consuming combat-death events here. This
    // keeps the Understory strictly downstream of lossLedger:recorded while still promoting a
    // surviving Concord patrol for Pitborn on the next deterministic simulation tick.
    if (shouldRunOnTick(this.state.tick, 'factionPresence:pitbornBind', 8)) {
      this._bindPitbornConcordTargets();
    }
    this._updateFulfillmentRoutes();
    this._updateBoarding();
  },

  _onSectorEnter(payload) {
    const state = this.state;
    const sectorId = payload.sectorId || (state.world && state.world.currentSectorId);
    if (!sectorId) return;
    const seed = ((state.meta && state.meta.seed) || 1) >>> 0;
    // lossesFor is called only when the canonical ledger already exists, so this observer cannot
    // initialize or backfill another system's state.
    const hasLedger = state.lossLedger
      && state.lossLedger.bySector
      && typeof state.lossLedger.bySector === 'object'
      && Array.isArray(state.lossLedger.entries);
    const losses = hasLedger ? lossesFor(state, sectorId) : [];
    const story = currentStoryInputs(state);
    const plans = planFactionPresence({ sectorId, seed, losses, ...story });
    const own = ensureOwnState(state);
    for (const presencePlan of plans) {
      const tenderContext = ceresTenderContext(presencePlan, seed, state.tick);
      if (tenderContext) {
        this._bindCeresRefineryTender(tenderContext, own);
        continue;
      }
      const key = spawnKey(presencePlan);
      if (own.active[key]) continue;
      const spec = makePresenceSpec(presencePlan, state);
      const entity = typeof this.helpers.spawnEntity === 'function'
        ? this.helpers.spawnEntity(spec)
        : null;
      if (!entity) continue;
      own.active[key] = {
        entityId: entity.id || null,
        sectorId,
        factionId: presencePlan.factionId,
        routeId: presencePlan.routeId || null,
      };
      const receipt = {
        t: state.simTime || 0,
        sectorId,
        factionId: presencePlan.factionId,
        entityId: entity.id || null,
        shipDefId: presencePlan.shipDefId,
        source: presencePlan.source || 'authoredPresence',
      };
      pushReceipt(state, { kind: 'spawned', ...receipt });
      this.bus.emit('factionPresence:spawned', receipt);
    }
    this._bindPitbornConcordTargets();
    this._rehydrateBoardingConvoy();
  },

  _bindCeresRefineryTender(context, own = ensureOwnState(this.state)) {
    const state = this.state;
    const records = state.world && state.world.records && state.world.records.byId;
    const record = records && records[context.recordId];
    const jobId = `job:${context.recordId}`;
    const releaseJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    if (recordIsTerminal(record)) {
      if (typeof releaseJob === 'function') releaseJob(jobId);
      delete own.active[context.activeKey];
      return null;
    }

    const live = findLiveEntityForRecord(state.entityList, context.recordId);
    // An active durable record without a materialized body belongs to world residency. Never
    // additive-spawn over it here; world will rematerialize it when the sector reaches FULL.
    if (record && !live) {
      delete own.active[context.activeKey];
      return null;
    }
    // A body vanished during this live ownership window before its tombstone settled. Suppress a
    // same-sector duplicate; ordinary exit clears the row and world records decide the next entry.
    if (own.active[context.activeKey] && !live) return null;

    const assignJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    const activeRow = own.active[context.activeKey];
    if (live && activeRow && activeRow.entityId === live.id) {
      // Repeated lifecycle notifications are strict no-ops for live gameplay state. The job seam
      // itself is idempotent and may need only to restore a missing transient hull marker.
      if (typeof assignJob === 'function') {
        assignJob(live, ceresTenderJobSpec(context));
      }
      return live;
    }

    const canonicalSpec = makePresenceSpec(context.plan, state);
    canonicalSpec.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
    canonicalSpec.data.recordCreatedTick = state.tick | 0;
    stampCeresTenderIdentity(canonicalSpec, context);

    let entity = live;
    let spawned = false;
    if (entity) {
      // World-record rematerialization intentionally builds a generic shell. Restore the canonical
      // Ironback presentation/loadout/AI fields, while never touching its saved pose or vitals.
      rehydrateCeresTender(entity, canonicalSpec, context);
    } else if (typeof this.helpers.spawnEntity === 'function') {
      entity = this.helpers.spawnEntity(canonicalSpec);
      spawned = !!entity;
      if (entity) stampCeresTenderIdentity(entity, context);
    }
    if (!entity) return null;
    // World rematerializes every durable NPC through its generic FULL-extra bag. This tender is
    // immediately adopted by factionPresence instead, so remove that temporary membership; hard
    // exit captures/removes it explicitly, while continuous handoff keeps the live local actor.
    releaseCeresTenderFromWorldExtras(state, entity);

    if (typeof assignJob === 'function') {
      assignJob(entity, ceresTenderJobSpec(context));
    }

    own.active[context.activeKey] = {
      entityId: entity.id || null,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      factionId: context.plan.factionId,
      routeId: null,
      activityActorSlotId: context.slot.id,
      worldRecordId: context.recordId,
    };

    if (spawned) {
      const receipt = {
        t: state.simTime || 0,
        sectorId: CERES_ACTIVITY_SECTOR_ID,
        factionId: context.plan.factionId,
        entityId: entity.id || null,
        shipDefId: context.plan.shipDefId,
        source: context.plan.source || 'authoredPresence',
      };
      pushReceipt(state, { kind: 'spawned', ...receipt });
      this.bus.emit('factionPresence:spawned', receipt);
    }
    return entity;
  },

  _onEntitySpawned(payload) {
    const entity = payload.entity || (payload.id != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.id)
      : null);
    if (!entity || !['faction_scn', 'faction_pitborn'].includes(entity.factionId)) return;
    this._bindPitbornConcordTargets();
  },

  _bindPitbornConcordTargets() {
    const entities = (this.state.entityList || []).filter((entity) => entity && entity.alive !== false);
    const concord = entities
      .filter((entity) => entity.id !== this.state.playerId && entity.type === 'ship' && entity.factionId === 'faction_scn')
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
    for (const pitborn of entities) {
      const marker = pitborn.data && pitborn.data.factionPresence;
      const ai = pitborn.data && pitborn.data.ai;
      const profile = normalizeFactionBehaviorProfile(ai && ai.factionPresenceDoctrine);
      if (!marker || marker.factionId !== 'faction_pitborn' || !ai || ai.passive || !profile) continue;
      if (!profile.firstFire || !profile.firstFireAgainst.includes('faction_scn')) continue;
      if (!concord) {
        delete ai.retaliationTargetId;
        ai.activity = { ...(ai.activity || {}), targetId: null };
        continue;
      }
      ai.retaliationTargetId = concord.id;
      ai.activity = {
        ...(ai.activity || {}),
        kind: 'attack_run',
        reason: 'pitborn_disable_and_run',
        targetId: concord.id,
      };
    }
  },

  _onCombatDamage(payload) {
    if (payload.attackerId !== this.state.playerId || payload.targetId == null || !(payload.applied > 0)) return;
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.targetId)
      : null;
    const marker = target && target.data && target.data.factionPresence;
    if (marker && ['faction_understory', 'faction_archive'].includes(marker.factionId)) {
      this._activateDefensivePresence(marker.factionId, this.state.playerId, 'direct_attack');
      return;
    }
    const stationId = target && target.data && target.data.stationId;
    if (stationId && ['station_drift', 'station_tethys', 'station_helios'].includes(stationId)) {
      this._activateDefensivePresence('faction_archive', this.state.playerId, 'reading_room_attack');
      return;
    }
    if (!marker || marker.factionId !== 'faction_fulfillment' || !marker.fixedRoute) return;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (sectorId === 'sector_helios_prime') {
      this.bus.emit('presentation:caption', {
        text: 'FULFILLMENT ROUTE HELD — STATION PROTECTION ACTIVE',
        assertive: false,
        shape: 'administrative-denial',
      });
      return;
    }
    if (sectorId !== 'sector_tethys_junction') return;
    this._activateFulfillmentRoute(marker.routeId);
  },

  _activateDefensivePresence(factionId, targetId, trigger) {
    let activated = 0;
    for (const entity of this.state.entityList || []) {
      const marker = entity && entity.data && entity.data.factionPresence;
      const ai = entity && entity.data && entity.data.ai;
      const profile = normalizeFactionBehaviorProfile(ai && ai.factionPresenceDoctrine);
      if (!marker || marker.factionId !== factionId || !ai || !profile || profile.firstFire) continue;
      if (trigger === 'reading_room_attack' && !(profile.stationDefenseAggression > 0)) continue;
      entity.team = 1;
      if (entity.data) entity.data.team = 1;
      ai.passive = false;
      ai.roe = 'weapons_free';
      ai.retaliationTargetId = targetId;
      ai.motive = trigger === 'reading_room_attack' ? 'archive_station_defense' : 'self_defense';
      ai.engagementTrigger = trigger;
      ai.zoneId = this.state.world && this.state.world.currentSectorId || null;
      ai.approachTelegraph = factionId === 'faction_archive'
        ? 'archive_redaction_focus'
        : 'understory_afterwake_focus';
      ai.noFireResponseWindowS = 1;
      ai.activity = {
        ...(ai.activity || {}),
        kind: 'attack_run',
        reason: trigger,
        startedTick: this.state.tick | 0,
        targetId,
      };
      activated++;
    }
    return activated;
  },

  _activateFulfillmentRoute(routeId, { record = true } = {}) {
    const playerId = this.state.playerId;
    let activated = 0;
    for (const entity of this.state.entityList || []) {
      const marker = entity && entity.data && entity.data.factionPresence;
      const ai = entity && entity.data && entity.data.ai;
      if (!marker || marker.factionId !== 'faction_fulfillment' || marker.routeId !== routeId || !ai) continue;
      entity.team = 1;
      if (entity.data) entity.data.team = 1;
      ai.passive = false;
      ai.allowPassiveManeuver = true;
      ai.roe = 'weapons_free';
      ai.retaliationTargetId = playerId;
      ai.motive = 'administrative_variance';
      ai.engagementTrigger = 'player_attack';
      ai.zoneId = this.state.world && this.state.world.currentSectorId || null;
      ai.approachTelegraph = 'fulfillment_route_intercept';
      ai.noFireResponseWindowS = 1;
      ai.activity = {
        ...(ai.activity || {}),
        kind: 'attack_run',
        reason: 'fulfillment_variance_response',
        startedTick: this.state.tick | 0,
        targetId: playerId,
      };
      activated++;
    }
    if (activated > 0 && record) {
      pushReceipt(this.state, {
        kind: 'fulfillmentProvoked', routeId, t: this.state.simTime || 0,
      });
      this.bus.emit('factionPresence:fulfillmentProvoked', { routeId, count: activated, tick: this.state.tick | 0 });
    }
    return activated;
  },

  _resetFulfillmentRoute(routeId) {
    for (const entity of this.state.entityList || []) {
      const marker = entity && entity.data && entity.data.factionPresence;
      const ai = entity && entity.data && entity.data.ai;
      if (!marker || marker.factionId !== 'faction_fulfillment' || marker.routeId !== routeId || !ai) continue;
      entity.team = 2;
      if (entity.data) entity.data.team = 2;
      ai.passive = true;
      ai.roe = 'hold_fire';
      delete ai.retaliationTargetId;
      delete ai.motive;
      delete ai.engagementTrigger;
      delete ai.zoneId;
      delete ai.approachTelegraph;
      delete ai.noFireResponseWindowS;
      ai.activity = {
        ...(ai.activity || {}),
        kind: 'transit',
        reason: 'fulfillment_fixed_route',
        targetId: null,
      };
    }
  },

  _rehydrateBoardingConvoy() {
    const boarding = ensureOwnState(this.state).boarding;
    if (!boarding || !boarding.routeId) return;
    if (['blackout', 'transit', 'wake_pending'].includes(boarding.phase)) {
      this._activateFulfillmentRoute(boarding.routeId, { record: false });
    } else {
      this._resetFulfillmentRoute(boarding.routeId);
    }
  },

  _onSaveLoaded() {
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
      const seed = ((this.state.meta && this.state.meta.seed) || 1) >>> 0;
      const tenderPlan = planFactionPresence({ sectorId, seed })
        .find((plan) => matchesCeresRefineryTender(plan));
      const context = tenderPlan && ceresTenderContext(tenderPlan, seed, this.state.tick);
      if (context) this._bindCeresRefineryTender(context, ensureOwnState(this.state));
    }
    const boarding = ensureOwnState(this.state).boarding;
    this._rehydrateBoardingConvoy();
    if (boarding) this._emitBoardingPhase(boarding);
    if (boarding && boarding.phase === 'wake_pending') this._repairBoardingSubsystem(boarding);
  },

  _onSectorExit(payload) {
    const sectorId = payload.sectorId || (this.state.world && this.state.world.currentSectorId);
    if (!sectorId) return;
    const own = ensureOwnState(this.state);
    for (const [key, row] of Object.entries(own.active)) {
      if (!row || row.sectorId !== sectorId) continue;
      if (row.activityActorSlotId === CERES_REFINERY_TENDER.id
        && !(payload.continuous || payload.noTeleport)) {
        const entity = row.entityId != null && this.state.entities && this.state.entities.get
          ? this.state.entities.get(row.entityId)
          : null;
        if (entity && entity.alive !== false) {
          // Faction presences are not part of world's authored enemy/dressing bags. On a hard exit,
          // capture this one durable authored actor through the world owner before scoped removal;
          // otherwise it survives forever beside a REDUCED sector with no active owner. Continuous
          // corridor handoff deliberately keeps the live hull, matching traffic's locality policy.
          const world = this.registry && this.registry.get && this.registry.get('world');
          const captured = world && typeof world.upsertWorldRecord === 'function'
            ? world.upsertWorldRecord(entity)
            : null;
          if (captured) {
            const remove = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
            if (typeof remove === 'function') remove(entity.id);
            else entity.alive = false;
          }
        }
      }
      delete own.active[key];
    }
  },

  _onLossRecorded(payload) {
    const currentSectorId = this.state.world && this.state.world.currentSectorId;
    if (!payload.shipDefId || payload.sectorId !== currentSectorId) return;
    this._onSectorEnter({ sectorId: currentSectorId });
  },

  _onDocked(payload) {
    const stationId = payload.stationId || payload.id || null;
    if (!stationId) return;
    const service = presenceServiceForStation(stationId, factionReps(this.state));
    if (!service) return;
    const own = ensureOwnState(this.state);
    own.servicesByStation[stationId] = { ...service };
    const receipt = { ...service, t: this.state.simTime || 0 };
    pushReceipt(this.state, { kind: 'service', ...receipt });
    this.bus.emit('factionPresence:service', receipt);
  },

  _onServiceAction(payload) {
    const stationId = typeof payload.stationId === 'string' ? payload.stationId : null;
    const serviceId = typeof payload.serviceId === 'string' ? payload.serviceId : null;
    if (!stationId || !serviceId) return;
    const own = ensureOwnState(this.state);
    const stored = own.servicesByStation[stationId];
    if (!stored) return;
    const reps = factionReps(this.state);
    const current = presenceServiceForStation(stationId, reps);
    if (!current) return;
    const available = current.available === true;
    if (!available) {
      this.bus.emit('toast', {
        text: `Archive access requires ${current.requiredRep} reputation`, kind: 'warn', ttl: 3,
      });
      return;
    }

    let targetTab = null;
    if (serviceId === 'pitborn_yard' && current.services.includes('yard')) targetTab = 'shipyard';
    else if (serviceId === 'pitborn_fence' && current.services.includes('fence')) targetTab = 'market';
    else if (serviceId === 'understory_wreck_buy' && current.services.includes('wreck_buy')) targetTab = null;
    else if (serviceId !== 'archive_reading_room' || !current.services.includes('reading_room')) return;

    if (serviceId === 'archive_reading_room') {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const hasKellPaperTrail = this.state.story && this.state.story.verge
        && this.state.story.verge.evidence
        && this.state.story.verge.evidence.kellPaperTrail === true;
      const evidenceId = hasKellPaperTrail ? 'vale_gate_revocation_file' : null;
      const readings = [
        'The redacted lane report lists three arrivals and four departures. The missing ship is the point.',
        'A margin note records the gate hum before the instruments did. Someone heard it first.',
        'The Archive preserved the correction, not the original lie. Read the ink pressure.',
      ];
      const readingId = `archive_${hash32(seed, stationId, evidenceId || 'reading-room').toString(36)}`;
      const text = evidenceId
        ? 'REF 44-C names Vale as the operator of a stolen gate-revocation protocol. The original seal is intact.'
        : readings[hash32(seed, stationId, 'reading-copy') % readings.length];
      if (!own.serviceReceipts[readingId]) {
        const receipt = { kind: 'archiveReading', evidenceId, readingId, stationId, text, t: this.state.simTime || 0 };
        own.serviceReceipts[readingId] = receipt;
        pushReceipt(this.state, receipt);
      }
      this.bus.emit('comms:popup', {
        id: readingId, sender: 'Archive Reading Room', text, category: 'archive', persist: true,
      });
      if (evidenceId) {
        this.bus.emit('factionPresence:archiveEvidenceRead', { evidenceId, readingId, stationId });
      }
    } else if (serviceId === 'understory_wreck_buy') {
      const sectorId = this.state.world && this.state.world.currentSectorId;
      const loss = lossesFor(this.state, sectorId)[0] || null;
      const appraisalId = `understory_${hash32((this.state.meta && this.state.meta.seed) || 1, stationId, loss && loss.lossId || 'empty').toString(36)}`;
      const text = loss && loss.shipDefId
        ? `Recorded hull ${loss.shipDefId}. The Understory buyer will appraise what the ledger can prove.`
        : 'No recorded hull is attached to this berth yet. Bring back a loss the ledger can prove.';
      if (!own.serviceReceipts[appraisalId]) {
        const receipt = {
          kind: 'understoryAppraisal', appraisalId, stationId, lossId: loss && loss.lossId || null,
          shipDefId: loss && loss.shipDefId || null, text, t: this.state.simTime || 0,
        };
        own.serviceReceipts[appraisalId] = receipt;
        pushReceipt(this.state, receipt);
      }
      this.bus.emit('comms:popup', {
        id: appraisalId, sender: 'Understory Wreck Buyer', text, category: 'salvage', persist: true,
      });
    } else {
      pushReceipt(this.state, {
        kind: 'pitbornService', stationId, serviceId, targetTab, t: this.state.simTime || 0,
      });
    }
    this.bus.emit('factionPresence:serviceAction', {
      factionId: current.factionId, stationId, serviceId, targetTab, available: true,
    });
  },

  _updateFulfillmentRoutes() {
    const simTime = Number(this.state.simTime) || 0;
    for (const entity of this.state.entityList || []) {
      const marker = entity && entity.data && entity.data.factionPresence;
      const ai = entity && entity.data && entity.data.ai;
      const profile = normalizeFactionBehaviorProfile(ai && ai.factionPresenceDoctrine);
      if (!marker || !marker.fixedRoute || !marker.routeStart || !marker.routeEnd || !ai
        || !profile || !profile.fixedRoute) continue;
      const period = Math.max(1, Number(marker.routePeriodS) || 32);
      const raw = ((simTime % period) + period) % period / period;
      const progress = raw <= 0.5 ? raw * 2 : (1 - raw) * 2;
      const start = marker.routeStart;
      const end = marker.routeEnd;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz) || 1;
      const offset = ((Number(marker.formationIndex) || 0) - ((Number(marker.formationCount) || 1) - 1) / 2)
        * (Number(marker.formationSpacing) || 52);
      const anchor = {
        x: start.x + dx * progress + (-dz / length) * offset,
        z: start.z + dz * progress + (dx / length) * offset,
      };
      const offensive = ai.passive === false && ai.activity && ai.activity.kind === 'attack_run';
      ai.activity = {
        ...(ai.activity || {}),
        kind: offensive ? ai.activity.kind : 'transit',
        reason: offensive ? ai.activity.reason : 'fulfillment_fixed_route',
        routeId: marker.routeId,
        anchor,
      };
    }
  },

  _onSubsystemDisabled(payload) {
    if (payload.dependencyDisabled === true) return;
    if (payload.targetId !== this.state.playerId) return;
    if (!['subsystem_drive', 'subsystem_power'].includes(payload.subsystemId)) return;
    const attacker = this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.attackerId)
      : null;
    const player = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId)
      : null;
    const marker = attacker && attacker.data && attacker.data.factionPresence;
    const attackerAi = attacker && attacker.data && attacker.data.ai;
    if (!marker || marker.factionId !== 'faction_fulfillment' || !marker.fixedRoute || !player) return;
    if (!attackerAi || attackerAi.passive !== false || attackerAi.retaliationTargetId !== player.id) return;
    if (Math.hypot(attacker.pos.x - player.pos.x, attacker.pos.z - player.pos.z) > 900) return;
    const own = ensureOwnState(this.state);
    const key = [this.state.tick || 0, payload.attackerId, payload.targetId, payload.subsystemId].join(':');
    if (own.processedDisable[key] || (own.boarding && own.boarding.phase !== 'holding')) return;
    own.processedDisable[key] = true;
    const now = Number(this.state.simTime) || 0;
    const holdingPos = marker.routeEnd
      ? { x: marker.routeEnd.x, z: marker.routeEnd.z }
      : { x: attacker.pos.x, z: attacker.pos.z };
    own.boarding = {
      id: `fulfillment_boarding_${hash32((this.state.meta && this.state.meta.seed) || 1, key).toString(36)}`,
      phase: 'blackout',
      routeId: marker.routeId,
      subsystemId: payload.subsystemId,
      startedAt: now,
      phaseStartedAt: now,
      holdingPos,
      routed: false,
    };
    this._boardingRepairRequested = false;
    pushReceipt(this.state, { kind: 'boardingDisabled', t: now, ...own.boarding });
    const world = this.registry && this.registry.get && this.registry.get('world');
    if (world && typeof world.relocatePlayerInSector === 'function') {
      world.relocatePlayerInSector({ x: player.pos.x, z: player.pos.z, heading: player.rot }, {
        reason: 'fulfillment_blackout_settle',
      });
    }
    this._emitBoardingPhase(own.boarding);
    this.bus.emit('presentation:caption', {
      text: 'FULFILLMENT ROUTING HOLD', assertive: true, shape: 'administrative-blackout',
    });
  },

  _updateBoarding() {
    const own = ensureOwnState(this.state);
    const boarding = own.boarding;
    if (!boarding) return;
    const now = Number(this.state.simTime) || 0;
    if (boarding.phase === 'blackout' && now - boarding.phaseStartedAt >= 1.25) {
      boarding.phase = 'transit';
      boarding.phaseStartedAt = now;
      this._routeOneCargo(boarding);
      this._emitBoardingPhase(boarding);
      this.bus.emit('presentation:caption', {
        text: 'CARGO REASSIGNED — PROCEED TO HOLDING', assertive: true, shape: 'administrative-transit',
      });
    }
    if (boarding.phase === 'transit' && now - boarding.phaseStartedAt >= 2.5) {
      this._breakPlayerAttachments();
      const world = this.registry && this.registry.get && this.registry.get('world');
      if (!world || typeof world.relocatePlayerInSector !== 'function'
        || !world.relocatePlayerInSector({ ...boarding.holdingPos }, { reason: 'fulfillment_holding' })) return;
      boarding.phase = 'wake_pending';
      boarding.phaseStartedAt = now;
      this.bus.emit('ui:setCourse', {
        pos: { ...boarding.holdingPos },
        label: 'Fulfillment Holding Point',
        reason: 'Administrative routing complete',
        waypointKind: 'fulfillment_holding',
        arrivalRadius: 72,
      });
      this.bus.emit('presentation:caption', {
        text: 'HOLDING POINT ASSIGNED — RESTORING DRIVE', assertive: false, shape: 'administrative-holding',
      });
      this._emitBoardingPhase(boarding);
      this._repairBoardingSubsystem(boarding);
    }
  },

  _emitBoardingPhase(boarding) {
    if (!boarding) return;
    this.bus.emit('factionPresence:boardingPhase', {
      boardingId: boarding.id,
      routeId: boarding.routeId,
      phase: boarding.phase,
      tick: this.state.tick | 0,
    });
  },

  _combatKernel() {
    const combat = this.registry && this.registry.get && this.registry.get('combat');
    if (!combat) return null;
    if (typeof combat.ensureKernel === 'function') return combat.ensureKernel();
    return combat.kernel || null;
  },

  _breakPlayerAttachments() {
    const kernel = this._combatKernel();
    const attachments = kernel && kernel.attachments;
    if (!attachments || typeof attachments.listForEntity !== 'function'
      || typeof attachments.breakAttachment !== 'function') return 0;
    let broken = 0;
    for (const attachment of attachments.listForEntity(this.state.playerId, true)) {
      const result = attachments.breakAttachment(attachment, 'fulfillment_relocation', this.state.playerId);
      if (result && result.ok) broken++;
    }
    return broken;
  },

  _repairBoardingSubsystem(boarding) {
    if (!boarding || boarding.phase !== 'wake_pending' || this._boardingRepairRequested) return false;
    const kernel = this._combatKernel();
    if (!kernel || typeof kernel.repair !== 'function') return false;
    const result = kernel.repair(
      this.state.playerId,
      boarding.subsystemId,
      1e9,
      'fulfillment_routing_complete',
    );
    this._boardingRepairRequested = !!(result && result.applied > 0);
    return this._boardingRepairRequested;
  },

  _onSubsystemEnabled(payload) {
    const own = ensureOwnState(this.state);
    const boarding = own.boarding;
    if (!boarding || boarding.phase !== 'wake_pending') return;
    if (payload.targetId !== this.state.playerId || payload.subsystemId !== boarding.subsystemId) return;
    boarding.phase = 'holding';
    boarding.phaseStartedAt = Number(this.state.simTime) || 0;
    this._boardingRepairRequested = false;
    this._resetFulfillmentRoute(boarding.routeId);
    this._emitBoardingPhase(boarding);
    this.bus.emit('presentation:caption', {
      text: 'ROUTING COMPLETE. VARIANCE RESOLVED.',
      assertive: false,
      shape: 'administrative-complete',
    });
    pushReceipt(this.state, {
      kind: 'boardingHolding',
      t: boarding.phaseStartedAt,
      boardingId: boarding.id,
      routeId: boarding.routeId,
    });
  },

  _routeOneCargo(boarding) {
    if (boarding.routed) return;
    const items = this.state.player && this.state.player.cargo && this.state.player.cargo.items || {};
    const commodityId = Object.keys(items)
      .filter((id) => Number(items[id]) > 0 && !isPersistentCargo(this.state, id))
      .sort()[0] || null;
    const removed = commodityId ? removeCargo(this.state, commodityId, 1) : 0;
    const route = FULFILLMENT_FIXED_ROUTES.find((row) => row.id === boarding.routeId);
    const receipt = {
      factionId: 'faction_fulfillment',
      routeId: route ? route.id : boarding.routeId,
      commodityId,
      requested: commodityId ? 1 : 0,
      removed,
      administrative: true,
      t: this.state.simTime || 0,
      boardingId: boarding.id,
      routingCode: `FR-${hash32(boarding.routeId, commodityId || 'empty', boarding.id).toString(16).toUpperCase()}`,
    };
    pushReceipt(this.state, { kind: 'administrativeRouting', ...receipt });
    // Mark the semantic attempt complete only after the deterministic selection, owner-routed
    // mutation, and durable receipt have settled. Set it before publishing to resist reentrancy.
    boarding.routed = true;
    this.bus.emit('factionPresence:administrativeRouting', receipt);
  },

  serialize() {
    const own = ensureOwnState(this.state);
    const boarding = own.boarding ? {
      id: own.boarding.id,
      phase: own.boarding.phase,
      routeId: own.boarding.routeId,
      subsystemId: own.boarding.subsystemId,
      startedAt: own.boarding.startedAt,
      phaseStartedAt: own.boarding.phaseStartedAt,
      holdingPos: own.boarding.holdingPos ? { ...own.boarding.holdingPos } : null,
      routed: own.boarding.routed === true,
    } : null;
    const receipts = own.receipts.slice(-48).map((receipt) => {
      const clean = { ...receipt };
      delete clean.entityId;
      delete clean.attackerId;
      delete clean.targetId;
      return clean;
    });
    return {
      receipts,
      sequence: own.sequence,
      boarding,
      servicesByStation: JSON.parse(JSON.stringify(own.servicesByStation)),
      serviceReceipts: JSON.parse(JSON.stringify(own.serviceReceipts)),
    };
  },

  deserialize(data) {
    const source = data && data.boarding && typeof data.boarding === 'object' ? data.boarding : null;
    const boarding = source && typeof source.id === 'string' && typeof source.routeId === 'string'
      && ['blackout', 'transit', 'wake_pending', 'holding'].includes(source.phase)
      && source.holdingPos && Number.isFinite(source.holdingPos.x) && Number.isFinite(source.holdingPos.z)
      ? {
          id: source.id,
          phase: source.phase,
          routeId: source.routeId,
          subsystemId: source.subsystemId,
          startedAt: Number(source.startedAt) || 0,
          phaseStartedAt: Number(source.phaseStartedAt) || 0,
          holdingPos: { x: source.holdingPos.x, z: source.holdingPos.z },
          routed: source.routed === true,
        }
      : null;
    this.state.factionPresence = {
      active: {},
      receipts: Array.isArray(data && data.receipts) ? data.receipts.slice(-48) : [],
      sequence: Math.max(0, Math.floor(Number(data && data.sequence) || 0)),
      boarding,
      processedDisable: {},
      servicesByStation: JSON.parse(JSON.stringify((data && data.servicesByStation) || {})),
      serviceReceipts: JSON.parse(JSON.stringify((data && data.serviceReceipts) || {})),
    };
    this._boardingRepairRequested = false;
    if (boarding) this._emitBoardingPhase(boarding);
  },

  destroy() {
    for (const unsub of this._unsub || []) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsub = [];
  },
};

export default factionPresence;
