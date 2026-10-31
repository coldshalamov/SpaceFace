import { registerMassScaleTow } from './cargoCustody.js';
import { authoredStarterSite, registerStarterBuoyTow } from '../missions/starterWorkday.js';
import { authoredCinderRoute, cinderTargetOwner, cinderAvailableSlots, cinderWaspPosition, stampCinderWasp } from '../missions/cinderRoute.js';
import { syncFurnaceWorksite } from '../missions/furnaceWorksiteRuntime.js';
// Row 413 extraction — methods moved verbatim out of missions.js;
// spread back onto the missions object, so `this` still binds to the system at call time.
import { MARK_HAIL_RANGE_WU, bountyMarkHail, markArchetypePoolFor } from '../data/bountyMarks.js';
import { capitalBossEncounter } from '../data/encounters/capital-boss.js';
import { bumpCollidesFlipEpoch, forEachFieldRock, forEachJobInteractable, forEachLivingWorldActor } from '../world/livingWorldViews.js';
import { deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { hash32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';
import { spawnReckoning } from '../missions/reckoningRuntime.js';
import { promotedPilotIdentity } from '../data/pilotCallsigns.js';
import { CLEAN_CYLINDER } from '../data/cleanCylinder.js';
import { pointContaminationAt } from '../data/alienEcology.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { QUIET_PASSAGE, evaluatePassengerHeatProximity } from '../data/heatLure.js';
import { ESCORT_TURN_DELAY_S, PHYSICAL_ROLE, PHYSICAL_TYPE_SET, SECTOR_BY_ID, authoredDefinitionOf, authoredEncounterOf, b2RescueActorCount, b2RescueActorForRole, b2RescueActorIdentity, b2RescueActorIndexFromEntity, completedMissionTargetSlots, contractClaimSiteMission, convoyWreckPocket, driveDisabledRuntime, ensureB2RescueActorOutcomes, isCampaign47aB2Rescue, isMutationRecovery, lowestVacantSlot, missionHostileSpawnPos, missionStoryTargetSpawnPos, mulberryLocal, physicalRoleOf, stableEntityId, wrapAngleLocal } from './missions.js';
import { RECORD_KIND, missionIdentityOf, stableRecordId } from '../world/worldRecords.js';
import { starterRamHail } from '../data/starterJobs.js';
import { QUIET_BERTH_TYPE, SPLIT_MANIFEST_TYPE } from '../data/yardContracts.js';
import { AUTHORED_SET_PIECE_TYPE, CAPITAL_BOSS_TYPE } from '../data/missions.js';
import { QUIET_APPROACH_RANGE_WU } from '../data/missionConditions.js';
import { syncEntityCollisionIndexMembership, syncEntitySectorMembership, syncEntityTypeLaneMembership } from '../core/coreSystem.js';
import { registerEntityWorldRecordId } from '../world/livingWorldViews.js';
import { CONTRACT_47A_B2_TAG, missionTargetSlotOf } from './missions.js';

export const missionSpawningOps = {
  // =========================================================================================
  // MISSION-TARGET SPAWNING (lazy, deterministic, no spawn:request consumer exists)
  // =========================================================================================
  /**
   * Enemy-catalog archetypes a target-spawning mission can roll at its destination. The exact
   * roster is rolled at spawn, but the POOL is fixed at accept — warming the pool (≤4 unique
   * hulls) covers every roll, plus the escort/claim hauler, claim-site/rescue wasp crews,
   * ghost-pack nest ids, and set-piece/capital encounter actors.
   */
  _missionTargetArchetypes(m) {
    if (authoredCinderRoute(m)) return ['wasp_swarmer'];
    const archetypes = new Set(markArchetypePoolFor(m && m.riskTier));
    if (m && m.storyTarget && m.storyTarget.archetype) archetypes.add(m.storyTarget.archetype);
    if (m && (m.type === 'escort' || m.type === 'salvage_retrieval')) archetypes.add('mule_trader');
    if (m && m.params && m.params.ghostConvoy) { archetypes.add('reaver_pirate'); archetypes.add('wasp_swarmer'); }
    // The restore stub covers these crews' hulls; the live jump projection must name them
    // too or claim-site/rescue spawns decode at the glass.
    if (contractClaimSiteMission(m)) archetypes.add('wasp_swarmer');
    if (m && m.type === 'rescue_under_fire') archetypes.add('wasp_swarmer');
    // Set pieces and capital contracts spawn their encounter's ship actors — same
    // archetype-or-fallback pick as the spawn sites and the restore stub.
    if (m && (m.type === 'authored_set_piece' || m.type === 'capital_boss')) {
      const encounter = m.type === 'capital_boss'
        ? capitalBossEncounter(m.params && m.params.encounterId)
        : authoredEncounterOf(authoredDefinitionOf(m));
      const fallback = m.type === 'capital_boss' ? 'bruiser_brawler' : 'wasp_swarmer';
      for (const actor of (encounter && encounter.actors) || []) {
        if (actor && actor.kind === 'ship') archetypes.add(actor.archetype || fallback);
      }
    }
    return [...archetypes];
  },

  /** Publish the hull set a mission will need so the render lane decodes it before arrival. */
  _emitMissionTargetProjection(m) {
    if (!m || !m.needsTargets) return;
    const archetypes = this._missionTargetArchetypes(m);
    if (!archetypes.length) return;
    this.bus.emit('mission:targetsProjected', {
      missionId: m.id, destSectorId: m.destSectorId || null, archetypes,
    });
  },

  /** On jump intent, project every active mission whose targets live at the charge target. */
  _projectMissionTargetDecodes(targetSectorId) {
    const active = (this.state.missions && this.state.missions.active) || [];
    for (const m of active) {
      if (!m || m.status !== 'active' || !m.needsTargets) continue;
      if (String(m.destSectorId || '') !== String(targetSectorId || '')) continue;
      this._emitMissionTargetProjection(m);
    }
  },

  /** Spawn bounty/patrol hostiles or the escortee if the player is in the mission's target sector. */
  _ensureMissionTargets(m) {
    if (m.params?.mercyIncidentId || m.params?.wreckCourtCaseId) { m.needsTargets = false; return; }
    if (!m.needsTargets) return;
    if (this.state.world.currentSectorId !== m.destSectorId) return; // defer until the player arrives
    m.targetEntityIds = (m.targetEntityIds || []).filter((id) => {
      const entity = this.state.entities.get(id);
      return entity && entity.alive !== false;
    });
    // _spawnTargetsFor leads with the same adopt + capital-cast reattach pair — calling them
    // here too paid a second living-actor scan per ensure for identical, idempotent output.
    this._spawnTargetsFor(m);
    this._refreshTrackedMissionNav(m);
  },

  /**
   * Adopt live entities rematerialized from world.records (or still alive with missionTag)
   * into m.targetEntityIds so Continue never double-spawns mission targets.
   * World rematerializes before missions restore; mission deserialize clears targetEntityIds.
   */
  _adoptLiveMissionTargets(m) {
    if (!m || !m.id) return 0;
    const existing = new Set(m.targetEntityIds || []);
    const follow = m.params && m.params.poiSignalFollowup;
    // Race gates are beacons, so they deliberately sit outside the living ship/actor view used
    // by ordinary mission targets. Keep their exact durable identities in the beacon domain or a
    // 15-gate course will look empty on every retry and spawn another 15 physical bodies.
    if (m.type === 'race' && !follow) return this._adoptRaceGateTargets(m, existing);
    const list = [];
    // Campaign 47-A B2 uses the existing authored rescue-capsule payload. Adopt it through the
    // cargo-interactable view on Continue instead of respawning the capsule. Authored starter
    // buoys are payloads too; the living-actor view deliberately excludes that type.
    const starterBuoy = m.type === 'tow_recovery' && m.params?.starterJobId === 'starter_pelican' && authoredStarterSite(m);
    const visitMissionTargets = isCampaign47aB2Rescue(m) || starterBuoy
      ? forEachJobInteractable : forEachLivingWorldActor;
    visitMissionTargets(this.state, (e) => { list.push(e); });
    // Tow-recovery cores belong to the rock domain, outside the living-actor view.
    // Only the current promoted mission/slot occupant can survive this adoption boundary.
    if (m.type === 'tow_recovery') forEachFieldRock(this.state, (entity) => {
      if (!entity || entity.alive === false || entity.type !== 'asteroid'
          || this.state.entities.get(entity.id) !== entity
          || physicalRoleOf(entity) !== PHYSICAL_ROLE.SLAG_CORE
          || String(missionIdentityOf(entity)) !== String(m.id)
          || missionTargetSlotOf(entity, m.id) == null) return;
      list.push(entity);
    });
    if (follow) {
      const exact = list.filter((e) => e && e.alive && !e.isPlayer && e.data
        && e.data.worldRecordId === follow.targetRecordId);
      exact.sort((a, b) => {
        const an = Number(a.id), bn = Number(b.id);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
        const as = String(a.id), bs = String(b.id);
        return as < bs ? -1 : (as > bs ? 1 : 0);
      });
      const retained = exact.find((e) => e.id === follow.entityId)
        || exact.find((e) => existing.has(e.id))
        || exact[0]
        || null;
      m.targetEntityIds = [];
      if (!retained) {
        follow.entityId = null;
        return 0;
      }
      for (const e of exact) {
        if (e !== retained) e.alive = false;
      }
      this._stampMissionTargetIdentity(retained, m, 0);
      this._configurePoiSignalTarget(retained, m);
      m.targetEntityIds.push(retained.id);
      return existing.has(retained.id) ? 0 : 1;
    }
    const candidates = list.filter((e) => {
      if (!e || !e.alive || e.isPlayer) return false;
      if (starterBuoy && (e.type !== 'payload' || e.data?.physicalRole !== PHYSICAL_ROLE.SLAG_CORE
        || e.data?.starterWorkdayVersion !== m.params.starterWorkdayVersion
        || e.data?.starterJobId !== m.params.starterJobId || e.data?.starterStep !== m.params.starterStep)) return false;
      const mid = missionIdentityOf(e);
      return mid != null && String(mid) === String(cinderTargetOwner(m));
    });
    candidates.sort((a, b) => {
      const aSlot = missionTargetSlotOf(a, cinderTargetOwner(m));
      const bSlot = missionTargetSlotOf(b, cinderTargetOwner(m));
      if (aSlot != null && bSlot != null && aSlot !== bSlot) return aSlot - bSlot;
      if (aSlot != null) return -1;
      if (bSlot != null) return 1;
      return stableEntityId(a.id).localeCompare(stableEntityId(b.id));
    });
    let adopted = 0;
    const usedSlots = new Set();
    const b2Outcomes = isCampaign47aB2Rescue(m) ? ensureB2RescueActorOutcomes(m) : null;
    const usedB2ActorIndices = new Map();
    const ordered = [];
    for (const e of candidates) {
      let slot = missionTargetSlotOf(e, cinderTargetOwner(m));
      if (authoredCinderRoute(m) && (!Number.isInteger(slot) || slot < 0 || slot >= 3
        || usedSlots.has(slot) || completedMissionTargetSlots(m).has(slot))) {
        // Same finite cast only: never rename a duplicate/cleared survivor to a fourth Wasp.
        // These exact-owned stale duplicates have no new kill, reward or replacement slot.
        if (Number.isInteger(slot) && slot >= 0 && slot < 3) e.alive = false;
        continue;
      }
      if (slot == null || usedSlots.has(slot)) slot = lowestVacantSlot(usedSlots);
      usedSlots.add(slot);
      // Re-stamp durable mission identity if rematerialize omitted a field. Never compact a
      // survivor merely because a lower slot is absent; its mission+slot identity is the save seam.
      this._stampMissionTargetIdentity(e, m, slot);
      stampCinderWasp(m, e, slot);
      if (b2Outcomes) {
        const role = physicalRoleOf(e);
        const actor = role === PHYSICAL_ROLE.POD
          ? b2RescueActorForRole(m, PHYSICAL_ROLE.POD)
          : role === PHYSICAL_ROLE.ESCORT
            ? b2RescueActorForRole(m, PHYSICAL_ROLE.ESCORT) : null;
        if (actor) {
          const count = b2RescueActorCount(m, actor,
            role === PHYSICAL_ROLE.POD ? 'podCount' : 'escortCount');
          const used = usedB2ActorIndices.get(role) || new Set();
          let actorIndex = b2RescueActorIndexFromEntity(m, e, actor, role);
          const savedActorId = e.data && e.data.missionActorId;
          if (savedActorId && actorIndex >= 0
            && b2Outcomes[b2RescueActorIdentity(m, actor, actorIndex)]) {
            e.alive = false;
            continue;
          }
          if (savedActorId && actorIndex >= 0 && used.has(actorIndex)) {
            // Duplicate persistent copies of one authored actor must never become a second cast
            // member merely because Continue materialized both records.
            e.alive = false;
            continue;
          }
          const available = (index) => index >= 0 && index < count
            && !used.has(index)
            && !b2Outcomes[b2RescueActorIdentity(m, actor, index)];
          if (!available(actorIndex)) {
            actorIndex = -1;
            for (let index = 0; index < count; index++) {
              if (available(index)) { actorIndex = index; break; }
            }
          }
          if (actorIndex < 0) {
            // A terminal actor from an older save has no live work left to own.
            e.alive = false;
            continue;
          }
          used.add(actorIndex);
          usedB2ActorIndices.set(role, used);
          e.data.missionActorId = b2RescueActorIdentity(m, actor, actorIndex);
        }
      }
      ordered.push({ id: e.id, slot });
      if (!existing.has(e.id)) adopted++;
      if (e.data && e.data.escortee === 'lead') {
        m._escorteeId = e.id;
        m._escorteeArrived = !!m._escorteeArrived;
      }
    }
    ordered.sort((a, b) => a.slot - b.slot || stableEntityId(a.id).localeCompare(stableEntityId(b.id)));
    m.targetEntityIds = ordered.map((entry) => entry.id);
    return adopted;
  },

  /**
   * Reattach authored race buoys from the entityList beacon domain. Race markers are visual
   * mission furniture, not actors, and therefore cannot be recovered through
   * forEachLivingWorldActor. Existing target ids win per gate slot so Continue preserves the
   * canonical identity; only exact same-mission gate duplicates are retired.
   */
  _adoptRaceGateTargets(m, existing = new Set()) {
    const params = m.params || {};
    const gates = Array.isArray(params.gates) ? params.gates : [];
    if (!gates.length) return 0;
    const closedFinal = params.racingContractId && params.closedCircuit ? gates.length - 1 : -1;
    const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < gates.length
      && slot !== closedFinal;
    const state = this.state;
    const list = Array.isArray(state && state.entityList) ? state.entityList.slice() : [];
    const targetOrder = new Map((Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [])
      .map((id, index) => [id, index]));
    const bySlot = new Map();
    const retire = [];
    const ownedGate = (entity) => {
      if (!entity || entity.alive === false || entity.isPlayer || entity.type !== 'beacon') return false;
      const data = entity.data;
      return !!(data && data.physicalRole === PHYSICAL_ROLE.GATE
        && data.missionTag != null && String(data.missionTag) === String(m.id));
    };
    for (const entity of list) {
      if (!ownedGate(entity)) continue;
      const slot = Number(entity.data && entity.data.raceGateIndex);
      if (!validSlot(slot)) {
        // A closed-circuit finish marker or a slot from an older course revision cannot be a
        // current target. It is safe to retire only with both exact mission and gate-role proof.
        retire.push(entity);
        continue;
      }
      const rows = bySlot.get(slot) || [];
      rows.push({ entity, existing: existing.has(entity.id) });
      bySlot.set(slot, rows);
    }
    const canonical = new Map();
    const stableCandidateOrder = (a, b) => {
      if (a.existing !== b.existing) return a.existing ? -1 : 1;
      const ao = targetOrder.get(a.entity.id);
      const bo = targetOrder.get(b.entity.id);
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return stableEntityId(a.entity.id).localeCompare(stableEntityId(b.entity.id));
    };
    for (const [slot, rows] of bySlot) {
      rows.sort(stableCandidateOrder);
      const keeper = rows[0];
      canonical.set(slot, keeper.entity);
      for (let i = 1; i < rows.length; i++) retire.push(rows[i].entity);
    }
    // Remove only exact-owned duplicate markers. Foreign beacons at the same gate index remain
    // untouched, as do malformed rows without an exact mission identity.
    const remove = this.helpers && this.helpers.removeEntity;
    const retired = new Set();
    for (const entity of retire) {
      if (!ownedGate(entity) || retired.has(entity.id)) continue;
      retired.add(entity.id);
      if (typeof remove === 'function') {
        if (!remove(entity.id, { immediate: true, reason: 'race_gate_duplicate' })) entity.alive = false;
      } else {
        entity.alive = false;
      }
    }
    let adopted = 0;
    const ordered = [];
    for (let slot = 0; slot < gates.length; slot++) {
      const entity = canonical.get(slot);
      if (!entity || entity.alive === false) continue;
      // Gate markers are presentation-owned and must stay out of the native physics body set,
      // including Continue-adopted rows authored before this explicit contract was added.
      entity.physicsBody = false;
      this._stampMissionTargetIdentity(entity, m, slot);
      ordered.push({ slot, id: entity.id });
      if (!existing.has(entity.id)) adopted++;
    }
    m.targetEntityIds = ordered.map((entry) => entry.id);
    return adopted;
  },

  _configurePoiSignalTarget(ent, m) {
    const follow = m && m.params && m.params.poiSignalFollowup;
    if (!ent || !follow) return false;
    ent.team = 2;
    ent.factionId = null;
    ent.type = follow.targetType;
    if (ent.collides !== false) bumpCollidesFlipEpoch();
    ent.collides = false;
    // The flip leaves a permanent stale member otherwise: the entity stays alive as the scan
    // objective, so the collidables/spatial buckets it was appended under carry it forever.
    syncEntityCollisionIndexMembership(this.state && this.state.entityIndex, ent);
    // Same hazard on the type lanes: the rebadged anomaly/wreck keeps shipLike/damageables
    // membership and never joins wrecks/mineables readers without this re-key.
    syncEntityTypeLaneMembership(this.state && this.state.entityIndex, ent);
    ent.data = ent.data || {};
    ent.data.poiType = follow.targetType;
    ent.data.kind = follow.targetType;
    ent.data.scanLabel = follow.targetLabel;
    ent.data.durable = true;
    delete ent.data.ai;
    follow.entityId = ent.id;
    return true;
  },

  /**
   * Stamp homeSectorId + missionId/missionTag/missionPinned + stable worldRecordId before
   * first demotion so capture/kill/Continue keep one mission-target identity.
   */
  _stampMissionTargetIdentity(ent, m, seq) {
    if (!ent || !m) return;
    if (!ent.data) ent.data = {};
    const sectorId = m.destSectorId
      || ent.homeSectorId
      || ent.data.homeSectorId
      || (this.state.world && this.state.world.currentSectorId);
    const targetOwner = cinderTargetOwner(m);
    // World records retain mission/slot identity, not optional story dressing. Authenticate
    // the existing record BEFORE the generic identity writer below can repair its owner tags.
    const b2Key = `mission:${m.id}:0`;
    const restoreB2Mark = m.status === 'active' && m.storyTag === CONTRACT_47A_B2_TAG
      && m.type === 'bounty_hunt' && m.storyTarget?.id === 'npc_elroy'
      && m.storyTarget?.role === 'register_mark' && seq === 0
      && ent.type === 'ship' && ent.alive !== false
      && ent.data.missionId === m.id && ent.data.missionTag === m.id
      && missionTargetSlotOf(ent, m.id) === 0 && ent.data.identityKey === b2Key
      && ent.data.worldRecordId === stableRecordId((this.state.meta && this.state.meta.seed) || 1,
        m.destSectorId, RECORD_KIND.MISSION_TARGET, b2Key)
      && [ent.homeSectorId, ent.data.homeSectorId, ent.data.sectorId]
        .every(id => id == null || id === m.destSectorId);
    ent.data.missionTag = targetOwner;
    ent.data.missionId = targetOwner;
    ent.data.missionPinned = true;
    const combatTarget = m.type === 'bounty_hunt' || m.type === 'patrol_clear';
    const physicalTarget = PHYSICAL_TYPE_SET.has(m.type);
    const durableSlot = (combatTarget || physicalTarget)
      ? Math.max(0, seq | 0)
      : (missionTargetSlotOf(ent, m.id) ?? Math.max(0, seq | 0));
    if (combatTarget || physicalTarget) {
      ent.data.missionTargetSlot = durableSlot;
    }
    // Accepted combat contracts are the authored authority that makes their tagged quarry a
    // legal hostile. Stamp the existing scanner/engagement context here so fresh spawns and
    // Continue-adopted targets agree, without widening ambient team mismatch into hostility.
    // Lawful actors still resolve through scanner's earlier WANTED/securityTargetId gate.
    if ((m.type === 'bounty_hunt' || m.type === 'patrol_clear') && ent.data.ai) {
      const ai = ent.data.ai;
      const playerId = this.state.playerId;
      const player = this.state.entities && this.state.entities.get(playerId);
      ai.spawnContext = 'mission';
      ai.squadId = `mission:${targetOwner}`;
      ai.preferredRole = 'attack';
      ai.motive = 'accepted_combat_contract';
      ai.engagementTrigger = 'accepted_warrant';
      ai.zoneId = ent.data.storyTargetZoneId || m.storyTarget && m.storyTarget.zoneId || ai.zoneId;
      if (player && player.team != null) {
        ai.hostileTeams = [player.team];
      }
      // Re-stamp person identity from the mission record: Continue-adopted hosts restore
      // `ai.name` through the durable record but not `data.name`/`scanLabel`, so a rematerialized
      // mark (or ghost-pack anchor) must be re-dressed here to keep its face on the scanner. Only
      // the mark's own host takes the identity — pack-mates sharing the mission tag stay anonymous,
      // and a stale label on a rematerialized host is overwritten to match.
      if (m.storyTarget && m.storyTarget.name
        && (durableSlot === 0 || ent.data.storyTargetId === m.storyTarget.id)) {
        if (restoreB2Mark) {
          // A conflicting identity is evidence, not an omission: leave it for the waypoint
          // validator to reject. Fresh spawns already carry these fields.
          ent.data.storyTargetId ??= m.storyTarget.id;
          ent.data.storyTargetRole ??= m.storyTarget.role;
        }
        ent.data.name = m.storyTarget.name;
        ent.data.scanLabel = m.storyTarget.label || m.storyTarget.name;
        ent.data.ai.name = m.storyTarget.name;
      }
    }
    ent.flags = ent.flags || {};
    ent.flags.missionPinned = true;
    if (sectorId) {
      ent.homeSectorId = sectorId;
      ent.data.homeSectorId = sectorId;
      if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
      syncEntitySectorMembership(this.state && this.state.entityIndex, ent);
    }
    if (ent.data.worldRecordId || !sectorId) {
      registerStarterBuoyTow(this.state,ent,m);
      registerMassScaleTow(this.state,ent,m);
      return;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const key = `mission:${targetOwner}:${durableSlot}`;
    ent.data.worldRecordId = stableRecordId(seed, sectorId, RECORD_KIND.MISSION_TARGET, key);
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = deferredEnterTick(this.state) | 0;
    // Post-spawn stamp — register it so byWorldRecordId/count answer O(1) (the contender path
    // proves a single carrier) and the per-tick miss-memos see the new carrier immediately.
    registerEntityWorldRecordId(this.state && this.state.entityIndex, ent);
    registerStarterBuoyTow(this.state,ent,m);
    registerMassScaleTow(this.state,ent,m);
  },

  /**
   * Acceptance makes the quarry legally hostile, but does not make it chase a player out of a
   * station berth. Once the player crosses beyond lawful protection, bind the accepted mission's
   * exact live target into the tactical activity/combat seam. This is deliberately mission-owned:
   * ambient ships and unaccepted lookalikes never receive this lock.
   */
  _armAcceptedCombatTargets(m, state = this.state) {
    if (!m || m.status !== 'active' || (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear')) return 0;
    const player = state && state.entities && state.entities.get(state.playerId);
    if (!player || player.alive === false || protectedStationAt(state, player)) return 0;
    let armed = 0;
    for (const id of m.targetEntityIds || []) {
      const ent = state.entities.get(id);
      const data = ent && ent.data;
      const ai = data && data.ai;
      if (!ent || ent.alive === false || !ai || ai.lawful || ai.passive) continue;
      if (String(missionIdentityOf(ent)) !== String(cinderTargetOwner(m))) continue;
      const activity = ai.activity;
      if (activity && activity.targetId !== player.id) {
        ai.activity = Object.freeze({ ...activity, targetId: player.id });
      }
      const combat = data.combat || (data.combat = {});
      if (combat.targetId !== player.id) combat.targetId = player.id;
      armed++;
    }
    return armed;
  },

  /**
   * The board mark speaks once: when the player closes inside the approach band on the spawned
   * writ target, the person behind the posting acknowledges the board that sent the hull. One
   * shot per mission — `_markHailed` rides the ordinary active-mission serialization, so a save
   * mid-stalk does not replay the line. Only `board_writ` roles speak this register — authored
   * career and legacy writs keep their own fiction.
   */
  _maybeMarkHail(m, state) {
    if (!m || !m.storyTarget || m.storyTarget.role !== 'board_writ'
      || !m.storyTarget.name || m._markHailed) return;
    const targetId = (m.targetEntityIds || [])[0];
    const mark = targetId != null && state.entities && state.entities.get(targetId);
    const player = state.entities && state.entities.get(state.playerId);
    if (!mark || mark.alive === false || !player || !mark.pos || !player.pos) return;
    const dx = mark.pos.x - player.pos.x;
    const dz = mark.pos.z - player.pos.z;
    if (dx * dx + dz * dz > MARK_HAIL_RANGE_WU * MARK_HAIL_RANGE_WU) return;
    m._markHailed = true;
    const text = starterRamHail(m.params)
      || bountyMarkHail((state.meta && state.meta.seed) || 1, m.id);
    const voice = this.helpers && this.helpers.voice;
    // A line the arbiter already voiced stays out of the live feed — `_viaVoice` logs it to the
    // backlog only, so the player never reads the same hail twice.
    const said = !!(voice && typeof voice.say === 'function'
      && voice.say({ channel: 'comms', text, kind: 'bountyMark', ttl: 4, id: `bountyMark:${m.id}` }));
    this.bus.emit('comms:popup', { sender: m.storyTarget.name, text, category: 'personal', ttl: 6, _viaVoice: said });
  },

  _spawnTargetsFor(m) {
    if (syncFurnaceWorksite(this, m)) return;
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    // Prefer live rematerialized hosts (Continue) over fresh spawns.
    this._adoptLiveMissionTargets(m);
    // The adopt view never yields asteroids: re-attach the authored capital cast by durable key
    // BEFORE the finite-ledger spawn pass decides what is still owed.
    this._reattachCapitalBossCastTargets(m);
    const player = helpers.player ? helpers.player() : this.state.entities.get(this.state.playerId);
    const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
    const nextRng = (durableSlot = null) => {
      const hash = typeof helpers.hash32 === 'function' ? helpers.hash32 : hash32;
      const seed = durableSlot == null
        ? hash(this.state.meta.seed, m.id, this._spawnSeq++)
        : hash(this.state.meta.seed, m.id, 'mission-target-slot', durableSlot);
      return helpers.mulberry32 ? helpers.mulberry32(seed) : mulberryLocal(seed);
    };
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];

    const follow = m.params && m.params.poiSignalFollowup;
    if (follow) {
      if (m.targetEntityIds.length > 0) return;
      const rng = nextRng();
      const spec = {
        type: follow.targetType,
        factionId: null,
        team: 2,
        pos: { x: follow.targetPos.x, z: follow.targetPos.z },
        vel: { x: 0, z: 0 },
        rot: rng() * Math.PI * 2,
        radius: follow.targetType === 'anomaly' ? 24 : 18,
        mass: follow.targetType === 'anomaly' ? 1 : 50,
        hull: 1,
        hullMax: 1,
        collides: false,
        flags: { noInterp: true, missionPinned: true, durable: true },
        data: {
          worldRecordId: follow.targetRecordId,
          identityKey: `mission:${m.id}:poi-signal`,
          homeSectorId: m.destSectorId,
          sectorId: m.destSectorId,
          durable: true,
          missionId: m.id,
          missionTag: m.id,
          missionPinned: true,
          poiType: follow.targetType,
          kind: follow.targetType,
          scanLabel: follow.targetLabel,
        },
      };
      const ent = helpers.spawnEntity(spec);
      if (ent) {
        this._stampMissionTargetIdentity(ent, m, 0);
        this._configurePoiSignalTarget(ent, m);
        m.targetEntityIds.push(ent.id);
        this.bus.emit('mission:updated', { missionId: m.id, targetEntityId: ent.id });
      }
      return;
    }

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      const cinder = authoredCinderRoute(m);
      // Spawn only the targets still owed (objectiveTarget - progress) so a mid-mission save/load or
      // partial clear doesn't re-spawn already-killed hostiles and leave an orphan.
      // Adopted rematerialized hosts count toward the remaining quota.
      // Ghost-convoy bounties owe the whole nest (anchor + cutters), not a single mark.
      const ghostPack = !!(m.params && m.params.ghostConvoy);
      const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
      const adopted = (m.targetEntityIds || []).length;
      const want = (m.type === 'patrol_clear' || ghostPack) ? remaining : Math.min(1, remaining);
      const knownSlots = new Set((m.targetEntityIds || []).map(id => missionTargetSlotOf(this.state.entities.get(id), cinderTargetOwner(m))));
      const cinderSlots = cinderAvailableSlots(m, knownSlots);
      const n = cinder ? cinderSlots.length : Math.max(0, want - adopted);
      if (n <= 0) {
        if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
        return;
      }
      const budget = helpers.spawnBudget;
      const requester = `mission:${m.id}`;
      const grant = budget && typeof budget.request === 'function'
        ? budget.request(n, requester)
        : n;
      if (grant < n) this._noteMissionSpawnDeferred(m, n, grant);
      if (grant <= 0) return;
      const occupiedSlots = new Set((m.targetEntityIds || []).map((id) => (
        missionTargetSlotOf(this.state.entities.get(id), cinderTargetOwner(m))
      )).filter((slot) => slot != null));
      const completedSlots = completedMissionTargetSlots(m);
      const vacantSlots = cinder ? cinderSlots : [];
      for (let slot = 0; !cinder && vacantSlots.length < n; slot++) {
        if (!occupiedSlots.has(slot) && !completedSlots.has(slot)) vacantSlots.push(slot);
      }
      // Early boards must not roll mid-tier corsairs. Risk-tier pools keep first-hour TTK fair
      // with the starter Pulse Laser S; higher risk opens tougher hulls.
      const riskTier = Math.max(0, Math.round(Number(m.riskTier) || 0));
      // Single source with the board-writ hull pick so a named mark's implied hull is always one
      // this table could roll.
      const pool = markArchetypePoolFor(riskTier);
      let spawned = 0;
      for (let i = 0; i < grant; i++) {
        const durableSlot = vacantSlots[i];
        const rng = nextRng(durableSlot);
        const storyTarget = durableSlot === 0 && m.storyTarget ? m.storyTarget : null;
        // Nest composition mirrors the live scavenger-ambush doctrine (020/215): one reaver anchor
        // holding the seam, wasp cutters working around it. Ordinary bounties keep their tier pool.
        const typeId = cinder ? 'wasp_swarmer' : storyTarget && storyTarget.archetype
          || (ghostPack
            ? (durableSlot === 0 ? 'reaver_pirate' : 'wasp_swarmer')
            : pool[Math.floor(rng() * pool.length)]);
        const level = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
        // The whole ghost pack rings the storyTarget anchor (the authored lane feature the rumor
        // pointed at) so the nest is a PLACE; fall back to the player ring if the anchor fails to
        // resolve — an unresolvable anchor must never silently void the spawn.
        let pos = cinder ? cinderWaspPosition(durableSlot) : null;
        if (storyTarget) pos = missionStoryTargetSpawnPos(m, storyTarget, rng);
        if (!pos && ghostPack && m.storyTarget) pos = missionStoryTargetSpawnPos(m, m.storyTarget, rng);
        if (!pos) pos = missionHostileSpawnPos(this.state, { x: px, z: pz }, rng);
        if (!pos) continue;
        const spec = makeEnemySpawnSpec(typeId, level, pos, {
          factionId: storyTarget && storyTarget.factionId,
          startedTick: deferredEnterTick(this.state),
        });
        spec.data = spec.data || {};
        spec.data.missionTag = m.id; // attribution helper (kill resolver matches by entity id below)
        if (ghostPack && durableSlot === 0 && !spec.data.scanLabel) {
          // The hull the lane news pointed at: a scanner read should name it as the nest's anchor.
          spec.data.scanLabel = 'Raider nest-anchor';
        }
        if (storyTarget) {
          spec.data.storyTargetId = storyTarget.id || null;
          spec.data.storyTargetRole = storyTarget.role || null;
          spec.data.storyTargetZoneId = storyTarget.zoneId || null;
          spec.data.registry = storyTarget.registry || null;
          spec.data.name = storyTarget.name || null;
          spec.data.scanLabel = storyTarget.label || storyTarget.name || 'UNKNOWN';
          if (storyTarget.lastRegisteredOwner) {
            spec.data.lastRegisteredOwner = storyTarget.lastRegisteredOwner;
          }
          if (storyTarget.salvageCargo) {
            spec.data.salvageCargo = storyTarget.salvageCargo;
          }
          spec.data.ai = spec.data.ai || {};
          spec.data.ai.name = storyTarget.name || storyTarget.label || null;
        }
        // B5 paperwork plant: first proving-chain hostile always carries Vale Holdings salvage,
        // including embodied patrol captains that ship a named storyTarget.
        if (durableSlot === 0 && m.storyTag && String(m.storyTag).startsWith('campaign47a:b5:')) {
          if (!spec.data.lastRegisteredOwner) spec.data.lastRegisteredOwner = 'VALE HOLDINGS LLC';
          if (!spec.data.salvageCargo) {
            spec.data.salvageCargo = 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED';
          }
          if (!spec.data.registry || spec.data.registry === storyTarget?.registry) {
            // Prefer owner stamp for inspect; keep scan label identity from captain if present.
            if (!storyTarget) spec.data.registry = 'VALE HOLDINGS LLC';
          }
        }
        let ent;
        try {
          ent = helpers.spawnEntity(spec);
        } catch (error) {
          if (budget && typeof budget.releaseSome === 'function') {
            budget.releaseSome(requester, grant - spawned);
          }
          throw error;
        }
        if (ent) {
          if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
          this._stampMissionTargetIdentity(ent, m, durableSlot);
          stampCinderWasp(m, ent, durableSlot);
          m.targetEntityIds.push(ent.id);
          spawned++;
          if (storyTarget && storyTarget.namedCaptainId) {
            this.bus.emit('encounter:namedCaptainBound', {
              captainId: storyTarget.namedCaptainId, entityId: ent.id,
              missionId: m.id, sectorId: m.destSectorId,
            });
          }
        }
      }
      if (budget && typeof budget.releaseSome === 'function' && spawned < grant) {
        budget.releaseSome(requester, grant - spawned);
      }
      if (spawned === n && this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
    } else if (m.type === 'escort') {
      // Already adopted a live convoy from world.records — do not double-spawn.
      if (m._escorteeId != null && this.state.entities.get(m._escorteeId)) return;
      if ((m.targetEntityIds || []).length > 0) return;
      const budget = helpers.spawnBudget;
      const requester = `mission:${m.id}`;
      // The convoy: a named lead hauler plus wing haulers (070-convoy shape — mules in a column).
      // Old rows accepted before convoy params existed keep their single-hull behavior.
      const convoySize = Math.max(1, Math.min(3, (m.params && m.params.convoySize) || 1));
      const convoyGrant = budget && typeof budget.request === 'function'
        ? budget.request(convoySize, requester)
        : convoySize;
      if (convoyGrant <= 0) {
        this._noteMissionSpawnDeferred(m, convoySize, 0);
        return;
      }
      const rng = nextRng();
      // Deterministic lead identity: the same mission always crews the same convoy.
      const pilot = promotedPilotIdentity(0, m.id);
      const level = Math.min(6, Math.max(1, Math.round((lvLo + lvHi) / 2)));
      const ang = rng() * Math.PI * 2, r = 60 + rng() * 40;
      const wingOffset = [{ a: 0.28, dr: 14 }, { a: -0.28, dr: -8 }];
      let spawned = 0;
      for (let i = 0; i < convoyGrant; i++) {
        const isLead = i === 0;
        const off = isLead ? { a: 0, dr: 0 } : wingOffset[(i - 1) % wingOffset.length];
        let pos = {
          x: px + Math.cos(ang + off.a) * (r + off.dr),
          z: pz + Math.sin(ang + off.a) * (r + off.dr),
        };
        if (m.params?.cleanCylinder) pos = this._cleanCylinderGlobal(m.params.cleanCylinder.pose || CLEAN_CYLINDER.entry);
        // Real haulers: friendly (team 0) ships that TRAVEL toward the destination. The lead must
        // survive (mission fails if it dies — _onEntityDestroyed) and arrive (gates completion).
        const spec = makeEnemySpawnSpec('mule_trader', level, pos, { startedTick: deferredEnterTick(this.state) });
        spec.team = 0; spec.factionId = m.factionId; // player team (won't be auto-attacked by allies)
        spec.data = spec.data || {};
        spec.data.missionTag = m.id;
        spec.data.escortee = isLead ? 'lead' : true;
        spec.data.name = isLead ? pilot.name : null;
        spec.data.scanLabel = isLead ? `${pilot.crew} — convoy lead` : `${pilot.crew} — hauler`;
        if (m.params?.cleanCylinder) {
          spec.homeSectorId = m.destSectorId;
          spec.data.cleanCylinderOf = String(m.id);
          spec.data.machine = { kind: 'shepherd' };
          spec.data.suppressionOffline = true;
          spec.data.name = 'Shepherd-class charge';
          spec.data.scanLabel = 'SHEPHERD CHARGE — MATCH VELOCITY';
          const pose = m.params.cleanCylinder.pose;
          if (pose) { spec.vel = { x: pose.vx || 0, z: pose.vz || 0 }; spec.rot = pose.rot || 0; }
        }
        // No data.ai → the AI system skips it (it requires data.ai); WE steer it via data.intent in
        // update() so it runs the lane instead of dogfighting. Seed a neutral intent.
        delete spec.data.ai;
        spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
        let ent;
        try {
          ent = helpers.spawnEntity(spec);
        } catch (error) {
          if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, convoyGrant - spawned);
          throw error;
        }
        if (ent) {
          if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
          this._stampMissionTargetIdentity(ent, m, i);
          if (isLead) {
            m._escorteeId = ent.id;
            m._escorteeArrived = false;
          }
          m.targetEntityIds.push(ent.id);
          spawned++;
        }
      }
      if (spawned > 0) {
        m.params = m.params || {};
        m.params.convoyTotal = spawned;
        m.params.convoyLost = 0;
        if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
      }
      if (budget && typeof budget.releaseSome === 'function' && spawned < convoyGrant) {
        budget.releaseSome(requester, convoyGrant - spawned);
      }
      // The ambush: a raider wing already working the lane between the convoy and the berth.
      // Placed on the approach line so the escort has a place to stand, not a ring around the
      // player. Stamped escortAmbushOf (never missionTag) so adopt/cleanup treat them as what
      // they are — ordinary raiders this contract happened to spring, not objective targets.
      if (spawned > 0 && m._escorteeId != null) {
        const ambushWant = Math.max(0, Math.min(4, (m.params && m.params.ambushSize) || 0));
        const ambushGrant = ambushWant > 0 && budget && typeof budget.request === 'function'
          ? budget.request(ambushWant, requester)
          : ambushWant;
        if (ambushGrant > 0) {
          const destEnt = this._liveStation(m.destStationId);
          const lead = this.state.entities.get(m._escorteeId);
          if (destEnt && lead && destEnt.pos && lead.pos) {
            const riskTier = Math.max(0, Math.round(Number(m.riskTier) || 0));
            const pool = markArchetypePoolFor(riskTier);
            const dx = destEnt.pos.x - lead.pos.x, dz = destEnt.pos.z - lead.pos.z;
            const len = Math.hypot(dx, dz) || 1e-4;
            const ux = dx / len, uz = dz / len; // approach direction convoy → berth
            const t = 0.42 + rng() * 0.18;
            let sprung = 0;
            for (let i = 0; i < ambushGrant; i++) {
              const side = i % 2 === 0 ? 1 : -1;
              const spread = 26 + 20 * rng() + 14 * Math.floor(i / 2);
              const pos = {
                x: lead.pos.x + dx * t - uz * spread * side,
                z: lead.pos.z + dz * t + ux * spread * side,
              };
              const archetype = pool[Math.floor(rng() * pool.length)];
              const raiderLevel = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
              const spec = makeEnemySpawnSpec(archetype, raiderLevel, pos, { startedTick: deferredEnterTick(this.state) });
              spec.data = spec.data || {};
              spec.data.escortAmbushOf = String(m.id);
              let ent;
              try {
                ent = helpers.spawnEntity(spec);
              } catch (error) {
                if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, ambushGrant - sprung);
                throw error;
              }
              if (ent) {
                if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
                sprung++;
              }
            }
            if (budget && typeof budget.releaseSome === 'function' && sprung < ambushGrant) {
              budget.releaseSome(requester, ambushGrant - sprung);
            }
            if (sprung > 0 && !m._ambushSprung) {
              m._ambushSprung = true;
              this.bus.emit('comms:popup', {
                sender: pilot.name,
                text: `${pilot.crew} to escort: raiders on the final leg — stay with the haulers.`,
                category: 'personal',
                ttl: 7,
              });
            }
          }
        }
      }
    } else if (m.type === 'salvage_retrieval' && isMutationRecovery(m)) {
      // INF-068: the convoy-wreck pocket. One unstable drifting wreck holding the contract
      // cargo, spawned where the hull actually died. Tow it clear or vent it (safe), or race
      // its core (fast) — the burst takes the cargo with it, so the tradeoff is real, and both
      // answers end in the same canonical credit-plus-dock settlement. No respawn once the
      // armed core's clock has run out: the wreck had its chance.
      m.targetEntityIds = (m.targetEntityIds || []).filter((id) => {
        const e = this.state.entities.get(id);
        return e && e.alive !== false;
      });
      const nowS = Number(deferredEnterNow(this.state)) || 0;
      const armedDueAt = Number(m.params && m.params.convoyWreckDueAt);
      const clockOut = Number.isFinite(armedDueAt) && armedDueAt <= nowS;
      if (!m.targetEntityIds.length && !clockOut) {
        const budget = helpers.spawnBudget;
        const requester = `mission:${m.id}`;
        if (budget && typeof budget.request === 'function' && budget.request(1, requester) <= 0) {
          this._noteMissionSpawnDeferred(m, 1, 0);
        } else {
          const rng = nextRng();
          const pocket = convoyWreckPocket(m, {
            nowS,
            ringAngle: rng() * Math.PI * 2,
            driftAngle: rng() * Math.PI * 2,
            currentSectorId: this.state.world && this.state.world.currentSectorId,
          });
          let ent = null;
          try {
            ent = pocket && helpers.spawnEntity ? helpers.spawnEntity(pocket.spec) : null;
          } catch (error) {
            if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
            throw error;
          }
          if (ent) {
            if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
            this._stampMissionTargetIdentity(ent, m, 0);
            m.targetEntityIds.push(ent.id);
            m.params = m.params || {};
            m.params.lostWreckPos = { x: pocket.spec.pos.x, z: pocket.spec.pos.z };
            m.params.convoyWreckDueAt = pocket.dueAt;
            this.bus.emit('mission:updated', { missionId: m.id, targetEntityId: ent.id });
            if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
          } else if (budget && typeof budget.releaseSome === 'function') {
            budget.releaseSome(requester, 1);
          }
        }
      }
    } else if (contractClaimSiteMission(m)) {
      // WF-08 claim-stake salvage: the board row's physical content — a filed wreck with a
      // working claim crew parked on the destination approach. Its own scene, spawned here.
      this._spawnContractClaimSite(m, nextRng, px, pz);
    } else if (m.type === SPLIT_MANIFEST_TYPE) {
      // SF-139: two caught cargo nets + the stripped freighter hull, around the yard sink.
      this._spawnSplitManifestSite(m, nextRng);
    } else if (m.type === QUIET_BERTH_TYPE) {
      // SF-142: the dead yard lighter wedged off the west berth + the yard's hireable tug.
      this._spawnQuietBerthSite(m, nextRng);
    } else if (m.type === 'race') {
      this._spawnRaceGateTargets(m);
    } else if (m.type === AUTHORED_SET_PIECE_TYPE) {
      this._spawnAuthoredSetPieceTargets(m, nextRng, px, pz);
    } else if (m.type === CAPITAL_BOSS_TYPE) {
      this._spawnCapitalBossTargets(m, nextRng, px, pz);
    } else if (PHYSICAL_TYPE_SET.has(m.type)) {
      this._spawnPhysicalTargetsFor(m, nextRng, px, pz);
    }
    spawnReckoning(this, m);
    if (m.targetEntityIds.length) this.bus.emit('mission:updated', { missionId: m.id });
  },

  _noteMissionSpawnDeferred(m, requested, granted) {
    const key = String(m && m.id);
    const signature = `${requested | 0}:${granted | 0}`;
    const deferrals = this._missionBudgetDeferrals || (this._missionBudgetDeferrals = new Map());
    if (deferrals.get(key) === signature) return;
    deferrals.set(key, signature);
    this.bus.emit('mission:spawnDeferred', {
      missionId: m && m.id,
      type: m && m.type,
      sectorId: m && m.destSectorId,
      requested: requested | 0,
      granted: granted | 0,
      reason: 'spawn_cap',
    });
  },

  _cleanCylinderGlobal(pos) {
    const world = this.registry?.get('world');
    return world?._toGlobal ? world._toGlobal(pos) : { x: pos.x, z: pos.z };
  },

  _snapshotCleanCylinder(m) {
    const c = m.params?.cleanCylinder;
    const lead = c && this.state.entities.get(m._escorteeId);
    if (!lead?.alive) return;
    const world = this.registry?.get('world');
    const local = world?._toLocal ? world._toLocal(lead.pos) : lead.pos;
    c.pose = { x: local.x, z: local.z, vx: lead.vel?.x || 0, vz: lead.vel?.z || 0, rot: lead.rot || 0 };
  },

  // M30 is a leg of the ordinary physical escort, with durable condition and route state.
  // Repair is a selected, close, velocity-matched hold using the charge's onboard purge supply.
  _driveCleanCylinder(m, index, state, dt) {
    const c = m.params.cleanCylinder;
    const lead = state.entities.get(m._escorteeId);
    const player = state.entities.get(state.playerId);
    if (!lead?.alive || !player?.alive || state.world.currentSectorId !== m.destSectorId) return;
    const t = CLEAN_CYLINDER;
    const entry = this._cleanCylinderGlobal(t.entry), exit = this._cleanCylinderGlobal(t.exit);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const gap = distance(player.pos, lead.pos);
    const relativeSpeed = Math.hypot((player.vel?.x || 0) - (lead.vel?.x || 0), (player.vel?.z || 0) - (lead.vel?.z || 0));
    c.matched = gap <= t.pocketRadius && relativeSpeed <= t.matchSpeed;
    if (!c.joined && c.matched) c.joined = true;
    if (c.joined && c.phase === 'crossing') c.crossingS += dt;
    const faultAge = c.crossingS - t.faultAtS;
    const warning = faultAge >= 0 && faultAge < t.warningS && !c.faultRepaired;
    const fault = faultAge >= t.warningS && faultAge < t.warningS + t.faultS && !c.faultRepaired;
    if (warning && !c.faultWarned) {
      c.faultWarned = true;
      this.bus.emit('comms:popup', { sender: 'Shepherd charge', category: 'mission', ttl: 8,
        text: 'Suppression spike in six seconds. Target and match close to repair, or turn back toward the entry refuge; I will follow your retreat.' });
    }
    // A player visibly moving back along the lane chooses retreat; no hidden UI intent or
    // abandon-to-success conversion. Both live hulls must reach the actual entry refuge.
    const backX = entry.x - lead.pos.x, backZ = entry.z - lead.pos.z;
    const backD = Math.hypot(backX, backZ) || 1;
    const backOffset = ((player.pos.x - lead.pos.x) * backX + (player.pos.z - lead.pos.z) * backZ) / backD;
    const backSpeed = ((player.vel?.x || 0) * backX + (player.vel?.z || 0) * backZ) / backD;
    if (c.joined && c.phase !== 'retreat' && (warning || fault || c.exposure >= t.foulAt)
      && gap <= t.pocketRadius && backD > 160 && backOffset > 100 && backSpeed > 4) c.retreatS += dt;
    else c.retreatS = 0;
    if (c.retreatS >= 2) {
      c.phase = 'retreat';
      this.bus.emit('comms:popup', { sender: 'Shepherd charge', category: 'mission', ttl: 6,
        text: 'Following you back to the entry refuge. Return together for the 25% recovery fee; this is not a clean delivery.' });
    }
    const repairing = c.joined && state.player.targetId === lead.id;
    const holdRepair = repairing && gap <= t.repairRadius && relativeSpeed <= t.repairSpeed
      && (c.exposure > 0 || warning || fault);
    if (holdRepair) c.repairS += dt;
    else c.repairS = 0;
    if (c.repairS >= t.repairS) {
      c.exposure = 0; c.repairS = 0; c.repairs = (c.repairs || 0) + 1;
      if (warning || fault) c.faultRepaired = true;
      this.bus.emit('comms:popup', { sender: 'Shepherd charge', category: 'mission', ttl: 5,
        text: 'Purge cycle complete. Cylinder clean; suppression restored. Continue passage or return to refuge.' });
    }
    lead.data.suppressionOffline = !c.joined || !c.matched || (fault && !c.faultRepaired);
    if (c.joined && c.phase === 'crossing' && lead.data.suppressionOffline) {
      const world = this.registry?.get('world');
      const local = world?._toLocal ? world._toLocal(lead.pos) : lead.pos;
      c.exposure = Math.min(1, c.exposure + pointContaminationAt(state, m.destSectorId, local.x, local.z) * 0.06 * dt);
    }
    c.fouled = c.exposure >= t.foulAt;
    const status = c.phase === 'retreat' ? 'RETREAT TO ENTRY REFUGE'
      : holdRepair ? `REPAIR ${Math.floor(c.repairS)}/${t.repairS}s`
        : c.fouled ? 'FOULED — TARGET AND MATCH CLOSE TO REPAIR'
          : lead.data.suppressionOffline ? 'SUPPRESSION DOWN — MATCH OR REPAIR'
            : c.phase === 'delivery' ? 'CLEAN — ESCORT TO BERTH' : 'CLEAN — MATCH THE POCKET';
    const objective = `${status} · exposure ${Math.round(c.exposure * 100)}%`;
    lead.data.scanLabel = `SHEPHERD CHARGE — ${objective}`;
    if (c.objective !== objective) {
      c.objective = objective;
      this.bus.emit('mission:updated', { missionId: m.id, exposure: c.exposure, phase: c.phase });
    }
    const station = this._liveStation(m.destStationId);
    if (c.phase === 'crossing' && distance(lead.pos, exit) <= 100 && c.joined) c.phase = 'delivery';
    const target = c.phase === 'retreat' ? entry : c.phase === 'delivery' ? station?.pos : exit;
    const intent = lead.data.intent || (lead.data.intent = {});
    intent.moveX = 0; intent.boost = false; intent.fire = false; intent.fireGroup = null;
    if (target) intent.aimAngle = Math.atan2(target.z - lead.pos.z, target.x - lead.pos.x);
    const speed = Math.hypot(lead.vel?.x || 0, lead.vel?.z || 0);
    intent.moveZ = !c.joined || holdRepair || !target || distance(lead.pos, target) <= 80
      ? 0 : Math.max(0, Math.min(1, (t.speed - speed) / t.speed));
    intent.brake = !c.joined || holdRepair || !target || distance(lead.pos, target) <= 80;
    m._escorteeArrived = c.phase === 'delivery' && !!station
      && distance(lead.pos, station.pos) <= ((station.data?.dockRadius || 80) + 40);
    this._snapshotCleanCylinder(m);
    if (c.phase === 'retreat' && distance(lead.pos, entry) <= 120 && distance(player.pos, entry) <= 160) {
      this._settleEscortConvoyPay(m);
      this._completeMission(m, index);
    }
  },

  /**
   * M12 — Quiet passage: drive the heat-sensitive passenger transport toward the Customs Gate checkpoint.
   * Near the transport, player heat signature (low heat, cold coast) preserves comfort and full fee;
   * a hot approach (high WANTED heat, high burn speed) spooks the transport and visibly degrades fee.
   */
  _driveQuietPassage(m, index, state, dt) {
    if ((state.world && state.world.currentSectorId) !== m.destSectorId) return;
    const p = m.params && m.params.quietPassage;
    if (!p) return;
    // Older offers and saves stored the authored sector-local pose without its frame.
    const localPose = p.poseSpace !== 'galaxy';
    if (localPose) {
      if (p.pose) p.pose = sectorLocalToGlobalForSector(p.pose, QUIET_PASSAGE.sectorId);
      p.poseSpace = 'galaxy';
    }

    let transport = m._transportId != null && state.entities ? state.entities.get(m._transportId) : null;
    if (transport?.data?.quietPassageOf !== String(m.id)) transport = null;
    if (!transport || transport.alive === false) {
      if (state.entities) {
        for (const e of state.entities.values()) {
          if (e && e.alive !== false && e.data?.quietPassageOf === String(m.id)) {
            transport = e;
            m._transportId = e.id;
            break;
          }
        }
      }
    }

    if (localPose && transport) {
      const pose = sectorLocalToGlobalForSector(transport.pos, QUIET_PASSAGE.sectorId);
      transport.pos.x = pose.x;
      transport.pos.z = pose.z;
    }

    if (!transport && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      const pose = p.pose || QUIET_PASSAGE.transportStartPos;
      transport = this.helpers.spawnEntity({
        type: 'ship',
        team: 0,
        pos: { x: pose.x, z: pose.z },
        vel: { x: 0, z: 0 },
        radius: 16,
        hull: 150,
        hullMax: 150,
        data: {
          defId: 'ship_mule',
          shipName: 'Vance Liner',
          quietPassageOf: String(m.id),
          physicalRole: 'passenger_transport',
          factionId: 'faction_free',
          intent: { moveX: 0, moveZ: 0, boost: false, fire: false, aimAngle: 0 },
        },
      });
      if (transport) {
        m._transportId = transport.id;
        m.targetEntityIds = [transport.id];
      }
    }

    if (!transport || transport.alive === false) {
      if (transport && transport.alive === false) {
        this._failMission(m, index, 'passenger_transport_destroyed');
      }
      return;
    }

    // Steer transport toward checkpoint
    const checkpoint = QUIET_PASSAGE.checkpointPos;
    const dx = checkpoint.x - transport.pos.x;
    const dz = checkpoint.z - transport.pos.z;
    const distToCheckpoint = Math.hypot(dx, dz);

    if (distToCheckpoint > 20) {
      const angle = Math.atan2(dz, dx);
      transport.rot = angle;
      const speed = QUIET_PASSAGE.transportSpeed;
      transport.vel.x = Math.cos(angle) * speed;
      transport.vel.z = Math.sin(angle) * speed;
      transport.pos.x += transport.vel.x * dt;
      transport.pos.z += transport.vel.z * dt;
      if (transport.data?.intent) {
        transport.data.intent.aimAngle = angle;
        transport.data.intent.moveZ = 1;
      }
    }

    p.pose = { x: transport.pos.x, z: transport.pos.z };

    // Player heat & proximity evaluation
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    if (player && player.alive !== false) {
      const playerHeat = state.player?.heat ?? player.heat ?? 0;
      const reading = evaluatePassengerHeatProximity(player, transport, playerHeat);
      if (reading.inRange) {
        if (reading.isHot && !p.spooked) {
          p.spooked = true;
          p.comfort = 0;
          p.alarm = 'spooked';
          m.reward_cr = QUIET_PASSAGE.degradedRewardCr;
          if (this.bus && this.bus.emit) {
            this.bus.emit('toast', {
              text: 'Passenger transport alarmed: hot approach compromised quiet passage. Fee docked.',
              kind: 'warn',
              ttl: 4,
            });
            this.bus.emit('mission:updated', { missionId: m.id, twist: 'spooked' });
          }
        } else if (!p.spooked) {
          p.comfort = 1;
          p.alarm = 'calm';
        }
      }
    }

    // Checkpoint passage
    if (distToCheckpoint <= QUIET_PASSAGE.checkpointRadius) {
      p.passedCheckpoint = true;
      m.objectiveProgress = 1;
      const spooked = p.spooked === true;
      if (this.bus && this.bus.emit) {
        this.bus.emit('toast', {
          text: spooked
            ? 'Degraded passage: transport cleared the checkpoint, but the fee was docked.'
            : 'Quiet passage: transport cleared the checkpoint cold. Full fee paid.',
          kind: spooked ? 'warn' : 'success',
          ttl: 4,
        });
      }
      this._completeMission(m, index);
    }
  },

  /** Drive the convoy toward the destination station (or sector centre). Writes data.intent
   *  which flight consumes; marks m._escorteeArrived when the LEAD reaches the dock ring —
   *  wings run the lane in trail formation and do not gate completion. Deterministic
   *  (pure geometry — no RNG). */
  _steerEscortee(m, state, dt) {
    const lead = state.entities.get(m._escorteeId);
    // NXB-038: a drive-disabled convoy hull is a recoverable loss with a real continuation —
    // a taut tow line repairs a friendly drive — but only if the player is TOLD it went dead.
    // Say it once per contract (params.* rides the save), then let the sim decide the rest.
    if (!m.params || m.params.helperDisabledSaid !== true) {
      let deadHull = null;
      if (lead && lead.alive && driveDisabledRuntime(state, lead.id)) deadHull = lead;
      if (!deadHull) {
        for (const id of m.targetEntityIds || []) {
          if (id === m._escorteeId) continue;
          const e = state.entities.get(id);
          if (e && e.alive && e.data && e.data.escortee === true && driveDisabledRuntime(state, e.id)) {
            deadHull = e;
            break;
          }
        }
      }
      if (deadHull) {
        m.params = m.params || {};
        m.params.helperDisabledSaid = true;
        const pilot = promotedPilotIdentity(0, m.id);
        this.bus.emit('comms:popup', {
          sender: pilot.name,
          text: lead === deadHull
            ? `${pilot.crew}: my drive is dead — put a line on the hull or this leg dies out here.`
            : `${pilot.crew}: a wing hauler is dead in the water — tow her or we settle short.`,
          category: 'mission',
          ttl: 6,
        });
      }
    }
    if (m.params?.cleanCylinder) return; // M30 steers the same hull through its corridor/refuge legs.
    // Destination point shared by the whole convoy: the dest station entity if it's loaded in
    // the current sector, else the player (so the convoy tags along until the player jumps it
    // into the destination sector).
    let dest = null;
    const inDestSector = state.world.currentSectorId === m.destSectorId;
    if (inDestSector) {
      const byStationId = state.entityIndex && state.entityIndex.byStationId;
      dest = byStationId && m.destStationId ? byStationId.get(m.destStationId) : null;
      if (!dest || !dest.alive || dest.type !== 'station') {
        const stations = (state.entityIndex && state.entityIndex.stations) || state.entityList;
        dest = null;
        for (const cand of stations) {
          if (cand.alive && cand.type === 'station' && cand.data && cand.data.stationId === m.destStationId) { dest = cand; break; }
        }
      }
    }
    if (!dest) {
      const player = state.entities.get(state.playerId);
      dest = player && player.alive ? player : null;
    }
    if (!dest) return;

    // Shared throttle/heading write. True when inside arriveR (eases to a hover).
    const headTo = (e, target, arriveR) => {
      const intent = e.data.intent || (e.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
      intent.fire = false; intent.fireGroup = null;
      const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const aim = Math.atan2(dz, dx);
      intent.aimAngle = aim;
      if (dist <= arriveR) {
        // arrived: ease to a hover near the dock
        intent.moveZ = 0; intent.moveX = 0; intent.boost = false;
        return true;
      }
      // head straight in; boost to close a large gap so it keeps pace with the player
      const off = Math.abs(wrapAngleLocal(aim - e.rot));
      intent.moveZ = off < 1.2 ? 1 : 0.35;   // throttle down while still turning to face the line
      intent.moveX = 0;
      intent.boost = dist > 700 && off < 0.6;
      return false;
    };

    if (lead && lead.alive) {
      const arriveR = (dest.type === 'station' ? (dest.data && dest.data.dockRadius) || 80 : 140) + 40;
      const arrived = headTo(lead, dest, arriveR);
      if (arrived && inDestSector && dest.type === 'station') {
        m._escorteeArrived = true; // gates player-dock completion
        if (!m._convoyArrivedSaid) {
          m._convoyArrivedSaid = true;
          const pilot = promotedPilotIdentity(0, m.id);
          this.bus.emit('comms:popup', {
            sender: pilot.name,
            text: `${pilot.crew} docked. Good flying — the desk pays on arrivals.`,
            category: 'personal',
            ttl: 6,
          });
        }
      }
      // Wings run the lane in trail formation: staggered back and to the sides of the lead,
      // measured against the lead→berth line so the column holds through the whole approach.
      let wing = 0;
      for (const id of m.targetEntityIds || []) {
        if (id === m._escorteeId) continue;
        const e = state.entities.get(id);
        if (!e || e.alive === false || !(e.data && e.data.escortee)) continue;
        const back = 42 + wing * 18, side = wing % 2 === 0 ? 30 : -30;
        let ux = dest.pos.x - lead.pos.x, uz = dest.pos.z - lead.pos.z;
        const ul = Math.hypot(ux, uz) || 1e-4; ux /= ul; uz /= ul;
        headTo(e, { pos: { x: lead.pos.x - ux * back - uz * side, z: lead.pos.z - uz * back + ux * side } }, 60);
        wing++;
      }
    } else {
      // Lead gone but the fail sweep has not settled the row yet: the remaining haulers still
      // run for the berth so the lane reads alive for the seconds in between.
      for (const id of m.targetEntityIds || []) {
        const e = state.entities.get(id);
        if (!e || e.alive === false || !(e.data && e.data.escortee)) continue;
        headTo(e, dest, 200);
      }
    }
  },

  /**
   * PQ-152.03 — the escort turns mid-run. Only when the contract carries escort_turns.
   * Near the drop or after a held delay they flip hostile; the tick term then mutates
   * the job into a hunt instead of voiding it.
   */
  _maybeTurnEscort(m, state) {
    if (!m || m.type !== 'escort' || m._escorteeId == null) return;
    if (!this._missionConditions(m).some((condition) => condition && condition.id === 'escort_turns')) {
      return;
    }
    const entity = state.entities && state.entities.get(m._escorteeId);
    if (!entity || entity.alive === false) return;
    if (entity.data && entity.data.escortTurned) return;
    const now = Number(state.simTime) || 0;
    const acceptedAt = Number(m.acceptedAt_s) || 0;
    const destPos = this._missionBerthPos(m);
    const nearDest = !!(destPos && entity.pos && Math.hypot(
      (entity.pos.x || 0) - (destPos.x || 0),
      (entity.pos.z || 0) - (destPos.z || 0),
    ) <= QUIET_APPROACH_RANGE_WU);
    if (!nearDest && (now - acceptedAt) < ESCORT_TURN_DELAY_S) return;
    entity.team = 1;
    entity.data = entity.data || {};
    entity.data.escortTurned = true;
    entity.data.escortee = false;
    const intent = entity.data.intent || (entity.data.intent = {
      moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0,
    });
    intent.fire = true;
    this.bus.emit('mission:updated', { missionId: m.id, twist: 'escort_turns' });
  },
};

