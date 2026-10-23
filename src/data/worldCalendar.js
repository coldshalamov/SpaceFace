// worldCalendar.js — PULSE-TIME (build_map row 439), the deterministic world calendar.
//
// One clock face for the whole run, drawn from simTime and the same 600-second sector day the
// rest of the world already runs on (seasonalWeather, stationSideEvents, stationConditions all
// agree: nothing here invents a second clock). Everything below is pure: given the same
// (seed, sectorId, stationId, simTime) it answers the same shift, rush window, market day,
// festival, and storm season — no state reads, no RNG draws, no wall time.
//
//   day        = 600 s. 3 station shifts per day, staggered per station so the traffic rush
//                that follows each shift change lands on a different hour per berth.
//   week       = 5 days. Every station keeps one weekly market day (hash-picked).
//   year       = 40 days (8 weeks). Festivals sit on fixed days-of-year.
//   seasons    = 7 days — the solar-storm calendar seasonalWeather.js already owns; this file
//                wraps it so the calendar reads one vocabulary (storm = ion_storm|solar_wind).

import { hash32 } from '../core/rng.js';
import { weatherSeasonAt, WEATHER_DAY_S } from './seasonalWeather.js';

export const CAL_DAY_S = WEATHER_DAY_S;          // 600 — the one day the world agrees on
export const CAL_WEEK_DAYS = 5;
export const CAL_YEAR_DAYS = CAL_WEEK_DAYS * 8;  // 40-day year

export const CALENDAR_WEEKDAY_NAMES = Object.freeze([
  'Meridian', 'Founds', 'Midweek', 'Tally', 'Verge',
]);

// ── Station shifts ─────────────────────────────────────────────────────────────────────
// Three watches a day. Every station's clock is offset by a hash of its id, so Helios'
// crews change over while the depot across the lane is mid-watch.

export const STATION_SHIFTS = Object.freeze([
  { id: 'first', name: 'first watch', startsAt: 0.0 },
  { id: 'second', name: 'second watch', startsAt: 1 / 3 },
  { id: 'third', name: 'third watch', startsAt: 2 / 3 },
]);

function stationOffsetS(stationId) {
  return stationId ? (hash32('shift-offset', String(stationId)) % CAL_DAY_S) : 0;
}

/** Which watch a berth is on right now. Pure. */
export function stationShiftAt(stationId, simTime) {
  const berthTime = (Number(simTime) || 0) + stationOffsetS(stationId);
  const t = berthTime % CAL_DAY_S;
  const dayFrac = t / CAL_DAY_S;
  let index = 0;
  for (let i = 0; i < STATION_SHIFTS.length; i++) {
    if (dayFrac >= STATION_SHIFTS[i].startsAt) index = i;
  }
  const shift = STATION_SHIFTS[index];
  const nextStart = STATION_SHIFTS[(index + 1) % STATION_SHIFTS.length].startsAt;
  const shiftFrac = ((dayFrac - shift.startsAt) + (dayFrac < shift.startsAt ? 1 : 0));
  const spanFrac = ((nextStart - shift.startsAt) + (nextStart <= shift.startsAt ? 1 : 0));
  const endsInS = Math.max(0, (spanFrac - shiftFrac) * CAL_DAY_S);
  return {
    index,
    id: shift.id,
    name: shift.name,
    // The berth's own watch-day: it turns over when this berth's first watch begins, not at the
    // world's midnight. (watchDay, index) names one watch occurrence, so announcements key on it;
    // the world day (calendarAt().day) turns at a different moment and would split a watch that
    // straddles it into two "new" watches.
    watchDay: Math.floor(Math.max(0, berthTime) / CAL_DAY_S),
    dayFrac,
    endsInS,
    // The last 90 s of a watch is "shift end" — the crew is walking off the floor.
    ending: endsInS <= 90,
  };
}

// ── Rush hours ─────────────────────────────────────────────────────────────────────────
// Traffic rushes bracket each shift change: the outgoing crews undock while the incoming
// watch rides in. Two windows per boundary — the 45 s before and the 75 s after.

export const RUSH_BEFORE_S = 45;
export const RUSH_AFTER_S = 75;

export function rushHourAt(stationId, simTime) {
  const shift = stationShiftAt(stationId, simTime);
  // endsInS ≤ 45 → the pre-change surge; startsInS is the post-change surge.
  if (shift.endsInS <= RUSH_BEFORE_S) {
    return { active: true, kind: 'outbound', stationId, endsInS: shift.endsInS,
      label: 'shift change — crews undocking' };
  }
  const elapsedSinceStart = (CAL_DAY_S / STATION_SHIFTS.length) - shift.endsInS;
  if (elapsedSinceStart <= RUSH_AFTER_S) {
    return { active: true, kind: 'inbound', stationId, endsInS: RUSH_AFTER_S - elapsedSinceStart,
      label: `crew changeover — ${shift.name} riding in` };
  }
  return { active: false, kind: null, stationId, endsInS: 0, label: '' };
}

/** How busy the bar reads right now: 0 quiet .. 1 standing room. Shift-end swell + festival. */
export function barPressureAt(stationId, simTime) {
  const shift = stationShiftAt(stationId, simTime);
  // Crews drift in over the last two minutes of a watch and stay for the first of the next.
  const elapsedSinceStart = (CAL_DAY_S / STATION_SHIFTS.length) - shift.endsInS;
  let pressure = 0.15;                                    // the bar is never truly empty
  if (shift.endsInS <= 120) {
    pressure = Math.max(pressure, 0.55 + (1 - shift.endsInS / 120) * 0.3);
  } else if (elapsedSinceStart <= 60) {
    pressure = Math.max(pressure, 0.85 - (elapsedSinceStart / 60) * 0.45);
  }
  return Math.min(1, pressure);
}

// ── Weekly market days ─────────────────────────────────────────────────────────────────
// Each berth keeps one weekday for open market: sellers crowd the floor, buys run cheap,
// sells run dear. Deterministic per station, so two berths in the same sector rarely share.

export function calendarDay(simTime) {
  return Math.floor(Math.max(0, Number(simTime) || 0) / CAL_DAY_S);
}

export function stationMarketWeekday(stationId) {
  return hash32('market-weekday', String(stationId)) % CAL_WEEK_DAYS;
}

export function marketDayAt(stationId, simTime) {
  const day = calendarDay(simTime);
  const weekday = day % CAL_WEEK_DAYS;
  const isMarket = weekday === stationMarketWeekday(stationId);
  return {
    active: isMarket,
    day,
    weekday,
    weekdayName: CALENDAR_WEEKDAY_NAMES[weekday],
    stationId,
    endsInS: CAL_DAY_S - (Math.max(0, Number(simTime) || 0) % CAL_DAY_S),
  };
}

/**
 * The price fold a market day applies at this berth — consumed by stationTradeMults so the
 * quote layer, the intel snapshot, and the market screen all read the same number.
 *   market day: buy 6% cheaper, sell 6% dearer (sellers flood the floor, buyers outbid you).
 *   ring_fair festival day: the fair doubles it.
 */
export function marketDayMults(stationId, simTime) {
  const mults = { buy: 1, sell: 1 };
  if (!stationId) return mults;
  const festival = festivalAt(stationId, simTime);
  if (marketDayAt(stationId, simTime).active) {
    mults.buy *= 0.94;
    mults.sell *= 1.06;
  }
  if (festival && festival.priceTilt) {
    mults.buy *= festival.priceTilt.buy;
    mults.sell *= festival.priceTilt.sell;
  }
  return mults;
}

// ── Festivals ──────────────────────────────────────────────────────────────────────────
// Fixed days of the 40-day year. `affinity` limits which station types celebrate (null = all).
// Every festival carries a line the wire speaks and an optional priceTilt — each one must
// visibly or audibly change something, which is why every entry also names its surface.

export const FESTIVALS = Object.freeze([
  Object.freeze({
    id: 'founders_day', name: 'Founders\' Day', dayOfYear: 0,
    affinity: null,
    text: 'FOUNDERS\' DAY: the Concord reads the Charter aloud on every band. Dock fees waived in spirit if not in fact.',
    priceTilt: Object.freeze({ buy: 0.97, sell: 1.0 }),
    barLine: 'Founders\' Day — the first round is always a speech.',
  }),
  Object.freeze({
    id: 'drift_wake', name: 'Drift Wake', dayOfYear: 7,
    affinity: null,
    text: 'DRIFT WAKE: the miners\' day for the dead. Claims fly black bunting; the bars count names until last call.',
    priceTilt: Object.freeze({ buy: 1.0, sell: 1.04 }),   // memorial lots sell dear
    barLine: 'Drift Wake. Senna\'s roll gets read tonight — buy a drink, hear a name.',
  }),
  Object.freeze({
    id: 'ring_fair', name: 'Ring Fair', dayOfYear: 13,
    affinity: null,
    text: 'RING FAIR: open market on every ring in the sector. Sellers undercut each other on the hour.',
    priceTilt: Object.freeze({ buy: 0.92, sell: 1.08 }),  // the fair's signature — twice a market day
    barLine: 'Ring Fair — everyone\'s a broker today, including the barkeep.',
  }),
  Object.freeze({
    id: 'quiet_night', name: 'The Quiet Night', dayOfYear: 21,
    affinity: null,
    text: 'THE QUIET NIGHT: lights burn low on the smuggler berths. Nobody says what for. Nobody ever does.',
    priceTilt: Object.freeze({ buy: 1.0, sell: 1.0 }),
    barLine: 'Quiet Night. The bar is full and nobody is talking about it.',
  }),
  Object.freeze({
    id: 'forge_due', name: 'Forge Due', dayOfYear: 26,
    affinity: Object.freeze(['fab', 'foundry', 'refinery']),
    text: 'FORGE DUE: the foundries settle their quarter-books. Scrap and components move at account-close prices.',
    priceTilt: Object.freeze({ buy: 0.93, sell: 1.05 }),
    barLine: 'Forge Due — the yard crews drink on the settled books.',
  }),
  Object.freeze({
    id: 'pale_holiday', name: 'The Pale Holiday', dayOfYear: 33,
    affinity: null,
    text: 'THE PALE HOLIDAY: the Verge-Layer observance nobody scheduled and everyone keeps. Signals run strange.',
    priceTilt: Object.freeze({ buy: 1.0, sell: 1.0 }),
    barLine: 'Pale Holiday — the jukebox plays a song nobody loaded.',
  }),
  Object.freeze({
    id: 'tally_eve', name: 'Tally Eve', dayOfYear: 38,
    affinity: null,
    text: 'TALLY EVE: the year\'s books close tomorrow. Customs posts every fine it has been saving.',
    priceTilt: Object.freeze({ buy: 1.03, sell: 0.97 }),  // desks buy cheap while the ledgers balance
    barLine: 'Tally Eve — drink like the audit already happened.',
  }),
]);

const FESTIVAL_BY_DAY = new Map(FESTIVALS.map((f) => [f.dayOfYear, f]));

export function festivalForDayOfYear(dayOfYear) {
  return FESTIVAL_BY_DAY.get(((dayOfYear % CAL_YEAR_DAYS) + CAL_YEAR_DAYS) % CAL_YEAR_DAYS) || null;
}

/** The festival this berth observes today, honoring station-type affinity. Pure. */
export function festivalAt(stationId, simTime, stationTypeId = null) {
  const festival = festivalForDayOfYear(calendarDay(simTime) % CAL_YEAR_DAYS);
  if (!festival) return null;
  if (festival.affinity && stationTypeId && !festival.affinity.includes(stationTypeId)) return null;
  if (festival.affinity && !stationTypeId) return festival; // typeless callers see the day itself
  return festival;
}

// ── Solar-storm seasons ────────────────────────────────────────────────────────────────
// seasonalWeather.js owns the 7-day season draw; the calendar reads it so the wire, the bar,
// and the test all speak one vocabulary: a storm season is ion_storm or solar_wind.

export const STORM_KINDS = Object.freeze(['ion_storm', 'solar_wind']);

export function stormSeasonAt(sectorId, simTime) {
  const season = weatherSeasonAt(sectorId, simTime);
  const stormy = STORM_KINDS.includes(season.kind);
  return {
    season: season.season,
    kind: season.kind,
    stormy,
    endsInS: season.remainingS,
    label: season.kind === 'ion_storm' ? 'ion-storm season' : season.kind === 'solar_wind' ? 'solar-wind season' : season.kind === 'meteor_shower' ? 'meteor season' : 'clear season',
  };
}

// ── The whole clock face ───────────────────────────────────────────────────────────────

/** One pure read of everything the calendar says right now. */
export function calendarAt({ simTime = 0, sectorId = null, stationId = null, stationTypeId = null } = {}) {
  const day = calendarDay(simTime);
  return {
    simTime: Number(simTime) || 0,
    day,
    weekday: day % CAL_WEEK_DAYS,
    weekdayName: CALENDAR_WEEKDAY_NAMES[day % CAL_WEEK_DAYS],
    dayOfYear: day % CAL_YEAR_DAYS,
    year: Math.floor(day / CAL_YEAR_DAYS),
    dayFrac: (Math.max(0, Number(simTime) || 0) % CAL_DAY_S) / CAL_DAY_S,
    shift: stationId ? stationShiftAt(stationId, simTime) : null,
    rush: stationId ? rushHourAt(stationId, simTime) : null,
    barPressure: stationId ? barPressureAt(stationId, simTime) : 0,
    marketDay: stationId ? marketDayAt(stationId, simTime) : null,
    festival: festivalAt(stationId, simTime, stationTypeId),
    storm: sectorId ? stormSeasonAt(sectorId, simTime) : null,
  };
}

export default {
  CAL_DAY_S, CAL_WEEK_DAYS, CAL_YEAR_DAYS, CALENDAR_WEEKDAY_NAMES,
  STATION_SHIFTS, RUSH_BEFORE_S, RUSH_AFTER_S, STORM_KINDS, FESTIVALS,
  calendarDay, calendarAt, stationShiftAt, rushHourAt, barPressureAt,
  stationMarketWeekday, marketDayAt, marketDayMults, festivalForDayOfYear, festivalAt, stormSeasonAt,
};
