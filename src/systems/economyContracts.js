// economyContracts.js — BP-12 packet ECONOMY_BORN_MISSIONS ("Missions Born From The Field").
//
// The board isn't random — a fuel-run appears BECAUSE fuel actually got scarce out here, and the
// offer says so. This is a board-augment SOURCE: on `dock:docked` it reads the LOCAL + NEIGHBOR
// sector signals through the shipped field contract (sectorSim.sectorSignalFor), and when the
// dominant driver crosses a real threshold it emits AT MOST ONE `mission:offered` for that
// station-epoch, shaped EXACTLY like a missions.js board offer so the existing accept path
// (accept → _ensureMissionTargets → spawnBudget; completion → economy:grantCredits) consumes it
// unchanged.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • OFFERS ONLY — this system NEVER writes state.missions (missions.js owns boards/active).
//     It emits the same `mission:offered` hook salvage.js already uses.
//   • Dedupe per station-epoch — one field evaluation per (stationId, epoch); re-docking inside
//     the same epoch is silent.
//   • Seeded — mulberry32(hash32(seed, stationId, epoch, 'econContract')); SELECTION is keyed to
//     the field driver (selectEconContract is roll-free), rng covers only qty/destination variety.
//   • Rewards are cosmetic-faction rep only (offer.factionId = the station's faction, exactly like
//     board offers) — hostility never couples to factionId (scanner.isHostileToPlayer owns that).
//   • Payout is tethered to the LIVE field (scarcity pay scales with modeled pricePressure).
//   • A calm field may post one bounded maintenance recovery; it never grants idle income.
//
// noTouch honored: missions.js / sectorSim.js / economy.js / dangerModel.js are imported read-only
// (their exported contracts), never edited. Budget: spawn:none at offer time · voice: one 'news'
// line per offer · draw:none.

import { SECTORS } from '../data/sectors.js';
import { ECONOMY_BALANCE as BALANCE } from '../data/economyDerived.js';
import { quoteMissionEconomics, affordableContractQuantity, economicRiskTier } from '../economy/economyMissionTerms.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { MISSION_TYPES, MISSION_TUNING } from '../data/missions.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { sectorSignalFor, effectiveDangerTierFor } from './sectorSim.js';
import { starvedIndustryNeedFor } from './economy.js';
import {
  selectEconContract, fillCause, SCARCITY_PAY_SCALE, BLOCKADE_PAY_SCALE, BLOCKADE_RELIEF_CMDTYS,
  FIRST_TRADE_CONTRACT_STATION_ID,
  buildFirstTradeOffer,
  starvedOfferProse,
} from '../data/economyContractTemplates.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));

// station id → { id, name, type, factionId, sectorId } (same derivation missions/economy use).
const STATION_INFO = new Map();
for (const sec of SECTORS) {
  for (const st of (sec.stations || [])) {
    STATION_INFO.set(st.id, {
      id: st.id, name: st.name, type: st.type, tier: sec.tier || 0, size: st.size || 'M',
      factionId: st.factionId || sec.factionId, sectorId: sec.id,
    });
  }
}

const LEGAL_TRADE_CMDTYS = COMMODITIES.filter((c) => c.legality === 'legal').map((c) => c.id);
const SALVAGE_CMDTYS = ['cmdty_scrap_metal', 'cmdty_salvage_electronics']; // mirrors missions.js salvage_retrieval pool
const FUEL_CMDTY = 'cmdty_fuel_cells';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

/** True while the staged first-hour tutorial owns the voice channel (spec2/00 one-voice). */
export function isOnboardingActive(state) {
  const ob = state && state.onboarding;
  return !!(ob && ob.active && !ob.finished);
}

// ── ECON-P4 pure field-contract helpers (emit-only discipline; no missions authority) ─────────

/** Stable board-ready offer id: eco_<stationId>_<epoch>[_<slot>]. Pure. The optional slot
 *  distinguishes the two rows of one competing-feedstock evaluation (NXB-043). */
export function stableFieldOfferId(stationId, epoch, slot = '') {
  return slot ? `eco_${stationId}_${epoch}_${slot}` : `eco_${stationId}_${epoch}`;
}

/** Contract board epoch from simTime + refreshSec (missions config default 600). Pure. */
export function fieldContractEpoch(simTime, refreshSec = 600) {
  const step = Number(refreshSec) > 0 ? Number(refreshSec) : 600;
  return Math.floor((Number(simTime) || 0) / step);
}

/** True when this station already evaluated the given epoch. Pure over the dedupe bag. */
export function isStationEpochEvaluated(own, stationId, epoch) {
  if (!own || !stationId) return false;
  const bag = own.evaluatedEpochByStation;
  return !!(bag && bag[stationId] === epoch);
}

/**
 * Mark station+epoch evaluated in the local dedupe bag ONLY.
 * Does NOT write state.missions (missions.js owns boards/active).
 * Returns the bag for chaining; null when own is missing.
 */
export function markStationEpochEvaluated(own, stationId, epoch) {
  if (!own || typeof own !== 'object' || !stationId) return null;
  if (!own.evaluatedEpochByStation || typeof own.evaluatedEpochByStation !== 'object') {
    own.evaluatedEpochByStation = {};
  }
  own.evaluatedEpochByStation[stationId] = epoch;
  return own;
}

/** Ensure / return the local dedupe state bag (economyContracts only — not missions). */
export function ensureFieldContractState(state) {
  if (!state || typeof state !== 'object') {
    return { evaluatedEpochByStation: {}, firstTradeOffered: false };
  }
  if (!state.economyContracts || typeof state.economyContracts !== 'object') {
    state.economyContracts = { evaluatedEpochByStation: {}, firstTradeOffered: false };
  }
  if (!state.economyContracts.evaluatedEpochByStation
      || typeof state.economyContracts.evaluatedEpochByStation !== 'object') {
    state.economyContracts.evaluatedEpochByStation = {};
  }
  if (typeof state.economyContracts.firstTradeOffered !== 'boolean') {
    state.economyContracts.firstTradeOffered = !!state.economyContracts.firstTradeOffered;
  }
  return state.economyContracts;
}

/**
 * Plan the authored G06 first-trade offer for Helios. Deterministic for a seed.
 * Pure over seed + options; does not mutate state.
 */
export function planFirstTradeOffer(state, options = {}) {
  const seed = (state && state.meta && state.meta.seed) || 1;
  const cfg = (state && state.missions && state.missions.config) || MISSION_TUNING;
  const epoch = fieldContractEpoch(
    (state && state.simTime) || 0,
    (cfg && cfg.refreshSec) || 600,
  );
  return buildFirstTradeOffer(seed, {
    nonce: 'helios',
    expiresAtEpoch: epoch + 8,
    ...options,
  });
}

// Map-space sector distance → wu (same shape missions.js uses; deterministic, bounded).
function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600;
  const a = SECTOR_BY_ID.get(aSectorId), b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

function cmdtyName(id) { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; }

function offerClassFor(offer) {
  return offer && offer.type ? String(offer.type) : null;
}

export const economyContracts = {
  name: 'economyContracts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._ensureState();
    // missions._onExternalBoardOffer returns its accept/reject verdict through the synchronous
    // mission:offerBoarded event (bus.emit returns nothing). We hear it inside the same emit
    // that offered it, so a latch only commits after the board actually took the row.
    this._boardedOfferIds = new Set();
    this._onOfferBoarded = (p) => {
      if (p && p.offerId) {
        if (this._boardedOfferIds.size > 256) this._boardedOfferIds.clear();
        this._boardedOfferIds.add(p.offerId);
      }
    };
    this.bus.on('mission:offerBoarded', this._onOfferBoarded);
    this._onDocked = (p) => this._handleDock(p && p.stationId);
    this.bus.on('dock:docked', this._onDocked);
    // Fresh runs reset dedupe. Loads restore it through deserialize before save:loaded fires.
    this._onStarted = () => this.newGame();
    this.bus.on('game:started', this._onStarted);
  },

  newGame() {
    this.state.economyContracts = { evaluatedEpochByStation: {}, firstTradeOffered: false };
    if (this._boardedOfferIds) this._boardedOfferIds.clear();
  },

  _ensureState() {
    return ensureFieldContractState(this.state);
  },

  serialize() {
    const own = this._ensureState();
    return {
      evaluatedEpochByStation: { ...own.evaluatedEpochByStation },
      firstTradeOffered: !!own.firstTradeOffered,
    };
  },

  deserialize(data) {
    const source = data && data.evaluatedEpochByStation;
    const evaluatedEpochByStation = {};
    if (source && typeof source === 'object') {
      for (const stationId of Object.keys(source).sort()) {
        const epoch = Number(source[stationId]);
        if (STATION_INFO.has(stationId) && Number.isFinite(epoch)) evaluatedEpochByStation[stationId] = Math.floor(epoch);
      }
    }
    this.state.economyContracts = {
      evaluatedEpochByStation,
      firstTradeOffered: !!(data && data.firstTradeOffered),
    };
  },

  _epoch() {
    const cfg = (this.state.missions && this.state.missions.config) || MISSION_TUNING;
    return fieldContractEpoch(this.state.simTime, cfg.refreshSec || 600);
  },

  /**
   * Public station+epoch dedupe read — true when this station already evaluated the current
   * (or supplied) epoch. Emit-only system; never writes missions boards.
   */
  hasEvaluated(stationId, epoch = null) {
    const own = this._ensureState();
    const ep = epoch != null ? epoch : this._epoch();
    return isStationEpochEvaluated(own, stationId, ep);
  },

  /**
   * True when missions already owns this offer — either still listed on the station board or
   * already accepted into the active list. A taken-into-active offer is a delivered offer:
   * without this the latch would stay open and every later dock would re-emit (and be
   * rejected as) the same row.
   */
  _offerOnBoard(stationId, offerId) {
    const missions = this.state && this.state.missions;
    const board = missions && missions.boards && missions.boards[stationId];
    const slots = board && board.slots;
    if (Array.isArray(slots) && slots.some((row) => row && row.id === offerId)) return true;
    const active = missions && missions.active;
    if (Array.isArray(active) && active.some((row) => row
      && (row.id === offerId || row.sourceOfferId === offerId))) return true;
    return false;
  },

  /**
   * Emit mission:offered and report whether the board actually TOOK the row.
   * missions._onExternalBoardOffer emits mission:offerBoarded synchronously inside this emit
   * when it unshifts the row; the init listener captured the id, so a confirmed boarding is
   * readable the moment emit() returns. Board inspection is the belt to that suspenders.
   * When no missions board state exists at all (bare harness) the emit-only contract cannot
   * be confirmed or refused — treat the emit as delivered, matching the pre-gate semantics.
   */
  _emitOfferForBoard(stationId, offer) {
    this.bus.emit('mission:offered', offer);
    if (this._boardedOfferIds.delete(offer.id)) return true; // consumed: confirmed in this emit
    if (this._offerOnBoard(stationId, offer.id)) return true;
    const missions = this.state && this.state.missions;
    if (!missions || !missions.boards) return true;
    return false;
  },

  _handleDock(stationId) {
    try {
      if (!stationId) return;
      const info = STATION_INFO.get(stationId);
      if (!info) return; // gates / unknown stations post no contracts
      const own = this._ensureState();
      const epoch = this._epoch();
      const emittedClasses = new Set();

      // G06: one authored first-trade teaching contract at Helios on/after first dock.
      // Emit-only — missions boards the offer via mission:offered. Once per run AND ONLY once
      // the row actually boards: a full board or a source-row collision must not spend the
      // latch — the same authored offer is re-attempted on the next dock until it lands.
      // A restored board already carrying the row commits the latch silently (no re-emit).
      if (stationId === FIRST_TRADE_CONTRACT_STATION_ID && !own.firstTradeOffered) {
        const firstTrade = planFirstTradeOffer(this.state);
        if (this._offerOnBoard(stationId, firstTrade.id)) {
          own.firstTradeOffered = true;
          const firstTradeClass = offerClassFor(firstTrade);
          if (firstTradeClass) emittedClasses.add(firstTradeClass);
        } else if (this._emitOfferForBoard(stationId, firstTrade)) {
          own.firstTradeOffered = true; // committed only after the board took the row
          const firstTradeClass = offerClassFor(firstTrade);
          if (firstTradeClass) emittedClasses.add(firstTradeClass);
          if (!isOnboardingActive(this.state)) {
            const line = `Contract posted at ${info.name}: ${firstTrade.title}`;
            const said = this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function'
              ? this.helpers.voice.say({ channel: 'news', text: line, kind: 'contract' })
              : false;
            if (!said) this.bus.emit('toast', { text: line, kind: 'info', ttl: 4 });
          }
        }
        // else: the board refused it — the latch stays open and the next dock retries.
      }

      // Dedupe per station-epoch: one field evaluation lands on the board per epoch.
      // "Evaluated" is committed ONLY when the epoch's offer actually boarded; a refused
      // offer leaves the epoch open so the identical seeded row retries on a later dock.
      if (isStationEpochEvaluated(own, stationId, epoch)) return;

      // NXB-043 — one evaluation may carry TWO rows: when the same feedstock is starving
      // two reachable yards, both bids post so the player sees the real competition.
      const offers = this.planOffers(info, epoch);
      if (!offers.length) { markStationEpochEvaluated(own, stationId, epoch); return; }
      const fieldClass = offerClassFor(offers[0]);
      if (fieldClass && emittedClasses.has(fieldClass)) {
        markStationEpochEvaluated(own, stationId, epoch);
        return;
      }

      // EMIT-ONLY: never writes state.missions — missions.js owns boards/active. The pair is
      // one evaluation: the class guard applies to it, not between its own rows.
      let boardedAny = false;
      for (const offer of offers) {
        if (this._offerOnBoard(stationId, offer.id)) {
          boardedAny = true; // boarded earlier — dedupe, silent
          continue;
        }
        if (!this._emitOfferForBoard(stationId, offer)) continue; // refused — retry stays open below
        boardedAny = true; // confirmed boarding this emit
        if (!isOnboardingActive(this.state)) {
          // One news line per row, through the arbiter (falls back to a toast like marketNews).
          const line = `Contract posted at ${info.name}: ${offer.title}`;
          const said = this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function'
            ? this.helpers.voice.say({ channel: 'news', text: line, kind: 'contract' })
            : false;
          if (!said) this.bus.emit('toast', { text: line, kind: 'info', ttl: 4 });
        }
      }
      if (boardedAny) {
        if (fieldClass) emittedClasses.add(fieldClass);
        markStationEpochEvaluated(own, stationId, epoch);
      }
      // else: the board refused every row — the epoch stays open; the seeded offers retry.
    } catch (err) {
      console.error('[economyContracts] dock:docked', err);
    }
  },

  /**
   * planOffer(info, epoch) -> board-shaped offer | null. Deterministic: same
   * (seed, stationId, epoch, field digest) ⇒ the same offer, bit for bit.
   */
  planOffer(info, epoch) {
    const state = this.state;
    // A live stock deficit outranks the rolled field contract: a neighbor yard whose industry
    // book is starving posts an inbound relief run for its hungriest input leg — the shortage is
    // the real hopper, and the delivery lands in its market through cargo:delivered → stock.
    const starved = this._starvedNeighborNeed(info);
    if (starved) {
      const offer = this._starvedIndustryOffer(info, starved, epoch);
      if (offer) return offer;
    }
    let local = sectorSignalFor(state, info.sectorId);
    let selected = local ? selectEconContract(local) : null;
    // Relief is a sealed OUTBOUND shipment from this supplier to a distressed neighbor.
    // Posting "bring fuel here" while already docked here allowed a zero-travel self-delivery.
    const reliefKeys = new Set(['blockade_relief', 'scarcity_fuel_run']);
    let reliefDestination = null;
    if (!selected || reliefKeys.has(selected.template.key)) {
      for (const id of [...(SECTOR_BY_ID.get(info.sectorId)?.neighbors || [])].sort()) {
        const signal = sectorSignalFor(state, id);
        const candidate = signal ? selectEconContract(signal) : null;
        const target = (SECTOR_BY_ID.get(id)?.stations || []).slice().sort((a,b) => a.id.localeCompare(b.id))[0];
        if (!candidate || !reliefKeys.has(candidate.template.key) || !target) continue;
        if (!reliefDestination || signal.pricePressure > local.pricePressure) {
          selected = candidate; local = signal;
          reliefDestination = { stationId: target.id, sectorId: id };
        }
      }
      if (!reliefDestination) return null;
    }
    if (!selected) return null;

    const seed = (state.meta && state.meta.seed) || 1;
    const rng = mulberry32(hash32(seed, info.id, epoch, 'econContract') >>> 0);
    const cfg = (state.missions && state.missions.config) || MISSION_TUNING;

    // contested_space resolves the escort template to a patrol_clear (clear the contest, don't
    // just ride through it) — keyed to the driver, not a roll.
    let typeId = selected.template.offerType;
    if (selected.template.key === 'rising_danger_escort' && local.driver.danger === 'contested_space') {
      typeId = 'patrol_clear';
    }

    // ── destination + commodity, per template (neighbor signals read HERE) ─────────────────────
    const sector = SECTOR_BY_ID.get(info.sectorId);
    let destStationId = reliefDestination?.stationId || info.id;
    let destSectorId = reliefDestination?.sectorId || info.sectorId;
    let cmdtyId = null;
    if (selected.template.key === 'blockade_relief') {
      // BP-12 BLOCKADE_RELIEF: relief cargo (medical/food/fuel) INTO the besieged station. The
      // destination is the station itself (the player picks the cargo up at a neighbor and runs it
      // in past the interdiction). Seeded pick from the relief pool.
      cmdtyId = BLOCKADE_RELIEF_CMDTYS[Math.floor(rng() * BLOCKADE_RELIEF_CMDTYS.length)];
      // Destination is the actually disrupted neighbor, selected above.
    } else if (selected.template.key === 'scarcity_fuel_run') {
      cmdtyId = FUEL_CMDTY; // the fuel run: bring fuel IN to the scarce station
    } else if (selected.template.key === 'surplus_haul_out') {
      const eligible = LEGAL_TRADE_CMDTYS.filter((id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= info.tier);
      cmdtyId = eligible[Math.floor(rng() * eligible.length)] || FUEL_CMDTY;
      // Haul TO the neighbor most in need: highest neighbor pricePressure wins (deterministic,
      // neighbor-id tie-break) — the "trade ahead of the field" read made actionable.
      let bestNeighbor = null;
      for (const nId of ((sector && sector.neighbors) || []).slice().sort()) {
        const nSig = sectorSignalFor(state, nId);
        const nSec = SECTOR_BY_ID.get(nId);
        if (!nSig || !nSec || !(nSec.stations || []).length) continue;
        if (!bestNeighbor || nSig.pricePressure > bestNeighbor.pressure) {
          bestNeighbor = { sectorId: nId, pressure: nSig.pricePressure, stations: nSec.stations };
        }
      }
      if (bestNeighbor) {
        destSectorId = bestNeighbor.sectorId;
        destStationId = bestNeighbor.stations[Math.floor(rng() * bestNeighbor.stations.length)].id;
      }
    } else if (selected.template.key === 'station_loss_salvage') {
      cmdtyId = SALVAGE_CMDTYS[Math.floor(rng() * SALVAGE_CMDTYS.length)];
    }

    if (typeId === 'cargo_delivery' && destStationId === info.id) return null;

    // ── params: EXACTLY the shapes missions._rollParams produces for these types ───────────────
    const distance = sectorDistanceWu(info.sectorId, destSectorId);
    const def = TYPE_BY_ID.get(typeId) || {};
    const [rLo, rHi] = def.riskTierRange || [0, 4];
    const riskTier = clamp(effectiveDangerTierFor(state, destSectorId), rLo, rHi);
    let params;
    if (typeId === 'cargo_delivery') {
      const cargo = state.player?.cargo || {};
      const qty = affordableContractQuantity({desired:6+Math.floor(rng()*16),
        freeVolume:(cargo.capVolume || 0)-(cargo.usedVolume || 0),
        volumePerUnit:CMDTY_BY_ID.get(cmdtyId)?.volPerU || 1});
      if (qty < 1) return null;
      const unitVal = (CMDTY_BY_ID.get(cmdtyId) && CMDTY_BY_ID.get(cmdtyId).basePrice) || 50;
      const cargoValue = unitVal * qty;
      params = { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20, passengers: 0 };
    } else if (typeId === 'salvage_retrieval') {
      const qty = 4 + Math.floor(rng() * 10);
      const unitVal = (CMDTY_BY_ID.get(cmdtyId) && CMDTY_BY_ID.get(cmdtyId).basePrice) || 30;
      const cargoValue = unitVal * qty;
      params = { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 30 };
    } else if (typeId === 'bounty_hunt') {
      const targetStrength = 1.2 + riskTier * 0.5 + rng() * 0.6;
      params = { clearCount: 1, killCount: 0, targetStrength, fValue: targetStrength, taskTime: 60 };
    } else if (typeId === 'patrol_clear') {
      const clearCount = 2 + Math.floor(rng() * 3);
      const targetStrength = (1.0 + riskTier * 0.4) * clearCount * 0.6;
      params = { clearCount, killCount: 0, targetStrength, fValue: targetStrength, taskTime: clearCount * 45 };
    } else { // escort
      const targetStrength = 1.0 + riskTier * 0.4 + rng() * 0.5;
      params = { targetStrength, fValue: targetStrength, taskTime: 90 };
    }

    // Canonical expected-net inversion. Sealed client cargo is not the player's principal.
    const preloadedCargo = typeId === 'cargo_delivery';
    const economyTerms = quoteMissionEconomics({type:typeId,
      tier:Math.max(info.tier || 0,STATION_INFO.get(destStationId)?.tier || 0,riskTier),
      riskTier,distance,params,preloadedCargo,fieldPressure:Math.max(0,local.pricePressure || 0)});
    const reward_cr = economyTerms.rewardCr;
    const time_limit_s = economyTerms.deadlineS;
    const collateral_cr = def.collateral ? economyTerms.collateralCr : 0;

    // ── prose: the offer NAMES the commodity and the cause ─────────────────────────────────────
    const causeSector = reliefDestination ? SECTOR_BY_ID.get(destSectorId) : sector;
    const sectorName = causeSector?.name || info.sectorId;
    const commodity = cmdtyId ? cmdtyName(cmdtyId) : null;
    const causeLine = fillCause(selected.template.cause, {
      commodity, sector: sectorName, station: reliefDestination
        ? (STATION_INFO.get(destStationId)?.name || sectorName) : info.name,
    });
    const title = this._titleFor(typeId, selected.template.key, params, info, destStationId, commodity);

    // Board-ready offer: stable id, cause-named prose, accept-path shape. Emit-only consumer.
    return {
      id: stableFieldOfferId(info.id, epoch),
      source: 'economyContract',
      type: typeId,
      stationId: info.id,
      factionId: info.factionId, // cosmetic + kill-rep only, exactly like board offers
      reward_cr, time_limit_s, duration_s: time_limit_s, collateral_cr, riskTier, preloadedCargo,
      economyTerms,
      destStationId, destSectorId, distance,
      params,
      title,
      summary: causeLine,
      cause: { tag: selected.causeTag, axis: selected.template.causeAxis, line: causeLine },
      expiresAtEpoch: epoch + 1,
      storyTag: null,
    };
  },

  /**
   * Reachable-region starvation scan: every tier-eligible industry input leg starving at a yard
   * this station can see — its own sector's other berths plus every neighbor sector's stations,
   * one hop, the same reach the signal templates already quote. The docked station itself is
   * never a destination (a self-delivery would be zero-travel). Each entry is the live hopper
   * fill — a posted shortage names real stock. Hungriest first, station-id tie-break.
   */
  _starvedStationNeeds(info) {
    const markets = this.state && this.state.economy && this.state.economy.markets;
    if (!markets) return [];
    const out = [];
    const seen = new Set([info.id]);
    const readSector = (sec) => {
      if (!sec) return;
      for (const st of (sec.stations || [])) {
        if (seen.has(st.id)) continue;
        seen.add(st.id);
        const need = starvedIndustryNeedFor(st.type, sec.tier || 0, markets[st.id]);
        if (need) out.push({ need, stationId: st.id, sectorId: sec.id });
      }
    };
    readSector(SECTOR_BY_ID.get(info.sectorId));
    for (const nId of (SECTOR_BY_ID.get(info.sectorId)?.neighbors || []).slice().sort()) {
      readSector(SECTOR_BY_ID.get(nId));
    }
    out.sort((a, b) => (a.need.fill - b.need.fill)
      || (a.stationId < b.stationId ? -1 : a.stationId > b.stationId ? 1 : 0));
    return out;
  },

  /**
   * Neighbor-scan starvation read: the hungriest tier-eligible industry input across the sectors
   * this station can see. The need is the live hopper fill — a posted shortage names real stock.
   */
  _starvedNeighborNeed(info) {
    return this._starvedStationNeeds(info)[0] || null;
  },

  /**
   * planOffers(info, epoch) -> array of board-shaped offers (0, 1, or 2). One dock evaluation
   * lands at most ONE field decision — except NXB-043's competing pair: when one feedstock is
   * starving two different reachable yards, both bids post in the same evaluation so the player
   * can read the tradeoff. Deterministic: same (seed, stationId, epoch, markets) ⇒ same rows.
   */
  planOffers(info, epoch) {
    const needs = this._starvedStationNeeds(info);
    // Hungriest contested input: two or more distinct yards starve for the SAME commodity —
    // the available freight can't feed both, so both bids post and the player picks the loser.
    const byInput = new Map();
    for (const row of needs) {
      const group = byInput.get(row.need.inputId);
      if (group) group.push(row);
      else byInput.set(row.need.inputId, [row]);
    }
    const contested = [...byInput.values()]
      .filter((group) => group.length >= 2)
      .sort((a, b) => a[0].need.fill - b[0].need.fill)[0];
    if (contested) {
      const pair = contested.slice(0, 2).map((starved, index) => this._starvedIndustryOffer(
        info, starved, epoch, {
          slot: index === 0 ? '' : 'b',
          rivalStationId: contested[1 - index].stationId,
        },
      ));
      if (pair.every(Boolean)) return pair;
      // A bid that can't price (empty hold, unreachable qty) falls through to the single offer.
    }
    const offer = this.planOffer(info, epoch) || this.planMaintenanceOffer(info, epoch);
    return offer ? [offer] : [];
  },

  /**
   * Board-shaped relief run into a starving yard — same cargo_delivery/relief shape as the
   * signal templates so accept/settle paths are unchanged. Delivery lands via cargo:delivered →
   * stock, so fulfilling the contract physically re-feeds the line it claims to help.
   *
   * NXB-043 — `options.rivalStationId` marks a competing bid: two yards starving for the same
   * input get two rows whose freight is REAL (preloadedCargo: false — sealed client cargo
   * would conjure each berth its own supply and the offers would not actually compete). The
   * same physical lot can land in only one market, so accepting one run decides the other.
   */
  _starvedIndustryOffer(info, starved, epoch, options = {}) {
    const destStationId = starved.stationId;
    const destSectorId = starved.sectorId;
    const cmdtyId = starved.need.inputId;
    const rivalStationId = options.rivalStationId || null;
    const rivalName = rivalStationId
      ? (STATION_INFO.get(rivalStationId)?.name || rivalStationId) : null;
    const cargo = this.state.player?.cargo || {};
    const cargoDef = CMDTY_BY_ID.get(cmdtyId);
    const qty = affordableContractQuantity({
      desired: Math.min(20, starved.need.deficitUnits),
      freeVolume: (cargo.capVolume || 0) - (cargo.usedVolume || 0),
      volumePerUnit: cargoDef?.volPerU || 1,
    });
    if (qty < 1) return null;
    const distance = sectorDistanceWu(info.sectorId, destSectorId);
    const riskTier = clamp(effectiveDangerTierFor(this.state, destSectorId), 0, 4);
    const unitVal = (cargoDef && cargoDef.basePrice) || 50;
    const cargoValue = unitVal * qty;
    const params = { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20, passengers: 0 };
    const preloadedCargo = !rivalName; // a contested bid posts a call for real freight
    const economyTerms = quoteMissionEconomics({
      type: 'cargo_delivery',
      tier: Math.max(info.tier || 0, STATION_INFO.get(destStationId)?.tier || 0, riskTier),
      riskTier, distance, params, preloadedCargo, fieldPressure: 0.5,
    });
    const destName = STATION_INFO.get(destStationId)?.name || destSectorId;
    const commodity = cmdtyName(cmdtyId);
    const prose = starvedOfferProse({ qty, commodity, destName, rivalName });
    const causeLine = prose.line;
    return {
      id: stableFieldOfferId(info.id, epoch, options.slot || ''),
      source: 'economyContract',
      type: 'cargo_delivery',
      stationId: info.id,
      factionId: info.factionId,
      reward_cr: economyTerms.rewardCr, time_limit_s: economyTerms.deadlineS,
      duration_s: economyTerms.deadlineS, collateral_cr: 0, riskTier, preloadedCargo,
      economyTerms,
      destStationId, destSectorId, distance,
      params,
      title: prose.title,
      summary: causeLine,
      cause: {
        tag: 'industry_starved', axis: 'pricePressure', line: causeLine,
        ...(rivalStationId ? { rivalStationId } : null),
      },
      expiresAtEpoch: epoch + 1,
      storyTag: null,
    };
  },

  /** Local recovery is a real physical mission, not a cash stipend or an asteroid respawn.
   * No live or retained maintenance job anywhere => at most one invitation this cadence.
   * The canonical missions owner spawns the slag core only after acceptance.
   */
  planMaintenanceOffer(info, epoch) {
    if (isOnboardingActive(this.state)) return null;
    if (!Number.isFinite(this.state.simTime) || this.state.simTime < BALANCE.mission.maintenanceCadenceS) return null;
    const period = Math.max(1,Math.ceil(BALANCE.mission.maintenanceCadenceS/(((this.state.missions || {}).config || MISSION_TUNING).refreshSec || 300)));
    if (epoch % period !== 0) return null;
    const active = this.state.missions?.active || [];
    if (active.some((m) => m?.source === 'economyMaintenance' && m.status === 'active')) return null;
    const boards = Object.values(this.state.missions?.boards || {});
    if (boards.some((b) => (b?.slots || []).some((m) => m?.source === 'economyMaintenance'
      && Number(m.expiresAtEpoch) > epoch))) return null;
    const riskTier = Math.max(0,Math.min(4,effectiveDangerTierFor(this.state,info.sectorId) || 0));
    const params = {massU:28+Math.min(4,info.tier || 0)*4,taskTime:220,physicalVerb:'tow',
      completionMethods:['tow_in','sling_in'],fValue:1};
    const terms = quoteMissionEconomics({type:'tow_recovery',tier:info.tier || 0,
      riskTier,distance:600,params});
    return {id:`eco_maintenance_${info.id}_${epoch}`,type:'tow_recovery',source:'economyMaintenance',
      stationId:info.id,factionId:info.factionId,destStationId:info.id,destSectorId:info.sectorId,
      distance:600,riskTier,params,reward_cr:terms.rewardCr,collateral_cr:0,
      duration_s:terms.deadlineS,time_limit_s:terms.deadlineS,expiresAtEpoch:epoch+period,
      economyTerms:terms,storyTag:null,title:`Clear the approach: recovery at ${info.name}`,
      brief:'Recover a slag core from the approach and land it at the station. Paid on recovery, not attendance.',
      summary:'Standing port-maintenance work; a physical recovery, not a claim about a new local disaster.'};
  },

  _titleFor(typeId, templateKey, params, info, destStationId, commodity) {
    const destName = (STATION_INFO.get(destStationId) || info).name;
    switch (templateKey) {
      case 'blockade_relief':
        // Headline names the blockade cause — the offer card and the headline AGREE (same driver:
        // infrastructure_disruption). The relief run is war-priced because the field is starving.
        return `Blockade relief: run ${params.qty}u ${commodity} into ${destName} (infrastructure disrupted)`;
      case 'scarcity_fuel_run':
        return `Scarcity run: ${params.qty}u ${commodity} to ${destName} (route scarcity)`;
      case 'surplus_haul_out':
        return `Surplus haul: ${params.qty}u ${commodity} out to ${destName} (route surplus)`;
      case 'station_loss_salvage':
        return `Recover ${params.qty}u ${commodity} from the station loss near ${destName}`;
      case 'reach_bounty':
        return `Bounty: Reach raider wing near ${destName} (Reach pressure)`;
      case 'rising_danger_escort':
        return typeId === 'patrol_clear'
          ? `Clear ${params.clearCount} hostiles off the ${destName} lanes (danger rising)`
          : `Escort a convoy out of ${destName} (danger rising)`;
      default:
        return `Field contract at ${destName}`;
    }
  },

  destroy() {
    if (this.bus && this.bus.off && this._onOfferBoarded) this.bus.off('mission:offerBoarded', this._onOfferBoarded);
    if (this.bus && this.bus.off && this._onDocked) this.bus.off('dock:docked', this._onDocked);
    if (this.bus && this._onStarted) this.bus.off('game:started', this._onStarted);
    this._onOfferBoarded = null;
    this._onStarted = null;
    this._onDocked = null;
  },
};

export default economyContracts;
