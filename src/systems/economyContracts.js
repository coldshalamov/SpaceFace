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
//   • A calm field emits NOTHING — strict no-op, golden-sim safe.
//
// noTouch honored: missions.js / sectorSim.js / economy.js / dangerModel.js are imported read-only
// (their exported contracts), never edited. Budget: spawn:none at offer time · voice: one 'news'
// line per offer · draw:none.

import { SECTORS } from '../data/sectors.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { MISSION_TYPES, MISSION_TUNING } from '../data/missions.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { sectorSignalFor, effectiveDangerTierFor } from './sectorSim.js';
import {
  selectEconContract, fillCause, SCARCITY_PAY_SCALE, BLOCKADE_PAY_SCALE, BLOCKADE_RELIEF_CMDTYS,
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
      id: st.id, name: st.name, type: st.type,
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

/** Stable board-ready offer id: eco_<stationId>_<epoch>. Pure. */
export function stableFieldOfferId(stationId, epoch) {
  return `eco_${stationId}_${epoch}`;
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
  if (!state || typeof state !== 'object') return { evaluatedEpochByStation: {} };
  if (!state.economyContracts || typeof state.economyContracts !== 'object') {
    state.economyContracts = { evaluatedEpochByStation: {} };
  }
  if (!state.economyContracts.evaluatedEpochByStation
      || typeof state.economyContracts.evaluatedEpochByStation !== 'object') {
    state.economyContracts.evaluatedEpochByStation = {};
  }
  return state.economyContracts;
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

export const economyContracts = {
  name: 'economyContracts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._ensureState();
    this._onDocked = (p) => this._handleDock(p && p.stationId);
    this.bus.on('dock:docked', this._onDocked);
    // Fresh runs reset dedupe. Loads restore it through deserialize before save:loaded fires.
    this.bus.on('game:started', () => this.newGame());
  },

  newGame() {
    this.state.economyContracts = { evaluatedEpochByStation: {} };
  },

  _ensureState() {
    return ensureFieldContractState(this.state);
  },

  serialize() {
    const own = this._ensureState();
    return { evaluatedEpochByStation: { ...own.evaluatedEpochByStation } };
  },

  deserialize(data) {
    const source = data && data.evaluatedEpochByStation;
    const evaluatedEpochByStation = {};
    if (source && typeof source === 'object') {
      for (const stationId of Object.keys(source).sort()) {
        const epoch = Number(source[stationId]);
        if (Number.isFinite(epoch)) evaluatedEpochByStation[stationId] = Math.floor(epoch);
      }
    }
    this.state.economyContracts = { evaluatedEpochByStation };
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

  _handleDock(stationId) {
    try {
      if (!stationId) return;
      const info = STATION_INFO.get(stationId);
      if (!info) return; // gates / unknown stations post no contracts
      const own = this._ensureState();
      const epoch = this._epoch();
      // Dedupe per station-epoch: one field evaluation, offer or not.
      if (isStationEpochEvaluated(own, stationId, epoch)) return;
      markStationEpochEvaluated(own, stationId, epoch);

      const offer = this.planOffer(info, epoch);
      if (!offer) return; // calm field → strict no-op

      // EMIT-ONLY: never writes state.missions — missions.js owns boards/active.
      // Durable offer + station-epoch state always land; only the nonessential news voice
      // is suppressed while onboarding owns the one-voice channel (spec2/00 + first-hour).
      this.bus.emit('mission:offered', offer);
      if (isOnboardingActive(this.state)) return;
      // One news line, through the arbiter (falls back to a toast exactly like marketNews).
      const line = `Contract posted at ${info.name}: ${offer.title}`;
      const said = this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function'
        ? this.helpers.voice.say({ channel: 'news', text: line, kind: 'contract' })
        : false;
      if (!said) this.bus.emit('toast', { text: line, kind: 'info', ttl: 4 });
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
    const local = sectorSignalFor(state, info.sectorId);
    if (!local) return null;
    const selected = selectEconContract(local);
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
    let destStationId = info.id;
    let destSectorId = info.sectorId;
    let cmdtyId = null;
    if (selected.template.key === 'blockade_relief') {
      // BP-12 BLOCKADE_RELIEF: relief cargo (medical/food/fuel) INTO the besieged station. The
      // destination is the station itself (the player picks the cargo up at a neighbor and runs it
      // in past the interdiction). Seeded pick from the relief pool.
      cmdtyId = BLOCKADE_RELIEF_CMDTYS[Math.floor(rng() * BLOCKADE_RELIEF_CMDTYS.length)];
      destStationId = info.id; // relief runs INTO the besieged station
      destSectorId = info.sectorId;
    } else if (selected.template.key === 'scarcity_fuel_run') {
      cmdtyId = FUEL_CMDTY; // the fuel run: bring fuel IN to the scarce station
    } else if (selected.template.key === 'surplus_haul_out') {
      cmdtyId = LEGAL_TRADE_CMDTYS[Math.floor(rng() * LEGAL_TRADE_CMDTYS.length)] || FUEL_CMDTY;
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

    // ── params: EXACTLY the shapes missions._rollParams produces for these types ───────────────
    const distance = sectorDistanceWu(info.sectorId, destSectorId);
    const def = TYPE_BY_ID.get(typeId) || {};
    const [rLo, rHi] = def.riskTierRange || [0, 4];
    const riskTier = clamp(effectiveDangerTierFor(state, destSectorId), rLo, rHi);
    let params;
    if (typeId === 'cargo_delivery') {
      const qty = 6 + Math.floor(rng() * 16);
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

    // ── reward: the missions multiplicative family, PAY TETHERED TO THE LIVE FIELD ─────────────
    const base = (cfg.BASE && cfg.BASE[typeId]) || 100;
    const fDist = 1 + distance / (cfg.distDivisor || 2000);
    const fRisk = (cfg.RISK_MULT && cfg.RISK_MULT[riskTier]) || 1;
    // Scarcity premium scales with the modeled pressure (never a constant): +0% at the 0.25
    // threshold up to ~+105% at full pressure. BP-12 BLOCKADE_RELIEF pays the war-profiteer premium
    // (BLOCKADE_PAY_SCALE) on the LIVE scarcity — the relief run's pay must read the field, not a
    // constant (the packet's named failureMode). Other templates pay the standard family.
    const fField = selected.template.key === 'scarcity_fuel_run'
      ? 1 + Math.max(0, local.pricePressure) * SCARCITY_PAY_SCALE
      : selected.template.key === 'blockade_relief'
        ? 1 + Math.max(0, local.pricePressure) * BLOCKADE_PAY_SCALE
        : 1;
    const reward_cr = round(base * fDist * fRisk * params.fValue * fField);
    const travel = distance / (cfg.cruiseSpeedRef || 140);
    const time_limit_s = round((travel + params.taskTime) * (cfg.slackDefault || 2.2));
    const collateral_cr = def.collateral ? round((cfg.collateralPct || 0.25) * reward_cr) : 0;

    // ── prose: the offer NAMES the commodity and the cause ─────────────────────────────────────
    const sectorName = (sector && sector.name) || info.sectorId;
    const commodity = cmdtyId ? cmdtyName(cmdtyId) : null;
    const causeLine = fillCause(selected.template.cause, {
      commodity, sector: sectorName, station: info.name,
    });
    const title = this._titleFor(typeId, selected.template.key, params, info, destStationId, commodity);

    // Board-ready offer: stable id, cause-named prose, accept-path shape. Emit-only consumer.
    return {
      id: stableFieldOfferId(info.id, epoch),
      source: 'economyContract',
      type: typeId,
      stationId: info.id,
      factionId: info.factionId, // cosmetic + kill-rep only, exactly like board offers
      reward_cr, time_limit_s, collateral_cr, riskTier,
      destStationId, destSectorId, distance,
      params,
      title,
      summary: causeLine,
      cause: { tag: selected.causeTag, axis: selected.template.causeAxis, line: causeLine },
      expiresAtEpoch: epoch + 1,
      storyTag: null,
    };
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
    if (this.bus && this.bus.off && this._onDocked) this.bus.off('dock:docked', this._onDocked);
    this._onDocked = null;
  },
};

export default economyContracts;
