// lawSecurity.js — jurisdiction, motive, and response authority for live space.
//
// This system closes the gap between the tactical AI's final fire gate and authored encounter
// scripts. Ambient armed ships do not become anonymous murder-tops: valuable cargo can produce a
// toll parley, an empty hold produces watchful neutrality, and the player's first shot produces a
// named retaliation cause. Inside a lawful station's protection volume, actual hostile damage
// dispatches a patrol response that can target criminals even though legacy NPC team numbers are
// shared. Credits/cargo/rep/heat remain with their canonical owners.

import { hash32 } from '../core/rng.js';
import { COMMODITIES } from '../data/commodities.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../data/sectorActivityPockets.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import {
  is47aScavengerCounterplayAuthorized,
  protectedStationAt,
} from '../ai/engagementAuthority.js';
import { hotUntilActive } from '../economy/customsRisk.js';
import { isPlayerWanted } from './heat.js';
import { makeEnemySpawnSpec } from './combat.js';
import { patrolCanInitiateScan } from './encounterScripts.js';
import { effectiveRegionalSecurity } from './regionalEcology.js';
import {
  authorityResponsePolicy,
  rankLawfulResponders,
  reserveArrivalPoint,
} from '../law/authorityResponse.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

export const LAW_SECURITY_VERSION = 2;
export const AMBIENT_TOLL_VALUE_FLOOR = 120;

const RESPONSE_GRACE_S = 6;
const RESPONSE_CLEARANCE = 320;
const RECEIPT_CAP = 24;
const LAW_JOB_RESPONSE_HOLDER = 'lawSecurity';
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
    this._nextInspectionTick = 0;
    this._inspectionRebindPasses = 0;
    ensureState(this.state);
    this._onDamage = (payload) => this._handleDamage(payload);
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
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:damage', this._onDamage);
      this.bus.on('entity:spawned', this._onSpawned);
      this.bus.on('entity:killed', this._onResponderGone);
      this.bus.on('entity:destroyed', this._onResponderGone);
      this.bus.on('sector:exit', this._onSectorExit);
      this.bus.on('save:restoring', this._onSaveRestoring);
      this.bus.on('save:loaded', this._onSaveLoaded);
      this.bus.on('lawfulInspection:choose', this._onInspectionChoice);
      this.bus.on('contraband:scanned', this._onInspectionScanned);
      this.bus.on('player:death', this._onPlayerDeath);
    }
  },

  newGame() {
    this._releaseAllJobResponses('new_game');
    if (this.state) this.state.lawSecurity = freshState();
    if (this.state && this.state.player) delete this.state.player.lawfulInspection;
    this._resetInspectionTransient();
  },

  update(_dt, state) {
    this._reconcileJobResponses();
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    this._enforceSanctuaryWithdrawals(state);
    this._updateLawfulInspection(state);
    if ((state.tick | 0) >= (own.nextAmbientScanTick | 0)) {
      own.nextAmbientScanTick = (state.tick | 0) + AMBIENT_SCAN_INTERVAL_TICKS;
      for (const entity of state.entityList || []) this._stampAmbient(entity);
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
    for (const entity of state.entityList || []) {
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
      const jurisdiction = protectedStationAt(state, target) || (player && protectedStationAt(state, player));
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
      return;
    }

    const targetProtected = target.id === state.playerId || isLawful(target) || isProtectedCivilian(target);
    if (!targetProtected || isLawful(attacker)) return;
    const jurisdiction = protectedStationAt(state, target);
    if (jurisdiction) this._openIncident(attacker, target, jurisdiction,
      target.id === state.playerId || isLawful(target) ? 'hostile_fire' : 'npc_piracy');
    else if (isLawful(target) && target.type !== 'station') this._authorizeResponder(target, attacker, null, 'self_defense');
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
    };
    const policy = authorityResponsePolicy(effectiveLawSecurity(state));
    incident.security = policy.security;
    incident.dispatchDelayS = policy.dispatchDelayS;
    incident.dispatchAt = incident.startedAt + policy.dispatchDelayS;
    incident.responderCap = policy.responderCap;
    incident.reserveAllowed = policy.reserveAllowed;
    incident.challengeWindowS = policy.challengeWindowS;
    own.incidents[key] = incident;
    this._say('alert', `CONTROL: distress logged. Patrol ETA ${policy.dispatchDelayS.toFixed(2)} seconds.`, `law:distress:${incident.id}`, jurisdiction.factionId);
    this._emit('law:distressRaised', publicIncident(incident));
    this._emit('law:incidentOpened', publicIncident(incident));
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

  _releaseJobResponseFor(incidentId, entityId, reason) {
    for (const record of this._jobResponseClaims?.values() || []) {
      if (record.incidentId === incidentId && record.entityId === entityId) {
        this._releaseJobResponse(record, reason);
        return true;
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
    const anchor = station && station.pos || victim.pos;
    const unfilteredCandidates = isLawful(victim) && victim.type === 'ship'
      ? [victim, ...(state.entityList || [])]
      : (state.entityList || []);
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
        return;
      }
    } else if (!dispatched.length && hasLiveResponse) {
      incident.status = 'responding';
      return;
    }
    incident.status = dispatched.length ? 'responding' : 'monitoring';
    const payload = publicIncident(incident);
    this._emit('law:dispatchStarted', payload);
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
    ai.motive = motive === 'self_defense' ? 'self_defense' : 'jurisdiction_enforcement';
    ai.engagementTrigger = motive === 'self_defense' ? 'player_attack' : 'security_response';
    ai.zoneId = incident ? `jurisdiction:${incident.stationId}` : String(ai.zoneId || 'patrol_route');
    ai.approachTelegraph = 'patrol_challenge';
    ai.noFireResponseWindowS = incident ? incident.challengeWindowS : 1;
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    const anchor = incident
      ? (stationByPublicId(state, incident.stationId)?.pos || responder.pos)
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
    else if (station && distance2(attacker.pos, station.pos) > Math.pow(incident.radius + RESPONSE_CLEARANCE, 2)
      && now - incident.lastDamageAt >= RESPONSE_GRACE_S
      && !(attacker.id === state.playerId && isPlayerWanted(state))) {
      outcome = 'disengaged';
    }
    if (!outcome) return;
    incident.status = 'resolved';
    incident.outcome = outcome;
    incident.resolvedAt = now;
    for (const id of incident.responderIds) {
      this._clearResponder(entityById(state, id), incident.attackerId, incident.id, id);
    }
    delete ensureState(state).incidents[key];
    this._say('info', 'CONTROL: threat clear. Station approach secure.', `law:clear:${incident.id}`, incident.factionId);
    this._emit('law:incidentResolved', publicIncident(incident));
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
    const ai = data.ai || (data.ai = {});
    if (ai.securityTargetId !== targetId) return;
    ai.securityTargetId = null;
    ai.passive = false;
    ai.engagementTrigger = 'wanted_status';
    ai.motive = 'law_enforcement';
    ai.roe = RulesOfEngagement.LAWFUL_WANTED_ONLY;
    ai.activity = normalizeActivity({
      kind: ActivityKind.RETURN_TO_ANCHOR,
      reason: 'security_response:clear',
      anchor: ai.activity && ai.activity.anchor || responder.pos,
      leashRadius: ai.activity && ai.activity.leashRadius || 2600,
      startedTick: state.tick | 0,
    });
    clearTarget(responder, targetId);
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
    const jurisdiction = protectedStationAt(state, { pos });
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
    const responders = rankLawfulResponders(state.entityList || [], pos, {
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
    return denial;
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

  destroy() {
    this._releaseAllJobResponses('destroy');
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onDamage) this.bus.off('combat:damage', this._onDamage);
      if (this._onSpawned) this.bus.off('entity:spawned', this._onSpawned);
      if (this._onResponderGone) {
        this.bus.off('entity:killed', this._onResponderGone);
        this.bus.off('entity:destroyed', this._onResponderGone);
      }
      if (this._onSectorExit) this.bus.off('sector:exit', this._onSectorExit);
      if (this._onSaveRestoring) this.bus.off('save:restoring', this._onSaveRestoring);
    }
    this._onDamage = null;
    this._onSpawned = null;
    this._onResponderGone = null;
    this._onSectorExit = null;
    this._onSaveRestoring = null;
  },
};

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
  for (const entity of state.entityList || []) {
    const worldRecordId = entity && entity.data && entity.data.worldRecordId;
    if (!alreadySettled.has(worldRecordId)
      && isEligibleHeliosInspectionPatrol(state, entity, player)
      && distance2(player.pos, entity.pos) <= LAWFUL_INSPECTION_SCAN_RANGE * LAWFUL_INSPECTION_SCAN_RANGE) {
      candidates.push(entity);
    }
  }
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
  for (const entity of state?.entityList || []) {
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
  return { version: LAW_SECURITY_VERSION, incidents: {}, receipts: [], nextAmbientScanTick: 0, nextIncidentTick: 0 };
}

function ensureState(state) {
  if (!state.lawSecurity || typeof state.lawSecurity !== 'object' || Array.isArray(state.lawSecurity)) state.lawSecurity = freshState();
  const own = state.lawSecurity;
  own.version = LAW_SECURITY_VERSION;
  if (!own.incidents || typeof own.incidents !== 'object' || Array.isArray(own.incidents)) own.incidents = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!Number.isInteger(own.nextAmbientScanTick)) own.nextAmbientScanTick = 0;
  if (!Number.isInteger(own.nextIncidentTick)) own.nextIncidentTick = 0;
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
  const ai = data.ai || {};
  const role = String(data.trafficRole || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'].some((word) => role.includes(word));
}

function entityById(state, id) {
  return id == null || !state || !state.entities || typeof state.entities.get !== 'function' ? null : state.entities.get(id) || null;
}

function stationByPublicId(state, stationId) {
  for (const entity of state.entityList || []) {
    if (!entity || entity.type !== 'station') continue;
    const id = entity.data && entity.data.stationId || entity.stationId || entity.id;
    if (String(id) === String(stationId)) return entity;
  }
  return null;
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

function publicIncident(incident) {
  return {
    id: incident.id,
    stationId: incident.stationId,
    factionId: incident.factionId,
    attackerId: incident.attackerId,
    victimId: incident.victimId,
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
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || !entity.pos) continue;
    if (offenderEntityId != null && entity.id === offenderEntityId) continue;
    if (entity.id === state.playerId) continue; // the thief is not a witness against themselves
    if (!isLawful(entity) && entity.data?.lawWitness !== true) continue;
    const d2 = distance2(entity.pos, anchor);
    if (d2 > limitSq) continue;
    out.push({
      stableId: String(entity.data?.worldRecordId
        || entity.data?.stationId
        || entity.data?.heistFacilityId
        || `entity:${entity.id}`),
      entityId: entity.id,
      distanceSq: d2,
      lawful: isLawful(entity),
    });
  }
  return out
    .sort((a, b) => a.distanceSq - b.distanceSq || a.stableId.localeCompare(b.stableId))
    .slice(0, LAW_INCIDENT_WITNESS_CAP);
}

export default lawSecurity;
