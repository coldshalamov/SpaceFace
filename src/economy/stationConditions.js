// THE WORLD REMEMBERS — U-C: stations with memory (pure read side).
//
// Economy is the single writer of `state.economy.stationConditions[stationId]`; this module only
// READS it (and normalizes it for save), so the berth gate (data/frontierRumors.js), the dock
// command gate (core/dockAccess.js), the yard (systems/stationServices.js) and the quote layer can
// all see the same live condition without importing the economy system.
//
// Record shape (every field optional; a station with nothing live has NO record at all):
//   {
//     outageRepairUntil, outageCause, outageAtT,   // dock slam: the repair bay is down until then
//     strikeUntil, strikeKills,                    // crews killed: sell prices worse, yard slow
//     boomUntil, boomYieldU,                       // ore flood: the yard is flush, service cheap
//     grudge: { slams, untilPaidCr, fineCr, since },  // 3 slams in a day: berth refused until paid
//     slamLog: [{ t, fineCr, debtBefore }],        // pre-grudge slam tally (live window only)
//     killLog: [t, ...],                           // pre-strike worker-kill tally (live window)
//     cause, atT,                                  // last arming cause + sim time
//   }
// A blockade is NOT stored: factions owns the conflict map and it is time-varying, so the blockade
// is derived on read from `state.conflicts` (blockadeFor) — nothing to save, nothing to expire.
//
// The legacy `state.economy.stationOutages[id].repairUntil` shape is still honored on read so older
// fixtures and saves keep working; new writes go to the record above.

import { activeFrontForFaction } from '../data/conflictZones.js';

export const STATION_CONDITION_LAW = Object.freeze({
  // One "day" in sim seconds — the same clock the rumor/fuel-reserve day latches use.
  dayS: 600,
  strike: Object.freeze({
    killsToStrike: 2,        // the player's kills of a station's own crew inside the window
    windowS: 600,
    strikeS: 600,            // ~1 day of crews off the floor
    sellMult: 0.85,          // the player's sell price at this berth
    serviceCostMult: 1.25,   // repair/refuel unit price
    yardRateMult: 0.6,       // the yard works slower
  }),
  boom: Object.freeze({
    boomS: 600,
    serviceCostMult: 0.8,    // repair/refuel unit price — the yard is flush
  }),
  grudge: Object.freeze({
    slamsToGrudge: 3,
    windowS: 600,
    refusal: 'Dock control: pay your note before you come through our ring again',
  }),
  blockade: Object.freeze({
    buyMult: 1.2,            // the player's buy price: goods run dear behind a line
    refuelFillFrac: 0.6,     // rationed: the pumps fill the tank only this far
  }),
});

/** Crew roles whose death a station reads as "my shift". Haulers/couriers are traders, not crew. */
export const STATION_CREW_ROLES = Object.freeze([
  'miner', 'ore_carrier', 'sweeper', 'tender', 'tug', 'salvor', 'surveyor', 'prospector',
]);

const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

export function stationConditionRecord(state, stationId) {
  const all = state && state.economy && state.economy.stationConditions;
  const rec = all && stationId ? all[stationId] : null;
  return rec && typeof rec === 'object' ? rec : null;
}

function nowOf(state) { return Number(state && state.simTime) || 0; }

function liveUntil(until, now) {
  const u = finite(until);
  return u != null && u > now ? u : null;
}

/** The player's open note, in whole credits. */
function debtOf(state) {
  return Math.max(0, Math.round(Number(state && state.player && state.player.debt) || 0));
}

/** A grudge is live while the note still stands above the level it must be paid back down to. */
export function grudgeLive(state, grudge) {
  if (!grudge || typeof grudge !== 'object') return false;
  const floor = Math.max(0, Math.round(Number(grudge.untilPaidCr) || 0));
  return debtOf(state) > floor;
}

/** Live grudge for a berth, or null. Pure; the sweep in economy emits the cleared receipt. */
export function stationGrudge(state, stationId) {
  const rec = stationConditionRecord(state, stationId);
  return rec && grudgeLive(state, rec.grudge) ? rec.grudge : null;
}

/** The refusal text the berth gate, the mission preflight and the dock banner all speak. */
export function stationGrudgeRefusal(state, stationId) {
  return stationGrudge(state, stationId) ? STATION_CONDITION_LAW.grudge.refusal : null;
}

/** Derived blockade: a live WAR front on this berth's own sector, for the berth's own faction. */
export function blockadeFor(state, info) {
  if (!info || !info.factionId || !info.sectorId || !state || !state.conflicts) return null;
  const front = activeFrontForFaction(state.conflicts, info.factionId);
  if (!front || front.sectorId !== info.sectorId) return null;
  const live = state.conflicts[front.pairKey];
  if (!live || live.state !== 'war') return null;
  return { pairKey: front.pairKey, sectorId: front.sectorId, factions: front.pairKey.split(':') };
}

/**
 * Everything live at this berth right now, or null when nothing is.
 * `info` (optional, { factionId, sectorId }) enables the derived blockade read.
 */
export function liveStationConditions(state, stationId, info = null) {
  if (!state || !stationId) return null;
  const now = nowOf(state);
  const rec = stationConditionRecord(state, stationId);
  const legacy = state.economy && state.economy.stationOutages && state.economy.stationOutages[stationId];
  const out = { stationId, outage: null, strike: null, boom: null, grudge: null, blockade: null };
  let any = false;

  const outageUntil = Math.max(
    liveUntil(rec && rec.outageRepairUntil, now) || 0,
    liveUntil(legacy && legacy.repairUntil, now) || 0,
  );
  if (outageUntil > 0) {
    out.outage = {
      untilSimTime: outageUntil, remainingS: outageUntil - now,
      cause: (rec && rec.outageCause) || (legacy && legacy.cause) || 'dock_slam',
    };
    any = true;
  }
  const strikeUntil = liveUntil(rec && rec.strikeUntil, now);
  if (strikeUntil != null) {
    out.strike = { untilSimTime: strikeUntil, remainingS: strikeUntil - now, kills: Number(rec.strikeKills) || 0 };
    any = true;
  }
  const boomUntil = liveUntil(rec && rec.boomUntil, now);
  if (boomUntil != null) {
    out.boom = { untilSimTime: boomUntil, remainingS: boomUntil - now, yieldU: Number(rec.boomYieldU) || 0 };
    any = true;
  }
  if (rec && grudgeLive(state, rec.grudge)) {
    out.grudge = { ...rec.grudge, debtCr: debtOf(state) };
    any = true;
  }
  const blockade = blockadeFor(state, info);
  if (blockade) { out.blockade = blockade; any = true; }
  return any ? out : null;
}

/** Unit-price multiplier on a docked service (`repair` | `refuel`) at this berth. */
export function stationServiceMult(state, stationId, service) {
  if (service !== 'repair' && service !== 'refuel') return 1;
  const live = liveStationConditions(state, stationId, null);
  if (!live) return 1;
  let mult = 1;
  if (live.strike) mult *= STATION_CONDITION_LAW.strike.serviceCostMult;
  if (live.boom) mult *= STATION_CONDITION_LAW.boom.serviceCostMult;
  return mult;
}

/** Yard work-rate multiplier for the player's job at this berth (strike: slower crews). */
export function stationYardRateMult(state, stationId) {
  const live = liveStationConditions(state, stationId, null);
  return live && live.strike ? STATION_CONDITION_LAW.strike.yardRateMult : 1;
}

/** Player buy/sell price multipliers at this berth (strike: worse sells; blockade: dear buys). */
export function stationTradeMults(state, stationId, info = null) {
  const live = liveStationConditions(state, stationId, info);
  const mults = { buy: 1, sell: 1 };
  if (!live) return mults;
  if (live.strike) mults.sell *= STATION_CONDITION_LAW.strike.sellMult;
  if (live.blockade) mults.buy *= STATION_CONDITION_LAW.blockade.buyMult;
  return mults;
}

/** Units of fuel the pumps will still put in the tank right now (Infinity when not rationed). */
export function stationRefuelRationU(state, stationId, info, fuel) {
  const live = liveStationConditions(state, stationId, info);
  if (!live || !live.blockade) return Infinity;
  const max = Number(fuel && fuel.max) || 0;
  const cur = Number(fuel && fuel.current) || 0;
  return Math.max(0, Math.floor(max * STATION_CONDITION_LAW.blockade.refuelFillFrac - cur));
}

/** Quote-layer chips + one short reason for a yard service (`repair` | `refuel`), from a live view. */
export function stationConditionChips(live, service) {
  if (!live || (service !== 'repair' && service !== 'refuel')) return { chips: [], reason: null };
  const chips = [];
  const reasons = [];
  if (live.strike) { chips.push({ text: 'crews on strike', kind: 'warn' }); reasons.push('crews are off the floor'); }
  if (live.boom) { chips.push({ text: 'yard flush', kind: 'ok' }); reasons.push('the yard is flush'); }
  if (live.blockade && service === 'refuel') { chips.push({ text: 'fuel rationed', kind: 'warn' }); reasons.push('blockade rationing'); }
  return { chips, reason: reasons.length ? reasons.join(', ') : null };
}

// ---- save -----------------------------------------------------------------------------------

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Split the live conditions into the two save shapes: `outages` keeps the C6 chunk shape
 * ({ [stationId]: { repairUntil, cause, atT } }) byte-for-byte, `conditions` carries everything
 * else. Both are null when nothing is live. `checkDebt` drops a grudge whose note is already paid
 * (save time); restore passes false because the player record may not be restored yet.
 */
export function splitStationConditionsForSave(state, now, { checkDebt = true } = {}) {
  const outages = {};
  const conditions = {};
  let anyOutage = false;
  let anyCondition = false;
  const econ = state && state.economy;
  const ids = new Set([
    ...Object.keys((econ && econ.stationConditions) || {}),
    ...Object.keys((econ && econ.stationOutages) || {}),
  ]);
  for (const id of ids) {
    const rec = econ && econ.stationConditions && econ.stationConditions[id];
    const legacy = econ && econ.stationOutages && econ.stationOutages[id];
    const repairUntil = Math.max(
      liveUntil(rec && rec.outageRepairUntil, now) || 0,
      liveUntil(legacy && legacy.repairUntil, now) || 0,
    );
    if (repairUntil > 0) {
      outages[id] = {
        repairUntil,
        cause: (rec && rec.outageCause) || (legacy && legacy.cause) || 'dock_slam',
        atT: num((rec && rec.outageAtT) ?? (legacy && legacy.atT)),
      };
      anyOutage = true;
    }
    if (!rec || typeof rec !== 'object') continue;
    const row = {};
    const strikeUntil = liveUntil(rec.strikeUntil, now);
    if (strikeUntil != null) { row.strikeUntil = strikeUntil; row.strikeKills = num(rec.strikeKills); }
    const boomUntil = liveUntil(rec.boomUntil, now);
    if (boomUntil != null) { row.boomUntil = boomUntil; row.boomYieldU = num(rec.boomYieldU); }
    const g = rec.grudge;
    if (g && typeof g === 'object' && (!checkDebt || grudgeLive(state, g))) {
      row.grudge = {
        slams: Math.max(1, Math.round(num(g.slams, 1))),
        untilPaidCr: Math.max(0, Math.round(num(g.untilPaidCr))),
        fineCr: Math.max(0, Math.round(num(g.fineCr))),
        since: num(g.since),
      };
    }
    const win = STATION_CONDITION_LAW;
    const slamLog = Array.isArray(rec.slamLog)
      ? rec.slamLog.filter((e) => e && now - num(e.t) < win.grudge.windowS)
        .map((e) => ({ t: num(e.t), fineCr: Math.round(num(e.fineCr)), debtBefore: Math.round(num(e.debtBefore)) }))
      : [];
    if (slamLog.length && !row.grudge) row.slamLog = slamLog;
    const killLog = Array.isArray(rec.killLog)
      ? rec.killLog.map(Number).filter((t) => Number.isFinite(t) && now - t < win.strike.windowS)
      : [];
    if (killLog.length) row.killLog = killLog;
    if (Object.keys(row).length) {
      row.cause = typeof rec.cause === 'string' ? rec.cause : null;
      row.atT = num(rec.atT);
      conditions[id] = row;
      anyCondition = true;
    }
  }
  return {
    outages: anyOutage ? outages : null,
    conditions: anyCondition ? conditions : null,
  };
}
