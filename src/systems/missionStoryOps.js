// Row 413 extraction — methods moved verbatim out of missions.js;
// spread back onto the missions object, so `this` still binds to the system at call time.
import { CIVILIAN_MANIFEST_PAYLOAD_TYPE } from './lootShards.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { makeEnemySpawnSpec } from './combat.js';
import { deferSectorEnterMaterialization, deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { spawnPayloadEntity } from '../combat/industrialBeam.js';
import { entityIndexVersion, isLivingWorldActor } from '../world/livingWorldViews.js';
import { EGRESS_DISTANCE_WU, EGRESS_FADE_S, fleeOrderActive } from '../ai/egressExit.js';
import { hash32 } from '../core/rng.js';
import { addCargo } from './cargo.js';
import { normalizeBlackFlagJobs } from '../missions/blackFlagMissions.js';
import { normalizeStandingOrders } from './captainStandingOrders.js';
import { ADVENTURE_SPEED_CONTRACTS } from '../data/adventureSpeedContracts.js';
import { RED_KITE } from '../data/redKite.js';
import { BEAT_HINT, BEAT_TRIGGER, BRANCH_CHAIN_COUNT, BRANCH_CHAIN_TYPE, BRANCH_FACTION, BRANCH_INTRO_BY_BRANCH, CONTRACT_47A_B0_TAG, CONTRACT_47A_B1_TAG, CONTRACT_47A_B2_TAG, CONTRACT_47A_B3_TAG, CONTRACT_47A_SAMPLE_ID, CONTRACT_CLAIM_CUT_PERIOD_S, CONTRACT_CLAIM_FLEE_RANGE_WU, CONTRACT_CLAIM_ORBIT_RAD_PER_S, CONTRACT_CLAIM_PLAYER_RANGE_WU, CONTRACT_CLAIM_SCAN_LABEL, CONTRACT_CLAIM_WORK_RANGE_WU, HOME_FACTION, MISSION_WRECK_COLLISION_MASK, SECTOR_BY_ID, STATION_INFO, STORY_SIGNAL_BY_KIND, TYPE_BY_ID, campaign47aOutcomeKey, campaign47aRouteKind, contractClaimSiteMission, crucibleScreenIsLive, isCapitalBossMission, isStoryBranchIntroOffer, missionHostileSpawnPos, missions, mulberryLocal, normalizeMissionReceipts, normalizeSetPieceSettlements, salvagePoolUnits, setPieceCauseOf } from './missions.js';
import { QUIET_BERTH_TUNING, QUIET_BERTH_TYPE, SPLIT_MANIFEST_LOTS, SPLIT_MANIFEST_TUNING, SPLIT_MANIFEST_TYPE, YARD_CUES, splitManifestNetOffset, splitManifestWreckOffset, yardSinkPos } from '../data/yardContracts.js';
import { missionIdentityOf } from '../world/worldRecords.js';
import { passengerBeatLine } from '../data/barks.js';
import { MISSION_TUNING, STORY_BEATS, STORY_BRANCH_INTRO_TAG } from '../data/missions.js';
import { counterweightRuntime, heistMissionRuntime } from '../missions/heistMissionRuntime.js';
import { snapshotWorkingBattlefield } from './workingBattlefieldRuntime.js';
import { getDeepReachOperation, getEmbodiedLocation, getPickSideStake, isBeatStepsComplete, recordBeatStep, recoveryCommsForBeat } from '../story/campaign47a/index.js';
import { CONTRACT_47A_B0_BODY, THREAD_B_FRAGMENT_ID } from '../data/narrative.js';
import { forEachJobInteractable, forEachLivingWorldActor } from '../world/livingWorldViews.js';
import { ensureCampaign47aState, failEncounter, initCampaignSidecar, syncObservedBeat } from '../story/campaign47a/index.js';
import { resetRacingGhostSession } from './racingGhosts.js';
import { steerIntentToward } from './missions.js';

export const missionStoryOps = {
  // =========================================================================================
  // WF-08 CLAIM-STAKE SALVAGE — a board salvage row is a contested wreck site.
  // Spawn: one drifting dead hauler (the contract manifest as its real salvagePool) plus a
  // passive working crew — a 'mule_trader' hauler lead that siphons units into its own
  // cargoManifest while the player is on scene, and 'wasp_swarmer' cutters that hold fire.
  // Touch the claim and the scene turns: mining's claim-jump protest runs the law report,
  // the cutters spring, and the hauler runs for open space with whatever it already cut.
  // Killing the passive hauler drops its manifest as a real takeable pod via lootShards'
  // civilian-payload path; the claim lapses when nobody is left on site to hold it.
  // =========================================================================================

  /** The live contested hull, or null — it is the only entity carrying contractClaimSiteOf. */
  _contractClaimWreck(m) {
    for (const id of (m && m.targetEntityIds) || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && e.data && e.data.contractClaimSiteOf === m.id) return e;
    }
    return null;
  },

  /** Live crew hulls stamped by this contract's site. They are lane life, not targets —
   *  tracked by their contractClaimCrewOf stamp so settlement can release them. */
  _contractClaimCrew(m) {
    const out = [];
    if (!m) return out;
    const stamp = String(m.id);
    const entities = this.state && this.state.entities;
    // Cached ids resolve O(1) each and self-prune on re-verify (a dead, released,
    // recycled, or stamp-cleared row fails the stamp check). The first resolution scans
    // once to seed it; the spawn path below appends — callers only read membership
    // (find/some/filter/iterate), never order.
    let justScanned = false;
    if (!Array.isArray(m._crewEntityIds)) {
      m._crewEntityIds = [];
      justScanned = true;
      forEachLivingWorldActor(this.state, (e) => {
        if (e && e.data && String(e.data.contractClaimCrewOf) === stamp) m._crewEntityIds.push(e.id);
      });
    }
    if (m._crewEntityIds.length) {
      const kept = [];
      for (const id of m._crewEntityIds) {
        const e = entities && entities.get ? entities.get(id) : null;
        if (!e || e.alive === false || !e.data || String(e.data.contractClaimCrewOf) !== stamp) continue;
        kept.push(id);
        out.push(e);
      }
      if (kept.length !== m._crewEntityIds.length) m._crewEntityIds = kept;
    }
    // An empty resolve can't distinguish "all released" from ids reminted by a restore —
    // one rescan covers it, tombstoned on this runtime (transient: a deserialized mission
    // is a fresh key, so post-load always rescans) so a persistent empty stays O(1).
    const tomb = this._claimCrewEmptyTomb || (this._claimCrewEmptyTomb = new WeakMap());
    if (out.length === 0 && !justScanned && !tomb.has(m)) {
      forEachLivingWorldActor(this.state, (e) => {
        if (e && e.data && String(e.data.contractClaimCrewOf) === stamp) {
          m._crewEntityIds.push(e.id);
          out.push(e);
        }
      });
      if (out.length === 0) tomb.set(m, true);
    }
    return out;
  },

  _contractClaimLead(m) {
    const crew = this._contractClaimCrew(m);
    return crew.find((e) => e.data && e.data.claimRole === 'lead') || null;
  },

  /** The pod lootShards spilled when the claim hauler died loaded — the manifest body that
   *  still physically carries this contract's goods. Returns null once it is drained or gone. */
  _contractClaimPod(m) {
    const manifestId = `claim-manifest:${m && m.id}`;
    let pod = null;
    forEachJobInteractable(this.state, (e) => {
      if (pod || !e || e.alive === false || !e.data) return;
      if (e.data.payloadType !== CIVILIAN_MANIFEST_PAYLOAD_TYPE) return;
      if (e.data.manifestId !== manifestId) return;
      if (salvagePoolUnits(e.data.salvagePool) <= 0) return;
      pod = e;
    });
    return pod;
  },

  /** Units the crew already lifted onto a hull's manifest (the takeable cargo the lead carries). */
  _contractClaimManifestUnits(entity) {
    const lines = entity && entity.data && entity.data.cargoManifest
      && entity.data.cargoManifest.lines;
    if (!Array.isArray(lines)) return 0;
    let total = 0;
    for (const line of lines) total += Math.max(0, Math.floor(Number(line && line.qty) || 0));
    return total;
  },

  _contractClaimToast(m, text) {
    this.bus.emit('comms:popup', {
      sender: 'Claim Crew',
      text,
      category: 'personal',
      ttl: 6,
    });
    this.bus.emit('mission:updated', { missionId: m.id });
  },

  /**
   * Materialize the contested site: the hull + its crew, placed outside port safety off the
   * destination station (the contract's own lane), with the player-ring fallback every other
   * hostile spawn uses. Wreck idempotence is durable-slot 0; the crew are stamped lane actors
   * (contractClaimCrewOf), swept/released like escort ambushers rather than mission targets.
   */
  _spawnContractClaimSite(m, nextRng, px, pz) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    const params = m.params || (m.params = {});
    m.targetEntityIds = (m.targetEntityIds || []).filter((id) => {
      const e = this.state.entities.get(id);
      return e && e.alive !== false;
    });
    let wreck = this._contractClaimWreck(m);
    const rng = nextRng(0);
    const budget = helpers.spawnBudget;
    const requester = `mission:${m.id}`;

    if (!wreck && !params.contractWreckGone) {
      const grant = budget && typeof budget.request === 'function' ? budget.request(1, requester) : 1;
      if (grant <= 0) {
        this._noteMissionSpawnDeferred(m, 1, 0);
        return;
      }
      // The hull went down on the destination's own approach: port-safe ring around the
      // destination station, falling back to the shared hostile ring off the player when the
      // berth isn't materialized (uncharted sector, distant contract).
      const destEnt = this._liveStation(m.destStationId);
      const sitePos = (destEnt && missionHostileSpawnPos(this.state, destEnt.pos, rng))
        || missionHostileSpawnPos(this.state, { x: px, z: pz }, rng)
        || { x: px + 1900, z: pz + 900 };
      // Respawn conserves the pool: whatever the player (or the crew) already cut stays cut.
      const pool = params.contractWreckPool && typeof params.contractWreckPool === 'object'
        ? { ...params.contractWreckPool }
        : {
          [params.cmdtyId]: Math.max(1, Math.floor(Number(params.qty) || 1)),
          cmdty_scrap_metal: 2 + Math.floor(rng() * 4),
        };
      params.contractClaimId = params.contractClaimId || `claim:${m.id}`;
      let ent = null;
      try {
        ent = helpers.spawnEntity({
          type: 'wreck',
          team: 2,
          pos: { x: sitePos.x, z: sitePos.z },
          vel: { x: (rng() - 0.5) * 5, z: (rng() - 0.5) * 5 },
          rot: rng() * Math.PI * 2,
          radius: 22,
          mass: 160,
          hull: 150,
          hullMax: 150,
          collides: true,
          collisionMask: MISSION_WRECK_COLLISION_MASK,
          physicsBody: { shape: 'capsule', mass: 160 },
          data: {
            contractClaimSiteOf: m.id,
            proportions: WRECK_COLLIDER_PROPORTIONS,
            scanLabel: CONTRACT_CLAIM_SCAN_LABEL,
            tetherable: true,
            salvagePool: pool,
            // A foreign-looking claim id ambient salvors/tugs already respect (they refuse
            // claimed bodies); mining's protest resolves the crew through salvorClaimId.
            ...(params.contractCrewGone ? {} : { salvorClaimedBy: params.contractClaimId }),
          },
        });
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
        throw error;
      }
      if (!ent) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
        return;
      }
      if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
      this._stampMissionTargetIdentity(ent, m, 0);
      m.targetEntityIds.push(ent.id);
      params.contractSiteSeen = true;
      wreck = ent;
      this.bus.emit('mission:updated', { missionId: m.id, targetEntityId: ent.id });
      if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
    }
    if (!wreck || params.contractCrewGone) return;

    // The claim crew: one hauling lead plus 1–3 cutters scaled by the contract's risk tier.
    // Passive means unrostered and non-hostile both ways — the sanctioned "menace that holds
    // fire" state — until the player touches the claim. Top up to the full complement only;
    // confirmed kills (any killer — the lane is dangerous) are never quietly replaced.
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];
    const cuttersWant = 1 + Math.min(2, Math.max(0, Math.floor(Number(m.riskTier) / 2) | 0));
    const casualties = params.contractClaimCasualties || {};
    const crew = this._contractClaimCrew(m);
    const haveLead = crew.some((e) => e.data && e.data.claimRole === 'lead');
    const haveCutters = crew.filter((e) => e.data && e.data.claimRole === 'cutter').length;
    const want = ((!haveLead && !(casualties.lead > 0)) ? 1 : 0)
      + Math.max(0, cuttersWant - haveCutters - (casualties.cutter | 0));
    if (want <= 0) return;
    const grant = budget && typeof budget.request === 'function' ? budget.request(want, requester) : want;
    if (grant <= 0) { this._noteMissionSpawnDeferred(m, want, 0); return; }
    let spawned = 0;
    let crewIndex = crew.length;
    for (let i = 0; i < grant; i++) {
      // The hauling lead comes first — a crew of cutters with nobody to hold the take is
      // an ambush, not a claim site.
      const role = (!haveLead && !(casualties.lead > 0) && spawned === 0) ? 'lead' : 'cutter';
      const archetype = role === 'lead' ? 'mule_trader' : 'wasp_swarmer';
      const a = rng() * Math.PI * 2;
      const r = role === 'lead' ? 34 + rng() * 20 : 62 + rng() * 46 + 14 * crewIndex;
      const pos = {
        x: wreck.pos.x + Math.cos(a) * r,
        z: wreck.pos.z + Math.sin(a) * r,
      };
      const level = Math.round(lvLo + (lvHi - lvLo) * rng());
      const spec = makeEnemySpawnSpec(archetype, level, pos, { startedTick: deferredEnterTick(this.state) });
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.passive = true;
      spec.data.contractClaimCrewOf = String(m.id);
      spec.data.claimRole = role;
      spec.data.salvorClaimId = params.contractClaimId;
      spec.data.scanLabel = role === 'lead' ? 'CLAIM HAULER' : 'CLAIM CUTTER';
      if (role === 'lead') {
        spec.data.cargoManifest = {
          manifestId: `claim-manifest:${m.id}`,
          ownerName: 'Claim Hauler',
          role: 'salvor',
          lines: [],
        };
      }
      let ent = null;
      try {
        ent = helpers.spawnEntity(spec);
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, grant - spawned);
        throw error;
      }
      if (ent) {
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
        if (!Array.isArray(m._crewEntityIds)) m._crewEntityIds = [];
        m._crewEntityIds.push(ent.id);
        if (this._claimCrewEmptyTomb) this._claimCrewEmptyTomb.delete(m);
        spawned++;
        crewIndex++;
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawned < grant) {
      budget.releaseSome(requester, grant - spawned);
    }
    if (spawned > 0) this.bus.emit('mission:updated', { missionId: m.id });
  },

  /**
   * Per-tick scene drive — runs only while the player is in the destination sector with a live
   * site. The passive crew mills the hull (deterministic orbit, pure simTime), the lead siphons
   * a unit every CONTRACT_CLAIM_CUT_PERIOD_S into its own manifest while the player is close
   * enough to watch, and the filed claim lapses the moment no living crew hull is near it.
   */
  _driveContractClaimSite(m, state, dt) {
    if (!contractClaimSiteMission(m)) return;
    if ((state.world && state.world.currentSectorId) !== m.destSectorId) return;
    const params = m.params || (m.params = {});
    const wreck = this._contractClaimWreck(m);
    if (!wreck) return;
    const crew = this._contractClaimCrew(m);
    const player = state.entities && state.entities.get(state.playerId);
    const now = Number(state.simTime) || 0;

    // Claim lapse: nobody left on site to hold it — the wreck reads unclaimed, so the strip
    // that follows protests to nobody. This is the payoff for clearing the crew first. The
    // flag may already be set (the spring's empty-crew early-out marks the crew extinct the
    // moment the last hull dies); the filed claim itself still clears here, on the live hull.
    if (wreck.data && wreck.data.salvorClaimedBy) {
      const anyOnSite = crew.some((e) => e.pos && wreck.pos && Math.hypot(
        e.pos.x - wreck.pos.x, e.pos.z - wreck.pos.z,
      ) <= CONTRACT_CLAIM_FLEE_RANGE_WU);
      if (!anyOnSite) {
        if (!params.contractCrewGone) {
          this.bus.emit('toast', {
            text: 'The claim crew is gone — the hull reads unclaimed.',
            kind: 'info', ttl: 4,
          });
        }
        params.contractCrewGone = true;
        delete wreck.data.salvorClaimedBy;
        this._refreshTrackedMissionNav(m);
      }
    }

    // Deterministic mill: each passive hull holds a slow ring around the wreck. Index in the
    // live crew array sets phase/ring, so a thinned crew naturally re-spaces itself.
    let slot = 0;
    for (const e of crew) {
      const ai = e.data && e.data.ai;
      if (!ai || ai.passive !== true) continue;
      const isLead = e.data.claimRole === 'lead';
      if (isLead && params.contractCrewSprung && wreck.pos && player && player.pos) {
        // The hauler runs with whatever it already cut — away from the player, off the hull.
        const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
        const len = Math.hypot(dx, dz) || 1e-4;
        steerIntentToward(e,
          e.pos.x + (dx / len) * 1600,
          e.pos.z + (dz / len) * 1600, 60);
        continue;
      }
      const ring = isLead ? 40 : 68 + 18 * slot;
      const a = now * CONTRACT_CLAIM_ORBIT_RAD_PER_S + slot * 2.13 + (isLead ? 0 : 1.4);
      steerIntentToward(e,
        wreck.pos.x + Math.cos(a) * ring,
        wreck.pos.z + Math.sin(a) * ring, 18);
      slot++;
    }

    // The working claim: the lead physically moves one unit a beat from the hulk into its own
    // hold while the player is close enough to see it. When the pool is gone the contract's
    // goods live on the hauler — the waypoint already follows them there.
    const lead = crew.find((e) => e.data && e.data.claimRole === 'lead');
    const pool = wreck.data && wreck.data.salvagePool;
    if (lead && pool && player && player.pos && wreck.pos) {
      const playerNear = Math.hypot(player.pos.x - wreck.pos.x, player.pos.z - wreck.pos.z)
        <= CONTRACT_CLAIM_PLAYER_RANGE_WU;
      const leadOnHull = Math.hypot(lead.pos.x - wreck.pos.x, lead.pos.z - wreck.pos.z)
        <= CONTRACT_CLAIM_WORK_RANGE_WU;
      if (playerNear && leadOnHull && now - (Number(params.contractClaimCutAt) || 0) >= CONTRACT_CLAIM_CUT_PERIOD_S) {
        const takeId = (pool[params.cmdtyId] | 0) > 0
          ? params.cmdtyId
          : Object.keys(pool).find((id) => (pool[id] | 0) > 0) || null;
        if (takeId) {
          params.contractClaimCutAt = now;
          pool[takeId] = (pool[takeId] | 0) - 1;
          if (pool[takeId] <= 0) delete pool[takeId];
          const manifest = lead.data.cargoManifest || (lead.data.cargoManifest = {
            manifestId: `claim-manifest:${m.id}`, ownerName: 'Claim Hauler', role: 'salvor', lines: [],
          });
          const line = manifest.lines.find((l) => l && l.commodityId === takeId);
          if (line) line.qty = (line.qty | 0) + 1;
          else manifest.lines.push({ commodityId: takeId, qty: 1 });
          if (salvagePoolUnits(pool) === 0 && !params.contractPoolEmptied) {
            params.contractPoolEmptied = true;
            this.bus.emit('toast', {
              text: 'The claim crew finished the hull — the manifest is aboard their hauler.',
              kind: 'warn', ttl: 5,
            });
            this._refreshTrackedMissionNav(m);
          }
        }
      }
    }
  },

  /**
   * The scene turns: cutters go hostile on the player (they hold the claim), the hauler runs.
   * Idempotent — the sprung flag and the one-line broadcast happen once per mission.
   */
  _springContractClaimCrew(m, trigger) {
    const params = m.params || (m.params = {});
    const crew = this._contractClaimCrew(m);
    if (!crew.length) { params.contractCrewGone = true; return false; }
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    params.contractCrewSprung = true;
    for (const e of crew) {
      const data = e.data || (e.data = {});
      const ai = data.ai || (data.ai = {});
      if (data.claimRole === 'lead') continue;        // the hauler bolts; it never joins the guns
      ai.passive = false;
      ai.spawnContext = 'mission';
      ai.squadId = `mission:${m.id}:claim`;
      ai.motive = 'claim_defense';
      ai.engagementTrigger = trigger || 'claim_contested';
      if (player && player.team != null) ai.hostileTeams = [player.team];
      ai.forcePlayerTarget = true;
      ai.retaliationTargetId = this.state.playerId;
      const combat = data.combat || (data.combat = {});
      combat.targetId = this.state.playerId;
      const intent = data.intent;
      if (intent) { intent.moveX = 0; intent.moveZ = 0; intent.fire = false; }
    }
    if (!params.contractCrewSprungAnnounced) {
      params.contractCrewSprungAnnounced = true;
      this._contractClaimToast(m, 'Claim crew is going loud — they mean to keep the hull.');
    }
    return true;
  },

  /** The first beam touch on a filed hull earns one warning before the first unit counts. */
  _onContractClaimBeamStart(p) {
    if (!p || p.targetId == null) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      const wreck = this._contractClaimWreck(m);
      if (!wreck || wreck.id !== p.targetId) continue;
      const params = m.params;
      if (params.contractClaimWarned || params.contractCrewGone) continue;
      if (!wreck.data || !wreck.data.salvorClaimedBy) continue;
      params.contractClaimWarned = true;
      this._contractClaimToast(m, 'Filed claim, stranger. Cut that hull and we cut you.');
      this._refreshTrackedMissionNav(m);
      return;
    }
  },

  /** The protest mining already emitted — the law report and the crew's guns are one moment. */
  _onContractClaimJumped(p) {
    if (!p || p.wreckId == null) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      const wreck = this._contractClaimWreck(m);
      if (!wreck || wreck.id !== p.wreckId) continue;
      this._springContractClaimCrew(m, 'claim_jumped');
      return;
    }
  },

  /** Latching the filed hull is touching the claim — the crew answers physically. */
  _onContractClaimLatch(p) {
    if (!p || p.targetId == null) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      const wreck = this._contractClaimWreck(m);
      if (!wreck || wreck.id !== p.targetId) continue;
      const params = m.params;
      if (params.contractCrewGone) return;
      if (!params.contractClaimLatchWarned) {
        params.contractClaimLatchWarned = true;
        this._contractClaimToast(m, 'Hands off the claim. Cut that line or we cut you.');
      }
      this._springContractClaimCrew(m, 'claim_latched');
      return;
    }
  },

  /** Shooting the crew (or being the crew's victim) springs the defense. Only the player's
   *  fire counts — ambient predation on the crew is the lane's own business. */
  _onContractClaimDamage(p) {
    if (!p || p.targetId == null) return;
    if (p.attackerId !== this.state.playerId) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      const e = this.state.entities.get(p.targetId);
      if (!e || !e.data || String(e.data.contractClaimCrewOf) !== String(m.id)) continue;
      this._springContractClaimCrew(m, 'crew_fired_on');
      return;
    }
  },

  _onContractClaimKill(p) {
    if (!p || p.id == null) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      const params = m.params || (m.params = {});
      if ((m.targetEntityIds || []).includes(p.id)) {
        params.contractWreckGone = 'destroyed';
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id, wreckGone: 'destroyed' });
        return;
      }
      const e = this.state.entities.get(p.id);
      if (e && e.data && String(e.data.contractClaimCrewOf) === String(m.id)) {
        // Crew deaths are remembered on the contract — a thinned crew stays thinned across
        // sector exit/re-entry, and a dead hauler is never quietly replaced by a fresh one.
        const casualties = params.contractClaimCasualties
          || (params.contractClaimCasualties = { lead: 0, cutter: 0 });
        casualties[e.data.claimRole === 'lead' ? 'lead' : 'cutter']++;
        if (p.killerId === this.state.playerId) this._springContractClaimCrew(m, 'crew_killed');
        // A loaded hauler going down moves the goods into the spilled pod — the marker
        // follows the cargo, not the wreck or the grave.
        this._refreshTrackedMissionNav(m);
        return;
      }
    }
  },

  _onContractClaimDestroyed(p) {
    if (!p || p.id == null) return;
    if (p.reason === 'save_restore') return; // a restore sweep is not a kill
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      // entity:destroyed is QUEUED — ids recycle before the receipt flushes, so the bare id
      // can name a fresh occupant. The payload carries the corpse object itself: its own
      // site stamp is the identity. Publishers without an entity ref fall back to the id.
      if (p.entity) {
        if (!p.entity.data || p.entity.data.contractClaimSiteOf !== m.id) continue;
      } else if (!(m.targetEntityIds || []).includes(p.id)) continue;
      const params = m.params || (m.params = {});
      params.contractWreckGone = 'destroyed';
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id, wreckGone: 'destroyed' });
      return;
    }
  },

  /** lootShards emits this AFTER the spilled manifest pod exists — the moment the marker can
   *  truthfully re-target the cargo (the kill handler runs before the pod is spawned). */
  _onContractClaimPodSpilled(p) {
    if (!p || p.payloadId == null) return;
    const pod = this.state.entities && this.state.entities.get(p.payloadId);
    if (!pod || !pod.data || pod.data.payloadType !== CIVILIAN_MANIFEST_PAYLOAD_TYPE) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      if (pod.data.manifestId !== `claim-manifest:${m.id}`) continue;
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id });
      return;
    }
  },

  /** The player finished the cut — the site is done regardless of what the crew wants. */
  _onContractClaimSalvageCompleted(p) {
    if (!p || p.wreckId == null) return;
    for (const m of this.state.missions.active || []) {
      if (!contractClaimSiteMission(m)) continue;
      if (!(m.targetEntityIds || []).includes(p.wreckId)) continue;
      const params = m.params || (m.params = {});
      params.contractWreckGone = 'drained';
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id, wreckGone: 'drained' });
      return;
    }
  },

  // =========================================================================================
  // PB-MIS-E — FORGE YARD CONTRACTS
  //
  // Two authored one-shot station jobs posted on the depot3 board by _syncYardContractOffers.
  // Both scenes settle on PHYSICAL FACTS only: a body's position and its salvagePool. Nobody
  // pays for a flag, a registry, or a selection — the lot counts when it physically crosses
  // the yard's ring, whoever dragged it there (player tether, hired tug, or a shove).
  // =========================================================================================

  /** Live yard sink position — the materialized station first, authored offset as fallback. */
  _yardSinkPos(m) {
    const sink = this._liveStation(m && m.destStationId);
    if (sink && sink.pos && Number.isFinite(sink.pos.x)) return { x: sink.pos.x, z: sink.pos.z };
    return yardSinkPos();
  },

  _yardBerthPos(m) {
    const sink = this._yardSinkPos(m);
    if (!sink) return null;
    return { x: sink.x + QUIET_BERTH_TUNING.berthOffset.x, z: sink.z + QUIET_BERTH_TUNING.berthOffset.z };
  },

  /** The live scene body for a slot key ('urgent' | 'heavy' | 'wreck' | 'lighter'). */
  _yardBody(m, slotKey) {
    for (const id of (m && m.targetEntityIds) || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && e.data && e.data.yardSlotKey === slotKey) return e;
    }
    return null;
  },

  /** Waypoint focus: nearest unresolved net, else the lighter, else null → dock marker. */
  _yardWorkFocus(m) {
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (m.type === QUIET_BERTH_TYPE) {
      const lighter = this._yardBody(m, 'lighter');
      if (!lighter || (m.params && m.params.yardLighterState && m.params.yardLighterState !== 'pending')) return null;
      return { id: lighter.id, pos: lighter.pos, reason: 'Park the lighter at the west berth — tow it, drag it, or hire the tug' };
    }
    const lots = (m.params && m.params.yardLotStates) || {};
    let best = null;
    let bestD2 = Infinity;
    for (const lot of (m.params && m.params.lots) || []) {
      if (lots[lot.key] && lots[lot.key] !== 'pending') continue;
      const net = this._yardBody(m, lot.key);
      if (!net || !net.pos) continue;
      if (salvagePoolUnits(net.data && net.data.salvagePool) <= 0) continue;
      const d2 = player && player.pos
        ? (net.pos.x - player.pos.x) ** 2 + (net.pos.z - player.pos.z) ** 2 : 0;
      if (d2 < bestD2) { bestD2 = d2; best = net; }
    }
    if (best) {
      return {
        id: best.id, pos: best.pos,
        reason: 'Land the nets on the yard pad — urgent first, or work both',
      };
    }
    const wreck = this._yardBody(m, 'wreck');
    if (wreck && salvagePoolUnits(wreck.data && wreck.data.salvagePool) > 0) {
      return { id: wreck.id, pos: wreck.pos, reason: 'The spill is clear — strip the wreck or let it go' };
    }
    return null;
  },

  /**
   * SF-139 — the split manifest. Two real payload bodies (one light urgent net, one dense
   * heavy net) plus the stripped freighter hull as free salvage. Only PENDING bodies spawn;
   * delivered and lost lots are durable on params and never rematerialize — the same
   * conservation rule the claim site follows for its wreck pool.
   */
  _spawnSplitManifestSite(m, nextRng) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    const params = m.params || (m.params = {});
    const sinkPos = this._yardSinkPos(m);
    if (!sinkPos) return;
    m.targetEntityIds = (m.targetEntityIds || []).filter((id) => {
      const e = this.state.entities.get(id);
      return e && e.alive !== false;
    });
    const lots = params.yardLotStates || (params.yardLotStates = {});
    const pools = params.yardPools || {};
    const want = (params.lots || []).filter((lot) => (
      (!lots[lot.key] || lots[lot.key] === 'pending') && !this._yardBody(m, lot.key)
    )).length + ((params.yardWreckGone || this._yardBody(m, 'wreck')) ? 0 : 1);
    if (want <= 0) return;
    const budget = helpers.spawnBudget;
    const requester = `mission:${m.id}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(want, requester) : want;
    if (grant <= 0) { this._noteMissionSpawnDeferred(m, want, 0); return; }
    const rng = nextRng(0);
    let spawned = 0;
    let slotIndex = 0;
    const bind = (ent, slotKey) => {
      if (!ent) return false;
      if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
      ent.data = ent.data || {};
      ent.data.yardWorkOf = String(m.id);
      ent.data.yardSlotKey = slotKey;
      this._stampMissionTargetIdentity(ent, m, slotIndex++);
      ent.data.missionTargetSlot = slotIndex - 1;
      m.targetEntityIds.push(ent.id);
      spawned++;
      return true;
    };
    for (const lot of params.lots || []) {
      if ((lots[lot.key] && lots[lot.key] !== 'pending') || this._yardBody(m, lot.key)) continue;
      if (spawned >= grant) break;
      const tuning = SPLIT_MANIFEST_LOTS[lot.key] || SPLIT_MANIFEST_LOTS.heavy;
      const off = splitManifestNetOffset(lot.key);
      const pool = pools[lot.key] && typeof pools[lot.key] === 'object'
        ? { ...pools[lot.key] }
        : { [lot.cmdtyId]: Math.max(1, Math.floor(Number(lot.qty) || 1)) };
      let ent = null;
      try {
        ent = spawnPayloadEntity(this.state, {
          pos: { x: sinkPos.x + off.x + (rng() - 0.5) * 40, z: sinkPos.z + off.z + (rng() - 0.5) * 40 },
          vel: { x: (rng() - 0.5) * 3, z: (rng() - 0.5) * 3 },
          radius: tuning.radius,
          mass: tuning.mass,
          hull: 60,
          hullMax: 60,
          payloadType: 'yard_net',
          salvagePool: pool,
          ownerId: 'yard',
          factionId: 'faction_dmc',
          transientSector: false,
          physicsBody: { shape: 'capsule', mass: tuning.mass },
        }, helpers);
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, grant - spawned);
        throw error;
      }
      if (ent) {
        ent.data.scanLabel = tuning.label;
        ent.data.towable = true;
        ent.data.tetherable = true;
        bind(ent, lot.key);
      } else if (budget && typeof budget.releaseSome === 'function') {
        budget.releaseSome(requester, 1);
      }
    }
    // The stripped freighter: free salvage leftovers, recoverable later or ignored.
    if (!params.yardWreckGone && !this._yardBody(m, 'wreck') && spawned < grant) {
      const off = splitManifestWreckOffset();
      let ent = null;
      try {
        ent = helpers.spawnEntity({
          type: 'wreck',
          team: 2,
          pos: { x: sinkPos.x + off.x + (rng() - 0.5) * 30, z: sinkPos.z + off.z + (rng() - 0.5) * 30 },
          vel: { x: (rng() - 0.5) * 4, z: (rng() - 0.5) * 4 },
          rot: rng() * Math.PI * 2,
          radius: 20,
          mass: 120,
          hull: 140,
          hullMax: 140,
          collides: true,
          collisionMask: MISSION_WRECK_COLLISION_MASK,
          physicsBody: { shape: 'capsule', mass: 120 },
          data: {
            proportions: WRECK_COLLIDER_PROPORTIONS,
            scanLabel: 'BROKEN FREIGHTER · LEFTOVERS',
            tetherable: true,
            towable: true,
            salvagePool: pools.wreck && typeof pools.wreck === 'object'
              ? { ...pools.wreck }
              : { cmdty_scrap_metal: 3, [SPLIT_MANIFEST_LOTS.urgent.cmdtyId]: 1 },
          },
        });
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, grant - spawned);
        throw error;
      }
      if (ent) bind(ent, 'wreck');
      else if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
    }
    if (spawned > 0) {
      if (params.yardContactAt == null) params.yardContactAt = Number(this.state.simTime) || 0;
      if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
      this.bus.emit('mission:updated', { missionId: m.id });
    }
  },

  /**
   * SF-142 — the quiet berth. One dead lighter wedged off the west berth plus the yard's own
   * tug working the apron — hirable through the ordinary contact-hail tow seam. No combat
   * wave, no timer: solve it by looking, then by pulling.
   */
  _spawnQuietBerthSite(m, nextRng) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    const params = m.params || (m.params = {});
    const sinkPos = this._yardSinkPos(m);
    if (!sinkPos) return;
    m.targetEntityIds = (m.targetEntityIds || []).filter((id) => {
      const e = this.state.entities.get(id);
      return e && e.alive !== false;
    });
    params.yardLighterState = params.yardLighterState || 'pending';
    const want = (params.yardLighterState === 'pending' && !this._yardBody(m, 'lighter') ? 1 : 0)
      + (this._yardBody(m, 'tug') ? 0 : 1);
    if (want <= 0) return;
    const budget = helpers.spawnBudget;
    const requester = `mission:${m.id}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(want, requester) : want;
    if (grant <= 0) { this._noteMissionSpawnDeferred(m, want, 0); return; }
    const rng = nextRng(0);
    const berth = this._yardBerthPos(m) || sinkPos;
    let spawned = 0;
    let slotIndex = 0;
    // The lighter: drive-dead under load, wedged between the apron and the berth ring.
    if (params.yardLighterState === 'pending' && !this._yardBody(m, 'lighter') && spawned < grant) {
      const pools = params.yardPools || {};
      const loadPool = pools.lighter && typeof pools.lighter === 'object'
        ? { ...pools.lighter }
        : { [params.loadCmdtyId || QUIET_BERTH_TUNING.load.cmdtyId]:
            Math.max(1, Math.floor(Number(params.loadQty) || QUIET_BERTH_TUNING.load.qty)) };
      let ent = null;
      try {
        ent = helpers.spawnEntity({
          type: 'wreck',
          team: 2,
          pos: {
            x: sinkPos.x + QUIET_BERTH_TUNING.spawnOffset.x + (rng() - 0.5) * 20,
            z: sinkPos.z + QUIET_BERTH_TUNING.spawnOffset.z + (rng() - 0.5) * 20,
          },
          vel: { x: 0, z: 0 },
          rot: rng() * Math.PI * 2,
          radius: QUIET_BERTH_TUNING.radius,
          mass: QUIET_BERTH_TUNING.mass,
          hull: 120,
          hullMax: 120,
          collides: true,
          collisionMask: MISSION_WRECK_COLLISION_MASK,
          physicsBody: { shape: 'capsule', mass: QUIET_BERTH_TUNING.mass },
          data: {
            proportions: WRECK_COLLIDER_PROPORTIONS,
            scanLabel: QUIET_BERTH_TUNING.scanLabel,
            tetherable: true,
            towable: true,
            salvagePool: loadPool,
          },
        });
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, grant - spawned);
        throw error;
      }
      if (ent) {
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
        ent.data.yardWorkOf = String(m.id);
        ent.data.yardSlotKey = 'lighter';
        this._stampMissionTargetIdentity(ent, m, slotIndex++);
        ent.data.missionTargetSlot = slotIndex - 1;
        m.targetEntityIds.push(ent.id);
        spawned++;
      } else if (budget && typeof budget.releaseSome === 'function') {
        budget.releaseSome(requester, 1);
      }
    }
    // The yard tug: an ordinary worker hull on a two-point apron shuttle, hirable by hail.
    if (!this._yardBody(m, 'tug') && spawned < grant) {
      let ent = null;
      const a = { x: berth.x - 120, z: berth.z + 80 };
      const b = { x: sinkPos.x + 60, z: sinkPos.z - 160 };
      try {
        ent = helpers.spawnEntity({
          type: 'ship',
          team: 2,
          pos: { x: a.x, z: a.z },
          vel: { x: 0, z: 0 },
          rot: rng() * Math.PI * 2,
          radius: 10,
          mass: 14,
          hull: 80,
          hullMax: 80,
          collides: true,
          data: {
            worldRecordId: `yard-tug:${m.id}`,
            sectorId: m.destSectorId,
            trafficRole: 'tug',
            scanLabel: 'YARD TUG',
            ai: { passive: true, roe: 'hold_fire' },
          },
        });
      } catch (error) {
        if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, grant - spawned);
        throw error;
      }
      if (ent) {
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
        // The hull is mission-owned scenery for cleanup/adopt, but its JOB belongs to the
        // ordinary npcJobs runtime — a hired tow lease is the SF-138 door.
        ent.data.yardWorkOf = String(m.id);
        ent.data.yardSlotKey = 'tug';
        this._stampMissionTargetIdentity(ent, m, slotIndex++);
        ent.data.missionTargetSlot = slotIndex - 1;
        m.targetEntityIds.push(ent.id);
        const npcJobs = helpers.npcJobs;
        if (npcJobs && typeof npcJobs.assign === 'function') {
          npcJobs.assign(ent, {
            kind: 'hauler',
            sectorId: m.destSectorId,
            speed: 20,
            commissionS: 0.2,
            loadS: 0.2,
            departS: 0.4,
            approachS: 0.2,
            unloadS: 0.2,
            route: [
              { id: 'yard-tug:apron', pos: { x: a.x, z: a.z }, label: 'Apron' },
              { id: 'yard-tug:depot', pos: { x: b.x, z: b.z }, label: 'Depot' },
            ],
          });
        }
        spawned++;
      } else if (budget && typeof budget.releaseSome === 'function') {
        budget.releaseSome(requester, 1);
      }
    }
    if (spawned > 0) {
      if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
      this.bus.emit('mission:updated', { missionId: m.id });
    }
  },

  /** Per-tick: a pending net inside the dock ring is delivered; a stripped one is lost.
   *  Every lot resolved settles the contract on the shares actually landed. */
  _driveSplitManifest(m, index, state) {
    if ((state.world && state.world.currentSectorId) !== m.destSectorId) return;
    const params = m.params || (m.params = {});
    const sinkPos = this._yardSinkPos(m);
    if (!sinkPos) return;
    const lots = params.yardLotStates || (params.yardLotStates = {});
    const now = Number(state.simTime) || 0;
    for (const lot of params.lots || []) {
      const st = lots[lot.key] || (lots[lot.key] = 'pending');
      if (st !== 'pending') continue;
      const net = this._yardBody(m, lot.key);
      if (!net) continue; // not materialized (or already swept) — spawn handles re-entry
      const units = salvagePoolUnits(net.data && net.data.salvagePool);
      if (units <= 0) {
        // Drained by the strip: the goods are aboard the player's hold, not the pad.
        lots[lot.key] = 'stripped';
        this.bus.emit('toast', {
          text: `${lot.key === 'urgent' ? 'The urgent net' : 'The heavy net'} is stripped — the manifest closes on what's left.`,
          kind: 'warn', ttl: 4,
        });
        this._refreshTrackedMissionNav(m);
        continue;
      }
      const d = Math.hypot(net.pos.x - sinkPos.x, net.pos.z - sinkPos.z);
      if (d > SPLIT_MANIFEST_TUNING.dockRange) continue;
      const fast = lot.key !== 'urgent'
        || (now - (Number(params.yardContactAt) || now)) <= (Number(params.fastWindowS) || SPLIT_MANIFEST_LOTS.urgent.fastWindowS);
      lots[lot.key] = lot.key === 'urgent' && !fast ? 'delivered_late' : 'delivered';
      params[`yardUnits_${lot.key}`] = units;
      m.objectiveProgress = (m.objectiveProgress || 0) + 1;
      // The yard takes the net: the body leaves play, the units are the delivery.
      net.data.yardWorkOf = null;
      net.alive = false;
      const budget = this.helpers && this.helpers.spawnBudget;
      if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(net.id);
      this.bus.emit('toast', {
        text: lot.key === 'urgent'
          ? (fast ? 'Urgent net on the pad — still cold.' : 'The urgent net came in late — partial rate.')
          : 'Heavy net on the pad.',
        kind: 'info', ttl: 4,
      });
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', {
        missionId: m.id, objectiveProgress: m.objectiveProgress, [`yard_${lot.key}`]: lots[lot.key],
      });
    }
    const states = (params.lots || []).map((lot) => lots[lot.key]);
    if (states.length === 0 || states.some((st) => !st || st === 'pending')) return;
    // Every lot resolved — pay the shares that physically landed.
    const urgent = lots.urgent;
    const heavy = lots.heavy;
    let pay = 0;
    if (urgent === 'delivered') pay += SPLIT_MANIFEST_TUNING.shareUrgentFastCr;
    else if (urgent === 'delivered_late') pay += SPLIT_MANIFEST_TUNING.shareUrgentLateCr;
    if (heavy === 'delivered') pay += SPLIT_MANIFEST_TUNING.shareHeavyCr;
    if (pay > 0) {
      m.reward_cr = pay;
      const cue = pay >= SPLIT_MANIFEST_TUNING.rewardFullCr
        ? YARD_CUES.splitManifest.settleFull
        : urgent === 'delivered_late' ? YARD_CUES.splitManifest.settleLate
        : YARD_CUES.splitManifest.settlePartial;
      this.bus.emit('toast', { text: cue, kind: 'info', ttl: 5 });
      this._completeMission(m, index);
    } else {
      this._failMission(m, index, 'all_lots_lost');
    }
  },

  /** Per-tick: the lighter parked inside the berth ring settles the contract. */
  _driveQuietBerth(m, index, state) {
    if ((state.world && state.world.currentSectorId) !== m.destSectorId) return;
    const params = m.params || (m.params = {});
    if (params.yardLighterState && params.yardLighterState !== 'pending') return;
    const lighter = this._yardBody(m, 'lighter');
    if (!lighter) return;
    const berth = this._yardBerthPos(m);
    if (!berth) return;
    if (Math.hypot(lighter.pos.x - berth.x, lighter.pos.z - berth.z) > QUIET_BERTH_TUNING.berthRange) return;
    params.yardLighterState = 'berthed';
    m.objectiveProgress = 1;
    m.reward_cr = QUIET_BERTH_TUNING.rewardCr;
    this._completeMission(m, index);
  },

  /** Yard scene bodies die through entity:killed/entity:destroyed like every hull. The corpse
   *  object (or its surviving data) carries the stamps — a queued id alone is not trusted. */
  _onYardWorkEntityLost(p) {
    if (!p || p.id == null) return;
    if (p.reason === 'save_restore') return;
    const entity = (p.entity && p.entity.data ? p.entity : null)
      || (this.state.entities ? this.state.entities.get(p.id) : null);
    const data = entity && entity.data;
    const missionId = data && data.yardWorkOf;
    if (!missionId) return;
    const i = (this.state.missions.active || []).findIndex((m) => (
      m && m.status === 'active' && String(m.id) === String(missionId)
    ));
    if (i < 0) return;
    const m = this.state.missions.active[i];
    if (m.type !== SPLIT_MANIFEST_TYPE && m.type !== QUIET_BERTH_TYPE) return;
    const params = m.params || (m.params = {});
    const key = data.yardSlotKey;
    if (m.type === QUIET_BERTH_TYPE) {
      // The yard tug is replaceable ambient crew; the lighter IS the contract.
      if (key === 'lighter' && (!params.yardLighterState || params.yardLighterState === 'pending')) {
        params.yardLighterState = 'destroyed';
        this.bus.emit('toast', {
          text: 'The lighter is scrap. The berth is clear — and so is the contract.',
          kind: 'warn', ttl: 5,
        });
        this._failMission(m, i, 'hull_destroyed');
      }
      return;
    }
    if (key === 'tug') return;
    if (key === 'wreck') {
      params.yardWreckGone = 'destroyed';
      this._refreshTrackedMissionNav(m);
      return;
    }
    const lots = params.yardLotStates || (params.yardLotStates = {});
    if (key && (!lots[key] || lots[key] === 'pending')) {
      lots[key] = 'lost';
      this.bus.emit('toast', {
        text: `${key === 'urgent' ? 'The urgent net' : 'The heavy net'} is gone — save what's left.`,
        kind: 'warn', ttl: 4,
      });
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id, [`yard_${key}`]: 'lost' });
      // A zero-share settle is checked on the next drive tick, when the world has settled too.
    }
  },

  _onYardTowAssistLost(p) {
    if (!p || p.targetId == null) return;
    const entity = this.state.entities && this.state.entities.get(p.targetId);
    const data = entity && entity.data;
    if (!data || data.yardWorkOf == null) return;
    const label = p.reason === 'hull_lost' ? 'The hired tug is gone — the load drifts free.'
      : p.reason === 'timeout' ? 'The hired tug gave up the haul — the load drifts free.'
      : 'The hired tow was released — the load drifts free.';
    this.bus.emit('toast', { text: label, kind: 'warn', ttl: 4 });
  },

  /**
   * The tow-hire destination hook (scanner's HIRE TOW choice). A yard body answers with its
   * own sink: the lighter wants the berth ring, a net wants the dock pad. Anything else —
   * including claim-site wrecks and loose salvage — gets no mission hint and falls back to
   * the caller's default, so the hire stays honest for every body in the world.
   */
  towAssistDestFor(entityId) {
    const e = this.state.entities && this.state.entities.get(entityId);
    const data = e && e.data;
    if (!data || data.yardWorkOf == null) return null;
    const m = (this.state.missions.active || []).find((x) => (
      x && x.status === 'active' && String(x.id) === String(data.yardWorkOf)
    ));
    if (!m) return null;
    if (m.type === QUIET_BERTH_TYPE && data.yardSlotKey === 'lighter') {
      const pos = this._yardBerthPos(m);
      return pos ? { pos, missionId: m.id, deliverW: QUIET_BERTH_TUNING.berthRange } : null;
    }
    if (m.type === SPLIT_MANIFEST_TYPE && data.yardSlotKey !== 'lighter') {
      const pos = this._yardSinkPos(m);
      return pos ? { pos, missionId: m.id, deliverW: SPLIT_MANIFEST_TUNING.dockRange } : null;
    }
    return null;
  },

  /** Mark mission target entities dead when the mission settles (avoid orphans). */
  _cleanupTargets(m) {
    // Capital boss contracts hand the authored score back at the settlement boundary. The detach
    // is DEFERRED to this system's next update tick: settlement can land synchronously inside the
    // kill event, before the score's fixed-tick step has emitted capitalBoss:ended with its final
    // voice/telemetry. Between settlement and the flush the cast is already swept (or terminal),
    // so no living capital is ever ungated.
    if (isCapitalBossMission(m)) {
      this._pendingCapitalBossDetaches = this._pendingCapitalBossDetaches || new Set();
      this._pendingCapitalBossDetaches.add(String(m.id));
    }
    const follow = m.params && m.params.poiSignalFollowup;
    const world = this.registry && this.registry.get && this.registry.get('world');
    const targetIds = new Set(m.targetEntityIds || []);
    if (follow) {
      // O(1) holder arm under a proven single count — the walk predicate pins the same
      // recordId plus living-actor membership, so a counted unique holder is the only
      // possible match. Ambiguous/absent counts keep the lane walk (multi-carrier rows).
      const wrIndex = this.state && this.state.entityIndex;
      const holder = wrIndex && wrIndex.__spacefaceEntityIndexV1 === true && wrIndex.ready === true
        && wrIndex.byWorldRecordId instanceof Map && wrIndex.byWorldRecordIdCount instanceof Map
        && wrIndex.byWorldRecordIdCount.get(follow.targetRecordId) === 1
        ? wrIndex.byWorldRecordId.get(follow.targetRecordId)
        : null;
      if (holder) {
        if (isLivingWorldActor(holder)) targetIds.add(holder.id);
      } else {
        forEachLivingWorldActor(this.state, (e) => {
          if (e && e.data && e.data.worldRecordId === follow.targetRecordId) targetIds.add(e.id);
        });
      }
    }
    // NXI-145: a shared subject belongs to every live contract chasing it — settling this one
    // releases this mission's claim but must not sweep a body the other contract still needs.
    const sharedIds = new Set();
    const sharedRecordIds = new Set();
    for (const other of this.state.missions.active) {
      if (other === m || other.status !== 'active') continue;
      for (const id of other.targetEntityIds || []) {
        sharedIds.add(id);
        const e = this.state.entities.get(id);
        if (e && e.data && e.data.worldRecordId != null) sharedRecordIds.add(e.data.worldRecordId);
      }
      const otherFollow = other.params && other.params.poiSignalFollowup;
      if (otherFollow && otherFollow.targetRecordId != null) sharedRecordIds.add(otherFollow.targetRecordId);
    }
    if (follow && !sharedRecordIds.has(follow.targetRecordId)
        && world && typeof world.markWorldRecordDestroyed === 'function') {
      world.markWorldRecordDestroyed(follow.targetRecordId, {
        outcome: m.status === 'completed' ? 'investigated' : 'destroyed',
        reason: 'mission_settled',
      });
    }
    const releasedRecordIds = new Set();
    if (sharedRecordIds.size) {
      forEachLivingWorldActor(this.state, (e) => {
        if (e && e.data && sharedRecordIds.has(e.data.worldRecordId)) sharedIds.add(e.id);
      });
    }
    // Spring-wing raiders are not objective targets: settlement RELEASES them to ordinary lane
    // life (unpinned, unstamped) rather than sweeping them — the fight the contract started
    // stays in the sky, which is exactly what a stranger remembers about an escort gone loud.
    forEachLivingWorldActor(this.state, (e) => {
      if (!e || !e.data) return;
      if (e.data.escortAmbushOf === String(m.id)) {
        e.data.escortAmbushOf = null;
        const budget = this.helpers && this.helpers.spawnBudget;
        if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(e.id);
      }
      // WF-08: a claim-stake crew outlives its contract the same way — the hauler keeps
      // whatever it already loaded (a real manifest payload if it dies later), and sprung
      // cutters stay the hostile lane actors the fight made them.
      if (e.data.contractClaimCrewOf === String(m.id)) {
        e.data.contractClaimCrewOf = null;
        e.data.salvorClaimId = null;
        e.data.claimRole = null;
        const budget = this.helpers && this.helpers.spawnBudget;
        if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(e.id);
      }
      // NXI-150: surviving convoy wings outlive a lost lead the same way — a FAILED escort
      // releases them to lane life (unpinned, unstamped) rather than despawning bodies the
      // contract no longer owns. A later kill still drops the real manifest they were hauling.
      // Completion is different: the convoy docked, and the sweep reads as the crew dispersing.
      if (m.status !== 'completed'
          && e.data.escortee === true && String(missionIdentityOf(e)) === String(m.id)) {
        e.data.escortee = null;
        e.data.missionTag = null;
        e.data.missionId = null;
        e.data.missionPinned = false;
        if (e.flags) e.flags.missionPinned = false;
        if (e.data.flags) e.data.flags.missionPinned = false;
        if (e.data.worldRecordId != null) releasedRecordIds.add(e.data.worldRecordId);
        if (e.data.intent) { e.data.intent.moveX = 0; e.data.intent.moveZ = 0; e.data.intent.boost = false; }
        targetIds.delete(e.id);
        const budget = this.helpers && this.helpers.spawnBudget;
        if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(e.id);
      }
    });
    for (const id of targetIds) {
      if (sharedIds.has(id)) continue; // another live contract still owns this subject
      const e = this.state.entities.get(id);
      if (e && e.alive && e.id !== this.state.playerId) {
        if (this._handoffFleeingTarget(e)) {
          if (e.data.worldRecordId != null) releasedRecordIds.add(e.data.worldRecordId);
          const budget = this.helpers && this.helpers.spawnBudget;
          if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(e.id);
          continue;
        }
        e.alive = false; // swept end-of-step
        // A silent sweep must retire durable memory too, or re-entry resurrects the target.
        if (e.data && e.data.worldRecordId != null && !sharedRecordIds.has(e.data.worldRecordId)
          && world && typeof world.markWorldRecordDestroyed === 'function') {
          world.markWorldRecordDestroyed(e.data.worldRecordId, {
            outcome: 'destroyed', reason: 'mission_settled',
          });
        }
        const budget = this.helpers && this.helpers.spawnBudget;
        if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(e.id);
      }
    }
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    for (const rec of Object.values(records || {})) {
      if (!rec || String(rec.missionId || rec.missionTag || '') !== String(m.id)
          || sharedRecordIds.has(rec.recordId)) continue;
      if (releasedRecordIds.has(rec.recordId)) {
        rec.missionId = null;
        rec.missionTag = null;
        if (rec.kind === 'mission_target') rec.kind = 'npc';
      } else if (world && typeof world.markWorldRecordDestroyed === 'function') {
        world.markWorldRecordDestroyed(rec.recordId, { outcome: 'destroyed', reason: 'mission_settled' });
      } else {
        rec.alive = false;
        rec.outcome = 'destroyed';
      }
    }
    m.targetEntityIds = [];
    m._escorteeId = null;
    if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
  },

  /**
   * A target already under a flee order leaves on the existing egress exit
   * instead of vanishing at settlement. True means the body stays alive for
   * that path. Exclusions match stepEgressExits so a hull that path will not
   * take is still swept.
   */
  _handoffFleeingTarget(entity) {
    const data = entity && entity.data;
    if (!data || !fleeOrderActive(data.ai)) return false;
    const ai = data.ai || {};
    if (ai.moraleImmune === true) return false;
    if (data.runCohort === 'survival') return false;
    if (data.encounter) return false;
    const state = this.state;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (player && entity.team != null && player.team != null && entity.team === player.team) return false;
    const live = state.encounterDirector && state.encounterDirector.live;
    if (live && typeof live === 'object') {
      for (const id of Object.keys(live)) {
        const row = live[id];
        if (row && row.phase !== 'done' && Array.isArray(row.ids) && row.ids.includes(entity.id)) return false;
      }
    }
    data.missionPinned = false;
    if (entity.flags) entity.flags.missionPinned = false;
    if (data.flags) data.flags.missionPinned = false;
    data.missionTag = null;
    data.missionId = null;
    const ours = Number.isFinite(data._egressExitAt) && data.despawnAt === data._egressExitAt;
    if (ours || data.despawnAt != null) return true;
    if (!player || !player.pos || !entity.pos) return true;
    const dx = entity.pos.x - player.pos.x;
    const dz = entity.pos.z - player.pos.z;
    if (dx * dx + dz * dz < EGRESS_DISTANCE_WU * EGRESS_DISTANCE_WU) return true;
    const now = Number(state.simTime) || 0;
    data.despawnAt = now + EGRESS_FADE_S;
    data._egressExitAt = data.despawnAt;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ai:egressExit', {
        entityId: entity.id,
        reason: ai.fsm === 'flee' ? 'fsm:flee' : (ai.forceFlee === true ? 'forceFlee' : 'activity'),
        factionId: entity.factionId || data.factionId || null,
        separation: Math.round(Math.sqrt(dx * dx + dz * dz)),
        t: now,
      });
    }
    return true;
  },

  _onSectorEnter(p) {
    // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
    // drains this same body under its slice clock in listener order.
    if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
    // Sync lane (emit listener, tests): drain the chunked steps inline.
    for (const _ of this._onSectorEnterSteps(p)) { /* inline */ }
  },

  *_onSectorEnterSteps(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // A tail-drained emit carries the epoch of the enter that minted it: a replayed
    // payload whose enterEpoch no longer matches the world's serial is stale — spawning
    // its mission targets mints bodies keyed to the departed sector. Synthetic payloads
    // carry no epoch and always run.
    if (p && p.enterEpoch != null && this.state && this.state.world
        && this.state.world.enterSerial != null
        && p.enterEpoch !== this.state.world.enterSerial) return;
    yield* this.spawnTargetsForSectorChunked(sectorId);
    this._reconcileLandmarkQuestOffers({ sectorId });
    this._emitSetPieceTravelLine(sectorId);
    this._onPassengerSectorEnter(sectorId);
    this._refreshNavigation({ preferStory: true });
    this._storyTrigger('sector', { sectorId });
  },

  _emitSetPieceTravelLine(sectorId) {
    for (const mission of this.state.missions.active || []) {
      const cause = setPieceCauseOf(mission);
      if (!cause || cause.archetypeId !== 'witness_run' || cause.stageIndex < 1) continue;
      if (mission.status !== 'active' || mission.destSectorId !== sectorId) continue;
      if (!cause.travelText || cause.travelLineSpoken) continue;
      // The once flag lives in the normal active cause and therefore survives the ordinary mission
      // save path without a witness-run sidecar.
      cause.travelLineSpoken = true;
      // FB-137: the durable fact the route-ribbon presentation reads — which berth the spoken
      // line points at. Same save path as the flag above; the ribbon resolves it live.
      cause.travelLineTo = mission.destStationId || null;
      this.bus.emit('comms:popup', {
        sender: cause.witnessName || 'Witness',
        text: cause.travelText,
        category: 'personal',
        ttl: 8,
      });
      this.bus.emit('mission:setPieceTravelLine', {
        missionId: mission.id,
        witnessId: cause.witnessId || null,
        witnessName: cause.witnessName || null,
        text: cause.travelText,
        ...setPieceEventFields(mission),
      });
    }
  },

  // =========================================================================================
  // PASSENGERS ARE PEOPLE (A1) — a fare the run makes real, on existing seams
  //
  // The passenger is minted per offer (params.passenger — name + why-line, hash-derived from
  // the world seed and the offer id, so save/load is stable and no rng draw is spent). They
  // speak three times: the boarding line on dock:undocked, one mid-run line at the route
  // midpoint on the sim clock (or sooner if the player crosses into the destination sector),
  // and an arrival line quoted back in the settlement receipt. Line picks are hash-derived
  // from (seed, mission id) — never ambient randomness.
  // =========================================================================================

  /** One beat line for this mission's passenger, deterministically picked and interpolated. */
  _passengerBeatLine(m, kind) {
    const pax = m && m.params && m.params.passenger;
    if (!pax || !pax.name) return '';
    const seed = (this.state.meta && this.state.meta.seed) || 0;
    const idx = hash32(seed >>> 0, String(m.id || pax.name), 'pax-beat', kind);
    return passengerBeatLine(kind, idx)
      .replace(/\{name\}/g, pax.name)
      .replace(/\{dest\}/g, this._destName(m));
  },

  _speakPassenger(m, kind) {
    const pax = m && m.params && m.params.passenger;
    const text = this._passengerBeatLine(m, kind);
    if (!pax || !pax.name || !text) return;
    this.bus.emit('comms:popup', { sender: pax.name, text, category: 'personal', ttl: 7 });
  },

  /** Undock: the boarding line, plus the mid-run beat scheduled at the route midpoint. */
  _onPassengerUndock() {
    const state = this.state;
    for (const m of (state.missions && state.missions.active) || []) {
      if (!m || m.status !== 'active' || m.type !== 'passenger_transport') continue;
      if (!(m.params && m.params.passenger)) continue;
      if (!m._paxBoardSpoken) {
        m._paxBoardSpoken = true;
        this._speakPassenger(m, 'board');
      }
      // Route midpoint at the reference cruise speed, clamped so the line never lands at the
      // umbilical nor waits out the whole run. A faster player crosses into the destination
      // sector first and speaks it there (see _onPassengerSectorEnter).
      if (m._paxMidrunAt == null) {
        const etaMidS = (Math.max(0, Number(m.distance) || 0) / 2)
          / (MISSION_TUNING.cruiseSpeedRef || 140);
        m._paxMidrunAt = (Number(state.simTime) || 0) + Math.min(Math.max(etaMidS, 45), 240);
      }
      break; // one passenger voice per undock
    }
  },

  /** A destination-sector crossing speaks the mid-run beat early. */
  _onPassengerSectorEnter(sectorId) {
    for (const m of (this.state.missions && this.state.missions.active) || []) {
      if (!m || m.status !== 'active' || m.type !== 'passenger_transport') continue;
      if (m._paxMidrunSpoken || !(m.params && m.params.passenger)) continue;
      if (m.destSectorId !== sectorId) continue;
      m._paxMidrunSpoken = true;
      this._speakPassenger(m, 'midrun');
      break;
    }
  },

  /** Per-tick: the scheduled mid-run beat for runs that never cross a sector boundary. */
  _drivePassengerBeats(state) {
    for (const m of (state.missions && state.missions.active) || []) {
      if (!m || m.status !== 'active' || m.type !== 'passenger_transport') continue;
      if (m._paxMidrunAt == null || m._paxMidrunSpoken) continue;
      if ((Number(state.simTime) || 0) < m._paxMidrunAt) continue;
      m._paxMidrunSpoken = true;
      this._speakPassenger(m, 'midrun');
    }
  },

  spawnTargetsForSector(sectorId) {
    for (const _ of this.spawnTargetsForSectorChunked(sectorId)) { /* sync lane: inline */ }
  },

  // Generator twin: each mission's adopt/spawn is atomic, so yields sit only between missions.
  *spawnTargetsForSectorChunked(sectorId) {
    if (!sectorId) return;
    // Continue runs this pass twice — restore step 13 and the save:loaded navigation refresh —
    // each O(missions × living-actors) via _adoptLiveMissionTargets. When the mission fields the
    // body reads and the entity index both sit unchanged since the previous pass, a repeat can
    // only reach the same adopt/spawn decisions, so it is skipped. The signature deliberately
    // excludes targetEntityIds (the pass itself grows it); the version latch records the index
    // state AFTER the pass so the pass's own spawns do not invalidate the dedupe.
    const active = this.state.missions && this.state.missions.active;
    let passKey = null;
    if (Array.isArray(active)) {
      let sig = '';
      for (const m of active) {
        if (m.status !== 'active' || !m.needsTargets || m.destSectorId !== sectorId) continue;
        sig += `${m.id}:${m.objectiveProgress}:${m.objectiveTarget}|`;
      }
      passKey = {
        sectorId,
        count: active.length,
        sig,
        version: entityIndexVersion(this.state),
      };
      const prev = this._spawnTargetsPassKey;
      if (prev && Number.isFinite(passKey.version)
          && prev.sectorId === passKey.sectorId && prev.count === passKey.count
          && prev.sig === passKey.sig && prev.version === passKey.version) {
        return;
      }
      // Not stored yet: a superseded cook pass (iterator.return mid-loop) must not leave a
      // key that reads like a completed pass — the next invocation would skip on the stale
      // latch while missions this pass never reached stay unevaluated.
    }
    // Spawn (or re-spawn after load) deferred targets for any active mission keyed to this sector.
    // Continue order: world rematerializes mission_target records first; adopt those live IDs
    // before any fresh spawn so targetEntityIds (cleared on deserialize) do not duplicate.
    for (const m of (this.state.missions.active || []).slice()) {
      if (m.status !== 'active' || !m.needsTargets) continue;
      if (m.destSectorId !== sectorId) continue;
      m.targetEntityIds = m.targetEntityIds.filter((id) => {
        const e = this.state.entities.get(id); return e && e.alive;
      });
      // _spawnTargetsFor re-runs the adopt + cast-reattach itself — the explicit adopt
      // here duplicated its living-actor scan for identical output.
      if (m.objectiveProgress < m.objectiveTarget) {
        this._spawnTargetsFor(m);
      }
      yield 'mission-targets';
    }
    if (passKey) {
      passKey.version = entityIndexVersion(this.state);
      this._spawnTargetsPassKey = passKey;
    }
  },

  _onSectorExit(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // PQ-019C: mark the run BEFORE any continuous-handoff early-return below. `entity:destroyed` is
    // the generic "left the world" event, so without this a player who simply flew out of Tethys
    // would be told the capsule was destroyed rather than lost. See heistMissionRuntime.onSectorExit.
    this._heistEach((h) => heistMissionRuntime.onSectorExit(this._heistCtx(), h, sectorId));
    // SF-143: an armed yard watch parks at the boundary — the scene's own body snapshot carries
    // the manifest; the mission's window clock waits for the return.
    this._counterweightEach((record) => counterweightRuntime.onSectorExit(this._heistCtx(), record, sectorId));
    // Continuous free-flight membership handoff: keep escorts, target ids, and escortee links.
    // World residency may still demote RECORD_ONLY entities; enter re-spawns missing targets.
    // Hard teardown only for intentional jump / load / non-continuous boundaries (M2-C1).
    if (p && (p.continuous || p.noTeleport)) return;

    // Escort abandoned (hard boundary only): live dest-sector rule — if the player intentionally
    // leaves the escort destination while an escortee is in flight, the contract is voided.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m.destSectorId === sectorId) {
        this._failMission(m, i, 'escort_abandoned');
      }
    }
    // Hard leave retires mission-pinned targets explicitly; world correctly refuses to evict them.
    for (const m of this.state.missions.active) {
      if (m.needsTargets && m.destSectorId === sectorId) {
        if (m.params?.workingBattlefield) snapshotWorkingBattlefield(this, m);
        for (const id of m.targetEntityIds || []) {
          const entity = this.state.entities.get(id);
          if (!entity || entity.id === this.state.playerId) continue;
          // WF-08: a claim-stake wreck that is swept mid-strip keeps its real remaining pool —
          // the respawn must not quietly refill the hold the player or the crew already cut.
          if (entity.data && entity.data.contractClaimSiteOf === m.id) {
            m.params = m.params || {};
            m.params.contractWreckPool = {
              ...(entity.data.salvagePool && typeof entity.data.salvagePool === 'object'
                ? entity.data.salvagePool : {}),
            };
            // Sweep ≠ destruction: drop the site stamp now so the queued entity:destroyed
            // receipt cannot misread this leave as the hull being killed.
            entity.data.contractClaimSiteOf = null;
          }
          // PB-MIS-E: same conservation for yard bodies — a swept net/lighter keeps its real
          // remaining pool in params; the stamp drops so the queued destroyed receipt cannot
          // misread the leave as a destroyed lot.
          if (entity.data && entity.data.yardWorkOf === m.id) {
            m.params = m.params || {};
            const pools = m.params.yardPools || (m.params.yardPools = {});
            const slotKey = entity.data.yardSlotKey;
            if (slotKey && entity.data.salvagePool && typeof entity.data.salvagePool === 'object') {
              pools[slotKey] = { ...entity.data.salvagePool };
            }
            entity.data.yardWorkOf = null;
          }
          entity.alive = false;
          const budget = this.helpers && this.helpers.spawnBudget;
          if (budget && typeof budget.releaseEntity === 'function') budget.releaseEntity(id);
        }
        m.targetEntityIds = [];
        m._escorteeId = null;
        if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.delete(String(m.id));
      }
    }
  },

  // =========================================================================================
  // CHAINING (store seeds, not live instances — survives save/load)
  // =========================================================================================
  _tryChain(m) {
    const def = TYPE_BY_ID.get(m.type);
    if (!def || !def.chainable || m.chainNextSeed == null) return;
    const originInfo = STATION_INFO.get(m.stationId) || STATION_INFO.get(m.destStationId);
    if (!originInfo) return;
    const board = this.ensureBoard(originInfo.id);
    if (!board) return;
    const rng = this.helpers.mulberry32 ? this.helpers.mulberry32(m.chainNextSeed >>> 0) : mulberryLocal(m.chainNextSeed >>> 0);
    // Bounty chains lock to the finished mark's sector and ask at most its risk: the follow-up
    // targets the same field the hunter is already working, at a standing reach the parent's
    // acceptance already proved (the other chainable types keep their free re-roll — freight
    // and mining chains are not sector-bound work).
    const next = this._rollOffer(m.type, originInfo, rng, board.refreshEpoch, board.slots.length,
      m.type === 'bounty_hunt'
        ? {
          ...(m.destSectorId ? { sectorLockSectorId: m.destSectorId } : {}),
          ...(Number.isFinite(m.riskTier) ? { maxRiskTier: m.riskTier } : {}),
        }
        : undefined);
    if (next) {
      next.id = `${next.id}_chain`;
      board.slots.push(next);
      this.bus.emit('toast', { text: 'Follow-up contract available', kind: 'info', ttl: 3 });
      this.bus.emit('mission:updated', { missionId: null });
    }
  },

  // =========================================================================================
  // STORY SPINE — 8-beat FSM advanced by first-X triggers (+ credit/net-worth gates).
  // =========================================================================================
  /** A gameplay event happened that may satisfy the current story beat's trigger. */
  _storyTrigger(kind, data) {
    const story = this.state.story;
    if (!story) return;
    this._ensureCampaignSidecar();
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return; // past the end → sandbox

    // Sidecar step/fail recovery observer (never advances beatIndex itself).
    const signal = STORY_SIGNAL_BY_KIND[kind];
    const stepResult = signal
      ? recordBeatStep(this.state, signal, data || {}, deferredEnterNow(this.state) || 0)
      : null;

    // B0 is ordered AND: mining:yield then dock:docked — gate on isBeatStepsComplete.
    if (beat.beat === 0) {
      if (isBeatStepsComplete(this.state, 0)) this._advanceStory(beat);
      return;
    }

    const want = BEAT_TRIGGER[beat.beat];
    if (!want) return;
    // B1–B3 are embodied PQ-152 set pieces and advance in _advanceEmbodiedStoryMission.
    if (beat.beat === 1 || beat.beat === 2 || beat.beat === 3) return;
    // Discrete first-X triggers (B3/B6). B4/B5/B7 handled elsewhere.
    if (want === kind && stepResult && stepResult.ok
        && isBeatStepsComplete(this.state, beat.beat)) {
      this._advanceStory(beat);
    }
  },

  /** Complete B1–B3 only through the authored 47-A set-piece contracts. Sidecar observes first;
   * missions remains the sole cursor and reward authority. */
  _advanceEmbodiedStoryMission(m) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || !m || !m.storyTag) return false;
    const expected = beat.beat === 1 ? CONTRACT_47A_B1_TAG
      : beat.beat === 2 ? CONTRACT_47A_B2_TAG
        : beat.beat === 3 ? CONTRACT_47A_B3_TAG : null;
    if (!expected || m.storyTag !== expected) return false;
    this._ensureCampaignSidecar();
    // Leftover Continue bounty B2: stamp the old force meaning so later leftover stakes stay valid.
    if (beat.beat === 2 && m.type === 'bounty_hunt' && !(m.params && m.params.investigationOutcome)) {
      m.params = m.params || {};
      m.params.investigationStage = 'identified';
      m.params.identifiedBy = 'legacy_wreck_registry';
      m.params.investigationOutcome = 'force';
      story.flags = story.flags || {};
      story.flags.elroy_outcome = 'force';
      story.flags.elroy_outcome_legacy = true;
    }
    // PQ-032.02: the live pod rescue intentionally leaves Elroy unresolved, so absence of an
    // outcome cannot distinguish this save from a legacy one. The embodied_route mark — written
    // only when an authored B1–B3 contract settles without an outcome stamp — is the durable
    // positive evidence B4–B7 classify on. The bounty block above must run first so its legacy
    // stamp keeps the old route classified legacy.
    story.flags = story.flags || {};
    if (!story.flags.elroy_outcome && !story.flags.elroy_outcome_legacy) {
      story.flags.embodied_route = 'rescue';
    }
    const observed = recordBeatStep(this.state, 'mission:completed', {
      missionId: m.id,
      storyTag: m.storyTag,
      storyTargetId: m.storyTarget && m.storyTarget.id || null,
      physicalVerb: m.params && m.params.physicalVerb || beat.headlineVerb || null,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok || !isBeatStepsComplete(this.state, beat.beat)) return false;
    this._advanceStory(beat, { skipCredits: true });
    return true;
  },

  /** B5 branch-chain progress: completing a branch mission ticks chainProgress toward the goal. */
  _advanceStoryChain(m) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 5 || !story.branch) return;
    const wantType = BRANCH_CHAIN_TYPE[story.branch];
    const wantCount = BRANCH_CHAIN_COUNT[story.branch];
    const expectedTag = `campaign47a:b5:${story.branch}:`;
    const route = getEmbodiedLocation(5, story.branch);
    // Exact-route compatibility keeps pre-tag Continue missions viable without restoring the old
    // type-only shortcut: faction, origin, and destination must all match the authored leg.
    const legacyExactRoute = !m.storyTag && route
      && m.factionId === BRANCH_FACTION[story.branch]
      && m.stationId === route.stationId
      && m.destStationId === route.destStationId
      && m.destSectorId === route.destSectorId;
    if (m.type !== wantType || !(m.storyTag && m.storyTag.startsWith(expectedTag)) && !legacyExactRoute) return;
    const nextProgress = (story.chainProgress || 0) + 1;
    // Gate canonical chain progress through the sidecar failure/recovery state first.
    // The sidecar still never advances the live cursor or grants a reward.
    this._ensureCampaignSidecar();
    const observed = recordBeatStep(this.state, 'mission:completed', {
      missionType: m.type,
      branch: story.branch,
      chainProgress: nextProgress,
      physicalVerb: m.params && m.params.physicalVerb || null,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok) return;
    story.chainProgress = nextProgress;
    if (story.chainProgress >= wantCount) {
      story.flags = story.flags || {};
      story.flags.proving_ground_complete = true;
      // The live route has no outcome token — the branch door carries its flavour.
      const outcomeKey = campaign47aOutcomeKey(this.state);
      story.flags.proving_ground_variant = outcomeKey === 'custody' && story.branch === 'patrol'
        ? 'custody_patrol'
        : outcomeKey === 'force' && story.branch === 'traders'
          ? 'force_manifest'
          : `legacy_${story.branch}`;
      story.chainProgress = 0;
      this._advanceStory(beat);
    }
    else {
      this._refreshEmbodiedStoryBoards();
      this._refreshNavigation({ forceStory: true, silent: true });
      this.bus.emit('toast', { text: `Proving Ground: ${story.chainProgress}/${wantCount}`, kind: 'info', ttl: 3 });
    }
  },

  /** B4: accepting a live intro commits the stake; live player routes settle on completion. */
  _maybeSetBranch(inst) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return;
    if (!isStoryBranchIntroOffer(inst, this.state)) return;
    const branch = inst.storyBranch || Object.keys(BRANCH_FACTION).find((b) => BRANCH_FACTION[b] === inst.factionId);
    if (!branch || BRANCH_FACTION[branch] !== inst.factionId || !BRANCH_INTRO_BY_BRANCH.has(branch)) return;
    // PQ-032.02: only an outcome-pinned save is locked to the one stake door. The live
    // route earns its branch by actually finishing whichever introduction it chose;
    // legacy saves keep the instant settle.
    const kind = campaign47aRouteKind(this.state);
    const stake = kind === 'pinned' ? getPickSideStake(story.flags && story.flags.elroy_outcome) : null;
    if (stake && (branch !== stake.branch || inst.factionId !== stake.factionId || inst.type !== stake.type)) return;
    // Sidecar observes/gates the live intro accept before canonical branch/reward mutation.
    this._ensureCampaignSidecar();
    const observed = recordBeatStep(this.state, 'mission:accepted', {
      storyTag: STORY_BRANCH_INTRO_TAG,
      type: inst.type,
      factionId: inst.factionId,
      branch,
      storyBranch: branch,
      physicalVerb: inst.params && inst.params.physicalVerb || null,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok || !isBeatStepsComplete(this.state, 4)) return;
    inst.storyTag = STORY_BRANCH_INTRO_TAG;
    inst.storyBranch = branch;
    if (kind === 'legacy') {
      this._settleContract47aB4Branch(inst, branch, true);
      return;
    }
    story.flags = story.flags || {};
    story.flags.pick_a_side_pending = branch;
    story.flags.pick_a_side_stake = stake ? stake.id : `intro_${branch}`;
    inst.storyStake = story.flags.pick_a_side_stake;
    this._sayStoryLine('Contract accepted. Complete it before the branch settles.', 6);
  },

  _completeContract47aB4Intro(m) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch || !m) return false;
    if (m.storyTag !== STORY_BRANCH_INTRO_TAG || !m.storyBranch) return false;
    if (!story.flags || story.flags.pick_a_side_pending !== m.storyBranch) return false;
    return this._settleContract47aB4Branch(m, m.storyBranch, false);
  },

  _settleContract47aB4Branch(m, branch, legacy) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return false;
    if (!branch || BRANCH_FACTION[branch] !== m.factionId || !BRANCH_INTRO_BY_BRANCH.has(branch)) return false;
    if (!legacy && (!story.flags || story.flags.pick_a_side_pending !== branch)) return false;
    story.branch = branch;
    story.flags = story.flags || {};
    delete story.flags.pick_a_side_pending;
    if (!story.flags.pick_a_side_stake) {
      story.flags.pick_a_side_stake = story.flags.elroy_outcome
        ? getPickSideStake(story.flags.elroy_outcome).id
        : `intro_${branch}`;
    }
    // B4 reward: chosen faction +15, opposing -10 through canonical faction intents.
    this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: 15, reason: 'story_branch' });
    const opposing = branch === 'patrol' ? 'faction_free' : (branch === 'free' ? 'faction_scn' : 'faction_dmc');
    this.bus.emit('faction:repDelta', { factionId: opposing, delta: -10, reason: 'story_branch_opposing' });
    this._advanceStory(beat);
    return true;
  },

  _completeContract47aB7Operation(m) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 7 || !m || story.flags && story.flags.deep_reach_operation_complete) return false;
    if (!String(m.storyTag || '').startsWith('campaign47a:b7:')) return false;
    const assetId = m.params && m.params.assetId;
    if (!assetId || !story.flags || assetId !== story.flags.empire_seed_asset_id) return false;
    const op = getDeepReachOperation(campaign47aOutcomeKey(this.state), story.branch);
    if (m.storyOperation !== op.id || m.type !== op.type) return false;
    story.flags.deep_reach_operation_complete = true;
    story.flags.deep_reach_variant = op.id;
    story.flags.deep_reach_asset_id = assetId;
    this._advanceStory(beat);
    return true;
  },

  /** Credit / net-worth gated beats: show a hint while unmet, advance once met (never hard-block). */
  _checkStoryGates() {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return;
    const credits = this.state.player.credits | 0;
    if (beat.beat === 7) {
      // PQ-032.02: the net-worth/rep gate is the LEGACY endgame. A live-route save reaches
      // the ending through the authored Deep Reach operation, not the old soft lock.
      if (campaign47aRouteKind(this.state) !== 'legacy') return;
      // North star: 100k net worth AND rep>=50 with chosen faction.
      const netWorth = this._netWorth();
      const facRep = story.branch ? this._repOf(BRANCH_FACTION[story.branch]) : this._maxRep();
      if (netWorth >= 100000 && facRep >= 50) this._advanceStory(beat);
    }
    // B3 (long tow) advances through _advanceEmbodiedStoryMission. B6 (deploy asset) still uses
    // the discrete asset_deployed trigger. The precredits is only a soft hint (handled at advance).
  },

  _advanceStory(beat, options = {}) {
    const story = this.state.story;
    if (story.beatIndex !== beat.beat) return; // already advanced
    const fromIndex = story.beatIndex;
    // Grant beat reward (credits + rep + research + unlock flag).
    if (beat.reward) {
      if (beat.reward.credits && !options.skipCredits) this.bus.emit('economy:grantCredits', { amount: beat.reward.credits, reason: `story:${beat.id}` });
      if (beat.reward.rp && !options.skipCredits) {
        // Missions is the sole positive RP writer — beat 0's field sample is the tutorial's
        // first research income (PQ-155 follow-on: closes the first-upgrade canyon).
        const rp = Math.max(0, Math.round(Number(beat.reward.rp) || 0));
        if (rp > 0) {
          this.state.player.researchPoints = (this.state.player.researchPoints || 0) + rp;
          this.bus.emit('research:pointsChanged', {
            researchPoints: this.state.player.researchPoints,
            source: `story:${beat.id}`,
            granted: rp,
          });
        }
      }
      if (beat.reward.rep) {
        const rep = beat.reward.rep;
        if (rep.faction) {
          const fac = rep.faction === 'home' ? HOME_FACTION : rep.faction;
          this.bus.emit('faction:repDelta', { factionId: fac, delta: rep.amount || 0, reason: `story:${beat.id}` });
        }
        // (B4's chosen/opposing handled in _maybeSetBranch so it isn't double-applied here.)
      }
      if (beat.reward.unlock && beat.reward.unlock !== 'module_unlock' && beat.reward.unlock !== 'trade_tutorial'
          && beat.reward.unlock !== 'passive_income' && beat.reward.unlock !== 'newgame_plus') {
        // Mark an unlock flag the player record / ships can read; story:beatAdvanced also signals it.
        story.flags[`unlock_${beat.reward.unlock}`] = true;
      }
    }
    story.flags[`beat_${beat.beat}_done`] = true;
    const toIndex = beat.next != null ? beat.next : story.beatIndex; // null next → stay (sandbox)
    story.beatIndex = beat.next != null ? beat.next : story.beatIndex;
    if (beat.next == null) story.flags.endgame = true;

    this.bus.emit('story:beatAdvanced', { fromIndex, toIndex, branch: story.branch || undefined });
    if (toIndex === 4) this._refreshStoryBranchIntroBoards();
    this._refreshEmbodiedStoryBoards();
    // Sidecar observes canonical advance (clears fail context for new beat; never writes rewards).
    this._syncCampaignSidecarAfterAdvance();
    // Direction toast: tell the player what the NEW current beat wants.
    // NOTE: the sandbox fallback (past B7) deliberately does NOT grant a title. Per
    // ENDGAME-B7-REDESIGN.md, "None of these choices is rewarded with a title." The story system
    // (src/systems/story.js) presents the five endgame choices on the B7 gate; this line is only the
    // spine's terminal state, kept neutral so the endgame overlay owns the disposition.
    const nextBeat = STORY_BEATS[story.beatIndex];
    this._refreshNavigation({ forceStory: true, silent: true });
    const dir = (nextBeat && story.beatIndex !== fromIndex) ? BEAT_HINT[nextBeat.beat] : 'The contracts continue. The count never ends.';
    if (dir) this._sayStoryLine(dir, 6);
    this.bus.emit('mission:updated', { missionId: null });
  },

  /** Lazily attach campaign47a sidecar under state.story (meta only). */
  _ensureCampaignSidecar() {
    const state = this.state;
    if (!state.story) state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    ensureCampaign47aState(state);
  },

  /** Sync observedBeatIndex after missions advances the live spine. */
  _syncCampaignSidecarAfterAdvance() {
    const state = this.state;
    this._ensureCampaignSidecar();
    syncObservedBeat(state, deferredEnterNow(state) || 0);
  },

  /**
   * Story-relevant mission failure → namespaced sidecar fail (no beat advance, no director receipt).
   * Recovery is via dock/reoffer signals through recordBeatStep → recoverEncounter cooldown.
   */
  _recordStoryMissionFailure(m, reason) {
    const story = this.state && this.state.story;
    if (!story) return;
    const bi = story.beatIndex | 0;
    if (bi < 0 || bi > 7) return;
    // B7 is observe-only metadata. Losing the bound seed fails/reposts the physical mission, but
    // must not strand the ending sidecar in a failed state after the replacement is rebound.
    if (bi === 7 && reason === 'seed_asset_lost') return;
    // Relevant when tagged story contract, branch chain, or any active spine beat.
    const tagged = !!(m && (m.storyTag || m.storyBranch));
    const chainType = story.branch ? BRANCH_CHAIN_TYPE[story.branch] : null;
    const onChain = !!(chainType && m && m.type === chainType);
    if (!tagged && !onChain) return;
    this._ensureCampaignSidecar();
    failEncounter(this.state, reason || 'mission_failed', this.state.simTime || 0, {
      encounterId: m && m.id != null ? String(m.id) : null,
    });
    const line = recoveryCommsForBeat(bi);
    if (line) {
      this.bus.emit('comms:popup', {
        sender: line.sender,
        text: line.text,
        category: 'story',
        ttl: 7,
        persist: false,
        id: `${line.id}:${m && m.id || 'mission'}`,
      });
    }
  },

  // =========================================================================================
  // small read helpers
  // =========================================================================================
  _repOf(factionId) {
    const rec = factionId && this.state.factions ? this.state.factions[factionId] : null;
    return rec ? (rec.rep || 0) : 0;
  },
  _maxRep() {
    let m = 0; const f = this.state.factions || {};
    for (const id in f) m = Math.max(m, f[id].rep || 0);
    return m;
  },
  /** Net worth ≈ credits (cheap approximation for the B7 north star; ship/asset value omitted). */
  _netWorth() {
    return this.state.player.credits | 0;
  },
  _sayStoryLine(text, ttl = 6) {
    if (!text) return false;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      const said = voice.say({ channel: 'story', text, kind: 'story', ttl });
      if (said) return true;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', { text, kind: 'story', ttl });
      return true;
    }
    return false;
  },

  _findOffer(missionId) {
    const boards = this.state.missions.boards;
    for (const sid in boards) {
      const b = boards[sid];
      const offer = (b.slots || []).find((o) => o.id === missionId);
      if (offer) return { offer, board: b };
    }
    return { offer: null, board: null };
  },

  // =========================================================================================
  // newGame / save-load (§4.5 — missions + story serialize; live target ids do NOT)
  // =========================================================================================
  _installThreadBFragment() {
    const state = this.state;
    if (!state || !state.player || !state.player.cargo) return;
    state.story = state.story || {};
    const locked = state.story.persistentCargo || (state.story.persistentCargo = []);
    if (!locked.includes(THREAD_B_FRAGMENT_ID)) locked.push(THREAD_B_FRAGMENT_ID);
    const have = Number(state.player.cargo.items && state.player.cargo.items[THREAD_B_FRAGMENT_ID]) || 0;
    if (have < 1) addCargo(state, THREAD_B_FRAGMENT_ID, 1);
  },

  _withdrawContract47aColdStartForCrucible() {
    const missions = this.state && this.state.missions;
    if (!missions || !Array.isArray(missions.active)) return false;
    const idx = missions.active.findIndex((m) => m && m.storyTag === CONTRACT_47A_B0_TAG
      && !(m.params && m.params.sampleRecovered));
    if (idx < 0) return false;
    const mission = missions.active[idx];
    this._clearMissionNav(mission.id);
    missions.active.splice(idx, 1);
    if (this.state.ui && this.state.ui.trackedMissionId === mission.id) this.state.ui.trackedMissionId = null;
    this.bus.emit('mission:updated', { missionId: mission.id, tracked: false, source: 'crucible:launch' });
    return true;
  },

  _installContract47aColdStart() {
    if ((this.state.missions.active || []).some((m) => m && m.storyTag === CONTRACT_47A_B0_TAG)) return;
    const offer = {
      id: 'contract_47a_b0_recovery',
      type: 'salvage_retrieval',
      stationId: 'station_helios',
      factionId: null,
      params: {
        cmdtyId: CONTRACT_47A_SAMPLE_ID,
        qty: 1,
        sampleRecovered: false,
        samplePos: null,
        massAcceptT: CONTRACT_47A_B0_BODY.massAcceptT,
        massDeliverT: CONTRACT_47A_B0_BODY.massDeliverT,
        authorization: CONTRACT_47A_B0_BODY.authorization,
        code: CONTRACT_47A_B0_BODY.code,
        contractId: CONTRACT_47A_B0_BODY.contractId,
      },
      reward_cr: 0,
      collateral_cr: 0,
      riskTier: 0,
      destStationId: 'station_helios',
      destSectorId: 'sector_helios_prime',
      distance: 600,
      storyTag: CONTRACT_47A_B0_TAG,
      campaign47aBeat: 0,
      title: CONTRACT_47A_B0_BODY.title,
      summary: CONTRACT_47A_B0_BODY.summary,
      description: CONTRACT_47A_B0_BODY.fullText,
      authorization: CONTRACT_47A_B0_BODY.authorization,
    };
    const mission = this._instanceFromOffer(offer);
    mission.chainNextSeed = null;
    mission.description = CONTRACT_47A_B0_BODY.fullText;
    mission.authorization = CONTRACT_47A_B0_BODY.authorization;
    this.state.missions.active.push(mission);
    this.state.ui = this.state.ui || {};
    this.state.ui.trackedMissionId = mission.id;
    // Track the cold-start contract, but leave nav free while the staged tutorial owns the opening
    // waypoint (onboarding builds markerId/onboarding:true). After tutorial:finished, release
    // restores mission/story navigation ownership.
    if (!this._tutorialOwnsOpening()) this._refreshTrackedMissionNav(mission);
    this.bus.emit('mission:updated', { missionId: mission.id, tracked: true, source: CONTRACT_47A_B0_TAG });
  },

  _activateContract47aB1OnDeparture() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 1) return false;
    const active = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B1_TAG);
    if (active) {
      this.trackMission(active.id, { silent: true });
      return true;
    }
    const board = this.ensureBoard('station_helios');
    const offer = board && board.slots && board.slots.find((row) => row && row.storyTag === CONTRACT_47A_B1_TAG);
    if (!offer) return false;
    return this.acceptMission(offer.id);
  },

  _activateContract47aB2OnDeparture() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 2) return false;
    const active = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B2_TAG);
    if (active) {
      this.trackMission(active.id, { silent: true });
      return true;
    }
    const board = this.ensureBoard('station_tethys');
    const offer = board && board.slots && board.slots.find((row) => row && row.storyTag === CONTRACT_47A_B2_TAG);
    if (!offer) return false;
    return this.acceptMission(offer.id);
  },

  _activateContract47aB3OnDeparture() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 3) return false;
    const active = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B3_TAG);
    if (active) {
      this.trackMission(active.id, { silent: true });
      return true;
    }
    const board = this.ensureBoard('station_tethys');
    const offer = board && board.slots && board.slots.find((row) => row && row.storyTag === CONTRACT_47A_B3_TAG);
    if (!offer) return false;
    return this.acceptMission(offer.id);
  },

  newGame() {
    this._racingOpponents?.stop('new_game');
    this._racingSetPieces?.stop('new_game');
    resetRacingGhostSession(this.state);
    const state = this.state;
    state.missions.boards = {};
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    delete state.missions.blackFlagJobs;
    delete state.missions.redKiteFirstReward;
    delete state.missions.ilexArkReward;
    delete state.missions.setPieceSettlements;
    delete state.missions.adventureSpeedCompleted;
    delete state.missions.standingOrders;
    delete state.missions.captainOrderCycles;
    state.missions.nextId = 1;
    state.missions.config = MISSION_TUNING;
    // Clear story spine + any prior campaign47a sidecar (nested under state.story).
    state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0, persistentCargo: [] };
    initCampaignSidecar(state, state.simTime || 0);
    this._installThreadBFragment();
    this._installContract47aColdStart();
    this._spawnSeq = 0;
    if (this._missionBudgetDeferrals) this._missionBudgetDeferrals.clear();
    this._nextMissionSpawnRetryTick = 0;
    this._navRefreshT = 0;
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;
    // Session latch — the dock:undocked clear never runs across a quit-while-docked New Game.
    this._lastDockedStation = null;
    const tutorialOwnsOpening = this._tutorialOwnsOpening();
    if (!tutorialOwnsOpening) {
      this._refreshNavigation({ forceStory: true, silent: true });
    }
    // Direction toast for the opening beat (guard against the double newGame call: save.newGame()
    // then game:started both fire it → only toast once).
    const toastKey = state.meta && state.meta.seed;
    if (this._newGameToastSeed !== toastKey) {
      this._newGameToastSeed = toastKey;
      const b0 = STORY_BEATS[state.story.beatIndex];
      if (!tutorialOwnsOpening && b0 && BEAT_HINT[b0.beat]) this._sayStoryLine(BEAT_HINT[b0.beat], 6);
    }
  },

  _tutorialOwnsOpening() {
    const gameplay = this.state && this.state.settings && this.state.settings.gameplay;
    if (gameplay && gameplay.tutorialHints === false) return false;
    const ob = this.state && this.state.onboarding;
    return !ob || (ob.active && !ob.finished) || ob.finished === false;
  },

  // The mission log prints "15m left" from deadline_s - simTime. Parking already
  // takes the row off the expiry walk. Shift the deadline with simTime so that
  // window does not shrink, and does not expire, while the swarm match is the screen.
  _holdParkedContractClocks(state) {
    const parked = state && state.missions && state.missions._swarmParkedActive;
    if (!Array.isArray(parked)) return;
    const now = Number(state.simTime);
    if (!Number.isFinite(now)) return;
    for (const mission of parked) {
      if (!mission || !Number.isFinite(Number(mission.deadline_s))) continue;
      if (!Number.isFinite(mission._swarmClockParkedAt)) {
        mission._swarmClockParkedAt = now;
        mission._swarmClockDeadline = mission.deadline_s;
      }
      mission.deadline_s = mission._swarmClockDeadline + (now - mission._swarmClockParkedAt);
    }
  },

  // A Crucible run boots a full Helios game, so the starter contract would stay tracked
  // and, once untracked, the corridor idle objective would say "Dock at Helios Station".
  // Park the live list and clear both waypoint kinds. The mission status stays active.
  // Restore when the match is over, including a quit straight to the menu (run phase
  // inactive). Idempotent: missions.update calls this every tick.
  // The HUD's next owner after this is the story beat ("choose the next story action").
  // Hiding that line, and the RADIO / COMMS / HAIL tape, is the crucible-focus stylesheet.
  _releaseCampaignNavForSwarm(state = this.state) {
    const bag = state && state.missions;
    if (!crucibleScreenIsLive(state)) {
      if (bag && Array.isArray(bag._swarmParkedActive)) {
        this._holdParkedContractClocks(state);
        const parked = bag._swarmParkedActive;
        bag._swarmParkedActive = null;
        if (!Array.isArray(bag.active)) bag.active = [];
        for (const mission of parked) {
          if (!mission) continue;
          delete mission._swarmClockParkedAt;
          delete mission._swarmClockDeadline;
          if (!bag.active.includes(mission)) bag.active.push(mission);
        }
      }
      return false;
    }
    if (state.ui && state.ui.trackedMissionId) state.ui.trackedMissionId = null;
    const nav = state.nav;
    const wp = nav && nav.waypoint;
    if (wp && (wp.kind === 'mission' || wp.kind === 'corridor')) {
      nav.waypoint = null;
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('nav:waypoint', null);
    }
    if (bag && Array.isArray(bag.active) && bag.active.length) {
      if (!Array.isArray(bag._swarmParkedActive)) bag._swarmParkedActive = [];
      for (const mission of bag.active) {
        if (mission && !bag._swarmParkedActive.includes(mission)) bag._swarmParkedActive.push(mission);
      }
      bag.active = [];
    }
    this._holdParkedContractClocks(state);
    return true;
  },

  /** True only while the staged tutorial is actively teaching — not the pre-init / unfinished-flag
   *  breadth of _tutorialOwnsOpening. Used to suppress mission/story nav claims without breaking
   *  headless harnesses that never materialize an onboarding subtree. */
  _onboardingOwnsOpeningNav() {
    const gameplay = this.state && this.state.settings && this.state.settings.gameplay;
    if (gameplay && gameplay.tutorialHints === false) return false;
    const ob = this.state && this.state.onboarding;
    // Once B4's authored delivery is accepted, that physical mission must own its route. The
    // tutorial remains active only to await completion and present B5; keeping the Helios marker
    // here would strand the player at the origin with a tracked job pointing nowhere.
    return !!(ob && ob.active && !ob.finished && !ob.recommendedMissionId);
  },

  serialize() {
    const m = this.state.missions;
    // A live swarm parks the campaign off `active`. Snapshot the parked list so a
    // mid-run save does not drop the contract. The key stays `active`.
    const source = Array.isArray(m._swarmParkedActive) && m._swarmParkedActive.length
      ? m._swarmParkedActive
      : (m.active || []);
    // Strip transient runtime fields (entity ids) from active missions.
    const active = source.map((a) => {
      if (a.params?.cleanCylinder) this._snapshotCleanCylinder(a);
      if (a.params?.workingBattlefield) snapshotWorkingBattlefield(this, a);
      const { targetEntityIds, _escorteeId, _escorteeSectorId, _escorteeArrived, _crewEntityIds, _swarmClockParkedAt, _swarmClockDeadline, ...rest } = a;
      const row = { ...rest, targetEntityIds: [], needsTargets: a.needsTargets };
      // PQ-019C: canonical, order-stable snapshot of the heist subrecord. It rides INSIDE the active
      // entry this owner already serializes, so there is no new top-level save key and no schema
      // bump. Live entity ids inside it are transient and are dropped on restore, not here.
      if (a.heist) row.heist = heistMissionRuntime.serialize(a.heist);
      // SF-143: same inside-the-active-entry precedent — durable manifest ledger, no new save key.
      if (a.counterweight) row.counterweight = counterweightRuntime.serialize(a.counterweight);
      return row;
    });
    const serialized = {
      boards: m.boards, active, completedLog: m.completedLog, receipts: normalizeMissionReceipts(m.receipts),
      nextId: m.nextId, config: m.config || MISSION_TUNING,
      story: this.state.story,
    };
    if (m.blackFlagJobs) serialized.blackFlagJobs = normalizeBlackFlagJobs(m.blackFlagJobs);
    if (m.redKiteFirstReward) serialized.redKiteFirstReward = { ...m.redKiteFirstReward };
    if (m.ilexArkReward) serialized.ilexArkReward = { ...m.ilexArkReward, deliveredVaultIds: [...m.ilexArkReward.deliveredVaultIds] };
    if (m.starterJobStep && Object.keys(m.starterJobStep).length) {
      serialized.starterJobStep = { ...m.starterJobStep };
    }
    if (m.adventureSpeedCompleted && Object.keys(m.adventureSpeedCompleted).length) {
      serialized.adventureSpeedCompleted = { ...m.adventureSpeedCompleted };
    }
    const setPieceSettlements = normalizeSetPieceSettlements(m.setPieceSettlements, m.receipts);
    if (Object.keys(setPieceSettlements).length) serialized.setPieceSettlements = setPieceSettlements;
    // PB-MIS-E: the retired yard-contract ledger. Preserves absence like setPieceSettlements —
    // materializing an empty key only after reload would change sim hashes.
    if (m.yardContracts && Object.keys(m.yardContracts).length) {
      serialized.yardContracts = { ...m.yardContracts };
    }
    // Optional extension state must preserve absence for reduced headless registries that do not
    // register careerContracts; materializing a null key only after reload changes sim hashes.
    if (m.careerContracts) {
      serialized.careerContracts = JSON.parse(JSON.stringify(m.careerContracts));
    }
    if (m.postEndingReplay) {
      serialized.postEndingReplay = JSON.parse(JSON.stringify(m.postEndingReplay));
    }
    if (m.standingOrders?.length) serialized.standingOrders = normalizeStandingOrders(m.standingOrders);
    if (m.captainOrderCycles) serialized.captainOrderCycles = JSON.parse(JSON.stringify(m.captainOrderCycles));
    // RC-34: the dead-mark graveyard ledger. Preserves absence like yardContracts — an empty
    // ledger rolls identically to none, so only a live ledger reaches the save payload.
    if (Array.isArray(m.killedMarkNames) && m.killedMarkNames.length) {
      serialized.killedMarkNames = [...m.killedMarkNames];
    }
    return serialized;
  },

  deserialize(data) {
    for (const _ of this.deserializeChunked(data)) { /* sync lane: every batch inline */ }
  },

  // Generator twin so the async restore lane can paint between boards/active sections — a
  // long campaign's boards + active list is the heaviest ledger left on this stretch. Yields
  // sit only at section boundaries; per-row heist restore keeps the sync lane's order, so the
  // run stays bit-identical.
  *deserializeChunked(data) {
    this._racingOpponents?.stop('load');
    this._racingSetPieces?.stop('load');
    resetRacingGhostSession(this.state);
    if (!data) return;
    const state = this.state;
    state.missions.boards = data.boards || {};
    state.missions.completedLog = data.completedLog || [];
    state.missions.receipts = normalizeMissionReceipts(data.receipts);
    const blackFlagJobs = normalizeBlackFlagJobs(data.blackFlagJobs);
    if (blackFlagJobs) state.missions.blackFlagJobs = blackFlagJobs;
    else delete state.missions.blackFlagJobs;
    const speedCompleted = {};
    for (const definition of ADVENTURE_SPEED_CONTRACTS) {
      if (data.adventureSpeedCompleted?.[definition.id] === true) speedCompleted[definition.id] = true;
    }
    if (Object.keys(speedCompleted).length) state.missions.adventureSpeedCompleted = speedCompleted;
    else delete state.missions.adventureSpeedCompleted;
    const relay = data.redKiteFirstReward;
    if (relay && relay.courseVersion === RED_KITE.courseVersion
      && typeof relay.receiptId === 'string' && relay.receiptId.startsWith(`${RED_KITE.courseId}:run:`)
      && Number.isInteger(relay.creditedCr) && relay.creditedCr >= 0 && relay.creditedCr <= RED_KITE.firstRewardCr
      && Number.isFinite(relay.at) && relay.at >= 0) state.missions.redKiteFirstReward = { ...relay };
    else delete state.missions.redKiteFirstReward;
    const arkReward = data.ilexArkReward;
    if (arkReward && arkReward.receiptId === 'ilex:seed-ark:v1:outcome'
      && Array.isArray(arkReward.deliveredVaultIds) && arkReward.deliveredVaultIds.length <= 6
      && new Set(arkReward.deliveredVaultIds).size === arkReward.deliveredVaultIds.length
      && arkReward.deliveredVaultIds.every(id => /^vault_[1-6]$/.test(id))
      && Number.isInteger(arkReward.creditedCr) && arkReward.creditedCr >= 0 && arkReward.creditedCr <= 3000
      && Number.isFinite(arkReward.at) && arkReward.at >= 0) {
      state.missions.ilexArkReward = { ...arkReward, deliveredVaultIds: [...arkReward.deliveredVaultIds] };
    } else delete state.missions.ilexArkReward;
    const setPieceSettlements = normalizeSetPieceSettlements(data.setPieceSettlements, state.missions.receipts);
    if (Object.keys(setPieceSettlements).length) state.missions.setPieceSettlements = setPieceSettlements;
    else delete state.missions.setPieceSettlements;
    if (data.yardContracts && typeof data.yardContracts === 'object') {
      state.missions.yardContracts = { ...data.yardContracts };
    } else {
      delete state.missions.yardContracts;
    }
    if (data.starterJobStep && typeof data.starterJobStep === 'object' && !Array.isArray(data.starterJobStep)) {
      state.missions.starterJobStep = { ...data.starterJobStep };
    } else {
      delete state.missions.starterJobStep;
    }
    state.missions.nextId = data.nextId || 1;
    const standingOrders = normalizeStandingOrders(data.standingOrders);
    if (standingOrders.length) state.missions.standingOrders = standingOrders;
    else delete state.missions.standingOrders;
    if (data.captainOrderCycles && typeof data.captainOrderCycles === 'object' && !Array.isArray(data.captainOrderCycles)) {
      state.missions.captainOrderCycles = Object.fromEntries(Object.entries(data.captainOrderCycles).slice(-24)
        .map(([id, row]) => [id, { cycle: Math.max(0, Math.floor(Number(row?.cycle) || 0)),
          dueAtS: Math.max(0, Number(row?.dueAtS) || 0) }]));
    } else delete state.missions.captainOrderCycles;
    state.missions.config = data.config || MISSION_TUNING;
    if (Object.prototype.hasOwnProperty.call(data, 'careerContracts')) {
      state.missions.careerContracts = data.careerContracts
        ? JSON.parse(JSON.stringify(data.careerContracts)) : null;
    } else {
      delete state.missions.careerContracts;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'postEndingReplay')) {
      state.missions.postEndingReplay = data.postEndingReplay
        ? JSON.parse(JSON.stringify(data.postEndingReplay)) : null;
    } else {
      delete state.missions.postEndingReplay;
    }
    // RC-34: restore the graveyard so a killed board_writ mark stays undealt after a reload.
    // Absent on legacy saves — the ledger is minted lazily on the next mark death.
    if (Array.isArray(data.killedMarkNames) && data.killedMarkNames.length) {
      state.missions.killedMarkNames = [...data.killedMarkNames];
    } else {
      delete state.missions.killedMarkNames;
    }
    yield 'missions-scalars';
    // Stale-target GC: clear live entity ids; targets re-spawn when the player (re-)enters the sector.
    const heistRestoreTick = state.tick | 0;
    const restoredActive = [];
    for (const a of data.active || []) {
      const row = {
        ...a, targetEntityIds: [], _escorteeId: null, _escorteeArrived: false,
        status: a.status || 'active',
      };
      // PQ-019C: rebuild the arbiter and reconcile against a world that does not remember the
      // capsule. `state.heistFacilities` and `state.lawSecurity` are NOT in the save capture plan
      // (PQ-019B §4) and the capsule is a transient entity, so after a load there is no schedule, no
      // capsule and no custody record. The rule is explicit in heistMissionRuntime.restore: resume a
      // decided receipt, re-request a never-launched schedule, and otherwise reach
      // `unresolved_absent`. Never fabricate a capsule and never fabricate a payout.
      if (a && a.heist) row.heist = heistMissionRuntime.restore(a.heist, { tick: heistRestoreTick });
      // SF-143: the yard watch restores its durable ledger, drops live entity/session flags, and
      // re-arms the scene through requestCounterweightScene on its next drive — the persistent
      // bodies are re-linked by stableId, never doubled.
      if (a && a.counterweight) {
        row.counterweight = counterweightRuntime.restore(a.counterweight, { tick: heistRestoreTick });
      }
      restoredActive.push(row);
      if (restoredActive.length % 8 === 0) yield 'missions-active-batch';
    }
    state.missions.active = restoredActive;
    if (data.story) state.story = data.story;
    // Sidecar lives inside already-serialized state.story — migrate/init without save schema change.
    ensureCampaign47aState(state);
    syncObservedBeat(state, state.simTime || 0);
    // Drop active missions whose destination no longer resolves (soft-lock guard).
    state.missions.active = state.missions.active.filter((m) => {
      // A settled row (a ghost a pre-fix throw left between the status flip and the removal)
      // has already paid and reported; it must not keep a mission slot across a reload.
      if (m.status !== 'active') return false;
      if (m.destStationId && !STATION_INFO.get(m.destStationId) && m.destStationId !== m.stationId) {
        // unresolved dest station — but sector-only objectives still fine; keep if sector resolves
        return !!SECTOR_BY_ID.get(m.destSectorId);
      }
      return true;
    });
    this._refreshNavigation({ forceStory: true, silent: true });
  },
};
