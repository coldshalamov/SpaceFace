// Missions, contracts & story-spine system (ARCHITECTURE §2.3 step 15, §3.11 state, §4.4 event
// table; design/specs/07-missions-contracts-story-spine.md).
//
// A LISTENER-AND-GRANTER subsystem. It owns three things:
//   1. Per-station mission BOARDS  — deterministically generated from a seeded hash of
//      (meta.seed, stationId, refreshEpoch) so save/load reproduces the same offers exactly.
//   2. ACTIVE mission instances    — a lifecycle FSM offered→accepted→active→done/failed/expired.
//   3. An 8-beat STORY FSM         — first-X triggers (first mine/trade/kill/dock/buy ship/…) that
//      advance state.story.beatIndex and toast the player a direction.
//
// It NEVER owns the wallet, cargo, or reputation (§0.6). It detects progress from events other
// systems emit and pays out by emitting intents:
//   economy:grantCredits / economy:chargeCredits  (economy is the sole credits writer)
//   faction:repDelta                                (factions is the sole rep writer)
//   mission:completed{factionId,repMult}            (factions derives the offering-faction reward
//                                                     from THIS payload — see REP ACCOUNTING below)
//   research:pointsChanged                          (missions is a legit researchPoints writer §3.5)
//
// REP ACCOUNTING (avoid double-counting — factions.js already derives some rep on its own):
//   • Offering-faction COMPLETION reward → carried on mission:completed{factionId,repMult}; factions'
//     mission:completed handler applies applyRep(factionId, 15*repMult). We DON'T also emit a
//     faction:repDelta for that faction. We pick repMult so 15*repMult == the spec's risk-scaled gain.
//   • bounty/patrol pirate-faction penalty → factions' entity:killed handler already lowers the
//     victim faction's rep. We don't re-emit it.
//   • smuggling bust law-faction hit → economy/customs' contraband:scanned already applies it.
//   • FAILURE/EXPIRY penalty → we emit faction:repDelta{offeringFaction, negative}. We keep the
//     mission:failed/expired payload factionId-FREE (per §4.4) so factions' onMissionLost no-ops and
//     doesn't double-penalise.
//   • Secondary/story-only deltas with no other channel (e.g. B4 "opposing -10") → faction:repDelta.
//
// DETERMINISM (§0.5): board offers + spawn rolls use mulberry32(hash32(seed, …)); never Math.random.
import {
  MISSION_TYPES, STORY_BEATS, OFFER_MIX, MISSION_TUNING,
  missionMinRepForRisk,
  STORY_BRANCH_INTROS,
  STORY_BRANCH_INTRO_MIN_REP,
  STORY_BRANCH_INTRO_TAG,
} from '../data/missions.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import { zonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { effectiveDangerTierFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for mission risk
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { makeEnemySpawnSpec } from './combat.js';
import {
  RECORD_KIND,
  missionIdentityOf,
  stableRecordId,
} from '../world/worldRecords.js';
// Cargo single-writer helper (same pattern economy.js uses) — delivery missions consume the
// required cargo through this so usedVolume/usedMass caches stay correct (§0.6).
import { addCargo, removeCargo } from './cargo.js';
// Campaign 47-A sidecar: observe/gate/receipt only — never owns beatIndex/branch/rewards.
import {
  ensureCampaign47aState,
  buildMissionBoardContract,
  buildEndgameBoardOffers,
  failEncounter,
  initCampaignSidecar,
  isBeatStepsComplete,
  getEmbodiedLocation,
  recordBeatStep,
  syncObservedBeat,
  recoveryCommsForBeat,
} from '../story/campaign47a/index.js';

// ── Static lookups (built once from pure data) ───────────────────────────────────────────────
const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));
// Offer-mix arrays are ordered to match MISSION_TYPES; remember that order for weighted picks.
const TYPE_ORDER = MISSION_TYPES.map((t) => t.type);
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

// station id → { type, size, factionId, sectorId, sectorTier, security } resolved from the SECTORS
// graph (dock:docked only hands us a stationId, same pattern economy uses).
const STATION_INFO = new Map();
const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      id: st.id, name: st.name, type: st.type, size: st.size || 'M',
      factionId: st.factionId || sec.factionId, sectorId: sec.id,
      sectorTier: sec.tier, security: sec.security,
    });
  }
}
const ALL_STATIONS = [...STATION_INFO.values()];

// Commodities a player can plausibly haul for delivery / be asked to mine / smuggle.
const LEGAL_TRADE_CMDTYS = COMMODITIES.filter((c) => c.legality === 'legal').map((c) => c.id);
const MINEABLE_CMDTYS = COMMODITIES.filter((c) => (c.producedBy || []).includes('mining')).map((c) => c.id);
const CONTRABAND_CMDTYS = COMMODITIES.filter((c) => c.legality === 'contraband' || c.legality === 'restricted').map((c) => c.id);
const ONE_LOAD_CARGO_TYPES = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);
const MISSION_RECEIPT_LIMIT = 10;
const BULK_HAUL_TYPE = 'bulk_haul';
const BULK_HAUL_MIN_MASS_U = 25;
const BULK_HAUL_PAY_MULT = 0.8;
const BULK_HAUL_FEE = 0.06;
const MISSION_HOSTILE_SPAWN_MIN_WU = 1700;
const MISSION_HOSTILE_SPAWN_MAX_WU = 2600;
const MISSION_HOSTILE_SPAWN_ATTEMPTS = 24;
const MISSION_PORT_SAFE_RADIUS_WU = 1200;
export const CONTRACT_47A_B0_TAG = 'campaign47a:b0:recovery';
export const CONTRACT_47A_SAMPLE_ID = 'cmdty_47a_assay_sample';
export const CONTRACT_47A_B1_TAG = 'campaign47a:b1:honest_work';
const CONTRACT_47A_REWARD_CR = 400;

// Station size → tier number used for slot count (S=0,M=1,L=2).
const SIZE_TIER = { S: 0, M: 1, L: 2 };

// Story branch → faction mapping (B4/B5 spec).
const BRANCH_FACTION = Object.fromEntries(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro.factionId]));
const BRANCH_INTRO_BY_FACTION = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.factionId, intro]));
const BRANCH_INTRO_BY_BRANCH = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro]));
const HOME_FACTION = 'faction_scn'; // resolves STORY_BEATS B0 reward.rep.faction === 'home'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

function cargoFootprint(offer) {
  const p = offer && offer.params || {};
  if (!p.cmdtyId || !(p.qty > 0)) return 0;
  const commodity = CMDTY_BY_ID.get(p.cmdtyId);
  const volPerU = commodity && commodity.volPerU > 0 ? commodity.volPerU : 1;
  return Math.floor(p.qty) * volPerU;
}

function fmtCargoUnits(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
}

function factionShortName(factionId) {
  const fac = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (fac && (fac.short || fac.name)) || 'this faction';
}

function isStoryBranchIntroOffer(offer, state) {
  const intro = storyBranchIntroForOffer(offer);
  return !!(
    intro &&
    state && state.story && state.story.beatIndex === 4 &&
    (offer.storyTag === STORY_BRANCH_INTRO_TAG || offer.storyTag === 4)
  );
}

function storyBranchIntroForOffer(offer) {
  if (!offer || !offer.factionId) return null;
  const intro = BRANCH_INTRO_BY_FACTION.get(offer.factionId);
  if (!intro) return null;
  if (offer.storyBranch && offer.storyBranch !== intro.branch) return null;
  return intro;
}

function missionOfferMinRep(offer, state = null) {
  if (isStoryBranchIntroOffer(offer, state)) return STORY_BRANCH_INTRO_MIN_REP;
  const explicit = Number(offer && offer.minRep);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  return missionMinRepForRisk(offer && offer.riskTier);
}

// Map-space distance between two sectors → world-unit-ish path length (deterministic, bounded).
// Sector map positions are small integers (±~11); scale to a sensible wu range and floor same-sector.
function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600; // intra-sector hop
  const a = SECTOR_BY_ID.get(aSectorId), b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

function missionNavReason(m, station, sector) {
  const p = m && m.params || {};
  const commodity = p.cmdtyId && CMDTY_BY_ID.get(p.cmdtyId);
  const cargo = commodity ? commodity.name : 'cargo';
  const stationName = station && station.name || 'destination';
  const sectorName = sector && sector.name || 'target sector';
  const remaining = Math.max(0, (m.objectiveTarget || p.qty || 1) - (m.objectiveProgress || 0));
  if (m.storyTag === CONTRACT_47A_B0_TAG) {
    return p.sampleRecovered
      ? 'Deliver the 47-A sample to Helios Station'
      : 'Recover the 47-A sample from the marked rock';
  }
  if (m.storyTag === CONTRACT_47A_B1_TAG) {
    return p.cargoRecoveryNeeded
      ? 'Return to Helios for replacement cargo'
      : 'Deliver sealed alloys to Tycho; compare the manifest';
  }
  switch (m.type) {
    case 'cargo_delivery': return `Deliver ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'bulk_trade': return `Sell ${remaining || p.qty || ''}u ${cargo} at ${stationName}`.trim();
    case BULK_HAUL_TYPE: return `Tether-haul ${remaining || p.massU || ''}u bulk ore to ${stationName}`.trim();
    case 'mining_quota': return `Mine ${remaining || p.qty || ''}u ${cargo}`.trim();
    case 'salvage_retrieval': return `Recover ${p.qty || ''}u ${cargo} for ${stationName}`.trim();
    case 'smuggling_run': return `Smuggle ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'passenger_transport': return `Transport passenger to ${stationName}`;
    case 'escort': return `Escort convoy to ${stationName}`;
    case 'bounty_hunt': return `Find the bounty near ${sectorName}`;
    case 'patrol_clear': return `Clear hostiles in ${sectorName}`;
    case 'recon_scan': return `Scan sites in ${sectorName}`;
    default: return stationName || sectorName;
  }
}

export const missions = {
  name: 'missions',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const state = this.state, bus = this.bus;

    // Ensure the state tree exists (gameState seeds it, but be defensive for headless tests).
    if (!state.missions) state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
    state.missions.receipts = normalizeMissionReceipts(state.missions.receipts);
    if (!state.story) state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    if (!state.missions.config) state.missions.config = MISSION_TUNING;

    this._lastDockedStation = null;
    this._spawnSeq = 0; // disambiguates re-spawns of the same mission target across visits
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;

    // New game → seed config + reset boards/active (idempotent: a load may already have populated).
    bus.on('game:started', () => this.newGame());
    bus.on('tutorial:finished', () => this._releaseStoryNavigationAfterTutorial());
    bus.on('save:loaded', () => this._restoreNavigationAfterLoad());

    // ── Player intents (UI) ────────────────────────────────────────────────────────────────
    bus.on('ui:acceptMission', (p) => this.acceptMission(p && p.missionId));
    bus.on('ui:abandonMission', (p) => this.abandonMission(p && p.missionId));
    bus.on('ui:trackMission', (p) => { if (p && p.missionId) this.trackMission(p.missionId); });
    // Economy-born contracts are emit-only producers. Missions remains the sole board/active
    // authority and boards only a complete, normal offer shape; discovery-only salvage hooks keep
    // their existing consumers and cannot accidentally become malformed board entries.
    bus.on('mission:offered', (p) => this._onExternalBoardOffer(p));

    // ── Docking: refresh expired boards, run delivery/passenger/escort/salvage objectives ────
    bus.on('dock:docked', (p) => {
      const stationId = p && p.stationId;
      if (!stationId) return;
      this._lastDockedStation = stationId;
      this.ensureBoard(stationId);
      this._onDockedObjectives(stationId);
      this._storyTrigger('dock', { stationId });
    });
    bus.on('dock:undocked', () => {
      this._lastDockedStation = null;
      this._activateContract47aB1OnDeparture();
    });

    // ── Objective tracking listeners ─────────────────────────────────────────────────────────
    // bulk_trade quota: sell qty of the target commodity (trade.sold alias → economy:tradeCompleted).
    bus.on('economy:tradeCompleted', (p) => this._onTrade(p));
    // mining_quota: aggregate mined units of the target commodity.
    bus.on('mining:yield', (p) => this._onMiningYield(p));
    // bulk_haul: tethered bulk chunks delivered at refinery docks.
    bus.on('mining:bulkHaulDelivered', (p) => this._onBulkHaulDelivered(p));
    // bounty_hunt / patrol_clear: a tagged hostile died to the player.
    bus.on('entity:killed', (p) => this._onKill(p));
    // escort fail: escortee destroyed.
    bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p));
    // recon_scan: a scan target (or sector scan) completed.
    bus.on('scan:completed', (p) => this._onScan(p));
    // smuggling bust: a patrol scan caught contraband.
    bus.on('player:scannedByPatrol', (p) => this._onScannedByPatrol(p));

    // ── Lazy mission-target spawning when the player enters a target sector ───────────────────
    bus.on('sector:enter', (p) => this._onSectorEnter(p));
    bus.on('sector:exit', (p) => this._onSectorExit(p));

    // ── Story-beat triggers from other systems ───────────────────────────────────────────────
    bus.on('ship:purchased', (p) => this._storyTrigger('ship_purchased', p || {}));
    bus.on('asset:deployed', (p) => this._storyTrigger('asset_deployed', p || {}));
  },

  // =========================================================================================
  // PER-TICK: TTL decrement, expiry, story-gate checks, stale-target GC.
  // =========================================================================================
  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return; // sim frozen while docked/paused
    const active = state.missions.active;
    const now = state.simTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (m.status !== 'active') continue;
      // Expiry by deadline.
      if (m.deadline_s != null && Number.isFinite(m.deadline_s) && now >= m.deadline_s) { this._expireMission(m, i); continue; }
      // Escort: steer the friendly escortee toward the destination each tick.
      if (m.type === 'escort' && m._escorteeId != null) this._steerEscortee(m, state, dt);
    }
    // Story credit/net-worth gates are checked opportunistically (cheap, no per-frame DOM).
    this._checkStoryGates();
    this._navRefreshT = (this._navRefreshT || 0) + (dt || 0);
    if (this._navRefreshT >= 0.75) {
      this._navRefreshT = 0;
      this._refreshNavigation();
    }
  },

  // =========================================================================================
  // BOARD GENERATION (deterministic, stable within an epoch)
  // =========================================================================================
  /** Current refresh epoch for the world clock (shared across stations — they roll independently
   *  via the per-station hash, but all advance on the same cadence). */
  _epoch() {
    const cfg = this.state.missions.config || MISSION_TUNING;
    return Math.floor((this.state.simTime || 0) / (cfg.refreshSec || 600));
  },

  /** Build (or refresh) a station's board iff missing or its epoch advanced. Stable within an epoch
   *  so accepted/expired offers don't reappear mid-visit. */
  ensureBoard(stationId) {
    const state = this.state;
    const info = STATION_INFO.get(stationId);
    if (!info) return null; // gates / unknown stations have no board
    const epoch = this._epoch();
    let board = state.missions.boards[stationId];
    if (board && board.refreshEpoch === epoch && board.slots && !this._boardNeedsStoryBranchIntro(info, board)) {
      if (this._syncEmbodiedStoryOffer(info, board, epoch)) {
        this.bus.emit('mission:updated', { missionId: null, stationId });
      }
      return board;
    }
    board = { refreshEpoch: epoch, slots: this._generateOffers(info, epoch) };
    this._syncEmbodiedStoryOffer(info, board, epoch);
    state.missions.boards[stationId] = board;
    this.bus.emit('mission:updated', { missionId: null });
    return board;
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
    const offer = buildMissionBoardContract(beat, { seed, epoch, branch, chainStep });
    const activeTags = new Set((this.state.missions.active || [])
      .filter((mission) => mission && mission.status === 'active' && mission.storyTag)
      .map((mission) => mission.storyTag));
    const keepTag = offer && offer.type ? offer.storyTag : null;
    const before = board.slots.length;
    board.slots = board.slots.filter((candidate) => !(
      candidate && typeof candidate.storyTag === 'string'
      && candidate.storyTag.startsWith('campaign47a:')
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
    const active = new Set(board.slots.map((offer) => offer && offer.storyDisposition).filter(Boolean));
    for (const offer of offers) if (!active.has(offer.storyDisposition)) board.slots.unshift(offer);
    this.bus.emit('mission:updated', { missionId: null, stationId });
    return true;
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
   * Adopt an emit-only field contract into the normal board without accepting it.
   * Idempotent by stable offer id and capped at one economyContract row per station epoch.
   */
  _onExternalBoardOffer(rawOffer) {
    const allowedSource = rawOffer && (
      rawOffer.source === 'economyContract'
      || rawOffer.source === 'encounterAftermath'
      || rawOffer.source === 'careerContract'
      || rawOffer.source === 'postEndingReplay'
    );
    if (!allowedSource) return false;
    if (!rawOffer.id || !rawOffer.type || !rawOffer.stationId || !rawOffer.params) return false;
    const info = STATION_INFO.get(rawOffer.stationId);
    if (!info || !TYPE_BY_ID.has(rawOffer.type)) return false;
    const epoch = this._epoch();
    if (Number.isFinite(rawOffer.expiresAtEpoch) && rawOffer.expiresAtEpoch <= epoch) return false;
    if ((this.state.missions.active || []).some((m) => m && m.id === rawOffer.id)) return false;
    if ((this.state.missions.completedLog || []).some((m) => m && m.id === rawOffer.id)) return false;

    const board = this.ensureBoard(rawOffer.stationId);
    if (!board || !Array.isArray(board.slots)) return false;
    if (board.slots.some((offer) => offer && offer.id === rawOffer.id)) return false;
    if (board.slots.some((offer) => offer && offer.source === rawOffer.source)) return false;

    let offer;
    try { offer = JSON.parse(JSON.stringify(rawOffer)); } catch (_) { return false; }
    board.slots.unshift(offer);
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
      const epoch = this._epoch();
      this.state.missions.boards[stationId] = { refreshEpoch: epoch, slots: this._generateOffers(info, epoch) };
      changed = true;
    }
    return changed;
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
    const weights = OFFER_MIX[info.type] || OFFER_MIX.trade_hub;
    // Loyalty boost: friendly players see more of the station faction's signature types.
    const rep = this._repOf(info.factionId);
    const repBoost = 1 + Math.max(0, rep) / 100;

    const offers = [];
    for (let i = 0; i < S; i++) {
      const typeId = this._pickType(weights, rng, repBoost, info.type);
      const offer = this._rollOffer(typeId, info, rng, epoch, i);
      if (offer) offers.push(offer);
    }
    const bulkHaul = this._rollBulkHaulOffer(info, rng, epoch, 'bulk');
    if (bulkHaul) {
      offers.unshift(bulkHaul);
      if (offers.length > S) offers.length = S;
    }
    const intro = this._rollStoryBranchIntroOffer(info, rng, epoch);
    if (intro) {
      offers.unshift(intro);
      if (offers.length > S) offers.length = S;
    }
    return offers;
  },

  /** Weighted pick of a mission type by OFFER_MIX (signature types rep-boosted). */
  _pickType(weights, rng, repBoost, stationType) {
    let total = 0;
    const w = new Array(TYPE_ORDER.length);
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      let weight = weights[i] || 0;
      // signature types (weight>=3) get the friendly-rep boost.
      if (weight >= 3) weight *= repBoost;
      w[i] = weight; total += weight;
    }
    if (total <= 0) return TYPE_ORDER[0];
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return TYPE_ORDER[i]; }
    return TYPE_ORDER[TYPE_ORDER.length - 1];
  },

  /** Roll a concrete MissionOffer for a type at an origin station. */
  _rollOffer(typeId, info, rng, epoch, idx) {
    const def = TYPE_BY_ID.get(typeId);
    if (!def) return null;
    const cfg = this.state.missions.config || MISSION_TUNING;

    // Destination: pick a reachable station (or self for mining/recon-at-home).
    const dest = this._pickDestination(typeId, info, rng);
    const destStationId = dest ? dest.id : info.id;
    const destSectorId = dest ? dest.sectorId : info.sectorId;
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
    const riskTier = clamp(sectorRisk, rLo, rHi);

    // Per-type params (quota qty, target strength, scan count, commodity, …) + cargo value.
    const params = this._rollParams(typeId, info, dest, riskTier, rng);

    // ── reward (one multiplicative family) ──
    const fDist = 1 + distance / (cfg.distDivisor || 2000);
    const fRisk = (cfg.RISK_MULT && cfg.RISK_MULT[riskTier]) || 1;
    const fValue = params.fValue;
    const fFaction = (this._repOf(info.factionId) >= (cfg.faction.friendlyThreshold || 25))
      ? (cfg.faction.loyaltyBonus || 1.15) : 1.0;
    const fTime = 1.0; // rush is opt-in at accept time (UI), default normal
    const base = (cfg.BASE && cfg.BASE[typeId]) || 100;
    const reward_cr = round(base * fDist * fRisk * fValue * fFaction * fTime);

    // ── time limit ──
    const travel = distance / (cfg.cruiseSpeedRef || 140);
    const slack = cfg.slackDefault || 2.2;
    const time_limit_s = round((travel + params.taskTime) * slack);

    // ── collateral (anti accept-then-dump on bulk_trade / smuggling) ──
    const collateral_cr = def.collateral ? round((cfg.collateralPct || 0.25) * reward_cr) : 0;
    const id = `mo_${info.id}_${epoch}_${idx}`;
    return {
      id, type: typeId, stationId: info.id, factionId: info.factionId,
      reward_cr, time_limit_s, collateral_cr, riskTier,
      destStationId, destSectorId, distance,
      params,
      title: this._titleFor(typeId, params, dest),
      expiresAtEpoch: epoch + 1,
      storyTag: null,
    };
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
    return {
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
      expiresAtEpoch: epoch + 1,
      storyTag: null,
      hotTip: false,
    };
  },

  _rollStoryBranchIntroOffer(info, rng, epoch) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch) return null;
    const intro = BRANCH_INTRO_BY_FACTION.get(info.factionId);
    if (!intro) return null;
    const offer = this._rollOffer(intro.type, info, rng, epoch, `${intro.branch}_intro`);
    if (!offer) return null;
    offer.id = `mo_${info.id}_${epoch}_${intro.branch}_intro`;
    offer.storyTag = STORY_BRANCH_INTRO_TAG;
    offer.storyBranch = intro.branch;
    offer.title = intro.title;
    return offer;
  },

  /** Pick a destination station for a mission type (deterministic). Cargo/escort/passenger want a
   *  different station; bounty/patrol/recon happen out in a (possibly self) sector; mining delivers
   *  back to the origin (a buyer). */
  _pickDestination(typeId, info, rng) {
    // Mining quota: deliver to origin (it buys ore). Recon/bounty/patrol: pick a nearby sector.
    if (typeId === 'mining_quota') return info;
    // Prefer a discovered/known station; fall back to any in the catalog within a few hops.
    const candidates = ALL_STATIONS.filter((s) => s.id !== info.id);
    if (!candidates.length) return info;
    // Bias toward same-or-adjacent sectors for fair timers (fairness note: nearer for slow ships).
    const sec = SECTOR_BY_ID.get(info.sectorId);
    const near = candidates.filter((s) => s.sectorId === info.sectorId
      || (sec && (sec.neighbors || []).includes(s.sectorId)));
    const pool = near.length ? near : candidates;
    return pool[Math.floor(rng() * pool.length)];
  },

  _pickBulkHaulDestination(info, rng) {
    const refineries = ALL_STATIONS.filter((s) => s.type === 'refinery' || s.services && s.services.includes('refine'));
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
        const cmdtyId = typeId === 'cargo_delivery' ? pick(LEGAL_TRADE_CMDTYS) : null;
        const qty = typeId === 'cargo_delivery' ? (6 + Math.floor(rng() * 16)) : 1; // 6..21u or 1 passenger
        const unitVal = cmdtyId ? (CMDTY_BY_ID.get(cmdtyId).basePrice || 50) : 0;
        const cargoValue = cmdtyId ? unitVal * qty : 800;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20, passengers: typeId === 'passenger_transport' ? 1 : 0 };
      }
      case 'bulk_trade': {
        const cmdtyId = pick(LEGAL_TRADE_CMDTYS);
        const qty = 12 + Math.floor(rng() * 28); // 12..39u quota to sell at dest
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 50;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, progress: 0, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: qty * 1.5 };
      }
      case 'mining_quota': {
        const cmdtyId = pick(MINEABLE_CMDTYS);
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
        return { targetStrength, fValue: targetStrength, taskTime: 90 };
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
      default:
        return { fValue: 1, taskTime: 30 };
    }
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
      case 'bounty_hunt': return `Eliminate a wanted target near ${destName}`;
      case 'escort': return `Escort a convoy to ${destName}`;
      case 'patrol_clear': return `Clear ${p.clearCount} hostiles near ${destName}`;
      case 'recon_scan': return `Scan ${p.scanTargets} site(s) near ${destName}`;
      case 'passenger_transport': return `Transport a passenger to ${destName}`;
      default: return `Contract at ${destName}`;
    }
  },

  // =========================================================================================
  // ACCEPT / ABANDON
  // =========================================================================================
  /** Move an offer from a board to active. Charges collateral, enforces maxActive, emits accepted. */
  acceptMission(missionId) {
    const state = this.state, cfg = state.missions.config || MISSION_TUNING;
    if (!missionId) return false;
    if (state.missions.active.length >= (cfg.maxActive || 8)) {
      this.bus.emit('toast', { text: 'Too many active missions', kind: 'error', ttl: 3 });
      return false;
    }
    const { offer, board } = this._findOffer(missionId);
    if (!offer) return false;
    if (offer.storyDisposition) {
      const choice = offer.storyDisposition;
      // Stage irreversible confirmation (story resolves only on ui:endgameConfirm / confirm:true).
      this.bus.emit('ui:endgameChoose', { choice, source: 'ashfall_mission_board', offerId: offer.id });
      return true;
    }
    const preflight = this._acceptPreflight(offer);
    if (!preflight.ok) {
      this.bus.emit('toast', { text: preflight.reason, kind: 'error', ttl: 3 });
      return false;
    }

    // Collateral affordability check (read-only on credits; economy charges it).
    if (offer.collateral_cr > 0 && (state.player.credits | 0) < offer.collateral_cr) {
      this.bus.emit('toast', { text: `Need ${offer.collateral_cr}cr collateral`, kind: 'error', ttl: 3 });
      return false;
    }
    if (offer.collateral_cr > 0) {
      this.bus.emit('economy:chargeCredits', { amount: offer.collateral_cr, reason: `collateral:${offer.id}` });
    }

    const inst = this._instanceFromOffer(offer);
    // Remove from the board so it can't be re-accepted / doesn't reappear this visit.
    if (board) board.slots = board.slots.filter((o) => o.id !== offer.id);
    state.missions.active.push(inst);
    if (inst.preloadedCargo && inst.params && inst.params.cmdtyId) {
      const loaded = addCargo(state, inst.params.cmdtyId, Math.max(1, inst.params.qty || 1));
      if (loaded < Math.max(1, inst.params.qty || 1)) {
        state.missions.active.pop();
        if (board && !board.slots.some((candidate) => candidate.id === offer.id)) board.slots.unshift(offer);
        this.bus.emit('toast', { text: 'Cargo hold cannot receive the sealed manifest', kind: 'error', ttl: 3 });
        return false;
      }
    }

    // Spawn any immediate/deferred targets (if the player is already in the target sector).
    this._ensureMissionTargets(inst);
    // Accepting auto-tracks AND speaks the objective through the voiceArbiter objective channel
    // (tier 60) — same one-voice path as a manual Mission Log track. The ambient "Mission accepted"
    // toast below is a separate lane (transaction confirmation), so the two do not contend.
    this.trackMission(inst.id);

    this.bus.emit('mission:accepted', {
      missionId: inst.id,
      type: inst.type,
      storyTag: inst.storyTag || undefined,
      source: inst.source || undefined,
      causeFingerprint: inst.cause && inst.cause.fingerprint || undefined,
    });
    this.bus.emit('mission:updated', { missionId: inst.id });
    this.bus.emit('toast', { text: `Mission accepted: ${inst.title}`, kind: 'success', ttl: 3 });
    // GF-4: a gold echo-ring + light flash at the player so accepting a contract has a visible beat
    // (the audio stinger fires from audioSystem's mission:accepted subscription). 'objective' lane
    // resolves to a warm gold radial ring in vfx._presentationStyle.
    const _p = this.state.entities && this.state.playerId != null ? this.state.entities.get(this.state.playerId) : null;
    this.bus.emit('presentation:vfxCue', {
      id: 'mission.accept', lane: 'objective', material: 'objective',
      particles: 24, lights: 1, magnitude: 1,
      position: _p ? { x: _p.pos.x, z: _p.pos.z } : null,
      targetId: this.state.playerId,
    });

    // B4 branch: accepting a faction intro contract sets the story branch.
    this._maybeSetBranch(inst);
    return true;
  },

  /**
   * Missions-owned seam for authored, deterministic contracts such as M3 Hauler steps.
   * The caller supplies a normal board offer; this method alone inserts and accepts it so
   * collateral, active ids, mission navigation, rewards, and receipts keep one authority.
   */
  postAndAcceptAuthoredOffer(rawOffer) {
    if (!rawOffer || typeof rawOffer !== 'object') return { ok: false, reason: 'bad_offer' };
    const offer = JSON.parse(JSON.stringify(rawOffer));
    if (!offer.id || !offer.type || !offer.stationId || !offer.params) {
      return { ok: false, reason: 'bad_offer_shape' };
    }
    const duplicate = (this.state.missions.active || []).find((mission) => (
      mission && mission.status === 'active' && offer.storyTag
      && mission.storyTag === offer.storyTag
    ));
    if (duplicate) return { ok: true, missionId: duplicate.id, offerId: offer.id, reused: true };

    if (!this.state.missions.boards || typeof this.state.missions.boards !== 'object') {
      this.state.missions.boards = {};
    }
    let board = this.state.missions.boards[offer.stationId];
    if (!board || typeof board !== 'object') {
      board = { refreshEpoch: this._epoch(), slots: [] };
      this.state.missions.boards[offer.stationId] = board;
    }
    if (!Array.isArray(board.slots)) board.slots = [];
    board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
    board.slots.unshift(offer);

    if (!this.acceptMission(offer.id)) {
      board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
      return { ok: false, reason: 'accept_failed', offerId: offer.id };
    }
    const mission = (this.state.missions.active || []).find((candidate) => (
      candidate && candidate.status === 'active'
      && ((offer.storyTag && candidate.storyTag === offer.storyTag) || candidate.id === offer.id)
    ));
    return mission
      ? { ok: true, missionId: mission.id, offerId: offer.id, reused: false }
      : { ok: false, reason: 'accepted_instance_missing', offerId: offer.id };
  },

  _acceptPreflight(offer) {
    if (offer && offer.factionId) {
      const minRep = missionOfferMinRep(offer, this.state);
      const rep = this._repOf(offer.factionId);
      if (rep < minRep) {
        return {
          ok: false,
          reason: `${factionShortName(offer.factionId)} standing ${signedRep(minRep)} required`,
        };
      }
    }
    if (!offer || !ONE_LOAD_CARGO_TYPES.has(offer.type)) return { ok: true };
    const requiredVolume = cargoFootprint(offer);
    if (!(requiredVolume > 0)) return { ok: true };
    const cargo = this.state.player && this.state.player.cargo || {};
    const capVolume = Number.isFinite(cargo.capVolume) ? cargo.capVolume : 0;
    if (capVolume < requiredVolume) {
      return {
        ok: false,
        reason: `Need ${fmtCargoUnits(requiredVolume)}u cargo capacity for this contract`,
      };
    }
    return { ok: true };
  },

  trackMission(missionId, options = {}) {
    if (!missionId) return false;
    const state = this.state;
    const mission = (state.missions.active || []).find((m) => m.id === missionId && m.status === 'active');
    if (!mission) return false;
    state.ui.trackedMissionId = mission.id;
    this._refreshTrackedMissionNav(mission);
    if (!options.silent) {
      const wp = state.nav && state.nav.waypoint;
      const line = `Tracking: ${mission.title || 'Mission'}${wp && wp.reason ? ` - ${wp.reason}` : ''}`;
      // Mission-objective nudge → the one-voice arbiter's 'objective' tier (preempts chatter, yields
      // to tutorial/danger/story). Stable id so re-tracking replaces in place. Toast fallback only
      // when the arbiter helper is unavailable (headless/unit contexts).
      const voice = this.helpers && this.helpers.voice;
      const said = voice && typeof voice.say === 'function'
        && voice.say({ channel: 'objective', text: line, kind: 'info', ttl: 3, id: 'objective:tracked' });
      if (!said) this.bus.emit('toast', { text: line, kind: 'info', ttl: 3 });
    }
    this.bus.emit('mission:updated', { missionId: mission.id, tracked: true });
    return true;
  },

  _instanceFromOffer(offer) {
    const state = this.state;
    const id = `m_${state.missions.nextId++}`;
    const def = TYPE_BY_ID.get(offer.type);
    return {
      id, type: offer.type, stationId: offer.stationId || null, factionId: offer.factionId,
      params: JSON.parse(JSON.stringify(offer.params)), // own copy (progress mutates)
      objectiveProgress: 0,
      objectiveTarget: this._objectiveTarget(offer.type, offer.params),
      acceptedAt_s: state.simTime,
      deadline_s: null, // missions do not expire
      reward_cr: offer.reward_cr, collateral_cr: offer.collateral_cr,
      riskTier: offer.riskTier,
      destStationId: offer.destStationId, destSectorId: offer.destSectorId,
      distance: offer.distance,
      targetEntityIds: [],          // runtime entity ids (NOT serialized — re-spawned on load)
      needsTargets: !!(def && this._typeSpawnsTargets(offer.type)),
      status: 'active',
      storyTag: offer.storyTag || null,
      storyContractId: offer.storyContractId || null,
      campaign47aBeat: Number.isFinite(offer.campaign47aBeat) ? offer.campaign47aBeat : null,
      storyTarget: offer.storyTarget ? JSON.parse(JSON.stringify(offer.storyTarget)) : null,
      preloadedCargo: !!offer.preloadedCargo,
      storyBranch: offer.storyBranch || null,
      title: offer.title,
      summary: offer.summary || null,
      source: offer.source || null,
      sourceOfferId: offer.id || null,
      cause: offer.cause ? JSON.parse(JSON.stringify(offer.cause)) : null,
      chainNextSeed: (def && def.chainable) ? this._chainSeed(offer) : null,
    };
  },

  _objectiveTarget(typeId, params) {
    switch (typeId) {
      case 'bulk_trade': return params.qty;
      case BULK_HAUL_TYPE: return params.massU || 1;
      case 'mining_quota': return params.qty;
      case 'patrol_clear': return params.clearCount;
      case 'bounty_hunt': return 1;
      case 'recon_scan': return params.scanTargets;
      default: return 1; // boolean-at-dest types
    }
  },

  _typeSpawnsTargets(typeId) {
    return typeId === 'bounty_hunt' || typeId === 'patrol_clear' || typeId === 'escort';
  },

  _chainSeed(offer) {
    return (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, offer.id, 'chain')
      : ((this.state.meta.seed ^ 0x9e3779b9) >>> 0);
  },

  /** Player gives up a mission: forfeit collateral, small rep penalty, remove. */
  abandonMission(missionId) {
    const state = this.state;
    const i = state.missions.active.findIndex((m) => m.id === missionId);
    if (i < 0) return false;
    const m = state.missions.active[i];
    this._failMission(m, i, 'abandoned');
    return true;
  },

  _refreshTrackedMissionNav(mission = null) {
    const trackedId = this.state.ui && this.state.ui.trackedMissionId;
    if (!trackedId) return;
    const m = mission || (this.state.missions.active || []).find((x) => x.id === trackedId && x.status === 'active');
    if (!m || m.id !== trackedId || m.status !== 'active') return;
    const waypoint = this._missionWaypoint(m);
    if (waypoint) this._setNavWaypoint(waypoint);
  },

  _refreshNavigation(options = {}) {
    const state = this.state;
    const mission = this._trackedOrFirstActiveMission();
    if (mission) {
      state.ui = state.ui || {};
      const changed = state.ui.trackedMissionId !== mission.id;
      state.ui.trackedMissionId = mission.id;
      this._refreshTrackedMissionNav(mission);
      if (changed && !options.silent) this.bus.emit('mission:updated', { missionId: mission.id, tracked: true });
      return true;
    }
    if (state.ui) state.ui.trackedMissionId = null;
    return this._ensureStoryWaypoint(options);
  },

  _releaseStoryNavigationAfterTutorial() {
    if (!this.state || !this.state.story) return;
    this._refreshNavigation({ forceStory: true, silent: true });
  },

  _restoreNavigationAfterLoad() {
    if (this._trackedOrFirstActiveMission()) {
      this._refreshNavigation({ silent: true });
      return;
    }
    const existing = this.state.nav && this.state.nav.waypoint;
    if (existing && existing.kind === 'trade') {
      this._setNavWaypoint(existing);
      return;
    }
    this._refreshNavigation({ forceStory: true, silent: true });
  },

  _trackedOrFirstActiveMission() {
    const state = this.state;
    const active = (state.missions && state.missions.active || []).filter((m) => m && m.status === 'active');
    if (!active.length) return null;
    const trackedId = state.ui && state.ui.trackedMissionId;
    if (trackedId) {
      const tracked = active.find((m) => m.id === trackedId);
      if (tracked) return tracked;
    }
    return active[0];
  },

  _setNavWaypoint(waypoint) {
    this.state.nav = this.state.nav || {};
    const same = sameNavWaypoint(this.state.nav.waypoint, waypoint);
    if (!same) {
      this.state.nav.waypoint = waypoint || null;
      this.bus.emit('nav:waypoint', waypoint || null);
    }
    this._syncWaypointRoute(waypoint);
  },

  _syncWaypointRoute(waypoint) {
    if (!waypoint || !waypoint.sectorId) return;
    const state = this.state;
    const currentSectorId = state.world && state.world.currentSectorId;
    if (!currentSectorId || currentSectorId === waypoint.sectorId) return;
    const route = state.nav && state.nav.route;
    const legs = route && Array.isArray(route.legs) ? route.legs : [];
    const first = legs[0];
    const last = legs[legs.length - 1];
    if (first && last && first.from === currentSectorId && last.to === waypoint.sectorId) return;
    const key = `${currentSectorId}->${waypoint.sectorId}`;
    const now = state.simTime || 0;
    if (this._lastWaypointRouteKey === key && now - (this._lastWaypointRouteAt || 0) < 3) return;
    this._lastWaypointRouteKey = key;
    this._lastWaypointRouteAt = now;
    this.bus.emit('ui:setCourse', {
      sectorId: waypoint.sectorId,
      missionId: waypoint.missionId || null,
      waypointKind: waypoint.kind || null,
    });
  },

  _clearMissionNav(missionId) {
    const state = this.state;
    if (state.ui && state.ui.trackedMissionId === missionId) state.ui.trackedMissionId = null;
    if (state.nav && state.nav.waypoint && state.nav.waypoint.missionId === missionId) {
      state.nav.waypoint = null;
      this.bus.emit('nav:waypoint', null);
    }
  },

  _missionWaypoint(m) {
    if (!m || m.status !== 'active') return null;
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const station = STATION_INFO.get(m.destStationId);
    const title = m.title || 'Mission';
    const destination = station && station.name || sector && sector.name || title;
    const base = {
      kind: 'mission',
      missionId: m.id,
      missionType: m.type,
      label: destination,
      missionTitle: title,
      reason: missionNavReason(m, station, sector),
      stationId: m.destStationId || null,
      sectorId: m.destSectorId || null,
      sectorName: sector && sector.name || null,
    };

    if (m.storyTag === CONTRACT_47A_B0_TAG && !(m.params && m.params.sampleRecovered)) {
      const source = this._resolveContract47aSampleSource(m);
      if (source) {
        return {
          ...base,
          label: '47-A Recovery Site',
          stationId: null,
          sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId,
          pos: { x: source.pos.x, z: source.pos.z },
        };
      }
      return { ...base, label: '47-A Recovery Site', stationId: null };
    }

    if (m.storyTag === CONTRACT_47A_B1_TAG && m.params && m.params.cargoRecoveryNeeded) {
      const origin = this._liveStation(m.stationId);
      const originInfo = STATION_INFO.get(m.stationId);
      return {
        ...base,
        label: originInfo && originInfo.name || 'Helios Station',
        stationId: m.stationId,
        sectorId: originInfo && originInfo.sectorId || 'sector_helios_prime',
        sectorName: originInfo && SECTOR_BY_ID.get(originInfo.sectorId)?.name || 'Helios Prime',
        pos: origin && origin.pos ? { x: origin.pos.x, z: origin.pos.z } : null,
      };
    }

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      const target = this._firstLiveMissionTarget(m);
      if (target) return { ...base, targetEntityId: target.id, pos: { x: target.pos.x, z: target.pos.z }, reason: 'Intercept the marked hostile' };
      return base;
    }

    if (m.type === 'escort') {
      const targetStation = this._liveStation(m.destStationId);
      if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z }, reason: 'Escort the convoy to dock' };
      return base;
    }

    if (m.type === 'mining_quota') {
      const asteroid = this._nearestAsteroid();
      if (asteroid) {
        return { ...base, stationId: null, sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId, pos: { x: asteroid.pos.x, z: asteroid.pos.z } };
      }
      return { ...base, stationId: null, sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId };
    }

    if (m.type === BULK_HAUL_TYPE) {
      const chunk = this._nearestBulkChunk();
      if (chunk) {
        return {
          ...base,
          stationId: null,
          sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId,
          pos: { x: chunk.pos.x, z: chunk.pos.z },
          reason: 'Tether a bulk chunk, then dock at ' + (station && station.name || 'a refinery'),
        };
      }
      const targetStation = this._liveStation(m.destStationId);
      if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z } };
      return base;
    }

    const targetStation = this._liveStation(m.destStationId);
    if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z } };
    return base;
  },

  _firstLiveMissionTarget(m) {
    for (const id of m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && e.pos) return e;
    }
    return null;
  },

  _liveStation(stationId) {
    if (!stationId) return null;
    const index = this.state.entityIndex;
    const byStationId = index && index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    if (hasActiveMissionEntityIndex(this.state)) return null;
    for (const e of this.state.entityList || []) {
      if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
    }
    return null;
  },

  _nearestAsteroid() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _resolveContract47aSampleSource(m) {
    if (!m || m.storyTag !== CONTRACT_47A_B0_TAG) return null;
    const p = m.params || (m.params = {});
    const saved = p.samplePos;
    let nearest = null;
    let nearestD2 = Infinity;
    for (const entity of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid' || !entity.pos) continue;
      if (saved) {
        const dx = entity.pos.x - saved.x;
        const dz = entity.pos.z - saved.z;
        if (dx * dx + dz * dz <= 80 * 80) return entity;
      }
      const player = this.state.entities.get(this.state.playerId);
      const dx = entity.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = entity.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = entity; }
    }
    if (nearest) p.samplePos = { x: nearest.pos.x, z: nearest.pos.z };
    return nearest;
  },

  _nearestBulkChunk() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos || !e.data || !e.data.isChunk) continue;
      const massU = Number(e.data.bulkMassU != null ? e.data.bulkMassU : e.data.yieldU) || 0;
      if (massU <= 20) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _nearestStation() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'dockStations', 'stations')) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const stationId = e.data && e.data.stationId;
      if (!stationId || !STATION_INFO.get(stationId)) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _storyWaypointForBeat(beat) {
    if (!beat) return null;
    const state = this.state;
    const currentSectorId = state.world && state.world.currentSectorId || null;
    const sector = SECTOR_BY_ID.get(currentSectorId);
    const base = {
      kind: 'story',
      storyBeat: beat.beat,
      label: storyBeatTitle(beat),
      reason: beat.objective || BEAT_HINT[beat.beat] || 'Follow the current story objective.',
      sectorId: currentSectorId,
      sectorName: sector && sector.name || null,
    };
    if (beat.beat === 0) {
      const asteroid = this._nearestAsteroid();
      if (asteroid) return { ...base, label: 'Cold Start: Mine Asteroid', pos: { x: asteroid.pos.x, z: asteroid.pos.z } };
      return base;
    }
    const station = this._nearestStation();
    if (station) {
      const stationId = station.data && station.data.stationId || null;
      const info = STATION_INFO.get(stationId);
      return {
        ...base,
        stationId,
        sectorId: info && info.sectorId || currentSectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId) && SECTOR_BY_ID.get(info.sectorId).name || base.sectorName,
        pos: { x: station.pos.x, z: station.pos.z },
      };
    }
    return base;
  },

  _ensureStoryWaypoint(options = {}) {
    const state = this.state;
    const beat = state.story && STORY_BEATS[state.story.beatIndex];
    if (!beat) return false;
    const existing = state.nav && state.nav.waypoint;
    const force = !!(options.forceStory || options.force);
    const allowReplaceTrade = force || !!options.preferStory;
    if (existing && existing.onboarding && !force) return false;
    if (existing && existing.kind === 'mission') return false;
    if (existing && existing.kind === 'trade' && !allowReplaceTrade) return false;
    const waypoint = this._storyWaypointForBeat(beat);
    if (!waypoint) return false;
    this._setNavWaypoint(waypoint);
    return true;
  },

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
    const b0 = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B0_TAG);
    let b0SampleRecovered = false;
    if (b0 && !(b0.params && b0.params.sampleRecovered) && p.minerId !== null
      && (p.minerId == null || p.minerId === this.state.playerId)) {
      const source = this._resolveContract47aSampleSource(b0);
      const sourceMatches = !p.pos || !source || distSq(p.pos, source.pos) <= 80 * 80;
      if (sourceMatches && addCargo(this.state, CONTRACT_47A_SAMPLE_ID, 1) === 1) {
        b0.params.sampleRecovered = true;
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
      if (m.status !== 'active' || m.type !== 'mining_quota') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
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

  _onKill(p) {
    if (!p) return;
    const byPlayer = p.killerId === this.state.playerId;
    if (!byPlayer) return; // mission kills only count for the player
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
      if (!m.targetEntityIds.includes(p.id)) continue;
      if (m.storyTag === 'campaign47a:b2:elroy') {
        this.bus.emit('story:elroyResolved', {
          entityId: p.id,
          missionId: m.id,
          storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
        });
      }
      m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _onEntityDestroyed(p) {
    if (!p || p.id == null) return;
    // Escort fail: the escortee entity died.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m._escorteeId === p.id) {
        this._failMission(m, i, 'escortee_lost');
      }
    }
  },

  _onScan(p) {
    // recon_scan: a scan completed. We accept either a targeted scan (targetId matches a spawned
    // beacon) or a generic sector scan (targetId null) as one unit of progress.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'recon_scan') continue;
      // only count if the player is in the mission's target sector
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _onScannedByPatrol(p) {
    if (!p || !p.hasContraband) return;
    // Any active smuggling run is busted (the law penalty itself is applied by economy/customs).
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'smuggling_run') continue;
      this._failMission(m, i, 'busted');
    }
  },

  /** Dock-at-destination objectives: delivery / passenger / salvage / smuggling / escort. These are
   *  boolean-at-dest (no cargo.delivered event exists; cargo is single-writer so we don't inspect it). */
  _onDockedObjectives(stationId) {
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      const t = m.type;
      if (m.storyTag === CONTRACT_47A_B1_TAG && m.params && m.params.cargoRecoveryNeeded
        && stationId === m.stationId) {
        const need = Math.max(1, m.params.qty || 1);
        const have = Number(this.state.player.cargo.items[m.params.cmdtyId]) || 0;
        const loaded = addCargo(this.state, m.params.cmdtyId, Math.max(0, need - have));
        if (have + loaded >= need) {
          m.params.cargoRecoveryNeeded = false;
          this._refreshTrackedMissionNav(m);
          this.bus.emit('mission:updated', { missionId: m.id, recovery: false });
          this._sayStoryLine('Replacement sealed. Deliver it to Tycho.', 4);
        } else {
          this.bus.emit('toast', { text: `Free ${need - have - loaded}u cargo for Kessler's replacement`, kind: 'warn', ttl: 4 });
        }
        continue;
      }
      if (m.destStationId !== stationId) continue;

      if (t === 'escort') {
        // Player reached the destination — complete only if the escortee survived AND arrived too.
        const ok = this._escorteeArrivedOk(m);
        if (ok) this._completeMission(m, i);
        else this.bus.emit('toast', { text: 'Escort: wait for the convoy to dock', kind: 'warn', ttl: 3 });
        continue;
      }

      // Cargo/passenger/salvage/smuggling: require the actual cargo to be aboard, then consume it.
      if (t === 'cargo_delivery' || t === 'passenger_transport'
          || t === 'salvage_retrieval' || t === 'smuggling_run') {
        if (!this._deliverCargo(m)) {
          if (m.storyTag === CONTRACT_47A_B0_TAG) {
            m.params.sampleRecovered = false;
            m.objectiveProgress = 0;
            this._resolveContract47aSampleSource(m);
            this._refreshTrackedMissionNav(m);
            this.bus.emit('mission:updated', { missionId: m.id, objectiveProgress: 0 });
            this.bus.emit('toast', { text: '47-A sample missing. Recovery site re-marked.', kind: 'warn', ttl: 4 });
            continue;
          }
          if (m.storyTag === CONTRACT_47A_B1_TAG) {
            m.params.cargoRecoveryNeeded = true;
            this._refreshTrackedMissionNav(m);
            this.bus.emit('mission:updated', { missionId: m.id, recovery: true });
            this.bus.emit('toast', { text: 'Sealed cargo missing. Return to Helios.', kind: 'warn', ttl: 4 });
            continue;
          }
          const need = m.params && m.params.cmdtyId ? this._cmdtyName(m.params.cmdtyId) : 'the cargo';
          this.bus.emit('toast', { text: `Delivery: you are not carrying ${need}`, kind: 'warn', ttl: 3 });
          continue;
        }
        this._completeMission(m, i);
      }
    }
  },

  /** True if the escortee for mission m is alive and has reached the destination dock. If the
   *  escortee was never spawned (e.g. accepted far away and the player flew straight to dest),
   *  treat arrival as satisfied so the contract can't soft-lock. */
  _escorteeArrivedOk(m) {
    if (m._escorteeId == null) return true; // no live escortee to gate on
    const e = this.state.entities.get(m._escorteeId);
    if (!e || !e.alive) return false;       // dead → _onEntityDestroyed will fail it anyway
    return !!m._escorteeArrived;
  },

  /** Delivery/passenger/cargo: verify the required commodity+qty is in the player hold and consume
   *  it via the cargo removeCargo helper. Passenger missions carry no commodity (cmdtyId null) →
   *  always satisfied (the passenger rides in the ship, not the hold). Returns true if delivered. */
  _deliverCargo(m) {
    const p = m.params || {};
    if (!p.cmdtyId) return true; // passenger / abstract cargo — nothing to verify in the hold
    const need = Math.max(1, p.qty || 1);
    const cargo = this.state.player && this.state.player.cargo;
    const have = (cargo && cargo.items && cargo.items[p.cmdtyId]) || 0;
    if (have < need) return false;
    if (m.storyTag === CONTRACT_47A_B0_TAG && Array.isArray(this.state.story && this.state.story.persistentCargo)) {
      this.state.story.persistentCargo = this.state.story.persistentCargo.filter((id) => id !== CONTRACT_47A_SAMPLE_ID);
    }
    // Consume the delivered cargo through the cargo single-writer helper (keeps volume/mass caches sane).
    const removed = removeCargo(this.state, p.cmdtyId, need);
    if (removed <= 0 && m.storyTag === CONTRACT_47A_B0_TAG) {
      const locked = this.state.story.persistentCargo || (this.state.story.persistentCargo = []);
      if (!locked.includes(CONTRACT_47A_SAMPLE_ID)) locked.push(CONTRACT_47A_SAMPLE_ID);
    }
    this.bus.emit('cargo:delivered', { commodityId: p.cmdtyId, qty: removed, missionId: m.id, stationId: m.destStationId });
    return removed > 0;
  },

  _cmdtyName(id) { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; },

  _stationName(id) {
    const st = id ? STATION_INFO.get(id) : null;
    return st ? st.name : null;
  },

  _destName(m) {
    const station = this._stationName(m && m.destStationId);
    if (station) return station;
    const sector = m && m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
    return sector ? sector.name : 'the lane';
  },

  _missionClientName(m) {
    const fac = m && m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
    return fac ? (fac.short || fac.name) + ' Contract' : 'Contract Board';
  },

  _missionSuccessDebriefText(m) {
    const p = (m && m.params) || {};
    const cargo = this._cmdtyName(p.cmdtyId);
    const dest = this._destName(m);
    switch (m && m.type) {
      case 'cargo_delivery':
        return 'Manifest sealed at ' + dest + '. ' + cargo + ' cleared the dock and the client released payment.';
      case 'bulk_trade':
        return 'The shortage at ' + dest + ' is covered for now. Your sale moved the board and the client noticed.';
      case BULK_HAUL_TYPE:
        return 'Bulk ore received at ' + dest + '. The refinery logged the tether-haul and cleared the contract.';
      case 'mining_quota':
        return 'Quota received. The assay office logged ' + cargo + '; the rest of the rock can stay quiet.';
      case 'salvage_retrieval':
        return 'Recovery logged. Useful wreckage became inventory before another crew filed the claim.';
      case 'smuggling_run':
        return 'The cargo disappeared into ' + dest + '\'s books without becoming a customs story.';
      case 'bounty_hunt':
        return 'Tag closed near ' + dest + '. The board will update before the rumor does.';
      case 'escort':
        return 'Convoy arrived at ' + dest + ' intact. That is all the client wanted written down.';
      case 'patrol_clear':
        return 'Lane report is clean. Hostile signatures cleared, trade traffic can pretend it was always safe.';
      case 'recon_scan':
        return 'Scan packet received. The map is now less wrong where it matters.';
      case 'passenger_transport':
        return 'Passenger transferred at ' + dest + '. Their name stays boring on the manifest.';
      default:
        return 'Contract closed. The board released payment and filed the work as routine.';
    }
  },

  _missionLossDebriefText(m, reason) {
    const dest = this._destName(m);
    if (reason === 'deadline') return 'Deadline missed near ' + dest + '. The board has already marked the lane cold.';
    if (reason === 'abandoned') return 'Contract abandoned. Progress was cleared from the board and the client will remember the gap.';
    if (reason === 'escort_abandoned') return 'Escort contract voided. The convoy was left outside acceptable coverage.';
    return 'Contract failed near ' + dest + '. The board closed the file without payment.';
  },

  _emitMissionDebrief(m, outcome, reason) {
    if (!m) return;
    const success = outcome === 'completed';
    const text = success ? this._missionSuccessDebriefText(m) : this._missionLossDebriefText(m, reason);
    this.bus.emit('comms:popup', {
      sender: this._missionClientName(m),
      text,
      category: success ? 'personal' : 'trap',
      ttl: success ? 8 : 7,
      note: success ? ('Paid ' + (m.reward_cr || 0).toLocaleString('en-US') + ' cr.') : null,
    });
  },

  // =========================================================================================
  // COMPLETION / FAILURE / EXPIRY (settle)
  // =========================================================================================
  _completeMission(m, index) {
    const state = this.state;
    if (m.status !== 'active') return;
    m.status = 'completed';
    this._clearMissionNav(m.id);
    const displayRewardCr = m.storyTag === CONTRACT_47A_B0_TAG ? CONTRACT_47A_REWARD_CR : (m.reward_cr || 0);
    if (m.storyTag === CONTRACT_47A_B0_TAG) {
      state.story.flags = state.story.flags || {};
      state.story.flags.contract_47a_b0_delivered = true;
    }

    // ── reward credits + collateral refund ──
    if (m.reward_cr > 0) this.bus.emit('economy:grantCredits', { amount: m.reward_cr, reason: `mission:${m.id}` });
    if (m.collateral_cr > 0) {
      this.bus.emit('economy:grantCredits', { amount: m.collateral_cr, reason: `collateral_refund:${m.id}` });
    }

    // ── offering-faction rep: route through mission:completed{repMult} (factions applies 15*repMult).
    // We size repMult so factions' applied rep ≈ the spec's risk-scaled BASE_REP value.
    const specRep = missionSpecRep(m);
    const repMult = specRep / 15;
    const completedPayload = {
      missionId: m.id,
      type: m.type,
      factionId: m.factionId,
      repMult,
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
    };

    // ── research points for cerebral mission types (recon/salvage) — missions is a legit RP writer.
    let researchPoints = 0;
    if (m.type === 'recon_scan' || m.type === 'salvage_retrieval') {
      const rp = m.type === 'recon_scan' ? (3 + (m.riskTier || 0)) : (1 + (m.riskTier || 0));
      researchPoints = rp;
      state.player.researchPoints = (state.player.researchPoints || 0) + rp;
      this.bus.emit('research:pointsChanged', { researchPoints: state.player.researchPoints });
    }

    // ── stats / ledger ──
    if (state.player.stats) state.player.stats.missionsDone = (state.player.stats.missionsDone || 0) + 1;
    this._logCompletion(m.type, displayRewardCr, true);
    this._recordMissionReceipt(m, 'completed', null, {
      rewardCr: displayRewardCr,
      collateralRefundCr: m.collateral_cr || 0,
      repDelta: m.factionId ? specRep : 0,
      researchPoints,
    });

    this._emitMissionDebrief(m, 'completed');
    this.bus.emit('toast', { text: `Mission complete: ${m.title} +${displayRewardCr}cr`, kind: 'success', ttl: 4 });
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });

    // ── chaining: auto-offer the deterministic next link at the origin board ──
    if (m.chainNextSeed != null) this._tryChain(m);

    // ── story chain progress (B5 branch chains) ──
    this._advanceEmbodiedStoryMission(m);
    this._advanceStoryChain(m);

    this.bus.emit('mission:completed', completedPayload);
    // GF-4: a bigger celebratory ring + light burst at the player on completion (the triumphant
    // chord + music duck fire from audioSystem's mission:completed subscription). 'branch' lane
    // resolves to a gold echo-ring in vfx._presentationStyle — reads as a resolved/rewarded beat.
    const _cp = this.state.entities && this.state.playerId != null ? this.state.entities.get(this.state.playerId) : null;
    this.bus.emit('presentation:vfxCue', {
      id: 'mission.complete', lane: 'branch', material: 'branch',
      particles: 48, lights: 2, magnitude: 1.4,
      position: _cp ? { x: _cp.pos.x, z: _cp.pos.z } : null,
      targetId: this.state.playerId,
    });
  },

  _failMission(m, index, reason) {
    if (m.status !== 'active') return;
    m.status = 'failed';
    this._clearMissionNav(m.id);

    // Failure rep penalty to the offering faction. We emit faction:repDelta directly and keep the
    // mission:failed payload factionId-FREE so factions' onMissionLost doesn't ALSO penalise.
    const penalty = missionRepDeltaFor(m, 'failed');
    if (m.factionId && penalty < 0) {
      this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: penalty, reason: `mission_failed:${m.type}` });
    }
    // Collateral is forfeited (already charged at accept — nothing to refund).
    this._logCompletion(m.type, 0, false);
    this._recordMissionReceipt(m, 'failed', reason || 'failed', {
      rewardCr: 0,
      collateralLostCr: m.collateral_cr || 0,
      repDelta: penalty,
    });
    this._emitMissionDebrief(m, 'failed', reason || 'failed');
    this.bus.emit('mission:failed', {
      missionId: m.id,
      reason: reason || 'failed',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
    });
    this.bus.emit('toast', { text: `Mission FAILED: ${m.title}`, kind: 'error', ttl: 4 });
    this._recordStoryMissionFailure(m, reason || 'failed');
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
  },

  _expireMission(m, index) {
    if (m.status !== 'active') return;
    m.status = 'expired';
    this._clearMissionNav(m.id);
    const penalty = missionRepDeltaFor(m, 'expired');
    if (m.factionId && penalty < 0) {
      this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: penalty, reason: `mission_expired:${m.type}` });
    }
    this._logCompletion(m.type, 0, false);
    this._recordMissionReceipt(m, 'expired', 'deadline', {
      rewardCr: 0,
      collateralLostCr: m.collateral_cr || 0,
      repDelta: penalty,
    });
    this._emitMissionDebrief(m, 'expired', 'deadline');
    this.bus.emit('mission:expired', {
      missionId: m.id,
      reason: 'deadline',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
    });
    this.bus.emit('toast', { text: `Mission expired: ${m.title}`, kind: 'warn', ttl: 4 });
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
  },

  _removeActive(missionId, hintIndex) {
    const active = this.state.missions.active;
    this._clearMissionNav(missionId);
    let removed = false;
    if (hintIndex != null && active[hintIndex] && active[hintIndex].id === missionId) {
      active.splice(hintIndex, 1);
      removed = true;
    } else {
      const i = active.findIndex((m) => m.id === missionId);
      if (i >= 0) { active.splice(i, 1); removed = true; }
    }
    if (removed) this._refreshNavigation({ forceStory: true, silent: true });
  },

  _logCompletion(type, cr, success) {
    const log = this.state.missions.completedLog;
    let rec = log.find((r) => r.type === type);
    if (!rec) { rec = { type, count: 0, totalCr: 0, success: 0, fail: 0 }; log.push(rec); }
    rec.count++; rec.totalCr += (cr || 0);
    if (success) rec.success++; else rec.fail++;
  },

  _recordMissionReceipt(m, outcome, reason, settlement = {}) {
    if (!this.state.missions) return null;
    this.state.missions.receipts = normalizeMissionReceipts(this.state.missions.receipts);
    const receipt = missionReceiptFor(m, outcome, reason, { ...settlement, at_s: this.state.simTime || 0 });
    const key = receipt.missionId + ':' + receipt.outcome;
    this.state.missions.receipts = [
      receipt,
      ...this.state.missions.receipts.filter((r) => r && (r.missionId + ':' + r.outcome) !== key),
    ].slice(0, MISSION_RECEIPT_LIMIT);
    return receipt;
  },

  // =========================================================================================
  // MISSION-TARGET SPAWNING (lazy, deterministic, no spawn:request consumer exists)
  // =========================================================================================
  /** Spawn bounty/patrol hostiles or the escortee if the player is in the mission's target sector. */
  _ensureMissionTargets(m) {
    if (!m.needsTargets) return;
    if (this.state.world.currentSectorId !== m.destSectorId) return; // defer until the player arrives
    // Continue: adopt rematerialized hosts before deciding to spawn (avoids duplicate targets).
    this._adoptLiveMissionTargets(m);
    if (m.targetEntityIds.length > 0) return;                        // already present (spawned or adopted)
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
    const list = this.state.entityList || [];
    let adopted = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.isPlayer) continue;
      const mid = missionIdentityOf(e);
      if (mid == null || String(mid) !== String(m.id)) continue;
      if (existing.has(e.id)) continue;
      // Re-stamp durable mission identity if rematerialize omitted a field.
      this._stampMissionTargetIdentity(e, m, adopted);
      existing.add(e.id);
      m.targetEntityIds.push(e.id);
      if (e.data && e.data.escortee) {
        m._escorteeId = e.id;
        m._escorteeArrived = !!m._escorteeArrived;
      }
      adopted++;
    }
    return adopted;
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
    ent.data.missionTag = m.id;
    ent.data.missionId = m.id;
    ent.data.missionPinned = true;
    ent.flags = ent.flags || {};
    ent.flags.missionPinned = true;
    if (sectorId) {
      ent.homeSectorId = sectorId;
      ent.data.homeSectorId = sectorId;
      if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
    }
    if (ent.data.worldRecordId || !sectorId) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const key = `mission:${m.id}:${seq | 0}`;
    ent.data.worldRecordId = stableRecordId(seed, sectorId, RECORD_KIND.MISSION_TARGET, key);
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = this.state.tick | 0;
  },

  _spawnTargetsFor(m) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    // Prefer live rematerialized hosts (Continue) over fresh spawns.
    this._adoptLiveMissionTargets(m);
    const player = helpers.player ? helpers.player() : this.state.entities.get(this.state.playerId);
    const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
    const seed = helpers.hash32 ? helpers.hash32(this.state.meta.seed, m.id, this._spawnSeq++) : (this._spawnSeq++ + 1);
    const rng = helpers.mulberry32 ? helpers.mulberry32(seed) : mulberryLocal(seed);
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      // Spawn only the targets still owed (objectiveTarget - progress) so a mid-mission save/load or
      // partial clear doesn't re-spawn already-killed hostiles and leave an orphan.
      // Adopted rematerialized hosts count toward the remaining quota.
      const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
      const adopted = (m.targetEntityIds || []).length;
      const want = m.type === 'patrol_clear' ? remaining : Math.min(1, remaining);
      const n = Math.max(0, want - adopted);
      if (n <= 0) return;
      const pool = ['reaver_pirate', 'corsair_raider', 'wasp_swarmer'];
      for (let i = 0; i < n; i++) {
        const storyTarget = i === 0 && m.storyTarget ? m.storyTarget : null;
        const typeId = storyTarget && storyTarget.archetype || pool[Math.floor(rng() * pool.length)];
        const level = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
        const pos = storyTarget
          ? missionStoryTargetSpawnPos(m, storyTarget, rng)
          : missionHostileSpawnPos(this.state, { x: px, z: pz }, rng);
        if (!pos) continue;
        const spec = makeEnemySpawnSpec(typeId, level, pos, { factionId: storyTarget && storyTarget.factionId });
        spec.data = spec.data || {};
        spec.data.missionTag = m.id; // attribution helper (kill resolver matches by entity id below)
        if (storyTarget) {
          spec.data.storyTargetId = storyTarget.id || null;
          spec.data.storyTargetRole = storyTarget.role || null;
          spec.data.registry = storyTarget.registry || null;
          spec.data.name = storyTarget.name || null;
          spec.data.scanLabel = storyTarget.label || storyTarget.name || 'UNKNOWN';
          spec.data.ai = spec.data.ai || {};
          spec.data.ai.name = storyTarget.name || storyTarget.label || null;
        }
        const ent = helpers.spawnEntity(spec);
        if (ent) {
          this._stampMissionTargetIdentity(ent, m, adopted + i);
          m.targetEntityIds.push(ent.id);
          if (storyTarget && storyTarget.namedCaptainId) {
            this.bus.emit('encounter:namedCaptainBound', {
              captainId: storyTarget.namedCaptainId, entityId: ent.id,
              missionId: m.id, sectorId: m.destSectorId,
            });
          }
        }
      }
    } else if (m.type === 'escort') {
      // Already adopted a live escortee from world.records — do not double-spawn.
      if (m._escorteeId != null && this.state.entities.get(m._escorteeId)) return;
      if ((m.targetEntityIds || []).length > 0) return;
      // Real escortee: a friendly (team 0) ship that TRAVELS toward the destination. It needs to
      // survive (mission fails if it dies — _onEntityDestroyed) and arrive (gates completion).
      const ang = rng() * Math.PI * 2, r = 60 + rng() * 40;
      const pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
      const spec = makeEnemySpawnSpec('corsair_raider', Math.round((lvLo + lvHi) / 2), pos);
      spec.team = 0; spec.factionId = m.factionId; // player team (won't be auto-attacked by allies)
      spec.data = spec.data || {};
      spec.data.missionTag = m.id; spec.data.escortee = true;
      // No data.ai → the AI system skips it (it requires data.ai); WE steer it via data.intent in
      // update() so it heads for the destination instead of dogfighting. Seed a neutral intent.
      delete spec.data.ai;
      spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
      const ent = helpers.spawnEntity(spec);
      if (ent) {
        this._stampMissionTargetIdentity(ent, m, 0);
        m._escorteeId = ent.id;
        m._escorteeArrived = false;
        m.targetEntityIds.push(ent.id);
      }
    }
    if (m.targetEntityIds.length) this.bus.emit('mission:updated', { missionId: m.id });
  },

  /** Drive an escortee ship toward the destination station (or sector centre). Writes data.intent
   *  which flight consumes; marks m._escorteeArrived when it reaches the dock ring. Deterministic
   *  (pure geometry — no RNG). */
  _steerEscortee(m, state, dt) {
    const e = state.entities.get(m._escorteeId);
    if (!e || !e.alive) return;
    const intent = e.data.intent || (e.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
    intent.fire = false; intent.fireGroup = null;

    // Destination point: the dest station entity if it's loaded in the current sector, else the
    // player (so the escortee tags along until the player jumps it into the destination sector).
    let target = null;
    const inDestSector = state.world.currentSectorId === m.destSectorId;
    if (inDestSector) {
      const byStationId = state.entityIndex && state.entityIndex.byStationId;
      target = byStationId && m.destStationId ? byStationId.get(m.destStationId) : null;
      if (!target || !target.alive || target.type !== 'station') {
        const stations = (state.entityIndex && state.entityIndex.stations) || state.entityList;
        target = null;
        for (const cand of stations) {
          if (cand.alive && cand.type === 'station' && cand.data && cand.data.stationId === m.destStationId) { target = cand; break; }
        }
      }
    }
    if (!target) {
      const player = state.entities.get(state.playerId);
      target = player && player.alive ? player : null;
    }
    if (!target) { intent.moveX = 0; intent.moveZ = 0; return; }

    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const arriveR = (target.type === 'station' ? (target.data && target.data.dockRadius) || 80 : 140) + 40;
    const aim = Math.atan2(dz, dx);
    intent.aimAngle = aim;
    if (dist <= arriveR) {
      // arrived: ease to a hover near the dock and flag arrival (gates player-dock completion)
      intent.moveZ = 0; intent.moveX = 0; intent.boost = false;
      if (inDestSector && target.type === 'station') m._escorteeArrived = true;
    } else {
      // head straight in; boost to close a large gap so it keeps pace with the player
      const off = Math.abs(wrapAngleLocal(aim - e.rot));
      intent.moveZ = off < 1.2 ? 1 : 0.35;   // throttle down while still turning to face the line
      intent.moveX = 0;
      intent.boost = dist > 700 && off < 0.6;
    }
  },

  /** Mark mission target entities dead when the mission settles (avoid orphans). */
  _cleanupTargets(m) {
    if (!m.targetEntityIds || !m.targetEntityIds.length) return;
    for (const id of m.targetEntityIds) {
      const e = this.state.entities.get(id);
      if (e && e.alive && e.id !== this.state.playerId) e.alive = false; // swept end-of-step
    }
    m.targetEntityIds = [];
    m._escorteeId = null;
  },

  _onSectorEnter(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    this.spawnTargetsForSector(sectorId);
    this._refreshNavigation({ preferStory: true });
    this._storyTrigger('sector', { sectorId });
  },

  spawnTargetsForSector(sectorId) {
    if (!sectorId) return;
    // Spawn (or re-spawn after load) deferred targets for any active mission keyed to this sector.
    // Continue order: world rematerializes mission_target records first; adopt those live IDs
    // before any fresh spawn so targetEntityIds (cleared on deserialize) do not duplicate.
    for (const m of this.state.missions.active) {
      if (m.status !== 'active' || !m.needsTargets) continue;
      if (m.destSectorId !== sectorId) continue;
      m.targetEntityIds = m.targetEntityIds.filter((id) => {
        const e = this.state.entities.get(id); return e && e.alive;
      });
      this._adoptLiveMissionTargets(m);
      if (m.targetEntityIds.length === 0 && (m.objectiveProgress < m.objectiveTarget)) {
        this._spawnTargetsFor(m);
      }
    }
  },

  _onSectorExit(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
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
    // Targets in the exited sector are despawned by world on hard leave; clear ids for re-spawn.
    for (const m of this.state.missions.active) {
      if (m.needsTargets && m.destSectorId === sectorId) { m.targetEntityIds = []; m._escorteeId = null; }
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
    const next = this._rollOffer(m.type, originInfo, rng, board.refreshEpoch, board.slots.length);
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
      ? recordBeatStep(this.state, signal, data || {}, this.state.simTime || 0)
      : null;

    // B0 is ordered AND: mining:yield then dock:docked — gate on isBeatStepsComplete.
    if (beat.beat === 0) {
      if (isBeatStepsComplete(this.state, 0)) this._advanceStory(beat);
      return;
    }

    const want = BEAT_TRIGGER[beat.beat];
    if (!want) return;
    // B1/B2 are embodied board contracts and advance in _advanceEmbodiedStoryMission.
    if (beat.beat === 1 || beat.beat === 2) return;
    // Discrete first-X triggers (B3/B6). B4/B5/B7 handled elsewhere.
    if (want === kind && stepResult && stepResult.ok
        && isBeatStepsComplete(this.state, beat.beat)) {
      this._advanceStory(beat);
    }
  },

  /** Complete B1/B2 only through the authored 47-A contracts. Sidecar observes first; missions
   * remains the sole cursor and reward authority. */
  _advanceEmbodiedStoryMission(m) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || !m || !m.storyTag) return false;
    const expected = beat.beat === 1 ? 'campaign47a:b1:honest_work'
      : beat.beat === 2 ? 'campaign47a:b2:elroy' : null;
    if (!expected || m.storyTag !== expected) return false;
    this._ensureCampaignSidecar();
    const signal = beat.beat === 1 ? 'mission:completed' : 'entity:killed';
    const observed = recordBeatStep(this.state, signal, {
      missionId: m.id,
      storyTag: m.storyTag,
      storyTargetId: m.storyTarget && m.storyTarget.id || null,
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
    }, this.state.simTime || 0);
    if (!observed || !observed.ok) return;
    story.chainProgress = nextProgress;
    if (story.chainProgress >= wantCount) { story.chainProgress = 0; this._advanceStory(beat); }
    else {
      this._refreshEmbodiedStoryBoards();
      this.bus.emit('toast', { text: `Proving Ground: ${story.chainProgress}/${wantCount}`, kind: 'info', ttl: 3 });
    }
  },

  /** B4: accepting a faction intro contract sets the branch. */
  _maybeSetBranch(inst) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return;
    if (!isStoryBranchIntroOffer(inst, this.state)) return;
    const branch = inst.storyBranch || Object.keys(BRANCH_FACTION).find((b) => BRANCH_FACTION[b] === inst.factionId);
    if (!branch || BRANCH_FACTION[branch] !== inst.factionId || !BRANCH_INTRO_BY_BRANCH.has(branch)) return;
    // Sidecar observes/gates the live intro accept before canonical branch/reward mutation.
    this._ensureCampaignSidecar();
    const observed = recordBeatStep(this.state, 'mission:accepted', {
      storyTag: STORY_BRANCH_INTRO_TAG,
      type: inst.type,
      factionId: inst.factionId,
      branch,
      storyBranch: branch,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok || !isBeatStepsComplete(this.state, 4)) return;
    story.branch = branch;
    inst.storyTag = STORY_BRANCH_INTRO_TAG;
    inst.storyBranch = branch;
    // B4 reward: chosen faction +15, opposing -10 (these have no other channel → emit directly).
    // Single opposing map only (patrol→free, free→scn, traders→dmc).
    this.bus.emit('faction:repDelta', { factionId: inst.factionId, delta: 15, reason: 'story_branch' });
    const opposing = branch === 'patrol' ? 'faction_free' : (branch === 'free' ? 'faction_scn' : 'faction_dmc');
    this.bus.emit('faction:repDelta', { factionId: opposing, delta: -10, reason: 'story_branch_opposing' });
    this._advanceStory(beat);
  },

  /** Credit / net-worth gated beats: show a hint while unmet, advance once met (never hard-block). */
  _checkStoryGates() {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return;
    const credits = this.state.player.credits | 0;
    if (beat.beat === 7) {
      // North star: 100k net worth AND rep>=50 with chosen faction.
      const netWorth = this._netWorth();
      const facRep = story.branch ? this._repOf(BRANCH_FACTION[story.branch]) : this._maxRep();
      if (netWorth >= 100000 && facRep >= 50) this._advanceStory(beat);
    }
    // B3 (buy T2 hull) and B6 (deploy asset) advance on their discrete triggers (ship_purchased /
    // asset_deployed) via _storyTrigger; the precredits is only a soft hint (handled at advance).
  },

  _advanceStory(beat, options = {}) {
    const story = this.state.story;
    if (story.beatIndex !== beat.beat) return; // already advanced
    const fromIndex = story.beatIndex;
    // Grant beat reward (credits + rep + unlock flag).
    if (beat.reward) {
      if (beat.reward.credits && !options.skipCredits) this.bus.emit('economy:grantCredits', { amount: beat.reward.credits, reason: `story:${beat.id}` });
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
    syncObservedBeat(state, state.simTime || 0);
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
  _installContract47aColdStart() {
    if ((this.state.missions.active || []).some((m) => m && m.storyTag === CONTRACT_47A_B0_TAG)) return;
    const offer = {
      id: 'contract_47a_b0_recovery',
      type: 'salvage_retrieval',
      stationId: 'station_helios',
      factionId: null,
      params: { cmdtyId: CONTRACT_47A_SAMPLE_ID, qty: 1, sampleRecovered: false, samplePos: null },
      reward_cr: 0,
      collateral_cr: 0,
      riskTier: 0,
      destStationId: 'station_helios',
      destSectorId: 'sector_helios_prime',
      distance: 600,
      storyTag: CONTRACT_47A_B0_TAG,
      campaign47aBeat: 0,
      title: 'Contract 47-A: Recover the Sample',
      summary: 'Recover the marked assay sample. Deliver it to Helios Station.',
    };
    const mission = this._instanceFromOffer(offer);
    mission.chainNextSeed = null;
    this.state.missions.active.push(mission);
    this.state.ui = this.state.ui || {};
    this.state.ui.trackedMissionId = mission.id;
    this._refreshTrackedMissionNav(mission);
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

  newGame() {
    const state = this.state;
    state.missions.boards = {};
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    state.missions.nextId = 1;
    state.missions.config = MISSION_TUNING;
    // Clear story spine + any prior campaign47a sidecar (nested under state.story).
    state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    initCampaignSidecar(state, state.simTime || 0);
    this._installContract47aColdStart();
    this._spawnSeq = 0;
    this._navRefreshT = 0;
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;
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

  serialize() {
    const m = this.state.missions;
    // Strip transient runtime fields (entity ids) from active missions.
    const active = (m.active || []).map((a) => {
      const { targetEntityIds, _escorteeId, _escorteeSectorId, _escorteeArrived, ...rest } = a;
      return { ...rest, targetEntityIds: [], needsTargets: a.needsTargets };
    });
    const serialized = {
      boards: m.boards, active, completedLog: m.completedLog, receipts: normalizeMissionReceipts(m.receipts),
      nextId: m.nextId, config: m.config || MISSION_TUNING,
      story: this.state.story,
    };
    // Optional extension state must preserve absence for reduced headless registries that do not
    // register careerContracts; materializing a null key only after reload changes sim hashes.
    if (m.careerContracts) {
      serialized.careerContracts = JSON.parse(JSON.stringify(m.careerContracts));
    }
    if (m.postEndingReplay) {
      serialized.postEndingReplay = JSON.parse(JSON.stringify(m.postEndingReplay));
    }
    return serialized;
  },

  deserialize(data) {
    if (!data) return;
    const state = this.state;
    state.missions.boards = data.boards || {};
    state.missions.completedLog = data.completedLog || [];
    state.missions.receipts = normalizeMissionReceipts(data.receipts);
    state.missions.nextId = data.nextId || 1;
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
    // Stale-target GC: clear live entity ids; targets re-spawn when the player (re-)enters the sector.
    state.missions.active = (data.active || []).map((a) => ({
      ...a, targetEntityIds: [], _escorteeId: null, _escorteeArrived: false, status: a.status || 'active',
    }));
    if (data.story) state.story = data.story;
    // Sidecar lives inside already-serialized state.story — migrate/init without save schema change.
    ensureCampaign47aState(state);
    syncObservedBeat(state, state.simTime || 0);
    // Drop active missions whose destination no longer resolves (soft-lock guard).
    state.missions.active = state.missions.active.filter((m) => {
      if (m.destStationId && !STATION_INFO.get(m.destStationId) && m.destStationId !== m.stationId) {
        // unresolved dest station — but sector-only objectives still fine; keep if sector resolves
        return !!SECTOR_BY_ID.get(m.destSectorId);
      }
      return true;
    });
    this._refreshNavigation({ forceStory: true, silent: true });
  },
};

// ── Receipt helpers (module-scope, derived from shared mission tuning) ───────────────────────

function normalizeMissionReceipts(value) {
  if (!Array.isArray(value)) return [];
  const receipts = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const outcome = String(raw.outcome || 'settled');
    const missionId = raw.missionId != null
      ? String(raw.missionId)
      : String(raw.id || '').split(':')[0];
    if (!missionId) continue;
    receipts.push({
      ...raw,
      id: raw.id || missionId + ':' + outcome,
      missionId,
      outcome,
    });
    if (receipts.length >= MISSION_RECEIPT_LIMIT) break;
  }
  return receipts;
}

function receiptTitle(m) {
  return (m && (m.title || m.name)) || String(m && m.type || 'contract')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missionSpecRep(m) {
  const baseRep = MISSION_TUNING.BASE_REP[m && m.type] != null ? MISSION_TUNING.BASE_REP[m.type] : 3;
  return round(baseRep * (1 + ((m && m.riskTier) || 0) * 0.4));
}

export function missionRepDeltaFor(m, outcome) {
  if (!m || !m.factionId) return 0;
  const specRep = missionSpecRep(m);
  return outcome === 'completed' ? specRep : -Math.ceil(specRep * 0.6);
}

export function missionReceiptFor(m, outcome, reason, settlement = {}) {
  const completed = outcome === 'completed';
  const missionId = String(m && m.id || 'mission');
  const rewardCr = Math.max(0, Math.round(Number(settlement.rewardCr != null ? settlement.rewardCr : (completed ? (m && m.reward_cr) : 0)) || 0));
  const collateral = Math.max(0, Math.round(Number(m && m.collateral_cr) || 0));
  const collateralRefundCr = Math.max(0, Math.round(Number(settlement.collateralRefundCr != null ? settlement.collateralRefundCr : (completed ? collateral : 0)) || 0));
  const collateralLostCr = Math.max(0, Math.round(Number(settlement.collateralLostCr != null ? settlement.collateralLostCr : (!completed ? collateral : 0)) || 0));
  const repDelta = Number.isFinite(Number(settlement.repDelta)) ? Math.round(Number(settlement.repDelta)) : missionRepDeltaFor(m, outcome);
  const researchPoints = Math.max(0, Math.round(Number(settlement.researchPoints) || 0));
  const at_s = Math.max(0, Number(settlement.at_s) || 0);
  return {
    id: missionId + ':' + String(outcome || 'settled'),
    missionId,
    title: receiptTitle(m),
    type: m && m.type || 'contract',
    outcome: outcome || 'settled',
    reason: reason || null,
    at_s,
    factionId: m && m.factionId || null,
    stationId: m && m.stationId || null,
    destStationId: m && m.destStationId || null,
    destSectorId: m && m.destSectorId || null,
    rewardCr,
    collateralRefundCr,
    collateralLostCr,
    repDelta,
    researchPoints,
  };
}

function missionHostileSpawnPos(state, origin, rng) {
  const center = origin || { x: 0, z: 0 };
  for (let attempt = 0; attempt < MISSION_HOSTILE_SPAWN_ATTEMPTS; attempt++) {
    const ang = rng() * Math.PI * 2;
    const r = MISSION_HOSTILE_SPAWN_MIN_WU + rng() * (MISSION_HOSTILE_SPAWN_MAX_WU - MISSION_HOSTILE_SPAWN_MIN_WU);
    const pos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };
    if (outsideMissionPortSafety(state, pos)) return pos;
  }
  return null;
}

/** Place an authored target inside its named sector zone so the ordinary entity:killed event can
 * create a real aftermathWrecks marker. Zone centers are sector-local; live entities are global. */
function missionStoryTargetSpawnPos(mission, target, rng) {
  const sectorId = mission && mission.destSectorId;
  const zoneId = target && target.zoneId;
  const zone = zonesForSector(sectorId).find((candidate) => candidate && candidate.id === zoneId);
  if (!zone || !zone.center) return null;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * Math.max(40, Math.min(240, (zone.radius || 400) * 0.35));
  const local = {
    x: zone.center.x + Math.cos(angle) * radius,
    z: zone.center.z + Math.sin(angle) * radius,
  };
  return sectorLocalToGlobalForSector(local, sectorId);
}

function outsideMissionPortSafety(state, pos) {
  const active = state && state.world && state.world.activeSector || {};
  for (const station of active.stations || []) {
    if (!station || !station.pos) continue;
    const dockRadius = Number(station.data && station.data.dockRadius);
    const radius = Math.max(MISSION_PORT_SAFE_RADIUS_WU, Number.isFinite(dockRadius) ? dockRadius + 900 : 0);
    if (distSq(pos, station.pos) < radius * radius) return false;
  }
  for (const gate of active.gates || []) {
    if (gate && gate.pos && distSq(pos, gate.pos) < 1000 * 1000) return false;
  }
  return true;
}

function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

// Story-beat trigger kind (first-X model). B0 is ordered multi-step (mine then dock) via sidecar.
// Gate-only beats (4/5/7) use branch accept / chain count / credit-rep gates.
const BEAT_TRIGGER = {
  0: null,             // ordered mine → dock (sidecar isBeatStepsComplete gate)
  1: 'trade',          // first sell
  2: 'kill',           // first player kill
  3: 'ship_purchased', // buy any ship (T2 gate is a soft hint)
  4: null,             // branch set on accept (handled in _maybeSetBranch)
  5: null,             // branch chain (handled in _advanceStoryChain)
  6: 'asset_deployed', // first passive asset
  7: null,             // net-worth gate (handled in _checkStoryGates)
};

/** Map missions story kinds → campaign47a step signals (observe/gate only). */
const STORY_SIGNAL_BY_KIND = {
  mine: 'mining:yield',
  trade: 'economy:tradeCompleted',
  kill: 'entity:killed',
  ship_purchased: 'ship:purchased',
  asset_deployed: 'asset:deployed',
  dock: 'dock:docked',
};

// Per-branch B5 chain requirements (spec B5).
const BRANCH_CHAIN_TYPE = { traders: 'bulk_trade', patrol: 'patrol_clear', free: 'smuggling_run' };
const BRANCH_CHAIN_COUNT = { traders: 3, patrol: 2, free: 2 };

// Direction hints shown when a beat becomes current (Captain's Log north star).
const BEAT_HINT = {
  0: 'Cold Start: mine ore from an asteroid field, then dock to sell or deliver it.',
  1: 'Honest Work: accept Kessler\'s sealed alloy run from the Helios board.',
  2: 'First Blood: close Rook\'s UNKNOWN tag in the Charon ambush zone.',
  3: 'Bigger Boat: earn credits and buy a bigger hull at a shipyard.',
  4: 'Pick a Side: accept an intro contract from a faction to choose your path.',
  5: 'Proving Ground: complete your faction\'s mission chain.',
  6: 'Empire Seed: deploy your first passive asset (drone, trader, or outpost).',
  7: 'The Deep Reach: reach Ashfall and choose through its board, ledger, or wormhole.',
};

function storyBeatTitle(beat) {
  if (!beat) return 'Story Objective';
  const hint = BEAT_HINT[beat.beat] || '';
  const colon = hint.indexOf(':');
  if (colon > 0) return hint.slice(0, colon);
  return String(beat.id || `Beat ${beat.beat}`)
    .replace(/^b\d+_?/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function hasActiveMissionEntityIndex(state) {
  const index = state && state.entityIndex;
  return !!(index && index.__spacefaceEntityIndexV1);
}

function missionIndexedEntities(state, primaryKey, secondaryKey) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return index[primaryKey] || index[secondaryKey] || [];
  }
  return (state && state.entityList) || [];
}

function sameNavWaypoint(a, b) {
  if (!a || !b) return !a && !b;
  if ((a.kind || null) !== (b.kind || null)) return false;
  if ((a.missionId || null) !== (b.missionId || null)) return false;
  if ((a.targetEntityId || null) !== (b.targetEntityId || null)) return false;
  if ((a.storyBeat ?? null) !== (b.storyBeat ?? null)) return false;
  if ((a.stationId || null) !== (b.stationId || null)) return false;
  if ((a.sectorId || null) !== (b.sectorId || null)) return false;
  if ((a.label || '') !== (b.label || '')) return false;
  if ((a.reason || '') !== (b.reason || '')) return false;
  return sameNavPos(a.pos, b.pos);
}

function sameNavPos(a, b) {
  if (!a || !b) return !a && !b;
  return Math.abs((a.x || 0) - (b.x || 0)) < 0.05
    && Math.abs((a.z || 0) - (b.z || 0)) < 0.05;
}

// Wrap an angle to (-π, π] for the smallest turn delta (escortee steering; no THREE dependency).
function wrapAngleLocal(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ── local PRNG fallback (only if core helpers absent, e.g. isolated unit test) ────────────────
function mulberryLocal(a) {
  a >>>= 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
