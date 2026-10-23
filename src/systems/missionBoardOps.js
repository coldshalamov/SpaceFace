// Row 413 extraction — methods moved verbatim out of missions.js;
// spread back onto the missions object, so `this` still binds to the system at call time.
import { deferredEnterNow } from '../core/sectorEnterDefer.js';
import { POI_CAUSAL_BOARD_CAP, validatePoiCausalOffer } from '../missions/poiCausalOffers.js';
import { QUIET_PASSAGE, buildQuietPassageOffer } from '../data/heatLure.js';
import { WARM_CARGO_CONTRACT, isShortageGateRepair } from '../data/economyContractTemplates.js';
import { CLEAN_CYLINDER, buildCleanCylinderOffer } from '../data/cleanCylinder.js';
import { hash32 } from '../core/rng.js';
import { deliveryQuote } from '../physicalCargo/breakaway/payloadMath.js';
import { adventureSpeedOffersForStation } from '../data/adventureSpeedContracts.js';
import { endgamePullsUnlocked } from '../data/postEndingReplayChains.js';
import { economicRiskTier, offerMixForTier, priceProceduralOffer, standingWorkTier } from '../economy/economyMissionTerms.js';
import { attachTrap, referenceTrapRefusal, seedHeliosOfferTrap } from './moralTrap.js';
import { rankFromRep } from './factions.js';
import { stationBerthAdmits } from '../data/frontierRumors.js';
import { effectiveDangerTierFor } from './sectorSim.js';
import { dangerTier } from '../data/sectors.js';
import { rollBountyMark } from '../data/bountyMarks.js';
import { isFragileCommodity } from './fragileCargo.js';
import { towClassMassFor } from './shipCapabilities.js';
import { customsWeirForSector } from '../world/customsWeir.js';
import { ALL_STATIONS, BRANCH_INTRO_BY_FACTION, BULK_HAUL_FEE, BULK_HAUL_MIN_MASS_U, BULK_HAUL_PAY_MULT, BULK_HAUL_TYPE, CMDTY_BY_ID, CONTRABAND_CMDTYS, LEGAL_TRADE_CMDTYS, MINEABLE_CMDTYS, ONBOARDING_CHOICE_LOOPS, ONBOARDING_CHOICE_SOURCE, POSTED_BOARD_SOURCE, SECTOR_BY_ID, SIZE_TIER, STATION_INFO, TYPE_BY_ID, TYPE_ORDER, campaign47aOutcomeKey, campaign47aRouteKind, cargoFootprint, clamp, completedEndgamePull, isCapitalBossMission, isCompetingStarvedRow, isFingerprintBoardSource, missionOfferMinRep, missions, mulberryLocal, passengerIdentityFor, round, sectorDistanceWu, setPieceUpfrontCost, stampAuthoredTwist, stampCapitalBossTwist, stationInfoFor, withClauseBriefSuffix } from './missions.js';
import { AUTHORED_SET_PIECES, AUTHORED_SET_PIECE_SOURCE, AUTHORED_SET_PIECE_TYPE, CAPITAL_BOSS, CAPITAL_BOSSES, CAPITAL_BOSS_SOURCE, CAPITAL_BOSS_TYPE, MEGA_HEISTS, MEGA_HEIST_SOURCE, MISSION_TUNING, MISSION_TYPE_PHYSICAL_VERB, ONE_LOAD_CARGO_TYPES, PHYSICAL_MISSION_VARIANTS, RANK_CONTRACT_BY_FACTION, RANK_CONTRACT_SOURCE, SET_PIECE_MISSIONS, STORY_BRANCH_INTRO_TAG, buildAuthoredSetPieceOffer, buildCapitalBossOffer, buildMegaHeistOffer, hasContractsDesk, missionStandingGateForMinRep, offerHistoryMultiplier, offerHistoryTierFor, physicalMissionVariantFor, withBountyHeadMoney } from '../data/missions.js';
import { LANDMARK_QUEST_SOURCE, validateLandmarkQuestOffer } from '../data/landmarkMissions.js';
import { SET_PIECE_MISSION_SOURCE, buildSetPieceMissionOffers } from './setPieceMissionOffers.js';
import { SET_PIECE_FOLLOW_ON_SOURCE } from '../data/sandboxSetPieceFollowOns.js';
import { BREAKAWAY_RECOVERY_TYPE, COUNTERWEIGHT_WATCH_TYPE, PQ019C_HEIST_STATION_ID, PQ019C_HEIST_TYPE, buildBreakawayOffer, buildCounterweightOffer, buildHeistOffer, heistMissionPolicy } from '../data/heistMission.js';
import { QUIET_BERTH_TYPE, SPLIT_MANIFEST_TYPE, YARD_BOARD_STATION_ID, YARD_WORK_SOURCE, buildQuietBerthOffer, buildSplitManifestOffer } from '../data/yardContracts.js';
import { syncWakeHandoffOffer } from './wakeHandoffRuntime.js';
import { attachClauses, attachConditions } from './contractClauses.js';
import { counterweightRuntime, heistMissionRuntime } from '../missions/heistMissionRuntime.js';
import { buildEndgameBoardOffers, buildMissionBoardContract, getPickSideStake } from '../story/campaign47a/index.js';
import { activeOwnedShip, nextStarterStep } from '../data/starterJobs.js';
import { raceCourseForSector } from '../data/raceCourses.js';
import { attachTwistClauses, isMissionConditionRow, missionConditionById, serializableMissionCondition } from '../data/missionConditions.js';
import { syncCaptainStandingOrders } from './captainStandingOrders.js';
import { syncColdburnBid } from './coldburnRey.js';
import { dedupWarn } from '../core/warnDedup.js';
import { sayHeistCue } from '../missions/heistMissionRuntime.js';
import { offerMixWeight } from '../data/missions.js';
import { setPieceCauseOf } from './missions.js';

export const missionBoardOps = {
  // =========================================================================================
  // BOARD GENERATION (deterministic, stable within an epoch)
  // =========================================================================================
  /** Current refresh epoch for the world clock (shared across stations — they roll independently
   *  via the per-station hash, but all advance on the same cadence). */
  _epoch() {
    const cfg = this.state.missions.config || MISSION_TUNING;
    return Math.floor((deferredEnterNow(this.state) || 0) / (cfg.refreshSec || 600));
  },

  /** Build (or refresh) a station's board iff missing or its epoch advanced. Stable within an epoch
   *  so accepted/expired offers don't reappear mid-visit. */
  ensureBoard(stationId) {
    const state = this.state;
    const info = stationInfoFor(state, stationId);
    if (!info) return null; // gates / unknown stations have no board
    const epoch = this._epoch();
    let board = state.missions.boards[stationId];
    if (board && board.refreshEpoch === epoch && board.slots && !this._boardNeedsStoryBranchIntro(info, board)) {
      const storyChanged = this._syncEmbodiedStoryOffer(info, board, epoch);
      const setPieceChanged = this._syncSetPieceOpeningOffers(info, board, epoch);
      const heistChanged = this._syncHeistOffer(info, board, epoch);
      const breakawayChanged = this._syncBreakawayOffer(info, board, epoch);
      const counterweightChanged = this._syncCounterweightOffer(info, board, epoch);
      const yardChanged = this._syncYardContractOffers(info, board, epoch);
      const cylinderChanged = this._syncCleanCylinderOffer(info, board);
      const warmCargoChanged = this._syncWarmCargoOffer(info, board);
      const quietPassageChanged = this._syncQuietPassageOffer(info, board);
      this._syncWakeHandoffOffer(info, board);
      const authoredChanged = this._syncAuthoredSetPieceOffers(info, board, epoch);
      const megaHeistChanged = this._syncMegaHeistOffers(info, board, epoch);
      const capitalChanged = this._syncCapitalBossOffer(info, board, epoch);
      const speedChanged = this._syncAdventureSpeedOffers(info, board);
      const shortageChanged = this._syncShortageOffers(board);
      const starterChanged = this._syncStarterJobOffer(info, board);
      const rankContractChanged = this._syncRankContractOffer(info, board, epoch);
      const captainChanged = syncCaptainStandingOrders(this, info, board);
      const reyChanged = syncColdburnBid(this, info, board);
      if (storyChanged || setPieceChanged || heistChanged || breakawayChanged
        || counterweightChanged || yardChanged || cylinderChanged || warmCargoChanged || quietPassageChanged || authoredChanged || megaHeistChanged || capitalChanged || speedChanged || shortageChanged || starterChanged || rankContractChanged || captainChanged || reyChanged) {
        this.bus.emit('mission:updated', { missionId: null, stationId });
      }
      return board;
    }
    // External causal POI leads are durable player-earned rows, not epoch rerolls. Carry their
    // still-valid identities through an ordinary board refresh while keeping the source bounded.
    const previousSlots = board && Array.isArray(board.slots) ? board.slots : [];
    const retainedPoiOffers = previousSlots.filter((offer) => offer && offer.source === 'poiBehavior'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch))
      .slice(0, POI_CAUSAL_BOARD_CAP);
    // Landmark surveys are player-earned authored work, not an epoch reroll. Keep only the current
    // validated shape so a stale/corrupt saved offer cannot survive a board refresh.
    const retainedLandmarkOffers = previousSlots.filter((offer) => (
      offer && offer.source === LANDMARK_QUEST_SOURCE && validateLandmarkQuestOffer(offer)
    ));
    // An in-flight set-piece chain is authored progress, not an expiring procedural roll. Preserve
    // every sibling/recovery row through board refresh; its cause is the save-safe chain cursor.
    const retainedSetPieceOffers = previousSlots.filter((offer) => (
      offer && offer.source === SET_PIECE_MISSION_SOURCE && setPieceCauseOf(offer)
    ));
    // G06 first-trade teach offer is once-per-run authored progress — keep it through epoch refresh
    // until accepted or expired so ensureBoard cannot swallow the corridor lesson.
    const retainedFirstTradeOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'firstTradeContract'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    )).slice(0, 1);
    // Ghost-convoy lane bounties are once-per-run authored progress minted from real lane losses:
    // the news line told the player exactly which station holds this row, so a board refresh must
    // not swallow it (the ledger never re-fires a lane, so a dropped row kills the arc for the save).
    const retainedGhostConvoyOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'ghostConvoyRumor'
    )).slice(0, 1);
    // One salvage contract minted from a completed cargo-kill sale. The news line names this
    // station, so a board refresh must not drop the row before the player can take it.
    const retainedCargoKillOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'cargoKillChain'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    )).slice(0, 1);
    // Wreck-communicator contracts are discovery progress, not an epoch reroll: the player found
    // the signal, so the row survives refresh until it is accepted. Stable point-derived ids
    // keep the ingest dedupe honest; settle receipts still block a completed offer's replay.
    // No slice cap: salvage._offerFromPoint is one-shot (point.offered), so a dropped row can
    // never re-emit — capping retention deletes authored discovery work for the save.
    const retainedSalvageOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'salvage'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    ));
    // Ecology site offers are emitted once and then offersEmitted stays set forever — they
    // cannot re-emit, so retention is the only place the contract lives. No slice cap: a
    // multi-desk site (Ashfall Reach carries nine authored rows, Charon seven) posts them all
    // to one station, and any cap silently deletes the excess authored work (D132).
    const retainedEcologyOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'ecology'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    ));
    // B7 follow-ons are the contract the set piece just became. A refresh must not
    // eat them before the player can take the salvage, the escape, or the tow.
    const retainedSetPieceFollowOns = previousSlots.filter((offer) => (
      offer && offer.source === SET_PIECE_FOLLOW_ON_SOURCE
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    )).slice(0, 4);
    // B5's three authored choices are tutorial progress, not disposable procedural rows. Keep them
    // together through an epoch refresh until the player accepts one; acceptMission withdraws the
    // two unchosen siblings atomically before publishing mission:accepted.
    const retainedOnboardingChoices = previousSlots.filter((offer) => (
      offer && offer.source === ONBOARDING_CHOICE_SOURCE
      && state.onboarding && state.onboarding.active && !state.onboarding.finished
    )).slice(0, ONBOARDING_CHOICE_LOOPS.length);
    // PQ-019C: an authored heist row (standing contract or its one reduced-stake recovery) is
    // authored progress, not a procedural roll. Carry it through an epoch refresh; _syncHeistOffer
    // re-posts the standing row only when none is present, so a pending recovery is never replaced.
    const retainedHeistOffers = previousSlots.filter((offer) => (
      offer && offer.type === PQ019C_HEIST_TYPE
    )).slice(0, 1);
    // BREAKAWAY: the standing Third Shift row is authored progress for the same reason.
    const retainedBreakawayOffers = previousSlots.filter((offer) => (
      offer && offer.type === BREAKAWAY_RECOVERY_TYPE
    )).slice(0, 1);
    // SF-143: the standing Counterweight Watch row is authored progress the same way.
    const retainedCounterweightOffers = previousSlots.filter((offer) => (
      offer && offer.type === COUNTERWEIGHT_WATCH_TYPE
    )).slice(0, 1);
    // PB-MIS-E: the two Forge yard rows are authored work kept through refresh while un-settled —
    // `_syncYardContractOffers` decides re-post by the durable yardContracts ledger, not epoch.
    const retainedYardOffers = previousSlots.filter((offer) => (
      offer && offer.source === YARD_WORK_SOURCE
    ));
    const retainedAuthoredSetPieces = previousSlots.filter((offer) => (
      offer && offer.source === AUTHORED_SET_PIECE_SOURCE
    ));
    const retainedMegaHeists = previousSlots.filter((offer) => (
      offer && offer.source === MEGA_HEIST_SOURCE
      && !completedEndgamePull(state, offer.params && offer.params.megaHeistId)
    ));
    const retainedCapitalBoss = previousSlots.filter((offer) => (
      offer && offer.source === CAPITAL_BOSS_SOURCE
      && !completedEndgamePull(state, offer.params && offer.params.capitalBossId)
    ));
    // postBoardOffer rows are posted authored work kept until accepted — same
    // class as the other player-earned retentions; acceptMission withdraws them.
    const retainedPostedOffers = previousSlots.filter((offer) => (
      offer && [POSTED_BOARD_SOURCE, 'mercyService', 'wreckCourt'].includes(offer.source)
    ));
    board = {
      refreshEpoch: epoch,
      slots: [
        ...retainedOnboardingChoices,
        ...retainedFirstTradeOffers,
        ...retainedSetPieceOffers,
        ...retainedPoiOffers,
        ...retainedLandmarkOffers,
        // A deskless outpost in a fuel-less sector rolls no procedural work — "few questions"
        // is the fiction and a generated desk you cannot leave is the trap the fuel contract
        // names. Earned and authored rows still post: a filed reading is not desk work.
        ...(info.desklessOutpost ? [] : this._generateOffers(info, epoch)),
        // Retained at the very END, after generation, for the same reason `_syncHeistOffer` appends.
        // `_generateOffers` puts the B4 branch-intro contract at the head of what it returns, and
        // check:mission-standing-ladder asserts a branch station leads with that tagged intro both
        // on a fresh board and on a same-epoch cached board after story advancement. Any retained
        // row placed before the generated block pushes the intro off the head.
        ...retainedHeistOffers,
        ...retainedBreakawayOffers,
        ...retainedCounterweightOffers,
        ...retainedYardOffers,
        ...retainedAuthoredSetPieces,
        ...retainedMegaHeists,
        ...retainedCapitalBoss,
        ...retainedGhostConvoyOffers,
        ...retainedCargoKillOffers,
        ...retainedSalvageOffers,
        ...retainedEcologyOffers,
        ...retainedSetPieceFollowOns,
        ...retainedPostedOffers,
      ],
    };
    if (!info.desklessOutpost) this._guaranteeRecoveryOffer(info, board, epoch);
    state.missions.boards[stationId] = board;
    this._syncEmbodiedStoryOffer(info, board, epoch);
    this._syncSetPieceOpeningOffers(info, board, epoch);
    this._syncHeistOffer(info, board, epoch);
    this._syncBreakawayOffer(info, board, epoch);
    this._syncCounterweightOffer(info, board, epoch);
    this._syncYardContractOffers(info, board, epoch);
    this._syncCleanCylinderOffer(info, board);
    this._syncWarmCargoOffer(info, board);
    this._syncQuietPassageOffer(info, board);
    this._syncWakeHandoffOffer(info, board);
    this._syncAuthoredSetPieceOffers(info, board, epoch);
    this._syncMegaHeistOffers(info, board, epoch);
    this._syncCapitalBossOffer(info, board, epoch);
    this._syncAdventureSpeedOffers(info, board);
    this._syncRankContractOffer(info, board, epoch);
    syncCaptainStandingOrders(this, info, board);
    syncColdburnBid(this, info, board);
    this.bus.emit('mission:updated', { missionId: null });
    return board;
  },

  _syncQuietPassageOffer(info, board) {
    if (info.id !== QUIET_PASSAGE.stationId) return false;
    const exists = [...board.slots, ...this.state.missions.active].some(m => m.id === QUIET_PASSAGE.id || m.params?.quietPassage);
    const settled = (this.state.missions.receipts || []).some(r => r.outcome === 'completed'
      && (r.sourceOfferId === QUIET_PASSAGE.id || r.source === QUIET_PASSAGE.source
        || r.missionId === QUIET_PASSAGE.id));
    if (exists || settled || this.state.story?.flags?.[QUIET_PASSAGE.id]) return false;
    board.slots.push(buildQuietPassageOffer());
    return true;
  },

  _syncWakeHandoffOffer(info, board) {
    return syncWakeHandoffOffer(this, info, board);
  },

  _syncWarmCargoOffer(info, board) {
    const lot = WARM_CARGO_CONTRACT;
    if (info.id !== lot.stationId) return false;
    const exists = [...board.slots, ...this.state.missions.active].some(m => m?.source === lot.source);
    const settled = this.state.story?.flags?.warm_cargo_completed === true
      || (this.state.missions.receipts || []).some(r => r.source === lot.source && r.outcome === 'completed');
    if (exists || settled) return false;
    const text = lot.boardText.replace('{limit}', String(lot.handlingLimit));
    board.slots.push({
      id: `warm_cargo_${lot.stationId}`, source: lot.source, type: lot.offerType,
      stationId: lot.stationId, factionId: lot.factionId,
      destStationId: lot.destStationId, destSectorId: lot.destSectorId, distance: lot.distance,
      reward_cr: lot.paysCr, collateral_cr: 0, riskTier: 0, minRep: 0,
      time_limit_s: 1200, duration_s: 1200, preloadedCargo: true,
      params: { cmdtyId: lot.cmdtyId, qty: lot.qty, handlingLimit: lot.handlingLimit,
        cargoValue: lot.qty, fValue: 1, taskTime: 20, passengers: 0 },
      title: text, brief: text, summary: text,
      cause: { tag: lot.key, axis: 'handling', line: text },
      expiresAtEpoch: this._epoch() + 1, storyTag: null,
    });
    return true;
  },

  _syncCleanCylinderOffer(info, board) {
    if (info.id !== CLEAN_CYLINDER.stationId) return false;
    const exists = [...board.slots, ...this.state.missions.active].some(m => m.params?.cleanCylinder);
    const settled = (this.state.missions.receipts || []).some(r => r.source === 'cleanCylinder' && r.outcome === 'completed');
    if (exists || settled || this.state.story?.flags?.m30_clean_cylinder) return false;
    board.slots.push(buildCleanCylinderOffer());
    return true;
  },

  /**
   * SF-119 — a pilot with no cash and a battered hold still needs one job they can fly tonight.
   * Every board carries at least one zero-capital offer: no collateral, no upfront fee, no hold
   * requirement the current cargo cap fails, no standing gate the current rep misses. The row is
   * ordinary work at ordinary terms — a tow, a sweep, a quota — never a payout for being poor.
   * When the epoch roll already produced one, nothing is added.
   */
  _guaranteeRecoveryOffer(info, board, epoch) {
    const slots = board && board.slots;
    if (!Array.isArray(slots)) return;
    if (slots.some((o) => o && this._zeroCapitalFlyable(o))) return;
    const seed = hash32(this.state.meta.seed, info.id, epoch, 'recovery');
    const rng = (this.helpers && this.helpers.mulberry32)
      ? this.helpers.mulberry32(seed) : mulberryLocal(seed);
    for (const typeId of ['recon_scan', 'tow_recovery', 'mining_quota']) {
      const offer = this._rollOffer(typeId, info, rng, epoch, 'recovery', { attachConditions: false });
      if (offer && this._zeroCapitalFlyable(offer)) {
        slots.push(offer);
        return;
      }
    }
    // A guarantee that cannot fire is worth hearing about — e.g. every reachable destination is
    // rep-gated for this pilot — rather than failing the row silently.
    dedupWarn('missions/recovery-slot-empty',
      '[missions] recovery slot rolled nothing flyable', info && info.id, epoch);
  },

  /** True when the current fit can accept this offer with zero credits and zero hold room. */
  _zeroCapitalFlyable(offer) {
    if (!offer) return false;
    if ((Number(offer.collateral_cr) || 0) > 0) return false;
    if (setPieceUpfrontCost(offer, this.state) > 0) return false;
    if (offer.factionId
      && this._repOf(offer.factionId) < missionOfferMinRep(offer, this.state)) return false;
    if (ONE_LOAD_CARGO_TYPES.has(offer.type)) {
      const need = cargoFootprint(offer);
      const cargo = (this.state.player && this.state.player.cargo) || {};
      const free = Math.max(0, (Number(cargo.capVolume) || 0) - (Number(cargo.usedVolume) || 0));
      if (need > 0 && free < need) return false;
    }
    return true;
  },

  /**
   * SPEC2/03 B5 — post one normal, starter-risk offer for each first-hour loop.
   *
   * This is deliberately a board adapter rather than a parallel tutorial mission system. Each
   * candidate comes through _rollOffer, so normal destinations, rewards, objectives, target
   * spawning, receipts, and save behavior remain authoritative. We sample a bounded deterministic
   * set and choose the lowest-risk normal roll; no finished offer has its economics rewritten.
   */
  ensureOnboardingChoiceOffers(stationId) {
    const state = this.state;
    const info = STATION_INFO.get(stationId);
    if (!info) return [];
    const board = this.ensureBoard(stationId);
    if (!board || !Array.isArray(board.slots)) return [];

    const epoch = this._epoch();
    const helpers = this.helpers || {};
    const seedBase = Number(state.meta && state.meta.seed) || 1;
    const existing = new Map(board.slots
      .filter((offer) => offer && offer.source === ONBOARDING_CHOICE_SOURCE)
      .map((offer) => [offer.type, offer]));
    const choices = [];

    for (let order = 0; order < ONBOARDING_CHOICE_LOOPS.length; order++) {
      const loop = ONBOARDING_CHOICE_LOOPS[order];
      let offer = existing.get(loop.type) || null;
      if (!offer) {
        let best = null;
        let bestRank = null;
        for (let attempt = 0; attempt < 64; attempt++) {
          const seed = typeof helpers.hash32 === 'function'
            ? helpers.hash32(seedBase, stationId, 'first-hour-choice', loop.type, attempt)
            : ((seedBase ^ Math.imul(order + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0);
          const rng = typeof helpers.mulberry32 === 'function'
            ? helpers.mulberry32(seed) : mulberryLocal(seed);
          const candidate = this._rollOffer(
            loop.type,
            info,
            rng,
            epoch,
            `first_hour_${order}_${attempt}`,
            { attachConditions: false },
          );
          if (!candidate) continue;
          const candidateRisk = Number(candidate.riskTier) || 0;
          const candidateCollateral = Math.max(0, Number(candidate.collateral_cr) || 0);
          const candidateReward = Math.max(0, Number(candidate.reward_cr) || 0);
          const rank = [
            candidateRisk > loop.maxRiskTier ? 1 : 0,
            candidateCollateral > loop.maxCollateralCr ? 1 : 0,
            candidateReward > loop.maxRewardCr ? 1 : 0,
            candidateRisk,
            candidateCollateral,
            candidateReward,
          ];
          let better = !bestRank;
          if (bestRank) {
            for (let index = 0; index < rank.length; index++) {
              if (rank[index] === bestRank[index]) continue;
              better = rank[index] < bestRank[index];
              break;
            }
          }
          if (better) {
            best = candidate;
            bestRank = rank;
          }
          if (rank[0] === 0 && rank[1] === 0 && rank[2] === 0) break;
        }
        offer = best;
        if (!offer) continue;
        offer.id = `first_hour_choice_${stationId}_${seedBase}_${loop.type}`;
        offer.source = ONBOARDING_CHOICE_SOURCE;
        offer.onboardingChoice = { label: loop.label, order };
        // Long enough for a player to leave, regroup, and return; the active tutorial retention
        // rule above, rather than this horizon, is the actual ownership contract.
        offer.expiresAtEpoch = epoch + 8;
      }
      choices.push(offer);
    }

    if (choices.length !== ONBOARDING_CHOICE_LOOPS.length) return [];
    const priorChoiceIds = board.slots
      .filter((offer) => offer && offer.source === ONBOARDING_CHOICE_SOURCE)
      .map((offer) => offer.id);
    const ordinary = board.slots.filter((offer) => offer && offer.source !== ONBOARDING_CHOICE_SOURCE);
    board.slots = [...choices, ...ordinary];

    const ob = state.onboarding;
    if (ob && ob.active && !ob.finished) {
      ob.choiceStationId = stationId;
      ob.choiceOfferTypes = ONBOARDING_CHOICE_LOOPS.map((loop) => loop.type);
      ob.choiceOfferIds = choices.map((offer) => offer.id);
    }
    const nextChoiceIds = choices.map((offer) => offer.id);
    if (priorChoiceIds.length !== nextChoiceIds.length
      || priorChoiceIds.some((id, index) => id !== nextChoiceIds[index])) {
      this.bus.emit('mission:updated', { missionId: null, stationId, onboardingChoice: true });
    }
    return choices;
  },

  /**
   * PQ-019C — keep exactly one authored capsule-run row on the Tethys board.
   *
   * Modelled on `_syncEmbodiedStoryOffer`, deliberately: that is the live precedent for one authored
   * row that must survive board epochs, de-dupe against the active list, and never auto-accept. The
   * board remains the only acceptance authority; this seam only posts.
   *
   * Never posts while a heist is active or while any heist row (including a pending reduced-stake
   * recovery) is already on the board, so "at most one" is structural rather than bookkept.
   */
  _syncHeistOffer(info, board, epoch = this._epoch()) {
    if (!info || info.id !== PQ019C_HEIST_STATION_ID) return false;
    if (!board || !Array.isArray(board.slots)) return false;
    if ((this.state.missions.active || []).some((m) => m && m.status === 'active' && m.heist)) {
      return false;
    }
    if (board.slots.some((offer) => offer && offer.type === PQ019C_HEIST_TYPE)) return false;
    // APPEND, never unshift. `_syncEmbodiedStoryOffer` and `_syncSetPieceOpeningOffers` both run
    // before this and both unshift, and `_generateOffers` puts a B4 branch-intro contract at the head
    // of what it returns. A standing black-market contract that claimed the top slot would displace
    // whichever authored story row the board is supposed to lead with — caught by
    // check:mission-standing-ladder, which asserts a branch station boards its tagged intro FIRST.
    // The heist is a standing offer, not story progress; it sits with the rest of the board.
    board.slots.push(buildHeistOffer({ epoch, observed: this._heistObserved() }));
    return true;
  },

  /**
   * BREAKAWAY — keep exactly one Third Shift row on the Tethys board, beside the capsule run.
   *
   * The same structural rules as `_syncHeistOffer`: never while ANY launcher run is active (the
   * launcher holds one schedule), never a duplicate, and appended so it cannot displace an authored
   * story row at the head of the board. Its own type keeps every capsule-run board contract intact.
   */
  _syncBreakawayOffer(info, board, epoch = this._epoch()) {
    if (!info || info.id !== PQ019C_HEIST_STATION_ID) return false;
    if (!board || !Array.isArray(board.slots)) return false;
    if ((this.state.missions.active || []).some((m) => m && m.status === 'active' && m.heist)) {
      return false;
    }
    if (board.slots.some((offer) => offer && offer.type === BREAKAWAY_RECOVERY_TYPE)) return false;
    board.slots.push(buildBreakawayOffer({ epoch, observed: this._heistObserved() }));
    return true;
  },

  /**
   * SF-143 — keep exactly one Counterweight Watch row on the Tethys board, beside the launcher
   * contracts. The yard is a different machine than the launcher (a live heist does NOT block
   * it), but the scene is singular: never while a watch is armed, never a duplicate row, and
   * appended so it cannot displace an authored story row at the head of the board.
   */
  _syncCounterweightOffer(info, board, epoch = this._epoch()) {
    if (!info || info.id !== PQ019C_HEIST_STATION_ID) return false;
    if (!board || !Array.isArray(board.slots)) return false;
    if ((this.state.missions.active || []).some((m) => m && m.status === 'active' && m.counterweight)) {
      return false;
    }
    if (board.slots.some((offer) => offer && offer.type === COUNTERWEIGHT_WATCH_TYPE)) return false;
    board.slots.push(buildCounterweightOffer({ epoch, observed: this._heistObserved() }));
    return true;
  },

  /**
   * PB-MIS-E — the two Forge yard contracts. Both rows live on the depot3 board, both are
   * AUTHORED-ONLY (structural zero in the type table), and each is ONE-SHOT: the durable
   * `missions.yardContracts` ledger retires the row on any settlement — completed, failed,
   * or abandoned — so the jobs never repost for repeated rewards. An unresolved row is kept
   * through refresh as authored progress (`source === YARD_WORK_SOURCE`).
   */
  _syncYardContractOffers(info, board, epoch = this._epoch()) {
    if (!info || info.id !== YARD_BOARD_STATION_ID) return false;
    if (!board || !Array.isArray(board.slots)) return false;
    const settled = this.state.missions.yardContracts || {};
    const active = this.state.missions.active || [];
    const liveFor = (contractId) => active.some((m) => (
      m && m.status === 'active' && m.params && m.params.yardContractId === contractId
    ));
    let changed = false;
    if (!settled.split_manifest && !liveFor('split_manifest')
      && !board.slots.some((offer) => offer && offer.type === SPLIT_MANIFEST_TYPE)) {
      board.slots.push(buildSplitManifestOffer({ epoch }));
      changed = true;
    }
    if (!settled.quiet_berth && !liveFor('quiet_berth')
      && !board.slots.some((offer) => offer && offer.type === QUIET_BERTH_TYPE)) {
      board.slots.push(buildQuietBerthOffer({ epoch }));
      changed = true;
    }
    return changed;
  },

  /**
   * Post the ONE authored reduced-stake retry, when policy allows it. Default policy is OFF
   * (`PQ019C_HEIST_TUNING.recoveryEnabled`), so this normally does nothing at all.
   *
   * Bounded by construction: only from attempt 0, only for recoverable outcomes (never a completed
   * fence run), and only onto a board that carries no heist row — so there is no second recovery
   * and no recovery stacked on the standing contract.
   */
  _boardHeistRecovery(mission, outcome) {
    const record = mission && mission.heist ? mission.heist : null;
    const attempt = record ? (record.attempt | 0) : 0;
    if (!heistMissionRuntime.allowsRecovery(record, outcome)) return false;
    const board = this.ensureBoard(PQ019C_HEIST_STATION_ID);
    if (!board || !Array.isArray(board.slots)) return false;
    if (board.slots.some((offer) => offer && offer.type === PQ019C_HEIST_TYPE)) return false;
    // Appended for the same reason as the standing row: a recovery offer must not displace a story
    // row at the head of the board. The player is pointed at it by the recovery cue below.
    board.slots.push(buildHeistOffer({
      epoch: this._epoch(), attempt: attempt + 1, sourceMissionId: mission.id,
      observed: this._heistObserved(),
    }));
    this.bus.emit('mission:updated', { missionId: null, stationId: PQ019C_HEIST_STATION_ID });
    // The recovery cue rides the same single voice id as the rest of the run, so the last thing the
    // player hears about a lost capsule is where the second pass is posted.
    sayHeistCue(this._heistCtx(), mission.heist, 'recovery');
    return true;
  },

  // RC-MISSION-VOICE: the durable casing ledger the Tethys rows read — plain fact-id keys so a
  // missing/foreign slice still mints a truthful offer.
  _heistObserved() {
    const observed = this.state && this.state.heistFacilities && this.state.heistFacilities.observed;
    return observed && typeof observed === 'object' ? observed : null;
  },

  _heistCtx() {
    return { state: this.state, bus: this.bus, helpers: this.helpers, registry: this.registry };
  },

  /** Apply `fn` to every live heist subrecord. Zero active heists costs one length check. */
  _heistEach(fn) {
    const active = this.state.missions && this.state.missions.active;
    if (!active || !active.length) return;
    for (const m of active) {
      if (m && m.status === 'active' && m.heist && !m.heist.settled) fn(m.heist, m);
    }
  },

  /** Apply `fn` to every live counterweight-watch subrecord. Same zero-cost shape as `_heistEach`. */
  _counterweightEach(fn) {
    const active = this.state.missions && this.state.missions.active;
    if (!active || !active.length) return;
    for (const m of active) {
      if (m && m.status === 'active' && m.counterweight && !m.counterweight.settled) {
        fn(m.counterweight, m);
      }
    }
  },

  /**
   * One tick of one yard watch, then settlement when the manifest or the window resolves. The
   * runtime's payout becomes the mission's own `reward_cr` before the one ordinary completion or
   * failure path pays or fails it — per-delivered-crate terms, never a fabricated full manifest.
   */
  _driveCounterweight(m, index) {
    const ctx = this._heistCtx();
    const decision = counterweightRuntime.drive(ctx, m.counterweight);
    if (!decision) return null;
    return counterweightRuntime.settle(ctx, m.counterweight, decision, (settlement, reason) => {
      if (settlement === 'complete') {
        m.reward_cr = Math.max(0, Math.round(Number(m.counterweight.payoutCr) || 0));
        this._completeMission(m, index);
      } else {
        this._failMission(m, index, reason || 'watch_failed');
      }
      return m.counterweight.settledOutcome;
    });
  },

  /**
   * One tick of one capsule run, then settlement if a terminal receipt was decided.
   *
   * SETTLEMENT ROUTES THROUGH THE ORDINARY PATHS. `fenced_success` is the only payday and goes to
   * `_completeMission`; every other terminal outcome goes to `_failMission`. That is what buys the
   * packet's invariants by construction rather than by hand-rolled calls:
   *   * `missionSettlementCount == 1` — the effect journal's `missionSettlement` key is taken before
   *     the call, so a synchronous re-entry finds it spent;
   *   * `economyRewardCount == (fenced ? 1 : 0)` — `_completeMission` is the only reward emitter,
   *     and the authored offer carries `collateral_cr: 0` so its refund branch cannot post a second
   *     `economy:grantCredits`;
   *   * `factionOutcomeCount <= 1` — completion routes rep through `mission:completed{repMult}` and
   *     failure emits one `faction:repDelta`; neither path stacks the other.
   * This module calls neither economy nor factions itself.
   */
  _driveHeist(m, index, options = {}) {
    const ctx = this._heistCtx();
    const receipt = heistMissionRuntime.drive(ctx, m.heist, options);
    if (!receipt) return null;
    return heistMissionRuntime.settleTerminal(ctx, m.heist, receipt, (settlement, reason, outcome) => {
      // Recovery is boarded BEFORE the settlement removes the mission, for two reasons: public
      // failure observers may inspect the promised next row synchronously from `mission:failed`
      // (the same ordering `_failMission` already honours for set-piece recovery), and while the
      // mission is still active `_syncHeistOffer` will not re-post the standing contract over it.
      this._boardHeistRecovery(m, outcome);
      if (settlement === 'complete') {
        // BREAKAWAY: the bounded careful-handling bonus is folded into THIS mission's own reward
        // before the one ordinary completion pays it — never a second grant, never a new currency.
        // The condition is the physical owner's measurement at the instant custody passed.
        //
        // PQ-195.03: a FENCED outcome is the second destination over the same physical object and
        // pays the fence's own flat terms. No condition grade — that quote is Concord's for its own
        // machine, and the Quiet did not buy one to repair. `fencePayoutCr` is 0 for the Capsule Run,
        // whose matrix-selected reward and null-bonus path are unchanged.
        const policy = heistMissionPolicy(m.heist && m.heist.variantId);
        const condition = Number(m.heist && m.heist.deliveredCondition);
        // SF-147: on a MULTI-UNIT shell the fence pays for what physically arrived — the sealed
        // units still inside the delivered shell plus the pods it already bought, over the
        // manifest the launcher threw. Single-unit loads are never scaled; an unmeasured
        // delivery (the documented reload-resume path) keeps the flat authored terms rather
        // than paying nothing on a record that was honestly earned before the save.
        if (outcome === 'fenced_success') {
          const unitsTotal = Number(m.heist && m.heist.unitsTotal) || 0;
          const measured = Number.isFinite(m.heist && m.heist.deliveredUnits)
            || ((m.heist && m.heist.unitsFenced) | 0) > 0;
          if (unitsTotal > 1 && measured) {
            const inShell = Number.isFinite(m.heist.deliveredUnits) ? m.heist.deliveredUnits : 0;
            const arrived = Math.min(unitsTotal, Math.max(0, inShell) + (m.heist.unitsFenced | 0));
            m.reward_cr = Math.max(0, Math.round((Number(m.reward_cr) || 0) * arrived / unitsTotal));
          }
        }
        if (outcome === 'fenced_success' && policy.fencePayoutCr > 0) {
          m.reward_cr = policy.fencePayoutCr;
        } else if (policy.qualityBonusFraction > 0 && Number.isFinite(condition)) {
          const base = Math.max(0, Math.round(Number(m.reward_cr) || 0));
          m.reward_cr = deliveryQuote(base, Math.max(0, Math.min(1, condition)), policy.qualityBonusFraction).totalCredits;
        }
        this._completeMission(m, index);
      } else {
        this._failMission(m, index, reason || 'heist_failed');
      }
      return outcome;
    });
  },

  /** Seed each authored SP1 opening on its real home board once per board epoch. */
  _syncSetPieceOpeningOffers(info, board, epoch) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    let changed = false;
    for (const definition of SET_PIECE_MISSIONS || []) {
      if (!definition || definition.startStationId !== info.id) continue;
      const opening = buildSetPieceMissionOffers(this.state, {
        archetypeId: definition.id,
        startEpoch: epoch,
        stageIndex: 0,
        branchId: null,
        attempt: 0,
      })[0];
      const chainId = opening && opening.cause && opening.cause.chainId;
      if (!opening || !chainId) continue;
      const activeOrPosted = (this.state.missions.active || []).some((mission) => (
        setPieceCauseOf(mission) && mission.cause.archetypeId === definition.id
      )) || Object.values(this.state.missions.boards || {}).some((candidateBoard) => (
        (candidateBoard && candidateBoard.slots || []).some((offer) => (
          setPieceCauseOf(offer) && offer.cause.archetypeId === definition.id
        ))
      ));
      const durableSettlement = this.state.missions.setPieceSettlements
        && this.state.missions.setPieceSettlements[definition.id];
      const alreadySettledThisEpoch = durableSettlement && durableSettlement.chainId === chainId
        || (this.state.missions.receipts || []).some((receipt) => (
        receipt && receipt.chainId === chainId
      ));
      if (activeOrPosted || alreadySettledThisEpoch) continue;
      board.slots.unshift(opening);
      changed = true;
    }
    return changed;
  },

  /** Post each authored physical set piece on its home board. Append, never unshift, so
   * branch-intro and board-anchor rows keep the head (same reason the heist appends). */
  _syncAuthoredSetPieceOffers(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    let changed = false;
    for (const definition of AUTHORED_SET_PIECES) {
      if (!definition || definition.startStationId !== info.id) continue;
      const already = (this.state.missions.active || []).some((mission) => (
        mission && mission.status === 'active'
        && mission.params && mission.params.authoredSetPieceId === definition.id
      )) || Object.values(this.state.missions.boards || {}).some((candidateBoard) => (
        (candidateBoard && candidateBoard.slots || []).some((offer) => (
          offer && offer.source === AUTHORED_SET_PIECE_SOURCE
          && offer.params && offer.params.authoredSetPieceId === definition.id
        ))
      ));
      if (already) continue;
      const offer = stampAuthoredTwist(buildAuthoredSetPieceOffer(definition, epoch));
      if (!offer) continue;
      board.slots.push(offer);
      changed = true;
    }
    return changed;
  },

  /** Standing speed jobs use the ordinary board and one durable first-clear payment. */
  _syncAdventureSpeedOffers(info, board) {
    if (!info || !Array.isArray(board?.slots)) return false;
    const completed = this.state.missions.adventureSpeedCompleted || {};
    const active = this.state.missions.active || [];
    let changed = false;
    for (const offer of adventureSpeedOffersForStation(info.id)) {
      const id = offer.params.adventureSpeedId;
      if (completed[id] || active.some(m => m?.status === 'active' && m.params?.adventureSpeedId === id)) continue;
      if (board.slots.some(row => row?.params?.adventureSpeedId === id)) continue;
      board.slots.push(offer);
      changed = true;
    }
    return changed;
  },

  /** Post the Coalition capital, and the two post-ending heavies once the replay chain is live. */
  _syncCapitalBossOffer(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    const unlocked = endgamePullsUnlocked(this.state);
    let changed = false;
    for (const definition of CAPITAL_BOSSES) {
      if (!definition || definition.startStationId !== info.id) continue;
      if (definition.endgame && !unlocked) continue;
      if (definition.endgame && completedEndgamePull(this.state, definition.id)) continue;
      const already = (this.state.missions.active || []).some((mission) => (
        mission && mission.status === 'active' && isCapitalBossMission(mission)
        && mission.params && mission.params.capitalBossId === definition.id
      )) || Object.values(this.state.missions.boards || {}).some((candidateBoard) => (
        (candidateBoard && candidateBoard.slots || []).some((offer) => (
          offer && offer.source === CAPITAL_BOSS_SOURCE
          && offer.params && offer.params.capitalBossId === definition.id
        ))
      ));
      if (already) continue;
      const offer = stampCapitalBossTwist(buildCapitalBossOffer(definition, epoch));
      if (!offer) continue;
      board.slots.push(offer);
      changed = true;
    }
    return changed;
  },

  /** Post the two post-ending mega-heists on their home boards. Authored-only, never rolled. */
  _syncMegaHeistOffers(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    if (!endgamePullsUnlocked(this.state)) return false;
    let changed = false;
    for (const definition of MEGA_HEISTS) {
      if (!definition || definition.startStationId !== info.id) continue;
      if (completedEndgamePull(this.state, definition.id)) continue;
      const already = (this.state.missions.active || []).some((mission) => (
        mission && mission.status === 'active'
        && mission.params && mission.params.megaHeistId === definition.id
      )) || Object.values(this.state.missions.boards || {}).some((candidateBoard) => (
        (candidateBoard && candidateBoard.slots || []).some((offer) => (
          offer && offer.source === MEGA_HEIST_SOURCE
          && offer.params && offer.params.megaHeistId === definition.id
        ))
      ));
      if (already) continue;
      const offer = stampAuthoredTwist(buildMegaHeistOffer(definition, epoch));
      if (!offer) continue;
      board.slots.push(offer);
      changed = true;
    }
    return changed;
  },

  /** Keep one authored 47-A contract on the correct live board. The board remains the only
   * acceptance authority; this seam never auto-accepts, advances the cursor, or grants rewards. */
  _syncEmbodiedStoryOffer(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    const story = this.state && this.state.story;
    const beat = story && (story.beatIndex | 0);
    const branch = story && story.branch || null;
    const chainStep = story && (story.chainProgress | 0);
    const seed = this.state && this.state.meta && this.state.meta.seed || 1;
    const flags = story && story.flags || {};
    const offer = buildMissionBoardContract(beat, {
      seed, epoch, branch, chainStep,
      // PQ-032.02: the live route never writes elroy_outcome — derive the old-vocabulary
      // flavour from the chosen door, and only true legacy evidence suppresses the offer.
      elroyOutcome: campaign47aOutcomeKey(this.state),
      assetId: flags.empire_seed_asset_id,
      operationComplete: !!flags.deep_reach_operation_complete,
      legacy: campaign47aRouteKind(this.state) === 'legacy',
    });
    const activeTags = new Set((this.state.missions.active || [])
      .filter((mission) => mission && mission.status === 'active' && mission.storyTag)
      .map((mission) => mission.storyTag));
    const keepTag = offer && offer.type ? offer.storyTag : null;
    const before = board.slots.length;
    board.slots = board.slots.filter((candidate) => !(
       candidate && typeof candidate.storyTag === 'string'
       && candidate.storyTag.startsWith('campaign47a:')
       && !candidate.storyTag.startsWith('campaign47a:ending:')
       && candidate.storyTag !== keepTag
    ));
    if (!offer || !offer.type || offer.stationId !== info.id || activeTags.has(offer.storyTag)) {
      return board.slots.length !== before;
    }
    if (board.slots.some((candidate) => candidate && candidate.storyTag === offer.storyTag)) {
      return board.slots.length !== before;
    }
    board.slots.unshift(offer);
    return true;
  },

  _refreshEmbodiedStoryBoards() {
    let changed = false;
    const epoch = this._epoch();
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      const info = STATION_INFO.get(stationId);
      if (this._syncEmbodiedStoryOffer(info, board, epoch)) changed = true;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null });
    return changed;
  },

  /** Publish eligible contract endings (A/B) as physical Ashfall board rows. */
  postEndgameDispositionOffers() {
    const stationId = 'station_ashcache';
    const board = this.ensureBoard(stationId);
    if (!board || !Array.isArray(board.slots)) return false;
    const seed = this.state.meta && this.state.meta.seed || 1;
    let offers = buildEndgameBoardOffers({ seed, epoch: this._epoch() });
    // Causal eligibility: only post A/B rows the player currently qualifies for.
    const storySys = this.registry && this.registry.get && this.registry.get('story');
    if (storySys && typeof storySys.getBoardEligibleEndingIds === 'function') {
      const ok = new Set(storySys.getBoardEligibleEndingIds() || []);
      offers = offers.filter((offer) => offer && ok.has(offer.storyDisposition));
    }
    const eligible = new Set(offers.map((offer) => offer && offer.storyDisposition).filter(Boolean));
    const before = board.slots.length;
    // Eligibility can change after the B7 offer first opens (claim/outpost/capital stake, alignment,
    // or reputation). Keep the physical board causal instead of leaving an obsolete disposition
    // row around or requiring a new save to see one that just became valid.
    board.slots = board.slots.filter((offer) => !(
      offer && offer.storyDisposition && !eligible.has(offer.storyDisposition)
    ));
    let changed = board.slots.length !== before;
    const active = new Set(board.slots.map((offer) => offer && offer.storyDisposition).filter(Boolean));
    for (let i = offers.length - 1; i >= 0; i--) {
      const offer = offers[i];
      if (active.has(offer.storyDisposition)) continue;
      board.slots.unshift(offer);
      active.add(offer.storyDisposition);
      changed = true;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null, stationId });
    return changed;
  },

  clearEndgameDispositionOffers() {
    let changed = false;
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const before = board.slots.length;
      board.slots = board.slots.filter((offer) => !(offer && offer.storyDisposition));
      changed = changed || board.slots.length !== before;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null });
    return changed;
  },

  /**
   * One salvage contract after a cargo-ship kill is salvaged and sold. The economy already moved
   * the destination price; this is the board opportunity, not a fine or a failed contract.
   */
  _onCargoKillOpportunity(fact) {
    if (!fact || fact.kind !== 'price_move' || !fact.chainId || !fact.saleStationId) return false;
    const info = stationInfoFor(this.state, fact.saleStationId);
    if (!info) return false;
    const spilledId = typeof fact.commodityId === 'string' ? fact.commodityId : '';
    const commodity = CMDTY_BY_ID.get(spilledId) || CMDTY_BY_ID.get('cmdty_scrap_metal');
    const qty = Math.max(1, Math.min(12, Math.floor(Number(fact.qty) || 0) || 4));
    const unit = commodity ? commodity.basePrice : 10;
    const goodsName = commodity ? commodity.name : 'the spilled cargo';
    const epoch = this._epoch();
    const offer = {
      id: `cksalv_${fact.chainId}`,
      source: 'cargoKillChain',
      type: 'salvage_retrieval',
      stationId: info.id,
      factionId: info.factionId,
      reward_cr: Math.max(120, Math.round(unit * qty * 1.4)),
      time_limit_s: 900,
      duration_s: 900,
      collateral_cr: 0,
      riskTier: 1,
      preloadedCargo: false,
      destStationId: info.id,
      destSectorId: info.sectorId,
      distance: 600,
      params: {
        cmdtyId: commodity ? commodity.id : spilledId,
        qty,
        cargoValue: unit * qty,
        fValue: 1.2,
        taskTime: 30,
        wreckPos: fact.pos ? { x: fact.pos.x, z: fact.pos.z } : null,
        sectorId: fact.sectorId || info.sectorId,
      },
      title: `Recover ${qty}u ${goodsName} for ${info.name}`,
      brief: `A witness marked the hull. ${info.name} pays for the ${goodsName} that is still out there.`,
      summary: fact.moved
        ? `Witness at the kill. ${fact.commodityId} moved at the destination.`
        : 'Witness at the kill. The wreck is still recoverable.',
      cause: {
        tag: 'salvage',
        chainId: fact.chainId,
        fingerprint: fact.chainId,
        witness: true,
        priceStationId: fact.stationId || null,
      },
      expiresAtEpoch: epoch + 2,
      storyTag: null,
    };
    const boarded = this._onExternalBoardOffer(offer);
    if (!boarded) return false;
    const text = `A witness kept the bearing. Salvage contract live: ${offer.title}.`;
    const said = this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function'
      ? this.helpers.voice.say({ channel: 'news', text, kind: 'salvage' })
      : false;
    if (!said) this.bus.emit('toast', { text, kind: 'info', ttl: 4, source: 'cargoKillChain' });
    return true;
  },

  /**
   * Adopt an emit-only field contract into the normal board without accepting it.
   * Idempotent by stable offer id and capped at one economyContract row per station epoch.
   */
  _onExternalBoardOffer(rawOffer) {
    const allowedSource = rawOffer && (
      rawOffer.source === 'economyContract'
      || rawOffer.source === 'firstTradeContract'
      || rawOffer.source === 'encounterAftermath'
      || rawOffer.source === 'custodyRecovery'
      || rawOffer.source === 'careerContract'
      || rawOffer.source === 'postEndingReplay'
      || rawOffer.source === 'poiBehavior'
      || rawOffer.source === LANDMARK_QUEST_SOURCE
      || rawOffer.source === 'uniqueWreck'
      // lossLedger's ghost-convoy lane bounty: a complete, priced offer built from real lane
      // losses — the rumor's news line points here, so the board must be allowed to carry it.
      || rawOffer.source === 'ghostConvoyRumor'
      || rawOffer.source === 'cargoKillChain'
      || rawOffer.source === SET_PIECE_MISSION_SOURCE
      || rawOffer.source === SET_PIECE_FOLLOW_ON_SOURCE
      // BP-01.1: a wreck communicator's contract is a full board offer (salvage._buildOffer
      // supplies id/type/stationId/params) — the wreck's signal becomes a real board row, so
      // "failure creates content" also means discovery creates playable work.
      || rawOffer.source === 'salvage'
      || rawOffer.source === 'mercyService'
      || rawOffer.source === 'wreckCourt'
      // Alien Ecology AE-067/068/069/087/088/089: colonized sites emit fieldwork contracts on
      // close approach — the site IS the giver (alienEcology.emitEcologyOffer builds the row).
      || rawOffer.source === 'ecology'
      || rawOffer.source === 'blackFlag'
    );
    if (!allowedSource) return false;
    if (rawOffer.source === 'poiBehavior' && !validatePoiCausalOffer(rawOffer).ok) return false;
    if (rawOffer.source === LANDMARK_QUEST_SOURCE && !validateLandmarkQuestOffer(rawOffer)) return false;
    if (rawOffer.source === SET_PIECE_MISSION_SOURCE && !setPieceCauseOf(rawOffer)) return false;
    if (!rawOffer.id || !rawOffer.type || !rawOffer.stationId || !rawOffer.params) return false;
    const info = stationInfoFor(this.state, rawOffer.stationId);
    if (!info || !TYPE_BY_ID.has(rawOffer.type)) return false;
    const epoch = this._epoch();
    if (Number.isFinite(rawOffer.expiresAtEpoch) && rawOffer.expiresAtEpoch <= epoch) return false;
    if ((this.state.missions.active || []).some((m) => m && (
      m.id === rawOffer.id || m.sourceOfferId === rawOffer.id
      || (isFingerprintBoardSource(rawOffer.source)
        && m.cause && rawOffer.cause
        && m.cause.fingerprint === rawOffer.cause.fingerprint)
    ))) return false;
    if (isFingerprintBoardSource(rawOffer.source)
      && (this.state.missions.receipts || []).some((receipt) => (
      receipt && (receipt.sourceOfferId === rawOffer.id
        // Salvage offers carry no `cause` — a null fingerprint must never match another null.
        || (rawOffer.cause && receipt.causeFingerprint
          && receipt.causeFingerprint === rawOffer.cause.fingerprint))
      ))) return false;

    const board = this.ensureBoard(rawOffer.stationId);
    if (!board || !Array.isArray(board.slots)) return false;
    if (board.slots.some((offer) => offer && offer.id === rawOffer.id)) return false;
    // One row per source for ambient sources. Fingerprinted sources (salvage's stable
    // point-derived ids, set-piece chain causes, …) dedupe per identity above/below instead,
    // so a second communicator in one sector still boards. NXB-043's exception: the two
    // members of one competing feedstock bid are rival-tagged rows for DISTINCT starving
    // yards — the board carries both so the player can read the tradeoff.
    if (!isFingerprintBoardSource(rawOffer.source)
      && board.slots.some((offer) => {
        if (!offer || offer.source !== rawOffer.source) return false;
        if (isShortageGateRepair(rawOffer) || isShortageGateRepair(offer)) {
          return isShortageGateRepair(rawOffer) && isShortageGateRepair(offer)
            && rawOffer.cause.shortageEventId === offer.cause.shortageEventId;
        }
        if (rawOffer.source === 'custodyRecovery') {
          return offer.cause?.fingerprint === rawOffer.cause?.fingerprint;
        }
        if (isCompetingStarvedRow(rawOffer) && isCompetingStarvedRow(offer)) {
          return offer.destStationId === rawOffer.destStationId;
        }
        return true;
      })) return false;
    if (isFingerprintBoardSource(rawOffer.source) && board.slots.some((offer) => (
      offer && offer.source === rawOffer.source && offer.cause && rawOffer.cause
      && offer.cause.fingerprint === rawOffer.cause.fingerprint
    ))) return false;

    let offer;
    try { offer = JSON.parse(JSON.stringify(rawOffer)); } catch (_) { return false; }
    board.slots.unshift(offer);
    if (offer.source === 'poiBehavior') {
      let kept = 0;
      board.slots = board.slots.filter((candidate) => {
        if (!candidate || candidate.source !== 'poiBehavior') return true;
        kept++;
        return kept <= POI_CAUSAL_BOARD_CAP;
      });
    }
    this.bus.emit('mission:updated', { missionId: null, offerId: offer.id, stationId: offer.stationId });
    this.bus.emit('mission:offerBoarded', {
      offerId: offer.id,
      stationId: offer.stationId,
      source: offer.source,
      causeTag: offer.cause && offer.cause.tag || null,
      causeFingerprint: offer.cause && offer.cause.fingerprint || null,
      epoch: board.refreshEpoch,
    });
    return true;
  },

  _boardNeedsStoryBranchIntro(info, board) {
    const story = this.state && this.state.story;
    const intro = info && BRANCH_INTRO_BY_FACTION.get(info.factionId);
    if (!story || story.beatIndex !== 4 || story.branch || !intro) return false;
    // Only a hand-set/legacy-resolved outcome pins one door; the live route leaves all
    // three introductions open until the player actually chooses (PQ-032.02).
    const flags = story.flags || {};
    const pinned = !flags.elroy_outcome_legacy && !!flags.elroy_outcome;
    const stake = pinned ? getPickSideStake(flags.elroy_outcome) : null;
    if (stake && (info.id !== stake.stationId || intro.branch !== stake.branch)) return false;
    const slots = board && Array.isArray(board.slots) ? board.slots : [];
    return !slots.some((offer) => (
      offer &&
      offer.storyTag === STORY_BRANCH_INTRO_TAG &&
      offer.factionId === intro.factionId &&
      offer.storyBranch === intro.branch
    ));
  },

  _refreshStoryBranchIntroBoards() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch) return false;
    let changed = false;
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      const info = STATION_INFO.get(stationId);
      if (!info || !this._boardNeedsStoryBranchIntro(info, board)) continue;
      // Re-enter the canonical refresh path so causal POI and set-piece chain rows survive the
      // story-intro insertion instead of being replaced by a procedural-only board.
      this.ensureBoard(stationId);
      changed = true;
    }
    return changed;
  },

  /**
   * Durable career score for offer history. Pure read of save-backed state (no wall time, no rng):
   * completed contracts, sectors visited, executed trades, fields worked, and story progress.
   * Bounded so one long mining session cannot inflate the board past its band.
   */
  _playerHistoryScore() {
    const state = this.state;
    const missions = state.missions || {};
    const completed = Array.isArray(missions.completedLog) ? missions.completedLog.length : 0;
    const discovery = (state.world && state.world.discovery) || {};
    let sectorsVisited = 0;
    for (const sectorId of Object.keys(discovery)) {
      const rec = discovery[sectorId];
      if (rec && Number(rec.visitedCount) > 0) sectorsVisited++;
    }
    const trades = state.player && Array.isArray(state.player.tradeLedger)
      ? state.player.tradeLedger.length : 0;
    const fieldsWorked = Object.values((state.fieldDepletion && state.fieldDepletion.fields) || {})
      .filter((rec) => rec && Number(rec.destroyedCount) > 0).length;
    const storyBeat = (state.story && Number(state.story.beatIndex)) || 0;
    return Math.min(60,
      Math.min(24, completed * 2)
      + Math.min(6, sectorsVisited)
      + Math.min(8, Math.floor(trades / 5))
      + Math.min(12, fieldsWorked)
      + Math.min(10, storyBeat));
  },

  /** Deterministically generate S offers for a station at an epoch (seeded, no Math.random). */
  _generateOffers(info, epoch) {
    const helpers = this.helpers;
    const seed = (helpers && helpers.hash32)
      ? helpers.hash32(this.state.meta.seed, info.id, epoch)
      : ((this.state.meta.seed ^ epoch) >>> 0);
    const rng = (helpers && helpers.mulberry32) ? helpers.mulberry32(seed) : mulberryLocal(seed);

    const sizeTier = SIZE_TIER[info.size] != null ? SIZE_TIER[info.size] : 1;
    const S = clamp(3 + sizeTier, 3, 9);
    const profile = info.missionProfile || info.type;
    const weights = offerMixForTier(profile, Math.max(info.sectorTier || 0, standingWorkTier(this._repOf(info.factionId))));
    // Loyalty boost: friendly players see more of the station faction's signature types.
    const rep = this._repOf(info.factionId);
    const repBoost = 1 + Math.max(0, rep) / 100;
    // Career overlay: the same board stops serving starter-tier repeats forever as the player's
    // durable history accumulates (completed contracts, sectors visited, trades, fields worked).
    const historyTier = offerHistoryTierFor(this._playerHistoryScore());

    const offers = [];
    for (let i = 0; i < S; i++) {
      // A board may declare one defining live job. This is data-owned rather than inferred from its
      // physical station type, so Charon can remain a real refinery while its hunter exchange never
      // opens on a bounty-free epoch.
      const anchored = i === 0 && !!info.boardAnchorType;
      const typeId = anchored
        ? info.boardAnchorType
        : this._pickType(weights, rng, repBoost, profile, historyTier);
      const offer = this._rollOffer(typeId, info, rng, epoch, i, { anchor: anchored });
      if (offer) offers.push(offer);
    }
    // D85: a bounty-capable board that is not a dedicated writ wall can still open an epoch whose
    // rolled writs all landed above the Neutral band — rep-gating a sub-Accepted operator out of
    // every bounty on the board (the held-out hunter seeds died exactly here). Pin one entry
    // writ through the same anchored-roll clamp the writ walls use. It rides the head so the
    // bulk-haul/intro unshifts below cannot truncate it off a full board, it never stacks behind
    // a rolled low-risk writ, and it retires the epoch the faction Accepts the player.
    const neutralMaxRisk = missionStandingGateForMinRep(0).maxRisk;
    if (
      offerMixWeight(weights, 'bounty_hunt') > 0
      && this._repOf(info.factionId) < 30
      && !offers.some((o) => o && o.type === 'bounty_hunt'
        && (Number(o.riskTier) || 0) <= neutralMaxRisk)
    ) {
      const entryWrit = this._rollOffer('bounty_hunt', info, rng, epoch, S, { anchor: true });
      if (entryWrit) offers.unshift(entryWrit);
    }
    const bulkHaul = this._rollBulkHaulOffer(info, rng, epoch, 'bulk');
    if (bulkHaul) {
      offers.unshift(bulkHaul);
      if (offers.length > S) offers.length = S;
    }
    if (info.boardAnchorType) {
      const anchorIndex = offers.findIndex((offer) => offer && offer.type === info.boardAnchorType);
      if (anchorIndex > 0) offers.unshift(...offers.splice(anchorIndex, 1));
    }
    const intro = this._rollStoryBranchIntroOffer(info, rng, epoch);
    if (intro) {
      offers.unshift(intro);
      if (offers.length > S) offers.length = S;
    }
    if (info.id === 'station_helios') {
      // WORLD-18 authored beat, seeded at generation: exactly one qualifying offer carries the
      // teaching trap per board roll (deterministic pick; the per-tick board scan it replaced
      // never ran in production).
      const trapIdx = offers.findIndex((o) => o && !o.storyTag && !o.source
        && (o.type === 'cargo_delivery' || o.type === 'passenger_transport'));
      if (trapIdx >= 0) offers[trapIdx] = seedHeliosOfferTrap(offers[trapIdx]);
      this._injectStarterJob(info, offers, S);
    }
    this._markFeaturedOffer(offers, info, epoch);
    return offers.map((offer) => referenceTrapRefusal(offer, this.state));
  },

  /** The starter hull's next opening job, pinned at the head of the Helios board. */
  _injectStarterJob(info, offers, cap) {
    const ship = activeOwnedShip(this.state);
    const next = ship && nextStarterStep(this.state, ship.defId);
    if (!next) return;
    const already = offers.some((offer) => offer && offer.params
      && offer.params.starterJobId === next.job.id
      && offer.params.starterStep === next.step.step);
    if (already) return;
    const offer = this._rollOffer(next.step.type, info, () => 0.2, 0, 90, { attachConditions: false });
    if (!offer) return;
    offer.id = `starter-${next.job.id}-${next.step.step}`;
    offer.title = next.step.title;
    offer.reward_cr = next.step.rewardCr;
    offer.collateral_cr = 0;
    offer.riskTier = 0;
    offer.source = 'starterJob';
    offer.params = offer.params || {};
    offer.params.starterJobId = next.job.id;
    offer.params.starterStep = next.step.step;
    offer.params.requiredModule = next.job.requiredModule;
    if (next.step.runnerName) {
      const who = next.step.runnerName;
      offer.params.markName = who;
      offer.brief = `${who} is running the gate. The plate closes the writ. A gun does not.`;
      const prior = offer.storyTarget && typeof offer.storyTarget === 'object' ? offer.storyTarget : {};
      offer.storyTarget = {
        ...prior,
        id: prior.id || `mark:${offer.id}`,
        name: who,
        label: `${who.toUpperCase()} — RUNNER`,
        role: prior.role || 'board_writ',
      };
    }
    if (next.step.cmdtyId) {
      offer.params.cmdtyId = next.step.cmdtyId;
      offer.params.qty = next.step.qty;
    }
    offer.destStationId = info.id;
    offer.destSectorId = info.sectorId;
    offers.unshift(offer);
    if (offers.length > cap) offers.length = cap;
  },

  /** Keep the starter's next opening step on a board that has not rolled its epoch yet.
   *  Completing step 1 must not wait out the refresh clock before step 2 is posted. */
  _syncStarterJobOffer(info, board) {
    if (!info || info.id !== 'station_helios' || !board || !Array.isArray(board.slots)) return false;
    const before = board.slots.length;
    this._injectStarterJob(info, board.slots, before + 1);
    return board.slots.length !== before;
  },

  /**
   * FB-044 — a faction's rank contract is a real board row, not a dossier label. It posts at every
   * desk the faction owns once the pilot holds the authored rank step (rep floor AND named rank —
   * `missionAvailable`'s two gates, kept state-relative so headless boards resolve identically),
   * and rides the ordinary rolled-offer shape so accept/settle/save need no special case. The row
   * is APPENDED like every other standing row, deduped by its stable contract id on the board and
   * in the active list — an accepted run lives in missions.active, a settled one may re-post next
   * epoch like any standing contract.
   */
  _syncRankContractOffer(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots) || !hasContractsDesk(info.services)) return false;
    const def = info.factionId ? RANK_CONTRACT_BY_FACTION.get(info.factionId) : null;
    if (!def) return false;
    const rep = this._repOf(def.factionId);
    if (rep < def.minRep || rankFromRep(rep, def.factionId).step < def.minRankStep) return false;
    const already = board.slots.some((offer) => offer && offer.params
      && offer.params.rankContractId === def.id)
      || (this.state.missions.active || []).some((m) => m && m.status === 'active'
        && m.params && m.params.rankContractId === def.id);
    if (already) return false;
    const seed = hash32(this.state.meta.seed, info.id, epoch, 'rankContract');
    const rng = (this.helpers && this.helpers.mulberry32)
      ? this.helpers.mulberry32(seed) : mulberryLocal(seed);
    // Authored identity on a rolled body: no procedural fine print (the moral-trap ledger forbids
    // traps on contract-sourced rows; the starter-job roll uses the same attachConditions opt-out).
    const offer = this._rollOffer(def.type, info, rng, epoch, 'rank', { attachConditions: false });
    if (!offer) return false;
    offer.source = RANK_CONTRACT_SOURCE;
    offer.rankGated = true;
    offer.title = def.title;
    offer.minRep = def.minRep;
    offer.minRankStep = def.minRankStep;
    offer.params = offer.params || {};
    offer.params.rankContractId = def.id;
    board.slots.push(offer);
    return true;
  },

  /** Real-calendar day bucket for the featured mark — the only wall-clock read on the missions
   *  seam. Board generation is a dock-side boundary; per-tick simulation never sees it. Same
   *  'YYYY-MM-DD' UTC key the Crucible daily board uses, so "today" means one thing everywhere. */
  _dayKey() {
    return `sim-day:${Math.floor(Math.max(0, Number(deferredEnterNow(this.state)) || 0) / 86400)}`;
  },

  /** One generated offer per station per day bucket pays the featured premium. The pick is a
   *  hash of (day key, station id, epoch, world seed) — deterministic inside a day × epoch ×
   *  save, and it never re-prices a retained or authored row: only plain procedural rolls with
   *  a real payout qualify. The boosted figure lands on reward_cr itself so the board, the
   *  dossier, and settlement all read the same honest number. */
  _markFeaturedOffer(offers, info, epoch) {
    const cfg = (this.state.missions && this.state.missions.config) || MISSION_TUNING;
    const spec = cfg.featured || {};
    const mult = Number(spec.rewardMult) || 0;
    if (!(mult > 1)) return null;
    const candidates = offers.filter((o) => o && !o.storyTag && !o.source && Number(o.reward_cr) > 0);
    if (!candidates.length) return null;
    const dayKey = this._dayKey();
    const pickHash = hash32(dayKey, info.id, epoch, (this.state.meta && this.state.meta.seed) || 0);
    const pick = candidates[pickHash % candidates.length];
    pick.featured = {
      dayKey,
      rewardMult: mult,
      repBonus: Math.max(0, Math.floor(Number(spec.repBonus) || 0)),
      baseRewardCr: pick.reward_cr,
    };
    pick.reward_cr = round(pick.reward_cr * mult);
    return pick;
  },

  /** Weighted pick of a mission type by OFFER_MIX (signature types rep-boosted, history overlaid). */
  _pickType(weights, rng, repBoost, stationType, historyTier = 'starter') {
    let total = 0;
    const w = new Array(TYPE_ORDER.length);
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      let weight = offerMixWeight(weights, TYPE_ORDER[i]);
      // signature types (weight>=3) get the friendly-rep boost.
      if (weight >= 3) weight *= repBoost;
      // Career overlay last: 0-weight (authored-only) types stay structurally zero at every tier.
      if (weight > 0) weight *= offerHistoryMultiplier(historyTier, TYPE_ORDER[i]);
      w[i] = weight; total += weight;
    }
    if (total <= 0) return TYPE_ORDER[0];
    let r = rng() * total;
    let lastWeighted = -1;
    for (let i = 0; i < w.length; i++) {
      if (w[i] > 0) lastWeighted = i;
      r -= w[i];
      if (r <= 0) return TYPE_ORDER[i];
    }
    // Float-rounding fallthrough: `r` can end a hair above 0 when rng() approaches 1. Return the
    // last WEIGHTED type rather than the last type in the registry — an authored-only type
    // (procedural weight 0, e.g. heist_intercept) has no _rollOffer/_rollParams case and must never
    // be reachable here.
    return TYPE_ORDER[lastWeighted >= 0 ? lastWeighted : TYPE_ORDER.length - 1];
  },

  /** Roll a concrete MissionOffer for a type at an origin station. */
  _rollOffer(typeId, info, rng, epoch, idx, options = {}) {
    const def = TYPE_BY_ID.get(typeId);
    if (!def) return null;
    // Authored-only types are never rolled. Second guard behind _pickType's weighted fallthrough:
    // a procedural roll of one would produce an offer with no params and no physical facility.
    if (def.proceduralWeight === 0) return null;
    // FB-066: a race offer exists only where a course exists — a lane endpoint sector runs the
    // chord's inside segment, a scenic sector runs its ring. A board with neither declines the
    // pick BEFORE any rng draw so a zero-course sector's rolls stay bit-identical to a mix that
    // never carried the column.
    const raceCourse = typeId === 'race' ? raceCourseForSector(info.sectorId) : null;
    if (typeId === 'race' && !raceCourse) return null;
    const cfg = this.state.missions.config || MISSION_TUNING;

    // Destination: pick a reachable station (or self for mining/recon-at-home).
    let dest = this._pickDestination(typeId, info, rng);
    let destStationId = dest ? dest.id : info.id;
    let destSectorId = dest ? dest.sectorId : info.sectorId;
    // Same-sector chain (D-hunter): a chained bounty may be locked to the sector the finished
    // mark lived in, so a hunter already working a field draws the next writ for the same
    // field instead of a fresh roll across the map. The lock re-points the destination only
    // when a berth-admitting station exists there; the rng draw count is unchanged either way.
    if (options.sectorLockSectorId && destSectorId !== options.sectorLockSectorId) {
      const locked = ALL_STATIONS.find((s) => s.sectorId === options.sectorLockSectorId
        && s.id !== info.id
        && stationBerthAdmits(s.record || s, this._repOf(s.factionId), this.state));
      if (locked) {
        dest = locked;
        destStationId = locked.id;
        destSectorId = locked.sectorId;
      }
    }
    const distance = sectorDistanceWu(info.sectorId, destSectorId);

    // Risk tier from the destination sector's danger, clamped to the type's allowed band.
    // Prefer the drifted (live) hazard so mission risk reflects the current world state (V2 §33/§35.3);
    // fall back to the static catalog dangerTier when sectorSim hasn't drifted this sector yet.
    const driftedTier = effectiveDangerTierFor(this.state, destSectorId);
    const hasDrift = !!(this.state && this.state.sectorSim && this.state.sectorSim.sectors[destSectorId] && this.state.sectorSim.sectors[destSectorId].drift);
    let sectorRisk;
    if (hasDrift) {
      sectorRisk = driftedTier;
    } else {
      const destSector = SECTOR_BY_ID.get(destSectorId);
      sectorRisk = destSector ? dangerTier(destSector) : 1;
    }
    const [rLo, rHi] = def.riskTierRange || [0, 1];
    let riskTier = clamp(economicRiskTier(typeId, sectorRisk, this._repOf(info.factionId)), rLo, rHi);
    // D85: a board's ANCHORED defining job (the writ walls' bounty exchange) stays inside the
    // standing band a rep-0 operator can accept while that board's faction has not Accepted them,
    // so the wall never opens on an epoch whose only writ is rep-gated out of reach — and the
    // entry writ retires (risk resumes scaling with destination danger) before it can be farmed.
    // Non-anchored slots always keep scaling with destination danger.
    if (options.anchor === true && this._repOf(info.factionId) < 30) {
      riskTier = Math.min(riskTier, missionStandingGateForMinRep(0).maxRisk);
    }
    // A chain is the same client asking for the next mark: it may not demand more standing
    // than the job just completed (the parent was accepted, so its tier is within reach).
    if (options.maxRiskTier != null) {
      riskTier = Math.min(riskTier, options.maxRiskTier);
    }
    // D59: a bounty pays the boarding board's local rate — the board sector's own tier and danger —
    // while standing and the destination's danger escalate the MARK (riskTier above: harder, longer
    // fights, more return fire), never the priced rate. Pricing destination/standing escalation into
    // the rate re-paid the same loop at operator-to-industrial wages and walked the hunter route out
    // of its healthy band within one session.
    const bountyPay = typeId === 'bounty_hunt';
    let payRiskTier = riskTier;
    let payTier = null;
    if (bountyPay) {
      const boardSector = SECTOR_BY_ID.get(info.sectorId);
      payRiskTier = clamp(boardSector ? dangerTier(boardSector) : 1, rLo, rHi);
      payTier = Math.max(info?.sectorTier ?? info?.tier ?? 0, payRiskTier);
    }

    // Per-type params (quota qty, target strength, scan count, commodity, …) + cargo value.
    const params = this._rollParams(typeId, info, dest, riskTier, rng);
    // LG-SPINE-HEADLINES — the live intro/chain types name the physical verb they ask the
    // player to perform, the same field the authored set-piece types stamp inline.
    if (!params.physicalVerb && MISSION_TYPE_PHYSICAL_VERB[typeId]) {
      params.physicalVerb = MISSION_TYPE_PHYSICAL_VERB[typeId];
    }

    // The writ wall names a person at a place: generated single-mark bounties carry a
    // deterministic storyTarget (seeded by offer id — never an rng draw, so every other rolled
    // field stays bit-identical). Ghost-convoy offers already own their place fiction.
    const offerId = `mo_${info.id}_${epoch}_${idx}`;

    // FB-066: the course record rides the offer's params verbatim — the derived geometry is
    // pure over frozen data, so the stamped copy is identical to what raceCourseForSector would
    // re-derive, and it survives save/load without depending on data staying frozen forever.
    if (raceCourse) {
      params.courseId = raceCourse.courseId;
      params.courseName = raceCourse.courseName;
      params.courseKind = raceCourse.kind;
      params.courseSectorId = raceCourse.sectorId;
      params.gates = raceCourse.gates.map((g) => ({ x: g.x, z: g.z }));
      params.gateRadiusWU = raceCourse.gateRadiusWU;
      params.courseLengthWU = raceCourse.courseLengthWU;
      params.recordS = raceCourse.recordS;
      params.bandCapsS = raceCourse.bandCapsS.slice();
      params.nextGate = 0;
    }

    // FB-067: the variant row rides the offer id's own hash lane — never an rng draw — so a
    // board with the same seed reproduces the same variant, and every other rolled field stays
    // bit-identical to a build with one variant row per type.
    const variantRows = PHYSICAL_MISSION_VARIANTS[typeId];
    if (variantRows && variantRows.length) {
      const variant = physicalMissionVariantFor(typeId,
        variantRows[(hash32(this.state.meta.seed, offerId, 'variant') >>> 0) % variantRows.length].id);
      params.variant = variant.id;
      if (Number.isFinite(variant.massMult)) {
        params.massU = Math.max(8, Math.round((params.massU || 30) * variant.massMult));
        // The tow pay terms are mass × price: re-price the value family for the heavier hull.
        params.cargoValue = params.massU * 22;
        params.fValue = 1 + params.cargoValue / 8000;
      }
      if (Number.isFinite(variant.bodyRadius)) params.bodyRadius = variant.bodyRadius;
      if (variant.scanLabel) params.scanLabel = variant.scanLabel;
      if (Number.isFinite(variant.escortCount)) params.escortCount = variant.escortCount;
      if (Number.isFinite(variant.podSpreadWu)) params.podSpreadWu = variant.podSpreadWu;
    }

    const bountyMark = (typeId === 'bounty_hunt' && !(params && params.ghostConvoy))
      ? rollBountyMark({ seed: this.state.meta.seed, offerId, sectorId: destSectorId,
          riskTier, sectorDef: SECTOR_BY_ID.get(destSectorId),
          exclude: this.state.missions && this.state.missions.killedMarkNames })
      : null;
    if (bountyMark) { params.markName = bountyMark.name; params.markPlace = bountyMark.placeName; }
    // placeName stays in params.markPlace — the stamped target keeps spawn-identity fields only.
    const { placeName: _markPlace, ...markStoryTarget } = bountyMark || {};

    // A1 "passengers are people": the board names the fare, not a seat count. Minted from
    // (world seed, offer id) — never an rng draw — so every other rolled field stays
    // bit-identical, the same offer reproduces the same person across save/load, and the
    // passenger_is_fugitive trap can interpolate this exact name at attach time.
    if (typeId === 'passenger_transport') {
      params.passenger = passengerIdentityFor(this.state.meta.seed, offerId, dest && dest.name);
    }

    // Economy Pulse: pay the net work budget, not a product of unbounded multipliers.
    const quotedTerms = priceProceduralOffer({type:typeId,info,dest,riskTier:payRiskTier,tier:payTier,distance,params,
      loyaltyMultiplier:this._repOf(info.factionId) >= (cfg.faction.friendlyThreshold || 25)
        ? (cfg.faction.loyaltyBonus || 1.15) : 1});
    // Head money: an ordinary board writ pays the hunter's overhead (gate tolls, return-fire repair,
    // countered writs) on top of the wage quote. Bounty-only; the quote's own tier/risk are untouched.
    const economyTerms = bountyPay && !(params && params.ghostConvoy)
      ? withBountyHeadMoney(quotedTerms, quotedTerms.tier) : quotedTerms;
    const reward_cr = economyTerms.rewardCr;
    const time_limit_s = economyTerms.deadlineS;
    const collateral_cr = def.collateral ? economyTerms.collateralCr : 0;
    const id = offerId;
    const offer = {
      id, type: typeId, stationId: info.id, factionId: info.factionId,
      reward_cr, time_limit_s, duration_s:time_limit_s, collateral_cr, riskTier,
      economyTerms,
      // SF-112/113: bind the premium to its named cause — a customs weir monitoring the lane in,
      // or the destination sector's own thin patrol cover. Pure derived-from-inputs text, so a
      // re-rolled offer reproduces the same note; the dossier prints it beside the risk band.
      riskNote: this._riskNoteFor(typeId, destSectorId, sectorRisk),
      destStationId, destSectorId, distance,
      params,
      title: this._titleFor(typeId, params, dest),
      brief: this._briefFor(typeId, params, dest, info),
      expiresAtEpoch: epoch + 1,
      storyTag: null,
      // placeName stays in params.markPlace — the stamped target keeps spawn-identity fields only.
      ...(bountyMark ? { storyTarget: markStoryTarget } : {}),
    };
    // Physics terms are the last thing stamped onto a rolled offer so the reward/deadline family
    // above is untouched: a condition-free offer is byte-identical to the shipped one. Variant
    // clauses ride the same seam — the authored variant's own term list on top of the rolled terms.
    const conditioned = options.attachConditions === false ? offer : this._withConditions(offer, epoch);
    return this._withVariantClauses(conditioned);
  },

  /**
   * FB-067 — the variant row's authored clause set, stamped after the random-term pass. Rows are
   * the same serializableMissionCondition records a rolled term uses, so the observer and the
   * tick evaluator need no knowledge of which ROW asked for them. Only rows the offer does not
   * already carry are appended (rolled terms win — same clause id never counts twice).
   */
  _withVariantClauses(offer) {
    if (!offer || !offer.params || !offer.params.variant) return offer;
    const variant = physicalMissionVariantFor(offer.type, offer.params.variant);
    const ids = variant && Array.isArray(variant.clauseIds) ? variant.clauseIds : [];
    if (!ids.length) return offer;
    const existing = Array.isArray(offer.clauses) ? offer.clauses.slice() : [];
    const briefBits = [];
    let changed = false;
    for (const clauseId of ids) {
      if (existing.some((row) => row && (row.conditionId === clauseId || row.id === clauseId))) continue;
      const row = serializableMissionCondition(clauseId);
      if (!row) continue;
      existing.push(row);
      changed = true;
      const def = missionConditionById(clauseId);
      if (def && def.brief) briefBits.push(def.brief);
    }
    if (!changed) return offer;
    const stamped = { ...offer, clauses: existing };
    if (briefBits.length) {
      stamped.brief = withClauseBriefSuffix(String(stamped.brief || '').trim(), briefBits.join(' '));
    }
    return stamped;
  },

  /**
   * Attach 0..2 physics conditions and fold their prose into the offer's one-line brief.
   * Seeded from (world seed, offer id) so a board reproduces exactly across save/load, and a no-draw
   * returns the offer object unchanged.
   *
   * LEGIBILITY: the terms ride in `offer.clauses`, which the station Contracts dossier already
   * renders as labelled tags with the prose as the tooltip, and the brief line the mission log and
   * star chart already print gains the short form. The player is told the rule BEFORE accepting,
   * again in the accept toast, and again the moment it trips.
   */
  _withConditions(offer, epoch) {
    if (!offer) return offer;
    const seed = (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, 'conditions', epoch)
      : (((this.state.meta.seed || 0) ^ 0x5bf03635) >>> 0);
    // Fine print runs FIRST: attachClauses assigns offer.clauses outright while conditions,
    // twists, and traps append through `existing`. Its 'clause' hash key is disjoint from the
    // 'condition'/'twist'/'trap' streams, so no prior draw moves.
    const withTerms = attachConditions(attachClauses(offer, seed), seed, { isFragile: isFragileCommodity });
    const twistSeed = (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, 'twists', epoch)
      : (((this.state.meta.seed || 0) ^ 0x71c3a91b) >>> 0);
    const trapSeed = (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, 'traps', epoch)
      : (((this.state.meta.seed || 0) ^ 0x3c6ef35f) >>> 0);
    const stamped = attachTrap(attachTwistClauses(withTerms, twistSeed), trapSeed);
    if (stamped === offer) return offer;
    const terms = (stamped.clauses || []).filter(isMissionConditionRow)
      .map((row) => missionConditionById(row.conditionId))
      .filter(Boolean);
    if (!terms.length) return stamped;
    const suffix = terms.map((c) => c.brief).filter(Boolean).join(' ');
    if (suffix) {
      // The chart inspector prints this as leg prose; the shipped generator clamps its half to 90,
      // so the combined line stays inside two short lines rather than reflowing the panel.
      stamped.brief = withClauseBriefSuffix(String(stamped.brief || '').trim(), suffix);
    }
    return stamped;
  },

  _rollBulkHaulOffer(info, rng, epoch, idx) {
    if (!info || info.type !== 'mining') return null;
    const dest = this._pickBulkHaulDestination(info, rng);
    if (!dest) return null;
    const cmdtyId = 'cmdty_ore_iron';
    const commodity = CMDTY_BY_ID.get(cmdtyId);
    const basePrice = commodity && commodity.basePrice || 28;
    const massU = BULK_HAUL_MIN_MASS_U + Math.floor(rng() * 16);
    const expectedPayout = round((massU * basePrice * BULK_HAUL_PAY_MULT) * (1 - BULK_HAUL_FEE));
    const distance = sectorDistanceWu(info.sectorId, dest.sectorId);
    const sectorRisk = dangerTier(SECTOR_BY_ID.get(dest.sectorId) || SECTOR_BY_ID.get(info.sectorId) || {});
    const riskTier = clamp(sectorRisk, 1, 3);
    const taskTime = massU * 2.5;
    const time_limit_s = round((distance / (MISSION_TUNING.cruiseSpeedRef || 140) + taskTime) * (MISSION_TUNING.slackDefault || 2.2));
    return this._withConditions({
      id: `mo_${info.id}_${epoch}_${idx}`,
      type: BULK_HAUL_TYPE,
      stationId: info.id,
      factionId: info.factionId,
      reward_cr: 0,
      time_limit_s,
      collateral_cr: 0,
      riskTier,
      destStationId: dest.id,
      destSectorId: dest.sectorId,
      distance,
      params: { cmdtyId, massU, basePrice, expectedPayout, fValue: 1, taskTime },
      title: `Tether-haul ${massU}u ${commodity ? commodity.name : 'Ore'} to ${dest.name}`,
      brief: `${massU}u on the tether to ${dest.name}. Paid on mass landed, not mass hooked.`,
      expiresAtEpoch: epoch + 1,
      storyTag: null,
      hotTip: false,
    }, epoch);
  },

  _rollStoryBranchIntroOffer(info, rng, epoch) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch) return null;
    const intro = BRANCH_INTRO_BY_FACTION.get(info.factionId);
    if (!intro) return null;
    // Pinned saves (an outcome token already exists) earn only the stake door; live and
    // legacy saves see all three introductions (PQ-032.02).
    const flags = story.flags || {};
    const pinned = !flags.elroy_outcome_legacy && !!flags.elroy_outcome;
    const stake = pinned ? getPickSideStake(flags.elroy_outcome) : null;
    if (stake && (info.id !== stake.stationId || intro.branch !== stake.branch)) return null;
    const offer = this._rollOffer(
      intro.type,
      info,
      rng,
      epoch,
      `${intro.branch}_intro`,
      { attachConditions: false },
    );
    if (!offer) return null;
    offer.id = `mo_${info.id}_${epoch}_${intro.branch}_intro`;
    offer.storyTag = STORY_BRANCH_INTRO_TAG;
    offer.storyBranch = intro.branch;
    offer.title = intro.title;
    // B4 is mandatory story work, not a bankroll gate. The procedural offer may inherit a
    // distance-scaled collateral (well above one million credits on the Coalition route), which
    // can make the authored consequence impossible to accept after legitimately reaching it.
    // Keep collateral on ordinary contracts; the consequence stake here is completing the work.
    offer.collateral_cr = 0;
    // B4 paperwork: one clearing administrator for all three doors.
    offer.adminField = 'V. DIRECTOR, ACTING / REF 44-C';
    offer.authorization = 'CLEARING: V. DIRECTOR, ACTING / REF 44-C';
    if (stake) {
      offer.storyStake = stake.id;
      offer.title = stake.label;
      offer.riskTier = Math.max(2, offer.riskTier || 0);
      if (offer.type === 'patrol_clear') {
        offer.params.clearCount = Math.max(2, offer.params.clearCount || 1);
        offer.params.targetStrength = Math.max(1.35, offer.params.targetStrength || 1);
      } else if (offer.type === 'bulk_trade') {
        offer.params.qty = Math.max(8, offer.params.qty || 1);
      }
    }
    return offer;
  },

  /** Pick a destination station for a mission type (deterministic). Cargo/escort/passenger want a
   *  different station; bounty/patrol/recon happen out in a (possibly self) sector; mining delivers
   *  back to the origin (a buyer). */
  _pickDestination(typeId, info, rng) {
    // Mining quota: deliver to origin (it buys ore). Recon/bounty/patrol: pick a nearby sector.
    // A race posts on its own course — the board's sector IS the destination.
    if (typeId === 'mining_quota' || typeId === 'race') return info;
    // Prefer a discovered/known station; fall back to any in the catalog within a few hops.
    // Two real gates ride the station record: 'scan' is a customs sweep (a smuggling run can't
    // target it), and a repGated berth refuses a pilot below positive standing — routing either
    // of those contracts to it writes a contract the world cannot settle.
    const candidates = ALL_STATIONS.filter((s) => s.id !== info.id
      && !(typeId === 'smuggling_run' && Array.isArray(s.services) && s.services.includes('scan'))
      && stationBerthAdmits(s.record || s, this._repOf(s.factionId), this.state));
    if (!candidates.length) return info;
    // Bias toward same-or-adjacent sectors for fair timers (fairness note: nearer for slow ships).
    const sec = SECTOR_BY_ID.get(info.sectorId);
    const near = candidates.filter((s) => s.sectorId === info.sectorId
      || (sec && (sec.neighbors || []).includes(s.sectorId)));
    const pool = near.length ? near : candidates;
    return pool[Math.floor(rng() * pool.length)];
  },

  _pickBulkHaulDestination(info, rng) {
    const refineries = ALL_STATIONS.filter((s) => (s.type === 'refinery' || s.services && s.services.includes('refine'))
      && stationBerthAdmits(s.record || s, this._repOf(s.factionId), this.state));
    if (!refineries.length) return info;
    const same = refineries.filter((s) => s.sectorId === info.sectorId);
    if (same.length) return same[Math.floor(rng() * same.length)];
    const sec = SECTOR_BY_ID.get(info.sectorId);
    const near = refineries.filter((s) => sec && (sec.neighbors || []).includes(s.sectorId));
    const pool = near.length ? near : refineries;
    return pool[Math.floor(rng() * pool.length)];
  },

  /** Roll the type-specific parameters and the f_value scaler. */
  _rollParams(typeId, info, dest, riskTier, rng) {
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    switch (typeId) {
      case 'cargo_delivery':
      case 'passenger_transport': {
        const cmdtyId = typeId === 'cargo_delivery' ? pick(LEGAL_TRADE_CMDTYS.filter((id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= Math.max(info.sectorTier || 0,dest?.sectorTier || 0))) : null;
        const qty = typeId === 'cargo_delivery' ? (6 + Math.floor(rng() * 16)) : 1; // 6..21u or 1 passenger
        const unitVal = cmdtyId ? (CMDTY_BY_ID.get(cmdtyId).basePrice || 50) : 0;
        const cargoValue = cmdtyId ? unitVal * qty : 800;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20, passengers: typeId === 'passenger_transport' ? 1 : 0 };
      }
      case 'bulk_trade': {
        const cmdtyId = pick(LEGAL_TRADE_CMDTYS.filter((id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= Math.max(info.sectorTier || 0,dest?.sectorTier || 0)));
        const qty = 12 + Math.floor(rng() * 28); // 12..39u quota to sell at dest
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 50;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, progress: 0, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: qty * 1.5 };
      }
      case 'mining_quota': {
        const cmdtyId = pick(MINEABLE_CMDTYS.filter((id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= Math.max(info.sectorTier || 0,dest?.sectorTier || 0)));
        const qty = 10 + Math.floor(rng() * 30); // 10..39u
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 30;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, progress: 0, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: qty * 3 };
      }
      case 'salvage_retrieval': {
        const cmdtyId = pick(['cmdty_scrap_metal', 'cmdty_salvage_electronics']);
        const qty = 4 + Math.floor(rng() * 10);
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 30;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 30 };
      }
      case 'smuggling_run': {
        const cmdtyId = pick(CONTRABAND_CMDTYS);
        const qty = 4 + Math.floor(rng() * 12);
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 150;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20 };
      }
      case 'bounty_hunt': {
        const targetStrength = 1.2 + riskTier * 0.5 + rng() * 0.6; // ~1.2..3.8
        return { clearCount: 1, killCount: 0, targetStrength, fValue: targetStrength, taskTime: 60 };
      }
      case 'escort': {
        const targetStrength = 1.0 + riskTier * 0.4 + rng() * 0.5;
        // A convoy, not a lone hull: one named lead plus wing haulers, with a raider wing
        // working the final approach. Ambush size tracks the board's risk tier (2..4).
        const convoySize = 3;
        const ambushSize = 2 + Math.min(2, Math.max(0, Math.floor(riskTier)));
        return { targetStrength, convoySize, ambushSize, fValue: targetStrength, taskTime: 90 };
      }
      case 'patrol_clear': {
        const clearCount = 2 + Math.floor(rng() * 3); // 2..4 hostiles
        const targetStrength = (1.0 + riskTier * 0.4) * clearCount * 0.6;
        return { clearCount, killCount: 0, targetStrength, fValue: targetStrength, taskTime: clearCount * 45 };
      }
      case 'recon_scan': {
        const scanTargets = 1 + Math.floor(rng() * 3); // 1..3 beacons
        return { scanTargets, progress: 0, fValue: 1 + scanTargets * 0.25, taskTime: scanTargets * 25 };
      }
      case 'tow_recovery': {
        // SF-117 — the ceiling is the fit's real tow class: a stronger drive grows the heaviest
        // core this board will post, and the extra pay comes through the real cargoValue terms
        // (mass × price), never a multiplier. Under the standard band nothing changes, and a
        // lighter fit is never refused — the mass law decides whether the load gets under way.
        const towCeil = Math.max(45, Math.floor(this._playerTowClassMassT() * 1.15));
        const massU = 28 + Math.floor(rng() * (towCeil - 27));
        const cargoValue = massU * 22;
        return {
          massU, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 40,
          physicalVerb: 'tow', completionMethods: ['tow_in', 'sling_in'],
        };
      }
      case 'demolition': {
        const targetStrength = 1.1 + riskTier * 0.35 + rng() * 0.4;
        return {
          targetStrength, fValue: targetStrength, taskTime: 50,
          physicalVerb: 'knock_down', completionMethods: ['wrecking_ball', 'cut_down'],
        };
      }
      case 'rescue_under_fire': {
        const podCount = 2;
        const escortCount = 2;
        const targetStrength = 1.0 + riskTier * 0.35 + rng() * 0.4;
        return {
          podCount, escortCount, escortsDown: 0, podsLost: 0,
          targetStrength, fValue: targetStrength, taskTime: 70,
          physicalVerb: 'pull', completionMethods: ['stage_tow', 'corridor_pull'],
        };
      }
      case 'race': {
        // The course record itself is stamped by _rollOffer (it owns the sector guard). Params
        // here price the work: the clock is the risk — a hotter sector posts the same course
        // with the same bands and pays its tier through the ordinary economy terms.
        const targetStrength = 1.0 + riskTier * 0.25 + rng() * 0.3;
        return { targetStrength, fValue: targetStrength, taskTime: 80 };
      }
      default:
        return { fValue: 1, taskTime: 30 };
    }
  },

  /**
   * SF-117 — the fit's real tow class in tonnes, read off the player entity's published derived
   * block (the same block the fit screen and the tether law consume). 0 when no block exists —
   * callers fall back to the standard band rather than guessing.
   */
  _playerTowClassMassT() {
    const p = this.state && this.state.entities && this.state.entities.get(this.state.playerId);
    const derived = p && p.data && p.data.derived;
    return derived ? Math.max(0, Number(towClassMassFor(derived)) || 0) : 0;
  },

  /**
   * SF-112/113 — name the complication the price is actually paying for. `sectorRisk` here is the
   * destination sector's authored/live danger already fed into the quote — not a fresh signal — so
   * the note and the premium can never disagree. A smuggling lane into a weir sector names the
   * customs line (that jurisdiction scan is the priced threat); other elevated-risk destinations
   * name the sector's own thin cover. Quiet destinations get no note rather than a label.
   */
  _riskNoteFor(typeId, destSectorId, sectorRisk) {
    if (typeId === 'smuggling_run') {
      const weir = customsWeirForSector(destSectorId);
      if (weir) {
        const weirSector = SECTOR_BY_ID.get(weir.sectorId);
        return `the ${weirSector && weirSector.name || 'border'} customs weir scans this lane`;
      }
    }
    const tier = Math.max(0, Math.round(Number(sectorRisk) || 0));
    if (tier < 2) return null;
    const destSector = SECTOR_BY_ID.get(destSectorId);
    const name = destSector && destSector.name ? destSector.name : 'the destination sector';
    const word = tier >= 4 ? 'lawless' : tier >= 3 ? 'contested' : 'patrol-thin';
    return `${name} is ${word} — the premium pays for the crossing`;
  },

  _titleFor(typeId, p, dest) {
    const destName = dest ? dest.name : 'destination';
    const cName = (id) => { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; };
    switch (typeId) {
      case 'cargo_delivery': return `Haul ${p.qty}u ${cName(p.cmdtyId)} to ${destName}`;
      case 'bulk_trade': return `Sell ${p.qty}u ${cName(p.cmdtyId)} at ${destName}`;
      case 'mining_quota': return `Mine ${p.qty}u ${cName(p.cmdtyId)}`;
      case 'salvage_retrieval': return `Recover ${p.qty}u ${cName(p.cmdtyId)} for ${destName}`;
      case 'smuggling_run': return `Smuggle ${p.qty}u ${cName(p.cmdtyId)} to ${destName}`;
      case 'bounty_hunt': return p.markName
        ? `Eliminate ${p.markName}${p.markPlace ? ` — ${p.markPlace}` : ` near ${destName}`}`
        : `Eliminate a wanted target near ${destName}`;
      case 'escort': return `Escort a convoy to ${destName}`;
      case 'patrol_clear': return `Clear ${p.clearCount} hostiles near ${destName}`;
      case 'recon_scan': return `Scan ${p.scanTargets} site(s) near ${destName}`;
      case 'passenger_transport': return p.passenger
        ? `Take ${p.passenger.name} to ${destName}`
        : `Transport a passenger to ${destName}`;
      case 'tow_recovery': return p.variant === 'drift_hulk'
        ? `Tow the dead freighter to ${destName}`
        : `Tow the ${p.massU} t slag core to ${destName}`;
      case 'demolition': return p.variant === 'guarded_tower'
        ? `Knock down the picketed tower near ${destName}`
        : `Knock down the tower near ${destName}`;
      case 'rescue_under_fire': return p.variant === 'pocket_pull'
        ? `Pull the pods out of the pocket near ${destName}`
        : `Pull the pods out of ${destName}`;
      case 'race': return `Run the ${p.courseName || 'gate course'} gates`;
      case AUTHORED_SET_PIECE_TYPE: return p.title || `Physical set piece at ${destName}`;
      case CAPITAL_BOSS_TYPE: return p.title || CAPITAL_BOSS.title;
      default: return `Contract at ${destName}`;
    }
  },

  /**
   * One dry line of leg prose stamped onto the offer as `brief`. The title says what the contract is
   * called; the brief says what the leg is actually for. Composed from the same commodity/destination
   * material rather than hand-authored, so generated work reads like authored work. Working-space
   * voice, clamped to 90 chars. Read by src/ui/galaxyMap.js (`missionChartBrief`) and the mission log.
   */
  _briefFor(typeId, p, dest, origin) {
    const destName = dest && dest.name ? dest.name : 'the destination';
    const fromName = origin && origin.name ? origin.name : 'here';
    const cName = (id) => { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; };
    const clamp90 = (line) => (line.length <= 90 ? line : `${line.slice(0, 87).trimEnd()}...`);
    let line;
    switch (typeId) {
      case 'cargo_delivery':
        line = `${p.qty}u ${cName(p.cmdtyId)} out of ${fromName}. ${destName} signs for it or nobody eats.`;
        break;
      case 'bulk_trade':
        line = `Move ${p.qty}u ${cName(p.cmdtyId)} across ${destName}. Their books, your margin.`;
        break;
      case 'mining_quota':
        line = `${p.qty}u ${cName(p.cmdtyId)} out of the rock. Nobody asks which rock.`;
        break;
      case 'salvage_retrieval':
        line = `${p.qty}u ${cName(p.cmdtyId)} off a dead hull on the ${destName} drift. ${destName} wants it back on the books.`;
        break;
      case 'smuggling_run':
        line = `${p.qty}u ${cName(p.cmdtyId)} into ${destName}. Customs is the whole job.`;
        break;
      case 'bounty_hunt':
        line = p.markName
          ? `${destName} posted a writ on ${p.markName}${p.markPlace ? `, holding ${p.markPlace}` : ''}. Pay on hull, not on story.`
          : `Someone working near ${destName} is worth more dead. Paperwork is already filed.`;
        break;
      case 'escort':
        line = `Convoy into ${destName} on the final leg. Raiders work this lane — paid on arrivals.`;
        break;
      case 'patrol_clear':
        line = `${p.clearCount} hostiles sitting on the lanes near ${destName}. Clear the lane.`;
        break;
      case 'recon_scan':
        line = `${p.scanTargets} site(s) near ${destName} need a real reading, not a rumor.`;
        break;
      case 'passenger_transport':
        line = p.passenger
          ? `${p.passenger.name} to ${destName}. ${p.passenger.why}`
          : `One passenger to ${destName}. Quiet trip, quiet fee.`;
        break;
      case 'tow_recovery':
        line = p.variant === 'drift_hulk'
          ? `A dead freighter sits off the ${destName} drift — heavier, colder. Tow it or sling it.`
          : `Tow the slag core into ${destName}, or sling it in on a clean release.`;
        break;
      case 'demolition':
        line = p.variant === 'guarded_tower'
          ? `The tower near ${destName} has a crew sitting on it. Knock it down anyway.`
          : `Knock the dead tower down near ${destName}. Swing mass, or cut it.`;
        break;
      case 'rescue_under_fire':
        line = p.variant === 'pocket_pull'
          ? `Pods bunched in the pocket near ${destName}, heavier cover on top. Pull one out.`
          : `Pull the pods out of the field near ${destName}. Tow one, or open a corridor.`;
        break;
      case 'race':
        line = `${p.gates ? p.gates.length : 6} gates on the ${p.courseName || 'course'}, in order, on the clock. Record is ${p.recordS}s.`;
        break;
      case AUTHORED_SET_PIECE_TYPE:
        line = p.brief || `Physical job at ${destName}. Two ways through.`;
        break;
      case CAPITAL_BOSS_TYPE:
        line = p.brief || CAPITAL_BOSS.brief;
        break;
      default:
        line = `Work out of ${fromName}. Terms are on the contract.`;
    }
    return clamp90(line);
  },
};
