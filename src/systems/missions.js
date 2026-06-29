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
} from '../data/missions.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import { effectiveDangerTierFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for mission risk
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { makeEnemySpawnSpec } from './combat.js';
// Cargo single-writer helper (same pattern economy.js uses) — delivery missions consume the
// required cargo through this so usedVolume/usedMass caches stay correct (§0.6).
import { removeCargo } from './cargo.js';

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

// Station size → tier number used for slot count (S=0,M=1,L=2).
const SIZE_TIER = { S: 0, M: 1, L: 2 };

// Story branch → faction mapping (B4/B5 spec).
const BRANCH_FACTION = { traders: 'faction_mts', patrol: 'faction_scn', free: 'faction_free' };
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
  switch (m.type) {
    case 'cargo_delivery': return `Deliver ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'bulk_trade': return `Sell ${remaining || p.qty || ''}u ${cargo} at ${stationName}`.trim();
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
    bus.on('save:loaded', () => this._restoreNavigationAfterLoad());

    // ── Player intents (UI) ────────────────────────────────────────────────────────────────
    bus.on('ui:acceptMission', (p) => this.acceptMission(p && p.missionId));
    bus.on('ui:abandonMission', (p) => this.abandonMission(p && p.missionId));
    bus.on('ui:trackMission', (p) => { if (p && p.missionId) this.trackMission(p.missionId); });

    // ── Docking: refresh expired boards, run delivery/passenger/escort/salvage objectives ────
    bus.on('dock:docked', (p) => {
      const stationId = p && p.stationId;
      if (!stationId) return;
      this._lastDockedStation = stationId;
      this.ensureBoard(stationId);
      this._onDockedObjectives(stationId);
      this._storyTrigger('dock', { stationId });
    });
    bus.on('dock:undocked', () => { this._lastDockedStation = null; });

    // ── Objective tracking listeners ─────────────────────────────────────────────────────────
    // bulk_trade quota: sell qty of the target commodity (trade.sold alias → economy:tradeCompleted).
    bus.on('economy:tradeCompleted', (p) => this._onTrade(p));
    // mining_quota: aggregate mined units of the target commodity.
    bus.on('mining:yield', (p) => this._onMiningYield(p));
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
      if (now >= m.deadline_s) { this._expireMission(m, i); continue; }
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
    if (board && board.refreshEpoch === epoch && board.slots) return board;
    board = { refreshEpoch: epoch, slots: this._generateOffers(info, epoch) };
    state.missions.boards[stationId] = board;
    this.bus.emit('mission:updated', { missionId: null });
    return board;
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

    // Spawn any immediate/deferred targets (if the player is already in the target sector).
    this._ensureMissionTargets(inst);
    this.trackMission(inst.id, { silent: true });

    this.bus.emit('mission:accepted', { missionId: inst.id, type: inst.type, storyTag: inst.storyTag || undefined });
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

  _acceptPreflight(offer) {
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
      this.bus.emit('toast', { text: `Tracking: ${mission.title || 'Mission'}${wp && wp.reason ? ` - ${wp.reason}` : ''}`, kind: 'info', ttl: 3 });
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
      deadline_s: state.simTime + offer.time_limit_s,
      reward_cr: offer.reward_cr, collateral_cr: offer.collateral_cr,
      riskTier: offer.riskTier,
      destStationId: offer.destStationId, destSectorId: offer.destSectorId,
      distance: offer.distance,
      targetEntityIds: [],          // runtime entity ids (NOT serialized — re-spawned on load)
      needsTargets: !!(def && this._typeSpawnsTargets(offer.type)),
      status: 'active',
      storyTag: offer.storyTag || null,
      title: offer.title,
      chainNextSeed: (def && def.chainable) ? this._chainSeed(offer) : null,
    };
  },

  _objectiveTarget(typeId, params) {
    switch (typeId) {
      case 'bulk_trade': return params.qty;
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
    const base = {
      kind: 'mission',
      missionId: m.id,
      missionType: m.type,
      label: title,
      reason: missionNavReason(m, station, sector),
      stationId: m.destStationId || null,
      sectorId: m.destSectorId || null,
      sectorName: sector && sector.name || null,
    };

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
    this._storyTrigger('trade', p); // first-sell story beat fires on any sell
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
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'mining_quota') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + (p.qty || 0));
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
    this._storyTrigger('mine', p);
  },

  _onKill(p) {
    if (!p) return;
    const byPlayer = p.killerId === this.state.playerId;
    if (byPlayer) this._storyTrigger('kill', p);
    if (!byPlayer) return; // mission kills only count for the player
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
      if (!m.targetEntityIds.includes(p.id)) continue;
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
    // Consume the delivered cargo through the cargo single-writer helper (keeps volume/mass caches sane).
    const removed = removeCargo(this.state, p.cmdtyId, need);
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

    // ── reward credits + collateral refund ──
    this.bus.emit('economy:grantCredits', { amount: m.reward_cr, reason: `mission:${m.id}` });
    if (m.collateral_cr > 0) {
      this.bus.emit('economy:grantCredits', { amount: m.collateral_cr, reason: `collateral_refund:${m.id}` });
    }

    // ── offering-faction rep: route through mission:completed{repMult} (factions applies 15*repMult).
    // We size repMult so factions' applied rep ≈ the spec's risk-scaled BASE_REP value.
    const specRep = missionSpecRep(m);
    const repMult = specRep / 15;
    const completedPayload = { missionId: m.id, type: m.type, factionId: m.factionId, repMult };

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
    this._logCompletion(m.type, m.reward_cr, true);
    this._recordMissionReceipt(m, 'completed', null, {
      rewardCr: m.reward_cr || 0,
      collateralRefundCr: m.collateral_cr || 0,
      repDelta: m.factionId ? specRep : 0,
      researchPoints,
    });

    this._emitMissionDebrief(m, 'completed');
    this.bus.emit('toast', { text: `Mission complete: ${m.title} +${m.reward_cr}cr`, kind: 'success', ttl: 4 });
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });

    // ── chaining: auto-offer the deterministic next link at the origin board ──
    if (m.chainNextSeed != null) this._tryChain(m);

    // ── story chain progress (B5 branch chains) ──
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
    this.bus.emit('mission:failed', { missionId: m.id, reason: reason || 'failed' });
    this.bus.emit('toast', { text: `Mission FAILED: ${m.title}`, kind: 'error', ttl: 4 });
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
    this.bus.emit('mission:expired', { missionId: m.id, reason: 'deadline' });
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
    if (m.targetEntityIds.length > 0) return;                        // already spawned
    this._spawnTargetsFor(m);
    this._refreshTrackedMissionNav(m);
  },

  _spawnTargetsFor(m) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    const player = helpers.player ? helpers.player() : this.state.entities.get(this.state.playerId);
    const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
    const seed = helpers.hash32 ? helpers.hash32(this.state.meta.seed, m.id, this._spawnSeq++) : (this._spawnSeq++ + 1);
    const rng = helpers.mulberry32 ? helpers.mulberry32(seed) : mulberryLocal(seed);
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      // Spawn only the targets still owed (objectiveTarget - progress) so a mid-mission save/load or
      // partial clear doesn't re-spawn already-killed hostiles and leave an orphan.
      const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
      const n = m.type === 'patrol_clear' ? remaining : Math.min(1, remaining);
      if (n <= 0) return;
      const pool = ['reaver_pirate', 'corsair_raider', 'wasp_swarmer'];
      for (let i = 0; i < n; i++) {
        const typeId = pool[Math.floor(rng() * pool.length)];
        const level = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
        const ang = rng() * Math.PI * 2, r = 500 + rng() * 600;
        const pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
        const spec = makeEnemySpawnSpec(typeId, level, pos);
        spec.data = spec.data || {};
        spec.data.missionTag = m.id; // attribution helper (kill resolver matches by entity id below)
        const ent = helpers.spawnEntity(spec);
        if (ent) m.targetEntityIds.push(ent.id);
      }
    } else if (m.type === 'escort') {
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
      if (ent) { m._escorteeId = ent.id; m._escorteeArrived = false; m.targetEntityIds.push(ent.id); }
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
    for (const m of this.state.missions.active) {
      if (m.status !== 'active' || !m.needsTargets) continue;
      if (m.destSectorId !== sectorId) continue;
      m.targetEntityIds = m.targetEntityIds.filter((id) => {
        const e = this.state.entities.get(id); return e && e.alive;
      });
      if (m.targetEntityIds.length === 0 && (m.objectiveProgress < m.objectiveTarget)) {
        this._spawnTargetsFor(m);
      }
    }
  },

  _onSectorExit(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // Escort abandoned: an in-flight escortee was spawned in the sector the player is now leaving.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m.destSectorId === sectorId) {
        this._failMission(m, i, 'escort_abandoned');
      }
    }
    // Targets in the exited sector are despawned by world; clear our id list so we re-spawn on return.
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
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return; // past the end → sandbox
    const want = BEAT_TRIGGER[beat.beat];
    if (!want) return;
    // gate-only beats (B3/B6/B7) advance via _checkStoryGates, not a discrete trigger.
    if (want === kind) this._advanceStory(beat);
  },

  /** B5 branch-chain progress: completing a branch mission ticks chainProgress toward the goal. */
  _advanceStoryChain(m) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 5 || !story.branch) return;
    const wantType = BRANCH_CHAIN_TYPE[story.branch];
    const wantCount = BRANCH_CHAIN_COUNT[story.branch];
    if (m.type !== wantType) return;
    story.chainProgress = (story.chainProgress || 0) + 1;
    if (story.chainProgress >= wantCount) { story.chainProgress = 0; this._advanceStory(beat); }
    else this.bus.emit('toast', { text: `Proving Ground: ${story.chainProgress}/${wantCount}`, kind: 'info', ttl: 3 });
  },

  /** B4: accepting a faction intro contract sets the branch. */
  _maybeSetBranch(inst) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return;
    // Map the accepted offer's faction to a branch.
    const branch = Object.keys(BRANCH_FACTION).find((b) => BRANCH_FACTION[b] === inst.factionId);
    if (!branch) return;
    story.branch = branch;
    inst.storyTag = 4;
    // B4 reward: chosen faction +15, opposing -10 (these have no other channel → emit directly).
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

  _advanceStory(beat) {
    const story = this.state.story;
    if (story.beatIndex !== beat.beat) return; // already advanced
    const fromIndex = story.beatIndex;
    // Grant beat reward (credits + rep + unlock flag).
    if (beat.reward) {
      if (beat.reward.credits) this.bus.emit('economy:grantCredits', { amount: beat.reward.credits, reason: `story:${beat.id}` });
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
    // Direction toast: tell the player what the NEW current beat wants.
    // NOTE: the sandbox fallback (past B7) deliberately does NOT grant a title. Per
    // ENDGAME-B7-REDESIGN.md, "None of these choices is rewarded with a title." The story system
    // (src/systems/story.js) presents the five endgame choices on the B7 gate; this line is only the
    // spine's terminal state, kept neutral so the endgame overlay owns the disposition.
    const nextBeat = STORY_BEATS[story.beatIndex];
    this._refreshNavigation({ forceStory: true, silent: true });
    const dir = (nextBeat && story.beatIndex !== fromIndex) ? BEAT_HINT[nextBeat.beat] : 'The contracts continue. The count never ends.';
    if (dir) this.bus.emit('toast', { text: dir, kind: 'story', ttl: 6 });
    this.bus.emit('mission:updated', { missionId: null });
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
  newGame() {
    const state = this.state;
    state.missions.boards = {};
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    state.missions.nextId = 1;
    state.missions.config = MISSION_TUNING;
    state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    this._spawnSeq = 0;
    this._navRefreshT = 0;
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;
    this._refreshNavigation({ forceStory: true, silent: true });
    // Direction toast for the opening beat (guard against the double newGame call: save.newGame()
    // then game:started both fire it → only toast once).
    const toastKey = state.meta && state.meta.seed;
    if (this._newGameToastSeed !== toastKey) {
      this._newGameToastSeed = toastKey;
      const b0 = STORY_BEATS[state.story.beatIndex];
      if (b0 && BEAT_HINT[b0.beat]) this.bus.emit('toast', { text: BEAT_HINT[b0.beat], kind: 'story', ttl: 6 });
    }
  },

  serialize() {
    const m = this.state.missions;
    // Strip transient runtime fields (entity ids) from active missions.
    const active = (m.active || []).map((a) => {
      const { targetEntityIds, _escorteeId, _escorteeSectorId, _escorteeArrived, ...rest } = a;
      return { ...rest, targetEntityIds: [], needsTargets: a.needsTargets };
    });
    return {
      boards: m.boards, active, completedLog: m.completedLog, receipts: normalizeMissionReceipts(m.receipts),
      nextId: m.nextId, config: m.config || MISSION_TUNING,
      story: this.state.story,
    };
  },

  deserialize(data) {
    if (!data) return;
    const state = this.state;
    state.missions.boards = data.boards || {};
    state.missions.completedLog = data.completedLog || [];
    state.missions.receipts = normalizeMissionReceipts(data.receipts);
    state.missions.nextId = data.nextId || 1;
    state.missions.config = data.config || MISSION_TUNING;
    // Stale-target GC: clear live entity ids; targets re-spawn when the player (re-)enters the sector.
    state.missions.active = (data.active || []).map((a) => ({
      ...a, targetEntityIds: [], _escorteeId: null, _escorteeArrived: false, status: a.status || 'active',
    }));
    if (data.story) state.story = data.story;
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

// Story-beat trigger kind (first-X model). Gate-only beats (3/6/7) use discrete events / gates.
const BEAT_TRIGGER = {
  0: 'mine',           // first mining yield
  1: 'trade',          // first sell
  2: 'kill',           // first player kill
  3: 'ship_purchased', // buy any ship (T2 gate is a soft hint)
  4: null,             // branch set on accept (handled in _maybeSetBranch)
  5: null,             // branch chain (handled in _advanceStoryChain)
  6: 'asset_deployed', // first passive asset
  7: null,             // net-worth gate (handled in _checkStoryGates)
};

// Per-branch B5 chain requirements (spec B5).
const BRANCH_CHAIN_TYPE = { traders: 'bulk_trade', patrol: 'patrol_clear', free: 'smuggling_run' };
const BRANCH_CHAIN_COUNT = { traders: 3, patrol: 2, free: 2 };

// Direction hints shown when a beat becomes current (Captain's Log north star).
const BEAT_HINT = {
  0: 'Cold Start: mine ore from an asteroid field, then dock to sell or deliver it.',
  1: 'Honest Work: buy low and sell high — haul a cargo to a neighbouring station.',
  2: 'First Blood: arm up and destroy a hostile ship.',
  3: 'Bigger Boat: earn credits and buy a bigger hull at a shipyard.',
  4: 'Pick a Side: accept an intro contract from a faction to choose your path.',
  5: 'Proving Ground: complete your faction\'s mission chain.',
  6: 'Empire Seed: deploy your first passive asset (drone, trader, or outpost).',
  7: 'The Deep Reach: amass 100,000cr and 50 rep with your faction, then claim the stars.',
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
