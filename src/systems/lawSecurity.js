// lawSecurity.js — jurisdiction, motive, and response authority for live space.
//
// This system closes the gap between the tactical AI's final fire gate and authored encounter
// scripts. Ambient armed ships do not become anonymous murder-tops: valuable cargo can produce a
// toll parley, an empty hold produces watchful neutrality, and the player's first shot produces a
// named retaliation cause. Inside a lawful station's protection volume, actual hostile damage
// dispatches a patrol response that can target criminals even though legacy NPC team numbers are
// shared. Credits/cargo/rep/heat remain with their canonical owners.

import { hash32 } from '../core/rng.js';
import { takeNearWorkSlice } from '../core/activityScheduler.js';
import { COMMODITIES } from '../data/commodities.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../data/sectorActivityPockets.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { CombatDoctrineId, normalizeCombatDoctrineId } from '../ai/combatDoctrine.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import {
  is47aScavengerCounterplayAuthorized,
  protectedStationAt,
} from '../ai/engagementAuthority.js';
import { hotUntilActive } from '../economy/customsRisk.js';
import {
  impoundBillFor,
  isImpoundWorkComplete,
  quoteImpoundBill,
} from './custodyConsequences.js';
import { heatLevelFor, isPlayerWanted, wantedTierFor, WANTED_TIER } from './heat.js';
import {
  BOUNTY_HUNTER_PLAYER_CONTEXT,
  makePlayerWarrantHunterSpec,
} from '../data/bountyHunters.js';
import {
  commodityLegality,
  isCivilianManifestPayload,
  isJettisonedCargoPod,
} from './lootShards.js';
import { missionOwnsReward, runOwnsReward } from '../combat/rewardEligibility.js';
import { isHostileToPlayer } from './scanner.js';
import { makeEnemySpawnSpec } from './combat.js';
import { patrolCanInitiateScan } from './encounterScripts.js';
import { effectiveRegionalSecurity } from './regionalEcology.js';
import {
  authorityResponsePolicy,
  rankLawfulResponders,
  reserveArrivalPoint,
} from '../law/authorityResponse.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
import {
  collectLivingWorldActors,
  findLivingWorldActor,
  forEachExplicitWitnessMarker,
  forEachJobInteractable,
  forEachLivingWorldActor,
  indexedShipLikeScan,
  indexedTypeScan,
} from '../world/livingWorldViews.js';

export const LAW_SECURITY_VERSION = 2;
export const AMBIENT_TOLL_VALUE_FLOOR = 120;

/** PQ-148.02 — physical customs scan cone over a flying pod (heading + half-angle + range). */
export const CUSTOMS_SCAN_RANGE = 90;
export const CUSTOMS_SCAN_HALF_ANGLE = 0.55;
export const CUSTOMS_SCAN_DWELL_S = 0.70;

/** PQ-151.01 — nets-band tether-net roadblock on a lane. Reuses the customs cone + a span. */
export const WANTED_NET_STANDOFF = 320;
export const WANTED_NET_RADIUS = 22;
export const WANTED_NET_BREAK_MASS = 80;
export const WANTED_NET_BREAK_SPEED = 70;

/** PQ-151.03 — impound yard ahead of the player; clerk flies from a reserve. */
export const WANTED_IMPOUND_STANDOFF = 360;
export const WANTED_IMPOUND_YARD_RADIUS = 36;
export const WANTED_IMPOUND_PAD_RADIUS = 14;

const RESPONSE_GRACE_S = 6;
const RESPONSE_CLEARANCE = 320;
const RECEIPT_CAP = 24;
const LAW_JOB_RESPONSE_HOLDER = 'lawSecurity';
// Claim marker for a responder's pre-dispatch moraleImmune value: the response borrows the flag
// while the incident is live and hands it back at stand-down, so an authored immune hull keeps it.
const SECURITY_RESPONSE_MORALE_RESTORE = '_lawSecurityMoraleRestore';
const AMBIENT_SCAN_INTERVAL_TICKS = 30;
const LAW_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);
const DANGEROUS_CONTEXTS = new Set([
  'zone_hostile', 'encounter', 'interdiction', 'bounty_hunter', 'named_hunter',
  'mission_hostile', 'story_hostile', 'sg06_reinforcement',
]);
const COMMODITY_VALUE = new Map(COMMODITIES.map((row) => [row.id, Math.max(1, Number(row.basePrice) || 1)]));
const CERES_ACTIVITY_ACTOR_SLOTS = Object.freeze(CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots));
const CERES_LAW_JOB_SLOTS_BY_ID = new Map(CERES_ACTIVITY_ACTOR_SLOTS
  .filter((slot) => slot.lawful === true && slot.jobKind === 'patrol')
  .map((slot) => [slot.id, slot]));
const CERES_ACTIVITY_SLOT_IDS = new Set(CERES_ACTIVITY_ACTOR_SLOTS.map((slot) => slot.id));
const CERES_AMBUSH_HAULER_SLOT = 'ceres_ambush_loaded_hauler';
const CERES_DISTRESS_STATION_ID = 'station_ceres';
const CERES_POCKET_DISTRESS_RADIUS = 2200;
const LAW_JOB_RESPONSE_CLAIM_CAP = CERES_LAW_JOB_SLOTS_BY_ID.size;
const LAW_RESPONSE_AI_FIELDS = Object.freeze([
  'lawful',
  'passive',
  'securityTargetId',
  'motive',
  'engagementTrigger',
  'zoneId',
  'approachTelegraph',
  'noFireResponseWindowS',
  'roe',
  'activity',
  'witnessRole',
  'witnessIncidentId',
  'moraleImmune',
]);
const LAW_RESPONSE_COMBAT_FIELDS = Object.freeze(['targetId', 'lockTarget']);
const LAW_RESPONSE_INTENT_FIELDS = Object.freeze(['fire', 'fireGroup']);

// PQ-048.06 is deliberately one concrete lawful route, not a generic encounter framework. The
// starter sector guarantees an ambient patrol with a durable world record, so the case can survive
// a save rematerialization without borrowing the numeric runtime id of that actor. These physical
// thresholds intentionally match patrolScan in encounterScripts.js; that script is 1 Hz while this
// registered system is 60 Hz, so this route measures the same two seconds from simTime instead.
const LAWFUL_INSPECTION_SECTOR_ID = 'sector_helios_prime';
const LAWFUL_INSPECTION_STATION_ID = 'station_helios';
const LAWFUL_INSPECTION_FACTION_ID = 'faction_scn';
const LAWFUL_INSPECTION_SCAN_RANGE = 700;
const LAWFUL_INSPECTION_BREAK_S = 2;
const LAWFUL_INSPECTION_OFFER_S = 10;
const LAWFUL_INSPECTION_POLL_TICKS = 30;
const LAWFUL_INSPECTION_REBIND_PASSES = 3;
const LAWFUL_INSPECTION_SETTLED_PATROL_CAP = 12;

export const lawSecurity = {
  name: 'lawSecurity',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._jobResponseClaims = new Map();
    this._podConeDwell = new Map();
    this._coneScratchPods = [];
    this._coneScratchOccluders = [];
    this._coneScratchScanners = [];
    this._nextInspectionTick = 0;
    this._inspectionRebindPasses = 0;
    ensureState(this.state);
    this._onDamage = (payload) => this._handleDamage(payload);
    this._onFire = (payload) => this._handleFire(payload);
    this._onSpawned = (payload) => this._stampAmbient(payload && payload.entity);
    this._onResponderGone = (payload) => {
      this._releaseJobResponsesForEntity(eventEntityId(payload), 'responder_gone');
      this._observeInspectionPatrolGone(payload);
    };
    this._onSectorExit = (payload) => {
      this._releaseJobResponsesForSector(payload && payload.sectorId, 'sector_exit');
      this._observeInspectionSectorExit(payload);
    };
    this._onSaveRestoring = () => {
      this._releaseAllJobResponses('save_restoring');
      this._resetInspectionTransient();
    };
    this._onSaveLoaded = () => {
      this._resetInspectionTransient();
      normalizePersistedLawfulInspection(this.state);
    };
    this._onInspectionChoice = (payload) => this._chooseInspection(payload);
    this._onInspectionScanned = (payload) => this._observeInspectionScan(payload);
    this._onPlayerDeath = () => this._interruptInspection('interrupted_player_death');
    this._onAftermathWreckSpawned = (payload) => this._handleAftermathWreckSpawned(payload);
    this._onSurvivorPodEjected = (payload) => this._handleSurvivorPodEjected(payload);
    this._onStolenCargoPodCollect = (payload) => this._handleStolenCargoPodCollect(payload);
    this._onStolenCargoPodLatch = (payload) => this._handleStolenCargoPodLatch(payload);
    this._onKilledAdjudication = (payload) => this._handleKilledAdjudication(payload);
    this._onDockedLawfulClearance = (payload) => this._handleDockedLawfulClearance(payload);
    this._onHeatChanged = () => {
      this._syncWantedWarrant(this.state);
      this._syncWantedCheckpoint(this.state);
      this._syncWantedImpound(this.state);
    };
    this._onImpoundPay = (payload) => this._payWantedImpound(this.state, payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:damage', this._onDamage);
      this.bus.on('combat:fire', this._onFire);
      this.bus.on('entity:spawned', this._onSpawned);
      this.bus.on('entity:killed', this._onResponderGone);
      this.bus.on('entity:destroyed', this._onResponderGone);
      this.bus.on('aftermathWreck:spawned', this._onAftermathWreckSpawned);
      this.bus.on('survivorPod:ejected', this._onSurvivorPodEjected);
      this.bus.on('sector:exit', this._onSectorExit);
      this.bus.on('save:restoring', this._onSaveRestoring);
      this.bus.on('save:loaded', this._onSaveLoaded);
      this.bus.on('lawfulInspection:choose', this._onInspectionChoice);
      this.bus.on('contraband:scanned', this._onInspectionScanned);
      this.bus.on('player:death', this._onPlayerDeath);
      this.bus.on('pickup:collected', this._onStolenCargoPodCollect);
      this.bus.on('tether:latched', this._onStolenCargoPodLatch);
      this.bus.on('entity:killed', this._onKilledAdjudication);
      this.bus.on('dock:docked', this._onDockedLawfulClearance);
      this.bus.on('heat:changed', this._onHeatChanged);
      this.bus.on('law:impoundPay', this._onImpoundPay);
    }
  },

  newGame() {
    this._releaseAllJobResponses('new_game');
    if (this.state) this.state.lawSecurity = freshState();
    if (this.state && this.state.player) delete this.state.player.lawfulInspection;
    this._resetInspectionTransient();
  },

  update(_dt, state) {
    if (state.run?.kind === 'survival' && state.run.phase !== 'inactive') return;
    this._reconcileJobResponses();
    if (state.mode && state.mode !== 'flight') return;
    this._syncWantedWarrant(state);
    this._syncWantedCheckpoint(state);
    this._syncWantedImpound(state);
    this._updateWantedCheckpoint(_dt, state);
    this._updateWantedImpound(_dt, state);
    const own = ensureState(state);
    this._enforceSanctuaryWithdrawals(state);
    this._updateLawfulInspection(state);
    this._updateCustomsScanCones(_dt, state);
    if ((state.tick | 0) >= (own.nextAmbientScanTick | 0)) {
      own.nextAmbientScanTick = (state.tick | 0) + AMBIENT_SCAN_INTERVAL_TICKS;
      const actors = collectLivingWorldActors(state, this._ambientActorScratch || (this._ambientActorScratch = []));
      const slice = takeNearWorkSlice(state, 'lawSecurity', actors);
      for (let i = 0; i < slice.length; i++) this._stampAmbient(slice[i]);
    }
    if ((state.tick | 0) < (own.nextIncidentTick | 0)) return;
    own.nextIncidentTick = (state.tick | 0) + 15;
    for (const key of Object.keys(own.incidents)) this._updateIncident(key, own.incidents[key]);
  },

  // ── PQ-048.06: one durable Helios cargo-inspection route ───────────────────────────────────

  _resetInspectionTransient() {
    this._nextInspectionTick = 0;
    this._inspectionRebindPasses = 0;
  },

  _updateLawfulInspection(state) {
    const active = activeLawfulInspection(state);
    if (active) {
      this._updateActiveLawfulInspection(state, active);
      return;
    }
    if ((state.tick | 0) < (this._nextInspectionTick | 0)) return;
    this._nextInspectionTick = (state.tick | 0) + LAWFUL_INSPECTION_POLL_TICKS;
    if (!canOfferLawfulInspection(state) || hasLivePatrolScan(state)) return;

    const suspicion = lawfulInspectionSuspicion(state, this._economy());
    if (!suspicion) return;
    const player = entityById(state, state.playerId);
    const normalized = normalizedLawfulInspectionLedger(state);
    // A malformed persisted history must never be treated as permission to mint a new case. Old
    // saves have no field at all and normalize from `last`; malformed new-shape saves stop here.
    if (!normalized.valid) return;
    const patrol = selectHeliosInspectionPatrol(state, player, settledPatrolIds(normalized.ledger));
    if (!patrol) return;

    const ledger = normalized.ledger || ensureLawfulInspectionLedger(state);
    if (!ledger) return;
    const sequence = ledger.sequence + 1;
    ledger.sequence = sequence;
    const patrolWorldRecordId = patrol.data.worldRecordId;
    const now = inspectionNow(state);
    const activeCase = {
      id: `lawful-inspection:${patrolWorldRecordId}:${sequence}`,
      patrolWorldRecordId,
      stationId: LAWFUL_INSPECTION_STATION_ID,
      sectorId: LAWFUL_INSPECTION_SECTOR_ID,
      factionId: LAWFUL_INSPECTION_FACTION_ID,
      suspicion,
      phase: 'offered',
      offeredAt: now,
      deadlineAt: now + LAWFUL_INSPECTION_OFFER_S,
    };
    ledger.active = activeCase;
    this._inspectionRebindPasses = 0;
    this._emit('lawfulInspection:offered', publicLawfulInspection(activeCase));
    this._say('bark', 'CONCORD PATROL: HOLD FOR CARGO INSPECTION.',
      `lawful-inspection:offer:${activeCase.id}`, activeCase.factionId);
  },

  _updateActiveLawfulInspection(state, activeCase) {
    if (hasLivePatrolScan(state)) {
      this._interruptInspection('interrupted_encounter');
      return;
    }
    const patrol = inspectionPatrolByWorldRecord(state, activeCase.patrolWorldRecordId);
    if (!patrol) {
      this._inspectionRebindPasses++;
      if (this._inspectionRebindPasses >= LAWFUL_INSPECTION_REBIND_PASSES) {
        this._interruptInspection('interrupted_patrol_unavailable');
      }
      return;
    }
    this._inspectionRebindPasses = 0;
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false) {
      this._interruptInspection('interrupted_player_death');
      return;
    }

    // Escape is a physical Flight V3 outcome: this system neither changes movement input nor
    // moves either hull. A continuous sector handoff therefore preserves the case long enough for
    // the actual separation to settle as escape, while a hard exit ends it in the event handler.
    const outsideRange = distance2(player.pos, patrol.pos)
      > LAWFUL_INSPECTION_SCAN_RANGE * LAWFUL_INSPECTION_SCAN_RANGE;
    if (outsideRange) {
      if (!Number.isFinite(activeCase.breakRangeSince)) {
        activeCase.breakRangeSince = inspectionNow(state);
      } else if (inspectionNow(state) - activeCase.breakRangeSince >= LAWFUL_INSPECTION_BREAK_S) {
        if (this._resolveLawfulInspection(activeCase, 'escaped')) {
          this._emit('faction:repDelta', {
            factionId: activeCase.factionId,
            delta: -3,
            reason: 'lawful_inspection_escape',
          });
        }
        return;
      }
    } else if (Object.hasOwn(activeCase, 'breakRangeSince')) {
      delete activeCase.breakRangeSince;
    }

    if (activeCase.phase === 'offered' && inspectionNow(state) >= activeCase.deadlineAt) {
      this._beginLawfulInspectionScan(activeCase, 'deadline');
    }
  },

  _chooseInspection(payload) {
    const activeCase = activeLawfulInspection(this.state);
    if (!activeCase || !payload || payload.caseId !== activeCase.id
      || payload.choice !== 'comply' || activeCase.phase !== 'offered') return false;
    return this._beginLawfulInspectionScan(activeCase, payload.source || 'ui');
  },

  _beginLawfulInspectionScan(activeCase, source) {
    const state = this.state;
    const player = entityById(state, state.playerId);
    const patrol = inspectionPatrolByWorldRecord(state, activeCase.patrolWorldRecordId);
    if (!player || !patrol) {
      this._interruptInspection('interrupted_patrol_unavailable');
      return false;
    }
    if (!isEligibleHeliosInspectionPatrol(state, patrol, player)) {
      this._interruptInspection('interrupted_jurisdiction_lost');
      return false;
    }
    if (!patrolCanInitiateScan(state, patrol, player)) {
      this._resolveLawfulInspection(activeCase, 'cloak_evaded');
      return false;
    }

    activeCase.phase = 'scanning';
    delete activeCase.breakRangeSince;
    this._emit('lawfulInspection:scanning', {
      ...publicLawfulInspection(activeCase),
      source: String(source || 'unknown'),
    });
    // Economy owns both the read and every confiscation/fine effect. The correlation id is only a
    // stable return address for this player case; it is not a second customs result channel.
    this._emit('patrol:proximity', {
      patrolId: patrol.id,
      stationId: activeCase.stationId,
      factionId: activeCase.factionId,
      security: 0.98,
      lawfulInspectionCaseId: activeCase.id,
    });
    // economy.runScan emits contraband:scanned synchronously when it finds cargo. If no matching
    // owner event arrived, the authoritative scan cleared the player (including a successful cloak
    // evasion roll); do not invent a cargo or heat result here.
    if (activeLawfulInspection(state) === activeCase && activeCase.phase === 'scanning') {
      if (this._resolveLawfulInspection(activeCase, 'cleared')) {
        this._emit('faction:repDelta', {
          factionId: activeCase.factionId,
          delta: 1,
          reason: 'lawful_inspection_clear',
        });
      }
    }
    return true;
  },

  _observeInspectionScan(payload) {
    const activeCase = activeLawfulInspection(this.state);
    if (!activeCase || !payload || payload.lawfulInspectionCaseId !== activeCase.id
      || activeCase.phase !== 'scanning' || payload.found !== true) return;
    this._resolveLawfulInspection(activeCase, 'contraband_discovered');
  },

  _observeInspectionPatrolGone(payload) {
    const state = this.state;
    const activeCase = activeLawfulInspection(state);
    if (!activeCase || !inspectionEventMatchesPatrol(state, payload, activeCase.patrolWorldRecordId)) return;
    this._inspectionRebindPasses = 0;
    if (payload && payload.killerId === state.playerId) {
      this._resolveLawfulInspection(activeCase, 'collateral_patrol_destroyed');
    } else {
      this._interruptInspection('interrupted_patrol_unavailable');
    }
  },

  _observeInspectionSectorExit(payload) {
    // The residency/world owners deliberately mark free-flight handoffs. Preserve the durable case
    // there; separation from the patrol is what makes the player an escaper. Intentional jumps and
    // loads are hard exits and cannot keep an actor-local inspection open.
    if (payload && (payload.continuous === true || payload.noTeleport === true)) return;
    const activeCase = activeLawfulInspection(this.state);
    if (activeCase && (!payload || payload.sectorId === activeCase.sectorId)) {
      this._interruptInspection('interrupted_sector_exit');
    }
  },

  _observeInspectionCollateral(payload, attacker, target) {
    const state = this.state;
    const activeCase = activeLawfulInspection(state);
    if (!activeCase || !attacker || attacker.id !== state.playerId || !target
      || target.data?.worldRecordId !== activeCase.patrolWorldRecordId) return;
    // Existing combat → lawSecurity/heat listeners own the actual jurisdiction and heat result.
    // This case only records why its prompt stopped; it deliberately does not report a second
    // incident or write cargo, credits, faction standing, or heat.
    this._resolveLawfulInspection(activeCase, 'collateral_assault');
  },

  _interruptInspection(outcome) {
    const activeCase = activeLawfulInspection(this.state);
    if (!activeCase) return false;
    return this._resolveLawfulInspection(activeCase, outcome);
  },

  _resolveLawfulInspection(activeCase, outcome) {
    const state = this.state;
    const ledger = lawfulInspectionLedger(state);
    if (!ledger || ledger.active !== activeCase) return false;
    const resolvedAt = inspectionNow(state);
    recordSettledPatrolId(ledger, activeCase.patrolWorldRecordId);
    ledger.active = null;
    ledger.last = {
      id: activeCase.id,
      patrolWorldRecordId: activeCase.patrolWorldRecordId,
      stationId: activeCase.stationId,
      sectorId: activeCase.sectorId,
      factionId: activeCase.factionId,
      outcome,
      resolvedAt,
    };
    this._emit('lawfulInspection:resolved', { ...ledger.last });
    return true;
  },

  _economy() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('economy')
      : null;
  },

  _stampAmbient(entity) {
    const state = this.state;
    if (!state || !isArmedNpc(entity, state)) return false;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    if (ai.escalationPolicyVersion === LAW_SECURITY_VERSION) return false;
    const context = String(ai.spawnContext || ai.context || '').toLowerCase();
    if (context !== 'ambient' || ai.lawful || ai.encounterId || data.encounter || DANGEROUS_CONTEXTS.has(context)) return false;
    if (!isPirateLike(entity)) return false;

    ai.escalationPolicyVersion = LAW_SECURITY_VERSION;
    ai.zoneId = String(ai.zoneId || `ambient:${currentSectorId(state)}`);
    const cargoValue = playerCargoValue(state);
    const security = Number.isFinite(ai.sectorSecurity) ? ai.sectorSecurity : sectorSecurity(state);
    if (cargoValue >= AMBIENT_TOLL_VALUE_FLOOR && security <= 0.75) {
      // pirateParley owns the actual demand/comply/refuse state machine. One shared squad id keeps
      // an ambient group on one voice instead of every ship demanding separately.
      ai.doctrine = 'toll';
      ai.squadId = String(ai.squadId || `ambient_toll:${currentSectorId(state)}:${ai.zoneId}`);
      ai.motive = 'cargo_extortion';
      ai.engagementTrigger = 'demand_pending';
      ai.approachTelegraph = String(ai.approachTelegraph || 'hail_and_scan');
      ai.noFireResponseWindowS = Math.max(1, Number(ai.noFireResponseWindowS) || 0);
      return true;
    }

    // No value and no authored danger means no rational reason to attack. The ship remains a real
    // contact and may defend itself after player aggression, but it neither targets nor fires now.
    ai.passive = true;
    ai.motive = cargoValue > 0 ? 'territorial_watch' : 'no_valuable_cargo';
    ai.engagementTrigger = 'player_attack';
    ai.approachTelegraph = String(ai.approachTelegraph || 'warning_pass');
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.LOITER,
      reason: `ambient_watch:${ai.motive}`,
      anchor: entity.pos,
      leashRadius: 1800,
      startedTick: state.tick | 0,
    });
    clearTarget(entity, state.playerId);
    return true;
  },

  /**
   * Station protection is a behavior contract, not only a projectile veto. If a raider crosses
   * the jurisdiction boundary while chasing a protected target, it must visibly break contact:
   * disarm, clear the lock, and fly away from the protected core. This catches stale attack state
   * from encounters and sector promotion before the weapon system can consume it.
  */
  _enforceSanctuaryWithdrawals(state) {
    const armed = indexedTypeScan(state, 'aiShips');
    for (let i = 0; i < armed.length; i++) {
      const entity = armed[i];
      if (!isArmedNpc(entity, state) || isLawful(entity)) continue;
      const data = entity.data || (entity.data = {});
      const ai = data.ai || (data.ai = {});
      const combat = data.combat || (data.combat = {});
      const intent = data.intent || (data.intent = {});
      const activity = ai.activity;
      let targetId = combat.targetId != null ? combat.targetId : combat.lockTarget;
      if (targetId == null && activity && activity.targetId != null) targetId = activity.targetId;
      if (targetId == null && (ai.forcePlayerTarget || ai.huntPlayer || intent.fire)) {
        targetId = state.playerId;
      }
      const target = entityById(state, targetId);
      if (!target) continue;
      if (is47aScavengerCounterplayAuthorized(state, entity, target)) continue;
      const jurisdiction = protectedStationAt(state, target) || protectedStationAt(state, entity);
      if (!jurisdiction) continue;
      this._withdrawFromSanctuary(entity, target, jurisdiction);
    }
  },

  _withdrawFromSanctuary(entity, target, jurisdiction) {
    const state = this.state;
    if (entity.data?.runCohort === 'survival') return;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    const firstWithdrawal = ai.sanctuaryWithdrawn !== true;
    const away = sanctuaryWithdrawalVector(state, entity, target, jurisdiction);
    const cause = aggressionCauseFor(state, entity, target);

    ai.passive = true;
    ai.forcePlayerTarget = false;
    ai.huntPlayer = false;
    ai.pirateDisengaged = true;
    ai.sanctuaryWithdrawn = true;
    ai.motiveSatisfied = true;
    ai.engagementTrigger = 'jurisdiction_withdrawal';
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.DISENGAGE,
      reason: `station_jurisdiction:${jurisdiction.stationId}:withdraw`,
      anchor: protectionCenter(state, jurisdiction, target),
      leashRadius: Math.max(1600, Number(jurisdiction.radius) || 0),
      startedTick: state.tick | 0,
      targetId: null,
    });

    clearTarget(entity, target.id);
    const intent = data.intent || (data.intent = {});
    intent.moveX = away.x;
    intent.moveZ = away.z;
    intent.boost = true;
    intent.brake = false;

    if (!firstWithdrawal) return;
    this._say('bark', 'Station guns own this lane. Breaking contact.',
      `law:sanctuary-withdrawal:${entity.id}`, entity.factionId);
    this._recordReceipt({
      cause,
      outcome: 'sanctuary_withdrawal',
      attackerId: entity.id,
      targetId: target.id,
      stationId: jurisdiction.stationId,
      text: 'CONTACT BROKEN — raider withdrew from station jurisdiction.',
    });
    this._emit('law:sanctuaryWithdrawal', {
      attackerId: entity.id,
      targetId: target.id,
      stationId: jurisdiction.stationId,
      tick: state.tick | 0,
    });
  },

  _handleDamage(payload) {
    const state = this.state;
    if (!state || !payload || !(Number(payload.applied) > 0)) return;
    const attacker = entityById(state, payload.attackerId);
    const target = entityById(state, payload.targetId);
    if (!attacker || !target || attacker.id === target.id) return;
    const player = entityById(state, state.playerId);

    this._observeInspectionCollateral(payload, attacker, target);

    // Shooting a parley squad is an explicit refusal, not an unlabelled hostility transition.
    if (attacker.id === state.playerId && target.data && target.data.ai && target.data.ai.parleySquadId) {
      this._emit('pirateParley:choose', { squadId: target.data.ai.parleySquadId, choice: 'refuse', reason: 'player_attack' });
    }

    if (attacker.id === state.playerId && target.id !== state.playerId) {
      // Already hostile at first contact: the fight was lawful before it began. The combat
      // receipt carries the FROZEN first-hit truth, so a victim who only turned hostile by
      // retaliating to the player's own first shot still flows through as a crime scene —
      // but shooting a declared hostile never opens an incident against the defender.
      if (payload.targetHostileToPlayer !== true) {
        const jurisdiction = protectedStationAt(state, target)
          || (player && protectedStationAt(state, player))
          || ceresDistressJurisdiction(state, target);
        if (jurisdiction && (isLawful(target) || isProtectedCivilian(target))) {
          this._openIncident(attacker, target, jurisdiction, isLawful(target) ? 'player_assault' : 'player_piracy');
          return;
        }
        if (isLawful(target)) {
          if (jurisdiction) this._openIncident(attacker, target, jurisdiction, 'player_assault');
          else this._authorizeResponder(target, attacker, null, 'self_defense');
        } else {
          this._retaliate(target, attacker);
        }
      }
      return;
    }

    const targetProtected = target.id === state.playerId || isLawful(target) || isProtectedCivilian(target);
    if (!targetProtected || isLawful(attacker)) return;
    const jurisdiction = protectedStationAt(state, target) || ceresDistressJurisdiction(state, target);
    if (jurisdiction) this._openIncident(attacker, target, jurisdiction,
      target.id === state.playerId || isLawful(target) ? 'hostile_fire' : 'npc_piracy');
    else if (isLawful(target) && target.type !== 'station') this._authorizeResponder(target, attacker, null, 'self_defense');
  },

  _handleFire(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const ownerId = payload.ownerId ?? payload.attackerId ?? payload.sourceId;
    const attacker = entityById(state, ownerId);
    if (!attacker || attacker.alive === false) return;
    const player = entityById(state, state.playerId);
    const targetId = payload.targetId
      ?? (attacker.data && attacker.data.combat && attacker.data.combat.targetId)
      ?? (attacker.data && attacker.data.ai && attacker.data.ai.activity && attacker.data.ai.activity.targetId);
    const target = entityById(state, targetId);
    if (!target || target.alive === false || attacker.id === target.id) return;
    if (isLawful(attacker) || !isCivilianHauler(target)) return;
    // Firing on a hauler that is already hostile to the player — and was not provoked into it
    // by the player's own first shot — is lawful force, not a fresh incident.
    if (attacker.id === state.playerId
      && !(target.data && target.data.ai && target.data.ai.retaliationTargetId === state.playerId)
      && isHostileToPlayer(target, player && player.team, state)) {
      return;
    }
    const slotHauler = target.data && target.data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT;
    const pocket = ceresDistressJurisdiction(state, target);
    const jurisdiction = pocket
      || (slotHauler && (protectedStationAt(state, target)
        || (attacker.id === state.playerId && protectedStationAt(state, attacker))));
    if (!jurisdiction) return;
    this._openIncident(attacker, target, jurisdiction,
      attacker.id === state.playerId
        ? (isLawful(target) ? 'player_assault' : 'player_piracy')
        : (isLawful(target) ? 'hostile_fire' : 'npc_piracy'));
  },

  _retaliate(victim, attacker) {
    if (!victim || !attacker || isLawful(victim)) return;
    const state = this.state;
    const protection = protectedStationAt(state, attacker);
    const data = victim.data || (victim.data = {});
    const ai = data.ai || (data.ai = {});
    ai.motive = 'self_defense';
    ai.engagementTrigger = 'player_attack';
    ai.retaliationTargetId = attacker.id;
    ai.approachTelegraph = 'return_fire_warning';
    ai.noFireResponseWindowS = 1;
    if (protection) {
      ai.passive = true;
      ai.roe = RulesOfEngagement.HOLD_FIRE;
      ai.activity = normalizeActivity({
        kind: ActivityKind.DISENGAGE,
        reason: 'station_jurisdiction:withdraw',
        anchor: victim.pos,
        leashRadius: 1600,
        startedTick: state.tick | 0,
        targetId: null,
      });
      clearTarget(victim, attacker.id);
      this._say('bark', 'Station guns own this lane. We are leaving.', `law:retreat:${victim.id}`, victim.factionId);
      this._recordReceipt({
        cause: 'player_attack', outcome: 'protected_withdrawal', attackerId: attacker.id,
        targetId: victim.id, stationId: protection.stationId,
        text: 'PLAYER FIRED FIRST — target withdrew under station protection.',
      });
      return;
    }
    ai.passive = false;
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'retaliation:player_attack',
      anchor: victim.pos,
      leashRadius: 2200,
      startedTick: state.tick | 0,
      targetId: attacker.id,
    });
    const combat = data.combat || (data.combat = {});
    combat.targetId = attacker.id;
    this._say('bark', 'You fired first. Clear our range to disengage.', `law:retaliation:${victim.id}`, victim.factionId);
    this._recordReceipt({
      cause: 'player_attack', outcome: 'retaliation_authorized', attackerId: attacker.id,
      targetId: victim.id, stationId: null,
      text: 'PLAYER FIRED FIRST — self-defense authorized; break contact to disengage.',
    });
  },

  _openIncident(attacker, victim, jurisdiction, cause) {
    const state = this.state;
    const own = ensureState(state);
    const key = `${jurisdiction.stationId}:${attacker.id}`;
    const existing = own.incidents[key];
    if (existing) {
      existing.lastDamageAt = state.simTime || 0;
      existing.victimId = victim.id;
      return existing;
    }
    const incident = {
      id: `law:${hash32(state.meta && state.meta.seed || 1, jurisdiction.stationId, attacker.id, state.tick | 0).toString(16)}`,
      stationId: jurisdiction.stationId,
      stationEntityId: jurisdiction.entityId,
      factionId: jurisdiction.factionId,
      radius: jurisdiction.radius,
      attackerId: attacker.id,
      victimId: victim.id,
      cause,
      startedAt: state.simTime || 0,
      lastDamageAt: state.simTime || 0,
      responderIds: [],
      nextReserveOrdinal: 0,
      status: 'distress',
      victimAnchor: null,
    };
    const policy = authorityResponsePolicy(effectiveLawSecurity(state));
    incident.security = policy.security;
    incident.dispatchDelayS = policy.dispatchDelayS;
    incident.dispatchAt = incident.startedAt + policy.dispatchDelayS;
    incident.responderCap = policy.responderCap;
    incident.reserveAllowed = jurisdiction.rankFromVictim === true ? false : policy.reserveAllowed;
    incident.rankFromVictim = jurisdiction.rankFromVictim === true;
    incident.challengeWindowS = policy.challengeWindowS;
    own.incidents[key] = incident;
    this._say('alert', `CONTROL: distress logged. Patrol ETA ${policy.dispatchDelayS.toFixed(2)} seconds.`, `law:distress:${incident.id}`, jurisdiction.factionId);
    this._emit('law:distressRaised', publicIncident(incident));
    this._emit('law:incidentOpened', publicIncident(incident));
    this._lawResponse('incident_opened', {
      incidentId: incident.id, stationId: incident.stationId, factionId: incident.factionId,
      cause, attackerId: attacker.id, victimId: victim.id,
      dispatchAt: incident.dispatchAt,
    });
    this._recordReceipt({
      incidentId: incident.id, cause, outcome: 'distress_received', attackerId: attacker.id,
      targetId: victim.id, stationId: jurisdiction.stationId,
      text: `DISTRESS RECEIVED — patrol dispatch in ${policy.dispatchDelayS.toFixed(2)} seconds.`,
    });
    return incident;
  },

  /**
   * Return undefined for an ordinary responder, null for a job hull that is not safe to borrow,
   * or the exact live Ceres job binding. Non-Ceres jobs retain the ordinary responder path; any
   * Ceres-marked candidate fails closed unless it is one of the two authored patrol/escort leases.
   */
  _jobResponderBinding(responder, incident) {
    const data = responder && responder.data;
    const slotId = typeof data?.activityActorSlotId === 'string' ? data.activityActorSlotId : null;
    const hasJobIdentity = !!data && (data.jobId != null || data.worldRecordId != null
      || data.ceresActivityCast === true
      || data.ceresActivityJobOwned === true
      || slotId != null);
    if (!hasJobIdentity) return undefined;
    if (!hasCeresJobResponderMarker(this.state, responder, slotId)) return undefined;
    const api = this.helpers && this.helpers.npcJobs;
    const slot = slotId && CERES_LAW_JOB_SLOTS_BY_ID.get(slotId);
    const worldRecordId = slot ? stableRecordId(
      this.state?.meta?.seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      slot.worldRecordSlotId,
    ) : null;
    const jobId = worldRecordId ? `job:${worldRecordId}` : null;
    if (!jobId || !slot
      || data.worldRecordId !== worldRecordId || data.jobId !== jobId
      || currentSectorId(this.state) !== CERES_ACTIVITY_SECTOR_ID
      || data.ceresActivityCast !== true || data.ceresActivityJobOwned !== true
      || data.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || (data.homeSectorId != null && data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID)
      || (responder.homeSectorId != null && responder.homeSectorId !== CERES_ACTIVITY_SECTOR_ID)
      || !api || typeof api.byEntity !== 'function' || typeof api.claimControl !== 'function'
      || typeof api.releaseControl !== 'function' || typeof api.controlClaim !== 'function') {
      return null;
    }
    const liveEntity = entityById(this.state, responder.id);
    const entry = api.byEntity(responder.id);
    if (liveEntity !== responder || responder.alive === false || !entry || entry.entityId !== responder.id
      || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID || entry.worldRecordId !== worldRecordId
      || entry.job?.id !== jobId
      || entry.job?.kind !== 'patrol' || entry.kind !== 'patrol') {
      return null;
    }
    const claimId = lawJobResponseClaimId(incident, jobId);
    if (!claimId) return null;
    const liveClaim = api.controlClaim(jobId);
    if (liveClaim) {
      const retained = this._jobResponseClaims && this._jobResponseClaims.get(claimId);
      if (!retained || retained.entity !== responder || retained.entry !== entry
        || liveClaim.claimId !== claimId || liveClaim.holder !== LAW_JOB_RESPONSE_HOLDER
        || liveClaim.claimedEntityId !== responder.id) {
        return null;
      }
    }
    return { api, jobId, slotId, entry, claimId };
  },

  _responseCandidateEligible(responder, incident) {
    const binding = this._jobResponderBinding(responder, incident);
    if (binding === undefined) return true;
    if (!binding) return false;
    return this._jobResponseClaims.has(binding.claimId)
      || this._jobResponseClaims.size < LAW_JOB_RESPONSE_CLAIM_CAP;
  },

  _claimJobResponder(responder, incident) {
    const binding = this._jobResponderBinding(responder, incident);
    if (binding === undefined) return true;
    if (!binding) return false;
    const retained = this._jobResponseClaims.get(binding.claimId);
    if (retained) return retained.entity === responder && retained.entry === binding.entry;
    if (this._jobResponseClaims.size >= LAW_JOB_RESPONSE_CLAIM_CAP) return false;

    const data = responder.data;
    const topLevels = {
      ai: snapshotOwnValue(data, 'ai'),
      combat: snapshotOwnValue(data, 'combat'),
      intent: snapshotOwnValue(data, 'intent'),
    };
    const snapshots = {
      ai: snapshotOwnFields(topLevels.ai.value, LAW_RESPONSE_AI_FIELDS),
      combat: snapshotOwnFields(topLevels.combat.value, LAW_RESPONSE_COMBAT_FIELDS),
      intent: snapshotOwnFields(topLevels.intent.value, LAW_RESPONSE_INTENT_FIELDS),
    };
    const granted = binding.api.claimControl(binding.jobId, {
      claimId: binding.claimId,
      holder: LAW_JOB_RESPONSE_HOLDER,
    });
    const claim = granted && granted.claim;
    if (!granted?.granted || !claim || claim.claimId !== binding.claimId
      || claim.holder !== LAW_JOB_RESPONSE_HOLDER || claim.claimedEntityId !== responder.id) {
      return false;
    }
    this._jobResponseClaims.set(binding.claimId, {
      claimId: binding.claimId,
      incidentId: incident.id,
      targetId: incident.attackerId,
      entityId: responder.id,
      entity: responder,
      data,
      jobId: binding.jobId,
      slotId: binding.slotId,
      entry: binding.entry,
      job: binding.entry.job,
      topLevels,
      snapshots,
      successors: null,
    });
    return true;
  },

  _sealJobResponder(responder, incident) {
    const binding = this._jobResponderBinding(responder, incident);
    if (binding === undefined) return true;
    if (!binding) return false;
    const record = this._jobResponseClaims.get(binding.claimId);
    const data = responder?.data;
    if (!record || record.entity !== responder || record.entry !== binding.entry
      || record.data !== data || !isObjectContainer(data?.ai)
      || !isObjectContainer(data?.combat) || !isObjectContainer(data?.intent)) {
      return false;
    }
    const successors = { ai: data.ai, combat: data.combat, intent: data.intent };
    if (record.successors) return responseSuccessorsMatch(record, data);
    record.successors = successors;
    return true;
  },

  _releaseJobResponse(record, _reason) {
    if (!record || !this._jobResponseClaims?.has(record.claimId)) return false;
    const api = this.helpers && this.helpers.npcJobs;
    if (!api || typeof api.controlClaim !== 'function') return false;
    const current = entityById(this.state, record.entityId);
    const entry = api && typeof api.byEntity === 'function' ? api.byEntity(record.entityId) : null;
    const liveClaim = api.controlClaim(record.jobId);
    const exactEntityAndJob = current === record.entity && current?.data === record.data
      && entry === record.entry && entry?.job === record.job && entry?.job?.id === record.jobId
      && entry?.entityId === record.entityId && current.data?.jobId === record.jobId;
    const exactAi = exactEntityAndJob && responseSuccessorMatches(record, current.data, 'ai');
    const exactCombat = exactEntityAndJob && responseSuccessorMatches(record, current.data, 'combat');
    const exactIntent = exactEntityAndJob && responseSuccessorMatches(record, current.data, 'intent');
    const fullCapturedBinding = exactEntityAndJob && exactAi && exactCombat && exactIntent;
    const ownsLiveClaim = liveClaim?.claimId === record.claimId
      && liveClaim.holder === LAW_JOB_RESPONSE_HOLDER
      && liveClaim.claimedEntityId === record.entityId;

    // Clear only through exact law-owned successors before returning movement ownership. A foreign
    // replacement in one slot must not prevent the other exact slots from being restored, and must
    // never be used as a target for law cleanup.
    if (ownsLiveClaim && exactCombat) clearCombatTarget(current.data.combat, record.targetId);
    if (ownsLiveClaim && exactIntent) clearFiringIntent(current.data.intent);
    if (ownsLiveClaim
      && api && typeof api.releaseControl === 'function') {
      releaseControlWithoutForeignWrites(api, record, current, fullCapturedBinding);
    }
    const remainingClaim = api.controlClaim(record.jobId);
    const releaseVerified = remainingClaim?.claimId !== record.claimId
      || remainingClaim?.holder !== LAW_JOB_RESPONSE_HOLDER
      || remainingClaim?.claimedEntityId !== record.entityId;
    if (!releaseVerified) return false;
    this._jobResponseClaims.delete(record.claimId);
    const exactEntityAndDataAfter = ownsLiveClaim
      && entityById(this.state, record.entityId) === current && current.data === record.data;
    if (exactEntityAndDataAfter && exactAi && responseSuccessorMatches(record, current.data, 'ai')) {
      restoreOwnFields(record.topLevels.ai.value, record.snapshots.ai);
      restoreOwnValue(current.data, 'ai', record.topLevels.ai);
      // The morale claim's own bookkeeping is not a snapped field; retire it with the response.
      if (current.data.ai) delete current.data.ai[SECURITY_RESPONSE_MORALE_RESTORE];
    }
    if (exactEntityAndDataAfter && exactCombat && responseSuccessorMatches(record, current.data, 'combat')) {
      restoreOwnFields(record.topLevels.combat.value, record.snapshots.combat);
      restoreOwnValue(current.data, 'combat', record.topLevels.combat);
    }
    if (exactEntityAndDataAfter && exactIntent && responseSuccessorMatches(record, current.data, 'intent')) {
      restoreOwnFields(record.topLevels.intent.value, record.snapshots.intent);
      restoreOwnValue(current.data, 'intent', record.topLevels.intent);
    }
    return true;
  },

  _claimRecordForEntity(entityId) {
    if (entityId == null) return null;
    for (const record of this._jobResponseClaims?.values() || []) {
      if (record.entityId === entityId) return record;
    }
    return null;
  },

  _releaseJobResponseFor(incidentId, entityId, reason) {
    for (const record of this._jobResponseClaims?.values() || []) {
      if (record.incidentId === incidentId && record.entityId === entityId) {
        return this._releaseJobResponse(record, reason);
      }
    }
    return false;
  },

  _releaseJobResponsesForEntity(entityId, reason) {
    if (entityId == null) return;
    for (const record of this._jobResponseClaims?.values() || []) {
      if (record.entityId === entityId) this._releaseJobResponse(record, reason);
    }
  },

  _releaseJobResponsesForSector(sectorId, reason) {
    for (const record of this._jobResponseClaims?.values() || []) {
      if (sectorId == null || record.entry?.sectorId === sectorId) this._releaseJobResponse(record, reason);
    }
  },

  _releaseAllJobResponses(reason) {
    for (const record of this._jobResponseClaims?.values() || []) this._releaseJobResponse(record, reason);
  },

  _reconcileJobResponses() {
    for (const record of this._jobResponseClaims?.values() || []) {
      const current = entityById(this.state, record.entityId);
      const entry = this.helpers?.npcJobs?.byEntity?.(record.entityId);
      const claim = this.helpers?.npcJobs?.controlClaim?.(record.jobId);
      if (current !== record.entity || current?.alive === false || entry !== record.entry
        || entry?.job !== record.job || claim?.claimId !== record.claimId
        || claim?.holder !== LAW_JOB_RESPONSE_HOLDER
        || current?.data !== record.data || !responseSuccessorsMatch(record, current?.data)
        || !hasLiveIncident(this.state, record.incidentId)
        || currentSectorId(this.state) !== CERES_ACTIVITY_SECTOR_ID) {
        this._releaseJobResponse(record, 'live_identity_changed');
      }
    }
  },

  _respondersFor(incident, victim) {
    const state = this.state;
    const station = entityById(state, incident.stationEntityId) || stationByPublicId(state, incident.stationId);
    const anchor = incident.rankFromVictim && victim && victim.pos
      ? victim.pos
      : (station && station.pos || victim && victim.pos);
    const actors = collectLivingWorldActors(state);
    const unfilteredCandidates = isLawful(victim) && victim.type === 'ship'
      ? [victim, ...actors]
      : actors;
    const candidates = unfilteredCandidates.filter((entity) => this._responseCandidateEligible(entity, incident));
    const out = rankLawfulResponders(candidates, anchor, {
      aggressorId: incident.attackerId,
      cap: incident.responderCap,
      radius: incident.radius + 1000,
    });
    const reserveCount = incident.reserveAllowed
      ? Math.max(0, incident.responderCap - out.length)
      : 0;
    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `law:${incident.id}`;
    const reserveGrant = reserveCount > 0 && budget && typeof budget.request === 'function'
      ? budget.request(reserveCount, requester)
      : reserveCount;
    if (reserveGrant < reserveCount) {
      const signature = `${reserveCount}:${reserveGrant}`;
      if (incident.spawnBudgetDeferred !== signature) {
        incident.spawnBudgetDeferred = signature;
        this._emit('law:responseDeferred', {
          incidentId: incident.id,
          stationId: incident.stationId,
          requested: reserveCount,
          granted: reserveGrant,
          reason: 'spawn_cap',
        });
      }
    } else {
      delete incident.spawnBudgetDeferred;
    }
    let spawnedCount = 0;
    for (let index = 0; index < reserveGrant && typeof this.helpers.spawnEntity === 'function'; index++) {
      const reserveOrdinal = Math.max(0, incident.nextReserveOrdinal | 0);
      const pos = reserveArrivalPoint({
        anchor,
        aggressorPos: entityById(state, incident.attackerId)?.pos,
        jurisdictionRadius: incident.radius,
        seed: state.meta && state.meta.seed || 1,
        incidentId: `${incident.id}:${reserveOrdinal}`,
        // PQ-138.00: reserves launch from the jurisdiction's own station when it is in the world,
        // so the pursuing half of the witness choice is on camera instead of 2000 WU out.
        station: station && station.pos
          ? {
            pos: station.pos,
            launchRadius: Math.max(
              Number(station.data && station.data.dockRadius) || 0,
              Number(station.radius) || 0,
            ),
          }
          : null,
      });
      const spec = makeEnemySpawnSpec('patrol_lawman', 3, pos, {
        factionId: incident.factionId || 'faction_scn',
        motive: 'jurisdiction_enforcement',
        engagementTrigger: 'security_response',
        zoneId: `jurisdiction:${incident.stationId}`,
        approachTelegraph: 'patrol_challenge',
        noFireResponseWindowS: incident.challengeWindowS,
        startedTick: state.tick,
      });
      let spawned;
      try {
        spawned = this.helpers.spawnEntity(spec);
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') {
          budget.releaseSome(requester, reserveGrant - spawnedCount);
        }
        throw error;
      }
      if (spawned) {
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(spawned.id, requester);
        const ai = spawned.data && spawned.data.ai;
        if (ai) ai.spawnContext = 'security_response';
        out.push(spawned);
        spawnedCount++;
        incident.nextReserveOrdinal = reserveOrdinal + 1;
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawnedCount < reserveGrant) {
      budget.releaseSome(requester, reserveGrant - spawnedCount);
    }
    return out;
  },

  _dispatchIncident(incident, victim, attacker) {
    const responders = this._respondersFor(incident, victim);
    const dispatched = [];
    incident.dispatchedAt = this.state.simTime || 0;
    for (const responder of responders) {
      if (incident.responderIds.includes(responder.id)) continue;
      if (!this._claimJobResponder(responder, incident)) continue;
      this._authorizeResponder(responder, attacker, incident, 'security_response');
      if (!this._sealJobResponder(responder, incident)) {
        this._releaseJobResponseFor(incident.id, responder.id, 'authorization_identity_changed');
        continue;
      }
      incident.responderIds.push(responder.id);
      dispatched.push(responder);
    }
    const hasLiveResponse = incident.responderIds.some((id) => {
      const responder = entityById(this.state, id);
      return responder && responder.alive !== false;
    });
    if (incident.spawnBudgetDeferred) {
      // Critical station response is deferred, never discarded or allowed through the cap. The
      // incident remains retryable (distress or a partial response) on the bounded cadence.
      incident.dispatchAt = (this.state.simTime || 0) + 0.25;
      if (!dispatched.length) {
        incident.dispatchedAt = hasLiveResponse ? incident.dispatchedAt : null;
        incident.status = hasLiveResponse ? 'responding' : 'distress';
        if (hasLiveResponse) this._reconcileWitnessChoice(incident);
        return;
      }
    } else if (!dispatched.length && hasLiveResponse) {
      incident.status = 'responding';
      this._reconcileWitnessChoice(incident);
      return;
    }
    incident.status = dispatched.length ? 'responding' : 'monitoring';
    const payload = publicIncident(incident);
    this._emit('law:dispatchStarted', payload);
    this._lawResponse(dispatched.length ? 'patrol_dispatched' : 'dispatch_unavailable', {
      incidentId: incident.id, stationId: incident.stationId, factionId: incident.factionId,
      cause: incident.cause, attackerId: incident.attackerId, victimId: incident.victimId,
      responderIds: incident.responderIds.slice(),
    });
    if (hasLiveResponse) {
      this._reconcileWitnessChoice(incident);
    }
    if (dispatched.length) {
      this._say('alert', `CONTROL: ${dispatched.length} patrol unit${dispatched.length === 1 ? '' : 's'} intercepting the aggressor.`, `law:dispatch:${incident.id}`, incident.factionId);
      this._recordReceipt({
        incidentId: incident.id, cause: incident.cause, outcome: 'patrol_dispatched',
        attackerId: incident.attackerId, targetId: incident.victimId, stationId: incident.stationId,
        text: `PATROL DISPATCHED — ${dispatched.length} unit${dispatched.length === 1 ? '' : 's'} intercepting the aggressor.`,
      });
    } else {
      this._say('alert', 'CONTROL: no patrol in range. Distress remains active.', `law:dispatch:none:${incident.id}`, incident.factionId);
      this._recordReceipt({
        incidentId: incident.id, cause: incident.cause, outcome: 'dispatch_unavailable',
        attackerId: incident.attackerId, targetId: incident.victimId, stationId: incident.stationId,
        text: 'NO PATROL IN RANGE — distress remains active.',
      });
    }
  },

  _authorizeResponder(responder, attacker, incident, motive) {
    if (!responder || !attacker) return;
    const state = this.state;
    const data = responder.data || (responder.data = {});
    const ai = data.ai || (data.ai = {});
    ai.lawful = true;
    ai.passive = false;
    ai.securityTargetId = attacker.id;
    // INF-029: the reported track starts from last-seen information, not a live feed. Snapshot
    // the offender's position at dispatch; the perception seam keeps reporting this scene while
    // live sightings refresh it, so breaking observation changes pursuit and reacquisition
    // restores accuracy. Save-safe plain data next to the target id it describes.
    if (attacker.pos) {
      ai.securityTargetPos = { x: Number(attacker.pos.x) || 0, z: Number(attacker.pos.z) || 0 };
    } else {
      delete ai.securityTargetPos;
    }
    // A dispatched enforcement action does not withdraw on attrition: the incident's own
    // stand-down decides when the response ends, not squad morale. Without this, responders
    // catching stray fire from a suspect's sustained assault rout before the exchange resolves.
    // The exemption is claimed, not assigned: snapshot any authored immunity so stand-down can
    // return the hull to the morale contract it carried before the call went out (re-authorizing
    // a chaser must not snapshot the claim's own true over the original).
    if (!ai[SECURITY_RESPONSE_MORALE_RESTORE]) {
      ai[SECURITY_RESPONSE_MORALE_RESTORE] = ownSnapshot(ai, 'moraleImmune');
    }
    ai.moraleImmune = true;
    ai.witnessRole = 'chase';
    if (incident) ai.witnessIncidentId = incident.id;
    ai.motive = motive === 'self_defense' ? 'self_defense' : 'jurisdiction_enforcement';
    ai.engagementTrigger = motive === 'self_defense' ? 'player_attack' : 'security_response';
    ai.zoneId = incident ? `jurisdiction:${incident.stationId}` : String(ai.zoneId || 'patrol_route');
    ai.approachTelegraph = 'patrol_challenge';
    ai.noFireResponseWindowS = incident ? incident.challengeWindowS : 1;
    // Execution authorization fail-closes on a missing combat doctrine, so a claimed
    // responder spawned without one (ambient squad patrol) would orbit the offender forever
    // without ever firing. Outfitting for response includes a doctrine: keep an authored
    // one, else the faction profile's, else the patrol flyby. Activity/ROE still gate fire.
    if (!normalizeCombatDoctrineId(ai.combatDoctrineId)) {
      ai.combatDoctrineId = normalizeCombatDoctrineId(ai.factionPresenceDoctrine && ai.factionPresenceDoctrine.combatDoctrineId)
        || CombatDoctrineId.INTERCEPTOR_FLYBY;
    }
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    const stationPos = incident && (stationByPublicId(state, incident.stationId)?.pos);
    const victimPos = incident && entityById(state, incident.victimId)?.pos;
    const anchor = incident
      ? (incident.rankFromVictim
        ? (victimPos || responder.pos)
        : (stationPos || responder.pos))
      : responder.pos;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: `security_response:${incident ? incident.id : 'self_defense'}`,
      anchor,
      leashRadius: incident ? incident.radius + 900 : 2200,
      startedTick: state.tick | 0,
      targetId: attacker.id,
      encounterId: incident && incident.id,
    });
    const combat = data.combat || (data.combat = {});
    combat.targetId = attacker.id;
    const intent = data.intent || (data.intent = {});
    intent.fire = false;
  },

  _updateIncident(key, incident) {
    if (!incident || !['distress', 'responding', 'monitoring'].includes(incident.status)) return;
    const state = this.state;
    const attacker = entityById(state, incident.attackerId);
    const victim = entityById(state, incident.victimId);
    const station = entityById(state, incident.stationEntityId) || stationByPublicId(state, incident.stationId);
    const now = state.simTime || 0;
    let outcome = null;
    if (!attacker || attacker.alive === false) outcome = 'threat_cleared';
    else if ((incident.status === 'distress'
      || (incident.status === 'responding' && incident.spawnBudgetDeferred))
      && now >= incident.dispatchAt) {
      this._dispatchIncident(incident, victim || station, attacker);
    }
    else if (station && distance2(attacker.pos, incidentRingOrigin(incident, victim, station)) > Math.pow(incident.radius + RESPONSE_CLEARANCE, 2)
      && now - incident.lastDamageAt >= RESPONSE_GRACE_S
      && !(attacker.id === state.playerId && isPlayerWanted(state))) {
      outcome = 'disengaged';
    }
    if (!outcome) {
      this._reconcileWitnessChoice(incident);
      return;
    }
    incident.status = 'resolved';
    incident.outcome = outcome;
    incident.resolvedAt = now;
    for (const id of incident.responderIds) {
      this._clearResponder(entityById(state, id), incident.attackerId, incident.id, id);
    }
    delete ensureState(state).incidents[key];
    this._say('info', 'CONTROL: threat clear. Station approach secure.', `law:clear:${incident.id}`, incident.factionId);
    this._emit('law:incidentResolved', publicIncident(incident));
    this._lawResponse('incident_resolved', {
      incidentId: incident.id, stationId: incident.stationId, factionId: incident.factionId,
      cause: incident.cause, attackerId: incident.attackerId, victimId: incident.victimId,
      outcome,
    });
    this._emit('encounter:receipt', {
      encounterId: incident.id,
      shape: 'security_response',
      outcome,
      text: outcome === 'disengaged'
        ? 'CONTACT BROKEN — patrol stood down after the station ring cleared.'
        : 'THREAT CLEARED — station approach secure.',
      t: now,
    });
  },

  _clearResponder(responder, targetId, incidentId = null, responderId = responder?.id) {
    if (incidentId != null && this._releaseJobResponseFor(incidentId, responderId, 'incident_resolved')) return;
    if (!responder || !isLawful(responder)) return;
    const state = this.state;
    const data = responder.data || (responder.data = {});
    const record = this._claimRecordForEntity(responderId);
    const exactAi = !record || responseSuccessorMatches(record, data, 'ai');
    const exactCombat = !record || responseSuccessorMatches(record, data, 'combat');
    const exactIntent = !record || responseSuccessorMatches(record, data, 'intent');

    if (exactAi) {
      const ai = data.ai || (data.ai = {});
      const matchesWitnessIncident = incidentId != null && ai.witnessIncidentId === incidentId;
      if (matchesWitnessIncident || ai.securityTargetId === targetId) {
        const isHolder = matchesWitnessIncident && ai.witnessRole === 'hold';
        ai.securityTargetId = null;
        ai.securityTargetPos = null;
        releaseResponseMoraleClaim(ai);
        ai.witnessRole = null;
        ai.witnessIncidentId = null;
        ai.passive = false;
        ai.engagementTrigger = 'wanted_status';
        ai.motive = 'law_enforcement';
        ai.roe = RulesOfEngagement.LAWFUL_WANTED_ONLY;
        let stationPos = null;
        if (incidentId) {
          const inc = ensureState(state).incidents[incidentId]
            || Object.values(ensureState(state).incidents || {}).find((i) => i && i.id === incidentId);
          const station = inc && (entityById(state, inc.stationEntityId) || stationByPublicId(state, inc.stationId));
          if (station && station.pos) stationPos = station.pos;
        }
        if (!stationPos && ai.zoneId && ai.zoneId.startsWith('jurisdiction:')) {
          const st = stationByPublicId(state, ai.zoneId.slice('jurisdiction:'.length));
          if (st && st.pos) stationPos = st.pos;
        }
        const returnAnchor = (isHolder && stationPos)
          ? { x: stationPos.x, z: stationPos.z }
          : (ai.activity && ai.activity.anchor || stationPos || responder.pos);
        ai.activity = normalizeActivity({
          kind: ActivityKind.RETURN_TO_ANCHOR,
          reason: isHolder ? 'security_witness:return' : 'security_response:clear',
          anchor: returnAnchor,
          leashRadius: ai.activity && ai.activity.leashRadius || 2600,
          startedTick: state.tick | 0,
        });
      }
    }

    if (exactCombat && data.combat) clearCombatTarget(data.combat, targetId);
    if (exactIntent && data.intent) clearFiringIntent(data.intent);
  },

  _handleAftermathWreckSpawned(payload) {
    const state = this.state;
    if (!state) return;
    const own = ensureState(state);
    const incidents = Object.values(own.incidents || {});
    if (!incidents.length) return;

    const wreckEntity = entityById(state, payload && payload.entityId);
    if (!wreckEntity || wreckEntity.alive === false) return;
    if (wreckEntity.data && wreckEntity.data.runCohort === 'survival') return;

    const data = wreckEntity.data || {};
    const aftermath = data.aftermath || {};
    const victimId = aftermath.victimId != null ? aftermath.victimId : data.victimId;
    const killerId = aftermath.killerId != null ? aftermath.killerId : data.killerId;
    const markerId = aftermath.markerId != null ? aftermath.markerId : (payload && payload.markerId) || data.markerId || null;
    const salvagePool = aftermath.salvagePool || data.salvagePool || null;

    if (victimId != null) {
      const victim = entityById(state, victimId);
      if (victim && victim.data && victim.data.runCohort === 'survival') return;
    }

    const pos = wreckEntity.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const sectorId = (payload && payload.sectorId) || aftermath.sectorId || (state.world && state.world.currentSectorId);
    const at = Number.isFinite(state.simTime) ? state.simTime : 0;

    const incident = this._findMatchingIncident({ victimId, killerId, sectorId, at });
    if (!incident) return;

    let valuable = false;
    if (salvagePool && typeof salvagePool === 'object') {
      valuable = Object.values(salvagePool).some((q) => Number(q) > 0);
    }
    if (!valuable && Array.isArray(data.loot) && data.loot.length > 0) {
      valuable = true;
    }

    const existingAnchor = incident.victimAnchor;
    if (existingAnchor) {
      existingAnchor.wreckEntityId = wreckEntity.id;
      if (markerId != null) existingAnchor.markerId = String(markerId);
      if (valuable) existingAnchor.valuable = true;
      existingAnchor.x = Number(pos.x);
      existingAnchor.z = Number(pos.z);
    } else {
      incident.victimAnchor = {
        x: Number(pos.x),
        z: Number(pos.z),
        markerId: markerId != null ? String(markerId) : null,
        wreckEntityId: wreckEntity.id,
        podEntityId: null,
        valuable: Boolean(valuable),
        at,
      };
    }

    this._reconcileWitnessChoice(incident);
  },

  _handleSurvivorPodEjected(payload) {
    const state = this.state;
    if (!state) return;
    const own = ensureState(state);
    const incidents = Object.values(own.incidents || {});
    if (!incidents.length) return;

    const podEntity = entityById(state, payload && (payload.entityId ?? payload.entity?.id)) || (payload && payload.entity);
    if (!podEntity || podEntity.alive === false) return;
    if (podEntity.data && podEntity.data.runCohort === 'survival') return;

    const victimId = payload && payload.victimId != null ? payload.victimId : (podEntity.data && podEntity.data.sourceVictimId);
    if (victimId != null) {
      const victim = entityById(state, victimId);
      if (victim && victim.data && victim.data.runCohort === 'survival') return;
    }

    const pos = podEntity.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const sectorId = (payload && payload.sectorId) || (state.world && state.world.currentSectorId);
    const at = Number.isFinite(state.simTime) ? state.simTime : 0;

    const incident = this._findMatchingIncident({ victimId, killerId: null, sectorId, at });
    if (!incident) return;

    const existingAnchor = incident.victimAnchor;
    if (existingAnchor) {
      existingAnchor.podEntityId = podEntity.id;
      existingAnchor.valuable = true;
      existingAnchor.x = Number(pos.x);
      existingAnchor.z = Number(pos.z);
    } else {
      incident.victimAnchor = {
        x: Number(pos.x),
        z: Number(pos.z),
        markerId: null,
        wreckEntityId: null,
        podEntityId: podEntity.id,
        valuable: true,
        at,
      };
    }

    this._reconcileWitnessChoice(incident);
  },

  _findMatchingIncident({ victimId, killerId, sectorId, at }) {
    const state = this.state;
    const own = ensureState(state);
    const incidents = Object.values(own.incidents || {});
    if (!incidents.length) return null;

    if (victimId != null) {
      const direct = incidents.find((inc) => inc && inc.victimId === victimId && inc.status !== 'resolved');
      if (direct) return direct;
    }

    if (killerId != null) {
      const candidates = incidents.filter((inc) => {
        if (!inc || inc.status === 'resolved') return false;
        if (inc.victimAnchor) return false;
        if (inc.attackerId !== killerId) return false;
        const station = entityById(state, inc.stationEntityId) || stationByPublicId(state, inc.stationId);
        const incSectorId = station?.data?.sectorId || station?.sectorId || (state.world && state.world.currentSectorId);
        if (sectorId && incSectorId && incSectorId !== sectorId) return false;
        const dt = Math.abs(((inc.lastDamageAt != null ? inc.lastDamageAt : inc.startedAt) || 0) - at);
        return dt <= RESPONSE_GRACE_S;
      });
      if (candidates.length === 1) return candidates[0];
      return null;
    }

    return null;
  },

  _reconcileWitnessChoice(incident) {
    if (!incident || incident.status === 'resolved') return;
    const state = this.state;
    const attacker = entityById(state, incident.attackerId);

    const liveResponders = [];
    for (const id of incident.responderIds) {
      const responder = entityById(state, id);
      if (!responder || responder.alive === false || !isLawful(responder)) continue;
      // One responder, one incident: a unit bound to another live incident stays foreign-owned.
      // Shared responderIds are how a busy jurisdiction retasks the same patrols; without the
      // guard each incident's reconcile flips securityTargetId back to its own attacker and
      // _authorizeResponder resets activity.startedTick, so the no-fire response window never
      // elapses and the shared units orbit every offender without firing (live route 2026-09-19:
      // two unresolved npc_piracy incidents plus the player_piracy incident all listed the same
      // three responders; incoming hits froze for 15000+ ticks with every incident 'responding').
      const boundTo = responder.data && responder.data.ai && responder.data.ai.witnessIncidentId;
      if (boundTo != null && boundTo !== incident.id && hasLiveIncident(state, boundTo)) continue;
      liveResponders.push(responder);
    }

    const anchor = incident.victimAnchor;
    const hasValidAnchor = !!(anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z));

    if (liveResponders.length < 2 || !hasValidAnchor) {
      incident._lastWitnessChoice = null;
      for (const responder of liveResponders) {
        const data = responder.data || (responder.data = {});
        const ai = data.ai || (data.ai = {});
        ai.witnessRole = 'chase';
        ai.witnessIncidentId = incident.id;
        if (ai.securityTargetId !== incident.attackerId && attacker && attacker.alive !== false) {
          this._authorizeResponder(responder, attacker, incident, 'security_response');
          ai.witnessRole = 'chase';
          ai.witnessIncidentId = incident.id;
        }
      }
      return;
    }

    let anchorPos = { x: anchor.x, z: anchor.z };
    if (anchor.podEntityId != null) {
      const livePod = entityById(state, anchor.podEntityId);
      if (livePod && livePod.alive !== false && livePod.pos && Number.isFinite(livePod.pos.x) && Number.isFinite(livePod.pos.z)) {
        anchorPos = { x: livePod.pos.x, z: livePod.pos.z };
        anchor.x = livePod.pos.x;
        anchor.z = livePod.pos.z;
      }
    } else if (anchor.wreckEntityId != null) {
      const liveWreck = entityById(state, anchor.wreckEntityId);
      if (liveWreck && liveWreck.alive !== false && liveWreck.pos && Number.isFinite(liveWreck.pos.x) && Number.isFinite(liveWreck.pos.z)) {
        anchorPos = { x: liveWreck.pos.x, z: liveWreck.pos.z };
        anchor.x = liveWreck.pos.x;
        anchor.z = liveWreck.pos.z;
      }
    }

    const lastChoice = incident._lastWitnessChoice;
    const prevHolderId = lastChoice?.decision === 'split' ? lastChoice.holderId : null;
    const prevChaserIds = lastChoice?.decision === 'split' ? lastChoice.chaserIds : null;

    let holder = null;
    let chasers = null;

    const prevCandidateIds = (prevHolderId != null && prevChaserIds != null)
      ? new Set([prevHolderId, ...prevChaserIds])
      : null;
    const candidateSetUnchanged = prevCandidateIds != null
      && prevCandidateIds.size === liveResponders.length
      && liveResponders.every((r) => prevCandidateIds.has(r.id));
    const existingHolderLive = candidateSetUnchanged && liveResponders.some((r) => r.id === prevHolderId);

    if (existingHolderLive) {
      holder = liveResponders.find((r) => r.id === prevHolderId);
      chasers = prevChaserIds.map((id) => liveResponders.find((r) => r.id === id)).filter(Boolean);
    } else {
      const sorted = liveResponders.slice().sort((a, b) => {
        const da = distance2(a.pos, anchorPos);
        const db = distance2(b.pos, anchorPos);
        if (Math.abs(da - db) > 1e-4) {
          return da - db;
        }
        return a.id - b.id;
      });
      holder = sorted[0];
      chasers = sorted.slice(1);
    }

    const holderId = holder.id;
    const chaserIds = chasers.map((c) => c.id);

    const isMateriallyUnchanged = lastChoice
      && lastChoice.decision === 'split'
      && lastChoice.holderId === holderId
      && lastChoice.chaserIds.length === chaserIds.length
      && lastChoice.chaserIds.every((id, idx) => id === chaserIds[idx]);

    const holderData = holder.data || (holder.data = {});
    const holderAi = holderData.ai || (holderData.ai = {});

    // PQ-138.00: the holder's job is to stand over the body, and LOITER is a HOLD maneuver — a
    // holder chosen 300 WU away would hold position out there and never arrive (measured on the
    // live route 2026-09-12: reserve holder launched at the dock ring, 344 WU from the wreck, still
    // 450 WU away 22 s later). Until it is within the standoff it TRANSITs to the wreck itself (a
    // concrete target, so the formation seek closes on the drifting body); once there it loiters.
    const WITNESS_HOLD_STANDOFF_WU = 90;
    const holdTargetId = anchor.wreckEntityId != null ? anchor.wreckEntityId : anchor.podEntityId;
    const holdTarget = holdTargetId != null ? entityById(state, holdTargetId) : null;
    const holderDistance = Math.hypot(holder.pos.x - anchorPos.x, holder.pos.z - anchorPos.z);
    const holderApproaches = holderDistance > WITNESS_HOLD_STANDOFF_WU
      && !!holdTarget && holdTarget.alive !== false;
    // SCAN_APPROACH is the lawful approach maneuver (an INTERCEPT that closes to preferredRange at
    // speed); TRANSIT would be a formation crawl that a wreck still carrying its victim's momentum
    // outruns (measured: holder at 7–47 WU/s while the wreck receded 683 → 986 WU over 20 s).
    const holderActivityKind = holderApproaches ? ActivityKind.SCAN_APPROACH : ActivityKind.LOITER;
    const holderActivityFor = (startedTick) => normalizeActivity(holderApproaches
      ? {
        kind: ActivityKind.SCAN_APPROACH,
        reason: `security_witness:hold:approach:${incident.id}`,
        anchor: { x: anchorPos.x, z: anchorPos.z },
        leashRadius: 400,
        startedTick,
        targetId: holdTargetId,
        preferredRange: 60,
        encounterId: incident.id,
      }
      : {
        kind: ActivityKind.LOITER,
        reason: `security_witness:hold:${incident.id}`,
        anchor: { x: anchorPos.x, z: anchorPos.z },
        leashRadius: 400,
        startedTick,
        targetId: null,
        encounterId: incident.id,
      });

    if (!isMateriallyUnchanged) {
      const priorRole = holderAi.witnessRole;
      const priorActivity = holderAi.activity;
      const existingStartedTick = (priorRole === 'hold'
        && (priorActivity?.kind === ActivityKind.LOITER || priorActivity?.kind === ActivityKind.SCAN_APPROACH)
        && Number.isInteger(priorActivity.startedTick))
        ? priorActivity.startedTick
        : (state.tick | 0);

      holderAi.lawful = true;
      holderAi.passive = false;
      holderAi.securityTargetId = null;
      holderAi.securityTargetPos = null;
      releaseResponseMoraleClaim(holderAi);
      holderAi.witnessRole = 'hold';
      holderAi.witnessIncidentId = incident.id;
      holderAi.motive = 'jurisdiction_enforcement';
      holderAi.roe = RulesOfEngagement.DEFENSIVE;
      holderAi.activity = holderActivityFor(existingStartedTick);
      clearTarget(holder, null);

      for (const chaser of chasers) {
        const chaserData = chaser.data || (chaser.data = {});
        const chaserAi = chaserData.ai || (chaserData.ai = {});
        const roleChanged = chaserAi.witnessRole !== 'chase' || chaserAi.witnessIncidentId !== incident.id;
        if (roleChanged || (chaserAi.securityTargetId !== incident.attackerId && attacker && attacker.alive !== false)) {
          this._authorizeResponder(chaser, attacker, incident, 'security_response');
        }
        chaserAi.witnessRole = 'chase';
        chaserAi.witnessIncidentId = incident.id;
      }

      incident._lastWitnessChoice = {
        decision: 'split',
        holderId,
        chaserIds: chaserIds.slice(),
      };
      const choicePayload = {
        incidentId: incident.id,
        decision: 'split',
        holderId,
        chaserIds,
        anchor: { x: anchorPos.x, z: anchorPos.z },
        reason: 'wreck_hold_and_pursuit',
        simTime: state.simTime || 0,
        t: state.simTime || 0,
      };
      this._emit('law:witnessChoice', choicePayload);
    } else {
      if (holderAi.securityTargetId != null) {
        holderAi.securityTargetId = null;
        holderAi.securityTargetPos = null;
        releaseResponseMoraleClaim(holderAi);
      }
      if (holderData.combat && (holderData.combat.targetId === incident.attackerId || holderData.combat.lockTarget === incident.attackerId)) {
        clearCombatTarget(holderData.combat, incident.attackerId);
      }
      if (holderData.intent && holderData.intent.fire && holderData.combat?.targetId == null) {
        clearFiringIntent(holderData.intent);
      }
      if (holderAi.activity) {
        const currentAnchor = holderAi.activity.anchor;
        if (holderAi.activity.kind !== holderActivityKind) {
          // Arrived at (or drifted off) the body: swap approach <-> hold, keeping the clock.
          holderAi.activity = holderActivityFor(Number.isInteger(holderAi.activity.startedTick)
            ? holderAi.activity.startedTick
            : (state.tick | 0));
        } else if (!currentAnchor || currentAnchor.x !== anchorPos.x || currentAnchor.z !== anchorPos.z) {
          holderAi.activity = normalizeActivity({
            ...holderAi.activity,
            anchor: { x: anchorPos.x, z: anchorPos.z },
          });
        }
      }
      for (const chaser of chasers) {
        const chaserData = chaser.data || (chaser.data = {});
        const chaserAi = chaserData.ai || (chaserData.ai = {});
        if (chaserAi.witnessRole !== 'chase') chaserAi.witnessRole = 'chase';
        if (chaserAi.witnessIncidentId !== incident.id) chaserAi.witnessIncidentId = incident.id;
        if (chaserAi.securityTargetId !== incident.attackerId && attacker && attacker.alive !== false) {
          this._authorizeResponder(chaser, attacker, incident, 'security_response');
          chaserAi.witnessRole = 'chase';
          chaserAi.witnessIncidentId = incident.id;
        }
      }
    }
  },

  _recordReceipt(receipt) {
    const state = this.state;
    const own = ensureState(state);
    const row = { ...receipt, t: state.simTime || 0, tick: state.tick | 0 };
    own.receipts.push(row);
    while (own.receipts.length > RECEIPT_CAP) own.receipts.shift();
    this._emit('law:incidentReceipt', row);
  },

  // ── PQ-019B: witness-validated incident intake ────────────────────────────────────────────────
  //
  // The `law:reportIncident`-class owner entry. A non-law owner (the heist mission) can report that
  // a crime happened; only THIS system decides whether the law recognizes it.
  //
  // Deliberately a SEPARATE entry point from `_openIncident`, for two reasons that are properties of
  // the live code rather than preferences:
  //
  //   1. `_openIncident` keys on a LIVE ENTITY ID (`${stationId}:${attacker.id}`). Entity ids are not
  //      stable across save/load, so it cannot answer "is this the same incident I already logged?"
  //      A reported incident is keyed by a caller-supplied stable `reportId` instead.
  //   2. `_openIncident` leads to `_dispatchIncident` -> `_respondersFor`, which SPAWNS
  //      `patrol_lawman` hulls when `reserveAllowed`. The packet forbids inventing a responder:
  //      "No available patrol is a valid, visible outcome recorded by law; it is not permission to
  //      spawn a fake job-origin responder." This path never calls `_respondersFor`, so that rule is
  //      structural here, not a policy someone must remember.
  //
  // It only OBSERVES and RECORDS. It never steers, authorizes, or spawns anyone: enlisting a real
  // patrol is the NPC-job control lease's job, using the responder ids reported here.
  reportIncident(request = {}) {
    const state = this.state;
    const reportId = cleanLawId(request.reportId);
    const kind = cleanLawId(request.kind);
    const offenderStableId = cleanLawId(request.offenderStableId);
    const payloadStableId = cleanLawId(request.payloadStableId);
    const causalTick = Number.isInteger(request.causalTick) && request.causalTick >= 0
      ? request.causalTick
      : null;
    const pos = finiteLawPoint(request.pos);
    if (!state || !reportId || !kind || !offenderStableId || !payloadStableId
      || causalTick === null || !pos) {
      return this._denyIncidentReport('invalid_report', { reportId, kind, causalTick });
    }

    // Idempotency key. A duplicate report returns the SAME receipt without re-querying the world,
    // so a retry after a dropped callback cannot double-log a crime. The lookup deliberately does
    // NOT create the ledger: a denied report must leave no trace in owned state.
    const existing = readReportedIncident(state, reportId);
    if (existing) {
      this._emit('law:reportIncidentReceipt', existing);
      return existing;
    }

    // Jurisdiction: the live authority owner decides, from the incident position.
    // Ceres/Ambush theft sits outside the station protection ring; reuse the same
    // ceresDistressJurisdiction helper npc_piracy already uses for pirate→loaded hauler.
    const victim = resolveIncidentVictim(state, request);
    const jurisdiction = protectedStationAt(state, { pos })
      || ceresDistressJurisdiction(state, victim)
      || (kind === 'payload_theft'
        ? ceresDistressJurisdiction(state, findCivilianHauler(state))
        : null);
    if (!jurisdiction) {
      return this._denyIncidentReport('no_jurisdiction', { reportId, kind, causalTick });
    }

    // Witnesses: a crime nobody can see is not a crime the law will act on.
    const witnesses = lawWitnessesNear(state, {
      pos,
      offenderEntityId: request.offenderEntityId,
      radius: LAW_INCIDENT_WITNESS_RADIUS,
    });
    if (witnesses.length === 0) {
      return this._denyIncidentReport('no_witness', { reportId, kind, causalTick });
    }

    // Responders are RANKED FROM WHAT ALREADY EXISTS. `rankLawfulResponders` is a pure filter over
    // the live entity list; it cannot create a hull. An empty result is a first-class recorded
    // outcome, not a reason to manufacture a patrol.
    const policy = authorityResponsePolicy(effectiveLawSecurity(state));
    const responders = rankLawfulResponders(collectLivingWorldActors(state), pos, {
      aggressorId: request.offenderEntityId,
      cap: policy.responderCap,
      radius: jurisdiction.radius + LAW_INCIDENT_RESPONDER_MARGIN,
    });

    const receipt = Object.freeze({
      accepted: true,
      incidentReceiptId: `law:incident:${hash32(
        reportId, kind, offenderStableId, payloadStableId, causalTick,
      ).toString(36)}`,
      reportId,
      kind,
      offenderStableId,
      offenderEntityId: request.offenderEntityId == null ? null : request.offenderEntityId,
      payloadStableId,
      causalTick,
      stationId: jurisdiction.stationId,
      factionId: jurisdiction.factionId,
      jurisdictionRadius: jurisdiction.radius,
      witnessCount: witnesses.length,
      witnessStableIds: Object.freeze(witnesses.map((w) => w.stableId)),
      responderAvailability: responders.length > 0 ? 'available' : 'none_in_range',
      responderEntityIds: Object.freeze(responders.map((r) => r.id)),
      responderCap: policy.responderCap,
      // The single fact the heat owner is allowed to act on. False can never be produced by an
      // accepted receipt: an unwitnessed or unpoliced report is denied above, never downgraded.
      validatedWitnessedTheft: true,
      source: 'lawSecurity',
    });

    storeReportedIncident(state, receipt);

    // Visible in the law owner's own receipt ledger, including the "nobody is coming" case — which
    // the player must be able to observe as an outcome rather than as silence.
    this._recordReceipt({
      incidentId: receipt.incidentReceiptId,
      cause: kind,
      outcome: responders.length > 0 ? 'reported_incident_logged' : 'dispatch_unavailable',
      attackerId: request.offenderEntityId == null ? null : request.offenderEntityId,
      targetId: null,
      stationId: jurisdiction.stationId,
      text: responders.length > 0
        ? `THEFT REPORTED — ${witnesses.length} witness${witnesses.length === 1 ? '' : 'es'}; ${responders.length} unit${responders.length === 1 ? '' : 's'} in range.`
        : `THEFT REPORTED — ${witnesses.length} witness${witnesses.length === 1 ? '' : 'es'}; no patrol in range.`,
    });
    this._emit('law:reportIncidentReceipt', receipt);
    this._lawResponse('crime_validated', {
      kind: receipt.kind,
      incidentReceiptId: receipt.incidentReceiptId,
      stationId: receipt.stationId,
      witnessCount: receipt.witnessCount,
      responderAvailability: receipt.responderAvailability,
    });
    return receipt;
  },

  /**
   * An explicit refusal. Denials are deliberately NOT cached: a denial describes the world at one
   * tick, and caching "no patrol could see you" would freeze a momentary absence into a permanent
   * licence. Only accepted receipts are idempotent.
   */
  _denyIncidentReport(reason, { reportId, kind, causalTick }) {
    const denial = Object.freeze({
      accepted: false,
      reason,
      reportId: reportId || null,
      kind: kind || null,
      causalTick: causalTick === undefined ? null : causalTick,
      validatedWitnessedTheft: false,
      source: 'lawSecurity',
    });
    this._emit('law:reportIncidentReceipt', denial);
    this._lawResponse('report_denied', { reason, kind: denial.kind, reportId: denial.reportId });
    return denial;
  },

  // ── PQ-WANTED-steal-pod: jettisoned payload whose owner is not the player ──────────────────
  //
  // EncounterDirector freight-custody theft already reports through reportIncident. This path is
  // only jettisoned `payload` pods (`spawnJettisonedCargoPod`). Own-jettison never enters intake.

  _handleStolenCargoPodCollect(payload) {
    if (!payload) return null;
    const state = this.state;
    if (!state || state.playerId == null) return null;
    if (!sameLawEntityId(payload.collectorId, state.playerId)) return null;
    if (payload.acceptedAmount != null && !(Number(payload.acceptedAmount) > 0)) return null;
    return this._reportStolenCargoPod(
      entityById(state, payload.pickupId ?? payload.entityId ?? payload.targetId),
    );
  },

  _handleStolenCargoPodLatch(payload) {
    if (!payload) return null;
    const state = this.state;
    if (!state || state.playerId == null) return null;
    return this._reportStolenCargoPod(entityById(state, payload.targetId));
  },

  _reportStolenCargoPod(entity) {
    const state = this.state;
    const isManifest = isCivilianManifestPayload(entity);
    if ((!isJettisonedCargoPod(entity) && !isManifest)
      || (entity.data && entity.data.freightCustodyPod)) return null;
    const ownerId = cargoPodOwnerId(entity);
    if (ownerId == null || sameLawEntityId(ownerId, state.playerId)) return null;
    // A manifest pod is the dead victim's cargo. If the kill itself was already adjudicated a
    // crime, the murder receipt already priced the scene — a second receipt would be double
    // jeopardy. A lawful or unwitnessed kill leaves the pod an honest salvage claim instead.
    // The ledger scan (not just the reportId probe) keeps the match alive when the victim
    // entity has already been culled from state.entities.
    if (isManifest) {
      const victim = entityById(state, ownerId);
      const killReportId = cleanLawId(`kill:${victimStableIdOf(victim, { id: ownerId })}`);
      const killReceipt = killReportId && readReportedIncident(state, killReportId);
      const ledger = state.lawSecurity && state.lawSecurity.reportedIncidents;
      const priced = (killReceipt && killReceipt.accepted === true && killReceipt.validatedCrime === true)
        || (ledger && typeof ledger === 'object' && Object.values(ledger).some((r) => r
          && r.accepted === true && r.validatedCrime === true
          && (sameLawEntityId(r.victimEntityId, ownerId) || r.victimStableId === `entity:${ownerId}`)));
      if (priced) return null;
    }
    const pos = finiteLawPoint(entity.pos);
    if (!pos) return null;
    const payloadStableId = cleanLawId(`${isManifest ? 'manifest' : 'jettisoned'}-${entity.id}`);
    const reportId = cleanLawId(`pod-theft:${payloadStableId}`);
    if (!payloadStableId || !reportId) return null;
    const causalTick = Number.isInteger(state.tick) && state.tick >= 0 ? state.tick : 0;
    return this.reportIncident({
      reportId,
      kind: 'payload_theft',
      offenderStableId: 'player',
      offenderEntityId: state.playerId,
      payloadStableId,
      causalTick,
      pos,
      victim: entity,
      victimEntityId: ownerId,
    });
  },

  // ── Kill adjudication: the witness gate on homicide ──────────────────────────────────────
  //
  // One lawful evaluation per player-caused kill. The combat receipt carries the FROZEN
  // first-hit truth (`targetHostileToPlayer`): a ship that was already hostile when the player
  // engaged is a lawful kill — self-defense or declared bounty work — wherever it happens, and
  // the law clears it on the record when it could see the act. Everything else is a crime
  // candidate, and a crime the law cannot see is a crime it cannot charge:
  //
  //   * inside a lawful station's protection ring (jurisdiction), or
  //   * seen by a lawful unit or marked witness (`lawWitnessesNear`), or
  //   * seen by a protected civilian who watched it happen, or
  //   * the victim itself was lawful-faction — the law network always records its own dead.
  //
  // A validated kill reports through the same receipt contract as a witnessed theft
  // (`law:reportIncidentReceipt` + `validatedCrime`) so the HEAT OWNER — and only the heat
  // owner — prices it. There is no direct heat write in this path.

  _handleKilledAdjudication(payload) {
    const state = this.state;
    if (!state || !payload || state.playerId == null) return;
    if (state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive') return;
    if (payload.killerId !== state.playerId || payload.id === state.playerId) return;
    const victim = entityById(state, payload.id);
    const victimType = payload.type || (victim && victim.type);
    if (!LAW_KILL_ADJUDICATION_TYPES.has(victimType)) return;
    // Contracted and run-scoped victims are legal work — their reward owner already priced them.
    if (victim && (missionOwnsReward(victim) || runOwnsReward(victim))) return;

    const player = entityById(state, state.playerId);
    const pos = finiteLawPoint(payload.pos)
      || finiteLawPoint(victim && victim.pos)
      || finiteLawPoint(player && player.pos);
    if (!pos) return;

    // Legacy payloads without the frozen flag fall back to live hostility minus provoked
    // retaliation: a victim who only turned hostile because the player shot first is NOT a
    // clear hostile. When the victim entity itself is already gone, the faction ledger's
    // declared aggro is the only hostility truth left (the old heat-owner rule).
    const provoked = !!(victim && victim.data && victim.data.ai
      && victim.data.ai.retaliationTargetId === state.playerId);
    const factionLawful = payload.factionLawful === true
      || !!(victim && victim.data && victim.data.ai && victim.data.ai.lawful === true);
    const factionAggro = !!(victim == null && payload.factionId != null && state.factions
      && state.factions[payload.factionId] && state.factions[payload.factionId].aggro);
    const clearlyHostile = typeof payload.targetHostileToPlayer === 'boolean'
      ? payload.targetHostileToPlayer
      : factionAggro
        || !!(victim && !provoked && isHostileToPlayer(victim, player && player.team, state));

    const jurisdiction = (victim && protectedStationAt(state, victim))
      || protectedStationAt(state, { pos })
      || (player && protectedStationAt(state, player))
      || null;
    const witnesses = lawWitnessesNear(state, {
      pos, offenderEntityId: state.playerId, radius: LAW_KILL_WITNESS_RADIUS,
    }).filter((w) => w.entityId !== payload.id); // the dead cannot testify
    const civilians = civilianKillWitnessesNear(state, pos, state.playerId, witnesses, payload.id);
    const seen = !!jurisdiction || witnesses.length > 0 || civilians.length > 0;
    const witnessStableIds = witnesses.map((w) => w.stableId)
      .concat(civilians.map((w) => w.stableId))
      .slice(0, LAW_INCIDENT_WITNESS_CAP);
    const victimStableId = victimStableIdOf(victim, payload);

    // A lawful-network victim never takes the cleared early-out, even mid-enforcement: a
    // patrol engaging a WANTED player is hostile in the combat sense, but destroying it is
    // still a lawful_kill the network records. Otherwise a wanted player could cull patrols
    // for free, and first-shot aggression against the law would launder into self-defense.
    if (clearlyHostile && !factionLawful) {
      // Lawful force: no crime, no heat. Where the law could see the kill it clears the
      // shooter on the record — the lawful-defense leg is an outcome the player can observe.
      if (seen) {
        this._lawResponse('kill_adjudicated', {
          outcome: 'lawful',
          victimEntityId: payload.id,
          victimStableId,
          victimClass: payload.victimClass || null,
          stationId: jurisdiction ? jurisdiction.stationId : null,
          witnessCount: witnessStableIds.length,
        });
      }
      return;
    }

    if (!factionLawful && !seen) {
      // Nobody saw it — the law cannot act. Recorded as an explicit outcome, never a licence:
      // the same kill re-adjudicates if a save/reload replays the event under new eyes.
      this._lawResponse('kill_unwitnessed', {
        outcome: 'no_charge',
        victimEntityId: payload.id,
        victimStableId,
        victimClass: payload.victimClass || null,
      });
      return;
    }

    if (victimStableId == null) return; // no stable identity — a colliding 'kill:null' key would re-emit a stranger's receipt
    const reportId = cleanLawId(`kill:${victimStableId}`);
    if (!reportId) return;
    const existing = readReportedIncident(state, reportId);
    if (existing) {
      this._emit('law:reportIncidentReceipt', existing);
      return;
    }

    const kind = factionLawful ? 'lawful_kill' : 'unlawful_kill';
    const causalTick = Number.isInteger(state.tick) && state.tick >= 0 ? state.tick : 0;
    const receipt = Object.freeze({
      accepted: true,
      incidentReceiptId: `law:kill:${hash32(reportId, kind, victimStableId, causalTick).toString(36)}`,
      reportId,
      kind,
      offenderStableId: 'player',
      offenderEntityId: state.playerId,
      payloadStableId: victimStableId,
      victimEntityId: payload.id,
      victimStableId,
      victimClass: payload.victimClass || null,
      causalTick,
      stationId: jurisdiction ? jurisdiction.stationId : null,
      factionId: (jurisdiction && jurisdiction.factionId)
        || (victim && victim.factionId)
        || payload.factionId
        || null,
      witnessCount: witnessStableIds.length,
      witnessStableIds: Object.freeze(witnessStableIds),
      // Kill receipts carry validatedCrime, not validatedWitnessedTheft — the heat owner
      // prices either fact through the same single-writer door.
      validatedWitnessedTheft: false,
      validatedCrime: true,
      source: 'lawSecurity',
    });
    storeReportedIncident(state, receipt);
    this._recordReceipt({
      incidentId: receipt.incidentReceiptId,
      cause: kind,
      outcome: 'kill_validated',
      attackerId: state.playerId,
      targetId: payload.id,
      stationId: receipt.stationId,
      text: `KILL ADJUDICATED — ${factionLawful ? 'lawful victim' : 'non-hostile victim'}; ${witnessStableIds.length} witness${witnessStableIds.length === 1 ? '' : 'es'} on record.`,
    });
    this._emit('law:reportIncidentReceipt', receipt);
    this._lawResponse('crime_validated', {
      kind,
      incidentReceiptId: receipt.incidentReceiptId,
      victimEntityId: payload.id,
      victimStableId,
      victimClass: receipt.victimClass,
      stationId: receipt.stationId,
      witnessCount: witnessStableIds.length,
    });

    // A witnessed murder inside a live protection ring is also a standing distress incident —
    // the same patrol machinery that answers shots fired answers a corpse.
    if (jurisdiction && victim && player) {
      this._openIncident(player, victim, jurisdiction,
        factionLawful ? 'player_assault' : 'player_piracy');
    }
  },

  // ── Lawful clearance: pay the assessed fine at a lawful dock ─────────────────────────────
  //
  // The lawful channel for the two escapable tiers. SCAN and BOUNTY already clear by leaving
  // the search zone; a lawful dock offers the honest door instead — pay the assessed fine
  // through the economy owner and the heat owner clears the sheet. NETS and IMPOUND keep
  // their physical escapes; nobody pays a fine to walk out of an impound lot.
  //
  // Escaping consequences is possible but never free: the fine is real credits, charged
  // through `economy:chargeCredits`, and a pilot who cannot pay keeps the heat.

  _handleDockedLawfulClearance(payload) {
    const state = this.state;
    if (!state || !payload || state.playerId == null) return;
    if (state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive') return;
    const player = state.player;
    const heatValue = player && Number(player.heat) || 0;
    if (heatValue <= 0) return;
    const tier = wantedTierFor(heatValue);
    if (tier !== WANTED_TIER.SCAN && tier !== WANTED_TIER.BOUNTY) return;
    const station = entityById(state, payload.stationId)
      || stationByPublicId(state, payload.stationId)
      || entityById(state, payload.entityId);
    if (!station || !isLawful(station)) return;

    const level = heatLevelFor(heatValue);
    const fine = LAW_DOCK_FINE_BASE_CR + LAW_DOCK_FINE_PER_LEVEL_CR * level;
    const credits = Math.max(0, Math.round(Number(player.credits) || 0));
    const stationId = payload.stationId
      || (station.data && station.data.stationId)
      || station.stationId
      || station.id;

    this._lawResponse('fine_assessed', {
      stationId, fineCr: fine, heatLevel: level, wantedTier: tier,
    });
    if (credits < fine) {
      this._lawResponse('fine_unpaid', {
        stationId, fineCr: fine, shortfallCr: fine - credits, heatLevel: level, wantedTier: tier,
      });
      this._recordReceipt({
        cause: 'wanted_fine', outcome: 'fine_unpaid',
        attackerId: state.playerId, targetId: null, stationId,
        text: `FINE ASSESSED ${fine} cr — insufficient funds. Warrant stands.`,
      });
      this._emit('law:fineAssessed', {
        stationId, amount: fine, paid: false, shortfall: fine - credits,
        heatLevel: level, wantedTier: tier,
      });
      return;
    }

    this._emit('economy:chargeCredits', {
      amount: fine,
      reason: 'fine:wanted_clearance',
      sink: 'fine',
      cause: 'wanted_clearance',
    });
    this._emit('heat:clear', { reason: 'station_fine' });
    this._emit('law:fineAssessed', {
      stationId, amount: fine, paid: true,
      heatLevel: level, wantedTier: tier,
    });
    this._lawResponse('fine_paid', {
      stationId, fineCr: fine, heatLevel: level, wantedTier: tier,
    });
    this._recordReceipt({
      cause: 'wanted_fine', outcome: 'fine_paid',
      attackerId: state.playerId, targetId: null, stationId,
      text: `FINE PAID ${fine} cr — warrant cleared at ${stationId}.`,
    });
  },

  // Canonical law-response event: one named row per action leg so instruments, barks, and HUD
  // can follow the loop without reading system internals.
  _lawResponse(action, fields) {
    const state = this.state;
    this._emit('law:response', {
      action,
      tick: state ? state.tick | 0 : 0,
      t: state ? state.simTime || 0 : 0,
      ...(fields || {}),
    });
  },

  // ── PQ-148.02: physical customs cone over a field pod ─────────────────────────────────────

  _updateCustomsScanCones(dt, state) {
    const step = Number(dt);
    if (!(step > 0) || !state) return;
    const pods = this._coneScratchPods;
    const occluders = this._coneScratchOccluders;
    const scanners = this._coneScratchScanners;
    pods.length = 0;
    occluders.length = 0;
    scanners.length = 0;
    forEachJobInteractable(state, (entity) => {
      if (!entity.pos) return;
      if (isJettisonedCargoPod(entity)) pods.push(entity);
      if (customsScanConeOf(entity)) scanners.push(entity);
      if (entity.type === 'ship' && entity.collides !== false) occluders.push(entity);
    });
    if (scanners.length === 0 || pods.length === 0) return;

    const dwell = this._podConeDwell || (this._podConeDwell = new Map());
    for (let s = 0; s < scanners.length; s++) {
      const scanner = scanners[s];
      const cone = customsScanConeOf(scanner);
      if (!cone) continue;
      for (let p = 0; p < pods.length; p++) {
        const pod = pods[p];
        if (!pod.data) continue;
        const key = `${scanner.id}:${pod.id}`;
        const inside = pointInScanCone(cone.origin, cone.heading, cone.range, cone.halfAngle, pod.pos);
        if (!inside) {
          dwell.delete(key);
          continue;
        }
        pod.data.customsConeEntered = true;
        if (pod.data.customsScanned) continue;
        let hidden = false;
        for (let o = 0; o < occluders.length; o++) {
          const hull = occluders[o];
          if (!hull || hull.id === scanner.id || hull.id === pod.id) continue;
          if (scanLineOccluded(cone.origin, pod.pos, hull)) {
            hidden = true;
            break;
          }
        }
        if (hidden) {
          dwell.delete(key);
          continue;
        }
        const next = (Number(dwell.get(key)) || 0) + step;
        dwell.set(key, next);
        if (next < cone.dwellS) continue;
        const legality = pod.data.legality || commodityLegality(pod.data.commodityId);
        if (legality !== 'contraband') continue;
        this._emitPodCustomsScan(scanner, pod);
      }
    }
  },

  _emitPodCustomsScan(scanner, pod) {
    if (!pod || !pod.data || pod.data.customsScanned) return;
    const commodityId = pod.data.commodityId;
    const units = Math.max(0, Number(pod.data.amount) || 0);
    pod.data.customsScanned = true;
    pod.data.customsScannedAt = inspectionNow(this.state);
    this._emit('contraband:scanned', {
      found: true,
      source: 'customs_scan_cone',
      podId: pod.id,
      commodityId,
      units,
      factionId: scanner && scanner.factionId ? scanner.factionId : 'faction_scn',
      patrolId: scanner && scanner.id,
      confiscated: commodityId ? [{ commodityId, qty: units }] : [],
    });
  },

  _say(channel, text, id, factionId) {
    // The sector-law presenter owns the single visible authority surface from the public lifecycle
    // and receipt events emitted immediately after these calls. Keep the authored line available to
    // telemetry/audio without duplicating it on the global voice floor.
    this._emit('law:voice', { channel, text, id, factionId, kind: 'lawSecurity' });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  // PQ-151.00 — bounty-band warrant. Posts one contract hunter at a reserve arrival
  // point (never on the player). Scan-band crimes stay a search-zone slip. Nets post a
  // lane checkpoint instead of a hunter (see _syncWantedCheckpoint). Impound posts a yard
  // and a clerk from reserve (see _syncWantedImpound).
  _syncWantedWarrant(state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const own = ensureState(state);
    const tier = wantedTierFor(state.player && state.player.heat);
    const warrant = own.wantedWarrant && typeof own.wantedWarrant === 'object'
      ? own.wantedWarrant
      : null;
    const hunter = warrant ? entityById(state, warrant.hunterId) : null;
    const liveHunter = !!(hunter && hunter.alive !== false);

    if (tier !== WANTED_TIER.BOUNTY) {
      if (warrant) this._releaseWantedWarrant(state, warrant, liveHunter ? hunter : null);
      return;
    }
    if (warrant && (liveHunter || warrant.postedAt != null)) return;
    if (Number.isInteger(own.wantedWarrantRetryTick) && (state.tick | 0) < own.wantedWarrantRetryTick) return;
    this._postWantedWarrant(state);
  },

  _postWantedWarrant(state) {
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    const own = ensureState(state);
    const zone = state.player && state.player.heatZone;
    const seed = state.meta && state.meta.seed || 1;
    const contractId = `wanted-warrant:${seed}`;
    const anchor = zone && zone.active && zone.center ? zone.center : player.pos;
    const arrival = reserveArrivalPoint({
      anchor,
      aggressorPos: player.pos,
      jurisdictionRadius: zone && Number.isFinite(zone.radius) ? zone.radius : 1700,
      seed,
      incidentId: contractId,
    });
    if (distance2(arrival, player.pos) < 900 * 900) return;

    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `law:${contractId}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(1, requester) : 1;
    if (grant < 1) {
      own.wantedWarrantRetryTick = (state.tick | 0) + 15;
      this._emit('law:wantedWarrantDeferred', {
        contractId, reason: 'spawn_cap', requested: 1, granted: grant,
      });
      return;
    }

    const huntSpec = makePlayerWarrantHunterSpec({
      contractId,
      playerId: state.playerId,
      pos: arrival,
      factionId: 'faction_scn',
    });
    const hull = makeEnemySpawnSpec('patrol_lawman', 3, arrival, {
      factionId: 'faction_scn',
      motive: 'wanted_warrant',
      engagementTrigger: 'wanted_bounty',
      zoneId: 'wanted_warrant',
      approachTelegraph: 'hunter_inbound',
      startedTick: state.tick,
    });
    hull.team = huntSpec.team;
    hull.pos = { x: arrival.x, z: arrival.z };
    hull.vel = { x: 0, z: 0 };
    hull.rot = Math.atan2(player.pos.z - arrival.z, player.pos.x - arrival.x);
    hull.data = { ...(hull.data || {}), ...(huntSpec.data || {}) };
    hull.data.missionTag = 'wanted_warrant';
    hull.data.missionPinned = true;
    const ai = hull.data.ai || (hull.data.ai = {});
    Object.assign(ai, huntSpec.data.ai || {});
    ai.spawnContext = BOUNTY_HUNTER_PLAYER_CONTEXT;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    ai.lawful = false;
    ai.passive = false;
    // Reserve arrival is ≥ 2000 wu; default sensors are 1600. The hunter has to see the
    // contract target from the arrival point or it sits there instead of flying in.
    ai.sensorRange = 8000;
    hull.sensorRange = 8000;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: `wanted_warrant:${contractId}`,
      anchor: { x: player.pos.x, z: player.pos.z },
      leashRadius: 9000,
      startedTick: state.tick | 0,
      targetId: state.playerId,
      encounterId: contractId,
    });
    const combat = hull.data.combat || (hull.data.combat = {});
    combat.targetId = state.playerId;
    const intent = hull.data.intent || (hull.data.intent = {});
    intent.targetId = state.playerId;
    intent.mode = 'bounty_player';

    if (typeof this.helpers.spawnEntity !== 'function') {
      own.wantedWarrantRetryTick = (state.tick | 0) + 15;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return;
    }
    let spawned;
    try {
      spawned = this.helpers.spawnEntity(hull);
    } catch (error) {
      own.wantedWarrantRetryTick = (state.tick | 0) + 15;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!spawned) {
      own.wantedWarrantRetryTick = (state.tick | 0) + 15;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(spawned.id, requester);

    delete own.wantedWarrantRetryTick;
    own.wantedWarrant = {
      contractId,
      hunterId: spawned.id,
      targetId: state.playerId,
      tier: WANTED_TIER.BOUNTY,
      postedAt: state.simTime || 0,
      arrival: { x: arrival.x, z: arrival.z },
    };
    this._emit('law:wantedWarrantPosted', publicWantedWarrant(own.wantedWarrant));
    this._lawResponse('warrant_posted', {
      contractId, hunterId: spawned.id, targetId: state.playerId, tier: WANTED_TIER.BOUNTY,
    });
  },

  _releaseWantedWarrant(state, warrant, hunter) {
    const own = ensureState(state);
    if (hunter && hunter.alive !== false) {
      if (hunter.data && hunter.data.bountyHunt) {
        hunter.data.bountyHunt.pursuing = false;
        hunter.data.bountyHunt.targetId = null;
      }
      if (hunter.data) {
        hunter.data.wantedWarrant = false;
        hunter.data.missionPinned = false;
        hunter.data.contractTargetId = null;
      }
      const ai = hunter.data && hunter.data.ai;
      if (ai) {
        ai.forcePlayerTarget = false;
        ai.passive = true;
      }
    }
    own.wantedWarrant = null;
    this._emit('law:wantedWarrantReleased', {
      contractId: warrant && warrant.contractId,
      hunterId: warrant && warrant.hunterId,
      targetId: warrant && warrant.targetId,
    });
    this._lawResponse('warrant_released', {
      contractId: warrant && warrant.contractId,
      hunterId: warrant && warrant.hunterId,
      targetId: warrant && warrant.targetId,
    });
  },

  // PQ-151.01 — nets-band checkpoint. A tether-net + scan cone sits on the lane ahead
  // of the player (never on their nose). A customs cutter staffs it from a reserve
  // arrival. Break by mass, by speed, or by a thrown decoy occupying the cone.
  _syncWantedCheckpoint(state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const own = ensureState(state);
    const tier = wantedTierFor(state.player && state.player.heat);
    const checkpoint = own.wantedCheckpoint && typeof own.wantedCheckpoint === 'object'
      ? own.wantedCheckpoint
      : null;
    const net = checkpoint ? entityById(state, checkpoint.netId) : null;
    const liveNet = !!(net && net.alive !== false);

    if (tier !== WANTED_TIER.NETS) {
      if (checkpoint) {
        this._releaseWantedCheckpoint(state, checkpoint, liveNet ? net : null);
      }
      return;
    }
    if (checkpoint && (liveNet || checkpoint.postedAt != null)) return;
    if (Number.isInteger(own.wantedCheckpointRetryTick)
      && (state.tick | 0) < own.wantedCheckpointRetryTick) return;
    this._postWantedCheckpoint(state);
  },

  _postWantedCheckpoint(state) {
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    const own = ensureState(state);
    const seed = state.meta && state.meta.seed || 1;
    const checkpointId = `wanted-checkpoint:${seed}`;
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const lane = {
      x: player.pos.x + Math.cos(heading) * WANTED_NET_STANDOFF,
      z: player.pos.z + Math.sin(heading) * WANTED_NET_STANDOFF,
    };
    if (distance2(lane, player.pos) < 200 * 200) return;

    const zone = state.player && state.player.heatZone;
    const arrival = reserveArrivalPoint({
      anchor: zone && zone.active && zone.center ? zone.center : player.pos,
      aggressorPos: player.pos,
      jurisdictionRadius: zone && Number.isFinite(zone.radius) ? zone.radius : 2300,
      seed,
      incidentId: checkpointId,
    });
    if (distance2(arrival, player.pos) < 900 * 900) return;

    if (typeof this.helpers.spawnEntity !== 'function') {
      own.wantedCheckpointRetryTick = (state.tick | 0) + 15;
      return;
    }

    const coneHeading = Math.atan2(player.pos.z - lane.z, player.pos.x - lane.x);
    let net;
    try {
      net = this.helpers.spawnEntity({
        type: 'ship',
        team: 2,
        pos: { x: lane.x, z: lane.z },
        vel: { x: 0, z: 0 },
        rot: coneHeading,
        radius: WANTED_NET_RADIUS,
        mass: 4000,
        hull: 240,
        hullMax: 240,
        collides: true,
        factionId: 'faction_scn',
        data: {
          wantedCheckpointNet: true,
          customsScanner: true,
          customsScanCone: {
            heading: coneHeading,
            halfAngle: CUSTOMS_SCAN_HALF_ANGLE,
            range: CUSTOMS_SCAN_RANGE,
            dwellS: CUSTOMS_SCAN_DWELL_S,
          },
          role: 'customs',
          defId: 'wanted_tether_net',
          missionTag: 'wanted_checkpoint',
          missionPinned: true,
        },
      });
    } catch (error) {
      own.wantedCheckpointRetryTick = (state.tick | 0) + 15;
      throw error;
    }
    if (!net) {
      own.wantedCheckpointRetryTick = (state.tick | 0) + 15;
      return;
    }

    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `law:${checkpointId}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(1, requester) : 1;
    let cutter = null;
    if (grant >= 1) {
      cutter = this._spawnCheckpointCutter(state, arrival, lane, checkpointId, requester, budget);
    } else {
      own.wantedCheckpointRetryTick = (state.tick | 0) + 15;
    }

    delete own.wantedCheckpointRetryTick;
    own.wantedCheckpoint = {
      checkpointId,
      netId: net.id,
      cutterId: cutter && cutter.id || null,
      targetId: state.playerId,
      tier: WANTED_TIER.NETS,
      postedAt: state.simTime || 0,
      lane: { x: lane.x, z: lane.z },
      arrival: { x: arrival.x, z: arrival.z },
      intact: true,
      held: false,
      brokenBy: null,
    };
    this._emit('law:wantedCheckpointPosted', publicWantedCheckpoint(own.wantedCheckpoint));
    this._lawResponse('checkpoint_posted', {
      checkpointId, netId: net.id, cutterId: cutter && cutter.id || null,
      targetId: state.playerId, tier: WANTED_TIER.NETS,
    });
  },

  _spawnCheckpointCutter(state, arrival, lane, checkpointId, requester, budget) {
    const hull = makeEnemySpawnSpec('customs_cutter', 3, arrival, {
      factionId: 'faction_scn',
      motive: 'wanted_checkpoint',
      engagementTrigger: 'wanted_checkpoint',
      zoneId: 'wanted_checkpoint',
      approachTelegraph: 'checkpoint_inbound',
      startedTick: state.tick,
    });
    hull.team = 2;
    hull.pos = { x: arrival.x, z: arrival.z };
    hull.vel = { x: 0, z: 0 };
    hull.rot = Math.atan2(lane.z - arrival.z, lane.x - arrival.x);
    hull.data = { ...(hull.data || {}) };
    hull.data.missionTag = 'wanted_checkpoint';
    hull.data.missionPinned = true;
    hull.data.wantedCheckpointCutter = true;
    hull.data.customsScanner = true;
    const ai = hull.data.ai || (hull.data.ai = {});
    ai.spawnContext = 'wanted_checkpoint';
    ai.forcePlayerTarget = false;
    ai.lawful = true;
    ai.passive = false;
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.sensorRange = 8000;
    hull.sensorRange = 8000;
    ai.activity = normalizeActivity({
      kind: ActivityKind.TRANSIT,
      reason: `wanted_checkpoint:${checkpointId}`,
      anchor: { x: lane.x, z: lane.z },
      leashRadius: 9000,
      startedTick: state.tick | 0,
      encounterId: checkpointId,
    });
    const combat = hull.data.combat || (hull.data.combat = {});
    combat.targetId = null;
    const intent = hull.data.intent || (hull.data.intent = {});
    intent.fire = false;
    intent.mode = 'wanted_checkpoint';

    let spawned = null;
    try {
      spawned = this.helpers.spawnEntity(hull);
    } catch (error) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!spawned) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return null;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(spawned.id, requester);
    return spawned;
  },

  _updateWantedCheckpoint(_dt, state) {
    const own = state && state.lawSecurity;
    const checkpoint = own && own.wantedCheckpoint;
    if (!checkpoint || checkpoint.intact === false) return;
    const net = entityById(state, checkpoint.netId);
    if (!net || net.alive === false || !net.pos) return;
    const player = entityById(state, state.playerId);
    const decoy = findDecoyInCheckpointCone(state, net, player);
    if (decoy) {
      this._breakWantedCheckpoint(state, checkpoint, 'decoy', decoy);
      return;
    }
    if (!player || player.alive === false || !player.pos) return;
    if (!overlapsWantedNet(player, net)) {
      checkpoint.held = false;
      return;
    }
    const mass = Number(player.mass) || 0;
    const speed = entitySpeed(player);
    if (mass >= WANTED_NET_BREAK_MASS) {
      this._breakWantedCheckpoint(state, checkpoint, 'mass', player);
      return;
    }
    if (speed >= WANTED_NET_BREAK_SPEED) {
      this._breakWantedCheckpoint(state, checkpoint, 'speed', player);
      return;
    }
    checkpoint.held = true;
  },

  _breakWantedCheckpoint(state, checkpoint, method, byEntity) {
    if (!checkpoint || checkpoint.intact === false) return;
    checkpoint.intact = false;
    checkpoint.held = false;
    checkpoint.brokenBy = method;
    checkpoint.brokenAt = state.simTime || 0;
    const net = entityById(state, checkpoint.netId);
    if (net && net.data) {
      net.data.wantedNetBroken = true;
      net.data.customsScanner = false;
      net.data.role = 'broken_checkpoint';
      delete net.data.customsScanCone;
    }
    this._emit('law:wantedCheckpointBroken', {
      accepted: true,
      source: 'lawSecurity',
      checkpointId: checkpoint.checkpointId,
      method,
      netId: checkpoint.netId,
      cutterId: checkpoint.cutterId,
      targetId: checkpoint.targetId,
      byId: byEntity && byEntity.id != null ? byEntity.id : null,
    });
    this._lawResponse('checkpoint_broken', {
      checkpointId: checkpoint.checkpointId, method,
      netId: checkpoint.netId, targetId: checkpoint.targetId,
    });
  },

  _releaseWantedCheckpoint(state, checkpoint, net) {
    const own = ensureState(state);
    const liveNet = net && net.alive !== false ? net : entityById(state, checkpoint && checkpoint.netId);
    if (liveNet && liveNet.data) {
      liveNet.data.missionPinned = false;
      liveNet.data.customsScanner = false;
      if (liveNet.data.role === 'customs') liveNet.data.role = 'broken_checkpoint';
      delete liveNet.data.customsScanCone;
    }
    const cutter = checkpoint ? entityById(state, checkpoint.cutterId) : null;
    if (cutter && cutter.alive !== false && cutter.data) {
      cutter.data.missionPinned = false;
      cutter.data.wantedCheckpointCutter = false;
      const ai = cutter.data.ai;
      if (ai) {
        ai.forcePlayerTarget = false;
        ai.passive = true;
      }
    }
    own.wantedCheckpoint = null;
    this._emit('law:wantedCheckpointReleased', {
      checkpointId: checkpoint && checkpoint.checkpointId,
      netId: checkpoint && checkpoint.netId,
      cutterId: checkpoint && checkpoint.cutterId,
      targetId: checkpoint && checkpoint.targetId,
      brokenBy: checkpoint && checkpoint.brokenBy,
    });
    this._lawResponse('checkpoint_released', {
      checkpointId: checkpoint && checkpoint.checkpointId,
      targetId: checkpoint && checkpoint.targetId,
      brokenBy: checkpoint && checkpoint.brokenBy,
    });
  },

  // PQ-151.03 — impound-band yard. A berth sits on the lane ahead of the player
  // (never on their nose). A clerk staffs it from a reserve arrival. Pay at the
  // clerk, work the shift in the yard, or cut the lock. No teleport police.
  _syncWantedImpound(state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const own = ensureState(state);
    const tier = wantedTierFor(state.player && state.player.heat);
    const pound = own.wantedImpound && typeof own.wantedImpound === 'object'
      ? own.wantedImpound
      : null;
    const yard = pound ? entityById(state, pound.yardId) : null;
    const liveYard = !!(yard && yard.alive !== false);
    const bill = impoundBillFor(state);

    if (tier !== WANTED_TIER.IMPOUND || (bill && bill.status && bill.status !== 'open')) {
      if (pound) this._releaseWantedImpound(state, pound);
      return;
    }
    if (pound && (liveYard || pound.postedAt != null)) return;
    if (Number.isInteger(own.wantedImpoundRetryTick)
      && (state.tick | 0) < own.wantedImpoundRetryTick) return;
    this._postWantedImpound(state);
  },

  _postWantedImpound(state) {
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    const own = ensureState(state);
    const seed = state.meta && state.meta.seed || 1;
    const poundId = `wanted-impound:${seed}`;
    const billId = `impound:${seed}`;
    const existing = impoundBillFor(state);
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const savedYard = existing && existing.status === 'open' && existing.yard;
    const yardPos = savedYard && (savedYard.x || savedYard.z)
      ? { x: savedYard.x, z: savedYard.z }
      : {
        x: player.pos.x + Math.cos(heading) * WANTED_IMPOUND_STANDOFF,
        z: player.pos.z + Math.sin(heading) * WANTED_IMPOUND_STANDOFF,
      };
    if (distance2(yardPos, player.pos) < 200 * 200 && !(savedYard && (savedYard.x || savedYard.z))) return;

    const sideX = -Math.sin(heading);
    const sideZ = Math.cos(heading);
    const savedLock = existing && existing.status === 'open' && existing.lock;
    const lockPos = savedLock && (savedLock.x || savedLock.z)
      ? { x: savedLock.x, z: savedLock.z }
      : {
        x: yardPos.x + sideX * (WANTED_IMPOUND_YARD_RADIUS + WANTED_IMPOUND_PAD_RADIUS),
        z: yardPos.z + sideZ * (WANTED_IMPOUND_YARD_RADIUS + WANTED_IMPOUND_PAD_RADIUS),
      };
    const workPos = existing && existing.status === 'open' && existing.work
      ? { x: existing.work.x, z: existing.work.z }
      : { x: yardPos.x, z: yardPos.z };

    const zone = state.player && state.player.heatZone;
    const arrival = reserveArrivalPoint({
      anchor: zone && zone.active && zone.center ? zone.center : player.pos,
      aggressorPos: player.pos,
      jurisdictionRadius: zone && Number.isFinite(zone.radius) ? zone.radius : 3700,
      seed,
      incidentId: poundId,
    });
    if (distance2(arrival, player.pos) < 900 * 900) return;

    if (typeof this.helpers.spawnEntity !== 'function') {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
      return;
    }

    let yard;
    try {
      yard = this.helpers.spawnEntity({
        type: 'ship',
        team: 2,
        pos: { x: yardPos.x, z: yardPos.z },
        vel: { x: 0, z: 0 },
        rot: heading,
        radius: WANTED_IMPOUND_YARD_RADIUS,
        mass: 8000,
        hull: 400,
        hullMax: 400,
        collides: true,
        factionId: 'faction_scn',
        data: {
          wantedImpoundYard: true,
          role: 'impound_yard',
          defId: 'wanted_impound_yard',
          missionTag: 'wanted_impound',
          missionPinned: true,
        },
      });
    } catch (error) {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
      throw error;
    }
    if (!yard) {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
      return;
    }

    let lock = null;
    try {
      lock = this.helpers.spawnEntity({
        type: 'ship',
        team: 2,
        pos: { x: lockPos.x, z: lockPos.z },
        vel: { x: 0, z: 0 },
        rot: heading,
        radius: WANTED_IMPOUND_PAD_RADIUS,
        mass: 200,
        hull: 80,
        hullMax: 80,
        collides: true,
        factionId: 'faction_scn',
        data: {
          wantedImpoundLock: true,
          role: 'impound_lock',
          defId: 'wanted_impound_lock',
          missionTag: 'wanted_impound',
          missionPinned: true,
        },
      });
    } catch (error) {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
      throw error;
    }
    if (!lock) {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
      return;
    }

    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `law:${poundId}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(1, requester) : 1;
    let clerk = null;
    if (grant >= 1) {
      clerk = this._spawnImpoundClerk(state, arrival, yardPos, poundId, requester, budget);
    } else {
      own.wantedImpoundRetryTick = (state.tick | 0) + 15;
    }

    delete own.wantedImpoundRetryTick;
    own.wantedImpound = {
      poundId,
      billId,
      yardId: yard.id,
      lockId: lock.id,
      clerkId: clerk && clerk.id || null,
      targetId: state.playerId,
      tier: WANTED_TIER.IMPOUND,
      postedAt: state.simTime || 0,
      yard: { x: yardPos.x, z: yardPos.z },
      lock: { x: lockPos.x, z: lockPos.z },
      work: { x: workPos.x, z: workPos.z },
      arrival: { x: arrival.x, z: arrival.z },
      held: false,
      open: true,
    };
    this._emit('law:impoundPosted', {
      ...publicWantedImpound(own.wantedImpound),
      billId,
      owedCr: existing && existing.status === 'open' ? existing.owedCr : quoteImpoundBill(state.player),
      sectorId: currentSectorId(state),
    });
    this._lawResponse('impound_posted', {
      billId, targetId: state.playerId, tier: WANTED_TIER.IMPOUND,
      sectorId: currentSectorId(state),
    });
  },

  _spawnImpoundClerk(state, arrival, yard, poundId, requester, budget) {
    const hull = makeEnemySpawnSpec('customs_cutter', 3, arrival, {
      factionId: 'faction_scn',
      motive: 'wanted_impound',
      engagementTrigger: 'wanted_impound',
      zoneId: 'wanted_impound',
      approachTelegraph: 'impound_inbound',
      startedTick: state.tick,
    });
    hull.team = 2;
    hull.pos = { x: arrival.x, z: arrival.z };
    hull.vel = { x: 0, z: 0 };
    hull.rot = Math.atan2(yard.z - arrival.z, yard.x - arrival.x);
    hull.data = { ...(hull.data || {}) };
    hull.data.missionTag = 'wanted_impound';
    hull.data.missionPinned = true;
    hull.data.wantedImpoundClerk = true;
    const ai = hull.data.ai || (hull.data.ai = {});
    ai.spawnContext = 'wanted_impound';
    ai.forcePlayerTarget = false;
    ai.lawful = true;
    ai.passive = false;
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.sensorRange = 8000;
    hull.sensorRange = 8000;
    ai.activity = normalizeActivity({
      kind: ActivityKind.TRANSIT,
      reason: `wanted_impound:${poundId}`,
      anchor: { x: yard.x, z: yard.z },
      leashRadius: 9000,
      startedTick: state.tick | 0,
      encounterId: poundId,
    });
    const combat = hull.data.combat || (hull.data.combat = {});
    combat.targetId = null;
    const intent = hull.data.intent || (hull.data.intent = {});
    intent.fire = false;
    intent.mode = 'wanted_impound';

    let spawned = null;
    try {
      spawned = this.helpers.spawnEntity(hull);
    } catch (error) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!spawned) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return null;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(spawned.id, requester);
    return spawned;
  },

  _updateWantedImpound(dt, state) {
    const own = state && state.lawSecurity;
    const pound = own && own.wantedImpound;
    if (!pound || pound.open === false) return;
    const bill = impoundBillFor(state);
    if (!bill || bill.status !== 'open') return;
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false || !player.pos) {
      pound.held = false;
      return;
    }
    const yard = entityById(state, pound.yardId);
    const lock = entityById(state, pound.lockId);
    pound.held = !!(yard && yard.alive !== false && overlapsImpoundPad(player, yard));
    if (lock && lock.alive !== false && overlapsImpoundPad(player, lock)) {
      this._recoverWantedImpound(state, pound, 'steal', player);
      return;
    }
    if (!pound.held || !(dt > 0)) return;
    this._emit('law:impoundWorked', {
      accepted: true,
      source: 'lawSecurity',
      poundId: pound.poundId,
      billId: bill.billId,
      dt,
    });
    if (isImpoundWorkComplete(impoundBillFor(state))) {
      this._recoverWantedImpound(state, pound, 'work', player);
    }
  },

  _payWantedImpound(state, _payload) {
    const own = state && state.lawSecurity;
    const pound = own && own.wantedImpound;
    if (!pound || pound.open === false) return;
    const bill = impoundBillFor(state);
    if (!bill || bill.status !== 'open') return;
    const player = entityById(state, state.playerId);
    const clerk = entityById(state, pound.clerkId);
    if (!player || !clerk || clerk.alive === false || !overlapsImpoundPad(player, clerk)) {
      this._emit('law:impoundPayRefused', {
        reason: 'not_at_clerk',
        poundId: pound.poundId,
        billId: bill.billId,
      });
      return;
    }
    const owed = Math.max(0, Math.round(Number(bill.remainingCr != null ? bill.remainingCr : bill.owedCr) || 0));
    const credits = Math.max(0, Math.round(Number(state.player && state.player.credits) || 0));
    if (credits < owed) {
      this._emit('law:impoundPayRefused', {
        reason: 'short',
        poundId: pound.poundId,
        billId: bill.billId,
        owedCr: owed,
        credits,
      });
      return;
    }
    if (owed > 0) {
      this._emit('economy:chargeCredits', { amount: owed, reason: 'impound:pay' });
    }
    this._recoverWantedImpound(state, pound, 'pay', player);
  },

  _recoverWantedImpound(state, pound, method, byEntity) {
    if (!pound || pound.open === false) return;
    pound.open = false;
    pound.held = false;
    pound.recoveredBy = method;
    pound.recoveredAt = state.simTime || 0;
    this._emit('law:impoundRecovered', {
      accepted: true,
      source: 'lawSecurity',
      poundId: pound.poundId,
      billId: pound.billId,
      method,
      yardId: pound.yardId,
      lockId: pound.lockId,
      clerkId: pound.clerkId,
      targetId: pound.targetId,
      byId: byEntity && byEntity.id != null ? byEntity.id : null,
      t: state.simTime || 0,
    });
    this._lawResponse('impound_resolved', {
      poundId: pound.poundId, billId: pound.billId, method, targetId: pound.targetId,
    });
  },

  _releaseWantedImpound(state, pound) {
    const own = ensureState(state);
    const unpin = (entity, flag) => {
      if (!entity || entity.alive === false || !entity.data) return;
      entity.data.missionPinned = false;
      if (flag) entity.data[flag] = false;
      const ai = entity.data.ai;
      if (ai) {
        ai.forcePlayerTarget = false;
        ai.passive = true;
      }
    };
    unpin(pound ? entityById(state, pound.yardId) : null, 'wantedImpoundYard');
    unpin(pound ? entityById(state, pound.lockId) : null, 'wantedImpoundLock');
    unpin(pound ? entityById(state, pound.clerkId) : null, 'wantedImpoundClerk');
    own.wantedImpound = null;
    this._emit('law:impoundReleased', {
      poundId: pound && pound.poundId,
      billId: pound && pound.billId,
      yardId: pound && pound.yardId,
      lockId: pound && pound.lockId,
      clerkId: pound && pound.clerkId,
      targetId: pound && pound.targetId,
      recoveredBy: pound && pound.recoveredBy,
    });
  },

  destroy() {
    this._releaseAllJobResponses('destroy');
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onDamage) this.bus.off('combat:damage', this._onDamage);
      if (this._onFire) this.bus.off('combat:fire', this._onFire);
      if (this._onSpawned) this.bus.off('entity:spawned', this._onSpawned);
      if (this._onResponderGone) {
        this.bus.off('entity:killed', this._onResponderGone);
        this.bus.off('entity:destroyed', this._onResponderGone);
      }
      if (this._onAftermathWreckSpawned) this.bus.off('aftermathWreck:spawned', this._onAftermathWreckSpawned);
      if (this._onSurvivorPodEjected) this.bus.off('survivorPod:ejected', this._onSurvivorPodEjected);
      if (this._onSectorExit) this.bus.off('sector:exit', this._onSectorExit);
      if (this._onSaveRestoring) this.bus.off('save:restoring', this._onSaveRestoring);
      if (this._onStolenCargoPodCollect) this.bus.off('pickup:collected', this._onStolenCargoPodCollect);
      if (this._onStolenCargoPodLatch) this.bus.off('tether:latched', this._onStolenCargoPodLatch);
      if (this._onHeatChanged) this.bus.off('heat:changed', this._onHeatChanged);
      if (this._onImpoundPay) this.bus.off('law:impoundPay', this._onImpoundPay);
    }
    this._onDamage = null;
    this._onFire = null;
    this._onSpawned = null;
    this._onResponderGone = null;
    this._onAftermathWreckSpawned = null;
    this._onSurvivorPodEjected = null;
    this._onSectorExit = null;
    this._onSaveRestoring = null;
    this._onStolenCargoPodCollect = null;
    this._onStolenCargoPodLatch = null;
    this._onHeatChanged = null;
    this._onImpoundPay = null;
    if (this._podConeDwell) this._podConeDwell.clear();
  },
};

export function pointInScanCone(origin, heading, range, halfAngle, point) {
  if (!origin || !point) return false;
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1e-6) || dist > range) return false;
  const hx = Math.cos(heading);
  const hz = Math.sin(heading);
  const ang = Math.acos(Math.max(-1, Math.min(1, (dx * hx + dz * hz) / dist)));
  return ang <= halfAngle;
}

export function scanLineOccluded(origin, target, occluder) {
  if (!origin || !target || !occluder || !occluder.pos) return false;
  const r = Math.max(0, Number(occluder.radius) || 0);
  if (!(r > 0)) return false;
  const ax = origin.x;
  const az = origin.z;
  const bx = target.x;
  const bz = target.z;
  const cx = occluder.pos.x;
  const cz = occluder.pos.z;
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const abLen2 = abx * abx + abz * abz;
  if (!(abLen2 > 1e-8)) return Math.hypot(acx, acz) <= r;
  let t = (acx * abx + acz * abz) / abLen2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = ax + abx * t - cx;
  const dz = az + abz * t - cz;
  return (dx * dx + dz * dz) <= r * r;
}

export function customsScanConeOf(entity) {
  if (!entity || entity.alive === false || !entity.pos) return null;
  const data = entity.data || {};
  const explicit = data.customsScanCone && typeof data.customsScanCone === 'object'
    ? data.customsScanCone
    : null;
  const isScanner = data.customsScanner === true
    || !!explicit
    || data.defId === 'customs_cutter'
    || data.enemyId === 'customs_cutter'
    || data.role === 'customs';
  if (!isScanner) return null;
  const heading = Number.isFinite(explicit && explicit.heading)
    ? explicit.heading
    : (Number.isFinite(entity.rot) ? entity.rot : 0);
  const halfAngle = Number.isFinite(explicit && explicit.halfAngle)
    ? explicit.halfAngle
    : CUSTOMS_SCAN_HALF_ANGLE;
  const range = Number.isFinite(explicit && explicit.range)
    ? explicit.range
    : CUSTOMS_SCAN_RANGE;
  const dwellS = Number.isFinite(explicit && explicit.dwellS)
    ? explicit.dwellS
    : CUSTOMS_SCAN_DWELL_S;
  return { origin: entity.pos, heading, halfAngle, range, dwellS, scanner: entity };
}

export function aggressionCauseFor(state, attacker, target) {
  const ai = attacker && attacker.data && attacker.data.ai || {};
  if (!attacker || !target) return 'unknown';
  if (attacker.id === state.playerId) return isLawful(target) ? 'player_assault' : 'player_attack';
  if (ai.securityTargetId === target.id) return 'security_response';
  if (ai.retaliationTargetId === target.id) return 'self_defense';
  if (ai.engagementTrigger === 'explicit_refusal' || ai.engagementTrigger === 'ignored_demand') return 'refused_demand';
  if (ai.motive === 'cargo_extortion') return 'valuable_cargo';
  if (ai.engagementTrigger === 'wanted_status') return 'wanted_status';
  if (ai.encounterId || DANGEROUS_CONTEXTS.has(String(ai.spawnContext || ''))) return 'authored_danger';
  return 'unmotivated';
}

export function playerCargoValue(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items || {};
  let total = 0;
  for (const id of Object.keys(items).sort()) {
    total += Math.max(0, Math.floor(Number(items[id]) || 0)) * (COMMODITY_VALUE.get(id) || 1);
  }
  return total;
}

function lawJobResponseClaimId(incident, jobId) {
  if (!incident || typeof incident.id !== 'string' || incident.id.length === 0
    || typeof jobId !== 'string' || jobId.length === 0) return null;
  const value = `${LAW_JOB_RESPONSE_HOLDER}:${incident.id}:${jobId}`;
  return value.length <= 200 ? value : null;
}

function hasCeresJobResponderMarker(state, responder, slotId) {
  const data = responder?.data;
  if (!data) return false;
  if (data.sectorId === CERES_ACTIVITY_SECTOR_ID
    || data.homeSectorId === CERES_ACTIVITY_SECTOR_ID
    || responder.homeSectorId === CERES_ACTIVITY_SECTOR_ID
    || data.ceresActivityCast === true || data.ceresActivityJobOwned === true
    || (slotId != null && (CERES_ACTIVITY_SLOT_IDS.has(slotId) || slotId.startsWith('ceres_')))) {
    return true;
  }
  const seed = state?.meta?.seed;
  for (const slot of CERES_ACTIVITY_ACTOR_SLOTS) {
    const worldRecordId = stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      slot.worldRecordSlotId,
    );
    if (data.worldRecordId === worldRecordId || data.jobId === `job:${worldRecordId}`) return true;
  }
  return false;
}

function isObjectContainer(value) {
  return value != null && typeof value === 'object';
}

function snapshotOwnValue(owner, field) {
  const own = Object.prototype.hasOwnProperty.call(owner, field);
  return { own, value: own ? owner[field] : undefined };
}

function restoreOwnValue(owner, field, snapshot) {
  if (snapshot.own) owner[field] = snapshot.value;
  else delete owner[field];
}

function responseSuccessorsMatch(record, data) {
  return responseSuccessorMatches(record, data, 'ai')
    && responseSuccessorMatches(record, data, 'combat')
    && responseSuccessorMatches(record, data, 'intent');
}

function responseSuccessorMatches(record, data, field) {
  const successors = record?.successors;
  return !!successors && data?.[field] === successors[field];
}

function hasLiveIncident(state, incidentId) {
  const incidents = state?.lawSecurity?.incidents;
  if (!incidents || typeof incidents !== 'object') return false;
  for (const key in incidents) {
    if (!Object.prototype.hasOwnProperty.call(incidents, key)) continue;
    const incident = incidents[key];
    const status = incident?.status;
    if (incident?.id === incidentId
      && (status === 'distress' || status === 'responding' || status === 'monitoring')) return true;
  }
  return false;
}

function releaseControlWithoutForeignWrites(api, record, current, fullCapturedBinding) {
  let displacedData = null;
  let scratchData = null;
  if (current?.alive && !fullCapturedBinding) {
    displacedData = snapshotOwnValue(current, 'data');
    scratchData = { intent: {} };
    current.data = scratchData;
  }
  try {
    return api.releaseControl(record.jobId, record.claimId);
  } finally {
    if (displacedData && current.data === scratchData) restoreOwnValue(current, 'data', displacedData);
  }
}

function snapshotOwnFields(value, fields) {
  const source = value && typeof value === 'object' ? value : null;
  return fields.map((field) => (source && Object.prototype.hasOwnProperty.call(source, field)
    ? { field, own: true, value: source[field] }
    : { field, own: false, value: undefined }));
}

function restoreOwnFields(value, snapshot) {
  if (!value || typeof value !== 'object' || !Array.isArray(snapshot)) return;
  for (const record of snapshot) {
    if (record.own) value[record.field] = record.value;
    else delete value[record.field];
  }
}

function eventEntityId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.entityId ?? payload.id ?? payload.entity?.id ?? null;
}

function inspectionNow(state) {
  const value = Number(state && state.simTime);
  return Number.isFinite(value) ? value : 0;
}

function lawfulInspectionLedger(state) {
  const ledger = state && state.player && state.player.lawfulInspection;
  return ledger && typeof ledger === 'object' && !Array.isArray(ledger) ? ledger : null;
}

function normalizedLawfulInspectionLedger(state) {
  const player = state && state.player;
  if (!player || player.lawfulInspection == null) return { ledger: null, valid: true };
  const ledger = lawfulInspectionLedger(state);
  if (!ledger) return { ledger: null, valid: false };
  if (Object.hasOwn(ledger, 'settledPatrolIds') && !Array.isArray(ledger.settledPatrolIds)) {
    return { ledger, valid: false };
  }
  if (!Number.isSafeInteger(ledger.sequence) || ledger.sequence < 0) ledger.sequence = 0;
  ledger.settledPatrolIds = normalizedSettledPatrolIds(ledger.settledPatrolIds, ledger.last);
  return { ledger, valid: true };
}

function normalizePersistedLawfulInspection(state) {
  const normalized = normalizedLawfulInspectionLedger(state);
  if (!normalized.valid || !normalized.ledger) return normalized;
  const active = normalized.ledger.active;
  // A partial/forged active case is never resumed across Continue. Its valid `last` record still
  // seeds the settled set, while an unreadable live case produces no scan or owner effects.
  if (active && !validLawfulInspectionCase(active)) normalized.ledger.active = null;
  return normalized;
}

function normalizedSettledPatrolIds(rawIds, last) {
  const normalized = [];
  const append = (value) => {
    const id = durableInspectionWorldRecordId(value);
    if (!id) return;
    const prior = normalized.indexOf(id);
    if (prior >= 0) normalized.splice(prior, 1);
    normalized.push(id);
  };
  if (Array.isArray(rawIds)) {
    for (const value of rawIds) append(value);
  }
  // PQ-048.06's first released save shape had only `last`. Treat that valid durable receipt as
  // the first settled actor, so old saves cannot reopen the same patrol after Continue.
  append(last && last.patrolWorldRecordId);
  return normalized.slice(-LAWFUL_INSPECTION_SETTLED_PATROL_CAP);
}

function settledPatrolIds(ledger) {
  return new Set(Array.isArray(ledger && ledger.settledPatrolIds)
    ? ledger.settledPatrolIds.filter(durableInspectionWorldRecordId)
    : []);
}

function recordSettledPatrolId(ledger, worldRecordId) {
  const id = durableInspectionWorldRecordId(worldRecordId);
  if (!ledger || !id || !Array.isArray(ledger.settledPatrolIds)) return false;
  ledger.settledPatrolIds = normalizedSettledPatrolIds([...ledger.settledPatrolIds, id], null);
  return true;
}

function durableInspectionWorldRecordId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
    ? value
    : null;
}

function validLawfulInspectionCase(active) {
  return !!(active && typeof active === 'object' && !Array.isArray(active)
    && typeof active.id === 'string' && active.id
    && durableInspectionWorldRecordId(active.patrolWorldRecordId)
    && typeof active.stationId === 'string' && active.stationId
    && typeof active.factionId === 'string' && active.factionId
    && (active.phase === 'offered' || active.phase === 'scanning'));
}

function ensureLawfulInspectionLedger(state) {
  if (!state || !state.player) return null;
  const normalized = normalizedLawfulInspectionLedger(state);
  if (normalized.ledger || !normalized.valid) return normalized.valid ? normalized.ledger : null;
  const ledger = { sequence: 0, active: null, last: null, settledPatrolIds: [] };
  state.player.lawfulInspection = ledger;
  return ledger;
}

function activeLawfulInspection(state) {
  const active = lawfulInspectionLedger(state)?.active;
  return validLawfulInspectionCase(active) ? active : null;
}

function canOfferLawfulInspection(state) {
  if (!state || state.mode !== 'flight' || state.ui?.docked) return false;
  if (currentSectorId(state) !== LAWFUL_INSPECTION_SECTOR_ID) return false;
  const player = entityById(state, state.playerId);
  return !!(player && player.alive !== false && player.pos);
}

function lawfulInspectionSuspicion(state, economySystem) {
  if (economySystem && typeof economySystem.illicitCargo === 'function') {
    const illicit = economySystem.illicitCargo(state);
    if (Array.isArray(illicit) && illicit.length > 0) return 'illicit_cargo';
  }
  if (hotUntilActive(state?.player?.customsHotUntil, inspectionNow(state), LAWFUL_INSPECTION_FACTION_ID)) {
    return 'customs_hot';
  }
  return null;
}

function hasLivePatrolScan(state) {
  const live = state?.encounterDirector?.live;
  if (!live || typeof live !== 'object') return false;
  return Object.values(live).some((entry) => entry
    && (entry.script === 'patrolScan' || entry.shapeId === 'patrol_scan'));
}

function selectHeliosInspectionPatrol(state, player, alreadySettled = new Set()) {
  if (!player || !player.pos) return null;
  const candidates = [];
  forEachLivingWorldActor(state, (entity) => {
    const worldRecordId = entity && entity.data && entity.data.worldRecordId;
    if (!alreadySettled.has(worldRecordId)
      && isEligibleHeliosInspectionPatrol(state, entity, player)
      && distance2(player.pos, entity.pos) <= LAWFUL_INSPECTION_SCAN_RANGE * LAWFUL_INSPECTION_SCAN_RANGE) {
      candidates.push(entity);
    }
  });
  candidates.sort((a, b) => {
    const d = distance2(a.pos, player.pos) - distance2(b.pos, player.pos);
    if (d) return d;
    return String(a.data.worldRecordId).localeCompare(String(b.data.worldRecordId));
  });
  return candidates[0] || null;
}

function isEligibleHeliosInspectionPatrol(state, patrol, player) {
  if (!patrol || patrol.alive === false || patrol.type !== 'ship' || !patrol.pos || !player || !player.pos) return false;
  if (currentSectorId(state) !== LAWFUL_INSPECTION_SECTOR_ID || patrol.factionId !== LAWFUL_INSPECTION_FACTION_ID) return false;
  const data = patrol.data || {};
  const ai = data.ai || {};
  if (data.trafficRole !== 'patrol' || ai.lawful !== true
    || !durableInspectionWorldRecordId(data.worldRecordId)) return false;
  const homeSectorId = patrol.homeSectorId || data.homeSectorId || data.sectorId || null;
  if (homeSectorId && homeSectorId !== LAWFUL_INSPECTION_SECTOR_ID) return false;
  const playerProtection = protectedStationAt(state, player);
  const patrolProtection = protectedStationAt(state, patrol);
  return playerProtection?.stationId === LAWFUL_INSPECTION_STATION_ID
    && patrolProtection?.stationId === LAWFUL_INSPECTION_STATION_ID;
}

function inspectionPatrolByWorldRecord(state, worldRecordId) {
  if (!durableInspectionWorldRecordId(worldRecordId)) return null;
  let match = null;
  for (const entity of indexedShipLikeScan(state)) {
    if (!entity || entity.alive === false || entity.type !== 'ship'
      || entity.data?.worldRecordId !== worldRecordId) continue;
    // A duplicate stable record is a corrupted/ambiguous rebind, never permission to inspect an
    // arbitrary numeric entity. Wait for the small restore pass and then terminate cleanly.
    if (match) return null;
    match = entity;
  }
  return match;
}

function inspectionEventMatchesPatrol(state, payload, worldRecordId) {
  if (!payload || !durableInspectionWorldRecordId(worldRecordId)) return false;
  const eventEntity = payload.entity || entityById(state, eventEntityId(payload));
  return !!(eventEntity && eventEntity.data?.worldRecordId === worldRecordId);
}

function publicLawfulInspection(activeCase) {
  return {
    id: activeCase.id,
    patrolWorldRecordId: activeCase.patrolWorldRecordId,
    stationId: activeCase.stationId,
    sectorId: activeCase.sectorId,
    factionId: activeCase.factionId,
    suspicion: activeCase.suspicion,
    phase: activeCase.phase,
    offeredAt: activeCase.offeredAt,
    deadlineAt: activeCase.deadlineAt,
  };
}

function freshState() {
  return {
    version: LAW_SECURITY_VERSION,
    incidents: {},
    receipts: [],
    nextAmbientScanTick: 0,
    nextIncidentTick: 0,
    wantedWarrant: null,
    wantedCheckpoint: null,
    wantedImpound: null,
  };
}

function ensureState(state) {
  if (!state.lawSecurity || typeof state.lawSecurity !== 'object' || Array.isArray(state.lawSecurity)) state.lawSecurity = freshState();
  const own = state.lawSecurity;
  own.version = LAW_SECURITY_VERSION;
  if (!own.incidents || typeof own.incidents !== 'object' || Array.isArray(own.incidents)) own.incidents = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!Number.isInteger(own.nextAmbientScanTick)) own.nextAmbientScanTick = 0;
  if (!Number.isInteger(own.nextIncidentTick)) own.nextIncidentTick = 0;
  if (own.wantedWarrant != null && (typeof own.wantedWarrant !== 'object' || Array.isArray(own.wantedWarrant))) {
    own.wantedWarrant = null;
  }
  if (own.wantedCheckpoint != null && (typeof own.wantedCheckpoint !== 'object' || Array.isArray(own.wantedCheckpoint))) {
    own.wantedCheckpoint = null;
  }
  if (own.wantedImpound != null && (typeof own.wantedImpound !== 'object' || Array.isArray(own.wantedImpound))) {
    own.wantedImpound = null;
  }
  return own;
}

function isArmedNpc(entity, state) {
  if (!entity || entity.alive === false || entity.id === state.playerId || entity.type !== 'ship') return false;
  return !!(entity.data && entity.data.ai);
}

function isPirateLike(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  const words = `${ai.archetype || ''} ${ai.doctrine || ''} ${ai.role || ''} ${data.role || ''} ${entity.factionId || ''}`.toLowerCase();
  return words.includes('pirate') || words.includes('raider') || words.includes('scavenger')
    || words.includes('corsair') || entity.factionId === 'faction_reach';
}

function isLawful(entity) {
  if (!entity) return false;
  const ai = entity.data && entity.data.ai || {};
  return ai.lawful === true || (entity.type === 'station' && LAW_FACTIONS.has(entity.factionId));
}

function isProtectedCivilian(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  if (data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT) return true;
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'].some((word) => role.includes(word));
}

function isCivilianHauler(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  if (data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT) return true;
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || '').toLowerCase();
  return role.includes('hauler');
}

function ceresDistressJurisdiction(state, victim) {
  if (!state || !victim || !isCeresDistressSubject(state, victim)) return null;
  if (currentSectorId(state) !== CERES_ACTIVITY_SECTOR_ID) return null;
  const station = stationByPublicId(state, CERES_DISTRESS_STATION_ID);
  if (!station || station.alive === false) return null;
  return {
    stationId: CERES_DISTRESS_STATION_ID,
    entityId: station.id == null ? null : station.id,
    factionId: station.factionId || station.data && station.data.factionId || 'faction_dmc',
    radius: CERES_POCKET_DISTRESS_RADIUS,
    rankFromVictim: true,
  };
}

function isCeresDistressSubject(state, victim) {
  if (isCivilianHauler(victim)) return true;
  if (isJettisonedCargoPod(victim)) return true;
  return isCivilianHauler(entityById(state, cargoPodOwnerId(victim)));
}

function resolveIncidentVictim(state, request) {
  if (!request) return null;
  if (request.victim && typeof request.victim === 'object') return request.victim;
  return entityById(state, request.victimEntityId ?? request.victimId ?? request.ownerId);
}

function findCivilianHauler(state) {
  let fallback = null;
  let preferred = null;
  forEachLivingWorldActor(state, (entity) => {
    if (preferred || !isCivilianHauler(entity)) return;
    if (entity.data && entity.data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT) {
      preferred = entity;
      return;
    }
    if (!fallback) fallback = entity;
  });
  return preferred || fallback;
}

function cargoPodOwnerId(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const identity = data.cargoIdentity && typeof data.cargoIdentity === 'object' ? data.cargoIdentity : null;
  const ownership = data.ownership && typeof data.ownership === 'object' ? data.ownership : null;
  const ownerId = data.ownerId
    ?? entity.ownerId
    ?? (ownership && ownership.ownerId)
    ?? (identity && identity.ownerId);
  return ownerId == null || ownerId === '' ? null : ownerId;
}

function sameLawEntityId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function incidentRingOrigin(incident, victim, station) {
  if (incident && incident.rankFromVictim && victim && victim.pos) return victim.pos;
  return station && station.pos || victim && victim.pos || { x: 0, z: 0 };
}

function entityById(state, id) {
  return id == null || !state || !state.entities || typeof state.entities.get !== 'function' ? null : state.entities.get(id) || null;
}

function stationByPublicId(state, stationId) {
  const indexed = state && state.entityIndex && state.entityIndex.byStationId;
  if (indexed && typeof indexed.get === 'function' && indexed.has(stationId)) {
    return indexed.get(stationId);
  }
  return findLivingWorldActor(state, (entity) => {
    if (entity.type !== 'station') return false;
    const id = entity.data && entity.data.stationId || entity.stationId || entity.id;
    return String(id) === String(stationId);
  });
}

function clearTarget(entity, targetId) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  const combat = data.combat || (data.combat = {});
  clearCombatTarget(combat, targetId);
  const intent = data.intent || (data.intent = {});
  clearFiringIntent(intent);
}

function clearCombatTarget(combat, targetId) {
  if (targetId == null || combat.targetId === targetId) combat.targetId = null;
  if (targetId == null || combat.lockTarget === targetId) combat.lockTarget = null;
}

function clearFiringIntent(intent) {
  intent.fire = false;
  intent.fireGroup = null;
}

function sanctuaryWithdrawalVector(state, entity, target, jurisdiction) {
  const center = protectionCenter(state, jurisdiction, target);
  let dx = Number(entity && entity.pos && entity.pos.x) - Number(center && center.x);
  let dz = Number(entity && entity.pos && entity.pos.z) - Number(center && center.z);
  let length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    dx = Number(entity && entity.pos && entity.pos.x) - Number(target && target.pos && target.pos.x);
    dz = Number(entity && entity.pos && entity.pos.z) - Number(target && target.pos && target.pos.z);
    length = Math.hypot(dx, dz);
  }
  if (length < 1e-6) {
    dx = (entity.id & 1) === 0 ? 1 : -1;
    dz = 0;
    length = 1;
  }
  return { x: dx / length, z: dz / length };
}

function protectionCenter(state, jurisdiction, fallback) {
  const station = entityById(state, jurisdiction && jurisdiction.entityId)
    || stationByPublicId(state, jurisdiction && jurisdiction.stationId);
  if (station && station.pos) return { x: station.pos.x, z: station.pos.z };
  if (jurisdiction && jurisdiction.stationId === 'station_helios') {
    return sectorGlobalOrigin('sector_helios_prime');
  }
  if (fallback && fallback.pos) return { x: fallback.pos.x, z: fallback.pos.z };
  return { x: 0, z: 0 };
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || 'unknown';
}

function sectorSecurity(state) {
  return effectiveLawSecurity(state);
}

export function effectiveLawSecurity(state) {
  const id = currentSectorId(state);
  const sec = state && state.world && state.world.sectors && state.world.sectors[id];
  const baseline = Number.isFinite(sec && sec.security) ? sec.security : 0.5;
  return effectiveRegionalSecurity(state, id, baseline);
}

function distance2(a, b) {
  const dx = Number(a && a.x) - Number(b && b.x);
  const dz = Number(a && a.z) - Number(b && b.z);
  return dx * dx + dz * dz;
}

// Same {had,value} claim idiom as encounterDirector's restore snapshot: record whether the key
// existed so stand-down can hand back exactly the pre-dispatch contract — present value restored,
// absent stays absent.
function ownSnapshot(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
    ? { had: true, value: object[key] }
    : { had: false, value: undefined };
}

function restoreSnapshot(object, key, snapshot) {
  if (snapshot && snapshot.had) object[key] = snapshot.value;
  else delete object[key];
}

function releaseResponseMoraleClaim(ai) {
  if (!ai) return;
  restoreSnapshot(ai, 'moraleImmune', ai[SECURITY_RESPONSE_MORALE_RESTORE]);
  delete ai[SECURITY_RESPONSE_MORALE_RESTORE];
}

export function wantedWarrantFor(state) {
  const own = state && state.lawSecurity;
  return own && own.wantedWarrant ? publicWantedWarrant(own.wantedWarrant) : null;
}

export function wantedCheckpointFor(state) {
  const own = state && state.lawSecurity;
  return own && own.wantedCheckpoint ? publicWantedCheckpoint(own.wantedCheckpoint) : null;
}

export function wantedImpoundFor(state) {
  const own = state && state.lawSecurity;
  return own && own.wantedImpound ? publicWantedImpound(own.wantedImpound) : null;
}

function publicWantedImpound(pound) {
  if (!pound) return null;
  return {
    poundId: pound.poundId,
    billId: pound.billId,
    yardId: pound.yardId,
    lockId: pound.lockId,
    clerkId: pound.clerkId,
    targetId: pound.targetId,
    tier: pound.tier,
    postedAt: pound.postedAt,
    open: pound.open !== false,
    held: !!pound.held,
    recoveredBy: pound.recoveredBy || null,
    yard: pound.yard ? { x: pound.yard.x, z: pound.yard.z } : null,
    lock: pound.lock ? { x: pound.lock.x, z: pound.lock.z } : null,
    arrival: pound.arrival ? { x: pound.arrival.x, z: pound.arrival.z } : null,
  };
}

function overlapsImpoundPad(entity, pad) {
  if (!entity || !entity.pos || !pad || !pad.pos) return false;
  const reach = (Number(entity.radius) || 8) + (Number(pad.radius) || WANTED_IMPOUND_PAD_RADIUS);
  return distance2(entity.pos, pad.pos) <= reach * reach;
}

function publicWantedCheckpoint(checkpoint) {
  if (!checkpoint) return null;
  return {
    checkpointId: checkpoint.checkpointId,
    netId: checkpoint.netId,
    cutterId: checkpoint.cutterId,
    targetId: checkpoint.targetId,
    tier: checkpoint.tier,
    postedAt: checkpoint.postedAt,
    intact: checkpoint.intact !== false,
    held: !!checkpoint.held,
    brokenBy: checkpoint.brokenBy || null,
    lane: checkpoint.lane ? { x: checkpoint.lane.x, z: checkpoint.lane.z } : null,
    arrival: checkpoint.arrival ? { x: checkpoint.arrival.x, z: checkpoint.arrival.z } : null,
  };
}

function isWantedNetDecoy(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  if (isJettisonedCargoPod(entity)) return true;
  const data = entity.data;
  return !!(data && (data.thrownDecoy === true || data.wantedDecoy === true));
}

function findDecoyInCheckpointCone(state, net, player) {
  const cone = customsScanConeOf(net);
  if (!cone) return null;
  const playerId = player && player.id;
  let found = null;
  forEachJobInteractable(state, (entity) => {
    if (found || !isWantedNetDecoy(entity) || entity.id === playerId || entity.id === net.id) return;
    if (pointInScanCone(cone.origin, cone.heading, cone.range, cone.halfAngle, entity.pos)) {
      found = entity;
    }
  });
  return found;
}

function overlapsWantedNet(entity, net) {
  if (!entity || !entity.pos || !net || !net.pos) return false;
  const reach = (Number(entity.radius) || 8) + (Number(net.radius) || WANTED_NET_RADIUS);
  return distance2(entity.pos, net.pos) <= reach * reach;
}

function entitySpeed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot(Number(vel && vel.x) || 0, Number(vel && vel.z) || 0);
}

function publicWantedWarrant(warrant) {
  if (!warrant) return null;
  return {
    contractId: warrant.contractId,
    hunterId: warrant.hunterId,
    targetId: warrant.targetId,
    tier: warrant.tier,
    postedAt: warrant.postedAt,
    arrival: warrant.arrival ? { x: warrant.arrival.x, z: warrant.arrival.z } : null,
  };
}

function publicIncident(incident) {
  return {
    id: incident.id,
    stationId: incident.stationId,
    factionId: incident.factionId,
    attackerId: incident.attackerId,
    victimId: incident.victimId,
    victimAnchor: incident.victimAnchor ? { ...incident.victimAnchor } : null,
    cause: incident.cause,
    status: incident.status,
    outcome: incident.outcome || null,
    responderIds: incident.responderIds.slice(),
    startedAt: incident.startedAt,
    dispatchAt: incident.dispatchAt || null,
    dispatchedAt: incident.dispatchedAt || null,
    dispatchDelayS: incident.dispatchDelayS || null,
    responderCap: incident.responderCap || 0,
    security: incident.security,
    resolvedAt: incident.resolvedAt || null,
  };
}

// ── PQ-019B incident-intake support ───────────────────────────────────────────────────────────────

/**
 * Bounded witness query radius. Only ever evaluated at a reported theft transition, never per frame.
 *
 * DELIBERATELY SMALLER than `LAWFUL_STATION_PROTECTION_MIN` (600 WU, engagementAuthority.js). A
 * lawful station is itself a lawful witness, so if this radius were the larger of the two then every
 * position inside a jurisdiction would automatically be inside witness range and the witness gate
 * could never fire — a guard that cannot deny is not a guard. Being inside a legal ring and being
 * SEEN are separate facts, and the packet requires the second one to be checkable.
 */
export const LAW_INCIDENT_WITNESS_RADIUS = 450;
/** How far past the jurisdiction ring an already-existing lawful unit still counts as in range. */
export const LAW_INCIDENT_RESPONDER_MARGIN = 1000;
/** Hard cap on witnesses carried in a receipt. The query is bounded work, not an all-pairs scan. */
export const LAW_INCIDENT_WITNESS_CAP = 8;
const REPORTED_INCIDENT_CAP = 16;

/** Entity kinds a player kill can be adjudicated over. Wrecks/pickups/rocks are not victims. */
const LAW_KILL_ADJUDICATION_TYPES = new Set(['ship', 'fighter', 'drone', 'hauler', 'capital', 'station']);
/** The kill gate reuses the theft-report eyes: same radius, same "who could see the act" rule. */
const LAW_KILL_WITNESS_RADIUS = LAW_INCIDENT_WITNESS_RADIUS;
/** Lawful dock clearance: assessed fine for the two escapable tiers, real credits, never free. */
const LAW_DOCK_FINE_BASE_CR = 150;
const LAW_DOCK_FINE_PER_LEVEL_CR = 100;

/**
 * The reported-incident ledger, created ONLY on first actual use.
 *
 * Lazy on purpose. `check:sim:compare` replays the golden run through a save/restore boundary, and a
 * key that materializes in `init`/`newGame`/`ensureState` would exist on one leg of that comparison
 * and not the other. No heist is scheduled in the golden scenario, so this object is never built
 * there and the seam is provably inert.
 *
 * NOTE (live-symbol delta): `state.lawSecurity` is NOT in the save owner's capture plan, so this
 * ledger is session-scoped. Cross-reload idempotence does not depend on it: `incidentReceiptId` is a
 * content hash of stable inputs, so the same report reproduces the same id after a load, and the
 * arbiter's durable effect journal is what stops an effect from being applied twice.
 */
function readReportedIncident(state, reportId) {
  const own = state && state.lawSecurity;
  const ledger = own && own.reportedIncidents;
  return ledger && typeof ledger === 'object' && !Array.isArray(ledger)
    ? ledger[reportId] || null
    : null;
}

function storeReportedIncident(state, receipt) {
  const own = ensureState(state);
  if (!own.reportedIncidents || typeof own.reportedIncidents !== 'object'
    || Array.isArray(own.reportedIncidents)) {
    own.reportedIncidents = {};
  }
  own.reportedIncidents[receipt.reportId] = receipt;
  const keys = Object.keys(own.reportedIncidents);
  while (keys.length > REPORTED_INCIDENT_CAP) delete own.reportedIncidents[keys.shift()];
  return receipt;
}

function cleanLawId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 && !trimmed.includes('|') ? trimmed : null;
}

function finiteLawPoint(pos) {
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
    ? { x: pos.x, z: pos.z }
    : null;
}

/**
 * Who could see this. There is NO witness owner in the live codebase — jurisdiction
 * (`protectedStationAt`) and responder ranking (`rankLawfulResponders`) exist, witnesses do not — so
 * this predicate is introduced here rather than reused, and is kept deliberately narrow:
 *
 *   * a lawful unit (`isLawful`: `ai.lawful === true`, or a lawful-faction station), or
 *   * an entity an owner has explicitly marked `data.lawWitness === true`.
 *
 * The marker exists so a facility or authored actor can be a witness without this file learning what
 * a heist is. Sorted by distance then stable id, capped — deterministic and bounded.
 */
export function lawWitnessesNear(state, { pos, offenderEntityId = null, radius = LAW_INCIDENT_WITNESS_RADIUS } = {}) {
  const anchor = finiteLawPoint(pos);
  if (!state || !anchor) return [];
  const limitSq = Math.max(0, Number(radius) || 0) ** 2;
  const out = [];
  const seen = new Set();
  const consider = (entity) => {
    if (!entity || !entity.pos) return;
    if (offenderEntityId != null && entity.id === offenderEntityId) return;
    if (entity.id === state.playerId) return;
    if (seen.has(entity.id)) return;
    if (!isLawful(entity) && entity.data?.lawWitness !== true) return;
    const d2 = distance2(entity.pos, anchor);
    if (d2 > limitSq) return;
    seen.add(entity.id);
    out.push({
      stableId: String(entity.data?.worldRecordId
        || entity.data?.stationId
        || entity.data?.heistFacilityId
        || `entity:${entity.id}`),
      entityId: entity.id,
      distanceSq: d2,
      lawful: isLawful(entity),
    });
  };
  // Living-world actors never include dressing FX. Authored heist/facility markers opt in with
  // `data.lawWitness` and live on that dressing type, so they have their own walk.
  forEachLivingWorldActor(state, consider);
  forEachExplicitWitnessMarker(state, consider);
  return out
    .sort((a, b) => a.distanceSq - b.distanceSq || a.stableId.localeCompare(b.stableId))
    .slice(0, LAW_INCIDENT_WITNESS_CAP);
}

/**
 * Civilian eyes on a kill. `lawWitnessesNear` is deliberately narrow (lawful units and marked
 * witnesses) because a theft report needs a reporting party; a watched MURDER is different —
 * the hauler who saw you vent a ship three hundred meters off her bow calls it in. Protected
 * civilians (`isProtectedCivilian`) inside the same radius therefore count as kill witnesses.
 * Entities already collected as lawful witnesses are skipped by id, so the combined list is
 * still deterministic, sorted, and capped by the caller.
 */
function civilianKillWitnessesNear(state, pos, offenderEntityId, alreadyCollected, victimEntityId = null) {
  const anchor = finiteLawPoint(pos);
  if (!state || !anchor) return [];
  const limitSq = LAW_KILL_WITNESS_RADIUS ** 2;
  const taken = new Set((alreadyCollected || []).map((w) => w.entityId));
  const out = [];
  forEachLivingWorldActor(state, (entity) => {
    if (!entity || !entity.pos || entity.alive === false) return;
    if (entity.id === offenderEntityId || entity.id === state.playerId) return;
    if (victimEntityId != null && entity.id === victimEntityId) return; // the dead cannot testify
    if (taken.has(entity.id)) return;
    if (!isProtectedCivilian(entity)) return;
    const d2 = distance2(entity.pos, anchor);
    if (d2 > limitSq) return;
    out.push({
      stableId: String(entity.data?.worldRecordId
        || entity.data?.stationId
        || `entity:${entity.id}`),
      entityId: entity.id,
      distanceSq: d2,
      lawful: false,
      civilian: true,
    });
  });
  return out.sort((a, b) => a.distanceSq - b.distanceSq || a.stableId.localeCompare(b.stableId));
}

/** Stable identity for a kill victim, for the idempotent report key and the receipt. */
function victimStableIdOf(victim, payload) {
  const data = victim && victim.data || {};
  const id = data.worldRecordId
    || data.stationId
    || (payload && payload.id != null ? `entity:${payload.id}` : null)
    || (victim && victim.id != null ? `entity:${victim.id}` : null);
  return id == null ? null : String(id);
}

export default lawSecurity;
