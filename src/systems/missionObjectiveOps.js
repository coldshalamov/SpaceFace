import { recordFurnaceAftermathFact, prepareFurnaceSettlement } from '../missions/furnaceWorksiteRuntime.js';
import { furnaceDetail, authoredFurnaceWorksite, furnaceAccounting, isFurnaceOwnedLot, furnaceLots, furnaceReceiptMatches } from '../missions/furnaceWorksite.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { starterBuoySpec, starterMiningReceiptMatches } from '../missions/starterWorkday.js';
// Row 413 extraction — methods moved verbatim out of missions.js;
// spread back onto the missions object, so `this` still binds to the system at call time.
import { addCargo, releasableContractUnits } from './cargo.js';
import { reckoningKilled } from '../missions/reckoningRuntime.js';
import { b2RescueActorCount } from './missions.js';
import { compactKillCausality, killCauseFamily } from '../combat/killCausality.js';
import { maxFittedModuleMod } from '../core/fittedModules.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { playerWreckMarker } from './aftermathWrecks.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { makeEnemySpawnSpec } from './combat.js';
import { deferredEnterTick } from '../core/sectorEnterDefer.js';
import { setPieceFacilityWorldPos } from './heistFacilities.js';
import { capitalBossEncounter } from '../data/encounters/capital-boss.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { BULK_HAUL_TYPE, CAPITAL_SUBSYSTEM_ORDER, CHOIR_RETURN_RADIUS_WU, CLEAN_PHYSICAL_RELEASE, CONTRACT_47A_B0_TAG, CONTRACT_47A_B2_CUSTODY_REEL_WU, CONTRACT_47A_B2_SCAN_RADIUS_WU, CONTRACT_47A_B2_TAG, CONTRACT_47A_SAMPLE_ID, LONG_READ_RUMOR_EVENT, MISSION_WRECK_COLLISION_MASK, PHYSICAL_BERTH_WU, PHYSICAL_ROLE, PHYSICAL_TYPE_SET, SECTOR_BY_ID, SET_PIECE_DISPOSITION_OBJECTIVES, SET_PIECE_RECOVERY_OBJECTIVES, STATION_INFO, STORY_LATCH_DOCK_SLACK_WU, THROWN_MASS_SUBSYSTEM_DAMAGE, ashfallBlockadeDoorPos, ashfallCacheApproachPos, authoredDefinitionOf, authoredEncounterOf, authoredMethodFor, b2RescueActorForRole, b2RescueActorIdentity, b2RescueActorIndexFromEntity, b6DeploymentPayload, bountyTargetLost, campaign47aOutcomeKey, campaign47aRouteKind, capitalBossAdjustedPlacement, capitalSubsystemWorldPos, completedMissionTargetSlots, convoyClientVoice, distSq, ensureB2RescueActorOutcomes, escortLossSite, externalTargetLoss, findLivingWorldActorStation, isCampaign47aB2Rescue, isCapitalBossMission, isMutationRecovery, missionHostileSpawnPos, missionObservesClauseEvent, missions, mutationWreckRouting, outsideMissionPortSafety, physicalRoleOf, setPieceCauseOf } from './missions.js';
import { activeOwnedShip, shipCarriesModule, starterRamKill } from '../data/starterJobs.js';
import { AUTHORED_SET_PIECE_TYPE, CAPITAL_BOSS, ONE_LOAD_CARGO_TYPES, WRECK_BOUND_SET_PIECE_OBJECTIVES } from '../data/missions.js';
import { heistMissionRuntime } from '../missions/heistMissionRuntime.js';
import { missionIdentityOf } from '../world/worldRecords.js';
import { RESEARCH_FIRSTS_CAP, RESEARCH_GRANTS } from '../data/researchGrants.js';
import { getEmpireSeedProgram } from '../story/campaign47a/index.js';
import { spawnWorkingBattlefield, workingBattlefieldKilled } from './workingBattlefieldRuntime.js';
import { capitalBossBallastPosition, spawnCapitalActorOnce } from '../missions/capitalBossSpawn.js';
import { SET_PIECE_FOLLOW_ON_SOURCE, setPieceFollowOnBody, setPieceFollowOnOffer } from '../data/sandboxSetPieceFollowOns.js';
import { recordBeatStep } from '../story/campaign47a/index.js';
import { decorateCapitalBossSpawnSpec } from '../missions/capitalBossSpawn.js';
import { missionTargetSlotOf } from './missions.js';

export const missionObjectiveOps = {
  // =========================================================================================
  // OBJECTIVE TRACKING (event resolvers)
  // =========================================================================================
  _onTrade(p) {
    if (!p || !p.commodityId || p.side !== 'sell') return;
    const stationId = p.stationId;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'bulk_trade') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
      if (m.destStationId && stationId && m.destStationId !== stationId) continue; // sell at the named buyer
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + (p.qty || 0));
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
    this._clearCompletedTradeWaypoint(p);
    // B1 now advances through its authored board mission, not an unrelated market sale.
  },

  _clearCompletedTradeWaypoint(p) {
    if (!p || p.side !== 'sell' || !p.stationId || !p.commodityId) return;
    const state = this.state;
    const nav = state.nav;
    const waypoint = nav && nav.waypoint;
    if (!waypoint || waypoint.kind !== 'trade') return;
    if (waypoint.stationId !== p.stationId || waypoint.commodityId !== p.commodityId) return;
    const cargoItems = state.player && state.player.cargo && state.player.cargo.items || {};
    if ((Number(cargoItems[p.commodityId]) || 0) > 0) return;
    nav.waypoint = null;
    nav.route = null;
    nav.autoTravel = false;
    this.bus.emit('nav:waypoint', null);
  },

  _onMiningYield(p) {
    if (!p || !p.commodityId) return;
    // Ambient cutters publish the same yield facts. Only the player earns their contracts;
    // omitted identity remains compatible with legacy/headless player receipts.
    if (p.minerId === null || (p.minerId != null && p.minerId !== this.state.playerId)) return;
    const b0 = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B0_TAG);
    let b0SampleRecovered = false;
    if (b0 && !(b0.params && b0.params.sampleRecovered) && p.minerId !== null
      && (p.minerId == null || p.minerId === this.state.playerId)) {
      const source = this._resolveContract47aSampleSource(b0);
      const sourceMatches = !p.pos || !source || distSq(p.pos, source.pos) <= 80 * 80;
      if (sourceMatches && addCargo(this.state, CONTRACT_47A_SAMPLE_ID, 1) === 1) {
        b0.params.sampleRecovered = true;
        // W-BOOKS-0-2 (§34.7): the Skim's lane delay is anchored on this stamp.
        b0.params.sampleRecoveredAt = this.state.simTime || 0;
        b0.objectiveProgress = 1;
        const locked = this.state.story.persistentCargo || (this.state.story.persistentCargo = []);
        if (!locked.includes(CONTRACT_47A_SAMPLE_ID)) locked.push(CONTRACT_47A_SAMPLE_ID);
        b0SampleRecovered = true;
        this._refreshTrackedMissionNav(b0);
        this.bus.emit('mission:updated', { missionId: b0.id, objectiveProgress: 1 });
        this._sayStoryLine('Sample secured. Dock at Helios.', 4);
      }
    }
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status === 'active' && m.type === 'recon_scan'
        && m.params && m.params.originSurveySample && m.params.surveyComplete) {
        const playerMined = p.minerId == null || p.minerId === this.state.playerId;
        const inSurveySector = this.state.world.currentSectorId === m.destSectorId;
        if (playerMined && inSurveySector && p.commodityId === m.params.sampleCmdtyId) {
          m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + Math.max(0, p.qty || 0));
          if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
          else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
          continue;
        }
      }
      if (m.status !== 'active' || m.type !== 'mining_quota') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
      // A starter cut pays only while its tool is fitted. The Hitch contract is a rich-core
      // hold (Drill Amp) plus the mining laser. Iron mined without that fit does not count.
      if (!starterMiningReceiptMatches(m, p, this.state)) continue;
      if (m.params.starterJobId) {
        const ship = activeOwnedShip(this.state);
        if (!shipCarriesModule(ship, m.params.requiredModule)) continue;
        if (!shipCarriesModule(ship, 'mod_mining_laser_s')) continue;
      }
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + (p.qty || 0));
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
    // New runs require the marked 47-A sample. Pos-less legacy/headless receipts remain compatible
    // through sourceMatches above; saves without the authored B0 contract keep the old trigger.
    if (!b0 || b0SampleRecovered || (b0.params && b0.params.sampleRecovered)) this._storyTrigger('mine', p);
  },

  _onBulkHaulDelivered(p) {
    if (!p || !p.stationId) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== BULK_HAUL_TYPE) continue;
      if (m.destStationId && m.destStationId !== p.stationId) continue;
      const massU = Math.max(0, Number(p.massU) || 0);
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + massU);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _onSalvageCompleted(p) {
    if (!p || p.wreckId == null) return false;
    const wreck = this.state.entities && this.state.entities.get(p.wreckId);
    if (!wreck || wreck.type !== 'wreck') return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || m.type !== 'salvage_retrieval') continue;
      if (!m.params || m.params.setPieceObjective !== 'investigation_recover_box') continue;
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      // G1: the black box comes out of the chain's OWN placed wreck. A wreck bound to the offer
      // must be the authored hull (entity.data.uniqueWreckId); unbound legacy offers keep the
      // sector-wide rule. Any random scrap wreck no longer settles the story stage.
      const boundWreckId = m.params.wreckId || m.wreckId || (m.cause && m.cause.wreckId) || null;
      if (boundWreckId) {
        const wreckData = wreck && wreck.data;
        if (!wreckData || wreckData.uniqueWreckId !== boundWreckId) continue;
      }
      m.params.recoveredWreckId = p.wreckId;
      m.objectiveProgress = m.objectiveTarget;
      this._completeMission(m, i);
      return true;
    }
    // INF-066: mutation-successor recovery legs credit real salvage work. Loot the player's own
    // beam pulled from a wreck in the loss sector counts toward the contract commodity — the
    // goods are fungible scrap, so sector + commodity is the honest bound, and the dock
    // settlement below still requires the goods to be aboard before anything pays.
    if (p.loot && typeof p.loot === 'object') {
      const sectorNow = this.state.world && this.state.world.currentSectorId;
      for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
        const m = this.state.missions.active[i];
        if (!m || m.status !== 'active' || m.type !== 'salvage_retrieval') continue;
        if (!isMutationRecovery(m)) continue;
        const routing = mutationWreckRouting(m, sectorNow);
        if (!routing.sectorId || routing.sectorId !== sectorNow) continue;
        const cmdtyId = m.params && m.params.cmdtyId;
        const got = cmdtyId ? Math.max(0, Math.floor(Number(p.loot[cmdtyId]) || 0)) : 0;
        if (got <= 0) continue;
        const target = Math.max(1, m.objectiveTarget || (m.params && m.params.qty) || 1);
        const before = m.objectiveProgress || 0;
        m.objectiveProgress = Math.min(target, before + got);
        if (m.objectiveProgress !== before) {
          this._refreshTrackedMissionNav(m);
          this.bus.emit('mission:updated', {
            missionId: m.id,
            objectiveProgress: m.objectiveProgress,
            salvageRecovered: true,
          });
          // INF-069: the client's reaction to the player's approach — once, on the first real
          // credit, persisted on the mission so Continue never repeats it.
          if (before <= 0 && m.params && !m.params.convoyClientReacted) {
            m.params.convoyClientReacted = true;
            const voice = convoyClientVoice(m, 'recovering', this._stationName(m.destStationId));
            if (voice) {
              this.bus.emit('comms:popup', {
                sender: voice.sender,
                text: voice.text,
                category: 'personal',
                ttl: 8,
              });
            }
          }
        }
      }
    }
    return false;
  },

  _onKill(p) {
    if (!p) return;
    recordFurnaceAftermathFact(this, p, 'lost');
    // Only an actual kill loses a disposal lot; residency despawn is not destruction.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!authoredFurnaceWorksite(m)) continue;
      const body = this.state.entities?.get(p.id);
      if (!body || (p.entity && p.entity !== body) || body.alive !== false) continue;
      if (body?.id !== p.id || !isFurnaceOwnedLot(body, this.state) || body.data.furnaceMissionId !== m.id || body._furnaceTaken) continue;
      const lot = furnaceLots(m).find(row => row.entityId === p.id && row.slot === body.data.furnaceLotSlot && !row.received);
      if (!lot) continue;
      lot.lost = true;
      if (authoredFurnaceWorksite(m)) {
        m.params.furnaceLosses = furnaceAccounting(m).lost;
        delete m._extrasAnnounced;
        this.bus.emit('mission:updated', { missionId: m.id, furnaceLosses: m.params.furnaceLosses });
        this._sayStoryLine(`Disposal cargo lost: ${m.params.furnaceLosses}/3. Clear the site and account for the remaining pods; lost cargo earns no disposal pay.`, 6);
        if (m.objectiveProgress >= m.objectiveTarget && this._bookExtrasSatisfied(m)) {
          prepareFurnaceSettlement(this, m);
          this._completeMission(m, i);
        }
      } else this._failMission(m, i, 'payload_destroyed');
    }
    const byPlayer = p.killerId === this.state.playerId;
    if (!byPlayer) { this._voidLostBountyTargets(p); return; } // mission kills only count for the player
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
      // contractClauses observes this same synchronous event after missions. Never let the kill
      // objective pay/complete first; the observer will emit the one canonical breach intent.
      if (missionObservesClauseEvent(m, 'entity:killed')) continue;
      this._settleBountyTargetKill(m, i, p);
    }
  },

  /**
   * RC-34: a named board_writ mark is a person, not a template — once the hull dies
   * (player's guns, a rival hunter, or a void-for-lost-mark) the name goes on the
   * graveyard ledger and `rollBountyMark` never deals it again. Ledger lives on
   * `state.missions` so it saves/loads with the rest of the contract slice; absent
   * on old saves, minted lazily.
   */
  _recordBountyMarkDeath(m) {
    const name = m && m.storyTarget && m.storyTarget.role === 'board_writ' ? m.storyTarget.name : null;
    if (!name) return;
    const missions = this.state.missions;
    const ledger = Array.isArray(missions.killedMarkNames)
      ? missions.killedMarkNames
      : (missions.killedMarkNames = []);
    if (!ledger.includes(name)) ledger.push(name);
  },

  /**
   * Objective settlement for a bounty/patrol target kill. Called directly from the entity:killed
   * loop for clause-free missions, and via `contract:clauseSettledKill` for clause-observing ones
   * after contractClauses has judged the kill — a kill no clause fails must still complete.
   */
  _settleBountyTargetKill(m, i, p) {
    // Versioned refinery work is a cleared-place predicate, not fabricated kill credit.
    if (authoredFurnaceWorksite(m)) return;
    if (!Array.isArray(m.targetEntityIds) || !m.targetEntityIds.includes(p.id)) return;
    if (m.params && m.params.requiredModule === 'mod_ram_plate') {
      if (!shipCarriesModule(activeOwnedShip(this.state), 'mod_ram_plate')) return;
      if (!starterRamKill(p)) return;
    }
    if (m.storyTag === CONTRACT_47A_B2_TAG) {
      this._resolveContract47aB2(m, i, 'force', p.id);
      return;
    }
    this._recordBountyMarkDeath(m);
    const defeated = this.state.entities && this.state.entities.get(p.id);
    const defeatedSlot = missionTargetSlotOf(defeated, m.id);
    if (defeatedSlot != null) {
      const completed = completedMissionTargetSlots(m);
      completed.add(defeatedSlot);
      m.completedTargetSlots = [...completed].sort((a, b) => a - b);
    }
    m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
    m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
    if (m.objectiveProgress >= m.objectiveTarget && this._bookExtrasSatisfied(m)) this._completeMission(m, i);
    else {
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id });
      this._announceBookExtrasPending(m);
    }
  },

  /**
   * W-BOOKS-0-2 (§34.7): Book contract physical extras — the infested hauler's ore pods
   * into the CR-FEED intake (`furnaceFeedsNeeded`), the cinder mark's wreck into Rook's
   * booth ring (`rookDeliveryNeeded`). Kills alone do not settle a contract whose authored
   * disposal leg is still owed; the extras count through their own live signals and the
   * mission completes when BOTH halves stand.
   */
  _bookExtrasSatisfied(m) {
    const p = (m && m.params) || {};
    if (authoredFurnaceWorksite(m)) {
      const accounted = furnaceAccounting(m);
      if (accounted.received + accounted.lost < 3) return false;
    } else if (Number(p.furnaceFeedsNeeded) > 0 && (p.furnaceFeeds | 0) < p.furnaceFeedsNeeded) return false;
    if (Number(p.rookDeliveryNeeded) > 0 && (p.rookDeliveries | 0) < p.rookDeliveryNeeded) return false;
    // W-BOOKS-3-4: Feed the Maw — the maw must be stunned with hot slag before the tow
    // can leave the lane; a thrashing maw does not ride a Line out.
    if (Number(p.mawStunsNeeded) > 0 && (p.mawStuns | 0) < p.mawStunsNeeded) return false;
    return true;
  },

  _bookExtrasPending(m) {
    const p = (m && m.params) || {};
    const rows = [];
    if (Number(p.furnaceFeedsNeeded) > 0) {
      const accounted = authoredFurnaceWorksite(m) ? furnaceAccounting(m) : null;
      const left = Math.max(0, p.furnaceFeedsNeeded - (accounted ? accounted.received + accounted.lost : (p.furnaceFeeds | 0)));
      if (left > 0) rows.push(`feed ${left} more to the CR-FEED intake`);
    }
    if (Number(p.rookDeliveryNeeded) > 0) {
      const left = Math.max(0, p.rookDeliveryNeeded - (p.rookDeliveries | 0));
      if (left > 0) rows.push(`tow ${left} more wreck into Rook's booth ring`);
    }
    if (Number(p.mawStunsNeeded) > 0) {
      const left = Math.max(0, p.mawStunsNeeded - (p.mawStuns | 0));
      if (left > 0) rows.push(`stun the maw ${left} more time${left === 1 ? '' : 's'} with hot slag`);
    }
    return rows;
  },

  _announceBookExtrasPending(m) {
    if (!m || m.objectiveProgress < m.objectiveTarget) return;
    const rows = this._bookExtrasPending(m);
    if (!rows.length || m._extrasAnnounced === rows.join('|')) return;
    m._extrasAnnounced = rows.join('|');
    this._sayStoryLine(`Kills cleared — still owed: ${rows.join('; ')}.`, 6);
  },

  _onFurnaceFed(p) {
    if (!p) return;
    if (recordFurnaceAftermathFact(this, p, 'received')) return;
    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || !m.params || !(Number(m.params.furnaceFeedsNeeded) > 0)) continue;
      if (m.destSectorId && sectorId && m.destSectorId !== sectorId) continue;
      // A furnace can burn anything; this disposal contract pays only for its own lots.
      if (authoredFurnaceWorksite(m)) {
        if (!furnaceReceiptMatches(m, p, this.state.entities?.get(p.entityId))) continue;
        furnaceLots(m)[p.lotSlot].received = true;
      }
      m.params.furnaceFeeds = Math.min(m.params.furnaceFeedsNeeded, (m.params.furnaceFeeds | 0) + 1);
      delete m._extrasAnnounced;
      if (m.objectiveProgress >= m.objectiveTarget && this._bookExtrasSatisfied(m)) {
        prepareFurnaceSettlement(this, m);
        this._completeMission(m, i);
      } else {
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id, furnaceFeeds: m.params.furnaceFeeds });
        this._sayStoryLine(`CR-FEED intake: ${m.params.furnaceFeeds}/${m.params.furnaceFeedsNeeded}`, 4);
      }
      return;
    }
  },

  _onRookWreckDelivered(p) {
    if (!p) return;
    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || !m.params || !(Number(m.params.rookDeliveryNeeded) > 0)) continue;
      if (m.destSectorId && sectorId && m.destSectorId !== sectorId) continue;
      m.params.rookDeliveries = (m.params.rookDeliveries | 0) + 1;
      delete m._extrasAnnounced;
      if (m.objectiveProgress >= m.objectiveTarget && this._bookExtrasSatisfied(m)) {
        this._completeMission(m, i);
      } else {
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id, rookDeliveries: m.params.rookDeliveries });
        this._sayStoryLine(`Rook's book: wreck logged ${m.params.rookDeliveries}/${m.params.rookDeliveryNeeded}`, 4);
      }
      return;
    }
  },

  /**
   * A kill contractClauses judged clean — no clause failed, so the mission owes whatever the
   * entity:killed loop would have done with it. Same dispatch as _onKill: non-player kills
   * take the INF-067 fair-void half (deposit back, never credited), and only bounty/patrol
   * targets settle — an escortee also sits in targetEntityIds and must never "complete".
   */
  _onClauseSettledKill(p) {
    if (!p || !p.missionId) return;
    const byPlayer = p.killerId === this.state.playerId;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.id !== p.missionId || m.status !== 'active') continue;
      if (!byPlayer) {
        const gone = (id) => {
          const e = this.state.entities && this.state.entities.get(id);
          if (!e || e.alive === false) return true;
          return !!(p.entity && id === p.entityId && e !== p.entity);
        };
        if (bountyTargetLost(m, p.entityId, gone)) { this._recordBountyMarkDeath(m); this._failMission(m, i, 'target_lost'); }
        else if (externalTargetLoss(m, p.entityId, gone)) this._settleExternalTargetLoss(m, i, p);
        continue;
      }
      if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
      this._settleBountyTargetKill(m, i, { ...p, id: p.entityId });
    }
  },

  /**
   * INF-067 + FB-068: a tagged contract target destroyed by someone else. When the mark is gone
   * with the objective unmet, the contract voids fairly (no penalty, deposit back) instead of
   * stranding the player in a mission whose destination no longer exists. Never respawns the
   * target. A bounty keeps its own reason word; every other contract type whose objective just
   * became physically unreachable settles through 'failed_external' with the cause named.
   */
  _voidLostBountyTargets(p) {
    if (!p || p.id == null) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (missionObservesClauseEvent(m, 'entity:killed')) continue;
      const gone = (id) => {
        const e = this.state.entities && this.state.entities.get(id);
        if (!e || e.alive === false) return true;
        return !!(p.entity && id === p.id && e !== p.entity);
      };
      if (bountyTargetLost(m, p.id, gone)) {
        this._recordBountyMarkDeath(m);
        this._failMission(m, i, 'target_lost');
      } else if (externalTargetLoss(m, p.id, gone)) {
        this._settleExternalTargetLoss(m, i, p);
      }
    }
  },

  /**
   * FB-068: honest settlement for a contract objective destroyed by a non-player actor. The
   * contract voids — deposit refunded, no rep penalty — and the receipt names what took it down
   * (gunnery / an explosive / the rocks / a collision) from the shared kill-causality vocabulary.
   * The loss-site stamp routes the recovery successor to where the objective actually died.
   */
  _settleExternalTargetLoss(m, i, p) {
    if (!m || m.status !== 'active') return;
    // Authored chains own their own failure branches — a third-party kill on a campaign 47-A
    // leg, a heist objective, or an authored set piece is the chain's call to make, never a
    // generic void. Mirrors the refusal set _mutateInsteadOfFail already honors. Career legs
    // carry a storyTag but are ordinary physical contracts and settle here like any other.
    if (m.heist || m.type === AUTHORED_SET_PIECE_TYPE || setPieceCauseOf(m)
      || m.campaign47aBeat != null
      || String(m.storyTag || '').startsWith('campaign47a:')) return;
    const causal = compactKillCausality(p, this.state.playerId);
    const CAUSE_LABEL = {
      kinetic: 'gunnery',
      explosive: 'an explosive',
      terrain_collision: 'the rocks',
      ship_collision: 'a collision',
      generic: 'another crew',
    };
    m.params = m.params || {};
    m.params.externalCause = causal.cause;
    m.params.externalCauseFamily = killCauseFamily(causal.cause);
    m.params.externalKillerId = p && p.killerId != null ? p.killerId : null;
    m.params.externalCauseLabel = `the objective went down to ${CAUSE_LABEL[causal.cause] || CAUSE_LABEL.generic}`;
    this._recordBountyMarkDeath(m);
    this._stampPhysicalLossSite(m, p);
    this._failMission(m, i, 'failed_external');
  },

  _onEntityDestroyed(p) {
    if (!p || p.id == null) return;
    // PQ-019C: a destroyed capsule is a `payload_destroyed` CANDIDATE, arbitrated against whatever
    // else happened this tick — not an immediate failure. It is stamped from the live tick because
    // this listener runs synchronously with the destruction that caused it.
    this._heistEach((h) => heistMissionRuntime.onEntityDestroyed(this._heistCtx(), h, p.id));
    // Escort fail: the escortee entity died. Stamp the loss site first (INF-066) — the
    // destroy payload's last pos is the only pointer to the hull, and the entity row is
    // already deleted, so the salvage successor routes to the true wreck from this stamp.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m._escorteeId === p.id) {
        const site = escortLossSite(p.pos, this.state.world && this.state.world.currentSectorId);
        if (site) {
          m._escorteeSectorId = site.sectorId;
          m._escorteeWreckPos = site.wreckPos;
          // params.* rides serialize for anything that reads the failing row after a save;
          // the successor's own lostSectorId/lostWreckPos are minted off this stamp anyway.
          m.params = m.params || {};
          m.params.lostSectorId = site.sectorId;
          m.params.lostWreckPos = site.wreckPos;
        }
        this._failMission(m, i, 'escortee_lost');
      } else if (p.data && p.data.escortee === true && String(missionIdentityOf(p)) === String(m.id)) {
        // A wing hauler of this convoy died: the job survives, but the fee settles short at dock.
        m.params = m.params || {};
        m.params.convoyLost = (m.params.convoyLost || 0) + 1;
        this.bus.emit('toast', { text: 'Convoy hauler down — the fee settles short at dock', kind: 'warn', ttl: 4 });
      }
    }
    this._onPhysicalEntityDestroyed(p);
  },

  _onScan(p) {
    this._identifyContract47aB2(p || {});
    // Sensor Array L (and any future scanRpBonus module): ordinary freeflight scan pulses grant
    // research points through the missions researchPoints writer — the module flag was previously dead.
    this._grantFittedScanRpBonus(p || {});
    // recon_scan: a scan completed. We accept either a targeted scan (targetId matches a spawned
    // beacon) or a generic sector scan (targetId null) as one unit of progress.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'recon_scan') continue;
      if (m.params?.mercyIncidentId || m.params?.wreckCourtCaseId) continue;
      // Wreck-bound set-piece scans (long_read rumor survey + the four D13-D16 chain openings)
      // are aimed at one placed authored hull. A generic sector pulse must never finish them;
      // completion arrives from uniqueWreck:bearingFixed when the placed wreck is actually scanned.
      if (m.params && WRECK_BOUND_SET_PIECE_OBJECTIVES.has(m.params.setPieceObjective)) continue;
      // Authored landmark probes settle only from scanner's exact physical signal result below.
      // A generic sector pulse must never finish a job aimed at one named hull.
      if (m.params && m.params.landmarkProbe) continue;
      // POI causal recon is not a pulse counter. Scanner must first classify, then track, then
      // physically investigate the exact durable mission entity via signal:investigated.
      if (m.params && m.params.poiSignalFollowup) continue;
      // only count if the player is in the mission's target sector
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      if (m.params && m.params.originSurveySample) {
        if (m.params.surveyComplete) continue;
        const targetId = p && p.targetId;
        const target = targetId != null && this.state.entities && this.state.entities.get(targetId);
        const asteroidReading = !!(p && p.found && Number(p.found.asteroids) > 0)
          || !!(target && target.type === 'asteroid');
        if (!asteroidReading) continue;
        m.params.surveyComplete = true;
        m.objectiveProgress = Math.max(1, m.params.scanTargets || 1);
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', {
          missionId: m.id,
          objectiveProgress: m.objectiveProgress,
          surveyComplete: true,
        });
        continue;
      }
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  /**
   * Ambient freeflight scan RP from fitted modules (`mods.scanRpBonus`). Only fires when the pulse
   * actually found something (asteroid/wreck/anomaly/signal), so empty spam does not mint RP.
   * Missions remains the sole positive researchPoints writer for this seam.
   */
  _grantFittedScanRpBonus(payload) {
    const state = this.state;
    if (!state || !state.player) return 0;
    const bonus = Math.max(0, Math.round(maxFittedModuleMod(state, 'scanRpBonus', 0)));
    if (!(bonus > 0)) return 0;
    const found = payload && payload.found && typeof payload.found === 'object' ? payload.found : null;
    const signalCount = Math.max(0, Number(payload && payload.signalCount) || 0);
    const foundCount = found
      ? Math.max(0, Number(found.asteroids) || 0)
        + Math.max(0, Number(found.wrecks) || 0)
        + Math.max(0, Number(found.anomalies) || 0)
      : 0;
    if (foundCount + signalCount <= 0) return 0;
    state.player.researchPoints = (state.player.researchPoints || 0) + bonus;
    if (this.bus) {
      this.bus.emit('research:pointsChanged', {
        researchPoints: state.player.researchPoints,
        source: 'scan_rp_bonus',
        granted: bonus,
      });
    }
    return bonus;
  },

  /**
   * Bounded one-time-firsts ledger under state.player.researchFirsts. Each key is
   * `${scope}:${durableId}` → simTime of the grant. Absent on older saves; created lazily so
   * the golden save shape is unchanged until a first actually pays.
   */
  _ensureResearchFirsts(state) {
    const player = state && state.player;
    if (!player) return null;
    if (!player.researchFirsts || typeof player.researchFirsts !== 'object'
        || Array.isArray(player.researchFirsts)) {
      player.researchFirsts = {};
    }
    return player.researchFirsts;
  },

  /**
   * Pay one entry of RESEARCH_GRANTS for `eventName` once per durable discovery record.
   * Returns the RP granted (0 when deduped or the payload lacks its dedup field).
   */
  _grantResearchFirst(eventName, payload) {
    const spec = RESEARCH_GRANTS[eventName];
    const state = this.state;
    if (!spec || !state || !state.player) return 0;
    // A repeatable contract row must not become a first, even if something emits it.
    if (spec.repeatable === true) return 0;
    const rawId = payload ? payload[spec.field] : null;
    if (rawId == null || rawId === '') return 0;
    const firsts = this._ensureResearchFirsts(state);
    const key = `${spec.scope}:${rawId}`;
    if (firsts[key] != null) return 0;
    const keys = Object.keys(firsts);
    if (keys.length >= RESEARCH_FIRSTS_CAP) {
      // Evict the oldest stamp so a brand-new first still pays; the cap bounds save size.
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const k of keys) {
        const at = Number(firsts[k]);
        if (Number.isFinite(at) && at < oldestAt) { oldestAt = at; oldestKey = k; }
      }
      if (oldestKey) delete firsts[oldestKey];
    }
    firsts[key] = Math.max(0, Number(state.simTime) || 0);
    const rp = Math.max(0, Math.round(spec.rp) || 0);
    if (!(rp > 0)) return 0;
    state.player.researchPoints = (state.player.researchPoints || 0) + rp;
    this.bus.emit('research:pointsChanged', {
      researchPoints: state.player.researchPoints,
      source: `first:${eventName}`,
      scope: spec.scope,
      granted: rp,
    });
    return rp;
  },

  /**
   * After the one-time firsts ledger is full, a completed research contract still
   * pays the RESEARCH_GRANTS `research:contract` row, at most dailyCap times per
   * sim-day. The day count is not a researchFirsts key, so dedupe and the 256 cap
   * stay intact. Kills and bounty settlements are not this row.
   */
  _grantCappedResearchContract(mission) {
    const spec = RESEARCH_GRANTS['research:contract'];
    const state = this.state;
    if (!spec || spec.repeatable !== true || !state || !state.player || !mission) return 0;
    const types = spec.types;
    if (!Array.isArray(types) || types.includes(mission.type) !== true) return 0;
    const firsts = state.player.researchFirsts;
    const filled = firsts && typeof firsts === 'object' ? Object.keys(firsts).length : 0;
    if (filled < RESEARCH_FIRSTS_CAP) return 0;
    const cap = Math.max(0, Math.round(Number(spec.dailyCap)) || 0);
    if (!(cap > 0)) return 0;
    const rp = Math.max(0, Math.round(Number(spec.rp)) || 0);
    if (!(rp > 0)) return 0;
    const dayKey = this._dayKey();
    const ledger = state.player.researchContractDay;
    const count = ledger && ledger.dayKey === dayKey ? (Number(ledger.count) || 0) : 0;
    if (count >= cap) return 0;
    state.player.researchContractDay = { dayKey, count: count + 1 };
    state.player.researchPoints = (state.player.researchPoints || 0) + rp;
    this.bus.emit('research:pointsChanged', {
      researchPoints: state.player.researchPoints,
      source: 'research:contract',
      scope: spec.scope,
      granted: rp,
      dayKey,
      dailyCount: count + 1,
      dailyCap: cap,
    });
    return rp;
  },

  /**
   * The fighter's and miner's RP faucet. A completed contract whose type matches a repeatable
   * RESEARCH_GRANTS row that names a `requiresNode` (research:bounty, research:mining) pays
   * `rp + perRiskTier * riskTier`, at most `dailyCap` times per sim-day, counted per row in
   * state.player.researchGrantDays. Nothing is paid until the player already owns the row's
   * first-node (the stranding guard: RP must never pull a pilot into the entry purchase, and
   * the entry node costs no RP). Returns the RP granted across rows (0 when guarded or capped).
   */
  _grantCareerContractResearch(mission) {
    const state = this.state;
    if (!state || !state.player || !mission) return 0;
    const owned = Array.isArray(state.player.researchedNodes) ? state.player.researchedNodes : [];
    let total = 0;
    for (const rowKey of Object.keys(RESEARCH_GRANTS)) {
      const spec = RESEARCH_GRANTS[rowKey];
      if (!spec || spec.repeatable !== true || !spec.requiresNode) continue;
      if (!Array.isArray(spec.types) || spec.types.includes(mission.type) !== true) continue;
      if (owned.includes(spec.requiresNode) !== true) continue;
      const cap = Math.max(0, Math.round(Number(spec.dailyCap)) || 0);
      if (!(cap > 0)) continue;
      const tier = Math.max(0, Math.min(4, Math.round(Number(mission.riskTier)) || 0));
      const rp = Math.max(0, Math.round(Number(spec.rp) + (Number(spec.perRiskTier) || 0) * tier) || 0);
      if (!(rp > 0)) continue;
      const dayKey = this._dayKey();
      let ledgers = state.player.researchGrantDays;
      if (!ledgers || typeof ledgers !== 'object' || Array.isArray(ledgers)) {
        ledgers = {};
        state.player.researchGrantDays = ledgers;
      }
      const ledger = ledgers[rowKey];
      const count = ledger && typeof ledger === 'object' && ledger.dayKey === dayKey
        ? Math.max(0, Math.floor(Number(ledger.count)) || 0) : 0;
      if (count >= cap) continue;
      ledgers[rowKey] = { dayKey, count: count + 1 };
      state.player.researchPoints = (state.player.researchPoints || 0) + rp;
      this.bus.emit('research:pointsChanged', {
        researchPoints: state.player.researchPoints,
        source: rowKey,
        scope: spec.scope,
        granted: rp,
        dayKey,
        dailyCount: count + 1,
        dailyCap: cap,
      });
      total += rp;
    }
    return total;
  },

  _onLandmarkProbeScan(payload) {
    if (!payload || !Array.isArray(payload.signals) || !payload.sectorId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const probe = mission && mission.params && mission.params.landmarkProbe;
      if (!mission || mission.status !== 'active' || mission.type !== 'recon_scan' || !probe) continue;
      if (payload.sectorId !== mission.destSectorId || probe.sectorId !== mission.destSectorId) continue;
      if (this.state.world.currentSectorId !== probe.sectorId) continue;

      const target = this._livePoiEntity(probe.sectorId, probe.poiId);
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      if (!target || !player || !target.pos || !player.pos) continue;
      const maxRangeWu = Math.max(1, Math.min(300, Number(probe.maxRangeWu) || 300));
      const signalKind = typeof probe.signalKind === 'string' && probe.signalKind
        ? probe.signalKind : 'archive';
      if (distSq(target.pos, player.pos) > maxRangeWu * maxRangeWu) continue;
      const signal = payload.signals.find((row) => row
        && String(row.entityId) === String(target.id)
        && row.sourceKind === signalKind
        && Number(row.stage) >= 3
        && Number(row.distance) <= maxRangeWu);
      if (!signal) continue;

      const artifact = probe.artifact;
      if (!artifact || !artifact.id || !artifact.title || !artifact.body) return false;
      const returnedAt = Number(this.state.simTime) || 0;
      probe.returned = true;
      probe.returnedAt = returnedAt;
      probe.signalId = signal.id || null;
      mission.objectiveProgress = mission.objectiveTarget;
      this.bus.emit('landmark:artifactRecovered', {
        questId: probe.questId || mission.sourceOfferId,
        missionId: mission.id,
        sectorId: probe.sectorId,
        poiId: probe.poiId,
        targetRef: probe.targetRef || null,
        signalId: signal.id || null,
        artifact: { ...artifact },
        returnedAt,
      });
      this._completeMission(mission, i);
      return true;
    }
    return false;
  },

  /**
   * G1: reconcile a wreck-bound set-piece stage at accept time. If the chain's hull is already
   * known (a repeat run over a scanned/salvaged wreck, or a free-roam scan before accepting),
   * the stage completes against the durable bearing instead of demanding new world work — the
   * same reconcile precedent long_read's known-bearing opening follows.
   */
  _startWreckBoundStageObjective(mission) {
    const params = mission && mission.params;
    if (!mission || mission.status !== 'active' || !params) return false;
    const objective = params.setPieceObjective;
    const wreckId = params.wreckId || mission.wreckId || (mission.cause && mission.cause.wreckId);
    if (!wreckId) return false;
    const own = this.state.player && this.state.player.uniqueWrecks;
    const bearing = own && own.bearings && own.bearings[wreckId];
    if (!bearing) return false;

    if (WRECK_BOUND_SET_PIECE_OBJECTIVES.has(objective)) {
      // Only 'rumored' still owes the scan; fixed/decision/salvaged proves the hull was read.
      if (bearing.phase === 'rumored') return false;
      return this._onLongReadBearingFixed({
        wreckId,
        sectorId: mission.destSectorId,
        phase: bearing.phase,
      });
    }

    if (objective === 'investigation_recover_box') {
      // The box already left the hull: decision pending or fully salvaged proves the recovery.
      if (bearing.phase !== 'decision' && bearing.phase !== 'salvaged') return false;
      const index = this.state.missions.active.indexOf(mission);
      if (index < 0) return false;
      params.recoveredWreckId = wreckId;
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, index);
      return true;
    }
    return false;
  },

  _startLongReadObjective(mission) {
    const params = mission && mission.params;
    if (!mission || mission.status !== 'active' || !params) return false;
    const objective = params.setPieceObjective;
    const wreckId = params.wreckId || mission.wreckId || mission.cause && mission.cause.wreckId;
    const isLongReadFamily = String(objective || '').startsWith('long_read_')
      || String(objective || '').startsWith('choir_');
    if (!wreckId || !isLongReadFamily) return false;
    const own = this.state.player && this.state.player.uniqueWrecks;
    const bearing = own && own.bearings && own.bearings[wreckId];

    if (objective === 'long_read_rumor_survey') {
      if (bearing) {
        params.rumorPurchased = true;
        mission.objectiveProgress = Math.max(1, mission.objectiveProgress || 0);
        if (bearing.phase === 'fixed' || bearing.phase === 'decision' || bearing.phase === 'salvaged') {
          this._onLongReadBearingFixed({ wreckId, sectorId: mission.destSectorId, phase: bearing.phase });
        } else {
          this._refreshTrackedMissionNav(mission);
          this.bus.emit('mission:updated', { missionId: mission.id, objectiveProgress: mission.objectiveProgress });
        }
        return true;
      }
      const eventName = LONG_READ_RUMOR_EVENT[params.channelId || mission.channelId];
      if (!eventName) return false;
      // mission:accepted was the native Pale-Coil carrier immediately above this hook. If the
      // unique-wreck owner is absent, do not recursively publish a second lifecycle event.
      if (eventName === 'mission:accepted') return false;
      this.bus.emit(eventName, {
        sourceRef: params.sourceRef || mission.sourceRef,
        wreckId,
        channelId: params.channelId || mission.channelId,
        text: mission.summary || `Purchased bearing source for ${params.wreckName || wreckId}.`,
        sender: 'DRIFT BROKER',
        kind: 'mission_rumor_purchase',
      });
      return true;
    }

    if (SET_PIECE_RECOVERY_OBJECTIVES.has(objective)) {
      if (this._longReadComplicationObserved(mission)) params.complicationObserved = true;
      if (bearing && (bearing.phase === 'decision' || bearing.phase === 'salvaged')) {
        this._onLongReadDecisionReady({ wreckId, sectorId: mission.destSectorId, phase: bearing.phase });
      } else {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', {
          missionId: mission.id,
          complicationObserved: !!params.complicationObserved,
        });
      }
      return true;
    }

    if (SET_PIECE_DISPOSITION_OBJECTIVES.has(objective) && params.wreckChoiceId) {
      if (bearing && bearing.phase === 'salvaged') {
        if (bearing.choiceId !== params.wreckChoiceId) return false;
        return this._onLongReadResolved({
          wreckId,
          choiceId: bearing.choiceId,
          outcome: bearing.outcome || null,
          reconciled: true,
        });
      }
      this.bus.emit('uniqueWreck:choose', {
        wreckId,
        choiceId: params.wreckChoiceId,
        missionId: mission.id,
        chainId: mission.cause && mission.cause.chainId || null,
      });
      return true;
    }
    return false;
  },

  _longReadComplicationObserved(mission) {
    const params = mission && mission.params || {};
    const wreckId = params.wreckId || mission && mission.wreckId
      || mission && mission.cause && mission.cause.wreckId;
    const own = this.state.player && this.state.player.uniqueWrecks;
    if (!wreckId || !own) return !!params.complicationObserved;
    const complications = own.complications && Object.values(own.complications) || [];
    if (complications.some((record) => record && record.wreckId === wreckId
      && record.status !== 'scheduled')) return true;
    const bearing = own.bearings && own.bearings[wreckId];
    return !!params.complicationObserved
      || !!(params.hasReactorComplication && bearing && bearing.reactorDueAt != null)
      // Reaching the decision phase proves the live salvage crossed the wreck's authored hazard
      // context/approach gate. That is the complication for wrecks without a separate encounter.
      || !!(params.hasHazardComplication && bearing
        && (bearing.phase === 'decision' || bearing.phase === 'salvaged'));
  },

  _reconcilePostedLongReadOpening(wreckId, phase = 'rumored') {
    if (!wreckId) return false;
    let changed = false;
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      let boardChanged = false;
      for (const offer of board.slots) {
        const cause = setPieceCauseOf(offer);
        const params = offer && offer.params;
        // Wreck-bound chain openings reconcile the same way: a bearing already in the ledger
        // is the durable fact, whatever epoch originally posted the survey stage.
        if (!cause || (cause.archetypeId !== 'long_read' && cause.archetypeId !== 'choir_vigil')
          || cause.stageIndex !== 0 || !params
          || (cause.wreckId || offer.wreckId || params.wreckId) !== wreckId) continue;
        const wreckName = params.wreckName || cause.wreckName || 'Known Wreck';
        params.rumorAlreadyKnown = true;
        params.rumorPurchased = true;
        params.bearingFixed = phase === 'fixed' || phase === 'decision' || phase === 'salvaged';
        offer.upfrontCostCr = 0;
        offer.title = `Reconcile the Known Bearing: ${wreckName}`;
        offer.summary = `${wreckName} is already in your ledger. Reconcile its bearing and proceed to recovery.`;
        changed = true;
        boardChanged = true;
      }
      if (boardChanged) this.bus.emit('mission:updated', { missionId: null, stationId, wreckId });
    }
    return changed;
  },

  _onLongReadRumorRecorded(payload) {
    if (!payload || !payload.wreckId) return false;
    let changed = this._reconcilePostedLongReadOpening(payload.wreckId, payload.phase || 'rumored');
    for (const mission of [...(this.state.missions.active || [])]) {
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_rumor_survey'
        || params.wreckId !== payload.wreckId) continue;
      params.rumorPurchased = true;
      mission.objectiveProgress = Math.max(1, mission.objectiveProgress || 0);
      this._refreshTrackedMissionNav(mission);
      this.bus.emit('mission:updated', {
        missionId: mission.id,
        objectiveProgress: mission.objectiveProgress,
        rumorPurchased: true,
      });
      changed = true;
    }
    return changed;
  },

  _onLongReadBearingFixed(payload) {
    if (!payload || !payload.wreckId) return false;
    const postedChanged = this._reconcilePostedLongReadOpening(payload.wreckId, payload.phase || 'fixed');
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      // G1: every wreck-bound set-piece scan stage (long_read's rumor survey and the four
      // D13-D16 chain openings) completes when ITS placed wreck's bearing is actually fixed.
      if (!mission || mission.status !== 'active' || !params
        || !WRECK_BOUND_SET_PIECE_OBJECTIVES.has(params.setPieceObjective)
        || params.wreckId !== payload.wreckId) continue;
      params.rumorPurchased = true;
      params.bearingFixed = true;
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, i);
      return true;
    }
    return postedChanged;
  },

  _onLongReadComplication(payload) {
    if (!payload || !payload.wreckId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || !SET_PIECE_RECOVERY_OBJECTIVES.has(params.setPieceObjective)
        || params.wreckId !== payload.wreckId) continue;
      params.complicationObserved = true;
      if (params.salvageDecisionReady) {
        mission.objectiveProgress = mission.objectiveTarget;
        this._completeMission(mission, i);
      } else {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', { missionId: mission.id, complicationObserved: true });
      }
      return true;
    }
    return false;
  },

  _onLongReadDecisionReady(payload) {
    if (!payload || !payload.wreckId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || !SET_PIECE_RECOVERY_OBJECTIVES.has(params.setPieceObjective)
        || params.wreckId !== payload.wreckId) continue;
      params.salvageDecisionReady = true;
      if (!params.complicationObserved && this._longReadComplicationObserved(mission)) {
        params.complicationObserved = true;
      }
      if (!params.complicationObserved) {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', { missionId: mission.id, salvageDecisionReady: true });
        return false;
      }
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, i);
      return true;
    }
    return false;
  },

  _onLongReadResolved(payload) {
    if (!payload || !payload.wreckId || !payload.choiceId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.wreckId !== payload.wreckId) continue;
      const objective = params.setPieceObjective;
      if (objective === 'long_read_fence' && params.wreckChoiceId === payload.choiceId) {
        mission.objectiveProgress = mission.objectiveTarget;
        this._completeMission(mission, i);
        return true;
      }
      // SF-149: the third visit does not complete on the filing — the filed outcome is only
      // the durable fact the return trip must go and read. A mismatched filed disposition is
      // an honest failure: the site will never carry the outcome this stage promised.
      if (objective === 'choir_what_remains') {
        if (params.wreckChoiceId === payload.choiceId) {
          params.outcomeFiled = true;
          this._refreshTrackedMissionNav(mission);
          this.bus.emit('mission:updated', {
            missionId: mission.id, outcomeFiled: true,
            wreckId: payload.wreckId, choiceId: payload.choiceId,
          });
        } else {
          this._failMission(mission, i, 'disposition_filed');
        }
        return true;
      }
    }
    let changed = false;
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const before = board.slots.length;
      board.slots = board.slots.filter((offer) => {
        const params = offer && offer.params;
        const wreckId = params && params.wreckId || offer && offer.wreckId
          || offer && offer.cause && offer.cause.wreckId;
        return !(params && SET_PIECE_DISPOSITION_OBJECTIVES.has(params.setPieceObjective)
          && wreckId === payload.wreckId && params.wreckChoiceId !== payload.choiceId);
      });
      if (board.slots.length !== before) changed = true;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null, wreckId: payload.wreckId });
    return changed;
  },

  /**
   * SF-149 — the third visit's per-tick predicate. Accepting `choir_what_remains` already
   * filed the named disposition into the durable bearing (or reconciled an outcome the site
   * was already wearing); the stage's remaining job is physical: be inside the recovered
   * site's sector and stand close enough to read the placard. A wreckless coordinate still
   * works — the place is the fixedPos, not the hull.
   */
  _driveChoirWhatRemainsReturn(m, index, state) {
    const params = m && m.params || {};
    const wreckId = params.wreckId || m.wreckId || (m.cause && m.cause.wreckId);
    const own = state && state.player && state.player.uniqueWrecks;
    const bearing = own && own.bearings && own.bearings[wreckId];
    if (!bearing || bearing.phase !== 'salvaged') return false;
    if (!state || !state.world || state.world.currentSectorId !== m.destSectorId) return false;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.pos) return false;
    const site = bearing.fixedPos || bearing.exactPos;
    if (!site) return false;
    const r = CHOIR_RETURN_RADIUS_WU;
    if (distSq(player.pos, site) > r * r) return false;
    m.objectiveProgress = m.objectiveTarget;
    this._completeMission(m, index);
    return true;
  },

  // NXI-180 — a revised observation qualifies only the course it concerns. When a scan stales
  // out or contradicts a filed clue (NXB-045's book keeps the superseded reading), the LIVE
  // course — when missions authored it for the TRACKED job — has its suggestion sentence
  // re-qualified through the clue's route advice, so the old advice does not keep sending the
  // player at a bearing the evidence has already revised. The gate is the same navigation-
  // versus-tracking check the local map draws (NXI-215): the waypoint's missionId must be the
  // tracked mission's id, so a course parked for an active-but-untracked job (reachable via
  // _trackedOrFirstActiveMission) is never rewritten for evidence it has no relation to.
  // Unrelated tracked jobs, board rows, and the tracked-mission selection are untouched, and
  // nothing is auto-accepted: no accept/track call sits on this path. A scanner-laid signal
  // course (no missionId) stays the scanner's to move.
  _onClueRouteRevision(payload) {
    const state = this.state;
    const wp = state && state.nav && state.nav.waypoint;
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    if (!wp || !wp.missionId || wp.missionId !== trackedId) return false;
    const signals = payload && Array.isArray(payload.signals) ? payload.signals : [];
    const scannedAt = Number(payload && payload.scannedAt);
    let clue = null;
    for (const row of signals) {
      const c = row && row.clue;
      if (!c || !Array.isArray(c.history) || !c.history.length) continue;
      // Only a reading filed by THIS pulse qualifies; an older superseded clue already spoke.
      if (Number.isFinite(scannedAt) && Number(c.observedAt) !== scannedAt) continue;
      clue = c;
      break;
    }
    if (!clue || !clue.route || !clue.route.reason) return false;
    if (wp.reason === clue.route.reason) return false;
    wp.reason = String(clue.route.reason).slice(0, 160);
    this.bus.emit('nav:waypoint', wp);
    return true;
  },

  _onSignalInvestigated(p) {
    if (!p || p.entityId == null || !p.signalId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      const follow = m && m.params && m.params.poiSignalFollowup;
      if (!m || m.status !== 'active' || !follow) continue;
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      if (follow.destSectorId !== m.destSectorId) continue;
      if (follow.entityId == null || p.entityId !== follow.entityId) continue;
      if (!m.targetEntityIds.includes(p.entityId)) continue;
      if (p.signalId !== `signal:entity:${p.entityId}`) continue;
      const target = this.state.entities && this.state.entities.get(p.entityId);
      if (!target || target.alive === false || !target.data
        || target.data.worldRecordId !== follow.targetRecordId) continue;
      m.params.investigatedSignalId = p.signalId;
      m.params.investigatedTargetRecordId = follow.targetRecordId;
      m.objectiveProgress = m.objectiveTarget;
      this._completeMission(m, i);
      return true;
    }
    return false;
  },

  _identifyContract47aB2(p) {
    const m = (this.state.missions.active || []).find((mission) => (
      mission && mission.status === 'active'
      && mission.storyTag === CONTRACT_47A_B2_TAG
      && mission.type === 'bounty_hunt'
    ));
    if (!m || m.params && m.params.investigationStage === 'identified') return false;
    if (this.state.world.currentSectorId !== m.destSectorId) return false;
    const selectedId = p && p.targetId != null ? p.targetId : this.state.player && this.state.player.targetId;
    if (selectedId == null || !m.targetEntityIds.includes(selectedId)) return false;
    const target = this.state.entities.get(selectedId);
    const player = this.state.entities.get(this.state.playerId);
    if (!target || target.alive === false || !target.pos || !player || !player.pos) return false;
    if (distSq(target.pos, player.pos) > CONTRACT_47A_B2_SCAN_RADIUS_WU * CONTRACT_47A_B2_SCAN_RADIUS_WU) return false;

    m.params = m.params || {};
    m.params.investigationStage = 'identified';
    m.params.identifiedBy = 'scanner';
    this._ensureCampaignSidecar();
    recordBeatStep(this.state, 'scan:completed', {
      missionId: m.id,
      targetId: selectedId,
      storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
    }, this.state.simTime || 0);
    this._refreshTrackedMissionNav(m);
    this.bus.emit('mission:updated', { missionId: m.id, investigationStage: 'identified' });
    this._sayStoryLine('Registry match: civilian maintenance vessel. Choose your response.', 6);
    return true;
  },

  _onContract47aB2TetherReel(p) {
    if (!p || p.actorId !== this.state.playerId || p.targetId == null) return false;
    const after = Number(p.after);
    if (!Number.isFinite(after) || after > CONTRACT_47A_B2_CUSTODY_REEL_WU) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || m.storyTag !== CONTRACT_47A_B2_TAG || m.type !== 'bounty_hunt') continue;
      if (!m.targetEntityIds.includes(p.targetId)) continue;
      if (!m.params || m.params.investigationStage !== 'identified') return false;
      this._resolveContract47aB2(m, i, 'custody', p.targetId);
      return true;
    }
    return false;
  },

  _resolveContract47aB2(m, index, outcome, entityId) {
    if (!m || m.status !== 'active' || m.storyTag !== CONTRACT_47A_B2_TAG || m.type !== 'bounty_hunt') return false;
    m.params = m.params || {};
    if (m.params.investigationOutcome) return false;
    if (m.params.investigationStage !== 'identified') {
      m.params.investigationStage = 'identified';
      m.params.identifiedBy = 'wreck_registry';
      this._ensureCampaignSidecar();
      recordBeatStep(this.state, 'entity:killed', {
        missionId: m.id,
        targetId: entityId,
        storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
      }, this.state.simTime || 0);
    }
    m.params.investigationOutcome = outcome;
    this.state.story.flags = this.state.story.flags || {};
    this.state.story.flags.elroy_outcome = outcome;
    this.bus.emit('story:elroyResolved', {
      entityId,
      missionId: m.id,
      storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
      outcome,
      identifiedBy: m.params.identifiedBy || null,
    });
    // §34.7 Book 2 — the terminal register: UNKNOWN resolves to a filed civilian hull for
    // one dropped frame, then the bounty posts. The second kill-feed line appears and is
    // overwritten in the same second (R11). No music, no joke — the register speaks.
    const register = (m.storyTarget && m.storyTarget.registry) || 'CIVILIAN VESSEL — REGISTERED';
    this.bus.emit('comms:popup', {
      id: `b2_elroy_register_${m.id}`, sender: 'IFF REGISTER', category: 'story', ttl: 8,
      persist: true,
      text: `IFF: ${register} — ${outcome === 'custody' ? 'TAKEN INTO CUSTODY' : 'BOUNTY COLLECTED'}. THEY WERE CARRYING MEDICINE.`,
    });
    this._sayStoryLine(outcome === 'custody'
      ? 'Elroy secured. Registry discrepancy preserved.'
      : 'Elroy destroyed. Registry discrepancy recorded.', 6);
    m.objectiveProgress = m.objectiveTarget;
    this._completeMission(m, index);
    return true;
  },

  /**
   * The lawful post behind a contraband scan, when the packet lets it be resolved: a berth or
   * lawful-inspection packet stamps the owning checkpoint's stationId; a patrol hull resolves
   * through its assigned jurisdiction zone or the lawful protection bubble it (or the scanned
   * ship) was standing in. Returns null when nothing truthful resolves — callers keep the
   * legacy origin/destination fallback rather than mint an unrelated station.
   */
  _bustedJurisdictionStationId(p) {
    if (!p) return null;
    if (typeof p.stationId === 'string' && STATION_INFO.get(p.stationId)) return p.stationId;
    const entities = this.state.entities;
    const patrol = p.patrolId != null && entities && typeof entities.get === 'function'
      ? entities.get(p.patrolId) : null;
    const zoneId = patrol && patrol.data && patrol.data.ai && patrol.data.ai.zoneId;
    if (typeof zoneId === 'string' && zoneId.startsWith('jurisdiction:')) {
      const stationId = zoneId.slice('jurisdiction:'.length);
      if (STATION_INFO.get(stationId)) return stationId;
    }
    const jurisdiction = (patrol && protectedStationAt(this.state, patrol))
      || protectedStationAt(this.state, entities && entities.get(this.state.playerId));
    if (jurisdiction && jurisdiction.stationId && STATION_INFO.get(jurisdiction.stationId)) {
      return jurisdiction.stationId;
    }
    return null;
  },

  _onScannedByPatrol(p) {
    if (!p || !p.hasContraband) return;
    // An evaded sweep (the engine rolled `detected:false`) read nothing and confiscated nothing:
    // the run is not busted. A packet with no `detected` key is a hand-emitted bust and stands.
    if (p.detected === false) return;
    // Any active smuggling run is busted (the law penalty itself is applied by economy/customs).
    // One jurisdiction read per sweep: every run caught by the same scan answers to the same
    // lawful post, whether it settles here as `busted` or through its own scan clause.
    const jurisdictionStationId = this._bustedJurisdictionStationId(p);
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'smuggling_run') continue;
      if (jurisdictionStationId) {
        m.params = m.params || {};
        m.params.bustedStationId = jurisdictionStationId;
      }
      // A scan clause observes this same event after missions. Let its one clauseBroken intent own
      // settlement so the run cannot be failed once as "busted" and again as a clause breach.
      if (missionObservesClauseEvent(m, 'player:scannedByPatrol')) continue;
      this._failMission(m, i, 'busted');
    }
  },

  /** Boarded salvage/communicator offer for one salvage point (stable point id rides the params). */
  _salvageOfferByPoint(salvagePointId) {
    if (!salvagePointId) return null;
    const boards = (this.state.missions && this.state.missions.boards) || {};
    for (const board of Object.values(boards)) {
      const offer = (board && board.slots || []).find((o) => o && o.source === 'salvage' && (
        o.salvagePointId === salvagePointId
        || (o.params && (o.params.salvagePointId === salvagePointId || o.params.survivorPodId === salvagePointId))
      ));
      if (offer) return offer;
    }
    return null;
  },

  /**
   * BP-01.1: an authored wreck choice arrived from the deck adapter. Missions owns the offer, so
   * the pick stamps wreckChoiceId on the boarded offer's params and runs the canonical accept —
   * the option label/blurb ride `wreckMission:choiceApplied` so downstream systems (and tests)
   * can settle differently on the committed disposition without re-reading the deck.
   */
  _onWreckMissionChoice(payload) {
    if (!payload) return false;
    const offerId = payload.offerId || payload.missionId;
    const choiceId = payload.choiceId || payload.optionId || null;
    if (!offerId) return false;
    const { offer } = this._findOffer(offerId);
    if (!offer || offer.source !== 'salvage') return false;
    // A survivor pod's rescue/strip is survivorPod's own physical choice — not a contract option.
    if (offer.params && offer.params.survivorPodId) return false;
    const options = offer.choice && Array.isArray(offer.choice.options) ? offer.choice.options : [];
    const option = choiceId ? options.find((o) => o && o.id === choiceId) : null;
    if (options.length && (!option || !choiceId)) return false;
    if (option) {
      offer.params = offer.params || {};
      offer.params.wreckChoiceId = option.id;
    }
    const accepted = this.acceptMission(offer.id);
    if (accepted) {
      this.bus.emit('wreckMission:choiceApplied', {
        offerId: offer.id,
        wreckMissionId: offer.wreckMissionId || (offer.params && offer.params.wreckMissionId) || null,
        choiceId: option ? option.id : null,
        salvagePointId: offer.salvagePointId || (offer.params && offer.params.salvagePointId) || null,
        source: payload.source || 'prompt',
      });
      this.bus.emit('comms:log', {
        from: offer.giver || 'Derelict',
        text: option && option.blurb
          ? `Choice logged — ${option.label}. ${option.blurb}`
          : `Claim filed: ${offer.title}.`,
        kind: 'salvage',
      });
    }
    return accepted;
  },

  /** Rescue committed (pod already on the line): the boarded passenger contract goes live. */
  _onSurvivorRescueSelected(payload) {
    const pointId = payload && payload.salvagePointId;
    if (!pointId) return false;
    const offer = this._salvageOfferByPoint(pointId);
    if (!offer || offer.type !== 'passenger_transport') return false;
    return this.acceptMission(offer.id);
  },

  /**
   * A stripped pod is terminal: remove any boarded offer for it, and a live rescue contract
   * fails into residue (pods_lost → recovery salvage) instead of dangling.
   */
  _onSurvivorPodStripped(payload) {
    const pointId = payload && payload.salvagePointId;
    if (!pointId) return;
    const boards = (this.state.missions && this.state.missions.boards) || {};
    let withdrew = false;
    for (const [stationId, board] of Object.entries(boards)) {
      if (!board || !Array.isArray(board.slots)) continue;
      const kept = board.slots.filter((o) => !(o && o.source === 'salvage' && (
        o.salvagePointId === pointId
        || (o.params && (o.params.salvagePointId === pointId || o.params.survivorPodId === pointId))
      )));
      if (kept.length !== board.slots.length) { board.slots = kept; withdrew = true; }
    }
    if (withdrew) this.bus.emit('mission:updated', { missionId: null });
    // The stripped pod's own drift is the loss site (INF-066): resolve it from the salvage point
    // record — global XZ stamped at plan time — or the just-killed entity, never a rumor.
    const point = ((this.state.salvage && this.state.salvage.points) || [])
      .find((entry) => entry && entry.id === pointId);
    const podEntity = payload && payload.entityId != null
      && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(payload.entityId) : null;
    const site = escortLossSite(
      (point && point.pos) || (podEntity && podEntity.pos),
      (point && point.sectorId)
        || (podEntity && this.state.world && this.state.world.currentSectorId)
        || null,
    );
    const active = this.state.missions.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (!m || m.status !== 'active' || !m.params || m.params.survivorPodId !== pointId) continue;
      if (site) {
        m.params.lostSectorId = site.sectorId;
        m.params.lostWreckPos = site.wreckPos;
      }
      this._failMission(m, i, 'pods_lost');
    }
  },

  /**
   * BP-01.1 + INF-066: a player death while contract cargo is aboard fails the affected legs
   * (the manifest went down with the ship) and the mutation seam posts a recovery successor at
   * the durable player-wreck marker — the hull the pilot actually left behind, never a rumored
   * position. Recovery-only deaths (ironman, already-empty holds) stay silent.
   */
  _onPlayerDeathMissions(p) {
    if (!p || p.recoverable === false) return;
    const cargo = this.state.player && this.state.player.cargo;
    const items = cargo && cargo.items;
    if (!items) return;
    const losses = p.recovery && Array.isArray(p.recovery.cargoLosses) ? p.recovery.cargoLosses : null;
    // The recovery berth will take exactly these units out of the hold (combat applies the plan
    // verbatim), so a failing contract's sealed freight is first charged against that loss.
    const lossBudget = new Map();
    for (const row of losses || []) {
      if (!row || typeof row.commodityId !== 'string') continue;
      const qty = Math.max(0, Math.floor(Number(row.qty) || 0));
      if (qty > 0) lossBudget.set(row.commodityId, (lossBudget.get(row.commodityId) || 0) + qty);
    }
    const persistent = this.state.story && Array.isArray(this.state.story.persistentCargo)
      ? this.state.story.persistentCargo : [];
    const marker = playerWreckMarker(this.state);
    const site = escortLossSite(
      (marker && marker.pos) || p.pos,
      (marker && marker.sectorId) || (this.state.world && this.state.world.currentSectorId),
    );
    const active = this.state.missions.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (!m || m.status !== 'active' || !ONE_LOAD_CARGO_TYPES.has(m.type)) continue;
      const cmdtyId = m.params && m.params.cmdtyId;
      if (!cmdtyId || persistent.includes(cmdtyId)) continue;
      const need = Math.max(1, Math.floor(Number(m.params.qty) || 1));
      const have = Math.max(0, Math.floor(Number(items[cmdtyId]) || 0));
      // Recovery halves a non-persistent hold (playerDefeat.buildRecoveryPlan); when the receipt
      // is not present in this payload the same floor-half rule applies for the contract check.
      const lost = losses
        ? Math.max(0, Math.floor(Number((losses.find((l) => l && l.commodityId === cmdtyId) || {}).qty) || 0))
        : Math.floor(have * 0.5);
      if (lost <= 0 || have - lost >= need) continue;
      if (site) {
        m._escorteeSectorId = site.sectorId;
        m._escorteeWreckPos = site.wreckPos;
        // params.* is the durable twin — the same site the successor's pocket co-locates on
        // (playerWreckSite) survives a save between death and recovery.
        m.params = m.params || {};
        m.params.lostSectorId = site.sectorId;
        m.params.lostWreckPos = site.wreckPos;
      }
      m._shipLostQty = lost;
      // Settle the wreck's loss and the failed reservation together. The sealed units the wreck
      // takes are the ones the recovery plan removes; failing the contract must only remove the
      // reserved freight that SURVIVES the loss, or recovery then applies the same loss again to
      // what is left and eats the pilot's own units of that commodity.
      if (m.preloadedCargo === true && lossBudget.size) {
        const left = lossBudget.get(cmdtyId) || 0;
        const absorbed = Math.min(left, releasableContractUnits(this.state, m));
        if (absorbed > 0) {
          lossBudget.set(cmdtyId, left - absorbed);
          m._lossAbsorbedQty = absorbed;
        }
      }
      this._failMission(m, i, 'ship_lost');
    }
  },

  _onConditionSatisfied(payload) {
    const missionId = payload && payload.missionId;
    if (!missionId || payload.blocking !== true) return false;
    const index = this.state.missions.active.findIndex((m) => (
      m && m.id === missionId && m.status === 'active' && m._settlePending === true
    ));
    if (index < 0) return false;
    const mission = this.state.missions.active[index];
    if (this._blockedByConditions(mission)) return false;
    this._completeMission(mission, index);
    return true;
  },

  _onContractClauseBroken(payload) {
    const missionId = payload && payload.missionId;
    const clauseId = payload && payload.clauseId;
    if (!missionId || !clauseId) return false;
    const index = this.state.missions.active.findIndex((mission) => (
      mission && mission.id === missionId && mission.status === 'active'
    ));
    if (index < 0) return false;
    const mission = this.state.missions.active[index];
    if (!Array.isArray(mission.clauses)
      || !mission.clauses.some((clause) => clause && clause.id === clauseId)) return false;
    this._failMission(mission, index, `clause_broken:${clauseId}`);
    return true;
  },

  _onContract47aB3ShipPurchased(p) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 3) {
      this._storyTrigger('ship_purchased', p || {});
      return false;
    }
    // PQ-032.00: Bigger Boat is the long tow. A hull buy cannot settle it.
    return false;
  },

  _onContract47aB3Docked(_stationId) {
    return false;
  },

  _onContract47aB6AssetDeployed(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags && story.flags.deep_reach_asset_lost) {
      if (!p || p.kind !== 'drone' || p.id == null) return false;
      story.flags.empire_seed_pending_id = p.id;
      story.flags.empire_seed_pending_def = p.defId || null;
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Replacement deployed. Restore the seed program.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6) {
      this._storyTrigger('asset_deployed', p || {});
      return false;
    }
    story.flags = story.flags || {};
    const deployment = b6DeploymentPayload(p);
    if (!deployment) return false;
    if (campaign47aRouteKind(this.state) === 'legacy') {
      this._storyTrigger('asset_deployed', deployment);
      return story.beatIndex !== 6;
    }
    if (deployment.kind !== 'drone') {
      story.flags.empire_seed_complete = true;
      story.flags.empire_seed_variant = deployment.kind;
      story.flags.empire_seed_asset_id = deployment.id;
      delete story.flags.empire_seed_pending_id;
      delete story.flags.empire_seed_pending_def;
      this._storyTrigger('asset_deployed', deployment);
      if (story.beatIndex === 6) {
        delete story.flags.empire_seed_complete;
        delete story.flags.empire_seed_variant;
        delete story.flags.empire_seed_asset_id;
        return false;
      }
      return true;
    }
    story.flags.empire_seed_pending_id = deployment.id;
    story.flags.empire_seed_pending_def = deployment.defId || null;
    this._refreshNavigation({ forceStory: true, silent: true });
    this._sayStoryLine('Drone deployed. Assign the marked program.', 5);
    return true;
  },

  _onContract47aB6ProgramAssigned(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags && story.flags.deep_reach_asset_lost) {
      const program = getEmpireSeedProgram(campaign47aOutcomeKey(this.state));
      if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
      if (p.templateId !== program.templateId) return false;
      story.flags.empire_seed_asset_id = p.id;
      story.flags.empire_seed_variant = program.id;
      delete story.flags.empire_seed_pending_id;
      delete story.flags.empire_seed_pending_def;
      delete story.flags.deep_reach_asset_lost;
      this._refreshEmbodiedStoryBoards();
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Seed rebound. Deep Reach operation reposted.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6 || !story.flags) return false;
    const program = getEmpireSeedProgram(campaign47aOutcomeKey(this.state));
    if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
    if (p.templateId !== program.templateId) {
      this._sayStoryLine(`Assign ${program.templateId.replace(/_/g, ' ')} to this drone.`, 5);
      return false;
    }
    const assetId = p.id;
    story.flags.empire_seed_complete = true;
    story.flags.empire_seed_variant = program.id;
    story.flags.empire_seed_asset_id = assetId;
    delete story.flags.empire_seed_pending_id;
    delete story.flags.empire_seed_pending_def;
    this._storyTrigger('asset_deployed', {
      kind: 'drone', id: assetId, defId: p.defId || null,
      sectorId: p.sectorId || null, templateId: p.templateId, programmed: true,
    });
    if (story.beatIndex === 6) {
      delete story.flags.empire_seed_complete;
      delete story.flags.empire_seed_variant;
      delete story.flags.empire_seed_asset_id;
      return false;
    }
    return true;
  },

  _onContract47aB6AssetLost(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags
      && !story.flags.deep_reach_operation_complete
      && p && p.kind === 'drone' && p.id === story.flags.empire_seed_asset_id) {
      story.flags.deep_reach_asset_lost = true;
      delete story.flags.empire_seed_asset_id;
      for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
        const m = this.state.missions.active[i];
        if (m && m.status === 'active' && String(m.storyTag || '').startsWith('campaign47a:b7:')) {
          this._failMission(m, i, 'seed_asset_lost');
        }
      }
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Deep Reach seed lost. Deploy a replacement.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6 || !story.flags) return false;
    if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
    delete story.flags.empire_seed_pending_id;
    delete story.flags.empire_seed_pending_def;
    this._refreshNavigation({ forceStory: true, silent: true });
    this._sayStoryLine('Seed lost. Deploy a replacement drone.', 5);
    return true;
  },

  _spawnPhysicalTargetsFor(m, nextRng, px, pz) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity || !m) return;
    if (m.params?.workingBattlefield) { spawnWorkingBattlefield(this, m); return; }
    const b2RescueDefinition = isCampaign47aB2Rescue(m) ? authoredDefinitionOf(m) : null;
    const b2Rescue = !!b2RescueDefinition;
    const rescueEncounter = b2Rescue ? authoredEncounterOf(b2RescueDefinition) : null;
    const rescuePodActor = rescueEncounter && rescueEncounter.actors
      ? rescueEncounter.actors.find((actor) => actor.role === PHYSICAL_ROLE.POD) : null;
    const rescueEscortActor = rescueEncounter && rescueEncounter.actors
      ? rescueEncounter.actors.find((actor) => actor.role === PHYSICAL_ROLE.ESCORT) : null;
    const rescueActorOutcomes = b2Rescue ? ensureB2RescueActorOutcomes(m) : null;
    const have = this._countPhysicalRoles(m);
    const wantCore = m.type === 'tow_recovery' ? 1 : 0;
    const wantTower = m.type === 'demolition' ? 1 : 0;
    const configuredPodCount = Math.max(1, Number(m.params && m.params.podCount) || 2);
    // B2 actor outcomes are a per-cast durable ledger; the counters remain as compact HUD/save
    // compatibility fields. Other rescue contracts retain their existing replenishment rule.
    const b2PodsLost = b2Rescue ? Math.max(
      Math.max(0, Math.floor(Number(m.params && m.params.podsLost) || 0)),
      Object.values(rescueActorOutcomes).filter((outcome) => outcome === 'lost').length,
    ) : 0;
    const wantPods = m.type === 'rescue_under_fire'
      ? (b2Rescue ? Math.max(0, configuredPodCount - b2PodsLost) : configuredPodCount) : 0;
    // FB-067: escortCount is a VARIANT field now, not a rescue constant — a guarded tower rows
    // its own picket screen (demolition) and a pocket pull packs heavier cover (rescue). The
    // rescue default stays 2; every other type defaults to zero pickets unless the variant says so.
    const configuredEscortCount = m.type === 'rescue_under_fire'
      ? Math.max(0, (m.params && m.params.escortCount != null ? m.params.escortCount : 2))
      : Math.max(0, (m.params && m.params.escortCount) || 0);
    const b2EscortsDown = b2Rescue ? Math.max(
      Math.max(0, Math.floor(Number(m.params && m.params.escortsDown) || 0)),
      Object.values(rescueActorOutcomes).filter((outcome) => outcome === 'cleared').length,
    ) : 0;
    const wantEscorts = b2Rescue
      ? Math.max(0, configuredEscortCount - b2EscortsDown) : configuredEscortCount;
    const need = Math.max(0, wantCore - have.core)
      + Math.max(0, wantTower - have.tower)
      + Math.max(0, wantPods - have.pods)
      + Math.max(0, wantEscorts - have.escorts);
    if (need <= 0) return;
    const occupied = new Set((m.targetEntityIds || []).map((id) => (
      missionTargetSlotOf(this.state.entities.get(id), m.id)
    )).filter((slot) => slot != null));
    const nextSlot = () => {
      let slot = 0;
      while (occupied.has(slot)) slot += 1;
      occupied.add(slot);
      return slot;
    };
    const spawnAt = (durableSlot, spec) => {
      const ent = helpers.spawnEntity(spec);
      if (!ent) return null;
      this._stampMissionTargetIdentity(ent, m, durableSlot);
      m.targetEntityIds.push(ent.id);
      return ent;
    };
    const authoredRescuePos = (actor, actorIndex, fallback) => {
      if (!b2Rescue || !actor) return fallback;
      const layout = Array.isArray(actor.stagingByIndex) ? actor.stagingByIndex[actorIndex] : null;
      const forwardWu = Number(layout && layout.forwardWu);
      const sideWu = Number(layout && layout.sideWu);
      if (!Number.isFinite(forwardWu) || !Number.isFinite(sideWu)) return fallback;
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      const heading = player && Number.isFinite(Number(player.rot)) ? Number(player.rot) : 0;
      const c = Math.cos(heading), s = Math.sin(heading);
      const pos = {
        x: px + c * forwardWu - s * sideWu,
        z: pz + s * forwardWu + c * sideWu,
      };
      // Keep hostiles out of station/gate protection; if an authored flank is protected, retain
      // the established hostile spawn rule for that escort.
      if (actor.hostile && !outsideMissionPortSafety(this.state, pos)) return fallback;
      return pos;
    };
    if (m.type === 'tow_recovery' && have.core < wantCore) {
      const durableSlot = nextSlot();
      const rng = nextRng(durableSlot);
      const ang = rng() * Math.PI * 2;
      const r = 220 + rng() * 80;
      const bodyRadius = Math.max(8, Number(m.params && m.params.bodyRadius) || 16);
      const cachePos = ashfallCacheApproachPos(m, -200);
      const buoy = starterBuoySpec(m, sectorLocalToGlobalForSector);
      if (buoy) {
        buoy.data.physicalRole = PHYSICAL_ROLE.SLAG_CORE;
        spawnAt(durableSlot, buoy);
      } else spawnAt(durableSlot, {
        type: 'asteroid',
        team: 2,
        pos: cachePos || { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r },
        vel: { x: 0, z: 0 },
        rot: rng() * Math.PI * 2,
        radius: bodyRadius,
        mass: Math.max(40, m.params && m.params.massU || 36),
        hull: 220,
        hullMax: 220,
        collides: true,
        physicsBody: { radius: asteroidColliderRadius(null, bodyRadius) },
        data: {
          missionTag: m.id,
          physicalRole: PHYSICAL_ROLE.SLAG_CORE,
          scanLabel: (m.params && m.params.scanLabel) || 'SLAG CORE',
          tetherable: true,
          ...(m.params && m.params.tetherPayload ? { tetherPayload: true } : {}),
          // W-BOOKS-3-4: Feed the Maw — the "core" is a living Furnace maw; the stamp
          // lets scanners/scars read it as fauna, not ore.
          ...(m.params && m.params.furnaceMaw === true ? { furnaceMaw: true } : {}),
        },
      });
    }
    if (m.type === 'demolition' && have.tower < wantTower) {
      const durableSlot = nextSlot();
      const rng = nextRng(durableSlot);
      const ang = rng() * Math.PI * 2;
      const r = 260 + rng() * 90;
      const cachePos = ashfallCacheApproachPos(m, 260);
      spawnAt(durableSlot, {
        type: 'wreck',
        team: 2,
        pos: cachePos || { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r },
        vel: { x: 0, z: 0 },
        rot: rng() * Math.PI * 2,
        radius: 26,
        mass: 180,
        hull: 160,
        hullMax: 160,
        collides: true,
        collisionMask: MISSION_WRECK_COLLISION_MASK,
        // SFQ-B025: the named mass is the body's own mass, not a density re-derive.
        physicsBody: { shape: 'capsule', mass: 180 },
        data: {
          missionTag: m.id,
          physicalRole: PHYSICAL_ROLE.TOWER,
          proportions: WRECK_COLLIDER_PROPORTIONS,
          scanLabel: 'DEAD TOWER',
          tetherable: true,
        },
      });
    }
    if (m.type === 'rescue_under_fire') {
      // FB-067 pocket_pull: the variant's podSpreadWu is the pocket's own radius — a tight
      // cluster of pods reads as one problem under heavy cover, not a scattered field.
      const podSpread = Number.isFinite(m.params && m.params.podSpreadWu)
        ? Math.max(40, m.params.podSpreadWu) : null;
      const activeActorIds = b2Rescue ? new Set((m.targetEntityIds || []).map((id) => {
        const entity = this.state.entities && this.state.entities.get(id);
        return entity && entity.data && entity.data.missionActorId;
      }).filter(Boolean)) : null;
      const podIndices = b2Rescue
        ? Array.from({ length: configuredPodCount }, (_, index) => index).filter((index) => {
          const actorId = b2RescueActorIdentity(m, rescuePodActor, index);
          return !rescueActorOutcomes[actorId] && !activeActorIds.has(actorId);
        })
        : Array.from({ length: Math.max(0, wantPods - have.pods) }, (_, offset) => have.pods + offset);
      for (const i of podIndices) {
        const durableSlot = b2Rescue ? i : nextSlot();
        const rng = nextRng(durableSlot);
        const ang = rng() * Math.PI * 2;
        const r = podSpread != null
          ? podSpread * (0.6 + rng() * 0.5)
          : 180 + rng() * 70;
        const podActor = rescuePodActor || {};
        const defaultPos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
        const pos = authoredRescuePos(podActor, i, defaultPos);
        spawnAt(durableSlot, {
          // rescuePriority selects the existing released place_47a_rescue_capsule.glb body.
          type: b2Rescue ? 'payload' : 'wreck',
          team: 2,
          pos,
          vel: { x: 0, z: 0 },
          rot: rng() * Math.PI * 2,
          radius: Number(podActor.radius) || 7,
          mass: Number(podActor.mass) || 10,
          hull: Number(podActor.hull) || 36,
          hullMax: Number(podActor.hull) || 36,
          collides: true,
          ...(b2Rescue ? {} : { collisionMask: MISSION_WRECK_COLLISION_MASK }),
          physicsBody: { shape: 'capsule', mass: Number(podActor.mass) || 10 },
          ...(b2Rescue ? { flags: { persistent: true, durable: true, missionPinned: true } } : {}),
          data: {
            missionTag: m.id,
            physicalRole: PHYSICAL_ROLE.POD,
            ...(b2Rescue ? {
              rescuePriority: true,
              distressBeacon: true,
              packagedPropFile: 'places/place_47a_rescue_capsule.glb',
              packagedPropSlot: 'place',
              missionActorId: b2RescueActorIdentity(m, podActor, i),
            } : { proportions: WRECK_COLLIDER_PROPORTIONS }),
            scanLabel: podActor.scanLabel || 'LIFE POD',
            tetherable: true,
          },
        });
      }
    }
    // FB-067: picket/escort bodies spawn for ANY type whose variant rows them in. A demolition
    // picket screens the TOWER (anchored on the live body, falling back to the player ring);
    // a rescue escort screens the pod pocket as before.
    if (wantEscorts > have.escorts) {
      const sector = SECTOR_BY_ID.get(m.destSectorId);
      const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];
      const tower = m.type === 'demolition' ? this._physicalTargetOf(m, PHYSICAL_ROLE.TOWER) : null;
      const anchor = tower && tower.pos ? { x: tower.pos.x, z: tower.pos.z } : { x: px, z: pz };
      const activeActorIds = b2Rescue ? new Set((m.targetEntityIds || []).map((id) => {
        const entity = this.state.entities && this.state.entities.get(id);
        return entity && entity.data && entity.data.missionActorId;
      }).filter(Boolean)) : null;
      const escortIndices = b2Rescue
        ? Array.from({ length: configuredEscortCount }, (_, index) => index).filter((index) => {
          const actorId = b2RescueActorIdentity(m, rescueEscortActor, index);
          return !rescueActorOutcomes[actorId] && !activeActorIds.has(actorId);
        })
        : Array.from({ length: Math.max(0, wantEscorts - have.escorts) }, (_, offset) => have.escorts + offset);
      for (const i of escortIndices) {
        const durableSlot = b2Rescue ? configuredPodCount + i : nextSlot();
        const rng = nextRng(durableSlot);
        const ang = rng() * Math.PI * 2;
        const defaultPos = tower
          ? { x: anchor.x + Math.cos(ang) * (120 + rng() * 60), z: anchor.z + Math.sin(ang) * (120 + rng() * 60) }
          : (missionHostileSpawnPos(this.state, anchor, rng) || { x: px + 400, z: pz + 200 });
        const escortActor = rescueEscortActor || {};
        const pos = authoredRescuePos(escortActor, i, defaultPos);
        const spec = makeEnemySpawnSpec(escortActor.archetype || 'wasp_swarmer', Math.round((lvLo + lvHi) / 2), pos, {
          startedTick: deferredEnterTick(this.state),
        });
        spec.data = spec.data || {};
        spec.data.missionTag = m.id;
        spec.data.physicalRole = PHYSICAL_ROLE.ESCORT;
        spec.data.scanLabel = m.type === 'demolition' ? 'TOWER PICKET' : (escortActor.scanLabel || 'RESCUE ESCORT');
        if (b2Rescue) spec.data.missionActorId = b2RescueActorIdentity(m, escortActor, i);
        spawnAt(durableSlot, spec);
      }
    }
  },

  _spawnAuthoredSetPieceTargets(m, nextRng, px, pz) {
    const helpers = this.helpers;
    const definition = authoredDefinitionOf(m);
    const encounter = authoredEncounterOf(definition);
    if (!helpers || !helpers.spawnEntity || !encounter) return;
    const have = this._countAuthoredRoles(m);
    const occupied = new Set((m.targetEntityIds || []).map((id) => (
      missionTargetSlotOf(this.state.entities.get(id), m.id)
    )).filter((slot) => slot != null));
    const nextSlot = () => {
      let slot = 0;
      while (occupied.has(slot)) slot += 1;
      occupied.add(slot);
      return slot;
    };
    const facilityPos = definition.facilityRole
      && this.state.world && this.state.world.currentSectorId === 'sector_tethys_junction'
      && m.destSectorId !== 'sector_ashfall_reach'
      ? setPieceFacilityWorldPos(definition.facilityRole)
      : null;
    const doorPos = ashfallBlockadeDoorPos(this, m, definition);
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];
    for (const actor of encounter.actors || []) {
      const want = Math.max(1, actor.count || 1);
      const haveCount = have[actor.role] || 0;
      for (let i = haveCount; i < want; i++) {
        const durableSlot = nextSlot();
        const rng = nextRng(durableSlot);
        const ang = rng() * Math.PI * 2;
        const r = 180 + rng() * 90;
        const pos = doorPos && (actor.role === definition.primaryRole || actor.hostile)
          ? {
            x: doorPos.x + (actor.hostile ? Math.cos(ang) * 70 : 0),
            z: doorPos.z + (actor.hostile ? Math.sin(ang) * 70 : 0),
          }
          : facilityPos && actor.role === definition.primaryRole
          ? {
            x: facilityPos.x + Math.cos(ang) * 40,
            z: facilityPos.z + Math.sin(ang) * 40,
          }
          : actor.hostile
            ? (missionHostileSpawnPos(this.state, { x: px, z: pz }, rng) || {
              x: px + 400, z: pz + 200,
            })
            : { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
        let spec;
        if (actor.kind === 'ship') {
          spec = makeEnemySpawnSpec(actor.archetype || 'wasp_swarmer', Math.round((lvLo + lvHi) / 2), pos, {
            startedTick: deferredEnterTick(this.state),
          });
          spec.data = spec.data || {};
          if (Number.isFinite(actor.hull)) {
            spec.hull = actor.hull;
            spec.hullMax = actor.hull;
          }
        } else {
          spec = {
            type: actor.kind === 'asteroid' ? 'asteroid' : 'wreck',
            team: 2,
            pos,
            vel: { x: 0, z: 0 },
            rot: rng() * Math.PI * 2,
            radius: actor.radius || 12,
            mass: actor.mass || 40,
            hull: actor.hull || 80,
            hullMax: actor.hull || 80,
            collides: true,
            data: { tetherable: actor.tetherable !== false },
          };
        }
        spec.data = spec.data || {};
        spec.data.missionTag = m.id;
        spec.data.physicalRole = actor.role;
        spec.data.scanLabel = actor.scanLabel || actor.role;
        if (spec.type === 'wreck') spec.collisionMask = MISSION_WRECK_COLLISION_MASK;
        if (actor.tetherable) spec.data.tetherable = true;
        const ent = helpers.spawnEntity(spec);
        if (!ent) continue;
        this._stampMissionTargetIdentity(ent, m, durableSlot);
        m.targetEntityIds.push(ent.id);
      }
    }
  },

  _spawnCapitalBossTargets(m, nextRng, px, pz) {
    const helpers = this.helpers;
    const encounterId = m && m.params && m.params.encounterId;
    const encounter = capitalBossEncounter(encounterId);
    if (!helpers || !helpers.spawnEntity || !encounter) return;
    const state = this.state;
    m.params = m.params || {};
    // Finite cast: the ledger is the durable issuance record serialized with mission params.
    // Keys are authored role slots `missionId/role/index`. A spent, dead or consumed actor keeps
    // its issued slot forever; only a genuinely denied spawn (null, slot never created) may retry.
    const actorLedger = (m.params.capitalActorLedger ??= {});
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];
    // Stable authored indices 0..count-1, never haveCount..want: a count of alive rocks cannot
    // distinguish "never spawned" from "spent", so the old count-based loop would replenish
    // ammunition after consumption or reload.
    const orderedActors = [
      ...(encounter.actors || []).filter((a) => a && a.role === PHYSICAL_ROLE.CAPITAL),
      ...(encounter.actors || []).filter((a) => a && a.role !== PHYSICAL_ROLE.CAPITAL),
    ];
    // The capital's placed pose anchors the authored ballast layout. This is INITIAL layout for
    // this spawn batch only — never a per-tick formation constraint or a teleport of a live rock.
    let bossPose = null;
    const liveBoss = this._physicalTargetOf(m, PHYSICAL_ROLE.CAPITAL);
    if (liveBoss && liveBoss.alive !== false) {
      bossPose = { pos: { x: liveBoss.pos.x, z: liveBoss.pos.z }, rot: liveBoss.rot || 0 };
    }

    for (const actor of orderedActors) {
      const want = Math.max(1, actor.count || 1);
      const isCapital = actor.role === PHYSICAL_ROLE.CAPITAL;
      for (let actorIndex = 0; actorIndex < want; actorIndex++) {
        const actorKey = `${m.id}/${actor.role}/${actorIndex}`;
        if (Object.hasOwn(actorLedger, actorKey)) continue;
        const rng = nextRng(actorKey);
        const rot = rng() * Math.PI * 2;
        let pos;
        if (isCapital) {
          pos = missionHostileSpawnPos(state, { x: px, z: pz }, rng) || { x: px + 360, z: pz + 180 };
        } else if (bossPose) {
          const anchored = capitalBossBallastPosition(encounter, bossPose, actorIndex);
          pos = { x: anchored.x, z: anchored.z };
        } else {
          // Boss not placed yet this pass (denial is retryable): hold the ballast on the mission
          // ring rather than inventing a boss pose.
          const ang = rng() * Math.PI * 2;
          const r = 200 + rng() * 80;
          pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
        }
        let spec;
        if (actor.kind === 'ship') {
          spec = makeEnemySpawnSpec(actor.archetype || 'bruiser_brawler', Math.round((lvLo + lvHi) / 2), pos, {
            startedTick: deferredEnterTick(state),
            motive: 'capital_interdiction',
            engagementTrigger: 'capital_boss_contract',
          });
          spec.data = spec.data || {};
          delete spec.data.reinforcements;
          if (Number.isFinite(actor.hull)) {
            spec.hull = actor.hull;
            spec.hullMax = actor.hull;
          }
          if (Number.isFinite(actor.shield)) {
            spec.shield = actor.shield;
            spec.shieldMax = actor.shield;
            spec.shieldRegenRate = 0;
          }
          if (Number.isFinite(actor.armor)) {
            spec.armorHp = actor.armor;
            spec.armorMax = actor.armor;
            spec.armorFlat = 0;
          }
          if (Number.isFinite(actor.mass)) spec.mass = actor.mass;
          if (Number.isFinite(actor.radius)) spec.radius = actor.radius;
          if (Number.isFinite(actor.maxSpeed)) spec.maxSpeed = actor.maxSpeed;
          if (actor.shipClass) spec.data.shipClass = actor.shipClass;
          spec.flags = spec.flags || {};
          spec.flags.invuln = false;
          spec.rot = rot;
        } else {
          spec = {
            type: actor.kind === 'asteroid' ? 'asteroid' : 'wreck',
            team: 2,
            pos,
            vel: { x: 0, z: 0 },
            rot,
            radius: actor.radius || 12,
            mass: actor.mass || 40,
            hull: actor.hull || 80,
            hullMax: actor.hull || 80,
            collides: true,
            data: { tetherable: actor.tetherable !== false },
          };
        }
        spec.data = spec.data || {};
        spec.data.missionTag = m.id;
        spec.data.physicalRole = actor.role;
        spec.data.scanLabel = actor.scanLabel || actor.role;
        if (spec.type === 'wreck') spec.collisionMask = MISSION_WRECK_COLLISION_MASK;
        spec.data.capitalSubsystemRoles = { ...(encounter.subsystemRoles || CAPITAL_BOSS.subsystemRoles) };
        spec.data.capitalImmunity = false;
        if (actor.tetherable) spec.data.tetherable = true;
        // Instance missionTag is kept (mission ownership); the decorator assigns the explicit
        // DEFINITION doctrine in data.ai.combatDoctrineId and stamps persistence/save identity.
        decorateCapitalBossSpawnSpec(spec, actor, encounter, { missionId: m.id, index: actorIndex });
        const entity = spawnCapitalActorOnce({
          ledger: actorLedger,
          spec,
          spawnEntity: (owned) => this.spawnOwnedCapitalBossActor(m, owned),
        });
        if (entity && isCapital) {
          bossPose = { pos: { x: entity.pos.x, z: entity.pos.z }, rot: entity.rot || rot };
        }
      }
    }
    // The whole initial cast exists (or its denials are ledgered): start the authored score
    // synchronously so stock fire is closed before the capital's first AI decision tick.
    if (Object.hasOwn(actorLedger, `${m.id}/${PHYSICAL_ROLE.CAPITAL}/0`)) {
      const boss = this._physicalTargetOf(m, PHYSICAL_ROLE.CAPITAL);
      if (boss) {
        this.bus.emit('capitalBoss:start', {
          encounterId: encounter.id,
          fightId: m.id,
          bossId: boss.id,
          targetId: state.playerId,
          mirror: 1,
        });
      }
    }
  },

  /**
   * The ONE mission-owned spawn boundary for a capital boss cast (and wing members). Enforces the
   * native spawn budget, adjusts an authored placement that would overlap the player, another live
   * body or a protected area (the authored offset is a desire, not a bypass of native placement
   * safety), stamps durable mission identity on the owner's numeric target slot, and registers the
   * returned id. A null/throwing native spawn never leaks a budget grant.
   */
  spawnOwnedCapitalBossActor(m, spec) {
    const helpers = this.helpers;
    if (!m || !helpers || typeof helpers.spawnEntity !== 'function') {
      throw new Error('Capital boss owned spawn requires the mission spawn owner');
    }
    if (!spec || !spec.pos) return null;
    const state = this.state;
    const jitterKey = (spec.data && (spec.data.capitalBossActorKey || spec.data.capitalBossWingKey)) || m.id;
    spec.pos = capitalBossAdjustedPlacement(
      state,
      spec.pos,
      Number.isFinite(spec.radius) ? spec.radius : 12,
      jitterKey,
    );
    if (!spec.pos) return null; // hard safety floor violated: denied, retryable, nothing issued
    const budget = helpers.spawnBudget;
    const requester = `mission:${m.id}`;
    if (budget && typeof budget.request === 'function' && budget.request(1, requester) <= 0) {
      return null;
    }
    let ent = null;
    try {
      ent = helpers.spawnEntity(spec);
    } catch (error) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!ent) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return null;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
    this._stampMissionTargetIdentity(ent, m, this._nextCapitalBossTargetSlot(m));
    m.targetEntityIds.push(ent.id);
    return ent;
  },

  /** Mission owner's numeric durable-slot allocator. Separate from authored role indices. */
  _nextCapitalBossTargetSlot(m) {
    const occupied = new Set((m.targetEntityIds || []).map((id) => (
      missionTargetSlotOf(this.state.entities.get(id), m.id)
    )).filter((slot) => slot != null));
    let slot = 0;
    while (occupied.has(slot)) slot += 1;
    return slot;
  },

  /**
   * The living-world adopt view is shipLike/wrecks by design ("never rocks or FX"), so the capital
   * cast's mission-pinned BALLAST bodies (asteroids) silently fall out of targetEntityIds on every
   * adopt pass. Under the old count-based spawner that shed turned into the renewable-ammunition
   * fountain; under the finite ledger it must instead be repaired by CONTENT: durable actor/wing
   * keys re-attach their live bodies, and issued slots never mint replacements.
   */
  _reattachCapitalBossCastTargets(m) {
    if (!isCapitalBossMission(m)) return 0;
    const prefix = `${m.id}/`;
    const have = new Set(m.targetEntityIds || []);
    let reattached = 0;
    const castIndex = this.state.entityIndex;
    const cast = castIndex && castIndex.__spacefaceEntityIndexV1 === true && castIndex.ready === true
      && castIndex.capitalBossCast instanceof Set ? castIndex.capitalBossCast : this.state.entityList || [];
    for (const e of cast) {
      if (!e || e.alive === false) continue;
      const key = e.data && (e.data.capitalBossActorKey || e.data.capitalBossWingKey);
      if (!key || !String(key).startsWith(prefix) || have.has(e.id)) continue;
      m.targetEntityIds.push(e.id);
      have.add(e.id);
      reattached += 1;
    }
    return reattached;
  },

  /**
   * Restore-side owner reconciliation for one restored fight: re-adopt live rematerialized
   * targets (durable mission+slot identity is the save seam), re-attach the authored cast by
   * durable key (the adopt view never yields asteroids), and re-point issuance ledger entity ids
   * at their durable-key rematerializations. Issued slots are never re-minted and spent/denied
   * slots are preserved; an absent entity keeps its issued slot (it may be temporarily unloaded —
   * absence is not permission to respawn).
   */
  reconcileCapitalBossOwner(record) {
    const fightId = record && record.fightId;
    if (fightId == null) return 0;
    const m = (this.state.missions.active || []).find((row) => (
      row && row.id === fightId && isCapitalBossMission(row)
    ));
    if (!m) return 0;
    this._adoptLiveMissionTargets(m);
    this._reattachCapitalBossCastTargets(m);
    let repointed = 0;
    const liveByKey = new Map();
    const castScanIndex = this.state.entityIndex;
    const castScan = castScanIndex && castScanIndex.__spacefaceEntityIndexV1 === true && castScanIndex.ready === true
      && castScanIndex.capitalBossCast instanceof Set ? castScanIndex.capitalBossCast : this.state.entityList || [];
    for (const e of castScan) {
      const key = e && e.data && (e.data.capitalBossActorKey || e.data.capitalBossWingKey);
      if (key && e.alive !== false) liveByKey.set(String(key), e);
    }
    const repoint = (ledger) => {
      for (const [slot, entry] of Object.entries(ledger || {})) {
        if (!entry || entry.entityId == null) continue;
        const live = liveByKey.get(String(slot));
        if (live && live.id !== entry.entityId) {
          entry.entityId = live.id;
          repointed += 1;
        }
      }
    };
    repoint(m.params && m.params.capitalActorLedger);
    repoint(m.params && m.params.capitalWingLedger);
    return repointed;
  },

  _countAuthoredRoles(m) {
    const counts = {};
    for (const id of m && m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (!e || e.alive === false) continue;
      const role = physicalRoleOf(e);
      if (!role) continue;
      counts[role] = (counts[role] || 0) + 1;
    }
    return counts;
  },

  _countPhysicalRoles(m) {
    const counts = { core: 0, tower: 0, pods: 0, escorts: 0 };
    for (const id of m && m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (!e || e.alive === false) continue;
      const role = physicalRoleOf(e);
      if (role === PHYSICAL_ROLE.SLAG_CORE) counts.core += 1;
      else if (role === PHYSICAL_ROLE.TOWER) counts.tower += 1;
      else if (role === PHYSICAL_ROLE.POD) counts.pods += 1;
      else if (role === PHYSICAL_ROLE.ESCORT) counts.escorts += 1;
    }
    return counts;
  },

  _physicalTargetOf(m, role) {
    for (const id of m && m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && physicalRoleOf(e) === role) return e;
    }
    return null;
  },

  _playerLatchedTo(m, role) {
    const tether = this.state.player && this.state.player.tether;
    const fromTether = tether && tether.targetId != null ? tether.targetId : null;
    const fromMission = m.params && m.params.latchedTargetId;
    const targetId = fromTether != null ? fromTether : fromMission;
    if (targetId == null) return null;
    const e = this.state.entities.get(targetId);
    if (!e || e.alive === false || physicalRoleOf(e) !== role) return null;
    if (!m.targetEntityIds || !m.targetEntityIds.includes(e.id)) return null;
    return e;
  },

  _entityNearDestBerth(entity, m) {
    if (!entity || !entity.pos) return false;
    const berth = this._missionBerthPos(m);
    if (!berth) return this.state.world && this.state.world.currentSectorId === m.destSectorId;
    return Math.hypot((entity.pos.x || 0) - (berth.x || 0), (entity.pos.z || 0) - (berth.z || 0))
      <= PHYSICAL_BERTH_WU;
  },

  _storyDestStation(m) {
    const live = this._liveStation(m && m.destStationId);
    if (live && live.pos) return live;
    const destId = m && m.destStationId;
    if (!destId) return null;
    return findLivingWorldActorStation(this.state, destId);
  },

  _entityAtStoryDestDock(entity, m) {
    if (!entity || !entity.pos) return false;
    const station = this._storyDestStation(m);
    if (!station || !station.pos) return false;
    const hullR = Number(station.radius);
    const dockR = Number(station.data && station.data.dockRadius);
    const berthR = Math.max(
      Number.isFinite(hullR) && hullR > 0 ? hullR : 0,
      Number.isFinite(dockR) && dockR > 0 ? dockR : 0,
    );
    if (!(berthR > 0)) return false;
    const cargoR = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 0;
    const limit = berthR + cargoR + STORY_LATCH_DOCK_SLACK_WU;
    const dist = Math.hypot(
      (entity.pos.x || 0) - (station.pos.x || 0),
      (entity.pos.z || 0) - (station.pos.z || 0),
    );
    return dist <= limit;
  },

  _usesStoryDestDock(m) {
    const tag = m && m.storyTag;
    if (typeof tag !== 'string') return false;
    // Story B2–B4 dest-dock (latch-dock, throw, sling) uses the tightened
    // station-hull + slack gate, not the leftover 700 WU berth radius — covers the
    // legacy single-contract tags (b2:elroy, b3:bigger_boat) and the W-BOOKS-3-4
    // book tags (b3:berth, b3:maw, b4:operation).
    return (
      tag.startsWith('campaign47a:b2:')
      || tag.startsWith('campaign47a:b3:')
      || tag === 'campaign47a:b4:operation'
    );
  },

  _completePhysical(m, index, method) {
    if (!m || m.status !== 'active') return false;
    // W-BOOKS-3-4: a book contract whose authored extra is still owed refuses the settle —
    // the maw stays on the lane until the slag has knocked it stupid. Only contracts that
    // carry an extras param are affected; every other physical completion path is unchanged.
    if (!this._bookExtrasSatisfied(m)) {
      const rows = this._bookExtrasPending(m);
      if (rows.length) this._sayStoryLine(`Still owed: ${rows.join('; ')}.`, 5);
      return false;
    }
    m.params = m.params || {};
    m.params.completionMethod = method;
    if (isCampaign47aB2Rescue(m)) {
      // Settlement rescues the remaining cohort; destroyed pods are never counted.
      const count = b2RescueActorCount(m, b2RescueActorForRole(m, PHYSICAL_ROLE.POD), 'podCount');
      const lost = Object.values(ensureB2RescueActorOutcomes(m)).filter(value => value === 'lost').length;
      this.state.story.flags.reckoning_b2_saved_pods = Math.max(0, count - lost);
    }
    m.objectiveProgress = m.objectiveTarget;
    this._completeMission(m, index);
    this._offerSetPieceFollowOn(m);
    return true;
  },

  /** B7: a finished convoy, heist, or disabled ship posts the next contract. Never a fail. */
  _offerSetPieceFollowOn(m) {
    // Authored 47-A work is a story contract, not a sandbox set piece — finishing the
    // Deep Reach blockade must not post the generic frigate-tow follow-on (PQ-032.02).
    if (m && (m.campaign47aBeat != null
      || String(m.storyTag || '').startsWith('campaign47a:'))) return false;
    const pieceId = m && m.params && m.params.authoredSetPieceId;
    const offer = setPieceFollowOnOffer(pieceId, m, this._epoch());
    if (!offer) return false;
    const boarded = this._onExternalBoardOffer(offer);
    if (!boarded) return false;
    this._spawnSetPieceFollowOnBody(m, pieceId);
    const text = offer.title;
    const voice = this.helpers && this.helpers.voice;
    const said = voice && typeof voice.say === 'function'
      ? voice.say({ channel: 'news', text, kind: 'info', ttl: 4, id: offer.id })
      : false;
    if (!said && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', { text, kind: 'info', ttl: 4, source: SET_PIECE_FOLLOW_ON_SOURCE });
    }
    return true;
  },

  _spawnSetPieceFollowOnBody(m, pieceId) {
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (typeof spawn !== 'function') return null;
    const player = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId)
      : null;
    const origin = player && player.pos ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    const spec = setPieceFollowOnBody(pieceId, m, origin);
    if (!spec) return null;
    try {
      return spawn(spec);
    } catch (_) {
      return null;
    }
  },

  _authoredRoleClear(m, role, ignoreId = null) {
    if (!role) return true;
    for (const id of m.targetEntityIds || []) {
      if (id === ignoreId) continue;
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && physicalRoleOf(e) === role) return false;
    }
    return true;
  },

  _tryCompleteAuthored(m, index, on, role, entity = null) {
    if (!m || m.type !== AUTHORED_SET_PIECE_TYPE || m.status !== 'active') return false;
    const definition = authoredDefinitionOf(m);
    if (!definition) return false;
    if (entity && m.targetEntityIds && !m.targetEntityIds.includes(entity.id)) return false;

    const reelClear = authoredMethodFor(definition, 'reel_clear', role);
    if (on === 'reel' && reelClear) {
      const hook = definition.methodHooks[reelClear];
      if (this._authoredRoleClear(m, hook && hook.clearRole)) {
        return this._completePhysical(m, index, reelClear);
      }
      return false;
    }

    const hostiles = authoredMethodFor(definition, 'hostiles_clear', role);
    if ((on === 'kill' || on === 'whip') && hostiles) {
      if (this._authoredRoleClear(m, role, entity && entity.id)) {
        return this._completePhysical(m, index, hostiles);
      }
      return false;
    }

    if (on === 'throw' || on === 'release_berth') {
      const berthMethod = authoredMethodFor(definition, 'throw_berth', role)
        || authoredMethodFor(definition, 'release_berth', role);
      if (berthMethod && entity) {
        const storyDock = this._usesStoryDestDock(m);
        const atBerth = storyDock
          ? this._entityAtStoryDestDock(entity, m)
          : this._entityNearDestBerth(entity, m);
        if (atBerth) return this._completePhysical(m, index, berthMethod);
        if (storyDock) return false;
      }
    }

    const method = authoredMethodFor(definition, on, role);
    if (!method) return false;
    if (on === 'latch_dock') {
      const latched = entity || this._playerLatchedTo(m, role);
      if (!latched || !(this._usesStoryDestDock(m)
        ? this._entityAtStoryDestDock(latched, m)
        : this._entityNearDestBerth(latched, m))) return false;
    }
    return this._completePhysical(m, index, method);
  },

  _noteCapitalBossPhysics(m, capital, on) {
    if (!isCapitalBossMission(m) || !capital) return false;
    m.params = m.params || {};
    m.params.physicsHits = (m.params.physicsHits || 0) + 1;
    m.params.lastPhysicsOn = on;
    m.params.gunHits = m.params.gunHits || 0;
    this._routeCapitalBossThrownMass(m, capital);
    return true;
  },

  _routeCapitalBossThrownMass(m, capital) {
    if (!capital || !capital.pos) return null;
    const roles = (capital.data && capital.data.capitalSubsystemRoles)
      || CAPITAL_BOSS.subsystemRoles
      || {};
    const order = [
      roles.thrusters || CAPITAL_SUBSYSTEM_ORDER[0],
      roles.turrets || CAPITAL_SUBSYSTEM_ORDER[1],
      roles.bays || CAPITAL_SUBSYSTEM_ORDER[2],
    ];
    const hits = Math.max(0, (m.params && m.params.physicsHits || 1) - 1);
    const subsystemId = order[hits % order.length];
    const packet = scalarHitToDamagePacket({
      damage: THROWN_MASS_SUBSYSTEM_DAMAGE,
      damageType: 'kinetic',
      pos: capitalSubsystemWorldPos(capital, subsystemId),
      subsystemShare: 1,
      source: { kind: 'thrown_mass', subsystemId },
    });
    packet.hit = { ...(packet.hit || {}), subsystemId, pos: packet.hit && packet.hit.pos };
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    this.bus.emit('combat:routeDamage', {
      attackerId: this.state.playerId,
      targetId: capital.id,
      packet,
      origin: { kind: 'thrown_mass', id: capital.id, subsystemId },
    });
    const hurt = Array.isArray(m.params.subsystemsHurtByMass) ? m.params.subsystemsHurtByMass : [];
    if (!hurt.includes(subsystemId)) hurt.push(subsystemId);
    m.params.subsystemsHurtByMass = hurt;
    return subsystemId;
  },

  _onCapitalBossGunHit(p) {
    if (!p || p.targetId == null) return;
    if (p.ownerId != null && p.ownerId !== this.state.playerId) return;
    const target = this.state.entities.get(p.targetId);
    if (!target || physicalRoleOf(target) !== PHYSICAL_ROLE.CAPITAL) return;
    for (const m of this.state.missions.active || []) {
      if (!isCapitalBossMission(m) || m.status !== 'active') continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.targetId)) continue;
      m.params = m.params || {};
      m.params.gunHits = (m.params.gunHits || 0) + 1;
    }
  },

  _onCapitalBossTumbled(p) {
    if (!p || p.victimId == null) return;
    const victim = this.state.entities.get(p.victimId);
    if (!victim || physicalRoleOf(victim) !== PHYSICAL_ROLE.CAPITAL) return;
    for (const m of this.state.missions.active || []) {
      if (!isCapitalBossMission(m) || m.status !== 'active') continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.victimId)) continue;
      m.params = m.params || {};
      m.params.tumbleCount = (m.params.tumbleCount || 0) + 1;
      const roles = victim.data && victim.data.capitalSubsystemRoles || CAPITAL_BOSS.subsystemRoles;
      m.params.tumbledSubsystems = Object.keys(roles || {});
    }
  },

  _completeCapitalBossFromKill(m, index) {
    if (!isCapitalBossMission(m) || m.status !== 'active') return false;
    m.params = m.params || {};
    const guns = m.params.gunHits || 0;
    const physics = m.params.physicsHits || 0;
    const method = physics > 0 && guns === 0
      ? 'throw_the_capital'
      : guns > 0 && physics === 0
        ? 'outgun_the_capital'
        : physics > 0 ? 'throw_the_capital' : 'outgun_the_capital';
    if (guns > 0 && physics > 0) m.params.mixedKill = true;
    return this._completePhysical(m, index, method);
  },

  _tryPhysicalDockComplete(m, index) {
    if (m.type === AUTHORED_SET_PIECE_TYPE) {
      const definition = authoredDefinitionOf(m);
      const role = definition && definition.primaryRole;
      if (!role) return false;
      return this._tryCompleteAuthored(m, index, 'latch_dock', role, this._playerLatchedTo(m, role));
    }
    if (m.type === 'tow_recovery') {
      if (m.params && m.params.requiredModule === 'mod_winch_hd') {
        if (!shipCarriesModule(activeOwnedShip(this.state), 'mod_winch_hd')) return false;
        const winched = this._playerLatchedTo(m, PHYSICAL_ROLE.SLAG_CORE);
        if (winched && this._entityNearDestBerth(winched, m)) {
          return this._completePhysical(m, index, 'tow_in');
        }
        return false;
      }
      const core = this._playerLatchedTo(m, PHYSICAL_ROLE.SLAG_CORE);
      const storyDock = this._usesStoryDestDock(m);
      if (core) {
        if (storyDock ? this._entityAtStoryDestDock(core, m) : this._entityNearDestBerth(core, m)) {
          return this._completePhysical(m, index, 'tow_in');
        }
        if (storyDock) return false;
      }
      const loose = this._physicalTargetOf(m, PHYSICAL_ROLE.SLAG_CORE);
      if (loose && (storyDock
        ? this._entityAtStoryDestDock(loose, m)
        : this._entityNearDestBerth(loose, m))) {
        return this._completePhysical(m, index, 'sling_in');
      }
      return false;
    }
    if (m.type === 'rescue_under_fire') {
      const pod = this._playerLatchedTo(m, PHYSICAL_ROLE.POD);
      const storyDock = this._usesStoryDestDock(m);
      if (pod && (storyDock ? this._entityAtStoryDestDock(pod, m) : this._entityNearDestBerth(pod, m))) {
        return this._completePhysical(m, index, 'stage_tow');
      }
      return false;
    }
    return false;
  },

  _onPhysicalTetherLatched(p) {
    if (!p || p.targetId == null) return;
    const target = this.state.entities.get(p.targetId);
    const role = physicalRoleOf(target);
    if (!role) return;
    for (const m of this.state.missions.active || []) {
      if (!m || m.status !== 'active' || !PHYSICAL_TYPE_SET.has(m.type)) continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.targetId)) continue;
      m.params = m.params || {};
      m.params.latchedRole = role;
      m.params.latchedTargetId = p.targetId;
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id, latchedRole: role });
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        const index = this.state.missions.active.indexOf(m);
        if (index >= 0) this._tryCompleteAuthored(m, index, 'latch', role, target);
      }
    }
  },

  _onPhysicalTetherDetached(p) {
    if (!p || p.targetId == null) return;
    const ownerId = p.ownerId != null ? p.ownerId : p.actorId;
    if (ownerId != null && ownerId !== this.state.playerId && p.controllerId !== this.state.playerId) return;
    for (const m of this.state.missions.active || []) {
      if (!m || m.status !== 'active' || !m.params || m.params.latchedTargetId !== p.targetId) continue;
      m.params.latchedTargetId = null;
      m.params.latchedRole = null;
    }
  },

  _onPhysicalReleaseRated(p) {
    if (!p) return;
    const targetId = p.targetId != null ? p.targetId : p.sourceId;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active') continue;
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        const target = this.state.entities.get(targetId);
        if (this._tryCompleteAuthored(m, i, 'release_berth', physicalRoleOf(target), target)) continue;
      }
      if (m.type !== 'tow_recovery') continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(targetId)) continue;
      const core = this.state.entities.get(targetId);
      if (!core || physicalRoleOf(core) !== PHYSICAL_ROLE.SLAG_CORE) continue;
      const clean = !p.classification || CLEAN_PHYSICAL_RELEASE.has(p.classification);
      const storyDock = this._usesStoryDestDock(m);
      const atBerth = storyDock
        ? this._entityAtStoryDestDock(core, m)
        : this._entityNearDestBerth(core, m);
      if (clean && atBerth) {
        this._completePhysical(m, i, 'sling_in');
      }
    }
  },

  _onPhysicalThrow(p) {
    if (!p || p.payloadId == null) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active') continue;
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        const payload = this.state.entities.get(p.payloadId);
        const aim = p.aimTargetId != null ? this.state.entities.get(p.aimTargetId) : null;
        const payloadRole = physicalRoleOf(payload);
        const aimRole = physicalRoleOf(aim);
        if (this._tryCompleteAuthored(m, i, 'throw', payloadRole, payload)) continue;
        if (aim && this._tryCompleteAuthored(m, i, 'throw', aimRole, aim)) continue;
      }
      if (isCapitalBossMission(m)) {
        const payload = this.state.entities.get(p.payloadId);
        const aim = p.aimTargetId != null ? this.state.entities.get(p.aimTargetId) : null;
        const capital = this._physicalTargetOf(m, PHYSICAL_ROLE.CAPITAL);
        const hit = capital && (
          p.aimTargetId === capital.id
          || p.payloadId === capital.id
          || physicalRoleOf(aim) === PHYSICAL_ROLE.CAPITAL
          || physicalRoleOf(payload) === PHYSICAL_ROLE.CAPITAL
        );
        if (hit && capital) this._noteCapitalBossPhysics(m, capital, 'throw');
        continue;
      }
      if (m.type === 'tow_recovery') {
        if (!m.targetEntityIds || !m.targetEntityIds.includes(p.payloadId)) continue;
        const core = this.state.entities.get(p.payloadId);
        if (!core || physicalRoleOf(core) !== PHYSICAL_ROLE.SLAG_CORE) continue;
        const storyDock = this._usesStoryDestDock(m);
        if (storyDock) {
          if (this._entityAtStoryDestDock(core, m)) this._completePhysical(m, i, 'sling_in');
          continue;
        }
        if (this._entityNearDestBerth(core, m)) {
          this._completePhysical(m, i, 'sling_in');
        }
        continue;
      }
    }
  },

  _onPhysicalWhipImpact(p) {
    if (!p || p.victimId == null) return;
    const rating = p.rating;
    if (rating && rating !== 'solid' && rating !== 'crushing') return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active') continue;
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        const victim = this.state.entities.get(p.victimId);
        if (this._tryCompleteAuthored(m, i, 'whip', physicalRoleOf(victim), victim)) continue;
      }
      if (isCapitalBossMission(m)) {
        const victim = this.state.entities.get(p.victimId);
        if (victim && physicalRoleOf(victim) === PHYSICAL_ROLE.CAPITAL) {
          this._noteCapitalBossPhysics(m, victim, 'whip');
        }
        continue;
      }
      // W-BOOKS-3-4: Feed the Maw — hot slag through the whip is the stun. Solid and
      // crushing hits on the maw's own body count toward the stun gate that keeps the
      // tow honest; the maw itself is the contract's slag-core body.
      if (m.params && Number(m.params.mawStunsNeeded) > 0) {
        if (!m.targetEntityIds || !m.targetEntityIds.includes(p.victimId)) continue;
        m.params.mawStuns = (m.params.mawStuns | 0) + 1;
        delete m._extrasAnnounced;
        this._sayStoryLine(`The maw shudders — stun ${m.params.mawStuns}/${m.params.mawStunsNeeded}.`, 4);
        this.bus.emit('mission:updated', { missionId: m.id });
        continue;
      }
      if (m.type !== 'demolition') continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.victimId)) continue;
      const tower = this.state.entities.get(p.victimId);
      if (!tower || physicalRoleOf(tower) !== PHYSICAL_ROLE.TOWER) continue;
      if (!m.params?.workingBattlefield) this._completePhysical(m, i, 'wrecking_ball');
    }
  },

  _onPhysicalTetherReel(p) {
    if (!p || p.targetId == null) return;
    if (p.actorId != null && p.actorId !== this.state.playerId) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active') continue;
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        const target = this.state.entities.get(p.targetId);
        if (this._tryCompleteAuthored(m, i, 'reel', physicalRoleOf(target), target)) continue;
      }
      if (m.type !== 'rescue_under_fire') continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.targetId)) continue;
      const pod = this.state.entities.get(p.targetId);
      if (!pod || physicalRoleOf(pod) !== PHYSICAL_ROLE.POD) continue;
      if (!this._rescueEscortsClear(m)) continue;
      this._completePhysical(m, i, 'corridor_pull');
    }
  },

  _rescueEscortsClear(m) {
    for (const id of m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && physicalRoleOf(e) === PHYSICAL_ROLE.ESCORT) return false;
    }
    return true;
  },

  _recordB2RescueActorOutcome(m, entity, outcome) {
    if (!isCampaign47aB2Rescue(m) || !entity || !entity.data) return false;
    const role = physicalRoleOf(entity);
    if (role !== PHYSICAL_ROLE.POD && role !== PHYSICAL_ROLE.ESCORT) return false;
    const actor = b2RescueActorForRole(m, role);
    const index = b2RescueActorIndexFromEntity(m, entity, actor, role);
    if (index < 0) return false;
    const actorId = b2RescueActorIdentity(m, actor, index);
    const outcomes = ensureB2RescueActorOutcomes(m);
    if (!actorId || outcomes[actorId]) return false;
    outcomes[actorId] = outcome;
    return true;
  },

  _onPhysicalKill(p) {
    if (!p || p.id == null) return;
    const byPlayer = p.killerId === this.state.playerId;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || !PHYSICAL_TYPE_SET.has(m.type)) continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.id)) continue;
      const victim = this.state.entities.get(p.id);
      const role = physicalRoleOf(victim) || p.physicalRole || null;
      if (reckoningKilled(m, victim)) continue;
      if (m.params?.workingBattlefield) { workingBattlefieldKilled(this, m, p, victim); continue; }
      if (m.type === AUTHORED_SET_PIECE_TYPE) {
        this._tryCompleteAuthored(m, i, 'kill', role, victim);
        continue;
      }
      if (isCapitalBossMission(m) && role === PHYSICAL_ROLE.CAPITAL) {
        this._completeCapitalBossFromKill(m, i);
        continue;
      }
      if (m.type === 'demolition' && role === PHYSICAL_ROLE.TOWER) {
        // The knock-down objective going down under the PLAYER's guns is the job done; under
        // anyone else's it is gone before the player could do it — FB-068 voids fairly with
        // cause. (Role-gated: guarded-course pickets are mission targets too, and dropping a
        // picket must not settle the tower's row.)
        if (byPlayer) this._completePhysical(m, i, 'cut_down');
        else this._settleExternalTargetLoss(m, i, p);
        continue;
      }
      if (m.type === 'tow_recovery' && role === PHYSICAL_ROLE.SLAG_CORE && !byPlayer) {
        // FB-068: a third party blew the objective core apart — same honest void as a patrol
        // mark lost to another hunter. A player-caused core death keeps the 'core_lost' word;
        // it arrives on the destroyed lane where legacy callers already settled it.
        this._settleExternalTargetLoss(m, i, p);
        continue;
      }
      if (m.type === 'rescue_under_fire' && role === PHYSICAL_ROLE.POD) {
        // FB-068: record who brought this pod down. Counting stays in the destroyed lane, which
        // reads this ledger when the last pod falls to pick 'pods_lost' vs 'failed_external'.
        m.params = m.params || {};
        const causes = m.params.podLossCauses || (m.params.podLossCauses = {});
        if (!causes[p.id]) {
          const causal = compactKillCausality(p, this.state.playerId);
          causes[p.id] = {
            byPlayer,
            cause: causal.cause,
            killerId: p.killerId != null ? p.killerId : null,
          };
        }
        if (isCampaign47aB2Rescue(m) && this._recordB2RescueActorOutcome(m, victim, 'lost')) {
          m.params.podsLost = Math.max(0, Math.floor(Number(m.params.podsLost) || 0)) + 1;
        }
        continue;
      }
      if (m.type === 'rescue_under_fire' && role === PHYSICAL_ROLE.ESCORT) {
        m.params = m.params || {};
        const firstB2Clear = isCampaign47aB2Rescue(m)
          ? this._recordB2RescueActorOutcome(m, victim, 'cleared') : true;
        if (firstB2Clear) {
          m.params.escortsDown = Math.max(0, Math.floor(Number(m.params.escortsDown) || 0)) + 1;
        }
        m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id, escortsDown: m.params.escortsDown });
      }
    }
  },

  /**
   * INF-066 durable loss-site stamp for the physical failures: the destroy payload's last pos is
   * the only pointer to the wreck (the entity row is already gone), and the successor's recovery
   * pocket routes from it. params.* — not _escortee* — so the stamp survives serialization.
   */
  _stampPhysicalLossSite(m, p) {
    const site = escortLossSite(p && p.pos, this.state.world && this.state.world.currentSectorId);
    if (!site) return;
    m.params = m.params || {};
    m.params.lostSectorId = site.sectorId;
    m.params.lostWreckPos = site.wreckPos;
  },

  _onPhysicalEntityDestroyed(p) {
    if (!p || p.id == null) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || !PHYSICAL_TYPE_SET.has(m.type)) continue;
      if (!m.targetEntityIds || !m.targetEntityIds.includes(p.id)) continue;
      // The destroy payload carries the victim row itself. If that id was already recycled,
      // the map row is a different occupant — the loss belongs to the corpse, not the heir.
      const mapped = this.state.entities && this.state.entities.get(p.id);
      const victim = (p.entity && mapped !== p.entity) ? p.entity : (mapped || p.entity || null);
      const role = physicalRoleOf(victim);
      if (m.params?.workingBattlefield) continue; // Retirement is not demolition.
      if ((m.type === 'tow_recovery' || (m.type === AUTHORED_SET_PIECE_TYPE && role === PHYSICAL_ROLE.SLAG_CORE))
        && role === PHYSICAL_ROLE.SLAG_CORE) {
        // A kill-event settlement (player 'core_lost' is impossible here — kills arrive on the
        // killed lane first — but an external kill already settled failed_external and changed
        // status) leaves nothing to do; a core destroyed with no kill record keeps the legacy word.
        this._stampPhysicalLossSite(m, p);
        this._failMission(m, i, 'core_lost');
        continue;
      }
      if (m.type === 'demolition' && role === PHYSICAL_ROLE.TOWER) {
        // Backstop only: real kills settled on the killed lane (player → cut_down, external →
        // failed_external). Reaching here means the tower vanished without a kill attribution —
        // swept by something other than the player's work — which voids the contract fairly.
        this._stampPhysicalLossSite(m, p);
        this._settleExternalTargetLoss(m, i, p);
        continue;
      }
      if ((m.type === 'rescue_under_fire' || m.type === AUTHORED_SET_PIECE_TYPE) && role === PHYSICAL_ROLE.POD) {
        m.params = m.params || {};
        const firstB2Loss = isCampaign47aB2Rescue(m)
          ? this._recordB2RescueActorOutcome(m, victim, 'lost') : true;
        if (firstB2Loss) {
          m.params.podsLost = Math.max(0, Math.floor(Number(m.params.podsLost) || 0)) + 1;
        }
        m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
        this._stampPhysicalLossSite(m, p);
        const remaining = m.type === AUTHORED_SET_PIECE_TYPE
          ? (this._countAuthoredRoles(m).life_pod || 0)
          : this._countPhysicalRoles(m).pods;
        if (remaining <= 0) {
          // FB-068: an all-external pod loss voids fairly with the cause named. Any pod the
          // player put down keeps the authored 'pods_lost' penalty — mixed blame is player fault.
          const causes = m.params.podLossCauses || {};
          const anyByPlayer = Object.keys(causes).some((id) => causes[id] && causes[id].byPlayer);
          const last = causes[p.id] || null;
          if (m.type !== AUTHORED_SET_PIECE_TYPE && !anyByPlayer && last && !last.byPlayer) {
            this._settleExternalTargetLoss(m, i, {
              ...p,
              killerId: last.killerId,
              cause: last.cause,
              presentation: null,
            });
          } else {
            this._failMission(m, i, 'pods_lost');
          }
        }
        continue;
      }
      if (isCampaign47aB2Rescue(m) && role === PHYSICAL_ROLE.ESCORT) {
        m.params = m.params || {};
        if (this._recordB2RescueActorOutcome(m, victim, 'cleared')) {
          m.params.escortsDown = Math.max(0, Math.floor(Number(m.params.escortsDown) || 0)) + 1;
        }
        m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id, escortsDown: m.params.escortsDown });
      }
    }
  },
};

